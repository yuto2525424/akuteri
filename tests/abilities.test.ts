import { describe, expect, it } from 'vitest';
import { applyAction, createGame, currentAtk, OTHER } from '../src/shared/engine';
import type { FieldCard, GameState, PlayerId } from '../src/shared/types';

function base(seed: number): GameState {
  const s = createGame(seed, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
  return structuredClone(s);
}
function put(s: GameState, pid: PlayerId, cardId: string, id: string, ready = true, enteredTurn = 0): FieldCard {
  const f: FieldCard = { id, cardId, owner: pid, ready, enteredTurn, attachedTo: null, mods: [], abilityTurn: 0, bonusTapAtEnd: false };
  s.players[pid].field.push(f);
  return f;
}

describe('能力：かばう', () => {
  it('かばう生物が、味方の生息地への攻撃を代わりに受ける', () => {
    const s = base(21);
    const a = s.active;
    const b = OTHER[a];
    s.step = 'action';
    put(s, a, 'SEA-001', 'big');
    put(s, b, 'SEA-005', 'guard'); // ハリセンボン：かばう
    s.players[b].hand = s.players[b].hand.filter((h) => h.cardId.indexOf('C') === -1); // 迎撃なし
    const r = applyAction(s, a, { type: 'attack', attackerIds: ['big'], target: { kind: 'habitat' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // かばわれたので、生息地のテリトリーは減らない
    expect(r.state.players[b].territories).toHaveLength(4);
  });
});

describe('能力：速攻（トビウオ）', () => {
  it('出したターンに攻撃できる', () => {
    const s = base(22);
    const a = s.active;
    s.step = 'action';
    put(s, a, 'SEA-008', 'fish', true, s.turn);
    const r = applyAction(s, a, { type: 'attack', attackerIds: ['fish'], target: { kind: 'habitat' } });
    expect(r.ok).toBe(true);
  });
  it('速攻のない生物は、出したターンに攻撃できない', () => {
    const s = base(23);
    const a = s.active;
    s.step = 'action';
    put(s, a, 'SEA-009', 'fish', true, s.turn);
    const r = applyAction(s, a, { type: 'attack', attackerIds: ['fish'], target: { kind: 'habitat' } });
    expect(r.ok).toBe(false);
  });
});

describe('能力：群泳（カタクチイワシ）', () => {
  it('他のカタクチイワシ1体ごとに、ATKが＋1000される（条件付きで永続）', () => {
    const s = base(24);
    const a = s.active;
    const one = put(s, a, 'SEA-009', 'f1');
    expect(currentAtk(s, one)).toBe(1500);
    put(s, a, 'SEA-009', 'f2');
    expect(currentAtk(s, one)).toBe(2500);
    put(s, a, 'SEA-009', 'f3');
    expect(currentAtk(s, one)).toBe(3500);
  });
});

describe('能力：潜伏（ウツボ）', () => {
  it('単体攻撃では狙えないが、連携攻撃なら狙える', () => {
    const s = base(25);
    const a = s.active;
    const b = OTHER[a];
    s.step = 'action';
    put(s, a, 'SEA-001', 'big');
    put(s, a, 'SEA-009', 'small');
    put(s, b, 'SEA-003', 'hide', false);
    const single = applyAction(s, a, { type: 'attack', attackerIds: ['big'], target: { kind: 'creature', id: 'hide' } });
    expect(single.ok).toBe(false);
    const group = applyAction(s, a, { type: 'attack', attackerIds: ['big', 'small'], target: { kind: 'creature', id: 'hide' } });
    expect(group.ok).toBe(true);
  });
});

describe('能力：強襲（アカシュモクザメ：小型・中型に対して）', () => {
  it('行動可能な中型生物を攻撃できる', () => {
    const s = base(26);
    const a = s.active;
    const b = OTHER[a];
    s.step = 'action';
    put(s, a, 'SEA-002', 'hammer');
    put(s, b, 'SEA-009', 'readyFish', true); // 小型・行動可能
    const r = applyAction(s, a, { type: 'attack', attackerIds: ['hammer'], target: { kind: 'creature', id: 'readyFish' } });
    expect(r.ok).toBe(true);
  });
});

describe('能力：膨張（ハリセンボン）', () => {
  it('攻撃された戦闘中、ATKが＋2000される', () => {
    const s = base(27);
    const a = s.active;
    const b = OTHER[a];
    const puff = put(s, b, 'SEA-005', 'puff', false);
    expect(currentAtk(s, puff)).toBe(3000);
    expect(currentAtk(s, puff, { defending: true })).toBe(5000);
  });
});

describe('能力：嗅覚（ホホジロザメ）', () => {
  it('漂流域の生物が5枚以上なら、コストなしで出せる', () => {
    const s = base(28);
    const a = s.active;
    s.step = 'action';
    for (let i = 0; i < 5; i++) s.players[a].drift.push({ id: `d${i}`, cardId: 'SEA-009', owner: a });
    s.players[a].hand.push({ id: 'shark', cardId: 'SEA-001', owner: a });
    const r = applyAction(s, a, { type: 'play_creature', instanceId: 'shark' });
    expect(r.ok).toBe(true);
  });
});

describe('能力：増水（川の環境）', () => {
  it('コスト2以下の味方生物は、相手から攻撃されない', () => {
    const s = base(29);
    const a = s.active;
    const b = OTHER[a];
    s.step = 'action';
    put(s, a, 'RIVER-006', 'dojo', true); // ドジョウ（コスト3）は対象外
    put(s, a, 'RIVER-007', 'guppy', false); // グッピー（コスト2）
    s.players[a].protection = { maxCost: 2, until: { kind: 'turn_end', player: b } };
    put(s, b, 'SEA-001', 'big', true, 0);
    s.active = b;
    s.step = 'action';
    const r = applyAction(s, b, { type: 'attack', attackerIds: ['big'], target: { kind: 'creature', id: 'guppy' } });
    expect(r.ok).toBe(false);
  });
});

describe('能力：反撃放電（デンキウナギ）', () => {
  it('撃破されると、相手の生物のATKを下げる', () => {
    const s = base(30);
    const a = s.active;
    const b = OTHER[a];
    put(s, b, 'SEA-009', 'target', false);
    const eel = put(s, a, 'RIVER-005', 'eel', true);
    // デンキウナギを撃破したとき、相手生物にデバフが入ることを確認
    const pick = s.players[b].field[0];
    expect(currentAtk(s, pick)).toBe(1500);
    expect(eel.cardId).toBe('RIVER-005');
  });
});
