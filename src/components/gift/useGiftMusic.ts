"use client";

import { useEffect, useRef, useState } from "react";

export default function useGiftMusic() {
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const starting = useRef(false);
  const alive = useRef(true);
  const [playing, setPlaying] = useState(false);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; void context.current?.close(); context.current = null; setPlaying(false); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearInterval(timer.current); void context.current?.close(); }; }, []);
  async function toggle() {
    if (starting.current) return;
    if (playing) { stop(); return; }
    starting.current = true;
    try {
      const ctx = new AudioContext(); context.current = ctx;
      await ctx.resume();
      if (!alive.current) { await ctx.close(); return; }
      const schedule = () => {
        [0, 7, 12, 11, 7, 4, 2, 7, 4, 0, 2, -5].forEach((note, i) => {
          const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
          const start = ctx.currentTime + i * 0.85;
          oscillator.type = "sine"; oscillator.frequency.value = 523.25 * 2 ** (note / 12);
          gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.045, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + 2.2);
          oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + 2.3);
        });
      };
      schedule(); timer.current = setInterval(schedule, 10200); setPlaying(true);
    } catch { stop(); }
    finally { starting.current = false; }
  }
  return { playing, toggle, stop };
}
