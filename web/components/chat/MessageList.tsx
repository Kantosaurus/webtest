'use client';
import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import type { Message } from '@/lib/types';
import { MessageTurn, SEED_CONTENT } from './MessageBubble';

export function MessageList({
  messages,
  streamingDraft,
}: {
  messages: Message[];
  streamingDraft: string | null;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(true);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      setStuck(nearBottom);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    if (!stuck) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingDraft, stuck]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setStuck(true);
  };

  // Hide the auto-seeded user question — the reader arrives mid-article.
  const visible = messages.filter(
    (m) => !(m.role === 'user' && m.content === SEED_CONTENT),
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-6 py-6 md:px-10"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="mx-auto max-w-[720px]">
          {visible.length === 0 && !streamingDraft && (
            <p className="py-16 text-center font-serif text-[0.9375rem] italic text-muted-foreground">
              Ask the assistant about this scan — try <em>is this dangerous?</em> or <em>who is behind it?</em>
            </p>
          )}
          {visible.map((m) => (
            <MessageTurn
              key={m.id}
              role={m.role}
              content={m.content}
              createdAt={m.createdAt}
            />
          ))}
          {streamingDraft && (
            <MessageTurn
              role="assistant"
              content={streamingDraft}
              createdAt={new Date().toISOString()}
              streaming
            />
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={jumpToBottom}
        data-state={stuck ? 'closed' : 'open'}
        aria-hidden={stuck}
        tabIndex={stuck ? -1 : 0}
        className="jump-to-latest absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 text-[0.75rem] font-medium text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground active:scale-[0.95] active:duration-75 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        <ArrowDown className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        Jump to latest
      </button>
    </div>
  );
}
