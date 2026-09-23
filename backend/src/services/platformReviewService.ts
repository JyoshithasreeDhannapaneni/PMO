import { query, execute } from '../config/database';

export interface PlatformReviewFilters {
  platform?: string;
  projectName?: string;
  projectManager?: string;
  accountManager?: string;
  minRating?: number;
  segment?: string;
}

export interface PlatformReviewMedia {
  url: string;
  type: 'image' | 'video';
}

export interface CreatePlatformReviewInput {
  platform: string;
  projectName: string;
  projectId?: string | null;
  projectManager?: string | null;
  accountManager?: string | null;
  reviewerName?: string | null;
  rating: number;
  reviewText?: string | null;
  reviewUrl?: string | null;
  reviewDate?: string;
  segment?: 'SMB' | 'ENT' | 'PS' | null;
  media?: PlatformReviewMedia[];
}

// Emails aren't stored on platform_reviews itself (it only records the PM/AM name at
// review time, same as projects.project_manager/account_manager elsewhere in this app) —
// resolved here via a case-insensitive join against users so the frontend's per-manager
// grouping (summarizeByManager in reviews/page.tsx) has an email to key mailto: links off,
// same as it already does when the name happens to match a real login.
const SELECT_WITH_MANAGER_EMAILS = `
  SELECT
    pr.id, pr.platform, pr.project_id, pr.project_name,
    pr.project_manager, pr.account_manager,
    pmu.email AS project_manager_email,
    amu.email AS account_manager_email,
    pr.reviewer_name, pr.rating, pr.review_text, pr.review_url,
    pr.review_date, pr.segment, pr.media_items
  FROM platform_reviews pr
  LEFT JOIN users pmu ON LOWER(pmu.name) = LOWER(pr.project_manager)
  LEFT JOIN users amu ON LOWER(amu.name) = LOWER(pr.account_manager)
`;

function mapRow(row: any) {
  return {
    id: row.id,
    platform: row.platform,
    projectId: row.project_id,
    projectName: row.project_name,
    projectManager: row.project_manager,
    projectManagerEmail: row.project_manager_email ?? null,
    accountManager: row.account_manager,
    accountManagerEmail: row.account_manager_email ?? null,
    reviewerName: row.reviewer_name,
    rating: Number(row.rating),
    reviewText: row.review_text,
    reviewUrl: row.review_url,
    reviewDate: row.review_date,
    segment: row.segment,
    media: row.media_items ?? [],
  };
}

export const platformReviewService = {
  async getAll(filters: PlatformReviewFilters) {
    const where: string[] = [];
    const params: any[] = [];

    if (filters.platform) { params.push(filters.platform); where.push(`pr.platform = $${params.length}`); }
    if (filters.projectName) { params.push(`%${filters.projectName}%`); where.push(`pr.project_name ILIKE $${params.length}`); }
    if (filters.projectManager) { params.push(filters.projectManager); where.push(`pr.project_manager = $${params.length}`); }
    if (filters.accountManager) { params.push(filters.accountManager); where.push(`pr.account_manager = $${params.length}`); }
    if (filters.segment) { params.push(filters.segment); where.push(`pr.segment = $${params.length}`); }
    if (filters.minRating !== undefined) { params.push(filters.minRating); where.push(`pr.rating >= $${params.length}`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(
      `${SELECT_WITH_MANAGER_EMAILS} ${whereClause} ORDER BY pr.review_date DESC, pr.created_at DESC`,
      params
    );
    return result.rows.map(mapRow);
  },

  // Distinct platforms actually in use, plus the baseline four so the tabs never collapse
  // to nothing before the first custom platform is added.
  async getPlatforms(): Promise<string[]> {
    const result = await query(`SELECT DISTINCT platform FROM platform_reviews ORDER BY platform`);
    const baseline = ['Gartner', 'G2', 'Trustpilot', 'TrustRadius'];
    const fromDb = result.rows.map((r: any) => r.platform as string);
    return [...new Set([...baseline, ...fromDb])];
  },

  // Distinct PM/AM names already on a review — the filter dropdowns' purpose is
  // narrowing existing reviews, not offering the full team roster up front.
  async getManagerOptions(): Promise<{ projectManagers: string[]; accountManagers: string[] }> {
    const [pmResult, amResult] = await Promise.all([
      query(`SELECT DISTINCT project_manager FROM platform_reviews WHERE project_manager IS NOT NULL ORDER BY project_manager`),
      query(`SELECT DISTINCT account_manager FROM platform_reviews WHERE account_manager IS NOT NULL ORDER BY account_manager`),
    ]);
    return {
      projectManagers: pmResult.rows.map((r: any) => r.project_manager as string),
      accountManagers: amResult.rows.map((r: any) => r.account_manager as string),
    };
  },

  async create(input: CreatePlatformReviewInput) {
    const result = await query(
      `INSERT INTO platform_reviews
         (platform, project_id, project_name, project_manager, account_manager,
          reviewer_name, rating, review_text, review_url, review_date, segment, media_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_DATE), $11, $12)
       RETURNING id`,
      [
        input.platform,
        input.projectId ?? null,
        input.projectName,
        input.projectManager ?? null,
        input.accountManager ?? null,
        input.reviewerName ?? null,
        input.rating,
        input.reviewText ?? null,
        input.reviewUrl ?? null,
        input.reviewDate ?? null,
        input.segment ?? null,
        JSON.stringify(input.media ?? []),
      ]
    );
    const row = (await query(`${SELECT_WITH_MANAGER_EMAILS} WHERE pr.id = $1`, [result.rows[0].id])).rows[0];
    return mapRow(row);
  },

  async delete(id: string): Promise<boolean> {
    const result = await execute(`DELETE FROM platform_reviews WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
