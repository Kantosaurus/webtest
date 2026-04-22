import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const isTest = config.NODE_ENV === 'test';

const jsonError = (code: string, message: string) => ({
  error: { code, message },
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonError('RATE_LIMITED', 'Too many requests'),
});
