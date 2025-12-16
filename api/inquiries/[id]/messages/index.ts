import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initAuth } from '../../../_lib/middleware.js';
import { storage } from '../../../_lib/storage.js';
import { generateChatResponse, type SupportedLanguage } from '../../../_lib/aiAgent.js';

async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Inquiry ID is required' });
    }

    const messages = await storage.getMessagesByInquiry(id);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const { id } = req.query;
    const rawLanguage = typeof req.body?.language === 'string' ? req.body.language : undefined;
    let requestLanguage: SupportedLanguage | undefined;
    if (rawLanguage === 'zh') requestLanguage = 'zh';
    else if (rawLanguage === 'en') requestLanguage = 'en';
    const { content } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Inquiry ID is required' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Get inquiry and verify it's active
    const inquiry = await storage.getInquiry(id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }

    if (!inquiry.chatActive) {
      return res.status(400).json({ message: 'This conversation has been closed' });
    }

    // Add user message
    const userMessage = await storage.addMessage({
      inquiryId: id,
      role: 'user',
      content,
    });

    await storage.updateLastBusinessMessage(id);

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

    const aiResponseContent = await generateChatResponse(
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

    // Add AI response
    const aiMessage = await storage.addMessage({
      inquiryId: id,
      role: 'assistant',
      content: aiResponseContent,
    });

    res.json({ userMessage, aiMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initAuth(req, res);

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
