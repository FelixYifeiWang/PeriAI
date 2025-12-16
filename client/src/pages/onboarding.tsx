import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { InfluencerPreferences, InfluencerSocialAccount } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/providers/language-provider";
import LanguageToggle from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

type ContentLength = "short" | "medium" | "long" | "flexible";

const preferencesQueryFn = getQueryFn<InfluencerPreferences | null>({
  on401: "returnNull",
});

const translations = {
  en: {
    loading: "Loading…",
    toast: {
      errorTitle: "Something went wrong",
      errorDescription: "Failed to save preferences.",
    },
    buttons: {
      continue: "Continue",
      saving: "Saving...",
    },
    steps: {
      intro: {
        title: "Let’s tailor your experience.",
        description: "Answer a few quick questions so your AI agent can represent you perfectly.",
      },
      monetary: {
        title: "What’s your monetary incentive range",
        highlight: "(lowest-highest)?",
        description: "Help brands understand the budget you typically work within.",
        placeholder: "e.g. $100 - $1000",
        baselinePrefix: "We’ll set your baseline to the lowest value you provide:",
        baselineSuffix: "from this range.",
      },
      contentLength: {
        title: "How long is the content you prefer to create?",
        description: "Pick the format that best reflects your usual collaborations.",
      },
      preferences: {
        title: "Share your content style and guidelines",
        description: "Tell us what resonates with you and any guardrails brands should know.",
        labels: {
          personal: "Personal content preferences",
          additional: "Additional guidelines (optional)",
        },
        placeholders: {
          personal: "Themes you love, brand values you align with, or types of stories you share.",
          additional: "Any do’s and don’ts, collaboration preferences, or timelines.",
        },
      },
      socials: {
        title: "Add your social links (optional)",
        description: "Share where brands can browse your work.",
        placeholders: {
          instagram: "https://instagram.com/you",
          tiktok: "https://www.tiktok.com/@you",
          youtube: "https://www.youtube.com/@you",
        },
      },
    },
    contentLengthOptions: [
      {
        value: "short" as ContentLength,
        label: "Short",
        helper: "Snappy formats like Reels, Shorts, or TikToks.",
      },
      {
        value: "medium" as ContentLength,
        label: "Medium",
        helper: "Standard feed posts or videos under 5 minutes.",
      },
      {
        value: "long" as ContentLength,
        label: "Long",
        helper: "Deep dives, livestreams, or detailed reviews.",
      },
      {
        value: "flexible" as ContentLength,
        label: "Flexible",
        helper: "Open to experimenting with different lengths.",
      },
    ],
    defaults: {
      additionalGuidelines:
        "I prefer creative freedom in how I present collaborations. Typical turnaround time is 2-3 weeks.",
    },
    errors: {
      monetaryInvalid: "Please enter a valid monetary range (numbers only).",
      contentLengthMissing: "Please select the content length you prefer.",
      preferencesShort: "Tell us a bit more about your style (at least 10 characters).",
      monetaryMissing: "Please provide your monetary range before continuing.",
    },
    baselineFallback: "…",
  },
  zh: {
    loading: "加载中…",
    toast: {
      errorTitle: "发生了错误",
      errorDescription: "保存偏好设置失败。",
    },
    buttons: {
      continue: "继续",
      saving: "保存中…",
    },
    steps: {
      intro: {
        title: "让我们为你量身定制体验",
        description: "回答几个快速问题，让你的 AI 代理更好地代表你。",
      },
      monetary: {
        title: "你的合作预算范围",
        highlight: "（最低-最高）？",
        description: "帮助品牌了解与你合作的预算区间。",
        placeholder: "例如 ¥800 - ¥3000",
        baselinePrefix: "我们会将最低值设为你的基准价：",
        baselineSuffix: "，来自你提供的区间。",
      },
      contentLength: {
        title: "你偏好的内容时长是？",
        description: "选择最符合你常规合作形式的内容长度。",
      },
      preferences: {
        title: "分享你的内容风格与合作指引",
        description: "告诉我们你喜欢的内容、品牌调性以及需要品牌遵守的注意事项。",
        labels: {
          personal: "个人内容偏好",
          additional: "额外指引（可选）",
        },
        placeholders: {
          personal: "你擅长的主题、契合的品牌价值观、或经常分享的故事方向。",
          additional: "填写合作的其他要求、禁忌或时间安排等。",
        },
      },
      socials: {
        title: "添加你的社媒链接（可选）",
        description: "方便品牌查看你的作品与账号表现。",
        placeholders: {
          instagram: "https://instagram.com/你的账号",
          tiktok: "https://www.tiktok.com/@你的账号",
          youtube: "https://www.youtube.com/@你的频道",
        },
      },
    },
    contentLengthOptions: [
      {
        value: "short" as ContentLength,
        label: "短内容",
        helper: "适合 Reels、短视频或快节奏内容。",
      },
      {
        value: "medium" as ContentLength,
        label: "中等内容",
        helper: "标准图文或 5 分钟以内的视频。",
      },
      {
        value: "long" as ContentLength,
        label: "长内容",
        helper: "适合深度解析、直播或详细测评。",
      },
      {
        value: "flexible" as ContentLength,
        label: "灵活",
        helper: "愿意尝试不同形式和长度。",
      },
    ],
    defaults: {
      additionalGuidelines: "我通常需要创意自由，常规制作周期约为 2-3 周。",
    },
    errors: {
      monetaryInvalid: "请输入有效的预算区间（仅限数字）",
      contentLengthMissing: "请选择你偏好的内容时长。",
      preferencesShort: "请再多分享一些你的风格（至少 10 个字符）。",
      monetaryMissing: "请先提供你的预算区间再继续。",
    },
    baselineFallback: "…",
  },
} as const;

type OnboardingCopy = (typeof translations)[keyof typeof translations];

const boardStyle: CSSProperties = {
  backgroundImage: "url(/images/onboard_board.png)",
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  minHeight: "520px",
};

const continueButtonStyle: CSSProperties = {
  backgroundImage: "url(/images/onboard_button.png)",
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  width: "130px",
  height: "48px",
  border: "none",
  cursor: "pointer",
};

const parseMonetaryBaseline = (input: string): number | null => {
  if (!input) return null;
  const matches = input.match(/\d[\d,\.]*/g);
  if (!matches || matches.length === 0) return null;

  const numericValues = matches
    .map((value) => Number.parseFloat(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (numericValues.length === 0) return null;
  const baseline = Math.min(...numericValues);
  return Math.round(baseline);
};

export default function OnboardingPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { language } = useLanguage();
  const copy = useMemo<OnboardingCopy>(() => translations[language], [language]);
  const localizedContentLengthOptions = copy.contentLengthOptions;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [monetaryInput, setMonetaryInput] = useState("");
  const [monetaryBaseline, setMonetaryBaseline] = useState<number | null>(null);
  const [contentLength, setContentLength] = useState<ContentLength | "">("");
  const [personalPreferences, setPersonalPreferences] = useState("");
  const [additionalGuidelines, setAdditionalGuidelines] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({
    instagram: "",
    tiktok: "",
    youtube: "",
  });
  const [manualStats, setManualStats] = useState<Record<"instagram" | "tiktok" | "youtube", { handle: string; followers: string; likes: string }>>({
    instagram: { handle: "", followers: "", likes: "" },
    tiktok: { handle: "", followers: "", likes: "" },
    youtube: { handle: "", followers: "", likes: "" },
  });
  const [error, setError] = useState<string | null>(null);

  const { data: preferences, isLoading: preferencesLoading } =
    useQuery<InfluencerPreferences | null>({
      queryKey: ["/api/preferences"],
      queryFn: preferencesQueryFn,
      enabled: isAuthenticated,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    });

  const { data: socialAccounts, refetch: refetchSocialAccounts } = useQuery<InfluencerSocialAccount[]>({
    queryKey: ["/api/social/accounts"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const res = await fetch("/api/social/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load social accounts");
      return res.json();
    },
    staleTime: 30_000,
  });

useEffect(() => {
  if (!isLoading && !isAuthenticated) {
    setLocation("/influencer/login");
    return;
  }

    if (!isLoading && !preferencesLoading && preferences) {
    setLocation("/influencer");
  }
}, [isAuthenticated, isLoading, preferences, preferencesLoading, setLocation]);

useEffect(() => {
  if (preferences) {
    setPersonalPreferences(preferences.personalContentPreferences || "");
    setContentLength((preferences.contentLength as ContentLength) || "");
    setAdditionalGuidelines(preferences.additionalGuidelines || "");
    setSocialLinks({
      instagram: (preferences.socialLinks as Record<string, string> | undefined)?.instagram ?? "",
      tiktok: (preferences.socialLinks as Record<string, string> | undefined)?.tiktok ?? "",
      youtube: (preferences.socialLinks as Record<string, string> | undefined)?.youtube ?? "",
    });
  }
}, [preferences]);

  const parsedBaselinePreview = useMemo(
    () => parseMonetaryBaseline(monetaryInput),
    [monetaryInput],
  );

  const savePreferences = useMutation({
    mutationFn: async (payload: {
      personalContentPreferences: string;
      monetaryBaseline: number;
      contentLength: ContentLength;
      additionalGuidelines?: string;
      socialLinks?: Record<string, string>;
    }) => {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || "Failed to save preferences");
      }

      return (await response.json()) as InfluencerPreferences;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      queryClient.setQueryData(["/api/preferences"], saved);
      setLocation("/influencer");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : copy.toast.errorDescription;
      toast({
        title: copy.toast.errorTitle,
        description: message,
        variant: "destructive",
      });
    },
  });

  const lookupSocial = useMutation({
    mutationFn: async ({ platform, url }: { platform: "instagram" | "tiktok" | "youtube"; url: string }) => {
      const res = await fetch("/api/social/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { message?: string }).message || "Failed to fetch profile");
      }
      return res.json() as Promise<InfluencerSocialAccount>;
    },
    onSuccess: () => {
      refetchSocialAccounts();
    },
  });

  const manualSocial = useMutation({
    mutationFn: async (payload: {
      platform: "instagram" | "tiktok" | "youtube";
      handle: string;
      followers?: number | null;
      likes?: number | null;
      url?: string | null;
    }) => {
      const res = await fetch("/api/social/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { message?: string }).message || "Failed to save profile");
      }
      return res.json() as Promise<InfluencerSocialAccount>;
    },
    onSuccess: () => {
      refetchSocialAccounts();
    },
  });

  if (isLoading || (isAuthenticated && preferencesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-lg font-medium text-slate-500">{copy.loading}</div>
      </div>
    );
  }

  const handleContinue = () => {
    setError(null);

    if (stepIndex === 0) {
      setStepIndex(1);
      return;
    }

    if (stepIndex === 1) {
      const parsed = parseMonetaryBaseline(monetaryInput);
      if (!parsed) {
        setError(copy.errors.monetaryInvalid);
        return;
      }
      setMonetaryBaseline(parsed);
      setStepIndex(2);
      return;
    }

    if (stepIndex === 2) {
      if (!contentLength) {
        setError(copy.errors.contentLengthMissing);
        return;
      }
      setStepIndex(3);
      return;
    }

    if (stepIndex === 3) {
      const trimmedPreferences = personalPreferences.trim();
      if (trimmedPreferences.length < 10) {
        setError(copy.errors.preferencesShort);
        return;
      }
      setStepIndex(4);
      return;
    }

    // Step 4: social links + submit
    const trimmedPreferences = personalPreferences.trim();
    if (trimmedPreferences.length < 10) {
      setError(copy.errors.preferencesShort);
      return;
    }

  if (!monetaryBaseline) {
    setError(copy.errors.monetaryMissing);
    setStepIndex(0);
    return;
  }

  savePreferences
    .mutateAsync({
      personalContentPreferences: trimmedPreferences,
      monetaryBaseline,
      contentLength: contentLength as ContentLength,
      additionalGuidelines: additionalGuidelines.trim() || undefined,
      socialLinks: Object.fromEntries(
        Object.entries(socialLinks).filter(([, value]) => value && value.trim().length > 0),
      ),
    })
    .then(async () => {
      const tasks: Array<Promise<unknown>> = [];
      (["instagram", "tiktok", "youtube"] as const).forEach((platform) => {
        const entry = manualStats[platform];
        const hasManual =
          (entry.handle && entry.handle.trim()) ||
          (entry.followers && entry.followers.trim()) ||
          (entry.likes && entry.likes.trim());
        if (hasManual) {
          tasks.push(
            manualSocial.mutateAsync({
              platform,
              handle: entry.handle?.trim() || "manual",
              followers: entry.followers ? Number(entry.followers.replace(/,/g, "")) || 0 : undefined,
              likes: entry.likes ? Number(entry.likes.replace(/,/g, "")) || 0 : undefined,
              url: socialLinks[platform] || undefined,
            }),
          );
        }
      });
      if (tasks.length) {
        await Promise.allSettled(tasks);
      }
      setLocation("/influencer");
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : copy.toast.errorDescription;
      toast({
        title: copy.toast.errorTitle,
        description: message,
        variant: "destructive",
      });
    });
};

  const getAccount = (platform: "instagram" | "tiktok" | "youtube") =>
    (socialAccounts || []).find((acc) => acc.platform === platform);

  const fetchStats = (platform: "instagram" | "tiktok" | "youtube") => {
    const url = socialLinks[platform];
    if (!url || !url.trim()) {
      setError("Please enter a profile link first.");
      return;
    }
    lookupSocial.mutate({ platform, url: url.trim() });
  };

  const renderStep = () => {
    switch (stepIndex) {
      case 0:
        return (
          <div className="flex w-full flex-col items-center justify-center gap-6 text-center">
            <h1 className="max-w-xl text-2xl font-semibold text-[#573ccb] md:text-3xl">
              {copy.steps.intro.title}
            </h1>
            <p className="text-base text-slate-600">
              {copy.steps.intro.description}
            </p>
          </div>
        );
      case 1:
        return (
          <div className="flex w-full flex-col items-center gap-6 text-center">
            <h1 className="max-w-xl text-2xl font-semibold text-[#573ccb] md:text-3xl">
              {copy.steps.monetary.title}{" "}
              <span className="text-[#6d28d9]">{copy.steps.monetary.highlight}</span>
            </h1>
            <p className="text-base text-slate-600">
              {copy.steps.monetary.description}
            </p>
            <div className="w-full max-w-md space-y-3">
              <input
                type="text"
                value={monetaryInput}
                onChange={(event) => setMonetaryInput(event.target.value)}
                placeholder={copy.steps.monetary.placeholder}
                className="w-full rounded-full border border-transparent bg-white/90 px-6 py-3 text-center text-lg text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
              />
              <p className="text-sm text-slate-500">
                {copy.steps.monetary.baselinePrefix}{" "}
                <span className="font-semibold text-[#6d28d9]">
                  {parsedBaselinePreview ?? copy.baselineFallback}
                </span>{" "}
                {copy.steps.monetary.baselineSuffix}
              </p>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="flex w-full flex-col items-center gap-8 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-[#573ccb] md:text-3xl">
                {copy.steps.contentLength.title}
              </h2>
              <p className="text-base text-slate-600">
                {copy.steps.contentLength.description}
              </p>
            </div>
            <div className="grid w-full gap-4 px-4 md:grid-cols-2">
              {localizedContentLengthOptions.map((option) => {
                const selected = contentLength === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setContentLength(option.value)}
                    className={`rounded-3xl border px-6 py-5 text-left transition focus:outline-none focus:ring-2 focus:ring-[#a855f7] ${
                      selected
                        ? "border-[#8b5cf6] bg-white shadow-lg shadow-[#a855f7]/25"
                        : "border-transparent bg-white/80 hover:border-[#c4b5fd]"
                    }`}
                  >
                    <span className="text-lg font-semibold text-slate-800">
                      {option.label}
                    </span>
                    <p className="mt-2 text-sm text-slate-500">
                      {option.helper}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="flex w-full flex-col items-center gap-6 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-[#573ccb] md:text-3xl">
                {copy.steps.preferences.title}
              </h2>
              <p className="text-base text-slate-600">
                {copy.steps.preferences.description}
              </p>
            </div>
            <div className="w-full max-w-lg space-y-5 text-left">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#573ccb]">
                  {copy.steps.preferences.labels.personal}
                </label>
                <textarea
                  value={personalPreferences}
                  onChange={(event) => setPersonalPreferences(event.target.value)}
                  rows={2}
                  className="w-full rounded-3xl border border-transparent bg-white/85 px-5 py-3 text-base text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                  placeholder={copy.steps.preferences.placeholders.personal}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#573ccb]">
                  {copy.steps.preferences.labels.additional}
                </label>
                <textarea
                  value={additionalGuidelines}
                  onChange={(event) =>
                    setAdditionalGuidelines(event.target.value)
                  }
                  rows={1}
                  className="w-full rounded-3xl border border-transparent bg-white/85 px-5 py-3 text-base text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                  placeholder={copy.steps.preferences.placeholders.additional}
                />
              </div>
            </div>
          </div>
        );
      case 4:
      default:
        return (
          <div className="flex w-full flex-col items-center gap-6 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-[#573ccb] md:text-3xl">
                {copy.steps.socials.title}
              </h2>
              <p className="text-base text-slate-600">
                {copy.steps.socials.description}
              </p>
            </div>
            <div className="w-full max-w-lg space-y-4 text-left">
              {(["instagram", "tiktok", "youtube"] as const).map((platform) => {
                const account = getAccount(platform);
                return (
                  <div key={platform} className="space-y-2 rounded-3xl bg-white/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm uppercase tracking-wide text-slate-500">{platform}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                          <span>Handle: {account?.handle ? `@${account.handle}` : "—"}</span>
                          <span>Followers: {account?.followers ?? "—"}</span>
                          <span>Likes/Views: {account?.likes ?? "—"}</span>
                          {account?.lastSyncedAt && (
                            <span>Updated: {new Date(account.lastSyncedAt).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          value={socialLinks[platform] ?? ""}
                          onChange={(event) =>
                            setSocialLinks((prev) => ({
                              ...prev,
                              [platform]: event.target.value,
                            }))
                          }
                          className="flex-1 rounded-2xl border border-transparent bg-white px-4 py-2 text-sm text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                          placeholder={copy.steps.socials.placeholders[platform]}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => fetchStats(platform)}
                          disabled={lookupSocial.isPending}
                        >
                          {account ? "Refresh" : "Fetch"}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={manualStats[platform].handle}
                          onChange={(e) =>
                            setManualStats((prev) => ({
                              ...prev,
                              [platform]: { ...prev[platform], handle: e.target.value },
                            }))
                          }
                          className="flex-1 rounded-2xl border border-transparent bg-white px-3 py-2 text-sm text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                          placeholder="Handle (optional)"
                        />
                        <input
                          value={manualStats[platform].followers}
                          onChange={(e) =>
                            setManualStats((prev) => ({
                              ...prev,
                              [platform]: { ...prev[platform], followers: e.target.value },
                            }))
                          }
                          className="w-32 rounded-2xl border border-transparent bg-white px-3 py-2 text-sm text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                          placeholder="Followers"
                          inputMode="numeric"
                        />
                        <input
                          value={manualStats[platform].likes}
                          onChange={(e) =>
                            setManualStats((prev) => ({
                              ...prev,
                              [platform]: { ...prev[platform], likes: e.target.value },
                            }))
                          }
                          className="w-32 rounded-2xl border border-transparent bg-white px-3 py-2 text-sm text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                          placeholder="Likes/Views"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      window.location.href = "/influencer/login";
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white">
      <div className="absolute right-6 top-6 flex items-center gap-3">
        <div className="text-sm text-slate-500">{user?.email}</div>
        <LanguageToggle className="h-9" />
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="relative mx-4 flex w-full max-w-4xl flex-col items-center px-6 py-14"
        style={boardStyle}
      >
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-10">
          {renderStep()}
        </div>

        {error && (
          <p className="mt-6 text-sm font-medium text-rose-500">{error}</p>
        )}

        <button
          onClick={handleContinue}
          disabled={savePreferences.isPending}
          data-testid="button-onboarding-next"
          className="mt-6 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={continueButtonStyle}
        >
          <span className="sr-only">
            {savePreferences.isPending ? copy.buttons.saving : copy.buttons.continue}
          </span>
        </button>

        <div className="h-10" />
      </div>
    </div>
  );
}
