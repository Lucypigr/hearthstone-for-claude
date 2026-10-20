// 英雄夥伴（每位英雄的專屬手下；開啟「英雄夥伴」時才會出現夥伴按鈕）
// 只收錄效果能完整執行的夥伴；沒有實作的英雄不會有夥伴按鈕
import type { MinionSpec, Recruit } from './api';
import { hasBgCard, isRace, racesOf, tierOf } from './data';
import { upgradeFor, ZERG } from './herocards';
import { TW_MINIONS, wheel } from './timewarp';
import { hasBattlecry, isTavernSpell, LATE, mostCommonType, spellCostOf } from './late';
import { BONUS_KEYWORDS, TRIBES, type BMinion, type Tribe } from './types';

const B = (hero: string) => `${hero}_Buddy`;
const COIN = 'BG28_810';
const GEM = 'BG20_GEM';
const times = (g: number, f: () => void) => {
  for (let k = 0; k < g; k++) f();
};
/** 時光扭曲手下的效果（有些夥伴和時光扭曲的手下一樣） */
const TW = (n: string) => TW_MINIONS.find((x) => x.id === `BG34_Giant_${n}`)!;
/** 「有用的卡」：幸運幣、酒館法術或你的等級的手下 */
function helpful(r: Recruit) {
  const roll = r.rand();
  if (roll < 0.4) return r.getSpell(COIN);
  if (roll < 0.8) {
    const id = r.drawSpell((x) => tierOf(x) <= r.p.tier);
    if (id) return r.getSpell(id);
  }
  r.getRandom((id) => tierOf(id) === r.p.tier);
}
const race = (m: BMinion, t: Tribe) => isRace(m, t);
function distinctTypes(b: BMinion[]): number {
  const set = new Set<Tribe>();
  let wild = 0;
  for (const m of b) {
    const r = racesOf(m);
    if (r.length === TRIBES.length) wild++;
    else r.forEach((t) => set.add(t));
  }
  return Math.min(TRIBES.length, set.size + wild);
}

export const BUDDIES: MinionSpec[] = [
  // 軍情七處斥候：購買卡牌後 +2/+2
  { id: B('TB_BaconShop_HERO_01'), onBuy: (r, s, _m, g) => r.buff(s, 2 * g, 2 * g), onBuySpell: (r, s, _id, g) => r.buff(s, 2 * g, 2 * g), scale: 4 },
  // 阿福斯：友方手下復生後，賦予它這個手下的攻擊力
  { id: B('TB_BaconShop_HERO_22'), onFriendReborn: (c, s, m, g) => c.buff(m, s.atk * g, 0), syn: 'UNDEAD', val: 4 },
  // 發條助手：戰吼：發現一個比你高一本的手下
  {
    id: B('TB_BaconShop_HERO_28'),
    battlecry: (r, _s, g) => {
      for (let k = 0; k < g; k++) r.discover((id) => tierOf(id) === Math.min(7, r.p.tier + 1), '發條助手：發現一個高一本的手下');
    },
    val: 6,
  },
  // 瓦莉絲瑞雅‧夢行者：龍進入戰隊或酒館後 +1/+1
  {
    id: B('TB_BaconShop_HERO_53'),
    onPlay: (r, s, m, g) => void (race(m, 'DRAGON') && r.buff(s, g, g)),
    onRefresh: (r, s, g) => {
      const n = r.p.shop.filter((m) => race(m, 'DRAGON')).length;
      r.buff(s, n * g, n * g);
    },
    syn: 'DRAGON',
    scale: 3,
  },
  // 風之靈：亡語：賦予一個隨機友方手下風怒、聖盾、嘲諷
  {
    id: B('TB_BaconShop_HERO_76'),
    deathrattle: (c, s, g) => {
      const pool = c.friends(s).filter((m) => m !== s);
      for (let k = 0; k < g; k++) {
        const m = c.pick(pool.filter((x) => !(x.windfury && x.shield && x.taunt)));
        if (!m) return;
        c.giveKw(m, 'windfury');
        c.giveKw(m, 'shield');
        c.giveKw(m, 'taunt');
      }
    },
    val: 5,
  },
  // 亞煞拉懼寶寶：召喚一個你的等級的手下後，你的手下 +1/+1
  {
    id: B('TB_BaconShop_HERO_92'),
    onPlay: (r, _s, m, g) => {
      if (tierOf(m.id) !== r.p.tier) return;
      for (const x of r.p.board) r.buff(x, g, g);
    },
    onSummon: (c, s, m, g) => {
      if (tierOf(m.id) !== c.heroTier(c.side(s))) return;
      for (const x of c.friends(s)) c.buff(x, g, g);
    },
    scale: 4,
  },
  // 瑪洛尼：本賽局每花 3 枚金幣 +1/+1
  {
    id: B('BG32_HERO_001'),
    aura: (cnt, _s, g) => {
      const n = Math.floor((cnt.spentTotal ?? 0) / 3) * g;
      return [n, n];
    },
    syn: 'BEAST',
    scale: 3,
  },
  // 德拉諾許‧薩魯法爾：購買手下後，獲得它一半的身材
  { id: B('BG20_HERO_102'), onBuy: (r, s, m, g) => r.buff(s, Math.floor(m.atk / 2) * g, Math.floor(m.hp / 2) * g), scale: 4 },
  // 閃耀的水手：每次刷新多一個海盜
  {
    id: B('BG26_HERO_101'),
    onRefresh: (r, _s, g) => {
      for (let k = 0; k < g; k++) {
        const id = r.drawId((x) => isRace(x, 'PIRATE') && tierOf(x) <= r.p.tier);
        if (id) r.p.shop.push(r.make(id));
      }
    },
    syn: 'PIRATE',
    val: 3,
  },
  // 雙六：回合開始時擲骰子，發現一張那個等級的酒館法術
  {
    id: B('BG28_HERO_400'),
    startTurn: (r, _s, g) => {
      for (let k = 0; k < g; k++) {
        const t = 1 + Math.floor(r.rand() * 6);
        r.discoverSpell((id) => tierOf(id) === t, `雙六擲出了 ${t}：發現一張旅店等級 ${t} 的酒館法術`);
      }
    },
    scale: 4,
  },
  // 鯊鯊：賣掉時，重置你的英雄能力
  { id: B('TB_BaconShop_HERO_68'), onSell: (r) => void ((r.p.powerUses = 0), (r.p.powerSpent = false)), val: 2 },
  // 霜狼中尉：回合結束時，最左邊的手下 +10 攻擊力
  { id: B('BG22_HERO_002'), endTurn: (r, _s, g) => void (r.p.board[0] && r.buff(r.p.board[0], 10 * g, 0)), scale: 10 },
  // 雷矛士官：回合結束時，最右邊的手下 +10 生命值
  { id: B('BG22_HERO_003'), endTurn: (r, _s, g) => void (r.p.board.length && r.buff(r.p.board[r.p.board.length - 1], 0, 10 * g)), scale: 10 },
  // 塔姆卓：戰鬥中召喚手下後，讓它的身材變成兩倍
  { id: B('BG23_HERO_201'), onSummon: (c, _s, m, g) => c.buff(m, m.atk * g, m.hp * g), syn: 'BEAST', val: 8 },
  // 老練的獵人：回合開始時，拿到上一個對手的夥伴
  {
    id: B('TB_BaconShop_HERO_50'),
    startTurn: (r, _s, g) => {
      const opp = r.p.lastOpp !== null && r.p.lastOpp >= 0 ? r.p.seen[r.p.lastOpp] : undefined;
      if (!opp) return;
      const id = B(opp.heroId);
      if (BUDDY_IDS.has(id) && id !== B('TB_BaconShop_HERO_50')) for (let k = 0; k < g; k++) r.getMinion(id);
    },
    scale: 6,
  },
  // 瓦拉斯塔茲：奮戰：拿到一張隨機的龍
  { id: B('TB_BaconShop_HERO_56'), rally: (c, s, g) => void [...Array(g)].forEach(() => c.giveRandom(c.side(s), (id) => isRace(id, 'DRAGON') && tierOf(id) <= c.heroTier(c.side(s)))), syn: 'DRAGON', val: 4 },
  // 布萊恩的史詩蛋蛋：亡語：召喚並拿到一個隨機的戰吼手下
  {
    id: B('TB_BaconShop_HERO_43'),
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      for (let k = 0; k < g; k++) {
        const id = c.pick(BATTLECRY_POOL().filter((x) => c.inLobby(x) && tierOf(x) <= c.heroTier(side)));
        if (!id) return;
        c.give(side, id);
        c.summon(side, c.make(id), i + k);
      }
    },
    val: 5,
  },
  // 許多幼龍：召喚雛龍後，永久 +2/+2
  { id: B('BG22_HERO_305'), onSummon: (c, s, m, g) => void (m.id === 'BG22_HERO_305t' && c.perm(s, 2 * g, 2 * g)), syn: 'DRAGON', val: 3 },
  // 塔加瓦格長老：起始戰鬥：如果你有 4 種不同類型的手下，獲得手下中最高的攻擊力與生命值
  {
    id: B('TB_BaconShop_HERO_14'),
    soc: (c, s, g) => {
      const fr = c.friends(s);
      if (distinctTypes(fr) < 4) return;
      c.buff(s, Math.max(...fr.map((m) => m.atk)) * g, Math.max(...fr.map((m) => m.hp)) * g);
    },
    val: 8,
  },
  // 活化夢魘：購買卡牌後，酒館的手下這回合 +2/+2
  {
    id: B('BG20_HERO_280'),
    onBuy: (r, _s, _m, g) => r.p.shop.forEach((m) => r.tmpBuff(m, 2 * g, 2 * g)),
    onBuySpell: (r, _s, _id, g) => r.p.shop.forEach((m) => r.tmpBuff(m, 2 * g, 2 * g)),
    val: 3,
  },
  // 小科多獸：戰吼：用每個等級各一個手下刷新酒館
  { id: B('BG20_HERO_242'), battlecry: (r) => r.restock([...Array(r.p.tier)].map((_, t) => (id: string) => tierOf(id) === t + 1)), val: 4 },
  // 惡魔獵人斯克力伯：每次刷新多一個高一本的手下
  {
    id: B('TB_BaconShop_HERO_59'),
    onRefresh: (r, _s, g) => {
      for (let k = 0; k < g && r.p.tier < 6; k++) {
        const id = r.drawId((x) => tierOf(x) === r.p.tier + 1);
        if (id) r.p.shop.push(r.make(id));
      }
    },
    val: 5,
  },
  // 聖匣侍從：每回合一次，施放酒館法術後拿到一張新的
  {
    id: B('BG28_HERO_800'),
    onSpell: (r, _s, _t, g, id) => {
      if (!isTavernSpell(id) || (r.p.c['t:b800'] ?? 0) >= g) return;
      r.counter('t:b800', 1);
      r.getSpell(id);
    },
    val: 5,
  },
  // 九蛙：購買手下後，拿到一張同等級的隨機酒館法術（9 次）
  {
    id: B('BG28_HERO_801'),
    onBuy: (r, s, m, g) => {
      if (s.n >= 9) return;
      s.n++;
      for (let k = 0; k < g; k++) {
        const id = r.drawSpell((x) => tierOf(x) === tierOf(m.id));
        if (id) r.getSpell(id);
      }
    },
    text: (m) => `購買手下後，拿到一張同等級的隨機酒館法術（還剩 ${9 - m.n} 次）`,
    val: 6,
  },
  // 星穹記錄：購買 (0) 費的酒館法術時，拿到一張複製
  { id: B('BG31_HERO_006'), onBuySpell: (r, _s, id, g) => void (spellCostOf(id) === 0 && [...Array(g)].forEach(() => r.getSpell(id))), val: 2 },
  // 外域陽光：戰吼：發現一張 (3) 費以上、任何等級的酒館法術
  { id: B('BG31_HERO_003'), battlecry: (r, _s, g) => [...Array(g)].forEach(() => r.discoverSpell((id) => spellCostOf(id) >= 3, '外域陽光：發現一張 (3) 費以上的酒館法術')), val: 5 },
  // 油燈看管者：回合結束時，拿到 2 張隨機的加身材酒館法術
  {
    id: B('TB_BaconShop_HERO_75'),
    endTurn: (r, _s, g) => {
      for (let k = 0; k < 2 * g; k++) {
        const id = r.pick(LATE.stats.filter((x) => r.spellInLobby(x) && tierOf(x) <= r.p.tier));
        if (id) r.getSpell(id);
      }
    },
    scale: 5,
  },
  // 小伊萊克：打出攻擊力比這個手下低的手下時，賦予它 +1/+1 並強化此卡
  {
    id: B('BG20_HERO_101'),
    onPlay: (r, s, m, g) => {
      if (m.atk >= s.atk) return;
      r.buff(m, (1 + s.n) * g, (1 + s.n) * g);
      s.n++;
    },
    syn: 'BEAST',
    scale: 3,
  },
  // 加德林大師：起始戰鬥：賦予左邊的手下等同其攻擊力的生命值
  {
    id: B('BG20_HERO_201'),
    soc: (c, s, g) => {
      const b = c.friends(s);
      const l = b[b.indexOf(s) - 1];
      if (l) c.buff(l, 0, l.atk * g);
    },
    val: 6,
  },
  // 畸形怪物：友方手下死亡後，獲得它的攻擊力
  { id: B('BG20_HERO_282'), onFriendDeath: (c, s, d, g) => c.buff(s, d.atk * g, 0), syn: 'UNDEAD', val: 6 },
  // 副主廚：英雄能力每回合可以多用一次（在 game.ts 處理）
  { id: B('BG21_HERO_020'), val: 4 },
  // 水下清潔機：打出機械後 +3/+3
  { id: B('BG22_HERO_200'), onPlay: (r, s, m, g) => void (race(m, 'MECHANICAL') && r.buff(s, 3 * g, 3 * g)), syn: 'MECHANICAL', scale: 3 },
  // 潛海主廚：戰吼：拿到等級 1、3、5 各一個隨機手下
  { id: B('BG22_HERO_201'), battlecry: (r, _s, g) => [1, 3, 5].forEach((t) => [...Array(g)].forEach(() => r.getRandom((id) => tierOf(id) === t))), val: 6 },
  // 強化醫療機：購買手下後，它每有一個額外關鍵字就 +3/+3
  {
    id: B('BG24_HERO_204'),
    onBuy: (r, s, m, g) => {
      const n = BONUS_KEYWORDS.filter((k) => m[k]).length;
      r.buff(s, 3 * n * g, 3 * n * g);
    },
    syn: 'MECHANICAL',
    scale: 2,
  },
  // 幽暗靈體：友方手下死亡時，獲得它的最大身材（每場戰鬥一次）
  {
    id: B('BG25_HERO_103'),
    onFriendDeath: (c, s, d, g) => {
      if ((s.uses ?? 0) >= g) return;
      s.uses = (s.uses ?? 0) + 1;
      c.buff(s, d.atk, d.maxHp ?? 1);
    },
    val: 5,
  },
  // 『石犀牛』阿卡利：每 2 回合結束時，拿到一張手牌最左邊的卡的複製
  {
    id: B('BG26_HERO_104'),
    endTurn: (r, _s, g) => {
      if (r.turn % 2) return;
      const card = r.p.hand[0];
      if (!card) return;
      for (let k = 0; k < g; k++) {
        if (card.kind === 'minion') r.give(r.make(card.m.id));
        else r.getSpell(card.id);
      }
    },
    scale: 3,
  },
  // 風暴之王的坐騎維拉努斯：回合結束時，把左邊的手下變成高一本的手下
  {
    id: B('BG27_HERO_801'),
    endTurn: (r, s, g) => {
      for (let k = 0; k < g; k++) {
        const i = r.p.board.indexOf(s);
        const l = r.p.board[i - 1];
        if (!l || tierOf(l.id) >= 6) return;
        const id = r.drawId((x) => tierOf(x) === tierOf(l.id) + 1);
        if (id) r.p.board[i - 1] = r.make(id);
      }
    },
    syn: 'DRAGON',
    scale: 4,
  },
  // 葛拉克朗的使徒：戰吼：把酒館的卡換成高一本的
  { id: B('TB_BaconShop_HERO_02'), battlecry: (r) => r.restock(r.p.shop.map((m) => (id: string) => tierOf(id) === Math.min(6, tierOf(m.id) + 1))), val: 4 },
  // 污水大亨：回合結束時，你的金幣上限 +1
  { id: B('TB_BaconShop_HERO_10'), endTurn: (r, _s, g) => void (r.p.maxGoldBonus += g), scale: 4 },
  // 魯西弗隆：你的回合結束效果多觸發一次（在 game.ts 處理）
  { id: B('TB_BaconShop_HERO_11'), val: 5 },
  // 零食小販：回合結束時，把這個手下的身材給一個等級 3 的手下
  {
    id: B('TB_BaconShop_HERO_16'),
    endTurn: (r, s, g) => {
      const t = r.pick(r.p.board.filter((m) => m !== s && tierOf(m.id) === 3));
      if (t) r.buff(t, s.atk * g, s.hp * g);
    },
    scale: 6,
  },
  // 巨牙海民劫掠者：戰吼、亡語、奮戰：拿到一張隨機的懸賞
  {
    id: B('TB_BaconShop_HERO_18'),
    battlecry: (r, _s, g) => [...Array(g)].forEach(() => r.getSpell(r.pick(LATE.bounties.filter((x) => r.spellInLobby(x)))!)),
    deathrattle: (c, s, g) => [...Array(g)].forEach(() => c.give(c.side(s), c.pick(LATE.bounties.filter((x) => c.inLobbySpell(x)))!)),
    rally: (c, s, g) => [...Array(g)].forEach(() => c.give(c.side(s), c.pick(LATE.bounties.filter((x) => c.inLobbySpell(x)))!)),
    syn: 'PIRATE',
    val: 5,
  },
  // 擲泥者：戰吼：拿到一張隨機的戰吼手下
  { id: B('TB_BaconShop_HERO_23'), battlecry: (r, _s, g) => [...Array(g)].forEach(() => r.getRandom((id) => hasBattlecry(id) && tierOf(id) <= r.p.tier)), val: 4 },
  // 基瑞克：嘲諷，亡語：拿到一張隨機的惡魔
  { id: B('TB_BaconShop_HERO_37'), deathrattle: (c, s, g) => [...Array(g)].forEach(() => c.giveRandom(c.side(s), (id) => isRace(id, 'DEMON') && tierOf(id) <= c.heroTier(c.side(s)))), syn: 'DEMON', val: 3 },
  // 『威猛蟲騎』麥斯威爾：賣掉時，拿到你英雄能力的夥伴
  {
    id: B('TB_BaconShop_HERO_40'),
    onSell: (r) => {
      const id = B(r.p.powerHero ?? r.p.heroId);
      if (BUDDY_IDS.has(id) && id !== B('TB_BaconShop_HERO_40')) r.getMinion(id);
    },
    val: 3,
  },
  // 亮鰭預言者：戰吼：把酒館的手下變成同等級的魚人
  { id: B('TB_BaconShop_HERO_55'), battlecry: (r) => r.restock(r.p.shop.map((m) => (id: string) => isRace(id, 'MURLOC') && tierOf(id) === tierOf(m.id))), syn: 'MURLOC', val: 3 },
  // 達格威‧黏趾：回合結束時，隨機一個友方金卡 +5/+5
  {
    id: B('TB_BaconShop_HERO_64'),
    endTurn: (r, _s, g) => {
      const m = r.pick(r.p.board.filter((x) => x.golden));
      if (m) r.buff(m, 5 * g, 5 * g);
    },
    syn: 'PIRATE',
    scale: 4,
  },
  // 淵誓守靈者：亡語：召喚 2 個隨機的不死族
  {
    id: B('TB_BaconShop_HERO_702'),
    deathrattle: (c, s, g, i) => {
      const side = c.side(s);
      for (let k = 0; k < 2; k++) {
        const id = c.pick(UNDEAD_POOL().filter((x) => c.inLobby(x) && tierOf(x) <= c.heroTier(side)));
        if (id) c.summon(side, c.make(id, g > 1), i + k);
      }
    },
    syn: 'UNDEAD',
    val: 6,
  },
  // 恩若司寶寶：戰吼：讓一個友方亡語手下變成金卡
  {
    id: B('TB_BaconShop_HERO_93'),
    target: (_s, t) => !t.golden && DR_POOL().includes(t.id),
    battlecry: (r, _s, _g, t) => void (t && r.goldenize(t)),
    val: 5,
  },
  // 飛行教練：你的航線觸發兩次（在飆翼的英雄能力處理）
  { id: B('BG20_HERO_283'), val: 4 },
  // 雷義‧焰掌：回合開始時，拿到你英雄能力的夥伴
  {
    id: B('BG20_HERO_202'),
    startTurn: (r) => {
      const id = B(r.p.powerHero ?? r.p.heroId);
      if (BUDDY_IDS.has(id) && id !== B('BG20_HERO_202')) r.getMinion(id);
    },
    scale: 5,
  },
  // 常青波塔尼：回合結束時，拿到一個你的等級的隨機手下
  { id: B('TB_BaconShop_HERO_74'), endTurn: (r, _s, g) => [...Array(g)].forEach(() => r.getRandom((id) => tierOf(id) === r.p.tier)), scale: 5 },
  // 瑪格努斯‧曼納斯頓：每回合 2 次刷新免費（在 game.ts 處理）
  { id: B('TB_BaconShop_HERO_49'), val: 4 },
  // 小憎惡體：回合結束時，賦予左邊的手下 +1 生命值（英雄每少 1 點生命值多 +1）
  {
    id: B('TB_BaconShop_HERO_34'),
    endTurn: (r, s, g) => {
      const i = r.p.board.indexOf(s);
      const l = r.p.board[i - 1];
      const max = r.p.heroId === 'TB_BaconShop_HERO_34' ? 60 : 30;
      if (l) r.buff(l, 0, (1 + Math.max(0, max - r.p.hp)) * g);
    },
    scale: 8,
  },
  // 皇家防衛者：對另一個友方手下施放法術後，也對這個手下施放（每回合一次）
  {
    id: B('BG22_HERO_007'),
    onSpell: (r, s, t, g, id) => {
      if (!t || t === s || !r.p.board.includes(t) || (r.p.c['t:b007'] ?? 0) >= g) return;
      r.counter('t:b007', 1);
      r.castOn(id, s);
    },
    syn: 'NAGA',
    val: 4,
  },

  // ———— 第二批夥伴 ————
  // 強大的冰哮：友方手下擊殺敵人後，永久 +3 生命值
  { id: B('BG20_HERO_100'), onSideKill: (c, s, _k, _v, g) => c.perm(s, 0, 3 * g), val: 4 },
  // 亡首賢者：拿到鮮血寶石時多拿一顆
  {
    id: B('BG20_HERO_103'),
    onGetCard: (r, _s, g, card) => {
      if (card.kind !== 'spell' || card.id !== GEM || r.p.c['~sage']) return;
      r.p.c['~sage'] = 1;
      try {
        r.getGems(g);
      } finally {
        r.p.c['~sage'] = 0;
      }
    },
    syn: 'QUILBOAR',
    val: 4,
  },
  // 夢魘軟漿怪：被吞噬時多吐給一個手下（在 heroes.ts 處理）
  { id: B('BG20_HERO_301'), val: 3 },
  // 法莫斯隊長：回合結束時隨機強化「信念」
  {
    id: B('BG21_HERO_000'),
    endTurn: (r, _s, g) => {
      for (let k = 0; k < g; k++) {
        const roll = Math.floor(r.rand() * 3);
        if (roll === 0) r.counter('carN', 1);
        else r.counter(roll === 1 ? 'carA' : 'carH', 2);
      }
    },
    scale: 4,
  },
  // 典獄官塞爾沃特：回合開始時拿到下一個對手的夥伴
  {
    id: B('BG21_HERO_010'),
    startTurn: (r, _s, g) => {
      const o = r.G.opponentOf(r.p.idx);
      const id = o !== null && o >= 0 ? B(r.G.player(o).heroId) : null;
      if (id && BUDDY_IDS.has(id)) for (let k = 0; k < g; k++) r.give(r.make(id));
    },
    val: 6,
  },
  // 有駕駛的迴旋機器人：複製最左邊兩個亡語
  { ...TW('599'), id: B('BG21_HERO_030') },
  // 阿蟹：用「上膛」移除手下後拿到分身（在 heroes.ts 處理）
  { id: B('BG22_HERO_000'), val: 4 },
  // 幽靈迅猛龍：記住叫過的元素，亡語時一起叫出來
  {
    id: B('BG22_HERO_001'),
    deathrattle: (c, s, g) => {
      for (let k = 0; k < 4; k++) if (s.n & (1 << k)) for (let t = 0; t < g; t++) LATE.brukan(c, c.side(s), k + 1);
    },
    text: (m) => {
      const names = ['大地', '火焰', '流水', '雷電'].filter((_x, k) => m.n & (1 << k));
      return `在你叫出新的元素後，記住它。亡語：叫出這些元素${names.length ? `（${names.join('、')}）` : ''}`;
    },
    val: 4,
  },
  // 瓦登的水靈戰士（在 heroes.ts 處理）
  { id: B('BG22_HERO_004'), scale: 4 },
  // 蛙生（在 game.ts 處理）
  { id: B('BG23_HERO_303'), val: 4 },
  // 盤牙精英：造法手下出現在酒館時，拿到它的法術
  {
    id: B('BG23_HERO_304'),
    onRefresh: (r, _s, g) => {
      for (const m of r.p.shop) {
        const sc = LATE.spec.get(m.id)?.spellcraft;
        if (sc) for (let k = 0; k < g; k++) r.getSpell(sc, 1, true);
      }
    },
    syn: 'NAGA',
    val: 4,
  },
  // 『蠟滴』瓦蠟雷德：戰吼：酒館換成每個對手戰隊裡最高等級的手下
  {
    id: B('BG23_HERO_305'),
    battlecry: (r) => {
      const ids = r.G.alive()
        .filter((q) => q !== r.p && q.board.length)
        .map((q) => q.board.reduce((a, b) => (tierOf(b.id) > tierOf(a.id) ? b : a)).id)
        .filter((id) => LATE.pool.includes(id));
      if (!ids.length) return;
      for (const m of r.p.shop) r.G.returnToPool(m);
      r.p.shop = ids.slice(0, 7).map((id) => r.G.shopMinion(r.p, id));
    },
    val: 6,
  },
  // 納薩諾斯‧凋零者：戰吼：賣掉一個友方手下，身材平分給兩旁
  {
    id: B('BG23_HERO_306'),
    target: (s, t) => t !== s,
    battlecry: (r, _s, g, t) => {
      if (!t) return;
      const i = r.p.board.indexOf(t);
      const ns = [r.p.board[i - 1], r.p.board[i + 1]].filter((m): m is BMinion => !!m);
      const { atk, hp } = t;
      r.G.sellRaw(r.p, t);
      for (const m of ns) r.buff(m, Math.floor((atk * g) / ns.length), Math.floor((hp * g) / ns.length));
    },
    val: 5,
  },
  // 陰險貴族：賣掉時發現一個任務，完成拿到 8 枚金幣
  { id: B('BG24_HERO_100'), onSell: (r) => r.G.offerQuests(r.p, 2, B('BG24_HERO_100')), val: 5 },
  // 膿腸：召喚並拿到一個不死族造物
  { ...TW('590'), id: B('BG25_HERO_100') },
  // 星探：戰吼：讓一個夥伴變成金卡
  { id: B('BG25_HERO_105'), target: (s, t) => t !== s && t.id.endsWith('_Buddy') && !t.golden, battlecry: (r, _s, _g, t) => void (t && r.goldenize(t)), val: 5 },
  // 莊嚴詠唱者：英雄能力對手下使用後，它獲得這個手下一半的攻擊力（每回合換成生命值）
  {
    id: B('BG26_HERO_102'),
    startTurn: (_r, s) => void (s.n = s.n ? 0 : 1),
    onPowerUse: (r, s, t, g) => {
      if (!t) return;
      const n = Math.floor(s.atk / 2) * g;
      if (s.n) r.buff(t, 0, n);
      else r.buff(t, n, 0);
    },
    val: 4,
  },
  // 驚奇行李員：回合結束時拿到一張有用的卡
  { id: B('BG30_HERO_304'), endTurn: (r, _s, g) => times(g, () => helpful(r)), val: 6 },
  // 迷你澤瑞克：戰吼：選酒館裡的一個手下，變成它的複製
  {
    id: B('BG31_HERO_005'),
    battlecry: (r, s) => {
      const ids = [...new Set(r.p.shop.map((m) => m.id))].slice(0, 3);
      r.offer(ids, '迷你澤瑞克：選擇要變成的手下', { transform: s.uid, golden: s.golden });
    },
    val: 5,
  },
  // 泰科斯‧芬利：施放兩張酒館法術後拿到隨機的戰巡艦升級
  {
    id: B('BG31_HERO_801'),
    onSpell: (r, s, _t, g, id) => {
      if (!isTavernSpell(id) || ++s.n % 2) return;
      for (let k = 0; k < g; k++) {
        const up = upgradeFor(r.p.tier, () => r.rand());
        if (up) r.getSpell(up);
      }
    },
    val: 5,
  },
  // 普羅比斯：吸附到機械上讓它變成金卡（在 game.ts 處理）
  { id: B('BG31_HERO_802'), magnetic: true, syn: 'MECHANICAL', val: 6 },
  // 碎角異化蟲：賣掉時發現一個 6/6 的蟲族
  {
    id: B('BG31_HERO_811'),
    onSell: (r, _s, g) => {
      for (let k = 0; k < g; k++) {
        const bag = ZERG.flat().filter((id) => hasBgCard(id));
        const opts: string[] = [];
        while (opts.length < 3 && bag.length) opts.push(bag.splice(Math.floor(r.rand() * bag.length), 1)[0]);
        r.offer(opts, '碎角異化蟲：發現一個 6/6 的蟲族', { stats: [6, 6] });
      }
    },
    val: 6,
  },
  // 拉鍊仔：亡語：拿到一張有用的卡
  { id: B('BG32_HERO_002'), deathrattle: (c, s, g) => times(g, () => c.give(c.side(s), c.rand() < 0.5 ? COIN : c.pick(LATE.tavern.filter((id) => c.inLobbySpell(id) && tierOf(id) <= c.heroTier(c.side(s)))) ?? COIN)), val: 5 },
  // 石殼守護者：每回合第一個三合一獎勵發現金卡（在 game.ts 處理）
  { id: B('BG33_HERO_000'), val: 6 },
  // 伊克利普森伊利達瑞：第一個攻擊的手下這次攻擊免疫（在 combat.ts 處理）
  { id: B('TB_BaconShop_HERO_08'), val: 4 },
  // 鴿子領主（在 game.ts 處理）
  { id: B('TB_BaconShop_HERO_12'), val: 4 },
  // 迷路的卡爾：使用英雄能力後，聖盾手下 +2 攻擊力
  { id: B('TB_BaconShop_HERO_15'), onPowerUse: (r, _s, _t, g) => r.p.board.forEach((m) => m.shield && r.buff(m, 2 * g, 0)), scale: 4 },
  // 源質松鼠炸彈：亡語：本場戰鬥每死一個機械，對隨機敵人造成 4 點傷害
  {
    id: B('TB_BaconShop_HERO_17'),
    onFriendDeath: (_c, s, d) => void (race(d, 'MECHANICAL') && (s.uses = (s.uses ?? 0) + 1)),
    deathrattle: (c, s, g) => {
      for (let k = 0; k < (s.uses ?? 0) * g; k++) {
        const t = c.pick(c.enemies(s));
        if (t) c.damage(t, 4, s);
      }
    },
    syn: 'MECHANICAL',
    val: 5,
  },
  // 街頭魔術師：變戲法改成進階奧秘（在 heroes.ts 處理）
  { id: B('TB_BaconShop_HERO_21'), val: 4 },
  // 出土嘍囉：英雄受到傷害時倒轉回去，獲得等量的身材（在 game.ts 處理）
  { id: B('TB_BaconShop_HERO_25'), scale: 5 },
  // 解凍勇士：回合結束時讓酒館裡一個凍結的手下變成金卡
  {
    id: B('TB_BaconShop_HERO_27'),
    endTurn: (r, _s, g) => {
      for (let k = 0; k < g; k++) {
        const m = r.pick(r.p.shop.filter((x) => (r.p.frozen || x.iced) && !x.golden));
        if (m) r.goldenize(m);
      }
    },
    val: 6,
  },
  // 克蘇恩的觸手：另一個友方手下獲得身材後，+1/+1 直到下一回合
  { id: B('TB_BaconShop_HERO_29'), onStatGain: (r, s, m, _a, _h, g) => void (m !== s && r.tmpBuff(s, g, g)), scale: 5 },
  // 混聚體：你的聚合體獲得身材時，這個也獲得
  { id: B('TB_BaconShop_HERO_33'), onStatGain: (_r, s, m, a, h, g) => void (m.id === 'TB_BaconShop_HP_033t' && ((s.atk += a * g), (s.hp += h * g))), scale: 5 },
  // 尤格薩倫侍僧：回合開始時轉動尤格薩輪
  { id: B('TB_BaconShop_HERO_35'), startTurn: (r, _s, g) => times(g, () => wheel(r)), val: 6 },
  // 『男裝商人』艾許：賣掉手下後獲得兩頂 +1/+1 的帽子
  {
    id: B('TB_BaconShop_HERO_36'),
    onSellOther: (_r, s, _m, g) => {
      s.atk += 2 * g;
      s.hp += 2 * g;
      s.hat = (s.hat ?? 0) + 2 * g;
    },
    scale: 5,
  },
  // 瘋狂的猴子：賣掉時餵你的手下香蕉；施放 2 張法術後強化
  {
    id: B('TB_BaconShop_HERO_38'),
    onSell: (r, s, g) => {
      const n = (1 + Math.floor(s.n / 2)) * g;
      for (const m of r.p.board) if (m !== s) r.buff(m, n, n);
    },
    onSpell: (_r, s) => void s.n++,
    text: (m) => `當你賣掉此手下時，餵你的手下${1 + Math.floor(m.n / 2)}根香蕉（+1/+1）。施放2張法術後強化（還差${2 - (m.n % 2)}張！）`,
    syn: 'BEAST',
    val: 4,
  },
  // 泰坦守護者：手牌或戰場上的另一個手下獲得生命值時，這個也獲得
  { id: B('TB_BaconShop_HERO_39'), onStatGain: (_r, s, m, _a, h, g) => void (m !== s && h > 0 && (s.hp += h * g)), inHandStatGain: (_r, s, m, _a, h, g) => void (m !== s && h > 0 && (s.hp += h * g)), scale: 6 },
  // 資深探墓者：亡語：讓你最右邊的手下變成金卡
  {
    id: B('TB_BaconShop_HERO_41'),
    deathrattle: (c, s, g) => {
      const b = c.friends(s).filter((m) => m !== s && !m.golden);
      for (const m of b.slice(-g)) c.goldenPerm(m);
    },
    val: 5,
  },
  // 見習領路者：戰吼：「探險者領袖」便宜 (2)
  { id: B('TB_BaconShop_HERO_42'), battlecry: (r, _s, g) => r.counter('eliseDisc', 2 * g), val: 3 },
  // 忠誠的嘍囉：每場戰鬥擊殺第二個手下後拿到分身
  { ...TW('593'), id: B('TB_BaconShop_HERO_45') },
  // 賽絲特拉：友方手下在戰鬥中獲得攻擊力時，永久 +1 生命值
  { id: B('TB_BaconShop_HERO_52'), onCombatGain: (c, _s, m, a, _h, g) => void (a > 0 && c.perm(m, 0, g)), val: 5 },
  // 克羅米：每回合第一次刷新是有用的（給你場上最多的種族）
  {
    id: B('TB_BaconShop_HERO_57'),
    onRefresh: (r, _s, g) => {
      if ((r.p.c['t:chromie'] ?? 0) >= g) return;
      r.counter('t:chromie', 1);
      const t = mostCommonType(r.p.board);
      if (t) r.restock(Array.from({ length: r.p.shop.length }, () => (id: string) => isRace(id, t) && tierOf(id) <= r.p.tier));
    },
    val: 5,
  },
  // 奧核領主（在 heroes.ts 處理）
  { id: B('TB_BaconShop_HERO_58'), val: 4 },
  // 紅手百夫長（在 heroes.ts 處理）
  { id: B('TB_BaconShop_HERO_60'), scale: 6 },
  // 暗影看守者：戰吼：下一次英雄能力讓目標變成金卡
  { id: B('TB_BaconShop_HERO_62'), battlecry: (r) => r.counter('powerGold', 1), val: 5 },
  // 狂怒的參賽者（在 heroes.ts 處理）
  { id: B('TB_BaconShop_HERO_67'), val: 5 },
  // 小小科：回合開始時從生命值最低的對手戰隊拿到一個手下
  {
    id: B('TB_BaconShop_HERO_70'),
    startTurn: (r, _s, g) => {
      const opp = r.G.alive()
        .filter((q) => q !== r.p && q.board.length)
        .sort((a, b) => a.hp - b.hp)[0];
      if (!opp) return;
      for (let k = 0; k < g; k++) {
        const m = r.pick(opp.board);
        if (m) r.give(r.make(m.id));
      }
    },
    val: 6,
  },
  // 詹迪斯的學徒：打出這回合已經打出過的手下後，你的手下獲得等同旅店等級的身材
  {
    id: B('TB_BaconShop_HERO_71'),
    onPlay: (r, _s, m, g) => {
      const k = `t:pl:${m.id}`;
      r.counter(k, 1);
      if ((r.p.c[k] ?? 0) >= 2) for (const x of r.p.board) r.buff(x, r.p.tier * g, r.p.tier * g);
    },
    val: 5,
  },
  // 巴羅夫領主的學徒：使用幸運幣後獲得 1 枚金幣
  { id: B('TB_BaconShop_HERO_72'), onSpell: (r, _s, _t, g, id) => void (id === COIN && r.gainGold(g)), val: 4 },
  // 冰雪元素：刷新時多一個凍結的元素
  { ...TW('586'), id: B('TB_BaconShop_HERO_78') },
  // 伯斯：發現一個手下後，給它 +2/+2 並強化
  {
    id: B('TB_BaconShop_HERO_90'),
    afterDiscoverMinion: (_r, s, m, g) => {
      const n = (2 + s.n) * g;
      m.atk += n;
      m.hp += n;
      s.n++;
    },
    text: (m) => `在你發現一個手下後，賦予它+${2 + m.n}/+${2 + m.n}並強化此手下`,
    val: 5,
  },
  // 法爾斯：賣掉時發現一個你剛好只有一個的手下的分身
  {
    id: B('TB_BaconShop_HERO_91'),
    onSell: (r, s) => {
      const all = [...r.p.board, ...r.p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : []))].filter((m) => m !== s && !m.id.endsWith('_Buddy'));
      const ids = [...new Set(all.map((m) => m.id))].filter((id) => all.filter((m) => m.id === id).length === 1);
      const opts: string[] = [];
      while (opts.length < 3 && ids.length) opts.push(ids.splice(Math.floor(r.rand() * ids.length), 1)[0]);
      r.offer(opts, '法爾斯：發現一個手下的分身');
    },
    val: 5,
  },
  // 獎品券收集者：賣掉時發現一個下一階的暗月獎品
  { id: B('TB_BaconShop_HERO_94'), onSell: (r) => r.G.discoverPrize(r.p, Math.min(4, 1 + Math.floor(r.G.round / 4))), val: 6 },
  // 遊蕩樹人：友方嘲諷手下被攻擊時，你的手下永久 +1/+1
  { id: B('TB_BaconShop_HERO_95'), onFriendAttacked: (c, s, t, _a, g) => void (t.taunt && c.friends(s).forEach((m) => c.perm(m, g, g))), val: 6 },
];

export const BUDDY_IDS = new Set(BUDDIES.map((b) => b.id));

// 延遲取得的卡池（避免和 cards.ts 互相引用時還沒初始化）
let battlecryPool: string[] | null = null;
let undeadPool: string[] | null = null;
let drPool: string[] | null = null;
function BATTLECRY_POOL(): string[] {
  return (battlecryPool ??= LATE.pool.filter((id) => hasBattlecry(id)));
}
function UNDEAD_POOL(): string[] {
  return (undeadPool ??= LATE.pool.filter((id) => isRace(id, 'UNDEAD')));
}
function DR_POOL(): string[] {
  return (drPool ??= LATE.pool.filter((id) => !!LATE.spec.get(id)?.deathrattle));
}
