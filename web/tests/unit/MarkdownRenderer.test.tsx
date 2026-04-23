import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MarkdownRenderer } from '../../components/chat/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders plain markdown', () => {
    render(<MarkdownRenderer text="**hello**" />);
    const strong = screen.getByText('hello');
    expect(strong.tagName).toBe('STRONG');
  });

  it('strips raw <script> tags from model output', () => {
    const hostile = 'safe\n\n<script>window.__pwned = true</script>';
    const { container } = render(<MarkdownRenderer text={hostile} />);
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('strips javascript: URLs from links', () => {
    const hostile = '[click me](javascript:alert(1))';
    const { container } = render(<MarkdownRenderer text={hostile} />);
    const link = container.querySelector('a');
    if (link) {
      expect(link.getAttribute('href')?.startsWith('javascript:')).toBeFalsy();
    }
  });
});
