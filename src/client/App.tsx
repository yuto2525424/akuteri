import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CARDS, HIDDEN_CARD_ID } from '../shared/cards';
import { currentAtk, habitatDef, OTHER } from '../shared/engine';
import { CPU_LEVELS, type CpuLevel } from '../shared/cpu';
import type { Action, CardInstance, Faction, FieldCard, GameState, Player, PlayerId } from '../shared/types';
import { getPlayerId, loadCosmetics, MATS, saveCosmetics, SLEEVES, type Cosmetics } from './cosmetics';
import { useBgm } from './bgm';
import { feel, installRipple, playSfx, useSfx, vibrate } from './juice';
import type { CSSProperties } from 'react';

interface RoomPayload {
  code: string;
  you: PlayerId;
  token: string;
  opponentJoined: boolean;
  state: GameState | null;
  rematchVotes: PlayerId[];
}

const SESSION_KEY = 'aqua-territory-session';

/** 攻撃・撃破・テリトリー破壊の告知（ゲームの記録から見つける） */
const CALLOUTS: { re: RegExp; title: string; tone: 'attack' | 'hit' | 'territory' | 'guard' }[] = [
  { re: /が【かばう】で攻撃対象になりました/, title: 'かばう！', tone: 'guard' },
  { re: /を攻撃$/, title: '攻撃！', tone: 'attack' },
  { re: /テリトリーを1枚破壊/, title: 'テリトリー破壊！', tone: 'territory' },
  { re: /が撃破されました$/, title: '撃破！', tone: 'hit' },
];

/** 能力の発動を、ゲームの記録（ログ）から見つけるための対応表 */
const ABILITY_LOG: { re: RegExp; label: string }[] = [
  { re: /毒棘：/, label: '毒棘' },
  { re: /反撃放電：/, label: '反撃放電' },
  { re: /追撃：/, label: '追撃' },
  { re: /生命継承：/, label: '生命継承' },
  { re: /滑空：/, label: '滑空' },
  { re: /栄養循環：/, label: '栄養循環' },
  { re: /クリーニング：/, label: 'クリーニング' },
  { re: /口内保育：/, label: '口内保育' },
  { re: /嗅覚：/, label: '嗅覚' },
  { re: /混乱効果：/, label: '混乱効果' },
  { re: /走流性：/, label: '走流性' },
  { re: /濁り：/, label: '濁り' },
  { re: /増水：/, label: '増水' },
];
const MAX_SLOTS = 4;
const TERRITORY_MAX = 4;

function loadSession(): { code: string; token: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSession(v: { code: string; token: string } | null) {
  try {
    if (v) localStorage.setItem(SESSION_KEY, JSON.stringify(v));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* 保存できなくても遊べる */
  }
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [cosmetics, setCosmetics] = useState<Cosmetics>(() => loadCosmetics());

  // スリーブ・マットを画面全体に反映
  useEffect(() => {
    document.documentElement.dataset.sleeve = cosmetics.sleeve;
    document.documentElement.dataset.mat = cosmetics.mat;
    saveCosmetics(cosmetics);
  }, [cosmetics]);

  // 訪問を1回記録（個人情報は送らない）
  useEffect(() => {
    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: getPlayerId() }),
    }).catch(() => {
      /* 記録できなくても遊べる */
    });
  }, []);

  useEffect(() => {
    installRipple();
  }, []);

  useEffect(() => {
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);
    s.on('connect', () => {
      s.emit('hello', { playerId: getPlayerId() });
      setConnected(true);
      const sess = loadSession();
      if (sess) {
        s.emit('rejoin', sess, (r: { ok: boolean }) => {
          if (!r.ok) saveSession(null);
        });
      }
    });
    s.on('disconnect', () => setConnected(false));
    s.on('room', (payload: RoomPayload) => {
      setRoom(payload);
      saveSession({ code: payload.code, token: payload.token });
    });
    return () => {
      s.disconnect();
    };
  }, []);

  const leave = useCallback(() => {
    saveSession(null);
    setRoom(null);
    socket?.disconnect();
    setTimeout(() => socket?.connect(), 0);
  }, [socket]);

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 2500);
  };

  if (!socket) return <div className="center">接続中…</div>;

  if (!room || !room.state) {
    return (
      <Lobby
        socket={socket}
        connected={connected}
        waitingCode={room?.code ?? null}
        onError={flashError}
        error={error}
        onLeave={leave}
        cosmetics={cosmetics}
        setCosmetics={setCosmetics}
      />
    );
  }

  return (
    <Game
      socket={socket}
      room={room}
      error={error}
      onError={flashError}
      onLeave={leave}
      cosmetics={cosmetics}
      setCosmetics={setCosmetics}
    />
  );
}

/** 効果音のオン・オフ */
function SfxButton() {
  const [on, toggle] = useSfx();
  return (
    <button className={`bgm-btn ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on}>
      ✦ 効果音 {on ? 'ON' : 'OFF'}
    </button>
  );
}

/** 音楽（BGM）のオン・オフ。ロビーと対戦画面で同じ設定を共有する。 */
function BgmButton() {
  const [on, toggle] = useBgm();
  return (
    <button className={`bgm-btn ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on}>
      ♪ BGM {on ? 'ON' : 'OFF'}
    </button>
  );
}

/** スリーブ・プレイマットの選択欄（ロビーとゲーム内の両方で使う） */
function CosmeticPicker({ value, onChange }: { value: Cosmetics; onChange: (c: Cosmetics) => void }) {
  return (
    <div className="cosmetic-picker">
      <div className="cp-row">
        <span className="muted">スリーブ</span>
        {SLEEVES.map((s) => (
          <button
            key={s.id}
            className={`chip sleeve-chip ${value.sleeve === s.id ? 'selected' : ''}`}
            onClick={() => onChange({ ...value, sleeve: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="cp-row">
        <span className="muted">マット</span>
        {MATS.map((m) => (
          <button
            key={m.id}
            className={`chip mat-chip ${value.mat === m.id ? 'selected' : ''}`}
            onClick={() => onChange({ ...value, mat: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- ロビー ----------------
function Lobby(props: {
  socket: Socket;
  connected: boolean;
  waitingCode: string | null;
  error: string | null;
  onError: (m: string) => void;
  onLeave: () => void;
  cosmetics: Cosmetics;
  setCosmetics: (c: Cosmetics) => void;
}) {
  const { socket, connected, waitingCode, error, onError } = props;
  const [name, setName] = useState(() => localStorage.getItem('aqua-name') ?? '');
  const [faction, setFaction] = useState<Faction>('sea');
  const [code, setCode] = useState('');
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('intermediate');

  const rememberName = (v: string) => {
    setName(v);
    try {
      localStorage.setItem('aqua-name', v);
    } catch {
      /* ignore */
    }
  };

  const create = () => {
    socket.emit('create_room', { name, faction }, (r: { ok: boolean }) => {
      if (!r.ok) onError('作成できませんでした');
    });
  };
  const join = () => {
    socket.emit('join_room', { code, name, faction }, (r: { ok: boolean; error?: string }) => {
      if (!r.ok) onError(r.error ?? '参加できませんでした');
    });
  };
  const vsCpu = () => {
    // CPUは、自分と反対のデッキで戦う
    const cpuFaction: Faction = faction === 'sea' ? 'river' : 'sea';
    socket.emit('create_cpu_room', { name, faction, cpuFaction, level: cpuLevel }, (r: { ok: boolean }) => {
      if (!r.ok) onError('CPU対戦を始められませんでした');
    });
  };

  if (waitingCode) {
    return (
      <div className="lobby">
        <img className="logo" src="/logo.jpg" alt="AQUA TERRITORY 水圏生物対戦カードゲーム" draggable={false} />
        <div className="panel">
          <p>相手に次のルームコードを伝えてください</p>
          <div className="room-code">{waitingCode}</div>
          <p className="muted">相手が参加すると対戦が始まります</p>
          <button onClick={props.onLeave}>やめる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <img className="logo" src="/logo.jpg" alt="AQUA TERRITORY 水圏生物対戦カードゲーム" draggable={false} />
      <div className="panel">
        <BgmButton />
        {!connected && <p className="warn">サーバーに接続中です…</p>}
        <label>
          プレイヤー名
          <input value={name} maxLength={12} onChange={(e) => rememberName(e.target.value)} placeholder="なまえ" />
        </label>
        <div className="factions">
          <button className={faction === 'sea' ? 'selected sea' : 'sea'} onClick={() => setFaction('sea')}>海デッキ</button>
          <button className={faction === 'river' ? 'selected river' : 'river'} onClick={() => setFaction('river')}>川デッキ</button>
        </div>
        <div className="cpu-levels">
          <span className="muted">CPUの強さ</span>
          <div className="factions">
            {CPU_LEVELS.map((l) => (
              <button
                key={l.value}
                className={cpuLevel === l.value ? `selected level-${l.value}` : `level-${l.value}`}
                onClick={() => setCpuLevel(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <button className="primary" onClick={vsCpu} disabled={!connected}>CPUと対戦（{CPU_LEVELS.find((l) => l.value === cpuLevel)?.label}）</button>
        <button onClick={create} disabled={!connected}>友だちと対戦（部屋を作る）</button>
        <div className="join-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ルームコード"
            maxLength={6}
          />
          <button onClick={join} disabled={!connected || code.length < 6}>参加する</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

// ---------------- 対戦画面 ----------------
type Zone = 'hand' | 'field' | 'drift';
type Mode =
  | { kind: 'none' }
  | { kind: 'attack' }
  | { kind: 'pick_host'; instanceId: string }
  | { kind: 'pick_enemy'; instanceId: string }
  | { kind: 'pick_drift'; instanceId: string; extra: boolean }
  | { kind: 'pick_own'; instanceId: string; purpose: 'counter' | 'brood' };

const STEPS = [
  { key: 'recover', label: '回復' },
  { key: 'draw', label: 'ドロー' },
  { key: 'resource', label: '資源' },
  { key: 'action', label: '行動' },
  { key: 'end', label: '終了' },
] as const;

function Game(props: {
  socket: Socket;
  room: RoomPayload;
  error: string | null;
  onError: (m: string) => void;
  onLeave: () => void;
  cosmetics: Cosmetics;
  setCosmetics: (c: Cosmetics) => void;
}) {
  const { socket, room, error, onError, onLeave } = props;
  const state = room.state!;
  const me = room.you;
  const foe = OTHER[me];
  const myP = state.players[me];
  const foeP = state.players[foe];

  const [sel, setSel] = useState<{ zone: Zone; id: string } | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [attackers, setAttackers] = useState<string[]>([]);
  const [panel, setPanel] = useState<'none' | 'log' | 'drift' | 'settings'>('none');
  const [banner, setBanner] = useState<string | null>(null);
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);

  // ---- 演出：引いたカード・出した生物・攻撃・使った環境や迎撃の拡大表示 ----
  // 前回の画面と比べて「増えたもの」だけに演出を付ける（最初の表示では付けない）
  const prevHandIds = useRef<Set<string> | null>(null);
  const prevFieldIds = useRef<Set<string> | null>(null);
  const prevDriftIds = useRef<Set<string> | null>(null);
  const [zoom, setZoom] = useState<{ cardId: string; key: number } | null>(null);
  const handFresh = new Set(
    prevHandIds.current ? myP.hand.map((c) => c.id).filter((id) => !prevHandIds.current!.has(id)) : [],
  );
  const allField = [...myP.field, ...foeP.field];
  const fieldFresh = new Set(
    prevFieldIds.current ? allField.map((f) => f.id).filter((id) => !prevFieldIds.current!.has(id)) : [],
  );
  const attackIds = new Set(state.combat ? state.combat.attackerIds : []);
  const hitId = state.combat && state.combat.target.kind === 'creature' ? state.combat.target.id : null;
  const fxOf = (id: string): TileFx => ({
    fresh: fieldFresh.has(id) ? 'play' : undefined,
    attacking: attackIds.has(id),
    hit: hitId === id,
  });
  useEffect(() => {
    const oldField = prevFieldIds.current;
    prevHandIds.current = new Set(myP.hand.map((c) => c.id));
    prevFieldIds.current = new Set(allField.map((f) => f.id));
    if (oldField) {
      // 新しく場に出た生物は、カードを大きく見せる（出した動き）
      const played = allField.filter((f) => !oldField.has(f.id) && f.attachedTo === null && CARDS[f.cardId].type === 'creature');
      if (played.length > 0) setZoom({ cardId: played[played.length - 1].cardId, key: Date.now() });
    }
    const driftNow = [...myP.drift, ...foeP.drift];
    if (prevDriftIds.current) {
      // 新しく漂流域に入った「環境・迎撃」は、大きく見せる
      const used = driftNow.filter((d) => !prevDriftIds.current!.has(d.id) && CARDS[d.cardId].type !== 'creature');
      if (used.length > 0) setZoom({ cardId: used[used.length - 1].cardId, key: Date.now() });
    }
    prevDriftIds.current = new Set(driftNow.map((d) => d.id));
  });
  useEffect(() => {
    if (!zoom) return;
    const t = setTimeout(() => setZoom(null), 2200);
    return () => clearTimeout(t);
  }, [zoom]);

  // ---- 手応え：操作の結果に合わせて音・振動・画面の揺れ ----
  const prevState = useRef<GameState | null>(null);
  const [shaking, setShaking] = useState(false);
  const [abilityBanner, setAbilityBanner] = useState<{ label: string; sub: string; key: number } | null>(null);
  const [callout, setCallout] = useState<{ title: string; sub: string; tone: 'attack' | 'hit' | 'territory' | 'guard'; key: number } | null>(null);
  // テリトリーが割れた場所（割れた側・枠の番号）
  const [shatter, setShatter] = useState<{ side: PlayerId; idx: number; key: number } | null>(null);
  useEffect(() => {
    if (!shatter) return;
    const t = setTimeout(() => setShatter(null), 1800);
    return () => clearTimeout(t);
  }, [shatter]);
  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout(null), 2600);
    return () => clearTimeout(t);
  }, [callout]);
  useEffect(() => {
    if (!abilityBanner) return;
    const t = setTimeout(() => setAbilityBanner(null), 2600);
    return () => clearTimeout(t);
  }, [abilityBanner]);
  useEffect(() => {
    const p = prevState.current;
    prevState.current = state;
    if (!p) return;
    // 能力が発動した記録（ログ）が増えたら「能力発動！」を出す
    if (p.log.length <= state.log.length) {
      const fresh = state.log.slice(p.log.length);
      const co = fresh.map((e) => ({ e, c: CALLOUTS.find((x) => x.re.test(e.text)) })).find((x) => x.c);
      if (co?.c) {
        setCallout({ title: co.c.title, sub: co.e.text.slice(0, 60), tone: co.c.tone, key: Date.now() });
      }
      for (const entry of fresh) {
        const hit = ABILITY_LOG.find((a) => a.re.test(entry.text));
        if (hit) {
          feel('ability');
          setAbilityBanner({ label: hit.label, sub: entry.text.slice(0, 48), key: Date.now() });
          break;
        }
      }
    }
    const shake = () => {
      setShaking(true);
      setTimeout(() => setShaking(false), 900);
    };
    const count = (s: GameState) => s.players.A.field.length + s.players.B.field.length;
    const driftCount = (s: GameState) => s.players.A.drift.length + s.players.B.drift.length;
    if (state.winner && !p.winner) {
      feel(state.winner === me ? 'win' : 'lose');
      return;
    }
    // テリトリーが割れた：割れる演出と音、その後に持ち主の手札へ
    for (const pid of ['A', 'B'] as PlayerId[]) {
      const before = p.players[pid].territories.length;
      const after = state.players[pid].territories.length;
      if (after < before) {
        setShatter({ side: pid, idx: after, key: Date.now() });
        playSfx('shatter');
        vibrate('shatter');
      }
    }
    if (p.turn !== state.turn) {
      feel('turn');
    } else if (!p.combat && state.combat) {
      feel('attack');
      shake();
    } else if (p.combat && !state.combat && count(state) < count(p)) {
      feel('hit');
      shake();
    } else if (driftCount(state) > driftCount(p) && p.phase === 'counter') {
      feel('counter');
    } else if (count(state) > count(p)) {
      feel('play');
    } else if (state.players[me].hand.length > p.players[me].hand.length) {
      feel('draw');
    }
  }, [state, me]);
  // 操作メニューを出す位置（クリックしたカードの上）
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const anchorOf = (e: ReactMouseEvent<HTMLElement>, id: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { id, x: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130), y: Math.max(r.top - 10, 8) };
  };

  const isMyTurn = state.active === me && state.phase === 'main' && !state.pending && !state.winner;
  const isDrawStep = isMyTurn && state.step === 'draw';
  const isResourceStep = isMyTurn && state.step === 'resource';
  const isActionStep = isMyTurn && state.step === 'action';
  const isCounterPhase = state.phase === 'counter' && !!state.combat && OTHER[state.combat.attacker] === me;
  const searchPending = state.pending && state.pending.player === me ? state.pending : null;

  // ターンが変わったときだけ、ターン開始の告知を出す（操作のたびには出さない）
  const lastTurnKey = useRef<string>('');
  useEffect(() => {
    const key = `${state.turn}-${state.active}`;
    if (lastTurnKey.current === key) return;
    lastTurnKey.current = key;
    if (state.winner) return;
    const text = state.active === me ? 'あなたのターン' : `${state.players[state.active].name}のターン`;
    setBanner(text);
    const t = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(t);
  }, [state.turn, state.active, state.winner, me, state.players]);

  // フェイズ（資源・行動）が切り替わったときだけ、短く告知する
  const lastStepKey = useRef<string>('');
  useEffect(() => {
    const key = `${state.turn}-${state.step}`;
    if (lastStepKey.current === key) return;
    const first = lastStepKey.current === '';
    lastStepKey.current = key;
    if (first || state.winner || state.active !== me || state.pending) return;
    setPhaseBanner(state.step === 'draw' ? 'ドローフェイズ' : state.step === 'resource' ? '資源フェイズ' : '行動フェイズ');
    const t = setTimeout(() => setPhaseBanner(null), 1400);
    return () => clearTimeout(t);
  }, [state.turn, state.step, state.active, state.winner, state.pending, me]);

  // 状態が変わったら選択を解除
  useEffect(() => {
    setSel(null);
    setMode({ kind: 'none' });
    setAttackers([]);
    setInspectCardId(null);
  }, [state.turn, state.phase, state.step]);

  const send = useCallback(
    (action: Action, after?: () => void) => {
      // どの操作にも音を付ける（決定の音）
      playSfx('confirm');
      socket.emit('action', action, (r: { ok: boolean; error?: string }) => {
        if (!r.ok) onError(r.error ?? '操作できません');
        else after?.();
      });
    },
    [socket, onError],
  );

  const selectedCard = useMemo<{ card: CardInstance; zone: Zone } | null>(() => {
    if (!sel) return null;
    if (sel.zone === 'hand') {
      const c = myP.hand.find((h) => h.id === sel.id);
      return c ? { card: c, zone: 'hand' } : null;
    }
    if (sel.zone === 'drift') {
      const c = myP.drift.find((h) => h.id === sel.id);
      return c ? { card: c, zone: 'drift' } : null;
    }
    return null;
  }, [sel, myP]);

  const selectedField = sel && sel.zone === 'field' ? myP.field.find((f) => f.id === sel.id) : undefined;
  // 山札の候補をタップしたときは、そのカードの詳細を出す
  const detailCardId = selectedCard?.card.cardId ?? (selectedField ? selectedField.cardId : null) ?? inspectCardId;

  // ---- クリック処理 ----
  const clickHand = (id: string, e: ReactMouseEvent<HTMLElement>) => {
    playSfx('tap');
    if (mode.kind !== 'none') return;
    if (sel?.id === id) {
      setSel(null);
      setMenu(null);
      return;
    }
    setSel({ zone: 'hand', id });
    setMenu(anchorOf(e, id));
  };

  const clickOwnField = (f: FieldCard, e: ReactMouseEvent<HTMLElement>) => {
    playSfx('tap');
    if (mode.kind === 'attack') {
      if (!f.ready || f.attachedTo !== null) return;
      setAttackers((cur) => (cur.includes(f.id) ? cur.filter((x) => x !== f.id) : [...cur, f.id]));
      return;
    }
    if (mode.kind === 'pick_host') {
      send({ type: 'play_creature', instanceId: mode.instanceId, hostId: f.id }, () => setMode({ kind: 'none' }));
      return;
    }
    if (mode.kind === 'pick_own' && mode.purpose === 'counter') {
      send({ type: 'counter', instanceId: mode.instanceId, targetId: f.id }, () => setMode({ kind: 'none' }));
      return;
    }
    if (mode.kind === 'pick_own' && mode.purpose === 'brood') {
      const res = myP.resources.find((r) => r.ready);
      if (!res) return onError('行動可能な資源がありません');
      send(
        { type: 'brood', instanceId: mode.instanceId, resourceId: res.id, targetId: f.id },
        () => setMode({ kind: 'none' }),
      );
      return;
    }
    if (sel?.id === f.id) {
      setSel(null);
      setMenu(null);
      return;
    }
    setSel({ zone: 'field', id: f.id });
    setMenu(anchorOf(e, f.id));
  };

  /** 相手の生物を攻撃できるか：横向き（行動済み）の生物が基本。強襲の生物は縦向きも狙える */
  const canHitFoe = (f: FieldCard) =>
    !f.ready ||
    attackers.some((id) => {
      const a = myP.field.find((x) => x.id === id);
      if (!a) return false;
      const m = CARDS[a.cardId];
      return m.keywords.includes('strong') || (!!f.cardId && !!m.conditionalStrong?.includes(CARDS[f.cardId].size!));
    });

  const clickFoeField = (f: FieldCard) => {
    if (mode.kind === 'pick_enemy') {
      send({ type: 'play_environment', instanceId: mode.instanceId, targetId: f.id }, () => setMode({ kind: 'none' }));
      return;
    }
    if (mode.kind === 'attack') {
      if (attackers.length === 0) return onError('攻撃する自分の生物を選んでください');
      if (!canHitFoe(f)) return onError('攻撃できるのは、横向き（行動済み）の相手の生物だけです');
      send({ type: 'attack', attackerIds: attackers, target: { kind: 'creature', id: f.id } }, () => {
        setMode({ kind: 'none' });
        setAttackers([]);
      });
    }
  };

  const clickFoeHabitat = () => {
    if (mode.kind === 'attack') {
      if (attackers.length === 0) return onError('攻撃する自分の生物を選んでください');
      send({ type: 'attack', attackerIds: attackers, target: { kind: 'habitat' } }, () => {
        setMode({ kind: 'none' });
        setAttackers([]);
      });
    }
  };

  const clickDrift = (id: string) => {
    if (mode.kind === 'pick_drift') {
      send(
        { type: 'play_environment', instanceId: mode.instanceId, extra: mode.extra, targetId: id },
        () => setMode({ kind: 'none' }),
      );
      setPanel('none');
    } else {
      setSel({ zone: 'drift', id });
    }
  };

  // ---- ボタン操作 ----
  const handAction = (kind: 'resource' | 'play' | 'extra') => {
    if (!selectedCard) return;
    const { card } = selectedCard;
    const m = CARDS[card.cardId];
    if (kind === 'resource') {
      return send({ type: 'place_resource', instanceId: card.id }, () => setSel(null));
    }
    if (m.type === 'creature') {
      if (card.cardId === 'SEA-007') return setMode({ kind: 'pick_host', instanceId: card.id });
      return send({ type: 'play_creature', instanceId: card.id }, () => setSel(null));
    }
    if (m.type === 'environment') {
      if (card.cardId === 'SEA-E03') return setMode({ kind: 'pick_enemy', instanceId: card.id });
      if (card.cardId === 'SEA-E02' || card.cardId === 'RIVER-E03') {
        return setMode({ kind: 'pick_drift', instanceId: card.id, extra: kind === 'extra' });
      }
      return send({ type: 'play_environment', instanceId: card.id }, () => setSel(null));
    }
  };

  const fieldAbility = (f: FieldCard, kind: 'clean' | 'brood') => {
    if (kind === 'clean') return send({ type: 'cleaning', instanceId: f.id }, () => setSel(null));
    setMode({ kind: 'pick_own', instanceId: f.id, purpose: 'brood' });
  };

  // 選んだカードの上に出す操作ボタン
  const cardMenu: JSX.Element[] = [];
  if (isResourceStep && selectedCard?.zone === 'hand') {
    cardMenu.push(
      <button
        key="res"
        className="primary"
        disabled={myP.resourcePlacedTurn === state.turn}
        onClick={() => handAction('resource')}
      >
        資源に置く
      </button>,
    );
  }
  if (isActionStep && selectedCard?.zone === 'hand' && CARDS[selectedCard.card.cardId].type !== 'counter') {
    cardMenu.push(
      <button key="play" className="primary" onClick={() => handAction('play')}>
        {CARDS[selectedCard.card.cardId].type === 'creature' ? '場に出す' : '使う'}
      </button>,
    );
    if (selectedCard.card.cardId === 'SEA-E02' || selectedCard.card.cardId === 'RIVER-E03') {
      cardMenu.push(
        <button key="extra" onClick={() => handAction('extra')}>追加支払い(資源4)</button>,
      );
    }
  }
  if (isActionStep && selectedField && selectedField.owner === me) {
    if (selectedField.ready) {
      cardMenu.push(
        <button
          key="atk"
          className="primary"
          disabled={selectedField.enteredTurn === state.turn && !CARDS[selectedField.cardId].keywords.includes('haste')}
          onClick={() => {
            setMode({ kind: 'attack' });
            setAttackers([selectedField.id]);
            setSel(null);
            setMenu(null);
          }}
        >
          攻撃する
        </button>,
      );
    }
    if (selectedField.cardId === 'SEA-006') {
      cardMenu.push(<button key="clean" onClick={() => fieldAbility(selectedField, 'clean')}>クリーニング</button>);
    }
    if (selectedField.cardId === 'RIVER-004') {
      cardMenu.push(<button key="brood" onClick={() => fieldAbility(selectedField, 'brood')}>口内保育</button>);
    }
  }

  // 何もできることがなくなったら、ターン終了ボタンを中央に出す
  const readyRes = myP.resources.filter((r) => r.ready).length;
  const slotsFree = myP.field.filter((f) => f.attachedTo === null).length < MAX_SLOTS;
  const canPlayCard = myP.hand.some((c) => {
    const m = CARDS[c.cardId];
    if (m.type === 'counter') return false;
    if (c.cardId === 'SEA-001' && myP.drift.filter((d) => CARDS[d.cardId].type === 'creature').length >= 5) return true;
    if (m.cost > readyRes) return false;
    if (m.type === 'creature') {
      if (c.cardId === 'SEA-007') return myP.field.some((f) => CARDS[f.cardId].size === 'large' && f.attachedTo === null);
      return slotsFree;
    }
    if (c.cardId === 'SEA-E02' || c.cardId === 'RIVER-E03') {
      return slotsFree && myP.drift.some((d) => CARDS[d.cardId].type === 'creature' && (CARDS[d.cardId].baseAtk ?? 0) <= 3000);
    }
    return true;
  });
  const canAttack = myP.field.some(
    (f) => f.ready && f.attachedTo === null && (f.enteredTurn !== state.turn || CARDS[f.cardId].keywords.includes('haste')),
  );
  const canAbility = myP.field.some(
    (f) =>
      (f.cardId === 'SEA-006' && f.ready && f.abilityTurn !== state.turn) ||
      (f.cardId === 'RIVER-004' && f.abilityTurn !== state.turn && readyRes > 0 && myP.field.some((x) => CARDS[x.cardId].size === 'small')),
  );
  const nothingLeft = isActionStep && mode.kind === 'none' && !canPlayCard && !canAttack && !canAbility;

  // 攻撃を受けているとき、今使える迎撃カードだけを出す（ルールと同じ条件）
  const canUseCounterKonran = myP.field.filter((f) => f.attachedTo === null).length >= 2;
  const incoming = state.combat
    ? state.combat.attackerIds
        .map((id) => state.players[state.combat!.attacker].field.find((f) => f.id === id))
        .filter((x): x is FieldCard => !!x)
    : [];
  const incomingTarget = state.combat?.target;
  const targetFoeCard =
    incomingTarget?.kind === 'creature' ? myP.field.find((f) => f.id === incomingTarget.id) : undefined;
  const pirarucuBlocks = incoming.some((a) => a.cardId === 'RIVER-002') && !!targetFoeCard && CARDS[targetFoeCard.cardId].size === 'small';
  const usableCounter = (cardId: string) => {
    if (pirarucuBlocks) return false;
    if (cardId === 'SEA-C01') return canUseCounterKonran && !incoming.some((a) => a.cardId === 'RIVER-001');
    if (cardId === 'RIVER-C01') return incomingTarget?.kind === 'habitat' && incoming.length === 1 && CARDS[incoming[0].cardId].cost <= 5;
    return true;
  };
  const counterCards = isCounterPhase
    ? myP.hand.filter((h) => CARDS[h.cardId].type === 'counter' && usableCounter(h.cardId))
    : [];
  const attackerNames = incoming.map((a) => CARDS[a.cardId].name).join('＋');
  const targetName =
    incomingTarget?.kind === 'habitat' ? `${myP.name}の生息地` : targetFoeCard ? CARDS[targetFoeCard.cardId].name : '生物';
  const useCounterCard = (c: CardInstance) => {
    if (c.cardId === 'SEA-C01') {
      setMode({ kind: 'pick_own', instanceId: c.id, purpose: 'counter' });
      return;
    }
    send({ type: 'counter', instanceId: c.id });
  };
  const detailMeta = detailCardId && detailCardId !== HIDDEN_CARD_ID ? CARDS[detailCardId] : null;
  const stepIndex = state.step === 'draw' ? 1 : state.step === 'resource' ? 2 : 3;

  return (
    <div className={`game ${shaking ? 'shake' : ''}`}>
      {banner && (
        <div className="turn-banner" key={`${state.turn}-${banner}`}>
          <span>{banner}</span>
        </div>
      )}
      {!banner && phaseBanner && (
        <div className="turn-banner phase" key={`${state.turn}-${phaseBanner}`}>
          <span>{phaseBanner}</span>
        </div>
      )}

      <header className="topbar">
        <span className="turn-chip">ターン {state.turn}</span>
        <span className={`owner-chip ${state.active === me ? 'mine' : ''}`}>
          {state.active === me ? 'あなたの番' : `${state.players[state.active].name}の番`}
        </span>
        <ol className="steps">
          {STEPS.map((s, i) => {
            const done = i < stepIndex && state.phase !== 'ended';
            const current = i === stepIndex && !state.winner;
            return (
              <li key={s.key} className={`step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                <span className="step-dot">{i + 1}</span>
                <span className="step-label">{s.label}</span>
              </li>
            );
          })}
        </ol>
        {state.phase === 'counter' && <span className="badge">迎撃の選択中</span>}
        <span className="spacer" />
        <BgmButton />
        <SfxButton />
        <button onClick={() => setPanel((p) => (p === 'settings' ? 'none' : 'settings'))}>設定</button>
        <button onClick={() => setPanel((p) => (p === 'log' ? 'none' : 'log'))}>ログ</button>
        <button onClick={() => send({ type: 'concede' })} disabled={!!state.winner}>降参</button>
        <button onClick={onLeave}>退出</button>
      </header>

      {error && <div className="toast">{error}</div>}

      <main className="field">
        {/* 相手の手札 */}
        <div className="hand-strip foe-hand">
          <span className="hand-label">{foeP.name}の手札 {foeP.hand.length}</span>
          <div className="backs">
            {foeP.hand.map((c) => (
              <div key={c.id} className="back-card"><CardFace cardId={HIDDEN_CARD_ID} /></div>
            ))}
          </div>
        </div>

        {/* 相手の陣地 */}
        <Side
          p={foeP}
          state={state}
          side="foe"
          slotTargetable={(f) => (mode.kind === 'attack' && canHitFoe(f)) || mode.kind === 'pick_enemy'}
          onSlot={(f) => (mode.kind === 'none' ? setSel({ zone: 'field', id: f.id }) : clickFoeField(f))}
          habTarget={mode.kind === 'attack'}
          onHab={clickFoeHabitat}
          fx={fxOf}
          shatter={shatter && shatter.side === foe ? { idx: shatter.idx, key: shatter.key } : null}
        />

        {/* 中央の案内 */}
        <div className="midline">
          {nothingLeft && (
            <button className="end end-center" onClick={() => send({ type: 'end_turn' })}>ターン終了</button>
          )}
          {mode.kind === 'attack' && <span>攻撃する生物を選び、相手の生物か生息地をタップ（{attackers.length}体選択中）</span>}
          {mode.kind === 'pick_host' && <span>装備先の自分の大型生物をタップ</span>}
          {mode.kind === 'pick_enemy' && <span>濁りの対象：相手の生物をタップ</span>}
          {mode.kind === 'pick_drift' && <span>漂流域の生物を選んでください（{mode.extra ? '追加支払い：ATK無制限' : 'ATK3000以下'}）</span>}
          {mode.kind === 'pick_own' && mode.purpose === 'brood' && <span>口内保育する自分の小型生物をタップ</span>}
          {mode.kind === 'pick_own' && mode.purpose === 'counter' && <span>攻撃対象を変更する自分の生物をタップ</span>}
          {mode.kind === 'none' && <PhaseMessage state={state} me={me} />}
          {mode.kind !== 'none' && (
            <button onClick={() => { setMode({ kind: 'none' }); setAttackers([]); }}>キャンセル</button>
          )}
        </div>

        {/* 自分の陣地 */}
        <Side
          p={myP}
          state={state}
          side="mine"
          own
          slotTargetable={(f) =>
            mode.kind === 'attack' ? f.ready : mode.kind === 'pick_host' ? CARDS[f.cardId].size === 'large' : mode.kind === 'pick_own'
          }
          slotSelected={(f) => sel?.id === f.id || attackers.includes(f.id)}
          onSlot={(f, e) => clickOwnField(f, e)}
          onDrift={() => setPanel('drift')}
          driftTarget={mode.kind === 'pick_drift'}
          onDeck={isDrawStep ? () => send({ type: 'draw' }) : undefined}
          deckTarget={isDrawStep}
          shatter={shatter && shatter.side === me ? { idx: shatter.idx, key: shatter.key } : null}
          resourceClick={undefined}
          fx={fxOf}
        />

        {/* 自分の手札 */}
        <div className="hand-strip my-hand">
          <span className="hand-label">あなたの手札 {myP.hand.length}</span>
          <div className="hand-cards">
            {myP.hand.length === 0 && <span className="muted">手札はありません</span>}
            {myP.hand.map((c) => (
              <div
                key={c.id}
                className={`hand-card ${sel?.id === c.id ? 'selected' : ''} ${handFresh.has(c.id) ? 'draw-in' : ''} ${isCounterPhase && counterCards.some((x) => x.id === c.id) ? 'counter-ready' : ''}`}
                onClick={(e) => {
                  // 攻撃を受けているときは、迎撃カードをタップすると使える
                  if (isCounterPhase && CARDS[c.cardId].type === 'counter') {
                    if (c.cardId === 'SEA-C01') {
                      if (!canUseCounterKonran) return onError('混乱効果は、自分の生物が2体以上いるときに使えます');
                      setMode({ kind: 'pick_own', instanceId: c.id, purpose: 'counter' });
                      return;
                    }
                    send({ type: 'counter', instanceId: c.id });
                    return;
                  }
                  clickHand(c.id, e);
                }}
              >
                <CardFace cardId={c.cardId} />
              </div>
            ))}
          </div>
        </div>

        {/* 操作 */}
        <section className="actions">
          {isResourceStep && <button onClick={() => send({ type: 'skip_resource' })}>資源を置かず行動へ</button>}
          {mode.kind === 'attack' && <span className="muted">攻撃先を選んでください</span>}
          <span className="spacer" />
          {!nothingLeft && (
            <button className="end" onClick={() => send({ type: 'end_turn' })} disabled={!isMyTurn}>
              ターン終了
            </button>
          )}
        </section>
      </main>

      {/* 選んだカードの上だけに出る操作メニュー */}
      {menu && sel && sel.id === menu.id && cardMenu.length > 0 && (
        <div className="card-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          {cardMenu}
        </div>
      )}

      {/* カード詳細・ログ・漂流域・設定（必要なときだけ表示） */}
      {(detailMeta || panel !== 'none') && (
        <aside className="float-panel">
          <button className="close-x" onClick={() => { setPanel('none'); setSel(null); setInspectCardId(null); }} aria-label="閉じる">×</button>
          {panel === 'log' && (
            <div className="log">
              {[...state.log].reverse().map((l, i) => (
                <div key={i} className="log-line">T{l.turn} {l.text}</div>
              ))}
            </div>
          )}
          {panel === 'drift' && (
            <div className="drift-list">
              <strong>あなたの漂流域（{myP.drift.length}）</strong>
              <div className="drift-grid">
                {myP.drift.map((d) => (
                  <button
                    key={d.id}
                    className={`mini ${mode.kind === 'pick_drift' ? 'target' : ''}`}
                    onClick={() => clickDrift(d.id)}
                  >
                    {CARDS[d.cardId].name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {panel === 'settings' && (
            <div>
              <strong>設定</strong>
              <p className="muted">スリーブ・プレイマットは公式デザインを使用しています</p>
            </div>
          )}
          {panel === 'none' && detailMeta && <CardDetail cardId={detailCardId!} />}
        </aside>
      )}

      {/* 攻撃・撃破・テリトリー破壊の告知：「〇〇が〇〇に攻撃！」 */}
      {callout && (
        <div className={`ability-banner callout ${callout.tone}`} key={callout.key}>
          <div className="ab-flash" aria-hidden="true" />
          <div className="ab-burst" aria-hidden="true" />
          <div className="ab-main">{callout.title}</div>
          <div className="ab-sub">{callout.sub}</div>
        </div>
      )}

      {/* 能力発動の演出：「能力発動！」と能力名を大きく出す */}
      {abilityBanner && (
        <div className="ability-banner" key={abilityBanner.key}>
          <div className="ab-flash" aria-hidden="true" />
          <div className="ab-burst" aria-hidden="true" />
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              className="ab-particle"
              style={{ '--a': `${(i * 360) / 16}deg`, animationDelay: `${(i % 4) * 0.03}s` } as CSSProperties}
            />
          ))}
          <div className="ab-main">能力発動！</div>
          <div className="ab-name">{abilityBanner.label}</div>
          <div className="ab-sub">{abilityBanner.sub}</div>
        </div>
      )}

      {/* 使ったカードを大きく見せる演出 */}
      {zoom && (
        <div className="card-zoom" key={zoom.key}>
          <div className="zoom-card">
            <CardFace cardId={zoom.cardId} />
          </div>
        </div>
      )}


      {/* 迎撃の選択：使うか、このまま受けるかをプレイヤーが決める */}
      {isCounterPhase && state.combat && (
        <div className={`overlay counter-overlay ${mode.kind === 'pick_own' && mode.purpose === 'counter' ? 'picking' : ''}`}>
          <div className="dialog counter-dialog">
            <h2>攻撃を受けています！</h2>
            <p>
              <b>{attackerNames}</b> が <b>{targetName}</b> を攻撃
            </p>
            {mode.kind === 'pick_own' && mode.purpose === 'counter' ? (
              <p className="pick-hint">攻撃対象を変更する、自分の生物をタップしてください</p>
            ) : (
              <p>迎撃カードを使うか、このまま受けるか選んでください（1回の攻撃に1枚まで）</p>
            )}
            <div className="counter-cards">
              {counterCards.length === 0 && <span className="muted">使える迎撃カードがありません</span>}
              {counterCards.map((c) => (
                <div key={c.id} className="counter-pick" onClick={() => useCounterCard(c)}>
                  <CardFace cardId={c.cardId} />
                </div>
              ))}
            </div>
            <button className="primary big" onClick={() => send({ type: 'pass_counter' })}>
              迎撃しない（このまま受ける）
            </button>
          </div>
        </div>
      )}

      {/* 山札からの選択 */}
      {searchPending && (
        <div className="overlay">
          <div className="dialog">
            <h2>山札の上から3枚</h2>
            <p>手札に加える生物を1枚選んでください（残りは山札の一番下へ）</p>
            <div className="search-grid">
              {searchPending.cards.map((c) => {
                const isCreature = CARDS[c.cardId].type === 'creature';
                return (
                  <div key={c.id} className="search-item">
                    {/* カードをタップすると、右側に詳細が出る */}
                    <div
                      className={`search-card ${inspectCardId === c.cardId ? 'inspecting' : ''}`}
                      onClick={() => setInspectCardId(c.cardId)}
                    >
                      <CardFace cardId={c.cardId} />
                    </div>
                    <button
                      className="primary"
                      disabled={!isCreature}
                      onClick={() => send({ type: 'choose', instanceId: c.id })}
                    >
                      {isCreature ? '手札に加える' : '生物ではない'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 勝敗 */}
      {state.winner && (
        <div className="overlay">
          <div className="dialog">
            <h2>{state.winner === me ? '勝利！' : '敗北…'}</h2>
            <p>{state.winReason}</p>
            <p className="muted">再戦：{room.rematchVotes.length}/2</p>
            <button
              className="primary"
              onClick={() => socket.emit('rematch', (r: { ok: boolean; error?: string }) => { if (!r.ok) onError(r.error ?? ''); })}
            >
              再戦する
            </button>
            <button onClick={onLeave}>ロビーへ戻る</button>
          </div>
        </div>
      )}

      {!room.opponentJoined && (
        <div className="overlay">
          <div className="dialog"><p>相手の参加を待っています</p></div>
        </div>
      )}
    </div>
  );
}

// ---------------- 陣地（片側）----------------
/** 片側の陣地：左に山札・漂流域、中央に資源と生物、右に生息地とテリトリー（イメージ図どおり） */
function Side(props: {
  p: Player;
  state: GameState;
  side: 'foe' | 'mine';
  own?: boolean;
  slotTargetable: (f: FieldCard) => boolean;
  slotSelected?: (f: FieldCard) => boolean;
  onSlot: (f: FieldCard, e: ReactMouseEvent<HTMLElement>) => void;
  habTarget?: boolean;
  onHab?: () => void;
  onDrift?: () => void;
  driftTarget?: boolean;
  onDeck?: () => void;
  deckTarget?: boolean;
  shatter?: { idx: number; key: number } | null;
  resourceClick?: () => void;
  fx?: (id: string) => TileFx;
}) {
  const { p, state, side, own } = props;
  const def = habitatDef(p.territories.length);
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => p.field.filter((f) => f.attachedTo === null)[i] ?? null);
  const readyRes = p.resources.filter((r) => r.ready).length;
  const terr = Array.from({ length: TERRITORY_MAX }, (_, i) => i < p.territories.length);

  return (
    <section className={`fside ${side}`}>
      <div className="fz fz-pile">
        <button
          className={`pile deck-pile ${props.deckTarget ? 'target' : ''}`}
          onClick={props.onDeck}
          disabled={!props.onDeck}
          title={props.onDeck ? 'タップしてカードを引く' : '山札'}
        >
          <span className="pile-count">{p.deck.length}</span>
          <span className="pile-label">{props.deckTarget ? 'タップでドロー' : '山札'}</span>
        </button>
        <button className={`pile drift-pile ${props.driftTarget ? 'target' : ''}`} onClick={props.onDrift} disabled={!props.onDrift}>
          <span className="pile-count">{p.drift.length}</span>
          <span className="pile-label">漂流域</span>
        </button>
      </div>

      <div className="fz fz-res">
        <span className="fz-label">資源 <b>{readyRes}</b>/{p.resources.length}</span>
        <div className="res-coins">
          {p.resources.slice(0, 12).map((r) => (
            <span key={r.id} className={`coin ${r.ready ? 'ready' : ''}`} />
          ))}
        </div>
      </div>

      <div className="fz fz-slots">
        {slots.map((f, i) =>
          f ? (
            <Tile
              key={f.id}
              card={f}
              state={state}
              own={own}
              targetable={props.slotTargetable(f)}
              selected={props.slotSelected?.(f)}
              attachments={p.field.filter((x) => x.attachedTo === f.id).length}
              fx={props.fx?.(f.id)}
              onClick={(e) => props.onSlot(f, e)}
            />
          ) : (
            <div key={`e${side}${i}`} className="empty-slot" aria-hidden="true" />
          ),
        )}
      </div>

      <button
        className={`fz fz-hab ${props.habTarget ? 'target' : ''}`}
        onClick={props.onHab}
        disabled={!props.onHab}
        title={props.habTarget ? 'タップして生息地を攻撃' : undefined}
      >
        <span className="hab-title">{HABITAT_NAME(p)}</span>
        <span className="hab-owner">{p.name}</span>
        <span className="hab-def">DEF {def}</span>
        <span className="muted">テリトリー {p.territories.length}</span>
      </button>

      <div className="fz fz-terr">
        {terr.map((filled, i) => {
          // 割れた直後のテリトリー：ヒビが入り、破片が飛び散る
          if (!filled && props.shatter && props.shatter.idx === i) {
            return (
              <div key={`shatter${props.shatter.key}`} className="terr-card shatter">
                <img src="/card-back.jpg" alt="" draggable={false} />
                {Array.from({ length: 8 }).map((_, k) => (
                  <span key={k} className="shard" style={{ '--sx': `${Math.cos(k) * 46}px`, '--sy': `${-30 + (k % 3) * 22}px`, '--sr': `${k * 61}deg` } as CSSProperties} />
                ))}
              </div>
            );
          }
          return filled ? (
            <div key={i} className="terr-card"><img src="/card-back.jpg" alt="" draggable={false} /></div>
          ) : (
            <div key={i} className="terr-empty" />
          );
        })}
      </div>
    </section>
  );
}

function HABITAT_NAME(p: Player) {
  return p.faction === 'sea' ? '海' : '川';
}

function Pile({ label, count }: { label: string; count: number }) {
  return (
    <div className="pile">
      <span className="pile-count">{count}</span>
      <span className="pile-label">{label}</span>
    </div>
  );
}

// ---------------- 部品 ----------------
function PhaseMessage({ state, me }: { state: GameState; me: PlayerId }) {
  if (state.winner) return <span>{state.winReason}</span>;
  if (state.pending && state.pending.player !== me) return <span>相手が山札から生物を選んでいます</span>;
  if (state.phase === 'counter') return <span>相手の攻撃中…</span>;
  if (state.active !== me) return <span>相手のターンです。待っています</span>;
  if (state.step === 'draw') return <span><b>ドローステップ：</b>画面の左の山札をタップしてカードを引きましょう</span>;
  if (state.step === 'resource') return <span><b>資源ステップ：</b>手札から資源を1枚置けます（1ターン1枚・任意）</span>;
  return <span><b>行動ステップ：</b>生物を出す・環境を使う・攻撃できます。終わったら「ターン終了」</span>;
}

/** カードの絵（public/cards/<カードID>.jpg）。画像がなければ文字の絵にする。 */
function CardArt({ cardId, className }: { cardId: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const m = CARDS[cardId];
  if (failed) {
    return <div className={className} aria-hidden="true">{m.name.charAt(0)}</div>;
  }
  return (
    <div className={`${className} has-img`} aria-hidden="true">
      <img src={`/cards/${cardId}.jpg`} alt="" draggable={false} onError={() => setFailed(true)} />
    </div>
  );
}

function CardFace({ cardId, atk }: { cardId: string; atk?: number }) {
  if (cardId === HIDDEN_CARD_ID) {
    // 裏面は全カード共通（スリーブの選択に従う）
    return (
      <div className="face back">
        <img src="/card-back.jpg" alt="" draggable={false} />
      </div>
    );
  }
  const m = CARDS[cardId];
  return (
    <div className={`face ${m.faction}`}>
      <div className="face-head">
        <span className="cost">{m.cost}</span>
        <span className="face-name">{m.name}</span>
      </div>
      <CardArt cardId={cardId} className="face-art" />
      <div className="face-foot">
        <span className="face-type">{m.type === 'creature' ? (m.size ? sizeLabel(m.size) : '') : m.type === 'environment' ? '環境' : '迎撃'}</span>
        {m.baseAtk !== undefined && <span className="face-atk">{atk ?? m.baseAtk}</span>}
      </div>
    </div>
  );
}

function sizeLabel(s: string) {
  return s === 'large' ? '大型' : s === 'medium' ? '中型' : '小型';
}

/** 生物の枠に出す演出（出た直後・攻撃する・攻撃を受ける） */
interface TileFx {
  fresh?: 'play';
  attacking?: boolean;
  hit?: boolean;
}

function Tile(props: {
  card: FieldCard;
  state: GameState;
  own?: boolean;
  selected?: boolean;
  targetable?: boolean;
  attachments?: number;
  fx?: TileFx;
  onClick: (e: ReactMouseEvent<HTMLElement>) => void;
}) {
  const { card, state, own, selected, targetable, onClick, fx } = props;
  const m = CARDS[card.cardId];
  const atk = currentAtk(state, card);
  const debuffed = card.mods.reduce((s, x) => s + x.amount, 0) < 0;
  return (
    <div
      className={`tile ${m.faction} ${card.ready || card.enteredTurn === state.turn ? '' : 'tapped'} ${selected ? 'selected' : ''} ${targetable ? 'target' : ''} ${own ? 'own' : 'foe'} ${fx?.fresh === 'play' ? 'play-in' : ''} ${fx?.attacking ? (own ? 'atk-own' : 'atk-foe') : ''} ${fx?.hit ? 'hit' : ''}`}
      onClick={onClick}
      title={m.name}
    >
      {/* 手札と同じ表示（絵・名前・コスト・現在のATK）。装備・弱体は右上の印で示す */}
      <CardFace cardId={card.cardId} atk={atk} />
      {((props.attachments ?? 0) > 0 || debuffed) && (
        <div className="tile-badges">
          {(props.attachments ?? 0) > 0 && <span>装備{props.attachments}</span>}
          {debuffed && <span className="bad">弱体</span>}
        </div>
      )}
    </div>
  );
}

function CardDetail({ cardId }: { cardId: string }) {
  const m = CARDS[cardId];
  return (
    <div className={`detail-card ${m.faction}`}>
      <CardArt cardId={cardId} className="detail-art" />
      <div className="detail-title">{m.name}</div>
      <div className="muted">{m.reading}</div>
      <div className="muted">
        {m.type === 'creature' ? m.taxonomy ?? '' : m.type === 'environment' ? '環境カード' : '迎撃カード'}
      </div>
      <div>コスト {m.cost}{m.baseAtk !== undefined ? ` ／ ATK ${m.baseAtk}` : ''}</div>
      {m.abilities.map((a) => (
        <div key={a.name} className="ability">
          <b>《{a.name}》</b> {a.text}
        </div>
      ))}
      <div className="flavor">{m.flavor}</div>
    </div>
  );
}
