// 不在目前酒館卡池裡、但飾品或異象會給的手下（例如「某某頭像」飾品）
// cards.ts 會把它們加進 SPEC（不在酒館卡池裡）；這裡只依賴 late.ts，避免循環引用
import type { Combat, MinionSpec } from './api';
import { isRace, tierOf } from './data';
import { isTavernSpell } from './late';
import { TRIBES, type BMinion, type BPlayer, type Tribe } from './types';

const GEM = 'BG20_GEM';
const FLEDGLING = 'BG29_801t';
const race = (m: BMinion, t: Tribe) => isRace(m.id, t);
const times = (g: number, f: () => void) => {
  for (let k = 0; k < g; k++) f();
};
const relic = (p: BPlayer, id: string) => !!p.relics?.includes(id);
/** 每種類型各一個友方手下 */
function onePerType(b: BMinion[]): BMinion[] {
  const used = new Set<BMinion>();
  for (const t of TRIBES) {
    const m = b.find((x) => race(x, t) && !used.has(x));
    if (m) used.add(m);
  }
  return [...used];
}
const gemStats = (c: Combat, side: 0 | 1, n: number): [number, number] => [n * (1 + c.cnt(side, 'gemA')), n * (1 + c.cnt(side, 'gemH'))];

export const LEGACY: MinionSpec[] = [
  {
    id: 'BG28_585', // 咆哮的列車長：回合開始時，棄掉一張法術獲得 4 枚金幣
    startTurn: (r, _s, g) => {
      const sp = r.p.hand.find((h) => h.kind === 'spell');
      if (!sp) return;
      r.discard(sp.uid);
      r.gainGold(4 * g);
    },
    syn: 'QUILBOAR',
    scale: 4,
  },
  {
    id: 'BG26_888', // 歌劇噴吐者：烈毒。亡語：賦予一個友方魚人烈毒
    deathrattle: (c, s, g) => {
      times(g, () => {
        const m = c.pick(c.friends(s).filter((x) => x !== s && race(x, 'MURLOC') && !x.venom));
        if (m) c.giveKw(m, 'venom');
      });
    },
    syn: 'MURLOC',
    val: 6,
  },
  {
    id: 'BG29_801', // 銀鵝：受到傷害時，召喚一隻有嘲諷的 2/2 雛鵝
    onDamaged: (c, s, _a, g) => void c.summon(c.side(s), c.make(FLEDGLING, g > 1), c.index(s) + 1),
    syn: 'BEAST',
    val: 4,
  },
  { id: FLEDGLING },
  {
    id: 'BG30_104', // 幸運蛋：戰吼：發現一個金色的 3 本手下並變成它
    battlecry: (r, s) => {
      r.destroy(s);
      r.discover((id) => tierOf(id) === 3, '幸運蛋：發現一個金色的旅店等級 3 手下', true);
    },
    val: 6,
  },
  {
    id: 'BG_BOT_606', // 炸炸機器人：亡語：對隨機敵方手下造成 4 點傷害
    deathrattle: (c, s, g) => {
      const extra = c.player(c.side(s)).relics?.includes('BG30_MagicItem_803') ? 10 : 0;
      times(g, () => {
        const t = c.pick(c.enemies(s));
        if (t) c.damage(t, 4 + extra, s);
      });
    },
    syn: 'MECHANICAL',
    val: 3,
  },
  {
    id: 'BG29_873', // 黏稠魔血：戰吼：酒館的手下本賽局 +2 生命值
    battlecry: (r, _s, g) => r.tavernBuff(relic(r.p, 'BG30_MagicItem_869') ? 2 * g : 0, 2 * g),
    val: 3,
  },
  {
    id: 'BG29_877', // 熾炎魔血：亡語：酒館的手下本賽局 +2 攻擊力
    deathrattle: (c, s, g) => {
      const side = c.side(s);
      const both = c.player(side).relics?.includes('BG30_MagicItem_869');
      c.counter(side, 'tavA', 2 * g);
      if (both) c.counter(side, 'tavH', 2 * g);
    },
    val: 3,
  },
  {
    id: 'BG_EX1_564', // 無面操縱者：戰吼：選擇一個手下，變成它的複製
    target: (s, t) => t !== s,
    battlecry: (_r, s, _g, t) => {
      if (!t) return;
      Object.assign(s, { id: t.id, atk: t.atk, hp: t.hp, golden: t.golden, taunt: t.taunt, shield: t.shield, windfury: t.windfury, venom: t.venom, reborn: t.reborn, mags: t.mags.slice(), gifts: t.gifts?.slice() });
    },
    val: 6,
  },
  { id: 'BG21_014', soc: (c, s, g) => c.friends(s).forEach((m) => race(m, 'DRAGON') && c.buff(m, 4 * g, 4 * g)), syn: 'DRAGON', val: 6 }, // 晉升幼龍
  {
    id: 'BG28_551', // 救贖者娜菈：施放酒館法術後，每種類型各一個友方手下 +4/+3
    onSpell: (r, _s, _t, g, id) => {
      if (!isTavernSpell(id)) return;
      const n = relic(r.p, 'BG30_MagicItem_944') ? 4 : 0;
      onePerType(r.p.board).forEach((m) => r.buff(m, (4 + n) * g, (3 + n) * g));
    },
    val: 8,
  },
  {
    id: 'BG21_005', // 飢餓的魔化蝙蝠：回合結束時，你的惡魔各吃掉一個酒館的手下
    endTurn: (r, _s, g) => {
      times(g, () => {
        for (const d of r.p.board.filter((m) => race(m, 'DEMON'))) {
          const f = r.pick(r.p.shop);
          if (f) r.consume(d, f);
        }
      });
    },
    syn: 'DEMON',
    scale: 8,
  },
  {
    id: 'BG26_157', // 剛鬃作曲家：報復 (2)：在你的野豬人身上使用 2 顆鮮血寶石
    avenge: [
      2,
      (c, s, g) => {
        const side = c.side(s);
        const all = c.player(side).relics?.includes('BG32_MagicItem_274');
        const [a, h] = gemStats(c, side, 2 * g);
        c.friends(s).forEach((m) => (all || race(m, 'QUILBOAR')) && c.buff(m, a, h));
      },
    ],
    syn: 'QUILBOAR',
    val: 8,
  },
  {
    id: 'BG26_350', // 貝斯魚人：亡語：召喚手牌中生命值最高的魚人（只限這場戰鬥）
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      const h = [...c.hand(side)].filter((m) => race(m, 'MURLOC')).sort((a, b) => b.hp - a.hp).slice(0, g);
      for (const m of h) {
        const x = c.make(m.id, m.golden);
        Object.assign(x, { atk: m.atk, hp: m.hp, taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, temp: true });
        c.summon(side, x, i);
      }
    },
    syn: 'MURLOC',
    val: 5,
  },
  {
    id: 'BG_OG_221', // 無私的英雄：亡語：賦予一個隨機友方手下聖盾
    deathrattle: (c, s, g) => {
      times(g, () => {
        const m = c.pick(c.friends(s).filter((x) => x !== s && !x.shield));
        if (m) c.giveKw(m, 'shield');
      });
    },
    val: 3,
  },
  {
    id: 'BG21_006', // 衝動的騙子：亡語：把最大生命值給另一個友方手下
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      const b = c.friends(s).filter((x) => x !== s);
      const adj = c.player(side).relics?.includes('BG32_MagicItem_820');
      const ts = adj ? [c.board(side).filter((x) => !x.dead)[i - 1], c.board(side).filter((x) => !x.dead)[i]].filter(Boolean) : [c.pick(b)].filter(Boolean);
      for (const t of ts) c.buff(t as BMinion, 0, (s.maxHp ?? s.hp) * g);
    },
    syn: 'DEMON',
    val: 5,
  },
  {
    id: 'BG29_140', // 栽贓小鬼：回合結束時，吃掉一個酒館的手下
    endTurn: (r, s, g) => {
      times(g, () => {
        if (!r.p.shop.length) return;
        const f = relic(r.p, 'BG32_MagicItem_824') ? r.p.shop.reduce((a, b) => (b.hp > a.hp ? b : a)) : r.pick(r.p.shop)!;
        r.consume(s, f);
      });
    },
    syn: 'DEMON',
    scale: 6,
  },
  { id: 'BG25_041', battlecry: (r, _s, g) => r.tavernBuff((2 + (relic(r.p, 'BG32_MagicItem_830') ? 2 : 0)) * g, (1 + (relic(r.p, 'BG32_MagicItem_830') ? 2 : 0)) * g), val: 4 }, // 魔化元素
  {
    id: 'BG27_513', // 潮汐神諭者莫戈：攻擊並殺死手下時，把它的最大身材給手牌中的一個手下
    afterAttack: (c, s, g, t, killed) => {
      if (!killed) return;
      const h = c.pick(c.hand(c.side(s)));
      if (h) (h.atk += t.atk * g), (h.hp += (t.maxHp ?? 1) * g);
    },
    syn: 'MURLOC',
    val: 10,
  },
  { id: 'BG31_822', battlecry: (r, _s, g) => times(g, () => r.getSpell('BG31_891')), syn: 'PIRATE', val: 4 }, // 頑強的獵頭者
  {
    id: 'BGS_066', // 掘金工
    endTurn: (r, s, g) => {
      const n = r.p.board.filter((m) => m.golden && m !== s).length;
      r.buff(s, 3 * n * g, 3 * n * g);
    },
    syn: 'PIRATE',
    scale: 6,
  },
  {
    id: 'BG31_826', // 金幣騙徒：每拿到 4 個海盜，金幣上限 +1
    onGetCard: (r, s, g) => {
      const h = r.p.hand[r.p.hand.length - 1];
      if (!h || h.kind !== 'minion' || !race(h.m, 'PIRATE')) return;
      s.n++;
      if (s.n % 4 === 0) r.p.maxGoldBonus += g;
    },
    syn: 'PIRATE',
    val: 5,
  },
  { id: 'BG31_360', onSellOther: (r, s, m, g) => void (race(m, 'ELEMENTAL') && r.buff(s, m.atk * g, m.hp * g)), syn: 'ELEMENTAL', scale: 10 }, // 秘法巨獸
  { id: 'BG35_151', endTurn: (r, _s, g) => times(g, () => r.addFodder(3)), syn: 'DEMON', scale: 5 }, // 林地褻瀆者
  { id: 'BG24_707', onFriendDeath: (c, s, d, g) => void (d.taunt && times(g, () => c.give(c.side(s), GEM))), syn: 'QUILBOAR', val: 4 }, // 豬鬃廢料鐵匠
  {
    id: 'BG33_840', // 踐踏劍龍：奮戰：賦予其他野獸 +3 攻擊力和這個奮戰
    rally: (c, s, g) => {
      for (const m of c.friends(s)) {
        if (m === s || !race(m, 'BEAST')) continue;
        c.buff(m, 3 * g, 0);
        if (!m.gifts?.includes('BG33_840')) (m.gifts ??= []).push('BG33_840');
      }
    },
    syn: 'BEAST',
    val: 7,
  },
  {
    id: 'BG34_639', // 終焉時刻之蛋：在手牌中 2 回合後，選擇一隻 6 本的龍孵化
    startTurn: (r, s) => {
      s.n++;
      if (s.n < 2) return;
      r.destroy(s);
      r.discover((id) => tierOf(id) === 6 && isRace(id, 'DRAGON'), '終焉時刻之蛋：選擇要孵化的龍', s.golden);
    },
    val: 6,
  },
  {
    id: 'BG35_140', // 媽媽莫格頓：戰吼：其他魚人 +3 攻擊力（每打出一個莫格頓強化）
    battlecry: (r, s, g) => {
      const n = 3 + (r.p.c.mrrgl ?? 0);
      r.p.board.forEach((m) => m !== s && race(m, 'MURLOC') && r.buff(m, n * g, 0));
      r.counter('mrrgl', 1);
    },
    syn: 'MURLOC',
    val: 5,
  },
  {
    id: 'BG35_141', // 爸爸莫格頓：戰吼：其他魚人 +3 生命值（每打出一個莫格頓強化）
    battlecry: (r, s, g) => {
      const n = 3 + (r.p.c.mrrgl ?? 0);
      r.p.board.forEach((m) => m !== s && race(m, 'MURLOC') && r.buff(m, 0, n * g));
      r.counter('mrrgl', 1);
    },
    syn: 'MURLOC',
    val: 5,
  },
  {
    id: 'BG31_817', // 風落龍捲：賣掉時，發現一個元素並給它這個手下的身材
    onSell: (r, s) => r.discoverBonus((id) => isRace(id, 'ELEMENTAL') && tierOf(id) <= r.p.tier, `風落龍捲：發現一個元素（+${s.atk}/+${s.hp}）`, s.atk, s.hp),
    syn: 'ELEMENTAL',
    val: 5,
  },
  {
    id: 'BG32_172', // 自動組裝機：磁力。亡語：召喚一個先祖自動機
    magnetic: true,
    deathrattle: (c, s, g, i) => times(g, () => void c.summon(c.side(s), c.make('BG_TTN_401'), i)),
    syn: 'MECHANICAL',
    val: 4,
  },
];

/** 這些手下的卡牌 ID（會加進衍生物） */
export const LEGACY_IDS = LEGACY.map((s) => s.id);
