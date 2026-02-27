import React, { useCallback, useRef, useState } from "react";
import { Download, Package, ImageIcon, FileText, Loader2 } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { MangaImage, OcrTextBlock } from "../types/manga";
import { exportAsPdf } from "../utils/pdfExport";

interface ExportTabProps {
  images: MangaImage[];
}

/**
 * Loads a Noto Sans font with full Devanagari (Hindi) support via the FontFace API.
 * Uses a reliable CDN woff2 that supports Devanagari glyphs.
 */
let _notoFontLoaded = false;
async function loadHindiFont(): Promise<void> {
  if (_notoFontLoaded) return;
  try {
    // Noto Sans with Devanagari subset — served from Google Fonts CDN
    const fontUrls = [
      // Noto Sans Devanagari variable font
      "url(https://fonts.gstatic.com/s/notosansdevanagari/v25/TuGOUUFzXI5FBtUq5a8bjKYTZjtgv8Pl5dP0YX8.woff2) format('woff2')",
      // Fallback: Noto Sans latin
      "url(https://fonts.gstatic.com/s/notosans/v36/o-0bIpQlx3QUlC5A4PNjXhFlY9aA5W8.woff2) format('woff2')",
    ];

    const devanagari = new FontFace("Noto Sans Devanagari", fontUrls[0], {
      style: "normal",
      weight: "400",
    });
    const latin = new FontFace("Noto Sans", fontUrls[1], {
      style: "normal",
      weight: "400",
    });

    const [loadedDev, loadedLatin] = await Promise.allSettled([
      devanagari.load(),
      latin.load(),
    ]);

    if (loadedDev.status === "fulfilled") document.fonts.add(loadedDev.value);
    if (loadedLatin.status === "fulfilled") document.fonts.add(loadedLatin.value);

    _notoFontLoaded = true;
  } catch {
    // Font load failed — canvas will still render with system fallback
    _notoFontLoaded = true;
  }
}

/**
 * Wraps text for canvas rendering, handling both space-delimited (Latin) and
 * character-by-character (Devanagari/Hindi/CJK) scripts correctly.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    // Try word-by-word first (works for Latin/English)
    const words = paragraph.split(" ");
    let current = "";

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        // If the single word itself exceeds maxWidth, break it character by character
        if (!current) {
          // Break this oversized word char by char
          let charBuf = "";
          for (const char of word) {
            const charTest = charBuf + char;
            if (ctx.measureText(charTest).width <= maxWidth) {
              charBuf = charTest;
            } else {
              if (charBuf) lines.push(charBuf);
              charBuf = char;
            }
          }
          current = charBuf;
        } else {
          lines.push(current);
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/**
 * Splits a translated string into per-line chunks by matching the number of
 * OCR source lines.  Falls back to evenly distributing words.
 */
function splitTranslationToLines(translatedText: string, lineCount: number): string[] {
  if (lineCount <= 0) return [translatedText];
  // If translated text already has newlines (some models return them), respect those
  const newlineChunks = translatedText.split(/\n+/).filter(Boolean);
  if (newlineChunks.length >= lineCount) return newlineChunks.slice(0, lineCount);

  // Distribute words evenly across lines
  const words = translatedText.split(/\s+/).filter(Boolean);
  const perLine = Math.ceil(words.length / lineCount);
  const chunks: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    chunks.push(words.slice(i * perLine, (i + 1) * perLine).join(" "));
  }
  return chunks.filter(Boolean);
}

export async function renderTranslatedCanvas(img: MangaImage): Promise<HTMLCanvasElement> {
  // Load Hindi/Devanagari font before drawing
  await loadHindiFont();

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context not available"));
        return;
      }

      // Draw original image
      ctx.drawImage(image, 0, 0);

      if (!img.translatedText) {
        resolve(canvas);
        return;
      }

      // ── In-place overlay: replace each OCR text block with Hindi text ──
      const blocks: OcrTextBlock[] = img.ocrBlocks ?? [];

      if (blocks.length > 0) {
        // Group nearby blocks into "paragraph" groups so the translation can
        // be distributed across them proportionally.
        // Simple strategy: split translation to the same number of line-blocks.
        const hindiLines = splitTranslationToLines(img.translatedText, blocks.length);

        blocks.forEach((block, i) => {
          const hindi = hindiLines[i] ?? "";
          if (!hindi) return;

          // Determine background color from a sample of the original image area.
          // Most manga speech bubbles are white; dark backgrounds are also common.
          // We'll sample the center of the block.
          const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.round(block.x + block.width / 2)));
          const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.round(block.y + block.height / 2)));
          const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
          const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
          const bgColor = brightness > 128 ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.90)";
          const textColor = brightness > 128 ? "#000000" : "#ffffff";

          // Add some padding around the block
          const pad = Math.max(2, Math.round(block.height * 0.1));
          const rx = Math.max(0, block.x - pad);
          const ry = Math.max(0, block.y - pad);
          const rw = Math.min(canvas.width - rx, block.width + pad * 2);
          const rh = Math.min(canvas.height - ry, block.height + pad * 2);

          // White-out (or dark-out) the original English text region
          ctx.fillStyle = bgColor;
          ctx.fillRect(rx, ry, rw, rh);

          // Fit font size to the block height -- Devanagari needs a bit more room
          const fontSize = Math.max(10, Math.round(block.height * 0.75));
          ctx.font = `${fontSize}px "Noto Sans Devanagari", "Noto Sans", sans-serif`;
          ctx.fillStyle = textColor;
          ctx.textBaseline = "middle";
          ctx.textAlign = "center";

          // Wrap the Hindi text if it overflows the block width
          const wrappedLines = wrapText(ctx, hindi, rw - pad * 2);
          const lineH = fontSize * 1.5;
          const totalH = wrappedLines.length * lineH;
          const startY = ry + rh / 2 - totalH / 2 + lineH / 2;

          wrappedLines.forEach((wLine, li) => {
            ctx.fillText(wLine, rx + rw / 2, startY + li * lineH, rw - pad * 2);
          });

          // Reset alignment
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
        });
      } else {
        // Fallback: no bounding boxes available -- draw Hindi text as bottom overlay panel
        const padding = 20;
        const overlayHeight = Math.min(canvas.height * 0.45, 320);
        const overlayY = canvas.height - overlayHeight;

        ctx.fillStyle = "rgba(0, 0, 0, 0.90)";
        ctx.fillRect(0, overlayY, canvas.width, overlayHeight);
        ctx.fillStyle = "rgba(0, 212, 255, 0.9)";
        ctx.fillRect(0, overlayY, canvas.width, 3);

        const fontSize = Math.max(16, Math.min(24, canvas.width / 25));
        ctx.font = `${fontSize}px "Noto Sans Devanagari", "Noto Sans", sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "top";

        const maxWidth = canvas.width - padding * 2;
        const lineHeight = fontSize * 1.7;
        const lines = wrapText(ctx, img.translatedText, maxWidth);
        const maxLines = Math.floor((overlayHeight - padding * 2) / lineHeight);

        lines.slice(0, maxLines).forEach((line, i) => {
          ctx.fillText(line, padding, overlayY + padding + i * lineHeight);
        });

        if (lines.length > maxLines) {
          ctx.fillStyle = "rgba(0, 212, 255, 0.8)";
          ctx.fillText("…", padding, overlayY + padding + maxLines * lineHeight);
        }
      }

      resolve(canvas);
    };
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = img.previewUrl;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/png",
      1.0
    );
  });
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function ExportTab({ images }: ExportTabProps) {
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  const downloadSingle = useCallback(async (img: MangaImage) => {
    try {
      const canvas = await renderTranslatedCanvas(img);
      const blob = await canvasToBlob(canvas);
      saveAs(blob, `${stripExtension(img.file.name)}_translated.png`);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, []);

  const downloadAll = useCallback(async () => {
    const doneImages = images.filter((img) => img.status === "done");
    if (doneImages.length === 0) return;

    const zip = new JSZip();

    await Promise.all(
      doneImages.map(async (img) => {
        try {
          const canvas = await renderTranslatedCanvas(img);
          const blob = await canvasToBlob(canvas);
          zip.file(`${stripExtension(img.file.name)}_translated.png`, blob);
        } catch (err) {
          console.error(`Failed to export ${img.file.name}:`, err);
        }
      })
    );

    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, "manga_translated.zip");
  }, [images]);

  const downloadPdf = useCallback(async () => {
    const doneImages = images.filter((img) => img.status === "done");
    if (doneImages.length === 0) return;

    setIsPdfExporting(true);
    setPdfProgress(null);

    try {
      await exportAsPdf(doneImages, "manga_translated.pdf", (current, total) => {
        setPdfProgress({ current, total });
      });
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setIsPdfExporting(false);
      setPdfProgress(null);
    }
  }, [images]);

  const doneImages = images.filter((img) => img.status === "done");
  const canExport = doneImages.length > 0;

  return (
    <div className="animate-slide-up space-y-5 pb-4">
      {/* Export All */}
      <div className="manga-card rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Export All</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {doneImages.length} of {images.length} images ready
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="manga-btn flex items-center gap-2 text-sm"
              onClick={downloadAll}
              disabled={!canExport}
            >
              <Package className="w-4 h-4" />
              ZIP
            </button>
            <button
              type="button"
              className="manga-btn flex items-center gap-2 text-sm"
              onClick={downloadPdf}
              disabled={!canExport || isPdfExporting}
            >
              {isPdfExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {pdfProgress ? `${pdfProgress.current}/${pdfProgress.total}` : "PDF..."}
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  PDF
                </>
              )}
            </button>
          </div>
        </div>

        {!canExport && images.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Complete translations in the Translate tab first.
          </p>
        )}

        {images.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No images uploaded yet.
          </p>
        )}
      </div>

      {/* Per-Image Export */}
      <div className="space-y-3">
        {doneImages.map((img) => (
          <ImageExportCard
            key={img.id}
            img={img}
            onDownload={() => downloadSingle(img)}
          />
        ))}
      </div>

      {images.length > 0 && doneImages.length === 0 && (
        <div className="text-center py-8">
          <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No translations complete yet
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Run translation to generate exports
          </p>
        </div>
      )}
    </div>
  );
}

interface ImageExportCardProps {
  img: MangaImage;
  onDownload: () => void;
}

function ImageExportCard({ img, onDownload }: ImageExportCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderPreview = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const rendered = await renderTranslatedCanvas(img);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      ctx.drawImage(rendered, 0, 0);
    } catch (err) {
      console.error("Preview render failed:", err);
    }
  }, [img]);

  // Render on mount
  React.useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  return (
    <div className="manga-card rounded-lg overflow-hidden">
      {/* Preview Canvas */}
      <div className="relative bg-muted/20">
        <canvas
          ref={canvasRef}
          className="w-full h-auto max-h-64 object-contain"
          style={{ display: "block" }}
        />
        {/* Fallback image until canvas renders */}
        <img
          src={img.previewUrl}
          alt={img.file.name}
          className="absolute inset-0 w-full h-full object-contain opacity-0"
          aria-hidden="true"
        />
      </div>

      {/* Card Footer */}
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {img.sourcePdfName && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-cyan/10 text-cyan border border-cyan/20">
                  <FileText className="w-3 h-3" />
                  p.{img.pageNumber}
                </span>
              )}
              <p className="text-sm font-medium text-foreground truncate">
                {img.sourcePdfName
                  ? img.sourcePdfName.replace(/\.pdf$/i, "")
                  : img.file.name}
              </p>
            </div>
            {img.sourcePdfName ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Page {img.pageNumber} of {img.sourcePdfName}
              </p>
            ) : (
              <p className="text-xs text-green-400 mt-0.5">✓ Translation complete</p>
            )}
          </div>
          <button
            type="button"
            className="manga-btn flex items-center gap-2 text-sm shrink-0 ml-2"
            onClick={onDownload}
          >
            <Download className="w-3.5 h-3.5" />
            PNG
          </button>
        </div>

        {/* Prominent download button */}
        <button
          type="button"
          className="
            w-full flex items-center justify-center gap-2
            py-2.5 px-4 rounded-md text-sm font-semibold
            bg-green-500/20 text-green-400 border border-green-500/40
            hover:bg-green-500/30 hover:border-green-400/60
            active:scale-[0.98] transition-all duration-150
          "
          onClick={onDownload}
        >
          <Download className="w-4 h-4" />
          Download Hindi Image
        </button>
      </div>

      {/* Translation preview */}
      {img.translatedText && (
        <div className="px-3 pb-3">
          <div className="rounded-md bg-muted/30 border border-cyan/20 p-2.5">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Translation</p>
            <p className="text-xs text-foreground/80 line-clamp-3">
              {img.translatedText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
