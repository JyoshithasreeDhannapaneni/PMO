import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { simpleParser } from 'mailparser';
import { normalizeCustomer } from './jiraExcelService';

export type IssueType = 'TECHNICAL' | 'SLA' | 'COMMUNICATION' | 'BILLING';

export const ISSUE_TYPES: { id: IssueType; label: string }[] = [
  { id: 'TECHNICAL', label: 'Technical / migration failure' },
  { id: 'SLA', label: 'SLA / response breach' },
  { id: 'COMMUNICATION', label: 'Communication / status' },
  { id: 'BILLING', label: 'Billing / overage / commercial' },
];

export const ESCALATION_OWNERS = ['Abhishek', 'Ajay', 'Ankit', 'Mayank'] as const;
export type EscalationOwner = (typeof ESCALATION_OWNERS)[number];

// Fallback routing map used when the admin has not configured one in Settings.
const DEFAULT_ROUTING: Record<IssueType, string> = {
  TECHNICAL: 'Ankit',
  SLA: 'Ajay',
  COMMUNICATION: 'Abhishek',
  BILLING: 'Mayank',
};

const CLASSIFY_RULES: { type: IssueType; patterns: RegExp[] }[] = [
  { type: 'BILLING', patterns: [/\b(billing|invoice|overage|charge|payment|refund|pricing|contract|renewal|cost)\b/i] },
  { type: 'SLA', patterns: [/\b(sla|response time|first response|idle|breach|overdue|no response|awaiting|turnaround)\b/i] },
  { type: 'TECHNICAL', patterns: [/\b(error|fail|failed|failure|bug|sync|stalled|stuck|crash|migration|data loss|integrity|broken|not working|timeout)\b/i] },
  { type: 'COMMUNICATION', patterns: [/\b(update|status|communicat|no reply|unresponsive|expectation|clarif|informed|silence|follow[- ]?up)\b/i] },
];

// Sentence-level signals used to find the actual issue in a mail thread.
// Higher weight = stronger indicator that a sentence states the problem.
const ISSUE_SIGNALS: { re: RegExp; w: number }[] = [
  { re: /\b(fail(ing|ed|ure)?|error|crash|broke[n]?|not working|doesn'?t work|unable to|cannot|can'?t)\b/, w: 3 },
  { re: /\b(stall(ed|ing)?|stuck|blocked|hung|frozen|pending since|no progress)\b/, w: 3 },
  { re: /\b(delay(ed|s)?|overdue|behind schedule|missed|slipped|past due)\b/, w: 3 },
  { re: /\b(breach(ed|ing)?|sla|missed sla|response time|not responded|no response|awaiting)\b/, w: 3 },
  { re: /\b(data (loss|missing|mismatch|integrity)|missing (files|emails|data)|incomplete|corrupt)\b/, w: 3 },
  { re: /\b(escalat(e|ed|ing|ion)|urgent|critical|asap|immediately|high priority)\b/, w: 2 },
  { re: /\b(impact(ing|ed)?|affect(ing|ed)?|blocking|go[- ]?live|deadline|business impact)\b/, w: 2 },
  { re: /\b(issue|problem|concern|complaint|not happy|frustrat(ed|ing)|disappoint)\b/, w: 2 },
  { re: /\b(still|again|repeatedly|multiple times|several days|days now|weeks now)\b/, w: 1 },
  { re: /\b(please (fix|resolve|look into|escalate|advise|help)|need (this|a) (fix|resolution))\b/, w: 2 },
  { re: /\b(billing|invoice|overage|charge|refund|pricing|contract)\b/, w: 1 },
];

interface ParsedMail {
  raisedBy: string;
  subject: string;
  body: string;
  receivedAt: string;
}

interface EscalationMailRow {
  id: string;
  leader_name: string;
  project_manager: string | null;
  customer_name: string;
  issue_type: IssueType;
  issue_summary: string;
  raised_by: string;
  raised_via: string;
  escalation_owner: string;
  received_at: string;
  raw_mail: string;
  status: string;
  attachments: Attachment[] | null;
  resolved_at: string | null;
  rca: string | null;
  rca_docs: RcaDoc[] | null;
  created_at: string;
}

export interface Attachment {
  url: string;
  type: 'image' | 'video';
  name?: string;
}

export interface RcaDoc {
  url: string;
  name: string;
}

export interface EscalationMail {
  id: string;
  leaderName: string;
  projectManager: string | null;
  customerName: string;
  issueType: IssueType;
  issueSummary: string;
  raisedBy: string;
  raisedVia: string;
  escalationOwner: string;
  receivedAt: string;
  status: string;
  attachments: Attachment[];
  resolvedAt: string | null;
  rca: string;
  rcaDocs: RcaDoc[];
  createdAt: string;
}

export interface CreateEscalationInput {
  leaderName: string;
  customerName: string;
  issueSummary: string;
  projectManager?: string;
  issueType?: IssueType;
  raisedBy?: string;
  raisedVia?: string;
  receivedAt?: string;
  rawMail?: string;
  escalationOwner?: string;
  status?: string;
  attachments?: Attachment[];
}

// Postgres text columns reject NUL (0x00) bytes ("invalid byte sequence for
// encoding UTF8"). Binary .msg uploads read as text carry them, so strip NUL
// and other non-tab/newline control chars before persisting.
function clean(value: string): string {
  // Strip NUL and other C0/C1 control chars (keep tab, LF, CR). Binary .msg
  // uploads read as text carry NUL, which Postgres text columns reject.
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const isControl = (c <= 0x1f && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f;
    if (!isControl) out += value[i];
  }
  return out;
}

function mapRow(row: EscalationMailRow): EscalationMail {
  return {
    id: row.id,
    leaderName: row.leader_name,
    projectManager: row.project_manager,
    customerName: row.customer_name,
    issueType: row.issue_type,
    issueSummary: row.issue_summary,
    raisedBy: row.raised_by,
    raisedVia: row.raised_via || 'Email',
    escalationOwner: row.escalation_owner,
    receivedAt: row.received_at,
    status: row.status,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    resolvedAt: row.resolved_at,
    rca: row.rca || '',
    rcaDocs: Array.isArray(row.rca_docs) ? row.rca_docs : [],
    createdAt: row.created_at,
  };
}

class EscalationMailService {
  private tableReady = false;

  async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    await execute(`
      CREATE TABLE IF NOT EXISTS escalation_mails (
        id UUID PRIMARY KEY,
        leader_name TEXT NOT NULL,
        project_manager TEXT,
        customer_name TEXT NOT NULL,
        issue_type TEXT NOT NULL DEFAULT 'TECHNICAL',
        issue_summary TEXT NOT NULL DEFAULT '',
        raised_by TEXT NOT NULL DEFAULT '',
        raised_via TEXT NOT NULL DEFAULT 'Email',
        escalation_owner TEXT NOT NULL DEFAULT '',
        received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        raw_mail TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'OPEN',
        attachments JSONB NOT NULL DEFAULT '[]',
        resolved_at TIMESTAMP,
        rca TEXT NOT NULL DEFAULT '',
        rca_docs JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Backfill columns for tables created before these fields existed.
    await execute(`ALTER TABLE escalation_mails ADD COLUMN IF NOT EXISTS raised_via TEXT NOT NULL DEFAULT 'Email'`);
    await execute(`ALTER TABLE escalation_mails ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'`);
    await execute(`ALTER TABLE escalation_mails ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP`);
    await execute(`ALTER TABLE escalation_mails ADD COLUMN IF NOT EXISTS rca TEXT NOT NULL DEFAULT ''`);
    await execute(`ALTER TABLE escalation_mails ADD COLUMN IF NOT EXISTS rca_docs JSONB NOT NULL DEFAULT '[]'`);
    this.tableReady = true;
  }

  classifyIssue(text: string): IssueType {
    for (const rule of CLASSIFY_RULES) {
      if (rule.patterns.some((p) => p.test(text))) return rule.type;
    }
    return 'TECHNICAL';
  }

  // Owner is derived entirely from the issue type via the (Settings-editable)
  // routing map — fully automatic, no manual selection.
  async routeOwner(issueType: IssueType): Promise<string> {
    const map = await this.getRoutingMap();
    return map[issueType] || DEFAULT_ROUTING[issueType];
  }

  async getRoutingMap(): Promise<Record<IssueType, string>> {
    try {
      const result = await query(`SELECT settings FROM app_settings WHERE id = 1`);
      const configured = result.rows[0]?.settings?.escalationRouting;
      if (configured && typeof configured === 'object') {
        return { ...DEFAULT_ROUTING, ...configured };
      }
    } catch {
      // app_settings table may not exist yet — fall back to defaults.
    }
    return { ...DEFAULT_ROUTING };
  }

  // Match a parsed customer name against the projects table to recover the PM.
  // Uses the same normalization as the Jira SLA grouping so names line up.
  async findProjectManager(customerName: string): Promise<string | null> {
    const norm = normalizeCustomer(customerName);
    if (!norm) return null;
    try {
      const result = await query(
        `SELECT customer_name, project_manager FROM projects WHERE project_manager IS NOT NULL`
      );
      for (const row of result.rows) {
        if (normalizeCustomer(row.customer_name || '') === norm) {
          return row.project_manager || null;
        }
      }
    } catch (err) {
      logger.error(`findProjectManager failed: ${(err as Error).message}`);
    }
    return null;
  }

  // Turn an uploaded file (email, PDF, or Word) into plain text plus a hint of
  // how it arrived. PDFs/Word are binary — reading them as UTF-8 gives garbage,
  // so extract real text with pdf-parse / mammoth first.
  async extractText(buffer: Buffer, filename: string): Promise<{ text: string; via: string }> {
    const name = (filename || '').toLowerCase();
    const isPdf = name.endsWith('.pdf') || buffer.slice(0, 5).toString('latin1') === '%PDF-';
    const isDocx = name.endsWith('.docx');
    const isDoc = name.endsWith('.doc') && !isDocx;

    if (isPdf) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return { text: (data.text || '').trim(), via: 'PDF' };
      } catch (err) {
        logger.error(`PDF text extraction failed: ${(err as Error).message}`);
        return { text: '', via: 'PDF' };
      }
    }

    if (isDocx) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return { text: (result.value || '').trim(), via: 'Word' };
      } catch (err) {
        logger.error(`Word text extraction failed: ${(err as Error).message}`);
        return { text: '', via: 'Word' };
      }
    }

    if (isDoc) {
      // Legacy binary .doc isn't supported by mammoth — ask the user to convert.
      return { text: '', via: 'Word' };
    }

    if (name.endsWith('.msg')) return { text: buffer.toString('utf-8'), via: 'Outlook' };
    return { text: buffer.toString('utf-8'), via: 'Email' };
  }

  async parseMail(raw: string): Promise<ParsedMail> {
    const parsed = await simpleParser(raw);
    const from = parsed.from?.value?.[0];
    let raisedBy = from ? (from.name ? `${from.name} <${from.address}>` : from.address || '') : '';
    let subject = (parsed.subject || '').trim();
    let body = (parsed.text || parsed.html || '').toString().trim();
    let receivedAt = parsed.date ? parsed.date.toISOString() : '';

    // Outlook/webmail copy-paste is rarely a well-formed RFC-822 message, so
    // simpleParser often returns an empty body and no headers. Fall back to
    // reading plain-text "From:/Subject:/Sent:" headers and treating the rest
    // as the body — otherwise the summary silently collapses to the subject.
    if (!body || (!subject && !raisedBy)) {
      const plain = this.parsePlainText(raw);
      if (!raisedBy) raisedBy = plain.raisedBy;
      if (!subject) subject = plain.subject;
      if (!body) body = plain.body;
      if (!receivedAt) receivedAt = plain.receivedAt;
    }

    return {
      raisedBy: raisedBy.trim(),
      subject,
      body: body.trim(),
      receivedAt: receivedAt || new Date().toISOString(),
    };
  }

  // Read a pasted (non-MIME) mail: pull common header lines, then take
  // everything after the header block as the body.
  private parsePlainText(raw: string): ParsedMail {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    let raisedBy = '';
    let subject = '';
    let receivedAt = '';
    let bodyStart = 0;

    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i];
      const from = line.match(/^\s*From\s*:\s*(.+)$/i);
      const subj = line.match(/^\s*Subject\s*:\s*(.+)$/i);
      const sent = line.match(/^\s*(?:Sent|Date)\s*:\s*(.+)$/i);
      if (from && !raisedBy) { raisedBy = from[1].trim(); bodyStart = i + 1; }
      else if (subj && !subject) { subject = subj[1].trim(); bodyStart = i + 1; }
      else if (sent && !receivedAt) {
        const d = new Date(sent[1].trim());
        if (!isNaN(d.getTime())) receivedAt = d.toISOString();
        bodyStart = i + 1;
      }
    }

    const body = lines.slice(bodyStart).join('\n').trim();
    return { raisedBy, subject, body: body || raw.trim(), receivedAt };
  }

  // Extract a customer name from the subject line. Handles common patterns like
  // "[Escalation] Acme Corp — ..." or "Escalation: Acme Corp - migration stuck".
  extractCustomer(subject: string): string {
    let s = subject.replace(/^\s*(re|fwd?)\s*:\s*/gi, '');
    s = s.replace(/\[?\b(escalation|escalated|urgent|priority)\b\]?\s*[:\-–]?\s*/gi, '');
    const sep = s.split(/[—–\-:|]/)[0];
    return sep.trim().slice(0, 120);
  }

  // Escalation report docs (PDF/Word) usually use labeled fields rather than
  // email headers. Pull "Customer:", "Project:", "Raised by:", etc. from the text.
  private extractLabeledFields(text: string): {
    customerName: string;
    projectName: string;
    raisedBy: string;
    issue: string;
    receivedAt: string;
  } {
    const find = (labels: string[]): string => {
      for (const label of labels) {
        // (a) "Label: value" on the same line.
        const same = text.match(new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+)$`, 'im'));
        if (same && same[1].trim()) return this.cleanFieldValue(same[1]);
        // (b) "Label:" alone, value on the NEXT line — common in tables/forms
        //     where PDF/Word extraction puts each cell on its own line.
        const next = text.match(new RegExp(`^\\s*${label}\\s*[:\\-]?\\s*\\n\\s*(.+)$`, 'im'));
        if (next && next[1].trim() && !/^[:\-]/.test(next[1].trim())) return this.cleanFieldValue(next[1]);
        // (c) "Label value" with no separator (e.g. "Customer Acme Corp").
        const bare = text.match(new RegExp(`^\\s*${label}\\s+([A-Z0-9].+)$`, 'im'));
        if (bare && bare[1].trim()) return this.cleanFieldValue(bare[1]);
      }
      return '';
    };

    const customerName = find(['customer name', 'customer', 'client name', 'client', 'account', 'organization', 'organisation', 'company']);
    const projectName = find(['project name', 'project', 'migration', 'engagement']);
    const raisedBy = find(['raised by', 'reported by', 'requested by', 'submitted by', 'from', 'contact', 'requester']);
    const issue = find(['issue', 'problem', 'description', 'summary', 'reason', 'details', 'concern', 'escalation reason', 'why escalated']);
    const dateStr = find(['date', 'date raised', 'reported on', 'raised on', 'created']);
    let receivedAt = '';
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) receivedAt = d.toISOString();
    }
    return { customerName, projectName, raisedBy, issue, receivedAt };
  }

  // Trim a matched field value and strip trailing label noise / punctuation.
  private cleanFieldValue(v: string): string {
    return v.replace(/\s+/g, ' ').replace(/[;,|]\s*$/, '').trim().slice(0, 120);
  }

  // Fallback when no "Customer:" label exists: guess the customer/company from
  // the document's title, headings, or common phrasings ("for Acme Corp",
  // "Acme Corp - GDrive to OneDrive migration", "migration for Acme").
  guessCustomer(text: string): string {
    if (!text) return '';
    const clean = text.replace(/\r\n/g, '\n');
    const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1) "<Company> - <something> migration" or "<Company> Migration" in a heading/line.
    const headingCo = clean.match(/^([A-Z][A-Za-z0-9&.,'\- ]{2,60}?)\s*[-–—]\s*.*?\bmigration\b/im);
    if (headingCo && headingCo[1]) return this.cleanFieldValue(headingCo[1]);

    // 2) "for <Company>" / "regarding <Company>" / "customer <Company>".
    const forCo = clean.match(/\b(?:for|regarding|re:|customer|client)\s+([A-Z][A-Za-z0-9&.'\- ]{2,50}?)(?:[.,\n]|\s+(?:migration|account|project|is|has|regarding))/);
    if (forCo && forCo[1] && !/^(the|a|an|this|that|our|your|their)\b/i.test(forCo[1].trim())) {
      return this.cleanFieldValue(forCo[1]);
    }

    // 3) "<Company> <SourcePlatform> to <TargetPlatform> migration" — grab the
    //    capitalized company words that precede the "<X> to <Y> migration" phrase.
    const beforeMig = clean.match(/\b([A-Z][A-Za-z0-9&.'\- ]{1,50}?)\s+[A-Za-z]+\s+to\s+[A-Za-z]+\s+migration\b/);
    if (beforeMig && beforeMig[1]) {
      const cand = beforeMig[1].replace(/\b(escalation|report|urgent|priority|the|our|their)\b/gi, '').trim();
      if (cand.length >= 2 && cand.length <= 60 && /[A-Za-z]/.test(cand)) return this.cleanFieldValue(cand);
    }

    // 4) A short, title-like first line (not a generic doc heading).
    const title = lines[0];
    if (title && title.length <= 60 && /[A-Za-z]/.test(title) &&
        !/^(escalation|report|subject|to|from|date|hi|hello|dear|issue|problem)\b/i.test(title) &&
        title.split(' ').length <= 8) {
      return this.cleanFieldValue(title);
    }
    return '';
  }

  // Identify the actual issue from a (possibly multi-message) mail thread.
  // Rather than blindly taking the first lines, we score every sentence across
  // the thread by how strongly it signals a problem, then keep the best ones.
  summarizeIssue(subject: string, body: string): string {
    const sentences = this.candidateSentences(body);
    if (sentences.length) {
      const scored = sentences
        .map((s) => ({ s, score: this.issueScore(s) }))
        .filter((x) => x.s.length >= 15);

      const withSignal = scored.filter((x) => x.score > 0);
      const pool = withSignal.length ? withSignal : scored;

      // Keep original order among the selected sentences so it reads naturally,
      // but choose WHICH sentences by issue score (highest signal first).
      const topN = [...pool].sort((a, b) => b.score - a.score).slice(0, 3);
      const ordered = pool.filter((x) => topN.includes(x)).map((x) => x.s);
      const result = ordered.join(' ').replace(/\s+/g, ' ').trim();
      if (result) return result.slice(0, 500);
    }
    // Nothing usable in the body — fall back to the subject, prefixes stripped.
    return this.cleanSubject(subject).slice(0, 500);
  }

  private cleanSubject(subject: string): string {
    return subject
      .replace(/^\s*(re|fwd?)\s*:\s*/gi, '')
      .replace(/\[?\b(escalation|escalated|urgent|priority|high|important)\b\]?\s*[:\-–]?\s*/gi, '')
      .trim();
  }

  // Break the thread into clean, human-written sentences: strip quoted replies,
  // forwarded headers, greetings, signatures and footers, then split to sentences.
  private candidateSentences(body: string): string[] {
    if (!body) return [];
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const kept: string[] = [];

    for (const original of lines) {
      const line = original.trim();
      if (!line) continue;
      // Quoted-reply / forwarded-message markers and per-message header lines.
      if (/^(on .+wrote:|-{2,}\s*(original message|forwarded message)|_{5,}|>+)/i.test(line)) continue;
      if (/^(from|to|cc|bcc|sent|date|subject|importance|priority|reply-to)\s*:/i.test(line)) continue;
      // Greetings and sign-offs.
      if (/^(hi|hello|hey|dear|greetings|good (morning|afternoon|evening))\b/i.test(line) && line.length < 50) continue;
      if (/^(thanks|thank you|regards|best regards|best|sincerely|cheers|warm regards|kind regards)[,!.\s]*$/i.test(line)) continue;
      // Footers, disclaimers, contact lines.
      if (/^(sent from my|get outlook|this (e-?mail|message) (is|and any)|confidential)/i.test(line)) continue;
      if (/^(tel|phone|mobile|mob|cell|fax|www\.|https?:\/\/)/i.test(line)) continue;
      // Signature/contact-block lines: skip anything that looks like a signature
      // rather than prose — these polluted the issue text with names/addresses.
      if (this.looksLikeSignatureLine(line)) continue;
      kept.push(line);
    }

    const joined = kept.join(' ').replace(/\s+/g, ' ').trim();
    if (!joined) return [];
    const matched = joined.match(/[^.!?]+[.!?]+/g);
    const sentences = (matched || [joined]).map((s) => s.trim()).filter(Boolean);
    // Drop any sentence that is really signature/contact debris that slipped
    // through as part of a merged line (phone, email, street address, PTO, etc.).
    return sentences.filter((s) => !this.looksLikeSignatureLine(s));
  }

  // Heuristics for signature / contact-block content that should never be the issue.
  private looksLikeSignatureLine(line: string): boolean {
    const l = line.trim();
    if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(l)) return true;                 // phone number
    if (/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/.test(l) && l.length < 90) return true;      // email in a short line
    if (/\b\d{5}(-\d{4})?\b/.test(l) && /[A-Z]{2}\b/.test(l)) return true;         // "Cary NC 27518" style address
    if (/\|/.test(l) && l.length < 120) return true;                              // "Name | Title" signature lines
    if (/\b(PTO|OOO|out of office|head of|manager,|director,|vp,|parkway|street|st\.|ave\.|suite|floor)\b/i.test(l)) return true;
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(l)) return true;                        // a bare "Firstname Lastname"
    return false;
  }

  // Score a sentence by how strongly it reads as a problem statement.
  private issueScore(sentence: string): number {
    const s = sentence.toLowerCase();
    let score = 0;
    for (const { re, w } of ISSUE_SIGNALS) {
      if (re.test(s)) score += w;
    }
    // Numbers often mark concrete impact ("stalled for 4 days", "60% complete").
    if (/\b\d/.test(s)) score += 1;
    // Meta-requests ("please share updates asap") are not the issue itself — demote.
    if (/\b(please (share|send|provide|give) (an )?update|updates? asap|kindly update)\b/.test(s) && !/\b(fail|error|stuck|stall|delay|breach|broken|missing|down)\b/.test(s)) {
      score -= 2;
    }
    // Very long boilerplate sentences are usually not the crisp issue.
    if (sentence.length > 260) score -= 1;
    return score;
  }

  // Parse an uploaded mail into a draft record for review — does NOT persist.
  async draftFromMail(raw: string, raisedVia = 'Email'): Promise<{
    raisedBy: string;
    raisedVia: string;
    customerName: string;
    issueType: IssueType;
    issueSummary: string;
    receivedAt: string;
    projectManager: string | null;
    escalationOwner: string;
    subject: string;
    rawMail: string;
  }> {
    const mail = await this.parseMail(raw);

    // Labeled fields dominate for report-style documents; fall back to email
    // parsing (subject/body) when a label isn't present.
    const labeled = this.extractLabeledFields(mail.body || raw);

    // Customer/Project: prefer explicit "Customer:" label, else the subject line,
    // else guess from the document title/headings/prose (for docs with no label
    // and no subject). Combine customer + project when both are known.
    let customerName = labeled.customerName || this.extractCustomer(mail.subject);
    if (labeled.customerName && labeled.projectName) {
      customerName = `${labeled.customerName} - ${labeled.projectName}`;
    } else if (!customerName && labeled.projectName) {
      customerName = labeled.projectName;
    }
    if (!customerName) {
      customerName = this.guessCustomer(mail.body || raw);
    }

    const raisedBy = mail.raisedBy || labeled.raisedBy;
    const receivedAt = mail.receivedAt || labeled.receivedAt || new Date().toISOString();

    // Issue text: prefer an explicit "Issue:" label; otherwise score the body.
    const issueSummary = labeled.issue
      ? labeled.issue.slice(0, 500)
      : this.summarizeIssue(mail.subject, mail.body);

    const issueType = this.classifyIssue(`${mail.subject}\n${issueSummary}\n${mail.body}`);
    const [projectManager, escalationOwner] = await Promise.all([
      this.findProjectManager(customerName),
      this.routeOwner(issueType),
    ]);
    return {
      raisedBy,
      raisedVia,
      customerName,
      issueType,
      issueSummary,
      receivedAt,
      projectManager,
      escalationOwner,
      subject: mail.subject,
      rawMail: raw,
    };
  }

  async create(data: CreateEscalationInput): Promise<EscalationMail> {
    await this.ensureTable();
    const id = uuidv4();
    const issueType: IssueType =
      data.issueType && ISSUE_TYPES.some((t) => t.id === data.issueType)
        ? data.issueType
        : this.classifyIssue(data.issueSummary || '');
    const owner = data.escalationOwner || (await this.routeOwner(issueType));
    // Prefer an explicitly-chosen manager from the form; auto-match only as fallback.
    const projectManager = data.projectManager?.trim() || (await this.findProjectManager(data.customerName));
    const receivedAt = data.receivedAt || new Date().toISOString();

    const attachments = Array.isArray(data.attachments)
      ? data.attachments.filter((a) => a && typeof a.url === 'string' && (a.type === 'image' || a.type === 'video'))
      : [];

    await execute(
      `INSERT INTO escalation_mails
        (id, leader_name, project_manager, customer_name, issue_type, issue_summary,
         raised_by, raised_via, escalation_owner, received_at, raw_mail, status, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        clean(data.leaderName),
        projectManager ? clean(projectManager) : null,
        clean(data.customerName),
        issueType,
        clean(data.issueSummary || ''),
        clean(data.raisedBy || ''),
        clean(data.raisedVia || 'Email'),
        clean(owner),
        receivedAt,
        clean(data.rawMail || ''),
        data.status || 'OPEN',
        JSON.stringify(attachments),
      ]
    );
    const result = await query(`SELECT * FROM escalation_mails WHERE id = $1`, [id]);
    const record = mapRow(result.rows[0]);
    logger.info(`Escalation mail created: ${record.id} → ${record.escalationOwner} (${issueType})`);
    return record;
  }

  async getAll(filters: { owner?: string; issueType?: string; status?: string } = {}): Promise<EscalationMail[]> {
    await this.ensureTable();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.owner) {
      params.push(filters.owner);
      conditions.push(`escalation_owner = $${params.length}`);
    }
    if (filters.issueType) {
      params.push(filters.issueType);
      conditions.push(`issue_type = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM escalation_mails ${where} ORDER BY received_at DESC`,
      params
    );
    return result.rows.map(mapRow);
  }

  async getStats(): Promise<{ total: number; open: number; resolved: number; assigned: number; thisWeek: number; topOwner: string | null }> {
    await this.ensureTable();
    const all = await this.getAll();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let open = 0;
    let resolved = 0;
    let assigned = 0;
    let thisWeek = 0;
    for (const m of all) {
      if (m.status === 'OPEN') open++;
      if (m.status === 'RESOLVED') resolved++;
      // "Assigned" = actively owned and not yet resolved (in someone's queue).
      if (m.status !== 'RESOLVED' && m.escalationOwner) assigned++;
      if (new Date(m.receivedAt).getTime() >= weekAgo) thisWeek++;
    }
    return { total: all.length, open, resolved, assigned, thisWeek, topOwner: null };
  }

  async updateStatus(id: string, status: string): Promise<EscalationMail | null> {
    await this.ensureTable();
    // Re-opening a resolved escalation clears the resolution timestamp (but keeps
    // the RCA text as a record). Resolving via this path should go through
    // resolve() so a date/RCA can be supplied; if it doesn't, don't auto-stamp.
    if (status !== 'RESOLVED') {
      await execute(`UPDATE escalation_mails SET status = $1, resolved_at = NULL WHERE id = $2`, [status, id]);
    } else {
      await execute(`UPDATE escalation_mails SET status = 'RESOLVED' WHERE id = $1`, [id]);
    }
    const result = await query(`SELECT * FROM escalation_mails WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  // Close an escalation with an explicit (editable) resolved date and optional RCA.
  // The resolved date is taken from input — NOT auto-set to "now".
  async resolve(id: string, resolvedAt: string, rca: string, rcaDocs?: RcaDoc[]): Promise<EscalationMail | null> {
    await this.ensureTable();
    const d = new Date(resolvedAt);
    if (isNaN(d.getTime())) throw new Error('Invalid resolved date');
    const docs = this.sanitizeRcaDocs(rcaDocs);
    await execute(
      `UPDATE escalation_mails SET status = 'RESOLVED', resolved_at = $1, rca = $2, rca_docs = $3 WHERE id = $4`,
      [d.toISOString(), clean(rca || ''), JSON.stringify(docs), id]
    );
    const result = await query(`SELECT * FROM escalation_mails WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  private sanitizeRcaDocs(docs?: RcaDoc[]): RcaDoc[] {
    return Array.isArray(docs)
      ? docs.filter((x) => x && typeof x.url === 'string').map((x) => ({ url: x.url, name: x.name || 'document' }))
      : [];
  }

  // Edit the resolution details later (resolved date, RCA text, and/or RCA docs).
  async updateResolution(id: string, resolvedAt: string | undefined, rca: string | undefined, rcaDocs?: RcaDoc[]): Promise<EscalationMail | null> {
    await this.ensureTable();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (resolvedAt !== undefined) {
      const d = new Date(resolvedAt);
      if (isNaN(d.getTime())) throw new Error('Invalid resolved date');
      params.push(d.toISOString());
      sets.push(`resolved_at = $${params.length}`);
    }
    if (rca !== undefined) {
      params.push(clean(rca || ''));
      sets.push(`rca = $${params.length}`);
    }
    if (rcaDocs !== undefined) {
      params.push(JSON.stringify(this.sanitizeRcaDocs(rcaDocs)));
      sets.push(`rca_docs = $${params.length}`);
    }
    if (!sets.length) {
      const cur = await query(`SELECT * FROM escalation_mails WHERE id = $1`, [id]);
      return cur.rows[0] ? mapRow(cur.rows[0]) : null;
    }
    params.push(id);
    await execute(`UPDATE escalation_mails SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    const result = await query(`SELECT * FROM escalation_mails WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async updateOwner(id: string, escalationOwner: string): Promise<EscalationMail | null> {
    await this.ensureTable();
    await execute(`UPDATE escalation_mails SET escalation_owner = $1 WHERE id = $2`, [escalationOwner, id]);
    const result = await query(`SELECT * FROM escalation_mails WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async updateReceivedAt(id: string, receivedAt: string): Promise<EscalationMail | null> {
    await this.ensureTable();
    const d = new Date(receivedAt);
    if (isNaN(d.getTime())) throw new Error('Invalid date');
    await execute(`UPDATE escalation_mails SET received_at = $1 WHERE id = $2`, [d.toISOString(), id]);
    const result = await query(`SELECT * FROM escalation_mails WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async delete(id: string): Promise<void> {
    await this.ensureTable();
    await execute(`DELETE FROM escalation_mails WHERE id = $1`, [id]);
  }
}

export const escalationMailService = new EscalationMailService();
