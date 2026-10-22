import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../../config/database', () => ({ query: jest.fn(), execute: jest.fn(), transaction: jest.fn() }));
jest.mock('../../services/auditService', () => ({ auditService: { log: jest.fn(async () => undefined) } }));
jest.mock('../../services/projectService', () => ({
  projectService: {
    create: jest.fn(async () => ({ id: 'p1' })),
    update: jest.fn(async () => ({ id: 'p1' })),
    delete: jest.fn(async () => undefined),
    deleteByClient: jest.fn(async () => 1),
    getById: jest.fn(async () => ({ id: 'p1', projectManager: 'Alice', accountManager: 'Bob', status: 'ACTIVE' })),
  },
}));

const mockCaseStudyByProject = jest.fn(async (_id: string): Promise<{ id: string } | null> => null);
jest.mock('../../services/caseStudyService', () => ({ caseStudyService: { getByProjectId: mockCaseStudyByProject } }));

import { projectController } from '../../controllers/projectController';
import { projectService } from '../../services/projectService';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

async function call(handler: Handler, user: { id: string; name: string; role: string } | undefined, body: Record<string, unknown> = {}) {
  const json = jest.fn();
  const status = jest.fn((_code: number) => ({ json }));
  const res = { status, json } as unknown as Response;
  const req = { params: { id: 'p1', clientName: 'Acme' }, body, headers: {}, user } as unknown as Request;
  handler(req, res, jest.fn() as unknown as NextFunction);
  // asyncHandler doesn't return the inner promise; let it settle.
  await new Promise((r) => setImmediate(r));
  return { status, json };
}

const pm = (name: string) => ({ id: 'u1', name, role: 'PROJECT_MANAGER' });

describe('projectController authorization (fails closed)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('rejects anonymous create, update, delete and deleteClient with 401 and touches nothing', async () => {
    for (const h of [projectController.create, projectController.update, projectController.delete, projectController.deleteClient]) {
      const { status } = await call(h as Handler, undefined);
      expect(status).toHaveBeenCalledWith(401);
      // Same body shape as requireAuth / the /api gate (api-conventions: error is a string).
      const json = status.mock.results[0].value as { json: jest.Mock };
      expect(json.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
    }
    expect(projectService.create).not.toHaveBeenCalled();
    expect(projectService.update).not.toHaveBeenCalled();
    expect(projectService.delete).not.toHaveBeenCalled();
    expect(projectService.deleteByClient).not.toHaveBeenCalled();
  });

  it('blocks VIEWER and ACCOUNT_MANAGER from creating or deleting', async () => {
    for (const role of ['VIEWER', 'ACCOUNT_MANAGER']) {
      expect((await call(projectController.create as Handler, { id: 'u', name: 'X', role })).status).toHaveBeenCalledWith(403);
      expect((await call(projectController.delete as Handler, { id: 'u', name: 'X', role })).status).toHaveBeenCalledWith(403);
    }
    expect(projectService.create).not.toHaveBeenCalled();
    expect(projectService.delete).not.toHaveBeenCalled();
  });

  it("blocks a PROJECT_MANAGER from editing or deleting another manager's project", async () => {
    expect((await call(projectController.update as Handler, pm('Carol'), { status: 'DONE' })).status).toHaveBeenCalledWith(403);
    expect((await call(projectController.delete as Handler, pm('Carol'))).status).toHaveBeenCalledWith(403);
    expect(projectService.update).not.toHaveBeenCalled();
    expect(projectService.delete).not.toHaveBeenCalled();
  });

  it('lets a PROJECT_MANAGER delete their own project', async () => {
    await call(projectController.delete as Handler, pm('Alice'));
    expect(projectService.delete).toHaveBeenCalledWith('p1');
  });

  it('forces the PROJECT_MANAGER as owner on create', async () => {
    await call(projectController.create as Handler, pm('Alice'), { projectManager: 'Someone Else' });
    expect(projectService.create).toHaveBeenCalledWith(expect.objectContaining({ projectManager: 'Alice' }));
  });

  // Value: protects=PRE_SALES can only create POC projects (defaulting the manager to themselves) and cannot edit or delete;
  //   fails_when=the PRE_SALES branch is lost/reordered in the fail-closed rewrite of create, or PRE_SALES slips into the edit/delete role check;
  //   why_new=existing rows cover PM/VIEWER/AM only; seam=none
  it('forces PRE_SALES creates to POC and keeps them out of edit and delete', async () => {
    const ps = { id: 'u3', name: 'Priya', role: 'PRE_SALES' };
    await call(projectController.create as Handler, ps, { projectType: 'MIGRATION' });
    expect(projectService.create).toHaveBeenCalledWith(expect.objectContaining({ projectType: 'POC', projectManager: 'Priya' }));
    await call(projectController.create as Handler, ps, { projectType: 'MIGRATION', projectManager: 'Alice' });
    expect(jest.mocked(projectService.create).mock.calls[1][0]).toEqual(expect.objectContaining({ projectType: 'POC', projectManager: 'Alice' }));
    expect((await call(projectController.update as Handler, ps, { status: 'DONE' })).status).toHaveBeenCalledWith(403);
    expect((await call(projectController.delete as Handler, ps)).status).toHaveBeenCalledWith(403);
    expect(projectService.update).not.toHaveBeenCalled();
    expect(projectService.delete).not.toHaveBeenCalled();
  });

  it('lets an ACCOUNT_MANAGER change only archiveCsatStatus on their own project', async () => {
    const am = { id: 'u2', name: 'Bob', role: 'ACCOUNT_MANAGER' };
    expect((await call(projectController.update as Handler, am, { archiveCsatStatus: 'X', status: 'DONE' })).status).toHaveBeenCalledWith(403);
    expect(projectService.update).not.toHaveBeenCalled();
    await call(projectController.update as Handler, am, { archiveCsatStatus: 'X' });
    expect(jest.mocked(projectService.update).mock.calls[0]).toEqual(['p1', { archiveCsatStatus: 'X' }]);
  });
});

// Value: protects=the UI is told to ask for a case study exactly when a migration project moves into COMPLETED without one;
//   fails_when=the flag fires on every edit of an already-completed project, for POCs, when a case study exists, or never;
//   no_claim=the frontend popup itself (no frontend tests); projectService and caseStudyService are mocked.
describe('projectController.update caseStudyDue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaseStudyByProject.mockResolvedValue(null);
  });

  const due = async (before: string, after: { status: string; projectType?: string }) => {
    jest.mocked(projectService.getById).mockResolvedValueOnce({ id: 'p1', projectManager: 'Alice', status: before } as never);
    jest.mocked(projectService.update).mockResolvedValueOnce({ id: 'p1', projectType: 'MIGRATION', ...after } as never);
    const { json } = await call(projectController.update as Handler, pm('Alice'), { phase: 'COMPLETED' });
    return (json.mock.calls[0][0] as { caseStudyDue: boolean }).caseStudyDue;
  };

  it('is set when an active project becomes COMPLETED with no case study', async () => {
    expect(await due('ACTIVE', { status: 'COMPLETED' })).toBe(true);
  });

  it('is not set for an already-completed project, a POC, a project that is not completed, or one with a case study', async () => {
    expect(await due('COMPLETED', { status: 'COMPLETED' })).toBe(false);
    expect(await due('ACTIVE', { status: 'COMPLETED', projectType: 'POC' })).toBe(false);
    expect(await due('ACTIVE', { status: 'ACTIVE' })).toBe(false);
    mockCaseStudyByProject.mockResolvedValueOnce({ id: 'cs1' });
    expect(await due('ACTIVE', { status: 'COMPLETED' })).toBe(false);
  });
});
