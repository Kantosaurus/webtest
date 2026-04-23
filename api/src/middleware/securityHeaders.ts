import type { RequestHandler } from 'express';
import { SECURITY_HEADERS, HSTS_HEADER } from '../config/securityHeaders.js';

const isProd = process.env.NODE_ENV === 'production';

export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (isProd) res.setHeader(HSTS_HEADER.name, HSTS_HEADER.value);
  next();
};
