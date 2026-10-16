import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import axios from 'axios';
import OpenAI from 'openai';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { ActivityItem, activityForCompany } from './accountTrackerHubspot';
import { htmlToText, lower, todayIst, trim } from './accountTrackerRules';
import {
  AiKind, AiRecord, CompanyRecord, DealRecord, addAiSpend, aiRecords, aiSpend, companiesOf, dealsOf, saveAiFailure,
  saveAiResult,
} from './accountTrackerStore';

// Customer Success → Account Tracker AI analyst (OpenAI, gpt-6-luna by default). Runs after every sync (manual or the
// 15-minute refresh) and stores its results in cs_tracker_ai with a fingerprint of the inputs used, so the same input
// is never sent twice.
//
//   account  one call per company: HubSpot record + email/domain (DNS) records + the company's own website + its deals
//            + latest logged activity → profile, MSP, CloudFuze fit, tech stack, buying signals, conversation summary,
//            next action, outreach. When the website cannot be read, one web search fills in what the company does
//            (stored and reused until the company record changes). Redone at once when the company record changes;
//            when only activity changes (calls/meetings/notes/deals, emails in steps of 5), at most once a day.
//   deals    one call per person: their deals → win/loss patterns, deals at risk, next best actions. At most daily.
// Connect probability is calculated from real replies (connectStats), never generated. Every call's cost is metered
// against a monthly budget per person (CS_TRACKER_AI_BUDGET_PER_COMPANY, default $0.01 per company per month).

const PROMPT_VERSION = 'v9';
const DEFAULT_MODEL = 'gpt-6-luna';
// Flex requests can wait minutes for capacity, so more run side by side; standard requests are fast.
const CONCURRENCY = { flex: 12, standard: 4 };
const DAY_MS = 24 * 3600 * 1000;
const RETRY_FAILED_AFTER_MS = 6 * 3600 * 1000;
const EMAIL_STEP = 5;
const ACTIVITY_BODY_MAX = 900;
const ACTIVITY_TEXT_BUDGET = 20_000;
const HOMEPAGE_TEXT_MAX = 3500;
const SECOND_PAGE_TEXT_MAX = 1500;
const RESEARCH_TEXT_MAX = 2500;
const MIN_EMAIL_WORDS = 25;

// ---------- cost: model prices, the monthly cap ----------

const SEARCH_FEE_USD = 0.01;
const DEFAULT_BUDGET_PER_COMPANY = 0.01;
const MIN_BOOK_BUDGET = 0.5;
// Planning estimates (measured on Flex: ~$0.0027 per brief at high effort, ~$0.011 per web research) kept on the high
// side, so the book reserves enough for every company's brief before it spends on research, and stays under budget.
const BRIEF_COST_ESTIMATE = 0.004;
const RESEARCH_COST_ESTIMATE = 0.015;
const BUDGET_USE_SHARE = 0.9;
const MSP_CANDIDATE = /information technology|computer|software|consult|telecom|network|internet|wireless|security|outsourc/i;
// Standard USD per 1M tokens [input, cached input, output]. An unlisted model is priced high so the monthly cap errs on
// the safe side.
const PRICES: Record<string, [number, number, number]> = {
  'gpt-6-luna': [0.10, 0.01, 0.50],
  'gpt-5.6-luna': [0.20, 0.02, 1.20],
  'gpt-5.4-nano': [0.20, 0.02, 1.25],
  'gpt-5.4-mini': [0.75, 0.075, 4.50],
  'gpt-5-mini': [0.25, 0.025, 2.00],
  'gpt-4.1-mini': [0.40, 0.10, 1.60],
  'gpt-4o-mini': [0.15, 0.075, 0.60],
};
const UNKNOWN_PRICE: [number, number, number] = [5, 0.5, 30];
// The AI runs in the background after a sync, so it uses OpenAI's Flex tier (half price, slower) where the model has it.
const FLEX_MODELS = new Set(['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.4-mini', 'gpt-5-mini']);
const baseModel = (model: string): string => model.replace(/-\d{4}-\d{2}-\d{2}$/, '');

export interface CallUsage {
  input: number;
  cached?: number;
  output: number;
  searches?: number;
  flex?: boolean;
}

export function costUsd(model: string, u: CallUsage): number {
  const [inPrice, cachedPrice, outPrice] = PRICES[baseModel(model)] ?? UNKNOWN_PRICE;
  const cached = Math.min(u.cached ?? 0, u.input);
  const tokens = ((u.input - cached) * inPrice + cached * cachedPrice + u.output * outPrice) / 1_000_000;
  return tokens * (u.flex ? 0.5 : 1) + (u.searches ?? 0) * SEARCH_FEE_USD;
}

export function monthlyBudget(companies: number): number {
  const perCompany = Number(process.env.CS_TRACKER_AI_BUDGET_PER_COMPANY);
  return Math.max(MIN_BOOK_BUDGET, companies * (perCompany > 0 ? perCompany : DEFAULT_BUDGET_PER_COMPANY));
}

export const aiModel = (): string => trim(process.env.CS_TRACKER_AI_MODEL) ?? DEFAULT_MODEL;
export const aiConfigured = (): boolean => {
  const key = trim(process.env.OPENAI_API_KEY);
  return !!key && !key.startsWith('PASTE_');
};
// gpt-4* models take a temperature; the newer reasoning models only take a reasoning effort.
const isReasoningModel = (): boolean => !/^gpt-4/i.test(aiModel());
const flexAvailable = (): boolean => FLEX_MODELS.has(baseModel(aiModel()));

let client: OpenAI | null = null;
const openai = (): OpenAI => {
  // Flex requests queue for spare capacity, so they get a long timeout.
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 3, timeout: 15 * 60_000 });
  return client;
};

/** Flex first; when Flex has no capacity (429/408/503, not charged), the same request at standard price. */
async function withFlex<T>(call: (tier: 'flex' | undefined) => Promise<T>): Promise<T> {
  if (!flexAvailable()) return call(undefined);
  try {
    return await call('flex');
  } catch (e) {
    const busy = e instanceof OpenAI.APIError && [408, 429, 503].includes(e.status ?? 0) && e.code !== 'insufficient_quota';
    if (!busy) throw e;
    return call(undefined);
  }
}

// ---------- output shapes (enforced with OpenAI structured outputs, strict mode) ----------

type Level = 'High' | 'Medium' | 'Low';
type Confidence = 'high' | 'medium' | 'low';
type Suite = 'Microsoft 365' | 'Google Workspace' | 'Both' | 'Unknown';

export interface ConnectStats {
  attempts: number;
  responses: number;
  rate: number | null;
  level: Level | null;
}

export interface Analysis {
  overview: string;
  keyFacts: string[];
  msp: { isMsp: boolean; confidence: Confidence; reason: string };
  cloudfuzeFit: { level: Level; reason: string };
  pastProjects: string[];
  techStack: { productivitySuite: Suite; tools: string[]; confidence: Confidence; evidence: string };
  buyingSignals: { signal: string; strength: Level; evidence: string }[];
  opportunities: { title: string; detail: string }[];
  angle: string;
}

export interface Engagement {
  summary: string;
  keyPoints: string[];
  openItems: string[];
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Unknown';
  sentimentReason: string;
  nextAction: { action: string; reason: string; when: string };
  outreach: {
    channel: 'Email' | 'Call' | 'Meeting' | 'LinkedIn';
    approach: string;
    emailSubject: string;
    emailBody: string;
    callOpener: string;
    talkingPoints: string[];
  };
  risks: string[];
  toolsMentioned: string[];
}

export interface DealInsights {
  headline: string;
  wins: string[];
  losses: string[];
  atRisk: { deal: string; reason: string; action: string }[];
  nextBestActions: { deal: string; action: string }[];
}

/** What the company's public email/domain records say about the software it uses. */
export interface DomainRecords {
  suite: Exclude<Suite, 'Unknown'> | null;
  mail: string | null;
  tools: string[];
}

/** What is stored per company. */
interface AccountContent {
  profile: Analysis;
  engagement: Engagement;
  connect: ConnectStats;
  usedHomepage: boolean;
  /** Web research is paid for, so it is kept and reused while the company record (key) stays the same. */
  research: { key: string; text: string | null } | null;
  domain: DomainRecords | null;
}

type Schema = Record<string, unknown>;

const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) });
const strs = (description: string): Schema => ({ type: 'array', items: { type: 'string' }, description });
const list = (items: Schema, description?: string): Schema => ({ type: 'array', items, ...(description ? { description } : {}) });
const choice = (...values: string[]): Schema => ({ type: 'string', enum: values });
const LEVEL = choice('High', 'Medium', 'Low');
const CONFIDENCE = choice('high', 'medium', 'low');

/** An object whose every property is required and nothing else is allowed (what strict structured outputs expects). */
const obj = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description ? { description } : {}),
});

const ACCOUNT_SCHEMA = obj({
  profile: obj({
    overview: str('2-3 plain sentences: what the company does, for whom, and where it is based.'),
    keyFacts: strs('0-5 short facts the page does not already show (offerings, customers, ownership, locations, recent events), each with its source. Never repeat employees, revenue, founded year, industry or headquarters; never list what is unknown.'),
    msp: obj({ isMsp: { type: 'boolean' }, confidence: CONFIDENCE, reason: str('The evidence and its source.') }),
    cloudfuzeFit: obj({ level: LEVEL, reason: str('Why, citing the evidence.') }),
    pastProjects: strs('Finished CloudFuze projects (WON deals): what, when, amount. Empty if none.'),
    techStack: obj({
      productivitySuite: choice('Microsoft 365', 'Google Workspace', 'Both', 'Unknown'),
      tools: strs('Business software platforms in use, from the DNS records, website, research, deals or activity.'),
      confidence: CONFIDENCE,
      evidence: str('Where the platforms were found, in one sentence.'),
    }),
    buyingSignals: list(obj({ signal: str(), strength: LEVEL, evidence: str('Source and date.') }),
      'Only customer actions, OPEN deals or a recent merger/acquisition — never our own outreach and never a WON or LOST deal. At most 4, strongest first; empty if none.'),
    opportunities: list(obj({ title: str(), detail: str('What to offer and why, ending with the fact it rests on and its source.') }),
      '0-3 specific CloudFuze opportunities, each tied to a fact in the input. Empty rather than generic.'),
    angle: str('One sentence: how CloudFuze should position itself with this company, naming the platforms involved when known.'),
  }),
  engagement: obj({
    summary: str('3-5 plain sentences: what has happened with this account and where it stands now, with dates.'),
    keyPoints: strs('Key facts from the conversations (needs, scope, users, timelines, decisions), each with its date.'),
    openItems: strs('Commitments or follow-ups still open, saying who owes what.'),
    sentiment: choice('Positive', 'Neutral', 'Negative', 'Unknown'),
    sentimentReason: str(),
    nextAction: obj({
      action: str('One full sentence: verb + person + purpose, e.g. "Call Avgoustis Fakiris to confirm the Google Workspace migration quote."'),
      reason: str('Why this, why now — citing the evidence.'),
      when: choice('Today', 'This week', 'Next week', 'This month'),
    }),
    outreach: obj({
      channel: choice('Email', 'Call', 'Meeting', 'LinkedIn'),
      approach: str('How to approach the next touch and why, in 1-2 sentences.'),
      emailSubject: str('Specific to this company, under 8 words.'),
      emailBody: str('70-120 words in the 5-part structure from the instructions, ready to send, ending "[Your name]". Never empty.'),
      callOpener: str('"Hi <first name>, this is [Your name] from CloudFuze." plus one sentence with the reason for the call.'),
      talkingPoints: strs('3-5 specific talking points.'),
    }),
    risks: strs('Risks to the relationship or a deal, with the evidence; empty if none.'),
    toolsMentioned: strs('Software platforms the customer mentioned using or moving to/from in the activity.'),
  }),
});

const DEALS_SCHEMA = obj({
  headline: str('One sentence on the state of this pipeline.'),
  wins: strs('Patterns behind won deals (only patterns seen in 2+ deals).'),
  losses: strs('Patterns behind lost deals (only patterns seen in 2+ deals).'),
  atRisk: list(obj({ deal: str(), reason: str(), action: str() }), 'Open deals at risk, most valuable first, at most 8.'),
  nextBestActions: list(obj({ deal: str(), action: str() }), 'At most 6, most important first.'),
});

// ---------- prompts ----------

const CLOUDFUZE = `About CloudFuze (the seller): CloudFuze moves and manages business cloud data — content migration between
Box, Dropbox, Google Drive, SharePoint, OneDrive, Egnyte and others; messaging migration (Slack, Microsoft Teams, Google
Chat); email migration; Microsoft 365 and Google Workspace tenant-to-tenant moves after mergers and acquisitions; and SaaS
management/governance (CloudFuze Manage). Managed service providers (MSPs) can partner with CloudFuze to deliver
migrations for their own clients.`;

const ACCOUNT_SYSTEM = `You are CloudFuze's account intelligence analyst. You write a one-page brief on one company for a
CloudFuze account manager.

${CLOUDFUZE}

Input, in order: today's date; the HubSpot company record; what the company's email and domain (DNS) records show; an
excerpt of the company's website (homepage, plus a services or about page when found); web research notes with source
links (when available); the company's deals; and its latest logged activity, newest first. When the website and the web
research disagree, trust the company's own website; when the research is about a different company, ignore it.

Ground rules
1. Use only the information provided. Never invent people, numbers, dates, tools, news or events. When the input does
   not support an answer, write "Unknown" or return an empty list — an empty list is better than a weak or generic item.
2. End every key fact and every piece of evidence with its source in brackets: (website), (web research), (DNS records),
   (HubSpot record), or the activity and its date, e.g. (call, 2026-09-12).
   Exception — large, well-known companies with no website text and no research: you may state what the company does
   from well-established general knowledge, marked (general knowledge). Never for small or unfamiliar companies, and
   never for numbers, people, technology in use, or recent events.
3. Write for a busy account manager: short, plain, specific sentences. No marketing language, no filler, no hedging.
   Never use: seamless, seamlessly, ensure, leverage, streamline, robust, cutting-edge, "hope this finds you well",
   "I wanted to reach out", "touch base", "explore how".

Reading the activity correctly
- Each activity line says who acted. Only what the CUSTOMER said or did is evidence of their needs, interest or
  sentiment: "THEY EMAILED CLOUDFUZE", "THEY CALLED CLOUDFUZE", meetings, and internal notes that record what the
  customer told us. "CLOUDFUZE EMAILED THEM" and "CLOUDFUZE CALLED THEM" only show that we reached out — never present
  our own outreach as a customer signal, need, key point or sign of interest.
- Recent means within the last 90 days. Describe anything older with its date ("a 2023 Slack-to-Teams migration"), never
  as recent or current.
- Many unanswered CloudFuze emails or calls in a row is a risk, not engagement.

Deals
- A WON deal is a finished purchase: put it in pastProjects. It shows a past relationship and a reference point, never
  an open opportunity and never a buying signal. A LOST deal is closed. Only an OPEN deal is a live opportunity.
  Never describe a WON or LOST deal as open.

Decision rules
- MSP: isMsp = true only if the company itself sells ongoing managed IT, cloud, security or helpdesk services to other
  businesses ("managed services", "MSP", "we manage your IT", "24/7 IT support", "NOC/helpdesk for clients"). IT
  consultancies, software development, digital-transformation and product-engineering firms, licence resellers,
  defence or government contractors, and companies that merely use IT are NOT MSPs unless they plainly offer managed
  IT services to businesses too. Judge the company's main business: a side product (e.g. an HR platform that also
  offers device management) does not make it an MSP.
  confidence: high = the website, web research or HubSpot description says what the company sells, so the yes/no answer
  is clear; medium = inferred from the industry, the name or indirect hints; low = little or no description of the
  business.
- CloudFuze fit:
  High = a need the customer stated, an OPEN deal, a merger, acquisition or tenant move in the last 12 months, or an MSP
  that could resell CloudFuze migrations.
  Medium = overlapping platforms (both suites in the DNS records, or Box, Dropbox, Egnyte or Slack alongside Microsoft
  365 or Google Workspace), a past (WON) CloudFuze project, or 50+ employees on Microsoft 365 or Google Workspace.
  Low = very small, unrelated to cloud content or messaging, or too little information.
- Buying signals come only from what the customer did or said, an OPEN deal, or a merger/acquisition in the last 12
  months (from web research). Strength: High = the customer stated a need, timeline or budget, or there is an OPEN deal.
  Medium = a recent merger/acquisition or an indirect customer-side hint (growth, new offices, hiring IT, complaining
  about a tool). Low = general fit only.
- Opportunities: each one rests on a specific fact — a platform in the DNS records or activity, an OPEN deal, a customer
  request, an acquisition, or the natural next step after a past project (the remaining users, the next platform).
  Name the source and target platforms when known. Never a generic "potential future migrations" item.
- Tech stack: the DNS records are reliable for the email/productivity suite and for verified tools. Add platforms named
  in the website, research, deals or activity. confidence high when the DNS records show the suite.
- Sentiment (customer behaviour only): Positive = the customer replies, engages, agrees next steps. Negative =
  complaints, escalations, churn or price objections. Neutral = routine two-way contact. Unknown = no customer replies.
- Next action: one concrete step — who to contact (by name when known) and why now. An open commitment comes first;
  after many unanswered emails, change channel or contact instead of emailing again. "when":
  Today = the customer asked for something or replied in the last 3 days, or a commitment made in the last 30 days
  is due or overdue.
  This week = an OPEN deal, or a customer reply in the last 30 days.
  Next week = the last customer reply was 31-90 days ago.
  This month = no customer reply in 90+ days, or none ever.
- Outreach channel: Call after a recent two-way conversation; Email for a first touch or after unanswered calls;
  Meeting when a scope or proposal is pending; LinkedIn when emails and calls have gone unanswered or no contact exists.

The email, call opener and talking points go to the customer, so they never contain source brackets and never mention
HubSpot, DNS records, "our records" or web research — state the fact plainly ("you use Box and Microsoft 365").
They are addressed to the same person the next action names.
The email (emailBody) — always write a complete email, even with no logged activity:
  1. "Hi <first name>," (the next action's contact, else the primary contact's first name, otherwise "Hi there,").
  2. One sentence that refers to one specific, dated fact from the input (their last reply, a meeting, a past project,
     a platform they use, a recent acquisition).
  3. Two or three sentences on how CloudFuze helps with that exact situation, naming the platforms involved — concrete,
     no invented statistics or customer names.
  4. One clear ask with a proposed time ("Could we take 20 minutes on Tuesday or Wednesday?").
  5. "Best regards,\\n[Your name]" — always this placeholder, never a name from the activity history.
  Total 70-120 words. No other placeholders. Never write about what you do not know or will not assume — leave it out.
The call opener always introduces the caller as "[Your name] from CloudFuze", never by a name from the activity.
- With no logged activity: say so plainly in the summary, sentiment Unknown, empty keyPoints and openItems, and make the
  outreach a short introduction based on the company profile.`;

const DEALS_SYSTEM = `You are a sales operations analyst at CloudFuze reviewing one account manager's HubSpot deals.

${CLOUDFUZE}

Rules
1. Use only the deals provided; name the specific deals. Never invent reasons — if won/lost reasons are blank, say the
   pattern is unclear rather than guessing.
2. A pattern needs at least 2 deals behind it.
3. An open deal is at risk when its close date has passed, it has no next step, or it has not changed in 30+ days.
4. Next best actions are concrete steps for the most valuable open deals.
5. Short, plain sentences for a busy account manager.`;

const RESEARCH_SYSTEM = `You research one company for CloudFuze's account team. Run ONE web search: the company name
together with its website domain. Then answer from what that search returned.

Reply with up to 8 bullet points, at most 160 words in total, each ending with its source URL in brackets. Cover only
what you actually found:
- What the company does, for whom, and its main locations.
- Main line of business: does it sell managed IT services to other businesses (ongoing IT support, monitoring, helpdesk,
  managed cloud or managed security)? Quote the phrase it uses. If its business is clearly something else, write
  "Main business is <x>; no sign of managed IT services".
- Technology partnerships or platforms it names: Microsoft or Google partner status, Microsoft 365, Google Workspace,
  SharePoint, OneDrive, Box, Dropbox, Egnyte, Slack, Teams.
- In the last 12 months: mergers, acquisitions, divestments, funding, new offices, layoffs, or IT/cloud changes, each
  with its month and year.
Only facts about THIS company — match the website domain; a company with a similar name does not count. Never guess.
If you cannot find the company at all, reply exactly: NOT FOUND`;

// ---------- the model calls (every call is metered) ----------

let meter = { input: 0, cached: 0, output: 0, searches: 0, usd: 0 };

/** Tokens, searches and estimated cost of the calls made since the current book started. */
export const aiUsage = (): Readonly<typeof meter> => meter;

function charge(u: CallUsage): void {
  meter = {
    input: meter.input + u.input,
    cached: meter.cached + (u.cached ?? 0),
    output: meter.output + u.output,
    searches: meter.searches + (u.searches ?? 0),
    usd: meter.usd + costUsd(aiModel(), u),
  };
}

type Effort = 'low' | 'medium' | 'high';
const EFFORTS: Effort[] = ['low', 'medium', 'high'];
/** How hard the model thinks on the account brief (CS_TRACKER_AI_EFFORT, default high — affordable on Flex). */
const briefEffort = (): Effort => EFFORTS.find((e) => e === lower(process.env.CS_TRACKER_AI_EFFORT)) ?? 'high';

async function structured<T>(name: string, system: string, input: string, schema: Schema, maxTokens: number): Promise<T> {
  const res = await withFlex((tier) => openai().chat.completions.create({
    model: aiModel(),
    ...(isReasoningModel() ? { reasoning_effort: briefEffort() } : { temperature: 0.2 }),
    ...(tier ? { service_tier: tier } : {}),
    // the system prompt and schema are the same for every company, so they are cached and billed at a tenth
    prompt_cache_key: `cs-tracker-${name}`,
    max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
  }));
  charge({
    input: res.usage?.prompt_tokens ?? 0,
    cached: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    output: res.usage?.completion_tokens ?? 0,
    flex: res.service_tier === 'flex',
  });
  const answer = res.choices[0];
  if (answer?.message?.refusal) throw new Error(`The AI declined: ${answer.message.refusal}`);
  if (answer?.finish_reason === 'length') throw new Error('The AI answer was cut off (too long).');
  try {
    return JSON.parse(answer?.message?.content ?? '') as T;
  } catch {
    throw new Error('The AI returned an answer that was not valid JSON.');
  }
}

/** One web search about a company (what it does, MSP, platforms, recent events); null when nothing reliable was found. */
async function webResearch(c: CompanyRecord): Promise<string | null> {
  const where = [c.city, c.country].filter(Boolean).join(', ');
  const res = await withFlex((tier) => openai().responses.create({
    model: aiModel(),
    instructions: RESEARCH_SYSTEM,
    input: `Company: ${c.company ?? 'Unknown'}; website: ${c.domain ?? c.website ?? 'unknown'}${where ? `; location: ${where}` : ''}`
      + `; today: ${todayIst()}`,
    tools: [{ type: 'web_search', search_context_size: 'low' }],
    max_output_tokens: 3000,
    prompt_cache_key: 'cs-tracker-research',
    ...(tier ? { service_tier: tier } : {}),
    ...(isReasoningModel() ? { reasoning: { effort: 'low' as const } } : {}),
  }));
  charge({
    input: res.usage?.input_tokens ?? 0,
    cached: res.usage?.input_tokens_details?.cached_tokens ?? 0,
    output: res.usage?.output_tokens ?? 0,
    searches: res.output.filter((o) => o.type === 'web_search_call').length,
    flex: res.service_tier === 'flex',
  });
  const text = trim(res.output_text?.replace(/\?utm_source=openai/g, ''));
  return text && !/^NOT FOUND/i.test(text) ? text.slice(0, RESEARCH_TEXT_MAX) : null;
}

// ---------- email & domain (DNS) records: the productivity suite and verified tools, free and factual ----------

const SUITE_MX: [RegExp, 'Microsoft 365' | 'Google Workspace'][] = [
  [/(^|\.)mail\.protection\.outlook\.com$|(^|\.)outlook\.com$/, 'Microsoft 365'],
  [/(^|\.)google\.com$|(^|\.)googlemail\.com$/, 'Google Workspace'],
];
const SUITE_TXT: [RegExp, 'Microsoft 365' | 'Google Workspace'][] = [
  [/^ms=ms\d+|include:spf\.protection\.outlook\.com/, 'Microsoft 365'],
  [/include:_spf\.google\.com/, 'Google Workspace'],
];
// Domain-verification records services ask a customer to publish, and SPF includes for services that send its mail.
const TOOL_TXT: [RegExp, string][] = [
  [/^slack-domain-verification=/, 'Slack'],
  [/^box-domain-verification=/, 'Box'],
  [/^dropbox-domain-verification=/, 'Dropbox'],
  [/^egnyte-domain-verification=/, 'Egnyte'],
  [/^citrix-verification-code=/, 'Citrix'],
  [/^atlassian-domain-verification=/, 'Atlassian'],
  [/^zoom_verify_/, 'Zoom'],
  [/^(webexdomainverification|cisco-ci-domain-verification)/, 'Webex'],
  [/^smartsheet-site-validation=/, 'Smartsheet'],
  [/^miro-verification=/, 'Miro'],
  [/^notion-domain-verification=/, 'Notion'],
  [/^docusign=/, 'DocuSign'],
  [/^adobe-(idp-site|sign)-verification=/, 'Adobe'],
  [/include:_spf\.salesforce\.com/, 'Salesforce'],
  [/hubspotemail\.net/, 'HubSpot'],
  [/mail\.zendesk\.com|^zendeskverification=/, 'Zendesk'],
];

/** Pure reading of MX hosts and TXT records — the mail host decides the suite; a verified second suite makes it Both. */
export function readDomainRecords(mxHosts: string[], txtRecords: string[]): DomainRecords {
  const mx = mxHosts.map((h) => h.toLowerCase().replace(/\.$/, ''));
  const txt = txtRecords.map((t) => t.toLowerCase().trim());
  const mailSuite = SUITE_MX.find(([re]) => mx.some((h) => re.test(h)))?.[1] ?? null;
  const verified = new Set(SUITE_TXT.filter(([re]) => txt.some((t) => re.test(t))).map(([, s]) => s));
  if (mailSuite) verified.add(mailSuite);
  const suite = verified.size === 2 ? 'Both' : mailSuite ?? [...verified][0] ?? null;
  const tools = TOOL_TXT.filter(([re]) => txt.some((t) => re.test(t))).map(([, name]) => name);
  return { suite, mail: mailSuite ?? (mx[0] ? 'other provider' : null), tools: [...new Set(tools)] };
}

let resolver: dns.promises.Resolver | null = null;
const publicResolver = (): dns.promises.Resolver => {
  if (!resolver) {
    resolver = new dns.promises.Resolver({ timeout: 3000, tries: 2 });
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
  }
  return resolver;
};

async function domainRecords(c: CompanyRecord): Promise<DomainRecords | null> {
  const given = c.domain ?? c.website;
  if (!given) return null;
  let host: string;
  try {
    host = rootDomain(new URL(/^https?:\/\//i.test(given) ? given : `https://${given}`).hostname);
  } catch {
    return null;
  }
  const r = publicResolver();
  const [mx, txt] = await Promise.all([
    r.resolveMx(host).then((x) => x.map((m) => m.exchange)).catch(() => [] as string[]),
    r.resolveTxt(host).then((x) => x.map((parts) => parts.join(''))).catch(() => [] as string[]),
  ]);
  if (mx.length === 0 && txt.length === 0) return null;
  return readDomainRecords(mx, txt);
}

function domainLines(d: DomainRecords | null): string {
  if (!d) return 'No email or domain records found.';
  return [
    `Email is hosted on: ${d.mail ?? 'unknown'}`,
    `Productivity suite: ${d.suite ?? 'not identifiable from the records'}`,
    `Verified or sending services: ${d.tools.length ? d.tools.join(', ') : 'none found'}`,
  ].join('\n');
}

// ---------- the company's own website (free context, fetched safely) ----------

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return PRIVATE_V4.some((r) => r.test(ip));
}

/** Only public http(s) hosts — the domain comes from HubSpot, so never let it point inside our network. */
async function publicUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (net.isIP(u.hostname)) return isPrivateAddress(u.hostname) ? null : u;
  const addrs = await dns.promises.lookup(u.hostname, { all: true }).catch(() => []);
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return null;
  return u;
}

const decodeAttr = (s: string | undefined): string | null => (s ? htmlToText(s, 300) : null);

// Many sites refuse requests that do not look like a browser; this only ever reads public pages of the company's site.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en',
};

/** "network.lilly.com" → "lilly.com"; keeps the extra label for country domains such as "airit.co.uk". */
function rootDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  const countrySecondLevel = parts.length >= 3 && parts[parts.length - 1].length === 2
    && ['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'].includes(parts[parts.length - 2]);
  return parts.slice(countrySecondLevel ? -3 : -2).join('.');
}

/** HubSpot's website is often a sub-page or a sub-domain: try it, then the company's main domain, https then http. */
function homepageCandidates(c: CompanyRecord): string[] {
  const out: string[] = [];
  const add = (u: string | null) => { if (u && !out.includes(u)) out.push(u); };
  const given = c.website ?? c.domain;
  if (!given) return out;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(given) ? given : `https://${given}`).hostname;
  } catch {
    return out;
  }
  const root = rootDomain(host);
  add(`https://${host}/`);
  add(`https://${root}/`);
  add(`https://www.${root}/`);
  add(`http://www.${root}/`);
  return out;
}

/** One page, following up to 4 redirects, each checked to stay on public hosts. */
async function fetchPage(start: string): Promise<{ html: string; url: URL } | null> {
  let target: string | null = start;
  for (let hop = 0; target && hop < 5; hop++) {
    const u = await publicUrl(target);
    if (!u) return null;
    const res = await axios.get<string>(u.toString(), {
      timeout: 8000,
      maxRedirects: 0,
      maxContentLength: 2_000_000,
      responseType: 'text',
      validateStatus: (s) => s < 400,
      headers: BROWSER_HEADERS,
    }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300) {
      const location = res.headers.location as string | undefined;
      target = location ? new URL(location, u).toString() : null;
      continue;
    }
    return { html: String(res.data ?? ''), url: u };
  }
  return null;
}

const pageText = (html: string, max: number): string | null =>
  htmlToText(html.replace(/<(nav|footer|noscript|svg|form)[\s\S]*?<\/\1>/gi, ' '), max);

/** The site's own services page (best for MSP decisions), else its about page. */
export function secondPageLink(html: string, base: URL): string | null {
  const root = rootDomain(base.hostname);
  const links: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && rootDomain(u.hostname) === root) links.push(u);
    } catch {
      // not a usable link
    }
  }
  const find = (re: RegExp) => links.find((u) => re.test(u.pathname));
  return (find(/\/(services|solutions|what-we-do|managed[\w-]*)\/?$/i) ?? find(/\/(about|about-us|company|who-we-are)\/?$/i))?.toString() ?? null;
}

/** Title, meta description and visible text of the homepage plus one services/about page; null when unreadable. */
async function website(c: CompanyRecord): Promise<string | null> {
  for (const candidate of homepageCandidates(c)) {
    const page = await fetchPage(candidate);
    if (!page) continue;
    const { html } = page;
    const title = decodeAttr(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
    const description = decodeAttr(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]
      ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1]);
    const body = pageText(html, HOMEPAGE_TEXT_MAX);
    // a near-empty page is usually a bot check or a script-only site: try the next candidate
    if ((body ?? '').length < 200 && !description) continue;
    const parts = [title && `Title: ${title}`, description && `Description: ${description}`, body];
    const second = secondPageLink(html, page.url);
    if (second) {
      const more = await fetchPage(second).catch(() => null);
      const text = more ? pageText(more.html, SECOND_PAGE_TEXT_MAX) : null;
      if (text && text.length >= 200) parts.push(`\n### ${new URL(second).pathname}\n${text}`);
    }
    return parts.filter(Boolean).join('\n');
  }
  return null;
}

// ---------- inputs & fingerprints ----------

const hash = (v: unknown): string => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

function companyFacts(c: CompanyRecord): Record<string, unknown> {
  return {
    name: c.company, domain: c.domain, website: c.website, industry: c.industry, industryGroup: c.industryGroup,
    city: c.city, state: c.state, country: c.country, employees: c.employees, annualRevenue: c.annualRevenue,
    foundedYear: c.foundedYear, lifecycleStage: c.lifecycleStage, description: c.orgOverview, linkedin: c.linkedin,
  };
}

const dealState = (deals: DealRecord[]): unknown[] =>
  deals.map((d) => [d.hubspotId, d.status, d.stageLabel, d.amount, d.closeDate, d.nextStep]).sort();

/** First half: the company record (and prompt/model); second half: the activity that drives the conversation part. */
export function accountFingerprint(c: CompanyRecord, deals: DealRecord[]): string {
  const facts = hash([PROMPT_VERSION, aiModel(), companyFacts(c)]);
  const activity = hash([c.callsCount, c.meetingsCount, c.notesCount, Math.floor((c.emailsCount ?? 0) / EMAIL_STEP),
    c.primaryContactName, dealState(deals)]);
  return facts + activity;
}

const dealsFingerprint = (deals: DealRecord[]): string => hash([PROMPT_VERSION, aiModel(), dealState(deals)]);

// Research does not depend on the prompt version or model, so a prompt change never pays for the same search twice.
const researchKey = (c: CompanyRecord): string => hash(['research', c.company, c.domain, c.website]);

/** "2026-09-15 (30 days ago)" — explicit ages keep the model from calling old events recent. */
function dated(isoDay: string | null | undefined, today: string): string | null {
  if (!isoDay) return null;
  const day = isoDay.slice(0, 10);
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days)) return day;
  return `${day} (${days === 0 ? 'today' : days > 0 ? `${days} days ago` : `in ${-days} days`})`;
}

const DEAL_STATUS: Record<string, string> = {
  WON: 'WON — closed, they bought',
  LOST: 'LOST — closed, they did not buy',
  OPEN: 'OPEN — still in progress',
};

function dealLine(d: DealRecord, today: string): string {
  return [
    `- ${d.name ?? 'Untitled deal'}${d.companyName ? ` (${d.companyName})` : ''}`,
    DEAL_STATUS[d.status ?? ''] ?? 'status unknown', d.stageLabel ? `stage "${d.stageLabel}"` : null,
    d.amount != null ? `amount ${d.amount} ${d.currency ?? ''}`.trim() : null,
    d.createDate ? `created ${dated(d.createDate, today)}` : null, d.closeDate ? `close date ${dated(d.closeDate, today)}` : null,
    d.hubspotModifiedAt ? `last changed ${dated(d.hubspotModifiedAt, today)}` : null,
    d.dealType ? `type ${d.dealType}` : null,
    d.mine === false ? `owned by colleague ${d.dealOwnerName ?? ''}`.trim() : null,
    d.wonReason ? `won reason: ${d.wonReason}` : null, d.lostReason ? `lost reason: ${d.lostReason}` : null,
    d.nextStep ? `next step: ${d.nextStep}` : null,
  ].filter(Boolean).join('; ');
}

/** Who acted, from CloudFuze's side — so outreach we sent is never mistaken for the customer's interest. */
function actor(i: ActivityItem): string {
  if (i.type === 'call') return i.direction === 'Inbound' ? 'THEY CALLED CLOUDFUZE' : 'CLOUDFUZE CALLED THEM';
  if (i.type === 'email') {
    if (i.direction === 'Received') return 'THEY EMAILED CLOUDFUZE';
    if (i.direction === 'Forwarded') return 'EMAIL FORWARDED';
    return 'CLOUDFUZE EMAILED THEM';
  }
  if (i.type === 'meeting') return 'MEETING';
  if (i.type === 'note') return 'INTERNAL NOTE BY CLOUDFUZE';
  return 'CLOUDFUZE TASK';
}

function activityLines(items: ActivityItem[], today: string): string {
  let budget = ACTIVITY_TEXT_BUDGET;
  const out: string[] = [];
  for (const i of items) {
    const head = [dated(i.timestamp, today) ?? 'undated', actor(i), i.outcome ? `outcome: ${i.outcome}` : null,
      i.ownerName ? `CloudFuze person: ${i.ownerName}` : null]
      .filter(Boolean).join(' · ');
    const body = (i.body ?? '').slice(0, ACTIVITY_BODY_MAX);
    const line = `[${head}] ${i.title ?? ''}\n${body}`.trim();
    if (line.length > budget) break;
    budget -= line.length;
    out.push(line);
  }
  return out.join('\n\n');
}

/** Reply-based connect probability from real activity; null level when there is too little activity to judge. */
export function connectStats(items: ActivityItem[]): ConnectStats {
  let attempts = 0;
  let responses = 0;
  for (const i of items) {
    if (i.type === 'call' && i.direction === 'Outbound') attempts++;
    if (i.type === 'call' && lower(i.outcome) === 'connected') responses++;
    if (i.type === 'email' && i.direction === 'Sent') attempts++;
    if (i.type === 'email' && i.direction === 'Received') responses++;
    if (i.type === 'meeting' && !['no show', 'canceled', 'cancelled'].includes(lower(i.outcome))) responses++;
  }
  if (attempts + responses < 3) return { attempts, responses, rate: null, level: null };
  const rate = Math.min(1, responses / Math.max(1, attempts));
  return { attempts, responses, rate, level: rate >= 0.35 ? 'High' : rate >= 0.12 ? 'Medium' : 'Low' };
}

// ---------- what needs the AI ----------

/**
 * A stored result is redone when its inputs changed: at once if the company record changed, at most daily if only the
 * activity changed. A failure waits 6 hours before the next try.
 */
function due(rec: AiRecord | undefined, fingerprint: string, minAgeMs: number): boolean {
  if (rec?.error && rec.attemptedAt && Date.now() - new Date(rec.attemptedAt).getTime() < RETRY_FAILED_AFTER_MS) return false;
  if (!rec?.generatedAt || !rec.fingerprint) return true;
  if (rec.fingerprint === fingerprint) return false;
  if (rec.fingerprint.slice(0, 32) !== fingerprint.slice(0, 32)) return true;
  return Date.now() - new Date(rec.generatedAt).getTime() >= minAgeMs;
}

export interface PlannedCompany {
  c: CompanyRecord;
  companyDeals: DealRecord[];
  fingerprint: string;
  previous: AiRecord | undefined;
}

/**
 * Who gets web research first when the budget cannot cover everyone: possible MSPs (IT, software, consulting, telecom
 * or no industry set) where it decides the MSP answer, then active accounts, then the rest. Unreadable websites are
 * always researched when the budget allows.
 */
export function researchPriority(c: CompanyRecord, today = todayIst()): number {
  if (!c.industry || MSP_CANDIDATE.test(c.industry)) return 2;
  const days = c.lastContactDate ? (Date.parse(today) - Date.parse(c.lastContactDate.slice(0, 10))) / DAY_MS : Infinity;
  return (c.openDeals ?? 0) > 0 || days <= 90 ? 1 : 0;
}

const byResearchPriority = (a: PlannedCompany, b: PlannedCompany): number =>
  researchPriority(b.c) - researchPriority(a.c) || (b.c.lastContactDate ?? '').localeCompare(a.c.lastContactDate ?? '');

const researchAttempted = (rec: AiRecord | undefined, c: CompanyRecord): boolean =>
  (rec?.content as AccountContent | null | undefined)?.research?.key === researchKey(c);

/** What in a book needs the AI right now — pure, so it is cheap to run on every sync. */
export function planBook(ownerKey: string, companies: CompanyRecord[], deals: DealRecord[], stored: AiRecord[]):
  { todo: PlannedCompany[]; dealsDue: boolean; researchDue: PlannedCompany[] } {
  const records = new Map<string, AiRecord>();
  stored.forEach((r) => records.set(`${r.subject}/${r.kind}`, r));
  const dealsByCompany = new Map<string, DealRecord[]>();
  deals.forEach((d) => {
    if (!d.companyHubspotId) return;
    const list = dealsByCompany.get(d.companyHubspotId) ?? [];
    list.push(d);
    dealsByCompany.set(d.companyHubspotId, list);
  });
  const planned = companies.map((c) => {
    const companyDeals = dealsByCompany.get(c.hubspotId) ?? [];
    const previous = records.get(`${c.hubspotId}/account`);
    return { c, companyDeals, fingerprint: accountFingerprint(c, companyDeals), previous };
  });
  const todo = planned.filter((w) => due(w.previous, w.fingerprint, DAY_MS)).sort(byResearchPriority);
  // up to date, but analysed before the budget reached them for research: research + a fresh brief when it allows
  const researchDue = planned
    .filter((w) => !todo.includes(w) && w.previous?.content && !researchAttempted(w.previous, w.c)
      && !(w.previous.error && w.previous.attemptedAt && Date.now() - new Date(w.previous.attemptedAt).getTime() < RETRY_FAILED_AFTER_MS))
    .sort(byResearchPriority);
  const dealsDue = deals.length > 0 && due(records.get(`owner:${ownerKey}/deals`), dealsFingerprint(deals), DAY_MS);
  return { todo, dealsDue, researchDue };
}

// ---------- one company / one book ----------

/** Safety net for the "a WON deal is not a buying signal" rule, which small models sometimes ignore. */
export function isPastProject(signal: string): boolean {
  return /\b(past|previous(ly)?|completed|finished|won)\b/i.test(signal) && /\b(deal|project|migration|purchase)\b/i.test(signal);
}

/** The email is sent by whoever is reading it, so it always signs off with a placeholder, never a colleague's name. */
export function withPlaceholderSignature(body: string): string {
  const text = body.trim();
  const signOff = /(best regards|kind regards|regards|best|thanks|thank you|cheers),?\s*(\n.*)?$/i.exec(text);
  const main = signOff && signOff.index > text.length - 80 ? text.slice(0, signOff.index).trimEnd() : text;
  return `${main}\n\nBest regards,\n[Your name]`;
}

/** Same for the call: "this is AJ from CloudFuze" → "this is [Your name] from CloudFuze". */
export function withPlaceholderCaller(opener: string): string {
  return opener.replace(/\bthis is (?!\[Your name\])[^,.!?]{1,40}? (from|at|with) CloudFuze/i, 'this is [Your name] from CloudFuze');
}

const SOURCE_TAG = /\s*\((?:[^()]*?\b(?:HubSpot record|DNS records|web research|website|homepage|general knowledge|(?:email|call|meeting|note|task),? \d{4}-\d{2}-\d{2})\b[^()]*)\)/gi;

/** Source brackets are for the account manager; text that goes to the customer must not carry them. */
export const withoutSources = (text: string): string => text.replace(SOURCE_TAG, '').replace(/ +([.,;:!?])/g, '$1');

/** "Box (DNS records)" and "Box" are the same tool. */
export function uniqueTools(tools: string[]): string[] {
  const seen = new Set<string>();
  return tools.map((t) => t.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter((t) => {
    const k = lower(t);
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const emailWords = (body: string): number =>
  body.replace(/\n\nBest regards,\n\[Your name\]$/, '').split(/\s+/).filter(Boolean).length;

/** DNS records are facts; they decide the suite and add verified tools to whatever the model found. */
const SUITE_NAMES = ['microsoft 365', 'office 365', 'o365', 'google workspace', 'g suite', 'gsuite'];

/** DNS records are facts: they decide the suite, add verified tools, and the evidence says so in plain words. */
export function applyDomainRecords(profile: Analysis, d: DomainRecords | null): void {
  const stack = profile.techStack;
  const fromModel = uniqueTools(stack.tools);
  stack.tools = uniqueTools([...fromModel, ...(d?.tools ?? [])]);
  if (d?.suite) {
    stack.productivitySuite = d.suite;
    stack.confidence = 'high';
  }
  const other = d?.suite === 'Both' ? (d.mail === 'Google Workspace' ? 'Microsoft 365' : 'Google Workspace') : null;
  const dnsPart = d && (d.suite || d.tools.length)
    ? [
      d.mail && d.mail !== 'other provider' ? `Email runs on ${d.mail}` : d.suite ? `${d.suite} is set up on the domain` : null,
      other ? `${other} is also set up on the domain` : null,
      d.tools.length ? `verified services: ${d.tools.join(', ')}` : null,
    ].filter(Boolean).join('; ') + ' (public DNS records).'
    : null;
  const dnsTools = new Set((d?.tools ?? []).map(lower));
  const elsewhere = fromModel.filter((t) => !dnsTools.has(lower(t)) && !SUITE_NAMES.includes(lower(t)));
  if (!dnsPart && stack.tools.length === 0 && stack.productivitySuite === 'Unknown') {
    stack.evidence = 'No platforms found in the public DNS records, the website, web research, deals or activity.';
  } else {
    stack.evidence = [dnsPart, elsewhere.length ? `Named in the website, research, deals or activity: ${elsewhere.join(', ')}.` : null]
      .filter(Boolean).join(' ') || stack.evidence;
  }
}

async function analyseAccount(w: PlannedCompany, canResearch: () => boolean): Promise<AccountContent> {
  const { c } = w;
  const [site, feed, domain] = await Promise.all([
    website(c).catch(() => null),
    activityForCompany(c.hubspotId, false),
    domainRecords(c).catch(() => null),
  ]);
  const key = researchKey(c);
  const before = (w.previous?.content as AccountContent | null | undefined)?.research;
  let research: AccountContent['research'] = before?.key === key ? before : null;
  if (!research && canResearch()) {
    research = { key, text: await webResearch(c).catch((e) => { logger.warn(`[AccountTrackerAI] Research failed for ${c.company}: ${errorText(e)}`); return null; }) };
  }
  const today = todayIst();
  const input = [
    `Today: ${today}`,
    '\n## HubSpot company record',
    JSON.stringify({
      ...companyFacts(c),
      primaryContact: c.primaryContactName ? `${c.primaryContactName}${c.primaryContactTitle ? `, ${c.primaryContactTitle}` : ''}` : null,
      loggedCalls: c.callsCount, loggedEmails: c.emailsCount, loggedMeetings: c.meetingsCount, loggedNotes: c.notesCount,
      lastContactDate: dated(c.lastContactDate, today),
    }, null, 2),
    '\n## Email and domain (DNS) records',
    domainLines(domain),
    '\n## Company website excerpt',
    site ?? 'Could not be read.',
    '\n## Web research',
    research?.text ?? 'None.',
    '\n## Deals',
    w.companyDeals.length ? w.companyDeals.map((d) => dealLine(d, today)).join('\n') : 'None.',
    `\n## Logged activity (latest ${feed.items.length}, newest first)`,
    feed.unavailable.length ? `Could not be read: ${feed.unavailable.map((u) => u.type).join(', ')}` : '',
    feed.items.length ? activityLines(feed.items, today) : 'No logged activity.',
  ].join('\n');

  // one retry when the email comes back empty or a stub, which reasoning models occasionally do
  let result: { profile: Analysis; engagement: Engagement } | null = null;
  for (let tries = 0; tries < 2; tries++) {
    result = await structured<{ profile: Analysis; engagement: Engagement }>('account_brief', ACCOUNT_SYSTEM, input, ACCOUNT_SCHEMA, 12_000);
    result.engagement.outreach.emailBody = withPlaceholderSignature(result.engagement.outreach.emailBody);
    if (emailWords(result.engagement.outreach.emailBody) >= MIN_EMAIL_WORDS) break;
  }
  const brief = result as { profile: Analysis; engagement: Engagement };
  const out = brief.engagement.outreach;
  out.emailSubject = withoutSources(out.emailSubject);
  out.emailBody = withoutSources(out.emailBody);
  out.callOpener = withPlaceholderCaller(withoutSources(out.callOpener));
  out.talkingPoints = out.talkingPoints.map(withoutSources);
  brief.profile.techStack.tools = uniqueTools(brief.profile.techStack.tools);
  brief.profile.buyingSignals = brief.profile.buyingSignals.filter((s) => !isPastProject(s.signal));
  applyDomainRecords(brief.profile, domain);
  return { ...brief, connect: connectStats(feed.items), usedHomepage: site != null, research, domain };
}

async function dealInsights(deals: DealRecord[]): Promise<DealInsights> {
  const ordered = [...deals].sort((a, b) => (b.closeDate ?? b.createDate ?? '').localeCompare(a.closeDate ?? a.createDate ?? ''));
  const today = todayIst();
  const input = [
    `Today: ${today}`,
    `\n## Deals (${deals.length}, newest first${deals.length > 250 ? ', latest 250 shown' : ''})`,
    ordered.slice(0, 250).map((d) => dealLine(d, today)).join('\n'),
  ].join('\n');
  return structured<DealInsights>('deal_insights', DEALS_SYSTEM, input, DEALS_SCHEMA, 10_000);
}

const progress = new Map<string, { total: number; done: number }>();
const queue: string[] = [];
let working = false;
const listeners: ((ownerKey: string) => void)[] = [];

// An account-level problem (out of quota, bad key, unknown model) pauses the AI for a while instead of failing every
// company in every book; the reason shows in the page status and the AI resumes by itself after the pause.
const PAUSE_MS = 30 * 60_000;
let paused: { reason: string; until: number } | null = null;
const pausedReason = (): string | null => (paused && Date.now() < paused.until ? paused.reason : null);

// People whose monthly budget is used up, with the month it applies to (it lifts by itself when the month changes).
const budgetStops = new Map<string, { month: string; reason: string }>();
const monthKey = (): string => todayIst().slice(0, 7);
const budgetReason = (ownerKey: string): string | null => {
  const stop = budgetStops.get(ownerKey);
  return stop && stop.month === monthKey() ? stop.reason : null;
};

function stopForBudget(ownerKey: string, spent: number, budget: number): void {
  const month = monthKey();
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  budgetStops.set(ownerKey, {
    month,
    reason: `this month's AI budget is used ($${spent.toFixed(2)} of $${budget.toFixed(2)}). New analysis resumes on ${next}; existing results stay as they are.`,
  });
}

class AccountProblem extends Error {}

/** A readable message from an OpenAI API error, or the error's own message. */
function errorText(e: unknown): string {
  if (e instanceof OpenAI.APIError) return `AI service error ${e.status ?? ''}: ${e.message}`.trim();
  return e instanceof Error ? e.message : String(e);
}

function accountProblem(e: unknown): string | null {
  if (e instanceof AccountProblem) return e.message;
  if (e instanceof OpenAI.AuthenticationError) return 'The OpenAI API key was rejected — check OPENAI_API_KEY.';
  if (e instanceof OpenAI.PermissionDeniedError) return 'The OpenAI API key is not allowed to use this model.';
  if (e instanceof OpenAI.NotFoundError) return `The AI model "${aiModel()}" was not found — check CS_TRACKER_AI_MODEL.`;
  if (e instanceof OpenAI.RateLimitError && e.code === 'insufficient_quota') {
    return 'The OpenAI account is out of credit — add credit in the OpenAI billing settings.';
  }
  return null;
}

export const onAiChanged = (fn: (ownerKey: string) => void): void => { listeners.push(fn); };
const changed = (ownerKey: string) => listeners.forEach((fn) => fn(ownerKey));

/** Queues AI analysis of a book after a sync; already-current results are skipped, so this is cheap to call often. */
export function enqueueAnalysis(ownerKey: string): void {
  if (!aiConfigured() || pausedReason() || budgetReason(ownerKey) || queue.includes(ownerKey)) return;
  queue.push(ownerKey);
  void work();
}

async function work(): Promise<void> {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const ownerKey = queue.shift() as string;
      try {
        await analyseBook(ownerKey);
      } catch (e) {
        const problem = accountProblem(e);
        if (problem) {
          paused = { reason: problem, until: Date.now() + PAUSE_MS };
          queue.length = 0;
          logger.error(`[AccountTrackerAI] Paused for 30 minutes: ${problem}`);
        } else {
          logger.error(`[AccountTrackerAI] Book ${ownerKey} failed: ${errorText(e)}`);
        }
      } finally {
        progress.delete(ownerKey);
        changed(ownerKey);
      }
    }
  } finally {
    working = false;
  }
}

async function attempt<T>(subject: string, kind: AiKind, fingerprint: string, label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const content = await fn();
    await saveAiResult(subject, kind, fingerprint, content, aiModel());
    return content;
  } catch (e) {
    const problem = accountProblem(e);
    if (problem) throw new AccountProblem(problem); // not this record's fault: stop the book, record nothing
    const message = errorText(e);
    logger.warn(`[AccountTrackerAI] ${kind} failed for ${label}: ${message}`);
    await saveAiFailure(subject, kind, message).catch(() => undefined);
    return null;
  }
}

/** Runs (and stores) the brief for one planned company. */
export async function processCompany(w: PlannedCompany, canResearch: () => boolean = () => true): Promise<void> {
  await attempt(w.c.hubspotId, 'account', w.fingerprint, w.c.company ?? w.c.hubspotId, () => analyseAccount(w, canResearch));
}

async function analyseBook(ownerKey: string): Promise<void> {
  const started = Date.now();
  meter = { input: 0, cached: 0, output: 0, searches: 0, usd: 0 };
  const [companies, deals] = await Promise.all([companiesOf(ownerKey), dealsOf(ownerKey)]);
  const stored = await aiRecords([...companies.map((c) => c.hubspotId), `owner:${ownerKey}`]);
  const { todo, dealsDue, researchDue } = planBook(ownerKey, companies, deals, stored);
  if (todo.length === 0 && !dealsDue && researchDue.length === 0) return;

  const month = monthKey();
  const budget = monthlyBudget(companies.length);
  const spentBefore = await aiSpend(ownerKey, month);
  let recorded = 0;
  const spent = () => spentBefore + meter.usd;
  const record = async () => {
    const delta = meter.usd - recorded;
    recorded = meter.usd;
    await addAiSpend(ownerKey, month, delta);
  };
  if (spent() >= budget) {
    stopForBudget(ownerKey, spent(), budget);
    return;
  }

  let next = 0;
  // Research is paid for only from what is left after reserving a brief for every company still waiting.
  const canResearch = () => spent() + (todo.length - next + 1) * BRIEF_COST_ESTIMATE + RESEARCH_COST_ESTIMATE
    <= budget * BUDGET_USE_SHARE;
  const research = researchDue.length > 0 && todo.length === 0 && canResearch() ? researchDue : [];
  if (todo.length === 0 && !dealsDue && research.length === 0) return;

  progress.set(ownerKey, { total: todo.length + (dealsDue ? 1 : 0) + research.length, done: 0 });
  const tick = () => {
    const p = progress.get(ownerKey);
    if (p) p.done++;
    changed(ownerKey);
  };

  let outOfBudget = false;
  let researched = 0;
  const worker = async () => {
    while (next < todo.length) {
      if (spent() >= budget) {
        outOfBudget = true;
        next = todo.length;
        break;
      }
      const w = todo[next++];
      try {
        await processCompany(w, canResearch);
      } catch (e) {
        next = todo.length; // an account problem: the other workers stop after their current company
        throw e;
      } finally {
        await record();
      }
      tick();
    }
  };
  // companies analysed before the budget reached them: research + a fresh brief, while the budget clearly allows
  let r = 0;
  const researchWorker = async () => {
    while (r < research.length && canResearch()) {
      const w = research[r++];
      try {
        await processCompany(w, () => true);
        researched++;
      } catch (e) {
        r = research.length;
        throw e;
      } finally {
        await record();
      }
      tick();
    }
  };
  try {
    const lanes = flexAvailable() ? CONCURRENCY.flex : CONCURRENCY.standard;
    await Promise.all(Array.from({ length: Math.min(lanes, todo.length) }, worker));
    await Promise.all(Array.from({ length: Math.min(lanes, research.length) }, researchWorker));
    if (dealsDue && !outOfBudget && spent() < budget) {
      await attempt(`owner:${ownerKey}`, 'deals', dealsFingerprint(deals), `owner ${ownerKey}`, () => dealInsights(deals));
      tick();
    }
  } finally {
    await record();
  }
  if (outOfBudget || spent() >= budget) stopForBudget(ownerKey, spent(), budget);
  logger.info(`[AccountTrackerAI] Book ${ownerKey}: ${todo.length} brief${todo.length === 1 ? '' : 's'}`
    + `${researched ? ` + ${researched} researched` : ''}${dealsDue ? ' + deal insights' : ''}`
    + ` in ${Math.round((Date.now() - started) / 1000)}s · ${aiModel()} tokens in ${meter.input.toLocaleString()} / out ${meter.output.toLocaleString()}`
    + ` · ${meter.searches} web searches · ≈$${meter.usd.toFixed(4)} (month $${spent().toFixed(2)} of $${budget.toFixed(2)})`
    + (outOfBudget ? ' · stopped: monthly budget reached' : ''));
}

// ---------- reads ----------

export interface CompanyAi {
  analysis: (Analysis & { generatedAt: string; usedHomepage: boolean; usedResearch: boolean }) | null;
  engagement: (Engagement & { connect: ConnectStats; generatedAt: string }) | null;
  error: string | null;
}

export async function aiForCompanies(hubspotIds: string[]): Promise<Map<string, CompanyAi>> {
  const out = new Map<string, CompanyAi>();
  const by = new Map((await aiRecords(hubspotIds)).filter((r) => r.kind === 'account').map((r) => [r.subject, r]));
  hubspotIds.forEach((id) => {
    const r = by.get(id);
    const content = r?.content as AccountContent | undefined;
    const generatedAt = r?.generatedAt ? new Date(r.generatedAt).toISOString() : null;
    out.set(id, {
      analysis: content && generatedAt
        ? { ...content.profile, usedHomepage: content.usedHomepage, usedResearch: !!content.research?.text, generatedAt }
        : null,
      engagement: content && generatedAt ? { ...content.engagement, connect: content.connect, generatedAt } : null,
      error: !content && r?.error ? r.error : null,
    });
  });
  return out;
}

/** Just the two list-level signals per company (MSP, reply-based connect level) — cheap enough for every list read. */
export async function aiSignals(hubspotIds: string[]): Promise<Map<string, { msp: boolean | null; connect: string | null }>> {
  const out = new Map<string, { msp: boolean | null; connect: string | null }>();
  if (hubspotIds.length === 0) return out;
  const r = await query(
    `SELECT subject, content->'profile'->'msp'->>'isMsp' AS msp, content->'connect'->>'level' AS connect
     FROM cs_tracker_ai WHERE kind = 'account' AND subject = ANY(?::text[]) AND content IS NOT NULL`, [hubspotIds]);
  r.rows.forEach((x: { subject: string; msp: string | null; connect: string | null }) => {
    out.set(x.subject, { msp: x.msp == null ? null : x.msp === 'true', connect: x.connect });
  });
  return out;
}

/** How much of a book the AI has covered, and whether it is working on it now. */
export async function aiCoverage(ownerKey: string) {
  const r = await query(
    `SELECT COUNT(*)::int AS analysed
     FROM cs_tracker_companies c JOIN cs_tracker_ai a ON a.subject = c.hubspot_id AND a.kind = 'account' AND a.content IS NOT NULL
     WHERE c.owner_key = ?`, [ownerKey]);
  const p = progress.get(ownerKey) ?? null;
  return {
    configured: aiConfigured(),
    pausedReason: pausedReason() ?? budgetReason(ownerKey),
    running: p != null || queue.includes(ownerKey),
    total: p?.total ?? 0,
    done: p?.done ?? 0,
    analysed: r.rows[0]?.analysed ?? 0,
  };
}

export async function dealInsightsFor(ownerKey: string): Promise<(DealInsights & { generatedAt: string }) | null> {
  const r = (await aiRecords([`owner:${ownerKey}`])).find((x) => x.kind === 'deals');
  if (!r?.content || !r.generatedAt) return null;
  return { ...(r.content as DealInsights), generatedAt: new Date(r.generatedAt).toISOString() };
}
