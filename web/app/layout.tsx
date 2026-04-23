import type { Metadata } from 'next';
import { Bricolage_Grotesque, Literata, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  // Load the width axis so the subtle `breathe-width` font-stretch animation
  // on the hero's first line has something to interpolate.
  axes: ['wdth'],
});

const literata = Literata({
  subsets: ['latin'],
  variable: '--font-literata',
  display: 'swap',
  style: ['normal', 'italic'],
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'What is this file, really? — VirusTotal × Gemini scanner',
  description:
    'Upload a file up to 32 MB and watch a VirusTotal scan stream in live. A Gemini-powered assistant explains the verdict — what engines flagged, what family of threat it looks like, and what to do next — in plain language. Nothing is stored.',
};

// Applied before hydration to prevent a flash of the wrong theme.
// Default is paper-light; the .dark class is added only if the user has opted in.
const NO_FLASH = `try{var t=localStorage.getItem("theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${literata.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
