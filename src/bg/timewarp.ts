// 時光扭曲：次級（Minor）與高級（Major）時光扭曲商店裡的手下與法術，用時光晶幣（Chronum）購買
// 不在一般的酒館卡池裡；cards.ts 會把手下加進 SPEC、spells.ts 會把法術加進 SPELL_SPEC
// 這裡不在最上層用到 cards.ts / spells.ts 的東西，避免循環引用時還沒初始化
import type { Combat, MinionSpec, Recruit } from './api';
import { bgCard, hasBgCard, isRace, racesOf, tierOf } from './data';
import { GIFT_IDS } from './gifts';
import { hasBattlecry, LATE } from './late';
import type { SpellCtx, SpellSpec } from './spells';
import { TRIBES, type BMinion, type Tribe } from './types';

const W = (n: string) => `BG34_Giant_${n}`;
const P = (n: string) => `BG34_PreMadeChamp_${n}`;
const COIN = 'BG28_810';
const GEM = 'BG20_GEM';
const BEETLE = 'BG28_603t';
const SKELETON = 'BG_ICC_026t';
const BARRAGE = 'BG34_689';
const POINTY = 'EBG_Spell_014';
const SATELLITE = 'BG34_Giant_610t';
const TABBY = 'BG_CFM_315t';
const IMP = 'BG_BRM_006t';
const ENRICH = 'BG28_886';
const TRIPLE = 'TB_BaconShop_Triples_01';
const FULL_REBORN = 'BG36_MidGameEffect_000t12';
const CREATION = 'BG25_HERO_100pt';
const PROTOSS_IDS = ['BG31_HERO_802pt', 'BG31_HERO_802pt1', 'BG31_HERO_802pt4', 'BG31_HERO_802pt5', 'BG31_HERO_802pt7'];
const race = (m: BMinion, t: Tribe) => isRace(m, t);
const alive = (c: Combat, side: 0 | 1) => c.board(side).filter((m) => !m.dead);
const neighbors = <T>(arr: T[], x: T) => [arr[arr.indexOf(x) - 1], arr[arr.indexOf(x) + 1]].filter((m): m is T => !!m);
const times = (g: number, f: () => void) => {
  for (let k = 0; k < g; k++) f();
};
const randomSpellIn = (c: Combat, side: 0 | 1, f: (id: string) => boolean = () => true) =>
  c.pick(TAVERN().filter((id) => c.inLobbySpell(id) && tierOf(id) <= c.heroTier(side) && f(id)));
const recruitSpell = (r: Recruit, f: (id: string) => boolean = () => true) => r.drawSpell((id) => tierOf(id) <= r.p.tier && f(id));
const gemStats = (c: Combat, side: 0 | 1, n: number): [number, number] => [n * (1 + c.cnt(side, 'gemA')), n * (1 + c.cnt(side, 'gemH'))];
/** 每種類型各一個友方手下 */
function onePerType(b: BMinion[]): BMinion[] {
  const used = new Set<BMinion>();
  for (const t of TRIBES) {
    const m = b.find((x) => race(x, t) && !used.has(x) && racesOf(x).length < TRIBES.length) ?? b.find((x) => race(x, t) && !used.has(x));
    if (m) used.add(m);
  }
  return [...used];
}
function summonCopy(c: Combat, side: 0 | 1, m: BMinion, at: number, temp = false) {
  const x = c.make(m.id, m.golden);
  Object.assign(x, { atk: m.atk, hp: m.hp, taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, mags: m.mags.slice(), temp });
  return c.summon(side, x, at);
}

export const TW_MINIONS: MinionSpec[] = [
  // ———— 次級時光扭曲 ————
  { id: W('001'), battlecry: (r, _s, g) => void (r.p.nextGold += g), deathrattle: (c, s, g) => c.counter(c.side(s), 'nextGoldC', g), val: 3 }, // 街頭藝人
  { id: W('007'), val: 4 }, // 煩人機器人
  { id: W('012'), val: 4 }, // 旋風
  {
    id: W('017'), // 洗刷魚人
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      const h = c.hand(side);
      if (!h.length) return;
      const m = c.pick(h)!;
      const x = c.make(m.id, m.golden);
      Object.assign(x, { atk: m.atk + 7 * g, hp: m.hp + 7 * g, taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, temp: true });
      c.summon(side, x);
    },
    syn: 'MURLOC',
    val: 6,
  },
  { id: W('024'), onFriendReborn: (c, s, _m, g) => c.friends(s).forEach((x) => c.perm(x, 2 * g, 2 * g)), syn: 'UNDEAD', val: 5 }, // 果凍肚
  {
    id: W('029'), // 小龍崽
    soc: (c, s, g) => {
      const t = c.heroTier(c.side(s)) * g;
      for (const x of [s, ...neighbors(c.friends(s), s)]) c.buff(x, t, t);
    },
    syn: 'DRAGON',
    val: 6,
  },
  {
    id: W('031'), // 跳躍蛙
    deathrattle: (c, s, g) => {
      const t = c.pick(c.friends(s).filter((x) => x !== s && race(x, 'BEAST')));
      if (!t) return;
      c.buff(t, g, g);
      (t.extraDr ??= []).push({ id: W('031'), g });
    },
    syn: 'BEAST',
    val: 4,
  },
  {
    id: W('038'), // 伊莉絲
    onRefresh: (r, s, g) => {
      s.n++;
      if (s.n % (g > 1 ? 3 : 5)) return;
      const ms = r.p.shop.filter((m) => !m.golden);
      if (ms.length) r.goldenize(ms.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a)));
    },
    val: 5,
  },
  {
    id: W('065'), // 低空飛龍
    endTurn: (r, s, g) => {
      for (const m of r.p.board) if (m !== s && m.atk < s.atk) r.buff(m, 2 * g, 0);
      for (const m of r.p.board) if (m !== s && m.hp < s.hp) r.buff(m, 0, 2 * g);
    },
    syn: 'DRAGON',
    scale: 6,
  },
  { id: W('067'), endTurn: (r, _s, g) => times(g, () => r.getMinion('BGS_115')), syn: 'ELEMENTAL', scale: 3 }, // 資本元素
  {
    id: W('069'), // 吹笛手
    onDamaged: (c, s, _a, g) => {
      if ((s.uses ?? 0) >= 3) return;
      s.uses = (s.uses ?? 0) + 1;
      c.counter(c.side(s), 'gemA', g);
    },
    syn: 'QUILBOAR',
    val: 5,
  },
  {
    id: W('071'), // 貝斯魚人
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      const h = [...c.hand(side)].sort((a, b) => b.hp - a.hp).slice(0, g);
      for (const m of h) {
        const x = summonCopy(c, side, m, c.board(side).length, true);
        if (x) x.shield = true;
      }
    },
    syn: 'MURLOC',
    val: 5,
  },
  { id: W('078'), battlecry: (r, _s, g) => times(g, () => r.getSpell(BARRAGE)), deathrattle: (c, s, g) => times(g, () => c.give(c.side(s), BARRAGE)), syn: 'QUILBOAR', val: 5 }, // 荊棘召喚者
  { id: W('081'), onDamaged: (c, s, _a, g) => c.counter(c.side(s), 'undeadA', g), syn: 'UNDEAD', val: 4 }, // 亡群蜂
  { id: W('082'), avenge: [4, (c, s, g) => c.counter(c.side(s), 'maxGoldC', g)], syn: 'UNDEAD', val: 4 }, // 回收者
  {
    id: W('091'), // 紅色幼龍
    soc: (c, s, g) => {
      for (let k = 0; k < 2 * g; k++) {
        const t = c.pick(c.enemies(s));
        if (t) c.damage(t, 3, s);
      }
    },
    syn: 'DRAGON',
    val: 4,
  },
  { id: W('204'), deathrattle: (c, s, g) => times(g, () => c.give(c.side(s), COIN)), syn: 'UNDEAD', val: 4 }, // 掠奪者
  {
    id: W('207'), // 莫庫勒斯
    afterAttack: (c, s, g, _t, killed) => {
      if (!killed) return;
      const h = c.hand(c.side(s))[0];
      if (h) (h.atk += 4 * g), (h.hp += 4 * g);
    },
    syn: 'MURLOC',
    val: 4,
  },
  {
    id: W('208'), // 帕格
    afterAttack: (c, s, _g, _t, killed) => {
      if (!killed || s.uses) return;
      s.uses = 1;
      c.give(c.side(s), 'TB_BaconShop_Triples_01');
    },
    val: 6,
  },
  {
    id: W('209'), // 機械大師
    endTurn: (r, s, g) => neighbors(r.p.board, s).forEach((m) => race(m, 'MECHANICAL') && r.buff(m, 3 * g, 3 * g)),
    syn: 'MECHANICAL',
    scale: 6,
  },
  {
    id: W('211'), // 帕許瑪
    avenge: [
      3,
      (c, s, g) => {
        const side = c.side(s);
        times(g, () => {
          const sc = c.pick(SPELLCRAFT());
          if (sc) c.give(side, sc);
          const t = randomSpellIn(c, side);
          if (t) c.give(side, t);
        });
      },
    ],
    syn: 'NAGA',
    val: 6,
  },
  { id: W('302'), avenge: [3, (c, s, g) => times(g, () => c.giveRandom(c.side(s), (id) => isRace(id, 'MECHANICAL') && tierOf(id) <= c.heroTier(c.side(s))))], syn: 'MECHANICAL', val: 5 }, // 直升機
  { id: W('304'), deathrattle: (c, s, g) => times(g, () => c.give(c.side(s), 'BG28_606')), syn: 'NAGA', val: 5 }, // 工兵
  {
    id: W('305'), // 地卜師
    avenge: [
      5,
      (c, s, g) => {
        const side = c.side(s);
        c.give(side, GEM);
        c.counter(side, 'gemA', g);
        c.counter(side, 'gemH', g);
      },
    ],
    syn: 'QUILBOAR',
    val: 5,
  },
  { id: W('306'), deathrattle: (c, s, g) => c.counter(c.side(s), 'gemH', 2 * g), syn: 'QUILBOAR', val: 4 }, // 爵士樂手
  {
    id: W('310'), // 輓歌手
    endTurn: (r, _s, g) => {
      for (const m of r.p.board) r.buff(m, 2 * g, g);
      for (const h of r.p.hand) if (h.kind === 'minion') r.buff(h.m, 2 * g, g);
    },
    syn: 'MURLOC',
    scale: 8,
  },
  {
    id: W('361'), // 新貴
    onRefresh: (r, _s, g) => {
      const m = r.p.shop[r.p.shop.length - 1];
      if (m) m.hp *= g + 1;
    },
    syn: 'ELEMENTAL',
    val: 3,
  },
  {
    id: W('580'), // 拉格納羅斯
    soc: (c, s, g) => {
      times(g, () => {
        const e = c.enemies(s);
        if (e.length) c.damage(e.reduce((a, b) => (b.hp > a.hp ? b : a)), s.atk, s);
      });
    },
    syn: 'ELEMENTAL',
    val: 8,
  },
  { id: W('581'), onFriendDeath: (c, s, d, g) => void (race(d, 'BEAST') && c.perm(s, 2 * g, 2 * g)), syn: 'BEAST', val: 4 }, // 土狼
  {
    id: W('582'), // 孢子蝙蝠
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      times(g, () => {
        const id = randomSpellIn(c, side, (x) => (bgCard(x).cost ?? 1) >= 2);
        if (id) c.give(side, id);
      });
    },
    syn: 'BEAST',
    val: 5,
  },
  {
    id: W('583'), // 吞噬者
    startTurn: (r, s, g) => {
      const b = r.p.board;
      const t = b[b.indexOf(s) + 1];
      if (!t || !race(t, 'DEMON')) return;
      r.p.board = b.filter((x) => x !== t);
      r.buff(s, t.atk, t.hp);
      r.gainGold(3 * g);
    },
    syn: 'DEMON',
    val: 4,
  },
  { id: W('584'), deathrattle: (c, s, g) => times(g, () => c.giveRandom(c.side(s), (id) => isRace(id, 'DEMON') && tierOf(id) <= c.heroTier(c.side(s)))), syn: 'DEMON', val: 4 }, // 基瑞克
  { id: W('585'), rally: (c, s, g) => times(g, () => c.giveRandom(c.side(s), (id) => isRace(id, 'DRAGON') && tierOf(id) <= c.heroTier(c.side(s)))), syn: 'DRAGON', val: 5 }, // 瓦拉斯塔茲
  { id: W('588'), battlecry: (r, _s, g) => times(g, () => r.getSpell(POINTY)), deathrattle: (c, s, g) => times(g, () => c.give(c.side(s), POINTY)), syn: 'MECHANICAL', val: 4 }, // 獵手
  {
    id: W('589'), // 閃耀的水手
    onRefresh: (r, _s, g) => {
      times(g, () => {
        const id = r.drawId((x) => isRace(x, 'PIRATE') && tierOf(x) <= r.p.tier);
        if (id) r.p.shop.push(r.make(id));
      });
    },
    syn: 'PIRATE',
    val: 4,
  },
  {
    id: W('592'), // 風之靈
    deathrattle: (c, s, g) => {
      times(g, () => {
        const m = c.pick(c.friends(s).filter((x) => x !== s));
        if (m) for (const k of ['windfury', 'shield', 'taunt'] as const) c.giveKw(m, k);
      });
    },
    val: 5,
  },
  { id: W('594'), endTurn: (r, _s, g) => times(g, () => r.getRandom((id) => tierOf(id) === r.p.tier)), scale: 5 }, // 波塔尼
  {
    id: W('602'), // 雷義
    startTurn: (r, _s, g) => {
      const id = `${r.p.powerHero ?? r.p.heroId}_Buddy`;
      if (hasBgCard(id) && SPEC_REF.has(id)) times(g, () => r.getMinion(id));
    },
    scale: 5,
  },
  { id: W('603'), endTurn: (r, _s, g) => times(2 * g, () => void (STATS()[0] && r.getSpell(r.pick(STATS().filter((x) => r.spellInLobby(x) && tierOf(x) <= r.p.tier)) ?? STATS()[0]))), scale: 5 }, // 照料者
  { id: W('604'), endTurn: (r, _s, g) => void (r.p.gold > 0 && (r.p.maxGoldBonus += g)), scale: 4 }, // 小費員
  {
    id: W('605'), // 旅行者
    avenge: [
      4,
      (c, s, g) => {
        const side = c.side(s);
        times(g, () => {
          const id = c.pick(TW_IDS().filter((x) => twKind(x) === 'minor' && twCost(x) === 1));
          if (id) c.give(side, id);
        });
      },
    ],
    val: 5,
  },
  {
    id: W('679'), // 奇美拉
    onDamaged: (c, s, _a, g) => onePerType(c.friends(s)).forEach((m) => c.perm(m, 2 * g, g)),
    val: 5,
  },

  // ———— 次級時光扭曲（第二批） ————
  {
    id: W('002'), // 放鬆者
    onSellOther: (r, _s, sold, g) => {
      if (!race(sold, 'QUILBOAR')) return;
      const t = r.pick(r.p.board);
      if (t) r.gem(t, 4 * g);
    },
    syn: 'QUILBOAR',
    val: 4,
  },
  {
    id: W('008'), // 先知：每回合兩張酒館法術便宜 2
    startTurn: (r, s, g) => {
      s.n = 2 * g - 1;
      r.p.c.spellDisc = Math.max(r.p.c.spellDisc ?? 0, 2);
    },
    onBuySpell: (r, s, id) => {
      if (!isPoolSpell(id) || s.n <= 0) return;
      s.n--;
      r.p.c.spellDisc = Math.max(r.p.c.spellDisc ?? 0, 2);
    },
    val: 4,
  },
  {
    id: W('009'), // 巷弄小貓
    endTurn: (r, s, g) => {
      times(g, () => {
        const m = r.make(TABBY);
        m.atk = s.atk;
        m.hp = s.hp;
        r.summon(m, r.p.board.indexOf(s) + 1);
      });
    },
    syn: 'BEAST',
    scale: 4,
  },
  { id: W('027'), onFriendAttacked: (c, _s, t, _a, g) => c.perm(t, 8 * g, 0), val: 6 }, // 時光扭曲之腕
  {
    id: W('039'), // 贏家：上一場戰鬥存活就拿三連獎勵
    endTurn: (_r, s) => void (s.n = 1),
    startTurn: (r, s, g) => {
      const fought = s.n === 1 && r.p.results.length > 0;
      s.n = 0;
      if (fought && !(r.p.lastDiedUids ?? []).includes(s.uid)) times(g, () => r.getSpell(TRIPLE));
    },
    val: 6,
  },
  {
    id: W('041'), // 綠蔭守護者：奮戰時觸發最右邊的亡語（戰鬥中沒有戰吼，戰吼的部分不做）
    rally: (c, s, g) => {
      const t = [...c.friends(s)].reverse().find((m) => m !== s && hasDr(m));
      if (t) times(g, () => c.deathrattle(t));
    },
    val: 5,
  },
  {
    id: W('042'), // 變色龍：戰鬥開始時變成左邊手下的複製體
    soc: (c, s) => {
      const b = c.friends(s);
      const l = b[b.indexOf(s) - 1];
      if (!l) return;
      Object.assign(s, { id: l.id, golden: l.golden, atk: l.atk, hp: l.hp, maxHp: l.maxHp ?? l.hp, taunt: l.taunt, shield: l.shield, windfury: l.windfury, venom: l.venom, reborn: l.reborn, n: l.n });
      s.mags = l.mags.slice();
      s.extraDr = l.extraDr?.slice();
      s.gifts = l.gifts?.slice();
    },
    val: 6,
  },
  { id: W('064'), onStatGain: (r, _s, m, atk, _h, g) => void (atk > 0 && r.buff(m, 0, 3 * g)), syn: 'DRAGON', val: 6 }, // 幼龍走私者
  { id: W('066'), val: 4 }, // 旱地水手（旅店多一張法術、法術多 +1/+1：在 game.ts / rules.ts 處理）
  {
    id: W('068'), // 守衛
    rally: (c, s, g) => {
      times(g, () => {
        const t = c.pick(c.friends(s).filter((m) => m !== s && !m.shield));
        if (!t) return;
        c.giveKw(t, 'shield');
        c.permKw(t, 'shield');
      });
    },
    val: 5,
  },
  { id: W('072'), onSellOther: (r, _s, sold, g) => void (tierOf(sold.id) === 2 && times(g, () => r.getRandom((id) => tierOf(id) === 1))), val: 4 }, // 跳越者
  {
    id: W('201'), // 野豬：每死第三隻，拿一隻金卡野獸
    onDeath: (c, s) => {
      const side = c.side(s);
      c.counter(side, 'twBoar', 1);
      if (c.cnt(side, 'twBoar') % 3) return;
      const id = c.pick(POOL().filter((x) => isRace(x, 'BEAST') && tierOf(x) <= c.heroTier(side) && c.inLobby(x)));
      if (id) c.give(side, id, { golden: true });
    },
    syn: 'BEAST',
    val: 3,
  },
  { id: W('202'), afterDr: (c, s, _m, g) => c.perm(s, 3 * g, 2 * g), val: 5 }, // 尖角蜥
  { id: W('210'), spellcraft: W('210t'), syn: 'NAGA', val: 5 }, // 指揮官
  { id: W('212'), spellcraft: W('212t'), syn: 'NAGA', val: 5 }, // 弓箭手
  {
    id: W('300'), // 倒帶手：英雄受到傷害後倒帶（每回合一次），你的惡魔 +1 生命值
    startTurn: (_r, s) => void (s.n = 0),
    onHeroHurt: (r, s, g, n) => {
      if (s.n >= g) return;
      s.n++;
      r.p.hp += n;
      for (const m of r.p.board) if (race(m, 'DEMON')) r.buff(m, 0, 1);
    },
    syn: 'DEMON',
    val: 4,
  },
  {
    id: W('332'), // 藏屍者：每場戰鬥召喚的第一個手下獲得復生
    onSummon: (c, s, m, g) => {
      if ((s.uses ?? 0) >= g || c.side(m) !== c.side(s)) return;
      s.uses = (s.uses ?? 0) + 1;
      m.reborn = true;
    },
    syn: 'UNDEAD',
    val: 5,
  },
  {
    id: W('360'), // 暗影舞者
    endTurn: (r, _s, g) => times(g, () => r.castSpell(ENRICH)),
    syn: 'DEMON',
    scale: 5,
  },
  {
    id: W('586'), // 冰雪元素：刷新時多一個凍結的元素
    onRefresh: (r, _s, g) => {
      times(g, () => {
        const id = r.drawId((x) => isRace(x, 'ELEMENTAL') && tierOf(x) <= r.p.tier);
        if (!id) return;
        const m = r.make(id);
        m.iced = true;
        r.p.shop.push(m);
      });
    },
    syn: 'ELEMENTAL',
    val: 4,
  },
  {
    id: W('590'), // 膿腸：召喚並拿到一個隨機的不死族造物（普崔希德的造物，帶一個隨機黑暗贈禮）
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      times(g, () => {
        const m = c.make(CREATION);
        const st = 2 * c.heroTier(side) + 2;
        m.atk = st;
        m.hp = st;
        m.gifts = [c.pick(GIFT_IDS)!];
        const x = c.summon(side, m, c.index(s) + 1);
        c.give(side, CREATION, { copy: x ?? m });
      });
    },
    syn: 'UNDEAD',
    val: 5,
  },
  { id: W('591'), startTurn: (r, _s, g) => times(g, () => wheel(r)), val: 5 }, // 侍僧：轉動尤格薩輪
  {
    id: W('593'), // 嘍囉：每場戰鬥擊殺第二個手下後，拿到它的分身
    onSideKill: (c, s, _k, v) => {
      s.uses = (s.uses ?? 0) + 1;
      if (s.uses === 2) c.give(c.side(s), v.id);
    },
    val: 5,
  },
  { id: W('598'), avenge: [4, (c, s, g) => times(g, () => c.give(c.side(s), c.pick(PROTOSS_IDS)!))], val: 6 }, // 聖母艦

  // ———— 高級時光扭曲 ————
  {
    id: W('006'), // 熔岩
    onPlay: (r, s, m, g) => {
      if (!race(m, 'ELEMENTAL')) return;
      s.n++;
      r.buff(s, s.n * g, s.n * g);
    },
    syn: 'ELEMENTAL',
    scale: 6,
  },
  {
    id: W('010'), // 詐欺者
    deathrattle: (c, s, g) => {
      times(g, () => {
        const t = c.pick(c.friends(s).filter((x) => x !== s));
        if (t) c.buff(t, s.atk, s.maxHp ?? s.hp);
      });
    },
    syn: 'DEMON',
    val: 8,
  },
  { id: W('015'), onSpell: (r, _s, _t, g, id) => void (isPoolSpell(id) && r.p.board.forEach((m) => r.buff(m, 2 * g, 2 * g))), val: 8 }, // 鉤尾
  {
    id: W('021'), // 西瓦爾
    endTurn: (r, s, g) => {
      const n = (1 + r.p.board.filter((m) => m.golden).length) * g;
      neighbors(r.p.board, s).forEach((m) => r.buff(m, 8 * n, 8 * n));
    },
    syn: 'PIRATE',
    scale: 16,
  },
  { id: W('032'), onPlay: (r, _s, m, g) => void (race(m, 'ELEMENTAL') && r.tavernBuff(4 * g, 3 * g)), syn: 'ELEMENTAL', val: 6 }, // 諾米
  { id: W('034'), deathrattle: (c, s, g) => void (c.counter(c.side(s), 'tsA', 2 * g), c.counter(c.side(s), 'tsH', 2 * g)), syn: 'UNDEAD', val: 7 }, // 鬼靈
  { id: W('040'), onPlay: (_r, _s, m) => void (m.shield = true), syn: 'ELEMENTAL', val: 6 }, // 艾克膿
  {
    id: W('088'), // 晉升幼龍
    soc: (c, s, g) => alive(c, c.side(s)).forEach((m) => c.buff(m, (5 + s.n) * g, (5 + s.n) * g)),
    endTurn: (_r, s) => void s.n++,
    syn: 'DRAGON',
    val: 10,
  },
  {
    id: W('102'), // 擊打者
    rally: (c, s, g) => {
      const [a, h] = gemStats(c, c.side(s), 2 * g);
      for (const m of c.friends(s)) if (m !== s) c.perm(m, a, h);
    },
    syn: 'QUILBOAR',
    val: 9,
  },
  {
    id: W('104'), // 豬鬃戰士
    deathrattle: (c, s) => {
      const n = s.gems ?? 0;
      if (!n) return;
      const [a, h] = gemStats(c, c.side(s), n);
      for (const m of c.friends(s).filter((x) => x !== s && race(x, 'QUILBOAR')).slice(0, 2)) c.buff(m, a, h);
    },
    syn: 'QUILBOAR',
    val: 5,
  },
  { id: W('105'), onGem: (r, _s, g) => times(g, () => r.castSpell(BARRAGE)), syn: 'QUILBOAR', val: 6 }, // 旋舞者
  {
    id: W('110'), // 海玻璃
    rally: (c, s, g) => {
      if ((s.uses ?? 0) >= 2) return;
      s.uses = (s.uses ?? 0) + 1;
      c.buff(s, s.atk * g, s.hp * g);
    },
    syn: 'ELEMENTAL',
    val: 10,
  },
  { id: W('120'), onPlay: (r, _s, m, g) => void (race(m, 'MECHANICAL') && r.p.board.forEach((x) => race(x, 'MECHANICAL') && r.buff(x, 3 * g, 3 * g))), syn: 'MECHANICAL', scale: 6 }, // 翻譯機
  { id: W('205'), onSpell: (r, _s, _t, g) => onePerType(r.p.board).forEach((m) => r.buff(m, 4 * g, 3 * g)), scale: 8 }, // 娜菈
  { id: W('206'), endTurn: (r, s, g) => r.buff(s, (2 + (r.p.c.bcTotal ?? 0)) * g, (2 + (r.p.c.bcTotal ?? 0)) * g), syn: 'MURLOC', scale: 6 }, // 莫奇
  {
    id: W('309'), // 九蛙
    onBuy: (r, s, m, g) => {
      if (s.n >= 9) return;
      s.n++;
      times(g, () => {
        const id = recruitSpell(r, (x) => tierOf(x) === tierOf(m.id));
        if (id) r.getSpell(id);
      });
    },
    syn: 'BEAST',
    val: 6,
  },
  {
    id: W('313'), // 基爾加丹
    onRefresh: (r, _s, g) => {
      for (let k = 0; k < 2 * g; k++) {
        const id = r.drawId((x) => isRace(x, 'DEMON') && tierOf(x) <= r.p.tier);
        if (!id) continue;
        const m = r.make(id);
        m.atk += 7;
        m.hp += 7;
        r.p.shop.push(m);
      }
    },
    syn: 'DEMON',
    val: 7,
  },
  { id: W('318'), endTurn: (r, s, g) => times(g, () => [...r.p.board].forEach((m) => m !== s && hasBattlecry(m.id) && r.battlecry(m))), syn: 'MURLOC', val: 9 }, // 莫克之眼
  {
    id: W('319'), // 畫家
    endTurn: (r, s, g) => neighbors(r.p.board, s).forEach((m) => r.buff(m, (3 + s.n) * g, (2 + s.n) * g)),
    onPlay: (_r, s, m) => void (tierOf(m.id) <= 3 && s.n++),
    syn: 'MURLOC',
    scale: 8,
  },
  {
    id: W('321'), // 魔魯格爾
    soc: (c, s, g) => {
      const side = c.side(s);
      const h = c.hand(side);
      const a = h.reduce((n, m) => n + m.atk, 0) * g;
      const hp = h.reduce((n, m) => n + m.hp, 0) * g;
      neighbors(c.friends(s), s).forEach((m) => race(m, 'MURLOC') && c.buff(m, a, hp));
    },
    syn: 'MURLOC',
    val: 8,
  },
  {
    id: W('322'), // 先鋒
    onRefresh: (r, s, g) => {
      s.n++;
      if (s.n % 3) return;
      times(g, () => r.getSpell(r.pick(SPELLCRAFT())!));
    },
    syn: 'NAGA',
    val: 5,
  },
  {
    id: W('323'), // 秘書
    onSpell: (r, s, _t, g, id) => {
      if (!SPELLCRAFT().includes(id)) return;
      s.n++;
      if (s.n % 2) return;
      times(g, () => {
        const x = recruitSpell(r);
        if (x) r.getSpell(x);
      });
    },
    syn: 'NAGA',
    val: 5,
  },
  { id: W('325'), deathrattle: (c, s, g) => times(g, () => void (c.player(c.side(s)).lastSpell && c.give(c.side(s), c.player(c.side(s)).lastSpell!))), syn: 'NAGA', val: 6 }, // 瑞普拉許
  { id: W('326'), deathrattle: (c, s, g) => times(g, () => c.give(c.side(s), 'EBG_Spell_017')), syn: 'PIRATE', val: 6 }, // 東尼
  {
    id: W('327'), // 佩姬
    onGetCard: (r, _s, g) => r.p.board.forEach((m) => race(m, 'PIRATE') && r.buff(m, g, g)),
    syn: 'PIRATE',
    scale: 6,
  },
  {
    id: W('328'), // 潮汐剃刀
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      for (let k = 0; k < 4 * g; k++) {
        const id = c.pick(POOL().filter((x) => isRace(x, 'PIRATE') && tierOf(x) <= c.heroTier(side) && c.inLobby(x)));
        if (!id) return;
        c.give(side, id);
        c.summon(side, c.make(id), i + k);
      }
    },
    syn: 'PIRATE',
    val: 9,
  },
  {
    id: W('331'), // 食屍狼
    deathrattle: (c, s, g, i) => {
      const b = c.board(c.side(s)).filter((x) => !x.dead);
      const near = [b[i - 1], b[i]].filter((x) => x && x.id !== W('331'));
      const t = c.pick(near);
      if (t) times(g, () => c.deathrattle(t));
    },
    syn: 'UNDEAD',
    val: 7,
  },
  { id: W('333'), onSell: (r, _s, g) => times(g, () => r.getRandom((id) => tierOf(id) === 7)), val: 6 }, // 斥候
  {
    id: W('335'), // 希奧塔
    onPlay: (r, _s, m, g) => {
      if (racesOf(m).length) return;
      onePerType(r.p.board).forEach((x) => r.buff(x, 6 * g, 6 * g));
    },
    val: 7,
  },
  {
    id: W('336'), // 混合體
    onPlay: (r, _s, m, g) => {
      const rs = racesOf(m);
      if (rs.length === TRIBES.length) r.tavernBuff(4 * g, 4 * g);
      else for (const t of rs) r.tavernBuff(4 * g, 4 * g, t);
    },
    val: 6,
  },
  {
    id: W('362'), // 戈德林
    deathrattle: (c, s, g) => {
      c.counter(c.side(s), 'beastA', 4 * g);
      c.counter(c.side(s), 'beastH', 4 * g);
    },
    syn: 'BEAST',
    val: 8,
  },
  {
    id: W('370'), // 鷹行者
    soc: (c, s, g) => {
      times(g, () => {
        for (const m of [...c.friends(s)]) if (m !== s && !m.dead && hasDr(m)) c.deathrattle(m);
      });
    },
    syn: 'BEAST',
    val: 8,
  },
  { id: W('376'), val: 9 }, // 戴奧斯（在 game.ts / combat.ts 處理：戰吼、亡語、奮戰觸發兩次）
  { id: W('595'), onSummon: (c, _s, m, g) => c.buff(m, m.atk * g, m.hp * g), syn: 'BEAST', val: 8 }, // 塔姆卓
  {
    id: W('597'), // 不朽者
    soc: (c, s, g) => neighbors(c.friends(s), s).forEach((m) => c.buff(s, m.atk * g, m.hp * g)),
    syn: 'MECHANICAL',
    val: 8,
  },
  {
    id: W('608'), // 小野豬人
    deathrattle: (c, s, g) => {
      const [a, h] = gemStats(c, c.side(s), 3 * g);
      c.friends(s).forEach((m) => m !== s && race(m, 'QUILBOAR') && c.buff(m, a, h));
    },
    syn: 'QUILBOAR',
    val: 7,
  },
  {
    id: W('610'), // 電子
    onSpell: (r, s, _t, g, id) => {
      if (!isPoolSpell(id)) return;
      s.n++;
      if (s.n % 2) return;
      times(g, () => r.p.board.forEach((m) => race(m, 'MECHANICAL') && r.magnetize(m, SATELLITE)));
    },
    syn: 'MECHANICAL',
    val: 7,
  },
  {
    id: W('618'), // 照料者
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      for (let k = 0; k < 5 * g; k++) if (!c.summon(side, c.make(SKELETON), i + k)) c.counter(side, 'undeadA', 1);
    },
    syn: 'UNDEAD',
    val: 7,
  },
  { id: W('644'), onShieldLost: (c, s, _m, g) => c.counter(c.side(s), 'gemA', g), syn: 'QUILBOAR', val: 6 }, // 寶石分裂者
  {
    id: W('654'), // 亡蹄
    onSummon: (c, s, _m, g) => c.friends(s).forEach((m) => c.perm(m, 4 * g, 0)),
    onPlay: (r, _s, _m, g) => r.p.board.forEach((m) => r.buff(m, 4 * g, 0)),
    val: 9,
  },
  { id: W('656'), onShieldLost: (c, s, _m, g) => c.friends(s).forEach((m) => c.perm(m, 3 * g, 3 * g)), syn: 'MECHANICAL', val: 8 }, // 油膩機器人
  { id: W('680'), cleave: true, rally: (c, s) => void (c.friends(s).filter((m) => m.golden).length >= 4 && c.giveKw(s, 'shield')), syn: 'PIRATE', val: 8 }, // 收藏家
  {
    id: W('681'), // 影羽
    endTurn: (r, s, g) => {
      for (const m of [...r.p.shop].sort((a, b) => b.hp - a.hp).slice(0, 3)) r.buff(s, m.atk * g, m.hp * g);
    },
    syn: 'QUILBOAR',
    scale: 15,
  },
  {
    id: W('684'), // 米斯拉克斯
    soc: (c, s, g) => {
      for (const m of onePerType(c.friends(s).filter((x) => x !== s && x.id !== W('684'))).slice(0, 3)) c.buff(s, m.atk * g, m.hp * g);
    },
    val: 9,
  },
  {
    id: W('687'), // 巢穴蟲群
    battlecry: (r, _s, g) => {
      r.counter('beetleA', 2 * g);
      r.counter('beetleH', 2 * g);
      r.summon(r.make(BEETLE));
    },
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      c.counter(side, 'beetleA', 2 * g);
      c.counter(side, 'beetleH', 2 * g);
      c.summon(side, c.make(BEETLE), i);
    },
    rally: (c, s, g) => {
      const side = c.side(s);
      c.counter(side, 'beetleA', 2 * g);
      c.counter(side, 'beetleH', 2 * g);
      c.summon(side, c.make(BEETLE));
    },
    syn: 'BEAST',
    val: 8,
  },
  { id: W('777'), onBuy: (r, s, m, g) => void (race(m, 'ELEMENTAL') && r.buff(s, m.atk * g, m.hp * g)), syn: 'ELEMENTAL', scale: 8 }, // 巨獸
  { id: P('031'), deathrattle: (c, s, g) => times(g, () => c.give(c.side(s), 'BGS_123')), avenge: [3, (c, s, g) => times(g, () => c.give(c.side(s), 'BGS_123'))], syn: 'ELEMENTAL', val: 7 }, // 風暴雷雲
  { id: P('056'), onSummon: (c, s, m, g) => void (c.side(m) === c.side(s) && times(g, () => c.give(c.side(s), 'BG26_502t'))), syn: 'DRAGON', val: 8 }, // 卡拉薩瑞斯
  {
    id: P('078'), // 強盜：捨棄一張法術，對所有手下打出 4 顆鮮血寶石
    startTurn: (r, _s, g) => {
      const sp = r.p.hand.find((h) => h.kind === 'spell');
      if (!sp) return;
      r.discard(sp.uid);
      for (const m of r.p.board) r.gem(m, 4 * g);
    },
    syn: 'QUILBOAR',
    val: 8,
  },
  { id: P('002'), onSpell: (r, _s, _t, g) => r.p.board.forEach((m) => race(m, 'BEAST') && r.buff(m, 2 * g, 2 * g)), syn: 'BEAST', scale: 8 }, // 實驗鼠
  {
    id: P('004'), // 叢林之王
    onSummon: (c, s, m, g) => void (race(m, 'BEAST') && c.buff(m, (4 + s.n) * g, (3 + s.n) * g)),
    onPlay: (r, s, m, g) => void (race(m, 'BEAST') && r.buff(m, (4 + s.n) * g, (3 + s.n) * g)),
    onSpell: (_r, s) => void s.n++,
    syn: 'BEAST',
    val: 8,
  },
  {
    id: P('011'), // 魔王
    onBuy: (r, _s, _m, g) => r.p.board.forEach((m) => race(m, 'DEMON') && r.buff(m, 4 * g, 4 * g)),
    onBuySpell: (r, _s, _id, g) => r.p.board.forEach((m) => race(m, 'DEMON') && r.buff(m, 4 * g, 4 * g)),
    syn: 'DEMON',
    scale: 10,
  },
  {
    id: P('013'), // 小鬼滲透者
    onSpend: (r, s, n, g) => {
      s.n += n;
      while (s.n >= 8) {
        s.n -= 8;
        r.tavernBuff(3 * g, 3 * g);
      }
    },
    syn: 'DEMON',
    val: 7,
  },
  { id: P('020'), avenge: [1, (c, s, g) => c.friends(s).forEach((m) => race(m, 'DRAGON') && c.buff(m, 6 * g, 4 * g))], syn: 'DRAGON', val: 10 }, // 暮喉
  { id: P('022'), avenge: [2, (c, s, g) => times(g, () => c.give(c.side(s), 'BG28_169'))], syn: 'DRAGON', val: 8 }, // 稜鱗
  { id: P('032'), endTurn: (r, _s, g) => times(g, () => r.getSpell('BG31_819')), syn: 'ELEMENTAL', scale: 8 }, // 基質
  { id: P('038'), endTurn: (r, _s, g) => times(g, () => ['BG34_170t', 'BG34_170t2', 'BG34_170t3'].forEach((id) => r.getMinion(id))), syn: 'MECHANICAL', scale: 10 }, // 蒸汽機
  { id: P('047'), endTurn: (r, _s, g) => times(g, () => r.getSpell('BG28_601')), syn: 'MURLOC', scale: 8 }, // 古鰭
  {
    id: P('049'), // 颮鰭
    onPlay: (r, _s, m, g) => {
      if (!race(m, 'MURLOC')) return;
      for (const x of r.p.board) r.buff(x, 2 * g, 2 * g);
      for (const h of r.p.hand) if (h.kind === 'minion') r.buff(h.m, 2 * g, 2 * g);
    },
    syn: 'MURLOC',
    scale: 10,
  },
  { id: P('058'), onPlay: (r, _s, m, g) => void (race(m, 'NAGA') && r.p.board.forEach((x) => race(x, 'NAGA') && r.buff(x, 6 * g, 10 * g))), syn: 'NAGA', scale: 12 }, // 海妖
  {
    id: P('065'), // 掠奪者
    onPlay: (r, _s, m, g) => void (tierOf(m.id) >= 4 && r.p.board.forEach((x) => race(x, 'PIRATE') && r.buff(x, 3 * g, 2 * g))),
    syn: 'PIRATE',
    scale: 8,
  },
  { id: P('067'), deathrattle: (c, s, g) => c.counter(c.side(s), 'maxGoldC', 2 * g), syn: 'PIRATE', val: 7 }, // 劫掠者
  { id: P('076'), startTurn: (r, _s, g) => r.getGems(5 * g), syn: 'QUILBOAR', scale: 10 }, // 束血者
  { id: P('083'), onPlay: (r, _s, m, g) => void (race(m, 'UNDEAD') && r.counter('undeadA', 3 * g)), syn: 'UNDEAD', scale: 8 }, // 阿努巴拉克
  {
    id: P('090'), // 裂蹄牛
    endTurn: (r, _s, g) => {
      for (let k = 0; k < 3; k++) {
        for (const m of r.p.board) {
          if (!race(m, 'BEAST')) continue;
          r.buff(m, 2 * g, 2 * g);
          m.hp = Math.max(1, m.hp - 1);
        }
      }
    },
    syn: 'BEAST',
    scale: 10,
  },
  {
    id: P('091'), // 書法家
    battlecry: (r, _s, g) => times(g, () => void (recruitSpell(r) && r.getSpell(recruitSpell(r)!))),
    deathrattle: (c, s, g) => times(g, () => void (randomSpellIn(c, c.side(s)) && c.give(c.side(s), randomSpellIn(c, c.side(s))!))),
    rally: (c, s, g) => times(g, () => void (randomSpellIn(c, c.side(s)) && c.give(c.side(s), randomSpellIn(c, c.side(s))!))),
    syn: 'DEMON',
    val: 8,
  },
  {
    id: P('200'), // 百夫長
    onSpell: (r, _s, _t, g, id) => {
      if (!isPoolSpell(id) || (r.p.c['t:cent'] ?? 0) >= 3 * g) return;
      r.counter('t:cent', 1);
      r.getSpell(id);
    },
    syn: 'DRAGON',
    val: 9,
  },
  // ———— 高級時光扭曲（第二批） ————
  { id: W('035'), spellcraft: W('035t'), syn: 'DRAGON', val: 7 }, // 亮鱗
  { id: W('121'), magnetic: true, syn: 'MECHANICAL', val: 9 }, // 普羅比斯（合體後目標變金卡：在 game.ts 處理）
  { id: W('311'), onConsumeAny: (r, s, _e, food, g) => r.buff(s, food.atk * g, food.hp * g), syn: 'NAGA', scale: 10 }, // 希瓦拉
  {
    id: W('317'), // 遠征者：獲得身材時，手牌最左邊的兩個手下也獲得
    onStatGain: (r, s, m, atk, hp, g) => {
      if (m !== s) return;
      for (const h of r.p.hand.filter((x) => x.kind === 'minion').slice(0, 2)) if (h.kind === 'minion') r.buff(h.m, atk * g, hp * g);
    },
    val: 9,
  },
  {
    id: W('320'), // 秘術使：賣出 3 個魚人後，本賽局的酒館法術多 +2/+1
    onSellOther: (r, s, sold, g) => {
      if (!race(sold, 'MURLOC') || s.n >= 3) return;
      if (++s.n === 3) (r.counter('tsA', 2 * g), r.counter('tsH', g));
    },
    syn: 'MURLOC',
    val: 7,
  },
  { id: W('324'), spellcraft: W('324t'), val: 6 }, // 召喚師
  {
    id: W('330'), // 電台明星：拿到殺死它的敵方手下的分身（生命值補滿、保留附魔）
    deathrattle: (c, s, g) => {
      const k = s.killedBy;
      if (k) times(g, () => c.give(c.side(s), k.id, { copy: k, full: true }));
    },
    val: 8,
  },
  {
    id: W('342'), // 巫婆：右邊的不死族復生並保留身材
    soc: (c, s, g) => {
      const b = c.friends(s);
      for (const t of b.slice(b.indexOf(s) + 1).filter((m) => race(m, 'UNDEAD')).slice(0, g)) {
        t.reborn = true;
        (t.gifts ??= []).push(FULL_REBORN);
      }
    },
    syn: 'UNDEAD',
    val: 8,
  },
  {
    id: W('596'), // 阿克蒙德：英雄受到傷害後倒帶（每回合一次），下一張酒館法術便宜 1
    startTurn: (_r, s) => void (s.n = 0),
    onHeroHurt: (r, s, g, n) => {
      if (s.n >= g) return;
      s.n++;
      r.p.hp += n;
      r.p.c.spellDisc = (r.p.c.spellDisc ?? 0) + 1;
    },
    syn: 'DEMON',
    val: 7,
  },
  {
    id: W('599'), // 迴旋機器人：複製最左邊兩個手下的亡語
    soc: (c, s, g) => {
      for (const m of c.friends(s).filter((x) => x !== s && x.id !== W('599') && hasDr(x)).slice(0, 2)) {
        for (const id of [m.id, ...m.mags.map((x) => x.id)]) if (hasDrId(id)) (s.extraDr ??= []).push({ id, g: (m.golden && id === m.id ? 2 : 1) * g });
        for (const x of m.extraDr ?? []) (s.extraDr ??= []).push({ id: x.id, g: x.g * g });
      }
    },
    syn: 'MECHANICAL',
    val: 8,
  },
  {
    id: W('601'), // 石殼守護者：複製所有友方的奮戰
    soc: (c, s, g) => {
      for (const m of c.friends(s)) {
        if (m === s || m.id === W('601') || !SPEC_REF.get(m.id)?.rally) continue;
        (s.extraRally ??= []).push({ id: m.id, g: (m.golden ? 2 : 1) * g });
      }
    },
    val: 8,
  },
  { id: W('609'), afterDr: (c, s, _m, g) => c.friends(s).forEach((m) => c.perm(m, 3 * g, 2 * g)), syn: 'UNDEAD', val: 9 }, // 食屍異獸
  {
    id: W('619'), // 寬宏大量的麋鹿：從對手陣容召喚並拿到一個手下
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      times(g, () => {
        const id = c.pick(c.startBoard((1 - side) as 0 | 1).filter((x) => hasBgCard(x) && bgCard(x).type === 'MINION'));
        if (!id) return;
        c.summon(side, c.make(id), c.index(s) + 1);
        c.give(side, id);
      });
    },
    syn: 'BEAST',
    val: 8,
  },
  {
    id: W('671'), // 澤魯斯：每回合一次，從 2 個次級時光扭曲手下選一個變形（保留身材）
    activate: {
      cost: 0,
      filter: (s) => s.act === undefined || s.act < 0,
      use: (r, s, g) => {
        s.act = r.turn;
        const opts = [...TW_MINIONS.map((x) => x.id)].filter((id) => hasBgCard(id) && twKind(id) === 'minor' && id !== W('671'));
        const pick: string[] = [];
        while (pick.length < 2 && opts.length) pick.push(opts.splice(Math.floor(r.rand() * opts.length), 1)[0]);
        r.offer(pick, '時光扭曲澤魯斯：選擇要變成的手下', { transform: s.uid, stats: [s.atk, s.hp], golden: g > 1 });
      },
      ai: () => 3,
    },
    val: 7,
  },
  {
    id: W('674'), // 噁心小鬼
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      for (let k = 0; k < 2 * g; k++) {
        const m = c.make(IMP);
        m.atk = s.atk;
        m.hp = s.maxHp ?? s.hp;
        c.summon(side, m, c.index(s) + 1);
      }
    },
    syn: 'DEMON',
    val: 8,
  },
  { id: W('675'), soc: (c, s, g) => c.buff(s, c.cnt(c.side(s), 't:soldA') * g, c.cnt(c.side(s), 't:soldH') * g), syn: 'DRAGON', val: 7 }, // 石龍
  {
    id: W('676'), // 喇叭手：賣掉 5 個元素後拿到一個隨機元素
    onSellOther: (r, s, sold, g) => {
      if (!race(sold, 'ELEMENTAL')) return;
      if (++s.n % 5 === 0) times(g, () => r.getRandom((id) => isRace(id, 'ELEMENTAL') && tierOf(id) <= r.p.tier));
    },
    syn: 'ELEMENTAL',
    val: 6,
  },
  { id: W('677'), magnetic: true, syn: 'MECHANICAL', val: 9 }, // 戰爭機兵（合體後目標身材加倍：在 game.ts 處理）
  {
    id: W('678'), // 熔岩潛伏者：從手牌施放造法法術後，再施放一次永久的
    onSpell: (r, s, t, g, id) => {
      if (!t || !LATE.spellcraft.includes(id) || (r.p.c['t:lurk'] ?? 0) >= 2) return;
      r.counter('t:lurk', 1);
      r.counter('~permCraft', 1);
      try {
        times(g, () => r.castOn(id, t));
      } finally {
        r.counter('~permCraft', -1);
      }
      void s;
    },
    syn: 'NAGA',
    val: 8,
  },
  {
    id: W('683'), // 幸運蛋：兩回合後，從三個 7 本金卡手下選一個變形
    startTurn: (r, s) => {
      if (++s.n < 2) return;
      r.discoverOpts((id) => tierOf(id) === 7, '時光扭曲幸運蛋：選擇要變成的 7 本金卡手下', { transform: s.uid, golden: true });
    },
    text: (m) => (m.n >= 2 ? '已經孵化' : `兩回合後，從三個旅店等級7金卡手下中選擇一個來變形（還剩${2 - m.n}回合！）`),
    val: 7,
  },
  { id: W('686'), val: 6 }, // 捲沙者（元素額外 +3/+3：在 rules.ts 處理）
  { id: W('801'), inHandStatGain: (_r, s, m, _a, _h, g) => void (m !== s && race(m, 'MURLOC') && (s.atk += 3 * g, s.hp += 2 * g)), syn: 'MURLOC', val: 6 }, // 天體魚人
  { id: W('314'), syn: 'DRAGON', val: 9 }, // 時光扭曲的詩人（所有的龍保留戰鬥中的身材，在 combat.ts 處理）
  { id: 'BG34_Treasure_990', val: 8 }, // 蝰蛇（攻擊時免疫：在 combat.ts 處理）
  { id: 'BG34_Treasure_994', cleave: true, soc: (c, s) => c.buff(s, s.atk, s.hp), val: 9 }, // 雷獸
];

export const TW_SPELLS: (SpellSpec & { whenBought?: boolean })[] = [
  { id: 'BG34_Treasure_300', target: false, whenBought: true, cast: ({ p }) => void (p.c.chronumNext = (p.c.chronumNext ?? 0) + 1), v: () => 4 }, // 投資
  {
    id: 'BG34_Treasure_301', // 魔豆
    target: false,
    cast: ({ G, p }) => G.offerTimewarpCards(p, (id) => twKind(id) === 'major' && twCost(id) === 1, '魔豆：發現一張高級時光扭曲的 1 費卡（鎖定 1 回合）', true),
    v: () => 8,
  },
  {
    id: 'BG34_Treasure_302', // 複製裝置
    target: 'friend',
    cast: ({ p, r }, t) => {
      if (!t || p.board.length >= 7) return;
      const x = r.make(t.id, t.golden);
      Object.assign(x, { atk: t.atk, hp: t.hp, taunt: t.taunt, shield: t.shield, windfury: t.windfury, venom: t.venom, reborn: t.reborn, mags: t.mags.slice(), gifts: t.gifts?.slice(), n: t.n });
      r.summon(x, p.board.indexOf(t) + 1);
    },
    v: () => 12,
  },
  {
    id: 'BG34_Treasure_606', // 大贏家！
    target: false,
    cast: ({ G, p }) => {
      p.c.bigWinner = G.round;
      G.discoverPrize(p, 3);
    },
    v: () => 8,
  },
  { id: 'BG34_Treasure_607', target: false, cast: ({ r }) => [1, 2, 3].forEach((t) => r.getRandom((id) => tierOf(id) === t)), v: () => 6 }, // 見習生
  { id: 'BG34_Treasure_608', target: false, cast: ({ r, p }) => void (r.getSpell('BG28_168'), (p.c.twRing = (p.c.twRing ?? 0) + 1)), v: () => 8 }, // 戒指
  { id: 'BG34_Treasure_609', target: false, cast: ({ r, p }) => void (r.getSpell('BG28_512'), (p.c.twLasso = (p.c.twLasso ?? 0) + 1)), v: () => 8 }, // 套索
  { id: 'BG34_Treasure_900', target: false, cast: ({ r, p }) => void (r.getSpell('BGS_Treasures_006'), (p.c.twEvolve = (p.c.twEvolve ?? 0) + 1)), v: () => 8 }, // 時光扭曲超進化旅店
  // 英雄之力：購買後變成你的第二個英雄能力
  ...Object.entries({
    '003': 'TB_BaconShop_HERO_76',
    '005': 'TB_BaconShop_HERO_42',
    '006': 'TB_BaconShop_HERO_15',
    '008': 'TB_BaconShop_HERO_23',
    '009': 'BG25_HERO_103',
    '010': 'TB_BaconShop_HERO_22',
    '012': 'TB_BaconShop_HERO_91',
    '015': 'BG20_HERO_242',
    '016': 'TB_BaconShop_HERO_55',
    '017': 'BG23_HERO_306',
    '018': 'BG22_HERO_000',
    '022': 'TB_BaconShop_HERO_75',
  }).map(([n, hero]) => ({ id: `BG34_HeroPowerSpell_${n}`, target: false as const, whenBought: true, cast: ({ G, p }: SpellCtx) => G.setPower2(p, hero), v: () => 7 })),
  { id: 'BG34_Treasure_620', target: false, cast: ({ p }) => void (p.c.twApples = (p.c.twApples ?? 0) + 1), v: () => 8 }, // 蘋果
  {
    id: 'BG34_Treasure_917', // 新兵
    target: false,
    cast: ({ r, p }) => {
      r.tavernBuff(2, 2);
      p.c.full7 = 1;
    },
    v: () => 7,
  },
  { id: 'BG34_Treasure_625', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => tierOf(id) === 7, '秘密：發現一個金色的旅店等級 7 手下', { golden: true }), v: () => 16 }, // 秘密
  { id: 'BG34_Treasure_903', target: false, cast: ({ G, p }) => [0, 1, 2].forEach(() => G.discoverFor(p, (id) => tierOf(id) === p.tier, '本店招待：發現一個你的等級的手下')), v: () => 12 }, // 本店招待
  { id: 'BG34_Treasure_905', target: 'friend', stats: true, cast: ({ r }, t) => void (t && (r.buff(t, 2, 2), r.buff(t, t.atk, t.hp))), v: () => 10 }, // 困鼠之鬥
  {
    id: 'BG34_Treasure_912', // 香蕉大餐
    target: false,
    cast: ({ G, p }) => {
      while (p.hand.length < 10) G.addHand(p, { kind: 'spell', uid: G.nextUid(), id: 'BG28_897', g: 1 });
      p.c.tsA = (p.c.tsA ?? 0) + 3;
      p.c.tsH = (p.c.tsH ?? 0) + 3;
    },
    v: () => 14,
  },
  { id: 'BG34_Treasure_919', target: false, cast: ({ G, p }) => [0, 1].forEach(() => G.discoverFor(p, (id) => tierOf(id) === 7, '儀式：發現一個旅店等級 7 的手下')), v: () => 14 }, // 儀式
  { id: 'BG34_Treasure_932', target: false, cast: ({ p }) => void ((p.maxGoldBonus += 4), (p.gold += 4)), v: () => 10 }, // 挖到石油
  {
    id: 'BG34_Treasure_933', // 進化
    target: 'friend',
    cast: ({ G, p }, t) => {
      if (!t) return;
      p.board = p.board.filter((m) => m !== t);
      G.returnToPool(t);
      G.discoverFor(p, (id) => tierOf(id) === 6, '進化：發現一個旅店等級 6 的手下（30/30）', { stats: [30, 30] });
    },
    v: () => 12,
  },
  { id: 'BG34_Treasure_934', target: false, whenBought: true, cast: ({ p }) => void (p.armor += 10), v: () => 6 }, // 護甲存貨
  { id: 'BG34_Treasure_937', target: false, cast: ({ G, p }) => G.discoverFor(p, (id) => tierOf(id) >= 5 && tierOf(id) <= p.tier + 1 && hasDrId(id), '屍體：發現一個 5 本以上的亡語手下（有復生）', { kw: ['reborn'] }), v: () => 10 }, // 屍體
  {
    id: 'BG34_Treasure_940', // 主廚推薦
    target: 'friend',
    cast: ({ r }, t) => {
      const ty = t ? racesOf(t)[0] : undefined;
      if (!ty) return;
      [4, 5, 6].forEach((tier) => r.getRandom((id) => isRace(id, ty) && tierOf(id) === tier));
    },
    v: () => 10,
  },
  { id: 'BG34_Treasure_950', target: false, cast: ({ r, p }) => void [...Array(Math.max(1, 10 - p.hand.length + 1))].forEach(() => r.getSpell(r.pick(SPELLCRAFT())!)), v: () => 10 }, // 特餐
  {
    id: 'BG34_Treasure_951', // 海螺
    target: 'friend',
    filter: (m) => race(m, 'MURLOC'),
    cast: ({ p, r }, t) => {
      if (!t || p.board.length >= 7) return;
      const x = r.make(t.id, t.golden);
      Object.assign(x, { atk: t.atk, hp: t.hp, taunt: t.taunt, shield: t.shield, windfury: t.windfury, venom: t.venom, reborn: t.reborn, mags: t.mags.slice() });
      r.summon(x, p.board.indexOf(t) + 1);
    },
    v: () => 10,
  },
  {
    id: 'BG34_Treasure_953', // 天啟
    target: false,
    cast: ({ G, p }) => {
      G.offerTimewarpCards(p, (id) => twKind(id) === 'minor' && twCost(id) === 1 && bgCard(id).type === 'MINION', '天啟：發現一個次級時光扭曲的 1 費手下');
      G.offerTimewarpCards(p, (id) => twKind(id) === 'minor' && twCost(id) === 2 && bgCard(id).type === 'MINION', '天啟：發現一個次級時光扭曲的 2 費手下');
    },
    v: () => 10,
  },
  { id: 'BG34_Treasure_955', target: 'friend', filter: (m) => !m.golden, cast: ({ G, p }, t) => G.goldenize(p, t ?? undefined), v: () => 12 }, // 金卡轉化術
];

// —— 查詢 ——
/** 次級 / 高級時光扭曲（官方資料的等級 3 = 次級、5 = 高級） */
export function twKind(id: string): 'minor' | 'major' {
  return tierOf(id) >= 5 ? 'major' : 'minor';
}
/** 時光晶幣的價格 */
export function twCost(id: string): number {
  return hasBgCard(id) ? bgCard(id).cost ?? 1 : 1;
}
export const TW_SPELL_SPEC = new Map(TW_SPELLS.map((s) => [s.id, s]));
let twIds: string[] | null = null;
/** 有實作的時光扭曲卡（有資料的才算） */
/** 尤格薩輪（和尤格競技場同樣的六個結果） */
export function wheel(r: Recruit) {
  const p = r.p;
  const roll = Math.floor(r.rand() * 6);
  if (roll === 0) r.gainGold(3);
  else if (roll === 1) r.discover((id) => tierOf(id) <= p.tier, '命運之輪：發現一個手下');
  else if (roll === 2)
    times(2, () => {
      const id = recruitSpell(r);
      if (id) r.getSpell(id);
    });
  else if (roll === 3) p.board.forEach((m) => r.buff(m, 2, 2));
  else if (roll === 4) r.tavernBuff(3, 3);
  else {
    const m = r.pick(p.board.filter((x) => !x.golden && tierOf(x.id) <= 3));
    if (m) r.goldenize(m);
  }
  p.notes.push(`命運之輪：${['獲得 3 枚金幣', '發現一個手下', '拿到 2 張酒館法術', '手下 +2/+2', '酒館的手下 +3/+3', '一個低本手下變成金卡'][roll]}`);
}

/** 時光扭曲手下的造法法術 */
export const TW_CRAFT: SpellSpec[] = [
  { id: W('035t'), target: 'friend', cast: (_c, t) => void (t && (t.shield = true)), v: () => 5 }, // 時光扭曲皇冠
  {
    id: W('210t'), // 時光扭曲魚群
    target: 'friend',
    cast: ({ r, p }, t, g) => {
      if (!t) return;
      const n = Math.max(1, p.board.filter((m) => race(m, 'NAGA')).length);
      times(n, () => r.buff(t, 2 * g, 2 * g));
    },
    v: () => 6,
  },
  { id: W('212t'), target: 'friend', cast: ({ r }, t, g) => void (t && r.buff(t, 12 * g, 0)), v: () => 6 }, // 時光扭曲電鰻攻擊
  {
    id: W('324t'), // 時光扭曲召喚：把酒館裡的手下變成同類型的手下（等級不變）
    target: 'friend',
    cast: ({ G, p }, t) => {
      if (!t) return;
      const types = racesOf(t);
      const ok = (id: string) => (types.length ? types.some((x) => isRace(id, x)) : !racesOf(id).length);
      p.shop = p.shop.map((m) => {
        const id = G.draw((x) => tierOf(x) === tierOf(m.id) && ok(x));
        if (!id) return m;
        G.returnToPool(m);
        return G.shopMinion(p, id);
      });
    },
    v: () => 5,
  },
];

export function TW_IDS(): string[] {
  return (twIds ??= [...TW_MINIONS.map((s) => s.id), ...TW_SPELLS.map((s) => s.id)].filter((id) => hasBgCard(id)));
}

// —— 延遲取得（避免和 cards.ts / spells.ts 互相引用時還沒初始化）——
const POOL = () => LATE.pool;
const TAVERN = () => LATE.tavern;
const SPELLCRAFT = () => LATE.spellcraft;
const STATS = () => LATE.stats;
const SPEC_REF = LATE.spec;
const hasDr = (m: BMinion) => !!SPEC_REF.get(m.id)?.deathrattle || !!m.extraDr?.length || m.mags.some((x) => SPEC_REF.get(x.id)?.deathrattle);
const hasDrId = (id: string) => !!SPEC_REF.get(id)?.deathrattle;
const isPoolSpell = (id: string) => LATE.tavern.includes(id) || (hasBgCard(id) && !!bgCard(id).pool);
