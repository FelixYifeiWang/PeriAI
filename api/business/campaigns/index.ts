import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../_lib/middleware.js';
import { storage } from '../../_lib/storage.js';
import { insertCampaignSchema } from '../../../shared/schema.js';
import { fromError } from 'zod-validation-error';

function parseOptionalNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'string'
      ? Number.parseInt(value, 10)
      : typeof value === 'number'
        ? value
        : undefined;
  return Number.isFinite(parsed as number) ? (parsed as number) : undefined;
}

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  // @ts-ignore
  const user = req.user as { id: string; userType: string };

  if (user.userType !== 'business') {
    return res.status(403).json({ message: 'Business access required' });
  }

  if (req.method === 'GET') {
    try {
      const campaigns = await storage.getCampaignsByBusiness(user.id);
      return res.json(campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ message: 'Failed to fetch campaigns' });
    }
  }

  if (req.method === 'POST') {
    try {
      const rawBody = req.body ?? {};
      const validation = insertCampaignSchema.safeParse({
        ...rawBody,
        businessId: user.id,
        budgetMin: parseOptionalNumber((rawBody as Record<string, unknown>).budgetMin),
        budgetMax: parseOptionalNumber((rawBody as Record<string, unknown>).budgetMax),
      });

      if (!validation.success) {
        return res.status(400).json({ message: fromError(validation.error).toString() });
      }

      const campaign = await storage.createCampaign(validation.data);
      return res.status(201).json(campaign);
    } catch (error) {
      console.error('Error creating campaign:', error);
      return res.status(500).json({ message: 'Failed to create campaign' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
});
