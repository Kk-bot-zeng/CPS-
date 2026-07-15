import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "雷鸟电视CPS系统",
  description: "雷鸟电视达人与团长销售运营管理系统",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
