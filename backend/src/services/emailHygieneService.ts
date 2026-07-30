import axios, { type AxiosInstance } from 'axios';
import { query, execute } from '../config/database';
import { logger } from '../utils/logger';

interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients?: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  sentDateTime: string;
}

export interface UserEmailHygiene {
  userEmail: string;
  userName: string;
  // Volume (thread-level; raw emails not tracked)
  uniqueCustomerThreads: number;
  // Speed (35%)
  avgFirstReplyTimeHours: number | null;
  slaHitRate: number;                  // % of threads with first reply ≤4h
  avgFullResolutionTimeHours: number | null;
  // Quality (35%)
  relevancyScore: number | null;
  relevancySample: string | null;
  accuracyRate: number;                // % of replies that are substantive & non-auto
  completenessRate: number;            // % coverage of customer questions in reply
  // Resolution (20%)
  oneReplyResolutionRate: number;
  reopenedThreadRate: number;
  // Tone (10%)
  toneScore: number;
  // Category scores (0–100)
  speedScore: number;
  qualityScore: number;
  resolutionScore: number;
  // Overall
  emailHygieneScore: number;
}

const CF_DOMAIN = 'cloudfuze.com';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const CACHE_TTL_MS = 2 * 3600 * 1000;

// Microsoft system notification senders to exclude from "external received"
const SYSTEM_SENDER_DOMAINS = new Set([
  'microsoft.com',
  'microsoftonline.com',
  'teams.microsoft.com',
  'sharepointonline.com',
  'outlook.com',
  'onmicrosoft.com',
  'azurecomm.net',
  'mimecast.com',
]);

function isGraphConfigured(): boolean {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  return !!(
    MS_GRAPH_TENANT_ID && MS_GRAPH_CLIENT_ID && MS_GRAPH_CLIENT_SECRET &&
    !MS_GRAPH_TENANT_ID.startsWith('PASTE_') &&
    !MS_GRAPH_CLIENT_ID.startsWith('PASTE_') &&
    !MS_GRAPH_CLIENT_SECRET.startsWith('PASTE_')
  );
}

async function getAccessToken(): Promise<string> {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  const res = await axios.post(
    `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: MS_GRAPH_CLIENT_ID!,
      client_secret: MS_GRAPH_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return res.data.access_token as string;
}

function graphClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: GRAPH_BASE,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
}

async function fetchMessages(
  client: AxiosInstance,
  url: string,
  cap = 200
): Promise<GraphMessage[]> {
  const msgs: GraphMessage[] = [];
  let next: string | null = url;
  while (next && msgs.length < cap) {
    const res: { data: { value?: GraphMessage[]; '@odata.nextLink'?: string } } =
      await client.get(next);
    msgs.push(...(res.data.value ?? []));
    next = res.data['@odata.nextLink'] ?? null;
  }
  return msgs;
}

function isExternal(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith(`@${CF_DOMAIN}`)) return false;
  const domain = lower.split('@')[1] ?? '';
  // Exclude Microsoft system notifications and no-reply senders
  if (SYSTEM_SENDER_DOMAINS.has(domain)) return false;
  if (domain.endsWith('.microsoft.com') || domain.endsWith('.microsoftonline.com')) return false;
  if (lower.startsWith('noreply@') || lower.startsWith('no-reply@') || lower.startsWith('donotreply@')) return false;
  return true;
}


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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

async function analyzeUser(
  client: AxiosInstance,
  userEmail: string,
  userName: string,
  since: string
): Promise<UserEmailHygiene> {
  const userPath = encodeURIComponent(userEmail);
  const sinceEncoded = encodeURIComponent(since);

  const sentUrl = `/users/${userPath}/mailFolders/SentItems/messages` +
    `?$filter=sentDateTime ge ${sinceEncoded}` +
    `&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,sentDateTime&$top=100`;

  const recvUrl = `/users/${userPath}/messages` +
    `?$filter=receivedDateTime ge ${sinceEncoded}` +
    `&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime&$top=100`;

  const [sentRaw, recvRaw] = await Promise.all([
    fetchMessages(client, sentUrl, 300).catch(() => [] as GraphMessage[]),
    fetchMessages(client, recvUrl, 300).catch(() => [] as GraphMessage[]),
  ]);

  const externalSent = sentRaw.filter(m =>
    m.toRecipients?.some(r => isExternal(r.emailAddress.address))
  );
  const externalReceived = recvRaw.filter(m =>
    m.from?.emailAddress?.address && isExternal(m.from.emailAddress.address)
  );

  const sentByConv = new Map<string, GraphMessage[]>();
  for (const m of externalSent) {
    if (!sentByConv.has(m.conversationId)) sentByConv.set(m.conversationId, []);
    sentByConv.get(m.conversationId)!.push(m);
  }
  const recvByConv = new Map<string, GraphMessage[]>();
  for (const m of externalReceived) {
    if (!recvByConv.has(m.conversationId)) recvByConv.set(m.conversationId, []);
    recvByConv.get(m.conversationId)!.push(m);
  }
  for (const [, msgs] of sentByConv) msgs.sort((a, b) => new Date(a.sentDateTime).getTime() - new Date(b.sentDateTime).getTime());
  for (const [, msgs] of recvByConv) msgs.sort((a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime());

  const customerConvIds = new Set(recvByConv.keys());
  const uniqueCustomerThreads = customerConvIds.size;

  // ── Speed ────────────────────────────────────────────────────────
  const firstReplyTimes: number[] = [];
  const fullResolutionTimes: number[] = [];
  let within4h = 0;

  // ── Resolution ───────────────────────────────────────────────────
  let oneReplySolved = 0;
  let reopenedThreads = 0;
  let threadsWithReply = 0;

  for (const convId of customerConvIds) {
    const custMsgs = recvByConv.get(convId) ?? [];
    const cfReplies = sentByConv.get(convId) ?? [];

    const firstCust = custMsgs[0];
    if (!firstCust) continue;
    const custTime = new Date(firstCust.receivedDateTime).getTime();

    const firstReply = cfReplies.find(r => new Date(r.sentDateTime).getTime() > custTime);
    if (!firstReply) continue;

    const diffH = (new Date(firstReply.sentDateTime).getTime() - custTime) / 3600000;
    firstReplyTimes.push(diffH);
    if (diffH <= 4) within4h++;
    threadsWithReply++;

    const lastCfReply = cfReplies[cfReplies.length - 1];
    fullResolutionTimes.push(
      (new Date(lastCfReply.sentDateTime).getTime() - custTime) / 3600000
    );

    const firstReplyTime = new Date(firstReply.sentDateTime).getTime();
    const customerFollowUps = custMsgs.filter(m =>
      new Date(m.receivedDateTime).getTime() > firstReplyTime
    );
    const wasReopened = customerFollowUps.length > 0;
    if (wasReopened) reopenedThreads++;
    if (cfReplies.length === 1 && !wasReopened) oneReplySolved++;
  }

  // ── Quality: accuracy rate ────────────────────────────────────────
  let accurateReplies = 0;
  for (const convId of customerConvIds) {
    if (!sentByConv.has(convId)) continue;
    const cfReply = sentByConv.get(convId)?.[0];
    if (!cfReply) continue;
    const isAuto = /^(automatic reply|out of office|auto.?reply)/i.test(cfReply.subject ?? '');
    const text = cfReply.body?.content ? stripHtml(cfReply.body.content) : cfReply.bodyPreview ?? '';
    if (!isAuto && text.length > 100) accurateReplies++;
  }
  const accuracyRate = threadsWithReply > 0
    ? Math.round((accurateReplies / threadsWithReply) * 100)
    : 100;

  // ── Resolution derived ────────────────────────────────────────────
  const oneReplyResolutionRate = threadsWithReply > 0
    ? Math.round((oneReplySolved / threadsWithReply) * 100)
    : 0;
  const reopenedThreadRate = threadsWithReply > 0
    ? Math.round((reopenedThreads / threadsWithReply) * 100)
    : 0;

  // ── Sample threads for relevancy + completeness + tone ───────────
  const sampleIds = [...customerConvIds].filter(id => sentByConv.has(id)).slice(0, 5);
  const relevancyScores: number[] = [];
  const completenessScores: number[] = [];
  const toneScores: number[] = [];
  let lastReason = '';

  for (const convId of sampleIds) {
    const custMsg = recvByConv.get(convId)?.[0];
    const cfReply = sentByConv.get(convId)?.[0];
    if (!custMsg || !cfReply) continue;
    const custText = custMsg.body?.content ? stripHtml(custMsg.body.content) : custMsg.bodyPreview ?? '';
    const cfText = cfReply.body?.content ? stripHtml(cfReply.body.content) : cfReply.bodyPreview ?? '';
    const rel = scoreRelevancy(custText, cfText);
    relevancyScores.push(rel.score);
    lastReason = rel.reason;
    completenessScores.push(scoreCompleteness(custText, cfText));
    toneScores.push(scoreTone(cfText));
  }

  const relevancyScore = relevancyScores.length > 0
    ? Math.round(relevancyScores.reduce((a, b) => a + b, 0) / relevancyScores.length)
    : null;
  const relevancySample = relevancyScores.length > 0 ? lastReason : null;
  const completenessRate = completenessScores.length > 0
    ? Math.round(completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length)
    : 50;
  const toneScore = toneScores.length > 0
    ? Math.round(toneScores.reduce((a, b) => a + b, 0) / toneScores.length)
    : 50;

  // ── Component scores (0–100) ─────────────────────────────────────
  const avgFirstReplyTimeHours = firstReplyTimes.length
    ? Math.round(firstReplyTimes.reduce((a, b) => a + b, 0) / firstReplyTimes.length * 10) / 10
    : null;

  const avgFullResolutionTimeHours = fullResolutionTimes.length
    ? Math.round(fullResolutionTimes.reduce((a, b) => a + b, 0) / fullResolutionTimes.length * 10) / 10
    : null;

  const slaHitRate = threadsWithReply > 0
    ? Math.round((within4h / threadsWithReply) * 100)
    : 0;

  const firstReplyScore =
    avgFirstReplyTimeHours === null ? 50 :
    avgFirstReplyTimeHours <= 4    ? 100 :
    avgFirstReplyTimeHours <= 8    ? 85  :
    avgFirstReplyTimeHours <= 24   ? 70  :
    avgFirstReplyTimeHours <= 48   ? 50  :
    avgFirstReplyTimeHours <= 72   ? 30  : 10;

  const resolutionTimeScore =
    avgFullResolutionTimeHours === null  ? 50  :
    avgFullResolutionTimeHours <= 24     ? 100 :
    avgFullResolutionTimeHours <= 48     ? 85  :
    avgFullResolutionTimeHours <= 96     ? 70  :
    avgFullResolutionTimeHours <= 168    ? 50  : 25;

  const relevancyForCalc = relevancyScore ?? 50;
  const reopenedScoreVal = 100 - reopenedThreadRate;

  // Speed 35% = firstReply 20% + resolution 15%
  // Quality 35% = relevancy 15% + completeness 10% + accuracy 10%
  // Resolution 20% = oneReply 10% + reopened-inverse 10%
  // Tone 10%
  const speedScore = Math.round((firstReplyScore * 20 + resolutionTimeScore * 15) / 35);
  const qualityScore = Math.round((relevancyForCalc * 15 + completenessRate * 10 + accuracyRate * 10) / 35);
  const resolutionScore = Math.round((oneReplyResolutionRate + reopenedScoreVal) / 2);

  const emailHygieneScore = Math.round(
    firstReplyScore        * 0.20 +
    resolutionTimeScore    * 0.15 +
    relevancyForCalc       * 0.15 +
    completenessRate       * 0.10 +
    accuracyRate           * 0.10 +
    oneReplyResolutionRate * 0.10 +
    reopenedScoreVal       * 0.10 +
    toneScore              * 0.10
  );

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
  };
}

export const emailHygieneService = {
  isConfigured: isGraphConfigured,

  async getHygieneMetrics(forceRefresh = false): Promise<{
    metrics: UserEmailHygiene[];
    computedAt: string;
    periodStart: string;
    periodEnd: string;
    isConfigured: boolean;
    authError?: string;
  }> {
    if (!isGraphConfigured()) {
      return {
        metrics: [],
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
          // Invalidate cache if it was written with the old schema (missing new fields)
          const isNewSchema = metrics.length === 0 || ('slaHitRate' in metrics[0] && 'completenessRate' in metrics[0]);
          if (isNewSchema && Date.now() - new Date(row.computed_at).getTime() < CACHE_TTL_MS) {
            return {
              metrics: metrics as UserEmailHygiene[],
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
        computedAt: new Date().toISOString(),
        periodStart: '',
        periodEnd: '',
        isConfigured: true,
        authError: detail,
      };
    }
    const client = graphClient(token);

    // Collect users from both the users table and project PM/AM name derivation
    const allUsers = await getCFUsers();
    logger.info(`Email hygiene: discovered ${allUsers.length} candidate CF users`);

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 3600 * 1000);
    const since = periodStart.toISOString();

    // Filter to only users whose mailbox exists in Azure AD, in batches of 5
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

    // Analyze valid users in batches of 3 to stay within Graph rate limits
    const results: UserEmailHygiene[] = [];
    for (let i = 0; i < validUsers.length; i += 3) {
      const batch = validUsers.slice(i, i + 3);
      const settled = await Promise.allSettled(
        batch.map(u => analyzeUser(client, u.email, u.name, since))
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        else logger.error('Email hygiene analysis error:', r.reason);
      }
    }

    const sorted = results.sort((a, b) => b.emailHygieneScore - a.emailHygieneScore);

    // Persist cache
    await execute(
      `INSERT INTO email_hygiene_cache (period_start, period_end, metrics) VALUES ($1, $2, $3)`,
      [periodStart.toISOString(), periodEnd.toISOString(), JSON.stringify(sorted)]
    );
    // Keep only 5 entries
    await execute(
      `DELETE FROM email_hygiene_cache WHERE id NOT IN (
         SELECT id FROM email_hygiene_cache ORDER BY computed_at DESC LIMIT 5
       )`
    );

    return {
      metrics: sorted,
      computedAt: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      isConfigured: true,
    };
  },
};
