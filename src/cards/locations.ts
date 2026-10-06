// ============================================================================
// 標準模式剩下的地點牌（浩劫與重生、逃離紫羅蘭堡、翡翠夢境、安戈洛失落之城）
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };

export const LOCATION_OVERRIDES: Record<string, Override> = {
  // 紅玉聖所：本回合你的下一次治療效果改為造成傷害
  CATA_301: { abilities: play(fn('coLifebind')) },
  // 守護巨龍之室：選擇你手牌中的一個手下，使其 +2/+2
  CATA_477: { abilities: play(fn('coChamber')) },
  // 暮光神殿：預兆。抽一張牌
  CATA_492: { abilities: play(fn('herald'), { e: 'draw', count: 1, who: 'self' }) },
  // 被奴役的奈斯比拉：造成 1 點傷害。在你施放一個邪能法術後重新開啟。亡語：召喚『被解放的』奈斯比拉
  CATA_527: {
    flags: ['reopenOnFel'],
    target: anyChar,
    abilities: [...play({ e: 'damage', target: { t: 'chosen' }, amount: 1 }), ...dr({ e: 'summon', card: 'CATA_527t2', count: 1, who: 'self' })],
    tokens: ['CATA_527t2'],
  },
  CATA_527t2: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FEL' }, effects: [fn('coNaga')] }] },
  // 爆發的火山：對所有敵人造成 $3 點傷害（隨機分散）。若你本回合打出過火焰法術，再造成 $3 點
  CATA_584: { abilities: play(fn('coVolcano')) },
  // 靜謐的空地：使一個手下獲得 +2 生命值與嘲諷。它會沉睡到你的下個回合結束
  MEND_044: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, hp: 2, keywords: ['TAUNT'] }, fn('coClearing')) },
  // 孤獨尖塔：召喚一個屬性值等同你手牌數的惡魔。它攻擊一個隨機敵方手下
  JAIL_511: { abilities: play(fn('coSpire')), tokens: ['JAIL_511t'] },
  JAIL_511t: {},
  // 地下網路：召喚一隻 2/1 的老鼠，亡語：抽一張牌
  JAIL_877: { abilities: play({ e: 'summon', card: 'JAIL_877t', count: 1, who: 'self' }), tokens: ['JAIL_877t'] },
  JAIL_877t: { abilities: dr({ e: 'draw', count: 1, who: 'self' }) },
  // 祖拉瑪特的監獄：選擇一張牌棄掉，召喚一個 5/5 的嘲諷手下。亡語：釋放祖拉瑪特，他每回合打出一張
  JAIL_887: { abilities: [...play(fn('coPrison')), ...dr({ e: 'summon', card: 'JAIL_887t2', count: 1, who: 'self' })], tokens: ['JAIL_887t2', 'JAIL_887t3'] },
  JAIL_887t2: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('coZuramat')] }] },
  JAIL_887t3: { keywords: ['TAUNT'] },
  // 低安全區：獲得一個隨機薩滿手下。在你打出另一張牌之前，它無法被打出
  JAIL_987: { abilities: play(fn('coLowSecurity')) },
  // 被汙染的聖劍：生命竊取
  LEG_RLK_067: { keywords: ['LIFESTEAL'] },
  // 墮落之龍的巢穴：選擇一條友方龍。召喚一顆 0/2 的蛋，它會孵化成那條龍的複製
  EDR_454: { target: { filter: { type: 'minion', side: 'friendly', race: 'DRAGON' } }, abilities: play(fn('coClutch')), tokens: ['EDR_454t'] },
  EDR_454t: { abilities: dr(fn('coHatch')) },
  // 禁忌神殿：花光你所有的法力，施放一個消耗等同的隨機法術
  EDR_520: { abilities: play(fn('coForbidden')) },
  // 艾梅達希爾：召喚一個 @ 費手下、獲得 @ 點護甲、抽 @ 張牌、重新整理 @ 顆法力水晶（每次使用提升！）
  FIR_907: { abilities: play(fn('coAmirdrassil')) },
  // 血瓣生態區：發現一個暫時的 1 費手下
  TLC_449: { abilities: play(fn('coDiscoverSet', { pool: { type: 'MINION', cost: 1 }, temp: true })) },
};
