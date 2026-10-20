import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, CheckCircle, XCircle, Loader2, ExternalLink, ImagePlus, Eye, EyeOff, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  fetchPollinationsApiKeyInfo,
  fetchPollinationsImageModelIds,
  resolvePollinationsImageAccess,
  type PollinationsApiKeyCheck,
  type PollinationsImageAccess,
} from "@/lib/pollinationsKey";
import {
  runNvidiaAccessCheck,
  NVIDIA_ALL_REQUIRED_MODEL_IDS,
  type NvidiaModelAccess,
} from "@/lib/nvidiaAccess";

interface ImageApiKey {
  key: string;
  label: string;
  placeholder: string;
  description: string;
}

const IMAGE_API_KEYS: ImageApiKey[] = [
  { key: "pollinations_api_key", label: "POLLINATIONS_API_KEY", placeholder: "Your Pollinations API key", description: "Pollinations.ai - High-quality image catalog & typography-strong models (enter.pollinations.ai)" },
  { key: "nvidia_api_key", label: "NVIDIA_API_KEY", placeholder: "nvapi-...", description: "NVIDIA NIM - Free image & video generation (build.nvidia.com)" },
  { key: "stability_api_key", label: "STABILITY_API_KEY", placeholder: "sk-...", description: "Stability AI - Image generation" },
  { key: "leonardo_api_key", label: "LEONARDO_API_KEY", placeholder: "leo-...", description: "Leonardo AI - Creative images" },
  { key: "gemini_api_key", label: "GEMINI_API_KEY", placeholder: "AIza...", description: "Google Gemini - Text & prompt generation" },
  { key: "pexels_api_key", label: "PEXELS_API_KEY", placeholder: "Your Pexels API key", description: "Pexels - Free stock videos & photos for promo videos (pexels.com/api)" },
];

export default function ApiSetup() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");
  const [imageApiSaving, setImageApiSaving] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    whatsapp_phone_id: "",
    whatsapp_access_token: "",
    whatsapp_api_version: "v18.0",
    whatsapp_business_account_id: "",
    meta_app_id: "",
  });
  const [imageApiKeys, setImageApiKeys] = useState<Record<string, string>>({
    pollinations_api_key: "",
    stability_api_key: "",
    leonardo_api_key: "",
    gemini_api_key: "",
    nvidia_api_key: "",
    pexels_api_key: "",
  });

  const [pollinationsChecking, setPollinationsChecking] = useState(false);
  const [pollinationsCheckResult, setPollinationsCheckResult] = useState<PollinationsApiKeyCheck | null>(null);
  const [pollinationsImageAccess, setPollinationsImageAccess] = useState<PollinationsImageAccess | null>(null);

  const [nvidiaChecking, setNvidiaChecking] = useState(false);
  const [nvidiaResults, setNvidiaResults] = useState<NvidiaModelAccess[] | null>(null);
  const [nvidiaError, setNvidiaError] = useState<string | null>(null);

  const handleCheckNvidiaAccess = async () => {
    let key = imageApiKeys.nvidia_api_key?.trim();
    if (!key) {
      key = localStorage.getItem("nvidia_api_key")?.trim() || "";
    }
    if (!key) {
      toast.error("Add and save your NVIDIA API key first.");
      return;
    }
    localStorage.setItem("nvidia_api_key", key);
    setNvidiaChecking(true);
    setNvidiaError(null);
    try {
      const results = await runNvidiaAccessCheck(
        NVIDIA_ALL_REQUIRED_MODEL_IDS,
        key
      );
      setNvidiaResults(results);
      const allGranted = results.every((r) => r.access === "granted");
      const fluxGranted = results.some(
        (r) => (r.id === "flux.1-schnell" || r.label.includes("flux")) && r.access === "granted"
      );
      const textGranted = results.some(
        (r) => (r.type === "Text/Reasoning" || r.id.includes("nemotron") || r.id.includes("stepfun")) && r.access === "granted"
      );

      if (allGranted) {
        toast.success("All NVIDIA models are accessible and ready.");
      } else if (fluxGranted && textGranted) {
        toast.success("NVIDIA FLUX & Nemotron Reasoning models are accessible and ready!");
      } else if (textGranted) {
        toast.success("NVIDIA Nemotron Reasoning model is accessible and ready!");
      } else if (fluxGranted) {
        toast.success("FLUX.1-schnell is accessible! You are ready to generate images.");
      } else {
        const invalid = results.some((r) => r.access === "invalid_key");
        if (invalid) {
          toast.error("NVIDIA API key invalid or authorization failed.");
        } else {
          toast.warning("Some NVIDIA models are not accessible on your account.");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Check failed";
      setNvidiaError(msg);
      toast.error(msg);
    } finally {
      setNvidiaChecking(false);
    }
  };

  const handleTestPollinationsKey = async () => {
    const key = imageApiKeys.pollinations_api_key?.trim();
    if (!key) {
      toast.error("Enter a Pollinations API key first.");
      return;
    }
    setPollinationsChecking(true);
    setPollinationsCheckResult(null);
    setPollinationsImageAccess(null);
    try {
      const [check, modelCatalog] = await Promise.all([
        fetchPollinationsApiKeyInfo(key),
        fetchPollinationsImageModelIds(),
      ]);
      setPollinationsCheckResult(check);
      if (check.status === "valid" && check.info) {
        const access = resolvePollinationsImageAccess(check.info, modelCatalog);
        setPollinationsImageAccess(access);
        toast.success("Pollinations API key verified!");
      } else if (check.status === "unreachable") {
        toast.warning(check.detail || "Could not reach Pollinations API.");
      } else {
        toast.error(check.detail || "Pollinations rejected this key.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Key validation failed";
      toast.error(msg);
    } finally {
      setPollinationsChecking(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("api_credentials")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (data) {
      setFormData({
        whatsapp_phone_id: data.whatsapp_phone_id || "",
        whatsapp_access_token: data.whatsapp_access_token || "",
        whatsapp_api_version: data.whatsapp_api_version || "v18.0",
        whatsapp_business_account_id: (data as any).whatsapp_business_account_id || "",
        meta_app_id: (data as any).meta_app_id || "",
      });
      setImageApiKeys({
        pollinations_api_key: (data as any).pollinations_api_key || "",
        stability_api_key: data.stability_api_key || "",
        leonardo_api_key: data.leonardo_api_key || "",
        gemini_api_key: (data as any).gemini_api_key || "",
        nvidia_api_key: (data as any).nvidia_api_key || "",
        pexels_api_key: (data as any).pexels_api_key || "",
      });
      if (data.whatsapp_phone_id && data.whatsapp_access_token) {
        setConnectionStatus("connected");
      }
    }

    try {
      const { data: aiKeyData } = await (supabase as any)
        .from("ai_api_keys")
        .select("pollinations_api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if ((aiKeyData as any)?.pollinations_api_key) {
        setImageApiKeys(prev => ({
          ...prev,
          pollinations_api_key: (aiKeyData as any).pollinations_api_key,
        }));
      }
    } catch {
      // ignore
    }

    // Check localStorage fallback for pollinations key
    const localPollKey = localStorage.getItem("pollinations_api_key");
    if (localPollKey) {
      setImageApiKeys(prev => ({
        ...prev,
        pollinations_api_key: prev.pollinations_api_key || localPollKey,
      }));
    }

    // Check localStorage fallback for nvidia key
    const localNvdKey = localStorage.getItem("nvidia_api_key");
    if (localNvdKey) {
      setImageApiKeys(prev => ({
        ...prev,
        nvidia_api_key: prev.nvidia_api_key || localNvdKey,
      }));
    }

    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in first");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase
      .from("api_credentials")
      .upsert({
        user_id: user.id,
        whatsapp_phone_id: formData.whatsapp_phone_id?.trim() || null,
        whatsapp_access_token: formData.whatsapp_access_token?.trim() || null,
        whatsapp_api_version: formData.whatsapp_api_version || "v18.0",
        whatsapp_business_account_id: formData.whatsapp_business_account_id?.trim() || null,
        meta_app_id: formData.meta_app_id?.trim() || null,
      } as any, { onConflict: 'user_id' });

    if (error) {
      console.error("Save credentials error:", error);
      toast.error(error.message || "Failed to save credentials");
    } else {
      toast.success("Credentials saved successfully!");
      setConnectionStatus(formData.whatsapp_phone_id && formData.whatsapp_access_token ? "connected" : "disconnected");
    }
    setIsSaving(false);
  };

  const handleTestConnection = async () => {
    if (!formData.whatsapp_phone_id || !formData.whatsapp_access_token) {
      toast.error("Please enter your credentials first");
      return;
    }

    setIsTesting(true);
    
    try {
      // Test WhatsApp API by fetching phone number info
      const apiVersion = formData.whatsapp_api_version || "v18.0";
      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${formData.whatsapp_phone_id}`,
        {
          headers: {
            Authorization: `Bearer ${formData.whatsapp_access_token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.id) {
        setConnectionStatus("connected");
        toast.success(`Connected! Phone: ${data.display_phone_number || data.id}`);
      } else {
        setConnectionStatus("disconnected");
        const errorMsg = data.error?.message || "Connection failed";
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("Test error:", error);
      setConnectionStatus("disconnected");
      toast.error("Connection failed. Please check your credentials.");
    }
    
    setIsTesting(false);
  };

  const handleSaveImageKeys = async () => {
    setImageApiSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in first");
      setImageApiSaving(false);
      return;
    }

    const pollKey = imageApiKeys.pollinations_api_key?.trim() || "";
    if (pollKey) {
      localStorage.setItem("pollinations_api_key", pollKey);
    } else {
      localStorage.removeItem("pollinations_api_key");
    }

    const nvdKey = imageApiKeys.nvidia_api_key?.trim() || "";
    if (nvdKey) {
      localStorage.setItem("nvidia_api_key", nvdKey);
    } else {
      localStorage.removeItem("nvidia_api_key");
    }

    const payload: Record<string, any> = {
      user_id: user.id,
      stability_api_key: imageApiKeys.stability_api_key?.trim() || null,
      leonardo_api_key: imageApiKeys.leonardo_api_key?.trim() || null,
      gemini_api_key: imageApiKeys.gemini_api_key?.trim() || null,
      nvidia_api_key: imageApiKeys.nvidia_api_key?.trim() || null,
      pexels_api_key: imageApiKeys.pexels_api_key?.trim() || null,
    };

    let { error } = await supabase
      .from("api_credentials")
      .upsert(payload as any, { onConflict: "user_id" });

    // Fallback if specific optional columns like nvidia_api_key or pexels_api_key fail
    if (error && error.message) {
      console.warn("Primary image keys upsert issue:", error.message);
      const safePayload = { ...payload };
      if (error.message.includes("nvidia_api_key")) delete safePayload.nvidia_api_key;
      if (error.message.includes("pexels_api_key")) delete safePayload.pexels_api_key;
      if (error.message.includes("gemini_api_key")) delete safePayload.gemini_api_key;
      const retry = await supabase
        .from("api_credentials")
        .upsert(safePayload as any, { onConflict: "user_id" });
      error = retry.error;
    }

    // Also persist to ai_api_keys if table exists
    try {
      await (supabase as any)
        .from("ai_api_keys")
        .upsert({
          user_id: user.id,
          pollinations_api_key: pollKey || null,
        } as any, { onConflict: "user_id" });
    } catch {
      // ignore
    }

    // Notify other components (like AiTemplate)
    window.dispatchEvent(new CustomEvent("pollinations-key-updated"));

    if (error) {
      console.error("Save image keys error:", error);
      toast.error(error.message || "Failed to save image API keys");
    } else {
      toast.success("Image API keys saved successfully!");
    }
    setImageApiSaving(false);
  };

  const toggleKeyVisibility = (key: string) => {
    setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">API Setup</h1>
        <p className="text-muted-foreground">Configure your WhatsApp Business API credentials</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              WhatsApp Business API
            </CardTitle>
            <CardDescription>
              Enter your WhatsApp Business API credentials to send messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-id">Phone Number ID</Label>
              <Input
                id="phone-id"
                value={formData.whatsapp_phone_id}
                onChange={(e) =>
                  setFormData({ ...formData, whatsapp_phone_id: e.target.value })
                }
                placeholder="Enter your Phone Number ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="access-token">Access Token</Label>
              <Input
                id="access-token"
                type="password"
                value={formData.whatsapp_access_token}
                onChange={(e) =>
                  setFormData({ ...formData, whatsapp_access_token: e.target.value })
                }
                placeholder="Enter your Access Token"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-version">API Version</Label>
              <Select
                value={formData.whatsapp_api_version}
                onValueChange={(value) =>
                  setFormData({ ...formData, whatsapp_api_version: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v18.0">v18.0</SelectItem>
                  <SelectItem value="v17.0">v17.0</SelectItem>
                  <SelectItem value="v16.0">v16.0</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="waba-id">WhatsApp Business Account ID (WABA ID)</Label>
              <Input
                id="waba-id"
                value={formData.whatsapp_business_account_id}
                onChange={(e) =>
                  setFormData({ ...formData, whatsapp_business_account_id: e.target.value })
                }
                placeholder="e.g. 1234567890123456"
              />
              <p className="text-xs text-muted-foreground">
                Required to create WhatsApp message templates. Find it in Meta Business Manager → WhatsApp Accounts.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta-app-id">Meta App ID</Label>
              <Input
                id="meta-app-id"
                value={formData.meta_app_id}
                onChange={(e) =>
                  setFormData({ ...formData, meta_app_id: e.target.value })
                }
                placeholder="e.g. 9876543210987654"
              />
              <p className="text-xs text-muted-foreground">
                Required to upload sample media (IMAGE/VIDEO/DOCUMENT headers) when submitting templates.
              </p>
            </div>

            <div className="flex gap-2">

              <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Credentials"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {connectionStatus === "connected" ? (
                <Badge className="bg-success">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              ) : connectionStatus === "disconnected" ? (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" />
                  Disconnected
                </Badge>
              ) : (
                <Badge variant="secondary">Unknown</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Follow these steps to obtain your WhatsApp Business API credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  1
                </div>
                <div>
                  <p className="font-medium">Create a Meta Developer Account</p>
                  <p className="text-sm text-muted-foreground">
                    Go to Meta for Developers and create an account
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  2
                </div>
                <div>
                  <p className="font-medium">Create a WhatsApp Business App</p>
                  <p className="text-sm text-muted-foreground">
                    Set up a new app with WhatsApp Business API
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  3
                </div>
                <div>
                  <p className="font-medium">Get Your Credentials</p>
                  <p className="text-sm text-muted-foreground">
                    Copy your Phone Number ID and Access Token
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  4
                </div>
                <div>
                  <p className="font-medium">Configure Webhook</p>
                  <p className="text-sm text-muted-foreground">
                    Set up webhook for receiving messages
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full" asChild>
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Documentation
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Image Poster Generation API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5" />
            Image Poster Generation API Keys
          </CardTitle>
          <CardDescription>
            Configure API keys for AI-powered image and poster generation services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {IMAGE_API_KEYS.map(({ key, label, placeholder, description }) => {
            const hasValue = !!imageApiKeys[key];
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={key} className="font-mono text-xs">{label}</Label>
                  {hasValue && (
                    <Badge className="bg-success text-xs">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{description}</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={key}
                      type={visibleKeys[key] ? "text" : "password"}
                      value={imageApiKeys[key]}
                      onChange={(e) =>
                        setImageApiKeys(prev => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={placeholder}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleKeyVisibility(key)}
                    type="button"
                  >
                    {visibleKeys[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}

          <Button onClick={handleSaveImageKeys} disabled={imageApiSaving} className="w-full">
            {imageApiSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Image API Keys"
            )}
          </Button>

          {/* Pollinations API Key Inspection */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-purple-600" />
                  Pollinations API Key Check
                </p>
                <p className="text-xs text-muted-foreground">
                  Validates your key via the documented account endpoint, checks remaining pollen budget, and verifies image model access without making generation requests.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestPollinationsKey}
                disabled={pollinationsChecking}
              >
                {pollinationsChecking ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>
                ) : (
                  "Test Key"
                )}
              </Button>
            </div>

            {pollinationsCheckResult && (
              <div className="space-y-2 text-sm pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {pollinationsCheckResult.status === "valid" ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : pollinationsCheckResult.status === "unreachable" ? (
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium">
                      Status: {pollinationsCheckResult.status === "valid" ? "Valid Key" : pollinationsCheckResult.status === "unreachable" ? "Unreachable" : "Invalid Key"}
                    </span>
                  </div>
                  <Badge
                    variant={pollinationsCheckResult.status === "valid" ? "default" : "destructive"}
                    className={pollinationsCheckResult.status === "valid" ? "bg-success" : ""}
                  >
                    {pollinationsCheckResult.status === "valid" ? "Verified" : pollinationsCheckResult.status}
                  </Badge>
                </div>

                {pollinationsCheckResult.detail && (
                  <p className="text-xs text-muted-foreground">
                    {pollinationsCheckResult.detail}
                  </p>
                )}

                {pollinationsCheckResult.info && (
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-muted/40 p-2.5 rounded">
                    <div>
                      <span className="text-muted-foreground">Key Type: </span>
                      <span>{pollinationsCheckResult.info.type || "standard"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pollen Budget: </span>
                      <span>{pollinationsCheckResult.info.pollenBudget != null ? pollinationsCheckResult.info.pollenBudget : "unlimited"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expires: </span>
                      <span>{pollinationsCheckResult.info.expiresAt ? new Date(pollinationsCheckResult.info.expiresAt).toLocaleDateString() : "Never"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Image Models: </span>
                      <span className={pollinationsImageAccess === "none" ? "text-destructive" : "text-success font-semibold"}>
                        {pollinationsImageAccess === "all" ? "All (Full Catalog)" : pollinationsImageAccess === "partial" ? "Partial Models" : pollinationsImageAccess === "none" ? "No Image Models" : "Catalog Unknown"}
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <Button variant="link" size="sm" asChild className="px-0 h-auto text-xs">
                    <a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3 w-3" />
                      Manage keys or top up pollen at enter.pollinations.ai
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  NVIDIA Model Access Check
                </p>
                <p className="text-xs text-muted-foreground">
                  Verifies your NVIDIA account has access to flux.1-schnell, nemotron-3-nano-omni reasoning, and vision/image models.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckNvidiaAccess}
                disabled={nvidiaChecking}
              >
                {nvidiaChecking ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>
                ) : nvidiaResults ? (
                  "Re-check Access"
                ) : (
                  "Check Access"
                )}
              </Button>
            </div>

            {nvidiaError && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{nvidiaError}</span>
              </div>
            )}

            {nvidiaResults && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                  <span>Model & Endpoint</span>
                  <span>
                    Last checked:{" "}
                    {nvidiaResults[0]?.lastChecked
                      ? new Date(nvidiaResults[0].lastChecked).toLocaleTimeString()
                      : "Just now"}
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {nvidiaResults.map((r) => {
                    const statusVariant =
                      r.status === "Available"
                        ? "default"
                        : r.status === "Access Denied"
                          ? "destructive"
                          : "secondary";
                    const badgeClass =
                      r.status === "Available"
                        ? "bg-success text-white hover:bg-success/90"
                        : r.status === "Rate Limited"
                          ? "bg-orange-500 text-white"
                          : r.status === "Invalid Request"
                            ? "bg-amber-500 text-white"
                            : "";

                    return (
                      <li
                        key={r.id}
                        className="rounded-md border p-3 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-medium text-xs sm:text-sm">
                              {r.label}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                              {r.type}
                            </Badge>
                            {r.httpStatus > 0 && (
                              <span className="text-[11px] font-mono text-muted-foreground">
                                HTTP {r.httpStatus}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {r.reason}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                          <Badge variant={statusVariant} className={badgeClass}>
                            {r.status}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {nvidiaResults.some((r) => r.status !== "Available") && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
                    <p className="font-medium text-foreground">Why are some models not accessible on your account?</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>
                        <strong className="text-foreground font-mono">flux-3-image-klein:</strong> High-speed FLUX model — generates 1024x1024 promotional images in ~2-3 seconds.
                      </li>
                      <li>
                        <strong className="text-foreground font-mono">nemotron-3-nano-omni:</strong> Active and verified! Provides high-intelligence reasoning for promotional marketing templates, text overlays, and image prompts.
                      </li>
                      <li>
                        <strong className="text-foreground font-mono">flux.1-schnell:</strong> FLUX schnell distilled model for rapid draft creation.
                      </li>
                      <li>
                        <strong className="text-foreground font-mono">sdxl-turbo & stable-diffusion-3:</strong> Optional models. NVIDIA requires accepting third-party license terms on each model page before your API key is enabled for them.
                      </li>
                      <li>
                        <strong className="text-foreground font-mono">cosmos-video:</strong> NVIDIA distributes Cosmos as a self-hosted Docker container (NIM) for local/cloud Linux GPU servers rather than a public cloud API. This app automatically generates smooth animated motion effects for promo videos.
                      </li>
                    </ul>
                    <Button variant="link" size="sm" asChild className="px-0 h-auto text-xs pt-1">
                      <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Manage or accept model licenses on build.nvidia.com
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
