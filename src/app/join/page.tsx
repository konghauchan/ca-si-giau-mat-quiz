'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DoorOpen } from 'lucide-react';
import { api } from '@/lib/client';
import { AvatarPicker } from '@/components/AvatarPicker';
export default function JoinPage() {
  const router = useRouter(); const [pin, setPin] = useState(''); const [nickname, setNickname] = useState(''); const [avatarId, setAvatarId] = useState(1); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const requestKey = `join:${pin}:${nickname.trim().toLowerCase()}`;
    const clientToken = sessionStorage.getItem(requestKey) || crypto.randomUUID();
    sessionStorage.setItem(requestKey, clientToken);
    try {
      let result: { roomId: string; playerToken: string } | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await api('/api/room', { method: 'POST', body: { action: 'join', pin, nickname, avatarId, clientToken }, signal: AbortSignal.timeout(12000) });
          break;
        } catch (error) {
          if (attempt === 1 || !(error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))) throw error;
        }
      }
      if (!result) throw new Error('Không thể kết nối phòng lúc này. Hãy thử lại.');
      localStorage.setItem(`player:${result.roomId}`, result.playerToken);
      sessionStorage.setItem(`player:${result.roomId}`, result.playerToken);
      sessionStorage.removeItem(requestKey);
      router.push(`/play/${result.roomId}`);
    } catch (error) {
      setError(error instanceof DOMException ? 'Kết nối phòng quá lâu. Hãy bấm thử lại.' : (error as Error).message);
    } finally { setBusy(false); }
  }
  return <main className="page narrow"><div className="join-card"><div className="join-graphic"><DoorOpen size={31} /></div><span className="kicker">VÀO PHÒNG CHƠI</span><h1 className="page-title">Bạn đã có mã phòng?</h1><p className="subtitle">Nhập mã phòng, đặt tên và chọn avatar của bạn.</p><form className="panel" style={{ marginTop: 25 }} onSubmit={join}><div className="field"><label>Mã phòng</label><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} style={{ fontSize: 24, letterSpacing: '.18em', fontWeight: 800 }} /></div><div className="field"><label>Tên hiển thị</label><input maxLength={24} minLength={2} required placeholder="Bạn muốn mọi người gọi là gì?" value={nickname} onChange={e => setNickname(e.target.value)} /></div><AvatarPicker value={avatarId} onChange={setAvatarId} />{error && <div className="notice error">{error}</div>}<button className="button primary big full" disabled={busy}>{busy ? 'Đang vào phòng…' : 'Vào phòng →'}</button></form></div></main>;
}
