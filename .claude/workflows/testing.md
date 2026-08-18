# Workflow: Testing

Use this blueprint when asked to add tests to PMO Tracker.

**Reality check first**: as of this writing, there is no test infrastructure on either side of this repo — `backend/package.json` has a `"test": "jest"` script but `jest` isn't installed, `frontend/package.json` has no test script at all, and there are zero `.test.*` files anywhere. Don't write a test file assuming a working `npm test` — check first (`ls backend/node_modules/.bin/jest` or similar), and if it's the first test on that side, set up the runner as step 0.

**If gstack is installed**, `/qa <url>` covers real-browser behavioral testing — this workflow is for the unit/integration test suite specifically, which gstack doesn't know this project's own patterns for.

## Steps

### 0. Bootstrap (only if this is the first test on this side of the repo)
- **Backend**: `cd backend && npm install --save-dev jest ts-jest @types/jest` and add a minimal `jest.config.js` (`preset: 'ts-jest'`, `testEnvironment: 'node'`).
- **Frontend**: `cd frontend && npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom` and add a `jest.config.js` (`testEnvironment: 'jsdom'`) plus a `test` script in `package.json`.

### 1. Locate the Right Layer
- Business logic → test the **service function** (`backend/src/services/<x>Service.ts`), never the controller.
- Pure utility functions (date math, SLA breach detection, customer-name normalization, delay calculation) → dedicated unit tests, no DB needed.
- React Query hooks → `frontend/src/hooks/useProjects.ts` exports, tested with a mocked `fetch`/`authFetch`, not a real backend.

### 2. Follow This Project's Testing Philosophy (`.claude/rules/testing-standard.md`)
- **Never mock the PostgreSQL database** for integration tests — this project had a real incident where a mocked test passed while the actual migration was broken. Use a real test DB.
- Use `describe`/`it` with plain-English behavior descriptions, not implementation-detail names.
- Cover edge cases explicitly: empty input, null values, name/casing variations (this app's Jira/customer-name matching logic has repeatedly broken on exactly these edge cases historically).

### 3. Naming and Location
- `backend/src/__tests__/services/<subject>.test.ts`, `backend/src/__tests__/utils/<subject>.test.ts`, `backend/src/__tests__/routes/<subject>.test.ts` (integration, real Express app + DB)
- `frontend/src/__tests__/hooks/<subject>.test.ts`, `frontend/src/__tests__/utils/<subject>.test.ts`

### 4. Verify
- Run the new test in isolation first, then the full suite for that side.
- Run `npx tsc --noEmit` — test files still need to type-check cleanly.

### 5. Report
State plainly what is and isn't covered — don't claim "tests pass" for a feature area with zero test files, and don't claim a UI change works without either a test or an actual browser check (`/qa` if gstack is installed, or manually starting both dev servers otherwise).
