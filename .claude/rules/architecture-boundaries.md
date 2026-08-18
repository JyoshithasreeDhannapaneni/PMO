# Architecture Boundaries — PMO Tracker

## The Layering Contract
```
routes/<domain>Routes.ts   → Express router. requireAuth (+ requireRole where sensitive). No logic.
controllers/<domain>Controller.ts → Validate input (zod or manual), call ONE service function, shape { success, data } response. No SQL. No business logic.
services/<domain>Service.ts → ALL business logic and ALL raw SQL (query/execute from config/database.ts). No req/res. No Express types.
```
This is enforced by convention, not a linter — reviewers (human, `code-reviewer` agent, gstack `/review`) are the gate. A controller with a `query(...)` call in it, or a service that imports `Request`/`Response`, is a boundary violation.

## Schema Changes Cross a Boundary Too
There is no single migration tool. A schema change touches, in this order:
1. `backend/src/index.ts` → `runMigrations()` — add a new guarded block using the existing `columnExists()` helper (for columns) or a bare `CREATE TABLE IF NOT EXISTS` (for new tables). This runs on every boot, so it must be idempotent.
2. The relevant service's `mapXRow()` function — add the new field to the returned object.
3. NOT `database/schema.sql` — that file is a stale historical snapshot (still has Postgres `ENUM` types that `runMigrations()` converts to `VARCHAR`). Don't edit it to "keep it in sync"; it's not the source of truth and isn't read by the app.

## Frontend Boundaries
- **Data fetching**: only `frontend/src/hooks/useProjects.ts` — a new page must add its hook there, never create `useNewFeature.ts`.
- **API calls**: only `frontend/src/services/api.ts` — one `<domain>Api = { ... }` object per domain, called from hooks, never called directly from a page component.
- **Pages**: only under `frontend/src/app/(authenticated)/` for anything requiring login (which is everything except the login page itself).

## Dead Code — Do Not Treat as a Pattern to Follow
`backend/backup_services/*.ts` and `backend/src/controllers/backup/*.ts` are leftover copies from an earlier refactor, not active code, not imported anywhere, and not a "backup" in the sense of "restore from here if needed" — they're stale duplicates. Never copy a pattern from these folders, and never assume a file existing in `backup/` reflects current behavior of the same-named file outside it.

## When a Change Doesn't Fit This Shape
Cross-cutting features (e.g. the call-transcript grading feature: Graph API + OpenAI + a new cache table + an ADMIN-gated route) still follow controller→service→route, just with more than one service file (`callTranscriptService.ts` for Graph, `transcriptGradingService.ts` for OpenAI). Split by **external dependency**, not by arbitrary size — each service should talk to exactly one external system or own exactly one table's business logic.

If a task seems to require breaking this layering (e.g. "just query the DB from the controller for this one case"), flag it instead of doing it silently — that's what the `architect` agent is for.
