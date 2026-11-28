import { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  Image as ImageIcon,
  Video as VideoIcon,
  Sparkles,
  Download,
  Share2,
  RefreshCw,
  Trash2,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  Eye,
  Film,
  Camera,
  Layers,
  History,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateVideoFromImage,
  type MotionStyle,
  type CameraMovement,
} from "@/lib/imageToVideoEngine";
import {
  saveVideoGeneration,
  uploadCustomImageToStorage,
  fetchVideoGenerationsHistory,
  type VideoGenerationRecord,
} from "@/lib/videoGenerations";
import DirectSocialPostDialog from "@/components/social/DirectSocialPostDialog";

interface CustomImageToVideoProps {
  onBackToTemplates?: () => void;
  availableKeys?: Record<string, boolean>;
}

const MOTION_STYLES: { id: MotionStyle; label: string; desc: string }[] = [
  { id: "Cinematic", label: "Cinematic", desc: "Film lighting & anamorphic depth" },
  { id: "Realistic", label: "Realistic", desc: "Natural commercial realism" },
  { id: "Smooth Animation", label: "Smooth Animation", desc: "Silk cubic easing transition" },
  { id: "Product Showcase", label: "Product Showcase", desc: "Studio glare & focus sweep" },
  { id: "3D Motion", label: "3D Motion", desc: "Parallax depth & perspective" },
  { id: "Slow Motion", label: "Slow Motion", desc: "Elegant deceleration" },
  { id: "Professional Advertisement", label: "Professional Ad", desc: "High-impact retail commercial" },
];

const CAMERA_MOVEMENTS: { id: CameraMovement; label: string; desc: string }[] = [
  { id: "Zoom In", label: "Zoom In", desc: "Forward push into subject" },
  { id: "Zoom Out", label: "Zoom Out", desc: "Reverse reveal shot" },
  { id: "Pan Left", label: "Pan Left", desc: "Glide camera right to left" },
  { id: "Pan Right", label: "Pan Right", desc: "Glide camera left to right" },
  { id: "Rotate", label: "Rotate", desc: "Dynamic cinematic tilt" },
  { id: "Tracking Shot", label: "Tracking Shot", desc: "Curved dolly & crane move" },
  { id: "Static Camera", label: "Static Camera", desc: "Subtle ambient breathing" },
];

const QUICK_PROMPTS = [
  "Cinematic 360 commercial product showcase with dynamic studio lighting and soft shadows",
  "Smooth camera zoom in revealing high-end product details with elegant motion",
  "Modern retail promotion with clean glint highlights and commercial camera tracking",
  "Slow-motion atmospheric product hero shot with luxury commercial lighting",
];

export default function CustomImageToVideo({ onBackToTemplates, availableKeys = {} }: CustomImageToVideoProps) {
  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [imageMetadata, setImageMetadata] = useState<{
    name: string;
    sizeKb: number;
    width: number;
    height: number;
  } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Video generation controls
  const [videoPrompt, setVideoPrompt] = useState<string>(
    "Cinematic commercial product showcase with dynamic lighting and camera motion"
  );
  const [duration, setDuration] = useState<number>(5);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [motionStyle, setMotionStyle] = useState<MotionStyle>("Cinematic");
  const [cameraMovement, setCameraMovement] = useState<CameraMovement>("Zoom In");
  const [selectedProvider, setSelectedProvider] = useState<string>("auto");

  // Output video state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatusText, setGenerationStatusText] = useState("");
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedVideoBlob, setGeneratedVideoBlob] = useState<Blob | null>(null);

  // Social share dialog
  const [isSocialPostOpen, setIsSocialPostOpen] = useState(false);

  // Generation history
  const [historyList, setHistoryList] = useState<VideoGenerationRecord[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.playbackRate = 1.0;
      videoPlayerRef.current.defaultPlaybackRate = 1.0;
    }
  }, [generatedVideoUrl]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const list = await fetchVideoGenerationsHistory();
    setHistoryList(list);
  };

  // ---------------------------------------------------------------------------
  // Image Upload & Validation
  // ---------------------------------------------------------------------------
  const handleFileSelect = async (file: File) => {
    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      toast.error("Unsupported file type. Please upload a JPG, JPEG, PNG, or WEBP image.");
      return;
    }

    // Validate size (max 25MB)
    const maxBytes = 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(`Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 25 MB.`);
      return;
    }

    setSelectedFile(file);
    setIsUploadingImage(true);
    setUploadProgress(10);

    try {
      // Local preview & dimensions extraction
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImageMetadata({
          name: file.name,
          sizeKb: Math.round(file.size / 1024),
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
        setImagePreviewUrl(objectUrl);
        setUploadProgress(100);
        setIsUploadingImage(false);
        toast.success(`Image uploaded: ${file.name} (${img.naturalWidth}×${img.naturalHeight})`);
      };
      img.onerror = () => {
        setIsUploadingImage(false);
        toast.error("Failed to read image dimensions. Please try another image.");
      };
      img.src = objectUrl;
    } catch (err: unknown) {
      setIsUploadingImage(false);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Image upload failed: ${msg}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreviewUrl("");
    setImageMetadata(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.info("Image removed");
  };

  // ---------------------------------------------------------------------------
  // Video Generation Handler
  // ---------------------------------------------------------------------------
  const handleGenerateVideo = async () => {
    if (!imagePreviewUrl) {
      toast.error("Please upload an image first.");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(5);
    setGenerationStatusText("Preparing media and motion parameters...");

    try {
      let finalVideoUrl = "";
      let finalBlob: Blob | null = null;
      let usedProvider = selectedProvider;
      let usedModel = "Built-in High-Speed MP4";

      // Upload image to permanent storage if not already done
      let storedImageUrl = imagePreviewUrl;
      if (selectedFile) {
        try {
          setGenerationStatusText("Storing original image...");
          storedImageUrl = await uploadCustomImageToStorage(selectedFile, (p) => {
            setGenerationProgress(Math.min(20, Math.round(p * 0.2)));
          });
        } catch (uploadErr) {
          console.warn("Storage upload note (will continue with local preview):", uploadErr);
        }
      }

      // 1. If a cloud provider is selected or auto mode with cloud keys
      const hasCloudProvider =
        selectedProvider === "runway" ||
        selectedProvider === "veo" ||
        selectedProvider === "leonardo" ||
        selectedProvider === "sora" ||
        selectedProvider === "nvidia" ||
        selectedProvider === "pexels";

      if (hasCloudProvider || selectedProvider === "auto") {
        setGenerationStatusText(`Calling ${selectedProvider.toUpperCase()} image-to-video service...`);
        try {
          const { data: cloudRes, error: edgeErr } = await supabase.functions.invoke("image-to-video", {
            body: {
              prompt: videoPrompt,
              image: storedImageUrl,
              provider: selectedProvider,
              aspectRatio,
              durationSeconds: duration,
              motionStyle,
              cameraMovement,
            },
          });

          if (!edgeErr && cloudRes?.success && cloudRes?.videoUrl) {
            finalVideoUrl = cloudRes.videoUrl;
            usedProvider = cloudRes.provider || selectedProvider;
            usedModel = cloudRes.model || "Cloud AI Video";
            setGenerationProgress(100);
          } else if (cloudRes?.error) {
            const errorMsg = String(cloudRes.error);
            const isRestrictedOrSelfHosted =
              errorMsg.includes("allowlist") ||
              errorMsg.includes("self-hosted") ||
              errorMsg.includes("not hosted") ||
              errorMsg.includes("not found for API version") ||
              errorMsg.includes("not supported for predictLongRunning") ||
              errorMsg.includes("404");

            if (isRestrictedOrSelfHosted || selectedProvider === "auto") {
              toast.warning(
                `${selectedProvider === "veo" ? "Google Veo requires Vertex AI allowlist access" : selectedProvider === "nvidia" ? "NVIDIA Cosmos requires a self-hosted GPU container" : "Cloud video service unavailable"}. Rendering with Built-in High-Speed MP4 Engine...`,
                { duration: 6000 }
              );
              // Fall through to Client-side Motion & Camera Engine
            } else {
              throw new Error(cloudRes.error);
            }
          }
        } catch (cloudErr: unknown) {
          const errMsg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
          const isRestrictedOrSelfHosted =
            errMsg.includes("allowlist") ||
            errMsg.includes("self-hosted") ||
            errMsg.includes("not hosted") ||
            errMsg.includes("not found for API version") ||
            errMsg.includes("not supported for predictLongRunning") ||
            errMsg.includes("404");

          if (isRestrictedOrSelfHosted || selectedProvider === "auto") {
            toast.warning(
              `${selectedProvider === "veo" ? "Google Veo requires Vertex AI allowlist access" : selectedProvider === "nvidia" ? "NVIDIA Cosmos requires a self-hosted GPU container" : "Cloud video service unavailable"}. Rendering with Built-in High-Speed MP4 Engine...`,
              { duration: 6000 }
            );
          } else {
            throw cloudErr;
          }
        }
      }

      // 2. Client-side Motion & Camera Engine (high reliability fallback or when selected)
      if (!finalVideoUrl) {
        setGenerationStatusText("Generating motion frames with high-speed engine...");
        const result = await generateVideoFromImage({
          imageUrl: imagePreviewUrl,
          prompt: videoPrompt,
          durationSeconds: duration,
          aspectRatio,
          resolution,
          motionStyle,
          cameraMovement,
          onProgress: (pct, text) => {
            setGenerationProgress(pct);
            setGenerationStatusText(text);
          },
        });

        finalBlob = result.videoBlob;
        finalVideoUrl = result.videoUrl;
        usedProvider = "high_speed_mp4";
        usedModel = `${motionStyle} (${cameraMovement})`;
      }

      setGeneratedVideoBlob(finalBlob);
      setGeneratedVideoUrl(finalVideoUrl);

      // 3. Persist record to database
      await saveVideoGeneration({
        original_image_url: storedImageUrl,
        generated_video_url: finalVideoUrl,
        video_prompt: videoPrompt,
        provider: usedProvider,
        model: usedModel,
        duration,
        aspect_ratio: aspectRatio,
        motion_style: motionStyle,
        camera_movement: cameraMovement,
        generation_status: "completed",
      });

      await loadHistory();
      toast.success("Video generated successfully!");
    } catch (err: unknown) {
      console.error("Video generation error:", err);
      const msg = err instanceof Error ? err.message : "Failed to generate video from image.";
      toast.error(msg);
    } finally {
      setIsGenerating(false);
      setGenerationStatusText("");
    }
  };

  const handleDownloadMp4 = () => {
    if (!generatedVideoUrl) return;
    const a = document.createElement("a");
    a.href = generatedVideoUrl;
    a.download = `video_${motionStyle.toLowerCase().replace(/\s+/g, "_")}_${cameraMovement.toLowerCase().replace(/\s+/g, "_")}_${duration}s_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("MP4 video downloaded!");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Film className="h-5 w-5 text-purple-600" />
            Custom Image Upload & Image-to-Video Generation
          </h2>
          <p className="text-xs text-muted-foreground">
            Upload your real product photograph or retail poster, configure camera motion, and synthesize a high-definition MP4 promotional video.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="text-xs h-8"
          >
            <History className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            History ({historyList.length})
          </Button>
          {onBackToTemplates && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBackToTemplates}
              className="text-xs h-8"
            >
              Back to Templates
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid: Left Panel (Upload & Controls) | Right Panel (Preview & Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* =================================================================== */}
        {/* LEFT PANEL: Upload & Controls (7 cols on lg) */}
        {/* =================================================================== */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* 1. Custom Image Upload Zone */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <UploadCloud className="h-4 w-4 text-primary" />
                  1. Custom Image Upload
                </span>
                {imageMetadata && (
                  <Badge variant="outline" className="text-[10px] text-success border-success/30 font-mono">
                    <FileCheck className="h-3 w-3 mr-1" />
                    {imageMetadata.width} × {imageMetadata.height} px
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Select an image directly from your local computer or mobile device (JPG, JPEG, PNG, WEBP up to 25MB).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              {!imagePreviewUrl ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                    isDragOver
                      ? "border-primary bg-primary/10 scale-[1.01]"
                      : "border-muted-foreground/25 hover:border-primary/60 hover:bg-muted/40"
                  }`}
                >
                  <div className="p-3 bg-primary/10 rounded-full text-primary">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Click or Drag & Drop Image Here</p>
                    <p className="text-xs text-muted-foreground">
                      JPG, JPEG, PNG, or WEBP from local PC or mobile camera
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="secondary" className="mt-2 text-xs">
                    Choose Image File
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <div className="relative h-16 w-16 rounded-md overflow-hidden border bg-background shrink-0">
                      <img src={imagePreviewUrl} alt="Uploaded preview" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 text-xs space-y-0.5">
                      <p className="font-semibold text-foreground truncate">{imageMetadata?.name || "Uploaded Image"}</p>
                      <p className="text-muted-foreground text-[11px]">
                        Size: <span className="font-mono">{imageMetadata?.sizeKb || 0} KB</span> • Dimensions:{" "}
                        <span className="font-mono">{imageMetadata?.width} × {imageMetadata?.height}</span>
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Replace Image
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] px-2 text-destructive hover:bg-destructive/10"
                          onClick={handleRemoveImage}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isUploadingImage && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Processing image...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-1.5" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. Motion Prompt & Quick Prompts */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-purple-600" />
                2. Video Motion Prompt
              </CardTitle>
              <CardDescription className="text-xs">
                Describe how the camera should move, dynamic lighting, or effects you want to see.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Cinematic 360 degree commercial product showcase with dynamic studio lighting and camera tracking..."
                className="text-xs resize-none"
              />
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Quick Motion Ideas:</Label>
                <div className="flex flex-wrap gap-1">
                  {QUICK_PROMPTS.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setVideoPrompt(q)}
                      className="text-[10px] bg-muted/60 hover:bg-muted text-foreground border rounded px-2 py-0.5 text-left transition-colors"
                    >
                      {q.slice(0, 48)}...
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. Motion Style & Camera Movement */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Sliders className="h-4 w-4 text-indigo-600" />
                3. Camera Movement & Motion Style
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Motion Style Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    Motion Style
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-mono">{motionStyle}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {MOTION_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setMotionStyle(style.id)}
                      className={`text-left p-2 rounded-md border text-xs transition-colors ${
                        motionStyle === style.id
                          ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                          : "border-border hover:border-primary/40 text-muted-foreground bg-card"
                      }`}
                    >
                      <div className="font-medium text-[11px]">{style.label}</div>
                      <div className="text-[9px] opacity-75 truncate">{style.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Movement Selector */}
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-primary" />
                    Camera Movement
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-mono">{cameraMovement}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {CAMERA_MOVEMENTS.map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => setCameraMovement(cam.id)}
                      className={`text-left p-2 rounded-md border text-xs transition-colors ${
                        cameraMovement === cam.id
                          ? "border-purple-600 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold shadow-xs"
                          : "border-border hover:border-purple-500/40 text-muted-foreground bg-card"
                      }`}
                    >
                      <div className="font-medium text-[11px]">{cam.label}</div>
                      <div className="text-[9px] opacity-75 truncate">{cam.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration, Aspect Ratio, Resolution */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Duration</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {[5, 10, 15].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={`py-1 text-xs rounded border text-center font-medium ${
                          duration === d
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground bg-card"
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Aspect Ratio</Label>
                  <Select value={aspectRatio} onValueChange={(v: "9:16" | "16:9" | "1:1") => setAspectRatio(v)}>
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="9:16">9:16 (Reels/Shorts)</SelectItem>
                      <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                      <SelectItem value="1:1">1:1 (Square Feed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Resolution</Label>
                  <Select value={resolution} onValueChange={(v: "720p" | "1080p") => setResolution(v)}>
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p HD (Fast)</SelectItem>
                      <SelectItem value="1080p">1080p Full HD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Provider Selection */}
              <div className="space-y-1 pt-2 border-t">
                <Label className="text-[11px] text-muted-foreground">AI Video Provider</Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic (Smart Fallback)</SelectItem>
                    <SelectItem value="high_speed_mp4">Built-in High-Speed MP4 Engine (Instant • 1080p)</SelectItem>
                    <SelectItem value="runway">Runway Gen-3 (AI Video • Cloud)</SelectItem>
                    <SelectItem value="veo">Google Veo (Requires Vertex AI Paid Quota)</SelectItem>
                    <SelectItem value="leonardo">Leonardo AI Video (Motion)</SelectItem>
                    <SelectItem value="nvidia">NVIDIA NIM Cosmos (Self-Hosted GPU Container)</SelectItem>
                    <SelectItem value="sora">OpenAI Sora</SelectItem>
                    <SelectItem value="pexels">Pexels Commercial Stock Footage</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Generate Button */}
              <Button
                type="button"
                className="w-full font-semibold shadow-md gap-2"
                size="lg"
                onClick={handleGenerateVideo}
                disabled={!imagePreviewUrl || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating Video ({generationProgress}%)...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Generate Video from Image
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* =================================================================== */}
        {/* RIGHT PANEL: Generated Video Preview & Actions (5 cols on lg) */}
        {/* =================================================================== */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="border shadow-sm sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Film className="h-4 w-4 text-purple-600" />
                  Generated Video Preview
                </span>
                {generatedVideoUrl && (
                  <Badge className="bg-success text-white text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Ready (MP4)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Video Player or Empty State */}
              <div
                className={`relative rounded-xl overflow-hidden border bg-black flex items-center justify-center transition-all ${
                  aspectRatio === "9:16"
                    ? "aspect-[9/16] max-h-[500px]"
                    : aspectRatio === "16:9"
                    ? "aspect-video"
                    : "aspect-square"
                } mx-auto w-full`}
              >
                {isGenerating ? (
                  <div className="p-6 text-center space-y-3 z-10 max-w-xs">
                    <RefreshCw className="h-8 w-8 text-purple-500 animate-spin mx-auto" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">Synthesizing Video</p>
                      <p className="text-xs text-muted-foreground">{generationStatusText}</p>
                    </div>
                    <Progress value={generationProgress} className="h-2 bg-muted/20" />
                    <span className="text-xs font-mono text-purple-400">{generationProgress}%</span>
                  </div>
                ) : generatedVideoUrl ? (
                  <video
                    ref={videoPlayerRef}
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : imagePreviewUrl ? (
                  <div className="relative h-full w-full flex items-center justify-center group">
                    <img
                      src={imagePreviewUrl}
                      alt="Source input"
                      className="h-full w-full object-contain opacity-70 group-hover:opacity-90 transition-opacity"
                    />
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center p-4">
                      <div className="p-3 bg-primary/20 backdrop-blur-md rounded-full text-white mb-2">
                        <Play className="h-6 w-6 fill-white" />
                      </div>
                      <p className="text-xs font-semibold text-white">Ready to Generate Video</p>
                      <p className="text-[11px] text-white/75 mt-0.5">
                        Click "Generate Video from Image" on the left
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-2 text-muted-foreground">
                    <ImageIcon className="h-10 w-10 mx-auto opacity-30" />
                    <p className="text-xs">No image uploaded yet</p>
                    <p className="text-[11px] opacity-75">Upload an image on the left to start generating</p>
                  </div>
                )}
              </div>

              {/* Actions Toolbar */}
              {generatedVideoUrl && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleDownloadMp4}
                      className="text-xs gap-1.5 font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download MP4
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsSocialPostOpen(true)}
                      className="text-xs gap-1.5"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share to Social
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t text-xs">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateVideo}
                      disabled={isGenerating}
                      className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCw className="h-3 w-3 mr-1" />
                      Regenerate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setGeneratedVideoUrl(null);
                        setGeneratedVideoBlob(null);
                        handleRemoveImage();
                      }}
                      className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                      Generate Another
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* History Drawer / Modal */}
      {isHistoryOpen && (
        <Card className="border shadow-sm mt-4">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <History className="h-4 w-4 text-primary" />
                Recent Image-to-Video Generations ({historyList.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Previously generated videos saved to your marketing library.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsHistoryOpen(false)}
              className="text-xs h-7"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {historyList.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No video generations yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {historyList.slice(0, 6).map((item, idx) => (
                  <div key={item.id || idx} className="rounded-lg border p-2.5 bg-muted/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={item.original_image_url}
                        alt="Original"
                        className="h-12 w-12 rounded object-cover border"
                      />
                      <div className="flex-1 min-w-0 text-xs">
                        <p className="font-semibold truncate text-[11px]">{item.video_prompt || "Video"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.motion_style || "Cinematic"} • {item.camera_movement || "Zoom"} • {item.duration}s
                        </p>
                      </div>
                    </div>
                    {item.generated_video_url && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-6 text-[10px] flex-1"
                          onClick={() => {
                            setGeneratedVideoUrl(item.generated_video_url);
                            setImagePreviewUrl(item.original_image_url);
                            setIsHistoryOpen(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <a
                          href={item.generated_video_url}
                          download={`history_video_${item.id || idx}.mp4`}
                          className="inline-flex items-center justify-center h-6 px-2 text-[10px] rounded border bg-background hover:bg-muted"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Direct Social Post Dialog Integration */}
      <DirectSocialPostDialog
        open={isSocialPostOpen}
        onOpenChange={setIsSocialPostOpen}
        initialContent={videoPrompt}
        initialImageUrl={imagePreviewUrl || undefined}
        initialVideoUrl={generatedVideoUrl || undefined}
        initialMediaType="video"
        templateName="Image to Video Promotion"
      />
    </div>
  );
}
