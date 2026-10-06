'use client';
import { quizCategoryLabel } from '@/lib/quizCategory';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Copy, Disc3, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { api, claimLegacyQuizzes } from '@/lib/client';
import { AvatarPicker } from '@/components/AvatarPicker';

type Quiz = { game_type: string; id: string; title: string; description: string; visibility: string; cover_url: string | null; question_count: number; round_count: number; round_one_count: number; round_two_count: number; own: boolean };

function Library() {
  const router = useRouter();
  const params = useSearchParams();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [hostQuizId, setHostQuizId] = useState('');
  const [shareId, setShareId] = useState('');
  const [shareOrigin, setShareOrigin] = useState('');
  const [hostName, setHostName] = useState('Người tạo phòng');
  const [avatarId, setAvatarId] = useState(1);

  useEffect(() => {
    setShareOrigin(location.origin);
    async function load() {
      try {
        const auth = await api<{ user: { id: string } | null }>('/api/auth');
        setSignedIn(!!auth.user);
        if (auth.user) await claimLegacyQuizzes().catch(() => undefined);
        setQuizzes(await api<Quiz[]>('/api/quiz'));
      } catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function host(quiz: Quiz) {
    setError(''); setBusyId(quiz.id);
    try {
      const result = await api<{ roomId: string; hostToken: string }>('/api/room', { method: 'POST', body: { action: 'create', quizId: quiz.id, nickname: hostName.trim(), avatarId } });
      localStorage.setItem(`host:${result.roomId}`, result.hostToken);
      sessionStorage.setItem(`host:${result.roomId}`, result.hostToken);
      sessionStorage.setItem(`player:${result.roomId}`, result.hostToken);
      localStorage.setItem(`player:${result.roomId}`, result.hostToken);
      router.push(`/host/${result.roomId}`);
    } catch (e) { setError((e as Error).message); } finally { setBusyId(''); }
  }

  async function remove(quiz: Quiz) {
    setError(''); setBusyId(quiz.id);
    try {
      await api(`/api/quiz?id=${encodeURIComponent(quiz.id)}`, { method: 'DELETE' });
      setQuizzes(previous => previous.filter(item => item.id !== quiz.id));
      setDeleteId(''); setHostQuizId('');
      setNotice(`Đã xóa “${quiz.title}” khỏi thư viện.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(''); }
  }

  async function share(quiz: Quiz) {
    setError(''); setBusyId(quiz.id);
    try {
      if (quiz.visibility === 'private') {
        if (!quiz.own) throw new Error('Chỉ chủ sở hữu mới có thể chia sẻ bộ câu hỏi riêng tư.');
        await api('/api/quiz', { method: 'PATCH', body: { id: quiz.id, visibility: 'unlisted' } });
        setQuizzes(previous => previous.map(item => item.id === quiz.id ? { ...item, visibility: 'unlisted' } : item));
      }
      const link = `${location.origin}/quiz/${quiz.id}`;
      setShareId(quiz.id);
      try { await navigator.clipboard.writeText(link); setNotice('Đã sao chép liên kết. Người nhận có thể mở quiz và tạo phòng.'); }
      catch { setNotice('Liên kết đã sẵn sàng. Hãy sao chép trong ô bên dưới.'); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(''); }
  }

  async function stopSharing(quiz: Quiz) {
    setError(''); setBusyId(quiz.id);
    try {
      await api('/api/quiz', { method: 'PATCH', body: { id: quiz.id, visibility: 'private' } });
      setQuizzes(previous => previous.map(item => item.id === quiz.id ? { ...item, visibility: 'private' } : item));
      setShareId(''); setNotice('Đã tắt liên kết chia sẻ cho bộ câu hỏi này.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(''); }
  }

  return <main className="page">
    <div className="page-head"><div><span className="kicker">THƯ VIỆN</span><h1>Chọn bộ câu hỏi để bắt đầu</h1><p>Bộ câu hỏi trong tài khoản của bạn và các bộ câu hỏi công khai.</p></div><Link className="button primary" href="/create"><Plus size={17} /> Tạo bộ câu hỏi</Link></div>
    {!signedIn && !loading && <div className="notice info">Đăng nhập để tạo, chỉnh sửa và xem quiz riêng của bạn trên mọi thiết bị. <Link href="/login?next=%2Fquizzes">Đăng nhập hoặc đăng ký</Link></div>}
    {params.get('created') && <div className="notice success">Bộ câu hỏi đã được lưu. Bấm “Tạo phòng” để chơi.</div>}
    {params.get('updated') && <div className="notice success">Đã lưu bản chỉnh sửa. Các phòng đã tạo tiếp tục dùng nội dung cũ.</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {loading ? <div className="panel empty">Đang tải bộ câu hỏi…</div> : quizzes.length === 0 ? <div className="panel empty"><Disc3 size={43} /><h2>Chưa có bộ câu hỏi nào</h2><p>Hãy tạo bộ câu hỏi đầu tiên.</p><Link className="button primary" href="/create">Tạo bộ câu hỏi</Link></div> : <div className="quiz-grid">{quizzes.map(quiz => {
      const ready = quiz.question_count > 0;
      return <article className="quiz-card" key={quiz.id}>
        <div className="quiz-cover">{quiz.cover_url ? <Image unoptimized width={1200} height={900} src={quiz.cover_url} alt={`Ảnh bìa ${quiz.title}`} loading="lazy" /> : '♫'}</div>
        <div className="quiz-card-body">
          {quiz.own && <span className="quiz-owner-tag">Của bạn</span>}
          <h2>{quiz.title}</h2><p>{quiz.description || 'Thử thách nghe nhạc cùng bạn bè.'}</p>
          <div className="quiz-card-meta"><span>{quiz.question_count} câu hỏi</span><span>{`${quizCategoryLabel(quiz.game_type)} · ${quiz.round_count} vòng`}</span><span>{quiz.visibility === 'public' ? 'Công khai' : quiz.visibility === 'unlisted' ? 'Ai có liên kết' : 'Riêng tư'}</span></div>
          {!ready && <p>Bộ câu hỏi cần ít nhất một bài hát cho mỗi vòng. {quiz.own ? 'Bấm “Chỉnh sửa” để bổ sung.' : 'Hãy chọn bộ câu hỏi khác.'}</p>}
          <div className="quiz-card-actions">
            <button className="button primary" disabled={busyId === quiz.id || !ready} onClick={() => { setDeleteId(''); setHostQuizId(hostQuizId === quiz.id ? '' : quiz.id); }}>{hostQuizId === quiz.id ? 'Đóng' : 'Tạo phòng'}</button>
            <button className="button secondary" disabled={busyId === quiz.id} onClick={() => share(quiz)}><Share2 size={15} /> Chia sẻ</button>
            {quiz.own && <><Link className="button secondary" href={`/create?id=${quiz.id}`}><Pencil size={15} /> Chỉnh sửa</Link><button className="button danger" disabled={busyId === quiz.id} onClick={() => { setHostQuizId(''); setDeleteId(deleteId === quiz.id ? '' : quiz.id); }}><Trash2 size={15} /> Xóa</button></>}
          </div>
          {shareId === quiz.id && <div className="quiz-share-panel"><strong>Liên kết bộ câu hỏi</strong><p>{quiz.visibility === 'unlisted' ? 'Chỉ người có liên kết mới mở được quiz này.' : 'Bất kỳ ai cũng có thể mở quiz này.'}</p><div><input aria-label="Liên kết chia sẻ quiz" readOnly value={`${shareOrigin}/quiz/${quiz.id}`} onClick={event => event.currentTarget.select()} /><button className="button secondary" type="button" onClick={() => share(quiz)}><Copy size={15} /> Sao chép</button></div>{quiz.own && quiz.visibility === 'unlisted' && <button className="button ghost" type="button" disabled={busyId === quiz.id} onClick={() => stopSharing(quiz)}>Tắt chia sẻ</button>}</div>}
          {deleteId === quiz.id && <div className="quiz-delete-confirm" role="group" aria-label={`Xác nhận xóa ${quiz.title}`}><strong>Xóa “{quiz.title}”?</strong><p>Bộ câu hỏi sẽ biến mất khỏi thư viện. Các phòng đã tạo vẫn tiếp tục hoạt động.</p><div><button className="button secondary" disabled={busyId === quiz.id} onClick={() => setDeleteId('')}>Giữ lại</button><button className="button danger" disabled={busyId === quiz.id} onClick={() => remove(quiz)}>{busyId === quiz.id ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div></div>}
          {hostQuizId === quiz.id && <form className="host-setup" onSubmit={event => { event.preventDefault(); host(quiz); }}><label htmlFor={`host-name-${quiz.id}`}>Tên hiển thị của bạn</label><input id={`host-name-${quiz.id}`} className="text-input" minLength={2} maxLength={24} required value={hostName} onChange={event => setHostName(event.target.value)} /><AvatarPicker value={avatarId} onChange={setAvatarId} /><small>Người tạo phòng là người chơi đầu tiên. Phòng còn 3 chỗ.</small><button className="button primary full" disabled={busyId === quiz.id}>{busyId === quiz.id ? 'Đang tạo…' : 'Tạo phòng và tham gia'}</button></form>}
        </div>
      </article>;
    })}</div>}
  </main>;
}

export default function QuizzesPage() { return <Suspense fallback={<main className="page">Đang tải…</main>}><Library /></Suspense>; }
