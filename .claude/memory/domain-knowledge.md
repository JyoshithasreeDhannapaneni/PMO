---
name: domain-knowledge
description: PMO/migration-tracking domain concepts used throughout PMO Tracker (phases, plan types, delay states, hygiene scores)
metadata:
  type: project
---

Core domain vocabulary this app is built around — useful for reading service/controller code without re-deriving meaning from column names each time.

**Why:** These concepts recur across nearly every service (`projectService.ts`, `accountManagerController.ts`, dashboard aggregations) with the same meaning; documenting them once avoids re-explaining in every file.

**How to apply:** When a request mentions one of these terms, map it to the concrete field/enum below rather than asking the user to define it.

## Project Lifecycle Phases
`KICKOFF → CLOUD_ADDING → PILOT_MIGRATION → ONETIME_MIGRATION → DELTA → FINAL_VALIDATION → COMPLETED` (also referenced historically as the simpler `KICKOFF → MIGRATION → VALIDATION → CLOSURE → COMPLETED` in `README.md` — the actual `getPhaseColor()` switch in `frontend/src/lib/utils.ts` reflects the newer 7-phase version; trust the code over `README.md`).

## Plan Types
`BRONZE / SILVER / GOLD / PLATINUM` — customer's service tier, drives KPI card coloring (`getPlanColor()`).

## Project Status vs. Delay Status (two different axes)
- **Status**: `ACTIVE / ON_HOLD / COMPLETED / CANCELLED / INACTIVE` — is the project running at all.
- **Delay status**: `NOT_DELAYED / AT_RISK / DELAYED` (plus `EXTENDED` for overaged projects with an agreed extension) — is it on schedule. Computed live by `calculateDelay()`, not just read from the DB.

## Overage
A project past its original SOW `planned_end` with an `extended_end_date` agreed with the customer. `is_overaged` + `extended_end_date` + `overage_amount` together describe this — a project can be overaged and still "on track" against the *extended* deadline (delay status `EXTENDED` rather than `DELAYED`).

## Segments
`ENT` (enterprise) / `SMB` (small-medium business) — drives which Project Managers a "Manager Dashboard" view groups under, configured in PMO settings, not inferred from PM name.

## Account Manager vs. Project Manager vs. Customer Success
Three distinct roles tracked per project: **Project Manager** runs day-to-day delivery; **Account Manager** owns the customer relationship across potentially multiple projects/tracks for the same customer (see the Account Manager page's per-customer rollup of multiple `migrationTracks`); **Customer Success** owns CSAT scoring, independent of delivery status.

## Hygiene Scores (Email / Call)
Both scored out of 100 as three weighted sub-scores:
- **Email Hygiene**: Speed /30 + Quality /30 + Resolution /20 + Tone /20.
- **Call Hygiene**: Volume /40 (held customer calls, saturates at 12/30 days) + Cadence /30 (recency + rate) + Reliability /30 (low cancellation + proper online-meeting links).
"Held" means: customer-facing (external attendee), not cancelled, and actually attended (organizer or accepted/tentative RSVP) — a declined/no-response invite doesn't count.

## Call-Transcript Grading (added Aug 2026)
Per-meeting, per-person AI grading: given a specific held customer call, fetch its Teams transcript via Graph, then have an LLM find only the moments where a customer asked something and the *named* internal person answered, scoring each answer 0-100 with feedback, plus an overall score/summary. Gated to `requireRole('ADMIN')` given the HR-adjacent nature of grading an individual's answers. Requires `Calendars.Read` + `OnlineMeetingTranscript.Read.All` Graph permissions AND that Teams transcription was actually turned on for that specific call — absence of either means "no transcript," not "0 quality."

## Known OneDrive-Specific Quirks (not a business concept, but recurring)
This dev environment syncs the repo through OneDrive, which causes two distinct build issues: lucide-react icon files timing out if not yet locally synced (`os error 426`), and Next.js's `.next` directory getting locked by OneDrive during webpack writes (worked around by `frontend/scripts/predev.js`).

[[architecture]]
[[decisions]]
