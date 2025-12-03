import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { requireAuth } from '../../_lib/middleware.js';
import { storage } from '../../_lib/storage.js';
import { users, influencerPreferences, type Campaign } from '../../../shared/schema.js';
import { db } from '../../_lib/db.js';
import { desc, eq } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildCriteriaPrompt(campaign: Campaign) {
  return [
    "You are generating concise search criteria to find influencers for a campaign.",
    "Return a short, readable list (3-6 bullet lines) with keywords/traits, nothing else.",
    "Prioritize: audience fit, content type, language/region, budget tier, and deliverables.",
    "",
    `Campaign goal: ${campaign.campaignGoal || "N/A"}`,
    `Product: ${campaign.productDetails || "N/A"}`,
    `Audience: ${campaign.targetAudience || "N/A"}`,
    `Budget: ${campaign.budgetMin ?? "?"} - ${campaign.budgetMax ?? "?"}`,
    `Timeline: ${campaign.timeline || "N/A"}`,
    `Deliverables: ${campaign.deliverables || "N/A"}`,
    `Additional requirements: ${campaign.additionalRequirements || "None"}`,
  ].join("\n");
}

async function generateCriteria(campaign: Campaign) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You write concise bullet criteria for influencer search.' },
        { role: 'user', content: buildCriteriaPrompt(campaign) },
      ],
    });
    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('LLM criteria error:', error);
    return null;
  }
}

async function findInfluencers() {
  try {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        preferences: influencerPreferences.personalContentPreferences,
      })
      .from(users)
      .leftJoin(influencerPreferences, eq(users.id, influencerPreferences.userId))
      .where(eq(users.userType, 'influencer'))
      .orderBy(desc(users.createdAt))
      .limit(10);

    return result.map((r) => ({
      id: r.id,
      username: r.username ?? undefined,
      email: r.email ?? undefined,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.username || undefined,
      preferences: r.preferences ?? undefined,
    }));
  } catch (error) {
    console.error('Error fetching influencers:', error);
    return [];
  }
}

async function rerankInfluencers(criteria: string | null, influencers: Array<{ id: string; name?: string; username?: string; email?: string; preferences?: string | null }>) {
  if (!criteria || influencers.length === 0) return influencers;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You rank influencers for a campaign. Return JSON with array key "ranked", each item: {id, score (0-1), reason}. Be concise in reason.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            criteria,
            influencers,
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}') as { ranked?: Array<{ id: string; score?: number; reason?: string }> };
    const rankedMap = new Map<string, { score?: number; reason?: string }>();
    (parsed.ranked || []).forEach((r) => {
      if (r?.id) rankedMap.set(r.id, { score: r.score, reason: r.reason });
    });

    return influencers
      .map((inf) => {
        const extra = rankedMap.get(inf.id) || {};
        return { ...inf, score: extra.score ?? 0, reason: extra.reason };
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  } catch (error) {
    console.error('LLM rerank error:', error);
    return influencers;
  }
}

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  // @ts-ignore
  const user = req.user as { id: string; userType: string };
  if (user.userType !== 'business') {
    return res.status(403).json({ message: 'Business access required' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const candidate = await storage.getOldestProcessingCampaign(user.id);
    if (!candidate) {
      return res.status(404).json({ message: 'No campaigns to process' });
    }

    // Ensure status is processing while we search
    await storage.saveCampaignSearchResult(candidate.id, { status: 'processing' });

    const criteria = await generateCriteria(candidate);
    const influencers = await findInfluencers();
    const ranked = await rerankInfluencers(criteria, influencers);

    const updated = await storage.saveCampaignSearchResult(candidate.id, {
      status: 'waiting_approval',
      searchCriteria: criteria || "No criteria generated",
      matchedInfluencers: ranked,
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error processing campaign:', error);
    return res.status(500).json({ message: 'Failed to process campaign' });
  }
});
