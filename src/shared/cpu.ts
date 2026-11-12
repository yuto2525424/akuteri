// CPU（コンピューター対戦相手）の行動決定。
// 1回の呼び出しで、CPUが行える操作を1つだけ適用した新しい状態を返す。
// サーバーはこれを一定間隔で呼び出し、人間の画面に結果を届ける。
import { CARDS } from './cards';
import { applyAction, currentAtk, OTHER } from './engine';
import type { Action, GameState, PlayerId } from './types';

/** CPUが今、判断を求められているか */
export function cpuNeedsDecision(state: GameState, cpu: PlayerId): boolean {
  if (state.winner) return false;
  if (state.pending && state.pending.player === cpu) return true;
  if (state.phase === 'counter' && state.combat && OTHER[state.combat.attacker] === cpu) return true;
  return state.active === cpu && state.phase === 'main';
}

/** 行動ステップの候補（強い順に並べ、通ったものから採用する） */
function actionCandidates(s: GameState, me: PlayerId): Action[] {
  const p = s.players[me];
  const out: Action[] = [];
  const ready = p.resources.filter((r) => r.ready).length;
  const slots = p.field.filter((f) => f.attachedTo === null).length;
  const byCost = [...p.hand].sort((a, b) => CARDS[b.cardId].cost - CARDS[a.cardId].cost);

  for (const c of byCost) {
    const m = CARDS[c.cardId];
    if (m.type === 'creature') {
      if (c.cardId === 'SEA-007') {
        const host = p.field.find((f) => CARDS[f.cardId].size === 'large' && f.attachedTo === null);
        if (host) out.push({ type: 'play_creature', instanceId: c.id, hostId: host.id });
      } else {
        out.push({ type: 'play_creature', instanceId: c.id });
      }
    } else if (m.type === 'environment') {
      if (c.cardId === 'SEA-E03') {
        const t = s.players[OTHER[me]].field.find((f) => f.attachedTo === null);
        if (t) out.push({ type: 'play_environment', instanceId: c.id, targetId: t.id });
      } else if (c.cardId === 'SEA-E02' || c.cardId === 'RIVER-E03') {
        const t = p.drift.find((d) => CARDS[d.cardId].type === 'creature' && (CARDS[d.cardId].baseAtk ?? 0) <= 3000);
        if (t && slots < 4) out.push({ type: 'play_environment', instanceId: c.id, targetId: t.id });
        if (t && ready >= m.cost + 4 && slots < 4) out.push({ type: 'play_environment', instanceId: c.id, extra: true, targetId: t.id });
      } else {
        out.push({ type: 'play_environment', instanceId: c.id });
      }
    }
  }
  for (const f of p.field) {
    if (f.cardId === 'SEA-006' && f.ready && f.abilityTurn !== s.turn) out.push({ type: 'cleaning', instanceId: f.id });
  }

  // 攻撃：生息地を優先し、なければ相手の行動済みの生物を狙う
  const attackers = p.field.filter(
    (f) => f.ready && f.attachedTo === null && (f.enteredTurn !== s.turn || CARDS[f.cardId].keywords.includes('haste')),
  );
  const foe = s.players[OTHER[me]];
  const groupable = attackers.filter((a) => !CARDS[a.cardId].noHabitatAttack);
  if (groupable.length >= 2) out.push({ type: 'attack', attackerIds: groupable.map((a) => a.id), target: { kind: 'habitat' } });
  for (const a of attackers) {
    if (!CARDS[a.cardId].noHabitatAttack) out.push({ type: 'attack', attackerIds: [a.id], target: { kind: 'habitat' } });
    for (const t of foe.field) {
      if (t.attachedTo === null && !t.ready) out.push({ type: 'attack', attackerIds: [a.id], target: { kind: 'creature', id: t.id } });
    }
  }
  return out;
}

/** 迎撃できるなら使い、なければ見送る */
function counterAction(s: GameState, cpu: PlayerId): Action {
  const p = s.players[cpu];
  const own = p.field.filter((f) => f.attachedTo === null);
  for (const c of p.hand) {
    if (CARDS[c.cardId].type !== 'counter') continue;
    if (c.cardId === 'SEA-C01') {
      if (own.length >= 2) return { type: 'counter', instanceId: c.id, targetId: own[0].id };
      continue;
    }
    return { type: 'counter', instanceId: c.id };
  }
  return { type: 'pass_counter' };
}

/** CPUの強さ：初級＝ほぼ無作為、中級＝基本の戦い方、上級＝先読みで評価して最善を選ぶ */
export type CpuLevel = 'beginner' | 'intermediate' | 'advanced';
export const CPU_LEVELS: { value: CpuLevel; label: string }[] = [
  { value: 'beginner', label: '初級' },
  { value: 'intermediate', label: '中級' },
  { value: 'advanced', label: '上級' },
];

/** 盤面の評価（大きいほどCPUに有利）。上級の先読みで使う。 */
function evaluate(s: GameState, me: PlayerId): number {
  if (s.winner === me) return 1e9;
  if (s.winner && s.winner !== me) return -1e9;
  const foe = s.players[OTHER[me]];
  const mine = s.players[me];
  const power = (p: typeof mine) =>
    p.field.filter((f) => f.attachedTo === null).reduce((sum, f) => sum + currentAtk(s, f), 0);
  // 生息地へのダメージ（テリトリーが減るほど有利）
  const habitatScore = (4 - foe.territories.length) * 1000 - (4 - mine.territories.length) * 1000;
  return (power(mine) - power(foe)) + habitatScore * 2 + mine.resources.length * 150 + mine.hand.length * 30;
}

/** CPUの次の1手を決めて適用する。適用できた新しい状態と行った操作を返す。 */
export function cpuStep(
  state: GameState,
  cpu: PlayerId,
  level: CpuLevel = 'intermediate',
): { state: GameState; action: Action } | null {
  if (!cpuNeedsDecision(state, cpu)) return null;
  const p = state.players[cpu];

  const tryAll = (actions: Action[]) => {
    for (const a of actions) {
      const r = applyAction(state, cpu, a);
      if (r.ok) return { state: r.state, action: a };
    }
    return null;
  };

  if (state.pending && state.pending.player === cpu) {
    const pick = state.pending.cards.find((c) => CARDS[c.cardId].type === 'creature');
    return tryAll(pick ? [{ type: 'choose', instanceId: pick.id }] : []);
  }
  if (state.phase === 'counter') {
    // 初級は迎撃をうっかり見送ることがある
    if (level === 'beginner' && Math.random() < 0.4) return tryAll([{ type: 'pass_counter' }]);
    return tryAll([counterAction(state, cpu), { type: 'pass_counter' }]);
  }
  if (state.step === 'draw') {
    return tryAll([{ type: 'draw' }]);
  }
  if (state.step === 'resource') {
    // 初級は資源を置かないことが多い
    if (level === 'beginner' && Math.random() < 0.5) return tryAll([{ type: 'skip_resource' }]);
    const light = [...p.hand].sort((a, b) => CARDS[a.cardId].cost - CARDS[b.cardId].cost);
    const first: Action[] = light.length > 0 && p.resourcePlacedTurn !== state.turn
      ? [{ type: 'place_resource', instanceId: light[0].id }]
      : [];
    return tryAll([...first, { type: 'skip_resource' }]);
  }

  const candidates = actionCandidates(state, cpu);
  if (level === 'beginner') {
    // 初級：ランダムに行動し、ときどき早めにターンを終える
    if (Math.random() < 0.35 || candidates.length === 0) return tryAll([{ type: 'end_turn' }]);
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    return tryAll([...shuffled, { type: 'end_turn' }]);
  }
  if (level === 'advanced') {
    // 上級：各候補を1手先まで適用して評価し、一番良い手を選ぶ
    let best: { state: GameState; action: Action; score: number } | null = null;
    for (const a of [...candidates, { type: 'end_turn' } as Action]) {
      const r = applyAction(state, cpu, a);
      if (!r.ok) continue;
      // 行動の後に攻撃の応答が来る場合も含めて評価（相手の迎撃は無視）
      const score = evaluate(r.state, cpu) + (a.type === 'end_turn' ? 0 : 1);
      if (!best || score > best.score) best = { state: r.state, action: a, score };
    }
    return best ? { state: best.state, action: best.action } : null;
  }
  // 中級：候補を強い順に試し、通ったものを採用。なければターン終了
  return tryAll([...candidates, { type: 'end_turn' }]);
}
