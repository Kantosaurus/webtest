import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      {/* Subtle product mark in a corner — typographic, no gradient */}
      <div className="pointer-events-none absolute left-6 top-6 flex items-center gap-2 text-sm font-medium tracking-tight text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
        scanner
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
