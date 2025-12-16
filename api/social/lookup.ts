import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';

type Platform = 'instagram' | 'tiktok' | 'youtube';

function inferPlatform(url: string): Platform | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
    return undefined;
  } catch {
    return undefined;
  }
}

function buildProviderCandidates(platform: Platform, baseUrl: string) {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  return [
    `${trimmedBase}/v1/${platform}/profile`,
    `${trimmedBase}/v1/${platform}`,
    `${trimmedBase}/${platform}/profile`,
    `${trimmedBase}/${platform}`,
  ];
}

function extractProfile(raw: any) {
  const data = raw?.data ?? raw;
  const handle =
    data?.username ||
    data?.uniqueId ||
    data?.customUrl ||
    data?.title ||
    data?.handle ||
    null;
  const platformAccountId = data?.id || data?.channelId || data?.uid || data?.openId || null;
  const followers =
    data?.followers ||
    data?.followers_count ||
    data?.follower_count ||
    data?.subscriberCount ||
    data?.subscriber_count ||
    null;
  const likes =
    data?.likes ||
    data?.diggCount ||
    data?.likes_count ||
    data?.likeCount ||
    data?.viewCount ||
    null;

  return {
    handle: handle ?? null,
    platformAccountId: platformAccountId ?? null,
    followers: typeof followers === 'number' ? followers : followers ? Number(followers) : null,
    likes: typeof likes === 'number' ? likes : likes ? Number(likes) : null,
    rawProfile: data ?? raw ?? null,
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

  const { url } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ message: 'url is required' });
  }

  const platform = inferPlatform(url);
  if (!platform) {
    return res.status(400).json({ message: 'Unsupported platform URL' });
  }

  const apiKey = process.env.SOCIALDATA_API_KEY;
  const baseUrl = process.env.SOCIALDATA_BASE_URL || 'https://api.socialdata.tools';
  if (!apiKey) {
    return res.status(500).json({ message: 'SOCIALDATA_API_KEY is not set' });
  }

  try {
    const candidates = buildProviderCandidates(platform, baseUrl);
    let body: any;
    let lastError: unknown;
    let gotResult = false;

    for (const candidate of candidates) {
      const endpointUrl = `${candidate}?${new URLSearchParams({
        url,
        link: url,
        apikey: apiKey,
      }).toString()}`;
      try {
        const resp = await fetch(endpointUrl, { headers: { Accept: 'application/json' } });
        if (!resp.ok) {
          if (resp.status === 404) {
            lastError = await resp.text();
            continue;
          }
          const text = await resp.text();
          throw new Error(`Lookup failed (${resp.status}): ${text}`);
        }
        body = await resp.json();
        gotResult = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!gotResult) {
      throw new Error(
        typeof lastError === 'string'
          ? lastError
          : (lastError as Error)?.message || 'Lookup failed for all endpoints',
      );
    }

    const profile = extractProfile(body);

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
      lastSyncedAt: new Date(),
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
