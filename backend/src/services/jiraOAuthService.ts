import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { logger } from '../utils/logger';

const TOKENS_FILE = path.join(process.cwd(), '.jira-oauth-tokens.json');

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudId: string;
  cloudUrl: string;
  connectedAs: string;
}

export function getOAuthConfig() {
  return {
    clientId:    (process.env.JIRA_OAUTH_CLIENT_ID     || '').trim(),
    clientSecret:(process.env.JIRA_OAUTH_CLIENT_SECRET || '').trim(),
    redirectUri: (process.env.JIRA_OAUTH_REDIRECT_URI  || 'http://localhost:3001/api/jira/oauth/callback').trim(),
  };
}

export function isOAuthConfigured(): boolean {
  const { clientId, clientSecret } = getOAuthConfig();
  return !!(
    clientId && clientSecret &&
    !clientId.startsWith('PASTE_') &&
    !clientSecret.startsWith('PASTE_') &&
    clientId.length > 10 &&
    clientSecret.length > 10
  );
}

export function loadTokens(): OAuthTokens | null {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

function saveTokens(tokens: OAuthTokens): void {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
}

export function isOAuthConnected(): boolean {
  return loadTokens() !== null;
}

// One-time OAuth `state` values handed out to admins starting a connect. The callback is a
// public route (Atlassian redirects the browser there), so it must refuse any code that
// didn't come from a connect an admin started — otherwise anyone could link their own
// Atlassian account as the org-wide Jira connection. In-memory is enough: one backend
// process, and a restart only means the admin clicks Connect again.
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map<string, number>();

function issueState(): string {
  const now = Date.now();
  for (const [s, expiresAt] of pendingStates) if (expiresAt <= now) pendingStates.delete(s);
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, now + STATE_TTL_MS);
  return state;
}

export function consumeAuthorizationState(state: unknown): boolean {
  if (typeof state !== 'string') return false;
  const expiresAt = pendingStates.get(state);
  pendingStates.delete(state);
  return expiresAt !== undefined && expiresAt > Date.now();
}

export function getAuthorizationUrl(): string {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    audience:      'api.atlassian.com',
    client_id:     clientId,
    scope:         'read:jira-work read:jira-user offline_access',
    redirect_uri:  redirectUri,
    state:         issueState(),
    response_type: 'code',
    prompt:        'consent',
  });
  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();

  const { data: tokenData } = await axios.post(
    'https://auth.atlassian.com/oauth/token',
    { grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri },
    { headers: { 'Content-Type': 'application/json' } }
  );

  // Discover which cloud site this token belongs to
  const { data: resources } = await axios.get(
    'https://api.atlassian.com/oauth/token/accessible-resources',
    { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' } }
  );

  const resource = (resources as any[]).find((r: any) => r.url.includes('cf2020')) || resources[0];
  if (!resource) throw new Error('No accessible Jira resources found for this account');

  // Get display name of the connected user
  let connectedAs = '';
  try {
    const { data: me } = await axios.get(
      `https://api.atlassian.com/ex/jira/${resource.id}/rest/api/3/myself`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' } }
    );
    connectedAs = me.displayName || me.emailAddress || '';
  } catch {}

  const tokens: OAuthTokens = {
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt:    Date.now() + (tokenData.expires_in * 1000) - 60_000,
    cloudId:      resource.id,
    cloudUrl:     resource.url,
    connectedAs,
  };

  saveTokens(tokens);
  logger.info(`[Jira OAuth] Connected as "${connectedAs}", cloudId=${resource.id}`);
  return tokens;
}

export async function getValidAccessToken(): Promise<{ token: string; cloudId: string } | null> {
  let tokens = loadTokens();
  if (!tokens) return null;

  // Token is still valid
  if (Date.now() < tokens.expiresAt) {
    return { token: tokens.accessToken, cloudId: tokens.cloudId };
  }

  // Refresh the access token
  try {
    const { clientId, clientSecret } = getOAuthConfig();
    const { data } = await axios.post(
      'https://auth.atlassian.com/oauth/token',
      { grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refreshToken },
      { headers: { 'Content-Type': 'application/json' } }
    );
    tokens = {
      ...tokens,
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt:    Date.now() + (data.expires_in * 1000) - 60_000,
    };
    saveTokens(tokens);
    logger.info('[Jira OAuth] Access token refreshed');
    return { token: tokens.accessToken, cloudId: tokens.cloudId };
  } catch (e: any) {
    logger.error(`[Jira OAuth] Token refresh failed: ${e.message}`);
    return null;
  }
}

export function revokeTokens(): void {
  if (fs.existsSync(TOKENS_FILE)) {
    fs.unlinkSync(TOKENS_FILE);
    logger.info('[Jira OAuth] Tokens revoked');
  }
}
