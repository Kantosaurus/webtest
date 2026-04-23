'use client';
import * as React from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
}

export function Composer({ onSend, onStop, streaming }: Props) {
  const [value, setValue] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = React.useCallback(() => {
    const t = value.trim();
    if (!t || streaming) return;
    onSend(t);
    setValue('');
  }, [value, streaming, onSend]);

  // Auto-resize the textarea up to ~8 lines.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Global shortcut: `/` focuses the composer (Linear/Slack convention).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const active = document.activeElement as HTMLElement | null;
      const isEditable =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);
      if (isEditable) return;
      e.preventDefault();
      textareaRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-t border-border bg-background px-6 py-4 md:px-10"
    >
      <div className="mx-auto flex max-w-[720px] items-end gap-3">
        <div className="composer-field group relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                // Cmd/Ctrl+Enter is the explicit power-user submit too.
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={streaming ? 'Generating…' : 'Ask a follow-up…'}
            aria-label="Message the assistant"
            disabled={streaming}
            className="block min-h-[40px] w-full resize-none rounded-md border border-border bg-surface-alt px-4 py-2.5 text-[0.9375rem] leading-[1.45] text-foreground placeholder:text-ink-faint focus:outline-none focus-visible:border-[var(--ring)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--ring)] disabled:opacity-60"
            style={{ transitionTimingFunction: 'var(--ease-out)' }}
          />
          <kbd
            aria-hidden
            className="composer-kbd absolute bottom-2.5 right-3 hidden font-mono text-[0.625rem] uppercase tracking-wider text-ink-faint md:inline-block"
          >
            ↵
          </kbd>
        </div>

        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.95] active:duration-75 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            style={{ transitionTimingFunction: 'var(--ease-out)' }}
          >
            <Square className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send message"
            title="Send message"
            disabled={!value.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.95] active:duration-75 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            style={{ transitionTimingFunction: 'var(--ease-out)' }}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>
    </form>
  );
}
