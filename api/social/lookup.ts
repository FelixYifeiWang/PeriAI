import type { VercelRequest, VercelResponse } from '@vercel/node';
import SocialBlade from 'socialblade';
import { requireAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';

type Platform = 'instagram' | 'tiktok' | 'youtube';

function inferPlatform(urlOrHandle: string): Platform | undefined {
  const lower = urlOrHandle.toLowerCase();
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  return undefined;
}

function extractHandle(urlOrHandle: string, platform: Platform): string | undefined {
  // If user typed a bare handle, accept it
  if (!urlOrHandle.includes('http')) {
    return urlOrHandle.replace(/^@/, '').trim() || undefined;
  }
  try {
    const parsed = new URL(urlOrHandle);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return undefined;
    if (platform === 'instagram' || platform === 'tiktok') {
      return parts[0]?.replace(/^@/, '');
    }
    if (platform === 'youtube') {
      if (parts[0] === 'channel' || parts[0] === 'c' || parts[0] === 'user') {
        return (parts[1] || '').replace(/^@/, '') || undefined;
      }
      if (parts[0].startsWith('@')) return parts[0].slice(1);
      return parts[0];
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function mapProfile(platform: Platform, raw: any) {
  const data = raw?.data ?? raw;
  const id = data?.id;
  const stats = data?.statistics?.total ?? data?.statistics ?? {};

  if (platform === 'youtube') {
    return {
      handle:
        id?.handle ||
        id?.cusername ||
        id?.username ||
        id?.display_name ||
        null,
      platformAccountId: id?.id || null,
      followers: stats.subscribers ?? null,
      likes: stats.views ?? null,
      rawProfile: raw ?? null,
    };
  }

  if (platform === 'tiktok') {
    return {
      handle: id?.username || id?.display_name || null,
      platformAccountId: id?.id || null,
      followers: stats.followers ?? null,
      likes: stats.likes ?? null,
      rawProfile: raw ?? null,
    };
  }

  // instagram
  return {
    handle: id?.username || id?.display_name || null,
    platformAccountId: id?.id || null,
    followers: stats.followers ?? null,
    likes: null,
    rawProfile: raw ?? null,
  };
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

  const { url, platform: rawPlatform } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ message: 'url is required' });
  }

  const platformParam =
    rawPlatform === 'instagram' || rawPlatform === 'tiktok' || rawPlatform === 'youtube'
      ? rawPlatform
      : undefined;
  const platform = platformParam ?? inferPlatform(url);
  if (!platform) {
    return res.status(400).json({ message: 'Unsupported platform URL. Please include full profile link.' });
  }
  const handle = extractHandle(url, platform);
  if (!handle) {
    return res.status(400).json({ message: 'Could not parse handle from URL' });
  }

  const clientId = process.env.SOCIALBLADE_CLIENT_ID;
  const accessToken = process.env.SOCIALBLADE_ACCESS_TOKEN;
  if (!clientId || !accessToken) {
    return res.status(500).json({ message: 'SOCIALBLADE_CLIENT_ID and SOCIALBLADE_ACCESS_TOKEN are required' });
  }

  try {
    const client = new SocialBlade(clientId, accessToken);
    let sbResponse: any;

    if (platform === 'youtube') {
      sbResponse = await client.youtube.user(handle);
    } else if (platform === 'tiktok') {
      sbResponse = await client.tiktok.user(handle);
    } else {
      sbResponse = await client.instagram.user(handle);
    }

    const hasStatusSuccess =
      sbResponse?.status?.success === true || sbResponse?.status?.success === 'true';
    const hasDataBlock = !!sbResponse?.data || !!(sbResponse && sbResponse.id);
    if (!hasStatusSuccess && !hasDataBlock) {
      console.error('SocialBlade lookup failure', { platform, handle, status: sbResponse?.status, dataKeys: Object.keys(sbResponse || {}) });
      const code = sbResponse?.status?.status;
      const errMsg = sbResponse?.status?.error || 'Lookup failed';
      throw new Error(code ? `${errMsg} (code ${code})` : errMsg);
    }

    const profile = mapProfile(platform, sbResponse);

    const saved = await storage.upsertSocialAccount({
      userId: user.id,
      platform,
      handle: profile.handle,
      platformAccountId: profile.platformAccountId,
      followers: profile.followers,
      likes: profile.likes,
      rawProfile: profile.rawProfile,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });

    res.json({
      ...saved,
      accessToken: null,
      refreshToken: null,
    });
  } catch (error: any) {
    console.error('Social lookup error:', error);
    res.status(502).json({ message: error?.message || 'Failed to fetch profile' });
  }
});
