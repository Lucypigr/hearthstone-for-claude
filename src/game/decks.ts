// 套牌規則與自動組牌（新手套牌 / 電腦套牌）
import { cardClasses, COLLECTIBLE, getCard } from '../cards/registry';
import { nextRandom, shuffle } from '../engine/rng';
import type { Ability, Amount, CardClass, CardDef, Effect } from '../engine/types';

export const DECK_SIZE = 30;

export type HeroClass = Exclude<CardClass, 'NEUTRAL'>;

export interface Deck {
  id: string;
  name: string;
  heroClass: HeroClass;
  /** 不限職業：可以放入任何職業的卡 */
  freeform: boolean;
  cards: string[];
}

export function maxCopies(def: CardDef): number {
  return def.rarity === 'LEGENDARY' ? 1 : 2;
}

export function cardAllowed(def: CardDef, heroClass: HeroClass, freeform: boolean): boolean {
  if (!def.collectible) return false;
  if (freeform) return true;
  const classes = cardClasses(def);
  return classes.includes('NEUTRAL') || classes.includes(heroClass);
}

export interface DeckProblem {
  ok: boolean;
  errors: string[];
}

export function validateDeck(deck: Deck, owned?: Record<string, number>): DeckProblem {
  const errors: string[] = [];
  if (deck.cards.length !== DECK_SIZE) errors.push(`套牌需要剛好 ${DECK_SIZE} 張（目前 ${deck.cards.length} 張）`);
  const counts = new Map<string, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    let def: CardDef;
    try {
      def = getCard(id);
    } catch {
      errors.push(`未知卡牌 ${id}`);
      continue;
    }
    if (n > maxCopies(def)) errors.push(`【${def.name}】最多只能放 ${maxCopies(def)} 張`);
    if (!cardAllowed(def, deck.heroClass, deck.freeform)) errors.push(`【${def.name}】不屬於此職業`);
    if (owned && (owned[id] ?? 0) < n) errors.push(`你沒有足夠的【${def.name}】`);
  }
  return { ok: errors.length === 0, errors };
}

/** 單一效果的大致價值（以「一點身材」為單位） */
function effectValue(e: Effect): number {
  const amt = (a: Amount | undefined) => (typeof a === 'number' ? a : a ? 2.5 : 0);
  switch (e.e) {
    case 'damage': {
      const n = amt(e.amount);
      if (e.target.t === 'all') return n * (e.target.filter.side === 'enemy' ? 2.2 : 0.8);
      if (e.target.t === 'hero') return e.target.side === 'friendly' ? -n * 0.5 : n * 0.6;
      if (e.target.t === 'self') return -n * 0.6;
      return n * 1.1;
    }
    case 'splitDamage':
      return amt(e.amount) * 0.9;
    case 'launchDiscount':
      return e.amount * 0.4;
    case 'launchStarship':
      return 6;
    case 'delayed':
      return e.effects.reduce((x, f) => x + effectValue(f), 0) * 0.7;
    case 'cthunBuff':
      return (e.atk + e.hp) * 0.45 + (e.taunt ? 0.5 : 0);
    case 'heal':
    case 'armor':
      return amt('amount' in e ? e.amount : 0) * 0.4;
    case 'buff': {
      const v = amt(e.atk) + amt(e.hp) + (e.keywords?.length ?? 0) * 1.2;
      const mult = e.target.t === 'all' ? 2.2 : 1;
      return (e.temp ? v * 0.4 : v) * mult;
    }
    case 'draw':
      return (e.who === 'self' ? 1.6 : e.who === 'both' ? 0.3 : -1.2) * amt(e.count);
    case 'summon':
    case 'summonRandom':
      return (e.who === 'opponent' ? -2.5 : 2.5) * e.count;
    case 'summonCopy':
      return 3 * e.count;
    case 'destroy':
      return e.target.t === 'all' ? 4 : e.target.t === 'self' ? -2 : 4.5;
    case 'silence':
    case 'freeze':
      return 1.2;
    case 'steal':
      return 6;
    case 'transform':
    case 'transformRandom':
      return 3;
    case 'returnToHand':
      return 1.5;
    case 'discover':
      return 1.8;
    case 'addCard':
    case 'addRandom':
    case 'addCopy':
      return 1.2 * ('count' in e ? e.count : 1);
    case 'equip':
      return 3;
    case 'heroAttack':
      return e.amount * 0.6;
    case 'mana':
      return e.kind === 'destroy' ? -2 : e.amount * 1.2;
    case 'discard':
      return -1.5 * Math.min(e.count, 3);
    case 'handBuff':
      return (e.atk + e.hp) * (e.scope === 'all' ? 1.5 : 0.8);
    case 'weaponBuff':
      return (e.atk ?? 0) + (e.dur ?? 0);
    case 'cond':
      return e.then.reduce((x, f) => x + effectValue(f), 0) * 0.6;
    case 'repeat':
      return e.effects.reduce((x, f) => x + effectValue(f), 0) * 2;
    default:
      return 1;
  }
}

function abilityValue(a: Ability): number {
  const v = a.effects.reduce((x, e) => x + effectValue(e), 0) * (a.cond ? 0.6 : 1);
  switch (a.on.k) {
    case 'play':
      return v;
    case 'deathrattle':
      return v * 0.85;
    case 'secret':
      return v * 0.8;
    case 'turnEnd':
    case 'turnStart':
      return v * (a.on.whose === 'mine' || a.on.whose === 'each' ? 1.6 : 0.5);
    default:
      return v * (a.once ? 0.6 : 1.1);
  }
}

/** 粗略的卡牌強度（自動組牌用）：卡牌價值減去費用的期望值 */
export function cardQuality(def: CardDef): number {
  let value = (def.abilities ?? []).reduce((x, a) => x + abilityValue(a), 0);
  if (def.chooseOne) value += Math.max(...def.chooseOne.map((o) => o.abilities.reduce((x, a) => x + abilityValue(a), 0)), 0) + 0.5;
  value += (def.auras ?? []).reduce((x, a) => x + ((a.atk ?? 0) + (a.hp ?? 0) + (a.keywords?.length ?? 0)) * (a.scope === 'adjacent' ? 1.2 : 2), 0);
  value += (def.spellDamage ?? 0) * 1.5;
  let q: number;
  if (def.type === 'MINION') {
    const atk = def.attack ?? 0;
    const hp = def.health ?? 0;
    value += atk + hp;
    for (const k of def.keywords ?? []) {
      if (k === 'CANT_ATTACK') value -= atk * 0.9;
      else if (k === 'DIVINE_SHIELD') value += atk * 0.8 + 0.5;
      else if (k === 'CHARGE') value += atk * 0.6;
      else if (k === 'RUSH') value += atk * 0.4;
      else if (k === 'WINDFURY') value += atk * 0.6;
      else if (k === 'TAUNT') value += hp * 0.25;
      else if (k === 'LIFESTEAL') value += atk * 0.5;
      else if (k === 'POISONOUS') value += 2;
      else value += 0.8;
    }
    if (def.enrage) value += def.enrage.atk * 0.4;
    q = value - (def.cost * 2 + 1);
  } else if (def.type === 'WEAPON') {
    value += (def.attack ?? 0) * (def.health ?? 0) * 0.9;
    q = value - (def.cost * 2 + 0.5);
  } else if (def.type === 'HERO') {
    // 英雄卡：戰吼 + 護甲 + 更強的英雄能力
    value += (def.armor ?? 0) * 0.5 + 6;
    q = value - (def.cost * 1.6 + 0.6);
  } else {
    q = value - (def.cost * 1.6 + 0.6);
  }
  // 回音：後期有多餘法力時可以重複使用
  if (def.keywords?.includes('ECHO')) q += 1 + Math.max(0, value - def.cost) * 0.3;
  // 星艦組件：之後還能組裝成星艦
  if (def.starshipPiece) q += ((def.attack ?? 0) + (def.health ?? 0)) * 0.3;
  if (def.overload) q -= def.overload * 1.2;
  if (def.costRule) q += 1;
  return q;
}

/** 理想費用曲線（每個費用的張數上限） */
const CURVE: Record<number, number> = { 0: 1, 1: 4, 2: 6, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 2, 9: 1, 10: 1 };

export interface BuildOptions {
  seed: number;
  /** 0 = 完全依強度；越大越隨機 */
  noise: number;
  /** 最多幾張傳說 */
  maxLegendary?: number;
  /** 只能使用這些稀有度 */
  rarities?: CardDef['rarity'][];
  /** 可用卡牌數量（例如玩家的收藏） */
  owned?: Record<string, number>;
}

export function buildDeck(heroClass: HeroClass, opts: BuildOptions): string[] {
  const rng = { rng: opts.seed };
  const pool = COLLECTIBLE.filter((c) => {
    if (!cardAllowed(c, heroClass, false)) return false;
    if (opts.rarities && !opts.rarities.includes(c.rarity)) return false;
    if (opts.owned && !opts.owned[c.id]) return false;
    if (c.custom) return true;
    return true;
  });
  const scored = pool.map((c) => ({
    c,
    score: cardQuality(c) + (cardClasses(c).includes(heroClass) ? 0.6 : 0) + (nextRandom(rng) - 0.5) * opts.noise,
  }));
  scored.sort((a, b) => b.score - a.score);
  const deck: string[] = [];
  const perCost = new Map<number, number>();
  let legendaries = 0;
  const add = (c: CardDef, respectCurve: boolean) => {
    const copies = Math.min(maxCopies(c), opts.owned ? opts.owned[c.id] ?? 0 : 2);
    for (let i = 0; i < copies && deck.length < DECK_SIZE; i++) {
      const cost = Math.min(c.cost, 10);
      if (respectCurve && (perCost.get(cost) ?? 0) >= (CURVE[cost] ?? 1)) return;
      if (c.rarity === 'LEGENDARY') {
        if (legendaries >= (opts.maxLegendary ?? 3)) return;
        legendaries++;
      }
      deck.push(c.id);
      perCost.set(cost, (perCost.get(cost) ?? 0) + 1);
    }
  };
  for (const { c } of scored) {
    if (deck.length >= DECK_SIZE) break;
    add(c, true);
  }
  for (const { c } of scored) {
    if (deck.length >= DECK_SIZE) break;
    const have = deck.filter((x) => x === c.id).length;
    if (have === 0) add(c, false);
  }
  // 卡不夠時（收藏太少）重複補滿
  for (const { c } of scored) {
    if (deck.length >= DECK_SIZE) break;
    const have = deck.filter((x) => x === c.id).length;
    const limit = Math.min(maxCopies(c), opts.owned ? opts.owned[c.id] ?? 0 : 2);
    for (let i = have; i < limit && deck.length < DECK_SIZE; i++) deck.push(c.id);
  }
  return shuffle(rng, deck).sort((a, b) => getCard(a).cost - getCard(b).cost);
}

export function deckCurve(cards: string[]): number[] {
  const curve = Array(8).fill(0);
  for (const id of cards) curve[Math.min(7, getCard(id).cost)]++;
  return curve;
}
