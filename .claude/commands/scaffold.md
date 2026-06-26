# /scaffold — Scaffold a New Feature

Scaffolds the boilerplate for a new domain feature following project conventions.

## What it does
Given a domain name (e.g. `riskReport`), generates:
1. `backend/src/routes/<domain>Routes.ts` — Express router with CRUD stubs + `requireAuth`
2. `backend/src/controllers/<domain>Controller.ts` — thin controller delegating to service
3. `backend/src/services/<domain>Service.ts` — service with business logic stubs
4. Adds the route import + `app.use('/api/<domain>', ...)` line to `backend/src/index.ts`
5. Adds a `use<Domain>` React Query hook stub to `frontend/src/hooks/useProjects.ts`
6. Creates the page at `frontend/src/app/(authenticated)/<domain>/page.tsx` with auth guard

## Usage
`/scaffold <domainName>`

Example: `/scaffold riskReport`

## Arguments
`$ARGUMENTS` — the domain name in camelCase (e.g. `riskReport`, `serverAlert`).

## Notes
- All generated routes include `requireAuth` — add `requireRole('admin')` manually where needed.
- The service stub returns `{ success: true, data: [] }` by default.
- The page scaffold includes the standard header pattern and a loading skeleton.
