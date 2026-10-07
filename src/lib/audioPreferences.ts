'use client';
import { useEffect, useState } from 'react';
export type AudioPreferences = { media: number; effects: number; narration: number; language: 'vi-VN' | 'en-US' };
const defaults: AudioPreferences = { media: 100, effects: 100, narration: 100, language: 'vi-VN' };
export function readAudioPreferences(): AudioPreferences {
  if (typeof window === 'undefined') return defaults;
  try {
    const value = JSON.parse(localStorage.getItem('quiz-audio-settings') || '{}');
    const volume = (key: 'media'|'effects'|'narration') => typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.min(100, Math.max(0, value[key])) : defaults[key];
    return { media: volume('media'), effects: volume('effects'), narration: volume('narration'), language: value.language === 'en-US' ? 'en-US' : 'vi-VN' };
  } catch { return defaults; }
}
export function useAudioPreferences() {
  const [settings, setSettings] = useState(defaults);
  useEffect(() => {
    const sync = () => setSettings(readAudioPreferences()); sync();
    window.addEventListener('quiz-audio-settings', sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('quiz-audio-settings', sync); window.removeEventListener('storage', sync); };
  }, []);
  const update = (change: Partial<AudioPreferences>) => {
    localStorage.setItem('quiz-audio-settings', JSON.stringify({ ...readAudioPreferences(), ...change }));
    window.dispatchEvent(new Event('quiz-audio-settings'));
  };
  return { settings, update };
}
