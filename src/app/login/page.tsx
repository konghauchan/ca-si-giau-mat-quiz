'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, claimLegacyQuizzes } from '@/lib/client';

function LoginForm() {
  const router = useRouter(); const params = useSearchParams();
  const requested = params.get('next') || '/quizzes';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/quizzes';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (mode === 'register' && password !== confirmation) { setError('Hai mật khẩu chưa khớp.'); return; }
    setBusy(true);
    try {
      await api('/api/auth', { method: 'POST', body: { action: mode, email, password } });
      await claimLegacyQuizzes().catch(() => undefined);
      router.push(next); router.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="page narrow auth-page"><div className="panel auth-card"><span className="kicker">TÀI KHOẢN NGHE & ĐOÁN</span><h1>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h1><p className="subtitle">Dùng email và mật khẩu để lưu, chỉnh sửa quiz trên nhiều thiết bị. Người chơi chỉ cần mã phòng.</p><div className="auth-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Đăng nhập</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Đăng ký</button></div>{error && <div className="notice error" role="alert">{error}</div>}<form onSubmit={submit}><div className="field"><label htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="ten@vidu.com" /></div><div className="field"><label htmlFor="account-password">Mật khẩu</label><input id="account-password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="Ít nhất 12 ký tự" /><small>Ít nhất 12 ký tự. Hãy lưu mật khẩu để đăng nhập trên thiết bị khác.</small></div>{mode === 'register' && <div className="field"><label htmlFor="account-confirmation">Nhập lại mật khẩu</label><input id="account-confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Nhập lại mật khẩu" /></div>}<button className="button primary big full" disabled={busy}>{busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button></form><p className="auth-footnote">Quiz đã tạo trên trình duyệt này sẽ được chuyển vào tài khoản sau khi đăng nhập. <Link href="/quizzes">Xem thư viện</Link></p></div></main>;
}
export default function LoginPage() { return <Suspense fallback={<main className="page narrow"><div className="panel">Đang tải…</div></main>}><LoginForm /></Suspense>; }
