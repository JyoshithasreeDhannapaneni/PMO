# PMO Tracker — Claude Code Project Guide

## Project Overview
Cloud migration project tracking system for CloudFuze. Tracks ENT/SMB customer migrations, SLA compliance, escalations, case studies, and manager/engineer performance.

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Database**: PostgreSQL (`pmo_tracker`) on port 5432

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, TanStack Query, Recharts, lucide-react, React Hook Form + Zod
- **Backend**: Node.js + Express, TypeScript, Prisma ORM, PostgreSQL, node-cron, Nodemailer, Winston, multer, xlsx (SheetJS)
- **Auth**: JWT (stored in localStorage), role-based (admin / manager / viewer)
- **Jira Integration**: OAuth 2.0 (3LO) — scopes: `read:jira-work read:jira-user offline_access`

## Repository Structure
```
PMO/
├── backend/src/
│   ├── controllers/     # Route handlers (thin — delegate to services)
│   ├── routes/          # Express routers (one file per domain)
│   ├── services/        # All business logic lives here
│   ├── middleware/       # Auth, error handling
│   └── utils/           # Logger, helpers
├── frontend/src/
│   ├── app/(authenticated)/   # All protected pages (Next.js App Router)
│   ├── components/            # Shared UI components
│   ├── hooks/useProjects.ts   # All React Query hooks (single file)
│   ├── services/api.ts        # Axios instance with auth interceptor
│   └── context/AuthContext.tsx
├── .claude/             # Claude Code configuration
│   ├── rules/           # Coding conventions (loaded on demand)
│   ├── commands/        # Custom slash commands
│   ├── skills/          # Auto-triggered skills
│   ├── agents/          # Specialized subagents
│   ├── hooks/           # Event-driven shell scripts
│   ├── memory/          # Persistent project memory
│   └── workflows/       # Multi-step task blueprints
└── backend/.env         # Never commit — contains DB + OAuth secrets
```

## Hard Rules
1. **Never commit `.env`** — it contains DB password and OAuth secrets.
2. **`CLAUDE.local.md` is gitignored** — machine-specific overrides only.
3. **No `any` types** unless casting external API responses at the boundary.
4. **All new API routes need auth middleware** — `requireAuth` + `requireRole('admin')` where appropriate.
5. **Frontend hooks live in `hooks/useProjects.ts`** — do not create separate hook files.
6. **lucide-react icons on OneDrive timeout** — only use icons already in the import list; never add new lucide icons without confirming the file is locally cached.
7. **`dotenv.config()`** in `backend/src/index.ts` must use `path.resolve(__dirname, '../.env')` — `tsx` runtime sets `__dirname` to `backend/src`, so one level up reaches `backend/.env`.
8. **OAuth scope** — never add `manage:servicedesk-customer` (triggers org-level approval block).

## Running Locally
```bash
# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 3000)
cd frontend && npm run dev
```

## Key Environment Variables (backend/.env)
```
DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
PORT=3001
FRONTEND_URL=http://localhost:3000
JIRA_API_URL=https://cf2020.atlassian.net
JIRA_OAUTH_CLIENT_ID / JIRA_OAUTH_CLIENT_SECRET
JIRA_OAUTH_REDIRECT_URI=http://localhost:3001/api/jira/oauth/callback
```

## Coding Conventions
See `.claude/rules/` for detailed conventions. Quick reference:
- Controllers call services — no DB logic in controllers
- Services return plain objects — no Express `req`/`res` in services
- All dates stored as ISO strings; use `date-fns` for manipulation
- Tailwind only — no inline `style` except dynamic values (widths, progress bars)
- `bg-*-50` cards with matching `text-*-700` for KPI cards
- Collapsible sections: `useState(false)` + `ChevronRight` with `rotate-90` on open
