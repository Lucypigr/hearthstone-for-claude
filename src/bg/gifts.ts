// 黑暗贈禮：附在手下身上的額外效果（發現「有黑暗贈禮的手下」、黑暗悖論）
// 每個贈禮都是一個 MinionSpec，掛在手下的 gifts 上，和磁力一樣由 specsOf() 一起觸發
import type { MinionSpec } from './api';
import { isRace, racesOf, tierOf } from './data';
import { isMagnetic, LATE, mostCommonType } from './late';
import type { BMinion } from './types';

const GEM = 'BG20_GEM';
const GOLEM = 'BG30_MagicItem_442t';
const G = (n: number) => `BG36_MidGameEffect_000t${n}`;

/** 拿到贈禮時的效果（身材、關鍵字、金卡） */
export interface GiftSpec extends MinionSpec {
  attach?(m: BMinion, round: number): void;
}

const ownType = (m: BMinion) => racesOf(m.id)[0];

export const GIFTS: GiftSpec[] = [
  // 進攻獻祭：+10 攻擊力。亡語：把攻擊力給另一個友方手下
  {
    id: 'BG36_MidGameEffect_000t',
    attach: (m) => void (m.atk += 10),
    deathrattle: (c, s) => {
      const t = c.pick(c.friends(s).filter((x) => x !== s));
      if (t) c.buff(t, s.atk, 0);
    },
  },
  // 防禦獻祭：+10 生命值。亡語：把最大生命值給另一個友方手下
  {
    id: G(2),
    attach: (m) => void (m.hp += 10),
    deathrattle: (c, s) => {
      const t = c.pick(c.friends(s).filter((x) => x !== s));
      if (t) c.buff(t, 0, s.maxHp ?? s.hp);
    },
  },
  // 魅力：奮戰：拿到一個你最多的類型的隨機手下
  {
    id: G(3),
    rally: (c, s) => {
      const side = c.side(s);
      const t = mostCommonType(c.board(side).filter((x) => !x.dead));
      if (t) c.giveRandom(side, (id) => isRace(id, t) && tierOf(id) <= c.heroTier(side));
    },
  },
  // 孵育：+4/+4，2 回合後身材變成兩倍
  {
    id: G(4),
    attach: (m, round) => {
      m.atk += 4;
      m.hp += 4;
      m.gt = round + 2;
    },
    startTurn: (r, s) => {
      if (s.gt !== r.turn) return;
      r.buff(s, s.atk, s.hp);
    },
  },
  // 神秘精華：亡語：拿到一張隨機的酒館法術
  {
    id: G(5),
    deathrattle: (c, s) => {
      const side = c.side(s);
      const id = c.pick(LATE.tavern.filter((x) => c.inLobbySpell(x) && tierOf(x) <= c.heroTier(side)));
      if (id) c.give(side, id);
    },
  },
  // 抵抗：起始戰鬥：生命值變成兩倍
  { id: G(7), soc: (c, s) => c.buff(s, 0, s.hp) },
  // 讚賞：起始戰鬥：獲得左邊手下的攻擊力
  {
    id: G(9),
    soc: (c, s) => {
      const b = c.friends(s);
      const l = b[b.indexOf(s) - 1];
      if (l) c.buff(s, l.atk, 0);
    },
  },
  // 回響之聲：回合結束時，觸發這個手下的戰吼
  { id: G(10), endTurn: (r, s) => r.battlecry(s) },
  // 雙重幻象：拿到一張額外的複製（在 game.ts 處理）
  { id: G(11) },
  // 恐懼延續：復生，以完整的身材與額外關鍵字復生（在 combat.ts 處理）
  { id: G(12), attach: (m) => void (m.reborn = true) },
  // 鷹身人之爪：聖盾、風怒
  { id: G(13), attach: (m) => void ((m.shield = true), (m.windfury = true)) },
  // 鍍金：變成金卡，但不給三合一獎勵
  {
    id: G(14),
    attach: (m) => {
      if (m.golden) return;
      m.golden = true;
      m.atk *= 2;
      m.hp *= 2;
    },
  },
  // 托瑞斯的祝福：聖盾要打 3 次才會破（在 combat.ts 處理）
  { id: G(15), attach: (m) => void (m.shield = true) },
  // 死亡之顎：起始戰鬥：觸發這個手下的亡語
  { id: G(16), soc: (c, s) => c.deathrattle(s) },
  // 複製：每 2 回合結束時，拿到一張這個手下的普通複製
  { id: G(18), endTurn: (r, s) => void (r.turn % 2 === 0 && r.give(r.make(s.id))) },
  // 時間流轉：回合結束效果在回合開始時也會觸發（在 game.ts 處理）
  { id: G(21) },
  // 戰鬥傷疤：本賽局每觸發一次戰吼 +3/+3
  { id: G(28), aura: (cnt) => [3 * (cnt.bcTotal ?? 0), 3 * (cnt.bcTotal ?? 0)] },
  // 死亡的擁抱：本賽局每觸發一次亡語 +2/+2
  { id: G(29), aura: (cnt) => [2 * (cnt.drs ?? 0), 2 * (cnt.drs ?? 0)] },
  // 法術虹吸：本賽局每施放一張酒館法術 +3/+3
  { id: G(30), aura: (cnt) => [3 * (cnt.tspells ?? 0), 3 * (cnt.tspells ?? 0)] },
  // 塔瑞克苟莎的祝福：戰鬥中獲得的身材與額外關鍵字永久保留（在 combat.ts 處理）
  { id: G(50) },
  // 全新觀點：亡語：獲得 2 次免費刷新
  { id: G(52), deathrattle: (c, s) => c.counter(c.side(s), 'freeRefC', 2) },
  // 無敵：攻擊時免疫（在 combat.ts 處理）
  { id: G(60) },
  // 魔像術：亡語：召喚一個和這個手下身材一樣的魔像
  {
    id: G(61),
    deathrattle: (c, s, _g, i) => {
      const m = c.make(GOLEM);
      m.atk = s.atk;
      m.hp = s.maxHp ?? Math.max(1, s.hp);
      c.summon(c.side(s), m, i);
    },
  },
  // 迅敏：你打出卡牌後 +2/+2
  { id: G(64), onPlay: (r, s) => r.buff(s, 2, 2), onSpell: (r, s) => r.buff(s, 2, 2) },
  // 極化：回合結束時，把一個隨機的機械吸附到這個手下身上
  {
    id: G(65),
    endTurn: (r, s) => {
      const id = r.pick(LATE.pool.filter((x) => isMagnetic(x) && isRace(x, 'MECHANICAL') && tierOf(x) <= r.p.tier));
      if (id) r.magnetize(s, id);
    },
  },
  // 惡魔學識：奮戰：你接下來 3 次刷新各多一個惡魔食料
  { id: G(66), rally: (c, s) => c.counter(c.side(s), 'fodder3', 1) },
  // 毒性：烈毒
  { id: G(69), attach: (m) => void (m.venom = true) },
  // 敵意：起始戰鬥：攻擊力變成兩倍
  { id: G(71), soc: (c, s) => c.buff(s, s.atk, 0) },
  // 泰坦之力：+1000 攻擊力
  { id: G(72), attach: (m) => void (m.atk += 1000) },
  // 堅韌：+5/+5
  { id: G(73), attach: (m) => void ((m.atk += 5), (m.hp += 5)) },
  // 磨利劍刃 / 韌化盾牌：你打出卡牌後 +3 攻擊力 / +3 生命值
  { id: G(74), onPlay: (r, s) => r.buff(s, 3, 0), onSpell: (r, s) => r.buff(s, 3, 0) },
  { id: G(75), onPlay: (r, s) => r.buff(s, 0, 3), onSpell: (r, s) => r.buff(s, 0, 3) },
  // 效率：啟動技能觸發兩次（在 game.ts 處理）
  { id: G(78) },
  // 隱秘：潛行
  { id: G(79), attach: (m) => void (m.stealth = true) },
  // 血緣：奮戰：拿到 2 顆鮮血寶石
  { id: G(80), rally: (c, s) => void (c.give(c.side(s), GEM), c.give(c.side(s), GEM)) },
  // 卓越：起始戰鬥：身材變成三倍
  { id: G(81), soc: (c, s) => c.buff(s, 2 * s.atk, 2 * s.hp) },
  // 親和：每 2 回合結束時，拿到一個這個類型的隨機手下
  {
    id: G(82),
    endTurn: (r, s) => {
      if (r.turn % 2) return;
      const t = ownType(s);
      if (t) r.getRandom((id) => isRace(id, t) && tierOf(id) <= r.p.tier);
    },
  },
  // 褻瀆：本賽局每棄掉一張牌 +3/+3
  { id: G(88), aura: (cnt) => [3 * (cnt.discards ?? 0), 3 * (cnt.discards ?? 0)] },
  // 信奉：起始戰鬥：獲得你的神祇的身材
  { id: G(89), soc: (c, s) => c.buff(s, 1 + c.cnt(c.side(s), 'deityA'), 1 + c.cnt(c.side(s), 'deityH')) },
  // 分身：起始戰鬥：召喚這個手下的複製
  {
    id: G(90),
    soc: (c, s) => {
      const x = c.make(s.id, s.golden);
      Object.assign(x, { atk: s.atk, hp: s.hp, taunt: s.taunt, shield: s.shield, windfury: s.windfury, venom: s.venom, reborn: s.reborn, mags: s.mags.slice(), n: s.n });
      c.summon(c.side(s), x, c.index(s) + 1);
    },
  },
];

export const GIFT_IDS = GIFTS.map((g) => g.id);
export const GIFT_SPEC = new Map(GIFTS.map((g) => [g.id, g]));
export const hasGift = (m: BMinion, n: number) => !!m.gifts?.includes(G(n));

/** 把黑暗贈禮附到手下身上 */
export function attachGift(m: BMinion, id: string, round: number) {
  (m.gifts ??= []).push(id);
  GIFT_SPEC.get(id)?.attach?.(m, round);
}

/** 黑暗悖論：這局的等級、身材與黑暗贈禮 */
export const PARADOX = 'BG36_360';
