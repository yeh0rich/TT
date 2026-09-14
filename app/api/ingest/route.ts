import { NextRequest, NextResponse } from "next/server";
import { extractPdfPages, MAX_PAGES_TOTAL } from "@/lib/pdfExtract";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const started = performance.now();

  const form = await req.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let pages;
  try {
    pages = await extractPdfPages(bytes);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read this PDF (${err instanceof Error ? err.message : "unknown error"}).` },
      { status: 422 },
    );
  }

  if (pages.length > MAX_PAGES_TOTAL) {
    return NextResponse.json(
      {
        error: `This PDF has ${pages.length} pages. This prototype supports at most ${MAX_PAGES_TOTAL} pages total across all uploaded manuals.`,
      },
      { status: 413 },
    );
  }

  const emptyPages = pages.filter((p) => p.text.length === 0).length;
  if (emptyPages === pages.length) {
    return NextResponse.json(
      {
        error:
          "No extractable text found in this PDF. This prototype needs a text-based PDF, not a scanned image (no OCR is performed).",
      },
      { status: 422 },
    );
  }

  const ingestMs = Math.round(performance.now() - started);

  return NextResponse.json({
    title: title || file.name.replace(/\.pdf$/i, ""),
    fileName: file.name,
    pages,
    ingestMs,
  });
}
