import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "IDCUBE Proposals", template: "%s · IDCUBE Proposals" },
  description: "IDCUBE Proposal & Quotation Management System",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1E2967", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
      </body>
    </html>
  );
}
