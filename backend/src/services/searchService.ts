import { query } from '../config/database';
import { logger } from '../utils/logger';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  highlight?: string;
}

async function safeQuery(sql: string, params: any[]): Promise<any[]> {
  try {
    const result = await query(sql, params);
    return result.rows;
  } catch (err) {
    logger.error('Search sub-query error:', err);
    return [];
  }
}

class SearchService {
  async globalSearch(searchQuery: string, limit = 20): Promise<SearchResult[]> {
    if (!searchQuery || searchQuery.length < 2) {
      return [];
    }

    const results: SearchResult[] = [];
    const searchTerm = `%${searchQuery}%`;
    const lim = Math.max(1, parseInt(String(limit), 10) || 20);

    const [projects, tasks, risks, teamMembers, documents, caseStudies, users] = await Promise.all([
      safeQuery(
        `SELECT id, name, customer_name, status, project_manager, account_manager FROM projects
         WHERE name LIKE ? OR customer_name LIKE ? OR project_manager LIKE ? OR account_manager LIKE ? OR description LIKE ?
         LIMIT ${lim}`,
        [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]
      ),
      safeQuery(
        `SELECT t.id, t.name, t.project_id, t.status, p.name as project_name
         FROM project_tasks t
         JOIN projects p ON t.project_id = p.id
         WHERE t.name LIKE ? OR t.notes LIKE ? OR t.assignee LIKE ?
         LIMIT ${lim}`,
        [searchTerm, searchTerm, searchTerm]
      ),
      safeQuery(
        `SELECT r.id, r.title, r.project_id, r.status, p.name as project_name
         FROM project_risks r
         JOIN projects p ON r.project_id = p.id
         WHERE r.title LIKE ? OR r.description LIKE ? OR r.owner LIKE ?
         LIMIT ${lim}`,
        [searchTerm, searchTerm, searchTerm]
      ),
      safeQuery(
        `SELECT m.id, m.name, m.email, m.project_id, m.role, p.name as project_name
         FROM project_team_members m
         JOIN projects p ON m.project_id = p.id
         WHERE m.name LIKE ? OR m.email LIKE ? OR m.department LIKE ?
         LIMIT ${lim}`,
        [searchTerm, searchTerm, searchTerm]
      ),
      safeQuery(
        `SELECT d.id, d.name, d.project_id, d.category, p.name as project_name
         FROM project_documents d
         JOIN projects p ON d.project_id = p.id
         WHERE d.name LIKE ? OR d.description LIKE ?
         LIMIT ${lim}`,
        [searchTerm, searchTerm]
      ),
      safeQuery(
        `SELECT cs.id, cs.title, cs.status, p.name as project_name, p.customer_name
         FROM case_studies cs
         JOIN projects p ON cs.project_id = p.id
         WHERE cs.title LIKE ? OR cs.content LIKE ?
         LIMIT ${lim}`,
        [searchTerm, searchTerm]
      ),
      safeQuery(
        `SELECT id, name, email, role FROM users
         WHERE name LIKE ? OR email LIKE ? OR username LIKE ?
         LIMIT ${lim}`,
        [searchTerm, searchTerm, searchTerm]
      ),
    ]);

    projects.forEach((p) => {
      results.push({
        type: 'project',
        id: p.id,
        title: p.name,
        subtitle: `${p.customer_name}${p.project_manager ? ` · PM: ${p.project_manager}` : ''}${p.account_manager ? ` · AM: ${p.account_manager}` : ''}`,
        url: `/projects/${p.id}`,
        highlight: p.status,
      });
    });

    tasks.forEach((t) => {
      results.push({
        type: 'task',
        id: t.id,
        title: t.name,
        subtitle: t.project_name,
        url: `/projects/${t.project_id}/tasks`,
        highlight: t.status,
      });
    });

    risks.forEach((r) => {
      results.push({
        type: 'risk',
        id: r.id,
        title: r.title,
        subtitle: r.project_name,
        url: `/projects/${r.project_id}/manage`,
        highlight: r.status,
      });
    });

    teamMembers.forEach((m) => {
      results.push({
        type: 'team_member',
        id: m.id,
        title: m.name,
        subtitle: `${m.project_name} - ${m.role}`,
        url: `/projects/${m.project_id}/manage`,
        highlight: m.email,
      });
    });

    documents.forEach((d) => {
      results.push({
        type: 'document',
        id: d.id,
        title: d.name,
        subtitle: d.project_name,
        url: `/projects/${d.project_id}/manage`,
        highlight: d.category,
      });
    });

    caseStudies.forEach((cs) => {
      results.push({
        type: 'case_study',
        id: cs.id,
        title: cs.title || cs.project_name,
        subtitle: cs.customer_name,
        url: `/case-studies/${cs.id}`,
        highlight: cs.status,
      });
    });

    users.forEach((u) => {
      results.push({
        type: 'user',
        id: u.id,
        title: u.name,
        subtitle: u.email,
        url: `/settings/users`,
        highlight: u.role,
      });
    });

    logger.info(`Search for "${searchQuery}" returned ${results.length} results`);
    return results.slice(0, lim);
  }

  async searchProjects(searchQuery: string, filters?: { status?: string; phase?: string; migrationType?: string }) {
    const conditions: string[] = [
      `(name LIKE ? OR customer_name LIKE ? OR project_manager LIKE ? OR account_manager LIKE ?)`
    ];
    const searchTerm = `%${searchQuery}%`;
    const params: any[] = [searchTerm, searchTerm, searchTerm, searchTerm];

    if (filters?.status) {
      conditions.push(`status = ?`);
      params.push(filters.status);
    }
    if (filters?.phase) {
      conditions.push(`phase = ?`);
      params.push(filters.phase);
    }
    if (filters?.migrationType) {
      conditions.push(`migration_types LIKE ?`);
      params.push(`%${filters.migrationType}%`);
    }

    const result = await query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) as task_count,
              (SELECT COUNT(*) FROM project_risks WHERE project_id = p.id) as risk_count,
              (SELECT COUNT(*) FROM project_team_members WHERE project_id = p.id) as team_count
       FROM projects p
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC`,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      customerName: row.customer_name,
      projectManager: row.project_manager,
      accountManager: row.account_manager,
      status: row.status,
      phase: row.phase,
      delayStatus: row.delay_status,
      migrationTypes: row.migration_types,
      _count: {
        tasks: parseInt(row.task_count),
        risks: parseInt(row.risk_count),
        teamMembers: parseInt(row.team_count),
      },
    }));
  }
}

export const searchService = new SearchService();
