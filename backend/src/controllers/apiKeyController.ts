import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { apiKeyService } from '../services/apiKeyService';

// Scopes the Settings page's API Configuration UI manages — see API_KEY_SCOPES in
// frontend/src/app/(authenticated)/settings/page.tsx. Each is meant to eventually gate its
// own /api/external/<scope> export endpoint (not built yet — the endpoints those keys
// would protect don't exist, only the key management itself does).
const VALID_SCOPES = new Set(['all', 'migrationManager', 'mbr']);

function assertValidScope(scope: string): void {
  if (!VALID_SCOPES.has(scope)) {
    throw new AppError(`Unknown API key scope "${scope}"`, 400);
  }
}

export const apiKeyController = {
  get: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    assertValidScope(req.params.scope);
    const apiKey = await apiKeyService.getOrCreate(req.params.scope);
    res.json({ success: true, data: { apiKey } });
  }),

  regenerate: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    assertValidScope(req.params.scope);
    const apiKey = await apiKeyService.regenerate(req.params.scope);
    res.json({ success: true, data: { apiKey } });
  }),
};
