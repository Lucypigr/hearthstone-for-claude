// 英雄戰場的法術：酒館法術（酒館裡會賣）、鮮血寶石、造法法術與衍生法術
// 每張都依官方敘述手動實作；沒有實作的法術不會出現在酒館裡
import type { Recruit } from './api';
// cards.ts 也會用到這個檔案：這裡只在函式裡用 cards.ts 的東西，避免循環引用時還沒初始化
import { SPELLCRAFT_SPELLS } from './cards';
import { bgCard, hasBgCard, isRace, racesOf, tierOf } from './data';
import type { BgGame } from './game';
import { hasBattlecry } from './rules';
import { BONUS_KEYWORDS, TRIBES, type BMinion, type BPlayer, type Keyword, type Tribe } from './types';

export interface SpellCtx {
  G: BgGame;
  p: BPlayer;
  r: Recruit;
}

export interface SpellSpec {
  id: string;
  /** 要選的目標：友方手下 / 任何手下（含酒館） / 不用選 */
  target: false | 'friend' | 'any';
  /** 哪些手下可以當目標 */
  filter?: (m: BMinion, ctx: SpellCtx) => boolean;
  /** 二選一的選項 */
  choices?: string[];
  /** 二選一時，哪些選項需要目標（預設：全部都要） */
  choiceTarget?: (choice: number) => boolean;
  cast(ctx: SpellCtx, t: BMinion | null, g: number, choice: number): void;
  /** 電腦評估：大約值多少點身材 */
  v?: (G: BgGame, p: BPlayer) => number;
  /** 會給身材（霜贏局面用） */
  stats?: boolean;
}

const GEM = 'BG20_GEM';
const COIN = 'BG28_810';
const POINTY = 'EBG_Spell_014';
const CONFLAG = 'BG35_910';
const ABSORB = 'BG35_911';
const GEM_DAY = 'BG31_893';
export const BOUNTIES = ['BG33_811', 'BG33_812', 'BG33_813', 'BG33_814', 'BG33_815'];

const race = (m: BMinion, t: Tribe) => isRace(m.id, t);
const board = (ctx: SpellCtx) => ctx.p.board;
/** 最多的種族 */
export function mostCommonType(ms: BMinion[]): Tribe | null {
  const n = new Map<Tribe, number>();
  for (const m of ms) {
    const r = racesOf(m.id);
    if (r.length === TRIBES.length) continue;
    for (const t of r) n.set(t, (n.get(t) ?? 0) + 1);
  }
  let best: Tribe | null = null;
  let k = 0;
  for (const [t, c] of n) if (c > k) (best = t), (k = c);
  return best;
}

function randomDistinct<T>(ctx: SpellCtx, arr: T[], n: number): T[] {
  const bag = [...arr];
  const out: T[] = [];
  while (out.length < n && bag.length) out.push(bag.splice(Math.floor(ctx.r.rand() * bag.length), 1)[0]);
  return out;
}

const allBuff = (ctx: SpellCtx, a: number, h: number, filter: (m: BMinion) => boolean = () => true) => {
  for (const m of board(ctx)) if (filter(m)) ctx.r.spellBuff(m, a, h);
};

/** 吃掉酒館裡隨機 n 個手下（含額外關鍵字） */
function consumeRandom(ctx: SpellCtx, eater: BMinion, n: number, keywords: boolean) {
  for (let k = 0; k < n; k++) {
    const food = ctx.r.pick(ctx.p.shop);
    if (!food) return;
    if (keywords) for (const kw of BONUS_KEYWORDS) if (food[kw]) eater[kw] = true;
    ctx.r.consume(eater, food);
  }
}

const statV = (perMinion: number) => (_G: BgGame, p: BPlayer) => perMinion * Math.max(1, p.board.length);
const fixedV = (n: number) => () => n;
/** 發現的價值：大約是那個等級的手下 */
const tierV = (t: (G: BgGame, p: BPlayer) => number) => (G: BgGame, p: BPlayer) => 4 + t(G, p) * 3;

export const SPELLS: SpellSpec[] = [
  // —— 鮮血寶石、造法法術（不是酒館法術） ——
  { id: GEM, target: 'friend', cast: ({ r }, t) => t && r.gem(t), v: fixedV(2) },
  { id: COIN, target: false, cast: ({ r }) => r.gainGold(1), v: fixedV(3) },
  { id: 'BG23_000t', target: 'friend', cast: ({ r }, t, g) => t && r.tmpBuff(t, 2 * g, 0) },
  {
    id: 'BG31_924t',
    target: 'friend',
    cast: ({ r, p }, t, g) => {
      if (!t) return;
      const n = (1 + Math.floor((p.c.spells ?? 0) / 3)) * g;
      r.tmpBuff(t, n, n);
    },
  },
  { id: 'BG23_004t', target: 'friend', cast: ({ r }, t, g) => t && r.tmpBuff(t, 2 * g, 6 * g, ['taunt']) },
  { id: 'BG23_007t', target: 'friend', cast: ({ r }, t, g) => t && r.tmpBuff(t, 2 * g, 2 * g, race(t, 'NAGA') ? ['windfury'] : []) },
  { id: 'BG23_008t', target: 'friend', cast: ({ r }, t) => t && r.tmpBuff(t, 0, 0, ['shield']) },
  {
    id: 'BG32_835t', // 冥想
    target: false,
    cast: ({ r }, _t, g) => {
      r.counter('tsA', g);
      r.counter('tsH', g);
    },
  },
  {
    id: 'BG33_319t', // 霜贏局面
    target: false,
    cast: ({ r, G }, _t, g) => {
      for (let k = 0; k < g; k++) {
        const id = r.pick(STAT_SPELLS.filter((x) => G.spellInLobby(x)));
        if (id) r.getSpell(id);
      }
    },
  },
  {
    id: GEM_DAY,
    target: false,
    choices: ['你的鮮血寶石在本賽局中額外 +1 攻擊力', '你的鮮血寶石在本賽局中額外 +1 生命值'],
    cast: ({ r }, _t, g, c) => {
      if (c !== 1) r.counter('gemA', g);
      if (c !== 0) r.counter('gemH', g);
    },
    v: fixedV(5),
  },
  { id: POINTY, target: 'friend', stats: true, cast: ({ r }, t) => t && r.spellBuff(t, 4, 0), v: fixedV(4) },
  {
    id: CONFLAG,
    target: 'friend',
    stats: true,
    cast: ({ r, p }, t) => {
      const n = 4 + (p.c.elemTurn ?? 0);
      if (t) r.spellBuff(t, n, n);
    },
    v: (_G, p) => 8 + (p.c.elemTurn ?? 0) * 2,
  },
  {
    id: ABSORB,
    target: 'friend',
    filter: (m) => race(m, 'ELEMENTAL'),
    stats: true,
    cast: ({ r, p }, t) => {
      if (!t || !p.shop.length) return;
      const best = p.shop.reduce((a, b) => (b.hp > a.hp ? b : a));
      r.spellBuff(t, Math.floor(best.atk / 2), Math.floor(best.hp / 2));
    },
    v: (G) => 4 + G.round,
  },

  // —— 酒館法術：等級 1 ——
  {
    id: 'BG28_503', // 強固
    target: 'friend',
    stats: true,
    cast: ({ r }, t) => {
      if (!t) return;
      r.spellBuff(t, 0, 3);
      t.taunt = true;
    },
    v: fixedV(4),
  },
  { id: 'BG28_504', target: false, cast: ({ r }) => r.getRandom((id) => tierOf(id) === 1), v: fixedV(4) }, // 招募受訓者
  {
    id: 'BG28_512', // 魔法套索
    target: false,
    cast: ({ G, p, r }) => {
      const m = r.pick(p.shop);
      if (!m) return;
      p.shop = p.shop.filter((x) => x !== m);
      G.addMinion(p, m);
    },
    v: (G) => 4 + G.round * 0.8,
  },
  { id: 'BG28_897', target: 'friend', stats: true, cast: ({ r }, t) => t && r.spellBuff(t, 2, 2), v: fixedV(5) }, // 旅店香蕉餐
  {
    id: 'BG28_966', // 蘋果大放送
    target: false,
    cast: ({ p }) => {
      for (const m of p.shop) (m.atk += 1), (m.hp += 2);
    },
    v: fixedV(2),
  },
  {
    id: 'BG31_880', // 聯盟旗幟
    target: 'friend',
    stats: true,
    choices: ['+3/+1', '+1/+3'],
    cast: ({ r }, t, _g, c) => {
      if (!t) return;
      if (c !== 1) r.spellBuff(t, 3, 1);
      if (c !== 0) r.spellBuff(t, 1, 3);
    },
    v: fixedV(4),
  },
  { id: 'BG33_101', target: false, cast: ({ r }) => r.discover((id) => tierOf(id) === 1, '發現一個旅店等級 1 的手下'), v: fixedV(5) }, // 新芽

  // —— 等級 2 ——
  {
    id: 'BG28_518', // 主廚精選
    target: 'any',
    filter: (m) => racesOf(m.id).length > 0,
    cast: ({ r }, t) => {
      if (!t) return;
      const types = racesOf(t.id);
      r.getRandom((id) => id !== t.id && racesOf(id).some((x) => types.includes(x)));
    },
    v: (G, p) => 3 + p.tier * 2 + G.round * 0.2,
  },
  { id: 'BG28_571', target: false, cast: ({ r }) => r.gainGold(1), v: fixedV(3) }, // 急忙挖掘（用生命值購買）
  { id: 'BG28_805', target: false, cast: ({ p }) => void p.maxGoldBonus++, v: (G) => Math.max(0, 14 - G.round) * 1.4 }, // 挖到石油
  { id: 'BG28_827', target: false, cast: ({ p }) => void (p.freeRefreshes += 2), v: fixedV(4) }, // 瀏覽翻閱
  {
    id: 'BG34_330', // 時光尋跡
    target: false,
    cast: ({ G, p }) => G.discoverFor(p, (id) => tierOf(id) === p.tier, `發現一個旅店等級 ${p.tier} 的手下（鎖定 1 回合）`, { lock: true }),
    v: tierV((_G, p) => p.tier),
  },
  {
    id: 'BG35_951', // 暴風城之力
    target: false,
    stats: true,
    cast: (ctx) => {
      for (const m of randomDistinct(ctx, board(ctx), 4)) ctx.r.spellBuff(m, 1, 2);
    },
    v: (_G, p) => 3 * Math.min(4, p.board.length),
  },
  {
    id: 'BG36_883', // 贏家的麵包
    target: 'friend',
    stats: true,
    cast: ({ r, p }, t) => {
      if (!t) return;
      r.spellBuff(t, 2, 3);
      p.after.push({ k: 'bread', uid: t.uid });
    },
    v: fixedV(9),
  },

  // —— 等級 3 ——
  { id: 'BG28_168', target: false, stats: true, cast: (ctx) => allBuff(ctx, 1, 1), v: statV(2) }, // 刺眼戒指
  {
    id: 'BG28_520', // 狡猾長褲
    target: 'friend',
    stats: true,
    cast: ({ r }, t) => {
      if (!t) return;
      r.spellBuff(t, 1, 2);
      t.taunt = !t.taunt;
    },
    v: fixedV(4),
  },
  {
    id: 'BG28_521', // 平面望遠鏡
    target: false,
    cast: ({ r, p }) => {
      const t = mostCommonType(p.board);
      r.discover((id) => (t ? isRace(id, t) : true), t ? '發現一個最多的種族的手下' : '發現一個手下');
    },
    v: tierV((_G, p) => p.tier),
  },
  { id: 'BG28_800', target: false, cast: ({ p }) => void (p.nextGold += 2), v: fixedV(4) }, // 謹慎投資
  { id: 'BG28_884', target: false, cast: ({ p }) => void (p.c.overconf = (p.c.overconf ?? 0) + 1), v: (_G, p) => (p.results.slice(-2).every((x) => x === 'win') ? 6 : 3) }, // 過度自信
  { id: 'BG28_886', target: false, cast: ({ r }) => r.tavernBuff(2, 2), v: (G) => Math.max(2, 12 - G.round) }, // 蓬勃之杖
  {
    id: 'BG30_804', // 穩健進化
    target: 'friend',
    filter: (m) => tierOf(m.id) < 6,
    cast: ({ G, p }, t) => {
      if (!t) return;
      const id = G.draw((x) => tierOf(x) === tierOf(t.id) + 1);
      if (!id) return;
      G.returnToPool(t);
      const n = G.make(id);
      n.atk = t.atk;
      n.hp = t.hp;
      p.board[p.board.indexOf(t)] = n;
    },
    v: fixedV(5),
  },
  {
    id: 'BG31_881', // 時間管理
    target: false,
    stats: true,
    choices: ['賦予你的手下 +2/+2', '在你的下個回合開始時，賦予你的手下 +2/+2 兩次'],
    cast: (ctx, _t, _g, c) => {
      if (c !== 1) allBuff(ctx, 2, 2);
      if (c !== 0) ctx.p.c.timeMgmt = (ctx.p.c.timeMgmt ?? 0) + 1;
    },
    v: statV(5),
  },
  {
    id: 'BG32_337', // 海鮮燉菜
    target: 'friend',
    stats: true,
    cast: ({ r, p }, t) => {
      if (!t) return;
      const kws = new Set<Keyword>();
      for (const m of p.board) for (const k of BONUS_KEYWORDS) if (m[k]) kws.add(k);
      for (let k = 0; k <= kws.size; k++) r.spellBuff(t, 1, 1);
    },
    v: (_G, p) => 2 + 2 * new Set(p.board.flatMap((m) => BONUS_KEYWORDS.filter((k) => m[k]))).size,
  },
  {
    id: 'BG33_811', // 強健賞金
    target: false,
    stats: true,
    cast: (ctx) => {
      for (const m of randomDistinct(ctx, board(ctx), 4)) ctx.r.spellBuff(m, 0, 4);
    },
    v: (_G, p) => 3.4 * Math.min(4, p.board.length),
  },
  {
    id: 'BG33_812', // 敵意賞金
    target: false,
    stats: true,
    cast: (ctx) => {
      for (const m of randomDistinct(ctx, board(ctx), 4)) ctx.r.spellBuff(m, 4, 0);
    },
    v: (_G, p) => 4 * Math.min(4, p.board.length),
  },
  {
    id: 'BG33_813', // 自私賞金
    target: false,
    stats: true,
    cast: ({ r, p }) => {
      if (p.board[0]) r.spellBuff(p.board[0], 6, 6);
    },
    v: fixedV(11),
  },
  {
    id: 'BG33_814', // 友善賞金
    target: false,
    cast: ({ r, p }) => {
      const t = mostCommonType(p.board);
      r.getRandom((id) => (t ? isRace(id, t) : true));
    },
    v: (_G, p) => 4 + p.tier * 2,
  },
  { id: 'BG33_815', target: false, cast: ({ r }) => r.gainGold(2), v: fixedV(6) }, // 富裕賞金
  { id: 'BG36_624', target: 'friend', stats: true, cast: ({ r }, t) => t && r.spellBuff(t, 4, 8), v: fixedV(11) }, // 修復工作

  // —— 等級 4 ——
  {
    id: 'BG28_601', // 複製海螺
    target: false,
    cast: ({ G, p }) => {
      const id = G.draw((x) => isRace(x, 'MURLOC'));
      if (!id) return;
      G.addMinion(p, G.make(id));
      G.addMinion(p, G.make(id));
    },
    v: (_G, p) => 6 + p.tier * 2,
  },
  { id: 'BG28_603', target: false, cast: ({ p }) => void (p.c.boon = (p.c.boon ?? 0) + 2), v: fixedV(8) }, // 甲蟲恩澤
  {
    id: 'BG28_606', // 惡鱗特餐
    target: false,
    cast: ({ r }) => {
      for (let k = 0; k < 3; k++) {
        const id = r.pick([...SPELLCRAFT_SPELLS]);
        if (id) r.getSpell(id);
      }
    },
    v: fixedV(8),
  },
  {
    id: 'BG28_698', // 寶石沒收
    target: 'friend',
    cast: ({ r, p }, t) => {
      if (!t) return;
      r.gem(t, 3);
      const i = p.board.indexOf(t);
      for (const n of [p.board[i - 1], p.board[i + 1]]) {
        if (!n || !n.gems) continue;
        const a = n.gems * (1 + (p.c.gemA ?? 0));
        const h = n.gems * (1 + (p.c.gemH ?? 0));
        n.atk = Math.max(0, n.atk - a);
        n.hp = Math.max(1, n.hp - h);
        t.atk += a;
        t.hp += h;
        t.gems = (t.gems ?? 0) + n.gems;
        n.gems = 0;
      }
    },
    v: fixedV(8),
  },
  {
    id: 'BG28_825', // 防衛者的祭儀
    target: 'friend',
    stats: true,
    cast: ({ r }, t) => {
      if (!t) return;
      r.spellBuff(t, 7, 7);
      t.taunt = true;
    },
    v: fixedV(15),
  },
  {
    id: 'BG28_845', // 自然祝福
    target: 'any',
    filter: (m) => racesOf(m.id).length > 0,
    stats: true,
    cast: (ctx, t) => {
      if (!t) return;
      const types = racesOf(t.id);
      allBuff(ctx, 2, 1, (m) => racesOf(m.id).some((x) => types.includes(x)));
    },
    v: (_G, p) => 3 * p.board.filter((m) => racesOf(m.id).length).length * 0.7,
  },
  {
    id: 'BG28_888', // 放錯的茶具組
    target: false,
    stats: true,
    cast: (ctx) => {
      const done = new Set<BMinion>();
      for (const t of TRIBES) {
        const m = ctx.r.pick(board(ctx).filter((x) => !done.has(x) && race(x, t)));
        if (!m) continue;
        done.add(m);
        ctx.r.spellBuff(m, 4, 4);
      }
    },
    v: (_G, p) => 8 * Math.min(p.board.length, new Set(p.board.flatMap((m) => racesOf(m.id))).size),
  },
  {
    id: 'BG31_819', // 溫度轉變
    target: false,
    cast: ({ r }) => {
      r.getMinion('BG31_816');
      r.getMinion('BG31_818');
    },
    v: fixedV(10),
  },
  {
    id: 'BG31_890', // 無窮潛力
    target: false,
    choices: ['發現一個你旅店等級的手下', '發現一個你旅店等級的酒館法術'],
    cast: ({ G, p }, _t, _g, c) => {
      if (c !== 1) G.discoverFor(p, (id) => tierOf(id) === p.tier, `發現一個旅店等級 ${p.tier} 的手下`);
      if (c !== 0) G.discoverSpell(p, (id) => tierOf(id) === p.tier, `發現一個旅店等級 ${p.tier} 的酒館法術`);
    },
    v: tierV((_G, p) => p.tier),
  },
  {
    id: 'BG32_815', // 潮汐變幻
    target: 'friend',
    stats: true,
    cast: ({ r }, t) => {
      if (!t) return;
      const times = race(t, 'NAGA') ? 4 : 2;
      for (let k = 0; k < times; k++) r.spellBuff(t, 1, 1);
    },
    v: fixedV(5),
  },
  { id: 'BG34_444', target: false, cast: ({ r }) => r.counter('rb9', 1), v: (G) => Math.max(4, 22 - G.round) }, // 東來之風
  { id: 'BG34_689', target: false, cast: ({ r }) => r.counter('barrage', 1), v: (G) => Math.max(4, 20 - G.round) }, // 鮮血寶石彈幕
  {
    id: 'BG34_888', // 轉墓術
    target: false,
    cast: ({ G, p }) => G.discoverFor(p, (id) => isRace(id, 'UNDEAD'), '發現一個不死族（這回合打出的話它會死亡）', { doom: true }),
    v: fixedV(8),
  },
  {
    id: 'BG35_912', // 伊歐娜的眷顧
    target: 'any',
    filter: (m) => racesOf(m.id).length > 0 && racesOf(m.id).length < TRIBES.length,
    cast: ({ r }, t) => {
      if (t) r.tavernBuff(3, 3, racesOf(t.id)[0]);
    },
    v: (G) => Math.max(3, 14 - G.round),
  },
  {
    id: 'BG36_246', // 強力龍息
    target: false,
    stats: true,
    cast: (ctx) => {
      allBuff(ctx, 3, 2);
      allBuff(ctx, 3, 2, (m) => race(m, 'DRAGON'));
      allBuff(ctx, 3, 2, (m) => m.shield);
    },
    v: statV(7),
  },
  { id: 'BG36_301t', target: false, stats: true, cast: (ctx) => allBuff(ctx, 1, 1), v: statV(2) }, // 淤泥腐蝕
  {
    id: 'BG36_880', // 有序瘋狂
    target: 'friend',
    filter: (m) => race(m, 'DEMON'),
    cast: (ctx, t) => t && consumeRandom(ctx, t, 2, true),
    v: (G) => 6 + G.round * 1.5,
  },
  {
    id: 'BG36_884', // 武器鍛造
    target: false,
    cast: ({ r }) => {
      for (let k = 0; k < 3; k++) r.getSpell(POINTY);
    },
    v: fixedV(12),
  },

  // —— 等級 5 ——
  { id: 'BG28_500', target: false, cast: ({ p }) => void (p.armor = 5), v: (_G, p) => Math.max(0, 5 - p.armor) * (p.hp < 15 ? 2.5 : 1) }, // 護甲堆
  { id: 'BG28_573', target: false, cast: ({ p }) => void (p.c.upperHand = (p.c.upperHand ?? 0) + 1), v: (G) => 6 + G.round * 0.8 }, // 佔上風
  {
    id: 'BG28_604', // 屠殺
    target: 'friend',
    filter: (m) => race(m, 'UNDEAD'),
    cast: ({ r }, t) => {
      if (!t) return;
      r.destroy(t);
      r.counter('undeadA', 8);
    },
    v: (_G, p) => 8 * p.board.filter((m) => race(m, 'UNDEAD')).length - 6,
  },
  {
    id: 'BG28_607', // 腐化的杯子蛋糕
    target: 'friend',
    filter: (m) => race(m, 'DEMON'),
    cast: (ctx, t) => t && consumeRandom(ctx, t, 3, false),
    v: (G) => 8 + G.round * 2,
  },
  {
    id: 'BG28_830', // 黃金之觸
    target: false,
    cast: ({ G, p, r }) => {
      const m = r.pick(p.shop.filter((x) => !x.golden));
      if (!m) return;
      const base = G.make(m.id);
      m.golden = true;
      m.atk += base.atk;
      m.hp += base.hp;
    },
    v: (_G, p) => 6 + p.tier * 2,
  },
  { id: 'BG28_849', target: false, cast: ({ G, p }) => G.refreshWithSpells(p), v: fixedV(3) }, // 酒吧精選
  { id: 'BG28_882', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => !!G.specOf(id)?.deathrattle, '發現一個亡語手下'), v: tierV((_G, p) => p.tier) }, // 簽訂契約的屍體
  { id: 'BG28_GIL_836', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => hasBattlecry(id), '發現一個戰吼手下'), v: tierV((_G, p) => p.tier) }, // 受雇的獵頭者
  {
    id: 'BG31_886', // 森林的餽贈
    target: 'friend',
    stats: true,
    choices: ['賦予一個手下 +6/+6 兩次', '賦予你的手下 +2/+2'],
    choiceTarget: (c) => c !== 1,
    cast: (ctx, t, _g, c) => {
      if (c !== 1 && t) {
        ctx.r.spellBuff(t, 6, 6);
        ctx.r.spellBuff(t, 6, 6);
      }
      if (c !== 0) allBuff(ctx, 2, 2);
    },
    v: (_G, p) => Math.max(24, 4 * p.board.length),
  },
  { id: 'BG34_889', target: false, cast: ({ p }) => void (p.c.brood = (p.c.brood ?? 0) + 1), v: (_G, p) => (p.board[0] ? p.board[0].atk : 2) }, // 諾茲多姆的子嗣
  {
    id: 'BG34_990', // 金幣浪潮
    target: false,
    stats: true,
    cast: (ctx) => {
      allBuff(ctx, 3, 2);
      allBuff(ctx, 3, 2, (m) => m.golden);
    },
    v: (_G, p) => 5 * p.board.length + 5 * p.board.filter((m) => m.golden).length,
  },
  {
    id: 'BG35_922', // 女王之令
    target: false,
    stats: true,
    cast: (ctx) => {
      allBuff(ctx, 2, 2);
      allBuff(ctx, 2, 2, (m) => race(m, 'NAGA'));
    },
    v: (_G, p) => 4 * p.board.length + 4 * p.board.filter((m) => race(m, 'NAGA')).length,
  },
  { id: 'BG36_303', target: false, cast: ({ r }) => r.gainGold(2), v: fixedV(6) }, // 腐化金幣
  {
    id: 'EBG_Spell_032', // 引導吞噬者
    target: 'friend',
    filter: (_m, ctx) => ctx.p.board.length > 1,
    cast: ({ G, p, r }, t) => {
      if (!t) return;
      const to = r.pick(p.board.filter((m) => m !== t));
      const { atk, hp } = t;
      G.sellRaw(p, t);
      if (to) r.buff(to, atk, hp);
    },
    v: fixedV(4),
  },

  // —— 等級 6 ——
  {
    id: 'BG28_169', // 艾澤萊晶岩強化
    target: false,
    stats: true,
    cast: (ctx) => {
      allBuff(ctx, 2, 2);
      allBuff(ctx, 2, 2);
    },
    v: statV(8),
  },
  {
    id: 'BG28_838', // 完美幻象
    target: 'friend',
    cast: (_ctx, t) => {
      if (!t) return;
      t.atk = Math.max(t.atk, 20);
      t.hp = Math.max(t.hp, 20);
    },
    v: (_G, p) => Math.max(0, ...p.board.map((m) => 40 - m.atk - m.hp)),
  },
  {
    id: 'BG36_371', // 賦能室
    target: false,
    cast: ({ r }, _t, g) => r.deity(7 * g, 7 * g),
    v: (G) => (G.s.tribes.includes('ABERRATION') ? 8 : 0),
  },
  {
    id: 'BG27_514t', // 海妖之歌
    target: 'any',
    filter: (m, ctx) => ctx.p.shop.includes(m) && m.id !== 'BG27_514',
    cast: ({ G, p }, t) => {
      if (t) G.addMinion(p, G.make(t.id));
    },
    v: fixedV(8),
  },
  {
    id: 'BG31_920t', // 進化策略
    target: false,
    cast: ({ r, p }, _t, g) => {
      const tier = Math.min(6, 1 + (p.c.darkcrest ?? 0));
      for (let k = 0; k < g; k++) r.getRandom((id) => isRace(id, 'NAGA') && tierOf(id) === tier);
    },
  },
  { id: 'TB_BaconShop_HP_038t', target: 'friend', filter: (m) => race(m, 'BEAST'), cast: ({ r }, t) => t && r.buff(t, 1, 1), v: fixedV(2) }, // 野生香蕉
  { id: 'EBG_Spell_037', target: false, cast: ({ G, p }) => G.offerPowers(p, 3, '發現一個新的英雄能力'), v: fixedV(6) }, // 揭露身分
  {
    id: 'BG31_892', // 范達爾的機運
    target: false,
    cast: ({ G, p }) => G.discoverFor(p, (id) => !!G.specOf(id)?.choices, '發現一張二選一的卡（兩個效果都會發動）', { both: true }),
    v: fixedV(12),
  },
  {
    id: 'EBG_Spell_017', // 大地之母的雙眼
    target: 'friend',
    filter: (m) => !m.golden && tierOf(m.id) <= 4,
    cast: ({ G }, t) => {
      if (!t) return;
      const base = G.make(t.id);
      t.golden = true;
      t.atk += base.atk;
      t.hp += base.hp;
    },
    v: fixedV(12),
  },
  {
    id: 'EBG_Spell_038', // 哈繆爾丟失的法杖
    target: 'any',
    filter: (m) => racesOf(m.id).length > 0 && racesOf(m.id).length < TRIBES.length,
    cast: ({ G, p }, t) => {
      if (t) G.refreshShop(p, { tribe: racesOf(t.id)[0] });
    },
    v: fixedV(6),
  },
];

/** 戰鬥中施放的法術效果（刺眼戒指、強力龍息） */
export const COMBAT_SPELLS = new Set(['BG28_168', 'BG36_246']);

export const SPELL_SPEC = new Map<string, SpellSpec>();
for (const s of SPELLS) if (!SPELL_SPEC.has(s.id)) SPELL_SPEC.set(s.id, s);

/** 會給身材的酒館法術 */
export const STAT_SPELLS = SPELLS.filter((s) => s.stats && hasBgCard(s.id) && bgCard(s.id).pool).map((s) => s.id);

/** 酒館裡會賣的法術（有實作、不含 7 本） */
export const TAVERN_SPELLS = [...SPELL_SPEC.keys()].filter((id) => hasBgCard(id) && bgCard(id).pool && (bgCard(id).tier ?? 1) <= 6);

export function isTavernSpell(id: string): boolean {
  return hasBgCard(id) && (!!bgCard(id).pool || id === POINTY || id === CONFLAG || id === ABSORB);
}

export function spellCostOf(id: string): number {
  return hasBgCard(id) ? bgCard(id).cost ?? 1 : 1;
}

export { POINTY, CONFLAG, ABSORB, GEM_DAY };
