# /team-review — PMO Tracker Code Review Checklist

> Renamed from `review.md` to avoid colliding with gstack's own `/review` command (gstack is installed globally at `~/.claude/skills/gstack` and reserves `/review` for its general-purpose diff review). This command is this project's own, narrower checklist — run gstack's `/review` for general correctness/bugs, and `/team-review` for PMO-Tracker-specific conventions. See `.claude/memory/decisions.md` for the rename record.

Run a code review on the current branch changes, scoped to this project's own conventions.

## What it does
1. Runs `git diff main...HEAD` to get all changes since branching.
2. Checks for: TypeScript errors (`npx tsc --noEmit`), missing auth middleware on new routes (`requireAuth`, `requireRole('ADMIN')` on anything sensitive), hardcoded secrets, `console.log` statements, and new lucide-react icon imports (OneDrive timeout risk).
3. Checks against `.claude/rules/code-style.md`, `.claude/rules/api-conventions.md`, `.claude/rules/architecture-boundaries.md`, and `.claude/rules/security-rules.md`.
4. Flags any new schema change that isn't added via a guarded block in `runMigrations()` (`backend/src/index.ts`).
5. Flags any date-only field formatted via `new Date(str).toLocaleDateString()`/`.getDate()`/`.getMonth()` — the known UTC-midnight/local-timezone bug class (see `.claude/memory/decisions.md`).
6. Reports findings as a numbered list with file:line references.

## Usage
Type `/team-review` in the chat. Optionally pass a file path: `/team-review src/services/jiraExcelService.ts`

## Arguments
`$ARGUMENTS` — optional file or directory path to scope the review.

## Output Format
```
## Team Review: <branch or file>

### Must Fix
1. [file.ts:42] Missing requireAuth on POST /api/...

### Suggestions
1. [file.ts:88] Consider extracting this logic into a service

### Passed
- TypeScript: no errors
- No hardcoded secrets found
- Auth middleware present on all new routes
```
