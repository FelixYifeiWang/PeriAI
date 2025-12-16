import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../_lib/storage.js';
import { generateRecommendation, type SupportedLanguage } from '../_lib/aiAgent.js';

const IDLE_MINUTES = 10;

function getAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('⚠️  CRON_SECRET is not set; rejecting request');
    return false;
  }

  const header = req.headers['authorization'];
  if (header === `Bearer ${secret}`) return true;

  const querySecret = typeof req.query?.secret === 'string' ? req.query.secret : undefined;
  return querySecret === secret;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!getAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const threshold = new Date(Date.now() - IDLE_MINUTES * 60 * 1000);
    const idleInquiries = await storage.getIdleOpenInquiries(threshold);

    const results: Array<{ inquiryId: string; status: 'closed' | 'failed'; error?: string }> = [];

    for (const inquiry of idleInquiries) {
      try {
        const conversationHistory = await storage.getMessagesByInquiry(inquiry.id);

        let preferences = await storage.getInfluencerPreferences(inquiry.influencerId);
        if (!preferences) {
          preferences = {
            id: 'default',
            userId: inquiry.influencerId,
            personalContentPreferences: 'Various collaboration opportunities',
            monetaryBaseline: 500,
            contentLength: 'Flexible',
            additionalGuidelines: null,
            socialLinks: {},
            createdAt: null,
            updatedAt: null,
          };
        }

        const influencer = await storage.getUser(inquiry.influencerId);
        const language: SupportedLanguage = influencer?.languagePreference === 'zh' ? 'zh' : 'en';

        const recommendation = await generateRecommendation(
          conversationHistory,
          {
            businessEmail: inquiry.businessEmail,
            message: inquiry.message,
            price: inquiry.price,
            companyInfo: inquiry.companyInfo,
          },
          preferences,
          language,
        );

        await storage.closeInquiryChat(inquiry.id, recommendation);

        results.push({ inquiryId: inquiry.id, status: 'closed' });
      } catch (error: any) {
        console.error('❌ Failed to auto-close inquiry', inquiry.id, error);
        results.push({ inquiryId: inquiry.id, status: 'failed', error: error?.message ?? 'Unknown error' });
      }
    }

    res.json({ closed: results.filter((r) => r.status === 'closed').length, details: results });
  } catch (error: any) {
    console.error('❌ Error in idle close cron:', error);
    res.status(500).json({ message: 'Failed to close idle conversations', error: error?.message ?? 'Unknown error' });
  }
}
