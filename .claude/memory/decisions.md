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

---

## dotenv Path Correction (this doc was wrong)
The actual code (`backend/src/index.ts`) uses `path.resolve(__dirname, '../.env')` — **one** level up, not two. `CLAUDE.md`'s hard rule already had this right; this file and `.claude/rules/api-conventions.md` previously said `'../../.env'`, which was wrong. Corrected during the 2026-08 scaffold pass.

**Why:** `tsx watch src/index.ts` sets `__dirname` to `backend/src`; one level up is `backend/` where `.env` lives.

**How to apply:** Trust `path.resolve(__dirname, '../.env')` — don't "fix" it to add a second `../`.

---

## Backend Uses Raw `pg`, Not Prisma (docs were wrong)
`README.md` and this project's earlier `.claude/workflows/feature-build.md`/`bug-fix.md` described a Prisma-based backend (`backend/prisma/schema.prisma`, `db:generate`/`db:migrate`). There is no `prisma/` folder. Confirmed by direct repo audit during the 2026-08 Claude Code scaffold pass.

**Why:** The backend actually hand-writes parameterized SQL via `query()`/`execute()` in `backend/src/config/database.ts`. Schema changes go through `runMigrations()` in `backend/src/index.ts` instead of a Prisma migration.

**How to apply:** Never suggest Prisma commands for this repo. See `.claude/memory/architecture.md` for the real schema-layering story.

---

## `/review` Renamed to `/team-review`
This project adopted gstack (Garry Tan's Claude Code toolkit, installed globally at `~/.claude/skills/gstack`) in 2026-08. gstack reserves `/review` for its own general-purpose diff review, which collided with this repo's pre-existing `.claude/commands/review.md`.

**Why:** Avoid the two commands silently overwriting each other's routing. gstack's install is global (not vendored in this repo), so this repo's command had to be the one to rename.

**How to apply:** The project-specific checklist is now `/team-review` (`.claude/commands/team-review.md`). Run gstack's `/review` for general correctness, `/team-review` for PMO-Tracker-specific convention checks — both, not either/or, before shipping.

---

## Account Manager vs. All Projects Showed Different "Project End" Dates (fixed 2026-08)
`accountManagerController.ts` had its own copy of the expected-end-date calculation that (a) never selected `is_overaged`/`extended_end_date` from the DB at all, so it always fell back to raw `planned_end`, and (b) the frontend always displayed the computed `expectedEnd` instead of matching All Projects' actual display rule (`actualEnd` unless overaged).

**Why:** Two independently-maintained copies of the same date logic (`projectService.ts` vs `accountManagerController.ts`) drifted apart. This is a recurring risk class in this codebase — same root cause as the Call/Email Hygiene silent-error bug below (logic duplicated instead of shared).

**How to apply:** When editing date/delay logic in one of these two files, check whether the other needs the identical fix. Longer-term, consider extracting one shared function instead of two copies.

---

## Call/Email Hygiene Silently Showed All Zeros Instead of a Permission Error (fixed 2026-08)
`callHygieneService.ts`/`emailHygieneService.ts` wrapped Microsoft Graph calls in `.catch(() => [])` with no logging. A missing `Calendars.Read` Graph permission (403) became indistinguishable from "this person genuinely had 0 calls" — the existing `permissionDenied`/`authError` surfacing code could never actually fire because the error was caught one level too early.

**Why:** Silently swallowing an error and returning an empty/zero fallback hides the real cause. This exact pattern is now called out in `.claude/rules/security-rules.md` as a rule, not just a one-off fix.

**How to apply:** Any new external-API call must let real errors propagate (so they surface via logging/error-banner code) rather than `.catch(() => emptyValue)`.

---

## Date Formatting Timezone Bug (fixed 2026-08, partially — see below)
`new Date(dateOnlyString).toLocaleDateString()` interprets a `"YYYY-MM-DD"` string as UTC midnight, then formats in the *browser's* local timezone — for PST/EST (behind UTC), this displays the previous calendar day. Fixed in the shared `formatDate()` (`frontend/src/lib/utils.ts`) by extracting Y/M/D directly from the string instead of round-tripping through a timezone-sensitive `Date`.

**Why:** Root cause of a real user-reported bug ("select today, see yesterday" for PST/EST users).

**How to apply:** **Not yet fixed everywhere** — roughly 10 other files have their own duplicated `fmtDate`/`formatDate` copy with the same bug (Account Manager, POC Projects, Manager Dashboard, Reviews, Case Studies, etc.). Fix the same way (extract Y/M/D from the string) if one of them comes up, and prefer importing the shared `formatDate()` over adding another local copy.

---

## Known Secret Exposure: root `mcp.json`
The root-level `mcp.json` (not `.mcp.json` — note no leading dot, so Claude Code likely never auto-loaded it as project MCP config anyway) is tracked in git (commit `759b3c9`, "Claude flow added") and hardcodes a live-looking Postgres password.

**Why noted here:** Flagged during the 2026-08 scaffold pass rather than silently fixed, since rotating a DB password is the user's call, not something to do unprompted.

**How to apply:** The new `.mcp.json` uses `${DATABASE_MCP_URL}` env var interpolation instead. Recommend to the user: rotate the DB password, and either delete the old `mcp.json` or strip the hardcoded credential from it.

[[project-context]]
[[architecture]]
