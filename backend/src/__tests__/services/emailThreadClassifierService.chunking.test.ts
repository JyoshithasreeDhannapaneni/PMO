// Value: protects=a week with hundreds of ambiguous follow-ups is still classified (chunked requests), and one failed chunk does not mark every thread reopened;
//   fails_when=all threads go into one oversized request again, or a chunk failure discards the other chunks' results; why_new=chunking is new; seam=none
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockCreate = jest.fn<(req: { messages: { role: string; content: string }[] }) => Promise<unknown>>();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { emailThreadClassifierService } from '../../services/emailThreadClassifierService';

const threads = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, customerOriginalMessage: 'q', ourReply: 'a', customerFollowUp: 'f' }));
const keysIn = (req: { messages: { role: string; content: string }[] }) => [...req.messages[1].content.matchAll(/\(key: (t\d+)\)/g)].map((m) => m[1]);

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  mockCreate.mockReset();
});

describe('emailThreadClassifierService.classify', () => {
  it('splits a large week into chunks of at most 40 threads and merges the results', async () => {
    mockCreate.mockImplementation(async (req) => ({
      choices: [{ message: { content: JSON.stringify({ classifications: keysIn(req).map((key) => ({ key, result: 'NEW_TOPIC' })) }) } }],
    }));
    const result = await emailThreadClassifierService.classify(threads(100));
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(Math.max(...mockCreate.mock.calls.map((c) => keysIn(c[0]).length))).toBeLessThanOrEqual(40);
    expect(result.size).toBe(100);
  });

  it('keeps the other chunks when one chunk fails', async () => {
    mockCreate
      .mockImplementationOnce(async () => { throw new Error('context length exceeded'); })
      .mockImplementation(async (req) => ({
        choices: [{ message: { content: JSON.stringify({ classifications: keysIn(req).map((key) => ({ key, result: 'ACKNOWLEDGMENT' })) }) } }],
      }));
    const result = await emailThreadClassifierService.classify(threads(80));
    expect(result.size).toBe(40);
    expect(result.has('k0')).toBe(false);
    expect(result.get('k79')).toBe('ACKNOWLEDGMENT');
  });
});
