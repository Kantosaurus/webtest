'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

const MAX_BYTES = 32 * 1024 * 1024;

async function uploadFile(file: File): Promise<{ scanId: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/scans', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Upload failed (${res.status})`);
  }
  return (await res.json()) as { scanId: string };
}

function formatMB(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

export function UploadDropzone() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const zoneRef = React.useRef<HTMLDivElement>(null);

  // Lerped cursor spotlight: pointermove sets a *target*; a rAF loop eases the
  // rendered --px/--py toward it. Gives the light soft momentum rather than
  // stapling to the cursor. Emil: "tying visual changes directly to mouse
  // position feels artificial because it lacks motion."
  const targetRef = React.useRef({ x: 0, y: 0, active: false });
  const currentRef = React.useRef({ x: 0, y: 0 });
  const rafRef = React.useRef(0);

  const tick = React.useCallback(() => {
    const el = zoneRef.current;
    if (!el) {
      rafRef.current = 0;
      return;
    }
    const t = targetRef.current;
    const c = currentRef.current;
    const k = 0.18; // lerp factor — quick settle without feeling robotic
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    el.style.setProperty('--px', `${c.x}px`);
    el.style.setProperty('--py', `${c.y}px`);
    const dx = Math.abs(t.x - c.x);
    const dy = Math.abs(t.y - c.y);
    if (t.active || dx > 0.4 || dy > 0.4) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = 0;
    }
  }, []);

  React.useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const mut = useMutation({
    mutationFn: uploadFile,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['scans'] });
      router.push(`/scans/${r.scanId}`);
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : 'The scan could not start. Try again?'),
  });

  const handleFiles = (files: FileList | null) => {
    setError(null);
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(
        `That file is ${formatMB(f.size)}. VirusTotal's free tier caps uploads at 32 MB — try a smaller one.`,
      );
      return;
    }
    mut.mutate(f);
  };

  const openPicker = () => {
    if (mut.isPending) return;
    inputRef.current?.click();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = targetRef.current;
    t.x = e.clientX - rect.left;
    t.y = e.clientY - rect.top;
    t.active = true;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
  };

  const onPointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    // Seed both target and current to the entry point so the first frame
    // doesn't animate in from (0, 0) — it starts where the pointer entered.
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    targetRef.current.x = x;
    targetRef.current.y = y;
    targetRef.current.active = true;
    currentRef.current.x = x;
    currentRef.current.y = y;
  };

  const onPointerLeave = () => {
    targetRef.current.active = false;
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_180px] md:gap-10">
      <div>
        <div
          ref={zoneRef}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={openPicker}
          role="button"
          aria-label="Upload a file"
          aria-busy={mut.isPending}
          aria-describedby="upload-secondary"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          data-drag={dragOver ? 'true' : 'false'}
          onPointerEnter={onPointerEnter}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          className={[
            'dropzone-conic dropzone-spotlight group relative block cursor-pointer overflow-hidden rounded-md bg-surface-alt px-8 py-14 text-left',
            'border transition-[border-color,background-color,transform] duration-200',
            'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
            'active:scale-[0.997] active:duration-75',
            dragOver
              ? 'border-primary bg-[color-mix(in_oklch,var(--primary),var(--surface-alt)_92%)] scale-[1.008]'
              : 'border-border hover:border-foreground/40',
            mut.isPending ? 'pointer-events-none opacity-80' : '',
          ].join(' ')}
          style={{ transitionTimingFunction: 'var(--ease-out)' }}
        >
          {/* One-shot wave pulse fired by the `[data-drag='true']` selector in globals.css */}
          <span aria-hidden className="dropzone-wave" />

          <div className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            {mut.isPending ? 'Streaming' : dragOver ? 'Release to upload' : 'Drop zone'}
          </div>

          {mut.isPending ? (
            <div className="flex items-center gap-3 text-lg tracking-tight">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden strokeWidth={1.5} />
              <span>Streaming to VirusTotal&hellip;</span>
            </div>
          ) : (
            <>
              <p className="text-xl tracking-tight sm:text-[1.375rem]">
                Drop a file here, or{' '}
                <span className="underline decoration-border underline-offset-[6px] transition-colors group-hover:decoration-foreground">
                  click to choose one
                </span>
                .
              </p>
              <p
                id="upload-secondary"
                className="mt-3 max-w-[55ch] font-serif text-[0.9375rem] italic leading-relaxed text-muted-foreground"
              >
                Up to 32 MB. Nothing is stored. The scan exists only for this session.
              </p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {error && (
          <p
            role="alert"
            className="mt-4 max-w-[60ch] font-serif text-[0.9375rem] italic leading-relaxed text-destructive"
          >
            <span aria-hidden className="mr-2 not-italic text-muted-foreground">—</span>
            {error}
          </p>
        )}
      </div>

      <aside aria-hidden className="hidden pt-2 md:block">
        <ul className="space-y-2 font-mono text-[0.75rem] leading-relaxed text-ink-faint">
          <li><span className="text-muted-foreground">—</span> 32 MB upload cap</li>
          <li><span className="text-muted-foreground">—</span> 4 scans per minute</li>
          <li><span className="text-muted-foreground">—</span> nothing stored</li>
        </ul>
      </aside>
    </div>
  );
}
