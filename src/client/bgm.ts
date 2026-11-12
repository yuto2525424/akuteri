// BGMの再生・停止。オン・オフの状態はブラウザに保存する。
// ブラウザは最初の操作（クリックなど）の後でないと音を出せないので、
// 前回オンだった場合は最初のクリックで再生を始める。
// 同じブラウザの別のタブで切り替えたときも、この画面の音を止める・鳴らす。
import { useEffect, useState } from 'react';

const KEY = 'aqua-territory-bgm';
const SRC = '/audio/bgm-sea.wav';
let audio: HTMLAudioElement | null = null;

function player(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SRC);
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = 'auto';
  }
  return audio;
}

function loadOn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function saveOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* 保存できなくても遊べる */
  }
}

/** 設定に合わせて、音を鳴らす・止める。止めるときは必ず一時停止して先頭に戻す。 */
function apply(on: boolean) {
  const p = player();
  if (on) {
    if (p.paused) p.play().catch(() => { /* 操作がまだなら次のクリックで再試行 */ });
  } else {
    p.pause();
    p.currentTime = 0;
  }
}

let wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  // 前回オンだった場合、最初のクリックで再生を始める
  const onFirstGesture = () => {
    if (loadOn()) apply(true);
    window.removeEventListener('pointerdown', onFirstGesture);
  };
  window.addEventListener('pointerdown', onFirstGesture);
  // 別のタブで切り替えたときも、この画面の音を合わせる
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) apply(loadOn());
  });
  // ページを離れるときは必ず止める
  window.addEventListener('pagehide', () => apply(false));
}

/** BGMのオン・オフを管理するフック。ロビーと対戦画面の両方で使える。 */
export function useBgm(): [boolean, () => void] {
  const [on, setOn] = useState<boolean>(() => loadOn());

  useEffect(() => {
    wireOnce();
    if (on) apply(true);
    else apply(false);
  }, [on]);

  const toggle = () => {
    // 押した時点で保存されている設定を基準にする（表示が古くても食い違わない）
    const next = !loadOn();
    saveOn(next);
    setOn(next);
    apply(next);
  };

  return [on, toggle];
}
