// 英雄戰場的基本規則數值與共用函式
import { BEETLE, SPEC } from './cards';
import { bgCard, isRace, paradoxGift, racesOf } from './data';
import { attachGift, PARADOX } from './gifts';
import type { MinionSpec } from './api';
import type { BMinion } from './types';

export const BOARD_MAX = 7;
export const HAND_MAX = 10;
export const MINION_COST = 3;
export const REFRESH_COST = 1;
export const SELL_PRICE = 1;
export const MAX_TIER = 6;
/** 升到某個等級的基本費用（每回合沒有升級就便宜 1） */
export const UPGRADE_COST: Record<number, number> = { 2: 5, 3: 7, 4: 8, 5: 11, 6: 10, 7: 11 };
/** 酒館每次提供幾個手下 */
export const SHOP_SIZE: Record<number, number> = { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5, 6: 6 };
/** 卡池裡每張卡有幾份 */
export const COPIES: Record<number, number> = { 1: 16, 2: 15, 3: 13, 4: 11, 5: 9, 6: 7 };
/** 英雄基本生命值（另外有護甲） */
export const HERO_HP = 30;

/** 每回合的金幣（第 1 回合 3 枚，每回合 +1，最多 10） */
export function goldForTurn(turn: number): number {
  return Math.min(10, turn + 2);
}

/** 對英雄造成的傷害上限（遊戲初期比較低，避免太早被淘汰） */
export function damageCap(turn: number, alive: number): number {
  if (turn <= 3) return 5;
  if (turn <= 7) return 10;
  return alive > 4 ? 15 : Infinity;
}

/** 手下和磁力吸附上去的卡（g = 金卡倍率） */
export function specsOf(m: BMinion): { s: MinionSpec; g: number }[] {
  const out: { s: MinionSpec; g: number }[] = [];
  const own = SPEC.get(m.id);
  if (own) out.push({ s: own, g: m.golden ? 2 : 1 });
  for (const x of m.mags) {
    const s = SPEC.get(x.id);
    if (s) out.push({ s, g: x.g });
  }
  for (const id of m.gifts ?? []) {
    const s = SPEC.get(id);
    if (s) out.push({ s, g: 1 });
  }
  return out;
}

/** 光環：依「本賽局」的計數多出的身材 */
export function auraOf(cnt: Record<string, number>, m: BMinion, heroHp: number): [number, number] {
  let a = 0;
  let h = 0;
  if (m.id === BEETLE) {
    a += cnt.beetleA ?? 0;
    h += cnt.beetleH ?? 0;
  }
  // 飾品、任務獎勵：「你的手下擁有 +X/+Y」
  a += cnt.allA ?? 0;
  h += cnt.allH ?? 0;
  if (isRace(m.id, 'UNDEAD')) a += cnt.undeadA ?? 0;
  if (isRace(m.id, 'BEAST')) a += cnt['~beastA'] ?? 0;
  // 音量機兵：本賽局的加成（吸附在別的機械身上也算）
  for (const id of [m.id, ...m.mags.map((x) => x.id)]) {
    if (!id.startsWith('BG34_170t')) continue;
    a += cnt.volA ?? 0;
    h += cnt.volH ?? 0;
  }
  for (const { s, g } of specsOf(m)) {
    if (!s.aura) continue;
    const [x, y] = s.aura(cnt, m, g, heroHp);
    a += x;
    h += y;
  }
  return [a, h];
}

export function makeMinion(id: string, golden: boolean, uid: number): BMinion {
  const d = bgCard(id);
  const mech = d.mech ?? [];
  // 金燦桂冠詩人：永遠是金卡（但不給三合一獎勵）
  if (id === 'BG32_236') golden = true;
  const k = golden && id !== 'BG32_236' ? 2 : 1;
  const m: BMinion = {
    uid,
    id,
    atk: (d.atk ?? 0) * k,
    hp: (d.hp ?? 1) * k,
    golden,
    taunt: mech.includes('TAUNT'),
    shield: mech.includes('DIVINE_SHIELD'),
    windfury: mech.includes('WINDFURY') || mech.includes('MEGA_WINDFURY'),
    venom: mech.includes('VENOMOUS') || mech.includes('POISONOUS'),
    reborn: mech.includes('REBORN'),
    stealth: mech.includes('STEALTH'),
    mags: [],
    tmpAtk: 0,
    tmpHp: 0,
    tmpKw: [],
    n: 0,
  };
  // 黑暗悖論：帶著這局的黑暗贈禮
  if (id === PARADOX && paradoxGift) attachGift(m, paradoxGift, 0);
  return m;
}

export function isMagnetic(id: string): boolean {
  return !!SPEC.get(id)?.magnetic;
}

/** 磁力手下可以吸附到這個手下身上嗎？ */
export function canMagnetize(card: BMinion, host: BMinion): boolean {
  const spec = SPEC.get(card.id);
  if (!spec?.magnetic) return false;
  const to = spec.magnetTo ?? ['MECHANICAL'];
  return racesOf(host.id).some((r) => to.includes(r));
}

/** 戰吼手下（恐龍馴服者布萊恩用） */
export function hasBattlecry(id: string): boolean {
  return !!SPEC.get(id)?.battlecry;
}

/** 「你的酒館法術額外 +X」：本賽局的計數 + 場上的胡蒙戈茲 / 附魔哨兵 */
export function spellExtraOf(cnt: Record<string, number>, board: BMinion[]): [number, number] {
  let a = (cnt.tsA ?? 0) + (cnt.raka ?? 0);
  let h = (cnt.tsH ?? 0) + (cnt.raka ?? 0);
  for (const m of board) {
    if (m.dead) continue;
    const all = [{ id: m.id, g: m.golden ? 2 : 1 }, ...m.mags];
    for (const x of all) {
      if (x.id === 'BG32_341') (a += x.g), (h += 2 * x.g);
      if (x.id === 'BG35_341') (a += x.g), (h += x.g);
    }
  }
  return [a, h];
}
