import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';

type Platform = 'instagram' | 'tiktok' | 'youtube';

function resolveBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5000')
  );
}

const redirectUri = `${resolveBaseUrl()}/api/social/callback`;

async function exchangeInstagram(code: string) {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Instagram credentials missing');

  const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Instagram token error: ${await tokenRes.text()}`);
  }
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;

  // Basic Display API does not provide follower counts; fetch username/id.
  const profileRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
  );
  if (!profileRes.ok) throw new Error(`Instagram profile error: ${await profileRes.text()}`);
  const profile = await profileRes.json();
  return {
    platformAccountId: profile.id as string | undefined,
    handle: profile.username as string | undefined,
    followers: null,
    likes: null,
    accessToken,
    refreshToken: null,
    expiresAt: null,
    rawProfile: profile,
  };
}

async function exchangeTikTok(code: string) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error('TikTok credentials missing');

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error(`TikTok token error: ${await tokenRes.text()}`);
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson?.data?.access_token as string;
  const refreshToken = tokenJson?.data?.refresh_token as string | null;
  const expiresIn = tokenJson?.data?.expires_in as number | undefined;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  const profileRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw new Error(`TikTok profile error: ${await profileRes.text()}`);
  const profileJson = await profileRes.json();
  const profile = profileJson?.data?.user;

  return {
    platformAccountId: profile?.open_id as string | undefined,
    handle: profile?.display_name as string | undefined,
    followers: profile?.follower_count ?? null,
    likes: profile?.likes_count ?? null,
    accessToken,
    refreshToken,
    expiresAt,
    rawProfile: profile,
  };
}

async function exchangeYouTube(code: string) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('YouTube credentials missing');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      access_type: 'offline',
    }),
  });
  if (!tokenRes.ok) throw new Error(`YouTube token error: ${await tokenRes.text()}`);
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;
  const refreshToken = (tokenJson.refresh_token as string | undefined) ?? null;
  const expiresIn = tokenJson.expires_in as number | undefined;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  const profileRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!profileRes.ok) throw new Error(`YouTube profile error: ${await profileRes.text()}`);
  const profileJson = await profileRes.json();
  const channel = profileJson.items?.[0];
  const stats = channel?.statistics ?? {};
  const snippet = channel?.snippet ?? {};

  return {
    platformAccountId: channel?.id as string | undefined,
    handle: snippet?.customUrl || snippet?.title,
    followers: stats?.subscriberCount ? Number(stats.subscriberCount) : null,
    likes: stats?.viewCount ? Number(stats.viewCount) : null,
    accessToken,
    refreshToken,
    expiresAt,
    rawProfile: channel,
  };
}

async function fetchProfile(platform: Platform, code: string) {
  switch (platform) {
    case 'instagram':
      return exchangeInstagram(code);
    case 'tiktok':
      return exchangeTikTok(code);
    case 'youtube':
      return exchangeYouTube(code);
  }
}

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // @ts-ignore
  const user = req.user as { id: string; userType: string };
  if (user.userType !== 'influencer') {
    return res.status(403).json({ message: 'Influencer access required' });
  }

  const { code, state } = req.query;
  const platform = (state || req.query?.platform) as Platform | undefined;

  if (platform !== 'instagram' && platform !== 'tiktok' && platform !== 'youtube') {
    return res.status(400).json({ message: 'Invalid platform' });
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ message: 'Missing code' });
  }

  try {
    const userId = user.id as string;
    const profile = await fetchProfile(platform, code);

    await storage.upsertSocialAccount({
      userId,
      platform,
      handle: profile.handle ?? null,
      platformAccountId: profile.platformAccountId ?? null,
      followers: profile.followers ?? null,
      likes: profile.likes ?? null,
      rawProfile: profile.rawProfile ?? null,
      accessToken: profile.accessToken ?? null,
      refreshToken: profile.refreshToken ?? null,
      expiresAt: profile.expiresAt ?? null,
      lastSyncedAt: new Date(),
    });

    // Redirect back to influencer settings/onboarding
    const destination = '/influencer/onboarding';
    res.writeHead(302, { Location: destination });
    res.end();
  } catch (error: any) {
    console.error('Social callback error:', error);
    res
      .status(500)
      .json({ message: error?.message || 'Failed to connect account', platform });
  }
});
