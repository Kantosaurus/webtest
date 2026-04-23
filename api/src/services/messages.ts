import { randomUUID } from 'node:crypto';

export interface Message {
  id: string;
  scanId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

const conversations = new Map<string, Message[]>();

const MAX_MESSAGES_PER_SCAN = 200;

export function listMessages(scanId: string): Message[] {
  return (conversations.get(scanId) ?? []).filter((m) => m.role !== 'system');
}

export function appendMessage(input: {
  scanId: string;
  role: Message['role'];
  content: string;
}): Message {
  const msg: Message = {
    id: randomUUID(),
    scanId: input.scanId,
    role: input.role,
    content: input.content,
    createdAt: new Date(),
  };
  const list = conversations.get(input.scanId);
  if (list) {
    list.push(msg);
    while (list.length > MAX_MESSAGES_PER_SCAN) list.shift();
  } else {
    conversations.set(input.scanId, [msg]);
  }
  return msg;
}

export function removeMessage(id: string, scanId: string): boolean {
  const list = conversations.get(scanId);
  if (!list) return false;
  const i = list.findIndex((m) => m.id === id);
  if (i === -1) return false;
  list.splice(i, 1);
  return true;
}

// Called when a scan is evicted from the in-memory scans store.
export function dropConversation(scanId: string): void {
  conversations.delete(scanId);
}
