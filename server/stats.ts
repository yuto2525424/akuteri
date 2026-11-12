// 訪問者数・プレイ人数の記録。
// 個人情報は保存しない。ブラウザごとにランダムな番号（訪問者ID）を付けて、重複を数えるだけ。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data', 'stats.json');

interface StatsData {
  /** ページを開いた回数 */
  pageViews: number;
  /** ページを開いた人（訪問者ID）の数 */
  visitors: string[];
  /** 対戦を始めた回数 */
  gamesStarted: number;
  /** 遊んだ人（プレイヤーID）の数 */
  players: string[];
  /** CPU対戦・対人対戦の内訳 */
  gamesByMode: { cpu: number; human: number };
}

const empty = (): StatsData => ({
  pageViews: 0,
  visitors: [],
  gamesStarted: 0,
  players: [],
  gamesByMode: { cpu: 0, human: 0 },
});

let data: StatsData = load();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): StatsData {
  try {
    if (existsSync(FILE)) return { ...empty(), ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch {
    /* 壊れていたら空から数え直す */
  }
  return empty();
}

function save() {
  // 連続した更新をまとめて書き込む
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      /* 書けなくてもゲームは続ける */
    }
  }, 500);
}

const cleanId = (v: unknown) => (typeof v === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(v) ? v : null);

export function recordPageView(visitorId: unknown) {
  data.pageViews += 1;
  const id = cleanId(visitorId);
  if (id && !data.visitors.includes(id)) data.visitors.push(id);
  save();
}

/** 対戦が始まったときに呼ぶ。参加した人（プレイヤーID）をすべて数える。 */
export function recordGame(playerIds: unknown[], mode: 'cpu' | 'human') {
  data.gamesStarted += 1;
  data.gamesByMode[mode] += 1;
  for (const raw of playerIds) {
    const id = cleanId(raw);
    if (id && !data.players.includes(id)) data.players.push(id);
  }
  save();
}

export function summary() {
  return {
    訪問者数: data.visitors.length,
    ページ表示回数: data.pageViews,
    遊んだ人数: data.players.length,
    対戦開始回数: data.gamesStarted,
    CPU対戦: data.gamesByMode.cpu,
    対人対戦: data.gamesByMode.human,
  };
}
