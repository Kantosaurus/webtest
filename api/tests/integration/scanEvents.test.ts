import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { setupServer } from 'msw/node';
import { http as mswHttp, HttpResponse } from 'msw';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { buildApp } from '../../src/app.js';
import { __resetForTests, createScan, updateScanStatus } from '../../src/services/scans.js';

const server = setupServer();
beforeEach(() => {
  __resetForTests();
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  server.resetHandlers();
  server.close();
});

function listen(app: Express): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      resolve({ port, close: () => new Promise((r) => s.close(() => r())) });
    });
  });
}

function collectSse(port: number, path: string, maxEvents: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const events: string[] = [];
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk: string) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          events.push(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
          if (events.length >= maxEvents) {
            req.destroy();
            resolve(events);
            return;
          }
        }
      });
      res.on('end', () => resolve(events));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

describe('GET /api/scans/:id/events', () => {
  it('streams status then result and closes on completion', async () => {
    let polls = 0;
    server.use(
      mswHttp.get('https://www.virustotal.com/api/v3/analyses/vt-xyz', () => {
        polls++;
        if (polls === 1) {
          return HttpResponse.json({
            data: { id: 'vt-xyz', attributes: { status: 'queued', stats: {} } },
          });
        }
        return HttpResponse.json({
          data: {
            id: 'vt-xyz',
            attributes: {
              status: 'completed',
              stats: { malicious: 0, suspicious: 0, undetected: 1, harmless: 0 },
              results: {},
            },
          },
        });
      }),
    );

    const scan = createScan({
      vtAnalysisId: 'vt-xyz',
      fileName: 'f',
      fileSha256: 'h',
      fileSize: 1,
    });
    const { port, close } = await listen(buildApp());
    try {
      const events = await collectSse(port, `/api/scans/${scan.id}/events`, 3);
      expect(events.some((e) => /status/.test(e))).toBe(true);
      expect(events.some((e) => /result/.test(e))).toBe(true);
    } finally {
      await close();
    }
  }, 30_000);

  it('short-circuits immediately when scan is already completed', async () => {
    const scan = createScan({
      vtAnalysisId: 'vt-done',
      fileName: 'f',
      fileSha256: 'h',
      fileSize: 1,
    });
    updateScanStatus(scan.id, 'completed', { attributes: { stats: {} } });
    const { port, close } = await listen(buildApp());
    try {
      const events = await collectSse(port, `/api/scans/${scan.id}/events`, 1);
      expect(events[0]).toMatch(/result/);
    } finally {
      await close();
    }
  });
});
