// AQUA TERRITORY の BGM（明るく跳ねるような曲）を合成して public/audio/bgm-sea.wav に書き出す。
// 外部の音源は使わず、コードだけで作っている。実行: node scripts/make-bgm.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'audio', 'bgm-sea.wav');
const SR = 22050;
const BPM = 128;
const BEAT = 60 / BPM; // 1拍
const BAR = BEAT * 4; // 1小節
const CHORD_BARS = 2; // 1コードは2小節
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// 明るい長調の進行：C → G → Am → F（ポップでかわいい響き）
const CHORDS = [
  { tones: [60, 64, 67], bass: 36, lead: [76, 79, 81, 79, 76, 72, 74, 76] },
  { tones: [59, 62, 67], bass: 43, lead: [74, 71, 74, 79, 77, 74, 71, 74] },
  { tones: [57, 60, 64], bass: 33, lead: [72, 76, 79, 76, 72, 69, 72, 74] },
  { tones: [60, 65, 69], bass: 41, lead: [77, 76, 72, 77, 79, 77, 76, 72] },
];
const TOTAL_SEC = CHORDS.length * CHORD_BARS * BAR; // 約15秒のループ
const N = Math.round(TOTAL_SEC * SR);
const buf = new Float64Array(N);

// 決まった乱数（毎回同じ曲になる）
let seed = 20260101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** 弾むようなピアノ風の音 */
function addNote(startSec, freq, lenSec, amp, decay = 4.5, brightness = 0.35) {
  const s0 = Math.round(startSec * SR);
  const n = Math.round(Math.min(lenSec + 0.6, 2.2) * SR);
  for (let i = 0; i < n && s0 + i < N; i++) {
    const t = i / SR;
    const env = Math.exp(-t * decay) * Math.min(1, t * 300);
    const v = Math.sin(2 * Math.PI * freq * t) + brightness * Math.sin(2 * Math.PI * freq * 2 * t);
    buf[s0 + i] += v * env * amp;
  }
}

/** 軽い打楽器のような、高い音の「シャッ」 */
function addHat(startSec, amp) {
  const s0 = Math.round(startSec * SR);
  const n = Math.round(0.05 * SR);
  let prev = 0;
  for (let i = 0; i < n && s0 + i < N; i++) {
    const x = rnd() * 2 - 1;
    const hp = x - prev; // 高い音だけ残す
    prev = x;
    buf[s0 + i] += hp * Math.exp(-(i / SR) * 90) * amp;
  }
}

/** 泡が「ポン」と跳ねる音 */
function addBubble(startSec, amp) {
  const s0 = Math.round(startSec * SR);
  const n = Math.round(0.2 * SR);
  let phase = 0;
  for (let i = 0; i < n && s0 + i < N; i++) {
    const t = i / n;
    const f = 600 + 1000 * t;
    phase += (2 * Math.PI * f) / SR;
    buf[s0 + i] += Math.sin(phase) * Math.sin(Math.PI * t) * amp;
  }
}

CHORDS.forEach((c, ci) => {
  const barStart = ci * CHORD_BARS * BAR;
  for (let b = 0; b < CHORD_BARS; b++) {
    const t0 = barStart + b * BAR;
    // ベース：4分音符で「ポン、ポン」と弾む
    for (let k = 0; k < 4; k++) addNote(t0 + k * BEAT, midi(c.bass), BEAT * 0.8, 0.22, 6);
    // 分散和音：8分音符で軽快に
    const arpPattern = [0, 1, 2, 1, 0, 1, 2, 1];
    for (let k = 0; k < 8; k++) {
      const tone = c.tones[arpPattern[k]] + 12;
      addNote(t0 + k * (BEAT / 2), midi(tone), BEAT / 2, 0.09, 7, 0.5);
    }
    // メロディ：4分音符の明るいリード
    for (let k = 0; k < 4; k++) {
      const m = c.lead[(b * 4 + k) % c.lead.length];
      addNote(t0 + k * BEAT, midi(m), BEAT, 0.16, 3.2, 0.6);
    }
    // 裏拍のシャッという軽い音
    for (let k = 0; k < 4; k++) addHat(t0 + k * BEAT + BEAT / 2, 0.22);
    // 小節の頭に泡の「ポン」
    addBubble(t0, 0.06);
    if (rnd() < 0.7) addBubble(t0 + BEAT * 2.5, 0.04);
  }
});

// 継ぎ目を少しフェードして、ループをなめらかにする
const fade = Math.round(0.03 * SR);
for (let i = 0; i < fade; i++) {
  const g = i / fade;
  buf[i] *= g;
  buf[N - 1 - i] *= g;
}

// 音量を揃える（ピークを0.8に）
let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const gain = peak > 0 ? 0.8 / peak : 1;

// 16bit モノラルのWAVファイルとして書き出し
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, buf[i] * gain));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // モノラル
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, pcm]));
console.log(`BGM written: ${OUT} (${TOTAL_SEC.toFixed(1)}s loop, ${((header.length + pcm.length) / 1024) | 0} KB)`);
