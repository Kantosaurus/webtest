import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

// Express's Request type lives in `express-serve-static-core`; augmenting
// the module directly is the lint-clean alternative to a `namespace Express`
// block and produces the identical type contract for `req.requestId`.
declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.requestId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
