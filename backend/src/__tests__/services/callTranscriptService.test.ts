import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = jest.mocked(axios, { shallow: false });

// Imported once, outside jest.resetModules() reach — this file never resets the module
// registry (process.env is read at call time by the service, not at import time, so
// there's no need to), which keeps this reference and the service's internal `axios`
// reference pointing at the exact same automock instance throughout.
const { callTranscriptService, ExternalOrganizerError } = require('../../services/callTranscriptService');

describe('callTranscriptService — organizer-domain guard', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      MS_GRAPH_TENANT_ID: 'test-tenant',
      MS_GRAPH_CLIENT_ID: 'test-client',
      MS_GRAPH_CLIENT_SECRET: 'test-secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws ExternalOrganizerError for a non-CloudFuze organizer WITHOUT calling Graph at all', async () => {
    await expect(
      callTranscriptService.getTranscriptCues('customer@example.com', 'https://teams.microsoft.com/l/meetup-join/abc')
    ).rejects.toBeInstanceOf(ExternalOrganizerError);

    // The guard must fire before any network call — never spend a token fetch on a
    // call we already know is permanently ungradable.
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('is case-insensitive on the organizer domain check', async () => {
    await expect(
      callTranscriptService.getTranscriptCues('Person@CustomerCompany.COM', 'https://teams.microsoft.com/l/meetup-join/abc')
    ).rejects.toBeInstanceOf(ExternalOrganizerError);
  });

  it('does NOT throw ExternalOrganizerError for a cloudfuze.com organizer — proceeds to the real Graph call instead', async () => {
    // Mock the token fetch to succeed, then let the next Graph call fail with a distinct
    // marker so we can prove the guard let it through without needing to mock the entire
    // onlineMeetings/transcript-fetch/VTT-parsing chain.
    mockedAxios.post.mockResolvedValue({ data: { access_token: 'fake-token' } } as any);
    const mockGet = jest.fn<() => Promise<any>>().mockRejectedValue(new Error('MARKER: reached real Graph call'));
    mockedAxios.create.mockReturnValue({ get: mockGet } as any);

    await expect(
      callTranscriptService.getTranscriptCues('pm@cloudfuze.com', 'https://teams.microsoft.com/l/meetup-join/abc')
    ).rejects.toThrow('MARKER: reached real Graph call');

    // Explicitly not an ExternalOrganizerError — proves the guard passed it through.
    await expect(
      callTranscriptService.getTranscriptCues('pm@cloudfuze.com', 'https://teams.microsoft.com/l/meetup-join/abc')
    ).rejects.not.toBeInstanceOf(ExternalOrganizerError);
  });
});
