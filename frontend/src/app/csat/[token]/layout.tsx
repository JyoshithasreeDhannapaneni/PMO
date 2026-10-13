import type { Metadata } from 'next';

// The survey link's token is the customer's only credential: keep it out of Referer headers and search indexes.
export const metadata: Metadata = {
  title: 'Customer Satisfaction Survey - CloudFuze',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function CsatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
