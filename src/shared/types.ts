export type Faction = 'sea' | 'river';
export type CardType = 'creature' | 'environment' | 'counter';
export type Size = 'large' | 'medium' | 'small';
export type Keyword = 'haste' | 'hide' | 'strong' | 'guard';

export interface AbilityText {
  name: string;
  text: string;
}

export interface CardMaster {
  id: string;
  name: string;
  reading: string;
  faction: Faction;
  type: CardType;
  size?: Size;
  taxonomy?: string;
  cost: number;
  baseAtk?: number;
  keywords: Keyword[];
  /** 条件付きで【強襲】を得る対象サイズ（電気感覚・表層捕食） */
  conditionalStrong?: Size[];
  /** 生息地を攻撃できない */
  noHabitatAttack?: boolean;
  abilities: AbilityText[];
  flavor: string;
}

export type PlayerId = 'A' | 'B';

/** 効果が切れるタイミング */
export type Until = { kind: 'turn_start' | 'turn_end'; player: PlayerId };

export interface Mod {
  amount: number;
  until: Until;
}

export interface CardInstance {
  id: string;
  cardId: string;
  owner: PlayerId;
}

export interface FieldCard extends CardInstance {
  ready: boolean;
  enteredTurn: number;
  /** 装備中のコバンザメなど：装備先の生物ID */
  attachedTo: string | null;
  mods: Mod[];
  /** 1ターン1回の能力を使ったターン */
  abilityTurn: number;
  /** 追撃で行動可能になった場合、ターン終了時に行動済みにする */
  bonusTapAtEnd: boolean;
}

export interface ResourceCard extends CardInstance {
  ready: boolean;
}

export interface Protection {
  maxCost: number;
  until: Until;
}

export interface Player {
  id: PlayerId;
  name: string;
  faction: Faction;
  deck: CardInstance[];
  hand: CardInstance[];
  resources: ResourceCard[];
  field: FieldCard[];
  drift: CardInstance[];
  territories: CardInstance[];
  habitatCardId: string;
  protection: Protection | null;
  resourcePlacedTurn: number;
}

export type AttackTarget = { kind: 'habitat' } | { kind: 'creature'; id: string };

export interface Combat {
  attacker: PlayerId;
  attackerIds: string[];
  target: AttackTarget;
  redirected: boolean;
}

export interface PendingSearch {
  kind: 'search';
  player: PlayerId;
  cards: CardInstance[];
  source: string;
}

export interface LogEntry {
  turn: number;
  text: string;
}

export type Phase = 'main' | 'counter' | 'ended';

/** ターン内のステップ：ドロー（山札をタップ）→ 資源（1ターン1枚・任意）→ 行動 */
export type Step = 'draw' | 'resource' | 'action';

export interface GameState {
  id: string;
  turn: number;
  active: PlayerId;
  firstPlayer: PlayerId;
  phase: Phase;
  step: Step;
  players: Record<PlayerId, Player>;
  combat: Combat | null;
  pending: PendingSearch | null;
  log: LogEntry[];
  winner: PlayerId | null;
  winReason: string | null;
}

export type Action =
  | { type: 'draw' }
  | { type: 'place_resource'; instanceId: string }
  | { type: 'skip_resource' }
  | { type: 'play_creature'; instanceId: string; hostId?: string }
  | { type: 'play_environment'; instanceId: string; extra?: boolean; targetId?: string }
  | { type: 'attack'; attackerIds: string[]; target: AttackTarget }
  | { type: 'counter'; instanceId: string; targetId?: string }
  | { type: 'pass_counter' }
  | { type: 'cleaning'; instanceId: string }
  | { type: 'brood'; instanceId: string; resourceId: string; targetId: string }
  | { type: 'choose'; instanceId: string }
  | { type: 'end_turn' }
  | { type: 'concede' };
