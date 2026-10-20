// 英雄戰場的英雄與英雄能力（依官方敘述實作；只收錄能完整執行的英雄）
import type { Combat } from './api';
import { BUDDY_IDS } from './buddies';
import { COIN, POOL_IDS, SPEC, SPELLCRAFT_SPELLS, TRIPLE_REWARD } from './cards';
import { bgCard, isRace, racesOf, tierOf } from './data';
import type { BgGame } from './game';
import { hasBattlecry, isMagnetic } from './rules';
import { BONUS_KEYWORDS, type BMinion, type BPlayer, type Tribe } from './types';

export interface HeroSpec {
  id: string;
  /** 這局要有這個種族才會出現 */
  needTribe?: Tribe;
  passive?: boolean;
  /** 主動能力要選什麼 */
  target?: 'friend' | 'shop' | 'any' | 'none' | 'hand';
  cost?: (p: BPlayer, G: BgGame) => number;
  perTurn?: number;
  /** 一局只能用一次 */
  once?: boolean;
  /** 還不能用的原因 */
  locked?: (p: BPlayer, G: BgGame) => string | null;
  canTarget?: (p: BPlayer, t: BMinion, G: BgGame) => boolean;
  use?(G: BgGame, p: BPlayer, t: BMinion | null, t2: BMinion | null, hand: number | null, choice?: number): void;
  /** 二選一（布魯坎的元素） */
  choices?: string[];
  /** 電腦選哪個選項 */
  aiChoice?: (G: BgGame, p: BPlayer) => number;
  /** 目前的英雄能力卡（會變的能力，例如艾薩拉、拉格納羅斯） */
  powerId?: (p: BPlayer) => string;
  /** 要選第二個目標（沃金） */
  target2?: boolean;
  /** 戰鬥中友方手下死亡後 */
  onFriendDeath?(c: Combat, side: 0 | 1, dead: BMinion): void;
  /** 戰鬥結束後（記錄這場的結果） */
  afterCombat?(G: BgGame, p: BPlayer, result: 'win' | 'loss' | 'draw'): void;
  /** 另一位英雄被淘汰後 */
  onHeroDeath?(G: BgGame, p: BPlayer, dead: BPlayer): void;
  /** 能力上顯示的目前進度 */
  status?: (p: BPlayer, G: BgGame) => string | null;
  /** 取代 30 點生命值與護甲 */
  health?: number;
  minionCost?: (p: BPlayer, m?: BMinion) => number | undefined;
  refreshCost?: number;
  upgradeExtra?: number;
  shopExtra?: number;
  shopBuff?: (p: BPlayer, m?: BMinion, G?: BgGame) => [number, number];
  /** 只要幾張就能三連 */
  tripleNeed?: number;
  startGame?(G: BgGame, p: BPlayer): void;
  startTurn?(G: BgGame, p: BPlayer): void;
  endTurn?(G: BgGame, p: BPlayer): void;
  onBuy?(G: BgGame, p: BPlayer, m: BMinion): void;
  onSell?(G: BgGame, p: BPlayer, m: BMinion): void;
  onUpgrade?(G: BgGame, p: BPlayer): void;
  onPlay?(G: BgGame, p: BPlayer, m: BMinion): void;
  onRefresh?(G: BgGame, p: BPlayer): void;
  onSpend?(G: BgGame, p: BPlayer, n: number): void;
  onBuySpell?(G: BgGame, p: BPlayer, id: string): void;
  onCast?(G: BgGame, p: BPlayer, id: string, t?: BMinion | null): void;
  onDiscover?(G: BgGame, p: BPlayer, id: string): void;
  onGetCard?(G: BgGame, p: BPlayer, card: import('./types').HandCard): void;
  onDiscard?(G: BgGame, p: BPlayer, card: import('./types').HandCard): void;
  onMagnetize?(G: BgGame, p: BPlayer, host: BMinion): void;
  /** 觸發戰吼後 */
  onBattlecry?(G: BgGame, p: BPlayer, m: BMinion): void;
  onPowerUse?(G: BgGame, p: BPlayer): void;
  /** 你自己刷新酒館後（回合開始的刷新不算） */
  onReroll?(G: BgGame, p: BPlayer): void;
  /** 英雄在戰鬥外受到傷害後 */
  onHeroHurt?(G: BgGame, p: BPlayer, n: number): void;
  /** 酒館產生手下時 */
  onShopMinion?(G: BgGame, p: BPlayer, m: BMinion): void;
  /** 二選一的兩個效果都要 */
  bothChoices?: boolean;
  /** 戰吼多觸發幾次 */
  bcExtra?: (G: BgGame, p: BPlayer, m: BMinion) => number;
  /** 法術多施放幾次 */
  spellTimes?: (G: BgGame, p: BPlayer, id: string, t: BMinion | null) => number;
  /** 「你的酒館法術額外 +X」 */
  spellExtra?: (p: BPlayer) => [number, number];
  /** 英雄能力每回合可以多用幾次 */
  powerExtra?: number;
  /** 英雄能力觸發兩次 */
  powerTwice?: boolean;
  /** 回合結束效果多觸發幾次 */
  eotExtra?: number;
  /** 酒館最低 / 最高等級 */
  minTier?: number;
  maxTier?: number;
  /** 酒館每次刷新多幾個高一本的手下 / 多幾張法術 */
  shopHigher?: number;
  shopSpellsExtra?: number;
  /** 酒館永遠有 7 張卡 */
  shopFull?: boolean;
  /** 酒館只有這個種族 / 只有你的等級的手下 */
  onlyTribe?: Tribe;
  onlyTier?: boolean;
  /** 所有手下都是金卡（不給三合一獎勵） */
  allGolden?: boolean;
  /** 三連給旅店幸運幣而不是三合一獎勵 */
  coinTriples?: boolean;
  /** 每回合的金幣（異象） */
  goldBase?: (round: number) => number;
  sellPrice?: (p: BPlayer, m: BMinion) => number | undefined;
  /** 不能刷新 / 不能用金幣升級 */
  noRefresh?: boolean;
  noUpgrade?: boolean;
  /** 某些手下只要 2 張就能三連 */
  tripleNeedFor?: (id: string) => number | undefined;
  /** 英雄受到的戰鬥傷害 */
  combatDamage?: (p: BPlayer, dmg: number) => number;
  // 戰鬥中
  onShieldLost?(c: Combat, side: 0 | 1, m: BMinion): void;
  onFriendReborn?(c: Combat, side: 0 | 1, m: BMinion): void;
  onDeathrattle?(c: Combat, side: 0 | 1, m: BMinion): void;
  /** 起始戰鬥效果多觸發幾次 */
  socExtra?: number;
  /** 亡語多觸發幾次 */
  drExtra?: number;
  /** 每場戰鬥第一個亡語多觸發一次 */
  firstDrExtra?: boolean;
  /** 三合一獎勵改成發現暗月獎品 */
  prizeTriples?: boolean;
  /** 酒館法術的費用 */
  spellCost?: (p: BPlayer, cost: number, id?: string) => number;
  // 戰鬥中
  soc?(c: Combat, side: 0 | 1): void;
  onSummonCombat?(c: Combat, side: 0 | 1, m: BMinion): void;
  onKill?(c: Combat, side: 0 | 1, killer: BMinion, victim: BMinion, first: boolean): void;
  onAttack?(c: Combat, side: 0 | 1, m: BMinion): void;
  avenge?: [number, (c: Combat, side: 0 | 1) => void];
  // 電腦
  /** 英雄強度（1 ～ 5），高手會挑強的 */
  rank: number;
  /** 電腦要不要用、對誰用（undefined = 不用） */
  ai?: (G: BgGame, p: BPlayer) => BMinion | 'none' | undefined;
}

const fixed = (n: number) => () => n;
const strongest = (b: BMinion[]) => (b.length ? b.reduce((a, x) => (x.atk + x.hp > a.atk + a.hp ? x : a)) : undefined);
const weakest = (b: BMinion[]) => (b.length ? b.reduce((a, x) => (x.atk + x.hp < a.atk + a.hp ? x : a)) : undefined);
const cnt = (p: BPlayer, k: string) => p.c[k] ?? 0;
const add = (p: BPlayer, k: string, n = 1) => (p.c[k] = cnt(p, k) + n);

function giveCoin(G: BgGame, p: BPlayer) {
  G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: COIN, g: 1 });
}

function giveTripleReward(G: BgGame, p: BPlayer) {
  G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: TRIPLE_REWARD, g: 1, tier: Math.min(6, p.tier + 1) });
}

export const HEROES: HeroSpec[] = [
  {
    id: 'TB_BaconShop_HERO_01', // 艾德溫‧范克里夫：打磨利刃
    target: 'friend',
    cost: fixed(1),
    status: (p) => `目前 +${2 + Math.floor(cnt(p, 'cards') / 4)}/+${2 + Math.floor(cnt(p, 'cards') / 4)}`,
    use: (_G, p, t) => {
      const n = 2 + Math.floor(cnt(p, 'cards') / 4);
      if (t) (t.atk += n), (t.hp += n);
    },
    rank: 4,
    ai: (_G, p) => strongest(p.board),
  },
  {
    id: 'TB_BaconShop_HERO_08', // 伊利丹‧怒風
    passive: true,
    soc: (c, side) => {
      const b = c.board(side).filter((m) => !m.dead);
      if (!b.length) return;
      const ends = b.length > 1 ? [b[0], b[b.length - 1]] : [b[0]];
      for (const m of ends) {
        c.buff(m, 2, 1);
        c.attackNow(m);
      }
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_15', // 墮落的喬治
    target: 'friend',
    cost: fixed(1),
    canTarget: (_p, t) => !t.shield,
    use: (_G, _p, t) => t && (t.shield = true),
    rank: 3,
    ai: (_G, p) => strongest(p.board.filter((m) => !m.shield)),
  },
  {
    id: 'TB_BaconShop_HERO_22', // 巫妖王
    target: 'friend',
    cost: fixed(0),
    canTarget: (_p, t) => !t.reborn,
    use: (_G, _p, t) => t && !t.tmpKw.includes('reborn') && t.tmpKw.push('reborn'),
    rank: 3,
    ai: (_G, p) => strongest(p.board.filter((m) => !m.reborn)),
  },
  {
    id: 'TB_BaconShop_HERO_28', // 無限托奇
    target: 'none',
    cost: fixed(1),
    use: (G, p) => {
      p.frozen = false;
      G.refreshShop(p, { higher: 2 });
    },
    rank: 3,
    ai: (_G, p) => (p.tier < 6 && p.gold >= 4 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_29', // 克蘇恩
    target: 'none',
    cost: fixed(1),
    status: (p, G) => `重複 ${G.round - 1} 次${cnt(p, 'cthun') ? '（本回合已啟動）' : ''}`,
    use: (_G, p) => void (p.c.cthun = 1),
    endTurn: (G, p) => {
      if (!cnt(p, 'cthun')) return;
      for (let k = 0; k < G.round; k++) {
        const m = G.pick(p.board);
        if (m) (m.atk += 1), (m.hp += 1);
      }
    },
    startTurn: (_G, p) => void (p.c.cthun = 0),
    rank: 3,
    ai: (G, p) => (p.board.length && G.round >= 3 ? 'none' : undefined),
  },
  { id: 'TB_BaconShop_HERO_34', passive: true, health: 60, rank: 2 }, // 縫補者
  {
    id: 'TB_BaconShop_HERO_42', // 伊莉絲‧尋星者
    target: 'none',
    cost: (p) => 1 + cnt(p, 'elise'),
    use: (G, p) => {
      add(p, 'elise');
      G.discoverFor(p, (id) => tierOf(id) === p.tier, `發現一個旅店等級 ${p.tier} 的手下`);
    },
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 && p.board.length < 7 ? 'none' : undefined),
  },
  { id: 'TB_BaconShop_HERO_49', passive: true, minionCost: () => 2, refreshCost: 2, upgradeExtra: 1, rank: 3 }, // 米歐浩斯
  {
    id: 'TB_BaconShop_HERO_52', // 死亡之翼
    passive: true,
    soc: (c, side) => {
      for (const s of [0, 1] as const) {
        for (const m of c.board(s)) {
          if (m.dead) continue;
          if (s === side) c.perm(m, 2, 0);
          else c.buff(m, 2, 0);
        }
      }
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_53', // 伊瑟拉
    passive: true,
    needTribe: 'DRAGON',
    onRefresh: (G, p) => {
      const id = G.draw((x) => isRace(x, 'DRAGON') && tierOf(x) <= p.tier);
      if (id) p.shop.push(G.shopMinion(p, id));
    },
    rank: 3,
  },
  { id: 'TB_BaconShop_HERO_57', passive: true, startTurn: (_G, p) => void (p.freeRefreshes = Math.max(p.freeRefreshes, 1)), rank: 4 }, // 諾茲多姆
  {
    id: 'TB_BaconShop_HERO_58', // 瑪里苟斯
    target: 'any',
    cost: fixed(0),
    perTurn: 2,
    canTarget: (_p, t) => !t.golden,
    use: (G, p, t) => {
      if (!t) return;
      const tier = tierOf(t.id);
      const id = G.draw((x) => tierOf(x) === tier && x !== t.id);
      if (!id) return;
      G.returnToPool(t);
      const inShop = p.shop.indexOf(t);
      if (inShop >= 0) p.shop[inShop] = G.shopMinion(p, id);
      else {
        const i = p.board.indexOf(t);
        if (i >= 0) p.board[i] = G.make(id);
      }
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_60', // 凱爾薩斯
    passive: true,
    status: (p) => `還差 ${3 - (cnt(p, 'kael') % 3)} 個`,
    onBuy: (G, p) => {
      add(p, 'kael');
      if (cnt(p, 'kael') % 3 === 0) giveCoin(G, p);
    },
    rank: 3,
  },
  { id: 'TB_BaconShop_HERO_74', passive: true, onUpgrade: (_G, p) => void (p.gold += 2), rank: 3 }, // 森林看守者歐穆
  {
    id: 'TB_BaconShop_HERO_76', // 奧拉基爾
    passive: true,
    soc: (c, side) => {
      const m = c.board(side).find((x) => !x.dead);
      if (!m) return;
      c.giveKw(m, 'windfury');
      c.giveKw(m, 'shield');
      c.giveKw(m, 'taunt');
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_92', // 亞煞拉懼
    target: 'none',
    cost: fixed(2),
    status: (p) => (cnt(p, 'yshaarj') ? '下一場戰鬥會發動' : null),
    use: (_G, p) => void (p.c.yshaarj = 1),
    startTurn: (_G, p) => void (p.c.yshaarj = 0),
    soc: (c, side) => {
      if (!c.cnt(side, 'yshaarj')) return;
      const tier = c.heroTier(side);
      const ids = POOL_BY_TIER(tier).filter((id) => c.inLobby(id));
      const id = c.pick(ids);
      if (!id) return;
      c.summon(side, c.make(id));
      c.give(side, id);
    },
    rank: 4,
    ai: (_G, p) => (p.gold >= 2 && p.board.length < 7 && p.tier >= 3 ? 'none' : undefined),
  },
  {
    id: 'BG32_HERO_001', // 森林之王塞納留斯
    target: 'none',
    cost: fixed(3),
    use: (_G, p) => void p.maxGoldBonus++,
    rank: 3,
    ai: (G, p) => (G.round <= 9 && p.gold >= 3 ? 'none' : undefined),
  },
  { id: 'BG20_HERO_100', passive: true, onKill: (c, _side, killer) => c.perm(killer, 1, 0), rank: 3 }, // 洛卡菈
  {
    id: 'BG20_HERO_102', // 薩魯法爾霸王
    passive: true,
    status: (p) => `酒館的手下 +${1 + Math.floor(cnt(p, 'bought') / 3)}/+${1 + Math.floor(cnt(p, 'bought') / 3)}`,
    shopBuff: (p) => {
      const n = 1 + Math.floor(cnt(p, 'bought') / 3);
      return [n, n];
    },
    rank: 4,
  },
  {
    id: 'BG20_HERO_103', // 亡語者黑棘
    target: 'none',
    cost: fixed(1),
    perTurn: 2,
    use: (G, p) => {
      for (let k = 0; k < 2; k++) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: 'BG20_GEM', g: 1 });
    },
    rank: 4,
    ai: (_G, p) => (p.board.length && p.hand.length <= 7 ? 'none' : undefined),
  },
  {
    id: 'BG26_HERO_101', // 霍格爾船長
    passive: true,
    needTribe: 'PIRATE',
    onBuy: (_G, p, m) => {
      if (isRace(m.id, 'PIRATE')) p.gold++;
    },
    rank: 3,
  },
  {
    id: 'BG28_HERO_400', // 蛇眼
    target: 'none',
    cost: fixed(1),
    locked: (p) => (cnt(p, 'snake') > 0 ? `還要 ${cnt(p, 'snake')} 回合才能再用` : null),
    use: (G, p) => {
      const n = 1 + Math.floor(G.rand() * 6);
      p.gold += n;
      p.c.snake = n;
      p.c.snakeRoll = n;
    },
    status: (p) => (cnt(p, 'snakeRoll') ? `上次擲出 ${cnt(p, 'snakeRoll')}` : null),
    startTurn: (_G, p) => {
      if (cnt(p, 'snake') > 0) p.c.snake--;
    },
    rank: 3,
    ai: () => 'none',
  },
  {
    id: 'TB_BaconShop_HERO_68', // 天空隊長克拉格
    target: 'none',
    cost: fixed(0),
    once: true,
    status: (_p, G) => `可以獲得 ${G.round + 1} 枚金幣`,
    use: (G, p) => void (p.gold += G.round + 1),
    rank: 3,
    ai: (G, p) => (G.round >= 6 || (p.hp <= 15 && G.round >= 4) ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_41', // 里諾‧傑克森
    target: 'friend',
    cost: fixed(0),
    once: true,
    canTarget: (_p, t) => !t.golden,
    use: (G, _p, t) => {
      if (!t) return;
      const base = G.make(t.id);
      t.golden = true;
      t.atk += base.atk;
      t.hp += base.hp;
    },
    rank: 3,
    ai: (G, p) => {
      if (G.round < 7) return undefined;
      const best = p.board.filter((m) => !m.golden && tierOf(m.id) >= 4).sort((a, b) => tierOf(b.id) - tierOf(a.id))[0];
      return best;
    },
  },
  {
    id: 'TB_BaconShop_HERO_95', // 灰枝
    passive: true,
    onSummonCombat: (c, _side, m) => {
      c.buff(m, 1, 2);
      c.giveKw(m, 'taunt');
    },
    rank: 3,
  },
  {
    id: 'BG22_HERO_002', // 德雷克塔爾
    passive: true,
    status: (_p, G) => (G.round < 7 ? `第 7 回合解鎖` : null),
    soc: (c, side) => {
      if (c.turn < 7) return;
      const b = c.board(side).filter((m) => !m.dead);
      if (!b.length) return;
      const best = b.reduce((a, x) => (x.atk > a.atk ? x : a));
      const copy = c.make(best.id, best.golden);
      Object.assign(copy, { atk: best.atk, hp: best.hp, taunt: best.taunt, shield: best.shield, windfury: best.windfury, venom: best.venom, reborn: best.reborn, temp: true });
      c.summon(side, copy);
    },
    rank: 4,
  },
  {
    id: 'BG22_HERO_003', // 范達爾‧雷矛
    passive: true,
    status: (_p, G) => (G.round < 7 ? `第 7 回合解鎖` : null),
    soc: (c, side) => {
      if (c.turn < 7) return;
      const b = c.board(side).filter((m) => !m.dead);
      if (!b.length) return;
      const best = b.reduce((a, x) => (x.hp > a.hp ? x : a));
      const copy = c.make(best.id, best.golden);
      Object.assign(copy, { atk: best.atk, hp: best.hp, taunt: best.taunt, shield: best.shield, windfury: best.windfury, venom: best.venom, reborn: best.reborn, temp: true });
      c.summon(side, copy);
    },
    rank: 4,
  },
  {
    id: 'BG23_HERO_201', // 歐蘇瑪特
    passive: true,
    status: (p) => `觸手 ${2 + cnt(p, 'ozu')}/${2 + cnt(p, 'ozu')}`,
    onSell: (_G, p) => void add(p, 'ozu'),
    soc: (c, side) => {
      const m = c.make('BG23_HERO_201pt');
      const n = c.cnt(side, 'ozu');
      m.atk += n;
      m.hp += n;
      const placed = c.summon(side, m);
      if (placed) placed.temp = true;
    },
    rank: 3,
  },
  {
    id: 'BG21_HERO_010', // 史蓋伯斯‧油切
    target: 'none',
    cost: fixed(2),
    locked: (p, G) => {
      const o = G.opponentOf(p.idx);
      return o === null || o < 0 || !G.player(o).board.length ? '下一個對手沒有手下' : null;
    },
    use: (G, p) => {
      const o = G.opponentOf(p.idx);
      if (o === null || o < 0) return;
      const ids = [...new Set(G.player(o).board.map((m) => m.id))];
      const options: string[] = [];
      while (options.length < 3 && ids.length) options.push(ids.splice(Math.floor(G.rand() * ids.length), 1)[0]);
      if (!options.length) return;
      const d = { options, title: '發現下一個對手戰隊裡的一個手下', noPool: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
    rank: 3,
    ai: (_G, p) => (p.gold >= 5 && p.hand.length < 8 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_50', // 泰絲‧葛雷邁恩
    target: 'none',
    cost: fixed(1),
    locked: (p) => (p.lastOpp === null || p.lastOpp < 0 || !p.seen[p.lastOpp]?.board.length ? '還沒有上一個對手的戰隊' : null),
    use: (G, p) => {
      const seen = p.lastOpp !== null && p.lastOpp >= 0 ? p.seen[p.lastOpp] : undefined;
      if (!seen) return;
      for (const m of p.shop) G.returnToPool(m);
      p.frozen = false;
      p.shop = seen.board.slice(0, 7).map((m) => G.shopMinion(p, m.id));
    },
    rank: 3,
    ai: (G, p) => (G.round >= 5 && p.gold >= 4 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_39', // 瘋狂金字塔
    target: 'none',
    cost: fixed(2),
    use: (G, p) => {
      if (!p.shop.length) return;
      const m = p.shop.splice(Math.floor(G.rand() * p.shop.length), 1)[0];
      m.hp *= 2;
      G.addMinion(p, m);
    },
    rank: 3,
    ai: (_G, p) => (p.shop.length && p.hand.length < 8 && p.gold >= 2 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_25', // 巫妖拜茲希爾
    target: 'shop',
    cost: fixed(2),
    use: (G, p, t) => {
      if (!t) return;
      p.shop = p.shop.filter((m) => m !== t);
      G.addMinion(p, t);
      G.hurtHero(p, 2);
    },
    rank: 2,
    ai: (_G, p) => (p.hp > 12 && p.hand.length < 8 ? strongest(p.shop) : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_71', // 詹迪斯‧巴羅夫
    target: 'friend',
    cost: fixed(0),
    canTarget: (_p, t) => !t.golden,
    use: (G, p, t) => {
      if (!t || !p.shop.length) return;
      const j = Math.floor(G.rand() * p.shop.length);
      const i = p.board.indexOf(t);
      const s = p.shop[j];
      p.shop[j] = t;
      p.board[i] = s;
    },
    rank: 2,
  },
  {
    id: 'TB_BaconShop_HERO_56', // 雅立史卓莎
    target: 'none',
    needTribe: 'DRAGON',
    cost: fixed(1),
    locked: (p) => (p.tier < 4 ? '旅店等級 4 解鎖' : null),
    use: (G, p) => G.discoverFor(p, (id) => isRace(id, 'DRAGON'), '發現一個龍類'),
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 && p.board.length < 7 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_17', // 米歐菲瑟‧曼納斯頓
    target: 'none',
    needTribe: 'MECHANICAL',
    cost: fixed(1),
    locked: (p) => (p.tier < 4 ? '旅店等級 4 解鎖' : null),
    use: (G, p) => G.discoverFor(p, (id) => isMagnetic(id), '發現一個磁力機械'),
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 && p.board.some((m) => isRace(m.id, 'MECHANICAL')) ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_67', // 鉤牙船長
    target: 'friend',
    cost: fixed(0),
    use: (G, p, t) => {
      if (!t) return;
      const tier = Math.max(1, tierOf(t.id) - 1);
      p.board = p.board.filter((m) => m !== t);
      G.returnToPool(t);
      G.discoverFor(p, (id) => tierOf(id) === tier, `發現一個旅店等級 ${tier} 的手下`);
    },
    rank: 2,
  },
  {
    id: 'TB_BaconShop_HERO_43', // 恐龍馴服者布萊恩
    passive: true,
    status: (p) => (cnt(p, 'brannDone') ? '已完成' : `還差 ${4 - cnt(p, 'brann')} 個戰吼手下`),
    onBuy: (G, p, m) => {
      if (cnt(p, 'brannDone') || !hasBattlecry(m.id)) return;
      add(p, 'brann');
      if (cnt(p, 'brann') >= 4) {
        p.c.brannDone = 1;
        G.takeFromPool('BG_LOE_077');
        G.addMinion(p, G.make('BG_LOE_077'));
      }
    },
    rank: 3,
  },
  {
    id: 'BG23_HERO_304', // 瓦許女士
    passive: true,
    startTurn: (G, p) => {
      const id = G.pick([...SPELLCRAFT_SPELLS]);
      if (id) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id, g: 1, temp: true });
    },
    rank: 3,
  },
  {
    id: 'BG20_HERO_301', // 吞噬者穆坦努斯
    target: 'friend',
    cost: fixed(0),
    use: (G, p, t) => {
      if (!t) return;
      const others = p.board.filter((m) => m !== t);
      const to = G.pick(others);
      const { atk, hp } = t;
      G.sell(p.idx, t.uid);
      if (to) (to.atk += atk), (to.hp += hp);
    },
    rank: 3,
    ai: (G, p) => (p.board.length >= 6 && G.round >= 4 ? weakest(p.board) : undefined),
  },
  { id: 'BG34_HERO_002', passive: true, tripleNeed: 2, rank: 4 }, // 鐘錶沃斯先生
  {
    id: 'BG22_HERO_305', // 奧妮克希亞
    passive: true,
    status: (p) => `幼龍 ${1 + cnt(p, 'onyx')}/${1 + cnt(p, 'onyx')}`,
    avenge: [
      4,
      (c, side) => {
        const m = c.make('BG22_HERO_305t');
        const n = c.cnt(side, 'onyx');
        m.atk += n;
        m.hp += n;
        const placed = c.summon(side, m);
        if (placed) {
          placed.temp = true;
          c.attackNow(placed);
        }
        c.counter(side, 'onyx', 1);
      },
    ],
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_14', // 瓦哥托戈女王
    passive: true,
    status: (p) => `目前 +${1 + Math.floor(cnt(p, 'spentTotal') / 10)}/+${1 + Math.floor(cnt(p, 'spentTotal') / 10)}`,
    soc: (c, side) => {
      const n = 1 + Math.floor(c.cnt(side, 'spentTotal') / 10);
      const done = new Set<BMinion>();
      const tribes = new Set<Tribe>();
      for (const m of c.board(side)) for (const t of racesOf(m.id)) tribes.add(t);
      for (const t of tribes) {
        const m = c.pick(c.board(side).filter((x) => !x.dead && !done.has(x) && isRace(x.id, t)));
        if (!m) continue;
        done.add(m);
        c.buff(m, n, n);
      }
    },
    rank: 3,
  },
  {
    id: 'BG26_HERO_102', // 『鋼鐵禮頌』英格
    target: 'friend',
    cost: fixed(0),
    perTurn: 2,
    status: (p, G) => (G.round % 2 ? `本回合：+${p.tier} 攻擊力` : `本回合：+${p.tier} 生命值`),
    use: (G, p, t) => {
      if (!t) return;
      if (G.round % 2) t.atk += p.tier;
      else t.hp += p.tier;
    },
    rank: 4,
    ai: (_G, p) => strongest(p.board),
  },
  {
    id: 'TB_BaconShop_HERO_45', // 極盜天王拉法姆
    target: 'none',
    cost: fixed(1),
    status: (p, G) => (cnt(p, 'rafaam') === G.round ? '下一場戰鬥會發動' : null),
    use: (G, p) => void (p.c.rafaam = G.round),
    onKill: (c, side, _k, victim, first) => {
      if (first && c.cnt(side, 'rafaam') === c.turn) c.give(side, victim.id);
    },
    rank: 3,
    ai: (G, p) => (G.round >= 3 && p.gold >= 1 && p.hand.length < 8 ? 'none' : undefined),
  },
  {
    id: 'BG20_HERO_280', // 克圖斯‧灰殞
    passive: true,
    status: (p) => (cnt(p, 'kurtDone') ? '本回合已發動' : `還差 ${3 - cnt(p, 'kurt')} 個`),
    startTurn: (_G, p) => {
      p.c.kurt = 0;
      p.c.kurtDone = 0;
    },
    onBuy: (G, p, m) => {
      if (cnt(p, 'kurtDone')) return;
      add(p, 'kurt');
      if (cnt(p, 'kurt') >= 3) {
        p.c.kurtDone = 1;
        G.addMinion(p, G.make(m.id));
      }
    },
    rank: 3,
  },
  {
    id: 'BG20_HERO_242', // 葛夫‧符文圖騰
    passive: true,
    status: (p) => `還差 ${20 - cnt(p, 'guff')} 個等級`,
    onBuy: (G, p, m) => {
      add(p, 'guff', tierOf(m.id));
      if (cnt(p, 'guff') >= 20) {
        p.c.guff -= 20;
        giveTripleReward(G, p);
      }
    },
    onBuySpell: (G, p, id) => {
      add(p, 'guff', tierOf(id));
      if (cnt(p, 'guff') >= 20) {
        p.c.guff -= 20;
        giveTripleReward(G, p);
      }
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_91', // 偉大的賽佛瑞斯
    target: 'none',
    cost: fixed(3),
    status: (p) => `還剩 ${3 - cnt(p, 'wish')} 個願望`,
    locked: (p) => (cnt(p, 'wish') >= 3 ? '願望用完了' : !pairOf(p) ? '你沒有兩張一樣的手下' : null),
    use: (G, p) => {
      const id = pairOf(p);
      if (!id) return;
      add(p, 'wish');
      G.takeFromPool(id);
      G.addMinion(p, G.make(id));
    },
    rank: 4,
    ai: (_G, p) => (pairOf(p) ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_78', // 泫瓦拉
    passive: true,
    needTribe: 'ELEMENTAL',
    status: (p) => `還差 ${3 - (cnt(p, 'chen') % 3)} 個元素`,
    onPlay: (_G, p, m) => {
      if (!isRace(m.id, 'ELEMENTAL')) return;
      add(p, 'chen');
      if (cnt(p, 'chen') % 3 === 0) p.upgradeCost = Math.max(0, p.upgradeCost - 3);
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_59', // 艾蘭娜‧尋星者
    passive: true,
    status: (p) => (cnt(p, 'aranna') >= 14 ? '每回合第一個手下免費' : `還差 ${14 - cnt(p, 'aranna')} 次攻擊`),
    onAttack: (c, side) => {
      if (c.cnt(side, 'aranna') < 14) c.counter(side, 'aranna', 1);
    },
    minionCost: (p) => (cnt(p, 'aranna') >= 14 && !cnt(p, 'arannaBuy') ? 0 : undefined),
    onBuy: (_G, p) => void (p.c.arannaBuy = 1),
    startTurn: (_G, p) => void (p.c.arannaBuy = 0),
    rank: 3,
  },
  {
    id: 'BG33_HERO_001', // 『活蹦亂跳的傳奇』樂樂
    passive: true,
    status: (p) => `還差 ${15 - (cnt(p, 'loh') % 15)} 次攻擊`,
    onAttack: (c, side) => {
      c.counter(side, 'loh', 1);
      if (c.cnt(side, 'loh') % 15 === 0) c.give(side, TRIPLE_REWARD);
    },
    rank: 3,
  },
  // —— 酒館法術相關 ——
  {
    id: 'BG28_HERO_800', // 泰瑟連‧血腥看守者
    passive: true,
    status: (p) => `還差 ${2 - (cnt(p, 'taeth') % 3)} 張`,
    spellCost: (p, c) => (cnt(p, 'taeth') % 3 === 2 ? 0 : c),
    onBuySpell: (_G, p) => void add(p, 'taeth'),
    rank: 3,
  },
  {
    id: 'BG28_HERO_801', // 醫生荷利代
    target: 'none',
    cost: fixed(1),
    use: (G, p) => {
      const id = G.randomSpell(p, (x) => tierOf(x) <= p.tier);
      if (id) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id, g: 1 });
    },
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 && p.gold >= 1 ? 'none' : undefined),
  },
  {
    id: 'BG31_HERO_006', // 奧薩爾主教
    target: 'none',
    cost: fixed(0),
    locked: (_p, G) => (G.round < 3 ? '第 3 回合解鎖' : null),
    status: (p) => (cnt(p, 'spellDisc') ? `下一張酒館法術便宜 ${cnt(p, 'spellDisc')}` : null),
    use: (_G, p) => void add(p, 'spellDisc'),
    rank: 3,
    ai: (_G, p) => (p.shopSpells.length && !cnt(p, 'spellDisc') ? 'none' : undefined),
  },
  {
    id: 'BG31_HERO_003', // 先知諾柏多
    target: 'none',
    cost: (p, G) => Math.max(0, 3 - (G.round - 1 - cnt(p, 'nobundoUsed'))),
    locked: (p) => (!p.lastSpell ? '還沒有施放過酒館法術' : null),
    status: (p) => (p.lastSpell ? `上一張：${spellName(p.lastSpell)}` : null),
    use: (G, p) => {
      if (p.lastSpell) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: p.lastSpell, g: 1 });
      p.c.nobundoUsed = G.round - 1;
    },
    rank: 3,
    ai: (_G, p) => (p.lastSpell && p.hand.length < 8 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_75', // 拉卡尼休
    passive: true,
    status: (p) => `你的酒館法術額外 +${cnt(p, 'raka')}/+${cnt(p, 'raka')}`,
    startGame: (_G, p) => void (p.c.raka = 1),
    startTurn: (G, p) => {
      if (G.round > 1 && (G.round - 1) % 3 === 0) add(p, 'raka');
    },
    rank: 3,
  },
  {
    id: 'BG34_HERO_001', // 時光轉繞者克羅米
    target: 'none',
    cost: fixed(0),
    use: (G, p) => G.refreshWithSpells(p),
    rank: 2,
    ai: (G, p) => (G.round >= 4 && p.board.length >= 5 && p.gold >= 3 && !p.shopSpells.some((s) => G.spellCost(p, s.id) <= p.gold) ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_35', // 『深沉絕望』尤格薩倫
    passive: true,
    status: (_p, G) => (G.round < 3 ? '第 3 回合解鎖' : null),
    startTurn: (G, p) => {
      if (G.round < 3) return;
      const id = G.randomSpell(p, (x) => tierOf(x) <= p.tier);
      if (id) G.castRandom(p, id);
    },
    rank: 3,
  },

  // —— 第三批 ——
  {
    id: 'BG20_HERO_101', // 賽瑞菈
    target: 'shop',
    cost: fixed(2),
    use: (G, p, t) => {
      if (!t) return;
      p.shop = p.shop.filter((m) => m !== t);
      t.atk = 2;
      t.hp = 2;
      G.addMinion(p, t);
    },
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 ? p.shop.find((m) => tierOf(m.id) >= p.tier && tierOf(m.id) >= 3) : undefined),
  },
  {
    id: 'BG20_HERO_201', // 沃金
    target: 'friend',
    target2: true,
    cost: fixed(0),
    use: (G, p, t, t2) => {
      if (!t || !t2) return;
      const a = G.eff(p, t).atk;
      const b = G.eff(p, t2).atk;
      t.tmpAtk += b - a;
      t2.tmpAtk += a - b;
    },
    rank: 3,
  },
  {
    id: 'BG20_HERO_282', // 塔姆辛‧羅姆
    passive: true,
    soc: (c, side) => {
      const b = c.board(side).filter((m) => !m.dead);
      if (!b.length) return;
      const low = b.reduce((x, y) => (y.atk < x.atk ? y : x));
      (low.extraDr ??= []).push({ id: 'BG20_HERO_282p', g: 1 });
    },
    rank: 4,
  },
  {
    id: 'BG21_HERO_020', // 餅乾大廚
    target: 'friend',
    cost: fixed(0),
    status: (p) => `鍋裡有 ${cnt(p, 'pot')} 個`,
    use: (G, p, t) => {
      if (!t) return;
      p.board = p.board.filter((m) => m !== t);
      G.returnToPool(t);
      for (const r of racesOf(t.id)) add(p, `pot:${r}`);
      add(p, 'pot');
      if (cnt(p, 'pot') < 3) return;
      const types = Object.keys(p.c).filter((k) => k.startsWith('pot:') && p.c[k] > 0).map((k) => k.slice(4));
      for (const k of Object.keys(p.c)) if (k.startsWith('pot')) delete p.c[k];
      G.discoverFor(p, (id) => tierOf(id) <= p.tier && (!types.length || racesOf(id).some((r) => types.includes(r))), '發現一個鍋裡種族的手下');
    },
    rank: 2,
    ai: (G, p) => (p.board.length >= 6 && G.round >= 5 ? weakest(p.board) : undefined),
  },
  { id: 'BG21_HERO_030', passive: true, startGame: (G, p) => void G.addMinion(p, G.make('BG21_HERO_030t')), rank: 3 }, // 斯尼德
  {
    id: 'BG22_HERO_000', // 塔維西‧雷矛
    target: 'shop',
    cost: fixed(0),
    status: (p) => (cnt(p, 'tavish') ? `下一場戰鬥射出 ${cnt(p, 'tavish')} 點傷害` : null),
    use: (G, p, t) => {
      if (!t) return;
      p.shop = p.shop.filter((m) => m !== t);
      G.returnToPool(t);
      p.c.tavish = (p.c.tavish ?? 0) + t.atk;
    },
    soc: (c, side) => {
      const n = c.cnt(side, 'tavish');
      if (!n) return;
      const t = c.pick(c.board((1 - side) as 0 | 1).filter((m) => !m.dead));
      if (t) c.damage(t, n, null);
    },
    afterCombat: (_G, p) => void (p.c.tavish = 0),
    rank: 3,
    ai: (_G, p) => (p.shop.length > 1 ? strongest(p.shop) : undefined),
  },
  {
    id: 'BG22_HERO_001', // 布魯坎
    target: 'none',
    cost: fixed(0),
    choices: ['大地祈願：4 個隨機友方手下獲得「亡語：召喚一個 1/1 元素」', '火焰祈願：你最左邊的手下攻擊力加倍', '流水祈願：你最右邊的手下獲得聖盾與嘲諷', '雷電祈願：對 5 個隨機敵方手下造成 1 點傷害'],
    powerId: (p) => (cnt(p, 'brukan') ? `BG22_HERO_001p_t${cnt(p, 'brukan')}` : 'BG22_HERO_001p'),
    use: (_G, p, _t, _t2, _h, choice = 0) => void (p.c.brukan = choice + 1),
    soc: (c, side) => {
      const b = c.board(side).filter((m) => !m.dead);
      switch (c.cnt(side, 'brukan')) {
        case 1:
          for (const m of [...b].sort(() => c.rand() - 0.5).slice(0, 4)) (m.extraDr ??= []).push({ id: 'BG22_HERO_001p_t1', g: 1 });
          break;
        case 2:
          if (b[0]) c.buff(b[0], b[0].atk, 0);
          break;
        case 3:
          if (b.length) {
            c.giveKw(b[b.length - 1], 'shield');
            c.giveKw(b[b.length - 1], 'taunt');
          }
          break;
        case 4:
          for (let k = 0; k < 5; k++) {
            const t = c.pick(c.board((1 - side) as 0 | 1).filter((m) => !m.dead));
            if (t) c.damage(t, 1, null);
          }
          break;
      }
    },
    rank: 3,
    ai: (_G, p) => (cnt(p, 'brukan') ? undefined : 'none'),
    aiChoice: (_G, p) => {
      if (p.board[0] && p.board[0].atk >= 8) return 1;
      if (p.board.some((m) => SPEC.get(m.id)?.onSummon)) return 0;
      return 2;
    },
  },
  {
    id: 'BG22_HERO_004', // 瓦登‧晨握
    passive: true,
    onRefresh: (G, p) => {
      if (!p.shop.length) return;
      const best = p.shop.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a));
      const copy = G.shopMinion(p, best.id);
      best.iced = true;
      copy.iced = true;
      p.shop.push(copy);
    },
    rank: 3,
  },
  {
    id: 'BG22_HERO_007', // 艾薩拉女王
    target: 'none',
    cost: fixed(1),
    powerId: (p) => (cnt(p, 'azshara') ? 'BG22_HERO_007p2' : 'BG22_HERO_007p'),
    locked: (p) => (cnt(p, 'azshara') ? null : `戰隊總攻擊力達到 30 後解鎖（目前 ${p.board.reduce((n, m) => n + m.atk, 0)}）`),
    endTurn: (_G, p) => {
      if (p.board.reduce((n, m) => n + m.atk, 0) >= 30) p.c.azshara = 1;
    },
    onPlay: (_G, p) => {
      if (p.board.reduce((n, m) => n + m.atk, 0) >= 30) p.c.azshara = 1;
    },
    use: (G, p) => G.discoverFor(p, (id) => isRace(id, 'NAGA') && tierOf(id) <= p.tier, '發現一個納迦'),
    needTribe: 'NAGA',
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 ? 'none' : undefined),
  },
  {
    id: 'BG22_HERO_200', // 伊尼‧風暴線圈
    passive: true,
    needTribe: 'MECHANICAL',
    status: (p) => `還差 ${9 - cnt(p, 'ini')} 個手下死亡`,
    onFriendDeath: (c, side) => {
      c.counter(side, 'ini', 1);
      if (c.cnt(side, 'ini') < 9) return;
      c.counter(side, 'ini', -9);
      c.giveRandom(side, (id) => isRace(id, 'MECHANICAL'));
    },
    rank: 3,
  },
  {
    id: 'BG22_HERO_201', // 費林大使
    passive: true,
    startGame: (G, p) => {
      p.c.skip = 1;
      for (const t of [6, 4, 2]) G.discoverFor(p, (id) => tierOf(id) === t, `發現一個旅店等級 ${t} 的手下（升到 ${t} 本時拿到）`, { reserve: t });
    },
    status: (p) => ((p.reserve ?? []).length ? `等待中：${(p.reserve ?? []).map((x) => `${bgCard(x.id).name}（${x.tier} 本）`).join('、')}` : null),
    rank: 3,
  },
  {
    id: 'BG23_HERO_303', // 魚爾摩斯
    target: 'none',
    cost: fixed(0),
    use: (G, p) => {
      const o = G.opponentOf(p.idx);
      const opp = o !== null && o >= 0 ? G.player(o) : null;
      const theirs = opp?.lastBoardIds ?? [];
      const right = theirs.length ? G.pick(theirs)! : 'BG23_HERO_303pt';
      const wrong = G.pick(G.poolIds((id) => !theirs.includes(id) && tierOf(id) <= Math.max(1, opp?.tier ?? 1))) ?? 'BG23_HERO_303pt';
      const options = G.rand() < 0.5 ? [right, wrong] : [wrong, right];
      const d = { options, title: '猜猜看：下一個對手上場戰鬥有哪一個？', guess: right, noPool: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
    rank: 2,
    ai: (G, p) => (G.round >= 2 && p.hand.length < 9 ? 'none' : undefined),
  },
  {
    id: 'BG23_HERO_305', // 劫匪大亨托戈瓦哥
    target: 'none',
    cost: (p, G) => Math.max(0, 11 - (G.round - (cnt(p, 'tog') || 1))),
    use: (G, p) => {
      p.c.tog = G.round;
      for (const m of [...p.shop]) {
        if (p.hand.length >= 10) break;
        p.shop = p.shop.filter((x) => x !== m);
        G.addMinion(p, m);
      }
      for (const sp of [...p.shopSpells]) {
        if (p.hand.length >= 10) break;
        p.shopSpells = p.shopSpells.filter((x) => x !== sp);
        G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: sp.id, g: 1 });
      }
    },
    rank: 3,
    ai: (_G, p) => (p.hand.length <= 5 ? 'none' : undefined),
  },
  {
    id: 'BG23_HERO_306', // 希瓦娜斯‧風行者
    target: 'none',
    cost: fixed(2),
    locked: (p, G) => (G.round < 3 ? '第 3 回合解鎖' : !(p.lastDied ?? []).some((id) => SPEC.has(id)) ? '上場戰鬥沒有手下死亡' : null),
    use: (G, p) => {
      const ids = [...new Set((p.lastDied ?? []).filter((id) => SPEC.has(id)))];
      const options: string[] = [];
      while (options.length < 3 && ids.length) options.push(ids.splice(Math.floor(G.rand() * ids.length), 1)[0]);
      if (!options.length) return;
      const d = { options, title: '發現一個上場戰鬥中死亡的手下', noPool: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 && p.gold >= 5 ? 'none' : undefined),
  },
  {
    id: 'BG24_HERO_204', // 強化機器人
    passive: true,
    onRefresh: (G, p) => {
      for (let k = 0; k < 2; k++) {
        const m = G.pick(p.shop);
        const kw = m && G.pick(BONUS_KEYWORDS.filter((x) => !m[x]));
        if (m && kw) m[kw] = true;
      }
    },
    rank: 3,
  },
  {
    id: 'BG25_HERO_103', // 泰朗‧血魔
    target: 'friend',
    cost: fixed(0),
    status: (p) => (cnt(p, 'teron') ? '下一場戰鬥會發動' : null),
    use: (_G, p, t) => void (t && (p.c.teron = t.uid)),
    soc: (c, side) => {
      const uid = c.cnt(side, 'teron');
      if (!uid) return;
      const m = c.board(side).find((x) => x.src === uid && !x.dead);
      if (!m) return;
      const copy: BMinion = { ...m, mags: m.mags.slice(), tmpKw: [], uid: c.make(m.id).uid, src: m.src, dead: false };
      c.destroy(m);
      c.summonLater(side, copy);
    },
    afterCombat: (_G, p) => void (p.c.teron = 0),
    rank: 4,
    ai: (_G, p) => p.board.find((m) => SPEC.get(m.id)?.deathrattle) ?? undefined,
  },
  {
    id: 'BG26_HERO_104', // 搖滾大師沃恩
    passive: true,
    status: (_p, G) => `還剩 ${3 - ((G.round - 1) % 3)} 回合`,
    endTurn: (G, p) => {
      if (G.round % 3) return;
      const h = p.hand[0];
      if (!h) return;
      if (h.kind === 'minion') G.addMinion(p, G.make(h.m.id));
      else G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: h.id, g: h.g, tier: h.tier });
    },
    rank: 3,
  },
  {
    id: 'BG27_HERO_801', // 『風暴之王』索林姆
    passive: true,
    startGame: (G, p) => G.discoverFor(p, (id) => tierOf(id) === 7, '發現一個旅店等級 7 的手下（花費 60 枚金幣後拿到）', { reserve: 99 }),
    status: (p) => ((p.reserve ?? []).some((x) => x.tier === 99) ? `還差 ${Math.max(0, 60 - cnt(p, 'spentTotal'))} 枚金幣` : null),
    onSpend: (G, p) => {
      if (cnt(p, 'spentTotal') < 60) return;
      const ready = (p.reserve ?? []).filter((x) => x.tier === 99);
      p.reserve = (p.reserve ?? []).filter((x) => x.tier !== 99);
      for (const x of ready) G.addMinion(p, G.make(x.id));
    },
    rank: 4,
  },
  {
    id: 'BG31_HERO_005', // 複製大師澤瑞克
    target: 'friend',
    cost: fixed(0),
    once: true,
    locked: (p) => (p.board.length >= 7 ? '戰場已滿' : null),
    use: (G, p, t) => {
      if (!t || p.board.length >= 7) return;
      const copy: BMinion = { ...t, uid: G.nextUid(), mags: t.mags.slice(), tmpKw: [...t.tmpKw] };
      p.board.splice(p.board.indexOf(t) + 1, 0, copy);
    },
    rank: 3,
    ai: (G, p) => (G.round >= 8 && p.board.length < 7 ? strongest(p.board) : undefined),
  },
  {
    id: 'BG36_HERO_000', // 卓雷阿葛斯
    target: 'hand',
    needTribe: 'ABERRATION',
    cost: fixed(1),
    use: (G, p, _t, _t2, hand) => {
      if (hand === null) return;
      G.discard(p, hand);
      const id = G.draw((x) => isRace(x, 'ABERRATION') && tierOf(x) <= p.tier);
      if (id) G.addMinion(p, G.make(id));
    },
    rank: 3,
  },
  {
    id: 'BG36_HERO_002', // 克希斯
    target: 'none',
    cost: fixed(2),
    use: (G, p) => G.recruit(p).getPair(() => G.draw((x) => tierOf(x) <= p.tier)!, false),
    rank: 3,
    ai: (_G, p) => (p.hand.length <= 7 && p.gold >= 5 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_02', // 葛拉克朗
    target: 'shop',
    cost: fixed(1),
    canTarget: (_p, t) => tierOf(t.id) < 6,
    use: (G, p, t) => {
      if (!t) return;
      const tier = tierOf(t.id) + 1;
      G.discoverFor(p, (id) => tierOf(id) === tier, `發現一個旅店等級 ${tier} 的手下取代它`, { replace: t.uid });
    },
    rank: 4,
    ai: (_G, p) => (p.gold >= 4 ? p.shop.find((m) => tierOf(m.id) === p.tier && p.tier < 6) : undefined),
  },
  { id: 'TB_BaconShop_HERO_10', passive: true, onSell: (_G, p) => void (p.nextGold += 1), rank: 3 }, // 貿易親王加里維克斯
  {
    id: 'TB_BaconShop_HERO_11', // 『炎魔』拉格納羅斯
    passive: true,
    powerId: (p) => (cnt(p, 'sulfuras') ? 'TB_BaconShop_HP_087t' : 'TB_BaconShop_HP_087'),
    status: (p) => (cnt(p, 'sulfuras') ? null : `還差 ${Math.max(0, 12 - cnt(p, 'cards'))} 張`),
    onBuy: (_G, p) => {
      if (cnt(p, 'cards') >= 12) p.c.sulfuras = 1;
    },
    onBuySpell: (_G, p) => {
      if (cnt(p, 'cards') >= 12) p.c.sulfuras = 1;
    },
    endTurn: (_G, p) => {
      if (!cnt(p, 'sulfuras') || !p.board.length) return;
      const ends = p.board.length > 1 ? [p.board[0], p.board[p.board.length - 1]] : [p.board[0]];
      for (const m of ends) (m.atk += 8), (m.hp += 8);
    },
    rank: 4,
  },
  {
    id: 'TB_BaconShop_HERO_12', // 老鼠王
    target: 'none',
    cost: fixed(2),
    status: (_p, G) => `本回合：${TRIBE_NAMES_SHORT[G.s.tribes[G.round % G.s.tribes.length]]}`,
    use: (G, p) => {
      const t = G.s.tribes[G.round % G.s.tribes.length];
      G.discoverFor(p, (id) => isRace(id, t) && tierOf(id) <= p.tier, `發現一個${TRIBE_NAMES_SHORT[t]}`);
    },
    rank: 3,
    ai: (_G, p) => (p.hand.length < 8 && p.gold >= 5 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_16', // 詹莉‧伊夏
    passive: true,
    startGame: (_G, p) => void (p.c.skip = 2),
    startTurn: (G, p) => {
      if (G.round !== 3) return;
      G.discoverFor(p, (id) => tierOf(id) === 3, '發現一個旅店等級 3 的手下');
      G.discoverFor(p, (id) => tierOf(id) === 4, '發現一個旅店等級 4 的手下');
    },
    rank: 2,
  },
  {
    id: 'TB_BaconShop_HERO_18', // 海盜派奇
    target: 'none',
    needTribe: 'PIRATE',
    cost: (p) => Math.max(0, 3 - cnt(p, 'patches')),
    use: (G, p) => {
      p.c.patches = 0;
      const id = G.draw((x) => isRace(x, 'PIRATE') && tierOf(x) <= p.tier);
      if (id) G.addMinion(p, G.make(id));
    },
    onBuy: (_G, p, m) => {
      if (isRace(m.id, 'PIRATE')) add(p, 'patches');
    },
    rank: 3,
    ai: (G, p) => (G.powerState(p).cost <= 1 && p.hand.length < 8 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_23', // 哮斗龍
    target: 'friend',
    cost: fixed(0),
    locked: (_p, G) => (G.round < 3 ? '第 3 回合解鎖' : null),
    canTarget: (_p, t) => !!SPEC.get(t.id)?.battlecry,
    use: (G, p, t) => {
      if (t) G.recruit(p).battlecry(t);
    },
    rank: 3,
    ai: (_G, p) => strongestBy(p.board.filter((m) => SPEC.get(m.id)?.battlecry)),
  },
  { id: 'TB_BaconShop_HERO_27', passive: true, minionCost: () => 2, shopExtra: -1, endTurn: (_G, p) => void (p.frozen = true), rank: 3 }, // 辛德拉苟莎
  { id: 'TB_BaconShop_HERO_33', passive: true, startGame: (G, p) => void G.addMinion(p, G.make('TB_BaconShop_HP_033t')), rank: 3 }, // 館長
  {
    id: 'TB_BaconShop_HERO_36', // 跳舞的戴瑞
    passive: true,
    onPlay: (_G, _p, m) => {
      m.atk += 1;
      m.hp += 1;
      m.hat = (m.hat ?? 0) + 1;
    },
    rank: 2,
  },
  {
    id: 'TB_BaconShop_HERO_37', // 賈拉克瑟斯領主
    passive: true,
    needTribe: 'DEMON',
    powerId: (p) => (cnt(p, 'portal') ? 'TB_BaconShop_HP_036t' : 'TB_BaconShop_HP_036'),
    status: (p) => (cnt(p, 'portal') ? null : `還差 ${Math.max(0, 150 - cnt(p, 'jarax'))} 點傷害`),
    onAttack: (c, side, m) => {
      if (c.cnt(side, 'portal')) return;
      c.counter(side, 'jarax', m.atk);
      if (c.cnt(side, 'jarax') >= 150) c.counter(side, 'portal', 1);
    },
    startTurn: (G, p) => {
      if (!cnt(p, 'portal')) return;
      for (let k = 0; k < 2; k++) {
        const id = G.draw((x) => isRace(x, 'DEMON') && tierOf(x) <= p.tier);
        if (id) G.addMinion(p, G.make(id));
      }
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_38', // 穆克拉
    passive: true,
    needTribe: 'BEAST',
    startTurn: (G, p) => {
      for (let k = 0; k < 2; k++) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: 'TB_BaconShop_HP_038t', g: 1 });
      for (const q of G.alive()) if (q !== p) G.addHand(q, { kind: 'spell', uid: G.nextUid(), id: 'TB_BaconShop_HP_038t', g: 1 });
    },
    rank: 2,
  },
  {
    id: 'TB_BaconShop_HERO_40', // 芬利‧莫戈頓爵士
    passive: true,
    startGame: (G, p) => G.offerPowers(p, 3, '發現一個英雄能力'),
    rank: 4,
  },
  {
    id: 'TB_BaconShop_HERO_55', // 真菌術師弗勒戈
    passive: true,
    needTribe: 'MURLOC',
    status: (p) => `還差 ${5 - (cnt(p, 'flurgl') % 5)} 個`,
    onSell: (G, p) => {
      add(p, 'flurgl');
      if (cnt(p, 'flurgl') % 5) return;
      const id = G.draw((x) => isRace(x, 'MURLOC') && tierOf(x) <= p.tier);
      if (id) G.addMinion(p, G.make(id));
    },
    rank: 2,
  },
  {
    id: 'TB_BaconShop_HERO_62', // 瑪翼夫‧影歌
    target: 'shop',
    cost: fixed(1),
    use: (G, p, t) => {
      if (!t) return;
      p.shop = p.shop.filter((m) => m !== t);
      t.atk += 1;
      t.hp += 1;
      G.addMinion(p, t);
      const h = p.hand.find((x) => x.kind === 'minion' && x.m === t);
      if (h) h.locked = G.round + 1;
    },
    rank: 3,
    ai: (G, p) => (p.hand.length < 8 && G.round >= 3 ? p.shop.find((m) => tierOf(m.id) === p.tier) : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_64', // 尤多拉船長
    target: 'none',
    cost: fixed(1),
    status: (p) => `還要挖 ${4 - (cnt(p, 'dig') % 4)} 次`,
    use: (G, p) => {
      add(p, 'dig');
      if (cnt(p, 'dig') % 4) return;
      const id = G.draw((x) => tierOf(x) === p.tier);
      if (id) G.addMinion(p, G.make(id, true));
    },
    rank: 3,
    ai: (_G, p) => (p.gold >= 1 ? 'none' : undefined),
  },
  {
    id: 'TB_BaconShop_HERO_70', // 畢勾沃斯先生
    passive: true,
    onHeroDeath: (G, p, dead) => {
      const objs = [...(dead.deathBoard ?? [])].sort(() => G.rand() - 0.5).slice(0, 3);
      if (!objs.length) return;
      const d = { options: objs.map((m) => m.id), objs, title: `發現一個 ${dead.name} 戰隊裡的手下（保留加成）`, noPool: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_702', // 閻獄之主
    target: 'friend',
    needTribe: 'UNDEAD',
    cost: fixed(1),
    locked: (p) => (p.tier < 2 ? '旅店等級 2 解鎖' : null),
    canTarget: (_p, t) => isRace(t.id, 'UNDEAD'),
    use: (G, p, t) => {
      if (!t) return;
      p.board = p.board.filter((m) => m !== t);
      G.returnToPool(t);
      const id = G.draw((x) => isRace(x, 'UNDEAD') && tierOf(x) <= p.tier);
      if (id) G.addMinion(p, G.make(id));
    },
    rank: 3,
    ai: (_G, p) => p.board.filter((m) => isRace(m.id, 'UNDEAD') && tierOf(m.id) < p.tier).sort((a, b) => a.atk + a.hp - b.atk - b.hp)[0],
  },
  { id: 'TB_BaconShop_HERO_93', passive: true, startGame: (G, p) => void G.addMinion(p, G.make('TB_BaconShop_HP_105t')), rank: 3 }, // 恩若司
  {
    id: 'BG20_HERO_202', // 阮大師
    passive: true,
    status: () => '每回合開始時選擇新的英雄能力',
    rank: 4,
  },
  {
    id: 'BG30_HERO_304', // 經理馬林：第 5 回合選一個次級飾品購買
    passive: true,
    startTurn: (G, p) => void (G.round === 5 && G.offerTrinkets(p, 'lesser')),
    status: (_p, G) => (G.round < 5 ? `還有 ${5 - G.round} 回合` : '已經開過了'),
    rank: 3,
  },
  {
    id: 'BG32_HERO_002', // 扣仔：第 8 回合選一個強效飾品購買
    passive: true,
    startTurn: (G, p) => void (G.round === 8 && G.offerTrinkets(p, 'greater')),
    status: (_p, G) => (G.round < 8 ? `還有 ${8 - G.round} 回合` : '已經開過了'),
    rank: 3,
  },
  {
    id: 'BG36_HERO_101', // 『靈魂寄生者』崔斯塔斯：開局發現一個有黑暗贈禮的 5 本手下，第 7 回合解鎖
    passive: true,
    startGame: (G, p) => G.discoverGift(p, (id) => tierOf(id) === 5, '虛無力量：發現一個有黑暗贈禮的旅店等級 5 手下（第 7 回合解鎖）', { lockTurns: 6 }),
    rank: 3,
  },
  {
    id: 'BG36_HERO_105', // 夢魘之王薩維斯：每 4 回合發現一個有黑暗贈禮的手下
    passive: true,
    startTurn: (G, p) => void (G.round % 4 === 0 && G.discoverGift(p, (id) => tierOf(id) <= p.tier, '感受毀滅：發現一個有黑暗贈禮的手下')),
    status: (_p, G) => `還有 ${4 - (G.round % 4) || 4} 回合`,
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_94', // 提卡特斯：每 4 回合發現一個暗月獎品（等級越來越高）
    passive: true,
    startTurn: (G, p) => void (G.round % 4 === 0 && G.discoverPrize(p, Math.min(4, G.round / 4))),
    status: (_p, G) => `還有 ${4 - (G.round % 4) || 4} 回合`,
    rank: 3,
  },
  {
    id: 'TB_BaconShop_HERO_90', // 希拉斯‧暗月：酒館裡有暗月彩票，集滿 3 張發現一個你的等級的手下
    passive: true,
    onShopMinion: (G, _p, m) => void (G.rand() < 0.3 && (m.ticket = true)),
    onBuy: (G, p, m) => {
      if (!m.ticket) return;
      m.ticket = false;
      p.c.tickets = (p.c.tickets ?? 0) + 1;
      if (p.c.tickets % 3 === 0) G.discoverFor(p, (id) => tierOf(id) === p.tier, '暗月彩票：發現一個你的等級的手下');
    },
    status: (p) => `彩票 ${(p.c.tickets ?? 0) % 3}/3`,
    rank: 3,
  },
  {
    id: 'BG24_HERO_100', // 戴納瑟斯王：開局從 2 個任務中選一個
    passive: true,
    startGame: (G, p) => G.offerQuests(p, 2),
    rank: 3,
  },
  {
    id: 'BG25_HERO_105', // 『樂團經理』精英牛頭大佬：發現一個夥伴（2 本解鎖）
    target: 'none',
    cost: fixed(3),
    locked: (p) => (p.tier < 2 ? '升到 2 本才能使用' : null),
    use: (G, p) => {
      const bag = [...BUDDY_IDS].filter((id) => tierOf(id) <= p.tier && id !== 'BG25_HERO_105_Buddy');
      const options: string[] = [];
      while (options.length < 3 && bag.length) options.push(bag.splice(Math.floor(G.rand() * bag.length), 1)[0]);
      if (!options.length) return;
      const d = { options, title: '精英牛頭大佬：發現一個夥伴', noPool: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
    rank: 3,
    ai: (G, p) => (p.hand.length < 9 && p.gold >= 3 + (G.round > 6 ? 0 : 3) ? 'none' : undefined),
  },
];

const TRIBE_NAMES_SHORT: Record<string, string> = {
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
};

function strongestBy(b: BMinion[]): BMinion | undefined {
  return b.length ? b.reduce((a, x) => (x.atk + x.hp > a.atk + a.hp ? x : a)) : undefined;
}

/** 可以被芬利、阮大師換到的英雄能力（開局限定、會換生命值的不算） */
export const SWAPPABLE_POWERS = (): string[] =>
  HEROES.filter((h) => !h.health && !NOT_SWAPPABLE.has(h.id)).map((h) => h.id);
const NOT_SWAPPABLE = new Set(['BG20_HERO_202', 'TB_BaconShop_HERO_40', 'BG22_HERO_201', 'TB_BaconShop_HERO_16', 'BG21_HERO_030', 'TB_BaconShop_HERO_33', 'TB_BaconShop_HERO_93', 'BG27_HERO_801']);


function spellName(id: string): string {
  try {
    return bgCard(id).name;
  } catch {
    return id;
  }
}

function pairOf(p: BPlayer): string | null {
  const counts = new Map<string, number>();
  for (const m of [...p.board, ...p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : []))]) {
    if (m.golden || !SPEC.has(m.id)) continue;
    counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
  }
  for (const [id, n] of counts) if (n === 2) return id;
  return null;
}

const tierCache = new Map<number, string[]>();
function POOL_BY_TIER(t: number): string[] {
  let ids = tierCache.get(t);
  if (!ids) {
    ids = POOL_IDS.filter((id) => tierOf(id) === t);
    tierCache.set(t, ids);
  }
  return ids;
}

export const HERO_SPEC = new Map<string, HeroSpec>(HEROES.map((h) => [h.id, h]));

/** 玩家目前的英雄能力（芬利、阮大師可以換成別的英雄的能力） */
export function heroOf(p: BPlayer): HeroSpec | undefined {
  return HERO_SPEC.get(p.powerHero ?? p.heroId);
}

/** 英雄能力的卡（顯示用） */
export function powerCardOf(p: BPlayer): string {
  const h = heroOf(p);
  return h?.powerId?.(p) ?? bgCard(p.powerHero ?? p.heroId).power ?? '';
}

export function heroAvailable(h: HeroSpec, tribes: Tribe[]): boolean {
  return !h.needTribe || tribes.includes(h.needTribe);
}
