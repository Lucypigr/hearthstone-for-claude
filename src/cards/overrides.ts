// ============================================================================
// 手動覆寫：解析器看不懂、但很經典的卡牌，在這裡直接用效果 DSL 描述。
// key 是卡牌 ID（可在 hsreplay 卡牌網址或 .cache/unsupported.txt 找到）。
// 修改後請執行 `npm run cards` 重新產生資料（覆寫的卡才會被收錄）。
// ============================================================================
import type { CardDef, Effect, HeroPowerSpec, TargetReq } from '../engine/types';

export type Override = Partial<Omit<CardDef, 'id' | 'dbfId' | 'name' | 'nameEn' | 'text' | 'heroPower'>> & {
  /** 英雄卡的新英雄能力（名稱、敘述、費用會自動從卡牌資料帶入） */
  heroPower?: HeroPowerSpec;
  /** 覆寫中引用的衍生卡，需一起收錄 */
  tokens?: string[];
};

const play = (...effects: Effect[]) => [{ on: { k: 'play' as const }, effects }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const LACKEYS = ['DAL_613', 'DAL_614', 'DAL_739', 'DAL_741', 'ULD_616', 'DRG_052'];
const HORSEMEN = ['ICC_829t2', 'ICC_829t3', 'ICC_829t4', 'ICC_829t5'];

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

  // ==========================================================================
  // 英雄卡
  // ==========================================================================

  // 賈拉克瑟斯領主：裝備 3/8 血怒；英雄能力召喚 6/6 煉獄火
  EX1_323: {
    abilities: play({ e: 'equip', card: 'EX1_323w' }),
    heroPower: { effects: [{ e: 'summon', card: 'EX1_tk34', count: 1, who: 'self' }], needsBoardSpace: true },
    tokens: ['EX1_323w', 'EX1_tk34'],
  },
  // 『黯刃騎士』烏瑟：裝備 5/3 生命竊取武器；英雄能力召喚天啟四騎士，四個到齊就消滅敵方英雄
  ICC_829: {
    abilities: play({ e: 'equip', card: 'ICC_829t' }),
    heroPower: { effects: [{ e: 'custom', fn: 'horsemen', args: { cards: HORSEMEN } }], needsBoardSpace: true },
    tokens: ['ICC_829t', ...HORSEMEN],
  },
  // 『暗影死神』安杜因：消滅所有攻擊力 5 以上的手下；英雄能力造成 2 點傷害，打出卡牌後可再次使用
  ICC_830: {
    abilities: play({ e: 'destroy', target: { t: 'all', filter: { type: 'minion', minAttack: 5 } } }),
    heroPower: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }], target: anyChar, refresh: 'cardPlayed' },
  },
  // 『奪血者』古爾丹：召喚本場死亡的所有友方惡魔；英雄能力 生命竊取 造成 3 點傷害
  ICC_831: {
    abilities: play({ e: 'custom', fn: 'summonDeadRace', args: { race: 'DEMON' } }),
    heroPower: { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 3 }], target: anyChar, lifesteal: true },
  },
  // 『疫病蟲王』瑪法里恩：二選一 召喚兩隻劇毒蜘蛛 / 兩隻嘲諷甲蟲；英雄能力二選一 +3 攻擊 / +3 護甲
  ICC_832: {
    chooseOne: [
      {
        id: 'ICC_832a',
        name: '聖甲蟲之災',
        text: '召喚兩隻具有<b>嘲諷</b>的1/5聖甲蟲',
        abilities: play({ e: 'summon', card: 'ICC_832t4', count: 2, who: 'self' }),
      },
      {
        id: 'ICC_832b',
        name: '蜘蛛之災',
        text: '召喚兩隻具有<b>劇毒</b>的1/2冰霜寡婦',
        abilities: play({ e: 'summon', card: 'ICC_832t3', count: 2, who: 'self' }),
      },
    ],
    heroPower: {
      effects: [],
      chooseOne: [
        { id: 'ICC_832pa', name: '聖甲蟲之殼', text: '+3護甲值', effects: [{ e: 'armor', amount: 3 }] },
        { id: 'ICC_832pb', name: '蜘蛛之牙', text: '本回合+3攻擊力', effects: [{ e: 'heroAttack', amount: 3 }] },
      ],
    },
    tokens: ['ICC_832t3', 'ICC_832t4'],
  },
  // 『霜巫』珍娜：召喚 3/6 水元素，你的元素在本場對戰具有生命竊取；英雄能力造成 1 點傷害，擊殺手下時召喚水元素
  ICC_833: {
    abilities: play({ e: 'summon', card: 'ICC_833t', count: 1, who: 'self' }, { e: 'grant', keyword: 'LIFESTEAL', race: 'ELEMENTAL' }),
    heroPower: {
      effects: [
        { e: 'damage', target: { t: 'chosen' }, amount: 1 },
        { e: 'cond', cond: { c: 'itDied' }, then: [{ e: 'cond', cond: { c: 'itIsMinion' }, then: [{ e: 'summon', card: 'ICC_833t', count: 1, who: 'self' }] }] },
      ],
      target: anyChar,
    },
    tokens: ['ICC_833t'],
  },
  // 『天譴領主』卡爾洛斯：裝備會同時傷害相鄰手下的 4/3 霜之哀傷；英雄能力對所有手下造成 1 點傷害
  ICC_834: {
    abilities: play({ e: 'equip', card: 'ICC_834w' }),
    heroPower: { effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'minion' } }, amount: 1 }] },
    tokens: ['ICC_834w'],
  },
  // 『死亡先知』索爾：把你的手下變成費用多 2 的隨機手下；英雄能力把一個友方手下變成費用多 1 的隨機手下
  ICC_481: {
    abilities: play({ e: 'evolve', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, amount: 2 }),
    heroPower: { effects: [{ e: 'evolve', target: { t: 'chosen' }, amount: 1 }], target: friendlyMinion },
  },
  // 製影者史蓋伯斯：所有手下回到手牌，召喚兩個 4/2 潛行暗影；英雄能力讓下一張牌消耗減少(2)
  AV_203: {
    abilities: play(
      { e: 'returnToHand', target: { t: 'all', filter: { type: 'minion' } } },
      { e: 'summon', card: 'AV_203t', count: 2, who: 'self' },
    ),
    heroPower: { effects: [{ e: 'nextCardDiscount', amount: 2 }] },
    tokens: ['AV_203t'],
  },
  // 葛拉克朗（基本形態；不支援祈願升級）
  DRG_600: {
    abilities: play({ e: 'summonRandom', pool: { type: 'MINION', race: 'DEMON' }, count: 1, who: 'self' }),
    heroPower: { effects: [{ e: 'summon', card: 'DRG_238t12t2', count: 2, who: 'self' }], needsBoardSpace: true },
    tokens: ['DRG_238t12t2'],
  },
  DRG_610: {
    abilities: play({ e: 'draw', count: 1, who: 'self' }, { e: 'costMod', amount: -99, scope: 'it' }),
    heroPower: { effects: [{ e: 'custom', fn: 'addOneOf', args: { cards: LACKEYS } }] },
    tokens: LACKEYS,
  },
  DRG_620: {
    abilities: play({ e: 'summon', card: 'DRG_620t4', count: 2, who: 'self' }),
    heroPower: { effects: [{ e: 'summon', card: 'DRG_238t14t3', count: 1, who: 'self' }], needsBoardSpace: true },
    tokens: ['DRG_620t4', 'DRG_238t14t3'],
  },
  DRG_650: {
    abilities: play({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION' } }, { e: 'buff', target: { t: 'it' }, atk: 4, hp: 4 }),
    heroPower: { effects: [{ e: 'heroAttack', amount: 3 }] },
  },
  DRG_660: {
    abilities: play({ e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 } }),
    heroPower: { effects: [{ e: 'addRandom', pool: { type: 'MINION', cls: 'PRIEST' }, count: 1, who: 'self' }] },
  },
  // 『死屍獸王』雷克薩：對所有敵方手下造成 2 點傷害；英雄能力「製造殭屍獸」
  //（先發現一張獵人野獸，再發現一張殭屍獸專用野獸，縫合成一張卡加入手牌）
  ICC_828: {
    abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: 2 }),
    heroPower: { effects: [{ e: 'custom', fn: 'buildABeast' }] },
    tokens: ['ICC_828t', 'ICC_828t2', 'ICC_828t3', 'ICC_828t4', 'ICC_828t5', 'ICC_828t6', 'ICC_828t7'],
  },
  // 殭屍獸本體（數值與效果由兩個部位合成，見 src/cards/zombeast.ts）
  ICC_828t: {},

  // ------------------------------------------------------------------ 克蘇恩
  // 克蘇恩：造成等同其攻擊力的傷害，隨機分配到所有敵人身上
  OG_280: {
    abilities: play({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: { dyn: 'selfAttack' } }),
  },
  // 克蘇恩之刃：消滅一個手下，把它的攻擊力和生命值加到你的克蘇恩
  OG_282: {
    target: { filter: { type: 'minion', side: 'any' }, optional: true },
    abilities: play({ e: 'custom', fn: 'bladeOfCthun' }),
  },
  // 厄運召喚者：克蘇恩 +2/+2，若它已死亡則洗入牌堆
  OG_255: {
    abilities: play({ e: 'cthunBuff', atk: 2, hp: 2 }, { e: 'custom', fn: 'cthunRevive' }),
  },
  // 雙子帝王維克洛爾：克蘇恩至少 10 攻擊力時，召喚維克尼拉斯
  OG_131: {
    keywords: ['TAUNT'],
    abilities: [{ on: { k: 'play' }, cond: { c: 'cthunAttack', n: 10 }, effects: [{ e: 'summon', card: 'OG_319', count: 1, who: 'self' }] }],
    tokens: ['OG_319'],
  },
  // 克蘇恩眼柄：克蘇恩獲得攻擊力或生命值時，它也會獲得（由引擎處理）
  WON_144: { keywords: ['TAUNT', 'LIFESTEAL'] },

  // ------------------------------------------------------------------ 回音
  // 葛林達‧鴉羽：你手牌中的手下具有回音
  GIL_618: { auras: [{ scope: 'friendlyHand', keywords: ['ECHO'] }] },
  // 不穩定的進化：把一個友方手下變成隨機一個費用多 (1) 的手下
  LOOT_504: {
    keywords: ['ECHO'],
    target: friendlyMinion,
    abilities: play({ e: 'evolve', target: { t: 'chosen' }, amount: 1 }),
  },
};
