// ──────────────────────────────────────────────
// PDF Export using jspdf
// ──────────────────────────────────────────────

import { jsPDF } from "jspdf";
import { MangaImage } from "../types/manga";

// Canvas rendering helpers (duplicated from ExportTab to keep utils self-contained)

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
    const words = paragraph.split(" ");
    let current = "";

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

async function renderTranslatedCanvas(img: MangaImage): Promise<HTMLCanvasElement> {
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

      if (img.translatedText) {
        const padding = 16;
        const overlayHeight = Math.min(canvas.height * 0.3, 200);
        const overlayY = canvas.height - overlayHeight;

        // Semi-transparent overlay panel
        ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
        ctx.fillRect(0, overlayY, canvas.width, overlayHeight);

        // Cyan top border on overlay
        ctx.fillStyle = "rgba(0, 212, 255, 0.8)";
        ctx.fillRect(0, overlayY, canvas.width, 2);

        // Translated text
        const fontSize = Math.max(14, Math.min(20, canvas.width / 30));
        ctx.font = `${fontSize}px 'Space Grotesk', system-ui, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "top";

        const maxWidth = canvas.width - padding * 2;
        const lineHeight = fontSize * 1.5;
        const lines = wrapText(ctx, img.translatedText, maxWidth);
        const maxLines = Math.floor((overlayHeight - padding * 2) / lineHeight);

        lines.slice(0, maxLines).forEach((line, i) => {
          ctx.fillText(line, padding, overlayY + padding + i * lineHeight);
        });

        // Ellipsis if truncated
        if (lines.length > maxLines) {
          ctx.fillStyle = "rgba(0, 212, 255, 0.8)";
          ctx.fillText("...", padding, overlayY + padding + maxLines * lineHeight);
        }
      }

      resolve(canvas);
    };
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = img.previewUrl;
  });
}

async function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL("image/png", 1.0);
}

/**
 * Export translated manga images as a single PDF file.
 * Only exports images with status "done".
 */
export async function exportAsPdf(
  images: MangaImage[],
  filename?: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const doneImages = images.filter((img) => img.status === "done");
  if (doneImages.length === 0) return;

  let pdf: jsPDF | null = null;

  for (let i = 0; i < doneImages.length; i++) {
    const img = doneImages[i];
    onProgress?.(i + 1, doneImages.length);

    const canvas = await renderTranslatedCanvas(img);
    const dataUrl = await canvasToDataUrl(canvas);

    // Use canvas dimensions in mm (convert px → mm at 96 DPI)
    const pxToMm = 25.4 / 96;
    const widthMm = canvas.width * pxToMm;
    const heightMm = canvas.height * pxToMm;

    if (pdf === null) {
      // Create PDF with first page dimensions
      pdf = new jsPDF({
        orientation: widthMm > heightMm ? "landscape" : "portrait",
        unit: "mm",
        format: [widthMm, heightMm],
      });
    } else {
      // Add new page with this image's dimensions
      pdf.addPage([widthMm, heightMm], widthMm > heightMm ? "landscape" : "portrait");
    }

    pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm, undefined, "FAST");
  }

  if (pdf) {
    pdf.save(filename ?? "manga_translated.pdf");
  }
}
