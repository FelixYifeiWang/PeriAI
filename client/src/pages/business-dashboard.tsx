import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { BusinessProfile } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/providers/language-provider";
import LanguageToggle from "@/components/language-toggle";
import { Link } from "wouter";
import { LogOut, Send, Sparkles } from "lucide-react";
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
              intro: (companyName?: string | null) =>
                `Hi! I'm your brand AI. ${companyName ? `Tell me what ${companyName} needs and I'll help. ` : "Ask for anything and I'll dive in."}`,
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

      <main className="w-full px-0 pb-0">
        <div className="grid lg:grid-cols-[3fr,2fr] h-[calc(100vh-96px)] w-full">
          <section className="flex flex-col h-full border-r border-muted-foreground/10 bg-white/80 backdrop-blur">
            <header className="flex items-center gap-3 px-6 py-4 border-b border-muted-foreground/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{copy.chat.title}</h2>
            </header>
            <div className="flex-1 flex flex-col gap-4 px-6 pb-6 overflow-hidden">
              <div className="flex-1 rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4 overflow-y-auto space-y-4 shadow-sm">
                {!hasMessages && (
                  <div className="flex h-full items-center justify-center text-center">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                      }}
                      className="w-full max-w-xl space-y-3"
                    >
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="text-base font-semibold text-foreground">
                          {copy.chat.intro(profile?.companyName)}
                        </div>
                      </div>
                      <div className="relative rounded-2xl border border-slate-200 bg-white/80 shadow-sm px-3 pt-3 pb-10">
                        <Textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={copy.chat.placeholder}
                          className="min-h-[72px] w-full resize-none border-none bg-transparent pr-12 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                          disabled={chatMutation.isPending}
                          autoFocus
                        />
                        <Button
                          type="submit"
                          disabled={!input.trim() || chatMutation.isPending}
                          className="absolute bottom-3 right-3 h-9 w-9 rounded-full p-0 shadow-sm"
                          size="icon"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </form>
                  </div>
                )}
                {hasMessages && messages.map((message) => {
                  const alignment = message.role === "assistant" ? "justify-start" : "justify-end";
                  const bubbleClasses =
                    message.role === "assistant"
                      ? "bg-white text-foreground border border-slate-200 shadow-sm"
                      : "bg-primary text-primary-foreground";

                  return (
                    <div
                      key={message.id}
                      className={`flex ${alignment}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${bubbleClasses}`}
                      >
                        {message.content}
                      </div>
                    </div>
                  );
                })}
                {chatMutation.isPending && (
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
                  <div className="relative rounded-2xl border border-slate-200 bg-white/80 shadow-sm px-3 pt-3 pb-10">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={copy.chat.placeholder}
                      className="min-h-[72px] w-full resize-none border-none bg-transparent pr-12 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                      disabled={chatMutation.isPending}
                    />
                    <Button
                      type="submit"
                      disabled={!input.trim() || chatMutation.isPending}
                      className="absolute bottom-3 right-3 h-9 w-9 rounded-full p-0 shadow-sm"
                      size="icon"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
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
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
