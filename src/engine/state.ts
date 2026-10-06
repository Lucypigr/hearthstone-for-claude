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
  /** 每個你的回合開始時，消耗減少這麼多 */
  timeDiscount?: number;
  /** 伯昂撒姆獲得的恩澤數量 */
  boons?: number;
  /** 高等精靈學徒：傳授的法術 */
  taught?: string;
  /** 時間循環者托奇：這張法術屬於哪一組 */
  looping?: number;
  cardId: string;
  /** 倒轉：剩餘可倒轉的次數（沒有設定 = 卡牌本身的倒轉次數） */
  rewinds?: number;
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
  /** 混亂凝視者的詛咒：這個回合結束時沒打出就會被摧毀 */
  doomTurn?: number;
  /** 「跟隨…」：本回合打出這張卡後，重複某個效果（follow = FOLLOW_EFFECTS 的 key） */
  follow?: { id: string; turn: number };
  /** 抽到時召喚（為這位玩家，也就是把它放進牌堆的人） */
  summonFor?: PlayerId;
  /** 從對手那裡複製來的卡 */
  fromOpp?: boolean;
  /** 進入手牌的回合 */
  enteredTurn?: number;
  /** 被賦予了預備 */
  canPrepare?: boolean;
  /** 打出時施放兩次 */
  castTwice?: boolean;
  /** 二選一卡牌同時具有兩種效果 */
  both?: boolean;
  /** 萬能鑰匙：打出其他卡牌後，變成消耗少 2 的隨機法術 */
  skeleton?: boolean;
  /** 軟泥攻擊的魂能：要重新召喚的手下 */
  slimed?: string[];
  /** R4T-C4TCH3R：這張複製是為哪個手下留的 */
  markedFor?: number;
  /** 卡札克斯的審判：選擇的兩種效果與長度 */
  trial?: string[];
  /** 預備中：這張卡已經被預備過（顯示用） */
  prepared?: boolean;
  /** 這張牌在手中時，你花費的法力 */
  spent?: number;
  /** 碎裂的半張牌：成對的另一半的 uid，以及完整的卡牌 ID */
  shatterPair?: number;
  shatterOf?: string;
  /** 被賦予的額外法術傷害 / 暫時效果 */
  spellPower?: number;
  /** 這個回合之前不能打出（暈眩） */
  lockedUntil?: number;
  /** 畸變怪物：目前的兩種加成效果 */
  bonus?: Keyword[];
  /** 雕刻進這張牌的法術（巴珊娜的樹人） */
  carved?: string[];
  /** 暗影告密者：目前的職業 */
  cls?: CardClass;
  /** 賦予這張手牌：其他變形（石爪打擊者等在手牌中打出龍會變大） */
  grow?: number;
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
  /** 你對此手下施放過的法術 */
  spellsOn?: string[];
  /** 休眠還要幾個回合甦醒（在擁有者的回合開始時倒數） */
  dormantTurns?: number;
  /** 巨型手下的附肢（附肢的 uid） */
  limbs?: number[];
  /** 這個附肢屬於哪個本體 */
  limbOf?: number;
  /** 還沒召喚出來的附肢數（熔喉） */
  pendingLimbs?: string[];
  /** 殺死這個手下的手下（無面複製者） */
  killer?: number;
  /** 被吞噬的對手手牌（伊索拉斯） */
  devoured?: HandCard[];
  /** 暫時控制：在這個回合結束時才還回去 */
  returnTurn?: number;
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
  /** 英雄的聖盾：抵擋下一次傷害 */
  divineShield?: boolean;
}

/** 地點牌：放在戰場上，每隔一個回合可以啟用一次，耐久度用完就消失 */
export interface Location {
  uid: number;
  cardId: string;
  owner: PlayerId;
  durability: number;
  /** 還要等幾個你的回合才能再啟用（0 = 可以啟用） */
  cooldown: number;
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
  /** 小夥伴選擇的元素彈藥（0 ~ 3） */
  ammo?: number;
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
  heroPower: { id: string; used: boolean; cost: number; heroCard?: string; uses?: number; /** 這個回合倒轉過了（英雄能力的倒轉每回合一次） */ rewoundTurn?: number };
  /** 灌注：英雄能力被灌注的次數 */
  imbued?: number;
  /** 上一個你的回合打出的卡（同族判斷用） */
  prevPlayed?: string[];
  /** 敵方英雄本回合受到傷害的次數 */
  enemyHeroHits?: { turn: number; count: number };
  /** 這個回合你的卡牌消耗增加（緩慢動作） */
  cardTax?: { turn: number; amount: number };
  /** 殭屍收割者胡斯克：英雄死亡時花費屍體復活 */
  eternalLife?: boolean;
  /** 時間彼端的鰭：暫時收起來的手牌 */
  stashedHand?: HandCard[];
  /** 布洛克薩：對戰開始後消失的卡 */
  broxigar?: HandCard;
  /** 時間循環者托奇：每一組法術已打出的數量 */
  tokiGroups?: Record<number, number>;
  /** 高王之錘：永久增加的攻擊力 */
  hammerBonus?: number;
  /** 本回合已經獲得過「第一個死靈」的加成（END_003p） */
  infiniteTurn?: number;
  /** 第二個英雄能力（血腥醫生薩蕾娜：消耗屍體） */
  heroPower2?: { id: string; used: boolean; cost: number };
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
  /** 場上的地點牌 */
  locations?: Location[];
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
  eternal?: { ability: Ability; sourceCardId: string; turn?: number; minSpells?: number; until?: number; /** 目標（Objective / Aura）：顯示在英雄旁邊 */ objective?: boolean }[];
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
  quest?: { cardId: string; progress: number; names?: Record<string, number> };
  questPlayed?: boolean;
  /** 你的英雄 / 對手的英雄本回合受到的傷害 */
  heroDamageTaken?: { turn: number; amount: number };
  /** 本回合對敵方英雄造成的傷害 */
  enemyHeroDamage?: { turn: number; amount: number };
  /** 在這個回合：治療改為造成傷害 / 法術具有生命竊取 / 下一張法術施放兩次 */
  healDamageTurn?: number;
  spellLifestealTurn?: number;
  doubleSpellTurn?: number;
  /** 本回合下一張法術的額外法術傷害 */
  nextSpellPower?: { turn: number; amount: number };
  /** 本回合下一次英雄能力：額外傷害 / 消耗為 (0) */
  powerDamageBonus?: { turn: number; amount: number };
  powerFreeTurn?: number;
  /** 本場對戰中英雄能力造成的傷害 */
  heroPowerDamage?: number;
  /** 本回合 / 上回合施放的法術 */
  turnSpells?: { turn: number; ids: string[] };
  prevTurnSpells?: string[];
  /** 本場對戰中棄掉的卡 */
  discardedCards?: string[];
  spellManaSpent?: number;
  /** 你的英雄在這個回合結束前免疫（暫停！） */
  heroImmuneUntil?: number;
  /** 起手的手牌 */
  openingHand?: string[];
  /** 本場對戰中你恢復的生命值 */
  healedTotal?: number;
  /** 本回合 / 上回合打出的元素數 */
  elementalsThisTurn?: number;
  elementalsLastTurn?: number;
  otherClassAdded?: number;
  /** 你的手下是 5/5（水晶核心） */
  minions55?: boolean;
  /** 你的戰吼卡在這個回合消耗增加（對手的爆爆槍手） */
  battlecryTax?: { amount: number; turn: number };
  /** 你的二選一卡牌同時具有兩種效果（奧希里安之淚） */
  chooseBoth?: boolean;
  /** 在這個回合，下一個戰吼觸發兩次（once）或所有戰吼觸發兩次（all） */
  doubleBattlecry?: { turn: number; all: boolean };
  /** 最近一次英雄受到傷害的回合 */
  heroDamagedTurn?: number;
  /** 你的跟班是 4/4（黑暗法老特卡恩） */
  lackeys44?: boolean;
  /** 本回合進入手牌的計數、虛無（伊莉妲）、小鬼的卡等逃離紫羅蘭堡的狀態 */
  void?: HandCard[];
  voidSouls?: number;
  /** 本場對戰中你的英雄攻擊的次數 */
  heroAttacks?: number;
  /** 本場對戰中你打出的消耗為 (2) 法力的卡數 */
  twoManaPlayed?: number;
  /** 取代幸運幣的偽造品 */
  coinCard?: string;
  /** 調查：對手在這個回合打出同名的卡，你就獲得幸運幣 */
  investigation?: { cardId: string; turn: number };
  /** 高佛雷：超抽的卡 */
  godfrey?: HandCard[] | null;
  /** 重生過的手下 */
  rebornCards?: string[];
  /** 本回合打出的卡（斬碎重播用） */
  playedThisTurn?: { turn: number; ids: string[] };
  /** 本回合受到傷害的友方角色 */
  damagedChars?: { turn: number; uids: number[] };
  /** 牌堆在開始時沒有法術 */
  startedNoSpells?: boolean;
  /** 瑪格 / 吉的被動英雄能力 */
  mug?: boolean;
  zee?: { minions: number };
  /** 可以說「抱歉」 */
  sorry?: boolean;
  /** 在第幾回合把法力改為 10（奈絲芮克大廚） */
  chefTurn?: number;
  /** 這回合結束後要結束回合（大卸八塊） */
  endTurnAfter?: boolean;
  /** 本場對戰中你預兆的次數 */
  heralds?: number;
  /** 這個回合你的英雄具有生命竊取 */
  heroLifestealTurn?: number;
  /** 你的銀白之手新兵獲得的永久加成 */
  recruitBuff?: { atk: number; hp: number };
  /** 你上一張打出的卡的消耗 */
  lastPlayedCost?: number;
  /** 『生命守護者』雅立史卓莎：等你的英雄回復滿血 */
  alexWaiting?: boolean;
  /** 地脈：效果強化、額外觸發次數、消耗減少 */
  leyline?: { bonus: number; extra: number; discount: number };
  /** 動物夥伴被取代：消耗增加 / 額外召喚數 */
  companion?: { cost: number; extra: number };
  /** 你的治療效果額外恢復的生命值 */
  healBonus?: number;
  /** 本回合用法術造成的傷害（turn 記錄回合） */
  spellDamageDealt?: { turn: number; amount: number };
  /** 本場對戰中施放的邪能法術數 / 英雄與友方攻擊次數 */
  felSpells?: number;
  attacksThisGame?: number;
  /** 本場對戰中打出的 1 費手下 */
  oneCostMinions?: string[];
  /** 最近一次打出手下的回合 */
  minionPlayedTurn?: number;
  /** 你的手下回合結束效果觸發兩次直到這個回合 */
  doubleEotUntil?: number;
  /** 指揮官迦頓：回合開始時改為從牌堆發現 */
  geddon?: boolean;
  /** 傑爾賓的凱旋等光環 */
  rafaam?: number;
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
  | 'rewind'
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
  /** side = 'enemy'：偽裝手下打在對手的戰場上 */
  | { type: 'play'; handUid: number; target?: number; position?: number; option?: number; side?: 'enemy' }
  /** 預備：把卡拖進牌堆，花光剩餘法力 */
  | { type: 'prepare'; handUid: number }
  | { type: 'attack'; attacker: number; target: number }
  | { type: 'heroPower'; target?: number; option?: number }
  /** 使用第二個英雄能力（消耗屍體） */
  | { type: 'heroPower2'; target?: number }
  | { type: 'trade'; handUid: number }
  /** 發射星艦 */
  | { type: 'launch' }
  /** 啟用地點牌 */
  | { type: 'location'; uid: number; target?: number }
  | { type: 'endTurn' }
  | { type: 'mulligan'; player: PlayerId; replace: number[] }
  | { type: 'choose'; index: number }
  | { type: 'concede'; player: PlayerId };

export const MAX_BOARD = 7;
export const MAX_HAND = 10;
export const MAX_MANA = 10;
export const MAX_SECRETS = 5;
export const MAX_TURNS = 89;
