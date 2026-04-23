'use client';
import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'light' ? 'Switch to graphite theme' : 'Switch to paper theme';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-theme={theme}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.92] active:duration-75 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      <Moon className="theme-icon theme-icon-moon h-4 w-4" strokeWidth={1.5} aria-hidden />
      <Sun className="theme-icon theme-icon-sun h-4 w-4" strokeWidth={1.5} aria-hidden />
    </button>
  );
}
