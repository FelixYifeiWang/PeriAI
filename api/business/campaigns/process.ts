import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { requireAuth } from '../../_lib/middleware.js';
import { storage } from '../../_lib/storage.js';
import { users, influencerPreferences, influencerSocialAccounts, type Campaign } from '../../../shared/schema.js';
import { db } from '../../_lib/db.js';
import { desc, eq, and } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildCriteriaPrompt(campaign: Campaign) {
  return [
    "You are generating concise search criteria to find influencers for a campaign.",
    "Return a short, readable list (3-6 bullet lines) with keywords/traits, nothing else.",
    "Keywords must be generic categories or attributes, never brand names.",
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

async function extractFilters(criteriaText: string | null, campaign: Campaign) {
  if (!criteriaText) return null;
  const prompt = [
    "Convert the campaign details and criteria into a JSON filter for querying a DB of influencers.",
    "JSON shape:",
    "{ keywords: string[]; languages: string[]; regions: string[]; minBudget?: number; maxBudget?: number; contentTypes?: string[] }",
    "Keep arrays short (<=5). Omit empty fields. Keywords must be generic (categories/attributes), never brand names.",
    "",
    "Campaign info:",
    `Goal: ${campaign.campaignGoal}`,
    `Product: ${campaign.productDetails}`,
    `Audience: ${campaign.targetAudience}`,
    `Budget: ${campaign.budgetMin ?? ""}-${campaign.budgetMax ?? ""}`,
    `Timeline: ${campaign.timeline}`,
    `Deliverables: ${campaign.deliverables}`,
    `Additional: ${campaign.additionalRequirements ?? ""}`,
    "",
    "Criteria text:",
    criteriaText,
  ].join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only JSON matching the requested shape, no prose." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}");
    return parsed;
  } catch (error) {
    console.error("LLM filter parse error:", error);
    return null;
  }
}

type Filter = {
  keywords?: string[];
  languages?: string[];
  regions?: string[];
  minBudget?: number;
  maxBudget?: number;
  contentTypes?: string[];
};

async function findInfluencers(filters: Filter | null) {
  try {
    const conditions = [eq(users.userType, 'influencer')];
    if (filters?.languages?.length) {
      // approximate language preference match
      conditions.push(eq(users.languagePreference, filters.languages[0].toLowerCase().startsWith("zh") ? "zh" : "en"));
    }
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        preferences: influencerPreferences.personalContentPreferences,
        baseline: influencerPreferences.monetaryBaseline,
        primaryPlatform: influencerSocialAccounts.platform,
        primaryFollowers: influencerSocialAccounts.followers,
        primaryLikes: influencerSocialAccounts.likes,
      })
      .from(users)
      .leftJoin(influencerPreferences, eq(users.id, influencerPreferences.userId))
      .leftJoin(
        influencerSocialAccounts,
        and(
          eq(influencerSocialAccounts.userId, users.id),
          eq(influencerSocialAccounts.isPrimary, true),
        ),
      )
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(10);

    const filtered = result.filter((r) => {
      if (!filters) return true;
      const baseline = r.baseline ?? 0;
      if (filters.maxBudget && baseline > filters.maxBudget) return false;
      return true;
    });

    return filtered.map((r) => ({
      id: r.id,
      username: r.username ?? undefined,
      email: r.email ?? undefined,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.username || undefined,
      preferences: r.preferences ?? undefined,
      primaryPlatform: r.primaryPlatform ?? undefined,
      primaryFollowers: r.primaryFollowers ?? undefined,
      primaryLikes: r.primaryLikes ?? undefined,
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
        const baseScore = extra.score ?? 0;
        const displayName = (inf.name || inf.username || "").trim().toLowerCase();
        const isUnknown = displayName.length === 0;
        const isTestName = displayName.includes("test");
        const adjustedScore = isUnknown ? -2 : isTestName ? -1 : baseScore;
        return { ...inf, score: adjustedScore, reason: extra.reason };
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
    const filters = await extractFilters(criteria, candidate);
    const influencers = await findInfluencers(filters);
    const ranked = await rerankInfluencers(criteria, influencers);

    const updated = await storage.saveCampaignSearchResult(candidate.id, {
      status: 'waiting_approval',
      searchCriteria: filters ? JSON.stringify(filters) : criteria || "No criteria generated",
      matchedInfluencers: ranked,
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error processing campaign:', error);
    return res.status(500).json({ message: 'Failed to process campaign' });
  }
});
