---
name: architecture
description: Request flow, schema layering, and integration architecture for PMO Tracker (backend uses raw pg, NOT Prisma)
metadata:
  type: project
---

The backend is Express + TypeScript + raw parameterized SQL via `pg` (`backend/src/config/database.ts` exports `query`/`execute`). There is no ORM.

**Why this matters:** `README.md` and this project's own earlier `.claude/` docs (workflows/feature-build.md, workflows/bug-fix.md) described a Prisma-based backend (`backend/prisma/schema.prisma`, `db:generate`/`db:migrate`). That was corrected during the 2026-08 Claude Code scaffold pass — there is no `prisma/` folder in this repo. Every service hand-writes SQL.

**How to apply:** Never suggest `npx prisma migrate` or reference `schema.prisma`. Schema changes go through `runMigrations()` in `backend/src/index.ts`.

## Request Flow
`routes/<domain>Routes.ts` (Express router, `requireAuth`) → `controllers/<domain>Controller.ts` (thin: validate → call service → shape `{ success, data }`) → `services/<domain>Service.ts` (all SQL + business logic).

## Schema Layering — Three Sources, One Authoritative
1. `backend/src/db/init.ts` — idempotent `CREATE TABLE IF NOT EXISTS` base schema, runs every boot.
2. `backend/src/index.ts` → `runMigrations()` — accumulating `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` blocks guarded by a `columnExists()` helper, runs every boot. **This is the current source of truth for schema.**
3. `database/schema.sql` — a stale 2026-04-10 snapshot with Postgres `ENUM` types (`plan_type`, `project_phase`, etc.) that `runMigrations()` converts to `VARCHAR` at runtime so values like `'CLOSED'`/`'DECOMMISSIONED'` (not in the original enum) don't throw. Not read by the running app.

## Delay Calculation Is Computed Live, Not Just Cached
`calculateDelay()` (`backend/src/utils/delayCalculator.ts`) recomputes delay status/days on every read. Both `backend/src/services/projectService.ts` (`mapProjectRow`) and `backend/src/controllers/accountManagerController.ts` (its own `mapProjectRow`) independently implement kickoff-adjusted expected-end-date logic — see [[decisions]] for the bug this caused when the two copies drifted (Account Manager page showing a different "Project End" than the All Projects page).

## External Integrations
- **Jira**: OAuth 2.0 (3LO) only (`cf2020.atlassian.net` blocks API tokens at the org level). Excel-upload is a parallel fallback path (`.jira-excel-data.json`) when OAuth isn't connected.
- **Microsoft Graph — two separate Azure AD app registrations, do not conflate**:
  - `MS_GRAPH_TENANT_ID`/`MS_GRAPH_CLIENT_ID`/`MS_GRAPH_CLIENT_SECRET` — Email Hygiene (`emailHygieneService.ts`), Call Hygiene (`callHygieneService.ts`), and call-transcript fetch (`callTranscriptService.ts`). Needs `Mail.Read`, `Calendars.Read`, and `OnlineMeetingTranscript.Read.All` application permissions, admin-consented.
  - `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_TENANT_ID` — SSO login + `Mail.Send` for server alert emails.
- **OpenAI** (`OPENAI_API_KEY`, `OPENAI_MODEL`) — `transcriptGradingService.ts` is the only current LLM integration, grading how well an internal team member answered customer questions in a Teams meeting transcript. An earlier Anthropic-based "PMO Assistant" chatbot (`chatService.ts` + `aiController.ts`) was deleted in commit `1811b33`; `@anthropic-ai/sdk` remains an unused dependency in `backend/package.json`.

## Deployment Topology
Docker Compose (`postgres` + `backend` + `frontend` + `nginx`), fronted by nginx on a VPS (host ports 8089/8091 → container 80/443). Not Vercel or another managed platform — see `docker-compose.yml`, `nginx/nginx.conf`, root `.env.example`.

[[decisions]]
[[repository-map]]
