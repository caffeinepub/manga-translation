import React, { useState, useCallback, useRef } from "react";
import { createWorker } from "tesseract.js";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { UploadTab } from "./components/UploadTab";
import { TranslateTab } from "./components/TranslateTab";
import { ExportTab, renderTranslatedCanvas } from "./components/ExportTab";
import { SettingsTab } from "./components/SettingsTab";
import { useSettings } from "./hooks/useSettings";
import { translate, isFreeModel } from "./utils/translate";
import { applyGlossary } from "./utils/glossary";
import { saveAs } from "file-saver";
import {
  MangaImage,
  OcrTextBlock,
  ActiveTab,
  AppSettings,
  ImageStatus,
} from "./types/manga";
import {
  Upload,
  Languages,
  Download,
  Settings,
  BookOpen,
  Heart,
} from "lucide-react";

// ──────────────────────────────────────────────
// Unique ID generator
// ──────────────────────────────────────────────
let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `img-${Date.now()}-${idCounter}`;
}

// ──────────────────────────────────────────────
// Tab config
// ──────────────────────────────────────────────
interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  { id: "upload", label: "Upload", icon: <Upload className="w-5 h-5" /> },
  { id: "translate", label: "Translate", icon: <Languages className="w-5 h-5" /> },
  { id: "export", label: "Export", icon: <Download className="w-5 h-5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
];

// ──────────────────────────────────────────────
// Main App
// ──────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("upload");
  const [images, setImages] = useState<MangaImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef(false);

  const { settings, saveSettings } = useSettings();

  // ── Image Management ──────────────────────────
  const addImages = useCallback(
    (
      files: File[],
      metadata?: Array<{ pageNumber?: number; sourcePdfName?: string }>
    ) => {
      const newImages: MangaImage[] = files.map((file, i) => ({
        id: nextId(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "waiting" as ImageStatus,
        ocrProgress: 0,
        extractedText: "",
        translatedText: "",
        pageNumber: metadata?.[i]?.pageNumber,
        sourcePdfName: metadata?.[i]?.sourcePdfName,
      }));
      setImages((prev) => [...prev, ...newImages]);
    },
    []
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const updateImage = useCallback(
    (id: string, updates: Partial<MangaImage>) => {
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, ...updates } : img))
      );
    },
    []
  );

  const updateTranslatedText = useCallback((id: string, text: string) => {
    updateImage(id, { translatedText: text });
  }, [updateImage]);

  // ── OCR for a single image ────────────────────
  const runOcr = useCallback(
    async (img: MangaImage): Promise<{ text: string; blocks: OcrTextBlock[] }> => {
      updateImage(img.id, { status: "ocr", ocrProgress: 0 });

      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") {
            updateImage(img.id, {
              ocrProgress: Math.round(m.progress * 100),
            });
          }
        },
      });

      try {
        const result = await worker.recognize(img.previewUrl);
        await worker.terminate();

        // Extract word-level bounding boxes for in-place overlay rendering
        const blocks: OcrTextBlock[] = [];
        for (const block of result.data.blocks ?? []) {
          for (const para of block.paragraphs ?? []) {
            for (const line of para.lines ?? []) {
              // Collect all words in this line into one block so we can white-out
              // the entire line region and draw translated text in its place
              const words = line.words ?? [];
              if (words.length === 0) continue;
              const lineText = words.map((w) => w.text).join(" ").trim();
              if (!lineText) continue;
              // Bounding box covering the full line
              const x = Math.min(...words.map((w) => w.bbox.x0));
              const y = Math.min(...words.map((w) => w.bbox.y0));
              const x1 = Math.max(...words.map((w) => w.bbox.x1));
              const y1 = Math.max(...words.map((w) => w.bbox.y1));
              const avgConf = words.reduce((s, w) => s + (w.confidence ?? 0), 0) / words.length;
              if (avgConf < 30) continue; // skip very low-confidence lines
              blocks.push({
                text: lineText,
                x,
                y,
                width: x1 - x,
                height: y1 - y,
                confidence: avgConf,
              });
            }
          }
        }

        return { text: result.data.text, blocks };
      } catch (err) {
        await worker.terminate();
        throw err;
      }
    },
    [updateImage]
  );

  // ── Process a single image ────────────────────
  const processImage = useCallback(
    async (img: MangaImage) => {
      if (abortRef.current) return;

      try {
        // OCR
        const { text: rawText, blocks: ocrBlocks } = await runOcr(img);

        if (abortRef.current) return;

        // Apply glossary pre-processing
        const preProcessed = applyGlossary(rawText, settings.glossary);

        updateImage(img.id, {
          extractedText: preProcessed,
          ocrBlocks,
          status: "translating",
          ocrProgress: 100,
        });

        if (abortRef.current) return;

        // Translation
        const rawTranslation = await translate(preProcessed, settings);

        // Apply glossary post-processing
        const finalTranslation = applyGlossary(rawTranslation, settings.glossary);

        updateImage(img.id, {
          translatedText: finalTranslation,
          status: "done",
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        updateImage(img.id, {
          status: "error",
          errorMessage,
        });
      }
    },
    [runOcr, settings, updateImage]
  );

  // ── Start batch translation ───────────────────
  const startTranslation = useCallback(async () => {
    if (isProcessing) return;
    const pending = images.filter(
      (img) => img.status === "waiting" || img.status === "error"
    );
    if (pending.length === 0) return;

    abortRef.current = false;
    setIsProcessing(true);
    setActiveTab("translate");

    try {
      for (const img of pending) {
        if (abortRef.current) break;
        await processImage(img);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [images, isProcessing, processImage]);

  // ── Retry single image ────────────────────────
  const retryImage = useCallback(
    async (id: string) => {
      const img = images.find((i) => i.id === id);
      if (!img || isProcessing) return;
      updateImage(id, { status: "waiting", errorMessage: undefined });
      setIsProcessing(true);
      try {
        await processImage({ ...img, status: "waiting" });
      } finally {
        setIsProcessing(false);
      }
    },
    [images, isProcessing, processImage, updateImage]
  );

  // ── Quick translate a single image and download ─
  const quickTranslateAndDownload = useCallback(
    async (id: string) => {
      const img = images.find((i) => i.id === id);
      if (!img) return;

      // If already done, skip OCR+translate and just download
      if (img.status === "done") {
        try {
          const canvas = await renderTranslatedCanvas(img);
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
              "image/png",
              1.0
            );
          });
          const baseName = img.file.name.replace(/\.[^.]+$/, "");
          saveAs(blob, `${baseName}_hindi.png`);
          toast.success("Downloaded!");
        } catch (err) {
          toast.error("Download failed: " + (err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // Run full OCR + translate pipeline, then auto-download
      const imgRef = { ...img, status: "waiting" as ImageStatus };
      try {
        await processImage(imgRef);

        // After processImage, read the latest state to get translated content
        setImages((prev) => {
          const updated = prev.find((i) => i.id === id);
          if (updated?.status === "done") {
            void renderTranslatedCanvas(updated).then((canvas) =>
              new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                  (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
                  "image/png",
                  1.0
                );
              })
            ).then((blob) => {
              const baseName = updated.file.name.replace(/\.[^.]+$/, "");
              saveAs(blob, `${baseName}_hindi.png`);
              toast.success("Translation done! Downloading...");
            }).catch((err: unknown) => {
              toast.error("Download failed: " + (err instanceof Error ? err.message : String(err)));
            });
          }
          return prev;
        });
      } catch (err) {
        toast.error("Translation failed: " + (err instanceof Error ? err.message : String(err)));
      }
    },
    [images, processImage]
  );

  // ── Download a translated image by id ─────────
  const downloadImageById = useCallback(
    async (id: string) => {
      const img = images.find((i) => i.id === id);
      if (!img || img.status !== "done") return;
      try {
        const canvas = await renderTranslatedCanvas(img);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
            "image/png",
            1.0
          );
        });
        const baseName = img.file.name.replace(/\.[^.]+$/, "");
        saveAs(blob, `${baseName}_hindi.png`);
        toast.success("Downloaded!");
      } catch (err) {
        toast.error("Download failed: " + (err instanceof Error ? err.message : String(err)));
      }
    },
    [images]
  );

  // ── Derive API key presence ───────────────────
  // Gemini models use backend proxy (no user key needed)
  // Free models (MyMemory, LibreTranslate, Lingva) need no key at all
  // OpenRouter models require user key
  const OPENROUTER_MODELS = ["deepseek-v3", "deepseek-r1", "gpt-4o", "claude-3.5-sonnet"];
  const hasApiKey = OPENROUTER_MODELS.includes(settings.model)
    ? !!settings.openRouterKey
    : isFreeModel(settings.model)
      ? true
      : true; // Gemini uses backend proxy

  // ── Render ────────────────────────────────────
  return (
    <div className="min-h-screen bg-background grid-noise flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-cyan/10 border border-cyan/30">
            <BookOpen className="w-5 h-5 text-cyan" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground glow-cyan tracking-tight">
              Manga Translator
            </h1>
            <p className="text-xs text-muted-foreground">
              OCR + AI Translation
            </p>
          </div>
          {isProcessing && (
            <div className="flex items-center gap-1.5 text-xs text-cyan animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
              Processing
            </div>
          )}
        </div>
      </header>

      {/* Desktop top nav */}
      <nav className="hidden sm:block sticky top-[57px] z-10 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium
                border-b-2 transition-all duration-200 -mb-px
                ${activeTab === tab.id
                  ? "border-cyan text-cyan"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-lg mx-auto px-4 pt-5">
          {activeTab === "upload" && (
            <UploadTab
              images={images}
              onAddImages={addImages}
              onRemoveImage={removeImage}
              onQuickTranslate={quickTranslateAndDownload}
              onDownloadImage={downloadImageById}
            />
          )}
          {activeTab === "translate" && (
            <TranslateTab
              images={images}
              isProcessing={isProcessing}
              onStartTranslation={startTranslation}
              onRetryImage={retryImage}
              onUpdateTranslatedText={updateTranslatedText}
              hasApiKey={hasApiKey}
            />
          )}
          {activeTab === "export" && (
            <ExportTab images={images} />
          )}
          {activeTab === "settings" && (
            <SettingsTab settings={settings} onSave={saveSettings} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="hidden sm:block border-t border-border mt-auto">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            © 2026. Built with
          </span>
          <Heart className="w-3 h-3 text-cyan fill-cyan" />
          <a
            href="https://caffeine.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan hover:text-cyan/80 transition-colors"
          >
            caffeine.ai
          </a>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden sticky bottom-0 z-20 bg-background/95 backdrop-blur-md border-t border-border safe-area-pb">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex flex-col items-center gap-1 py-3 px-2
                text-xs font-medium transition-all duration-200
                ${activeTab === tab.id
                  ? "text-cyan"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              <span
                className={`
                  transition-all duration-200
                  ${activeTab === tab.id ? "scale-110" : "scale-100"}
                `}
              >
                {tab.icon}
              </span>
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 h-0.5 w-8 bg-cyan rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      <Toaster richColors position="top-center" />
    </div>
  );
}
