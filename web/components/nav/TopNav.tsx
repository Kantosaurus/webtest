import { ThemeToggle } from '@/components/theme/ThemeToggle';

export function TopNav() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-12 max-w-[980px] items-center justify-between px-6 md:px-10">
        <span
          className="flex select-none items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
          aria-label="Live — file scanning, VirusTotal and Gemini"
        >
          <span aria-hidden className="live-dot" />
          File scanning <span aria-hidden className="text-ink-faint">·</span> VirusTotal <span aria-hidden>×</span> Gemini
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
