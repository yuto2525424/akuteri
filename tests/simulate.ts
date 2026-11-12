// 2人のボットで対戦を最後まで進め、ルール違反・行き詰まり・カード枚数の不整合を検出する。
// 実行: npx tsx tests/simulate.ts [試合数]
import { CARDS } from '../src/shared/cards';
import { applyAction, createGame, OTHER } from '../src/shared/engine';
import type { Action, Faction, GameState, PlayerId } from '../src/shared/types';

const GAMES = Number(process.argv[2] ?? 200);
const MAX_ACTIONS_PER_TURN = 40;
const MAX_TURNS = 400;

type Stats = {
  games: number;
  winners: Record<string, number>;
  reasons: Record<string, number>;
  turnsTotal: number;
  errors: string[];
  invariantFailures: string[];
  stalls: number;
};

/** 全カードがどこかに存在するか（デッキ30枚が保たれているか） */
function checkInvariant(s: GameState): string | null {
  for (const pid of ['A', 'B'] as PlayerId[]) {
    const p = s.players[pid];
    const pendingCards = s.pending && s.pending.player === pid ? s.pending.cards.length : 0;
    const count =
      p.deck.length + p.hand.length + p.field.length + p.drift.length + p.resources.length + p.territories.length + pendingCards;
    if (count !== 30) return `${pid}の枚数が${count}（30のはず）`;
    if (p.field.filter((f) => f.attachedTo === null).length > 4) return `${pid}の場が4体を超えた`;
    for (const f of p.field) {
      if (f.attachedTo && !p.field.some((h) => h.id === f.attachedTo)) return '装備先のない装備がある';
    }
  }
  return null;
}

/** 1手分の行動をボットが決める。行動がなければ null。 */
function chooseAction(s: GameState, me: PlayerId): Action | null {
  const p = s.players[me];
  if (s.winner) return null;
  if (s.pending && s.pending.player === me) {
    const pick = s.pending.cards.find((c) => CARDS[c.cardId].type === 'creature');
    return pick ? { type: 'choose', instanceId: pick.id } : null;
  }
  if (s.phase === 'counter' && s.combat && OTHER[s.combat.attacker] === me) {
    // 迎撃できるなら使う（50%）
    const counters = p.hand.filter((h) => CARDS[h.cardId].type === 'counter');
    for (const c of counters) {
      if (c.cardId === 'SEA-C01') {
        const own = p.field.find((f) => f.attachedTo === null);
        if (own && p.field.filter((f) => f.attachedTo === null).length >= 2 && Math.random() < 0.5) {
          return { type: 'counter', instanceId: c.id, targetId: own.id };
        }
        continue;
      }
      if (Math.random() < 0.5) return { type: 'counter', instanceId: c.id };
    }
    return { type: 'pass_counter' };
  }
  if (s.active !== me || s.phase !== 'main') return null;
  if (s.step === 'draw') return { type: 'draw' };

  if (s.step === 'resource') {
    if (p.resourcePlacedTurn !== s.turn && p.hand.length > 0) {
      // 資源は、コストの重いカードを残し、手札の中で一番軽いものを置く
      const light = [...p.hand].sort((a, b) => CARDS[a.cardId].cost - CARDS[b.cardId].cost)[0];
      return { type: 'place_resource', instanceId: light.id };
    }
    return { type: 'skip_resource' };
  }
  return null; // 行動ステップは呼び出し側で処理
}

/** 行動ステップの候補を順に試す */
function actionCandidates(s: GameState, me: PlayerId): Action[] {
  const p = s.players[me];
  const out: Action[] = [];
  const ready = p.resources.filter((r) => r.ready).length;
  const slots = p.field.filter((f) => f.attachedTo === null).length;
  const cheapFirst = [...p.hand].sort((a, b) => CARDS[b.cardId].cost - CARDS[a.cardId].cost);

  for (const c of cheapFirst) {
    const m = CARDS[c.cardId];
    if (m.type === 'creature') {
      if (c.cardId === 'SEA-007') {
        const host = p.field.find((f) => CARDS[f.cardId].size === 'large' && f.attachedTo === null);
        if (host) out.push({ type: 'play_creature', instanceId: c.id, hostId: host.id });
      } else if (slots < 4 && m.cost <= ready) {
        out.push({ type: 'play_creature', instanceId: c.id });
      } else if (c.cardId === 'SEA-001' && p.drift.filter((d) => CARDS[d.cardId].type === 'creature').length >= 5 && slots < 4) {
        out.push({ type: 'play_creature', instanceId: c.id });
      }
    } else if (m.type === 'environment') {
      if (c.cardId === 'SEA-E03') {
        const t = s.players[OTHER[me]].field.find((f) => f.attachedTo === null);
        if (t && m.cost <= ready) out.push({ type: 'play_environment', instanceId: c.id, targetId: t.id });
      } else if (c.cardId === 'SEA-E02' || c.cardId === 'RIVER-E03') {
        const t = p.drift.find((d) => CARDS[d.cardId].type === 'creature' && (CARDS[d.cardId].baseAtk ?? 0) <= 3000);
        if (t && m.cost <= ready && slots < 4) out.push({ type: 'play_environment', instanceId: c.id, targetId: t.id });
      } else if (m.cost <= ready) {
        out.push({ type: 'play_environment', instanceId: c.id });
      }
    }
  }
  // 口内保育・クリーニング
  for (const f of p.field) {
    if (f.cardId === 'SEA-006' && f.ready && f.abilityTurn !== s.turn) out.push({ type: 'cleaning', instanceId: f.id });
  }
  // 攻撃：行動可能な生物で生息地を攻撃（生息地を攻撃できない生物は、敵の行動済み生物を攻撃）
  const attackers = p.field.filter(
    (f) => f.ready && f.attachedTo === null && (f.enteredTurn !== s.turn || CARDS[f.cardId].keywords.includes('haste')),
  );
  const foe = s.players[OTHER[me]];
  for (const a of attackers) {
    if (!CARDS[a.cardId].noHabitatAttack) out.push({ type: 'attack', attackerIds: [a.id], target: { kind: 'habitat' } });
    for (const t of foe.field) {
      if (t.attachedTo === null && !t.ready && !(CARDS[t.cardId].keywords.includes('hide') && false)) {
        out.push({ type: 'attack', attackerIds: [a.id], target: { kind: 'creature', id: t.id } });
      }
    }
  }
  // 連携攻撃（残りの行動可能な生物をまとめて生息地へ）
  if (attackers.length >= 2) {
    const group = attackers.filter((a) => !CARDS[a.cardId].noHabitatAttack).map((a) => a.id);
    if (group.length >= 2) out.push({ type: 'attack', attackerIds: group, target: { kind: 'habitat' } });
  }
  return out;
}

function playOneGame(seed: number, a: Faction, b: Faction, stats: Stats) {
  let s = createGame(seed, { name: 'A', faction: a }, { name: 'B', faction: b });
  let actions = 0;
  let lastTurn = s.turn;
  let perTurn = 0;
  while (!s.winner && s.turn < MAX_TURNS) {
    const me = s.phase === 'counter' && s.combat ? OTHER[s.combat.attacker] : s.active;
    let action: Action | null = chooseAction(s, me);
    if (!action) {
      if (s.active !== me) {
        break; // 想定外
      }
      // 行動ステップ：候補を順に試し、通ったものを採用。なければターン終了。
      const cands = actionCandidates(s, me);
      let applied = false;
      for (const c of cands) {
        const r = applyAction(s, me, c);
        if (r.ok) {
          s = r.state;
          applied = true;
          break;
        }
      }
      action = applied ? null : { type: 'end_turn' };
      if (!applied) {
        const r = applyAction(s, me, { type: 'end_turn' });
        if (!r.ok) {
          stats.errors.push(`end_turn失敗: ${r.error}`);
          break;
        }
        s = r.state;
      }
      actions++;
      perTurn++;
      if (perTurn > MAX_ACTIONS_PER_TURN) {
        stats.stalls++;
        break;
      }
      continue;
    }
    const r = applyAction(s, me, action);
    if (!r.ok) {
      stats.errors.push(`${JSON.stringify(action)}: ${r.error}`);
      // 資源ステップの失敗は次の手で打開
      const skip = applyAction(s, me, s.step === 'resource' ? { type: 'skip_resource' } : { type: 'end_turn' });
      if (!skip.ok) break;
      s = skip.state;
    } else {
      s = r.state;
    }
    actions++;
    if (s.turn !== lastTurn) {
      lastTurn = s.turn;
      perTurn = 0;
    }
    const bad = checkInvariant(s);
    if (bad) {
      stats.invariantFailures.push(`seed ${seed} turn ${s.turn}: ${bad}`);
      break;
    }
  }
  stats.games++;
  stats.turnsTotal += s.turn;
  for (const l of s.log) {
    for (const k of COVERAGE_KEYS) {
      if (l.text.includes(k)) coverage[k] = (coverage[k] ?? 0) + 1;
    }
  }
  if (s.winner) {
    const w = s.players[s.winner].faction;
    stats.winners[w] = (stats.winners[w] ?? 0) + 1;
    const reason = s.winReason?.replace(/^.*：/, '') ?? '';
    stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
  } else {
    stats.reasons['終了せず'] = (stats.reasons['終了せず'] ?? 0) + 1;
  }
  return s;
}

const COVERAGE_KEYS = [
  '迎撃カードは', '混乱効果：', '走流性：', '急流', '逃避行動', '攻撃は無効', 'かばう', '毒棘', '反撃放電',
  '追撃', '生命継承', '滑空', 'テリトリーを1枚破壊', '装備', '栄養循環', 'クリーニング', '口内保育', '群泳',
  '濁り：', '増水', '回遊路', '遡上', '嗅覚', '生物相', '養殖場', '戦闘：', '資源に置きませんでした',
  '先攻1ターン目', '山札切れ',
];
const coverage: Record<string, number> = {};
const stats: Stats = { games: 0, winners: {}, reasons: {}, turnsTotal: 0, errors: [], invariantFailures: [], stalls: 0 };
const combos: [Faction, Faction][] = [['sea', 'river'], ['river', 'sea'], ['sea', 'sea'], ['river', 'river']];
let sample: GameState | null = null;
for (let i = 0; i < GAMES; i++) {
  const [a, b] = combos[i % combos.length];
  const s = playOneGame(1000 + i, a, b, stats);
  if (i === 0) sample = s;
}

console.log(`試合数: ${stats.games}`);
console.log(`勝者（デッキ別）: ${JSON.stringify(stats.winners)}`);
console.log(`決着の理由: ${JSON.stringify(stats.reasons)}`);
console.log(`平均ターン数: ${(stats.turnsTotal / stats.games).toFixed(1)}`);
console.log(`行き詰まり（1ターン上限超え）: ${stats.stalls}`);
console.log(`ルール違反として拒否された操作: ${stats.errors.length}`);
const errKinds = new Map<string, number>();
for (const e of stats.errors) {
  const k = e.replace(/^\{.*?\}: /, '');
  errKinds.set(k, (errKinds.get(k) ?? 0) + 1);
}
for (const [k, n] of [...errKinds].sort((x, y) => y[1] - x[1]).slice(0, 12)) console.log(`  ${n}回: ${k}`);
console.log(`カード枚数の不整合: ${stats.invariantFailures.length}`);
console.log('能力・効果が発動した回数（ログ件数）:');
for (const k of COVERAGE_KEYS) console.log(`  ${k}: ${coverage[k] ?? 0}`);
for (const f of stats.invariantFailures.slice(0, 5)) console.log(`  ${f}`);
if (sample) {
  console.log('\n--- 試合1の最後のログ（抜粋） ---');
  for (const l of sample.log.slice(-14)) console.log(`T${l.turn} ${l.text}`);
}
