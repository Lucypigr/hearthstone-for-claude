// 英雄夥伴（每位英雄的專屬手下；開啟「英雄夥伴」時才會出現夥伴按鈕）
// 只收錄效果能完整執行的夥伴；沒有實作的英雄不會有夥伴按鈕
import type { MinionSpec } from './api';
import { isRace, racesOf, tierOf } from './data';
import { hasBattlecry } from './rules';
import { BOUNTIES, isTavernSpell, spellCostOf, STAT_SPELLS } from './spells';
import { BONUS_KEYWORDS, TRIBES, type BMinion, type Tribe } from './types';

const B = (hero: string) => `${hero}_Buddy`;
const race = (m: BMinion, t: Tribe) => isRace(m.id, t);
function distinctTypes(b: BMinion[]): number {
  const set = new Set<Tribe>();
  let wild = 0;
  for (const m of b) {
    const r = racesOf(m.id);
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
        const id = r.pick(STAT_SPELLS.filter((x) => r.spellInLobby(x) && tierOf(x) <= r.p.tier));
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
    battlecry: (r, _s, g) => [...Array(g)].forEach(() => r.getSpell(r.pick(BOUNTIES.filter((x) => r.spellInLobby(x)))!)),
    deathrattle: (c, s, g) => [...Array(g)].forEach(() => c.give(c.side(s), c.pick(BOUNTIES.filter((x) => c.inLobbySpell(x)))!)),
    rally: (c, s, g) => [...Array(g)].forEach(() => c.give(c.side(s), c.pick(BOUNTIES.filter((x) => c.inLobbySpell(x)))!)),
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
];

export const BUDDY_IDS = new Set(BUDDIES.map((b) => b.id));

// 延遲取得的卡池（避免和 cards.ts 互相引用時還沒初始化）
let battlecryPool: string[] | null = null;
let undeadPool: string[] | null = null;
let drPool: string[] | null = null;
function BATTLECRY_POOL(): string[] {
  return (battlecryPool ??= POOL().filter((id) => hasBattlecry(id)));
}
function UNDEAD_POOL(): string[] {
  return (undeadPool ??= POOL().filter((id) => isRace(id, 'UNDEAD')));
}
function DR_POOL(): string[] {
  return (drPool ??= POOL().filter((id) => !!SPEC_REF?.get(id)?.deathrattle));
}
let POOL_REF: string[] | null = null;
let SPEC_REF: Map<string, MinionSpec> | null = null;
function POOL(): string[] {
  return POOL_REF ?? [];
}
/** cards.ts 初始化完之後呼叫 */
export function linkBuddyPools(pool: string[], spec: Map<string, MinionSpec>) {
  POOL_REF = pool;
  SPEC_REF = spec;
}
