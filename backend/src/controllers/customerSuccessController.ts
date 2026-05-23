import { Request, Response } from 'express';
import { query, execute } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';

type CfSignalLevel = 'none' | 'moderate' | 'strong' | 'active';
interface CfSignal { level: CfSignalLevel; reason: string; }

export const customerSuccessController = {

  getView: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const [projectsResult, csEntriesResult] = await Promise.all([
      query(`
        SELECT id, name, customer_name, account_manager, project_manager,
               plan_type, status, phase, delay_status,
               is_escalated, escalation_priority, escalation_notes,
               is_overaged, overage_amount, migration_types,
               project_type, poc_outcome, planned_end, actual_end
        FROM projects
        WHERE status NOT IN ('CANCELLED','DECOMMISSIONED')
        ORDER BY customer_name ASC
      `),
      query(`SELECT * FROM customer_success_entries`),
    ]);

    const csEntryMap: Record<string, any> = {};
    for (const row of csEntriesResult.rows) {
      csEntryMap[(row.customer_name || '').toLowerCase()] = row;
    }

    const customerMap: Record<string, any> = {};
    const now = new Date();

    for (const row of projectsResult.rows) {
      const key = (row.customer_name || '').toLowerCase();
      if (!customerMap[key]) {
        customerMap[key] = { customerName: row.customer_name, accountManager: row.account_manager || '', projects: [] };
      }
      customerMap[key].projects.push(row);
      if (!customerMap[key].accountManager && row.account_manager) {
        customerMap[key].accountManager = row.account_manager;
      }
    }

    const renewalDue: any[] = [];
    const accounts: any[] = [];
    const upsellSignals: any[] = [];
    const crossSellSignals: any[] = [];

    for (const entry of Object.values(customerMap) as any[]) {
      const projects = entry.projects as any[];
      const cse = csEntryMap[entry.customerName.toLowerCase()] || null;

      const completedProjects = projects.filter(p => p.status === 'COMPLETED');
      const activeProjects    = projects.filter(p => p.status === 'ACTIVE');
      const pocWon            = projects.some(p => p.project_type === 'POC' && p.poc_outcome === 'won');
      const escalations       = projects.filter(p => p.is_escalated);
      const overaged          = projects.filter(p => p.is_overaged);

      // Renewal due: ACTIVE projects past their planned_end
      for (const p of activeProjects) {
        if (p.planned_end) {
          const plannedEnd = new Date(p.planned_end);
          if (plannedEnd < now) {
            const daysOverdue = Math.floor((now.getTime() - plannedEnd.getTime()) / 86_400_000);
            renewalDue.push({
              id: p.id,
              name: p.name,
              customerName: p.customer_name,
              accountManager: p.account_manager || '',
              projectManager: p.project_manager || '',
              plannedEnd: p.planned_end,
              daysOverdue,
              status: p.status,
              phase: p.phase,
              planType: p.plan_type,
            });
          }
        }
      }

      const cfMigrate          = resolveSignal(cse?.cf_migrate_signal, cse?.cf_migrate_signal_reason, computeCfMigrate(completedProjects, activeProjects, pocWon));
      const cfManage           = resolveSignal(cse?.cf_manage_signal,  cse?.cf_manage_signal_reason,  computeCfManage(completedProjects));
      const professionalSvcs   = resolveSignal(cse?.cf_ps_signal,      cse?.cf_ps_signal_reason,      computeProfessionalServices(projects, overaged));
      const managedSvcs        = resolveSignal(cse?.cf_ms_signal,      cse?.cf_ms_signal_reason,      computeManagedServices(completedProjects));

      const workloadTypes = Array.from(new Set(
        projects.flatMap(p => (p.migration_types || '').split(',').map((t: string) => t.trim())).filter(Boolean)
      )) as string[];

      accounts.push({
        customerName: entry.customerName,
        accountManager: entry.accountManager,
        workloadTypes,
        activeProjects: activeProjects.length,
        completedProjects: completedProjects.length,
        csat: {
          score:            cse?.csat_score            ?? null,
          verbatim:         cse?.csat_verbatim         ?? null,
          migrationQuality: cse?.csat_migration_quality ?? null,
          supportExperience:cse?.csat_support_experience?? null,
          onboarding:       cse?.csat_onboarding       ?? null,
          date:             cse?.csat_date             ?? null,
        },
        cfMigrate,
        cfManage,
        professionalServices: professionalSvcs,
        managedServices:      managedSvcs,
        hasEscalations: escalations.length > 0,
        escalationCount: escalations.length,
        escalations: escalations.map(e => ({
          projectId:   e.id,
          projectName: e.name,
          priority:    e.escalation_priority || 'MEDIUM',
          notes:       e.escalation_notes   || '',
        })),
      });

      // Classify upsell / cross-sell
      const hasActive = [cfMigrate, cfManage, professionalSvcs, managedSvcs].some(s => s.level === 'active');
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
          customerName:   entry.customerName,
          accountManager: entry.accountManager,
          product:        p.name,
          level:          p.signal.level,
          reason:         p.signal.reason,
        };

        // Cross-sell: customer already uses CF Migrate + signal is for another product
        if (cfMigrateActive && !p.isCfMigrate) {
          crossSellSignals.push(item);
        } else if (p.signal.level === 'strong') {
          // Upsell: strong signal to close on any product not yet active
          upsellSignals.push(item);
        } else if (p.signal.level === 'moderate' && !hasActive) {
          upsellSignals.push(item);
        }
      }
    }

    renewalDue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    upsellSignals.sort((a, b) => (a.level === 'strong' ? -1 : 1) - (b.level === 'strong' ? -1 : 1));

    res.json({ success: true, data: { accounts, renewalDue, upsellSignals, crossSellSignals } });
  }),

  updateEntry: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { customerName } = req.params;
    const b = req.body;

    await execute(`
      INSERT INTO customer_success_entries (
        customer_name,
        csat_score, csat_verbatim, csat_migration_quality,
        csat_support_experience, csat_onboarding, csat_date,
        cf_migrate_signal, cf_migrate_signal_reason,
        cf_manage_signal,  cf_manage_signal_reason,
        cf_ps_signal,      cf_ps_signal_reason,
        cf_ms_signal,      cf_ms_signal_reason,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
      ON CONFLICT (customer_name) DO UPDATE SET
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
      customerName,
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

function computeCfMigrate(completed: any[], active: any[], pocWon: boolean): CfSignal {
  if (completed.length > 0) return { level: 'active',   reason: `${completed.length} migration(s) completed — renewal or expand opportunity` };
  if (active.length > 0)    return { level: 'strong',   reason: `${active.length} active migration(s) in flight` };
  if (pocWon)                return { level: 'moderate', reason: 'POC won — ready to convert to migration' };
  return { level: 'none', reason: 'No migrations yet' };
}

function computeCfManage(completed: any[]): CfSignal {
  const goldPlat = completed.filter(p => ['GOLD', 'PLATINUM'].includes((p.plan_type || '').toUpperCase()));
  const silver   = completed.filter(p => (p.plan_type || '').toUpperCase() === 'SILVER');
  if (goldPlat.length > 0) return { level: 'strong',   reason: `${goldPlat.length} Gold/Platinum migration(s) — strong candidate for ongoing management` };
  if (silver.length > 0)   return { level: 'moderate', reason: `${silver.length} Silver migration(s) — explore management add-on` };
  return { level: 'none', reason: 'No eligible completed plans' };
}

function computeProfessionalServices(all: any[], overaged: any[]): CfSignal {
  const platinum = all.filter(p => (p.plan_type || '').toUpperCase() === 'PLATINUM');
  if (overaged.length > 0) return { level: 'strong',   reason: `${overaged.length} project(s) exceeded budget — professional services can prevent future overages` };
  if (platinum.length > 0) return { level: 'strong',   reason: 'Platinum plan — professional services alignment expected' };
  if (all.length > 1)      return { level: 'moderate', reason: `${all.length} projects across portfolio — PS bundle conversation` };
  return { level: 'none', reason: 'No PS indicators' };
}

function computeManagedServices(completed: any[]): CfSignal {
  if (completed.length >= 3) return { level: 'strong',   reason: `${completed.length} completed migrations — strong fit for long-term managed services` };
  if (completed.length >= 1) return { level: 'moderate', reason: `${completed.length} completed migration(s) — introduce managed services` };
  return { level: 'none', reason: 'No completed migrations yet' };
}
