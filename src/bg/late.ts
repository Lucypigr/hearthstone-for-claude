// 晚一點才綁定的卡池與規格（夥伴、黑暗贈禮、時光扭曲、英雄專屬的卡、奧秘用）
// 這些檔案會被 cards.ts 載入；為了避免循環引用時還沒初始化，它們只依賴這裡，
// 由 cards.ts / spells.ts 初始化完之後填進來（只在效果觸發時才讀取）
import type { MinionSpec } from './api';
import { bgCard, hasBgCard } from './data';
import type { BMinion, Tribe } from './types';
import { TRIBES } from './types';
import { racesOf } from './data';

export const LATE = {
  /** 所有手下的效果 */
  spec: new Map<string, MinionSpec>(),
  /** 酒館卡池 */
  pool: [] as string[],
  /** 酒館裡會賣的法術 */
  tavern: [] as string[],
  /** 會給身材的酒館法術 */
  stats: [] as string[],
  /** 造法法術 */
  spellcraft: [] as string[],
  bounties: [] as string[],
};

export const hasBattlecry = (id: string) => !!LATE.spec.get(id)?.battlecry;
export const isMagnetic = (id: string) => !!LATE.spec.get(id)?.magnetic;
export const hasDeathrattle = (id: string) => !!LATE.spec.get(id)?.deathrattle;
/** 酒館法術（含尖尖箭、焚焰、秘法吸收這些衍生的酒館法術） */
export const isTavernSpell = (id: string) => hasBgCard(id) && (!!bgCard(id).pool || id === 'EBG_Spell_014' || id === 'BG35_910' || id === 'BG35_911');
export const spellCostOf = (id: string) => (hasBgCard(id) ? bgCard(id).cost ?? 1 : 1);

/** 最多的種族 */
export function mostCommonType(ms: BMinion[]): Tribe | null {
  const n = new Map<Tribe, number>();
  for (const m of ms) {
    const r = racesOf(m);
    if (r.length === TRIBES.length) continue;
    for (const t of r) n.set(t, (n.get(t) ?? 0) + 1);
  }
  let best: Tribe | null = null;
  let k = 0;
  for (const [t, c] of n) if (c > k) (best = t), (k = c);
  return best;
}
