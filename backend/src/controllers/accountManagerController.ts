import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { calculateDelay } from '../utils/delayCalculator';

export const accountManagerController = {
  getView: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await query(`
      SELECT
        customer_name,
        account_manager,
        project_type,
        id,
        name,
        phase,
        status,
        delay_status,
        delay_days,
        plan_type,
        planned_start,
        planned_end,
        actual_start,
        actual_end,
        migration_types,
        is_escalated,
        escalation_priority,
        project_manager,
        poc_qualification_status,
        poc_env_setup_status,
        poc_trial_status,
        poc_validation_status,
        poc_outcome_status,
        poc_outcome,
        poc_deadline,
        poc_handoff_to,
        poc_handoff_date,
        customer_contact
      FROM projects
      WHERE status != 'CANCELLED'
      ORDER BY customer_name ASC, project_type ASC
    `);

    const rows = result.rows;

    // Group by customer_name
    const customerMap: Record<string, any> = {};

    for (const row of rows) {
      const key = (row.customer_name || '').toLowerCase();
      if (!customerMap[key]) {
        customerMap[key] = {
          customerName: row.customer_name,
          accountManager: row.account_manager || '',
          pocTrack: null,
          migrationTracks: [],
          handoffDate: null,
          handoffBy: null,
          needsAttention: false,
          attentionReasons: [] as string[],
        };
      }

      const entry = customerMap[key];

      if (row.project_type === 'POC') {
        entry.pocTrack = mapProjectRow(row);

        // Attention checks for POC
        if (row.poc_deadline) {
          const hoursLeft = (new Date(row.poc_deadline).getTime() - Date.now()) / 3_600_000;
          if (hoursLeft < 48 && hoursLeft > 0 && row.poc_outcome_status !== 'completed') {
            entry.attentionReasons.push(`POC deadline in ${Math.round(hoursLeft)}h — no sign-off`);
          }
        }
        const pocStatuses = [
          row.poc_qualification_status,
          row.poc_env_setup_status,
          row.poc_trial_status,
          row.poc_validation_status,
          row.poc_outcome_status,
        ];
        if (pocStatuses.includes('blocked')) {
          entry.attentionReasons.push('POC phase blocked');
        }

        if (row.poc_handoff_date) entry.handoffDate = row.poc_handoff_date;
        if (row.poc_handoff_to) entry.handoffBy = row.poc_handoff_to;
      } else {
        entry.migrationTracks.push(mapProjectRow(row));
        if (!entry.accountManager && row.account_manager) {
          entry.accountManager = row.account_manager;
        }

        // Attention checks for migration (use live computed delay)
        const track = entry.migrationTracks[entry.migrationTracks.length - 1];
        if (track?.delayStatus === 'DELAYED') {
          entry.attentionReasons.push(`Migration delayed ${track.delayDays} days`);
        }
        if (row.is_escalated) {
          entry.attentionReasons.push(`Escalated (${row.escalation_priority || 'MEDIUM'})`);
        }
      }
    }

    const accounts = Object.values(customerMap).map((entry: any) => ({
      ...entry,
      // migrationTrack kept for backwards compatibility (first/primary project)
      migrationTrack: entry.migrationTracks[0] ?? null,
      needsAttention: entry.attentionReasons.length > 0,
    }));

    // Sort: attention first, then alphabetically
    accounts.sort((a: any, b: any) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
      return (a.customerName || '').localeCompare(b.customerName || '');
    });

    const totalProjects = rows.length;
    const totalCustomers = accounts.length;

    res.json({ success: true, data: accounts, meta: { totalProjects, totalCustomers } });
  }),
};

function mapProjectRow(row: any) {
  // Compute delay live so it's always accurate (never stale from DB)
  let liveDelayStatus = row.delay_status;
  let liveDelayDays   = Number(row.delay_days) || 0;
  let expectedEnd: string | null = null;

  if (row.planned_start && row.planned_end) {
    const ps = new Date(row.planned_start);
    const pe = new Date(row.planned_end);
    const as = row.actual_start ? new Date(row.actual_start) : null;
    const extEnd = row.extended_end_date ? new Date(row.extended_end_date) : null;
    expectedEnd = (extEnd || pe).toISOString().split('T')[0];

    // Only pass actualEnd for truly finished projects — ACTIVE/ON_HOLD projects
    // may have actualEnd filled as "expected end" by users, which would cause
    // calculateDelay to treat them as completed (always NOT_DELAYED).
    const isFinished = row.status === 'COMPLETED' || row.status === 'CANCELLED' || row.status === 'INACTIVE' || row.phase === 'COMPLETED';
    if (isFinished) {
      // Freeze at whatever was last stored — inactive/completed projects should
      // stop accruing delay days rather than keep counting against today's date.
      liveDelayStatus = row.delay_status;
      liveDelayDays   = Number(row.delay_days) || 0;
      expectedEnd = (extEnd || pe).toISOString().split('T')[0];
    } else {
      const result = calculateDelay(ps, pe, as, null, new Date(), extEnd);
      liveDelayStatus = result.delayStatus;
      liveDelayDays   = result.delayDays;
    }
  }

  return {
    id: row.id,
    name: row.name,
    customerName: row.customer_name,
    projectManager: row.project_manager,
    accountManager: row.account_manager,
    phase: row.phase,
    status: row.status,
    delayStatus: liveDelayStatus,
    delayDays: liveDelayDays,
    expectedEnd,
    planType: row.plan_type,
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    migrationTypes: row.migration_types,
    isEscalated: !!row.is_escalated,
    escalationPriority: row.escalation_priority ?? null,
    projectType: row.project_type ?? 'MIGRATION',
    pocQualificationStatus: row.poc_qualification_status ?? 'not_started',
    pocEnvSetupStatus: row.poc_env_setup_status ?? 'not_started',
    pocTrialStatus: row.poc_trial_status ?? 'not_started',
    pocValidationStatus: row.poc_validation_status ?? 'not_started',
    pocOutcomeStatus: row.poc_outcome_status ?? 'not_started',
    pocOutcome: row.poc_outcome ?? null,
    pocDeadline: row.poc_deadline ?? null,
    pocHandoffTo: row.poc_handoff_to ?? null,
    pocHandoffDate: row.poc_handoff_date ?? null,
    customerContact: row.customer_contact ?? null,
  };
}
