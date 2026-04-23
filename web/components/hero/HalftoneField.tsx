'use client';
import * as React from 'react';

/**
 * A slow-drifting halftone dot field that sits behind the hero. Dot radii are
 * modulated by a low-frequency 2D noise field so the texture reads as a quiet,
 * procedural paper grain — editorial, not cyberpunk. Colors come from the
 * `--halftone-color` CSS variable, which flips with the theme.
 *
 * Paused when off-screen via IntersectionObserver and rendered as a single
 * static frame when the user has `prefers-reduced-motion: reduce`.
 */
export function HalftoneField({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const GRID = 22;
    const MAX_R = 2.3;
    const NOISE_SCALE = 0.006;
    const DRIFT_RATE = 0.00009; // slow; full-field shift visible over ~60s

    let raf = 0;
    let running = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function hash(x: number, y: number) {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    }
    function smooth(t: number) {
      return t * t * (3 - 2 * t);
    }
    function noise2d(x: number, y: number) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const a = hash(ix, iy);
      const b = hash(ix + 1, iy);
      const c = hash(ix, iy + 1);
      const d = hash(ix + 1, iy + 1);
      const ux = smooth(fx);
      const uy = smooth(fy);
      return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
    }

    function render(time: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const color = getComputedStyle(canvas!).color || 'rgba(0,0,0,0.1)';
      ctx.fillStyle = color;

      const drift = time * DRIFT_RATE;
      for (let gy = 0; gy < h + GRID; gy += GRID) {
        const row = Math.round(gy / GRID);
        const rowOffset = row % 2 === 0 ? 0 : GRID / 2;
        for (let gx = -GRID; gx < w + GRID; gx += GRID) {
          const x = gx + rowOffset;
          const y = gy;
          const n = noise2d(x * NOISE_SCALE + drift, y * NOISE_SCALE + drift * 0.7);
          // A soft contrast curve: emphasize brighter spots, suppress dim.
          const t = Math.max(0, n - 0.25) * 1.3;
          const radius = t * MAX_R;
          if (radius < 0.35) continue;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function loop(time: number) {
      if (!running) return;
      render(time);
      raf = requestAnimationFrame(loop);
    }

    resize();
    render(0);

    if (!reducedMotion) {
      running = true;
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => {
      resize();
      // Re-render a single frame immediately on resize.
      render(performance.now());
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        if (visible && !reducedMotion && !running) {
          running = true;
          raf = requestAnimationFrame(loop);
        } else if (!visible) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={['halftone-field pointer-events-none block h-full w-full', className ?? ''].join(' ')}
    />
  );
}
