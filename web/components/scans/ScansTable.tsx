'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import type { Scan } from '@/lib/types';

const STATUS_TONE: Record<Scan['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-[color:var(--verdict-suspicious)]/15 text-[color:var(--verdict-suspicious)]',
  completed: 'bg-[color:var(--verdict-clean)]/15 text-[color:var(--verdict-clean)]',
  failed: 'bg-destructive/15 text-destructive',
};

function StatusPill({ status }: { status: Scan['status'] }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        STATUS_TONE[status],
      ].join(' ')}
    >
      {status}
    </span>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ScansTable() {
  const { data, isLoading } = useQuery({
    queryKey: ['scans'],
    queryFn: () => apiFetch<Scan[]>('/api/scans'),
    refetchInterval: (q) =>
      q.state.data?.some((s) => s.status === 'queued' || s.status === 'running') ? 3000 : false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="tracking-tight">Recent scans</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scans yet. Upload a file above to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[320px]">
                    <Link
                      href={`/scans/${s.id}`}
                      className="block truncate font-mono text-sm text-foreground hover:underline underline-offset-4"
                    >
                      {s.fileName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={s.status} />
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatWhen(s.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
