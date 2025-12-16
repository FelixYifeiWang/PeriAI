import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../_lib/middleware.js';
import { storage } from '../../../_lib/storage.js';
import { draftInquiryFromCampaign, generateInquiryResponse, generateRecommendation, type SupportedLanguage } from '../../../_lib/aiAgent.js';
import type { BusinessProfile, Campaign, InfluencerPreferences, User } from '../../../../shared/schema.js';

function getDefaultPreferences(userId: string): InfluencerPreferences {
  return {
    id: 'default',
    userId,
    personalContentPreferences: 'Various collaboration opportunities',
    monetaryBaseline: 500,
    contentLength: 'Flexible',
    additionalGuidelines: null,
    socialLinks: {},
    createdAt: null,
    updatedAt: null,
  };
}

function resolveLanguage(user?: User | null): SupportedLanguage {
  return user?.languagePreference === 'zh' ? 'zh' : 'en';
}

async function autoSendInquiriesForCampaign(campaign: Campaign, businessUser: User | undefined | null, businessProfile: BusinessProfile | undefined | null) {
  // Normalize matched influencers (jsonb can come back as object or stringified)
  let matches: Array<{ id?: string }> = [];
  const rawMatches: unknown = (campaign as any).matchedInfluencers;
  if (Array.isArray(rawMatches)) {
    matches = rawMatches as Array<{ id?: string }>;
  } else if (typeof rawMatches === 'string') {
    try {
      const parsed = JSON.parse(rawMatches);
      if (Array.isArray(parsed)) {
        matches = parsed;
      }
    } catch {
      matches = [];
    }
  }

  if (!matches.length) {
    console.warn('⚠️  No matched influencers on campaign, skipping outreach', campaign.id);
    return 0;
  }
  const businessEmail = businessUser?.email;
  if (!businessEmail) {
    console.warn('⚠️  No business email found, skipping automated outreach');
    return 0;
  }

  let created = 0;
  for (const match of matches) {
    const influencerId = match?.id;
    if (!influencerId) continue;

    try {
      const influencer = await storage.getUser(influencerId);
      const prefs = (await storage.getInfluencerPreferences(influencerId)) ?? getDefaultPreferences(influencerId);
      const language = resolveLanguage(influencer);

      const drafted = await draftInquiryFromCampaign({
        campaign,
        businessProfile,
        influencerPreferences: prefs,
        influencer,
        language,
      });

      const price =
        Number.isFinite(drafted.offerPrice) && drafted.offerPrice != null
          ? Math.round(drafted.offerPrice as number)
          : undefined;

      const companyInfo =
        businessProfile?.description ||
        businessProfile?.companyName ||
        businessProfile?.industry ||
        undefined;

      const inquiry = await storage.createInquiry({
        influencerId,
        businessId: campaign.businessId,
        campaignId: campaign.id,
        businessEmail,
        message: drafted.message,
        price: price ?? undefined,
        companyInfo,
      });

      await storage.addMessage({
        inquiryId: inquiry.id,
        role: 'user',
        content: drafted.message,
      });

      const aiResponse = await generateInquiryResponse(
        {
          businessEmail,
          message: drafted.message,
          price: price ?? undefined,
          companyInfo,
        },
        prefs,
        language,
      );

      await storage.updateInquiryStatus(inquiry.id, 'pending', aiResponse);
      await storage.addMessage({
        inquiryId: inquiry.id,
        role: 'assistant',
        content: aiResponse,
      });

      const conversationHistory = await storage.getMessagesByInquiry(inquiry.id);

      const recommendation = await generateRecommendation(
        conversationHistory,
        {
          businessEmail,
          message: drafted.message,
          price: price ?? undefined,
          companyInfo,
        },
        prefs,
        language,
      );

      await storage.closeInquiryChat(inquiry.id, recommendation);
      created += 1;
    } catch (error) {
      console.error('❌ Failed to auto-send inquiry for campaign', campaign.id, 'to', influencerId, error);
    }
  }

  return created;
}

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  // @ts-ignore
  const user = req.user as { id: string; userType: string };

  if (user.userType !== 'business') {
    return res.status(403).json({ message: 'Business access required' });
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;
  const { status } = req.body ?? {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Campaign ID is required' });
  }

  if (!['waiting_approval', 'negotiating', 'waiting_response', 'deal', 'denied'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const campaign = await storage.getCampaign(id);
    if (!campaign || campaign.businessId !== user.id) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    const previousStatus = campaign.status;
    const updated = await storage.updateCampaignStatus(id, status);

    if (status === 'negotiating' && previousStatus !== 'negotiating') {
      const businessUser = await storage.getUser(user.id);
      const businessProfile = await storage.getBusinessProfile(user.id);
      const created = await autoSendInquiriesForCampaign(campaign, businessUser, businessProfile);
      if (created && created > 0) {
        const waiting = await storage.updateCampaignStatus(id, 'waiting_response');
        return res.json(waiting);
      } else {
        console.warn('⚠️  No inquiries created; staying in negotiating');
        return res.json(updated);
      }
    }

    return res.json(updated);
  } catch (error) {
    console.error('Error updating campaign status:', error);
    return res.status(500).json({ message: 'Failed to update campaign status' });
  }
});
