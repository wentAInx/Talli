import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Talli",
    template: "%s | Talli",
  },
  description: "Talli is a precise, self-hosted multi-asset personal ledger.",
};

export const viewport: Viewport = {
  themeColor: "#f4f6f5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
