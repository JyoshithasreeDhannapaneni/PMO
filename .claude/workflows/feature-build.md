# Workflow: Feature Build

Use this blueprint when building a new end-to-end feature for PMO Tracker.

**If gstack is installed** (see `CLAUDE.md` Pre-flight), wrap this blueprint with: `/office-hours` (clarify the problem) → `/autoplan` (CEO + eng + design review) → **Steps 1-3 below** → `/review` (gstack general review) → `/team-review` (this project's convention checklist) → `/qa <staging-url>` → `/cso` (if security-sensitive, e.g. touches auth or reads per-person data) → `/ship`.

## Steps

### 1. Understand
- Read relevant existing code in `backend/src/services/` and `frontend/src/app/(authenticated)/`
- Check `.claude/memory/decisions.md` for constraints that apply, and `.claude/memory/architecture.md` for how this project actually lays out schema/services
- Identify: which DB tables are affected, which API routes are needed, which page hosts the UI
- For anything touching more than 2-3 files, consider the `architect` agent (`.claude/agents/architect.md`) first

### 2. Backend
1. **No Prisma** — this backend uses raw `pg`. If DB changes are needed, add a guarded block to `runMigrations()` in `backend/src/index.ts` (idempotent `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS`, using the existing `columnExists()` helper pattern) — see `.claude/memory/architecture.md`.
2. Create service function in `backend/src/services/<domain>Service.ts`
3. Create/update controller in `backend/src/controllers/<domain>Controller.ts`
4. Add route in `backend/src/routes/<domain>Routes.ts` with `requireAuth`
5. Register route in `backend/src/index.ts`
6. Run `npx tsc --noEmit` in `backend/` — must pass

### 3. Frontend
1. Add React Query hook(s) to `frontend/src/hooks/useProjects.ts`
2. Build page at `frontend/src/app/(authenticated)/<feature>/page.tsx`
3. Use existing KPI card pattern: `bg-*-50 rounded-xl p-4 flex items-center gap-3`
4. Use existing collapsible pattern: `useState(false)` + `ChevronRight` with `rotate-90`
5. Only use lucide icons already present in the file's import list
6. Run `npx tsc --noEmit` in `frontend/` — must pass

### 4. Verify
- Start both servers, navigate to the feature, test happy path + empty state
- Check browser console for errors
- Verify API response matches `{ success: true, data: ... }` shape

### 5. Cleanup
- Remove any `console.log` debug statements
- Remove any temporary `any` type casts at non-boundaries
