'use client';
import * as React from 'react';

/**
 * Watches every `.reveal` element on the page with a single IntersectionObserver
 * and adds `.is-in` when each enters the viewport. The `.reveal`/`.is-in` CSS
 * lives in globals.css; this component provides no markup.
 *
 * Per-element stagger is expressed via the `data-reveal-delay` attribute in ms,
 * which we copy onto `transition-delay` so multiple children of a list reveal
 * in rhythm. Respects `prefers-reduced-motion` by marking everything in-view
 * immediately.
 */
export function ScrollRevealRoot() {
  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const markVisible = (el: Element) => {
      (el as HTMLElement).classList.add('is-in');
    };

    if (reduced) {
      document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => markVisible(el));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = el.dataset.revealDelay;
            if (delay) el.style.transitionDelay = `${delay}ms`;
            el.classList.add('is-in');
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    const observe = () => {
      document.querySelectorAll<HTMLElement>('.reveal:not(.is-in)').forEach((el) => io.observe(el));
    };

    observe();

    // Re-scan if the DOM updates (cheap: landing page is static).
    const mo = new MutationObserver(() => observe());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
