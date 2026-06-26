# Skill: Code Review

## Description
Triggered when the user asks to review, audit, or check code for issues. Reviews TypeScript/React/Express code for correctness, security, and adherence to PMO Tracker conventions.

## Trigger Patterns
- "review this", "check this code", "audit", "any issues with"
- "is this correct", "does this look right"

## What to Check (in order)
1. **TypeScript correctness** — types, no implicit `any`, correct return shapes
2. **Security** — missing `requireAuth`, exposed secrets, SQL injection via raw queries
3. **Convention violations** — DB logic in controllers, `console.log`, new lucide icons added
4. **React patterns** — missing `key` props, hooks called conditionally, stale closures
5. **API conventions** — response shape matches `{ success, data }`, correct HTTP status codes

## Output Format
Return a concise list grouped by severity:
- **Must Fix** — breaks functionality or security
- **Should Fix** — violates conventions
- **Optional** — style suggestions

Always include `file:line` references.
