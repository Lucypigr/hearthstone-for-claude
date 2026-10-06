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
