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
/** 卡牌的種族（「全部」= 所有種族） */
export function racesOf(id: string): Tribe[] {
  let r = raceCache.get(id);
  if (!r) {
    const races = DATA[id]?.races ?? [];
    r = races.includes('ALL') ? [...TRIBES] : (races.filter((x) => (TRIBES as string[]).includes(x)) as Tribe[]);
    raceCache.set(id, r);
  }
  return r;
}

export function isRace(id: string, t: Tribe): boolean {
  return racesOf(id).includes(t);
}

export function hasMech(id: string, mech: string): boolean {
  return DATA[id]?.mech?.includes(mech) ?? false;
}

export function allBgIds(): string[] {
  return Object.keys(DATA);
}
