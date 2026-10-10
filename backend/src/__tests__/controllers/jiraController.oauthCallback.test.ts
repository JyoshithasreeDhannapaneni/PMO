import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('../../services/jiraService', () => ({}));
jest.mock('../../services/jiraExcelService', () => ({}));
const mockConsume = jest.fn((_state: unknown) => false);
const mockExchange = jest.fn(async (_code: string) => ({ connectedAs: 'someone' }));
jest.mock('../../services/jiraOAuthService', () => ({
  isOAuthConfigured: jest.fn(() => true),
  isOAuthConnected: jest.fn(() => false),
  loadTokens: jest.fn(() => null),
  getAuthorizationUrl: jest.fn(() => 'https://auth.atlassian.com/authorize?state=s'),
  consumeAuthorizationState: mockConsume,
  exchangeCodeForTokens: mockExchange,
  revokeTokens: jest.fn(),
}));

import { jiraController } from '../../controllers/jiraController';

async function callback(query: Record<string, string>) {
  const redirect = jest.fn();
  jiraController.oauthCallback({ query } as unknown as Request, { redirect } as unknown as Response, jest.fn() as unknown as NextFunction);
  await new Promise((r) => setImmediate(r));
  return String(redirect.mock.calls[0]?.[0] ?? '');
}

describe('jiraController.oauthCallback (public route)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('refuses a code whose state was not issued by an admin connect, without exchanging it', async () => {
    mockConsume.mockReturnValueOnce(false);
    const url = await callback({ code: 'attacker-code', state: 'jira-oauth-connect' });
    expect(url).toContain('reason=invalid_state');
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('exchanges the code when the state is valid', async () => {
    mockConsume.mockReturnValueOnce(true);
    const url = await callback({ code: 'good-code', state: 'issued' });
    expect(mockConsume).toHaveBeenCalledWith('issued');
    expect(mockExchange).toHaveBeenCalledWith('good-code');
    expect(url).toContain('jira_oauth=success');
  });
});
