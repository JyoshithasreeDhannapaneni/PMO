# API Conventions — PMO Tracker

## URL Structure
- Base: `/api/<resource>` (plural noun)
- Examples: `/api/projects`, `/api/dashboard/overview`, `/api/jira/sla`
- Sub-resources: `/api/projects/:id/phases` (not `/api/phases/project/:id`)

## Response Shape
All endpoints return JSON:
```json
// Success
{ "success": true, "data": <payload>, "message": "optional" }

// List with pagination
{ "success": true, "data": [...], "total": 123, "page": 1, "limit": 20 }

// Error
{ "success": false, "error": "Human-readable message" }
```

## Authentication
- JWT in `Authorization: Bearer <token>` header.
- All non-public routes use `requireAuth` middleware.
- Admin-only routes add `requireRole('admin')`.
- Token decoded to `req.user = { id, email, role }`.

## Query Parameters (GET lists)
Standard params: `?page=1&limit=20&sort=createdAt&order=desc&search=<term>`
Domain-specific filters: `?status=ACTIVE&projectManager=Abhishek`

## Jira Integration
- OAuth 2.0 (3LO) only — API token blocked at org level.
- Scopes: `read:jira-work read:jira-user offline_access` (never add `manage:servicedesk-customer`).
- Token stored in `backend/.jira-oauth-tokens.json` (gitignored).
- `isOAuthConfigured()` must reject placeholder values starting with `PASTE_`.
- `dotenv.config()` must use `path.resolve(__dirname, '../.env')` — one level up from `backend/src` (see `.claude/memory/decisions.md` for the correction history on this line).

## Excel Upload (Jira SLA)
- `POST /api/jira/upload-excel` accepts `multipart/form-data` with field `file`.
- Backend uses `multer` (memory storage) + `xlsx` (SheetJS) to parse.
- Expected columns (exact Jira export names): `Key`, `Summary`, `Assignee`, `Project Manager`, `Customer Name`, `Status`, `Created`, `Updated`, `First Response SLA Breach`, `Resolution SLA Breach`.
- Column detection: exact match first, then header-contains-candidate partial match.

## Error Codes
- `400` Bad Request — invalid input / missing required fields
- `401` Unauthorized — missing or invalid JWT
- `403` Forbidden — insufficient role
- `404` Not Found — resource does not exist
- `500` Internal Server Error — unexpected failure (always log with `logger.error`)
