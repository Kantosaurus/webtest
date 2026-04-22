import express from 'express';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import { logger } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/error.js';
import { sessionMiddleware } from './lib/sessionStore.js';
import { health } from './routes/health.js';
import { auth } from './routes/auth.js';
import { scans } from './routes/scans.js';
import { scanEvents } from './routes/scanEvents.js';
import { messages } from './routes/messages.js';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(pinoHttp({ logger, customProps: (req) => ({ reqId: (req as express.Request).requestId }) }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware);
  app.use('/', health);
  app.use('/api/auth', auth);
  app.use('/api/scans', scans);
  app.use('/api/scans', scanEvents);
  app.use('/api/scans', messages);
  app.use(errorHandler);
  return app;
}
