'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCcw, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Message } from '@/lib/types';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useChatStream } from './useChatStream';
import { SEED_CONTENT } from './MessageBubble';

/**
 * Chat is the main column of the scan page. This component is intentionally
 * a flat surface — no Card, no header bar, no wrapping chrome. The messages
 * region scrolls inside a fixed-height parent; the Composer pins to the
 * bottom of that parent. Any framing (verdict rail, file strip) is owned
 * by the page shell.
 */
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

  // Kick off the initial explanation on first visit when there are no turns yet.
  // The seeded user message is filtered from the rendered list (see SEED_CONTENT
  // in MessageList) so the reader arrives mid-article.
  React.useEffect(() => {
    if (seeded.current) return;
    if (streaming) return;
    if (messages.length > 0) {
      seeded.current = true;
      return;
    }
    seeded.current = true;
    void doSend(SEED_CONTENT);
  }, [streaming, messages.length, doSend]);

  const retry = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      clearError();
      return;
    }
    try {
      await apiFetch(`/api/scans/${scanId}/messages/${lastUser.id}`, { method: 'DELETE' });
    } catch {
      // Best effort.
    }
    await qc.invalidateQueries({ queryKey: ['messages', scanId] });
    await doSend(lastUser.content);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList messages={messages} streamingDraft={streaming ? draft : null} />

      {error && (
        <div role="alert" className="mx-auto w-full max-w-[720px] px-6 pb-3 md:px-10">
          <p className="font-serif text-[0.9375rem] italic leading-relaxed text-destructive">
            <span aria-hidden className="mr-2 not-italic text-muted-foreground">—</span>
            The answer cut off. {error}
            <span className="ml-3 inline-flex items-center gap-2 text-[0.8125rem] not-italic">
              <button
                type="button"
                onClick={() => void retry()}
                disabled={streaming}
                className="inline-flex items-center gap-1 font-sans font-medium text-primary underline decoration-[1.5px] underline-offset-[3px] transition-[text-decoration-thickness,opacity] duration-150 hover:decoration-2 active:opacity-70 active:decoration-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-50"
                style={{ transitionTimingFunction: 'var(--ease-out)' }}
              >
                <RefreshCcw className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                Retry
              </button>
              <span aria-hidden className="text-ink-faint">·</span>
              <button
                type="button"
                onClick={clearError}
                disabled={streaming}
                className="inline-flex items-center gap-1 font-sans font-medium text-muted-foreground underline decoration-[1.5px] underline-offset-[3px] transition-[text-decoration-thickness,opacity,color] duration-150 hover:decoration-2 hover:text-foreground active:opacity-70 active:decoration-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-50"
                style={{ transitionTimingFunction: 'var(--ease-out)' }}
                aria-label="Dismiss error"
              >
                <X className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                Dismiss
              </button>
            </span>
          </p>
        </div>
      )}

      <Composer onSend={(t) => void doSend(t)} onStop={stop} streaming={streaming} />
    </div>
  );
}
