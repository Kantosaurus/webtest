import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VirusTotal Scanner',
  description: 'Scan files and get AI-powered explanations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
