import { randomUUID } from 'node:crypto';
import { dropConversation } from './messages.js';

export interface Scan {
  id: string;
  vtAnalysisId: string;
  fileName: string;
  fileSha256: string;
  fileSize: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result: unknown;
  createdAt: Date;
  updatedAt: Date;
}

// Bounded in-memory store. Oldest entries evicted once MAX_SCANS is reached
// so the API doesn't grow unbounded on a long-running process.
const MAX_SCANS = 500;
const scans = new Map<string, Scan>();

export const TTL_MS = 60 * 60_000; // 1 hour
const SWEEP_INTERVAL_MS = 5 * 60_000; // 5 minutes

export function evict(id: string): void {
  scans.delete(id);
  dropConversation(id);
}

function evictIfFull(): void {
  while (scans.size >= MAX_SCANS) {
    const oldest = scans.keys().next().value;
    if (oldest === undefined) return;
    evict(oldest);
  }
}

export function sweepExpired(now: number = Date.now()): void {
  for (const [id, scan] of scans.entries()) {
    if (now - scan.updatedAt.getTime() > TTL_MS) {
      evict(id);
    }
  }
}

// Start the background sweep. `.unref()` lets the process exit even if this
// is the only active timer. Skipped under NODE_ENV=test so tests drive the
// sweep explicitly with vi.setSystemTime + sweepExpired().
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => sweepExpired(), SWEEP_INTERVAL_MS).unref();
}

export function createScan(input: {
  vtAnalysisId: string;
  fileName: string;
  fileSha256: string;
  fileSize: number;
}): Scan {
  evictIfFull();
  const now = new Date();
  const scan: Scan = {
    id: randomUUID(),
    vtAnalysisId: input.vtAnalysisId,
    fileName: input.fileName,
    fileSha256: input.fileSha256,
    fileSize: input.fileSize,
    status: 'queued',
    result: null,
    createdAt: now,
    updatedAt: now,
  };
  scans.set(scan.id, scan);
  return scan;
}

export function getScan(id: string): Scan | null {
  return scans.get(id) ?? null;
}

export function updateScanStatus(id: string, status: Scan['status'], result?: unknown): void {
  const scan = scans.get(id);
  if (!scan) return;
  scan.status = status;
  if (result !== undefined) scan.result = result;
  scan.updatedAt = new Date();
}

// Test-only helper — NOT exported through any route. Unit tests can import it.
export function __resetForTests(): void {
  scans.clear();
}
