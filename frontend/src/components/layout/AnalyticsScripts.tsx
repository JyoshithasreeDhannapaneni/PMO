'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

const HOTJAR_ID = process.env.NEXT_PUBLIC_HOTJAR_ID;

// Session-recording analytics capture page URLs; the customer C-SAT page's URL holds the
// survey token (the customer's only credential), so those pages load no analytics at all.
export function AnalyticsScripts() {
  const pathname = usePathname();
  if (pathname?.startsWith('/csat')) return null;

  return (
    <>
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
    </>
  );
}
