import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Celestyal Security Event Report",
  description: "Upload Wazuh Files (Excel + PDF)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Bootstrap 5 CSS — same CDN link as templates/report.html */}
        <link
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Bootstrap JS — same CDN script as templates/report.html */}
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" async />
      </body>
    </html>
  );
}
