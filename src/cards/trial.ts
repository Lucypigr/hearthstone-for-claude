// 教父卡札克斯的「自訂虛假審判」：由兩種效果與一個長度組成的法術
// 長度由卡牌本身決定：倉促審判（立即）、嚴厲審判（1 回合後）、無盡審判（4 回合後）
import type { CardDef, Effect } from '../engine/types';
import { getCard } from './registry';

const TURNS: Record<string, number> = { CAP_405tb1: 0, CAP_405tb2: 1, CAP_405tb3: 4 };
const cache = new Map<string, CardDef>();

export function trialDef(lengthId: string, effects: string[]): CardDef {
  const key = `${lengthId}:${effects.join('+')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parts = effects.map(getCard);
  const base = getCard(lengthId);
  const strip = (t: string) => t.replace(/\[x\]/g, '').split('@')[0].trim();
  const turns = TURNS[lengthId] ?? 0;
  const list: Effect[] = parts.flatMap((p) => (p.abilities ?? []).filter((a) => a.on.k === 'play').flatMap((a) => a.effects));
  const when = turns === 0 ? '' : `${turns} 回合後，`;
  const def: CardDef = {
    ...base,
    text: `${when}${parts.map((p) => strip(p.text)).join(' ')}`,
    abilities: [{ on: { k: 'play' }, effects: turns === 0 ? list : [{ e: 'delayed', turns, effects: list }] }],
    target: undefined,
    collectible: false,
  };
  cache.set(key, def);
  return def;
}
