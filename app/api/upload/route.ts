import { NextRequest, NextResponse } from "next/server";
import { baseName, KEEP_COLUMNS, secureFilename } from "@/lib/constants";
import { parseExcelBuffer, rowsToXlsx, summaryToCsv, summaryToXlsx } from "@/lib/excel";
import { extractPdfSummary } from "@/lib/pdf-summary";

// Flask ran as a long-lived server with a writable uploads/ folder.
// Vercel serverless functions are stateless/ephemeral, so this route mirrors
// Flask's POST /upload logic but returns every artefact inline (base64)
// instead of saving files and linking to /uploads/<filename>.
export const runtime = "nodejs";
export const maxDuration = 60;

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const excelFile = form.get("excel_file");
  const pdfFile = form.get("pdf_file");

  // Flask: if not excel_file or not pdf_file: flash(...); redirect(index)
  if (!(excelFile instanceof File) || !(pdfFile instanceof File)) {
    return NextResponse.json({ error: "Please upload both Excel and PDF files." }, { status: 400 });
  }

  const excelName = secureFilename(excelFile.name);
  const pdfName = secureFilename(pdfFile.name);
  const base = baseName(excelName);

  // Parse Excel (keep columns defined in KEEP_COLUMNS)
  const { filtered, chart } = parseExcelBuffer(await excelFile.arrayBuffer());
  const filteredXlsx = rowsToXlsx(filtered, KEEP_COLUMNS);

  // Extract PDF summary table (text)
  const pdfSummary = await extractPdfSummary(new Uint8Array(await pdfFile.arrayBuffer()));

  // save_summary(pdf_summary, base)
  const summaryCsv = summaryToCsv(pdfSummary);
  const summaryXlsx = summaryToXlsx(pdfSummary);

  // NOTE: PDF image extraction/rasterisation (PyMuPDF + PIL in Flask) is done
  // in the browser with pdf.js + Canvas (lib/pdf-images.ts) because Vercel
  // functions have no native rasteriser — the web UI merges those images in.
  return NextResponse.json({
    payload: {
      chart,
      pdf_summary: pdfSummary.slice(0, 200), // pdf_summary.head(200)
      pdf_images: [] as string[],
    },
    filename_excel: excelName,
    filename_pdf: pdfName,
    files: {
      [`${base}_filtered.xlsx`]: toBase64(filteredXlsx),
      [`${base}_summary.csv`]: Buffer.from(summaryCsv, "utf-8").toString("base64"),
      [`${base}_summary.xlsx`]: toBase64(summaryXlsx),
    },
  });
}
