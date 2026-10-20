// 英雄戰場的一局：8 位玩家（你 + 7 個電腦）、共用的酒館卡池、招募階段、配對與戰鬥
import type { Recruit } from './api';
import { COIN, GEM, POOL_IDS, SPEC, SPELLCRAFT_SPELLS, TOKENS, TRIPLE_REWARD } from './cards';

const SURPRISE = 'BG26_175';
/** 時光扭曲的戴奧斯：戰吼、亡語、奮戰觸發兩次 */
const DEIOS = 'BG34_Giant_376';
const LOCKBOX = 'BG36_520t';
const FODDER = 'BG35_150t';
import { BOUNTIES, isTavernSpell, mostCommonType, SPELL_SPEC, spellCostOf, TAVERN_SPELLS, type SpellCtx } from './spells';
import { BUDDY_IDS } from './buddies';
import { CombatSim, runCombat, type SideInput } from './combat';
import { bgCard, isRace, racesOf, setParadox, tierOf } from './data';
import { attachGift, GIFT_IDS, hasGift, PARADOX } from './gifts';
import { heroOf, HERO_SPEC, heroAvailable, HEROES, SWAPPABLE_POWERS, type HeroSpec } from './heroes';
import { PRIZE_IDS, prizeTier } from './prizes';
import { TW_IDS, TW_SPELL_SPEC, twCost, twKind } from './timewarp';
import { SECRET_SPEC } from './secrets';
import { ANOMALIES, anomalyFits, QUEST_SPEC, QUESTS, questProgress, relicCost, RELIC_SPEC, RELICS, REWARDS, type RelicSpec } from './relics';
import { nextRandom } from '../engine/rng';
import {
  auraOf,
  BOARD_MAX,
  canMagnetize,
  COPIES,
  damageCap,
  goldForTurn,
  HAND_MAX,
  HERO_HP,
  makeMinion,
  MAX_TIER,
  MINION_COST,
  REFRESH_COST,
  SELL_PRICE,
  SHOP_SIZE,
  specsOf,
  spellExtraOf,
  UPGRADE_COST,
} from './rules';
import { TRIBES, type BgPersona, type BMinion, type BPlayer, type CombatFrame, type Discover, type HandCard, type Keyword, type Tribe } from './types';

export interface CombatRecord {
  round: number;
  a: number;
  /** -1 = 殘影 */
  b: number;
  ghostOf: number | null;
  winner: number | null;
  damage: number;
  /** 戰鬥開始時的雙方戰隊 */
  boards: [BMinion[], BMinion[]];
  frames?: CombatFrame[];
}

export interface BgState {
  rng: number;
  uid: number;
  round: number;
  phase: 'hero' | 'recruit' | 'combat' | 'over';
  tribes: Tribe[];
  pool: Record<string, number>;
  players: BPlayer[];
  heroOffers: Record<number, string[]>;
  /** 本回合的配對（b = -1 是殘影） */
  pairs: [number, number][];
  combats: CombatRecord[];
  /** 這局的異象 */
  anomaly?: string | null;
  /** 這局有飾品 / 任務 / 英雄夥伴 */
  trinkets?: boolean;
  quests?: boolean;
  buddies?: boolean;
  /** 這局有時光扭曲 */
  timewarp?: boolean;
  /** 黑暗悖論這局的樣子 */
  paradox?: { tier: number; atk: number; hp: number; gift: string };
}

export interface NewGameOptions {
  seed: number;
  humanName: string;
  ais: { name: string; persona: BgPersona }[];
  tribes?: Tribe[];
  /** 你可以選幾個英雄 */
  heroChoices?: number;
  /** 異象：true = 隨機一個、字串 = 指定、false = 沒有 */
  anomaly?: boolean | string;
  trinkets?: boolean;
  timewarp?: boolean;
  quests?: boolean;
  buddies?: boolean;
}

export class BgError extends Error {}

function newPlayer(idx: number, name: string, isHuman: boolean, persona?: BgPersona): BPlayer {
  return {
    idx,
    name,
    isHuman,
    heroId: '',
    hp: HERO_HP,
    armor: 0,
    alive: true,
    place: null,
    diedRound: null,
    tier: 1,
    gold: 0,
    maxGoldBonus: 0,
    upgradeCost: UPGRADE_COST[2],
    board: [],
    hand: [],
    shop: [],
    shopSpells: [],
    frozen: false,
    powerUses: 0,
    powerSpent: false,
    freeRefreshes: 0,
    c: {},
    discover: null,
    dq: [],
    triples: 0,
    results: [],
    lastOpp: null,
    seen: {},
    nextGold: 0,
    after: [],
    deathBoard: null,
    persona,
    notes: [],
    ready: false,
  };
}

export class BgGame {
  s: BgState;

  constructor(s: BgState) {
    this.s = s;
    setParadox(s.paradox);
  }

  static create(o: NewGameOptions): BgGame {
    const rngState = { rng: o.seed | 0 || 1 };
    const r = () => nextRandom(rngState);
    let tribes = o.tribes ?? shuffleWith([...TRIBES], r).slice(0, 5);
    // 異象：這局的特殊規則（「任務」「夥伴」異象會開啟那個系統）
    let anomaly: string | null = null;
    if (typeof o.anomaly === 'string') anomaly = o.anomaly;
    else if (o.anomaly) {
      const fits = ANOMALIES.filter((a) => anomalyFits(a, tribes, { buddies: !!o.buddies, timewarp: !!o.timewarp }));
      anomaly = fits[Math.floor(r() * fits.length)]?.id ?? null;
    }
    const an = anomaly ? RELIC_SPEC.get(anomaly) : undefined;
    if (an?.tribes) tribes = an.tribes(tribes, [...TRIBES]);
    const players = [newPlayer(0, o.humanName, true), ...o.ais.map((a, i) => newPlayer(i + 1, a.name, false, a.persona))];
    // 黑暗悖論：每局隨機的等級、身材與黑暗贈禮
    const ptier = 1 + Math.floor(r() * 6);
    const paradox = {
      tier: ptier,
      atk: 2 * ptier + Math.floor(r() * 3),
      hp: 2 * ptier + 1 + Math.floor(r() * 3),
      gift: GIFT_IDS.filter((x) => !x.endsWith('t11'))[Math.floor(r() * (GIFT_IDS.length - 1))],
    };
    const g = new BgGame({
      paradox,
      rng: rngState.rng,
      uid: 1,
      round: 0,
      phase: 'hero',
      tribes,
      pool: {},
      players,
      heroOffers: {},
      pairs: [],
      combats: [],
      anomaly,
      trinkets: o.trinkets ?? false,
      timewarp: !!o.timewarp,
      quests: !!o.quests || anomaly === 'BG27_Anomaly_Quests',
      buddies: !!o.buddies || anomaly === 'BG27_Anomaly_Buddies',
    });
    for (const id of POOL_IDS) if (g.idInLobby(id)) g.s.pool[id] = COPIES[tierOf(id)] ?? 7;
    // 英雄：每個人拿到不重複的選擇
    const heroes = shuffleWith(
      HEROES.filter((h) => heroAvailable(h, tribes)).map((h) => h.id),
      () => g.rand(),
    );
    const choices = o.heroChoices ?? 4;
    let k = 0;
    for (const p of players) {
      const n = p.isHuman ? choices : Math.min(choices, Math.max(2, Math.floor((heroes.length - choices) / (players.length - 1))));
      g.s.heroOffers[p.idx] = heroes.slice(k, k + n);
      k += n;
    }
    return g;
  }

  // —— 基本工具 ——
  rand(): number {
    return nextRandom(this.s);
  }
  pick<T>(arr: T[]): T | undefined {
    return arr.length ? arr[Math.floor(this.rand() * arr.length)] : undefined;
  }
  nextUid(): number {
    return this.s.uid++;
  }
  make(id: string, golden = false): BMinion {
    return makeMinion(id, golden, this.nextUid());
  }
  player(i: number): BPlayer {
    return this.s.players[i];
  }
  get human(): BPlayer {
    return this.s.players[0];
  }
  get round(): number {
    return this.s.round;
  }
  alive(): BPlayer[] {
    return this.s.players.filter((p) => p.alive);
  }
  /** 這張卡屬於這一局（中立或至少一個種族在這局） */
  idInLobby(id: string): boolean {
    const races = racesOf(id);
    return !races.length || races.length === TRIBES.length || races.some((r) => this.s.tribes.includes(r));
  }
  /** 有在卡池裡的卡（可以被發現 / 隨機拿到） */
  poolIds(filter: (id: string) => boolean = () => true): string[] {
    return Object.keys(this.s.pool).filter((id) => filter(id));
  }

  // —— 卡池 ——
  /** 從卡池抽一張（依剩下的份數加權） */
  draw(filter: (id: string) => boolean): string | undefined {
    let total = 0;
    const ids: string[] = [];
    for (const [id, n] of Object.entries(this.s.pool)) {
      if (n <= 0 || !filter(id)) continue;
      ids.push(id);
      total += n;
    }
    if (!total) return undefined;
    let roll = this.rand() * total;
    for (const id of ids) {
      roll -= this.s.pool[id];
      if (roll <= 0) {
        this.s.pool[id]--;
        return id;
      }
    }
    const id = ids[ids.length - 1];
    this.s.pool[id]--;
    return id;
  }
  takeFromPool(id: string) {
    if ((this.s.pool[id] ?? 0) > 0) this.s.pool[id]--;
  }
  returnToPool(m: BMinion) {
    if (TOKENS.has(m.id) || !(m.id in this.s.pool)) return;
    this.s.pool[m.id] += m.golden ? 3 : 1;
  }

  /** 會觸發的被動效果：英雄能力、飾品、任務獎勵、這局的異象 */
  hooks(p: BPlayer): HeroSpec[] {
    const out: HeroSpec[] = [];
    const h = heroOf(p);
    if (h) out.push(h);
    const h2 = p.power2 ? HERO_SPEC.get(p.power2) : undefined;
    if (h2 && h2 !== h) out.push(h2);
    for (const id of p.relics ?? []) {
      const r = RELIC_SPEC.get(id);
      if (r) out.push(r as HeroSpec);
    }
    if (this.s.anomaly) {
      const a = RELIC_SPEC.get(this.s.anomaly);
      if (a) out.push(a as HeroSpec);
    }
    for (const id of p.secrets ?? []) {
      const sc = SECRET_SPEC.get(id);
      if (sc) out.push(sc as HeroSpec);
    }
    return out;
  }

  // —— 數值 ——
  minionCost(p: BPlayer, m?: BMinion): number {
    let cost = Infinity;
    for (const hk of this.hooks(p)) {
      const c = hk.minionCost?.(p, m);
      if (c !== undefined) cost = Math.min(cost, c);
    }
    // 親友折扣（暗月獎品）：手下只要 2 金幣
    if (p.c.prizeCost2) cost = Math.min(cost, 2);
    return cost === Infinity ? MINION_COST : cost;
  }
  refreshCost(p: BPlayer): number {
    if (p.freeRefreshes > 0) return 0;
    if (this.hooks(p).some((hk) => hk.noRefresh)) return 0;
    // 瑪格努斯‧曼納斯頓（夥伴）：每回合 2 次刷新免費
    if ((p.c['t:magnus'] ?? 0) < 2 * this.count(p, 'TB_BaconShop_HERO_49_Buddy')) return 0;
    if ((p.c.malch ?? 0) < p.board.filter((m) => m.id === 'BG26_524').length * 2) return 0;
    return this.hooks(p).find((hk) => hk.refreshCost !== undefined)?.refreshCost ?? REFRESH_COST;
  }
  upgradeCost(p: BPlayer): number {
    return Math.max(0, p.upgradeCost + this.hooks(p).reduce((n, hk) => n + (hk.upgradeExtra ?? 0), 0));
  }
  sellPrice(p: BPlayer, m: BMinion): number {
    for (const hk of this.hooks(p)) {
      const c = hk.sellPrice?.(p, m);
      if (c !== undefined) return c;
    }
    for (const { s } of specsOf(m)) if (s.sellPrice) return s.sellPrice(p, m);
    return SELL_PRICE;
  }
  /** 酒館的最高 / 最低等級（7 本、小小聯盟、鮑伯搖頭娃娃……） */
  maxTier(p: BPlayer): number {
    return this.hooks(p).find((hk) => hk.maxTier)?.maxTier ?? MAX_TIER;
  }
  minTier(p: BPlayer): number {
    return Math.max(1, ...this.hooks(p).map((hk) => hk.minTier ?? 1));
  }
  /** 酒館會出現的手下等級 */
  private shopTierOk(p: BPlayer, id: string): boolean {
    const t = tierOf(id);
    if (t > p.tier) return false;
    if (this.hooks(p).some((hk) => hk.onlyTier)) return t === p.tier;
    return t >= Math.min(p.tier, this.minTier(p));
  }
  mostCommonType(p: BPlayer): Tribe | undefined {
    return mostCommonType(p.board) ?? undefined;
  }
  /** 把手下變成金卡（保留加成；不給三合一獎勵） */
  goldenize(p: BPlayer, m: BMinion | undefined) {
    if (!m || m.golden) return;
    const base = this.make(m.id, false);
    const gold = this.make(m.id, true);
    m.atk += gold.atk - base.atk;
    m.hp += gold.hp - base.hp;
    m.golden = true;
    if (p.board.includes(m)) p.c.goldens = (p.c.goldens ?? 0) + 1;
  }
  /** 可以隨機施放的法術 */
  castable(id: string): boolean {
    return SPELL_SPEC.has(id) && id !== TRIPLE_REWARD && id !== LOCKBOX;
  }

  // —— 飾品、任務、夥伴 ——
  relicAvailable(p: BPlayer, r: RelicSpec): boolean {
    if ((p.relics ?? []).includes(r.id)) return false;
    if (r.needTribe && !this.s.tribes.includes(r.needTribe)) return false;
    const assoc = bgCard(r.id).assoc;
    if (assoc?.length && !assoc.some((t) => this.s.tribes.includes(t as Tribe))) return false;
    return true;
  }
  gainRelic(p: BPlayer, id: string) {
    (p.relics ??= []).push(id);
    RELIC_SPEC.get(id)?.onGain?.(this, p);
  }
  /** 飾品商店：4 個選項，至少一個買得起 */
  offerTrinkets(p: BPlayer, kind: 'lesser' | 'greater') {
    if (p.c.nextLesser && kind === 'greater') {
      kind = 'lesser';
      p.c.nextLesser = 0;
    }
    const bag = RELICS.filter((r) => r.kind === kind && this.relicAvailable(p, r)).map((r) => r.id);
    const options: string[] = [];
    while (options.length < 4 && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    if (!options.some((id) => relicCost(id) <= p.gold)) {
      const cheap = bag.filter((id) => relicCost(id) <= p.gold);
      if (cheap.length) options[options.length - 1] = cheap[Math.floor(this.rand() * cheap.length)];
    }
    const d: Discover = { options, title: kind === 'lesser' ? '次級飾品商店：選擇一個飾品購買' : '強效飾品商店：選擇一個飾品購買', relics: kind };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }
  /** 飾品的價格（全都買不起的話，用剩下的金幣買） */
  relicPrice(p: BPlayer, d: Discover, id: string): number {
    if (d.relics === 'reward') return 0;
    const cost = relicCost(id);
    if (cost <= p.gold) return cost;
    return d.options.some((x) => relicCost(x) <= p.gold) ? Infinity : p.gold;
  }
  /** 第 4 回合：從 3 個任務中選一個（每個任務有不同的獎勵）；戴納瑟斯王開局從 2 個選 */
  offerQuests(p: BPlayer, n = 3) {
    p.c.questOffered = 1;
    const qs = [...QUESTS];
    const rs = REWARDS.filter((id) => this.relicAvailable(p, RELIC_SPEC.get(id)!));
    const options: string[] = [];
    const rewards: string[] = [];
    while (options.length < n && qs.length && rs.length) {
      options.push(qs.splice(Math.floor(this.rand() * qs.length), 1)[0].id);
      rewards.push(rs.splice(Math.floor(this.rand() * rs.length), 1)[0]);
    }
    if (!options.length) return;
    const d: Discover = { options, rewards, title: '選擇一個任務' };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }
  /** 任務完成了沒（完成就拿到獎勵） */
  checkQuest(p: BPlayer) {
    const pr = questProgress(p);
    if (!pr || pr[0] < pr[1] || !p.quest) return;
    const reward = p.quest.reward;
    p.quest = null;
    p.c.questsDone = (p.c.questsDone ?? 0) + 1;
    this.gainRelic(p, reward);
  }
  /** 這位英雄的夥伴（沒開啟或沒有實作 = null） */
  buddyId(p: BPlayer): string | null {
    if (!this.s.buddies) return null;
    const id = `${p.heroId}_Buddy`;
    return BUDDY_IDS.has(id) ? id : null;
  }
  private buddyBase(id: string): number {
    return 4 + 2 * tierOf(id);
  }
  buddyState(p: BPlayer): { id: string; cost: number; usable: boolean; reason: string | null } | null {
    const id = this.buddyId(p);
    if (!id || !p.buddy) return null;
    const cost = p.buddy.cost;
    if (p.buddy.presses >= 2) return { id, cost, usable: false, reason: '已經拿過 2 次了' };
    if (p.gold < cost) return { id, cost, usable: false, reason: '金幣不夠' };
    if (p.hand.length >= HAND_MAX) return { id, cost, usable: false, reason: '手牌已滿' };
    return { id, cost, usable: true, reason: null };
  }
  /** 按下夥伴按鈕：拿到夥伴（2 張就能做成金卡） */
  pressBuddy(pi: number) {
    const p = this.player(pi);
    this.ensure(p);
    const st = this.buddyState(p);
    if (!st?.usable || !p.buddy) throw new BgError(st?.reason ?? '沒有夥伴');
    this.spend(p, st.cost);
    p.buddy.presses++;
    p.buddy.cost = this.buddyBase(st.id);
    this.addMinion(p, this.make(st.id));
  }
  /** 畢勾沃斯式的發現：選項是現成的手下 */
  offerObjs(p: BPlayer, objs: BMinion[], title: string) {
    const d: Discover = { options: objs.map((m) => m.id), objs, title };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }
  /** 招募階段顯示的身材（含光環與直到下回合的加成） */
  eff(p: BPlayer, m: BMinion): { atk: number; hp: number; kw: Record<Keyword, boolean> } {
    const [a, h] = auraOf(p.c, m, p.hp);
    const kw = { taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, stealth: m.stealth };
    for (const k of m.tmpKw) kw[k] = true;
    return { atk: m.atk + m.tmpAtk + a, hp: m.hp + m.tmpHp + h, kw };
  }
  count(p: BPlayer, id: string): number {
    return p.board.filter((m) => m.id === id).reduce((n, m) => n + (m.golden ? 2 : 1), 0);
  }

  // —— 英雄 ——
  pickHero(pi: number, heroId: string) {
    const p = this.player(pi);
    if (this.s.phase !== 'hero' || p.heroId) throw new BgError('現在不能選英雄');
    if (!this.s.heroOffers[pi]?.includes(heroId)) throw new BgError('不能選這個英雄');
    const spec = HERO_SPEC.get(heroId);
    p.heroId = heroId;
    p.hp = spec?.health ?? HERO_HP;
    p.armor = spec?.health ? 0 : bgCard(heroId).armor ?? 0;
    if (this.s.players.every((x) => x.heroId)) this.startGame();
  }

  private startGame() {
    for (const p of this.s.players) for (const hk of this.hooks(p)) hk.startGame?.(this, p);
    this.startRound();
  }

  // —— 回合 ——
  startRound() {
    this.s.round++;
    this.s.phase = 'recruit';
    this.s.combats = [];
    this.pair();
    for (const p of this.alive()) this.startTurn(p);
  }

  private startTurn(p: BPlayer) {
    p.ready = false;
    p.c.spent = 0;
    p.c.malch = 0;
    p.c.elemTurn = 0;
    p.c.trail = 0;
    for (const k of Object.keys(p.c)) if (k.startsWith('t:')) delete p.c[k];
    const base = this.hooks(p).find((hk) => hk.goldBase)?.goldBase?.(this.s.round) ?? goldForTurn(this.s.round);
    p.gold = base + p.maxGoldBonus + p.nextGold + (p.c.nextGoldC ?? 0) + (p.c.carry ?? 0);
    p.c.nextGoldC = 0;
    p.c.carry = 0;
    p.freeRefreshes += (p.c.freeRefC ?? 0) + (p.c.prizeRef1 ?? 0) + 5 * (p.c.prizeRef5 ?? 0);
    // 戰鬥中增加的金幣上限（回收者、劫掠者）
    p.maxGoldBonus += p.c.maxGoldC ?? 0;
    p.gold += p.c.maxGoldC ?? 0;
    p.c.maxGoldC = 0;
    p.c.freeRefC = 0;
    // 費林大使、詹莉‧伊夏：跳過前幾回合
    if (this.s.round <= (p.c.skip ?? 0)) p.gold = 0;
    p.nextGold = 0;
    if (this.s.round > 1 && p.tier < this.maxTier(p)) p.upgradeCost = Math.max(0, p.upgradeCost - 1);
    for (const m of [...p.board, ...p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : []))]) {
      m.tmpAtk = 0;
      m.tmpHp = 0;
      m.tmpKw = [];
    }
    p.powerUses = 0;
    p.power2Uses = 0;
    // 戰鬥中加的惡魔食料（陷阱拍手者）
    for (let k = 0; k < (p.c.fodder3 ?? 0); k++) (p.fodder ??= []).push(3);
    p.c.fodder3 = 0;
    // 戰鬥中拿到的帶鎖箱（被鎖住的叛變者）
    for (let k = 0; k < (p.c.lockbox ?? 0); k++) this.recruit(p).lockbox();
    p.c.lockbox = 0;
    // 帶鎖箱：倒數，打開時拿到一張隨機有種族的金卡
    for (const h of [...p.hand]) {
      if (h.kind !== 'spell' || h.id !== LOCKBOX) continue;
      h.turns = (h.turns ?? 5) - 1;
      if (h.turns > 0) continue;
      p.hand = p.hand.filter((x) => x !== h);
      const id = this.draw((x) => tierOf(x) <= p.tier && racesOf(x).length > 0);
      if (id) this.addMinion(p, this.make(id, true));
    }
    if (p.frozen) p.frozen = false;
    else this.refreshShop(p);
    const r = this.recruit(p);
    // 贏家的麵包、時間管理：上回合留下來的效果
    for (const a of p.after) {
      const m = a.won ? p.board.find((x) => x.uid === a.uid) : undefined;
      if (m) r.spellBuff(m, 4, 6);
    }
    p.after = p.after.filter((a) => a.won === undefined);
    for (let k = 0; k < (p.c.timeMgmt ?? 0); k++) for (const m of p.board) for (let t = 0; t < 2; t++) r.spellBuff(m, 2, 2);
    p.c.timeMgmt = 0;
    for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.startTurn?.(r, m, g);
    // 飾品商店（第 6、9 回合）、任務（第 4 回合）、夥伴按鈕
    if (this.s.trinkets) {
      if (this.s.round === (p.c.lesserAt || 6)) this.offerTrinkets(p, 'lesser');
      if (this.s.round === (p.c.greaterAt || 9)) this.offerTrinkets(p, 'greater');
    }
    if (this.s.quests && this.s.round === 4 && !p.c.questOffered) this.offerQuests(p);
    if (this.s.timewarp) {
      const both = this.hooks(p).some((hk) => hk.majorTwice);
      if (!both && this.s.round === (p.c.minorAt || 6)) this.offerTimewarp(p, 'minor');
      if (this.s.round === (p.c.majorAt || 9) || (both && this.s.round === 8)) this.offerTimewarp(p, 'major');
    }
    // 時光扭曲買到的：每回合的刺眼戒指、魔法套索；大贏家每 3 回合
    for (let k = 0; k < (p.c.twRing ?? 0); k++) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: 'BG28_168', g: 1 });
    for (let k = 0; k < (p.c.twLasso ?? 0); k++) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: 'BG28_512', g: 1 });
    if (p.c.bigWinner && this.s.round > p.c.bigWinner && (this.s.round - p.c.bigWinner) % 3 === 0) this.discoverPrize(p, 3);
    const bud = this.buddyId(p);
    if (bud) {
      if (!p.buddy) p.buddy = { cost: this.buddyBase(bud), presses: 0 };
      else if (this.s.round > 1) p.buddy.cost = Math.max(tierOf(bud), p.buddy.cost - 1);
    }
    for (const hk of this.hooks(p)) hk.startTurn?.(this, p);
    // 阮大師：每回合從 2 個新的英雄能力中挑選一個
    if (p.heroId === 'BG20_HERO_202') this.offerPowers(p, 2, '阮大師：選擇這回合的英雄能力');
    for (const m of p.board) this.giveSpellcraft(p, m);
    // 時間流轉（黑暗贈禮）：回合結束效果在回合開始時也觸發
    for (const m of [...p.board]) if (hasGift(m, 21)) for (const { s, g } of specsOf(m)) s.endTurn?.(r, m, g);
  }

  private giveSpellcraft(p: BPlayer, m: BMinion) {
    for (const { s, g } of specsOf(m)) if (s.spellcraft) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: s.spellcraft, g, temp: true });
  }

  private endTurn(p: BPlayer) {
    const r = this.recruit(p);
    // 德拉克瑞附魔師、魯西弗隆（夥伴）、恐怖貼紙：回合結束效果多觸發
    const drakkari =
      p.board.reduce((n, m) => n + (m.id === 'BG26_ICC_901' || m.id === 'TB_BaconShop_HERO_11_Buddy' ? (m.golden ? 2 : 1) : 0), 0) +
      this.hooks(p).reduce((n, hk) => n + (hk.eotExtra ?? 0), 0);
    if (p.gold > 0) p.c['q:unspent'] = (p.c['q:unspent'] ?? 0) + 1;
    for (let t = 0; t <= drakkari; t++) {
      for (const m of [...p.board]) {
        if (!p.board.includes(m)) continue;
        for (const { s, g } of specsOf(m)) s.endTurn?.(r, m, g);
      }
      for (const hk of this.hooks(p)) hk.endTurn?.(this, p);
    }
    p.hand = p.hand.filter((h) => !(h.kind === 'spell' && h.temp));
    // 無限金幣（暗月獎品）：回合結束時回到手牌
    for (let k = 0; k < (p.c['t:infGold'] ?? 0); k++) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: 'BGS_Treasures_014', g: 1 });
    // 轉墓術：這回合打出的不死族會死亡
    for (const m of p.board.filter((x) => x.doom === this.s.round)) p.board = p.board.filter((x) => x !== m);
    // 還沒選的發現：自動選（飾品選買得起的）
    while (p.discover) this.choose(p.idx, this.autoChoice(p));
    this.checkQuest(p);
  }

  /** 沒選的發現自動選哪一個 */
  autoChoice(p: BPlayer): number {
    const d = p.discover;
    if (d?.timewarp) {
      let best = -1;
      let bv = -Infinity;
      d.options.forEach((id, i) => {
        if (!this.canBuyWarp(p, id)) return;
        const v = tierOf(id) + twCost(id);
        if (v > bv) (bv = v), (best = i);
      });
      return best;
    }
    if (!d?.relics) return 0;
    const i = d.options.findIndex((id) => this.relicPrice(p, d, id) <= p.gold);
    return Math.max(0, i);
  }

  // —— 時光扭曲 ——
  /** 時光扭曲商店：4 個手下 + 2 張法術，用時光晶幣購買 */
  offerTimewarp(p: BPlayer, kind: 'minor' | 'major') {
    const ok = (id: string) => twKind(id) === kind && this.idInLobby(id);
    const minions = TW_IDS().filter((id) => ok(id) && bgCard(id).type === 'MINION');
    const spells = TW_IDS().filter((id) => ok(id) && bgCard(id).type !== 'MINION');
    const pickN = (arr: string[], n: number) => {
      const bag = [...arr];
      const out: string[] = [];
      while (out.length < n && bag.length) out.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
      return out;
    };
    const options = [...pickN(minions, 4), ...pickN(spells, 2)];
    if (!options.length) return;
    let chronum = 2 + (p.c.chronumNext ?? 0) + this.hooks(p).reduce((n, hk) => n + (hk.chronumExtra ?? 0), 0);
    p.c.chronumNext = 0;
    // 扭曲沙漏：4 枚時光晶幣都可以在次級時光扭曲用掉
    if (kind === 'minor' && this.hooks(p).some((hk) => hk.chronumPool)) chronum += 2;
    const golden = this.hooks(p).some((hk) => hk.goldenWarp === kind);
    const d: Discover = { options, title: kind === 'minor' ? '次級時光扭曲：用時光晶幣購買' : '高級時光扭曲：用時光晶幣購買', timewarp: kind, chronum, golden, noPool: true };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }
  /** 這張時光扭曲的卡現在買得起、拿得到嗎 */
  canBuyWarp(p: BPlayer, id: string): boolean {
    const d = p.discover;
    return !!d?.timewarp && twCost(id) <= (d.chronum ?? 0) && (p.hand.length < HAND_MAX || !!TW_SPELL_SPEC.get(id)?.whenBought);
  }
  /** 在時光扭曲買一張卡（i = -1 離開） */
  private buyTimewarp(p: BPlayer, i: number) {
    const d = p.discover!;
    const close = () => {
      // 扭曲沙漏：沒用完的帶到高級時光扭曲
      if (d.timewarp === 'minor' && this.hooks(p).some((hk) => hk.chronumPool)) p.c.chronumNext = (p.c.chronumNext ?? 0) + (d.chronum ?? 0);
      p.discover = p.dq.shift() ?? null;
    };
    if (i < 0 || i >= d.options.length) return close();
    const id = d.options[i];
    const cost = twCost(id);
    if (cost > (d.chronum ?? 0)) throw new BgError('時光晶幣不夠');
    if (p.hand.length >= HAND_MAX && !TW_SPELL_SPEC.get(id)?.whenBought) throw new BgError('手牌已滿');
    d.chronum = (d.chronum ?? 0) - cost;
    d.options = d.options.filter((_, k) => k !== i);
    if (bgCard(id).type === 'MINION') this.addMinion(p, this.make(id, !!d.golden));
    else if (TW_SPELL_SPEC.get(id)?.whenBought) this.castSpec(p, id, null, 1, 0);
    else this.addHand(p, { kind: 'spell', uid: this.nextUid(), id, g: 1 });
    if (!d.options.some((x) => this.canBuyWarp(p, x))) close();
  }
  /** 從時光扭曲的卡裡發現（不用時光晶幣） */
  offerTimewarpCards(p: BPlayer, filter: (id: string) => boolean, title: string, lock = false) {
    const bag = TW_IDS().filter((id) => filter(id) && this.idInLobby(id));
    const options: string[] = [];
    while (options.length < 3 && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    const d: Discover = { options, title, noPool: true, lock };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }

  /** 配對：盡量不要連續遇到同一個人；人數是單數時，有人打殘影 */
  private pair() {
    const alive = this.alive().map((p) => p.idx);
    let best: [number, number][] = [];
    let bestCost = Infinity;
    for (let t = 0; t < 40; t++) {
      const order = shuffleWith([...alive], () => this.rand());
      const pairs: [number, number][] = [];
      let cost = 0;
      for (let i = 0; i < order.length; i += 2) {
        const a = order[i];
        const b = i + 1 < order.length ? order[i + 1] : -1;
        pairs.push([a, b]);
        const pa = this.player(a);
        if (b >= 0 && pa.lastOpp === b) cost += 10;
        if (b >= 0 && pa.seen[b] && this.s.round - pa.seen[b].round <= 2) cost += 3;
        if (b < 0 && pa.lastOpp === -1) cost += 5;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = pairs;
        if (!cost) break;
      }
    }
    this.s.pairs = best;
  }

  /** 這回合的對手（-1 = 殘影） */
  opponentOf(pi: number): number | null {
    for (const [a, b] of this.s.pairs) {
      if (a === pi) return b;
      if (b === pi) return a;
    }
    return null;
  }

  ghost(): BPlayer | null {
    const dead = this.s.players.filter((p) => !p.alive && p.deathBoard);
    if (!dead.length) return null;
    return dead.reduce((a, b) => ((b.diedRound ?? 0) >= (a.diedRound ?? 0) ? b : a));
  }

  // —— 酒館 ——
  refreshShop(p: BPlayer, opts: { higher?: number; hooks?: boolean; tribe?: Tribe } = {}) {
    // 單獨凍結的手下（瓦登‧晨握）留下來一次
    const kept = p.shop.filter((m) => m.iced);
    for (const m of p.shop) if (!m.iced) this.returnToPool(m);
    for (const m of kept) m.iced = false;
    p.shop = kept;
    const hooks = this.hooks(p);
    const full = hooks.some((hk) => hk.shopFull) || !!p.c.full7;
    const size = Math.max(1, (full ? 7 : SHOP_SIZE[p.tier] + hooks.reduce((n, hk) => n + (hk.shopExtra ?? 0), 0)) - kept.length);
    const only = hooks.find((hk) => hk.onlyTribe)?.onlyTribe;
    const tribe = opts.tribe ?? only;
    for (let i = 0; i < size; i++) {
      const id = this.draw((x) => this.shopTierOk(p, x) && (!tribe || racesOf(x).includes(tribe)));
      if (id) p.shop.push(this.shopMinion(p, id));
    }
    // 酒館法術：每次刷新一張（有些飾品多一張）
    p.shopSpells = [];
    const spells = 1 + hooks.reduce((n, hk) => n + (hk.shopSpellsExtra ?? 0), 0);
    for (let k = 0; k < spells; k++) {
      const spell = this.randomSpell(p, (id) => tierOf(id) <= p.tier);
      if (spell) p.shopSpells.push({ uid: this.nextUid(), id: spell });
    }
    const higher = (opts.higher ?? 0) + hooks.reduce((n, hk) => n + (hk.shopHigher ?? 0), 0);
    for (let i = 0; i < higher && p.tier < this.maxTier(p); i++) {
      const id = this.draw((x) => tierOf(x) === p.tier + 1);
      if (id) p.shop.push(this.shopMinion(p, id));
    }
    // 招募新夥伴（暗月獎品）：多一個 +2/+2 的手下
    for (let i = 0; i < (p.c.prizeShop ?? 0); i++) {
      const id = this.draw((x) => this.shopTierOk(p, x));
      if (!id) continue;
      const m = this.shopMinion(p, id);
      m.atk += 2;
      m.hp += 2;
      p.shop.push(m);
    }
    for (const hk of this.hooks(p)) hk.onRefresh?.(this, p);
    // 蘋果（時光扭曲）：刷新後施放蘋果大放送
    for (let k = 0; k < (p.c.twApples ?? 0); k++) this.castRandom(p, 'BG28_966');
    // 精靈吹焰者、東來之風：刷新後隨機一個 +10/+10、+9/+9
    for (const [key, n] of [
      ['refreshBuff', 10],
      ['rb9', 9],
    ] as const) {
      for (let k = 0; k < (p.c[key] ?? 0); k++) {
        const m = this.pick(p.shop);
        if (!m) continue;
        m.atk += n;
        m.hp += n;
      }
    }
    // 波浪元素：刷新後隨機一個 +4/+4
    for (let k = 0; k < (p.c.rb4 ?? 0); k++) {
      const m = this.pick(p.shop);
      if (m) (m.atk += 4), (m.hp += 4);
    }
    // 惡魔食料：餵給隨機的友方惡魔，再補一個手下
    const fodders = (p.fodder ?? []).filter((n) => n > 0).length;
    p.fodder = (p.fodder ?? []).map((n) => n - 1).filter((n) => n > 0);
    for (let k = 0; k < fodders; k++) {
      const f = this.shopMinion(p, FODDER);
      const demon = this.pick(p.board.filter((m) => isRace(m.id, 'DEMON')));
      if (!demon) {
        p.shop.push(f);
        continue;
      }
      demon.atk += f.atk;
      demon.hp += f.hp;
      const id = this.draw((x) => tierOf(x) <= p.tier);
      if (id) p.shop.push(this.shopMinion(p, id));
    }
    // 鮮血寶石彈幕：每個手下 +2/+2 的鮮血寶石
    for (let k = 0; k < (p.c.barrage ?? 0); k++) {
      for (const m of p.shop) {
        m.atk += 2 * (1 + (p.c.gemA ?? 0));
        m.hp += 2 * (1 + (p.c.gemH ?? 0));
      }
    }
    if (opts.hooks !== false) {
      const r = this.recruit(p);
      for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.onRefresh?.(r, m, g);
    }
  }

  // —— 酒館法術 ——
  /** 這個法術在這局的酒館裡：相關種族要在這局 */
  spellInLobby(id: string): boolean {
    const assoc = bgCard(id).assoc;
    return !assoc?.length || assoc.some((t) => this.s.tribes.includes(t as Tribe));
  }

  randomSpell(_p: BPlayer, filter: (id: string) => boolean): string | undefined {
    return this.pick(TAVERN_SPELLS.filter((id) => this.spellInLobby(id) && filter(id)));
  }

  /** 酒吧精選、時光轉繞者：用酒館法術刷新酒館 */
  refreshWithSpells(p: BPlayer) {
    for (const m of p.shop) this.returnToPool(m);
    p.shop = [];
    p.frozen = false;
    p.shopSpells = [];
    for (let i = 0; i < SHOP_SIZE[p.tier]; i++) {
      const id = this.randomSpell(p, (x) => tierOf(x) <= p.tier);
      if (id) p.shopSpells.push({ uid: this.nextUid(), id });
    }
  }

  spellCost(p: BPlayer, id: string): number {
    let cost = spellCostOf(id) - (p.c.spellDisc ?? 0) - (p.c['t:spell1'] ?? 0);
    for (const hk of this.hooks(p)) if (hk.spellCost) cost = hk.spellCost(p, cost, id);
    return Math.max(0, cost);
  }

  buySpell(pi: number, uid: number) {
    const p = this.player(pi);
    this.ensure(p);
    const sp = p.shopSpells.find((x) => x.uid === uid);
    if (!sp) throw new BgError('酒館裡沒有這張法術');
    if (p.hand.length >= HAND_MAX) throw new BgError('手牌已滿');
    const cost = this.spellCost(p, sp.id);
    // 急忙挖掘：用生命值購買
    const health = sp.id === 'BG28_571';
    if (!health && p.gold < cost) throw new BgError('金幣不夠');
    p.shopSpells = p.shopSpells.filter((x) => x !== sp);
    if (health) this.hurtHero(p, cost);
    else this.spend(p, cost);
    p.c.spellDisc = 0;
    p.c.cards = (p.c.cards ?? 0) + 1;
    this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: sp.id, g: 1 });
    const r = this.recruit(p);
    for (const x of [...p.board]) for (const { s, g } of specsOf(x)) s.onBuySpell?.(r, x, sp.id, g);
    for (const hk of this.hooks(p)) hk.onBuySpell?.(this, p, sp.id);
    this.checkQuest(p);
  }

  /** 「你的酒館法術額外 +X」 */
  spellExtra(p: BPlayer): [number, number] {
    const [a, h] = spellExtraOf(p.c, p.board);
    let x = a;
    let y = h;
    for (const hk of this.hooks(p)) {
      const e = hk.spellExtra?.(p);
      if (e) (x += e[0]), (y += e[1]);
    }
    return [x, y];
  }

  specOf(id: string) {
    return SPEC.get(id);
  }

  shopMinion(p: BPlayer, id: string): BMinion {
    // 黃金競技場：所有手下都是金卡
    const m = this.make(id, this.hooks(p).some((hk) => hk.allGolden));
    const [a, h] = this.tavernBonus(p, m);
    m.atk += a;
    m.hp += h;
    for (const hk of this.hooks(p)) hk.onShopMinion?.(this, p, m);
    return m;
  }

  private tavernBonus(p: BPlayer, m: BMinion): [number, number] {
    let a = p.c.tavA ?? 0;
    let h = p.c.tavH ?? 0;
    for (const t of racesOf(m.id)) {
      a += p.c[`tav:${t}:A`] ?? 0;
      h += p.c[`tav:${t}:H`] ?? 0;
    }
    for (const hk of this.hooks(p)) {
      const hb = hk.shopBuff?.(p, m, this);
      if (hb) {
        a += hb[0];
        h += hb[1];
      }
    }
    return [a, h];
  }

  // —— 手牌 ——
  addHand(p: BPlayer, card: HandCard): boolean {
    if (p.hand.length >= HAND_MAX) return false;
    p.hand.push(card);
    if (card.kind === 'minion') this.checkTriple(p, card.m.id);
    if (this.s.phase === 'recruit' || this.s.phase === 'combat') {
      p.c['q:cards'] = (p.c['q:cards'] ?? 0) + 1;
      const r = this.recruit(p);
      for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.onGetCard?.(r, m, g);
      for (const hk of this.hooks(p)) hk.onGetCard?.(this, p, card);
    }
    return true;
  }

  addMinion(p: BPlayer, m: BMinion): boolean {
    return this.addHand(p, { kind: 'minion', uid: m.uid, m });
  }

  private checkTriple(p: BPlayer, id: string) {
    const need = Math.min(3, ...this.hooks(p).map((hk) => hk.tripleNeed ?? hk.tripleNeedFor?.(id) ?? 3), BUDDY_IDS.has(id) ? 2 : 3);
    const all = [...p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : [])), ...p.board].filter((m) => !m.golden);
    // 驚奇元素可以和任何元素組成三連
    if (id === 'BG33_890t') return; // 魔術魚學徒不能三連
    if (id === SURPRISE) {
      for (const x of new Set(all.filter((m) => m.id !== SURPRISE && isRace(m.id, 'ELEMENTAL')).map((m) => m.id))) this.checkTriple(p, x);
      return;
    }
    let copies = all.filter((m) => m.id === id);
    if (isRace(id, 'ELEMENTAL') && copies.length < need) copies = [...copies, ...all.filter((m) => m.id === SURPRISE)];
    if (copies.length < need) return;
    const used = copies.slice(0, need);
    const base = this.make(id, false);
    const golden = this.make(id, true);
    for (const m of used) {
      const b = m.id === id ? base : this.make(m.id, false);
      golden.atk += m.atk - b.atk;
      golden.hp += m.hp - b.hp;
      for (const k of ['taunt', 'shield', 'windfury', 'venom', 'reborn'] as Keyword[]) if (m[k] && !base[k]) golden[k] = true;
      golden.mags.push(...m.mags);
      golden.n = Math.max(golden.n, m.n);
    }
    golden.reward = true;
    p.board = p.board.filter((m) => !used.includes(m));
    p.hand = p.hand.filter((h) => !(h.kind === 'minion' && used.includes(h.m)));
    p.hand.push({ kind: 'minion', uid: golden.uid, m: golden });
    p.triples++;
  }

  // —— 發現 ——
  discoverFor(p: BPlayer, filter: (id: string) => boolean, title: string, extra: Partial<Discover> = {}) {
    const ids = this.poolIds((id) => filter(id) && (this.s.pool[id] ?? 0) > 0);
    const options: string[] = [];
    const bag = [...ids];
    while (options.length < 3 && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    const d: Discover = { options, title, ...extra };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }

  /** 英雄專屬的選擇 */
  private pickHeroChoice(p: BPlayer, kind: NonNullable<Discover['pick']>, id: string) {
    if (kind === 'cariel') {
      if (id.endsWith('p_t1')) p.c.carN = (p.c.carN ?? 0) + 1;
      else if (id.endsWith('Buddyt3')) p.c.carA = (p.c.carA ?? 0) + 2;
      else p.c.carH = (p.c.carH ?? 0) + 2;
    } else if (kind === 'flight') {
      const n = Number(id.slice(-1));
      p.c.flight = n;
      p.c.flightAt = this.s.round + n;
    } else if (kind === 'protoss') p.protoss = id;
    else if (kind === 'secret') (p.secrets ??= []).push(id);
  }
  /** 選項是英雄專屬的選擇 */
  offerPick(p: BPlayer, kind: NonNullable<Discover['pick']>, options: string[], title: string) {
    if (!options.length) return;
    const d: Discover = { options, title, pick: kind };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }

  /** 發現一個暗月馬戲團獎品 */
  discoverPrize(p: BPlayer, tier: number) {
    const bag = PRIZE_IDS.filter((id) => prizeTier(id) === tier && (bgCard(id).type === 'MINION' || this.spellInLobby(id)));
    const options: string[] = [];
    while (options.length < 3 && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    const d: Discover = { options, title: `發現一個等級 ${tier} 的暗月馬戲團獎品`, spells: true };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }

  /** 發現一個有黑暗贈禮的手下（每個選項的贈禮都不同） */
  discoverGift(p: BPlayer, filter: (id: string) => boolean, title: string, extra: Partial<Discover> = {}) {
    const ids = this.poolIds((id) => filter(id) && id !== PARADOX && (this.s.pool[id] ?? 0) > 0);
    const options: string[] = [];
    const bag = [...ids];
    while (options.length < 3 && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    const gb = [...GIFT_IDS];
    const gifts = options.map(() => gb.splice(Math.floor(this.rand() * gb.length), 1)[0]);
    const d: Discover = { options, gifts, title, ...extra };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }
  /** 「黑暗贈禮！」異象：第 3 回合起，花 3 金幣發現一個有黑暗贈禮的手下（一局 3 次） */
  darkState(p: BPlayer): { cost: number; usable: boolean; reason: string | null; left: number } | null {
    if (this.s.anomaly !== 'BG36_Anomaly_002') return null;
    const left = 3 - (p.c.darkUses ?? 0);
    if (left <= 0) return { cost: 3, usable: false, reason: '已經用完了', left };
    if (this.s.round < 3) return { cost: 3, usable: false, reason: '第 3 回合起才能使用', left };
    if (p.gold < 3) return { cost: 3, usable: false, reason: '金幣不夠', left };
    return { cost: 3, usable: true, reason: null, left };
  }
  pressDark(pi: number) {
    const p = this.player(pi);
    this.ensure(p);
    const st = this.darkState(p);
    if (!st?.usable) throw new BgError(st?.reason ?? '不能使用');
    this.spend(p, 3);
    p.c.darkUses = (p.c.darkUses ?? 0) + 1;
    const top = Math.min(this.maxTier(p), p.tier + 1);
    this.discoverGift(p, (id) => tierOf(id) === p.tier || tierOf(id) === top, `黑暗發現：發現一個旅店等級 ${p.tier}${top > p.tier ? ` 或 ${top}` : ''} 有黑暗贈禮的手下`);
  }

  discoverSpell(p: BPlayer, filter: (id: string) => boolean, title: string) {
    const bag = TAVERN_SPELLS.filter((id) => this.spellInLobby(id) && filter(id));
    const options: string[] = [];
    while (options.length < 3 && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    const d: Discover = { options, title, spells: true };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }

  choose(pi: number, i: number) {
    const p = this.player(pi);
    const d = p.discover;
    if (!d) throw new BgError('沒有正在發現的卡');
    if (d.timewarp) return this.buyTimewarp(p, i);
    const id = d.options[Math.max(0, Math.min(d.options.length - 1, i))];
    // 飾品：付錢後拿到
    if (d.relics) {
      const price = this.relicPrice(p, d, id);
      if (price > p.gold) throw new BgError('金幣不夠');
      p.discover = p.dq.shift() ?? null;
      this.spend(p, price);
      this.gainRelic(p, id);
      return;
    }
    // 任務：記下現在的進度
    if (d.rewards) {
      p.discover = p.dq.shift() ?? null;
      const k = Math.max(0, Math.min(d.options.length - 1, i));
      const spec = QUEST_SPEC.get(id)!;
      p.quest = { id, reward: d.rewards[k], need: spec.need, start: spec.key ? p.c[spec.key] ?? 0 : 0 };
      this.checkQuest(p);
      return;
    }
    p.discover = p.dq.shift() ?? null;
    const rr = this.recruit(p);
    for (const x of [...p.board]) for (const { s, g } of specsOf(x)) s.onDiscover?.(rr, x, g);
    if (!d.powers && !d.objs && d.guess === undefined && d.replace === undefined) for (const hk of this.hooks(p)) hk.onDiscover?.(this, p, id);
    if (d.spells) {
      // 暗月獎品裡有一張是手下（全知長者）
      if (bgCard(id).type === 'MINION') this.addMinion(p, this.make(id));
      else this.addHand(p, { kind: 'spell', uid: this.nextUid(), id, g: 1 });
      return;
    }
    // 巴羅夫：押注
    if (d.bet) {
      p.wager = d.bet[Math.max(0, Math.min(d.bet.length - 1, i))];
      return;
    }
    // 凱莉根：蟲族變形（保留身材與附加效果）
    if (d.morph !== undefined) {
      const m = [...p.board, ...p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : []))].find((x) => x.uid === d.morph);
      if (m) {
        m.id = id;
        const base = this.make(id);
        for (const k of ['taunt', 'windfury', 'venom', 'stealth', 'shield', 'reborn'] as Keyword[]) if (base[k]) m[k] = true;
      }
      return;
    }
    if (d.pick) {
      this.pickHeroChoice(p, d.pick, id);
      return;
    }
    // 魚爾摩斯：猜對拿到旅店幸運幣
    if (d.guess !== undefined) {
      if (id === d.guess) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: COIN, g: 1 });
      return;
    }
    // 換英雄能力（slot2 = 第二個英雄能力）
    if (d.powers && d.slot2) {
      p.power2 = id;
      p.power2Uses = 0;
      p.power2Spent = false;
      HERO_SPEC.get(id)?.startGame?.(this, p);
      return;
    }
    if (d.powers) {
      p.powerHero = id;
      p.powerUses = 0;
      p.powerSpent = false;
      HERO_SPEC.get(id)?.startGame?.(this, p);
      return;
    }
    // 現成的手下（保留加成）
    if (d.objs) {
      const o = d.objs[Math.max(0, Math.min(d.objs.length - 1, i))];
      this.addMinion(p, { ...o, uid: this.nextUid(), mags: o.mags.slice(), tmpKw: [], tmpAtk: 0, tmpHp: 0 });
      return;
    }
    // 費林大使：之後才拿到
    if (d.reserve !== undefined) {
      this.takeFromPool(id);
      (p.reserve ??= []).push({ id, tier: d.reserve });
      this.giveReserved(p);
      return;
    }
    // 葛拉克朗：取代酒館裡的手下
    if (d.replace !== undefined) {
      const i2 = p.shop.findIndex((x) => x.uid === d.replace);
      this.takeFromPool(id);
      const n = this.shopMinion(p, id);
      if (i2 >= 0) {
        this.returnToPool(p.shop[i2]);
        p.shop[i2] = n;
      } else p.shop.push(n);
      return;
    }
    // 選項是法術（時光扭曲的卡可能是法術）
    if (bgCard(id).type !== 'MINION') {
      this.addHand(p, { kind: 'spell', uid: this.nextUid(), id, g: 1 });
      if (d.lock || d.lockTurns) p.hand[p.hand.length - 1].locked = this.s.round + (d.lockTurns ?? 1) - 1;
      return;
    }
    if (!d.noPool) this.takeFromPool(id);
    const m = this.make(id, !!d.golden);
    for (const k of d.kw ?? []) m[k] = true;
    // 黑暗贈禮（雙重幻象：多拿一張複製）
    const gift = d.gifts?.[Math.max(0, Math.min(d.options.length - 1, i))];
    if (gift) {
      attachGift(m, gift, this.s.round);
      if (gift.endsWith('t11')) {
        const copy = this.make(id, !!d.golden);
        attachGift(copy, gift, this.s.round);
        this.addMinion(p, copy);
      }
    }
    if (d.doom) m.doom = this.s.round;
    if (d.both) m.both = true;
    if (d.stats) [m.atk, m.hp] = d.stats;
    this.addMinion(p, m);
    if (d.lock || d.lockTurns) {
      const h = p.hand.find((x) => x.kind === 'minion' && x.m === m);
      if (h) h.locked = this.s.round + (d.lockTurns ?? 1) - 1;
    }
    if (d.hurt) this.hurtHero(p, tierOf(id));
  }

  /** 芬利、阮大師、揭露身分：發現一個英雄能力 */
  offerPowers(p: BPlayer, n: number, title: string, slot2 = false, exclude: string[] = []) {
    const bag = SWAPPABLE_POWERS().filter((id) => id !== (p.powerHero ?? p.heroId) && id !== p.power2 && !exclude.includes(id) && heroAvailable(HERO_SPEC.get(id)!, this.s.tribes));
    const options: string[] = [];
    while (options.length < n && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    const d: Discover = { options, title, powers: true, slot2 };
    if (p.discover) p.dq.push(d);
    else p.discover = d;
  }

  /** 費林大使：升到那個等級就拿到 */
  giveReserved(p: BPlayer) {
    const ready = (p.reserve ?? []).filter((x) => x.tier <= p.tier);
    p.reserve = (p.reserve ?? []).filter((x) => x.tier > p.tier);
    for (const x of ready) this.addMinion(p, this.make(x.id));
  }

  // —— 動作 ——
  private ensure(p: BPlayer) {
    if (this.s.phase !== 'recruit' || !p.alive) throw new BgError('現在不是招募階段');
    if (p.discover) throw new BgError('請先選擇要發現的卡');
  }

  spend(p: BPlayer, n: number) {
    if (n <= 0) return;
    p.gold -= n;
    p.c.spent = (p.c.spent ?? 0) + n;
    p.c.spentTotal = (p.c.spentTotal ?? 0) + n;
    const r = this.recruit(p);
    for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.onSpend?.(r, m, n, g);
    for (const hk of this.hooks(p)) hk.onSpend?.(this, p, n);
  }

  hurtHero(p: BPlayer, n: number) {
    if (n <= 0) return;
    const r0 = this.recruit(p);
    for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.onHeroHurt?.(r0, m, g, n);
    for (const hk of this.hooks(p)) hk.onHeroHurt?.(this, p, n);
    // 出土嘍囉（夥伴）：把傷害倒轉回去，獲得等量的身材
    const grunt = p.board.find((m) => m.id === 'TB_BaconShop_HERO_25_Buddy');
    if (grunt) {
      const g = grunt.golden ? 2 : 1;
      grunt.atk += n * g;
      grunt.hp += n * g;
      return;
    }
    // 靈魂倒轉者、灰燼腐化者：把傷害倒轉回去
    const rewinder = p.board.find((m) => m.id === 'BG26_174' || m.id === 'BG32_873');
    if (rewinder) {
      const g = rewinder.golden ? 2 : 1;
      if (rewinder.id === 'BG26_174') rewinder.hp += 2 * g;
      else for (const m of p.shop) (m.atk += 2 * g), (m.hp += 2 * g);
      return;
    }
    const fromArmor = Math.min(p.armor, n);
    p.armor -= fromArmor;
    p.hp = Math.max(1, p.hp - (n - fromArmor));
  }

  buy(pi: number, uid: number) {
    const p = this.player(pi);
    this.ensure(p);
    const i = p.shop.findIndex((m) => m.uid === uid);
    if (i < 0) throw new BgError('酒館裡沒有這個手下');
    const cost = this.minionCost(p, p.shop[i]);
    if (p.gold < cost) throw new BgError('金幣不夠');
    if (p.hand.length >= HAND_MAX) throw new BgError('手牌已滿');
    const [m] = p.shop.splice(i, 1);
    this.spend(p, cost);
    this.addMinion(p, m);
    p.c.bought = (p.c.bought ?? 0) + 1;
    p.c['t:buy'] = (p.c['t:buy'] ?? 0) + 1;
    p.c.cards = (p.c.cards ?? 0) + 1;
    const r = this.recruit(p);
    for (const x of [...p.board]) for (const { s, g } of specsOf(x)) s.onBuy?.(r, x, m, g);
    for (const hk of this.hooks(p)) hk.onBuy?.(this, p, m);
    this.checkQuest(p);
  }

  sell(pi: number, uid: number) {
    const p = this.player(pi);
    this.ensure(p);
    const m = p.board.find((x) => x.uid === uid);
    if (!m) throw new BgError('戰場上沒有這個手下');
    this.sellRaw(p, m);
  }

  /** 賣掉手下（效果用，不檢查階段） */
  sellRaw(p: BPlayer, m: BMinion) {
    const price = this.sellPrice(p, m);
    p.board = p.board.filter((x) => x !== m);
    p.gold += price;
    const r = this.recruit(p);
    for (const { s, g } of specsOf(m)) s.onSell?.(r, m, g);
    // 跳舞的戴瑞：帽子傳給另一個友方手下
    if (m.hat) {
      const to = this.pick(p.board);
      if (to) (to.atk += m.hat), (to.hp += m.hat), (to.hat = (to.hat ?? 0) + m.hat);
    }
    // 扭曲的憤怒守衛：賣掉手下後，下次刷新多一個惡魔食料
    for (const x of p.board) if (x.id === 'BG35_155') for (let k = 0; k < (x.golden ? 2 : 1); k++) (p.fodder ??= []).push(1);
    for (const hk of this.hooks(p)) hk.onSell?.(this, p, m);
    this.returnToPool(m);
    p.c['q:sell'] = (p.c['q:sell'] ?? 0) + 1;
    this.checkQuest(p);
  }

  move(pi: number, uid: number, to: number) {
    const p = this.player(pi);
    if (this.s.phase !== 'recruit') return;
    const i = p.board.findIndex((m) => m.uid === uid);
    if (i < 0) return;
    const [m] = p.board.splice(i, 1);
    p.board.splice(Math.max(0, Math.min(p.board.length, to)), 0, m);
  }

  freeze(pi: number) {
    const p = this.player(pi);
    if (this.s.phase !== 'recruit') return;
    p.frozen = !p.frozen;
  }

  refresh(pi: number) {
    const p = this.player(pi);
    this.ensure(p);
    if (this.hooks(p).some((hk) => hk.noRefresh)) throw new BgError('這局不能刷新酒館');
    if (p.freeRefreshes > 0) p.freeRefreshes--;
    else if ((p.c['t:magnus'] ?? 0) < 2 * this.count(p, 'TB_BaconShop_HERO_49_Buddy')) p.c['t:magnus'] = (p.c['t:magnus'] ?? 0) + 1;
    else {
      const malch = p.board.filter((m) => m.id === 'BG26_524').length * 2;
      if ((p.c.malch ?? 0) < malch) {
        p.c.malch = (p.c.malch ?? 0) + 1;
        this.hurtHero(p, 1);
      } else {
        const cost = this.refreshCost(p);
        if (p.gold < cost) throw new BgError('金幣不夠');
        this.spend(p, cost);
      }
    }
    p.frozen = false;
    p.c['t:rr'] = (p.c['t:rr'] ?? 0) + 1;
    p.c['q:refresh'] = (p.c['q:refresh'] ?? 0) + 1;
    this.refreshShop(p);
    for (const hk of this.hooks(p)) hk.onReroll?.(this, p);
    this.checkQuest(p);
  }

  upgrade(pi: number) {
    const p = this.player(pi);
    this.ensure(p);
    if (this.hooks(p).some((hk) => hk.noUpgrade)) throw new BgError('這局不能用金幣升級酒館');
    if (p.tier >= this.maxTier(p)) throw new BgError('已經是最高等級');
    const cost = this.upgradeCost(p);
    if (p.gold < cost) throw new BgError('金幣不夠');
    this.spend(p, cost);
    p.tier++;
    p.upgradeCost = UPGRADE_COST[p.tier + 1] ?? 0;
    this.giveReserved(p);
    for (const hk of this.hooks(p)) hk.onUpgrade?.(this, p);
  }

  /**
   * 打出手牌（手下或法術）
   * pos = 放在戰場的位置；target = 戰吼 / 法術 / 磁力的目標；choice = 二選一的選項
   */
  play(pi: number, uid: number, pos?: number, target?: number, choice = 0) {
    const p = this.player(pi);
    this.ensure(p);
    const card = p.hand.find((h) => h.uid === uid);
    if (!card) throw new BgError('手牌裡沒有這張卡');
    if ((card.locked ?? 0) >= this.s.round) throw new BgError('這張卡鎖定中，下回合才能使用');
    if (card.kind === 'spell') return this.cast(p, card, target, choice);
    const m = card.m;
    const r = this.recruit(p);
    const host = target !== undefined ? p.board.find((x) => x.uid === target) : undefined;
    if (host && canMagnetize(m, host)) {
      p.hand = p.hand.filter((h) => h !== card);
      this.magnetizeCard(p, host, m);
      this.afterPlay(p, m, host);
      this.discardPair(p, card);
      return;
    }
    if (p.board.length >= BOARD_MAX) throw new BgError('戰場已滿（最多 7 個手下）');
    const spec = SPEC.get(m.id);
    let bcTarget: BMinion | null = null;
    if (spec?.target) {
      const valid = p.board.filter((x) => spec.target!(m, x));
      if (valid.length) {
        bcTarget = valid.find((x) => x.uid === target) ?? null;
        if (!bcTarget) throw new BgError('請選擇戰吼的目標');
      }
    }
    p.hand = p.hand.filter((h) => h !== card);
    p.board.splice(pos === undefined ? p.board.length : Math.max(0, Math.min(p.board.length, pos)), 0, m);
    if (isRace(m.id, 'ELEMENTAL')) p.c.elemTurn = (p.c.elemTurn ?? 0) + 1;
    p.c['q:summon'] = (p.c['q:summon'] ?? 0) + 1;
    if (spec?.battlecry) p.c['q:bc'] = (p.c['q:bc'] ?? 0) + 1;
    if (spec?.battlecry) this.triggerBattlecry(p, m, bcTarget, r, spec.choices ? (m.both ? -1 : this.chooseOne(p, choice)) : 0);
    this.volumize(p, m.id, m.golden ? 2 : 1);
    this.afterPlay(p, m, m);
    this.giveSpellcraft(p, m);
    this.discardPair(p, card);
    this.checkQuest(p);
  }

  /** 磁力：把手下吸附到機械上（無人機複製器讓它再吸附一次；極化節拍手也會吸附一份） */
  magnetizeCard(p: BPlayer, host: BMinion, m: BMinion) {
    const times = host.id === 'BG36_506' && host.act === this.s.round && host.n === this.s.round ? 2 : 1;
    const targets = [host];
    for (const b of p.board) if (b.id === 'BG26_149' && b !== host) for (let k = 0; k < (b.golden ? 2 : 1); k++) targets.push(b);
    for (const t of targets) {
      for (let k = 0; k < (t === host ? times : 1); k++) {
        t.atk += m.atk;
        t.hp += m.hp;
        for (const kw of ['taunt', 'shield', 'windfury', 'venom', 'reborn'] as Keyword[]) if (m[kw]) t[kw] = true;
        t.mags.push({ id: m.id, g: m.golden ? 2 : 1 }, ...m.mags);
      }
    }
    if (host.id === 'BG36_506') host.n = 0;
    this.volumize(p, m.id, m.golden ? 2 : 1);
    for (const t of targets) for (const hk of this.hooks(p)) hk.onMagnetize?.(this, p, t);
  }

  /** 音量機兵第一次打出或吸附：你的音量機兵本賽局變強 */
  volumize(p: BPlayer, id: string, g: number) {
    if (id === 'BG34_170t') p.c.volA = (p.c.volA ?? 0) + 3 * g;
    if (id === 'BG34_170t2') p.c.volH = (p.c.volH ?? 0) + 3 * g;
    if (id === 'BG34_170t3') (p.c.volA = (p.c.volA ?? 0) + g), (p.c.volH = (p.c.volH ?? 0) + g);
  }

  /** 打出成對的卡（例如漫遊的意志破壞者給的法術）：另一張會被棄掉 */
  private discardPair(p: BPlayer, card: HandCard) {
    if (card.pair === undefined) return;
    const other = p.hand.find((h) => h.pair === card.pair);
    if (other) this.discard(p, other.uid);
  }

  /** 棄掉一張手牌：觸發「棄掉時」的效果 */
  discard(p: BPlayer, uid: number) {
    const card = p.hand.find((h) => h.uid === uid);
    if (!card) return;
    p.hand = p.hand.filter((h) => h !== card);
    p.c.discards = (p.c.discards ?? 0) + 1;
    if (card.kind === 'spell') {
      // 淤泥腐蝕、賦能室：棄掉時施放兩次；腐化金幣：金幣上限 +2
      if (card.id === 'BG36_301t' || card.id === 'BG36_371') for (let k = 0; k < 2; k++) this.castSpec(p, card.id, null, card.g, 0);
      if (card.id === 'BG36_303') p.maxGoldBonus += 2;
    }
    const r = this.recruit(p);
    for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.onDiscard?.(r, m, g);
    for (const hk of this.hooks(p)) hk.onDiscard?.(this, p, card);
  }

  /** 啟動技能：花金幣發動（每個手下每回合一次） */
  activate(pi: number, uid: number, target?: number, handUid?: number) {
    const p = this.player(pi);
    this.ensure(p);
    const m = p.board.find((x) => x.uid === uid);
    const act = m && SPEC.get(m.id)?.activate;
    if (!m || !act) throw new BgError('這個手下沒有啟動技能');
    if (m.act === this.s.round) throw new BgError('這回合已經啟動過了');
    if (p.gold < act.cost) throw new BgError('金幣不夠');
    let t: BMinion | null = null;
    let h: number | null = null;
    if (act.target === 'friend' || act.target === 'shop') {
      const pool = act.target === 'friend' ? p.board : p.shop;
      t = pool.find((x) => x.uid === target) ?? null;
      if (!t || (act.filter && !act.filter(m, t, p))) throw new BgError('請選擇目標');
    }
    if (act.target === 'hand') {
      const card = p.hand.find((x) => x.uid === handUid);
      if (!card) throw new BgError('請選擇要棄掉的手牌');
      h = card.uid;
    }
    this.spend(p, act.cost);
    m.act = this.s.round;
    if (h !== null) this.discard(p, h);
    act.use(this.recruit(p), m, m.golden ? 2 : 1, t, h);
    // 效率（黑暗贈禮）：啟動技能觸發兩次
    if (hasGift(m, 78) && p.board.includes(m)) act.use(this.recruit(p), m, m.golden ? 2 : 1, t && (p.board.includes(t) || p.shop.includes(t)) ? t : null, null);
  }

  /** 荊棘開路者：每回合有一張二選一卡兩個效果都會發動（回傳 -1） */
  private chooseOne(p: BPlayer, choice: number): number {
    if (this.hooks(p).some((hk) => hk.bothChoices)) return -1;
    const trail = p.board.filter((x) => x.id === 'BG31_327').reduce((n, x) => n + (x.golden ? 2 : 1), 0);
    if ((p.c.trail ?? 0) < trail) {
      p.c.trail = (p.c.trail ?? 0) + 1;
      return -1;
    }
    return choice;
  }

  private triggerBattlecry(p: BPlayer, m: BMinion, target: BMinion | null, r: Recruit = this.recruit(p), choice = 0) {
    const spec = SPEC.get(m.id);
    if (!spec?.battlecry) return;
    const brann = p.board.reduce((n, x) => n + (x.id === 'BG_LOE_077' ? (x.golden ? 2 : 1) : 0), 0);
    // 布萊恩的傑出一手（暗月獎品）：這回合戰吼多觸發一次
    const extra = this.hooks(p).reduce((n, hk) => n + (hk.bcExtra?.(this, p, m) ?? 0), 0) + (p.c['t:bcx'] ?? 0) + this.count(p, DEIOS);
    for (let t = 0; t <= Math.min(2, brann) + extra; t++) {
      if (target && !p.board.includes(target)) target = null;
      spec.battlecry(r, m, m.golden ? 2 : 1, target, choice);
      p.c['t:bc'] = (p.c['t:bc'] ?? 0) + 1;
      p.c.bcTotal = (p.c.bcTotal ?? 0) + 1;
      for (const x of [...p.board]) for (const { s, g } of specsOf(x)) s.afterBattlecry?.(r, x, m, g);
      for (const hk of this.hooks(p)) hk.onBattlecry?.(this, p, m);
    }
  }

  private afterPlay(p: BPlayer, card: BMinion, onBoard: BMinion) {
    const r = this.recruit(p);
    for (const x of [...p.board]) {
      if (x === onBoard) continue;
      for (const { s, g } of specsOf(x)) s.onPlay?.(r, x, onBoard, g);
    }
    for (const h of [...p.hand]) {
      if (h.kind !== 'minion') continue;
      for (const { s, g } of specsOf(h.m)) s.inHandOnPlay?.(r, h.m, card, g);
    }
    for (const hk of this.hooks(p)) hk.onPlay?.(this, p, onBoard);
    if (card.golden) p.c.goldens = (p.c.goldens ?? 0) + 1;
    if (card.golden && card.reward) {
      card.reward = false;
      if (this.hooks(p).some((hk) => hk.coinTriples)) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: COIN, g: 1 });
      else this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: TRIPLE_REWARD, g: 1, tier: Math.min(this.maxTier(p), p.tier + 1) });
    }
  }

  /** 法術能不能選這個手下當目標 */
  spellTargets(p: BPlayer, id: string, choice = 0): BMinion[] {
    const spec = SPELL_SPEC.get(id);
    if (!spec?.target || (spec.choiceTarget && !spec.choiceTarget(choice))) return [];
    const ctx: SpellCtx = { G: this, p, r: this.recruit(p) };
    const pool = spec.target === 'any' ? [...p.board, ...p.shop] : p.board;
    return pool.filter((m) => !spec.filter || spec.filter(m, ctx));
  }

  private cast(p: BPlayer, card: HandCard & { kind: 'spell' }, target?: number, choice = 0) {
    if (card.id === TRIPLE_REWARD) {
      p.hand = p.hand.filter((h) => h !== card);
      // 馬戲團獎賞（異象）：三合一獎勵改成發現暗月獎品
      if (this.hooks(p).some((hk) => hk.prizeTriples)) {
        this.discoverPrize(p, Math.min(4, 1 + Math.floor((this.s.round - 1) / 4)));
        return;
      }
      const t = card.tier ?? Math.min(this.maxTier(p), p.tier + 1);
      this.discoverFor(p, (id) => tierOf(id) === t, `三合一獎勵：發現一個旅店等級 ${t} 的手下`);
      return;
    }
    if (card.id === LOCKBOX) throw new BgError('帶鎖箱不能使用，過幾回合會自己打開');
    const spec = SPELL_SPEC.get(card.id);
    if (!spec) throw new BgError('這張法術還不能使用');
    const needTarget = !!spec.target && (!spec.choiceTarget || spec.choiceTarget(choice));
    const valid = needTarget ? this.spellTargets(p, card.id, choice) : [];
    const t = needTarget ? valid.find((m) => m.uid === target) ?? null : null;
    if (needTarget && !t) throw new BgError(valid.length ? '請選擇目標' : '沒有可以選的目標');
    p.hand = p.hand.filter((h) => h !== card);
    if (spec.choices) choice = this.chooseOne(p, choice);
    this.castSpec(p, card.id, t, card.g, choice);
    this.discardPair(p, card);
  }

  /** 空育逃亡者：在招募階段觸發奮戰，戰鬥中得到的身材永久保留 */
  rallyOutside(p: BPlayer, m: BMinion) {
    const spec = specsOf(m).filter(({ s }) => s.rally);
    if (!spec.length) return;
    const dummy = newPlayer(-1, '', false);
    const target = this.make('BG19_010t');
    target.atk = 0;
    target.hp = 99;
    const sim = new CombatSim([this.sideInput(p, true), { player: dummy, board: [target], tier: 1, heroId: '', hand: [], persist: false }], {
      rng: this.s,
      turn: this.s.round,
      nextUid: () => this.nextUid(),
      inLobby: (id) => id in this.s.pool,
      inLobbySpell: (id) => this.spellInLobby(id),
      give: (pl, id) => {
        if (bgCard(id).type === 'MINION') this.addMinion(pl, this.make(id));
        else this.addHand(pl, { kind: 'spell', uid: this.nextUid(), id, g: 1 });
      },
      giveRandom: (pl, f) => {
        const id = this.draw(f);
        if (id) this.addMinion(pl, this.make(id));
      },
    });
    sim.rallyOutside(m.uid);
  }

  /** 尤格薩倫：施放一張隨機法術（隨機目標、隨機選項） */
  castRandom(p: BPlayer, id: string, prefer?: BMinion) {
    const spec = SPELL_SPEC.get(id);
    if (!spec) return;
    const choice = spec.choices ? Math.floor(this.rand() * spec.choices.length) : 0;
    const needTarget = !!spec.target && (!spec.choiceTarget || spec.choiceTarget(choice));
    let t: BMinion | null = null;
    if (needTarget) {
      const all = this.spellTargets(p, id, choice);
      const friends = all.filter((m) => p.board.includes(m));
      t = (prefer && all.includes(prefer) ? prefer : this.pick(friends.length ? friends : all)) ?? null;
      if (!t) return;
    }
    this.castSpec(p, id, t, 1, choice);
  }

  /** 施放法術的效果（也給「施放」效果用，例如守門者混合體） */
  private castSpec(p: BPlayer, id: string, t: BMinion | null, g: number, choice: number) {
    const spec = SPELL_SPEC.get(id);
    if (!spec) return;
    const r = this.recruit(p);
    const ctx: SpellCtx = { G: this, p, r };
    const tavern = isTavernSpell(id);
    let times = 1;
    // 巴琳達：對友方手下施放的法術施放兩次
    if (t && p.board.includes(t)) times += p.board.reduce((n, x) => n + (x.id === 'BG35_883' ? (x.golden ? 2 : 1) : 0), 0);
    if (id === GEM) times += p.board.reduce((n, x) => n + (x.id === 'BG30_121' ? (x.golden ? 2 : 1) : 0), 0);
    if (BOUNTIES.includes(id)) times += p.board.reduce((n, x) => n + (x.id === 'BG33_825' ? (x.golden ? 2 : 1) : 0), 0);
    for (const hk of this.hooks(p)) times += hk.spellTimes?.(this, p, id, t) ?? 0;
    // 熔岩潛伏者：每回合第一個對它施放的造法法術永久有效
    const lurker = t && t.id === 'BG23_009' && SPELLCRAFT_SPELLS.has(id) && t.act !== this.s.round ? t : null;
    const before = lurker ? { a: lurker.tmpAtk, h: lurker.tmpHp, kw: [...lurker.tmpKw] } : null;
    for (let k = 0; k < times; k++) spec.cast(ctx, t, g, choice);
    if (lurker && before) {
      lurker.act = this.s.round;
      lurker.atk += lurker.tmpAtk - before.a;
      lurker.hp += lurker.tmpHp - before.h;
      for (const kw of lurker.tmpKw) if (!before.kw.includes(kw)) lurker[kw] = true;
      lurker.tmpAtk = before.a;
      lurker.tmpHp = before.h;
      lurker.tmpKw = before.kw;
    }
    p.c.spells = (p.c.spells ?? 0) + 1;
    if (tavern) {
      p.c.tspells = (p.c.tspells ?? 0) + 1;
      p.lastSpell = id;
    }
    for (const x of [...p.board]) for (const { s, g: gg } of specsOf(x)) s.onSpell?.(r, x, t, gg, id);
    for (const hk of this.hooks(p)) hk.onCast?.(this, p, id, t);
    this.checkQuest(p);
  }

  // —— 英雄能力 ——
  /** 第二個英雄能力：暫時把它換到主要的位置來計算 / 使用 */
  private withSlot<T>(p: BPlayer, slot: number, fn: () => T): T {
    if (!slot) return fn();
    if (!p.power2) throw new BgError('沒有第二個英雄能力');
    const keep = { hero: p.powerHero, uses: p.powerUses, spent: p.powerSpent };
    p.powerHero = p.power2;
    p.powerUses = p.power2Uses ?? 0;
    p.powerSpent = !!p.power2Spent;
    try {
      return fn();
    } finally {
      p.power2Uses = p.powerUses;
      p.power2Spent = p.powerSpent;
      p.powerHero = keep.hero;
      p.powerUses = keep.uses;
      p.powerSpent = keep.spent;
    }
  }
  powerState(p: BPlayer, slot = 0): { cost: number; usable: boolean; reason: string | null } {
    if (slot) return p.power2 ? this.withSlot(p, slot, () => this.powerState(p)) : { cost: 0, usable: false, reason: '沒有第二個英雄能力' };
    const h = heroOf(p);
    if (!h || h.passive) return { cost: 0, usable: false, reason: '被動能力' };
    const cost = h.cost ? h.cost(p, this) : 0;
    const lock = h.locked?.(p, this) ?? null;
    if (lock) return { cost, usable: false, reason: lock };
    if (p.powerSpent) return { cost, usable: false, reason: '已經用過了' };
    const perTurn = (h.perTurn ?? 1) + this.hooks(p).reduce((n, hk) => n + (hk.powerExtra ?? 0), 0) + this.count(p, 'BG21_HERO_020_Buddy');
    if (p.powerUses >= perTurn) return { cost, usable: false, reason: '本回合已經用過了' };
    if (p.gold < cost) return { cost, usable: false, reason: '金幣不夠' };
    return { cost, usable: true, reason: null };
  }

  /** 使用英雄能力；target2 = 第二個目標（沃金）；手牌目標（卓雷阿葛斯）用 target 傳手牌的 uid */
  usePower(pi: number, target?: number, target2?: number, choice = 0, slot = 0): void {
    const p = this.player(pi);
    if (slot) return this.withSlot(p, slot, () => this.usePower(pi, target, target2, choice));
    this.ensure(p);
    const h = heroOf(p);
    const st = this.powerState(p);
    if (!h?.use || !st.usable) throw new BgError(st.reason ?? '不能使用');
    let t: BMinion | null = null;
    let t2: BMinion | null = null;
    if (h.target === 'hand') {
      if (!p.hand.some((x) => x.uid === target)) throw new BgError('請選擇一張手牌');
    } else if (h.target && h.target !== 'none') {
      const pool = h.target === 'friend' ? p.board : h.target === 'shop' ? p.shop : [...p.board, ...p.shop];
      t = pool.find((m) => m.uid === target) ?? null;
      if (!t || (h.canTarget && !h.canTarget(p, t, this))) throw new BgError('請選擇目標');
      if (h.target2) {
        t2 = pool.find((m) => m.uid === target2 && m !== t) ?? null;
        if (!t2) throw new BgError('請選擇第二個目標');
      }
    }
    this.spend(p, st.cost);
    p.powerUses++;
    if (h.once) p.powerSpent = true;
    h.use(this, p, t, t2, h.target === 'hand' ? target ?? null : null, choice);
    // 遠古許願骨：英雄能力觸發兩次（目標還在的話）
    if (this.hooks(p).some((hk) => hk.powerTwice) && h.target !== 'hand') {
      const still = (m: BMinion | null) => !m || p.board.includes(m) || p.shop.includes(m);
      if (still(t) && still(t2)) h.use(this, p, t, t2, null, choice);
    }
    for (const hk of this.hooks(p)) hk.onPowerUse?.(this, p);
  }

  // —— 回合結束與戰鬥 ——
  /** 所有人都結束招募了：執行回合結束效果、戰鬥、扣血、淘汰 */
  finishRecruit() {
    if (this.s.phase !== 'recruit') return;
    for (const p of this.alive()) this.endTurn(p);
    this.s.phase = 'combat';
    const damage = new Map<number, number>();
    for (const [a, b] of this.s.pairs) {
      const pa = this.player(a);
      const ghost = b < 0 ? this.ghost() : null;
      const pb = b < 0 ? ghost : this.player(b);
      const boards: [BMinion[], BMinion[]] = [pa.board.map((m) => ({ ...m })), pb ? (b < 0 ? pb.deathBoard ?? [] : pb.board).map((m) => ({ ...m })) : []];
      const record = pa.isHuman || (b >= 0 && this.player(b).isHuman);
      const sideA = this.sideInput(pa, true);
      const sideB: SideInput = pb
        ? b < 0
          ? { player: pb, board: pb.deathBoard ?? [], tier: pb.tier, heroId: pb.powerHero ?? pb.heroId, hooks: this.hooks(pb), hand: [], persist: false }
          : this.sideInput(pb, true)
        : { player: newPlayer(-1, '', false), board: [], tier: 1, heroId: '', hand: [], persist: false };
      const res = runCombat([sideA, sideB], {
        rng: this.s,
        turn: this.s.round,
        record,
        nextUid: () => this.nextUid(),
        inLobby: (id) => id in this.s.pool,
        inLobbySpell: (id) => this.spellInLobby(id),
        give: (p, id) => {
          if (bgCard(id).type === 'MINION') this.addMinion(p, this.make(id));
          else this.addHand(p, { kind: 'spell', uid: this.nextUid(), id, g: 1 });
        },
        giveRandom: (p, f) => {
          const id = this.draw(f);
          if (id) this.addMinion(p, this.make(id));
        },
      });
      const cap = damageCap(this.s.round, this.alive().length);
      const dmg = Math.min(cap, res.damage);
      const winner = res.winner === null ? null : res.winner === 0 ? a : b;
      this.s.combats.push({ round: this.s.round, a, b, ghostOf: ghost?.idx ?? null, winner, damage: dmg, boards, frames: res.frames });
      pa.results.push(res.winner === null ? 'draw' : res.winner === 0 ? 'win' : 'loss');
      pa.lastDied = res.died[0];
      pa.lastBoardIds = boards[0].map((m) => m.id);
      for (const hk of this.hooks(pa)) hk.afterCombat?.(this, pa, pa.results[pa.results.length - 1]);
      pa.lastOpp = b;
      if (b >= 0) {
        const pbb = this.player(b);
        pbb.results.push(res.winner === null ? 'draw' : res.winner === 1 ? 'win' : 'loss');
        pbb.lastDied = res.died[1];
        pbb.lastBoardIds = boards[1].map((m) => m.id);
        for (const hk of this.hooks(pbb)) hk.afterCombat?.(this, pbb, pbb.results[pbb.results.length - 1]);
        pbb.lastOpp = a;
        pa.seen[b] = { round: this.s.round, board: boards[1], tier: pbb.tier, heroId: pbb.heroId };
        pbb.seen[a] = { round: this.s.round, board: boards[0], tier: pa.tier, heroId: pa.heroId };
      }
      if (res.winner === 1) damage.set(a, (damage.get(a) ?? 0) + dmg);
      if (res.winner === 0 && b >= 0) damage.set(b, (damage.get(b) ?? 0) + dmg);
    }
    for (const [i, d0] of damage) {
      const p = this.player(i);
      let d = d0;
      for (const hk of this.hooks(p)) if (hk.combatDamage) d = hk.combatDamage(p, d);
      const fromArmor = Math.min(p.armor, d);
      p.armor -= fromArmor;
      p.hp -= d - fromArmor;
    }
    // 戰鬥後才結算的酒館法術：過度自信、贏家的麵包；起始戰鬥的法術用完了
    for (const p of this.alive()) {
      const res = p.results[p.results.length - 1];
      if (p.c.overconf) {
        if (res === 'win') p.nextGold += 3 * p.c.overconf;
        else if (res === 'draw') p.nextGold += p.c.overconf;
        p.c.overconf = 0;
      }
      for (const x of p.after) if (x.won === undefined) x.won = res === 'win';
      p.c.upperHand = 0;
      p.c.brood = 0;
      if (res !== 'win') p.c['q:lose'] = (p.c['q:lose'] ?? 0) + 1;
      this.checkQuest(p);
    }
    // 巴羅夫：押對了拿到 3 枚旅店幸運幣；觸發過的奧秘從場上移除
    for (const p of this.alive()) {
      if (p.wager !== undefined && p.wager !== null) {
        const rec = this.s.combats.find((c) => c.a === p.wager || c.b === p.wager);
        if (rec && rec.winner === p.wager) for (let k = 0; k < 3; k++) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: COIN, g: 1 });
        p.wager = null;
      }
      if (p.secrets?.length) {
        p.secrets = p.secrets.filter((id) => !p.c[`secret:${id}`]);
        for (const k of Object.keys(p.c)) if (k.startsWith('secret:')) delete p.c[k];
      }
    }
    // 淘汰：同一回合死掉的，血量比較低的名次比較後面
    const dying = this.alive()
      .filter((p) => p.hp <= 0)
      .sort((x, y) => x.hp - y.hp);
    let place = this.alive().length;
    for (const p of dying) {
      p.alive = false;
      p.place = place--;
      p.diedRound = this.s.round;
      p.deathBoard = p.board.map((m) => ({ ...m }));
      for (const q of this.alive()) for (const hk of this.hooks(q)) hk.onHeroDeath?.(this, q, p);
    }
    const left = this.alive();
    if (left.length <= 1) {
      for (const p of left) p.place = 1;
      this.s.phase = 'over';
    }
  }

  sideInput(p: BPlayer, persist: boolean): SideInput {
    return { player: p, board: p.board, tier: p.tier, heroId: p.powerHero ?? p.heroId, hooks: this.hooks(p), hand: p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : [])), persist };
  }

  /** 戰鬥結束後進入下一回合 */
  nextRound() {
    if (this.s.phase !== 'combat') return;
    this.startRound();
  }

  // —— 效果用的介面 ——
  recruit(p: BPlayer): Recruit {
    const G = this;
    return {
      p,
      turn: G.s.round,
      tribes: G.s.tribes,
      rand: () => G.rand(),
      pick: (arr) => G.pick(arr),
      buff(m, atk, hp) {
        m.atk = Math.max(0, m.atk + atk);
        m.hp += hp;
      },
      spellBuff(m, atk, hp) {
        const [a, h] = G.spellExtra(p);
        m.atk = Math.max(0, m.atk + atk + a);
        m.hp += hp + h;
      },
      tmpBuff(m, atk, hp, kw = []) {
        m.tmpAtk += atk;
        m.tmpHp += hp;
        for (const k of kw) if (!m.tmpKw.includes(k)) m.tmpKw.push(k);
      },
      giveKw(m, kw) {
        m[kw] = true;
      },
      gem(m, times = 1) {
        for (let k = 0; k < times; k++) {
          m.atk += 1 + (p.c.gemA ?? 0);
          m.hp += 1 + (p.c.gemH ?? 0);
          m.gems = (m.gems ?? 0) + 1;
          if ((p.c['~gemDepth'] ?? 0) > 3) continue;
          p.c['~gemDepth'] = (p.c['~gemDepth'] ?? 0) + 1;
          for (const { s, g } of specsOf(m)) s.onGem?.(this, m, g);
          p.c['~gemDepth']--;
        }
      },
      getGems(n) {
        for (let k = 0; k < n; k++) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: GEM, g: 1 });
      },
      getSpell(id, g = 1, temp = false) {
        G.addHand(p, { kind: 'spell', uid: G.nextUid(), id, g, temp });
      },
      getMinion(id, golden = false) {
        if (!TOKENS.has(id)) G.takeFromPool(id);
        G.addMinion(p, G.make(id, golden));
      },
      getRandom(filter, golden = false) {
        const id = G.draw((x) => filter(x));
        if (id) G.addMinion(p, G.make(id, golden));
      },
      discover(filter, title, golden, hurt) {
        G.discoverFor(p, filter, title, { golden, hurt });
      },
      gainGold(n) {
        p.gold += n;
      },
      hurtHero(n) {
        G.hurtHero(p, n);
      },
      summon(m, pos) {
        if (p.board.length >= BOARD_MAX) return false;
        p.board.splice(pos ?? p.board.length, 0, m);
        return true;
      },
      make: (id, golden) => G.make(id, golden),
      destroy(m) {
        p.board = p.board.filter((x) => x !== m);
        G.returnToPool(m);
      },
      consume(eater, food) {
        p.shop = p.shop.filter((x) => x !== food);
        eater.atk += food.atk;
        eater.hp += food.hp;
        G.returnToPool(food);
      },
      battlecry(m) {
        const spec = SPEC.get(m.id);
        if (!spec?.battlecry) return;
        const valid = spec.target ? p.board.filter((x) => spec.target!(m, x)) : [];
        G.triggerBattlecry(p, m, G.pick(valid) ?? null);
      },
      deity(atk, hp) {
        p.c.deityA = (p.c.deityA ?? 0) + atk;
        p.c.deityH = (p.c.deityH ?? 0) + hp;
      },
      discard(uid) {
        G.discard(p, uid);
      },
      magnetize(host, id) {
        G.magnetizeCard(p, host, G.make(id));
      },
      addFodder(n) {
        (p.fodder ??= []).push(n);
      },
      lockbox() {
        const box = p.hand.find((h) => h.kind === 'spell' && h.id === LOCKBOX);
        if (box && box.kind === 'spell') {
          box.turns = (box.turns ?? 5) - 1;
          return;
        }
        G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: LOCKBOX, g: 1, turns: 5 });
      },
      give(m) {
        G.addMinion(p, m);
      },
      castOn(id, m) {
        G.castRandom(p, id, m);
      },
      freeRefresh() {
        p.frozen = false;
        G.refreshShop(p);
      },
      rally(m) {
        G.rallyOutside(p, m);
      },
      castRandomOn(m) {
        const id = G.randomSpell(p, (x) => tierOf(x) <= p.tier);
        if (id) G.castRandom(p, id, m);
      },
      getPair(gen, spells) {
        const pair = G.nextUid();
        for (let k = 0; k < 2; k++) {
          const id = gen();
          if (!id) continue;
          if (spells) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id, g: 1, pair });
          else {
            const m = G.make(id);
            G.addHand(p, { kind: 'minion', uid: m.uid, m, pair });
          }
        }
      },
      drawId: (filter) => G.draw(filter),
      discoverSpell(filter, title) {
        G.discoverSpell(p, filter, title);
      },
      castSpell(id) {
        G.castSpec(p, id, null, 1, 0);
      },
      spellInLobby: (id) => G.spellInLobby(id),
      tavernBuff(atk, hp, tribe) {
        const ka = tribe ? `tav:${tribe}:A` : 'tavA';
        const kh = tribe ? `tav:${tribe}:H` : 'tavH';
        p.c[ka] = (p.c[ka] ?? 0) + atk;
        p.c[kh] = (p.c[kh] ?? 0) + hp;
        for (const m of p.shop) {
          if (tribe && !racesOf(m.id).includes(tribe)) continue;
          m.atk += atk;
          m.hp += hp;
        }
      },
      counter(key, n) {
        p.c[key] = (p.c[key] ?? 0) + n;
      },
      restock(filters) {
        for (const m of p.shop) G.returnToPool(m);
        p.shop = [];
        for (const f of filters) {
          const id = G.draw(f);
          if (id) p.shop.push(G.shopMinion(p, id));
        }
      },
      drawSpell: (filter) => G.randomSpell(p, filter),
      goldenize(m) {
        G.goldenize(p, m);
      },
    } as Recruit & { gem(m: BMinion, times?: number): void };
  }
}

function shuffleWith<T>(arr: T[], r: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
