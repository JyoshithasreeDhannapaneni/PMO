# Security Rules — PMO Tracker

## Authentication & Authorization
- Every non-public route uses `requireAuth` (`backend/src/middleware/auth.ts`).
- Anything reading **per-person sensitive content** — call transcripts (`callTranscriptController.ts`), raw email hygiene data — additionally requires `requireRole('ADMIN')`. This is a hard gate, not a suggestion: grading an employee's meeting answers is HR-adjacent data.
- `viewerReadOnly` middleware (`backend/src/middleware/viewerReadOnly.ts`) is applied globally in `index.ts` — do not re-implement per-route VIEWER checks; extend that middleware instead if a new mutation needs blocking for VIEWER role.
- JWT is decoded to `req.user = { id, email, role }` — never trust a role/id passed in the request body instead of the token.

## SQL
- All queries go through `query()`/`execute()` in `backend/src/config/database.ts`, which are parameterized (`$1, $2, ...`). **Never** build a query with string interpolation of user input — this is a real risk given every service hand-writes SQL (no ORM query builder to fall back on for escaping).
- When adding a new filter/search parameter to a list endpoint, extend the existing parameterized `WHERE` builder pattern in that service — do not concatenate raw strings.

## Secrets
- Never commit `backend/.env`, `backend/.jira-oauth-tokens.json`, or `backend/.nta-state.json` (all gitignored already).
- **Do not hardcode credentials in any `.mcp.json`/`mcp.json`.** The root-level `mcp.json` (tracked in git, commit `759b3c9`) contains a live-looking Postgres password — this is a known, already-committed exposure. Rotate that DB password; don't repeat the pattern in new MCP configs (use env var interpolation instead, e.g. `${DATABASE_MCP_URL}`).
- `OPENAI_API_KEY`, `MS_GRAPH_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `JIRA_OAUTH_CLIENT_SECRET` all live only in `backend/.env`. If a user pastes a real key into chat, treat it as compromised — tell them to rotate it, don't write the pasted value into any file.

## External Integrations
- **Jira**: OAuth 2.0 (3LO) only — the org blocks API token auth. Scopes are exactly `read:jira-work read:jira-user offline_access`. Never add `manage:servicedesk-customer` (triggers an org-level admin-approval block).
- **Microsoft Graph**: two separate app registrations exist — `MS_GRAPH_*` (Email/Call Hygiene + transcripts, needs `Mail.Read`/`Calendars.Read`/`OnlineMeetingTranscript.Read.All` application permissions) and `MICROSOFT_*` (SSO + `Mail.Send` for alerts). Don't conflate them.
- **OpenAI**: only used for grading call transcripts (`transcriptGradingService.ts`). Any new use of the OpenAI API should go through this same pattern (env-var key, explicit error propagation — see below).

## Error Handling — Don't Silently Swallow
- A caught error that becomes an empty array/zero value with no logging is a real bug class in this codebase's history: `callHygieneService.ts` and `emailHygieneService.ts` both used to do `.catch(() => [])` around a Microsoft Graph call, which turned a `403` permission error into "this person had 0 calls" with no visible error anywhere. Any new external-API call must either let the error propagate (so it surfaces via the existing `Promise.allSettled` + `logger.error` pattern) or explicitly log before returning a fallback — never a bare `.catch(() => emptyValue)`.

## File Uploads
- `multer` is configured with memory storage — check the relevant route for file-type/size restrictions before adding a new upload endpoint; don't assume unrestricted uploads are safe to add.

## CORS
- `cors()` in `index.ts` is scoped to `process.env.FRONTEND_URL` with `credentials: true` — never widen this to `origin: '*'`, especially not for a production deploy.
