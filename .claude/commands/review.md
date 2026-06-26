# /review — Code Review

Run a code review on the current branch changes.

## What it does
1. Runs `git diff main...HEAD` to get all changes since branching.
2. Checks for: TypeScript errors (`npx tsc --noEmit`), missing auth middleware on new routes, hardcoded secrets, console.log statements, and new lucide-react icon imports (OneDrive timeout risk).
3. Checks against `.claude/rules/code-style.md` and `.claude/rules/api-conventions.md`.
4. Reports findings as a numbered list with file:line references.

## Usage
Type `/review` in the chat. Optionally pass a file path: `/review src/services/jiraExcelService.ts`

## Arguments
`$ARGUMENTS` — optional file or directory path to scope the review.

## Output Format
```
## Review: <branch or file>

### Must Fix
1. [file.ts:42] Missing requireAuth on POST /api/...

### Suggestions
1. [file.ts:88] Consider extracting this logic into a service

### Passed
- TypeScript: no errors
- No hardcoded secrets found
- Auth middleware present on all new routes
```
