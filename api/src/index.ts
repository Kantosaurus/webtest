import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = buildApp();

app.listen(config.API_PORT, () => {
  logger.info({ port: config.API_PORT }, 'api listening');
});
