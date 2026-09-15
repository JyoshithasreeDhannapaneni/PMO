import { describe, it, expect } from '@jest/globals';
import { htmlToReadableText, parseEmailChain } from '../../services/emailChainParser';

describe('htmlToReadableText', () => {
  it('turns <br> and block-closing tags into real newlines instead of collapsing them to spaces', () => {
    const html = '<div>Line one</div><div>Line two<br>Line three</div><p>Line four</p>';
    expect(htmlToReadableText(html)).toBe('Line one\nLine two\nLine three\nLine four');
  });

  it('decodes HTML entities', () => {
    expect(htmlToReadableText('<div>From: X &lt;a@b.com&gt;</div>')).toBe('From: X <a@b.com>');
  });
});

describe('parseEmailChain', () => {
  const topLevel = { name: 'Ryan Lockhart', email: 'rlockhart@entera.ca', timestamp: '2026-08-31T18:38:00Z' };

  it('splits a customer reply from the CloudFuze message it quotes (Outlook-style header)', () => {
    const html = [
      '<div>Thanks, we will use the pairs you suggested.</div>',
      '<div>From: Siva Kota &lt;Siva.Kota@cloudfuze.com&gt;</div>',
      '<div>Sent: Saturday, August 29, 2026 12:00 PM</div>',
      '<div>To: Ryan Lockhart &lt;rlockhart@entera.ca&gt;</div>',
      '<div>Subject: Re: Project Kick off</div>',
      '<div>Hello Ryan, could you share the Teams test pair?</div>',
    ].join('');

    const entries = parseEmailChain(html, topLevel);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ sender: 'customer', email: 'rlockhart@entera.ca' });
    expect(entries[0].body).toBe('Thanks, we will use the pairs you suggested.');
    expect(entries[1]).toMatchObject({ sender: 'cloudfuze', name: 'Siva Kota', email: 'Siva.Kota@cloudfuze.com', timestamp: 'Saturday, August 29, 2026 12:00 PM' });
    expect(entries[1].body).toBe('Hello Ryan, could you share the Teams test pair?');
  });

  it('splits on a Gmail-style "On <date>, <name> <email> wrote:" line', () => {
    const html = [
      '<div>Sure, added the admin account.</div>',
      '<div>On Sat, Aug 29, 2026 at 8:39 AM Chaitanya Gupta &lt;Chaitanya.Gupta@cloudfuze.com&gt; wrote:</div>',
      '<div>Can you add an admin account to the private channel?</div>',
    ].join('');

    const entries = parseEmailChain(html, { name: 'Ryan Finley', email: 'ryan@blackmtx.com', timestamp: null });

    expect(entries).toHaveLength(2);
    expect(entries[0].sender).toBe('customer');
    expect(entries[0].body).toBe('Sure, added the admin account.');
    expect(entries[1]).toMatchObject({ sender: 'cloudfuze', name: 'Chaitanya Gupta', email: 'Chaitanya.Gupta@cloudfuze.com', timestamp: 'Sat, Aug 29, 2026 at 8:39 AM' });
    expect(entries[1].body).toBe('Can you add an admin account to the private channel?');
  });

  it('falls back to a single clean entry when there is no quoted chain to split', () => {
    const html = '<div>Just a plain reply with no history.</div>';
    const entries = parseEmailChain(html, topLevel);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sender: 'customer', email: 'rlockhart@entera.ca' });
    expect(entries[0].body).toBe('Just a plain reply with no history.');
  });

  it('handles a wrapped Cc: recipient list without prematurely ending the header block', () => {
    const html = [
      '<div>See below.</div>',
      '<div>From: Lakshmi Prasanna &lt;Lakshmi.Prasanna@cloudfuze.com&gt;</div>',
      '<div>Sent: Monday, 31 August 2026 08:19:55</div>',
      '<div>To: josh &lt;josh@blackmtx.com&gt;</div>',
      '<div>Cc: Matthew DeChant &lt;matt@bluecurrent.com&gt;; ryan &lt;ryan@blackmtx.com&gt;;</div>',
      '<div>bill &lt;bill@blackmtx.com&gt;; chris &lt;chris@blackmtx.com&gt;</div>',
      '<div>Subject: RE: Blue Current Delta - Issues</div>',
      '<div>Could you share the affected user email address?</div>',
    ].join('');

    const entries = parseEmailChain(html, topLevel);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ sender: 'cloudfuze', name: 'Lakshmi Prasanna', email: 'Lakshmi.Prasanna@cloudfuze.com' });
    expect(entries[1].body).toBe('Could you share the affected user email address?');
  });
});
