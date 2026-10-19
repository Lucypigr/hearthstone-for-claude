// 卡牌效果用到的介面（招募階段 / 戰鬥中），由 game.ts 與 combat.ts 實作
import type { BMinion, BPlayer, Keyword, Tribe } from './types';

/** 招募階段 */
export interface Recruit {
  p: BPlayer;
  turn: number;
  tribes: Tribe[];
  rand(): number;
  pick<T>(arr: T[]): T | undefined;
  /** 永久加成 */
  buff(m: BMinion, atk: number, hp: number): void;
  /** 酒館法術給的身材（會加上「你的酒館法術額外 +X」） */
  spellBuff(m: BMinion, atk: number, hp: number): void;
  /** 直到下回合的加成 */
  tmpBuff(m: BMinion, atk: number, hp: number, kw?: Keyword[]): void;
  giveKw(m: BMinion, kw: Keyword): void;
  /** 對手下使用鮮血寶石 */
  gem(m: BMinion, times?: number): void;
  getGems(n: number): void;
  getSpell(id: string, g?: number, temp?: boolean): void;
  /** 拿到一張手下（衍生物或從卡池裡拿） */
  getMinion(id: string, golden?: boolean): void;
  /** 從卡池裡隨機拿一張手下 */
  getRandom(filter: (id: string) => boolean, golden?: boolean): void;
  discover(filter: (id: string) => boolean, title: string, golden?: boolean, hurt?: boolean): void;
  gainGold(n: number): void;
  hurtHero(n: number): void;
  summon(m: BMinion, pos?: number): boolean;
  make(id: string, golden?: boolean): BMinion;
  /** 從戰場上移除（摧毀） */
  destroy(m: BMinion): void;
  /** 你的神祇 +X/+Y（畸變體） */
  deity(atk: number, hp: number): void;
  /** 棄掉一張手牌 */
  discard(uid: number): void;
  /** 磁力吸附一個衍生物到手下身上（增幅器） */
  magnetize(host: BMinion, id: string): void;
  /** 惡魔食料：之後 n 次刷新各多一個 */
  addFodder(refreshes: number): void;
  /** 帶鎖箱 */
  lockbox(): void;
  /** 把一個手下（例如從酒館拿走的）放到手牌 */
  give(m: BMinion): void;
  /** 施放一個隨機的酒館法術（盡量以這個手下為目標） */
  castRandomOn(m: BMinion): void;
  /** 施放指定的法術（盡量以這個手下為目標） */
  castOn(id: string, m: BMinion): void;
  /** 免費刷新酒館 */
  freeRefresh(): void;
  /** 在酒館裡觸發手下的奮戰 */
  rally(m: BMinion): void;
  /** 拿到兩張成對的卡：打出其中一張時棄掉另一張 */
  getPair(gen: () => string, spells: boolean): void;
  /** 從卡池抽一張（會從卡池拿走） */
  drawId(filter: (id: string) => boolean): string | undefined;
  /** 吃掉酒館裡的手下：獲得它的身材 */
  consume(eater: BMinion, food: BMinion): void;
  /** 觸發手下的戰吼 */
  battlecry(m: BMinion): void;
  /** 發現一張酒館法術 */
  discoverSpell(filter: (id: string) => boolean, title: string): void;
  /** 立刻施放一個法術（沒有目標的） */
  castSpell(id: string): void;
  /** 這個法術在這局的酒館裡（種族有在這局） */
  spellInLobby(id: string): boolean;
  /** 賦予「酒館中的手下」加成（本賽局） */
  tavernBuff(atk: number, hp: number, tribe?: Tribe): void;
  /** 增加計數並同步到戰場上符合的手下（例如「你的甲蟲本賽局 +2/+1」） */
  counter(key: string, n: number): void;
}

/** 戰鬥中 */
export interface Combat {
  turn: number;
  rand(): number;
  pick<T>(arr: T[]): T | undefined;
  side(m: BMinion): 0 | 1;
  /** 同一方還活著的手下 */
  friends(m: BMinion): BMinion[];
  enemies(m: BMinion): BMinion[];
  board(side: 0 | 1): BMinion[];
  player(side: 0 | 1): BPlayer;
  /** 召喚到某個位置（預設：最右邊）；滿了回傳 null */
  summon(side: 0 | 1, m: BMinion, index?: number): BMinion | null;
  make(id: string, golden?: boolean): BMinion;
  damage(target: BMinion, amount: number, source: BMinion | null): void;
  buff(m: BMinion, atk: number, hp: number): void;
  /** 戰鬥中的加成同時永久保存 */
  perm(m: BMinion, atk: number, hp: number): void;
  giveKw(m: BMinion, kw: Keyword): void;
  destroy(m: BMinion): void;
  /** 讓手下立刻攻擊 */
  attackNow(m: BMinion): void;
  index(m: BMinion): number;
  heroTier(side: 0 | 1): number;
  /** 本賽局的計數（甲蟲、不死族攻擊力……）同步到戰鬥中的手下 */
  counter(side: 0 | 1, key: string, n: number): void;
  deathrattle(m: BMinion): void;
  /** 對招募階段的手牌做永久的事（例如「賦予手牌中的一個手下 +2/+1」） */
  hand(side: 0 | 1): BMinion[];
  /** 本場戰鬥死了幾個友方手下 */
  deaths(side: 0 | 1): number;
  /** 讀取本賽局的計數（模擬中也會跟著變） */
  cnt(side: 0 | 1, key: string): number;
  /** 把卡（手下或法術）放進招募階段的手牌（模擬中不會發生） */
  give(side: 0 | 1, id: string): void;
  giveRandom(side: 0 | 1, filter: (id: string) => boolean): void;
  /** 酒館法術的額外加成（戰鬥中施放法術用） */
  spellExtra(side: 0 | 1): [number, number];
  /** 讓手下的計數永久 +1（例如「永久強化此手下」） */
  bump(m: BMinion, n?: number): void;
  /** 這張卡在這一局的卡池裡 */
  inLobby(id: string): boolean;
  /** 這張酒館法術在這一局會出現 */
  inLobbySpell(id: string): boolean;
  /** 你的神祇 +X/+Y（已經甦醒的話也會加在它身上） */
  deity(side: 0 | 1, atk: number, hp: number): void;
  /** 戰鬥開始時這一方的手下（卡牌 ID） */
  startBoard(side: 0 | 1): string[];
}

export interface MinionSpec {
  id: string;
  /** 覆寫官方敘述（官方資料有誤或需要顯示數值） */
  text?: (m: BMinion, p: BPlayer | null) => string | null;
  // —— 招募階段 ——
  battlecry?(r: Recruit, self: BMinion, g: number, target: BMinion | null, choice: number): void;
  /** 二選一（-1 = 兩個效果都要，荊棘開路者） */
  choices?: string[];
  /** 戰吼需要選一個友方手下 */
  target?: (self: BMinion, t: BMinion) => boolean;
  /** 另一個友方手下被打出後 */
  onPlay?(r: Recruit, self: BMinion, played: BMinion, g: number): void;
  /** 在手牌中時，你打出另一個手下後 */
  inHandOnPlay?(r: Recruit, self: BMinion, played: BMinion, g: number): void;
  startTurn?(r: Recruit, self: BMinion, g: number): void;
  endTurn?(r: Recruit, self: BMinion, g: number): void;
  onSell?(r: Recruit, self: BMinion, g: number): void;
  /** 你對某個手下施放法術後（鮮血寶石、造法……） */
  onSpell?(r: Recruit, self: BMinion, target: BMinion | null, g: number, spellId: string): void;
  onBuy?(r: Recruit, self: BMinion, bought: BMinion, g: number): void;
  /** 啟動技能：花金幣發動（每回合一次） */
  activate?: {
    cost: number;
    /** 要選的東西：友方手下 / 酒館的手下 / 手牌（棄牌） */
    target?: 'friend' | 'shop' | 'hand';
    filter?: (self: BMinion, t: BMinion | null, p: BPlayer) => boolean;
    use(r: Recruit, self: BMinion, g: number, target: BMinion | null, handUid: number | null): void;
    /** 電腦：值多少（0 = 不用） */
    ai?: (r: Recruit, self: BMinion) => number;
  };
  /** 你棄掉一張牌後 */
  onDiscard?(r: Recruit, self: BMinion, g: number): void;
  /** 有東西被加入你的手牌後 */
  onGetCard?(r: Recruit, self: BMinion, g: number): void;
  /** 你發現一張卡後 */
  onDiscover?(r: Recruit, self: BMinion, g: number): void;
  /** 你購買酒館法術後 */
  onBuySpell?(r: Recruit, self: BMinion, id: string, g: number): void;
  /** 你花了金幣 */
  onSpend?(r: Recruit, self: BMinion, amount: number, g: number): void;
  /** 酒館被刷新後 */
  onRefresh?(r: Recruit, self: BMinion, g: number): void;
  /** 英雄受到傷害後 */
  onHeroHurt?(r: Recruit, self: BMinion, g: number, amount: number): void;
  /** 你觸發戰吼後 */
  afterBattlecry?(r: Recruit, self: BMinion, m: BMinion, g: number): void;
  /** 使用鮮血寶石到這個手下身上後 */
  onGem?(r: Recruit, self: BMinion, g: number): void;
  /** 造法：每回合給你的法術 */
  spellcraft?: string;
  /** 光環：依目前狀況多出的身材 */
  aura?(cnt: Record<string, number>, self: BMinion, g: number, heroHp: number): [number, number];
  sellPrice?(p: BPlayer, self: BMinion): number;
  // —— 戰鬥中 ——
  soc?(c: Combat, self: BMinion, g: number): void;
  /** 在手牌中時的起始戰鬥效果 */
  socInHand?(c: Combat, self: BMinion, side: 0 | 1, g: number): void;
  deathrattle?(c: Combat, self: BMinion, g: number, index: number): void;
  /** 奮戰：這個手下攻擊時（傷害前） */
  rally?(c: Combat, self: BMinion, g: number, target: BMinion): void;
  afterAttack?(c: Combat, self: BMinion, g: number, target: BMinion, killed: boolean, excess: number): void;
  avenge?: [number, (c: Combat, self: BMinion, g: number) => void];
  /** 另一個友方手下攻擊時 */
  onFriendAttack?(c: Combat, self: BMinion, attacker: BMinion, g: number, target: BMinion): void;
  /** 另一個友方手下攻擊之後 */
  afterFriendAttack?(c: Combat, self: BMinion, attacker: BMinion, g: number): void;
  /** 戰鬥中你召喚了手下之後 */
  onSummon?(c: Combat, self: BMinion, summoned: BMinion, g: number): void;
  onDamaged?(c: Combat, self: BMinion, amount: number, g: number): void;
  /** 另一個友方手下造成傷害後 */
  onFriendDealt?(c: Combat, self: BMinion, dealer: BMinion, g: number): void;
  /** 這個手下死亡時（不是亡語，不會被瑞文戴爾男爵加倍） */
  onDeath?(c: Combat, self: BMinion, g: number): void;
  /** 友方手下死亡後 */
  onFriendDeath?(c: Combat, self: BMinion, dead: BMinion, g: number): void;
  onFriendReborn?(c: Combat, self: BMinion, m: BMinion, g: number): void;
  /** 友方手下失去聖盾後 */
  onShieldLost?(c: Combat, self: BMinion, m: BMinion, g: number): void;
  /** 攻擊時也會傷害目標兩旁的手下 */
  cleave?: boolean;
  /** 有聖盾時才有嘲諷 */
  tauntWhileShield?: boolean;
  /** 磁力 */
  magnetic?: boolean;
  /** 也可以吸附在這個種族上（例如義肢之手可以吸附到不死族） */
  magnetTo?: string[];
  // —— 電腦評估用 ——
  /** 額外的價值（約等於多少點身材） */
  val?: number;
  /** 每回合成長的價值 */
  scale?: number;
  /** 想要搭配的種族 */
  syn?: Tribe;
}
