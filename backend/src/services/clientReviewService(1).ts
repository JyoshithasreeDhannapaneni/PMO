import { query, execute } from '../config/db';

interface ReviewInput {
  projectId: string;
  reviewerName: string;
  reviewDate?: string;
  communicationScore: number;
  deliveryScore: number;
  qualityScore: number;
  supportScore: number;
  comments?: string;
}

function overallOf(row: any): number {
  const scores = [row.communication_score, row.delivery_score, row.quality_score, row.support_score];
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function toReview(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    customerName: row.customer_name,
    accountManager: row.account_manager,
    projectManager: row.project_manager,
    reviewerName: row.reviewer_name,
    reviewDate: row.review_date,
    communicationScore: row.communication_score,
    deliveryScore: row.delivery_score,
    qualityScore: row.quality_score,
    supportScore: row.support_score,
    overallScore: overallOf(row),
    comments: row.comments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class ClientReviewService {
  async getAll(filters: { projectManager?: string; customerName?: string } = {}) {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.projectManager) {
      params.push(filters.projectManager);
      conditions.push(`p.project_manager = $${params.length}`);
    }
    if (filters.customerName) {
      params.push(filters.customerName);
      conditions.push(`p.customer_name = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`
      SELECT r.*, p.name AS project_name, p.customer_name, p.account_manager, p.project_manager
      FROM client_reviews r
      JOIN projects p ON p.id = r.project_id
      ${where}
      ORDER BY r.review_date DESC, r.created_at DESC
    `, params);

    return result.rows.map(toReview);
  }

  async getByProject(projectId: string) {
    const result = await query(`
      SELECT r.*, p.name AS project_name, p.customer_name, p.account_manager, p.project_manager
      FROM client_reviews r
      JOIN projects p ON p.id = r.project_id
      WHERE r.project_id = ?
      ORDER BY r.review_date DESC, r.created_at DESC
    `, [projectId]);
    return result.rows.map(toReview);
  }

  async create(input: ReviewInput) {
    const result = await query(`
      INSERT INTO client_reviews (
        project_id, reviewer_name, review_date,
        communication_score, delivery_score, quality_score, support_score, comments
      ) VALUES (?, ?, COALESCE(?, CURRENT_DATE), ?, ?, ?, ?, ?)
      RETURNING id
    `, [
      input.projectId,
      input.reviewerName,
      input.reviewDate || null,
      input.communicationScore,
      input.deliveryScore,
      input.qualityScore,
      input.supportScore,
      input.comments || null,
    ]);

    const [created] = await this.getByProject(input.projectId);
    return created ?? (await this.getById(result.rows[0].id));
  }

  async getById(id: string) {
    const result = await query(`
      SELECT r.*, p.name AS project_name, p.customer_name, p.account_manager, p.project_manager
      FROM client_reviews r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = ?
    `, [id]);
    return result.rows[0] ? toReview(result.rows[0]) : null;
  }

  async update(id: string, input: Partial<ReviewInput>) {
    await execute(`
      UPDATE client_reviews SET
        reviewer_name = COALESCE(?, reviewer_name),
        review_date = COALESCE(?, review_date),
        communication_score = COALESCE(?, communication_score),
        delivery_score = COALESCE(?, delivery_score),
        quality_score = COALESCE(?, quality_score),
        support_score = COALESCE(?, support_score),
        comments = COALESCE(?, comments),
        updated_at = NOW()
      WHERE id = ?
    `, [
      input.reviewerName ?? null,
      input.reviewDate ?? null,
      input.communicationScore ?? null,
      input.deliveryScore ?? null,
      input.qualityScore ?? null,
      input.supportScore ?? null,
      input.comments ?? null,
      id,
    ]);
    return this.getById(id);
  }

  async delete(id: string) {
    await execute(`DELETE FROM client_reviews WHERE id = ?`, [id]);
  }

  async getManagerSummary() {
    const result = await query(`
      SELECT
        p.project_manager AS project_manager,
        COUNT(r.id) AS review_count,
        AVG((r.communication_score + r.delivery_score + r.quality_score + r.support_score) / 4.0) AS avg_score
      FROM client_reviews r
      JOIN projects p ON p.id = r.project_id
      WHERE p.project_manager IS NOT NULL AND p.project_manager != ''
      GROUP BY p.project_manager
      ORDER BY avg_score DESC
    `);

    return result.rows.map((row: any) => ({
      projectManager: row.project_manager,
      reviewCount: Number(row.review_count),
      avgScore: Math.round(Number(row.avg_score) * 10) / 10,
    }));
  }
}

export const clientReviewService = new ClientReviewService();
