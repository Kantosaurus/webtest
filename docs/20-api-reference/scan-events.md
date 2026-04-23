# Scan Events (SSE)

Server-Sent Events endpoint for scan-progress updates.

```
GET /api/scans/:id/events
Accept: text/event-stream        (optional — the response is always SSE)
```

The stream emits frames while the API polls VirusTotal on the client's
behalf, and closes as soon as the scan reaches a terminal state (or after
the 150-second safety ceiling).

## Wire contract

Each frame follows the SSE convention:

```
event: <name>\n
data: <json-payload>\n
\n
```

Events for this endpoint:

| Event | `data` shape | Meaning |
|---|---|---|
| `status` | `{ "state": "queued" \| "running" }` | Non-terminal VT state on the most recent poll |
| `result` | `{ "status": "completed", "stats": {...}, "results": {...} }` | Scan complete; stream will close after this frame |
| `error` | `{ "message": "..." }` | Transient VT error *or* overall timeout *or* (if the scan was already failed on entry) a final notification |

After an `error` with the message `"Scan timed out"`, or any `result`, the
server closes the stream. Clients must not expect further frames.

## Short-circuit on terminal-on-entry

If the scan is *already* terminal when the client connects:

- `completed` scan → single `event: result` with `{ status, result }`, then close.
- `failed` scan → single `event: error` with `{ status, result }`, then close.

See `api/src/routes/scanEvents.ts:22-29`.

## Poll cadence

- **Interval:** 2 s between polls to VirusTotal.
- **Ceiling:** 150 s. If no terminal state is reached, the scan is marked
  `failed` with reason `"timeout"` and a final `event: error` is emitted.
- **Client disconnect:** detected via `req.on('close', ...)`; the poll
  loop exits immediately and the stream is closed.

## Example — browser

```ts
const es = new EventSource(`/api/scans/${id}/events`, { withCredentials: true });
es.addEventListener('status', (e) => console.log('status:', JSON.parse(e.data).state));
es.addEventListener('result', (e) => {
  const payload = JSON.parse(e.data);
  console.log('result:', payload.stats);
  es.close();
});
es.addEventListener('error', () => {
  // Connection ended (normal close or error)
  es.close();
});
```

The in-tree consumer is `web/components/upload/ScanProgress.tsx:21-46`.

## Example — curl

```bash
curl -sN -H "Accept: text/event-stream" \
  http://localhost:4000/api/scans/$SCAN_ID/events
```

The `-N` flag disables curl's output buffering so frames appear as they
arrive.

## Error responses (not SSE)

If the scan id is unknown, the server responds with a standard error
envelope *before* any SSE headers are sent:

```
HTTP/1.1 404 Not Found
Content-Type: application/json
X-Request-Id: ...

{ "error": { "code": "NOT_FOUND", "message": "Scan not found" } }
```

The response may be up to 150 KB over the life of a scan (one status
frame every 2 s, plus a single result frame). CPU and memory for an
idle-but-connected client are negligible.
