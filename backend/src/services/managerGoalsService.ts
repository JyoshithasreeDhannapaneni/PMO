import { query, execute } from '../config/database';

export interface ManagerGoal {
  id: string;
  managerName: string;
  goalPct: number;
  createdAt: string;
  updatedAt: string;
}

class ManagerGoalsService {
  async ensureTable() {
    try {
      await execute(`
        CREATE TABLE IF NOT EXISTS manager_goals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          manager_name VARCHAR(255) NOT NULL UNIQUE,
          goal_pct INTEGER NOT NULL DEFAULT 80,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (err: any) {
      // Ignore duplicate object errors from concurrent requests racing to create the table
      if (!err?.message?.includes('already exists') && err?.code !== '42P07') throw err;
    }
  }

  async getAll(): Promise<ManagerGoal[]> {
    await this.ensureTable();
    const result = await query(`SELECT id, manager_name, goal_pct, created_at, updated_at FROM manager_goals ORDER BY manager_name ASC`);
    return result.rows.map((r) => ({
      id: r.id,
      managerName: r.manager_name,
      goalPct: r.goal_pct,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async upsert(managerName: string, goalPct: number): Promise<ManagerGoal> {
    await this.ensureTable();
    await execute(
      `INSERT INTO manager_goals (manager_name, goal_pct)
       VALUES ($1, $2)
       ON CONFLICT (manager_name) DO UPDATE SET goal_pct = EXCLUDED.goal_pct, updated_at = CURRENT_TIMESTAMP`,
      [managerName, goalPct]
    );
    const result = await query(`SELECT id, manager_name, goal_pct, created_at, updated_at FROM manager_goals WHERE manager_name = $1`, [managerName]);
    const r = result.rows[0];
    return { id: r.id, managerName: r.manager_name, goalPct: r.goal_pct, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async delete(id: string): Promise<void> {
    await this.ensureTable();
    await execute(`DELETE FROM manager_goals WHERE id = $1`, [id]);
  }

  // Get manager stats combined with custom goals
  async getManagerStatsWithGoals(managerName?: string) {
    await this.ensureTable();

    const whereClause = managerName ? `WHERE project_manager = $1` : '';
    const params = managerName ? [managerName] : [];

    const [projectsResult, goalsResult] = await Promise.all([
      query(`SELECT project_manager, status, delay_status FROM projects ${whereClause}`, params),
      query(`SELECT manager_name, goal_pct FROM manager_goals`),
    ]);

    const rows = projectsResult.rows;
    const goalsMap: Record<string, number> = {};
    goalsResult.rows.forEach((g) => { goalsMap[g.manager_name] = g.goal_pct; });

    const managerMap: Record<string, { total: number; completed: number; delayed: number; active: number; inactive: number }> = {};
    rows.forEach((r) => {
      const m = r.project_manager || 'Unassigned';
      if (!managerMap[m]) managerMap[m] = { total: 0, completed: 0, delayed: 0, active: 0, inactive: 0 };
      managerMap[m].total++;
      if (r.status === 'COMPLETED') managerMap[m].completed++;
      if (r.status === 'ACTIVE') managerMap[m].active++;
      if (r.status === 'ON_HOLD' || r.status === 'INACTIVE') managerMap[m].inactive++;
      if (r.delay_status === 'DELAYED') managerMap[m].delayed++;
    });

    return Object.entries(managerMap).map(([manager, s]) => {
      const achievedPct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
      const goalPct = goalsMap[manager] ?? 80;
      return {
        manager,
        total: s.total,
        active: s.active,
        inactive: s.inactive,
        completed: s.completed,
        delayed: s.delayed,
        achievedPct,
        goalPct,
        variance: achievedPct - goalPct,
      };
    });
  }
}

export interface GartnerStat {
  managerName: string;
  projectsClosed: number;
  gartnerReviews: number;
  reviewRate: number;
  periodStart: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

class GartnerStatsService {
  async ensureTable() {
    await execute(`
      CREATE TABLE IF NOT EXISTS manager_gartner_stats (
        id SERIAL PRIMARY KEY,
        manager_name VARCHAR(255) NOT NULL UNIQUE,
        projects_closed INTEGER NOT NULL DEFAULT 0,
        gartner_reviews INTEGER NOT NULL DEFAULT 0,
        period_start DATE NOT NULL DEFAULT '2024-10-01',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(255)
      )
    `);
  }

  private mapRow(r: any): GartnerStat {
    const closed = r.projects_closed || 0;
    const reviews = r.gartner_reviews || 0;
    return {
      managerName: r.manager_name,
      projectsClosed: closed,
      gartnerReviews: reviews,
      reviewRate: closed > 0 ? parseFloat(((reviews / closed) * 100).toFixed(1)) : 0,
      periodStart: r.period_start,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    };
  }

  async getAll(managerNames: string[]): Promise<GartnerStat[]> {
    await this.ensureTable();
    // Ensure a row exists for every known manager
    for (const name of managerNames) {
      await execute(
        `INSERT INTO manager_gartner_stats (manager_name) VALUES ($1) ON CONFLICT (manager_name) DO NOTHING`,
        [name]
      );
    }
    const result = await query(
      `SELECT manager_name, projects_closed, gartner_reviews, period_start, updated_at, updated_by
       FROM manager_gartner_stats ORDER BY manager_name ASC`
    );
    return result.rows.map((r: any) => this.mapRow(r));
  }

  async delete(managerName: string): Promise<void> {
    await this.ensureTable();
    await execute(`DELETE FROM manager_gartner_stats WHERE manager_name = $1`, [managerName]);
  }

  async update(managerName: string, projectsClosed: number, gartnerReviews: number, updatedBy: string): Promise<GartnerStat> {
    await this.ensureTable();
    await execute(
      `INSERT INTO manager_gartner_stats (manager_name, projects_closed, gartner_reviews, updated_at, updated_by)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
       ON CONFLICT (manager_name) DO UPDATE
         SET projects_closed = EXCLUDED.projects_closed,
             gartner_reviews = EXCLUDED.gartner_reviews,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = EXCLUDED.updated_by`,
      [managerName, projectsClosed, gartnerReviews, updatedBy]
    );
    const result = await query(
      `SELECT manager_name, projects_closed, gartner_reviews, period_start, updated_at, updated_by
       FROM manager_gartner_stats WHERE manager_name = $1`,
      [managerName]
    );
    return this.mapRow(result.rows[0]);
  }
}

export const gartnerStatsService = new GartnerStatsService();
export const managerGoalsService = new ManagerGoalsService();
