// 英雄戰場的英雄與英雄能力（依官方敘述實作；只收錄能完整執行的英雄）
import type { Combat } from './api';
import { COIN, POOL_IDS, SPEC, SPELLCRAFT_SPELLS, TRIPLE_REWARD } from './cards';
import { isRace, racesOf, tierOf } from './data';
import type { BgGame } from './game';
import { hasBattlecry, isMagnetic } from './rules';
import type { BMinion, BPlayer, Tribe } from './types';

export interface HeroSpec {
  id: string;
  /** 這局要有這個種族才會出現 */
  needTribe?: Tribe;
  passive?: boolean;
  /** 主動能力要選什麼 */
  target?: 'friend' | 'shop' | 'any' | 'none';
  cost?: (p: BPlayer, G: BgGame) => number;
  perTurn?: number;
  /** 一局只能用一次 */
  once?: boolean;
  /** 還不能用的原因 */
  locked?: (p: BPlayer, G: BgGame) => string | null;
  canTarget?: (p: BPlayer, t: BMinion, G: BgGame) => boolean;
  use?(G: BgGame, p: BPlayer, t: BMinion | null): void;
  /** 能力上顯示的目前進度 */
  status?: (p: BPlayer, G: BgGame) => string | null;
  /** 取代 30 點生命值與護甲 */
  health?: number;
  minionCost?: (p: BPlayer) => number | undefined;
  refreshCost?: number;
  upgradeExtra?: number;
  shopExtra?: number;
  shopBuff?: (p: BPlayer) => [number, number];
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
    status: (p) => `目前 +${2 + Math.floor(cnt(p, 'bought') / 4)}/+${2 + Math.floor(cnt(p, 'bought') / 4)}`,
    use: (_G, p, t) => {
      const n = 2 + Math.floor(cnt(p, 'bought') / 4);
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
];

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

export function heroAvailable(h: HeroSpec, tribes: Tribe[]): boolean {
  return !h.needTribe || tribes.includes(h.needTribe);
}
