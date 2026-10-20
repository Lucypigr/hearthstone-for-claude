// 英雄專屬的卡：吉姆‧雷諾的戰巡艦與升級、亞坦尼斯的神族、凱莉根的蟲族、普崔希德的造物
// cards.ts 會把手下加進 SPEC（不在酒館卡池裡）、spells.ts 會把戰巡艦升級加進 SPELL_SPEC
import type { Combat, MinionSpec } from './api';
import { bgCard, hasBgCard, isRace, tierOf } from './data';
import { isMagnetic } from './late';
import type { SpellSpec } from './spells';
import type { BMinion, BPlayer } from './types';

export const CRUISER = 'BG31_HERO_801pt';
export const LARVA = 'BG31_HERO_811t';
export const CREATION = 'BG25_HERO_100pt';
export const PROTOSS = ['BG31_HERO_802pt', 'BG31_HERO_802pt1', 'BG31_HERO_802pt4', 'BG31_HERO_802pt5', 'BG31_HERO_802pt7'];
const INTERCEPTOR = 'BG31_HERO_802pt1t';
/** 蟲族：第 1 階、第 2 階、第 3 階 */
export const ZERG: string[][] = [
  ['BG31_HERO_811t2', 'BG31_HERO_811t3', 'BG31_HERO_811t4'],
  ['BG31_HERO_811t5', 'BG31_HERO_811t6', 'BG31_HERO_811t7'],
  ['BG31_HERO_811t8', 'BG31_HERO_811t9', 'BG31_HERO_811t10'],
];
export const ALL_ZERG = new Set([LARVA, ...ZERG.flat()]);
const alive = (c: Combat, side: 0 | 1) => c.board(side).filter((m) => !m.dead);

export const HERO_MINIONS: MinionSpec[] = [
  // —— 吉姆‧雷諾的戰巡艦：升級的效果記在計數上（雷諾的 Yamato 砲、進階彈道、強化碉堡）——
  {
    id: CRUISER,
    soc: (c, s) => {
      const side = c.side(s);
      const dmg = c.cnt(side, 'bcY');
      if (!dmg) return;
      for (let k = 0; k < (c.cnt(side, 'bcMissile') ? 2 : 1); k++) {
        const e = alive(c, (1 - side) as 0 | 1);
        if (e.length) c.damage(e.reduce((a, b) => (b.hp > a.hp ? b : a)), dmg, s);
      }
    },
    rally: (c, s) => {
      const n = c.cnt(c.side(s), 'bcR');
      if (n) for (const m of c.friends(s)) if (m !== s) c.buff(m, n, 0);
    },
    endTurn: (r) => {
      if (!r.p.c.bcBunker) return;
      r.getRandom((id) => isMagnetic(id) && isRace(id, 'MECHANICAL') && tierOf(id) <= r.p.tier);
    },
    val: 4,
  },
  // —— 亞坦尼斯的神族 ——
  {
    id: 'BG31_HERO_802pt', // 巨像：奮戰：對目標兩旁的手下造成 2 點傷害（花越多金幣越強）
    rally: (c, s, g, t) => {
      const side = c.side(s);
      const dmg = (2 + Math.floor(c.cnt(side, 'spentTotal') / 10)) * g;
      const b = c.board((1 - side) as 0 | 1).filter((m) => !m.dead);
      const i = b.indexOf(t);
      for (const m of [b[i - 1], b[i + 1]]) if (m) c.damage(m, dmg, s);
    },
    val: 10,
  },
  {
    id: 'BG31_HERO_802pt1', // 航空母艦：報復 (4)：召喚 7/7 攔截機，然後永久強化
    avenge: [
      4,
      (c, s, g) => {
        const m = c.make(INTERCEPTOR);
        m.atk = (7 + 2 * s.n) * g;
        m.hp = (7 + 2 * s.n) * g;
        c.summon(c.side(s), m, c.index(s) + 1);
        c.bump(s);
      },
    ],
    val: 10,
  },
  {
    id: 'BG31_HERO_802pt4', // 不朽者：起始戰鬥：獲得兩旁手下的身材
    soc: (c, s, g) => {
      const b = c.friends(s);
      const i = b.indexOf(s);
      for (const m of [b[i - 1], b[i + 1]]) if (m) c.buff(s, m.atk * g, m.hp * g);
    },
    val: 10,
  },
  {
    id: 'BG31_HERO_802pt5', // 虛空射線：友方手下攻擊時，賦予它和這個手下永久 +5 攻擊力
    onFriendAttack: (c, s, a, g) => {
      c.perm(a, 5 * g, 0);
      c.perm(s, 5 * g, 0);
    },
    val: 10,
  },
  {
    id: 'BG31_HERO_802pt7', // 母艦：報復 (4)：拿到一個隨機的神族手下
    avenge: [4, (c, s, g) => void [...Array(g)].forEach(() => c.give(c.side(s), c.pick(PROTOSS)!))],
    val: 9,
  },
  { id: INTERCEPTOR },
  // —— 凱莉根的蟲族（每回合開始時變形，在 game.ts 處理）——
  { id: LARVA, val: 1 },
  {
    id: 'BG31_HERO_811t2', // 異化蟲：起始戰鬥：召喚這個手下的複製
    soc: (c, s) => {
      const x = c.make(s.id, s.golden);
      Object.assign(x, { atk: s.atk, hp: s.hp, taunt: s.taunt, shield: s.shield, windfury: s.windfury, venom: s.venom, reborn: s.reborn });
      c.summon(c.side(s), x, c.index(s) + 1);
    },
    val: 4,
  },
  { id: 'BG31_HERO_811t3', endTurn: (r, s, g) => r.buff(s, 0, r.p.tier * g), scale: 4 }, // 蟑螂：回合結束時 +生命值（等於你的等級）
  { id: 'BG31_HERO_811t4', rally: (c, s, g) => c.perm(s, c.heroTier(c.side(s)) * g, 0), val: 4 }, // 刺蛇：奮戰：永久 +攻擊力（等於你的等級）
  {
    id: 'BG31_HERO_811t5', // 毒爆蟲：亡語：對隨機敵方手下造成等同攻擊力的傷害
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) {
        const e = c.enemies(s);
        const t = c.pick(e);
        if (t) c.damage(t, s.atk, s);
      }
    },
    val: 5,
  },
  { id: 'BG31_HERO_811t6', val: 5 }, // 異化龍：友方手下殺死敵人後永久 +3 攻擊力（凱莉根的 onKill）
  { id: 'BG31_HERO_811t7', avenge: [1, (c, s, g) => c.perm(s, g, g)], val: 5 }, // 潛伏者
  { id: 'BG31_HERO_811t8', val: 6 }, // 寄生蟲：烈毒，攻擊時免疫（在 combat.ts 處理）
  { id: 'BG31_HERO_811t9', onPlay: (r, _s, _m, g) => r.p.board.forEach((m) => r.buff(m, g, g)), onSpell: (r, _s, _t, g) => r.p.board.forEach((m) => r.buff(m, g, g)), scale: 6 }, // 感染蟲
  { id: 'BG31_HERO_811t10', cleave: true, soc: (c, s) => c.buff(s, s.atk, s.hp), val: 8 }, // 雷獸
  // —— 普崔希德的造物（身材與能力在打造時決定）——
  { id: CREATION, text: (m) => `普崔希德打造的不死族（${m.atk}/${m.hp}）`, val: 6 },
];

/** 每種戰巡艦升級的所有版本（依酒館等級） */
const UPGRADE_KINDS = ['a', 'b', 'c', 'd', 'f', 'h', 'i', 'j'];
export function upgradeIds(kind: string): string[] {
  return [`${CRUISER}${kind}`, ...[2, 3, 4, 5, 6, 7].map((n) => `${CRUISER}${kind}${n}`)].filter((id) => hasBgCard(id));
}
/** 這個等級可以出現的升級：每種挑等級不超過你的最高版本 */
export function upgradeFor(tier: number, rand: () => number): string | undefined {
  const opts = UPGRADE_KINDS.map((k) => upgradeIds(k).filter((id) => (bgCard(id).tier ?? 1) <= tier).pop()).filter((x): x is string => !!x);
  return opts[Math.floor(rand() * opts.length)];
}
function cruisers(p: BPlayer): BMinion[] {
  return [...p.board.filter((m) => m.id === CRUISER), ...p.hand.flatMap((h) => (h.kind === 'minion' && h.m.id === CRUISER ? [h.m] : []))];
}
/** 升級敘述裡的數字（+6 攻擊力、造成 9 點傷害……） */
const upNum = (id: string) => {
  const m = /([+＋]|造成)\s*(\d+)/.exec(bgCard(id).text);
  return m ? Number(m[2]) : 0;
};
const kindOf = (id: string) => id.slice(CRUISER.length, CRUISER.length + 1);

export const RAYNOR_SPELLS: SpellSpec[] = UPGRADE_KINDS.flatMap((k) =>
  upgradeIds(k).map(
    (id): SpellSpec => ({
      id,
      target: false,
      cast: ({ p }) => {
        const n = upNum(id);
        const add = (key: string, v: number) => (p.c[key] = (p.c[key] ?? 0) + v);
        switch (kindOf(id)) {
          case 'a':
            for (const m of cruisers(p)) m.atk += n;
            break;
          case 'b':
            for (const m of cruisers(p)) m.hp += n;
            break;
          case 'c':
            add('bcY', n);
            break;
          case 'd':
            add('bcR', n);
            break;
          case 'f':
            p.c.bcFree = 1;
            break;
          case 'h':
            p.c.bcBunker = 1;
            break;
          case 'i':
            p.c.bcMissile = 1;
            break;
          case 'j':
            for (const m of cruisers(p)) {
              m.reborn = true;
              if (!m.gifts?.includes('BG36_MidGameEffect_000t12')) (m.gifts ??= []).push('BG36_MidGameEffect_000t12');
            }
            break;
        }
      },
      v: () => 8,
    }),
  ),
);
export const RAYNOR_IDS = new Set(RAYNOR_SPELLS.map((s) => s.id));

