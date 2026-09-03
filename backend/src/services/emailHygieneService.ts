import { type AxiosInstance } from 'axios';
import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { getIstWeekBounds, istDateStr, weeksInCurrentIstMonth } from '../utils/weekBounds';
import { emailThreadClassifierService, type AmbiguousThread } from './emailThreadClassifierService';
import {
  isGraphConfigured, getAccessToken, graphClient, buildTeamTimelines, buildExchanges,
  findOrphanTeamMessages, isLikelyNewTopicByGap, type Exchange, type TimelineEntry,
} from './teamConversationTimeline';

export interface ImprovementInsight {
  category: 'speed' | 'quality' | 'tone' | 'resolution';
  metric: string;
  score: number;
  maxScore: number;
  originalLine: string;
  improvedLine: string;
}

// A single real example backing a category's score -- same "show the actual evidence"
// idea as Call Hygiene's per-person Best/Worst answer panel, generalized to all 4 email
// hygiene categories (Call Hygiene only has one metric, so it never needed per-category
// buckets).
export interface HygieneExample {
  customerText: string;
  replyText: string;
  label: string; // human-readable score for this example, e.g. "0.7h reply time", "94/100 relevancy", "Resolved in 1 reply", "Reopened 2x"
}

export interface CategoryBestWorst {
  best: HygieneExample | null;
  worst: HygieneExample | null;
}

// One line of "why did this category score what it scored" -- the actual measured value,
// the resulting 0-10 (or 0-20 for Tone) sub-score, and a concrete fix when it's not
// already strong. Powers clicking a category score to see the breakdown behind it,
// rather than only the best/worst real-example evidence.
// A small number of real, named instances backing a weak sub-score -- e.g. which specific
// customer got a slow reply, and how slow. Capped at 2 per sub-metric (not exhaustive) so
// this reads as "proof," not a dump of every offending thread.
export interface ScoreBreakdownExample {
  customer: string; // customer email address -- "who"
  when: string;     // yyyy-mm-dd the customer's message came in
  detail: string;   // subject + the specific measured failure, e.g. `"Migration ETA?" — replied after 18.3h`
  body: string;     // the actual reply text (truncated) -- the email itself, not just its subject
}

export interface ScoreBreakdownItem {
  label: string;
  value: string;
  subScore: number;
  maxSubScore: number;
  tip: string | null; // null when this sub-metric is already strong -- nothing to fix
  examples: ScoreBreakdownExample[]; // up to 2 real instances behind a weak tip; [] when strong
}

export interface ScoreBreakdown {
  speed: ScoreBreakdownItem[];
  quality: ScoreBreakdownItem[];
  resolution: ScoreBreakdownItem[];
  tone: ScoreBreakdownItem[];
}

export interface UserEmailHygiene {
  userEmail: string;
  userName: string;
  // Volume
  uniqueCustomerThreads: number;
  // Speed raw
  avgFirstReplyTimeHours: number | null;
  slaHitRate: number;                   // 0–100 %
  avgFullResolutionTimeHours: number | null;
  // Quality raw
  relevancyScore: number | null;
  relevancySample: string | null;
  accuracyRate: number;                 // 0–100 %
  completenessRate: number;             // 0–100 %
  // Resolution raw
  oneReplyResolutionRate: number;       // 0–100 %
  reopenedThreadRate: number;           // 0–100 %
  // Category scores on new scale
  toneScore: number;                    // 0–20
  speedScore: number;                   // 0–30  (Avg1stReply/10 + SLA/10 + ResTime/10)
  qualityScore: number;                 // 0–30  (Relevancy/10 + Accuracy/10 + Completeness/10)
  resolutionScore: number;              // 0–20  (1-Reply/10 + Reopened/10)
  // Overall
  emailHygieneScore: number;            // 0–100
  // Improvement suggestions (only for weak areas)
  insights: ImprovementInsight[];
  // Real best/worst example per category, for the "show the evidence" panel (mirrors
  // Call Hygiene's per-person Best/Worst answer UI, one bucket per category here).
  bestWorst: {
    speed: CategoryBestWorst;
    quality: CategoryBestWorst;
    resolution: CategoryBestWorst;
    tone: CategoryBestWorst;
  };
  // Every sub-metric behind each category score, always populated (not just when weak),
  // so clicking a score can explain exactly how it was built up, not just show an example.
  scoreBreakdown: ScoreBreakdown;
}

export interface TeamHygieneMember {
  email: string;
  name: string;
  score: number | null; // null if this person has no computed individual score yet
}

export interface TeamHygieneRow {
  teamId: string;
  managerEmail: string;
  managerName: string;
  segment: 'ENT' | 'SMB';
  teamScore: number | null;       // average emailHygieneScore across scored members (manager included)
  memberCount: number;            // total roster size for this team
  scoredMemberCount: number;      // how many of those actually have a computed score
  members: TeamHygieneMember[];
}

// Team rosters — explicit membership (not a Distribution List lookup). The original
// design tried to read each team's shared-DL mailbox via Graph, but the 6
// cfmigrationsupport_teamN@cloudfuze.com addresses are plain distribution lists with no
// mailbox of their own (Graph 404s on them — a DL forwards mail, it doesn't store any),
// and reading real DL *membership* would need Group.Read.All, which this app registration
// doesn't have. Team hygiene is computed instead as the average of each listed member's
// own individual emailHygieneScore (manager included) — needs no extra Graph permission.
interface TeamRosterEntry {
  teamId: string;
  managerEmail: string;
  memberEmails: string[]; // includes the manager
  segment: 'ENT' | 'SMB';
}

const TEAM_ROSTER: TeamRosterEntry[] = [
  {
    teamId: 'team1', segment: 'SMB', managerEmail: 'Harika.Velidi@cloudfuze.com',
    memberEmails: ['Harika.Velidi@cloudfuze.com', 'Siva.Kota@cloudfuze.com', 'Ravi.Hemanth@cloudfuze.com', 'Meena.Lakshmi@cloudfuze.com'],
  },
  {
    teamId: 'team2', segment: 'SMB', managerEmail: 'Raghu.Yellani@cloudfuze.com',
    memberEmails: ['Raghu.Yellani@cloudfuze.com', 'sriram.ramakrishnan@cloudfuze.com', 'Vineetha.Yenti@cloudfuze.com', 'Ramana.Reddy@cloudfuze.com'],
  },
  {
    teamId: 'team3', segment: 'SMB', managerEmail: 'Sravan.Kesaram@cloudfuze.com',
    memberEmails: ['Sravan.Kesaram@cloudfuze.com', 'swaroop@cloudfuze.com', 'Dathu.Kaluvala@cloudfuze.com', 'Saikumar.Kustapuram@cloudfuze.com'],
  },
  {
    teamId: 'team4', segment: 'ENT', managerEmail: 'Lakshmi.Prasanna@cloudfuze.com',
    memberEmails: ['Lakshmi.Prasanna@cloudfuze.com', 'Chaitanya.Gupta@cloudfuze.com', 'Davidraj.Dumpala@cloudfuze.com', 'harshith.kaduluri@cloudfuze.com', 'LakshmaReddy@cloudfuze.com', 'Ganesh.Kondameedi@cloudfuze.com'],
  },
  {
    teamId: 'team5', segment: 'SMB', managerEmail: 'Abhishikth.Yenugula@cloudfuze.com',
    memberEmails: ['Abhishikth.Yenugula@cloudfuze.com', 'neelima.krotta@cloudfuze.com', 'Amulya.Anapuram@cloudfuze.com', 'Ranadeep.Muddam@cloudfuze.com', 'Vijendar.Burgula@cloudfuze.com', 'Habeebunnisa.Begum@cloudfuze.com'],
  },
  {
    teamId: 'team6', segment: 'ENT', managerEmail: 'Pranavi@cloudfuze.com',
    memberEmails: ['Pranavi@cloudfuze.com', 'chandra.mouli@cloudfuze.com', 'Arun@cloudfuze.com', 'Manoj.Bathula@cloudfuze.com', 'Pallavi.Kosuvaripalli@cloudfuze.com'],
  },
];

// Segment heads — org-level owners, not team-level managers themselves.
const SEGMENT_HEADS: Record<'ENT' | 'SMB', { email: string; name: string }> = {
  ENT: { email: 'Abhishek.Sakala@cloudfuze.com', name: 'Abhishek Sakala' },
  SMB: { email: 'ajay.singh@cloudfuze.com', name: 'Ajay Singh' },
};

export function computeTeamHygiene(results: UserEmailHygiene[]): TeamHygieneRow[] {
  const byEmail = new Map(results.map(r => [r.userEmail.toLowerCase(), r]));
  return TEAM_ROSTER.map(team => {
    const members: TeamHygieneMember[] = team.memberEmails.map(email => {
      const r = byEmail.get(email.toLowerCase());
      return { email, name: r?.userName ?? email, score: r?.emailHygieneScore ?? null };
    });
    const scored = members.filter(m => m.score !== null);
    const teamScore = scored.length > 0
      ? Math.round(scored.reduce((sum, m) => sum + (m.score as number), 0) / scored.length)
      : null;
    const manager = byEmail.get(team.managerEmail.toLowerCase());
    return {
      teamId: team.teamId,
      managerEmail: team.managerEmail,
      managerName: manager?.userName ?? team.managerEmail,
      segment: team.segment,
      teamScore,
      memberCount: members.length,
      scoredMemberCount: scored.length,
      members,
    };
  });
}

export interface SegmentHead {
  email: string;
  name: string;
  segment: 'ENT' | 'SMB';
  // The segment head's score IS the average of their segment's team scores — not their
  // own individual mailbox activity. Abhishek's score = mean(team4, team6); Ajay's =
  // mean(team1, team2, team3, team5). This is a deliberate choice: they're scored on how
  // their teams perform, not on their own personal email volume.
  score: number | null;
  teamIds: string[];
}

export function computeSegmentHeads(teamHygiene: TeamHygieneRow[]): Record<'ENT' | 'SMB', SegmentHead> {
  const segScore = (seg: 'ENT' | 'SMB') => {
    const teams = teamHygiene.filter(t => t.segment === seg);
    const scored = teams.filter(t => t.teamScore !== null);
    return {
      score: scored.length > 0 ? Math.round(scored.reduce((sum, t) => sum + (t.teamScore as number), 0) / scored.length) : null,
      teamIds: teams.map(t => t.teamId),
    };
  };
  const ent = segScore('ENT');
  const smb = segScore('SMB');
  return {
    ENT: { ...SEGMENT_HEADS.ENT, segment: 'ENT', score: ent.score, teamIds: ent.teamIds },
    SMB: { ...SEGMENT_HEADS.SMB, segment: 'SMB', score: smb.score, teamIds: smb.teamIds },
  };
}
// Cache is only refreshed by the hourly sync cron job (or admin force-refresh). Regular
// HTTP requests always serve from cache — never trigger a live Graph API sync.
// 2026-08-31: cut from 25h to 90m. The metric itself changed on 2026-08-25 from a rolling
// 30-day average (where hour-to-hour freshness didn't matter) to "the current Mon-Sun IST
// week, to date" -- but this TTL was never shortened to match, so a snapshot taken right
// after a week rolled over (when almost nobody has a reply attributed to them yet, and
// every score defaults to a neutral 50) was being served as-is for nearly a full day
// instead of picking up the day's real activity. 90m gives headroom over the hourly cron
// below without reintroducing a live sync from a plain page load.
const CACHE_TTL_MS = 90 * 60 * 1000;

async function getCFUsers(): Promise<Array<{ email: string; name: string }>> {
  const result = await query(
    `SELECT email, display_name AS name FROM email_hygiene_members WHERE is_active = true ORDER BY display_name`
  );
  return result.rows as Array<{ email: string; name: string }>;
}

async function userMailboxExists(client: AxiosInstance, userPath: string): Promise<boolean> {
  try {
    await client.get(`/users/${userPath}/mailFolders/SentItems?$select=id`);
    return true;
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 404 || status === 400) return false;
    // 403 might mean access denied but user exists — propagate for Mail.Read
    if (status === 403) return false;
    throw err;
  }
}

const STOP_WORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'will', 'they', 'your',
  'their', 'what', 'when', 'where', 'please', 'thank', 'thanks', 'also',
  'just', 'more', 'about', 'would', 'could', 'should', 'after', 'before',
]);

function scoreRelevancy(
  customerText: string,
  cfReplyText: string
): { score: number; reason: string } {
  const custWords = customerText.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
  const replyLower = cfReplyText.toLowerCase();
  const replyWords = replyLower.split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));

  // 1. Keyword overlap (0-30 pts): customer-specific terms present in reply
  const custKeywords = new Set(custWords);
  const overlap = [...custKeywords].filter(w => replyLower.includes(w)).length;
  const overlapPct = custKeywords.size > 0 ? overlap / custKeywords.size : 0;
  const overlapScore = Math.min(30, Math.round(overlapPct * 50));

  // 2. Reply length adequacy (0-25 pts)
  const replyWordCount = replyWords.length;
  const lengthScore =
    replyWordCount >= 80 ? 25 :
    replyWordCount >= 40 ? 20 :
    replyWordCount >= 20 ? 12 :
    replyWordCount >= 8  ? 6 : 0;

  // 3. Structural quality (0-25 pts): greeting, sign-off, sentence count
  let structScore = 0;
  if (/\b(hi|hello|dear|good morning|good afternoon|greetings)\b/i.test(cfReplyText)) structScore += 5;
  if (/\b(best|regards|sincerely|thanks|thank you|cheers|warm regards)\b/i.test(cfReplyText)) structScore += 5;
  const sentences = cfReplyText.split(/[.!?]+/).filter(s => s.trim().length > 5).length;
  structScore += Math.min(15, sentences * 3);

  // 4. Action / resolution language (0-20 pts)
  const actionScore =
    /\b(will do|have done|completed|fixed|resolved|scheduled|please find|attached|let me know|done|sorted)\b/i.test(cfReplyText) ? 20 :
    /\b(will|working on|looking into|checking|investigating|follow up|reach out)\b/i.test(cfReplyText) ? 12 :
    /\b(can|should|may|able to)\b/i.test(cfReplyText) ? 6 : 0;

  // Penalty: auto-reply or single-word / blank reply
  const isAutoReply = /^(automatic|out of office|auto.?reply)/i.test(cfReplyText.trimStart().slice(0, 60));
  const penalty = isAutoReply ? 40 : replyWordCount < 3 ? 20 : 0;

  const total = Math.max(0, Math.min(100, overlapScore + lengthScore + structScore + actionScore - penalty));

  const reason =
    total >= 80 ? 'Reply is detailed and addresses the customer inquiry well' :
    total >= 60 ? 'Reply addresses the inquiry but could be more thorough' :
    total >= 40 ? 'Reply is brief or only partially addresses the customer concern' :
    isAutoReply ? 'Auto-reply detected — no actual response to customer' :
    'Reply is very short or unrelated to the customer inquiry';

  return { score: total, reason };
}

function scoreTone(cfReplyText: string): number {
  if (!cfReplyText || cfReplyText.trim().length < 5) return 0;
  if (/^(automatic|out of office|auto.?reply)/i.test(cfReplyText.trimStart().slice(0, 60))) return 15;
  let score = 0;
  if (/\b(hi|hello|dear|good morning|good afternoon|greetings)\b/i.test(cfReplyText)) score += 20;
  if (/\b(best|regards|sincerely|thanks|thank you|cheers|warm regards)\b/i.test(cfReplyText)) score += 20;
  if (/\b(please|kindly|appreciate|certainly|absolutely|happy to|glad to)\b/i.test(cfReplyText)) score += 15;
  if (/\b(understand|apologize|sorry|acknowledge|concern|empathize)\b/i.test(cfReplyText)) score += 15;
  const sentences = cfReplyText.split(/[.!?]+/).filter(s => s.trim().length > 5).length;
  score += Math.min(30, sentences * 10);
  return Math.min(100, score);
}

function scoreCompleteness(customerText: string, cfReplyText: string): number {
  if (!cfReplyText || cfReplyText.trim().length < 10) return 0;
  if (/^(automatic|out of office|auto.?reply)/i.test(cfReplyText.trimStart().slice(0, 60))) return 0;
  const numQuestions = (customerText.match(/\?/g) ?? []).length;
  const replyWords = cfReplyText.trim().split(/\s+/).filter(w => w.length > 1).length;
  if (numQuestions === 0) {
    // Statement — score by reply depth
    if (replyWords >= 50) return 100;
    if (replyWords >= 25) return 75;
    if (replyWords >= 10) return 50;
    return 25;
  }
  // Expect ~30 words to address each question
  return Math.min(100, Math.round(replyWords / (numQuestions * 30) * 100));
}

// ── Localization red flags for a non-Indian (US/international) audience ─────────
// CloudFuze's customers are predominantly US/international, so a reply that reads fine
// internally can still land badly with them: Indian-English idioms unfamiliar outside
// India, "lakh"/"crore" (units nobody outside India uses), Indian-style digit grouping
// ("1,00,000" instead of "100,000"), and DD/MM dates (which a US reader defaults to
// reading as MM/DD, i.e. the wrong date). Flagged as a Tone penalty -- this is about how
// professional and clear the reply reads to the actual recipient, not what it says.
const INDIAN_IDIOM_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: '"revert back" / "kindly revert"', regex: /\b(revert\s*back|kindly\s+revert|please\s+revert)\b/i },
  { label: '"do the needful"', regex: /\b(the\s+needful|do\s+the\s+needful)\b/i },
  { label: '"prepone"', regex: /\bprepone(d)?\b/i },
  { label: '"out of station"', regex: /\bout\s+of\s+station\b/i },
  { label: '"good name"', regex: /\b(your\s+)?good\s+name\b/i },
  { label: '"herewith attached" / "attached herewith"', regex: /\b(herewith\s+attached|attached\s+herewith)\b/i },
  { label: '"telephonically"', regex: /\btelephonically\b/i },
  { label: '"please do one thing"', regex: /\bplease\s+do\s+one\s+thing\b/i },
  { label: '"intimate" (as in "please intimate")', regex: /\b(please\s+)?intimate\s+(us|you|me|him|her|them)\b/i },
  { label: '"itself" for emphasis (e.g. "today itself")', regex: /\b(today|now|immediately)\s+itself\b/i },
  { label: '"the same" as a stand-in noun (e.g. "confirm the same")', regex: /\b(confirm|check|revert on|update on|regarding)\s+the\s+same\b/i },
  { label: '"avail" as a verb (e.g. "kindly avail")', regex: /\bkindly\s+avail\b/i },
];

export interface LocalizationIssue {
  type: 'idiom' | 'unit' | 'numberFormat' | 'dateFormat';
  example: string;
  detail: string;
}

function detectLocalizationIssues(text: string): LocalizationIssue[] {
  const issues: LocalizationIssue[] = [];

  for (const { label, regex } of INDIAN_IDIOM_PATTERNS) {
    const m = text.match(regex);
    if (m) { issues.push({ type: 'idiom', example: m[0], detail: `Indian-English phrasing (${label}) that international customers often find unclear` }); break; }
  }

  // "Lakh"/"crore" -- 1 lakh = 100,000, 1 crore = 10,000,000 -- units international
  // readers won't recognize at all.
  const unitMatch = text.match(/\b(\d+(\.\d+)?\s*)?(lakh|lakhs|crore|crores)\b/i);
  if (unitMatch) issues.push({ type: 'unit', example: unitMatch[0], detail: `"${unitMatch[0]}" is an Indian numbering unit — international customers think in thousands/millions, spell out the actual number` });

  // Indian digit grouping (2s after the first 3 digits, e.g. "1,00,000") vs the
  // international 3-digit grouping ("100,000").
  const numFmtMatch = text.match(/\b\d{1,2}(,\d{2})+,\d{3}\b/);
  if (numFmtMatch) issues.push({ type: 'numberFormat', example: numFmtMatch[0], detail: `"${numFmtMatch[0]}" uses Indian-style digit grouping — use standard grouping instead (e.g. "100,000", not "1,00,000")` });

  // DD/MM/YYYY dates are ambiguous at best (US readers default to MM/DD) -- only
  // flagged when the first number is >12, the one case that's unambiguously day-first.
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (day > 12 && month <= 12) { issues.push({ type: 'dateFormat', example: m[0], detail: `"${m[0]}" is a DD/MM date — ambiguous or read as the wrong date by US customers; spell out the month (e.g. "March 25, 2026")` }); break; }
  }

  return issues;
}

// "Big red flag" per the product decision behind this feature -- a single occurrence
// should meaningfully move the score, not get lost in rounding, and stacking several
// still can't push a reply below 0 (the outer Math.max below handles that).
const LOCALIZATION_PENALTY_PER_ISSUE = 25;
const MAX_LOCALIZATION_PENALTY = 75;

function applyLocalizationPenalty(rawToneScore: number, issues: LocalizationIssue[]): number {
  if (issues.length === 0) return rawToneScore;
  const penalty = Math.min(MAX_LOCALIZATION_PENALTY, issues.length * LOCALIZATION_PENALTY_PER_ISSUE);
  return Math.max(0, rawToneScore - penalty);
}

// ── 2026-08-29 team-aware redesign ──────────────────────────────────────────────
// analyzeUser() used to fetch + judge each mailbox in complete isolation: "did I
// personally reply" instead of "did the team reply," "how long since the very first
// message" instead of "how long since the message actually being answered," and a
// content-free "solved in one reply" that a placeholder acknowledgment could win just
// as easily as a real answer -- all documented in detail in the conversation that led
// to this rewrite. The fix: build ONE shared timeline per conversation across the whole
// tracked roster (teamConversationTimeline.ts), segment it into "exchanges" (a customer
// message paired with whichever team reply(ies) actually follow it, from ANYONE), judge
// every exchange ONCE, then attribute credit per person from that shared judgment.

interface ExchangeJudgment {
  exchange: Exchange;
  firstResponder: TimelineEntry | null;     // chronologically first team reply -- gets Speed credit
  substantiveReplier: TimelineEntry | null; // chronologically last team reply -- gets Resolution/reopened attribution
  firstResponseHours: number | null;
  fullResolutionHours: number | null;       // customer message -> substantiveReplier
  wasReopened: boolean;
}

// Judges every exchange across the whole team in one pass, with ONE batched AI call for
// whatever's ambiguous after the free heuristics (not one call per user) -- and critically,
// the AI is given the team's actual last reply as "our answer," not one person's own
// possibly-uninformed view of it.
async function judgeAllExchanges(allExchanges: Exchange[]): Promise<ExchangeJudgment[]> {
  const judgments: ExchangeJudgment[] = allExchanges.map((exchange) => {
    const replies = exchange.teamReplies;
    const rawFirstResponder = replies[0] ?? null;
    const rawSubstantiveReplier = replies[replies.length - 1] ?? null;
    const rawFirstResponseHours = rawFirstResponder ? (rawFirstResponder.time - exchange.customerMessage.time) / 3600000 : null;
    const rawFullResolutionHours = rawSubstantiveReplier ? (rawSubstantiveReplier.time - exchange.customerMessage.time) / 3600000 : null;

    // The customer message here can come from up to CUSTOMER_CONTEXT_LOOKBACK_MS before
    // the scoring window (see buildTeamTimelines' customerLookbackMs) so a reply landing
    // inside the window can still find the question it's actually answering. But we only
    // fetch the TEAM side within the window itself, so we have no visibility into whether
    // an old customer message was already answered before the window started -- if the
    // only reply we can see is implausibly late (same threshold used elsewhere to call a
    // follow-up "a new topic," not a live reopen), it's far more likely we're pairing a
    // stray/unrelated later message with a thread that was already closed off-screen than
    // that someone genuinely took a week+ to respond. Treat it as unanswered for scoring
    // rather than crediting -- or blaming -- anyone for a fabricated multi-day response time.
    const isPlausible = (hours: number | null) => hours !== null && !isLikelyNewTopicByGap(0, hours * 3600000);
    const firstResponder = isPlausible(rawFirstResponseHours) ? rawFirstResponder : null;
    const substantiveReplier = isPlausible(rawFullResolutionHours) ? rawSubstantiveReplier : null;

    return {
      exchange,
      firstResponder,
      substantiveReplier,
      firstResponseHours: firstResponder ? rawFirstResponseHours : null,
      fullResolutionHours: substantiveReplier ? rawFullResolutionHours : null,
      wasReopened: false,
    };
  });

  const ambiguousThreads: AmbiguousThread[] = [];
  const pendingKeys: { index: number; key: string }[] = [];

  judgments.forEach((j, index) => {
    const { exchange } = j;
    if (!exchange.nextCustomerMessage || !j.substantiveReplier) return; // nothing to reopen
    if (exchange.nextCustomerMessage.isAcknowledgment) return;          // free heuristic: closed
    if (isLikelyNewTopicByGap(j.substantiveReplier.time, exchange.nextCustomerMessage.time)) return; // free heuristic: closed
    const key = `${exchange.conversationId}:${exchange.customerMessage.messageId}`;
    ambiguousThreads.push({
      key,
      customerOriginalMessage: exchange.customerMessage.text,
      ourReply: j.substantiveReplier.text,
      customerFollowUp: exchange.nextCustomerMessage.text,
    });
    pendingKeys.push({ index, key });
    j.wasReopened = true; // fail-closed default, same semantics as before AI resolves it
  });

  if (ambiguousThreads.length > 0) {
    const aiResults = await emailThreadClassifierService.classify(ambiguousThreads);
    for (const { index, key } of pendingKeys) {
      const verdict = aiResults.get(key);
      if (verdict === 'NEW_TOPIC' || verdict === 'ACKNOWLEDGMENT') judgments[index].wasReopened = false;
      // else: missing from the AI response, or explicitly SAME_ISSUE -> stays reopened (fail closed)
    }
  }

  return judgments;
}

function fmtWhen(ms: number): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : '';
}

// Truncated, whitespace-collapsed snippet of an actual email body -- the proof itself,
// not just a fact derived from it.
function bodySnippet(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 300 ? clean.slice(0, 300) + '…' : clean;
}

// Keeps only the worst 2 candidates -- "some examples," not every offending thread. Used
// for continuous-score metrics (hours, 0-100 scores) where even a near-perfect person's
// "worst of the sample" is still a real, informative instance. `worseness` should be a
// number where HIGHER = worse (e.g. hours late, or 100 - score where lower is worse).
function worstExamples<T extends { customer: string; when: number; body: string }>(
  candidates: T[],
  worseness: (c: T) => number,
  detail: (c: T) => string,
): ScoreBreakdownExample[] {
  return [...candidates]
    .sort((a, b) => worseness(b) - worseness(a))
    .slice(0, 2)
    .map((c) => ({ customer: c.customer, when: fmtWhen(c.when), detail: detail(c), body: bodySnippet(c.body) }));
}

// For pass/fail metrics (accuracy, 1-reply resolution, reopened) a perfect score means
// there are literally zero "bad" instances -- worstExamples would return nothing, leaving
// a flawless sub-score with no proof at all. Show the bad instances when they exist;
// otherwise fall back to real GOOD instances, so a perfect score is still backed by an
// actual example instead of nothing.
function proofExamples<T extends { customer: string; when: number; body: string }>(
  candidates: T[],
  isBad: (c: T) => boolean,
  detail: (c: T) => string,
): ScoreBreakdownExample[] {
  const bad = candidates.filter(isBad);
  const pool = bad.length > 0 ? bad : candidates;
  return pool.slice(0, 2).map((c) => ({ customer: c.customer, when: fmtWhen(c.when), detail: detail(c), body: bodySnippet(c.body) }));
}

// Pure aggregation + the scoring formula -- unchanged from the original design, just fed
// by team-aware, correctly-paired inputs instead of one person's isolated, first-message-
// anchored view of their own mailbox.
function deriveUserMetrics(userEmail: string, userName: string, judgments: ExchangeJudgment[], orphanMessages: TimelineEntry[] = []): UserEmailHygiene {
  // "Threads" for volume purposes: any conversation where I received a copy of the
  // customer's message, or personally sent a reply into it.
  const myConvIds = new Set<string>();
  for (const j of judgments) {
    const ex = j.exchange;
    if (ex.customerMessage.recipients?.some((r) => r.email === userEmail)) myConvIds.add(ex.conversationId);
    if (ex.teamReplies.some((r) => r.teamMemberEmail === userEmail)) myConvIds.add(ex.conversationId);
  }
  // My own proactive/outbound messages (see findOrphanTeamMessages) -- a conversation I
  // personally reached out on counts as a real customer thread even with no inbound
  // customer message in view.
  const myOrphanMessages = orphanMessages.filter((m) => m.teamMemberEmail === userEmail);
  for (const m of myOrphanMessages) myConvIds.add(m.conversationId);
  const uniqueCustomerThreads = myConvIds.size;

  // ── Speed: exchanges where I was specifically the FIRST team responder ──────────
  const myFirstResponses = judgments.filter((j) => j.firstResponder?.teamMemberEmail === userEmail);
  const firstReplyTimes = myFirstResponses.map((j) => j.firstResponseHours!).filter((h): h is number => h !== null);
  const within4h = firstReplyTimes.filter((h) => h <= 4).length;
  const threadsWithReply = myFirstResponses.length;

  // Best = fastest first response, worst = slowest -- real evidence behind the Speed score.
  let bestSpeed: HygieneExample | null = null;
  let bestSpeedHours = Infinity;
  let worstSpeed: HygieneExample | null = null;
  let worstSpeedHours = -Infinity;
  const firstReplyCandidates: { hours: number; customer: string; when: number; subject: string; body: string }[] = [];
  for (const j of myFirstResponses) {
    if (j.firstResponseHours === null) continue;
    const hours = j.firstResponseHours;
    const ex: HygieneExample = {
      customerText: j.exchange.customerMessage.text,
      replyText: j.firstResponder!.text,
      label: `${hours < 1 ? Math.round(hours * 60) + ' min' : hours.toFixed(1) + 'h'} reply time`,
    };
    if (hours < bestSpeedHours) { bestSpeedHours = hours; bestSpeed = ex; }
    if (hours > worstSpeedHours) { worstSpeedHours = hours; worstSpeed = ex; }
    firstReplyCandidates.push({
      hours,
      customer: j.exchange.customerMessage.customerEmail || 'Unknown customer',
      when: j.exchange.customerMessage.time,
      subject: j.exchange.customerMessage.subject || '(no subject)',
      body: j.firstResponder!.text,
    });
  }
  const worstFirstReplyExamples = worstExamples(firstReplyCandidates, (c) => c.hours,
    (c) => `"${c.subject}" — replied after ${c.hours < 1 ? Math.round(c.hours * 60) + ' min' : c.hours.toFixed(1) + 'h'}`);
  const slaMissExamples = worstExamples(firstReplyCandidates.filter((c) => c.hours > 4), (c) => c.hours,
    (c) => `"${c.subject}" — replied after ${c.hours.toFixed(1)}h, missing the 4h SLA`);

  // ── Resolution: exchanges where I sent the SUBSTANTIVE (last, most representative) reply ──
  const mySubstantiveReplies = judgments.filter((j) => j.substantiveReplier?.teamMemberEmail === userEmail);
  const fullResolutionTimes = mySubstantiveReplies.map((j) => j.fullResolutionHours!).filter((h): h is number => h !== null);
  const oneReplySolved = mySubstantiveReplies.filter((j) => j.exchange.teamReplies.length === 1 && !j.wasReopened).length;
  const reopenedThreads = mySubstantiveReplies.filter((j) => j.wasReopened).length;
  const substantiveCount = mySubstantiveReplies.length;

  // Best = resolved in one reply with no follow-up needed; worst = a reply the customer
  // had to come back on (most recent example of each, so it stays relevant week to week).
  let bestResolution: HygieneExample | null = null;
  let worstResolution: HygieneExample | null = null;
  const resolutionTimeCandidates: { hours: number; customer: string; when: number; subject: string; body: string }[] = [];
  // Every substantive reply, good or bad -- feeds proofExamples() for both resolution
  // sub-metrics below, so a perfect score still shows a real "resolved in 1 reply" /
  // "stayed resolved" instance instead of nothing (there's no "bad" instance to point to).
  const resolutionCandidates: { customer: string; when: number; subject: string; replyCount: number; wasReopened: boolean; body: string }[] = [];
  for (const j of mySubstantiveReplies) {
    const replyText = j.substantiveReplier!.text;
    const customerText = j.exchange.customerMessage.text;
    const customer = j.exchange.customerMessage.customerEmail || 'Unknown customer';
    const when = j.exchange.customerMessage.time;
    const subject = j.exchange.customerMessage.subject || '(no subject)';
    if (j.exchange.teamReplies.length === 1 && !j.wasReopened) {
      bestResolution = { customerText, replyText, label: 'Resolved in 1 reply' };
    }
    if (j.wasReopened) {
      worstResolution = { customerText, replyText, label: 'Reopened by the customer' };
    }
    resolutionCandidates.push({ customer, when, subject, replyCount: j.exchange.teamReplies.length, wasReopened: j.wasReopened, body: replyText });
    if (j.fullResolutionHours !== null) {
      resolutionTimeCandidates.push({ hours: j.fullResolutionHours, customer, when, subject, body: replyText });
    }
  }
  const worstResolutionTimeExamples = worstExamples(resolutionTimeCandidates, (c) => c.hours,
    (c) => `"${c.subject}" — took ${c.hours.toFixed(1)}h to fully resolve`);
  const oneReplyExamples = proofExamples(resolutionCandidates, (c) => c.replyCount > 1,
    (c) => c.replyCount > 1 ? `"${c.subject}" — took ${c.replyCount} replies to resolve` : `"${c.subject}" — resolved in 1 reply, no follow-up needed`);
  const reopenedExamples = proofExamples(resolutionCandidates, (c) => c.wasReopened,
    (c) => c.wasReopened ? `"${c.subject}" — customer came back after it was marked resolved` : `"${c.subject}" — stayed resolved, no follow-up needed`);

  // ── Quality: accuracy rate, checked on my own first-response reply in each exchange
  // I first-responded to, PLUS my own proactive/outbound messages -- "not auto-generated
  // or too short" is a generic substantiveness check that applies to either (exhaustive,
  // not sampled -- it's a cheap length/auto-reply check) ──
  let accurateReplies = 0;
  let accuracyDenominator = 0;
  // Every message checked, good or bad -- feeds proofExamples() so a perfect accuracy
  // score still shows a real substantive reply instead of nothing.
  const accuracyCandidates: { customer: string; when: number; subject: string; ok: boolean; reason: string; body: string }[] = [];
  for (const j of myFirstResponses) {
    const reply = j.firstResponder!;
    const isAuto = /^(automatic reply|out of office|auto.?reply)/i.test(reply.subject ?? '');
    const ok = !isAuto && reply.text.length > 100;
    if (ok) accurateReplies++;
    accuracyCandidates.push({
      customer: j.exchange.customerMessage.customerEmail || 'Unknown customer',
      when: j.exchange.customerMessage.time,
      subject: j.exchange.customerMessage.subject || '(no subject)',
      ok,
      reason: isAuto ? 'auto-reply, not a real answer' : ok ? 'a real, substantive reply' : `only ${reply.text.length} characters`,
      body: reply.text,
    });
    accuracyDenominator++;
  }
  for (const m of myOrphanMessages) {
    const isAuto = /^(automatic reply|out of office|auto.?reply)/i.test(m.subject ?? '');
    const ok = !isAuto && m.text.length > 100;
    if (ok) accurateReplies++;
    accuracyCandidates.push({
      customer: 'Outbound message',
      when: m.time,
      subject: m.subject || '(no subject)',
      ok,
      reason: isAuto ? 'auto-reply, not a real answer' : ok ? 'a real, substantive reply' : `only ${m.text.length} characters`,
      body: m.text,
    });
    accuracyDenominator++;
  }
  const accuracyRate = accuracyDenominator > 0
    ? Math.round((accurateReplies / accuracyDenominator) * 100)
    : 100;
  const accuracyExamples = proofExamples(accuracyCandidates, (c) => !c.ok,
    (c) => `"${c.subject}" — ${c.reason}`);

  const oneReplyResolutionRate = substantiveCount > 0
    ? Math.round((oneReplySolved / substantiveCount) * 100)
    : 0;
  const reopenedThreadRate = substantiveCount > 0
    ? Math.round((reopenedThreads / substantiveCount) * 100)
    : 0;

  // ── Sample MY OWN replies (up to 8) for completeness + tone (+ relevancy for the
  // exchange-based ones) -- each paired against the specific customer message it's
  // actually answering, not always message #1. Proactive/outbound messages are mixed in
  // (isOutbound: true) so a person who mostly reaches out to customers rather than
  // answering them still gets a fair sample, not crowded out by exchange-based replies.
  const myReplySamples: { customerText: string; replyText: string; isOutbound: boolean; customer: string; when: number; subject: string }[] = [];
  for (const j of judgments) {
    for (const reply of j.exchange.teamReplies) {
      if (reply.teamMemberEmail === userEmail) {
        myReplySamples.push({
          customerText: j.exchange.customerMessage.text,
          replyText: reply.text,
          isOutbound: false,
          customer: j.exchange.customerMessage.customerEmail || 'Unknown customer',
          when: j.exchange.customerMessage.time,
          subject: j.exchange.customerMessage.subject || '(no subject)',
        });
      }
    }
  }
  for (const m of myOrphanMessages) {
    myReplySamples.push({ customerText: '', replyText: m.text, isOutbound: true, customer: 'Outbound message', when: m.time, subject: m.subject || '(no subject)' });
  }
  const sample = myReplySamples.slice(0, 8);

  const relevancyScores: number[] = [];
  const completenessScores: number[] = [];
  const rawToneScores: number[] = [];
  let lastReason = '';
  let worstToneEntry: { cfText: string; raw: number } | null = null;
  let worstComplEntry: { custText: string; cfText: string; score: number } | null = null;
  let bestQuality: HygieneExample | null = null;
  let bestQualityScore = -1;
  let worstQuality: HygieneExample | null = null;
  let worstQualityScore = 101;
  let bestTone: HygieneExample | null = null;
  let bestToneScore = -1;
  let worstTone: HygieneExample | null = null;
  let worstToneScore = 101;
  let worstLocalizationEntry: { cfText: string; issues: LocalizationIssue[] } | null = null;
  const relevancyCandidates: { score: number; customer: string; when: number; subject: string; body: string }[] = [];
  const completenessCandidates: { score: number; customer: string; when: number; subject: string; body: string }[] = [];
  const toneCandidates: { score: number; customer: string; when: number; subject: string; body: string }[] = [];

  for (const { customerText, replyText, isOutbound, customer, when, subject } of sample) {
    // Relevancy measures "did this answer what the customer actually asked" -- meaningless
    // (and unfairly punishing, since there's no question to match keywords against) for a
    // proactive/outbound message with no customer question behind it. Completeness and
    // tone both degrade gracefully with an empty customerText, so those still apply.
    if (!isOutbound) {
      const rel = scoreRelevancy(customerText, replyText);
      relevancyScores.push(rel.score);
      lastReason = rel.reason;
      if (rel.score > bestQualityScore) { bestQualityScore = rel.score; bestQuality = { customerText, replyText, label: `${rel.score}/100 relevancy` }; }
      if (rel.score < worstQualityScore) { worstQualityScore = rel.score; worstQuality = { customerText, replyText, label: `${rel.score}/100 relevancy` }; }
      relevancyCandidates.push({ score: rel.score, customer, when, subject, body: replyText });
    }
    const cs = scoreCompleteness(customerText, replyText);
    completenessScores.push(cs);
    completenessCandidates.push({ score: cs, customer, when, subject, body: replyText });
    const localizationIssues = detectLocalizationIssues(replyText);
    const ts = applyLocalizationPenalty(scoreTone(replyText), localizationIssues);
    rawToneScores.push(ts);
    toneCandidates.push({ score: ts, customer, when, subject, body: replyText });
    if (worstToneEntry === null || ts < worstToneEntry.raw) worstToneEntry = { cfText: replyText, raw: ts };
    if (worstComplEntry === null || cs < worstComplEntry.score) worstComplEntry = { custText: customerText, cfText: replyText, score: cs };
    if (localizationIssues.length > 0 && worstLocalizationEntry === null) {
      worstLocalizationEntry = { cfText: replyText, issues: localizationIssues };
    }

    if (ts > bestToneScore) { bestToneScore = ts; bestTone = { customerText, replyText, label: `${ts}/100 tone` }; }
    if (ts < worstToneScore) { worstToneScore = ts; worstTone = { customerText, replyText, label: `${ts}/100 tone` }; }
  }
  const worstRelevancyExamples = worstExamples(relevancyCandidates, (c) => 100 - c.score,
    (c) => `"${c.subject}" — scored ${c.score}/100 relevancy`);
  const worstCompletenessExamples = worstExamples(completenessCandidates, (c) => 100 - c.score,
    (c) => `"${c.subject}" — scored ${c.score}/100 completeness`);
  const worstToneExamples = worstExamples(toneCandidates, (c) => 100 - c.score,
    (c) => `"${c.subject}" — scored ${c.score}/100 tone`);

  const relevancyScore = relevancyScores.length > 0
    ? Math.round(relevancyScores.reduce((a, b) => a + b, 0) / relevancyScores.length)
    : null;
  const relevancySample = relevancyScores.length > 0 ? lastReason : null;
  const completenessRate = Math.min(100, completenessScores.length > 0
    ? Math.round(completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length)
    : 50);
  const rawToneAvg = rawToneScores.length > 0
    ? Math.round(rawToneScores.reduce((a, b) => a + b, 0) / rawToneScores.length)
    : 50;

  // ── Derived time metrics ─────────────────────────────────────────
  const avgFirstReplyTimeHours = firstReplyTimes.length
    ? Math.round(firstReplyTimes.reduce((a, b) => a + b, 0) / firstReplyTimes.length * 10) / 10
    : null;
  const avgFullResolutionTimeHours = fullResolutionTimes.length
    ? Math.round(fullResolutionTimes.reduce((a, b) => a + b, 0) / fullResolutionTimes.length * 10) / 10
    : null;
  const slaHitRate = Math.min(100, threadsWithReply > 0
    ? Math.round((within4h / threadsWithReply) * 100)
    : 0);

  // ── Sub-scores (each 0–10) → category totals ────────────────────
  // Speed /30: Avg 1st Reply (10) + % ≤4h SLA (10) + Avg Resolution (10)
  const avgFirstReplySub = Math.min(10,
    avgFirstReplyTimeHours === null ? 5 :
    avgFirstReplyTimeHours <= 2  ? 10 :
    avgFirstReplyTimeHours <= 4  ? 9  :
    avgFirstReplyTimeHours <= 8  ? 7  :
    avgFirstReplyTimeHours <= 24 ? 5  :
    avgFirstReplyTimeHours <= 48 ? 3  :
    avgFirstReplyTimeHours <= 72 ? 1  : 0
  );
  const slaSub        = Math.min(10, Math.round(slaHitRate / 10));
  const resTimeSub    = Math.min(10,
    avgFullResolutionTimeHours === null   ? 5 :
    avgFullResolutionTimeHours <= 24      ? 10 :
    avgFullResolutionTimeHours <= 48      ? 8  :
    avgFullResolutionTimeHours <= 96      ? 6  :
    avgFullResolutionTimeHours <= 168     ? 4  : 2
  );

  // Quality /30: Relevancy (10) + Accuracy (10) + Completeness (10)
  const relevancySub  = Math.min(10, Math.round((relevancyScore ?? 50) / 10));
  const accuracySub   = Math.min(10, Math.round(accuracyRate / 10));
  const completeSub   = Math.min(10, Math.round(completenessRate / 10));

  // Resolution /20: 1-Reply% (10) + Reopened% inverted (10)
  // Neutral 5/10 when there's no substantive-reply data at all this period, matching
  // Speed's Avg Full Resolution Time and Quality's Relevancy -- rather than the old
  // behavior where "no data" silently became a worst-case 0/10 here and a fabricated
  // perfect 10/10 on Reopened Threads (same root cause, opposite-looking outcomes).
  const oneReplySub   = substantiveCount === 0 ? 5 : Math.min(10, Math.round(oneReplyResolutionRate / 10));
  const reopenedSub   = substantiveCount === 0 ? 5 : Math.min(10, Math.round((100 - reopenedThreadRate) / 10));

  // Tone /20: raw 0–100 → 0–20
  const toneScore     = Math.min(20, Math.round(rawToneAvg / 5));

  const speedScore      = avgFirstReplySub + slaSub + resTimeSub;   // 0–30
  const qualityScore    = relevancySub + accuracySub + completeSub; // 0–30
  const resolutionScore = oneReplySub + reopenedSub;                 // 0–20
  const emailHygieneScore = speedScore + qualityScore + resolutionScore + toneScore; // 0–100

  // ── Score breakdown — every sub-metric behind every category, always populated (not
  // just the weak ones like `insights` below), so "why is my score X" has a real answer
  // for every category, not only the ones that happen to be under-performing. ──
  const tip = (ok: boolean, text: string): string | null => (ok ? null : text);
  const scoreBreakdown: ScoreBreakdown = {
    speed: [
      {
        label: 'Avg First Reply Time',
        value: avgFirstReplyTimeHours === null ? 'No first reply credited to you this period' : `${avgFirstReplyTimeHours}h average before your first reply`,
        subScore: avgFirstReplySub, maxSubScore: 10,
        tip: tip(avgFirstReplySub >= 9, avgFirstReplyTimeHours === null
          ? `No customer thread this period has you as the first responder — this defaults to a neutral 5/10. Jump in first on live threads to earn a real score here.`
          : `You're averaging ${avgFirstReplyTimeHours}h before your first reply, which scores ${avgFirstReplySub}/10. Reply within 2 hours for full marks (10/10) — anything past 72h scores 0.`),
        examples: worstFirstReplyExamples,
      },
      {
        label: 'SLA Hit Rate (≤4h)',
        value: `${slaHitRate}% of your first replies landed within 4 hours`,
        subScore: slaSub, maxSubScore: 10,
        tip: tip(slaSub >= 9, `Only ${slaHitRate}% of your replies beat the 4-hour mark, scoring ${slaSub}/10. Aim to reply within 4 hours every time for full marks.`),
        examples: slaMissExamples.length > 0 ? slaMissExamples : worstFirstReplyExamples,
      },
      {
        label: 'Avg Full Resolution Time',
        value: avgFullResolutionTimeHours === null ? 'No thread you fully resolved this period' : `${avgFullResolutionTimeHours}h average to fully resolve a thread`,
        subScore: resTimeSub, maxSubScore: 10,
        tip: tip(resTimeSub >= 9, avgFullResolutionTimeHours === null
          ? `No thread this period has you as the one who resolved it — this defaults to a neutral 5/10.`
          : `Full resolution averaged ${avgFullResolutionTimeHours}h, scoring ${resTimeSub}/10. Resolving within 24 hours earns full marks (10/10).`),
        examples: worstResolutionTimeExamples,
      },
    ],
    quality: [
      {
        label: 'Relevancy',
        value: relevancyScore === null ? 'No sampled reply to score' : `${relevancyScore}/100 — how directly your reply addressed the customer's actual question`,
        subScore: relevancySub, maxSubScore: 10,
        tip: tip(relevancySub >= 9, relevancyScore === null
          ? `No reply was sampled for relevancy this period — this defaults to a neutral 5/10.`
          : `Your replies scored ${relevancyScore}/100 on relevancy, i.e. ${relevancySub}/10 here. Reference the customer's specific wording/keywords and answer everything they actually asked, not just part of it.`),
        examples: worstRelevancyExamples,
      },
      {
        label: 'Accuracy',
        value: `${accuracyRate}% of your replies were substantive (not auto-generated or under 100 characters)`,
        subScore: accuracySub, maxSubScore: 10,
        tip: tip(accuracySub >= 9, `${100 - accuracyRate}% of your replies were auto-generated or too short to count as a real answer, scoring ${accuracySub}/10. Send a personalized, substantive reply every time.`),
        examples: accuracyExamples,
      },
      {
        label: 'Completeness',
        value: sample.length === 0 ? 'No sampled reply to score' : `${completenessRate}/100 — how fully your replies covered what was asked`,
        subScore: completeSub, maxSubScore: 10,
        tip: tip(completeSub >= 9, sample.length === 0
          ? `No reply was sampled for completeness this period — this defaults to a neutral 5/10.`
          : `Completeness scored ${completenessRate}/100 (${completeSub}/10). Address every question the customer raised and explain next steps/timeline, not just a partial answer.`),
        examples: worstCompletenessExamples,
      },
    ],
    resolution: [
      {
        label: '1-Reply Resolution',
        value: substantiveCount === 0 ? 'No thread you fully resolved this period' : `${oneReplyResolutionRate}% of your resolved threads were closed in a single reply`,
        subScore: oneReplySub, maxSubScore: 10,
        tip: tip(oneReplySub >= 9, substantiveCount === 0
          ? `No thread this period has you as the one who resolved it — this defaults to a neutral 5/10.`
          : `Only ${oneReplyResolutionRate}% of your resolutions took just one reply, scoring ${oneReplySub}/10. Include all necessary details (next steps, ETA, owner) in your first response to avoid back-and-forth.`),
        examples: oneReplyExamples,
      },
      {
        label: 'Reopened Threads',
        value: substantiveCount === 0 ? 'No thread you fully resolved this period' : `${reopenedThreadRate}% of your resolved threads were reopened by the customer afterward`,
        subScore: reopenedSub, maxSubScore: 10,
        tip: tip(reopenedSub >= 9, substantiveCount === 0
          ? `No thread this period has you as the one who resolved it — this defaults to a neutral 5/10.`
          : `${reopenedThreadRate}% of your "resolved" threads came back, scoring ${reopenedSub}/10. Double-check your reply is genuinely final — anticipate the obvious follow-up question — before treating a thread as resolved.`),
        examples: reopenedExamples,
      },
    ],
    tone: [
      {
        label: 'Tone & Professionalism',
        value: sample.length === 0 ? 'No sampled reply to score' : `${rawToneAvg}/100 — greeting, sign-off, empathy, and professionalism across your replies`,
        subScore: toneScore, maxSubScore: 20,
        tip: sample.length === 0
          ? tip(toneScore >= 18, `No reply was sampled for tone this period — this defaults to a neutral ${toneScore}/20.`)
          : worstLocalizationEntry
            ? `${worstLocalizationEntry.issues.map((i) => i.detail).join(' Also: ')}. CloudFuze's customers are predominantly US/international — this is already reflected in the ${rawToneAvg}/100 (${toneScore}/20) above.`
            : tip(toneScore >= 18, `Tone scored ${rawToneAvg}/100 (${toneScore}/20). Open with a greeting, close with a professional sign-off, and use empathy phrases like "I understand your concern" or "I appreciate your patience."`),
        examples: worstToneExamples,
      },
    ],
  };

  // ── Improvement insights (only for weak sub-scores) ──────────────
  const insights: ImprovementInsight[] = [];

  if (avgFirstReplySub < 5 && avgFirstReplyTimeHours !== null) {
    insights.push({
      category: 'speed',
      metric: 'Avg First Reply',
      score: avgFirstReplySub,
      maxScore: 10,
      originalLine: `Average first reply sent ${avgFirstReplyTimeHours.toFixed(1)} hours after the customer's message.`,
      improvedLine: `Acknowledge within 4 hours: "Hi [Customer Name], thank you for reaching out! I've received your message and am looking into it — I'll update you by [time/date]."`,
    });
  }

  if (slaSub < 5) {
    insights.push({
      category: 'speed',
      metric: '% ≤4h SLA',
      score: slaSub,
      maxScore: 10,
      originalLine: `Only ${slaHitRate}% of customer threads received a first reply within 4 hours.`,
      improvedLine: `Quick acknowledgment template: "Hi [Customer], I've received your message and will respond with full details by [time]. Thank you for your patience."`,
    });
  }

  if (toneScore < 12 && worstToneEntry) {
    const snippet = worstToneEntry.cfText.replace(/\s+/g, ' ').slice(0, 250).trim();
    const hasGreeting = /\b(hi|hello|dear|good morning|good afternoon|greetings)\b/i.test(snippet);
    const hasSignOff = /\b(best|regards|sincerely|thanks|thank you|cheers|warm regards)\b/i.test(snippet);
    const missing = [...(!hasGreeting ? ['greeting'] : []), ...(!hasSignOff ? ['professional sign-off'] : [])];
    insights.push({
      category: 'tone',
      metric: 'Tone',
      score: toneScore,
      maxScore: 20,
      originalLine: snippet + (worstToneEntry.cfText.length > 250 ? '…' : ''),
      improvedLine: missing.length > 0
        ? `Missing ${missing.join(' and ')}. Suggested version:\n"Hi [Customer Name],\n\n${snippet.slice(0, 180)}${snippet.length > 180 ? '…' : ''}\n\nBest regards,\n[Your Name]"`
        : `Add empathy phrases: "I understand your concern" / "I appreciate your patience" and close with "Please feel free to reach out if you need further assistance."`,
    });
  }

  // Separate from the generic Tone insight above so the fix is precise: "add a greeting"
  // doesn't help someone whose actual problem is an Indian-English idiom or a DD/MM date.
  if (worstLocalizationEntry) {
    const snippet = worstLocalizationEntry.cfText.replace(/\s+/g, ' ').slice(0, 250).trim();
    const details = worstLocalizationEntry.issues.map((i) => i.detail).join(' Also: ');
    insights.push({
      category: 'tone',
      metric: 'International Clarity',
      score: toneScore,
      maxScore: 20,
      originalLine: snippet + (worstLocalizationEntry.cfText.length > 250 ? '…' : ''),
      improvedLine: `${details}. CloudFuze's customers are predominantly US/international — use plain international English, spell out numbers in thousands/millions instead of lakh/crore, standard digit grouping (100,000 not 1,00,000), and unambiguous dates (e.g. "March 25, 2026").`,
    });
  }

  if (completeSub < 5 && worstComplEntry) {
    const numQ = (worstComplEntry.custText.match(/\?/g) ?? []).length;
    const qLines = worstComplEntry.custText
      .split('?')
      .slice(0, -1)
      .map(s => s.split(/[.!\n]+/).filter(l => l.trim().length > 5).pop()?.trim() ?? '')
      .filter(s => s.length > 5)
      .slice(0, 3);
    const replySnip = worstComplEntry.cfText.replace(/\s+/g, ' ').slice(0, 200).trim();
    insights.push({
      category: 'quality',
      metric: 'Completeness',
      score: completeSub,
      maxScore: 10,
      originalLine: numQ > 0
        ? `Customer asked ${numQ} question(s). Example: "${qLines[0] ?? ''}?" — Reply: "${replySnip}${replySnip.length > 150 ? '…' : ''}"`
        : `Short reply: "${replySnip}${replySnip.length > 150 ? '…' : ''}"`,
      improvedLine: numQ > 0
        ? `Address each question explicitly:\n${qLines.map((q, i) => `${i + 1}. ${q}? → [Your answer here]`).join('\n')}`
        : `Aim for at least 50 words. Explain the next steps, the timeline, and who the customer can follow up with.`,
    });
  }

  if (accuracySub < 5) {
    insights.push({
      category: 'quality',
      metric: 'Accuracy',
      score: accuracySub,
      maxScore: 10,
      originalLine: `${100 - accuracyRate}% of replies were auto-generated or too short (under 100 characters) to be a substantive response.`,
      improvedLine: `Replace auto-replies with a personal note: "Hi [Customer], I've received your message and will look into [topic] right away. I'll update you by [timeframe]."`,
    });
  }

  if (oneReplySub < 5) {
    insights.push({
      category: 'resolution',
      metric: '1-Reply Resolution',
      score: oneReplySub,
      maxScore: 10,
      originalLine: `Only ${oneReplyResolutionRate}% of customer threads were fully resolved in a single reply.`,
      improvedLine: `Aim to include all necessary details (next steps, ETA, follow-up owner) in the first response to reduce back-and-forth.`,
    });
  }

  return {
    userEmail,
    userName,
    uniqueCustomerThreads,
    avgFirstReplyTimeHours,
    slaHitRate,
    avgFullResolutionTimeHours,
    relevancyScore,
    relevancySample,
    accuracyRate,
    completenessRate,
    oneReplyResolutionRate,
    reopenedThreadRate,
    toneScore,
    speedScore,
    qualityScore,
    resolutionScore,
    emailHygieneScore,
    insights,
    bestWorst: {
      speed: { best: bestSpeed, worst: worstSpeed },
      quality: { best: bestQuality, worst: worstQuality },
      resolution: { best: bestResolution, worst: worstResolution },
      tone: { best: bestTone, worst: worstTone },
    },
    scoreBreakdown,
  };
}

// In-process sync state — prevents concurrent Graph API syncs and lets the
// frontend poll for completion without holding the HTTP connection open.
type SyncState = { running: boolean; startedAt: string | null; completedAt: string | null; error: string | null };
let _syncState: SyncState = { running: false, startedAt: null, completedAt: null, error: null };

// Short-lived in-memory cache, keyed by week-start date, for any week's trend point that
// has to be computed live via Graph rather than read from a finalized DB row — this is a
// real week-scoped Graph fetch (not the rolling 30-day cache), so without this, opening the
// trend chart repeatedly would re-run a full Graph sync every time. 30 min is short enough
// that a live week still feels current, long enough to absorb repeat page views. Normally
// holds just the in-progress current week; briefly holds two entries (previous + current)
// in the ~7h window between a week ending and the Monday 7AM finalize cron catching up —
// see the "gap week" handling in getWeeklyTrend() below.
const CURRENT_WEEK_TTL_MS = 30 * 60 * 1000;
const _liveWeekCache = new Map<string, { computedAt: number; metrics: UserEmailHygiene[]; teamHygiene: TeamHygieneRow[] }>();
// Weeks with a background fetch already in flight -- prevents two overlapping requests
// for the same cold week from both kicking off their own redundant multi-minute sync.
const _liveWeekFetchInFlight = new Set<string>();

function getCachedLiveWeek(weekStartDate: string): { metrics: UserEmailHygiene[]; teamHygiene: TeamHygieneRow[] } | null {
  const cached = _liveWeekCache.get(weekStartDate);
  if (cached && Date.now() - cached.computedAt < CURRENT_WEEK_TTL_MS) return cached;
  return null;
}

// 2026-09-01 fix: getWeeklyTrend() used to `await` this computation directly inside the
// GET request -- a full team Graph sync + AI classification pass, easily 2-5 minutes.
// With the gap-week fix above, a single request could trigger this TWICE in sequence
// (once for a stale gap week, once for the current week), comfortably exceeding nginx's
// 300s proxy_read_timeout and surfacing as a 504 in the browser -- exactly the failure
// mode triggerBackgroundSync() above was already built to avoid for the manual sync
// button. This does the same thing here: never block the request on a cold cache entry.
// Fire the real computation in the background and let the CALLER's current response
// show "no data yet" for that one week -- the next poll/reload picks it up once the
// background fetch lands in _liveWeekCache.
function triggerBackgroundLiveWeekFetch(weekStartDate: string, since: Date, until?: Date): void {
  if (_liveWeekFetchInFlight.has(weekStartDate)) return;
  _liveWeekFetchInFlight.add(weekStartDate);
  (async () => {
    try {
      const client = graphClient(await getAccessToken());
      const { metrics, teamHygiene } = await computeMetricsForWindow(client, since.toISOString(), until?.toISOString());
      _liveWeekCache.set(weekStartDate, { computedAt: Date.now(), metrics, teamHygiene });
      if (_liveWeekCache.size > 4) {
        const oldestKey = [..._liveWeekCache.entries()].sort((a, b) => a[1].computedAt - b[1].computedAt)[0][0];
        _liveWeekCache.delete(oldestKey);
      }
    } catch (err) {
      logger.error(`[EmailHygiene] Background live-week fetch failed for ${weekStartDate}:`, err);
    } finally {
      _liveWeekFetchInFlight.delete(weekStartDate);
    }
  })();
}

// How far before a scoring window's `since` to still look for the customer message a
// reply is actually answering (see buildTeamTimelines()'s customerLookbackMs param).
// judgeAllExchanges() below already discards any pairing more than 5 days old as
// implausible, so this just needs enough margin past that to catch a reply landing a
// day or two after the 5-day cutoff -- no benefit to reaching back further than that.
const CUSTOMER_CONTEXT_LOOKBACK_MS = 10 * 24 * 3600 * 1000;

// Shared by the rolling 30-day cache path (getHygieneMetrics) and the weekly-window path
// (getWeeklyMetrics/finalizeWeek below) — discovers users, filters to valid mailboxes,
// and analyzes them for an arbitrary [since, until) window. `until` omitted means
// "through now" (used for the rolling view and the current in-progress week).
async function computeMetricsForWindow(
  client: AxiosInstance,
  since: string,
  until?: string
): Promise<{ metrics: UserEmailHygiene[]; teamHygiene: TeamHygieneRow[] }> {
  const allUsers = await getCFUsers();
  logger.info(`Email hygiene: discovered ${allUsers.length} candidate CF users`);

  const validUsers: Array<{ email: string; name: string }> = [];
  for (let i = 0; i < allUsers.length; i += 5) {
    const batch = allUsers.slice(i, i + 5);
    const checks = await Promise.allSettled(
      batch.map(async u => {
        const exists = await userMailboxExists(client, encodeURIComponent(u.email));
        return exists ? u : null;
      })
    );
    for (const r of checks) {
      if (r.status === 'fulfilled' && r.value) validUsers.push(r.value);
      else if (r.status === 'rejected') logger.warn('Mailbox existence check error:', r.reason?.message);
    }
  }
  logger.info(`Email hygiene: ${validUsers.length}/${allUsers.length} users have accessible mailboxes`);

  // One shared fetch + correlation across the whole roster (team-aware redesign,
  // 2026-08-29) instead of each mailbox being analyzed in isolation -- see the comment
  // above judgeAllExchanges() for why this matters. The customer-side lookback (2026-08-31
  // fix) lets a reply sent inside [since, until) still find and pair with the customer
  // message it's actually answering even when that message arrived before `since` -- see
  // the comment on buildTeamTimelines() itself for why that pairing would otherwise fail.
  const timelines = await buildTeamTimelines(client, validUsers, since, until, 3, CUSTOMER_CONTEXT_LOOKBACK_MS);
  const allExchanges: Exchange[] = [];
  // Proactive/outbound customer messages (status updates, meeting bookings, kickoff decks)
  // that don't answer any customer message in this timeline -- see findOrphanTeamMessages()
  // for why the Exchange model alone misses these entirely. Real, common in an active
  // migration business; credited toward Quality/Tone below, never Speed/Resolution (there's
  // nothing to measure a response time against).
  const orphanTeamMessages: TimelineEntry[] = [];
  for (const tl of timelines.values()) {
    allExchanges.push(...buildExchanges(tl));
    orphanTeamMessages.push(...findOrphanTeamMessages(tl));
  }
  logger.info(`Email hygiene: built ${timelines.size} conversation timelines, ${allExchanges.length} exchanges, ${orphanTeamMessages.length} proactive/outbound messages`);

  const judgments = await judgeAllExchanges(allExchanges);

  const results: UserEmailHygiene[] = validUsers.map((u) => deriveUserMetrics(u.email, u.name, judgments, orphanTeamMessages));

  const sorted = results.sort((a, b) => b.emailHygieneScore - a.emailHygieneScore);
  return { metrics: sorted, teamHygiene: computeTeamHygiene(sorted) };
}

export const emailHygieneService = {
  isConfigured: isGraphConfigured,

  getSyncState(): SyncState {
    return { ..._syncState };
  },

  triggerBackgroundSync(): { alreadyRunning: boolean } {
    if (_syncState.running) return { alreadyRunning: true };
    _syncState = { running: true, startedAt: new Date().toISOString(), completedAt: null, error: null };
    // Fire-and-forget — response returns 202 immediately
    emailHygieneService.getHygieneMetrics(true)
      .then(() => {
        _syncState = { running: false, startedAt: _syncState.startedAt, completedAt: new Date().toISOString(), error: null };
        logger.info('[EmailHygiene] Background sync completed');
      })
      .catch((err: any) => {
        const msg = err?.message ?? 'Unknown error';
        _syncState = { running: false, startedAt: _syncState.startedAt, completedAt: new Date().toISOString(), error: msg };
        logger.error('[EmailHygiene] Background sync failed:', msg);
      });
    return { alreadyRunning: false };
  },

  async getHygieneMetrics(forceRefresh = false): Promise<{
    metrics: UserEmailHygiene[];
    teamHygiene: TeamHygieneRow[];
    segmentHeads: Record<'ENT' | 'SMB', SegmentHead>;
    computedAt: string;
    periodStart: string;
    periodEnd: string;
    isConfigured: boolean;
    authError?: string;
  }> {
    if (!isGraphConfigured()) {
      return {
        metrics: [],
        teamHygiene: [],
        segmentHeads: computeSegmentHeads([]),
        computedAt: new Date().toISOString(),
        periodStart: '',
        periodEnd: '',
        isConfigured: false,
      };
    }

    // Return cached if fresh enough AND schema matches current format
    if (!forceRefresh) {
      try {
        const cached = await query(
          `SELECT * FROM email_hygiene_cache ORDER BY computed_at DESC LIMIT 1`
        );
        if (cached.rows.length > 0) {
          const row = cached.rows[0];
          const metrics = row.metrics as any[];
          // Invalidate if written with an older schema — team_hygiene column holds the
          // roster-based teamHygiene array added 2026-08-19 (replacing the old
          // per-user teamHygieneScore/teamDlEmail fields from the dead DL-mailbox approach).
          const isNewSchema = metrics.length === 0 || Array.isArray(metrics[0]?.insights);
          if (isNewSchema && row.team_hygiene !== null && Date.now() - new Date(row.computed_at).getTime() < CACHE_TTL_MS) {
            const cachedTeamHygiene = row.team_hygiene as TeamHygieneRow[];
            return {
              metrics: metrics as UserEmailHygiene[],
              teamHygiene: cachedTeamHygiene,
              segmentHeads: computeSegmentHeads(cachedTeamHygiene),
              computedAt: row.computed_at as string,
              periodStart: row.period_start as string,
              periodEnd: row.period_end as string,
              isConfigured: true,
            };
          }
        }
      } catch {
        // cache miss — proceed to fetch
      }
    }

    let token: string;
    try {
      token = await getAccessToken();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; error_description?: string } }; message?: string };
      const status = axiosErr?.response?.status;
      const desc = axiosErr?.response?.data?.error_description || axiosErr?.response?.data?.error || axiosErr?.message || 'Unknown error';
      const detail = status ? `HTTP ${status}: ${desc}` : desc;
      logger.error('Email hygiene: Graph API token fetch failed:', detail);
      return {
        metrics: [],
        teamHygiene: [],
        segmentHeads: computeSegmentHeads([]),
        computedAt: new Date().toISOString(),
        periodStart: '',
        periodEnd: '',
        isConfigured: true,
        authError: detail,
      };
    }
    const client = graphClient(token);
    // 2026-08-25: changed from a rolling 30-day window to the current Mon-Sun (IST)
    // calendar week to date, per the weekly-hygiene redesign — see the matching comment
    // in callHygieneService.ts.
    const periodEnd = new Date();
    const periodStart = getIstWeekBounds(0).weekStart;
    const { metrics: sorted, teamHygiene } = await computeMetricsForWindow(client, periodStart.toISOString());

    // Persist cache
    await execute(
      `INSERT INTO email_hygiene_cache (period_start, period_end, metrics, team_hygiene) VALUES ($1, $2, $3, $4)`,
      [periodStart.toISOString(), periodEnd.toISOString(), JSON.stringify(sorted), JSON.stringify(teamHygiene)]
    );
    // Keep only 5 entries
    await execute(
      `DELETE FROM email_hygiene_cache WHERE id NOT IN (
         SELECT id FROM email_hygiene_cache ORDER BY computed_at DESC LIMIT 5
       )`
    );

    return {
      metrics: sorted,
      teamHygiene,
      segmentHeads: computeSegmentHeads(teamHygiene),
      computedAt: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      isConfigured: true,
    };
  },

  // Locks in a permanent snapshot for a completed Mon-Sun (IST) week — weeksAgo=1 (the
  // Monday 7AM IST cron's default) means "the week that just ended"; a larger weeksAgo
  // lets you backfill weeks that passed before this feature existed (e.g. earlier weeks of
  // the current month that never got a chance to auto-finalize). Idempotent: does nothing
  // if that week already has a row (UNIQUE on week_start), so a retry or backfill re-run is
  // always safe.
  async finalizeWeek(weeksAgo = 1): Promise<{ finalized: boolean; weekStartDate: string }> {
    const { weekStart, weekEnd } = getIstWeekBounds(weeksAgo);
    const weekStartDate = istDateStr(weekStart);
    if (!isGraphConfigured()) return { finalized: false, weekStartDate };

    const existing = await query(`SELECT id FROM email_hygiene_weekly WHERE week_start = $1`, [weekStartDate]);
    if (existing.rows.length > 0) return { finalized: false, weekStartDate };

    const token = await getAccessToken();
    const client = graphClient(token);
    const { metrics, teamHygiene } = await computeMetricsForWindow(client, weekStart.toISOString(), weekEnd.toISOString());

    await execute(
      `INSERT INTO email_hygiene_weekly (week_start, week_end, metrics, team_hygiene) VALUES ($1, $2, $3, $4)
       ON CONFLICT (week_start) DO NOTHING`,
      [weekStartDate, istDateStr(weekEnd), JSON.stringify(metrics), JSON.stringify(teamHygiene)]
    );
    logger.info(`[EmailHygiene] Finalized week of ${weekStartDate} — ${metrics.length} users`);
    return { finalized: true, weekStartDate };
  },

  // Every finalized week whose Monday falls in the current IST calendar month, plus the
  // current in-progress week computed live (isCurrent: true, never persisted) — this is
  // what the "week 1/2/3/4 of this month" trend chart reads directly.
  async getWeeklyTrend(): Promise<{
    weeks: Array<{ weekStart: string; weekEnd: string; isCurrent: boolean; hasData: boolean; metrics: UserEmailHygiene[]; teamHygiene: TeamHygieneRow[] }>;
    isConfigured: boolean;
  }> {
    if (!isGraphConfigured()) return { weeks: [], isConfigured: false };

    const monthWeeks = weeksInCurrentIstMonth();
    const { weekStart: currentWeekStart } = getIstWeekBounds(0);
    const currentWeekStartDate = istDateStr(currentWeekStart);
    const finalizedWeekDates = monthWeeks.filter(d => d !== currentWeekStartDate);

    const finalizedRows = finalizedWeekDates.length
      ? (await query(
          `SELECT week_start, week_end, metrics, team_hygiene FROM email_hygiene_weekly WHERE week_start = ANY($1)`,
          [finalizedWeekDates]
        )).rows
      : [];
    const byWeekStart = new Map(finalizedRows.map((r: any) => [istDateStr(new Date(r.week_start)), r]));

    // A week can be part of this month, not the live current week, and still have no
    // finalized row -- that's not stale data, it's the ~7h gap every Monday between a week
    // ending at midnight IST and the 7AM IST finalize cron catching up. Rather than show a
    // false blank for a week that's fully knowable, this endpoint checks the same in-memory
    // cache the current week uses. Critically, it never AWAITS a cold cache miss (see
    // triggerBackgroundLiveWeekFetch above) -- this whole function only ever does DB reads
    // and in-memory lookups, so it can't itself time out at the nginx/proxy layer the way a
    // multi-minute live Graph sync can.

    // One slot per week-of-month, in order, even when a week was never finalized (e.g. it
    // passed before this feature existed) — this is what keeps "Wk 1/2/3/4" correctly
    // positioned instead of silently collapsing to just whichever weeks happen to have data.
    const weeks = finalizedWeekDates.map((weekStartDate) => {
      const r: any = byWeekStart.get(weekStartDate);
      if (r) {
        return {
          weekStart: istDateStr(new Date(r.week_start)),
          weekEnd: istDateStr(new Date(r.week_end)),
          isCurrent: false,
          hasData: true,
          metrics: r.metrics as UserEmailHygiene[],
          teamHygiene: (r.team_hygiene ?? []) as TeamHygieneRow[],
        };
      }
      const weekStart = new Date(`${weekStartDate}T00:00:00.000+05:30`);
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000 - 1);
      const cached = getCachedLiveWeek(weekStartDate);
      if (cached) {
        return { weekStart: weekStartDate, weekEnd: istDateStr(weekEnd), isCurrent: false, hasData: true, metrics: cached.metrics, teamHygiene: cached.teamHygiene };
      }
      triggerBackgroundLiveWeekFetch(weekStartDate, weekStart, weekEnd);
      return { weekStart: weekStartDate, weekEnd: istDateStr(weekEnd), isCurrent: false, hasData: false, metrics: [], teamHygiene: [] };
    });

    // Current week -- same non-blocking cache-or-trigger-and-return pattern.
    const cachedCurrent = getCachedLiveWeek(currentWeekStartDate);
    const currentWeekEnd = istDateStr(getIstWeekBounds(0).weekEnd);
    if (cachedCurrent) {
      weeks.push({
        weekStart: currentWeekStartDate,
        weekEnd: currentWeekEnd,
        isCurrent: true,
        hasData: true,
        metrics: cachedCurrent.metrics,
        teamHygiene: cachedCurrent.teamHygiene,
      });
    } else {
      triggerBackgroundLiveWeekFetch(currentWeekStartDate, currentWeekStart);
      weeks.push({ weekStart: currentWeekStartDate, weekEnd: currentWeekEnd, isCurrent: true, hasData: false, metrics: [], teamHygiene: [] });
    }

    return { weeks, isConfigured: true };
  },
};
