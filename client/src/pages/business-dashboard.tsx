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
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/business/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/business/campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
    staleTime: 60_000,
  });

  const chatMutation = useMutation({
    mutationFn: async (payload: { content: string; history: Array<{ role: "user" | "assistant"; content: string }> }) => {
      const response = await apiRequest("POST", "/api/business/ai-chat", {
        language,
        messages: payload.history.concat({ role: "user", content: payload.content }),
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
      status: "pending" as const,
    };

    try {
      const saveRes = await apiRequest("POST", "/api/business/campaigns", submitDraft);
      const saved = await saveRes.json();
      const summary = "Saved your campaign.";

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: summary,
        },
      ]);
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

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
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

      <main className="w-full px-0 pb-0">
        <div className="grid lg:grid-cols-[3fr,2fr] min-h-[calc(100vh-96px)] w-full">
          <section className="flex flex-col h-full border-r border-muted-foreground/10 bg-white/80 backdrop-blur">
            <header className="flex items-center gap-3 px-6 py-4 border-b border-muted-foreground/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{copy.chat.title}</h2>
            </header>
            <div className="flex-1 flex flex-col gap-4 px-6 pb-6 overflow-hidden">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 flex-1 overflow-y-auto space-y-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
                {!hasMessages && (
                  <div className="flex h-full items-center justify-center">
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
                      {!campaignMode && (
                        <div className="flex justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStartCampaign}
                            className="rounded-full border-slate-300 px-4 py-2 text-sm font-medium shadow-sm hover:border-slate-400"
                          >
                            Start a campaign
                          </Button>
                        </div>
                      )}
                    </form>
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
                  {!campaignMode && (
                    <div className="flex justify-center gap-3">
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
              )}
            </div>
  </section>

          <section className="flex flex-col h-full bg-white/80 backdrop-blur">
            <header className="px-6 py-4 border-b border-muted-foreground/10">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{copy.statusCard.title}</h2>
            </header>
            <div className="flex-1 px-6 pb-6 overflow-y-auto">
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
              <div className="mt-4">
                <CampaignStatusList campaigns={campaigns} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
function CampaignStatusList({ campaigns }: { campaigns: Campaign[] }) {
  const badgeClass = (status: Campaign["status"]) =>
    status === "finished"
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : "bg-slate-100 text-slate-700 border border-slate-200";

  return (
    <div className="rounded-2xl border border-muted-foreground/15 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="px-5 py-4 border-b border-muted-foreground/10">
        <h3 className="text-md font-semibold tracking-tight text-foreground">Campaigns</h3>
        <p className="text-sm text-muted-foreground">Status across your campaigns</p>
      </div>
      <div className="divide-y divide-muted-foreground/10">
        {campaigns.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">No campaigns yet.</div>
        ) : (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {campaign.campaignGoal || "Untitled campaign"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {campaign.productDetails || "Pending details"}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badgeClass(campaign.status)}`}
              >
                {campaign.status === "finished" ? "Finished" : "Pending"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

}
