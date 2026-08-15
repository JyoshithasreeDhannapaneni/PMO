import OpenAI from 'openai';
import { logger } from '../utils/logger';
import type { TranscriptCue } from './callTranscriptService';

export interface GradedQA {
  question: string;
  askedBy: string;
  answeredBy: string;
  answer: string;
  score: number;      // 0-100
  feedback: string;
}

export interface TranscriptRating {
  overallScore: number; // 0-100
  summary: string;
  qaPairs: GradedQA[];
}

const MAX_TRANSCRIPT_CHARS = 60000; // rough token safety margin for one chat completion

function isConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !!key && !key.startsWith('PASTE_');
}

function formatCue(cue: TranscriptCue): string {
  const mm = Math.floor(cue.startSeconds / 60).toString().padStart(2, '0');
  const ss = Math.floor(cue.startSeconds % 60).toString().padStart(2, '0');
  return `[${mm}:${ss}] ${cue.speaker}: ${cue.text}`;
}

function buildTranscriptText(cues: TranscriptCue[]): { text: string; truncated: boolean } {
  const full = cues.map(formatCue).join('\n');
  if (full.length <= MAX_TRANSCRIPT_CHARS) return { text: full, truncated: false };
  return { text: full.slice(0, MAX_TRANSCRIPT_CHARS), truncated: true };
}

export const transcriptGradingService = {
  isConfigured,

  async gradeTranscript(params: {
    cues: TranscriptCue[];
    internalUserName: string;
    internalUserEmail: string;
    customerNames: string[];
    subject: string;
  }): Promise<TranscriptRating> {
    if (!isConfigured()) {
      throw new Error('OpenAI is not configured (OPENAI_API_KEY missing).');
    }

    const { text, truncated } = buildTranscriptText(params.cues);
    if (truncated) {
      logger.warn(`Transcript grading: transcript truncated to ${MAX_TRANSCRIPT_CHARS} chars for "${params.subject}"`);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const systemPrompt = `You are a call-quality reviewer for a cloud migration company's customer meetings. \
You will be given a timestamped meeting transcript and the name of ONE internal team member to evaluate. \
Your job is ONLY to find moments where a customer (anyone who is not the internal team member being evaluated, \
and not another internal teammate) asked a question or raised a concern, AND the specified internal team member \
answered it. Ignore small talk, scheduling chatter, and questions answered by someone else. \
For each such exchange, quote the question, quote the internal team member's answer, and score the answer \
0-100 on accuracy, completeness, and clarity, with one sentence of specific feedback. \
Then give an overall 0-100 score for that person's performance in this meeting and a 2-3 sentence summary. \
If the transcript contains no question answered by that specific person, return an empty qaPairs array and \
explain why in the summary — do not invent exchanges that are not in the transcript. \
Respond ONLY with JSON matching this shape: \
{"overallScore": number, "summary": string, "qaPairs": [{"question": string, "askedBy": string, "answeredBy": string, "answer": string, "score": number, "feedback": string}]}`;

    const userPrompt = `Meeting subject: ${params.subject}
Internal team member to evaluate: ${params.internalUserName} (${params.internalUserEmail})
Customer attendees: ${params.customerNames.join(', ') || 'unknown'}
${truncated ? '(Note: transcript was truncated to fit — evaluate only the portion provided.)\n' : ''}
Transcript:
${text}`;

    let raw: string;
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      raw = response.choices[0]?.message?.content ?? '';
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message || err?.message || 'Unknown OpenAI error';
      logger.error('Transcript grading: OpenAI call failed:', detail);
      throw new Error(`OpenAI grading failed: ${detail}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.error('Transcript grading: model returned non-JSON response:', raw.slice(0, 500));
      throw new Error('OpenAI returned a response that could not be parsed as JSON.');
    }

    const qaPairs: GradedQA[] = Array.isArray(parsed.qaPairs)
      ? parsed.qaPairs.map((qa: any) => ({
          question: String(qa.question ?? ''),
          askedBy: String(qa.askedBy ?? ''),
          answeredBy: String(qa.answeredBy ?? params.internalUserName),
          answer: String(qa.answer ?? ''),
          score: Math.max(0, Math.min(100, Number(qa.score) || 0)),
          feedback: String(qa.feedback ?? ''),
        }))
      : [];

    return {
      overallScore: Math.max(0, Math.min(100, Number(parsed.overallScore) || 0)),
      summary: String(parsed.summary ?? ''),
      qaPairs,
    };
  },
};
