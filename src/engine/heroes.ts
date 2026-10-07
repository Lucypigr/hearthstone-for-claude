// 各職業的基本英雄能力
import { ACTIVE_TREASURES } from './dungeon';
import type { CardClass, HeroPowerSpec, TargetReq } from './types';

const DUN_MINION: TargetReq = { filter: { type: 'minion', side: 'any' } };
const DUN_FRIENDLY_MINION: TargetReq = { filter: { type: 'minion', side: 'friendly' } };

export const HERO_POWERS: Record<Exclude<CardClass, 'NEUTRAL'>, HeroPowerSpec> = {
  MAGE: {
    effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 1 }],
    target: { filter: { type: 'character', side: 'any' } },
  },
  WARRIOR: { effects: [{ e: 'armor', amount: 2 }] },
  PRIEST: {
    effects: [{ e: 'heal', target: { t: 'chosen' }, amount: 2 }],
    target: { filter: { type: 'character', side: 'any' } },
  },
  HUNTER: { effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 2 }] },
  ROGUE: { effects: [{ e: 'equip', card: 'CS2_082' }] },
  PALADIN: { effects: [{ e: 'summon', card: 'CS2_101t', count: 1, who: 'self' }], needsBoardSpace: true },
  SHAMAN: { effects: [{ e: 'custom', fn: 'totemicCall' }], needsBoardSpace: true },
  WARLOCK: {
    effects: [
      { e: 'draw', count: 1, who: 'self' },
      { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 },
    ],
  },
  DRUID: {
    effects: [
      { e: 'heroAttack', amount: 1 },
      { e: 'armor', amount: 1 },
    ],
  },
  DEMONHUNTER: { effects: [{ e: 'heroAttack', amount: 1 }] },
  DEATHKNIGHT: { effects: [{ e: 'summon', card: 'HERO_11bpt', count: 1, who: 'self' }], needsBoardSpace: true },
};

/** 審判者瑪瑞爾：強化後的基本英雄能力（卡牌 ID） */
export const UPGRADED_POWER_IDS: Record<Exclude<CardClass, 'NEUTRAL'>, string> = {
  WARRIOR: 'HERO_01bp2',
  SHAMAN: 'HERO_02bp2',
  ROGUE: 'HERO_03bp2',
  PALADIN: 'HERO_04bp2',
  HUNTER: 'HERO_05bp2',
  DRUID: 'HERO_06bp2',
  WARLOCK: 'HERO_07bp2',
  MAGE: 'HERO_08bp2',
  PRIEST: 'HERO_09bp2',
  DEMONHUNTER: 'HERO_10bp2',
  DEATHKNIGHT: 'HERO_11bp2',
};

/**
 * 不屬於基本職業的英雄能力（以卡牌 ID 為 key）：強化後的基本能力、充能戰錘的閃電震盪、
 * 『炎魔』拉格納羅斯的死吧，蟲子！。名稱與敘述由卡牌資料提供（cards.json 的 powers）。
 */
export const EXTRA_POWERS: Record<string, HeroPowerSpec> = {
  HERO_01bp2: { effects: [{ e: 'armor', amount: 4 }] },
  HERO_02bp2: { effects: [{ e: 'custom', fn: 'totemicSlam' }], needsBoardSpace: true },
  HERO_03bp2: { effects: [{ e: 'equip', card: 'AT_132_ROGUEt' }] },
  HERO_04bp2: { effects: [{ e: 'summon', card: 'CS2_101t', count: 2, who: 'self' }], needsBoardSpace: true },
  HERO_05bp2: { effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 3 }] },
  HERO_06bp2: {
    effects: [
      { e: 'heroAttack', amount: 2 },
      { e: 'armor', amount: 2 },
    ],
  },
  HERO_07bp2: { effects: [{ e: 'draw', count: 1, who: 'self' }] },
  HERO_08bp2: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }], target: { filter: { type: 'character', side: 'any' } } },
  HERO_09bp2: { effects: [{ e: 'heal', target: { t: 'chosen' }, amount: 4 }], target: { filter: { type: 'character', side: 'any' } } },
  HERO_10bp2: { effects: [{ e: 'heroAttack', amount: 2 }] },
  HERO_11bp2: { effects: [{ e: 'summon', card: 'HERO_11bp2t', count: 1, who: 'self' }], needsBoardSpace: true },
  AT_050t: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }], target: { filter: { type: 'character', side: 'any' } } },
  BRM_027p: { effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 8 }] },
  // 奧丹姆的任務獎勵
  ULD_140p: { effects: [{ e: 'draw', count: 1, who: 'self' }, { e: 'costMod', amount: -99, scope: 'it' }] },
  ULD_155p: { effects: [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 2 }] },
  ULD_291p: { effects: [{ e: 'custom', fn: 'doubleBattlecry', args: { all: true } }] },
  ULD_326p: { effects: [{ e: 'equip', card: 'ULD_326t' }] },
  ULD_431p: { effects: [{ e: 'custom', fn: 'emperorWraps' }], target: { filter: { type: 'minion', side: 'friendly' } }, needsBoardSpace: true },
  ULD_433p: { effects: [{ e: 'addRandom', pool: { type: 'SPELL', cls: 'MAGE' }, count: 1, who: 'self' }, { e: 'costMod', amount: -2, scope: 'it' }] },
  ULD_711p3: { effects: [{ e: 'summon', card: 'ULD_711t', count: 1, who: 'self' }], needsBoardSpace: true },
  ULD_724p: { effects: [{ e: 'custom', fn: 'obeliskEye' }], target: { filter: { type: 'character', side: 'any' } } },
  // 恐龍學：賦予一個野獸 +3/+3；薩弗拉斯：對一個隨機敵人造成 8 點傷害
  UNG_917t1: { effects: [{ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }], target: { filter: { type: 'minion', side: 'any', race: 'BEAST' } } },
  // 血腥醫生薩蕾娜的第二個英雄能力：吸血鬼之吻（消耗 3 具屍體）：賦予一個手下 +3 攻擊力
  JAIL_446hp: { effects: [{ e: 'buff', target: { t: 'chosen' }, atk: 3 }], target: { filter: { type: 'minion', side: 'any' } } },
  // 惡魔變身（核心）：英雄能力換成「造成 5 點傷害」，用兩次後換回去
  BT_429p: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 5 }], target: { filter: { type: 'character', side: 'any' } } },
  BT_429p2: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 5 }], target: { filter: { type: 'character', side: 'any' } } },
  // 暗影形態（核心）：心靈尖刺 / 心靈碎裂
  EX1_625t: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }], target: { filter: { type: 'character', side: 'any' } } },
  EX1_625t2: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 3 }], target: { filter: { type: 'character', side: 'any' } } },
  // 灌注後的英雄能力（穿越時間流）：青銅龍的祝福（盜賊）/ 無盡的祝福（死亡騎士）
  END_000p: { effects: [{ e: 'custom', fn: 'bronzeBlessing' }], rewind: true },
  END_003p: { effects: [], passive: true },
  // 瑪格的魔法 / 吉的力量：被動英雄能力（效果在引擎中處理）
  JAIL_800hp1: { effects: [], passive: true },
  JAIL_800hp2: { effects: [], passive: true },
  // 灌注後的英雄能力（翡翠夢境）：德魯伊、獵人、法師、聖騎士、牧師、薩滿
  EDR_847p: { effects: [{ e: 'custom', fn: 'coImbued', args: { kind: 'golem' } }] },
  EDR_850p: { effects: [{ e: 'custom', fn: 'coImbued', args: { kind: 'wolf' } }] },
  EDR_851p: { effects: [{ e: 'custom', fn: 'coImbued', args: { kind: 'wisp' } }] },
  EDR_445p: { effects: [{ e: 'custom', fn: 'coImbued', args: { kind: 'dragon' } }] },
  EDR_449p: { effects: [{ e: 'custom', fn: 'coImbued', args: { kind: 'moon' } }] },
  EDR_448p: { effects: [{ e: 'custom', fn: 'coImbued', args: { kind: 'wind' } }], target: { filter: { type: 'minion', side: 'friendly' } } },
  // 蘇拉斯的故事：對一個隨機敵人造成 8 點傷害（用兩次後換回）
  // ------------------------------------------------------------ 地城探險 Boss 英雄能力
  LOOTA_BOSS_04p: { target: DUN_MINION, needsBoardSpace: true, effects: [{ e: 'custom', fn: 'dunWaxCopy', args: { oneOne: true } }] },
  LOOTA_BOSS_27p: { target: DUN_MINION, needsBoardSpace: true, effects: [{ e: 'custom', fn: 'dunWaxCopy', args: { oneOne: false } }] },
  LOOTA_BOSS_05p: { effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 2 }, amount: 1 }] },
  LOOTA_BOSS_28p: { effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 3 }, amount: 2 }] },
  LOOTA_BOSS_06p: { target: DUN_MINION, effects: [{ e: 'custom', fn: 'dunEvolve', args: { delta: 1 } }] },
  LOOTA_BOSS_29p: { target: DUN_MINION, effects: [{ e: 'custom', fn: 'dunEvolve', args: { delta: 3 } }] },
  LOOTA_BOSS_09p: { target: DUN_MINION, effects: [{ e: 'freeze', target: { t: 'chosen' } }] },
  LOOTA_BOSS_10p: { effects: [{ e: 'heal', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 2 }] },
  LOOTA_BOSS_11p: { target: DUN_FRIENDLY_MINION, effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 1 }, { e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 0 }] },
  LOOTA_BOSS_30p: { target: DUN_FRIENDLY_MINION, effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 1 }, { e: 'buff', target: { t: 'chosen' }, atk: 5, hp: 0 }] },
  LOOTA_BOSS_12p: { target: DUN_MINION, effects: [{ e: 'buff', target: { t: 'chosen' }, atk: 0, hp: 0, keywords: ['CHARGE'] }] },
  LOOTA_BOSS_13p: { target: DUN_FRIENDLY_MINION, effects: [{ e: 'returnToHand', target: { t: 'chosen' } }] },
  LOOTA_BOSS_15p: { effects: [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 0, hp: 0, keywords: ['DIVINE_SHIELD'] }] },
  LOOTA_BOSS_16p: { passive: true, effects: [] },
  LOOTA_BOSS_17p: { passive: true, effects: [] },
  LOOTA_BOSS_38p: { passive: true, effects: [] },
  LOOTA_BOSS_19p: { passive: true, effects: [] },
  LOOTA_BOSS_31p: { passive: true, effects: [] },
  LOOTA_BOSS_33p: { passive: true, effects: [] },
  LOOTA_BOSS_47p: { passive: true, effects: [] },
  LOOTA_BOSS_48p: { passive: true, effects: [] },
  LOOTA_BOSS_18p: { needsBoardSpace: true, effects: [{ e: 'summon', card: 'LOOTA_BOSS_18t', count: 2, who: 'self' }] },
  LOOTA_BOSS_20p: { effects: [{ e: 'silence', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } } }] },
  LOOTA_BOSS_21p: { effects: [{ e: 'custom', fn: 'dunDestroyHighest' }] },
  LOOTA_BOSS_22p: { needsBoardSpace: true, effects: [{ e: 'custom', fn: 'dunFromDeck' }] },
  LOOTA_BOSS_23p: { effects: [{ e: 'custom', fn: 'dunHandDiscount', args: { amount: 1 } }] },
  LOOTA_BOSS_24p: { effects: [{ e: 'handBuff', atk: 1, hp: 1, scope: 'all' }] },
  LOOTA_BOSS_34p: { passive: false, effects: [{ e: 'custom', fn: 'dunDevour' }] },
  LOOTA_BOSS_35p: { effects: [{ e: 'custom', fn: 'dunSecret', args: { card: 'EX1_287' } }] },
  LOOTA_BOSS_36p: { needsBoardSpace: true, effects: [{ e: 'summon', card: 'DUN_SPORE', count: 1, who: 'self' }] },
  LOOTA_BOSS_37p: { effects: [{ e: 'addCard', card: 'EX1_277', count: 1, who: 'self' }] },
  LOOTA_BOSS_39p: { effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: 1 }] },
  LOOTA_BOSS_40p: { target: DUN_MINION, effects: [{ e: 'buff', target: { t: 'chosen' }, atk: -1, hp: 0 }] },
  LOOTA_BOSS_41p: { effects: [{ e: 'custom', fn: 'dunRecruitBoth' }] },
  LOOTA_BOSS_42p: { effects: [{ e: 'armor', amount: 3 }] },
  LOOTA_BOSS_43p: { effects: [{ e: 'draw', count: 3, who: 'both' }] },
  LOOTA_BOSS_44p: { target: { filter: { type: 'character', side: 'any' } }, effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }] },
  LOOTA_BOSS_45p: { effects: [{ e: 'mana', kind: 'temp', amount: 1 }] },
  LOOTA_BOSS_46p: { effects: [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 1, hp: 1 }] },
  LOOTA_BOSS_49p: { needsBoardSpace: true, effects: [{ e: 'summon', card: 'LOOTA_BOSS_49t', count: 1, who: 'self' }] },
  LOOTA_BOSS_51p: { target: { filter: { type: 'minion', side: 'enemy', maxAttack: 2 } }, effects: [{ e: 'steal', target: { t: 'chosen' } }] },
  LOOTA_BOSS_54p: { effects: [] },
  LOOTA_BOSS_99p: { effects: [{ e: 'custom', fn: 'dunTreasure', args: { pool: ACTIVE_TREASURES } }] },
  GDB_846hp: { effects: [{ e: 'custom', fn: 'gdTracking' }] },
  JAIL_EVENT_101hp: { effects: [{ e: 'custom', fn: 'coCollapse' }] },
  TLC_632t: { effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 8 }] },
  UNG_934t2: { effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 8 }] },
};

/** 管理者埃克索圖斯：換成『炎魔』拉格納羅斯 */
export const RAGNAROS_HERO = 'BRM_027h';
export const RAGNAROS_POWER = 'BRM_027p';

export const BASIC_TOTEMS = ['CS2_050', 'CS2_051', 'NEW1_009', 'CS2_052'];

export const CLASS_NAMES: Record<CardClass, string> = {
  NEUTRAL: '中立',
  DEATHKNIGHT: '死亡騎士',
  DEMONHUNTER: '惡魔獵人',
  DRUID: '德魯伊',
  HUNTER: '獵人',
  MAGE: '法師',
  PALADIN: '聖騎士',
  PRIEST: '牧師',
  ROGUE: '盜賊',
  SHAMAN: '薩滿',
  WARLOCK: '術士',
  WARRIOR: '戰士',
};
