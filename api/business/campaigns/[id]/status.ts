import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../_lib/middleware.js';
import { storage } from '../../../_lib/storage.js';

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  // @ts-ignore
  const user = req.user as { id: string; userType: string };

  if (user.userType !== 'business') {
    return res.status(403).json({ message: 'Business access required' });
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;
  const { status } = req.body ?? {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Campaign ID is required' });
  }

  if (!['waiting_approval', 'finished', 'denied'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const campaign = await storage.getCampaign(id);
    if (!campaign || campaign.businessId !== user.id) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    const updated = await storage.updateCampaignStatus(id, status);
    return res.json(updated);
  } catch (error) {
    console.error('Error updating campaign status:', error);
    return res.status(500).json({ message: 'Failed to update campaign status' });
  }
});
