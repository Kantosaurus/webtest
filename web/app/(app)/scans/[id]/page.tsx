'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Scan } from '@/lib/types';
import { ScanProgress } from '@/components/upload/ScanProgress';
import { ScanResult } from '@/components/scans/ScanResult';

export default function ScanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, isLoading, error } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => apiFetch<Scan>(`/api/scans/${id}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'queued' || q.state.data?.status === 'running' ? 3000 : false,
    enabled: Number.isInteger(id) && id > 0,
  });

  if (!Number.isInteger(id) || id <= 0) {
    return <p className="text-sm text-destructive">Invalid scan id.</p>;
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Could not load scan.</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="truncate font-mono text-xl font-semibold tracking-tight" title={data.fileName}>
          {data.fileName}
        </h1>
        <p className="text-sm text-muted-foreground">Scan #{data.id}</p>
      </div>
      <ScanProgress scanId={data.id} initialStatus={data.status} />
      <ScanResult scan={data} />
      {data.status === 'completed' && (
        <div
          id="chat-slot"
          className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          Chat panel arrives in Phase 14.
        </div>
      )}
    </div>
  );
}
