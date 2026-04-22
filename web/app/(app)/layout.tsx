import type { ReactNode } from 'react';
import { TopNav } from '@/components/nav/TopNav';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-10 animate-in fade-in duration-300">
        {children}
      </main>
    </div>
  );
}
