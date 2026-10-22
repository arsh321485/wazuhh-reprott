// Generates the downloadable report PDF — the Next.js replacement for
// Flask's /download_report route (headless Edge -> pdfkit -> pyppeteer ->
// xhtml2pdf chain, none of which exist on Vercel).
//
// The previous version used window.print(), which is WRONG for this app:
// the browser adds its own header/footer (date, page title, "localhost:3000",
// "1/4"...) and the result depends on the user's print dialog settings.
// This generates a real PDF file in the browser with jsPDF, laid out to
// match the Flask/headless-Chrome output (A4, cards at x=22.9pt w=549.7pt,
// table columns/borders/fonts measured from that PDF), and saves it with
// Flask's filename: f"{base}_report_{utc:%Y%m%dT%H%M%S}.pdf".
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { baseName } from "./constants";
import type { ProcessResult } from "./types";

const NAVY: [number, number, number] = [6, 72, 104]; // #064868
const CARD_BORDER: [number, number, number] = [227, 232, 239]; // #e3e8ef
const PAGE_W = 595.28; // A4 pt
const CARD_X = 22.9;
const CARD_W = 549.7;
const CONTENT_X = 41.2;

const NARRATIVE =
  "This report presents a detailed analysis of security events captured over the last week, extracted from " +
  "Celestyal’s monitoring system via Wazuh. It includes a comprehensive chart of all types of actions, " +
  "categorized by threat level to highlight the severity distribution of security events. Additionally, a " +
  "frequency-based chart showcases the overall threat levels encountered during the period. The report also " +
  "summarizes the key security events detected, providing insights into potential risks and attack " +
  "attempts, aiding in real-time security posture assessment and incident response. Accompanying the visual " +
  "data, a CSV file contains relevant event fields for further analysis.";

function utcStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** Re-encode an extracted chart (PNG data-URL) as JPEG on white. */
function toJpeg(img: HTMLImageElement): string {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function card(doc: jsPDF, y: number, h: number) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.75);
  doc.roundedRect(CARD_X, y, CARD_W, h, 9, 9, "FD");
}

function heading(doc: jsPDF, text: string, yBaseline: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.8);
  doc.setTextColor(...NAVY);
  doc.text(text, PAGE_W / 2, yBaseline, { align: "center" });
}

export async function generateReportPdf(result: ProcessResult): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  // ---------- Page 1: title + summary + extracted charts ----------
  // Title card (y 28.9, h 90.7 in the reference PDF)
  card(doc, 28.9, 90.7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text("Celestyal Security Event Report - Last Week", CONTENT_X, 71);
  try {
    const logo = await urlToDataUrl("/logo.png");
    const logoImg = await loadImage(logo);
    const lh = 54;
    const lw = (logoImg.naturalWidth / logoImg.naturalHeight) * lh;
    doc.addImage(logo, "PNG", CARD_X + CARD_W - 18.4 - lw, 47.2, lw, lh);
  } catch {
    /* logo missing — Flask rendered a broken <img> too */
  }

  // Narrative card (y 138.4, h 120)
  card(doc, 138.4, 120);
  heading(doc, "Summary for the report", 166);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(33, 37, 41);
  const lines = doc.splitTextToSize(NARRATIVE, 503) as string[];
  lines.forEach((line, i) => doc.text(line, CONTENT_X, 186 + i * 12.4));

  // Images card (y 277.1; each image: heading, bordered box, image inside)
  const images = result.images_and_files.slice(0, 2);
  const titles = ["Alerts evolution — Top 5 agents", "Alert level evolution"];
  const IMG_W = 487.5;
  const MAX_IMG_H = 247.5; // print CSS: max-height 330px
  let y = 277.1;

  // First pass: measure
  const measured: { w: number; h: number }[] = [];
  for (const { url } of images) {
    const img = await loadImage(url);
    let w = IMG_W;
    let h = (img.naturalHeight / img.naturalWidth) * w;
    if (h > MAX_IMG_H) {
      h = MAX_IMG_H;
      w = (img.naturalWidth / img.naturalHeight) * h;
    }
    measured.push({ w, h });
  }
  // Segment geometry measured from the reference PDF: heading baseline
  // ~34pt below the segment start, image box 39.4pt below it, next segment
  // starts at the previous box's bottom edge, card ends 18.4pt after it.
  const cardH =
    images.length === 0 ? 60 : measured.reduce((acc, m) => acc + 39.4 + (m.h + 25.5), 0) + 18.4;
  card(doc, y, cardH);

  if (images.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(108, 117, 125);
    doc.text("No images were extracted from the PDF.", CARD_X + 18, y + 36);
  }
  let segY = y;
  for (let i = 0; i < images.length; i++) {
    const { url } = images[i];
    const { w, h } = measured[i];
    heading(doc, titles[i] ?? `Chart ${i + 1}`, segY + 34);
    const boxY = segY + 39.4;
    const boxH = h + 25.5;
    doc.setDrawColor(222, 226, 230);
    doc.roundedRect(CONTENT_X - 0.2, boxY, 513.2, boxH, 6, 6, "S");
    // print CSS: img centred inside the box with 12.75pt padding.
    // JPEG (white background) keeps the file near the reference PDF's size
    // instead of embedding multi-MB PNGs.
    const jpeg = toJpeg(await loadImage(url));
    doc.addImage(jpeg, "JPEG", CONTENT_X + (513.2 - w) / 2, boxY + 12.75, w, h);
    segY = boxY + boxH;
  }

  // ---------- Alerts Summary table (summary-card: page-break-before) ----
  doc.addPage();
  const base = baseName(result.filename_excel);

  autoTable(doc, {
    startY: 75,
    margin: { left: 42, right: PAGE_W - 42 - 511.5, top: 75, bottom: 28.5 },
    tableWidth: 511.5,
    head: [["Sr No", "Rule ID", "Description", "Level", "Count"]],
    body: result.payload.pdf_summary.map((r, i) => [
      String(i + 1),
      r["Rule ID"],
      r.Description,
      String(r.Level),
      r.Count.toLocaleString("en-US"),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: { top: 5.4, bottom: 5.4, left: 6, right: 6 },
      lineColor: [222, 226, 230],
      lineWidth: 0.75,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [52, 58, 64], // .table thead th #343a40
      textColor: 255,
      fontStyle: "bold",
      minCellHeight: 30,
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 25.5, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 61.5 },
      2: { cellWidth: 322.5 },
      3: { cellWidth: 41.3, halign: "right" },
      4: { cellWidth: 60.7, halign: "right" },
    },
    willDrawPage: (data) => {
      // Full-page card behind the table on every table page; the
      // "Alerts Summary" heading only on the first table page.
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...CARD_BORDER);
      doc.roundedRect(22.5, 28.5, 550.5, 784.9, 9, 9, "FD");
      if (data.pageNumber === 1) heading(doc, "Alerts Summary", 57);
    },
  });

  doc.save(`${base}_report_${utcStamp()}.pdf`);
}
