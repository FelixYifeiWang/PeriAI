import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // @ts-ignore
    const user = req.user as { id: string; userType: string };
    if (user.userType !== 'influencer') {
      return res.status(403).json({ message: 'Influencer access required' });
    }
    const userId = user.id as string;
    const accounts = await storage.getSocialAccountsByUser(userId);
    res.json(
      accounts.map((acc) => ({
        ...acc,
        accessToken: null,
        refreshToken: null,
      })),
    );
  } catch (error) {
    console.error('Error fetching social accounts:', error);
    res.status(500).json({ message: 'Failed to fetch social accounts' });
  }
});
