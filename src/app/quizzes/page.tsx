'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ClipboardCopy, Disc3, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, quizToken } from '@/lib/client';
import { AvatarPicker } from '@/components/AvatarPicker';

type Quiz = { id: string; title: string; description: string; visibility: string; question_count: number; round_one_count: number; round_two_count: number; own: boolean };
type OwnedQuiz = { id: string; title: string; description: string; visibility: string; own: boolean; questions: { game_round: number }[] };

function Library() {
  const router = useRouter();
  const params = useSearchParams();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [hostQuizId, setHostQuizId] = useState('');
  const [hostName, setHostName] = useState('Người tạo phòng');
  const [avatarId, setAvatarId] = useState(1);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferCode, setTransferCode] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const publicItems = await api<Omit<Quiz, 'own'>[]>('/api/quiz');
        const ids = JSON.parse(localStorage.getItem('myQuizzes') || '[]') as string[];
        const mine = (await Promise.all(ids.filter(id => quizToken(id)).map(id =>
          api<OwnedQuiz>(`/api/quiz?id=${encodeURIComponent(id)}`, { token: quizToken(id) })
            .then(q => q.own ? ({ id: q.id, title: q.title, description: q.description, visibility: q.visibility, own: true, question_count: q.questions.length, round_one_count: q.questions.filter(item => item.game_round === 1).length, round_two_count: q.questions.filter(item => item.game_round === 2).length }) : null)
            .catch(() => null)
        ))).filter((item): item is Quiz => item !== null);
        setQuizzes([...mine, ...publicItems.filter(item => !mine.some(owned => owned.id === item.id)).map(item => ({ ...item, own: false }))]);
      } catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function host(quiz: Quiz) {
    setError(''); setBusyId(quiz.id);
    try {
      const result = await api<{ roomId: string; hostToken: string }>('/api/room', { method: 'POST', body: { action: 'create', quizId: quiz.id, ownerToken: quizToken(quiz.id), nickname: hostName.trim(), avatarId } });
      localStorage.setItem(`host:${result.roomId}`, result.hostToken);
      localStorage.setItem(`player:${result.roomId}`, result.hostToken);
      router.push(`/host/${result.roomId}`);
    } catch (e) { setError((e as Error).message); } finally { setBusyId(''); }
  }

  async function remove(quiz: Quiz) {
    setError(''); setBusyId(quiz.id);
    try {
      await api(`/api/quiz?id=${encodeURIComponent(quiz.id)}`, { method: 'DELETE', token: quizToken(quiz.id) });
      localStorage.removeItem(`quiz:${quiz.id}`);
      const ids = JSON.parse(localStorage.getItem('myQuizzes') || '[]') as string[];
      localStorage.setItem('myQuizzes', JSON.stringify(ids.filter(id => id !== quiz.id)));
      setQuizzes(previous => previous.filter(item => item.id !== quiz.id));
      setDeleteId(''); setHostQuizId('');
      setNotice(`Đã xóa “${quiz.title}” khỏi thư viện.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(''); }
  }

  async function copyOwnership() {
    setError('');
    try {
      const owned = quizzes.filter(item => item.own).map(item => ({ id: item.id, token: quizToken(item.id) }));
      if (owned.length === 0) throw new Error('Không có bộ câu hỏi nào của bạn để chuyển.');
      await navigator.clipboard.writeText(JSON.stringify({ version: 1, quizzes: owned }));
      setNotice(`Đã sao chép mã quản lý của ${owned.length} bộ câu hỏi. Hãy dán vào mục “Nhập mã quản lý” trên website online.`);
    } catch (e) { setError((e as Error).message); }
  }

  async function importOwnership() {
    setError(''); setTransferBusy(true);
    try {
      const data = JSON.parse(transferCode) as { version?: number; quizzes?: Array<{ id: string; token: string }> };
      if (data.version !== 1 || !Array.isArray(data.quizzes) || data.quizzes.length === 0 || data.quizzes.length > 50 || data.quizzes.some(item => !/^[0-9a-f-]{36}$/i.test(item.id) || !/^[0-9a-f]{48}$/i.test(item.token))) throw new Error('Mã quản lý không hợp lệ.');
      const verified = await Promise.all(data.quizzes.map(async item => {
        const quiz = await api<OwnedQuiz>(`/api/quiz?id=${encodeURIComponent(item.id)}`, { token: item.token });
        if (!quiz.own) throw new Error('Mã này không có quyền quản lý một hoặc nhiều bộ câu hỏi.');
        return item;
      }));
      const ids = JSON.parse(localStorage.getItem('myQuizzes') || '[]') as string[];
      verified.forEach(item => localStorage.setItem(`quiz:${item.id}`, item.token));
      localStorage.setItem('myQuizzes', JSON.stringify([...new Set([...verified.map(item => item.id), ...ids])]));
      window.location.reload();
    } catch (e) { setError((e as Error).message); }
    finally { setTransferBusy(false); }
  }

  return <main className="page">
    <div className="page-head"><div><span className="kicker">THƯ VIỆN</span><h1>Chọn bộ câu hỏi để bắt đầu</h1><p>Bộ câu hỏi của bạn trên thiết bị này và các bộ câu hỏi công khai.</p></div><Link className="button primary" href="/create"><Plus size={17} /> Tạo bộ câu hỏi</Link></div>
    {params.get('created') && <div className="notice success">Bộ câu hỏi đã được lưu. Bấm “Tạo phòng” để chơi.</div>}
    {params.get('updated') && <div className="notice success">Đã lưu bản chỉnh sửa. Các phòng đã tạo tiếp tục dùng nội dung cũ.</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <section className="quiz-transfer panel"><div><strong>Chuyển quiz sang website online</strong><p>Sao chép mã quản lý tại trang local, rồi nhập mã đó trên bản online để tiếp tục sửa và tạo phòng từ quiz của bạn. Giữ mã này riêng tư.</p></div><div className="quiz-transfer-actions"><button className="button secondary" onClick={copyOwnership} disabled={loading || !quizzes.some(item => item.own)}><ClipboardCopy size={16} /> Sao chép mã quản lý</button><button className="button secondary" onClick={() => setShowTransfer(value => !value)}>{showTransfer ? 'Đóng' : 'Nhập mã quản lý'}</button></div>{showTransfer && <div className="quiz-transfer-import"><label htmlFor="quiz-transfer-code">Dán mã quản lý đã sao chép</label><textarea id="quiz-transfer-code" value={transferCode} onChange={event => setTransferCode(event.target.value)} placeholder="Dán mã từ trang local vào đây" /><button className="button primary" disabled={transferBusy || !transferCode.trim()} onClick={importOwnership}>{transferBusy ? 'Đang kiểm tra…' : 'Khôi phục quyền quản lý'}</button></div>}</section>
    {loading ? <div className="panel empty">Đang tải bộ câu hỏi…</div> : quizzes.length === 0 ? <div className="panel empty"><Disc3 size={43} /><h2>Chưa có bộ câu hỏi nào</h2><p>Hãy tạo bộ câu hỏi đầu tiên.</p><Link className="button primary" href="/create">Tạo bộ câu hỏi</Link></div> : <div className="quiz-grid">{quizzes.map(quiz => {
      const ready = quiz.round_one_count > 0 && quiz.round_two_count > 0;
      return <article className="quiz-card" key={quiz.id}>
        <div className="quiz-cover">♫</div>
        <div className="quiz-card-body">
          {quiz.own && <span className="quiz-owner-tag">Của bạn</span>}
          <h2>{quiz.title}</h2><p>{quiz.description || 'Thử thách nghe nhạc cùng bạn bè.'}</p>
          <div className="quiz-card-meta"><span>{quiz.question_count} câu hỏi</span><span>Vòng 1: {quiz.round_one_count} · Vòng 2: {quiz.round_two_count}</span><span>{quiz.visibility === 'public' ? 'Công khai' : 'Riêng tư'}</span></div>
          {!ready && <p>Bộ câu hỏi cần ít nhất một bài hát cho mỗi vòng. {quiz.own ? 'Bấm “Chỉnh sửa” để bổ sung.' : 'Hãy chọn bộ câu hỏi khác.'}</p>}
          <div className="quiz-card-actions">
            <button className="button primary" disabled={busyId === quiz.id || !ready} onClick={() => { setDeleteId(''); setHostQuizId(hostQuizId === quiz.id ? '' : quiz.id); }}>{hostQuizId === quiz.id ? 'Đóng' : 'Tạo phòng'}</button>
            {quiz.own && <><Link className="button secondary" href={`/create?id=${quiz.id}`}><Pencil size={15} /> Chỉnh sửa</Link><button className="button danger" disabled={busyId === quiz.id} onClick={() => { setHostQuizId(''); setDeleteId(deleteId === quiz.id ? '' : quiz.id); }}><Trash2 size={15} /> Xóa</button></>}
          </div>
          {deleteId === quiz.id && <div className="quiz-delete-confirm" role="group" aria-label={`Xác nhận xóa ${quiz.title}`}><strong>Xóa “{quiz.title}”?</strong><p>Bộ câu hỏi sẽ biến mất khỏi thư viện. Các phòng đã tạo vẫn tiếp tục hoạt động.</p><div><button className="button secondary" disabled={busyId === quiz.id} onClick={() => setDeleteId('')}>Giữ lại</button><button className="button danger" disabled={busyId === quiz.id} onClick={() => remove(quiz)}>{busyId === quiz.id ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div></div>}
          {hostQuizId === quiz.id && <form className="host-setup" onSubmit={event => { event.preventDefault(); host(quiz); }}><label htmlFor={`host-name-${quiz.id}`}>Tên hiển thị của bạn</label><input id={`host-name-${quiz.id}`} className="text-input" minLength={2} maxLength={24} required value={hostName} onChange={event => setHostName(event.target.value)} /><AvatarPicker value={avatarId} onChange={setAvatarId} /><small>Người tạo phòng là người chơi đầu tiên. Phòng còn 3 chỗ.</small><button className="button primary full" disabled={busyId === quiz.id}>{busyId === quiz.id ? 'Đang tạo…' : 'Tạo phòng và tham gia'}</button></form>}
        </div>
      </article>;
    })}</div>}
  </main>;
}

export default function QuizzesPage() { return <Suspense fallback={<main className="page">Đang tải…</main>}><Library /></Suspense>; }
