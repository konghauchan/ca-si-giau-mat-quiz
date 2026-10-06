'use client';
import { useEffect, useRef, useState } from 'react';
import { youtubeId } from '@/lib/core';

type YTPlayer = { seekTo: (seconds: number, allowSeekAhead: boolean) => void; playVideo: () => void; pauseVideo: () => void; getIframe: () => HTMLIFrameElement; destroy: () => void };
type YTWindow = Window & { YT?: { Player: new (element: HTMLElement, config: object) => YTPlayer }; onYouTubeIframeAPIReady?: () => void };
let loading: Promise<void> | null = null;
function loadYouTube(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Cần mở trang bằng trình duyệt.'));
  const win = window as YTWindow;
  if (win.YT?.Player) return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    win.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.onerror = () => reject(new Error('Không tải được trình phát YouTube.')); document.head.appendChild(script);
  });
  return loading;
}
export function ClipPlayer({ url, start, duration, preview = false, reveal = false, showVideo = false, paused = false }: { url: string; start: number; duration: number; preview?: boolean; reveal?: boolean; showVideo?: boolean; paused?: boolean }) {
  const videoId = youtubeId(url);
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedRef = useRef(false);
  const pausedRef = useRef(paused);
  const remainingMs = useRef(duration * 1000);
  const playStartedAt = useRef<number | null>(null);
  const endedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!videoId || !mount.current) return;
    remainingMs.current = duration * 1000; playStartedAt.current = null; endedRef.current = false; playedRef.current = false;
    loadYouTube().then(() => {
      if (!active || !mount.current) return;
      player.current = new (window as YTWindow).YT!.Player(mount.current, {
        videoId,
        width: '100%', height: '100%',
        playerVars: { autoplay: preview || pausedRef.current ? 0 : 1, controls: preview ? 1 : 0, disablekb: preview ? 0 : 1, fs: preview ? 1 : 0, iv_load_policy: 3, rel: 0, playsinline: 1, start: Math.floor(start) },
        events: {
          onReady: () => {
            if (!active) return;
            setReady(true);
            if(!preview){const iframe=player.current?.getIframe();iframe?.setAttribute('tabindex','-1');iframe?.setAttribute('title','Đoạn video của câu hỏi');}
            if (!preview && !pausedRef.current && player.current) {
              player.current.seekTo(start, true);
              player.current.playVideo();
            }
          },
          onStateChange: (event: { data: number }) => {
            if (!active) return;
            if (event.data === 1) {
              if (pausedRef.current || (endedRef.current && !preview)) { player.current?.pauseVideo(); return; }
              setAutoplayBlocked(false);
              playedRef.current = true; setPlaying(true); setPlayed(true);
              playStartedAt.current = Date.now();
              if (stopTimer.current) clearTimeout(stopTimer.current);
              stopTimer.current = setTimeout(() => { endedRef.current = true; remainingMs.current = 0; playStartedAt.current = null; player.current?.pauseVideo(); setPlaying(false); }, Math.max(1, remainingMs.current));
            } else if (playStartedAt.current !== null) {
              remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - playStartedAt.current));
              playStartedAt.current = null;
              if (stopTimer.current) clearTimeout(stopTimer.current);
              setPlaying(false);
            }
          },
          onAutoplayBlocked: () => { if (active && !preview) setAutoplayBlocked(true); },
          onError: () => { if (active) setError('Video không thể phát. Người tạo phòng có thể bỏ qua câu hỏi.'); }
        }
      });
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; if (stopTimer.current) clearTimeout(stopTimer.current); player.current?.destroy(); player.current = null; };
  }, [videoId, start, duration, preview, reveal]);
  useEffect(() => {
    pausedRef.current = paused;
    if (preview || !player.current || endedRef.current) return;
    if (paused) player.current.pauseVideo();
    else if (ready) player.current.playVideo();
  }, [paused, preview, ready]);
  function play() {
    if (!player.current || paused || (!preview && playedRef.current)) return;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    setAutoplayBlocked(false);
    player.current.seekTo(start, true); player.current.playVideo();
  }
  if (!videoId) return <div className="notice error">Đường dẫn YouTube không hợp lệ.</div>;
  const visibleVideo = preview || reveal || showVideo;
  return <div className={`clip-player ${reveal ? 'clip-player-reveal' : ''}`}>
    <div className={`video-frame ${visibleVideo ? !preview ? 'guarded-video' : '' : 'concealed'}`}><div ref={mount} />{!visibleVideo && <div className="video-mask" aria-label="Video YouTube được che để giữ bí mật đáp án"><span className="video-mask-icon">♫</span><strong>{playing ? 'Đang phát đoạn nhạc' : played ? 'Đã nghe đoạn nhạc' : 'Đoạn nhạc bí mật'}</strong><small>{duration} giây nghe</small></div>}{visibleVideo && !preview && <><div className="video-interaction-shield" aria-hidden="true"/><div className="video-title-cover" aria-hidden="true"/><div className="video-controls-cover" aria-hidden="true"/>{!playing && <div className="video-idle-cover" role="status"><strong>{paused?'Đã tạm dừng':played?'Đã phát xong đoạn video':'Đoạn video bí mật'}</strong><span>{autoplayBlocked?'Bấm Phát để bắt đầu xem':!ready?'Đang chuẩn bị video…':'Chỉ được xem một lần'}</span></div>}</>}</div>
    {!reveal && <div className="clip-actions"><button className="button primary" type="button" disabled={paused || !ready || playing || (!preview && played)} onClick={play}>{paused ? 'Đã tạm dừng' : playing ? showVideo ? 'Đang phát đoạn phim…' : 'Đang phát đoạn nhạc…' : played && !preview ? showVideo ? 'Đã xem đoạn phim' : 'Đã phát đoạn nhạc' : `▶ Phát ${duration} giây`}</button></div>}
    {reveal && autoplayBlocked && !played && <div className="clip-actions"><button className="button primary" type="button" disabled={paused || !ready} onClick={play}>▶ Phát video kết quả</button><p className="muted">Trình duyệt đã chặn tự phát. Bấm một lần để xem video.</p></div>}
    {error && <div className="notice error">{error}</div>}
  </div>;
}
