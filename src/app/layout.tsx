import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fantasy Evolution", template: "%s | Fantasy Evolution" },
  description: "Play NFL, MLB, NBA and NHL fantasy in one league or pick a single sport.",
  referrer: "strict-origin-when-cross-origin",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
