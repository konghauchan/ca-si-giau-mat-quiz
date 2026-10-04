'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Cue = 'submit' | 'correct' | 'wrong' | 'score' | 'rank';
const patterns: Record<Cue, Array<[number, number, number, number]>> = {
  submit: [[520, 0, .07, .018], [690, .08, .09, .016]],
  correct: [[523, 0, .13, .027], [659, .1, .13, .027], [784, .21, .24, .032]],
  wrong: [[330, 0, .13, .018], [247, .12, .22, .02]],
  score: [[440, 0, .07, .012], [554, .08, .07, .014], [659, .16, .07, .016], [880, .24, .2, .022]],
  rank: [[392, 0, .12, .017], [523, .12, .12, .019], [659, .24, .12, .021], [784, .36, .28, .024]],
};

export function useGameSounds() {
  const [enabled, setEnabled] = useState(true);
  const context = useRef<AudioContext | null>(null);
  useEffect(() => {
    setEnabled(localStorage.getItem('game-sounds') !== 'off');
    const unlock = () => { if (context.current?.state === 'suspended') void context.current.resume(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); void context.current?.close(); context.current = null; };
  }, []);
  const toggle = useCallback(() => setEnabled(current => {
    localStorage.setItem('game-sounds', current ? 'off' : 'on');
    return !current;
  }), []);
  const play = useCallback((cue: Cue) => {
    if (!enabled) return;
    try {
      const audio = context.current ?? new AudioContext();
      context.current = audio;
      if (audio.state === 'suspended') void audio.resume();
      const start = audio.currentTime + .01;
      for (const [frequency, delay, duration, volume] of patterns[cue]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = cue === 'wrong' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + delay);
        gain.gain.setValueAtTime(.0001, start + delay);
        gain.gain.exponentialRampToValueAtTime(volume, start + delay + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + delay + duration);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + duration + .01);
      }
    } catch { /* Audio is optional when the browser blocks playback. */ }
  }, [enabled]);
  return { enabled, toggle, play };
}
