import { GlossaryEntry } from "../types/manga";

/**
 * Apply glossary substitutions to text.
 * Simple word-boundary replacement to avoid partial matches.
 */
export function applyGlossary(text: string, glossary: GlossaryEntry[]): string {
  if (!glossary.length) return text;
  let result = text;
  for (const entry of glossary) {
    if (!entry.from.trim()) continue;
    // escape special regex characters
    const escaped = entry.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    result = result.replace(regex, entry.to);
  }
  return result;
}
