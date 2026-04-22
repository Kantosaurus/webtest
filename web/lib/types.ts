export interface User {
  id: number;
  email: string;
}

export interface Scan {
  id: number;
  fileName: string;
  fileSha256?: string;
  fileSize?: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: unknown;
  createdAt: string;
  updatedAt?: string;
}

export interface Message {
  id: number;
  scanId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
