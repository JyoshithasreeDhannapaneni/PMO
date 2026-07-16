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

const HOTJAR_ID = process.env.NEXT_PUBLIC_HOTJAR_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${inter.className} bg-slate-100 text-slate-900 antialiased`}>
        <Script src="https://t.contentsquare.net/uxa/5411aa7cee4a7.js" strategy="afterInteractive" />
        {HOTJAR_ID && (
          <Script id="hotjar" strategy="afterInteractive">
            {`(function(h,o,t,j,a,r){
              h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
              h._hjSettings={hjid:${HOTJAR_ID},hjsv:6};
              a=o.getElementsByTagName('head')[0];
              r=o.createElement('script');r.async=1;
              r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
              a.appendChild(r);
            })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}
          </Script>
        )}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
