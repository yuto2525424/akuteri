import type { CardMaster, Faction } from './types';

export const HIDDEN_CARD_ID = 'HIDDEN';

export interface HabitatMaster {
  faction: Faction;
  name: string;
}

export const HABITATS: Record<Faction, HabitatMaster> = {
  sea: { faction: 'sea', name: '海' },
  river: { faction: 'river', name: '川' },
};

const c = (m: CardMaster): [string, CardMaster] => [m.id, m];

export const CARDS: Record<string, CardMaster> = Object.fromEntries([
  // ---------- 海 生物 ----------
  c({
    id: 'SEA-001', name: 'ホホジロザメ', reading: 'ほほじろざめ', faction: 'sea', type: 'creature',
    size: 'large', taxonomy: '大型生物／サメ／軟骨魚類', cost: 8, baseAtk: 8000, keywords: ['haste'],
    abilities: [
      { name: '嗅覚', text: '自分の漂流域に生物カードが5枚以上あるなら、この生物を手札からコストを支払わずに場に出してよい。' },
      { name: '急襲', text: 'この生物は【速攻】を持つ。' },
    ],
    flavor: '鋭い嗅覚で獲物を探し、時には深い場所から高速で接近して一気に襲いかかります。',
  }),
  c({
    id: 'SEA-002', name: 'アカシュモクザメ', reading: 'あかしゅもくざめ', faction: 'sea', type: 'creature',
    size: 'large', taxonomy: '大型生物／サメ／軟骨魚類', cost: 6, baseAtk: 5000, keywords: [],
    conditionalStrong: ['small', 'medium'],
    abilities: [{ name: '電気感覚', text: 'この生物は「小型生物」「中型生物」に対して【強襲】を持つ。' }],
    flavor: '頭部にあるロレンチーニ器官で生物が発する微弱な電気を感じ取り、砂に隠れた獲物を探すことができます。',
  }),
  c({
    id: 'SEA-003', name: 'ウツボ', reading: 'うつぼ', faction: 'sea', type: 'creature',
    size: 'medium', taxonomy: '中型生物／硬骨魚類', cost: 5, baseAtk: 5000, keywords: ['hide'],
    abilities: [{ name: '岩穴', text: 'この生物は【潜伏】を持つ。' }],
    flavor: '岩の隙間やサンゴ礁の穴に身を潜め、そこから獲物を待ち伏せして捕らえます。',
  }),
  c({
    id: 'SEA-004', name: 'オニダルマオコゼ', reading: 'おにだるまおこぜ', faction: 'sea', type: 'creature',
    size: 'medium', taxonomy: '中型生物／硬骨魚類', cost: 4, baseAtk: 3000, keywords: [],
    abilities: [{
      name: '毒棘',
      text: 'この生物が攻撃された戦闘後、攻撃した生物1体を選び、その生物のATK－3000。この効果は次の相手ターン開始時まで続く。連携攻撃の場合、攻撃に参加した生物の中から1体を選ぶ。',
    }],
    flavor: '背びれの鋭い棘に強い毒をもち、踏まれたり襲われたりするとその毒で身を守ります。',
  }),
  c({
    id: 'SEA-005', name: 'ハリセンボン', reading: 'はりせんぼん', faction: 'sea', type: 'creature',
    size: 'medium', taxonomy: '中型生物／硬骨魚類', cost: 3, baseAtk: 3000, keywords: ['guard'],
    noHabitatAttack: true,
    abilities: [
      { name: '威嚇', text: '【かばう】を持つ。' },
      { name: '膨張', text: '攻撃された戦闘中ATK＋2000。' },
      { name: '制限', text: 'この生物は相手の生息地を攻撃できない。' },
    ],
    flavor: '危険を感じると水や空気を吸い込んで体を大きくふくらませ、全身の棘を立てて敵を威嚇します。',
  }),
  c({
    id: 'SEA-006', name: 'ホンソメワケベラ', reading: 'ほんそめわけべら', faction: 'sea', type: 'creature',
    size: 'small', taxonomy: '小型生物／硬骨魚類', cost: 3, baseAtk: 1000, keywords: [],
    abilities: [{ name: 'クリーニング', text: '自分のターンに1回、この生物を行動済みにして、自分の山札の一番下のカード1枚を行動済みで資源へ置く。' }],
    flavor: 'ほかの魚の体表や口の中についた寄生虫などを食べる「掃除魚」として知られています。',
  }),
  c({
    id: 'SEA-007', name: 'コバンザメ', reading: 'こばんざめ', faction: 'sea', type: 'creature',
    size: 'medium', taxonomy: '中型生物／硬骨魚類', cost: 3, baseAtk: 1000, keywords: [],
    abilities: [{
      name: '吸着',
      text: '自分の「大型生物」1体に装備できる。装備中、装備先のATK＋1000。同じ生物に複数枚装備できる。装備先とこの生物は、場の上限では1体として数える。装備先が場を離れた時、この生物を漂流域へ置く。',
    }],
    flavor: '頭の吸盤でサメやウミガメなどに吸着し、移動しながら餌のおこぼれを利用します。',
  }),
  c({
    id: 'SEA-008', name: 'トビウオ', reading: 'とびうお', faction: 'sea', type: 'creature',
    size: 'small', taxonomy: '小型生物／硬骨魚類', cost: 2, baseAtk: 1500, keywords: ['haste'],
    abilities: [{ name: '滑空', text: 'この生物は【速攻】を持つ。この生物の攻撃後、この生物が場にいるなら手札に戻す。' }],
    flavor: '大きな胸びれを広げて海面上を滑空し、外敵から逃れることがあります。',
  }),
  c({
    id: 'SEA-009', name: 'カタクチイワシ', reading: 'かたくちいわし', faction: 'sea', type: 'creature',
    size: 'small', taxonomy: '小型生物／硬骨魚類', cost: 2, baseAtk: 1500, keywords: [],
    abilities: [{ name: '群泳', text: '自分の場にいる他の「カタクチイワシ」1体につき、この生物のATK＋1000。' }],
    flavor: '大きな群れをつくって泳ぎ、外敵から身を守ることがあります。',
  }),
  // ---------- 海 迎撃 ----------
  c({
    id: 'SEA-C01', name: '混乱効果', reading: 'こんらんこうか', faction: 'sea', type: 'counter', cost: 0, keywords: [],
    abilities: [{ name: '混乱効果', text: '自分の場に生物が2体以上いるなら使用できる。自分の生物1体を選び、攻撃対象をその選んだ生物に変更する。' }],
    flavor: '群れで動くことで捕食者が狙う相手を見失いやすくなる現象です。',
  }),
  c({
    id: 'SEA-C02', name: '逃避行動', reading: 'とうひこうどう', faction: 'sea', type: 'counter', cost: 0, keywords: [],
    abilities: [{ name: '逃避行動', text: 'その攻撃を無効にする。' }],
    flavor: '外敵から逃れるために急加速や方向転換などを行う行動です。',
  }),
  // ---------- 海 環境 ----------
  c({
    id: 'SEA-E01', name: '養殖場', reading: 'ようしょくじょう', faction: 'sea', type: 'environment', cost: 1, keywords: [],
    abilities: [{ name: '養殖場', text: '自分の山札の上から3枚を見る。その中から生物カード1枚を選び、相手に見せて手札に加える。残りのカードを山札の一番下に置く。' }],
    flavor: '魚や貝などの水生生物を人の管理下で育てる施設や水域のことです。',
  }),
  c({
    id: 'SEA-E02', name: '回遊路', reading: 'かいゆうろ', faction: 'sea', type: 'environment', cost: 3, keywords: [],
    abilities: [{ name: '回遊路', text: '自分の漂流域からATK3000以下の生物1体を場に出す。追加で資源4を支払った場合、ATKに関係なく生物1体を場に出せる。' }],
    flavor: '魚などが成長・産卵・餌を求めて、一定の経路を長距離移動することです。',
  }),
  c({
    id: 'SEA-E03', name: '濁り', reading: 'にごり', faction: 'sea', type: 'environment', cost: 2, keywords: [],
    abilities: [{ name: '濁り', text: '相手生物1体を選ぶ。その生物のATK－1000。この効果は相手のターン終了時まで続く。' }],
    flavor: '水の濁りは、泥や微粒子が水中に増えることで起こり、魚の視界を悪くすることがあります。',
  }),
  // ---------- 川 生物 ----------
  c({
    id: 'RIVER-001', name: 'ドラド', reading: 'どらど', faction: 'river', type: 'creature',
    size: 'large', taxonomy: '大型生物／硬骨魚類', cost: 7, baseAtk: 8000, keywords: [],
    abilities: [
      { name: '猛追', text: 'この生物が攻撃する時、攻撃対象は変更されない。' },
      { name: '追撃', text: 'この生物が相手生物を撃破した時、1ターンに1回、この生物を行動可能にする。ターン終了時、この生物を行動済みにする。' },
    ],
    flavor: '高い遊泳力で魚を追いかけ、鋭い歯で素早く捕らえる大型の肉食魚です。',
  }),
  c({
    id: 'RIVER-002', name: 'ピラルク', reading: 'ぴらるく', faction: 'river', type: 'creature',
    size: 'large', taxonomy: '大型生物／硬骨魚類', cost: 6, baseAtk: 5000, keywords: [],
    conditionalStrong: ['small'],
    abilities: [
      { name: '表層捕食', text: 'この生物は「小型生物」に対してのみ【強襲】を持つ。' },
      { name: '吸引捕食', text: 'この生物が「小型生物」を攻撃する時、相手はその攻撃に迎撃カードを使用できない。' },
    ],
    flavor: '水面近くの小魚などを狙い、大きな口を素早く開いて吸い込むように捕食します。',
  }),
  c({
    id: 'RIVER-003', name: 'アリゲーターガー', reading: 'ありげーたーがー', faction: 'river', type: 'creature',
    size: 'large', taxonomy: '大型生物／硬骨魚類', cost: 5, baseAtk: 5000, keywords: [],
    abilities: [{ name: 'ガノイン鱗', text: 'この生物が単体で戦闘する時、その戦闘中、相手生物のATK－1000。連携攻撃では発動しない。' }],
    flavor: '体を覆う硬い「ガノイン鱗」は、非常に硬く丈夫な鎧のような構造をしています。',
  }),
  c({
    id: 'RIVER-004', name: 'シルバーアロワナ', reading: 'しるばーあろわな', faction: 'river', type: 'creature',
    size: 'medium', taxonomy: '中型生物／硬骨魚類', cost: 4, baseAtk: 4000, keywords: [],
    abilities: [{ name: '口内保育', text: '自分のターンに1回、資源1枚を行動済みにしてもよい。そうした場合、自分の「小型生物」1体を手札に戻す。' }],
    flavor: 'オスは卵を口の中で守り、ふ化した仔魚もしばらく口内で保護します。',
  }),
  c({
    id: 'RIVER-005', name: 'デンキウナギ', reading: 'でんきうなぎ', faction: 'river', type: 'creature',
    size: 'medium', taxonomy: '中型生物／硬骨魚類', cost: 3, baseAtk: 3000, keywords: ['guard'],
    noHabitatAttack: true,
    abilities: [
      { name: '防衛放電', text: 'この生物は【かばう】を持つ。' },
      { name: '反撃放電', text: 'この生物が撃破された時、相手生物1体を選び、そのターン終了時までATK－2000。' },
      { name: '制限', text: 'この生物は相手の生息地を攻撃できない。' },
    ],
    flavor: '発電器官で強い電気を生み出し、獲物をしびれさせたり外敵から身を守ったりします。',
  }),
  c({
    id: 'RIVER-006', name: 'ドジョウ', reading: 'どじょう', faction: 'river', type: 'creature',
    size: 'small', taxonomy: '小型生物／硬骨魚類', cost: 3, baseAtk: 2000, keywords: ['hide'],
    abilities: [{ name: '潜泥', text: 'この生物は【潜伏】を持つ。' }],
    flavor: '危険を感じると泥の中に潜り、体を隠して身を守ることがあります。',
  }),
  c({
    id: 'RIVER-007', name: 'グッピー', reading: 'ぐっぴー', faction: 'river', type: 'creature',
    size: 'small', taxonomy: '小型生物／硬骨魚類', cost: 2, baseAtk: 1000, keywords: [],
    abilities: [{ name: '栄養循環', text: 'この生物が場に出た時、自分の山札の一番下のカード1枚を行動済みで資源へ置く。' }],
    flavor: '餌から得た栄養を排泄物として水中に戻し、水域の栄養循環にも関わっています。',
  }),
  c({
    id: 'RIVER-008', name: 'ピラニア・ナッテリー', reading: 'ぴらにあ・なってりー', faction: 'river', type: 'creature',
    size: 'small', taxonomy: '小型生物／硬骨魚類', cost: 2, baseAtk: 1500, keywords: [],
    abilities: [{ name: '群攻', text: 'この生物が連携攻撃に参加している間、この生物のATK＋1000。' }],
    flavor: '鋭い三角形の歯をもち、餌のある場所では群れで集まり、一斉に食べることがあります。',
  }),
  c({
    id: 'RIVER-009', name: 'ゼブラフィッシュ', reading: 'ぜぶらふぃっしゅ', faction: 'river', type: 'creature',
    size: 'small', taxonomy: '小型生物／硬骨魚類', cost: 2, baseAtk: 1000, keywords: [],
    abilities: [{ name: '生命継承', text: 'この生物が撃破された時、カードを1枚引く。' }],
    flavor: '傷ついたヒレや心臓などを再生する高い能力をもち、再生研究にも広く使われています。',
  }),
  // ---------- 川 迎撃 ----------
  c({
    id: 'RIVER-C01', name: '走流性', reading: 'そうりゅうせい', faction: 'river', type: 'counter', cost: 0, keywords: [],
    abilities: [{ name: '走流性', text: '相手の生物が自分の生息地を単体攻撃した時、その攻撃生物のコストが5以下なら、その生物を持ち主の手札に戻す。攻撃は終了する。' }],
    flavor: '魚が水の流れを感じ取り、流れに対して一定の方向へ泳ごうとする性質です。',
  }),
  c({
    id: 'RIVER-C02', name: '急流', reading: 'きゅうりゅう', faction: 'river', type: 'counter', cost: 0, keywords: [],
    abilities: [{ name: '急流', text: 'その攻撃を無効にする。' }],
    flavor: '急流では強い水流によって魚の進路が乱れ、思い通りに泳ぎにくくなることがあります。',
  }),
  // ---------- 川 環境 ----------
  c({
    id: 'RIVER-E01', name: '生物相', reading: 'せいぶつそう', faction: 'river', type: 'environment', cost: 1, keywords: [],
    abilities: [{ name: '生物相', text: '自分の山札の上から3枚を見る。その中から生物カード1枚を選び、相手に見せて手札に加える。残りを山札の一番下に置く。' }],
    flavor: 'ある地域や環境に生息する生物の種類全体をまとめて表す言葉です。',
  }),
  c({
    id: 'RIVER-E02', name: '増水', reading: 'ぞうすい', faction: 'river', type: 'environment', cost: 2, keywords: [],
    abilities: [{ name: '増水', text: '次の相手ターン終了時まで、自分のコスト2以下の生物は攻撃の対象にならない。' }],
    flavor: '増水すると浅瀬や冠水域が広がり、小型魚にとって外敵から逃れやすい場所が増えることがあります。',
  }),
  c({
    id: 'RIVER-E03', name: '遡上', reading: 'そじょう', faction: 'river', type: 'environment', cost: 3, keywords: [],
    abilities: [{ name: '遡上', text: '自分の漂流域からATK3000以下の生物1体を場に出す。追加でコスト4を支払った場合、ATKに関係なく生物1体を場に出せる。' }],
    flavor: '遡上とは、魚が産卵などのために川の流れに逆らって上流へ移動する行動です。',
  }),
]) as Record<string, CardMaster>;

/** デッキ構成（カードID → 枚数）。合計はどちらも30枚。 */
export const DECK_LISTS: Record<Faction, Record<string, number>> = {
  sea: {
    'SEA-001': 1, 'SEA-002': 1, 'SEA-003': 2, 'SEA-004': 2, 'SEA-005': 3,
    'SEA-006': 2, 'SEA-007': 2, 'SEA-008': 2, 'SEA-009': 3,
    'SEA-C01': 2, 'SEA-C02': 3,
    'SEA-E01': 3, 'SEA-E02': 2, 'SEA-E03': 2,
  },
  river: {
    'RIVER-001': 1, 'RIVER-002': 1, 'RIVER-003': 2, 'RIVER-004': 2, 'RIVER-005': 3,
    'RIVER-006': 2, 'RIVER-007': 2, 'RIVER-008': 3, 'RIVER-009': 2,
    'RIVER-C01': 2, 'RIVER-C02': 3,
    'RIVER-E01': 3, 'RIVER-E02': 2, 'RIVER-E03': 2,
  },
};

/** 送られてきたデッキが正しいか調べる（30枚・同じカードは3枚まで・その派閥のカードだけ） */
export function validateDeck(faction: Faction, ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length !== 30) return null;
  const count: Record<string, number> = {};
  for (const id of ids) {
    if (typeof id !== 'string' || !CARDS[id] || CARDS[id].faction !== faction) return null;
    count[id] = (count[id] ?? 0) + 1;
    if (count[id] > 3) return null;
  }
  return ids as string[];
}

export function buildDeckIds(faction: Faction): string[] {
  const ids: string[] = [];
  for (const [cardId, count] of Object.entries(DECK_LISTS[faction])) {
    for (let i = 0; i < count; i++) ids.push(cardId);
  }
  return ids;
}
