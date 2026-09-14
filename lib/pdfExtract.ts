import { ManualPage } from "./types";

export const MAX_PAGES_TOTAL = 10;
export const MAX_MANUALS = 2;

export class PdfLimitError extends Error {}

/**
 * Extracts per-page plain text from a PDF, server-side. Uses pdfjs-dist's legacy
 * Node build so no browser DOM or worker thread is required (pdfjs falls back to
 * an in-process "fake worker" when it detects no window object).
 */
export async function extractPdfPages(data: Uint8Array): Promise<ManualPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: ManualPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: i, text });
  }
  await doc.destroy();
  return pages;
}
