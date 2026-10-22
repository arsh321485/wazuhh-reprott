"use client";

// Port of templates/report.html — same structure, classes and text.
// Jinja conditionals become props: hide_header / hide_images / images_and_files.
//
// NOTE: the original report.html contained Chart.js code for a #chart1
// canvas that never existed in the markup, so no chart ever appeared in the
// Flask report or its PDF. It is therefore NOT rendered here either (the
// chart data is still computed — see lib/excel.ts and /api/upload).
import { useState } from "react";
import type { ProcessResult } from "@/lib/types";
import { downloadBlob, XLSX_MIME } from "@/lib/excel";
import { generateReportPdf } from "@/lib/generate-report-pdf";

interface Props {
  result: ProcessResult;
  onBack: () => void;
}

export default function Report({ result, onBack }: Props) {
  const { payload } = result;
  const [pdfBusy, setPdfBusy] = useState(false);

  // Flask: GET /download_report?pdf=...&excel=... re-rendered report.html
  // with hide_header=True through headless Chrome. Here a real PDF file is
  // generated (lib/generate-report-pdf.ts) — window.print() was wrong
  // because the browser stamps its own date/URL/page-number header/footer.
  const onDownloadPdf = async () => {
    setPdfBusy(true);
    try {
      await generateReportPdf(result);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="container my-4">
      {/* Header / Summary — Flask showed this in the web view only */}
      <div className="card report-card mb-4 p-3">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start">
          <div>
            <h4 className="page-title mb-1">Celestyal Security Event Report</h4>
            <div className="small-muted">
              Excel: <strong>{result.filename_excel}</strong> &nbsp;|&nbsp; PDF:{" "}
              <strong>{result.filename_pdf}</strong>
            </div>
          </div>
          <div className="mt-3 mt-md-0">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary me-1"
              onClick={() =>
                downloadBlob(new Blob([result.filteredXlsx as BlobPart], { type: XLSX_MIME }), result.filteredXlsxName)
              }
            >
              ⬇ Filtered Excel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary me-1"
              onClick={() => downloadBlob(new Blob([result.summaryCsv], { type: "text/csv" }), result.summaryCsvName)}
            >
              ⬇ Summary CSV
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary me-1"
              onClick={() =>
                downloadBlob(new Blob([result.summaryXlsx as BlobPart], { type: XLSX_MIME }), result.summaryXlsxName)
              }
            >
              ⬇ Summary Excel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onDownloadPdf} disabled={pdfBusy}>
              {pdfBusy ? "Generating…" : "Download PDF"}
            </button>
            <button type="button" className="btn btn-sm btn-link" onClick={onBack}>
              New upload
            </button>
          </div>
        </div>
      </div>

      {/* Title and Logo - Always show in PDF */}
      <div className="card report-card mb-4 p-4">
        <div className="d-flex justify-content-between align-items-center" style={{ width: "100%" }}>
          <div style={{ flex: 1 }}>
            <h1 className="mb-0" style={{ color: "#064868", margin: 0 }}>
              Celestyal Security Event Report - Last Week
            </h1>
          </div>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {/* url_for('static', filename='logo.png') -> public/logo.png */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SecureITLab Logo" style={{ height: 72, width: "auto", display: "block" }} />
          </div>
        </div>
      </div>

      {/* Narrative */}
      <div className="card report-card mb-4 p-4">
        <h2 className="mb-2">Summary for the report</h2>
        <p className="mb-0 ">
          This report presents a detailed analysis of security events captured over the last week, extracted from
          Celestyal’s monitoring system via Wazuh. It includes a comprehensive chart of all types of actions,
          categorized by threat level to highlight the severity distribution of security events. Additionally, a
          frequency-based chart showcases the overall threat levels encountered during the period. The report also
          summarizes the key security events detected, providing insights into potential risks and attack attempts,
          aiding in real-time security posture assessment and incident response. Accompanying the visual data, a CSV
          file contains relevant event fields for further analysis.
        </p>
      </div>

      {/* Extracted PDF charts (images) */}
      <div className="card report-card mb-4 p-4">
        {result.images_and_files && result.images_and_files.length > 0 ? (
          <div className="row gy-4">
            {result.images_and_files.map(({ url, filename: fname }, idx) => (
              <div className="col-12" key={fname}>
                {idx === 0 ? (
                  <h2 className="mb-2">Alerts evolution — Top 5 agents</h2>
                ) : idx === 1 ? (
                  <h2 className="mb-2">Alert level evolution</h2>
                ) : (
                  <h2 className="mb-2">Chart {idx + 1}</h2>
                )}
                <div className="card image-card p-3">
                  <a href={url} target="_blank" rel="noreferrer" className="d-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={fname} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="alert alert-light mb-0">No images were extracted from the PDF.</div>
        )}
      </div>

      {/* Alerts summary table */}
      <div className="card report-card summary-card mb-5 p-4">
        <h2 className="mb-3">Alerts Summary</h2>
        <div className="table-responsive">
          <table className="table table-striped table-hover table-bordered align-middle">
            <thead className="table-dark">
              <tr>
                <th style={{ width: "5%" }}>Sr No</th>
                <th style={{ width: "12%" }}>Rule ID</th>
                <th>Description</th>
                <th style={{ width: "8%" }}>Level</th>
                <th style={{ width: "12%" }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {payload.pdf_summary && payload.pdf_summary.length > 0 ? (
                payload.pdf_summary.map((r, i) => (
                  <tr key={i}>
                    <td className="fw-semibold text-center">{i + 1}</td>
                    <td className="text-nowrap">{r["Rule ID"]}</td>
                    <td>{r.Description}</td>
                    <td className="text-end">{r.Level}</td>
                    <td className="text-end">{r.Count.toLocaleString("en-US")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center small-muted">
                    No summary data found .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
