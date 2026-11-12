import { describe, expect, it } from 'vitest';
import { createGame } from '../src/shared/engine';
import { cpuNeedsDecision, cpuStep } from '../src/shared/cpu';

describe('CPUは、カードの効果どおりに選ぶ', () => {
  it('山札から生物を選ぶとき、一番ATKの高い生物を選ぶ（ドジョウ2000 > トビウオ1500）', () => {
    let s = createGame(5, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
    s = structuredClone(s);
    s.pending = {
      kind: 'search',
      player: 'B',
      source: 'RIVER-E01',
      cards: [
        { id: 'c1', cardId: 'SEA-008', owner: 'B' },
        { id: 'c2', cardId: 'RIVER-006', owner: 'B' },
      ],
    };
    expect(cpuNeedsDecision(s, 'B')).toBe(true);
    const r = cpuStep(s, 'B', 'intermediate');
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.action).toEqual({ type: 'choose', instanceId: 'c2' });
  });
});
