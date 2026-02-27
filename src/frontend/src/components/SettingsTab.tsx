import React, { useState } from "react";
import { Eye, EyeOff, Plus, Trash2, Save } from "lucide-react";
import { AppSettings, GlossaryEntry, ALL_MODELS } from "../types/manga";
import { toast } from "sonner";

let glossaryIdCounter = 0;
function nextGlossaryId() {
  glossaryIdCounter += 1;
  return `g-${glossaryIdCounter}`;
}

type GlossaryEntryWithId = GlossaryEntry & { _id: string };

interface SettingsTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => void;
}

function toWithId(entries: GlossaryEntry[]): GlossaryEntryWithId[] {
  return entries.map((e) => ({ ...e, _id: nextGlossaryId() }));
}

export function SettingsTab({ settings, onSave }: SettingsTabProps) {
  const [local, setLocal] = useState<AppSettings>({ ...settings });
  const [glossaryWithIds, setGlossaryWithIds] = useState<GlossaryEntryWithId[]>(
    () => toWithId(settings.glossary)
  );
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const addGlossaryEntry = () => {
    setGlossaryWithIds((prev) => [
      ...prev,
      { from: "", to: "", _id: nextGlossaryId() },
    ]);
  };

  const removeGlossaryEntry = (id: string) => {
    setGlossaryWithIds((prev) => prev.filter((e) => e._id !== id));
  };

  const updateGlossaryEntry = (
    id: string,
    field: keyof GlossaryEntry,
    value: string
  ) => {
    setGlossaryWithIds((prev) =>
      prev.map((entry) =>
        entry._id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleSave = () => {
    // Strip internal _id before saving
    const cleanGlossary: GlossaryEntry[] = glossaryWithIds
      .filter((e) => e.from.trim())
      .map(({ from, to }) => ({ from, to }));
    onSave({ ...local, glossary: cleanGlossary });
    toast.success("Settings saved");
  };

  return (
    <div className="animate-slide-up space-y-6 pb-4">
      {/* API Keys */}
      <section className="manga-card rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          API Keys
        </h2>

        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="openrouter-key">
            OpenRouter API Key
          </label>
          <div className="relative">
            <input
              id="openrouter-key"
              type={showOpenRouterKey ? "text" : "password"}
              value={local.openRouterKey}
              onChange={(e) => update("openRouterKey", e.target.value)}
              placeholder="sk-or-..."
              className="
                w-full bg-input rounded-md border border-border px-3 py-2.5 pr-10
                text-sm text-foreground placeholder:text-muted-foreground
                focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring
                transition-colors
              "
            />
            <button
              type="button"
              onClick={() => setShowOpenRouterKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showOpenRouterKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Get your key at openrouter.ai
          </p>
        </div>

      </section>

      {/* Translation Config */}
      <section className="manga-card rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Translation Config
        </h2>

        {/* Provider */}
        <fieldset className="space-y-2">
          <legend className="block text-xs text-muted-foreground">Provider</legend>
          <div className="flex gap-3">
            {(["openrouter", "gemini"] as const).map((p) => (
              <label
                key={p}
                className="flex items-center gap-2 cursor-pointer"
                htmlFor={`provider-${p}`}
              >
                <input
                  id={`provider-${p}`}
                  type="radio"
                  name="provider"
                  value={p}
                  checked={local.provider === p}
                  onChange={() => update("provider", p)}
                  className="accent-cyan-400"
                />
                <span className="text-sm capitalize text-foreground">
                  {p === "openrouter" ? "OpenRouter" : "Google Gemini"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Model */}
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="model-select">
            Model
          </label>
          <select
            id="model-select"
            value={local.model}
            onChange={(e) => update("model", e.target.value as AppSettings["model"])}
            className="
              w-full bg-input rounded-md border border-border px-3 py-2.5
              text-sm text-foreground
              focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring
              transition-colors
            "
          >
            <optgroup label="Free (No Key Required)">
              {ALL_MODELS.filter((m) => ["mymemory", "libretranslate", "lingva"].includes(m.provider as string)).map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Google Gemini (No Key Required)">
              {ALL_MODELS.filter((m) => m.provider === "gemini").map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="OpenRouter (Key Required)">
              {ALL_MODELS.filter((m) => m.provider === "openrouter").map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </optgroup>
          </select>
          <p className="text-xs text-muted-foreground/70">
            Free models and Gemini work without any key. DeepSeek, GPT-4o, Claude require your OpenRouter key.
          </p>
        </div>

        {/* Target Language */}
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="language-select">
            Target Language
          </label>
          <select
            id="language-select"
            value={local.targetLanguage}
            onChange={(e) =>
              update("targetLanguage", e.target.value as AppSettings["targetLanguage"])
            }
            className="
              w-full bg-input rounded-md border border-border px-3 py-2.5
              text-sm text-foreground
              focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring
              transition-colors
            "
          >
            <option value="hindi">Hindi</option>
            <option value="hinglish">Hinglish (Hindi + English)</option>
          </select>
        </div>

        {/* Custom Prompt */}
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="custom-prompt">
            Custom Translation Instructions
          </label>
          <textarea
            id="custom-prompt"
            value={local.customPrompt}
            onChange={(e) => update("customPrompt", e.target.value)}
            placeholder="e.g. translate like manga dialogue, keep honorifics, use casual hinglish..."
            rows={3}
            className="
              w-full bg-input rounded-md border border-border px-3 py-2.5
              text-sm text-foreground placeholder:text-muted-foreground
              focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring
              resize-none transition-colors
            "
          />
        </div>
      </section>

      {/* Glossary */}
      <section className="manga-card rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Glossary
          </h2>
          <button
            type="button"
            onClick={addGlossaryEntry}
            className="manga-btn flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Entry
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Override specific words before and after AI translation.
        </p>

        {glossaryWithIds.length === 0 && (
          <p className="text-xs text-muted-foreground/60 text-center py-2">
            No glossary entries yet.
          </p>
        )}

        <div className="space-y-2">
          {glossaryWithIds.map((entry) => (
            <div key={entry._id} className="flex items-center gap-2">
              <input
                type="text"
                value={entry.from}
                onChange={(e) => updateGlossaryEntry(entry._id, "from", e.target.value)}
                placeholder="From"
                className="
                  flex-1 bg-input rounded-md border border-border px-2.5 py-2
                  text-sm text-foreground placeholder:text-muted-foreground
                  focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring
                  transition-colors
                "
              />
              <span className="text-muted-foreground text-sm">→</span>
              <input
                type="text"
                value={entry.to}
                onChange={(e) => updateGlossaryEntry(entry._id, "to", e.target.value)}
                placeholder="To"
                className="
                  flex-1 bg-input rounded-md border border-border px-2.5 py-2
                  text-sm text-foreground placeholder:text-muted-foreground
                  focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring
                  transition-colors
                "
              />
              <button
                type="button"
                onClick={() => removeGlossaryEntry(entry._id)}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove glossary entry"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {glossaryWithIds.length > 0 && (
          <p className="text-xs text-muted-foreground/70">
            Example: senpai → senpai, baka → pagal
          </p>
        )}
      </section>

      {/* Save */}
      <button
        type="button"
        className="manga-btn-filled w-full flex items-center justify-center gap-2 font-semibold rounded-lg"
        onClick={handleSave}
      >
        <Save className="w-4 h-4" />
        Save Settings
      </button>
    </div>
  );
}
