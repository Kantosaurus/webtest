import { MarkdownRenderer } from './MarkdownRenderer';

function formatTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

export function MessageTurn({
  role,
  content,
  createdAt,
  streaming = false,
}: {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  streaming?: boolean;
}) {
  const time = formatTime(createdAt);

  if (role === 'assistant') {
    return (
      <article className="turn-assistant border-t border-border pb-8 pt-7 first:border-t-0 first:pt-2">
        <header className="mb-3 flex items-baseline gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
          <span>Assistant</span>
          {time && <span aria-hidden>·</span>}
          {time && <span>{time}</span>}
        </header>
        <div className="scan-prose max-w-[65ch] font-serif">
          <MarkdownRenderer text={content} />
          {streaming && <span aria-hidden className="stream-caret" />}
        </div>
      </article>
    );
  }

  return (
    <div className="turn-user flex justify-end pb-2 pt-3">
      <p className="max-w-[55ch] font-serif text-[0.9375rem] italic leading-[1.6] text-muted-foreground">
        {time && (
          <span className="mr-2 font-mono text-[0.6875rem] not-italic text-ink-faint">{time}</span>
        )}
        <span aria-hidden className="mr-2 not-italic text-ink-faint">—</span>
        {content}
      </p>
    </div>
  );
}

/**
 * The auto-seed question we fire at mount. Exported so MessageList can hide
 * this specific turn from the rendered transcript — the reader arrives
 * mid-article, not mid-question.
 */
export const SEED_CONTENT = 'Please explain this scan result in plain language.';
