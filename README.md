# Wajuh Report — Next.js (Vercel)

Next.js port of the Flask app in `flask-original/` (`app.py` + `templates/`).
Same upload → report flow, same report layout, ready to deploy on Vercel.

## Run locally

```bash
npm install
npm run dev    # http://localhost:3000
npm run build && npm start   # production
```

## Deploy on Vercel

```bash
npm i -g vercel
vercel        # or: push to GitHub and Import the repo at vercel.com/new
```

No environment variables, database, or blob storage are required. Framework
preset: **Next.js** (auto-detected). Root directory: this folder.

## Flask → Next.js mapping

| Flask (`flask-original/app.py`) | Next.js |
|---|---|
| `GET /` → `templates/index.html` | `app/page.tsx` (upload form) |
| `POST /upload` | `lib/process-report.ts` (UI) + `app/api/upload/route.ts` (API parity: `POST /api/upload`, returns JSON + base64 files) |
| `templates/report.html` | `components/Report.tsx` + `app/globals.css` (styles copied verbatim) |
| `GET /uploads/<filename>` (downloads) | Blob downloads in the browser (`filtered.xlsx`, `*_summary.csv/.xlsx`, chart images) |
| `GET /download_report` (headless Chrome → pdfkit → pyppeteer → xhtml2pdf) | **Download PDF** button: a real PDF generated in the browser (`lib/generate-report-pdf.ts`, jsPDF + autoTable, layout measured from the Flask output) saved as `{base}_report_{timestamp}.pdf`. `window.print()` is *not* used — browsers stamp their own date/URL/page-number header/footer on printed PDFs. `GET /api/download-report` is kept and explains this (410). |
| `KEEP_COLUMNS`, `allowed_file`, `secure_filename` | `lib/constants.ts` |
| Excel parse / filter / chart groupby (pandas) | `lib/excel.ts` (`xlsx`/SheetJS) |
| `extract_pdf_summary` (pdfplumber + regex) | `lib/pdf-summary.ts` (`unpdf`, same regex) |
| `extract_images_and_raster_from_pdf`, `remove_black_background`, `_avg_hash`, `_is_mostly_dark` (PyMuPDF + PIL) | `lib/pdf-images.ts` (`unpdf` `extractImages`/`renderPageAsImage` + Canvas, browser) |
| `static/logo.png` | `public/logo.png` |

## Why processing moved client-side (important Vercel differences)

The conversion is behaviour-identical, but three Flask assumptions do not
exist on Vercel, so the internals changed:

1. **No persistent filesystem** — Flask saved uploads to `uploads/` and
   re-read them in `/download_report`. Vercel functions are stateless, so all
   artefacts are generated in memory and downloaded as Blobs/base64.
2. **No Python / system binaries** — pandas, pdfplumber, PyMuPDF, PIL,
   wkhtmltopdf and headless Chrome/Edge cannot run in a Next.js function.
   SheetJS, unpdf/pdf.js and Canvas replace them; jsPDF replaces the
   PDF-generation fallback chain.
3. **Request size limits** — Flask allowed 200 MB uploads to its own server.
   Vercel serverless requests are capped (~4.5 MB), so the web UI processes
   files in the browser (no upload cap, files never leave the machine). The
   `/api/upload` route is provided for API parity for small files.

Faithfulness notes (verified against a real Flask-generated report):

- `report.html` contained Chart.js code for a `#chart1` canvas that never
  existed in the markup, so no actions-by-level chart ever appeared in the
  report/PDF — none is rendered here either (chart *data* is still computed
  in `lib/excel.ts` and returned by `/api/upload`).
- PDF text is rebuilt line-by-line from pdf.js text-item coordinates
  (like pdfplumber). Joining all text with spaces, as `unpdf` does by
  default, made the summary regex match across the Wazuh cover page and
  produced a bogus first row (`Rule ID 54 — "to 2026-10-16T09:10:54..."`).
- Embedded PDF images are extracted *after* rendering each page (pdf.js
  only resolves image objects then), and emitted before page rasters —
  Flask's order — so the report shows the two large chart images, not a
  shrunken full-page raster.

The original Flask code is preserved unchanged under `flask-original/`.
