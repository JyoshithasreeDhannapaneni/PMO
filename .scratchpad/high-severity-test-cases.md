# PMO Tracker — High-Severity Manual QA Test Cases

Covers the 13 high-severity confirmed findings from the full-application review. No test infrastructure exists in this repo (per `testing-standard.md`), so these are written for a human tester to execute manually against a running dev instance.

---

### TC-01: VIEWER can mutate projects from Overaged/Escalated panels on the Dashboard
**Page:** `frontend/src/app/(authenticated)/page.tsx`
**Preconditions:** Log in as a `VIEWER`-role user. At least one overaged and one escalated project exists.
**Steps:**
1. From the main Dashboard, open the "Overaged" quick-stat panel.
2. Attempt to click "Escalate" on any listed project.
3. Open the "Escalated" panel instead. Attempt to change a project's priority dropdown, then click "Remove"/de-escalate.
**Expected result:** All mutating controls (Escalate, priority change, Remove) should be disabled or hidden for VIEWER, consistent with VIEWER being read-only everywhere else in the app.
**Actual result (current bug):** Only the "New Project" button is hidden for VIEWER (`isViewer` check, [page.tsx:229](frontend/src/app/(authenticated)/page.tsx#L229)). The Escalate/priority/Remove controls in both panels have no role check at all and are fully clickable.

---

### TC-02: Task status/delete/edit failures fail silently with no error shown
**Page:** `frontend/src/app/(authenticated)/projects/[id]/tasks/page.tsx`
**Preconditions:** A project with at least one task exists. Ability to simulate an expired/invalid session token (e.g. clear/corrupt the token in localStorage, or throttle network to force a failed request).
**Steps:**
1. Open a project's Task Manager.
2. Invalidate the session token (e.g. via devtools: edit `localStorage.token` to garbage).
3. Change a task's status via the dropdown.
4. Observe the UI response.
**Expected result:** A visible error toast/message explaining the update failed (e.g. "Session expired — please log in again"), and the status should not silently revert without explanation.
**Actual result (current bug):** `updateTaskStatus`/`deleteTask` catch blocks are empty (`/* silent */`, [tasks/page.tsx:249](frontend/src/app/(authenticated)/projects/[id]/tasks/page.tsx#L249)) — a failed PATCH shows nothing, `fetchData()` reruns and re-renders the old status with zero indication anything went wrong.

---

### TC-03: Portfolio detail's "Completed Tasks" count is fabricated, not real
**Page:** `frontend/src/app/(authenticated)/portfolio/[id]/page.tsx`
**Preconditions:** A project with a known, real task count (e.g. 20 tasks total, 7 completed) in its Task Manager.
**Steps:**
1. Open the project's Task Manager and note the actual completed/total task count.
2. Navigate to the same project's Portfolio detail view → Overview tab → Progress Summary.
3. Compare the "Completed Tasks" figure shown there against the real count from step 1.
**Expected result:** The Progress Summary's task counts should match the project's actual task data, or the section should be removed/relabeled if no real per-task data backs it.
**Actual result (current bug):** The counts are computed from a hardcoded `totalTasks = 12` and the phase-progress percentage ([portfolio/[id]/page.tsx:219](frontend/src/app/(authenticated)/portfolio/[id]/page.tsx#L219)) — entirely disconnected from the real task list, but displayed identically to genuine data.

---

### TC-04: Leader Metrics data is device-local with no warning it won't sync
**Page:** `frontend/src/app/(authenticated)/manager-dashboard/metrics/page.tsx`
**Preconditions:** Two different browsers/machines, both logged in as ADMIN.
**Steps:**
1. On Machine A, log entries for a leader (e.g. Ajay) across a few days via "Add entry".
2. On Machine B, log in and open the same Metrics page for the same leader.
3. Compare what each machine shows.
**Expected result:** Either the data syncs across machines (if backed by a server), or the UI clearly states the data is local to this browser only, before or as the admin starts entering data.
**Actual result (current bug):** Data is stored purely in `localStorage` per leader ([metrics/page.tsx:43](frontend/src/app/(authenticated)/manager-dashboard/metrics/page.tsx#L43)) with no server sync and no on-page warning — Machine B shows a completely empty scorecard with no explanation, risking duplicate re-entry or the impression that data was lost.

---

### TC-05: Account Manager page has zero role gating — any role sees full revenue/CSAT data
**Page:** `frontend/src/app/(authenticated)/account-manager/page.tsx`
**Preconditions:** A `VIEWER`-role login. HubSpot deal data and CSAT scores present for at least one account.
**Steps:**
1. Log in as VIEWER.
2. Navigate directly to `/account-manager` by URL (it may or may not appear in the sidebar).
3. Observe what data renders.
**Expected result:** VIEWER (and any role without a clear business need) should either be blocked from this page or see a restricted subset — not full HubSpot deal values, CSAT scores, and escalation data for every account.
**Actual result (current bug):** The page performs no role check whatsoever, and the backend's `GET /view` route (`accountManagerRoutes.ts`) has no `requireAuth`/`requireRole` middleware — any authenticated (or per the finding, possibly even unauthenticated) request gets full data.

---

### TC-06: Non-admin roles can send live customer-facing SOW usage emails
**Page:** `frontend/src/app/(authenticated)/server-alerts/page.tsx`
**Preconditions:** Log in as `PRE_SALES` or `ACCOUNT_MANAGER`. At least one project with `hasEmail = true`.
**Steps:**
1. Navigate to `/server-alerts`.
2. Locate a project row with an available "Send" action.
3. Click "Send".
**Expected result:** Only ADMIN (or explicitly permitted roles) should be able to trigger a live customer-facing email send. Other roles should see the button disabled/hidden.
**Actual result (current bug):** The Send button is enabled whenever `p.hasEmail && !isViewer` ([server-alerts/page.tsx:297](frontend/src/app/(authenticated)/server-alerts/page.tsx#L297)) — any non-VIEWER role, including PRE_SALES and ACCOUNT_MANAGER, can fire a real customer email.

---

### TC-07: "Generate Content" silently overwrites manually-typed case study sections with no confirmation
**Page:** `frontend/src/app/(authenticated)/case-studies/new/page.tsx`
**Preconditions:** A completed project eligible for a case study.
**Steps:**
1. Start a new case study; manually type distinct text into two or more sections (e.g. "Challenge", "Solution").
2. Click "Generate Content".
3. Observe what happens to the manually-typed sections.
**Expected result:** The app should warn before overwriting manually-entered content ("This will replace your existing text — continue?"), or merge/preserve non-empty sections.
**Actual result (current bug):** `handleGenerateContent` unconditionally calls `setSectionContent(newContent)`, replacing the entire content object with no check for existing text and no confirmation dialog — all manual edits are silently lost.

---

### TC-08: Failed AI generation silently falls back to generic placeholder text reported as success
**Page:** `frontend/src/app/(authenticated)/case-studies/new/page.tsx`
**Preconditions:** Ability to force the `/api/case-studies/generate/:id` call to fail or return empty (e.g. disconnect the AI service, or use a project with no transcript data).
**Steps:**
1. Start a new case study for a project with no usable source data.
2. Click "Generate Content".
3. Read the resulting message and generated sections closely.
**Expected result:** If generation genuinely fails or falls back to a template, the UI must say so explicitly (e.g. "Could not generate from project data — inserted a starter template instead"), not report the same success message used for real AI output.
**Actual result (current bug):** On failure/empty response, the code inserts hardcoded placeholder paragraphs and still shows "Template content generated. Please customize for your project." — indistinguishable from a real success case, risking a boilerplate case study being published as if it were project-specific.

---

### TC-09: Audit Report — full user identity + IP log exposed to every role including VIEWER
**Page:** `frontend/src/app/(authenticated)/reports/audit/page.tsx`
**Preconditions:** Log in as `VIEWER`.
**Steps:**
1. Navigate directly to `/reports/audit` by URL.
2. Observe the rendered content.
**Expected result:** This page contains per-user identity and IP-address audit data; access should be restricted to ADMIN (matching the pattern used elsewhere in the app for sensitive data, e.g. call-transcript grading, which requires `requireRole('ADMIN')`).
**Actual result (current bug):** No role/auth check exists anywhere in the page file, and the Sidebar's Reports group marks this entry `adminOnly: false` — the link is visible and the page renders fully for any authenticated role.

---

### TC-10: Notification filters silently only apply to the current page of 15, not the full dataset
**Page:** `frontend/src/app/(authenticated)/notifications/page.tsx`
**Preconditions:** More than 15 notifications exist in total, spanning multiple types (e.g. some "Delay Detected", most other types), across more than one page.
**Steps:**
1. Open Notifications. Note the total shown in "Showing 1–15 of N".
2. Apply the Type filter to "Delay Detected".
3. Observe the result count and the pagination bar.
4. Click "Next page" and observe whether more matching notifications appear.
**Expected result:** Filtering should search across the entire dataset, and the "Showing X–Y of N" text and page count should reflect the filtered total, not the unfiltered one.
**Actual result (current bug):** `fetchNotifications` fetches only 15 server-side items per page and the filter is applied client-side to just that page's array, while the pagination bar still shows the unfiltered `totalCount`/`totalPages` — matching notifications on other pages are never surfaced, and the displayed counts are internally inconsistent.

---

### TC-11: Plan Types settings — SLA hours field mislabeled as a dollar amount
**Page:** `frontend/src/app/(authenticated)/settings/page.tsx`
**Preconditions:** Log in as ADMIN. Navigate to Settings → Plan Types.
**Steps:**
1. Locate a Plan Type row's numeric input next to text reading "Amount ($)".
2. Enter a value (e.g. `24`) and save.
3. Inspect what field this value is actually saved to (`slaHours` vs. an actual price field), e.g. via the network request payload or by checking where the value surfaces elsewhere (SLA-related displays vs. pricing displays).
**Expected result:** The label next to a numeric input must match the field it edits — an SLA-hours input should say "SLA Hours" or similar, not "Amount ($)".
**Actual result (current bug):** The input bound to `slaHours` is displayed with the adjacent static label "Amount ($)" ([settings/page.tsx:636](frontend/src/app/(authenticated)/settings/page.tsx#L636)), so an admin setting an SLA threshold is told they're entering a dollar price.

---

### TC-12: SMTP Settings — page has no server-side gate and the config fetch may fire before the client-side check blocks rendering
**Page:** `frontend/src/app/(authenticated)/smtp-settings/page.tsx`
**Preconditions:** Log in as a non-ADMIN role (e.g. `PROJECT_MANAGER`).
**Steps:**
1. Navigate directly to `/smtp-settings` by URL (note: it has no sidebar entry, so this must be typed/bookmarked).
2. Open browser devtools → Network tab before navigating, then navigate and watch for a request to `/api/smtp` (or similar).
3. Observe whether that request fires and what it returns, regardless of what the page then renders.
**Expected result:** A non-ADMIN role should be blocked from even triggering the SMTP config fetch — ideally via a server-side `requireRole('ADMIN')` on the route itself, not just a client-side "Access Restricted" message after the fact.
**Actual result (current bug):** Admin gating is purely client-side (renders "Access Restricted" for non-admins), and the SMTP config `useEffect` fetch has no role guard, so the request — and potentially the SMTP host/email in the response — can reach the browser's network tab before the restriction message appears.

---

### TC-13: Project Manage page — only VIEWER is blocked; any other role can fully manage any project's team/risk/documents
**Page:** `frontend/src/app/(authenticated)/projects/[id]/manage/page.tsx`
**Preconditions:** Log in as `PRE_SALES` or `ACCOUNT_MANAGER` (roles with no obvious need to manage arbitrary projects' internals).
**Steps:**
1. Navigate directly to `/projects/<any-project-id>/manage` (not linked from this role's sidebar view).
2. Attempt to add a team member, add/edit a risk, upload a document, or create a change request for a project unrelated to this user.
**Expected result:** Only ADMIN and the project's own PROJECT_MANAGER (or another clearly-intended role) should be able to mutate this data — PRE_SALES/ACCOUNT_MANAGER should be blocked or restricted, similar to how the app gates Manager Dashboard/Templates/Deal Desk as admin-only elsewhere.
**Actual result (current bug):** The only role check anywhere on this page is `isViewer` — every other role, including PRE_SALES and ACCOUNT_MANAGER, can add/edit/delete team members, risks, documents, and change requests for **any** project via direct URL.

---

## Coverage note

These 13 cover every **high**-severity confirmed finding. The full report (all 169 confirmed findings — medium and low severity included) is available as a searchable, filterable artifact:

**→ https://claude.ai/code/artifact/04a4ff5d-0a5e-4a4e-83c4-10dda6fb8527**

Manual test cases for the medium/low-severity findings were not written — the automated test-case generation phase hit the org's monthly spend limit partway through (only 1 of ~169 completed there). Say which findings you'd like test cases for next and I'll write them directly.
