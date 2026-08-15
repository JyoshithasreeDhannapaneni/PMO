# PMO Tracker — Agent Roster

This file defines specialized subagents available in this project. Claude reads this before delegating tasks to prevent overlap and keep multi-agent sessions coordinated.

**Relationship to gstack**: gstack's `/review` and `/cso` do general-purpose code review and security audit across any codebase. The agents below exist for what gstack *doesn't* know — this project's specific schema layering, its raw-SQL conventions, its Jira/Graph/OpenAI integrations, and its own naming rules. Run gstack's general commands first; reach for these agents when the question is "does this match how PMO Tracker specifically does things."

## security-reviewer
**Role**: Reviews code changes for security vulnerabilities.
**Capabilities**: Identifies SQL injection, XSS, IDOR, exposed secrets, missing auth middleware, insecure JWT handling.
**When to invoke**: After any change to `backend/src/middleware/`, `backend/src/routes/`, or auth flows. Complements gstack's `/cso` — this agent knows this repo's specific patterns (e.g. raw `pg` string interpolation risk, the `requireRole('ADMIN')` gate needed on anything reading call transcripts).
**Handoff**: Returns a list of findings with file:line references. Main agent applies fixes.

## test-writer
**Role**: Writes unit and integration tests for backend services and frontend hooks.
**Capabilities**: Creates Jest tests for Express controllers, service functions, and React Query hooks. Knows the project's test patterns.
**When to invoke**: When adding a new service function or API route and tests are needed. **Note**: as of this writing, no test infrastructure actually exists yet in this repo (no `jest` installed, no `.test.*` files) — the first invocation of this agent on a given side (backend/frontend) needs to also install `jest`/`ts-jest`/`@testing-library/react` and add a config, not just write test bodies against an assumed setup.
**Handoff**: Returns test file content ready to paste into `__tests__/` directories.

## researcher
**Role**: Investigates external APIs, library docs, and error messages without polluting the main context.
**Capabilities**: WebFetch, WebSearch, reads library source. Does NOT write code.
**When to invoke**: When blocked on an external API (Jira, Atlassian OAuth, Microsoft Graph, OpenAI), an unfamiliar npm package, or a cloud platform error.
**Handoff**: Returns a structured summary of findings with links and the exact code pattern to use.
**Note**: implemented as `.claude/agents/research.md` (pre-existing filename) — functionally the same role as "researcher."

## architect
**Role**: Plans multi-file or cross-cutting changes before code is written — new domain features, schema changes, or anything touching more than one of controller/service/route/frontend-hook/page at once.
**Capabilities**: Reads existing services/routes/hooks to find the right seam; proposes the controller → service → route → hook → page shape a new feature should take; flags when a change would violate `.claude/rules/architecture-boundaries.md`.
**When to invoke**: Before starting a new domain feature (see `.claude/commands/feature.md` and `.claude/workflows/feature-build.md`), or when a bug fix keeps wanting to touch five files and it's unclear if that's actually necessary.
**Handoff**: Returns a short plan (files to touch, in what order, what each one's responsibility is) — main agent implements. Complements gstack's `/plan-eng-review`, which is for reviewing an already-written spec/plan rather than deriving one from this specific codebase's existing seams.

## code-reviewer
**Role**: Project-convention-focused review — distinct from `security-reviewer` (security only) and gstack's `/review` (general correctness/bugs).
**Capabilities**: Checks against `.claude/rules/code-style.md` and `.claude/rules/api-conventions.md` specifically — response shape (`{ success, data }`), controllers-call-services boundary, no new hook files, lucide-icon import-list rule, ISO date handling (see the timezone bug class documented in `.claude/memory/decisions.md`).
**When to invoke**: Before opening a PR, in addition to (not instead of) gstack's `/review`.
**Handoff**: Returns findings grouped Must Fix / Should Fix / Passed with file:line references, same shape as `.claude/commands/team-review.md`.

## Delegation Protocol
- The main agent retains all file write permissions.
- Subagents report findings as structured text — main agent applies changes.
- Never have two agents edit the same file simultaneously.
- `researcher` (`research.md`) agent runs in a clean context — brief it fully on what you already tried.
