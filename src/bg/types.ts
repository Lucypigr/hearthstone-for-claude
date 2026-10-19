// 英雄戰場的資料型別（和一般對戰的引擎分開，規則差很多）

export type Tribe = 'BEAST' | 'DEMON' | 'DRAGON' | 'ELEMENTAL' | 'MECHANICAL' | 'MURLOC' | 'PIRATE' | 'QUILBOAR' | 'UNDEAD' | 'NAGA';

/** 有實作的種族（每局隨機抽 5 個） */
export const TRIBES: Tribe[] = ['BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'PIRATE', 'QUILBOAR', 'UNDEAD', 'NAGA'];

export const TRIBE_NAMES: Record<Tribe | 'ALL', string> = {
  BEAST: '野獸',
  DEMON: '惡魔',
  DRAGON: '龍類',
  ELEMENTAL: '元素',
  MECHANICAL: '機械',
  MURLOC: '魚人',
  PIRATE: '海盜',
  QUILBOAR: '野豬人',
  UNDEAD: '不死族',
  NAGA: '納迦',
  ALL: '全部',
};

export const TRIBE_ICONS: Record<Tribe, string> = {
  BEAST: '🐾',
  DEMON: '😈',
  DRAGON: '🐉',
  ELEMENTAL: '🔥',
  MECHANICAL: '⚙️',
  MURLOC: '🐟',
  PIRATE: '🏴‍☠️',
  QUILBOAR: '🐗',
  UNDEAD: '💀',
  NAGA: '🔱',
};

/** bg.json 的一筆資料 */
export interface BgCardData {
  name: string;
  en: string;
  text: string;
  type: string;
  atk?: number;
  hp?: number;
  tier?: number;
  races?: string[];
  mech?: string[];
  cost?: number;
  armor?: number;
  power?: string;
}

export type Keyword = 'taunt' | 'shield' | 'windfury' | 'venom' | 'reborn' | 'stealth';
export const KEYWORDS: Keyword[] = ['taunt', 'shield', 'windfury', 'venom', 'reborn', 'stealth'];
/** 「隨機的額外關鍵字」可以抽到的 */
export const BONUS_KEYWORDS: Keyword[] = ['taunt', 'shield', 'windfury', 'venom', 'reborn'];
export const KEYWORD_NAMES: Record<Keyword, string> = {
  taunt: '嘲諷',
  shield: '聖盾',
  windfury: '風怒',
  venom: '烈毒',
  reborn: '復生',
  stealth: '潛行',
};

/** 戰場上（招募階段或戰鬥中）的一個手下 */
export interface BMinion {
  uid: number;
  id: string;
  /** 永久的身材（不含光環） */
  atk: number;
  hp: number;
  golden: boolean;
  taunt: boolean;
  shield: boolean;
  windfury: boolean;
  venom: boolean;
  reborn: boolean;
  stealth: boolean;
  /** 磁力吸附上來的機械（它們的效果也會發動；g = 2 是金卡） */
  mags: { id: string; g: number }[];
  /** 直到下回合的加成 */
  tmpAtk: number;
  tmpHp: number;
  tmpKw: Keyword[];
  /** 各卡自己的計數器（例如「強化」了幾次） */
  n: number;
  /** 戰鬥中：對應到招募階段的哪一個手下（用來保存永久加成） */
  src?: number;
  /** 戰鬥中：最大生命值 */
  maxHp?: number;
  /** 戰鬥中：報復計數 */
  avenge?: number;
  /** 戰鬥中：這場已經發動過幾次（例如「每場戰鬥 3 次」） */
  uses?: number;
  /** 戰鬥中：已經死亡 */
  dead?: boolean;
  /** 戰鬥中：是被復生召喚回來的 */
  reborned?: boolean;
  /** 戰鬥中：這場戰鬥結束後要移除（例如「只限這場戰鬥」從手牌召喚的） */
  temp?: boolean;
  /** 戰鬥中：殺死它的手下 */
  killer?: number;
  /** 三連做出來的金卡：打出時拿到三合一獎勵 */
  reward?: boolean;
}

export type HandCard =
  | { kind: 'minion'; uid: number; m: BMinion }
  /** 法術：鮮血寶石、旅店幸運幣、三合一獎勵、造法法術 */
  | { kind: 'spell'; uid: number; id: string; g: number; temp?: boolean; tier?: number };

export interface Discover {
  /** 選項：手下的卡牌 ID */
  options: string[];
  golden?: boolean;
  /** 選項是「手下」以外的東西（例如英雄能力的強化） */
  title: string;
  /** 選完要做什麼（預設：放到手牌） */
  /** 選完後對英雄造成等同旅店等級的傷害（威武打擊手） */
  hurt?: boolean;
  /** 複製品：不從卡池裡拿 */
  noPool?: boolean;
}

export interface Seen {
  round: number;
  board: BMinion[];
  tier: number;
  heroId: string;
}

export interface BPlayer {
  idx: number;
  name: string;
  isHuman: boolean;
  heroId: string;
  hp: number;
  armor: number;
  alive: boolean;
  /** 名次（被淘汰時決定） */
  place: number | null;
  /** 被淘汰的回合 */
  diedRound: number | null;
  tier: number;
  gold: number;
  /** 每回合的金幣上限加成（塞納留斯等） */
  maxGoldBonus: number;
  upgradeCost: number;
  board: BMinion[];
  hand: HandCard[];
  shop: BMinion[];
  frozen: boolean;
  /** 本回合英雄能力用了幾次 */
  powerUses: number;
  /** 英雄能力已經不能再用（一局一次的能力） */
  powerSpent: boolean;
  freeRefreshes: number;
  /** 各種「本賽局」的計數（鮮血寶石加成、甲蟲加成、死亡的永恆騎士……） */
  c: Record<string, number>;
  /** 正在發現 */
  discover: Discover | null;
  /** 排隊中的發現 */
  dq: Discover[];
  triples: number;
  /** 最近的戰鬥結果（新的在後面） */
  results: ('win' | 'loss' | 'draw')[];
  lastOpp: number | null;
  /** 對每個對手最後一次看到的戰隊（打過才知道，和真人一樣） */
  seen: Record<number, Seen>;
  /** 下回合多拿的金幣 */
  nextGold: number;
  /** 被淘汰時的戰隊（之後當作殘影） */
  deathBoard: BMinion[] | null;
  /** 電腦玩家的個性 */
  persona?: BgPersona;
  /** 電腦每回合的想法（賽後回顧用） */
  notes: string[];
  /** 這回合已經結束招募（排行榜上顯示） */
  ready: boolean;
}

export type BgStyle = 'standard' | 'greedy' | 'tempo' | 'reroll';

/** 電腦玩家的個性：技術、打法、喜歡的種族、失誤、愛不愛說話 */
export interface BgPersona {
  /** 0（新手）～ 1（頂尖） */
  skill: number;
  style: BgStyle;
  /** 偏好的種族（新手很固執，高手會看情況轉） */
  fav: Tribe[];
  /** 0 ～ 1：多常表情 */
  chatty: number;
  /** 積分（顯示用） */
  rating: number;
  seed: number;
}

/** 戰鬥的一個畫面（給動畫播放） */
export interface CombatFrame {
  boards: [BMinion[], BMinion[]];
  /** 這一步是誰攻擊誰 */
  attacker?: number;
  target?: number;
  /** 受到傷害的手下（顯示數字） */
  hits?: { uid: number; amount: number }[];
  note?: string;
}

export interface CombatResult {
  /** 0 = 第一個玩家贏，1 = 第二個玩家贏，null = 平手 */
  winner: 0 | 1 | null;
  damage: number;
  /** 存活下來的手下 */
  survivors: BMinion[];
  frames?: CombatFrame[];
  /** 第一個攻擊的一方 */
  first: 0 | 1;
}
