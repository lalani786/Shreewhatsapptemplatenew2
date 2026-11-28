export interface ImageSizePreset {
  id: string;
  label: string;
  aspectRatio: string;
  width: number;
  height: number;
  description?: string;
}

export const imageSizePresets: ImageSizePreset[] = [
  { id: "square-1024", label: "Square (1:1)", aspectRatio: "1:1", width: 1024, height: 1024, description: "Standard square (1024x1024)" },
  { id: "square-1080", label: "Square HD (1:1)", aspectRatio: "1:1", width: 1080, height: 1080, description: "Instagram square (1080x1080)" },
  { id: "square-512", label: "Square Fast (1:1)", aspectRatio: "1:1", width: 512, height: 512, description: "Fast square (512x512)" },
  { id: "portrait-4-5", label: "Portrait (4:5)", aspectRatio: "4:5", width: 1080, height: 1350, description: "Instagram portrait post (1080x1350)" },
  { id: "portrait-4-5-800", label: "Portrait (4:5)", aspectRatio: "4:5", width: 800, height: 1000, description: "Standard portrait (800x1000)" },
  { id: "portrait-3-4", label: "Portrait (3:4)", aspectRatio: "3:4", width: 768, height: 1024, description: "Standard 3:4 portrait (768x1024)" },
  { id: "story-9-16", label: "Story / Reel (9:16)", aspectRatio: "9:16", width: 1080, height: 1920, description: "Full screen vertical story/reel (1080x1920)" },
  { id: "story-9-16-720", label: "Story (9:16)", aspectRatio: "9:16", width: 720, height: 1280, description: "720p vertical story (720x1280)" },
  { id: "landscape-16-9", label: "Landscape (16:9)", aspectRatio: "16:9", width: 1920, height: 1080, description: "Full HD landscape (1920x1080)" },
  { id: "landscape-16-9-720", label: "Landscape (16:9)", aspectRatio: "16:9", width: 1280, height: 720, description: "720p landscape (1280x720)" },
  { id: "landscape-16-9-1024", label: "Landscape (16:9)", aspectRatio: "16:9", width: 1024, height: 576, description: "Standard landscape (1024x576)" },
  { id: "landscape-4-3", label: "Landscape (4:3)", aspectRatio: "4:3", width: 1024, height: 768, description: "Standard 4:3 landscape (1024x768)" },
  { id: "landscape-3-2-1536", label: "Landscape (3:2)", aspectRatio: "3:2", width: 1536, height: 1024, description: "Hi-res 3:2 landscape (1536x1024)" },
  { id: "classic-3-2", label: "Classic (3:2)", aspectRatio: "3:2", width: 1080, height: 720, description: "Classic 3:2 landscape photo (1080x720)" },
  { id: "classic-2-3", label: "Classic (2:3)", aspectRatio: "2:3", width: 720, height: 1080, description: "Classic 2:3 portrait photo (720x1080)" },
];

export function getImageSizePreset(width: number, height: number): ImageSizePreset | undefined {
  return imageSizePresets.find((p) => p.width === width && p.height === height);
}
