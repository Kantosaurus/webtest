import { pool } from '../db/pool.js';

export interface Message {
  id: number;
  scanId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

function toMessage(row: Record<string, unknown>): Message {
  return {
    id: Number(row.id),
    scanId: Number(row.scan_id),
    role: row.role as Message['role'],
    content: row.content as string,
    createdAt: row.created_at as Date,
  };
}

export async function listMessagesForScan(scanId: number): Promise<Message[]> {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE scan_id = $1 AND role <> 'system' ORDER BY created_at ASC`,
    [scanId],
  );
  return rows.map(toMessage);
}

export async function insertMessage(input: {
  scanId: number;
  role: Message['role'];
  content: string;
}): Promise<Message> {
  const { rows } = await pool.query(
    `INSERT INTO messages (scan_id, role, content) VALUES ($1,$2,$3) RETURNING *`,
    [input.scanId, input.role, input.content],
  );
  return toMessage(rows[0]!);
}

export async function deleteMessage(id: number, scanId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM messages WHERE id = $1 AND scan_id = $2`,
    [id, scanId],
  );
  return (rowCount ?? 0) > 0;
}
