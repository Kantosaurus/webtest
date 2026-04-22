export interface Scan {
  id: string;
  fileName: string;
  fileSha256?: string;
  fileSize?: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: unknown;
  createdAt: string;
  updatedAt?: string;
}

export interface Message {
  id: string;
  scanId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
