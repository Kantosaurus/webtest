import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { Errors } from '../lib/errors.js';
import { SseWriter } from '../lib/sse.js';
import { getScanForUser } from '../services/scans.js';
import {
  listMessagesForScan,
  insertMessage,
  deleteMessage,
} from '../services/messages.js';
import { buildGeminiPrompt, type ScanContext } from '../lib/promptBuilder.js';
import { createGeminiClient } from '../services/gemini.js';
import { logger } from '../logger.js';

export const messages = Router();

const contentSchema = z.object({ content: z.string().min(1).max(4_000) });

function scanToContext(scan: Awaited<ReturnType<typeof getScanForUser>>): ScanContext {
  if (!scan) throw Errors.notFound('Scan');
  const raw = scan.result as {
    attributes?: {
      stats?: ScanContext['stats'];
      results?: Record<
        string,
        { engine_name?: string; category?: string; result?: string | null }
      >;
    };
  } | null;
  const stats = raw?.attributes?.stats ?? {
    malicious: 0,
    suspicious: 0,
    undetected: 0,
    harmless: 0,
  };
  const results = raw?.attributes?.results ?? {};
  const topEngines = Object.values(results)
    .filter((r) => r.category === 'malicious' || r.category === 'suspicious')
    .map((r) => r.engine_name)
    .filter((x): x is string => !!x)
    .slice(0, 5);
  return {
    fileName: scan.fileName,
    fileSha256: scan.fileSha256,
    status: scan.status,
    stats,
    topEngines,
  };
}

const list: RequestHandler = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return next(Errors.validation('Bad id'));
    const scan = await getScanForUser(id, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    const msgs = await listMessagesForScan(scan.id);
    res.json(msgs);
  } catch (err) {
    next(err);
  }
};

const post: RequestHandler = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return next(Errors.validation('Bad id'));
    const scan = await getScanForUser(id, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    const parsed = contentSchema.safeParse(req.body);
    if (!parsed.success) return next(Errors.validation('Invalid message'));

    const userMsg = await insertMessage({
      scanId: scan.id,
      role: 'user',
      content: parsed.data.content,
    });

    const allPriorMessages = (await listMessagesForScan(scan.id))
      .filter((m) => m.id !== userMsg.id)
      .map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }));

    const prompt = buildGeminiPrompt({
      scan: scanToContext(scan),
      history: allPriorMessages,
      userMessage: parsed.data.content,
    });

    const sse = new SseWriter(res);
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const client = createGeminiClient(config.GEMINI_API_KEY);
    let full = '';
    try {
      for await (const token of client.stream(prompt, controller.signal)) {
        full += token;
        sse.event('token', { token });
      }
    } catch (err) {
      logger.warn({ err, scanId: scan.id }, 'gemini stream error');
      sse.event('error', { message: 'Model stream failed' });
      sse.close();
      return;
    }

    if (controller.signal.aborted) {
      sse.close();
      return;
    }

    const assistant = await insertMessage({
      scanId: scan.id,
      role: 'assistant',
      content: full,
    });
    sse.event('done', { msgId: assistant.id, fullText: full });
    sse.close();
  } catch (err) {
    next(err);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    const scanId = Number(req.params.id);
    const msgId = Number(req.params.msgId);
    if (!Number.isInteger(scanId) || scanId <= 0 || !Number.isInteger(msgId) || msgId <= 0) {
      return next(Errors.validation('Bad id'));
    }
    const scan = await getScanForUser(scanId, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    const ok = await deleteMessage(msgId, scan.id);
    if (!ok) return next(Errors.notFound('Message'));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

messages.get('/:id/messages', requireAuth, list);
messages.post('/:id/messages', requireAuth, post);
messages.delete('/:id/messages/:msgId', requireAuth, remove);
