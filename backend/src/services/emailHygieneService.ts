import { type AxiosInstance } from 'axios';
import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { getIstWeekBounds, istDateStr, weeksInCurrentIstMonth } from '../utils/weekBounds';
import { emailThreadClassifierService, type AmbiguousThread } from './emailThreadClassifierService';
import {
  isGraphConfigured, getAccessToken, graphClient, buildTeamTimelines, buildExchanges,
  isLikelyNewTopicByGap, type Exchange, type TimelineEntry,
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
    const firstResponder = replies[0] ?? null;
    const substantiveReplier = replies[replies.length - 1] ?? null;
    return {
      exchange,
      firstResponder,
      substantiveReplier,
      firstResponseHours: firstResponder ? (firstResponder.time - exchange.customerMessage.time) / 3600000 : null,
      fullResolutionHours: substantiveReplier ? (substantiveReplier.time - exchange.customerMessage.time) / 3600000 : null,
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

// Pure aggregation + the scoring formula -- unchanged from the original design, just fed
// by team-aware, correctly-paired inputs instead of one person's isolated, first-message-
// anchored view of their own mailbox.
function deriveUserMetrics(userEmail: string, userName: string, judgments: ExchangeJudgment[]): UserEmailHygiene {
  // "Threads" for volume purposes: any conversation where I received a copy of the
  // customer's message, or personally sent a reply into it.
  const myConvIds = new Set<string>();
  for (const j of judgments) {
    const ex = j.exchange;
    if (ex.customerMessage.recipients?.some((r) => r.email === userEmail)) myConvIds.add(ex.conversationId);
    if (ex.teamReplies.some((r) => r.teamMemberEmail === userEmail)) myConvIds.add(ex.conversationId);
  }
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
  }

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
  for (const j of mySubstantiveReplies) {
    const replyText = j.substantiveReplier!.text;
    const customerText = j.exchange.customerMessage.text;
    if (j.exchange.teamReplies.length === 1 && !j.wasReopened) {
      bestResolution = { customerText, replyText, label: 'Resolved in 1 reply' };
    }
    if (j.wasReopened) {
      worstResolution = { customerText, replyText, label: 'Reopened by the customer' };
    }
  }

  // ── Quality: accuracy rate, checked on my own first-response reply in each exchange
  // I first-responded to (exhaustive, not sampled -- it's a cheap length/auto-reply check) ──
  let accurateReplies = 0;
  for (const j of myFirstResponses) {
    const reply = j.firstResponder!;
    const isAuto = /^(automatic reply|out of office|auto.?reply)/i.test(reply.subject ?? '');
    if (!isAuto && reply.text.length > 100) accurateReplies++;
  }
  const accuracyRate = threadsWithReply > 0
    ? Math.round((accurateReplies / threadsWithReply) * 100)
    : 100;

  const oneReplyResolutionRate = substantiveCount > 0
    ? Math.round((oneReplySolved / substantiveCount) * 100)
    : 0;
  const reopenedThreadRate = substantiveCount > 0
    ? Math.round((reopenedThreads / substantiveCount) * 100)
    : 0;

  // ── Sample MY OWN replies (up to 5) for relevancy + completeness + tone -- each paired
  // against the specific customer message it's actually answering, not always message #1 ──
  const myReplySamples: { customerText: string; replyText: string }[] = [];
  for (const j of judgments) {
    for (const reply of j.exchange.teamReplies) {
      if (reply.teamMemberEmail === userEmail) {
        myReplySamples.push({ customerText: j.exchange.customerMessage.text, replyText: reply.text });
      }
    }
  }
  const sample = myReplySamples.slice(0, 5);

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

  for (const { customerText, replyText } of sample) {
    const rel = scoreRelevancy(customerText, replyText);
    relevancyScores.push(rel.score);
    lastReason = rel.reason;
    const cs = scoreCompleteness(customerText, replyText);
    completenessScores.push(cs);
    const ts = scoreTone(replyText);
    rawToneScores.push(ts);
    if (worstToneEntry === null || ts < worstToneEntry.raw) worstToneEntry = { cfText: replyText, raw: ts };
    if (worstComplEntry === null || cs < worstComplEntry.score) worstComplEntry = { custText: customerText, cfText: replyText, score: cs };

    if (rel.score > bestQualityScore) { bestQualityScore = rel.score; bestQuality = { customerText, replyText, label: `${rel.score}/100 relevancy` }; }
    if (rel.score < worstQualityScore) { worstQualityScore = rel.score; worstQuality = { customerText, replyText, label: `${rel.score}/100 relevancy` }; }
    if (ts > bestToneScore) { bestToneScore = ts; bestTone = { customerText, replyText, label: `${ts}/100 tone` }; }
    if (ts < worstToneScore) { worstToneScore = ts; worstTone = { customerText, replyText, label: `${ts}/100 tone` }; }
  }

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
  const oneReplySub   = Math.min(10, Math.round(oneReplyResolutionRate / 10));
  const reopenedSub   = Math.min(10, Math.round((100 - reopenedThreadRate) / 10));

  // Tone /20: raw 0–100 → 0–20
  const toneScore     = Math.min(20, Math.round(rawToneAvg / 5));

  const speedScore      = avgFirstReplySub + slaSub + resTimeSub;   // 0–30
  const qualityScore    = relevancySub + accuracySub + completeSub; // 0–30
  const resolutionScore = oneReplySub + reopenedSub;                 // 0–20
  const emailHygieneScore = speedScore + qualityScore + resolutionScore + toneScore; // 0–100

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

async function getLiveWeekMetrics(
  client: AxiosInstance,
  weekStartDate: string,
  since: Date,
  until?: Date
): Promise<{ metrics: UserEmailHygiene[]; teamHygiene: TeamHygieneRow[] }> {
  const cached = _liveWeekCache.get(weekStartDate);
  if (cached && Date.now() - cached.computedAt < CURRENT_WEEK_TTL_MS) return cached;
  const { metrics, teamHygiene } = await computeMetricsForWindow(client, since.toISOString(), until?.toISOString());
  _liveWeekCache.set(weekStartDate, { computedAt: Date.now(), metrics, teamHygiene });
  if (_liveWeekCache.size > 4) {
    const oldestKey = [..._liveWeekCache.entries()].sort((a, b) => a[1].computedAt - b[1].computedAt)[0][0];
    _liveWeekCache.delete(oldestKey);
  }
  return { metrics, teamHygiene };
}

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
  // above judgeAllExchanges() for why this matters.
  const timelines = await buildTeamTimelines(client, validUsers, since, until);
  const allExchanges: Exchange[] = [];
  for (const tl of timelines.values()) allExchanges.push(...buildExchanges(tl));
  logger.info(`Email hygiene: built ${timelines.size} conversation timelines, ${allExchanges.length} exchanges`);

  const judgments = await judgeAllExchanges(allExchanges);

  const results: UserEmailHygiene[] = validUsers.map((u) => deriveUserMetrics(u.email, u.name, judgments));

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
    // false blank for a week that's fully knowable, fetch those "gap weeks" live too, same
    // as the current week, cached under the same TTL. Lazily grabs one Graph client shared
    // across every gap week (and the current week below) so a rollover with several unfinalized
    // weeks still only authenticates once.
    let sharedClient: AxiosInstance | null = null;
    let sharedClientError: unknown = null;
    const getSharedClient = async (): Promise<AxiosInstance> => {
      if (sharedClient) return sharedClient;
      if (sharedClientError) throw sharedClientError;
      try {
        sharedClient = graphClient(await getAccessToken());
        return sharedClient;
      } catch (err) {
        sharedClientError = err;
        throw err;
      }
    };

    // One slot per week-of-month, in order, even when a week was never finalized (e.g. it
    // passed before this feature existed) — this is what keeps "Wk 1/2/3/4" correctly
    // positioned instead of silently collapsing to just whichever weeks happen to have data.
    const weeks = await Promise.all(finalizedWeekDates.map(async (weekStartDate) => {
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
      try {
        const client = await getSharedClient();
        const { metrics, teamHygiene } = await getLiveWeekMetrics(client, weekStartDate, weekStart, weekEnd);
        return { weekStart: weekStartDate, weekEnd: istDateStr(weekEnd), isCurrent: false, hasData: true, metrics, teamHygiene };
      } catch (err) {
        logger.error(`[EmailHygiene] Gap-week live fetch failed for ${weekStartDate}:`, err);
        return { weekStart: weekStartDate, weekEnd: istDateStr(weekEnd), isCurrent: false, hasData: false, metrics: [], teamHygiene: [] };
      }
    }));

    // Current week, live and genuinely week-scoped (Monday through now) — a real Graph
    // fetch, guarded by the short in-memory TTL above so repeat views don't re-sync.
    try {
      const client = await getSharedClient();
      const { metrics, teamHygiene } = await getLiveWeekMetrics(client, currentWeekStartDate, currentWeekStart);
      weeks.push({
        weekStart: currentWeekStartDate,
        weekEnd: istDateStr(getIstWeekBounds(0).weekEnd),
        isCurrent: true,
        hasData: true,
        metrics,
        teamHygiene,
      });
    } catch (err) {
      logger.error('[EmailHygiene] Current-week trend fetch failed:', err);
      // Current week just won't have a live point this time — finalized weeks still return.
      weeks.push({ weekStart: currentWeekStartDate, weekEnd: istDateStr(getIstWeekBounds(0).weekEnd), isCurrent: true, hasData: false, metrics: [], teamHygiene: [] });
    }

    return { weeks, isConfigured: true };
  },
};
