import { describe, expect, it } from 'vitest';
import { createGame } from '../src/shared/engine';
import { cpuNeedsDecision, cpuStep, type CpuLevel } from '../src/shared/cpu';
import type { GameState, PlayerId } from '../src/shared/types';

/** CPU同士で最後まで進め、行き詰まりがないことを確認する */
function play(seed: number, a: 'sea' | 'river', b: 'sea' | 'river'): GameState {
  let s = createGame(seed, { name: 'A', faction: a }, { name: 'B', faction: b });
  let steps = 0;
  while (!s.winner && steps < 5000) {
    const who: PlayerId | null = (['A', 'B'] as PlayerId[]).find((p) => cpuNeedsDecision(s, p)) ?? null;
    if (!who) throw new Error(`判断が必要なのに誰も動けない（turn ${s.turn}, step ${s.step}, phase ${s.phase}）`);
    const r = cpuStep(s, who);
    if (!r) throw new Error(`CPUが1手も打てない（turn ${s.turn}, step ${s.step}）`);
    s = r.state;
    steps++;
  }
  return s;
}

/** 指定した強さのCPU同士で対戦し、勝者を返す */
function playLevels(seed: number, levelA: CpuLevel, levelB: CpuLevel): PlayerId | null {
  let s = createGame(seed, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
  let steps = 0;
  while (!s.winner && steps < 5000) {
    const who = (['A', 'B'] as PlayerId[]).find((p) => cpuNeedsDecision(s, p));
    if (!who) throw new Error('判断が必要なのに誰も動けない');
    const r = cpuStep(s, who, who === 'A' ? levelA : levelB);
    if (!r) throw new Error('CPUが1手も打てない');
    s = r.state;
    steps++;
  }
  return s.winner;
}

describe('CPUの強さ', () => {
  it('どの強さでも対戦が最後まで決着する', () => {
    for (const lv of ['beginner', 'intermediate', 'advanced'] as CpuLevel[]) {
      for (let seed = 1; seed <= 3; seed++) {
        expect(playLevels(seed, lv, lv)).not.toBeNull();
      }
    }
  });

  it('上級は初級より強い（先後を入れ替えて合計で勝ち越す）', () => {
    let advWins = 0;
    let begWins = 0;
    for (let seed = 100; seed < 112; seed++) {
      const first = playLevels(seed, 'advanced', 'beginner');
      if (first === 'A') advWins++;
      if (first === 'B') begWins++;
      const second = playLevels(seed + 1000, 'beginner', 'advanced');
      if (second === 'B') advWins++;
      if (second === 'A') begWins++;
    }
    expect(advWins).toBeGreaterThan(begWins);
  });
});

describe('CPU対戦', () => {
  it('CPU同士の対戦が最後まで決着する（行き詰まりなし）', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = play(seed, seed % 2 ? 'sea' : 'river', seed % 3 ? 'river' : 'sea');
      expect(s.winner).not.toBeNull();
    }
  });

  it('判断が必要ないときは何もしない', () => {
    const s = createGame(3, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
    const idle: PlayerId = s.active === 'A' ? 'B' : 'A';
    expect(cpuStep(s, idle)).toBeNull();
  });
});
