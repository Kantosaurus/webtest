import type { RequestHandler } from 'express';
import { Errors } from '../lib/errors.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) return next(Errors.unauthorized());
  next();
};
