import express from 'express';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import { logger } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/error.js';
import { health } from './routes/health.js';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp({ logger, customProps: (req) => ({ reqId: (req as express.Request).requestId }) }));
  app.use(cookieParser());
  app.use('/', health);
  app.use(errorHandler);
  return app;
}
