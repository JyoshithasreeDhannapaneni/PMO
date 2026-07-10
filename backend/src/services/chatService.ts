import Anthropic from '@anthropic-ai/sdk';
import { query } from '../config/db';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT = `You are the CloudFuze PMO Assistant — an AI embedded in CloudFuze's internal PMO Tracker.

CloudFuze is a cloud migration company. The PMO Tracker manages:
- Projects: cloud migration engagements (ENT = Enterprise, SMB = Small-Medium Business)
- Phases: KICKOFF → MIGRATION → VALIDATION → CLOSURE
- Plan types: BRONZE, SILVER, GOLD, PLATINUM
- Delay status: DELAYED, AT_RISK, NOT_DELAYED (delay_days = days behind schedule)
- Project Managers (PMs) who run migrations; Account Managers (AMs) who own customer relationships
- CSAT: customer satisfaction scores on a 1–5 scale, stored per project
- Escalations: high-urgency projects flagged with is_escalated = true
- Overages: projects exceeding contracted scope (is_overaged = true)
- Professional Services: SOW-based engagements in a separate ps_engagements table

You have access to live database tools. Always use them before answering questions about project data.

Rules:
- Be concise and precise — return numbers and names, not filler text
- Use markdown tables for comparisons and lists
- Apply every filter the user mentions (e.g. "for Joy" → filter by account_manager = Joy)
- Escalations are highest priority — always bold or highlight them clearly
- Never invent data — only report what tools return
- If a question is ambiguous, ask one clarifying question before querying`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_dashboard_kpis',
    description: 'Top-level KPIs: total projects, active, delayed, at-risk, escalated, overaged, completed, avg CSAT.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_projects_summary',
    description: 'Aggregated counts grouped by status/delay/plan — for "how many" questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'ACTIVE | INACTIVE | ON_HOLD | COMPLETED | CANCELLED' },
        project_manager: { type: 'string', description: 'PM name (partial match)' },
        account_manager: { type: 'string', description: 'AM name (partial match)' },
        delay_status: { type: 'string', description: 'DELAYED | AT_RISK | NOT_DELAYED' },
        plan_type: { type: 'string', description: 'BRONZE | SILVER | GOLD | PLATINUM' },
        customer_name: { type: 'string', description: 'Customer name (partial match)' },
      },
      required: [],
    },
  },
  {
    name: 'get_projects_list',
    description: 'List individual projects with details. For "show me" or "which projects" questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search project name or customer name' },
        status: { type: 'string', description: 'ACTIVE | INACTIVE | ON_HOLD | COMPLETED | CANCELLED' },
        project_manager: { type: 'string', description: 'PM name filter' },
        account_manager: { type: 'string', description: 'AM name filter' },
        delay_status: { type: 'string', description: 'DELAYED | AT_RISK | NOT_DELAYED' },
        plan_type: { type: 'string', description: 'BRONZE | SILVER | GOLD | PLATINUM' },
        is_escalated: { type: 'boolean', description: 'true = escalated only' },
        is_overaged: { type: 'boolean', description: 'true = overaged only' },
        limit: { type: 'number', description: 'Max results (default 15, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_manager_performance',
    description: 'Performance stats per manager: total, active, delayed, escalated, overaged, avg CSAT.',
    input_schema: {
      type: 'object' as const,
      properties: {
        manager_type: { type: 'string', description: 'project_manager or account_manager' },
        manager_name: { type: 'string', description: 'Specific manager name (optional)' },
      },
      required: ['manager_type'],
    },
  },
  {
    name: 'get_escalations',
    description: 'All currently escalated projects with priority, PM, AM, and notes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_manager: { type: 'string', description: 'PM name filter' },
        account_manager: { type: 'string', description: 'AM name filter' },
      },
      required: [],
    },
  },
  {
    name: 'get_renewal_overdue',
    description: 'Active/on-hold projects past their planned end date — likely needing renewal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        account_manager: { type: 'string', description: 'AM name filter' },
      },
      required: [],
    },
  },
  {
    name: 'get_csat_by_manager',
    description: 'Average CSAT scores grouped by project manager or account manager.',
    input_schema: {
      type: 'object' as const,
      properties: {
        group_by: { type: 'string', description: 'project_manager or account_manager' },
      },
      required: ['group_by'],
    },
  },
  {
    name: 'get_ps_engagements',
    description: 'List Professional Services engagements (SOW-based, separate from migration projects).',
    input_schema: {
      type: 'object' as const,
      properties: {
        cf_ps_lead: { type: 'string', description: 'PS lead name filter' },
        account_manager: { type: 'string', description: 'AM name filter' },
        client_name: { type: 'string', description: 'Client name filter' },
      },
      required: [],
    },
  },
];

async function execTool(name: string, input: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case 'get_dashboard_kpis': {
        const r = await query(`
          SELECT
            COUNT(*) FILTER (WHERE archived_at IS NULL)                                  AS total,
            COUNT(*) FILTER (WHERE status = 'ACTIVE'     AND archived_at IS NULL)        AS active,
            COUNT(*) FILTER (WHERE delay_status = 'DELAYED' AND archived_at IS NULL)     AS delayed,
            COUNT(*) FILTER (WHERE delay_status = 'AT_RISK'  AND archived_at IS NULL)    AS at_risk,
            COUNT(*) FILTER (WHERE is_escalated = true   AND archived_at IS NULL)        AS escalated,
            COUNT(*) FILTER (WHERE is_overaged  = true   AND archived_at IS NULL)        AS overaged,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')                                 AS completed,
            ROUND(AVG(csat_score) FILTER (WHERE csat_score IS NOT NULL), 2)              AS avg_csat
          FROM projects
        `);
        return JSON.stringify(r.rows[0]);
      }

      case 'get_projects_summary': {
        const conds: string[] = ['archived_at IS NULL'];
        const params: any[] = [];
        let p = 1;
        if (input.status)           { conds.push(`status = $${p++}`);                              params.push(input.status); }
        if (input.project_manager)  { conds.push(`project_manager ILIKE $${p++}`);                 params.push(`%${input.project_manager}%`); }
        if (input.account_manager)  { conds.push(`account_manager ILIKE $${p++}`);                 params.push(`%${input.account_manager}%`); }
        if (input.delay_status)     { conds.push(`delay_status = $${p++}`);                        params.push(input.delay_status); }
        if (input.plan_type)        { conds.push(`plan_type = $${p++}`);                           params.push(input.plan_type); }
        if (input.customer_name)    { conds.push(`customer_name ILIKE $${p++}`);                   params.push(`%${input.customer_name}%`); }
        const w = conds.join(' AND ');
        const [tot, byStatus, byDelay, byPlan] = await Promise.all([
          query(`SELECT COUNT(*) AS total FROM projects WHERE ${w}`, params),
          query(`SELECT status, COUNT(*) AS cnt FROM projects WHERE ${w} GROUP BY status ORDER BY cnt DESC`, params),
          query(`SELECT delay_status, COUNT(*) AS cnt FROM projects WHERE ${w} GROUP BY delay_status ORDER BY cnt DESC`, params),
          query(`SELECT plan_type, COUNT(*) AS cnt FROM projects WHERE ${w} GROUP BY plan_type ORDER BY cnt DESC`, params),
        ]);
        return JSON.stringify({
          total: tot.rows[0]?.total,
          by_status: byStatus.rows,
          by_delay: byDelay.rows,
          by_plan: byPlan.rows,
          filters_applied: input,
        });
      }

      case 'get_projects_list': {
        const conds: string[] = ['archived_at IS NULL'];
        const params: any[] = [];
        let p = 1;
        if (input.status)           { conds.push(`status = $${p++}`);                             params.push(input.status); }
        if (input.project_manager)  { conds.push(`project_manager ILIKE $${p++}`);                params.push(`%${input.project_manager}%`); }
        if (input.account_manager)  { conds.push(`account_manager ILIKE $${p++}`);                params.push(`%${input.account_manager}%`); }
        if (input.delay_status)     { conds.push(`delay_status = $${p++}`);                       params.push(input.delay_status); }
        if (input.plan_type)        { conds.push(`plan_type = $${p++}`);                          params.push(input.plan_type); }
        if (input.is_escalated === true) { conds.push(`is_escalated = true`); }
        if (input.is_overaged === true)  { conds.push(`is_overaged = true`); }
        if (input.search) {
          conds.push(`(name ILIKE $${p} OR customer_name ILIKE $${p})`);
          params.push(`%${input.search}%`); p++;
        }
        const lim = Math.min(Number(input.limit) || 15, 50);
        const r = await query(
          `SELECT name, customer_name, project_manager, account_manager, status, phase,
                  delay_status, delay_days, plan_type, csat_score, is_escalated, is_overaged,
                  planned_end, migration_types
           FROM projects WHERE ${conds.join(' AND ')}
           ORDER BY is_escalated DESC, delay_status, customer_name
           LIMIT $${p}`,
          [...params, lim]
        );
        return JSON.stringify({ projects: r.rows, count: r.rows.length });
      }

      case 'get_manager_performance': {
        const field = input.manager_type === 'account_manager' ? 'account_manager' : 'project_manager';
        const conds: string[] = [`${field} IS NOT NULL`, 'archived_at IS NULL'];
        const params: any[] = [];
        let p = 1;
        if (input.manager_name) { conds.push(`${field} ILIKE $${p++}`); params.push(`%${input.manager_name}%`); }
        const r = await query(
          `SELECT ${field} AS manager,
                  COUNT(*)                                                      AS total,
                  COUNT(*) FILTER (WHERE status = 'ACTIVE')                     AS active,
                  COUNT(*) FILTER (WHERE delay_status = 'DELAYED')              AS delayed,
                  COUNT(*) FILTER (WHERE is_escalated = true)                   AS escalated,
                  COUNT(*) FILTER (WHERE is_overaged = true)                    AS overaged,
                  COUNT(*) FILTER (WHERE status = 'COMPLETED')                  AS completed,
                  ROUND(AVG(csat_score) FILTER (WHERE csat_score IS NOT NULL), 2) AS avg_csat,
                  ROUND(AVG(delay_days) FILTER (WHERE delay_days > 0), 1)       AS avg_delay_days
           FROM projects WHERE ${conds.join(' AND ')}
           GROUP BY ${field}
           ORDER BY total DESC`,
          params
        );
        return JSON.stringify({ managers: r.rows, manager_type: input.manager_type });
      }

      case 'get_escalations': {
        const conds: string[] = ['is_escalated = true', 'archived_at IS NULL'];
        const params: any[] = [];
        let p = 1;
        if (input.project_manager) { conds.push(`project_manager ILIKE $${p++}`); params.push(`%${input.project_manager}%`); }
        if (input.account_manager) { conds.push(`account_manager ILIKE $${p++}`); params.push(`%${input.account_manager}%`); }
        const r = await query(
          `SELECT name, customer_name, project_manager, account_manager, status, phase,
                  escalation_priority, delay_status, delay_days, planned_end, escalation_notes
           FROM projects WHERE ${conds.join(' AND ')}
           ORDER BY escalation_priority NULLS LAST, customer_name`,
          params
        );
        return JSON.stringify({ escalations: r.rows, count: r.rows.length });
      }

      case 'get_renewal_overdue': {
        const conds: string[] = [
          "status NOT IN ('COMPLETED','CANCELLED')",
          'planned_end < NOW()',
          'archived_at IS NULL',
        ];
        const params: any[] = [];
        let p = 1;
        if (input.account_manager) { conds.push(`account_manager ILIKE $${p++}`); params.push(`%${input.account_manager}%`); }
        const r = await query(
          `SELECT name, customer_name, account_manager, project_manager, status, phase, planned_end,
                  FLOOR(EXTRACT(EPOCH FROM (NOW() - planned_end)) / 86400) AS days_overdue
           FROM projects WHERE ${conds.join(' AND ')}
           ORDER BY planned_end ASC`,
          params
        );
        return JSON.stringify({ projects: r.rows, count: r.rows.length });
      }

      case 'get_csat_by_manager': {
        const field = input.group_by === 'account_manager' ? 'account_manager' : 'project_manager';
        const r = await query(
          `SELECT ${field} AS manager,
                  ROUND(AVG(csat_score), 2)                                       AS avg_csat,
                  COUNT(*) FILTER (WHERE csat_score IS NOT NULL)                  AS rated_projects,
                  COUNT(*)                                                         AS total_projects
           FROM projects
           WHERE ${field} IS NOT NULL AND archived_at IS NULL
           GROUP BY ${field}
           HAVING COUNT(*) FILTER (WHERE csat_score IS NOT NULL) > 0
           ORDER BY avg_csat DESC`
        );
        return JSON.stringify({ csat_by_manager: r.rows });
      }

      case 'get_ps_engagements': {
        const conds: string[] = [];
        const params: any[] = [];
        let p = 1;
        if (input.cf_ps_lead)      { conds.push(`cf_ps_lead ILIKE $${p++}`);     params.push(`%${input.cf_ps_lead}%`); }
        if (input.account_manager) { conds.push(`account_manager ILIKE $${p++}`); params.push(`%${input.account_manager}%`); }
        if (input.client_name)     { conds.push(`client_name ILIKE $${p++}`);     params.push(`%${input.client_name}%`); }
        const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await query(
          `SELECT id, client_name, cf_ps_lead, account_manager, start_date, end_date, priority, sow_status
           FROM ps_engagements ${w}
           ORDER BY created_at DESC
           LIMIT 30`,
          params
        );
        return JSON.stringify({ engagements: r.rows, count: r.rows.length });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    logger.error(`[ChatService tool:${name}] ${err}`);
    return JSON.stringify({ error: String(err) });
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function runAiChat(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'AI chat is not configured. Add **ANTHROPIC_API_KEY=your_key** to `backend/.env` to enable this feature.';
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.AI_CHAT_MODEL || 'claude-haiku-4-5-20251001';

  let msgs: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }));

  let response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages: msgs,
  });

  // Agentic loop — keep running until no more tool calls
  while (response.stop_reason === 'tool_use') {
    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolBlocks) {
      const result = await execTool(block.name, block.input as Record<string, any>);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    msgs = [
      ...msgs,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    response = await client.messages.create({ model, max_tokens: 2048, system: SYSTEM_PROMPT, tools: TOOLS, messages: msgs });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock ? textBlock.text : 'No response generated.';
}
