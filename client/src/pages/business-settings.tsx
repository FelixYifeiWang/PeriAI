import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/providers/language-provider";
import LanguageToggle from "@/components/language-toggle";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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
import { Separator } from "@/components/ui/separator";
import type { BusinessProfile } from "@shared/schema";
import { isBusinessProfileComplete } from "@/lib/businessProfile";
import { Link, useLocation } from "wouter";
import { ArrowLeft, LogOut } from "lucide-react";

const translations = {
  en: {
    loading: "Loading...",
    header: {
      back: "Dashboard",
    },
    toast: {
      saved: "Profile updated",
      error: "Failed to save profile. Please try again.",
    },
    cards: {
      brand: {
        title: "Brand Basics",
        description: "Company name, industry, site, and preferred team size.",
        labels: {
          company: "Company Name",
          industry: "Industry",
          website: "Website",
          companySize: "Team Size",
        },
      },
      story: {
        title: "Brand Story",
        description: "Share positioning, hero products, or past collaborations.",
        label: "Brand story",
      },
      socials: {
        title: "Social Presence (optional)",
        description: "Let creators discover your brand across channels.",
        labels: {
          instagram: "Instagram",
          tiktok: "TikTok",
          youtube: "YouTube",
        },
      },
    },
    buttons: {
      save: "Save Changes",
      saving: "Saving...",
    },
    validation: {
      company: "Company name and industry are required",
      story: "Please add at least 30 characters describing your brand",
    },
  },
  zh: {
    loading: "加载中…",
    header: {
      back: "返回仪表盘",
    },
    toast: {
      saved: "资料已更新",
      error: "保存失败，请稍后再试。",
    },
    cards: {
      brand: {
        title: "品牌基础信息",
        description: "公司名称、行业、官网以及团队规模。",
        labels: {
          company: "公司名称",
          industry: "行业",
          website: "公司网站",
          companySize: "团队规模",
        },
      },
      story: {
        title: "品牌故事",
        description: "介绍品牌定位、主打产品或过往合作。",
        label: "品牌介绍",
      },
      socials: {
        title: "社媒资料（可选）",
        description: "展示品牌活跃的社交渠道。",
        labels: {
          instagram: "Instagram",
          tiktok: "TikTok",
          youtube: "YouTube",
        },
      },
    },
    buttons: {
      save: "保存更改",
      saving: "保存中…",
    },
    validation: {
      company: "请填写公司名称与行业",
      story: "品牌介绍至少 30 个字符",
    },
  },
} as const;

const socialsList = ["instagram", "tiktok", "youtube"] as const;

const businessProfileSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().min(1),
  website: z.string().url().optional().or(z.literal("")),
  companySize: z.string().min(1),
  description: z.string().min(30),
  socialLinks: z.record(z.string()).optional(),
});

type BusinessProfileFormValues = z.infer<typeof businessProfileSchema>;

export default function BusinessSettingsPage() {
  const { language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const copy = useMemo(() => translations[language], [language]);

  const { data: profile, isLoading } = useQuery<BusinessProfile | null>({
    queryKey: ["/api/business/profile"],
    queryFn: async () => {
      const res = await fetch("/api/business/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isBusinessProfileComplete(profile)) {
      setLocation("/business/onboarding");
    }
  }, [isLoading, isAuthenticated, profile, setLocation]);

  const form = useForm<BusinessProfileFormValues>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      companyName: "",
      industry: "",
      website: "",
      companySize: "",
      description: "",
      socialLinks: {
        instagram: "",
        tiktok: "",
        youtube: "",
      },
    },
  });

  useEffect(() => {
    if (profile) {
      const links = (profile.socialLinks as Record<string, string> | null) ?? {};
      form.reset({
        companyName: profile.companyName ?? "",
        industry: profile.industry ?? "",
        website: profile.website ?? "",
        companySize: profile.companySize ?? "",
        description: profile.description ?? "",
        socialLinks: {
          instagram: links["instagram"] ?? "",
          tiktok: links["tiktok"] ?? "",
          youtube: links["youtube"] ?? "",
        },
      });
    }
  }, [profile, form]);

  const mutation = useMutation({
    mutationFn: async (values: BusinessProfileFormValues) => {
      const payload = {
        ...values,
        socialLinks: Object.fromEntries(
          Object.entries(values.socialLinks ?? {}).filter(([, value]) => value && value.trim().length > 0),
        ),
      };
      const res = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error((errorBody as { message?: string }).message || "Failed to save profile");
      }
      return res.json() as Promise<BusinessProfile>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/business/profile"] });
      toast({ title: copy.toast.saved });
    },
    onError: (error: unknown) => {
      toast({
        title: copy.toast.error,
        variant: "destructive",
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const onSubmit = (values: BusinessProfileFormValues) => {
    const validation = businessProfileSchema.safeParse(values);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.path[0];
      if (firstError === "companyName" || firstError === "industry" || firstError === "companySize") {
        toast({ title: copy.validation.company, variant: "destructive" });
      } else if (firstError === "description") {
        toast({ title: copy.validation.story, variant: "destructive" });
      } else {
        toast({ title: copy.toast.error, variant: "destructive" });
      }
      return;
    }
    mutation.mutate(values);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Business logout failed:", error);
    } finally {
      window.location.href = "/business/login";
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">{copy.loading}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold tracking-tight">
              <span className="text-primary">Peri.</span>
              <span className="text-foreground">ai</span>
            </div>
            <Link href="/business">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {copy.header.back}
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{user?.email}</span>
            <div className="flex items-center gap-2">
              <LanguageToggle className="h-9" />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{copy.cards.brand.title}</CardTitle>
                <CardDescription>{copy.cards.brand.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{copy.cards.brand.labels.company}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{copy.cards.brand.labels.industry}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{copy.cards.brand.labels.website}</FormLabel>
                        <FormControl>
                          <Input placeholder="https://www.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="companySize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.cards.brand.labels.companySize}</FormLabel>
                      <FormControl>
                        <Input placeholder="1-5 / 6-20 / ..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{copy.cards.story.title}</CardTitle>
                <CardDescription>{copy.cards.story.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.cards.story.label}</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{copy.cards.socials.title}</CardTitle>
                <CardDescription>{copy.cards.socials.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {socialsList.map((platform) => (
                  <FormField
                    key={platform}
                    control={form.control}
                    name={`socialLinks.${platform}` as const}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{copy.cards.socials.labels[platform]}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              platform === "youtube"
                                ? "https://www.youtube.com/yourbrand"
                                : `https://www.${platform}.com/yourbrand`
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </CardContent>
            </Card>

            <Separator />
            <div className="flex justify-end">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? copy.buttons.saving : copy.buttons.save}
              </Button>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
