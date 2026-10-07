'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAudioPreferences } from './audioPreferences';

type Cue = 'submit' | 'correct' | 'wrong' | 'score' | 'rank' | 'clock' | 'tick' | 'finalTick' | 'transition' | 'reveal';
const patterns: Record<Cue, Array<[number, number, number, number]>> = {
  submit: [[520, 0, .07, .024], [690, .08, .09, .022]],
  correct: [[523, 0, .13, .037], [659, .1, .13, .037], [784, .21, .25, .043], [1047, .28, .2, .027]],
  wrong: [[370, 0, .12, .03], [294, .12, .16, .032], [220, .27, .22, .025]],
  score: [[440, 0, .07, .025], [554, .08, .07, .027], [659, .16, .07, .03], [880, .24, .25, .038]],
  rank: [[392, 0, .12, .026], [523, .12, .12, .03], [659, .24, .12, .032], [784, .36, .28, .038]],
  clock: [[460, 0, .055, .012]],
  tick: [[740, 0, .065, .022]],
  finalTick: [[1047, 0, .19, .037], [784, .11, .16, .018]],
  transition: [[392, 0, .08, .018], [587, .1, .11, .024]],
  reveal: [[440, 0, .08, .024], [659, .09, .11, .028], [880, .2, .16, .032]],
};

export function useGameSounds() {
  const { settings } = useAudioPreferences();
  const [enabled, setEnabled] = useState(true);
  const context = useRef<AudioContext | null>(null);
  useEffect(() => {
    setEnabled(localStorage.getItem('game-sounds') !== 'off');
    const sync = () => setEnabled(localStorage.getItem('game-sounds') !== 'off');
    window.addEventListener('game-sounds-change', sync);
    const unlock = () => { if (context.current?.state === 'suspended') void context.current.resume(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('game-sounds-change', sync); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); void context.current?.close(); context.current = null; };
  }, []);
  const toggle = useCallback(() => {
    localStorage.setItem('game-sounds', enabled ? 'off' : 'on');
    window.dispatchEvent(new Event('game-sounds-change'));
  }, [enabled]);
  const play = useCallback((cue: Cue) => {
    if (!enabled || settings.effects === 0) return;
    try {
      const audio = context.current ?? new AudioContext();
      context.current = audio;
      if (audio.state === 'suspended') void audio.resume();
      const start = audio.currentTime + (cue === 'score' ? .48 : .01);
      for (const [frequency, delay, duration, volume] of patterns[cue]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = cue === 'wrong' ? 'triangle' : cue === 'clock' || cue === 'tick' || cue === 'finalTick' ? 'square' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + delay);
        gain.gain.setValueAtTime(.0001, start + delay);
        gain.gain.exponentialRampToValueAtTime(volume * settings.effects / 100, start + delay + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + delay + duration);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + duration + .01);
      }
    } catch { /* Audio is optional when the browser blocks playback. */ }
  }, [enabled, settings.effects]);
  return { enabled, toggle, play };
}
