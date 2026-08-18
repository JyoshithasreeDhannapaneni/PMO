# /bugfix — Diagnose and Fix a Bug

Runs the project's bug-fix blueprint: reproduce → locate → check known bug patterns → fix → verify.

## What it does
Follows `.claude/workflows/bug-fix.md`. Before assuming a root cause, checks the list of **already-known bug patterns** in that file (0-tickets-parsed, lucide-react OS error 426, stale Jira OAuth client ID, missing `dotenv` path, reversed `findColIdx` direction, `manage:servicedesk-customer` scope, and the UTC-midnight/local-timezone date bug class) — several real bugs in this project's history turned out to be one of these repeating.

If gstack is installed, prefer `/investigate` for open-ended "something's wrong and I don't know why" triage across the whole stack; use `/bugfix` once you already know roughly where the bug lives and want the PMO-Tracker-specific fix checklist.

## Usage
`/bugfix <description of the bug or error message>`

## Arguments
`$ARGUMENTS` — the bug description, error message, or repro steps.

## Notes
- Make the minimal change that fixes the root cause — don't refactor surrounding code as part of a bug fix.
- Don't add error handling for scenarios that can't happen.
- Ends with restarting the affected server and re-confirming the original repro steps no longer reproduce the bug.
