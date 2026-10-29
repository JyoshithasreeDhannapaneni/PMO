import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ id: 'p1' }], rowCount: 1 }));
jest.mock('../../config/database', () => ({ query: mockQuery, execute: jest.fn(), transaction: jest.fn() }));

import { caseStudyService } from '../../services/caseStudyService';

const lastSql = () => String(mockQuery.mock.calls[mockQuery.mock.calls.length - 1]?.[0] ?? '');

describe('caseStudyService not-needed flag', () => {
  beforeEach(() => { mockQuery.mockClear(); });

  it('leaves projects marked not needed out of the awaiting list', async () => {
    await caseStudyService.getAwaiting();
    expect(lastSql()).toMatch(/case_study_not_needed_at IS NULL/);
  });

  it('only marks completed projects that have no case study yet', async () => {
    const updated = await caseStudyService.markNotNeeded(['p1'], 'Admin User', 'PM has left');
    expect(updated).toBe(1);
    const sql = lastSql();
    expect(sql).toMatch(/status = 'COMPLETED'/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM case_studies/);
    expect(mockQuery.mock.calls[0][1]).toEqual([['p1'], 'Admin User', 'PM has left']);
  });

  it('does not query for an empty list', async () => {
    expect(await caseStudyService.markNotNeeded([], 'Admin', null)).toBe(0);
    expect(await caseStudyService.restoreNeeded([])).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
