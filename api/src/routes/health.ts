import { Router } from 'express';
import { ping } from '../db/pool.js';
import { logger } from '../logger.js';

export const health = Router();

health.get('/healthz', async (_req, res) => {
  try {
    await ping();
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'healthcheck failed');
    res.status(503).json({ ok: false });
  }
});
