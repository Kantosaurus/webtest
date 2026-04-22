'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiCallError } from '@/lib/api';
import type { User } from '@/lib/types';

interface Props {
  mode: 'login' | 'register';
}

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      apiFetch<User>(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: () => {
      const from = search.get('from');
      router.replace(from && from.startsWith('/') ? from : '/');
    },
    onError: (e) => {
      if (e instanceof ApiCallError) {
        if (e.status === 409) setErr('An account already exists for that email.');
        else if (e.status === 401) setErr('Invalid email or password.');
        else if (e.status === 400) setErr('Password must be at least 8 characters.');
        else setErr(e.api.message);
      } else {
        setErr('Something went wrong. Please try again.');
      }
    },
  });

  const title = mode === 'login' ? 'Welcome back' : 'Create an account';
  const subtitle =
    mode === 'login'
      ? 'Log in to continue analyzing files.'
      : 'Sign up to start scanning files with VirusTotal and Gemini.';
  const cta = mode === 'login' ? 'Log in' : 'Create account';
  const altText = mode === 'login' ? 'New to scanner?' : 'Already have an account?';
  const altLink = mode === 'login' ? '/register' : '/login';
  const altCta = mode === 'login' ? 'Create an account' : 'Log in';

  return (
    <section aria-labelledby="auth-title" className="space-y-8 animate-in fade-in duration-500">
      <header className="space-y-2">
        <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          mut.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && (
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          )}
        </div>
        {err && (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={mut.isPending} aria-busy={mut.isPending}>
          {mut.isPending ? 'Please wait…' : cta}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {altText}{' '}
        <a className="text-foreground underline-offset-4 hover:underline" href={altLink}>
          {altCta}
        </a>
      </p>
    </section>
  );
}
