'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Scan } from '@/lib/types';
import { TopNav } from '@/components/nav/TopNav';
import { ScanProgress } from '@/components/upload/ScanProgress';
import { ScanResult } from '@/components/scans/ScanResult';
import { ChatPanel } from '@/components/chat/ChatPanel';

export default function ScanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading, error } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => apiFetch<Scan>(`/api/scans/${id}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'queued' || q.state.data?.status === 'running' ? 3000 : false,
    enabled: !!id,
  });

  if (!id) {
    return <p className="p-6 text-sm text-destructive">Invalid scan id.</p>;
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 py-10 animate-in fade-in duration-300">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error || !data ? (
          <p className="text-sm text-destructive">Could not load scan. It may have expired.</p>
        ) : (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1
                className="truncate font-mono text-xl font-semibold tracking-tight"
                title={data.fileName}
              >
                {data.fileName}
              </h1>
              <p className="text-xs text-muted-foreground">Scan {data.id}</p>
            </div>
            <ScanProgress scanId={data.id} initialStatus={data.status} />
            <ScanResult scan={data} />
            {data.status === 'completed' && <ChatPanel scanId={data.id} />}
          </div>
        )}
      </main>
    </div>
  );
}
