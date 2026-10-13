'use strict';
import { logger } from '../utils/logger';
import { CLOUDFUZE_LOGO_CID, CLOUDFUZE_LOGO_HEIGHT, CLOUDFUZE_LOGO_PNG_BASE64, CLOUDFUZE_LOGO_WIDTH } from '../assets/cloudfuzeLogo';

// Image attached to the message and referenced from the HTML as src="cid:<contentId>".
export interface InlineImage {
  contentId: string;
  name: string;
  contentType: string;
  contentBase64: string;
}

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  // Mailbox to send as (defaults to ALERT_FROM_EMAIL). Sending as another user needs the
  // Graph app's Mail.Send to cover that mailbox; a refusal surfaces as GraphSendError 403/404.
  from?: string;
  replyTo?: string;
  inlineImages?: InlineImage[];
}

export class GraphSendError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const BRAND_COLOR = '#2563eb';

// admin@company.com is the placeholder address on the built-in `admin` account
// (authService.createDefaultAdmin, db/seed.ts, reset-admin.js). That account has role ADMIN,
// so every "mail all admins/PMs" job was sending to it daily. Blocked here at the send layer so
// no current or future recipient query can reach it.
const BLOCKED_RECIPIENTS = new Set(['admin@company.com']);

export function isBlockedRecipient(email: string): boolean {
  return BLOCKED_RECIPIENTS.has(email.trim().toLowerCase());
}

/** Wrap any body HTML in a consistent CloudFuze-branded shell. */
export function brandedEmail(title: string, body: string, accentColor = BRAND_COLOR): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${accentColor};padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">☁ CloudFuze PMO</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Title bar -->
        <tr>
          <td style="padding:24px 32px 8px 32px;border-bottom:2px solid #eff6ff;">
            <h2 style="margin:0;font-size:18px;font-weight:700;color:#1e293b;">${title}</h2>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 32px;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8faff;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              CloudFuze Neutara PMO Tracker &nbsp;·&nbsp; Project Migration Management<br/>
              This is an automated notification — please do not reply directly to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Primary blue of the CloudFuze logo (frontend/public/cloudfuze-logo.png).
export const CLOUDFUZE_BLUE = '#0129AC';

export function cloudfuzeLogoImage(): InlineImage {
  return { contentId: CLOUDFUZE_LOGO_CID, name: 'cloudfuze-logo.png', contentType: 'image/png', contentBase64: CLOUDFUZE_LOGO_PNG_BASE64 };
}

// Shell for emails sent to customers: CloudFuze logo and brand blue instead of the internal
// "PMO" notification header. Send with `inlineImages: [cloudfuzeLogoImage()]` so the logo renders.
export function customerEmail(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border-top:5px solid ${CLOUDFUZE_BLUE};box-shadow:0 4px 24px rgba(1,41,172,0.08);">
        <tr>
          <td align="center" style="padding:28px 32px 8px 32px;">
            <img src="cid:${CLOUDFUZE_LOGO_CID}" width="${CLOUDFUZE_LOGO_WIDTH}" height="${CLOUDFUZE_LOGO_HEIGHT}" alt="CloudFuze"
                 style="display:block;border:0;outline:none;text-decoration:none;width:${CLOUDFUZE_LOGO_WIDTH}px;height:auto;color:${CLOUDFUZE_BLUE};font-size:24px;font-weight:700;" />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 32px 4px 32px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:${CLOUDFUZE_BLUE};">${title}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px 40px;font-size:15px;line-height:1.6;color:#334155;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f6f8fd;padding:18px 32px;border-top:1px solid #e5e9f5;text-align:center;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
              <strong style="color:${CLOUDFUZE_BLUE};">CloudFuze</strong> &nbsp;·&nbsp;
              <a href="https://www.cloudfuze.com" style="color:#64748b;text-decoration:underline;">cloudfuze.com</a><br/>
              Questions? Reply to this email and it will reach your project manager.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function resolveTenantId(): Promise<string> {
  const configured = process.env.MICROSOFT_TENANT_ID;
  // 'common' does not work with client_credentials — must be a real tenant GUID or domain
  if (configured && configured !== 'common') return configured;
  try {
    const fromEmail = process.env.ALERT_FROM_EMAIL || 'Bharath.Tummaganti@cloudfuze.com';
    const domain = fromEmail.split('@')[1];
    const res = await fetch(`https://login.microsoftonline.com/${domain}/.well-known/openid-configuration`);
    const data = await res.json() as any;
    const match = (data.token_endpoint as string)?.match(/\/([a-f0-9-]{36})\//);
    if (match?.[1]) return match[1];
    logger.warn(`[Graph/Email] Discovery response missing tenant GUID for domain ${domain}`);
  } catch (err: any) {
    logger.warn(`[Graph/Email] Tenant discovery threw: ${err.message}`);
  }
  throw new Error(
    'Cannot determine Microsoft tenant ID. Set MICROSOFT_TENANT_ID to your Azure AD tenant GUID in .env ' +
    '(Azure Portal → Azure Active Directory → Overview → Tenant ID).'
  );
}

const GRAPH_TIMEOUT_MS = 30_000;

export function defaultFromAddress(): string {
  return process.env.ALERT_FROM_EMAIL || 'Bharath.Tummaganti@cloudfuze.com';
}

async function sendViaGraph(
  to: string,
  subject: string,
  html: string,
  cc?: string[],
  opts: { from?: string; replyTo?: string; inlineImages?: InlineImage[] } = {}
): Promise<void> {
  const clientId = process.env.AZURE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
  const fromEmail = opts.from || defaultFromAddress();

  if (!clientId || !clientSecret) throw new Error('AZURE_CLIENT_ID and AZURE_CLIENT_SECRET must be set in .env');

  const tenantId = await resolveTenantId();

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
  });

  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) {
    const detail = tokenData.error_description || tokenData.error || JSON.stringify(tokenData);
    logger.error(`[Graph/Email] Token request failed: ${detail}`);
    throw new Error(`Microsoft token request failed: ${detail}`);
  }

  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`, {
    method: 'POST',
    // A hung call would otherwise hold the request (and a C-SAT send's pending row) indefinitely.
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        ...(cc && cc.length > 0 ? { ccRecipients: cc.map((addr) => ({ emailAddress: { address: addr } })) } : {}),
        ...(opts.replyTo ? { replyTo: [{ emailAddress: { address: opts.replyTo } }] } : {}),
        ...(opts.inlineImages && opts.inlineImages.length > 0
          ? {
              attachments: opts.inlineImages.map((img) => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: img.name,
                contentType: img.contentType,
                contentBytes: img.contentBase64,
                contentId: img.contentId,
                isInline: true,
              })),
            }
          : {}),
      },
      // Never keep a copy: a PM's C-SAT survey carries the customer's one-time link.
      saveToSentItems: false,
    }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    logger.error(`[Graph/Email] sendMail failed (HTTP ${sendRes.status}): ${errText}`);
    throw new GraphSendError(`Graph API sendMail failed (${sendRes.status}): ${errText}`, sendRes.status);
  }
}

class EmailService {
  async sendEmail(options: EmailOptions): Promise<void> {
    const allTo = Array.isArray(options.to) ? options.to : [options.to];
    const allCc = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : [];
    const blocked = [...allTo, ...allCc].filter(isBlockedRecipient);
    if (blocked.length > 0) logger.info(`Email skipped for blocked recipient(s): ${blocked.join(', ')} | Subject: ${options.subject}`);

    const recipients = allTo.filter((addr) => !isBlockedRecipient(addr));
    const filteredCc = allCc.filter((addr) => !isBlockedRecipient(addr));
    const cc = filteredCc.length > 0 ? filteredCc : undefined;

    for (const to of recipients) {
      try {
        await sendViaGraph(to, options.subject, options.html, cc, {
          from: options.from,
          replyTo: options.replyTo,
          inlineImages: options.inlineImages,
        });
        logger.info(`Email sent → ${to}${cc?.length ? ` (cc: ${cc.join(', ')})` : ''} | Subject: ${options.subject}`);
      } catch (err: any) {
        logger.error(`Email failed → ${to} | ${err.message}`);
        throw err;
      }
    }
  }

  // ── Pre-built email types ──────────────────────────────────────────

  async sendWelcome(name: string, email: string): Promise<void> {
    const body = `
      <p style="font-size:15px;">Hello <strong>${name}</strong>,</p>
      <p>Your CloudFuze Neutara PMO Tracker account has been created successfully. You can now log in and start tracking your migration projects.</p>
      <p style="margin-top:24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login"
           style="background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Sign In Now →
        </a>
      </p>`;
    await this.sendEmail({ to: email, subject: 'Welcome to CloudFuze Neutara PMO Tracker', html: brandedEmail('Welcome!', body) });
  }

  async sendPasswordChanged(name: string, email: string): Promise<void> {
    const body = `
      <p>Hello <strong>${name}</strong>,</p>
      <p>Your account password was changed successfully.</p>
      <p style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;font-size:13px;">
        If you did not make this change, <strong>contact your administrator immediately</strong>.
      </p>`;
    await this.sendEmail({ to: email, subject: 'Password Changed — CloudFuze PMO', html: brandedEmail('Password Changed', body, '#ef4444') });
  }

  async sendNewUserCredentials(name: string, email: string, tempPassword: string): Promise<void> {
    const body = `
      <p>Hello <strong>${name}</strong>,</p>
      <p>An administrator has created your CloudFuze Neutara PMO Tracker account. Use the credentials below to sign in.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;width:100%;">
        <tr><td style="padding:6px 12px;font-size:13px;color:#64748b;">Email</td><td style="padding:6px 12px;font-weight:600;">${email}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#64748b;">Temp password</td><td style="padding:6px 12px;font-weight:600;font-family:monospace;">${tempPassword}</td></tr>
      </table>
      <p style="font-size:13px;color:#ef4444;font-weight:600;">Please change your password immediately after first login.</p>
      <p style="margin-top:20px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login"
           style="background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Sign In Now →
        </a>
      </p>`;
    await this.sendEmail({ to: email, subject: 'Your CloudFuze PMO Account', html: brandedEmail('Account Created', body) });
  }

  async sendPasswordReset(name: string, email: string, resetUrl: string): Promise<void> {
    const body = `
      <p>Hello <strong>${name}</strong>,</p>
      <p>We received a request to reset your CloudFuze Neutara PMO Tracker password. Click the button below to set a new password:</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}"
           style="background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Reset My Password →
        </a>
      </p>
      <p style="font-size:13px;color:#64748b;">This link expires in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>`;
    await this.sendEmail({ to: email, subject: 'Reset Your Password — CloudFuze PMO', html: brandedEmail('Password Reset', body) });
  }

  /** Generic notification email with accent color per type. */
  async sendNotification(opts: {
    to: string[];
    type: 'DELAY_DETECTED' | 'PROJECT_COMPLETED' | 'CASE_STUDY_REMINDER' | 'PHASE_COMPLETED' | 'GENERAL';
    title: string;
    rows: { label: string; value: string }[];
    note?: string;
    projectUrl?: string;
  }): Promise<void> {
    if (opts.to.length === 0) return;

    const accentMap: Record<string, string> = {
      DELAY_DETECTED: '#ef4444',
      PROJECT_COMPLETED: '#16a34a',
      CASE_STUDY_REMINDER: '#2563eb',
      PHASE_COMPLETED: '#7c3aed',
      GENERAL: '#64748b',
    };
    const accent = accentMap[opts.type] || BRAND_COLOR;

    const tableRows = opts.rows
      .map(r => `<tr>
        <td style="padding:8px 12px;font-size:13px;color:#64748b;white-space:nowrap;border-bottom:1px solid #f1f5f9;">${r.label}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${r.value}</td>
      </tr>`)
      .join('');

    const noteHtml = opts.note
      ? `<p style="background:#f8faff;border-left:4px solid ${accent};padding:10px 14px;border-radius:4px;font-size:13px;margin:16px 0;">${opts.note}</p>`
      : '';

    const ctaHtml = opts.projectUrl
      ? `<p style="margin-top:20px;">
          <a href="${opts.projectUrl}"
             style="background:${accent};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
            View Project →
          </a>
        </p>`
      : '';

    const body = `
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
        ${tableRows}
      </table>
      ${noteHtml}
      ${ctaHtml}`;

    await this.sendEmail({
      to: opts.to,
      subject: opts.title,
      html: brandedEmail(opts.title, body, accent),
    });
  }
}

export const emailService = new EmailService();
