import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import './globals.css';
export const metadata: Metadata = { title: 'Nghe & Đoán — Trò chơi đoán bài hát', description: 'Cùng nghe, đấu giá thời gian và đoán tên bài hát với bạn bè.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><header className="site-header"><Link className="brand" href="/" aria-label="Nghe & Đoán — về trang chủ"><BrandMark /></Link><nav><Link href="/quizzes">Khám phá bộ câu hỏi</Link><Link href="/create">Tạo bộ câu hỏi</Link><Link className="nav-join" href="/join">Vào phòng →</Link></nav></header>{children}<footer className="site-footer"><BrandMark /><span>Nghe ít hơn. Đoán hay hơn.</span></footer></body></html>;
}
