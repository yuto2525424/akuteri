// 操作の手応え：効果音（ブラウザ内で合成）・振動（対応する端末）・画面の揺れ。
// 音のオン・オフはブラウザに保存する。音は最初の操作の後でないと鳴らせないため、
// 最初のクリックでAudioを用意する。
import { useEffect, useState } from 'react';

export type Sfx = 'draw' | 'play' | 'attack' | 'hit' | 'crit' | 'turn' | 'counter' | 'win' | 'lose' | 'ability' | 'tap' | 'confirm' | 'shatter';

const KEY = 'aqua-territory-sfx';
let ctx: AudioContext | null = null;

function loadSfxOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 一音を鳴らす（周波数を滑らかに変えられる） */
function tone(c: AudioContext, t: number, from: number, to: number, dur: number, type: OscillatorType, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 短い雑音（衝撃・風切り） */
function noise(c: AudioContext, t: number, dur: number, vol: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource();
  const g = c.createGain();
  s.buffer = buf;
  g.gain.setValueAtTime(vol, t);
  s.connect(g).connect(c.destination);
  s.start(t);
}

export function playSfx(kind: Sfx) {
  if (!loadSfxOn()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  switch (kind) {
    case 'draw': // シュッと引く
      tone(c, t, 500, 900, 0.09, 'sine', 0.18);
      break;
    case 'play': // ポン、キラン（出す）
      tone(c, t, 660, 660, 0.08, 'triangle', 0.22);
      tone(c, t + 0.07, 990, 1320, 0.16, 'triangle', 0.2);
      break;
    case 'attack': // 攻撃の突進
      tone(c, t, 380, 120, 0.28, 'sawtooth', 0.12);
      break;
    case 'hit': // 撃破の衝撃
      noise(c, t, 0.18, 0.35);
      tone(c, t, 180, 45, 0.3, 'sine', 0.3);
      break;
    case 'crit': // 撃破：ドンッ！と低音が落ちて、上へ駆け上がる派手な一撃
      tone(c, t, 90, 35, 0.4, 'sine', 0.35);
      noise(c, t, 0.25, 0.4);
      tone(c, t + 0.04, 300, 1800, 0.3, 'sawtooth', 0.1);
      [784, 988, 1318].forEach((f, i) => tone(c, t + 0.22 + i * 0.07, f, f, 0.18, 'triangle', 0.18));
      break;
    case 'turn': // ターン交代のファンファーレ
      [523, 659, 784].forEach((f, i) => tone(c, t + i * 0.09, f, f, 0.16, 'triangle', 0.2));
      break;
    case 'counter': // 迎撃の風切り
      noise(c, t, 0.22, 0.14);
      tone(c, t, 400, 1000, 0.2, 'triangle', 0.12);
      break;
    case 'shatter': // ガラスが割れる「パリン」
      noise(c, t, 0.32, 0.45);
      tone(c, t, 2600, 1100, 0.22, 'sine', 0.12);
      tone(c, t + 0.05, 3400, 1500, 0.3, 'triangle', 0.08);
      break;
    case 'tap': // カウントの「コツ」（押した感触）
      tone(c, t, 1400, 800, 0.05, 'square', 0.07);
      break;
    case 'confirm': // 決定（ポン・ポン）
      tone(c, t, 880, 880, 0.06, 'triangle', 0.16);
      tone(c, t + 0.07, 1320, 1320, 0.12, 'triangle', 0.14);
      break;
    case 'ability': // 能力発動：キラッと上がる
      tone(c, t, 700, 1400, 0.14, 'square', 0.12);
      tone(c, t + 0.1, 1050, 2100, 0.22, 'triangle', 0.16);
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone(c, t + i * 0.11, f, f, 0.3, 'triangle', 0.25));
      break;
    case 'lose':
      [523, 415, 330, 262].forEach((f, i) => tone(c, t + i * 0.16, f, f * 0.98, 0.3, 'sine', 0.22));
      break;
  }
}

const VIBE: Record<Sfx, number[]> = {
  draw: [8],
  play: [18],
  attack: [30, 40, 60],
  hit: [60, 40, 90],
  crit: [90, 50, 140, 50, 220],
  turn: [20, 30, 20],
  counter: [25],
  win: [40, 60, 40, 60, 120],
  lose: [200],
  ability: [25, 30, 45],
  tap: [6],
  confirm: [14, 20, 14],
  shatter: [40, 30, 40],
};

/** 対応する端末では、操作に合わせて小さく振動させる */
export function vibrate(kind: Sfx) {
  try {
    if (navigator.vibrate) navigator.vibrate(VIBE[kind]);
  } catch {
    /* 振動に対応していなければ何もしない */
  }
}

/** 効果音と振動をまとめて鳴らす */
export function feel(kind: Sfx) {
  playSfx(kind);
  vibrate(kind);
}

/** どこをタップしても、押した場所から光の輪が広がる（すべての操作で出る共通の演出） */
let rippleOn = false;
export function installRipple() {
  if (rippleOn) return;
  rippleOn = true;
  window.addEventListener(
    'pointerdown',
    (e) => {
      const el = document.createElement('div');
      el.className = 'ripple';
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 900);
    },
    { passive: true },
  );
}

let unlocked = false;
export function unlockAudioOnce() {
  if (unlocked) return;
  unlocked = true;
  window.addEventListener(
    'pointerdown',
    () => {
      audio();
    },
    { once: true },
  );
}

/** 効果音のオン・オフ（ブラウザに保存） */
export function useSfx(): [boolean, () => void] {
  const [on, setOn] = useState<boolean>(() => loadSfxOn());
  useEffect(() => {
    unlockAudioOnce();
  }, []);
  const toggle = () => {
    const next = !loadSfxOn();
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      /* 保存できなくても遊べる */
    }
    setOn(next);
    if (next) playSfx('play');
  };
  return [on, toggle];
}
