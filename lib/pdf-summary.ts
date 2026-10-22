import type { PdfSummaryRow } from "./types";

// ---------------------------------------------------------------------------
// extract_pdf_summary() in app.py:
//   pattern = re.compile(r"(\d{2,7})\s+(.+?)\s+(\d{1,2})\s+(\d{1,20})(?:\s|$)")
//   rows -> drop_duplicates().sort_values("Count", ascending=False)
// (.+? in Python does not match newlines — same as JS without the /s flag.)
// ---------------------------------------------------------------------------
const PATTERN = /(\d{2,7})\s+(.+?)\s+(\d{1,2})\s+(\d{1,20})(?:\s|$)/g;

export function extractPdfSummaryFromText(text: string): PdfSummaryRow[] {
  const rows: PdfSummaryRow[] = [];
  for (const m of text.matchAll(PATTERN)) {
    const [, rid, desc, lvl, cnt] = m;
    rows.push({
      "Rule ID": rid.trim(),
      Description: desc.split(/\s+/).join(" "), // " ".join(desc.split())
      Level: parseInt(lvl, 10),
      Count: parseInt(cnt, 10),
    });
  }
  // drop_duplicates()
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = `${r["Rule ID"]}\u0000${r.Description}\u0000${r.Level}\u0000${r.Count}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // sort_values("Count", ascending=False)
  unique.sort((a, b) => b.Count - a.Count);
  return unique;
}

interface TextItem {
  str: string;
  transform: number[];
}

/**
 * Rebuild the text of a PDF page line-by-line from pdf.js text items,
 * grouping items that share a baseline (same transform[5]) and ordering
 * them left-to-right. This mirrors pdfplumber's extract_text(), which
 * Flask used: lines are separated by "\n".
 *
 * This matters: unpdf's extractText() joins everything with spaces on one
 * logical line, so the regex above would happily match across unrelated
 * content (e.g. it produced a bogus first row "Rule ID 54 — to
 * 2026-10-16T09:10:54 manager.name: ..." from the Wazuh cover page).
 * With real line breaks, (.+?) can only span one line, exactly as in Python.
 */
async function extractPageLines(pdf: { getPage(n: number): Promise<unknown> }, pageNum: number): Promise<string> {
  const page = (await pdf.getPage(pageNum)) as {
    getTextContent(): Promise<{ items: unknown[] }>;
  };
  const content = await page.getTextContent();
  const items = content.items.filter(
    (i): i is TextItem =>
      typeof i === "object" && i !== null && "str" in i && "transform" in i
  );

  // Group by baseline y (pdf.js y grows upwards; round to tolerate jitter)
  const byLine = new Map<number, { x: number; str: string }[]>();
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    // Items on the same visual line can differ by a point or two.
    let key = [...byLine.keys()].find((k) => Math.abs(k - y) <= 2);
    if (key === undefined) {
      key = y;
      byLine.set(key, []);
    }
    byLine.get(key)!.push({ x, str: item.str });
  }

  return [...byLine.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

/**
 * Extract all text from a PDF — the pdfplumber loop in extract_pdf_summary():
 *   with pdfplumber.open(pdf_path) as pdf:
 *       for p in pdf.pages: text += p.extract_text() + "\n"
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    text += (await extractPageLines(pdf, p)) + "\n";
  }
  return text;
}

export async function extractPdfSummary(data: Uint8Array): Promise<PdfSummaryRow[]> {
  try {
    const text = await extractPdfText(data);
    return extractPdfSummaryFromText(text);
  } catch (e) {
    // Flask: print("PDF read error:", e); return empty DataFrame
    console.error("PDF read error:", e);
    return [];
  }
}
