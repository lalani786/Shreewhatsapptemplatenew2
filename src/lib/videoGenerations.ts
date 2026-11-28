import { supabase } from "@/integrations/supabase/client";

export interface VideoGenerationRecord {
  id?: string;
  user_id?: string;
  company_id?: string | null;
  original_image_url: string;
  generated_video_url: string | null;
  video_prompt?: string | null;
  provider: string;
  model?: string | null;
  duration?: number;
  aspect_ratio?: string;
  motion_style?: string | null;
  camera_movement?: string | null;
  generation_status?: "pending" | "processing" | "completed" | "failed";
  error_message?: string | null;
  created_at?: string;
}

/**
 * Saves a video generation entry to Supabase ai_video_generations table.
 * If the table does not exist or user is offline, falls back gracefully to localStorage history.
 */
export async function saveVideoGeneration(
  data: VideoGenerationRecord
): Promise<VideoGenerationRecord> {
  const localHistoryKey = "shree_ai_video_history";

  // 1. Save to local storage for instant availability
  try {
    const existingStr = localStorage.getItem(localHistoryKey) || "[]";
    const existing: VideoGenerationRecord[] = JSON.parse(existingStr);
    const updated = [
      {
        ...data,
        id: data.id || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        created_at: new Date().toISOString(),
      },
      ...existing.slice(0, 49), // retain up to 50 items
    ];
    localStorage.setItem(localHistoryKey, JSON.stringify(updated));
  } catch (lsErr) {
    console.warn("LocalStorage save error:", lsErr);
  }

  // 2. Save to Supabase
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return data;

    const payload = {
      user_id: user.id,
      company_id: data.company_id || (user.user_metadata?.company_id as string) || null,
      original_image_url: data.original_image_url,
      generated_video_url: data.generated_video_url,
      video_prompt: data.video_prompt || null,
      provider: data.provider,
      model: data.model || null,
      duration: data.duration || 5,
      aspect_ratio: data.aspect_ratio || "9:16",
      motion_style: data.motion_style || null,
      camera_movement: data.camera_movement || null,
      generation_status: data.generation_status || "completed",
      error_message: data.error_message || null,
    };

    const { data: inserted, error } = await supabase
      .from("ai_video_generations" as never)
      .insert(payload as never)
      .select()
      .maybeSingle();

    if (error) {
      console.warn("Supabase ai_video_generations insert note:", error.message);
      return data;
    }

    return (inserted as unknown as VideoGenerationRecord) || data;
  } catch (err) {
    console.warn("Could not persist to Supabase:", err);
    return data;
  }
}

/**
 * Loads video generations history from Supabase or localStorage fallback.
 */
export async function fetchVideoGenerationsHistory(): Promise<VideoGenerationRecord[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from("ai_video_generations" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data as unknown as VideoGenerationRecord[];
      }
    }
  } catch (err) {
    console.warn("fetchVideoGenerationsHistory Supabase warning:", err);
  }

  // Local storage fallback
  try {
    const existingStr = localStorage.getItem("shree_ai_video_history") || "[]";
    return JSON.parse(existingStr) as VideoGenerationRecord[];
  } catch {
    return [];
  }
}

/**
 * Uploads a local image file to Supabase storage (whatsapp-media bucket).
 * Returns the public URL of the uploaded image.
 */
export async function uploadCustomImageToStorage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || "anonymous";
  const ext = file.name.split(".").pop() || "png";
  const cleanExt = ["jpg", "jpeg", "png", "webp"].includes(ext.toLowerCase()) ? ext.toLowerCase() : "png";
  const fileName = `${userId}/custom_images/img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${cleanExt}`;

  onProgress?.(20);
  const { error: uploadError } = await supabase.storage
    .from("whatsapp-media")
    .upload(fileName, file, {
      contentType: file.type || "image/png",
      upsert: true,
    });

  if (uploadError) {
    // If not authenticated or storage error, convert to base64 Data URL so generation proceeds seamlessly
    console.warn("Storage upload error, using local data URL:", uploadError.message);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  }

  onProgress?.(80);
  const { data: publicUrlData } = supabase.storage
    .from("whatsapp-media")
    .getPublicUrl(fileName);

  if (!publicUrlData?.publicUrl) {
    throw new Error("Could not retrieve public URL for uploaded custom image");
  }

  onProgress?.(100);
  return publicUrlData.publicUrl;
}
