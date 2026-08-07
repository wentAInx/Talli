import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Asset Ledger",
  description: "A precise, self-hosted multi-asset personal ledger.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
