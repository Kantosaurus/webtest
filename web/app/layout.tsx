import type { Metadata } from 'next';
import { Commissioner, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const commissioner = Commissioner({
  subsets: ['latin'],
  variable: '--font-commissioner',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VirusTotal Scanner',
  description: 'Scan files and get AI-powered explanations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${commissioner.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
