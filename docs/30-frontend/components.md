# Components

Inventory of every bespoke component in `web/components/`, with its
contract and responsibilities. Shadcn primitives under `ui/` are not
documented here — they are vendored from [shadcn/ui](https://ui.shadcn.com)
and follow their upstream contracts.

---

## `upload/UploadDropzone.tsx`

The landing page's single interactive element.

**Props:** none.

**Responsibilities.**

- Drag/drop + click-to-pick + hidden `<input type="file">`.
- Client-side validation: rejects files > 32 MB with user-facing copy
  that cites the VT free-tier limit.
- `POST /api/scans` as multipart. Uses raw `fetch` (not `apiFetch`)
  because the body is `FormData`, not JSON.
- Navigates to `/scans/:scanId` on success (via `useRouter()`).
- Surfaces any upload error inline, with accessible `role="alert"`.
- Implements a **lerped cursor spotlight** — a CSS custom property
  (`--px`, `--py`) driven by `requestAnimationFrame` easing toward a
  pointer-set target. The lerp factor (`k = 0.18`) was tuned for
  "quick settle without feeling robotic" per the design-system rules.

**Accessibility.**

- `role="button"`, `aria-busy` when streaming.
- `aria-describedby` points to the secondary copy so a screen reader
  gets the "32 MB, nothing stored" line when focus lands on the zone.
- `Enter` or `Space` opens the native picker.
- Error state uses `role="alert"`, `lang="en"`.

---

## `upload/ScanProgress.tsx`

Rendered while the scan status is non-terminal.

**Props:** `{ scanId: string; initialStatus: string }`.

**Responsibilities.**

- Opens an `EventSource` on `/api/scans/:id/events`.
- Updates its local `status` from `event: status` frames.
- On `event: result`, sets `status` to `completed` and invalidates the
  `['scan', id]` and `['scans']` TanStack Query keys so the page's
  `useQuery` refetches and the rail updates.
- Closes the `EventSource` on `event: error`.
- Renders a typographic, non-alarming status panel while running; a
  user-friendly failure panel with a link back to start a new scan if
  the status is `failed`.

When the outer page observes `scan.status === 'completed'`, it
un-mounts this component and mounts `ChatPanel` instead.

---

## `scans/ScanRail.tsx`

Persistent scan-details surface, rendered next to the chat.

**Exports:**

- `ScanRail` — desktop sticky rail.
- `ScanRailStrip` — mobile strip that opens a bottom sheet.
- `computeVerdict`, `verdictWord`, `verdictDescription`,
  `verdictColorClass`, `readAttrs` — pure helpers, also used in tests.

**Props:** `{ scan: Scan }`.

**Verdict derivation.**

```ts
type Verdict = 'malicious' | 'suspicious' | 'clean' | 'pending' | 'failed';

function computeVerdict(scan: Scan): Verdict {
  if (scan.status === 'failed') return 'failed';
  if (scan.status !== 'completed') return 'pending';
  const s = readAttrs(scan)?.stats;
  if (!s) return 'pending';
  if (s.malicious > 0) return 'malicious';
  if (s.suspicious > 0) return 'suspicious';
  return 'clean';
}
```

This is deliberately a pure function — easy to test, easy to reuse in
the mobile strip.

**Rail content.** Four labeled sections:

1. **File** — name (truncated), SHA-256 (truncated with ellipsis),
   size.
2. **Verdict** — word + one-sentence description. Colour-coded in
   OKLCH; `pending` shows an animated "live dot".
3. **Stats** — malicious / suspicious / harmless / undetected counts
   in tabular-nums.
4. **Engines** (disclosed) — per-engine category and signature name.

**Mobile sheet.** Managed with a three-phase state machine
(`closed` / `open` / `closing`). The exit transition runs for 220 ms
before unmount; scroll-locking on `document.body` and an `Escape`
handler are installed only while the sheet is mounted.

**Colour tokens.**

| Token | Purpose |
|---|---|
| `--verdict-malicious` | Red-brown OKLCH |
| `--verdict-suspicious` | Amber OKLCH |
| `--verdict-clean` | Restrained green |

All three are defined once in `app/globals.css` and referenced via
`text-[color:var(--verdict-...)]` utility classes. No colour is
duplicated in component code.

---

## `chat/ChatPanel.tsx`

The chat surface on the scan detail page.

**Props:** `{ scanId: string }`.

**Composition.** Host for `MessageList`, an optional inline error
banner, and `Composer`. No chrome — framing is owned by the page.

**Seeded first reply.** On first mount with zero messages, the panel
dispatches a seeded user message with `SEED_CONTENT` (`"Explain this
scan in plain language. What should I do?"` — see `MessageBubble`).
`MessageList` filters that seeded user turn out of the render, so the
reader arrives mid-article.

**Optimistic send.** `doSend` immediately inserts a pending user turn
into the query cache, then calls `useChatStream.send(content)`. After
`done`, it invalidates the messages query to pick up the canonical
record (replacing the `pending-*` id with the server one).

**Retry.** If an error lands while streaming, an inline alert renders
with `Retry` and `Dismiss`. Retry DELETEs the last user message server
side (best-effort), invalidates the query, and re-sends the same
content.

---

## `chat/Composer.tsx`

Controlled input + submit + cancel.

**Props:** `{ onSend: (text: string) => void; onStop: () => void; streaming: boolean }`.

**Behaviour.**

- `Enter` submits, `Shift+Enter` inserts a newline (standard chat UX).
- While `streaming`, the submit button swaps to a "Stop" affordance
  that calls `onStop`, which aborts the underlying `AbortController`.

---

## `chat/useChatStream.ts`

The hook that owns the chat request lifecycle.

**Signature.**

```ts
function useChatStream(scanId: string): {
  streaming: boolean;
  draft: string;
  error: string | null;
  send(content: string): Promise<{ msgId: string; fullText: string } | null>;
  stop(): void;
  clearError(): void;
};
```

**State machine.**

| State | `streaming` | `draft` | `error` |
|---|---|---|---|
| Idle | false | `''` | null (unless prior error) |
| Sending | true | builds token-by-token | null |
| Aborted (user) | false | `''` | null |
| Errored | false | `''` | server message |
| Done | false | `''` (consumer has `fullText`) | prior error preserved if any |

The `AbortController` is bound on each `send()`; calling `stop()`
aborts it.

---

## `chat/MessageList.tsx` / `chat/MessageBubble.tsx` / `chat/MarkdownRenderer.tsx`

**MessageList** renders the conversation plus the streaming draft as
a pseudo-assistant bubble.

**MessageBubble** applies role-based styling and passes assistant
content through `MarkdownRenderer`.

**MarkdownRenderer** wraps `react-markdown` with `remark-gfm` and
`rehype-highlight`. It is unit-tested to cover code blocks, lists,
links, emphasis, and inline code.

---

## `nav/TopNav.tsx`

Minimal top bar — the scanner's name + the theme toggle. Sticky at
top on all pages.

---

## `hero/HalftoneField.tsx`

Canvas-backed halftone pattern behind the hero heading. No
interactivity; a pure visual element. Respects `prefers-reduced-motion`
by not animating the field.

---

## `motion/ScrollProgress.tsx` / `motion/ScrollReveal.tsx`

- **ScrollProgress** — thin top-of-viewport bar tied to scroll
  position. Pure CSS after initial wiring.
- **ScrollReveal** — intersection-observer-driven reveal for elements
  tagged `data-reveal-delay={n}`. Deployed on the colophon and
  "how it works" sections.

---

## `theme/ThemeProvider.tsx`

Persists the selected theme in `localStorage` under `theme`; toggles
the `.dark` class on `<html>`. Paired with the no-flash inline script
in `app/layout.tsx:36`.

---

## `ui/*`

Shadcn primitives — `Button`, `Card`, `Input`, `Label`, `Table`,
`Toast`, `Toaster`, and the `use-toast` hook. Unmodified from upstream
except for OKLCH colour substitution via CSS variables.
