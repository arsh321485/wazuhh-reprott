import { NextResponse } from "next/server";

/**
 * Flask: GET /download_report?pdf=<file>&excel=<file>
 * It re-read the previously uploaded files from uploads/ on disk and ran a
 * headless-Chrome -> pdfkit -> pyppeteer -> xhtml2pdf fallback chain.
 *
 * None of that survives Vercel:
 *  - serverless functions have no persistent uploads/ folder to re-read, and
 *  - there is no Edge/Chrome/wkhtmltopdf binary in the function runtime.
 *
 * The Next.js equivalent is the report page itself with `hide_header=true`:
 * open /?print=1 (or click "Download PDF" on the report) and the browser's
 * print-to-PDF renders exactly the same HTML/CSS — report.html was already
 * designed for headless-Chrome printing (@page / @media print rules are
 * preserved verbatim in app/globals.css). This route is kept so old links
 * fail with an explanation instead of a 404.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pdf = searchParams.get("pdf");
  if (!pdf) {
    // Flask: return "Missing ?pdf=your_report.pdf parameter", 400
    return new NextResponse("Missing ?pdf=your_report.pdf parameter", { status: 400 });
  }
  return NextResponse.json(
    {
      error:
        "Server-side PDF generation is not available on Vercel (no persistent uploads folder, no headless Chrome). " +
        "Open the report in the browser and use Download PDF — it prints the same report.html layout with hide_header=true.",
    },
    { status: 410 }
  );
}
