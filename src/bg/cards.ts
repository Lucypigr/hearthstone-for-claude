// 英雄戰場的手下效果（每張卡手動實作；g = 1 一般、2 金卡）
// 只收錄效果能完整執行的卡；沒有實作的卡不會出現在酒館裡
import type { Combat, MinionSpec } from './api';
import { isRace, racesOf, tierOf } from './data';
import { BOUNTIES, isTavernSpell, TAVERN_SPELLS, spellCostOf } from './spells';
import { BONUS_KEYWORDS, type BMinion, type Keyword, type Tribe } from './types';

const BEETLE = 'BG28_603t';
const SKELETON = 'BG_ICC_026t';
const MICROBOT = 'BG_BOT_312t';
const KNIGHT = 'BG25_008';
const LOBSTER = 'BG36_202';
const GEM = 'BG20_GEM';
const COIN = 'BG28_810';
const FORTIFY = 'BG28_503';
const GEM_DAY = 'BG31_893';
const SHINY_RING = 'BG28_168';
const GEM_CONFISCATION = 'BG28_698';
const BARRAGE = 'BG34_689';
const CONFLAG = 'BG35_910';
const ABSORB = 'BG35_911';
const TEA_SET = 'BG28_888';
const SATELLITE = 'BG31_171t';

const race = (m: BMinion, t: Tribe) => isRace(m.id, t);

function summonAt(c: Combat, self: BMinion, id: string, count: number, golden: boolean, index: number) {
  const s = c.side(self);
  for (let k = 0; k < count; k++) c.summon(s, c.make(id, golden), index + k);
}

/** 戰鬥中的鮮血寶石 */
function combatGem(c: Combat, m: BMinion, times = 1) {
  const s = c.side(m);
  c.buff(m, (1 + c.cnt(s, 'gemA')) * times, (1 + c.cnt(s, 'gemH')) * times);
}

/** 手牌中攻擊力最高的手下（「只限這場戰鬥」召喚它的複製） */
function summonFromHand(c: Combat, self: BMinion, filter: (m: BMinion) => boolean) {
  const s = c.side(self);
  const hand = c.hand(s).filter(filter);
  if (!hand.length) return;
  const best = hand.reduce((a, b) => (b.atk > a.atk ? b : a));
  const copy = c.make(best.id, best.golden);
  Object.assign(copy, { atk: best.atk, hp: best.hp, taunt: best.taunt, shield: best.shield, windfury: best.windfury, venom: best.venom, reborn: best.reborn, temp: true });
  c.summon(s, copy);
}

const n3 = (r: { p: { c: Record<string, number> } }) => Math.floor((r.p.c.spells ?? 0) / 3);

export const MINIONS: MinionSpec[] = [
  // —— 旅店等級 1 ——
  { id: 'BG31_803', deathrattle: (c, s, g, i) => summonAt(c, s, BEETLE, 1, g > 1, i), syn: 'BEAST', val: 3 },
  { id: 'BG36_200', rally: (c, s, g) => void c.summon(c.side(s), c.make('BG36_200t', g > 1)), syn: 'BEAST', val: 2 },
  {
    id: 'BGS_004',
    onPlay: (r, s, m, g) => {
      if (!race(m, 'DEMON')) return;
      r.hurtHero(1);
      r.buff(s, 2 * g, 2 * g);
    },
    syn: 'DEMON',
    scale: 2,
  },
  { id: 'BG29_888', rally: (c, s, g) => c.buff(s, 2 * g, 0), val: 2 },
  { id: 'BG31_815', battlecry: (r, _s, g) => r.tavernBuff(g, g, 'ELEMENTAL'), syn: 'ELEMENTAL', val: 1 },
  { id: 'BGS_119' },
  { id: 'BG26_146', magnetic: true, endTurn: (r, s, g) => r.buff(s, 0, g), scale: 1 },
  { id: 'BG29_611', deathrattle: (c, s, g, i) => summonAt(c, s, MICROBOT, 1, g > 1, i), val: 1 },
  {
    id: 'BG31_149',
    battlecry: (r, s, g) => {
      for (let k = 0; k < g; k++) {
        const kw = r.pick(BONUS_KEYWORDS.filter((x) => !s[x]));
        if (kw) r.giveKw(s, kw);
      }
    },
    val: 2,
  },
  {
    id: 'BG32_330',
    socInHand: (c, s, side) => {
      const copy = c.make(s.id, s.golden);
      Object.assign(copy, { atk: s.atk, hp: s.hp, temp: true });
      c.summon(side, copy);
    },
    val: 1,
  },
  { id: 'BG26_135', battlecry: (r, _s, g) => void (r.p.nextGold += g), val: 2 },
  { id: 'BG20_100', battlecry: (r, _s, g) => r.getGems(2 * g), syn: 'QUILBOAR', val: 3 },
  { id: 'BG33_886', rally: (c, s, g) => combatGem(c, s, g), syn: 'QUILBOAR', val: 2 },
  { id: 'BG25_001' },
  { id: 'BG25_013', onFriendDeath: (c, s, _d, g) => c.buff(s, g, 0), syn: 'UNDEAD', val: 2 },
  { id: 'BG28_300', deathrattle: (c, s, g, i) => summonAt(c, s, SKELETON, 2, g > 1, i), syn: 'UNDEAD', val: 3 },
  { id: 'BG23_000', spellcraft: 'BG23_000t', syn: 'NAGA', val: 2 },

  // —— 旅店等級 2 ——
  {
    id: 'BG26_805',
    soc: (c, s, g) => {
      const side = c.side(s);
      c.counter(side, '~beastA', g);
    },
    syn: 'BEAST',
    val: 3,
  },
  {
    id: 'BG31_801',
    battlecry: (r, _s, g) => {
      r.counter('beetleA', 2 * g);
      r.counter('beetleH', g);
    },
    deathrattle: (c, s, g, i) => summonAt(c, s, BEETLE, 1, g > 1, i),
    syn: 'BEAST',
    val: 4,
  },
  {
    id: 'BG23_357',
    target: (s, t) => t !== s && race(t, 'DEMON'),
    battlecry: (r, _s, g, t) => {
      if (!t) return;
      for (let k = 0; k < g; k++) {
        const food = r.pick(r.p.shop);
        if (food) r.consume(t, food);
      }
    },
    syn: 'DEMON',
    val: 4,
  },
  {
    id: 'BG26_963',
    battlecry: (r, s, g) => {
      for (const m of r.p.board) if (m !== s && race(m, 'DRAGON')) r.buff(m, g, g);
    },
    soc: (c, s, g) => {
      for (const m of c.friends(s)) if (m !== s && race(m, 'DRAGON')) c.buff(m, g, g);
    },
    syn: 'DRAGON',
    val: 4,
  },
  { id: 'BGS_034', val: 2 },
  {
    id: 'BG31_816',
    text: (m, p) => `當你出售此手下時，賦予你的手下+${(1 + (p?.c.baller ?? 0)) * (m.golden ? 2 : 1)}攻擊力。強化你之後的球手`,
    onSell: (r, s, g) => {
      const n = (1 + (r.p.c.baller ?? 0)) * g;
      for (const m of r.p.board) if (m !== s) r.buff(m, n, 0);
      r.counter('baller', 1);
    },
    val: 4,
  },
  {
    id: 'BG31_818',
    text: (m, p) => `當你出售此手下時，賦予你的手下+${(1 + (p?.c.baller ?? 0)) * (m.golden ? 2 : 1)}生命值。強化你之後的球手`,
    onSell: (r, s, g) => {
      const n = (1 + (r.p.c.baller ?? 0)) * g;
      for (const m of r.p.board) if (m !== s) r.buff(m, 0, n);
      r.counter('baller', 1);
    },
    val: 4,
  },
  { id: 'BGS_115', onSell: (r, _s, g) => r.getMinion('BGS_115t', g > 1), syn: 'ELEMENTAL', val: 3 },
  {
    id: 'BG31_177',
    onPlay: (r, _s, m, g) => {
      if (race(m, 'MECHANICAL')) r.buff(m, 3 * g, g);
    },
    syn: 'MECHANICAL',
    val: 2,
    scale: 2,
  },
  {
    id: 'BG22_202',
    onSell: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getRandom((id) => isRace(id, 'MURLOC'));
    },
    syn: 'MURLOC',
    val: 4,
  },
  {
    id: 'BG29_300',
    onDamaged: (c, s, _n, g) => {
      const m = c.pick(c.hand(c.side(s)));
      if (m) {
        m.atk += 2 * g;
        m.hp += g;
      }
    },
    syn: 'MURLOC',
    val: 3,
  },
  { id: 'BG34_140', rally: (c, s) => summonFromHand(c, s, (m) => race(m, 'MURLOC')), syn: 'MURLOC', val: 2 },
  {
    id: 'BG23_002',
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getSpell(COIN);
    },
    val: 3,
  },
  { id: 'BG31_924', spellcraft: 'BG31_924t', syn: 'NAGA', val: 3 },
  {
    id: 'BG24_715',
    text: (m) => `當你出售此手下時，<b>發現</b>一個旅店等級${Math.min(6, 1 + m.n)}的手下<i>（每回合強化！）</i>`,
    endTurn: (_r, s) => void (s.n = Math.min(5, s.n + 1)),
    onSell: (r, s) => {
      const t = Math.min(6, 1 + s.n);
      r.discover((id) => tierOf(id) === t, `發現一個旅店等級 ${t} 的手下`);
    },
    val: 2,
  },
  {
    id: 'BG32_235',
    endTurn: (r, s, g) => {
      const b = r.p.board;
      const i = b.indexOf(s);
      const times = 1 + b.filter((m) => m.golden).length;
      for (const m of [b[i - 1], b[i + 1]]) if (m) r.buff(m, g * times, 0);
    },
    syn: 'PIRATE',
    scale: 2,
  },
  {
    id: 'BG20_101',
    rally: (c, s, g) => {
      for (let k = 0; k < g; k++) c.give(c.side(s), GEM);
    },
    syn: 'QUILBOAR',
    val: 3,
  },
  {
    id: 'BG33_430',
    onFriendAttack: (c, _s, m, g) => combatGem(c, m, g),
    syn: 'QUILBOAR',
    val: 4,
  },
  {
    id: KNIGHT,
    aura: (cnt, _s, g) => [4 * g * (cnt.knights ?? 0), 2 * g * (cnt.knights ?? 0)],
    onDeath: (c, s) => c.counter(c.side(s), 'knights', 1),
    syn: 'UNDEAD',
    val: 2,
  },
  { id: 'BG25_011', battlecry: (r, _s, g) => r.counter('undeadA', g), syn: 'UNDEAD', val: 3 },
  {
    id: 'BG25_022',
    deathrattle: (c, s, g) => {
      const m = c.pick(c.friends(s).filter((x) => race(x, 'UNDEAD')));
      if (m) c.buff(m, g, 2 * g);
    },
    syn: 'UNDEAD',
    val: 2,
  },

  // —— 旅店等級 3 ——
  {
    id: LOBSTER,
    text: (m, p) => {
      const n = p?.c.lobster ?? 0;
      const g = m.golden ? 2 : 1;
      return `<b>死亡之聲：</b>賦予一個隨機友方野獸+${(2 + 2 * n) * g}/+${(1 + n) * g}。強化你之後的美味龍蝦`;
    },
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      const n = c.cnt(side, 'lobster');
      const m = c.pick(c.friends(s).filter((x) => race(x, 'BEAST')));
      if (m) c.buff(m, (2 + 2 * n) * g, (1 + n) * g);
      c.counter(side, 'lobster', 1);
    },
    syn: 'BEAST',
    val: 3,
  },
  {
    id: 'BG36_207',
    rally: (c, s, g) => {
      for (const m of c.friends(s)) if (m !== s) c.buff(m, 4 * g, g);
    },
    val: 6,
  },
  { id: 'BG26_524', syn: 'DEMON', val: 2 },
  {
    id: 'BG33_155',
    onFriendDealt: (c, s, m, g) => {
      if (race(m, 'DEMON')) c.perm(s, 2 * g, 2 * g);
    },
    syn: 'DEMON',
    val: 4,
  },
  {
    id: 'BG24_500',
    soc: (c, s, g) => {
      const m = c.pick(c.friends(s).filter((x) => x !== s && race(x, 'DRAGON')));
      if (!m) return;
      c.buff(m, 2 * g, 2 * g);
      c.giveKw(m, 'shield');
    },
    syn: 'DRAGON',
    val: 5,
  },
  {
    id: 'BG29_816',
    onFriendAttack: (c, _s, m, g) => {
      if (race(m, 'DRAGON')) c.buff(m, 3 * g, g);
    },
    syn: 'DRAGON',
    val: 5,
  },
  {
    id: 'BGS_126',
    afterAttack: (c, s, g, t, killed, excess) => {
      if (!killed || excess <= 0) return;
      const foes = c.board(c.side(t) as 0 | 1);
      const i = foes.indexOf(t);
      const near = [foes[i - 1], foes[i + 1]].filter((m) => m && !m.dead);
      for (let k = 0; k < g; k++) {
        const m = c.pick(near);
        if (m) c.damage(m, excess, s);
      }
    },
    val: 4,
  },
  { id: 'BG26_147', magnetic: true, startTurn: (r, _s, g) => r.gainGold(g), val: 3, scale: 2 },
  { id: 'BG34_405', tauntWhileShield: true, avenge: [3, (c, s) => c.giveKw(s, 'shield')], val: 4 },
  { id: 'BG_BOT_911', magnetic: true, val: 4 },
  { id: 'BG27_556', soc: (c, s) => summonFromHand(c, s, (m) => race(m, 'MURLOC')), syn: 'MURLOC', val: 3 },
  { id: 'BG23_004', spellcraft: 'BG23_004t', syn: 'NAGA', val: 4 },
  { id: 'BG23_007', spellcraft: 'BG23_007t', syn: 'NAGA', val: 4 },
  { id: 'BGS_131', val: 4 },
  {
    id: 'BG28_303',
    target: (s, t) => t !== s && race(t, 'UNDEAD'),
    battlecry: (r, _s, g, t) => {
      if (!t) return;
      r.destroy(t);
      for (let k = 0; k < g; k++) r.getMinion(t.id, false);
    },
    syn: 'UNDEAD',
    val: 2,
  },
  { id: 'BG25_010', deathrattle: (c, s, g, i) => summonAt(c, s, 'BG25_010t', 1, g > 1, i), syn: 'UNDEAD', val: 3 },
  {
    id: 'BG28_309',
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) {
        const m = c.pick(c.friends(s).filter((x) => x !== s && race(x, 'UNDEAD') && !x.reborn));
        if (m) c.giveKw(m, 'reborn');
      }
    },
    syn: 'UNDEAD',
    val: 4,
  },
  { id: 'BG30_125', deathrattle: (c, s, g, i) => summonAt(c, s, SKELETON, 3, g > 1, i), syn: 'UNDEAD', val: 4 },
  { id: 'BG_DEEP_015', magnetic: true, magnetTo: ['MECHANICAL', 'UNDEAD'], val: 3 },

  // —— 旅店等級 4 ——
  {
    id: 'BG26_802',
    onSummon: (c, _s, m, g) => {
      if (race(m, 'BEAST')) c.buff(m, m.atk * g, 0);
    },
    syn: 'BEAST',
    val: 5,
  },
  { id: 'BG36_204', rally: (c, s, g) => { for (let k = 0; k < g; k++) c.giveRandom(c.side(s), (id) => isRace(id, 'BEAST')); }, syn: 'BEAST', val: 4 },
  { id: 'BG36_210', rally: (c, s, g) => void c.summon(c.side(s), c.make(LOBSTER, g > 1)), syn: 'BEAST', val: 5 },
  {
    id: 'BG36_211',
    onFriendAttack: (c, s, m, g) => {
      if (!race(m, 'BEAST')) return;
      for (const x of c.friends(s)) if (race(x, 'BEAST')) c.buff(x, 2 * g, g);
    },
    syn: 'BEAST',
    val: 6,
  },
  {
    id: 'BG26_525',
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.discover((id) => isRace(id, 'DEMON'), '發現一個惡魔（你的英雄會受到等同其旅店等級的傷害）', false, true);
    },
    syn: 'DEMON',
    val: 4,
  },
  {
    id: 'BG31_812',
    onPlay: (r, _s, m) => {
      if (race(m, 'ELEMENTAL')) r.tmpBuff(m, 0, 0, ['shield']);
    },
    syn: 'ELEMENTAL',
    val: 3,
  },
  { id: 'BG34_865', battlecry: (r, _s, g) => r.counter('refreshBuff', g), syn: 'ELEMENTAL', val: 4, scale: 3 },
  { id: 'BGS_116', battlecry: (r, _s, g) => void (r.p.freeRefreshes += 2 * g), syn: 'ELEMENTAL', val: 2 },
  {
    id: 'BGS_123',
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getRandom((id) => isRace(id, 'ELEMENTAL'));
    },
    syn: 'ELEMENTAL',
    val: 4,
  },
  {
    id: 'BG34_500',
    endTurn: (r, s, g) => {
      for (let k = 0; k < g; k++) {
        if (!r.p.shop.length) return;
        const food = r.p.shop.reduce((a, b) => (b.hp > a.hp ? b : a));
        r.consume(s, food);
      }
    },
    val: 2,
    scale: 6,
  },
  {
    id: 'BG36_181',
    text: (m, p) => {
      const n = (2 + (p?.c.baller ?? 0)) * (m.golden ? 2 : 1);
      return `當你出售此手下時，賦予你的手下+${n}/+${n}。強化你之後的球手`;
    },
    onSell: (r, s, g) => {
      const n = (2 + (r.p.c.baller ?? 0)) * g;
      for (const m of r.p.board) if (m !== s) r.buff(m, n, n);
      r.counter('baller', 1);
    },
    val: 8,
  },
  {
    id: 'BG26_137',
    inHandOnPlay: (r, s, m, g) => {
      if (race(m, 'MURLOC')) r.buff(s, 6 * g, 6 * g);
    },
    syn: 'MURLOC',
    val: 4,
  },
  {
    id: 'BG36_703',
    onSpell: (r, s, t, g) => {
      if (t !== s) return;
      const m = r.p.hand.find((h) => h.kind === 'minion');
      if (m && m.kind === 'minion') r.buff(m.m, 8 * g, 8 * g);
    },
    syn: 'MURLOC',
    val: 3,
  },
  {
    id: 'BG26_505',
    onSpell: (r, s, t, _g, spell) => {
      if (t !== s || s.n > 0 || !spell.endsWith('t') || !SPELLCRAFT_SPELLS.has(spell)) return;
      s.n = 1;
      r.getSpell(spell, 1, true);
    },
    startTurn: (_r, s) => void (s.n = 0),
    syn: 'NAGA',
    val: 5,
  },
  { id: 'BG24_018', sellPrice: (p) => (p.results[p.results.length - 1] === 'loss' ? 5 : 1), val: 2 },
  {
    id: 'BG25_016',
    rally: (_c, _s, _g, t) => {
      t.reborn = false;
      t.taunt = false;
    },
    val: 5,
  },
  { id: 'BG34_604', rally: (c, s, g, t) => c.buff(s, t.atk * g, 0), val: 6 },
  { id: 'BG36_372', aura: (_cnt, _s, g, hp) => (hp <= 15 ? [30 * g, 30 * g] : [0, 0]), val: 4 },
  {
    id: 'BG36_620',
    soc: (c, s, g) => {
      const all = [...c.friends(s), ...c.enemies(s)].filter((m) => m !== s);
      for (let k = 0; k < g; k++) for (const m of all) if (!m.dead) c.damage(m, 3, s);
    },
    val: 6,
  },
  {
    id: 'BG26_810',
    text: (m) => `每當你花費5枚金幣，賦予你的海盜+${3 * (m.golden ? 2 : 1)}/+${m.golden ? 2 : 1}<i>（還差${5 - m.n}枚金幣！）</i>`,
    onSpend: (r, s, amount, g) => {
      s.n += amount;
      while (s.n >= 5) {
        s.n -= 5;
        for (const m of r.p.board) if (race(m, 'PIRATE')) r.buff(m, 3 * g, g);
      }
    },
    syn: 'PIRATE',
    val: 2,
    scale: 6,
  },
  {
    id: 'BG26_814',
    target: (_s, t) => race(t, 'PIRATE'),
    battlecry: (r, _s, g, t) => {
      if (t) r.buff(t, 0, (2 + (r.p.c.spent ?? 0)) * g);
    },
    syn: 'PIRATE',
    val: 6,
  },
  { id: 'BG26_817', cleave: true, val: 5 },
  { id: 'BG36_524', aura: (cnt, _s, g) => [7 * g * (cnt.goldens ?? 0), 7 * g * (cnt.goldens ?? 0)], syn: 'PIRATE', val: 2 },
  {
    id: 'BG20_104',
    rally: (c, s, g) => {
      for (const m of c.friends(s)) if (m !== s) combatGem(c, m, g);
    },
    syn: 'QUILBOAR',
    val: 6,
  },
  {
    id: 'BG28_583',
    onGem: (r, s, g) => {
      const others = r.p.board.filter((m) => m !== s && m.id !== s.id);
      for (let k = 0; k < g; k++) {
        const m = r.pick(others);
        if (m) r.gem(m);
      }
    },
    syn: 'QUILBOAR',
    val: 4,
  },
  { id: 'BG30_121', syn: 'QUILBOAR', val: 3, scale: 2 },
  {
    id: 'BG32_340',
    target: (s, t) => t !== s && race(t, 'UNDEAD'),
    battlecry: (r, _s, _g, t) => {
      if (!t) return;
      r.destroy(t);
      r.discover((id) => isRace(id, 'UNDEAD'), '發現一個不死族');
    },
    syn: 'UNDEAD',
    val: 2,
  },
  { id: 'BG34_690', deathrattle: (c, s, g) => c.counter(c.side(s), 'undeadA', 2 * g), syn: 'UNDEAD', val: 5 },

  // —— 旅店等級 5 ——
  {
    id: 'BG31_809',
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      c.counter(side, 'beetleA', 5 * g);
      c.counter(side, 'beetleH', 5 * g);
      summonAt(c, s, BEETLE, 1, g > 1, i);
    },
    syn: 'BEAST',
    val: 8,
  },
  {
    id: 'BG35_602',
    text: (m) => `每當你召喚一個野獸，賦予它+${(3 + m.n) * (m.golden ? 2 : 1)}攻擊力並永久強化此手下`,
    onSummon: (c, s, m, g) => {
      if (!race(m, 'BEAST') || m === s) return;
      c.buff(m, (3 + s.n) * g, 0);
      c.bump(s);
    },
    syn: 'BEAST',
    val: 6,
  },
  { id: 'BG35_604', deathrattle: (c, s, g, i) => summonAt(c, s, 'BG19_010', 2, g > 1, i), syn: 'BEAST', val: 8 },
  { id: 'BG19_010', deathrattle: (c, s, g, i) => summonAt(c, s, 'BG19_010t', 1, g > 1, i) },
  {
    id: 'BGS_008',
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      for (let k = 0; k < 2 * g; k++) {
        const id = c.pick(DEATHRATTLE_POOL.filter((x) => x !== 'BGS_008' && c.inLobby(x)));
        if (id) c.summon(side, c.make(id), i + k);
      }
    },
    syn: 'BEAST',
    val: 8,
  },
  {
    id: 'BGS_018',
    deathrattle: (c, s, g) => {
      for (const m of c.friends(s)) if (race(m, 'BEAST')) c.buff(m, 7 * g, 7 * g);
    },
    syn: 'BEAST',
    val: 7,
  },
  {
    id: 'BG21_004',
    onPlay: (r, s, m, g) => {
      if (!race(m, 'DEMON')) return;
      for (let k = 0; k < g; k++) {
        const food = r.pick(r.p.shop);
        if (food) r.consume(s, food);
      }
    },
    syn: 'DEMON',
    val: 2,
    scale: 4,
  },
  {
    id: 'BG26_523',
    onHeroHurt: (r, _s, g, _n) => {
      for (const m of r.p.board) if (race(m, 'DEMON')) r.buff(m, 4 * g, 4 * g);
    },
    syn: 'DEMON',
    val: 3,
    scale: 6,
  },
  {
    id: 'BG36_364',
    text: (m) => `<b>起始戰鬥：</b>賦予你的手下+${(4 + m.n) * (m.golden ? 2 : 1)}/+${(3 + m.n) * (m.golden ? 2 : 1)}<i>（友方手下失去<b>聖盾</b>後永久強化！）</i>`,
    soc: (c, s, g) => {
      for (const m of c.friends(s)) c.buff(m, (4 + s.n) * g, (3 + s.n) * g);
    },
    onShieldLost: (c, s) => c.bump(s),
    val: 10,
  },
  {
    id: 'BGS_041',
    afterBattlecry: (r, _s, _m, g) => {
      for (const x of r.p.board) if (race(x, 'DRAGON')) r.buff(x, 2 * g, 2 * g);
    },
    syn: 'DRAGON',
    val: 2,
    scale: 6,
  },
  {
    id: 'BG36_851',
    text: (m) => {
      const g = m.golden ? 2 : 1;
      return `每當你打出一個機械，賦予它+${(2 + m.n) * g}/+${(3 + m.n) * g}並強化此手下`;
    },
    onPlay: (r, s, m, g) => {
      if (!race(m, 'MECHANICAL')) return;
      r.buff(m, (2 + s.n) * g, (3 + s.n) * g);
      s.n++;
    },
    syn: 'MECHANICAL',
    val: 3,
    scale: 6,
  },
  {
    id: 'BG31_148',
    battlecry: (r, s, g) => {
      const kws = new Set<Keyword>();
      for (const m of r.p.board) for (const k of BONUS_KEYWORDS) if (m[k]) kws.add(k);
      for (const m of r.p.board) if (m !== s) r.buff(m, (3 + kws.size) * g, (2 + kws.size) * g);
    },
    val: 12,
  },
  {
    id: 'BG33_318',
    rally: (c, s, g) => {
      for (let k = 0; k < g; k++) {
        const m = c.pick(c.friends(s).filter((x) => x !== s && race(x, 'MURLOC') && !x.venom));
        if (m) c.giveKw(m, 'venom');
      }
    },
    syn: 'MURLOC',
    val: 7,
  },
  {
    id: 'BG34_142',
    soc: (c, s, g) => {
      const hand = c.hand(c.side(s));
      if (hand.length) c.buff(s, Math.max(...hand.map((m) => m.atk)) * g, 0);
    },
    syn: 'MURLOC',
    val: 5,
  },
  {
    id: 'BG36_704',
    onSpell: (r, _s, t, g) => {
      if (!t || !race(t, 'MURLOC')) return;
      for (const m of r.p.board) if (race(m, 'MURLOC')) r.buff(m, 3 * g, 3 * g);
      for (const h of r.p.hand) if (h.kind === 'minion' && race(h.m, 'MURLOC')) r.buff(h.m, 3 * g, 3 * g);
    },
    syn: 'MURLOC',
    val: 3,
    scale: 6,
  },
  {
    id: 'BGS_020',
    battlecry: (r, s) => {
      if (r.p.board.some((m) => m !== s && race(m, 'MURLOC'))) r.discover((id) => isRace(id, 'MURLOC'), '發現一個魚人');
    },
    syn: 'MURLOC',
    val: 6,
  },
  { id: 'BG23_008', spellcraft: 'BG23_008t', syn: 'NAGA', val: 4 },
  {
    id: 'BG31_925',
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      const b = Math.floor(c.cnt(side, 'spells') / 3);
      for (const m of c.friends(s)) if (race(m, 'NAGA')) c.buff(m, (2 + b) * g, (1 + b) * g);
    },
    syn: 'NAGA',
    val: 6,
  },
  {
    id: 'BG23_318',
    deathrattle: (c, s) => {
      if (s.killer === undefined) return;
      const k = c.enemies(s).find((m) => m.uid === s.killer);
      if (k) c.destroy(k);
    },
    val: 6,
  },
  { id: 'BG25_354', val: 3 },
  { id: 'BG26_ICC_901', val: 3 },
  { id: 'BG_LOE_077', val: 3 },
  {
    id: 'BG32_231',
    target: (_s, t) => race(t, 'PIRATE') && !t.golden && tierOf(t.id) <= 4,
    battlecry: (r, _s, _g, t) => {
      if (!t) return;
      const base = r.make(t.id, true);
      t.golden = true;
      t.atk += base.atk / 2;
      t.hp += base.hp / 2;
      r.p.c.goldens = (r.p.c.goldens ?? 0) + 1;
    },
    syn: 'PIRATE',
    val: 8,
  },
  {
    id: 'BG33_828',
    deathrattle: (c, s, g) => {
      for (const m of c.friends(s)) {
        if (m.golden) c.perm(m, 6 * g, 6 * g);
        else c.buff(m, 6 * g, 6 * g);
      }
    },
    syn: 'PIRATE',
    val: 10,
  },
  {
    id: 'BG33_883',
    rally: (c, s, g) => {
      const side = c.side(s);
      c.perm(s, 4 * (1 + c.cnt(side, 'gemA')) * g, 4 * (1 + c.cnt(side, 'gemH')) * g);
    },
    syn: 'QUILBOAR',
    val: 6,
    scale: 8,
  },
  {
    id: 'BG33_885',
    rally: (c, s, g) => {
      c.counter(c.side(s), 'gemA', g);
      c.counter(c.side(s), 'gemH', 2 * g);
    },
    syn: 'QUILBOAR',
    val: 4,
    scale: 4,
  },
  { id: 'BG25_009', deathrattle: (c, s, g, i) => summonAt(c, s, KNIGHT, 1, g > 1, i), syn: 'UNDEAD', val: 6 },
  {
    id: 'BG34_403',
    avenge: [
      5,
      (c, s, g) => {
        const m = c.summon(c.side(s), c.make(KNIGHT, g > 1));
        if (m) c.attackNow(m);
      },
    ],
    syn: 'UNDEAD',
    val: 6,
  },
  {
    id: 'BG36_514',
    onFriendReborn: (c, s, _m, g) => {
      c.giveKw(s, 'shield');
      c.buff(s, 8 * g, 8 * g);
    },
    syn: 'UNDEAD',
    val: 6,
  },

  // —— 旅店等級 6 ——
  {
    id: 'BG36_208',
    afterFriendAttack: (c, s, m, g) => {
      if (!SPEC.get(m.id)?.rally) return;
      for (let k = 0; k < g; k++) {
        const d = c.friends(s).find((x) => SPEC.get(x.id)?.deathrattle || x.mags.some((y) => SPEC.get(y.id)?.deathrattle));
        if (d) c.deathrattle(d);
      }
    },
    val: 6,
  },
  {
    id: 'BG36_209',
    afterFriendAttack: (c, s, _m, g) => {
      const side = c.side(s);
      c.counter(side, 'beetleA', 4 * g);
      c.counter(side, 'beetleH', 4 * g);
    },
    deathrattle: (c, s, g, i) => summonAt(c, s, BEETLE, 1, g > 1, i),
    syn: 'BEAST',
    val: 8,
  },
  { id: 'BG36_849', rally: (c, s) => c.giveKw(s, 'shield'), soc: (c, s) => c.attackNow(s), syn: 'DRAGON', val: 8 },
  {
    id: 'BG31_810',
    text: (m) => {
      const n = (3 + m.n) * (m.golden ? 2 : 1);
      return `<b>起始戰鬥：</b>賦予你的其他元素+${n}/+${n}<i>（你打出元素後強化！）</i>`;
    },
    soc: (c, s, g) => {
      for (const m of c.friends(s)) if (m !== s && race(m, 'ELEMENTAL')) c.buff(m, (3 + s.n) * g, (3 + s.n) * g);
    },
    onPlay: (_r, s, m) => {
      if (race(m, 'ELEMENTAL')) s.n++;
    },
    syn: 'ELEMENTAL',
    val: 8,
  },
  {
    id: 'BG36_352',
    text: (m) => `在你打出4個元素後，獲得酒館中生命值最高的手下的身材<i>（還差${4 - (m.n % 4)}個！）</i>`,
    onPlay: (r, s, m, g) => {
      if (!race(m, 'ELEMENTAL')) return;
      s.n++;
      if (s.n % 4 !== 0 || !r.p.shop.length) return;
      const best = r.p.shop.reduce((a, b) => (b.hp > a.hp ? b : a));
      r.buff(s, best.atk * g, best.hp * g);
    },
    syn: 'ELEMENTAL',
    val: 4,
    scale: 4,
  },
  {
    id: 'BG26_152',
    endTurn: (r, _s, g) => {
      for (const m of r.p.board) if (m.mags.length) r.buff(m, 4 * g * m.mags.length, 5 * g * m.mags.length);
    },
    syn: 'MECHANICAL',
    val: 3,
    scale: 6,
  },
  { id: 'BG35_342', aura: (cnt, _s, g) => [4 * g * (cnt.drs ?? 0), 2 * g * (cnt.drs ?? 0)], val: 4 },
  {
    id: 'BG22_403',
    endTurn: (r, s, g) => {
      const b = r.p.board;
      const i = b.indexOf(s);
      for (let k = 0; k < g; k++) for (const m of [b[i - 1], b[i + 1]]) if (m) r.battlecry(m);
    },
    syn: 'MURLOC',
    val: 4,
    scale: 6,
  },
  {
    id: 'BG26_354',
    soc: (c, s, g) => {
      for (const m of c.hand(c.side(s))) c.buff(s, m.atk * g, m.hp * g);
    },
    syn: 'MURLOC',
    val: 6,
  },
  {
    id: 'BG31_035',
    onPlay: (r, s, m, g) => {
      if (race(m, 'NAGA')) r.buff(s, (1 + n3(r)) * g, (1 + n3(r)) * g);
    },
    syn: 'NAGA',
    val: 2,
    scale: 4,
  },
  {
    id: 'BG36_622',
    onSpell: (r, _s, t, g) => {
      if (!t || !race(t, 'NAGA')) return;
      for (const m of r.p.board) r.buff(m, 2 * g, 3 * g);
    },
    syn: 'NAGA',
    val: 3,
    scale: 8,
  },
  { id: 'BG35_883', val: 3, scale: 4 },
  {
    id: 'BGS_040',
    deathrattle: (c, s, g) => {
      const ds = c.friends(s).filter((m) => race(m, 'DRAGON') && !m.shield);
      for (let k = 0; k < 3 * g && ds.length; k++) {
        const m = ds.splice(Math.floor(c.rand() * ds.length), 1)[0];
        c.giveKw(m, 'shield');
      }
    },
    syn: 'DRAGON',
    val: 6,
  },
  {
    id: 'BG36_343',
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getRandom((id) => tierOf(id) === 4, true);
    },
    val: 10,
  },
  {
    id: 'BG23_017',
    battlecry: (r, _s, g) => {
      r.counter('gemA', 2 * g);
      r.counter('gemH', g);
    },
    deathrattle: (c, s, g) => {
      c.counter(c.side(s), 'gemA', 2 * g);
      c.counter(c.side(s), 'gemH', g);
    },
    syn: 'QUILBOAR',
    val: 4,
    scale: 4,
  },
  {
    id: 'BG36_515',
    onFriendReborn: (c, s, m, g) => {
      const u = [...c.friends(s)].reverse().find((x) => race(x, 'UNDEAD'));
      if (u) c.buff(u, m.atk * g, m.atk * g);
    },
    syn: 'UNDEAD',
    val: 6,
  },
  // —— 酒館法術相關 ——
  { id: 'BG31_330', battlecry: (r, _s, g) => r.counter('spellDisc', g), syn: 'DEMON', val: 2 }, // 不祥預言者
  {
    id: 'BG27_000', // 鋼鐵場地管理員
    battlecry: (r, _s, g) => {
      for (let k = 0; k < 2 * g; k++) r.getSpell(FORTIFY);
    },
    val: 6,
  },
  {
    id: 'BG32_237', // 無畏的植物學家
    choices: ['你的酒館法術在本賽局中額外 +1 攻擊力', '你的酒館法術在本賽局中額外 +1 生命值'],
    battlecry: (r, _s, g, _t, c) => {
      if (c !== 1) r.counter('tsA', g);
      if (c !== 0) r.counter('tsH', g);
    },
    val: 3,
    scale: 2,
  },
  {
    id: 'BG27_084', // 活潑聖甲蟲
    choices: ['賦予一個野獸 +1/+1 與復生', '賦予一個野獸 +4 攻擊力與風怒'],
    target: (_s, t) => race(t, 'BEAST'),
    battlecry: (r, _s, g, t, c) => {
      if (!t) return;
      if (c !== 1) {
        r.buff(t, g, g);
        r.giveKw(t, 'reborn');
      }
      if (c !== 0) {
        r.buff(t, 4 * g, 0);
        r.giveKw(t, 'windfury');
      }
    },
    syn: 'BEAST',
    val: 5,
  },
  {
    id: 'BG31_320', // 坑道礦工
    choices: ['獲得 2 顆鮮血寶石', '獲得一張寶石日'],
    battlecry: (r, _s, g, _t, c) => {
      if (c !== 1) r.getGems(2 * g);
      if (c !== 0) for (let k = 0; k < g; k++) r.getSpell(GEM_DAY);
    },
    syn: 'QUILBOAR',
    val: 3,
  },
  {
    id: 'BG30_123', // 無畏饕客
    choices: ['你的鮮血寶石在本賽局中額外 +1/+1', '獲得 4 顆鮮血寶石'],
    battlecry: (r, _s, g, _t, c) => {
      if (c !== 1) {
        r.counter('gemA', g);
        r.counter('gemH', g);
      }
      if (c !== 0) r.getGems(4 * g);
    },
    syn: 'QUILBOAR',
    val: 5,
  },
  {
    id: 'BG36_330', // 狡猾的滲透者
    choices: ['獲得 2 次免費刷新', '獲得 3 顆鮮血寶石'],
    battlecry: (r, _s, g, _t, c) => {
      if (c !== 1) r.p.freeRefreshes += 2 * g;
      if (c !== 0) r.getGems(3 * g);
    },
    syn: 'QUILBOAR',
    val: 4,
  },
  {
    id: 'BG36_332', // 陷阱獵手
    choices: ['隨機獲得一個野豬人', '你的金幣上限 +1'],
    battlecry: (r, _s, g, _t, c) => {
      if (c !== 1) for (let k = 0; k < g; k++) r.getRandom((id) => isRace(id, 'QUILBOAR'));
      if (c !== 0) r.p.maxGoldBonus += g;
    },
    syn: 'QUILBOAR',
    val: 5,
  },
  { id: 'BG31_327', syn: 'QUILBOAR', val: 4 }, // 荊棘開路者（在 game.ts 處理）
  {
    id: 'BG27_005', // 時光船長鉤尾
    onSpell: (r, _s, _t, g, id) => {
      if (!isTavernSpell(id)) return;
      for (const m of r.p.board) r.buff(m, g, 0);
    },
    val: 2,
    scale: 4,
  },
  { id: 'BG33_924', rally: (c, s, g) => c.counter(c.side(s), 'tsH', g), syn: 'DRAGON', val: 4 }, // 藍色幼龍
  { id: 'BG33_830', battlecry: (r, _s, g) => r.counter('tsA', g), syn: 'PIRATE', val: 4 }, // 艾薩拉彎刀手
  {
    id: 'BG32_860', // 淺灘神秘客
    onSell: (r, _s, g) => {
      r.counter('tsA', g);
      r.counter('tsH', g);
    },
    syn: 'MURLOC',
    val: 6,
  },
  { id: 'BG32_341', val: 4, scale: 2 }, // 胡蒙戈茲（光環在 game.ts）
  { id: 'BG35_341', magnetic: true, val: 3, scale: 2 }, // 附魔哨兵（光環在 game.ts）
  { id: 'BG32_880', deathrattle: (c, s, g) => c.counter(c.side(s), 'tsA', g), syn: 'UNDEAD', val: 5 }, // 友善的鬼魂
  {
    id: 'BG34_692', // 被遺忘者織網者
    onSpell: (r, _s, _t, g, id) => {
      if (isTavernSpell(id)) r.counter('undeadA', 3 * g);
    },
    syn: 'UNDEAD',
    val: 3,
    scale: 6,
  },
  {
    id: 'BG28_707', // 活化艾澤萊晶岩
    onSpell: (r, _s, _t, g, id) => {
      if (isTavernSpell(id)) r.tavernBuff(4 * g, 3 * g, 'ELEMENTAL');
    },
    syn: 'ELEMENTAL',
    val: 3,
    scale: 4,
  },
  {
    id: 'BG28_741', // 衝鋒的女沙皇
    onSpell: (r, _s, _t, g, id) => {
      if (!isTavernSpell(id)) return;
      for (const m of r.p.board) if (m.shield) r.buff(m, 4 * g, 0);
    },
    syn: 'MECHANICAL',
    val: 3,
    scale: 5,
  },
  {
    id: 'BG32_821', // 魔焰召喚者
    endTurn: (r, _s, g) => {
      r.counter('tsA', g);
      r.counter('tsH', g);
    },
    val: 3,
    scale: 4,
  },
  {
    id: 'BG28_633', // 魔豬
    text: (m) => `在你施放3個法術後，吃掉酒館中的一個手下來獲得其身材<i>（還差${3 - (m.n % 3)}個！）</i>`,
    onSpell: (r, s, _t, g) => {
      s.n++;
      if (s.n % 3) return;
      for (let k = 0; k < g; k++) {
        const food = r.pick(r.p.shop);
        if (food) r.consume(s, food);
      }
    },
    val: 3,
    scale: 4,
  },
  {
    id: 'BG35_123', // 災變先驅
    endTurn: (r, _s, g) => {
      if (!r.p.lastSpell) return;
      for (let k = 0; k < g; k++) r.getSpell(r.p.lastSpell);
    },
    val: 4,
    scale: 4,
  },
  { id: 'BG28_550', battlecry: (r, _s, g) => { for (let k = 0; k < g; k++) r.discoverSpell((id) => tierOf(id) <= r.p.tier, '發現一個酒館法術'); }, val: 6 }, // 牛仔表演者
  {
    id: 'BG32_820', // 炎鱗寶藏守衛
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getSpell(SHINY_RING);
    },
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) c.give(c.side(s), SHINY_RING);
    },
    syn: 'DRAGON',
    val: 8,
  },
  {
    id: 'BG36_245', // 符文秘法師
    soc: (c, s, g) => {
      const side = c.side(s);
      const [a, h] = c.spellExtra(side);
      for (let k = 0; k < 2 * g; k++) for (const m of c.friends(s)) c.buff(m, 1 + a, 1 + h);
    },
    syn: 'DRAGON',
    val: 6,
  },
  {
    id: 'BG36_764', // 齒輪鰭
    endTurn: (r, _s, g) => {
      const cheap = TAVERN_SPELLS.filter((id) => spellCostOf(id) === 1 && r.spellInLobby(id));
      for (let k = 0; k < 2 * g; k++) {
        const id = r.pick(cheap);
        if (id) r.getSpell(id);
      }
    },
    val: 3,
    scale: 6,
  },
  { id: 'BG33_822', rally: (c, s, g) => { for (let k = 0; k < g; k++) c.give(c.side(s), c.pick(BOUNTIES)!); }, syn: 'PIRATE', val: 6 }, // 大人物強盜
  {
    id: 'BG33_821', // 遇難的無賴
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getSpell(r.pick(BOUNTIES)!);
    },
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) c.give(c.side(s), c.pick(BOUNTIES)!);
    },
    syn: 'PIRATE',
    val: 6,
  },
  { id: 'BG33_825', syn: 'PIRATE', val: 4, scale: 3 }, // 驕傲的私掠者（在 game.ts 處理）
  {
    id: 'BG33_823', // 天空上將羅傑斯
    text: (m) => `在你花費9枚金幣後，隨機獲得一張賞金<i>（還差${9 - m.n}枚金幣！）</i>`,
    onSpend: (r, s, amount, g) => {
      s.n += amount;
      while (s.n >= 9) {
        s.n -= 9;
        for (let k = 0; k < g; k++) r.getSpell(r.pick(BOUNTIES)!);
      }
    },
    syn: 'PIRATE',
    val: 4,
    scale: 6,
  },
  { id: 'BG34_684', endTurn: (r, _s, g) => { for (let k = 0; k < g; k++) r.getSpell(GEM_CONFISCATION); }, syn: 'QUILBOAR', val: 3, scale: 4 }, // 塹壕戰士
  { id: 'BG31_326', endTurn: (r, _s, g) => { for (let k = 0; k < g; k++) r.getSpell(GEM_DAY); }, syn: 'QUILBOAR', val: 3, scale: 3 }, // 寶石鼠
  {
    id: 'BG34_682', // 剃刀沼澤撲擊者
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getSpell(BARRAGE);
    },
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) c.give(c.side(s), BARRAGE);
    },
    syn: 'QUILBOAR',
    val: 6,
  },
  { id: 'BG36_731', deathrattle: (c, s, g) => { for (let k = 0; k < g; k++) c.give(c.side(s), 'BG36_880'); }, syn: 'DEMON', val: 5 }, // 小鬼幻術師
  {
    id: 'BG36_733', // 埃瑞達逃脫者
    text: (m) => `在你的英雄受到4點傷害後，獲得一張腐化的杯子蛋糕<i>（還差${4 - m.n}點！）</i>`,
    onHeroHurt: (r, s, g, n) => {
      s.n += n;
      while (s.n >= 4) {
        s.n -= 4;
        for (let k = 0; k < g; k++) r.getSpell('BG28_607');
      }
    },
    syn: 'DEMON',
    val: 4,
    scale: 4,
  },
  { id: 'BG32_324', avenge: [4, (c, s, g) => { for (let k = 0; k < g; k++) c.give(c.side(s), 'BG28_604'); }], syn: 'UNDEAD', val: 5 }, // 卓斯法倫屠夫
  {
    id: 'BG34_858', // 空氣亡魂
    text: (m) => `在你花費7枚金幣後，施放東來之風<i>（還差${7 - m.n}枚金幣！）</i>`,
    onSpend: (r, s, amount, g) => {
      s.n += amount;
      while (s.n >= 7) {
        s.n -= 7;
        r.counter('rb9', g);
      }
    },
    syn: 'ELEMENTAL',
    val: 3,
    scale: 5,
  },
  { id: 'BG35_882', battlecry: (r, _s, g) => { for (let k = 0; k < g; k++) r.getSpell(CONFLAG); }, syn: 'ELEMENTAL', val: 8 }, // 火源之界逃亡者
  {
    id: 'BG35_881', // 地脈浮現者
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getSpell(ABSORB);
    },
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) c.give(c.side(s), ABSORB);
    },
    syn: 'ELEMENTAL',
    val: 6,
  },
  {
    id: 'BG36_241', // 赤紅辯護者
    rally: (c, s, g) => {
      const [a, h] = c.spellExtra(c.side(s));
      for (let k = 0; k < g; k++) {
        for (const m of c.friends(s)) c.buff(m, 3 + a, 2 + h);
        for (const m of c.friends(s)) if (race(m, 'DRAGON')) c.buff(m, 3 + a, 2 + h);
        for (const m of c.friends(s)) if (m.shield) c.buff(m, 3 + a, 2 + h);
      }
    },
    syn: 'DRAGON',
    val: 12,
  },
  {
    id: 'BG32_837', // 動物低語者
    endTurn: (r, s, g) => {
      const b = r.p.board;
      const i = b.indexOf(s);
      for (let k = 0; k < g; k++) {
        for (const n of [b[i - 1], b[i + 1]]) {
          if (!n) continue;
          const types = racesOf(n.id);
          for (const m of b) if (racesOf(m.id).some((x) => types.includes(x))) r.spellBuff(m, 2, 1);
        }
      }
    },
    syn: 'NAGA',
    val: 3,
    scale: 8,
  },
  {
    id: 'BG34_925', // 海床招募官
    rally: (c, s, g) => {
      const b = c.board(c.side(s));
      const right = b.slice(b.indexOf(s) + 1).find((x) => !x.dead);
      if (!right) return;
      const types = racesOf(right.id);
      for (let k = 0; k < g; k++) c.giveRandom(c.side(s), (id) => id !== right.id && racesOf(id).some((x) => types.includes(x)));
    },
    syn: 'NAGA',
    val: 5,
  },
  { id: 'BG36_854', deathrattle: (c, s, g) => { for (let k = 0; k < g; k++) c.give(c.side(s), 'BG36_624'); }, syn: 'MECHANICAL', val: 5 }, // 救援機器人
  {
    id: 'BG32_336', // 鰓魚美食家
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getSpell('BG32_337');
    },
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) c.give(c.side(s), 'BG32_337');
    },
    syn: 'MURLOC',
    val: 6,
  },
  {
    id: 'BG32_111', // 惡夢茶會客人
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.getSpell(TEA_SET);
    },
    deathrattle: (c, s, g) => {
      for (let k = 0; k < g; k++) c.give(c.side(s), TEA_SET);
    },
    val: 10,
  },
  {
    id: 'BG36_640', // 守門者混合體
    onSpell: (r, s, t, g) => {
      if (t !== s) return;
      for (let k = 0; k < g; k++) r.castSpell(TEA_SET);
    },
    val: 4,
    scale: 6,
  },
  {
    id: 'BG36_763', // 寶藏鸚鵡
    text: (m) => `當此手下造成35點傷害後，獲得一張黃金之觸<i>（還差${Math.max(0, 35 - m.n)}點！）</i>`,
    afterAttack: (c, s, g) => {
      c.bump(s, s.atk);
      if (s.n < 35) return;
      c.bump(s, -35);
      for (let k = 0; k < g; k++) c.give(c.side(s), 'BG28_830');
    },
    val: 4,
  },
  {
    id: 'BG36_762', // 惡魔誘惑者
    onSpell: (r, s, t, g) => {
      if (t === s) r.tavernBuff(g, 2 * g);
    },
    syn: 'DEMON',
    val: 3,
    scale: 3,
  },
  {
    id: 'BG36_853', // 閃亮機器人
    onSpell: (r, _s, t, g) => {
      if (!t || !race(t, 'MECHANICAL')) return;
      r.buff(t, 4 * g, 4 * g);
      t.mags.push({ id: SATELLITE, g: 1 });
    },
    syn: 'MECHANICAL',
    val: 3,
    scale: 4,
  },
  { id: 'BG35_921', aura: (cnt, _s, g) => [2 * g * (cnt.tspells ?? 0), g * (cnt.tspells ?? 0)], syn: 'NAGA', val: 4 }, // 深淵打手
  { id: 'BG32_835', spellcraft: 'BG32_835t', syn: 'NAGA', val: 3, scale: 4 }, // 寧靜冥想者
  { id: 'BG33_319', spellcraft: 'BG33_319t', syn: 'NAGA', val: 5 }, // 霜鱗女祭司
];

/** 衍生物（不在酒館卡池裡） */
export const TOKENS = new Set(['BG28_603t', 'BG_BOT_312t', 'BG_ICC_026t', 'BGS_115t', 'BG25_010t', 'BG36_200t', 'BG19_010', 'BG19_010t', 'BG23_HERO_201pt', 'BG22_HERO_305t']);

export const SPEC = new Map<string, MinionSpec>(MINIONS.map((s) => [s.id, s]));

/** 酒館卡池（有實作的手下，不含衍生物） */
export const POOL_IDS = MINIONS.map((s) => s.id).filter((id) => !TOKENS.has(id));

/** 亡語手下（食屍鬼蛇用） */
export const DEATHRATTLE_POOL = POOL_IDS.filter((id) => SPEC.get(id)?.deathrattle);

export const SPELLCRAFT_SPELLS = new Set(MINIONS.map((s) => s.spellcraft).filter((x): x is string => !!x));
export const TRIPLE_REWARD = 'TB_BaconShop_Triples_01';
export { BEETLE, GEM, COIN, KNIGHT };
