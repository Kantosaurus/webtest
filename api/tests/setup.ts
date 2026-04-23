// Vitest setup. Runs before each test file is loaded so env vars are in
// place before config.ts parses process.env. Real keys are never required
// for tests — outbound calls are intercepted by MSW or a stub factory.
process.env.NODE_ENV ??= 'test';
process.env.VT_API_KEY ??= 'test-vt-key';
process.env.GEMINI_API_KEY ??= 'test-gemini-key';
