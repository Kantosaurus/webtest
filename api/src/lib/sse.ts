import type { Response } from 'express';

export class SseWriter {
  constructor(private res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const flushable = res as Response & { flushHeaders?: () => void };
    if (typeof flushable.flushHeaders === 'function') {
      flushable.flushHeaders();
    }
  }

  event(name: string, data: unknown): void {
    this.res.write(`event: ${name}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  comment(text: string): void {
    this.res.write(`: ${text}\n\n`);
  }

  close(): void {
    this.res.end();
  }
}
