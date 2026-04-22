import { ShieldCheck } from 'lucide-react';

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
        <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.75} />
        <span>scanner</span>
      </div>
    </header>
  );
}
