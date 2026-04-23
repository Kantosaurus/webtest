'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Scan } from '@/lib/types';
import { TopNav } from '@/components/nav/TopNav';
import { ScanProgress } from '@/components/upload/ScanProgress';
import { ScanRail, ScanRailStrip } from '@/components/scans/ScanRail';
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

  return (
    <div className="flex h-[100dvh] flex-col">
      <TopNav />

      {!id ? (
        <EmptyState
          eyebrow="Invalid scan"
          body="That URL doesn't look like a scan id."
          cta="Start a new scan"
        />
      ) : isLoading ? (
        <EmptyState eyebrow="Loading" body="Fetching the scan…" />
      ) : error || !data ? (
        <EmptyState
          eyebrow="Scan not found"
          body="It may have expired. Scans live only for the length of a session."
          cta="Start a new scan"
        />
      ) : (
        <>
          {/* Mobile-only: compact strip + bottom sheet */}
          <ScanRailStrip scan={data} />

          {/* Desktop file strip */}
          <div className="hidden border-b border-border lg:block">
            <div className="mx-auto flex h-11 max-w-full items-center gap-5 px-10">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                New scan
              </Link>
              <span aria-hidden className="text-ink-faint">·</span>
              <span className="truncate font-mono text-[0.8125rem] text-foreground" title={data.fileName}>
                {data.fileName}
              </span>
              <span aria-hidden className="text-ink-faint">·</span>
              <span
                className="font-mono text-[0.75rem] text-ink-faint"
                title={`Scan id ${data.id}`}
              >
                {data.id.slice(0, 8)}
              </span>
            </div>
          </div>

          {/* Two-column shell */}
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-0 flex-col">
              {data.status !== 'completed' ? (
                <div className="flex min-h-0 flex-1 flex-col justify-start overflow-y-auto">
                  <ScanProgress scanId={data.id} initialStatus={data.status} />
                </div>
              ) : (
                <ChatPanel scanId={data.id} />
              )}
            </div>

            <ScanRail scan={data} />
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({
  eyebrow,
  body,
  cta,
}: {
  eyebrow: string;
  body: string;
  cta?: string;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-[48ch] space-y-4 text-center">
        <div className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
          {eyebrow}
        </div>
        <p className="font-serif text-[1.0625rem] leading-relaxed text-foreground">{body}</p>
        {cta && (
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 pt-2 font-sans text-[0.875rem] font-medium text-primary underline decoration-[1.5px] underline-offset-[3px] transition-[text-decoration-thickness] hover:decoration-2"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            {cta}
          </Link>
        )}
      </div>
    </main>
  );
}
