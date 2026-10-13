import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) =>
  /COUNT\(\*\)/.test(sql) ? { rows: [{ count: '0' }], rowCount: 1 } : { rows: [], rowCount: 0 }
);
jest.mock('../../config/database', () => ({ query: mockQuery, execute: jest.fn(), transaction: jest.fn() }));

import { projectService } from '../../services/projectService';

function orderByClause(): string {
  const sql = mockQuery.mock.calls.map((c) => String(c[0])).find((s) => s.includes('ORDER BY')) ?? '';
  return (sql.match(/ORDER BY\s+(\S+)\s+(\S+)/) ?? []).slice(1).join(' ');
}

describe('projectService.getAll ORDER BY allowlist (SQL injection)', () => {
  beforeEach(() => { mockQuery.mockClear(); });

  it('falls back to created_at DESC for an injected sortBy/sortOrder', async () => {
    await projectService.getAll({}, {
      sortBy: 'CAST((SELECT token FROM sessions LIMIT 1) AS int)',
      sortOrder: 'desc; DROP TABLE projects--' as 'desc',
    });
    expect(orderByClause()).toBe('created_at DESC');
    const allSql = mockQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allSql).not.toMatch(/sessions|DROP/);
  });

  it('ignores inherited object keys such as constructor and __proto__', async () => {
    for (const sortBy of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      mockQuery.mockClear();
      await projectService.getAll({}, { sortBy });
      expect(orderByClause()).toBe('created_at DESC');
    }
  });

  it('maps allowlisted camelCase keys to their columns and honours asc', async () => {
    await projectService.getAll({}, { sortBy: 'plannedEnd', sortOrder: 'asc' });
    expect(orderByClause()).toBe('planned_end ASC');
  });

  it('defaults to newest first when nothing is given', async () => {
    await projectService.getAll({}, {});
    expect(orderByClause()).toBe('created_at DESC');
  });
});
