'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Copy, Headphones, Play, Share2 } from 'lucide-react';
import { api, quizToken } from '@/lib/client';
import { AvatarPicker } from '@/components/AvatarPicker';

type SharedQuiz = { gameType: string; id: string; title: string; description: string; visibility: string; coverUrl: string | null; questionCount: number; roundOneCount: number; roundTwoCount: number; own: boolean };

export default function SharedQuizPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quiz, setQuiz] = useState<SharedQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarId, setAvatarId] = useState(1);

  useEffect(() => {
    if (!id) return;
    api<SharedQuiz>(`/api/quiz?id=${encodeURIComponent(id)}`, { token: quizToken(id) })
      .then(setQuiz).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [id]);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!quiz) return;
    setError(''); setBusy(true);
    try {
      const result = await api<{ roomId: string; hostToken: string }>('/api/room', { method: 'POST', body: { action: 'create', quizId: quiz.id, ownerToken: quizToken(quiz.id), nickname: nickname.trim(), avatarId } });
      localStorage.setItem(`host:${result.roomId}`, result.hostToken);
      sessionStorage.setItem(`host:${result.roomId}`, result.hostToken);
      sessionStorage.setItem(`player:${result.roomId}`, result.hostToken);
      localStorage.setItem(`player:${result.roomId}`, result.hostToken);
      router.push(`/host/${result.roomId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); setNotice('Đã sao chép liên kết bộ câu hỏi.'); }
    catch { setNotice('Hãy sao chép địa chỉ trên thanh trình duyệt để chia sẻ.'); }
  }

  return <main className="page shared-quiz-page">
    {loading ? <div className="panel empty">Đang tải bộ câu hỏi…</div> : !quiz ? <div className="panel empty"><h1>Không mở được bộ câu hỏi</h1><p>{error || 'Liên kết không hợp lệ hoặc bộ câu hỏi đã được đặt riêng tư.'}</p><Link className="button secondary" href="/quizzes">Về thư viện</Link></div> : <>
      <div className="shared-quiz-hero panel">
        <div className="shared-quiz-cover">{quiz.coverUrl ? <Image unoptimized width={1200} height={900} src={quiz.coverUrl} alt={`Ảnh bìa ${quiz.title}`} /> : <Headphones size={72} />}</div>
        <div className="shared-quiz-info"><span className="kicker">BỘ CÂU HỎI ÂM NHẠC</span><h1>{quiz.title}</h1><p>{quiz.description || 'Cùng bạn bè nghe nhạc và đoán tên bài hát.'}</p><div className="shared-quiz-stats"><span>{quiz.questionCount} bài hát</span>{quiz.gameType==='SONG_CLUE'?<span>5 gợi ý mỗi bài · 4 người chơi</span>:<><span>Vòng 1: {quiz.roundOneCount} bài</span><span>Vòng 2: {quiz.roundTwoCount} bài</span></>}</div><button className="button secondary" type="button" onClick={copyLink}><Share2 size={17} /> Chia sẻ quiz <Copy size={15} /></button></div>
      </div>
      {notice && <div className="notice success" role="status">{notice}</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <form className="panel shared-quiz-start" onSubmit={createRoom}><span className="kicker">BẮT ĐẦU CHƠI</span><h2>Tạo phòng từ bộ câu hỏi này</h2><p>Nhập tên và chọn avatar. Bạn sẽ là người chơi đầu tiên trong phòng; chia sẻ mã phòng cho tối đa 3 người nữa.</p><div className="field"><label htmlFor="shared-host-name">Tên hiển thị của bạn</label><input id="shared-host-name" value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={24} placeholder="Nhập tên của bạn" required /></div><AvatarPicker value={avatarId} onChange={setAvatarId} /><button className="button primary big" disabled={busy || (quiz.gameType !== 'SONG_CLUE' && (quiz.roundOneCount === 0 || quiz.roundTwoCount === 0))}><Play size={18} /> {busy ? 'Đang tạo phòng…' : 'Tạo phòng và tham gia'}</button></form>
    </>}
  </main>;
}
