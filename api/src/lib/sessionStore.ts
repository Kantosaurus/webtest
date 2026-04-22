import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../db/pool.js';
import { config } from '../config.js';

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    // 'auto' (rather than a hard-coded bool from NODE_ENV) means: include
    // the Secure flag only when the request actually came in over TLS.
    // With `trust proxy` set, this respects X-Forwarded-Proto from Caddy.
    // Importantly, `secure: true` over plain HTTP causes express-session
    // to silently drop the Set-Cookie header entirely — that's the trap
    // we hit when the prod runtime image served http://localhost.
    secure: 'auto',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  name: 'wt.sid',
});

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    email?: string;
  }
}
