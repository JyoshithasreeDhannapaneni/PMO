// Value: protects=raw C-SAT survey tokens (the customer's only credential) never reach request logs or incidents;
//   fails_when=the redaction pattern stops matching the token path; why_new=new helper; seam=none
import { describe, it, expect } from '@jest/globals';
import { redactSecrets } from '../../utils/redact';

describe('redactSecrets', () => {
  it('replaces C-SAT survey tokens in paths and log lines', () => {
    const t = 'c'.repeat(64);
    expect(redactSecrets(`GET /api/csat/${t} HTTP/1.1`)).toBe('GET /api/csat/[redacted] HTTP/1.1');
    expect(redactSecrets(`https://pmo.example.com/csat/${t.toUpperCase()}?x=1`)).toBe('https://pmo.example.com/csat/[redacted]?x=1');
  });

  it('leaves other paths alone', () => {
    expect(redactSecrets('GET /api/projects/123')).toBe('GET /api/projects/123');
  });
});
