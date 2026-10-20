import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { LiveFeed } from "@/components/social/LiveFeed";
import { createPromoVideo } from "@/lib/createPromoVideo";
import { createPromoVideoWithAudio } from "@/lib/createPromoVideoWithAudio";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Share2,
  Image,
  FileText,
  Send,
  Loader2,
  Instagram,
  Facebook,
  Youtube,
  Linkedin,
  Twitter,
  Upload,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Settings,
  Save,
  EyeOff,
  Eye as EyeIcon,
  MessageCircle,
  Video,
  Film,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Download,
  Volume2,
  AlertCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  getNvidiaAccessFailureSummary,
  hasNvidiaFluxAccess,
  hasNvidiaImageAccess,
  NVIDIA_IMAGE_MODEL_IDS,
  NVIDIA_VIDEO_MODEL_IDS,
  NvidiaModelAccess,
  runNvidiaAccessCheck,
  getStoredNvidiaApiKey,
} from "@/lib/nvidiaAccess";
import { generateNvidiaImage } from "@/lib/nvidiaService";
import {
  POLLINATIONS_MODELS,
  generatePollinationsImage,
  getDefaultModelForEndpoint,
  isPollinationsModelAvailable,
  resolvePollinationsEndpoint,
  type PollinationsEndpoint,
} from "@/lib/pollinationsImage";
import CreateMetaTemplateDialog from "@/components/social/CreateMetaTemplateDialog";

interface Template {
  id: string;
  name: string;
  content: string;
  image_prompt?: string | null;
  business_type?: string | null;
  occasion?: string | null;
}

interface SocialPost {
  id: string;
  platform: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  status: string;
  created_at: string | null;
  posted_at: string | null;
  error_message: string | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  views_count: number | null;
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "bg-gradient-to-r from-purple-500 to-pink-500" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "bg-blue-600" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "bg-red-600" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "bg-blue-700" },
  { id: "x", label: "X (Twitter)", icon: Twitter, color: "bg-foreground" },
];

interface PlatformCredentials {
  facebook_page_id: string;
  facebook_page_access_token: string;
  instagram_business_account_id: string;
  instagram_user_id: string;
  youtube_channel_name: string;
  youtube_channel_id: string;
  youtube_access_token: string;
  youtube_refresh_token: string;
  telegram_bot_token: string;
  telegram_channel_id: string;
  x_api_key: string;
  x_api_secret: string;
  x_access_token: string;
  x_access_token_secret: string;
  x_bearer_token: string;
}

const PLATFORM_CONFIGS = [
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    description: "Post to your Facebook Page",
    fields: [
      { key: "facebook_page_id", label: "Facebook Page ID", placeholder: "Your Facebook Page ID (not personal profile ID)" },
      { key: "facebook_page_access_token", label: "Page Access Token", placeholder: "Page Access Token (from /me/accounts)", secret: true },
    ],
    note: "Must be a Facebook PAGE (not a personal profile). Meta prohibits automated posting to personal profiles ('publish_actions' was deprecated). Enter your Facebook Page ID and Page Access Token from GET /me/accounts.",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    description: "Post to your Instagram Business account",
    fields: [
      { key: "instagram_business_account_id", label: "Instagram Node ID", placeholder: "Instagram Node ID" },
      { key: "instagram_access_token", label: "Access Token", placeholder: "Instagram Access Token", secret: true },
      { key: "instagram_user_id", label: "User ID (Optional)", placeholder: "Instagram User ID" },
    ],
    note: "Instagram requires a valid Access Token with instagram_content_publish permission",
  },
  {
    id: "x",
    label: "X (Twitter)",
    icon: Twitter,
    description: "Post tweets to X",
    fields: [
      { key: "x_api_key", label: "API Key", placeholder: "Consumer API Key", secret: true },
      { key: "x_api_secret", label: "API Secret", placeholder: "Consumer API Secret", secret: true },
      { key: "x_access_token", label: "Access Token", placeholder: "OAuth Access Token", secret: true },
      { key: "x_access_token_secret", label: "Access Token Secret", placeholder: "OAuth Access Token Secret", secret: true },
      { key: "x_bearer_token", label: "Bearer Token", placeholder: "Bearer Token for app-only auth", secret: true },
    ],
  },
  {
    id: "youtube",
    label: "Manage YouTube",
    icon: Youtube,
    description: "Manage your YouTube channel connection",
    fields: [
      { key: "youtube_channel_name", label: "Channel Name", placeholder: "Your YouTube Channel Name" },
      { key: "youtube_channel_id", label: "Channel ID", placeholder: "Your YouTube Channel ID" },
      { key: "youtube_access_token", label: "OAuth Access Token (youtube.upload scope)", placeholder: "OAuth Access Token with youtube.upload scope", secret: true },
    ],
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: MessageCircle,
    description: "Post to your Telegram channel",
    fields: [
      { key: "telegram_bot_token", label: "Bot Token", placeholder: "Bot token from @BotFather", secret: true },
      { key: "telegram_channel_id", label: "Channel ID", placeholder: "@channelname or -100xxxxxxxxxx" },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    description: "Post to LinkedIn (requires OAuth setup)",
    fields: [],
    note: "LinkedIn auto-posting requires OAuth 2.0 setup. Configuration coming soon.",
  },
];

export default function SocialMedia() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [postContent, setPostContent] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [credentials, setCredentials] = useState<Partial<PlatformCredentials>>({});
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [refreshingPlatform, setRefreshingPlatform] = useState<string | null>(null);
  const [youtubeErrors, setYoutubeErrors] = useState<Record<string, string>>({});
  const [youtubeFieldTest, setYoutubeFieldTest] = useState<{ status: "idle" | "testing" | "success" | "error"; message: string }>({ status: "idle", message: "" });
  const [youtubeUpload, setYoutubeUpload] = useState<{ status: "idle" | "uploading" | "success" | "error"; message: string; videoId?: string }>({ status: "idle", message: "" });

  const [metaTemplateOpen, setMetaTemplateOpen] = useState(false);

  const handleTestYouTubeFields = async () => {
    const channelId = ((credentials as any)?.youtube_channel_id || "").trim();
    const accessToken = ((credentials as any)?.youtube_access_token || "").trim();
    const errors: Record<string, string> = {};
    if (!channelId) errors.youtube_channel_id = "Channel ID is required";
    if (!accessToken) errors.youtube_access_token = "OAuth Access Token is required";
    else if (!/^ya29\./i.test(accessToken)) errors.youtube_access_token = "Invalid OAuth Access Token format (should start with ya29.)";
    if (Object.keys(errors).length > 0) {
      setYoutubeErrors((prev) => ({ ...prev, ...errors }));
      setYoutubeFieldTest({ status: "error", message: "Please fix the field errors above before testing." });
      return;
    }
    setYoutubeFieldTest({ status: "testing", message: "" });
    try {
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const detail = data?.error?.message || data?.error_description || `HTTP ${res.status}`;
        const hint =
          res.status === 401
            ? " — token is invalid or expired. Try Reconnect YouTube to get a fresh token."
            : res.status === 403
              ? " — check that the token has the youtube.upload / youtube.readonly scope."
              : "";
        setYoutubeFieldTest({ status: "error", message: `${detail}${hint}` });
        return;
      }
      const channel = data.items?.[0];
      if (!channel) {
        setYoutubeFieldTest({ status: "error", message: "Token is valid but no channel was found for this Google account." });
        return;
      }
      if (channel.id !== channelId) {
        setYoutubeFieldTest({
          status: "error",
          message: `Channel ID mismatch — the token belongs to "${channel.snippet?.title}" (${channel.id}), not ${channelId}.`,
        });
        return;
      }
      setYoutubeFieldTest({
        status: "success",
        message: `Verified ✓ Connected to "${channel.snippet?.title}" (${channel.id})`,
      });
    } catch (err: any) {
      setYoutubeFieldTest({ status: "error", message: err?.message || "Network error while testing." });
    }
  };

  const [isFetchingFacebookPages, setIsFetchingFacebookPages] = useState(false);
  const [discoveredPages, setDiscoveredPages] = useState<Array<{ id: string; name: string; category: string; access_token: string }>>([]);

  const handleAutoFetchFacebookPages = async () => {
    const token = (credentials.facebook_page_access_token || "").trim();
    if (!token) {
      toast.error("Please paste your Meta Access Token into the Page Access Token field first.");
      return;
    }
    setIsFetchingFacebookPages(true);
    try {
      // Step 1: Query /me with 'category' to determine if token is for a Page or User
      const meRes = await fetch(
        `https://graph.facebook.com/v18.0/me?fields=id,name,category&access_token=${encodeURIComponent(token)}`
      );
      const meData = await meRes.json();
      if (!meRes.ok) {
        throw new Error(meData.error?.message || `Facebook API error HTTP ${meRes.status}`);
      }

      // If /me has 'category', the token provided IS already a Page Access Token!
      if (meData.category) {
        setCredentials((prev) => ({
          ...prev,
          facebook_page_id: String(meData.id || "").trim(),
          facebook_page_access_token: token.trim(),
        }));
        setDiscoveredPages([
          {
            id: String(meData.id || "").trim(),
            name: meData.name,
            category: meData.category,
            access_token: token.trim(),
          },
        ]);
        toast.success(
          `Success! Your token is already a Page Token for "${meData.name}". Page ID (${meData.id}) has been auto-filled! Click "Save" below.`
        );
        return;
      }

      // Step 2: meData has no category -> this is a personal User Profile.
      // Meta prohibits posting to personal user profiles ('publish_actions' was deprecated).
      // Query /me/accounts to find the Facebook Pages this user manages.
      const accRes = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,category,access_token&access_token=${encodeURIComponent(token)}`
      );
      const accData = await accRes.json();

      if (!accRes.ok) {
        const errMsg = accData.error?.message || `HTTP ${accRes.status}`;
        throw new Error(
          `Connected as personal account "${meData.name}". Could not retrieve managed Pages: ${errMsg}. Note: Meta prohibits posting to personal profiles. Ensure your token in Meta Graph API Explorer has 'pages_show_list', 'pages_read_engagement', and 'pages_manage_posts' permissions.`
        );
      }

      const pages = accData.data || [];
      if (pages.length === 0) {
        toast.warning(
          `Connected as personal profile "${meData.name}", but no Facebook Pages were found. Automated posting requires a Facebook Page (personal profile posting is prohibited by Meta).`
        );
        setDiscoveredPages([]);
      } else {
        setDiscoveredPages(
          pages.map((p: any) => ({
            id: String(p.id || "").trim(),
            name: p.name,
            category: p.category || "Facebook Page",
            access_token: String(p.access_token || "").trim(),
          }))
        );
        toast.success(`Found ${pages.length} Facebook Page${pages.length > 1 ? "s" : ""}! Choose yours below.`);
      }
    } catch (e: any) {
      console.error("Fetch pages error:", e);
      toast.error(e?.message || "Failed to fetch Facebook Pages");
    } finally {
      setIsFetchingFacebookPages(false);
    }
  };

  const handleSelectFacebookPage = (pg: { id: string; name: string; access_token: string }) => {
    setCredentials((prev) => ({
      ...prev,
      facebook_page_id: String(pg.id || "").trim(),
      facebook_page_access_token: String(pg.access_token || prev.facebook_page_access_token || "").trim(),
    }));
    toast.success(`Selected "${pg.name}"! Click "Save" below to store your credentials.`);
  };

  const [quotaCooldowns, setQuotaCooldowns] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("platform_quota_cooldowns");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [now, setNow] = useState(Date.now());
  const [retryQueue, setRetryQueue] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("platform_retry_queue");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isGeneratingVideoAudio, setIsGeneratingVideoAudio] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [isDownloadingVoice, setIsDownloadingVoice] = useState(false);
  const [latestVoiceAudio, setLatestVoiceAudio] = useState<string | null>(null);
  const [latestVoiceScript, setLatestVoiceScript] = useState<string | null>(null);
  const [userElevenLabsKey, setUserElevenLabsKey] = useState<string>("");
  const [quotaExceededInfo, setQuotaExceededInfo] = useState<{ remaining: number; required: number } | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isCheckingPerms, setIsCheckingPerms] = useState(false);
  const [elevenPerms, setElevenPerms] = useState<{ tts: boolean; music: boolean; ttsError?: string; musicError?: string } | null>(null);
  const [activeTab, setActiveTab] = useState("create");
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [isBulkActioning, setIsBulkActioning] = useState(false);

  const downloadAudioBase64 = (base64Audio: string, filename = "voiceover.mp3") => {
    try {
      const cleanBase64 = (base64Audio.includes(",")
        ? base64Audio.split(",")[1]
        : base64Audio).replace(/\s+/g, "");
      const byteCharacters = atob(cleanBase64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch (e) {
      console.warn("Blob download error, falling back to data URI:", e);
      const sanitized = base64Audio.replace(/\s+/g, "");
      const dataUri = sanitized.startsWith("data:")
        ? sanitized
        : `data:audio/mpeg;base64,${sanitized}`;
      const link = document.createElement("a");
      link.href = dataUri;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleCheckElevenPermissions = async () => {
    setIsCheckingPerms(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-video-audio", {
        body: { action: "check" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setElevenPerms({
        tts: !!data?.tts,
        music: !!data?.music,
        ttsError: data?.ttsError,
        musicError: data?.musicError,
      });
      if (data?.tts) {
        if (data?.music) {
          toast.success("ElevenLabs permissions OK (Voiceover & Music)");
        } else {
          toast.info("Voiceover is ready! Note: Music generation requires an ElevenLabs paid plan.");
        }
      } else {
        toast.error("ElevenLabs Text-to-Speech permission is missing. Check your API key.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not check permissions");
    } finally {
      setIsCheckingPerms(false);
    }
  };


  const handlePreviewVoiceover = async (useBackupEngine = false) => {
    const text = (voiceoverText.trim() || postContent.trim() || imagePrompt.trim()).slice(0, 2000);
    if (!text) {
      toast.error("Please enter post content or a voiceover script first");
      return;
    }
    // Stop any previous preview
    if (voicePreviewAudioRef.current) {
      try { voicePreviewAudioRef.current.pause(); } catch { }
      voicePreviewAudioRef.current = null;
    }
    setIsPreviewingVoice(true);
    try {
      if (useBackupEngine) {
        toast.info("Generating full voice preview with backup engine...");
        const fbRes = await supabase.functions.invoke("generate-video-audio", {
          body: { voiceText: text, action: "free_tts" },
        });
        if (fbRes.data?.voiceAudio) {
          setLatestVoiceAudio(fbRes.data.voiceAudio);
          setLatestVoiceScript(text);
          const audio = new Audio(`data:audio/mpeg;base64,${fbRes.data.voiceAudio}`);
          voicePreviewAudioRef.current = audio;
          audio.onended = () => { setIsPreviewingVoice(false); };
          audio.onerror = () => { setIsPreviewingVoice(false); toast.error("Could not play preview"); };
          await audio.play();
          toast.success("Playing full voice preview (Backup Engine)");
          setIsPreviewingVoice(false);
          return;
        }
      }

      // Auto-check ElevenLabs TTS permission (skip if already verified OK in this session)
      let perms = elevenPerms;
      if (!perms || !perms.tts) {
        const check = await supabase.functions.invoke("generate-video-audio", {
          body: { action: "check", apiKey: userElevenLabsKey || undefined },
        });
        if (check.error) throw check.error;
        const data = check.data as { tts?: boolean; music?: boolean; ttsError?: string; musicError?: string } | null;
        perms = {
          tts: !!data?.tts,
          music: !!data?.music,
          ttsError: data?.ttsError,
          musicError: data?.musicError,
        };
        setElevenPerms(perms);
      }
      if (!perms.tts) {
        throw new Error(perms.ttsError || "ElevenLabs key missing 'Text to Speech' permission. Enable it in your ElevenLabs API key settings.");
      }

      const { data, error } = await supabase.functions.invoke("generate-video-audio", {
        body: { voiceText: text, musicPrompt: "", apiKey: userElevenLabsKey || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.voiceError) {
        if (data.voiceError.toLowerCase().includes("quota_exceeded")) {
          const match = data.voiceError.match(/(\d+)\s+credits remaining.*?(\d+)\s+credits are required/i);
          const remaining = match ? parseInt(match[1], 10) : 62;
          const required = match ? parseInt(match[2], 10) : 160;
          setQuotaExceededInfo({ remaining, required });

          // Auto-preview full voice using backup engine
          const fbRes = await supabase.functions.invoke("generate-video-audio", {
            body: { voiceText: text, action: "free_tts" },
          });
          if (fbRes.data?.voiceAudio) {
            setLatestVoiceAudio(fbRes.data.voiceAudio);
            setLatestVoiceScript(text);
            const audio = new Audio(`data:audio/mpeg;base64,${fbRes.data.voiceAudio}`);
            voicePreviewAudioRef.current = audio;
            audio.onended = () => { setIsPreviewingVoice(false); };
            audio.onerror = () => { setIsPreviewingVoice(false); toast.error("Could not play preview"); };
            await audio.play();
            toast.info("Playing full preview with backup voice engine.");
            setIsPreviewingVoice(false);
            return;
          }

          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
          }
          toast.warning(
            `ElevenLabs quota reached (${remaining} credits left). Playing preview using device speech! Add a new key in ElevenLabs Setup.`,
            {
              action: { label: "Setup Key", onClick: () => window.location.href = "/elevenlabs" },
              duration: 10000,
            }
          );
          setIsPreviewingVoice(false);
          return;
        }
        throw new Error(data.voiceError);
      }

      if (data?.voiceNotice) {
        toast.info(data.voiceNotice);
      }
      if (!data?.voiceAudio) throw new Error("No preview audio returned");

      setLatestVoiceAudio(data.voiceAudio);
      setLatestVoiceScript(text);

      const audio = new Audio(`data:audio/mpeg;base64,${data.voiceAudio}`);
      voicePreviewAudioRef.current = audio;
      audio.onended = () => { setIsPreviewingVoice(false); };
      audio.onerror = () => { setIsPreviewingVoice(false); toast.error("Could not play preview"); };
      await audio.play();
    } catch (err: any) {
      console.error("Voice preview error:", err);
      toast.error(err?.message || "Failed to preview voiceover");
      setIsPreviewingVoice(false);
    }
  };

  const handleDownloadVoice = async (useBackupEngine = false) => {
    const rawText = (voiceoverText.trim() || postContent.trim() || imagePrompt.trim()).slice(0, 2000);
    if (!rawText && !latestVoiceAudio) {
      toast.error("Please enter post content or a voiceover script first");
      return;
    }

    const text = rawText;
    const timestamp = Date.now();
    const filename = `voiceover-${timestamp}.mp3`;

    // Only reuse cached audio if it is for the EXACT text and not forcing fresh backup generation
    if (!useBackupEngine && latestVoiceAudio && text && latestVoiceScript === text) {
      downloadAudioBase64(latestVoiceAudio, filename);
      toast.success("Full voiceover audio downloaded!");
      return;
    }

    setIsDownloadingVoice(true);
    try {
      if (useBackupEngine) {
        toast.info("Generating full voiceover with backup engine...");
        const fbRes = await supabase.functions.invoke("generate-video-audio", {
          body: { voiceText: text, action: "free_tts" },
        });
        if (fbRes.error) throw fbRes.error;
        if (fbRes.data?.voiceAudio) {
          setLatestVoiceAudio(fbRes.data.voiceAudio);
          setLatestVoiceScript(text);
          downloadAudioBase64(fbRes.data.voiceAudio, filename);
          toast.success("100% full voiceover audio downloaded successfully!");
          return;
        }
        throw new Error(fbRes.data?.error || "Backup engine returned no audio");
      }

      let perms = elevenPerms;
      if (!perms || !perms.tts) {
        const check = await supabase.functions.invoke("generate-video-audio", {
          body: { action: "check", apiKey: userElevenLabsKey || undefined },
        });
        if (check.error) throw check.error;
        const data = check.data as { tts?: boolean; music?: boolean; ttsError?: string; musicError?: string } | null;
        perms = {
          tts: !!data?.tts,
          music: !!data?.music,
          ttsError: data?.ttsError,
          musicError: data?.musicError,
        };
        setElevenPerms(perms);
      }
      if (!perms.tts) {
        throw new Error(perms.ttsError || "ElevenLabs key missing 'Text to Speech' permission. Enable it in your ElevenLabs API key settings.");
      }

      toast.info("Generating full voiceover audio for download...");
      const { data, error } = await supabase.functions.invoke("generate-video-audio", {
        body: { voiceText: text, musicPrompt: "", apiKey: userElevenLabsKey || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.voiceError) {
        if (data.voiceError.toLowerCase().includes("quota_exceeded")) {
          const match = data.voiceError.match(/(\d+)\s+credits remaining.*?(\d+)\s+credits are required/i);
          const remaining = match ? parseInt(match[1], 10) : 62;
          const required = match ? parseInt(match[2], 10) : 160;
          setQuotaExceededInfo({ remaining, required });

          // Auto-generate full audio using backup engine so the user ALWAYS gets the complete MP3!
          toast.info("ElevenLabs quota reached. Downloading full voiceover via backup engine...");
          const fbRes = await supabase.functions.invoke("generate-video-audio", {
            body: { voiceText: text, action: "free_tts" },
          });
          if (fbRes.data?.voiceAudio) {
            setLatestVoiceAudio(fbRes.data.voiceAudio);
            setLatestVoiceScript(text);
            downloadAudioBase64(fbRes.data.voiceAudio, filename);
            toast.success("100% full voiceover audio downloaded successfully!");
            return;
          }

          toast.error(
            `ElevenLabs quota exceeded: You have ${remaining} credits remaining, but this text requires ${required} credits. Add a new key in ElevenLabs Setup.`,
            {
              action: { label: "ElevenLabs Setup", onClick: () => window.location.href = "/elevenlabs" },
              duration: 12000,
            }
          );
          setIsDownloadingVoice(false);
          return;
        }
        throw new Error(data.voiceError);
      }

      if (data?.voiceNotice) {
        toast.info(data.voiceNotice);
      }
      if (!data?.voiceAudio) throw new Error("No audio returned from voice generator");

      setLatestVoiceAudio(data.voiceAudio);
      setLatestVoiceScript(text);
      setQuotaExceededInfo(null);

      downloadAudioBase64(data.voiceAudio, filename);
      toast.success("100% full voiceover audio downloaded successfully!");
    } catch (err: any) {
      console.error("Voice download error:", err);
      toast.error(err?.message || "Failed to download voiceover");
    } finally {
      setIsDownloadingVoice(false);
    }
  };
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [imageProvider, setImageProvider] = useState<string>("lovable_ai");
  const [availableKeys, setAvailableKeys] = useState<Record<string, boolean>>({ stability_api_key: false, leonardo_api_key: false, nvidia_api_key: false });
  const [pollinationsApiKey, setPollinationsApiKey] = useState<string>("");
  const [selectedPollinationsModel, setSelectedPollinationsModel] = useState<string>("");
  const [nvidiaChecking, setNvidiaChecking] = useState(false);
  const [nvidiaResults, setNvidiaResults] = useState<NvidiaModelAccess[] | null>(null);
  const [nvidiaVideoChecking, setNvidiaVideoChecking] = useState(false);
  const [nvidiaVideoResults, setNvidiaVideoResults] = useState<NvidiaModelAccess[] | null>(null);
  const [promptLanguage, setPromptLanguage] = useState<"english" | "hindi" | "hinglish">("english");

  const hasPollinationsKey = Boolean(pollinationsApiKey || availableKeys.pollinations_api_key);
  const pollinationsEndpoint: PollinationsEndpoint = resolvePollinationsEndpoint(hasPollinationsKey);
  const activePollinationsModel = selectedPollinationsModel || getDefaultModelForEndpoint(pollinationsEndpoint);

  const handleGenerateAIPrompt = async () => {
    const seed = postContent.trim() || imagePrompt.trim();
    if (!seed) {
      toast.error("Type a post idea or short prompt first");
      return;
    }
    setIsGeneratingPrompt(true);
    try {
      const langInstruction =
        promptLanguage === "hindi"
          ? "Write BOTH the caption and the visual prompt in natural Hindi (Devanagari script). Keep brand names in English."
          : promptLanguage === "hinglish"
            ? "Write BOTH the caption and the visual prompt in Hinglish (Hindi written using English Roman letters)."
            : "Write BOTH the caption and the visual prompt in clear English.";
      const instruction =
        `You will generate content for a promotional social media post about: "${seed}".\n` +
        `${langInstruction}\n` +
        `Return EXACTLY this format with both sections, no extra commentary:\n` +
        `CAPTION:\n<engaging social media caption under 280 characters with relevant emojis and a clear call-to-action>\n\n` +
        `IMAGE_PROMPT:\n<single vivid AI VIDEO/IMAGE generation prompt under 80 words including scene, subject, lighting, style, mood, colors, camera angle>`;
      const { data, error } = await supabase.functions.invoke("generate-template", {
        body: {
          type: "message_suggestion",
          context: {
            contactName: "social media audience",
            recentMessages: [instruction],
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const raw = (data?.content || "").trim();
      if (!raw) throw new Error("Empty AI response");

      const capMatch = raw.match(/CAPTION:\s*([\s\S]*?)(?=\n\s*IMAGE_PROMPT:|$)/i);
      const imgMatch = raw.match(/IMAGE_PROMPT:\s*([\s\S]*?)$/i);
      const caption = (capMatch?.[1] || "").trim().replace(/^["']|["']$/g, "");
      const imgPrompt = (imgMatch?.[1] || "").trim().replace(/^["']|["']$/g, "");

      if (caption) setPostContent(caption);
      if (imgPrompt) {
        setImagePrompt(imgPrompt);
      } else if (!caption) {
        // Fallback: no labels found, use whole response as image prompt
        setImagePrompt(raw.replace(/^["']|["']$/g, ""));
      }
      toast.success("Caption and AI prompt generated!");
    } catch (err: any) {
      console.error("AI prompt error:", err);
      toast.error(err?.message || "Failed to generate AI prompt");
    }
    setIsGeneratingPrompt(false);
  };

  const location = useLocation();

  useEffect(() => {
    fetchData();
    fetchCredentials();
    fetchImageProvider();
  }, []);

  useEffect(() => {
    if (location.state) {
      const state = location.state as { content?: string; mediaUrl?: string | null; platforms?: string[] };
      if (state.content) setPostContent(state.content);
      if (state.mediaUrl) {
        setMediaUrl(state.mediaUrl);
        setMediaPreview(state.mediaUrl);
      }
      if (state.platforms && state.platforms.length > 0) {
        setSelectedPlatforms(state.platforms);
      }
      setActiveTab("create");
    }
  }, [location.state]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.source === "youtube-oauth" && ev.data?.done) {
        toast.success("YouTube reconnected ✓");
        fetchCredentials();
        setQuotaCooldowns(prev => { const { youtube: _, ...rest } = prev; return rest; });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    const onPollKeyUpdate = () => {
      const k = localStorage.getItem("pollinations_api_key") || "";
      if (k) {
        setPollinationsApiKey(k);
        setAvailableKeys((prev) => ({ ...prev, pollinations_api_key: true }));
      }
    };
    window.addEventListener("pollinations-key-updated", onPollKeyUpdate);
    return () => window.removeEventListener("pollinations-key-updated", onPollKeyUpdate);
  }, []);

  const fetchImageProvider = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    let pollKey = localStorage.getItem("pollinations_api_key") || "";
    if (user) {
      try {
        const { data: aiKeyData } = await (supabase as any)
          .from("ai_api_keys")
          .select("pollinations_api_key")
          .eq("user_id", user.id)
          .maybeSingle();
        if ((aiKeyData as any)?.pollinations_api_key) {
          pollKey = (aiKeyData as any).pollinations_api_key;
        }
      } catch {
        // ignore
      }
    }
    if (pollKey) setPollinationsApiKey(pollKey);

    if (!user) return;
    const { data } = await supabase
      .from("api_credentials")
      .select("stability_api_key, leonardo_api_key, nvidia_api_key, elevenlabs_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      if ((data as any).elevenlabs_api_key) {
        setUserElevenLabsKey((data as any).elevenlabs_api_key);
      }
      setAvailableKeys({
        stability_api_key: !!data.stability_api_key,
        leonardo_api_key: !!data.leonardo_api_key,
        nvidia_api_key: !!data.nvidia_api_key,
        pollinations_api_key: Boolean(pollKey),
      });
      if (data.nvidia_api_key) setImageProvider("nvidia");
      else if (data.stability_api_key) setImageProvider("stability");
      else if (data.leonardo_api_key) setImageProvider("leonardo");
      else if (pollKey) setImageProvider("pollinations");
    }
  };

  const handleCheckNvidiaImageAccess = async (showSuccess = true) => {
    return checkNvidiaAccess(NVIDIA_IMAGE_MODEL_IDS, "image", showSuccess);
  };

  const handleCheckNvidiaVideoAccess = async (showSuccess = true) => {
    return checkNvidiaAccess(NVIDIA_VIDEO_MODEL_IDS, "video", showSuccess);
  };

  const checkNvidiaAccess = async (
    ids: string[],
    label: "image" | "video",
    showSuccess: boolean,
  ) => {
    const key = (await getStoredNvidiaApiKey()) || localStorage.getItem("nvidia_api_key") || "";
    if (!key) {
      toast.error("NVIDIA API key not configured. Add it in API Setup.");
      return false;
    }
    const setChecking = label === "video" ? setNvidiaVideoChecking : setNvidiaChecking;
    const setResults = label === "video" ? setNvidiaVideoResults : setNvidiaResults;
    setChecking(true);
    try {
      const results = await runNvidiaAccessCheck(ids, key);
      setResults(results);

      if (label === "image") {
        const fluxGranted = hasNvidiaFluxAccess(results);
        const anyImageGranted = hasNvidiaImageAccess(results);

        if (fluxGranted || anyImageGranted) {
          if (showSuccess) {
            toast.success("NVIDIA FLUX.1-schnell model access verified and ready.");
          }
          return true;
        }

        toast.warning("NVIDIA image models unavailable", {
          description: `${getNvidiaAccessFailureSummary(results)}. Image generation will use Pollinations AI fallback.`,
        });
        return false;
      }

      // Video check
      const videoGranted = results.some((r) => r.access === "granted");
      if (videoGranted) {
        if (showSuccess) toast.success("NVIDIA video model access verified.");
        return true;
      }

      if (showSuccess) {
        toast.info("NVIDIA Cosmos NIM requires on-premise Docker server. Promo videos will use smooth animated motion effects.");
      }
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Could not check NVIDIA model access");
      return false;
    } finally {
      setChecking(false);
    }
  };


  const fetchCredentials = async () => {
    const { data } = await supabase
      .from("social_media_credentials")
      .select("*")
      .maybeSingle();
    if (data) {
      const { id, user_id, created_at, updated_at, ...creds } = data;
      setCredentials(creds as Partial<PlatformCredentials>);
    }
  };

  const fetchData = async () => {
    const [templatesRes, postsRes] = await Promise.all([
      supabase.from("templates").select("*").order("created_at", { ascending: false }),
      supabase.from("social_media_posts").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    if (templatesRes.data) setTemplates(templatesRes.data);
    if (postsRes.data) setPosts(postsRes.data);
  };

  const handleRepostPost = (post: SocialPost) => {
    setPostContent(post.content || "");
    setMediaUrl(post.media_url);
    if (post.media_url) {
      setMediaPreview(post.media_url);
    }
    setSelectedPlatforms([post.platform]);
    setActiveTab("create");
    toast.success("Post loaded for reposting");
  };

  const handleDeletePost = async (postId: string) => {
    setDeletingPostId(postId);
    try {
      const { error } = await supabase.from("social_media_posts").delete().eq("id", postId);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted");
    } catch (err: any) {
      console.error("Delete post error:", err);
      toast.error(err?.message || "Failed to delete post");
    }
    setDeletingPostId(null);
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const toggleSelectAllPosts = () => {
    setSelectedPostIds((prev) =>
      prev.size === posts.length ? new Set() : new Set(posts.map((p) => p.id)),
    );
  };

  const handleBulkDelete = async () => {
    if (selectedPostIds.size === 0) return;
    if (!confirm(`Delete ${selectedPostIds.size} selected post(s)? This cannot be undone.`)) return;
    setIsBulkActioning(true);
    try {
      const ids = Array.from(selectedPostIds);
      const { error } = await supabase.from("social_media_posts").delete().in("id", ids);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => !selectedPostIds.has(p.id)));
      setSelectedPostIds(new Set());
      toast.success(`Deleted ${ids.length} post(s)`);
    } catch (err: any) {
      console.error("Bulk delete error:", err);
      toast.error(err?.message || "Failed to delete posts");
    }
    setIsBulkActioning(false);
  };

  const handleBulkRepost = async () => {
    if (selectedPostIds.size === 0) return;
    setIsBulkActioning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const toRepost = posts.filter((p) => selectedPostIds.has(p.id));
      let succeeded = 0;
      let failed = 0;
      for (const post of toRepost) {
        try {
          await supabase.from("social_media_posts").insert({
            user_id: user.id,
            platform: post.platform,
            content: post.content || "",
            media_url: post.media_url,
            media_type: post.media_type,
            post_type: (post as any).post_type || post.media_type || "text",
            status: "pending",
          });
          const { data, error } = await supabase.functions.invoke("post-to-social", {
            body: {
              platforms: [post.platform],
              content: post.content || "",
              mediaUrl: post.media_url,
            },
          });
          if (error) throw error;
          const result = data?.results?.[0];
          if (result && result.success === false) failed++;
          else succeeded++;
        } catch (e) {
          console.error("Repost item error:", e);
          failed++;
        }
      }
      if (failed === 0) toast.success(`Reposted ${succeeded} post(s)`);
      else toast.warning(`${succeeded} reposted, ${failed} failed`);
      setSelectedPostIds(new Set());
      fetchData();
    } catch (err: any) {
      console.error("Bulk repost error:", err);
      toast.error(err?.message || "Failed to repost");
    }
    setIsBulkActioning(false);
  };

  const handleSaveCredentials = async (platformId: string) => {
    if (platformId === "youtube") {
      const errors: Record<string, string> = {};
      const channelName = ((credentials as any)?.youtube_channel_name || "").trim();
      const channelId = ((credentials as any)?.youtube_channel_id || "").trim();
      const accessToken = ((credentials as any)?.youtube_access_token || "").trim();

      if (!channelName) errors.youtube_channel_name = "Channel Name is required";
      if (!channelId) errors.youtube_channel_id = "Channel ID is required";
      if (!accessToken) {
        errors.youtube_access_token = "OAuth Access Token is required";
      } else if (!/^ya29\./i.test(accessToken)) {
        errors.youtube_access_token = "Invalid OAuth Access Token format (should start with ya29.)";
      }

      setYoutubeErrors(errors);
      if (Object.keys(errors).length > 0) {
        toast.error("Please fix the errors before saving");
        return;
      }
    } else {
      setYoutubeErrors({});
    }

    setIsSavingCredentials(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        setIsSavingCredentials(false);
        return;
      }

      const trimmedCreds: Record<string, any> = {};
      for (const [k, v] of Object.entries(credentials)) {
        trimmedCreds[k] = typeof v === "string" ? v.trim() : v;
      }

      const { error } = await supabase
        .from("social_media_credentials")
        .upsert({ user_id: user.id, ...trimmedCreds }, { onConflict: "user_id" });

      if (error) throw error;
      setCredentials((prev) => ({ ...prev, ...trimmedCreds }));
      toast.success(`${PLATFORM_CONFIGS.find(p => p.id === platformId)?.label} credentials saved!`);
    } catch (err) {
      console.error("Save credentials error:", err);
      toast.error("Failed to save credentials");
    }
    setIsSavingCredentials(false);
  };

  const toggleFieldVisibility = (fieldKey: string) => {
    setVisibleFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  };

  // Compute next YouTube quota reset (midnight Pacific Time) as ms epoch
  const getNextPacificMidnight = () => {
    const nowD = new Date();
    // Get current Pacific date parts
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(nowD).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    // Seconds elapsed today in PT
    const ptSecs = (+parts.hour) * 3600 + (+parts.minute) * 60 + (+parts.second);
    const msUntilMidnight = (86400 - ptSecs) * 1000;
    return nowD.getTime() + msUntilMidnight;
  };

  useEffect(() => {
    const hasActiveCd = Object.values(quotaCooldowns).some(t => t > Date.now());
    const hasQueue = retryQueue.length > 0;
    if (!hasActiveCd && !hasQueue) return;
    const id = setInterval(() => setNow(Date.now()), hasQueue ? 5000 : 30000);
    return () => clearInterval(id);
  }, [quotaCooldowns, retryQueue]);

  useEffect(() => {
    localStorage.setItem("platform_quota_cooldowns", JSON.stringify(quotaCooldowns));
  }, [quotaCooldowns]);

  useEffect(() => {
    localStorage.setItem("platform_retry_queue", JSON.stringify(retryQueue));
  }, [retryQueue]);

  const setCooldown = (platformId: string, until: number) => {
    setQuotaCooldowns(prev => ({ ...prev, [platformId]: until }));
  };

  const formatRemaining = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const toggleAutoRetry = (platformId: string) => {
    setRetryQueue(prev => prev.includes(platformId) ? prev.filter(p => p !== platformId) : [...prev, platformId]);
  };

  const handleReconnectYouTube = async () => {
    const t = toast.loading("Opening Google sign-in…");
    try {
      const { data, error } = await supabase.functions.invoke("youtube-oauth-start", { body: {} });
      if (error) throw error;
      if (!data?.auth_url) throw new Error(data?.error || "Could not start OAuth");
      const popup = window.open(data.auth_url, "yt-oauth", "width=520,height=680");
      if (!popup) {
        toast.error("Popup blocked. Please allow popups and try again.", { id: t });
        return;
      }
      toast.success("Authorize YouTube in the new window. Tokens will be saved automatically.", { id: t });
    } catch (e: any) {
      console.error("Reconnect YouTube error:", e);
      toast.error(e?.message || "Failed to start YouTube reconnect", { id: t });
    }
  };

  const handleTestConnection = async (platformId: string, opts: { silent?: boolean; auto?: boolean } = {}) => {
    const { silent = false, auto = false } = opts;
    const cd = quotaCooldowns[platformId];
    if (cd && cd > Date.now()) {
      if (!silent) toast.error(`Quota exceeded. Try again in ${formatRemaining(cd - Date.now())}.`);
      return;
    }
    setTestingPlatform(platformId);
    const toastId = `test-${platformId}`;
    if (!silent) {
      toast.loading(
        platformId === "youtube" ? "Testing YouTube… (will auto-refresh token if expired)" : `Testing ${platformId}…`,
        { id: toastId }
      );
    }
    try {
      const { data, error } = await supabase.functions.invoke("test-connection", {
        body: { platform: platformId },
      });
      if (error) throw error;
      const msg: string = data?.message || "";
      const isQuota = !data?.success && /quota|exceeded|rate.?limit|429/i.test(msg);
      const isRefreshFail = !data?.success && /token refresh failed/i.test(msg);
      if (data?.success) {
        const wasRefreshed = /🔄|refreshed token/i.test(msg);
        if (wasRefreshed) {
          setRefreshingPlatform(platformId);
          toast.success("YouTube token refreshed ✓", {
            id: toastId,
            description: `Connection restored automatically. ${msg.replace(/^🔄\s*Refreshed token\.\s*/i, "")}`.trim(),
          });
          setTimeout(() => setRefreshingPlatform((p) => (p === platformId ? null : p)), 2500);
        } else {
          toast.success(auto ? `${platformId}: connection restored ✓` : (msg || "Connection OK"), { id: toastId });
        }
        setQuotaCooldowns(prev => {
          const { [platformId]: _, ...rest } = prev;
          return rest;
        });
        setRetryQueue(prev => prev.filter(p => p !== platformId));
      } else if (isRefreshFail) {
        toast.error("Token refresh failed", {
          id: toastId,
          description: msg.replace(/^Token refresh failed:\s*/i, "").trim(),
        });
      } else if (isQuota && platformId === "youtube") {
        const until = getNextPacificMidnight();
        setCooldown(platformId, until);
        toast.error(`YouTube quota exceeded. Disabled until ${new Date(until).toLocaleString()} (resets at midnight Pacific Time).`, { id: toastId });
      } else {
        if (!silent) toast.error(msg || "Connection test failed", { id: toastId });
        else toast.dismiss(toastId);
      }
    } catch (err) {
      console.error("Test connection error:", err);
      if (!silent) toast.error("Failed to test connection", { id: toastId });
      else toast.dismiss(toastId);
    }
    setTestingPlatform(null);
    setRefreshingPlatform(null);
  };

  // Auto-retry queued platforms once their cooldown elapses
  const handleTestRef = useRef(handleTestConnection);
  handleTestRef.current = handleTestConnection;
  useEffect(() => {
    if (retryQueue.length === 0) return;
    for (const platformId of retryQueue) {
      const cd = quotaCooldowns[platformId];
      if (!cd || cd <= Date.now()) {
        handleTestRef.current(platformId, { silent: true, auto: true });
      }
    }
  }, [now, retryQueue, quotaCooldowns]);

  const isPlatformConfigured = (platformId: string) => {
    const config = PLATFORM_CONFIGS.find(p => p.id === platformId);
    if (!config || config.fields.length === 0) return false;
    return config.fields.some(f => !!(credentials as any)?.[f.key]);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setPostContent(template.content);
      if (template.image_prompt) setImagePrompt(template.image_prompt);
      toast.success(`Template "${template.name}" loaded`);
    }
  };

  const handlePlatformToggle = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((id) => id !== platformId)
        : [...prev, platformId]
    );
  };

  const handleSelectAllPlatforms = () => {
    if (selectedPlatforms.length === PLATFORMS.length) {
      setSelectedPlatforms([]);
    } else {
      setSelectedPlatforms(PLATFORMS.map((p) => p.id));
    }
  };

  const isVideoFile = (file: File | null) => file?.type?.startsWith("video/");
  const isVideoUrl = (url: string | null) => {
    if (!url) return false;
    return /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(url);
  };

  // Normalize MIME type by stripping parameters (e.g. "video/webm;codecs=vp9,opus" -> "video/webm")
  const normalizeMimeType = (type: string | undefined | null): string => {
    if (!type) return "application/octet-stream";
    return type.split(";")[0].trim().toLowerCase();
  };

  // Storage bucket accepts these MIME types
  const ALLOWED_UPLOAD_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/webm",
    "video/mp4",
    "video/quicktime",
  ];

  const isAllowedMimeType = (type: string | undefined | null): boolean => {
    const base = normalizeMimeType(type);
    return ALLOWED_UPLOAD_TYPES.includes(base);
  };

  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

  // Re-encode unsupported image formats (heic, bmp, avif, tiff…) to PNG in the browser
  const convertImageToPng = (file: File): Promise<File> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error("Could not convert image"));
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" }));
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("This image format can't be read by the browser. Please use JPG, PNG, GIF or WebP."));
      };
      img.src = url;
    });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    let file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`);
      input.value = "";
      return;
    }

    if (!isAllowedMimeType(file.type)) {
      if (file.type.startsWith("image/")) {
        try {
          file = await convertImageToPng(file);
          toast.info("Image converted to PNG for upload.");
        } catch (err: any) {
          toast.error(err?.message || "Unsupported image format");
          input.value = "";
          return;
        }
      } else {
        toast.error(
          `Video format "${file.type || "unknown"}" isn't supported. Please use MP4 or WebM video.`,
        );
        input.value = "";
        return;
      }
    }

    setMediaFile(file);
    if (file.type.startsWith("video/")) {
      setMediaPreview(URL.createObjectURL(file));
    } else {
      const reader = new FileReader();
      reader.onloadend = () => setMediaPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
    setMediaUrl(null);
    input.value = "";
  };


  const uploadDataUrlToStorage = async (dataUrl: string, ext = "png"): Promise<string> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const path = `${user.id}/ai_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("whatsapp-media").upload(path, blob, {
      contentType: blob.type || `image/${ext}`,
      upsert: false,
    });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
    return pub.publicUrl;
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      toast.error("Please enter an image prompt");
      return;
    }
    setIsGeneratingImage(true);
    try {
      let data: any = null;

      // 1. Pollinations.ai HD Model Direct Generation
      if (imageProvider === "pollinations") {
        toast.info(`Generating HD image with Pollinations (${activePollinationsModel})...`);
        try {
          const res = await generatePollinationsImage({
            prompt: imagePrompt.trim(),
            model: activePollinationsModel,
            width: 1024,
            height: 1024,
            endpoint: pollinationsEndpoint,
            seed: Math.floor(Math.random() * 2147483647),
            apiKey: pollinationsApiKey || null,
          });
          data = { imageUrl: res.imageUrl };
        } catch (pollErr: any) {
          throw new Error(`Pollinations HD generation failed: ${pollErr?.message || "Unknown error"}`);
        }
      }
      // 2. NVIDIA AI or Cosmos with Pollinations FLUX Fallback
      else if (imageProvider === "nvidia" || imageProvider === "cosmos") {
        try {
          toast.info(
            imageProvider === "cosmos"
              ? "Generating high-resolution frame with NVIDIA Cosmos/FLUX..."
              : "Generating image with NVIDIA FLUX (NIM)..."
          );
          const res = await generateNvidiaImage({
            prompt: imagePrompt.trim(),
            model: "flux-3-image-klein",
            width: 1024,
            height: 1024,
            steps: 25,
          });
          data = { imageUrl: res.imageUrl };
        } catch (nvidiaErr: any) {
          console.warn("NVIDIA FLUX direct generation issue, attempting Pollinations fallback:", nvidiaErr);
          toast.info("NVIDIA NIM server busy. Falling back to high-speed Pollinations generation...");
          try {
            const fallbackModel = isPollinationsModelAvailable(activePollinationsModel, pollinationsEndpoint, hasPollinationsKey)
              ? activePollinationsModel
              : getDefaultModelForEndpoint(pollinationsEndpoint);
            const fallbackRes = await generatePollinationsImage({
              prompt: imagePrompt.trim(),
              model: fallbackModel,
              width: 1024,
              height: 1024,
              endpoint: pollinationsEndpoint,
              seed: Math.floor(Math.random() * 2147483647),
              apiKey: pollinationsApiKey || null,
            });
            data = { imageUrl: fallbackRes.imageUrl };
          } catch {
            throw new Error(`Generation failed: ${nvidiaErr?.message || "Server busy"}`);
          }
        }
      }
      // 3. Pexels Stock Photos
      else if (imageProvider === "pexels") {
        const pexelsRes = await supabase.functions.invoke("pexels-search", {
          body: { query: imagePrompt.trim(), kind: "photo" },
        });
        if (pexelsRes.error) throw pexelsRes.error;
        data = pexelsRes.data;
      }
      // 4. Stability AI, Leonardo AI, Auto, or Lovable AI
      else {
        if (imageProvider === "stability" && !availableKeys.stability_api_key) {
          toast.info("Stability API key not found in API Setup. Attempting generation via available providers...");
        }
        try {
          const genRes = await supabase.functions.invoke("generate-template", {
            body: {
              type: "generate_image",
              imagePrompt: imagePrompt.trim(),
              imageProvider,
            },
          });
          if (genRes.error) throw genRes.error;
          data = genRes.data;
        } catch (edgeErr: any) {
          console.warn("generate-template failed, using Pollinations fallback:", edgeErr);
          toast.info("Service busy. Falling back to high-definition Pollinations generation...");
          const fallbackRes = await generatePollinationsImage({
            prompt: imagePrompt.trim(),
            model: activePollinationsModel || "flux",
            width: 1024,
            height: 1024,
            endpoint: pollinationsEndpoint,
            seed: Math.floor(Math.random() * 2147483647),
            apiKey: pollinationsApiKey || null,
          });
          data = { imageUrl: fallbackRes.imageUrl };
        }
      }

      if (data?.error) throw new Error(data.error);
      if (data?.imageUrl) {
        let finalUrl = data.imageUrl as string;
        if (finalUrl.startsWith("data:")) {
          // Derive extension from the data URL's mime type so JPEGs (e.g. from
          // Pollinations) aren't uploaded with a misleading .png suffix.
          const mimeMatch = finalUrl.match(/^data:([^;]+);/);
          const mime = mimeMatch?.[1] || "image/png";
          const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png";
          try {
            finalUrl = await uploadDataUrlToStorage(finalUrl, ext);
          } catch (uploadErr) {
            console.warn("Storage upload failed, using data URL fallback:", uploadErr);
          }
        }
        setMediaPreview(finalUrl);
        setMediaUrl(finalUrl);
        setMediaFile(null);
        if (data.warning) toast.warning(data.warning);
        toast.success("Image generated successfully!");
      }
    } catch (err: any) {
      console.error("Image gen error:", err);
      const msg = err?.message || "Failed to generate image";
      toast.error(msg);
    }

    setIsGeneratingImage(false);
  };

  const handleGeneratePromoVideo = async () => {
    if (!imagePrompt.trim()) {
      toast.error("Please enter a prompt for the promo video");
      return;
    }
    setIsGeneratingVideo(true);
    try {
      let videoBlob: Blob;
      if (imageProvider === "pexels") {
        toast.info("Finding a stock video on Pexels...");
        const { data: px, error: pxErr } = await supabase.functions.invoke("pexels-search", {
          body: { query: imagePrompt.trim(), kind: "video" },
        });
        if (pxErr) throw pxErr;
        if (px?.error) throw new Error(px.error);
        const res = await fetch(px.videoUrl);
        if (!res.ok) throw new Error("Could not download the Pexels video");
        videoBlob = await res.blob();
        if (videoBlob.size > 50 * 1024 * 1024) throw new Error("Pexels video is over 50 MB. Try a different prompt.");
        if (px.credit) toast.info(`Video by ${px.credit} on Pexels`);
      } else {
        // Step 1: Generate AI image from prompt
        toast.info(
          imageProvider === "cosmos"
            ? "Generating frame for NVIDIA Cosmos promo video..."
            : imageProvider === "nvidia"
            ? "Generating FLUX AI image for promo video..."
            : "Generating AI image for video..."
        );
        let imageUrl = "";
        if (imageProvider === "pollinations") {
          toast.info(`Generating Pollinations HD frame (${activePollinationsModel})...`);
          const res = await generatePollinationsImage({
            prompt: imagePrompt.trim(),
            model: activePollinationsModel,
            width: 1024,
            height: 1024,
            endpoint: pollinationsEndpoint,
            seed: Math.floor(Math.random() * 2147483647),
            apiKey: pollinationsApiKey || null,
          });
          imageUrl = res.imageUrl;
        } else if (imageProvider === "nvidia" || imageProvider === "cosmos") {
          try {
            const res = await generateNvidiaImage({
              prompt: imagePrompt.trim(),
              model: "flux-3-image-klein",
              width: 1024,
              height: 1024,
              steps: 25,
            });
            imageUrl = res.imageUrl;
          } catch (nvErr: any) {
            console.warn("NVIDIA frame generation failed, using Pollinations HD fallback:", nvErr);
            toast.info("NVIDIA NIM server busy. Using Pollinations HD frame for video...");
            const fallbackModel = isPollinationsModelAvailable(activePollinationsModel, pollinationsEndpoint, hasPollinationsKey)
              ? activePollinationsModel
              : getDefaultModelForEndpoint(pollinationsEndpoint);
            const fbRes = await generatePollinationsImage({
              prompt: imagePrompt.trim(),
              model: fallbackModel,
              width: 1024,
              height: 1024,
              endpoint: pollinationsEndpoint,
              seed: Math.floor(Math.random() * 2147483647),
              apiKey: pollinationsApiKey || null,
            });
            imageUrl = fbRes.imageUrl;
          }
        } else {
          try {
            const { data, error } = await supabase.functions.invoke("generate-template", {
              body: {
                type: "generate_image",
                imagePrompt: imagePrompt.trim(),
                imageProvider,
              },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            imageUrl = data?.imageUrl;
          } catch (edgeErr: any) {
            console.warn("generate-template failed for promo video, using Pollinations fallback:", edgeErr);
            toast.info("Using Pollinations HD fallback for video frame...");
            const fbRes = await generatePollinationsImage({
              prompt: imagePrompt.trim(),
              model: activePollinationsModel || "flux",
              width: 1024,
              height: 1024,
              endpoint: pollinationsEndpoint,
              seed: Math.floor(Math.random() * 2147483647),
              apiKey: pollinationsApiKey || null,
            });
            imageUrl = fbRes.imageUrl;
          }
        }

        if (!imageUrl) throw new Error("No image generated");

        // Step 2: High quality animated Ken Burns promo video
        toast.info(
          imageProvider === "cosmos"
            ? "Creating NVIDIA Cosmos animated promo video with motion effects..."
            : "Creating promo video with motion effects..."
        );
        videoBlob = await createPromoVideo({
          imageUrl,
          text: postContent.trim() || imagePrompt.trim(),
          durationMs: 6000,
          width: 1080,
          height: 1080,
        });
      }



      const ext = (videoBlob.type || "").includes("mp4") ? "mp4" : "webm";
      const videoFile = new File([videoBlob], `promo_${Date.now()}.${ext}`, { type: videoBlob.type });
      // Upload to storage so video shows reliably and is postable
      let publicVideoUrl: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const path = `${user.id}/promo_${Date.now()}.${ext}`;
          const cleanType = (videoBlob.type || "").split(";")[0] || `video/${ext}`;
          const { error: upErr } = await supabase.storage.from("whatsapp-media").upload(path, videoBlob, {
            contentType: cleanType,
            upsert: false,
          });
          if (!upErr) {
            const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
            publicVideoUrl = pub.publicUrl;
          }
        }
      } catch (e) {
        console.warn("Promo video storage upload failed:", e);
      }
      setMediaFile(videoFile);
      setMediaPreview(publicVideoUrl || URL.createObjectURL(videoBlob));
      setMediaUrl(publicVideoUrl);
      toast.success("Promo video generated successfully!");
    } catch (err: any) {
      console.error("Video gen error:", err);
      const msg = err?.message || "Failed to generate promo video";
      if (msg.includes("credits") || msg.includes("balance")) {
        toast.error(`${imageProvider === "lovable_ai" ? "Shree AI Engine" : imageProvider} credits exhausted. Please select a different AI provider.`);
      } else if (msg.includes("webm") || msg.includes("mime")) {
        toast.error("Video format not supported for posting. Try posting as image instead.");
      } else {
        toast.error(msg);
      }
    }
    setIsGeneratingVideo(false);
  };

  const handleGenerateAIVideoWithAudio = async () => {
    if (!imagePrompt.trim()) {
      toast.error("Please enter a prompt for the AI video");
      return;
    }
    setIsGeneratingVideoAudio(true);
    try {
      // Step 1: AI image
      toast.info("Generating AI image…");
      let imageUrl = "";
      if (imageProvider === "pollinations") {
        toast.info(`Generating Pollinations HD frame (${activePollinationsModel})…`);
        const res = await generatePollinationsImage({
          prompt: imagePrompt.trim(),
          model: activePollinationsModel,
          width: 1024,
          height: 1024,
          endpoint: pollinationsEndpoint,
          seed: Math.floor(Math.random() * 2147483647),
          apiKey: pollinationsApiKey || null,
        });
        imageUrl = res.imageUrl;
      } else if (imageProvider === "nvidia" || imageProvider === "cosmos") {
        toast.info(
          imageProvider === "cosmos"
            ? "Generating frame for NVIDIA Cosmos video…"
            : "Generating FLUX AI image with NVIDIA…"
        );
        try {
          const res = await generateNvidiaImage({
            prompt: imagePrompt.trim(),
            model: "flux-3-image-klein",
            width: 1024,
            height: 1024,
            steps: 25,
          });
          imageUrl = res.imageUrl;
        } catch (nvErr: any) {
          console.warn("NVIDIA frame generation failed, using Pollinations HD fallback:", nvErr);
          toast.info("NVIDIA NIM server busy. Using Pollinations HD frame for video…");
          const fallbackModel = isPollinationsModelAvailable(activePollinationsModel, pollinationsEndpoint, hasPollinationsKey)
            ? activePollinationsModel
            : getDefaultModelForEndpoint(pollinationsEndpoint);
          const fbRes = await generatePollinationsImage({
            prompt: imagePrompt.trim(),
            model: fallbackModel,
            width: 1024,
            height: 1024,
            endpoint: pollinationsEndpoint,
            seed: Math.floor(Math.random() * 2147483647),
            apiKey: pollinationsApiKey || null,
          });
          imageUrl = fbRes.imageUrl;
        }
      } else if (imageProvider === "pexels") {
        const pexelsRes = await supabase.functions.invoke("pexels-search", { body: { query: imagePrompt.trim(), kind: "photo" } });
        if (pexelsRes.error) throw pexelsRes.error;
        if (pexelsRes.data?.error) throw new Error(pexelsRes.data.error);
        imageUrl = pexelsRes.data?.imageUrl;
      } else {
        try {
          const imgRes = await supabase.functions.invoke("generate-template", {
            body: { type: "generate_image", imagePrompt: imagePrompt.trim(), imageProvider },
          });
          if (imgRes.error) throw imgRes.error;
          if (imgRes.data?.error) throw new Error(imgRes.data.error);
          if (imgRes.data?.warning) toast.warning(imgRes.data.warning);
          imageUrl = imgRes.data?.imageUrl;
        } catch (edgeErr: any) {
          console.warn("generate-template failed, using Pollinations fallback:", edgeErr);
          toast.info("Using Pollinations HD fallback for video frame…");
          const fbRes = await generatePollinationsImage({
            prompt: imagePrompt.trim(),
            model: activePollinationsModel || "flux",
            width: 1024,
            height: 1024,
            endpoint: pollinationsEndpoint,
            seed: Math.floor(Math.random() * 2147483647),
            apiKey: pollinationsApiKey || null,
          });
          imageUrl = fbRes.imageUrl;
        }
      }
      if (!imageUrl) throw new Error("No image generated");

      // Step 2: voiceover + music
      toast.info("Generating AI voiceover and music…");
      const voiceText = voiceoverText.trim() || postContent.trim() || imagePrompt.trim();
      const musicPrompt = `cinematic upbeat background music for promo, ${imagePrompt.trim().slice(0, 120)}`;
      let voiceAudio: string | undefined;
      let musicAudio: string | undefined;
      try {
        const audioRes = await supabase.functions.invoke("generate-video-audio", {
          body: { voiceText, musicPrompt, musicDurationSeconds: 12, apiKey: userElevenLabsKey || undefined },
        });
        if (audioRes.error) {
          console.warn("generate-video-audio edge function error:", audioRes.error);
          toast.info("Voiceover service unavailable. Creating video with motion effects.");
        } else if (audioRes.data) {
          if (audioRes.data?.error) {
            console.warn("Audio generation warning:", audioRes.data.error);
            toast.info(audioRes.data.error);
          }
          const { voiceAudio: va, musicAudio: ma, voiceError, musicError } = audioRes.data || {};
          voiceAudio = va;
          musicAudio = ma;
          if (va) {
            setLatestVoiceAudio(va);
            setLatestVoiceScript(voiceText);
          }
          if (voiceError) toast.warning(voiceError);
          if (musicError) toast.warning(musicError);
        }
      } catch (audioErr: any) {
        console.warn("Audio generation failed:", audioErr);
        toast.info("Audio generation skipped. Producing animated promo video.");
      }

      // Step 3: mix into video
      toast.info("Rendering promo video…");
      let blob: Blob;
      if (voiceAudio || musicAudio) {
        toast.info("Mixing video with audio…");
        blob = await createPromoVideoWithAudio({
          imageUrl,
          text: voiceText,
          voiceAudioBase64: voiceAudio,
          musicAudioBase64: musicAudio,
          width: 1080,
          height: 1080,
          minDurationMs: 8000,
          maxDurationMs: 20000,
        });
      } else {
        toast.info("Rendering animated promo video…");
        blob = await createPromoVideo({
          imageUrl,
          text: voiceText,
          durationMs: 8000,
          width: 1080,
          height: 1080,
        });
      }

      const ext = (blob.type || "").includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `ai_video_audio_${Date.now()}.${ext}`, { type: blob.type });

      // Upload to storage
      let publicUrl: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const path = `${user.id}/ai_video_audio_${Date.now()}.${ext}`;
          const cleanType = (blob.type || "").split(";")[0] || `video/${ext}`;
          const { error: upErr } = await supabase.storage
            .from("whatsapp-media")
            .upload(path, blob, { contentType: cleanType, upsert: false });
          if (!upErr) {
            const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
            publicUrl = pub.publicUrl;
          }
        }
      } catch (e) {
        console.warn("AI video upload failed:", e);
      }

      setMediaFile(file);
      setMediaPreview(publicUrl || URL.createObjectURL(blob));
      setMediaUrl(publicUrl);
      toast.success("AI video with audio generated!");
    } catch (err: any) {
      console.error("AI video+audio error:", err);
      toast.error(err?.message || "Failed to generate AI video with audio");
    }
    setIsGeneratingVideoAudio(false);
  };

  const uploadMediaToStorage = async (userId: string): Promise<string | null> => {
    if (!mediaFile && !mediaUrl) return null;
    if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) return mediaUrl;

    let uploadBody: File | Blob;
    let contentType = mediaFile?.type || "image/png";

    if (mediaFile) {
      uploadBody = mediaFile;
    } else if (mediaUrl?.startsWith("data:")) {
      const response = await fetch(mediaUrl);
      const generatedBlob = await response.blob();

      uploadBody = generatedBlob;
      contentType = generatedBlob.type || contentType;
    } else {
      throw new Error("Unsupported media format. Please use an uploaded file or generated image.");
    }

    if (uploadBody.size > MAX_UPLOAD_BYTES) {
      throw new Error(`Media is too large (${(uploadBody.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`);
    }

    const baseType = normalizeMimeType(contentType);
    if (!isAllowedMimeType(contentType)) {
      throw new Error(
        `Media type "${contentType}" isn't supported. Use JPG, PNG, GIF, WebP images or MP4 / WebM video.`,
      );
    }

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/webm": "webm",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
    };
    const fileExt = extMap[baseType] || "webm";

    const fileName = `${userId}/social/${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;

    const { error } = await supabase.storage
      .from("whatsapp-media")
      .upload(fileName, uploadBody, { contentType: baseType, upsert: false });

    if (error) throw new Error("Failed to upload media: " + error.message);


    const { data: urlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const handlePost = async () => {
    if (!postContent.trim()) {
      toast.error("Please enter post content");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }

    setIsPosting(true);
    const includesYouTube = selectedPlatforms.includes("youtube");
    if (includesYouTube) {
      setYoutubeUpload({ status: "uploading", message: "Uploading video to YouTube…" });
    } else {
      setYoutubeUpload({ status: "idle", message: "" });
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to post");
        setIsPosting(false);
        if (includesYouTube) setYoutubeUpload({ status: "error", message: "Not logged in" });
        return;
      }

      let uploadedMediaUrl: string | null = null;
      if (mediaFile || mediaUrl) {
        uploadedMediaUrl = await uploadMediaToStorage(user.id);
      }

      // Determine media type
      const hasVideo = isVideoFile(mediaFile) || isVideoUrl(uploadedMediaUrl);
      const isWebMVideo =
        hasVideo &&
        ((mediaFile && (mediaFile.name.toLowerCase().endsWith(".webm") || mediaFile.type.includes("webm"))) ||
          (uploadedMediaUrl && uploadedMediaUrl.toLowerCase().includes(".webm")));

      if (selectedPlatforms.includes("instagram") && isWebMVideo) {
        toast.error(
          "Instagram Reels requires MP4 video. WebM is not supported by Instagram. Switch provider to Pexels or upload an MP4 video.",
          { duration: 6000 }
        );
        setIsPosting(false);
        if (includesYouTube) setYoutubeUpload({ status: "idle", message: "" });
        return;
      }

      const detectedMediaType = uploadedMediaUrl ? (hasVideo ? "video" : "image") : null;

      // Create post records for each platform
      const postRecords = selectedPlatforms.map((platform) => ({
        user_id: user.id,
        platform,
        content: postContent.trim(),
        media_url: uploadedMediaUrl,
        media_type: detectedMediaType,
        post_type: detectedMediaType || "text",
        status: "pending",
      }));

      const { error: insertError } = await supabase
        .from("social_media_posts")
        .insert(postRecords);

      if (insertError) throw insertError;

      // Invoke edge function for auto-posting
      const { data, error } = await supabase.functions.invoke("post-to-social", {
        body: {
          platforms: selectedPlatforms,
          content: postContent.trim(),
          mediaUrl: uploadedMediaUrl,
        },
      });

      if (error) {
        console.error("Auto-post error:", error);
        toast.warning("Posts saved but auto-posting requires platform API setup. Check API Setup for credentials.");
        if (includesYouTube) {
          setYoutubeUpload({ status: "error", message: error.message || "Edge function error" });
        }
      } else if (data?.results) {
        const succeeded = data.results.filter((r: any) => r.success).length;
        const failed = data.results.filter((r: any) => !r.success).length;
        if (failed === 0) {
          toast.success(`Posted to ${succeeded} platform${succeeded > 1 ? "s" : ""} successfully!`);
        } else {
          toast.warning(`${succeeded} succeeded, ${failed} failed. Check post history for details.`);
        }

        if (includesYouTube) {
          const yt = data.results.find((r: any) => r.platform === "youtube");
          if (yt?.success && yt.postId) {
            setYoutubeUpload({
              status: "success",
              message: `Video uploaded to YouTube successfully.`,
              videoId: yt.postId,
            });
          } else {
            setYoutubeUpload({
              status: "error",
              message: yt?.error || "YouTube upload failed (no details returned)",
            });
          }
        }
      } else {
        toast.success("Posts queued successfully!");
        if (includesYouTube) setYoutubeUpload({ status: "idle", message: "" });
      }

      resetForm();
      fetchData();
    } catch (err) {
      console.error("Post error:", err);
      toast.error("Failed to create post", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      if (includesYouTube) {
        setYoutubeUpload({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    }
    setIsPosting(false);
  };

  const resetForm = () => {
    setPostContent("");
    setSelectedPlatforms([]);
    setSelectedTemplate("");
    setMediaUrl(null);
    setMediaFile(null);
    setMediaPreview(null);
    setImagePrompt("");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "posted":
        return <Badge className="bg-green-500/10 text-green-600 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Posted</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlatformIcon = (platform: string) => {
    const p = PLATFORMS.find((pl) => pl.id === platform);
    if (!p) return null;
    const Icon = p.icon;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Social Media</h1>
          <p className="text-muted-foreground">Create and auto-post content to multiple social platforms</p>
        </div>
        <Button onClick={() => setMetaTemplateOpen(true)} className="gap-2">
          <Send className="h-4 w-4" />
          Create Meta Template
        </Button>
      </div>
      <CreateMetaTemplateDialog open={metaTemplateOpen} onOpenChange={setMetaTemplateOpen} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="create">Create Post</TabsTrigger>
          <TabsTrigger value="feed">Live Feed</TabsTrigger>
          <TabsTrigger value="history">Post History</TabsTrigger>
          <TabsTrigger value="configure" className="flex items-center gap-1">
            <Settings className="h-3 w-3" />
            Configure Platforms
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed">
          <LiveFeed />
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Post Creator */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Share2 className="h-5 w-5" />
                  Create Post
                </CardTitle>
                <CardDescription>Compose content and select platforms for auto-posting</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Template selector */}
                <div className="space-y-2">
                  <Label>Use Template (Optional)</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a saved template" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {templates.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No saved templates. Create one in AI Template page.
                        </div>
                      ) : (
                        templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="flex items-center gap-2">
                              <FileText className="h-3 w-3" />
                              {t.name}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Post content */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="post-content" className="font-semibold">Post Content</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateAIPrompt}
                      disabled={isGeneratingPrompt}
                      className="gap-1.5 text-xs"
                    >
                      {isGeneratingPrompt ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Generate AI Video Prompt
                    </Button>
                  </div>
                  <Textarea
                    id="post-content"
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Write your social media post content or click Generate AI Video Prompt..."
                    rows={5}
                  />
                  <div className="flex items-center justify-end text-xs text-muted-foreground">
                    <span>{postContent.length} characters</span>
                  </div>
                </div>

                {/* Platform selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Select Platforms</Label>
                    <Button variant="ghost" size="sm" onClick={handleSelectAllPlatforms}>
                      {selectedPlatforms.length === PLATFORMS.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {PLATFORMS.map((platform) => {
                      const isSelected = selectedPlatforms.includes(platform.id);
                      const Icon = platform.icon;
                      return (
                        <button
                          key={platform.id}
                          onClick={() => handlePlatformToggle(platform.id)}
                          className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${isSelected
                              ? "border-primary bg-accent"
                              : "border-border hover:border-muted-foreground/30"
                            }`}
                        >
                          <Icon className={`h-6 w-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-xs font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                            {platform.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedPlatforms.includes("instagram") &&
                  ((mediaFile && (mediaFile.name.toLowerCase().endsWith(".webm") || mediaFile.type.includes("webm"))) ||
                    (mediaUrl && mediaUrl.toLowerCase().includes(".webm"))) && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <strong>Instagram requires MP4:</strong> WebM videos cannot be posted to Instagram Reels. Switch provider to Pexels to generate an MP4, or deselect Instagram.
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/20"
                        onClick={() => setSelectedPlatforms((prev) => prev.filter((p) => p !== "instagram"))}
                      >
                        Deselect Instagram
                      </Button>
                    </div>
                  )}

                {/* Post button */}
                <Button
                  onClick={handlePost}
                  disabled={isPosting || !postContent.trim() || selectedPlatforms.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {isPosting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {isPosting
                    ? "Posting..."
                    : `Post to ${selectedPlatforms.length} Platform${selectedPlatforms.length !== 1 ? "s" : ""}`}
                </Button>

                {/* YouTube upload progress / result */}
                {youtubeUpload.status !== "idle" && (
                  <div
                    className={`mt-3 rounded-lg border p-3 text-sm flex items-start gap-2 ${youtubeUpload.status === "uploading"
                        ? "border-blue-200 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                        : youtubeUpload.status === "success"
                          ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200"
                          : "border-destructive/30 bg-destructive/10 text-destructive"
                      }`}
                  >
                    {youtubeUpload.status === "uploading" && <Loader2 className="h-4 w-4 mt-0.5 animate-spin shrink-0" />}
                    {youtubeUpload.status === "success" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                    {youtubeUpload.status === "error" && <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {youtubeUpload.status === "uploading" && "YouTube: Uploading…"}
                        {youtubeUpload.status === "success" && "YouTube: Upload complete"}
                        {youtubeUpload.status === "error" && "YouTube: Upload failed"}
                      </div>
                      <div className="text-xs opacity-90 break-words">{youtubeUpload.message}</div>
                      {youtubeUpload.status === "success" && youtubeUpload.videoId && (
                        <div className="mt-1 text-xs">
                          Video ID: <code className="bg-background/60 px-1.5 py-0.5 rounded">{youtubeUpload.videoId}</code>
                          {" — "}
                          <a
                            href={`https://www.youtube.com/watch?v=${youtubeUpload.videoId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline font-medium"
                          >
                            Open on YouTube
                          </a>
                        </div>
                      )}
                      {(youtubeUpload.status === "success" || youtubeUpload.status === "error") && (
                        <button
                          type="button"
                          onClick={() => setYoutubeUpload({ status: "idle", message: "" })}
                          className="mt-1 text-xs underline opacity-80 hover:opacity-100"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Media & Image Panel */}
            <div className="space-y-4">
              {/* Media Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Image className="h-4 w-4" />
                    Media
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mediaPreview ? (
                    <div className="relative">
                      {isVideoFile(mediaFile) || (mediaPreview && !mediaPreview.startsWith("data:image") && isVideoUrl(mediaPreview)) ? (
                        <video
                          src={mediaPreview}
                          controls
                          className="w-full rounded-lg border max-h-48"
                        />
                      ) : (
                        <img
                          src={mediaPreview}
                          alt="Preview"
                          className="w-full rounded-lg border object-cover max-h-48"
                        />
                      )}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        {latestVoiceAudio && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 gap-1 text-xs bg-background/85 backdrop-blur-sm shadow-sm"
                            onClick={handleDownloadVoice}
                            title="Download voiceover audio (.mp3)"
                          >
                            <Download className="h-3.5 w-3.5 text-primary" />
                            Voice (.mp3)
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setMediaPreview(null);
                            setMediaFile(null);
                            setMediaUrl(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition-colors hover:border-primary/50">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload Image, Video, or Poster</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or generate with AI</span>
                    </div>

                    {/* ElevenLabs permissions checklist */}
                    <div className="rounded-md bg-muted/40 p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] font-medium">ElevenLabs permissions</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={handleCheckElevenPermissions}
                          disabled={isCheckingPerms}
                        >
                          {isCheckingPerms ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : null}
                          {elevenPerms ? "Re-check" : "Check now"}
                        </Button>
                      </div>
                      <ul className="space-y-1 text-[11px]">
                        <li className="flex items-start gap-1.5">
                          {elevenPerms == null ? (
                            <span className="mt-0.5 inline-block h-3 w-3 rounded-full border border-muted-foreground/40" />
                          ) : elevenPerms.tts ? (
                            <CheckCircle2 className="mt-0.5 h-3 w-3 text-success" />
                          ) : (
                            <XCircle className="mt-0.5 h-3 w-3 text-destructive" />
                          )}
                          <div className="flex-1">
                            <span className={elevenPerms && !elevenPerms.tts ? "text-destructive" : ""}>Text to Speech</span>
                            {elevenPerms?.ttsError && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{elevenPerms.ttsError}</p>
                            )}
                          </div>
                        </li>
                        <li className="flex items-start gap-1.5">
                          {elevenPerms == null ? (
                            <span className="mt-0.5 inline-block h-3 w-3 rounded-full border border-muted-foreground/40" />
                          ) : elevenPerms.music ? (
                            <CheckCircle2 className="mt-0.5 h-3 w-3 text-success" />
                          ) : (
                            <span className="mt-0.5 inline-block h-3 w-3 text-center text-[10px] font-bold text-amber-500">ℹ</span>
                          )}
                          <div className="flex-1">
                            <span className={elevenPerms && !elevenPerms.music ? "text-amber-600 dark:text-amber-400" : ""}>
                              Music generation <span className="text-[10px] font-normal text-muted-foreground">(Optional • Paid plan)</span>
                            </span>
                            {elevenPerms?.musicError && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{elevenPerms.musicError}</p>
                            )}
                          </div>
                        </li>
                      </ul>
                      {elevenPerms && !elevenPerms.tts && (
                        <a
                          href="https://elevenlabs.io/app/settings/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Enable missing permissions in ElevenLabs
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="Describe the image or video to generate..."
                      rows={3}
                    />
                    <Select value={promptLanguage} onValueChange={(v) => setPromptLanguage(v as any)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Prompt Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="hindi">Hindi (हिंदी)</SelectItem>
                        <SelectItem value="hinglish">Hinglish</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={handleGenerateAIPrompt}
                      disabled={isGeneratingPrompt}
                    >
                      {isGeneratingPrompt ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-3 w-3" />
                      )}
                      Generate AI Video Prompt
                    </Button>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Image & Video AI Provider</Label>
                        {imageProvider === "pollinations" && (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800">
                            {hasPollinationsKey ? "Active (API)" : "Free HD"}
                          </Badge>
                        )}
                        {imageProvider === "nvidia" && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200">
                            {availableKeys.nvidia_api_key ? "Active" : "Free FLUX.1"}
                          </Badge>
                        )}
                        {imageProvider === "stability" && (
                          <Badge variant="outline" className={`text-[10px] ${availableKeys.stability_api_key ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" : "bg-muted text-muted-foreground"}`}>
                            {availableKeys.stability_api_key ? "Active" : "Key Needed"}
                          </Badge>
                        )}
                      </div>
                      <Select value={imageProvider} onValueChange={setImageProvider}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select AI Provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automatic (Fallback: NVIDIA → Pollinations → Shree AI)</SelectItem>
                          <SelectItem value="pollinations">
                            Pollinations.ai (HD Models) {hasPollinationsKey ? "• Active (API)" : "• Free HD"}
                          </SelectItem>
                          <SelectItem value="nvidia">
                            NVIDIA NIM (FLUX Commercial HD) {availableKeys.nvidia_api_key ? "• Active" : ""}
                          </SelectItem>
                          <SelectItem value="stability">
                            Stability AI (SDXL / SD3) {availableKeys.stability_api_key ? "• Active" : ""}
                          </SelectItem>
                          <SelectItem value="leonardo">
                            Leonardo AI {availableKeys.leonardo_api_key ? "• Active" : ""}
                          </SelectItem>
                          <SelectItem value="cosmos">NVIDIA Cosmos (Video / Foundation)</SelectItem>
                          <SelectItem value="pexels">Pexels (Stock Video & Photo)</SelectItem>
                          <SelectItem value="lovable_ai">Shree AI Engine (Built-in Gemini)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Pollinations HD Model Selector */}
                    {imageProvider === "pollinations" && (
                      <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                            Pollinations HD Quality Model
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800"
                          >
                            {hasPollinationsKey ? "API Key Active" : "Free HD"}
                          </Badge>
                        </div>
                        <Select
                          value={activePollinationsModel}
                          onValueChange={setSelectedPollinationsModel}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue placeholder="Select Pollinations HD Model" />
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
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <span className="font-medium text-xs">{model.label}</span>
                                    {model.supportsTypography && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">
                                        Typography
                                      </Badge>
                                    )}
                                    {!available && (
                                      <span className="text-[10px] text-destructive ml-auto">Key required</span>
                                    )}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          {hasPollinationsKey
                            ? "Using your Pollinations API key for prioritized generation and full model catalog access (Flux, Gemini Pro, Ideogram)."
                            : "Using free HD models. For Ideogram text, FLUX.2 Pro, and typography models, enter a Pollinations API key in API Setup."}
                        </p>
                      </div>
                    )}

                    {/* Stability AI Info Panel */}
                    {imageProvider === "stability" && (
                      <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-xs">Stability AI (SDXL / SD3)</span>
                          {availableKeys.stability_api_key ? (
                            <Badge className="text-[10px] bg-emerald-600 text-white">Active ✓</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">Key not configured</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          High-resolution commercial social post graphics and marketing visuals generated with Stability SDXL / SD3.
                        </p>
                      </div>
                    )}

                    {/* Leonardo AI Info Panel */}
                    {imageProvider === "leonardo" && (
                      <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-xs">Leonardo AI</span>
                          {availableKeys.leonardo_api_key ? (
                            <Badge className="text-[10px] bg-emerald-600 text-white">Active ✓</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">Key not configured</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Photorealistic and creative artistic imagery tailored for social campaigns.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                      <span>Configure Pollinations, NVIDIA, or Stability keys:</span>
                      <a href="/api-setup" className="text-primary hover:underline font-medium">
                        API Setup &rarr;
                      </a>
                    </div>
                    {imageProvider === "nvidia" && (
                      <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            NVIDIA image model access
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => handleCheckNvidiaImageAccess(true)}
                            disabled={nvidiaChecking}
                          >
                            {nvidiaChecking && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {nvidiaResults ? "Re-check" : "Check"}
                          </Button>
                        </div>
                        {nvidiaResults && (
                          <>
                            <ul className="space-y-1">
                              {nvidiaResults.map((result) => (
                                <li key={result.id} className="flex items-start gap-1.5">
                                  {result.access === "granted" ? (
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-success" />
                                  ) : (
                                    <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
                                  )}
                                  <span className="flex-1">
                                    <span className="font-mono text-[11px]">{result.label}</span>
                                    <span className="block text-[10px] text-muted-foreground">{result.reason}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {hasNvidiaFluxAccess(nvidiaResults) ? (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ NVIDIA FLUX model access is verified and ready.
                              </p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground">
                                Images will use Pollinations AI fallback when NVIDIA is unavailable.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {(imageProvider === "nvidia" || imageProvider === "cosmos") && (
                      <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            {imageProvider === "cosmos" ? "NVIDIA Cosmos Video Engine" : "NVIDIA Cosmos video model access"}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => handleCheckNvidiaVideoAccess(true)}
                            disabled={nvidiaVideoChecking}
                          >
                            {nvidiaVideoChecking && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {nvidiaVideoResults ? "Re-check" : "Check"}
                          </Button>
                        </div>
                        {nvidiaVideoResults ? (
                          <>
                            <ul className="space-y-1">
                              {nvidiaVideoResults.map((result) => (
                                <li key={result.id} className="flex items-start gap-1.5">
                                  {result.access === "granted" ? (
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-success" />
                                  ) : (
                                    <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
                                  )}
                                  <span className="flex-1">
                                    <span className="font-mono text-[11px]">{result.label}</span>
                                    <span className="block text-[10px] text-muted-foreground">{result.reason}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <div className="rounded border border-border/60 bg-muted/50 p-2 text-[10px] text-muted-foreground space-y-1">
                              <p className="font-medium text-foreground">Cosmos Video Generation Ready:</p>
                              <p>
                                Cloud NIM endpoints require self-hosted DGX/GPU Docker containers. Promo videos are automatically synthesized using ultra-high-definition AI frames with NVIDIA FLUX / Pollinations HD and rendered with smooth animated Ken Burns motion effects.
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="rounded border border-border/60 bg-muted/50 p-2 text-[10px] text-muted-foreground space-y-1">
                            <p className="font-medium text-foreground">Cosmos Video Generation Engine:</p>
                            <p>
                              Generates high-definition marketing visuals with NVIDIA FLUX and converts them into cinematic promo videos with smooth motion effects, custom voiceover, and background music.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleGenerateImage}
                        disabled={isGeneratingImage || isGeneratingVideo || nvidiaChecking || !imagePrompt.trim()}
                      >
                        {isGeneratingImage ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-3 w-3" />
                        )}
                        Image
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleGeneratePromoVideo}
                        disabled={
                          isGeneratingVideo ||
                          isGeneratingImage ||
                          nvidiaChecking ||
                          nvidiaVideoChecking ||
                          !imagePrompt.trim()
                        }
                      >
                        {isGeneratingVideo ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Film className="mr-2 h-3 w-3" />
                        )}
                        Promo Video
                      </Button>
                    </div>
                    <div className="space-y-1.5 rounded-md border border-dashed border-muted-foreground/25 p-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Voiceover script</Label>
                        <button
                          type="button"
                          className="text-[10px] text-primary hover:underline disabled:opacity-50"
                          disabled={!postContent.trim()}
                          onClick={() => setVoiceoverText(postContent)}
                        >
                          Use post content
                        </button>
                      </div>
                      <Textarea
                        value={voiceoverText}
                        onChange={(e) => setVoiceoverText(e.target.value)}
                        placeholder="What should the AI voice say in the video? (defaults to post content if blank)"
                        rows={3}
                        className="text-xs"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">
                          {voiceoverText.trim().length}/1500 chars
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={handlePreviewVoiceover}
                            disabled={isPreviewingVoice}
                            title="Preview voiceover audio"
                          >
                            {isPreviewingVoice ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Volume2 className="mr-1 h-3 w-3" />
                            )}
                            Preview
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1 font-semibold"
                            onClick={handleDownloadVoice}
                            disabled={isDownloadingVoice}
                            title="Generate and download voiceover audio (.mp3)"
                          >
                            {isDownloadingVoice ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="mr-1 h-3 w-3" />
                            )}
                            Download Voice
                          </Button>
                        </div>
                      </div>

                      {latestVoiceAudio && (
                        <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1.5 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Volume2 className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="font-medium text-[11px] truncate text-primary">
                              Voice audio ready ({Math.max(1, Math.round((latestVoiceAudio.length * 0.75) / 1024))} KB)
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => {
                                try {
                                  if (voicePreviewAudioRef.current) {
                                    voicePreviewAudioRef.current.pause();
                                  }
                                  const audio = new Audio(`data:audio/mpeg;base64,${latestVoiceAudio}`);
                                  voicePreviewAudioRef.current = audio;
                                  audio.play().catch((err) => console.error("Playback error:", err));
                                } catch (e) {
                                  console.error("Audio error:", e);
                                }
                              }}
                            >
                              Play
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-6 px-2 text-[11px] gap-1 font-medium bg-primary/15 hover:bg-primary/25 text-primary"
                              onClick={() => downloadAudioBase64(latestVoiceAudio, `voiceover-${Date.now()}.mp3`)}
                              title="Save .mp3 to your computer"
                            >
                              <Download className="h-3 w-3" />
                              Save .mp3
                            </Button>
                          </div>
                        </div>
                      )}

                      {quotaExceededInfo && (
                        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-950 dark:text-amber-200">
                          <div className="flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-[11px]">
                                ElevenLabs Quota Exceeded ({quotaExceededInfo.remaining} credits remaining)
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Download full audio via backup engine or configure keys in ElevenLabs Setup.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button
                              type="button"
                              size="sm"
                              className="h-6 px-2 text-[11px] font-semibold"
                              onClick={() => handleDownloadVoice(true)}
                              disabled={isDownloadingVoice}
                              title="Download complete voiceover using free backup engine"
                            >
                              {isDownloadingVoice ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
                              Download Full Voice (Backup)
                            </Button>
                            <a
                              href="/elevenlabs"
                              className="inline-flex h-6 items-center justify-center rounded border border-amber-500/50 bg-background/80 px-2 text-[10px] font-medium hover:bg-accent"
                            >
                              Setup &rarr;
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full bg-gradient-to-r from-primary to-primary/80"
                      onClick={handleGenerateAIVideoWithAudio}
                      disabled={isGeneratingVideoAudio || isGeneratingImage || isGeneratingVideo || nvidiaChecking || !imagePrompt.trim()}
                    >
                      {isGeneratingVideoAudio ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Video className="mr-2 h-3 w-3" />
                      )}
                      AI Video with Audio (Voice + Music)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-accent/50 p-3 text-center">
                      <p className="text-2xl font-bold text-primary">{posts.length}</p>
                      <p className="text-xs text-muted-foreground">Total Posts</p>
                    </div>
                    <div className="rounded-lg bg-accent/50 p-3 text-center">
                      <p className="text-2xl font-bold text-primary">
                        {posts.filter((p) => p.status === "posted").length}
                      </p>
                      <p className="text-xs text-muted-foreground">Successful</p>
                    </div>
                    <div className="rounded-lg bg-accent/50 p-3 text-center">
                      <p className="text-2xl font-bold text-primary">
                        {new Set(posts.map((p) => p.platform)).size}
                      </p>
                      <p className="text-xs text-muted-foreground">Platforms</p>
                    </div>
                    <div className="rounded-lg bg-accent/50 p-3 text-center">
                      <p className="text-2xl font-bold text-primary">{templates.length}</p>
                      <p className="text-xs text-muted-foreground">Templates</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Post History</CardTitle>
              <CardDescription>Track all your social media posts and their status</CardDescription>
            </CardHeader>
            <CardContent>
              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Share2 className="h-12 w-12 mb-3 opacity-50" />
                  <p>No posts yet. Create your first social media post!</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b flex-wrap">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all-posts"
                        checked={posts.length > 0 && selectedPostIds.size === posts.length}
                        onCheckedChange={toggleSelectAllPosts}
                      />
                      <Label htmlFor="select-all-posts" className="text-sm cursor-pointer">
                        {selectedPostIds.size > 0
                          ? `${selectedPostIds.size} selected`
                          : "Select all"}
                      </Label>
                    </div>
                    {selectedPostIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={handleBulkRepost}
                          disabled={isBulkActioning}
                        >
                          {isBulkActioning ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Repost selected
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={handleBulkDelete}
                          disabled={isBulkActioning}
                        >
                          {isBulkActioning ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Delete selected
                        </Button>
                      </div>
                    )}
                  </div>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {posts.map((post) => (
                        <div key={post.id} className="flex items-start gap-3 rounded-lg border p-4">
                          <div className="flex-shrink-0 mt-1">
                            <Checkbox
                              checked={selectedPostIds.has(post.id)}
                              onCheckedChange={() => togglePostSelection(post.id)}
                              aria-label="Select post"
                            />
                          </div>
                          <div className="flex-shrink-0 mt-1">
                            {getPlatformIcon(post.platform)}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="capitalize">{post.platform}</Badge>
                              {getStatusBadge(post.status)}
                            </div>
                            <p className="text-sm line-clamp-2">{post.content}</p>
                            {post.media_url && (
                              <div className="space-y-1">
                                {post.media_type === "video" || isVideoUrl(post.media_url) ? (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Video className="h-3 w-3" />
                                    <span>Video attached</span>
                                    <video
                                      src={post.media_url}
                                      controls
                                      className="w-full max-w-xs rounded-md border mt-1 max-h-32"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Image className="h-3 w-3" />
                                    <span>Image attached</span>
                                    <img
                                      src={post.media_url}
                                      alt="Post media"
                                      className="w-16 h-16 rounded-md border object-cover ml-2"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {post.error_message && (
                              <p className="text-xs text-destructive">{post.error_message}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                {post.created_at && (
                                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                                )}
                                {(post.likes_count ?? 0) > 0 && <span>❤️ {post.likes_count}</span>}
                                {(post.comments_count ?? 0) > 0 && <span>💬 {post.comments_count}</span>}
                                {(post.views_count ?? 0) > 0 && (
                                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.views_count}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1"
                                  onClick={() => handleRepostPost(post)}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Repost
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeletePost(post.id)}
                                  disabled={deletingPostId === post.id}
                                >
                                  {deletingPostId === post.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configure" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configure Platforms
              </CardTitle>
              <CardDescription>
                Add your API credentials for each social media platform to enable auto-posting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PLATFORM_CONFIGS.map((platform) => {
                const Icon = platform.icon;
                const isExpanded = expandedPlatform === platform.id;
                const configured = isPlatformConfigured(platform.id);

                return (
                  <div
                    key={platform.id}
                    className="rounded-lg border transition-all"
                  >
                    <button
                      onClick={() => setExpandedPlatform(isExpanded ? null : platform.id)}
                      className="flex w-full items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${configured ? 'bg-primary/10' : 'bg-muted'}`}>
                          <Icon className={`h-5 w-5 ${configured ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{platform.label}</p>
                          <p className="text-xs text-muted-foreground">{platform.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {configured ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Configured
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not configured</Badge>
                        )}
                        <span className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t px-4 pb-4 pt-3 space-y-3">
                        {platform.note && (
                          <p className="text-sm text-muted-foreground bg-accent/50 rounded-md p-2">
                            ℹ️ {platform.note}
                          </p>
                        )}

                        {platform.fields.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No credentials to configure yet.</p>
                        ) : (
                          <>
                            {platform.fields.map((field) => (
                              <div key={field.key} className="space-y-1">
                                <Label htmlFor={field.key} className="text-sm">{field.label}</Label>
                                <div className="relative">
                                  <Input
                                    id={field.key}
                                    type={field.secret && !visibleFields.has(field.key) ? "password" : "text"}
                                    value={(credentials as any)?.[field.key] || ""}
                                    onChange={(e) => {
                                      setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }));
                                      if (platform.id === "youtube" && youtubeErrors[field.key]) {
                                        setYoutubeErrors((prev) => { const n = { ...prev }; delete n[field.key]; return n; });
                                      }
                                    }}
                                    placeholder={field.placeholder}
                                    className={`pr-10 ${platform.id === "youtube" && youtubeErrors[field.key] ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                  />
                                  {field.secret && (
                                    <button
                                      type="button"
                                      onClick={() => toggleFieldVisibility(field.key)}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                      {visibleFields.has(field.key) ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <EyeIcon className="h-4 w-4" />
                                      )}
                                    </button>
                                  )}
                                </div>
                                {platform.id === "youtube" && youtubeErrors[field.key] && (
                                  <p className="text-xs text-destructive">{youtubeErrors[field.key]}</p>
                                )}
                              </div>
                            ))}

                            {platform.id === "facebook" && (
                              <div className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAutoFetchFacebookPages}
                                    disabled={isFetchingFacebookPages}
                                    className="gap-2 border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  >
                                    {isFetchingFacebookPages ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    Auto-Detect My Facebook Pages
                                  </Button>
                                  <span className="text-xs text-muted-foreground">
                                    Paste token above, then click to auto-fetch your real Page ID & Page Token.
                                  </span>
                                </div>

                                {discoveredPages.length > 0 && (
                                  <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                                    <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                      Select your Facebook Page to auto-fill:
                                    </Label>
                                    <div className="grid gap-2">
                                      {discoveredPages.map((pg) => {
                                        const isCurrent = credentials.facebook_page_id === pg.id;
                                        return (
                                          <button
                                            type="button"
                                            key={pg.id}
                                            onClick={() => handleSelectFacebookPage(pg)}
                                            className={`flex items-center justify-between rounded-md border p-2.5 text-left text-xs transition-colors ${isCurrent
                                                ? "border-emerald-500 bg-emerald-500/15"
                                                : "border-border hover:border-emerald-500/50 hover:bg-accent"
                                              }`}
                                          >
                                            <div>
                                              <div className="font-semibold text-sm">{pg.name}</div>
                                              <div className="text-xs text-muted-foreground">
                                                Page ID: <code className="font-mono">{pg.id}</code> • {pg.category}
                                              </div>
                                            </div>
                                            <Badge
                                              variant={isCurrent ? "default" : "outline"}
                                              className={isCurrent ? "bg-emerald-600 text-white" : ""}
                                            >
                                              {isCurrent ? "Selected ✓" : "Use This Page"}
                                            </Badge>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {platform.id === "youtube" && (
                              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleTestYouTubeFields}
                                    disabled={youtubeFieldTest.status === "testing"}
                                  >
                                    {youtubeFieldTest.status === "testing" ? (
                                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="mr-2 h-3 w-3" />
                                    )}
                                    {youtubeFieldTest.status === "testing" ? "Testing…" : "Test Connection"}
                                  </Button>
                                  <span className="text-xs text-muted-foreground">
                                    Verifies the Channel ID against the OAuth Access Token (no save needed).
                                  </span>
                                </div>
                                {youtubeFieldTest.status === "success" && (
                                  <div className="flex items-start gap-2 rounded-md border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-700 dark:text-green-400">
                                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{youtubeFieldTest.message}</span>
                                  </div>
                                )}
                                {youtubeFieldTest.status === "error" && (
                                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span className="break-words">{youtubeFieldTest.message}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex gap-2 mt-2">
                              <Button
                                onClick={() => handleSaveCredentials(platform.id)}
                                disabled={isSavingCredentials}
                                size="sm"
                              >
                                {isSavingCredentials ? (
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="mr-2 h-3 w-3" />
                                )}
                                Save
                              </Button>
                              {(() => {
                                const cd = quotaCooldowns[platform.id];
                                const cooling = !!cd && cd > now;
                                const queued = retryQueue.includes(platform.id);
                                return (
                                  <>
                                    <Button
                                      variant="outline"
                                      onClick={() => handleTestConnection(platform.id)}
                                      disabled={testingPlatform === platform.id || !configured || cooling || refreshingPlatform === platform.id}
                                      size="sm"
                                      title={cooling ? `Quota cooldown — resets in ${formatRemaining(cd - now)}` : undefined}
                                    >
                                      {testingPlatform === platform.id || refreshingPlatform === platform.id ? (
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="mr-2 h-3 w-3" />
                                      )}
                                      {refreshingPlatform === platform.id
                                        ? "Refreshing token…"
                                        : testingPlatform === platform.id && platform.id === "youtube"
                                          ? "Testing… (auto-refresh)"
                                          : cooling
                                            ? `Quota — ${formatRemaining(cd - now)}`
                                            : "Test Connection"}
                                    </Button>
                                    {cooling && (
                                      <Button
                                        variant={queued ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => toggleAutoRetry(platform.id)}
                                        title={queued ? "Auto-retry enabled — will run when quota resets" : "Queue an automatic retry when quota resets"}
                                      >
                                        {queued ? "Auto-retry on ✓" : "Auto-retry"}
                                      </Button>
                                    )}
                                    {platform.id === "youtube" && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleReconnectYouTube}
                                        title="Re-authorize with Google to issue a new refresh token"
                                      >
                                        Reconnect YouTube
                                      </Button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
