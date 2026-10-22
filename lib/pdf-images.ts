// Browser-only port of extract_images_and_raster_from_pdf() in app.py.
// Flask used PyMuPDF (fitz) + PIL; here unpdf (pdf.js) + the native Canvas API
// do the same job — which is also why this runs on Vercel: no server-side
// rasterizer, no Chromium, no filesystem writes are needed.
import type { ImageAndFile } from "./types";

function utcTimestamp(): string {
  // datetime.utcnow().strftime("%Y%m%dT%H%M%S")
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function toCanvas(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(source, 0, 0);
  return c;
}

// remove_black_background(pil_img, threshold=60) in app.py
function removeBlackBackground(canvas: HTMLCanvasElement, threshold = 60): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < threshold && d[i + 1] < threshold && d[i + 2] < threshold) {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
    }
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// _replace_black_with_white(pil_img, black_thresh=40)
function replaceBlackWithWhite(canvas: HTMLCanvasElement, blackThresh = 40): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < blackThresh && d[i + 1] < blackThresh && d[i + 2] < blackThresh) {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// _is_mostly_dark(pil_img, threshold=60, fraction_non_dark=0.02)
function isMostlyDark(canvas: HTMLCanvasElement, threshold = 60, fractionNonDark = 0.02): boolean {
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonDark = 0;
  const total = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (gray > threshold) nonDark++;
  }
  return nonDark / total < fractionNonDark;
}

// PIL ImageOps.autocontrast approximation (per-channel min/max stretch).
// Flask also applied ImageEnhance.Sharpness(1.05) in _autofix_image — a 5%
// sharpen is visually negligible and has no cheap Canvas equivalent, so the
// autocontrast step (the one that changes dark charts) is what is ported.
function autocontrast(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      if (d[i + ch] < min[ch]) min[ch] = d[i + ch];
      if (d[i + ch] > max[ch]) max[ch] = d[i + ch];
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const range = max[ch] - min[ch];
      if (range > 0) d[i + ch] = Math.round(((d[i + ch] - min[ch]) / range) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Flask's _avg_hash (8x8 average hash) dedupes repeated images (the Wazuh
// logo on every page, rasters duplicating embedded charts). On white-
// dominant chart images the 8x8 average hash collides in Canvas (both
// charts reduce to almost the same bit pattern) and the second chart was
// wrongly dropped, so a stronger 32x32 quantised fingerprint is used for
// the same purpose: truly identical images still dedupe, distinct charts
// do not.
function avgHash(canvas: HTMLCanvasElement): string {
  const small = toCanvas(canvas, 32, 32);
  const d = small.getContext("2d")!.getImageData(0, 0, 32, 32).data;
  const parts: string[] = [`${canvas.width}x${canvas.height}:`];
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    parts.push(String(Math.round(gray / 16)));
  }
  return parts.join(",");
}

/** Raw extracted pixels (unpdf extractImages) -> canvas, expanding 1/3 channels to RGBA. */
function pixelsToCanvas(img: { data: Uint8ClampedArray; width: number; height: number; channels: 1 | 3 | 4 }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(img.width, img.height);
  const src = img.data;
  const px = img.width * img.height;
  for (let i = 0; i < px; i++) {
    const s = i * img.channels;
    const t = i * 4;
    if (img.channels === 1) {
      out.data[t] = out.data[t + 1] = out.data[t + 2] = src[s];
    } else {
      out.data[t] = src[s];
      out.data[t + 1] = src[s + 1];
      out.data[t + 2] = src[s + 2];
    }
    out.data[t + 3] = img.channels === 4 ? src[s + 3] : 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/**
 * extract_images_and_raster_from_pdf(pdf_path, dest, rasterize_pages=True, lighten_images=True)
 * Returns at most the items the caller slices — Flask sliced [:2] in /upload.
 * `dest_folder`/file writes become in-memory canvases -> PNG data-URLs.
 */
interface EmbeddedImage {
  data?: Uint8ClampedArray;
  bitmap?: ImageBitmap;
  width: number;
  height: number;
}

/**
 * Embedded-image extraction without unpdf's extractImages(): that helper
 * calls page.objs.get(key) with no callback, which THROWS ("Requesting
 * object that isn't resolved yet") on objects that are never painted —
 * e.g. SMasks — and aborts extraction for the whole page. Here objects are
 * requested with pdf.js's callback form (fires when resolved) plus a
 * timeout, so unresolvable objects are simply skipped.
 */
async function extractEmbeddedImages(
  doc: Awaited<ReturnType<typeof import("unpdf").getDocumentProxy>>,
  pageNum: number
): Promise<HTMLCanvasElement[]> {
  const { getResolvedPDFJS } = await import("unpdf");
  const pdfjs = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> };
  const page = (await doc.getPage(pageNum)) as unknown as {
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get(key: string, cb: (img: EmbeddedImage | null) => void): void };
  };
  const ops = await page.getOperatorList();
  const canvases: HTMLCanvasElement[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const key = ops.argsArray[i]?.[0] as string;
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const img = await new Promise<EmbeddedImage | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 1500);
      try {
        page.objs.get(key, (obj) => {
          clearTimeout(timer);
          resolve(obj);
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
    if (!img || !img.width || !img.height) continue;

    if (img.bitmap) {
      canvases.push(toCanvas(img.bitmap, img.bitmap.width, img.bitmap.height));
    } else if (img.data) {
      const channels = img.data.length / (img.width * img.height);
      if (![1, 3, 4].includes(channels)) continue;
      canvases.push(pixelsToCanvas({ data: img.data, width: img.width, height: img.height, channels: channels as 1 | 3 | 4 }));
    }
  }
  return canvases;
}

export async function extractImagesAndRasterFromPdf(
  data: ArrayBuffer,
  base: string,
  rasterizePages = true,
  lightenImages = true
): Promise<ImageAndFile[]> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");

  const saved: ImageAndFile[] = [];
  const seenHashes = new Set<string>();
  const ts = utcTimestamp();

  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    doc = await getDocumentProxy(new Uint8Array(data));
  } catch (e) {
    console.error("Could not open PDF:", e); // Flask: print("Could not open PDF:", e)
    return saved;
  }

  const pushCanvas = (canvas: HTMLCanvasElement, name: string) => {
    const h = avgHash(canvas);
    if (seenHashes.has(h)) return; // duplicate -> Flask deleted the file
    seenHashes.add(h);
    saved.push({ url: canvas.toDataURL("image/png"), filename: name });
  };

  // pdf.js only resolves embedded image objects once a page has been
  // rendered — calling extractImages() first throws "Requesting object
  // that isn't resolved yet" and every embedded chart is lost (the report
  // then falls back to a tiny full-page raster, which is wrong). So:
  // rasterize first and keep the canvases, extract embedded images second,
  // but *emit* in Flask's order — embedded images first, then rasters.

  // 2) rasterize pages (fitz.Matrix(2.0, 2.0) -> scale 2.0), collected only
  const rasterCanvases: { canvas: HTMLCanvasElement; name: string }[] = [];
  if (rasterizePages) {
    for (let p = 1; p <= doc.numPages; p++) {
      try {
        const png = await renderPageAsImage(doc, p, { scale: 2.0 });
        const bitmap = await createImageBitmap(new Blob([png], { type: "image/png" }));
        let canvas = toCanvas(bitmap, bitmap.width, bitmap.height);
        canvas = removeBlackBackground(canvas);
        if (lightenImages && isMostlyDark(canvas)) canvas = autocontrast(replaceBlackWithWhite(canvas));
        rasterCanvases.push({ canvas, name: `${base}_p${p}_raster_${ts}.png` });
      } catch (e) {
        console.error("rasterize page error:", e);
        continue;
      }
    }
  }

  // 1) embedded images — doc.extract_image(xref) in Flask
  for (let p = 1; p <= doc.numPages; p++) {
    try {
      const canvases = await extractEmbeddedImages(doc, p);
      canvases.forEach((canvas0, i) => {
        try {
          let canvas = removeBlackBackground(canvas0);
          if (lightenImages && isMostlyDark(canvas)) {
            canvas = autocontrast(replaceBlackWithWhite(canvas));
          }
          pushCanvas(canvas, `${base}_p${p}_emb${i + 1}_${ts}.png`);
        } catch (e) {
          console.error("embed extract error:", e);
        }
      });
    } catch (e) {
      console.error("embed extract error:", e);
    }
  }

  // ...then the page rasters, as fallback / to capture vector charts
  for (const { canvas, name } of rasterCanvases) pushCanvas(canvas, name);

  // keep order, unique (by filename, as in Flask)
  const unique: ImageAndFile[] = [];
  const seen = new Set<string>();
  for (const s of saved) {
    if (!seen.has(s.filename)) {
      unique.push(s);
      seen.add(s.filename);
    }
  }
  return unique;
}
