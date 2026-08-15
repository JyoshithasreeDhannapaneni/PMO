---
name: architecture
description: This project's specific request-flow, schema-layering, and integration architecture — not general software architecture advice
---

# Skill: PMO Tracker Architecture

## Trigger Patterns
- "how does data flow through this app", "where does X get saved", "how is the schema managed", "what happens when I add a column", "how do the Graph/Jira/OpenAI integrations fit together"

## What This Skill Knows (that gstack doesn't)

### Layering
`routes/ → controllers/ → services/` — controllers are thin, services own all SQL (raw `pg`, no ORM) and all business logic. See `.claude/rules/architecture-boundaries.md` for the full contract.

### Schema is NOT one migration tool
Three places, in order of authority:
1. `backend/src/db/init.ts` — idempotent base schema (`CREATE TABLE IF NOT EXISTS`), run every boot.
2. `backend/src/index.ts`'s `runMigrations()` — accumulating `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` blocks, each guarded by `columnExists()`, run every boot. **This is the actual current source of truth.**
3. `database/schema.sql` — a stale April-2026 snapshot with Postgres `ENUM` types that `runMigrations()` later converts to `VARCHAR`. Not read by the app; don't edit it expecting it to matter.

### Delay Calculation Is Computed Live
`calculateDelay()` in `backend/src/utils/delayCalculator.ts` recomputes delay status/days on every read (in `mapProjectRow`-style functions), not just from a cached DB column — so it's always accurate for "today" without waiting on a cron. `projectService.ts` and `accountManagerController.ts` each have their OWN copy of similar kickoff-adjusted expected-end-date logic — a past bug came from these two independent copies drifting apart (see `.claude/memory/decisions.md`). If you touch one, check whether the other needs the same fix.

### External Integrations, One Service Each
- **Jira**: OAuth 2.0 (3LO) — org blocks API tokens. Excel-upload is a parallel fallback path when OAuth isn't connected; both paths must return the same shape.
- **Microsoft Graph — two separate app registrations**: `MS_GRAPH_*` (Email Hygiene, Call Hygiene, call-transcript fetch — needs `Mail.Read`/`Calendars.Read`/`OnlineMeetingTranscript.Read.All`) vs. `MICROSOFT_*` (SSO + `Mail.Send` for server alerts). Don't conflate their env vars or their permission scopes.
- **OpenAI**: `transcriptGradingService.ts` — the only current LLM integration. An earlier Anthropic-based chatbot (`chatService.ts`/`aiController.ts`) was deleted in a cleanup commit; `@anthropic-ai/sdk` is still an unused dependency in `backend/package.json`.

### Deployment Topology
Docker Compose: `postgres` + `backend` + `frontend` + `nginx`, behind an nginx reverse proxy on a VPS (ports 8089/8091 → 80/443). Not Vercel/managed hosting — see `docker-compose.yml` and `nginx/nginx.conf`.

## What to Do With This
When asked to add a feature or explain a flow, trace it through this exact layering and name the real file(s) involved — don't describe a generic MVC/ORM architecture that doesn't match this codebase.
