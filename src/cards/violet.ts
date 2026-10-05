// ============================================================================
// 逃離紫羅蘭堡（系列 1988，卡號 JAIL_ / CAP_）：手動定義的卡牌效果。
// 新機制：預備（prepare）、偽裝（disguised）、對戰開始（startOfGame）、跟隨…、小鬼線人、砲手、虛無等。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import { FOLLOW_EFFECTS } from './follow';
import { KAZAKUS_TOKENS } from './kazakus';
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const atStartOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnStart', whose: 'mine' }, effects }];
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyChar: TargetReq = { filter: { type: 'character', side: 'enemy' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allFriendly = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const otherFriendly = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const, excludeSelf: true } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const heroHit = (a: Ability['effects']): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: a }];
const summonRandom = (pool: Extract<Effect, { e: 'summonRandom' }>['pool'], count: number): Effect => ({ e: 'summonRandom', pool, count, who: 'self' });
const stealthAttack = (...effects: Effect[]): Ability[] => [
  { on: { k: 'attack', subject: 'friendlyMinion', after: false }, cond: { c: 'itKeyword', k: 'STEALTH' }, effects },
];
/** 打出後給「它」賦予（本回合的）效果：跟隨… */
const followCard = (id: string, extra: Override = {}): Override => ({ ...extra, abilities: play(...FOLLOW_EFFECTS[id]) });

const CRIMES = ['CAP_405t1', 'CAP_405t2', 'CAP_405t3', 'CAP_405t4', 'CAP_405t5', 'CAP_405t6', 'CAP_405t7', 'CAP_405t8', 'CAP_405t9'];
const TRIALS = ['CAP_405tb1', 'CAP_405tb2', 'CAP_405tb3'];
const AMMO = ['JAIL_458t1', 'JAIL_458t2', 'JAIL_458t3', 'JAIL_458t4'];
const COINS = ['JAIL_504t', 'JAIL_504t2', 'JAIL_504t3', 'JAIL_504t3p'];
const tripped = (_card: string, ...effects: Effect[]): Override => ({ castsWhenDrawn: true, abilities: play(...effects) });

export const VIOLET_OVERRIDES: Record<string, Override> = {
  // ============================================================== 盜賊：潛行
  // 軍情七處殺戮者：每當友方潛行手下攻擊時，賦予其 +2/+2
  CAP_000: { keywords: ['STEALTH'], abilities: stealthAttack({ e: 'buff', target: { t: 'it' }, atk: 2, hp: 2 }) },
  // 靜默打擊：賦予一個手下 +3 攻擊力。若它有潛行，對一個隨機敵方手下造成等同其攻擊力的傷害
  CAP_001: { target: anyMinion, abilities: play(fn('silentStrike')) },
  // 跟隨足跡：發現一個潛行手下。本回合賦予它此效果
  CAP_002: followCard('footsteps'),
  // 偽裝的特工：可在雙方牌桌打出。衝刺。亡語：你的對手抽 2 張牌
  CAP_004: { disguised: true, keywords: ['RUSH'], abilities: dr({ e: 'draw', count: 2, who: 'opponent' }) },
  // 馬迪亞斯‧肖爾：每當友方潛行手下攻擊時，使你一張隨機手牌的消耗降低 (3)
  CAP_005: { keywords: ['STEALTH'], abilities: stealthAttack(fn('discountRandomInHand', { amount: 3 })) },
  // 偷天換日：造成 1 點傷害。若此牌在手中時有潛行手下攻擊過，改為造成 3 點傷害
  CAP_006: {
    target: anyChar,
    abilities: play(cond({ c: 'handCounter', n: 1 }, [hit(3)], [hit(1)])),
    handAbilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: false }, cond: { c: 'itKeyword', k: 'STEALTH' }, effects: [fn('counterInHand')] }],
  },

  // ============================================================== 戰士：砲手
  // 跟隨引線
  CAP_101: followCard('fuse'),
  // 手砲：在你的英雄攻擊後，你的砲手會開火！
  CAP_103: { abilities: heroHit([fn('fireCannoneers')]) },
  // 爆破火藥工程師：在你的回合，友方海盜造成的傷害提高 1 點
  CAP_104: { flags: ['pirateBonus'] },
  // 克羅雷船長：你的砲手額外發射一次。戰吼：召喚兩個 1/1 砲手
  CAP_106: { flags: ['extraShot'], abilities: play({ e: 'summon', card: 'CAP_107t', count: 2, who: 'self' }), tokens: ['CAP_107t'] },
  // 火砲大師：戰吼：獲得一個 1/1 砲手
  CAP_107: { abilities: play({ e: 'addCard', card: 'CAP_107t', count: 1, who: 'self' }), tokens: ['CAP_107t'] },
  // 砲手：在你的回合結束時，對一個隨機敵人造成 1 點傷害
  CAP_107t: { abilities: atEndOfTurn(fn('cannonShot')) },

  // ============================================================== 術士：小鬼線人
  // 黑謀會密謀者：亡語：放兩個 3/3 小鬼線人到敵方牌堆。抽中時會為你召喚
  CAP_400: { abilities: dr(fn('putImpformants', { count: 2 })), tokens: ['CAP_400t2t'] },
  // 小鬼線人：生命竊取。抽到時召喚（為對手）
  CAP_400t2t: { keywords: ['LIFESTEAL'], summonedWhenDrawn: true },
  // 貪腐警官：戰吼：若敵方牌堆有任何小鬼線人，將其移到最上方並賦予其 +2/+2
  CAP_401: { abilities: play(fn('corruptConstable')), tokens: ['CAP_400t2t'] },
  // 跟隨證據
  CAP_402: followCard('evidence', { tokens: ['CAP_400t2t'] }),
  // 栽贓嫁禍：摧毀兩個隨機敵方手下。發現敵方牌堆的一個手下並將其放到最上方
  CAP_403: {
    abilities: play({ e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 2 } }, fn('frameJob')),
  },
  // 嚴厲判刑：下回合敵方手下消耗增加 (2)。放兩個 3/3 小鬼線人到敵方牌堆
  CAP_404: { abilities: play({ e: 'minionTax', amount: 2 }, fn('putImpformants', { count: 2 })), tokens: ['CAP_400t2t'] },
  // 教父卡札克斯：戰吼：謀劃一場自訂的虛假審判！然後選擇審判的時間
  CAP_405: { abilities: play(fn('godfatherKazakus')), tokens: [...CRIMES, ...TRIALS, 'LOOT_368'] },
  // 懸賞告示：發現一個消耗 (5) 以上的手下，賦予其預備
  CAP_407: { abilities: play({ e: 'discover', pool: { type: 'MINION', minCost: 5 }, then: [fn('grantPrepare')] }) },
  // 黑謀會首腦：嘲諷。戰吼：在本賽局中，每當你召喚小鬼線人，賦予其 +2/+2
  CAP_406: {
    keywords: ['TAUNT'],
    abilities: play({
      e: 'eternal',
      ability: { on: { k: 'summon', side: 'friendly' }, cond: { c: 'itIsCardId', id: 'CAP_400t2t' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2, hp: 2 }] },
    }),
    tokens: ['CAP_400t2t'],
  },
  // 審判的各種效果與長度
  CAP_405t1: { abilities: play(fn('forceAllAttack')) },
  CAP_405t2: { abilities: play({ e: 'steal', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 } }) },
  CAP_405t3: { abilities: play(fn('stealCards', { count: 2 })) },
  CAP_405t4: { abilities: play(draw(3)) },
  CAP_405t5: { abilities: play({ e: 'handBuff', atk: 3, hp: 3, scope: 'all' }, { e: 'buff', target: allFriendly, atk: 3, hp: 3 }) },
  CAP_405t6: { abilities: play(summonRandom({ type: 'MINION', cost: 3 }, 3)) },
  CAP_405t7: { abilities: play(fn('handCostMinus', { amount: 2 })) },
  CAP_405t8: { abilities: play({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 12 }) },
  CAP_405t9: { abilities: play({ e: 'summon', card: 'LOOT_368', count: 1, who: 'self' }), tokens: ['LOOT_368'] },
  CAP_405tb1: {},
  CAP_405tb2: {},
  CAP_405tb3: {},
  // 『背叛者』高佛雷：對戰開始：超抽的卡牌會在你有空間時回到你的手中，其消耗減少 (1)
  JAIL_509: { startOfGame: 'godfrey' },
  // 殲滅：摧毀全部手下。召喚你牌堆底下 3 張牌中的任何惡魔
  JAIL_510: { abilities: play(fn('annihilation')) },
  // 暗影彈藥：對一個敵方手下造成 2 點傷害。若其死亡，對另一個隨機敵方手下施放此法術
  JAIL_515: { target: enemyMinion, abilities: play(fn('shadowRounds')) },
  // 小鬼幫派傀儡：嘲諷。亡語：放兩個 8/8 嘲諷生命竊取惡魔到你牌堆的最底下
  JAIL_399: { keywords: ['TAUNT'], abilities: dr(fn('putBottom', { card: 'JAIL_399t1', count: 2 })), tokens: ['JAIL_399t1'] },
  JAIL_399t1: { keywords: ['TAUNT', 'LIFESTEAL'] },
  // 摩拉革：預備。亡語：從你的牌堆召喚一個隨機惡魔，賦予它「亡語：召喚摩拉革」
  JAIL_906: { prepare: true, abilities: dr(fn('moragg')) },
  // 惡魔監禁：使一名手下休眠 2 回合。若為友方惡魔，改為賦予它 +3/+3
  JAIL_997: { target: anyMinion, abilities: play(fn('demonicConfinement')) },
  // 古老占兆師：戰吼：瀏覽對手手中的 3 張牌並隱密選擇一張。亡語：將其捨棄
  JAIL_303: { abilities: play(fn('augur')) },
  // 小鬼幫派傀儡之外的術士：偽裝等
  // 『迫近之死』維瑪之外見下方

  // ============================================================== 牧師：重生
  CAP_800: { keywords: ['REBORN'], rebornFull: true },
  CAP_802: followCard('ghosts', { tokens: ['CAP_802t'] }),
  CAP_802t: { keywords: ['REBORN'] },
  CAP_803: { keywords: ['REBORN'], abilities: dr(fn('lingeringSpirit', { amount: 3 })) },
  CAP_804: { target: optional(friendlyMinion), abilities: play(fn('specterSpecialist')) },
  CAP_805: { abilities: play(fn('slimeEm')), tokens: ['CAP_805t'] },
  CAP_805t: { abilities: play(fn('ectoplasm')) },
  CAP_806: { abilities: play(fn('raithVanGeist')) },
  // 斬魂者阿薩琳娜：起始生命值 40，牌堆 20 張加上敵方牌堆的 20 張複製品。戰吼：抽牌直到塞滿手牌
  JAIL_430: { startOfGame: 'azalina', abilities: play(fn('fillHandDraw')) },
  // 心靈掃蕩者
  JAIL_432: {
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itFromOpp' }, effects: [fn('counterInHand')] }],
    abilities: play(cond({ c: 'handCounter', n: 1 }, [{ e: 'damage', target: allEnemyMinions, amount: 2 }])),
  },
  // 解放靈魂：摧毀一個手下。若你於此牌在手中時打出對手卡牌的複製品，此牌消耗為 (1)
  JAIL_433: {
    target: anyMinion,
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itFromOpp' }, effects: [fn('setSelfCost', { cost: 1 })] }],
    abilities: play({ e: 'destroy', target: { t: 'chosen' } }),
  },
  // 奴役魔影：亡語：使你手中從對手複製而來的牌消耗降低 (1)
  JAIL_434: { abilities: dr(fn('discountFromOpp', { amount: 1 })) },
  // 預卜者：預備、嘲諷。亡語：為你的英雄恢復 6 點生命值。召喚一個消耗為 6 的隨機手下
  JAIL_912: {
    prepare: true,
    keywords: ['TAUNT'],
    abilities: dr({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 6 }, summonRandom({ type: 'MINION', cost: 6 }, 1)),
  },
  // 擋住他們！：預備。賦予一個手下 +5/+5 和生命竊取
  JAIL_913: { prepare: true, target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 5, hp: 5, keywords: ['LIFESTEAL'] }) },
  // 不死刑：觸發本賽局中死亡的一個隨機友方手下的亡語
  JAIL_940: { abilities: play(fn('undeathSentence')) },
  // 神聖擁抱：恢復 4 點生命值。獲得可造成 4 點傷害的「黑暗擁抱」
  JAIL_941: {
    target: anyChar,
    abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 4 }, { e: 'addCard', card: 'JAIL_941t', count: 1, who: 'self' }),
    tokens: ['JAIL_941t'],
  },
  JAIL_941t: { target: anyChar, abilities: play(hit(4)) },
  // 屈服的卡羅夫：嘲諷。亡語：獲得三個隨機傳說手下的 1/1 分身，其消耗為 (1)
  JAIL_448: { keywords: ['TAUNT'], abilities: dr(fn('karov')) },

  // ============================================================== 戰士 / 中立（戰吼與關鍵字）
  JAIL_029: {
    abilities: [{ on: { k: 'damaged', subject: 'friendlyMinion' }, cond: { c: 'itAlive' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 1 }] }],
  },
  // 逃脫專家：在此手下攻擊且存活後，抽一張牌並從賽局逃脫
  JAIL_030: {
    abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('ifAttack', { survive: true, then: [draw(), fn('escapeSelf')] })] }],
  },
  // 警戒哨衛：嘲諷。戰吼：若你的牌堆中沒有中立卡牌，召喚兩個警戒哨衛
  JAIL_035: { keywords: ['TAUNT'], abilities: play(cond({ c: 'deckNoNeutral' }, [{ e: 'summon', card: 'JAIL_035', count: 2, who: 'self' }])) },
  // 紫羅蘭懲罰者：戰吼：選擇一個敵方手下，偷取其加成效果，每偷取一種便獲得 +1/+1
  JAIL_101: { target: optional(enemyMinion), abilities: play(fn('violetPunisher')) },
  // 『迫近之死』維瑪：戰吼：摧毀全部非聖騎士手下
  JAIL_118: { abilities: play({ e: 'destroy', target: { t: 'all', filter: { type: 'minion', side: 'any', notClass: 'PALADIN' } } }) },
  // 坐牢的曼納斯頓：戰吼：你在本賽局中施放法術後，召喚一個相同消耗的隨機手下
  JAIL_122: { abilities: play({ e: 'eternal', ability: { on: { k: 'spellCast', side: 'friendly' }, effects: [fn('summonSameCost')] } }) },
  // 劫獄建築師：戰吼：發現一個消耗 (5) 以上的法術。將它打出時會施放兩次
  JAIL_123: { abilities: play({ e: 'discover', pool: { type: 'SPELL', minCost: 5 }, then: [fn('setHandFlag', { flag: 'castTwice' })] }) },
  // 感染餐具室：召喚兩個消耗為 (2 + 你的英雄攻擊次數) 的隨機手下
  JAIL_200: { abilities: play(fn('summonRandomCost', { cost: { dyn: 'heroAttacksThisGame', base: 2 }, count: 2 })) },
  // 小蜘蛛：你的英雄在你的回合時擁有 +1 攻擊力
  JAIL_202: { auras: [{ scope: 'friendlyHero', atk: 1 }] },
  // 孤寂囚犯：若場上沒有手下，消耗改為 (2)
  JAIL_204: { costIf: { cond: { c: 'boardCount', n: 0 }, cost: 2 } },
  // 髒鼠大盜：在你的回合結束時，偷走在你的回合進入對手手中的全部卡牌
  JAIL_205: { abilities: atEndOfTurn(fn('stealEnteredCards')) },
  // 黑暗賄賂：抽 3 張牌。選擇一張給對手
  JAIL_206: { abilities: play(fn('darkBribe')) },
  // 抓獲：對一個手下造成 3 點傷害。若其死亡，將一張它的分身洗入你的牌堆，其消耗為 (2)
  JAIL_225: { target: anyMinion, abilities: play(hit(3), cond({ c: 'itDied' }, [fn('shuffleItAtCost', { cost: 2 })])) },
  // 人群控制：對全部手下造成 2 點傷害兩次。若你的牌堆有 25 張以上，消耗減少 (2)
  JAIL_307: {
    costIf: { cond: { c: 'deckSize', op: '>=', n: 25 }, cost: 3 },
    abilities: play({ e: 'repeat', times: 2, effects: [{ e: 'damage', target: allMinions, amount: 2, spell: true }] }),
  },
  // 襤褸防衛者：嘲諷。若你的牌堆有 25 張以上的卡牌，獲得 +5 攻擊力
  JAIL_311: { keywords: ['TAUNT'], atkIf: { cond: { c: 'deckSize', op: '>=', n: 25 }, atk: 5 } },
  // 走私鍊金師：戰吼：選擇你的一張手牌，將其變形為消耗增加 (5) 的法術（維持其原本的消耗）
  JAIL_313: { abilities: play(fn('bootlegAlchemist')) },
  // 萬能鑰匙：發現一個法術，或重置你的選項
  JAIL_319: { abilities: play(fn('skeletonKey')), tokens: ['JAIL_319t'] },
  JAIL_319t: {},
  // 狡猾應變者：預備。戰吼：若你本回合有打出法術，施放兩個隨機法師奧秘
  JAIL_321: {
    prepare: true,
    abilities: play(cond({ c: 'spellsThisTurn', n: 1, atLeast: true }, [fn('randomSecret', { cls: 'MAGE' }), fn('randomSecret', { cls: 'MAGE' })])),
  },
  // 審判：預備。選擇一個友方手下。將全部手下的體質改為與該手下相等
  JAIL_326: { prepare: true, target: friendlyMinion, abilities: play(fn('judgment')) },
  // 增援光環：在你的回合結束時，從你的牌堆召喚一個消耗 (2) 以下的手下。持續 3 回合
  JAIL_327: { abilities: play(fn('reinforcementAura', { turns: 3 })) },
  // 血色打手：亡語：若你的牌堆中沒有中立卡牌，獲得一張隨機聖騎士卡牌，其消耗減少 (2)
  JAIL_328: {
    abilities: dr(cond({ c: 'deckNoNeutral' }, [fn('addRandomDiscount', { pool: { cls: 'PALADIN' }, count: 1, discount: 2 })])),
  },
  // 真相追求者：在你的英雄攻擊後，賦予你的聖騎士手下 +2/+2
  JAIL_329: { abilities: heroHit([{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', cardClass: 'PALADIN' } }, atk: 2, hp: 2 }]) },
  // 達拉然勇士：聖盾、嘲諷。此手下獲得體質後，額外獲得 +1/+1（無論其位於何處）
  JAIL_330: { keywords: ['DIVINE_SHIELD', 'TAUNT'], extraOnBuff: { atk: 1, hp: 1 } },
  // 鐵球和鎖鍊：亡語：賦予你受傷的手下 +1/+2
  JAIL_376: { abilities: dr({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', damaged: true } }, atk: 1, hp: 2 }) },
  // 神聖縛錘彈！：抽一張牌。若其消耗為 (2) 以下，再抽一張
  JAIL_377: { abilities: play(draw(), cond({ c: 'itCostAtMost', n: 2 }, [draw()])) },
  // 尖塔警衛：戰吼：揭露你牌堆中的一張法術。若其消耗為 (5) 以上，造成 5 點傷害，隨機分給敵方手下
  JAIL_379: { abilities: play(fn('spireSecurity')) },
  // 走私鏟子：亡語：抽一張非起始套牌的法術
  JAIL_380: { abilities: dr(fn('drawNonStartingSpell')) },
  // 破鏈者霍格：嘲諷。對戰開始：複製你牌堆中的全部其他傳說卡牌
  JAIL_384: { keywords: ['TAUNT'], startOfGame: 'hogger' },
  // 奪取裝備：獲得 2 點護甲值。將五張裝備法術洗入你的牌堆，抽中時賦予 2 點護甲值
  JAIL_386: { abilities: play({ e: 'armor', amount: 2 }, { e: 'shuffle', card: 'JAIL_386t', count: 5 }), tokens: ['JAIL_386t'] },
  JAIL_386t: tripped('JAIL_386t', { e: 'armor', amount: 2 }),
  // 釋放野獸：賦予你手中的手下 +1/+1。傳說手下額外獲得 +2/+1
  JAIL_387: { abilities: play({ e: 'handBuff', atk: 1, hp: 1, scope: 'all' }, fn('legendaryHandBuff')) },
  // 下水道游鱷：預備。戰吼：觸發一個友方手下的亡語
  JAIL_395: { prepare: true, target: optional(friendlyMinion), abilities: play(fn('triggerDeathrattle')) },
  // 指揮官碧翠絲：嘲諷。編組套牌時選擇一個消耗為 (2) 的手下，十個分身會加入你的套牌中
  JAIL_397: { keywords: ['TAUNT'], startOfGame: 'beatrix' },
  // 煉獄火小鬼！：亡語：對全部其他角色造成 3 點傷害（在手中或牌堆中也會觸發）
  JAIL_398: {
    abilities: [
      ...dr({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'any', excludeSelf: true } }, amount: 3 }),
      { on: { k: 'discarded' }, effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'any' } }, amount: 3 }] },
    ],
  },
  // 頭目凡妮莎：預備。在你打出卡牌後，獲得一個隨機戰吼手下，其消耗減少 (2)
  JAIL_407: {
    prepare: true,
    abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('addRandomDiscount', { pool: { type: 'MINION', hasBattlecry: true }, count: 1, discount: 2 })] }],
  },
  // 曲齒：衝鋒。若四個友方角色在你的其中一個回合受到傷害，從手中或牌堆召喚此手下
  JAIL_421: { keywords: ['CHARGE'] },
  // 狂暴獵犬：預備。戰吼：強迫全部敵方手下攻擊此手下
  JAIL_435: { prepare: true, abilities: play(fn('rampagingHound')) },
  // 毒蛛撕咬 / 毒蛛盛宴 / 毒蛛筵席
  JAIL_436: {
    abilities: play({ e: 'heroAttack', amount: 1 }, { e: 'armor', amount: 1 }, { e: 'addCard', card: 'JAIL_436t', count: 1, who: 'self' }),
    tokens: ['JAIL_436t', 'JAIL_436t2'],
  },
  JAIL_436t: { abilities: play({ e: 'heroAttack', amount: 2 }, { e: 'armor', amount: 2 }, { e: 'addCard', card: 'JAIL_436t2', count: 1, who: 'self' }), tokens: ['JAIL_436t2'] },
  JAIL_436t2: { abilities: play({ e: 'heroAttack', amount: 4 }, { e: 'armor', amount: 4 }) },
  // 偽裝的醫生：可在雙方牌桌打出。亡語：將 4 張疫病洗入你的牌堆，抽中時造成 2 點傷害
  JAIL_442: { disguised: true, abilities: dr({ e: 'shuffle', card: 'JAIL_443t', count: 4, who: 'self' }), tokens: ['JAIL_443t'] },
  JAIL_443t: tripped('JAIL_443t', { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 }),
  // 活體瘟疫：衝鋒。不會對英雄造成傷害，而是將等量的疫病洗入其牌堆
  JAIL_443: { keywords: ['CHARGE'], flags: ['livingPlague'], tokens: ['JAIL_443t'] },
  // 鋸骨：預備。戰吼：摧毀你的全部其他手下。每摧毀一個手下便抽一張牌並回復一點法力
  JAIL_444: { prepare: true, abilities: play(fn('sawbones')) },
  // 血腥醫生薩蕾娜：戰吼：獲得第二個英雄能力（消耗屍體）
  JAIL_446: { abilities: play(fn('thalena')) },
  // 魯莽偵探：衝刺。亡語：獲得偵探的衣物
  JAIL_447: { keywords: ['RUSH'], abilities: dr({ e: 'addCard', card: 'JAIL_447t', count: 1, who: 'self' }), tokens: ['JAIL_447t'] },
  JAIL_447t: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 4, hp: 4, keywords: ['RUSH'] }) },
  // 偽裝的偵探：可在雙方牌桌打出。使該玩家超載 (2) 點
  JAIL_452: { disguised: true, abilities: play(fn('overloadController', { amount: 2 })) },
  // 牢中鳥：嘲諷。當你於此牌在手中時預備，使此牌降低等量的消耗
  JAIL_453: { keywords: ['TAUNT'], handAbilities: [{ on: { k: 'prepare' }, effects: [fn('discountSelfByEvent')] }] },
  // 偽裝的警備兵：可在雙方牌桌打出。戰吼：對全部其他友方手下造成 1 點傷害兩次
  JAIL_455: { disguised: true, abilities: play({ e: 'repeat', times: 2, effects: [{ e: 'damage', target: otherFriendly, amount: 1 }] }) },
  // P1CK-P0K3T：戰吼：若你的牌堆有 25 張以上的卡牌，抽一張牌
  JAIL_456: { abilities: play(cond({ c: 'deckSize', op: '>=', n: 25 }, [draw()])) },
  // 被劫持的警衛機器人：預備。戰吼：賦予你的其他手下 +1/+1
  JAIL_457: { prepare: true, abilities: play({ e: 'buff', target: otherFriendly, atk: 1, hp: 1 }) },
  // 小夥伴：戰吼：選擇你的元素彈藥！（在你的英雄攻擊後，選擇另一種）
  JAIL_458: { abilities: [...play(fn('tinyPalChoose')), ...heroHit([fn('tinyPalFire')])], tokens: AMMO },
  JAIL_458t1: {},
  JAIL_458t2: {},
  JAIL_458t3: {},
  JAIL_458t4: {},
  // 蠍怪：衝刺。全部友方手下獲得致命劇毒
  JAIL_459: { keywords: ['RUSH', 'POISONOUS'], auras: [{ scope: 'otherFriendly', keywords: ['POISONOUS'] }] },
  // 偽裝的劊子手：可在雙方牌桌打出。戰吼：摧毀兩側的一個隨機手下
  JAIL_461: { disguised: true, abilities: play(fn('destroyRandomAdjacent')) },
  // 逃亡野豬司機：戰吼：抽 2 張牌。若它們都是手下，獲得衝鋒
  JAIL_462: { abilities: play(fn('getawayHogdriver')) },
  // 玉蓮幫生事者：戰吼：射擊 1 次！（在手中或牌堆時打出法力消耗為 2 的卡牌來射擊更多次）
  JAIL_470: { abilities: play(fn('lotusTroublemaker')) },
  // 翠玉守護者：獲得兩個消耗為 8 的隨機手下。你在本賽局打出的每張 2 點法力消耗卡牌使其消耗減少 (1)
  JAIL_474: { abilities: play(fn('jadeGuardians')) },
  // 大卸八塊：重新打出本回合打出的全部其他卡牌（優先以敵方為目標）。結束你的回合
  JAIL_500: { abilities: play(fn('sliceAndDice')) },
  // 開鎖者：此牌上的所有數字等同你剩餘的法力。戰吼：對一個敵方手下造成等量傷害
  JAIL_501: { target: optional(enemyMinion), abilities: play(fn('picklock')) },
  // 警報自走機：在你的回合開始時，與對手手中的一個隨機手下交換
  JAIL_502: { abilities: atStartOfTurn(fn('alarmOMatic')) },
  // 黑掌的鞭子：你手中的每個幸運幣使消耗減少 (1)。亡語：抽一張牌
  JAIL_503: { costRule: { per: 'coinsInHand', amount: 1 }, abilities: dr(draw()) },
  // 『玉蓮幫幫主』阿雅：你永遠為後手。戰吼：選擇一個升級的偽造品來取代你在本賽局中的幸運幣。獲得 3 個
  JAIL_504: { startOfGame: 'aya', abilities: play(fn('ayaCounterfeit')), tokens: [...COINS, ...KAZAKUS_TOKENS, 'CFM_712_t01'] },
  JAIL_504t: { abilities: play({ e: 'mana', kind: 'temp', amount: 1 }, { e: 'summonJade' }) },
  JAIL_504t2: { abilities: play({ e: 'mana', kind: 'temp', amount: 1 }, { e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 }, amount: 2, spell: true }) },
  JAIL_504t3: { abilities: play({ e: 'mana', kind: 'temp', amount: 1 }, fn('kabalPotion')), tokens: ['JAIL_504t3p'] },
  JAIL_504t3p: {},
  // 惡毒大廚：戰吼：召喚一個消耗為 (2) 的嘲諷手下。若你擁有 10 點以上的法力，改為召喚消耗為 (6) 的手下
  JAIL_507: {
    abilities: play(cond({ c: 'maxMana', n: 10 }, [summonRandom({ type: 'MINION', keyword: 'TAUNT', cost: 6 }, 1)], [summonRandom({ type: 'MINION', keyword: 'TAUNT', cost: 2 }, 1)])),
  },
  // 血色招募者：戰吼：從你的牌堆召喚兩個消耗 (2) 以下的手下。賦予它們衝刺
  JAIL_516: { abilities: play(fn('recruitGive', { count: 2, maxCost: 2, keywords: ['RUSH'] })) },
  // 好騙的守衛：亡語：在本賽局中你可以說抱歉
  JAIL_703: { abilities: dr(fn('gullibleGuard')) },
  // 小偷工具：獲得兩個消耗為 4 的隨機法術。使它們的消耗減少 (2)
  JAIL_706: { abilities: play(fn('addRandomDiscount', { pool: { type: 'SPELL', cost: 4 }, count: 2, discount: 2 })) },
  // 黑市拍賣師：預備。每當你施放法術，抽一張牌
  JAIL_718: { prepare: true, abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [draw()] }] },
  // 伊莉妲‧尋罪者：生命竊取。戰吼：將你的牌堆送入虛無，除了 1 張卡。在你的回合開始時，從虛無中獲得兩張卡牌
  JAIL_719: { keywords: ['LIFESTEAL'], abilities: play(fn('irida')) },
  // 『靈魂寄生者』崔斯塔斯：預備、衝刺。在你召喚惡魔後，獲得其體質
  JAIL_721: { prepare: true, keywords: ['RUSH'], abilities: [{ on: { k: 'summon', side: 'friendly', race: 'DEMON' }, effects: [fn('gainItStats')] }] },
  // 星塵鐮刀：在你的英雄攻擊後，獲得一個虛無靈魂
  JAIL_730: { abilities: heroHit([{ e: 'addCard', card: 'JAIL_732', count: 1, who: 'self' }]) },
  // 虛無靈魂：召喚一個消耗為 (1) 的隨機惡魔。強化你之後的虛無靈魂
  JAIL_732: { abilities: play(fn('voidSoul')) },
  // 兇惡虛無之鱗：嘲諷。亡語：獲得一個虛無靈魂
  JAIL_733: { keywords: ['TAUNT'], abilities: dr({ e: 'addCard', card: 'JAIL_732', count: 1, who: 'self' }) },
  // 地獄喚起者：嘲諷。戰吼：發現你牌堆中的一張卡。若牌堆已空，改為獲得 +4/+4
  JAIL_734: {
    keywords: ['TAUNT'],
    abilities: play(cond({ c: 'deckEmpty' }, [{ e: 'buff', target: { t: 'self' }, atk: 4, hp: 4 }], [fn('discoverFromDeck')])),
  },
  // 紫羅蘭警戒：預備。召喚一個消耗為 (8) 的手下。若你本回合施放過其他 3 個法術，重複此效果
  JAIL_735: {
    prepare: true,
    abilities: play(fn('summonRandomCost', { cost: 8, count: 1 }), cond({ c: 'spellsThisTurn', n: 3, atLeast: true }, [fn('summonRandomCost', { cost: 8, count: 1 })])),
  },
  // 兇惡虛無之鱗之外的惡魔獵人
  // 虛無衝擊：對一個手下造成 3 點傷害。若其死亡，獲得一個虛無靈魂
  JAIL_891: { target: anyMinion, abilities: play(hit(3), cond({ c: 'itDied' }, [{ e: 'addCard', card: 'JAIL_732', count: 1, who: 'self' }])) },
  // 宇宙顯化：造成 2 點傷害。將一個隨機惡魔獵人法術洗入你的牌堆。流放：重複此效果
  JAIL_892: {
    target: anyChar,
    abilities: play(hit(2), fn('shuffleRandomClassSpell', { cls: 'DEMONHUNTER' }), cond({ c: 'outcast' }, [hit(2), fn('shuffleRandomClassSpell', { cls: 'DEMONHUNTER' })])),
  },
  // 被俘的納斯雷茲姆：預備、嘲諷。全部手下的消耗增加 (2)
  JAIL_890: { prepare: true, keywords: ['TAUNT'], costAuras: [{ side: 'both', type: 'MINION', add: 2 }] },
  // 斬魂者之外：中立
  // 警報：被抓的大法師：亡語：若你在本賽局中有其他 4 個被抓的大法師死亡，對一個隨機敵人施放「火球術」
  JAIL_974: {
    abilities: dr(cond({ c: 'graveyardCount', name: 'Captured Archmage', n: 5 }, [{ e: 'damage', target: { t: 'random', filter: { side: 'enemy' }, count: 1 }, amount: 6, spell: true }])),
  },
  // 狂熱偽造者：戰吼：獲得一個可打出的隨機法術，此法術為暫時
  JAIL_986: { abilities: play(fn('addRandomDiscount', { pool: { type: 'SPELL' }, count: 1, discount: 0, temporary: true })) },
  // 迪菲亞走私者：預備。戰吼：賦予一個友方手下 +2 攻擊力和衝刺
  JAIL_998: { prepare: true, target: optional(friendlyMinion), abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, keywords: ['RUSH'] }) },
  // 迪菲亞崇拜者：預備。連擊：本回合打出的每張其他卡牌使其獲得 +1/+1
  JAIL_909: {
    prepare: true,
    abilities: play(cond({ c: 'combo' }, [{ e: 'buff', target: { t: 'self' }, atk: { dyn: 'cardsPlayedThisTurn', base: -1 }, hp: { dyn: 'cardsPlayedThisTurn', base: -1 } }])),
  },
  // 偽裝的劊子手等：見上方

  // ============================================================== 薩滿
  // 熔化黃金 / 冰霜粉碎 / 風暴烈怒：施放 3 個法術後變成手下
  JAIL_801: { target: anyChar, abilities: play(hit(4)), transformAfterSpells: { n: 3, into: 'JAIL_801t' }, tokens: ['JAIL_801t'] },
  JAIL_801t: { target: optional(anyChar), abilities: play(hit(4, false)) },
  JAIL_803: { target: enemyChar, abilities: play({ e: 'freeze', target: { t: 'chosen' } }, draw(2)), transformAfterSpells: { n: 3, into: 'JAIL_803t' }, tokens: ['JAIL_803t'] },
  JAIL_803t: { target: optional(enemyChar), abilities: play({ e: 'freeze', target: { t: 'chosen' } }, draw(2)) },
  JAIL_805: {
    keywords: ['LIFESTEAL'],
    abilities: play({ e: 'damage', target: allEnemyMinions, amount: 2, spell: true }),
    transformAfterSpells: { n: 3, into: 'JAIL_805t' },
    tokens: ['JAIL_805t'],
  },
  JAIL_805t: { keywords: ['LIFESTEAL'], abilities: play({ e: 'damage', target: allEnemyMinions, amount: 2 }) },
  // 加樂宮暴徒：在你打出戰吼手下後，賦予它 +1/+1
  JAIL_802: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasBattlecry' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 1, hp: 1 }] }] },
  // 妖術元帥：戰吼：獲得一個消耗 (5) 以上的隨機法術。若你的牌堆開始時沒有法術，其消耗減少 (5)
  JAIL_806: {
    abilities: play(
      cond(
        { c: 'startedNoSpells' },
        [fn('addRandomDiscount', { pool: { type: 'SPELL', minCost: 5 }, count: 1, discount: 5 })],
        [fn('addRandomDiscount', { pool: { type: 'SPELL', minCost: 5 }, count: 1, discount: 0 })],
      ),
    ),
  },
  // 瑪格吉：對戰開始：若你的牌堆沒有其他手下，獲得瑪格的英雄能力。若沒有法術，則獲得吉的英雄能力
  JAIL_800: { startOfGame: 'mugzee' },
  // 偽裝的偵探與被劫持的警衛機器人見上方

  // ============================================================== 德魯伊
  // 奈絲芮克大廚：對戰開始：若你的牌堆只有消耗 (3) 以下的牌，在五回合後將你的法力改為 10 點
  JAIL_860: { startOfGame: 'nethrek' },
  // 劇毒賄賂：發現一張二選一卡牌。它同時擁有兩種效果。給對手一張未加成複製品
  JAIL_861: { abilities: play(fn('noxiousBribe')) },
  // 致命食譜：抽出 2 個手下。若你擁有 10 點以上的法力，賦予其 +3/+3
  JAIL_866: { abilities: play(fn('lethalRecipe')) },
  // 詭詐法杖：在你的英雄攻擊後，發現一張德魯伊卡牌。根據你英雄的攻擊力降低其消耗
  JAIL_875: { abilities: heroHit([{ e: 'discover', pool: { cls: 'DRUID' }, then: [fn('discountItByHeroAttack')] }]) },
  // 惡毒大廚之外：毒蛛撕咬見上方

  // ============================================================== 獵人
  // 掘地逃生：賦予一個友方手下「亡語：召喚兩個消耗為 4 的隨機手下」
  JAIL_876: {
    target: friendlyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr(summonRandom({ type: 'MINION', cost: 4 }, 2)) }),
  },
  // 野獸絆索：召喚一個消耗為 5 的隨機野獸。將 2 個法術洗入你的牌堆，抽中時重複此效果
  JAIL_879: {
    abilities: play(summonRandom({ type: 'MINION', race: 'BEAST', cost: 5 }, 1), { e: 'shuffle', card: 'JAIL_879t', count: 2 }),
    tokens: ['JAIL_879t'],
  },
  JAIL_879t: tripped('JAIL_879t', summonRandom({ type: 'MINION', race: 'BEAST', cost: 5 }, 1)),
  // 黑市監督者：每當你打出亡語手下，賦予其衝刺
  JAIL_880: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasDeathrattle' }, effects: [{ e: 'buff', target: { t: 'it' }, keywords: ['RUSH'] }] }] },
  // 秘法絆索：造成 4 點傷害，隨機分給全部敵人。將 2 個法術洗入你的牌堆，抽中時重複此效果
  JAIL_881: {
    abilities: play({ e: 'splitDamage', filter: { side: 'enemy' }, amount: 4, spell: true }, { e: 'shuffle', card: 'JAIL_881t', count: 2 }),
    tokens: ['JAIL_881t'],
  },
  JAIL_881t: tripped('JAIL_881t', { e: 'splitDamage', filter: { side: 'enemy' }, amount: 4, spell: true }),
  // R4T-C4TCH3R：戰吼：複製你牌堆中的全部法術。亡語：抽出其中一張
  JAIL_882: { abilities: [...play(fn('ratCatcherCopy')), ...dr(fn('drawMarked'))] },
  // 城底區之王：編組套牌時選擇 3 個違禁品野獸。戰吼：發現其中一個，其消耗減少 (3)
  JAIL_831: { abilities: play({ e: 'discover', pool: { type: 'MINION', race: 'BEAST', anyClass: true }, then: [{ e: 'costMod', amount: -3, scope: 'it' }] }) },

  // ============================================================== 其他中立
  // 戰吼：召喚…
  // 典獄官瑪翼夫：在你打出手下後，賦予其 +3/+3 並使其休眠 1 回合
  JAIL_850: {
    abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 3, hp: 3 }, fn('goDormantIt', { turns: 1 })] }],
  },
  // 調查員魚爾摩斯：戰吼：調查敵人的一張手牌。若對手在下回合打出同名卡牌，獲得 3 枚幸運幣
  JAIL_851: { abilities: play(fn('investigate')) },
  // 『走私大王』托戈瓦哥：戰吼：將雙方的手牌洗在一起
  JAIL_852: { abilities: play(fn('togwaggle')) },
};
