// Ports the Flask /upload route end-to-end, but entirely in-memory.
// Flask wrote uploads/<file> to disk and linked to them; on Vercel the
// filesystem is ephemeral and serverless requests are size-limited, so the
// same artefacts are produced as Blobs / data-URLs and downloaded client-side.
import { baseName, KEEP_COLUMNS, secureFilename } from "./constants";
import { parseExcelBuffer, rowsToXlsx, summaryToCsv, summaryToXlsx } from "./excel";
import { extractPdfSummary } from "./pdf-summary";
import { extractImagesAndRasterFromPdf } from "./pdf-images";
import type { ProcessResult } from "./types";

export async function processUpload(excelFile: File, pdfFile: File): Promise<ProcessResult> {
  const excelName = secureFilename(excelFile.name); // secure_filename(...)
  const pdfName = secureFilename(pdfFile.name);
  const base = baseName(excelName); // os.path.splitext(excel_name)[0]

  // --- Parse Excel (keep columns defined in KEEP_COLUMNS) -------------------
  const excelBuf = await excelFile.arrayBuffer();
  const { filtered, chart } = parseExcelBuffer(excelBuf);
  const filteredXlsx = rowsToXlsx(filtered, KEEP_COLUMNS); // f"{base}_filtered.xlsx"

  // --- Extract PDF summary table (text) ------------------------------------
  const pdfBuf = new Uint8Array(await pdfFile.arrayBuffer());
  const pdfSummary = await extractPdfSummary(pdfBuf);
  const head200 = pdfSummary.slice(0, 200); // pdf_summary.head(200)

  // save_summary(pdf_summary, base) -> *_summary.csv / *_summary.xlsx
  const summaryCsv = summaryToCsv(pdfSummary);
  const summaryXlsx = summaryToXlsx(pdfSummary);

  // --- Extract images from PDF (embedded + raster), keep only first 2 ------
  const pdfBase = baseName(pdfName);
  const extracted = await extractImagesAndRasterFromPdf(
    await pdfFile.arrayBuffer(),
    pdfBase,
    true,
    true
  );
  const images = extracted.slice(0, 2);

  return {
    payload: {
      chart,
      pdf_summary: head200,
      pdf_images: images.map((i) => i.url),
    },
    filename_excel: excelName,
    filename_pdf: pdfName,
    filteredXlsx,
    filteredXlsxName: `${base}_filtered.xlsx`,
    summaryCsv,
    summaryCsvName: `${base}_summary.csv`,
    summaryXlsx,
    summaryXlsxName: `${base}_summary.xlsx`,
    images_and_files: images,
  };
}
