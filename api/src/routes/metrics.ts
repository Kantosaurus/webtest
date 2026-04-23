import { Router } from 'express';
import { registry } from '../services/metrics.js';

export const metrics = Router();

metrics.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
