import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/error.js';
import { buckets } from './middleware/rateLimits.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { health } from './routes/health.js';
import { metrics } from './routes/metrics.js';
import { scans } from './routes/scans.js';
import { scanEvents } from './routes/scanEvents.js';
import { messages } from './routes/messages.js';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ reqId: (req as express.Request).requestId }),
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use('/', health);
  app.use('/', metrics);
  app.use('/api/scans', buckets.global, scans);
  app.use('/api/scans', buckets.global, scanEvents);
  app.use('/api/scans', buckets.global, messages);
  app.use(errorHandler);
  return app;
}
