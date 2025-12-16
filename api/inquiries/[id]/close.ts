import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initAuth } from '../../_lib/middleware.js';
import { storage } from '../../_lib/storage.js';
import { generateRecommendation, type SupportedLanguage } from '../../_lib/aiAgent.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await initAuth(req, res);

  try {
    const { id } = req.query;
    const rawLanguage = typeof req.body?.language === 'string' ? req.body.language : undefined;
    let requestLanguage: SupportedLanguage | undefined;
    if (rawLanguage === 'zh') requestLanguage = 'zh';
    else if (rawLanguage === 'en') requestLanguage = 'en';

    console.log('🔒 Closing chat for inquiry:', id);

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Inquiry ID is required' });
    }

    // Get inquiry
    const inquiry = await storage.getInquiry(id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }

    // ✅ Allow closing even if already closed (idempotent)
    if (!inquiry.chatActive) {
      console.log('⚠️ Chat already closed, returning existing inquiry');
      return res.json(inquiry);
    }

    // Get conversation history
    const conversationHistory = await storage.getMessagesByInquiry(id);

    // Get influencer preferences
    let preferences = await storage.getInfluencerPreferences(inquiry.influencerId);

    // Use default preferences if none are set
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

    const influencerUser = await storage.getUser(inquiry.influencerId);
    const resolvedLanguage: SupportedLanguage =
      requestLanguage ??
      (influencerUser?.languagePreference === 'zh'
        ? 'zh'
        : influencerUser?.languagePreference === 'en'
          ? 'en'
          : 'en');

    const recommendation = await generateRecommendation(
      conversationHistory,
      {
        businessEmail: inquiry.businessEmail,
        message: inquiry.message,
        price: inquiry.price,
        companyInfo: inquiry.companyInfo,
      },
      preferences,
      resolvedLanguage
    );

    // Close chat and save recommendation
    const updatedInquiry = await storage.closeInquiryChat(id, recommendation);

    console.log('✅ Chat closed successfully');
    res.json(updatedInquiry);
  } catch (error: any) {
    console.error('❌ Error closing chat:', error);
    res.status(500).json({ message: 'Failed to close chat', error: error.message });
  }
}
