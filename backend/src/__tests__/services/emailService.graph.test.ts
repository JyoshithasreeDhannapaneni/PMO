// Value: protects=a Graph refusal surfaces as GraphSendError with its HTTP status (the C-SAT shared-mailbox fallback keys on 403/404), and a send-as message goes to the right mailbox with Reply-To and no Sent Items copy;
//   fails_when=sendViaGraph throws a plain Error, drops the status, or stops honoring from/replyTo; why_new=new behavior; seam=global fetch
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { cloudfuzeLogoImage, customerEmail, emailService, GraphSendError } from '../../services/emailService';

type FetchCall = [string, { body?: string }];
const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();

beforeEach(() => {
  mockFetch.mockReset();
  process.env.MICROSOFT_CLIENT_ID = 'id';
  process.env.MICROSOFT_CLIENT_SECRET = 'secret';
  process.env.MICROSOFT_TENANT_ID = 'tenant';
  (global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) });
});

describe('emailService Graph send', () => {
  it('surfaces a Graph refusal as GraphSendError with the HTTP status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'ErrorAccessDenied' });
    const err = await emailService.sendEmail({ to: 'c@acme.com', subject: 's', html: 'h', from: 'pm@cloudfuze.com' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphSendError);
    expect((err as GraphSendError).status).toBe(403);
  });

  it('sends as the given mailbox with Reply-To and keeps no Sent Items copy', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 202, text: async () => '' });
    await emailService.sendEmail({ to: 'c@acme.com', subject: 's', html: 'h', from: 'p.m+x@cloudfuze.com', replyTo: 'p.m+x@cloudfuze.com' });
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as FetchCall;
    expect(url).toContain(`/users/${encodeURIComponent('p.m+x@cloudfuze.com')}/sendMail`);
    const body = JSON.parse(init.body || '{}');
    expect(body.saveToSentItems).toBe(false);
    expect(body.message.replyTo[0].emailAddress.address).toBe('p.m+x@cloudfuze.com');
    expect(body.message.attachments).toBeUndefined();
  });

  it('attaches inline images so cid: references render, e.g. the CloudFuze logo', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 202, text: async () => '' });
    const logo = cloudfuzeLogoImage();
    await emailService.sendEmail({ to: 'c@acme.com', subject: 's', html: customerEmail('Hi', '<p>x</p>'), inlineImages: [logo] });
    const [, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as FetchCall;
    const body = JSON.parse(init.body || '{}');
    expect(body.message.body.content).toContain(`cid:${logo.contentId}`);
    expect(body.message.attachments).toEqual([
      expect.objectContaining({ '@odata.type': '#microsoft.graph.fileAttachment', contentId: logo.contentId, isInline: true, contentType: 'image/png', contentBytes: logo.contentBase64 }),
    ]);
    expect(Buffer.from(logo.contentBase64, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });
});
