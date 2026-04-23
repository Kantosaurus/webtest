import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const uploadTotal = new Counter({
  name: 'webtest_upload_total',
  help: 'File upload attempts',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const vtRequestTotal = new Counter({
  name: 'webtest_vt_request_total',
  help: 'VirusTotal API requests',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const chatMessagesTotal = new Counter({
  name: 'webtest_chat_messages_total',
  help: 'Chat messages sent',
  registers: [registry],
});

export const rateLimitRejectedTotal = new Counter({
  name: 'webtest_rate_limit_rejected_total',
  help: 'Requests rejected by rate limiter',
  labelNames: ['bucket'] as const,
  registers: [registry],
});

export const uploadDuration = new Histogram({
  name: 'webtest_upload_duration_seconds',
  help: 'Upload request duration',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const geminiFirstTokenMs = new Histogram({
  name: 'webtest_gemini_first_token_ms',
  help: 'Latency from chat POST to first Gemini token',
  buckets: [100, 250, 500, 1000, 2000, 5000, 10000],
  registers: [registry],
});
