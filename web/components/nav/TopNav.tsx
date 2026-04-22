'use client';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';

export function TopNav() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/api/auth/me'),
    retry: false,
  });
  const logout = useMutation({
    mutationFn: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      router.replace('/login');
      router.refresh();
    },
  });
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
        scanner
      </div>
      <div className="flex items-center gap-4">
        {user && <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>}
        <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? 'Logging out…' : 'Log out'}
        </Button>
      </div>
    </header>
  );
}
