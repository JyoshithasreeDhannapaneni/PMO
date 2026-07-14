import { Request, Response } from 'express';
import { query, execute } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';

type CfSignalLevel = 'none' | 'moderate' | 'strong' | 'active';
interface CfSignal { level: CfSignalLevel; reason: string; }

// Keywords for chat/email-based signal detection
const CF_MANAGE_KW = [
  'cf manage', 'ongoing management', 'post-migration support', 'monthly support',
  'maintenance contract', 'managed support', 'management service',
];
const PS_KW = [
  'professional service', 'ps pack', 'ps bundle', 'consulting',
  'training', 'implementation service', 'customization', 'expert service',
  'advisory service', 'professional support',
];

function computeFromText(texts: string[]): { cfManage: CfSignal; ps: CfSignal } {
  const combined = texts.join(' ').toLowerCase();
  const cfManageHits = CF_MANAGE_KW.filter(kw => combined.includes(kw));
  const psHits = PS_KW.filter(kw => combined.includes(kw));

  return {
    cfManage: cfManageHits.length >= 2
      ? { level: 'strong', reason: `Communications mention: ${cfManageHits.slice(0, 2).join(', ')}` }
      : cfManageHits.length === 1
      ? { level: 'moderate', reason: `Communication mentions "${cfManageHits[0]}"` }
      : { level: 'none', reason: 'No CF Manage signals in communications' },
    ps: psHits.length >= 2
      ? { level: 'strong', reason: `Communications mention: ${psHits.slice(0, 2).join(', ')}` }
      : psHits.length === 1
      ? { level: 'moderate', reason: `Communication mentions "${psHits[0]}"` }
      : { level: 'none', reason: 'No Professional Services signals in communications' },
  };
}

export const customerSuccessController = {

  getView: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const [projectsResult, csEntriesResult, emailsResult] = await Promise.all([
      query(`
        SELECT id, name, customer_name, account_manager, project_manager,
               plan_type, status, phase, delay_status,
               is_escalated, escalation_priority, escalation_notes,
               is_overaged, overage_amount, overage_notes,
               migration_types, project_type, poc_outcome, planned_end, actual_end
        FROM projects
        WHERE status != 'CANCELLED'
        ORDER BY customer_name ASC, name ASC
      `),
      query(`SELECT * FROM customer_success_entries`),
      query(`
        SELECT subject, body_text, extracted_text
        FROM deal_desk_emails
        WHERE processed = true
        ORDER BY created_at DESC
        LIMIT 500
      `).catch(() => ({ rows: [] as any[] })),
    ]);

    // Build CS entry lookup by project_id (primary) then customer_name (legacy fallback)
    const csEntryByProjectId: Record<string, any> = {};
    const csEntryByCustomerName: Record<string, any> = {};
    for (const row of csEntriesResult.rows) {
      if (row.project_id) csEntryByProjectId[row.project_id] = row;
      if (row.customer_name) csEntryByCustomerName[(row.customer_name || '').toLowerCase()] = row;
    }

    // Build flattened email text pool for keyword matching
    const emailTexts: string[] = (emailsResult.rows as any[]).map((e: any) =>
      `${e.subject || ''} ${e.body_text || ''} ${e.extracted_text || ''}`.toLowerCase()
    );

    const renewalDue: any[] = [];
    const accounts: any[] = [];
    const upsellSignals: any[] = [];
    const crossSellSignals: any[] = [];
    const now = new Date();

    for (const row of projectsResult.rows) {
      const cse = csEntryByProjectId[row.id]
        || csEntryByCustomerName[(row.customer_name || '').toLowerCase()]
        || null;

      const isCompleted = row.status === 'COMPLETED';
      const isActive    = row.status === 'ACTIVE';
      const isPoc       = row.project_type === 'POC';
      const isPocWon    = isPoc && row.poc_outcome === 'won';

      // Renewal due: ACTIVE projects past their planned_end
      if (isActive && row.planned_end) {
        const plannedEnd = new Date(row.planned_end);
        if (plannedEnd < now) {
          renewalDue.push({
            id: row.id,
            name: row.name,
            customerName: row.customer_name,
            accountManager: row.account_manager || '',
            projectManager: row.project_manager || '',
            plannedEnd: row.planned_end,
            daysOverdue: Math.floor((now.getTime() - plannedEnd.getTime()) / 86_400_000),
            status: row.status,
            phase: row.phase,
            planType: row.plan_type,
            projectType: row.project_type || 'MIGRATION',
          });
        }
      }

      // CF Migrate: per-project status
      const cfMigrate = resolveSignal(cse?.cf_migrate_signal, cse?.cf_migrate_signal_reason,
        isCompleted
          ? { level: 'active', reason: 'Migration completed — renewal or expand opportunity' }
          : isActive && !isPoc
          ? { level: 'strong', reason: 'Active migration in flight' }
          : isPocWon
          ? { level: 'moderate', reason: 'POC won — ready to convert to migration' }
          : isActive && isPoc
          ? { level: 'moderate', reason: 'POC in progress' }
          : { level: 'none', reason: 'No migration activity' }
      );

      // Collect text signals from emails mentioning this customer or project
      const customerKey = (row.customer_name || '').toLowerCase();
      const projectKey  = (row.name || '').toLowerCase();
      const projectTexts: string[] = [];
      if (row.escalation_notes) projectTexts.push(row.escalation_notes.toLowerCase());
      if (row.overage_notes)    projectTexts.push(row.overage_notes.toLowerCase());
      if (cse?.csat_verbatim)   projectTexts.push(cse.csat_verbatim.toLowerCase());
      for (const emailText of emailTexts) {
        if (customerKey.length >= 4 && emailText.includes(customerKey)) {
          projectTexts.push(emailText);
        } else if (projectKey.length >= 4 && emailText.includes(projectKey)) {
          projectTexts.push(emailText);
        }
      }
      const textSignals = computeFromText(projectTexts);

      // CF Manage and PS: text-based when CF Migrate is active; fallback to project-data signals
      const cfManageComputed: CfSignal = cfMigrate.level !== 'none'
        ? textSignals.cfManage
        : computeCfManageFallback(row);

      const psComputed: CfSignal = cfMigrate.level !== 'none'
        ? textSignals.ps
        : computePsFallback(row);

      // Managed Services: based on completion + plan tier
      const planType = (row.plan_type || '').toUpperCase();
      const msComputed: CfSignal = isCompleted
        ? ['PLATINUM', 'GOLD'].includes(planType)
          ? { level: 'strong', reason: 'Completed Gold/Platinum migration — prime managed services candidate' }
          : { level: 'moderate', reason: 'Completed migration — introduce managed services' }
        : { level: 'none', reason: 'No completed migrations yet' };

      const cfManage         = resolveSignal(cse?.cf_manage_signal,  cse?.cf_manage_signal_reason,  cfManageComputed);
      const professionalSvcs = resolveSignal(cse?.cf_ps_signal,      cse?.cf_ps_signal_reason,      psComputed);
      const managedSvcs      = resolveSignal(cse?.cf_ms_signal,      cse?.cf_ms_signal_reason,      msComputed);

      const workloadTypes = (row.migration_types || '').split(',')
        .map((t: string) => t.trim()).filter(Boolean);

      const escalations = row.is_escalated ? [{
        projectId:   row.id,
        projectName: row.name,
        priority:    row.escalation_priority || 'MEDIUM',
        notes:       row.escalation_notes   || '',
        projectType: row.project_type || 'MIGRATION',
      }] : [];

      accounts.push({
        projectId:      row.id,
        projectName:    row.name,
        customerName:   row.customer_name,
        accountManager: row.account_manager || '',
        projectManager: row.project_manager || '',
        projectType:    row.project_type || 'MIGRATION',
        status:         row.status,
        planType:       row.plan_type || '',
        workloadTypes,
        isActive,
        isCompleted,
        pocOutcome: row.poc_outcome || null,
        csat: {
          score:            cse?.csat_score             ?? null,
          verbatim:         cse?.csat_verbatim          ?? null,
          migrationQuality: cse?.csat_migration_quality ?? null,
          supportExperience:cse?.csat_support_experience?? null,
          onboarding:       cse?.csat_onboarding        ?? null,
          date:             cse?.csat_date              ?? null,
        },
        cfMigrate,
        cfManage,
        professionalServices: professionalSvcs,
        managedServices:      managedSvcs,
        hasEscalations: !!row.is_escalated,
        escalationCount: row.is_escalated ? 1 : 0,
        escalations,
        plannedEnd: row.planned_end || null,
      });

      // Classify upsell / cross-sell (per-project)
      const cfMigrateActive = cfMigrate.level === 'active';
      const products = [
        { name: 'CF Migrate',            signal: cfMigrate,        isCfMigrate: true  },
        { name: 'CF Manage',             signal: cfManage,         isCfMigrate: false },
        { name: 'Professional Services', signal: professionalSvcs, isCfMigrate: false },
        { name: 'Managed Services',      signal: managedSvcs,      isCfMigrate: false },
      ];

      for (const p of products) {
        if (p.signal.level === 'active') continue;
        if (p.signal.level === 'none')   continue;

        const item = {
          projectId:      row.id,
          projectName:    row.name,
          customerName:   row.customer_name,
          accountManager: row.account_manager || '',
          product:        p.name,
          level:          p.signal.level,
          reason:         p.signal.reason,
        };

        if (cfMigrateActive && !p.isCfMigrate) {
          crossSellSignals.push(item);
        } else if (p.signal.level === 'strong') {
          upsellSignals.push(item);
        } else if (p.signal.level === 'moderate' && cfMigrate.level === 'none') {
          upsellSignals.push(item);
        }
      }
    }

    renewalDue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    upsellSignals.sort((a, b) => (a.level === 'strong' ? -1 : 1) - (b.level === 'strong' ? -1 : 1));

    const totalProjects  = projectsResult.rows.length;
    const totalCustomers = new Set(projectsResult.rows.map((r: any) => r.customer_name)).size;

    res.json({
      success: true,
      data: { accounts, renewalDue, upsellSignals, crossSellSignals },
      meta: { totalProjects, totalCustomers },
    });
  }),

  updateEntry: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const b = req.body;

    await execute(`
      INSERT INTO customer_success_entries (
        project_id, customer_name,
        csat_score, csat_verbatim, csat_migration_quality,
        csat_support_experience, csat_onboarding, csat_date,
        cf_migrate_signal, cf_migrate_signal_reason,
        cf_manage_signal,  cf_manage_signal_reason,
        cf_ps_signal,      cf_ps_signal_reason,
        cf_ms_signal,      cf_ms_signal_reason,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
      ON CONFLICT (project_id) DO UPDATE SET
        customer_name            = EXCLUDED.customer_name,
        csat_score               = EXCLUDED.csat_score,
        csat_verbatim            = EXCLUDED.csat_verbatim,
        csat_migration_quality   = EXCLUDED.csat_migration_quality,
        csat_support_experience  = EXCLUDED.csat_support_experience,
        csat_onboarding          = EXCLUDED.csat_onboarding,
        csat_date                = EXCLUDED.csat_date,
        cf_migrate_signal        = EXCLUDED.cf_migrate_signal,
        cf_migrate_signal_reason = EXCLUDED.cf_migrate_signal_reason,
        cf_manage_signal         = EXCLUDED.cf_manage_signal,
        cf_manage_signal_reason  = EXCLUDED.cf_manage_signal_reason,
        cf_ps_signal             = EXCLUDED.cf_ps_signal,
        cf_ps_signal_reason      = EXCLUDED.cf_ps_signal_reason,
        cf_ms_signal             = EXCLUDED.cf_ms_signal,
        cf_ms_signal_reason      = EXCLUDED.cf_ms_signal_reason,
        updated_at               = NOW()
    `, [
      projectId,
      b.customerName          ?? null,
      b.csatScore             ?? null,
      b.csatVerbatim          ?? null,
      b.csatMigrationQuality  ?? null,
      b.csatSupportExperience ?? null,
      b.csatOnboarding        ?? null,
      b.csatDate              ?? null,
      b.cfMigrateSignal       ?? 'none',
      b.cfMigrateSignalReason ?? null,
      b.cfManageSignal        ?? 'none',
      b.cfManageSignalReason  ?? null,
      b.cfPsSignal            ?? 'none',
      b.cfPsSignalReason      ?? null,
      b.cfMsSignal            ?? 'none',
      b.cfMsSignalReason      ?? null,
    ]);

    res.json({ success: true, message: 'Customer success entry updated' });
  }),
};

function resolveSignal(
  overrideLevel: string | null | undefined,
  overrideReason: string | null | undefined,
  computed: CfSignal,
): CfSignal {
  if (overrideLevel && overrideLevel !== 'none') {
    return { level: overrideLevel as CfSignalLevel, reason: overrideReason || computed.reason };
  }
  return computed;
}

function computeCfManageFallback(row: any): CfSignal {
  const plan = (row.plan_type || '').toUpperCase();
  if (['GOLD', 'PLATINUM'].includes(plan)) return { level: 'strong', reason: 'Gold/Platinum plan — strong candidate for ongoing management' };
  if (plan === 'SILVER') return { level: 'moderate', reason: 'Silver plan — explore management add-on' };
  return { level: 'none', reason: 'No CF Manage indicators' };
}

function computePsFallback(row: any): CfSignal {
  if (row.is_overaged) return { level: 'strong', reason: 'Project exceeded budget — professional services can prevent future overages' };
  if ((row.plan_type || '').toUpperCase() === 'PLATINUM') return { level: 'strong', reason: 'Platinum plan — professional services alignment expected' };
  return { level: 'none', reason: 'No Professional Services indicators' };
}
