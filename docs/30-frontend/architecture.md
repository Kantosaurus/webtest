# Frontend Architecture

The web application is a Next.js 15 App Router project that renders two
pages and drives everything over the API detailed in
[20 · API Reference](../20-api-reference/README.md).

## Runtime layout

```
web/
├── app/
│   ├── layout.tsx                fonts, no-flash theme, Providers
│   ├── page.tsx                  hero + upload + colophon
│   ├── scans/[id]/page.tsx       two-column scan detail + chat
│   └── globals.css               tokens, animations, typography
├── components/
│   ├── chat/                     ChatPanel + Composer + useChatStream
│   ├── hero/HalftoneField.tsx    canvas halftone backdrop
│   ├── motion/                   ScrollProgress, ScrollReveal
│   ├── nav/TopNav.tsx
│   ├── scans/ScanRail.tsx        verdict rail (desktop + mobile sheet)
│   ├── theme/ThemeProvider.tsx   light / dark, persists in localStorage
│   ├── ui/                       shadcn primitives
│   ├── upload/
│   │   ├── UploadDropzone.tsx
│   │   └── ScanProgress.tsx
│   └── providers.tsx             TanStack Query, Toaster, ThemeProvider
├── lib/
│   ├── api.ts                    apiFetch wrapper + ApiCallError
│   ├── sse.ts                    readSse async generator
│   ├── types.ts                  Scan, Message, ApiError
│   └── utils.ts
├── next.config.mjs               rewrites /api/* → INTERNAL_API_BASE
├── Dockerfile                    multi-stage build; output: standalone
└── tests/e2e/smoke.spec.ts       Playwright smoke
```

## Pages

### `/` — landing and upload

`app/page.tsx` renders a single-page editorial spread: hero, upload
dropzone, "how it works", colophon. The only interactive element is
`UploadDropzone`, which:

1. Accepts a file via drag/drop or click-to-pick.
2. Validates size client-side (32 MB).
3. `POST`s to `/api/scans` with `credentials: 'include'` (cookies aren't
   used today, but it's a cheap future-proofing).
4. On success, calls `router.push(/scans/${scanId})`.

The surrounding motion (`ScrollProgress`, `ScrollReveal`, the kinetic
headline) is cosmetic — no component on this page owns data other than
the dropzone's own error state.

### `/scans/[id]` — scan detail and chat

`app/scans/[id]/page.tsx` is the main surface:

- Fetches the scan with TanStack Query, polling every 3 s while the
  status is non-terminal.
- Renders a two-column shell on desktop (main column + verdict rail),
  collapsing to a stacked layout with a bottom-sheet on mobile.
- When `status !== 'completed'` the main column shows `ScanProgress`
  (SSE-driven). On completion it swaps to `ChatPanel`.

### Dynamic route behaviour

There is no `generateStaticParams`; the route is rendered on-demand.
Because the API is reachable only via the Next.js server, the browser
loads the route shell statically and then fetches data via the rewrite
layer.

## Rewrites

```ts
// web/next.config.mjs
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: `${process.env.INTERNAL_API_BASE ?? 'http://api:4000'}/api/:path*`,
    },
  ];
}
```

`INTERNAL_API_BASE` is `http://api:4000` under compose. In local dev
(the `.dev.yml` override) the API is also published on port 4000, but
the rewrite still routes through the web container so the wire flow
matches production.

### Upload-specific Next tuning

```ts
experimental: {
  middlewareClientMaxBodySize: '32mb',
  proxyTimeout: 120_000,
}
```

Next 15 caps request bodies flowing through its rewrite/middleware
pipeline at 10 MB and its proxy at 30 s by default. Uploads of our
permitted 32 MB would silently truncate without these settings; the
upstream socket reset surfaces in the browser as `NetworkError when
attempting to fetch resource`, which is nightmarish to diagnose. The
overrides exist to make the wire match the advertised limit.

## State management

### TanStack Query (server state)

- `['scan', id]` — the scan record.
- `['messages', scanId]` — the conversation.
- `['scans']` — list invalidation hook for potential future scan lists
  (currently unused on the UI but invalidated on new upload for consistency).

Defaults in `components/providers.tsx:9-15`:

```ts
defaultOptions: {
  queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
}
```

### Component state

- `useChatStream(scanId)` owns: `streaming`, `draft`, `error`, plus
  `AbortController` for the in-flight request. See
  [components/chat](./components.md#usechatstreamscanid).
- `UploadDropzone` owns: `dragOver`, `error`, and a rAF loop for the
  pointer-spotlight effect.
- `ScanRailStrip` owns: open/closed phase state for the bottom sheet.

### URL

The scan id is the route param. There is no auth, no per-user scope —
the id *is* the capability.

### Theme

`components/theme/ThemeProvider` persists the user's preference in
`localStorage`. An inline `<script>` in `layout.tsx` applies the theme
class before hydration so there is no flash of wrong theme:

```html
<script>try{var t=localStorage.getItem("theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}</script>
```

## Client libraries

### `lib/api.ts` — fetch wrapper

```ts
export class ApiCallError extends Error { status; api; }

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // credentials: 'include', Content-Type: application/json
  // on !ok → throw ApiCallError with typed error envelope
  // on 204 → return undefined
}
```

Used by the scan query, message list query, and message delete.

### `lib/sse.ts` — generic SSE reader

```ts
export async function* readSse(response: Response, signal?: AbortSignal):
  AsyncGenerator<{ event: string; data: string }>;
```

Parses the `event:`/`data:` framing and yields one object per `\n\n`
block. Consumed by `useChatStream`.

For the scan-events stream (landing on the progress screen), the client
uses the browser's native `EventSource` instead — same wire contract,
handled a step higher up the stack. See
`components/upload/ScanProgress.tsx`.

### `lib/types.ts` — client types

Mirrors the API's object shapes; see
[Data Models](../20-api-reference/data-models.md).

## Images & standalone build

`next.config.mjs` sets `output: 'standalone'` so the Docker runtime
image contains only the minimal server plus `node_modules` slice it
actually needs. The Dockerfile copies `/app/.next/standalone`,
`/app/.next/static`, and `/app/public` into the runtime stage
(`web/Dockerfile:26-28`).

The standalone server binds `0.0.0.0:3000` (overridden via `HOSTNAME`
and `PORT` in the Dockerfile) so Docker's healthcheck can reach it on
127.0.0.1.

> Known dev friction: `output: 'standalone'` fails at the
> `Collecting build traces` step on Windows without Developer Mode
> (due to the Windows symlink policy). Linux builds (CI, Docker, EC2)
> are unaffected.

## Testing

- **Playwright** — a single smoke spec at
  `tests/e2e/smoke.spec.ts`. Covers: upload → verdict; open scan → chat
  → streamed reply. Run against the dev-compose stack:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
  E2E_BASE_URL=http://localhost:3000 npx playwright test
  ```
- **Vitest** — `tests/unit/MarkdownRenderer.test.tsx` exercises the
  markdown rendering contract (gfm + highlight + safe code blocks).

More detail in [Testing Strategy](../50-development/testing.md).
