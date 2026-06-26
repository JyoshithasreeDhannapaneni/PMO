# Skill: Testing Patterns

## Description
Triggered when the user asks to write tests, add test coverage, or verify a function. Writes tests matching the project's testing standards.

## Trigger Patterns
- "write a test", "add tests for", "test coverage", "how do I test"

## Key Patterns for This Project

### Service function test (backend)
```typescript
import { normalizeCustomer, pmMatches } from '../services/jiraExcelService';

describe('normalizeCustomer', () => {
  it('collapses variations to same key', () => {
    expect(normalizeCustomer('PDF Solution')).toBe(normalizeCustomer('PDFSolution'));
    expect(normalizeCustomer('pdf_solution')).toBe(normalizeCustomer('PDF-Solution'));
  });
});
```

### React Query hook test (frontend)
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useManagerGoalsWithStats } from '@/hooks/useProjects';

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

it('returns manager stats', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  const { result } = renderHook(() => useManagerGoalsWithStats('ENT'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
```

## Rules
- Never mock the database — use real PostgreSQL test DB (see `.claude/rules/testing-standard.md`).
- Reset test data in `beforeEach` using transactions rolled back after each test.
