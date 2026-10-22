// Mirrors the `payload` dict built in Flask's /upload and /download_report routes.

export interface PdfSummaryRow {
  "Rule ID": string;
  Description: string;
  Level: number;
  Count: number;
}

export interface ChartData {
  levels: string[];
  actions: string[];
  action_counts: Record<string, number[]>;
}

export interface ReportPayload {
  chart: ChartData;
  pdf_summary: PdfSummaryRow[];
  /** Data-URLs (web) — Flask passed /uploads/<file> URLs here. */
  pdf_images: string[];
}

export interface ImageAndFile {
  /** Data-URL for <img src> / download href */
  url: string;
  filename: string;
}

/** Result of processing one Excel + one PDF (was: report.html template context). */
export interface ProcessResult {
  payload: ReportPayload;
  filename_excel: string;
  filename_pdf: string;
  /** `${base}_filtered.xlsx` as bytes — served as a Blob download in the browser. */
  filteredXlsx: Uint8Array;
  filteredXlsxName: string;
  summaryCsv: string;
  summaryCsvName: string;
  summaryXlsx: Uint8Array;
  summaryXlsxName: string;
  images_and_files: ImageAndFile[];
}
