import { pool } from '../db/pool.js';

export interface Scan {
  id: number;
  userId: number;
  vtAnalysisId: string;
  fileName: string;
  fileSha256: string;
  fileSize: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toScan(row: Record<string, unknown>): Scan {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    vtAnalysisId: row.vt_analysis_id as string,
    fileName: row.file_name as string,
    fileSha256: row.file_sha256 as string,
    fileSize: Number(row.file_size),
    status: row.status as Scan['status'],
    result: row.result,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function insertScan(input: {
  userId: number;
  vtAnalysisId: string;
  fileName: string;
  fileSha256: string;
  fileSize: number;
}): Promise<Scan> {
  const { rows } = await pool.query(
    `INSERT INTO scans (user_id, vt_analysis_id, file_name, file_sha256, file_size, status)
     VALUES ($1,$2,$3,$4,$5,'queued') RETURNING *`,
    [input.userId, input.vtAnalysisId, input.fileName, input.fileSha256, input.fileSize],
  );
  return toScan(rows[0]!);
}

export async function updateScanStatus(
  id: number,
  status: Scan['status'],
  result?: unknown,
): Promise<void> {
  await pool.query(
    `UPDATE scans SET status = $2, result = COALESCE($3, result), updated_at = now() WHERE id = $1`,
    [id, status, result == null ? null : JSON.stringify(result)],
  );
}

export async function getScanForUser(id: number, userId: number): Promise<Scan | null> {
  const { rows } = await pool.query(
    `SELECT * FROM scans WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ? toScan(rows[0]) : null;
}

export async function listScansForUser(userId: number, limit = 50): Promise<Scan[]> {
  const { rows } = await pool.query(
    `SELECT * FROM scans WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toScan);
}
