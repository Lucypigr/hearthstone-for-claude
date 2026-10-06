// ============================================================================
// 手動覆寫：解析器看不懂、但很經典的卡牌，在這裡直接用效果 DSL 描述。
// key 是卡牌 ID（可在 hsreplay 卡牌網址或 .cache/unsupported.txt 找到）。
// 修改後請執行 `npm run cards` 重新產生資料（覆寫的卡才會被收錄）。
// ============================================================================
import { KAZAKUS_TOKENS } from './kazakus';
import { CATACLYSM_OVERRIDES } from './cataclysm';
import { CORE_OVERRIDES } from './core';
import { EMERALD_OVERRIDES } from './emerald';
import { UNGORO_OVERRIDES } from './ungoro';
import { LOCATION_OVERRIDES } from './locations';
import { TIMEWAYS_OVERRIDES } from './timeways';
import { VIOLET_OVERRIDES } from './violet';
import { ADAPTATIONS, ANIMAL_COMPANIONS, ARTIFACTS, BRANCHING_PATHS, INVOCATIONS, LACKEYS, LICH_KING_CARDS, SIAMAT_OPTIONS, SPARE_PARTS, TREASURES } from './lists';
import type { Ability, CardDef, Condition, Effect, HeroPowerSpec, Keyword, Race, SecretEvent, TargetReq } from '../engine/types';

export type Override = Partial<Omit<CardDef, 'id' | 'dbfId' | 'name' | 'nameEn' | 'text' | 'heroPower'>> & {
  /** 英雄卡的新英雄能力（名稱、敘述、費用會自動從卡牌資料帶入） */
  heroPower?: HeroPowerSpec;
  /** 覆寫中引用的衍生卡，需一起收錄 */
  tokens?: string[];
  /** 這張卡雖然有注入標籤，但沒有（或不需要自動產生）注入版本 */
  noInfuse?: boolean;
};

const play = (...effects: Effect[]) => [{ on: { k: 'play' as const }, effects }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };

const HORSEMEN = ['ICC_829t2', 'ICC_829t3', 'ICC_829t4', 'ICC_829t5'];
const DREAM_CARDS = ['DREAM_01', 'DREAM_02', 'DREAM_03', 'DREAM_04', 'DREAM_05'];

const chosenMinion = { filter: { type: 'minion' as const, side: 'any' as const } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const dr = (...effects: Effect[]) => [{ on: { k: 'deathrattle' as const }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const allFriendly = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const allEnemy = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const heroAttacked = (...effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];
/** 在你的回合結束時，此手下死亡 */
const dieAtEndOfTurn: Ability = { on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'destroy', target: { t: 'self' } }] };
const PLAGUES = ['TTN_450t', 'TTN_450t2', 'TTN_450t3'];
/** 激勵：在你使用英雄能力後 */
const inspire = (...effects: Effect[]): Ability[] => [{ on: { k: 'heroPower', side: 'friendly' }, effects }];
/** 戰吼：若條件成立，執行效果 */
const playIf = (cond: Condition, ...effects: Effect[]) => play({ e: 'cond', cond, then: effects });
const selfBuff = (atk: number, hp: number, keywords?: Keyword[]): Effect => ({ e: 'buff', target: { t: 'self' }, atk, hp, keywords });
const secretOn = (ev: SecretEvent, ...effects: Effect[]): Override => ({ secret: true, abilities: [{ on: { k: 'secret', ev }, effects }] });
/** 此手下攻擊後，若符合條件（攻擊英雄 / 攻擊手下 / 消滅手下 / 存活）就執行效果 */
const afterAttack = (when: { hero?: boolean; minion?: boolean; killed?: boolean; survive?: boolean }, ...then: Effect[]): Ability[] => [
  { on: { k: 'attack', subject: 'self', after: true }, effects: [fn('ifAttack', { ...when, then })] },
];
const randomFriendly = (race: Race) => ({ t: 'random' as const, filter: { type: 'minion' as const, side: 'friendly' as const, race }, count: 1 });
const optional = (filter: TargetReq['filter'], when?: Condition): TargetReq => ({ filter, optional: true, when });
const summon = (card: string, count = 1, who: 'self' | 'opponent' = 'self'): Effect => ({ e: 'summon', card, count, who });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const atStartOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnStart', whose: 'mine' }, effects }];
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const randomEnemyMinion = { t: 'random' as const, filter: { type: 'minion' as const, side: 'enemy' as const }, count: 1 };
const friendlyOther: TargetReq = { filter: { type: 'minion', side: 'friendly', excludeSelf: true }, optional: true };
/** 演化（adapt）：target = self / chosen / friendly */
const adapt = (args: Record<string, unknown> = {}): Effect => fn('adapt', args);
/** 潛行 1 回合（靈魂系列） */
const stealthOneTurn: Effect = { e: 'buff', target: { t: 'self' }, keywords: ['STEALTH'], untilNextTurn: true };
/** 在手牌中時，每個你的回合開始時換成另一個版本（例如暮色港獵人） */
const swapEachTurn = (into: string, rest: Override = {}): Override => ({ ...rest, handShift: { kind: 'swap', into } });

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
  // 伊瑟拉：回合結束時隨機獲得兩張夢境卡（伊瑟拉之覺醒、歡笑的姊妹、翡翠飛龍、夢境、夢魘）
  EX1_572: {
    abilities: [
      {
        on: { k: 'turnEnd', whose: 'mine' },
        effects: [
          { e: 'custom', fn: 'addOneOf', args: { cards: DREAM_CARDS } },
          { e: 'custom', fn: 'addOneOf', args: { cards: DREAM_CARDS } },
        ],
      },
    ],
    tokens: DREAM_CARDS,
  },
  // 伊瑟拉之覺醒：對伊瑟拉以外的所有角色造成 5 點傷害
  DREAM_02: { abilities: play({ e: 'custom', fn: 'yseraAwakens', args: { amount: 5 } }) },
  // 夢魘：賦予一個手下 +5/+5，在你的下個回合開始時消滅它
  DREAM_05: { target: chosenMinion, abilities: play({ e: 'custom', fn: 'nightmare' }) },
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

  // ------------------------------------------------------------------ 死亡騎士：屍體
  // 屍爆術：引爆一具屍體對所有手下造成 1 點傷害，若還有手下存活就重複
  RLK_035: { abilities: play({ e: 'custom', fn: 'corpseExplosion' }) },
  // 滿手屍體：對一個手下造成等同你屍體數的傷害
  WW_354: { target: chosenMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'corpses' }, spell: true }) },
  // 骨髓操控者：戰吼：消耗最多 5 具屍體，每具對一個隨機敵人造成 2 點傷害
  RLK_505: {
    abilities: play({
      e: 'spendCorpsesUpTo',
      max: 5,
      each: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 }],
    }),
  },
  // 麥奈希爾之力：戰吼：消耗最多 3 具屍體，冰凍等量的敵方手下
  RLK_740: {
    abilities: play({ e: 'spendCorpsesUpTo', max: 3, each: [{ e: 'freeze', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 } }] }),
  },
  // 屍體農場：消耗最多 8 具屍體，召喚一個消耗等同數量的隨機手下
  WW_374: { abilities: play({ e: 'spendCorpsesUpTo', max: 8, custom: 'corpseFarm' }) },
  // 屍體新娘：戰吼：消耗最多 10 具屍體，召喚一個攻擊力與生命值等同數量的嘲諷新郎
  RLK_504: { abilities: play({ e: 'spendCorpsesUpTo', max: 10, custom: 'corpseBride' }), tokens: ['RLK_506t'] },
  // 除霜：抽一張牌；消耗 2 具屍體再抽一張
  RLK_101: { abilities: play({ e: 'draw', count: 1, who: 'self' }, { e: 'spendCorpses', amount: 2, then: [{ e: 'draw', count: 1, who: 'self' }] }) },
  // 墳墓之力：你的手下 +1 攻擊力；消耗 5 具屍體改為 +3 攻擊力
  RLK_707: {
    abilities: play({
      e: 'spendCorpses',
      amount: 5,
      then: [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 3 }],
      else: [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 1 }],
    }),
  },
  // 鮮血汲取：你手牌中的所有手下 +1/+1；消耗 2 具屍體再 +1/+1
  RLK_712: {
    abilities: play(
      { e: 'handBuff', atk: 1, hp: 1, scope: 'all' },
      { e: 'spendCorpses', amount: 2, then: [{ e: 'handBuff', atk: 1, hp: 1, scope: 'all' }] },
    ),
  },
  // 墮落新兵：戰吼：消耗 2 具屍體，你手牌中的所有手下 +2 攻擊力
  RLK_731: { abilities: play({ e: 'spendCorpses', amount: 2, then: [{ e: 'handBuff', atk: 2, hp: 0, scope: 'all' }] }) },
  // 骨煞領主馬洛加：戰吼：喚起所有屍體成為 1/1 衝刺魔像；放不下的，每具給其中一個 +2/+2
  RLK_085: { abilities: play({ e: 'spendCorpsesUpTo', max: 99, custom: 'marrowgar' }), tokens: ['RLK_085t'] },

  // ------------------------------------------------------------------ 死亡騎士（第二批）
  // 狼吞虎嚥：召喚五個 5/4 飛龍；消耗 8 具屍體讓它們獲得突襲
  CATA_465: { abilities: play(fn('chowDown')), tokens: ['CATA_465t'] },
  // 病態蟲群：二選一——召喚兩隻 1/1 螞蟻；或消耗 2 具屍體對一個手下造成 4 點傷害
  EDR_813: {
    chooseOne: [
      { id: 'EDR_813a', name: '腐敗蟻群', text: '召喚兩個1/1螞蟻', abilities: play({ e: 'summon', card: 'EDR_813at', count: 2, who: 'self' }) },
      {
        id: 'EDR_813b',
        name: '蟲咬',
        text: '消耗2個<b>屍體</b>對一個手下造成$4點傷害',
        abilities: play({ e: 'spendCorpses', amount: 2, then: [hit(4)] }),
        target: chosenMinion,
      },
    ],
    tokens: ['EDR_813at'],
  },
  // 吞噬：對兩個隨機敵方手下造成 3 點傷害，每死一個抽一張牌
  CORE_CATA_007: { abilities: play(fn('consumption')) },
  // 竊魂者：消滅其他所有手下，每消滅一個敵方手下獲得 1 具屍體
  CORE_RLK_741: { abilities: play(fn('soulstealer')) },
  // 窒息術：消滅攻擊力最高的敵方手下
  CORE_RLK_087: { abilities: play(fn('destroyHighestAttack')) },
  // 天譴軍團：用隨機不死族填滿你的場面
  CORE_RLK_122: { abilities: play(fn('fillBoardRandom', { race: 'UNDEAD' })) },
  // 亞歷山卓斯‧莫格萊尼：本場對戰剩下的時間，你的回合結束時對對手造成 3 點傷害
  CORE_RLK_706: {
    abilities: play({ e: 'eternal', ability: { on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 3 }] } }),
  },
  // 血族之裔：英雄 +5 生命值；消耗 3 具屍體再 +5 並抽一張牌
  CORE_RLK_051: {
    abilities: play({ e: 'heroMaxHealth', amount: 5 }, { e: 'spendCorpses', amount: 3, then: [{ e: 'heroMaxHealth', amount: 5 }, { e: 'draw', count: 1, who: 'self' }] }),
  },
  // 破魂者：英雄攻擊並消滅一個手下後，獲得 2 具屍體
  CORE_RLK_012: { abilities: heroAttacked(fn('afterHeroKill', { corpses: 2 })) },
  // 霜之哀傷：亡語：召喚所有被這把武器消滅的手下
  CORE_RLK_086: { abilities: dr(fn('frostmourne')) },
  // 死靈禮儀師：若友方不死族在你上回合結束後死亡，發現一張穢邪符文牌
  CORE_RLK_116: { abilities: play({ e: 'cond', cond: { c: 'undeadDiedSinceLastTurn' }, then: [{ e: 'discover', pool: { rune: 'unholy' } }] }) },
  // 魂眠儀式：你的手下 +1 攻擊力與突襲，在你的回合結束時死亡
  DINO_417: { abilities: play({ e: 'buff', target: allFriendly, atk: 1, keywords: ['RUSH'], abilities: [dieAtEndOfTurn] }) },
  // 作物輪替：召喚四個有突襲、回合結束時死亡的 1/1 不死族
  WW_368: { abilities: play({ e: 'summon', card: 'WW_368t', count: 4, who: 'self' }), tokens: ['WW_368t'] },
  // 採礦受害者：召喚兩個有「亡語：召喚一個 1/1 脆弱食屍鬼」的白銀之手新兵
  DEEP_017: {
    abilities: play({
      e: 'repeat',
      times: 2,
      effects: [
        { e: 'summon', card: 'CS2_101t', count: 1, who: 'self' },
        { e: 'buff', target: { t: 'it' }, abilities: dr({ e: 'summon', card: 'HERO_11bpt', count: 1, who: 'self' }) },
      ],
    }),
  },
  // 凝霜雕刻者：召喚兩個 2/1 霜凍元素（亡語：對一個隨機敵人造成 2 點傷害）
  LEG_RLK_752: { abilities: play({ e: 'summon', card: 'RLK_907t', count: 2, who: 'self' }), tokens: ['RLK_907t'] },
  // 飲血：生命竊取，對一個手下造成 3 點傷害，英雄能力可再使用
  JAIL_441: { keywords: ['LIFESTEAL'], target: chosenMinion, abilities: play(hit(3), { e: 'refreshHeroPower' }) },
  // 骸骨亂舞：隨機分配 3 點傷害給敵人；若本回合有友方手下死亡，再 3 點
  JAIL_445: {
    abilities: play(
      { e: 'splitDamage', filter: { side: 'enemy', type: 'character' }, amount: 3, spell: true },
      { e: 'cond', cond: { c: 'friendlyDiedThisTurn' }, then: [{ e: 'splitDamage', filter: { side: 'enemy', type: 'character' }, amount: 3, spell: true }] },
    ),
  },
  // 緊急手術：召喚四個 3/1 生命竊取的不死族，攻擊所選的敵方手下
  JAIL_454: { target: enemyMinion, abilities: play(fn('emergencySurgery')), tokens: ['JAIL_454t'] },
  // 食屍鬼疊羅漢：此手下受到傷害後，召喚兩個 1/1 脆弱食屍鬼
  JAIL_440: { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'summon', card: 'HERO_11bpt', count: 2, who: 'self' }] }] },
  // 嚎叫約德爾歌手：觸發一個友方手下的亡語兩次
  JAM_005: { target: { filter: { type: 'minion', side: 'friendly' }, optional: true }, abilities: play(fn('triggerDeathrattle', { times: 2 })) },
  // 腳感冰冷：敵方手下在下回合消耗增加 (5)
  JAM_006: { abilities: play({ e: 'minionTax', amount: 5 }) },
  // 焦油浪潮：對全部敵方手下造成 2 點傷害，敵方手下在下回合消耗增加 (2)
  TLC_439: { abilities: play({ e: 'damage', target: allEnemy, amount: 2, spell: true }, { e: 'minionTax', amount: 2 }) },
  // 死亡斷訊：消滅你的不死族，再重新召喚它們
  JAM_008: { abilities: play(fn('deadAir')) },
  // 縫補者：消滅對手手牌、牌堆與戰場上各一個隨機手下
  LEG_RLK_071: { abilities: play(fn('patchwerk')) },
  // 劇毒死屍：對一個敵人與你的英雄各造成 2 點傷害
  LEG_RLK_079: {
    target: { filter: { type: 'character', side: 'enemy' }, optional: true },
    abilities: play(hit(2, false), { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 }),
  },
  // 死亡使者薩魯法爾：嘲諷；亡語：回到你的手牌，改為消耗生命值
  LEG_RLK_082: { keywords: ['TAUNT'], abilities: dr(fn('returnCostsHealth')) },
  // 噁心巨怪：敵方角色無法被治療
  LEG_RLK_115: { flags: ['enemyNoHeal'] },
  // 監督者弗力吉達拉：抽兩張法術；若都是冰霜法術，對全部敵人造成 2 點傷害
  LEG_RLK_224: { abilities: play(fn('frigidara')) },
  // 霜牙之劍：英雄攻擊後，手中一張法術消耗減少 (1)
  LEG_RLK_710: { abilities: heroAttacked(fn('discountRandomSpell', { amount: 1 })) },
  // 屈辱之盔：一個手下 -5/-5，手中一個隨機手下 +5/+5
  MIS_100: { target: chosenMinion, abilities: play(fn('debuff', { atk: 5, hp: 5 }), { e: 'handBuff', atk: 5, hp: 5, scope: 'random' }) },
  // 泡棉裂斧：英雄攻擊時，消耗 3 具屍體獲得 +1 耐久度
  MIS_101: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero' }, effects: [{ e: 'spendCorpses', amount: 3, then: [{ e: 'weaponBuff', dur: 1 }] }] }] },
  // 黑暗變身：把一個不死族變成 4/5 突襲的不死畸怪
  RLK_057: {
    target: { filter: { type: 'minion', side: 'any', race: 'UNDEAD' } },
    abilities: play({ e: 'transform', target: { t: 'chosen' }, card: 'RLK_057t' }),
    tokens: ['RLK_057t'],
  },
  // 依米亞破霜者：手中每有一張冰霜法術 +1 攻擊力
  RLK_110: { abilities: play(fn('attackPerSpellSchool', { school: 'FROST' })) },
  // 絞肉機：絞碎牌堆中一個隨機手下，獲得 4 具屍體
  RLK_120: { abilities: play(fn('meatGrinder')) },
  // 疫牙：感染全部敵方手下，它們死亡時你召喚一個 2/2 嘲諷殭屍
  RLK_225: {
    abilities: play({ e: 'buff', target: allEnemy, abilities: dr({ e: 'summon', card: 'RLK_118t3', count: 1, who: 'opponent' }) }),
    tokens: ['RLK_118t3'],
  },
  // 沸血術：生命竊取；感染全部敵方手下，你的回合結束時它們受到 2 點傷害
  RLK_730: {
    keywords: ['LIFESTEAL'],
    abilities: play({ e: 'buff', target: allEnemy, abilities: [{ on: { k: 'turnEnd', whose: 'opp' }, effects: [fn('plagueTick', { amount: 2 })] }] }),
  },
  // 冰川突進：造成 4 點傷害，你本回合的下一張法術消耗減少 (2)
  RLK_512: { target: anyChar, abilities: play(hit(4), { e: 'nextSpellDiscount', amount: 2 }) },
  // 碎骨者：英雄攻擊手下後，對敵方英雄造成 2 點傷害
  RLK_516: { abilities: heroAttacked(fn('afterHeroHitMinion', { amount: 2 })) },
  // 惡毒血蟲：手牌中一個手下獲得等同此手下的攻擊力
  RLK_711: { abilities: play(fn('giveAttackEqualSelf')) },
  // 恐怖夢魘：手牌或戰場上一個手下獲得等同此手下的攻擊力
  CATA_161: { abilities: play(fn('giveAttackEqualSelf', { board: true })) },
  // 亡語女士：亡語：複製你手中所有的冰霜法術
  RLK_713: { abilities: dr(fn('copySpellSchoolInHand', { school: 'FROST' })) },
  // 地精嚼食者：嘲諷、生命竊取；在你的回合結束時，攻擊生命值最低的敵人
  RLK_720: { keywords: ['TAUNT', 'LIFESTEAL'], abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('attackLowestEnemy')] }] },
  // 穢邪狂亂：你的手下攻擊所選的敵方手下，死掉的再召喚回來
  RLK_056: { target: enemyMinion, abilities: play(fn('unholyFrenzy')) },
  // 血液導引：消耗生命值；發現一張法術
  TIME_612: { costsHealth: true, abilities: play({ e: 'discover', pool: { type: 'SPELL' } }) },
  // 生命撕裂者：若你的英雄本回合生命值有變化，對一個敵方手下造成 6 點傷害
  TIME_614: {
    target: { filter: { type: 'minion', side: 'enemy' }, optional: true, when: { c: 'heroHealthChanged' } },
    abilities: play({ e: 'cond', cond: { c: 'heroHealthChanged' }, then: [hit(6, false)] }),
  },
  // 被遺忘的千年：用隨機不死族填滿手牌，本回合改為消耗生命值
  TIME_615: { abilities: play(fn('fillHandHealthCost')) },
  // 回憶顯化：召喚本場對戰中死亡、消耗最高的友方不死族
  TIME_616: { abilities: play(fn('summonBestFromGraveyard')) },
  // 時光凍結者：你的回合開始時不再抽牌
  TIME_617: { flags: ['noTurnDraw'] },
  // 古生物死靈術：發現一個不死族；消耗 5 具屍體改為三張都拿
  TLC_434: { abilities: play(fn('paleomancy')) },
  // 復甦翼手龍：突襲、生命竊取；消耗屍體而不是法力
  TLC_436: { keywords: ['RUSH', 'LIFESTEAL'], costsCorpses: true },
  // 瑪拉達爾主教：你本回合打出的下一張牌改為消耗屍體
  GDB_470: { abilities: play({ e: 'nextCardCostsCorpses' }) },
  // 喧鬧的填充玩偶：突襲；你施放冰霜法術後獲得復生
  TOY_821: {
    keywords: ['RUSH'],
    abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FROST' }, effects: [{ e: 'buff', target: { t: 'self' }, keywords: ['REBORN'] }] }],
  },
  // 黑棘針縫師：在你的回合結束時，把等同此手下攻擊力的傷害隨機分配給敵人
  TOY_824: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'splitDamage', filter: { side: 'enemy', type: 'character' }, amount: { dyn: 'selfAttack' } }] }] },
  // 絕望絲線：賦予全部手下「亡語：對全部手下造成 1 點傷害」
  TOY_826: {
    abilities: play({
      e: 'buff',
      target: { t: 'all', filter: { type: 'minion', side: 'any' } },
      abilities: dr({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 1 }),
    }),
  },
  // 霜凍掠劫者：亡語：冰凍 3 個隨機敵人，已被冰凍的改為受到 5 點傷害
  VAC_402: { abilities: dr(fn('freezeOrShatter')) },
  // 伊莉莎‧凝血刃：亡語：本場對戰剩下的時間，你的手下 +1 攻擊力
  VAC_426: { abilities: dr({ e: 'minionAtkBonus', amount: 1 }) },
  // 屍淇淋：造成 3 點傷害；消耗 3 具屍體讓它在回合結束時回到你的手牌
  VAC_427: { target: anyChar, abilities: play(hit(3), { e: 'spendCorpses', amount: 3, then: [fn('returnAtEndOfTurn')] }) },
  // 滑雪高手：若有角色被冰凍，消耗 (1)
  VAC_429: { costIf: { cond: { c: 'anyFrozen' }, cost: 1 } },
  // 脆骨海賊：每當你打出有亡語的手下，使其獲得復生
  VAC_436: {
    abilities: [
      { on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasDeathrattle' }, effects: [{ e: 'buff', target: { t: 'it' }, keywords: ['REBORN'] }] },
    ],
  },
  // 食屍鬼之夜：召喚五個 1/1 食屍鬼，各自攻擊隨機敵人
  VAC_445: { abilities: play(fn('summonAndAttackRandom', { card: 'VAC_445t', count: 5 })), tokens: ['VAC_445t'] },
  // 滑溜坡道：冰凍一個角色，每有一個被冰凍的角色抽一張牌
  VAC_513: { target: anyChar, abilities: play({ e: 'freeze', target: { t: 'chosen' } }, { e: 'draw', count: { dyn: 'frozenChars' }, who: 'self' }) },
  // 靈魂搜尋：從你的牌堆發現一張卡；消耗 5 具屍體再複製一張
  WORK_070: { abilities: play(fn('discoverFromDeck', { copyCorpses: 5 })) },
  // 北境導覽：從你的牌堆發現一張法術；若是冰霜法術，冰凍一個隨機敵方手下
  TTN_735: { abilities: play(fn('discoverFromDeck', { type: 'SPELL', frostFreeze: true })) },
  // 礦坑老大雷斯卡：突襲；本場對戰每死亡一個手下消耗減少 (1)；亡語：奪取一個隨機敵方手下
  WW_373: {
    keywords: ['RUSH'],
    costRule: { per: 'deathsThisGame', amount: 1 },
    abilities: dr({ e: 'steal', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 } }),
  },
  // 死亡咆哮：把一個手下的亡語擴散到相鄰的手下
  ETC_424: { target: chosenMinion, abilities: play(fn('spreadDeathrattle')) },
  // 骸骨速彈手：消耗 5 具屍體，觸發並獲得一個本場死亡的友方手下的亡語
  ETC_428: { abilities: play(fn('boneshredder')) },
  // 炫彩育母：突襲；此手下攻擊時，回復等同其攻擊力的法力水晶
  CATA_469: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('refreshManaByAttack')] }] },
  // 塔蘭姬的最後一搏：賦予你的手下「亡語：召喚一個隨機 4 費手下」
  CATA_471: { abilities: play({ e: 'buff', target: allFriendly, abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', cost: 4 }, count: 1, who: 'self' }) }) },
  // 厄索克：戰吼：攻擊其他所有手下；亡語：復活它消滅的手下
  EDR_819: { abilities: [...play(fn('ursoc')), ...dr(fn('resurrectKilled'))] },
  // 氣閘破口：召喚 5/5 嘲諷不死族，英雄 +5 生命值；消耗 5 具屍體再來一次
  GDB_113: { abilities: play(fn('airlockBreach')), tokens: ['GDB_113t'] },
  // 靈魂喚醒者：嘲諷、復生；亡語：復活另一個友方亡語手下
  GDB_468: { keywords: ['TAUNT', 'REBORN'], abilities: dr(fn('resurrectDeathrattle')) },
  // 來自異界的8隻手：雙方的牌堆只留下消耗最高的 8 張
  GDB_477: { abilities: play(fn('eightHands')) },
  // 同化疫病：發現一個 3 費亡語手下，召喚它並賦予復生
  GDB_478: { abilities: play(fn('discoverSummon', { cost: 3, reborn: true })) },
  // 昂布拉的故事：發現一個 5 費以上的亡語手下，召喚它並觸發其亡語
  DINO_415: { abilities: play(fn('discoverSummon', { minCost: 5, trigger: true })) },
  // 法勒瑞克：你獲得的屍體加倍；戰吼：抽一張會消耗屍體的卡
  CORE_EDR_003: { flags: ['doubleCorpses'], abilities: play({ e: 'draw', count: 1, who: 'self', pool: { spendsCorpses: true } }) },
  // 死亡金屬騎士：嘲諷；若你的英雄本回合被治療過，改為消耗生命值
  CORE_ETC_523: { keywords: ['TAUNT'], costsHealthIf: { c: 'heroHealed' } },
  // 阿薩斯的禮物：發現一張暫時的黑暗變身、凜風衝擊或死亡打擊
  CORE_GIFT_04: { abilities: play(fn('giftOf', { cards: ['RLK_057', 'RLK_015', 'RLK_024'] })) },
  // 石英粉碎錘：生命竊取；冰凍被你的英雄傷害的角色
  DEEP_016: { keywords: ['LIFESTEAL', 'FREEZE_ON_DAMAGE'] },
  // 尖嘯女妖：生命竊取；你的英雄獲得生命值後，召喚一個屬性等同回復量的靈魂
  ETC_522: {
    keywords: ['LIFESTEAL'],
    abilities: [{ on: { k: 'healed', subject: 'friendly' }, cond: { c: 'not', cond: { c: 'itIsMinion' } }, effects: [fn('summonSoulFromEvent', { card: 'ETC_522t' })] }],
    tokens: ['ETC_522t'],
  },
  // 染疫的穀物：獲得 4 具屍體；把四個穀物箱洗入你的牌堆（抽到時召喚 2/2 不死的農民）
  LEG_RLK_039: { abilities: play({ e: 'gainCorpses', amount: 4 }, { e: 'shuffle', card: 'RLK_039t', count: 4 }), tokens: ['RLK_039t'] },
  RLK_039t: { abilities: play({ e: 'summon', card: 'RLK_070t', count: 1, who: 'self' }), tokens: ['RLK_070t'] },
  // 三種瘟疫（抽到時施放）
  TTN_450t: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 }, { e: 'heal', target: { t: 'hero', side: 'enemy' }, amount: 2 }) },
  TTN_450t2: {
    abilities: play({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 }, { e: 'summon', card: 'RLK_070t', count: 1, who: 'opponent' }),
    tokens: ['RLK_070t'],
  },
  TTN_450t3: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 }, { e: 'nextCardDiscount', amount: -1 }) },
  // 憂慮的科瓦迪爾：亡語：把兩張隨機瘟疫洗入對手的牌堆
  TTN_450: { abilities: dr(fn('shufflePlagues', { count: 2 })), tokens: PLAGUES },
  // 隨船沉沒：造成 3 點傷害，把兩張隨機瘟疫洗入對手的牌堆
  TTN_454: { target: anyChar, abilities: play(hit(3), fn('shufflePlagues', { count: 2 })), tokens: PLAGUES },
  // 叛墓者：消滅對手牌堆中的一張瘟疫，對全部敵方手下造成 3 點傷害
  TTN_455: { abilities: play(fn('destroyPlague')), tokens: PLAGUES },
  // 統御者之杖：英雄攻擊後，把一張隨機瘟疫洗入對手的牌堆
  TTN_736: { abilities: heroAttacked(fn('shufflePlagues', { count: 1 })), tokens: PLAGUES },
  // 縛練守護者：突襲、復生；本場每洗一張瘟疫到對手牌堆，消耗減少 (1)
  TTN_459: { keywords: ['RUSH', 'REBORN'], costRule: { per: 'plaguesShuffled', amount: 1 }, tokens: PLAGUES },
  // 弗柯羅斯：突襲、嘲諷；戰吼：花費 10、20 或 30 具屍體獲得等量的屬性值
  FIR_951: { keywords: ['RUSH', 'TAUNT'], abilities: play(fn('spendCorpsesForStats')) },

  // ------------------------------------------------------------------ 比武（雙方各揭露牌堆一張手下，你的消耗較高就獲勝）
  // 治療波：恢復 8 點生命值；比武獲勝則改為恢復 16 點
  AT_048: {
    target: anyChar,
    abilities: play({ e: 'joust', then: [{ e: 'heal', target: { t: 'chosen' }, amount: 16 }], else: [{ e: 'heal', target: { t: 'chosen' }, amount: 8 }] }),
  },
  // 國王的伊萊克：比武獲勝則抽出那張牌
  AT_058: { abilities: play({ e: 'joust', then: [{ e: 'custom', fn: 'drawRevealed' }] }) },
  // 銀白長槍：比武獲勝則 +1 耐久度
  AT_077: { abilities: play({ e: 'joust', then: [{ e: 'weaponBuff', dur: 1 }] }) },
  // 巨牙矛騎兵：比武獲勝則為你的英雄恢復 7 點生命值
  AT_104: { abilities: play({ e: 'joust', then: [{ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 7 }] }) },
  // 裝甲戰馬：比武獲勝則獲得衝鋒
  AT_108: { abilities: play({ e: 'joust', then: [{ e: 'buff', target: { t: 'self' }, keywords: ['CHARGE'] }] }) },
  // 至尊矛騎兵：比武獲勝則獲得嘲諷與聖盾
  AT_112: { abilities: play({ e: 'joust', then: [{ e: 'buff', target: { t: 'self' }, keywords: ['TAUNT', 'DIVINE_SHIELD'] }] }) },
  // 骷髏騎士：亡語：比武獲勝則回到你的手牌
  AT_128: { abilities: [{ on: { k: 'deathrattle' }, effects: [{ e: 'joust', then: [{ e: 'addCard', card: 'AT_128', count: 1, who: 'self' }] }] }] },
  // 加基森矛騎兵：比武獲勝則獲得 +1/+1
  AT_133: { abilities: play({ e: 'joust', then: [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 1 }] }) },

  // ------------------------------------------------------------------ 翠玉魔像 / 號召 / 滅殺
  // 翠玉塑像：二選一：召喚一個翠玉魔像；或把 3 張翠玉塑像洗入你的牌堆
  CFM_602: {
    chooseOne: [
      { id: 'CFM_602a', name: '翠玉塑像', text: '召喚一個<b>翠玉魔像</b>', abilities: play({ e: 'summonJade' }) },
      { id: 'CFM_602b', name: '翠玉塑像', text: '將3張翠玉塑像洗入你的牌堆', abilities: play({ e: 'shuffle', card: 'CFM_602', count: 3 }) },
    ],
    tokens: ['CFM_712_t01'],
  },
  // 翠玉通訊：看對手手牌中的 3 張牌，把其中一張洗進他的牌堆；召喚一個翠玉魔像
  WON_078: { abilities: play({ e: 'custom', fn: 'jadeTelegram' }, { e: 'summonJade' }), tokens: ['CFM_712_t01'] },
  // 橡心大師：戰吼：號召攻擊力 1、2、3 的手下各一個
  LOOT_521: { abilities: play({ e: 'custom', fn: 'oakheart' }) },
  // 蘇薩斯：滅殺：你可以再攻擊一次
  TRL_325: { abilities: [{ on: { k: 'overkill' }, effects: [{ e: 'custom', fn: 'attackAgain' }] }] },
  // 烏達斯塔：突襲；滅殺：從你的手牌召喚一個野獸
  TRL_542: { keywords: ['RUSH'], abilities: [{ on: { k: 'overkill' }, effects: [{ e: 'custom', fn: 'summonFromHand', args: { race: 'BEAST' } }] }] },
  // 競技場觀眾：滅殺：召喚另一個競技場觀眾
  TRL_521: { abilities: [{ on: { k: 'overkill' }, effects: [{ e: 'summon', card: 'TRL_521', count: 1, who: 'self' }] }] },
  // 法拉奇戰斧：滅殺：賦予你手牌中的一個手下 +2/+2
  TRL_304: { abilities: [{ on: { k: 'overkill' }, effects: [{ e: 'handBuff', atk: 2, hp: 2, scope: 'random' }] }] },
  // 整裝備戰：召喚三個白銀之手新兵，裝備一把 1/4 的武器（聖光的正義）
  GVG_061: {
    abilities: play({ e: 'summon', card: 'CS2_101t', count: 3, who: 'self' }, { e: 'equip', card: 'CS2_091' }),
    tokens: ['CS2_091'],
  },
  // 戰線擊破者：滅殺：此手下的攻擊力加倍
  TRL_528: { abilities: [{ on: { k: 'overkill' }, effects: [{ e: 'doubleStat', target: { t: 'self' }, stat: 'atk' }] }] },

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

  // ==========================================================================
  // 納克薩瑪斯
  // ==========================================================================
  // 迴音軟泥怪：在回合結束時召喚一個此手下的完全複製
  FP1_003: {
    abilities: play({
      e: 'buff',
      target: { t: 'self' },
      abilities: [{ on: { k: 'turnEnd', whose: 'each' }, once: true, effects: [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }] }],
    }),
  },
  // 瘋狂科學家：亡語：把牌堆中的一個奧秘放到戰場上
  FP1_004: { abilities: dr(fn('secretsFromDeck', { count: 1 })) },
  // 死亡領主：嘲諷；亡語：對手把他牌堆中的一個手下放到戰場上
  FP1_009: { keywords: ['TAUNT'], abilities: dr(fn('recruitFor', { who: 'opponent' })) },
  // 科爾蘇加德：在每個回合結束時，召喚本回合死亡的所有友方手下
  FP1_013: { abilities: [{ on: { k: 'turnEnd', whose: 'each' }, effects: [fn('kelThuzad')] }] },
  // 斯塔拉格 / 伏晨：亡語：若另一個也死亡過，召喚泰迪斯
  FP1_014: { abilities: dr({ e: 'cond', cond: { c: 'died', name: 'Feugen' }, then: [{ e: 'summon', card: 'FP1_014t', count: 1, who: 'self' }] }), tokens: ['FP1_014t'] },
  FP1_015: { abilities: dr({ e: 'cond', cond: { c: 'died', name: 'Stalagg' }, then: [{ e: 'summon', card: 'FP1_014t', count: 1, who: 'self' }] }), tokens: ['FP1_014t'] },
  // 奈幽巴蛛網領主：有戰吼的手下消耗增加 (2)
  FP1_017: { costAuras: [{ side: 'both', type: 'MINION', hasBattlecry: true, add: 2 }] },
  // 複製：秘密：當一個友方手下死亡時，把它的 2 張複製加入你的手牌
  FP1_018: secretOn('friendlyMinionDies', { e: 'addCopy', target: { t: 'it' }, count: 2 }),
  // 劇毒種子：消滅所有手下，並召喚 2/2 樹人取代它們
  FP1_019: { abilities: play(fn('poisonSeeds', { card: 'FP1_019t' })), tokens: ['FP1_019t'] },
  // 虛無呼喚者：亡語：從你的手牌把一個隨機惡魔放到戰場上
  FP1_022: { abilities: dr(fn('summonFromHand', { race: 'DEMON' })) },
  // 重生：消滅一個手下，再讓它以全滿的生命值復活
  FP1_025: { target: chosenMinion, abilities: play(fn('reincarnate')) },
  // 殯葬管理員：每當你召喚有亡語的手下，獲得 +1/+1
  FP1_028: { abilities: [{ on: { k: 'summon', side: 'friendly' }, cond: { c: 'itHasDeathrattle' }, effects: [selfBuff(1, 1)] }] },
  // 憎恨者：敵方法術在下個回合消耗增加 (5)
  FP1_030: { abilities: play({ e: 'spellTax', amount: 5 }) },
  // 瑞文戴爾男爵：你的手下的亡語觸發兩次
  FP1_031: { flags: ['doubleDeathrattle'] },

  // ==========================================================================
  // 黑石山
  // ==========================================================================
  // 惡魔怒火：對惡魔以外的所有手下造成 2 點傷害
  BRM_005: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', notRace: 'DEMON' } }, amount: 2, spell: true }) },
  // 黑鐵潛伏者：對所有未受傷的敵方手下造成 2 點傷害
  BRM_008: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy', undamaged: true } }, amount: 2 }) },
  // 熔岩震擊：造成 2 點傷害，解鎖被超載的法力水晶
  BRM_011: { target: anyChar, abilities: play(hit(2), fn('unlockOverload')) },
  // 火焰驅逐者：戰吼：獲得 1~4 點攻擊力；超載：(1)
  BRM_012: { overload: 1, abilities: play(fn('gainRandomAtk', { min: 1, max: 4 })) },
  // 復仇：對所有手下造成 1 點傷害；若你的生命值 12 以下，改為 3 點
  BRM_015: {
    abilities: play({
      e: 'cond',
      cond: { c: 'heroHealth', op: '<=', n: 12 },
      then: [{ e: 'damage', target: { t: 'all', filter: { type: 'minion' } }, amount: 3, spell: true }],
      else: [{ e: 'damage', target: { t: 'all', filter: { type: 'minion' } }, amount: 1, spell: true }],
    }),
  },
  // 復活：召喚本場對戰中死亡的隨機友方手下
  BRM_017: { abilities: play(fn('resurrectRandom', { count: 1 })) },
  // 龍之伴侶：戰吼：你的下一張龍消耗減少 (2)
  BRM_018: { abilities: play({ e: 'pendingDiscount', d: { race: 'DRAGON', amount: 2 } }) },
  // 恐怖的黑鐵酒客：在此手下受到傷害並存活後，召喚另一個恐怖的黑鐵酒客
  BRM_019: { abilities: [{ on: { k: 'damaged', subject: 'self' }, cond: { c: 'itAlive' }, effects: [{ e: 'summon', card: 'BRM_019', count: 1, who: 'self' }] }] },
  // 龍人巫師：每當你以法術指定此手下為目標，獲得 +1/+1
  BRM_020: { abilities: [{ on: { k: 'spellTarget' }, effects: [selfBuff(1, 1)] }] },
  // 龍獸粉碎者：戰吼：若對手的生命值 15 以下，獲得 +3/+3
  BRM_024: { abilities: playIf({ c: 'heroHealth', op: '<=', n: 15, side: 'enemy' }, selfBuff(3, 3)) },
  // 管理者埃克索圖斯：亡語：你的英雄換成『炎魔』拉格納羅斯
  BRM_027: { abilities: dr(fn('ragnaros')) },
  // 索瑞森大帝：在你的回合結束時，你手牌中的卡消耗減少 (1)
  BRM_028: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('discountHand', { amount: 1 })] }] },
  // 雷德‧黑手：戰吼：若你手中有龍，消滅一個傳說手下
  BRM_029: {
    target: optional({ type: 'minion', side: 'any', legendary: true }, { c: 'holding', race: 'DRAGON' }),
    abilities: play({ e: 'destroy', target: { t: 'chosen' } }),
  },
  // 克洛瑪古斯：每當你抽一張牌，把另一張複製加入你的手牌
  BRM_031: { abilities: [{ on: { k: 'draw', side: 'friendly' }, effects: [{ e: 'addCopy', target: { t: 'it' }, count: 1 }] }] },

  // ==========================================================================
  // 銀白聯賽
  // ==========================================================================
  // 火焰稻草人：秘密：當一個友方手下死亡時，召喚一個消耗相同的隨機手下
  AT_002: secretOn('friendlyMinionDies', fn('summonSameCost')),
  // 陣亡英雄之靈：你的英雄能力額外造成 1 點傷害
  AT_003: { flags: ['heroPowerDamage'] },
  // 秘法衝擊：對一個手下造成 2 點傷害，法術傷害加成兩倍
  AT_004: { target: chosenMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'spellDamage', base: 2 }, spell: true }) },
  // 達拉然志士：法術傷害 +1；激勵：獲得法術傷害 +1
  AT_006: { spellDamage: 1, abilities: inspire(fn('gainSpellDamage', { amount: 1 })) },
  // 魔法鏢客：戰吼：雙方各獲得一張隨機法術，你的消耗減少 (2)
  AT_007: { abilities: play(fn('spellslinger')) },
  // 凜懼島飛龍：你的英雄能力可以使用任意次數
  AT_008: { flags: ['heroPowerUnlimited'] },
  // 羅甯：亡語：把 3 張秘法飛彈加入你的手牌
  AT_009: { abilities: dr({ e: 'addCard', card: 'EX1_277', count: 3, who: 'self' }) },
  // 山羊牧人：戰吼：若你控制野獸，隨機召喚一個野獸
  AT_010: { abilities: playIf({ c: 'control', race: 'BEAST' }, { e: 'summonRandom', pool: { type: 'MINION', race: 'BEAST' }, count: 1, who: 'self' }) },
  // 神聖勇士：溢療：獲得 +2 攻擊力
  AT_011: { abilities: [{ on: { k: 'overheal' }, effects: [selfBuff(2, 0)] }] },
  // 暗影爪牙：戰吼與激勵：對雙方英雄各造成 4 點傷害
  AT_012: {
    abilities: [
      ...play({ e: 'damage', target: { t: 'hero', side: 'both' }, amount: 4 }),
      ...inspire({ e: 'damage', target: { t: 'hero', side: 'both' }, amount: 4 }),
    ],
  },
  // 真言術：耀：選擇一個手下，每當它攻擊時，為你的英雄恢復 4 點生命值
  AT_013: { target: chosenMinion, abilities: play(fn('glory', { amount: 4 })) },
  // 歸順：把一個敵方手下的複製加入你的手牌，其消耗為 (1)
  AT_015: { target: enemyMinion, abilities: play(fn('copyToHand', { cost: 1 })) },
  // 告解者帕爾璀絲：戰吼與激勵：隨機召喚一個傳說手下
  AT_018: {
    abilities: [
      ...play({ e: 'summonRandom', pool: { type: 'MINION', rarity: 'LEGENDARY' }, count: 1, who: 'self' }),
      ...inspire({ e: 'summonRandom', pool: { type: 'MINION', rarity: 'LEGENDARY' }, count: 1, who: 'self' }),
    ],
  },
  // 恐懼戰馬：亡語：在這個回合結束時，召喚一個恐懼戰馬
  AT_019: { abilities: dr({ e: 'atEndOfTurn', effects: [{ e: 'summon', card: 'AT_019', count: 1, who: 'self' }] }) },
  // 小小邪惡騎士：每當你棄掉一張牌，獲得 +2/+1
  AT_021: { abilities: [{ on: { k: 'discard', side: 'friendly' }, effects: [selfBuff(2, 1)] }] },
  // 賈拉克瑟斯之拳：當你打出或棄掉這張牌時，對一個隨機敵人造成 4 點傷害
  AT_022: {
    abilities: [
      ...play({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 4, spell: true }),
      { on: { k: 'discarded' }, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 4, spell: true }] },
    ],
  },
  // 虛無粉碎者：激勵：雙方各摧毀一個隨機手下
  AT_023: {
    abilities: inspire(
      { e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'friendly' }, count: 1 } },
      { e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 } },
    ),
  },
  // 憤怒守衛：每當此手下受到傷害，也對你的英雄造成等量的傷害
  AT_026: { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: { dyn: 'eventAmount' } }] }] },
  // 威爾弗雷德‧菲斯巴恩：你以英雄能力抽到的牌消耗為 (0)
  AT_027: { flags: ['heroPowerDrawsFree'] },
  // 海賊：每當你裝備武器時，賦予它 +1 攻擊力
  AT_029: { abilities: [{ on: { k: 'equip', side: 'friendly' }, effects: [{ e: 'weaponBuff', atk: 1 }] }] },
  // 扒手：每當此手下攻擊英雄，把一枚幸運幣加入你的手牌
  AT_031: { abilities: afterAttack({ hero: true }, { e: 'addCard', card: 'GAME_005', count: 1, who: 'self' }) },
  // 黑市商人：戰吼：若你控制海盜，獲得 +1/+1
  AT_032: { abilities: playIf({ c: 'control', race: 'PIRATE' }, selfBuff(1, 1)) },
  // 盜竊：隨機獲得 3 張（對手職業的）卡
  AT_033: { abilities: play({ e: 'addRandom', pool: { cls: 'opponent' }, count: 3, who: 'self' }) },
  // 毒刃：你的英雄能力改為賦予這把武器 +1 攻擊力，而不是換掉它
  AT_034: { flags: ['heroPowerBuffsWeapon'] },
  // 地底潛伏：把 3 張奈幽蟲伏擊！洗入對手的牌堆（抽到時為你召喚 4/4 奈幽蟲族）
  AT_035: { abilities: play({ e: 'shuffle', card: 'AT_035t', count: 3, who: 'opponent' }), tokens: ['AT_035t'] },
  AT_035t: { castsWhenDrawn: true, abilities: play({ e: 'summon', card: 'FP1_007t', count: 1, who: 'opponent' }), tokens: ['FP1_007t'] },
  // 阿努巴拉克：亡語：召喚一個有「亡語：召喚阿努巴拉克」的 4/4 奈幽蟲族
  AT_036: { abilities: dr({ e: 'summon', card: 'AT_036t', count: 1, who: 'self' }), tokens: ['AT_036t'] },
  AT_036t: { abilities: dr({ e: 'summon', card: 'AT_036', count: 1, who: 'self' }) },
  // 達納蘇斯志士：戰吼：獲得一個空的法力水晶；亡語：失去一個法力水晶
  AT_038: { abilities: [...play({ e: 'mana', kind: 'empty', amount: 1 }), ...dr({ e: 'mana', kind: 'destroy', amount: 1 })] },
  // 堆肥：消滅一個手下，把一張隨機手下加入對手的手牌
  AT_044: {
    target: chosenMinion,
    abilities: play({ e: 'destroy', target: { t: 'chosen' } }, { e: 'addRandom', pool: { type: 'MINION', anyClass: true }, count: 1, who: 'opponent' }),
  },
  // 艾維娜：你的手下消耗為 (1)
  AT_045: { costAuras: [{ side: 'friendly', type: 'MINION', set: 1 }] },
  // 德萊尼圖騰雕刻師：戰吼：每有一個友方圖騰，獲得 +1/+1
  AT_047: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'friendlyRace', race: 'TOTEM' }, hp: { dyn: 'friendlyRace', race: 'TOTEM' } }) },
  // 雷霆崖驍士：戰吼與激勵：賦予你的圖騰 +2 攻擊力
  AT_049: {
    abilities: [
      ...play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', race: 'TOTEM' } }, atk: 2 }),
      ...inspire({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', race: 'TOTEM' } }, atk: 2 }),
    ],
  },
  // 充能戰錘：亡語：你的英雄能力變成「造成 2 點傷害」
  AT_050: { abilities: dr({ e: 'replaceHeroPower', power: 'AT_050t' }) },
  // 元素毀滅：對全部手下造成 4~5 點傷害；超載：(2)
  AT_051: { overload: 2, abilities: play(fn('randomDamageAll', { min: 4, max: 5 })) },
  // 喚霧者：戰吼：賦予你手牌與牌堆中的所有手下 +1/+1
  AT_054: { abilities: play(fn('buffHandAndDeck', { atk: 1, hp: 1 })) },
  // 放熊陷阱：秘密：在你的英雄被攻擊後，召喚一隻 3/3 嘲諷的熊
  AT_060: { ...secretOn('heroAttacked', { e: 'summon', card: 'CS2_125', count: 1, who: 'self' }), tokens: ['CS2_125'] },
  // 全面備戰：本回合你每施放一張法術，獲得一張隨機獵人牌
  AT_061: { cost: 2, abilities: play(fn('lockAndLoad')) },
  // 蜘蛛囊：召喚三個 1/1 織網者
  AT_062: { abilities: play({ e: 'summon', card: 'FP1_011', count: 3, who: 'self' }), tokens: ['FP1_011'] },
  // 酸喉：每當敵方手下受到傷害，消滅它
  AT_063: { abilities: [{ on: { k: 'damaged', subject: 'enemyMinion' }, effects: [{ e: 'destroy', target: { t: 'it' } }] }] },
  // 王家防衛者：戰吼：若你控制嘲諷手下，獲得 +1 耐久度
  AT_065: { abilities: playIf({ c: 'control', keyword: 'TAUNT' }, { e: 'weaponBuff', dur: 1 }) },
  // 猛瑪象人首領：同時傷害被攻擊者兩側的手下
  AT_067: { keywords: ['CLEAVE'] },
  // 提振士氣：賦予你的嘲諷手下 +2/+2
  AT_068: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', keyword: 'TAUNT' } }, atk: 2, hp: 2 }) },
  // 天空隊長克拉格：衝鋒；每有一個友方海盜，消耗減少 (1)
  AT_070: { keywords: ['CHARGE'], costRule: { per: 'friendlyRace', amount: 1, race: 'PIRATE' } },
  // 瓦里安‧烏瑞恩：戰吼：抽 3 張牌，抽到的手下直接放到戰場上
  AT_072: { abilities: play(fn('varian')) },
  // 戰馬訓練師：你的白銀之手新兵 +2 攻擊力並具有嘲諷
  AT_075: { auras: [{ scope: 'otherFriendly', nameEn: 'Silver Hand Recruit', atk: 2, keywords: ['TAUNT'] }] },
  // 高手過招：消滅所有手下，每位玩家只留下攻擊力最高的一個
  AT_078: { abilities: play(fn('coliseum')) },
  // 神秘挑戰者：戰吼：把牌堆中每種奧秘各一個放到戰場上
  AT_079: { abilities: play(fn('secretsFromDeck', { all: true })) },
  // 要塞指揮官：你的英雄能力每回合可以使用兩次
  AT_080: { flags: ['heroPowerTwice'] },
  // 湖中少女：你的英雄能力消耗為 (1)
  AT_085: { flags: ['heroPowerCost1'] },
  // 破壞者：戰吼：對手的英雄能力在下個回合消耗增加 (5)
  AT_086: { abilities: play({ e: 'heroPowerTax', amount: 5 }) },
  // 莫古的勇士：有 50% 機率攻擊錯誤的敵人
  AT_088: { flags: ['misdirect'] },
  // 雜耍吞法者：戰吼：複製對手的英雄能力
  AT_098: { abilities: play(fn('copyHeroPower')) },
  // 銀白巡邏兵：無法攻擊；激勵：本回合可以正常攻擊
  AT_109: { keywords: ['CANT_ATTACK'], abilities: inspire(fn('allowAttack')) },
  // 擊劍教練：戰吼：你下一次使用英雄能力消耗減少 (2)
  AT_115: { abilities: play({ e: 'heroPowerDiscount', amount: 2 }) },
  // 大會主持人：戰吼：若你有法術傷害的手下，獲得 +2/+2
  AT_117: { abilities: playIf({ c: 'spellDamage' }, selfBuff(2, 2)) },
  // 大明星：每當你打出有戰吼的牌，獲得 +1/+1
  AT_121: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itHasBattlecry' }, effects: [selfBuff(1, 1)] }] },
  // 『穿刺者』戈莫克：戰吼：若你控制至少 4 個其他手下，造成 4 點傷害
  AT_122: {
    target: optional({ type: 'character', side: 'any' }, { c: 'control', min: 4 }),
    abilities: playIf({ c: 'control', min: 4 }, hit(4, false)),
  },
  // 波爾夫‧拉姆榭：你的英雄受到的傷害改由此手下承受
  AT_124: { flags: ['bodyguard'] },
  // 菲歐拉‧光寂：每當你以法術指定此手下為目標，獲得聖盾
  AT_129: { abilities: [{ on: { k: 'spellTarget' }, effects: [selfBuff(0, 0, ['DIVINE_SHIELD'])] }] },
  // 海劫者：當你抽到這張牌時，對你的手下造成 1 點傷害
  //（官方資料標記為「抽中時施放」，但它抽到後會留在手牌）
  AT_130: { castsWhenDrawn: false, abilities: [{ on: { k: 'drawn' }, effects: [{ e: 'damage', target: allFriendly, amount: 1 }] }] },
  // 艾狄絲‧暗寂：每當你以法術指定此手下為目標，對一個隨機敵人造成 3 點傷害
  AT_131: {
    abilities: [{ on: { k: 'spellTarget' }, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 3 }] }],
  },
  // 審判者瑪瑞爾：戰吼：把你的基本英雄能力換成更強的版本
  AT_132: { abilities: play(fn('upgradeHeroPower')) },

  // ==========================================================================
  // 卡拉贊之夜
  // ==========================================================================
  // 豹子戲法：秘密：在對手施放法術後，召喚一隻 4/2 潛行的豹
  KAR_004: { ...secretOn('afterEnemySpell', { e: 'summon', card: 'KAR_004a', count: 1, who: 'self' }), tokens: ['KAR_004a'] },
  // 披風女獵手：你的奧秘消耗為 (0)
  KAR_006: { costAuras: [{ side: 'friendly', secret: true, set: 0 }] },
  // 卡啦卡啦贊！：召喚 1/1 蠟燭、2/2 掃帚與 3/3 茶壺
  KAR_025: {
    abilities: play(
      { e: 'summon', card: 'KAR_025a', count: 1, who: 'self' },
      { e: 'summon', card: 'KAR_025b', count: 1, who: 'self' },
      { e: 'summon', card: 'KAR_025c', count: 1, who: 'self' },
    ),
    tokens: ['KAR_025a', 'KAR_025b', 'KAR_025c'],
  },
  // 蠢人災厄：每回合可以攻擊任意次數；無法攻擊英雄
  KAR_028: { keywords: ['CANT_ATTACK_HEROES'], flags: ['unlimitedAttacks'] },
  // 餐廳蜘蛛：戰吼：召喚一隻 1/3 蜘蛛
  KAR_030a: { abilities: play({ e: 'summon', card: 'KAR_030', count: 1, who: 'self' }), tokens: ['KAR_030'] },
  // 護城河潛伏者：戰吼：消滅一個手下；亡語：讓它回來
  KAR_041: { target: optional({ type: 'minion', side: 'any', excludeSelf: true }), abilities: [...play(fn('devour')), ...dr(fn('regurgitate'))] },
  // 象牙騎士：戰吼：發現一張法術，為你的英雄恢復等同其消耗的生命值
  KAR_057: { abilities: play({ e: 'discover', pool: { type: 'SPELL' }, then: [fn('healByItCost')] }) },
  // 館長：嘲諷；戰吼：抽一張野獸、一張龍與一張魚人
  KAR_061: {
    keywords: ['TAUNT'],
    abilities: play(
      { e: 'draw', count: 1, who: 'self', pool: { race: 'BEAST' } },
      { e: 'draw', count: 1, who: 'self', pool: { race: 'DRAGON' } },
      { e: 'draw', count: 1, who: 'self', pool: { race: 'MURLOC' } },
    ),
  },
  // 幽魂之爪：在你有法術傷害時 +2 攻擊力
  KAR_063: { atkIf: { cond: { c: 'spellDamage' }, atk: 2 } },
  // 唬爛海賊：戰吼：隨機把一張其他職業的卡加入你的手牌
  KAR_069: { abilities: play({ e: 'addRandom', pool: { otherClass: true }, count: 1, who: 'self' }) },
  // 以太道具商：戰吼：你手牌中其他職業的卡消耗減少 (2)
  KAR_070: { abilities: play(fn('discountOtherClass', { amount: 2 })) },
  // 莫克札的小鬼：每當你棄掉一張牌，抽一張牌
  KAR_089: { abilities: [{ on: { k: 'discard', side: 'friendly' }, effects: [{ e: 'draw', count: 1, who: 'self' }] }] },
  // 致命的叉子：亡語：把一把 3/2 的武器加入你的手牌
  KAR_094: { abilities: dr({ e: 'addCard', card: 'KAR_094a', count: 1, who: 'self' }), tokens: ['KAR_094a'] },
  // 動物管理機械人：戰吼：隨機賦予一個友方野獸、龍與魚人各 +1/+1
  KAR_095: {
    abilities: play(
      { e: 'buff', target: randomFriendly('BEAST'), atk: 1, hp: 1 },
      { e: 'buff', target: randomFriendly('DRAGON'), atk: 1, hp: 1 },
      { e: 'buff', target: randomFriendly('MURLOC'), atk: 1, hp: 1 },
    ),
  },
  // 莫克札王子：開局：把 5 張額外的傳說手下加入你的牌堆
  KAR_096: { startOfGame: 'malchezaar' },
  // 『守護者』麥迪文：戰吼：裝備阿泰絲（在你施放法術後，召喚一個消耗相同的隨機手下）
  KAR_097: { abilities: play({ e: 'equip', card: 'KAR_097t' }), tokens: ['KAR_097t'] },
  KAR_097t: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('atiesh')] }] },
  // 巴奈斯：戰吼：召喚你牌堆中一個隨機手下的 1/1 複製
  KAR_114: { abilities: play(fn('barnes')) },
  // 瑪瑙主教：戰吼：召喚本場對戰中死亡的隨機友方手下
  KAR_204: { abilities: play(fn('resurrectRandom', { count: 1 })) },
  // 銀器魔像：若你棄掉這個手下，召喚它
  KAR_205: { abilities: [{ on: { k: 'discarded' }, effects: [{ e: 'summon', card: 'KAR_205', count: 1, who: 'self' }] }] },
  // 展覽廳魔術師：戰吼：隨機賦予一個友方野獸、龍與魚人各 +2/+2
  KAR_702: {
    abilities: play(
      { e: 'buff', target: randomFriendly('BEAST'), atk: 2, hp: 2 },
      { e: 'buff', target: randomFriendly('DRAGON'), atk: 2, hp: 2 },
      { e: 'buff', target: randomFriendly('MURLOC'), atk: 2, hp: 2 },
    ),
  },
  // 秘法工匠：戰吼：召喚一個 0/5 嘲諷手下
  KAR_710: { abilities: play({ e: 'summon', card: 'KAR_710m', count: 1, who: 'self' }), tokens: ['KAR_710m'] },
  // 紫羅蘭幻術師：在你的回合，你的英雄免疫
  KAR_712: { flags: ['heroImmuneOnTurn'] },

  // ==========================================================================
  // 龍蛇混雜的加基森
  // ==========================================================================
  // 綑縛者拉札：戰吼：若你的牌堆沒有重複的卡，本場對戰中你的英雄能力消耗為 (0)
  CFM_020: { abilities: playIf({ c: 'noDuplicates' }, fn('powerCostZero')) },
  // 發條強盜機械人：每當此手下攻擊手下並存活，抽一張牌
  CFM_025: { abilities: afterAttack({ minion: true, survive: true }, { e: 'draw', count: 1, who: 'self' }) },
  // 肥油大亨：在你的手牌中時，每當你召喚有戰吼的手下，獲得 +1/+1
  CFM_064: { handAbilities: [{ on: { k: 'summon', side: 'friendly' }, cond: { c: 'itHasBattlecry' }, effects: [fn('growInHand', { atk: 1, hp: 1 })] }] },
  // 黑謀會小弟：戰吼：你本回合打出的下一個奧秘消耗為 (1)
  CFM_066: { abilities: play({ e: 'pendingDiscount', d: { secret: true, set: 1, thisTurn: true } }) },
  // 黃鼠狼隧道工：亡語：把此手下洗入對手的牌堆
  CFM_095: { abilities: dr({ e: 'shuffle', card: 'CFM_095', count: 1, who: 'opponent' }) },
  // 先搶先贏：發現一張有超載的卡；超載：(1)
  CFM_313: { overload: 1, abilities: play({ e: 'discover', pool: { overload: true } }) },
  // 巷弄小貓：戰吼：召喚一隻 1/1 的貓
  CFM_315: { abilities: play({ e: 'summon', card: 'CFM_315t', count: 1, who: 'self' }), tokens: ['CFM_315t'] },
  // 鼠黨老大：亡語：召喚等同此手下攻擊力數量的 1/1 老鼠
  CFM_316: { abilities: dr({ e: 'repeat', times: { dyn: 'selfAttack' }, effects: [{ e: 'summon', card: 'CFM_316t', count: 1, who: 'self' }] }), tokens: ['CFM_316t'] },
  // 汙街線民：戰吼：發現一張獵人、聖騎士或戰士卡
  CFM_321: { abilities: play({ e: 'discover', pool: { classes: ['HUNTER', 'PALADIN', 'WARRIOR'] } }) },
  // 業餘海賊：在你裝備武器時 +2 攻擊力
  CFM_325: { atkIf: { cond: { c: 'weapon' }, atk: 2 } },
  // 對戰發起人：戰吼：若你控制生命值 6 以上的手下，抽兩張牌
  CFM_328: { abilities: playIf({ c: 'control', minHp: 6 }, { e: 'draw', count: 2, who: 'self' }) },
  // 『指虎』那寇斯：在此手下攻擊手下後，也會攻擊敵方英雄
  CFM_333: { abilities: afterAttack({ minion: true, survive: true }, { e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: { dyn: 'selfAttack' } }) },
  // 巡邏科多獸：戰吼：造成等同此手下攻擊力的傷害
  CFM_335: { target: optional({ type: 'character', side: 'any' }), abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'selfAttack' } }) },
  // 走運海賊：戰吼：若你的武器至少有 3 點攻擊力，獲得 +4/+4
  CFM_342: { abilities: playIf({ c: 'weaponAttack', n: 3 }, selfBuff(4, 4)) },
  // 『流星魚忍』芬傑：潛行；每當此手下攻擊並消滅手下，從你的牌堆召喚 2 個魚人
  CFM_344: { keywords: ['STEALTH'], abilities: afterAttack({ killed: true }, { e: 'recruit', count: 2, race: 'MURLOC' }) },
  // 瘋狂藥水：控制一個攻擊力 2 以下的敵方手下直到回合結束
  CFM_603: { target: { filter: { type: 'minion', side: 'enemy', maxAttack: 2 } }, abilities: play(fn('stealTemp')) },
  // 龍獸探員：戰吼：若你手中有龍，發現對手牌堆中一張卡的複製
  CFM_605: { abilities: playIf({ c: 'holding', race: 'DRAGON' }, fn('discoverFromOppDeck')) },
  // 法力晶簇：溢療：召喚一個 2/2 水晶
  CFM_606: { abilities: [{ on: { k: 'overheal' }, effects: [{ e: 'summon', card: 'CFM_606t', count: 1, who: 'self' }] }], tokens: ['CFM_606t'] },
  // 晶爆藥水：消滅一個手下與你的一個法力水晶
  CFM_608: { target: chosenMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, { e: 'mana', kind: 'destroy', amount: 1 }) },
  // 血怒藥水：賦予一個手下 +3 攻擊力；若是惡魔，再 +3 生命值
  CFM_611: {
    target: chosenMinion,
    abilities: play(
      { e: 'buff', target: { t: 'chosen' }, atk: 3 },
      { e: 'cond', cond: { c: 'chosenRace', race: 'DEMON' }, then: [{ e: 'buff', target: { t: 'chosen' }, hp: 3 }] },
    ),
  },
  // 偷取力量：每有一個友方手下，獲得一個空的法力水晶
  CFM_616: { abilities: play({ e: 'repeat', times: { dyn: 'friendlyMinions' }, effects: [{ e: 'mana', kind: 'empty', amount: 1 }] }) },
  // 天尊睡夢者：戰吼：若你控制攻擊力 5 以上的手下，獲得 +2/+2
  CFM_617: { abilities: playIf({ c: 'control', minAtk: 5 }, selfBuff(2, 2)) },
  // 黑謀會藥劑師：戰吼：隨機把一張藥水加入你的手牌
  CFM_619: { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', nameEn: 'Potion', set: 25, anyClass: true }, count: 1, who: 'self' }) },
  // 卡札克斯：戰吼：若你的牌堆沒有重複的卡，製造一個自訂法術
  CFM_621: { abilities: playIf({ c: 'noDuplicates' }, fn('kazakus')), tokens: KAZAKUS_TOKENS },
  // 卡札克斯藥水的材料（解析器看不懂的）
  CFM_621t10: { abilities: play({ e: 'summon', card: 'CFM_621_m4', count: 1, who: 'self' }), tokens: ['CFM_621_m4'] },
  CFM_621t20: { abilities: play({ e: 'summon', card: 'CFM_621_m2', count: 1, who: 'self' }), tokens: ['CFM_621_m2'] },
  CFM_621t28: { abilities: play({ e: 'summon', card: 'CFM_621_m3', count: 1, who: 'self' }), tokens: ['CFM_621_m3'] },
  CFM_621t21: { abilities: play({ e: 'transform', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 }, card: 'CFM_621_m5' }), tokens: ['CFM_621_m5'] },
  CFM_621t29: { abilities: play({ e: 'transform', target: { t: 'all', filter: { type: 'minion' } }, card: 'CFM_621_m5' }), tokens: ['CFM_621_m5'] },
  CFM_621t37: { abilities: play(fn('resurrectRandom', { count: 1 })) },
  CFM_621t38: { abilities: play(fn('resurrectRandom', { count: 2 })) },
  CFM_621t39: { abilities: play(fn('resurrectRandom', { count: 3 })) },
  CFM_621t9: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', race: 'DEMON' }, count: 1, who: 'self' }) },
  CFM_621t23: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', race: 'DEMON' }, count: 2, who: 'self' }) },
  CFM_621t31: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', race: 'DEMON' }, count: 3, who: 'self' }) },
  CFM_621t: {},
  CFM_621t14: {},
  CFM_621t15: {},
  CFM_621t11: {},
  CFM_621t12: {},
  CFM_621t13: {},
  // 強效秘法飛彈：向隨機敵人發射三枚飛彈，每枚造成 3 點傷害
  CFM_623: {
    abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 3, spell: true }] }),
  },
  // 玉蓮刺客：潛行；每當此手下攻擊並消滅手下，獲得潛行
  CFM_634: { keywords: ['STEALTH'], abilities: afterAttack({ killed: true }, selfBuff(0, 0, ['STEALTH'])) },
  // 海盜派奇：在你打出海盜後，從你的牌堆召喚此手下
  CFM_637: { summonFromDeckAfter: 'PIRATE' },
  // 荷巴爾特‧繫錘：戰吼：若你裝備了武器，賦予你手牌與牌堆中的所有手下 +2/+2
  CFM_643: { abilities: playIf({ c: 'weapon' }, fn('buffHandAndDeck', { atk: 2, hp: 2 })) },
  // 勒索慣犯：戰吼：召喚一個 6/6 的食人魔
  CFM_648: { abilities: play({ e: 'summon', card: 'CFM_648t', count: 1, who: 'self' }), tokens: ['CFM_648t'] },
  // 黑謀會信差：戰吼：發現一張法師、牧師或術士卡
  CFM_649: { abilities: play({ e: 'discover', pool: { classes: ['MAGE', 'PRIEST', 'WARLOCK'] } }) },
  // 二流打手：嘲諷；若對手有至少三個手下，消耗減少 (2)
  CFM_652: { keywords: ['TAUNT'], costIf: { cond: { c: 'control', side: 'enemy', min: 3 }, cost: 3 } },
  // 劇毒下水道軟泥怪：戰吼：對手的武器失去 1 點耐久度
  CFM_655: { abilities: play(fn('weaponDurability', { who: 'opponent', amount: -1 })) },
  // 街頭調查員：戰吼：敵方手下失去潛行
  CFM_656: { abilities: play(fn('removeEnemyStealth')) },
  // 狂躁魂術師：戰吼：選擇一個友方手下，把它的複製洗入你的牌堆
  CFM_660: { target: optional({ type: 'minion', side: 'friendly', excludeSelf: true }), abilities: play({ e: 'shuffleCopy', target: { t: 'chosen' }, count: 1 }) },
  // 縮小藥水：本回合敵方手下 -3 攻擊力
  CFM_661: { abilities: play({ e: 'buff', target: allEnemy, atk: -3, temp: true }) },
  // 龍火藥水：對龍以外的所有手下造成 5 點傷害
  CFM_662: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', notRace: 'DRAGON' } }, amount: 5, spell: true }) },
  // 諾格弗格市長：所有目標都隨機選擇
  CFM_670: { flags: ['randomTargets'] },
  // 冰寒術師：戰吼：若有敵人被凍結，獲得 +2/+2
  CFM_671: { abilities: playIf({ c: 'enemyFrozen' }, selfBuff(2, 2)) },
  // 苟雅女士：戰吼：選擇一個友方手下，從你的牌堆召喚它的所有複製
  CFM_672: { target: optional({ type: 'minion', side: 'friendly', excludeSelf: true }), abilities: play(fn('summonDeckCopies')) },
  // 紋身大師索莉雅：戰吼：若你的牌堆沒有重複的卡，你本回合施放的下一張法術消耗為 (0)
  CFM_687: { abilities: playIf({ c: 'noDuplicates' }, { e: 'pendingDiscount', d: { type: 'SPELL', set: 0, thisTurn: true } }) },
  // 飆豬騎士：戰吼：若有敵方手下具有嘲諷，獲得衝鋒
  CFM_688: { abilities: playIf({ c: 'control', side: 'enemy', keyword: 'TAUNT' }, selfBuff(0, 0, ['CHARGE'])) },
  // 暗影師尊：戰吼：賦予一個潛行的手下 +2/+2
  CFM_694: { target: optional({ type: 'minion', side: 'any', keyword: 'STEALTH' }), abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }) },
  // 退化：把所有敵方手下變成消耗少 (1) 的隨機手下
  CFM_696: { abilities: play({ e: 'evolve', target: allEnemy, amount: -1 }) },
  // 玉蓮幻術師：在此手下攻擊英雄後，把它變成隨機一個 6 費手下
  CFM_697: { abilities: afterAttack({ hero: true }, { e: 'transformRandom', target: { t: 'self' }, pool: { type: 'MINION', cost: 6 } }) },
  // 海魔釘刺者：戰吼：你本回合打出的下一個魚人改為消耗生命值
  CFM_699: { abilities: play({ e: 'pendingDiscount', d: { race: 'MURLOC', health: true, thisTurn: true } }) },
  // 『無縛者』庫魯爾：戰吼：若你的牌堆沒有重複的卡，從你的手牌召喚所有惡魔
  CFM_750: { abilities: playIf({ c: 'noDuplicates' }, fn('summonFromHand', { race: 'DEMON', all: true })) },
  // 汙街典當商：戰吼：賦予你手牌中一張隨機武器 +1/+1
  CFM_755: { abilities: play(fn('buffHandWeapon', { atk: 1, dur: 1 })) },
  // 暗巷護甲鍛造師：嘲諷；每當此手下造成傷害，獲得等量的護甲值
  CFM_756: { keywords: ['TAUNT'], abilities: [{ on: { k: 'dealtDamage' }, effects: [{ e: 'armor', amount: { dyn: 'eventAmount' } }] }] },
  // 黑街探長：亡語：若此手下至少有 2 點攻擊力，抽一張牌
  CFM_759: { abilities: dr({ e: 'cond', cond: { c: 'selfAttack', n: 2 }, then: [{ e: 'draw', count: 1, who: 'self' }] }) },
  // 黑謀會送晶員：本場對戰中你每打出一個奧秘，消耗減少 (2)
  CFM_760: { costRule: { per: 'secretsPlayed', amount: 2 } },
  // 『收藏者』夏庫：潛行；每當此手下攻擊時，隨機把一張其他職業的卡加入你的手牌
  CFM_781: { keywords: ['STEALTH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [{ e: 'addRandom', pool: { otherClass: true }, count: 1, who: 'self' }] }] },
  // 骯髒的老鼠：嘲諷；戰吼：對手從他的手牌召喚一個隨機手下
  CFM_790: { keywords: ['TAUNT'], abilities: play(fn('summonFromHand', { who: 'opponent' })) },
  // 怒西昂：嘲諷；戰吼：持續抽牌，直到抽到不是龍的牌
  CFM_806: { keywords: ['TAUNT'], abilities: play(fn('wrathion')) },
  // 拍賣大師比爾杜：在你施放法術後，英雄能力可以再使用
  CFM_807: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [{ e: 'refreshHeroPower' }] }] },
  // 『大白鯊』甘佐：每當此手下攻擊時，雙方抽牌直到有 3 張手牌
  CFM_808: { abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('drawUntil', { n: 3 })] }] },
  // 塔納利斯飆豬仔：戰吼：若對手沒有手牌，獲得衝鋒
  CFM_809: { abilities: playIf({ c: 'handSize', op: '<=', n: 0, side: 'enemy' }, selfBuff(0, 0, ['CHARGE'])) },
  // 飆豬幫首領：戰吼：若對手有 6 張以上的手牌，獲得衝鋒
  CFM_810: { abilities: playIf({ c: 'handSize', op: '>=', n: 6, side: 'enemy' }, selfBuff(0, 0, ['CHARGE'])) },
  // 月之洞察：抽 2 張牌，抽到的手下消耗減少 (2)
  CFM_811: { abilities: play(fn('drawDiscount', { count: 2, type: 'MINION', amount: 2 })) },
  // 有膽識的記者：每當對手抽一張牌，獲得 +1/+1
  CFM_851: { abilities: [{ on: { k: 'draw', side: 'enemy' }, effects: [selfBuff(1, 1)] }] },
  // 玉蓮密探：戰吼：發現一張德魯伊、盜賊或薩滿卡
  CFM_852: { abilities: play({ e: 'discover', pool: { classes: ['DRUID', 'ROGUE', 'SHAMAN'] } }) },
  // 迪菲亞清理者：戰吼：沉默一個有亡語的手下
  CFM_855: { target: optional({ type: 'minion', side: 'any', hasDeathrattle: true }), abilities: play({ e: 'silence', target: { t: 'chosen' } }) },

  // ==========================================================================
  // 惡魔獵人新兵
  // ==========================================================================
  // 伊利達瑞攻擊令：召喚六個 1/1 衝刺伊利達瑞新兵
  BT_173: { abilities: play(summon('BT_036t', 6)), tokens: ['BT_036t'] },
  // 狂怒的魔化尖嘯者：戰吼：你的下一個惡魔消耗減少 (2)
  BT_416: { abilities: play({ e: 'pendingDiscount', d: { race: 'DEMON', amount: 2 } }) },
  // 靈魂饗宴：本回合每有一個友方手下死亡，抽一張牌
  BT_427: { abilities: play({ e: 'draw', count: { dyn: 'friendlyDiedThisTurn' }, who: 'self' }) },
  // 尼斯蘭德瑪斯：戰吼：召喚兩個隨機的 X 費手下（在手牌中每有友方手下死亡，X +1）
  BT_481: {
    handAbilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('counterInHand')] }],
    abilities: play(fn('summonRandomCost', { count: 2, cost: { dyn: 'handCounter' } })),
  },
  // 巨大的惡魔將領：突襲；攻擊並消滅手下後，可以再攻擊一次
  BT_487: { keywords: ['RUSH'], abilities: afterAttack({ killed: true }, fn('attackAgainSelf')) },
  // 怒刺尖兵：嘲諷；此手下被攻擊後，對全部敵人造成 1 點傷害
  BT_510: { keywords: ['TAUNT'], abilities: [{ on: { k: 'attacked' }, effects: [{ e: 'damage', target: allEnemies, amount: 1 }] }] },
  // 殘影：你的英雄本回合不會受到傷害
  BT_752: { cost: 0, abilities: play(fn('heroImmune')) },
  // 法力燃燒：對手的下個回合少 2 個法力水晶
  BT_753: { abilities: play(fn('manaBurn', { amount: 2 })) },
  // 魔眼光束：生命竊取；對一個手下造成 3 點傷害；流放：消耗為 (1)
  BT_801: { keywords: ['LIFESTEAL'], target: chosenMinion, abilities: play(hit(3)), outcastCost: 1 },
  // 『流放者』奧翠司：在你打出最左邊或最右邊的牌後，對全部敵人造成 1 點傷害
  BT_937: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'outcast' }, effects: [{ e: 'damage', target: allEnemies, amount: 1 }] }] },

  // ==========================================================================
  // 黑木森林
  // ==========================================================================
  // 秘法鎖匠：戰吼：發現一個奧秘，放到戰場上
  GIL_116: { abilities: play(fn('discoverSecretPlace')) },
  // 狼人憎惡體：在你的回合結束時，對其他所有受傷的手下造成 2 點傷害
  GIL_117: { abilities: atEndOfTurn({ e: 'damage', target: { t: 'all', filter: { type: 'minion', damaged: true, excludeSelf: true } }, amount: 2 }) },
  // 恐怖綠苔怪：戰吼：消滅其他所有攻擊力 2 以下的手下
  GIL_124: { abilities: play({ e: 'destroy', target: { t: 'all', filter: { type: 'minion', maxAttack: 2, excludeSelf: true } } }) },
  // 瘋帽客：戰吼：隨機丟 3 頂帽子給其他手下，每頂 +1/+1
  GIL_125: { abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'buff', target: { t: 'random', filter: { type: 'minion', excludeSelf: true }, count: 1 }, atk: 1, hp: 1 }] }) },
  // 艾莫莉絲：戰吼：你手牌中所有手下的攻擊力與生命值加倍
  GIL_128: { abilities: play(fn('emeriss')) },
  // 陰鬱雄鹿：嘲諷；戰吼：若牌堆只有奇數消耗的卡，獲得 +2/+2
  GIL_130: { keywords: ['TAUNT'], abilities: playIf({ c: 'deckParity', odd: true }, selfBuff(2, 2)) },
  // 變色龍克米里歐：在你的手牌中時，每回合變成對手手牌中的一張卡
  GIL_142: { handShift: { kind: 'opponentCard' } },
  // 石英元素：受傷時無法攻擊
  GIL_156: { flags: ['noAttackDamaged'] },
  // 夜鱗族母：每當友方手下被治療，召喚一隻 3/3 雛龍
  GIL_190: { abilities: [{ on: { k: 'healed', subject: 'friendly' }, cond: { c: 'itIsMinion' }, effects: [summon('GIL_190t')] }], tokens: ['GIL_190t'] },
  // 竊魂者阿薩琳娜：戰吼：把你的手牌換成對手手牌的複製
  GIL_198: { abilities: play(fn('azalina')) },
  // 在手牌中每回合對調攻擊力與生命值的手下（兩個版本互相切換）
  GIL_200: swapEachTurn('GIL_200t', { keywords: ['STEALTH'], tokens: ['GIL_200t'] }),
  GIL_200t: swapEachTurn('GIL_200', { keywords: ['STEALTH'] }),
  GIL_201: swapEachTurn('GIL_201t', { keywords: ['LIFESTEAL'], tokens: ['GIL_201t'] }),
  GIL_201t: swapEachTurn('GIL_201', { keywords: ['LIFESTEAL'] }),
  GIL_202: swapEachTurn('GIL_202t', { keywords: ['DIVINE_SHIELD', 'RUSH'], tokens: ['GIL_202t'] }),
  GIL_202t: swapEachTurn('GIL_202', { keywords: ['DIVINE_SHIELD', 'RUSH'] }),
  GIL_528: swapEachTurn('GIL_528t', { keywords: ['RUSH'], tokens: ['GIL_528t'] }),
  GIL_528t: swapEachTurn('GIL_528', { keywords: ['RUSH'] }),
  GIL_529: swapEachTurn('GIL_529t', { spellDamage: 1, tokens: ['GIL_529t'] }),
  GIL_529t: swapEachTurn('GIL_529', { spellDamage: 1 }),
  // 責難：敵方法術在下個回合消耗增加 (5)
  GIL_203: { abilities: play({ e: 'spellTax', amount: 5 }) },
  // 纏毛秘術使：戰吼：雙方各隨機獲得一張 2 費手下
  GIL_213: {
    abilities: play(
      { e: 'addRandom', pool: { type: 'MINION', cost: 2, anyClass: true }, count: 1, who: 'self' },
      { e: 'addRandom', pool: { type: 'MINION', cost: 2, anyClass: true }, count: 1, who: 'opponent' },
    ),
  },
  // 暮色蝙蝠：戰吼：若你的英雄本回合受到過傷害，召喚兩隻 1/1 蝙蝠
  GIL_508: { abilities: playIf({ c: 'heroDamaged' }, summon('GIL_508t', 2)), tokens: ['GIL_508t'] },
  // 捕鼠人：突襲；戰吼：消滅一個友方手下，獲得它的攻擊力與生命值
  GIL_515: { keywords: ['RUSH'], target: friendlyOther, abilities: play(fn('devourStats')) },
  // 振翼衝擊：對一個手下造成 4 點傷害；若本回合有手下死亡，消耗為 (1)
  GIL_518: { target: chosenMinion, abilities: play(hit(4)), costIf: { cond: { c: 'anyDiedThisTurn' }, cost: 1 } },
  // 濁水電鰻：戰吼：若牌堆只有偶數消耗的卡，造成 2 點傷害
  GIL_530: { target: optional({ type: 'character', side: 'any' }, { c: 'deckParity', odd: false }), abilities: playIf({ c: 'deckParity', odd: false }, hit(2, false)) },
  // 致命武裝：揭露牌堆中的一把武器，對全部手下造成其攻擊力的傷害
  GIL_537: { abilities: play(fn('revealDamageAll', { type: 'WEAPON' })) },
  // 達瑞亞斯‧克羅雷：突襲；攻擊並消滅手下後，獲得 +2/+2
  GIL_547: { keywords: ['RUSH'], abilities: afterAttack({ killed: true }, selfBuff(2, 2)) },
  // 冤靈之書：抽 3 張牌，棄掉抽到的法術
  GIL_548: { abilities: play(fn('bookOfSpecters')) },
  // 時光巧匠托奇：戰吼：隨機獲得一張傳說手下
  GIL_549: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, count: 1, who: 'self' }) },
  // 幽光之林：你每有一張手牌，召喚一個 1/1 小精靈
  GIL_553: { abilities: play({ e: 'repeat', times: { dyn: 'handSize' }, effects: [summon('GIL_553t')] }), tokens: ['GIL_553t'] },
  // 受詛咒的船難者：突襲；亡語：從你的牌堆抽一張連擊牌
  GIL_557: { keywords: ['RUSH'], abilities: dr({ e: 'draw', count: 1, who: 'self', pool: { combo: true } }) },
  // 黑森林小妖精：戰吼：英雄能力可以再使用
  GIL_561: { abilities: play({ e: 'refreshHeroPower' }) },
  // 死網蜘蛛：戰吼：若你的英雄本回合受到過傷害，獲得生命竊取
  GIL_565: { abilities: playIf({ c: 'heroDamaged' }, selfBuff(0, 0, ['LIFESTEAL'])) },
  // 巫異時刻：召喚本場對戰中死亡的隨機友方野獸
  GIL_571: { abilities: play(fn('resurrectRandom', { count: 1, race: 'BEAST' })) },
  // 捕鼠陷阱：秘密：在對手一個回合打出三張牌後，召喚一隻 6/6 老鼠
  GIL_577: { ...secretOn('enemyThirdCard', summon('GIL_577t')), tokens: ['GIL_577t'] },
  // 女伯爵艾希摩：戰吼：從牌堆抽一張突襲、生命竊取與亡語卡
  GIL_578: {
    abilities: play(
      { e: 'draw', count: 1, who: 'self', pool: { keyword: 'RUSH' } },
      { e: 'draw', count: 1, who: 'self', pool: { keyword: 'LIFESTEAL' } },
      { e: 'draw', count: 1, who: 'self', pool: { hasDeathrattle: true } },
    ),
  },
  // 圖騰啃食者：嘲諷；戰吼：消滅你的圖騰，每消滅一個獲得 +2/+2
  GIL_583: { keywords: ['TAUNT'], abilities: play(fn('totemCruncher')) },
  // 黑巫森林吹笛手：戰吼：抽出牌堆中消耗最低的手下
  GIL_584: { abilities: play(fn('drawLowestMinion')) },
  // 泰絲‧葛雷邁恩：戰吼：重新打出本場對戰中你打出過的其他職業的卡
  GIL_598: { abilities: play(fn('tess')) },
  // 毒藥販子：每當你打出 1 費手下，使其獲得劇毒
  GIL_607: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itCost', n: 1 }, effects: [{ e: 'buff', target: { t: 'it' }, keywords: ['POISONOUS'] }] }] },
  // 巫毒人偶：戰吼：選擇一個手下；亡語：消滅它
  GIL_614: { target: optional({ type: 'minion', side: 'any', excludeSelf: true }), abilities: [...play(fn('voodooMark')), ...dr(fn('voodooDestroy'))] },
  // 傀儡師多里安：每當你抽到手下，召喚它的 1/1 複製
  GIL_620: { abilities: [{ on: { k: 'draw', side: 'friendly' }, cond: { c: 'itIsMinion' }, effects: [fn('summonHandCopy', { atk: 1, hp: 1 })] }] },
  // 黑巫森林灰熊：嘲諷；戰吼：對手每有一張手牌，失去 1 點生命值
  GIL_623: { keywords: ['TAUNT'], abilities: play(fn('loseHealth', { amount: { dyn: 'oppHandSize' } })) },
  // 暗夜徘徊者：戰吼：若這是戰場上唯一的手下，獲得 +3/+3
  GIL_624: { abilities: playIf({ c: 'boardCount', n: 1 }, selfBuff(3, 3)) },
  // 警鐘哨衛：戰吼與亡語：把牌堆中的一個奧秘放到戰場上
  GIL_634: { abilities: [...play(fn('secretsFromDeck', { count: 1 })), ...dr(fn('secretsFromDeck', { count: 1 }))] },
  // 發條木偶：你的英雄能力的傷害與治療加倍
  GIL_646: { flags: ['heroPowerDouble'] },
  // 總督察：戰吼：摧毀所有敵方奧秘
  GIL_648: { abilities: play(fn('destroyEnemySecrets')) },
  // 樵夫的斧頭：亡語：隨機賦予一個友方手下 +2/+1
  GIL_653: { abilities: dr({ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly' }, count: 1 }, atk: 2, hp: 1 }) },
  // 接木樹妖：戰吼：選擇一個友方手下，把它的 10/10、消耗 (10) 的複製加入手牌
  GIL_658: { target: friendlyOther, abilities: play(fn('copyStatsToHand', { atk: 10, hp: 10, cost: 10 })) },
  // 鬼靈彎劍：生命竊取；每當你打出其他職業的卡，獲得 +1 耐久度
  GIL_672: { keywords: ['LIFESTEAL'], abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itOtherClass' }, effects: [{ e: 'weaponBuff', dur: 1 }] }] },
  // 夢魘聚合體：擁有所有種族
  GIL_681: {},
  // 沼澤飛龍：戰吼：為對手召喚一個 2/1 劇毒屠龍者
  GIL_683: { abilities: play(summon('GIL_683t', 1, 'opponent')), tokens: ['GIL_683t'] },
  // 聖光楷模：攻擊力 3 以上時具有嘲諷與生命竊取
  GIL_685: { kwIf: { cond: { c: 'selfAttack', n: 3 }, keywords: ['TAUNT', 'LIFESTEAL'] } },
  // 大法師阿魯高：每當你抽到手下，把它的複製加入你的手牌
  GIL_691: { abilities: [{ on: { k: 'draw', side: 'friendly' }, cond: { c: 'itIsMinion' }, effects: [{ e: 'addCopy', target: { t: 'it' }, count: 1 }] }] },
  // 吉恩‧葛雷邁恩：開局：若牌堆只有偶數消耗的卡，英雄能力消耗為 (1)
  GIL_692: { startOfGame: 'genn' },
  // 黎姆王子：戰吼：把牌堆中消耗 1 的卡變成傳說手下
  GIL_694: { abilities: play(fn('princeLiam')) },
  // 暮落艾維娜：每位玩家在自己回合打出的第一張牌消耗為 (0)
  GIL_800: { costAuras: [{ side: 'both', firstCard: true, set: 0 }] },
  // 急速冷凍：凍結一個手下；若已被凍結，消滅它
  GIL_801: {
    target: chosenMinion,
    abilities: play({ e: 'cond', cond: { c: 'chosenFrozen' }, then: [{ e: 'destroy', target: { t: 'chosen' } }], else: [{ e: 'freeze', target: { t: 'chosen' } }] }),
  },
  // 破棺者：亡語：從你的手牌召喚一個亡語手下
  GIL_805: { abilities: dr(fn('summonFromHand', { deathrattle: true })) },
  // 鮮明夢魘：選擇一個友方手下，召喚一個只剩 1 點生命值的複製
  GIL_813: { target: friendlyMinion, abilities: play(fn('copyWithHealth', { hp: 1 })) },
  // 惡毒銀行家：戰吼：選擇一個友方手下，把它的複製洗入你的牌堆
  GIL_815: { target: friendlyOther, abilities: play({ e: 'shuffleCopy', target: { t: 'chosen' }, count: 1 }) },
  // 鑲嵌玻璃騎士：聖盾；每當你恢復生命值，獲得聖盾
  GIL_817: {
    keywords: ['DIVINE_SHIELD'],
    abilities: [{ on: { k: 'healed', subject: 'any' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, effects: [selfBuff(0, 0, ['DIVINE_SHIELD'])] }],
  },
  // 哮斗龍：戰吼：重複本場對戰中你打出的其他卡的戰吼（目標隨機）
  GIL_820: { abilities: play(fn('shudderwock')) },
  // 高佛雷領主：戰吼：對其他所有手下造成 2 點傷害，若有手下死亡就重複
  GIL_825: { abilities: play(fn('repeatAoe', { amount: 2, excludeSelf: true })) },
  // 食月巨蟒巴庫：開局：若牌堆只有奇數消耗的卡，強化英雄能力
  GIL_826: { startOfGame: 'baku' },
  // 凶暴狂亂：賦予一個野獸 +3/+3，把 3 張 +3/+3 的複製洗入你的牌堆
  GIL_828: {
    target: { filter: { type: 'minion', side: 'any', race: 'BEAST' } },
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }, fn('shuffleCopiesBuffed', { count: 3, atk: 3, hp: 3 })),
  },
  // 閃亮飛蛾：戰吼：若牌堆只有奇數消耗的卡，你其他手下的生命值加倍
  GIL_837: { abilities: playIf({ c: 'deckParity', odd: true }, fn('doubleOtherHealth')) },
  // 黑貓：法術傷害 +1；戰吼：若牌堆只有奇數消耗的卡，抽一張牌
  GIL_838: { spellDamage: 1, abilities: playIf({ c: 'deckParity', odd: true }, { e: 'draw', count: 1, who: 'self' }) },
  // 白衣女士：戰吼：牌堆中所有手下的攻擊力變得等同生命值
  GIL_840: { abilities: play(fn('ladyInWhite')) },
  // 隱藏的智慧：秘密：在對手一個回合打出三張牌後，抽 2 張牌
  GIL_903: secretOn('enemyThirdCard', { e: 'draw', count: 2, who: 'self' }),
  // 食腐飛龍：戰吼：若本回合有手下死亡，獲得劇毒
  GIL_905: { abilities: playIf({ c: 'anyDiedThisTurn' }, selfBuff(0, 0, ['POISONOUS'])) },

  // ==========================================================================
  // 哥布林與地精
  // ==========================================================================
  // 麥迪文的回音：把每個友方手下的複製加入你的手牌
  GVG_005: { abilities: play(fn('echoOfMedivh')) },
  // 機械召喚師：你的機械消耗減少 (1)
  GVG_006: { costAuras: [{ side: 'friendly', race: 'MECHANICAL', add: -1 }] },
  // 烈焰戰輪：突襲；當你抽到這張牌時，對機械以外的所有角色造成 2 點傷害
  GVG_007: {
    keywords: ['RUSH'],
    castsWhenDrawn: false,
    abilities: [
      {
        on: { k: 'drawn' },
        effects: [
          { e: 'damage', target: { t: 'all', filter: { type: 'minion', notRace: 'MECHANICAL' } }, amount: 2 },
          { e: 'damage', target: { t: 'hero', side: 'both' }, amount: 2 },
        ],
      },
    ],
  },
  // 聖光炸彈：對每個手下造成等同其攻擊力的傷害
  GVG_008: { abilities: play(fn('lightbomb')) },
  // 費倫的祝福：賦予一個手下 +2/+4 與法術傷害 +1
  GVG_010: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 4 }, fn('gainSpellDamage', { chosen: true })) },
  // 那魯之光：恢復 3 點生命值；若目標仍受傷，召喚一個護光者
  GVG_012: {
    target: anyChar,
    abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 3 }, { e: 'cond', cond: { c: 'chosenDamaged' }, then: [summon('EX1_001')] }),
    tokens: ['EX1_001'],
  },
  // 齒輪大師：在你控制機械時 +2 攻擊力
  GVG_013: { atkIf: { cond: { c: 'control', race: 'MECHANICAL' }, atk: 2 } },
  // 沃金：戰吼：與另一個手下交換生命值
  GVG_014: { target: optional({ type: 'minion', side: 'any', excludeSelf: true }), abilities: play(fn('voljin')) },
  // 惡魔劫奪者：每當對手打出一張牌，移除你牌堆頂的 3 張牌
  GVG_016: { abilities: [{ on: { k: 'cardPlayed', side: 'enemy' }, effects: [fn('millTop', { who: 'self', count: 3 })] }] },
  // 惡魔之心：對一個手下造成 5 點傷害；若是友方惡魔，改為賦予 +5/+5
  GVG_019: { target: chosenMinion, abilities: play(fn('demonheart')) },
  // 惡魔火砲：在你的回合結束時，對一個非機械的手下造成 2 點傷害
  GVG_020: { abilities: atEndOfTurn({ e: 'damage', target: { t: 'random', filter: { type: 'minion', notRace: 'MECHANICAL' }, count: 1 }, amount: 2 }) },
  // 瑪爾加尼斯：你的英雄免疫；你的其他惡魔 +2/+2
  GVG_021: { flags: ['heroImmune'], auras: [{ scope: 'otherFriendly', race: 'DEMON', atk: 2, hp: 2 }] },
  // 齒輪大師的扳手：在你控制機械時 +2 攻擊力
  GVG_024: { atkIf: { cond: { c: 'control', race: 'MECHANICAL' }, atk: 2 } },
  // 假死：觸發你所有手下的亡語
  GVG_026: { abilities: play(fn('feignDeath')) },
  // 貿易親王加里維克斯：每當對手施放法術，獲得它的複製，並給對手一枚加里維克斯的幸運幣
  GVG_028: { abilities: [{ on: { k: 'spellCast', side: 'enemy' }, effects: [fn('gallywix')] }], tokens: ['GVG_028t'] },
  GVG_028t: { abilities: play({ e: 'mana', kind: 'temp', amount: 1 }) },
  // 先祖之喚：雙方各從手牌把一個隨機手下放到戰場上
  GVG_029: { abilities: play(fn('summonFromHand'), fn('summonFromHand', { who: 'opponent' })) },
  // 電鍍機械小熊：嘲諷；二選一 +1 攻擊力 / +1 生命值
  GVG_030: {
    keywords: ['TAUNT'],
    chooseOne: [
      { id: 'GVG_030a', name: '攻擊模式', text: '+1攻擊力', abilities: play(selfBuff(1, 0)) },
      { id: 'GVG_030b', name: '坦克模式', text: '+1生命值', abilities: play(selfBuff(0, 1)) },
    ],
  },
  // 回收：把一個敵方手下洗入對手的牌堆
  GVG_031: { target: enemyMinion, abilities: play(fn('shuffleIntoOwnerDeck')) },
  // 林地看管者：二選一：雙方各獲得一個法力水晶；或雙方各抽一張牌
  GVG_032: {
    chooseOne: [
      {
        id: 'GVG_032a',
        name: '法力之禮',
        text: '雙方各獲得一個法力水晶',
        abilities: play({ e: 'mana', kind: 'full', amount: 1 }, { e: 'mana', kind: 'full', amount: 1, who: 'opponent' }),
      },
      { id: 'GVG_032b', name: '卡牌之禮', text: '雙方各抽一張牌', abilities: play({ e: 'draw', count: 1, who: 'both' }) },
    ],
  },
  // 機械熊-貓：每當此手下受到傷害，把一張零件加入你的手牌
  GVG_034: { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [fn('addSparePart')] }], tokens: SPARE_PARTS },
  // 瑪洛尼：亡語：進入休眠，在 2 個友方野獸死亡後甦醒
  GVG_035: {
    abilities: [
      ...dr(fn('goDormant', { need: 2 })),
      { on: { k: 'minionDied', side: 'friendly', race: 'BEAST' }, effects: [fn('dormantTick', { need: 2 })] },
    ],
  },
  // 轟雷：造成 3~6 點傷害；超載：(1)
  GVG_038: { overload: 1, target: anyChar, abilities: play(fn('randomDamage', { min: 3, max: 6, chosen: true })) },
  // 黑暗幽光：二選一：召喚 5 個小精靈；或賦予一個手下 +5/+5 與嘲諷
  GVG_041: {
    chooseOne: [
      { id: 'GVG_041b', name: '自然防禦', text: '召喚5個小精靈', abilities: play(summon('CS2_231', 5)) },
      {
        id: 'GVG_041a',
        name: '召喚守護者',
        text: '+5/+5與<b>嘲諷</b>',
        abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 5, hp: 5, keywords: ['TAUNT'] }),
        target: chosenMinion,
      },
    ],
  },
  // 小鬼爆破：對一個手下造成 2~4 點傷害，每 1 點傷害召喚一隻 1/1 小鬼
  GVG_045: { target: chosenMinion, abilities: play(fn('implosion', { card: 'GVG_045t' })), tokens: ['GVG_045t'] },
  // 萬獸之王：嘲諷；你每控制一個其他野獸 +1 攻擊力
  GVG_046: { keywords: ['TAUNT'], atkPer: { dyn: 'friendlyRace', race: 'BEAST' } },
  // 破壞工作：消滅一個隨機敵方手下；連擊：也摧毀對手的武器
  GVG_047: {
    abilities: play({ e: 'destroy', target: randomEnemyMinion }, { e: 'cond', cond: { c: 'combo' }, then: [{ e: 'destroyWeapon', who: 'opponent' }] }),
  },
  // 加茲瑞拉：每當此手下受到傷害，攻擊力加倍
  GVG_049: { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'doubleStat', target: { t: 'self' }, stat: 'atk' }] }] },
  // 彈跳鋒刃：對隨機手下造成 1 點傷害，直到有手下死亡
  GVG_050: { abilities: play(fn('bouncingBlade')) },
  // 粉碎：消滅一個手下；若你控制受傷的手下，消耗減少 (4)
  GVG_052: { target: chosenMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }), costIf: { cond: { c: 'control', damaged: true }, cost: 3 } },
  // 巨魔戰槌 / 巨魔蠻卒 / 砂槌薩滿 / 巨魔忍者：有 50% 機率攻擊錯誤的敵人
  GVG_054: { flags: ['misdirect'] },
  GVG_065: { flags: ['misdirect'] },
  GVG_066: { keywords: ['WINDFURY'], overload: 1, flags: ['misdirect'] },
  GVG_088: { keywords: ['STEALTH'], flags: ['misdirect'] },
  // 鋼鐵破滅邪神：戰吼與亡語：把一張地雷洗入對手的牌堆（抽到時受到 10 點傷害）
  GVG_056: {
    abilities: [...play({ e: 'shuffle', card: 'GVG_056t', count: 1, who: 'opponent' }), ...dr({ e: 'shuffle', card: 'GVG_056t', count: 1, who: 'opponent' })],
    tokens: ['GVG_056t'],
  },
  GVG_056t: { castsWhenDrawn: true, abilities: play({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 10 }) },
  // 軍需官：戰吼：你的白銀之手新兵 +2/+2
  GVG_060: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', nameIncludes: 'Silver Hand Recruit' } }, atk: 2, hp: 2 }) },
  // 伯瓦爾‧弗塔根：在你的手牌中時，每有一個友方手下死亡，獲得 +1 攻擊力
  GVG_063: { handAbilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('growInHand', { atk: 1, hp: 0 })] }] },
  // 眼鏡蛇射擊：對一個手下與敵方英雄各造成 3 點傷害
  GVG_073: { target: chosenMinion, abilities: play(hit(3), { e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 3, spell: true }) },
  // 凱贊秘術使：戰吼：取得一個隨機敵方奧秘的控制權
  GVG_074: { abilities: play(fn('kezan')) },
  // 憎惡魔像：在每個回合結束時，若這是你唯一的手下，消滅它
  GVG_077: { abilities: [{ on: { k: 'turnEnd', whose: 'each' }, cond: { c: 'not', cond: { c: 'control' } }, effects: [{ e: 'destroy', target: { t: 'self' } }] }] },
  // 機械雪人：亡語：雙方各獲得一張零件
  GVG_078: { abilities: dr(fn('addSparePart', { who: 'both' })), tokens: SPARE_PARTS },
  // 尖牙德魯伊：戰吼：若你控制野獸，變成 7/7
  GVG_080: { abilities: playIf({ c: 'control', race: 'BEAST' }, { e: 'transform', target: { t: 'self' }, card: 'GVG_080t' }), tokens: ['GVG_080t'] },
  // 發條地精：亡語：把一張零件加入你的手牌
  GVG_082: { abilities: dr(fn('addSparePart')), tokens: SPARE_PARTS },
  // 攻城機具：每當你獲得護甲值，此手下 +1 攻擊力
  GVG_086: { abilities: [{ on: { k: 'armorGained' }, effects: [selfBuff(1, 0)] }] },
  // 熱砂狙擊手：你的英雄能力可以指定手下為目標
  GVG_087: { flags: ['heroPowerTargetMinions'] },
  // 光明引路者：在你的回合結束時，若你控制奧秘，為你的英雄恢復 4 點生命值
  GVG_089: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, cond: { c: 'secret' }, effects: [{ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 4 }] }] },
  // 地精實驗家：戰吼：抽一張牌；若是手下，把它變成一隻雞
  GVG_092: { abilities: play(fn('experimenter', { card: 'GVG_092t' })), tokens: ['GVG_092t'] },
  // 吉福斯：在每位玩家的回合結束時，那位玩家抽牌直到有 3 張手牌
  GVG_094: { abilities: [{ on: { k: 'turnEnd', whose: 'each' }, effects: [fn('drawUntil', { n: 3, current: true })] }] },
  // 哥布林工兵：在對手有 6 張以上手牌時 +4 攻擊力
  GVG_095: { atkIf: { cond: { c: 'handSize', op: '>=', n: 6, side: 'enemy' }, atk: 4 } },
  // 小小驅魔者：嘲諷；戰吼：每有一個敵方亡語手下，獲得 +1/+1
  GVG_097: {
    keywords: ['TAUNT'],
    abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'enemyDeathrattleMinions' }, hp: { dyn: 'enemyDeathrattleMinions' } }),
  },
  // 血色淨化者：戰吼：對所有亡語手下造成 2 點傷害
  GVG_101: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', hasDeathrattle: true } }, amount: 2 }) },
  // 地精區技師：戰吼：若你控制機械，獲得 +1/+1 並把一張零件加入手牌
  GVG_102: { abilities: playIf({ c: 'control', race: 'MECHANICAL' }, selfBuff(1, 1), fn('addSparePart')), tokens: SPARE_PARTS },
  // 大哥布林：每當你打出攻擊力 1 的手下，賦予它 +2/+2
  GVG_104: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itAttack', n: 1 }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2, hp: 2 }] }] },
  // 強化機器人：戰吼：隨機賦予你的其他手下風怒、嘲諷或聖盾
  GVG_107: { abilities: play(fn('enhanceO')) },
  // 重組轉化師：戰吼：把一個友方手下變成隨機一個消耗相同的手下
  GVG_108: { target: friendlyOther, abilities: play({ e: 'evolve', target: { t: 'chosen' }, amount: 0 }) },
  // 爆爆博士：戰吼：召喚兩個 1/1 爆爆機器人
  GVG_110: { abilities: play(summon('GVG_110t', 2)), tokens: ['GVG_110t'] },
  GVG_110t: { abilities: dr(fn('randomDamage', { min: 1, max: 4 })) },
  // 彌米倫之首：在你的回合開始時，若你有至少 3 個機械，消滅它們並組成 V-07-TR-0N
  GVG_111: { abilities: atStartOfTurn(fn('mimiron', { card: 'GVG_111t' })), tokens: ['GVG_111t'] },
  GVG_111t: { keywords: ['CHARGE', 'MEGA_WINDFURY'] },
  // 巨魔莫古：所有手下有 50% 機率攻擊錯誤的敵人
  GVG_112: { flags: ['allMisdirect'] },
  // 敵人收割者4000：同時傷害被攻擊者兩側的手下
  GVG_113: { keywords: ['CLEAVE'] },
  // 托斯利：戰吼與亡語：把一張零件加入你的手牌
  GVG_115: { abilities: [...play(fn('addSparePart')), ...dr(fn('addSparePart'))], tokens: SPARE_PARTS },
  // 加茲魯維：每當你施放 1 費法術，隨機把一張機械加入你的手牌
  GVG_117: {
    abilities: [
      { on: { k: 'spellCast', side: 'friendly' }, cond: { c: 'itCost', n: 1 }, effects: [{ e: 'addRandom', pool: { type: 'MINION', race: 'MECHANICAL', anyClass: true }, count: 1, who: 'self' }] },
    ],
  },
  // 布靈登3000型：戰吼：雙方各裝備一把隨機武器
  GVG_119: { abilities: play(fn('blingtron')) },

  // ==========================================================================
  // 冰封王座的騎士
  // ==========================================================================
  // 幽靈掠劫者：戰吼：獲得等同你武器的數值
  ICC_018: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'weaponAttack' }, hp: { dyn: 'weaponDurability' } }) },
  // 骷髏術師：亡語：若在對手的回合，召喚一個 8/8 骷髏
  ICC_019: { abilities: dr({ e: 'cond', cond: { c: 'opponentTurn' }, then: [summon('ICC_019t')] }), tokens: ['ICC_019t'] },
  // 喀喀搗蛋鬼：戰吼：召喚一個 5/5 骷髏；亡語：為對手召喚一個
  ICC_025: { abilities: [...play(summon('ICC_025t')), ...dr(summon('ICC_025t', 1, 'opponent'))], tokens: ['ICC_025t'] },
  // 褻瀆：對所有手下造成 1 點傷害；若有手下死亡，再施放一次
  ICC_041: { abilities: play(fn('repeatAoe', { amount: 1 })) },
  // 織網：召喚兩隻 1/2 劇毒蜘蛛
  ICC_050: { abilities: play(summon('ICC_832t3', 2)), tokens: ['ICC_832t3'] },
  // 裝死：觸發一個友方手下的亡語
  ICC_052: { target: friendlyMinion, abilities: play(fn('triggerDeathrattle', { times: 1 })) },
  // 散播瘟疫：召喚一隻 1/5 嘲諷甲蟲；若對手的手下比較多，再施放一次
  ICC_054: { abilities: play(fn('spreadingPlague', { card: 'ICC_832t4' })), tokens: ['ICC_832t4'] },
  // 冰行者：你的英雄能力也會凍結目標
  ICC_068: { flags: ['heroPowerFreeze'] },
  // 恐魂咒術師：戰吼：把一張鏡像加入你的手牌
  ICC_069: { abilities: play({ e: 'addCard', card: 'CS2_027', count: 1, who: 'self' }), tokens: ['CS2_027'] },
  // 聖光之憂：在友方手下失去聖盾後，獲得 +1 攻擊力
  ICC_071: { abilities: [{ on: { k: 'shieldLost', side: 'friendly' }, effects: [{ e: 'weaponBuff', atk: 1 }] }] },
  // 死後的學徒：對手的法術消耗增加 (1)
  ICC_083: { costAuras: [{ side: 'enemy', type: 'SPELL', add: 1 }] },
  // 終極瘟疫：造成 5 點傷害，抽 5 張牌，獲得 5 點護甲值，召喚一個 5/5 食屍鬼
  ICC_085: {
    target: anyChar,
    abilities: play(hit(5), { e: 'draw', count: 5, who: 'self' }, { e: 'armor', amount: 5 }, summon('ICC_085t')),
    tokens: ['ICC_085t'],
  },
  // 冰川之謎：把牌堆中每種奧秘各一個放到戰場上
  ICC_086: { abilities: play(fn('secretsFromDeck', { all: true })) },
  // 雪怒巨人：本場對戰中你每超載一個法力水晶，消耗減少 (1)
  ICC_090: { costRule: { per: 'overloadedThisGame', amount: 1 } },
  // 亡者之手：把你手牌的複製洗入你的牌堆
  ICC_091: { abilities: play(fn('deadMansHand')) },
  // 巨牙漁夫：戰吼：賦予一個友方手下法術傷害 +1
  ICC_093: { target: friendlyOther, abilities: play(fn('gainSpellDamage', { chosen: true })) },
  // 火爐巨屍：戰吼：棄掉手牌中的所有武器，獲得它們的數值
  ICC_096: { abilities: play(fn('furnacefire')) },
  // 墓地跛行者：每當你的武器被摧毀，獲得 +1/+1
  ICC_097: { abilities: [{ on: { k: 'weaponDestroyed', side: 'friendly' }, effects: [selfBuff(1, 1)] }] },
  // 墓穴潛伏者：戰吼：把本場對戰中死亡的隨機亡語手下加入你的手牌
  ICC_098: { abilities: play(fn('addFromGraveyard', { deathrattle: true })) },
  // 眼鏡蛇陷阱：秘密：當你的手下被攻擊時，召喚一隻 2/3 劇毒眼鏡蛇
  ICC_200: { ...secretOn('minionAttacked', summon('EX1_170')), tokens: ['EX1_170'] },
  // 撿骨：抽一張牌；若有亡語，再施放一次
  ICC_201: { abilities: play(fn('rollTheBones')) },
  // 普崔希德教授：在你打出奧秘後，把一個隨機獵人奧秘放到戰場上
  ICC_204: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'SPELL' }, cond: { c: 'itSecret' }, effects: [fn('randomSecret', { cls: 'HUNTER' })] }] },
  // 不懷好意：把一個友方手下給對手
  ICC_206: { target: friendlyMinion, abilities: play(fn('giveToOpponent')) },
  // 啃食心智：複製對手牌堆中的 3 張卡
  ICC_207: { abilities: play(fn('copyFromOppDeck', { count: 3 })) },
  // 無盡奴役：發現一個本場對戰中死亡的友方手下，召喚它
  ICC_213: { abilities: play(fn('discoverGraveyard', { summon: true })) },
  // 大主教本尼迪塔斯：戰吼：把對手牌堆的複製洗入你的牌堆
  ICC_215: { abilities: play(fn('benedictus')) },
  // 吸血毒藥：你的武器本回合具有生命竊取
  ICC_221: { abilities: play(fn('leechingPoison')) },
  // 毀力鏢：擲出你的武器造成傷害，再回到你的手牌
  ICC_233: { target: chosenMinion, abilities: play(fn('doomerang')) },
  // 暗影精華：召喚你牌堆中一個隨機手下的 5/5 複製
  ICC_235: { abilities: play(fn('barnes', { atk: 5, hp: 5 })) },
  // 破冰斧：消滅被它傷害的凍結手下
  ICC_236: { abilities: heroAttacked(fn('iceBreaker')) },
  // 符文熔爐魂屍：在你的回合，你的武器不會失去耐久度
  ICC_240: { flags: ['weaponNoWear'] },
  // 死屍寡婦蛛：你的亡語卡消耗減少 (2)
  ICC_243: { costAuras: [{ side: 'friendly', hasDeathrattle: true, add: -2 }] },
  // 拚死一搏：賦予一個手下「亡語：以 1 點生命值復活」
  ICC_244: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr(fn('resummonSelf', { hp: 1 })) }) },
  // 黑衛士：每當你的英雄被治療，對一個隨機敵方手下造成等量的傷害
  ICC_245: {
    abilities: [
      { on: { k: 'healed', subject: 'friendly' }, cond: { c: 'not', cond: { c: 'itIsMinion' } }, effects: [{ e: 'damage', target: randomEnemyMinion, amount: { dyn: 'eventAmount' } }] },
    ],
  },
  // 冰冷怨靈：戰吼：若有敵人被凍結，抽一張牌
  ICC_252: { abilities: playIf({ c: 'enemyFrozen' }, { e: 'draw', count: 1, who: 'self' }) },
  // 馭屍者：戰吼：賦予一個友方手下「亡語：重新召喚此手下」
  ICC_257: { target: friendlyOther, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr(fn('resummonSelf')) }) },
  // 慕拉比：每當另一個手下被凍結，把它的複製加入你的手牌
  ICC_289: { flags: ['copyFrozen'] },
  // 巫妖王：嘲諷；在你的回合結束時，隨機把一張巫妖王卡加入你的手牌
  ICC_314: { keywords: ['TAUNT'], abilities: atEndOfTurn(fn('addOneOf', { cards: LICH_KING_CARDS })), tokens: LICH_KING_CARDS },
  // 巫妖王卡
  ICC_314t1: { abilities: dr(fn('frostmourne')) },
  ICC_314t2: { abilities: play(fn('armyOfFrozenThrone')) },
  ICC_314t3: { abilities: play(fn('doomPact')) },
  ICC_314t4: { abilities: play(fn('deathGrip')) },
  ICC_314t5: { target: anyChar, abilities: play(fn('deathCoil')) },
  ICC_314t6: { target: chosenMinion, abilities: play(fn('obliterate')) },
  ICC_314t7: { abilities: play({ e: 'buff', target: allFriendly, atk: 2, hp: 2, keywords: ['ELUSIVE'] }) },
  ICC_314t8: { abilities: play({ e: 'damage', target: allEnemies, amount: 3, spell: true }) },
  // 吸血地精：戰吼：移除對手牌堆頂的一張牌
  ICC_407: { abilities: play(fn('millTop', { who: 'opponent', count: 1 })) },
  // 縫合追蹤者：戰吼：發現你牌堆中一個手下的複製
  ICC_415: { abilities: play(fn('discoverFromDeck', { type: 'MINION', copy: true })) },
  // 死魂亡魄：戰吼：每有一個受傷的手下，獲得 +1/+1
  ICC_450: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'damagedMinions' }, hp: { dyn: 'damagedMinions' } }) },
  // 非自願獻祭：選擇一個友方手下，消滅它與一個隨機敵方手下
  ICC_469: { target: friendlyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, { e: 'destroy', target: randomEnemyMinion }) },
  // 快樂食屍鬼：若你的英雄本回合被治療過，消耗為 (0)
  ICC_700: { costIf: { cond: { c: 'heroHealed' }, cost: 0 } },
  // 潛伏的魂屍：戰吼：摧毀雙方手牌與牌堆中所有 1 費法術
  ICC_701: { abilities: play(fn('skulkingGeist')) },
  // 奈幽破網者：法術消耗增加 (2)
  ICC_706: { costAuras: [{ side: 'both', type: 'SPELL', add: 2 }] },
  // 硬殼拾荒者：戰吼：賦予你的嘲諷手下 +2/+2
  ICC_807: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', keyword: 'TAUNT' } }, atk: 2, hp: 2 }) },
  // 亡斧懲戒者：戰吼：賦予手牌中一個隨機生命竊取手下 +2/+2
  ICC_810: { abilities: play(fn('handBuffKeyword', { keyword: 'LIFESTEAL', atk: 2, hp: 2 })) },
  // 莉莉安‧佛斯：戰吼：把手牌中的法術換成隨機法術（對手的職業）
  ICC_811: { abilities: play(fn('lilianVoss')) },
  // 血屍戰車：亡語：從牌堆召喚一個攻擊力比此手下低的手下
  ICC_812: { abilities: dr(fn('recruitLessAtk')) },
  // 幻象分體：複製手牌中消耗最低的手下
  ICC_823: { abilities: play(fn('simulacrum')) },
  // 縫合怪弓箭手：亡語：召喚本場對戰中死亡的隨機友方野獸
  ICC_825: { abilities: dr(fn('resurrectRandom', { count: 1, race: 'BEAST' })) },
  // 哈卓諾克斯：亡語：召喚本場對戰中死亡的友方嘲諷手下
  ICC_835: { abilities: dr(fn('summonDead', { keyword: 'TAUNT' })) },
  // 放馬過來！：獲得 10 點護甲值，對手手牌中的手下消耗減少 (2)
  ICC_837: { abilities: play({ e: 'armor', amount: 10 }, fn('discountOppMinions', { amount: 2 })) },
  // 血腥女王菈娜薩爾：生命竊取；本場對戰中你每棄掉一張牌 +1 攻擊力
  ICC_841: { keywords: ['LIFESTEAL'], atkPer: { dyn: 'discardedThisGame' } },
  // 擁抱黑暗：選擇一個敵方手下，在你的回合開始時控制它
  ICC_849: { target: enemyMinion, abilities: play(fn('stealAtNextTurn')) },
  // 暗影之刃：戰吼：你的英雄本回合免疫
  ICC_850: { abilities: play(fn('heroImmune')) },
  // 凱雷希斯親王：戰吼：若牌堆沒有 2 費的卡，牌堆中所有手下 +1/+1
  ICC_851: { abilities: playIf({ c: 'deckNoCost', n: 2 }, fn('buffHandAndDeck', { atk: 1, hp: 1, deckOnly: true })) },
  // 泰爾達朗親王：戰吼：若牌堆沒有 3 費的卡，變成一個手下的 3/3 複製
  ICC_852: {
    target: optional({ type: 'minion', side: 'any', excludeSelf: true }, { c: 'deckNoCost', n: 3 }),
    abilities: playIf({ c: 'deckNoCost', n: 3 }, fn('becomeCopy', { atk: 3, hp: 3 })),
  },
  // 瓦拉納爾親王：戰吼：若牌堆沒有 4 費的卡，獲得生命竊取與嘲諷
  ICC_853: { abilities: playIf({ c: 'deckNoCost', n: 4 }, selfBuff(0, 0, ['LIFESTEAL', 'TAUNT'])) },
  // 阿福斯：亡語：隨機把一張巫妖王卡加入你的手牌
  ICC_854: { abilities: dr(fn('addOneOf', { cards: LICH_KING_CARDS })), tokens: LICH_KING_CARDS },
  // 『龍焰之血』伯瓦爾：聖盾；在友方手下失去聖盾後，獲得 +2 攻擊力
  ICC_858: { keywords: ['DIVINE_SHIELD'], abilities: [{ on: { k: 'shieldLost', side: 'friendly' }, effects: [selfBuff(2, 0)] }] },
  // 亡域魂屍：每當你的其他手下死亡，召喚一個 2/2 食屍鬼
  ICC_900: { abilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [summon('ICC_900t')] }], tokens: ['ICC_900t'] },
  // 德拉克瑞附魔師：你的回合結束效果觸發兩次
  ICC_901: { flags: ['doubleEndTurn'] },
  // 心靈破壞者：英雄能力無法使用
  ICC_902: { flags: ['noHeroPowers'] },
  // 壞壞骷髏：戰吼：本回合每有一個手下死亡，獲得 +1/+1
  ICC_904: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'deathsThisTurn' }, hp: { dyn: 'deathsThisTurn' } }) },
  // 鬼靈掠取者：連擊：你本回合每打出過一張其他牌，對一個手下造成 2 點傷害
  ICC_910: {
    target: optional({ type: 'character', side: 'any' }, { c: 'combo' }),
    abilities: play({ e: 'cond', cond: { c: 'combo' }, then: [{ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'cardsPlayedThisTurn', mult: 2, base: -2 } }] }),
  },
  // 悲泣女妖：每當你打出一張牌，移除你牌堆頂的 3 張牌
  ICC_911: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('millTop', { who: 'self', count: 3 })] }] },
  // 奪屍者：戰吼：牌堆中有嘲諷 / 聖盾 / 生命竊取 / 風怒手下時，獲得該關鍵字
  ICC_912: { abilities: play(fn('corpsetaker')) },

  // ==========================================================================
  // 狗頭人與地下城
  // ==========================================================================
  // 零件：逆向開關（對調一個手下的攻擊力與生命值）
  PART_006: { target: chosenMinion, abilities: play({ e: 'swapStats', target: { t: 'chosen' } }) },
  // 鏡像（恐魂咒術師會用到）：召喚兩個 0/2 嘲諷的鏡像
  CS2_027: { abilities: play(summon('CS2_mirror', 2)), tokens: ['CS2_mirror'] },
  // 心靈尖嘯：把所有手下洗入對手的牌堆
  LOOT_008: { abilities: play(fn('psychicScream')) },
  // 鉤臂劫奪者：戰吼：若你的生命值 15 以下，獲得 +3/+3 與嘲諷
  LOOT_018: { abilities: playIf({ c: 'heroHealth', op: '<=', n: 15 }, selfBuff(3, 3, ['TAUNT'])) },
  // 法多雷蛛行者：戰吼：把 3 張蜘蛛伏擊！洗入你的牌堆（抽到時召喚 4/4 蜘蛛）
  LOOT_026: { abilities: play({ e: 'shuffle', card: 'LOOT_026e', count: 3 }), tokens: ['LOOT_026e'] },
  LOOT_026e: { castsWhenDrawn: true, abilities: play(summon('LOOT_026t')), tokens: ['LOOT_026t'] },
  // 野蠻狗頭人：在你的回合開始時，攻擊一個隨機敵人
  LOOT_041: { abilities: atStartOfTurn(fn('attackRandomEnemy')) },
  // 法術石：在手牌中達成條件後升級
  // 紫晶：你的英雄在你的回合受到傷害
  LOOT_043: {
    keywords: ['LIFESTEAL'],
    target: chosenMinion,
    abilities: play(hit(3)),
    handAbilities: [{ on: { k: 'damaged', subject: 'friendlyHero' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, effects: [fn('upgradeInHand', { into: 'LOOT_043t2', need: 1 })] }],
    tokens: ['LOOT_043t2', 'LOOT_043t3'],
  },
  LOOT_043t2: {
    keywords: ['LIFESTEAL'],
    target: chosenMinion,
    abilities: play(hit(5)),
    handAbilities: [{ on: { k: 'damaged', subject: 'friendlyHero' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, effects: [fn('upgradeInHand', { into: 'LOOT_043t3', need: 1 })] }],
  },
  LOOT_043t3: { keywords: ['LIFESTEAL'], target: chosenMinion, abilities: play(hit(7)) },
  // 刀刃護手：攻擊力等同你的護甲值；無法攻擊英雄
  LOOT_044: { keywords: ['CANT_ATTACK_HEROES'], atkPer: { dyn: 'armor' } },
  // 鐵木魔像 / 寶石魔像：嘲諷；只有你至少有 3（5）點護甲值時才能攻擊
  LOOT_048: { keywords: ['TAUNT'], attackIf: { c: 'armor', n: 3 } },
  LOOT_365: { keywords: ['TAUNT'], attackIf: { c: 'armor', n: 5 } },
  // 尋找出路：選擇兩次——抽一張牌 / 你的手下 +1 攻擊力 / 獲得 6 點護甲值
  LOOT_054: { abilities: play(fn('branchingPaths')), tokens: BRANCHING_PATHS },
  LOOT_054b: { abilities: play({ e: 'buff', target: allFriendly, atk: 1 }) },
  LOOT_054c: { abilities: play({ e: 'armor', amount: 6 }) },
  LOOT_054d: { abilities: play({ e: 'draw', count: 1, who: 'self' }) },
  // 狗頭人隱士：戰吼：選擇一個基本圖騰召喚
  LOOT_062: { abilities: play(fn('totemicSlam')) },
  // 藍晶：超載 3 個法力水晶
  LOOT_064: {
    target: friendlyMinion,
    abilities: play({ e: 'summonCopy', target: { t: 'chosen' }, count: 1 }),
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('upgradeInHand', { into: 'LOOT_064t1', need: 3, overload: true })] }],
    tokens: ['LOOT_064t1', 'LOOT_064t2'],
  },
  LOOT_064t1: {
    target: friendlyMinion,
    abilities: play({ e: 'summonCopy', target: { t: 'chosen' }, count: 2 }),
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('upgradeInHand', { into: 'LOOT_064t2', need: 3, overload: true })] }],
  },
  LOOT_064t2: { target: friendlyMinion, abilities: play({ e: 'summonCopy', target: { t: 'chosen' }, count: 3 }) },
  // 遊蕩的怪物：秘密：當敵人攻擊你的英雄時，召喚一個 3 費手下作為新的目標
  LOOT_079: secretOn('heroAttacked', fn('redirectSummonRandom', { cost: 3 })),
  // 翡翠：打出奧秘
  LOOT_080: {
    abilities: play(summon('LOOT_077t', 2)),
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itSecret' }, effects: [fn('upgradeInHand', { into: 'LOOT_080t2', need: 1 })] }],
    tokens: ['LOOT_077t', 'LOOT_080t2', 'LOOT_080t3'],
  },
  LOOT_080t2: {
    abilities: play(summon('LOOT_077t', 3)),
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itSecret' }, effects: [fn('upgradeInHand', { into: 'LOOT_080t3', need: 1 })] }],
  },
  LOOT_080t3: { abilities: play(summon('LOOT_077t', 4)) },
  // 洛克德拉爾：戰吼：若你的牌堆沒有手下，用獵人法術填滿手牌
  LOOT_085: { abilities: playIf({ c: 'deckNoMinions' }, fn('fillHand', { pool: { type: 'SPELL', cls: 'HUNTER' } })) },
  // 爆炸符文：秘密：在對手打出手下後，對它造成 6 點傷害，多出的傷害打到敵方英雄
  LOOT_101: secretOn('enemyPlaysMinion', fn('explosiveRunes')),
  // 變幻卷軸：在你的手牌中時，每回合變成隨機一張法師法術
  LOOT_104: { cost: 1, handShift: { kind: 'randomSpell', cls: 'MAGE' } },
  // 驚奇套牌：把 5 張驚奇卷軸洗入你的牌堆（抽到時施放一個隨機法術）
  LOOT_106: { abilities: play({ e: 'shuffle', card: 'LOOT_106t', count: 5 }), tokens: ['LOOT_106t'] },
  LOOT_106t: { castsWhenDrawn: true, abilities: play(fn('castRandomSpell')) },
  // 黯黑龍匠：戰吼：手牌中一把隨機武器消耗減少 (2)
  LOOT_118: { abilities: play(fn('discountRandom', { type: 'WEAPON', amount: 2 })) },
  // 孤單的勇士：戰吼：若你沒有控制其他手下，獲得嘲諷與聖盾
  LOOT_124: { abilities: playIf({ c: 'not', cond: { c: 'control' } }, selfBuff(0, 0, ['TAUNT', 'DIVINE_SHIELD'])) },
  // 秘法暴君：若你本回合施放過消耗 5 以上的法術，消耗為 (0)
  LOOT_130: { costIf: { cond: { c: 'bigSpellThisTurn' }, cost: 0 } },
  // 守財龍：亡語：給對手兩枚幸運幣
  LOOT_144: { abilities: dr({ e: 'addCard', card: 'GAME_005', count: 2, who: 'opponent' }) },
  // 坑道蠕蟲：在你的手牌中時，每有一個手下死亡，消耗減少 (1)
  LOOT_149: { handAbilities: [{ on: { k: 'minionDied', side: 'any' }, effects: [fn('discountSelfInHand', { amount: 1 })] }] },
  // 索妮雅‧影舞者：在友方手下死亡後，把它的 1/1 複製加入你的手牌，其消耗為 (1)
  LOOT_165: { abilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('sonya')] }] },
  // 烏鴉魔寵：戰吼：雙方各揭露牌堆中的一張法術，你的消耗較高就抽出它
  LOOT_170: { abilities: play(fn('ravenFamiliar')) },
  // 火龍之怒：揭露牌堆中的一張法術，對全部手下造成等同其消耗的傷害
  LOOT_172: { abilities: play(fn('revealDamageAll', { type: 'SPELL' })) },
  // 暮光之喚：召喚 2 個本場死亡的友方亡語手下的 1/1 複製
  LOOT_187: { abilities: play(fn('twilightsCall')) },
  // 幻光逐夢馬：在對手的回合具有法術免疫
  LOOT_193: { flags: ['elusiveOnOppTurn'] },
  // 秘銀：裝備武器
  LOOT_203: {
    abilities: play(summon('LOOT_203t4', 1)),
    handAbilities: [{ on: { k: 'equip', side: 'friendly' }, effects: [fn('upgradeInHand', { into: 'LOOT_203t2', need: 1 })] }],
    tokens: ['LOOT_203t4', 'LOOT_203t2', 'LOOT_203t3'],
  },
  LOOT_203t2: {
    abilities: play(summon('LOOT_203t4', 2)),
    handAbilities: [{ on: { k: 'equip', side: 'friendly' }, effects: [fn('upgradeInHand', { into: 'LOOT_203t3', need: 1 })] }],
  },
  LOOT_203t3: { abilities: play(summon('LOOT_203t4', 3)) },
  // 巨龍之魂：在你一個回合施放 3 張法術後，召喚一隻 5/5 龍魂
  LOOT_209: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, cond: { c: 'spellsThisTurn', n: 3 }, effects: [summon('LOOT_209t')] }], tokens: ['LOOT_209t'] },
  // 臨陣倒戈：秘密：當手下攻擊你的英雄時，改為攻擊它的一個相鄰手下
  LOOT_210: secretOn('minionAttacksHero', fn('suddenBetrayal')),
  // 閃避：秘密：在你的英雄受到傷害後，本回合免疫
  LOOT_214: secretOn('heroDamaged', fn('heroImmune')),
  // 萊妮莎‧憂日：戰吼：把本場對戰中你對手下施放過的法術都施放在它身上
  LOOT_216: { abilities: play(fn('lynessa')) },
  // 來我身邊！：召喚一個動物夥伴；若你的牌堆沒有手下，召喚兩個
  LOOT_217: {
    abilities: play(fn('summonOneOf', { cards: ANIMAL_COMPANIONS }), { e: 'cond', cond: { c: 'deckNoMinions' }, then: [fn('summonOneOf', { cards: ANIMAL_COMPANIONS })] }),
    tokens: ANIMAL_COMPANIONS,
  },
  // 發狂的毛怪：在此手下攻擊英雄後，把它的複製加入你的手牌
  LOOT_218: { abilities: afterAttack({ hero: true }, { e: 'addCard', card: 'LOOT_218', count: 1, who: 'self' }) },
  // 射燭弓：你的英雄在攻擊時免疫
  LOOT_222: { flags: ['immuneAttacking'] },
  // 秘法工藝師：每當你施放法術，獲得等同其消耗的護甲值
  LOOT_231: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [{ e: 'armor', amount: { dyn: 'itCost' } }] }] },
  // 未鑑定的藥劑 / 盾牌 / 槌子：抽到時隨機變成一種版本
  LOOT_278: {
    target: chosenMinion,
    abilities: [...play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }), { on: { k: 'drawn' }, effects: [fn('identify', { cards: ['LOOT_278t1', 'LOOT_278t2', 'LOOT_278t3', 'LOOT_278t4'] })] }],
    tokens: ['LOOT_278t1', 'LOOT_278t2', 'LOOT_278t3', 'LOOT_278t4'],
  },
  LOOT_278t1: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2, keywords: ['LIFESTEAL'] }) },
  LOOT_278t2: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2, keywords: ['DIVINE_SHIELD'] }) },
  LOOT_278t3: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, fn('copyChosenStats', { atk: 1, hp: 1 })) },
  LOOT_278t4: {
    target: chosenMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2, abilities: dr({ e: 'addCopy', target: { t: 'self' }, count: 1 }) }),
  },
  LOOT_285: {
    abilities: [...play({ e: 'armor', amount: 5 }), { on: { k: 'drawn' }, effects: [fn('identify', { cards: ['LOOT_285t', 'LOOT_285t2', 'LOOT_285t3', 'LOOT_285t4'] })] }],
    tokens: ['LOOT_285t', 'LOOT_285t2', 'LOOT_285t3', 'LOOT_285t4'],
  },
  LOOT_285t: { abilities: play({ e: 'armor', amount: 15 }) },
  LOOT_285t2: { target: anyChar, abilities: play({ e: 'armor', amount: 5 }, hit(5)) },
  LOOT_285t3: { abilities: play({ e: 'armor', amount: 5 }, summon('LOOT_285t3t')), tokens: ['LOOT_285t3t'] },
  LOOT_285t4: { abilities: play({ e: 'armor', amount: 5 }, { e: 'equip', card: 'LOOT_285t4t' }), tokens: ['LOOT_285t4t'] },
  LOOT_286: {
    abilities: [{ on: { k: 'drawn' }, effects: [fn('identify', { cards: ['LOOT_286t1', 'LOOT_286t2', 'LOOT_286t3', 'LOOT_286t4'] })] }],
    tokens: ['LOOT_286t1', 'LOOT_286t2', 'LOOT_286t3', 'LOOT_286t4'],
  },
  LOOT_286t1: { abilities: play(summon('CS2_101t', 2)) },
  LOOT_286t2: { abilities: play({ e: 'buff', target: allFriendly, keywords: ['TAUNT'] }) },
  LOOT_286t3: { abilities: play({ e: 'buff', target: allFriendly, atk: 1 }) },
  LOOT_286t4: { abilities: play({ e: 'buff', target: allFriendly, keywords: ['DIVINE_SHIELD'] }) },
  // 橡木之喚：獲得 6 點護甲值，從牌堆召喚一個消耗 4 以下的手下
  LOOT_309: { abilities: play({ e: 'armor', amount: 6 }, { e: 'recruit', count: 1, maxCost: 4 }) },
  // 水晶獅：聖盾；你每控制一個白銀之手新兵，消耗減少 (1)
  LOOT_313: { keywords: ['DIVINE_SHIELD'], costRule: { per: 'recruits', amount: 1 } },
  // 等級提升！：你的白銀之手新兵 +2/+2 並獲得嘲諷
  LOOT_333: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', nameIncludes: 'Silver Hand Recruit' } }, atk: 2, hp: 2, keywords: ['TAUNT'] }) },
  // 原始咒符：賦予你的手下「亡語：隨機召喚一個基本圖騰」
  LOOT_344: { abilities: play({ e: 'buff', target: allFriendly, abilities: dr(fn('summonOneOf', { cards: ['CS2_050', 'CS2_051', 'NEW1_009', 'CS2_052'] })) }) },
  // 靈能刺探：複製對手牌堆中的一張法術
  LOOT_353: { abilities: play(fn('copyFromOppDeck', { count: 1, type: 'SPELL' })) },
  // 老狐狸馬林：戰吼：為對手召喚一個 0/8 大寶箱（打破可以獲得寶藏）
  LOOT_357: { abilities: play(summon('LOOT_357l', 1, 'opponent')), tokens: ['LOOT_357l'] },
  LOOT_357l: { abilities: dr(fn('addOneOf', { cards: TREASURES, who: 'opponent' })), tokens: TREASURES },
  LOOT_998h: { abilities: play(fn('tolinsGoblet')) },
  LOOT_998j: { abilities: play(fn('zarogsCrown')) },
  LOOT_998k: { keywords: ['TAUNT'], abilities: play(fn('goldenKobold')) },
  LOOT_998l: { abilities: play(fn('drawSetCost', { count: 3, cost: 1 })) },
  // 『世界震動者』葛蘭柏：戰吼：你的其他手下回到手牌，消耗為 (1)
  LOOT_358: { abilities: play(fn('grumble')) },
  // 魯莽揮舞：花掉所有護甲值，對全部手下造成等量的傷害
  LOOT_364: { abilities: play(fn('recklessFlurry')) },
  // 虛無領主：嘲諷；亡語：召喚三個 1/3 嘲諷惡魔
  LOOT_368: { keywords: ['TAUNT'], abilities: dr(summon('CS2_065', 3)), tokens: ['CS2_065'] },
  // 治癒之雨：隨機分配 12 點治療給友方角色
  LOOT_373: { abilities: play(fn('splitHeal', { amount: 12 })) },
  // 狗頭人武僧：你的英雄具有法術免疫
  LOOT_382: { flags: ['heroElusive'] },
  // 四處翻找的狗頭人：戰吼：把一把你被摧毀的武器放回手牌
  LOOT_389: { abilities: play(fn('rummagingKobold')) },
  // 狗頭人幻術師：亡語：召喚手牌中一個手下的 1/1 複製
  LOOT_412: { abilities: dr(fn('koboldIllusionist')) },
  // 古卷總管：在你的回合結束時，施放牌堆中的一張法術（目標隨機）
  LOOT_414: { abilities: atEndOfTurn(fn('castFromDeck')) },
  // 首席門徒琳恩：嘲諷；亡語：把第一封印加入你的手牌
  LOOT_415: { keywords: ['TAUNT'], abilities: dr({ e: 'addCard', card: 'LOOT_415t1', count: 1, who: 'self' }), tokens: ['LOOT_415t1'] },
  LOOT_415t1: { abilities: play(summon('LOOT_415t1t'), { e: 'addCard', card: 'LOOT_415t2', count: 1, who: 'self' }), tokens: ['LOOT_415t1t', 'LOOT_415t2'] },
  LOOT_415t2: { abilities: play(summon('LOOT_415t2t'), { e: 'addCard', card: 'LOOT_415t3', count: 1, who: 'self' }), tokens: ['LOOT_415t2t', 'LOOT_415t3'] },
  LOOT_415t3: { abilities: play(summon('LOOT_415t3t'), { e: 'addCard', card: 'LOOT_415t4', count: 1, who: 'self' }), tokens: ['LOOT_415t3t', 'LOOT_415t4'] },
  LOOT_415t4: { abilities: play(summon('LOOT_415t4t'), { e: 'addCard', card: 'LOOT_415t5', count: 1, who: 'self' }), tokens: ['LOOT_415t4t', 'LOOT_415t5'] },
  LOOT_415t5: { abilities: play(summon('LOOT_415t5t'), { e: 'addCard', card: 'LOOT_415t6', count: 1, who: 'self' }), tokens: ['LOOT_415t5t', 'LOOT_415t6'] },
  LOOT_415t6: { abilities: play(fn('destroyDeck')) },
  // 大災變：消滅所有手下，棄掉 2 張牌
  LOOT_417: { abilities: play({ e: 'destroy', target: { t: 'all', filter: { type: 'minion' } } }, { e: 'discard', count: 2 }) },
  // 曼那瑞之顱：在你的回合開始時，從你的手牌召喚一個惡魔
  LOOT_420: { abilities: atStartOfTurn(fn('summonFromHand', { race: 'DEMON' })) },
  // 瓦蘭尼珥：亡語：賦予手牌中一個手下 +4/+2，它死亡時重新裝備這把武器
  LOOT_500: { abilities: dr(fn('valanyr')) },
  // 符文之矛：在你的英雄攻擊後，發現一張法術並以隨機目標施放
  LOOT_506: { abilities: heroAttacked(fn('discoverCast')) },
  // 白鑽：施放 4 張法術
  LOOT_507: {
    abilities: play(fn('resurrectRandom', { count: 2, distinct: true })),
    handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('upgradeInHand', { into: 'LOOT_507t', need: 4 })] }],
    tokens: ['LOOT_507t', 'LOOT_507t2'],
  },
  LOOT_507t: {
    abilities: play(fn('resurrectRandom', { count: 3, distinct: true })),
    handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('upgradeInHand', { into: 'LOOT_507t2', need: 4 })] }],
  },
  LOOT_507t2: { abilities: play(fn('resurrectRandom', { count: 4, distinct: true })) },
  // 蛇髮佐菈：戰吼：選擇一個友方手下，把它的（金色）複製加入你的手牌
  LOOT_516: { target: friendlyOther, abilities: play(fn('copyStatsToHand')) },
  // 低語元素：戰吼：你本回合的下一個戰吼觸發兩次
  LOOT_517: { abilities: play(fn('doubleBattlecry')) },
  // 風剪風暴召喚者：戰吼：若你控制全部 4 種基本圖騰，召喚『馭風者』奧拉基爾
  LOOT_518: { abilities: play(fn('stormcaller', { card: 'NEW1_010' })), tokens: ['NEW1_010'] },
  // 地塑師伊普：在你的回合結束時，召喚一個消耗等同你護甲值的隨機手下
  LOOT_519: { abilities: atEndOfTurn(fn('summonCostArmor')) },
  // 滲流軟泥怪：戰吼：獲得牌堆中一個隨機手下的亡語
  LOOT_520: { abilities: play(fn('seepingOozeling')) },
  // 夾牆機關：消滅對手最左邊與最右邊的手下
  LOOT_522: { abilities: play(fn('crushingWalls')) },
  // 無邊黑暗：一開始處於休眠；戰吼：把 3 張黑暗蠟燭洗入對手的牌堆，抽到時喚醒它
  LOOT_526: {
    abilities: play(selfBuff(0, 0, ['DORMANT']), { e: 'shuffle', card: 'LOOT_526t', count: 3, who: 'opponent' }),
    tokens: ['LOOT_526t'],
  },
  LOOT_526t: { castsWhenDrawn: true, abilities: play(fn('awakenDarkness', { card: 'LOOT_526' })) },
  // 暮光侍僧：戰吼：若你手中有龍，與另一個手下交換攻擊力
  LOOT_528: {
    target: optional({ type: 'minion', side: 'any', excludeSelf: true }, { c: 'holding', race: 'DRAGON' }),
    abilities: playIf({ c: 'holding', race: 'DRAGON' }, fn('swapAtk')),
  },
  // 喚龍者阿蘭娜：戰吼：本場對戰中你每施放一張消耗 5 以上的法術，召喚一隻 5/5 火龍
  LOOT_535: { abilities: play({ e: 'repeat', times: { dyn: 'bigSpellsThisGame' }, effects: [summon('LOOT_535t')] }), tokens: ['LOOT_535t'] },
  // 地脈操縱者：戰吼：手牌中不是一開始就在牌堆裡的卡消耗減少 (2)
  LOOT_537: { abilities: play(fn('leyline')) },
  // 坦普拉斯：戰吼：對手進行兩個回合，然後你進行兩個回合
  LOOT_538: { abilities: play(fn('temporus')) },
  // 惡毒的召喚師：戰吼：揭露牌堆中的一張法術，召喚一個消耗相同的隨機手下
  LOOT_539: { abilities: play(fn('spitefulSummoner')) },
  // 托戈瓦哥國王：戰吼：與對手交換牌堆，給他一張可以換回來的國王的贖金
  LOOT_541: { abilities: play(fn('swapDecks', { ransom: 'LOOT_541t' })), tokens: ['LOOT_541t'] },
  LOOT_541t: { abilities: play(fn('swapDecks')) },
  // 王禍：保留加成；亡語：把這把武器洗入你的牌堆
  LOOT_542: { abilities: dr(fn('kingsbane')) },

  // ==========================================================================
  // 奧丹姆
  // ==========================================================================
  // 偉大的賽佛瑞斯：戰吼：若你的牌堆沒有重複的卡，許願得到一張完美的卡
  ULD_003: { abilities: playIf({ c: 'noDuplicates' }, fn('zephrys')) },
  // 任務：達成目標後獲得獎勵
  ULD_131: { quest: { kind: 'unspentTurn', goal: 4, reward: 'ULD_131p' } },
  ULD_140: { quest: { kind: 'draw', goal: 20, reward: 'ULD_140p' } },
  ULD_155: { quest: { kind: 'summon', goal: 20, reward: 'ULD_155p' } },
  ULD_291: { quest: { kind: 'battlecry', goal: 6, reward: 'ULD_291p' } },
  ULD_326: { quest: { kind: 'otherClassCard', goal: 4, reward: 'ULD_326p' } },
  ULD_431: { quest: { kind: 'reborn', goal: 5, reward: 'ULD_431p' } },
  ULD_433: { quest: { kind: 'spell', goal: 10, reward: 'ULD_433p' } },
  ULD_711: { quest: { kind: 'heroAttack', goal: 5, reward: 'ULD_711p3' } },
  ULD_724: { quest: { kind: 'heal', goal: 15, reward: 'ULD_724p' } },
  ULD_326t: { flags: ['immuneAttacking'] },
  // 水晶商人：若你在回合結束時還有沒用完的法力，抽一張牌
  ULD_133: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, cond: { c: 'unspentMana' }, effects: [{ e: 'draw', count: 1, who: 'self' }] }] },
  // 有蜜蜂！：選擇一個手下，召喚四隻 1/1 蜜蜂攻擊它
  ULD_134: { target: chosenMinion, abilities: play(fn('summonAttackChosen', { card: 'ULD_134t', count: 4 })), tokens: ['ULD_134t'] },
  // 不虛此行：發現一張二選一卡
  ULD_136: { abilities: play({ e: 'discover', pool: { chooseOne: true } }) },
  // 園藝地精：戰吼：若你手中有消耗 5 以上的法術，召喚兩個 2/2 樹人
  ULD_137: { abilities: playIf({ c: 'holding', type: 'SPELL', minCost: 5 }, summon('ULD_137t', 2)), tokens: ['ULD_137t'] },
  // 阿努比薩斯防衛者：嘲諷；若你本回合施放過消耗 5 以上的法術，消耗為 (0)
  ULD_138: { keywords: ['TAUNT'], costIf: { cond: { c: 'bigSpellThisTurn' }, cost: 0 } },
  // 『啟迪者』伊莉絲：戰吼：若你的牌堆沒有重複的卡，複製你的手牌
  ULD_139: { abilities: playIf({ c: 'noDuplicates' }, fn('duplicateHand')) },
  // 蘭姆卡韓馴獸師：戰吼：複製手牌中一張隨機野獸
  ULD_151: { abilities: play(fn('copyRandomInHand', { race: 'BEAST' })) },
  // 恐龍馴服者布萊恩：戰吼：若你的牌堆沒有重複的卡，召喚克魯什王
  ULD_156: { abilities: playIf({ c: 'noDuplicates' }, summon('ULD_156t3')), tokens: ['ULD_156t3'] },
  ULD_156t3: { keywords: ['CHARGE'] },
  // 解任務的探險者：戰吼：若你有進行中的任務，抽一張牌
  ULD_157: { abilities: playIf({ c: 'questActive' }, { e: 'draw', count: 1, who: 'self' }) },
  // 邪惡交易：發現一張跟班
  ULD_160: { abilities: play(fn('discoverList', { cards: LACKEYS })), tokens: LACKEYS },
  // 邪惡陣線召募員：戰吼：消滅一個友方跟班，召喚一個 5/5 惡魔
  ULD_162: {
    target: optional({ type: 'minion', side: 'friendly', nameIncludes: 'Lackey' }),
    abilities: play(fn('evilRecruiter', { card: 'ULD_162t' })),
    tokens: ['ULD_162t'],
  },
  // 過期品商人：戰吼：棄掉你消耗最高的卡；亡語：把它的 2 張複製加入你的手牌
  ULD_163: { abilities: [...play(fn('discardHighest')), ...dr(fn('returnStash', { count: 2 }))] },
  // 惡魔斬隙者：戰吼：消滅一個手下，你的英雄受到等同其生命值的傷害
  ULD_165: { target: optional({ type: 'minion', side: 'any', excludeSelf: true }), abilities: play(fn('obliterate')) },
  // 黑暗法老特卡恩：戰吼：本場對戰剩下的時間，你的跟班是 4/4
  ULD_168: { abilities: play(fn('lackeys44')) },
  // 武裝黃蜂：戰吼：若你控制跟班，造成 3 點傷害
  ULD_170: {
    target: optional({ type: 'character', side: 'any' }, { c: 'control', nameIncludes: 'Lackey' }),
    abilities: playIf({ c: 'control', nameIncludes: 'Lackey' }, hit(3, false)),
  },
  // 魚人災禍：把所有手下變成隨機魚人
  ULD_172: { abilities: play({ e: 'transformRandom', target: { t: 'all', filter: { type: 'minion' } }, pool: { type: 'MINION', race: 'MURLOC' } }) },
  // 維斯娜：在你被超載時，你的其他手下 +2 攻擊力
  ULD_173: { auras: [{ scope: 'otherFriendly', atk: 2, cond: { c: 'overloaded' } }] },
  // 希亞梅特：戰吼：從突襲、嘲諷、聖盾、風怒中選擇兩種
  ULD_178: { abilities: play(fn('siamat')), tokens: SIAMAT_OPTIONS },
  ULD_178a: {},
  ULD_178a2: {},
  ULD_178a3: {},
  ULD_178a4: {},
  // 方陣兵指揮官：你的嘲諷手下 +2 攻擊力
  ULD_179: { auras: [{ scope: 'otherFriendly', keyword: 'TAUNT', atk: 2 }] },
  // 曬昏頭的嘍囉：在你的回合開始時，有 50% 機率睡著
  ULD_180: { abilities: atStartOfTurn(fn('fallAsleep')) },
  // 法老貓：戰吼：隨機把一張復生手下加入你的手牌
  ULD_186: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', keyword: 'REBORN' }, count: 1, who: 'self' }) },
  // 魔法幻象：嘲諷；在你的回合開始時，把此手下洗入你的牌堆
  ULD_198: { keywords: ['TAUNT'], abilities: atStartOfTurn(fn('shuffleSelf')) },
  // 狐狸人無賴：戰吼：發現一張法術，或選擇神秘選項
  ULD_209: { abilities: play(fn('vulpera')), tokens: ['ULD_209t'] },
  ULD_209t: {},
  // 野生血刺蠍：戰吼：從對手的手牌召喚一個手下，並攻擊它
  ULD_212: { abilities: play(fn('bloodstinger')) },
  // 慷慨的木乃伊：復生；對手的卡消耗減少 (1)
  ULD_214: { keywords: ['REBORN'], costAuras: [{ side: 'enemy', add: -1 }] },
  // 尤格薩倫的解謎箱：施放 10 個隨機法術（目標隨機）
  ULD_216: { abilities: play(fn('puzzleBox')) },
  // 淘氣鬼：戰吼：交換雙方牌堆頂的卡
  ULD_229: { abilities: play(fn('mischiefMaker')) },
  // 迴旋踢高手：每當你打出連擊牌，隨機把一張連擊牌加入你的手牌
  ULD_231: {
    abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itHasCombo' }, effects: [{ e: 'addRandom', pool: { combo: true }, count: 1, who: 'self' }] }],
  },
  // 托爾托朝聖者：戰吼：發現你牌堆中的一張法術，以隨機目標施放
  ULD_236: { abilities: play(fn('castFromDeck', { discover: true, copy: true })) },
  // 火焰機關：秘密：在手下攻擊你的英雄後，對全部敵方手下造成 3 點傷害
  ULD_239: secretOn('afterMinionAttacksHero', { e: 'damage', target: allEnemy, amount: 3, spell: true }),
  // 秘法轟炮師：在你打出奧秘後，對全部敵方手下造成 2 點傷害
  ULD_240: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'SPELL' }, cond: { c: 'itSecret' }, effects: [{ e: 'damage', target: allEnemy, amount: 2 }] }] },
  // 全力迎戰：賦予手牌中所有嘲諷手下 +2/+2
  ULD_256: { abilities: play(fn('handBuffKeyword', { keyword: 'TAUNT', atk: 2, hp: 2, all: true })) },
  // 末日犰狳：嘲諷；在你的回合結束時，賦予手牌中所有嘲諷手下 +2/+2
  ULD_258: { keywords: ['TAUNT'], abilities: atEndOfTurn(fn('handBuffKeyword', { keyword: 'TAUNT', atk: 2, hp: 2, all: true })) },
  // 高階祭司阿密特：每當你召喚手下，使其生命值等同此手下
  ULD_262: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('setItHealth')] }] },
  // 引魂者：戰吼：召喚本場對戰中死亡的隨機友方手下，並賦予復生
  ULD_268: { abilities: play(fn('resurrectRandom', { count: 1, reborn: true })) },
  // 卑劣的回收者：戰吼：消滅一個友方手下，再讓它以全滿的生命值復活
  ULD_269: { target: friendlyOther, abilities: play(fn('reincarnate')) },
  // 沙蹄背水工：在你的回合結束時，為一個受傷的友方角色恢復 5 點生命值
  ULD_270: { abilities: atEndOfTurn({ e: 'heal', target: { t: 'random', filter: { type: 'character', side: 'friendly', damaged: true }, count: 1 }, amount: 5 }) },
  // 邪惡圖騰：在你的回合結束時，把一張跟班加入你的手牌
  ULD_276: { abilities: atEndOfTurn(fn('addOneOf', { cards: LACKEYS })), tokens: LACKEYS },
  // 死亡魔影：選擇一個手下，把 3 張會召喚它複製的暗影洗入你的牌堆
  ULD_286: { target: chosenMinion, abilities: play(fn('shadowOfDeath', { card: 'ULD_286t' })), tokens: ['ULD_286t'] },
  ULD_286t: { castsWhenDrawn: true, abilities: play(fn('shadowSummon')) },
  // 『下葬者』安卡：戰吼：手牌中的亡語手下變成消耗 (1) 的 1/1
  ULD_288: { abilities: play(fn('anka')) },
  // 拋魚者：戰吼：雙方各隨機獲得一張魚人
  ULD_289: {
    abilities: play(
      { e: 'addRandom', pool: { type: 'MINION', race: 'MURLOC', anyClass: true }, count: 1, who: 'self' },
      { e: 'addRandom', pool: { type: 'MINION', race: 'MURLOC', anyClass: true }, count: 1, who: 'opponent' },
    ),
  },
  // 法歐瑞斯王：戰吼：手牌中每有一張法術，召喚一個消耗相同的隨機手下
  ULD_304: { abilities: play(fn('kingPhaoris')) },
  // 市集搶匪：突襲；戰吼：隨機把一張其他職業的手下加入你的手牌
  ULD_327: { keywords: ['RUSH'], abilities: play({ e: 'addRandom', pool: { type: 'MINION', otherClass: true }, count: 1, who: 'self' }) },
  // 巧妙偽裝：隨機把 2 張其他職業的法術加入你的手牌
  ULD_328: { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', otherClass: true }, count: 2, who: 'self' }) },
  // 緋紅織網者：戰吼：手牌中一張隨機野獸消耗減少 (5)
  ULD_410: { abilities: play(fn('discountRandom', { race: 'BEAST', amount: 5 })) },
  // 裂劈斧：戰吼：召喚你的圖騰的複製
  ULD_413: { abilities: play(fn('splittingAxe')) },
  // 獵人裝備：隨機把一張獵人野獸、奧秘與武器加入你的手牌
  ULD_429: {
    abilities: play(
      { e: 'addRandom', pool: { type: 'MINION', race: 'BEAST', cls: 'HUNTER' }, count: 1, who: 'self' },
      { e: 'addRandom', pool: { isSecret: true, cls: 'HUNTER' }, count: 1, who: 'self' },
      { e: 'addRandom', pool: { type: 'WEAPON', cls: 'HUNTER' }, count: 1, who: 'self' },
    ),
  },
  // 納迦沙巫：戰吼：手牌中法術的消耗變成 (5)
  ULD_435: { abilities: play(fn('setSpellCost', { cost: 5 })) },
  // 薩赫特的獅子：亡語：從牌堆抽兩張生命值 1 的手下
  ULD_438: { abilities: dr({ e: 'draw', count: 2, who: 'self', pool: { health: 1 } }) },
  // 沙漠爵士芬利：戰吼：若你的牌堆沒有重複的卡，發現一個強化後的英雄能力
  ULD_500: { abilities: playIf({ c: 'noDuplicates' }, fn('finley')) },
  // 沙漠方尖碑：若你在回合結束時控制 3 個沙漠方尖碑，對一個隨機敵人造成 5 點傷害
  ULD_703: {
    abilities: [
      {
        on: { k: 'turnEnd', whose: 'mine' },
        cond: { c: 'control', nameIncludes: 'Desert Obelisk', min: 2 },
        effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 5 }],
      },
    ],
  },
  // 魔古教徒：戰吼：若你的場上全是魔古教徒，獻祭它們召喚高階守護者拉
  ULD_705: { abilities: play(fn('moguCultist', { card: 'ULD_705t' })), tokens: ['ULD_705t'] },
  // 超顯眼的誘餌：亡語：雙方各從手牌召喚消耗最低的手下
  ULD_706: { abilities: dr(fn('blatantDecoy')) },
  // 導電長槍：在你的英雄攻擊後，把一張跟班加入你的手牌
  ULD_708: { abilities: heroAttacked(fn('addOneOf', { cards: LACKEYS })), tokens: LACKEYS },
  // 瘋狂災禍：雙方各裝備一把 2/2 劇毒匕首
  ULD_715: { abilities: play({ e: 'equip', card: 'ULD_715t' }, fn('equipOpponent', { card: 'ULD_715t' })), tokens: ['ULD_715t'] },
  ULD_715t: { keywords: ['POISONOUS'] },
  // 天降鰭兵：從你的牌堆召喚 7 個魚人
  ULD_716: { abilities: play({ e: 'recruit', count: 7, race: 'MURLOC' }) },
  // 火焰災禍：消滅你所有的手下，每消滅一個就消滅一個隨機敵方手下
  ULD_717: { abilities: play(fn('plagueOfFlames')) },
  // 死亡災禍：沉默並消滅所有手下
  ULD_718: { abilities: play(fn('plagueOfDeath')) },
  // 沙漠野兔：戰吼：召喚兩隻 1/1 沙漠野兔
  ULD_719: { abilities: play(summon('ULD_719', 2)) },
  // 血誓傭兵：戰吼：選擇一個受傷的友方手下，召喚它的複製
  ULD_720: { target: optional({ type: 'minion', side: 'friendly', damaged: true, excludeSelf: true }), abilities: play(fn('copyWithHealth')) },
  // 裹屍人：戰吼：發現一個本場對戰中死亡的友方手下，把它洗入你的牌堆
  ULD_727: { abilities: play(fn('discoverGraveyard', { shuffle: true })) },

  // ==========================================================================
  // 爆爆計畫
  // ==========================================================================
  // 磁力機械：打出在友方機械左邊時吸附上去
  BOT_020: { magnetic: true, keywords: ['RUSH'] },
  BOT_021: { magnetic: true, keywords: ['TAUNT'] },
  BOT_035: { magnetic: true, keywords: ['POISONOUS'] },
  BOT_107: { magnetic: true, abilities: atEndOfTurn({ e: 'damage', target: { t: 'all', filter: { type: 'character', excludeSelf: true } }, amount: 1 }) },
  BOT_237: { magnetic: true, keywords: ['ELUSIVE'] },
  BOT_251: { magnetic: true, abilities: dr({ e: 'destroy', target: randomEnemyMinion }) },
  BOT_312: { magnetic: true, abilities: dr(summon('BOT_312t', 3)), tokens: ['BOT_312t'] },
  BOT_548: { magnetic: true, keywords: ['DIVINE_SHIELD', 'TAUNT', 'LIFESTEAL', 'RUSH'] },
  BOT_563: { magnetic: true },
  BOT_700: { magnetic: true, keywords: ['ECHO'], abilities: dr(summon('BOT_312t', 2)), tokens: ['BOT_312t'] },
  BOT_906: { magnetic: true },
  BOT_911: { magnetic: true, keywords: ['DIVINE_SHIELD', 'TAUNT'] },
  // 煙火技師：戰吼：賦予一個友方機械 +1/+1，若它有亡語就觸發
  BOT_038: { target: optional({ type: 'minion', side: 'friendly', race: 'MECHANICAL', excludeSelf: true }), abilities: play(fn('fireworks')) },
  // 死靈技師：你的亡語觸發兩次
  BOT_039: { flags: ['doubleDeathrattle'] },
  // 武器研究計畫：雙方各裝備一把 2/3 武器並獲得 6 點護甲值
  BOT_042: {
    abilities: play({ e: 'equip', card: 'BOT_042t' }, fn('equipOpponent', { card: 'BOT_042t' }), { e: 'armor', amount: 6 }, { e: 'armor', amount: 6, who: 'opponent' }),
    tokens: ['BOT_042t'],
  },
  // 生物研究計畫：雙方各獲得 2 個法力水晶
  BOT_054: { abilities: play({ e: 'mana', kind: 'full', amount: 2 }, { e: 'mana', kind: 'full', amount: 2, who: 'opponent' }) },
  // 爆爆飛船：從手牌召喚 3 個隨機手下，賦予突襲
  BOT_069: { abilities: play(fn('summonFromHand', { count: 3, rush: true })) },
  // 學術間諜：把 10 張對手職業的卡洗入你的牌堆，消耗為 (1)
  BOT_087: { abilities: play(fn('academicEspionage')) },
  // 元素反應：抽一張牌；若你上回合打出元素，複製它
  BOT_093: { abilities: play({ e: 'draw', count: 1, who: 'self' }, { e: 'cond', cond: { c: 'playedElementalLastTurn' }, then: [{ e: 'addCopy', target: { t: 'it' }, count: 1 }] }) },
  // 動力不足的重擊者：只有你本回合施放過法術才能攻擊
  BOT_098: { attackIf: { c: 'spellsThisTurn', n: 1, atLeast: true } },
  // 有了！：召喚手牌中一個隨機手下的複製
  BOT_099: { abilities: play(fn('koboldIllusionist', { full: true })) },
  // 觀星者露娜：在你打出手牌最右邊的牌後，抽一張牌
  BOT_103: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'rightmost' }, effects: [{ e: 'draw', count: 1, who: 'self' }] }] },
  // 拋彈機器人：戰吼：隨機分配 5 點傷害給機械以外的所有手下
  BOT_104: { abilities: play({ e: 'splitDamage', filter: { type: 'minion', notRace: 'MECHANICAL' }, amount: 5 }) },
  // 額外的手臂：賦予一個手下 +2/+2，把「更多手臂！」加入你的手牌
  BOT_219: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, { e: 'addCard', card: 'BOT_219t', count: 1, who: 'self' }), tokens: ['BOT_219t'] },
  BOT_219t: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }) },
  // 靈魂炸彈：對一個手下與你的英雄各造成 4 點傷害
  BOT_222: { target: chosenMinion, abilities: play(hit(4), { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 4, spell: true }) },
  // 魔魂剋星：戰吼：你的英雄本回合每受到 1 點傷害，+1 攻擊力
  BOT_226: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'heroDamageThisTurn' } }) },
  // 縮小射線：將所有手下的攻擊力與生命值設為 1
  BOT_234: { abilities: play({ e: 'setStats', target: { t: 'all', filter: { type: 'minion' } }, atk: 1, hp: 1 }) },
  // 水晶工匠崗古：聖盾、生命竊取；你的治療加倍
  BOT_236: { keywords: ['DIVINE_SHIELD', 'LIFESTEAL'], flags: ['doubleHealing'] },
  // 麥菈的不穩定元素：抽完你的牌堆
  BOT_242: { abilities: play(fn('drawRest')) },
  // 麥菈‧腐泉：戰吼：發現一個亡語手下，並獲得它的亡語
  BOT_243: { abilities: play(fn('myraRotspring')) },
  // 風暴召喚儀：把你的手下變成隨機的傳說手下
  BOT_245: { abilities: play({ e: 'transformRandom', target: allFriendly, pool: { type: 'MINION', rarity: 'LEGENDARY' } }) },
  // 無法預期的成果：召喚兩個隨機的 2 費手下（受法術傷害提高）
  BOT_254: { abilities: play(fn('unexpectedResults')) },
  // 星術師：戰吼：召喚一個消耗等同你手牌數的隨機手下
  BOT_256: { abilities: play(fn('summonRandomCost', { count: 1, cost: { dyn: 'handSize' } })) },
  // 露娜的口袋銀河：你牌堆中手下的消耗變成 (1)
  BOT_257: { abilities: play(fn('setDeckCost', { cost: 1 })) },
  // 複製大師澤瑞克：亡語：若你對它施放過法術，讓它復活
  BOT_258: { abilities: dr(fn('resummonIfSpells')) },
  // 靈魂灌注：你手牌最左邊的手下 +2/+2
  BOT_263: { abilities: play(fn('buffLeftmost', { atk: 2, hp: 2 })) },
  // 有駕駛的收割者：亡語：從手牌召喚一個消耗 2 以下的隨機手下
  BOT_267: { abilities: dr(fn('summonFromHand', { maxCost: 2 })) },
  // 全像術師：在對手打出手下後，召喚它的 1/1 複製
  BOT_280: { abilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [fn('summonItCopy', { atk: 1, hp: 1 })] }] },
  // 蹦蹦兔：戰吼：本場每打出過一隻其他蹦蹦兔，+2/+2
  BOT_283: { abilities: play(fn('pogoHopper')) },
  // 死金刃：亡語：觸發一個隨機友方手下的亡語
  BOT_286: { abilities: dr(fn('triggerRandomDeathrattle')) },
  // 風暴追逐者：戰吼：從牌堆抽一張消耗 5 以上的法術
  BOT_291: { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL', minCost: 5 } }) },
  // 奧米伽組裝：發現一個機械；若你有 10 個法力水晶，三張都拿
  BOT_299: { abilities: play(fn('omegaAssembly')) },
  // 多汁的靈心瓜：從牌堆抽 7、8、9、10 費的手下各一張
  BOT_404: {
    abilities: play(
      ...[7, 8, 9, 10].map((cost): Effect => ({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION', cost } })),
    ),
  },
  // 超級對撞器：在你攻擊手下後，迫使它攻擊一個相鄰的手下
  BOT_406: { abilities: heroAttacked(fn('supercollider')) },
  // 雷雲元素：在你打出有超載的牌後，召喚兩個 1/1 衝刺火花
  BOT_407: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('ifItHasOverload', { then: [summon('BOT_102t', 2)] })] }], tokens: ['BOT_102t'] },
  // 伊雷特拉‧風暴怒濤：戰吼：你本回合的下一張法術施放兩次
  BOT_411: { abilities: play(fn('doubleSpell')) },
  // 超腦技師：戰吼：手牌中每有一張法術，+1 生命值
  BOT_413: { abilities: play({ e: 'buff', target: { t: 'self' }, hp: { dyn: 'spellsInHand' } }) },
  // 樹木學家：戰吼：若你控制樹人，發現一張法術
  BOT_419: { abilities: playIf({ c: 'control', nameIncludes: 'Treant' }, { e: 'discover', pool: { type: 'SPELL' } }) },
  // 夢境花栽培師：在你的回合結束時，手牌中一個隨機手下消耗減少 (7)
  BOT_423: { abilities: atEndOfTurn(fn('discountRandom', { type: 'MINION', amount: 7 })) },
  // 機神克蘇恩：亡語：若你的牌堆、手牌與戰場都沒有卡，消滅敵方英雄
  BOT_424: { abilities: dr({ e: 'cond', cond: { c: 'emptyEverything' }, then: [fn('destroyEnemyHero')] }) },
  // 弗拉克的爆爆火箭炮：從牌堆召喚 3 個手下，攻擊敵方手下後死亡
  BOT_429: { abilities: play(fn('boomZooka')) },
  // 莫莉根博士：亡語：與牌堆中的一個手下交換
  BOT_433: { abilities: dr(fn('drMorrigan')) },
  // 黏糊糊的弗洛普：變成你上一個打出的手下的 3/4 複製
  BOT_434: { abilities: play(fn('floop')) },
  // 複製裝置：發現對手牌堆中一個手下的複製
  BOT_435: { abilities: play(fn('discoverFromOppDeck')) },
  // 稜彩鏡片：抽一張手下與一張法術，交換它們的消耗
  BOT_436: { abilities: play(fn('prismaticLens')) },
  // 哥布林整人法：賦予友方手下 +3/+3 與突襲，它在回合結束時死亡
  BOT_437: { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3, keywords: ['RUSH'], abilities: [dieAtEndOfTurn] }) },
  // 機械改造晶片：賦予你的手下「亡語：隨機把一張機械加入你的手牌」
  BOT_438: { abilities: play({ e: 'buff', target: allFriendly, abilities: dr({ e: 'addRandom', pool: { type: 'MINION', race: 'MECHANICAL', anyClass: true }, count: 1, who: 'self' }) }) },
  // 弗洛普的神奇黏液：本回合每有手下死亡，回復一個法力水晶
  BOT_444: { abilities: play(fn('refreshOnDeath')) },
  // 黏液噴灑者：戰吼：召喚相鄰手下的複製
  BOT_507: { abilities: play(fn('copyAdjacent')) },
  // 死金藥劑：觸發一個友方手下的亡語兩次
  BOT_508: { target: friendlyMinion, abilities: play(fn('triggerDeathrattle', { times: 2 })) },
  // 爆鹽炸彈客：戰吼：把一顆炸彈洗入對手的牌堆（抽到時受到 5 點傷害）
  BOT_511: { abilities: play({ e: 'shuffle', card: 'BOT_511t', count: 1, who: 'opponent' }), tokens: ['BOT_511t'] },
  BOT_511t: { castsWhenDrawn: true, abilities: play({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 5 }) },
  // 顛顛倒倒：對調一個手下的攻擊力與生命值
  BOT_517: { cost: 0, target: chosenMinion, abilities: play({ e: 'swapStats', target: { t: 'chosen' } }) },
  // 煉魂術：召喚你控制的所有惡魔的複製
  BOT_521: { abilities: play(fn('summonCopiesRace', { race: 'DEMON' })) },
  // 堆肥吞食者：突襲；本場每有一個友方樹人死亡，消耗減少 (1)
  BOT_523: { keywords: ['RUSH'], costRule: { per: 'treantsDied', amount: 1 } },
  // 真言術：仿：選擇一個友方手下，召喚它的 5/5 複製
  BOT_529: { target: friendlyMinion, abilities: play(fn('emperorWraps', { atk: 5, hp: 5 })) },
  // 星界特使：戰吼：你本回合的下一張法術具有法術傷害 +2
  BOT_531: { abilities: play(fn('nextSpellPower', { amount: 2 })) },
  // 秘法魔腦：戰吼：發現一張消耗 5 以上的法術
  BOT_539: { abilities: play({ e: 'discover', pool: { type: 'SPELL', minCost: 5 } }) },
  // 奧米伽靈能者：戰吼：若你有 10 個法力水晶，你的法術本回合具有生命竊取
  BOT_543: { abilities: playIf({ c: 'maxMana', n: 10 }, fn('spellLifesteal')) },
  // 電能工匠：戰吼：若你手中有消耗 5 以上的法術，獲得 +1/+1
  BOT_550: { abilities: playIf({ c: 'holding', type: 'SPELL', minCost: 5 }, selfBuff(1, 1)) },
  // 星辰校準師：戰吼：若你控制 3 個生命值為 7 的手下，對全部敵人造成 7 點傷害
  BOT_552: { abilities: playIf({ c: 'control', hp: 7, min: 3 }, { e: 'damage', target: allEnemies, amount: 7 }) },
  // 星穹使者塞蕾西亞：潛行；在對手打出手下後，變成它的複製
  BOT_555: { keywords: ['STEALTH'], abilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [fn('becomeIt')] }] },
  // 受試者：亡語：把對它施放過的法術洗入你的牌堆
  BOT_558: { abilities: dr(fn('spellsOnTo')) },
  // 強化的伊萊克：每當你把卡洗入牌堆，多洗一張複製
  BOT_559: { flags: ['shuffleExtra'] },
  // 草率的實驗者：你打出的亡語手下消耗減少 (3)，但會在回合結束時死亡
  BOT_566: {
    costAuras: [{ side: 'friendly', type: 'MINION', hasDeathrattle: true, add: -3 }],
    abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasDeathrattle' }, effects: [{ e: 'buff', target: { t: 'it' }, abilities: [dieAtEndOfTurn] }] }],
  },
  // 澤瑞克的複製收藏：召喚牌堆中每個手下的 1/1 複製
  BOT_567: { abilities: play(fn('cloningGallery')) },
  // 靈魂收藏器：抽 3 張暫時的卡
  BOT_568: { abilities: play(fn('drawTemporary', { count: 3 })) },
  // 實驗體九號：戰吼：從牌堆抽 5 張不同的奧秘
  BOT_573: { abilities: play(fn('drawDifferentSecrets')) },
  // 導電機器人：戰吼：手牌中的機械消耗減少 (1)
  BOT_907: { abilities: play(fn('discountHandRace', { race: 'MECHANICAL', amount: 1 })) },
  // 水晶學：從牌堆抽兩張攻擊力 1 的手下
  BOT_909: { abilities: play({ e: 'draw', count: 2, who: 'self', pool: { attack: 1 } }) },
  // 崗古的無盡大軍：復活 3 個友方機械
  BOT_912: { abilities: play(fn('resurrectRandom', { count: 3, race: 'MECHANICAL' })) },
  // 惡魔研究計畫：雙方各把手牌中一個隨機手下變成惡魔
  BOT_913: { abilities: play(fn('demonicProject')) },
  // 神奇的威茲邦：開局時換成一副隨機的牌組
  BOT_914: { startOfGame: 'whizbang' },

  // ==========================================================================
  // 探險者協會
  // ==========================================================================
  // 被遺忘的火炬：造成 3 點傷害，把一張造成 6 點傷害的熾熱火炬洗入你的牌堆
  LOE_002: { target: anyChar, abilities: play(hit(3), { e: 'shuffle', card: 'LOE_002t', count: 1 }), tokens: ['LOE_002t'] },
  // 拉法姆的詛咒：給對手一張「被詛咒了！」，他在手中持有時，每回合開始受到 2 點傷害
  LOE_007: { abilities: play({ e: 'addCard', card: 'LOE_007t', count: 1, who: 'opponent' }), tokens: ['LOE_007t'] },
  LOE_007t: { handAbilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 }] }] },
  // 里諾‧傑克森：戰吼：若你的牌堆沒有重複的卡，完全治療你的英雄
  LOE_011: { abilities: playIf({ c: 'noDuplicates' }, { e: 'fullHeal', target: { t: 'hero', side: 'friendly' } }) },
  // 頑石元素：在你打出戰吼手下後，對一個隨機敵人造成 2 點傷害
  LOE_016: {
    abilities: [
      { on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasBattlecry' }, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 }] },
    ],
  },
  // 礦道穴居怪：每當你超載，每鎖住一個法力水晶 +1 攻擊力
  LOE_018: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: { dyn: 'itOverload' } }] }] },
  // 迅猛龍化石：戰吼：選擇一個友方手下，獲得它的亡語
  LOE_019: { target: friendlyOther, abilities: play(fn('copyDeathrattle')) },
  // 沙漠駱駝：戰吼：雙方各把牌堆中一個 1 費手下放到戰場上
  LOE_020: { abilities: play(fn('desertCamel')) },
  // 飛鏢陷阱：秘密：在對手使用英雄能力後，對一個隨機敵人造成 5 點傷害
  LOE_021: secretOn('enemyHeroPower', { e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 5, spell: true }),
  // 死魚翻身：召喚本場對戰中死亡的 7 個魚人
  LOE_026: { abilities: play(fn('anyfin')) },
  // 神聖試煉：秘密：在對手控制至少 3 個手下並打出另一個之後，消滅它
  LOE_027: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyPlaysMinion' }, cond: { c: 'control', side: 'enemy', min: 4 }, effects: [{ e: 'destroy', target: { t: 'it' } }] }] },
  // 納迦海巫：你的卡消耗為 (5)
  LOE_038: { costAuras: [{ side: 'friendly', set: 5 }] },
  // 叢林梟獸：雙方都有法術傷害 +2
  LOE_051: { flags: ['bothSpellDamage2'] },
  // 西風巨靈：在你對另一個友方手下施放法術後，也對它施放一次
  LOE_053: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('recastOnSelf')] }] },
  // 布萊恩‧銅鬚：你的戰吼觸發兩次
  LOE_077: { flags: ['doubleBattlecries'] },
  // 芬利‧莫戈頓爵士：戰吼：發現一個新的基本英雄能力
  LOE_076: { abilities: play(fn('discoverBasicPower')) },
  // 伊莉絲‧尋星者：戰吼：把「黃金猴寶藏圖」洗入你的牌堆
  LOE_079: { abilities: play({ e: 'shuffle', card: 'LOE_019t', count: 1 }), tokens: ['LOE_019t'] },
  LOE_019t: { abilities: play({ e: 'shuffle', card: 'LOE_019t2', count: 1 }, { e: 'draw', count: 1, who: 'self' }), tokens: ['LOE_019t2'] },
  LOE_019t2: { keywords: ['TAUNT'], abilities: play(fn('replaceWithLegendaries')) },
  // 召喚石：每當你施放法術，召喚一個消耗相同的隨機手下
  LOE_086: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('summonSameCost')] }] },
  // 神鬼大盜拉法姆：戰吼：發現一件強大的神器
  LOE_092: { abilities: play(fn('discoverList', { cards: ARTIFACTS })), tokens: ARTIFACTS },
  LOEA16_3: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 10, hp: 10 }) },
  LOEA16_4: { abilities: play({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 10, spell: true }) },
  LOEA16_5: { abilities: play(fn('fillBoard', { card: 'LOEA16_5t' })), tokens: ['LOEA16_5t'] },
  // 入葬：選擇一個敵方手下，把它洗入你的牌堆
  LOE_104: { target: enemyMinion, abilities: play(fn('entomb')) },
  // 探險者之帽：賦予一個手下 +1/+1 與「亡語：獲得一頂探險者之帽」
  LOE_105: { target: chosenMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1, abilities: dr({ e: 'addCard', card: 'LOE_105', count: 1, who: 'self' }) }) },
  // 怪異雕像：只有它是戰場上唯一的手下時才能攻擊
  LOE_107: { attackIf: { c: 'boardCount', n: 1 } },
  // 遠古幽魂：戰吼：把一張抽到時對你造成 7 點傷害的遠古詛咒洗入你的牌堆
  LOE_110: { abilities: play({ e: 'shuffle', card: 'LOE_110t', count: 1 }), tokens: ['LOE_110t'] },
  LOE_110t: { castsWhenDrawn: true, abilities: play({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 7 }) },
  // 出土邪降：對所有手下造成 3 點傷害，把這張卡洗入對手的牌堆
  LOE_111: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion' } }, amount: 3, spell: true }, { e: 'shuffle', card: 'LOE_111', count: 1, who: 'opponent' }) },
  // 黏黏有魚：你的手下 +2/+2；你每控制一個魚人，消耗減少 (1)
  LOE_113: { costRule: { per: 'friendlyRace', amount: 1, race: 'MURLOC' }, abilities: play({ e: 'buff', target: allFriendly, atk: 2, hp: 2 }) },
  // 聖匣追尋者：戰吼：若你控制 6 個其他手下，獲得 +4/+4
  LOE_116: { abilities: playIf({ c: 'control', min: 6 }, selfBuff(4, 4)) },
  // 詛咒之刃：你的英雄受到的傷害加倍
  LOE_118: { flags: ['doubleHeroDamage'] },
  // 活化的盔甲：你的英雄每次最多受到 1 點傷害
  LOE_119: { flags: ['heroDamageCap1'] },

  // ==========================================================================
  // 迦拉克隆的覺醒
  // ==========================================================================
  // 乘風而起：雙生法術；二選一：抽一張牌；或召喚一隻 3/2 老鷹
  YOD_001: {
    chooseOne: [
      { id: 'YOD_001b', name: '振翅高飛', text: '抽一張牌', abilities: play({ e: 'draw', count: 1, who: 'self' }) },
      { id: 'YOD_001c', name: '撲襲急降', text: '召喚一個3/2老鷹', abilities: play(summon('YOD_001t')) },
    ],
    tokens: ['YOD_001t'],
  },
  YOD_001ts: {
    chooseOne: [
      { id: 'YOD_001b', name: '振翅高飛', text: '抽一張牌', abilities: play({ e: 'draw', count: 1, who: 'self' }) },
      { id: 'YOD_001c', name: '撲襲急降', text: '召喚一個3/2老鷹', abilities: play(summon('YOD_001t')) },
    ],
    tokens: ['YOD_001t'],
  },
  // 秘法增幅者：你的英雄能力額外造成 2 點傷害
  YOD_008: { flags: ['heroPowerDamage2'] },
  // 天降奇兵：雙生法術；召喚兩個有嘲諷的白銀之手新兵
  YOD_012: { abilities: play(fn('summonWithKeywords', { card: 'CS2_101t', count: 2, keywords: ['TAUNT'] })) },
  YOD_012ts: { abilities: play(fn('summonWithKeywords', { card: 'CS2_101t', count: 2, keywords: ['TAUNT'] })) },
  // 邪龍祭司：戰吼：若你手中有龍，從你的牌堆發現一張法術
  YOD_013: { abilities: playIf({ c: 'holding', race: 'DRAGON' }, fn('discoverFromDeck', { type: 'SPELL' })) },
  // 恆時劫奪者：戰吼：對一個手下造成等同其攻擊力的傷害
  YOD_014: { target: optional({ type: 'minion', side: 'any', excludeSelf: true }), abilities: play(fn('damageByOwnAttack')) },
  // 黑暗預言：發現一個 2 費手下，召喚它並賦予 +3 生命值
  YOD_015: { abilities: play(fn('discoverSummon', { cost: 2, any: true, hp: 3 })) },
  // 暗影雕塑師：連擊：你本回合每打出過一張其他牌，抽一張牌
  YOD_017: { abilities: play({ e: 'cond', cond: { c: 'combo' }, then: [{ e: 'draw', count: { dyn: 'cardsPlayedThisTurn', base: -1 }, who: 'self' }] }) },
  // 爆炸性進化：把一個手下變成隨機一個消耗多 (3) 的手下
  YOD_020: { target: chosenMinion, abilities: play({ e: 'evolve', target: { t: 'chosen' }, amount: 3 }) },
  // 爆爆小隊：發現一張跟班、機械或龍
  YOD_023: { abilities: play(fn('boomSquad')), tokens: LACKEYS },
  // 惡魔僕從：亡語：把此手下的攻擊力給一個隨機友方手下
  YOD_026: { abilities: dr({ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly' }, count: 1 }, atk: { dyn: 'selfAttack' } }) },
  // 混亂凝視者：戰吼：詛咒對手手牌中一張可以打出的卡，他只有 1 個回合可以打出它
  YOD_027: { abilities: play(fn('doomCard')) },
  // 跳傘教官：戰吼：從你的牌堆召喚一個 1 費手下
  YOD_028: { abilities: play({ e: 'recruit', count: 1, cost: 1 }) },
  // 冰雹使者：戰吼：召喚兩個會凍結的 1/1 冰碎片
  YOD_029: { abilities: play(summon('YOD_029t', 2)), tokens: ['YOD_029t'] },
  YOD_029t: { keywords: ['FREEZE_ON_DAMAGE'] },
  // 有證照的冒險者：戰吼：若你有進行中的任務，把一枚幸運幣加入你的手牌
  YOD_030: { abilities: playIf({ c: 'questActive' }, { e: 'addCard', card: 'GAME_005', count: 1, who: 'self' }) },
  // 發狂的魔翼：本回合對手每受到 1 點傷害，消耗減少 (1)
  YOD_032: { costRule: { per: 'enemyHeroDamageThisTurn', amount: 1 } },
  // 爆爆槍手：戰吼：敵方戰吼卡在下個回合消耗增加 (5)
  YOD_033: { abilities: play(fn('battlecryTax', { amount: 5 })) },
  // 幫眾總管厄爾坎：在你打出跟班後，把一張跟班加入你的手牌
  YOD_035: {
    abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itNameIncludes', s: 'Lackey' }, effects: [fn('addOneOf', { cards: LACKEYS })] }],
    tokens: LACKEYS,
  },
  // 天空將軍克拉格：嘲諷；戰吼：若你本場打出過任務，召喚一隻 4/2 突襲鸚鵡
  YOD_038: { keywords: ['TAUNT'], abilities: playIf({ c: 'questPlayed' }, summon('YOD_038t')), tokens: ['YOD_038t'] },
  // 鋼鐵甲蟲：戰吼：若你手中有消耗 5 以上的法術，獲得 5 點護甲值
  YOD_040: { abilities: playIf({ c: 'holding', type: 'SPELL', minCost: 5 }, { e: 'armor', amount: 5 }) },
  // 萊公之拳：在你施放法術後，召喚一個消耗相同的傳說手下，失去 1 點耐久度
  YOD_042: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('atiesh', { legendary: true })] }] },

  // ==========================================================================
  // 拉斯塔哈大混戰
  // ==========================================================================
  // 冤魂靈視：你本回合的下一張法術消耗減少 (3)；發現一張法術
  TRL_058: { abilities: play({ e: 'pendingDiscount', d: { type: 'SPELL', amount: 3, thisTurn: true } }, { e: 'discover', pool: { type: 'SPELL' } }) },
  // 青蛙之靈：潛行 1 回合；每當你施放法術，從牌堆抽一張消耗多 (1) 的法術
  TRL_060: { abilities: [...play(stealthOneTurn), { on: { k: 'spellCast', side: 'friendly' }, effects: [fn('drawSpellCostPlus')] }] },
  // 血帆哮猴：突襲；戰吼：你每控制一個其他海盜，+1/+1
  TRL_071: {
    keywords: ['RUSH'],
    abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'friendlyRace', race: 'PIRATE' }, hp: { dyn: 'friendlyRace', race: 'PIRATE' } }),
  },
  // 古拉巴什鼓譟者：戰吼：發現一張戰吼手下的 1/1 複製，其消耗為 (1)
  TRL_077: { abilities: play(fn('hypemon')) },
  // 大巫毒儀式：賦予一個友方手下「亡語：召喚一個消耗多 (1) 的隨機手下」
  TRL_082: { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr(fn('summonCostPlus', { n: 1 })) }) },
  // 贊提莫：每當你對手下施放法術，對它的相鄰手下再施放一次
  TRL_085: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('zentimo')] }] },
  // 鯊魚之靈：潛行 1 回合；你的手下的戰吼與連擊觸發兩次
  TRL_092: { flags: ['doubleBattlecries'], abilities: play(stealthOneTurn) },
  // 格利夫塔：戰吼：發現兩張卡，隨機把其中一張給對手
  TRL_096: { abilities: play(fn('griftah')) },
  // 獵頭者之斧：戰吼：若你控制野獸，獲得 +1 耐久度
  TRL_111: { abilities: playIf({ c: 'control', race: 'BEAST' }, { e: 'weaponBuff', dur: 1 }) },
  // 獸心：賦予友方野獸 +1/+1，然後讓它攻擊一個隨機敵方手下
  TRL_119: { target: { filter: { type: 'minion', side: 'friendly', race: 'BEAST' } }, abilities: play(fn('beastWithin')) },
  // 劫掠隊伍：從牌堆抽 2 個海盜；連擊：再抽一把武器
  TRL_124: {
    abilities: play(
      { e: 'draw', count: 2, who: 'self', pool: { type: 'MINION', race: 'PIRATE' } },
      { e: 'cond', cond: { c: 'combo' }, then: [{ e: 'draw', count: 1, who: 'self', pool: { type: 'WEAPON' } }] },
    ),
  },
  // 鉤牙船長：戰吼：從牌堆召喚 3 個海盜，賦予突襲
  TRL_126: { abilities: play(fn('recruitRush', { count: 3, race: 'PIRATE' })) },
  // 火砲彈幕：對一個隨機敵人造成 3 點傷害，你每有一個海盜就重複一次
  TRL_127: {
    abilities: play({
      e: 'repeat',
      times: { dyn: 'friendlyRace', race: 'PIRATE', base: 1 },
      effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 3, spell: true }],
    }),
  },
  // 偷竊兵器：發現一把（其他職業的）武器
  TRL_156: { abilities: play({ e: 'discover', pool: { type: 'WEAPON', otherClass: true } }) },
  // 迅猛龍之靈：潛行 1 回合；在你的英雄攻擊並消滅手下後，抽一張牌
  TRL_223: { abilities: [...play(stealthOneTurn), ...heroAttacked(fn('ifHeroKilled', { then: [{ e: 'draw', count: 1, who: 'self' }] }))] },
  // 兇蠻打擊者：戰吼：對一個敵方手下造成等同你英雄攻擊力的傷害
  TRL_240: { target: optional({ type: 'minion', side: 'enemy' }), abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'heroAttack' } }) },
  // 『迅猛龍』剛克：在你的英雄攻擊並消滅手下後，可以再攻擊一次
  TRL_241: { abilities: heroAttacked(fn('ifHeroKilled', { then: [fn('heroAttackAgain')] })) },
  // 掠食本能：從牌堆抽一個野獸，生命值加倍
  TRL_244: { abilities: play(fn('drawDoubleHealth')) },
  // 尖嘯：棄掉你消耗最低的卡，對所有手下造成 2 點傷害
  TRL_245: { abilities: play(fn('discardLowest'), { e: 'damage', target: { t: 'all', filter: { type: 'minion' } }, amount: 2, spell: true }) },
  // 虛無契約：摧毀雙方牌堆的一半
  TRL_246: { abilities: play(fn('voidContract')) },
  // 靈魂看守者：戰吼：把 3 張本場對戰中棄掉的隨機卡加入你的手牌
  TRL_247: { abilities: play(fn('addDiscarded', { count: 3 })) },
  // 蝙蝠之靈：潛行 1 回合；在友方手下死亡後，賦予手牌中一個手下 +1/+1
  TRL_251: { abilities: [...play(stealthOneTurn), { on: { k: 'minionDied', side: 'friendly' }, effects: [{ e: 'handBuff', atk: 1, hp: 1, scope: 'random' }] }] },
  // 高階祭司耶克里克：嘲諷、生命竊取；當你棄掉它時，把 2 張複製加入你的手牌
  TRL_252: { keywords: ['TAUNT', 'LIFESTEAL'], abilities: [{ on: { k: 'discarded' }, effects: [{ e: 'addCard', card: 'TRL_252', count: 2, who: 'self' }] }] },
  // 『蝙蝠』希爾雷克：戰吼：用此手下的複製填滿你的場面
  TRL_253: { abilities: play(fn('fillBoardCopies')) },
  // 奔竄咆哮：從手牌召喚一個隨機野獸，賦予突襲
  TRL_255: { abilities: play(fn('summonFromHand', { race: 'BEAST', rush: true })) },
  // 集體恐慌：迫使每個手下攻擊另一個隨機手下
  TRL_258: { abilities: play(fn('massHysteria')) },
  // 塔蘭姬公主：戰吼：從手牌召喚所有不是一開始就在牌堆裡的手下
  TRL_259: { abilities: play(fn('summonFromHand', { notStarting: true, all: true })) },
  // 『亡者』伯昂撒姆第：戰吼：從牌堆抽 1 費手下，直到手牌滿
  TRL_260: { abilities: play(fn('bwonsamdi')) },
  // 『老虎』希爾瓦拉：聖盾、突襲、生命竊取；你每花 1 點法力在法術上，消耗減少 (1)
  TRL_300: { keywords: ['DIVINE_SHIELD', 'RUSH', 'LIFESTEAL'], costRule: { per: 'spellManaSpent', amount: 1 } },
  // 暫停！：你的英雄在你的下個回合前免疫
  TRL_302: { abilities: play(fn('timeOut')) },
  // 有新的挑戰者…：發現一個 6 費手下，召喚它並賦予嘲諷與聖盾
  TRL_305: { abilities: play(fn('discoverSummon', { cost: 6, any: true, keywords: ['TAUNT', 'DIVINE_SHIELD'] })) },
  // 不朽的主祭：亡語：把此手下（保留加成）洗入你的牌堆
  TRL_306: { abilities: dr(fn('shuffleSelfBuffed')) },
  // 高階祭司塞卡爾：戰吼：把英雄除了 1 點以外的生命值轉換成護甲值
  TRL_308: { abilities: play(fn('thekal')) },
  // 猛虎之靈：潛行 1 回合；在你施放法術後，召喚一隻數值等同其消耗的老虎
  TRL_309: { abilities: [...play(stealthOneTurn), { on: { k: 'spellCast', side: 'friendly' }, effects: [fn('summonTiger', { card: 'TRL_309t' })] }], tokens: ['TRL_309t'] },
  // 喚醒元素：你本回合的下一個元素消耗減少 (2)
  TRL_310: { cost: 0, abilities: play({ e: 'pendingDiscount', d: { race: 'ELEMENTAL', amount: 2, thisTurn: true } }) },
  // 狂暴法師：受傷時具有法術傷害 +2
  TRL_312: { flags: ['spellDamage2Damaged'] },
  // 灼燒：對一個手下造成 4 點傷害；若你上回合打出元素，消耗為 (1)
  TRL_313: { target: chosenMinion, abilities: play(hit(4)), costIf: { cond: { c: 'playedElementalLastTurn' }, cost: 1 } },
  // 縱火狂：每當你的英雄能力消滅手下，抽一張牌
  TRL_315: { flags: ['heroPowerKillDraw'] },
  // 『龍鷹』賈納雷：戰吼：若你的英雄能力本場造成過 8 點傷害，召喚『炎魔』拉格納羅斯
  TRL_316: { abilities: playIf({ c: 'heroPowerDamage', n: 8 }, summon('TRL_316t')), tokens: ['TRL_316t'] },
  TRL_316t: { keywords: ['CANT_ATTACK'], abilities: atEndOfTurn({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 8 }) },
  // 妖術領主瑪拉克雷斯：戰吼：把你起手手牌的複製加入手牌
  TRL_318: { abilities: play(fn('hexLord')) },
  // 龍鷹之靈：潛行 1 回合；你的英雄能力也會指定相鄰手下
  TRL_319: { flags: ['heroPowerAdjacent'], abilities: play(stealthOneTurn) },
  // 重金屬搖滾！：召喚一個消耗等同你護甲值的隨機手下
  TRL_324: { abilities: play(fn('summonCostArmor')) },
  // 犀牛之靈：潛行 1 回合；你的突襲手下在被召喚的回合免疫
  TRL_327: { flags: ['rushImmune'], abilities: play(stealthOneTurn) },
  // 戰爭指揮官沃恩：戰吼：複製手牌中所有的龍
  TRL_328: { abilities: play(fn('copyHandRace', { race: 'DRAGON' })) },
  // 主人的呼喚：從牌堆發現一個手下；若三個都是野獸，全部抽出
  TRL_339: { abilities: play(fn('mastersCall')) },
  // 樹語者：戰吼：把你的樹人變成 5/5 古樹
  TRL_341: { abilities: play(fn('transformNamed', { nameIncludes: 'Treant', card: 'TRL_341t' })), tokens: ['TRL_341t'] },
  // 戰鬥德魯伊蘿蒂：二選一：變成蘿蒂的四種恐龍形態之一
  TRL_343: {
    chooseOne: [
      { id: 'TRL_343at2', name: '刺甲龍形態', text: '1/6 <b>嘲諷</b>', abilities: [], transformInto: 'TRL_343at2' },
      { id: 'TRL_343bt2', name: '刀齒獸形態', text: '4/2 <b>突襲</b>', abilities: [], transformInto: 'TRL_343bt2' },
      { id: 'TRL_343ct2', name: '翼手龍形態', text: '1/4 <b>法術傷害+1</b>', abilities: [], transformInto: 'TRL_343ct2' },
      { id: 'TRL_343dt2', name: '暴掠龍形態', text: '1/2 <b>劇毒</b>、<b>潛行</b>', abilities: [], transformInto: 'TRL_343dt2' },
    ],
    tokens: ['TRL_343at2', 'TRL_343bt2', 'TRL_343ct2', 'TRL_343dt2'],
  },
  // 『巨蛙』奎格瓦：戰吼：把你上回合施放的法術放回手牌
  TRL_345: { abilities: play(fn('returnPrevSpells')) },
  // 長舌魔棒：在你被超載時 +2 攻擊力
  TRL_352: { atkIf: { cond: { c: 'overloaded' }, atk: 2 } },
  // 大膽的吞火師：戰吼：你本回合的下一次英雄能力多造成 2 點傷害
  TRL_390: { abilities: play(fn('powerDamageBonus', { amount: 2 })) },
  // 粗野馴獸師：每當你抽到野獸，賦予它 +2/+2
  TRL_405: { abilities: [{ on: { k: 'draw', side: 'friendly' }, cond: { c: 'itRace', race: 'BEAST' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2, hp: 2 }] }] },
  // 茶水小弟：戰吼：你本回合的下一次英雄能力消耗為 (0)
  TRL_407: { abilities: play(fn('powerFree')) },
  // 『鯊魚』格拉爾：戰吼：吃掉牌堆中的一個手下並獲得其數值；亡語：把它加入你的手牌
  TRL_409: { abilities: [...play(fn('gralEat')), ...dr(fn('returnStash', { count: 1 }))] },
  // 獻身瘋狂：摧毀你的 3 個法力水晶，賦予你牌堆中所有手下 +2/+2
  TRL_500: { abilities: play({ e: 'mana', kind: 'destroy', amount: 3 }, fn('buffHandAndDeck', { atk: 2, hp: 2, deckOnly: true })) },
  // 奧奇奈亡魂：戰吼：本回合你的治療效果改為造成傷害
  TRL_501: { abilities: play(fn('healDamage')) },
  // 亡者之靈：潛行 1 回合；在友方手下死亡後，把它的 1 費複製洗入你的牌堆
  TRL_502: { abilities: [...play(stealthOneTurn), { on: { k: 'minionDied', side: 'friendly' }, effects: [fn('shuffleItCost1')] }] },
  // 藏寶海灣組頭：戰吼：給對手一枚幸運幣
  TRL_504: { abilities: play({ e: 'addCard', card: 'GAME_005', count: 1, who: 'opponent' }) },
  // 無助的幼獸：亡語：手牌中一個野獸消耗減少 (1)
  TRL_505: { abilities: dr(fn('discountRandom', { race: 'BEAST', amount: 1 })) },
  // 好鬥的地精：嘲諷；戰吼：若對手有 2 個以上的手下，+1 攻擊力
  TRL_514: { keywords: ['TAUNT'], abilities: playIf({ c: 'control', side: 'enemy', min: 2 }, selfBuff(1, 0)) },
  // 古拉巴什供品：在你的回合開始時，消滅此手下並獲得 8 點護甲值
  TRL_516: { abilities: atStartOfTurn({ e: 'destroy', target: { t: 'self' } }, { e: 'armor', amount: 8 }) },
  // 毒疣女巫：戰吼：若你本回合施放了 2 張法術，造成 2 點傷害
  TRL_522: {
    target: optional({ type: 'character', side: 'any' }, { c: 'spellsThisTurn', n: 2, atLeast: true }),
    abilities: playIf({ c: 'spellsThisTurn', n: 2, atLeast: true }, hit(2, false)),
  },
  // 德拉克瑞欺詐者：戰吼：雙方各獲得對手牌堆中一張隨機卡的複製
  TRL_527: { abilities: play(fn('copyFromEachOpp')) },
  // 蒙面參賽者：戰吼：若你控制奧秘，施放牌堆中的一個奧秘
  TRL_530: { abilities: playIf({ c: 'secret' }, fn('secretsFromDeck', { count: 1 })) },
  // 莫什奧格播報員：攻擊它的敵人有 50% 機率攻擊其他目標
  TRL_532: { flags: ['redirectAttackers'] },
  // 冰淇淋小販：戰吼：若你控制被凍結的手下，獲得 8 點護甲值
  TRL_533: { abilities: playIf({ c: 'control', frozen: true }, { e: 'armor', amount: 8 }) },
  // 鉗嘴龜殼鬥士：相鄰手下受到的傷害改由此手下承受
  TRL_535: { flags: ['adjacentBodyguard'] },
  // 送葬者：戰吼：獲得 3 個本場死亡的友方手下的亡語
  TRL_537: { abilities: play(fn('undatakah')) },
  // 『奪魂者』哈卡：亡語：把一張墮落之血洗入雙方的牌堆
  TRL_541: { abilities: dr(fn('shuffleEachDeck', { card: 'TRL_541t' })), tokens: ['TRL_541t'] },
  TRL_541t: { castsWhenDrawn: true, abilities: play(fn('corruptedBlood')) },
  // 贊達拉聖壇護衛：戰吼：若你本場恢復了 10 點生命值，獲得 +4/+4 與嘲諷
  TRL_545: { abilities: playIf({ c: 'healedThisGame', n: 10 }, selfBuff(4, 4, ['TAUNT'])) },
  // 魯莽的兇暴食人妖：嘲諷；戰吼：棄掉你消耗最低的卡
  TRL_551: { keywords: ['TAUNT'], abilities: play(fn('discardLowest')) },
  // 魔精大師吉西：戰吼：雙方的法力水晶都設為 5 個
  TRL_564: { abilities: play(fn('setMana', { n: 5 })) },
  // 復仇獸群：召喚本回合死亡的友方野獸
  TRL_566: { abilities: play(fn('summonDiedThisTurn', { race: 'BEAST' })) },
  // 煲湯小販：每當你為英雄恢復 3 點以上的生命值，抽一張牌
  TRL_570: {
    abilities: [
      {
        on: { k: 'healed', subject: 'friendly' },
        cond: { c: 'not', cond: { c: 'itIsMinion' } },
        effects: [{ e: 'cond', cond: { c: 'eventAmount', n: 3 }, then: [{ e: 'draw', count: 1, who: 'self' }] }],
      },
    ],
  },
  // 『山貓』哈拉齊：突襲；戰吼：用 1/1 突襲山貓填滿你的手牌
  TRL_900: { keywords: ['RUSH'], abilities: play(fn('fillHandWith', { card: 'TRL_348t' })), tokens: ['TRL_348t'] },

  // ==========================================================================
  // 安戈洛歷險記
  // ==========================================================================
  // 演化的十種選項（只用來顯示）
  ...Object.fromEntries(ADAPTATIONS.map((id) => [id, {}])),
  UNG_999t2: { tokens: ['UNG_999t2t1'] },
  // 翼手龍寶寶 / 蒼綠長頸龍：戰吼：演化
  UNG_001: { abilities: play(adapt()), tokens: ADAPTATIONS },
  UNG_100: { abilities: play(adapt()), tokens: ADAPTATIONS },
  // 火山龍：戰吼：演化兩次
  UNG_002: { abilities: play(adapt({ times: 2 })), tokens: ADAPTATIONS },
  // 有龍乃大：將一個手下的數值設為 7/14
  UNG_004: { target: chosenMinion, abilities: play({ e: 'setStats', target: { t: 'chosen' }, atk: 7, hp: 14 }) },
  // 小暴掠龍：戰吼：若你控制至少 2 個其他手下，演化
  UNG_009: { abilities: playIf({ c: 'control', min: 2 }, adapt()), tokens: ADAPTATIONS },
  // 水文學家：戰吼：發現並施放一個奧秘
  UNG_011: { abilities: play(fn('discoverSecretPlace')) },
  // 烈焰噴泉：造成 2 點傷害，把一張 1/2 元素加入你的手牌
  UNG_018: { target: anyChar, abilities: play(hit(2), { e: 'addCard', card: 'UNG_809t1', count: 1, who: 'self' }), tokens: ['UNG_809t1'] },
  // 蒸氣奔騰者：戰吼：若你上回合打出元素，把一張烈焰噴泉加入你的手牌
  UNG_021: { abilities: playIf({ c: 'playedElementalLastTurn' }, { e: 'addCard', card: 'UNG_018', count: 1, who: 'self' }) },
  // 幻象呼喚者：戰吼：選擇一個手下，召喚它的 1/1 複製
  UNG_022: { target: optional({ type: 'minion', side: 'any', excludeSelf: true }), abilities: play(fn('copyChosenStats', { atk: 1, hp: 1 })) },
  // 法力連結：秘密：當對手施放法術時，把它的複製加入你的手牌，消耗為 (0)
  UNG_024: secretOn('enemyCastsSpell', fn('addItCost0')),
  // 派洛斯：亡語：以 6/6、消耗 (4) 回到你的手牌（再死亡則為 10/10、消耗 (8)）
  UNG_027: { abilities: dr({ e: 'addCard', card: 'UNG_027t2', count: 1, who: 'self' }), tokens: ['UNG_027t2'] },
  UNG_027t2: { abilities: dr({ e: 'addCard', card: 'UNG_027t4', count: 1, who: 'self' }), tokens: ['UNG_027t4'] },
  // 任務
  UNG_028: { quest: { kind: 'spellNotStarting', goal: 8, reward: 'UNG_028t' }, tokens: ['UNG_028t'] },
  UNG_028t: { abilities: play(fn('extraTurn')) },
  UNG_067: { quest: { kind: 'sameName', goal: 4, reward: 'UNG_067t1' }, tokens: ['UNG_067t1'] },
  UNG_067t1: { abilities: play(fn('minions55')) },
  UNG_116: { quest: { kind: 'bigMinionSummon', goal: 4, reward: 'UNG_116t' }, tokens: ['UNG_116t'] },
  UNG_116t: { abilities: play(fn('setDeckCost', { cost: 0 })) },
  UNG_829: { quest: { kind: 'discard', goal: 6, reward: 'UNG_829t1' }, tokens: ['UNG_829t1'] },
  UNG_829t1: { abilities: play(fn('netherPortal', { card: 'UNG_829t2' })), tokens: ['UNG_829t2'] },
  UNG_829t2: { keywords: ['DORMANT'], abilities: atEndOfTurn(summon('UNG_829t3', 2)), tokens: ['UNG_829t3'] },
  UNG_920: { quest: { kind: 'oneCostMinion', goal: 7, reward: 'UNG_920t1' }, tokens: ['UNG_920t1'] },
  UNG_920t1: { keywords: ['RUSH'], abilities: play({ e: 'shuffle', card: 'UNG_920t2', count: 20 }), tokens: ['UNG_920t2'] },
  UNG_920t2: { abilities: play({ e: 'draw', count: 1, who: 'self' }) },
  UNG_934: { quest: { kind: 'tauntMinion', goal: 7, reward: 'UNG_934t1' }, tokens: ['UNG_934t1'] },
  UNG_934t1: { abilities: play({ e: 'replaceHeroPower', power: 'UNG_934t2' }) },
  UNG_940: { quest: { kind: 'deathrattleSummon', goal: 6, reward: 'UNG_940t8' }, tokens: ['UNG_940t8'] },
  UNG_940t8: { keywords: ['TAUNT'], abilities: play(fn('heroHealth', { hp: 40 })) },
  UNG_942: { quest: { kind: 'murlocSummon', goal: 8, reward: 'UNG_942t' }, tokens: ['UNG_942t'] },
  UNG_942t: { abilities: play(fn('fillHand', { pool: { type: 'MINION', race: 'MURLOC' } })) },
  UNG_954: { quest: { kind: 'spellOnMinion', goal: 5, reward: 'UNG_954t1' }, tokens: ['UNG_954t1'] },
  UNG_954t1: { abilities: play(adapt({ times: 5 })), tokens: ADAPTATIONS },
  // 暗影靈視：發現你牌堆中一張法術的複製
  UNG_029: { abilities: play(fn('discoverFromDeck', { type: 'SPELL', copy: true })) },
  // 束縛治療：為一個手下與你的英雄各恢復 5 點生命值
  UNG_030: { target: chosenMinion, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 5 }, { e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 5 }) },
  // 結晶神諭者：亡語：複製對手牌堆中的一張卡加入你的手牌
  UNG_032: { abilities: dr(fn('copyFromOppDeck', { count: 1 })) },
  // 光輝元素：你的法術消耗減少 (1)（但不會低於 1）
  UNG_034: { costAuras: [{ side: 'friendly', type: 'SPELL', add: -1, floor: 1 }] },
  // 好奇的亮根草：戰吼：猜猜看哪一張一開始在對手的牌堆裡，猜對就得到它
  UNG_035: { abilities: play(fn('glimmerroot')) },
  // 飢餓的翼手龍：戰吼：消滅一個友方手下，演化兩次
  UNG_047: { target: friendlyOther, abilities: play(fn('ravenousPterrordax')), tokens: ADAPTATIONS },
  // 焦油系列：在對手的回合額外 +X 攻擊力
  UNG_049: { keywords: ['TAUNT'], atkIf: { cond: { c: 'opponentTurn' }, atk: 3 } },
  UNG_838: { keywords: ['TAUNT'], atkIf: { cond: { c: 'opponentTurn' }, atk: 4 } },
  UNG_928: { keywords: ['TAUNT'], atkIf: { cond: { c: 'opponentTurn' }, atk: 2 } },
  // 刀花綻放 / 剃刀花鞭笞者：把造成 2 點傷害的剃刀花加入你的手牌
  UNG_057: { abilities: play({ e: 'addCard', card: 'UNG_057t1', count: 2, who: 'self' }), tokens: ['UNG_057t1'] },
  UNG_058: { abilities: play({ e: 'addCard', card: 'UNG_057t1', count: 1, who: 'self' }), tokens: ['UNG_057t1'] },
  // 黑曜石裂片：本場每有一張其他職業的卡加入你的手牌，消耗減少 (1)
  UNG_061: { costRule: { per: 'otherClassAdded', amount: 1 } },
  // 咬人草：連擊：你本回合每打出過一張其他牌，+1/+1
  UNG_063: {
    abilities: play({
      e: 'cond',
      cond: { c: 'combo' },
      then: [{ e: 'buff', target: { t: 'self' }, atk: { dyn: 'cardsPlayedThisTurn', base: -1 }, hp: { dyn: 'cardsPlayedThisTurn', base: -1 } }],
    }),
  },
  // 『食屍魔花』榭拉辛：亡語：進入休眠；在一個回合打出 4 張牌後甦醒
  UNG_065: { abilities: [...dr(fn('goDormant', { need: 1 })), { on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('wakeAfterCards', { n: 4 })] }] },
  // 兇惡幼雛：在此手下攻擊英雄後，演化
  UNG_075: { abilities: afterAttack({ hero: true }, adapt()), tokens: ADAPTATIONS },
  // 托爾托採獵者：戰吼：隨機把一張攻擊力 5 以上的手下加入你的手牌
  UNG_078: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', minAttack: 5 }, count: 1, who: 'self' }) },
  // 雷霆蜥蜴：戰吼：若你上回合打出元素，演化
  UNG_082: { abilities: playIf({ c: 'playedElementalLastTurn' }, adapt()), tokens: ADAPTATIONS },
  // 翡翠蟲后：你的手下消耗增加 (2)
  UNG_085: { costAuras: [{ side: 'friendly', type: 'MINION', add: 2 }] },
  // 大巨蟒：嘲諷；亡語：從手牌召喚一個攻擊力 5 以上的手下
  UNG_086: { keywords: ['TAUNT'], abilities: dr(fn('summonFromHand', { minAtk: 5 })) },
  // 托爾托原獵者：戰吼：發現一張法術，以隨機目標施放
  UNG_088: { abilities: play(fn('discoverCast')) },
  // 溫和的大恐龍：戰吼：演化你的魚人
  UNG_089: { abilities: play(adapt({ target: 'friendly', race: 'MURLOC' })), tokens: ADAPTATIONS },
  // 充能魔暴龍：衝鋒；戰吼：本回合無法攻擊英雄
  UNG_099: { keywords: ['CHARGE'], abilities: play({ e: 'buff', target: { t: 'self' }, keywords: ['CANT_ATTACK_HEROES'], temp: true }) },
  // 演化孢子：演化你的手下
  UNG_103: { abilities: play(adapt({ target: 'friendly' })), tokens: ADAPTATIONS },
  // 地化鱗片：賦予友方手下 +1/+1，再獲得等同其攻擊力的護甲值
  UNG_108: { target: friendlyMinion, abilities: play(fn('earthenScales')) },
  // 老邁長頸龍：戰吼：若你手中有攻擊力 5 以上的手下，演化
  UNG_109: { abilities: playIf({ c: 'holding', type: 'MINION', minAtk: 5 }, adapt()), tokens: ADAPTATIONS },
  // 活體法力：把你的法力水晶變成 2/2 樹人（它們死亡時回復）
  UNG_111: { abilities: play(fn('livingMana', { card: 'UNG_111t1' })), tokens: ['UNG_111t1'] },
  UNG_111t1: { abilities: dr({ e: 'mana', kind: 'empty', amount: 1 }) },
  // 明眸斥候：戰吼：抽一張牌，將其消耗改為 (5)
  UNG_113: { abilities: play(fn('drawSetCost', { count: 1, cost: 5 })) },
  // 火羽先驅者：戰吼：手牌中的元素消耗減少 (1)
  UNG_202: { abilities: play(fn('discountHandRace', { race: 'ELEMENTAL', amount: 1 })) },
  // 『原初之王』卡力摩斯：戰吼：若你上回合打出元素，施放一個元素祈願
  UNG_211: { abilities: playIf({ c: 'playedElementalLastTurn' }, fn('kalimos')), tokens: INVOCATIONS },
  UNG_211a: { abilities: play(fn('fillBoard', { card: 'UNG_211aa' })), tokens: ['UNG_211aa'] },
  UNG_211b: { abilities: play({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 12 }) },
  UNG_211c: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 6 }) },
  UNG_211d: { abilities: play({ e: 'damage', target: allEnemy, amount: 3 }) },
  // 懼鱗潛獵者：戰吼：觸發一個友方手下的亡語
  UNG_800: { target: friendlyOther, abilities: play(fn('triggerDeathrattle', { times: 1 })) },
  // 築巢大鵬：戰吼：若你控制至少 2 個其他手下，獲得嘲諷
  UNG_801: { abilities: playIf({ c: 'control', min: 2 }, selfBuff(0, 0, ['TAUNT'])) },
  // 毒化武器：賦予你的武器劇毒
  UNG_823: { abilities: play(fn('weaponKeyword', { keyword: 'POISONOUS' })) },
  // 殘暴的恐龍術師：亡語：召喚一個本場對戰中棄掉的隨機手下
  UNG_830: { abilities: dr(fn('summonDiscarded')) },
  // 腐蝕迷霧：詛咒所有手下，在你的下個回合開始時消滅它們
  UNG_831: { abilities: play(fn('curseAll')) },
  // 鮮血綻放：你本回合的下一張法術改為消耗生命值
  UNG_832: { abilities: play({ e: 'pendingDiscount', d: { type: 'SPELL', health: true, thisTurn: true } }) },
  // 拉卡利惡魔犬：嘲諷；戰吼：棄掉你消耗最低的兩張卡
  UNG_833: { keywords: ['TAUNT'], abilities: play(fn('discardLowest', { count: 2 })) },
  // 開飯時刻：對一個手下造成 3 點傷害，召喚三隻 1/1 翼手龍並演化它們
  UNG_834: {
    target: chosenMinion,
    abilities: play(hit(3), fn('feedingTime', { card: 'UNG_834t1' })),
    tokens: ['UNG_834t1', ...ADAPTATIONS],
  },
  // 窸窣的掘洞蟲：戰吼：發現一張法術，你的英雄受到等同其消耗的傷害
  UNG_835: { abilities: play({ e: 'discover', pool: { type: 'SPELL' }, then: [fn('damageHeroByItCost')] }) },
  // 薩瓦絲女王：每當你棄掉它，+2/+2 並回到你的手牌
  UNG_836: { abilities: [{ on: { k: 'discarded' }, effects: [fn('zavas')] }] },
  // 『叢林獵人』赫米特：戰吼：摧毀你牌堆中消耗 3 以下的卡
  UNG_840: { abilities: play(fn('destroyDeckCost', { max: 3 })) },
  // 沃雷司：在你對它施放法術後，召喚一個 1/1 植物並對它施放複製
  UNG_843: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('voraxx', { card: 'UNG_999t2t1' })] }], tokens: ['UNG_999t2t1'] },
  // 貪食軟泥怪：戰吼：摧毀對手的武器，獲得等同其攻擊力的護甲值
  UNG_946: { abilities: play(fn('gluttonousOoze')) },
  // 『拓荒先驅』伊莉絲：戰吼：把安戈洛卡包洗入你的牌堆；若沒有重複的卡，抽出它
  UNG_851: { abilities: play(fn('eliseTrailblazer', { card: 'UNG_851t1' })), tokens: ['UNG_851t1'] },
  UNG_851t1: { abilities: play({ e: 'addRandom', pool: { set: 27, anyClass: true }, count: 5, who: 'self' }) },
  // 掙脫琥珀：發現一個消耗 8 以上的手下，召喚它
  UNG_854: { abilities: play(fn('discoverSummon', { minCost: 8, any: true })) },
  // 頌魂者昂布拉：在你召喚手下後，觸發它的亡語
  UNG_900: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('triggerItDeathrattle')] }] },
  // 歐茲魯克：嘲諷；戰吼：你上回合每打出一個元素，+5 生命值
  UNG_907: { keywords: ['TAUNT'], abilities: play({ e: 'buff', target: { t: 'self' }, hp: { dyn: 'elementalsLastTurn', mult: 5 } }) },
  // 小迅猛龍：亡語：把一隻 4/5 迅猛龍洗入你的牌堆
  UNG_914: { abilities: dr({ e: 'shuffle', card: 'UNG_914t1', count: 1 }), tokens: ['UNG_914t1'] },
  // 轟雷刺喉龍：戰吼：演化一個友方野獸
  UNG_915: { target: optional({ type: 'minion', side: 'friendly', race: 'BEAST', excludeSelf: true }), abilities: play(adapt({ target: 'chosen' })), tokens: ADAPTATIONS },
  // 奔竄：本回合你每打出一個野獸，隨機獲得一張野獸
  UNG_916: { cost: 2, abilities: play(fn('stampede')) },
  // 恐龍學：把你的英雄能力換成「賦予一個野獸 +3/+3」
  UNG_917: { abilities: play({ e: 'replaceHeroPower', power: 'UNG_917t1' }) },
  // 沼澤之王崔德：在對手打出手下後，攻擊它
  UNG_919: { abilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [fn('attackIt')] }] },
  // 探索安戈洛：把你的牌堆換成「發現一張卡」
  UNG_922: { abilities: play(fn('replaceDeck', { card: 'UNG_922t1' })), tokens: ['UNG_922t1'] },
  UNG_922t1: { abilities: play({ e: 'discover', pool: {} }) },
  // 暴躁的恐角龍：嘲諷；戰吼：演化
  UNG_925: { keywords: ['TAUNT'], abilities: play(adapt()), tokens: ADAPTATIONS },
  // 分裂生殖：召喚你受傷的手下的複製
  UNG_927: { abilities: play(fn('copyDamagedFriendly')) },
  // 熔火之刃：在你的手牌中時，每回合變成一把新的武器
  UNG_929: { handShift: { kind: 'randomWeapon' } },
  // 原魚勇士：亡語：把對它施放過的法術放回你的手牌
  UNG_953: { abilities: dr(fn('spellsOnTo', { hand: true })) },
  // 靈魂迴響：賦予你的手下「亡語：回到你的手牌」
  UNG_956: { abilities: play({ e: 'buff', target: allFriendly, abilities: dr({ e: 'addCopy', target: { t: 'self' }, count: 1 }) }) },
  // 小恐角龍：嘲諷；亡語：把一隻 8/12 嘲諷恐角龍洗入你的牌堆
  UNG_957: { keywords: ['TAUNT'], abilities: dr({ e: 'shuffle', card: 'UNG_957t1', count: 1 }), tokens: ['UNG_957t1'] },
  // 演化論：演化一個友方手下
  UNG_961: { cost: 1, target: friendlyMinion, abilities: play(adapt({ target: 'chosen' })), tokens: ADAPTATIONS },
  // 熔光劍龍：戰吼：演化你的白銀之手新兵
  UNG_962: { abilities: play(adapt({ target: 'friendly', nameIncludes: 'Silver Hand Recruit' })), tokens: ADAPTATIONS },
  // 劍龍騎術：賦予一個手下 +2/+6 與嘲諷，它死亡時召喚一隻劍龍
  UNG_952: {
    target: chosenMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 6, keywords: ['TAUNT'], abilities: dr(summon('UNG_810')) }),
    tokens: ['UNG_810'],
  },
};

// 逃離紫羅蘭堡
Object.assign(OVERRIDES, VIOLET_OVERRIDES);

// 大災變
Object.assign(OVERRIDES, CATACLYSM_OVERRIDES);

// 穿越時間流
Object.assign(OVERRIDES, TIMEWAYS_OVERRIDES);

// 核心系列
Object.assign(OVERRIDES, CORE_OVERRIDES);
Object.assign(OVERRIDES, UNGORO_OVERRIDES);
Object.assign(OVERRIDES, EMERALD_OVERRIDES);
Object.assign(OVERRIDES, LOCATION_OVERRIDES);
