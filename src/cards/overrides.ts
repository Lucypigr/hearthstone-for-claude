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

  // ------------------------------------------------------------------ 星艦
  // 星艦本體：數值與效果由組件組成（見 src/cards/starship.ts）
  GDB_100t2: {},
  GDB_100t4: {},
  GDB_100t5: {},
  GDB_100t6: {},
  GDB_100t7: {},
  GDB_100t8: {},
  GDB_100t9: {},
  SC_999t: {},
  // 星艦結構圖：發現一張其他職業的星艦組件，其消耗減少 (1)
  GDB_102: {
    abilities: play({ e: 'discover', pool: { type: 'MINION', starshipPiece: true, otherClass: true } }, { e: 'costMod', amount: -1, scope: 'it' }),
  },
  // 薩塔隱蔽力場：法術免疫；你每回合的第一張法術消耗減少 (1)
  GDB_103: { keywords: ['ELUSIVE'], auras: [{ scope: 'firstSpellDiscount', cost: 1 }] },
  // 魔焰推進器：法術迸發：對 2 個隨機敵方手下造成等同此手下攻擊力的傷害
  GDB_104: {
    abilities: [
      {
        on: { k: 'spellCast', side: 'friendly' },
        once: true,
        effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 2 }, amount: { dyn: 'selfAttack' } }],
      },
    ],
  },
  // 船首刻像：法術迸發：觸發一個隨機友方手下的亡語
  GDB_106: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, once: true, effects: [{ e: 'custom', fn: 'triggerRandomDeathrattle' }] }] },
  // 樣本鉗爪：在你的對手打出一個手下後，攻擊它
  GDB_107: { abilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [{ e: 'custom', fn: 'attackIt' }] }] },
  // 星光反應爐：在你施放一個秘法法術後，再施放一次（目標隨機）
  GDB_108: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'ARCANE' }, effects: [{ e: 'custom', fn: 'recastIt' }] }] },
  // 縛魂尖塔：亡語：召喚一個消耗等同此手下攻擊力的隨機手下（最多 10）
  GDB_112: { abilities: [{ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'summonCostEqualAttack' }] }] },
  // 艾克索達：戰吼：若你正在建造星艦，發射它並選擇一個協定
  GDB_120: {
    abilities: play({ e: 'cond', cond: { c: 'buildingStarship' }, then: [{ e: 'custom', fn: 'exodar' }] }),
    tokens: ['GDB_100a', 'GDB_100b', 'GDB_100c'],
  },
  GDB_100a: {},
  GDB_100b: {},
  GDB_100c: {},
  // 不祥之兆：2 回合後召喚兩個 6/6 嘲諷惡魔；若你正在建造星艦，立刻召喚
  GDB_124: {
    abilities: play({
      e: 'cond',
      cond: { c: 'buildingStarship' },
      then: [{ e: 'summon', card: 'GDB_124t2', count: 2, who: 'self' }],
      else: [{ e: 'delayed', turns: 2, effects: [{ e: 'summon', card: 'GDB_124t2', count: 2, who: 'self' }] }],
    }),
    tokens: ['GDB_124t2'],
  },
  // 星際狐狸人：戰吼：摧毀一艘敵方星艦或星艦組件
  GDB_340: {
    keywords: ['TRADEABLE'],
    target: { filter: { type: 'minion', side: 'enemy', starship: true }, optional: true },
    abilities: play({ e: 'destroy', target: { t: 'chosen' } }),
  },
  // 翻滾：對一個未受傷的角色造成 5 點傷害；若你正在建造星艦，消耗為 (1)
  GDB_465: {
    target: { filter: { type: 'character', side: 'any', undamaged: true } },
    abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5, spell: true }),
    costIf: { cond: { c: 'buildingStarship' }, cost: 1 },
  },
  // 重力移轉裝置：發射時召喚一艘星艦的複製
  GDB_466: { abilities: [{ on: { k: 'launch' }, effects: [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }] }] },
  // 曲速引擎：抽 2 張牌；若你正在建造星艦，它們的消耗減少 (2)
  GDB_474: { abilities: play({ e: 'custom', fn: 'warpDrive' }) },
  // 窒息：消滅一個手下；若你正在建造星艦，也消滅一個隨機的相鄰手下
  GDB_476: { target: chosenMinion, abilities: play({ e: 'custom', fn: 'suffocate' }) },
  // 雷射彈幕：對一個手下造成 3 點傷害；若你正在建造星艦，也對其相鄰手下造成傷害
  GDB_845: {
    target: chosenMinion,
    abilities: play(
      { e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true },
      { e: 'cond', cond: { c: 'buildingStarship' }, then: [{ e: 'damage', target: { t: 'adjacent', of: 'chosen' }, amount: 3, spell: true }] },
    ),
  },
  // 奧薩爾主教：戰吼：若你正在建造星艦，獲得 3 張不同的秘法法術，其消耗減少 (2)
  GDB_856: { abilities: play({ e: 'cond', cond: { c: 'buildingStarship' }, then: [{ e: 'custom', fn: 'othaar' }] }) },
  // 費心張羅的船匠：戰吼：隨機獲得一張其他職業的星艦組件
  GDB_876: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', starshipPiece: true, otherClass: true }, count: 1, who: 'self' }) },

  // ------------------------------------------------------------------ 星海爭霸：人類
  // 吉姆‧雷諾：戰吼：重新發射本場對戰中你發射過的每一艘星艦
  SC_400: {
    abilities: play({ e: 'custom', fn: 'relaunchAll' }),
    heroPower: {
      effects: [
        { e: 'summon', card: 'SC_403t', count: 1, who: 'self' },
        { e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', terran: true } }, atk: 2 },
      ],
    },
    tokens: ['SC_403t'],
  },
  // 幽靈特務：戰吼：若你正在建造星艦，摧毀對手手牌中消耗最低的卡
  SC_408: {
    keywords: ['STEALTH'],
    abilities: play({ e: 'cond', cond: { c: 'buildingStarship' }, then: [{ e: 'custom', fn: 'destroyLowestInOppHand' }] }),
  },
  // 升空：抽 2 張人類卡；召喚一個有發射效果的 2/1 星艦組件
  SC_410: {
    abilities: play(
      { e: 'draw', count: 2, who: 'self', pool: { terran: true } },
      { e: 'custom', fn: 'summonOneOf', args: { cards: ['SC_403a', 'SC_403b', 'SC_403d', 'SC_403f'] } },
    ),
    tokens: ['SC_403a', 'SC_403b', 'SC_403d', 'SC_403f'],
  },
  // 惡狼：你的其他手下 +1 攻擊力（發射過星艦後變成戰狼）
  SC_412: { auras: [{ scope: 'otherFriendly', atk: 1 }], launchTransform: 'SC_412t', tokens: ['SC_412t'] },
  SC_412t: { auras: [{ scope: 'otherFriendly', atk: 2, keywords: ['RUSH'] }] },
  // 攻城坦克：戰吼：對一個隨機敵方手下造成 10 點傷害（發射過星艦後，多餘的傷害會打到敵方英雄）
  SC_413: {
    abilities: play({ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 }, amount: 10 }),
    launchTransform: 'SC_413t',
    tokens: ['SC_413t'],
  },
  SC_413t: { abilities: play({ e: 'custom', fn: 'siegeTank' }) },
  // 雷神號：戰吼：造成 5 點傷害（發射過星艦後，每發射過一艘星艦就對隨機敵人再造成一次）
  SC_414: {
    target: { filter: { type: 'character', side: 'any' }, optional: true },
    abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5 }),
    launchTransform: 'SC_414t',
    tokens: ['SC_414t'],
  },
  SC_414t: {
    target: { filter: { type: 'character', side: 'any' }, optional: true },
    abilities: play(
      { e: 'damage', target: { t: 'chosen' }, amount: 5 },
      {
        e: 'repeat',
        times: { dyn: 'starshipsLaunched' },
        effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 5 }],
      },
    ),
  },

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
