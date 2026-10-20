// 暗月馬戲團獎品（提卡特斯、相關異象與飾品）：從手牌施放的法術
// spells.ts 會把這些加進 SPELL_SPEC；這裡不在最上層用到 cards.ts，避免循環引用
import { bgCard, hasBgCard, tierOf } from './data';
import type { BgGame } from './game';
import type { SpellSpec } from './spells';
import type { BPlayer } from './types';

const BANANA = 'BG28_897';
const fixedV = (n: number) => () => n;
const handSpace = (p: BPlayer) => Math.max(0, 10 - p.hand.length);
const spell = (G: BgGame, p: BPlayer, id: string) => G.addHand(p, { kind: 'spell', uid: G.nextUid(), id, g: 1 });

export const PRIZES: SpellSpec[] = [
  // —— 獎品等級 1 ——
  { id: 'BGS_Treasures_004', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => tierOf(id) === 1, '扭蛋好禮：發現一個旅店等級 1 的手下'), v: fixedV(3) },
  { id: 'BGS_Treasures_013', target: false, cast: ({ r }) => r.tavernBuff(1, 1), v: fixedV(4) },
  { id: 'BGS_Treasures_029', target: false, cast: ({ p }) => void (p.c.prizeRef1 = (p.c.prizeRef1 ?? 0) + 1), v: fixedV(5) },
  { id: 'BGS_Treasures_033', target: false, cast: ({ p }) => void (p.c.prizeShop = (p.c.prizeShop ?? 0) + 1), v: fixedV(5) },
  { id: 'BGS_Treasures_040', target: false, cast: ({ G, p }) => void (spell(G, p, BANANA), spell(G, p, BANANA)), v: fixedV(4) },
  {
    id: 'BGS_Treasures_100',
    target: false,
    cast: ({ G, p }) => {
      const id = G.randomSpell(p, (x) => (bgCard(x).cost ?? 1) >= 2 && tierOf(x) <= p.tier);
      if (id) spell(G, p, id);
    },
    v: fixedV(3),
  },
  { id: 'BGS_Treasures_110', target: false, cast: ({ p }) => void ((p.c.tsA = (p.c.tsA ?? 0) + 1), (p.c.tsH = (p.c.tsH ?? 0) + 1)), v: fixedV(5) },
  // —— 獎品等級 2 ——
  { id: 'BGS_Treasures_006', target: false, cast: ({ r }) => r.restock(r.p.shop.map((m) => (id: string) => tierOf(id) === Math.min(7, tierOf(m.id) + 1))), v: fixedV(5) },
  { id: 'BGS_Treasures_009', target: 'friend', cast: (_ctx, t) => void (t && (t.gifts ??= []).push('BGS_Treasures_009')), v: (G) => Math.max(4, 16 - G.round) },
  {
    id: 'BGS_Treasures_010',
    target: false,
    cast: ({ G, p }) => {
      const seen = p.lastOpp !== null && p.lastOpp >= 0 ? p.seen[p.lastOpp] : undefined;
      const ids = [...new Set((seen?.board ?? []).map((m) => m.id))].filter((id) => hasBgCard(id) && bgCard(id).type === 'MINION');
      const options: string[] = [];
      while (options.length < 3 && ids.length) options.push(ids.splice(Math.floor(G.rand() * ids.length), 1)[0]);
      if (!options.length) return;
      const d = { options, title: '時光小偷：發現一個上一個對手的手下', noPool: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
    v: fixedV(6),
  },
  { id: 'BGS_Treasures_012', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => tierOf(id) === p.tier, '老闆請客：發現一個你的等級的手下'), v: fixedV(6) },
  { id: 'BGS_Treasures_014', target: false, cast: ({ p }) => void ((p.gold += 1), (p.c['t:infGold'] = (p.c['t:infGold'] ?? 0) + 1)), v: fixedV(4) },
  { id: 'BGS_Treasures_018', target: 'friend', stats: true, cast: ({ r }, t) => void (t && (r.buff(t, 2, 0), r.buff(t, t.atk, 0))), v: fixedV(6) },
  { id: 'BGS_Treasures_026', target: 'friend', cast: ({ r }, t) => void (t && ((t.taunt = true), r.buff(t, 0, t.hp))), v: fixedV(6) },
  { id: 'BGS_Treasures_030', target: false, cast: ({ p }) => void (p.c['t:bcx'] = (p.c['t:bcx'] ?? 0) + 1), v: fixedV(4) },
  { id: 'BGS_Treasures_101', target: false, cast: ({ G, p }) => G.discoverSpell(p, (id) => tierOf(id) === p.tier, '魔皇草花：發現一張你的等級的酒館法術'), v: fixedV(5) },
  // —— 獎品等級 3 ——
  { id: 'BGS_Treasures_011', target: false, cast: ({ G, p }) => G.offerPowers(p, 3, '訓練課程：發現一個新的英雄能力'), v: fixedV(6) },
  { id: 'BGS_Treasures_015', target: 'friend', stats: true, cast: ({ r }, t) => void (t && (r.buff(t, 10, 0), (t.shield = true))), v: fixedV(10) },
  { id: 'BGS_Treasures_019', target: false, cast: ({ G, p }) => void [...Array(handSpace(p) + 1)].forEach(() => spell(G, p, BANANA)), v: (_G, p) => 2 * Math.max(1, handSpace(p)) },
  { id: 'BGS_Treasures_020', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => tierOf(id) === Math.min(7, p.tier + 1), '頂級名流：發現一個高一本的手下'), v: fixedV(8) },
  {
    id: 'BGS_Treasures_034',
    target: 'friend',
    filter: (m) => !m.golden,
    cast: ({ G, p }, t) => {
      if (!t || p.hand.length >= 10) return;
      p.board = p.board.filter((m) => m !== t);
      t.atk += 6;
      t.hp += 6;
      G.addMinion(p, t);
    },
    v: fixedV(6),
  },
  { id: 'BGS_Treasures_037', target: false, cast: ({ G, p }) => G.goldenize(p, G.pick(p.shop.filter((m) => !m.golden))), v: fixedV(7) },
  {
    id: 'BGS_Treasures_039',
    target: false,
    cast: ({ G, p }) => {
      for (const m of [...p.shop]) {
        if (p.hand.length >= 10) break;
        p.shop = p.shop.filter((x) => x !== m);
        G.addMinion(p, m);
      }
      G.refreshShop(p);
    },
    v: (_G, p) => 3 * Math.min(handSpace(p), p.shop.length),
  },
  { id: 'BGS_Treasures_104', target: false, cast: ({ p }) => void (p.c['t:spell1'] = 1), v: fixedV(3) },
  // —— 獎品等級 4 ——
  {
    id: 'BGS_Treasures_016',
    target: 'friend',
    filter: (m) => !m.golden,
    cast: ({ G, p }, t) => {
      if (!t) return;
      G.goldenize(p, t);
      if (p.hand.length < 10) {
        p.board = p.board.filter((m) => m !== t);
        G.addMinion(p, t);
      }
    },
    v: fixedV(10),
  },
  { id: 'BGS_Treasures_022', target: false, cast: ({ p }) => void (p.c.prizeCost2 = 1), v: fixedV(12) },
  {
    id: 'BGS_Treasures_023',
    target: false,
    cast: ({ p }) => {
      p.freeRefreshes += 5;
      p.c.prizeRef5 = (p.c.prizeRef5 ?? 0) + 1;
    },
    v: fixedV(10),
  },
  { id: 'BGS_Treasures_025', target: false, cast: ({ p }) => void (p.gold += 12), v: fixedV(12) },
  {
    id: 'BGS_Treasures_028',
    target: 'friend',
    stats: true,
    cast: ({ r }, t) => {
      if (!t) return;
      r.buff(t, 15, 15);
      t.shield = true;
      t.windfury = true;
    },
    v: fixedV(14),
  },
  {
    id: 'BGS_Treasures_032',
    target: false,
    cast: ({ G, p }) => {
      for (const t of [1, 2, 3]) G.discoverPrize(p, t);
    },
    v: fixedV(12),
  },
  {
    id: 'BGS_Treasures_106',
    target: false,
    cast: ({ G, p }) => {
      for (let k = handSpace(p) + 1; k > 0; k--) {
        const id = G.randomSpell(p, (x) => tierOf(x) <= p.tier);
        if (id) spell(G, p, id);
      }
    },
    v: (_G, p) => 4 * Math.max(1, handSpace(p)),
  },
];

/** 獎品等級（1 ～ 4） */
export function prizeTier(id: string): number {
  return hasBgCard(id) ? bgCard(id).prize ?? 0 : 0;
}

/** 有實作的獎品（全知長者是手下） */
export const PRIZE_IDS = [...PRIZES.map((s) => s.id), 'BG33_300'];
