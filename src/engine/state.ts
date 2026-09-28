// 對戰狀態（純資料，可 structuredClone，供 AI 模擬使用）
import type { Ability, Aura, CardClass, Keyword } from './types';

export type PlayerId = 0 | 1;

export interface HandCard {
  uid: number;
  cardId: string;
  /** 永久費用變化（例如「其消耗減少(2)」） */
  costMod: number;
  /** 手牌中的手下增益 */
  atkBuff: number;
  hpBuff: number;
}

export interface Minion {
  uid: number;
  cardId: string;
  owner: PlayerId;
  baseAtk: number;
  baseHp: number;
  atkBuff: number;
  tempAtk: number;
  auraAtk: number;
  auraHp: number;
  maxHp: number;
  hp: number;
  keywords: Keyword[];
  tempKeywords: Keyword[];
  /** 持續到擁有者下個回合開始的關鍵字 */
  nextTurnKeywords: Keyword[];
  auraKeywords: Keyword[];
  abilities: Ability[];
  auras: Aura[];
  spellDamage: number;
  enrageAtk: number;
  silenced: boolean;
  frozen: boolean;
  frozenTurn: number;
  sleeping: boolean;
  /** 本回合被召喚（突襲判定用） */
  summonedTurn: number;
  attacks: number;
  playOrder: number;
  dead: boolean;
}

export interface Hero {
  uid: number;
  owner: PlayerId;
  cardId: string;
  heroClass: CardClass;
  hp: number;
  maxHp: number;
  armor: number;
  tempAtk: number;
  frozen: boolean;
  frozenTurn: number;
  attacks: number;
  immune: boolean;
}

export interface Weapon {
  uid: number;
  cardId: string;
  owner: PlayerId;
  atk: number;
  durability: number;
  abilities: Ability[];
  keywords: Keyword[];
}

export interface SecretInst {
  uid: number;
  cardId: string;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  heroClass: Exclude<CardClass, 'NEUTRAL'>;
  hero: Hero;
  weapon: Weapon | null;
  heroPower: { id: string; used: boolean; cost: number };
  mana: number;
  maxMana: number;
  overloadOwed: number;
  overloadLocked: number;
  deck: HandCard[];
  hand: HandCard[];
  board: Minion[];
  secrets: SecretInst[];
  graveyard: string[];
  fatigue: number;
  cardsPlayedThisTurn: number;
  spellsCastThisGame: number;
  heroAttackedThisTurn: boolean;
  elementalLastTurn: boolean;
  elementalThisTurn: boolean;
  mulliganDone: boolean;
  heroPowersUsed: number;
  drawnThisTurn: number;
  /** 本場對戰召喚過的各種族手下數量 */
  summonedRaces: Record<string, number>;
  /** 是否為電腦 */
  ai: boolean;
}

export interface LogEntry {
  turn: number;
  player: PlayerId | null;
  text: string;
}

export type FxKind = 'damage' | 'heal' | 'death' | 'play' | 'secret' | 'armor' | 'burn' | 'attack' | 'shield' | 'fatigue';

export interface Fx {
  id: number;
  kind: FxKind;
  uid?: number;
  amount?: number;
  cardId?: string;
  player?: PlayerId;
  target?: number;
}

export interface ChoiceRequest {
  player: PlayerId;
  kind: 'discover';
  options: string[];
  title: string;
}

export interface GameState {
  players: [PlayerState, PlayerState];
  current: PlayerId;
  first: PlayerId;
  turn: number;
  phase: 'mulligan' | 'play' | 'over';
  winner: PlayerId | 'draw' | null;
  nextUid: number;
  playCounter: number;
  rng: number;
  log: LogEntry[];
  fx: Fx[];
  fxSeq: number;
  pendingChoice: ChoiceRequest | null;
  deathsThisTurn: number;
}

export type Action =
  | { type: 'play'; handUid: number; target?: number; position?: number; option?: number }
  | { type: 'attack'; attacker: number; target: number }
  | { type: 'heroPower'; target?: number }
  | { type: 'trade'; handUid: number }
  | { type: 'endTurn' }
  | { type: 'mulligan'; player: PlayerId; replace: number[] }
  | { type: 'choose'; index: number }
  | { type: 'concede'; player: PlayerId };

export const MAX_BOARD = 7;
export const MAX_HAND = 10;
export const MAX_MANA = 10;
export const MAX_SECRETS = 5;
export const MAX_TURNS = 89;
