import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export interface TranscriptCue {
  speaker: string;
  text: string;
  startSeconds: number;
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const CF_DOMAIN = 'cloudfuze.com';

// Thrown when a call's organizer is not a CloudFuze mailbox (e.g. the customer organized
// the meeting) — Graph's onlineMeetings lookup only resolves against a mailbox inside this
// tenant, so these calls can never be graded. Callers should treat this as a permanent,
// non-retryable exclusion, not a transient failure — never key this off the
// `externallyScheduled` flag in callHygieneService.ts, which means "organizer isn't this
// person" and includes calls a DIFFERENT CF colleague organized (still gradable).
export class ExternalOrganizerError extends Error {
  constructor(organizerEmail: string) {
    super(`Meeting organizer ${organizerEmail} is not a CloudFuze mailbox — transcript cannot be resolved for this call.`);
    this.name = 'ExternalOrganizerError';
  }
}

function isInternalOrganizer(organizerEmail: string): boolean {
  return organizerEmail.toLowerCase().endsWith(`@${CF_DOMAIN}`);
}

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

// Graph transcript content is WebVTT — cues look like:
//   00:00:03.500 --> 00:00:07.000
//   <v Jane Smith>Thanks for having us.
// The <v Name> voice tag carries the speaker; cues without one are kept as "Unknown".
function parseVtt(vtt: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  const blocks = vtt.replace(/\r\n/g, '\n').split(/\n\n+/);
  const timeToSeconds = (t: string): number => {
    const [h, m, s] = t.split(':');
    return Number(h) * 3600 + Number(m) * 60 + Number(s.replace(',', '.'));
  };

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const startRaw = timeLine.split('-->')[0].trim();
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    const text = textLines.join(' ').trim();
    if (!text) continue;

    const voiceMatch = text.match(/^<v\s+([^>]+)>(.*)$/s);
    const speaker = voiceMatch ? voiceMatch[1].trim() : 'Unknown';
    const spoken = (voiceMatch ? voiceMatch[2] : text).replace(/<\/?v[^>]*>/g, '').trim();
    if (!spoken) continue;

    cues.push({ speaker, text: spoken, startSeconds: timeToSeconds(startRaw) });
  }
  return cues;
}

async function resolveOnlineMeetingId(
  client: AxiosInstance,
  organizerEmail: string,
  joinUrl: string
): Promise<string> {
  const userPath = encodeURIComponent(organizerEmail);
  const filter = encodeURIComponent(`JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`);
  const res = await client.get(`/users/${userPath}/onlineMeetings?$filter=${filter}`);
  const meeting = res.data.value?.[0];
  if (!meeting) {
    throw new Error(`No online meeting found for organizer ${organizerEmail} matching the given join URL`);
  }
  return meeting.id as string;
}

async function fetchTranscriptVtt(
  client: AxiosInstance,
  organizerEmail: string,
  onlineMeetingId: string
): Promise<string> {
  const userPath = encodeURIComponent(organizerEmail);
  const listRes = await client.get(`/users/${userPath}/onlineMeetings/${onlineMeetingId}/transcripts`);
  const transcripts = listRes.data.value ?? [];
  if (transcripts.length === 0) {
    throw new Error('No transcript was generated for this meeting (transcription may not have been enabled).');
  }
  // Most recent transcript — Graph can return more than one if a meeting was resumed.
  const latest = transcripts.sort((a: any, b: any) =>
    new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
  )[0];

  const contentRes = await client.get(
    `/users/${userPath}/onlineMeetings/${onlineMeetingId}/transcripts/${latest.id}/content?$format=text/vtt`,
    { responseType: 'text', transformResponse: (data) => data }
  );
  return contentRes.data as string;
}

export const callTranscriptService = {
  isConfigured: isGraphConfigured,

  async getTranscriptCues(organizerEmail: string, joinUrl: string): Promise<TranscriptCue[]> {
    if (!isGraphConfigured()) {
      throw new Error('Microsoft Graph is not configured (MS_GRAPH_* env vars missing).');
    }
    if (!isInternalOrganizer(organizerEmail)) {
      throw new ExternalOrganizerError(organizerEmail);
    }
    const token = await getAccessToken();
    const client = graphClient(token);

    const onlineMeetingId = await resolveOnlineMeetingId(client, organizerEmail, joinUrl);
    const vtt = await fetchTranscriptVtt(client, organizerEmail, onlineMeetingId);
    const cues = parseVtt(vtt);

    if (cues.length === 0) {
      throw new Error('Transcript was empty after parsing — the meeting may not have had any captured speech.');
    }
    logger.info(`Call transcript: parsed ${cues.length} cues for meeting organized by ${organizerEmail}`);
    return cues;
  },
};
