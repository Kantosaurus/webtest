import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { Errors } from '../lib/errors.js';
import { SseWriter } from '../lib/sse.js';
import { getScan } from '../services/scans.js';
import { listMessages, appendMessage, removeMessage } from '../services/messages.js';
import { buildGeminiPrompt, type ScanContext } from '../lib/promptBuilder.js';
import { resolveGeminiFactory } from '../services/gemini.js';
import { logger } from '../logger.js';
import { buckets } from '../middleware/rateLimits.js';
import { chatMessagesTotal, geminiFirstTokenMs } from '../services/metrics.js';

export const messages = Router();

const contentSchema = z.object({ content: z.string().min(1).max(4_000) });

function scanToContext(scan: ReturnType<typeof getScan>): ScanContext {
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

const list: RequestHandler = (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(Errors.notFound('Scan'));
  const scan = getScan(id);
  if (!scan) return next(Errors.notFound('Scan'));
  res.json(listMessages(scan.id));
};

const post: RequestHandler = async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(Errors.notFound('Scan'));
  const scan = getScan(id);
  if (!scan) return next(Errors.notFound('Scan'));
  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) return next(Errors.validation('Invalid message'));

  const userMsg = appendMessage({ scanId: scan.id, role: 'user', content: parsed.data.content });
  chatMessagesTotal.inc();
  const history = listMessages(scan.id)
    .filter((m) => m.id !== userMsg.id)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

  const prompt = buildGeminiPrompt({
    scan: scanToContext(scan),
    history,
    userMessage: parsed.data.content,
  });

  const sse = new SseWriter(res);
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  const client = resolveGeminiFactory()({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
  });
  let full = '';
  const streamStart = Date.now();
  let firstTokenSeen = false;
  try {
    for await (const token of client.stream(prompt, controller.signal)) {
      if (!firstTokenSeen) {
        firstTokenSeen = true;
        geminiFirstTokenMs.observe(Date.now() - streamStart);
      }
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

  const assistant = appendMessage({ scanId: scan.id, role: 'assistant', content: full });
  sse.event('done', { msgId: assistant.id, fullText: full });
  sse.close();
};

const remove: RequestHandler = (req, res, next) => {
  const id = req.params.id;
  const msgId = req.params.msgId;
  if (!id || !msgId) return next(Errors.notFound('Scan'));
  const scan = getScan(id);
  if (!scan) return next(Errors.notFound('Scan'));
  const ok = removeMessage(msgId, scan.id);
  if (!ok) return next(Errors.notFound('Message'));
  res.status(204).end();
};

messages.get('/:id/messages', list);
messages.post('/:id/messages', buckets.chat, post);
messages.delete('/:id/messages/:msgId', remove);
