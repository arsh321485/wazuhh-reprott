// Ported 1:1 from app.py (Flask) — CONFIG section

/** app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024 in Flask. */
export const MAX_CONTENT_LENGTH = 200 * 1024 * 1024; // 200MB limit

/** ALLOWED_EXT in Flask. The PDF input is always a PDF; Excel accepts xlsx/xls/csv. */
export const ALLOWED_EXT = new Set(["xlsx", "xls", "csv", "pdf"]);

/** KEEP_COLUMNS in app.py — exact list, exact order. */
export const KEEP_COLUMNS = [
  "source.predecoder.timestamp",
  "source.data.protocol",
  "source.data.srcip",
  "source.data.dstport",
  "source.data.action",
  "source.data.srcport",
  "source.data.dstip",
  "source.rule.level",
  "source.rule.description",
  "source.rule.groups",
  "source.rule.id",
  "source.decoder.parent",
  "source.decoder.name",
  "source.input.type",
  "source.@timestamp",
] as const;

/** allowed_file() in app.py */
export function allowedFile(filename: string): boolean {
  if (!filename.includes(".")) return false;
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  return ALLOWED_EXT.has(ext);
}

/**
 * Equivalent of werkzeug's secure_filename() for the cases this app handles
 * (keeps letters, numbers, dot, dash, underscore; everything else -> "_").
 */
export function secureFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned.replace(/^\.+/, "") || "file";
}

/** os.path.splitext(name)[0] */
export function baseName(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}
