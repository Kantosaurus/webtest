# Data Models

All shared object shapes used by the API. Each model is defined once in
TypeScript in the backend and mirrored structurally in the frontend
types (`web/lib/types.ts`).

---

## `Scan`

Defined at `api/src/services/scans.ts:4-14`.

```ts
interface Scan {
  id: string;                   // UUIDv4
  vtAnalysisId: string;         // opaque VirusTotal id
  fileName: string;             // user-provided filename
  fileSha256: string;           // hex string (64 chars)
  fileSize: number;             // bytes
  status: 'queued' | 'running' | 'completed' | 'failed';
  result: unknown;              // VT `data` node when terminal; else null
  createdAt: Date;
  updatedAt: Date;
}
```

The `result.attributes.stats` object is structurally:

```ts
interface AnalysisStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
}
```

`result.attributes.results` is a map keyed by engine slug; each value is:

```ts
interface EngineResult {
  engine_name?: string;
  category?: 'malicious' | 'suspicious' | 'undetected' | 'harmless' | 'failure' | 'timeout' | 'confirmed-timeout' | 'type-unsupported';
  result?: string | null;       // vendor-specific signature name
  engine_version?: string;
  method?: string;
  engine_update?: string;
}
```

The API returns the raw VT payload under `result.attributes` — there is
no translation layer. This is deliberate: it preserves the official VT
contract, and the frontend derives the user-facing "verdict" from
`stats` with a small pure function (`computeVerdict` in
`web/components/scans/ScanRail.tsx:30-38`).

---

## `Message`

Defined at `api/src/services/messages.ts:3-9`.

```ts
interface Message {
  id: string;                            // UUIDv4
  scanId: string;                        // FK to Scan.id
  role: 'user' | 'assistant' | 'system';
  content: string;                        // 1 ≤ len ≤ 4000 for user turns
  createdAt: Date;
}
```

The `listMessages` helper filters out `role: 'system'`, so wire responses
contain only `user` and `assistant` turns.

---

## `AppError` envelope

Defined at `api/src/lib/errors.ts:12-33`.

```ts
interface ApiErrorEnvelope {
  error: {
    code:
      | 'VALIDATION_FAILED'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'FILE_TOO_LARGE'
      | 'RATE_LIMITED'
      | 'SCAN_FAILED'
      | 'INTERNAL';
    message: string;
    details?: unknown;
  };
}
```

See [Errors](./errors.md) for the full mapping between codes and HTTP
statuses.

---

## SSE event payloads

### Scan events (`GET /api/scans/:id/events`)

```ts
// event: status
{ state: 'queued' | 'running' }

// event: result
{
  status: 'completed';
  stats: AnalysisStats;
  results: Record<string, EngineResult>;
}

// event: error
{ message: string }
```

### Chat events (`POST /api/scans/:id/messages`)

```ts
// event: token
{ token: string }

// event: done
{ msgId: string; fullText: string }

// event: error
{ message: string }
```

---

## Prompt shapes

### `ScanContext`

Used to populate the Gemini system instruction. Defined at
`api/src/lib/promptBuilder.ts:1-7`.

```ts
interface ScanContext {
  fileName: string;
  fileSha256: string;
  status: string;
  stats: {
    malicious: number;
    suspicious: number;
    undetected: number;
    harmless: number;
  };
  topEngines: string[];
}
```

The `topEngines` list is up to 5 engine names whose category is
`malicious` or `suspicious`, preserving the VT result order.

### `GeminiPrompt`

The object passed to `GoogleGenerativeAI.getGenerativeModel().generateContentStream`:

```ts
interface GeminiPrompt {
  systemInstruction: string;
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
}
```

## Frontend mirror types

For the client-side reading of these shapes, see `web/lib/types.ts`.
Minor divergences:

- Server returns timestamps as `Date` objects (serialised as ISO strings
  over the wire); the client types them as `string`.
- The client's `Scan` type declares `result?: unknown` — the client never
  narrows it at the type level, only at the render site via
  `readAttrs()`.
