import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';

type Platform = 'instagram' | 'tiktok' | 'youtube';

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // @ts-ignore
  const user = req.user as { id: string; userType: string };
  if (user.userType !== 'influencer') {
    return res.status(403).json({ message: 'Influencer access required' });
  }

  const { platform, handle, followers, likes, url } = req.body ?? {};

  if (platform !== 'instagram' && platform !== 'tiktok' && platform !== 'youtube') {
    return res.status(400).json({ message: 'Invalid platform' });
  }

  if (!handle || typeof handle !== 'string' || !handle.trim()) {
    return res.status(400).json({ message: 'Handle is required' });
  }

  const parsedFollowers = parseNumber(followers);
  const parsedLikes = parseNumber(likes);

  try {
    const saved = await storage.upsertSocialAccount({
      userId: user.id,
      platform,
      handle: handle.trim(),
      platformAccountId: null,
      followers: parsedFollowers,
      likes: parsedLikes,
      rawProfile: url ? { manualUrl: url } : null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      lastSyncedAt: new Date(),
    });

    res.json({
      ...saved,
      accessToken: null,
      refreshToken: null,
    });
  } catch (error: any) {
    console.error('Manual social save error:', error);
    res.status(500).json({ message: error?.message || 'Failed to save social account' });
  }
});
