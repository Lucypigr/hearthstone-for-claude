// 英雄戰場的資料型別（和一般對戰的引擎分開，規則差很多）

export type Tribe = 'BEAST' | 'DEMON' | 'DRAGON' | 'ELEMENTAL' | 'MECHANICAL' | 'MURLOC' | 'PIRATE' | 'QUILBOAR' | 'UNDEAD' | 'NAGA' | 'ABERRATION';

/** 有實作的種族（每局隨機抽 5 個） */
export const TRIBES: Tribe[] = ['BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'PIRATE', 'QUILBOAR', 'UNDEAD', 'NAGA', 'ABERRATION'];

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
  ABERRATION: '畸變體',
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
  ABERRATION: '👁️',
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
  /** 暗月馬戲團獎品的等級 */
  prize?: number;
  /** 飾品、任務、任務獎勵、異象 */
  kind?: 'lesser' | 'greater' | 'reward' | 'anomaly' | 'quest' | 'gift';
  armor?: number;
  power?: string;
  /** 酒館裡會賣的法術 */
  pool?: boolean;
  /** 法術相關的種族（這局沒有這個種族就不會出現） */
  assoc?: string[];
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
  /** 戰鬥中：殺死這個手下的敵方手下（電台明星用） */
  killedBy?: BMinion;
  /** 三連做出來的金卡：打出時拿到三合一獎勵 */
  reward?: boolean;
  /** 身上有幾顆鮮血寶石（寶石沒收用） */
  gems?: number;
  /** 轉墓術：在這個回合打出的話，回合結束時死亡 */
  doom?: number;
  /** 范達爾的機運：二選一的兩個效果都會發動 */
  both?: boolean;
  /** 啟動技能：這回合已經用過（回合數） */
  act?: number;
  /** 各卡自己記住的卡（例如致命打擊者拿到的不死族） */
  memo?: string;
  /** 戰鬥中：記住的手下（縫合拾荒者摧毀的手下） */
  held?: BMinion;
  /** 酒館中：單獨凍結（瓦登‧晨握） */
  iced?: boolean;
  /** 額外的亡語（布魯坎的大地祈願、塔姆辛、恩若司之魚） */
  extraDr?: { id: string; g: number }[];
  /** 額外的奮戰（時光扭曲石殼守護者） */
  extraRally?: { id: string; g: number }[];
  /** 跳舞的戴瑞：帽子 */
  hat?: number;
  /** 黑暗贈禮（也用來放暗月獎品給的效果） */
  gifts?: string[];
  /** 變換者澤魯斯：在手牌裡每回合變形 */
  shifter?: boolean;
  /** 黃金錘：暫時的金卡（下一回合變回來時要扣掉的身材） */
  tmpGold?: [number, number];
  /** 額外的種族（銅鬚頭像、德拉克瑞頭像） */
  xr?: Tribe[];
  /** 酒館中：身上有暗月彩票（希拉斯） */
  ticket?: boolean;
  /** 黑暗贈禮的計時（孵育：在這個回合身材加倍） */
  gt?: number;
  /** 戰鬥中：聖盾已經被打了幾次（托瑞斯的祝福） */
  shieldHits?: number;
}

export type HandCard =
  /** locked = 這個回合還不能打出（時光尋跡） */
  | { kind: 'minion'; uid: number; m: BMinion; locked?: number; pair?: number }
  /** 法術：酒館法術、鮮血寶石、旅店幸運幣、三合一獎勵、造法法術 */
  | { kind: 'spell'; uid: number; id: string; g: number; temp?: boolean; tier?: number; locked?: number; pair?: number; turns?: number; evo?: number };

/** 酒館裡賣的法術 */
export interface ShopSpell {
  uid: number;
  id: string;
  /** 法術彩票（魔法商店異象） */
  ticket?: boolean;
}

/** 之後才會發生的效果（贏家的麵包） */
export interface Pending {
  k: 'bread';
  uid: number;
  /** 下一場戰鬥贏了 */
  won?: boolean;
}

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
  /** 拿到時鎖定 1 回合（時光尋跡） */
  lock?: boolean;
  /** 這回合打出的話會死亡（轉墓術） */
  doom?: boolean;
  /** 選項是酒館法術 */
  spells?: boolean;
  /** 范達爾的機運：二選一的兩個效果都要 */
  both?: boolean;
  /** 葛拉克朗：選到的手下取代酒館裡的這個手下 */
  replace?: number;
  /** 魚爾摩斯：猜對的是哪一個（不會拿到手下） */
  guess?: string;
  /** 選項是英雄能力（英雄 ID） */
  powers?: boolean;
  /** 選項是現成的手下（畢勾沃斯：保留加成） */
  objs?: BMinion[];
  /** 費林大使：選到的手下等升到這個等級才拿到 */
  reserve?: number;
  /** 選項是飾品 / 任務獎勵（飾品要付金幣） */
  relics?: 'lesser' | 'greater' | 'reward';
  /** 選項是任務：每個任務完成後的獎勵 */
  rewards?: string[];
  /** 拿到時把身材設成這樣（旅店老闆的爐火） */
  stats?: [number, number];
  /** 拿到時多給的身材 */
  bonus?: [number, number];
  /** 選到的手下取代戰場上的這個手下（古神的印記、加速器） */
  transform?: number;
  /** 飾品：免費拿到並取代這個飾品（神秘立方體、旅遊兌換券） */
  freeRelic?: string;
  /** 記住選到的卡（可攜式工廠） */
  remember?: string;
  /** 取代飾品時要付錢 */
  payRelic?: boolean;
  /** 選到的法術教給 1/1 魚人（魔術魚文物） */
  teach?: boolean;
  /** 拿到時鎖定幾回合 */
  lockTurns?: number;
  /** 基里的雙蝕：選到的飾品拿兩個 */
  twice?: boolean;
  /** 每個選項帶的黑暗贈禮 */
  gifts?: string[];
  /** 選到的英雄能力變成第二個英雄能力 */
  slot2?: boolean;
  /** 巴羅夫：選項是玩家（索引） */
  bet?: number[];
  /** 選項是英雄專屬的選擇（凱瑞爾的強化、飆翼的航線、亞坦尼斯的神族、阿卡贊札拉克的奧秘） */
  pick?: 'cariel' | 'flight' | 'protoss' | 'secret';
  /** 凱莉根：選項是這個蟲族要變形成的樣子 */
  morph?: number;
  /** 拿到時多給的關鍵字 */
  kw?: Keyword[];
  /** 時光扭曲商店：次級 / 高級、剩下的時光晶幣 */
  timewarp?: 'minor' | 'major';
  chronum?: number;
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
  /** 酒館裡賣的法術 */
  shopSpells: ShopSpell[];
  frozen: boolean;
  /** 本回合英雄能力用了幾次 */
  powerUses: number;
  /** 英雄能力已經不能再用（一局一次的能力） */
  powerSpent: boolean;
  /** 第二個英雄能力（吉恩、雙重宇宙……）：哪位英雄的能力、這回合用了幾次、一局一次的用過了沒 */
  power2?: string;
  power2Uses?: number;
  power2Spent?: boolean;
  /** 巴羅夫：押注哪位玩家會贏下一場戰鬥 */
  wager?: number | null;
  /** 魔術大師阿卡贊札拉克：場上的奧秘 */
  secrets?: string[];
  /** 亞坦尼斯：買滿 14 張卡後拿到的神族 */
  protoss?: string;
  /** 飾品記住的卡（可攜式工廠） */
  rmemo?: Record<string, string>;
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
  /** 之後才會發生的效果 */
  after: Pending[];
  /** 上一張施放的酒館法術 */
  lastSpell?: string;
  /** 惡魔食料：每個來源還剩幾次刷新 */
  fodder?: number[];
  /** 英雄能力換成別的英雄的（芬利、阮大師、揭露身分） */
  powerHero?: string;
  /** 上一場戰鬥時的手下（魚爾摩斯） */
  lastBoardIds?: string[];
  /** 上一場戰鬥死掉的手下（希瓦娜斯） */
  lastDied?: string[];
  /** 上一場戰鬥中死掉的手下（招募階段的 uid） */
  lastDiedUids?: number[];
  /** 費林大使：升到某等級才拿到的手下 */
  reserve?: { id: string; tier: number }[];
  /** 飾品與任務獎勵 */
  relics?: string[];
  /** 進行中的任務 */
  quest?: { id: string; reward: string; need: number; start: number } | null;
  /** 夥伴按鈕：目前的費用、按了幾次 */
  buddy?: { cost: number; presses: number };
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
  /** 雙方死掉的手下 */
  died: [string[], string[]];
  /** 死掉的手下在招募階段的 uid */
  diedSrc: [number[], number[]];
}
