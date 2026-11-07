import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "应许之地",
  description: "私人定制 3D 数字礼物",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
