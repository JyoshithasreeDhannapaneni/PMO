# Workflow: Bug Fix

Use this blueprint when diagnosing and fixing a bug in PMO Tracker.

**If gstack is installed** (see `CLAUDE.md` Pre-flight), `/investigate` is the better starting point for open-ended "something's wrong and I don't know why" triage across the whole stack. Use this blueprint once you already know roughly where the bug lives, or after `/investigate` narrows it down — then `/review` + `/team-review` + `/qa` + `/ship` as usual once fixed.

## Steps

### 1. Reproduce
- Get the exact error message (from browser console, backend logs, or user description)
- Identify: is it a frontend render error, an API error (4xx/5xx), or a data/logic error?
- Check `backend/logs/` or backend console for Winston error output

### 2. Locate
- For API errors: check the route → controller → service chain
- For render errors: check the component and the React Query hook it uses
- For data errors: check the service function and its raw SQL query (**no Prisma in this backend** — see `.claude/memory/architecture.md`)

### 3. Common Bug Patterns in This Project
- **0 tickets parsed**: Wrong file uploaded (not Jira export), or column names don't match exactly
- **lucide-react build error (os error 426)**: New icon imported that isn't locally cached on OneDrive — replace with an already-imported icon
- **OAuth "Couldn't identify the app"**: Stale Client ID in `.env` — need new app credentials
- **Backend not reading `.env`**: Missing explicit path in `dotenv.config()` — must use `path.resolve(__dirname, '../../.env')`
- **Wrong column matched**: `findColIdx` reversed `.includes()` direction — fix: `h.includes(lc)` only, never `lc.includes(h)`
- **Accept button grayed out on Atlassian**: `manage:servicedesk-customer` scope in OAuth URL — remove it
- **Date shows one day off for some users (e.g. PST/EST)**: `new Date(dateOnlyString).toLocaleDateString()`/`.getDate()` reads a UTC-midnight string in the *browser's* local timezone. Fix by extracting Y/M/D from the string directly instead of round-tripping through a `Date`. Already fixed in the shared `formatDate()` (`frontend/src/lib/utils.ts`); ~10 other pages have their own duplicated copy of the same bug, not yet fixed.
- **A metric shows real names but all zeros, no error anywhere**: check for a bare `.catch(() => [])`/`.catch(() => emptyValue)` around an external API call (Graph, OpenAI) upstream of that data — this silently converts a real permission/auth error into "no data" with nothing logged. Let it propagate instead so it surfaces via the existing error-banner/logging code.

### 4. Fix
- Make the minimal change that fixes the root cause
- Do not add error handling for scenarios that can't happen
- Do not refactor surrounding code as part of the fix

### 5. Verify
- Restart the affected server (backend or frontend)
- Reproduce the original steps — confirm the bug is gone
- Check for regressions on related features
