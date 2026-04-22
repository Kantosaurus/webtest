'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowDown } from 'lucide-react';
import type { Message } from '@/lib/types';
import { MessageBubble } from './MessageBubble';

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
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
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

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="max-h-[480px] space-y-3 overflow-y-auto px-1 py-2 scroll-smooth"
      >
        {messages.length === 0 && !streamingDraft && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Ask the assistant to explain this scan.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {streamingDraft && <MessageBubble role="assistant" content={streamingDraft} />}
      </div>
      {!stuck && (
        <Button
          variant="outline"
          size="sm"
          onClick={jumpToBottom}
          className="absolute bottom-2 right-2 shadow-sm"
        >
          <ArrowDown className="mr-1 h-3 w-3" strokeWidth={1.75} />
          Jump to latest
        </Button>
      )}
    </div>
  );
}
