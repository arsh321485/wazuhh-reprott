import * as XLSX from "xlsx";
import { KEEP_COLUMNS } from "./constants";
import type { ChartData } from "./types";

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;

// ---------------------------------------------------------------------------
// ILLEGAL_CHARS_RE / _sanitize() in app.py
// ---------------------------------------------------------------------------
const ILLEGAL_CHARS_RE = /[\x00-\x08\x0b-\x0c\x0e-\x1f]/g;

export function sanitize(val: CellValue): CellValue {
  return typeof val === "string" ? val.replace(ILLEGAL_CHARS_RE, "") : val;
}

function isEmpty(v: CellValue | undefined): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function toNumber(v: CellValue | undefined): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Excel/CSV parsing — ports the first half of Flask's /upload route:
//   df = pd.read_excel(...) / pd.read_csv(...)
//   df.columns = [str(c).strip() for c in df.columns]
//   _source.*  ->  source.*  column mapping
//   ensure every KEEP_COLUMNS column exists, keep only those, in order
// ---------------------------------------------------------------------------
export function parseExcelBuffer(data: ArrayBuffer | Uint8Array): {
  filtered: Row[];
  chart: ChartData;
} {
  const wb = XLSX.read(data, { type: "array" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  // header:1 -> array-of-arrays, equivalent to reading with pandas then using row 0 as header
  const aoa = XLSX.utils.sheet_to_json<CellValue[]>(firstSheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (aoa.length === 0) return { filtered: [], chart: { levels: [], actions: [], action_counts: {} } };

  // df.columns = [str(c).strip() for c in df.columns]
  const rawColumns = (aoa[0] as CellValue[]).map((c) => (c == null ? "" : String(c).trim()));

  // Map columns with underscore prefix (_source.*) -> source.*
  const columnMapping = new Map<string, string>();
  for (const col of rawColumns) {
    if (col.startsWith("_source.")) {
      const target = col.slice(1); // remove leading "_"
      if ((KEEP_COLUMNS as readonly string[]).includes(target)) columnMapping.set(col, target);
    }
  }

  const body = aoa.slice(1);
  const rows: Row[] = body.map((cells) => {
    const row: Row = {};
    rawColumns.forEach((col, i) => {
      const name = columnMapping.get(col) ?? col;
      row[name] = (cells as CellValue[])[i] ?? null;
    });
    return row;
  });

  // Ensure all KEEP_COLUMNS exist (fill with NA) + keep only those, in order
  const filtered: Row[] = rows.map((row) => {
    const out: Row = {};
    for (const col of KEEP_COLUMNS) out[col] = row[col] ?? null;
    return out;
  });

  return { filtered, chart: buildChart(filtered) };
}

// ---------------------------------------------------------------------------
// Chart data: actions by level — ports:
//   analysis_df = filtered_df.dropna(subset=["source.rule.id"])
//   analysis_df["source.rule.level"] = pd.to_numeric(..., errors="coerce")
//   grouped = groupby(["source.rule.level", "source.data.action"]).size().unstack(fill_value=0)
// ---------------------------------------------------------------------------
export function buildChart(filtered: Row[]): ChartData {
  const analysis = filtered.filter((r) => !isEmpty(r["source.rule.id"]));

  // grouped: Map<level, Map<action, count>>
  const byLevel = new Map<number, Map<string, number>>();
  const actionSet: string[] = [];
  for (const row of analysis) {
    const level = toNumber(row["source.rule.level"]);
    if (level === null) continue; // to_numeric(errors="coerce") -> NaN rows drop out of groupby
    const rawAction = row["source.data.action"];
    const action = rawAction === null || rawAction === undefined ? "Unknown" : String(rawAction);
    if (!actionSet.includes(action)) actionSet.push(action);
    if (!byLevel.has(level)) byLevel.set(level, new Map());
    const m = byLevel.get(level)!;
    m.set(action, (m.get(action) ?? 0) + 1);
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  // chart_levels = [str(int(l)) if float(l).is_integer() else str(l)]
  const chartLevels = sortedLevels.map((l) => (Number.isInteger(l) ? String(Math.trunc(l)) : String(l)));
  const action_counts: Record<string, number[]> = {};
  for (const a of actionSet) {
    action_counts[a] = sortedLevels.map((l) => byLevel.get(l)?.get(a) ?? 0);
  }
  return { levels: chartLevels, actions: actionSet, action_counts };
}

// ---------------------------------------------------------------------------
// File generation — ports:
//   filtered_df.to_excel(f"{base}_filtered.xlsx")
//   save_summary(): df.to_csv / df_clean.to_excel  (summary of the PDF table)
// ---------------------------------------------------------------------------
export function rowsToXlsx(rows: Row[], columns: readonly string[]): Uint8Array {
  const aoa: CellValue[][] = [
    [...columns],
    ...rows.map((r) => columns.map((c) => sanitize(r[c] ?? null))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}

export function summaryToCsv(rows: { "Rule ID": string; Description: string; Level: number; Count: number }[]): string {
  const header = ["Rule ID", "Description", "Level", "Count"];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(","), ...rows.map((r) => [r["Rule ID"], r.Description, r.Level, r.Count].map(esc).join(","))].join("\n") + "\n";
}

export function summaryToXlsx(rows: { "Rule ID": string; Description: string; Level: number; Count: number }[]): Uint8Array {
  const asRows: Row[] = rows.map((r) => ({
    "Rule ID": sanitize(r["Rule ID"]),
    Description: sanitize(r.Description),
    Level: r.Level,
    Count: r.Count,
  }));
  return rowsToXlsx(asRows, ["Rule ID", "Description", "Level", "Count"]);
}

/** Download a Blob in the browser — replaces Flask's /uploads/<filename> route. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
