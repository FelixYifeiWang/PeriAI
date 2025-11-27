import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { requireAuth } from '../../_lib/middleware.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Draft = {
  productDetails?: string;
  campaignGoal?: string;
  targetAudience?: string;
  budgetMin?: number;
  budgetMax?: number;
  timeline?: string;
  deliverables?: string;
  additionalRequirements?: string;
};

const FIELDS: Array<keyof Draft> = [
  'productDetails',
  'campaignGoal',
  'targetAudience',
  'budgetMin',
  'budgetMax',
  'timeline',
  'deliverables',
  'additionalRequirements',
];

function parseOptionalNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'string'
      ? Number.parseInt(value, 10)
      : typeof value === 'number'
        ? value
        : undefined;
  return Number.isFinite(parsed as number) ? (parsed as number) : undefined;
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

  const { content, draft: rawDraft } = (req.body ?? {}) as { content?: string; draft?: Draft };

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ message: 'Content is required' });
  }

  const draft: Draft = {
    productDetails: rawDraft?.productDetails,
    campaignGoal: rawDraft?.campaignGoal,
    targetAudience: rawDraft?.targetAudience,
    budgetMin: parseOptionalNumber(rawDraft?.budgetMin),
    budgetMax: parseOptionalNumber(rawDraft?.budgetMax),
    timeline: rawDraft?.timeline,
    deliverables: rawDraft?.deliverables,
    additionalRequirements: rawDraft?.additionalRequirements,
  };

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Extract campaign fields from user text. Return JSON only with keys: productDetails, campaignGoal, targetAudience, budgetMin, budgetMax, timeline, deliverables, additionalRequirements. Keep text concise. If budget range is present, set numeric budgetMin and budgetMax. Do not invent data. Leave missing fields null.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            draft,
            newMessage: content,
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');

    const merged: Draft = {
      productDetails: parsed.productDetails || draft.productDetails || undefined,
      campaignGoal: parsed.campaignGoal || draft.campaignGoal || undefined,
      targetAudience: parsed.targetAudience || draft.targetAudience || undefined,
      budgetMin: parseOptionalNumber(parsed.budgetMin) ?? draft.budgetMin ?? undefined,
      budgetMax: parseOptionalNumber(parsed.budgetMax) ?? draft.budgetMax ?? undefined,
      timeline: parsed.timeline || draft.timeline || undefined,
      deliverables: parsed.deliverables || draft.deliverables || undefined,
      additionalRequirements: parsed.additionalRequirements || draft.additionalRequirements || undefined,
    };

    const missing = FIELDS.filter((field) => merged[field] === undefined || merged[field] === null || merged[field] === "");

    return res.json({ fields: merged, missing });
  } catch (error) {
    console.error('Error extracting campaign fields:', error);
    return res.status(500).json({ message: 'Failed to extract campaign fields' });
  }
});
