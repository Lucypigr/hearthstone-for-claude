// 英雄戰場的電腦玩家：每個人都有自己的技術、打法與喜好，和真人一樣只看得到自己的酒館與打過的對手
//
// 想法大致是：
// 1. 先打出上回合買的牌、用掉幸運幣
// 2. 依照升本節奏（看回合、血量、金幣、場面強弱）決定要不要升級酒館
// 3. 用評估函數比較酒館裡的手下：身材、關鍵字、效果、種族搭配、三連
// 4. 錢不夠就凍結好牌；找不到想要的就刷新
// 5. 最後調整站位：高手會用打過的對手戰隊模擬戰鬥，挑勝率最高的站位
// 技術越低，評估越有雜訊、越常忘記三連、亂站位、錢花不完
import { GEM, COIN, SPEC, TRIPLE_REWARD } from './cards';
import { mostCommonType, SPELL_SPEC } from './spells';
import { runCombat } from './combat';
import { bgCard, isRace, racesOf, tierOf } from './data';
import type { BgGame } from './game';
import { HERO_SPEC, type HeroSpec } from './heroes';
import { nextRandom } from '../engine/rng';
import { BOARD_MAX, canMagnetize, HAND_MAX, MAX_TIER, specsOf } from './rules';
import { TRIBE_NAMES, TRIBES, type BgPersona, type BgStyle, type BMinion, type BPlayer, type HandCard, type Tribe } from './types';

export type BgDifficulty = 'novice' | 'normal' | 'expert' | 'master';
export const BG_DIFFICULTY_NAMES: Record<BgDifficulty, string> = { novice: '新手', normal: '普通', expert: '高手', master: '大師' };
const SKILL: Record<BgDifficulty, number> = { novice: 0.15, normal: 0.45, expert: 0.72, master: 0.93 };

/** 各種打法的升本節奏：第 n 回合想要的酒館等級 */
const CURVES: Record<BgStyle, number[]> = {
  standard: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  greedy: [1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  tempo: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  reroll: [1, 1, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6],
};
export const STYLE_NAMES: Record<BgStyle, string> = { standard: '穩健升本', greedy: '速升本', tempo: '重場面', reroll: '低本刷三連' };

export function skillLabel(skill: number): BgDifficulty {
  return skill >= 0.85 ? 'master' : skill >= 0.6 ? 'expert' : skill >= 0.3 ? 'normal' : 'novice';
}

/** 依積分（或指定的難度）做出一位電腦玩家 */
export function makePersona(seed: number, opts: { difficulty?: BgDifficulty; rating?: number }): BgPersona {
  const st = { rng: seed | 0 || 1 };
  const r = () => nextRandom(st);
  const gauss = () => (r() + r() + r() - 1.5) * 1.4;
  let skill: number;
  let rating: number;
  if (opts.difficulty) {
    skill = SKILL[opts.difficulty] + gauss() * 0.06;
    rating = Math.round(Math.max(0, 1000 + skill * 8000 + gauss() * 300));
  } else {
    rating = Math.max(0, Math.round((opts.rating ?? 0) + gauss() * 400));
    skill = 0.12 + 0.82 * Math.min(1, rating / 8500) + gauss() * 0.08;
  }
  skill = Math.max(0.05, Math.min(1, skill));
  const styles: BgStyle[] = ['standard', 'standard', 'greedy', 'tempo', 'reroll'];
  const style = styles[Math.floor(r() * styles.length)];
  const fav = shuffle([...TRIBES], r).slice(0, 2);
  return { skill, style, fav, chatty: Math.pow(r(), 1.3), rating, seed: Math.floor(r() * 1e9) };
}

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// 選英雄
// ---------------------------------------------------------------------------

export function aiPickHero(G: BgGame, p: BPlayer): string {
  const options = G.s.heroOffers[p.idx];
  const persona = p.persona!;
  const st = { rng: persona.seed ^ 0x51ed };
  const r = () => nextRandom(st);
  // 高手挑強的英雄；新手常常挑看起來帥的（隨機）
  let best = options[0];
  let bestScore = -Infinity;
  for (const id of options) {
    const rank = HERO_SPEC.get(id)?.rank ?? 2;
    const score = rank * persona.skill * 2 + (r() - 0.5) * (3 - persona.skill * 2.5);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 評估
// ---------------------------------------------------------------------------

interface Mind {
  G: BgGame;
  p: BPlayer;
  persona: BgPersona;
  r: () => number;
  /** 正在走的種族 */
  focus: Tribe | null;
  /** 血量很危險 */
  danger: boolean;
  notes: string[];
  bought: string[];
  rolls: number;
}

function gauss(m: Mind): number {
  return (m.r() + m.r() + m.r() - 1.5) * 1.4;
}

/** 對目前狀況來說，主要走哪個種族 */
function decideFocus(G: BgGame, p: BPlayer, persona: BgPersona): Tribe | null {
  const score = new Map<Tribe, number>();
  const minions = [...p.board, ...p.hand.flatMap((h) => (h.kind === 'minion' ? [h.m] : []))];
  for (const m of minions) {
    const races = racesOf(m.id);
    if (races.length === TRIBES.length) continue;
    for (const t of races) score.set(t, (score.get(t) ?? 0) + 1 + (m.golden ? 1 : 0) + (SPEC.get(m.id)?.syn === t ? 0.5 : 0));
  }
  for (const t of persona.fav) if (G.s.tribes.includes(t)) score.set(t, (score.get(t) ?? 0) + (1 - persona.skill) * 2 + 0.3);
  let best: Tribe | null = null;
  let bestN = 1.5;
  for (const [t, n] of score) {
    if (!G.s.tribes.includes(t)) continue;
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

/** 一個手下對這位玩家值多少（大約等於幾點身材） */
export function minionValue(G: BgGame, p: BPlayer, m: BMinion, focus: Tribe | null, skill = 0.7): number {
  const e = G.eff(p, m);
  const round = G.round;
  let v = e.atk + e.hp * 0.85;
  if (e.kw.shield) v += e.atk * 0.9 + 2;
  if (e.kw.taunt) v += 1 + e.hp * 0.1;
  if (e.kw.windfury) v += e.atk * 0.8;
  if (e.kw.venom) v += 4 + round * 0.8;
  if (e.kw.reborn) v += 2 + Math.min(e.atk, 8) * 0.5;
  for (const { s, g } of specsOf(m)) {
    v += (s.val ?? 0) * g * (0.5 + skill * 0.6);
    // 會成長的卡：越早拿越值錢（但快死的時候顧不了以後）
    if (s.scale) v += s.scale * g * Math.max(0.5, Math.min(4, (14 - round) / 3)) * (0.4 + skill * 0.8);
    // 搭配：場上有幾個同種族
    if (s.syn) {
      const n = p.board.filter((x) => x !== m && isRace(x.id, s.syn!)).length;
      v += n * 1.4 * g * skill;
      if (focus === s.syn) v += 3 * skill;
    }
  }
  const races = racesOf(m.id);
  if (focus && races.includes(focus) && races.length < TRIBES.length) v += 2 + 3 * skill;
  // 隨著回合推進，低等級的白板手下越來越不值錢
  v -= Math.max(0, round - 4 - tierOf(m.id) * 1.5) * 0.6 * skill;
  return v;
}

function copiesOwned(p: BPlayer, id: string): number {
  let n = 0;
  for (const m of p.board) if (m.id === id && !m.golden) n++;
  for (const h of p.hand) if (h.kind === 'minion' && h.m.id === id && !h.m.golden) n++;
  return n;
}

/** 酒館裡的手下值得買嗎 */
function buyValue(M: Mind, m: BMinion): number {
  const { G, p, persona } = M;
  let v = minionValue(G, p, m, M.focus, persona.skill);
  const need = HERO_SPEC.get(p.heroId)?.tripleNeed ?? 3;
  const owned = copiesOwned(p, m.id);
  // 三連：新手常常沒發現
  const noticesTriple = M.r() < 0.35 + persona.skill * 0.65;
  if (noticesTriple) {
    if (owned >= need - 1) v += 12 + G.round * 0.8;
    else if (owned >= 1 && persona.style === 'reroll') v += 4;
    else if (owned >= 1) v += 1.5 * persona.skill;
  }
  return v + gauss(M) * (1 - persona.skill) * 4;
}

// ---------------------------------------------------------------------------
// 招募階段
// ---------------------------------------------------------------------------

export const AI_ERRORS: string[] = [];

/** 某位電腦玩家完整的一回合（招募 → 站位） */
export function aiRecruit(G: BgGame, p: BPlayer) {
  const persona = p.persona!;
  const st = { rng: (persona.seed + G.round * 7919 + p.idx * 104729) | 0 || 1 };
  const M: Mind = {
    G,
    p,
    persona,
    r: () => nextRandom(st),
    focus: decideFocus(G, p, persona),
    danger: p.hp + p.armor <= 12,
    notes: [],
    bought: [],
    rolls: 0,
  };
  const tierBefore = p.tier;
  try {
    for (let guard = 0; guard < 60; guard++) if (!step(M)) break;
    for (let guard = 0; guard < 10 && p.discover; guard++) chooseDiscover(M);
    position(M);
  } catch (e) {
    // 電腦不應該卡住整局：有任何非預期的錯誤就直接結束這回合（測試會檢查這裡）
    AI_ERRORS.push(`${p.name} 第 ${G.round} 回合：${(e as Error).message}\n${(e as Error).stack ?? ''}`);
  }
  // 賽後回顧：這回合的想法
  const parts: string[] = [];
  if (p.tier > tierBefore) parts.push(`升到 ${p.tier} 本`);
  if (M.bought.length) parts.push(`買了${M.bought.slice(0, 4).join('、')}${M.bought.length > 4 ? '…' : ''}`);
  if (M.rolls) parts.push(`刷新 ${M.rolls} 次`);
  if (p.frozen) parts.push('凍結了酒館');
  if (M.focus) parts.push(`想走${TRIBE_NAMES[M.focus]}`);
  if (M.danger) parts.push('血量危險，先顧場面');
  p.notes.push(`第 ${G.round} 回合：${parts.join('，') || '沒做什麼'}${M.notes.length ? `（${M.notes.join('；')}）` : ''}`);
}

/** 做一個動作；沒有想做的就回傳 false */
function step(M: Mind): boolean {
  const { G, p, persona } = M;
  if (p.discover) {
    chooseDiscover(M);
    return true;
  }
  // 1. 幸運幣先用掉
  const coin = p.hand.find((h) => h.kind === 'spell' && h.id === COIN);
  if (coin) {
    G.play(p.idx, coin.uid);
    return true;
  }
  // 2. 升級酒館
  if (wantsLevel(M) && p.gold >= G.upgradeCost(p)) {
    G.upgrade(p.idx);
    return true;
  }
  // 3. 三合一獎勵（高手會先升本再用）
  const reward = p.hand.find((h) => h.kind === 'spell' && h.id === TRIPLE_REWARD);
  if (reward && p.hand.length < HAND_MAX) {
    const holdForLevel = persona.skill > 0.6 && p.tier < MAX_TIER && wantsLevel(M, 1) && G.upgradeCost(p) <= p.gold + 2;
    if (!holdForLevel) {
      G.play(p.idx, reward.uid);
      return true;
    }
  }
  // 4. 打出手牌
  if (playFromHand(M)) return true;
  // 5. 英雄能力
  if (usePower(M)) return true;
  // 6. 買手下
  if (buySomething(M)) return true;
  // 7. 刷新
  if (rollOrFreeze(M)) return true;
  return false;
}

function curveTier(style: BgStyle, round: number): number {
  const c = CURVES[style];
  return c[Math.min(round, c.length - 1)];
}

/** 想升級酒館嗎（look = 往後看幾回合） */
function wantsLevel(M: Mind, look = 0): boolean {
  const { G, p, persona } = M;
  if (p.tier >= MAX_TIER) return false;
  const cost = G.upgradeCost(p);
  if (cost <= 1 && G.round >= 3 && persona.skill > 0.3) return true;
  let target = curveTier(persona.style, G.round + look);
  // 新手常常忘記升本（只想買手下），或升得亂七八糟
  if (persona.skill < 0.35) {
    if (M.r() < 0.45) target -= 1;
    else if (M.r() < 0.15) target += 1;
    if (G.round >= 6 && M.r() < 0.3) target -= 1;
  }
  const hp = p.hp + p.armor;
  const losing = p.results.slice(-2).filter((x) => x === 'loss').length;
  // 血量危險：先把錢花在場面上（高手才懂得在危險時停下來）
  if (hp <= 12 && losing >= 1 && persona.skill > 0.4) target -= 1;
  // 血量健康又一直贏：可以貪一點
  if (hp >= 25 && losing === 0 && G.round >= 5 && persona.skill > 0.55) target += 1;
  // 升級後還要買得起東西
  if (persona.skill > 0.5 && p.tier + 1 > target) return false;
  return p.tier < target;
}

function chooseDiscover(M: Mind) {
  const { G, p } = M;
  const d = p.discover;
  if (!d) return;
  let best = 0;
  let bestV = -Infinity;
  d.options.forEach((id, i) => {
    const v = buyValue(M, G.make(id, !!d.golden)) + (d.hurt ? -tierOf(id) * (M.danger ? 1.5 : 0.4) : 0);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  G.choose(p.idx, best);
}

/** 戰吼 / 法術要選哪個友方手下 */
function pickFriendlyTarget(M: Mind, filter: (m: BMinion) => boolean, prefer: 'strong' | 'weak' = 'strong'): BMinion | undefined {
  const { G, p } = M;
  const cands = p.board.filter(filter);
  if (!cands.length) return undefined;
  const scored = cands.map((m) => ({ m, v: minionValue(G, p, m, M.focus) + gauss(M) * (1 - M.persona.skill) * 6 }));
  scored.sort((a, b) => (prefer === 'strong' ? b.v - a.v : a.v - b.v));
  return scored[0].m;
}

function playFromHand(M: Mind): boolean {
  const { G, p, persona } = M;
  // 法術
  for (const h of p.hand) {
    if (h.kind !== 'spell' || h.id === TRIPLE_REWARD || h.locked === G.round) continue;
    const spec = SPELL_SPEC.get(h.id);
    if (!spec) continue;
    // 酒吧精選：錢不夠買法術時不用
    if (h.id === 'BG28_849' && p.gold < 2) continue;
    const choice = spellChoice(M, h.id);
    const targets = G.spellTargets(p, h.id, choice);
    const needTarget = !!spec.target && (!spec.choiceTarget || spec.choiceTarget(choice));
    if (!needTarget) {
      G.play(p.idx, h.uid, undefined, undefined, choice);
      return true;
    }
    if (!targets.length) continue;
    const t = spellTarget(M, h.id, targets);
    if (!t) continue;
    G.play(p.idx, h.uid, undefined, t.uid, choice);
    return true;
  }
  // 手下
  const minions = p.hand.filter((h): h is HandCard & { kind: 'minion' } => h.kind === 'minion' && h.locked !== G.round);
  if (!minions.length) return false;
  // 新手偶爾會忘記把手牌打出來
  if (persona.skill < 0.3 && M.r() < 0.12) return false;
  const best = minions
    .map((h) => ({ h, v: minionValue(G, p, h.m, M.focus, persona.skill) }))
    .sort((a, b) => b.v - a.v)
    .find(({ h }) => {
      // 在手牌中才有用的卡先留著（例如計數魚人）
      const s = SPEC.get(h.m.id);
      if (s?.inHandOnPlay && minions.length > 1 && p.board.length < BOARD_MAX - 1 && persona.skill > 0.5) return false;
      return true;
    });
  if (!best) return false;
  const m = best.h.m;
  // 磁力：吸附到最好的機械上
  const hosts = p.board.filter((x) => canMagnetize(m, x));
  if (hosts.length && (p.board.length >= BOARD_MAX || persona.skill > 0.45 || M.r() < 0.5)) {
    const host = pickFriendlyTarget(M, (x) => hosts.includes(x))!;
    G.play(p.idx, best.h.uid, undefined, host.uid);
    return true;
  }
  if (p.board.length >= BOARD_MAX) {
    // 戰場滿了：賣掉最弱的（價值差距要夠大）
    const weakest = p.board
      .map((x) => ({ x, v: minionValue(G, p, x, M.focus, persona.skill) }))
      .sort((a, b) => a.v - b.v)[0];
    if (weakest && weakest.v + 2 < best.v) {
      G.sell(p.idx, weakest.x.uid);
      return true;
    }
    return false;
  }
  const spec = SPEC.get(m.id);
  let target: number | undefined;
  if (spec?.target) {
    const destroys = m.id === 'BG28_303' || m.id === 'BG32_340';
    const t = pickFriendlyTarget(M, (x) => spec.target!(m, x), destroys ? 'weak' : 'strong');
    if (destroys && t && minionValue(G, p, t, M.focus) > 12) target = undefined;
    else target = t?.uid;
    if (destroys && target === undefined && p.board.some((x) => spec.target!(m, x))) return false;
  }
  try {
    G.play(p.idx, best.h.uid, undefined, target, spec?.choices ? minionChoice(M, m.id) : 0);
  } catch {
    return false;
  }
  return true;
}

function usePower(M: Mind): boolean {
  const { G, p, persona } = M;
  const h: HeroSpec | undefined = HERO_SPEC.get(p.heroId);
  if (!h?.ai) return false;
  const st = G.powerState(p);
  if (!st.usable) return false;
  // 先確保有錢買東西（技術好的會算好）
  if (st.cost > 0 && persona.skill > 0.5 && p.gold - st.cost < G.minionCost(p) && p.gold - st.cost > 0 && G.round > 2 && h.id !== 'BG32_HERO_001') return false;
  if (persona.skill < 0.3 && M.r() < 0.35) return false;
  const t = h.ai(G, p);
  if (t === undefined) return false;
  try {
    G.usePower(p.idx, t === 'none' ? undefined : t.uid);
  } catch {
    return false;
  }
  return true;
}

function buySomething(M: Mind): boolean {
  const { G, p, persona } = M;
  if (p.hand.length >= HAND_MAX) return false;
  const cost = G.minionCost(p);
  const handMinions = p.hand.filter((h) => h.kind === 'minion').length;
  const scored = p.shop.map((m) => ({ m, v: buyValue(M, m) })).sort((a, b) => b.v - a.v);
  const best = scored[0];
  const space = p.board.length + handMinions < BOARD_MAX;
  // 酒館法術：比較「每枚金幣的價值」
  const spell = p.shopSpells
    .map((sp) => ({ sp, cost: G.spellCost(p, sp.id), v: spellValue(M, sp.id) }))
    .filter((x) => (x.sp.id === 'BG28_571' ? p.hp > 8 : x.cost <= p.gold))
    .sort((a, b) => b.v / Math.max(1, b.cost) - a.v / Math.max(1, a.cost))[0];
  const minionRate = best && p.gold >= cost ? best.v / Math.max(1, cost) : 0;
  if (spell && spell.v > 0 && spell.v / Math.max(1, spell.cost) > minionRate * (space ? 1.25 : 0.8)) {
    G.buySpell(p.idx, spell.sp.uid);
    M.bought.push(bgCard(spell.sp.id).name);
    return true;
  }
  if (!best || p.gold < cost) return false;
  // 金幣不會留到下回合：有空位就買最好的那張
  let threshold = -Infinity;
  if (!space) {
    // 戰場滿了：要比場上最弱的好才買（之後賣掉最弱的換上去）
    const weakest = Math.min(...p.board.map((x) => minionValue(G, p, x, M.focus, persona.skill)));
    threshold = weakest + 3 - (persona.skill < 0.3 ? 2 : 0);
    // 刷新也找不到更好的時候，乾脆買下來賣掉舊的
    if (p.gold < cost + G.refreshCost(p) + 1) threshold -= 1;
  }
  if (best.v < threshold) return false;
  G.buy(p.idx, best.m.uid);
  M.bought.push(bgCard(best.m.id).name);
  return true;
}

/** 酒館法術值多少（大約幾點身材）；新手看不太懂法術 */
function spellValue(M: Mind, id: string): number {
  const { G, p, persona } = M;
  const spec = SPELL_SPEC.get(id);
  if (!spec) return 0;
  // 需要目標但場上沒有可以選的：先不要買
  if (spec.target && !spec.choiceTarget && !G.spellTargets(p, id, 0).length) return 0;
  let v = spec.v ? spec.v(G, p) : 3;
  if (spec.stats) {
    const [a, h] = G.spellExtra(p);
    if (a + h > 0) v += (a + h) * Math.max(1, Math.min(4, p.board.length)) * 0.6;
  }
  return v * (0.6 + persona.skill * 0.5) + gauss(M) * (1 - persona.skill) * 3;
}

/** 二選一的法術選哪個 */
function spellChoice(M: Mind, id: string): number {
  const { G, p } = M;
  switch (id) {
    case 'BG31_881': // 時間管理：危險時先拿現在的
      return M.danger ? 0 : 1;
    case 'BG31_886': // 森林的餽贈：手下多就全體
      return p.board.length >= 6 ? 1 : 0;
    case 'BG31_890': // 無窮潛力
      return p.board.length + p.hand.length >= 8 ? 1 : 0;
    case 'BG31_880': // 聯盟旗幟
      return M.r() < 0.5 ? 0 : 1;
    case 'BG31_893': // 寶石日
      return G.round % 2;
    default:
      return 0;
  }
}

/** 二選一的手下選哪個 */
function minionChoice(M: Mind, id: string): number {
  const { G, p } = M;
  switch (id) {
    case 'BG27_084': // 活潑聖甲蟲：攻擊力高的給風怒
      return p.board.some((m) => isRace(m.id, 'BEAST') && m.atk >= 6) ? 1 : 0;
    case 'BG30_123': // 無畏饕客：前期拿加成，後期拿寶石
      return G.round <= 8 ? 0 : 1;
    case 'BG36_330': // 狡猾的滲透者
      return p.board.some((m) => isRace(m.id, 'QUILBOAR')) ? 1 : 0;
    case 'BG36_332': // 陷阱獵手：前期拿金幣上限
      return G.round <= 7 ? 1 : 0;
    default:
      return M.r() < 0.5 ? 0 : 1;
  }
}

/** 法術要選誰 */
function spellTarget(M: Mind, id: string, targets: BMinion[]): BMinion | undefined {
  const { p } = M;
  const friends = targets.filter((m) => p.board.includes(m));
  switch (id) {
    case 'BG23_008t':
      return pickFriendlyTarget(M, (m) => friends.includes(m) && !m.shield && !m.tmpKw.includes('shield')) ?? friends[0];
    case 'BG23_004t':
    case 'BG28_503':
      return pickFriendlyTarget(M, (m) => friends.includes(m) && !m.taunt) ?? friends[0];
    case GEM:
      return pickFriendlyTarget(M, (m) => friends.includes(m) && isRace(m.id, 'QUILBOAR')) ?? pickFriendlyTarget(M, (m) => friends.includes(m));
    case 'BG28_604': // 屠殺：犧牲最弱的不死族
    case 'EBG_Spell_032': // 引導吞噬者
    case 'BG28_838': // 完美幻象：最弱的那個加最多
    case 'BG30_804': // 穩健進化
      return pickFriendlyTarget(M, (m) => friends.includes(m), 'weak');
    case 'BG28_520': // 狡猾長褲：選沒有嘲諷的
      return pickFriendlyTarget(M, (m) => friends.includes(m) && !m.taunt) ?? friends[0];
    case 'BG28_518':
    case 'BG28_845':
    case 'BG35_912':
    case 'EBG_Spell_038': {
      // 「選一個手下」：選自己最多的種族
      const t = mostCommonType(p.board);
      return targets.find((m) => p.board.includes(m) && t && isRace(m.id, t)) ?? friends[0] ?? targets[0];
    }
    default:
      return pickFriendlyTarget(M, (m) => friends.includes(m)) ?? targets[0];
  }
}

function rollOrFreeze(M: Mind): boolean {
  const { G, p, persona } = M;
  const rc = G.refreshCost(p);
  const mc = G.minionCost(p);
  const bestShop = p.shop.length ? Math.max(...p.shop.map((m) => buyValue(M, m))) : 0;
  const greatCard = bestShop > 10 + G.round;
  if (p.gold < rc) {
    maybeFreeze(M, greatCard);
    return false;
  }
  if (greatCard && p.gold < mc) {
    maybeFreeze(M, true);
    return false;
  }
  // 重刷型會在低本一直刷找三連
  const maxRolls = persona.style === 'reroll' ? 8 : 4 + Math.round(persona.skill * 4);
  if (M.rolls >= maxRolls) {
    maybeFreeze(M, greatCard);
    return false;
  }
  const canBuyAfter = p.gold - rc >= mc;
  // 剩一點錢：高手會刷一下看看，可以凍結好東西留到下回合
  const lastGold = !canBuyAfter && p.gold - rc >= 0 && persona.skill > 0.55 && M.r() < 0.6;
  // 新手常常錢沒花完就結束
  if (persona.skill < 0.3 && M.r() < 0.45) return false;
  if (!canBuyAfter && !lastGold) {
    maybeFreeze(M, greatCard);
    return false;
  }
  G.refresh(p.idx);
  M.rolls++;
  return true;
}

function maybeFreeze(M: Mind, great: boolean) {
  const { G, p, persona } = M;
  if (p.frozen || !great) return;
  if (M.r() < 0.3 + persona.skill * 0.65) {
    G.freeze(p.idx);
    M.notes.push('凍結了好牌');
  }
}

// ---------------------------------------------------------------------------
// 站位
// ---------------------------------------------------------------------------

/** 站位傾向：負數放左邊（先攻擊），正數放右邊（受保護） */
function roleScore(m: BMinion): number {
  let s = 0;
  for (const { s: sp } of specsOf(m)) {
    if (sp.deathrattle) s -= 3;
    if (sp.rally) s -= 2;
    if (sp.cleave) s -= 2;
    if (sp.onSummon || sp.onFriendDeath || sp.avenge || sp.onFriendAttack || sp.afterFriendAttack || sp.onFriendReborn) s += 3;
    if (sp.soc) s += 1;
    if (m.id === 'BG25_354' || m.id === 'BG_LOE_077') s += 4;
  }
  if (m.windfury || m.shield) s -= 0.5;
  if (m.taunt) s += 0.5;
  return s;
}

function position(M: Mind) {
  const { p, persona } = M;
  if (p.board.length < 2) return;
  if (persona.skill < 0.25) return; // 新手不太調整站位
  const heuristic = [...p.board].sort((a, b) => roleScore(a) - roleScore(b) + (M.r() - 0.5) * (1 - persona.skill) * 4);
  let best = heuristic;
  if (persona.skill >= 0.6) best = simulateBest(M, heuristic);
  p.board = best;
}

/** 高手：用記得的對手戰隊模擬幾次，挑勝率最好的站位 */
function simulateBest(M: Mind, start: BMinion[]): BMinion[] {
  const { G, p, persona } = M;
  const next = G.opponentOf(p.idx);
  const foes = Object.entries(p.seen)
    .filter(([i]) => G.player(Number(i)).alive)
    .sort(([a], [b]) => (Number(a) === next ? -1 : Number(b) === next ? 1 : 0))
    .slice(0, 3)
    .map(([, s]) => s);
  if (!foes.length) return start;
  const candidates: BMinion[][] = [start];
  const r = M.r;
  const tries = persona.skill >= 0.85 ? 7 : 4;
  for (let k = 0; k < tries; k++) {
    const c = [...start];
    const i = Math.floor(r() * c.length);
    const j = Math.floor(r() * c.length);
    [c[i], c[j]] = [c[j], c[i]];
    candidates.push(c);
  }
  const sims = persona.skill >= 0.85 ? 6 : 3;
  let best = start;
  let bestScore = -Infinity;
  for (const cand of candidates) {
    let score = 0;
    for (const f of foes) {
      for (let k = 0; k < sims; k++) {
        const fake = { ...G.player(next !== null && next >= 0 ? next : 0), board: f.board, c: {}, hp: 30 } as BPlayer;
        const res = runCombat(
          [
            { player: p, board: cand, tier: p.tier, heroId: p.heroId, hand: [], persist: false },
            { player: fake, board: f.board, tier: f.tier, heroId: f.heroId, hand: [], persist: false },
          ],
          { rng: { rng: (persona.seed + k * 31 + G.round) | 0 || 1 }, turn: G.round, nextUid: uidGen(), inLobby: () => false },
        );
        score += res.winner === 0 ? 1 + res.damage * 0.05 : res.winner === 1 ? -1 - res.damage * 0.05 : 0;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

function uidGen() {
  let n = 1_000_000;
  return () => n++;
}

// ---------------------------------------------------------------------------
// 整回合
// ---------------------------------------------------------------------------

/** 所有電腦玩家做完招募；回傳每個人「想了多久」（秒，給畫面顯示） */
export function playAiTurns(G: BgGame): Map<number, number> {
  const think = new Map<number, number>();
  for (const p of G.alive()) {
    if (p.isHuman) continue;
    const before = p.notes.length;
    aiRecruit(G, p);
    const persona = p.persona!;
    const actions = p.notes.length > before ? (p.notes[p.notes.length - 1].match(/、|，/g)?.length ?? 1) : 1;
    const st = { rng: (persona.seed + G.round * 13) | 0 || 1 };
    const secs = 6 + actions * (3 + (1 - persona.skill) * 3) + nextRandom(st) * 12 + G.round * 1.2;
    think.set(p.idx, Math.round(secs));
  }
  return think;
}

// ---------------------------------------------------------------------------
// 表情
// ---------------------------------------------------------------------------

export type BgEmoteEvent = 'start' | 'win' | 'lose' | 'bigwin' | 'biglose' | 'triple' | 'dead';

const EMOTES: Record<BgEmoteEvent, string[]> = {
  start: ['哈囉！', '你好', '祝好運～', '來吧！', '嗨'],
  win: ['謝謝', '打得好', '好險', '嘿嘿'],
  lose: ['打得好！', '可惡', '哎呀', '下次再來'],
  bigwin: ['哇喔！', '抱歉啦', '這場穩了', '哈哈'],
  biglose: ['哇喔…', '太扯了吧', '好強…', '我的天'],
  triple: ['三連！', '金卡來了', '嘿嘿'],
  dead: ['GG', '打得好，加油', '我先走了', '下一場見'],
};
const RUDE = ['哈哈', '太弱了吧', '就這樣？'];

export function aiEmote(p: BPlayer, ev: BgEmoteEvent, roll: number): string | null {
  const persona = p.persona;
  if (!persona) return null;
  const chance = ev === 'dead' ? 0.35 + persona.chatty * 0.6 : persona.chatty * (ev === 'bigwin' || ev === 'biglose' ? 0.8 : 0.45);
  if (roll > chance) return null;
  const rude = persona.seed % 17 === 0;
  const list = rude && (ev === 'bigwin' || ev === 'win') ? RUDE : EMOTES[ev];
  return list[Math.floor((roll / Math.max(chance, 0.01)) * list.length) % list.length];
}
