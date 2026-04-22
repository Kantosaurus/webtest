import { Router, type RequestHandler } from 'express';
import { config } from '../config.js';
import { Errors } from '../lib/errors.js';
import { SseWriter } from '../lib/sse.js';
import { getScan, updateScanStatus } from '../services/scans.js';
import { getAnalysis } from '../services/virustotal.js';
import { logger } from '../logger.js';

export const scanEvents = Router();

const POLL_MS = 2_000;
const MAX_MS = 150_000;

const events: RequestHandler = async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(Errors.notFound('Scan'));
  const scan = getScan(id);
  if (!scan) return next(Errors.notFound('Scan'));

  const sse = new SseWriter(res);

  if (scan.status === 'completed' || scan.status === 'failed') {
    sse.event(scan.status === 'completed' ? 'result' : 'error', {
      status: scan.status,
      result: scan.result,
    });
    sse.close();
    return;
  }

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  const start = Date.now();
  sse.event('status', { state: scan.status });

  while (!aborted && Date.now() - start < MAX_MS) {
    try {
      const a = await getAnalysis({
        apiKey: config.VT_API_KEY,
        analysisId: scan.vtAnalysisId,
      });
      if (a.status === 'completed') {
        updateScanStatus(scan.id, 'completed', a.raw);
        sse.event('result', { status: 'completed', stats: a.stats, results: a.results });
        sse.close();
        return;
      }
      sse.event('status', { state: a.status });
    } catch (err) {
      logger.warn({ err, scanId: scan.id }, 'VT poll error');
      sse.event('error', { message: 'Temporary error polling VirusTotal; retrying' });
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if (!aborted) {
    updateScanStatus(scan.id, 'failed', { reason: 'timeout' });
    sse.event('error', { message: 'Scan timed out' });
  }
  sse.close();
};

scanEvents.get('/:id/events', events);
