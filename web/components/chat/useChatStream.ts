'use client';
import * as React from 'react';
import { readSse } from '@/lib/sse';

interface StreamState {
  streaming: boolean;
  draft: string;
  error: string | null;
}

export function useChatStream(scanId: number) {
  const [state, setState] = React.useState<StreamState>({
    streaming: false,
    draft: '',
    error: null,
  });
  const controllerRef = React.useRef<AbortController | null>(null);

  const send = React.useCallback(
    async (content: string): Promise<{ msgId: number; fullText: string } | null> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ streaming: true, draft: '', error: null });
      try {
        const res = await fetch(`/api/scans/${scanId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });
        if (!res.ok) {
          setState({ streaming: false, draft: '', error: `HTTP ${res.status}` });
          return null;
        }
        let finalMsg: { msgId: number; fullText: string } | null = null;
        for await (const evt of readSse(res, controller.signal)) {
          if (evt.event === 'token') {
            try {
              const parsed = JSON.parse(evt.data) as { token: string };
              setState((s) => ({ ...s, draft: s.draft + parsed.token }));
            } catch {
              /* ignore malformed token event */
            }
          } else if (evt.event === 'done') {
            try {
              finalMsg = JSON.parse(evt.data) as { msgId: number; fullText: string };
            } catch {
              /* ignore */
            }
          } else if (evt.event === 'error') {
            try {
              const e = JSON.parse(evt.data) as { message: string };
              setState((s) => ({ ...s, error: e.message }));
            } catch {
              /* ignore */
            }
          }
        }
        setState({ streaming: false, draft: '', error: null });
        return finalMsg;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setState({ streaming: false, draft: '', error: null });
          return null;
        }
        setState({
          streaming: false,
          draft: '',
          error: err instanceof Error ? err.message : 'Stream failed',
        });
        return null;
      } finally {
        controllerRef.current = null;
      }
    },
    [scanId],
  );

  const stop = React.useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { ...state, send, stop };
}
