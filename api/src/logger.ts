import pino from 'pino';
import { config, isProd } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.password_hash'],
    remove: true,
  },
});
