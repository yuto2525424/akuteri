import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/shared/engine';
import { OTHER } from '../src/shared/engine';

describe('生物の行動状態（縦・横）', () => {
  it('出した生物は縦向きのまま、そのターンだけ攻撃できない', () => {
    let s = createGame(11, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
    const a = s.active;
    s = structuredClone(s);
    s.step = 'action';
    s.players[a].resources.push({ id: 'r1', cardId: 'SEA-E01', owner: a, ready: true });
    s.players[a].resources.push({ id: 'r2', cardId: 'SEA-E01', owner: a, ready: true });
    s.players[a].hand.push({ id: 'h1', cardId: 'SEA-009', owner: a });
    const played = applyAction(s, a, { type: 'play_creature', instanceId: 'h1' });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const f = played.state.players[a].field[0];
    expect(f.ready).toBe(true); // 縦向き
    const atk = applyAction(played.state, a, { type: 'attack', attackerIds: [f.id], target: { kind: 'habitat' } });
    expect(atk.ok).toBe(false); // 出したターンは攻撃できない
  });

  it('攻撃しなかった生物は、ターンが変わっても縦向きのまま', () => {
    let s = createGame(12, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
    const a = s.active;
    const b = OTHER[a];
    s = structuredClone(s);
    s.step = 'action';
    s.players[a].field.push({
      id: 'x1', cardId: 'SEA-009', owner: a, ready: true, enteredTurn: 0, attachedTo: null, mods: [], abilityTurn: 0, bonusTapAtEnd: false,
    });
    const end1 = applyAction(s, a, { type: 'end_turn' });
    expect(end1.ok).toBe(true);
    if (!end1.ok) return;
    const drew = applyAction(end1.state, b, { type: 'draw' });
    expect(drew.ok).toBe(true);
    if (!drew.ok) return;
    const skip = applyAction(drew.state, b, { type: 'skip_resource' });
    expect(skip.ok).toBe(true);
    if (!skip.ok) return;
    const end2 = applyAction(skip.state, b, { type: 'end_turn' });
    expect(end2.ok).toBe(true);
    if (!end2.ok) return;
    expect(end2.state.players[a].field[0].ready).toBe(true);
  });

  it('攻撃した生物は、自分の次のターンの回復まで横向き', () => {
    let s = createGame(13, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
    const a = s.active;
    const b = OTHER[a];
    s = structuredClone(s);
    s.step = 'action';
    s.players[a].field.push({
      id: 'x1', cardId: 'SEA-009', owner: a, ready: true, enteredTurn: 0, attachedTo: null, mods: [], abilityTurn: 0, bonusTapAtEnd: false,
    });
    const atk = applyAction(s, a, { type: 'attack', attackerIds: ['x1'], target: { kind: 'habitat' } });
    expect(atk.ok).toBe(true);
    if (!atk.ok) return;
    expect(atk.state.players[a].field.find((f) => f.id === 'x1')?.ready).toBe(false);
    // 相手のターンの間も横向きのまま
    const bSkip = applyAction(atk.state.phase === 'counter' ? atk.state : atk.state, b, { type: 'pass_counter' });
    const base = bSkip.ok ? bSkip.state : atk.state;
    const endA = applyAction({ ...base, phase: 'main', combat: null }, a, { type: 'end_turn' });
    expect(endA.ok).toBe(true);
    if (!endA.ok) return;
    expect(endA.state.players[a].field.find((f) => f.id === 'x1')?.ready).toBe(false);
  });
});
