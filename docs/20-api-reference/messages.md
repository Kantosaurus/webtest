# Messages (Chat)

Endpoints for the per-scan assistant conversation. The `POST` endpoint
streams the assistant reply over Server-Sent Events.

---

## `GET /api/scans/:id/messages`

List all non-system messages in the conversation.

### Response — 200 OK

```json
[
  {
    "id": "a76...",
    "scanId": "2b1e...",
    "role": "user",
    "content": "What does a Magecart skimmer actually do?",
    "createdAt": "2026-04-23T12:35:20.112Z"
  },
  {
    "id": "b12...",
    "scanId": "2b1e...",
    "role": "assistant",
    "content": "A Magecart skimmer is ...",
    "createdAt": "2026-04-23T12:35:25.904Z"
  }
]
```

Roles are limited to `user` and `assistant` (any `system` entries are
filtered out by `services/messages.ts:listMessages`).

### Error responses

- `404 NOT_FOUND` — unknown scan id.

---

## `POST /api/scans/:id/messages`

Send a user message and receive a streamed assistant reply.

### Request

```
POST /api/scans/:id/messages HTTP/1.1
Content-Type: application/json

{ "content": "What does a Magecart skimmer actually do?" }
```

- `content` is validated with zod: `string`, `min(1)`, `max(4000)`.
- Longer messages return `400 VALIDATION_FAILED`.

### Response — 200 OK (SSE)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no

event: token
data: {"token":"A"}

event: token
data: {"token":" Magecart"}

event: token
data: {"token":" skimmer"}

... (many token frames) ...

event: done
data: {"msgId":"b12...","fullText":"A Magecart skimmer ..."}
```

### Events

| Event | `data` shape | Meaning |
|---|---|---|
| `token` | `{ "token": "<string>" }` | One model chunk. Concatenation of all `token` payloads equals `fullText`. |
| `done` | `{ "msgId": "<uuid>", "fullText": "<string>" }` | Final event. The assistant message has been appended to the conversation. |
| `error` | `{ "message": "<string>" }` | The stream failed mid-way. No `done` will follow. |

### Abort semantics

Closing the response stream on the client side (for example, calling
`AbortController.abort()` on the `fetch`) cancels the Gemini generation.
The server observes `req.on('close')`, calls `controller.abort()` on the
Gemini `AbortController`, and the `for await (...)` loop terminates
without emitting `done`. The partial assistant reply is *not* persisted.

The in-tree consumer is `web/components/chat/useChatStream.ts:19-80`. It
builds the full response by appending every `token` to a local `draft`
and finalises on `done`.

### Error responses (non-SSE)

- `400 VALIDATION_FAILED` — missing or invalid `content`.
- `404 NOT_FOUND` — unknown scan id.
- `429 RATE_LIMITED` — 20 req/min chat bucket exceeded.

These are standard JSON error envelopes, emitted before any SSE headers.

### Prompt shape (server-side)

The prompt sent to Gemini is built by `api/src/lib/promptBuilder.ts`:

```ts
{
  systemInstruction: [
    'You help explain VirusTotal scan results to non-technical users.',
    "Stay on-topic: this file's scan, what it means, and practical advice.",
    'If asked something unrelated, politely redirect the user back to the scan.',
    '',
    'File context:',
    `- Name: ${scan.fileName}`,
    `- SHA-256: ${scan.fileSha256}`,
    `- Status: ${scan.status}`,
    `- Detection counts — malicious: ..., suspicious: ..., undetected: ..., harmless: ...`,
    `- Top detecting engines: <up to 5>`,
  ].join('\n'),
  contents: [
    ...history.map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] })),
    { role: 'user', parts: [{ text: userMessage }] },
  ],
}
```

- History grows with each turn but is capped per conversation
  (200 messages in the store).
- The model is controlled by `GEMINI_MODEL` (default `gemini-2.5-flash`).

### Example — curl

```bash
curl -sN -X POST http://localhost:4000/api/scans/$SCAN_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"What engines flagged this and what does that mean?"}'
```

Again, `-N` disables curl buffering so tokens print as they arrive.

---

## `DELETE /api/scans/:id/messages/:msgId`

Remove a single message from the conversation.

### Response

- `204 No Content` on success.
- `404 NOT_FOUND` — unknown scan id or message id.

Used by the client when "Retry" is clicked: the last user message is
deleted, then a new `POST /messages` is issued with the same content to
re-run the assistant.

See `web/components/chat/ChatPanel.tsx:61-74`.
