import { CARDS, HABITATS, HIDDEN_CARD_ID, buildDeckIds } from './cards';
import type {
  Step, Action, AttackTarget, CardInstance, CardMaster, Faction, FieldCard, GameState, Mod,
  Player, PlayerId, ResourceCard, Until,
} from './types';

export const MAX_FIELD = 4;
const HAND_START = 5;
const TERRITORY_COUNT = 4;
const RESOURCE_EXTRA_FOR_BIG_PLAY = 4;
const OTHER: Record<PlayerId, PlayerId> = { A: 'B', B: 'A' };

export class GameError extends Error {}

function fail(msg: string): never {
  throw new GameError(msg);
}

// ---------- 乱数（テスト用に再現可能） ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 小さなヘルパー ----------
const meta = (cardId: string): CardMaster => {
  const m = CARDS[cardId];
  if (!m) fail(`不明なカード: ${cardId}`);
  return m;
};

const isCreature = (cardId: string) => meta(cardId).type === 'creature';

function slotsUsed(p: Player): number {
  return p.field.filter((f) => f.attachedTo === null).length;
}

function readyResources(p: Player): ResourceCard[] {
  return p.resources.filter((r) => r.ready);
}

function canPay(p: Player, cost: number): boolean {
  return readyResources(p).length >= cost;
}

function pay(p: Player, cost: number) {
  const ready = readyResources(p);
  for (let i = 0; i < cost; i++) ready[i].ready = false;
}

function log(state: GameState, text: string) {
  state.log.push({ turn: state.turn, text });
}

function findHand(p: Player, instanceId: string): CardInstance {
  const c = p.hand.find((h) => h.id === instanceId);
  if (!c) fail('手札にそのカードがありません');
  return c;
}

function findField(p: Player, id: string): FieldCard | undefined {
  return p.field.find((f) => f.id === id);
}

function countDriftCreatures(p: Player): number {
  return p.drift.filter((d) => isCreature(d.cardId)).length;
}

/** 生息地のDEF（テリトリー残数で変化） */
export function habitatDef(territories: number): number {
  return 1000 * (TERRITORY_COUNT + 1 - territories);
}

interface AtkCtx {
  attacking?: boolean;
  defending?: boolean;
  group?: boolean;
  /** アリゲーターガーの単体戦闘時のデバフ */
  debuff?: number;
}

/** 現在のATK（装備・能力・効果を含む） */
export function currentAtk(state: GameState, f: FieldCard, ctx: AtkCtx = {}): number {
  const m = meta(f.cardId);
  const owner = state.players[f.owner];
  let v = m.baseAtk ?? 0;
  for (const mod of f.mods) v += mod.amount;
  // 吸着：装備中のコバンザメ1枚につき +1000
  v += owner.field.filter((x) => x.attachedTo === f.id).length * 1000;
  // 群泳：他のカタクチイワシ1体につき +1000
  if (f.cardId === 'SEA-009') {
    v += 1000 * owner.field.filter((x) => x.cardId === 'SEA-009' && x.id !== f.id).length;
  }
  // 群攻：連携攻撃に参加中 +1000
  if (f.cardId === 'RIVER-008' && ctx.attacking && ctx.group) v += 1000;
  // 膨張：攻撃された戦闘中 +2000
  if (f.cardId === 'SEA-005' && ctx.defending) v += 2000;
  if (ctx.debuff) v -= ctx.debuff;
  return v;
}

function isStrongFor(attacker: FieldCard, target: FieldCard): boolean {
  const m = meta(attacker.cardId);
  if (m.keywords.includes('strong')) return true;
  const size = meta(target.cardId).size;
  return !!(size && m.conditionalStrong?.includes(size));
}

// ---------- 状態の期限切れ処理 ----------
function matchesUntil(u: Until, ev: Until): boolean {
  return u.kind === ev.kind && u.player === ev.player;
}

function expire(state: GameState, ev: Until) {
  for (const p of Object.values(state.players)) {
    for (const f of p.field) {
      f.mods = f.mods.filter((m: Mod) => !matchesUntil(m.until, ev));
    }
    if (p.protection && matchesUntil(p.protection.until, ev)) p.protection = null;
  }
}

// ---------- ゲーム生成 ----------
export interface PlayerSetup {
  name: string;
  faction: Faction;
  /** 自分で組んだデッキ（30枚）。無ければ基本のデッキ */
  deck?: string[];
}

function makePlayer(id: PlayerId, setup: PlayerSetup, rng: () => number): Player {
  const list = setup.deck && setup.deck.length === 30 ? setup.deck : buildDeckIds(setup.faction);
  const deck: CardInstance[] = shuffle(list, rng).map((cardId, i) => ({
    id: `${id}-${i}`,
    cardId,
    owner: id,
  }));
  const hand = deck.splice(0, HAND_START);
  const territories = deck.splice(0, TERRITORY_COUNT);
  return {
    id,
    name: setup.name,
    faction: setup.faction,
    deck,
    hand,
    resources: [],
    field: [],
    drift: [],
    territories,
    habitatCardId: HABITATS[setup.faction].name,
    protection: null,
    resourcePlacedTurn: 0,
  };
}

export function createGame(seed: number, a: PlayerSetup, b: PlayerSetup): GameState {
  const rng = mulberry32(seed);
  const players = { A: makePlayer('A', a, rng), B: makePlayer('B', b, rng) };
  const first: PlayerId = rng() < 0.5 ? 'A' : 'B';
  const state: GameState = {
    id: `g${seed}`,
    turn: 0,
    active: first,
    firstPlayer: first,
    phase: 'main',
    step: 'resource',
    players,
    combat: null,
    pending: null,
    log: [],
    winner: null,
    winReason: null,
  };
  log(state, `ゲーム開始。先攻は${players[first].name}`);
  startTurn(state, first);
  return state;
}

// ---------- ターン処理 ----------
function drawCard(state: GameState, pid: PlayerId) {
  const p = state.players[pid];
  if (p.deck.length === 0) {
    loseGame(state, pid, '山札切れ');
    return;
  }
  p.hand.push(p.deck.shift()!);
}

function startTurn(state: GameState, pid: PlayerId) {
  state.turn += 1;
  state.active = pid;
  state.step = 'resource';
  expire(state, { kind: 'turn_start', player: pid });
  const p = state.players[pid];
  // 1. 回復
  p.field.forEach((f) => (f.ready = true));
  p.resources.forEach((r) => (r.ready = true));
  log(state, `── ${p.name}のターン ${state.turn} ──`);
  log(state, '1. 回復：行動済みのカードが元に戻りました');
  // 2. ドロー：プレイヤーが山札をタップして引く（先攻1ターン目はドローなし）
  if (state.turn === 1) {
    log(state, '2. ドロー：先攻1ターン目はドローしません');
  } else {
    state.step = 'draw';
    log(state, '2. ドロー：山札をタップしてカードを引いてください');
  }
  // 3. 資源ステップへ（ここで止まり、プレイヤーの操作を待つ）
}

function drawStep(state: GameState, pid: PlayerId) {
  requireStep(state, 'draw');
  drawCard(state, pid);
  if (state.winner) return;
  log(state, `${state.players[pid].name}は山札から1枚引きました`);
  state.step = 'resource';
}

function requireStep(state: GameState, step: Step) {
  if (state.step !== step) {
    if (step === 'draw') fail('ドローのステップではありません');
    fail(step === 'resource' ? '資源を置くステップではありません' : '行動ステップではありません（先に資源ステップを終えてください）');
  }
}

function endTurn(state: GameState) {
  const pid = state.active;
  const p = state.players[pid];
  for (const f of p.field) {
    if (f.bonusTapAtEnd) {
      f.ready = false;
      f.bonusTapAtEnd = false;
    }
  }
  expire(state, { kind: 'turn_end', player: pid });
  checkStateBased(state);
  if (state.winner) return;
  log(state, `${p.name}がターンを終了`);
  startTurn(state, OTHER[pid]);
}

// ---------- 勝敗 ----------
function loseGame(state: GameState, loser: PlayerId, reason: string) {
  if (state.winner) return;
  state.winner = OTHER[loser];
  state.winReason = `${state.players[loser].name}の敗北：${reason}`;
  state.phase = 'ended';
  state.combat = null;
  state.pending = null;
  log(state, state.winReason);
}

// ---------- 破壊・移動 ----------
/** 場の生物を取り除く。装備はすべて漂流域へ。 */
function removeFromField(state: GameState, owner: PlayerId, id: string): FieldCard | null {
  const p = state.players[owner];
  const f = findField(p, id);
  if (!f) return null;
  p.field = p.field.filter((x) => x.id !== id && x.attachedTo !== id);
  // 装備されていたコバンザメは漂流域へ
  return f;
}

function moveAttachmentsToDrift(state: GameState, owner: PlayerId, hostId: string) {
  const p = state.players[owner];
  const attached = p.field.filter((x) => x.attachedTo === hostId);
  for (const a of attached) {
    p.drift.push({ id: a.id, cardId: a.cardId, owner: a.owner });
  }
  p.field = p.field.filter((x) => x.attachedTo !== hostId);
}

function destroyCreature(state: GameState, owner: PlayerId, id: string) {
  const p = state.players[owner];
  const f = findField(p, id);
  if (!f || f.attachedTo !== null) return;
  moveAttachmentsToDrift(state, owner, id);
  p.field = p.field.filter((x) => x.id !== id);
  p.drift.push({ id: f.id, cardId: f.cardId, owner: f.owner });
  log(state, `${meta(f.cardId).name}が撃破されました`);

  // 生命継承（ゼブラフィッシュ）
  if (f.cardId === 'RIVER-009') {
    log(state, '生命継承：カードを1枚引きました');
    drawCard(state, owner);
  }
  // 反撃放電（デンキウナギ）：相手生物1体（最もATKの高いもの）をそのターン終了時までATK－2000
  if (f.cardId === 'RIVER-005') {
    const enemy = state.players[OTHER[owner]];
    const target = [...enemy.field]
      .filter((x) => x.attachedTo === null)
      .sort((x, y) => currentAtk(state, y) - currentAtk(state, x))[0];
    if (target) {
      target.mods.push({ amount: -2000, until: { kind: 'turn_end', player: state.active } });
      log(state, `反撃放電：${meta(target.cardId).name}のATK－2000`);
    }
  }
}

/** 状態ベースの処理：ATK0以下の生物を撃破 */
function checkStateBased(state: GameState) {
  let changed = true;
  while (changed && !state.winner) {
    changed = false;
    for (const pid of ['A', 'B'] as PlayerId[]) {
      const p = state.players[pid];
      for (const f of [...p.field]) {
        if (f.attachedTo !== null) continue;
        if (!p.field.some((x) => x.id === f.id)) continue;
        if (currentAtk(state, f) <= 0) {
          destroyCreature(state, pid, f.id);
          changed = true;
        }
      }
    }
  }
}

function returnToHand(state: GameState, owner: PlayerId, id: string) {
  const p = state.players[owner];
  const f = findField(p, id);
  if (!f || f.attachedTo !== null) return;
  moveAttachmentsToDrift(state, owner, id);
  p.field = p.field.filter((x) => x.id !== id);
  p.hand.push({ id: f.id, cardId: f.cardId, owner: f.owner });
  log(state, `${meta(f.cardId).name}を手札に戻しました`);
}

// ---------- 行動 ----------
function playCreature(state: GameState, pid: PlayerId, instanceId: string, hostId?: string) {
  requireStep(state, 'action');
  const p = state.players[pid];
  const card = findHand(p, instanceId);
  if (!isCreature(card.cardId)) fail('生物カードではありません');
  const m = meta(card.cardId);

  let cost = m.cost;
  // 嗅覚：自分の漂流域に生物カードが5枚以上ならコストなしで場に出せる
  if (card.cardId === 'SEA-001' && countDriftCreatures(p) >= 5) cost = 0;

  let host: FieldCard | undefined;
  if (card.cardId === 'SEA-007') {
    // コバンザメは大型生物に装備する（場の枠を使わない）
    host = hostId ? findField(p, hostId) : undefined;
    if (!host || host.attachedTo !== null || meta(host.cardId).size !== 'large') {
      fail('装備先（自分の大型生物）を選んでください');
    }
  } else if (slotsUsed(p) >= MAX_FIELD) {
    fail('場がいっぱいです（最大4体）');
  }

  if (!canPay(p, cost)) fail('資源が足りません');
  pay(p, cost);
  p.hand = p.hand.filter((h) => h.id !== instanceId);
  p.field.push({
    id: card.id,
    cardId: card.cardId,
    owner: pid,
    // 出した生物は縦向き（行動可能）のまま。攻撃できないのは「出したターン」だけ（declareAttackで判定）
    ready: true,
    enteredTurn: state.turn,
    attachedTo: host ? host.id : null,
    mods: [],
    abilityTurn: 0,
    bonusTapAtEnd: false,
  });
  log(state, `${p.name}は${m.name}を場に出しました${cost === 0 && m.cost > 0 ? '（コストなし）' : ''}`);
  if (card.cardId === 'SEA-001' && cost === 0) log(state, '嗅覚：漂流域の生物が5枚以上あるので、コストなしで場に出しました');

  // 栄養循環（グッピー）：山札の一番下を行動済みで資源へ
  if (card.cardId === 'RIVER-007' && p.deck.length > 0) {
    const bottom = p.deck.pop()!;
    p.resources.push({ ...bottom, ready: false });
    log(state, '栄養循環：山札の一番下を資源に置きました');
  }
}

function placeResource(state: GameState, pid: PlayerId, instanceId: string) {
  requireStep(state, 'resource');
  const p = state.players[pid];
  if (p.resourcePlacedTurn === state.turn) fail('このターンはすでに資源を置きました（1ターン1枚）');
  const card = findHand(p, instanceId);
  p.hand = p.hand.filter((h) => h.id !== instanceId);
  p.resources.push({ id: card.id, cardId: card.cardId, owner: pid, ready: true });
  p.resourcePlacedTurn = state.turn;
  log(state, `3. 資源：${p.name}は手札から資源を1枚置きました`);
  state.step = 'action';
  log(state, '4. 行動ステップへ');
}

function skipResource(state: GameState, pid: PlayerId) {
  requireStep(state, 'resource');
  log(state, `3. 資源：${state.players[pid].name}は資源を置きませんでした`);
  state.step = 'action';
  log(state, '4. 行動ステップへ');
}

function playEnvironment(state: GameState, pid: PlayerId, instanceId: string, extra: boolean, targetId?: string) {
  requireStep(state, 'action');
  const p = state.players[pid];
  const card = findHand(p, instanceId);
  const m = meta(card.cardId);
  if (m.type !== 'environment') fail('環境カードではありません');

  const isRevive = card.cardId === 'SEA-E02' || card.cardId === 'RIVER-E03';
  if (extra && !isRevive) fail('この環境カードに追加支払いはありません');
  const total = m.cost + (extra ? RESOURCE_EXTRA_FOR_BIG_PLAY : 0);
  if (!canPay(p, total)) fail('資源が足りません');

  // 対象の検証（効果処理の前に行う）
  let reviveTarget: CardInstance | undefined;
  if (card.cardId === 'SEA-E03') {
    const enemy = state.players[OTHER[pid]];
    const t = targetId ? findField(enemy, targetId) : undefined;
    if (!t || t.attachedTo !== null) fail('相手の生物を選んでください');
  }
  if (isRevive) {
    if (slotsUsed(p) >= MAX_FIELD) fail('場がいっぱいです（最大4体）');
    reviveTarget = targetId ? p.drift.find((d) => d.id === targetId) : undefined;
    if (!reviveTarget || !isCreature(reviveTarget.cardId)) fail('漂流域の生物を選んでください');
    if (!extra && (meta(reviveTarget.cardId).baseAtk ?? 0) > 3000) {
      fail('ATK3000以下の生物を選んでください（追加支払いでATK無制限）');
    }
  }

  pay(p, total);
  p.hand = p.hand.filter((h) => h.id !== instanceId);
  log(state, `${p.name}は${m.name}を使用しました`);

  switch (card.cardId) {
    case 'SEA-E01':
    case 'RIVER-E01': {
      const top = p.deck.splice(0, Math.min(3, p.deck.length));
      if (top.length === 0) {
        log(state, '山札がありません');
        break;
      }
      if (!top.some((c) => isCreature(c.cardId))) {
        p.deck.push(...top);
        log(state, '山札の上3枚に生物はありませんでした');
        break;
      }
      state.pending = { kind: 'search', player: pid, cards: top, source: card.cardId };
      log(state, '山札の上3枚から生物を1枚選んでください');
      break;
    }
    case 'SEA-E02':
    case 'RIVER-E03': {
      p.drift = p.drift.filter((d) => d.id !== reviveTarget!.id);
      p.field.push({
        id: reviveTarget!.id,
        cardId: reviveTarget!.cardId,
        owner: pid,
        ready: true,
        enteredTurn: state.turn,
        attachedTo: null,
        mods: [],
        abilityTurn: 0,
        bonusTapAtEnd: false,
      });
      log(state, `${meta(reviveTarget!.cardId).name}を場に出しました`);
      break;
    }
    case 'SEA-E03': {
      const t = findField(state.players[OTHER[pid]], targetId!)!;
      t.mods.push({ amount: -1000, until: { kind: 'turn_end', player: OTHER[pid] } });
      log(state, `濁り：${meta(t.cardId).name}のATK－1000`);
      break;
    }
    case 'RIVER-E02': {
      // 増水：次の相手ターン終了時まで、自分のコスト2以下の生物は攻撃対象にならない
      p.protection = { maxCost: 2, until: { kind: 'turn_end', player: OTHER[pid] } };
      log(state, '増水：コスト2以下の生物は攻撃対象になりません');
      break;
    }
    default:
      break;
  }

  // 使用した環境カードは漂流域へ（回遊路・遡上は場に出す対象の処理後）
  p.drift.push({ id: card.id, cardId: card.cardId, owner: pid });
}

function chooseSearch(state: GameState, pid: PlayerId, instanceId: string) {
  const pend = state.pending;
  if (!pend || pend.player !== pid) fail('選択できる効果がありません');
  const picked = pend.cards.find((c) => c.id === instanceId);
  if (!picked || !isCreature(picked.cardId)) fail('生物カードを選んでください');
  const p = state.players[pid];
  p.hand.push(picked);
  const rest = pend.cards.filter((c) => c.id !== instanceId);
  p.deck.push(...rest);
  state.pending = null;
  log(state, `${p.name}が${meta(picked.cardId).name}を手札に加えました`);
}

function cleaning(state: GameState, pid: PlayerId, instanceId: string) {
  requireStep(state, 'action');
  const p = state.players[pid];
  const f = findField(p, instanceId);
  if (!f || f.cardId !== 'SEA-006') fail('ホンソメワケベラを選んでください');
  if (!f.ready) fail('行動済みです');
  if (f.abilityTurn === state.turn) fail('このターンはすでに使用しました');
  f.ready = false;
  f.abilityTurn = state.turn;
  if (p.deck.length > 0) {
    const bottom = p.deck.pop()!;
    p.resources.push({ ...bottom, ready: false });
    log(state, 'クリーニング：山札の一番下を行動済みで資源に置きました');
  }
}

function brood(state: GameState, pid: PlayerId, instanceId: string, resourceId: string, targetId: string) {
  requireStep(state, 'action');
  const p = state.players[pid];
  const silver = findField(p, instanceId);
  if (!silver || silver.cardId !== 'RIVER-004') fail('シルバーアロワナを選んでください');
  if (silver.abilityTurn === state.turn) fail('このターンはすでに使用しました');
  const res = p.resources.find((r) => r.id === resourceId && r.ready);
  if (!res) fail('行動可能な資源を選んでください');
  const target = findField(p, targetId);
  if (!target || meta(target.cardId).size !== 'small' || target.attachedTo !== null) {
    fail('自分の小型生物を選んでください');
  }
  res.ready = false;
  silver.abilityTurn = state.turn;
  log(state, '口内保育：自分の小型生物を手札に戻しました');
  returnToHand(state, pid, targetId);
}

// ---------- 攻撃 ----------
function declareAttack(state: GameState, pid: PlayerId, attackerIds: string[], target: AttackTarget) {
  if (state.phase !== 'main' || state.combat || state.pending) fail('今は攻撃できません');
  requireStep(state, 'action');
  if (state.active !== pid) fail('相手のターンです');
  if (attackerIds.length === 0) fail('攻撃する生物を選んでください');
  if (new Set(attackerIds).size !== attackerIds.length) fail('同じ生物を重複して選べません');

  const p = state.players[pid];
  const d = state.players[OTHER[pid]];
  const attackers: FieldCard[] = attackerIds.map((id) => {
    const f = findField(p, id);
    if (!f) fail('攻撃する生物が見つかりません');
    if (f.attachedTo !== null) fail('装備中の生物は攻撃できません');
    if (!f.ready) fail(`${meta(f.cardId).name}は行動済みです`);
    const m = meta(f.cardId);
    if (f.enteredTurn === state.turn && !m.keywords.includes('haste')) {
      fail(`${m.name}はこのターンに場に出たため攻撃できません`);
    }
    return f;
  });

  if (target.kind === 'habitat') {
    if (attackers.some((a) => meta(a.cardId).noHabitatAttack)) fail('この生物は生息地を攻撃できません');
  } else {
    const t = findField(d, target.id);
    if (!t || t.attachedTo !== null) fail('攻撃対象が見つかりません');
    const strong = attackers.some((a) => isStrongFor(a, t));
    if (t.ready && !strong) fail('行動可能な生物は攻撃できません');
    if (d.protection && meta(t.cardId).cost <= d.protection.maxCost && !strong) {
      fail('この生物は攻撃の対象になりません（増水）');
    }
    if (meta(t.cardId).keywords.includes('hide') && attackers.length === 1 && !strong) {
      fail('潜伏している生物は単体攻撃できません（連携攻撃なら可能）');
    }
  }

  for (const a of attackers) a.ready = false;
  const names = attackers.map((a) => meta(a.cardId).name).join('＋');
  const tName = target.kind === 'habitat' ? `${HABITATS[d.faction].name}（生息地）` : meta(findField(d, target.id)!.cardId).name;
  log(state, `${p.name}の${names}が${tName}を攻撃`);

  const combat: NonNullable<GameState['combat']> = { attacker: pid, attackerIds, target, redirected: false, guardOffer: null };
  state.combat = combat;

  // かばう（猛追を持つ攻撃は変更されない）。使うかどうかは防御側が選ぶ。
  const dorado = attackers.some((a) => a.cardId === 'RIVER-001');
  if (!dorado) {
    const guard = d.field.find(
      (g) =>
        g.ready &&
        g.attachedTo === null &&
        meta(g.cardId).keywords.includes('guard') &&
        !(target.kind === 'creature' && target.id === g.id),
    );
    if (guard) {
      combat.guardOffer = guard.id;
      log(state, `${d.name}は${meta(guard.cardId).name}の【かばう】を使えます`);
    }
  }

  // 迎撃カードかかばうが使えるか確認。どちらも使えないなら自動で戦闘へ。
  const playable = d.hand.filter((h) => meta(h.cardId).type === 'counter' && canUseCounter(state, h.cardId));
  if (playable.length === 0 && !combat.guardOffer) {
    resolveCombat(state);
  } else {
    state.phase = 'counter';
    log(state, `${d.name}は迎撃カードを使用できます`);
  }
}

function attackerObjs(state: GameState, c: { attacker: PlayerId; attackerIds: string[] }): FieldCard[] {
  const p = state.players[c.attacker];
  return c.attackerIds.map((id) => findField(p, id)).filter((x): x is FieldCard => !!x);
}

function canUseCounter(state: GameState, cardId: string): boolean {
  const c = state.combat;
  if (!c) return false;
  const d = state.players[OTHER[c.attacker]];
  const attackers = attackerObjs(state, c);
  if (attackers.length === 0) return false;
  const target = c.target;
  const targetCreature = target.kind === 'creature' ? findField(d, target.id) : undefined;

  // 吸引捕食（ピラルク）：小型生物への攻撃には迎撃できない
  if (attackers.some((a) => a.cardId === 'RIVER-002') && targetCreature && meta(targetCreature.cardId).size === 'small') {
    return false;
  }

  switch (cardId) {
    case 'SEA-C01': {
      // 混乱効果：自分の生物が2体以上、かつ猛追（攻撃対象変更不可）でないこと
      if (attackers.some((a) => a.cardId === 'RIVER-001')) return false;
      return d.field.filter((f) => f.attachedTo === null).length >= 2;
    }
    case 'SEA-C02':
    case 'RIVER-C02':
      return true;
    case 'RIVER-C01':
      return target.kind === 'habitat' && attackers.length === 1 && meta(attackers[0].cardId).cost <= 5;
    default:
      return false;
  }
}

function useCounter(state: GameState, pid: PlayerId, instanceId: string, targetId?: string) {
  if (state.phase !== 'counter' || !state.combat) fail('今は迎撃できません');
  const c = state.combat;
  if (OTHER[c.attacker] !== pid) fail('迎撃できるのは防御側のみです');
  const d = state.players[pid];
  const card = findHand(d, instanceId);
  if (meta(card.cardId).type !== 'counter') fail('迎撃カードではありません');
  if (!canUseCounter(state, card.cardId)) fail('この迎撃カードは使えません');

  let negate = false;
  switch (card.cardId) {
    case 'SEA-C01': {
      const own = targetId ? findField(d, targetId) : undefined;
      if (!own || own.attachedTo !== null) fail('攻撃対象を変更する自分の生物を選んでください');
      c.target = { kind: 'creature', id: own.id };
      c.redirected = true;
      log(state, `混乱効果：攻撃対象を${meta(own.cardId).name}に変更`);
      break;
    }
    case 'SEA-C02':
    case 'RIVER-C02':
      negate = true;
      break;
    case 'RIVER-C01': {
      negate = true;
      const attacker = attackerObjs(state, c)[0];
      const ap = state.players[c.attacker];
      ap.field = ap.field.filter((x) => x.id !== attacker.id);
      ap.hand.push({ id: attacker.id, cardId: attacker.cardId, owner: attacker.owner });
      log(state, `走流性：${meta(attacker.cardId).name}を手札に戻しました`);
      break;
    }
  }

  d.hand = d.hand.filter((h) => h.id !== instanceId);
  d.drift.push({ id: card.id, cardId: card.cardId, owner: pid });
  log(state, `${d.name}は${meta(card.cardId).name}を使用`);
  state.phase = 'main';

  if (negate) {
    log(state, '攻撃は無効になりました');
    endAttack(state);
  } else {
    resolveCombat(state);
  }
}

/** かばう：防御側が選んだときだけ、かばう生物を攻撃対象に変える */
function useGuard(state: GameState, pid: PlayerId) {
  const c = state.combat;
  if (state.phase !== 'counter' || !c) fail('今はかばえません');
  if (OTHER[c.attacker] !== pid) fail('かばうのは防御側のみです');
  if (!c.guardOffer) fail('かばえる生物がいません');
  const d = state.players[pid];
  const guard = findField(d, c.guardOffer);
  if (!guard || !guard.ready || guard.attachedTo !== null) fail('かばう生物が使えません');
  guard.ready = false;
  c.target = { kind: 'creature', id: guard.id };
  c.redirected = true;
  c.guardOffer = null;
  log(state, `${meta(guard.cardId).name}が【かばう】で攻撃対象になりました`);
  // 迎撃できるカードが残っていなければ、そのまま戦闘へ
  const playable = d.hand.some((h) => meta(h.cardId).type === 'counter' && canUseCounter(state, h.cardId));
  if (!playable) resolveCombat(state);
}

function resolveCombat(state: GameState) {
  const c = state.combat;
  if (!c) return;
  state.phase = 'main';
  const attackers = attackerObjs(state, c);
  if (attackers.length === 0) {
    endAttack(state);
    return;
  }
  const atkPlayer = state.players[c.attacker];
  const defPlayer = state.players[OTHER[c.attacker]];
  const group = attackers.length > 1;
  const garDebuffing = !group && attackers[0].cardId === 'RIVER-003';

  if (c.target.kind === 'creature') {
    const t = findField(defPlayer, c.target.id);
    if (!t) {
      endAttack(state);
      return;
    }
    const attackTotal = attackers.reduce(
      (sum, a) => sum + currentAtk(state, a, { attacking: true, group }),
      0,
    );
    const defAtk = currentAtk(state, t, {
      defending: true,
      debuff: garDebuffing ? 1000 : 0,
    });
    const tName = meta(t.cardId).name;
    log(state, `戦闘：${attackTotal} 対 ${defAtk}（${tName}）`);

    const defenderDown = attackTotal >= defAtk;
    if (attackTotal > defAtk) {
      destroyCreature(state, defPlayer.id, t.id);
    } else if (attackTotal === defAtk) {
      destroyCreature(state, defPlayer.id, t.id);
      attackers.forEach((a) => destroyCreature(state, atkPlayer.id, a.id));
    } else {
      attackers.forEach((a) => destroyCreature(state, atkPlayer.id, a.id));
    }

    // 追撃（ドラド）：相手生物を撃破したら1ターン1回行動可能に
    if (defenderDown) {
      for (const a of attackers) {
        const live = findField(atkPlayer, a.id);
        if (live && live.cardId === 'RIVER-001' && live.abilityTurn !== state.turn) {
          live.ready = true;
          live.bonusTapAtEnd = true;
          live.abilityTurn = state.turn;
          log(state, '追撃：ドラドが再び行動可能になりました');
        }
      }
    }

    // 毒棘（オニダルマオコゼ）：攻撃された戦闘後、攻撃した生物1体（最もATKが高いもの）にATK－3000
    if (t.cardId === 'SEA-004') {
      const alive = attackers
        .map((a) => findField(atkPlayer, a.id))
        .filter((x): x is FieldCard => !!x && x.attachedTo === null);
      if (alive.length > 0) {
        const pick = alive.sort((x, y) => currentAtk(state, y) - currentAtk(state, x))[0];
        pick.mods.push({ amount: -3000, until: { kind: 'turn_start', player: atkPlayer.id } });
        log(state, `毒棘：${meta(pick.cardId).name}のATK－3000`);
      }
    }
  } else {
    const attackTotal = attackers.reduce(
      (sum, a) => sum + currentAtk(state, a, { attacking: true, group }),
      0,
    );
    const def = habitatDef(defPlayer.territories.length);
    log(state, `生息地攻撃：${attackTotal} 対 DEF${def}`);
    if (attackTotal >= def) {
      if (defPlayer.territories.length > 0) {
        // 破壊されたテリトリーは、その所有者（防御側）の手札に加わる
        const t = defPlayer.territories.shift()!;
        defPlayer.hand.push(t);
        log(state, `テリトリーを1枚破壊（${defPlayer.name}の手札に加わりました）`);
      } else {
        loseGame(state, defPlayer.id, '生息地を破壊されました');
      }
    }
  }

  endAttack(state);
}

function endAttack(state: GameState) {
  const c = state.combat;
  if (c) {
    // トビウオ（滑空）：攻撃後、場にいるなら手札に戻す
    for (const id of c.attackerIds) {
      const f = findField(state.players[c.attacker], id);
      if (f && f.cardId === 'SEA-008') {
      log(state, '滑空：攻撃後、場にいるので手札に戻ります');
      returnToHand(state, c.attacker, id);
    }
    }
  }
  state.combat = null;
  state.phase = state.winner ? 'ended' : 'main';
  checkStateBased(state);
}

// ---------- 外部API ----------
export function applyAction(
  state: GameState,
  actor: PlayerId,
  action: Action,
): { ok: true; state: GameState } | { ok: false; error: string } {
  if (state.winner) return { ok: false, error: '対戦は終了しています' };
  const next = structuredClone(state);
  try {
    dispatch(next, actor, action);
    checkStateBased(next);
    return { ok: true, state: next };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message };
    throw e;
  }
}

function dispatch(state: GameState, actor: PlayerId, action: Action) {
  if (action.type === 'concede') {
    loseGame(state, actor, '降参');
    return;
  }
  if (state.pending) {
    if (action.type !== 'choose') fail('山札から生物を選んでください');
    chooseSearch(state, actor, action.instanceId);
    return;
  }

  if (state.phase === 'counter') {
    if (action.type === 'counter') return useCounter(state, actor, action.instanceId, action.targetId);
    if (action.type === 'use_guard') return useGuard(state, actor);
    if (action.type === 'pass_counter') {
      if (!state.combat || OTHER[state.combat.attacker] !== actor) fail('迎撃できるのは防御側のみです');
      return resolveCombat(state);
    }
    fail('迎撃の選択中です');
  }

  if (state.phase === 'ended') fail('対戦は終了しています');
  if (state.active !== actor) fail('相手のターンです');

  switch (action.type) {
    case 'draw':
      return drawStep(state, actor);
    case 'place_resource':
      return placeResource(state, actor, action.instanceId);
    case 'skip_resource':
      return skipResource(state, actor);
    case 'play_creature':
      return playCreature(state, actor, action.instanceId, action.hostId);
    case 'play_environment':
      return playEnvironment(state, actor, action.instanceId, !!action.extra, action.targetId);
    case 'attack':
      return declareAttack(state, actor, action.attackerIds, action.target);
    case 'cleaning':
      return cleaning(state, actor, action.instanceId);
    case 'brood':
      return brood(state, actor, action.instanceId, action.resourceId, action.targetId);
    case 'end_turn':
      return endTurn(state);
    case 'counter':
    case 'pass_counter':
    case 'use_guard':
    case 'choose':
      fail('今は使えません');
  }
}

/** 相手に見せてよい情報だけを残した状態を返す */
export function viewFor(state: GameState, viewer: PlayerId): GameState {
  const s = structuredClone(state);
  const other = OTHER[viewer];
  const p = s.players[other];
  const mask = (c: CardInstance) => ({ ...c, cardId: HIDDEN_CARD_ID });
  p.hand = p.hand.map(mask);
  p.deck = p.deck.map(mask);
  p.territories = p.territories.map(mask);
  return s;
}

export { OTHER };
