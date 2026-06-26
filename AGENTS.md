# PMO Tracker — Agent Roster

This file defines specialized subagents available in this project. Claude reads this before delegating tasks to prevent overlap and keep multi-agent sessions coordinated.

## security-reviewer
**Role**: Reviews code changes for security vulnerabilities.
**Capabilities**: Identifies SQL injection, XSS, IDOR, exposed secrets, missing auth middleware, insecure JWT handling.
**When to invoke**: After any change to `backend/src/middleware/`, `backend/src/routes/`, or auth flows.
**Handoff**: Returns a list of findings with file:line references. Main agent applies fixes.

## test-writer
**Role**: Writes unit and integration tests for backend services and frontend hooks.
**Capabilities**: Creates Jest tests for Express controllers, service functions, and React Query hooks. Knows the project's test patterns.
**When to invoke**: When adding a new service function or API route and tests are needed.
**Handoff**: Returns test file content ready to paste into `__tests__/` directories.

## research
**Role**: Investigates external APIs, library docs, and error messages without polluting the main context.
**Capabilities**: WebFetch, WebSearch, reads library source. Does NOT write code.
**When to invoke**: When blocked on an external API (Jira, Atlassian OAuth, Microsoft Graph), an unfamiliar npm package, or a cloud platform error.
**Handoff**: Returns a structured summary of findings with links and the exact code pattern to use.

## Delegation Protocol
- The main agent retains all file write permissions.
- Subagents report findings as structured text — main agent applies changes.
- Never have two agents edit the same file simultaneously.
- `research` agent runs in a clean context — brief it fully on what you already tried.
