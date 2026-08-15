# PMO Tracker — Claude Code Project Guide

CloudFuze's internal cloud-migration project tracking system. It replaces manual SharePoint tracking with a real-time dashboard for ENT/SMB customer migrations — SLA compliance, escalations, delays, phases, case studies, account/manager performance, and (as of Aug 2026) AI-graded call-quality scorecards from Teams transcripts.

- **Frontend**: http://localhost:3000 · **Backend API**: http://localhost:3001 · **DB**: PostgreSQL `pmo_tracker` on 5432

---

## Prerequisites — Install gstack once on your machine

This project uses **gstack** for AI-assisted development (code review, QA, security audits, docs, deployment). Every contributor must install gstack **once** on their own machine before using Claude Code on this repo.

**Requirements:** Claude Code, Git, Node.js 18+ ([nodejs.org](https://nodejs.org) LTS). Bun is installed automatically by gstack's setup.

**Windows users:** you must use **Git Bash** (comes with Git for Windows). PowerShell and CMD will NOT work.

### Install — run this yourself in a terminal (Claude will not run it for you)

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack
./setup
```

> This project deliberately does **not** have Claude auto-run this clone+setup command on your behalf, even when you ask it to "install gstack now." Fetching and executing a third-party setup script is something you should run yourself, once, after reading it — not something baked into standing project instructions that run unreviewed on every contributor's machine for years. Claude will detect whether gstack is present (see Pre-flight below) and tell you the command to run; it will not execute it for you.

**Verify it works:** reopen this project in Claude Code and type `/office-hours` — if Claude responds with the office-hours flow, gstack is working.

**Update gstack later:** run `/gstack-upgrade` inside any Claude Code session.

**Troubleshooting**

| Problem | Fix |
|---|---|
| `/office-hours` not recognized | `cd ~/.claude/skills/gstack && ./setup` |
| Windows: `bad interpreter: /bin/bash^M` | `cd ~/.claude/skills/gstack && git config core.autocrlf false && git config core.eol lf && git rm --cached -r . && git reset --hard HEAD && ./setup` |
| `/browse` fails | `cd ~/.claude/skills/gstack && bun install && bun run build` |

---

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, TanStack Query, TanStack Table, Recharts, lucide-react, React Hook Form + Zod
- **Backend**: Node.js + Express, TypeScript, **raw `pg` (node-postgres) — NOT Prisma**, PostgreSQL, node-cron, Nodemailer, Winston, multer, xlsx (SheetJS), Microsoft Graph (email/call hygiene, transcript grading), OpenAI SDK (call-transcript grading)
- **Auth**: Hand-rolled JWT (stored in localStorage), role-based (`ADMIN` / `PROJECT_MANAGER` / `VIEWER` / `PRE_SALES` / `ACCOUNT_MANAGER`)
- **Jira Integration**: OAuth 2.0 (3LO) only — scopes `read:jira-work read:jira-user offline_access`
- **No CI/CD pipeline exists yet** (no `.github/workflows/`) — `/review` and `npx tsc --noEmit` are the only pre-merge gates today
- **No test infrastructure exists yet** — `testing-standard.md` documents the intended approach, but neither `jest` nor any `.test.*` file exists in this repo currently. Don't assume tests run; check before claiming coverage.

> **Correction note:** `README.md` and some older `.claude/` docs describe a Prisma-based backend (`backend/prisma/schema.prisma`, `db:generate`/`db:migrate`). That's stale — there is no `prisma/` folder. The backend uses raw parameterized SQL via `backend/src/config/database.ts` (`query`/`execute`). See `.claude/memory/architecture.md`.

## Architecture Summary
- **Controllers → Services → raw `pg` queries.** Controllers are thin (validate → call service → respond). Services own all SQL and business logic.
- **Schema is NOT managed by a single migration tool.** Three layers, in order of authority: (1) `backend/src/db/init.ts` — idempotent `CREATE TABLE IF NOT EXISTS` base schema, run on every boot; (2) `backend/src/index.ts`'s `runMigrations()` — an accumulating list of `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` statements, also run every boot, each guarded by a `columnExists()` check; (3) `database/schema.sql` — the **original 2026-04 baseline only**, now stale (still shows Postgres `ENUM` types that `runMigrations()` converts to `VARCHAR` at runtime). **Treat `runMigrations()` in `index.ts` as the current source of truth for schema, not `database/schema.sql`.**
- **Delay calculation** is computed live on every read (`calculateDelay()` in `backend/src/utils/delayCalculator.ts`), not just cached in the DB, so it reflects "today" even if a cron hasn't run.
- **Deployment**: Docker Compose (`postgres` + `backend` + `frontend` + `nginx`) behind an nginx reverse proxy on a VPS (ports 8089/8091 → 80/443), not Vercel/managed hosting.
- Full detail: `.claude/memory/architecture.md`, `.claude/memory/repository-map.md`.

## Critical Constraints
1. **Never commit `.env`** — contains DB password and OAuth/API secrets.
2. **`CLAUDE.local.md` and `.claude/settings.local.json`** are gitignored — personal/machine overrides only.
3. **No `any` types** unless casting an external API response at the boundary.
4. **All new API routes need `requireAuth`**, plus `requireRole('ADMIN')` for sensitive data (e.g. call-transcript grading).
5. **Frontend hooks live only in `frontend/src/hooks/useProjects.ts`** — never create a separate hook file.
6. **OneDrive causes two build-tooling issues** on this Windows dev setup: (a) new lucide-react icons can fail with `os error 426` if not yet locally synced — only use icons already in a file's import list; (b) `frontend/scripts/predev.js` recreates `.next` as a SYSTEM-attribute folder before every `next dev` to stop OneDrive from locking webpack's writes — don't remove it.
7. **`dotenv.config()`** in `backend/src/index.ts` must use `path.resolve(__dirname, '../.env')` (one level up — `tsx` sets `__dirname` to `backend/src`).
8. **OAuth scope** — never add `manage:servicedesk-customer` (triggers an org-level approval block on `cf2020.atlassian.net`).
9. **Known secret exposure:** the root-level `mcp.json` (tracked in git, commit `759b3c9`) hardcodes a live-looking Postgres password. Don't copy that pattern into `.mcp.json`. Flag for rotation if not already handled.

## Repository Navigation
```
PMO/
├── backend/src/
│   ├── controllers/        # Thin — delegate to services (controllers/backup/ = dead code, ignore)
│   ├── routes/              # One Express router per domain
│   ├── services/            # All business logic + raw SQL
│   ├── middleware/           # auth.ts (requireAuth/requireRole), errorHandler.ts, viewerReadOnly.ts
│   ├── db/                  # init.ts (base schema), seed.ts
│   ├── jobs/                 # cron job registration + individual job files
│   ├── utils/                # logger (Winston), delayCalculator
│   └── index.ts              # App bootstrap, route mounting, runMigrations()
├── frontend/src/
│   ├── app/(authenticated)/  # All protected pages (Next.js App Router route group)
│   ├── components/           # Shared UI (ProjectsTable, ProjectDetail, etc.)
│   ├── hooks/useProjects.ts  # ALL React Query hooks — single file, no exceptions
│   ├── services/api.ts       # Axios instance + one `xApi` object per domain
│   └── context/AuthContext.tsx
├── database/                # schema.sql = stale historical baseline; migrations/ = one-off ad-hoc SQL, NOT the live source of truth
├── nginx/nginx.conf, docker-compose.yml   # Production deploy topology
└── .claude/                  # This knowledge base — see Memory Files below
```
Backend has two stray dead-code folders left over from earlier refactors: `backend/backup_services/` and `backend/src/controllers/backup/`. Do not edit or trust these — see `.claude/memory/repository-map.md`.

## Memory Files
- [`.claude/memory/project-context.md`](.claude/memory/project-context.md) — identity, users, integrations, constraints
- [`.claude/memory/architecture.md`](.claude/memory/architecture.md) — schema layering, request flow, delay calc, Graph/OpenAI integrations
- [`.claude/memory/decisions.md`](.claude/memory/decisions.md) — why things are the way they are
- [`.claude/memory/domain-knowledge.md`](.claude/memory/domain-knowledge.md) — PMO domain concepts (phases, plan types, delay states, hygiene scores)
- [`.claude/memory/repository-map.md`](.claude/memory/repository-map.md) — full folder-by-folder map, incl. dead code to avoid
- [`.claude/memory/progress.md`](.claude/memory/progress.md) — what's done, in progress, known issues

## Environment Variables (backend/.env — never commit)
```
DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
PORT=3001  FRONTEND_URL=http://localhost:3000  ENABLE_CRON_JOBS=true
JIRA_API_URL / JIRA_OAUTH_CLIENT_ID / JIRA_OAUTH_CLIENT_SECRET / JIRA_OAUTH_REDIRECT_URI
MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET   # Email + Call Hygiene, transcripts
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID   # separate app: SSO + Mail.Send alerts
OPENAI_API_KEY / OPENAI_MODEL   # call-transcript grading (defaults to gpt-4o-mini)
ALERT_FROM_EMAIL / EXTERNAL_API_KEY / HUBSPOT_ACCESS_TOKEN
```

## Common Commands
```bash
cd backend  && npm run dev        # port 3001 (tsx watch)
cd frontend && npm run dev        # port 3000 (predev.js resets .next for OneDrive)
cd backend  && npx tsc --noEmit   # backend type-check (no test suite exists yet)
cd frontend && npx tsc --noEmit && npm run build   # frontend type-check + build
docker compose up -d --build      # full prod stack (postgres + backend + frontend + nginx)
```

---

## Available gstack Commands
gstack is installed globally at `~/.claude/skills/gstack`. Use `/browse` from gstack for all web browsing; never use `mcp__claude-in-chrome__*` tools.

- **Planning**: `/office-hours`, `/autoplan`, `/spec`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`
- **Review & investigate**: `/review`, `/investigate`, `/codex`
- **Testing**: `/qa <url>`, `/qa-only <url>`, `/browse`, `/open-gstack-browser`
- **Security & docs**: `/cso`, `/document-release`, `/document-generate`
- **Ship & deploy**: `/ship`, `/land-and-deploy`, `/canary`
- **Safety**: `/careful`, `/freeze`, `/guard`, `/unfreeze`
- **Learn & upgrade**: `/learn`, `/gstack-upgrade`

This repo's own `/team-review` (renamed from the original `/review` to avoid colliding with gstack's) is a project-specific checklist — see `.claude/commands/team-review.md`. gstack's `/review` is the general pass; run both before shipping.

## Recommended Workflow
- **New feature**: `/office-hours` → `/autoplan` → implement → `/review` → `/qa` → `/cso` → `/ship`
- **Routine change**: implement → `/review` → `/qa` → `/ship`
- **Bug fix**: `/investigate` → fix → `/review` → `/qa` → `/ship`

**Before every PR (never skip):**
1. `/review` — bugs CI won't catch (there is no CI here — this is the gate)
2. `/qa <staging-url>` — real browser test
3. `/cso` — security audit (if security-sensitive — e.g. anything touching auth, transcripts, or `requireRole`)
4. `/ship` — opens PR

## Pre-flight — gstack availability check
Before offering the Skill routing menu OR running any gstack slash command, Claude MUST first verify gstack is installed:

```bash
test -f ~/.claude/skills/gstack/setup && echo "gstack_installed" || echo "gstack_missing"
```

- `gstack_installed` → show Menu A below
- `gstack_missing` → show Menu B below

If the user asks Claude to install it, Claude tells them the install command from Prerequisites above and asks them to run it in their own terminal — Claude does not run `git clone`/`./setup` on their behalf. After they confirm it's done, Claude re-runs the detection check above before proceeding.

## Skill routing
Before any repository task, Claude must run the Pre-flight check and show the correct menu.

**Menu A — gstack IS installed**
> Before I start, choose one: (1) Use gstack workflow (2) Use normal project files / plain Claude approach (3) Let Claude recommend the best option first

**Menu B — gstack is NOT installed**
> gstack is not installed on your machine. Before I start, choose one: (1) See the install command, then use gstack workflow once it's done (2) Use normal project files / plain Claude approach — no gstack workflows available (3) Let Claude recommend

The install option should appear each time gstack is still missing — but if the user has already said no or asked not to be asked again this session, respect that instead of re-prompting every single turn.

**Slash command exception**: if the user types a gstack slash command (`/review`, `/qa`, `/cso`, `/ship`, `/office-hours`, etc.) directly, run the Pre-flight check first. If installed, run the command directly. If not, show Menu B.

Claude must wait for the user's selection before reading files, editing files, or invoking any skill.

- **Option 1 (Menu A)**: Product brainstorm → `/office-hours` · Rough idea to spec → `/spec` · Scope tradeoffs → `/plan-ceo-review` · New-feature architecture → `/plan-eng-review` · Bugs → `/investigate` · Test a URL → `/qa`/`/qa-only` · Diff review → `/review` · Security-sensitive change → `/cso` · Open a PR → `/ship` · Deploy/verify prod → `/land-and-deploy` · Docs → `/document-release`/`/document-generate`
- **Option 1 (Menu B)**: Show the install command; do not run it. Tell the user to reopen the project after running it themselves.
- **Option 2**: Reading files, explaining code, small edits, typo fixes, one-file updates, basic refactoring, config changes, project Q&A.
- **Option 3**: Recommend gstack workflow vs. normal approach based on task size, same as Option 1/2 criteria above.
