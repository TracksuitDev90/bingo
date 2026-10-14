// Synthesised sound effects (no audio files to load).

import { store } from './ui.js';

let ctx;
let out;
let noiseBuf;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0.7;
    out.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(gain, t, peak, attack, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(t, dur, { type = 'lowpass', freq = 1000, q = 0.7, peak = 0.3, attack = 0.005 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, attack, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.05);
  return { src, f, g };
}

function tone(t, { type = 'sine', from, to = from, dur, peak = 0.3, attack = 0.004 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  env(g, t, peak, attack, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

let enabled = store.get('bingo:sound', true);
const ready = () => enabled && ac();

export const sound = {
  get on() {
    return enabled;
  },
  set on(v) {
    enabled = !!v;
    store.set('bingo:sound', enabled);
    if (enabled) ac();
  },

  /** Foam dauber hitting paper. */
  daub() {
    if (!ready()) return;
    const t = ctx.currentTime;
    tone(t, { from: 170, to: 55, dur: 0.13, peak: 0.55 });
    noise(t, 0.07, { freq: 900, peak: 0.22 });
    noise(t + 0.01, 0.12, { type: 'bandpass', freq: 2400, q: 1.5, peak: 0.05 });
  },

  /** Rushing air while the balls mix. Returns a stop() function. */
  whoosh(seconds) {
    if (!ready()) return () => {};
    const t = ctx.currentTime;
    const { src, f, g } = noise(t, seconds + 0.6, { type: 'bandpass', freq: 500, q: 0.9, peak: 0.25, attack: 0.35 });
    f.frequency.setValueAtTime(380, t);
    f.frequency.linearRampToValueAtTime(1500, t + seconds * 0.6);
    f.frequency.linearRampToValueAtTime(700, t + seconds + 0.5);
    return () => {
      const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + 0.4);
      src.stop(n + 0.45);
    };
  },

  /** Plastic balls knocking together. */
  clack(strength = 1) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const p = 1800 + Math.random() * 1600;
    tone(t, { type: 'triangle', from: p, to: p * 0.8, dur: 0.035, peak: 0.05 * strength });
    noise(t, 0.02, { type: 'highpass', freq: 3000, peak: 0.04 * strength });
  },

  /** Ball popping out of the tube. */
  pop() {
    if (!ready()) return;
    const t = ctx.currentTime;
    tone(t, { from: 520, to: 140, dur: 0.16, peak: 0.45 });
    noise(t, 0.05, { freq: 2000, peak: 0.2 });
    tone(t + 0.12, { type: 'triangle', from: 1046, dur: 0.5, peak: 0.12 });
    tone(t + 0.12, { type: 'sine', from: 1568, dur: 0.6, peak: 0.07 });
  },

  /** A valid bingo. */
  fanfare() {
    if (!ready()) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
      tone(t + i * 0.11 + (i > 3 ? 0.08 : 0), { type: 'triangle', from: f, dur: i === 5 ? 0.9 : 0.22, peak: 0.22 }),
    );
  },

  /** Not a bingo. */
  buzz() {
    if (!ready()) return;
    const t = ctx.currentTime;
    tone(t, { type: 'sawtooth', from: 140, to: 110, dur: 0.45, peak: 0.12 });
    tone(t, { type: 'square', from: 147, to: 116, dur: 0.45, peak: 0.05 });
  },

  /** Paper being slid across the table. */
  shuffle() {
    if (!ready()) return;
    const t = ctx.currentTime;
    noise(t, 0.35, { type: 'bandpass', freq: 3200, q: 0.6, peak: 0.08, attack: 0.08 });
  },
};
