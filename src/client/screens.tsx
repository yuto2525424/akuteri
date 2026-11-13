// ロビーから開く画面：デッキ編成・パックを開ける・チュートリアル
import { useState } from 'react';
import { CARDS } from '../shared/cards';
import type { Faction } from '../shared/types';
import {
  ALL_CARD_IDS,
  DECK_SIZE,
  MAX_COPIES,
  loadCollection,
  loadDecks,
  openPack,
  saveDecks,
  type Collection,
  type Deck,
} from './collection';

const FACTION_LABEL: Record<Faction, string> = { sea: '海', river: '川' };

function CardPic({ id, className }: { id: string; className?: string }) {
  return <img className={className ?? 'card-pic'} src={`/cards-full/${id}.jpg`} alt={CARDS[id]?.name ?? ''} draggable={false} />;
}

// ---------------- デッキ編成 ----------------
export function DeckScreen({ onBack }: { onBack: () => void }) {
  const [col] = useState<Collection>(() => loadCollection());
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks());
  const [selId, setSelId] = useState<string>(() => loadDecks()[0]?.id ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const deck = decks.find((d) => d.id === selId) ?? null;

  const update = (next: Deck[]) => {
    setDecks(next);
    saveDecks(next);
  };
  const setCards = (cards: string[]) => {
    if (!deck) return;
    update(decks.map((d) => (d.id === deck.id ? { ...d, cards } : d)));
  };
  const countIn = (cards: string[], id: string) => cards.filter((x) => x === id).length;

  const add = (id: string) => {
    if (!deck) return;
    if (CARDS[id].faction !== deck.faction) return setMsg(`${FACTION_LABEL[deck.faction]}デッキのカードだけ入れられます`);
    if (deck.cards.length >= DECK_SIZE) return setMsg(`デッキは${DECK_SIZE}枚までです`);
    const used = countIn(deck.cards, id);
    if (used >= MAX_COPIES) return setMsg(`同じカードは${MAX_COPIES}枚までです`);
    if (used >= (col[id] ?? 0)) return setMsg('持っている枚数より多くは入れられません（パックで増やせます）');
    setMsg(null);
    setCards([...deck.cards, id]);
  };
  const remove = (id: string) => {
    if (!deck) return;
    const i = deck.cards.indexOf(id);
    if (i < 0) return;
    const next = [...deck.cards];
    next.splice(i, 1);
    setMsg(null);
    setCards(next);
  };
  const newDeck = (faction: Faction) => {
    const d: Deck = { id: `d${Date.now()}`, name: `${FACTION_LABEL[faction]}デッキ ${decks.length + 1}`, faction, cards: [] };
    update([...decks, d]);
    setSelId(d.id);
  };
  const removeDeck = () => {
    if (!deck) return;
    const next = decks.filter((d) => d.id !== deck.id);
    update(next);
    setSelId(next[0]?.id ?? '');
  };

  const ownedList = deck ? ALL_CARD_IDS.filter((id) => CARDS[id].faction === deck.faction) : [];
  const deckIds = deck ? [...new Set(deck.cards)] : [];

  return (
    <div className="lobby sub-screen">
      <div className="panel wide">
        <div className="sub-head">
          <button onClick={onBack}>← もどる</button>
          <strong>デッキ編成</strong>
          <span className="muted">デッキは{DECK_SIZE}枚・同じカードは{MAX_COPIES}枚まで</span>
        </div>

        <div className="deck-select">
          {decks.map((d) => (
            <button key={d.id} className={d.id === selId ? 'selected' : ''} onClick={() => { setSelId(d.id); setMsg(null); }}>
              {d.name}（{d.cards.length}/{DECK_SIZE}）
            </button>
          ))}
          <button onClick={() => newDeck('sea')}>＋海デッキ</button>
          <button onClick={() => newDeck('river')}>＋川デッキ</button>
        </div>

        {deck ? (
          <div className="deck-body">
            <div className="deck-col">
              <div className="muted">持っているカード（タップで入れる）</div>
              <div className="card-grid">
                {ownedList.map((id) => {
                  const have = col[id] ?? 0;
                  const used = countIn(deck.cards, id);
                  return (
                    <button key={id} className="card-cell" onClick={() => add(id)} disabled={have === 0}>
                      <CardPic id={id} />
                      <span className="cell-count">{used}/{have}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="deck-col">
              <div className="muted">このデッキ（タップで外す）：{deck.cards.length}/{DECK_SIZE}</div>
              <div className="card-grid">
                {deckIds.map((id) => (
                  <button key={id} className="card-cell" onClick={() => remove(id)}>
                    <CardPic id={id} />
                    <span className="cell-count">×{countIn(deck.cards, id)}</span>
                  </button>
                ))}
              </div>
              <div className="deck-actions">
                <input
                  value={deck.name}
                  maxLength={16}
                  onChange={(e) => update(decks.map((d) => (d.id === deck.id ? { ...d, name: e.target.value } : d)))}
                />
                <button onClick={removeDeck} disabled={decks.length <= 1}>このデッキを削除</button>
              </div>
              {deck.cards.length === DECK_SIZE ? (
                <p className="ok-msg">このデッキで対戦できます（ロビーで選べます）</p>
              ) : (
                <p className="muted">あと {DECK_SIZE - deck.cards.length} 枚で対戦できます</p>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">デッキがありません。「＋」で作ってください。</p>
        )}
        {msg && <p className="error">{msg}</p>}
      </div>
    </div>
  );
}

// ---------------- パックを開ける ----------------
export function PackScreen({ onBack }: { onBack: () => void }) {
  const [col, setCol] = useState<Collection>(() => loadCollection());
  const [got, setGot] = useState<string[] | null>(null);
  const [shown, setShown] = useState<boolean[]>([]);

  const open = () => {
    const c = { ...col };
    const cards = openPack(c);
    setCol(c);
    setGot(cards);
    setShown(cards.map(() => false));
  };
  const reveal = (i: number) => setShown((s) => s.map((v, k) => (k === i ? true : v)));
  const revealAll = () => setShown((s) => s.map(() => true));
  const allShown = shown.length > 0 && shown.every(Boolean);

  return (
    <div className="lobby sub-screen">
      <div className="panel">
        <div className="sub-head">
          <button onClick={onBack}>← もどる</button>
          <strong>パックを開ける</strong>
        </div>
        {!got ? (
          <>
            <p className="muted">パックには、カードが5枚入っています（海・川どちらも出ます）。</p>
            <button className="primary big" onClick={open}>パックを開ける</button>
          </>
        ) : (
          <>
            <div className="pack-row">
              {got.map((id, i) => (
                <button key={i} className={`pack-slot ${shown[i] ? 'open' : ''}`} onClick={() => reveal(i)}>
                  {shown[i] ? <CardPic id={id} className="card-pic pack-pic" /> : <img src="/card-back.jpg" alt="裏面" draggable={false} />}
                </button>
              ))}
            </div>
            {!allShown ? (
              <button onClick={revealAll}>全部めくる</button>
            ) : (
              <>
                <p className="ok-msg">コレクションに追加しました。</p>
                <button className="primary" onClick={open}>もう1パック開ける</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- チュートリアル ----------------
const TUTORIAL: { title: string; body: string; cards?: string[] }[] = [
  {
    title: 'ゲームの目的',
    body: '相手の生息地（テリトリー）を攻撃して、テリトリーを奪っていきます。テリトリーが0枚のときに、もう一度生息地への攻撃が成功すると勝ちです。',
  },
  {
    title: 'ターンの流れ',
    body: '①回復 → ②ドロー（山札をタップして1枚引く）→ ③資源（手札から1ターンに1枚まで、任意で置く）→ ④行動（生物を出す・攻撃する）→ ターン終了。',
  },
  {
    title: '生物を出す',
    body: '手札のカードを押すと、上に操作が出ます。「出す」で場に出ます。出した生物は、そのターンは攻撃できません（次のターンから攻撃できます）。',
    cards: ['SEA-009'],
  },
  {
    title: '攻撃する',
    body: '攻撃する生物を押して、相手の生物か生息地をタップします。攻撃は、相手の横向きの生物と、生息地にできます。攻撃の矢印で、どこを攻撃したかが分かります。',
  },
  {
    title: '迎撃',
    body: '攻撃を受けると、迎撃カードを使うか、このまま受けるかを選べます。「盤面を見る」で、場の様子を見てから決められます。',
    cards: ['SEA-C02'],
  },
  {
    title: '能力',
    body: 'カードの能力が発動すると、中央に「能力発動！」と、カードの絵と能力名が出ます。カードは押すと、詳しい内容が見られます。',
    cards: ['RIVER-005'],
  },
  {
    title: 'デッキとパック',
    body: 'デッキ編成で、持っているカードから30枚を選んでデッキを作れます。パックを開けると、カードが増えます。',
  },
];

export function TutorialScreen({ onBack }: { onBack: () => void }) {
  const [i, setI] = useState(0);
  const page = TUTORIAL[i];
  const last = i === TUTORIAL.length - 1;
  return (
    <div className="lobby sub-screen">
      <div className="panel">
        <div className="sub-head">
          <button onClick={onBack}>← もどる</button>
          <strong>チュートリアル</strong>
          <span className="muted">{i + 1} / {TUTORIAL.length}</span>
        </div>
        <h2 className="tut-title">{page.title}</h2>
        <p className="tut-body">{page.body}</p>
        {page.cards && (
          <div className="tut-cards">
            {page.cards.map((id) => (
              <CardPic key={id} id={id} className="card-pic tut-pic" />
            ))}
          </div>
        )}
        <div className="tut-nav">
          <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>前へ</button>
          {last ? (
            <button className="primary" onClick={onBack}>ロビーへ戻る</button>
          ) : (
            <button className="primary" onClick={() => setI((v) => v + 1)}>次へ</button>
          )}
        </div>
      </div>
    </div>
  );
}
