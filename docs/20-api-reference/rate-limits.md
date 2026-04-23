# Rate Limits

The API uses [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit)
with four buckets. Buckets are layered: a single request can be counted by
more than one bucket, and must pass all of them.

## Buckets

| Bucket | Window | Limit | Applies to |
|---|---|---|---|
| `global` | 60 s | 60 req | All `/api/scans*` paths |
| `upload` | 60 s | 5 req | `POST /api/scans` only |
| `uploadHourly` | 1 h | 10 req | `POST /api/scans` only |
| `chat` | 60 s | 20 req | `POST /api/scans/:id/messages` |

Routing is composed explicitly at `api/src/app.ts:29-31`:

```ts
app.use('/api/scans', buckets.global, scans);
app.use('/api/scans', buckets.global, scanEvents);
app.use('/api/scans', buckets.global, messages);
```

with additional per-route buckets applied inside each router — `upload`
and `uploadHourly` on `POST /`, `chat` on `POST /:id/messages`.

## Headers

When a request succeeds, the rate-limit middleware attaches the draft-7
headers to the response:

```
RateLimit-Policy: 5;w=60
RateLimit-Limit: 5
RateLimit-Remaining: 3
RateLimit-Reset: 42
```

The values reflect the *most constraining* bucket that matched the
request. Legacy `X-RateLimit-*` headers are disabled.

## Rejection

On rejection, the middleware:

1. Increments `webtest_rate_limit_rejected_total{bucket=<name>}`.
2. Returns `429 RATE_LIMITED` with the standard error envelope:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded for upload"
  }
}
```

The offending bucket is named in the message, which is a useful signal
both for UI surfacing and for grep'ing logs. Per bucket, the breakdown is
also visible in `/metrics`.

## Test mode

Under `NODE_ENV=test`, each limit is multiplied by 1,000:

```ts
const relax = (max: number): number => (isTest ? Math.max(max * 1000, 10_000) : max);
```

This keeps the integration test suite from tripping limits that are
tuned for production. A dedicated `rateLimits.test.ts` file explicitly
exercises the limiter logic with a bucket created via
`__createBucketForTests(...)`.

## IP keying & proxy trust

`app.set('trust proxy', 1)` at `api/src/app.ts:17` instructs Express to
trust the leftmost entry in `X-Forwarded-For` (i.e. Caddy's value).
Without this, all rate-limit keys would collapse to the Caddy container's
IP.

Behind a further proxy (for example a CDN), raise the trust value to
match the number of hops. The CI pipeline exercises the limits with
Playwright hitting the stack directly (no CDN), so the production
configuration is the one in force.

## Practical tuning notes

- **Upload bucket is the tight one.** 5/min matches the VirusTotal free
  tier. Concurrent uploads across multiple tabs will trip it first.
- **Chat bucket is generous.** 20/min is comfortable for a single user
  but will reject abusive loops.
- **Global bucket catches enumeration.** A misbehaving script scraping
  scan ids will hit `global` before any per-endpoint bucket.

## Client guidance

When a 429 is received:

- Read `RateLimit-Reset` to learn when the window resets (seconds).
- The `upload` bucket is at a different time granularity than
  `uploadHourly`; a 429 on upload may still pass on chat.
- Back off before retrying. The client does **not** implement
  auto-retry on 429 — by design, since it's a user-input-driven action.
