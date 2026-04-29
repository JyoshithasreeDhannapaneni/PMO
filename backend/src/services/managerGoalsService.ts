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
    await execute(`
      CREATE TABLE IF NOT EXISTS manager_goals (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        manager_name VARCHAR(255) NOT NULL UNIQUE,
        goal_pct INT NOT NULL DEFAULT 80,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
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
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE goal_pct = ?, updated_at = CURRENT_TIMESTAMP`,
      [managerName, goalPct, goalPct]
    );
    const result = await query(`SELECT id, manager_name, goal_pct, created_at, updated_at FROM manager_goals WHERE manager_name = ?`, [managerName]);
    const r = result.rows[0];
    return { id: r.id, managerName: r.manager_name, goalPct: r.goal_pct, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async delete(id: string): Promise<void> {
    await this.ensureTable();
    await execute(`DELETE FROM manager_goals WHERE id = ?`, [id]);
  }

  // Get manager stats combined with custom goals
  async getManagerStatsWithGoals(managerName?: string) {
    await this.ensureTable();

    const whereClause = managerName ? `WHERE project_manager = ?` : '';
    const params = managerName ? [managerName] : [];

    const [projectsResult, goalsResult] = await Promise.all([
      query(`SELECT project_manager, status, delay_status FROM projects ${whereClause}`, params),
      query(`SELECT manager_name, goal_pct FROM manager_goals`),
    ]);

    const rows = projectsResult.rows;
    const goalsMap: Record<string, number> = {};
    goalsResult.rows.forEach((g) => { goalsMap[g.manager_name] = g.goal_pct; });

    const managerMap: Record<string, { total: number; completed: number; delayed: number; active: number }> = {};
    rows.forEach((r) => {
      const m = r.project_manager || 'Unassigned';
      if (!managerMap[m]) managerMap[m] = { total: 0, completed: 0, delayed: 0, active: 0 };
      managerMap[m].total++;
      if (r.status === 'COMPLETED') managerMap[m].completed++;
      if (r.status === 'ACTIVE') managerMap[m].active++;
      if (r.delay_status === 'DELAYED') managerMap[m].delayed++;
    });

    return Object.entries(managerMap).map(([manager, s]) => ({
      manager,
      total: s.total,
      active: s.active,
      completed: s.completed,
      delayed: s.delayed,
      achievedPct: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
      goalPct: goalsMap[manager] ?? 80,
    }));
  }
}

export const managerGoalsService = new ManagerGoalsService();
