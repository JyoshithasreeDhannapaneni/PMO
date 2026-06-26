---
name: decisions
description: Key architectural and implementation decisions made for PMO Tracker
metadata:
  type: project
---

## Jira Integration: OAuth 2.0 only
API token returns 401 on all authenticated endpoints (org-level block). OAuth 2.0 (3LO) is the only viable path.

**Why:** cf2020.atlassian.net org has App Access Control enabled — only OAuth apps with admin approval work.

**How to apply:** Never suggest Basic Auth or API token approaches. Always use OAuth. Scopes: `read:jira-work read:jira-user offline_access` only.

---

## Excel Upload as Jira Fallback
When OAuth is not connected, users upload a Jira CSV/Excel export. Backend parses with SheetJS, persists to `.jira-excel-data.json`.

**Why:** Allows SLA tracking without completing OAuth setup.

**How to apply:** Both code paths (OAuth + Excel) must stay in sync. The response shape from both is identical (`ExcelSlaResult` / `JiraSlaResult`).

---

## Column Detection: Exact Jira Names Only
`findColIdx()` uses exact match first, then header-contains-candidate (NOT candidate-contains-header).

**Why:** `lc.includes(h)` caused "project".includes("project manager") = false but "project manager".includes("project") = true, matching the wrong column.

**How to apply:** Never reverse the `.includes()` direction in `findColIdx`.

---

## Customer Name Normalization
`normalizeCustomer()` lowercases and strips spaces/underscores/hyphens so "PDF Solution", "PDFSolution", "pdf_solution" all map to the same key.

**Why:** Jira tickets for the same customer had inconsistent naming, causing them to appear as separate customers in SLA reports.

**How to apply:** Always normalize before grouping by customer. Display the first-seen raw name.

---

## dotenv Path Must Be Explicit
`dotenv.config({ path: path.resolve(__dirname, '../../.env') })` in `backend/src/index.ts`.

**Why:** Without an explicit path, dotenv looks in the CWD which varies depending on where `npm run dev` is run from.

**How to apply:** Never use bare `dotenv.config()` in the backend.

---

## All Hooks in One File
All React Query hooks live in `frontend/src/hooks/useProjects.ts`.

**Why:** Confirmed user preference — avoids hook file sprawl and makes the data layer easy to navigate.

**How to apply:** Never create a separate hook file. Add new hooks to `useProjects.ts`.

[[project-context]]
