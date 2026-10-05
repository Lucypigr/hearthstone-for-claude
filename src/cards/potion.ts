// 卡札克斯藥水的卡牌定義：擁有兩種材料的效果，敘述由兩種材料的敘述組成
import type { CardDef } from '../engine/types';
import { getCard } from './registry';

const cache = new Map<string, CardDef>();

export function potionDef(potionId: string, ingredients: string[]): CardDef {
  const key = `${potionId}:${ingredients.join('+')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parts = ingredients.map(getCard);
  const base = getCard(potionId);
  const strip = (t: string) => t.replace(/\[x\]/g, '').split('@')[0].trim();
  const def: CardDef = {
    ...base,
    text: parts.map((p) => strip(p.text)).join('\n'),
    abilities: parts.flatMap((p) => p.abilities ?? []),
    target: parts.find((p) => p.target)?.target,
    collectible: false,
  };
  cache.set(key, def);
  return def;
}
