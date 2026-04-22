import { Router, type RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { Errors } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const auth = Router();

const credsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const register: RequestHandler = async (req, res, next) => {
  try {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(Errors.validation('Invalid credentials', parsed.error.flatten()));
    }
    const { email, password } = parsed.data;
    const hash = await bcrypt.hash(password, 12);
    try {
      const { rows } = await pool.query<{ id: number; email: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, hash],
      );
      const user = rows[0]!;
      req.session.userId = user.id;
      req.session.email = user.email;
      res.status(201).json({ id: user.id, email: user.email });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        return next(Errors.conflict('Email already registered'));
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

const login: RequestHandler = async (req, res, next) => {
  try {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return next(Errors.validation('Invalid credentials'));
    const { email, password } = parsed.data;
    const { rows } = await pool.query<{ id: number; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = rows[0];
    if (!row) return next(Errors.unauthorized());
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return next(Errors.unauthorized());
    req.session.userId = row.id;
    req.session.email = row.email;
    res.status(200).json({ id: row.id, email: row.email });
  } catch (err) {
    next(err);
  }
};

const logout: RequestHandler = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('wt.sid');
    res.status(204).end();
  });
};

const me: RequestHandler = (req, res) => {
  res.status(200).json({ id: req.session.userId, email: req.session.email });
};

auth.post('/register', register);
auth.post('/login', login);
auth.post('/logout', logout);
auth.get('/me', requireAuth, me);
