// 飾品、任務獎勵與異象（依官方敘述實作；只收錄能完整執行的效果）
// 它們和英雄能力共用同一套被動效果的介面（HeroSpec），由 BgGame.hooks() 一起觸發
import type { Combat } from './api';
import { BEETLE, COIN, DEATHRATTLE_POOL, GEM, POOL_IDS, SPEC, SPELLCRAFT_SPELLS, TOKENS } from './cards';
import { bgCard, hasBgCard, isRace, racesOf, tierOf } from './data';
import type { BgGame } from './game';
import type { HeroSpec } from './heroes';
import { hasBattlecry, isMagnetic, UPGRADE_COST } from './rules';
import { BOUNTIES, isTavernSpell, SPELL_SPEC, STAT_SPELLS, TAVERN_SPELLS, type SpellSpec } from './spells';
import { GIFT_IDS } from './gifts';
import { BUDDY_IDS } from './buddies';
import { upgradeFor } from './herocards';
import { twCost, twKind } from './timewarp';
import { BONUS_KEYWORDS, TRIBES, type BMinion, type BPlayer, type Tribe } from './types';

export type RelicKind = 'lesser' | 'greater' | 'reward' | 'anomaly';

export interface RelicSpec extends Omit<HeroSpec, 'rank'> {
  kind: RelicKind;
  rank?: number;
  /** 拿到的時候 */
  onGain?(G: BgGame, p: BPlayer): void;
  /** 電腦評估：大約值多少（0 ～ 10） */
  v?: number;
  /** 異象：這局要有這個種族才會出現 */
  needTribe?: Tribe;
  /** 異象：開局時決定這局的種族 */
  tribes?: (tribes: Tribe[], all: Tribe[]) => Tribe[];
  /** 只有英雄有夥伴時才會出現 */
  needBuddyHero?: boolean;
  /** 異象：要開啟英雄夥伴 / 時光扭曲才會出現 */
  needBuddies?: boolean;
  needTimewarp?: boolean;
}

// —— 小工具 ——
const cnt = (p: BPlayer, k: string) => p.c[k] ?? 0;
const inc = (p: BPlayer, k: string, n = 1) => (p.c[k] = cnt(p, k) + n);
/** 每 n 次觸發一次（計數到 n 的倍數） */
const every = (p: BPlayer, k: string, n: number) => inc(p, k) % n === 0;
/** 每回合重置的計數（t: 開頭的計數在回合開始時歸零） */
const turnInc = (p: BPlayer, k: string) => inc(p, `t:${k}`);
const turnCnt = (p: BPlayer, k: string) => cnt(p, `t:${k}`);
const left = (p: BPlayer) => p.board[0];
const right = (p: BPlayer) => p.board[p.board.length - 1];
const race = (m: BMinion, t: Tribe) => isRace(m, t);
/** 不同的手下類型數（全部類型的手下補上缺的類型） */
export function typesOf(b: BMinion[]): number {
  const set = new Set<Tribe>();
  let wild = 0;
  for (const m of b) {
    const r = racesOf(m);
    if (r.length === TRIBES.length) wild++;
    else r.forEach((t) => set.add(t));
  }
  return Math.min(TRIBES.length, set.size + wild);
}
const plain = (G: BgGame, p: BPlayer, id: string) => G.addMinion(p, G.make(id));
const fromPool = (G: BgGame, p: BPlayer, id: string, golden = false) => {
  if (!TOKENS.has(id)) G.takeFromPool(id);
  G.addMinion(p, G.make(id, golden));
};
const randomMinion = (G: BgGame, p: BPlayer, f: (id: string) => boolean, golden = false) => {
  const id = G.draw(f);
  if (id) G.addMinion(p, G.make(id, golden));
  return id;
};
const upTo = (p: BPlayer) => (id: string) => tierOf(id) <= p.tier;
const spell = (G: BgGame, p: BPlayer, id: string, temp = false) => G.addHand(p, { kind: 'spell', uid: G.nextUid(), id, g: 1, temp });
const randomSpell = (G: BgGame, p: BPlayer, f: (id: string) => boolean = upTo(p)) => {
  const id = G.randomSpell(p, f);
  if (id) spell(G, p, id);
};
const buff = (m: BMinion | undefined, a: number, h: number) => {
  if (!m) return;
  m.atk = Math.max(0, m.atk + a);
  m.hp += h;
};
const some = <T>(G: BgGame, arr: T[], n: number): T[] => {
  const bag = [...arr];
  const out: T[] = [];
  while (out.length < n && bag.length) out.push(bag.splice(Math.floor(G.rand() * bag.length), 1)[0]);
  return out;
};
const minionsInHand = (p: BPlayer) => p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : []));

// 戰鬥中
const alive = (c: Combat, side: 0 | 1) => c.board(side).filter((m) => !m.dead);
const ends = (c: Combat, side: 0 | 1) => {
  const b = alive(c, side);
  return b.length > 1 ? [b[0], b[b.length - 1]] : b;
};
const combatSpell = (c: Combat, side: 0 | 1) => c.pick(TAVERN_SPELLS.filter((id) => c.inLobbySpell(id) && tierOf(id) <= c.heroTier(side)));
/** 只限這場戰鬥的計數（~ 開頭不會存回去） */
const once = (c: Combat, side: 0 | 1, k: string, max: number) => {
  if (c.cnt(side, `~${k}`) >= max) return false;
  c.counter(side, `~${k}`, 1);
  return true;
};
function copyOf(c: Combat, m: BMinion): BMinion {
  const x = c.make(m.id, m.golden);
  Object.assign(x, { atk: m.atk, hp: m.hp, taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, mags: m.mags.slice(), n: m.n, src: undefined });
  return x;
}
/** 戰鬥中拿到的金幣 / 免費刷新（模擬中不會存回去） */
const nextGold = (c: Combat, side: 0 | 1, n: number) => c.counter(side, 'nextGoldC', n);
const randomOf = (ids: string[], f: (id: string) => boolean) => ids.filter(f);
const pirates = (p: BPlayer) => p.board.filter((m) => race(m, 'PIRATE'));

// 有亡語的飾品效果：用假的卡牌 ID 掛在手下身上（豬豬撲滿、生鏽三叉戟）
SPEC.set('BG30_MagicItem_411', { id: 'BG30_MagicItem_411', deathrattle: (c, s) => void (c.give(c.side(s), GEM), c.give(c.side(s), GEM)) });
SPEC.set('BG30_MagicItem_917', {
  id: 'BG30_MagicItem_917',
  deathrattle: (c, s) => {
    const id = c.pick([...SPELLCRAFT_SPELLS]);
    if (id) c.give(c.side(s), id);
  },
});

const L = 'lesser' as const;
const GR = 'greater' as const;
const R = 'reward' as const;
const A = 'anomaly' as const;

export const RELICS: RelicSpec[] = [
  // ———————— 次級飾品 ————————
  { id: 'BG30_MagicItem_880', kind: L, v: 6, onGain: (_G, p) => void (inc(p, 'allA', 2), inc(p, 'allH', 1)) }, // 野性咒符
  { id: 'BG30_MagicItem_989', kind: L, v: 4, needTribe: 'UNDEAD', onGain: (_G, p) => void inc(p, 'undeadA', 3) }, // 匠心之甕
  { id: 'BG30_MagicItem_970', kind: L, v: 6, soc: (c, side) => alive(c, side).forEach((m) => c.buff(m, 2, 2)) }, // 英勇勳章
  { id: 'BG30_MagicItem_902', kind: L, v: 5, soc: (c, side) => ends(c, side).forEach((m) => c.giveKw(m, 'shield')) }, // 神聖大槌
  {
    id: 'BG30_MagicItem_962', // 訓練證書
    kind: L,
    v: 6,
    soc: (c, side) => {
      for (const m of [...alive(c, side)].sort((a, b) => a.atk - b.atk).slice(0, 2)) c.buff(m, m.atk, m.hp);
    },
  },
  { id: 'BG30_MagicItem_925', kind: L, v: 6, onAttack: (c, _side, m) => c.buff(m, 4, 0) }, // 儀式之劍
  { id: 'BG30_MagicItem_423', kind: L, v: 6, shopHigher: 1 }, // 旅店老闆的酒杯
  { id: 'BG30_MagicItem_841', kind: L, v: 6, shopFull: true, shopBuff: () => [3, 3] }, // 發光護手
  {
    id: 'BG30_MagicItem_879', // 達拉然乳酪輪
    kind: L,
    v: 5,
    shopBuff: (p) => {
      const n = 1 + Math.floor(cnt(p, 'r:879') / 4);
      return [n, n];
    },
    onReroll: (_G, p) => void inc(p, 'r:879'),
    status: (p) => `酒館的手下 +${1 + Math.floor(cnt(p, 'r:879') / 4)}/+${1 + Math.floor(cnt(p, 'r:879') / 4)}（再刷新 ${4 - (cnt(p, 'r:879') % 4)} 次強化）`,
  },
  { id: 'BG30_MagicItem_847', kind: L, v: 5, endTurn: (_G, p) => void p.maxGoldBonus++ }, // 哥布林錢包
  { id: 'BG30_MagicItem_998', kind: L, v: 4, minTier: 3, onGain: (_G, p) => void (p.gold += 2) }, // 鮑伯搖頭娃娃
  { id: 'BG30_MagicItem_804', kind: L, v: 5, powerTwice: true }, // 遠古許願骨
  {
    id: 'BG30_MagicItem_420', // 麥迪文之書
    kind: L,
    v: 6,
    onGain: (G, p) => G.discoverSpell(p, upTo(p), '麥迪文之書：發現一張酒館法術'),
    startTurn: (G, p) => G.discoverSpell(p, upTo(p), '麥迪文之書：發現一張酒館法術'),
  },
  {
    id: 'BG30_MagicItem_430', // 搖滾音樂盒
    kind: L,
    v: 6,
    onGain: (G, p) => void randomMinion(G, p, (id) => upTo(p)(id) && hasBattlecry(id)),
    startTurn: (G, p) => void randomMinion(G, p, (id) => upTo(p)(id) && hasBattlecry(id)),
  },
  {
    id: 'BG30_MagicItem_434', // 複製大教堂
    kind: L,
    v: 6,
    spellTimes: (_G, p) => (turnInc(p, '434') === 1 ? 1 : 0),
  },
  {
    id: 'BG30_MagicItem_705', // 酒保機器人的油罐
    kind: L,
    v: 4,
    onGain: (_G, p) => void (p.upgradeCost = Math.max(0, p.upgradeCost - 3)),
    startTurn: (_G, p) => void (p.upgradeCost = Math.max(0, p.upgradeCost - 3)),
  },
  {
    id: 'BG30_MagicItem_706', // 反光墜飾
    kind: L,
    v: 6,
    onGain: (G, p) => {
      const m = G.pick(p.board);
      if (m) plain(G, p, m.id);
    },
    startTurn: (G, p) => {
      const m = G.pick(p.board);
      if (m) plain(G, p, m.id);
    },
  },
  {
    id: 'BG30_MagicItem_988', // 巨豬貼紙
    kind: L,
    v: 6,
    needTribe: 'QUILBOAR',
    onGain: (G, p) => {
      for (let k = 0; k < 3; k++) spell(G, p, GEM);
      inc(p, 'gemA', 2);
      inc(p, 'gemH', 1);
    },
  },
  {
    id: 'BG30_MagicItem_700', // 死亡骨匣
    kind: L,
    v: 5,
    firstDrExtra: true,
    onGain: (G, p) => G.discoverFor(p, (id) => DEATHRATTLE_POOL.includes(id) && upTo(p)(id), '死亡骨匣：發現一個亡語手下'),
  },
  {
    id: 'BG30_MagicItem_414', // 科多獸皮包
    kind: L,
    v: 5,
    onBuy: (G, p) => some(G, p.board, 2).forEach((m) => buff(m, 2, 1)),
    onBuySpell: (G, p) => some(G, p.board, 2).forEach((m) => buff(m, 2, 1)),
  },
  {
    id: 'BG30_MagicItem_433', // 聯盟鑰匙圈
    kind: L,
    v: 5,
    onFriendDeath: (c, side, dead) => {
      if (!once(c, side, 'r433', 1)) return;
      const to = c.pick(alive(c, side));
      if (to) c.buff(to, dead.atk, dead.maxHp ?? 1);
    },
  },
  { id: 'BG30_MagicItem_544', kind: L, v: 4, needTribe: 'ELEMENTAL', onPlay: (G, p, m) => void (race(m, 'ELEMENTAL') && G.recruit(p).tavernBuff(3, 2, 'ELEMENTAL')) }, // 糯米貼紙
  { id: 'BG30_MagicItem_547', kind: L, v: 4, needTribe: 'UNDEAD', onCast: (_G, p, id) => void (isTavernSpell(id) && inc(p, 'undeadA')) }, // 舒適棺材
  { id: 'BG32_MagicItem_276', kind: L, v: 5, needTribe: 'UNDEAD', endTurn: (_G, p) => void inc(p, 'undeadA', 2) }, // 謎團墓碑
  {
    id: 'BG30_MagicItem_437', // 天譴軍團法杖
    kind: L,
    v: 4,
    needTribe: 'UNDEAD',
    avenge: [
      5,
      (c, side) => {
        const m = c.pick(alive(c, side).filter((x) => race(x, 'UNDEAD') && !x.reborn));
        if (m) c.giveKw(m, 'reborn');
      },
    ],
  },
  { id: 'BG30_MagicItem_303', kind: L, v: 4, soc: (c, side) => void c.summon(side, c.make('BG_TTN_401')) }, // 自動機頭像
  {
    id: 'BG30_MagicItem_407', // 瓶中船
    kind: L,
    v: 5,
    needTribe: 'PIRATE',
    soc: (c, side) => {
      const id = c.pick(randomOf(POOL_IDS, (x) => isRace(x, 'PIRATE') && tierOf(x) <= c.heroTier(side) && c.inLobby(x)));
      if (!id) return;
      c.give(side, id);
      const m = c.summon(side, c.make(id));
      if (m) c.attackNow(m);
    },
  },
  {
    id: 'BG30_MagicItem_411', // 豬豬撲滿
    kind: L,
    v: 4,
    needTribe: 'QUILBOAR',
    soc: (c, side) => alive(c, side).forEach((m) => race(m, 'QUILBOAR') && (m.extraDr ??= []).push({ id: 'BG30_MagicItem_411', g: 1 })),
  },
  { id: 'BG30_MagicItem_410', kind: L, v: 4, needTribe: 'QUILBOAR', avenge: [3, (c, side) => c.counter(side, 'gemH', 1)] }, // 書寫套組
  {
    id: 'BG30_MagicItem_709', // 電磁裝置
    kind: L,
    v: 5,
    needTribe: 'MECHANICAL',
    onGain: (G, p) => G.discoverFor(p, (id) => isMagnetic(id) && upTo(p)(id), '電磁裝置：發現一個磁力機械'),
    onMagnetize: (_G, _p, host) => buff(host, 3, 3),
  },
  { id: 'BG30_MagicItem_710', kind: L, v: 4, needTribe: 'MURLOC', onSell: (G, p) => void (every(p, 'r:710', 5) && randomMinion(G, p, (id) => isRace(id, 'MURLOC') && upTo(p)(id))) }, // 真菌術師貼紙
  {
    id: 'BG30_MagicItem_711', // 水兵璽戒
    kind: L,
    v: 4,
    needTribe: 'NAGA',
    onPlay: (G, p) => {
      if (!every(p, 'r:711', 4)) return;
      const t = Math.min(6, cnt(p, 'r:711') / 4);
      randomSpell(G, p, (id) => tierOf(id) === t);
    },
  },
  {
    id: 'BG30_MagicItem_713', // 淌血之心
    kind: L,
    v: 4,
    needTribe: 'UNDEAD',
    onFriendDeath: (c, side) => {
      c.counter(side, 'r:713', 1);
      if (c.cnt(side, 'r:713') % 8 === 0) c.giveRandom(side, (id) => isRace(id, 'UNDEAD') && tierOf(id) <= c.heroTier(side));
    },
  },
  {
    id: 'BG30_MagicItem_931', // 幸運虎斑貓
    kind: L,
    v: 4,
    needTribe: 'BEAST',
    onFriendDeath: (c, side) => {
      c.counter(side, 'r:931', 1);
      if (c.cnt(side, 'r:931') % 7 === 0) c.giveRandom(side, (id) => isRace(id, 'BEAST') && tierOf(id) <= c.heroTier(side));
    },
  },
  {
    id: 'BG35_MagicItem_302', // 風暴線圈貼紙
    kind: L,
    v: 4,
    needTribe: 'MECHANICAL',
    onFriendDeath: (c, side) => {
      c.counter(side, 'r:302', 1);
      if (c.cnt(side, 'r:302') % 6 === 0) c.giveRandom(side, (id) => isRace(id, 'MECHANICAL') && tierOf(id) <= c.heroTier(side));
    },
  },
  { id: 'BG30_MagicItem_821', kind: L, v: 4, onGain: (G, p) => plain(G, p, 'TB_BaconShop_HP_105t') }, // 恩若司之魚頭像
  {
    id: 'BG30_MagicItem_900', // 滑翔龍翼
    kind: L,
    v: 5,
    needTribe: 'DRAGON',
    onPlay: (G, p) => buff(G.pick(p.board.filter((m) => race(m, 'DRAGON'))), 4, 4),
    onCast: (G, p) => buff(G.pick(p.board.filter((m) => race(m, 'DRAGON'))), 4, 4),
  },
  { id: 'BG30_MagicItem_914', kind: L, v: 5, needTribe: 'MURLOC', onPlay: (_G, p) => buff(minionsInHand(p)[0], 3, 3) }, // 魚人語片語手冊
  { id: 'BG30_MagicItem_917', kind: L, v: 4, needTribe: 'NAGA', soc: (c, side) => alive(c, side).forEach((m) => race(m, 'NAGA') && (m.extraDr ??= []).push({ id: 'BG30_MagicItem_917', g: 1 })) }, // 生鏽三叉戟
  { id: 'BG30_MagicItem_924', kind: L, v: 5, needTribe: 'PIRATE', onSpend: (G, p) => some(G, pirates(p), 2).forEach((m) => buff(m, 3, 3)) }, // 藏寶海灣精釀
  {
    id: 'BG30_MagicItem_930', // 竊取之爪
    kind: L,
    v: 5,
    startTurn: (G, p) => {
      const seen = p.lastOpp !== null && p.lastOpp >= 0 ? p.seen[p.lastOpp] : undefined;
      if (!seen?.board.length) return;
      const best = seen.board.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a));
      if (hasBgCard(best.id)) plain(G, p, best.id);
    },
  },
  {
    id: 'BG30_MagicItem_978', // 布靈登的墨鏡
    kind: L,
    v: 4,
    needTribe: 'MECHANICAL',
    onSummonCombat: (c, side, m) => {
      if (!race(m, 'MECHANICAL')) return;
      const t = c.pick(alive(c, side).filter((x) => race(x, 'MECHANICAL') && !x.shield));
      if (t) c.giveKw(t, 'shield');
    },
  },
  {
    id: 'BG30_MagicItem_981', // 達拉然之眼
    kind: L,
    v: 4,
    onFriendDeath: (c, side, dead) => {
      if (racesOf(dead).length) return;
      const id = combatSpell(c, side);
      if (id) c.give(side, id);
    },
  },
  { id: 'BG30_MagicItem_984', kind: L, v: 5, needTribe: 'MECHANICAL', endTurn: (_G, p) => p.board.forEach((m) => m.shield && buff(m, 3, 0)) }, // 充能法杖
  { id: 'BG32_MagicItem_231', kind: L, v: 4, needTribe: 'PIRATE', endTurn: (_G, p) => p.board.forEach((m) => m.golden && buff(m, 3, 3)) }, // 鑲金錨
  { id: 'BG32_MagicItem_270', kind: L, v: 5, avenge: [3, (c, side) => c.counter(side, 'tsA', 1)] }, // 惡毒秘典
  {
    id: 'BG32_MagicItem_271', // 華麗的時鐘
    kind: L,
    v: 4,
    onGain: (G, p) => {
      p.gold += 2;
      p.c.greaterAt = G.round + 1;
    },
  },
  {
    id: 'BG32_MagicItem_278', // 可重複利用電池
    kind: L,
    v: 6,
    needTribe: 'MECHANICAL',
    onBuy: (G, p, m) => {
      if (turnInc(p, '278') !== 1) return;
      const s = G.make('BG31_171t');
      s.atk = m.atk;
      s.hp = m.hp;
      G.addMinion(p, s);
    },
  },
  {
    id: 'BG32_MagicItem_280', // 萬象聖壇
    kind: L,
    v: 5,
    soc: (c, side) => {
      const k = c.cnt(side, 'r:280');
      const used = new Set<BMinion>();
      for (const t of TRIBES) {
        const m = c.pick(alive(c, side).filter((x) => race(x, t) && !used.has(x)));
        if (!m) continue;
        used.add(m);
        c.buff(m, 3 + k, 2 + k);
      }
      c.counter(side, 'r:280', 1);
    },
  },
  {
    id: 'BG32_MagicItem_304', // 召喚號角
    kind: L,
    v: 5,
    onGain: (G, p) => {
      const got = new Set<string>();
      for (let k = 0; k < 6; k++) {
        const id = randomMinion(G, p, (x) => tierOf(x) === 1 && !got.has(x));
        if (id) got.add(id);
      }
    },
  },
  {
    id: 'BG32_MagicItem_350', // 奧盧姆的碎片
    kind: L,
    v: 3,
    needTribe: 'PIRATE',
    startTurn: (G, p) => void (p.gold >= 15 && !cnt(p, 'r:350') && (p.c['r:350'] = 1) && randomMinion(G, p, (id) => tierOf(id) === 5, true)),
    onSell: (G, p) => void (p.gold >= 15 && !cnt(p, 'r:350') && (p.c['r:350'] = 1) && randomMinion(G, p, (id) => tierOf(id) === 5, true)),
  },
  {
    id: 'BG32_MagicItem_360', // 怨惡薰香
    kind: L,
    v: 5,
    needTribe: 'UNDEAD',
    soc: (c, side) => {
      const u = alive(c, side).filter((m) => race(m, 'UNDEAD'));
      for (const m of u.length > 1 ? [u[0], u[u.length - 1]] : u) c.giveKw(m, 'reborn');
    },
  },
  { id: 'BG32_MagicItem_362', kind: L, v: 6, onGain: (G, p) => G.discoverFor(p, (id) => tierOf(id) === p.tier, '旅店老闆的爐火：發現一個手下（變成 12/12）', { stats: [12, 12] }) }, // 旅店老闆的爐火
  {
    id: 'BG32_MagicItem_400', // 進化聖壇
    kind: L,
    v: 3,
    onGain: (G, p) => {
      p.board = p.board.map((m) => {
        const id = G.draw((x) => tierOf(x) === 4);
        if (!id) return m;
        G.returnToPool(m);
        return G.make(id);
      });
    },
  },
  { id: 'BG32_MagicItem_416', kind: L, v: 5, bcExtra: (_G, p) => (turnInc(p, '416') === 1 ? 2 : 0) }, // 戰鼓
  {
    id: 'BG32_MagicItem_428', // 磨損的藏寶圖
    kind: L,
    v: 5,
    onGain: (G, p) => void (p.c['r:428'] = G.round + 2),
    startTurn: (G, p) => void (cnt(p, 'r:428') === G.round && (p.gold += 10)),
    status: (p, G) => (cnt(p, 'r:428') > G.round ? `再 ${cnt(p, 'r:428') - G.round} 回合` : null),
  },
  {
    id: 'BG32_MagicItem_801', // 森林之心
    kind: L,
    v: 6,
    onGain: (_G, p) => void (inc(p, 'tsA'), inc(p, 'tsH')),
    onCast: (_G, p, id) => void (isTavernSpell(id) && every(p, 'r:801', 5) && (inc(p, 'tsA'), inc(p, 'tsH'))),
  },
  {
    id: 'BG32_MagicItem_817', // 倫德貼紙
    kind: L,
    v: 5,
    onGain: (G, p) => steal(G, p),
    endTurn: (G, p) => steal(G, p),
  },
  {
    id: 'BG32_MagicItem_823', // 蠟印刻者
    kind: L,
    v: 4,
    needTribe: 'DEMON',
    onGain: (G, p) => void (p.hp > 2 && ((p.gold += 2), G.hurtHero(p, 2))),
    startTurn: (G, p) => void (p.hp > 2 && ((p.gold += 2), G.hurtHero(p, 2))),
  },
  { id: 'BG32_MagicItem_831', kind: L, v: 4, needTribe: 'ELEMENTAL', onGain: (G, p) => fromPool(G, p, 'BGS_115'), startTurn: (G, p) => fromPool(G, p, 'BGS_115') }, // 資本元素頭像
  {
    id: 'BG32_MagicItem_844', // 獻祭祭壇
    kind: L,
    v: 2,
    onGain: (G, p) => {
      p.gold += 3 * p.board.length;
      for (const m of p.board) G.returnToPool(m);
      p.board = [];
    },
  },
  { id: 'BG32_MagicItem_858', kind: L, v: 6, onGain: (G, p) => void [0, 1, 2].forEach(() => randomMinion(G, p, (id) => tierOf(id) === 4)) }, // 探險者望遠鏡
  {
    id: 'BG32_MagicItem_860', // 甲蟲樂團
    kind: L,
    v: 4,
    needTribe: 'BEAST',
    avenge: [
      5,
      (c, side) => {
        const b = c.summon(side, c.make(BEETLE));
        if (b) c.giveKw(b, 'taunt');
      },
    ],
  },
  {
    id: 'BG32_MagicItem_862', // 穢邪聖所
    kind: L,
    v: 5,
    onDeathrattle: (c, side) => {
      const b = alive(c, side);
      const m = b[b.length - 1];
      if (m) c.perm(m, 2, 2);
    },
  },
  { id: 'BG32_MagicItem_864', kind: L, v: 5, avenge: [2, (c, side) => alive(c, side).forEach((m) => c.buff(m, 1, 1))] }, // 雀鳥餵食者
  {
    id: 'BG32_MagicItem_887', // 暗影藥劑
    kind: L,
    v: 3,
    needTribe: 'DEMON',
    onGain: (_G, p) => void (p.armor += 5),
    onPlay: (G, p, m) => void (race(m, 'DEMON') && G.hurtHero(p, 1)),
  },
  {
    id: 'BG32_MagicItem_890', // 跳崖者貼紙
    kind: L,
    v: 5,
    needTribe: 'MURLOC',
    endTurn: (_G, p) => buff(left(p), 3 + turnCnt(p, 'bc'), 2 + turnCnt(p, 'bc')),
  },
  {
    id: 'BG32_MagicItem_891', // 芬利的頭盔
    kind: L,
    v: 4,
    needTribe: 'MURLOC',
    onRefresh: (G, p) => {
      for (const m of p.shop) {
        if (!race(m, 'MURLOC')) continue;
        buff(m, 5, 5);
        const kw = G.pick(BONUS_KEYWORDS.filter((k) => !m[k]));
        if (kw) m[kw] = true;
      }
    },
  },
  {
    id: 'BG32_MagicItem_893', // 藍鰓腳蹼
    kind: L,
    v: 5,
    needTribe: 'MURLOC',
    onCast: (_G, p, id) => {
      if (!isTavernSpell(id)) return;
      buff(minionsInHand(p)[0], 3, 3);
      buff(left(p), 3, 3);
    },
  },
  { id: 'BG32_MagicItem_930', kind: L, v: 4, needTribe: 'NAGA', onCast: (G, p) => void (every(p, 'r:930', 8) && randomMinion(G, p, (id) => isRace(id, 'NAGA') && upTo(p)(id))) }, // 遠古卷軸
  {
    id: 'BG32_MagicItem_931', // 艾薩拉雕像
    kind: L,
    v: 5,
    needTribe: 'NAGA',
    onGain: (G, p) => some(G, [...SPELLCRAFT_SPELLS], 3).forEach((id) => spell(G, p, id, true)),
    startTurn: (G, p) => some(G, [...SPELLCRAFT_SPELLS], 3).forEach((id) => spell(G, p, id, true)),
  },
  {
    id: 'BG32_MagicItem_935', // 旱地水手貼紙
    kind: L,
    v: 5,
    shopSpellsExtra: 1,
    spellCost: (p, cost) => (turnCnt(p, '935') ? cost : cost - 1),
    onBuySpell: (_G, p) => void turnInc(p, '935'),
  },
  {
    id: 'BG32_MagicItem_951', // 黃金墜飾
    kind: L,
    v: 6,
    needTribe: 'PIRATE',
    onGain: (G, p) => G.goldenize(p, G.pick(p.board.filter((m) => !m.golden && tierOf(m.id) <= 4))),
    startTurn: (G, p) => G.goldenize(p, G.pick(p.board.filter((m) => !m.golden && tierOf(m.id) <= 4))),
  },
  {
    id: 'BG32_MagicItem_954', // 黃金祭品
    kind: L,
    v: 5,
    needTribe: 'PIRATE',
    endTurn: (_G, p) => {
      const n = 1 + p.board.filter((m) => m.golden).length;
      buff(left(p), 4 * n, 3 * n);
    },
  },
  { id: 'BG35_MagicItem_150', kind: L, v: 4, needTribe: 'DEMON', onRefresh: (_G, p) => p.shop.forEach((m) => ((m.tmpAtk += 3), (m.tmpHp += 3))) }, // 詛咒水晶
  {
    id: 'BG35_MagicItem_301', // 搜刮者貼紙
    kind: L,
    v: 5,
    needTribe: 'MECHANICAL',
    onGain: (G, p) => void randomMinion(G, p, (id) => isMagnetic(id) && upTo(p)(id)),
    startTurn: (G, p) => void randomMinion(G, p, (id) => isMagnetic(id) && upTo(p)(id)),
  },
  { id: 'BG35_MagicItem_801', kind: L, v: 5, powerExtra: 1, onPowerUse: (_G, p) => void (p.gold += 1) }, // 副主廚貼紙
  { id: 'BG35_MagicItem_814', kind: L, v: 3, onUpgrade: (_G, p) => void (p.tier >= 6 && !cnt(p, 'r:814') && ((p.c['r:814'] = 1), (p.gold += 12))) }, // 塞滿的錢包
  { id: 'BG35_MagicItem_815', kind: L, v: 5, onGain: (G, p) => [1, 1, 2, 2, 3, 3].forEach((t) => randomMinion(G, p, (id) => tierOf(id) === t)) }, // 魔法師的禮帽
  {
    id: 'BG35_MagicItem_816', // 未知寶珠
    kind: L,
    v: 4,
    onGain: (G, p) => {
      const id = G.pick(RELICS.filter((r) => r.kind === 'lesser' && r.id !== 'BG35_MagicItem_816' && G.relicAvailable(p, r)).map((r) => r.id));
      if (id) G.gainRelic(p, id);
    },
  },
  {
    id: 'BG35_MagicItem_818', // 神秘的寶珠
    kind: L,
    v: 5,
    onGain: (_G, p) => {
      p.gold += 10;
      p.c.nextLesser = 1;
    },
  },
  { id: 'BG35_MagicItem_821', kind: L, v: 4, onGain: (G, p) => G.discoverFor(p, (id) => tierOf(id) === 7, '萬花筒：發現一個旅店等級 7 的手下（鎖定 2 回合）', { lockTurns: 2 }) }, // 萬花筒
  {
    id: 'BG35_MagicItem_840', // 炫彩之淚
    kind: L,
    v: 5,
    needTribe: 'DRAGON',
    onGain: (G, p) => plain(G, p, G.pick(['BG34_634t', 'BG34_635t', 'BG34_636t', 'BG34_637t', 'BG34_638t'])!),
    startTurn: (G, p) => plain(G, p, G.pick(['BG34_634t', 'BG34_635t', 'BG34_636t', 'BG34_637t', 'BG34_638t'])!),
  },
  {
    id: 'BG35_MagicItem_851', // 水車
    kind: L,
    v: 5,
    needTribe: 'ELEMENTAL',
    onPlay: (G, p, m) => void (race(m, 'ELEMENTAL') && turnInc(p, '851') <= 2 && randomSpell(G, p)),
  },
  {
    id: 'BG35_MagicItem_852', // 瓶中閃電
    kind: L,
    v: 4,
    onRefresh: (_G, p) => {
      if (p.shop.length < 2) return;
      const hi = p.shop.reduce((a, b) => (b.atk > a.atk ? b : a));
      const lo = p.shop.reduce((a, b) => (b.atk < a.atk ? b : a));
      if (hi !== lo) buff(lo, hi.atk, hi.hp);
    },
  },
  {
    id: 'BG35_MagicItem_871', // 熊媽媽貼紙
    kind: L,
    v: 5,
    needTribe: 'BEAST',
    onSummonCombat: (c, _side, m) => void (race(m, 'BEAST') && c.buff(m, 6, 6)),
    onPlay: (_G, _p, m) => void (race(m, 'BEAST') && buff(m, 6, 6)),
  },
  {
    id: 'BG35_MagicItem_890', // 沉船的船錨
    kind: L,
    v: 5,
    needTribe: 'PIRATE',
    onGain: (G, p) => some(G, BOUNTIES.filter((id) => G.spellInLobby(id)), 2).forEach((id) => spell(G, p, id)),
    startTurn: (G, p) => some(G, BOUNTIES.filter((id) => G.spellInLobby(id)), 2).forEach((id) => spell(G, p, id)),
  },
  { id: 'BG35_MagicItem_921', kind: L, v: 5, needTribe: 'NAGA', spellCost: (_p, cost, id) => (id && STAT_SPELLS.includes(id) ? cost - 2 : cost) }, // 寶螺項鍊
  {
    id: 'BG35_MagicItem_931', // 抄錄打字機
    kind: L,
    v: 5,
    onBuy: (G, p, m) => void (cnt(p, 'r:931') < 2 && inc(p, 'r:931') && fromPool(G, p, m.id)),
    status: (p) => `還剩 ${2 - cnt(p, 'r:931')} 次`,
  },
  { id: 'BG36_MagicItem_201', kind: L, v: 4, needTribe: 'BEAST', onGain: (G, p) => fromPool(G, p, 'BG36_201'), onAttack: (c, _side, m) => void (race(m, 'BEAST') && c.buff(m, 4, 2)) }, // 獅子魚頭像
  {
    id: 'BG36_MagicItem_202', // 戰吼圖騰
    kind: L,
    v: 6,
    minionCost: (p, m) => (m && hasBattlecry(m.id) && turnCnt(p, '202') < 2 ? 0 : undefined),
    onBuy: (_G, p, m) => void (hasBattlecry(m.id) && turnInc(p, '202')),
  },
  { id: 'BG36_MagicItem_203', kind: L, v: 5, onBattlecry: (_G, p) => [...new Set([left(p), right(p)])].forEach((m) => buff(m, 5, 5)) }, // 巨龍顱骨
  { id: 'BG36_MagicItem_205', kind: L, v: 4, onFriendReborn: (c, side) => alive(c, side).forEach((m) => c.buff(m, 2, 2)) }, // 亡語貼紙
  { id: 'BG36_MagicItem_220', kind: L, v: 5, startTurn: (_G, p) => void (p.gold += typesOf(p.board)) }, // 發光的水晶
  { id: 'BG36_MagicItem_300', kind: L, v: 4, onReroll: (_G, p) => void (p.upgradeCost = Math.max(0, p.upgradeCost - 1)) }, // 酷寒之花
  {
    id: 'BG36_MagicItem_302', // 黃金大槌
    kind: L,
    v: 5,
    needTribe: 'PIRATE',
    endTurn: (_G, p) => {
      const n = 1 + cnt(p, 'goldens');
      p.board.forEach((m) => buff(m, n, n));
    },
  },
  {
    id: 'BG36_MagicItem_303', // 透視酒杯
    kind: L,
    v: 4,
    onGain: (G, p) => void randomMinion(G, p, (id) => !!SPEC.get(id)?.choices && upTo(p)(id)),
    startTurn: (G, p) => void randomMinion(G, p, (id) => !!SPEC.get(id)?.choices && upTo(p)(id)),
  },
  { id: 'BG36_MagicItem_307', kind: L, v: 3, onCast: (_G, p, _id, t) => void (t && every(p, 'r:307', 3) && (p.gold += 1)) }, // 占卜魔杖
  {
    id: 'BG36_MagicItem_390', // 球手頭像
    kind: L,
    v: 4,
    needTribe: 'ELEMENTAL',
    onGain: (G, p) => fromPool(G, p, G.pick(['BG31_816', 'BG31_818'])!),
    startTurn: (G, p) => fromPool(G, p, G.pick(['BG31_816', 'BG31_818'])!),
  },
  { id: 'BG36_MagicItem_400', kind: L, v: 4, onGain: (G, p) => void (spell(G, p, 'BG36_303'), spell(G, p, 'BG36_303')) }, // 腐化金幣頭像
  {
    id: 'BG36_MagicItem_403', // 暮光神錘
    kind: L,
    v: 5,
    onGain: (_G, p) => void inc(p, 'allA', 1 + cnt(p, 'discards')),
    onDiscard: (_G, p) => void inc(p, 'allA'),
  },
  { id: 'BG36_MagicItem_404', kind: L, v: 4, needTribe: 'ABERRATION', onCast: (G, p, id) => void (isTavernSpell(id) && G.recruit(p).deity(4, 4)) }, // 腐化短棒
  {
    id: 'BG36_MagicItem_414', // 加重護手
    kind: L,
    v: 6,
    endTurn: (_G, p) => {
      const n = Math.max(1, cnt(p, 'r:414'));
      p.board.forEach((m) => buff(m, n, n));
    },
    startTurn: (_G, p) => void (p.c['r:414'] = Math.max(1, cnt(p, 'r:414')) * 2),
    onGain: (_G, p) => void (p.c['r:414'] = 1),
  },
  {
    id: 'BG36_MagicItem_424', // 搗蛋鬼貼紙
    kind: L,
    v: 4,
    needTribe: 'PIRATE',
    onGain: (_G, p) => void (p.gold += p.board.filter((m) => m.golden).length),
    startTurn: (_G, p) => void (p.gold += p.board.filter((m) => m.golden).length),
  },
  {
    id: 'BG36_MagicItem_609', // 欺詐者暗袖
    kind: L,
    v: 5,
    onBuy: (_G, p) => void (cnt(p, 'r:609') % 2 === 0 && (inc(p, 'r:609'), (p.gold += 1))),
    onBuySpell: (_G, p) => void (cnt(p, 'r:609') % 2 === 1 && (inc(p, 'r:609'), (p.gold += 1))),
    status: (p) => (cnt(p, 'r:609') % 2 ? '下一次：購買酒館法術' : '下一次：購買手下'),
  },
  { id: 'BG36_MagicItem_800', kind: L, v: 4, needTribe: 'DEMON', onCast: (G, p, id) => void (isTavernSpell(id) && G.recruit(p).tavernBuff(1, 1)) }, // 惡魔放血刃
  { id: 'BG36_MagicItem_811', kind: L, v: 5, onPlay: (_G, p, m) => void (turnInc(p, '811') === 1 && (m.shield = true)) }, // 防禦龜殼
  {
    id: 'BG36_MagicItem_852', // 破志者貼紙
    kind: L,
    v: 5,
    onGain: (G, p) => G.recruit(p).getPair(() => G.randomSpell(p, upTo(p)) ?? '', true),
    startTurn: (G, p) => G.recruit(p).getPair(() => G.randomSpell(p, upTo(p)) ?? '', true),
  },
  {
    id: 'BG30_MagicItem_301', // 永恆頭像
    kind: L,
    v: 4,
    needTribe: 'UNDEAD',
    onGain: (G, p) => fromPool(G, p, 'BG25_008'),
    soc: (c, side) => alive(c, side).forEach((m) => m.id === 'BG25_008' && (c.giveKw(m, 'taunt'), c.giveKw(m, 'reborn'))),
  },

  {
    id: 'BG30_MagicItem_707', // 提卡特斯貼紙
    kind: L,
    v: 6,
    onGain: (G, p) => void ((p.c['r:707'] = G.round), G.discoverPrize(p, 3)),
    startTurn: (G, p) => void ((G.round - cnt(p, 'r:707')) % 3 === 0 && G.round > cnt(p, 'r:707') && G.discoverPrize(p, 3)),
  },
  { id: 'BG36_MagicItem_411', kind: L, v: 6, onGain: (G, p) => void ((p.gold += 3), G.offerPowers(p, 3, '重振之光：發現第二個英雄能力', true)) }, // 重振之光
  { id: 'BG35_MagicItem_823', kind: L, v: 6, onGain: (G, p) => G.offerTimewarpCards(p, (id) => twKind(id) === 'minor' && twCost(id) === 2 && bgCard(id).type === 'MINION', '古舊燭臺：發現一個次級時光扭曲的 2 費手下') }, // 古舊燭臺
  {
    id: 'BG36_MagicItem_206', // 不祥之石
    kind: L,
    v: 6,
    onGain: (G, p) => {
      const t = G.mostCommonType(p);
      G.discoverGift(p, (id) => tierOf(id) === 4 && (!t || isRace(id, t)), '不祥之石：發現一個有黑暗贈禮的旅店等級 4 手下');
    },
  },

  // ———————— 強效飾品 ————————
  { id: 'BG36_MagicItem_309', kind: GR, v: 7, onGain: (G, p) => G.discoverGift(p, (id) => tierOf(id) === 7, '燭蠟長槍：發現一個有黑暗贈禮的旅店等級 7 手下') }, // 燭蠟長槍
  {
    id: 'BG36_MagicItem_610', // 邪惡邀請函
    kind: GR,
    v: 7,
    onGain: (G, p) => {
      const t = G.mostCommonType(p);
      G.discoverGift(p, (id) => tierOf(id) <= p.tier && (!t || isRace(id, t)), '邪惡邀請函：發現一個有黑暗贈禮的金色手下', { golden: true });
    },
  },
  {
    id: 'BG36_MagicItem_370', // 瑪卓薩斯匕首
    kind: GR,
    v: 6,
    onGain: (G, p) => dagger(G, p),
    startTurn: (G, p) => void (G.round % 2 === 0 && dagger(G, p)),
  },
  { id: 'BG30_MagicItem_403', kind: GR, v: 5, soc: (c, side) => alive(c, side).forEach((m) => !racesOf(m).length && c.buff(m, m.atk * 2, m.hp * 2)) }, // 鐵爐堡鐵砧
  { id: 'BG30_MagicItem_406', kind: GR, v: 6, needTribe: 'UNDEAD', onGain: (G, p) => spell(G, p, 'BG28_604'), startTurn: (G, p) => spell(G, p, 'BG28_604') }, // 屠夫鐮刀
  {
    id: 'BG30_MagicItem_419', // 絕美餐具
    kind: GR,
    v: 6,
    endTurn: (G, p) => {
      const types = TRIBES.filter((t) => p.board.some((m) => race(m, t) && racesOf(m).length < TRIBES.length));
      for (const t of types) randomMinion(G, p, (id) => isRace(id, t) && upTo(p)(id));
    },
  },
  { id: 'BG30_MagicItem_439', kind: GR, v: 6, needTribe: 'PIRATE', tripleNeedFor: (id) => (isRace(id, 'PIRATE') ? 2 : undefined) }, // 設計師眼罩
  {
    id: 'BG30_MagicItem_441', // 小鰭連身衣
    kind: GR,
    v: 5,
    needTribe: 'MURLOC',
    soc: (c, side) => {
      const h = c.hand(side);
      const m = alive(c, side)[0];
      if (!h.length || !m) return;
      const best = h.reduce((a, b) => (b.hp > a.hp ? b : a));
      c.buff(m, best.atk, best.hp);
    },
  },
  { id: 'BG30_MagicItem_540', kind: GR, v: 6, needTribe: 'BEAST', onSummonCombat: (c, _side, m) => void (race(m, 'BEAST') && c.buff(m, m.atk, 0)) }, // 蕉流猩貼紙
  {
    id: 'BG30_MagicItem_541', // 虛空墜飾
    kind: GR,
    v: 5,
    needTribe: 'DEMON',
    shopBuff: (p) => {
      const n = 2 * (1 + Math.floor(cnt(p, 'r:541') / 3));
      return [n, n];
    },
    onHeroHurt: (_G, p) => void inc(p, 'r:541'),
  },
  {
    id: 'BG30_MagicItem_542', // 翡翠攝夢符
    kind: GR,
    v: 6,
    needTribe: 'DRAGON',
    soc: (c, side) => {
      const b = alive(c, side);
      const top = Math.max(0, ...b.map((m) => m.atk));
      for (const m of b) if (race(m, 'DRAGON') && m.atk < top) c.buff(m, top - m.atk, 0);
    },
  },
  { id: 'BG30_MagicItem_545', kind: GR, v: 5, needTribe: 'MECHANICAL', avenge: [3, (c, side) => c.giveRandom(side, (id) => isMagnetic(id) && tierOf(id) <= c.heroTier(side))] }, // 冰箱磁鐵
  {
    id: 'BG30_MagicItem_801', // 罪孽石貼紙
    kind: GR,
    v: 6,
    onDiscover: (G, p, id) => {
      if (turnInc(p, '801') > 2) return;
      if (bgCard(id).type === 'MINION') plain(G, p, id);
      else spell(G, p, id);
    },
  },
  {
    id: 'BG30_MagicItem_822', // 雙子天燈
    kind: GR,
    v: 6,
    onSummonCombat: (c, side, m) => {
      if (!once(c, side, 'r822', 1)) return;
      c.summonLater(side, copyOf(c, m));
    },
  },
  {
    id: 'BG30_MagicItem_864', // 吉爾尼斯荊棘玫瑰
    kind: GR,
    v: 6,
    needTribe: 'BEAST',
    avenge: [
      3,
      (c, side) => {
        const b = alive(c, side);
        for (const m of b) c.perm(m, 4, 5);
        for (const m of b) c.damage(m, 1, null);
      },
    ],
  },
  { id: 'BG30_MagicItem_886', kind: GR, v: 6, needTribe: 'UNDEAD', onSummonCombat: (c, side, m) => void (once(c, side, 'r886', 5) && c.giveKw(m, 'shield')) }, // 強化護盾
  { id: 'BG30_MagicItem_910', kind: GR, v: 6, needTribe: 'MECHANICAL', onShieldLost: (c, side, m) => void (race(m, 'MECHANICAL') && !m.dead && once(c, side, 'r910', 3) && c.giveKw(m, 'shield')) }, // 機械岡配接器
  {
    id: 'BG30_MagicItem_923', // 源質寶箱
    kind: GR,
    v: 4,
    needTribe: 'PIRATE',
    onAttack: (c, side, m) => {
      if (!race(m, 'PIRATE')) return;
      c.counter(side, '~r923', 1);
      if (c.cnt(side, '~r923') === 2) nextGold(c, side, 1);
    },
  },
  { id: 'BG30_MagicItem_951', kind: GR, v: 4, needTribe: 'ELEMENTAL', onSell: (G, p) => void (every(p, 'r:951', 6) && randomMinion(G, p, (id) => isRace(id, 'ELEMENTAL') && upTo(p)(id))) }, // 熔岩燈
  {
    id: 'BG30_MagicItem_972', // 卡拉贊西洋棋組
    kind: GR,
    v: 7,
    soc: (c, side) => {
      const m = alive(c, side)[0];
      if (m) c.summon(side, copyOf(c, m), c.index(m) + 1);
    },
  },
  {
    id: 'BG30_MagicItem_986', // 寧神花蠟燭
    kind: GR,
    v: 5,
    spellCost: (p, cost) => (turnCnt(p, '986') < 3 ? 0 : cost),
    onBuySpell: (_G, p) => void turnInc(p, '986'),
  },
  {
    id: 'BG30_MagicItem_992', // 達納蘇斯派
    kind: GR,
    v: 5,
    shopBuff: (p) => [turnCnt(p, '992'), turnCnt(p, '992')],
    onSell: (_G, p) => {
      turnInc(p, '992');
      p.shop.forEach((m) => buff(m, 1, 1));
    },
  },
  {
    id: 'BG30_MagicItem_993', // 帕格的釣竿
    kind: GR,
    v: 7,
    onGain: (G, p) => void randomMinion(G, p, (id) => tierOf(id) === 7),
    startTurn: (G, p) => void randomMinion(G, p, (id) => tierOf(id) === 7),
  },
  { id: 'BG30_MagicItem_995', kind: GR, v: 5, needTribe: 'DRAGON', soc: (c, side) => alive(c, side).forEach((m) => c.buff(m, 0, Math.floor(m.atk / 2))) }, // 青銅計時器
  { id: 'BG30_MagicItem_996', kind: GR, v: 5, onGain: (_G, p) => void ((p.gold += 4), (p.maxGoldBonus += 4)) }, // 鮑伯的小費罐
  {
    id: 'BG32_MagicItem_111', // 毒性刺針
    kind: GR,
    v: 6,
    needTribe: 'MURLOC',
    endTurn: (G, p) => {
      const m = G.pick(p.board.filter((x) => race(x, 'MURLOC')));
      if (!m) return;
      buff(m, 8, 8);
      m.venom = true;
    },
  },
  {
    id: 'BG32_MagicItem_171', // 神聖徽記
    kind: GR,
    v: 5,
    needTribe: 'MECHANICAL',
    onShieldLost: (c, side) => {
      if (!once(c, side, 'r171', 4)) return;
      const id = combatSpell(c, side);
      if (id) c.give(side, id);
    },
  },
  {
    id: 'BG32_MagicItem_200', // 萬用飼料
    kind: GR,
    v: 6,
    needTribe: 'BEAST',
    onAttack: (c, side, m) => {
      if (!race(m, 'BEAST')) return;
      c.buff(m, 3 + c.cnt(side, 'r:200'), 0);
      c.counter(side, 'r:200', 1);
    },
  },
  {
    id: 'BG32_MagicItem_230', // 華貴天秤
    kind: GR,
    v: 5,
    needTribe: 'PIRATE',
    onSpend: (_G, p, n) => {
      if (cnt(p, 'r:230n') >= 2) return;
      inc(p, 'r:230', n);
      if (cnt(p, 'r:230') < 20) return;
      p.c['r:230'] -= 20;
      inc(p, 'r:230n');
      p.board.forEach((m) => buff(m, m.atk, 0));
    },
    status: (p) => (cnt(p, 'r:230n') >= 2 ? '已用完' : `再花 ${20 - cnt(p, 'r:230')} 枚金幣`),
  },
  {
    id: 'BG32_MagicItem_232', // 鯊魚砲
    kind: GR,
    v: 5,
    needTribe: 'PIRATE',
    onSpend: (_G, p, n) => {
      inc(p, 'r:232', n);
      while (cnt(p, 'r:232') >= 7) {
        p.c['r:232'] -= 7;
        const k = 1 + inc(p, 'r:232n') - 1;
        pirates(p).forEach((m) => buff(m, k, k));
      }
    },
    status: (p) => `再花 ${7 - cnt(p, 'r:232')} 枚金幣（+${1 + cnt(p, 'r:232n')}/+${1 + cnt(p, 'r:232n')}）`,
  },
  { id: 'BG32_MagicItem_281', kind: GR, v: 5, onCast: (_G, p, id) => void (isTavernSpell(id) && p.board.forEach((m) => !racesOf(m).length && buff(m, 4, 4))) }, // 巫師菸斗
  {
    id: 'BG32_MagicItem_282', // 渦輪增壓鑽
    kind: GR,
    v: 6,
    needTribe: 'MECHANICAL',
    onGain: (G, p) => {
      const got = new Set<string>();
      for (let k = 0; k < 5; k++) {
        const id = randomMinion(G, p, (x) => isMagnetic(x) && !got.has(x));
        if (id) got.add(id);
      }
    },
  },
  {
    id: 'BG32_MagicItem_286', // 奢華斗篷
    kind: GR,
    v: 6,
    onGain: (G, p) => cloak(G, p),
    startTurn: (G, p) => cloak(G, p),
  },
  {
    id: 'BG32_MagicItem_306', // 先驅貼紙
    kind: GR,
    v: 6,
    needTribe: 'BEAST',
    soc: (c, side) => {
      for (const m of [...alive(c, side)]) if (!m.dead && (SPEC.get(m.id)?.deathrattle || m.extraDr?.length || m.mags.some((x) => SPEC.get(x.id)?.deathrattle))) c.deathrattle(m);
    },
  },
  { id: 'BG32_MagicItem_363', kind: GR, v: 5, needTribe: 'DRAGON', onAttack: (c, side, m) => void (race(m, 'DRAGON') && !m.shield && once(c, side, 'r363', 3) && c.giveKw(m, 'shield')) }, // 精靈龍鱗片
  { id: 'BG32_MagicItem_365', kind: GR, v: 6, needTribe: 'DRAGON', socExtra: 1 }, // 沃卓肯風鈴
  { id: 'BG32_MagicItem_367', kind: GR, v: 6, eotExtra: 1 }, // 恐怖貼紙
  {
    id: 'BG32_MagicItem_700', // 奇妙蘑菇
    kind: GR,
    v: 6,
    onGain: (_G, p) => void (inc(p, 'tsA'), inc(p, 'tsH')),
    startTurn: (_G, p) => void (inc(p, 'tsA'), inc(p, 'tsH')),
  },
  { id: 'BG32_MagicItem_888', kind: GR, v: 5, needTribe: 'ELEMENTAL', onPlay: (_G, p, m) => void (race(m, 'ELEMENTAL') && p.freeRefreshes++) }, // 回收貼紙
  {
    id: 'BG32_MagicItem_904', // 野豬澡盆
    kind: GR,
    v: 6,
    needTribe: 'QUILBOAR',
    soc: (c, side) => alive(c, side).forEach((m) => c.buff(m, 3 * (1 + c.cnt(side, 'gemA')), 3 * (1 + c.cnt(side, 'gemH')))),
  },
  {
    id: 'BG32_MagicItem_922', // 魅惑牧笛
    kind: GR,
    v: 5,
    needTribe: 'NAGA',
    endTurn: (_G, p) => buff(left(p), 3 + cnt(p, 'r:922'), 3 + cnt(p, 'r:922')),
    onCast: (_G, p) => void inc(p, 'r:922'),
  },
  {
    id: 'BG32_MagicItem_934', // 炫目匕首
    kind: GR,
    v: 5,
    needTribe: 'NAGA',
    onGain: (_G, p) => void inc(p, 'allA', 1 + Math.floor(cnt(p, 'spells') / 4)),
    onCast: (_G, p) => void (cnt(p, 'spells') % 4 === 0 && inc(p, 'allA')),
  },
  { id: 'BG32_MagicItem_944', kind: GR, v: 6, onGain: (G, p) => spell(G, p, 'BG28_169'), startTurn: (G, p) => spell(G, p, 'BG28_169') }, // 強化頭像
  { id: 'BG35_MagicItem_710', kind: GR, v: 5, needTribe: 'PIRATE', onCast: (_G, p, id) => void (isTavernSpell(id) && pirates(p).forEach((m) => buff(m, 3, 3))) }, // 微縮船隻
  {
    id: 'BG35_MagicItem_711', // 防護戒指
    kind: GR,
    v: 5,
    needTribe: 'PIRATE',
    soc: (c, side) => {
      const ps = alive(c, side).filter((m) => race(m, 'PIRATE') && !m.shield);
      for (let k = 0; k < 4 && ps.length; k++) c.giveKw(ps.splice(Math.floor(c.rand() * ps.length), 1)[0], 'shield');
    },
  },
  { id: 'BG35_MagicItem_713', kind: GR, v: 5, needTribe: 'PIRATE', onGetCard: (_G, p, card) => void (card.kind === 'minion' && race(card.m, 'PIRATE') && buff(left(p), 16, 16)) }, // 可靠的鐵撬
  { id: 'BG35_MagicItem_923', kind: GR, v: 6, needTribe: 'NAGA', onCast: (_G, p) => p.board.forEach((m) => buff(m, 1, 1)) }, // 魔咒彩帶
  { id: 'BG36_MagicItem_214', kind: GR, v: 5, endTurn: (G, p) => [...p.board].forEach((m) => SPEC.get(m.id)?.rally && G.rallyOutside(p, m)) }, // 暴動者之刃
  { id: 'BG36_MagicItem_215', kind: GR, v: 6, needTribe: 'DRAGON', bcExtra: (_G, _p, m) => (race(m, 'DRAGON') ? 1 : 0) }, // 巨龍之眼
  { id: 'BG36_MagicItem_217', kind: GR, v: 4, needTribe: 'UNDEAD', onFriendReborn: (c, side, m) => void (once(c, side, 'r217', 3) && c.give(side, m.id)) }, // 葬禮花圈
  { id: 'BG36_MagicItem_308', kind: GR, v: 4, needTribe: 'QUILBOAR', bothChoices: true }, // 先鋒貼紙
  {
    id: 'BG36_MagicItem_371', // 蜂巢戒指
    kind: GR,
    v: 5,
    spellExtra: (p) => [1 + turnCnt(p, '371'), 1 + turnCnt(p, '371')],
    onCast: (_G, p, _id, t) => void (t && turnInc(p, '371')),
  },
  {
    id: 'BG36_MagicItem_372', // 記憶之球
    kind: GR,
    v: 5,
    endTurn: (G, p) => {
      if (p.lastSpell) for (let k = 0; k < 3; k++) spell(G, p, p.lastSpell);
    },
  },
  {
    id: 'BG36_MagicItem_373', // 多層盾牌
    kind: GR,
    v: 6,
    spellExtra: (p) => {
      const k = Math.max(1, typesOf(p.board));
      return [k, 2 * k];
    },
  },
  { id: 'BG36_MagicItem_418', kind: GR, v: 4, onDiscard: (_G, p) => void (every(p, 'r:418', 3) && (inc(p, 'tsA'), inc(p, 'tsH'))) }, // 遠古秘典
  { id: 'BG36_MagicItem_830', kind: GR, v: 4, needTribe: 'DEMON', onCast: (G, p, id) => void (isTavernSpell(id) && G.recruit(p).addFodder(1)) }, // 血怒盾牌
  { id: 'BG36_MagicItem_840', kind: GR, v: 5, needTribe: 'MECHANICAL', onBuy: (G, p, m) => void (race(m, 'MECHANICAL') && randomSpell(G, p)) }, // 秘密結構圖
  { id: 'BG36_MagicItem_850', kind: GR, v: 5, needTribe: 'MURLOC', onPlay: (G, p, m) => void (race(m, 'MURLOC') && every(p, 'r:850', 5) && (randomSpell(G, p), randomSpell(G, p))) }, // 餅乾的攪湯棒
  {
    id: 'BG35_MagicItem_862', // 猛燃餘燼
    kind: GR,
    v: 5,
    needTribe: 'ELEMENTAL',
    onReroll: (_G, p) => {
      if (!p.shop.length) return;
      const m = p.shop.reduce((a, b) => (b.hp > a.hp ? b : a));
      buff(m, m.atk, m.hp);
    },
  },
  {
    id: 'BG30_MagicItem_999', // 花俏法術書
    kind: GR,
    v: 5,
    needTribe: 'NAGA',
    onSpend: (G, p, n) => {
      inc(p, 'r:999', n);
      while (cnt(p, 'r:999') >= 7) {
        p.c['r:999'] -= 7;
        G.castRandom(p, 'BG28_168');
      }
    },
    status: (p) => `再花 ${7 - cnt(p, 'r:999')} 枚金幣`,
  },
  { id: 'BG30_MagicItem_310', kind: GR, v: 5, onGain: (G, p) => fromPool(G, p, 'BG25_354'), soc: (c, side) => alive(c, side).forEach((m) => m.id === 'BG25_354' && c.buff(m, 0, m.hp)) }, // 瑞文戴爾頭像
  { id: 'BG36_MagicItem_611', kind: GR, v: 6, onGain: (G, p) => spell(G, p, 'BG34_272'), startTurn: (G, p) => spell(G, p, 'BG34_272') }, // 餐具頭像

  // ———————— 任務獎勵 ————————
  { id: 'BG24_Reward_107', kind: R, v: 6, endTurn: (G, p) => some(G, p.board.filter((m) => hasBattlecry(m.id)), 2).forEach((m) => G.recruit(p).battlecry(m)) }, // 我笑我咬
  {
    id: 'BG24_Reward_111', // 邪惡雙子
    kind: R,
    v: 7,
    soc: (c, side) => {
      const b = alive(c, side);
      if (!b.length) return;
      const m = b.reduce((a, x) => (x.hp > a.hp ? x : a));
      c.summon(side, copyOf(c, m), c.index(m) + 1);
    },
  },
  { id: 'BG24_Reward_113', kind: R, v: 6, onFriendDeath: (c, _side, dead) => void (SPEC.get(dead.id)?.deathrattle && c.perm(dead, 5, 5)) }, // 儀式匕首
  {
    id: 'BG24_Reward_115', // 希奧塔的遮陽傘
    kind: R,
    v: 5,
    endTurn: (_G, p) => {
      const m = right(p);
      if (!m) return;
      m.hp += 8;
      if (!m.tmpKw.includes('stealth')) m.tmpKw.push('stealth');
    },
  },
  { id: 'BG24_Reward_123', kind: R, v: 6, bcExtra: (_G, p) => (turnInc(p, 'r123') === 1 ? 2 : 0) }, // 精緻的海螺
  { id: 'BG24_Reward_125', kind: R, v: 7, onGain: (_G, p) => void inc(p, 'allA', 4) }, // 冒煙的槍
  {
    id: 'BG24_Reward_128', // 鏡面之盾
    kind: R,
    v: 6,
    onRefresh: (G, p) => {
      const m = G.pick(p.shop);
      if (!m) return;
      buff(m, 6, 6);
      m.shield = true;
    },
  },
  {
    id: 'BG24_Reward_129', // 秘密罪孽石
    kind: R,
    v: 6,
    onDiscover: (G, p, id) => {
      if (bgCard(id).type === 'MINION') plain(G, p, id);
      else spell(G, p, id);
    },
  },
  { id: 'BG24_Reward_131', kind: R, v: 7, startTurn: (G, p) => buff(G.pick(minionsInHand(p)), 12, 12) }, // 犯罪現場
  { id: 'BG24_Reward_136', kind: R, v: 6, endTurn: (G, p) => some(G, p.board.filter((m) => tierOf(m.id) <= 3), 3).forEach((m) => buff(m, 3, 3)) }, // 小小嘍囉
  {
    id: 'BG24_Reward_138', // 被害者的幽靈
    kind: R,
    v: 5,
    afterCombat: (G, p) => {
      const id = p.lastDied?.[p.lastDied.length - 1];
      if (id && hasBgCard(id)) plain(G, p, id);
    },
  },
  { id: 'BG24_Reward_305', kind: R, v: 5, onSell: (G, p, m) => buff(G.pick(p.shop), m.atk, m.hp) }, // 靈魄賄賂
  {
    id: 'BG24_Reward_306', // 料理之書
    kind: R,
    v: 6,
    onBuy: (_G, p, m) => {
      const n = 2 + cnt(p, 'r:306');
      buff(m, n, n);
      inc(p, 'r:306');
    },
  },
  {
    id: 'BG24_Reward_308', // 藍綠虎藍寶石
    kind: R,
    v: 6,
    shopBuff: (p) => [turnCnt(p, 'rr'), turnCnt(p, 'rr')],
  },
  {
    id: 'BG24_Reward_309', // 惡魔就在細節裡
    kind: R,
    v: 6,
    endTurn: (G, p) => {
      for (const m of [...new Set([left(p), right(p)])]) {
        const food = G.pick(p.shop);
        if (m && food) G.recruit(p).consume(m, food);
      }
    },
  },
  { id: 'BG24_Reward_311', kind: R, v: 5, onGain: (G, p) => G.discoverFor(p, (id) => tierOf(id) === p.tier, '又一具隱藏的屍體：發現一個你的等級的手下') }, // 又一具隱藏的屍體
  { id: 'BG24_Reward_312', kind: R, v: 8, soc: (c, side) => alive(c, side).forEach((m) => c.buff(m, 12, 12)) }, // 起源法杖
  {
    id: 'BG24_Reward_321', // 變換自我
    kind: R,
    v: 6,
    shopBuff: (_p, m, G) => (m && G && (tierOf(m.id) % 2 === 0) === (G.round % 2 === 0) ? [7, 7] : [0, 0]),
  },
  {
    id: 'BG24_Reward_331', // 展覽廳災難
    kind: R,
    v: 6,
    endTurn: (_G, p) => {
      const n = typesOf(p.board);
      p.board.forEach((m) => buff(m, n, n));
    },
  },
  { id: 'BG24_Reward_350', kind: R, v: 7, tripleNeed: 2 }, // 失竊之燈
  {
    id: 'BG24_Reward_361', // 隱藏的寶庫
    kind: R,
    v: 6,
    startTurn: (_G, p) => {
      p.gold += 1 + cnt(p, 'r:361');
      inc(p, 'r:361');
    },
  },
  { id: 'BG24_Reward_708', kind: R, v: 6, endTurn: (_G, p) => buff(right(p), Math.max(0, 30 - p.hp), 0) }, // 血之聖杯
  {
    id: 'BG24_Reward_712', // 罪殞城勳章
    kind: R,
    v: 6,
    onPlay: (G, p, m) => some(G, p.board.filter((x) => x !== m && tierOf(x.id) === tierOf(m.id)), 2).forEach((x) => buff(x, 4, 4)),
  },
  { id: 'BG27_Reward_502', kind: R, v: 5, avenge: [3, (c, side) => void (alive(c, (1 - side) as 0 | 1).length && c.damage(alive(c, (1 - side) as 0 | 1).reduce((a, b) => (b.hp > a.hp ? b : a)), 10, null))] }, // 爆爆小隊
  { id: 'BG27_Reward_503', kind: R, v: 6, onBuy: (G, p, m) => buff(G.pick(p.board), m.atk, m.hp) }, // 振奮海螺
  { id: 'BG27_Reward_802', kind: R, v: 7, bcExtra: () => 1 }, // 吉爾尼斯戰爭號角
  { id: 'BG27_Reward_803', kind: R, v: 7, drExtra: 1 }, // 動盪陵墓
  {
    id: 'BG27_Reward_804', // 結實碎片
    kind: R,
    v: 5,
    endTurn: (_G, p) => {
      const n = p.board.filter((m) => m.taunt).length;
      p.board.forEach((m) => !m.taunt && buff(m, n, 2 * n));
    },
  },
  {
    id: 'BG27_Reward_806', // 分身墜盒
    kind: R,
    v: 6,
    afterCombat: (G, p) => {
      const seen = p.lastOpp !== null && p.lastOpp >= 0 ? p.seen[p.lastOpp] : undefined;
      const objs = some(G, (seen?.board ?? []).filter((m) => !m.golden && hasBgCard(m.id)), 3);
      if (objs.length) G.offerObjs(p, objs, '分身墜盒：發現一個上一個對手的手下');
    },
  },
  {
    id: 'BG27_Reward_810', // 未知地圖
    kind: R,
    v: 5,
    onPlay: (_G, p, m) => {
      const others = p.board.filter((x) => x !== m);
      if (!racesOf(m).some((t) => !others.some((x) => race(x, t)))) return;
      for (const t of TRIBES) {
        const x = p.board.find((y) => race(y, t));
        if (x) buff(x, 2, 2);
      }
    },
  },
  { id: 'BG27_Reward_811', kind: R, v: 7, minionCost: () => 2 }, // 浸血之書
  {
    id: 'BG27_Reward_815', // 無盡血月
    kind: R,
    v: 6,
    onGain: (_G, p) => void (inc(p, 'gemA'), inc(p, 'gemH')),
    startTurn: (G, p) => void (spell(G, p, GEM), spell(G, p, GEM)),
  },
  { id: 'BG28_Reward_500', kind: R, v: 5, spellCost: (_p, cost) => cost - 1 }, // 超越幻象
  { id: 'BG28_Reward_501', kind: R, v: 7, spellTimes: (_G, _p, id) => (isTavernSpell(id) ? 1 : 0) }, // 擾動時光
  { id: 'BG28_Reward_502', kind: R, v: 5, onBuySpell: (G, p, id) => void (bgCard(id).cost !== undefined && (bgCard(id).cost ?? 0) >= 3 && spell(G, p, id)) }, // 分裂卷軸
  {
    id: 'BG28_Reward_504', // 能量循環
    kind: R,
    v: 5,
    avenge: [
      3,
      (c, side) => {
        const id = combatSpell(c, side);
        if (id) c.give(side, id);
      },
    ],
  },
  {
    id: 'BG28_Reward_505', // 翻滾之禍
    kind: R,
    v: 6,
    onSummonCombat: (c, side, m) => c.buff(m, 4 + c.cnt(side, 'r:505'), 4 + c.cnt(side, 'r:505')),
    avenge: [4, (c, side) => c.counter(side, 'r:505', 1)],
  },
  {
    id: 'BG28_Reward_506', // 雙頭獎勵
    kind: R,
    v: 6,
    onBuy: (G, p, m) => void (turnInc(p, 'r506') === 1 && fromPool(G, p, m.id)),
    onBuySpell: (G, p, id) => void (turnInc(p, 'r506') === 1 && spell(G, p, id)),
  },
  {
    id: 'BG28_Reward_508', // 金狗頭人的贈禮
    kind: R,
    v: 6,
    onReroll: (G, p) => {
      if (!every(p, 'r:508', 5) || !p.shop.length) return;
      G.goldenize(p, p.shop.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a)));
    },
    status: (p) => `再刷新 ${5 - (cnt(p, 'r:508') % 5)} 次`,
  },
  {
    id: 'BG28_Reward_509', // 熔煉室
    kind: R,
    v: 6,
    startTurn: (G, p) => {
      const t = Math.min(6, 1 + cnt(p, 'r:509'));
      const m = G.pick(p.board.filter((x) => !x.golden && tierOf(x.id) === t));
      G.goldenize(p, m);
      inc(p, 'r:509');
    },
  },
  {
    id: 'BG28_Reward_514', // 奔放巫術
    kind: R,
    v: 7,
    startTurn: (G, p) => {
      for (let k = 0; k < 5; k++) {
        const id = G.randomSpell(p, (x) => upTo(p)(x) && !!G.castable(x));
        if (id) G.castRandom(p, id);
      }
    },
  },
  { id: 'BG28_Reward_515', kind: R, v: 6, startTurn: (G, p) => void [0, 1, 2].forEach(() => randomSpell(G, p)) }, // 銘文收藏
  {
    id: 'BG28_Reward_518', // 穩定的混合體
    kind: R,
    v: 6,
    avenge: [
      7,
      (c, side) => {
        const m = c.make('TB_BaconShop_HP_033t');
        m.atk = 50;
        m.hp = 50;
        c.summonLater(side, m);
      },
    ],
  },
  {
    id: 'BG33_Reward_003', // 正義衝鋒
    kind: R,
    v: 6,
    soc: (c, side) => {
      const m = alive(c, side)[0];
      if (!m) return;
      c.giveKw(m, 'shield');
      c.attackNow(m);
    },
  },
  { id: 'BG33_Reward_004', kind: R, v: 5, avenge: [2, (c, side) => c.counter(side, 'freeRefC', 1)] }, // 冷冽清新劑
  { id: 'BG33_Reward_012', kind: R, v: 6, onGain: (_G, p) => void ((p.gold += 5), (p.maxGoldBonus += 5)) }, // 無盡財寶
  {
    id: 'BG33_Reward_013', // 黃金熔爐
    kind: R,
    v: 7,
    startTurn: (G, p) => {
      const ms = p.shop.filter((m) => !m.golden);
      if (ms.length) G.goldenize(p, ms.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a)));
    },
  },
  {
    id: 'BG33_Reward_014', // 古雅精品店
    kind: R,
    v: 5,
    onGain: (G, p) => void (p.c['r:014'] = G.round + 1),
    startTurn: (G, p) => void (cnt(p, 'r:014') === G.round && ((p.gold += 4), G.offerTrinkets(p, 'lesser'))),
  },
  {
    id: 'BG33_Reward_015', // 特大倉庫
    kind: R,
    v: 6,
    onGain: (G, p) => void (p.c['r:015'] = G.round + 1),
    startTurn: (G, p) => void (cnt(p, 'r:015') === G.round && ((p.gold += 4), G.offerTrinkets(p, 'greater'))),
  },
  { id: 'BG33_Reward_017', kind: R, v: 6, onGain: (G, p) => G.offerPowers(p, 3, '星宙獎勵：發現第二個英雄能力', true) }, // 星宙獎勵
  { id: 'BG33_Reward_020', kind: R, v: 6, onGain: (_G, p) => void (inc(p, 'tsA', 2), inc(p, 'tsH', 1)) }, // 永恆咒術

  // ———————— 異象 ————————
  { id: 'BG27_Anomaly_000', kind: A, goldBase: () => 10 }, // 金錢遊戲
  { id: 'BG27_Anomaly_001', kind: A, startGame: (_G, p) => setTier(p, 2) }, // 講究的沙漏
  { id: 'BG27_Anomaly_002', kind: A, endTurn: (_G, p) => void (p.c.carry = p.gold + (p.gold >= 5 ? 1 : 0)) }, // 艾蜜特斯的謹慎
  {
    id: 'BG27_Anomaly_005', // 彌米倫發條競技場
    kind: A,
    noUpgrade: true,
    startTurn: (G, p) => {
      if (G.round > 1 && G.round % 2 === 1 && p.tier < G.maxTier(p)) setTier(p, p.tier + 1);
    },
  },
  {
    id: 'BG27_Anomaly_006', // 阿格拉瑪詛咒
    kind: A,
    goldBase: (round) => Math.min(10, round + 4),
    startGame: (_G, p) => void ((p.hp = 5), (p.armor = 0)),
    combatDamage: (_p, dmg) => Math.min(1, dmg),
  },
  { id: 'BG27_Anomaly_100', kind: A, minTier: 3, startGame: (_G, p) => void (setTier(p, 3), (p.armor += 10)) }, // 大大聯盟
  { id: 'BG27_Anomaly_103', kind: A, shopFull: true, tribes: (_t, all) => all }, // 旅店特典
  ...(['BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'QUILBOAR', 'UNDEAD', 'PIRATE'] as Tribe[]).map(
    (t, i): RelicSpec => ({ id: `BG27_Anomaly_104t${i ? i + 1 : ''}`, kind: A, needTribe: t, onlyTribe: t }), // 哎呦，全是…！
  ),
  { id: 'BG27_Anomaly_301', kind: A, tripleNeed: 2, coinTriples: true }, // 虛假塑像
  {
    id: 'BG27_Anomaly_303', // 泰坦爪鉤
    kind: A,
    minionCost: (p) => (turnCnt(p, 'buy') === 0 ? 0 : undefined),
  },
  {
    id: 'BG27_Anomaly_501', // 阿曼蘇爾的節制
    kind: A,
    goldBase: (round) => Math.min(10, round + 8),
    startGame: (_G, p) => setTier(p, 3),
  },
  { id: 'BG27_Anomaly_502', kind: A, startTurn: (_G, p) => void (p.hp = 12) }, // 薩格拉斯之血
  { id: 'BG27_Anomaly_504', kind: A, maxTier: 7, startGame: (_G, p) => void (p.armor += 10) }, // 諾甘農的秘密
  {
    id: 'BG27_Anomaly_505', // 胡亂強化
    kind: A,
    onShopMinion: (G, _p, m) => {
      const kw = G.pick(['taunt', 'windfury', 'shield', 'reborn'] as const)!;
      m[kw] = true;
    },
  },
  { id: 'BG27_Anomaly_556', kind: A, minTier: 2, minionCost: (_p, m) => (m ? tierOf(m.id) : undefined), startGame: (_G, p) => setTier(p, 2) }, // 價格通膨
  ...(
    [
      ['BG27_Anomaly_572', 5, 3],
      ['BG27_Anomaly_559', 6, 4],
      ['BG27_Anomaly_570', 7, 5],
      ['BG27_Anomaly_571', 8, 6],
    ] as const
  ).map(
    ([id, turn, tier]): RelicSpec => ({
      id, // 寶藏庫
      kind: A,
      startTurn: (G, p) => void (G.round === turn && G.discoverFor(p, (x) => tierOf(x) === tier, `寶藏庫：發現一個金色的旅店等級 ${tier} 手下`, { golden: true })),
    }),
  ),
  {
    id: 'BG27_Anomaly_560', // 異象雙子
    kind: A,
    soc: (c, side) => {
      const b = alive(c, side);
      if (!b.length) return;
      const m = b.reduce((a, x) => (x.hp > a.hp ? x : a));
      c.summon(side, copyOf(c, m), c.index(m) + 1);
    },
  },
  { id: 'BG27_Anomaly_561', kind: A, onSell: (G, p, m) => buff(G.pick(p.shop), m.atk, m.hp) }, // 異象賄賂
  {
    id: 'BG27_Anomaly_575', // 最後一刻
    kind: A,
    combatDamage: (p, dmg) => {
      if (dmg < p.hp + p.armor || cnt(p, 'lastStand')) return dmg;
      p.c.lastStand = 1;
      p.nextGold += 11;
      return 0;
    },
  },
  { id: 'BG27_Anomaly_711', kind: A, onBuy: (G, p, m) => void (turnInc(p, 'bogo') === 1 && fromPool(G, p, m.id)), onBuySpell: (G, p, id) => void (turnInc(p, 'bogo') === 1 && spell(G, p, id)) }, // 買一送一
  {
    id: 'BG27_Anomaly_714', // 失火啦！
    kind: A,
    startGame: (_G, p) => void (p.hp -= 25),
    onHeroDeath: (_G, p) => void (p.hp += 5),
  },
  {
    id: 'BG27_Anomaly_715', // 鬥士的戰利品
    kind: A,
    afterCombat: (G, p, res) => {
      if (res === 'win') G.discoverFor(p, (id) => tierOf(id) === p.tier, '鬥士的戰利品：發現一個你的等級的手下');
      else randomMinion(G, p, (id) => tierOf(id) === Math.max(1, p.tier - 1));
    },
  },
  {
    id: 'BG27_Anomaly_718', // 監督者的寶珠
    kind: A,
    onUpgrade: (G, p) => {
      const t = G.mostCommonType(p);
      if (t) G.refreshShop(p, { tribe: t });
    },
  },
  {
    id: 'BG27_Anomaly_721', // 不退款就搗蛋
    kind: A,
    goldBase: (round) => Math.min(10, round),
    minionCost: () => 1,
    sellPrice: () => 0,
    upgradeExtra: -2,
  },
  {
    id: 'BG27_Anomaly_726', // 是福還是禍
    kind: A,
    soc: (c, side) => {
      const b = alive(c, side);
      if (!b.length) return;
      c.giveKw(b[0], 'shield');
      c.giveKw(b[b.length - 1], 'reborn');
    },
  },
  { id: 'BG27_Anomaly_750', kind: A, shopFull: true }, // 座無虛席
  { id: 'BG27_Anomaly_800', kind: A, maxTier: 4 }, // 小小聯盟
  { id: 'BG27_Anomaly_801', kind: A, allGolden: true }, // 黃金競技場
  { id: 'BG27_Anomaly_802', kind: A, bcExtra: () => 1, drExtra: 1 }, // 阿古斯的迴響
  { id: 'BG27_Anomaly_900', kind: A, minionCost: () => 2, noRefresh: true, onBuy: (G, p) => G.refreshShop(p), onBuySpell: (G, p) => G.refreshShop(p) }, // 葛剛尼斯的風暴
  { id: 'BG27_Anomaly_Buddies', kind: A }, // 夥伴
  { id: 'BG27_Anomaly_Quests', kind: A }, // 任務
  { id: 'BG31_Anomaly_101', kind: A, shopSpellsExtra: 1 }, // 情勢判斷
  {
    id: 'BG31_Anomaly_104', // 水漲船高
    kind: A,
    onUpgrade: (G, p) => {
      const t = Math.min(6, 1 + Math.floor((G.round - 1) / 2));
      G.discoverSpell(p, (id) => tierOf(id) === t, `水漲船高：發現一張旅店等級 ${t} 的酒館法術`);
    },
  },
  { id: 'BG31_Anomaly_105', kind: A, onBuySpell: (G, p, id) => void (G.round >= 5 && turnInc(p, 'sindo') === 1 && spell(G, p, id)) }, // 辛多雷之鏡
  { id: 'BG31_Anomaly_109', kind: A, startTurn: (G, p) => void (G.round >= 3 && G.discoverSpell(p, upTo(p), '奧秘之花：發現一張酒館法術')) }, // 奧秘之花
  { id: 'BG31_Anomaly_111', kind: A, onlyTier: true }, // 精靈菁英
  {
    id: 'BG31_Anomaly_114', // 流水線
    kind: A,
    endTurn: (G, p) => {
      if (G.round % 2 === 0 && left(p) && !cnt(p, `~line${G.round}`)) {
        p.c[`~line${G.round}`] = 1;
        plain(G, p, left(p).id);
      }
    },
  },
  {
    id: 'BG31_Anomaly_116', // 點亮道路
    kind: A,
    onReroll: (_G, p) => void (every(p, 'r:a116', 2) && (p.nextGold += 1)),
  },
  { id: 'BG31_Anomaly_120', kind: A, startGame: (G, p) => void p.board.push(G.make('BG24_715', true)) }, // 斥候榮耀
  {
    id: 'BG31_Anomaly_126', // 界域校準
    kind: A,
    startTurn: (G, p) => {
      const t = G.round >= 2 ? G.mostCommonType(p) : undefined;
      if (t) randomMinion(G, p, (id) => isRace(id, t) && upTo(p)(id));
    },
  },
  {
    id: 'BG31_Anomaly_127', // 立即布陣
    kind: A,
    startGame: (G, p) => {
      const got = new Set<string>();
      for (let k = 0; k < 3; k++) {
        const id = randomMinion(G, p, (x) => tierOf(x) === 2 && !got.has(x));
        if (id) got.add(id);
      }
    },
  },
  { id: 'BG32_Anomaly_003', kind: A, startGame: (_G, p) => void ((p.c.lesserAt = 5), (p.c.greaterAt = 8)) }, // 洞悉未來
  {
    id: 'BG35_Anomaly_006', // 異象探險
    kind: A,
    startGame: (G, p) => {
      for (const t of [6, 4, 2]) G.discoverFor(p, (id) => tierOf(id) === t, `異象探險：發現一個旅店等級 ${t} 的手下（升到 ${t} 本時拿到）`, { reserve: t });
    },
  },
  { id: 'BG33_Anomaly_001', kind: A, needBuddies: true, onUpgrade: (_G, p) => void (p.buddy && (p.buddy.cost = Math.max(0, p.buddy.cost - 2))) }, // 召喚契約
  { id: 'BG36_Anomaly_002', kind: A }, // 黑暗贈禮！（按鈕在 game.ts 的 darkState）
  { id: 'BG31_Anomaly_123', kind: A, startGame: (G, p) => G.offerPowers(p, 3, '雙重宇宙：發現第二個英雄能力', true) }, // 雙重宇宙
  { id: 'BG34_Anomaly_800', kind: A, needTimewarp: true, goldenWarp: 'major' }, // 大型金棘草藥水
  { id: 'BG34_Anomaly_800t', kind: A, needTimewarp: true, goldenWarp: 'minor' }, // 小型金棘草藥水
  { id: 'BG34_Anomaly_801', kind: A, needTimewarp: true, chronumExtra: 1 }, // 時光晶幣恩澤
  { id: 'BG34_Anomaly_802', kind: A, needTimewarp: true, majorTwice: true }, // 大型甬道之門
  { id: 'BG34_Anomaly_804', kind: A, needTimewarp: true, chronumPool: true }, // 扭曲沙漏
  {
    id: 'BG34_Anomaly_809', // 預料之外的傳送門
    kind: A,
    startGame: (G, p) => void (p.c.warpAt = 4 + Math.floor(G.rand() * 6)),
    startTurn: (G, p) => void (G.round === cnt(p, 'warpAt') && G.offerTimewarp(p, G.round >= 7 ? 'major' : 'minor')),
  },
  { id: 'BG27_Anomaly_Prizes2', kind: A, startTurn: (G, p) => void (G.round % 4 === 0 && G.discoverPrize(p, Math.min(4, G.round / 4))) }, // 暗月馬戲團獎品
  { id: 'BG27_Anomaly_716', kind: A, onUpgrade: (G, p) => G.discoverPrize(p, Math.min(4, 1 + Math.floor((G.round - 1) / 3))) }, // 升級獎品
  { id: 'BG27_Anomaly_755', kind: A, prizeTriples: true }, // 馬戲團獎賞

  // ———————— 次級飾品（第二批）————————
  { id: 'BG30_MagicItem_416', kind: L, v: 5, onGain: (G, p) => craft(G, p, 'BG30_MagicItem_416'), startTurn: (G, p) => craft(G, p, 'BG30_MagicItem_416') }, // 古神的印記
  { id: 'BG30_MagicItem_422', kind: L, v: 5, onCast: (_G, p, _id, t) => void (t && (p.board.includes(t) || p.shop.includes(t)) && buff(t, 4, 4)) }, // 博學行者卷軸
  {
    id: 'BG30_MagicItem_425', // 艾澤拉斯模型球
    kind: L,
    v: 6,
    onGain: (G, p) => void (p.c['r:425'] = G.round),
    startTurn: (G, p) => {
      if ((G.round - cnt(p, 'r:425')) % 2 || G.round === cnt(p, 'r:425')) return;
      p.gold += 2;
      G.discoverFor(p, (id) => tierOf(id) === 6, '艾澤拉斯模型球：發現一個旅店等級 6 的手下');
    },
  },
  {
    id: 'BG30_MagicItem_427', // 猛虎雕刻
    kind: L,
    v: 5,
    onFriendDamaged: (c, side, m) => {
      const t = c.pick(alive(c, side).filter((x) => x !== m));
      if (t) c.perm(t, 3, 1);
    },
  },
  { id: 'BG30_MagicItem_429', kind: L, v: 5, onGain: (G, p) => craft(G, p, 'BG30_MagicItem_429'), startTurn: (G, p) => craft(G, p, 'BG30_MagicItem_429') }, // 魔血葫蘆
  { id: 'BG30_MagicItem_432', kind: L, v: 5, onGain: (G, p) => plain(G, p, 'BG26_888'), onVenomLost: (c, _side, m) => c.perm(m, 4, 4) }, // 噴吐者頭像
  {
    id: 'BG30_MagicItem_435', // 金卡轉化術補給
    kind: L,
    v: 6,
    onGain: (G, p) => void (p.c['r:435'] = G.round),
    endTurn: (G, p) => void ((G.round - cnt(p, 'r:435')) % 3 === 2 && spell(G, p, 'BG34_Treasure_955')),
  },
  { id: 'BG30_MagicItem_703', kind: L, v: 5, onGain: (G, p) => swapTrinket(G, p, 'BG30_MagicItem_703', 'lesser', 2), startTurn: (G, p) => swapTrinket(G, p, 'BG30_MagicItem_703', 'lesser', 2) }, // 神秘立方體
  {
    id: 'BG30_MagicItem_777', // 鵝頭像
    kind: L,
    v: 4,
    needTribe: 'BEAST',
    onGain: (G, p) => plain(G, p, 'BG29_801'),
    onSummonCombat: (c, side, m) => {
      if (m.id !== 'BG29_801t') return;
      c.counter(side, 'r:777', 1);
      if (c.cnt(side, 'r:777') % 3 === 0) c.give(side, 'BG30_104');
    },
  },
  { id: 'BG30_MagicItem_803', kind: L, v: 4, needTribe: 'MECHANICAL', onGain: (G, p) => plain(G, p, 'BG_BOT_606') }, // 炸炸機器人頭像（額外傷害在手下效果裡）
  { id: 'BG30_MagicItem_868', kind: L, v: 4, needTribe: 'DEMON', onGain: (G, p) => void (fromPool(G, p, 'BG26_174'), fromPool(G, p, 'BGS_004')) }, // 倒帶手頭像（攻擊力在 game.ts 處理）
  { id: 'BG30_MagicItem_869', kind: L, v: 4, onGain: (G, p) => plain(G, p, 'BG29_873') }, // 魔血頭像（加攻擊力在手下效果裡）
  { id: 'BG30_MagicItem_888', kind: L, v: 3 }, // 紀念品支架（在 gainRelic 處理）
  {
    id: 'BG30_MagicItem_891', // 旅遊兌換券
    kind: L,
    v: 6,
    onGain: (G, p) => void (p.c['r:891'] = G.round + 2),
    startTurn: (G, p) => void (G.round === cnt(p, 'r:891') && swapTrinket(G, p, 'BG30_MagicItem_891', 'greater', 4)),
  },
  { id: 'BG30_MagicItem_979', kind: L, v: 4, needTribe: 'ELEMENTAL', onPlay: (_G, p, m) => void (race(m, 'ELEMENTAL') && inc(p, 'spellDisc')) }, // 原始飼養箱
  { id: 'BG30_MagicItem_982', kind: L, v: 5, onBuy: (G, p, m) => void (hasBattlecry(m.id) && every(p, 'r:982', 2) && randomMinion(G, p, (id) => hasBattlecry(id) && upTo(p)(id))) }, // 薩滿念珠
  { id: 'BG30_MagicItem_994', kind: L, v: 6, onGain: (G, p) => yogg(G, p), startTurn: (G, p) => yogg(G, p) }, // 超尤味點心
  {
    id: 'BG32_MagicItem_170', // 法術扳手
    kind: L,
    v: 4,
    needTribe: 'MECHANICAL',
    onMagnetize: (G, p) => {
      const m = G.pick(p.board.filter((x) => race(x, 'MECHANICAL')));
      if (m) G.castRandom(p, 'BG36_624', m);
    },
  },
  { id: 'BG32_MagicItem_279', kind: L, v: 4, needTribe: 'QUILBOAR', onCast: (_G, _p, id, t) => void (id === GEM && t && !t.tmpKw.includes('shield') && t.tmpKw.push('shield')) }, // 硬牙豬貼紙
  {
    id: 'BG32_MagicItem_300', // 普崔希德貼紙
    kind: L,
    v: 5,
    needTribe: 'UNDEAD',
    onGain: (G, p) => void ((p.c['r:300'] = G.round), creation(G, p)),
    startTurn: (G, p) => void ((G.round - cnt(p, 'r:300')) % 2 === 0 && G.round > cnt(p, 'r:300') && creation(G, p)),
  },
  {
    id: 'BG32_MagicItem_361', // 可攜式工廠
    kind: L,
    v: 6,
    onGain: (G, p) => G.discoverFor(p, (id) => tierOf(id) === 4 && racesOf(id).length > 0, '可攜式工廠：發現一個有類型的旅店等級 4 手下', { remember: '361' }),
    startTurn: (G, p) => void (p.rmemo?.['361'] && plain(G, p, p.rmemo['361'])),
  },
  { id: 'BG32_MagicItem_417', kind: L, v: 5, needTribe: 'DRAGON', keepEnds: true }, // 塔瑞克苟莎貼紙
  {
    id: 'BG32_MagicItem_419', // 玉龍貼紙
    kind: L,
    v: 5,
    needTribe: 'DRAGON',
    soc: (c, side) => {
      const ds = alive(c, side).filter((m) => race(m, 'DRAGON') && !m.golden);
      if (!ds.length) return;
      const m = ds.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a));
      c.buff(m, bgCard(m.id).atk ?? 0, bgCard(m.id).hp ?? 0);
      m.golden = true;
    },
  },
  {
    id: 'BG32_MagicItem_804', // 無私頭像
    kind: L,
    v: 4,
    onGain: (G, p) => plain(G, p, 'BG_OG_221'),
    onPlay: (G, p, m) => {
      if (m.id !== 'BG_OG_221') return;
      const t = G.pick(p.board.filter((x) => x !== m && !x.shield));
      if (t) t.shield = true;
    },
  },
  {
    id: 'BG32_MagicItem_806', // 戰巡艦頭像
    kind: L,
    v: 6,
    needTribe: 'MECHANICAL',
    onGain: (G, p) => {
      const m = G.make('BG31_HERO_801pt');
      m.atk = 12;
      m.hp = 12;
      G.addMinion(p, m);
    },
    onRefresh: (G, p) => {
      const id = upgradeFor(p.tier, () => G.rand());
      if (id) p.shopSpells.push({ uid: G.nextUid(), id });
    },
  },
  { id: 'BG32_MagicItem_808', kind: L, v: 5, needTribe: 'QUILBOAR', onCast: (G, p) => void (every(p, 'r:808', 4) && p.board.forEach((m) => gemOn(G, p, m, 1))) }, // 血縛耳環
  {
    id: 'BG32_MagicItem_809', // 寶石樂捐
    kind: L,
    v: 4,
    needTribe: 'QUILBOAR',
    onSell: (G, p, m) => {
      if (turnInc(p, '809') !== 1 || !m.gems) return;
      for (const x of [...p.shop].sort((a, b) => tierOf(b.id) - tierOf(a.id)).slice(0, 3)) gemOn(G, p, x, m.gems);
    },
  },
  {
    id: 'BG32_MagicItem_820', // 浮躁頭像
    kind: L,
    v: 4,
    needTribe: 'DEMON',
    onGain: (G, p) => {
      const m = G.make('BG21_006');
      m.atk = 6;
      m.hp = 6;
      G.addMinion(p, m);
    },
  },
  { id: 'BG32_MagicItem_821', kind: L, v: 5, needTribe: 'DEMON', healthCost: (p, kind, id) => kind === 'minion' && isRace(id, 'DEMON') && !turnCnt(p, '821'), onBuy: (_G, p, m) => void (race(m, 'DEMON') && turnInc(p, '821')) }, // 朝聖小鬼貼紙
  { id: 'BG32_MagicItem_822', kind: L, v: 4, needTribe: 'DEMON', healthCost: (p, kind) => kind === 'spell' && !turnCnt(p, '822'), onBuySpell: (_G, p) => void turnInc(p, '822') }, // 市集貼紙
  { id: 'BG32_MagicItem_824', kind: L, v: 5, needTribe: 'DEMON', onGain: (G, p) => void (plain(G, p, 'BG29_140'), plain(G, p, 'BG29_140')) }, // 涉嫌小鬼頭像
  { id: 'BG32_MagicItem_830', kind: L, v: 4, onGain: (G, p) => plain(G, p, 'BG25_041') }, // 魔化元素頭像
  { id: 'BG32_MagicItem_832', kind: L, v: 5, needTribe: 'ELEMENTAL', endTurn: (G, p) => tornado(G, p, 1) }, // 風落頭像
  { id: 'BG32_MagicItem_892', kind: L, v: 4, needTribe: 'MURLOC', onGain: (G, p) => craft(G, p, 'BG32_MagicItem_892'), startTurn: (G, p) => craft(G, p, 'BG32_MagicItem_892') }, // 鮮豔泡泡
  {
    id: 'BG32_MagicItem_894', // 祝福頭像
    kind: L,
    v: 5,
    needTribe: 'MURLOC',
    onGain: (G, p) => spell(G, p, 'BG28_845'),
    startTurn: (G, p) => spell(G, p, 'BG28_845'),
    onCast: (G, p, id, t) => {
      if (id !== 'BG28_845' || !t) return;
      const [a, h] = G.spellExtra(p);
      for (const m of minionsInHand(p)) if (racesOf(m).some((r) => racesOf(t).includes(r))) buff(m, 2 + a, 1 + h);
    },
  },
  { id: 'BG32_MagicItem_932', kind: L, v: 4, needTribe: 'NAGA', soc: (c, side) => alive(c, side).forEach((m) => race(m, 'NAGA') && c.buff(m, 0, 1 + Math.floor(c.cnt(side, 'spells') / 4))) }, // 瓦許伊爾海葵
  { id: 'BG32_MagicItem_950', kind: L, v: 5, needTribe: 'PIRATE', onGain: (G, p) => plain(G, p, 'BG31_822'), startTurn: (G, p) => plain(G, p, 'BG31_822') }, // 堅毅頭像
  { id: 'BG32_MagicItem_953', kind: L, v: 4, needTribe: 'PIRATE', onGain: (G, p) => void (plain(G, p, 'BGS_066'), fromPool(G, p, 'BG32_236')) }, // 掘金工頭像
  {
    id: 'BG32_MagicItem_957', // 騙徒頭像
    kind: L,
    v: 5,
    needTribe: 'PIRATE',
    onGain: (G, p) => plain(G, p, 'BG31_826'),
    minionCost: (p, m) => (m && race(m, 'PIRATE') && !turnCnt(p, '957') ? 0 : undefined),
    onBuy: (_G, p, m) => void (race(m, 'PIRATE') && turnInc(p, '957')),
  },
  {
    id: 'BG32_MagicItem_960', // 編織陽鰓魚人
    kind: L,
    v: 5,
    needTribe: 'MURLOC',
    soc: (c, side) => {
      const h = c.hand(side);
      if (!h.length) return;
      const m = h.reduce((a, b) => (b.hp > a.hp ? b : a));
      m.atk += 4;
      m.hp += 4;
      c.summonLater(side, Object.assign(copyOf(c, m), { temp: true }));
    },
  },
  { id: 'BG35_MagicItem_151', kind: L, v: 4, needTribe: 'DEMON', onGain: (G, p) => plain(G, p, 'BG35_151'), onShopMinion: (_G, _p, m) => void (m.id === 'BG35_150t' && buff(m, 4, 4)) }, // 褻瀆者頭像
  {
    id: 'BG35_MagicItem_300', // 銅線圈
    kind: L,
    v: 5,
    needTribe: 'MECHANICAL',
    onMagnetize: (_G, p, host) => {
      buff(host, 1 + cnt(p, 'r:300'), 1 + cnt(p, 'r:300'));
      inc(p, 'r:300');
    },
  },
  {
    id: 'BG35_MagicItem_305', // 海螺頭像
    kind: L,
    v: 5,
    needTribe: 'MURLOC',
    onGain: (G, p) => void ((p.c['r:305'] = G.round), spell(G, p, 'BG28_601')),
    startTurn: (G, p) => void ((G.round - cnt(p, 'r:305')) % 2 === 0 && G.round > cnt(p, 'r:305') && spell(G, p, 'BG28_601')),
  },
  { id: 'BG35_MagicItem_306', kind: L, v: 4, needTribe: 'UNDEAD', onGain: (G, p) => craft(G, p, 'BG35_MagicItem_306'), startTurn: (G, p) => craft(G, p, 'BG35_MagicItem_306') }, // 閻獄之主貼紙
  {
    id: 'BG35_MagicItem_430', // 廢料鐵匠頭像
    kind: L,
    v: 4,
    needTribe: 'QUILBOAR',
    onGain: (G, p) => plain(G, p, 'BG24_707'),
    onFriendDeath: (c, side, d) => {
      if (!d.taunt) return;
      const [a, h] = [1 + c.cnt(side, 'gemA'), 1 + c.cnt(side, 'gemH')];
      for (const m of alive(c, side)) if (m.id === 'BG24_707') c.perm(m, a, h);
    },
  },
  {
    id: 'BG35_MagicItem_702', // 劍龍頭像
    kind: L,
    v: 5,
    needTribe: 'BEAST',
    onGain: (G, p) => plain(G, p, 'BG33_840'),
    soc: (c, side) => alive(c, side).filter((m) => race(m, 'BEAST')).slice(0, 2).forEach((m) => c.giveKw(m, 'shield')),
  },
  { id: 'BG35_MagicItem_803', kind: L, v: 5, needBuddyHero: true, onGain: (G, p) => buddyOf(G, p, false) }, // 麥斯威爾貼紙
  {
    id: 'BG35_MagicItem_817', // 鏡片盒
    kind: L,
    v: 5,
    onGain: (G, p) => void ((p.c['r:817'] = G.round), spell(G, p, LENS)),
    startTurn: (G, p) => void ((G.round - cnt(p, 'r:817')) % 2 === 0 && G.round > cnt(p, 'r:817') && spell(G, p, LENS)),
  },
  {
    id: 'BG35_MagicItem_842', // 終焉時刻之蛋頭像
    kind: L,
    v: 5,
    needTribe: 'DRAGON',
    onGain: (G, p) => void ((p.c['r:842'] = G.round), plain(G, p, 'BG34_639')),
    startTurn: (G, p) => void ((G.round - cnt(p, 'r:842')) % 2 === 0 && G.round > cnt(p, 'r:842') && plain(G, p, 'BG34_639')),
  },
  { id: 'BG35_MagicItem_850', kind: L, v: 5, needTribe: 'ELEMENTAL', onGain: (G, p) => G.castRandom(p, 'BG34_444'), startTurn: (G, p) => G.castRandom(p, 'BG34_444') }, // 口袋颶風
  { id: 'BG35_MagicItem_870', kind: L, v: 4, needTribe: 'BEAST', onGain: (G, p) => plain(G, p, 'BG34_Giant_031') }, // 跳躍蛙頭像
  { id: 'BG35_MagicItem_872', kind: L, v: 4, needTribe: 'BEAST', onGain: (G, p) => craft(G, p, 'BG35_MagicItem_872'), startTurn: (G, p) => craft(G, p, 'BG35_MagicItem_872') }, // 爬蛇法杖
  {
    id: 'BG35_MagicItem_920', // 泡泡皇冠
    kind: L,
    v: 4,
    needTribe: 'NAGA',
    onGain: (_G, p) => void (p.c['r:920'] = cnt(p, 'spells')),
    onCast: (_G, p) => void (cnt(p, 'spells') - cnt(p, 'r:920') === 14 && (inc(p, 'tsA', 4), inc(p, 'tsH', 4))),
    status: (p) => `還要施放 ${Math.max(0, 14 - (cnt(p, 'spells') - cnt(p, 'r:920')))} 張法術`,
  },
  { id: 'BG36_MagicItem_200', kind: L, v: 4, needTribe: 'BEAST', onAttack: (c, side, m) => void (SPEC.get(m.id)?.rally && c.counter(side, 'freeRefC', 1)) }, // 放牧號角
  {
    id: 'BG36_MagicItem_211', // 愛心墜盒
    kind: L,
    v: 5,
    onCast: (G, p, id, t) => {
      if (!t || !p.board.includes(t) || cnt(p, '~locket')) return;
      const other = G.pick(p.board.filter((m) => m !== t));
      if (!other || !SPELL_SPEC.get(id)?.target) return;
      p.c['~locket'] = 1;
      G.castRandom(p, id, other);
      p.c['~locket'] = 0;
    },
  },
  {
    id: 'BG36_MagicItem_301', // 帶鎖箱頭像
    kind: L,
    v: 5,
    needTribe: 'PIRATE',
    onGain: (G, p) => G.recruit(p).lockbox(),
    startTurn: (G, p) => {
      G.recruit(p).lockbox();
      G.recruit(p).lockbox();
    },
  },
  { id: 'BG36_MagicItem_305', kind: L, v: 4, needTribe: 'NAGA', onGain: (_G, p) => mark(p, 'BG36_MagicItem_305', 'spells'), onCast: (G, p) => evolveTrinket(G, p, 'BG36_MagicItem_305', 'spells', 18, 'NAGA') }, // 轉化符文
  {
    id: 'BG36_MagicItem_402', // 心智割裂者頭像
    kind: L,
    v: 4,
    onGain: (G, p) => plain(G, p, 'BG36_108'),
    onCast: (_G, p, id) => {
      if (!isTavernSpell(id)) return;
      for (const m of p.board) {
        if (m.id !== 'BG36_108') continue;
        const i = p.board.indexOf(m);
        for (const x of [p.board[i - 1], p.board[i + 1]]) buff(x, 1, 2);
      }
    },
  },
  { id: 'BG36_MagicItem_407', kind: L, v: 4, needTribe: 'DRAGON', onGain: (_G, p) => mark(p, 'BG36_MagicItem_407', 'q:attack'), startTurn: (G, p) => evolveTrinket(G, p, 'BG36_MagicItem_407', 'q:attack', 13, 'DRAGON') }, // 龍頭法杖
  { id: 'BG36_MagicItem_408', kind: L, v: 4, needTribe: 'PIRATE', onGain: (_G, p) => mark(p, 'BG36_MagicItem_408', 'spentTotal'), onSpend: (G, p) => evolveTrinket(G, p, 'BG36_MagicItem_408', 'spentTotal', 50, 'PIRATE') }, // 軍需官的鉤子
  { id: 'BG36_MagicItem_409', kind: L, v: 4, needTribe: 'QUILBOAR', onGain: (_G, p) => mark(p, 'BG36_MagicItem_409', 'q:gems'), onCast: (G, p, id) => void (id === GEM && (inc(p, 'q:gems'), evolveTrinket(G, p, 'BG36_MagicItem_409', 'q:gems', 10, 'QUILBOAR'))) }, // 紅寶石獠牙
  { id: 'BG36_MagicItem_410', kind: L, v: 4, needTribe: 'UNDEAD', onGain: (_G, p) => mark(p, 'BG36_MagicItem_410', 'q:summon'), startTurn: (G, p) => evolveTrinket(G, p, 'BG36_MagicItem_410', 'q:summon', 25, 'UNDEAD') }, // 靈魂電池
  { id: 'BG36_MagicItem_423', kind: L, v: 5, needTribe: 'MECHANICAL', onGain: (G, p) => volumizer(G, p, 1), startTurn: (G, p) => volumizer(G, p, 1) }, // 音量機兵頭像
  {
    id: 'BG36_MagicItem_801', // 吞噬之爪
    kind: L,
    v: 4,
    needTribe: 'DEMON',
    onConsume: (_G, _p, eater, food) => {
      if (!race(eater, 'DEMON')) return;
      buff(eater, 5, 5);
      for (const k of BONUS_KEYWORDS) if (food[k]) eater[k] = true;
    },
  },
  { id: 'BG36_MagicItem_810', kind: L, v: 5, needTribe: 'MECHANICAL', endTurn: (G, p) => satellite(G, p, 4) }, // 感應圓鋸機
  {
    id: 'BG36_MagicItem_812', // 緊急齒輪鋸刃
    kind: L,
    v: 5,
    needTribe: 'MECHANICAL',
    endTurn: (G, p) => {
      const m = p.board.find((x) => race(x, 'MECHANICAL'));
      if (m) G.castRandom(p, 'BG36_624', m);
    },
  },
  {
    id: 'BG36_MagicItem_820', // 飄忽頭像
    kind: L,
    v: 4,
    needTribe: 'MURLOC',
    onGain: (G, p) => fromPool(G, p, 'BG32_330'),
    onCast: (_G, p, id) => {
      if (!isTavernSpell(id)) return;
      for (const m of [...p.board, ...minionsInHand(p)]) if (m.id === 'BG32_330') buff(m, 3, 3);
    },
  },

  // ———————— 強效飾品（第二批）————————
  {
    id: 'BG30_MagicItem_402', // 列車長頭像
    kind: GR,
    v: 5,
    needTribe: 'QUILBOAR',
    onGain: (G, p) => plain(G, p, 'BG28_585'),
    onDiscard: (G, p) => p.board.forEach((m) => gemOn(G, p, m, 1)),
  },
  { id: 'BG30_MagicItem_410t2', kind: GR, v: 5, needTribe: 'QUILBOAR', avenge: [4, (c, side) => void (c.counter(side, 'gemA', 1), c.counter(side, 'gemH', 1))] }, // 書寫套組
  { id: 'BG30_MagicItem_414t', kind: GR, v: 6, onBuy: (G, p) => some(G, p.board, 2).forEach((m) => buff(m, 4, 4)), onBuySpell: (G, p) => some(G, p.board, 2).forEach((m) => buff(m, 4, 4)) }, // 科多獸皮包
  {
    id: 'BG30_MagicItem_420t', // 麥迪文之書
    kind: GR,
    v: 7,
    onGain: (G, p) => [0, 1].forEach(() => G.discoverSpell(p, upTo(p), '麥迪文之書：發現一張酒館法術')),
    startTurn: (G, p) => [0, 1].forEach(() => G.discoverSpell(p, upTo(p), '麥迪文之書：發現一張酒館法術')),
  },
  { id: 'BG30_MagicItem_422t', kind: GR, v: 7, onCast: (_G, p, _id, t) => void (t && (p.board.includes(t) || p.shop.includes(t)) && buff(t, 10, 10)) }, // 博學行者卷軸
  {
    id: 'BG30_MagicItem_427t', // 猛虎雕刻
    kind: GR,
    v: 7,
    onFriendDamaged: (c, side, m) => {
      const t = c.pick(alive(c, side).filter((x) => x !== m));
      if (t) c.perm(t, 6, 2);
    },
  },
  { id: 'BG30_MagicItem_432t', kind: GR, v: 6, onGain: (G, p) => plain(G, p, 'BG26_888'), onVenomLost: (c, _side, m) => c.perm(m, 14, 14) }, // 噴吐者頭像
  {
    id: 'BG30_MagicItem_433t', // 聯盟鑰匙圈
    kind: GR,
    v: 6,
    onFriendDeath: (c, side, dead) => {
      if (!once(c, side, 'r433t', 1)) return;
      const b = [...alive(c, side)];
      for (let k = 0; k < 2 && b.length; k++) c.buff(b.splice(Math.floor(c.rand() * b.length), 1)[0], dead.atk, dead.maxHp ?? 1);
    },
  },
  { id: 'BG30_MagicItem_438t', kind: GR, v: 6, onOverflow: (c, side) => alive(c, side).forEach((m) => c.buff(m, 5, 0)) }, // 王之杯
  {
    id: 'BG30_MagicItem_440', // 爆爆控制器
    kind: GR,
    v: 7,
    needTribe: 'MECHANICAL',
    onFriendDeath: (c, side, d) => void (race(d, 'MECHANICAL') && once(c, side, 'r440', 1) && c.summonLater(side, copyOf(c, d))),
  },
  {
    id: 'BG30_MagicItem_442', // 鮮血魔像貼紙
    kind: GR,
    v: 6,
    needTribe: 'QUILBOAR',
    onFriendDeath: (c, side, d) => {
      if (!race(d, 'QUILBOAR') || !d.gems) return;
      const g = c.make('BG30_MagicItem_442t');
      g.atk = d.gems * (1 + c.cnt(side, 'gemA'));
      g.hp = d.gems * (1 + c.cnt(side, 'gemH'));
      c.summonLater(side, g);
    },
  },
  { id: 'BG30_MagicItem_543', kind: GR, v: 6, onGain: (G, p) => spell(G, p, 'EBG_Spell_032'), startTurn: (G, p) => spell(G, p, 'EBG_Spell_032') }, // 吞噬者貼紙
  { id: 'BG30_MagicItem_544t', kind: GR, v: 6, needTribe: 'ELEMENTAL', onPlay: (G, p, m) => void (race(m, 'ELEMENTAL') && G.recruit(p).tavernBuff(5, 5, 'ELEMENTAL')) }, // 糯米貼紙
  {
    id: 'BG30_MagicItem_546', // 一罐寶石
    kind: GR,
    v: 6,
    needTribe: 'QUILBOAR',
    onAttack: (c, side) => {
      c.counter(side, '~r546', 1);
      if (c.cnt(side, '~r546') !== 2) return;
      for (const m of alive(c, side)) if (race(m, 'QUILBOAR')) c.buff(m, 1 + c.cnt(side, 'gemA'), 1 + c.cnt(side, 'gemH'));
    },
  },
  { id: 'BG30_MagicItem_547t', kind: GR, v: 6, needTribe: 'UNDEAD', onCast: (_G, p, id) => void (isTavernSpell(id) && inc(p, 'undeadA', 2)) }, // 舒適棺材
  {
    id: 'BG30_MagicItem_701', // 薩格拉斯之眼
    kind: GR,
    v: 6,
    needTribe: 'DEMON',
    onGain: (_G, p) => void (p.c['r:701'] = cnt(p, 'cards')),
    healthCost: (p) => (cnt(p, 'cards') - cnt(p, 'r:701')) % 4 === 3,
  },
  {
    id: 'BG30_MagicItem_702', // 原始魚人頭像
    kind: GR,
    v: 6,
    needTribe: 'MURLOC',
    onGain: (G, p) => fromPool(G, p, 'BGS_020'),
    onDiscover: (G, p, id) => void (bgCard(id).type === 'MINION' && randomSpell(G, p)),
  },
  {
    id: 'BG30_MagicItem_709t', // 電磁裝置
    kind: GR,
    v: 6,
    needTribe: 'MECHANICAL',
    onGain: (G, p) => [0, 1].forEach(() => G.discoverFor(p, (id) => isMagnetic(id) && upTo(p)(id), '電磁裝置：發現一個磁力機械')),
    onMagnetize: (_G, _p, host) => buff(host, 4, 4),
  },
  { id: 'BG30_MagicItem_714', kind: GR, v: 6, needTribe: 'NAGA', onGain: (G, p) => craft(G, p, 'BG30_MagicItem_714'), startTurn: (G, p) => craft(G, p, 'BG30_MagicItem_714') }, // 寶貴珍珠
  { id: 'BG30_MagicItem_821t2', kind: GR, v: 6, soc: (c, side) => void c.summon(side, c.make('TB_BaconShop_HP_105t', true)) }, // 小魚貼紙
  {
    id: 'BG30_MagicItem_822t2', // 雙子天燈
    kind: GR,
    v: 7,
    onSummonCombat: (c, side, m) => {
      if (!once(c, side, 'r822t', 1)) return;
      c.summonLater(side, copyOf(c, m));
      c.summonLater(side, copyOf(c, m));
    },
  },
  { id: 'BG30_MagicItem_843t', kind: GR, v: 7, onGain: (_G, p) => void (inc(p, 'lowA', 7), inc(p, 'lowH', 5)) }, // 部落鑰匙圈
  { id: 'BG30_MagicItem_876', kind: GR, v: 5, onGain: (G, p) => plain(G, p, 'BG_EX1_564') }, // 操縱者頭像
  {
    id: 'BG30_MagicItem_879t', // 達拉然乳酪輪
    kind: GR,
    v: 6,
    shopBuff: (p) => {
      const n = 2 * (1 + Math.floor(cnt(p, 'r:879t') / 4));
      return [n, n];
    },
    onReroll: (_G, p) => void inc(p, 'r:879t'),
  },
  { id: 'BG30_MagicItem_880t', kind: GR, v: 8, onGain: (_G, p) => void (inc(p, 'allA', 8), inc(p, 'allH', 5)) }, // 野性咒符
  {
    id: 'BG30_MagicItem_900t', // 滑翔龍翼
    kind: GR,
    v: 6,
    needTribe: 'DRAGON',
    onPlay: (G, p) => buff(G.pick(p.board.filter((m) => race(m, 'DRAGON'))), 6, 4),
    onCast: (G, p) => buff(G.pick(p.board.filter((m) => race(m, 'DRAGON'))), 6, 4),
  },
  { id: 'BG30_MagicItem_914t', kind: GR, v: 6, needTribe: 'MURLOC', onPlay: (_G, p) => buff(minionsInHand(p)[0], 6, 6) }, // 魚人語片語手冊
  {
    id: 'BG30_MagicItem_916', // 夢之精華
    kind: GR,
    v: 6,
    onGain: (G, p) => void (spell(G, p, 'BG28_883'), spell(G, p, 'BG28_883')),
    startTurn: (G, p) => spell(G, p, 'BG28_883'),
  },
  { id: 'BG30_MagicItem_918', kind: GR, v: 6, needTribe: 'DRAGON', onGain: (G, p) => plain(G, p, 'BG21_014'), firstSocExtra: true }, // 晉升頭像
  { id: 'BG30_MagicItem_919', kind: GR, v: 5, needTribe: 'NAGA', onPlay: (G, p, m) => void (race(m, 'NAGA') && every(p, 'r:919', 2) && spell(G, p, G.pick([...SPELLCRAFT_SPELLS])!)) }, // 納沙塔爾明信片
  {
    id: 'BG30_MagicItem_920', // 惡鱗壽司卷
    kind: GR,
    v: 6,
    needTribe: 'NAGA',
    onGain: (G, p) => spell(G, p, 'BG28_606'),
    spellTimes: (_G, p, id) => (SPELLCRAFT_SPELLS.has(id) && turnInc(p, '920') <= 2 ? 1 : 0),
  },
  { id: 'BG30_MagicItem_924t', kind: GR, v: 6, needTribe: 'PIRATE', onSpend: (G, p) => some(G, pirates(p), 2).forEach((m) => buff(m, 6, 6)) }, // 藏寶海灣精釀
  { id: 'BG30_MagicItem_943', kind: GR, v: 6, needTribe: 'QUILBOAR', onGain: (G, p) => fromPool(G, p, 'BG30_121'), onCast: (_G, p, id, t) => void (id === GEM && t && p.board.includes(t) && buff(t, 6, 6)) }, // 勘測員頭像
  { id: 'BG30_MagicItem_944', kind: GR, v: 6, onGain: (G, p) => plain(G, p, 'BG28_551') }, // 救贖者頭像（加成在手下效果裡）
  { id: 'BG30_MagicItem_970t', kind: GR, v: 8, soc: (c, side) => alive(c, side).forEach((m) => c.buff(m, 6, 6)) }, // 英勇勳章
  { id: 'BG30_MagicItem_984t', kind: GR, v: 7, needTribe: 'MECHANICAL', endTurn: (_G, p) => p.board.forEach((m) => m.shield && buff(m, 7, 0)) }, // 充能法杖
  {
    id: 'BG30_MagicItem_988t', // 巨豬貼紙
    kind: GR,
    v: 8,
    needTribe: 'QUILBOAR',
    onGain: (G, p) => {
      for (let k = 0; k < 5; k++) spell(G, p, GEM);
      inc(p, 'gemA', 3);
      inc(p, 'gemH', 3);
    },
  },
  { id: 'BG30_MagicItem_989t', kind: GR, v: 7, needTribe: 'UNDEAD', onGain: (_G, p) => void inc(p, 'undeadA', 20) }, // 匠心之甕
  { id: 'BG30_MagicItem_991', kind: GR, v: 6, needTribe: 'DEMON', shopFull: true, onGain: (G, p) => plain(G, p, 'BG21_005') }, // 魔化蝙蝠頭像
  {
    id: 'BG30_MagicItem_992t', // 達納蘇斯派
    kind: GR,
    v: 6,
    shopBuff: (p) => [2 * turnCnt(p, '992t'), 2 * turnCnt(p, '992t')],
    onSell: (_G, p) => {
      turnInc(p, '992t');
      p.shop.forEach((m) => buff(m, 2, 2));
    },
  },
  { id: 'BG32_MagicItem_231t', kind: GR, v: 6, needTribe: 'PIRATE', endTurn: (_G, p) => p.board.forEach((m) => m.golden && buff(m, 10, 10)) }, // 鑲金錨
  { id: 'BG32_MagicItem_270t', kind: GR, v: 7, avenge: [4, (c, side) => void (c.counter(side, 'tsA', 1), c.counter(side, 'tsH', 1))] }, // 惡毒秘典
  { id: 'BG32_MagicItem_274', kind: GR, v: 6, needTribe: 'QUILBOAR', onGain: (G, p) => plain(G, p, 'BG26_157') }, // 剛鬃作曲家頭像（效果在手下裡）
  {
    id: 'BG32_MagicItem_284', // 阿葛金貼紙
    kind: GR,
    v: 7,
    needTribe: 'QUILBOAR',
    endTurn: (G, p) => {
      for (const t of TRIBES) {
        const m = G.pick(p.board.filter((x) => race(x, t)));
        if (m) gemOn(G, p, m, 7);
      }
    },
  },
  {
    id: 'BG32_MagicItem_301', // 貝斯魚人頭像
    kind: GR,
    v: 5,
    needTribe: 'MURLOC',
    onGain: (G, p) => plain(G, p, 'BG26_350'),
    onSummonCombat: (c, _side, m) => void (race(m, 'MURLOC') && c.giveKw(m, 'shield')),
  },
  {
    id: 'BG32_MagicItem_361t', // 可攜式工廠
    kind: GR,
    v: 7,
    onGain: (G, p) => G.discoverFor(p, (id) => tierOf(id) === 5 && racesOf(id).length > 0, '可攜式工廠：發現一個有類型的旅店等級 5 手下', { remember: '361t' }),
    startTurn: (G, p) => void (p.rmemo?.['361t'] && plain(G, p, p.rmemo['361t'])),
  },
  { id: 'BG32_MagicItem_362t', kind: GR, v: 8, onGain: (G, p) => [0, 1].forEach(() => G.discoverFor(p, (id) => tierOf(id) === 6, '旅店老闆的爐火：發現一個旅店等級 6 的手下（變成 30/30）', { stats: [30, 30] })) }, // 旅店老闆的爐火
  {
    id: 'BG32_MagicItem_366', // 引路蠟燭
    kind: GR,
    v: 6,
    refreshTier: (p) => (p.c['~rr'] && turnCnt(p, '366') < 2 ? Math.min(6, p.tier + 1) : undefined),
    onReroll: (_G, p) => void turnInc(p, '366'),
  },
  {
    id: 'BG32_MagicItem_801t', // 森林之心
    kind: GR,
    v: 7,
    onGain: (_G, p) => void (inc(p, 'tsA'), inc(p, 'tsH')),
    onCast: (_G, p, id) => void (isTavernSpell(id) && every(p, 'r:801t', 6) && (inc(p, 'tsA'), inc(p, 'tsH'))),
  },
  { id: 'BG32_MagicItem_808t', kind: GR, v: 6, needTribe: 'QUILBOAR', onCast: (G, p) => void (every(p, 'r:808t', 5) && p.board.forEach((m) => gemOn(G, p, m, 2))) }, // 血縛耳環
  { id: 'BG32_MagicItem_832t', kind: GR, v: 6, needTribe: 'ELEMENTAL', endTurn: (G, p) => tornado(G, p, 2) }, // 風落頭像
  {
    id: 'BG32_MagicItem_860t', // 甲蟲樂團
    kind: GR,
    v: 6,
    needTribe: 'BEAST',
    avenge: [
      7,
      (c, side) => {
        for (let k = 0; k < 2; k++) {
          const b = c.summon(side, c.make(BEETLE));
          if (b) c.giveKw(b, 'taunt');
        }
      },
    ],
  },
  {
    id: 'BG32_MagicItem_862t', // 穢邪聖所
    kind: GR,
    v: 7,
    onDeathrattle: (c, side) => {
      const b = alive(c, side);
      if (b.length) c.perm(b[b.length - 1], 6, 4);
    },
  },
  { id: 'BG32_MagicItem_864t', kind: GR, v: 7, avenge: [2, (c, side) => alive(c, side).forEach((m) => c.buff(m, 4, 4))] }, // 雀鳥餵食者
  {
    id: 'BG32_MagicItem_902', // 希爾雷克雕像
    kind: GR,
    v: 5,
    needTribe: 'DEMON',
    onConsume: (G, p) => void (every(p, 'r:902', 2) && randomSpell(G, p)),
  },
  {
    id: 'BG32_MagicItem_907', // 絲瑟拉貼紙
    kind: GR,
    v: 6,
    needTribe: 'DEMON',
    onFriendDeath: (c, side, d) => {
      if (race(d, 'DEMON') && !c.cnt(side, '~r907')) {
        c.counter(side, '~r907', 1);
        c.counter(side, '~r907u', d.uid);
        firstDemon.set(c, copyOf(c, d));
      }
      if (alive(c, side).length || !once(c, side, 'r907', 1)) return;
      const m = firstDemon.get(c);
      if (m) c.summonLater(side, m);
    },
  },
  {
    id: 'BG32_MagicItem_925', // 駭客魚人頭像
    kind: GR,
    v: 6,
    needTribe: 'MURLOC',
    onGain: (G, p) => fromPool(G, p, 'BG31_148'),
    endTurn: (G, p) => p.board.filter((m) => m.id === 'BG31_148').forEach((m) => G.recruit(p).battlecry(m)),
  },
  { id: 'BG32_MagicItem_926', kind: GR, v: 6, needTribe: 'MURLOC', onGain: (G, p) => plain(G, p, 'BG27_513') }, // 莫哥頭像
  { id: 'BG32_MagicItem_998', kind: GR, v: 6, needTribe: 'ELEMENTAL', onGain: (G, p) => plain(G, p, 'BG31_360') }, // 巨獸頭像
  { id: 'BG35_MagicItem_151t', kind: GR, v: 6, needTribe: 'DEMON', onGain: (G, p) => plain(G, p, 'BG35_151'), onShopMinion: (_G, _p, m) => void (m.id === 'BG35_150t' && buff(m, 15, 15)) }, // 褻瀆者頭像
  {
    id: 'BG35_MagicItem_154', // 厄祖獸貼紙
    kind: GR,
    v: 6,
    needTribe: 'DEMON',
    onPlay: (G, p, m) => {
      if (!race(m, 'DEMON')) return;
      const d = G.pick(p.board.filter((x) => x !== m && race(x, 'DEMON')));
      const f = G.pick(p.shop);
      if (d && f) G.recruit(p).consume(d, f);
    },
  },
  { id: 'BG35_MagicItem_155', kind: GR, v: 5, needTribe: 'DEMON', onHeroHurt: (_G, p) => void turnInc(p, '155'), spellExtra: (p) => [turnCnt(p, '155'), turnCnt(p, '155')] }, // 魔灼帳本
  {
    id: 'BG35_MagicItem_300t', // 銅線圈
    kind: GR,
    v: 6,
    needTribe: 'MECHANICAL',
    onMagnetize: (_G, p, host) => {
      buff(host, 2 + 2 * cnt(p, 'r:300t'), 2 + 2 * cnt(p, 'r:300t'));
      inc(p, 'r:300t');
    },
  },
  {
    id: 'BG35_MagicItem_309', // 厄格貼紙
    kind: GR,
    v: 6,
    needTribe: 'MURLOC',
    onGain: (G, p) => plain(G, p, G.pick(['BG35_140', 'BG35_141'])!),
    startTurn: (G, p) => plain(G, p, G.pick(['BG35_140', 'BG35_141'])!),
  },
  {
    id: 'BG35_MagicItem_432', // 鮮血護符
    kind: GR,
    v: 6,
    needTribe: 'QUILBOAR',
    onDeathrattle: (c, side) => {
      const b = [...alive(c, side)];
      for (let k = 0; k < 3 && b.length; k++) c.perm(b.splice(Math.floor(c.rand() * b.length), 1)[0], 1 + c.cnt(side, 'gemA'), 1 + c.cnt(side, 'gemH'));
    },
  },
  { id: 'BG35_MagicItem_435', kind: GR, v: 6, needTribe: 'QUILBOAR', onCast: (G, p, id) => void (id === GEM && p.board.forEach((m) => m.shield && gemOn(G, p, m, 1))) }, // 血縛戒指
  {
    id: 'BG35_MagicItem_700', // 野羽撣子
    kind: GR,
    v: 5,
    needTribe: 'BEAST',
    onSummonCombat: (c, side, m) => {
      if (!race(m, 'BEAST')) return;
      c.counter(side, 'r:700', 1);
      if (c.cnt(side, 'r:700') % 6 === 0) c.giveRandom(side, (id) => isRace(id, 'BEAST') && tierOf(id) <= c.heroTier(side));
    },
    onPlay: (G, p, m) => void (race(m, 'BEAST') && every(p, 'r:700', 6) && randomMinion(G, p, (id) => isRace(id, 'BEAST') && upTo(p)(id))),
  },
  {
    id: 'BG35_MagicItem_701', // 尖牙足環
    kind: GR,
    v: 6,
    needTribe: 'BEAST',
    soc: (c, side) => alive(c, side).forEach((m) => race(m, 'BEAST') && c.buff(m, 1 + c.cnt(side, 'r:701'), 1 + c.cnt(side, 'r:701'))),
    onSummonCombat: (c, side, m) => void (race(m, 'BEAST') && c.counter(side, 'r:701', 1)),
    onPlay: (_G, p, m) => void (race(m, 'BEAST') && inc(p, 'r:701')),
  },
  {
    id: 'BG35_MagicItem_712', // 私掠者頭像
    kind: GR,
    v: 6,
    needTribe: 'PIRATE',
    onGain: (G, p) => {
      fromPool(G, p, 'BG33_825');
      some(G, BOUNTIES.filter((id) => G.spellInLobby(id)), 2).forEach((id) => spell(G, p, id));
    },
    startTurn: (G, p) => some(G, BOUNTIES.filter((id) => G.spellInLobby(id)), 2).forEach((id) => spell(G, p, id)),
  },
  { id: 'BG35_MagicItem_731', kind: GR, v: 6, needTribe: 'UNDEAD', onFriendReborn: (c, side, m) => void (race(m, 'UNDEAD') && once(c, side, 'r731', 3) && c.giveKw(m, 'reborn')) }, // 死觸蘋果
  { id: 'BG35_MagicItem_733', kind: GR, v: 6, needTribe: 'UNDEAD', onGain: (G, p) => craft(G, p, 'BG35_MagicItem_733'), startTurn: (G, p) => craft(G, p, 'BG35_MagicItem_733') }, // 閻獄之主貼紙
  { id: 'BG35_MagicItem_741', kind: GR, v: 7, needTribe: 'MECHANICAL', onGain: (G, p) => fromPool(G, p, 'BG26_149') }, // 節奏口技手頭像
  {
    id: 'BG35_MagicItem_742', // 手風琴機器人頭像
    kind: GR,
    v: 6,
    needTribe: 'MECHANICAL',
    endTurn: (G, p) => {
      const ms = p.board.filter((m) => race(m, 'MECHANICAL'));
      for (const m of ms.length > 1 ? [ms[0], ms[ms.length - 1]] : ms) G.recruit(p).magnetize(m, 'BG26_147');
    },
  },
  {
    id: 'BG35_MagicItem_743', // 電極吸引器
    kind: GR,
    v: 6,
    needTribe: 'MECHANICAL',
    minionCost: (_p, m) => (m && isMagnetic(m.id) && race(m, 'MECHANICAL') ? 2 : undefined),
    onRefresh: (G, p) => {
      const id = G.draw((x) => isMagnetic(x) && isRace(x, 'MECHANICAL') && tierOf(x) <= p.tier);
      if (id) p.shop.push(G.shopMinion(p, id));
    },
  },
  {
    id: 'BG35_MagicItem_750', // 魔術魚貼紙
    kind: GR,
    v: 5,
    needTribe: 'MURLOC',
    onBuySpell: (G, p, id) => {
      if (turnInc(p, '750') > 2) return;
      const m = G.make('BG33_890t');
      m.memo = id;
      G.addMinion(p, m);
    },
  },
  {
    id: 'BG35_MagicItem_752', // 小瞎眼貼紙
    kind: GR,
    v: 6,
    needTribe: 'MURLOC',
    endTurn: (G, p) => [...new Set([left(p), right(p)])].forEach((m) => m && hasBattlecry(m.id) && G.recruit(p).battlecry(m)),
  },
  {
    id: 'BG35_MagicItem_753', // 莫奇貼紙
    kind: GR,
    v: 6,
    needTribe: 'MURLOC',
    endTurn: (_G, p) => {
      const n = Math.floor(cnt(p, 'bcTotal') / 2);
      p.board.slice(0, 2).forEach((m) => buff(m, 1 + n, 2 + n));
    },
  },
  {
    id: 'BG35_MagicItem_754', // 戲魚人貼紙
    kind: GR,
    v: 6,
    needTribe: 'MURLOC',
    soc: (c, side) => {
      const h = c.hand(side);
      if (!h.length) return;
      const a = Math.max(...h.map((m) => m.atk));
      for (const m of alive(c, side)) if (race(m, 'MURLOC')) c.buff(m, a, 0);
    },
  },
  { id: 'BG35_MagicItem_803t', kind: GR, v: 7, needBuddyHero: true, onGain: (G, p) => buddyOf(G, p, true) }, // 麥斯威爾貼紙
  { id: 'BG35_MagicItem_812', kind: GR, v: 6, prizeTriple3: true, onGain: (G, p) => spell(G, p, 'BG35_MagicItem_812t') }, // 腐化秘典
  {
    id: 'BG35_MagicItem_816t', // 未知寶珠
    kind: GR,
    v: 6,
    onGain: (G, p) => {
      p.gold += 4;
      const id = G.pick(RELICS.filter((r) => r.kind === 'greater' && r.id !== 'BG35_MagicItem_816t' && G.relicAvailable(p, r)).map((r) => r.id));
      if (id) G.gainRelic(p, id);
    },
  },
  {
    id: 'BG35_MagicItem_820', // 安全補丁
    kind: GR,
    v: 6,
    onGain: (_G, p) => {
      p.gold += 5;
      if (!(p.secrets ?? []).includes('TB_Bacon_Secrets_12')) (p.secrets ??= []).push('TB_Bacon_Secrets_12');
    },
  },
  { id: 'BG35_MagicItem_821t', kind: GR, v: 8, onGain: (G, p) => G.discoverFor(p, (id) => tierOf(id) === 7, '萬花筒：發現一個金色的旅店等級 7 手下（鎖定 2 回合）', { golden: true, lockTurns: 2 }) }, // 萬花筒
  { id: 'BG35_MagicItem_823t', kind: GR, v: 7, onGain: (G, p) => G.offerTimewarpCards(p, (id) => twKind(id) === 'major' && twCost(id) === 2 && bgCard(id).type === 'MINION', '古舊燭臺：發現一個高級時光扭曲的 2 費手下') }, // 古舊燭臺
  { id: 'BG35_MagicItem_838', kind: GR, v: 6, onGain: (G, p) => craft(G, p, 'BG35_MagicItem_838'), startTurn: (G, p) => craft(G, p, 'BG35_MagicItem_838') }, // 雙重縫針
  {
    id: 'BG35_MagicItem_840t', // 炫彩之淚
    kind: GR,
    v: 6,
    needTribe: 'DRAGON',
    onGain: (G, p) => void ((p.c['r:840t'] = cnt(p, 'q:bc')), drakes(G, p, 2)),
    onPlay: (G, p) => void (cnt(p, 'q:bc') - cnt(p, 'r:840t') >= 7 && ((p.c['r:840t'] = cnt(p, 'q:bc')), drakes(G, p, 2))),
  },
  {
    id: 'BG35_MagicItem_848t', // 終焉時刻之蛋頭像
    kind: GR,
    v: 7,
    needTribe: 'DRAGON',
    onGain: (G, p) => {
      const m = G.make('BG34_639', true);
      m.n = 1;
      G.addMinion(p, m);
    },
  },
  {
    id: 'BG35_MagicItem_849', // 雲蛟犄角
    kind: GR,
    v: 6,
    needTribe: 'DRAGON',
    avenge: [
      3,
      (c, side) => {
        const b = alive(c, side);
        const r = b[b.length - 1];
        const t = c.pick(b.filter((m) => m !== r && race(m, 'DRAGON')));
        if (r && t) c.buff(t, r.atk, 0);
      },
    ],
  },
  {
    id: 'BG35_MagicItem_850t', // 口袋颶風
    kind: GR,
    v: 7,
    needTribe: 'ELEMENTAL',
    onGain: (G, p) => [0, 1, 2, 3].forEach(() => G.castRandom(p, 'BG34_444')),
    startTurn: (G, p) => [0, 1].forEach(() => G.castRandom(p, 'BG34_444')),
  },
  {
    id: 'BG35_MagicItem_861', // 球手頭像
    kind: GR,
    v: 5,
    needTribe: 'ELEMENTAL',
    onGain: (G, p) => spell(G, p, 'BG31_819'),
    onPlay: (G, p, m) => void (race(m, 'ELEMENTAL') && every(p, 'r:861', 11) && spell(G, p, 'BG31_819')),
  },
  { id: 'BG35_MagicItem_925', kind: GR, v: 6, needTribe: 'NAGA', onCast: (G, p, id) => void (SPELLCRAFT_SPELLS.has(id) && G.castRandom(p, 'BG35_951')) }, // 珊瑚長矛
  {
    id: 'BG35_MagicItem_930', // 陣容哨子
    kind: GR,
    v: 5,
    onGain: (G, p) => {
      for (const m of p.shop) G.returnToPool(m);
      p.shop = p.board.slice(0, 7).map((m) => G.make(m.id));
    },
  },
  {
    id: 'BG35_MagicItem_931t', // 抄錄打字機
    kind: GR,
    v: 6,
    onBuy: (G, p, m) => void (cnt(p, 'r:931t') < 4 && inc(p, 'r:931t') && fromPool(G, p, m.id)),
    status: (p) => `還剩 ${4 - cnt(p, 'r:931t')} 次`,
  },
  { id: 'BG36_MagicItem_213', kind: GR, v: 5, soc: (c, side) => alive(c, side).forEach((m) => SPEC.get(m.id)?.rally && c.giveKw(m, 'shield')) }, // 輕羽貼紙
  {
    id: 'BG36_MagicItem_302t', // 黃金大槌
    kind: GR,
    v: 6,
    needTribe: 'PIRATE',
    endTurn: (_G, p) => {
      const n = cnt(p, 'goldens');
      p.board.forEach((m) => buff(m, 4 + n, 2 + n));
    },
  },
  {
    id: 'BG36_MagicItem_303t', // 透視酒杯
    kind: GR,
    v: 6,
    onGain: (G, p) => [0, 1].forEach(() => randomMinion(G, p, (id) => !!SPEC.get(id)?.choices && upTo(p)(id))),
    startTurn: (G, p) => [0, 1].forEach(() => randomMinion(G, p, (id) => !!SPEC.get(id)?.choices && upTo(p)(id))),
  },
  {
    id: 'BG36_MagicItem_361', // 納迦部屬貼紙
    kind: GR,
    v: 6,
    needTribe: 'NAGA',
    soc: (c, side) => {
      const n = alive(c, side).filter((m) => race(m, 'NAGA'));
      for (const m of n.length > 1 ? [n[0], n[n.length - 1]] : n) c.buff(m, m.atk, m.hp);
    },
  },
  {
    id: 'BG36_MagicItem_363', // 逃脫者頭像
    kind: GR,
    v: 6,
    needTribe: 'PIRATE',
    onGain: (G, p) => fromPool(G, p, 'BG36_523', true),
    startTurn: (_G, p) => {
      for (const h of p.hand) if (h.kind === 'spell' && h.id === 'BG36_520t') h.turns = Math.max(1, (h.turns ?? 5) - 1);
    },
  },
  { id: 'BG36_MagicItem_403t', kind: GR, v: 6, onGain: (_G, p) => void (inc(p, 'allA', 2 + cnt(p, 'discards')), inc(p, 'allH', 1)), onDiscard: (_G, p) => void inc(p, 'allA') }, // 暮光神錘
  { id: 'BG36_MagicItem_404t', kind: GR, v: 6, needTribe: 'ABERRATION', onCast: (G, p, id) => void (isTavernSpell(id) && G.recruit(p).deity(10, 10)) }, // 腐化短棒
  { id: 'BG36_MagicItem_406', kind: GR, v: 5, needTribe: 'ABERRATION', onDiscard: (G, p, card) => void (card.kind === 'spell' && randomMinion(G, p, (id) => isRace(id, 'ABERRATION') && upTo(p)(id))) }, // 古神語聖壇
  { id: 'BG36_MagicItem_416', kind: GR, v: 5, needTribe: 'ABERRATION', deityReborn: true }, // 邪惡實驗
  { id: 'BG36_MagicItem_423t', kind: GR, v: 6, needTribe: 'MECHANICAL', onGain: (G, p) => volumizer(G, p, 2), startTurn: (G, p) => volumizer(G, p, 2) }, // 音量機兵頭像
  {
    id: 'BG36_MagicItem_430', // 淤泥頭像
    kind: GR,
    v: 5,
    needTribe: 'ABERRATION',
    onGain: (G, p) => spell(G, p, 'BG36_301t'),
    onDiscard: (G, p, card) => void (card.kind === 'spell' && spell(G, p, 'BG36_301t')),
  },
  {
    id: 'BG36_MagicItem_600', // 轉化者頭像
    kind: GR,
    v: 5,
    needTribe: 'ABERRATION',
    onGain: (G, p) => fromPool(G, p, 'BG36_318'),
    soc: (c, side) => alive(c, side).forEach((m) => m.id === 'BG36_318' && c.giveKw(m, 'reborn')),
  },
  { id: 'BG36_MagicItem_602', kind: GR, v: 6, needTribe: 'ABERRATION', deityGolden: true }, // 古神面具
  {
    id: 'BG36_MagicItem_606', // 扭動觸手
    kind: GR,
    v: 5,
    needTribe: 'ABERRATION',
    onDiscard: (G, p, card) => {
      if (card.kind !== 'minion' || turnInc(p, '606') !== 1) return;
      const m = G.make(card.m.id, card.m.golden);
      m.atk = card.m.atk * 2;
      m.hp = card.m.hp * 2;
      G.addMinion(p, m);
    },
  },
  { id: 'BG36_MagicItem_810t', kind: GR, v: 7, needTribe: 'MECHANICAL', endTurn: (G, p) => satellite(G, p, 12) }, // 感應圓鋸機
  {
    id: 'BG36_MagicItem_831', // 魔鋼斬斧
    kind: GR,
    v: 5,
    onCast: (G, p, _id, t) => {
      if (!t || !p.shop.includes(t)) return;
      const e = G.pick(p.board);
      if (e) G.recruit(p).consume(e, t);
    },
  },
  {
    id: 'BG36_MagicItem_841', // 組裝機頭像
    kind: GR,
    v: 6,
    needTribe: 'MECHANICAL',
    soc: (c, side) => {
      for (const m of alive(c, side)) {
        if (!race(m, 'MECHANICAL')) continue;
        c.buff(m, 2, 2);
        m.mags.push({ id: 'BG32_172', g: 1 });
      }
    },
  },

  // ———————— 任務獎勵（第二批）————————
  {
    id: 'BG24_Reward_109', // 偷來的黃金
    kind: R,
    v: 6,
    soc: (c, side) => {
      for (const m of ends(c, side)) {
        if (m.golden) continue;
        c.buff(m, bgCard(m.id).atk ?? 0, bgCard(m.id).hp ?? 0);
        m.golden = true;
      }
    },
  },
  { id: 'BG24_Reward_130', kind: R, v: 6, eotExtra: 1 }, // 恐怖面具
  { id: 'BG24_Reward_135', kind: R, v: 7, startTurn: (G, p) => yogg(G, p) }, // 美味尤格
  { id: 'BG24_Reward_310', kind: R, v: 6, needBuddyHero: true, onGain: (G, p) => buddyOf(G, p, true) }, // 共犯
  {
    id: 'BG24_Reward_321t', // 變換自我（奇數）
    kind: R,
    v: 6,
    shopBuff: (_p, m, G) => (m && G && (tierOf(m.id) % 2 === 1) === (G.round % 2 === 0) ? [7, 7] : [0, 0]),
  },
  { id: 'BG24_Reward_363', kind: R, v: 7, startTurn: (G, p) => offerRewards(G, p, 2, '以太證據：選擇一個任務獎勵') }, // 以太證據
  { id: 'BG24_Reward_364', kind: R, v: 6, onGain: (_G, p) => void (inc(p, 'allA', 7), inc(p, 'allH', 7)), afterAttack: (c, _side, m) => c.destroy(m) }, // 不穩定的劇毒
  { id: 'BG27_Reward_504', kind: R, v: 6, startTurn: (G, p) => void (spell(G, p, 'BG27_Reward_504t'), spell(G, p, 'BG27_Reward_504t')) }, // 時間線加速
  {
    id: 'BG28_Reward_513', // 公開徵選
    kind: R,
    v: 6,
    startTurn: (G, p) => {
      const bag = [...BUDDY_IDS].filter((id) => tierOf(id) <= p.tier);
      const options = some(G, bag, 3);
      if (!options.length) return;
      const d = { options, title: '公開徵選：發現一個夥伴', noPool: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
  },
  { id: 'BG33_Reward_006', kind: R, v: 6, onGain: (G, p) => craft(G, p, 'BG33_Reward_006'), startTurn: (G, p) => craft(G, p, 'BG33_Reward_006') }, // 迴旋疾風
  {
    id: 'BG33_Reward_010', // 諾甘農的獎勵
    kind: R,
    v: 7,
    maxTier: 7,
    onGain: (G, p) => void (p.c['r:010'] = G.round + 1),
    startTurn: (G, p) => {
      if (cnt(p, 'r:010') !== G.round || p.tier >= 7) return;
      setTier(p, p.tier + 1);
    },
  },
  {
    id: 'BG33_Reward_011', // 魔術魚文物
    kind: R,
    v: 6,
    startTurn: (G, p) => {
      const bag = TAVERN_SPELLS.filter((id) => G.spellInLobby(id) && upTo(p)(id));
      const options = some(G, bag, 3);
      if (!options.length) return;
      const d = { options, title: '魔術魚文物：發現一張酒館法術教給 1/1 魚人', spells: true, teach: true };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
  },
  { id: 'BG33_Reward_021', kind: R, v: 7, rallyExtra: 1 }, // 振奮咆哮

  // ———————— 異象（第二批）————————
  { id: 'BG27_Anomaly_101', kind: A, tierSet: [1, 3, 5], startGame: (_G, p) => setTier(p, 1, [1, 3, 5]) }, // 真是稀「奇」！
  { id: 'BG27_Anomaly_102', kind: A, tierSet: [2, 4, 6], startGame: (_G, p) => setTier(p, 2, [2, 4, 6]) }, // 「偶」然如此！
  { id: 'BG27_Anomaly_302', kind: A, startGame: (G, p) => void (spell(G, p, 'BG27_Anomaly_302t'), spell(G, p, 'BG27_Anomaly_302t')) }, // 培根大餐
  {
    id: 'BG27_Anomaly_555', // 還是魚爾摩斯最好
    kind: A,
    startTurn: (G, p) => {
      const o = G.opponentOf(p.idx);
      const ids = o !== null && o >= 0 ? G.player(o).lastBoardIds ?? [] : [];
      if (!ids.length) return;
      const real = G.pick(ids)!;
      const fake = G.pick(G.poolIds((id) => !ids.includes(id) && tierOf(id) <= G.player(o!).tier));
      if (!fake) return;
      const options = G.rand() < 0.5 ? [real, fake] : [fake, real];
      const d = { options, guess: real, title: '還是魚爾摩斯最好：猜猜下一個對手上一場有哪個手下' };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
  },
  {
    id: 'BG27_Anomaly_558', // 貓的好運
    kind: A,
    onHeroDeath: (G, p, dead) => {
      const objs = some(G, (dead.deathBoard ?? dead.board).filter((m) => hasBgCard(m.id) && bgCard(m.id).type === 'MINION'), 3);
      if (objs.length) G.offerObjs(p, objs, `貓的好運：發現一個 ${dead.name} 的手下`);
    },
  },
  { id: 'BG27_Anomaly_573', kind: A, maxTier: 7, startTurn: (G, p) => void (G.round === 9 && G.discoverFor(p, (x) => tierOf(x) === 7, '寶藏庫：發現一個金色的旅店等級 7 手下', { golden: true })) }, // 寶藏庫
  { id: 'BG27_Anomaly_577', kind: A, startTurn: (G, p) => void (G.round % 4 === 0 && plain(G, p, 'BG_EX1_564')) }, // 無面無間
  { id: 'BG27_Anomaly_720', kind: A, allHeroes: 'BG20_HERO_202' }, // 阮大師的變身盤
  {
    id: 'BG27_Anomaly_723', // 勇士召喚
    kind: A,
    startGame: (G, p) => {
      G.s.shared ??= some(G, G.poolIds((id) => tierOf(id) === 6), 3);
      const d = { options: [...G.s.shared], title: '勇士召喚：所有玩家從同樣的選項發現一個旅店等級 6 的手下' };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
  },
  { id: 'BG27_Anomaly_751', kind: A, startGame: (G, p) => spell(G, p, 'BG34_Treasure_955') }, // 完美鍊金術
  { id: 'BG27_Anomaly_803', kind: A, startTurn: (G, p) => void (G.round >= 4 && offerRewards(G, p, 2, '異常的證據：選擇一個任務獎勵')) }, // 異常的證據
  {
    id: 'BG27_Anomaly_805', // 打假賽
    kind: A,
    startTurn: (G, p) => {
      const o = G.opponentOf(p.idx);
      if (o === null || o < 0) return;
      const d = { options: [p.heroId, G.player(o).heroId], bet: [p.idx, o], title: '打假賽：猜猜你的下一場戰鬥誰會贏（猜對拿到 3 枚幸運幣）' };
      if (p.discover) p.dq.push(d);
      else p.discover = d;
    },
  },
  { id: 'BG27_Anomaly_810', kind: A, needBuddies: true, buddyPool: true }, // 叫夥伴來
  { id: 'BG27_Anomaly_820', kind: A, startTurn: (G, p) => void (spell(G, p, 'BG26_502t', true), spell(G, p, 'BG26_502t', true)) }, // 接著帶來深情藍調
  { id: 'BG31_Anomaly_115', kind: A, spellTickets: true }, // 魔法商店
  { id: 'BG31_Anomaly_124', kind: A, startTurn: (G, p) => void (G.round % 3 === 0 && spell(G, p, 'BG31_Anomaly_124t4')) }, // 黃金箭
  { id: 'BG33_Anomaly_002', kind: A, needBuddies: true, onBuddy: (G, p) => G.s.buddies && discoverBuddy(G, p) }, // 友誼精神
  { id: 'BG33_Anomaly_003', kind: A, needBuddies: true, buddyThird: true }, // 自然共存
  { id: 'BG33_Anomaly_009', kind: A, needBuddies: true, buddyCostMult: 1.5, onBuy: (_G, p) => void (p.buddy && (p.buddy.cost = Math.max(0, p.buddy.cost - 1))) }, // 友善救治
  { id: 'BG34_Anomaly_805', kind: A, needTimewarp: true, startTurn: (G) => G.timewarpPool() }, // 誓言石的召喚

  // ———————— 第三批 ————————
  { id: 'BG27_Anomaly_503', kind: A, startTurn: (G, p) => yogg(G, p, ((G.s.c ??= {})[`yogg${G.round}`] ??= Math.floor(G.rand() * 6))) }, // 尤格競技場
  { id: 'BG32_MagicItem_205', kind: GR, v: 6, needTribe: 'UNDEAD', onGain: (G, p) => fromPool(G, p, 'BG32_340'), onDestroy: (_G, p) => void (p.gold += 2) }, // 淵喉施法者頭像
  { id: 'BG32_MagicItem_364', kind: GR, v: 6, needTribe: 'DRAGON', onGain: (G, p) => plain(G, p, 'BG34_Giant_314') }, // 詩人頭像
  { id: 'BG35_MagicItem_434', kind: L, v: 5, needTribe: 'QUILBOAR', onGain: (G, p) => spell(G, p, 'BG35_MagicItem_434'), startTurn: (G, p) => spell(G, p, 'BG35_MagicItem_434') }, // 珠寶盒
  {
    id: 'BG35_MagicItem_740', // 飛天魔像頭像
    kind: GR,
    v: 6,
    needTribe: 'MECHANICAL',
    onGain: (G, p) => fromPool(G, p, 'BG35_342'),
    soc: (c, side) => alive(c, side).forEach((m) => (m.extraDr ??= []).push({ id: 'BG35_MagicItem_740', g: 1 })),
  },
  {
    id: 'BG35_MagicItem_863', // 雪崩貼紙
    kind: GR,
    v: 5,
    needTribe: 'ELEMENTAL',
    onGain: (G, p) => spell(G, p, 'BG33_899'),
    onSell: (G, p) => void (every(p, 'r:863', 4) && spell(G, p, 'BG33_899')),
  },
  { id: 'BG36_MagicItem_204', kind: GR, v: 5, needTribe: 'UNDEAD', onGain: (G, p) => fromPool(G, p, 'BG34_690'), onDestroy: (G, p, m) => void (m.id === 'BG34_690' && plain(G, p, 'BG34_690')) }, // 瘟疫疾奔者頭像
  {
    id: 'BG36_MagicItem_216', // 永恆頭像
    kind: GR,
    v: 6,
    needTribe: 'UNDEAD',
    onGain: (G, p) => fromPool(G, p, 'BG25_008', true),
    onFriendDeath: (c, side, d) => void (race(d, 'UNDEAD') && d.id !== 'BG25_008' && c.counter(side, 'knights', 1)),
  },
  { id: 'BG24_Reward_718', kind: R, v: 6, onGain: (G, p) => craft(G, p, 'BG24_Reward_718'), startTurn: (G, p) => craft(G, p, 'BG24_Reward_718') }, // 綁架袋

  // ———— 第四批：頭像、異象、獎勵 ————
  {
    id: 'BG30_MagicItem_418', // 銅鬚頭像
    kind: GR,
    v: 6,
    onGain: (G, p) => {
      fromPool(G, p, 'BG_LOE_077');
      randomMinion(G, p, (id) => hasBattlecry(id) && tierOf(id) <= p.tier);
      tagRaces(p, 'BG_LOE_077', ['MURLOC', 'DRAGON']);
    },
    startTurn: (_G, p) => tagRaces(p, 'BG_LOE_077', ['MURLOC', 'DRAGON']),
    onBuy: (_G, p) => tagRaces(p, 'BG_LOE_077', ['MURLOC', 'DRAGON']),
    onGetCard: (_G, p) => tagRaces(p, 'BG_LOE_077', ['MURLOC', 'DRAGON']),
  },
  {
    id: 'BG32_MagicItem_179', // 德拉克瑞頭像
    kind: GR,
    v: 6,
    onGain: (G, p) => {
      fromPool(G, p, 'BG26_ICC_901');
      tagRaces(p, 'BG26_ICC_901', ['MECHANICAL', 'ELEMENTAL']);
    },
    startTurn: (_G, p) => tagRaces(p, 'BG26_ICC_901', ['MECHANICAL', 'ELEMENTAL']),
    onBuy: (_G, p) => tagRaces(p, 'BG26_ICC_901', ['MECHANICAL', 'ELEMENTAL']),
    onGetCard: (_G, p) => tagRaces(p, 'BG26_ICC_901', ['MECHANICAL', 'ELEMENTAL']),
  },
  { id: 'BG30_MagicItem_431', kind: GR, v: 6, needTribe: 'ELEMENTAL', onGain: (G, p) => fromPool(G, p, 'BG28_707') }, // 艾澤萊晶岩頭像（在 cards.ts 處理）
  {
    id: 'BG30_MagicItem_548', // 亮鱗頭像
    kind: GR,
    v: 6,
    onGain: (G, p) => plain(G, p, 'BG34_Giant_035'),
    onCast: (_G, p, id) => void (SPELLCRAFT_SPELLS.has(id) && p.board.forEach((m) => m.shield && buff(m, 3, 3))),
  },
  { id: 'BG30_MagicItem_555', kind: GR, v: 5, needTribe: 'ELEMENTAL', onGain: (G, p) => fromPool(G, p, 'BG26_175'), startTurn: (G, p) => void (G.rand() < 0.3 && fromPool(G, p, 'BG26_175')) }, // 驚喜頭像
  { id: 'BG30_MagicItem_828', kind: GR, v: 6, needTribe: 'NAGA', onGain: (G, p) => fromPool(G, p, 'BG26_505') }, // 沙鈴手頭像（在 cards.ts 處理）
  { id: 'BG30_MagicItem_987', kind: GR, v: 6, needTribe: 'PIRATE', onGain: (G, p) => fromPool(G, p, 'BG26_814'), startTurn: (G, p) => fromPool(G, p, 'BG26_814') }, // 情歌手頭像（在 cards.ts 處理）
  { id: 'BG32_MagicItem_283', kind: GR, v: 6, needTribe: 'MECHANICAL', onGain: (G, p) => fromPool(G, p, 'BG28_741') }, // 女皇頭像（在 cards.ts 處理）
  {
    id: 'BG32_MagicItem_920', // 奇術師頭像
    kind: GR,
    v: 6,
    needTribe: 'NAGA',
    onGain: (G, p) => [0, 1].forEach(() => fromPool(G, p, 'BG31_924')),
    permCraft: (_p, id) => id === 'BG31_924t',
  },
  { id: 'BG35_MagicItem_156', kind: GR, v: 5, onGain: (G, p) => fromPool(G, p, 'BG34_500') }, // 燃焰頭像（在 cards.ts 處理）
  { id: 'BG35_MagicItem_303', kind: L, v: 4, onGain: (G, p) => plain(G, p, 'BG34_Giant_072') }, // 跳越者頭像
  {
    id: 'BG35_MagicItem_310', // 電台明星頭像
    kind: GR,
    v: 6,
    onGain: (G, p) => {
      const m = G.make('BG34_Giant_330');
      m.reborn = true;
      G.addMinion(p, m);
    },
  },
  { id: 'BG35_MagicItem_924', kind: GR, v: 5, needTribe: 'NAGA', onGain: (G, p) => fromPool(G, p, 'BG31_035') }, // 破土者頭像（在 cards.ts 處理）
  { id: 'BG36_MagicItem_362', kind: GR, v: 6, needTribe: 'NAGA', onGain: (G, p) => fromPool(G, p, 'BG31_925') }, // 騎手頭像（在 cards.ts 處理）
  {
    id: 'BG36_MagicItem_450', // 尖酸頭像
    kind: GR,
    v: 6,
    needTribe: 'BEAST',
    onGain: (G, p) => [0, 1].forEach(() => fromPool(G, p, 'BG36_206')),
    onFriendDeath: (c, side, d) => {
      if (d.id !== 'BG36_205') return;
      const n = 4 + c.cnt(side, 'r:450');
      for (const m of alive(c, side)) if (race(m, 'BEAST')) c.buff(m, n, n);
      c.counter(side, 'r:450', 2);
    },
  },
  {
    id: 'BG30_MagicItem_952', // 罐裝小霜冰
    kind: GR,
    v: 6,
    needTribe: 'ELEMENTAL',
    soc: (c, side) => alive(c, side).filter((m) => race(m, 'ELEMENTAL')).slice(0, 3).forEach((m) => (m.extraDr ??= []).push({ id: 'BG30_MagicItem_952', g: 1 })),
  },
  {
    id: 'BG35_MagicItem_714', // 火藥桶
    kind: GR,
    v: 6,
    needTribe: 'PIRATE',
    soc: (c, side) => alive(c, side).filter((m) => race(m, 'PIRATE')).slice(0, 3).forEach((m) => (m.extraDr ??= []).push({ id: 'BG35_MagicItem_714', g: 1 })),
  },
  {
    id: 'BG35_MagicItem_732', // 靈魂發酵器：戰鬥開始時摧毀最左邊 3 個手下，最後一個手下死掉後召喚回來
    kind: GR,
    v: 5,
    soc: (c, side) => {
      const ms = alive(c, side).slice(0, 3);
      if (alive(c, side).length <= ms.length) return;
      fermented.set(c, [...(fermented.get(c) ?? []), ...ms.map((m) => ({ side, m: copyOf(c, m) }))]);
      for (const m of ms) c.destroy(m);
    },
    onFriendDeath: (c, side) => {
      const list = fermented.get(c)?.filter((x) => x.side === side) ?? [];
      if (!list.length || alive(c, side).length) return;
      fermented.set(c, (fermented.get(c) ?? []).filter((x) => x.side !== side));
      for (const { m } of list) c.summonLater(side, m);
    },
  },
  {
    id: 'BG36_MagicItem_212', // 狼頭連枷：回合結束時觸發最左邊兩個亡語
    kind: GR,
    v: 6,
    endTurn: (G, p) => p.board.filter((m) => hasDeathrattle(m)).slice(0, 2).forEach((m) => G.deathrattleOutside(p, m)),
  },
  { id: 'BG36_MagicItem_208', kind: L, v: 5, onGain: (G, p) => craft(G, p, 'BG36_MagicItem_208'), startTurn: (G, p) => craft(G, p, 'BG36_MagicItem_208') }, // 飄浮的蠟燭套組
  { id: 'BG35_MagicItem_755', kind: GR, v: 6, onGain: (G, p) => craft(G, p, 'BG35_MagicItem_755'), startTurn: (G, p) => craft(G, p, 'BG35_MagicItem_755'), minionCost: (p, m) => (m && p.c[`t:cheap:${m.uid}`] ? 1 : undefined) }, // 寒凜鑲嵌畫
  {
    id: 'BG35_MagicItem_431t', // 棘刺肩鎧：觸發亡語後，鮮血寶石 +2/+1 直到下一場戰鬥
    kind: GR,
    v: 5,
    needTribe: 'QUILBOAR',
    onDeathrattle: (c, side) => void (c.cnt(side, 'r:431t') === 0 && c.counter(side, 'r:431t', 1)),
    startTurn: (_G, p) => {
      if (!p.c['r:431t']) return;
      p.c['r:431t'] = 0;
      p.c['r:431on'] = 1;
      inc(p, 'gemA', 2);
      inc(p, 'gemH', 1);
    },
    endTurn: (_G, p) => {
      if (!p.c['r:431on']) return;
      p.c['r:431on'] = 0;
      inc(p, 'gemA', -2);
      inc(p, 'gemH', -1);
    },
  },
  { id: 'BG36_MagicItem_417', kind: GR, v: 5, onGain: (G, p) => craft(G, p, 'BG36_MagicItem_417'), startTurn: (G, p) => craft(G, p, 'BG36_MagicItem_417'), onStatGain: (G, p, m, a, h) => void (p.c['t:417'] === m.uid && G.recruit(p).deity(a, h)) }, // 臨時主宰
  { id: 'BG36_MagicItem_412', kind: L, v: 5, onGain: (G, p) => kiri(G, p, 'BG36_MagicItem_412', 'lesser') }, // 基里的雙蝕
  { id: 'BG36_MagicItem_412t2', kind: GR, v: 6, onGain: (G, p) => kiri(G, p, 'BG36_MagicItem_412t2', 'greater') },
  {
    id: 'BG35_MagicItem_152', // 惡魔掛毯
    kind: L,
    v: 4,
    onRefresh: (_G, p) => {
      if (!every(p, 'r:152', 4) || !p.shop.length) return;
      const m = p.shop.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a));
      (p.rmemo ??= {})['152'] = m.id;
    },
    healthCost: (p, kind, id) => kind === 'minion' && p.rmemo?.['152'] === id,
    onBuy: (_G, p, m) => void (p.rmemo?.['152'] === m.id && delete p.rmemo['152']),
  },
  { id: 'BG32_MagicItem_802', kind: L, v: 5, needTribe: 'ELEMENTAL', elemExtra: () => [2, 1] }, // 泉湧之筆
  { id: 'BG32_MagicItem_802t', kind: GR, v: 6, needTribe: 'ELEMENTAL', elemExtra: () => [4, 2] },
  {
    id: 'BG36_MagicItem_380', // 增幅精華
    kind: GR,
    v: 6,
    needTribe: 'ELEMENTAL',
    elemExtra: (p) => [1 + Math.floor(cnt(p, 'r:380') / 5), 1 + Math.floor(cnt(p, 'r:380') / 5)],
    onPlay: (_G, p, m) => void (race(m, 'ELEMENTAL') && inc(p, 'r:380')),
  },
  // 異象
  { id: 'BG31_Anomaly_112', kind: A }, // 孵育異變（沒有種族的手下擁有所有種族：在 data.ts 處理）
  { id: 'BG33_Anomaly_005', kind: A, needBuddies: true }, // 多彩情誼（夥伴擁有所有種族：在 data.ts 處理）
  { id: 'BG32_Anomaly_001', kind: A, startGame: (G, p) => G.setPower2(p, 'BG32_HERO_002') }, // 強效飾品包
  { id: 'BG32_Anomaly_002', kind: A, startGame: (G, p) => G.setPower2(p, 'BG30_HERO_304') }, // 次級飾品包
  { id: 'BG35_Anomaly_004', kind: A, startGame: (G, p) => G.setPower2(p, 'BG34_HERO_004') }, // 異象時光合流
  { id: 'BG35_Anomaly_005', kind: A, startGame: (G, p) => G.setPower2(p, 'BG34_HERO_000') }, // 異象時間線
  { id: 'BG27_Anomaly_822', kind: A, startGame: (G, p) => G.setPower2(p, 'BG24_HERO_100') }, // 戴納瑟斯的靈魄容器
  { id: 'BG31_Anomaly_106', kind: A, allHeroes: 'BG30_HERO_304', startGame: (G, p) => G.setPower2(p, 'BG32_HERO_002') }, // 馬林的藏寶箱
  { id: 'BG35_Anomaly_002', kind: A, startTurn: (G, p) => void (G.round === 5 && G.gainRelic(p, 'BG30_MagicItem_703')) }, // 異象立方體（第 5 回合開始，等於有神秘立方體）
  { id: 'BG35_Anomaly_007', kind: A }, // 次級占卜（第一個次級飾品拿兩次：在 game.ts 處理）
  { id: 'BG35_Anomaly_008', kind: A }, // 強效占卜
  {
    id: 'BG27_Anomaly_754', // 寶藏追尋者之路
    kind: A,
    onRefresh: (G, p) => void (every(p, 'r:754', 5) && plain(G, p, 'BG23_353t')),
  },
  {
    id: 'BG27_Anomaly_580', // 觀眾選擇：每回合抽一張大家都拿得到的卡，回合結束時給所有人
    kind: A,
    startTurn: (G, p) => {
      const c = (G.s.c ??= {});
      if (c[`aud${G.round}`] === undefined) {
        const ids = POOL_IDS.filter((id) => tierOf(id) <= Math.min(...G.alive().map((x) => x.tier)) && G.idInLobby(id));
        c[`aud${G.round}`] = ids.length ? POOL_IDS.indexOf(G.pick(ids)!) : -1;
      }
      const id = POOL_IDS[c[`aud${G.round}`]];
      if (id) p.notes.push(`觀眾選擇：回合結束時大家都會拿到「${bgCard(id).name}」`);
    },
    endTurn: (G, p) => {
      const id = POOL_IDS[G.s.c?.[`aud${G.round}`] ?? -1];
      if (id) plain(G, p, id);
    },
  },
  {
    id: 'BG31_Anomaly_102', // 繼續教育：每回合拿到一張進化卷軸，卷軸每回合變成高一級的酒館法術
    kind: A,
    startTurn: (G, p) => {
      for (const h of p.hand) {
        if (h.kind !== 'spell' || h.evo === undefined) continue;
        const t = Math.min(6, h.evo + 1);
        const id = G.randomSpell(p, (x) => tierOf(x) === t);
        if (!id) continue;
        h.id = id;
        h.evo = t;
      }
      if (p.hand.length < 10) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: SCROLL, g: 1, evo: 0 });
    },
  },
  // 任務獎勵
  {
    id: 'BG24_Reward_362', // 澤魯斯的精華
    kind: R,
    v: 6,
    endTurn: (G, p) => {
      const m = G.make(ZERUS);
      m.shifter = true;
      G.addMinion(p, m);
    },
    startTurn: (G, p) => {
      for (const h of p.hand) {
        if (h.kind !== 'minion' || !h.m.shifter) continue;
        const id = G.pick(POOL_IDS.filter((x) => tierOf(x) <= Math.min(6, p.tier + 1) && G.idInLobby(x)));
        if (!id) continue;
        const n = G.make(id);
        const base = G.make(h.m.id, h.m.golden);
        n.atk += h.m.atk - base.atk;
        n.hp += h.m.hp - base.hp;
        n.shifter = true;
        n.uid = h.m.uid;
        h.m = n;
      }
    },
  },
  { id: 'BG24_Reward_715', kind: R, v: 7, startTurn: (G, p) => spell(G, p, G.pick(PARTS)!) }, // 增幅強化裝置
  { id: 'BG24_Reward_719', kind: R, v: 6, onGain: (G, p) => craft(G, p, 'BG24_Reward_719'), startTurn: (G, p) => craft(G, p, 'BG24_Reward_719') }, // 黃金錘
  {
    id: 'BG27_Anomaly_555t', // 還是魚爾摩斯最好：猜下一個對手上一場用了哪個手下（和異象一樣）
    kind: R,
    v: 5,
    startTurn: (G, p) => RELIC_SPEC.get('BG27_Anomaly_555')?.startTurn?.(G, p),
  },
  { id: 'BG33_Anomaly_008', kind: A, needBuddies: true, startTurn: (G, p) => void (G.round === 4 && G.offerQuests(p, 3, 'BG33_Anomaly_008')) }, // 共犯
  { id: 'BG31_Anomaly_117', kind: A, startTurn: (G, p) => [0, 1].forEach(() => spell(G, p, 'BG31_Anomaly_117', true)) }, // 緊急著陸
  { id: 'BG35_Anomaly_001', kind: A, startTurn: (G, p) => void (G.round % 3 === 0 && spell(G, p, 'BG35_Anomaly_001')) }, // 搖旗吶喊
  {
    id: 'BG32_MagicItem_415', // 戰鬥號角：報復 (2)：觸發一個友方戰吼（戰鬥中沒有戰吼，改成下一回合開始時觸發）
    kind: GR,
    v: 5,
    onGain: (G, p) => G.discoverFor(p, (id) => hasBattlecry(id) && tierOf(id) <= p.tier, '戰鬥號角：發現一個戰吼手下'),
    avenge: [2, (c, side) => c.counter(side, 'r:415', 1)],
    startTurn: (G, p) => {
      const n = Math.min(3, cnt(p, 'r:415'));
      p.c['r:415'] = 0;
      const r = G.recruit(p);
      for (let k = 0; k < n; k++) {
        const m = G.pick(p.board.filter((x) => hasBattlecry(x.id)));
        if (m) r.battlecry(m);
      }
    },
  },
];


// —— 第二批飾品用的工具 ——
const LENS = 'BG35_MagicItem_817t';
/** 造法：每回合拿到一張只限這回合的法術（法術就是這個飾品本身） */
function craft(G: BgGame, p: BPlayer, id: string) {
  spell(G, p, id, true);
}
/** 對手下使用鮮血寶石 n 次（不觸發「使用鮮血寶石時」的效果） */
function gemOn(_G: BgGame, p: BPlayer, m: BMinion | undefined, n: number) {
  if (!m) return;
  m.atk += n * (1 + cnt(p, 'gemA'));
  m.hp += n * (1 + cnt(p, 'gemH'));
  m.gems = (m.gems ?? 0) + n;
}
/** 從 n 個飾品中選一個取代這個飾品（pay = 要付錢） */
function swapTrinket(G: BgGame, p: BPlayer, self: string, kind: 'lesser' | 'greater', n: number, pay = kind === 'greater') {
  if (!(p.relics ?? []).includes(self)) return;
  const options = some(G, RELICS.filter((r) => r.kind === kind && r.id !== self && G.relicAvailable(p, r)).map((r) => r.id), n);
  if (!options.length) return;
  const d = { options, relics: kind, freeRelic: self, payRelic: pay, title: `${bgCard(self).name}：選擇一個${kind === 'lesser' ? '次級' : '強效'}飾品取代它` };
  if (p.discover) p.dq.push(d);
  else p.discover = d;
}
/** 記下飾品拿到時的計數 */
function mark(p: BPlayer, id: string, key: string) {
  p.c[`r:${id}s`] = cnt(p, key);
}
/** 計數達標後換成同種族的強效飾品 */
function evolveTrinket(G: BgGame, p: BPlayer, id: string, key: string, n: number, tribe: Tribe) {
  if (!(p.relics ?? []).includes(id) || cnt(p, key) - cnt(p, `r:${id}s`) < n) return;
  const next = G.pick(RELICS.filter((r) => r.kind === 'greater' && r.needTribe === tribe && G.relicAvailable(p, r)).map((r) => r.id));
  p.relics = (p.relics ?? []).filter((x) => x !== id);
  if (next) G.gainRelic(p, next);
}
/** 命運之輪：隨機 6 種效果之一 */
function yogg(G: BgGame, p: BPlayer, fixed?: number) {
  const roll = fixed ?? Math.floor(G.rand() * 6);
  if (roll === 0) p.gold += 3;
  else if (roll === 1) G.discoverFor(p, upTo(p), '命運之輪：發現一個手下');
  else if (roll === 2) [0, 1].forEach(() => randomSpell(G, p));
  else if (roll === 3) p.board.forEach((m) => buff(m, 2, 2));
  else if (roll === 4) G.recruit(p).tavernBuff(3, 3);
  else G.goldenize(p, G.pick(p.board.filter((m) => !m.golden && tierOf(m.id) <= 3)));
  p.notes.push(`命運之輪：${['獲得 3 枚金幣', '發現一個手下', '拿到 2 張酒館法術', '手下 +2/+2', '酒館的手下 +3/+3', '一個低本手下變成金卡'][roll]}`);
}
/** 普崔希德的造物：選一個能力（黑暗贈禮） */
function creation(G: BgGame, p: BPlayer) {
  const gifts = some(G, GIFT_IDS, 3);
  const st = 2 * p.tier + 2;
  const d = { options: gifts.map(() => 'BG25_HERO_100pt'), gifts, noPool: true, stats: [st, st] as [number, number], title: '打造不死族：選擇它的能力' };
  if (p.discover) p.dq.push(d);
  else p.discover = d;
}
/** 風落龍捲 */
function tornado(G: BgGame, p: BPlayer, n: number) {
  const m = G.make('BG31_817');
  const k = n * (1 + turnCnt(p, 'sold'));
  m.atk += k;
  m.hp += k;
  G.addMinion(p, m);
}
/** 英雄能力的夥伴 */
function buddyOf(G: BgGame, p: BPlayer, golden: boolean) {
  const id = `${p.powerHero ?? p.heroId}_Buddy`;
  if (BUDDY_IDS.has(id)) G.addMinion(p, G.make(id, golden));
}
function discoverBuddy(G: BgGame, p: BPlayer) {
  const options = some(G, [...BUDDY_IDS].filter((id) => tierOf(id) <= p.tier), 3);
  if (!options.length) return;
  const d = { options, title: '發現一個夥伴', noPool: true };
  if (p.discover) p.dq.push(d);
  else p.discover = d;
}
function volumizer(G: BgGame, p: BPlayer, n: number) {
  for (let k = 0; k < n; k++) plain(G, p, G.pick(['BG34_170t', 'BG34_170t2', 'BG34_170t3'])!);
}
function satellite(G: BgGame, p: BPlayer, base: number) {
  const m = G.make('BG31_171t');
  const k = base + 2 * turnCnt(p, 'tsp');
  m.atk = k;
  m.hp = k;
  G.addMinion(p, m);
}
function drakes(G: BgGame, p: BPlayer, n: number) {
  for (let k = 0; k < n; k++) plain(G, p, G.pick(['BG34_634t', 'BG34_635t', 'BG34_636t', 'BG34_637t', 'BG34_638t'])!);
}
/** 從 n 個任務獎勵選一個（免費） */
function offerRewards(G: BgGame, p: BPlayer, n: number, title: string) {
  const options = some(G, REWARDS_ALL().filter((id) => G.relicAvailable(p, RELIC_SPEC.get(id)!)), n);
  if (!options.length) return;
  const d = { options, relics: 'reward' as const, title };
  if (p.discover) p.dq.push(d);
  else p.discover = d;
}
const REWARDS_ALL = () => RELICS.filter((r) => r.kind === 'reward').map((r) => r.id);
/** 絲瑟拉貼紙：每場戰鬥第一個死掉的惡魔 */
const firstDemon = new WeakMap<Combat, BMinion>();

/** 瑪卓薩斯匕首：發現一個友方手下的普通複製，帶著黑暗贈禮 */
function dagger(G: BgGame, p: BPlayer) {
  const ids = some(G, [...new Set(p.board.map((m) => m.id))].filter((id) => !TOKENS.has(id) || hasBgCard(id)), 3);
  if (!ids.length) return;
  const gifts = some(G, GIFT_IDS, ids.length);
  const d = { options: ids, gifts, title: '瑪卓薩斯匕首：發現一個友方手下的複製（有黑暗贈禮）', noPool: true };
  if (p.discover) p.dq.push(d);
  else p.discover = d;
}

function steal(G: BgGame, p: BPlayer) {
  if (!p.shop.length || p.hand.length >= 10) return;
  const m = p.shop.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a));
  p.shop = p.shop.filter((x) => x !== m);
  G.addMinion(p, m);
}

function cloak(G: BgGame, p: BPlayer) {
  for (let k = 0; k < typesOf(p.board); k++) {
    const id = G.randomSpell(p, (x) => upTo(p)(x) && !!G.castable(x));
    if (id) G.castRandom(p, id);
  }
}

function setTier(p: BPlayer, t: number, set?: number[]) {
  p.tier = t;
  const next = set ? set.find((x) => x > t) : t + 1;
  p.upgradeCost = next ? UPGRADE_COST[next] ?? 0 : 0;
}

export const RELIC_SPEC = new Map<string, RelicSpec>(RELICS.map((r) => [r.id, r]));

export const TRINKETS = (kind: 'lesser' | 'greater') => RELICS.filter((r) => r.kind === kind);
export const REWARDS = RELICS.filter((r) => r.kind === 'reward').map((r) => r.id);
export const ANOMALIES = RELICS.filter((r) => r.kind === 'anomaly');

/** 飾品的價格（官方資料的費用） */
export function relicCost(id: string): number {
  return hasBgCard(id) ? bgCard(id).cost ?? 0 : 0;
}

// —— 任務 ——
export interface QuestSpec {
  id: string;
  need: number;
  /** 計數用的 key；沒給的話用 progress */
  key?: string;
  progress?: (p: BPlayer) => number;
  /** 敘述中要顯示的數字 */
  label: string;
}

export const QUESTS: QuestSpec[] = [
  { id: 'BG24_Quest_112', key: 'q:refresh', need: 10, label: '重置酒館' }, // 追蹤足跡
  { id: 'BG24_Quest_114', key: 'q:summon', need: 12, label: '召喚手下' }, // 列隊指認
  { id: 'BG24_Quest_120', key: 'q:lose', need: 4, label: '輸掉或平手的戰鬥' }, // 揭發犯人
  { id: 'BG24_Quest_124', key: 'q:die', need: 20, label: '友方手下死亡' }, // 重現兇案
  { id: 'BG24_Quest_125', key: 'q:order', need: 4, label: '手下依攻擊力由低到高排列的戰鬥' }, // 梳理案情
  { id: 'BG24_Quest_318', key: 'q:taunt', need: 12, label: '友方嘲諷手下被攻擊' }, // 保護證人
  { id: 'BG24_Quest_126', key: 'spentTotal', need: 45, label: '花費金幣' }, // 追查金流
  { id: 'BG24_Quest_311', key: 'q:bc', need: 6, label: '打出戰吼手下' }, // 呼叫救援
  { id: 'BG24_Quest_313', key: 'bought', need: 9, label: '購買手下' }, // 邀請賓客
  { id: 'BG24_Quest_314', key: 'q:cards', need: 16, label: '把卡牌加入手牌' }, // 尋找指紋
  { id: 'BG24_Quest_320', key: 'drs', need: 10, label: '觸發友方亡語' }, // 挖掘遺骨
  { id: 'BG24_Quest_351', key: 'q:unspent', need: 3, label: '結束回合時有剩下的金幣' }, // 雇用調查員
  { id: 'BG24_Quest_352', key: 'q:attack', need: 25, label: '友方手下攻擊' }, // 破案
  { id: 'BG27_Quest_800', key: 'q:sell', need: 6, label: '販賣手下' }, // 焚燒證據
  { id: 'BG27_Quest_801', need: 40, progress: (p) => p.board.reduce((n, m) => n + m.atk, 0), label: '戰隊的總攻擊力' }, // 施壓當局
  { id: 'BG27_Quest_802', key: 'q:kill', need: 18, label: '摧毀敵方手下' }, // 召集嫌犯
  { id: 'BG28_Quest_500', key: 'spells', need: 10, label: '施放法術' }, // 填滿大鍋
];
export const QUEST_SPEC = new Map(QUESTS.map((q) => [q.id, q]));

/** 任務目前的進度 */
export function questProgress(p: BPlayer): [number, number] | null {
  const q = p.quest;
  if (!q) return null;
  const spec = QUEST_SPEC.get(q.id);
  if (!spec) return null;
  const cur = spec.progress ? spec.progress(p) : (p.c[spec.key!] ?? 0) - q.start;
  return [Math.max(0, Math.min(q.need, cur)), q.need];
}

/** 異象有沒有可能出現在這局（種族限制） */
export function anomalyFits(a: RelicSpec, tribes: Tribe[], o: { buddies: boolean; timewarp?: boolean }): boolean {
  if (a.needTribe && !tribes.includes(a.needTribe)) return false;
  if (a.needBuddies && !o.buddies) return false;
  if (a.needTimewarp && !o.timewarp) return false;
  return true;
}

export { COIN };

// —— 飾品、獎勵、異象給的法術（造法法術、衍生法術）與 7 本酒館法術 ——
const relicSpell = (s: Omit<SpellSpec, 'v'> & { v?: number }) => SPELL_SPEC.set(s.id, { ...s, v: () => s.v ?? 5 });
// 古神的印記：選一個手下，再選一個高一本的手下變成它
relicSpell({
  id: 'BG30_MagicItem_416',
  target: 'friend',
  cast: ({ G, p }, t) => void (t && G.discoverFor(p, (id) => tierOf(id) === Math.min(7, tierOf(t.id) + 1), '古神的印記：選擇要變成的手下', { transform: t.uid })),
});
// 魔血葫蘆：選一個友方手下吃掉酒館裡隨機一個手下
relicSpell({
  id: 'BG30_MagicItem_429',
  target: 'friend',
  cast: ({ G, p, r }, t) => {
    const f = G.pick(p.shop);
    if (t && f) r.consume(t, f);
  },
});
// 鮮豔泡泡：魚人隨機一個額外關鍵字
relicSpell({
  id: 'BG32_MagicItem_892',
  target: 'friend',
  filter: (m) => race(m, 'MURLOC'),
  cast: ({ G }, t) => {
    const kw = t && G.pick(BONUS_KEYWORDS.filter((k) => !t[k]));
    if (t && kw) t[kw] = true;
  },
});
// 閻獄之主貼紙（次級 / 強效）：摧毀一個友方不死族，拿到 1 / 2 個隨機不死族
for (const [id, n] of [
  ['BG35_MagicItem_306', 1],
  ['BG35_MagicItem_733', 2],
] as const)
  relicSpell({
    id,
    target: 'friend',
    filter: (m) => race(m, 'UNDEAD'),
    cast: ({ G, p, r }, t) => {
      if (!t) return;
      r.destroy(t);
      for (let k = 0; k < n; k++) randomMinion(G, p, (x) => isRace(x, 'UNDEAD') && upTo(p)(x));
    },
  });
// 爬蛇法杖：野獸 +2/+2 與復生
relicSpell({ id: 'BG35_MagicItem_872', target: 'friend', filter: (m) => race(m, 'BEAST'), cast: ({ r }, t) => void (t && (r.spellBuff(t, 2, 2), (t.reborn = true))) });
// 寶貴珍珠：直到下回合 +30/+30
relicSpell({ id: 'BG30_MagicItem_714', target: 'friend', cast: ({ r }, t) => void (t && r.tmpBuff(t, 30, 30)) });
// 雙重縫針：身材變成兩倍，鎖定在手牌 1 回合
relicSpell({
  id: 'BG35_MagicItem_838',
  target: 'friend',
  cast: ({ G, p }, t) => {
    if (!t || p.hand.length >= 10) return;
    t.atk *= 2;
    t.hp *= 2;
    p.board = p.board.filter((m) => m !== t);
    G.addMinion(p, t);
    const h = p.hand.find((x) => x.kind === 'minion' && x.m === t);
    if (h) h.locked = G.round + 1;
  },
});
// 迴旋疾風：風怒與聖盾
relicSpell({ id: 'BG33_Reward_006', target: 'friend', cast: (_ctx, t) => void (t && ((t.windfury = true), (t.shield = true))) });
// 複製鏡片：選一個 3 本以下的手下，拿到普通的複製
relicSpell({ id: LENS, target: 'any', filter: (m) => tierOf(m.id) <= 3, cast: ({ G, p }, t) => void (t && plain(G, p, t.id)) });
// 三合一獎品：發現一個等級 3 的暗月獎品
relicSpell({ id: 'BG35_MagicItem_812t', target: false, cast: ({ G, p }) => G.discoverPrize(p, 3) });
// 加速器：把手下變成高一本的隨機手下
relicSpell({
  id: 'BG27_Reward_504t',
  target: 'friend',
  cast: ({ G, p }, t) => {
    if (!t) return;
    const id = G.draw((x) => tierOf(x) === Math.min(7, tierOf(t.id) + 1));
    const k = p.board.indexOf(t);
    if (!id || k < 0) return;
    G.returnToPool(t);
    p.board[k] = G.make(id);
  },
  v: 7,
});
// 黃金箭：讓酒館裡的一個手下變成金卡
relicSpell({ id: 'BG31_Anomaly_124t4', target: 'any', filter: (m, { p }) => p.shop.includes(m) && !m.golden, cast: ({ G, p }, t) => G.goldenize(p, t ?? undefined), v: 8 });
// 深情藍調：直到下回合 +2/+2（之後的深情藍調更強）
relicSpell({
  id: 'BG26_502t',
  target: 'friend',
  cast: ({ p, r }, t) => {
    const n = 2 + 2 * cnt(p, 'deepBlue');
    if (t) r.tmpBuff(t, n, n);
    inc(p, 'deepBlue');
  },
});
// 小豬撲滿：獲得金幣（每回合增加）
relicSpell({
  id: 'BG27_Anomaly_302t',
  target: false,
  cast: ({ G, p }) => void (p.gold += Math.max(1, G.round - 1)),
  v: 4,
});
// 夢想者的擁抱：觸發一個友方手下的戰吼
relicSpell({ id: 'BG28_883', target: 'friend', filter: (m) => hasBattlecry(m.id), cast: ({ r }, t) => void (t && r.battlecry(t)) });
// 掠奪者的契約：從酒館偷一個隨機的海盜
relicSpell({
  id: 'BG31_891',
  target: false,
  cast: ({ G, p }) => {
    const m = G.pick(p.shop.filter((x) => race(x, 'PIRATE')));
    if (!m || p.hand.length >= 10) return;
    p.shop = p.shop.filter((x) => x !== m);
    G.addMinion(p, m);
  },
});
// —— 7 本酒館法術 ——
relicSpell({ id: 'BG28_507', target: 'any', cast: (_ctx, t) => void (t && (t.shield = true)), v: 5 }); // 神聖禮物
relicSpell({ id: 'BG31_889', target: false, cast: ({ p }) => void inc(p, 'peace'), v: 10 }); // 有福同享（戰鬥開始時處理）
relicSpell({ id: 'BG31_896', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => tierOf(id) === 7, '聖化儀式：發現一個旅店等級 7 的手下'), v: 12 }); // 聖化儀式
relicSpell({
  id: 'BG34_272', // 展覽廳餐具
  target: false,
  cast: ({ p, r }) => {
    const n = 1 + typesOf(p.board);
    for (let k = 0; k < n; k++) for (const m of p.board) r.spellBuff(m, 3, 3);
  },
  v: 14,
});
// 珠寶盒：讓野豬人獲得嘲諷、聖盾或復生的鮮血寶石
relicSpell({
  id: 'BG35_MagicItem_434',
  target: 'friend',
  cast: ({ G, p, r }, t) => {
    if (!t) return;
    (r as typeof r & { gem(m: BMinion): void }).gem(t);
    if (race(t, 'QUILBOAR')) t[G.pick(['taunt', 'shield', 'reborn'] as const)!] = true;
    void p;
  },
});
// 雪崩：賣掉一個友方手下，把身材給最左邊的元素
relicSpell({
  id: 'BG33_899',
  target: 'friend',
  cast: ({ G, p }, t) => {
    if (!t) return;
    G.sellRaw(p, t);
    buff(p.board.find((m) => race(m, 'ELEMENTAL')), t.atk, t.hp);
  },
});
// 綁架袋：把酒館裡一張不是金卡的卡移到手牌
relicSpell({
  id: 'BG24_Reward_718',
  target: 'any',
  filter: (m, { p }) => p.shop.includes(m) && !m.golden,
  cast: ({ G, p }, t) => {
    if (!t || p.hand.length >= 10) return;
    p.shop = p.shop.filter((m) => m !== t);
    G.addMinion(p, t);
  },
});
// 飛天魔像頭像給的亡語：你的手下永久 +2/+2
SPEC.set('BG35_MagicItem_740', { id: 'BG35_MagicItem_740', deathrattle: (c, s) => c.friends(s).forEach((m) => m !== s && c.perm(m, 2, 2)) });

// —— 第四批用的工具 ——
const SCROLL = 'BG31_Anomaly_102t';
const ZERUS = 'BGS_029';
const PARTS = ['BG24_Reward_715t', 'BG24_Reward_715t2', 'BG24_Reward_715t3', 'BG24_Reward_715t4'];
const hasDeathrattle = (m: BMinion) => !!SPEC.get(m.id)?.deathrattle || !!m.extraDr?.length || m.mags.some((x) => SPEC.get(x.id)?.deathrattle);
const fermented = new WeakMap<Combat, { side: 0 | 1; m: BMinion }[]>();
/** 讓某張卡（場上與手牌）多幾個種族 */
function tagRaces(p: BPlayer, id: string, races: Tribe[]) {
  for (const m of [...p.board, ...minionsInHand(p)]) if (m.id === id) m.xr = races;
}
/** 基里的雙蝕：選一個便宜的飾品，拿到兩個，英雄能力不能再用 */
function kiri(G: BgGame, p: BPlayer, self: string, kind: 'lesser' | 'greater') {
  const options = some(G, RELICS.filter((r) => r.kind === kind && !r.id.startsWith('BG36_MagicItem_412') && relicCost(r.id) < 4 && G.relicAvailable(p, r)).map((r) => r.id), 3);
  if (!options.length) return;
  const d = { options, relics: kind, freeRelic: self, payRelic: false, twice: true, title: `${bgCard(self).name}：選擇一個飾品，它和你的英雄能力都會變成這個飾品` };
  if (p.discover) p.dq.push(d);
  else p.discover = d;
}
// 罐裝小霜冰：亡語召喚一個培植小霜冰
SPEC.set('BG30_MagicItem_952', { id: 'BG30_MagicItem_952', deathrattle: (c, s) => void c.summon(c.side(s), c.make('BG26_537'), c.index(s) + 1) });
// 火藥桶：亡語召喚有此手下攻擊力的 1/1 飛天海盜，它立刻攻擊
SPEC.set('BG35_MagicItem_714', {
  id: 'BG35_MagicItem_714',
  deathrattle: (c, s) => {
    const m = c.make('BGS_061t');
    m.atk = s.atk;
    const x = c.summon(c.side(s), m, c.index(s) + 1);
    if (x) c.attackNow(x);
  },
});
// 飄浮的蠟燭套組：觸發一個友方手下的亡語
relicSpell({ id: 'BG36_MagicItem_208', target: 'friend', filter: (m) => hasDeathrattle(m), cast: ({ G, p }, t) => void (t && G.deathrattleOutside(p, t)) });
// 寒凜鑲嵌畫：酒館換成戰吼手下，它們只要 1 枚金幣
relicSpell({
  id: 'BG35_MagicItem_755',
  target: false,
  cast: ({ p, r }) => {
    r.restock(Array.from({ length: Math.max(3, p.shop.length) }, () => (id: string) => hasBattlecry(id) && tierOf(id) <= p.tier));
    for (const m of p.shop) p.c[`t:cheap:${m.uid}`] = 1;
  },
});
// 臨時主宰：選一個手下，它本回合獲得的身材你的神也會獲得
relicSpell({ id: 'BG36_MagicItem_417', target: 'friend', cast: ({ p }, t) => void (t && (p.c['t:417'] = t.uid)) });
// 黃金錘：讓一個友方手下變成金卡直到下一回合
relicSpell({
  id: 'BG24_Reward_719',
  target: 'friend',
  filter: (m) => !m.golden,
  cast: ({ G, p }, t) => {
    if (!t || t.golden) return;
    const a = t.atk;
    const h = t.hp;
    G.goldenize(p, t);
    t.tmpGold = [t.atk - a, t.hp - h];
  },
});
// 強化零件：+5/+5 和一個關鍵字
PARTS.forEach((id, i) =>
  relicSpell({
    id,
    target: 'friend',
    cast: ({ r }, t) => {
      if (!t) return;
      r.buff(t, 5, 5);
      t[(['taunt', 'windfury', 'shield', 'reborn'] as const)[i]] = true;
    },
  }),
);
// 緊急著陸：把酒館裡這個手下的所有複製從卡池移除
relicSpell({
  id: 'BG31_Anomaly_117',
  target: 'any',
  filter: (m, { p }) => p.shop.includes(m),
  cast: ({ G, p }, t) => {
    if (!t) return;
    const id = t.id;
    p.shop = p.shop.filter((m) => m.id !== id);
    G.s.pool[id] = 0;
    p.notes.push(`緊急著陸：${bgCard(id).name} 從卡池移除了`);
  },
  v: 2,
});
// 搖旗吶喊：把一個友方手下的 3 個複製加進卡池
relicSpell({
  id: 'BG35_Anomaly_001',
  target: 'friend',
  cast: ({ G }, t) => void (t && POOL_IDS.includes(t.id) && (G.s.pool[t.id] = (G.s.pool[t.id] ?? 0) + 3)),
  v: 3,
});
