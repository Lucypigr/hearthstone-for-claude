// ============================================================================
// 穿越時間流（系列 1957，卡號 END_ / TIME_）：手動定義的卡牌效果。
// 新機制：倒轉（rewind）、傳說（fabled）、灌注（imbue）、地點牌、目標（Aura / Objective）、同族（Kindred）等。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const atStartOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnStart', whose: 'mine' }, effects }];
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyChar: TargetReq = { filter: { type: 'character', side: 'enemy' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const allFriendly = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const randomEnemy = (count = 1) => ({ t: 'random' as const, filter: { type: 'character' as const, side: 'enemy' as const }, count });
const randomEnemyMinion = (count = 1) => ({ t: 'random' as const, filter: { type: 'minion' as const, side: 'enemy' as const }, count });
const REWIND_TOKENS = ['TIME_000ta', 'TIME_000tb'];

export const TIMEWAYS_OVERRIDES: Record<string, Override> = {
  // 倒轉選項（只用來顯示選擇）
  TIME_000ta: {},
  TIME_000tb: {},
  // ============================================================== 倒轉
  // 半穩定傳送門：倒轉。將一張隨機手下牌加入你的手牌，它的消耗降低 (3)
  TIME_000: { rewind: 1, tokens: REWIND_TOKENS, abilities: play(fn('addRandomDiscount', { pool: { type: 'MINION' }, count: 1, discount: 3 })) },
  // 計時匕首：倒轉。向隨機敵人投擲 3 把飛刀，各造成 2 點傷害
  TIME_001: { rewind: 1, tokens: REWIND_TOKENS, abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'damage', target: randomEnemy(), amount: 2, spell: true }] }) },
  // 匯流粉碎者：倒轉。戰吼：對一個隨機敵人造成 7 點傷害
  TIME_004: { rewind: 1, tokens: REWIND_TOKENS, abilities: play({ e: 'damage', target: randomEnemy(), amount: 7 }) },

  // 穆拉丁（暫時的內容，稍後補完整）
  TIME_209: { fabled: ['TIME_209t', 'TIME_209t2'], keywords: ['RUSH'], tokens: ['TIME_209t', 'TIME_209t2'] },
  TIME_209t: {},
  TIME_209t2: {},
};
