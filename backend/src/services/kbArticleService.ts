import { query, execute } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface KbArticle {
  id: string;
  caseStudyId: string;
  projectId: string;
  title: string;
  issue: string | null;
  rootCause: string | null;
  fix: string | null;
  prevention: string | null;
  category: string;
  customerName: string | null;
  projectManager: string | null;
  migrationTypes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticleDraft {
  title: string;
  issue: string;
  rootCause: string;
  fix: string;
  prevention: string;
  category: string;
}

function mapRow(row: any): KbArticle {
  return {
    id: row.id,
    caseStudyId: row.case_study_id,
    projectId: row.project_id,
    title: row.title,
    issue: row.issue,
    rootCause: row.root_cause,
    fix: row.fix,
    prevention: row.prevention,
    category: row.category || 'General',
    customerName: row.customer_name,
    projectManager: row.project_manager,
    migrationTypes: row.migration_types,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractFieldValue(lines: string[], ...labels: string[]): string {
  for (const label of labels) {
    const idx = lines.findIndex((l) =>
      l.toLowerCase().replace(/[^a-z0-9]/g, '').includes(label.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    if (idx !== -1) {
      const valueLine = lines[idx].replace(/^[-•*]?\s*[^:]+:\s*/, '').trim();
      if (valueLine) return valueLine;
      const nextLines: string[] = [];
      for (let i = idx + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l) break;
        if (/^[-•*]?\s*(issue|error|root cause|fix|workaround|prevent|detect)/i.test(l)) break;
        nextLines.push(l);
      }
      if (nextLines.length) return nextLines.join(' ').trim();
    }
  }
  return '';
}

export function parseIssuesFromContent(html: string): KbArticleDraft[] {
  const text = stripHtml(html);
  if (!text.trim()) return [];

  const blockSplitRegex = /(?=issue\s*\d+\s*:|issue\s*#?\d+\s*:)/gi;
  let blocks: string[] = text.split(blockSplitRegex).filter((b) => b.trim().length > 10);

  if (blocks.length <= 1) {
    blocks = text.split(/\n\s*\n/).filter((b) => b.trim().length > 10);
  }

  return blocks.map((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const titleLine = lines[0] || `Issue ${i + 1}`;
    const title = titleLine.replace(/^issue\s*\d+\s*:?\s*/i, '').trim() || `Issue ${i + 1}`;

    const issue = extractFieldValue(lines, 'issue', 'error message', 'error');
    const rootCause = extractFieldValue(lines, 'root cause', 'rootcause', 'cause');
    const fix = extractFieldValue(lines, 'fix', 'workaround', 'solution', 'resolution');
    const prevention = extractFieldValue(lines, 'prevent', 'detection', 'avoid');

    return {
      title: title || `Issue ${i + 1}`,
      issue: issue || block.substring(0, 200),
      rootCause: rootCause || '',
      fix: fix || '',
      prevention: prevention || '',
      category: 'General',
    };
  }).filter((d) => d.title || d.issue);
}

class KbArticleService {
  async getAll(params?: { search?: string; category?: string; projectManager?: string; caseStudyId?: string }) {
    let sql = `
      SELECT ka.*
      FROM kb_articles ka
      WHERE 1=1
    `;
    const sqlParams: any[] = [];
    let idx = 1;

    if (params?.search) {
      sql += ` AND (ka.title ILIKE $${idx} OR ka.issue ILIKE $${idx} OR ka.fix ILIKE $${idx} OR ka.customer_name ILIKE $${idx})`;
      sqlParams.push(`%${params.search}%`);
      idx++;
    }
    if (params?.category && params.category !== 'All') {
      sql += ` AND ka.category = $${idx++}`;
      sqlParams.push(params.category);
    }
    if (params?.projectManager) {
      sql += ` AND ka.project_manager = $${idx++}`;
      sqlParams.push(params.projectManager);
    }
    if (params?.caseStudyId) {
      sql += ` AND ka.case_study_id = $${idx++}`;
      sqlParams.push(params.caseStudyId);
    }

    sql += ` ORDER BY ka.created_at DESC`;
    const result = await query(sql, sqlParams);
    return result.rows.map(mapRow);
  }

  async getById(id: string) {
    const result = await query(`SELECT * FROM kb_articles WHERE id = $1`, [id]);
    if (!result.rows.length) throw new AppError('KB article not found', 404);
    return mapRow(result.rows[0]);
  }

  async extractFromCaseStudy(caseStudyId: string): Promise<KbArticleDraft[]> {
    const result = await query(
      `SELECT cs.content, cs.project_id, p.customer_name, p.project_manager, p.migration_types
       FROM case_studies cs
       JOIN projects p ON cs.project_id = p.id
       WHERE cs.id = $1`,
      [caseStudyId]
    );
    if (!result.rows.length) throw new AppError('Case study not found', 404);

    const row = result.rows[0];
    let issuesHtml = '';
    let lessonsHtml = '';
    try {
      const content = JSON.parse(row.content || '{}');
      issuesHtml = content.issues_resolutions || '';
      lessonsHtml = content.lessons_kb || '';
    } catch {
      issuesHtml = row.content || '';
    }

    const drafts = parseIssuesFromContent(issuesHtml);
    if (lessonsHtml) {
      const lessonText = stripHtml(lessonsHtml).trim();
      if (lessonText) {
        drafts.push({
          title: 'Lessons & KB Takeaways',
          issue: lessonText,
          rootCause: '',
          fix: '',
          prevention: '',
          category: 'Lessons',
        });
      }
    }
    return drafts;
  }

  async bulkSave(caseStudyId: string, articles: KbArticleDraft[]) {
    const csResult = await query(
      `SELECT cs.project_id, p.customer_name, p.project_manager, p.migration_types
       FROM case_studies cs
       JOIN projects p ON cs.project_id = p.id
       WHERE cs.id = $1`,
      [caseStudyId]
    );
    if (!csResult.rows.length) throw new AppError('Case study not found', 404);
    const { project_id, customer_name, project_manager, migration_types } = csResult.rows[0];

    const saved: KbArticle[] = [];
    for (const article of articles) {
      const id = uuidv4();
      await execute(
        `INSERT INTO kb_articles (id, case_study_id, project_id, title, issue, root_cause, fix, prevention, category, customer_name, project_manager, migration_types)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, caseStudyId, project_id, article.title, article.issue, article.rootCause, article.fix, article.prevention, article.category || 'General', customer_name, project_manager, migration_types]
      );
      const r = await query(`SELECT * FROM kb_articles WHERE id = $1`, [id]);
      saved.push(mapRow(r.rows[0]));
    }
    logger.info(`[KB] Saved ${saved.length} articles from case study ${caseStudyId}`);
    return saved;
  }

  async update(id: string, data: Partial<KbArticleDraft>) {
    const existing = await query(`SELECT id FROM kb_articles WHERE id = $1`, [id]);
    if (!existing.rows.length) throw new AppError('KB article not found', 404);

    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (data.title !== undefined)     { fields.push(`title=$${i++}`);      params.push(data.title); }
    if (data.issue !== undefined)     { fields.push(`issue=$${i++}`);      params.push(data.issue); }
    if (data.rootCause !== undefined) { fields.push(`root_cause=$${i++}`); params.push(data.rootCause); }
    if (data.fix !== undefined)       { fields.push(`fix=$${i++}`);        params.push(data.fix); }
    if (data.prevention !== undefined){ fields.push(`prevention=$${i++}`); params.push(data.prevention); }
    if (data.category !== undefined)  { fields.push(`category=$${i++}`);   params.push(data.category); }

    if (!fields.length) return this.getById(id);
    await execute(`UPDATE kb_articles SET ${fields.join(',')} WHERE id=$${i}`, [...params, id]);
    return this.getById(id);
  }

  async delete(id: string) {
    const existing = await query(`SELECT id FROM kb_articles WHERE id = $1`, [id]);
    if (!existing.rows.length) throw new AppError('KB article not found', 404);
    await execute(`DELETE FROM kb_articles WHERE id = $1`, [id]);
    logger.info(`[KB] Deleted article ${id}`);
  }
}

export const kbArticleService = new KbArticleService();
