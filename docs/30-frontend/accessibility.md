# Accessibility

The application aims for WCAG 2.1 AA conformance in the surfaces it ships.
This document captures the specific choices made to reach that bar, and
where the responsibility lives for keeping it.

## Baseline behaviours

- **Semantic HTML first.** Buttons are `<button>`, links are `<a>`,
  form fields have `<label>`. `role="..."` is used only where no
  semantic element expresses the role (notably the dropzone — a
  generic `<div role="button">`).
- **Keyboard parity.** Every interactive affordance is reachable with
  `Tab` and operable with `Enter`/`Space`.
- **Focus rings.** All focusable elements carry a `focus-visible`
  outline sized `2px` with `2px` offset, colored via `--ring`. The
  outline uses `focus-visible:` so mouse users aren't visually
  penalised while keyboard users always get feedback.

## Landmark structure

Each page renders:

- `<header>` via `TopNav` (implicit landmark from `<header>` element
  usage is fine).
- `<main>` containing the primary content.
- `<footer>` on the landing page colophon.

## Live regions

- **Scan in progress** — `ScanProgress` renders its status panel with
  `role="status"` and `aria-live="polite"`. Screen readers announce
  status changes ("Queued with VirusTotal" → "Analyzing with
  seventy-plus engines") without interrupting the user.
- **Errors** — inline errors use `role="alert"` (assertive live
  region). A screen reader will interrupt the current reading to
  announce them.

## Streaming chat

- Assistant replies stream token-by-token into a single element; the
  container is *not* a live region, because announcing every token as
  it arrives would be user-hostile. Instead, the completed message
  gets focus-visible and is reachable through normal navigation.
- The "Retry" inline error, when present, *is* a live region, so the
  user hears that their message cut off.

## Colour and contrast

- **4.5:1 minimum** for body copy against `--background` in both
  themes. Spot-checked with the WebAIM contrast tool during design.
- Verdict tokens pass 4.5:1 against both themes for text use.
  Stats numbers are rendered in the verdict colour at `0.8125rem`
  and are tabular-nums'd so they also carry a non-colour affordance
  (position in a right-aligned numeric column).
- Nothing communicates state via colour alone. The verdict word is
  *weighted and sized differently* from body copy; the pending state
  is additionally accompanied by an animated dot.

## Respecting user preferences

- **`prefers-reduced-motion`** — the halftone field, the kinetic
  headline, scroll-reveal on the colophon, and the ScrollProgress bar
  all gate their animations on `@media (prefers-reduced-motion:
  no-preference)`. Essential motion (e.g. the streaming chat tokens)
  is preserved.
- **`prefers-color-scheme`** — initial theme is cream/paper (our
  "default"), with the `.dark` class toggled by the user. We don't
  auto-switch on system scheme; this is a deliberate choice to keep
  the brand feel consistent on first paint. A future enhancement
  could add an auto option.

## Touch targets

Every button and interactive element is at least 40 × 40 px on mobile.
The mobile strip that opens the scan-details sheet spans the full
width of the viewport; the sheet itself has a generous `close`
affordance in the top-right.

## Form controls

- The hidden `<input type="file">` is driven by the dropzone's click
  and space/enter handlers. It is `sr-only`, not `display: none`, so
  it remains findable by assistive tech if the user chooses.
- The chat composer is a plain `<textarea>` with sensible
  `aria-label`; `Enter` submits, `Shift+Enter` inserts a newline
  (standard chat convention, called out in the composer's
  `aria-describedby`).

## Known gaps and remediation

| Gap | Severity | Remediation |
|---|---|---|
| No automated a11y test (axe) in CI | medium | Introduce `@axe-core/playwright` in `tests/e2e/smoke.spec.ts`; gate the run on a clean report |
| `HalftoneField` is `aria-hidden="true"` but not reduced-motion aware for **all** browsers | low | Already respects the media query; verify on iOS Safari where coverage is weakest |
| Toast notifications (shadcn) don't pause on focus | low | Upstream shadcn behaviour; acceptable for our non-critical toasts |

## Testing

- **Manual.** Keyboard-only walkthrough of both pages before each
  release. VoiceOver spot-check on macOS.
- **Automated.** The Playwright smoke spec exercises the golden path
  and can be extended with axe-core to assert a clean report.

## References

- [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/?versions=2.1)
- Component-level accessibility notes are embedded in
  [Components](./components.md) for each component.
