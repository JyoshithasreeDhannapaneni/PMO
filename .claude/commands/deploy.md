# /deploy — Pre-Deploy Checklist

Runs the pre-deploy checklist before pushing to production.

## What it does
1. Confirms no `.env` file would be committed (`git status` check).
2. Runs TypeScript check: `npx tsc --noEmit` in both `backend/` and `frontend/`.
3. Runs `npm run build` in `frontend/` to confirm Next.js build succeeds.
4. Checks that `CLAUDE.local.md` is gitignored.
5. Verifies `backend/.jira-oauth-tokens.json` is not tracked by git.
6. Lists any uncommitted changes that would be left behind.

## Usage
Type `/deploy` in the chat.

## Arguments
`$ARGUMENTS` — optional environment name: `staging` | `production` (default: `staging`).

## Output Format
```
## Deploy Checklist — <environment>

✅ .env not staged
✅ TypeScript (backend): no errors
✅ TypeScript (frontend): no errors
✅ Next.js build: success
❌ Uncommitted changes in backend/src/services/jiraService.ts — commit or stash first
```
