import { query, execute } from '../config/db';

const DEFAULT_PLATFORMS = ['Gartner', 'G2', 'Trustpilot', 'TrustRadius'];

interface PlatformReviewInput {
  platform: string;
  projectName: string;
  projectId?: string | null;
  projectManager?: string;
  accountManager?: string;
  reviewerName?: string;
  rating: number;
  reviewText?: string;
  reviewUrl?: string;
  reviewDate?: string;
  segment?: 'SMB' | 'ENT';
  mediaItems?: MediaItem[];
}

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

interface PlatformReviewFilters {
  platform?: string;
  projectName?: string;
  projectManager?: string;
  accountManager?: string;
  minRating?: number;
  segment?: string;
}

function toReview(row: any) {
  return {
    id: row.id,
    platform: row.platform,
    projectId: row.project_id,
    projectName: row.project_name,
    projectManager: row.project_manager,
    projectManagerEmail: row.pm_email || null,
    accountManager: row.account_manager,
    accountManagerEmail: row.am_email || null,
    reviewerName: row.reviewer_name,
    rating: Number(row.rating),
    reviewText: row.review_text,
    reviewUrl: row.review_url,
    reviewDate: row.review_date,
    segment: row.segment || null,
    media: (Array.isArray(row.media_items) ? row.media_items : []) as MediaItem[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Best-effort email lookup — project_manager/account_manager are free-text
// names, so this only resolves an email when it matches a users.name exactly
// (case-insensitive). No match just means no email shown, not an error.
const EMAIL_JOIN = `
  LEFT JOIN users pm_u ON LOWER(pm_u.name) = LOWER(r.project_manager)
  LEFT JOIN users am_u ON LOWER(am_u.name) = LOWER(r.account_manager)
`;
const EMAIL_SELECT = `pm_u.email AS pm_email, am_u.email AS am_email`;

class PlatformReviewService {
  async getAll(filters: PlatformReviewFilters = {}) {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.platform) {
      conditions.push('r.platform = ?');
      params.push(filters.platform);
    }
    if (filters.projectName) {
      conditions.push('r.project_name ILIKE ?');
      params.push(`%${filters.projectName}%`);
    }
    if (filters.projectManager) {
      conditions.push('r.project_manager = ?');
      params.push(filters.projectManager);
    }
    if (filters.accountManager) {
      conditions.push('r.account_manager = ?');
      params.push(filters.accountManager);
    }
    if (filters.minRating != null) {
      conditions.push('r.rating >= ?');
      params.push(filters.minRating);
    }
    if (filters.segment) {
      conditions.push('r.segment = ?');
      params.push(filters.segment);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`
      SELECT r.*, ${EMAIL_SELECT}
      FROM platform_reviews r
      ${EMAIL_JOIN}
      ${where}
      ORDER BY r.review_date DESC, r.created_at DESC
    `, params);

    return result.rows.map(toReview);
  }

  // Distinct platforms already used, so admins effectively "add" a platform
  // just by picking "Other" and typing a name once — it then shows up as a
  // reusable option for everyone afterward.
  async getPlatforms() {
    const result = await query(`SELECT DISTINCT platform FROM platform_reviews`);
    const used = result.rows.map((r: any) => r.platform);
    return Array.from(new Set([...DEFAULT_PLATFORMS, ...used]));
  }

  async getManagerOptions() {
    const result = await query(`
      SELECT DISTINCT project_manager, account_manager FROM platform_reviews
    `);
    const projectManagers = new Set<string>();
    const accountManagers = new Set<string>();
    for (const row of result.rows) {
      if (row.project_manager) projectManagers.add(row.project_manager);
      if (row.account_manager) accountManagers.add(row.account_manager);
    }
    return {
      projectManagers: Array.from(projectManagers).sort(),
      accountManagers: Array.from(accountManagers).sort(),
    };
  }

  async getSummaryByPlatform() {
    const result = await query(`
      SELECT platform, COUNT(*) AS review_count, AVG(rating) AS avg_rating
      FROM platform_reviews
      GROUP BY platform
      ORDER BY review_count DESC
    `);
    return result.rows.map((row: any) => ({
      platform: row.platform,
      reviewCount: Number(row.review_count),
      avgRating: Math.round(Number(row.avg_rating) * 10) / 10,
    }));
  }

  async getSummaryByManager(field: 'project_manager' | 'account_manager') {
    const emailJoin = field === 'project_manager'
      ? 'LEFT JOIN users u ON LOWER(u.name) = LOWER(r.project_manager)'
      : 'LEFT JOIN users u ON LOWER(u.name) = LOWER(r.account_manager)';

    const result = await query(`
      SELECT r.${field} AS manager, u.email AS email, COUNT(*) AS review_count, AVG(r.rating) AS avg_rating
      FROM platform_reviews r
      ${emailJoin}
      WHERE r.${field} IS NOT NULL AND r.${field} != ''
      GROUP BY r.${field}, u.email
      ORDER BY avg_rating DESC
    `);

    return result.rows.map((row: any) => ({
      manager: row.manager,
      email: row.email || null,
      reviewCount: Number(row.review_count),
      avgRating: Math.round(Number(row.avg_rating) * 10) / 10,
    }));
  }

  async create(input: PlatformReviewInput) {
    const result = await query(`
      INSERT INTO platform_reviews (
        platform, project_id, project_name, project_manager, account_manager,
        reviewer_name, rating, review_text, review_url, review_date, segment,
        media_items
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_DATE), ?, ?)
      RETURNING id
    `, [
      input.platform,
      input.projectId || null,
      input.projectName,
      input.projectManager || null,
      input.accountManager || null,
      input.reviewerName || null,
      input.rating,
      input.reviewText || null,
      input.reviewUrl || null,
      input.reviewDate || null,
      input.segment || null,
      JSON.stringify(input.mediaItems || []),
    ]);
    return this.getById(result.rows[0].id);
  }

  async getById(id: string) {
    const result = await query(`
      SELECT r.*, ${EMAIL_SELECT}
      FROM platform_reviews r
      ${EMAIL_JOIN}
      WHERE r.id = ?
    `, [id]);
    return result.rows[0] ? toReview(result.rows[0]) : null;
  }

  async delete(id: string) {
    await execute(`DELETE FROM platform_reviews WHERE id = ?`, [id]);
  }
}

export const platformReviewService = new PlatformReviewService();
