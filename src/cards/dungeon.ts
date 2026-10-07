// ============================================================================
// 地城探險（狗頭人與地下城，LOOTA_）：寶藏卡與 Boss 衍生卡。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Effect, TargetReq } from '../engine/types';
import { ACTIVE_TREASURES, PASSIVE_TREASURES } from '../engine/dungeon';
import { DUNGEON_BOSSES } from './dungeonBosses';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };

export const DUNGEON_OVERRIDES: Record<string, Override> = {
  // ------------------------------------------------------------ 可以打出的寶藏
  // 支配護符：控制一個敵方手下，並把它加入你的牌組
  LOOTA_805: { target: enemyMinion, abilities: play({ e: 'steal', target: { t: 'chosen' } }, { e: 'shuffleCopy', target: { t: 'chosen' }, count: 1 }) },
  // 崩解魔杖：使所有敵方手下沉默並消滅
  LOOTA_806: { abilities: play({ e: 'silence', target: allEnemyMinions }, { e: 'destroy', target: allEnemyMinions }) },
  // 破滅之球：摧毀對手 2 個法力水晶，並使其棄 2 張牌
  LOOTA_811: { abilities: play({ e: 'mana', kind: 'destroy', amount: 2, who: 'opponent' }, fn('dunDiscardOpp', { n: 2 })) },
  // 迅捷之靴：本回合你的手下消耗 (0)
  LOOTA_812: { abilities: play(fn('dunFreeMinions')) },
  // 魔鏡：選擇一個手下，召喚它的複製，並加入你的牌組
  LOOTA_813: { target: anyMinion, abilities: play({ e: 'summonCopy', target: { t: 'chosen' }, count: 1 }, { e: 'shuffleCopy', target: { t: 'chosen' }, count: 1 }) },
  // 許願術：用傳說手下填滿你的戰場，並完全治療你的英雄
  LOOTA_814: { abilities: play(fn('dunWish')) },
  // 派對傳送門：每當你施放法術，召喚一個相同消耗的隨機手下
  LOOTA_816: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('dunPortal')] }] },
  // 大法師之杖：在你的回合開始時，獲得一張隨機法師法術
  LOOTA_819: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'addRandom', pool: { type: 'SPELL', cls: 'MAGE' }, count: 1, who: 'self' }] }] },
  // 奪命匕首：劇毒、超級風怒
  LOOTA_821: { keywords: ['POISONOUS', 'MEGA_WINDFURY'] },
  // 烤肉節杖：隨機施放「炎爆術」，直到一名英雄死亡
  LOOTA_822: { abilities: play(fn('dunRoast')) },
  // 充盈之袋：抽牌直到手牌已滿
  LOOTA_823: { abilities: play(fn('dunFillHand')) },
  // 可攜式冰牆：嘲諷，無法攻擊
  LOOTA_826: { keywords: ['TAUNT', 'CANT_ATTACK'] },
  // 拉格納羅斯的餘燼：對隨機敵人發射三顆造成 8 點傷害的火球
  LOOTA_827: { abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 8, spell: true }] }) },
  // 忠誠的跟班：嘲諷；你這一輪每擊敗一個 Boss，就 +1/+1
  LOOTA_829: { keywords: ['TAUNT'], abilities: play(fn('dunWinsBuff')) },
  // 強奪手套：從你的對手手牌偷 3 張牌
  LOOTA_834: { abilities: play(fn('dunMug', { n: 3 })) },
  // 貪婪之鎬：在你的英雄攻擊後，獲得一個空的法力水晶
  LOOTA_835: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [{ e: 'mana', kind: 'empty', amount: 1 }] }] },
  // 一袋錢幣：用幸運幣填滿你的手牌
  LOOTA_836: { abilities: play(fn('dunCoins')) },
  // 塞納留斯號角：號召 3 個手下
  LOOTA_837: { abilities: play({ e: 'recruit', count: 3 }) },
  // 爆爆博士的爆爆箱：召喚 7 個爆爆機器人
  LOOTA_838: { abilities: play({ e: 'summon', card: 'GVG_110t', count: 7, who: 'self' }), tokens: ['GVG_110t'] },
  // 蠟燭狂怒者：亡語：重新召喚這個手下
  LOOTA_840: { abilities: dr({ e: 'summon', card: 'LOOTA_840', count: 1, who: 'self' }) },
  // 至尊燭：對所有敵方手下造成 4 點傷害，並把這張牌洗入你的牌堆
  LOOTA_843: { abilities: play({ e: 'damage', target: allEnemyMinions, amount: 4, spell: true }, { e: 'shuffle', card: 'LOOTA_843', count: 1 }) },
  // 模仿面具：選擇一個手下，你手牌中的手下變成它的複製
  LOOTA_847: { target: anyMinion, abilities: play(fn('dunMask')) },

  // ------------------------------------------------------------ Boss 衍生卡
  LOOTA_BOSS_18t: {},
  LOOTA_BOSS_20t: { abilities: dr({ e: 'mana', kind: 'destroy', amount: 1 }), keywords: ['CANT_ATTACK'] },
  LOOTA_BOSS_48t: {},
  LOOTA_BOSS_49t: {},
};

// 被動寶藏：效果由遊戲引擎依 id 處理（見 src/engine/dungeon.ts）
for (const id of PASSIVE_TREASURES) DUNGEON_OVERRIDES[id] = {};

// Boss 英雄卡：只用來顯示名稱與圖片（英雄能力由遊戲開始時指定）
for (const b of DUNGEON_BOSSES) DUNGEON_OVERRIDES[b.hero] = { heroPower: { effects: [] } };

/** 這個模式用到、但不可收藏的卡（建置時一併收錄） */
export const DUNGEON_EXTRA_IDS: string[] = [
  ...PASSIVE_TREASURES,
  ...ACTIVE_TREASURES,
  ...DUNGEON_BOSSES.map((b) => b.hero),
  'LOOTA_BOSS_18t',
  'LOOTA_BOSS_20t',
  'LOOTA_BOSS_48t',
  'LOOTA_BOSS_49t',
  'LOE_018',
];
