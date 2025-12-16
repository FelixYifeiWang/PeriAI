import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/middleware.js';

type Platform = 'instagram' | 'tiktok' | 'youtube';

function resolveBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5000')
  );
}

function getRedirectUri() {
  return `${resolveBaseUrl()}/api/social/callback`;
}

function buildAuthUrl(platform: Platform) {
  const redirectUri = getRedirectUri();
  switch (platform) {
    case 'instagram': {
      const clientId = process.env.INSTAGRAM_CLIENT_ID;
      const scope = 'user_profile';
      if (!clientId) throw new Error('INSTAGRAM_CLIENT_ID not set');
      return `https://api.instagram.com/oauth/authorize?client_id=${encodeURIComponent(
        clientId,
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
        scope,
      )}&response_type=code&state=${platform}`;
    }
    case 'tiktok': {
      const clientKey = process.env.TIKTOK_CLIENT_KEY;
      const scope = 'user.info.basic';
      if (!clientKey) throw new Error('TIKTOK_CLIENT_KEY not set');
      return `https://www.tiktok.com/auth/authorize/?client_key=${encodeURIComponent(
        clientKey,
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
        scope,
      )}&state=${platform}`;
    }
    case 'youtube': {
      const clientId = process.env.YOUTUBE_CLIENT_ID;
      if (!clientId) throw new Error('YOUTUBE_CLIENT_ID not set');
      const scope = 'https://www.googleapis.com/auth/youtube.readonly';
      return [
        'https://accounts.google.com/o/oauth2/v2/auth',
        `?client_id=${encodeURIComponent(clientId)}`,
        `&redirect_uri=${encodeURIComponent(redirectUri)}`,
        `&response_type=code`,
        `&scope=${encodeURIComponent(scope)}`,
        `&access_type=offline`,
        `&prompt=consent`,
        `&state=${platform}`,
      ].join('');
    }
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

  const platform = req.query?.platform;
  if (platform !== 'instagram' && platform !== 'tiktok' && platform !== 'youtube') {
    return res.status(400).json({ message: 'Invalid platform' });
  }

  try {
    const url = buildAuthUrl(platform);
    // @ts-ignore
    req.session.socialOAuth = { platform };
    // @ts-ignore
    await new Promise<void>((resolve, reject) => req.session.save((err: any) => (err ? reject(err) : resolve())));
    res.writeHead(302, { Location: url });
    res.end();
  } catch (error: any) {
    console.error('Social connect error:', error);
    res.status(500).json({ message: error?.message || 'Failed to start social connect' });
  }
});
