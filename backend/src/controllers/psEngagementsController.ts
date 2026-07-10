import { Request, Response, NextFunction, RequestHandler } from 'express';
import { execute, query } from '../config/db';
import { logger } from '../utils/logger';

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const psEngagementsController = {
  getAll: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await query(
      `SELECT id, client_name, sow_ref_id, client_contact, client_contact_email,
              cf_ps_lead, account_manager, start_date, end_date, engagement_type,
              workloads, delivery_model, priority, sow_status, engagement_description,
              client_objectives, success_criteria, assumptions, out_of_scope,
              phases, signoffs, line_items, created_at, created_by
       FROM ps_engagements
       ORDER BY created_at DESC`,
      []
    );
    const rows = result.rows.map(r => ({
      id: r.id,
      clientName: r.client_name,
      sowRefId: r.sow_ref_id,
      clientContact: r.client_contact,
      clientContactEmail: r.client_contact_email,
      cfPsLead: r.cf_ps_lead,
      accountManager: r.account_manager,
      startDate: r.start_date,
      endDate: r.end_date,
      engagementType: r.engagement_type,
      workloads: r.workloads ?? [],
      deliveryModel: r.delivery_model,
      priority: r.priority,
      sowStatus: r.sow_status,
      engagementDescription: r.engagement_description,
      clientObjectives: r.client_objectives,
      successCriteria: r.success_criteria,
      assumptions: r.assumptions,
      outOfScope: r.out_of_scope,
      phases: r.phases ?? [],
      signoffs: r.signoffs ?? [],
      lineItems: r.line_items ?? [],
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));
    res.json({ success: true, data: rows });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const b = req.body;
    await execute(
      `INSERT INTO ps_engagements (
        id, client_name, sow_ref_id, client_contact, client_contact_email,
        cf_ps_lead, account_manager, start_date, end_date, engagement_type,
        workloads, delivery_model, priority, sow_status, engagement_description,
        client_objectives, success_criteria, assumptions, out_of_scope,
        phases, signoffs, line_items, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [
        b.id, b.clientName, b.sowRefId, b.clientContact, b.clientContactEmail,
        b.cfPsLead, b.accountManager, b.startDate, b.endDate, b.engagementType,
        JSON.stringify(b.workloads ?? []), b.deliveryModel, b.priority, b.sowStatus,
        b.engagementDescription, b.clientObjectives, b.successCriteria, b.assumptions,
        b.outOfScope, JSON.stringify(b.phases ?? []), JSON.stringify(b.signoffs ?? []),
        JSON.stringify(b.lineItems ?? []), b.createdBy ?? null,
      ]
    );
    logger.info(`PS engagement created: ${b.id} (${b.clientName})`);
    res.status(201).json({ success: true, message: 'Engagement created' });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const b = req.body;
    const result = await execute(
      `UPDATE ps_engagements SET
        client_name = $1, sow_ref_id = $2, client_contact = $3, client_contact_email = $4,
        cf_ps_lead = $5, account_manager = $6, start_date = $7, end_date = $8,
        engagement_type = $9, workloads = $10, delivery_model = $11, priority = $12,
        sow_status = $13, engagement_description = $14, client_objectives = $15,
        success_criteria = $16, assumptions = $17, out_of_scope = $18,
        phases = $19, signoffs = $20, line_items = $21, updated_at = NOW()
       WHERE id = $22`,
      [
        b.clientName, b.sowRefId, b.clientContact, b.clientContactEmail,
        b.cfPsLead, b.accountManager, b.startDate, b.endDate,
        b.engagementType, JSON.stringify(b.workloads ?? []), b.deliveryModel, b.priority,
        b.sowStatus, b.engagementDescription, b.clientObjectives,
        b.successCriteria, b.assumptions, b.outOfScope,
        JSON.stringify(b.phases ?? []), JSON.stringify(b.signoffs ?? []),
        JSON.stringify(b.lineItems ?? []),
        id,
      ]
    );
    if ((result as any).rowCount === 0) {
      res.status(404).json({ success: false, error: 'Engagement not found' });
      return;
    }
    logger.info(`PS engagement updated: ${id}`);
    res.json({ success: true, message: 'Engagement updated' });
  }),

  remove: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await execute(`DELETE FROM ps_engagements WHERE id = $1`, [id]);
    logger.info(`PS engagement deleted: ${id}`);
    res.json({ success: true, message: 'Engagement deleted' });
  }),
};
