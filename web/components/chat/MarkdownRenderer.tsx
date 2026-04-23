'use client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

/**
 * Editorial prose renderer. Body copy is Literata serif (via the wrapper's
 * font-serif); headings shift to Bricolage sans for a magazine pairing; code
 * and tabular data use Geist Mono.
 */
export function MarkdownRenderer({ text }: { text: string }) {
  return (
    <div
      className={[
        'prose prose-sm max-w-none dark:prose-invert',
        // body
        'prose-p:my-3 prose-p:text-[1.0625rem] prose-p:leading-[1.65] prose-p:text-foreground',
        // headings (break out of the serif, into Bricolage sans)
        'prose-headings:font-sans prose-headings:font-[550] prose-headings:tracking-tight',
        'prose-h1:text-[1.5rem] prose-h2:text-[1.25rem] prose-h3:text-[1.0625rem]',
        'prose-h1:mt-6 prose-h1:mb-3 prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-5 prose-h3:mb-2',
        // lists
        'prose-li:my-1 prose-li:text-[1.0625rem] prose-li:leading-[1.6] prose-li:text-foreground',
        // inline code + code blocks
        'prose-code:font-mono prose-code:text-[0.85em] prose-code:rounded-sm prose-code:bg-surface-alt prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:my-4 prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-surface-alt prose-pre:text-foreground',
        // links
        'prose-a:text-primary prose-a:underline prose-a:decoration-[1.5px] prose-a:underline-offset-[3px] prose-a:font-normal hover:prose-a:decoration-2',
        // emphasis
        'prose-strong:font-[600] prose-strong:text-foreground',
        'prose-em:italic',
        // blockquote
        'prose-blockquote:font-serif prose-blockquote:italic prose-blockquote:text-muted-foreground prose-blockquote:border-border',
      ].join(' ')}
    >
      {/* Do NOT add `rehype-raw` here — it would allow raw HTML from model
          output, which is a source of XSS issues. react-markdown's default
          pipeline sanitizes; invariants are locked in
          tests/unit/MarkdownRenderer.test.tsx. */}
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </Markdown>
    </div>
  );
}
