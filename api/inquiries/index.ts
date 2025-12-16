import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, initAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';
// ✅ CHANGE 1: Fix import path
import { insertInquirySchema } from '../../shared/schema.js';
import { fromError } from 'zod-validation-error';
import { generateInquiryResponse, type SupportedLanguage } from '../_lib/aiAgent.js';

// ✅ CHANGE 2: Remove type annotation from handleGet
async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    // @ts-ignore - user is added by requireAuth middleware
    const userId = req.user.id;
    const inquiries = await storage.getInquiriesByInfluencer(userId);
    res.json(inquiries);
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    res.status(500).json({ message: 'Failed to fetch inquiries' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    const rawLanguage = typeof rawBody.language === 'string' ? rawBody.language : undefined;
    let requestLanguage: SupportedLanguage | undefined;
    if (rawLanguage === 'zh') requestLanguage = 'zh';
    else if (rawLanguage === 'en') requestLanguage = 'en';

    const {
      language: _ignoredLanguage,
      price: rawPrice,
      attachmentUrl: rawAttachmentUrl,
      ...rest
    } = rawBody;

    const parsedPrice =
      typeof rawPrice === 'string'
        ? Number.parseInt(rawPrice, 10)
        : typeof rawPrice === 'number'
          ? rawPrice
          : undefined;

    // Parse body
    const body = {
      ...rest,
      price: Number.isFinite(parsedPrice as number) ? (parsedPrice as number) : undefined,
      // Note: File uploads will need special handling with Vercel Blob
      attachmentUrl: typeof rawAttachmentUrl === 'string' ? rawAttachmentUrl : undefined,
    };

    const validation = insertInquirySchema.safeParse(body);

    if (!validation.success) {
      return res.status(400).json({ message: fromError(validation.error).toString() });
    }

    // Attempt to associate inquiry with authenticated business accounts
    // @ts-ignore - added by initAuth
    const sessionUser = req.user as { id: string; userType: string; email?: string } | undefined;
    const isBusinessUser = sessionUser?.userType === 'business';

    const inquiryPayload = {
      ...validation.data,
      businessId: isBusinessUser ? sessionUser.id : undefined,
      businessEmail:
        isBusinessUser && sessionUser?.email ? sessionUser.email : validation.data.businessEmail,
    };

    const inquiry = await storage.createInquiry(inquiryPayload);

    // Get influencer preferences and generate AI response
    let preferences = await storage.getInfluencerPreferences(validation.data.influencerId);

    // Use default preferences if none are set
    if (!preferences) {
      preferences = {
        id: 'default',
        userId: validation.data.influencerId,
        personalContentPreferences: 'Various collaboration opportunities',
        monetaryBaseline: 500,
        contentLength: 'Flexible',
        additionalGuidelines: null,
        socialLinks: {},
        createdAt: null,
        updatedAt: null,
      };
    }

    const influencerUser = await storage.getUser(validation.data.influencerId);
    const resolvedLanguage: SupportedLanguage =
      requestLanguage ??
      (influencerUser?.languagePreference === 'zh'
        ? 'zh'
        : influencerUser?.languagePreference === 'en'
          ? 'en'
          : 'en');

    const aiResponse = await generateInquiryResponse(
      {
        businessEmail: inquiryPayload.businessEmail,
        message: validation.data.message,
        price: validation.data.price,
        companyInfo: validation.data.companyInfo,
      },
      preferences,
      resolvedLanguage
    );

    await storage.updateInquiryStatus(inquiry.id, 'pending', aiResponse);

    // Create initial AI message in chat
    await storage.addMessage({
      inquiryId: inquiry.id,
      role: 'assistant',
      content: aiResponse,
    });

    res.json({ ...inquiry, aiResponse });
  } catch (error) {
    console.error('Error creating inquiry:', error);
    res.status(500).json({ message: 'Failed to create inquiry' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // GET requires auth
    return requireAuth(handleGet)(req, res);
  } else if (req.method === 'POST') {
    // POST is public (businesses submit inquiries)
    await initAuth(req, res);
    return handlePost(req, res);
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
