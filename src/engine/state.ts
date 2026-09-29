// 對戰狀態（純資料，可 structuredClone，供 AI 模擬使用）
import type { Ability, Aura, CardClass, Effect, Keyword, PendingDiscount, Race } from './types';

export type PlayerId = 0 | 1;

/** 組裝進星艦的組件（打出時的攻擊力 / 生命值） */
export interface StarshipPiece {
  id: string;
  atk: number;
  hp: number;
}

export interface HandCard {
  uid: number;
  cardId: string;
  /** 永久費用變化（例如「其消耗減少(2)」） */
  costMod: number;
  /** 手牌中的手下增益 */
  atkBuff: number;
  hpBuff: number;
  /** 殭屍獸：由兩張野獸縫合而成 */
  parts?: [string, string];
  /** 回音產生的複製：回合結束時從手牌消失 */
  echo?: boolean;
  /** 被移回手牌的星艦 */
  starship?: StarshipPiece[];
  /** 到這個回合為止消耗生命值而不是法力 */
  healthCostUntil?: number;
  /** 暫時的卡：回合結束時從手牌消失 */
  temporary?: boolean;
  /** 卡札克斯藥水：組成的兩種材料 */
  potion?: string[];
  /** 在手牌中累積的計數（例如尼斯蘭德瑪斯、法術石的升級進度） */
  counter?: number;
  /** 一開始就在牌堆中的卡（不是之後產生的） */
  starting?: boolean;
  /** 在手牌中會變形的卡的原本身分（例如變色龍克米里歐） */
  origin?: string;
  /** 打出時手下額外獲得的能力（例如瓦蘭尼珥的「死亡時重新裝備」） */
  grant?: Ability[];
  /** 死亡魔影的暗影：抽到時召喚這個手下的複製 */
  shadowOf?: string;
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
  /** 持續到某位玩家下個回合開始的攻擊力變化（例如「直到你的下個回合」） */
  lingerAtk?: { amount: number; until: PlayerId }[];
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
  /** 殭屍獸的兩個部位 */
  parts?: [string, string];
  /** 星艦：由這些組件組成 */
  starship?: StarshipPiece[];
  /** 這個手下消滅的手下（厄索克） */
  killed?: string[];
  /** 被此手下吞掉、亡語時要還回去的手下（護城河潛伏者） */
  captured?: { cardId: string; owner: PlayerId }[];
  /** 在這個回合可以正常攻擊（銀白巡邏兵） */
  canAttackTurn?: number;
  /** 暫時控制：回合結束時還給原本的玩家 */
  returnTo?: PlayerId;
  /** 計數（例如休眠的瑪洛尼還要等幾隻野獸死亡） */
  counter?: number;
  /** 連結的手下（巫毒人偶選擇的目標） */
  linked?: number;
  /** 記住的卡（過期品商人棄掉的卡） */
  stash?: string;
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
  /** 這把武器消滅的手下（霜之哀傷） */
  killed?: string[];
  /** 在這個回合具有生命竊取（吸血毒藥） */
  lifestealTurn?: number;
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
  /** heroCard：打出英雄卡後，英雄能力改用該卡附帶的能力 */
  heroPower: { id: string; used: boolean; cost: number; heroCard?: string; uses?: number };
  /** 本場對戰中賦予手下的關鍵字（例如「你的元素具有生命竊取」） */
  grants: { keyword: Keyword; race?: Race }[];
  /** 本回合下一張牌的折扣 */
  nextCardDiscount: number;
  mana: number;
  maxMana: number;
  overloadOwed: number;
  overloadLocked: number;
  deck: HandCard[];
  hand: HandCard[];
  board: Minion[];
  secrets: SecretInst[];
  graveyard: string[];
  /** 本場對戰中你的克蘇恩累積獲得的加成（無論它在哪裡） */
  cthun?: { atk: number; hp: number; taunt: boolean };
  /** 正在建造的星艦（已組裝的組件） */
  starship?: StarshipPiece[];
  /** 本場對戰中發射過的星艦 */
  launched?: StarshipPiece[][];
  /** 下一次星艦發射的折扣 */
  launchDiscount?: number;
  /** 死亡騎士的屍體（友方手下死亡時獲得） */
  corpses?: number;
  corpsesSpent?: number;
  /** 已召喚的翠玉魔像數 */
  jade?: number;
  /** 本回合施放的法術數 */
  spellsThisTurn?: number;
  /** 延遲的效果（例如「2 回合後召喚…」） */
  delayed?: { turns: number; effects: Effect[]; sourceCardId: string }[];
  /** 本場對戰剩下的時間都有效的能力（例如「在你的回合結束時對對手造成 3 點傷害」）；turn：只在這個回合有效；minSpells：施放的法術數達到這個值才觸發 */
  eternal?: { ability: Ability; sourceCardId: string; turn?: number; minSpells?: number }[];
  /** 你的手下在這個回合消耗增加（對手的冰涼腳丫等） */
  minionTax?: { amount: number; turn: number };
  /** 本回合下一張法術的折扣 */
  nextSpellDiscount?: { amount: number; turn: number };
  /** 本回合下一張牌改為消耗屍體 */
  nextCardCorpsesTurn?: number;
  /** 本場對戰中你的手下額外的攻擊力 */
  minionAtkBonus?: number;
  /** 最近一次友方手下 / 友方不死族死亡的回合 */
  friendlyDiedTurn?: number;
  undeadDiedTurn?: number;
  /** 最近一次英雄生命值變化 / 被治療的回合 */
  heroHealthChangedTurn?: number;
  heroHealedTurn?: number;
  /** 回合結束時加入手牌的卡 */
  endOfTurnCards?: string[];
  /** 洗進對手牌堆的瘟疫數 */
  plaguesShuffled?: number;
  /** 下一張符合條件的牌的消耗變化（turn：只在這個回合有效） */
  pendingDiscounts?: (PendingDiscount & { turn?: number })[];
  /** 你的法術 / 英雄能力在這個回合消耗增加（對手的憎恨者 / 破壞者） */
  spellTax?: { amount: number; turn: number };
  powerTax?: { amount: number; turn: number };
  /** 下一次使用英雄能力的折扣 */
  powerDiscount?: number;
  /** 本場對戰中英雄能力消耗固定為這個值（綑縛者拉札） */
  powerCostSet?: number;
  /** 本場對戰中打出的奧秘數 */
  secretsPlayed?: number;
  /** 本回合死亡的友方手下 */
  diedThisTurn?: { turn: number; ids: string[] };
  /** 在這個回合結束時執行的效果 */
  endOfTurnEffects?: { effects: Effect[]; sourceCardId: string }[];
  /** 在這個回合少了幾個法力水晶（法力燃燒） */
  manaBurn?: { amount: number; turn: number };
  /** 本場對戰中超載 / 棄掉的數量 */
  overloadTotal?: number;
  discardedCount?: number;
  /** 最近一次施放消耗 5 以上法術的回合，以及本場對戰施放的次數 */
  bigSpellTurn?: number;
  bigSpells?: number;
  /** 本場對戰中打出過的卡 */
  playedCards?: string[];
  /** 本場對戰中對友方手下施放過的法術 */
  spellsOnMinions?: string[];
  /** 本場對戰中被摧毀的武器 */
  destroyedWeapons?: string[];
  /** 進行中的任務 */
  quest?: { cardId: string; progress: number };
  /** 你的二選一卡牌同時具有兩種效果（奧希里安之淚） */
  chooseBoth?: boolean;
  /** 在這個回合，下一個戰吼觸發兩次（once）或所有戰吼觸發兩次（all） */
  doubleBattlecry?: { turn: number; all: boolean };
  /** 最近一次英雄受到傷害的回合 */
  heroDamagedTurn?: number;
  /** 你的跟班是 4/4（黑暗法老特卡恩） */
  lackeys44?: boolean;
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

export type FxKind =
  | 'damage'
  | 'heal'
  | 'death'
  | 'play'
  | 'secret'
  | 'armor'
  | 'burn'
  | 'attack'
  | 'shield'
  | 'fatigue'
  | 'summon'
  | 'freeze'
  | 'buff'
  | 'draw';

export interface Fx {
  id: number;
  kind: FxKind;
  uid?: number;
  amount?: number;
  cardId?: string;
  player?: PlayerId;
  target?: number;
  /** 造成效果的角色（手下 / 英雄）；法術則為 undefined，cardId 是法術 */
  from?: number;
  /** 召喚：從手牌打出（而不是效果召喚） */
  played?: boolean;
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
  /** 接下來輪到的玩家（額外回合，例如坦普拉斯） */
  turnQueue?: PlayerId[];
}

export type Action =
  | { type: 'play'; handUid: number; target?: number; position?: number; option?: number }
  | { type: 'attack'; attacker: number; target: number }
  | { type: 'heroPower'; target?: number; option?: number }
  | { type: 'trade'; handUid: number }
  /** 發射星艦 */
  | { type: 'launch' }
  | { type: 'endTurn' }
  | { type: 'mulligan'; player: PlayerId; replace: number[] }
  | { type: 'choose'; index: number }
  | { type: 'concede'; player: PlayerId };

export const MAX_BOARD = 7;
export const MAX_HAND = 10;
export const MAX_MANA = 10;
export const MAX_SECRETS = 5;
export const MAX_TURNS = 89;
