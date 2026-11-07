import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "应许之地",
  description: "2.5D 私人定制数字礼物",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
