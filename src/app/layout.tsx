import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import { AccountNav } from '@/components/AccountNav';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import './globals.css';
export const metadata: Metadata = { title: 'Đọ Nhạc — Trò chơi đoán bài hát', description: 'Đọ Nhạc cùng bạn bè: nghe chung, đấu giá thời gian và đoán bài hát qua gợi ý.', icons: { icon: '/icon.svg', apple: '/apple-icon.png' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><header className="site-header"><Link className="brand" href="/" aria-label="Đọ Nhạc — về trang chủ"><BrandMark /></Link><nav><Link href="/quizzes">Khám phá bộ câu hỏi</Link><Link href="/create">Tạo bộ câu hỏi</Link><AccountNav /><Link className="nav-join" href="/join">Vào phòng →</Link></nav></header>{children}<footer className="site-footer"><BrandMark /><span>Nghe ít hơn. Đoán hay hơn.</span></footer></body></html>;
}
