'use strict';
import { logger } from '../utils/logger';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

const BRAND_COLOR = '#2563eb';

/** Wrap any body HTML in a consistent CloudFuze-branded shell. */
function brandedEmail(title: string, body: string, accentColor = BRAND_COLOR): string {
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
              CloudFuze PMO Tracker &nbsp;·&nbsp; Project Migration Management<br/>
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

async function sendViaGraph(to: string, subject: string, html: string): Promise<void> {
  const clientId = process.env.AZURE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
  const fromEmail = process.env.ALERT_FROM_EMAIL || 'Bharath.Tummaganti@cloudfuze.com';

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

  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    logger.error(`[Graph/Email] sendMail failed (HTTP ${sendRes.status}): ${errText}`);
    throw new Error(`Graph API sendMail failed (${sendRes.status}): ${errText}`);
  }
}

class EmailService {
  async sendEmail(options: EmailOptions): Promise<void> {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    for (const to of recipients) {
      try {
        await sendViaGraph(to, options.subject, options.html);
        logger.info(`Email sent → ${to} | Subject: ${options.subject}`);
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
      <p>Your CloudFuze PMO Tracker account has been created successfully. You can now log in and start tracking your migration projects.</p>
      <p style="margin-top:24px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login"
           style="background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Sign In Now →
        </a>
      </p>`;
    await this.sendEmail({ to: email, subject: 'Welcome to CloudFuze PMO Tracker', html: brandedEmail('Welcome!', body) });
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
      <p>An administrator has created your CloudFuze PMO Tracker account. Use the credentials below to sign in.</p>
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
      <p>We received a request to reset your CloudFuze PMO Tracker password. Click the button below to set a new password:</p>
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
