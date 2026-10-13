import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 宠物写真 · 真实出图',
  description: '上传宠物照片，选择风格，通过 Gemini 生成真实宠物写真。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
