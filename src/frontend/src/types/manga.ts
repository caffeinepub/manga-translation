// ──────────────────────────────────────────────
// Domain types for the Manga Translation App
// ──────────────────────────────────────────────

export type Provider = "openrouter" | "gemini" | "mymemory" | "libretranslate" | "lingva";
export type Model =
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-thinking"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-latest"
  | "deepseek-v3"
  | "deepseek-r1"
  | "gpt-4o"
  | "claude-3.5-sonnet"
  | "mymemory"
  | "libretranslate"
  | "lingva";

export interface ModelOption {
  value: Model;
  label: string;
  provider: Provider | "both";
}
export type TargetLanguage = "hindi" | "hinglish";
export type ImageStatus = "waiting" | "ocr" | "translating" | "done" | "error";
export type ActiveTab = "upload" | "translate" | "export" | "settings";

export interface GlossaryEntry {
  from: string;
  to: string;
}

export interface AppSettings {
  openRouterKey: string;
  provider: Provider;
  model: Model;
  targetLanguage: TargetLanguage;
  customPrompt: string;
  glossary: GlossaryEntry[];
}

/**
 * A text block detected by OCR -- includes bounding box coordinates
 * so we can white-out the original English text and draw Hindi in-place.
 */
export interface OcrTextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface MangaImage {
  id: string;
  file: File;
  previewUrl: string;
  status: ImageStatus;
  ocrProgress: number;
  extractedText: string;
  translatedText: string;
  /** Word-level bounding boxes from Tesseract OCR */
  ocrBlocks?: OcrTextBlock[];
  errorMessage?: string;
  pageNumber?: number;       // page number within source PDF (1-based)
  sourcePdfName?: string;    // original PDF filename
}

export const DEFAULT_SETTINGS: AppSettings = {
  openRouterKey: "",
  provider: "gemini",
  model: "gemini-2.5-flash",
  targetLanguage: "hindi",
  customPrompt: "",
  glossary: [],
};

export const STORAGE_KEY = "manga-translator-settings";

export const ALL_MODELS: ModelOption[] = [
  { value: "gemini-2.5-flash",          label: "Gemini 2.5 Flash",          provider: "gemini" },
  { value: "gemini-2.5-flash-thinking", label: "Gemini 2.5 Flash Thinking", provider: "gemini" },
  { value: "gemini-2.0-flash",          label: "Gemini 2.0 Flash",          provider: "gemini" },
  { value: "gemini-2.0-flash-latest",   label: "Gemini Flash Latest",       provider: "gemini" },
  { value: "deepseek-v3",               label: "DeepSeek V3",               provider: "openrouter" },
  { value: "deepseek-r1",               label: "DeepSeek R1",               provider: "openrouter" },
  { value: "gpt-4o",                    label: "GPT-4o",                    provider: "openrouter" },
  { value: "claude-3.5-sonnet",         label: "Claude 3.5 Sonnet",         provider: "openrouter" },
  { value: "mymemory",                  label: "MyMemory (Free)",           provider: "mymemory" },
  { value: "libretranslate",            label: "LibreTranslate (Free)",     provider: "libretranslate" },
  { value: "lingva",                    label: "Lingva Translate (Free)",   provider: "lingva" },
];
