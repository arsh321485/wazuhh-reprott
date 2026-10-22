"use client";

// Port of templates/index.html (GET /) + the POST /upload flow.
// Flask rendered report.html from the server; here the upload is processed
// in-memory (lib/process-report.ts) and the same report renders client-side,
// so nothing has to be stored on a server filesystem (Vercel-safe).
import { useState } from "react";
import Report from "@/components/Report";
import { processUpload } from "@/lib/process-report";
import type { ProcessResult } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [flash, setFlash] = useState<string | null>(null); // get_flashed_messages()
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const excel = (form.elements.namedItem("excel_file") as HTMLInputElement).files?.[0];
    const pdf = (form.elements.namedItem("pdf_file") as HTMLInputElement).files?.[0];

    // Flask: if not excel_file or not pdf_file: flash("Please upload both...")
    if (!excel || !pdf) {
      setFlash("Please upload both Excel and PDF files.");
      return;
    }
    setFlash(null);
    setBusy(true);
    try {
      setResult(await processUpload(excel, pdf));
    } catch (err) {
      console.error(err);
      setFlash(
        `Failed to process files. Check the Excel/CSV and PDF and try again. (${err instanceof Error ? err.message : String(err)})`
      );
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return <Report result={result} onBack={() => setResult(null)} />;
  }

  return (
    <div className="upload-wrap">
      <div className="upload-card">
        <h2>Upload Wazuh Files (Excel + PDF)</h2>
        <p>Excel/CSV supplies data, PDF supplies Alerts summary.</p>

        {flash && <div style={{ color: "#d9534f", marginBottom: 10 }}>{flash}</div>}

        <form method="post" encType="multipart/form-data" onSubmit={onSubmit} id="uploadForm">
          <label>
            Excel / CSV file:
            <input type="file" name="excel_file" accept=".xlsx,.xls,.csv" required className="form-control" />
          </label>
          <label>
            PDF file:
            <input type="file" name="pdf_file" accept=".pdf" required className="form-control" />
          </label>
          <button
            type="submit"
            disabled={busy}
            style={{
              background: "#0b5ed7",
              color: "#fff",
              padding: "8px 12px",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {busy ? "Uploading..." : "Upload & Generate Report"}
          </button>
        </form>
      </div>
    </div>
  );
}
