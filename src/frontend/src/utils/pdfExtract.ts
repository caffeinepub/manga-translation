// ──────────────────────────────────────────────
// PDF Page Extraction using pdfjs-dist
// ──────────────────────────────────────────────

import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Configure worker using CDN to avoid dynamic import issues in deployed environments
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export interface ExtractedPage {
  imageFile: File;
  pageNumber: number;
}

/**
 * Parse a page range string and return an array of page numbers (1-based).
 * Supports:
 *   - "all" or undefined → all pages
 *   - "1-5" → [1, 2, 3, 4, 5]
 *   - "1,3,5" → [1, 3, 5]
 *   - "1-3,5,7-9" → [1, 2, 3, 5, 7, 8, 9]
 */
function parsePageRange(range: string | undefined, totalPages: number): number[] {
  if (!range || range.trim().toLowerCase() === "all" || range.trim() === "") {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  const parts = range.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
        if (p >= 1 && p <= totalPages) pages.add(p);
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= totalPages) {
        pages.add(num);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Renders a single PDF page to a canvas and returns a PNG File.
 */
async function renderPageToFile(
  pdfDoc: PDFDocumentProxy,
  pageNum: number,
  pdfFileName: string,
  scale: number = 1.5
): Promise<File> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  await page.render({
    canvasContext: ctx,
    canvas,
    viewport,
  }).promise;

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Failed to convert page ${pageNum} to blob`));
          return;
        }
        const file = new File(
          [blob],
          `${pdfFileName}-page-${pageNum}.png`,
          { type: "image/png" }
        );
        resolve(file);
      },
      "image/png",
      1.0
    );
  });
}

/**
 * Extract pages from a PDF file as image Files.
 * @param file - The PDF file to extract pages from
 * @param pageRange - Optional page range string ("1-5", "1,3,5", "all", or undefined = all)
 * @param onProgress - Optional callback with (currentPage, totalPages)
 */
export async function extractPdfPages(
  file: File,
  pageRange?: string,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdfDoc.numPages;
  const pagesToExtract = parsePageRange(pageRange, totalPages);

  const results: ExtractedPage[] = [];

  for (let i = 0; i < pagesToExtract.length; i++) {
    const pageNum = pagesToExtract[i];
    onProgress?.(i + 1, pagesToExtract.length);

    const imageFile = await renderPageToFile(pdfDoc, pageNum, file.name);
    results.push({ imageFile, pageNumber: pageNum });
  }

  return results;
}

/**
 * Get the total page count of a PDF file without extracting pages.
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdfDoc.numPages;
}
