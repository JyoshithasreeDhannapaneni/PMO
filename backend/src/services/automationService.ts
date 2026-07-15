import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { notificationService, resolveRecipients, Project } from './notificationService';
import { projectService } from './projectService';

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  triggerLabel: string;
  action: string;
  actionLabel: string;
  actionDetail: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

function mapRuleRow(row: any): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger_key,
    triggerLabel: row.trigger_label,
    action: row.action_key,
    actionLabel: row.action_label,
    actionDetail: row.action_detail,
    enabled: !!row.enabled,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
  };
}

class AutomationService {
  async listRules(): Promise<AutomationRule[]> {
    const result = await query(`SELECT * FROM automation_rules ORDER BY created_at ASC`, []);
    return result.rows.map(mapRuleRow);
  }

  async createRule(data: {
    name: string;
    trigger: string;
    triggerLabel: string;
    action: string;
    actionLabel: string;
    actionDetail?: string | null;
  }): Promise<AutomationRule> {
    const id = `custom_${Date.now()}`;
    await execute(
      `INSERT INTO automation_rules (id, name, trigger_key, trigger_label, action_key, action_label, action_detail, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [id, data.name, data.trigger, data.triggerLabel, data.action, data.actionLabel, data.actionDetail || null]
    );
    const result = await query(`SELECT * FROM automation_rules WHERE id = $1`, [id]);
    return mapRuleRow(result.rows[0]);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await execute(`UPDATE automation_rules SET enabled = $1 WHERE id = $2`, [enabled, id]);
  }

  async deleteRule(id: string): Promise<void> {
    await execute(`DELETE FROM automation_rules WHERE id = $1`, [id]);
  }

  /** Fire all enabled rules matching a trigger key. Never throws — automation failures must not break the caller's flow. */
  async emit(triggerKey: string, project?: Project | null): Promise<void> {
    try {
      const result = await query(
        `SELECT * FROM automation_rules WHERE trigger_key = $1 AND enabled = true`,
        [triggerKey]
      );
      for (const row of result.rows) {
        const rule = mapRuleRow(row);
        try {
          await this.runAction(rule, project);
          await execute(`UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1`, [rule.id]);
        } catch (err) {
          logger.error(`Automation rule "${rule.name}" (${rule.action}) failed: ${err}`);
        }
      }
    } catch (err) {
      logger.error(`Automation emit(${triggerKey}) failed: ${err}`);
    }
  }

  /** Run all enabled rules for a scheduled trigger (daily/weekly/monthly) across every active project. */
  async runScheduled(period: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    const rules = (await query(
      `SELECT * FROM automation_rules WHERE trigger_key = $1 AND enabled = true`,
      [period]
    )).rows.map(mapRuleRow);
    if (rules.length === 0) return;

    const activeProjects = (await projectService.getAll({ status: 'ACTIVE' }, { page: 1, limit: 500 })).projects;
    for (const rule of rules) {
      try {
        if (rule.action === 'update_delay_status') {
          await projectService.updateAllDelays();
        } else {
          for (const project of activeProjects) {
            await this.runAction(rule, project as unknown as Project);
          }
        }
        await execute(`UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1`, [rule.id]);
      } catch (err) {
        logger.error(`Scheduled automation rule "${rule.name}" (${rule.action}) failed: ${err}`);
      }
    }
  }

  private async runAction(rule: AutomationRule, project?: Project | null): Promise<void> {
    switch (rule.action) {
      case 'update_delay_status':
        await projectService.updateAllDelays();
        return;

      case 'send_email': {
        if (!project) return;
        const recipients = rule.actionDetail ? [rule.actionDetail] : await resolveRecipients(project);
        if (recipients.length === 0) return;
        await notificationService.createNotification(
          'GENERAL',
          `[Automation] ${rule.name}`,
          `Automation rule "${rule.name}" triggered for project "${project.name}".`,
          recipients,
          project.id
        );
        return;
      }

      case 'create_notification': {
        if (!project) return;
        const recipients = await resolveRecipients(project);
        if (recipients.length === 0) return;
        await notificationService.createNotification(
          'GENERAL',
          `[Automation] ${rule.name}`,
          `Automation rule "${rule.name}" triggered for project "${project.name}".`,
          recipients,
          project.id
        );
        return;
      }

      case 'notify_manager': {
        if (!project) return;
        const recipients = await resolveRecipients({ ...project, accountManager: '' } as Project);
        if (recipients.length === 0) return;
        await notificationService.createNotification(
          'GENERAL',
          `[Automation] ${rule.name}`,
          `Automation rule "${rule.name}" triggered for project "${project.name}". Assigned manager: ${project.projectManager}.`,
          recipients,
          project.id
        );
        return;
      }

      case 'flag_risk': {
        if (!project) return;
        await execute(
          `UPDATE projects SET delay_status = 'AT_RISK' WHERE id = $1 AND delay_status = 'NOT_DELAYED'`,
          [project.id]
        );
        return;
      }

      case 'escalate_project': {
        if (!project) return;
        await execute(
          `UPDATE projects SET is_escalated = true, escalation_priority = COALESCE(escalation_priority, 'MEDIUM'), escalated_at = NOW()
           WHERE id = $1 AND is_escalated = false`,
          [project.id]
        );
        return;
      }

      case 'remind_case_study':
        if (!project) return;
        await notificationService.notifyCaseStudyReminder(project);
        return;

      case 'export_report': {
        const recipients = rule.actionDetail ? [rule.actionDetail] : [];
        if (recipients.length === 0) return;
        await notificationService.createNotification(
          'GENERAL',
          `[Automation] ${rule.name}`,
          `Automation rule "${rule.name}" ran. Open the Reports/Export page to download the latest data.`,
          recipients
        );
        return;
      }

      default:
        logger.warn(`Unknown automation action: ${rule.action}`);
    }
  }
}

export const automationService = new AutomationService();
