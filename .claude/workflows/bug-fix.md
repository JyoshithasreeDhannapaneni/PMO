# Workflow: Bug Fix

Use this blueprint when diagnosing and fixing a bug in PMO Tracker.

## Steps

### 1. Reproduce
- Get the exact error message (from browser console, backend logs, or user description)
- Identify: is it a frontend render error, an API error (4xx/5xx), or a data/logic error?
- Check `backend/logs/` or backend console for Winston error output

### 2. Locate
- For API errors: check the route → controller → service chain
- For render errors: check the component and the React Query hook it uses
- For data errors: check the service function and the Prisma query

### 3. Common Bug Patterns in This Project
- **0 tickets parsed**: Wrong file uploaded (not Jira export), or column names don't match exactly
- **lucide-react build error (os error 426)**: New icon imported that isn't locally cached on OneDrive — replace with an already-imported icon
- **OAuth "Couldn't identify the app"**: Stale Client ID in `.env` — need new app credentials
- **Backend not reading `.env`**: Missing explicit path in `dotenv.config()` — must use `path.resolve(__dirname, '../../.env')`
- **Wrong column matched**: `findColIdx` reversed `.includes()` direction — fix: `h.includes(lc)` only, never `lc.includes(h)`
- **Accept button grayed out on Atlassian**: `manage:servicedesk-customer` scope in OAuth URL — remove it

### 4. Fix
- Make the minimal change that fixes the root cause
- Do not add error handling for scenarios that can't happen
- Do not refactor surrounding code as part of the fix

### 5. Verify
- Restart the affected server (backend or frontend)
- Reproduce the original steps — confirm the bug is gone
- Check for regressions on related features
