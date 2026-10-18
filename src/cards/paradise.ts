// ============================================================================
// 天堂島（Perils in Paradise）：觀光客、飲料（3 次）、旅遊手冊、選三次、支線任務、護符……
// 解析器看不懂的卡在這裡手動定義；自訂效果（pd 開頭）在 game.ts 的 customParadise。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import { KAZAKUS_INGREDIENTS } from './kazakus';
import type { Ability, Condition, Effect, Pool, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const endTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count: number, pool?: Pool): Effect => ({ e: 'draw', count, who: 'self', pool });
const addCard = (card: string, count = 1): Effect => ({ e: 'addCard', card, count, who: 'self' });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const enemyMinions = { type: 'minion' as const, side: 'enemy' as const };

/** 飲料：施放後以少一次的版本回到手牌（3 → 2 → 最後一口） */
const drink = (next: string | null, ...effects: Effect[]): Ability[] => play(...effects, ...(next ? [fn('pdDrinkNext', { card: next })] : []));
/** 艾杜拉的寶藏（支線任務的戰利品） */
export const EUDORA_LOOT = [
  'VAC_464t2', 'VAC_464t3', 'VAC_464t4', 'VAC_464t5', 'VAC_464t6', 'VAC_464t7', 'VAC_464t8', 'VAC_464t9', 'VAC_464t10', 'VAC_464t11', 'VAC_464t12',
  'VAC_464t14', 'VAC_464t15', 'VAC_464t16', 'VAC_464t17', 'VAC_464t18', 'VAC_464t19', 'VAC_464t20', 'VAC_464t21', 'VAC_464t22', 'VAC_464t23',
  'VAC_464t24', 'VAC_464t25', 'VAC_464t26', 'VAC_464t27', 'VAC_464t28', 'VAC_464t29', 'VAC_464t30',
];
/** 葛利夫塔的護符：真品（給你）與贗品（給對手） */
export const GRIFTAH_AMULETS: [string, string][] = [
  ['VAC_959t01t', 'VAC_959t01'],
  ['VAC_959t05t', 'VAC_959t05'],
  ['VAC_959t06t', 'VAC_959t06'],
  ['VAC_959t07t', 'VAC_959t07'],
  ['VAC_959t08t', 'VAC_959t08'],
  ['VAC_959t09t', 'VAC_959t09'],
  ['VAC_959t10t', 'VAC_959t10'],
];
/** 卡瑞絲：兩種法術派系組合 → 變形後的卡 */
export const CARRESS_FORMS = [
  'VAC_449t', 'VAC_449t1', 'VAC_449t2', 'VAC_449t3', 'VAC_449t4', 'VAC_449t5', 'VAC_449t6', 'VAC_449t7', 'VAC_449t8', 'VAC_449t9', 'VAC_449t10',
  'VAC_449t11', 'VAC_449t12', 'VAC_449t13', 'VAC_449t14', 'VAC_449t15', 'VAC_449t16', 'VAC_449t17', 'VAC_449t18', 'VAC_449t19', 'VAC_449t20',
];

/** 卡瑞絲的六種效果（變形後的卡由其中兩種組成） */
const CARRESS_FX: Record<string, Effect> = {
  draw: draw(2),
  face: { e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 6 },
  freeze: { e: 'freeze', target: { t: 'random', filter: enemyMinions, count: 3 } },
  taunt: { e: 'buff', target: { t: 'self' }, atk: 2, hp: 2, keywords: ['TAUNT'] },
  heal: { e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 6 },
  destroy: { e: 'destroy', target: { t: 'random', filter: enemyMinions, count: 2 } },
  aoe: { e: 'damage', target: { t: 'all', filter: enemyMinions }, amount: 2 },
};
export const CARRESS_PAIRS: Record<string, [string, string]> = {
  VAC_449t: ['draw', 'face'], VAC_449t1: ['draw', 'freeze'], VAC_449t2: ['draw', 'taunt'], VAC_449t3: ['draw', 'heal'], VAC_449t4: ['draw', 'destroy'],
  VAC_449t5: ['draw', 'aoe'], VAC_449t6: ['face', 'freeze'], VAC_449t7: ['face', 'taunt'], VAC_449t8: ['face', 'heal'], VAC_449t9: ['face', 'destroy'],
  VAC_449t10: ['face', 'aoe'], VAC_449t11: ['taunt', 'freeze'], VAC_449t12: ['heal', 'freeze'], VAC_449t13: ['destroy', 'freeze'], VAC_449t14: ['aoe', 'freeze'],
  VAC_449t15: ['taunt', 'heal'], VAC_449t16: ['taunt', 'destroy'], VAC_449t17: ['taunt', 'aoe'], VAC_449t18: ['heal', 'destroy'], VAC_449t19: ['heal', 'aoe'],
  VAC_449t20: ['aoe', 'destroy'],
};

export const PARADISE_OVERRIDES: Record<string, Override> = {
  // ================================================================ 中立
  // 潮池學徒：戰吼：若你在持有這張牌時施放過 3 張法術，發現其中一張
  VAC_304: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('pdRememberSpell')] }], abilities: play(fn('pdTidepool')) },
  // 因辛迪斯：在你的回合結束時，升級你的噴發。戰吼：把 5 張噴發洗入你的牌堆
  VAC_321: { abilities: [...play(fn('pdShuffleEruptions')), ...endTurn(fn('pdUpgradeEruptions'))], tokens: ['VAC_321t'] },
  VAC_321t: { castsWhenDrawn: true, abilities: play(fn('pdEruption')) },
  // 沉睡的住客：嘲諷。亡語：所有其他手下陷入沉睡
  VAC_406: { keywords: ['TAUNT'], abilities: dr(fn('pdAllSleep')) },
  // 瞌睡的動物管理員：戰吼：為你的對手召喚一隻 8/8 野獸，它攻擊他們所有的手下
  VAC_421: { abilities: play(fn('pdZookeeper')), tokens: ['VAC_421t'] },
  // 度假村侍者：戰吼：發現一張最新擴充系列的卡
  VAC_432: { abilities: play({ e: 'discover', pool: { set: 1994, anyClass: true } }) },
  // 旅行社員工：戰吼：發現一張任何職業的地點牌
  VAC_438: { abilities: play({ e: 'discover', pool: { type: 'LOCATION', anyClass: true } }) },
  // 海邊巨人：本場對戰中你每使用一次地點牌，消耗減少 (2)
  VAC_439: { costRule: { per: 'locationsUsed', amount: 2 } },
  // 海關執法者：敵方不是一開始就在牌堆中的卡消耗增加 (2)
  VAC_440: { flags: ['customsEnforcer'] },
  // 包裹商人：在你抽一張牌後，有 50% 機率再抽一張
  VAC_441: { abilities: [{ on: { k: 'draw', side: 'friendly' }, effects: [fn('pdPackageDealer')] }] },
  // 點燈人：戰吼：造成 @ 點傷害（你每連續一個回合打出元素就提升）
  VAC_442: { target: optional(anyChar), abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'elementalStreak', base: 1 } }) },
  // 過度規劃者：戰吼：從你的牌堆選擇三張牌，依序放到牌堆頂
  VAC_444: { abilities: play(fn('pdOverplanner')) },
  // A.F.凱：在你的回合結束時，使所有本回合沒有攻擊的其他友方手下獲得 +2/+2
  VAC_446: { abilities: endTurn(fn('pdAFKay')) },
  // 恐懼逃兵：若此卡一開始不在你的牌堆中，具有衝鋒
  VAC_447: { kwIf: { cond: { c: 'notStarting' }, keywords: ['CHARGE'] } },
  // 飲料服務員：亡語：獲得一張隨機的飲料法術（有 3 次！）
  VAC_461: { abilities: dr(fn('addOneOf', { cards: ['VAC_323', 'VAC_338', 'VAC_404', 'VAC_520', 'VAC_916', 'VAC_951'] })) },
  // 禮賓員：你來自另一個職業的卡消耗減少 (1)
  VAC_463: { flags: ['concierge'] },
  // 莽撞的行李員：嘲諷。戰吼：若你持有消耗 (5) 以上的法術，召喚一個此手下的複製
  VAC_521: { keywords: ['TAUNT'], abilities: play(fn('pdBellhop')) },
  // 調酒師：戰吼：調製一瓶自訂的 1 費藥水
  VAC_523: { abilities: play(fn('pdMixologist')), tokens: ['VAC_523t', ...KAZAKUS_INGREDIENTS.CFM_621t11] },
  VAC_523t: {},
  // 剪貼簿學生：戰吼：召喚一個友方地點牌的複製
  VAC_529: { abilities: play(fn('pdCopyLocation')) },
  // 海灣鰭健美者：在你的回合中有手下為你的對手召喚後，沉默並消滅它
  VAC_531: { abilities: [{ on: { k: 'summon', side: 'enemy' }, effects: [fn('pdBayfin')] }] },
  // 椰子砲手：在相鄰的手下攻擊後，對一個隨機敵人造成 1 點傷害
  VAC_532: { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, cond: { c: 'itSelfOrAdjacent' }, effects: [fn('pdCoconut')] }] },
  // 店長馬林：戰吼：選擇一件奇妙寶物。把另外 3 件洗入你的牌堆
  VAC_702: { abilities: play(fn('pdMarin')), tokens: ['VAC_702t', 'VAC_702t2', 'VAC_702t3', 'VAC_702t4'] },
  VAC_702t: { abilities: play(fn('pdZarogsCrown')) },
  VAC_702t2: { abilities: play(fn('pdTolinsGoblet')) },
  VAC_702t3: { abilities: play(fn('pdWondrousWand')) },
  VAC_702t4: { keywords: ['TAUNT'], abilities: play(fn('pdGoldenKobold')) },
  // 武器侍從：戰吼：若你控制另一個海盜，從你的牌堆裝備一把隨機的武器
  VAC_924: { abilities: play(cond({ c: 'control', race: 'PIRATE' }, [fn('pdEquipFromDeck')])) },
  // 行李箱蠕蟲：戰吼：獲得一個 1 費的行李箱，把你牌堆頂的 2 張牌打包進去
  VAC_935: { abilities: play(fn('pdSuitcase')), tokens: ['VAC_935t', 'VAC_935t2'] },
  VAC_935t: { abilities: play(fn('pdUnpack')) },
  VAC_935t2: { abilities: play(fn('pdUnpack')) },
  // 章魚按摩師：對手下造成八倍傷害
  VAC_936: { flags: ['octuple'] },
  // 猴人粗漢：每當另一個友方海盜攻擊，使它獲得 +1/+1
  VAC_938: { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion' }, cond: { c: 'itRace', race: 'PIRATE' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 1, hp: 1 }] }] },
  // 浪潮池鞭笞者：戰吼：使所有其他手下 -1/-1。亡語：使所有其他手下 +1/+1
  VAC_947: {
    abilities: [
      ...play(fn('pdWaveShrink')),
      ...dr({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, atk: 1, hp: 1 }),
    ],
  },
  // 葛岡佐默：戰吼：獲得一張 2 費的乳酪，它會召喚三個 1 費手下。每回合升級
  VAC_955: { abilities: play(addCard('VAC_955t')), tokens: ['VAC_955t'] },
  VAC_955t: { handGrow: true, abilities: play(fn('pdCheese')) },
  // XB-931 管家機器人：在你使用地點牌後，獲得 3 點護甲
  VAC_956: { abilities: [{ on: { k: 'locationUsed' }, effects: [{ e: 'armor', amount: 3 }] }] },
  // 適應融合體：具有所有手下種族。亡語：把此手下洗入你的牌堆，保留所有附魔
  VAC_958: { races: ['ALL'], abilities: dr(fn('pdAmalgam')) },
  // 『可信賴的商人』葛利夫塔：戰吼：發現一個奇妙的護符給雙方玩家（敵方的是贗品！）
  VAC_959: { abilities: play(fn('pdGriftah')), tokens: GRIFTAH_AMULETS.flat() },
  VAC_959t01t: { target: enemyMinion, abilities: play(fn('pdPassions', { phony: false })) },
  VAC_959t01: { target: enemyMinion, abilities: play(fn('pdPassions', { phony: true })) },
  VAC_959t05t: { abilities: play({ e: 'addRandom', pool: { rarity: 'LEGENDARY', anyClass: true }, count: 3, who: 'self' }) },
  VAC_959t05: { abilities: play(fn('pdPhonyTracking')) },
  VAC_959t06t: { abilities: play(fn('pdCritters', { phony: false })) },
  VAC_959t06: { abilities: play(fn('pdCritters', { phony: true })) },
  VAC_959t07t: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 6, spell: true }) },
  VAC_959t07: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 6, spell: true }) },
  VAC_959t08t: { abilities: play({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 12 }) },
  VAC_959t08: { abilities: play({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 12 }, { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 6, spell: true }) },
  VAC_959t09t: { abilities: play(draw(3)) },
  VAC_959t09: { abilities: play(fn('pdPhonyMobility')) },
  VAC_959t10t: { abilities: play(fn('pdHandDiscount', { amount: 1 })) },
  VAC_959t10: { abilities: play(fn('pdHandDiscount', { amount: 1, noSpells: true })) },
  // 笨拙的服務員：在任何卡牌被抽到後，使它成為暫時的
  WORK_040: { flags: ['clumsySteward'] },
  // 忙碌的苦工：亡語：你的下一張地點牌消耗減少 (2)
  WORK_041: { abilities: dr({ e: 'pendingDiscount', d: { amount: 2, type: 'LOCATION' } }) },
  // 食肉小隔間：戰吼：消滅一個友方手下。在你的回合結束時召喚一個它的複製
  WORK_042: { target: optional(friendlyMinion), abilities: [...play(fn('pdCubicleEat')), ...endTurn(fn('pdCubicleSpit'))] },
  // 旅遊大師丹加：戰吼：從你的牌堆召喚三個來自不同擴充系列的手下
  WORK_043: { abilities: play(fn('pdDungar')) },
  // 夢想規劃師澤菲里斯：戰吼：選擇一個旅遊行程，從中獲得兩張可能完美的卡
  WORK_027: { abilities: play(fn('pdZephrys')), tokens: ['WORK_027t1', 'WORK_027t2', 'WORK_027t3'] },
  WORK_027t1: {},
  WORK_027t2: {},
  WORK_027t3: {},

  // ================================================================ 死亡騎士
  // 鈕扣：薩滿觀光客。戰吼：抽每種法術派系的法術各一張
  VAC_437: { tourist: 'SHAMAN', abilities: play(fn('pdButtons')) },

  // ================================================================ 惡魔獵人
  // 艾蘭娜：牧師觀光客。在你的回合，你的英雄受到的傷害會轉移到一個隨機敵人身上
  VAC_501: { tourist: 'PRIEST', flags: ['aranna'] },
  // 跳傘符印：在你的下個回合開始時，召喚兩個有衝鋒的 1/1 海盜
  VAC_925: { abilities: play({ e: 'delayed', turns: 1, effects: [summon('VAC_926t', 2)] }), tokens: ['VAC_926t'] },
  VAC_926t: { keywords: ['CHARGE'] },
  // 懸崖跳水：從你的牌堆召喚 2 個手下並使它們獲得突襲。它們會在你的回合結束時回去
  VAC_926: { abilities: play(fn('pdCliffDive')) },
  // 腎上腺素魔：在一個友方海盜攻擊後，本回合使你的英雄獲得 +1 攻擊力
  VAC_927: { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, cond: { c: 'itRace', race: 'PIRATE' }, effects: [{ e: 'heroAttack', amount: 1 }] }] },
  // 滑翔傘：雙方玩家各抽 3 張牌。流放：只有你抽
  VAC_928: { abilities: play(cond({ c: 'outcast' }, [draw(3)], [{ e: 'draw', count: 3, who: 'both' }])) },
  // 擦肩而過：選擇一個手下。本回合你的英雄從它身上偷取 4 點攻擊力
  VAC_931: { target: anyMinion, abilities: play(fn('pdSkirting')) },
  // 攀岩鉤：在你控制攻擊力 5 以上的手下時，不會失去耐久度
  VAC_932: { flags: ['climbingHook'] },
  // 飛行員派奇：戰吼：把六個降落傘洗入你的牌堆
  VAC_933: { abilities: play({ e: 'shuffle', card: 'VAC_933t', count: 6 }), tokens: ['VAC_933t'] },
  VAC_933t: { castsWhenDrawn: true, abilities: play(summon('VAC_926t')), tokens: ['VAC_926t'] },
  // 惡魔交易：生命竊取。對一個手下造成 4 點傷害。把一個隨機的消耗 (5) 以上的惡魔放到你的牌堆頂
  WORK_014: { keywords: ['LIFESTEAL'], target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 4, spell: true }, fn('pdDemonOnTop')) },
  // 靈魂小販：突襲。亡語：使你手牌中一個隨機手下消耗減少 (6)
  WORK_015: { keywords: ['RUSH'], abilities: dr(fn('pdRandomHandMinionCost', { amount: -6 })) },

  // ================================================================ 德魯伊
  // 郵輪船長蘿拉：戰吼：召喚 2 個隨機的地點牌
  VAC_506: { abilities: play(fn('pdRandomLocations', { count: 2 })) },
  // 綜合堅果：下個回合獲得 2 個法力水晶
  VAC_508: { abilities: play({ e: 'delayed', turns: 1, effects: [{ e: 'mana', kind: 'temp', amount: 2 }] }) },
  // 打瞌睡的龍：休眠 2 個回合。休眠時，在你的回合結束時召喚一隻 3/5 有嘲諷的龍
  VAC_511: { abilities: [...play(fn('pdDormantSelf', { turns: 2 })), ...endTurn(cond({ c: 'selfDormant' }, [summon('VAC_511t')]))], tokens: ['VAC_511t'] },
  VAC_511t: { keywords: ['TAUNT'] },
  // 陸龜旅行者：嘲諷。亡語：抽另一張嘲諷手下，消耗減少 (2)
  VAC_518: { keywords: ['TAUNT'], abilities: dr(draw(1, { type: 'MINION', keyword: 'TAUNT' }), { e: 'costMod', amount: -2, scope: 'it' }) },
  // 米斯塔維斯塔：法師觀光客。戰吼：3 個回合後，重新施放這段時間內你施放的每個法術
  VAC_519: { tourist: 'MAGE', abilities: play(fn('pdVista')) },
  // 星空下入睡：選三次：抽 2 張牌；獲得 5 點護甲；重新整理 3 個法力水晶
  VAC_907: { abilities: play(fn('pdChooseThrice', { options: ['VAC_907t1', 'VAC_907t2', 'VAC_907t3'] })), tokens: ['VAC_907t1', 'VAC_907t2', 'VAC_907t3'] },
  VAC_907t1: { abilities: play(draw(2)) },
  VAC_907t2: { abilities: play({ e: 'armor', amount: 5 }) },
  VAC_907t3: { abilities: play({ e: 'mana', kind: 'refresh', amount: 3 }) },
  // 補水站：復活三個你不同的、消耗最高的嘲諷手下
  VAC_948: { abilities: play(fn('pdHydration')) },
  // 新高度：法力水晶上限增加 3，獲得一個空的法力水晶
  VAC_949: { abilities: play(fn('pdNewHeights')) },
  // 抱石夥伴：突襲、嘲諷。若你有至少 10 個法力水晶，消耗為 (1)
  VAC_950: { keywords: ['RUSH', 'TAUNT'], costIf: { cond: { c: 'maxMana', n: 10 }, cost: 1 } },
  // 小心輕放的熊：獲得兩隻 3/3 有嘲諷的熊。每個回合在你的手牌中時，獲得 +1/+1
  WORK_024: { abilities: play(addCard('WORK_024t', 2)), tokens: ['WORK_024t'] },
  WORK_024t: { keywords: ['TAUNT'], flags: ['growInHand'] },
  // 數字運算師：突襲、嘲諷。選三次：+2 攻擊力；或 +2 生命值
  WORK_025: { keywords: ['RUSH', 'TAUNT'], abilities: play(fn('pdChooseThrice', { options: ['WORK_025a', 'WORK_025b'] })), tokens: ['WORK_025a', 'WORK_025b'] },
  WORK_025a: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: 2 }) },
  WORK_025b: { abilities: play({ e: 'buff', target: { t: 'self' }, hp: 2 }) },
  // 安戈洛旅遊手冊：抽兩張手下，使它們獲得 +2/+2（每回合翻面）
  WORK_050: { handShift: { kind: 'swap', into: 'WORK_050t' }, abilities: play(fn('pdDrawBuff', { pool: { type: 'MINION' }, atk: 2, hp: 2 })), tokens: ['WORK_050t'] },
  WORK_050t: { handShift: { kind: 'swap', into: 'WORK_050' }, abilities: play(fn('pdDrawBuff', { pool: { type: 'SPELL' }, cost: -1 })) },

  // ================================================================ 獵人
  // 聒噪的金剛鸚鵡：戰吼：對一個敵人重複你施放的上一個法術（盡可能隨機）
  VAC_407: { abilities: play(fn('pdMacaw')) },
  // 賞鳥：從你的牌堆發現一個手下。使它所有的複製獲得 +2/+1（不論在哪裡）
  VAC_408: { abilities: play(fn('pdBirdwatching')) },
  // 憤怒的鳥群：選擇一個敵人。召喚兩隻攻擊時免疫的 3/3 鳥去攻擊它
  VAC_410: { target: { filter: { type: 'character', side: 'enemy' } }, abilities: play(fn('pdFuriousFowls')), tokens: ['VAC_410t'] },
  VAC_410t: { flags: ['immuneAttacking'] },
  // 遊騎兵吉莉：戰士觀光客。在你的回合結束時，獲得一隻 2/3 鱷魚。亡語：使你手牌中的所有手下獲得 +2/+3
  VAC_413: { tourist: 'WARRIOR', abilities: [...endTurn(addCard('VAC_413t')), ...dr({ e: 'handBuff', atk: 2, hp: 3, scope: 'all' })], tokens: ['VAC_413t'] },
  VAC_413t: {},
  // 薩斯奎克：戰吼：重複你上個回合打出的每張卡
  VAC_415: { abilities: play(fn('pdSasquawk')) },
  // 死亡翻滾：消滅一個敵方手下。對所有敵人隨機分配等同其攻擊力的傷害
  VAC_416: { target: enemyMinion, abilities: play(fn('pdDeathRoll')) },
  // 可信賴的釣竿：在你的英雄攻擊後，從你的牌堆召喚一個 1 費手下
  VAC_960: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [{ e: 'recruit', count: 1, cost: 1 }] }] },
  // 寵物鸚鵡：戰吼：重複你打出的上一張 1 費卡
  VAC_961: { abilities: play(fn('pdPetParrot')) },
  // 役馬：亡語：召喚兩隻 2/1 小馬
  WORK_018: { abilities: dr(summon('WORK_018t', 2)), tokens: ['WORK_018t'] },
  WORK_018t: {},
  // 搖錢牛：嘲諷。每當此手下受到傷害，獲得一枚幸運幣
  WORK_019: { keywords: ['TAUNT'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [addCard('GAME_005')] }] },
  // 猴子把戲：把 8 根香蕉加入你的手牌，放不下的隨機餵給友方手下
  WORK_020: { abilities: play(fn('pdMonkeyBusiness')), tokens: ['EX1_014t'] },
  // 突布洛斯：獵人觀光客。戰吼：使你手牌、牌堆與戰場上所有其他戰吼手下獲得 +1/+1
  WORK_013: { tourist: 'HUNTER', abilities: play(fn('pdTurbulus')) },

  // ================================================================ 法師
  // 蕾拉：聖騎士觀光客。在你施放一個法術後，召喚一個隨機的 2 費手下，並使它獲得聖盾
  VAC_424: { tourist: 'PALADIN', abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('pdRaylla')] }] },
  // 隨波逐流：選擇一個手下。若是敵方，凍結它；若是友方，使它獲得法術傷害 +1
  VAC_428: { target: anyMinion, abilities: play(cond({ c: 'chosenFriendly' }, [fn('pdSpellDamageChosen')], [{ e: 'freeze', target: { t: 'chosen' } }])) },
  // 在海底：抽一張不同的法術。召喚一個與該法術消耗相同的隨機手下
  VAC_431: { abilities: play(fn('pdUnderTheSea')) },
  // 受困的大法師：你每回合的第一張法術消耗減少 (2)
  VAC_435: { auras: [{ scope: 'firstSpellDiscount', cost: 2 }] },
  // 衝浪足類：戰吼：你抽到的下一張法術會在抽到時施放
  VAC_443: { abilities: play(fn('pdSurfalopod')) },
  // 海嘯：召喚三個會凍結的 3/6 水元素。它們攻擊隨機敵人
  VAC_509: { abilities: play(fn('pdTsunami')), tokens: ['VAC_509t'] },
  VAC_509t: { keywords: ['FREEZE_ON_DAMAGE'] },
  // 海風聖杯：對所有敵方手下隨機分配 2 點傷害（3 次）
  VAC_520: { abilities: drink('VAC_520t', { e: 'splitDamage', filter: enemyMinions, amount: 2, spell: true }), tokens: ['VAC_520t'] },
  VAC_520t: { abilities: drink('VAC_520t2', { e: 'splitDamage', filter: enemyMinions, amount: 2, spell: true }), tokens: ['VAC_520t2'] },
  VAC_520t2: { abilities: drink(null, { e: 'splitDamage', filter: enemyMinions, amount: 2, spell: true }) },
  // 潮汐之王：戰吼：直到你的下個回合結束，雙方的法術消耗為 (5)
  VAC_524: { abilities: play(fn('pdKingTide')) },
  // 漲潮：對所有手下造成 2 點傷害。若沒有手下死亡，再造成 2 點
  VAC_953: { abilities: play(fn('pdRisingWaves')) },
  // 擠成一團：用隨機的納迦填滿你的戰場
  WORK_012: { abilities: play(fn('pdHuddleUp')) },
  // 燃燒殆盡：抽 3 張牌並點燃它們。3 個回合後，還在手牌中的會被摧毀
  WORK_026: { abilities: play(fn('pdBurndown')) },
  // 傳送術士絲凱拉：盜賊觀光客。戰吼：交換你手牌中消耗最低與最高的法術的消耗
  WORK_063: { tourist: 'ROGUE', abilities: play(fn('pdSkyla')) },

  // ================================================================ 聖騎士
  // 琳尼莎：盜賊觀光客。你消耗 (2) 以下的法術施放兩次
  VAC_507: { tourist: 'ROGUE', flags: ['lynessa'] },
  // 聖釀：使一個角色獲得聖盾（3 次）
  VAC_916: { target: anyChar, abilities: drink('VAC_916t2', fn('pdDivineShield')), tokens: ['VAC_916t2'] },
  VAC_916t2: { target: anyChar, abilities: drink('VAC_916t3', fn('pdDivineShield')), tokens: ['VAC_916t3'] },
  VAC_916t3: { target: anyChar, abilities: drink(null, fn('pdDivineShield')) },
  // 燒烤大師：戰吼：抽你消耗最低的牌。亡語：抽你消耗最高的牌
  VAC_917: { abilities: [...play(fn('pdDrawExtreme', { high: false })), ...dr(fn('pdDrawExtreme', { high: true }))] },
  // 救生員：嘲諷。戰吼：你施放的下一張法術具有生命竊取
  VAC_919: { keywords: ['TAUNT'], abilities: play(fn('pdLifeguard')) },
  // 發球王牌：在此手下獲得攻擊力後，使你手牌中消耗最高的牌消耗減少 (1)
  VAC_920: { flags: ['serviceAce'] },
  // 排球大錘：在你的英雄攻擊後，獲得一張 1 費、+1/+2 的防曬乳
  VAC_921: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [addCard('VAC_917t')] }], tokens: ['VAC_917t'] },
  VAC_917t: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 2 }) },
  // 救生光環：在你的回合結束時，獲得一張 1 費、+1/+2 的防曬乳。持續 3 個回合
  VAC_922: { objective: 3, abilities: [...play(fn('objective')), ...endTurn(addCard('VAC_917t'))], tokens: ['VAC_917t'] },
  // 聖亞瑟爾：突襲。在此手下攻擊後，變成地點牌
  VAC_923: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('pdSancAzel')] }], tokens: ['VAC_923t'] },
  VAC_923t: { target: friendlyMinion, abilities: play(fn('pdSancAzelLoc')) },
  // 海上船歌：召喚三個 5/5 海盜。本場對戰中你每對角色施放一張法術，消耗減少 (1)
  VAC_558: { costRule: { per: 'spellsOnChars', amount: 1 }, abilities: play(summon('VAC_558t', 3)), tokens: ['VAC_558t'] },
  VAC_558t: {},
  // 信任倒下：發現兩個消耗 (5) 以下的手下。它們獲得對方的攻擊力與生命值
  WORK_001: { abilities: play(fn('pdTrustFall')) },
  // 忙碌機器人：戰吼：使你攻擊力為 1 的手下獲得 +1/+1
  WORK_002: { abilities: play(fn('pdBusyBot')) },

  // ================================================================ 牧師
  // 茄香茶：對一個手下造成 2 點傷害。對你的英雄造成 2 點傷害（3 次）
  VAC_404: { target: anyMinion, abilities: drink('VAC_404t1', ...nightshade()), tokens: ['VAC_404t1'] },
  VAC_404t1: { target: anyMinion, abilities: drink('VAC_404t2', ...nightshade()), tokens: ['VAC_404t2'] },
  VAC_404t2: { target: anyMinion, abilities: drink(null, ...nightshade()) },
  // 熱炭：對所有敵人造成 2 點傷害。若你的英雄本回合受到過傷害，多造成 1 點
  VAC_414: { abilities: play(cond({ c: 'heroDamagedThisTurn' }, [{ e: 'damage', target: allEnemies, amount: 3, spell: true }], [{ e: 'damage', target: allEnemies, amount: 2, spell: true }])) },
  // 感官剝奪：召喚一個敵方手下的複製。若你的生命值在 20 以下，消滅原本的手下
  VAC_417: { target: enemyMinion, abilities: play(fn('pdSensoryDeprivation')) },
  // 三溫暖常客：嘲諷。你的英雄在你的回合每受到一次傷害，消耗減少 (1)
  VAC_418: { keywords: ['TAUNT'], costRule: { per: 'ownTurnHits', amount: 1 } },
  // 納蘭‧幻想家：戰吼：獲得兩張你牌堆頂那張牌的複製（占卜）
  VAC_420: { abilities: play(fn('pdFortunes')) },
  // 暮光靈媒：嘲諷。戰吼：把你牌堆頂的牌消耗設為 (0)
  VAC_423: { keywords: ['TAUNT'], abilities: play(fn('pdTopCardFree')) },
  // 安息吧：雙方玩家各召喚本場對戰中死亡的、消耗最高的手下
  VAC_457: { abilities: play(fn('pdRestInPeace')) },
  // 按摩大腦：每當此手下受到傷害，也對你的英雄造成等量的傷害
  VAC_512: { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: { dyn: 'eventAmount' } }] }] },
  // 冰涼的沃金：獵人觀光客。戰吼：選擇 2 個手下，交換它們的屬性值
  VAC_957: { tourist: 'HUNTER', abilities: play(fn('pdVoljin')) },
  // 銀月城旅遊手冊：本回合使一個手下免疫並 +2/+2（每回合翻面）
  WORK_017: {
    handShift: { kind: 'swap', into: 'WORK_017t' },
    target: anyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, { e: 'buff', target: { t: 'chosen' }, keywords: ['IMMUNE'], temp: true }),
    tokens: ['WORK_017t'],
  },
  WORK_017t: { handShift: { kind: 'swap', into: 'WORK_017' }, target: anyMinion, abilities: play({ e: 'silence', target: { t: 'chosen' } }, { e: 'buff', target: { t: 'chosen' }, atk: -2, hp: -2 }) },
  // 繁榮使者：戰吼：把你手牌中消耗最高的牌放到你的牌堆頂
  WORK_031: { abilities: play(fn('pdEnvoy')) },
  // 影子員工：戰吼：若你的英雄本回合受到過傷害，召喚一個此手下的複製
  WORK_032: { abilities: play(cond({ c: 'heroDamagedThisTurn' }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },

  // ================================================================ 盜賊
  // 海上推銷員：戰吼：你打出的下一張來自另一個職業的卡消耗減少 (2)
  VAC_332: { abilities: play(fn('pdNextOtherClass', { amount: 2 })) },
  // 詭計騙徒：戰吼：重新打出你打出的上一張來自另一個職業的卡
  VAC_333: { abilities: play(fn('pdConman')) },
  // 小偷小摸：獲得兩張隨機的、來自其他職業的 1 費法術
  VAC_335: { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', cost: 1, otherClass: true }, count: 2, who: 'self' }) },
  // 面具商人瑪艾斯特拉：術士觀光客。戰吼：發現一張來自過去的英雄卡（另一個職業）
  VAC_336: { tourist: 'WARLOCK', abilities: play({ e: 'discover', pool: { type: 'HERO', otherClass: true } }) },
  // 寶藏獵人艾杜拉：戰吼：進行支線任務，發現奇妙的戰利品！打出 3 張來自其他職業的卡來完成
  VAC_464: { abilities: play(fn('pdEudoraStart')), tokens: ['VAC_464t', ...EUDORA_LOOT, 'VAC_464t27t', 'VAC_464t31'] },
  VAC_464t: {},
  VAC_464t2: { target: anyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  VAC_464t3: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 4, hp: 4, keywords: ['TAUNT'] }) },
  VAC_464t4: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero' }, effects: [fn('pdExorcisor')] }] },
  VAC_464t5: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 8, spell: true }, { e: 'freeze', target: { t: 'hero', side: 'enemy' } }) },
  VAC_464t6: { abilities: play(fn('pdBubba')), tokens: ['GILA_400t'] },
  VAC_464t7: { target: anyMinion, abilities: play(fn('pdHolyBook')) },
  VAC_464t8: { target: optional(anyMinion), abilities: play(fn('pdCrusty')) },
  VAC_464t9: { abilities: play(draw(2), { e: 'armor', amount: 4 }) },
  VAC_464t10: { abilities: play(fn('pdSpyglass')) },
  VAC_464t11: { abilities: [{ on: { k: 'summoned' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: { dyn: 'spellsCastThisGame' }, hp: { dyn: 'spellsCastThisGame' } }] }] },
  VAC_464t12: { abilities: play(fn('pdPuzzleBox')) },
  VAC_464t14: { keywords: ['POISONOUS'], flags: ['immuneAttacking'] },
  VAC_464t15: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, keywords: ['RUSH', 'WINDFURY', 'DIVINE_SHIELD', 'LIFESTEAL', 'POISONOUS', 'TAUNT', 'STEALTH'] }) },
  VAC_464t16: { abilities: play({ e: 'silence', target: { t: 'all', filter: enemyMinions } }, { e: 'destroy', target: { t: 'all', filter: enemyMinions } }) },
  VAC_464t17: { abilities: play(fn('pdSnakes')), tokens: ['EX1_554t'] },
  VAC_464t18: {
    abilities: play({
      e: 'buff',
      target: { t: 'all', filter: { type: 'minion', side: 'friendly' } },
      abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, count: 1, who: 'self' }),
    }),
  },
  VAC_464t19: { target: anyMinion, abilities: play(fn('pdReflections')) },
  VAC_464t20: { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, { e: 'summonCopy', target: { t: 'chosen' }, count: 2 }) },
  VAC_464t21: { abilities: play(summon('GVG_110t', 7)), tokens: ['GVG_110t'] },
  VAC_464t22: { abilities: dr({ e: 'summon', card: 'VAC_464t22', count: 1, who: 'self' }) },
  VAC_464t23: { abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 8, spell: true }] }) },
  VAC_464t24: { costRule: { per: 'deathsThisGame', amount: 1 }, abilities: play({ e: 'damage', target: allEnemies, amount: 7, spell: true }) },
  VAC_464t25: { abilities: play(fn('pdAnnoyo')), tokens: ['GVG_085'] },
  VAC_464t26: { abilities: endTurn({ e: 'summonCopy', target: { t: 'self' }, count: 1 }) },
  VAC_464t27: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('pdBeastlyBeauty')] }], tokens: ['VAC_464t27t'] },
  VAC_464t27t: {},
  VAC_464t28: { target: anyMinion, abilities: play(fn('pdVampiricFangs')) },
  VAC_464t29: { abilities: play(fn('pdQuelDelar', { piece: 'blade' })), tokens: ['VAC_464t31'] },
  VAC_464t30: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }, fn('pdQuelDelar', { piece: 'hilt' })), tokens: ['VAC_464t31'] },
  VAC_464t31: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [{ e: 'damage', target: allEnemies, amount: 4 }] }] },
  // 奪了就跑：隨機消滅兩個敵方手下。本場對戰中你每打出一張來自另一個職業的卡，消耗減少 (1)
  VAC_700: { costRule: { per: 'otherClassPlayed', amount: 1 }, abilities: play({ e: 'destroy', target: { t: 'random', filter: enemyMinions, count: 2 } }) },
  // 黑鬍子擦劍手：戰吼：把你武器的攻擊力與耐久度設為 3
  VAC_701: { abilities: play(fn('pdSwordshiner')) },
  // 間諜機構：把每個其他職業的卡各一張洗入你的牌堆，它們消耗 (1)。抽一張
  WORK_004: { abilities: play(fn('pdEspionage')) },
  // 機器電話推銷員：戰吼：抽一張 {0}、{1} 和 {2} 費的卡（每回合隨機撥號！）
  WORK_006: { abilities: play(fn('pdRobocaller')) },

  // ================================================================ 薩滿
  // 炫目歌手：戰吼：召喚一個隨機的 5 費手下。本場對戰中你每施放過一種法術派系，就重複一次
  VAC_301: { abilities: play({ e: 'summonRandom', pool: { type: 'MINION', cost: 5, anyClass: true }, count: 1, who: 'self' }, { e: 'repeat', times: { dyn: 'schoolsCast' }, effects: [{ e: 'summonRandom', pool: { type: 'MINION', cost: 5, anyClass: true }, count: 1, who: 'self' }] }) },
  // 冰霜裝飾：召喚兩個有嘲諷與「亡語：獲得 4 點護甲」的 2/4 元素
  VAC_305: { abilities: play(summon('VAC_305t', 2)), tokens: ['VAC_305t'] },
  VAC_305t: { keywords: ['TAUNT'], abilities: dr({ e: 'armor', amount: 4 }) },
  // 海妖之歌：獲得兩張隨機的、你在本場對戰中沒有施放過的法術派系的法術
  VAC_308: { abilities: play(fn('pdSirenSong')) },
  // 麥芽岩漿：對所有敵人造成 1 點傷害（3 次）
  VAC_323: { abilities: drink('VAC_323t', { e: 'damage', target: allEnemies, amount: 1, spell: true }), tokens: ['VAC_323t'] },
  VAC_323t: { abilities: drink('VAC_323t2', { e: 'damage', target: allEnemies, amount: 1, spell: true }), tokens: ['VAC_323t2'] },
  VAC_323t2: { abilities: drink(null, { e: 'damage', target: allEnemies, amount: 1, spell: true }) },
  // 搭配的服裝：把一個手下變形成一個消耗多 (1) 的隨機手下，然後召喚它的複製
  VAC_324: { target: anyMinion, abilities: play(fn('pdMatchingOutfits')) },
  // 融化元素：嘲諷。此手下永久被凍結
  VAC_328: { keywords: ['TAUNT'], flags: ['permaFrozen'] },
  // 天賦異稟：獲得一個隨機的納迦與一張隨機的法術。它們消耗減少 (2)
  VAC_329: { abilities: play(fn('pdNaturalTalent')) },
  // 卡瑞絲：在你的手牌中時，打出兩種不同的法術派系來變形
  VAC_449: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('pdCarress')] }], tokens: CARRESS_FORMS },
  ...Object.fromEntries(CARRESS_FORMS.map((id) => [id, { abilities: play(...CARRESS_PAIRS[id].map((k) => CARRESS_FX[k])) }])),
  // 無憂的餅乾：惡魔獵人觀光客。在一個友方手下死亡後，召喚一個消耗多 (1) 的隨機手下
  VAC_450: { tourist: 'DEMONHUNTER', abilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('pdCookie')] }] },
  // 歌舞明星：戰吼：使你手牌中每種派系的法術各一張消耗減少 (2)
  VAC_954: { abilities: play(fn('pdHeadliner')) },
  // 冰冠城旅遊手冊：對一個手下造成 3 點傷害並凍結其相鄰手下（每回合翻面）
  WORK_030: {
    handShift: { kind: 'swap', into: 'WORK_030t' },
    target: anyMinion,
    abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, { e: 'freeze', target: { t: 'adjacent', of: 'chosen' } }),
    tokens: ['WORK_030t'],
  },
  WORK_030t: {
    handShift: { kind: 'swap', into: 'WORK_030' },
    target: anyMinion,
    abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, { e: 'damage', target: { t: 'adjacent', of: 'chosen' }, amount: 1, spell: true }),
  },

  // ================================================================ 術士
  // 召喚師黑骨：死亡騎士觀光客。你的亡語觸發兩次。在你打出亡語手下後，消滅它
  VAC_503: { tourist: 'DEATHKNIGHT', flags: ['doubleDeathrattle'], abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasDeathrattle' }, effects: [{ e: 'destroy', target: { t: 'it' } }] }] },
  // 吃！那！小鬼！：消滅一個友方手下來抽 3 張牌
  VAC_939: { target: friendlyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, draw(3)) },
  // 宣告黑暗：把你的英雄能力與非術士卡牌換成術士的。它們消耗減少 (1)
  VAC_941: { abilities: play(fn('pdAnnounceDarkness')) },
  // 無畏的火焰雜耍者：戰吼：獲得等同你的英雄本回合受到的傷害的屬性值
  VAC_942: { abilities: play(fn('pdFlamejuggler')) },
  // 犧牲的小鬼：亡語：若是你的回合，召喚一個 6/6 有嘲諷的小鬼
  VAC_943: { abilities: dr(cond({ c: 'not', cond: { c: 'opponentTurn' } }, [summon('VAC_943t')])), tokens: ['VAC_943t'] },
  VAC_943t: { keywords: ['TAUNT'] },
  // 詛咒紀念品：使一個手下獲得 +3/+3 與「在你的回合開始時，對你的英雄造成 3 點傷害」
  VAC_944: {
    target: anyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3, abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 3 }] }] }),
  },
  // 派對策劃者沃娜：戰吼：若你在自己的回合受到過 8 點傷害，召喚烏洛波斯
  VAC_945: { abilities: play(cond({ c: 'ownTurnDamage', n: 8 }, [summon('VAC_945t')])), tokens: ['VAC_945t'] },
  VAC_945t: { keywords: ['TAUNT'], abilities: dr(fn('pdOurobos')) },
  // 「健康」飲料：生命竊取。對一個手下造成 3 點傷害（3 次）
  VAC_951: { keywords: ['LIFESTEAL'], target: anyMinion, abilities: drink('VAC_951t', { e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }), tokens: ['VAC_951t'] },
  VAC_951t: { keywords: ['LIFESTEAL'], target: anyMinion, abilities: drink('VAC_951t2', { e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }), tokens: ['VAC_951t2'] },
  VAC_951t2: { keywords: ['LIFESTEAL'], target: anyMinion, abilities: drink(null, { e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }) },
  // 邪火營火：對一個手下造成 4 點傷害。若它死亡，你的下一個亡語手下消耗減少 (3)
  VAC_952: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 4, spell: true }, fn('pdBonfire')) },
  // 截止期限：可交易、暫時。消滅一個手下
  WORK_007: { keywords: ['TRADEABLE'], flags: ['temporaryCard'], target: anyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  // 細則：對所有手下造成 4 點傷害（溢出傷害會擊中你的英雄）
  WORK_008: { abilities: play(fn('pdFinePrint')) },

  // ================================================================ 戰士
  // 雜貨店廚師：可交易、嘲諷。當你抽到這張牌時，獲得一張它的複製
  VAC_337: { keywords: ['TRADEABLE', 'TAUNT'], abilities: [{ on: { k: 'drawn' }, effects: [addCard('VAC_337')] }] },
  // 一杯肌肉：使你手牌中的一個手下獲得 +2/+1（3 次）
  VAC_338: { abilities: drink('VAC_338t', { e: 'handBuff', atk: 2, hp: 1, scope: 'random' }), tokens: ['VAC_338t'] },
  VAC_338t: { abilities: drink('VAC_338t2', { e: 'handBuff', atk: 2, hp: 1, scope: 'random' }), tokens: ['VAC_338t2'] },
  VAC_338t2: { abilities: drink(null, { e: 'handBuff', atk: 2, hp: 1, scope: 'random' }) },
  // 蒙斯特怪：嘲諷。在你的回合結束時，召喚一個屬性值等同此手下的元素
  VAC_339: { keywords: ['TAUNT'], abilities: endTurn(fn('pdMuenster')), tokens: ['VAC_339t'] },
  VAC_339t: {},
  // 飢餓的哈姆：德魯伊觀光客。嘲諷。在你的回合結束時，吃掉敵方牌堆中的一個手下來獲得 +2/+2
  VAC_340: { tourist: 'DRUID', keywords: ['TAUNT'], abilities: endTurn(fn('pdHamm')) },
  // 半熟的魷魚：戰吼：消滅一個攻擊力不高於此手下的敵方手下
  VAC_341: { target: { filter: { type: 'minion', side: 'enemy' }, optional: true }, abilities: play(fn('pdCalamari')) },
  // 『剁麥者』：戰吼與亡語：獲得一片麵包（獲得 2 片可以把中間的手下夾成三明治！）
  VAC_525: { abilities: [...play(fn('pdBread')), ...dr(fn('pdBread'))], tokens: ['VAC_525t1', 'VAC_525t2'] },
  VAC_525t1: {},
  VAC_525t2: { abilities: play(fn('pdSandwich')) },
  // 燒烤：對一個手下造成 7 點傷害。使你手牌中的一個隨機手下獲得等同溢出傷害的屬性值
  VAC_526: { target: anyMinion, abilities: play(fn('pdChar')) },
  // 龍族佳餚：突襲、法術免疫。每次最多受到 1 點傷害
  VAC_527: { keywords: ['RUSH', 'ELUSIVE'], flags: ['damageCap1'] },
  // 吃到飽：抽三張不同種族的手下
  VAC_528: { abilities: play(fn('pdAllYouCanEat')) },
  // 食物大戰：為你的對手召喚一個 0/4 的主菜。它死亡時，從你的牌堆召喚一個手下
  VAC_533: { abilities: play(fn('pdFoodFight')), tokens: ['VAC_533t'] },
  VAC_533t: { abilities: dr(fn('pdEntree')) },
  // 保留座位：使你手牌中的一個隨機手下獲得 +4/+4。若它是唯一的手下，消耗減少 (2)
  WORK_021: { abilities: play(fn('pdReservedSpot')) },
  // 打卡：本回合使你的英雄獲得 +3 攻擊力與「也會傷害相鄰的手下」
  WORK_022: { abilities: play({ e: 'heroAttack', amount: 3 }, fn('pdPunchCard')) },
  // 合金顧問：嘲諷。每當此手下受到傷害，獲得 3 點護甲
  WORK_023: { keywords: ['TAUNT'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'armor', amount: 3 }] }] },
};

function nightshade(): Effect[] {
  return [
    { e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true },
    { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2, spell: true },
  ];
}
