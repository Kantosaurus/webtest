'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCcw, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Message } from '@/lib/types';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useChatStream } from './useChatStream';

export function ChatPanel({ scanId }: { scanId: string }) {
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', scanId],
    queryFn: () => apiFetch<Message[]>(`/api/scans/${scanId}/messages`),
  });
  const { streaming, draft, error, send, stop, clearError } = useChatStream(scanId);
  const seeded = React.useRef(false);

  const doSend = React.useCallback(
    async (content: string) => {
      qc.setQueryData<Message[]>(['messages', scanId], (cur) => [
        ...(cur ?? []),
        {
          id: `pending-${Date.now()}`,
          scanId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        },
      ]);
      const result = await send(content);
      void qc.invalidateQueries({ queryKey: ['messages', scanId] });
      return result;
    },
    [qc, scanId, send],
  );

  // Seed an initial explanation on first visit when there are no messages yet.
  React.useEffect(() => {
    if (seeded.current) return;
    if (streaming) return;
    if (messages.length > 0) {
      seeded.current = true;
      return;
    }
    seeded.current = true;
    void doSend('Please explain this scan result in plain language.');
  }, [streaming, messages.length, doSend]);

  const regenerate = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastAssistant || !lastUser) return;
    await apiFetch(`/api/scans/${scanId}/messages/${lastAssistant.id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['messages', scanId] });
    await doSend(lastUser.content);
  };

  // When a stream errors the server did persist the user's turn but no
  // assistant reply. Retry by deleting that orphaned user message and
  // re-sending it, so the transcript doesn't end up with duplicates.
  const retry = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      clearError();
      return;
    }
    try {
      await apiFetch(`/api/scans/${scanId}/messages/${lastUser.id}`, { method: 'DELETE' });
    } catch {
      // Best effort — if the delete fails we'll just end up with a duplicate
      // user bubble, which is better than blocking the retry.
    }
    await qc.invalidateQueries({ queryKey: ['messages', scanId] });
    await doSend(lastUser.content);
  };

  const canRegenerate = !streaming && !error && messages.some((m) => m.role === 'assistant');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="tracking-tight">Ask about this scan</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void regenerate()}
          disabled={!canRegenerate}
        >
          <RefreshCcw className="mr-1 h-3 w-3" strokeWidth={1.75} />
          Regenerate
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <MessageList messages={messages} streamingDraft={streaming ? draft : null} />
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-destructive">
                  Couldn&apos;t generate a response
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void retry()}
                  disabled={streaming}
                >
                  <RefreshCcw className="mr-1 h-3 w-3" strokeWidth={1.75} />
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearError}
                  disabled={streaming}
                  aria-label="Dismiss error"
                >
                  <X className="mr-1 h-3 w-3" strokeWidth={1.75} />
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}
        <Composer onSend={(t) => void doSend(t)} onStop={stop} streaming={streaming} />
      </CardContent>
    </Card>
  );
}
