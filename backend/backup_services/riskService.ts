import { prisma } from '../config/database';
import { RiskCategory, RiskLevel, RiskStatus } from 'pg';
import { logger } from '../utils/logger';

interface CreateRiskInput {
  projectId: string;
  title: string;
  description?: string;
  category?: RiskCategory;
  probability?: RiskLevel;
  impact?: RiskLevel;
  mitigation?: string;
  contingency?: string;
  owner?: string;
  dueDate?: Date;
}

interface UpdateRiskInput {
  title?: string;
  description?: string;
  category?: RiskCategory;
  probability?: RiskLevel;
  impact?: RiskLevel;
  status?: RiskStatus;
  mitigation?: string;
  contingency?: string;
  owner?: string;
  dueDate?: Date;
}

class RiskService {
  async getByProject(projectId: string) {
    return prisma.projectRisk.findMany({
      where: { projectId },
      orderBy: [
        { status: 'asc' },
        { impact: 'desc' },
        { probability: 'desc' },
      ],
    });
  }

  async getById(id: string) {
    return prisma.projectRisk.findUnique({
      where: { id },
      include: { project: true },
    });
  }

  async create(data: CreateRiskInput) {
    const risk = await prisma.projectRisk.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        category: data.category || 'TECHNICAL',
        probability: data.probability || 'MEDIUM',
        impact: data.impact || 'MEDIUM',
        mitigation: data.mitigation,
        contingency: data.contingency,
        owner: data.owner,
        dueDate: data.dueDate,
        status: 'OPEN',
      },
    });

    logger.info(`Risk created: ${risk.id} for project ${data.projectId}`);
    return risk;
  }

  async update(id: string, data: UpdateRiskInput) {
    const updateData: any = { ...data };
    
    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      updateData.resolvedAt = new Date();
    }

    const risk = await prisma.projectRisk.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Risk updated: ${risk.id}`);
    return risk;
  }

  async delete(id: string) {
    await prisma.projectRisk.delete({ where: { id } });
    logger.info(`Risk deleted: ${id}`);
  }

  async getRiskMatrix(projectId: string) {
    const risks = await prisma.projectRisk.findMany({
      where: { 
        projectId,
        status: { in: ['OPEN', 'MITIGATING'] },
      },
    });

    const matrix = {
      critical: { high: 0, medium: 0, low: 0 },
      high: { high: 0, medium: 0, low: 0 },
      medium: { high: 0, medium: 0, low: 0 },
      low: { high: 0, medium: 0, low: 0 },
    };

    risks.forEach((risk) => {
      const impact = risk.impact.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
      const prob = risk.probability.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
      if (matrix[impact] && matrix[impact][prob] !== undefined) {
        matrix[impact][prob]++;
      }
    });

    return {
      matrix,
      totalOpen: risks.length,
      bySeverity: {
        critical: risks.filter((r) => r.impact === 'CRITICAL' || r.probability === 'CRITICAL').length,
        high: risks.filter((r) => r.impact === 'HIGH' && r.probability === 'HIGH').length,
        medium: risks.filter((r) => r.impact === 'MEDIUM' || r.probability === 'MEDIUM').length,
        low: risks.filter((r) => r.impact === 'LOW' && r.probability === 'LOW').length,
      },
    };
  }

  async getRiskSummary(projectId: string) {
    const [total, open, mitigating, resolved] = await Promise.all([
      prisma.projectRisk.count({ where: { projectId } }),
      prisma.projectRisk.count({ where: { projectId, status: 'OPEN' } }),
      prisma.projectRisk.count({ where: { projectId, status: 'MITIGATING' } }),
      prisma.projectRisk.count({ where: { projectId, status: { in: ['RESOLVED', 'CLOSED'] } } }),
    ]);

    return { total, open, mitigating, resolved };
  }
}

export const riskService = new RiskService();
