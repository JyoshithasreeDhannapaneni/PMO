# Testing Standards — PMO Tracker

> **Current state (verified by repo audit):** none of this exists yet. `backend/package.json` has a `"test": "jest"` script but `jest` is not in its dependencies; `frontend/package.json` has no test script at all; there are zero `.test.*` files anywhere in `backend/src` or `frontend/src`. This document describes the *intended* approach for when tests are added, not a working setup today. The first test added to either side needs to also install and configure `jest`/`ts-jest`/`@testing-library/react` — see the `test-writer` agent (`.claude/agents/test-writer.md`), which knows this gap.

## Philosophy
- Test business logic in services, not in controllers.
- Integration tests hit the real PostgreSQL test DB — no mocking the database (mock/prod divergence caused a broken migration incident).
- Unit tests for pure utility functions (date calculations, SLA breach detection, customer name normalization).

## Test Locations
```
backend/src/__tests__/
  services/           # Unit + integration tests for service functions
  utils/              # Pure function tests
  routes/             # Integration tests hitting real Express app + DB
frontend/src/__tests__/
  hooks/              # React Query hook tests (mock fetch only)
  utils/              # Pure function tests
```

## Naming
- Test files: `<subject>.test.ts`
- Describe blocks: the module/function being tested — `describe('jiraExcelService')`
- It blocks: plain English behavior — `it('groups tickets by normalized customer name')`

## Key Functions to Test
- `parseJiraExcel()` — column detection, breach parsing, customer grouping
- `getExcelSlaByManager()` — PM name matching, normalizeCustomer dedup
- `pmMatches()` — exact, email-prefix, first-name, contains cases
- `isBreached()` — all edge cases: "Breached", "-0h 30m (Breached)", "yes", "no", ""
- `normalizeCustomer()` — "PDF Solution" === "PDFSolution" === "pdf_solution"
- Delay calculation logic in `projectService.ts`

## React Query Hook Tests
- Mock `authFetch` at the module level.
- Wrap in `QueryClientProvider` with a fresh `QueryClient` per test.
- Assert loading / success / error states.

## Running Tests
```bash
cd backend && npm test
cd frontend && npm test
```
