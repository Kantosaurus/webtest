import { randomUUID } from 'node:crypto';

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

function evictIfFull(): void {
  while (scans.size >= MAX_SCANS) {
    const oldest = scans.keys().next().value;
    if (oldest === undefined) return;
    scans.delete(oldest);
  }
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
