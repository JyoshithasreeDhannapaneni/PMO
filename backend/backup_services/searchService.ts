import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  highlight?: string;
}

class SearchService {
  async globalSearch(query: string, limit = 20): Promise<SearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const searchTerm = `%${query}%`;
    const results: SearchResult[] = [];

    try {
      // Search Projects
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { customerName: { contains: query } },
            { projectManager: { contains: query } },
            { description: { contains: query } },
          ],
        },
        select: {
          id: true,
          name: true,
          customerName: true,
          status: true,
        },
        take: limit,
      });

      projects.forEach((p) => {
        results.push({
          type: 'project',
          id: p.id,
          title: p.name,
          subtitle: p.customerName,
          url: `/projects/${p.id}`,
          highlight: p.status,
        });
      });

      // Search Tasks
      const tasks = await prisma.projectTask.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { notes: { contains: query } },
            { assignee: { contains: query } },
          ],
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          status: true,
          project: { select: { name: true } },
        },
        take: limit,
      });

      tasks.forEach((t) => {
        results.push({
          type: 'task',
          id: t.id,
          title: t.name,
          subtitle: t.project.name,
          url: `/projects/${t.projectId}/tasks`,
          highlight: t.status,
        });
      });

      // Search Risks
      const risks = await prisma.projectRisk.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
            { owner: { contains: query } },
          ],
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          status: true,
          project: { select: { name: true } },
        },
        take: limit,
      });

      risks.forEach((r) => {
        results.push({
          type: 'risk',
          id: r.id,
          title: r.title,
          subtitle: r.project.name,
          url: `/projects/${r.projectId}/manage`,
          highlight: r.status,
        });
      });

      // Search Team Members
      const teamMembers = await prisma.projectTeamMember.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { email: { contains: query } },
            { department: { contains: query } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          projectId: true,
          role: true,
          project: { select: { name: true } },
        },
        take: limit,
      });

      teamMembers.forEach((m) => {
        results.push({
          type: 'team_member',
          id: m.id,
          title: m.name,
          subtitle: `${m.project.name} - ${m.role}`,
          url: `/projects/${m.projectId}/manage`,
          highlight: m.email,
        });
      });

      // Search Documents
      const documents = await prisma.projectDocument.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { description: { contains: query } },
          ],
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          category: true,
          project: { select: { name: true } },
        },
        take: limit,
      });

      documents.forEach((d) => {
        results.push({
          type: 'document',
          id: d.id,
          title: d.name,
          subtitle: d.project.name,
          url: `/projects/${d.projectId}/manage`,
          highlight: d.category,
        });
      });

      // Search Case Studies
      const caseStudies = await prisma.caseStudy.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            { content: { contains: query } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          project: { select: { name: true, customerName: true } },
        },
        take: limit,
      });

      caseStudies.forEach((cs) => {
        results.push({
          type: 'case_study',
          id: cs.id,
          title: cs.title || cs.project.name,
          subtitle: cs.project.customerName,
          url: `/case-studies/${cs.id}`,
          highlight: cs.status,
        });
      });

      // Search Users (admin only in production)
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { email: { contains: query } },
            { username: { contains: query } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        take: limit,
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

      logger.info(`Search for "${query}" returned ${results.length} results`);
      return results.slice(0, limit);
    } catch (error) {
      logger.error('Search error:', error);
      return [];
    }
  }

  async searchProjects(query: string, filters?: {
    status?: string;
    phase?: string;
    migrationType?: string;
  }) {
    const where: any = {
      OR: [
        { name: { contains: query } },
        { customerName: { contains: query } },
        { projectManager: { contains: query } },
      ],
    };

    if (filters?.status) where.status = filters.status;
    if (filters?.phase) where.phase = filters.phase;
    if (filters?.migrationType) {
      where.migrationTypes = { contains: filters.migrationType };
    }

    return prisma.project.findMany({
      where,
      include: {
        phases: true,
        _count: { select: { tasks: true, risks: true, teamMembers: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

export const searchService = new SearchService();
