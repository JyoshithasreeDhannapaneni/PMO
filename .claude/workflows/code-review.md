# Workflow: Code Review

Use this blueprint for a thorough code review of a branch or set of changes.

## Steps

### 1. Scope
```bash
git diff main...HEAD --stat        # files changed
git log main...HEAD --oneline      # commit history
```

### 2. TypeScript Check
```bash
cd backend  && npx tsc --noEmit --skipLibCheck
cd frontend && npx tsc --noEmit --skipLibCheck
```
Both must pass. Report any errors as **Must Fix**.

### 3. Security Check (delegate to security-reviewer agent)
- Missing `requireAuth` on new routes
- Raw SQL with string interpolation
- Hardcoded secrets or credentials
- New file upload endpoints without type validation

### 4. Convention Check
- No `console.log` in committed code
- Controllers are thin (no DB logic)
- All hooks in `useProjects.ts` (no new hook files)
- New lucide icons only if locally cached
- Response shape: `{ success, data }` on all routes
- `dotenv.config()` has explicit path if modified

### 5. Logic Check
- `findColIdx`: direction is `h.includes(lc)` only
- `normalizeCustomer` called before grouping
- OAuth scopes do not include `manage:servicedesk-customer`

### 6. Output
Group findings:
- **Must Fix** — blocks functionality, security, or TypeScript
- **Should Fix** — convention violations
- **Passed** — list what was checked and passed

Always include `file:line` references for findings.
