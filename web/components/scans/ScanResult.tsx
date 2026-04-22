'use client';
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Scan } from '@/lib/types';

interface EngineResult {
  engine_name?: string;
  category?: string;
  result?: string | null;
}

interface VtAttributes {
  stats?: { malicious: number; suspicious: number; undetected: number; harmless: number };
  results?: Record<string, EngineResult>;
}

type Verdict = 'malicious' | 'suspicious' | 'clean';

function computeVerdict(stats: { malicious: number; suspicious: number }): Verdict {
  if (stats.malicious > 0) return 'malicious';
  if (stats.suspicious > 0) return 'suspicious';
  return 'clean';
}

function verdictLabel(v: Verdict): string {
  return v === 'malicious' ? 'Malicious' : v === 'suspicious' ? 'Suspicious' : 'Clean';
}

function verdictDescription(v: Verdict, stats: { malicious: number; suspicious: number }): string {
  if (v === 'malicious')
    return `${stats.malicious} engines flagged this file as malicious.`;
  if (v === 'suspicious')
    return `${stats.suspicious} engines flagged this file as suspicious. No confirmed malicious hits.`;
  return 'No engines flagged this file. It appears to be clean.';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'malicious' | 'suspicious' | 'clean' | 'muted';
}) {
  const toneClass = {
    malicious: 'bg-[color:var(--verdict-malicious)]/10 text-[color:var(--verdict-malicious)]',
    suspicious: 'bg-[color:var(--verdict-suspicious)]/10 text-[color:var(--verdict-suspicious)]',
    clean: 'bg-[color:var(--verdict-clean)]/10 text-[color:var(--verdict-clean)]',
    muted: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <div className={`rounded-md p-4 text-center ${toneClass}`}>
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

export function ScanResult({ scan }: { scan: Scan }) {
  if (scan.status !== 'completed') return null;
  const attrs = (scan.result as { attributes?: VtAttributes } | null)?.attributes;
  const stats = attrs?.stats ?? { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 };
  const engines = Object.values(attrs?.results ?? {});
  const verdict = computeVerdict(stats);
  const verdictColor = {
    malicious: 'text-[color:var(--verdict-malicious)]',
    suspicious: 'text-[color:var(--verdict-suspicious)]',
    clean: 'text-[color:var(--verdict-clean)]',
  }[verdict];

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <CardTitle className="tracking-tight">Scan result</CardTitle>
          <span
            className={`text-lg font-semibold tracking-tight ${verdictColor}`}
            aria-label={`Verdict: ${verdictLabel(verdict)}`}
          >
            {verdictLabel(verdict)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{verdictDescription(verdict, stats)}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content,1fr]">
          <dt className="text-muted-foreground">File</dt>
          <dd className="truncate font-mono">{scan.fileName}</dd>
          <dt className="text-muted-foreground">SHA-256</dt>
          <dd className="truncate font-mono text-xs tracking-wider">{scan.fileSha256 ?? '—'}</dd>
          <dt className="text-muted-foreground">Size</dt>
          <dd className="font-mono tabular-nums">{scan.fileSize != null ? formatBytes(scan.fileSize) : '—'}</dd>
        </dl>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Malicious" value={stats.malicious} tone="malicious" />
          <Stat label="Suspicious" value={stats.suspicious} tone="suspicious" />
          <Stat label="Harmless" value={stats.harmless} tone="clean" />
          <Stat label="Undetected" value={stats.undetected} tone="muted" />
        </div>

        <details className="rounded-md border border-border">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            Per-engine results ({engines.length})
          </summary>
          <div className="max-h-72 overflow-auto border-t border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Engine</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {engines.map((e, i) => (
                  <tr key={`${e.engine_name ?? 'engine'}-${i}`} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">{e.engine_name ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.category ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.result ?? '—'}</td>
                  </tr>
                ))}
                {engines.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                      No engine results available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
