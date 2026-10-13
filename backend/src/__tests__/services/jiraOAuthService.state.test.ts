import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { getAuthorizationUrl, consumeAuthorizationState } from '../../services/jiraOAuthService';

const stateFrom = (url: string) => new URL(url).searchParams.get('state');

describe('Jira OAuth state (public callback must not accept foreign codes)', () => {
  it('rejects the old fixed state and arbitrary values', () => {
    expect(consumeAuthorizationState('jira-oauth-connect')).toBe(false);
    expect(consumeAuthorizationState('')).toBe(false);
    expect(consumeAuthorizationState(undefined)).toBe(false);
    expect(consumeAuthorizationState(['a', 'b'])).toBe(false);
  });

  it('accepts a state issued by getAuthorizationUrl exactly once', () => {
    const state = stateFrom(getAuthorizationUrl());
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(consumeAuthorizationState(state)).toBe(true);
    expect(consumeAuthorizationState(state)).toBe(false);
  });

  it('issues a different state for every connect attempt', () => {
    expect(stateFrom(getAuthorizationUrl())).not.toBe(stateFrom(getAuthorizationUrl()));
  });

  it('expires states after ten minutes', () => {
    const realNow = Date.now;
    try {
      const state = stateFrom(getAuthorizationUrl());
      Date.now = () => realNow() + 11 * 60 * 1000;
      expect(consumeAuthorizationState(state)).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });
});
