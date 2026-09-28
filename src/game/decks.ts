// 套牌規則與自動組牌（新手套牌 / 電腦套牌）
import { cardClasses, COLLECTIBLE, getCard } from '../cards/registry';
import { nextRandom, shuffle } from '../engine/rng';
import type { CardClass, CardDef } from '../engine/types';

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

/** 粗略的卡牌強度（自動組牌用） */
export function cardQuality(def: CardDef): number {
  let q = 0;
  if (def.type === 'MINION') {
    q = (def.attack ?? 0) + (def.health ?? 0) - (def.cost * 2 + 1);
    for (const k of def.keywords ?? []) {
      q += k === 'CANT_ATTACK' ? -2 : k === 'DIVINE_SHIELD' || k === 'CHARGE' || k === 'LIFESTEAL' ? 1.5 : 1;
    }
    q += (def.abilities?.length ?? 0) * 1.5 + (def.auras?.length ?? 0) * 1.5 + (def.spellDamage ?? 0);
  } else if (def.type === 'WEAPON') {
    q = (def.attack ?? 0) * (def.health ?? 0) - def.cost * 1.5 + 1 + (def.abilities?.length ?? 0);
  } else {
    q = 1 + (def.abilities?.reduce((n, a) => n + a.effects.length, 0) ?? 0) * 0.8;
    if (def.abilities?.some((a) => a.effects.some((e) => e.e === 'damage' || e.e === 'destroy'))) q += 1.2;
    if (def.secret) q -= 0.5;
  }
  if (def.overload) q -= def.overload;
  if (def.rarity === 'LEGENDARY') q += 1;
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
