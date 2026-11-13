// カードのコレクション（持っている枚数）とデッキを、この端末に保存する。
// 最初は、基本デッキに入っているカードだけを、デッキと同じ枚数持っている状態から始まる。
// パックを開けると、カードが増える。
import { CARDS, DECK_LISTS, HIDDEN_CARD_ID } from '../shared/cards';
import type { Faction } from '../shared/types';

export interface Deck {
  id: string;
  name: string;
  faction: Faction;
  cards: string[];
}
export type Collection = Record<string, number>;

export const DECK_SIZE = 30;
export const MAX_COPIES = 3;
export const PACK_SIZE = 5;
export const ALL_CARD_IDS = Object.keys(CARDS).filter((id) => id !== HIDDEN_CARD_ID);

// v2：最初の持ち物を「基本デッキのカードだけ」に変えたので、キーも新しくしている
const COL_KEY = 'aqua-collection-v2';
const DECK_KEY = 'aqua-decks-v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できなくても遊べる */
  }
}

export function loadCollection(): Collection {
  const saved = read<Collection>(COL_KEY);
  if (saved) return saved;
  // 基本デッキに入っている枚数だけ持つ（デッキに入っていないカードは持たない）
  const c: Collection = {};
  for (const f of ['sea', 'river'] as Faction[]) {
    for (const [id, n] of Object.entries(DECK_LISTS[f])) c[id] = (c[id] ?? 0) + n;
  }
  write(COL_KEY, c);
  return c;
}
export function saveCollection(c: Collection) {
  write(COL_KEY, c);
}

export function loadDecks(): Deck[] {
  const saved = read<Deck[]>(DECK_KEY);
  if (saved && saved.length > 0) return saved;
  const starter: Deck[] = (['sea', 'river'] as Faction[]).map((f) => ({
    id: `starter-${f}`,
    name: f === 'sea' ? '海デッキ（基本）' : '川デッキ（基本）',
    faction: f,
    cards: Object.entries(DECK_LISTS[f]).flatMap(([id, n]) => Array.from({ length: n }, () => id)),
  }));
  write(DECK_KEY, starter);
  return starter;
}
export function saveDecks(decks: Deck[]) {
  write(DECK_KEY, decks);
}

/** パックを1つ開ける（5枚・ランダム）。コレクションに加えて、出たカードを返す。 */
export function openPack(c: Collection): string[] {
  const got: string[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    got.push(ALL_CARD_IDS[Math.floor(Math.random() * ALL_CARD_IDS.length)]);
  }
  for (const id of got) c[id] = (c[id] ?? 0) + 1;
  saveCollection(c);
  return got;
}
