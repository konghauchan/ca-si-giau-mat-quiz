'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { useAudioPreferences } from '@/lib/audioPreferences';
import { useGameSounds } from '@/lib/useGameSounds';
import { loadIntroAudio, prepareIntroAudio } from '@/lib/introAudio';
import type { IntroMode } from '@/lib/roundIntro';
type Kind = 'question' | 'clue' | 'answer' | 'preview' | 'intro';
export function NarrationControl({ roomId, token, questionId, kind, clueIndex, paused = false, previewText, prepare = false, header = false, introMode, film = false }: {
  roomId?: string; token?: string; questionId?: string; kind?: Kind; clueIndex?: number; paused?: boolean; previewText?: string; prepare?: boolean; header?: boolean; introMode?: IntroMode; film?: boolean;
}) {
  const { settings, update } = useAudioPreferences();
  const { enabled: effectsEnabled, toggle: toggleEffects } = useGameSounds();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const volume = useRef(settings.narration);
  useEffect(() => { volume.current = settings.narration; if (audio.current) audio.current.volume = settings.narration / 100; }, [settings.narration]);
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
    if (!configured || !automatic || !roomId || !questionId || !introMode) return;
    void prepareIntroAudio({ roomId, questionId, token: token || '', language: settings.language, film }, introMode);
  }, [configured, automatic, roomId, questionId, token, introMode, film, settings.language]);
  useEffect(() => {
    if (!configured || !automatic || !prepare || !roomId || !questionId) return;
    void fetch('/api/narration', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-game-token': token || '' }, body: JSON.stringify({ roomId, questionId, kind: 'prepare', language: settings.language }) }).catch(() => {});
  }, [configured, automatic, prepare, roomId, token, questionId, settings.language]);
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
        let blob: Blob;
        if (kind === 'intro' && roomId && questionId && introMode) {
          blob = await loadIntroAudio({ roomId, questionId, token: token || '', language: settings.language, film }, introMode);
        } else {
        const response = await fetch('/api/narration', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-game-token': token || '' }, body: JSON.stringify({ roomId, questionId, kind, language: settings.language, ...(kind === 'preview' ? { text: previewText } : {}) }), signal: controller.signal });
        if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Chưa phát được giọng đọc.'); }
        blob = await response.blob();
        }
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); audio.current = new Audio(objectUrl); audio.current.volume = volume.current / 100;
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
  }, [configured, kind, roomId, token, questionId, clueIndex, paused, previewText, automatic, settings.language, introMode, film]);
  if ((!configured || !kind) && !header) return null;
  const label = kind === 'intro' ? 'giới thiệu' : kind === 'answer' ? 'đáp án' : kind === 'clue' ? 'gợi ý' : 'câu hỏi';
  const controls = <div className="narration-control">
    <div className="narration-buttons"><span><Mic size={16}/>Giọng đọc</span>
      <button type="button" className="button secondary" disabled={!configured || !kind || paused || status === 'loading'} onClick={() => { if (status === 'playing') { stop.current(); setStatus('idle'); } else start.current(); }}>{status === 'playing' ? <Square size={14}/> : <Play size={14}/>} {status === 'loading' ? 'Đang chuẩn bị…' : status === 'playing' ? 'Dừng đọc' : `Nghe ${label}`}</button>
      <button type="button" className="button ghost" aria-pressed={automatic} onClick={() => { localStorage.setItem('quiz-narration', automatic ? 'off' : 'on'); setAutomatic(!automatic); }}><VolumeX size={14}/>{automatic ? 'Tắt tự đọc' : 'Bật tự đọc'}</button>
    </div>
    {(status === 'error' || status === 'blocked') && <p role="status">{status === 'blocked' ? 'Trình duyệt chặn tự phát. Bấm Nghe để bật giọng đọc.' : error}</p>}
  </div>;
  if (!header) return controls;
  return <details ref={menu} className="audio-menu" onKeyDown={e=>{if(e.key==='Escape' && menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}><summary className="game-icon-button" aria-label="Điều chỉnh âm thanh" title="Điều chỉnh âm thanh"><Volume2 size={18}/></summary><div className="audio-menu-panel"><strong>Âm thanh</strong>
    <button type="button" className="button secondary" aria-pressed={effectsEnabled} onClick={toggleEffects}>{effectsEnabled ? 'Tắt hiệu ứng' : 'Bật hiệu ứng'}</button>
    {(['media','effects','narration'] as const).map(key => <label className="audio-volume" key={key}><span>{key === 'media' ? 'Nhạc / video' : key === 'effects' ? 'Hiệu ứng' : 'Giọng đọc'}<output>{settings[key]}%</output></span><input type="range" min="0" max="100" value={settings[key]} aria-label={`Âm lượng ${key === 'media' ? 'nhạc / video' : key === 'effects' ? 'hiệu ứng' : 'giọng đọc'}`} onChange={e=>update({[key]:Number(e.target.value)})}/></label>)}
    <label className="audio-language">Ngôn ngữ giọng đọc<select value={settings.language} onChange={e=>update({language:e.target.value as 'vi-VN'|'en-US'})}><option value="vi-VN">Tiếng Việt</option><option value="en-US">Tiếng Anh (Mỹ)</option></select></label><small>Đổi giọng đọc, giữ nguyên nội dung câu hỏi.</small>
    {configured ? controls : <p>Giọng đọc chưa được cấu hình.</p>}
  </div></details>;
}
