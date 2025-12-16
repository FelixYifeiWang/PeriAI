import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Sparkles, Link as LinkIcon, Copy, CheckCircle, ArrowLeft } from "lucide-react";
import { z } from "zod";
import type { InfluencerPreferences, InfluencerSocialAccount } from "@shared/schema";
import { Link } from "wouter";
import LanguageToggle from "@/components/language-toggle";
import { useLanguage } from "@/providers/language-provider";

const translations = {
  en: {
    loading: "Loading...",
    header: {
      back: "Dashboard",
    },
    toast: {
      unauthorized: {
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
      },
      usernameUpdated: {
        title: "Username updated",
        description: "Your unique URL has been updated.",
      },
      usernameError: {
        title: "Error",
        description: "Failed to update username. Please try again.",
      },
      preferencesSaved: {
        title: "Preferences saved",
        description: "Your AI agent has been updated with your preferences.",
      },
      preferencesError: {
        title: "Error",
        description: "Failed to save preferences. Please try again.",
      },
      copySuccess: {
        title: "Copied!",
        description: "Your public URL has been copied to clipboard.",
      },
    },
    publicProfile: {
      cardTitle: "Public Profile URL",
      cardDescription: "Set your unique username to create a shareable inquiry form link",
      usernameLabel: "Username",
      usernamePlaceholder: "your-username",
      usernameHint: "3-30 characters, letters, numbers, hyphens and underscores only",
      saveButton: {
        idle: "Save",
        pending: "Saving...",
      },
      publicFormLabel: "Your Public Inquiry Form",
      shareHint: "Share this link with businesses who want to collaborate with you",
      copyButtonLabel: {
        copied: "Copied",
        idle: "Copy link",
      },
      copyAriaLabel: "Copy public inquiry form link",
    },
    aiInstructions: {
      cardTitle: "AI Agent Instructions",
      cardDescription: "Configure how your AI agent should handle business inquiries",
      contentPreferencesLabel: "Content Preferences",
      contentPreferencesPlaceholder:
        "Describe the type of content you create, what you will and won't promote, your values, etc.",
      monetaryLabel: "Minimum Rate ($)",
      monetaryPlaceholder: "5000",
      contentLengthLabel: "Preferred Content Length",
      contentLengthPlaceholder: "Select content length",
      contentLengthOptions: [
        { value: "short", label: "Short (30-60 seconds)" },
        { value: "medium", label: "Medium (1-3 minutes)" },
        { value: "long", label: "Long (3+ minutes)" },
        { value: "flexible", label: "Flexible" },
      ] as const,
      additionalGuidelinesLabel: "Additional Guidelines (Optional)",
      additionalGuidelinesPlaceholder: "Any other guidelines or requirements for collaborations...",
      socialLinksLabel: "Social links (optional)",
      socialPlaceholders: {
        instagram: "https://instagram.com/you",
        tiktok: "https://www.tiktok.com/@you",
        youtube: "https://www.youtube.com/@you",
      },
      buttons: {
        save: "Save Preferences",
        saving: "Saving...",
        reset: "Reset",
      },
      defaultAdditionalGuidelines:
        "I prefer creative freedom in how I present collaborations. Typical turnaround time is 2-3 weeks.",
    },
    validation: {
      personalContentPreferences: "Please provide more details about your content preferences",
      monetaryBaseline: "Please set a minimum rate",
      contentLength: "Please select a content length",
    },
    defaultTemplate: `I create lifestyle and wellness content focused on sustainable living and mindful consumption. I'm passionate about authentic partnerships with brands that align with my values.

I will consider collaborations that:
- Promote eco-friendly or sustainable products
- Support small businesses and ethical brands
- Align with wellness, health, or personal development

I will not promote:
- Fast fashion or unsustainable products
- Products tested on animals
- Multi-level marketing schemes
- Content that conflicts with my values`,
  },
  zh: {
    loading: "加载中…",
    header: {
      back: "返回仪表盘",
    },
    toast: {
      unauthorized: {
        title: "未授权",
        description: "你已退出登录，正在重新跳转…",
      },
      usernameUpdated: {
        title: "用户名已更新",
        description: "你的公开链接已经同步。",
      },
      usernameError: {
        title: "错误",
        description: "更新用户名失败，请稍后再试。",
      },
      preferencesSaved: {
        title: "偏好设置已保存",
        description: "你的 AI 代理已经根据最新偏好进行更新。",
      },
      preferencesError: {
        title: "错误",
        description: "保存偏好失败，请稍后再试。",
      },
      copySuccess: {
        title: "已复制",
        description: "你的公开链接已复制到剪贴板。",
      },
    },
    publicProfile: {
      cardTitle: "公开资料链接",
      cardDescription: "设置唯一用户名，创建可分享的询问表单链接",
      usernameLabel: "用户名",
      usernamePlaceholder: "your-username",
      usernameHint: "长度 3-30 个字符，仅限字母、数字、连字符或下划线",
      saveButton: {
        idle: "保存",
        pending: "保存中…",
      },
      publicFormLabel: "你的公开询问表单",
      shareHint: "将此链接分享给希望与你合作的品牌方",
      copyButtonLabel: {
        copied: "已复制",
        idle: "复制链接",
      },
      copyAriaLabel: "复制公开询问表单链接",
    },
    aiInstructions: {
      cardTitle: "AI 代理指引",
      cardDescription: "配置 AI 代理处理品牌询问的方式",
      contentPreferencesLabel: "内容偏好",
      contentPreferencesPlaceholder:
        "描述你擅长的内容类型、愿意或拒绝推广的方向、品牌价值观等。",
      monetaryLabel: "最低报价（人民币）",
      monetaryPlaceholder: "5000",
      contentLengthLabel: "偏好的内容时长",
      contentLengthPlaceholder: "请选择内容时长",
      contentLengthOptions: [
        { value: "short", label: "短内容（30-60 秒）" },
        { value: "medium", label: "中等内容（1-3 分钟）" },
        { value: "long", label: "长内容（3 分钟以上）" },
        { value: "flexible", label: "灵活" },
      ] as const,
      additionalGuidelinesLabel: "其他指引（可选）",
      additionalGuidelinesPlaceholder: "填写合作的其他要求或注意事项…",
      socialLinksLabel: "社媒链接（可选）",
      socialPlaceholders: {
        instagram: "https://instagram.com/你的账号",
        tiktok: "https://www.tiktok.com/@你的账号",
        youtube: "https://www.youtube.com/@你的频道",
      },
      buttons: {
        save: "保存偏好",
        saving: "保存中…",
        reset: "重置",
      },
      defaultAdditionalGuidelines: "我通常需要创意自由，标准制作周期约为 2-3 周。",
    },
    validation: {
      personalContentPreferences: "请详细描述你的内容偏好（至少 10 个字符）",
      monetaryBaseline: "请设置一个最低报价",
      contentLength: "请选择内容时长",
    },
    defaultTemplate: `我专注于可持续生活与身心健康领域内容，擅长与价值观一致的品牌建立真诚合作。

我会考虑的合作：
- 推广环保或可持续产品
- 支持中小型企业与道德品牌
- 与健康、养生或个人成长相关

我不会推广：
- 快速时尚或不环保的产品
- 动物实验相关产品
- 多层次传销/直销项目
- 与我价值观冲突的内容`,
  },
} as const;

type ValidationCopy = (typeof translations)[keyof typeof translations]["validation"];

const buildPreferencesSchema = (validation: ValidationCopy) =>
  z.object({
    personalContentPreferences: z
      .string()
      .min(10, validation.personalContentPreferences),
    monetaryBaseline: z.coerce.number().min(1, validation.monetaryBaseline),
    contentLength: z.string().min(1, validation.contentLength),
    additionalGuidelines: z.string().optional(),
    socialLinks: z.record(z.string()).optional(),
  });

type PreferencesFormData = z.infer<ReturnType<typeof buildPreferencesSchema>>;

export default function InfluencerSetup() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { language } = useLanguage();
  const copy = useMemo(() => translations[language], [language]);
  const preferencesSchema = useMemo(
    () => buildPreferencesSchema(copy.validation),
    [copy],
  );
  const [username, setUsername] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: copy.toast.unauthorized.title,
        description: copy.toast.unauthorized.description,
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/influencer/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast, copy]);

  useEffect(() => {
    if (user) {
      setUsername((user as any).username || "");
    }
  }, [user]);

  const { data: preferences, isLoading: prefsLoading } = useQuery<InfluencerPreferences | null>({
    queryKey: ["/api/preferences"],
    enabled: isAuthenticated,
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

  const defaultValues = useMemo<PreferencesFormData>(
    () => ({
      personalContentPreferences: copy.defaultTemplate,
      monetaryBaseline: 2000,
      contentLength: "flexible",
      additionalGuidelines: copy.aiInstructions.defaultAdditionalGuidelines,
      socialLinks: {
        instagram: "",
        tiktok: "",
        youtube: "",
      },
    }),
    [copy],
  );

  const form = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
    defaultValues,
  });

  useEffect(() => {
    if (preferences) {
      form.reset({
        personalContentPreferences: preferences.personalContentPreferences,
        monetaryBaseline: preferences.monetaryBaseline,
        contentLength: preferences.contentLength,
        additionalGuidelines: preferences.additionalGuidelines || "",
        socialLinks: {
          instagram: (preferences.socialLinks as Record<string, string> | undefined)?.instagram ?? "",
          tiktok: (preferences.socialLinks as Record<string, string> | undefined)?.tiktok ?? "",
          youtube: (preferences.socialLinks as Record<string, string> | undefined)?.youtube ?? "",
        },
      });
    }
  }, [preferences, form]);

  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      const response = await fetch("/api/auth/username", {
        method: "PATCH",
        body: JSON.stringify({ username: newUsername }),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update username");
      }
      return response.json();
    },
    onSuccess: async () => {
      // Refresh the user context to update the username in real-time
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: copy.toast.usernameUpdated.title,
        description: copy.toast.usernameUpdated.description,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: copy.toast.unauthorized.title,
          description: copy.toast.unauthorized.description,
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/influencer/login";
        }, 500);
        return;
      }
      toast({
        title: copy.toast.usernameError.title,
        description: error.message || copy.toast.usernameError.description,
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: PreferencesFormData) => {
      const payload = {
        ...data,
        socialLinks: Object.fromEntries(
          Object.entries(data.socialLinks ?? {}).filter(([, value]) => value && value.trim().length > 0),
        ),
      };
      const response = await fetch("/api/preferences", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save preferences");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({
        title: copy.toast.preferencesSaved.title,
        description: copy.toast.preferencesSaved.description,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: copy.toast.unauthorized.title,
          description: copy.toast.unauthorized.description,
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/influencer/login";
        }, 500);
        return;
      }
      toast({
        title: copy.toast.preferencesError.title,
        description: copy.toast.preferencesError.description,
        variant: "destructive",
      });
    },
  });

  const syncSocial = useMutation({
    mutationFn: async ({ platform, url }: { platform: "instagram" | "tiktok" | "youtube"; url: string }) => {
      const res = await fetch("/api/social/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Failed to fetch profile");
      }
      return res.json() as Promise<InfluencerSocialAccount>;
    },
    onSuccess: () => {
      refetchSocialAccounts();
    },
  });

  const getAccount = (platform: "instagram" | "tiktok" | "youtube") =>
    (socialAccounts || []).find((acc) => acc.platform === platform);

  const fetchStats = (platform: "instagram" | "tiktok" | "youtube") => {
    const url = form.getValues()?.socialLinks?.[platform];
    if (!url || !url.trim()) {
      toast({ title: copy.toast.usernameError.title, description: "Please enter a profile link first.", variant: "destructive" });
      return;
    }
    syncSocial.mutate({ platform, url: url.trim() });
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/influencer/login";
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = "/influencer/login";
    }
  };

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username && username !== (user as any)?.username) {
      updateUsernameMutation.mutate(username);
    }
  };

  const copyPublicUrl = () => {
    const url = `${window.location.origin}/i/${(user as any)?.username || username}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast({
      title: copy.toast.copySuccess.title,
      description: copy.toast.copySuccess.description,
    });
  };

  if (isLoading || prefsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">{copy.loading}</div>
      </div>
    );
  }

  const hasUsername = !!(user as any)?.username;
  const publicUrl = hasUsername ? `${window.location.origin}/i/${(user as any)?.username}` : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold tracking-tight">
              <span className="text-primary">Peri.</span>
              <span className="text-foreground">ai</span>
            </div>
            <Link href="/influencer">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-to-dashboard">
                <ArrowLeft className="h-4 w-4" />
                {copy.header.back}
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">{(user as any)?.email}</div>
            <div className="flex items-center gap-2">
              <LanguageToggle className="h-9" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LinkIcon className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{copy.publicProfile.cardTitle}</CardTitle>
            </div>
            <CardDescription className="text-base">
              {copy.publicProfile.cardDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleUsernameSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{copy.publicProfile.usernameLabel}</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 border rounded-lg px-3">
                    <span className="text-sm text-muted-foreground">{window.location.origin}/i/</span>
                    <Input
                      className="border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder={copy.publicProfile.usernamePlaceholder}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      data-testid="input-username"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={updateUsernameMutation.isPending || !username || username === (user as any)?.username}
                    data-testid="button-save-username"
                  >
                    {updateUsernameMutation.isPending
                      ? copy.publicProfile.saveButton.pending
                      : copy.publicProfile.saveButton.idle}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {copy.publicProfile.usernameHint}
                </p>
              </div>
            </form>

            {publicUrl && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">
                      {copy.publicProfile.publicFormLabel}
                    </p>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all"
                    >
                      {publicUrl}
                    </a>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyPublicUrl}
                    data-testid="button-copy-url"
                    aria-label={copy.publicProfile.copyAriaLabel}
                  >
                    {isCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="sr-only">
                      {isCopied
                        ? copy.publicProfile.copyButtonLabel.copied
                        : copy.publicProfile.copyButtonLabel.idle}
                    </span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {copy.publicProfile.shareHint}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{copy.aiInstructions.cardTitle}</CardTitle>
            </div>
            <CardDescription className="text-base">
              {copy.aiInstructions.cardDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
                <FormField
                  control={form.control}
                  name="personalContentPreferences"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.aiInstructions.contentPreferencesLabel}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={copy.aiInstructions.contentPreferencesPlaceholder}
                          className="min-h-32 resize-none"
                          {...field}
                          data-testid="input-content-preferences"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="monetaryBaseline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.aiInstructions.monetaryLabel}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder={copy.aiInstructions.monetaryPlaceholder}
                          {...field}
                          data-testid="input-monetary-baseline"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contentLength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.aiInstructions.contentLengthLabel}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-content-length">
                            <SelectValue placeholder={copy.aiInstructions.contentLengthPlaceholder} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {copy.aiInstructions.contentLengthOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="additionalGuidelines"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.aiInstructions.additionalGuidelinesLabel}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={copy.aiInstructions.additionalGuidelinesPlaceholder}
                          className="min-h-24 resize-none"
                          {...field}
                          data-testid="input-additional-guidelines"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {copy.aiInstructions.socialLinksLabel}
                  </p>
                  <div className="space-y-3">
                    {(["instagram", "tiktok", "youtube"] as const).map((platform) => {
                      const account = getAccount(platform);
                      return (
                        <div key={platform} className="rounded-lg border bg-muted/40 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">{platform}</p>
                              {account?.handle && (
                                <p className="text-sm text-foreground">@{account.handle}</p>
                              )}
                          {account && (
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                  <span>Followers: {account.followers ?? "—"}</span>
                                  <span>Likes/Views: {account.likes ?? "—"}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => fetchStats(platform)} disabled={syncSocial.isPending}>
                                {account ? "Refresh" : "Fetch"}
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <FormField
                              control={form.control}
                              name={`socialLinks.${platform}` as const}
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Profile link
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder={copy.aiInstructions.socialPlaceholders[platform]}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              className="self-end"
                              onClick={() => fetchStats(platform)}
                              disabled={syncSocial.isPending}
                            >
                              {account ? "Refresh" : "Fetch"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    data-testid="button-save-preferences"
                  >
                    {saveMutation.isPending ? copy.aiInstructions.buttons.saving : copy.aiInstructions.buttons.save}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => form.reset(defaultValues)}
                    disabled={saveMutation.isPending}
                    data-testid="button-reset"
                  >
                    {copy.aiInstructions.buttons.reset}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
