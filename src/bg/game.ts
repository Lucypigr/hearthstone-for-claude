// 英雄戰場的一局：8 位玩家（你 + 7 個電腦）、共用的酒館卡池、招募階段、配對與戰鬥
import type { Recruit } from './api';
import { COIN, GEM, POOL_IDS, SPEC, SPELLCRAFT_SPELLS, TOKENS, TRIPLE_REWARD } from './cards';

const SURPRISE = 'BG26_175';
const LOCKBOX = 'BG36_520t';
const FODDER = 'BG35_150t';
import { BOUNTIES, isTavernSpell, SPELL_SPEC, spellCostOf, TAVERN_SPELLS, type SpellCtx } from './spells';
import { CombatSim, runCombat, type SideInput } from './combat';
import { bgCard, isRace, racesOf, tierOf } from './data';
import { heroOf, HERO_SPEC, heroAvailable, HEROES, SWAPPABLE_POWERS } from './heroes';
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
}

export interface NewGameOptions {
  seed: number;
  humanName: string;
  ais: { name: string; persona: BgPersona }[];
  tribes?: Tribe[];
  /** 你可以選幾個英雄 */
  heroChoices?: number;
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
  }

  static create(o: NewGameOptions): BgGame {
    const rngState = { rng: o.seed | 0 || 1 };
    const r = () => nextRandom(rngState);
    const tribes = o.tribes ?? shuffleWith([...TRIBES], r).slice(0, 5);
    const players = [newPlayer(0, o.humanName, true), ...o.ais.map((a, i) => newPlayer(i + 1, a.name, false, a.persona))];
    const g = new BgGame({ rng: rngState.rng, uid: 1, round: 0, phase: 'hero', tribes, pool: {}, players, heroOffers: {}, pairs: [], combats: [] });
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

  // —— 數值 ——
  minionCost(p: BPlayer): number {
    return heroOf(p)?.minionCost?.(p) ?? MINION_COST;
  }
  refreshCost(p: BPlayer): number {
    if (p.freeRefreshes > 0) return 0;
    if ((p.c.malch ?? 0) < p.board.filter((m) => m.id === 'BG26_524').length * 2) return 0;
    return heroOf(p)?.refreshCost ?? REFRESH_COST;
  }
  upgradeCost(p: BPlayer): number {
    return Math.max(0, p.upgradeCost + (heroOf(p)?.upgradeExtra ?? 0));
  }
  sellPrice(p: BPlayer, m: BMinion): number {
    for (const { s } of specsOf(m)) if (s.sellPrice) return s.sellPrice(p, m);
    return SELL_PRICE;
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
    for (const p of this.s.players) heroOf(p)?.startGame?.(this, p);
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
    p.gold = goldForTurn(this.s.round) + p.maxGoldBonus + p.nextGold;
    // 費林大使、詹莉‧伊夏：跳過前幾回合
    if (this.s.round <= (p.c.skip ?? 0)) p.gold = 0;
    p.nextGold = 0;
    if (this.s.round > 1 && p.tier < MAX_TIER) p.upgradeCost = Math.max(0, p.upgradeCost - 1);
    for (const m of [...p.board, ...p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : []))]) {
      m.tmpAtk = 0;
      m.tmpHp = 0;
      m.tmpKw = [];
    }
    p.powerUses = 0;
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
    heroOf(p)?.startTurn?.(this, p);
    // 阮大師：每回合從 2 個新的英雄能力中挑選一個
    if (p.heroId === 'BG20_HERO_202') this.offerPowers(p, 2, '阮大師：選擇這回合的英雄能力');
    for (const m of p.board) this.giveSpellcraft(p, m);
  }

  private giveSpellcraft(p: BPlayer, m: BMinion) {
    for (const { s, g } of specsOf(m)) if (s.spellcraft) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: s.spellcraft, g, temp: true });
  }

  private endTurn(p: BPlayer) {
    const r = this.recruit(p);
    const drakkari = p.board.reduce((n, m) => n + (m.id === 'BG26_ICC_901' ? (m.golden ? 2 : 1) : 0), 0);
    for (let t = 0; t <= drakkari; t++) {
      for (const m of [...p.board]) {
        if (!p.board.includes(m)) continue;
        for (const { s, g } of specsOf(m)) s.endTurn?.(r, m, g);
      }
      heroOf(p)?.endTurn?.(this, p);
    }
    p.hand = p.hand.filter((h) => !(h.kind === 'spell' && h.temp));
    // 轉墓術：這回合打出的不死族會死亡
    for (const m of p.board.filter((x) => x.doom === this.s.round)) p.board = p.board.filter((x) => x !== m);
    // 還沒選的發現：自動選第一個
    while (p.discover) this.choose(p.idx, 0);
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
    const hero = heroOf(p);
    const size = Math.max(1, SHOP_SIZE[p.tier] + (hero?.shopExtra ?? 0) - kept.length);
    const tribe = opts.tribe;
    for (let i = 0; i < size; i++) {
      const id = this.draw((x) => tierOf(x) <= p.tier && (!tribe || racesOf(x).includes(tribe)));
      if (id) p.shop.push(this.shopMinion(p, id));
    }
    // 酒館法術：每次刷新一張
    p.shopSpells = [];
    const spell = this.randomSpell(p, (id) => tierOf(id) <= p.tier);
    if (spell) p.shopSpells.push({ uid: this.nextUid(), id: spell });
    for (let i = 0; i < (opts.higher ?? 0) && p.tier < MAX_TIER; i++) {
      const id = this.draw((x) => tierOf(x) === p.tier + 1);
      if (id) p.shop.push(this.shopMinion(p, id));
    }
    hero?.onRefresh?.(this, p);
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
    let cost = spellCostOf(id) - (p.c.spellDisc ?? 0);
    const hero = heroOf(p);
    if (hero?.spellCost) cost = hero.spellCost(p, cost);
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
    heroOf(p)?.onBuySpell?.(this, p, sp.id);
  }

  /** 「你的酒館法術額外 +X」 */
  spellExtra(p: BPlayer): [number, number] {
    return spellExtraOf(p.c, p.board);
  }

  specOf(id: string) {
    return SPEC.get(id);
  }

  shopMinion(p: BPlayer, id: string): BMinion {
    const m = this.make(id);
    const [a, h] = this.tavernBonus(p, m);
    m.atk += a;
    m.hp += h;
    return m;
  }

  private tavernBonus(p: BPlayer, m: BMinion): [number, number] {
    let a = p.c.tavA ?? 0;
    let h = p.c.tavH ?? 0;
    for (const t of racesOf(m.id)) {
      a += p.c[`tav:${t}:A`] ?? 0;
      h += p.c[`tav:${t}:H`] ?? 0;
    }
    const hb = heroOf(p)?.shopBuff?.(p);
    if (hb) {
      a += hb[0];
      h += hb[1];
    }
    return [a, h];
  }

  // —— 手牌 ——
  addHand(p: BPlayer, card: HandCard): boolean {
    if (p.hand.length >= HAND_MAX) return false;
    p.hand.push(card);
    if (card.kind === 'minion') this.checkTriple(p, card.m.id);
    if (this.s.phase === 'recruit' || this.s.phase === 'combat') {
      const r = this.recruit(p);
      for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.onGetCard?.(r, m, g);
    }
    return true;
  }

  addMinion(p: BPlayer, m: BMinion): boolean {
    return this.addHand(p, { kind: 'minion', uid: m.uid, m });
  }

  private checkTriple(p: BPlayer, id: string) {
    const need = heroOf(p)?.tripleNeed ?? 3;
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
    const id = d.options[Math.max(0, Math.min(d.options.length - 1, i))];
    p.discover = p.dq.shift() ?? null;
    const rr = this.recruit(p);
    for (const x of [...p.board]) for (const { s, g } of specsOf(x)) s.onDiscover?.(rr, x, g);
    if (d.spells) {
      this.addHand(p, { kind: 'spell', uid: this.nextUid(), id, g: 1 });
      return;
    }
    // 魚爾摩斯：猜對拿到旅店幸運幣
    if (d.guess !== undefined) {
      if (id === d.guess) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: COIN, g: 1 });
      return;
    }
    // 換英雄能力
    if (d.powers) {
      p.powerHero = id;
      p.powerUses = 0;
      p.powerSpent = false;
      heroOf(p)?.startGame?.(this, p);
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
    if (!d.noPool) this.takeFromPool(id);
    const m = this.make(id, !!d.golden);
    if (d.doom) m.doom = this.s.round;
    if (d.both) m.both = true;
    this.addMinion(p, m);
    if (d.lock) {
      const h = p.hand.find((x) => x.kind === 'minion' && x.m === m);
      if (h) h.locked = this.s.round;
    }
    if (d.hurt) this.hurtHero(p, tierOf(id));
  }

  /** 芬利、阮大師、揭露身分：發現一個英雄能力 */
  offerPowers(p: BPlayer, n: number, title: string) {
    const bag = SWAPPABLE_POWERS().filter((id) => id !== (p.powerHero ?? p.heroId) && heroAvailable(HERO_SPEC.get(id)!, this.s.tribes));
    const options: string[] = [];
    while (options.length < n && bag.length) options.push(bag.splice(Math.floor(this.rand() * bag.length), 1)[0]);
    if (!options.length) return;
    const d: Discover = { options, title, powers: true };
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
    heroOf(p)?.onSpend?.(this, p, n);
  }

  hurtHero(p: BPlayer, n: number) {
    if (n <= 0) return;
    const r0 = this.recruit(p);
    for (const m of [...p.board]) for (const { s, g } of specsOf(m)) s.onHeroHurt?.(r0, m, g, n);
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
    const cost = this.minionCost(p);
    if (p.gold < cost) throw new BgError('金幣不夠');
    if (p.hand.length >= HAND_MAX) throw new BgError('手牌已滿');
    const [m] = p.shop.splice(i, 1);
    this.spend(p, cost);
    this.addMinion(p, m);
    p.c.bought = (p.c.bought ?? 0) + 1;
    p.c.cards = (p.c.cards ?? 0) + 1;
    const r = this.recruit(p);
    for (const x of [...p.board]) for (const { s, g } of specsOf(x)) s.onBuy?.(r, x, m, g);
    heroOf(p)?.onBuy?.(this, p, m);
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
    heroOf(p)?.onSell?.(this, p, m);
    this.returnToPool(m);
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
    if (p.freeRefreshes > 0) p.freeRefreshes--;
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
    this.refreshShop(p);
  }

  upgrade(pi: number) {
    const p = this.player(pi);
    this.ensure(p);
    if (p.tier >= MAX_TIER) throw new BgError('已經是最高等級');
    const cost = this.upgradeCost(p);
    if (p.gold < cost) throw new BgError('金幣不夠');
    this.spend(p, cost);
    p.tier++;
    p.upgradeCost = UPGRADE_COST[p.tier + 1] ?? 0;
    this.giveReserved(p);
    heroOf(p)?.onUpgrade?.(this, p);
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
    if (spec?.battlecry) this.triggerBattlecry(p, m, bcTarget, r, spec.choices ? (m.both ? -1 : this.chooseOne(p, choice)) : 0);
    this.volumize(p, m.id, m.golden ? 2 : 1);
    this.afterPlay(p, m, m);
    this.giveSpellcraft(p, m);
    this.discardPair(p, card);
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
  }

  /** 荊棘開路者：每回合有一張二選一卡兩個效果都會發動（回傳 -1） */
  private chooseOne(p: BPlayer, choice: number): number {
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
    for (let t = 0; t <= Math.min(2, brann); t++) {
      if (target && !p.board.includes(target)) target = null;
      spec.battlecry(r, m, m.golden ? 2 : 1, target, choice);
      for (const x of [...p.board]) for (const { s, g } of specsOf(x)) s.afterBattlecry?.(r, x, m, g);
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
    heroOf(p)?.onPlay?.(this, p, onBoard);
    if (card.golden) p.c.goldens = (p.c.goldens ?? 0) + 1;
    if (card.golden && card.reward) {
      card.reward = false;
      if (heroOf(p)?.tripleNeed) this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: COIN, g: 1 });
      else this.addHand(p, { kind: 'spell', uid: this.nextUid(), id: TRIPLE_REWARD, g: 1, tier: Math.min(MAX_TIER, p.tier + 1) });
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
      const t = card.tier ?? Math.min(MAX_TIER, p.tier + 1);
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
    heroOf(p)?.onCast?.(this, p, id);
  }

  // —— 英雄能力 ——
  powerState(p: BPlayer): { cost: number; usable: boolean; reason: string | null } {
    const h = heroOf(p);
    if (!h || h.passive) return { cost: 0, usable: false, reason: '被動能力' };
    const cost = h.cost ? h.cost(p, this) : 0;
    const lock = h.locked?.(p, this) ?? null;
    if (lock) return { cost, usable: false, reason: lock };
    if (p.powerSpent) return { cost, usable: false, reason: '已經用過了' };
    if (p.powerUses >= (h.perTurn ?? 1)) return { cost, usable: false, reason: '本回合已經用過了' };
    if (p.gold < cost) return { cost, usable: false, reason: '金幣不夠' };
    return { cost, usable: true, reason: null };
  }

  /** 使用英雄能力；target2 = 第二個目標（沃金）；手牌目標（卓雷阿葛斯）用 target 傳手牌的 uid */
  usePower(pi: number, target?: number, target2?: number, choice = 0) {
    const p = this.player(pi);
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
          ? { player: pb, board: pb.deathBoard ?? [], tier: pb.tier, heroId: pb.powerHero ?? pb.heroId, hand: [], persist: false }
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
      heroOf(pa)?.afterCombat?.(this, pa, pa.results[pa.results.length - 1]);
      pa.lastOpp = b;
      if (b >= 0) {
        const pbb = this.player(b);
        pbb.results.push(res.winner === null ? 'draw' : res.winner === 1 ? 'win' : 'loss');
        pbb.lastDied = res.died[1];
        pbb.lastBoardIds = boards[1].map((m) => m.id);
        heroOf(pbb)?.afterCombat?.(this, pbb, pbb.results[pbb.results.length - 1]);
        pbb.lastOpp = a;
        pa.seen[b] = { round: this.s.round, board: boards[1], tier: pbb.tier, heroId: pbb.heroId };
        pbb.seen[a] = { round: this.s.round, board: boards[0], tier: pa.tier, heroId: pa.heroId };
      }
      if (res.winner === 1) damage.set(a, (damage.get(a) ?? 0) + dmg);
      if (res.winner === 0 && b >= 0) damage.set(b, (damage.get(b) ?? 0) + dmg);
    }
    for (const [i, d] of damage) {
      const p = this.player(i);
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
      for (const q of this.alive()) heroOf(q)?.onHeroDeath?.(this, q, p);
    }
    const left = this.alive();
    if (left.length <= 1) {
      for (const p of left) p.place = 1;
      this.s.phase = 'over';
    }
  }

  sideInput(p: BPlayer, persist: boolean): SideInput {
    return { player: p, board: p.board, tier: p.tier, heroId: p.powerHero ?? p.heroId, hand: p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : [])), persist };
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
