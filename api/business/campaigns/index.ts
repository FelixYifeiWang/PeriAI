import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { requireAuth } from '../../_lib/middleware.js';
import { storage } from '../../_lib/storage.js';
import { insertCampaignSchema } from '../../../shared/schema.js';
import { fromError } from 'zod-validation-error';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseOptionalNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'string'
      ? Number.parseInt(value, 10)
      : typeof value === 'number'
        ? value
        : undefined;
  return Number.isFinite(parsed as number) ? (parsed as number) : undefined;
}

async function normalizeCampaignInput(data: {
  businessId: string;
  productDetails: string;
  campaignGoal: string;
  targetAudience: string;
  budgetMin?: number;
  budgetMax?: number;
  timeline: string;
  deliverables: string;
  additionalRequirements?: string | null;
}) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You clean campaign input for database storage. Return JSON only. Keep text concise and specific. Normalize budget numbers (integers, no currency symbols). Preserve meaning; do not invent data. Keys: productDetails, campaignGoal, targetAudience, budgetMin, budgetMax, timeline, deliverables, additionalRequirements.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            businessId: data.businessId,
            productDetails: data.productDetails,
            campaignGoal: data.campaignGoal,
            targetAudience: data.targetAudience,
            budgetMin: data.budgetMin ?? null,
            budgetMax: data.budgetMax ?? null,
            timeline: data.timeline,
            deliverables: data.deliverables,
            additionalRequirements: data.additionalRequirements ?? null,
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');

    return {
      businessId: data.businessId,
      productDetails: typeof parsed.productDetails === 'string' ? parsed.productDetails : data.productDetails,
      campaignGoal: typeof parsed.campaignGoal === 'string' ? parsed.campaignGoal : data.campaignGoal,
      targetAudience: typeof parsed.targetAudience === 'string' ? parsed.targetAudience : data.targetAudience,
      budgetMin: parseOptionalNumber(parsed.budgetMin) ?? data.budgetMin,
      budgetMax: parseOptionalNumber(parsed.budgetMax) ?? data.budgetMax,
      timeline: typeof parsed.timeline === 'string' ? parsed.timeline : data.timeline,
      deliverables: typeof parsed.deliverables === 'string' ? parsed.deliverables : data.deliverables,
      additionalRequirements:
        typeof parsed.additionalRequirements === 'string'
          ? parsed.additionalRequirements
          : data.additionalRequirements ?? undefined,
    };
  } catch (error) {
    console.error('Campaign normalization failed, using raw input:', error);
    return data;
  }
}

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  // @ts-ignore
  const user = req.user as { id: string; userType: string };

  if (user.userType !== 'business') {
    return res.status(403).json({ message: 'Business access required' });
  }

  if (req.method === 'GET') {
    try {
      const campaigns = await storage.getCampaignsByBusiness(user.id);
      return res.json(campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ message: 'Failed to fetch campaigns' });
    }
  }

  if (req.method === 'POST') {
    try {
      const rawBody = req.body ?? {};
      const validation = insertCampaignSchema.safeParse({
        ...rawBody,
        businessId: user.id,
        budgetMin: parseOptionalNumber((rawBody as Record<string, unknown>).budgetMin),
        budgetMax: parseOptionalNumber((rawBody as Record<string, unknown>).budgetMax),
      });

      if (!validation.success) {
        return res.status(400).json({ message: fromError(validation.error).toString() });
      }

      const normalized = await normalizeCampaignInput(validation.data);

      const finalPayload = insertCampaignSchema.safeParse(normalized);
      if (!finalPayload.success) {
        return res.status(400).json({ message: fromError(finalPayload.error).toString() });
      }

      const campaign = await storage.createCampaign(finalPayload.data);
      return res.status(201).json(campaign);
    } catch (error) {
      console.error('Error creating campaign:', error);
      return res.status(500).json({ message: 'Failed to create campaign' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
});
