'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Inline, typographic progress readout for a running or queued scan. Lives in
 * the main chat column while the scan hasn't reached a terminal state. No
 * card, no alert border — a calm status line with a live-dot indicator.
 */
export function ScanProgress({
  scanId,
  initialStatus,
}: {
  scanId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = React.useState(initialStatus);
  const qc = useQueryClient();

  React.useEffect(() => {
    if (status === 'completed' || status === 'failed') return;
    const es = new EventSource(`/api/scans/${scanId}/events`, { withCredentials: true });

    es.addEventListener('status', (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as { state: string };
        setStatus(parsed.state);
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener('result', () => {
      setStatus('completed');
      void qc.invalidateQueries({ queryKey: ['scan', scanId] });
      void qc.invalidateQueries({ queryKey: ['scans'] });
      es.close();
    });

    es.addEventListener('error', () => {
      es.close();
    });

    return () => es.close();
  }, [scanId, status, qc]);

  if (status === 'completed') return null;

  if (status === 'failed') {
    return (
      <p
        role="alert"
        className="mx-auto max-w-[720px] px-6 py-12 font-serif text-[1rem] italic leading-relaxed text-destructive md:px-10"
      >
        <span aria-hidden className="mr-2 not-italic text-muted-foreground">—</span>
        This scan couldn&apos;t complete. VirusTotal returned an error, or the upload timed out.{' '}
        <Link
          href="/"
          className="font-sans font-medium not-italic text-primary underline decoration-[1.5px] underline-offset-[3px] hover:decoration-2"
        >
          Start a new scan
        </Link>
        .
      </p>
    );
  }

  const label = status === 'queued' ? 'Queued with VirusTotal' : 'Analyzing with seventy-plus engines';

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-[720px] px-6 py-16 md:px-10"
    >
      <div className="flex items-baseline gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
        <span aria-hidden className="live-dot translate-y-[2px]" />
        <span>Scan in progress</span>
      </div>
      <p className="mt-4 font-serif text-[1.0625rem] leading-[1.65] text-foreground">
        {label}. Results stream in as each engine reports.
      </p>
      <p className="mt-2 font-serif text-[0.9375rem] italic leading-relaxed text-muted-foreground">
        The assistant will begin explaining the verdict as soon as the scan is terminal.
      </p>
    </div>
  );
}
