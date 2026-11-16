/**
 * AI Video and Voice Configuration Types and Constants
 * Shree AI Messenger - ShreeTemplate
 */

export type VideoDuration = 5 | 15 | 30 | 60;
export type VideoAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoQuality = "1080p" | "720p";

export interface VideoDurationConfig {
  duration: VideoDuration;
  label: string;
  minWords: number;
  maxWords: number;
  targetWords: number;
  description: string;
}

export const VIDEO_DURATIONS: VideoDurationConfig[] = [
  {
    duration: 5,
    label: "5 Seconds",
    minWords: 10,
    maxWords: 12,
    targetWords: 11,
    description: "Quick teaser • 10–12 words",
  },
  {
    duration: 15,
    label: "15 Seconds",
    minWords: 30,
    maxWords: 40,
    targetWords: 35,
    description: "Reels / Shorts • 30–40 words",
  },
  {
    duration: 30,
    label: "30 Seconds",
    minWords: 65,
    maxWords: 75,
    targetWords: 70,
    description: "Social promo • 65–75 words",
  },
  {
    duration: 60,
    label: "60 Seconds",
    minWords: 130,
    maxWords: 150,
    targetWords: 140,
    description: "Full explainer • 130–150 words",
  },
];

export interface VideoAspectRatioConfig {
  id: VideoAspectRatio;
  label: string;
  name: string;
  description: string;
  width: number;
  height: number;
  qualityDimensions: Record<VideoQuality, { width: number; height: number }>;
}

export const VIDEO_ASPECT_RATIOS: Record<VideoAspectRatio, VideoAspectRatioConfig> = {
  "16:9": {
    id: "16:9",
    label: "16:9 Landscape – 1920 × 1080",
    name: "Landscape (16:9)",
    description: "YouTube, Website, TV (1920x1080)",
    width: 1920,
    height: 1080,
    qualityDimensions: {
      "1080p": { width: 1920, height: 1080 },
      "720p": { width: 1280, height: 720 },
    },
  },
  "9:16": {
    id: "9:16",
    label: "9:16 Portrait – 1080 × 1920",
    name: "Portrait (9:16)",
    description: "Instagram Reels, TikTok, YouTube Shorts (1080x1920)",
    width: 1080,
    height: 1920,
    qualityDimensions: {
      "1080p": { width: 1080, height: 1920 },
      "720p": { width: 720, height: 1280 },
    },
  },
  "1:1": {
    id: "1:1",
    label: "1:1 Square – 1080 × 1080",
    name: "Square (1:1)",
    description: "Instagram Feed, Facebook, LinkedIn (1080x1080)",
    width: 1080,
    height: 1080,
    qualityDimensions: {
      "1080p": { width: 1080, height: 1080 },
      "720p": { width: 720, height: 720 },
    },
  },
};

export function getVideoDimensions(
  aspectRatio: VideoAspectRatio,
  quality: VideoQuality = "1080p"
): { width: number; height: number } {
  const config = VIDEO_ASPECT_RATIOS[aspectRatio] || VIDEO_ASPECT_RATIOS["1:1"];
  return config.qualityDimensions[quality] || { width: config.width, height: config.height };
}

export interface SupportedLanguage {
  id: string; // e.g. "hi-IN"
  label: string;
  nativeName: string;
  code: string; // "hi", "gu", "ur", "ar", "en"
  isRTL: boolean;
  scriptName: string;
  scriptRegex: RegExp;
  flagEmoji?: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  {
    id: "hi-IN",
    label: "Hindi – हिंदी – hi-IN",
    nativeName: "हिंदी",
    code: "hi",
    isRTL: false,
    scriptName: "Devanagari",
    scriptRegex: /[\u0900-\u097F]/,
    flagEmoji: "🇮🇳",
  },
  {
    id: "gu-IN",
    label: "Gujarati – ગુજરાતી – gu-IN",
    nativeName: "ગુજરાતી",
    code: "gu",
    isRTL: false,
    scriptName: "Gujarati",
    scriptRegex: /[\u0A80-\u0AFF]/,
    flagEmoji: "🇮🇳",
  },
  {
    id: "ur-PK",
    label: "Urdu – اردو – ur-PK",
    nativeName: "اردو",
    code: "ur",
    isRTL: true,
    scriptName: "Nastaliq / Arabic",
    scriptRegex: /[\u0600-\u06FF]/,
    flagEmoji: "🇵🇰",
  },
  {
    id: "ar-SA",
    label: "Arabic – العربية – ar-SA",
    nativeName: "العربية",
    code: "ar",
    isRTL: true,
    scriptName: "Arabic",
    scriptRegex: /[\u0600-\u06FF]/,
    flagEmoji: "🇸🇦",
  },
  {
    id: "en-US",
    label: "English – en-US / en-IN",
    nativeName: "English",
    code: "en",
    isRTL: false,
    scriptName: "Latin",
    scriptRegex: /[a-zA-Z]/,
    flagEmoji: "🌐",
  },
];

export interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female";
  languageId: string;
  provider: "elevenlabs" | "native" | "google";
  description: string;
}

export const SUPPORTED_VOICES: VoiceOption[] = [
  // Hindi voices
  {
    id: "hi-female-1",
    name: "Swara (Hindi Female)",
    gender: "female",
    languageId: "hi-IN",
    provider: "elevenlabs",
    description: "Warm, natural Hindi female voice (ElevenLabs Multilingual / Backup)",
  },
  {
    id: "hi-male-1",
    name: "Aarav (Hindi Male)",
    gender: "male",
    languageId: "hi-IN",
    provider: "elevenlabs",
    description: "Deep, clear Hindi male voice (ElevenLabs Multilingual / Backup)",
  },
  // Gujarati voices
  {
    id: "gu-female-1",
    name: "Krupa (Gujarati Female)",
    gender: "female",
    languageId: "gu-IN",
    provider: "elevenlabs",
    description: "Native Gujarati female voice (Authentic Gujarati pronunciation)",
  },
  {
    id: "gu-male-1",
    name: "Devang (Gujarati Male)",
    gender: "male",
    languageId: "gu-IN",
    provider: "elevenlabs",
    description: "Native Gujarati male voice (Clear, energetic Gujarati promo)",
  },
  // Urdu voices
  {
    id: "ur-female-1",
    name: "Zoya (Urdu Female)",
    gender: "female",
    languageId: "ur-PK",
    provider: "elevenlabs",
    description: "Elegant Urdu female voice (Authentic Urdu diction)",
  },
  {
    id: "ur-male-1",
    name: "Tariq (Urdu Male)",
    gender: "male",
    languageId: "ur-PK",
    provider: "elevenlabs",
    description: "Resonant Urdu male voice (Polished Urdu promo)",
  },
  // Arabic voices
  {
    id: "ar-female-1",
    name: "Layla (Arabic Female)",
    gender: "female",
    languageId: "ar-SA",
    provider: "elevenlabs",
    description: "Modern Standard Arabic female voice (Clear Arabic diction)",
  },
  {
    id: "ar-male-1",
    name: "Hamza (Arabic Male)",
    gender: "male",
    languageId: "ar-SA",
    provider: "elevenlabs",
    description: "Modern Standard Arabic male voice (Authoritative Arabic promo)",
  },
  // English voices
  {
    id: "en-female-1",
    name: "Rachel (English Female)",
    gender: "female",
    languageId: "en-US",
    provider: "elevenlabs",
    description: "Engaging commercial female voice (ElevenLabs / Backup)",
  },
  {
    id: "en-male-1",
    name: "George (English Male)",
    gender: "male",
    languageId: "en-US",
    provider: "elevenlabs",
    description: "Warm, professional male voice (ElevenLabs / Backup)",
  },
];

export function getVoicesForLanguage(
  languageId: string,
  gender?: "male" | "female"
): VoiceOption[] {
  const normLang = languageId.trim();
  const matched = SUPPORTED_VOICES.filter((v) => {
    const langMatch = v.languageId === normLang || v.languageId.split("-")[0] === normLang.split("-")[0];
    const genderMatch = !gender || v.gender === gender;
    return langMatch && genderMatch;
  });
  if (matched.length > 0) return matched;

  const anyGender = SUPPORTED_VOICES.filter(
    (v) => v.languageId === normLang || v.languageId.split("-")[0] === normLang.split("-")[0]
  );
  if (anyGender.length > 0) return anyGender;

  return SUPPORTED_VOICES;
}

export function isRtlLanguage(languageIdOrCode: string): boolean {
  const lang = SUPPORTED_LANGUAGES.find(
    (l) => l.id === languageIdOrCode || l.code === languageIdOrCode
  );
  if (lang) return lang.isRTL;
  const lower = languageIdOrCode.toLowerCase();
  return lower.startsWith("ur") || lower.startsWith("ar");
}

export function getScriptPromptGuidance(languageId: string, duration: VideoDuration): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.id === languageId) || SUPPORTED_LANGUAGES[0];
  const durConfig = VIDEO_DURATIONS.find((d) => d.duration === duration) || VIDEO_DURATIONS[1];

  let nativeScriptInstructions = "";
  switch (lang.code) {
    case "gu":
      nativeScriptInstructions = `CRITICAL LANGUAGE REQUIREMENT: Write strictly in genuine GUJARATI SCRIPT (ગુજરાતી લિપિ).
- Example words: ખાસ ઓફર, ધમાકેદાર સેલ, આજે જ મુલાકાત લો, પ્રીમિયમ ક્વોલિટી.
- NEVER write in Roman Gujarati / English alphabet (e.g. DO NOT write "Khas Offer" or "Aaje ja mulakat lo"). Output MUST be 100% Gujarati Unicode characters.`;
      break;
    case "ur":
      nativeScriptInstructions = `CRITICAL LANGUAGE REQUIREMENT: Write strictly in genuine URDU SCRIPT (اردو رسم الخط) using proper Urdu Nastaliq-compatible Unicode.
- Example words: خاص آفر, شاندار سیل, آج ہی تشریف لائیں, بہترین معیار.
- NEVER write in Roman Urdu or English alphabet (e.g. DO NOT write "Khas Offer" or "Aj hi tashreef layen"). Output MUST be 100% Urdu Arabic-script Unicode characters.`;
      break;
    case "ar":
      nativeScriptInstructions = `CRITICAL LANGUAGE REQUIREMENT: Write strictly in Modern Standard ARABIC (العربية الفصحى) using proper Arabic Unicode.
- Example words: عرض خاص, تخفيضات كبرى, تفضلوا بزيارتنا اليوم, جودة ممتازة.
- NEVER write in Arabizi or Latin characters. Output MUST be 100% Arabic Unicode characters.`;
      break;
    case "hi":
      nativeScriptInstructions = `CRITICAL LANGUAGE REQUIREMENT: Write strictly in genuine HINDI DEVANAGARI SCRIPT (देवनागरी लिपि).
- Example words: विशेष ऑफर, महा सेल, आज ही पधारें, बेहतरीन क्वालिटी.
- NEVER write in Hinglish or Roman characters (e.g. DO NOT write "Vishesh Offer"). Output MUST be 100% Hindi Devanagari Unicode characters.`;
      break;
    default:
      nativeScriptInstructions = `Write in compelling, punchy, commercial English suitable for high-converting promo video voiceovers.`;
      break;
  }

  return `
VOICEOVER SCRIPT TIMING & LENGTH RULES:
- Target Duration: ${durConfig.duration} Seconds
- Target Word Count: EXACTLY ${durConfig.minWords} to ${durConfig.maxWords} words (Target: ~${durConfig.targetWords} words).
- Voice script pace is ~2.5 words per second. Do NOT exceed ${durConfig.maxWords} words or the speech will get cut off!
- Keep it punchy, engaging, festive, and clear.

${nativeScriptInstructions}
`;
}
