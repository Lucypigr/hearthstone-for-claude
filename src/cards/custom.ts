// ============================================================================
// 自訂卡牌：在這裡新增原創卡牌，不需要重新產生資料就會出現在遊戲中。
// 效果使用與官方卡相同的 DSL（見 src/engine/types.ts）。
// 設 collectible: true 就會出現在卡包與收藏中。
//
// 範例（取消註解即可使用）：
// {
//   id: 'CUSTOM_001',
//   dbfId: 9000001,
//   name: '見習冒險者',
//   nameEn: 'Apprentice Adventurer',
//   text: '<b>戰吼：</b>抽一張牌',
//   type: 'MINION',
//   cardClass: 'NEUTRAL',
//   rarity: 'COMMON',
//   set: 9999,
//   cost: 2,
//   attack: 2,
//   health: 2,
//   collectible: true,
//   abilities: [{ on: { k: 'play' }, effects: [{ e: 'draw', count: 1, who: 'self' }] }],
// },
// ============================================================================
import type { CardDef } from '../engine/types';

/** 資料庫中沒有的簡單衍生卡 */
const token = (id: string, name: string, nameEn: string, attack: number, health: number, extra: Partial<CardDef> = {}): CardDef => ({
  id,
  dbfId: 9100000 + Number(id.replace(/\D/g, '').slice(-5) || 0),
  name,
  nameEn,
  text: '',
  type: 'MINION',
  cardClass: 'NEUTRAL',
  rarity: 'FREE',
  set: 1810,
  cost: 1,
  attack,
  health,
  collectible: false,
  ...extra,
});

export const CUSTOM_CARDS: CardDef[] = [
  token('CORE_T_HYENA', '鬣狗', 'Hyena', 1, 1, { keywords: ['RUSH'], races: ['BEAST'], text: '<b>突襲</b>' }),
  token('CORE_T_MEDIC', '軍醫', 'Medic', 2, 2, { keywords: ['LIFESTEAL'], text: '<b>生命竊取</b>' }),
  token('CORE_T_BAT', '蝙蝠', 'Bat', 2, 1, { races: ['BEAST'] }),
  // 安戈洛失落之城的衍生卡（卡牌資料庫中沒有）
  token('TLC_T_IMP', '小鬼', 'Imp', 3, 2, { races: ['DEMON'], set: 1952 }),
  token('TLC_T_RAPTOR', '迅猛龍', 'Raptor', 3, 2, {
    races: ['BEAST'],
    set: 1952,
    text: '<b>戰吼：</b>抽一張牌',
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'draw', count: 1, who: 'self' }] }],
  }),
  {
    id: 'TLC_T_ROCK',
    dbfId: 9100101,
    name: '岩石',
    nameEn: 'Rock',
    text: '造成$3點傷害',
    type: 'SPELL',
    cardClass: 'NEUTRAL',
    rarity: 'FREE',
    set: 1952,
    cost: 1,
    collectible: false,
    target: { filter: { type: 'character', side: 'any' } },
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }] }],
  },
  {
    id: 'TLC_T_GLADE',
    dbfId: 9100102,
    name: '林間祝福',
    nameEn: 'Glade Blessing',
    text: '使一個手下獲得+2或-2生命值',
    type: 'SPELL',
    cardClass: 'PRIEST',
    rarity: 'FREE',
    set: 1952,
    cost: 1,
    spellSchool: 'HOLY',
    collectible: false,
    target: { filter: { type: 'minion', side: 'any' } },
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'coGladeSpell' }] }],
  },
  // 坦克工程師（穿越時間流）的 7/7 坦克：卡牌資料庫中沒有這張衍生卡
  {
    id: 'TIME_017t',
    dbfId: 9000017,
    name: '坦克',
    nameEn: 'Tank',
    text: '<b>聖盾</b>',
    type: 'MINION',
    cardClass: 'PALADIN',
    rarity: 'FREE',
    set: 1957,
    cost: 7,
    attack: 7,
    health: 7,
    races: ['MECHANICAL'],
    keywords: ['DIVINE_SHIELD'],
    collectible: false,
  },
];
