// Value: protects=no path (project edit or phase auto-advance) moves a project into DELTA without a recorded customer C-SAT response, and every other edit behaves as before;
//   fails_when=the gate is removed from either path, runs after the write, or misfires on non-Delta/custom phases or already-Delta projects; why_new=new feature;
//   seam=none
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

type Row = Record<string, unknown>;
let mockProject: Row;
let mockCsatRows: Row[];
let mockPhaseRow: Row | undefined;
let mockNextPhase: string | null;

const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
  if (/FROM csat_requests/.test(sql)) return { rows: mockCsatRows, rowCount: mockCsatRows.length };
  if (/FROM project_phases pp/.test(sql)) return { rows: mockPhaseRow ? [mockPhaseRow] : [], rowCount: mockPhaseRow ? 1 : 0 };
  if (/SELECT phase_name FROM project_phases/.test(sql)) return { rows: mockNextPhase ? [{ phase_name: mockNextPhase }] : [], rowCount: mockNextPhase ? 1 : 0 };
  if (/FROM project_phases WHERE id/.test(sql)) return { rows: [mockPhaseRow], rowCount: 1 };
  if (/SELECT phase FROM projects/.test(sql)) return { rows: [{ phase: mockProject.phase }], rowCount: 1 };
  if (/FROM projects WHERE id/.test(sql)) return { rows: [mockProject], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});
const mockExecute = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 }));
jest.mock('../../config/database', () => ({ query: mockQuery, execute: mockExecute, transaction: jest.fn() }));
const mockNotifyDelta = jest.fn(async (_id: string) => undefined);
jest.mock('../../services/phaseWebhookService', () => ({ phaseWebhookService: { notifyDeltaPhase: mockNotifyDelta } }));
jest.mock('../../services/archiveService', () => ({ archiveService: { autoArchive: jest.fn(async () => undefined) } }));
jest.mock('../../services/taskService', () => ({ taskService: { checkProjectCompletion: jest.fn(async () => undefined) } }));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { projectService } from '../../services/projectService';
import { phaseService } from '../../services/phaseService';

const answered = { id: 'r1', recipient_email: 'c@x.com', sent_at: new Date(), responded_at: new Date(), sent_from: 'pm@x.com' };
const pending = { ...answered, responded_at: null };

function project(phase: string): Row {
  return {
    id: 'p1', name: 'Acme', customer_name: 'Acme Inc', project_manager: 'Alice', phase, status: 'ACTIVE',
    planned_start: new Date('2026-01-01'), planned_end: new Date('2026-06-01'), actual_start: null, actual_end: null,
    created_at: new Date(), updated_at: new Date(),
  };
}

const projectUpdates = () => mockExecute.mock.calls.filter((c) => /UPDATE projects SET/.test(String(c[0])));

async function rejection(p: Promise<unknown>) {
  try { await p; } catch (err) { return err as { statusCode?: number; code?: string; details?: { csat?: { state?: string } } }; }
  throw new Error('expected the call to be rejected');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCsatRows = [];
  mockPhaseRow = undefined;
  mockNextPhase = null;
});

describe('C-SAT gate on projectService.update', () => {
  it('blocks a move into DELTA when no survey was sent, before writing anything', async () => {
    mockProject = project('ONETIME_MIGRATION');
    const err = await rejection(projectService.update('p1', { phase: 'DELTA' } as never));
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CSAT_REQUIRED');
    expect(err.details?.csat?.state).toBe('none');
    expect(projectUpdates()).toHaveLength(0);
    expect(mockNotifyDelta).not.toHaveBeenCalled();
  });

  it('blocks while the customer has not answered yet, from any earlier phase', async () => {
    mockProject = project('PILOT_MIGRATION');
    mockCsatRows = [pending];
    const err = await rejection(projectService.update('p1', { phase: 'delta' } as never));
    expect(err.code).toBe('CSAT_REQUIRED');
    expect(err.details?.csat?.state).toBe('pending');
    expect(projectUpdates()).toHaveLength(0);
  });

  it('allows the move once the customer answered, and still fires the Delta webhook', async () => {
    mockProject = project('ONETIME_MIGRATION');
    mockCsatRows = [answered];
    await projectService.update('p1', { phase: 'DELTA' } as never);
    expect(projectUpdates()).toHaveLength(1);
    expect(mockNotifyDelta).toHaveBeenCalledWith('p1');
  });

  // Regression contract (R8)
  it('R8-1: leaves moves between non-Delta phases untouched', async () => {
    mockProject = project('ONETIME_MIGRATION');
    await projectService.update('p1', { phase: 'FINAL_VALIDATION' } as never);
    expect(projectUpdates()).toHaveLength(1);
    expect(mockQuery.mock.calls.some((c) => /csat_requests/.test(String(c[0])))).toBe(false);
  });

  it('R8-2: never blocks edits to a project that is already in DELTA', async () => {
    mockProject = project('DELTA');
    await projectService.update('p1', { notes: 'still delta' } as never);
    await projectService.update('p1', { phase: 'DELTA', notes: 'same phase' } as never);
    expect(projectUpdates()).toHaveLength(2);
    expect(mockNotifyDelta).not.toHaveBeenCalled();
  });

  it('R8-3: completing a project (status + phase COMPLETED) still works', async () => {
    mockProject = project('FINAL_VALIDATION');
    await projectService.update('p1', { phase: 'COMPLETED', status: 'COMPLETED' } as never);
    expect(projectUpdates().length).toBeGreaterThanOrEqual(1);
  });

  it('R8-5: custom phase codes other than DELTA are never gated', async () => {
    mockProject = project('ONETIME_MIGRATION');
    await projectService.update('p1', { phase: 'DELTA_SYNC' } as never);
    expect(projectUpdates()).toHaveLength(1);
  });
});

describe('C-SAT gate on phaseService.update (phase auto-advance)', () => {
  const phaseRow = { id: '00000000-0000-0000-0000-000000000004', project_id: 'p1', phase_name: 'ONETIME_MIGRATION', status: 'IN_PROGRESS' };

  it('refuses to complete the phase when the advance would land on DELTA without a response', async () => {
    mockProject = project('ONETIME_MIGRATION');
    mockPhaseRow = phaseRow;
    mockNextPhase = 'DELTA';
    const err = await rejection(phaseService.update(phaseRow.id, { status: 'COMPLETED' } as never));
    expect(err.code).toBe('CSAT_REQUIRED');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('advances into DELTA and fires the Delta webhook once the customer answered', async () => {
    mockProject = project('ONETIME_MIGRATION');
    mockPhaseRow = phaseRow;
    mockNextPhase = 'DELTA';
    mockCsatRows = [answered];
    await phaseService.update(phaseRow.id, { status: 'COMPLETED' } as never);
    expect(mockExecute.mock.calls.some((c) => /UPDATE projects SET phase/.test(String(c[0])))).toBe(true);
    expect(mockNotifyDelta).toHaveBeenCalledWith('p1');
  });

  it('does not gate completing a phase whose next phase is not DELTA', async () => {
    mockProject = project('PILOT_MIGRATION');
    mockPhaseRow = { ...phaseRow, phase_name: 'PILOT_MIGRATION' };
    mockNextPhase = 'ONETIME_MIGRATION';
    await phaseService.update(phaseRow.id, { status: 'COMPLETED' } as never);
    expect(mockQuery.mock.calls.some((c) => /csat_requests/.test(String(c[0])))).toBe(false);
    expect(mockNotifyDelta).not.toHaveBeenCalled();
  });
});
