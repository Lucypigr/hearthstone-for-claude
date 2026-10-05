// ============================================================================
// 大災變（系列 1980，卡號 CATA_ / MEND_）：手動定義的卡牌效果。
// 新機制：預兆（Herald）、巨型（Colossal）、碎裂（Shatter）、符印（Sigil）、地脈（Leyline）、
// 動物夥伴升級、銀白之手新兵強化、雕刻與在手牌中累積花費等。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const atStartOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnStart', whose: 'mine' }, effects }];
const whenSummoned = (...effects: Effect[]): Ability[] => [{ on: { k: 'summoned' }, effects }];
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const herald = fn('herald');
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyChar: TargetReq = { filter: { type: 'character', side: 'enemy' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allFriendly = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const summonRandom = (pool: Extract<Effect, { e: 'summonRandom' }>['pool'], count: number): Effect => ({ e: 'summonRandom', pool, count, who: 'self' });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const heraldPower = (mult: number) => ({ dyn: 'heraldPower' as const, mult });
/** 預兆的士兵與巨型的附肢 */
const soldierDeath: Override = { abilities: dr({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: heraldPower(2) }) };
const soldierHeroAtk: Override = { abilities: whenSummoned(fn('heraldHeroAttack', { base: 1 })) };
const soldierAura: Override = { auras: [{ scope: 'adjacent', heraldAtk: 1 }] };
const soldierSinestra: Override = { abilities: whenSummoned(fn('heraldSinestra', { base: 1 })) };
const soldierOnyxia: Override = { abilities: whenSummoned(fn('heraldOnyxia', { base: 2 })) };
const soldierChogall: Override = { abilities: atEndOfTurn(fn('chogallArm', { base: 2 })) };
const wickerLeg: Override = { abilities: atEndOfTurn(fn('wickerLeg')) };
const magmawBody: Override = { abilities: dr({ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly' }, count: 1 }, atk: 2 }) };
const bloodBody: Override = {
  abilities: atEndOfTurn({ e: 'heal', target: { t: 'random', filter: { type: 'character', side: 'friendly', damaged: true }, count: 1 }, amount: 3 }),
};
const chromatusHead = (kw: 'TAUNT' | 'LIFESTEAL' | 'ELUSIVE' | 'DIVINE_SHIELD'): Override => ({ keywords: [kw], abilities: dr(fn('chromatusHead', { kw })) });
const plume: Override = {
  abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [fn('addRandomDiscount', { pool: { type: 'SPELL', spellSchool: 'FIRE' }, count: 1, discount: 3 })] }],
};
const recruitCount = (n: number): Effect => summon('CS2_101t', n);

export const CATACLYSM_OVERRIDES: Record<string, Override> = {
  // ============================================================== 預兆的士兵
  CATA_580t: soldierDeath,
  CATA_150t: soldierDeath,
  CATA_150t1: soldierDeath,
  CATA_525t: soldierHeroAtk,
  CATA_151t: soldierHeroAtk,
  CATA_151t1: soldierHeroAtk,
  CATA_565t: soldierAura,
  CATA_153t: soldierAura,
  CATA_153t1: soldierAura,
  CATA_158t: soldierSinestra,
  CATA_154t: soldierSinestra,
  CATA_154t1: soldierSinestra,
  CATA_780t: soldierOnyxia,
  CATA_155t: soldierOnyxia,
  CATA_155t1: soldierOnyxia,
  CATA_725t: soldierChogall,
  CATA_726t: soldierChogall,
  CATA_726t1: soldierChogall,
  // 巨型的附肢
  CATA_139t: wickerLeg,
  CATA_139t2: wickerLeg,
  CATA_139t3: wickerLeg,
  CATA_139t4: wickerLeg,
  CATA_550t: magmawBody,
  CATA_550t2: magmawBody,
  CATA_550t3: magmawBody,
  CATA_550t4: magmawBody,
  CATA_550t5: magmawBody,
  CATA_550t6: magmawBody,
  CATA_300t1: bloodBody,
  CATA_300t2: bloodBody,
  CATA_300t3: bloodBody,
  CATA_432t1: chromatusHead('TAUNT'),
  CATA_432t2: chromatusHead('LIFESTEAL'),
  CATA_432t3: chromatusHead('ELUSIVE'),
  CATA_432t4: chromatusHead('DIVINE_SHIELD'),
  CATA_488t: plume,
  CATA_488t2: plume,

  // ============================================================== 德魯伊
  // 晶脊幼獸：每當你花光最後一顆法力水晶，獲得 +1/+1
  CATA_130: { abilities: [{ on: { k: 'lastMana' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 1 }] }] },
  // 費伍德樹人：戰吼：獲得一顆暫時的法力水晶。若你在手牌中時花費了 4 點法力，它是永久的
  CATA_131: {
    abilities: play(cond({ c: 'heldSpent', n: 4 }, [{ e: 'mana', kind: 'full', amount: 1 }], [{ e: 'mana', kind: 'temp', amount: 1 }])),
  },
  // 龍巢看守者：戰吼：獲得兩隻 3/3 嘲諷幼龍。若你在手牌中時花費了 8 點法力，改為召喚它們
  CATA_132: {
    abilities: play(cond({ c: 'heldSpent', n: 8 }, [summon('CATA_132t', 2)], [{ e: 'addCard', card: 'CATA_132t', count: 2, who: 'self' }])),
    tokens: ['CATA_132t'],
  },
  CATA_132t: { keywords: ['TAUNT'] },
  // 野木法陣（碎裂）
  CATA_134: {
    shatter: ['CATA_134t', 'CATA_134t2'],
    abilities: play(summon('CATA_134t3', 2), { e: 'buff', target: allFriendly, abilities: dr(summon('CATA_134t3')) }),
    tokens: ['CATA_134t', 'CATA_134t2', 'CATA_134t3'],
  },
  CATA_134t: { abilities: play(summon('CATA_134t3', 2)), tokens: ['CATA_134t3'] },
  CATA_134t2: { abilities: play({ e: 'buff', target: allFriendly, abilities: dr(summon('CATA_134t3')) }), tokens: ['CATA_134t3'] },
  CATA_134t3: {},
  // 苔蘚之絆：召喚兩個 1/2 魔像。花光你所有的法力，每花費 1 點賦予它們 +1/+1
  CATA_135: { abilities: play(summon('CATA_135t', 2), fn('mossbinding')), tokens: ['CATA_135t'] },
  CATA_135t: {},
  // 艾薩拉的凱旋：將 5 個消耗 (8) 以上的隨機手下洗入你的牌堆，使其體質加倍
  CATA_136: { abilities: play(fn('azsharaTriumph')) },
  // 藤牙：巨型 +4。在藤牙的其中一條腿獲得體質後，此手下也會獲得同樣體質
  CATA_139: { colossal: { limbs: ['CATA_139t', 'CATA_139t2', 'CATA_139t3', 'CATA_139t4'] }, tokens: ['CATA_139t', 'CATA_139t2', 'CATA_139t3', 'CATA_139t4'] },
  // 『夢境之龍』麥琳瑟拉：戰吼：用隨機的龍填滿你的手牌。若你在手牌中時花費了 25 點法力，它們的消耗為 (1)
  CATA_140: {
    abilities: play(cond({ c: 'heldSpent', n: 25 }, [fn('merithra', { cheap: true })], [fn('merithra', { cheap: false })])),
  },
  // 年邁的荒野語者
  MEND_041: { keywords: ['TAUNT'], abilities: play(cond({ c: 'noMinionLastTurn' }, [{ e: 'mana', kind: 'refresh', amount: 3 }])) },
  // 心根石：抽一張牌並獲得 3 點護甲值。若你上回合沒有打出手下，再來一次
  MEND_043: {
    abilities: play(draw(), { e: 'armor', amount: 3 }, cond({ c: 'noMinionLastTurn' }, [draw(), { e: 'armor', amount: 3 }])),
  },
  // 灰燼蟲：開始時休眠。當你的戰場滿了，甦醒
  MEND_040: { flags: ['ashWorm'], abilities: whenSummoned(fn('ashWormSleep')) },
  // 巴珊娜‧符文圖騰：戰吼：獲得三個 2/2 樹人。將價值 12 點法力的自然法術雕刻進它們
  MEND_046: { abilities: play(fn('bashana')), tokens: ['MEND_046t'] },
  MEND_046t: { abilities: play(fn('castCarved')) },

  // ============================================================== 獵人
  // 熔喉：巨型 +99
  CATA_550: {
    colossal: { limbs: ['CATA_550t', 'CATA_550t2', 'CATA_550t3', 'CATA_550t4', 'CATA_550t5', 'CATA_550t6'] },
    tokens: ['CATA_550t', 'CATA_550t2', 'CATA_550t3', 'CATA_550t4', 'CATA_550t5', 'CATA_550t6'],
  },
  // 石爪打擊者：嘲諷（在手牌中時打出龍會變成 6/6 的龍）
  CATA_551: {
    keywords: ['TAUNT'],
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly', race: 'DRAGON' }, effects: [fn('becomeInHand', { into: 'CATA_551t' })] }],
    tokens: ['CATA_551t'],
  },
  CATA_551t: { keywords: ['TAUNT'] },
  // 黯鱗斥候：戰吼：造成等同此手下攻擊力的傷害
  CATA_552: {
    target: optional(enemyChar),
    abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'selfAttack' } }),
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly', race: 'DRAGON' }, effects: [fn('becomeInHand', { into: 'CATA_552t' })] }],
    tokens: ['CATA_552t'],
  },
  CATA_552t: { target: optional(enemyChar), abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'selfAttack' } }) },
  // 厄比西昂：戰吼：本場對戰中你的龍具有衝刺
  CATA_553: {
    abilities: play({ e: 'grant', keyword: 'RUSH', race: 'DRAGON' }),
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly', race: 'DRAGON' }, effects: [fn('becomeInHand', { into: 'CATA_553t' })] }],
    tokens: ['CATA_553t'],
  },
  CATA_553t: { abilities: play({ e: 'grant', keyword: 'RUSH', race: 'DRAGON' }) },
  // 大地咆哮：將一個敵方手下的生命值設為 1。若你的手牌中有龍，再選擇另一個
  CATA_554: { target: enemyMinion, abilities: play(fn('earthenRoar')) },
  // 希瓦娜斯的凱旋：造成 3 點傷害。若你打出過另一張相同的牌，改為對全部敵人造成
  CATA_557: { target: anyChar, abilities: play(cond({ c: 'playedCopy' }, [{ e: 'damage', target: allEnemies, amount: 3, spell: true }], [hit(3)])) },
  // 面對托維爾：召喚你在本賽局中打出過的每個消耗為 (1) 的手下
  CATA_560: { abilities: play(fn('confrontTolvir')) },
  // 托維爾雕刻者：戰吼：選擇一張手牌，在你的回合開始時降低其消耗 (1)
  CATA_566: { abilities: play(fn('tolvirCarver')) },
  // 補給任務（碎裂）：抽 3 個手下。賦予你手牌中的手下 +2/+2
  CATA_820: {
    shatter: ['CATA_820t', 'CATA_820t2'],
    abilities: play({ e: 'draw', count: 3, who: 'self', pool: { type: 'MINION' } }, { e: 'handBuff', atk: 2, hp: 2, scope: 'all' }),
    tokens: ['CATA_820t', 'CATA_820t2'],
  },
  CATA_820t: { abilities: play({ e: 'draw', count: 3, who: 'self', pool: { type: 'MINION' } }) },
  CATA_820t2: { abilities: play({ e: 'handBuff', atk: 2, hp: 2, scope: 'all' }) },
  // 動物夥伴升級：馴服寵物 / 遷徙的伊萊克 / 自由遊蕩 / 靈語者 / 泰拉
  MEND_300: { abilities: play(fn('companionReplace', { cost: 1 }), draw()) },
  MEND_301: { abilities: play(fn('spiritspeaker')), tokens: ['NEW1_032', 'NEW1_033', 'NEW1_034'] },
  MEND_302: { abilities: play(fn('wastelandVanguard')) },
  MEND_303: { keywords: ['TAUNT'], abilities: play(fn('companionReplace', { cost: 1 })) },
  MEND_304: { abilities: play(fn('companionExtra')) },
  MEND_307: { abilities: play(fn('companionReplace', { cost: 2 }), fn('spiritspeaker')), tokens: ['NEW1_032', 'NEW1_033', 'NEW1_034'] },

  // ============================================================== 法師
  // 魔眼之外：秘法
  // 實驗：織法者的光輝：召喚一隻 6/6 的龍。本回合你的法術每造成 1 點傷害，消耗減少 (1)
  CATA_452: { costRule: { per: 'spellDamageDealtThisTurn', amount: 1 }, abilities: play(summon('CATA_452t')), tokens: ['CATA_452t'] },
  CATA_452t: {},
  // 大法師卡雷克：戰吼：賦予你手牌與牌堆中的全部法術法術傷害 +1
  CATA_458: { abilities: play(fn('allSpellsPower')) },
  // 不穩定的施法者：法術傷害 +1。戰吼：若你本回合用法術造成過傷害，召喚一個它的分身
  CATA_483: { spellDamage: 1, abilities: play(cond({ c: 'spellDamagedThisTurn' }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },
  // 冬泉谷幼龍：戰吼：發現一個任意職業的消耗 (1) 的法術
  CATA_484: { abilities: play({ e: 'discover', pool: { type: 'SPELL', cost: 1, anyClass: true } }) },
  // 喚雨者：你每回合第一次用法術造成傷害時，獲得 +2 攻擊力
  CATA_487: { abilities: [{ on: { k: 'firstSpellDamage' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 2 }] }] },
  // 弗坎諾斯：巨型 +2。在你的回合結束時，對所有其他手下造成 3 點傷害
  CATA_488: {
    colossal: { limbs: ['CATA_488t', 'CATA_488t2'] },
    abilities: atEndOfTurn({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, amount: 3 }),
    tokens: ['CATA_488t', 'CATA_488t2'],
  },
  // 秘法湧流（碎裂）
  CATA_489: {
    shatter: ['CATA_489t', 'CATA_489t2'],
    target: anyChar,
    abilities: play(hit(4), { e: 'damage', target: allEnemies, amount: 2, spell: true }),
    tokens: ['CATA_489t', 'CATA_489t2'],
  },
  CATA_489t: { target: anyChar, abilities: play(hit(4)) },
  CATA_489t2: { abilities: play({ e: 'damage', target: allEnemies, amount: 2, spell: true }) },
  // 辛德拉苟莎的凱旋：對一個手下造成 8 點傷害。使你一張隨機手牌的消耗降低，數值等同溢出傷害
  CATA_978: { target: anyMinion, abilities: play(fn('sindragosa')) },
  // 召喚專家：戰吼：選擇你手牌中的一個法術，將其分裂成兩個相同消耗的隨機法術
  CATA_979: { abilities: play(fn('conjurationSpecialist')) },
  // 地脈
  MEND_500: { abilities: play(fn('leylineBurst')) },
  MEND_501: { abilities: [...play(fn('leylineAdjust', { discount: 1 })), ...dr(fn('randomLeyline'))] },
  MEND_502: { abilities: play(fn('leylineCrystal')) },
  MEND_503: { abilities: play(fn('leylineAdjust', { extra: 1 })) },
  MEND_504: { abilities: play(fn('leylineNexus')) },
  MEND_505: { abilities: play(fn('arcanomicon')), tokens: ['MEND_505t', 'MEND_505t2', 'MEND_505t3'] },
  MEND_505t: {},
  MEND_505t2: {},
  MEND_505t3: {},
  MEND_506: { keywords: ['ELUSIVE'], abilities: play(fn('leylineAdjust', { bonus: 1 })) },

  // ============================================================== 聖騎士
  // 克洛瑪圖斯：巨型 +4。嘲諷、生命竊取、法術免疫、聖盾
  CATA_432: {
    keywords: ['TAUNT', 'LIFESTEAL', 'ELUSIVE', 'DIVINE_SHIELD'],
    colossal: { limbs: ['CATA_432t1', 'CATA_432t2', 'CATA_432t3', 'CATA_432t4'] },
    tokens: ['CATA_432t1', 'CATA_432t2', 'CATA_432t3', 'CATA_432t4'],
  },
  // 振奮之槌：亡語：觸發一個隨機友方手下的回合結束效果
  CATA_472: { abilities: dr(fn('inspiringMaul')) },
  // 『青銅守護巨龍』諾茲多姆：在你的回合結束時，賦予你的手下聖盾。已經有的改為 +3/+3
  CATA_473: { abilities: atEndOfTurn(fn('nozdormu')) },
  // 青銅龍救贖者：在你的回合結束時，召喚一隻與此手下體質相同的龍
  CATA_478: { abilities: atEndOfTurn(fn('bronzeRedeemer')), tokens: ['CATA_478t'] },
  CATA_478t: {},
  // 飛行行動（碎裂）
  CATA_479: {
    shatter: ['CATA_479t', 'CATA_479t2'],
    abilities: play(summon('CATA_479t3', 2), { e: 'buff', target: allFriendly, atk: 1, keywords: ['DIVINE_SHIELD'] }),
    tokens: ['CATA_479t', 'CATA_479t2', 'CATA_479t3'],
  },
  CATA_479t: { abilities: play(summon('CATA_479t3', 2)), tokens: ['CATA_479t3'] },
  CATA_479t2: { abilities: play({ e: 'buff', target: allFriendly, atk: 1, keywords: ['DIVINE_SHIELD'] }) },
  CATA_479t3: {},
  // 沙怒光環：你的手下的回合結束效果觸發兩次。持續 3 回合
  CATA_480: { abilities: play(fn('sandfuryAura', { turns: 3 })) },
  // 傑爾賓的凱旋：獲得一個隨機聖騎士光環。它會多持續一回合
  CATA_621: { abilities: play(fn('gelbinTriumph')) },
  // 新兵相關
  MEND_800: { keywords: ['RUSH'], abilities: dr(fn('recruitBuff', { atk: 1 })) },
  MEND_801: {
    keywords: ['DIVINE_SHIELD'],
    abilities: [{ on: { k: 'shieldLost', side: 'friendly' }, cond: { c: 'itIsSelf' }, effects: [fn('recruitBuff', { hp: 1 })] }],
  },
  MEND_802: { abilities: play(fn('recruitsDivineShield', { count: 2 })) },
  MEND_803: { abilities: play(fn('recruitBuff', { atk: 1, hp: 1 })) },
  MEND_804: { abilities: play(fn('aratorDouble')) },
  MEND_805: { abilities: play(fn('charity')) },
  MEND_900: { abilities: play(recruitCount(2), { e: 'addCard', card: 'CS2_101t', count: 2, who: 'self' }) },

  // ============================================================== 牧師
  // 黑血：巨型 +3。在你治療一個角色後，攻擊一個隨機敵方手下
  CATA_300: {
    colossal: { limbs: ['CATA_300t1', 'CATA_300t2', 'CATA_300t3'] },
    abilities: [{ on: { k: 'healed', subject: 'friendly' }, effects: [fn('attackRandomEnemyMinion')] }],
    tokens: ['CATA_300t1', 'CATA_300t2', 'CATA_300t3'],
  },
  // 憤怒的族母：在你的回合結束時，若此手下是滿血，獲得 +3 生命值
  CATA_305: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, cond: { c: 'not', cond: { c: 'damaged' } }, effects: [{ e: 'buff', target: { t: 'self' }, hp: 3 }] }] },
  // 暗影分裂（碎裂）
  CATA_306: {
    shatter: ['CATA_306t1', 'CATA_306t2'],
    target: friendlyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 3, keywords: ['ELUSIVE'] }, { e: 'summonCopy', target: { t: 'chosen' }, count: 1 }),
    tokens: ['CATA_306t1', 'CATA_306t2'],
  },
  CATA_306t1: { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 3, keywords: ['ELUSIVE'] }) },
  CATA_306t2: { target: friendlyMinion, abilities: play({ e: 'summonCopy', target: { t: 'chosen' }, count: 1 }) },
  // 『生命守護者』雅立史卓莎：戰吼：將你的剩餘生命值設為 15。當你的生命值回滿時，對你的對手造成 15 點傷害
  CATA_307: { abilities: play(fn('alexstrasza')) },
  // 麥迪文的凱旋：對全部手下造成 4 點傷害。若你控制傳說卡牌，消耗為 (1)
  CATA_308: { costIf: { cond: { c: 'controlLegendary' }, cost: 1 }, abilities: play({ e: 'damage', target: allMinions, amount: 4, spell: true }) },
  // 淨化教士：戰吼：在本賽局中你的治療效果多恢復 2 點生命值
  CATA_216: { abilities: play(fn('healBonus', { amount: 2 })) },

  // ============================================================== 盜賊
  // 古神特使：戰吼：選擇你的一張手牌，將其變形為幸運幣
  CATA_200: { abilities: play(fn('agentOfOldOnes')) },
  // 竊據之力：獲得一張其他職業的隨機碎裂卡牌（已經合併）
  CATA_202: { abilities: play(fn('stolenPower')) },
  // 迦羅娜的最後一博：可交易。摧毀一個傳說手下
  CATA_203: { keywords: ['TRADEABLE'], target: { filter: { type: 'minion', side: 'any', legendary: true } }, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  // 暈眩：將一個敵方手下移回其擁有者的手牌。他們下個回合不能打出它
  CATA_215: { target: enemyMinion, abilities: play(fn('daze')) },
  // 賽絲特拉：巨型 +2。你的其他職業法術施放兩次
  CATA_154: {
    flags: ['doubleOtherSpells'],
    colossal: { limbs: ['CATA_154t', 'CATA_154t1'] },
    tokens: ['CATA_154t', 'CATA_154t1'],
  },
  // 瘋狂追隨者：潛行。亡語：預兆
  CATA_158: { keywords: ['STEALTH'], abilities: dr(herald), tokens: ['CATA_158t'] },
  // 伊索拉斯：戰吼：吞噬對手手牌中的 2 張隨機卡牌，然後休眠 2 回合。亡語：將它們還回去
  CATA_481: { abilities: [...play(fn('devourFromHand', { count: 2 })), ...dr(fn('returnDevoured'))] },
  // 暮光儀式：預兆。連擊：造成 3 點傷害
  CATA_785: {
    target: { filter: { type: 'character', side: 'any' }, when: { c: 'combo' } },
    abilities: play(herald, cond({ c: 'combo' }, [hit(3)])),
    tokens: ['CATA_158t'],
  },
  // 混沌懇求者：在你施放法術後，施放一個相同消耗的其他職業的隨機法術
  CATA_786: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('chaosSupplicant')] }] },

  // ============================================================== 薩滿
  // 『風暴之王』奧拉基爾：巨型 +2，衝刺，風怒。戰吼：獲得 2 個消耗等同此手下攻擊力的手下，消耗為 (1)
  CATA_153: {
    keywords: ['RUSH', 'WINDFURY'],
    colossal: { limbs: ['CATA_153t', 'CATA_153t1'] },
    abilities: play(fn('alakirBC')),
    tokens: ['CATA_153t', 'CATA_153t1'],
  },
  // 小風之外：儀式
  CATA_561: { abilities: play(herald, { e: 'addCard', card: 'CATA_561t', count: 2, who: 'self' }), tokens: ['CATA_561t', 'CATA_565t'] },
  CATA_561t: { keywords: ['RUSH'] },
  // 轟雷雲行者：戰吼：選擇你手牌中消耗 (4) 以下的法術來吸收。亡語：施放它
  CATA_563: { abilities: play(fn('cloudstrider')) },
  // 空中支援：戰吼：賦予一個友方手下超級風怒。它無法攻擊英雄
  CATA_564: { target: optional(friendlyMinion), abilities: play(fn('airSupport')) },
  // 天空之牆哨兵：嘲諷。戰吼：預兆
  CATA_565: { keywords: ['TAUNT'], abilities: play(herald), tokens: ['CATA_565t'] },
  // 卓越術：將你的全部手下變形為消耗多 (1) 的手下。它們死亡時召喚原本的手下
  CATA_567: { abilities: play(fn('ascendance')) },
  // 穆拉丁的最後一博：抽 2 張牌。你的角色在本賽局中每攻擊過一次，消耗減少 (1)
  CATA_568: { costRule: { per: 'attacksThisGame', amount: 1 }, abilities: play(draw(2)) },
  // 祭祀衝擊：召喚一個隨機的 3 費、2 費和 1 費手下。超載：(1)
  CATA_569: {
    overload: 1,
    abilities: play(summonRandom({ type: 'MINION', cost: 3 }, 1), summonRandom({ type: 'MINION', cost: 2 }, 1), summonRandom({ type: 'MINION', cost: 1 }, 1)),
  },
  // 魔寇：戰吼：抽一張牌並使其消耗減少 (10)。用溢出的減少值重複此效果
  CATA_570: { abilities: play(fn('morchok')) },
  // 暴風守縛者：亡語：解鎖你被超載的法力水晶。超載：(3)
  CATA_724: { overload: 3, abilities: dr(fn('stormbinder')) },

  // ============================================================== 戰士
  // 『滅世烈火』拉格納羅斯：巨型 +2。在你的回合結束時，觸發你手下的亡語
  CATA_150: {
    flags: ['endTurnTriggerDeathrattle'],
    colossal: { limbs: ['CATA_150t', 'CATA_150t1'], leftFirst: true },
    tokens: ['CATA_150t', 'CATA_150t1'],
  },
  // 灼燒劫毀者：戰吼：預兆。賦予士兵衝刺
  CATA_160: { abilities: play(herald, { e: 'buff', target: { t: 'it' }, keywords: ['RUSH'] }), tokens: ['CATA_580t'] },
  // 浩劫戰斧：戰吼：預兆
  CATA_580: { abilities: play(herald), tokens: ['CATA_580t'] },
  // 屠戮：對全部手下造成 (場上手下數) 點傷害
  CATA_581: { abilities: play({ e: 'damage', target: allMinions, amount: { dyn: 'minionsOnBoardTotal', base: 0 }, spell: true }) },
  // 火炬：對一個受傷的手下造成 8 點傷害。將此牌連同溢出的傷害回到你的手牌
  CATA_585: { target: { filter: { type: 'minion', side: 'any', damaged: true } }, abilities: play(fn('torch')) },
  // 毀滅燃炎：在此手下受傷存活後，召喚一個毀滅燃炎。亡語：對一個隨機敵人造成 2 點傷害
  CATA_586: {
    abilities: [
      { on: { k: 'damaged', subject: 'self' }, cond: { c: 'itAlive' }, effects: [summon('CATA_586')] },
      ...dr({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 }),
    ],
  },
  // 指揮官迦頓：戰吼：不再每個回合抽牌，改為從你的牌堆發現一張牌，其消耗減少 (3)，銷毀其他的
  CATA_591: { abilities: play(fn('geddon')) },
  // 洛戈許的最後一博：賦予一個手下「亡語：從你的手牌召喚一個隨機手下」
  CATA_610: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr(fn('summonFromHand', { count: 1 })) }) },
  // 凍傷小鬼：戰吼：凍結此手下
  CATA_612: { abilities: play({ e: 'freeze', target: { t: 'self' } }) },

  // ============================================================== 術士
  // 丘加利：巨型 +2。你的手臂與士兵改為摧毀敵方牌堆中的手下
  CATA_726: {
    flags: ['chogallDeck'],
    colossal: { limbs: ['CATA_726t', 'CATA_726t1'] },
    tokens: ['CATA_726t', 'CATA_726t1'],
  },
  // 影誓侍徒：戰吼：預兆。亡語：為你的英雄恢復 3 點生命值
  CATA_725: { abilities: [...play(herald), ...dr({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 3 })], tokens: ['CATA_725t'] },
  // 魔眼神秘學者：嘲諷。戰吼：選擇你的一張手牌來棄掉
  CATA_490: { keywords: ['TAUNT'], abilities: play(fn('chooseHandDiscard')) },
  // 怪異觸手：對全部手下造成 3 點傷害。以少 1 點的傷害重複此效果
  CATA_491: { abilities: play(fn('eldritchTentacles')) },
  // 地獄公爵：衝刺。你本賽局每棄掉一張牌，獲得 +2/+2
  CATA_493: { keywords: ['RUSH'], auras: [{ scope: 'self', dyn: { amount: 'discardedThisGame', atk: 2, hp: 2 } }] },
  // 瑪洛里亞克：在你棄掉一個手下後，召喚一個它的分身
  CATA_494: { abilities: [{ on: { k: 'discard', side: 'friendly' }, effects: [fn('summonItDiscarded')] }] },
  // 詛咒鎖鏈：控制一個敵方手下直到他們的回合結束。它本回合無法攻擊
  CATA_496: { target: enemyMinion, abilities: play(fn('cursedChains')) },
  // 奧特拉賽恩：戰吼：預兆。使死亡之翼的消耗降低
  CATA_497: { abilities: play(herald, fn('ultraxion')), tokens: ['CATA_780t', 'CATA_525t', 'CATA_158t', 'CATA_565t', 'CATA_725t', 'CATA_580t'] },
  // 拉法姆的最後一博：對兩個隨機敵方手下造成 2 點傷害（每回合在手牌中時升級）
  CATA_498: {
    handGrow: true,
    abilities: play({ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 2 }, amount: { dyn: 'handCounter', base: 2 }, spell: true }),
  },
  // 砲灰侍僧：當你打出或棄掉此牌時，召喚兩個隨機消耗 (1) 的手下
  CATA_499: {
    abilities: [
      ...play(summonRandom({ type: 'MINION', cost: 1 }, 2)),
      { on: { k: 'discarded' }, effects: [summonRandom({ type: 'MINION', cost: 1 }, 2)] },
    ],
  },

  // ============================================================== 死亡騎士
  // 復生的奧妮克希亞：巨型 +2。在你的回合你的英雄會失去生命值時，改為獲得等量的最大生命值
  CATA_155: {
    flags: ['healthToMax'],
    colossal: { limbs: ['CATA_155t', 'CATA_155t1'] },
    tokens: ['CATA_155t', 'CATA_155t1'],
  },
  // 實驗性活化：預兆。對全部敵方手下造成 4 點傷害
  CATA_156: { abilities: play(herald, { e: 'damage', target: allEnemyMinions, amount: 4, spell: true }), tokens: ['CATA_780t'] },
  // 黑翼實驗品：亡語：獲得一張 2 費、造成等同此手下攻擊力傷害的法術
  CATA_464: { abilities: dr(fn('blackwingExperiment')), tokens: ['CATA_464t'] },
  CATA_464t: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'handCounter' } }) },
  // 維克多‧奈法利斯：戰吼：製作一隻自訂的不死族龍。若你的手牌中有龍，其消耗減少 (3)
  CATA_470: { abilities: play(fn('victorNefarius')), tokens: ['CATA_470t1'] },
  CATA_470t1: {},
  // 癡迷技師：生命竊取。戰吼：預兆
  CATA_780: { keywords: ['LIFESTEAL'], abilities: play(herald), tokens: ['CATA_780t'] },

  // ============================================================== 惡魔獵人
  // 『海洋之王』艾薩拉：巨型 +2。你的英雄具有風怒
  CATA_151: { flags: ['heroWindfury'], colossal: { limbs: ['CATA_151t', 'CATA_151t1'] }, tokens: ['CATA_151t', 'CATA_151t1'] },
  // 重甲放血者：衝刺。戰吼：預兆
  CATA_525: { keywords: ['RUSH'], abilities: play(herald), tokens: ['CATA_525t'] },
  // 布洛克斯的最後一博：對全部手下造成 1 點傷害。每有一個死亡，抽一張牌
  CATA_526: { abilities: play(fn('broxigar')) },
  // 海洋符印：在你的下個回合開始時，召喚一個 3/3 嘲諷納迦
  CATA_528: { abilities: play({ e: 'delayed', turns: 1, effects: [summon('CATA_528t')] }), tokens: ['CATA_528t'] },
  CATA_528t: { keywords: ['TAUNT'] },
  // 飢餓的魔化漁夫：你本賽局每施放一個邪能法術，消耗減少 (1)
  CATA_529: { costRule: { per: 'felSpellsCast', amount: 1 } },
  // 魔化注能：預兆。本回合你的英雄具有生命竊取
  CATA_530: { abilities: play(herald, fn('heroLifesteal')), tokens: ['CATA_525t'] },
  // 暴洪：對對手最左邊和最右邊的手下造成 5 點傷害。流放：重複此效果
  CATA_533: { abilities: play(fn('edgeDamage', { amount: 5 }), cond({ c: 'outcast' }, [fn('edgeDamage', { amount: 5 })])) },
  // 惡毒變種：戰吼：選擇你手牌中的一個邪能法術，獲得一張複製
  CATA_697: { abilities: play(fn('malevolentMutant')) },
  // 恐懼海獸：嘲諷。戰吼：選擇一個敵方手下，從其汲取 3 點生命值，共三次
  CATA_699: { keywords: ['TAUNT'], target: optional(enemyMinion), abilities: play(fn('dreadLeviathan')) },

  // ============================================================== 中立
  // 戰爭魚人：戰吼：你的下一個消耗 (3) 以下的魚人改為消耗生命值
  CATA_180: { abilities: play({ e: 'pendingDiscount', d: { race: 'MURLOC', health: true, maxCost: 3 } }) },
  // 無面複製者：法術免疫。亡語：將殺死此手下的手下變形成無面複製者
  CATA_185: { keywords: ['ELUSIVE'], abilities: dr(fn('facelessReplicator')) },
  // 黏彈破壞者：戰吼：給你的對手一張消耗 (2) 的破壞！。與它相鄰的牌消耗增加 (1)
  CATA_186: { abilities: play(fn('sabotage')), tokens: ['CATA_186t'] },
  CATA_186t: { adjacentCostUp: 1 },
  // 畸變怪物：嘲諷、法術免疫。每個回合在手牌中時，在兩種隨機加成效果之間切換
  CATA_206: { keywords: ['TAUNT', 'ELUSIVE'] },
  // 無私保衛者：嘲諷。受到的傷害多 1 點
  CATA_208: { keywords: ['TAUNT'], flags: ['extraDamage'] },
  // 戰場轟擊手：戰吼：選擇你手牌中的一個法術，賦予法術傷害 +1
  CATA_209: { abilities: play(fn('chooseSpellGiveSpellPower')) },
  // 暮光龍蛋：亡語：召喚一隻幼龍（在你的回合開始時獲得 +1/+1）
  CATA_210: {
    abilities: [...atStartOfTurn(fn('eggGrow')), ...dr(fn('eggHatch'))],
    tokens: ['CATA_210t'],
  },
  CATA_210t: {},
  // 維蘭諾斯：戰吼：若你起始手下的總消耗為 100，將 100 點體質分給你牌堆中的手下
  CATA_213: { abilities: play(fn('vyranoth')) },
  // 暗影告密者：戰吼：發現一個法術（每回合更換職業）
  CATA_614: { abilities: play(fn('informant')) },
  // 『詛咒之王』吉恩：在手牌中時，若你手中其餘的牌全是奇數或偶數，變成狼人之王
  CATA_615: { tokens: ['CATA_615t'] },
  CATA_615t: { abilities: play(fn('gennWorgen')) },
  // 古羅巨人：此手下的消耗減少，數值等同你上一張打出的牌的消耗
  CATA_616: { costRule: { per: 'lastCardCost', amount: 1 } },
  // 青銅守衛者：在你的回合結束時，召喚一隻 6/6 帶聖盾的元素龍
  CATA_476: { abilities: atEndOfTurn(summon('CATA_476t')), tokens: ['CATA_476t'] },
  CATA_476t: { keywords: ['DIVINE_SHIELD'] },
  // 生存專家：沒有其他手下時免疫
  CATA_613: { flags: ['minionImmuneAlone'] },
  // 將領黑角：戰吼：摧毀雙方牌堆中消耗 (2) 以下的所有卡牌
  CATA_720: { abilities: play(fn('warmasterBlackhorn')) },
  // 受庇護的倖存者：戰吼：選擇一張手牌洗入你的牌堆。抽一張牌
  CATA_721: { abilities: play(fn('shuffleHandCard')) },
  // 終焉使者：嘲諷。戰吼：預兆
  CATA_722: { keywords: ['TAUNT'], abilities: play(herald), tokens: ['CATA_780t', 'CATA_525t', 'CATA_158t', 'CATA_565t', 'CATA_725t', 'CATA_580t'] },
  // 寶石囤積者：戰吼：選擇你的一張手牌來棄掉。亡語：拿回它，消耗減少 (1)
  CATA_897: { abilities: play(fn('chooseHandDiscard', { returnOnDeath: true })) },
  // 綴鱗矛兵：所有敵方手下具有嘲諷
  CATA_898: { flags: ['enemyTaunt'] },
  // 培育妖精：戰吼：獲得一個綻放球莖
  MEND_100: { abilities: play({ e: 'addCard', card: 'MEND_100t', count: 1, who: 'self' }), tokens: ['MEND_100t'] },
  MEND_100t: { handGrow: true, abilities: play(fn('bloomingBulb')) },


  // ============================================================== 英雄
  // 『碎界者』死亡之翼：戰吼：選擇要釋放的大災變（預兆兩次可以釋放兩個，四次可以釋放全部四個）。英雄能力：本回合 +5 攻擊力
  CATA_190h: {
    heroPower: { effects: [{ e: 'heroAttack', amount: 5 }] },
    abilities: play(fn('deathwing')),
    tokens: ['CATA_190t10', 'CATA_190t11', 'CATA_190t12', 'CATA_190t13', 'CATA_190t14', 'CATA_780t', 'CATA_525t', 'CATA_158t', 'CATA_565t', 'CATA_725t', 'CATA_580t'],
  },
  // 龍之統御：召喚一隻 12/12 的龍
  CATA_190t10: { abilities: play(summon('CATA_190t14')) },
  CATA_190t14: {},
  // 覆滅：摧毀生命值最高的敵方手下
  CATA_190t11: { abilities: play(fn('topple')) },
  // 抹滅：對全部敵方手下造成 4 點傷害
  CATA_190t12: { abilities: play({ e: 'damage', target: allEnemyMinions, amount: 4 }) },
  // 奴役：將五隻隨機傳說龍洗入你的牌堆，它們的消耗為 (1)
  CATA_190t13: { abilities: play(fn('enthrall')) },
};
