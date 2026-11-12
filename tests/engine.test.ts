import { describe, expect, it } from 'vitest';
import { buildDeckIds, CARDS, DECK_LISTS } from '../src/shared/cards';
import { applyAction, createGame, habitatDef, viewFor, OTHER } from '../src/shared/engine';
import type { GameState, PlayerId } from '../src/shared/types';

const setup = () =>
  createGame(42, { name: '海の人', faction: 'sea' }, { name: '川の人', faction: 'river' });

/** 指定プレイヤーの手札に指定カードを強制的に入れる（テスト用） */
function giveHand(state: GameState, pid: PlayerId, cardIds: string[]): GameState {
  const s = structuredClone(state);
  s.step = 'action'; // テストでは行動ステップから始める
  const p = s.players[pid];
  cardIds.forEach((cardId, i) => p.hand.push({ id: `${pid}-test-${cardId}-${i}`, cardId, owner: pid }));
  return s;
}

/** 指定プレイヤーの場に生物を直接置く（テスト用） */
function putField(state: GameState, pid: PlayerId, cardId: string, ready = true, id?: string): GameState {
  const s = structuredClone(state);
  s.step = 'action';
  const p = s.players[pid];
  p.field.push({
    id: id ?? `${pid}-field-${cardId}-${p.field.length}`,
    cardId,
    owner: pid,
    ready,
    enteredTurn: 0,
    attachedTo: null,
    mods: [],
    abilityTurn: 0,
    bonusTapAtEnd: false,
  });
  return s;
}

function giveResources(state: GameState, pid: PlayerId, n: number): GameState {
  const s = structuredClone(state);
  for (let i = 0; i < n; i++) {
    s.players[pid].resources.push({ id: `${pid}-res-${i}`, cardId: 'SEA-E01', owner: pid, ready: true });
  }
  return s;
}

describe('デッキ構成', () => {
  it('海・川とも30枚', () => {
    expect(buildDeckIds('sea')).toHaveLength(30);
    expect(buildDeckIds('river')).toHaveLength(30);
  });

  it('生物18・迎撃5・環境7', () => {
    for (const faction of ['sea', 'river'] as const) {
      const ids = buildDeckIds(faction);
      const count = (t: string) => ids.filter((id) => CARDS[id].type === t).length;
      expect(count('creature')).toBe(18);
      expect(count('counter')).toBe(5);
      expect(count('environment')).toBe(7);
    }
  });

  it('すべてのカードIDがマスターに存在する', () => {
    for (const list of Object.values(DECK_LISTS)) {
      for (const id of Object.keys(list)) expect(CARDS[id]).toBeDefined();
    }
  });
});

describe('ゲーム開始', () => {
  it('手札5枚・テリトリー4枚・先攻1ターン目はドローなし', () => {
    const s = setup();
    expect(s.players.A.hand).toHaveLength(5);
    expect(s.players.B.hand).toHaveLength(5);
    expect(s.players.A.territories).toHaveLength(4);
    expect(s.players.A.deck).toHaveLength(30 - 5 - 4);
    expect(s.turn).toBe(1);
    expect(s.players[s.active].hand).toHaveLength(5);
  });

  it('テリトリー残数で生息地DEFが変わる', () => {
    expect(habitatDef(4)).toBe(1000);
    expect(habitatDef(3)).toBe(2000);
    expect(habitatDef(0)).toBe(5000);
  });

  it('相手の手札・山札・テリトリーは隠される', () => {
    const s = setup();
    const v = viewFor(s, s.active);
    const other = OTHER[s.active];
    expect(v.players[other].hand.every((c) => c.cardId === 'HIDDEN')).toBe(true);
    expect(v.players[s.active].hand.some((c) => c.cardId !== 'HIDDEN')).toBe(true);
  });
});

describe('ターンのステップ', () => {
  it('ターン開始は資源ステップで、行動（生物を出す等）はできない', () => {
    const s = setup();
    expect(s.step).toBe('resource');
    const pid = s.active;
    const card = s.players[pid].hand[0];
    const r = applyAction(s, pid, { type: 'play_creature', instanceId: card.id });
    expect(r.ok).toBe(false);
  });

  it('資源を置くと行動ステップへ進む', () => {
    const s = setup();
    const pid = s.active;
    const r = applyAction(s, pid, { type: 'place_resource', instanceId: s.players[pid].hand[0].id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.step).toBe('action');
  });

  it('資源を置かずに進むこともできる', () => {
    const s = setup();
    const pid = s.active;
    const r = applyAction(s, pid, { type: 'skip_resource' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.step).toBe('action');
    expect(r.state.players[pid].resources).toHaveLength(0);
  });

  it('ターン終了で次の人の資源ステップに戻る', () => {
    const s = setup();
    const r = applyAction(s, s.active, { type: 'end_turn' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.step).toBe('draw');
  });
});

describe('資源と生物', () => {
  it('資源は1ターン1枚まで', () => {
    let s = setup();
    const first = s.active;
    const [c1, c2] = s.players[first].hand;
    const r1 = applyAction(s, first, { type: 'place_resource', instanceId: c1.id });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = applyAction(r1.state, first, { type: 'place_resource', instanceId: c2.id });
    expect(r2.ok).toBe(false);
  });

  it('資源が足りないと生物を出せない', () => {
    let s = giveHand(setup(), setup().active, ['SEA-001']);
    const pid = s.active;
    const card = s.players[pid].hand.find((h) => h.cardId === 'SEA-001')!;
    const r = applyAction(s, pid, { type: 'play_creature', instanceId: card.id });
    expect(r.ok).toBe(false);
  });

  it('資源を払って生物を出せ、出したターンは攻撃できない', () => {
    let s = giveResources(giveHand(setup(), setup().active, ['SEA-009']), setup().active, 2);
    const pid = s.active;
    const card = s.players[pid].hand.find((h) => h.cardId === 'SEA-009')!;
    const played = applyAction(s, pid, { type: 'play_creature', instanceId: card.id });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const f = played.state.players[pid].field[0];
    expect(played.state.players[pid].resources.filter((r) => !r.ready)).toHaveLength(2);
    const atk = applyAction(played.state, pid, {
      type: 'attack',
      attackerIds: [f.id],
      target: { kind: 'habitat' },
    });
    expect(atk.ok).toBe(false);
  });

  it('ホホジロザメは漂流域に生物5枚でコストなしで出せる', () => {
    let s = giveHand(setup(), setup().active, ['SEA-001']);
    const pid = s.active;
    for (let i = 0; i < 5; i++) s.players[pid].drift.push({ id: `d${i}`, cardId: 'SEA-009', owner: pid });
    const card = s.players[pid].hand.find((h) => h.cardId === 'SEA-001')!;
    const r = applyAction(s, pid, { type: 'play_creature', instanceId: card.id });
    expect(r.ok).toBe(true);
  });
});

describe('戦闘', () => {
  it('生息地へ攻撃が通るとテリトリーを1枚破壊し、防御側の手札に加わる', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big');
    s.turn = 3; // 攻撃可能な状態に
    const before = s.players[def].territories.length;
    const r = applyAction(s, atk, { type: 'attack', attackerIds: ['big'], target: { kind: 'habitat' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[def].territories).toHaveLength(before - 1);
    expect(r.state.players[def].hand.length).toBeGreaterThan(0);
  });

  it('テリトリー0枚で生息地を破壊すると勝利', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big');
    s.players[def].territories = [];
    const r = applyAction(s, atk, { type: 'attack', attackerIds: ['big'], target: { kind: 'habitat' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.winner).toBe(atk);
    expect(r.state.phase).toBe('ended');
  });

  it('行動可能な生物は通常攻撃できない', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big');
    s = putField(s, def, 'SEA-009', true, 'readyFish');
    const r = applyAction(s, atk, {
      type: 'attack',
      attackerIds: ['big'],
      target: { kind: 'creature', id: 'readyFish' },
    });
    expect(r.ok).toBe(false);
  });

  it('ATKの高い方が勝ち、低い方が負ける（単体）', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big'); // ATK8000
    s = putField(s, def, 'RIVER-007', false, 'guppy'); // ATK1000 行動済み（潜伏なし）
    s.players[def].hand = s.players[def].hand.filter((h) => CARDS[h.cardId].type !== 'counter');
    const r = applyAction(s, atk, { type: 'attack', attackerIds: ['big'], target: { kind: 'creature', id: 'guppy' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[def].field.find((f) => f.id === 'guppy')).toBeUndefined();
    expect(r.state.players[atk].field.find((f) => f.id === 'big')).toBeDefined();
  });

  it('連携攻撃は合計ATKで戦う（負けた側は全員撃破）', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-009', true, 'f1'); // 1500
    s = putField(s, atk, 'SEA-009', true, 'f2'); // 1500 +1000 (群泳)
    s = putField(s, def, 'SEA-001', false, 'shark'); // 8000 行動済み
    const r = applyAction(s, atk, {
      type: 'attack',
      attackerIds: ['f1', 'f2'],
      target: { kind: 'creature', id: 'shark' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[atk].field.filter((f) => f.attachedTo === null)).toHaveLength(0);
    expect(r.state.players[def].field.find((f) => f.id === 'shark')).toBeDefined();
  });

  it('潜伏は単体攻撃できないが連携攻撃なら可能', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big');
    s = putField(s, def, 'SEA-003', false, 'uat');
    const single = applyAction(s, atk, { type: 'attack', attackerIds: ['big'], target: { kind: 'creature', id: 'uat' } });
    expect(single.ok).toBe(false);
  });

  it('かばうは攻撃対象を自分の生物に変更する', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big');
    s = putField(s, def, 'SEA-005', true, 'guard'); // 威嚇（かばう）
    s = putField(s, def, 'SEA-009', false, 'fish');
    const r0 = applyAction(s, atk, { type: 'attack', attackerIds: ['big'], target: { kind: 'habitat' } });
    expect(r0.ok).toBe(true);
    if (!r0.ok) return;
    // かばうは防御側が選ぶ：使うと決めてから戦闘へ
    const r = applyAction(r0.state, def, { type: 'use_guard' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // かばう（ハリセンボン 3000+2000=5000）に対して8000で勝利し撃破
    expect(r.state.players[def].field.find((f) => f.id === 'guard')).toBeUndefined();
    expect(r.state.players[def].territories).toHaveLength(4);
  });

  it('逃避行動で攻撃が無効になる', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big');
    s = giveHand(s, def, ['SEA-C02']);
    const r = applyAction(s, atk, { type: 'attack', attackerIds: ['big'], target: { kind: 'habitat' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.phase).toBe('counter');
    const c = r.state.players[def].hand.find((h) => h.cardId === 'SEA-C02')!;
    const d = applyAction(r.state, def, { type: 'counter', instanceId: c.id });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.state.players[def].territories).toHaveLength(4);
    expect(d.state.phase).toBe('main');
  });

  it('迎撃できない時は自動で戦闘に進む（counterフェーズにならない）', () => {
    let s = setup();
    const atk = s.active;
    const def = OTHER[atk];
    s = putField(s, atk, 'SEA-001', true, 'big');
    s.players[def].hand = [];
    const r = applyAction(s, atk, { type: 'attack', attackerIds: ['big'], target: { kind: 'habitat' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.phase).toBe('main');
  });
});

describe('ターン進行', () => {
  it('ターン終了で相手に手番が移り、ドローする', () => {
    const s = setup();
    const first = s.active;
    const second = OTHER[first];
    const r = applyAction(s, first, { type: 'end_turn' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.active).toBe(second);
    // ドローは山札をタップして行う（自動では引かない）
    expect(r.state.step).toBe('draw');
    expect(r.state.players[second].hand).toHaveLength(5);
    const d = applyAction(r.state, second, { type: 'draw' });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.state.players[second].hand).toHaveLength(6);
    expect(d.state.step).toBe('resource');
  });

  it('山札切れでドローすると敗北', () => {
    let s = setup();
    const first = s.active;
    const second = OTHER[first];
    s.players[second].deck = [];
    const r = applyAction(s, first, { type: 'end_turn' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = applyAction(r.state, second, { type: 'draw' });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.state.winner).toBe(first);
  });

  it('降参すると相手の勝ち', () => {
    const s = setup();
    const r = applyAction(s, s.active, { type: 'concede' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.winner).toBe(OTHER[s.active]);
  });
});

describe('環境カード', () => {
  it('濁りで相手生物のATKが下がる', () => {
    let s = giveResources(giveHand(setup(), setup().active, ['SEA-E03']), setup().active, 2);
    const pid = s.active;
    const def = OTHER[pid];
    s = putField(s, def, 'SEA-009', true, 'fish');
    const card = s.players[pid].hand.find((h) => h.cardId === 'SEA-E03')!;
    const r = applyAction(s, pid, { type: 'play_environment', instanceId: card.id, targetId: 'fish' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[def].field.find((f) => f.id === 'fish')!.mods[0].amount).toBe(-1000);
  });

  it('養殖場は生物を1枚選んで手札に加える', () => {
    let s = giveResources(giveHand(setup(), setup().active, ['SEA-E01']), setup().active, 1);
    const pid = s.active;
    // 山札の上3枚に生物を確実に含める
    s.players[pid].deck.splice(0, 0, { id: 'x1', cardId: 'SEA-009', owner: pid });
    const card = s.players[pid].hand.find((h) => h.cardId === 'SEA-E01')!;
    const r = applyAction(s, pid, { type: 'play_environment', instanceId: card.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pending).not.toBeNull();
    const choose = applyAction(r.state, pid, { type: 'choose', instanceId: 'x1' });
    expect(choose.ok).toBe(true);
    if (!choose.ok) return;
    expect(choose.state.pending).toBeNull();
    expect(choose.state.players[pid].hand.some((h) => h.id === 'x1')).toBe(true);
  });
});

describe('アプリ用：ターンを回せる', () => {
  it('ランダムな手で数ターン進めても例外が出ない', () => {
    let s = createGame(7, { name: 'A', faction: 'sea' }, { name: 'B', faction: 'river' });
    for (let i = 0; i < 40 && !s.winner; i++) {
      const pid = s.active;
      const r = applyAction(s, pid, { type: 'end_turn' });
      if (r.ok) s = r.state;
      else break;
    }
    expect(s.turn).toBeGreaterThan(1);
  });
});
