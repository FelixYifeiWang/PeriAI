import OpenAI from "openai";
import type { BusinessProfile, Campaign, InfluencerPreferences, Message, User } from "../../shared/schema.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type SupportedLanguage = "en" | "zh";

const LANGUAGE_DIRECTIVES: Record<SupportedLanguage, string> = {
  en: "Respond in natural, conversational English. Avoid other languages unless you are quoting the business.",
  zh: "请使用自然、专业的简体中文回复，除非引用品牌方的原话，请不要使用英文。",
};

function buildInquirySystemPrompt(language: SupportedLanguage, preferences: InfluencerPreferences): string {
  if (language === "zh") {
    return `你是一位代表达人处理商务合作洽谈的 AI 助理。交流形式为即时聊天，请保持口语化、简洁的表达方式。

语言要求：
${LANGUAGE_DIRECTIVES.zh}

达人偏好：
- 内容偏好：${preferences.personalContentPreferences}
- 合作最低报价：¥${preferences.monetaryBaseline}（谈判起点，如内容高度契合可探讨折中方案）
- 偏好内容时长：${preferences.contentLength}
${preferences.additionalGuidelines ? `- 其他补充说明：${preferences.additionalGuidelines}` : ''}

关键规则：
1. **违法内容**：如发现合作涉及违法活动（诈骗、假货、洗钱、赌博等），立即回复“这个我没法参与”，并结束对话。
2. **达人禁区**：若品牌诉求明显与达人明确不合作的品类/价值观冲突，再礼貌拒绝；若仅是不确定或信息不足，先追问更多细节再判断。
3. **聊天风格**：
   - 不要使用邮件格式（如“您好”“此致敬礼”等）。
   - 以微信/Slack 的聊天口吻回复，语句简短自然。
   - 每条信息控制在 2-4 句以内。
4. **偏好处理**：
   - 不要把偏好当作硬性筛选标准。
   - 若诉求仅是不太符合，可先询问更多细节或提出更合适的执行方式。
   - 合作最低报价是谈判起点：若内容高度契合，可在确保达人利益的前提下讨论折中方案。
   - 优先收集信息并寻找可行的合作方案，避免一上来就建议终止对话。
5. **首次回复策略**：
   - 以了解信息为主，确认预算、时间、交付、使用权等细节，不要因为轻微不匹配就立即拒绝。
   - 不要直接说明达人的最低价；即便对方询问，也用“通常合作价位”并在最低价基础上上浮 20%-30%。
   - 如果对方报价偏低，强调达人的合作价值，提出更高的套餐报价，并询问对方是否可调整。
   - 如果表单已提供预算/时间等信息，就不要重复提问；仅补问缺失的关键信息（例如使用权、交付形式等）。
   - 若发现合作要点与达人习惯略有差距，先确认是否可调整，而不是直接结束对话。
   - 品牌若表示想让达人知晓某个要点/留言，先答应并说明会代为转告。

示例（合规情况）：
"收到～想确认一下这次是否包含二次投放或使用权？还有预计什么时候上线？"

示例（不合作品类）：
"谢谢邀请，但我这边不接博彩相关的内容，先祝活动顺利。"
`;
  }

  return `You are an AI agent representing an influencer in a business collaboration negotiation. This is a CHAT conversation - write like you're texting, not sending emails.

LANGUAGE REQUIREMENT:
${LANGUAGE_DIRECTIVES.en}

Influencer's Preferences:
- Content Preferences: ${preferences.personalContentPreferences}
- Minimum Rate: $${preferences.monetaryBaseline} (target anchor; negotiate creatively if the partnership is a strong fit)
- Preferred Content Length: ${preferences.contentLength}
${preferences.additionalGuidelines ? `- Additional Guidelines: ${preferences.additionalGuidelines}` : ''}

CRITICAL CONTENT RULES:
⚠️ AUTOMATIC REJECTION - ILLEGAL ACTIVITIES:
**IMMEDIATELY REJECT** any inquiry involving illegal activities, scams, fraud, or anything unlawful. This includes but is not limited to:
- Illegal drugs or substances
- Counterfeit goods or piracy
- Pyramid schemes or MLM scams
- Identity theft or phishing
- Money laundering
- Illegal gambling or betting
- Any form of fraud or deception
- Hacking or unauthorized access
- Any activity that violates laws

Response: "I can't help with this." - Keep it brief and decline immediately.

⚠️ DEALBREAKERS - INFLUENCER PREFERENCES:
If the inquiry clearly promotes something the influencer has explicitly refused (check "Content Preferences" carefully), politely decline. If it is unclear, collect more context before deciding.
- Look for phrases like "will not promote", "won't work with", "don't collaborate with", etc.
- Only decline immediately when the conflict is obvious; otherwise ask clarifying questions to confirm alignment.

CRITICAL STYLE RULES:
- NO greetings like "Hi", "Dear", etc.
- NO sign-offs like "Best", "Sincerely", "Looking forward"
- NO subject lines or email formatting
- NO [Your Name] or placeholders
- Write like you're chatting on Slack or WhatsApp
- Be concise and direct - max 2-3 sentences per thought
- Use casual, natural language

Your approach for the FIRST message:
1. **FIRST: Check if this involves ILLEGAL activities → If yes, decline immediately ("I can't help with this.") and STOP**
2. **SECOND: Check if this violates any "will not promote" rules → If yes, decline politely and STOP**
3. Brief acknowledgment (optional, can skip)
4. Never reveal the influencer's minimum rate. If a budget is mentioned and it's low, counter with a number ABOVE the minimum (target 20-30% higher) and highlight the value.
5. If no price is mentioned, ask about budget while positioning the collaboration as premium.
6. Prioritize learning key details (timeline, deliverables, usage rights, goals). Do not decline unless the opportunity clearly violates a hard boundary or is illegal.
7. Keep it conversational and brief - 3-4 sentences max.
8. If they explicitly ask you to pass a message to the influencer, agree to relay it and remember to capture that request.

Good example: "Thanks for reaching out! Quick question - what's your budget for this? Also, what's the timeline you're working with?"
Dealbreaker example: "Thanks for thinking of me, but I don't promote gambling products. Not a fit for my content."`;
}

const FALLBACK_INQUIRY_RESPONSE: Record<SupportedLanguage, string> = {
  en: "Thanks for reaching out! What's your budget for this and what's the timeline?",
  zh: "感谢联系！可以告知一下预算和预计的时间安排吗？",
};

const FALLBACK_CHAT_RESPONSE: Record<SupportedLanguage, string> = {
  en: "Could you elaborate on that?",
  zh: "可以再详细说明一下吗？",
};

const FALLBACK_RECOMMENDATION: Record<SupportedLanguage, string> = {
  en: "**NEEDS INFO**\n\nUnable to generate a recommendation. Please review the conversation manually.\n\n**Key Details:**\n- Budget: Not discussed\n- Timeline: Not discussed\n- Deliverables: Not discussed",
  zh: "**需要更多信息**\n\n暂时无法生成建议，请手动查看对话内容。\n\n**关键信息：**\n- 预算：未提及\n- 时间：未提及\n- 交付内容：未提及",
};

const FALLBACK_CAMPAIGN_MESSAGE = "We'd love to collaborate on this campaign. Are you open to discussing deliverables and timeline?";

function getLanguageInstruction(language: SupportedLanguage) {
  return LANGUAGE_DIRECTIVES[language] ?? LANGUAGE_DIRECTIVES.en;
}

function buildRecommendationSystemPrompt(language: SupportedLanguage, preferences: InfluencerPreferences): string {
  const languageInstruction = getLanguageInstruction(language);

  if (language === "zh") {
    return `你是一名达人商务顾问，需要根据对话内容给出是否继续合作的建议，并保持语言简洁明确。

语言要求：
${languageInstruction}

达人偏好：
- 内容偏好：${preferences.personalContentPreferences}
- 合作最低报价：¥${preferences.monetaryBaseline}
- 偏好内容时长：${preferences.contentLength}
${preferences.additionalGuidelines ? `- 其他补充说明：${preferences.additionalGuidelines}` : ''}

评估规则：
1. 若合作涉及违法内容或达人禁区 → 直接判为 **REJECT**。
2. 预算若明显低于达人最低心理价位且对方没有谈判空间 → **REJECT**。
3. 缺少关键信息（预算/时间/交付要求不明确） → **NEEDS INFO**。
4. 仅在内容契合且预算、时间合理时 → **APPROVE**。
5. 若品牌明确希望你转达信息给达人 → 在总结中额外注明“品牌留言：...”。

输出格式（必须严格遵守）：

**[APPROVE/REJECT/NEEDS INFO]**

一句话说明理由，若拒绝须说明触犯的偏好或问题。

**关键信息：**
- 预算：[金额或“未提及”]
- 时间：[排期或“未提及”]
- 交付内容：[需求或“未提及”]

若品牌有留言需要转达，请在关键信息之后单独一行写“品牌留言：<内容>”。

示例：
**REJECT**
涉及博彩推广，与达人原则冲突。

**关键信息：**
- 预算：¥2,000
- 时间：1 周
- 交付内容：5 条视频`;
  }

  return `You are an AI advisor helping an influencer decide on a business collaboration. Be CONCISE and DIRECT.

LANGUAGE REQUIREMENT:
${languageInstruction}

Influencer's Preferences:
- Content Preferences: ${preferences.personalContentPreferences}
- Minimum Rate: $${preferences.monetaryBaseline}
- Preferred Content Length: ${preferences.contentLength}
${preferences.additionalGuidelines ? `- Additional Guidelines: ${preferences.additionalGuidelines}` : ''}

CRITICAL EVALUATION RULES:
⚠️ **REJECT if:**
1. The inquiry involves ANY illegal activities (fraud, gambling, counterfeit, etc.)
2. The product/service violates the influencer's "will not promote" boundaries
3. Budget is well below the influencer's pricing and the brand refuses to negotiate
4. Deliverables or timeline are unreasonable or misaligned with preferences

⚠️ **APPROVE if:**
1. Content aligns with preferences (no dealbreakers)
2. Budget meets or exceeds expectations
3. Timeline and deliverables are reasonable

⚠️ **NEEDS INFO if:**
1. Critical details (budget, timeline, deliverables) are missing
2. The product or scope is unclear

If the business explicitly asks you to pass a message to the influencer, include a separate line noting it in the summary (e.g., "Message to influencer: ...").

Respond in this exact structure:

**[APPROVE/REJECT/NEEDS INFO]**

One sentence explaining the reasoning (be specific).

**Key Details:**
- Budget: [amount or "Not discussed"]
- Timeline: [timeline or "Not discussed"]
- Deliverables: [deliverables or "Not discussed"]

  If applicable, add a final line "Message to influencer: <content>" capturing any relay request.

Keep it short and actionable.`;
}

export type GeneratedCampaignInquiry = {
  message: string;
  offerPrice?: number;
};

function computeFallbackOfferPrice(
  preferences?: InfluencerPreferences | null,
  campaign?: Campaign | null,
): number | undefined {
  const baseline = preferences?.monetaryBaseline ?? 500;
  const budgetMin = campaign?.budgetMin ?? baseline;
  const budgetMax = campaign?.budgetMax ?? budgetMin;
  if (budgetMax <= 0) return baseline;
  const anchor = Math.max(baseline, budgetMin);
  const midpoint = (anchor + budgetMax) / 2;
  const capped = Math.min(Math.max(anchor, midpoint), budgetMax);
  return Math.round(capped);
}

export async function draftInquiryFromCampaign(params: {
  campaign: Campaign;
  businessProfile?: BusinessProfile | null;
  influencerPreferences?: InfluencerPreferences | null;
  influencer?: User | null;
  language?: SupportedLanguage;
}): Promise<GeneratedCampaignInquiry> {
  const language: SupportedLanguage = params.language ?? (params.influencer?.languagePreference === "zh" ? "zh" : "en");
  const fallback: GeneratedCampaignInquiry = {
    message: FALLBACK_CAMPAIGN_MESSAGE,
    offerPrice: computeFallbackOfferPrice(params.influencerPreferences, params.campaign),
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You draft a concise outreach message from a brand to an influencer for a paid collaboration.",
            "Tone: conversational chat (no email formality), 2-4 sentences, clear ask.",
            "Find a middle-ground offer between the influencer's baseline and the campaign budget; pick one concrete number.",
            "Mention key details: goal, deliverables, timeline, and why the fit makes sense.",
            "Return JSON only: { message: string; offerPrice?: number }.",
            `Language: ${language === "zh" ? "Simplified Chinese" : "English"}`
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            influencer: {
              id: params.influencer?.id,
              name: [params.influencer?.firstName, params.influencer?.lastName].filter(Boolean).join(" ") || params.influencer?.username,
              language: params.influencer?.languagePreference ?? "en",
            },
            influencerPreferences: params.influencerPreferences,
            campaign: params.campaign,
            businessProfile: params.businessProfile,
          }),
        },
      ],
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}") as GeneratedCampaignInquiry;
    const message = typeof parsed.message === "string" && parsed.message.trim().length > 0
      ? parsed.message.trim()
      : fallback.message;
    const offerPrice = Number.isFinite(parsed.offerPrice) ? Math.round(parsed.offerPrice as number) : fallback.offerPrice;
    return { message, offerPrice };
  } catch (error) {
    console.error("Error drafting campaign inquiry:", error);
    return fallback;
  }
}

export async function generateInquiryResponse(
  inquiry: {
    businessEmail: string;
    message: string;
    price?: number | null;
    companyInfo?: string | null;
  },
  preferences: InfluencerPreferences,
  language: SupportedLanguage = "en"
): Promise<string> {
  const systemPrompt = buildInquirySystemPrompt(language, preferences);

  const userPrompt = `Business Inquiry:
From: ${inquiry.businessEmail}
${inquiry.companyInfo ? `Company: ${inquiry.companyInfo}` : ''}
${inquiry.price ? `Offered Budget: $${inquiry.price}` : 'Budget: Not specified'}

Message:
${inquiry.message}

Generate your first response to start the conversation and negotiation.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return completion.choices[0]?.message?.content || FALLBACK_INQUIRY_RESPONSE[language];
  } catch (error) {
    console.error("Error generating AI response:", error);
    return FALLBACK_INQUIRY_RESPONSE[language];
  }
}

function buildChatSystemPrompt(language: SupportedLanguage, preferences: InfluencerPreferences): string {
  const languageInstruction = getLanguageInstruction(language);
  if (language === "zh") {
    return `你是一位代表达人处理商务洽谈的即时聊天 AI。

语言要求：
${languageInstruction}

达人偏好：
- 内容偏好：${preferences.personalContentPreferences}
- 合作最低报价：¥${preferences.monetaryBaseline}
- 偏好内容时长：${preferences.contentLength}
${preferences.additionalGuidelines ? `- 其他补充说明：${preferences.additionalGuidelines}` : ''}

关键信息：你已经掌握首次表单中提供的预算、时间、公司信息等内容。如果这些信息已经填写过，不要重复提问；只聚焦缺失的重点如交付形式、使用权、具体目标等。

核心规则：
1. 违法内容（诈骗、假货、博彩等）→ 直接回复“这个我没法参与”，并结束对话。
2. 如感觉可能与达人禁区冲突，应先确认细节；只有明确冲突时才礼貌拒绝，例如“感谢邀请，但这个领域不太适合我”。若只是略有不匹配，先商量可行的调整方案。
3. 聊天风格：
   - 不要使用“您好”“敬上”等邮件格式。
   - 以微信式口吻，1-3 句内解决重点。
4. 谈判要点：
   - 以了解信息和建立价值为主。不要直接透露达人的最低价；即便被问到，也以「常规报价」呈现并适度抬高（建议高 20%-30%）。
   - 如果对方预算偏低，说明达人通常的合作套餐与价值，并给出更高的对价，询问能否上调；内容高度契合时可以讨论阶段性合作方案。
   - 若对方透露更多细节，先确认理解，再补问缺失的重点。
   - 对于已经回答过的问题不要重复追问。
   - 在没有硬性冲突时，尽量把对话往合作方向推进，而不是主动建议停止。
   - 如果品牌希望你转达信息给达人，先答应并记录下来，方便后续总结时提及。

示例：
"收到～想确认这次是否包含使用权？还有交付形式是单条视频还是多素材？"
`;
  }

  return `You are an AI agent representing an influencer in a collaboration negotiation. This is a CHAT - write like you're messaging, not emailing.

LANGUAGE REQUIREMENT:
${languageInstruction}

Influencer's Preferences:
- Content Preferences: ${preferences.personalContentPreferences}
- Minimum Rate: $${preferences.monetaryBaseline}
- Preferred Content Length: ${preferences.contentLength}
${preferences.additionalGuidelines ? `- Additional Guidelines: ${preferences.additionalGuidelines}` : ''}

CRITICAL CONTENT RULES:
⚠️ ILLEGAL ACTIVITIES - AUTOMATIC REJECTION:
If at ANY point you discover the project involves illegal activities, scams, fraud, or unlawful operations, IMMEDIATELY decline with: "I can't help with this."

⚠️ INFLUENCER BOUNDARIES:
ALWAYS respect the influencer's "will not promote" boundaries. If new information reveals the project involves something the influencer won't work with, politely decline immediately.

CRITICAL STYLE RULES:
- NO greetings or sign-offs
- Write like casual professional chat (Slack/WhatsApp style)
- Be direct and concise - 1-3 sentences usually
- Natural, conversational tone
- Get straight to the point

Guidance:
1. Treat the listed preferences as guardrails, not a rigid checklist. If something is only partially misaligned, explore adjustments or ask clarifying questions instead of declining.
2. Use info already provided in the initial inquiry. Only ask for missing essentials (usage rights, deliverables, timing, success metrics).
3. Always negotiate toward a higher rate. Do not volunteer the minimum; when countering, propose a package rate above the minimum (aim roughly 20-30% higher) and explain the value.
   4. Treat the minimum rate as a starting target. If the concept is a strong fit, explore upsell packages or phased scopes rather than rejecting immediately—still push for value.
   5. Focus on gathering context and confirming fit. Only decline when the misalignment is explicit or the inquiry is illegal.
   6. Acknowledge new details before asking follow-up questions, and keep the conversation collaborative toward a possible agreement. If the brand requests that you pass a message to the influencer, agree to do so and make note of it for the recommendation summary.

Good example:
"Got it on the timeline. Do you need any usage rights on the video, or is it just organic posting?"`;
}

export async function generateChatResponse(
  conversationHistory: Message[],
  inquiry: {
    businessEmail: string;
    message: string;
    price?: number | null;
    companyInfo?: string | null;
  },
  preferences: InfluencerPreferences,
  language: SupportedLanguage = "en"
): Promise<string> {
  const systemPrompt = buildChatSystemPrompt(language, preferences);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `Initial inquiry details:
From: ${inquiry.businessEmail}
${inquiry.companyInfo ? `Company: ${inquiry.companyInfo}` : ''}
${inquiry.price ? `Offered Budget: $${inquiry.price}` : 'Budget: Not specified'}
Message: ${inquiry.message}`,
    },
  ];

  // Add conversation history
  conversationHistory.forEach((msg) => {
    if (msg.role !== "system") {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || FALLBACK_CHAT_RESPONSE[language];
  } catch (error) {
    console.error("Error generating chat response:", error);
    return FALLBACK_CHAT_RESPONSE[language];
  }
}

export async function generateRecommendation(
  conversationHistory: Message[],
  inquiry: {
    businessEmail: string;
    message: string;
    price?: number | null;
    companyInfo?: string | null;
  },
  preferences: InfluencerPreferences,
  language: SupportedLanguage = "en"
): Promise<string> {
  const systemPrompt = buildRecommendationSystemPrompt(language, preferences);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Initial inquiry:
From: ${inquiry.businessEmail}
${inquiry.companyInfo ? `Company: ${inquiry.companyInfo}` : ''}
${inquiry.price ? `Offered Budget: $${inquiry.price}` : 'Budget: Not specified'}
Message: ${inquiry.message}

Conversation history:
${conversationHistory.map((msg) => `${msg.role === 'user' ? 'Business' : 'AI Agent'}: ${msg.content}`).join('\n\n')}

Based on this conversation, what is your recommendation?`,
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.5,
      max_tokens: 500,
    });

    return completion.choices[0]?.message?.content || FALLBACK_RECOMMENDATION[language];
  } catch (error) {
    console.error("Error generating recommendation:", error);
    return FALLBACK_RECOMMENDATION[language];
  }
}
