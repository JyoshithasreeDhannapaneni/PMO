import axios from 'axios';
import { query, execute } from '../config/database';
import { logger } from '../utils/logger';

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface DealFields {
  customerName: string | null;
  sowRef: string | null;
  dealValue: number | null;
  dealStatus: string;
  signerName: string | null;
  signedAt: string | null;
  lineItems: LineItem[];
}

interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

interface MatchResult {
  matchedPsId: string | null;
  matchedProjectId: string | null;
  matchType: string;
  matchConfidence: string;
}

let tokenCache: TokenCache | null = null;

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyContains(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

function tryPattern(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
  }
  return null;
}

function parseDateString(s: string): string | null {
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch { /* */ }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLineItems(text: string): LineItem[] {
  const items: LineItem[] = [];
  const lines = text.split('\n');
  const lineItemRe = /^(.{5,80}?)\s{2,}(\d[\d,.]*)\s{2,}\$?([\d,.]+)\s{2,}\$?([\d,.]+)/;
  for (const line of lines) {
    const m = line.match(lineItemRe);
    if (m) {
      items.push({
        description: m[1].trim(),
        quantity: parseFloat(m[2].replace(/,/g, '')),
        unitPrice: parseFloat(m[3].replace(/,/g, '')),
        total: parseFloat(m[4].replace(/,/g, '')),
      });
    }
  }
  return items.slice(0, 20);
}

function extractDealFields(text: string, subject: string): DealFields {
  const customerPatterns = [
    // DocuSign/Adobe Sign — "Dear Acme Corp," or "Hello Acme Corp,"
    /^(?:dear|hello|hi)\s+([A-Za-z0-9][^\n,!]{2,60})[,!]/im,
    // Standard SOW/contract document patterns
    /(?:customer|client|bill\s+to|sold\s+to|prepared\s+for|submitted\s+to|company)\s*[:\-]\s*([A-Za-z0-9][^\n\r]{2,80})/i,
    /company\s+name\s*[:\-]\s*([A-Za-z0-9][^\n\r]{2,60})/i,
    /^(?:to)\s*[:\-]\s*([A-Za-z0-9][^\n\r]{2,80})/im,
    // Adobe Sign "Recipient" field
    /(?:recipient|signatory)\s*[:\-]\s*([A-Za-z0-9][^\n<\(]{2,60})/i,
  ];

  const refPatterns = [
    /(?:sow\s*(?:ref|#|no\.?|number|id)|quote\s*(?:#|no\.?|number|ref|id)|reference\s*(?:#|no)?|po\s*(?:number|#))\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,39})/i,
    /\b(CF-(?:SOW|PS|QT|WO)-\d{4}-\d{3,6})\b/i,
    /\b(QT-\d{4}-\d{3,6})\b/i,
    /\b(SOW-\d{4}-\d{3,6})\b/i,
    // Extract from subject: "Agreement signed: <ref>"
    /(?:agreement signed|signed|completed)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9_\-\.\s]{3,60})/i,
  ];

  const amountPatterns = [
    /(?:total\s+(?:amount|value|price)|grand\s+total|amount\s+due|invoice\s+total|deal\s+value|contract\s+value|total\s+cost)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /total\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    /\$\s*([\d,]{3,}(?:\.\d{2})?)\s*(?:USD|total|\/year|\/month)?/i,
  ];

  const signerPatterns = [
    // DocuSign: "John Smith has signed the document"
    /^([A-Za-z][A-Za-z\s'\-\.]{2,50})\s+has\s+(?:signed|reviewed\s+and\s+signed|completed)/im,
    // Adobe Sign signer block
    /(?:signer|signatories|signed\s+by|authorized\s+by|accepted\s+by|approved\s+by|signature\s+of)\s*[:\-]?\s*([A-Za-z][^\n\r<\(]{2,60})/i,
    /(?:printed\s+name|full\s+name)\s*[:\-]\s*([A-Za-z][^\n\r]{2,60})/i,
    /client\s+signature\s*[:\-]?\s*([A-Za-z][^\n\r]{2,60})/i,
  ];

  const datePatterns = [
    /(?:date\s+signed?|signed?\s+date|execution\s+date|accepted\s+date|effective\s+date|date\s+completed|completed\s+on|signed\s+on)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i,
    // DocuSign timestamp: "Sent: January 15, 2026" / "Signed: January 15, 2026"
    /(?:signed|completed|executed)\s*[:\-]\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
  ];

  const customerName = tryPattern(text, customerPatterns);
  // Try refPatterns on body text first, then fall back to subject
  const sowRef = tryPattern(text, refPatterns) || tryPattern(subject, refPatterns);
  const amountStr = tryPattern(text, amountPatterns);
  const signerName = tryPattern(text, signerPatterns);
  const signedDateStr = tryPattern(text, datePatterns);

  const sub = subject.toLowerCase();
  let dealStatus = 'Sent';
  if (sub.includes('signed') || sub.includes('executed') || sub.includes('countersigned')) dealStatus = 'Signed';
  else if (sub.includes('completed') || sub.includes('complete')) dealStatus = 'Completed';
  else if (sub.includes('approved')) dealStatus = 'Approved';
  else if (sub.includes('rejected') || sub.includes('declined')) dealStatus = 'Declined';
  else if (sub.includes('voided') || sub.includes('void')) dealStatus = 'Voided';

  const dealValue = amountStr ? parseFloat(amountStr.replace(/,/g, '')) : null;
  const signedAt = signedDateStr ? parseDateString(signedDateStr) : null;
  const lineItems = extractLineItems(text);

  return { customerName, sowRef, dealValue, dealStatus, signerName, signedAt, lineItems };
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const tenantId = process.env.MS_GRAPH_TENANT_ID || '';
  const clientId = process.env.MS_GRAPH_CLIENT_ID || '';
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET || '';

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  try {
    const res = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    tokenCache = {
      token: res.data.access_token,
      expiresAt: Date.now() + (res.data.expires_in - 60) * 1000,
    };
    return tokenCache.token;
  } catch (err: any) {
    const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message;
    throw new Error(`MS Graph token error: ${detail}`);
  }
}

export async function testGraphAuth(): Promise<{ ok: boolean; error?: string; mailboxReachable?: boolean; mailboxError?: string }> {
  try {
    await getAccessToken();
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const email = process.env.DEAL_DESK_EMAIL || 'dealdesk@zenop.ai';
  try {
    const token = await getAccessToken();
    await axios.get(
      `https://graph.microsoft.com/v1.0/users/${email}/mailFolders/inbox`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { ok: true, mailboxReachable: true };
  } catch (err: any) {
    const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message;
    return { ok: true, mailboxReachable: false, mailboxError: detail };
  }
}

async function ensureTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS deal_desk_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id VARCHAR(1000) UNIQUE NOT NULL,
      subject TEXT,
      sender_email VARCHAR(300),
      sender_name VARCHAR(300),
      received_at TIMESTAMP,
      has_attachments BOOLEAN DEFAULT false,
      processed BOOLEAN DEFAULT false,
      body_text TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `, []);

  // Add body_text to existing tables that were created before this column existed
  await execute(`ALTER TABLE deal_desk_emails ADD COLUMN IF NOT EXISTS body_text TEXT`, []).catch(() => {});

  await execute(`
    CREATE TABLE IF NOT EXISTS deal_desk_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_id UUID NOT NULL REFERENCES deal_desk_emails(id) ON DELETE CASCADE,
      source_filename VARCHAR(500),
      customer_name VARCHAR(300),
      sow_ref VARCHAR(200),
      deal_value DECIMAL(15,2),
      deal_status VARCHAR(100),
      signer_name VARCHAR(300),
      signed_at TIMESTAMP,
      line_items JSONB DEFAULT '[]',
      matched_ps_id VARCHAR(64),
      matched_project_id UUID,
      match_type VARCHAR(50),
      match_confidence VARCHAR(20),
      extracted_text TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `, []);
}

async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType.includes('docx') || mimeType.includes('word')
    ) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }
  } catch (err) {
    logger.error('Document text extraction failed:', err);
  }
  return '';
}

async function matchDeal(customerName: string | null, sowRef: string | null): Promise<MatchResult> {
  const none: MatchResult = { matchedPsId: null, matchedProjectId: null, matchType: 'none', matchConfidence: 'none' };

  if (sowRef) {
    try {
      const r = await query(`SELECT id FROM ps_engagements WHERE LOWER(TRIM(sow_ref_id)) = LOWER(TRIM($1)) LIMIT 1`, [sowRef]);
      if (r.rows.length > 0) return { matchedPsId: r.rows[0].id, matchedProjectId: null, matchType: 'ps_sow', matchConfidence: 'exact' };
    } catch { /* table may not exist yet */ }
  }

  if (customerName) {
    const normCustomer = normalizeKey(customerName);
    try {
      const psRows = await query(`SELECT id, client_name FROM ps_engagements LIMIT 500`, []);
      for (const row of psRows.rows) {
        const normRow = normalizeKey(row.client_name || '');
        if (normRow === normCustomer) return { matchedPsId: row.id, matchedProjectId: null, matchType: 'ps_customer', matchConfidence: 'exact' };
        if (normRow.length > 3 && normCustomer.length > 3 && fuzzyContains(normRow, normCustomer))
          return { matchedPsId: row.id, matchedProjectId: null, matchType: 'ps_customer', matchConfidence: 'fuzzy' };
      }
    } catch { /* */ }

    try {
      const projRows = await query(`SELECT id, customer_name FROM projects WHERE status NOT IN ('CANCELLED','ARCHIVED') LIMIT 500`, []);
      for (const row of projRows.rows) {
        const normRow = normalizeKey(row.customer_name || '');
        if (normRow === normCustomer) return { matchedPsId: null, matchedProjectId: row.id, matchType: 'project_customer', matchConfidence: 'exact' };
        if (normRow.length > 3 && normCustomer.length > 3 && fuzzyContains(normRow, normCustomer))
          return { matchedPsId: null, matchedProjectId: row.id, matchType: 'project_customer', matchConfidence: 'fuzzy' };
      }
    } catch { /* */ }
  }

  return none;
}

export const dealDeskService = {
  isConfigured(): boolean {
    const t = process.env.MS_GRAPH_TENANT_ID || '';
    const c = process.env.MS_GRAPH_CLIENT_ID || '';
    const s = process.env.MS_GRAPH_CLIENT_SECRET || '';
    return !!(t && c && s && !t.startsWith('PASTE_') && !c.startsWith('PASTE_') && !s.startsWith('PASTE_'));
  },

  async processNewEmails(): Promise<{ processed: number; skipped: number; errors: number; found: number }> {
    if (!this.isConfigured()) {
      logger.warn('Deal Desk: MS Graph not configured — skipping email poll');
      return { processed: 0, skipped: 0, errors: 0, found: 0 };
    }

    await ensureTables();

    const mailbox = process.env.DEAL_DESK_EMAIL || 'dealdesk@zenop.ai';
    let processed = 0, skipped = 0, errors = 0;

    // Subject keywords that indicate an e-sign completion email
    const ESIGN_KEYWORDS = [
      'e-sign completed', 'esign completed', 'e-sign complete',
      'signing complete', 'signing completed', 'document signed',
      'has been signed', 'completed signing', 'signature completed',
      'signed document', 'contract signed', 'agreement signed',
      'sow signed', 'quote signed', 'sign completed',
    ];

    try {
      const token = await getAccessToken();

      // Search ALL mail folders (inbox + sent + other) for e-sign emails.
      // Using /messages (not /mailFolders/inbox/messages) so sent items are included.
      // No $filter — Graph rejects $filter+$orderby combos without an index.
      // We filter by subject and hasAttachments in code.
      const FOLDERS = ['inbox', 'sentItems'];
      let allMessages: any[] = [];

      for (const folder of FOLDERS) {
        let nextLink: string | null = null;
        let pagesFetched = 0;

        const firstRes = await axios.get(
          `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/${folder}/messages`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              $select: 'id,subject,from,receivedDateTime,hasAttachments',
              $top: 50,
              $orderby: 'receivedDateTime desc',
            },
          }
        );
        const firstPage: any[] = firstRes.data.value || [];
        allMessages = allMessages.concat(firstPage);
        nextLink = firstRes.data['@odata.nextLink'] || null;
        pagesFetched = 1;

        while (nextLink && pagesFetched < 5) {
          const pageRes: any = await axios.get(nextLink, { headers: { Authorization: `Bearer ${token}` } });
          const page: any[] = pageRes.data.value || [];
          allMessages = allMessages.concat(page);
          nextLink = pageRes.data['@odata.nextLink'] || null;
          pagesFetched++;
          if (page.length < 50) break;
          const oldest = page[page.length - 1]?.receivedDateTime;
          if (oldest && Date.now() - new Date(oldest).getTime() > 180 * 24 * 60 * 60 * 1000) break;
        }

        logger.info(`Deal Desk: folder=${folder} fetched ${firstPage.length}+ messages`);
      }

      logger.info(`Deal Desk: total ${allMessages.length} messages across all folders`);

      // Filter: must have attachments AND subject matches e-sign keywords
      const messages = allMessages.filter(msg => {
        if (!msg.hasAttachments) return false;
        const subject = (msg.subject || '').toLowerCase();
        return ESIGN_KEYWORDS.some(kw => subject.includes(kw));
      });

      logger.info(`Deal Desk: ${messages.length} match e-sign subject keywords`);

      for (const msg of messages) {
        try {
          // Check if already in DB AND already has deals extracted — skip only then.
          // If in DB but no deals, re-attempt attachment processing.
          const existingEmail = await query(
            `SELECT e.id,
                    (SELECT COUNT(*) FROM deal_desk_deals WHERE email_id = e.id) AS deal_count
             FROM deal_desk_emails e WHERE e.message_id = $1`,
            [msg.id]
          );

          let emailDbId: string;
          if (existingEmail.rows.length > 0) {
            const dealCount = parseInt(existingEmail.rows[0].deal_count, 10);
            if (dealCount > 0) { skipped++; continue; }
            // Has email record but 0 deals — re-attempt attachment processing
            emailDbId = existingEmail.rows[0].id;
            logger.info(`Deal Desk: retrying attachment processing for message ${msg.id}`);
          } else {
            const emailInsert = await query(
              `INSERT INTO deal_desk_emails
                (message_id, subject, sender_email, sender_name, received_at, has_attachments, processed)
               VALUES ($1, $2, $3, $4, $5, $6, false)
               RETURNING id`,
              [
                msg.id,
                msg.subject || '(no subject)',
                msg.from?.emailAddress?.address || null,
                msg.from?.emailAddress?.name || null,
                msg.receivedDateTime || null,
                true,
              ]
            );
            emailDbId = emailInsert.rows[0].id;
          }

          // Fetch email body — DocuSign/Adobe Sign put signer name, date, doc name in the HTML body
          let emailBodyText = '';
          try {
            const bodyRes = await axios.get(
              `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${msg.id}?$select=body`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const bodyContent: string = bodyRes.data?.body?.content || '';
            const bodyType: string = bodyRes.data?.body?.contentType || 'text';
            emailBodyText = bodyType === 'html' ? stripHtml(bodyContent) : bodyContent;
            emailBodyText = emailBodyText.substring(0, 10000);
            if (emailBodyText.trim().length > 20) {
              await execute(`UPDATE deal_desk_emails SET body_text = $2 WHERE id = $1`, [emailDbId, emailBodyText]);
              logger.info(`Deal Desk: fetched email body (${emailBodyText.trim().length} chars) for "${msg.subject}"`);
            }
          } catch (bodyErr: any) {
            logger.warn(`Deal Desk: could not fetch email body: ${bodyErr?.message}`);
          }

          // List attachments (metadata only — contentBytes fetched individually below)
          const attListRes = await axios.get(
            `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${msg.id}/attachments`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { $select: 'id,name,contentType,size' },
            }
          );
          const attachmentMeta: any[] = attListRes.data.value || [];
          logger.info(`Deal Desk: message "${msg.subject}" has ${attachmentMeta.length} attachment(s)`);

          let emailHasAnyDeal = false;

          for (const meta of attachmentMeta) {
            const name: string = meta.name || '';
            const mime: string = meta.contentType || '';
            const nameLower = name.toLowerCase();
            const isPdf = mime.includes('pdf') || nameLower.endsWith('.pdf');
            const isDocx = mime.includes('docx') || mime.includes('word') || nameLower.endsWith('.docx');

            logger.info(`Deal Desk: attachment name="${name}" contentType="${mime}" size=${meta.size}`);

            if (!isPdf && !isDocx) {
              logger.info(`Deal Desk: skipping non-PDF/DOCX attachment: ${name}`);
              continue;
            }

            try {
              // Fetch full attachment — always includes contentBytes for fileAttachment type
              const fullAttRes = await axios.get(
                `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${msg.id}/attachments/${meta.id}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              const fullAtt = fullAttRes.data;
              const attType: string = fullAtt['@odata.type'] || '';
              const contentBytes: string = fullAtt.contentBytes || '';

              logger.info(`Deal Desk: attachment @odata.type="${attType}" contentBytes length=${contentBytes.length}`);

              // Always create a deal record — even if text extraction fails, we store the filename
              const fields: DealFields = {
                customerName: null, sowRef: null, dealValue: null,
                dealStatus: 'Signed', signerName: null, signedAt: null, lineItems: [],
              };
              let extractedText = '';

              if (contentBytes) {
                const buffer = Buffer.from(contentBytes, 'base64');
                logger.info(`Deal Desk: decoded buffer size=${buffer.length} bytes for ${name}`);
                extractedText = await extractTextFromBuffer(buffer, mime);
                logger.info(`Deal Desk: extracted ${extractedText.trim().length} chars from ${name}`);
              } else {
                logger.warn(`Deal Desk: contentBytes empty for ${name} (type=${attType})`);
              }

              // PDF encrypted/image-based — fall back to email body text
              if (extractedText.trim().length < 20 && emailBodyText.trim().length > 20) {
                logger.info(`Deal Desk: PDF unreadable for "${name}" — using email body as text source`);
                extractedText = `[PDF encrypted or image-based — fields extracted from email body]\n\n${emailBodyText}`;
              }

              if (extractedText.trim().length >= 20) {
                const parsed = extractDealFields(extractedText, msg.subject || '');
                Object.assign(fields, parsed);
              }

              const match = await matchDeal(fields.customerName, fields.sowRef);

              await execute(
                `INSERT INTO deal_desk_deals
                  (email_id, source_filename, customer_name, sow_ref, deal_value, deal_status,
                   signer_name, signed_at, line_items, matched_ps_id, matched_project_id,
                   match_type, match_confidence, extracted_text)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                [
                  emailDbId, name,
                  fields.customerName, fields.sowRef, fields.dealValue, fields.dealStatus,
                  fields.signerName, fields.signedAt, JSON.stringify(fields.lineItems),
                  match.matchedPsId, match.matchedProjectId, match.matchType, match.matchConfidence,
                  extractedText.substring(0, 8000),
                ]
              );
              processed++;
              emailHasAnyDeal = true;
            } catch (attErr: any) {
              const attDetail = attErr?.response?.data
                ? JSON.stringify(attErr.response.data)
                : attErr?.message;
              logger.error(`Deal Desk: attachment error for ${name}: ${attDetail}`);
              errors++;
            }
          }

          // If no PDF/DOCX found but email is an e-sign, create a deal from email body
          if (!emailHasAnyDeal) {
            const subject = msg.subject || '';
            const bodyText = emailBodyText.trim().length > 20 ? emailBodyText : '';
            const bodyFields = bodyText.length > 0
              ? extractDealFields(bodyText, subject)
              : { customerName: null, sowRef: null, dealValue: null, dealStatus: 'Signed', signerName: null, signedAt: null, lineItems: [] };
            const bodyMatch = bodyFields.customerName || bodyFields.sowRef
              ? await matchDeal(bodyFields.customerName, bodyFields.sowRef)
              : { matchedPsId: null, matchedProjectId: null, matchType: 'none', matchConfidence: 'none' };

            const storedText = bodyText.length > 0
              ? `[Extracted from email body — no readable PDF attachment]\n\n${bodyText}`
              : subject;

            await execute(
              `INSERT INTO deal_desk_deals
                (email_id, source_filename, customer_name, sow_ref, deal_value, deal_status,
                 signer_name, signed_at, line_items, extracted_text, match_type, match_confidence,
                 matched_ps_id, matched_project_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
              [
                emailDbId,
                `(${attachmentMeta.length} attachment(s) — email body used)`,
                bodyFields.customerName, bodyFields.sowRef, bodyFields.dealValue, bodyFields.dealStatus,
                bodyFields.signerName, bodyFields.signedAt, JSON.stringify(bodyFields.lineItems),
                storedText.substring(0, 8000),
                bodyMatch.matchType, bodyMatch.matchConfidence,
                bodyMatch.matchedPsId, bodyMatch.matchedProjectId,
              ]
            );
            processed++;
          }

          await execute(`UPDATE deal_desk_emails SET processed = true WHERE id = $1`, [emailDbId]);
        } catch (msgErr: any) {
          logger.error(`Deal Desk: message processing error: ${msgErr?.message}`);
          errors++;
        }
      }
    } catch (err: any) {
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : (err?.message || String(err));
      logger.error(`Deal Desk: email poll failed: ${detail}`);
      errors++;
    }

    logger.info(`Deal Desk poll done: processed=${processed} skipped=${skipped} errors=${errors}`);
    return { processed, skipped, errors, found: processed + skipped };
  },

  async getDeals(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    matchType?: string;
  }) {
    await ensureTables();
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, params.limit || 25);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (params.status) { conditions.push(`d.deal_status = $${i++}`); values.push(params.status); }
    if (params.matchType) { conditions.push(`d.match_type = $${i++}`); values.push(params.matchType); }
    if (params.search) {
      conditions.push(`(d.customer_name ILIKE $${i} OR d.sow_ref ILIKE $${i} OR e.subject ILIKE $${i})`);
      values.push(`%${params.search}%`); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*) as cnt FROM deal_desk_deals d JOIN deal_desk_emails e ON e.id = d.email_id ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0]?.cnt || '0', 10);

    const dataRes = await query(
      `SELECT d.id, d.email_id, d.source_filename, d.customer_name, d.sow_ref,
              d.deal_value, d.deal_status, d.signer_name, d.signed_at,
              d.line_items, d.matched_ps_id, d.matched_project_id,
              d.match_type, d.match_confidence, d.created_at,
              d.extracted_text,
              e.subject, e.sender_email, e.sender_name, e.received_at,
              p.customer_name AS project_customer_name,
              ps.client_name AS ps_client_name, ps.sow_ref_id AS ps_sow_ref
       FROM deal_desk_deals d
       JOIN deal_desk_emails e ON e.id = d.email_id
       LEFT JOIN projects p ON p.id = d.matched_project_id
       LEFT JOIN ps_engagements ps ON ps.id = d.matched_ps_id
       ${where}
       ORDER BY e.received_at DESC NULLS LAST
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    );

    return {
      data: dataRes.rows,
      total,
      page,
      limit,
    };
  },

  async getDealById(id: string) {
    await ensureTables();
    const res = await query(
      `SELECT d.*, e.subject, e.sender_email, e.sender_name, e.received_at,
              p.customer_name AS project_customer_name,
              ps.client_name AS ps_client_name, ps.sow_ref_id AS ps_sow_ref
       FROM deal_desk_deals d
       JOIN deal_desk_emails e ON e.id = d.email_id
       LEFT JOIN projects p ON p.id = d.matched_project_id
       LEFT JOIN ps_engagements ps ON ps.id = d.matched_ps_id
       WHERE d.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async updateDealMatch(id: string, matchedPsId: string | null, matchedProjectId: string | null) {
    await ensureTables();
    await execute(
      `UPDATE deal_desk_deals
       SET matched_ps_id = $2, matched_project_id = $3,
           match_type = CASE WHEN $2 IS NOT NULL THEN 'ps_manual'
                             WHEN $3 IS NOT NULL THEN 'project_manual'
                             ELSE 'none' END,
           match_confidence = CASE WHEN $2 IS NOT NULL OR $3 IS NOT NULL THEN 'manual' ELSE 'none' END
       WHERE id = $1`,
      [id, matchedPsId, matchedProjectId]
    );
  },

  async reparseAllDeals(): Promise<{ updated: number }> {
    await ensureTables();
    const rows = await query(
      `SELECT d.id, d.extracted_text, e.id AS email_id, e.subject, e.body_text, e.message_id
       FROM deal_desk_deals d
       JOIN deal_desk_emails e ON e.id = d.email_id`,
      []
    );
    let updated = 0;
    const mailbox = process.env.DEAL_DESK_EMAIL || 'dealdesk@zenop.ai';
    let graphToken: string | null = null;

    for (const row of rows.rows) {
      let text: string = row.extracted_text || '';
      const subject: string = row.subject || '';
      let bodyText: string = row.body_text || '';

      // Body was never fetched (email processed before body-fetch code existed) — go get it now
      if (bodyText.trim().length < 20 && row.message_id && this.isConfigured()) {
        try {
          if (!graphToken) graphToken = await getAccessToken();
          const bodyRes = await axios.get(
            `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${row.message_id}?$select=body`,
            { headers: { Authorization: `Bearer ${graphToken}` } }
          );
          const bodyContent: string = bodyRes.data?.body?.content || '';
          const bodyType: string = bodyRes.data?.body?.contentType || 'text';
          bodyText = (bodyType === 'html' ? stripHtml(bodyContent) : bodyContent).substring(0, 10000);
          if (bodyText.trim().length > 20) {
            await execute(`UPDATE deal_desk_emails SET body_text = $2 WHERE id = $1`, [row.email_id, bodyText]);
            logger.info(`Reparse: fetched email body (${bodyText.trim().length} chars) for message ${row.message_id}`);
          }
        } catch (bodyErr: any) {
          logger.warn(`Reparse: could not fetch email body for ${row.message_id}: ${bodyErr?.message}`);
        }
      }

      // Use email body as text source when PDF was encrypted/image-based
      if (text.trim().length < 20 && bodyText.trim().length > 20) {
        text = `[PDF encrypted or image-based — fields extracted from email body]\n\n${bodyText}`;
      }
      if (text.trim().length < 10) continue;

      const fields = extractDealFields(text, subject);
      const match = await matchDeal(fields.customerName, fields.sowRef);
      await execute(
        `UPDATE deal_desk_deals
         SET customer_name=$2, sow_ref=$3, deal_value=$4, deal_status=$5,
             signer_name=$6, signed_at=$7, line_items=$8,
             matched_ps_id=$9, matched_project_id=$10, match_type=$11, match_confidence=$12,
             extracted_text=$13
         WHERE id=$1`,
        [
          row.id, fields.customerName, fields.sowRef, fields.dealValue, fields.dealStatus,
          fields.signerName, fields.signedAt, JSON.stringify(fields.lineItems),
          match.matchedPsId, match.matchedProjectId, match.matchType, match.matchConfidence,
          text.substring(0, 8000),
        ]
      );
      updated++;
    }
    return { updated };
  },

  async getStats() {
    await ensureTables();
    const res = await query(
      `SELECT
         COUNT(*) FILTER (WHERE TRUE) AS total_deals,
         COUNT(*) FILTER (WHERE match_type != 'none') AS matched_deals,
         COUNT(*) FILTER (WHERE match_type = 'none') AS unmatched_deals,
         COUNT(*) FILTER (WHERE deal_status = 'Signed') AS signed_deals,
         COALESCE(SUM(deal_value) FILTER (WHERE deal_status = 'Signed'), 0) AS total_signed_value,
         COUNT(DISTINCT customer_name) FILTER (WHERE customer_name IS NOT NULL) AS unique_customers
       FROM deal_desk_deals`,
      []
    );
    return res.rows[0];
  },
};
