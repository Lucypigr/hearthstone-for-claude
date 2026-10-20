// 英雄戰場的卡牌資料（由 scripts/build-bg.ts 產生的 src/data/bg.json）
import raw from '../data/bg.json';
import { TRIBES, type BgCardData, type Tribe } from './types';

const DATA = raw as Record<string, BgCardData>;

export function bgCard(id: string): BgCardData {
  const c = DATA[id];
  if (!c) throw new Error(`找不到英雄戰場的卡：${id}`);
  return c;
}

export function hasBgCard(id: string): boolean {
  return id in DATA;
}

export function tierOf(id: string): number {
  return DATA[id]?.tier ?? 1;
}

const raceCache = new Map<string, Tribe[]>();
/** 這局的異象：沒有種族的手下擁有所有種族、夥伴擁有所有種族 */
export const raceRules = { untypedAll: false, buddiesAll: false };
/** 可以直接傳卡牌 id，或是傳手下（手下身上的 xr 是額外的種族，例如銅鬚頭像讓布萊恩同時是魚人和龍） */
type RaceArg = string | { id: string; xr?: Tribe[] };
/** 卡牌的種族（「全部」= 所有種族） */
export function racesOf(a: RaceArg): Tribe[] {
  const id = typeof a === 'string' ? a : a.id;
  let r = raceCache.get(id);
  if (!r) {
    const races = DATA[id]?.races ?? [];
    r = races.includes('ALL') ? [...TRIBES] : (races.filter((x) => (TRIBES as string[]).includes(x)) as Tribe[]);
    raceCache.set(id, r);
  }
  if ((raceRules.untypedAll && !r.length && DATA[id]?.type === 'MINION') || (raceRules.buddiesAll && id.includes('_Buddy'))) return [...TRIBES];
  if (typeof a !== 'string' && a.xr?.length) return [...new Set([...r, ...a.xr])];
  return r;
}

export function isRace(a: RaceArg, t: Tribe): boolean {
  return racesOf(a).includes(t);
}

export function hasMech(id: string, mech: string): boolean {
  return DATA[id]?.mech?.includes(mech) ?? false;
}

/** 黑暗悖論：這局的等級、身材與黑暗贈禮（每局不同） */
export let paradoxGift: string | null = null;
export function setParadox(o: { tier: number; atk: number; hp: number; gift: string } | null | undefined) {
  const d = DATA['BG36_360'];
  if (!d) return;
  if (!o) {
    d.tier = 1;
    d.atk = 1;
    d.hp = 1;
    paradoxGift = null;
    return;
  }
  d.tier = o.tier;
  d.atk = o.atk;
  d.hp = o.hp;
  paradoxGift = o.gift;
}

export function allBgIds(): string[] {
  return Object.keys(DATA);
}
