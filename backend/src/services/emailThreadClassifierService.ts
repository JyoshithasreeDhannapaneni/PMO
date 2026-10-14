import OpenAI from 'openai';
import { logger } from '../utils/logger';

// Option C (2026-08-26 email hygiene redesign) — only reached for follow-up messages that
// already survived the free heuristic filters (isLikelyAcknowledgment / gap check) in
// emailHygieneService.ts, so this is the small, genuinely-ambiguous remainder, not every
// reopened thread. One batched OpenAI call per user per sync (not one call per thread), to
// keep this bounded and cheap.
export type ThreadClassification = 'SAME_ISSUE' | 'NEW_TOPIC' | 'ACKNOWLEDGMENT';

export interface AmbiguousThread {
  key: string; // caller-defined id to map the result back (e.g. `${convId}:${msgIndex}`)
  customerOriginalMessage: string;
  ourReply: string;
  customerFollowUp: string;
}

const CLASSIFY_CHUNK_SIZE = 40;
const MAX_FIELD_CHARS = 600; // keep the batch prompt small — this only needs enough context to judge topic continuity, not the full message

function isConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !!key && !key.startsWith('PASTE_');
}

function truncate(text: string): string {
  return text.length > MAX_FIELD_CHARS ? text.slice(0, MAX_FIELD_CHARS) + '…' : text;
}

export const emailThreadClassifierService = {
  isConfigured,

  // Returns a classification per thread key. On any failure (not configured, API error,
  // bad response), returns an EMPTY map — callers must fail closed (treat unclassified
  // threads as SAME_ISSUE / still reopened) rather than assume resolution, since silently
  // defaulting to "resolved" on failure would quietly inflate scores.
  async classify(threads: AmbiguousThread[]): Promise<Map<string, ThreadClassification>> {
    const result = new Map<string, ThreadClassification>();
    if (threads.length === 0 || !isConfigured()) return result;

    // Since the 2026-10-14 mailbox-fetch fix a week has hundreds of ambiguous threads; one
    // request for all of them failed outright, and failing closed then marked every one
    // "reopened" (Resolution near 0 for everyone). Chunked, a failure only affects its chunk.
    if (threads.length > CLASSIFY_CHUNK_SIZE) {
      for (let i = 0; i < threads.length; i += CLASSIFY_CHUNK_SIZE) {
        const part = await emailThreadClassifierService.classify(threads.slice(i, i + CLASSIFY_CHUNK_SIZE));
        part.forEach((value, key) => result.set(key, value));
      }
      return result;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const systemPrompt = `You classify customer email follow-ups for a cloud migration company's support/account team. \
For each numbered thread you are given the customer's original message, the internal team member's reply, and the \
customer's follow-up message that arrived afterward IN THE SAME EMAIL THREAD (same subject line). Customers often \
reuse an old thread to ask something unrelated rather than starting a new email — your job is to tell that apart from \
a genuine continuation of the same unresolved issue. Classify each follow-up as exactly one of: \
"SAME_ISSUE" (still discussing, disputing, or asking for more on the original topic — genuinely still open), \
"NEW_TOPIC" (a different question, request, or subject than the original message, even though it's the same thread), \
"ACKNOWLEDGMENT" (a closing remark with no real new content, e.g. thanks/confirmation, that the heuristic filter missed). \
Respond ONLY with JSON: {"classifications": [{"key": string, "result": "SAME_ISSUE"|"NEW_TOPIC"|"ACKNOWLEDGMENT"}]}`;

    // Short labels instead of the caller's keys: real keys are two ~150-character Graph ids,
    // and having the model copy 40 of them back made responses slow and often invalid JSON.
    const labelFor = (i: number) => `t${i + 1}`;
    const keyByLabel = new Map(threads.map((t, i) => [labelFor(i), t.key]));
    const userPrompt = threads.map((t, i) =>
      `Thread ${i + 1} (key: ${labelFor(i)}):\nOriginal customer message: "${truncate(t.customerOriginalMessage)}"\nOur reply: "${truncate(t.ourReply)}"\nCustomer follow-up: "${truncate(t.customerFollowUp)}"`
    ).join('\n---\n');

    let raw: string;
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 40 * threads.length + 200,
      });
      raw = response.choices[0]?.message?.content ?? '';
      if (response.choices[0]?.finish_reason === 'length') {
        logger.warn(`Email thread classification: response cut off for ${threads.length} threads`);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message || err?.message || 'Unknown OpenAI error';
      logger.error(`Email thread classification: OpenAI call failed for ${threads.length} threads: ${detail}`);
      return result; // empty — caller fails closed
    }

    try {
      const parsed = JSON.parse(raw);
      const classifications = Array.isArray(parsed.classifications) ? parsed.classifications : [];
      for (const c of classifications) {
        const key = keyByLabel.get(String(c?.key));
        if (key && ['SAME_ISSUE', 'NEW_TOPIC', 'ACKNOWLEDGMENT'].includes(c.result)) {
          result.set(key, c.result as ThreadClassification);
        }
      }
    } catch {
      logger.error(`Email thread classification: model returned non-JSON response: ${raw.slice(0, 300)}`);
    }
    return result;
  },
};
