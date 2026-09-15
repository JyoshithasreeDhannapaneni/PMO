import { describe, it, expect } from '@jest/globals';
import { isExternal } from '../../services/teamConversationTimeline';

describe('isExternal', () => {
  it('is false for CloudFuze staff', () => {
    expect(isExternal('Lakshmi.Prasanna@cloudfuze.com')).toBe(false);
  });

  it('is true for a real customer domain', () => {
    expect(isExternal('matt@bluecurrent.com')).toBe(true);
  });

  it('is false for known system/notification domains (Microsoft/Teams/SharePoint)', () => {
    expect(isExternal('notify@microsoft.com')).toBe(false);
    expect(isExternal('no-reply@teams.microsoft.com')).toBe(false);
  });

  it('is false for Jira/Atlassian notification and suggestion mail, including per-tenant subdomains', () => {
    expect(isExternal('jira@cloudfuze.atlassian.net')).toBe(false);
    expect(isExternal('notifications@atlassian.com')).toBe(false);
  });

  it('is false for LastPass security/notification mail', () => {
    expect(isExternal('support@lastpass.com')).toBe(false);
  });

  it('is false for Claude/Anthropic notification mail', () => {
    expect(isExternal('hello@anthropic.com')).toBe(false);
    expect(isExternal('team@claude.ai')).toBe(false);
  });

  it('is false for generic automated-sender local-parts regardless of domain', () => {
    expect(isExternal('notifications@some-random-saas-tool.io')).toBe(false);
    expect(isExternal('alerts@vendor-x.com')).toBe(false);
    expect(isExternal('mailer-daemon@anything.com')).toBe(false);
    expect(isExternal('postmaster@anything.com')).toBe(false);
  });

  it('is still true for a real customer even when their domain happens to look similar', () => {
    expect(isExternal('ryan@blackmtx.com')).toBe(true);
  });
});
