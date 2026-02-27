import React, { useState } from "react";
import {
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Loader2,
  Clock,
  Zap,
} from "lucide-react";
import { MangaImage, ImageStatus } from "../types/manga";

interface TranslateTabProps {
  images: MangaImage[];
  isProcessing: boolean;
  onStartTranslation: () => void;
  onRetryImage: (id: string) => void;
  onUpdateTranslatedText: (id: string, text: string) => void;
  hasApiKey: boolean;
}

interface StatusConfig {
  label: string;
  bgClass: string;
  textClass: string;
  icon: React.ReactNode;
}

function getStatusConfig(status: ImageStatus): StatusConfig {
  const configs: Record<ImageStatus, StatusConfig> = {
    waiting: {
      label: "Waiting",
      bgClass: "bg-muted/50",
      textClass: "text-muted-foreground",
      icon: <Clock className="w-3 h-3" />,
    },
    ocr: {
      label: "OCR",
      bgClass: "bg-blue-500/15",
      textClass: "text-blue-400",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    translating: {
      label: "Translating",
      bgClass: "bg-yellow-500/15",
      textClass: "text-yellow-400",
      icon: <Zap className="w-3 h-3" />,
    },
    done: {
      label: "Done",
      bgClass: "bg-green-500/15",
      textClass: "text-green-400",
      icon: <CheckCircle className="w-3 h-3" />,
    },
    error: {
      label: "Error",
      bgClass: "bg-red-500/15",
      textClass: "text-red-400",
      icon: <AlertCircle className="w-3 h-3" />,
    },
  };
  return configs[status];
}

export function TranslateTab({
  images,
  isProcessing,
  onStartTranslation,
  onRetryImage,
  onUpdateTranslatedText,
  hasApiKey,
}: TranslateTabProps) {
  const [expandedOcr, setExpandedOcr] = useState<Set<string>>(new Set());
  const [expandedTranslation, setExpandedTranslation] = useState<Set<string>>(new Set());

  const toggleOcr = (id: string) => {
    setExpandedOcr((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTranslation = (id: string) => {
    setExpandedTranslation((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doneCount = images.filter((i) => i.status === "done").length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const totalCount = images.length;

  return (
    <div className="animate-slide-up space-y-5 pb-4">
      {/* Control Panel */}
      <div className="manga-card rounded-lg p-4 space-y-3">
        {!hasApiKey && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-yellow-500/10 border border-yellow-500/30">
            <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              OpenRouter API key required for DeepSeek/GPT-4o/Claude models. Go to Settings to add your key.
            </p>
          </div>
        )}

        {images.length === 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-muted/40">
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              No images uploaded yet. Go to Upload tab to add manga pages.
            </p>
          </div>
        )}

        {totalCount > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{totalCount} image{totalCount !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-3">
              {doneCount > 0 && (
                <span className="text-green-400">{doneCount} done</span>
              )}
              {errorCount > 0 && (
                <span className="text-red-400">{errorCount} failed</span>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          className="manga-btn-filled w-full flex items-center justify-center gap-2 font-semibold rounded-lg"
          onClick={onStartTranslation}
          disabled={isProcessing || images.length === 0 || !hasApiKey}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Translation
            </>
          )}
        </button>
      </div>

      {/* Image Cards */}
      <div className="space-y-3">
        {images.map((img, idx) => {
          const statusConfig = getStatusConfig(img.status);
          const isOcrExpanded = expandedOcr.has(img.id);
          const isTranslationExpanded = expandedTranslation.has(img.id);

          return (
            <div key={img.id} className="manga-card rounded-lg overflow-hidden">
              {/* Card Header */}
              <div className="flex items-center gap-3 p-3">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-md overflow-hidden shrink-0 bg-muted/30">
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {idx + 1}. {img.file.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`
                        inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                        ${statusConfig.bgClass} ${statusConfig.textClass}
                      `}
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </div>
                </div>

                {/* Retry button */}
                {img.status === "error" && (
                  <button
                    type="button"
                    className="manga-btn p-2 text-xs shrink-0"
                    onClick={() => onRetryImage(img.id)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* OCR Progress */}
              {(img.status === "ocr" || img.ocrProgress > 0) && (
                <div className="px-3 pb-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>OCR Progress</span>
                    <span>{Math.round(img.ocrProgress)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${img.ocrProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error message */}
              {img.status === "error" && img.errorMessage && (
                <div className="mx-3 mb-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30">
                  <p className="text-xs text-red-400">{img.errorMessage}</p>
                </div>
              )}

              {/* Extracted Text */}
              {img.extractedText && (
                <div className="px-3 pb-2">
                  <button
                    type="button"
                    onClick={() => toggleOcr(img.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1 w-full text-left"
                  >
                    {isOcrExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    Extracted Text
                  </button>
                  {isOcrExpanded && (
                    <div className="rounded-md bg-muted/30 border border-border p-2.5 max-h-32 overflow-y-auto scrollbar-thin">
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap font-mono">
                        {img.extractedText}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Translated Text */}
              {(img.status === "done" || img.translatedText) && (
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => toggleTranslation(img.id)}
                    className="flex items-center gap-1 text-xs text-cyan hover:text-cyan/80 transition-colors mb-1 w-full text-left"
                  >
                    {isTranslationExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    Translation
                  </button>
                  {isTranslationExpanded && (
                    <textarea
                      className="
                        w-full rounded-md bg-muted/30 border border-cyan/30
                        p-2.5 text-xs text-foreground
                        min-h-[80px] resize-y
                        focus:outline-none focus:border-cyan/60
                        transition-colors
                        font-sans
                      "
                      value={img.translatedText}
                      onChange={(e) =>
                        onUpdateTranslatedText(img.id, e.target.value)
                      }
                      placeholder="Translation will appear here..."
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {images.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Upload images first to start translating
          </p>
        </div>
      )}
    </div>
  );
}
