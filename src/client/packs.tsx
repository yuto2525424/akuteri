// パックを開ける：パックの上のギザギザを指でなぞると、むけてカードが5枚出てくる
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { CARDS } from '../shared/cards';
import { loadCollection, openPack, type Collection } from './collection';

type Phase = 'sealed' | 'tearing' | 'opened';

/** 無料のパックは、1日に1回まで（この端末の日付で判定。日付が変われば、また1回開けられる） */
const FREE_KEY = 'aqua-free-pack-day';
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function freeUsedToday(): boolean {
  try {
    return localStorage.getItem(FREE_KEY) === todayKey();
  } catch {
    return false;
  }
}

export function PackScreen({ onBack }: { onBack: () => void }) {
  const [col, setCol] = useState<Collection>(() => loadCollection());
  const [phase, setPhase] = useState<Phase>('sealed');
  const [got, setGot] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [drag, setDrag] = useState(0); // なぞった割合（0〜1）
  const [freeUsed, setFreeUsed] = useState<boolean>(() => freeUsedToday());
  const startX = useRef<number | null>(null);
  const packRef = useRef<HTMLDivElement | null>(null);

  const tear = () => {
    if (freeUsed) return;
    try {
      localStorage.setItem(FREE_KEY, todayKey());
    } catch {
      /* 保存できなくても開けられる */
    }
    setFreeUsed(true);
    const c = { ...col };
    const cards = openPack(c);
    setCol(c);
    setGot(cards);
    setFlipped(cards.map(() => false));
    setPhase('tearing');
    setTimeout(() => setPhase('opened'), 700);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'sealed' || freeUsed) return;
    startX.current = e.clientX;
    setDrag(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'sealed' || startX.current === null || !packRef.current) return;
    const w = packRef.current.getBoundingClientRect().width || 1;
    const p = Math.max(0, Math.min(1, (e.clientX - startX.current) / w));
    setDrag(p);
    if (p >= 0.8) {
      startX.current = null;
      tear();
    }
  };
  const onUp = () => {
    startX.current = null;
    if (phase === 'sealed') setDrag(0);
  };

  const flip = (i: number) => setFlipped((f) => f.map((v, k) => (k === i ? true : v)));
  const allFlipped = flipped.length > 0 && flipped.every(Boolean);

  return (
    <div className="lobby sub-screen">
      <div className="panel">
        <div className="sub-head">
          <button onClick={onBack}>← もどる</button>
          <strong>パックを開ける</strong>
        </div>

        {phase !== 'opened' && (
          <div className="pack-stage">
            <div
              ref={packRef}
              className={`pack-wrap ${phase === 'tearing' ? 'torn' : ''}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <div className="pack-top" style={{ transform: `translateX(${drag * 60}%) rotate(${drag * 8}deg)` }}>
                <span>アクテリ パック</span>
              </div>
              <div className="pack-body">
                <span className="pack-title">AQUA TERRITORY</span>
                <span className="pack-sub">カード5枚入り</span>
              </div>
              <div className="pack-tear-line" aria-hidden="true" />
            </div>
            {phase === 'sealed' && (
              <p className="muted">
                {freeUsed
                  ? '今日の無料パックは開けました。明日また、1回開けられます。'
                  : '今日の無料パックです（1日1回）。上のギザギザを、左から右へなぞって開けてください'}
              </p>
            )}
            {phase === 'sealed' && (
              <div className="shop-box">
                <strong>特別パック（追加課金）</strong>
                <p className="muted">準備中です。課金の設定をするまで、購入はできません。</p>
                <button disabled>特別パックを開ける（準備中）</button>
              </div>
            )}
          </div>
        )}

        {phase === 'opened' && (
          <>
            <div className="pack-row">
              {got.map((id, i) => (
                <button key={i} className="pack-slot" onClick={() => flip(i)} aria-label={`カード${i + 1}`}>
                  {flipped[i] ? (
                    <img className="pack-pic" src={`/cards-full/${id}.jpg`} alt={CARDS[id].name} draggable={false} />
                  ) : (
                    <img src="/card-back.jpg" alt="裏面" draggable={false} />
                  )}
                </button>
              ))}
            </div>
            {!allFlipped ? (
              <button onClick={() => setFlipped(got.map(() => true))}>全部めくる</button>
            ) : (
              <>
                <p className="ok-msg">{got.map((id) => CARDS[id].name).join('、')} を手に入れました。</p>
                <button
                  className="primary"
                  onClick={() => {
                    setPhase('sealed');
                    setDrag(0);
                  }}
                >
                  パックの画面に戻る
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
