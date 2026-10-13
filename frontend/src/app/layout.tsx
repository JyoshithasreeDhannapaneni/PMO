import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AnalyticsScripts } from '@/components/layout/AnalyticsScripts';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Neutara PMO Tracker - Project Migration Tracking System',
  description: 'Track and manage project migrations with ease',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${inter.className} bg-slate-100 text-slate-900 antialiased`}>
        <AnalyticsScripts />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
