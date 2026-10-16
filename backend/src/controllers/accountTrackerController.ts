import { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { HubSpotError } from '../services/accountTrackerHubspot';
import * as tracker from '../services/accountTrackerService';
import { TrackerError, TrackerUser } from '../services/accountTrackerService';

// Customer Success → Account Tracker endpoints (/api/customer-success/accounts/...).
// "?owner=<HubSpot owner id>" picks whose book an admin is viewing; everyone else always gets their own.

const userOf = (req: Request): TrackerUser => (req as unknown as { user: TrackerUser }).user;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);
const flag = (v: unknown): boolean => v === 'true' || v === '1';
const isoDay = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// HubSpot failures and access refusals are expected outcomes, not server bugs: answer them here so they never reach
// the global error handler (which would log them as self-heal incidents).
function failure(res: Response, e: unknown): boolean {
  if (e instanceof TrackerError) {
    res.status(e.status).json({ success: false, error: { message: e.message, detail: e.detail } });
    return true;
  }
  if (e instanceof HubSpotError) {
    const status = e.status === 0 ? 503 : e.status === 400 || e.status === 404 ? 400 : e.status === 409 ? 409 : 502;
    res.status(status).json({ success: false, error: { message: 'HubSpot request failed', detail: e.message } });
    return true;
  }
  return false;
}

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (!failure(res, e)) next(e);
    }
  });

const view = (req: Request) => tracker.viewKey(userOf(req), req.query.owner);
const isAdmin = (req: Request) => userOf(req).role === 'ADMIN';

export const accountTrackerController = {
  me: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.me(userOf(req)) });
  }),

  status: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.status(await view(req)) });
  }),

  sync: handle(async (req, res) => {
    res.status(202).json({ success: true, data: await tracker.sync(await view(req)) });
  }),

  metrics: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.metrics(await view(req)) });
  }),

  stat: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.stat(await view(req), req.params.key) });
  }),

  companies: handle(async (req, res) => {
    const q = req.query;
    const data = await tracker.list(await view(req), {
      search: str(q.search),
      tier: str(q.tier),
      mspOnly: flag(q.msp),
      openDealsOnly: flag(q.openDeals),
      minEmployees: int(q.minEmployees),
      maxEmployees: int(q.maxEmployees),
      countries: strings(q.country),
      industryGroups: strings(q.industryGroup),
      probabilities: strings(q.probability),
    });
    res.json({ success: true, data });
  }),

  filterOptions: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.filterOptions(await view(req)) });
  }),

  priority: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.priority(await view(req)) });
  }),

  lookup: handle(async (req, res) => {
    const id = await tracker.lookup(await view(req), str(req.query.name) ?? '');
    if (id == null) {
      res.status(404).json({ success: false, error: { message: 'Not found', detail: 'No company with that name' } });
      return;
    }
    res.json({ success: true, data: { id } });
  }),

  company: handle(async (req, res) => {
    // admins can open any company from a link; everyone else only companies in their own book (others 404)
    const scope = isAdmin(req) ? null : await view(req);
    res.json({ success: true, data: await tracker.detail(scope, Number(req.params.id)) });
  }),

  activity: handle(async (req, res) => {
    const scope = isAdmin(req) ? null : await view(req);
    res.json({ success: true, data: await tracker.activity(scope, Number(req.params.id), flag(req.query.refresh)) });
  }),

  contacts: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.contacts(await view(req)) });
  }),

  deals: handle(async (req, res) => {
    const q = req.query;
    const data = await tracker.dealsPage(await view(req), {
      from: isoDay(q.from),
      to: isoDay(q.to),
      dateField: q.date === 'created' ? 'created' : 'close',
      status: str(q.status),
      pipeline: str(q.pipeline),
      search: str(q.search),
      owner: str(q.dealOwner),
    });
    res.json({ success: true, data });
  }),

  top20: handle(async (req, res) => {
    const type = String(req.query.type ?? '').toLowerCase() === 'msps' ? 'msps' : 'companies';
    res.json({ success: true, data: await tracker.top20(await view(req), type) });
  }),

  insights: handle(async (req, res) => {
    res.json({ success: true, data: await tracker.insights(await view(req)) });
  }),

  owners: handle(async (_req, res) => {
    res.json({ success: true, data: await tracker.owners() });
  }),

  links: handle(async (_req, res) => {
    res.json({ success: true, data: await tracker.links() });
  }),

  setLink: handle(async (req, res) => {
    const body = (req.body ?? {}) as { ownerId?: unknown };
    res.json({ success: true, data: await tracker.setLink(req.params.userId, body.ownerId, String(userOf(req).id)) });
  }),
};
