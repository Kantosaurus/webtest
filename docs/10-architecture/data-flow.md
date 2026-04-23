# Data Flow

Sequence diagrams and annotations for the two user-visible flows: the upload
and the chat.

---

## Flow 1 — Upload and scan to verdict

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant Caddy as caddy
    participant W as web (Next.js)
    participant A as api (Express)
    participant VT as VirusTotal

    B->>Caddy: POST /api/scans (multipart, file)
    Caddy->>W: reverse_proxy
    W->>A: rewrite /api/scans
    A->>A: Content-Length pre-check (≤32MB+1KB)
    A->>A: req.setTimeout(60s)
    A->>A: busboy parses part
    A->>A: file ► sha256 ► byteCounter ► PassThrough

    A->>VT: POST /files (streamed body)
    alt VT 200
      VT-->>A: { data: { id } }
      A->>A: createScan(scan)
      A-->>B: 202 { scanId, status: "queued" }
    else VT 409 Already being scanned
      VT-->>A: 409 { error }
      A->>VT: GET /files/{sha256}
      alt hash hit with terminal analysis
        VT-->>A: { attributes: { last_analysis_* } }
        A->>A: createScan + updateScanStatus(completed, cached)
        A-->>B: 202 { scanId, status: "completed" }
      else hash miss
        VT-->>A: 404
        A-->>B: 502 SCAN_FAILED
      end
    else VT 5xx / 429
      A->>A: withRetry (3, jittered)
    end

    B->>A: GET /api/scans/:id/events (EventSource)
    alt scan already terminal
      A-->>B: event:result / event:error
      A-->>B: (stream closes)
    else poll loop
      loop every 2s, up to 150s
        A->>VT: GET /analyses/:vtAnalysisId
        alt analysis still running
          VT-->>A: status: queued | running
          A-->>B: event:status { state }
        else terminal
          VT-->>A: status: completed
          A->>A: updateScanStatus(completed, raw)
          A-->>B: event:result { status, stats, results }
          A-->>B: (stream closes)
        end
      end
      opt timed out (no terminal in 150s)
        A->>A: updateScanStatus(failed, {reason: "timeout"})
        A-->>B: event:error
      end
    end
```

### Notes per step

- **Pre-check (step 3).** Reject before `busboy` allocates. If the content
  length exceeds the cap by more than 1 KB, the request is drained briefly so
  the 413 response can reach the client before the socket is closed.
- **60 s socket timeout (step 4).** Protects against slow-drip uploads that
  trickle bytes indefinitely to stay under the size cap. If no progress
  occurs for 60 s, the request is destroyed.
- **Stream topology (step 6).** `req → busboy → file stream → sha256 → counter
  → PassThrough → undici fetch body`. The hash is finalised only after the
  counter emits `end`, guaranteeing we hash every byte that reached VT and
  nothing else.
- **VT retry (step 15).** `withRetry` retries on HTTP 429 and 5xx with a
  jittered exponential backoff starting at 500 ms. 409 is excluded — it is a
  *signal*, handled explicitly in the caller.
- **Cached-terminal short-circuit (step 10).** If VT's hash lookup returns an
  analysis that is already terminal (e.g. the file has been seen recently),
  the scan is stored as `completed` immediately and the SSE poll loop does
  not run.
- **Client-side poll behaviour.** The browser's `useQuery` also polls
  `GET /api/scans/:id` every 3 s while the status is non-terminal
  (`web/app/scans/[id]/page.tsx:19-22`), providing a fallback path for the
  UI should the SSE stream drop.
- **Hard cap at 150 s.** If VT has not reached a terminal state in that
  window the scan is marked `failed` and a final `event: error` is emitted.
  VT typically completes in 10–30 s; the 150 s cap exists for the long tail.

---

## Flow 2 — Chat turn with streaming explanation

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant A as api (Express)
    participant S as services/messages
    participant PB as lib/promptBuilder
    participant G as Gemini API

    B->>A: POST /api/scans/:id/messages { content }
    A->>A: zod.parse (1 ≤ len ≤ 4000)
    A->>S: appendMessage(scanId, role=user, content)
    A->>A: scanToContext(scan) → { stats, topEngines, ... }
    A->>PB: buildGeminiPrompt(scan, history, userMessage)
    PB-->>A: { systemInstruction, contents[] }

    A-->>B: 200 OK (text/event-stream, flushHeaders)

    A->>G: generateContentStream(prompt)
    loop chunks
      G-->>A: chunk.text()
      A-->>B: event: token  data: { token }
    end

    alt completed
      A->>S: appendMessage(scanId, role=assistant, fullText)
      A-->>B: event: done  data: { msgId, fullText }
      A-->>B: (stream closes)
    else error
      A-->>B: event: error  data: { message }
      A-->>B: (stream closes)
    else client aborted
      B-->>A: req.on('close')
      A->>G: controller.abort()
      A-->>B: (stream closes — no event: done)
    end
```

### Notes per step

- **Prompt shape.** The system instruction includes the file's name, SHA-256,
  status, aggregated detection counts, and up to 5 detecting engine names.
  See `api/src/lib/promptBuilder.ts:26-37`.
- **History encoding.** Prior turns are encoded as Gemini `{ role, parts }`
  pairs — user turns map to `role: "user"`, assistant turns to `role:
  "model"`. System message entries (if any) are filtered out before the
  prompt is built.
- **First-token telemetry.** The first yielded token triggers
  `webtest_gemini_first_token_ms.observe(now - streamStart)`. This is the
  most useful latency signal because the full stream length is variable
  based on model output.
- **Abort semantics.** `req.on('close', () => controller.abort())` wires the
  client disconnect to `AbortController.abort()`, which is observed by the
  `for await (...)` loop at the top of each iteration. No `event: done` is
  emitted on abort.
- **Chat history cap.** `appendMessage` shifts the oldest entries once the
  conversation exceeds 200 messages, so the prompt does not grow without
  bound. Note: this is a simple hard cap, not summarisation — see the
  known-limitations section of the top-level README.

---

## Flow 3 — Rate-limit rejection

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as api
    participant M as services/metrics

    B->>A: POST /api/scans (6th in 60s window)
    A->>A: buckets.upload.handler triggers
    A->>M: rateLimitRejectedTotal.inc({bucket:"upload"})
    A-->>B: 429 { error: { code: "RATE_LIMITED", message: "...upload..." } }
```

Headers on a 429 response include the draft-7 RateLimit family
(`RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`),
emitted by `express-rate-limit`. Legacy headers are off.

---

## Flow 4 — Scan eviction

```mermaid
flowchart LR
    Timer["setInterval every 5 min"] --> Sweep["sweepExpired(now)"]
    Sweep -->|updated > 1h ago| Evict["evict(id)"]
    Evict --> DropScan["scans.delete(id)"]
    Evict --> DropConv["dropConversation(id)"]

    Create["createScan()"] --> IfFull["evictIfFull()"]
    IfFull -->|size ≥ 500| EvictOldest["evict(oldest)"]
```

The sweep runs with `.unref()` so the node process can exit cleanly in dev
or during container shutdown; see [System Overview](./system-overview.md)
for the state-model rationale.
