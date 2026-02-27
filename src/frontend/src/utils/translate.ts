import { AppSettings } from "../types/manga";
import { createActorWithConfig } from "../config";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";
const LIBRETRANSLATE_ENDPOINT = "https://libretranslate.com/translate";
const LINGVA_ENDPOINT = "https://lingva.ml/api/v1";

const OPENROUTER_MODEL_IDS: Record<string, string> = {
  "deepseek-v3":        "deepseek/deepseek-chat",
  "deepseek-r1":        "deepseek/deepseek-r1",
  "gpt-4o":             "openai/gpt-4o",
  "claude-3.5-sonnet":  "anthropic/claude-3.5-sonnet",
};

const GEMINI_MODEL_IDS: Record<string, string> = {
  "gemini-2.5-flash":          "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash-thinking": "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash":          "gemini-2.0-flash",
  "gemini-2.0-flash-latest":   "gemini-2.0-flash",
};

/** Language code mappings for free providers */
const MYMEMORY_LANG: Record<string, string> = {
  hindi: "hi",
  hinglish: "hi",
};

const LIBRETRANSLATE_LANG: Record<string, string> = {
  hindi: "hi",
  hinglish: "hi",
};

const LINGVA_LANG: Record<string, string> = {
  hindi: "hi",
  hinglish: "hi",
};

/** Returns true if the model should be called via OpenRouter */
export function isOpenRouterModel(model: string): boolean {
  return ["deepseek-v3", "deepseek-r1", "gpt-4o", "claude-3.5-sonnet"].includes(model);
}

/** Returns true if the model is a free/keyless provider */
export function isFreeModel(model: string): boolean {
  return ["mymemory", "libretranslate", "lingva"].includes(model);
}

function languageLabel(lang: string): string {
  return lang === "hindi" ? "Hindi" : "Hinglish (a mix of Hindi and English)";
}

function buildSystemPrompt(): string {
  return "You are a manga translator. Translate the following text naturally as manga dialogue. Preserve character names, onomatopoeia, and honorifics unless instructed otherwise. Output ONLY the translated text without any commentary or explanation.";
}

function buildUserPrompt(
  text: string,
  targetLanguage: string,
  customPrompt: string
): string {
  const langLabel = languageLabel(targetLanguage);
  const custom = customPrompt.trim();
  const parts: string[] = [];
  if (custom) parts.push(custom);
  parts.push(`Translate to ${langLabel}:\n\n${text}`);
  return parts.join("\n\n");
}

export async function translateWithOpenRouter(
  text: string,
  settings: AppSettings
): Promise<string> {
  const { openRouterKey, model, targetLanguage, customPrompt } = settings;

  const openRouterModelId = OPENROUTER_MODEL_IDS[model] ?? "deepseek/deepseek-chat";

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Manga Translator",
    },
    body: JSON.stringify({
      model: openRouterModelId,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt(text, targetLanguage, customPrompt),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message ?? "Unknown error"}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty translation");
  return content.trim();
}

export async function translateWithGemini(
  text: string,
  settings: AppSettings
): Promise<string> {
  const { model, targetLanguage, customPrompt } = settings;

  const geminiModel = GEMINI_MODEL_IDS[model] ?? "gemini-2.0-flash";
  const fullPrompt = `${buildSystemPrompt()}\n\n${buildUserPrompt(text, targetLanguage, customPrompt)}`;

  // Route through backend canister — Gemini API key is stored server-side
  const actor = await createActorWithConfig();
  const result = await actor.translateWithGemini(geminiModel, fullPrompt);

  if (result.startsWith("ERROR:")) {
    throw new Error(result);
  }

  if (!result.trim()) throw new Error("Gemini returned empty translation");
  return result.trim();
}

export async function translateWithMyMemory(
  text: string,
  settings: AppSettings
): Promise<string> {
  const targetLang = MYMEMORY_LANG[settings.targetLanguage] ?? "hi";
  const langPair = `en|${targetLang}`;
  const url = `${MYMEMORY_ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MyMemory API error ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
    responseDetails?: string;
  };

  if (data.responseStatus !== 200) {
    throw new Error(`MyMemory error: ${data.responseDetails ?? "Unknown error"}`);
  }

  const translated = data.responseData?.translatedText;
  if (!translated) throw new Error("MyMemory returned empty translation");
  return translated.trim();
}

export async function translateWithLibreTranslate(
  text: string,
  settings: AppSettings
): Promise<string> {
  const targetLang = LIBRETRANSLATE_LANG[settings.targetLanguage] ?? "hi";

  try {
    const response = await fetch(LIBRETRANSLATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "en",
        target: targetLang,
        format: "text",
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`LibreTranslate API error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      translatedText?: string;
      error?: string;
    };

    if (data.error) {
      throw new Error(`LibreTranslate error: ${data.error}`);
    }

    const translated = data.translatedText;
    if (!translated) throw new Error("LibreTranslate returned empty translation");
    return translated.trim();
  } catch (err) {
    // CORS or network failures are common with public LibreTranslate instances.
    // Fall back to MyMemory which is more reliably accessible.
    const isCorsOrNetwork =
      err instanceof TypeError ||
      (err instanceof Error &&
        (err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError") ||
          err.message.includes("CORS")));

    if (isCorsOrNetwork) {
      console.warn("LibreTranslate failed (likely CORS), falling back to MyMemory:", err);
      return translateWithMyMemory(text, settings);
    }
    throw err;
  }
}

export async function translateWithLingva(
  text: string,
  settings: AppSettings
): Promise<string> {
  const targetLang = LINGVA_LANG[settings.targetLanguage] ?? "hi";
  const url = `${LINGVA_ENDPOINT}/en/${targetLang}/${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Lingva API error ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      translation?: string;
      error?: string;
    };

    if (data.error) {
      throw new Error(`Lingva error: ${data.error}`);
    }

    const translated = data.translation;
    if (!translated) throw new Error("Lingva returned empty translation");
    return translated.trim();
  } catch (err) {
    // CORS or network failures are common with public Lingva instances.
    // Fall back to MyMemory which is more reliably accessible.
    const isCorsOrNetwork =
      err instanceof TypeError ||
      (err instanceof Error &&
        (err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError") ||
          err.message.includes("CORS")));

    if (isCorsOrNetwork) {
      console.warn("Lingva failed (likely CORS), falling back to MyMemory:", err);
      return translateWithMyMemory(text, settings);
    }
    throw err;
  }
}

export async function translate(
  text: string,
  settings: AppSettings
): Promise<string> {
  // Free/keyless providers
  if (settings.model === "mymemory") {
    return translateWithMyMemory(text, settings);
  }
  if (settings.model === "libretranslate") {
    return translateWithLibreTranslate(text, settings);
  }
  if (settings.model === "lingva") {
    return translateWithLingva(text, settings);
  }
  // OpenRouter models always go via OpenRouter even if provider is set to "gemini"
  if (isOpenRouterModel(settings.model)) {
    return translateWithOpenRouter(text, settings);
  }
  return translateWithGemini(text, settings);
}
