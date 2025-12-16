import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { BusinessProfile, Campaign } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/providers/language-provider";
import LanguageToggle from "@/components/language-toggle";
import { Link } from "wouter";
import { LogOut, Send, Sparkles, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isBusinessProfileComplete } from "@/lib/businessProfile";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function BusinessDashboard() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [campaignMode, setCampaignMode] = useState(false);
  const [campaignDraft, setCampaignDraft] = useState({
    productDetails: "",
    campaignGoal: "",
    targetAudience: "",
    budgetMin: undefined as number | undefined,
    budgetMax: undefined as number | undefined,
    timeline: "",
    deliverables: "",
    additionalRequirements: "",
  });
  const [campaignProcessing, setCampaignProcessing] = useState(false);
  const [campaignMissing, setCampaignMissing] = useState<string[]>([]);
  const [showComposer, setShowComposer] = useState(true);

  const missingLabels: Record<keyof typeof campaignDraft, string> = {
    productDetails: "Product/offer details",
    campaignGoal: "Campaign goal",
    targetAudience: "Target audience (demographics, age, region)",
    budgetMin: "Budget range",
    budgetMax: "Budget range",
    timeline: "Timeline",
    deliverables: "Deliverables",
    additionalRequirements: "Additional requirements or constraints",
  };

  const copy = useMemo(
    () =>
      language === "zh"
        ? {
            loading: "加载中…",
            title: "品牌控制台",
            subtitle: "",
            chat: {
              title: "品牌 AI 助理",
              placeholder: "问问 AI：帮我写一封跟进邮件 / 如何提升转化率？",
              send: "发送",
              sending: "发送中…",
              intro: (companyName?: string | null) =>
                `你好，我是你的品牌 AI 助理。${companyName ? `关于 ${companyName} 的合作想法，我都可以帮你整理。` : "需要什么帮助都可以直接开口。"} `,
              tip: "AI 根据你的品牌资料和上下文提供建议。请输入具体问题以获得更好回复。",
              error: "发送失败，请稍后再试。",
            },
            settings: "设置",
            completeProfile: "完善资料以提升匹配质量。",
            statusCard: {
              title: "当前状态",
              ready: "你已准备好开展合作",
              reminder: "保持资料更新能帮助创作者更好地了解你。",
            },
            labels: {
              company: "公司名称",
              industry: "行业",
            },
          }
        : {
            loading: "Loading...",
            title: "Business dashboard",
            subtitle: "",
            chat: {
              title: "AI Copilot",
              placeholder: "Ask the AI: draft a follow-up email / how to improve conversions?",
              send: "Send",
              sending: "Sending...",
              intro: () => "What are you working on?",
              tip: "",
              error: "Message failed. Please try again.",
            },
            settings: "Settings",
            completeProfile: "Complete your profile to boost matches.",
            statusCard: {
              title: "Status",
              ready: "You're ready to collaborate",
            },
            labels: {
              company: "Company",
              industry: "Industry",
            },
          },
    [language],
  );

  const { data: profile, isLoading: profileLoading } = useQuery<BusinessProfile | null>({
    queryKey: ["/api/business/profile"],
    queryFn: async () => {
      const res = await fetch("/api/business/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const [shouldPollCampaigns, setShouldPollCampaigns] = useState(true);
  const { data: campaigns = [], refetch: refetchCampaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/business/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/business/campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: shouldPollCampaigns ? 5000 : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const [processingCampaignId, setProcessingCampaignId] = useState<string | null>(null);

  useEffect(() => {
    const hasActive = campaigns.some((c) => c.status !== "deal" && c.status !== "denied");
    setShouldPollCampaigns(hasActive);
  }, [campaigns]);

  // Debug/cheat: press "D" to force latest negotiating campaign to Deal!
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping) return;
      if (e.key === "d" || e.key === "D") {
        const latestNegotiating = campaigns.find((c) => c.status === "negotiating");
        if (!latestNegotiating) return;
        fetch(`/api/business/campaigns/${latestNegotiating.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "deal" }),
        })
          .then(() => refetchCampaigns())
          .catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [campaigns, refetchCampaigns]);

  const buildChatContext = () => {
    const profileContext = profile
      ? [
          profile.companyName && `Brand: ${profile.companyName}`,
          profile.industry && `Industry: ${profile.industry}`,
          profile.description && `Story: ${profile.description}`,
          profile.companySize && `Team size: ${profile.companySize}`,
          profile.website && `Website: ${profile.website}`,
        ]
          .filter(Boolean)
          .join(" | ")
      : "Brand profile not set.";

    const totalCampaigns = campaigns.length;
    const sortedCampaigns = [...campaigns].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
      return db - da;
    });
    const latestCampaign = sortedCampaigns[0];
    const latestSummary = latestCampaign
      ? [
          `Latest campaign started ${latestCampaign.createdAt ? new Date(latestCampaign.createdAt as string).toLocaleString() : "recently"}`,
          `Goal: ${latestCampaign.campaignGoal || "N/A"}`,
          `Status: ${latestCampaign.status}`,
        ].join(" | ")
      : "No campaigns yet.";

    const recentCampaigns = sortedCampaigns.slice(0, 3);
    const campaignsContext =
      recentCampaigns.length > 0
        ? recentCampaigns
            .map((c) => {
              const started = c.createdAt ? new Date(c.createdAt as string).toLocaleDateString() : "recent";
              return `- ${started}: ${c.campaignGoal || "Untitled"} (status: ${c.status})`;
            })
            .join("\n")
        : "";

    const parts = [
      "You are the brand AI for this business. Answer basic questions about the brand profile and campaigns, and keep responses concise and conversational.",
      `Brand overview: ${profileContext}`,
      `Total campaigns: ${totalCampaigns}`,
      `Latest campaign: ${latestSummary}`,
      campaignsContext ? `Recent campaigns:\n${campaignsContext}` : "",
    ].filter(Boolean);

    return parts.join("\n");
  };

  const chatMutation = useMutation({
    mutationFn: async (payload: { content: string; history: Array<{ role: "user" | "assistant"; content: string }> }) => {
      const context = buildChatContext();
      const contextualHistory = context
        ? [{ role: "system", content: context }, ...payload.history]
        : payload.history;
      const response = await apiRequest("POST", "/api/business/ai-chat", {
        language,
        messages: contextualHistory.concat({ role: "user", content: payload.content }),
      });
      return response.json() as Promise<{ message: { role: "assistant"; content: string } }>;
    },
    onSuccess: (data) => {
      if (data?.message?.content) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.message.content },
        ]);
      }
    },
    onError: () => {
      toast({ variant: "destructive", title: copy.chat.error });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">{copy.loading}</div>
      </div>
    );
  }

  const profileCompleted = isBusinessProfileComplete(profile);
  const hasMessages = messages.length > 0;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Business logout failed:", error);
    } finally {
      window.location.href = "/business/login";
    }
  };

  const handleSend = () => {
    const content = input.trim();
    if (!content || chatMutation.isPending) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content }]);
    setInput("");

    if (campaignMode) {
      (async () => {
        try {
          setCampaignProcessing(true);
          const response = await apiRequest("POST", "/api/business/campaigns/extract", {
            content,
            draft: campaignDraft,
          });
          const result = (await response.json()) as { fields: typeof campaignDraft; missing: string[] };
          const updatedDraft = result.fields;
          const missing = result.missing;
          setCampaignDraft(updatedDraft);
          setCampaignMissing(missing);

          if (missing.length === 0) {
            await finalizeCampaign(updatedDraft);
            await refetchCampaigns();
            return;
          }

          const missingFriendly = missing
            .map((key) => (key in missingLabels ? missingLabels[key as keyof typeof campaignDraft] : key))
            .join(", ");

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Thanks for those details. To complete the campaign, could you share: ${missingFriendly}?`,
            },
          ]);
          setCampaignProcessing(false);
          setTimeout(() => inputRef.current?.focus(), 0);
        } catch (error) {
          toast({ variant: "destructive", title: "Failed to process campaign input" });
          setCampaignProcessing(false);
        }
      })();
      return;
    }

    const nextHistory = messages
      .concat({ role: "user" as const, content })
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));

    chatMutation.mutate({ content, history: nextHistory });
  };

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const formatBudget = (min?: number, max?: number) => {
    if (min != null && max != null) return `$${min} - $${max}`;
    if (min != null) return `$${min}+`;
    if (max != null) return `Up to $${max}`;
    return "Not provided";
  };

  const handleFlexibleCampaign = async () => {
    if (!campaignMode) return;
    setCampaignProcessing(true);

    const requiredFallback = "Flexible";
    const filledDraft = {
      ...campaignDraft,
      productDetails: campaignDraft.productDetails || requiredFallback,
      campaignGoal: campaignDraft.campaignGoal || requiredFallback,
      targetAudience: campaignDraft.targetAudience || requiredFallback,
      timeline: campaignDraft.timeline || requiredFallback,
      deliverables: campaignDraft.deliverables || requiredFallback,
    };

    await finalizeCampaign(filledDraft);
  };

  const finalizeCampaign = async (draft: typeof campaignDraft) => {
    const submitDraft = {
      ...draft,
      additionalRequirements: draft.additionalRequirements || undefined,
      status: "processing" as const,
    };

    try {
      const saveRes = await apiRequest("POST", "/api/business/campaigns", submitDraft);
      const saved = await saveRes.json();
      await refetchCampaigns();
      const summary = "Saved your campaign.";

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: summary,
        },
      ]);
      setShowComposer(false);
    } catch (saveError) {
      toast({ variant: "destructive", title: "Failed to save campaign" });
    } finally {
      setCampaignMode(false);
      setCampaignMissing([]);
      setCampaignDraft({
        productDetails: "",
        campaignGoal: "",
        targetAudience: "",
        budgetMin: undefined,
        budgetMax: undefined,
        timeline: "",
        deliverables: "",
        additionalRequirements: "",
      });
      setCampaignProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleStartCampaign = () => {
    const campaignGuide = [
      "Happy to help you set up a campaign. Share whatever you already have, and I'll fill in the blanks:",
      "- Product/offer details",
      "- Campaign goal",
      "- Target audience (demographics, age, region)",
      "- Budget range",
      "- Timeline",
      "- Deliverables",
      "- Additional requirements or constraints",
    ].join("\n");

    setCampaignDraft({
      productDetails: "",
      campaignGoal: "",
      targetAudience: "",
      budgetMin: undefined,
      budgetMax: undefined,
      timeline: "",
      deliverables: "",
      additionalRequirements: "",
    });
    setCampaignMode(true);
    setCampaignMissing([]);
    setShowComposer(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "assistant", content: campaignGuide },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Drop all the details in one go—I'll organize them and only follow up on anything missing.",
      },
    ]);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleNewConversation = () => {
    setMessages([]);
    setInput("");
    setCampaignMode(false);
    setCampaignMissing([]);
    setCampaignProcessing(false);
    setShowComposer(true);
    setCampaignDraft({
      productDetails: "",
      campaignGoal: "",
      targetAudience: "",
      budgetMin: undefined,
      budgetMax: undefined,
      timeline: "",
      deliverables: "",
      additionalRequirements: "",
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (processingCampaignId) return;
    const candidate = campaigns.find((c) => c.status === "processing");
    if (!candidate) return;

    setProcessingCampaignId(candidate.id);
    fetch("/api/business/campaigns/process", { method: "POST", credentials: "include" })
      .then(() => refetchCampaigns())
      .catch((err) => console.error("Process campaign error:", err))
      .finally(() => setProcessingCampaignId(null));
  }, [campaigns, processingCampaignId, refetchCampaigns]);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <header className="border-b border-muted-foreground/10 bg-white/80 backdrop-blur shadow-sm">
        <div className="flex w-full items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/business/settings">
              <Button variant="ghost" size="sm">
                {copy.settings}
              </Button>
            </Link>
            <div className="text-sm text-muted-foreground">{user?.email}</div>
            <div className="flex items-center gap-2">
              <LanguageToggle className="h-9" />
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-0 pb-0 h-[calc(100vh-96px)] overflow-hidden">
        <div className="grid lg:grid-cols-[3fr,2fr] h-full w-full">
          <section className="flex flex-col h-full min-h-0 border-r border-muted-foreground/10 bg-white/80 backdrop-blur">
            <header className="flex items-center gap-3 px-6 py-4 border-b border-muted-foreground/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{copy.chat.title}</h2>
            </header>
            <div className="flex-1 min-h-0 flex flex-col gap-4 px-6 pb-6 overflow-hidden">
              <div
                className={`rounded-3xl border border-slate-200 bg-white p-4 flex-1 min-h-0 space-y-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)] ${
                  hasMessages ? "overflow-y-auto" : "overflow-hidden"
                }`}
              >
                {!hasMessages && (
                  <div className="flex h-full items-center justify-center">
                    {showComposer ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSend();
                        }}
                        className="w-full max-w-xl space-y-3 text-center"
                      >
                        {copy.chat.intro(profile?.companyName) ? (
                          <h2 className="text-lg font-semibold tracking-tight text-foreground">
                            {copy.chat.intro(profile?.companyName)}
                          </h2>
                        ) : null}
                        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                          <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={copy.chat.placeholder}
                            ref={inputRef}
                            className="flex-1 min-h-[20px] resize-none border-none bg-transparent text-sm text-foreground leading-5 focus-visible:ring-0 focus-visible:ring-offset-0"
                            disabled={chatMutation.isPending}
                            rows={1}
                            autoFocus
                          />
                          <Button
                            type="submit"
                            disabled={!input.trim() || chatMutation.isPending}
                            className="h-8 w-8 rounded-full bg-black p-0 text-white shadow-sm"
                            size="icon"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                        {!campaignMode && !campaignProcessing && !hasMessages && (
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleStartCampaign}
                              className="rounded-full border-slate-300 px-4 py-2 text-sm font-medium shadow-sm hover:border-slate-400"
                              disabled={campaignProcessing}
                            >
                              Start a campaign
                            </Button>
                          </div>
                        )}
                      </form>
                    ) : (
                      <div className="space-y-3 text-center">
                        <p className="text-sm text-muted-foreground">Conversation closed.</p>
                        <Button variant="outline" size="sm" className="rounded-full" onClick={handleNewConversation}>
                          Start a new conversation
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {hasMessages && messages.map((message) => {
                  const alignment = message.role === "assistant" ? "justify-start" : "justify-end";
                  const bubbleClasses =
                    message.role === "assistant"
                      ? "bg-white text-foreground border border-muted-foreground/20 shadow-sm"
                      : "bg-primary text-primary-foreground";
                  const showFlexible =
                    campaignMode &&
                    campaignMissing.length > 0 &&
                    message.role === "assistant" &&
                    message.content.includes("To complete the campaign");

                  return (
                    <div key={message.id} className="space-y-2">
                      <div className={`flex ${alignment}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${bubbleClasses}`}
                        >
                          {message.content}
                        </div>
                      </div>
                      {showFlexible && (
                        <div className="flex justify-start pl-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleFlexibleCampaign}
                            className="rounded-full px-4 py-2 text-sm font-medium shadow-sm"
                            disabled={campaignProcessing}
                          >
                            Mark remaining as flexible
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(chatMutation.isPending || campaignProcessing) && (
                  <div className="text-xs text-muted-foreground">{copy.chat.sending}</div>
                )}
                <div ref={scrollRef} />
              </div>
              {hasMessages && (
                showComposer ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                      <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={copy.chat.placeholder}
                        ref={inputRef}
                        className="flex-1 min-h-[20px] resize-none border-none bg-transparent text-sm text-foreground leading-5 focus-visible:ring-0 focus-visible-ring-offset-0"
                        disabled={chatMutation.isPending}
                        rows={1}
                      />
                      <Button
                        type="submit"
                        disabled={!input.trim() || chatMutation.isPending}
                        className="h-8 w-8 rounded-full bg-black p-0 text-white shadow-sm"
                        size="icon"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-muted-foreground">Conversation closed.</p>
                    <Button variant="outline" size="sm" className="rounded-full" onClick={handleNewConversation}>
                      Start a new conversation
                    </Button>
                  </div>
                )
              )}
            </div>
  </section>

          <section className="flex flex-col h-full min-h-0 bg-white/80 backdrop-blur">
            <header className="px-6 py-4 border-b border-muted-foreground/10">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{copy.statusCard.title}</h2>
            </header>
            <div className="flex-1 min-h-0 px-6 pb-6 overflow-y-auto">
              {campaigns.length === 0 && (
                <div className="rounded-2xl border border-muted-foreground/15 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <p className="text-lg font-semibold">
                    {profileCompleted ? copy.statusCard.ready : copy.completeProfile}
                  </p>
                  {!profileCompleted && (
                    <Link href="/business/onboarding">
                      <Button className="mt-3" size="sm" variant="outline">
                        {copy.settings}
                      </Button>
                    </Link>
                  )}
                </div>
              )}
              <div className="mt-4">
                <CampaignStatusList campaigns={campaigns} onRefetch={refetchCampaigns} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
function CampaignStatusList({ campaigns, onRefetch }: { campaigns: Campaign[]; onRefetch?: () => void }) {
  const badgeClass = (status: Campaign["status"]) =>
    status === "deal"
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : status === "waiting_approval"
        ? "bg-blue-100 text-blue-700 border border-blue-200"
      : status === "negotiating"
          ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
          : status === "waiting_response"
            ? "bg-violet-100 text-violet-700 border border-violet-200"
            : status === "denied"
              ? "bg-rose-100 text-rose-700 border border-rose-200"
              : "bg-amber-100 text-amber-700 border border-amber-200";

  const formatTimestamp = (value?: string | null) => {
    if (!value) return "New campaign";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "New campaign";
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const formatBudgetLocal = (min?: number, max?: number) => {
    if (min != null && max != null) return `$${min} - $${max}`;
    if (min != null) return `$${min}+`;
    if (max != null) return `Up to $${max}`;
    return "Not provided";
  };

  const activeCampaigns = campaigns.filter((c) => c.status !== "denied");
  const historyCampaigns = campaigns.filter((c) => c.status === "denied");

  const renderCampaignCard = (campaign: Campaign) => (
    <details key={campaign.id} className="px-5 py-3 group">
      <summary className="flex items-center justify-between gap-3 cursor-pointer select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          <div className="text-sm font-medium text-foreground truncate">
            {formatTimestamp(campaign.createdAt as string | null)}
          </div>
        </div>
        <span className="flex justify-end w-1/2 max-w-[210px]">
          <span
            className={`inline-flex items-center rounded-full px-4 py-1 text-xs font-medium ${badgeClass(campaign.status)}`}
          >
            {campaign.status === "deal"
              ? "Deal!"
              : campaign.status === "waiting_approval"
                ? "Waiting for approval"
                : campaign.status === "negotiating"
                  ? "Negotiating"
                  : campaign.status === "waiting_response"
                    ? "Waiting for response"
                    : campaign.status === "denied"
                      ? "Rejected"
                      : "Processing"}
          </span>
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground pl-6">
        <details>
          <summary className="cursor-pointer select-none text-foreground font-medium">Campaign information</summary>
          <div className="mt-2 space-y-1">
            <div><span className="text-foreground font-medium">Goal:</span> {campaign.campaignGoal || "Not provided"}</div>
            <div><span className="text-foreground font-medium">Product:</span> {campaign.productDetails || "Not provided"}</div>
            <div><span className="text-foreground font-medium">Audience:</span> {campaign.targetAudience || "Not provided"}</div>
            <div><span className="text-foreground font-medium">Budget:</span> {formatBudgetLocal(campaign.budgetMin ?? undefined, campaign.budgetMax ?? undefined)}</div>
            <div><span className="text-foreground font-medium">Timeline:</span> {campaign.timeline || "Not provided"}</div>
            <div><span className="text-foreground font-medium">Deliverables:</span> {campaign.deliverables || "Not provided"}</div>
            <div><span className="text-foreground font-medium">Additional requirements:</span> {campaign.additionalRequirements || "None"}</div>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer select-none text-foreground font-medium">Search criteria</summary>
          <div className="mt-2 space-y-1">
            {(() => {
              if (!campaign.searchCriteria) {
                return <div className="text-muted-foreground">Not generated yet</div>;
              }
              let parsed: any;
              try {
                parsed = JSON.parse(campaign.searchCriteria);
              } catch {
                parsed = null;
              }
              if (parsed && typeof parsed === "object") {
                const rows = [
                  parsed.keywords?.length ? `Keywords: ${(parsed.keywords as string[]).join(", ")}` : null,
                  parsed.languages?.length ? `Languages: ${(parsed.languages as string[]).join(", ")}` : null,
                  parsed.regions?.length ? `Regions: ${(parsed.regions as string[]).join(", ")}` : null,
                  parsed.contentTypes?.length ? `Content types: ${(parsed.contentTypes as string[]).join(", ")}` : null,
                  (parsed.minBudget || parsed.maxBudget) ? `Budget: ${parsed.minBudget ?? "?"} - ${parsed.maxBudget ?? "?"}` : null,
                  parsed.additionalRequirements?.length ? `Additional requirements: ${parsed.additionalRequirements.join(", ")}` : null,
                ].filter(Boolean);
                return rows.length ? rows.map((line, idx) => <div key={idx} className="text-muted-foreground">• {line}</div>) : <div className="text-muted-foreground">Not generated yet</div>;
              }
              return campaign.searchCriteria
                .split(/\r?\n/)
                .filter((line) => line.trim().length > 0)
                .map((line, idx) => (
                  <div key={idx} className="text-muted-foreground">
                    • {line.trim()}
                  </div>
                ));
            })()}
          </div>
        </details>
        <details open>
          <summary className="cursor-pointer select-none text-foreground font-medium">Found influencers</summary>
          {Array.isArray(campaign.matchedInfluencers) && campaign.matchedInfluencers.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {(campaign.matchedInfluencers as Array<{ name?: string; username?: string; email?: string; preferences?: string; score?: number; reason?: string; primaryPlatform?: string; primaryFollowers?: number; primaryLikes?: number }>).map((inf, idx) => {
                const formatNum = (val?: number) => (typeof val === "number" ? val.toLocaleString() : "—");
                const primaryPlatform = inf.primaryPlatform ?? "—";
                const primaryFollowers = formatNum(inf.primaryFollowers);
                const primaryLikes = formatNum(inf.primaryLikes);
                return (
                <li key={idx} className="rounded-lg border border-muted-foreground/10 bg-white px-3 py-2">
                  <details>
                    <summary className="flex items-center justify-between gap-2 cursor-pointer select-none text-foreground">
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          {inf.name || inf.username || "Unknown"}
                          {typeof inf.score === "number" && (
                            <span className="text-[11px] text-muted-foreground">({Math.round((inf.score || 0) * 100)}%)</span>
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground">Primary: {primaryPlatform}</span>
                        <span className="text-[11px] text-muted-foreground">Followers: {primaryFollowers}</span>
                        <span className="text-[11px] text-muted-foreground">Likes/Views: {primaryLikes}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">Tap to view</span>
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {inf.email && <div>Email: {inf.email}</div>}
                      {inf.preferences && <div>Prefs: {inf.preferences}</div>}
                      {inf.reason && <div>Reason: {inf.reason}</div>}
                    </div>
                  </details>
                </li>
              );
            })}
            </ul>
          ) : (
            <div className="mt-2">Pending results</div>
          )}
          {campaign.status === "waiting_approval" && (
            <div className="mt-3 flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="rounded-full px-4"
                onClick={() => {
                  fetch(`/api/business/campaigns/${campaign.id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ status: "negotiating" }),
                  })
                    .then(() => onRefetch?.())
                    .catch(() => {});
                }}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                onClick={() => {
                  fetch(`/api/business/campaigns/${campaign.id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ status: "denied" }),
                  })
                    .then(() => onRefetch?.())
                    .catch(() => {});
                }}
              >
                Reject
              </Button>
            </div>
          )}
        </details>
      </div>
    </details>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-muted-foreground/15 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="px-5 py-4 border-b border-muted-foreground/10">
          <h3 className="text-md font-semibold tracking-tight text-foreground">Campaigns</h3>
          <p className="text-sm text-muted-foreground">Status across your campaigns</p>
        </div>
        <div className="divide-y divide-muted-foreground/10">
          {activeCampaigns.length === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">No campaigns yet.</div>
          ) : (
            activeCampaigns.map(renderCampaignCard)
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-muted-foreground/15 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <details className="group">
          <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none border-b border-muted-foreground/10">
            <div>
              <h3 className="text-md font-semibold tracking-tight text-foreground">History</h3>
              <p className="text-sm text-muted-foreground">Rejected campaigns</p>
            </div>
            <span className="text-slate-400 transition-transform group-open:rotate-90">▶</span>
          </summary>
          <div className="divide-y divide-muted-foreground/10">
            {historyCampaigns.length === 0 ? (
              <div className="px-5 py-4 text-sm text-muted-foreground">No history yet.</div>
            ) : (
              historyCampaigns.map((campaign) => (
                <details key={campaign.id} className="px-5 py-3 group">
                  <summary className="flex items-center justify-between gap-3 cursor-pointer select-none">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
                      <div className="text-sm font-medium text-foreground truncate">
                        {formatTimestamp(campaign.createdAt as string | null)}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full px-4 py-1 text-xs font-medium bg-rose-100 text-rose-700 border border-rose-200">
                      Rejected
                    </span>
                  </summary>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground pl-6">
                    <div><span className="text-foreground font-medium">Goal:</span> {campaign.campaignGoal || "Not provided"}</div>
                    <div><span className="text-foreground font-medium">Product:</span> {campaign.productDetails || "Not provided"}</div>
                    <div><span className="text-foreground font-medium">Audience:</span> {campaign.targetAudience || "Not provided"}</div>
                    <div><span className="text-foreground font-medium">Budget:</span> {formatBudgetLocal(campaign.budgetMin ?? undefined, campaign.budgetMax ?? undefined)}</div>
                    <div><span className="text-foreground font-medium">Timeline:</span> {campaign.timeline || "Not provided"}</div>
                    <div><span className="text-foreground font-medium">Deliverables:</span> {campaign.deliverables || "Not provided"}</div>
                    <div><span className="text-foreground font-medium">Additional requirements:</span> {campaign.additionalRequirements || "None"}</div>
                  </div>
                </details>
              ))
            )}
          </div>
        </details>
      </div>
    </div>
  );

}
