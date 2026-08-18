# TODOS

## Call Hygiene / Quality Scoring

### Validate Quality bucket thresholds against human-reviewed calls

**What:** Compare automated answered-well/partial/dodged bucket assignments against a
human-graded sample of 20-30 held calls before treating the Quality score as authoritative.

**Why:** Landscape research from the `/office-hours` session on this feature (AI call-QA
scoring best practices) found this is standard practice before trusting an automated score
for anything consequential. This is now higher-stakes than originally scoped — as of
2026-08-16, Quality is no longer one of four inputs into Call Hygiene, it **is** the entire
score (Volume/Cadence/Reliability were dropped at the user's explicit direction). A
threshold miscalibration now affects the sole number representing someone's call
performance, not one component of four.

**Context:** The bucket thresholds (e.g. score >= 70 = "answered well") were picked as a
reasonable starting point during `/plan-eng-review` but never validated against real human
judgment. Once the feature has been running for a few weeks and has real graded call data,
pull a sample across different score ranges and have a manager (or several) independently
rate the same calls, then compare. Adjust thresholds if there's systematic disagreement.

**Effort:** M
**Priority:** P1 (raised from P2 — see Why)
**Depends on:** The Call Hygiene Quality scoring feature must be live and have accumulated
real graded calls first.

## Completed (resolved during design, not shipped separately)

### Decide PROJECT_MANAGER role exposure for the Quality score

**What:** Decide whether PROJECT_MANAGER role should see the Quality score.

**Resolution (2026-08-16):** Resolved as part of the scoring-model pivot, not deferred.
PROJECT_MANAGER sees only their **own** row (self-improvement visibility, no peer
comparison); ADMIN sees everyone; ACCOUNT_MANAGER/VIEWER/PRE_SALES see neither an empty
table nor stale data — a clear "not available for your role" state. Requires real
per-person scoping in `callHygieneController.ts`, not a field strip — see the
2026-08-16 design doc revision.

### Frontend UI for the Quality score

**What:** Display the Call Hygiene score in the UI.

**Resolution (2026-08-16):** No longer deferred — the user explicitly asked for the score
to be displayed, and since Call Hygiene is now a full replacement of the existing
Volume/Cadence/Reliability dashboard (not an additive field), this is core scope for the
same PR, not a follow-up. See the 2026-08-16 design doc revision for the specific UI
changes to `audit-dashboard/page.tsx`.
