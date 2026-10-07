// ============================================================================
// 深暗領域（GDB_，系列 1935）：手動定義的卡牌效果。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const spellburst = (...effects: Effect[]): Ability => ({ on: { k: 'spellCast', side: 'friendly' }, once: true, effects });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const randomEnemy = { t: 'random' as const, filter: { type: 'character' as const, side: 'enemy' as const }, count: 1 };
const selfBuff = (atk = 0, hp = 0, keywords?: Override['keywords']): Effect => ({ e: 'buff', target: { t: 'self' }, atk, hp, keywords });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const queue = (k: string, extra: Record<string, unknown> = {}): Effect => fn('gdQueue', { k, ...extra });
const CREW = ['GDB_471t', 'GDB_471t2', 'GDB_471t3', 'GDB_471t4', 'GDB_471t5', 'GDB_471t6', 'GDB_471t7', 'GDB_471t8'];

export const DARK_OVERRIDES: Record<string, Override> = {};
const reg = (id: string, ov: Override) => {
  DARK_OVERRIDES[id] = ov;
};

// ------------------------------------------------------------------ 衍生卡（沒有效果的）
for (const id of ['GDB_118t', 'GDB_118t2', 'GDB_124t2', 'GDB_139t', 'GDB_237t', 'GDB_331t3', 'GDB_840t', 'GDB_882t', 'GDB_100e']) reg(id, {});
// 船員：嘲諷 / 聖盾 / 突襲…，戰吼：召喚所有相鄰的船員
for (const id of CREW) reg(id, { abilities: play(fn('gdAdjoining')) });

// ------------------------------------------------------------------ 中立 / 各職業
// 艾卓奇異生物：流放與法術迸發：洗入手牌
reg('GDB_116', { abilities: [...play(cond({ c: 'outcast' }, [fn('gdShuffleHand')])), spellburst(fn('gdShuffleHand'))] });
// 叛軍隊長蒂爾卓：突襲。戰吼：把全部 8 種船員洗入牌堆。亡語：抽 2 張船員
reg('GDB_117', {
  keywords: ['RUSH'],
  abilities: [...play(...CREW.map((id): Effect => ({ e: 'shuffle', card: id, count: 1 }))), ...dr({ e: 'draw', count: 2, who: 'self', pool: { nameEn: 'Crewmate' } })],
  tokens: CREW,
});
// 『星辰粉碎者』佐爾托斯：戰吼：在手牌兩端各加入一顆星星
reg('GDB_118', { abilities: play(fn('gdStars')), tokens: ['GDB_118t', 'GDB_118t2'] });
// 緊急會議：獲得兩個 4/4 船員，並把一個隨機的 3 費以下惡魔放在它們中間
reg('GDB_119', { abilities: play(fn('gdMeeting')), tokens: CREW });
// 不祥之火：戰吼：不是開局在牌堆中的惡魔，消耗減少 (1)
reg('GDB_121', { abilities: play(fn('gdForeboding')) });
// 地獄策略：使一個手下 +3/+3。如果它是惡魔，你的下一個惡魔消耗減少 (2)
reg('GDB_122', { target: anyMinion, abilities: play(fn('gdInfernal')) });
// 綁架射線：獲得一個隨機惡魔，消耗減少 (2)。本回合可以重複施放
reg('GDB_123', { keywords: ['ECHO'], abilities: play(fn('gdAbduction')) });
// 治癒石：可交易。恢復你的英雄這個回合受到的所有傷害
reg('GDB_125', { keywords: ['TRADEABLE'], abilities: play(fn('gdHealthstone')) });
// 黑洞：消滅所有手下，惡魔除外
reg('GDB_126', { abilities: play({ e: 'destroy', target: { t: 'all', filter: { type: 'minion', side: 'any', notRace: 'DEMON' } } }) });
// 『暗星』卡菈：法術迸發：從一個隨機敵人身上偷取 2 點生命值（暗影法術不會用掉法術迸發）
reg('GDB_127', { abilities: [{ ...spellburst(fn('gdStealHealth')), keepOnce: 'SHADOW' }] });
// 末日少女：戰吼：從你對手的牌堆抽一張牌。如果你沒有在這個回合打出它，就放回去
reg('GDB_129', { abilities: play(fn('gdDoommaiden')) });
// 『流亡者領袖』velen：嘲諷。亡語：觸發你這場對戰打出過的所有其他德萊尼的戰吼與亡語
reg('GDB_131', { keywords: ['TAUNT'], abilities: dr(fn('gdVelen')) });
// 無情的怒火守衛：戰吼：對一個敵方手下造成 2 點傷害。如果它死亡，發現一個惡魔
reg('GDB_132', { target: enemyMinion, abilities: play(fn('gdWrathguard')) });
// 口袋次元：發現一張法術。重複，直到你第二次看到同一張
reg('GDB_133', { abilities: play(fn('gdPocket')) });
// 方舟翼駕駛員：在你的回合結束時，對一個隨機敵人造成 3 點傷害。法術迸發：召喚一個方舟翼駕駛員
reg('GDB_134', { abilities: [...atEndOfTurn({ e: 'damage', target: randomEnemy, amount: 3 }), spellburst({ e: 'summon', card: 'GDB_134', count: 1, who: 'self' })] });
// 巧匠工匠：戰吼：你打出的下一個德萊尼，恢復等同於它攻擊力的法力水晶
reg('GDB_135', { abilities: play(queue('refresh')) });
// 哈塔魯主教：戰吼：發現一張法術，消耗減少 (1)。如果你在這個回合打出它，重複這個效果
reg('GDB_136', { abilities: play(fn('gdHataaru')) });

// ------------------------------------------------------------------ 聖契（聖騎士）
reg('GDB_137', { libram: true, abilities: play(fn('gdClarity')) });
reg('GDB_138', { libram: true, target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }, cond({ c: 'selfCostZero' }, [{ e: 'atEndOfTurn', effects: [{ e: 'addCard', card: 'GDB_138', count: 1, who: 'self' }] }])) });
reg('GDB_139', { libram: true, abilities: play(summon('GDB_139t', 3), cond({ c: 'selfCostZero' }, [fn('gdFaith')])), tokens: ['GDB_139t'] });
// 天界光環：你只有 1 個手下時，它的攻擊力與生命值為 10。持續 3 個回合
reg('GDB_140', { objective: 3, abilities: [...play(fn('objective')), { on: { k: 'turnEnd', whose: 'mine' }, effects: [] }] });
// 伊瑞爾，希望之光：突襲。亡語：獲得三個不同的、來自較舊時間線的聖契
reg('GDB_141', { keywords: ['RUSH'], abilities: dr(fn('gdYrel')) });
// 無盡星空：這場對戰中每有一張牌被抽、被打出或被消滅，消耗就減少 (1)。戰吼：消滅所有其他手下
reg('GDB_142', { costRule: { per: 'cardEvents', amount: 1 }, abilities: play({ e: 'destroy', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } } }) });
// 奈薩斯親王夏法爾：法術迸發：使你手牌中的一個手下獲得 +3/+3 與這個法術迸發
reg('GDB_143', { abilities: [spellburst(fn('gdShaffar'))] });
// 盧米雅：生命竊取。英雄受到傷害後，免疫到回合結束
reg('GDB_144', { keywords: ['LIFESTEAL'], flags: ['lumia'] });
// 基爾加丹：戰吼：把你的牌堆換成無盡的惡魔傳送門。每個回合它們額外 +2/+2
reg('GDB_145', { abilities: play(fn('gdKiljaeden')) });

// ------------------------------------------------------------------ 戰士 / 盜賊 / 德魯伊 / 獵人 / 法師 …
// 敵意入侵者：戰吼、法術迸發與亡語：對所有其他手下造成 2 點傷害
{
  const boom: Effect = { e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, amount: 2 };
  reg('GDB_226', { abilities: [...play(boom), spellburst(boom), ...dr(boom)] });
}
// 拋棄：發現一張法術。花費 2 點護甲再發現一次
reg('GDB_227', { abilities: play(fn('gdJettison')) });
// 船長日誌：抽 2 張牌。你每控制一個德萊尼，消耗就減少 (1)
reg('GDB_228', { costRule: { per: 'friendlyRace', amount: 1, race: 'DRAENEI' }, abilities: play({ e: 'draw', count: 2, who: 'self' }) });
reg('GDB_229', { abilities: play(queue('attack')) });
// 堅毅的復仇者：攻擊時免疫。在每個回合結束時，交換這個手下的攻擊力與生命值
reg('GDB_230', { flags: ['immuneAttacking'], abilities: [{ on: { k: 'turnEnd', whose: 'each' }, effects: [{ e: 'swapStats', target: { t: 'self' } }] }] });
// 晶化巨槌：在你的英雄攻擊後，使你手牌中所有德萊尼 +2 攻擊力
reg('GDB_231', { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [{ e: 'handBuff', atk: 2, hp: 0, scope: 'all', race: 'DRAENEI' }] }] });
reg('GDB_232', { abilities: play(queue('heroAtk')) });
// 矮人行星：用隨機的 2 費手下填滿你的戰場，它們會攻擊隨機敵人
reg('GDB_233', { abilities: play(fn('gdDwarfPlanet')) });
// 孢子女皇莫爾達拉：開局：把 7 個複製孢子洗入你的牌堆。戰吼：施放一個
reg('GDB_234', { startOfGame: 'moldara', abilities: play(fn('gdMoldara')), tokens: ['GDB_234t'] });
reg('GDB_234t', { abilities: play(fn('gdSporeEffect')) });
// 星界領袖阿卡瑪：在這個手下攻擊後，所有其他友方手下可以再次攻擊
reg('GDB_235', { abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('gdAkama')] }] });
// 外星遭遇戰：召喚兩個 2/5 嘲諷野獸。你這場對戰每發現過一張牌，消耗就減少 (1)
reg('GDB_237', { costRule: { per: 'discoveredThisGame', amount: 1 }, abilities: play(summon('GDB_237t', 2)), tokens: ['GDB_237t'] });
// 超新星：用隨機的火焰法術填滿你的手牌，它們的消耗為 (1)
reg('GDB_301', { abilities: play(fn('gdSupernova')) });
reg('GDB_302', { abilities: play(fn('gdAccretion')) });
reg('GDB_303', { abilities: play(fn('gdBlasteroid')) });
reg('GDB_304', { abilities: play(fn('gdSaruun')) });
reg('GDB_305', { costRule: { per: 'friendlyRace', amount: 1, race: 'ELEMENTAL' }, abilities: play({ e: 'damage', target: allEnemies, amount: 2, spell: true }) });
// 虛空神諭者：法術傷害 +1。法術迸發：抽 2 張法術牌
reg('GDB_310', { spellDamage: 1, abilities: [spellburst({ e: 'draw', count: 2, who: 'self', pool: { type: 'SPELL' } })] });
reg('GDB_311', { abilities: [spellburst(fn('gdCurator'))] });
reg('GDB_320', { keywords: ['TAUNT', 'LIFESTEAL'], costRule: { per: 'enemyMinions', amount: 1 } });
// 突變生命體：在這個手下受到傷害並存活後，獲得一個隨機的額外效果
reg('GDB_321', { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [fn('gdBonusSelf')] }] });
reg('GDB_322', { keywords: ['RUSH'], abilities: [spellburst(selfBuff(0, 0, ['DIVINE_SHIELD']))] });
reg('GDB_330', { keywords: ['LIFESTEAL'], abilities: [spellburst(fn('coAttackRandom'))] });
reg('GDB_331', { abilities: dr(summon('GDB_331t1', 2)), tokens: ['GDB_331t1', 'GDB_331t2', 'GDB_331t3'] });
reg('GDB_331t1', { abilities: dr(summon('GDB_331t2', 2)) });
reg('GDB_331t2', { abilities: dr(summon('GDB_331t3', 2)) });
reg('GDB_333', { abilities: dr({ e: 'pendingDiscount', d: { amount: 1, type: 'WEAPON' } }) });
reg('GDB_341', { adjDiscount: true });
reg('GDB_343', { keywords: ['RUSH', 'TAUNT', 'STEALTH'] });
// 小行星：抽到時施放：對一個隨機敵人造成 2 點傷害
reg('GDB_430', { castsWhenDrawn: true, abilities: play(fn('gdAsteroid')) });
reg('GDB_434', { abilities: [...play(fn('gdAsteroidBonus')), spellburst(fn('gdShuffleAsteroids', { n: 3 }))], tokens: ['GDB_430'] });
reg('GDB_435', { abilities: play(fn('gdShuffleAsteroids', { n: 3 })), tokens: ['GDB_430'] });
reg('GDB_445', { abilities: play({ e: 'damage', target: allMinions, amount: 5, spell: true }, fn('gdShuffleAsteroids', { n: 5 })), tokens: ['GDB_430'] });
reg('GDB_901', { target: enemyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3 }, fn('gdShuffleAsteroids', { n: 3 })), tokens: ['GDB_430'] });
reg('GDB_439', { target: anyMinion, costIf: { cond: { c: 'adjPlayed' }, cost: 0 }, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1, keywords: ['DIVINE_SHIELD'] }) });
reg('GDB_440', { abilities: play(fn('gdTocha')) });
reg('GDB_441', { flags: ['anchorite'] });
reg('GDB_442', { abilities: [{ ...spellburst({ e: 'summonRandom', pool: { type: 'MINION', cost: 3 }, count: 1, who: 'self' }), keepOnce: 'HOLY' }] });
reg('GDB_443', { abilities: play(fn('gdCosmonaut')) });
reg('GDB_444', { abilities: play(queue('overload'), { e: 'pendingDiscount', d: { amount: 2, race: 'DRAENEI' } }) });
// 先知諾布敦：亡語：開啟星系之鏡，吸收你下一個施放的法術的力量
reg('GDB_447', { abilities: dr(fn('gdLens')), tokens: ['GDB_136t'] });
// 星系之鏡（地點）：啟用：施放它吸收的法術
reg('GDB_136t', { abilities: play(fn('gdLensCast')) });
reg('GDB_448', { flags: ['murmur'] });
reg('GDB_450', { abilities: play(fn('gdWayfinder')) });
reg('GDB_451', { abilities: play(fn('gdTriangulate')) });
reg('GDB_454', { abilities: [...dr({ e: 'heal', target: { t: 'hero', side: 'enemy' }, amount: 6 }), spellburst({ e: 'silence', target: { t: 'self' } })] });
reg('GDB_455', { abilities: play(queue('copy', { n: 2 })) });
reg('GDB_456', { abilities: play(fn('gdCombustion')) });
reg('GDB_457', { keywords: ['ECHO'], target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 2, keywords: ['RUSH'] }) });
reg('GDB_460', { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, fn('gdDivineStar')) });
reg('GDB_461', { abilities: play(fn('gdVigilant')) });
reg('GDB_462', { abilities: play(fn('gdSatellite')) });
reg('GDB_463', { keywords: ['DIVINE_SHIELD'], abilities: [spellburst({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION', race: 'DRAENEI' } })] });
reg('GDB_464', { abilities: play(fn('gdLapse')) });
reg('GDB_467', { abilities: play(fn('gdQuasar')) });
reg('GDB_469', { flags: ['auchenai'] });
reg('GDB_471', { abilities: atEndOfTurn(fn('gdCrewmate')), tokens: CREW });
reg('GDB_472', { flags: ['talgath'], abilities: play(cond({ c: 'combo' }, [{ e: 'addCard', card: 'CS2_072', count: 1, who: 'self' }])) });
reg('GDB_473', { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }, fn('gdCrewmate')), tokens: CREW });
reg('GDB_475', { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 0, hp: 0, keywords: ['TAUNT', 'LIFESTEAL'] }, cond({ c: 'adjPlayed' }, [{ e: 'buff', target: { t: 'chosen' }, atk: 0, hp: 0, keywords: ['REBORN'] }])) });
reg('GDB_479', { abilities: play(fn('gdNebula')) });

// ------------------------------------------------------------------ 德萊尼與聖契
reg('GDB_720', { abilities: play(queue('buff', { atk: 2, hp: 1 })) });
reg('GDB_721', { keywords: ['DIVINE_SHIELD'], abilities: [...play(fn('gdLibramDiscount')), ...dr(fn('gdLibramDiscount'))] });
reg('GDB_722', { abilities: [...play({ e: 'handBuff', atk: 2, hp: 1, scope: 'all', race: 'DRAENEI' }), ...dr({ e: 'handBuff', atk: 2, hp: 1, scope: 'all', race: 'DRAENEI' })] });
reg('GDB_723', { abilities: play(fn('gdHologram')) });
reg('GDB_726', { abilities: [...play(fn('gdLibramDiscount')), ...dr(fn('gdLibramDiscount'))] });
reg('GDB_728', { abilities: [...play({ e: 'draw', count: 1, who: 'self', pool: { libram: true } }), spellburst({ e: 'draw', count: 1, who: 'self', pool: { libram: true } })] });
reg('GDB_840', { abilities: dr(fn('gdEgg')), tokens: ['GDB_840t'] });
reg('GDB_841', { flags: ['rangari'] });
reg('GDB_842', { abilities: [{ on: { k: 'summoned' }, effects: [fn('gdGormStart')] }, ...atEndOfTurn(fn('gdGormEat'))] });
reg('GDB_843', { attackIf: { c: 'discoveredThisTurn' }, abilities: [spellburst(fn('gdHeroImmune'))] });
reg('GDB_844', { abilities: play({ e: 'discover', pool: { type: 'MINION', race: 'BEAST', minCost: 5 } }, { e: 'costMod', amount: -2, scope: 'it' }) });
reg('GDB_846', { abilities: play(fn('gdNaielle')) });
reg('GDB_846hp', {});
reg('GDB_851', {
  chooseOne: [
    { id: 'GDB_851a', name: '致命光線', text: '對兩個隨機敵方手下造成$2點傷害', abilities: play({ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 2 }, amount: 2, spell: true }) },
    { id: 'GDB_851b', name: '震懾之星', text: '使一個敵方手下休眠2個回合', target: enemyMinion, abilities: play(fn('gdStun')) },
  ],
});
reg('GDB_851a', {});
reg('GDB_851b', {});
reg('GDB_852', { abilities: play(fn('gdRevelation')) });
reg('GDB_854', { handGrow: true, abilities: play(fn('gdUluu')) });
reg('GDB_855', { keywords: ['ELUSIVE', 'TAUNT'], abilities: [spellburst({ e: 'heroAttack', amount: 8 }, { e: 'armor', amount: 8 })] });
reg('GDB_857', { abilities: play({ e: 'discover', pool: { type: 'MINION', cost: 10, past: true, anyClass: true } }, fn('gdCostOne')) });
reg('GDB_860', { abilities: [spellburst({ e: 'doubleStat', target: { t: 'self' }, stat: 'atk' })] });
reg('GDB_861', { abilities: play(queue('buff', { hp: 2, kw: ['RUSH'] })) });
reg('GDB_862', { keywords: ['TAUNT'], abilities: dr(fn('gdCrusader')) });
reg('GDB_863', { abilities: play(fn('gdTrailblazer')) });
reg('GDB_864', { overload: 1, abilities: play({ e: 'summonRandom', pool: { type: 'MINION', cost: 1 }, count: 2, who: 'self' }) });
reg('GDB_870', { abilities: [...play(cond({ c: 'combo' }, [selfBuff(2, 0, ['STEALTH'])])), spellburst(selfBuff(2, 0, ['STEALTH']))] });
reg('GDB_873', { abilities: play({ e: 'discover', pool: { type: 'MINION', combo: true } }, fn('gdComboTwice')) });
reg('GDB_874', { abilities: play(fn('gdAstrobiologist')) });
reg('GDB_875', { abilities: play({ e: 'pendingDiscount', d: { amount: 1, combo: true } }) });
reg('GDB_877', { keywords: ['RUSH'], abilities: dr(fn('gdEscapePod')) });
reg('GDB_878', { abilities: play(fn('gdBraingill')) });
reg('GDB_881', { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, fn('gdPressure')) });
reg('GDB_882', { abilities: play(summon('GDB_882t', 3), cond({ c: 'boardFull' }, [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 1, hp: 1 }])), tokens: ['GDB_882t'] });
reg('GDB_883', { abilities: play({ e: 'summonRandom', pool: { type: 'MINION', cost: 2 }, count: 2, who: 'self' }, { e: 'mana', kind: 'refresh', amount: 2 }) });
reg('GDB_902', { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeChosen: true } }, amount: 3, spell: true }) });

// ============================================================================
// 星海爭霸（SC_）：蟲族與神族。人族與星艦在 overrides.ts
// ============================================================================
// 阿克蒙德：戰吼：召喚你這場對戰打出過的所有、不是開局在牌堆中的惡魔
reg('GDB_128', { abilities: play(fn('gdArchimonde')) });

// ------------------------------------------------------------------ 蟲族
// 孵化池（地點）：獲得一隻 1/1 跳蟲。亡語：本回合你的蟲族手下具有突襲
reg('SC_000', { abilities: [...play({ e: 'addCard', card: 'SC_010', count: 1, who: 'self' }), ...dr(fn('scRush'))] });
reg('SC_001', { abilities: play(fn('scBaneling')), tokens: ['SC_019t'] });
reg('SC_002', { abilities: dr(fn('scInfestor')) });
reg('SC_003', { abilities: atEndOfTurn({ e: 'addCard', card: 'SC_003t', count: 1, who: 'self' }), tokens: ['SC_003t'] });
reg('SC_003t', {});
reg('SC_004', {
  abilities: play(summon('SC_003', 2), { e: 'damage', target: allEnemies, amount: 3 }),
  heroPower: { effects: [fn('scRavage')] },
  tokens: ['SC_003'],
});
reg('SC_006', { keywords: ['RUSH'] });
reg('SC_008', { abilities: play(fn('scHydralisk')) });
reg('SC_009', { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, effects: [fn('scLurker')] }] });
reg('SC_010', { abilities: play({ e: 'summon', card: 'SC_T_ZERGLING', count: 1, who: 'self' }) });
reg('SC_011', { objective: 3, abilities: [...play(fn('objective')), { on: { k: 'turnEnd', whose: 'mine' }, effects: [] }] });
reg('SC_012', { abilities: [...play(fn('scRoach')), { on: { k: 'drawn' }, effects: [fn('scRoachDraw')] }] });
reg('SC_013', { abilities: play(fn('scGrunty')) });
reg('SC_015', { abilities: play(fn('scNydus')) });
reg('SC_018', { abilities: play(fn('scViper')) });
// 終極蟲巢（地點）：對所有敵人造成 1 點傷害。亡語：召喚一隻 8/8 的雷獸
reg('SC_019', { abilities: [...play({ e: 'damage', target: allEnemies, amount: 1 }), ...dr(summon('SC_006'))], tokens: ['SC_006', 'SC_019t'] });
reg('SC_019t', { abilities: dr({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: { dyn: 'selfAttack' } }) });
reg('SC_020', { abilities: play(fn('scConsume')) });
reg('SC_021', { abilities: play(fn('scEvolution')) });
reg('SC_022', { keywords: ['CLEAVE'], flags: ['mutalisk'] });
reg('SC_023', { keywords: ['TAUNT', 'CANT_ATTACK'], attackIf: { c: 'hasLocation' } });

// ------------------------------------------------------------------ 神族
reg('SC_750', { abilities: play(fn('scChrono')), tokens: ['SC_751t'] });
reg('SC_751', { abilities: play({ e: 'pendingDiscount', d: { amount: 3, protoss: true, type: 'MINION' } }) });
reg('SC_751t', { keywords: ['CHARGE'] });
reg('SC_752', { keywords: ['STEALTH'], target: enemyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, fn('scTemplar')), tokens: ['SC_671t1'] });
reg('SC_765', { abilities: play({ e: 'damage', target: allEnemies, amount: 2 }, fn('scTemplar')), tokens: ['SC_671t1'] });
reg('SC_671t1', { abilities: atEndOfTurn({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 8 }, { e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: 2 }) });
reg('SC_753', { target: anyChar, abilities: play(fn('scPhoton')) });
reg('SC_754', {
  abilities: play(summon('SC_751t', 2), fn('scArtanis')),
  heroPower: { target: { filter: { type: 'minion', side: 'friendly' } }, effects: [{ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 0, keywords: ['DIVINE_SHIELD'] }, fn('scTwinBlades')] },
  tokens: ['SC_751t'],
});
reg('SC_755', { abilities: play({ e: 'pendingDiscount', d: { amount: 2, protoss: true, thisTurn: true } }) });
reg('SC_756', { abilities: atEndOfTurn(fn('scCarrier')), tokens: ['SC_756t'] });
reg('SC_756t', {});
reg('SC_757', { target: { filter: { type: 'minion', side: 'friendly', protoss: true } }, abilities: play(fn('scHallucination')) });
reg('SC_758', { abilities: play(fn('scColossus')) });
reg('SC_759', { abilities: play({ e: 'armor', amount: 6 }, { e: 'pendingDiscount', d: { amount: 2, protoss: true, type: 'SPELL' } }) });
reg('SC_760', { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5, spell: true }, { e: 'addRandom', pool: { type: 'SPELL', protoss: true, anyClass: true }, count: 1, who: 'self' }) });
reg('SC_761', { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION', protoss: true } }, cond({ c: 'combo' }, [fn('scBlinkDiscount')])) });
reg('SC_762', { keywords: ['TAUNT'], abilities: [...play({ e: 'addRandom', pool: { type: 'MINION', protoss: true, anyClass: true }, count: 2, who: 'self' }), ...dr({ e: 'addRandom', pool: { type: 'MINION', protoss: true, anyClass: true }, count: 2, who: 'self' })] });
reg('SC_763', { keywords: ['TAUNT', 'DIVINE_SHIELD'], abilities: play(fn('scImmortal')) });
reg('SC_764', { keywords: ['LIFESTEAL'], abilities: dr(fn('scSentry')) });
reg('SC_783', { keywords: ['RUSH', 'DIVINE_SHIELD'], abilities: play(cond({ c: 'selfCostZero' }, [selfBuff(2, 2)])) });

// 星港（地點）：召喚一個 2/1、發射時有效果的星艦組件
reg('SC_403', { abilities: play(fn('summonOneOf', { cards: ['SC_403a', 'SC_403b', 'SC_403d', 'SC_403f'] })), tokens: ['SC_403a', 'SC_403b', 'SC_403d', 'SC_403f'] });
