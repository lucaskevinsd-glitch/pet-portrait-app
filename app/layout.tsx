import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 宠物写真提示词生成器',
  description: '上传宠物照片，填写特征，选择风格，本地生成可直接复制到 Gemini 等生图工具使用的高质量提示词。零 API 调用，照片不出浏览器。',
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
