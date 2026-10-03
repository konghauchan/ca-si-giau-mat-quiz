'use client';
import { useEffect, useRef, useState } from 'react';
import { mediaToken } from '@/lib/client';

export function AudioClipPlayer({ asset, start, duration, roomId, gameToken, preview = false, paused = false }: { asset: string; start: number; duration: number; roomId?: string; gameToken?: string; preview?: boolean; paused?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const attemptedAutoPlay = useRef(false);
  const pausedRef = useRef(paused);
  const [ready, setReady] = useState(false); const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    attemptedAutoPlay.current = false; setReady(false); setPlaying(false); setPlayed(false); setError('');
    const params = preview ? new URLSearchParams({ asset, start: String(start), duration: String(duration) }) : new URLSearchParams({ roomId: roomId || '' });
    fetch(`/api/media/${preview ? 'preview' : 'clip'}?${params}`, {
      headers: preview ? { 'x-media-token': mediaToken() } : { 'x-game-token': gameToken || '' }, signal: controller.signal, cache: 'no-store'
    }).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      objectUrl = URL.createObjectURL(await response.blob());
      if (controller.signal.aborted) { URL.revokeObjectURL(objectUrl); return; }
      audio.current = new Audio(objectUrl);
      audio.current.onended = () => setPlaying(false);
      setReady(true);
      if (!preview && !pausedRef.current && !attemptedAutoPlay.current) {
        attemptedAutoPlay.current = true;
        void audio.current.play().then(() => { setPlaying(true); setPlayed(true); }).catch(() => {
          setError('Trình duyệt đã chặn tự phát. Bấm Nghe đoạn nhạc để tiếp tục.');
        });
      }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || 'Không tải được đoạn nhạc.'); });
    return () => { controller.abort(); audio.current?.pause(); audio.current = null; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset, start, duration, roomId, gameToken, preview]);
  useEffect(() => {
    pausedRef.current = paused;
    if (preview || !audio.current) return;
    if (paused) { audio.current.pause(); setPlaying(false); }
    else if (ready && !audio.current.ended && (played || !attemptedAutoPlay.current)) {
      attemptedAutoPlay.current = true;
      void audio.current.play().then(() => { setPlaying(true); setPlayed(true); }).catch(() => setError('Trình duyệt đã chặn tự phát. Bấm Nghe đoạn nhạc để tiếp tục.'));
    }
  }, [paused, preview, ready, played]);
  async function play() {
    if (!audio.current || paused || (!preview && played)) return;
    try { audio.current.currentTime = 0; await audio.current.play(); setPlaying(true); setPlayed(true); setError(''); }
    catch { setError('Trình duyệt không thể phát nhạc. Hãy kiểm tra âm lượng hoặc thử lại.'); }
  }
  return <div className="audio-clip"><div className="audio-clip-icon">♫</div><div><strong>Đoạn nhạc {duration} giây</strong><p>Chỉ phát đoạn nhạc được phép nghe. Không có thanh tua hoặc tên tệp.</p></div><button type="button" className="button primary" disabled={paused || !ready || playing || (!preview && played)} onClick={play}>{paused ? 'Đã tạm dừng' : playing ? 'Đang phát…' : ready ? played && !preview ? 'Đã phát' : '▶ Nghe đoạn nhạc' : 'Đang chuẩn bị…'}</button>{error && <div className="notice error">{error}</div>}</div>;
}
