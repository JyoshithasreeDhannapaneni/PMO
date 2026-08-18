---
name: api-design
description: How THIS project structures API endpoints, responses, and errors — not general REST API design advice
---

# Skill: PMO Tracker API Design

## Trigger Patterns
- "add an endpoint", "new API route", "what shape should this response be", "how do I add a query filter"

## The Contract (see `.claude/rules/api-conventions.md` for full detail)
- URL: `/api/<resource>` (plural noun), sub-resources nested (`/api/projects/:id/phases`, not `/api/phases/project/:id`).
- Success: `{ "success": true, "data": <payload>, "message"?: "optional" }`
- List with pagination: `{ "success": true, "data": [...], "total": 123, "page": 1, "limit": 20 }`
- Error: `{ "success": false, "error": "message" }` for hand-thrown `AppError`s — but note the actual `errorHandler` middleware (`backend/src/middleware/errorHandler.ts`) nests it as `{ success: false, error: { message: "..." } }`. Match what the middleware actually does, not just the doc — check `errorHandler.ts` if unsure.
- Auth: `Authorization: Bearer <jwt>` → `requireAuth` middleware decodes to `req.user = { id, email, role }`. Add `requireRole('ADMIN')` for anything reading per-person sensitive content.
- Standard list query params: `?page=1&limit=20&sort=createdAt&order=desc&search=<term>`, plus domain filters like `?status=ACTIVE&projectManager=Abhishek`.

## Patterns Specific to This Codebase
- **No ORM query builder** — every service hand-writes parameterized SQL (`query()`/`execute()` from `config/database.ts`). A new filter means extending that service's own `WHERE` clause builder, not calling a `.where()` chain.
- **New sensitive-data endpoints** (transcripts, per-person hygiene metrics) get their own dedicated controller + service + `requireRole('ADMIN')` route — see `callTranscriptController.ts`/`callTranscriptRoutes.ts` as the reference shape for "new integration-backed feature."
- **Excel export endpoints** follow the `sendWorkbook()` helper pattern seen in `callHygieneController.ts` — reuse it rather than hand-rolling `XLSX.write` again.
- **Zod validation** at the controller boundary for anything with a non-trivial body shape (see `callTranscriptController.ts`'s `rateSchema` for the pattern); simple routes validate manually.

## What to Do With This
When adding a route, name the actual existing file whose shape to copy (e.g. "follow the `callTranscriptRoutes.ts`/`callTranscriptController.ts` pattern") rather than describing REST conventions in the abstract.
