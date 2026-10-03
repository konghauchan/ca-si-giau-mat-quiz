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
    try { const result = await api<{ roomId: string; playerToken: string }>('/api/room', { method: 'POST', body: { action: 'join', pin, nickname, avatarId } }); localStorage.setItem(`player:${result.roomId}`, result.playerToken); router.push(`/play/${result.roomId}`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="page narrow"><div className="join-card"><div className="join-graphic"><DoorOpen size={31} /></div><span className="kicker">VÀO PHÒNG CHƠI</span><h1 className="page-title">Bạn đã có mã phòng?</h1><p className="subtitle">Nhập mã phòng, đặt tên và chọn avatar của bạn.</p><form className="panel" style={{ marginTop: 25 }} onSubmit={join}><div className="field"><label>Mã phòng</label><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} style={{ fontSize: 24, letterSpacing: '.18em', fontWeight: 800 }} /></div><div className="field"><label>Tên hiển thị</label><input maxLength={24} minLength={2} required placeholder="Bạn muốn mọi người gọi là gì?" value={nickname} onChange={e => setNickname(e.target.value)} /></div><AvatarPicker value={avatarId} onChange={setAvatarId} />{error && <div className="notice error">{error}</div>}<button className="button primary big full" disabled={busy}>{busy ? 'Đang vào phòng…' : 'Vào phòng →'}</button></form></div></main>;
}
