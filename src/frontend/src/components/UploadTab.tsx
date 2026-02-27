import React, { useCallback, useRef, useState } from "react";
import { Upload, Camera, ImagePlus, X, FileImage, FileText, Loader2, Zap, Download, CheckCircle2 } from "lucide-react";
import { MangaImage } from "../types/manga";
import { extractPdfPages, getPdfPageCount } from "../utils/pdfExtract";

interface UploadTabProps {
  images: MangaImage[];
  onAddImages: (
    files: File[],
    metadata?: Array<{ pageNumber?: number; sourcePdfName?: string }>
  ) => void;
  onRemoveImage: (id: string) => void;
  onQuickTranslate?: (id: string) => Promise<void>;
  onDownloadImage?: (id: string) => Promise<void>;
}

interface PdfQueueItem {
  id: string;
  file: File;
  pageCount: number | null;
  pageRange: string;
  isExtracting: boolean;
  extractProgress: { current: number; total: number } | null;
  error: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let pdfIdCounter = 0;
function nextPdfId() {
  pdfIdCounter += 1;
  return `pdf-${Date.now()}-${pdfIdCounter}`;
}

export function UploadTab({ images, onAddImages, onRemoveImage, onQuickTranslate, onDownloadImage }: UploadTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pdfQueue, setPdfQueue] = useState<PdfQueueItem[]>([]);
  const [quickTranslatingIds, setQuickTranslatingIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleQuickTranslate = useCallback(async (id: string) => {
    if (!onQuickTranslate) return;
    setQuickTranslatingIds((prev) => new Set(prev).add(id));
    try {
      await onQuickTranslate(id);
    } finally {
      setQuickTranslatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [onQuickTranslate]);

  const handleDownload = useCallback(async (id: string) => {
    if (!onDownloadImage) return;
    setDownloadingIds((prev) => new Set(prev).add(id));
    try {
      await onDownloadImage(id);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [onDownloadImage]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const allFiles = Array.from(files);

      // Split image files and PDF files
      const imageFiles = allFiles.filter((f) => f.type.startsWith("image/"));
      const pdfFiles = allFiles.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );

      // Add image files directly
      if (imageFiles.length > 0) onAddImages(imageFiles);

      // Queue PDF files for extraction
      for (const pdfFile of pdfFiles) {
        const id = nextPdfId();
        const item: PdfQueueItem = {
          id,
          file: pdfFile,
          pageCount: null,
          pageRange: "",
          isExtracting: false,
          extractProgress: null,
          error: null,
        };

        setPdfQueue((prev) => [...prev, item]);

        // Load page count in the background
        getPdfPageCount(pdfFile)
          .then((count) => {
            setPdfQueue((prev) =>
              prev.map((q) => (q.id === id ? { ...q, pageCount: count } : q))
            );
          })
          .catch((err) => {
            setPdfQueue((prev) =>
              prev.map((q) =>
                q.id === id ? { ...q, error: `Failed to load PDF: ${err.message}` } : q
              )
            );
          });
      }
    },
    [onAddImages]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleExtractPdf = useCallback(
    async (pdfItem: PdfQueueItem) => {
      setPdfQueue((prev) =>
        prev.map((q) =>
          q.id === pdfItem.id
            ? { ...q, isExtracting: true, error: null, extractProgress: null }
            : q
        )
      );

      try {
        const extracted = await extractPdfPages(
          pdfItem.file,
          pdfItem.pageRange || undefined,
          (current, total) => {
            setPdfQueue((prev) =>
              prev.map((q) =>
                q.id === pdfItem.id
                  ? { ...q, extractProgress: { current, total } }
                  : q
              )
            );
          }
        );

        const files = extracted.map((e) => e.imageFile);
        const metadata = extracted.map((e) => ({
          pageNumber: e.pageNumber,
          sourcePdfName: pdfItem.file.name,
        }));

        onAddImages(files, metadata);

        // Remove from queue after successful extraction
        setPdfQueue((prev) => prev.filter((q) => q.id !== pdfItem.id));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Extraction failed";
        setPdfQueue((prev) =>
          prev.map((q) =>
            q.id === pdfItem.id
              ? { ...q, isExtracting: false, error: errorMsg }
              : q
          )
        );
      }
    },
    [onAddImages]
  );

  const handleRemovePdfFromQueue = useCallback((id: string) => {
    setPdfQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const handlePdfRangeChange = useCallback((id: string, range: string) => {
    setPdfQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, pageRange: range } : q))
    );
  }, []);

  return (
    <div className="animate-slide-up space-y-5 pb-4">
      {/* Drop Zone */}
      <button
        type="button"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3 w-full text-left
          min-h-[180px] rounded-lg border-2 border-dashed cursor-pointer
          transition-all duration-200
          ${isDragging
            ? "border-cyan bg-cyan/10 scale-[1.01]"
            : "border-border hover:border-cyan/60 hover:bg-muted/30"
          }
        `}
      >
        <div
          className={`
            p-4 rounded-full transition-all duration-200
            ${isDragging ? "bg-cyan/20" : "bg-muted/50"}
          `}
        >
          <Upload
            className={`w-8 h-8 transition-colors ${isDragging ? "text-cyan" : "text-muted-foreground"}`}
          />
        </div>
        <div className="text-center px-4">
          <p className={`font-medium transition-colors ${isDragging ? "text-cyan" : "text-foreground"}`}>
            {isDragging ? "Drop files here" : "Drag & drop manga pages or PDFs"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or tap to browse files
          </p>
        </div>
        <p className="text-xs text-muted-foreground/70">
          PNG, JPG, WEBP, PDF supported
        </p>
      </button>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="manga-btn flex items-center justify-center gap-2 text-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="w-4 h-4" />
          Browse Files
        </button>
        <button
          type="button"
          className="manga-btn flex items-center justify-center gap-2 text-sm"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="w-4 h-4" />
          Camera
        </button>
      </div>

      {/* PDF Queue */}
      {pdfQueue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan" />
            <h3 className="text-sm font-semibold text-foreground">PDF Files</h3>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
              {pdfQueue.length}
            </span>
          </div>
          {pdfQueue.map((pdfItem) => (
            <PdfQueueCard
              key={pdfItem.id}
              item={pdfItem}
              onExtract={() => handleExtractPdf(pdfItem)}
              onRemove={() => handleRemovePdfFromQueue(pdfItem.id)}
              onRangeChange={(range) => handlePdfRangeChange(pdfItem.id, range)}
            />
          ))}
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Uploaded Images
            </h3>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
              {images.length}
            </span>
          </div>

          {/* Quick action: Translate all waiting images */}
          {onQuickTranslate && images.some((img) => img.status === "waiting") && (
            <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Quick Translate to Hindi</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  OCR + translate using Gemini 2.5 Flash — no API key needed
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void Promise.all(
                    images
                      .filter((img) => img.status === "waiting")
                      .map((img) => handleQuickTranslate(img.id))
                  );
                }}
                className="manga-btn-filled shrink-0 flex items-center gap-2 text-sm px-4 py-2 rounded-md font-medium"
              >
                <Zap className="w-4 h-4" />
                Translate All
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => {
              const isQuickTranslating = quickTranslatingIds.has(img.id);
              const isDownloading = downloadingIds.has(img.id);
              const isDone = img.status === "done";
              const isInProgress = img.status === "ocr" || img.status === "translating" || isQuickTranslating;
              return (
                <div
                  key={img.id}
                  className="manga-card rounded-lg overflow-hidden relative group flex flex-col"
                >
                  <div className="aspect-[3/4] bg-muted/30 relative overflow-hidden">
                    <img
                      src={img.previewUrl}
                      alt={img.file.name}
                      className="w-full h-full object-cover"
                    />
                    {/* Status overlay */}
                    {(img.status !== "waiting" || isInProgress) && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <StatusDot status={isQuickTranslating && img.status === "waiting" ? "ocr" : img.status} />
                      </div>
                    )}
                    {/* PDF page badge */}
                    {img.pageNumber !== undefined && (
                      <div className="absolute top-1.5 left-1.5">
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-background/90 text-cyan border border-cyan/30">
                          <FileText className="w-3 h-3" />
                          p.{img.pageNumber}
                        </span>
                      </div>
                    )}
                    {/* Done checkmark */}
                    {isDone && (
                      <div className="absolute top-1.5 right-1.5">
                        <CheckCircle2 className="w-5 h-5 text-green-400 drop-shadow" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 flex-1 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      {img.sourcePdfName && (
                        <FileText className="w-3 h-3 text-cyan shrink-0" />
                      )}
                      <p className="text-xs font-medium text-foreground truncate">
                        {img.sourcePdfName
                          ? img.sourcePdfName.replace(/\.pdf$/i, "")
                          : img.file.name}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {img.sourcePdfName
                        ? `Page ${img.pageNumber}`
                        : formatBytes(img.file.size)}
                    </p>

                    {/* Per-image action buttons */}
                    {onQuickTranslate && img.status === "waiting" && !isQuickTranslating && (
                      <button
                        type="button"
                        onClick={() => handleQuickTranslate(img.id)}
                        className="w-full mt-auto manga-btn-filled flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md font-medium"
                      >
                        <Zap className="w-3 h-3" />
                        Translate
                      </button>
                    )}

                    {isInProgress && (
                      <div className="w-full mt-auto flex items-center justify-center gap-1.5 text-xs py-1.5 text-cyan">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {img.status === "ocr" ? "Running OCR..." : "Translating..."}
                      </div>
                    )}

                    {isDone && onDownloadImage && (
                      <button
                        type="button"
                        onClick={() => handleDownload(img.id)}
                        disabled={isDownloading}
                        className="w-full mt-auto flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md font-medium bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-60"
                      >
                        {isDownloading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        {isDownloading ? "Saving..." : "Download"}
                      </button>
                    )}
                  </div>
                  {/* Remove button */}
                  {img.status === "waiting" && !isQuickTranslating && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(img.id);
                      }}
                      className="
                        absolute top-1.5 right-1.5 p-1 rounded-md
                        bg-background/80 text-muted-foreground
                        hover:bg-destructive/20 hover:text-destructive
                        opacity-0 group-hover:opacity-100
                        transition-all duration-150
                      "
                      aria-label="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add more */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="
                aspect-[3/4] rounded-lg border-2 border-dashed border-border
                flex flex-col items-center justify-center gap-2
                text-muted-foreground hover:text-cyan hover:border-cyan/60
                transition-all duration-200
              "
            >
              <FileImage className="w-6 h-6" />
              <span className="text-xs">Add more</span>
            </button>
          </div>
        </div>
      )}

      {images.length === 0 && pdfQueue.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground/70">
            Upload manga pages (images or PDFs) to get started
          </p>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// PDF Queue Card
// ──────────────────────────────────────────────

interface PdfQueueCardProps {
  item: PdfQueueItem;
  onExtract: () => void;
  onRemove: () => void;
  onRangeChange: (range: string) => void;
}

function PdfQueueCard({ item, onExtract, onRemove, onRangeChange }: PdfQueueCardProps) {
  const progressPercent =
    item.extractProgress
      ? Math.round((item.extractProgress.current / item.extractProgress.total) * 100)
      : 0;

  return (
    <div className="manga-card rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-md bg-cyan/10 border border-cyan/20 shrink-0">
          <FileText className="w-4 h-4 text-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(item.file.size)}
            {item.pageCount !== null && (
              <span className="ml-2 text-cyan/80">{item.pageCount} pages</span>
            )}
          </p>
        </div>
        {!item.isExtracting && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Remove PDF"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Page range input */}
      {!item.isExtracting && (
        <div className="space-y-1">
          <label htmlFor={`pdf-range-${item.id}`} className="text-xs text-muted-foreground font-medium">Page Range</label>
          <input
            id={`pdf-range-${item.id}`}
            type="text"
            value={item.pageRange}
            onChange={(e) => onRangeChange(e.target.value)}
            placeholder={item.pageCount ? `all (1–${item.pageCount})` : "all pages"}
            disabled={item.isExtracting}
            className="
              w-full rounded-md border border-border bg-background/50
              px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50
              focus:outline-none focus:ring-1 focus:ring-cyan/60 focus:border-cyan/60
              transition-colors
            "
          />
          <p className="text-xs text-muted-foreground/70">
            Examples: &quot;1-5&quot;, &quot;1,3,5&quot;, &quot;2-4,7&quot;, or leave blank for all pages
          </p>
        </div>
      )}

      {/* Error */}
      {item.error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {item.error}
        </p>
      )}

      {/* Extraction progress */}
      {item.isExtracting && item.extractProgress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan" />
              Extracting page {item.extractProgress.current} of {item.extractProgress.total}...
            </span>
            <span className="text-cyan">{progressPercent}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Extract button */}
      {!item.isExtracting && (
        <button
          type="button"
          onClick={onExtract}
          disabled={item.pageCount === null && !item.error}
          className="manga-btn-filled w-full flex items-center justify-center gap-2 text-sm rounded-md font-medium px-4 py-2"
        >
          {item.pageCount === null && !item.error ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading PDF...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              Extract Pages
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Status indicator
// ──────────────────────────────────────────────

function StatusDot({ status }: { status: MangaImage["status"] }) {
  const map: Record<MangaImage["status"], { label: string; color: string }> = {
    waiting: { label: "Waiting", color: "text-muted-foreground" },
    ocr: { label: "OCR", color: "text-blue-400" },
    translating: { label: "Translating", color: "text-yellow-400" },
    done: { label: "Done", color: "text-green-400" },
    error: { label: "Error", color: "text-red-400" },
  };
  const { label, color } = map[status];
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded bg-background/80 ${color}`}>
      {label}
    </span>
  );
}
