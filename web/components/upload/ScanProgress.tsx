'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';

export function ScanProgress({
  scanId,
  initialStatus,
}: {
  scanId: number;
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
      <div
        role="status"
        className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
        <span>Scan failed. Upload the file again to retry.</span>
      </div>
    );
  }

  const label =
    status === 'queued' ? 'Queued' : status === 'running' ? 'Analyzing' : 'Working';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm"
    >
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" strokeWidth={1.75} />
      <span className="font-medium">{label}…</span>
      <span className="text-muted-foreground">Streaming results from VirusTotal.</span>
    </div>
  );
}
