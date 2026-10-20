import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Save, Loader2, Image, MessageSquare, ImagePlus, Palette, FileText, Video, CheckCircle, Wand2, Share2, Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { optimizeMarketingImagePrompt } from "@/lib/promptOptimizer";
import DirectSocialPostDialog from "@/components/social/DirectSocialPostDialog";
import {
  getNvidiaAccessFailureSummary,
  hasNvidiaFluxAccess,
  hasNvidiaImageAccess,
  NVIDIA_IMAGE_MODEL_IDS,
  NvidiaModelAccess,
  runNvidiaAccessCheck,
  generateNvidiaChatCompletion,
  getStoredNvidiaApiKey,
} from "@/lib/nvidiaAccess";
import { generateNvidiaImage } from "@/lib/nvidiaService";
import {
  DEFAULT_LEGACY_POLLINATIONS_MODEL,
  POLLINATIONS_MODELS,
  PollinationsImageError,
  createPollinationsSeed,
  generatePollinationsImage,
  getDefaultModelForEndpoint,
  getModelsForEndpoint,
  isPollinationsModelAvailable,
  resolvePollinationsEndpoint,
  type PollinationsEndpoint,
  type PollinationsRequestDebug,
} from "@/lib/pollinationsImage";

type ContentType = "poster" | "prompt_only" | "video";
type ImageProvider = "auto" | "lovable_ai" | "pollinations" | "stability" | "leonardo" | "nvidia" | "cosmos";

interface ImageProviderOption {
  id: ImageProvider;
  label: string;
  keyName: string;
  description: string;
}

const imageProviders: ImageProviderOption[] = [
  { id: "auto", label: "Automatic (Fallback)", keyName: "", description: "Tries NVIDIA → Cosmos → Pollinations → Shree AI" },
  { id: "pollinations", label: "Pollinations.ai", keyName: "pollinations_api_key", description: "High-quality image catalog (Flux/Turbo)" },
  { id: "nvidia", label: "NVIDIA AI (Free)", keyName: "nvidia_api_key", description: "Free NIM image generation" },
  { id: "stability", label: "Stability AI", keyName: "stability_api_key", description: "SDXL / SD3 commercial images" },
  { id: "cosmos", label: "NVIDIA Cosmos", keyName: "nvidia_api_key", description: "NVIDIA Cosmos foundation model" },
  { id: "leonardo", label: "Leonardo AI", keyName: "leonardo_api_key", description: "Creative images" },
  { id: "lovable_ai", label: "Shree AI Engine", keyName: "", description: "Built-in AI (Gemini)" },
];

/** A/B comparison result entry (dev-only debug panel). */
interface PollinationsAbResult {
  model: string;
  imageUrl?: string;
  debug?: PollinationsRequestDebug;
  error?: string;
}

/** Controlled dimensions for the Pollinations request (no provider defaults). */
function getPollinationsDimensions(platform?: string): { width: number; height: number; aspectRatio: string } {
  const landscape = platform === "facebook" || platform === "linkedin" || platform === "x";
  return landscape
    ? { width: 1536, height: 1024, aspectRatio: "3:2" }
    : { width: 1024, height: 1024, aspectRatio: "1:1" };
}

/** Interprets an A/B run: prompt-not-received vs model-quality vs wrong-model. */
function describeAbComparison(results: PollinationsAbResult[]): string {
  if (results.length < 2) return "";
  if (results.some((r) => r.debug && !r.debug.promptMatchesRequestUrl)) {
    return "Prompt fidelity check FAILED for at least one request - the URL did not carry the exact prompt.";
  }
  if (results.every((r) => r.error)) {
    return "Both models failed - see the per-model error above (rate limit or missing key access).";
  }
  if (results.every((r) => r.imageUrl) && results.every((r) => r.debug?.model === results[0].debug?.model)) {
    return "Both requests used the SAME model - pick two different models to isolate model quality.";
  }
  if (results.every((r) => r.imageUrl)) {
    return "Both models received the identical prompt, dimensions and seed. Any visual difference is model quality/instruction-following, not ShreeTemplate's request.";
  }
  return "Only one model returned an image - check the failing model's status above.";
}

const contentTypes = [
  { id: "poster" as ContentType, label: "Poster", description: "Image + message template", icon: Palette },
  { id: "prompt_only" as ContentType, label: "Prompt Only", description: "Text message template", icon: FileText },
  { id: "video" as ContentType, label: "Video Template", description: "Video promo script", icon: Video },
];

const businessTypes = [
  "Retail Store",
  "Restaurant",
  "E-commerce",
  "Healthcare",
  "Education",
  "Real Estate",
  "Fashion",
  "Electronics",
  "Jewelry",
  "Grocery",
  "Other",
];

const occasions = [
  "Diwali",
  "Holi",
  "Eid",
  "Christmas",
  "New Year",
  "Independence Day",
  "Republic Day",
  "Navratri",
  "Durga Puja",
  "Ganesh Chaturthi",
  "Raksha Bandhan",
  "Valentine's Day",
  "Mother's Day",
  "Father's Day",
  "Summer Sale",
  "Winter Sale",
  "Black Friday",
  "Flash Sale",
  "Clearance",
  "Custom",
];

export default function AiTemplate() {
  const navigate = useNavigate();
  const [socialPostOpen, setSocialPostOpen] = useState(false);
  const [contentType, setContentType] = useState<ContentType>("poster");
  const [imageProvider, setImageProvider] = useState<ImageProvider>("auto");
  const [textProvider, setTextProvider] = useState<"lovable_ai" | "gemini" | "nvidia">("gemini");
  const [availableKeys, setAvailableKeys] = useState<Record<string, boolean>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    businessType: "",
    productCategory: "",
    discount: [0],
    occasion: "",
    customPrompt: "",
  });
  const [generatedContent, setGeneratedContent] = useState({
    template: "",
    imagePrompt: "",
    generatedImage: "",
  });
  const [nvidiaChecking, setNvidiaChecking] = useState(false);
  const [nvidiaResults, setNvidiaResults] = useState<NvidiaModelAccess[] | null>(null);
  const [templateName, setTemplateName] = useState("");

  // Pollinations image generation: explicit model + request/debug state.
  const [pollinationsModel, setPollinationsModel] = useState<string>("");
  const [pollinationsApiKey, setPollinationsApiKey] = useState<string>("");
  const [imageDebug, setImageDebug] = useState<PollinationsRequestDebug | null>(null);
  const [abModelB, setAbModelB] = useState<string>("");
  const [abResults, setAbResults] = useState<PollinationsAbResult[]>([]);
  const [isComparingModels, setIsComparingModels] = useState(false);

  const hasPollinationsKey = Boolean(pollinationsApiKey);
  const pollinationsEndpoint: PollinationsEndpoint = resolvePollinationsEndpoint(hasPollinationsKey);
  const pollinationsModelOptions = getModelsForEndpoint(pollinationsEndpoint);
  // Selected model is always shown in the UI - it is never silently swapped.
  const selectedPollinationsModel = pollinationsModel || getDefaultModelForEndpoint(pollinationsEndpoint);

  const fetchPollinationsKey = useCallback(async () => {
    setPollinationsApiKey("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let key = "";

      if (user) {
        try {
          const { data } = await (supabase as any)
            .from("ai_api_keys")
            .select("pollinations_api_key")
            .eq("user_id", user.id)
            .maybeSingle();
          key = (data as { pollinations_api_key?: string | null } | null)?.pollinations_api_key ?? "";
        } catch {
          // fall back to api_credentials
        }

        if (!key) {
          try {
            const { data: creds } = await supabase
              .from("api_credentials")
              .select("*")
              .eq("user_id", user.id)
              .maybeSingle();
            key = (creds as any)?.pollinations_api_key ?? "";
          } catch {
            // ignore
          }
        }
      }

      if (!key) {
        key = localStorage.getItem("pollinations_api_key") || "";
      }

      if (key && key.length > 0) {
        setPollinationsApiKey(key);
        setAvailableKeys(prev => ({ ...prev, pollinations_api_key: true }));
      }
    } catch (error) {
      console.warn("Pollinations API key lookup skipped:", error);
    }
  }, []);

  useEffect(() => {
    fetchAvailableKeys();
    fetchPollinationsKey();
  }, [fetchPollinationsKey]);

  useEffect(() => {
    const refreshPollinationsKey = () => {
      void fetchPollinationsKey();
    };
    window.addEventListener("focus", refreshPollinationsKey);
    window.addEventListener("pollinations-key-updated", refreshPollinationsKey);
    return () => {
      window.removeEventListener("focus", refreshPollinationsKey);
      window.removeEventListener("pollinations-key-updated", refreshPollinationsKey);
    };
  }, [fetchPollinationsKey]);

  // Auto-select first available external provider
  useEffect(() => {
    const externalProviders: { id: ImageProvider; key: string }[] = [
      { id: "nvidia", key: "nvidia_api_key" },
      { id: "stability", key: "stability_api_key" },
      { id: "leonardo", key: "leonardo_api_key" },
    ];
    const available = externalProviders.find(p => availableKeys[p.key]);
    if (available) {
      setImageProvider(available.id);
    }
  }, [availableKeys]);

  const fetchAvailableKeys = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("api_credentials")
      .select("stability_api_key, leonardo_api_key, gemini_api_key, nvidia_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setAvailableKeys(prev => ({
        ...prev,
        stability_api_key: !!data.stability_api_key,
        leonardo_api_key: !!data.leonardo_api_key,
        gemini_api_key: !!data.gemini_api_key,
        nvidia_api_key: !!data.nvidia_api_key,
        pollinations_api_key: prev.pollinations_api_key || !!localStorage.getItem("pollinations_api_key"),
      }));
      setTextProvider("gemini");
    }
  };

  const handleCheckNvidiaImageAccess = async (showSuccess = true) => {
    const key = (await getStoredNvidiaApiKey()) || localStorage.getItem("nvidia_api_key") || "";
    if (!key) {
      toast.error("NVIDIA API key not configured. Add it in API Setup.");
      return false;
    }

    setNvidiaChecking(true);
    try {
      const results = await runNvidiaAccessCheck(NVIDIA_IMAGE_MODEL_IDS, key);
      setNvidiaResults(results);

      const fluxGranted = hasNvidiaFluxAccess(results);
      const anyImageGranted = hasNvidiaImageAccess(results);

      if (fluxGranted || anyImageGranted) {
        if (showSuccess) {
          toast.success("NVIDIA FLUX.1-schnell access verified and ready.");
        }
        return true;
      }

      toast.warning("NVIDIA image models unavailable", {
        description: `${getNvidiaAccessFailureSummary(results)}. Generation will use Pollinations AI fallback.`,
      });
      return false;
    } catch (err: any) {
      toast.error(err?.message || "Could not check NVIDIA model access");
      return false;
    } finally {
      setNvidiaChecking(false);
    }
  };

  const handleGenerate = async () => {
    if (!formData.businessType || !formData.occasion) {
      toast.error("Please select business type and occasion");
      return;
    }

    setIsGenerating(true);
    try {
      if (textProvider === "nvidia") {
        toast.info("Generating marketing template with NVIDIA Nemotron Reasoning...");
        const systemPrompt = `You are an expert Indian marketing copywriter specializing in WhatsApp Business marketing. 
You create engaging, festive, and culturally relevant marketing messages optimized for Indian audiences.
Your messages are concise, use emojis appropriately, and include clear call-to-actions.
Always maintain a professional yet friendly tone.`;

        const hasDiscount = formData.discount[0] > 0;
        const userPrompt = `Create a WhatsApp marketing message and promotional poster image prompt for:

Business Type: ${formData.businessType}
Product Category: ${formData.productCategory || "General products"}
${hasDiscount ? `Discount: ${formData.discount[0]}% OFF` : "No discount offer - focus on brand awareness and product showcase"}
Occasion: ${formData.occasion}
${formData.customPrompt ? `Additional Instructions: ${formData.customPrompt}` : ""}

Please provide:
1. A WhatsApp message template (max 500 characters) with:
   - Festive greeting appropriate for ${formData.occasion}
   ${hasDiscount ? "- Clear discount offer" : "- Focus on product quality and brand value"}
   - Urgency element
   - Call-to-action
   - Relevant emojis

2. A professional commercial image prompt for an AI image generator (FLUX / Midjourney style):
   - Subject: Vibrant commercial product photography or 3D promotional visual for ${formData.businessType} (${formData.productCategory || "products"})
   - Atmosphere: Festive visual theme matching ${formData.occasion} with elegant decorative elements (e.g., golden accents, warm ambient lighting, festive background)
   - Style: High-end commercial advertisement, studio lighting, hyper-realistic, 8k resolution, clean composition
   - STRICT RULES FOR IMAGE PROMPT:
     * Describe VISUAL objects, materials, and lighting — NOT mobile app screens or paragraphs of chat messages.
     * DO NOT ask the AI to draw entire phone UI chat screens, chat bubbles, or paragraphs of text (this causes distorted alien gibberish).
     ${hasDiscount ? `* Include a bold, elegant badge with "${formData.discount[0]}% OFF".` : "* ABSOLUTELY NO DISCOUNT, NO 0% OFF, and NO price badges."}
     * Include ample clean negative space for professional text overlays.
     * Format as a single flowing descriptive paragraph without markdown asterisks or bullet points.

Format your response exactly as:
TEMPLATE:
[Your WhatsApp message here]

IMAGE_PROMPT:
[Your detailed image generation prompt here]`;

        const res = await generateNvidiaChatCompletion({
          model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.6,
          maxTokens: 4096,
        });

        const text = res.content || "";
        const templateMatch = text.match(/TEMPLATE:\s*([\s\S]*?)(?=IMAGE_PROMPT:|$)/i);
        const imagePromptMatch = text.match(/IMAGE_PROMPT:\s*([\s\S]*?)$/i);

        const template = templateMatch ? templateMatch[1].trim() : text;
        const rawImagePrompt = imagePromptMatch ? imagePromptMatch[1].trim() : text;
        const imagePrompt = optimizeMarketingImagePrompt(rawImagePrompt, {
          businessType: formData.businessType,
          occasion: formData.occasion,
          discount: formData.discount[0],
        });

        setGeneratedContent({
          template,
          imagePrompt,
          generatedImage: "",
        });
        toast.success("Template generated with NVIDIA Nemotron!");
        setIsGenerating(false);
        return;
      }

      const response = await supabase.functions.invoke("generate-template", {
        body: {
          type: "marketing_template",
          businessType: formData.businessType,
          productCategory: formData.productCategory,
          discount: formData.discount[0],
          occasion: formData.occasion,
          customPrompt: formData.customPrompt,
          textProvider,
        },
      });

      if (response.data?.error) {
        toast.error(response.data.error);
        return;
      }
      if (response.error) throw response.error;

      setGeneratedContent({
        template: response.data.template,
        imagePrompt: response.data.imagePrompt,
        generatedImage: "",
      });
      toast.success("Template generated successfully!");
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("Failed to generate template. Please try again.");
    }
    setIsGenerating(false);
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} copied to clipboard!`);
  };

  /** Dev-only A/B test: identical prompt, dimensions and seed across two models. */
  const handleCompareModels = async () => {
    const promptToGenerate = generatedContent.imagePrompt.trim();
    if (!promptToGenerate) {
      toast.error("Generate a template first to get an image prompt");
      return;
    }

    const modelA = selectedPollinationsModel;
    const modelB = abModelB || pollinationsModelOptions.find((m) => m.id !== modelA)?.id || "";
    if (!modelB || modelB === modelA) {
      toast.error("Pick two different Pollinations models to compare");
      return;
    }

    const { width, height } = getPollinationsDimensions();
    const seed = createPollinationsSeed(); // same seed for both models -> fair comparison
    setIsComparingModels(true);
    setAbResults([]);

    const results: PollinationsAbResult[] = [];
    for (const model of [modelA, modelB]) {
      try {
        const result = await generatePollinationsImage({
          prompt: promptToGenerate,
          model,
          width,
          height,
          endpoint: pollinationsEndpoint,
          seed,
          apiKey: pollinationsApiKey || null,
        });
        results.push({ model, imageUrl: result.imageUrl, debug: result.debug });
      } catch (error) {
        results.push({ model, error: error instanceof Error ? error.message : String(error) });
      }
      setAbResults([...results]);
    }

    setIsComparingModels(false);
    console.info(
      "[pollinations] A/B comparison",
      results.map((r) => ({
        model: r.model,
        status: r.debug?.status,
        bytes: r.debug?.bytes,
        promptMatchesRequestUrl: r.debug?.promptMatchesRequestUrl,
        error: r.error,
      }))
    );
  };

  const handleOptimizePrompt = () => {
    if (!generatedContent.imagePrompt.trim()) {
      toast.error("Enter an image prompt first");
      return;
    }
    const optimized = optimizeMarketingImagePrompt(generatedContent.imagePrompt, {
      businessType: formData.businessType,
      occasion: formData.occasion,
      discount: formData.discount[0],
    });
    setGeneratedContent(prev => ({ ...prev, imagePrompt: optimized }));
    toast.success("Prompt optimized for clean commercial image generation!");
  };

  const handleGenerateImage = async () => {
    const rawPrompt = generatedContent.imagePrompt.trim();
    if (!rawPrompt) {
      toast.error("Generate a template first to get an image prompt");
      return;
    }

    const currentPrompt = optimizeMarketingImagePrompt(rawPrompt, {
      businessType: formData.businessType,
      occasion: formData.occasion,
      discount: formData.discount[0],
    });

    setIsGeneratingImage(true);

    const providerInfo = imageProviders.find(p => p.id === imageProvider);
    const providerName = providerInfo?.label || imageProvider;

    // Pollinations.ai: send the EXACT current prompt to Pollinations with an
    // explicit model and controlled dimensions. No prompt rewriting/truncation,
    // no enhance=true, no stale React state, and no fallback to other providers.
    if (imageProvider === "pollinations") {
      const promptToGenerate = currentPrompt;
      const { width, height } = getPollinationsDimensions();

      setImageDebug(null);
      try {
        const result = await generatePollinationsImage({
          prompt: promptToGenerate,
          model: selectedPollinationsModel,
          width,
          height,
          endpoint: pollinationsEndpoint,
          seed: createPollinationsSeed(),
          apiKey: pollinationsApiKey || null,
        });

        // The displayed image is the exact bytes returned by Pollinations.
        setImageDebug(result.debug);
        setGeneratedContent(prev => ({
          ...prev,
          generatedImage: result.imageUrl,
        }));
        toast.success(
          `Image generated with ${result.debug.model} (${result.debug.width}x${result.debug.height})`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const kind = error instanceof PollinationsImageError ? error.kind : undefined;
        console.error("❌ Pollinations generation failed:", { kind, message });

        if (kind === "model_unavailable") {
          toast.error(message);
        } else if (kind === "unauthorized") {
          toast.error(`${message} Add your Pollinations API key in API Setup.`);
        } else if (kind === "rate_limited") {
          toast.error(message);
        } else {
          toast.error(`Pollinations image generation failed: ${message}`);
        }
      } finally {
        setIsGeneratingImage(false);
    }
    return;
  }

  if (imageProvider === "nvidia") {
    try {
      toast.info("Generating image with NVIDIA FLUX...");
      const result = await generateNvidiaImage({
        prompt: currentPrompt,
        model: "flux-3-image-klein",
        width: 1024,
        height: 1024,
        steps: 25,
      });

      if (result.imageUrl) {
        setGeneratedContent((prev) => ({
          ...prev,
          generatedImage: result.imageUrl,
        }));
        toast.success("Image generated successfully with NVIDIA FLUX!");
        setIsGeneratingImage(false);
        return;
      }
    } catch (nvidiaErr: any) {
      console.warn("NVIDIA FLUX direct generation encountered issue, attempting high-speed FLUX fallback:", nvidiaErr);
      toast.info("NVIDIA NIM server busy. Falling back to high-speed FLUX generation...");
      try {
        const { width, height } = getPollinationsDimensions();
        const fallbackRes = await generatePollinationsImage({
          prompt: currentPrompt,
          model: "flux",
          width,
          height,
          endpoint: pollinationsEndpoint,
          seed: createPollinationsSeed(),
          apiKey: pollinationsApiKey || null,
        });
        if (fallbackRes.imageUrl) {
          setGeneratedContent((prev) => ({
            ...prev,
            generatedImage: fallbackRes.imageUrl,
          }));
          toast.success("Image generated successfully via FLUX!");
          setIsGeneratingImage(false);
          return;
        }
      } catch {
        toast.error(`NVIDIA FLUX generation error: ${nvidiaErr?.message || "Unknown error"}`);
        setIsGeneratingImage(false);
        return;
      }
    }
  }

  try {
    const response = await supabase.functions.invoke("generate-template", {
      body: {
        type: "generate_image",
        imagePrompt: currentPrompt,
        imageProvider,
      },
    });

      if (response.data?.error) {
        toast.error(`${providerName} failed: ${response.data.error}`);
        return;
      }

      if (response.error) throw response.error;

      if (response.data.imageUrl) {
        setGeneratedContent(prev => ({
          ...prev,
          generatedImage: response.data.imageUrl,
        }));
        if (response.data.warning) toast.warning(response.data.warning);
        toast.success("Image generated successfully!");
      }

    } catch (error) {
      console.error("Image generation error:", error);
      toast.error(`${providerName}: Failed to generate image. Please check your API key in API Setup.`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    if (!generatedContent.template) {
      toast.error("Generate a template first");
      return;
    }

    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("templates").insert({
      user_id: user.id,
      name: templateName,
      content: generatedContent.template,
      image_prompt: generatedContent.imagePrompt,
      business_type: formData.businessType,
      category: formData.productCategory,
      occasion: formData.occasion,
    });

    if (error) {
      toast.error("Failed to save template");
    } else {
      toast.success("Template saved to library!");
      setTemplateName("");
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Template Generator</h1>
        <p className="text-muted-foreground">
          Generate marketing templates and promotional images using AI
        </p>
      </div>

      {/* Content Type Tabs */}
      <div className="grid grid-cols-3 gap-4">
        {contentTypes.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setContentType(id)}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
              contentType === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/50"
            }`}
          >
            <Icon className="h-6 w-6" />
            <span className="font-semibold text-sm">{label}</span>
            <span className="text-xs opacity-70">{description}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Template Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Business Type</Label>
              <Select
                value={formData.businessType}
                onValueChange={(value) =>
                  setFormData({ ...formData, businessType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  {businessTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-category">Product Category</Label>
              <Input
                id="product-category"
                value={formData.productCategory}
                onChange={(e) =>
                  setFormData({ ...formData, productCategory: e.target.value })
                }
                placeholder="e.g., Ethnic Wear, Smartphones, Gold Jewelry"
              />
            </div>

            <div className="space-y-2">
              <Label>Discount Percentage: {formData.discount[0] === 0 ? "No discount" : `${formData.discount[0]}%`}</Label>
              <Slider
                value={formData.discount}
                onValueChange={(value) =>
                  setFormData({ ...formData, discount: value })
                }
                max={90}
                min={0}
                step={5}
                className="py-4"
              />
            </div>

            <div className="space-y-2">
              <Label>Festival / Occasion</Label>
              <Select
                value={formData.occasion}
                onValueChange={(value) =>
                  setFormData({ ...formData, occasion: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select occasion" />
                </SelectTrigger>
                <SelectContent>
                  {occasions.map((occasion) => (
                    <SelectItem key={occasion} value={occasion}>
                      {occasion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Text AI Provider</Label>
              <Select value={textProvider} onValueChange={(v) => setTextProvider(v as "lovable_ai" | "gemini" | "nvidia")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">
                    Google Gemini {availableKeys.gemini_api_key && <Badge variant="outline" className="ml-1 text-xs">Active</Badge>}
                  </SelectItem>
                  <SelectItem value="nvidia">
                    NVIDIA Nemotron Reasoning {availableKeys.nvidia_api_key && <Badge variant="outline" className="ml-1 text-xs">Active</Badge>}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt"
                value={formData.customPrompt}
                onChange={(e) =>
                  setFormData({ ...formData, customPrompt: e.target.value })
                }
                placeholder="Add any specific requirements or tone preferences..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Template
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Output */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  WhatsApp Message Template
                </CardTitle>
                {generatedContent.template && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSocialPostOpen(true)}
                      className="flex items-center gap-1.5 text-xs h-8 border-primary/40 text-primary hover:bg-primary/10 shadow-sm"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Direct Social Post
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(generatedContent.template, "Template")}
                      className="h-8 w-8 p-0"
                      title="Copy template"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {generatedContent.template ? (
                <Textarea
                  value={generatedContent.template}
                  onChange={(e) =>
                    setGeneratedContent({
                      ...generatedContent,
                      template: e.target.value,
                    })
                  }
                  rows={8}
                  className="font-mono text-sm"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                  Generated template will appear here
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image Provider Selector */}
          {contentType === "poster" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImagePlus className="h-5 w-5" />
                  Image Generation Provider
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {imageProviders.map(({ id, label, keyName, description }) => {
                    const isAvailable = id === "auto" || id === "lovable_ai" || id === "pollinations" || availableKeys[keyName];
                    return (
                      <button
                        key={id}
                        disabled={!isAvailable}
                        onClick={() => setImageProvider(id)}
                        className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                          imageProvider === id
                            ? "border-primary bg-primary/10"
                            : isAvailable
                              ? "border-border hover:border-primary/50"
                              : "border-border opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-sm font-medium">{label}</span>
                          {isAvailable && id !== "lovable_ai" && id !== "pollinations" && (
                            <Badge className="text-[10px] px-1.5 py-0 ml-auto bg-success">
                              <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                              Active
                            </Badge>
                          )}
                          {id === "pollinations" && (
                            <Badge className="text-[10px] px-1.5 py-0 ml-auto bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              {hasPollinationsKey || availableKeys.pollinations_api_key ? "Active (API)" : "Free HD"}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{description}</span>
                        {!isAvailable && (
                          <span className="text-[10px] text-destructive">Key not configured</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-2.5">
                  <span>Configure Pollinations, NVIDIA, or Stability keys:</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-primary font-medium"
                    onClick={() => navigate("/api-setup")}
                  >
                    API Setup &rarr;
                  </Button>
                </div>
                {imageProvider === "pollinations" && (
                  <div className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-3">
                    <Label className="text-xs font-medium">
                      Pollinations model (sent explicitly - never auto-switched)
                    </Label>
                    <Select value={selectedPollinationsModel} onValueChange={setPollinationsModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POLLINATIONS_MODELS.map((model) => {
                          const available = isPollinationsModelAvailable(
                            model.id,
                            pollinationsEndpoint,
                            hasPollinationsKey
                          );
                          return (
                            <SelectItem key={model.id} value={model.id} disabled={!available}>
                              {model.label}
                              {model.supportsTypography ? " - poster text ready" : " - weak at poster text"}
                              {available ? "" : " (unavailable: needs a Pollinations API key)"}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {hasPollinationsKey
                        ? "Pollinations API key detected - the full model catalog (including typography-strong models) is available."
                        : `No Pollinations API key configured. Pollinations rejects key-less image requests with HTTP 403, so add POLLINATIONS_API_KEY in API Setup before generating. The legacy tier only ever served ${DEFAULT_LEGACY_POLLINATIONS_MODEL}.`}
                    </p>
                  </div>
                )}
                {imageProvider === "nvidia" && (
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">NVIDIA image model access</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleCheckNvidiaImageAccess(true)}
                        disabled={nvidiaChecking}
                      >
                        {nvidiaChecking && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {nvidiaResults ? "Re-check" : "Check Access"}
                      </Button>
                    </div>
                    {nvidiaResults && (
                      <>
                      <ul className="space-y-1.5">
                        {nvidiaResults.map((result) => (
                          <li key={result.id} className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-[11px]">{result.label}</p>
                              <p className="text-[10px] text-muted-foreground">{result.reason}</p>
                            </div>
                            <Badge variant={result.access === "granted" ? "default" : "destructive"} className={result.access === "granted" ? "bg-success" : ""}>
                              {result.access === "granted" ? "Access" : "No Access"}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                      {hasNvidiaFluxAccess(nvidiaResults) ? (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                          ✓ Primary model (flux.1-schnell) is active and ready to generate images.
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground pt-1">
                          Image generation will automatically use Pollinations AI fallback when NVIDIA models are unavailable.
                        </p>
                      )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Poster Image Prompt
                </CardTitle>
                <div className="flex gap-2">
                  {generatedContent.imagePrompt && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOptimizePrompt}
                        title="Optimize prompt for studio commercial quality (removes fake UI text & formatting)"
                      >
                        <Wand2 className="h-4 w-4 mr-1 text-primary" />
                        <span>Optimize Prompt</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(generatedContent.imagePrompt, "Image prompt")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleGenerateImage}
                        disabled={isGeneratingImage || nvidiaChecking}
                      >
                        {isGeneratingImage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        <span className="ml-1">Generate Image</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={generatedContent.imagePrompt}
                onChange={(e) =>
                  setGeneratedContent({
                    ...generatedContent,
                    imagePrompt: e.target.value,
                  })
                }
                rows={4}
                className="font-mono text-sm"
                placeholder="Type your image prompt here directly, or use 'Generate Template' to auto-generate one. e.g., 'Diwali sale poster for jewelry store, 50% off, festive gold and red theme'"
              />
              
              {/* Generation Debug (development only - never shows API keys) */}
              {import.meta.env.DEV && imageDebug && (
                <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Generation Debug</p>
                    <Badge variant="outline">dev only - no API keys</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                    <span>Provider:</span><span>{imageDebug.provider}</span>
                    <span>Endpoint:</span><span>{imageDebug.endpoint}</span>
                    <span>Model:</span><span className="break-all">{imageDebug.model}</span>
                    <span>Width:</span><span>{imageDebug.width}</span>
                    <span>Height:</span><span>{imageDebug.height}</span>
                    <span>Seed:</span><span>{imageDebug.seed}</span>
                    <span>Enhance:</span><span>{String(imageDebug.enhance)}</span>
                    <span>nologo:</span><span>{String(imageDebug.nologo)}</span>
                    <span>negative_prompt sent:</span><span>{String(imageDebug.negativePromptSent)}</span>
                    <span>API key:</span><span>{imageDebug.apiKeyConfigured ? "configured (hidden)" : "not configured"}</span>
                    <span>Auth mode:</span><span>{imageDebug.authMode}</span>
                    <span>Prompt in URL matches:</span>
                    <span>{imageDebug.promptMatchesRequestUrl ? "yes" : "NO"}</span>
                    <span>Response:</span>
                    <span>
                      {imageDebug.status ?? "-"} {imageDebug.contentType ?? ""} {imageDebug.bytes ?? 0}B{" "}
                      {imageDebug.durationMs ?? 0}ms
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Final Prompt (exact, {imageDebug.promptLength} chars)
                    </Label>
                    <Textarea readOnly value={imageDebug.prompt} className="h-32 font-mono text-xs" />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Image Request URL</Label>
                    <Textarea readOnly value={imageDebug.requestUrl} className="h-24 font-mono text-xs" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      Model A/B test - same prompt, same seed, two models
                    </Label>
                    <Select
                      value={
                        abModelB ||
                        pollinationsModelOptions.find((m) => m.id !== selectedPollinationsModel)?.id ||
                        ""
                      }
                      onValueChange={setAbModelB}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Second model" />
                      </SelectTrigger>
                      <SelectContent>
                        {pollinationsModelOptions
                          .filter((m) => m.id !== selectedPollinationsModel)
                          .map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isComparingModels || !generatedContent.imagePrompt.trim()}
                      onClick={handleCompareModels}
                    >
                      {isComparingModels ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="mr-2 h-4 w-4" />
                      )}
                      Run A/B comparison
                    </Button>

                    {abResults.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {abResults.map((result) => (
                          <div key={result.model} className="space-y-1 rounded border p-2 text-xs">
                            <p className="break-all font-mono">{result.model}</p>
                            {result.imageUrl ? (
                              <img
                                src={result.imageUrl}
                                alt={`A/B result for ${result.model}`}
                                className="w-full rounded border object-contain"
                              />
                            ) : (
                              <p className="text-destructive">{result.error}</p>
                            )}
                            {result.debug && (
                              <p className="text-muted-foreground">
                                HTTP {result.debug.status ?? "-"} | {result.debug.bytes ?? 0}B | seed{" "}
                                {result.debug.seed} | prompt-in-url{" "}
                                {result.debug.promptMatchesRequestUrl ? "ok" : "FAILED"}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground">{describeAbComparison(abResults)}</p>
                  </div>
                </div>
              )}

              {/* Generated Image Display */}
              {isGeneratingImage && (
                <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed bg-muted/50">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Generating image...</p>
                  </div>
                </div>
              )}
              
              {generatedContent.generatedImage && !isGeneratingImage && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Generated Poster</p>
                  <div className="relative rounded-lg overflow-hidden border">
                    <img 
                      src={generatedContent.generatedImage} 
                      alt="Generated promotional poster"
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedContent.generatedImage;
                        link.download = `poster-${formData.occasion || 'promo'}.png`;
                        link.click();
                      }}
                    >
                      Download Image
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium shadow-sm"
                      onClick={() => setSocialPostOpen(true)}
                    >
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      Post to Social Media
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {generatedContent.template && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-secondary/5 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Share2 className="h-5 w-5 text-primary" />
                  Direct Social Media Post
                </CardTitle>
                <CardDescription>
                  Publish this generated template and marketing image directly to Instagram, Facebook, LinkedIn, X, and YouTube.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <Button
                    onClick={() => setSocialPostOpen(true)}
                    className="w-full sm:flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white shadow-md font-medium"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Direct Social Media Post
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate("/social-media", {
                        state: {
                          content: generatedContent.template,
                          mediaUrl: generatedContent.generatedImage || null,
                        },
                      })
                    }
                    className="w-full sm:w-auto flex items-center gap-1.5"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in Studio
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {generatedContent.template && (
            <Card>
              <CardHeader>
                <CardTitle>Save to Library</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Diwali Sale 2024"
                  />
                </div>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Template
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Direct Social Media Post Dialog */}
      <DirectSocialPostDialog
        open={socialPostOpen}
        onOpenChange={setSocialPostOpen}
        initialContent={generatedContent.template}
        initialImageUrl={generatedContent.generatedImage}
        templateName={templateName || formData.occasion || "Marketing Template"}
      />
    </div>
  );
}
