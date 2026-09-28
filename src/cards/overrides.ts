// ============================================================================
// 手動覆寫：解析器看不懂、但很經典的卡牌，在這裡直接用效果 DSL 描述。
// key 是卡牌 ID（可在 hsreplay 卡牌網址或 .cache/unsupported.txt 找到）。
// 修改後請執行 `npm run cards` 重新產生資料（覆寫的卡才會被收錄）。
// ============================================================================
import type { CardDef } from '../engine/types';

export type Override = Partial<Omit<CardDef, 'id' | 'dbfId' | 'name' | 'nameEn' | 'text'>> & {
  /** 覆寫中引用的衍生卡，需一起收錄 */
  tokens?: string[];
};

const chosenMinion = { filter: { type: 'minion' as const, side: 'any' as const } };

export const OVERRIDES: Record<string, Override> = {
  // 動物夥伴：隨機召喚米莎、雷歐克或霍弗
  NEW1_031: {
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'summonOneOf', args: { cards: ['NEW1_032', 'NEW1_033', 'NEW1_034'] } }] }],
    tokens: ['NEW1_032', 'NEW1_033', 'NEW1_034'],
  },
  // 心靈之火：攻擊力變得與生命值相同
  CS1_129: {
    target: chosenMinion,
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'attackEqualsHealth' }] }],
  },
  // 劍刃亂舞：摧毀武器並對全部敵方手下造成武器攻擊力的傷害
  CS2_233: {
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'bladeFlurry' }] }],
  },
  // 雅立史卓莎：將一位英雄的生命值設為 15
  EX1_561: {
    target: { filter: { type: 'hero', side: 'any' }, optional: true },
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'setHeroHealth', args: { hp: 15 } }] }],
  },
  // 奧妮克希亞：召喚 1/1 雛龍直到場上填滿
  EX1_562: {
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'fillBoard', args: { card: 'ds1_whelptoken' } }] }],
    tokens: ['ds1_whelptoken'],
  },
  // 哈里遜‧瓊斯：摧毀對手武器並抽等同耐久度的牌
  EX1_558: {
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'destroyWeaponDraw' }] }],
  },
  // 心控技師：若對手有 4 個以上的手下，隨機控制一個
  EX1_085: {
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'stealIfFour' }] }],
  },
  // 修補匠超火花：隨機把另一個手下變成 5/5 魔暴龍或 1/1 松鼠
  EX1_083: {
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'custom', fn: 'transformRandomOther', args: { cards: ['EX1_tk28', 'EX1_tk29'] } }] }],
    tokens: ['EX1_tk28', 'EX1_tk29'],
  },
  // 伊瑟拉：回合結束時隨機獲得兩張夢境卡（簡化：從歡笑的姊妹、翡翠飛龍、夢境中挑選）
  EX1_572: {
    abilities: [
      {
        on: { k: 'turnEnd', whose: 'mine' },
        effects: [
          { e: 'custom', fn: 'addOneOf', args: { cards: ['DREAM_01', 'DREAM_03', 'DREAM_04'] } },
          { e: 'custom', fn: 'addOneOf', args: { cards: ['DREAM_01', 'DREAM_03', 'DREAM_04'] } },
        ],
      },
    ],
    tokens: ['DREAM_01', 'DREAM_03', 'DREAM_04'],
  },
  // 血帆襲擊者：獲得等同武器攻擊力的攻擊力
  NEW1_018: {
    abilities: [{ on: { k: 'play' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: { dyn: 'weaponAttack' } }] }],
  },
  // 恐怖海盜：每有 1 點武器攻擊力，消耗減少(1)
  NEW1_022: {
    keywords: ['TAUNT'],
    costRule: { per: 'weaponAttack', amount: 1 },
  },
};
