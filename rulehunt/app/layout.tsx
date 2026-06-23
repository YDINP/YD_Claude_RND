import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '오늘의 규칙',
  description: '5×5 보드에 타일을 놓아 숨겨진 규칙을 추론하세요. 매일 새로운 규칙이 공개됩니다.',
  openGraph: {
    title: '오늘의 규칙',
    description: '숨겨진 규칙을 추론하는 데일리 퍼즐',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d0d0d',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
