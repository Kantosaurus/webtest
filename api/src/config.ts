import { z } from 'zod';
import 'dotenv/config';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  VT_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  // Pin to a specific GA model by default so behavior is reproducible across
  // deploys. See https://ai.google.dev/gemini-api/docs/models for the live
  // list; if the default gets deprecated, override this without rebuilding.
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  PUBLIC_HOSTNAME: z.string().default('localhost'),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export const isProd = config.NODE_ENV === 'production';
