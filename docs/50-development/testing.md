# Testing Strategy

The project runs four complementary test suites, each with a distinct
job. Skipping any one leaves a gap that the others don't cover.

```
Unit → Integration → End-to-end → Smoke
 │          │              │           │
 isolated  single-       whole-stack   running-system
 module    process      through        invariants
           HTTP         the browser
```

## Summary

| Suite | Runner | Scope | Trigger |
|---|---|---|---|
| API unit | Vitest | Pure functions / transforms / client-with-mocked-fetch | CI, every PR |
| API integration | Vitest + supertest | Full Express app, real handlers, mocked VT via `msw` | CI, every PR |
| Web unit | Vitest + Testing Library | Individual components (`MarkdownRenderer`) | CI, every PR |
| Web e2e | Playwright | Dev compose stack, real VT+Gemini | CI pushes + smoke runs |
| System smoke | bash + curl | Post-deploy invariants | manual / deploy gate |

---

## API unit tests

Located in `api/tests/unit/`. Run with `npm test` or `npm run test:unit`.

### Covered

- **`hash.test.ts`** — sha256 transform produces the expected digest;
  byte counter rejects mid-stream at exactly `max + 1`.
- **`virustotal.test.ts`** — uses `msw` to stub `fetch` responses.
  Covers: happy path; 409 → `VtAlreadySubmittedError`; 429 retries then
  succeeds; `getFileByHash` 404 returns null; `getAnalysis` normalises
  status strings.
- **`sse.test.ts`** — frame format, header setting, close semantics.
- **`promptBuilder.test.ts`** — system instruction content, role
  mapping for history turns.
- **`retry.test.ts`** — `withRetry` attempts, `shouldRetry` short-circuits,
  backoff delays.
- **`eviction.test.ts`** — scan TTL sweep (with `vi.setSystemTime`)
  and LRU cap; asserts eviction cascades to the conversation store.
- **`rateLimits.test.ts`** — bucket counter and header emission using
  `__createBucketForTests`.
- **`securityHeaders.test.ts`** — all headers set as expected; HSTS
  only in production.

### Principles

- No network. Mocks only.
- No global state leaks between tests — every test that touches a
  service calls its `__resetForTests()` helper.
- Timers and dates are stubbed via `vi.setSystemTime` / `vi.useFakeTimers`
  when relevant.

---

## API integration tests

Located in `api/tests/integration/`. Also Vitest; drives the full
Express app via `supertest`.

### Covered

- **`upload.test.ts`** — multipart upload with a buffered fixture,
  through the real routing pipeline, asserting a 202 with the expected
  envelope; edge cases for 413 and 400.
- **`scanEvents.test.ts`** — opens the SSE stream against a test
  server, reads frames, asserts `result` closes the stream.
- **`messages.test.ts`** — POST a chat turn with a stub Gemini factory
  swapped in via `__setGeminiFactoryForTests`, confirm token + done
  framing.
- **`rateLimits.test.ts`** — drives more than the limit on each
  endpoint; asserts 429 with the correct bucket in the message.
- **`metrics.test.ts`** — hits real routes, scrapes `/metrics`,
  asserts the counters move.
- **`securityHeaders.test.ts`** — end-to-end header assertion on a
  real handler.

### Principles

- `NODE_ENV=test` — relaxes rate-limit math, skips the background
  sweep interval.
- VT is fully stubbed via `msw.setupServer` inside `tests/setup.ts`.
  No integration test makes a real VT or Gemini call.
- Test execution is serial enough that metrics counters are
  deterministic; tests that care explicitly reset the registry.

---

## Web unit tests

`web/tests/unit/`. Vitest + `@testing-library/react`.

### Covered

- **`MarkdownRenderer.test.tsx`** — gfm, code-block rendering with
  highlight.js, inline code, links, emphasis.

### Not covered (intentionally)

Most frontend surfaces are better asserted by the e2e suite because
they depend on the SSE wire contract with the API. Shadcn primitives
are not re-tested.

---

## Web e2e tests

`web/tests/e2e/smoke.spec.ts`. Playwright against the dev compose
stack (real API, real VT, real Gemini).

### Covered

- **Golden upload path** — upload a fixture, wait for the verdict,
  assert stats are present.
- **Chat reload persistence** — after receiving a streamed reply,
  reload the page; the reply is still there.

### Running locally

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
cd web
E2E_BASE_URL=http://localhost:3000 npx playwright test
```

### Running in CI

The `e2e` job in `ci.yml` materialises `.env` from secrets, boots the
compose stack, polls for health, and runs the spec. If secrets are
missing (fork PRs), the job emits a warning and skips. Full failure
logs and a Playwright report are uploaded on failure.

### Failure artifacts

- `web/playwright-report/` — HTML report with traces, screenshots,
  and videos.
- `web/test-results/` — per-test artifacts including traces.

## System smoke

`scripts/smoke.sh`. Post-deploy sanity check — see
[Observability → Smoke check](../40-operations/observability.md#smoke-check).
Asserts external invariants the application should hold in production:

- `/healthz` is reachable and returns the expected JSON.
- Security headers are present on HTML responses.
- Oversized uploads are rejected at the edge.
- `/metrics` is not publicly routed.

## Coverage gate

`npm run test:cov` enforces Vitest coverage thresholds in `api/`.
Configured in `vitest.config.ts`. The CI job runs this as a distinct
step after the base test run so it's visible which one failed.

Web coverage is not gated today — the e2e suite functions as
integration coverage for the UI.

## Test-only extension points

The API exposes two deliberate test-only seams:

1. **`__setGeminiFactoryForTests(factory | null)`** in
   `services/gemini.ts`. Swap in a stub factory that yields a
   deterministic token stream.
2. **`__createBucketForTests({ windowMs, max, name })`** in
   `middleware/rateLimits.ts`. Create a bucket with test-friendly
   constants, bypassing the `isTest` multiplier.

Both are underscore-prefixed, never exported through any route, and
are called out as test-only in JSDoc comments.

## Adding a test

- **New route?** Integration test at minimum. Unit-test any pure
  helpers it depends on first.
- **New edge case in an existing route?** Prefer integration —
  supertest makes request construction obvious.
- **New client component?** If it involves SSE or server state, add a
  Playwright scenario. If it's pure rendering (like the markdown
  renderer), a Vitest + Testing Library test is faster.

## Philosophy

- Mocks are for expensive or external things (VT, Gemini, the
  filesystem). Don't mock your own code.
- Reset global state explicitly — no "first test runs alone" tricks.
- If a fix adds a test, the test should fail against the unfixed
  code. The PR should demonstrate the regression.
