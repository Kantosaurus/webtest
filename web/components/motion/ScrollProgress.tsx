'use client';
import * as React from 'react';

/**
 * Thin reading-progress hairline pinned to the very top of the viewport.
 * Uses `scaleX(var(--scroll-progress))` so the update cost is GPU-only.
 * Hidden under `prefers-reduced-motion: reduce` via CSS.
 */
export function ScrollProgress() {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      const docEl = document.documentElement;
      const scrollable = Math.max(1, docEl.scrollHeight - docEl.clientHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
      el.style.setProperty('--scroll-progress', progress.toFixed(4));
      // Expose raw scroll distance so other elements (hero parallax etc.)
      // can read it in CSS without each adding its own listener.
      docEl.style.setProperty('--scroll-y', String(window.scrollY));
      raf = 0;
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} aria-hidden className="scroll-progress" />;
}
