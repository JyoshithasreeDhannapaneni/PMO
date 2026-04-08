import { prisma } from '../config/database';
import { TeamRole } from '@prisma/client';
import { logger } from '../utils/logger';

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

class TeamService {
  async getByProject(projectId: string) {
    return prisma.projectTeamMember.findMany({
      where: { projectId },
      orderBy: [
        { role: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async getById(id: string) {
    return prisma.projectTeamMember.findUnique({
      where: { id },
      include: { project: true },
    });
  }

  async create(data: CreateTeamMemberInput) {
    const member = await prisma.projectTeamMember.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        email: data.email,
        role: data.role || 'TEAM_MEMBER',
        department: data.department,
        allocation: data.allocation || 100,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: true,
      },
    });

    logger.info(`Team member added: ${member.name} to project ${data.projectId}`);
    return member;
  }

  async update(id: string, data: UpdateTeamMemberInput) {
    const member = await prisma.projectTeamMember.update({
      where: { id },
      data,
    });

    logger.info(`Team member updated: ${member.id}`);
    return member;
  }

  async delete(id: string) {
    await prisma.projectTeamMember.delete({ where: { id } });
    logger.info(`Team member removed: ${id}`);
  }

  async getTeamSummary(projectId: string) {
    const members = await prisma.projectTeamMember.findMany({
      where: { projectId, isActive: true },
    });

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
