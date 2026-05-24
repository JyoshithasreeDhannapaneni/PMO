import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { query, execute } from '../config/database';
import { authService } from '../services/authService';
import { v4 as uuidv4 } from 'uuid';

async function getUser(req: Request) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  return authService.getUserFromToken(token);
}

export const migrationChecklistController = {
  // GET /api/migration-checklists/:projectId
  getForProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const result = await query(
      `SELECT id, project_id, migration_type, phase, checklist_data, status,
              submitted_by, submitted_at, verified_by, verified_at, pm_notes,
              created_at, updated_at
       FROM migration_checklists
       WHERE project_id = $1
       ORDER BY migration_type, phase`,
      [projectId]
    );
    res.json({ success: true, data: result.rows.map(mapRow) });
  }),

  // PUT /api/migration-checklists/:projectId/:type/:phase
  save: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, type, phase } = req.params;
    const { checklistData } = req.body;

    const existing = await query(
      `SELECT id, status FROM migration_checklists WHERE project_id=$1 AND migration_type=$2 AND phase=$3`,
      [projectId, type, phase]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'pm_verified') {
        res.status(403).json({ success: false, message: 'Checklist already verified by PM — cannot edit.' });
        return;
      }
      await execute(
        `UPDATE migration_checklists SET checklist_data=$1, status='not_started', updated_at=NOW()
         WHERE project_id=$2 AND migration_type=$3 AND phase=$4`,
        [JSON.stringify(checklistData), projectId, type, phase]
      );
    } else {
      await execute(
        `INSERT INTO migration_checklists (id, project_id, migration_type, phase, checklist_data, status)
         VALUES ($1,$2,$3,$4,$5,'not_started')`,
        [uuidv4(), projectId, type, phase, JSON.stringify(checklistData)]
      );
    }

    const updated = await query(
      `SELECT * FROM migration_checklists WHERE project_id=$1 AND migration_type=$2 AND phase=$3`,
      [projectId, type, phase]
    );
    res.json({ success: true, data: mapRow(updated.rows[0]) });
  }),

  // POST /api/migration-checklists/:projectId/:type/:phase/submit
  submit: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, type, phase } = req.params;
    const user = await getUser(req);

    const existing = await query(
      `SELECT id, status FROM migration_checklists WHERE project_id=$1 AND migration_type=$2 AND phase=$3`,
      [projectId, type, phase]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Checklist not found. Save it first.' });
      return;
    }
    if (existing.rows[0].status === 'pm_verified') {
      res.status(400).json({ success: false, message: 'Already verified by PM.' });
      return;
    }

    await execute(
      `UPDATE migration_checklists
       SET status='engineer_submitted', submitted_by=$1, submitted_at=NOW(), updated_at=NOW()
       WHERE project_id=$2 AND migration_type=$3 AND phase=$4`,
      [user?.name || 'Unknown', projectId, type, phase]
    );

    const updated = await query(
      `SELECT * FROM migration_checklists WHERE project_id=$1 AND migration_type=$2 AND phase=$3`,
      [projectId, type, phase]
    );
    res.json({ success: true, data: mapRow(updated.rows[0]) });
  }),

  // POST /api/migration-checklists/:projectId/:type/:phase/verify
  verify: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, type, phase } = req.params;
    const { pmNotes, approved } = req.body;
    const user = await getUser(req);

    if (user?.role !== 'ADMIN' && user?.role !== 'PROJECT_MANAGER') {
      res.status(403).json({ success: false, message: 'Only Project Managers and Admins can verify checklists.' });
      return;
    }

    const existing = await query(
      `SELECT id, status FROM migration_checklists WHERE project_id=$1 AND migration_type=$2 AND phase=$3`,
      [projectId, type, phase]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Checklist not found.' });
      return;
    }
    if (existing.rows[0].status !== 'engineer_submitted') {
      res.status(400).json({ success: false, message: 'Checklist must be submitted by engineer first.' });
      return;
    }

    if (!approved) {
      await execute(
        `UPDATE migration_checklists
         SET status='not_started', pm_notes=$1, updated_at=NOW()
         WHERE project_id=$2 AND migration_type=$3 AND phase=$4`,
        [pmNotes || null, projectId, type, phase]
      );
    } else {
      await execute(
        `UPDATE migration_checklists
         SET status='pm_verified', verified_by=$1, verified_at=NOW(), pm_notes=$2, updated_at=NOW()
         WHERE project_id=$3 AND migration_type=$4 AND phase=$5`,
        [user?.name || 'Unknown', pmNotes || null, projectId, type, phase]
      );
    }

    const updated = await query(
      `SELECT * FROM migration_checklists WHERE project_id=$1 AND migration_type=$2 AND phase=$3`,
      [projectId, type, phase]
    );
    res.json({ success: true, data: mapRow(updated.rows[0]) });
  }),

  // POST /api/migration-checklists/:projectId/finalize
  finalize: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { migrationType } = req.body;
    const user = await getUser(req);

    if (user?.role !== 'ADMIN' && user?.role !== 'PROJECT_MANAGER') {
      res.status(403).json({ success: false, message: 'Only Project Managers and Admins can finalize.' });
      return;
    }

    const verified = await query(
      `SELECT phase FROM migration_checklists
       WHERE project_id=$1 AND migration_type=$2 AND status='pm_verified'`,
      [projectId, migrationType]
    );

    const verifiedPhases = verified.rows.map((r: any) => r.phase);
    if (!verifiedPhases.includes('onetime') || !verifiedPhases.includes('delta')) {
      res.status(400).json({
        success: false,
        message: 'Both One-Time and Delta phases must be PM-verified before finalizing.',
      });
      return;
    }

    await execute(`UPDATE projects SET phase='FINAL_VALIDATION' WHERE id=$1`, [projectId]);

    res.json({ success: true, message: 'Project moved to Final Validation.' });
  }),
};

function mapRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    migrationType: row.migration_type,
    phase: row.phase,
    checklistData: row.checklist_data || {},
    status: row.status,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    pmNotes: row.pm_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
