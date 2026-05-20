import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dayfold",
  description: "Plan the day, record what actually moved, and review the week."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
