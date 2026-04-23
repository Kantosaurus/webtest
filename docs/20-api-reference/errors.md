# Errors

## Envelope

Every non-2xx response from the API conforms to:

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File exceeds 32 MB limit",
    "details": null
  }
}
```

- `code` — stable, machine-readable symbol. Safe to switch on in
  clients.
- `message` — human-readable, English, safe to surface in UI copy.
- `details` — optional and code-specific. May be absent.

The `X-Request-Id` response header is always present and can be passed to
support to retrieve the matching log line.

## Error codes

From `api/src/lib/errors.ts`:

| Code | HTTP | When it fires | Recoverable? |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Request body / content-type / params fail validation | Yes — fix the request |
| `UNAUTHORIZED` | 401 | *Unused in the current build* (reserved) | — |
| `FORBIDDEN` | 403 | *Unused in the current build* (reserved) | — |
| `NOT_FOUND` | 404 | Unknown scan id, unknown message id, evicted scan | Partial — scan may have expired |
| `CONFLICT` | 409 | *Unused externally*; VT's 409 is caught and recovered internally | — |
| `FILE_TOO_LARGE` | 413 | Content-Length exceeds cap, or streamed body exceeds cap mid-upload | Yes — send a smaller file |
| `RATE_LIMITED` | 429 | One of the rate-limit buckets denied the request | Yes — wait for the window |
| `SCAN_FAILED` | 502 | VT returned an unrecoverable error | Maybe — retry in a few seconds |
| `INTERNAL` | 500 | Any unhandled exception — full stack is logged server-side | Unknown — inspect logs |

`AppError` is the single class used for all expected failures; the
error-handler middleware at `api/src/middleware/error.ts:5-13` maps
`AppError` instances into the envelope and logs anything else at `error`
level before returning a generic `INTERNAL`.

## Surfacing in the UI

The client translates a subset of codes into user copy:

| Code | UI behaviour |
|---|---|
| `FILE_TOO_LARGE` | Inline error under the dropzone: *"That file is N MB. VirusTotal's free tier caps uploads at 32 MB — try a smaller one."* |
| `RATE_LIMITED` | Toast / inline error noting the specific bucket ("upload", "chat") |
| `SCAN_FAILED` | Scan page shows *"This scan couldn't complete. VirusTotal returned an error …"* with a link to start a new scan |
| `NOT_FOUND` (on scan page) | Empty state: *"Scan not found. It may have expired. Scans live only for the length of a session."* |
| `VALIDATION_FAILED` | Generic inline error near the relevant control |
| `INTERNAL` | Toast: *"Something went wrong."* Reference the `X-Request-Id` in the header if present |

## Troubleshooting server-side

- Every error is logged with `reqId`, `code`, and the original `err` by
  `api/src/middleware/error.ts`. `warn` level for `AppError`; `error`
  level for anything else.
- If a `VtHttpError` or `VtAlreadySubmittedError` appears in logs, it is
  the *reason* for a `SCAN_FAILED` envelope, not the envelope itself —
  the caller converts it into `Errors.scanFailed(...)`.
- Logs are emitted as JSON in production. Filter by `reqId` to find every
  line for a single request.
