import { Request, Response } from 'express';
import { slaBreachAlertService } from '../services/slaBreachAlertService';
import { asyncHandler } from '../middleware/errorHandler';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Silently ignores a malformed date rather than 500ing on a bad `::date` cast downstream
// -- an unrecognized filter value should just not filter, not break the page.
function parseDateParam(val: unknown): string | undefined {
  return typeof val === 'string' && DATE_RE.test(val) ? val : undefined;
}

export const slaBreachAlertController = {
  // GET /api/sla-breach-alerts — paginated history, newest first, optional ?search=,
  // ?responsibleEmail= (segregate by responsible person), and ?startDate=/?endDate=
  // (YYYY-MM-DD, inclusive, matched against the customer email's received_at).
  list: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const responsibleEmail = typeof req.query.responsibleEmail === 'string' ? req.query.responsibleEmail : undefined;
    const startDate = parseDateParam(req.query.startDate);
    const endDate = parseDateParam(req.query.endDate);
    const { rows, total } = await slaBreachAlertService.listAlerts({ page, limit, search, responsibleEmail, startDate, endDate });
    res.json({ success: true, data: rows, total, page, limit });
  }),

  // GET /api/sla-breach-alerts/people — the responsible-person roster (name/email + total
  // + still-open counts), for grouping the list by who's responsible. Same optional
  // ?startDate=/?endDate= scoping as above, so counts reflect the selected range.
  listPeople: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const startDate = parseDateParam(req.query.startDate);
    const endDate = parseDateParam(req.query.endDate);
    const people = await slaBreachAlertService.listResponsiblePeople({ startDate, endDate });
    res.json({ success: true, data: people });
  }),

  // GET /api/sla-breach-alerts/:id/message — on-demand live Graph re-fetch of one past
  // alert's original customer message. Not stored anywhere; recomputed each time it's
  // asked for, since backfilling all historical rows up front was explicitly not wanted.
  getMessage: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await slaBreachAlertService.getOriginalMessage(req.params.id);
    res.json({ success: true, data: result });
  }),
};
