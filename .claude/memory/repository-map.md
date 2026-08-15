---
name: repository-map
description: Folder-by-folder map of the PMO Tracker repo, including which folders are dead code to avoid
metadata:
  type: project
---

Full navigation map, kept separate from CLAUDE.md to keep that file lean.

**Why:** Two stray dead-code folders exist from earlier refactors and can waste time (or get accidentally edited) if not flagged explicitly.

**How to apply:** Use this before a broad codebase search when you're not sure where something lives; skip the dead-code folders entirely.

## Backend (`backend/src/`)
- `config/` — `database.ts` (the real `query`/`execute` pg pool used everywhere)
- `controllers/` — thin request handlers, one file per domain. **`controllers/backup/` is dead code** — old copies, not imported anywhere, don't trust or edit.
- `db/` — `init.ts` (idempotent base schema, exported as `schema` and run on boot), `seed.ts`
- `jobs/` — `index.ts` registers cron jobs (only runs if `ENABLE_CRON_JOBS=true`); individual job files alongside it
- `middleware/` — `auth.ts` (`requireAuth`/`requireRole`), `errorHandler.ts` (`AppError`, response shaping), `viewerReadOnly.ts` (global VIEWER-role write-block), `notFoundHandler.ts`
- `routes/` — one Express router per domain, mounted in `index.ts`
- `services/` — all business logic + raw SQL. **`backend/backup_services/` (sibling to `src/`, not inside it) is also dead code** — same caveat.
- `utils/` — `logger.ts` (Winston), `delayCalculator.ts`
- `index.ts` — app bootstrap: env loading (`dotenv.config({ path: path.resolve(__dirname, '../.env') })`), middleware wiring, route mounting, `runMigrations()`, server start + startup jobs (default admin seed, template seed, delay recalculation, cron init)

## Frontend (`frontend/src/`)
- `app/(authenticated)/` — every protected page as its own folder (e.g. `projects/`, `account-manager/`, `reports/audit-dashboard/`, `escalation-mails/`, `poc-projects/`, `manager-dashboard/`, `customer-success/`, `professional-services/`, `deal-desk/`, `reviews/`, `server-alerts/`, `settings/`, `smtp-settings/`, `kb-articles/`, `migration-runbooks/`, `migration-types/`, `overage-projects/`, `escalation-projects/`, `archive/`, `case-studies/`, `clients/`, `templates/`, `portfolio/`, `notifications/`). `layout.tsx` at this level applies the auth guard to everything under it.
- `components/` — shared UI; `components/projects/ProjectsTable.tsx` and `ProjectDetail.tsx` contain the `EditableDate` (and `TLEditableDate`) inline components used for all date-picker cells.
- `hooks/useProjects.ts` — **every** React Query hook in the app lives here. No exceptions.
- `services/api.ts` — Axios instance + one `<domain>Api` object per backend domain.
- `lib/utils.ts` — `cn()`, `formatDate()` (timezone-safe as of the Aug 2026 fix — see [[decisions]]), color-mapping helpers.
- `context/AuthContext.tsx` — JWT/session context.
- `scripts/predev.js` — OneDrive workaround, runs before every `next dev`.

## Root-level
- `docker-compose.yml`, `nginx/nginx.conf` — production deploy topology (postgres + backend + frontend + nginx on a VPS).
- `database/schema.sql` — **stale** original schema snapshot (April 2026), not read by the app; `database/migrations/` — one-off ad-hoc SQL files, also not an active migration pipeline.
- `mcp.json` (no leading dot, tracked in git) — **contains a hardcoded live-looking Postgres password** (commit `759b3c9`). Superseded by the new `.mcp.json` (dot-prefixed, no hardcoded secrets). Rotate the password; stop using the old file.
- `package.json` (root) — vestigial; just `{"dependencies": {"bcrypt": "^6.0.0"}}`, no scripts, not a real monorepo manager. Don't assume root-level `npm` scripts exist.
- `README.md` — **outdated in several places** (Prisma, `DATABASE_URL`, SMTP env vars) — see [[decisions]] and `.claude/skills/documentation/SKILL.md` before trusting a claim in it.

## What Doesn't Exist (don't assume it does)
- No `.github/workflows/` — no CI/CD pipeline. `/team-review` + `npx tsc --noEmit` are the only pre-merge gates.
- No `backend/prisma/` — no Prisma, despite what `README.md` says.
- No test infrastructure — no `jest` installed on either side, zero `.test.*` files anywhere.

[[architecture]]
[[decisions]]
