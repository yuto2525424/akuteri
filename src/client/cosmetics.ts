// スリーブ（カードの裏面）とプレイマット（盤面）の選択。ブラウザに保存し、ゲーム内でも変えられる。

// 公式のスリーブ・マットのみ採用する（ほかのデザインは使わない）
export type SleeveId = 'ocean';
export type MatId = 'sea';

export const SLEEVES: { id: SleeveId; label: string }[] = [{ id: 'ocean', label: 'AQUA（公式）' }];

export const MATS: { id: MatId; label: string }[] = [{ id: 'sea', label: '海（公式）' }];

export interface Cosmetics {
  sleeve: SleeveId;
  mat: MatId;
}

const KEY = 'aqua-territory-cosmetics';
const DEFAULT: Cosmetics = { sleeve: 'ocean', mat: 'sea' };

export function loadCosmetics(): Cosmetics {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const v = JSON.parse(raw) as Partial<Cosmetics>;
    return {
      sleeve: SLEEVES.some((s) => s.id === v.sleeve) ? (v.sleeve as SleeveId) : DEFAULT.sleeve,
      mat: MATS.some((m) => m.id === v.mat) ? (v.mat as MatId) : DEFAULT.mat,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveCosmetics(c: Cosmetics) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 保存できなくても遊べる */
  }
}

/** 訪問者番号（個人情報ではないランダムな文字列）。同じブラウザでは同じ番号になる。 */
export function getPlayerId(): string {
  const KEY_ID = 'aqua-territory-player-id';
  try {
    const saved = localStorage.getItem(KEY_ID);
    if (saved && /^[a-zA-Z0-9_-]{8,64}$/.test(saved)) return saved;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY_ID, id);
    return id;
  } catch {
    return `tmp${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`.slice(0, 40);
  }
}
