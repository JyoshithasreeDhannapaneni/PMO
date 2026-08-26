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

    const userPrompt = threads.map((t, i) =>
      `Thread ${i + 1} (key: ${t.key}):\nOriginal customer message: "${truncate(t.customerOriginalMessage)}"\nOur reply: "${truncate(t.ourReply)}"\nCustomer follow-up: "${truncate(t.customerFollowUp)}"`
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
      });
      raw = response.choices[0]?.message?.content ?? '';
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message || err?.message || 'Unknown OpenAI error';
      logger.error('Email thread classification: OpenAI call failed:', detail);
      return result; // empty — caller fails closed
    }

    try {
      const parsed = JSON.parse(raw);
      const classifications = Array.isArray(parsed.classifications) ? parsed.classifications : [];
      for (const c of classifications) {
        if (c?.key && ['SAME_ISSUE', 'NEW_TOPIC', 'ACKNOWLEDGMENT'].includes(c.result)) {
          result.set(String(c.key), c.result as ThreadClassification);
        }
      }
    } catch {
      logger.error('Email thread classification: model returned non-JSON response:', raw.slice(0, 300));
    }
    return result;
  },
};
