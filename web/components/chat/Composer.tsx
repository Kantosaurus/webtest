'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
}

export function Composer({ onSend, onStop, streaming }: Props) {
  const [value, setValue] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const t = value.trim();
    if (!t || streaming) return;
    onSend(t);
    setValue('');
  };

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-md border border-border bg-background p-2 focus-within:ring-1 focus-within:ring-ring"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={streaming ? 'Generating…' : 'Ask about this scan…'}
        aria-label="Message"
        className="min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        disabled={streaming}
      />
      {streaming ? (
        <Button type="button" variant="outline" size="icon" onClick={onStop} aria-label="Stop generating">
          <Square className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      ) : (
        <Button type="submit" size="icon" aria-label="Send" disabled={!value.trim()}>
          <Send className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      )}
    </form>
  );
}
