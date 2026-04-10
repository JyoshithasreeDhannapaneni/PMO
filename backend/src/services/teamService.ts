import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type TeamRole = 'PROJECT_MANAGER' | 'TECHNICAL_LEAD' | 'DEVELOPER' | 'QA_ENGINEER' | 'BUSINESS_ANALYST' | 'ARCHITECT' | 'TEAM_MEMBER' | 'STAKEHOLDER';

interface CreateTeamMemberInput {
  projectId: string;
  name: string;
  email: string;
  role?: TeamRole;
  department?: string;
  allocation?: number;
  startDate?: Date;
  endDate?: Date;
}

interface UpdateTeamMemberInput {
  name?: string;
  email?: string;
  role?: TeamRole;
  department?: string;
  allocation?: number;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

function mapTeamMemberRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    allocation: row.allocation,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class TeamService {
  async getByProject(projectId: string) {
    const result = await query(
      `SELECT * FROM project_team_members WHERE project_id = $1 ORDER BY role ASC, name ASC`,
      [projectId]
    );
    return result.rows.map(mapTeamMemberRow);
  }

  async getById(id: string) {
    const result = await query(
      `SELECT m.*, p.name as project_name
       FROM project_team_members m
       JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...mapTeamMemberRow(row),
      project: { name: row.project_name },
    };
  }

  async create(data: CreateTeamMemberInput) {
    const memberId = uuidv4();
    await execute(
      `INSERT INTO project_team_members (id, project_id, name, email, role, department, allocation, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true)`,
      [
        memberId,
        data.projectId,
        data.name,
        data.email,
        data.role || 'TEAM_MEMBER',
        data.department,
        data.allocation || 100,
        data.startDate,
        data.endDate,
      ]
    );

    const result = await query(`SELECT * FROM project_team_members WHERE id = ?`, [memberId]);
    const member = mapTeamMemberRow(result.rows[0]);
    logger.info(`Team member added: ${member.name} to project ${data.projectId}`);
    return member;
  }

  async update(id: string, data: UpdateTeamMemberInput) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(data.name); }
    if (data.email !== undefined) { updates.push(`email = $${paramIndex++}`); params.push(data.email); }
    if (data.role !== undefined) { updates.push(`role = $${paramIndex++}`); params.push(data.role); }
    if (data.department !== undefined) { updates.push(`department = $${paramIndex++}`); params.push(data.department); }
    if (data.allocation !== undefined) { updates.push(`allocation = $${paramIndex++}`); params.push(data.allocation); }
    if (data.startDate !== undefined) { updates.push(`start_date = $${paramIndex++}`); params.push(data.startDate); }
    if (data.endDate !== undefined) { updates.push(`end_date = $${paramIndex++}`); params.push(data.endDate); }
    if (data.isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); params.push(data.isActive); }

    params.push(id);

    await execute(
      `UPDATE project_team_members SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM project_team_members WHERE id = ?`, [id]);
    const member = mapTeamMemberRow(result.rows[0]);
    logger.info(`Team member updated: ${member.id}`);
    return member;
  }

  async delete(id: string) {
    await query(`DELETE FROM project_team_members WHERE id = $1`, [id]);
    logger.info(`Team member removed: ${id}`);
  }

  async getTeamSummary(projectId: string) {
    const result = await query(
      `SELECT * FROM project_team_members WHERE project_id = $1 AND is_active = true`,
      [projectId]
    );

    const members = result.rows;
    const byRole = members.reduce((acc, m) => {
      acc[m.role] = (acc[m.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalAllocation = members.reduce((sum, m) => sum + m.allocation, 0);

    return {
      totalMembers: members.length,
      byRole,
      totalAllocation,
      avgAllocation: members.length > 0 ? Math.round(totalAllocation / members.length) : 0,
    };
  }
}

export const teamService = new TeamService();
