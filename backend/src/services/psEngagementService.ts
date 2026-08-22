import { query, execute } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export interface PsEngagementDTO {
  id: string;
  clientName: string;
  sowRefId?: string;
  clientContact?: string;
  clientContactEmail?: string;
  cfPsLead?: string;
  accountManager?: string;
  startDate?: string;
  endDate?: string;
  engagementType?: string;
  workloads?: string[];
  deliveryModel?: string;
  priority?: string;
  sowStatus?: string;
  engagementDescription?: string;
  clientObjectives?: string;
  successCriteria?: string;
  assumptions?: string;
  outOfScope?: string;
  lineItems?: any[];
  phases?: any[];
  signoffs?: any[];
  createdBy?: string;
}

function mapRow(row: any) {
  return {
    id: row.id,
    clientName: row.client_name,
    sowRefId: row.sow_ref_id,
    clientContact: row.client_contact,
    clientContactEmail: row.client_contact_email,
    cfPsLead: row.cf_ps_lead,
    accountManager: row.account_manager,
    startDate: row.start_date,
    endDate: row.end_date,
    engagementType: row.engagement_type,
    workloads: row.workloads || [],
    deliveryModel: row.delivery_model,
    priority: row.priority,
    sowStatus: row.sow_status,
    engagementDescription: row.engagement_description,
    clientObjectives: row.client_objectives,
    successCriteria: row.success_criteria,
    assumptions: row.assumptions,
    outOfScope: row.out_of_scope,
    lineItems: row.line_items || [],
    phases: row.phases || [],
    signoffs: row.signoffs || [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class PsEngagementService {
  async getAll() {
    const result = await query(`SELECT * FROM ps_engagements ORDER BY created_at DESC`);
    return result.rows.map(mapRow);
  }

  async getById(id: string) {
    const result = await query(`SELECT * FROM ps_engagements WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      throw new AppError('PS engagement not found', 404);
    }
    return mapRow(result.rows[0]);
  }

  async create(data: PsEngagementDTO) {
    if (!data.id || !data.clientName) {
      throw new AppError('id and clientName are required', 400);
    }
    const result = await query(
      `INSERT INTO ps_engagements (
        id, client_name, sow_ref_id, client_contact, client_contact_email,
        cf_ps_lead, account_manager, start_date, end_date, engagement_type,
        workloads, delivery_model, priority, sow_status, engagement_description,
        client_objectives, success_criteria, assumptions, out_of_scope,
        line_items, phases, signoffs, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      ) RETURNING *`,
      [
        data.id,
        data.clientName,
        data.sowRefId || null,
        data.clientContact || null,
        data.clientContactEmail || null,
        data.cfPsLead || null,
        data.accountManager || null,
        data.startDate || null,
        data.endDate || null,
        data.engagementType || null,
        JSON.stringify(data.workloads || []),
        data.deliveryModel || null,
        data.priority || null,
        data.sowStatus || 'Draft',
        data.engagementDescription || null,
        data.clientObjectives || null,
        data.successCriteria || null,
        data.assumptions || null,
        data.outOfScope || null,
        JSON.stringify(data.lineItems || []),
        JSON.stringify(data.phases || []),
        JSON.stringify(data.signoffs || []),
        data.createdBy || null,
      ]
    );
    return mapRow(result.rows[0]);
  }

  async update(id: string, data: Partial<PsEngagementDTO>) {
    const existing = await query(`SELECT id FROM ps_engagements WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      throw new AppError('PS engagement not found', 404);
    }

    const result = await query(
      `UPDATE ps_engagements SET
        client_name = $1, sow_ref_id = $2, client_contact = $3, client_contact_email = $4,
        cf_ps_lead = $5, account_manager = $6, start_date = $7, end_date = $8,
        engagement_type = $9, workloads = $10, delivery_model = $11, priority = $12,
        sow_status = $13, engagement_description = $14, client_objectives = $15,
        success_criteria = $16, assumptions = $17, out_of_scope = $18,
        line_items = $19, phases = $20, signoffs = $21, updated_at = NOW()
      WHERE id = $22 RETURNING *`,
      [
        data.clientName,
        data.sowRefId || null,
        data.clientContact || null,
        data.clientContactEmail || null,
        data.cfPsLead || null,
        data.accountManager || null,
        data.startDate || null,
        data.endDate || null,
        data.engagementType || null,
        JSON.stringify(data.workloads || []),
        data.deliveryModel || null,
        data.priority || null,
        data.sowStatus || 'Draft',
        data.engagementDescription || null,
        data.clientObjectives || null,
        data.successCriteria || null,
        data.assumptions || null,
        data.outOfScope || null,
        JSON.stringify(data.lineItems || []),
        JSON.stringify(data.phases || []),
        JSON.stringify(data.signoffs || []),
        id,
      ]
    );
    return mapRow(result.rows[0]);
  }

  async remove(id: string) {
    const result = await execute(`DELETE FROM ps_engagements WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      throw new AppError('PS engagement not found', 404);
    }
  }
}

export const psEngagementService = new PsEngagementService();
