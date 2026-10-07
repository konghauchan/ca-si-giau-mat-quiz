'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Square, VolumeX } from 'lucide-react';
type Kind = 'question' | 'clue' | 'answer' | 'preview';
export function NarrationControl({ roomId, token, questionId, kind, clueIndex, paused = false, previewText, prepare = false }: {
  roomId?: string; token?: string; questionId?: string; kind?: Kind; clueIndex?: number; paused?: boolean; previewText?: string; prepare?: boolean;
}) {
  const [configured, setConfigured] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [status, setStatus] = useState<'idle'|'loading'|'playing'|'blocked'|'error'>('idle');
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useRef<() => void>(() => {});
  const start = useRef<() => void>(() => {});
  useEffect(() => {
    setAutomatic(localStorage.getItem('quiz-narration') !== 'off');
    const controller = new AbortController();
    void fetch('/api/narration', { signal: controller.signal }).then(response => response.json()).then(data => setConfigured(data.enabled === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!configured || !automatic || !prepare || !roomId || !questionId) return;
    void fetch('/api/narration', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-game-token': token || '' }, body: JSON.stringify({ roomId, questionId, kind: 'prepare' }) }).catch(() => {});
  }, [configured, automatic, prepare, roomId, token, questionId]);
  useEffect(() => {
    if (!configured || !kind || paused) { setStatus('idle'); return; }
    const controller = new AbortController(); let objectUrl = ''; let fetching = false;
    setStatus('idle'); setError('');
    const announce = (playing: boolean) => window.dispatchEvent(new CustomEvent('quiz-narration', { detail: playing }));
    const halt = () => { controller.abort(); audio.current?.pause(); audio.current = null; announce(false); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    stop.current = () => { audio.current?.pause(); announce(false); };
    const play = async () => {
      if (fetching || controller.signal.aborted) return;
      if (audio.current) {
        try { audio.current.currentTime=0; await audio.current.play(); setStatus('playing'); announce(true); }
        catch { setStatus('blocked'); }
        return;
      }
      fetching = true; setStatus('loading'); setError('');
      try {
        const response = await fetch('/api/narration', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-game-token': token || '' }, body: JSON.stringify({ roomId, questionId, kind, ...(kind === 'preview' ? { text: previewText } : {}) }), signal: controller.signal });
        if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Chưa phát được giọng đọc.'); }
        const blob = await response.blob(); if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); audio.current = new Audio(objectUrl);
        audio.current.onended = () => { setStatus('idle'); announce(false); };
        audio.current.onerror = () => { setStatus('error'); setError('Không phát được âm thanh.'); announce(false); };
        try { await audio.current.play(); if (!controller.signal.aborted) { setStatus('playing'); announce(true); } }
        catch { if (!controller.signal.aborted) setStatus('blocked'); }
      } catch (failure) { if (!controller.signal.aborted) { setStatus('error'); setError((failure as Error).message); } }
      finally { fetching = false; }
    };
    start.current = () => void play();
    if (automatic) void play();
    return halt;
  }, [configured, kind, roomId, token, questionId, clueIndex, paused, previewText, automatic]);
  if (!configured || !kind) return null;
  const label = kind === 'answer' ? 'đáp án' : kind === 'clue' ? 'gợi ý' : 'câu hỏi';
  return <div className="narration-control">
    <div className="narration-buttons"><span><Mic size={16}/>Giọng đọc tiếng Việt</span>
      <button type="button" className="button secondary" disabled={paused || status === 'loading'} onClick={() => { if (status === 'playing') { stop.current(); setStatus('idle'); } else start.current(); }}>{status === 'playing' ? <Square size={14}/> : <Play size={14}/>} {status === 'loading' ? 'Đang chuẩn bị…' : status === 'playing' ? 'Dừng đọc' : `Nghe ${label}`}</button>
      <button type="button" className="button ghost" aria-pressed={automatic} onClick={() => { localStorage.setItem('quiz-narration', automatic ? 'off' : 'on'); setAutomatic(!automatic); }}><VolumeX size={14}/>{automatic ? 'Tắt tự đọc' : 'Bật tự đọc'}</button>
    </div>
    {(status === 'error' || status === 'blocked') && <p role="status">{status === 'blocked' ? 'Trình duyệt chặn tự phát. Bấm Nghe để bật giọng đọc.' : error}</p>}
  </div>;
}
