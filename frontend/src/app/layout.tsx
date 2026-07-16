import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'PMO Tracker - Project Migration Tracking System',
  description: 'Track and manage project migrations with ease',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${inter.className} bg-slate-100 text-slate-900 antialiased`}>
        <Script src="https://t.contentsquare.net/uxa/5411aa7cee4a7.js" strategy="afterInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
