import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';

type Platform = 'instagram' | 'tiktok' | 'youtube';

async function refreshInstagram(accessToken: string) {
  // Instagram Basic Display does not expose follower counts; reuse profile.
  const profileRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
  );
  if (!profileRes.ok) throw new Error(`Instagram profile error: ${await profileRes.text()}`);
  const profile = await profileRes.json();
  return {
    handle: profile.username as string | undefined,
    platformAccountId: profile.id as string | undefined,
    followers: null,
    likes: null,
    rawProfile: profile,
  };
}

async function refreshTikTok(accessToken: string) {
  const profileRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw new Error(`TikTok profile error: ${await profileRes.text()}`);
  const profileJson = await profileRes.json();
  const profile = profileJson?.data?.user;
  return {
    handle: profile?.display_name as string | undefined,
    platformAccountId: profile?.open_id as string | undefined,
    followers: profile?.follower_count ?? null,
    likes: profile?.likes_count ?? null,
    rawProfile: profile,
  };
}

async function refreshYouTube(accessToken: string) {
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
    handle: snippet?.customUrl || snippet?.title,
    platformAccountId: channel?.id as string | undefined,
    followers: stats?.subscriberCount ? Number(stats.subscriberCount) : null,
    likes: stats?.viewCount ? Number(stats.viewCount) : null,
    rawProfile: channel,
  };
}

async function refreshProfile(platform: Platform, accessToken: string) {
  switch (platform) {
    case 'instagram':
      return refreshInstagram(accessToken);
    case 'tiktok':
      return refreshTikTok(accessToken);
    case 'youtube':
      return refreshYouTube(accessToken);
  }
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

  const { platform } = req.body ?? {};
  if (platform !== 'instagram' && platform !== 'tiktok' && platform !== 'youtube') {
    return res.status(400).json({ message: 'Invalid platform' });
  }

  try {
    const userId = user.id as string;
    const accounts = await storage.getSocialAccountsByUser(userId);
    const account = accounts.find((a) => a.platform === platform);
    if (!account || !account.accessToken) {
      return res.status(404).json({ message: 'Account not connected' });
    }

    const refreshed = await refreshProfile(platform, account.accessToken);

    const updated = await storage.touchSocialAccountSync(userId, platform, {
      handle: refreshed.handle ?? account.handle,
      platformAccountId: refreshed.platformAccountId ?? account.platformAccountId,
      followers: refreshed.followers ?? account.followers,
      likes: refreshed.likes ?? account.likes,
      rawProfile: refreshed.rawProfile ?? account.rawProfile,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Social sync error:', error);
    res.status(500).json({ message: error?.message || 'Failed to sync account' });
  }
});
