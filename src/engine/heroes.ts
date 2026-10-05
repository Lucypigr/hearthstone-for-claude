// 各職業的基本英雄能力
import type { CardClass, HeroPowerSpec } from './types';

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
  // 瑪格的魔法 / 吉的力量：被動英雄能力（效果在引擎中處理）
  JAIL_800hp1: { effects: [], passive: true },
  JAIL_800hp2: { effects: [], passive: true },
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
