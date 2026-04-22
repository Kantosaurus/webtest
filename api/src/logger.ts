import pino from 'pino';
import { createRequire } from 'node:module';
import { config, isProd } from './config.js';

// Detect whether `pino-pretty` is available. It is a devDependency, so the
// production runtime image (built with `npm ci --omit=dev`) does not include
// it. Falling back to plain JSON logging in that case avoids a hard crash if
// someone runs the prod image with NODE_ENV=development.
const require = createRequire(import.meta.url);
function isPinoPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const usePretty = !isProd && isPinoPrettyAvailable();

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: usePretty ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.password_hash'],
    remove: true,
  },
});
