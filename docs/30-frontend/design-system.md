# Design System

The application's visual language is intentional — documented as
"analytical instrument, editorial restraint" in the project's design
DNA (`.impeccable.md`). This document summarises the rules in force;
consult the codebase for the authoritative values.

## Typography

| Role | Font | Source |
|---|---|---|
| Display / UI | **Bricolage Grotesque** | `next/font/google` as `--font-bricolage` |
| Body / serif | **Literata** | `next/font/google` as `--font-literata` |
| Mono (hashes, engine names, tabular data) | **Geist Mono** | `next/font/google` as `--font-geist-mono` |

All three are loaded as CSS variables by `app/layout.tsx:6-26`. The
width axis of Bricolage is explicitly enabled so the hero's
`breathe-width` animation can interpolate font-stretch over time.

### Rules

- **Hierarchy is carried by type, not colour.** A heading is bigger and
  weighted differently; it is not tinted. The only chromatic moment
  reserved for "verdicts" is the stats display and the verdict word
  itself.
- **No italic for emphasis — italic is reserved for body prose** (Literata
  italic). UI labels never italicise.
- **Tabular numerics** (`tabular-nums`) are used everywhere a number
  appears next to another number (stats, size, byte counts).

## Palette

Authored entirely in `oklch()` so that perceptual steps in lightness
and chroma are even. Three layers:

### Neutrals

| Light theme | Dark theme |
|---|---|
| Warm cream paper ground | Cool graphite ground |
| Cool ink foreground | Warm off-white foreground |

### Accent

A single restrained accent — deep ink blue — used for links,
focus rings, and primary buttons.

### Verdicts (the only chromatic moments)

| Token | Semantic | Palette note |
|---|---|---|
| `--verdict-malicious` | Red-brown | Restrained; not safety-orange |
| `--verdict-suspicious` | Amber | |
| `--verdict-clean` | Green | Low chroma — doesn't compete with accent |

All three tokens are defined once in `app/globals.css` and referenced
via utility classes such as `text-[color:var(--verdict-malicious)]`.
The same colours are used for the stats list and the verdict word, so
the two reinforce each other at a glance.

### Legibility without colour

Verdicts must be readable with colour removed. The colour classes are
paired with weight and size distinctions (`font-[650]`, larger type
scale) such that a monochrome rendering still communicates the
verdict.

## Motion language

Motion in the app falls into three tiers:

1. **Calm.** Most transitions — `200ms`, `var(--ease-out)`. Border
   colours, opacity, scale `0.997` on press. Nothing flashy.
2. **Editorial.** The colophon and "how it works" reveals run on
   intersection-observer with per-item `data-reveal-delay`, staggered
   by ~60–140 ms.
3. **Overdrive (deliberate, scoped).** Two moments earn a stronger
   gesture: the halftone field behind the hero and the per-line
   kinetic headline. Both respect `prefers-reduced-motion`.

The rule is "decoration is withheld unless it earns its place". The
dropzone's cursor spotlight is an exception — it is tactile feedback,
not decoration, and it disappears when the pointer leaves.

### `prefers-reduced-motion`

All non-essential animations are gated on
`@media (prefers-reduced-motion: no-preference)`. The chat streaming,
the halftone field, and the kinetic headline all have reduced-motion
variants.

## Tokens

CSS custom properties in `app/globals.css`:

- `--background`, `--foreground`, `--muted-foreground`, `--ink-faint`
- `--border`, `--surface-alt`, `--muted`
- `--primary`, `--primary-foreground`, `--ring`, `--destructive`
- `--verdict-malicious`, `--verdict-suspicious`, `--verdict-clean`
- `--ease-out` (shared timing function)

Tailwind is configured in `tailwind.config.ts` to thread these into the
utility layer so that `text-foreground`, `bg-surface-alt`, etc.
resolve to these tokens.

### Adding a new token

Three-step rule:

1. Define the OKLCH value in `:root` and the override in `.dark` in
   `app/globals.css`.
2. Thread it through Tailwind in `tailwind.config.ts` if it needs a
   utility shortcut.
3. Use it only via the token, never via a hex literal in JSX.

## Forbidden patterns

Codified in `.impeccable.md` and respected here:

- **No gradient text.** Ever.
- **No card-in-card.** One border per "card", not nested.
- **No glassmorphism.** The palette is ink-on-paper; a translucent
  blur breaks that frame.
- **No decorative drop shadows.** Shadows exist in the codebase only
  on the mobile sheet backdrop; nowhere else.

## Dark mode

Implemented as a class toggle on `<html>` (`.dark`). Paired with a
no-flash inline script in `app/layout.tsx:36` so first paint is on
the correct theme. Every token has a light and a dark value.

## Icons

Icons come from `lucide-react`. `strokeWidth={1.5}` is the project
default; override to `1.75` for small icons (≤ 14 px) to keep them
legible. No icon fonts, no SVG sprites.

## Reference

For implementation:

- Tokens and animations: `web/app/globals.css`
- Tailwind theme: `web/tailwind.config.ts`
- Component-level type ramp: see each component's classnames in
  [Components](./components.md)
