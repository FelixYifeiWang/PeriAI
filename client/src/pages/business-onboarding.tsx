import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/providers/language-provider";
import type { BusinessProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import LanguageToggle from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

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

const translations = {
  en: {
    loading: "Loading…",
    buttons: {
      continue: "Continue",
      saving: "Saving...",
    },
    errors: {
      company: "Please share your company name, industry, and team size.",
      story: "Tell us a bit more about your brand story (30+ characters).",
    },
    steps: {
      company: {
        title: "Tell us about your brand",
        description: "These basics help influencers recognize who you are.",
        labels: {
          company: "Company",
          industry: "Industry",
          website: "Website",
        },
        placeholders: {
          company: "Acme Studios",
          industry: "Beauty / Lifestyle / Tech...",
          website: "https://www.example.com",
        },
        companySizeLabel: "Team size",
      },
      story: {
        title: "Tell your brand story",
        description: "Introduce your positioning, hero products, or past collaborations.",
        storyLabel: "Brand story",
        storyPlaceholder: "Describe what makes your brand unique...",
      },
      socials: {
        title: "Social presence (optional)",
        description: "Share the channels where people can learn more about you.",
      },
    },
    companySizeOptions: ["1-5", "6-20", "21-50", "51-100", "100+"],
    socials: ["instagram", "tiktok", "youtube"],
  },
  zh: {
    loading: "加载中…",
    buttons: {
      continue: "继续",
      saving: "保存中…",
    },
    errors: {
      company: "请填写公司名称、行业以及团队规模。",
      story: "请提供至少 30 个字符的品牌介绍。",
    },
    steps: {
      company: {
        title: "介绍你的品牌",
        description: "这些基础信息有助于创作者快速了解你。",
        labels: {
          company: "公司名称",
          industry: "所属行业",
          website: "公司网站",
        },
        placeholders: {
          company: "Acme Studios",
          industry: "美妆 / 生活方式 / 科技…",
          website: "https://www.example.com",
        },
        companySizeLabel: "团队规模",
      },
      story: {
        title: "介绍品牌故事",
        description: "分享品牌定位、主打产品或过往合作。",
        storyLabel: "品牌介绍",
        storyPlaceholder: "介绍品牌定位、产品线、合作风格等…",
      },
      socials: {
        title: "社媒资料（可选）",
        description: "分享品牌活跃的平台，方便他人了解更多信息。",
      },
    },
    companySizeOptions: ["1-5", "6-20", "21-50", "51-100", "100+"],
    socials: ["instagram", "tiktok", "youtube"],
  },
} as const;

const stepOrder = ["company", "story", "socials"] as const;
type StepKey = (typeof stepOrder)[number];
type BusinessOnboardingCopy = (typeof translations)[keyof typeof translations];

function parseSocialLinks(links: unknown) {
  if (!links || typeof links !== "object") return {};
  return links as Record<string, string>;
}

export default function BusinessOnboardingPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const copy = useMemo<BusinessOnboardingCopy>(() => translations[language], [language]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading } = useQuery<BusinessProfile | null>({
    queryKey: ["/api/business/profile"],
    queryFn: async () => {
      const res = await fetch("/api/business/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [description, setDescription] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({
    instagram: "",
    tiktok: "",
    youtube: "",
    linkedin: "",
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const links = parseSocialLinks(profile.socialLinks);
    setCompanyName(profile.companyName ?? "");
    setIndustry(profile.industry ?? "");
    setWebsite(profile.website ?? "");
    setCompanySize(profile.companySize ?? "");
    setDescription(profile.description ?? "");
    setSocialLinks({
      instagram: links.instagram ?? "",
      tiktok: links.tiktok ?? "",
      youtube: links.youtube ?? "",
      linkedin: links.linkedin ?? "",
    });
  }, [profile]);

  const mutation = useMutation({
    mutationFn: async () => {
      const filteredLinks = Object.fromEntries(
        Object.entries(socialLinks).filter(([, value]) => value && value.trim().length > 0),
      );

      const payload = {
        companyName: companyName.trim(),
        industry: industry.trim(),
        website: website.trim(),
        companySize,
        description: description.trim(),
        socialLinks: filteredLinks,
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
      toast({
        title: "Profile saved",
        description: "You’re ready to collaborate with creators.",
      });
      setLocation("/business");
    },
    onError: (err: unknown) => {
      toast({
        title: "Unable to save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const validateStep = () => {
    const currentStep = stepOrder[stepIndex];
    switch (currentStep) {
      case "company":
        if (!companyName.trim() || !industry.trim() || !companySize) {
          return copy.errors.company;
        }
        return null;
      case "story":
        if (description.trim().length < 30) {
          return copy.errors.story;
        }
        return null;
      case "socials":
      default:
        return null;
    }
  };

  const handleContinue = () => {
    setError(null);
    const validationMessage = validateStep();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    if (stepIndex < stepOrder.length - 1) {
      setStepIndex((prev) => prev + 1);
      return;
    }

    mutation.mutate();
  };

  const renderCompanySizeOptions = () => {
    const options: string[] = [...copy.companySizeOptions];
    const activeIndex = Math.max(0, options.indexOf(companySize));
    const progressPercent =
      options.length > 1 ? (activeIndex / (options.length - 1)) * 100 : 100;

    return (
      <div className="w-full space-y-2">
        <div className="relative mx-auto h-6 max-w-[220px]">
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#8ec5ff] via-[#7b7aff] to-[#4f46e5]"
            style={{ width: `${progressPercent}%` }}
          />
          {options.map((option, index) => {
            const position = options.length === 1 ? 0 : (index / (options.length - 1)) * 100;
            const isSelected = option === companySize;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setCompanySize(option)}
                style={{ left: `${position}%` }}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4b5fd] ${
                  isSelected ? "border-[#4f46e5] bg-white shadow" : "border-slate-200 bg-white"
                }`}
              >
                <span
                  className={`block h-3 w-3 rounded-full ${
                    isSelected ? "bg-[#4f46e5]" : "bg-slate-300"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <div className="mx-auto flex max-w-[220px] justify-between text-xs font-semibold text-slate-600">
          {options.map((option) => (
            <span key={option}>{option}</span>
          ))}
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    const currentStep = stepOrder[stepIndex];
    if (currentStep === "company") {
      const stepCopy = copy.steps.company;
      return (
        <div className="flex w-full flex-col items-center gap-6 text-center">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[#573ccb] md:text-3xl">{stepCopy.title}</h2>
            <p className="text-base text-slate-600">{stepCopy.description}</p>
          </div>
            <div className="w-full max-w-lg space-y-4 text-left">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#573ccb]">
                  {stepCopy.labels.company}
                </label>
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder={stepCopy.placeholders.company}
                  className="w-full rounded-3xl border border-transparent bg-white/85 px-5 py-3 text-base text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#573ccb]">
                  {stepCopy.labels.industry}
                </label>
                <input
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder={stepCopy.placeholders.industry}
                  className="w-full rounded-3xl border border-transparent bg-white/85 px-5 py-3 text-base text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#573ccb]">
                    {stepCopy.labels.website}
                  </label>
                  <input
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  placeholder={stepCopy.placeholders.website}
                  className="w-full rounded-3xl border border-transparent bg-white/85 px-5 py-3 text-base text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#573ccb]">{stepCopy.companySizeLabel}</label>
                {renderCompanySizeOptions()}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (currentStep === "story") {
      const stepCopy = copy.steps.story;
      return (
        <div className="flex w-full flex-col items-center gap-6 text-center">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[#573ccb] md:text-3xl">{stepCopy.title}</h2>
            <p className="text-base text-slate-600">{stepCopy.description}</p>
          </div>
          <div className="w-full max-w-lg space-y-5 text-left">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#573ccb]">{stepCopy.storyLabel}</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder={stepCopy.storyPlaceholder}
                className="w-full rounded-3xl border border-transparent bg-white/85 px-5 py-3 text-base text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
              />
            </div>
          </div>
        </div>
      );
    }

    const stepCopy = copy.steps.socials;
    return (
      <div className="flex w-full flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#573ccb] md:text-3xl">{stepCopy.title}</h2>
          <p className="text-base text-slate-600">{stepCopy.description}</p>
        </div>
        <div className="w-full max-w-lg space-y-5 text-left">
          <div className="space-y-3">
            {copy.socials.map((platform) => (
              <div key={platform}>
                <label className="text-xs uppercase tracking-wide text-slate-500">{platform}</label>
                <input
                  value={socialLinks[platform] ?? ""}
                  onChange={(event) =>
                    setSocialLinks((prev) => ({
                      ...prev,
                      [platform]: event.target.value,
                    }))
                  }
                  placeholder={`https://www.${platform}.com/yourbrand`}
                  className="w-full rounded-3xl border border-transparent bg-white/85 px-5 py-3 text-sm text-slate-700 shadow focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-muted-foreground">{copy.loading}</div>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      window.location.href = "/business/login";
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white px-4">
      <div className="absolute right-6 top-6 flex items-center gap-3">
        <div className="text-sm text-slate-500">{user?.email}</div>
        <LanguageToggle className="h-9" />
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
      <div className="relative flex w-full max-w-4xl flex-col items-center px-6 py-14" style={boardStyle}>
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-10">
          {renderStepContent()}
        </div>

        {error && <p className="mt-6 text-sm font-medium text-rose-500">{error}</p>}

        <button
          onClick={handleContinue}
          disabled={mutation.isPending}
          data-testid="button-business-onboarding-next"
          className="mt-6 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={continueButtonStyle}
        >
          <span className="sr-only">
            {mutation.isPending ? copy.buttons.saving : copy.buttons.continue}
          </span>
        </button>

        <div className="h-10" />
      </div>
    </div>
  );
}
