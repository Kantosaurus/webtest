# Scans

Endpoints for creating and reading scans. For the SSE status stream, see
[Scan Events](./scan-events.md).

---

## `POST /api/scans`

Upload a file (≤ 32 MB) and start a VirusTotal scan.

### Request

```
POST /api/scans HTTP/1.1
Content-Type: multipart/form-data; boundary=...
Content-Length: <size in bytes>

--boundary
Content-Disposition: form-data; name="file"; filename="sample.exe"
Content-Type: application/octet-stream

<binary bytes>
--boundary--
```

- **Field.** Exactly one file field. Additional form fields are ignored.
- **Filename.** Falls back to `upload.bin` if missing.
- **Size.** Hard-capped at 32 MB. The cap is enforced at four layers:
  1. The browser-side validation in `UploadDropzone.tsx:84-89`.
  2. Next.js's `middlewareClientMaxBodySize: '32mb'` in
     `web/next.config.mjs:16-17`.
  3. The API's `Content-Length` pre-check in
     `api/src/routes/scans.ts:25-31`.
  4. The streaming byte counter in `api/src/lib/hash.ts:24-38`.

### Responses

#### 202 Accepted

```json
{
  "scanId": "2b1e4a8b-7a4f-4a0a-9c40-4f9e1a33c9e4",
  "analysisId": "u-abc...-1712345678",
  "status": "queued"
}
```

If VT had a cached terminal analysis for the file (the 409 → hash-lookup
recovery path with a hit), the returned status will be `completed`
immediately:

```json
{
  "scanId": "...",
  "analysisId": "...",
  "status": "completed"
}
```

In that case the client may skip the SSE stream and fetch the scan
directly with `GET /api/scans/:id`.

#### 400 `VALIDATION_FAILED`

- Missing or wrong `Content-Type`.
- No file field in the multipart body.

#### 413 `FILE_TOO_LARGE`

- `Content-Length` exceeds 32 MB + 1 KB, **or**
- Streamed bytes exceed 32 MB mid-upload.

#### 429 `RATE_LIMITED`

- Bucket: one of `global`, `upload`, `uploadHourly`. The message names
  the bucket that rejected.

#### 502 `SCAN_FAILED`

- VirusTotal returned 409 **and** the SHA-256 hash lookup returned 404
  (rare; retry after a few seconds typically succeeds).
- VirusTotal returned a non-retryable 4xx (auth/format).

### Timing budget

- Client-visible duration is dominated by the upload itself (bandwidth
  bound for large files) plus ~250 ms to VT's nearest edge.
- The response is emitted before VT finishes its analysis — the 202
  returns as soon as VT has accepted the submission and returned an
  analysis id.
- An idle socket will be aborted at **60 seconds** via
  `req.setTimeout(60_000, ...)`.

### Example

```bash
curl -i -X POST http://localhost:4000/api/scans \
  -H "X-Request-Id: $(uuidgen)" \
  -F "file=@files/newegg_magecart_skimmer.js"
```

---

## `GET /api/scans/:id`

Fetch the stored scan record by its UUID.

### Request

```
GET /api/scans/2b1e4a8b-7a4f-4a0a-9c40-4f9e1a33c9e4 HTTP/1.1
```

### Responses

#### 200 OK

```json
{
  "id": "2b1e4a8b-7a4f-4a0a-9c40-4f9e1a33c9e4",
  "vtAnalysisId": "u-abc...-1712345678",
  "fileName": "newegg_magecart_skimmer.js",
  "fileSha256": "d2c3...d1a7",
  "fileSize": 17429,
  "status": "completed",
  "result": {
    "attributes": {
      "status": "completed",
      "stats": {
        "malicious": 12,
        "suspicious": 1,
        "undetected": 41,
        "harmless": 0
      },
      "results": {
        "BitDefender": {
          "category": "malicious",
          "engine_name": "BitDefender",
          "result": "JS:Trojan.Cryxos.9999"
        }
        // ... one entry per engine
      }
    }
  },
  "createdAt": "2026-04-23T12:34:56.789Z",
  "updatedAt": "2026-04-23T12:35:12.004Z"
}
```

- `status` is one of `queued`, `running`, `completed`, `failed`.
- `result` is `null` until the analysis becomes terminal. Once terminal,
  it contains the raw VT `data` node — not a translated shape, so the
  consumer can rely on VT's official contract.

#### 404 `NOT_FOUND`

- Unknown id.
- Previously-valid id that has been evicted (older than 1 hour, or
  pushed out by the 500-entry LRU cap).

### Polling behaviour

The frontend polls this endpoint every 3 s while `status` is non-terminal
in addition to the SSE stream — providing resilience if the SSE connection
drops. See `web/app/scans/[id]/page.tsx:19-22`.

### Example

```bash
curl -s http://localhost:4000/api/scans/$SCAN_ID | jq '.status, .result.attributes.stats'
```
