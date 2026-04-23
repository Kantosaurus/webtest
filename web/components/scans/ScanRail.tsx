'use client';
import * as React from 'react';
import { X } from 'lucide-react';
import type { Scan } from '@/lib/types';

/* ----------------------------- derivations ---------------------------- */

interface EngineResult {
  engine_name?: string;
  category?: string;
  result?: string | null;
}
interface VtStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
}
interface VtAttributes {
  stats?: VtStats;
  results?: Record<string, EngineResult>;
}

export type Verdict = 'malicious' | 'suspicious' | 'clean' | 'pending' | 'failed';

function readAttrs(scan: Scan): VtAttributes | null {
  return (scan.result as { attributes?: VtAttributes } | null)?.attributes ?? null;
}

function computeVerdict(scan: Scan): Verdict {
  if (scan.status === 'failed') return 'failed';
  if (scan.status !== 'completed') return 'pending';
  const s = readAttrs(scan)?.stats;
  if (!s) return 'pending';
  if (s.malicious > 0) return 'malicious';
  if (s.suspicious > 0) return 'suspicious';
  return 'clean';
}

function verdictWord(v: Verdict) {
  return { malicious: 'Malicious', suspicious: 'Suspicious', clean: 'Clean', pending: 'Pending', failed: 'Failed' }[v];
}

function verdictDescription(v: Verdict, s: VtStats | null): string {
  if (v === 'malicious' && s) return `${s.malicious} engines flagged this as malicious.`;
  if (v === 'suspicious' && s)
    return `${s.suspicious} engines flagged this as suspicious. No confirmed malicious hits.`;
  if (v === 'clean') return 'No engines flagged this file.';
  if (v === 'pending') return 'Seventy-plus engines are weighing in.';
  return 'VirusTotal returned an error. No verdict was reached.';
}

function verdictColorClass(v: Verdict) {
  return {
    malicious: 'text-[color:var(--verdict-malicious)]',
    suspicious: 'text-[color:var(--verdict-suspicious)]',
    clean: 'text-[color:var(--verdict-clean)]',
    pending: 'text-muted-foreground',
    failed: 'text-destructive',
  }[v];
}

function formatBytes(n: number | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function truncHash(hash: string | undefined): string {
  if (!hash) return '—';
  if (hash.length <= 20) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/* --------------------------- shared content -------------------------- */

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
      {children}
    </div>
  );
}

function RailRule() {
  return <hr className="border-0 border-t border-border" />;
}

function StatsList({ stats }: { stats: VtStats | null }) {
  const rows: { label: string; value: number | '—'; color?: string }[] = stats
    ? [
        { label: 'Malicious', value: stats.malicious, color: 'text-[color:var(--verdict-malicious)]' },
        { label: 'Suspicious', value: stats.suspicious, color: 'text-[color:var(--verdict-suspicious)]' },
        { label: 'Harmless', value: stats.harmless, color: 'text-[color:var(--verdict-clean)]' },
        { label: 'Undetected', value: stats.undetected },
      ]
    : [
        { label: 'Malicious', value: '—' },
        { label: 'Suspicious', value: '—' },
        { label: 'Harmless', value: '—' },
        { label: 'Undetected', value: '—' },
      ];

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[0.8125rem]">
      {rows.map((r) => (
        <React.Fragment key={r.label}>
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd
            className={`font-mono tabular-nums ${r.color ?? 'text-foreground'}`}
            aria-label={`${r.value} ${r.label.toLowerCase()}`}
          >
            {r.value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function EngineDisclosure({ engines }: { engines: EngineResult[] }) {
  if (engines.length === 0) return null;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]">
        <span aria-hidden className="inline-block transition-transform duration-200 group-open:rotate-90" style={{ transitionTimingFunction: 'var(--ease-out)' }}>›</span>
        {engines.length} engines weighed in
      </summary>
      <div className="mt-4 max-h-[360px] overflow-y-auto">
        <ul className="space-y-2 text-[0.8125rem]">
          {engines.map((e, i) => (
            <li key={`${e.engine_name ?? 'engine'}-${i}`} className="grid grid-cols-[1fr_auto] items-baseline gap-3">
              <span className="truncate font-mono text-foreground">{e.engine_name ?? '—'}</span>
              <span
                className={
                  e.category === 'malicious'
                    ? 'font-mono text-[color:var(--verdict-malicious)]'
                    : e.category === 'suspicious'
                      ? 'font-mono text-[color:var(--verdict-suspicious)]'
                      : 'font-mono text-ink-faint'
                }
              >
                {e.result ?? e.category ?? 'undetected'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function ScanRailContent({ scan }: { scan: Scan }) {
  const attrs = readAttrs(scan);
  const stats = attrs?.stats ?? null;
  const engines = Object.values(attrs?.results ?? {});
  const v = computeVerdict(scan);

  return (
    <div className="space-y-6">
      {/* File */}
      <section className="space-y-3">
        <RailLabel>File</RailLabel>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.8125rem]">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="truncate font-mono text-foreground" title={scan.fileName}>{scan.fileName}</dd>
          <dt className="text-muted-foreground">SHA-256</dt>
          <dd className="font-mono text-ink-faint" title={scan.fileSha256 ?? ''}>{truncHash(scan.fileSha256)}</dd>
          <dt className="text-muted-foreground">Size</dt>
          <dd className="font-mono tabular-nums text-foreground">{formatBytes(scan.fileSize)}</dd>
        </dl>
      </section>

      <RailRule />

      {/* Verdict */}
      <section className="space-y-3">
        <RailLabel>Verdict</RailLabel>
        <div className={`font-sans text-[2rem] font-[650] leading-none tracking-tight ${verdictColorClass(v)}`}>
          {verdictWord(v)}
          {v === 'pending' && (
            <span aria-hidden className="live-dot ml-3 align-middle" />
          )}
        </div>
        <p className="max-w-[42ch] font-serif text-[0.9375rem] italic leading-relaxed text-muted-foreground">
          {verdictDescription(v, stats)}
        </p>
      </section>

      <RailRule />

      {/* Stats */}
      <section className="space-y-3">
        <RailLabel>Stats</RailLabel>
        <StatsList stats={stats} />
      </section>

      {engines.length > 0 && (
        <>
          <RailRule />
          <section className="space-y-3">
            <RailLabel>Engines</RailLabel>
            <EngineDisclosure engines={engines} />
          </section>
        </>
      )}
    </div>
  );
}

/* ----------------------------- desktop rail -------------------------- */

export function ScanRail({ scan }: { scan: Scan }) {
  return (
    <aside
      className="hidden lg:block border-l border-border"
      aria-label="Scan details"
    >
      <div className="sticky top-0 max-h-[calc(100dvh-3rem)] overflow-y-auto px-8 py-10">
        <ScanRailContent scan={scan} />
      </div>
    </aside>
  );
}

/* --------------------------- mobile strip + sheet -------------------- */

/**
 * Keep-mounted sheet with enter/exit transitions. Phases:
 *   closed   — unmounted
 *   opening  — mounted, data-state="open" triggers the enter transition
 *   open     — steady state
 *   closing  — data-state="closing" triggers the exit transition
 * After the exit duration (200ms), the sheet unmounts.
 */
type SheetPhase = 'closed' | 'open' | 'closing';

export function ScanRailStrip({ scan }: { scan: Scan }) {
  const [phase, setPhase] = React.useState<SheetPhase>('closed');
  const mounted = phase !== 'closed';
  const dataState: 'open' | 'closing' = phase === 'closing' ? 'closing' : 'open';

  const v = computeVerdict(scan);
  const attrs = readAttrs(scan);
  const stats = attrs?.stats;

  const openSheet = () => setPhase('open');
  const closeSheet = React.useCallback(() => {
    setPhase((p) => (p === 'open' ? 'closing' : p));
  }, []);

  // Scroll-lock + Esc to close while the sheet is mounted.
  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mounted, closeSheet]);

  // After the exit transition finishes, unmount.
  React.useEffect(() => {
    if (phase !== 'closing') return;
    const t = setTimeout(() => setPhase('closed'), 220);
    return () => clearTimeout(t);
  }, [phase]);

  const stripStats = stats
    ? `${stats.malicious}/${stats.suspicious}/${stats.harmless}/${stats.undetected}`
    : '—';

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="flex w-full items-center gap-3 border-b border-border bg-surface-alt px-5 py-2.5 text-left text-[0.75rem] transition-colors hover:bg-muted active:bg-muted lg:hidden focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
        aria-label="Open scan details"
      >
        <span className={`font-sans font-[600] uppercase tracking-[0.14em] ${verdictColorClass(v)}`}>
          {verdictWord(v)}
        </span>
        <span aria-hidden className="text-ink-faint">·</span>
        <span className="truncate font-mono text-muted-foreground" title={scan.fileName}>{scan.fileName}</span>
        <span aria-hidden className="ml-auto font-mono tabular-nums text-ink-faint">{stripStats}</span>
        <span aria-hidden className="text-ink-faint">›</span>
      </button>

      {mounted && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Scan details"
        >
          <button
            type="button"
            aria-label="Close scan details"
            data-state={dataState}
            className="sheet-backdrop absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
            onClick={closeSheet}
          />
          <div
            data-state={dataState}
            className="sheet-panel relative max-h-[85dvh] overflow-y-auto rounded-t-xl border-t border-border bg-background px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">Scan details</div>
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.92] active:duration-75"
                style={{ transitionTimingFunction: 'var(--ease-out)' }}
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <div className="mt-5">
              <ScanRailContent scan={scan} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { computeVerdict, verdictWord, verdictDescription, verdictColorClass, readAttrs };
