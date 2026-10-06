// ============================================================================
// 翡翠夢境（EDR_ / FIR_，系列 1946）：手動定義的卡牌效果。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const whenSummoned = (...effects: Effect[]): Ability[] => [{ on: { k: 'summoned' }, effects }];
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const addCard = (card: string, count = 1): Effect => ({ e: 'addCard', card, count, who: 'self' });
const imbue = (times = 1): Effect => fn('imbue', { times });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const selfBuff = (atk = 0, hp = 0, keywords?: Override['keywords']): Effect => ({ e: 'buff', target: { t: 'self' }, atk, hp, keywords });
const heroHit = (effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];
const gift = (args: Record<string, unknown>): Effect => fn('coGiftPick', args);

export const EMERALD_OVERRIDES: Record<string, Override> = {};
const reg = (id: string, ov: Override) => {
  EMERALD_OVERRIDES[id] = ov;
};

const DREAMS = ['DREAM_01', 'DREAM_02', 'DREAM_03', 'DREAM_04', 'DREAM_05'];
const SEEDS = ['EDR_840t', 'EDR_840t1', 'EDR_840t2'];
/** 灌注後的英雄能力會用到的衍生卡 */
const IMBUE_TOKENS = ['EDR_847pt2', 'EDR_851t', 'EDR_445pt3'];

// ============================================================== 第一批：EDR_000 ~ EDR_4xx
// 伊瑟拉，翡翠守護者：開局：雙方玩家的法力水晶上限增加 5。戰吼：獲得 3 顆法力水晶
reg('EDR_000', { startOfGame: 'ysera', abilities: play({ e: 'mana', kind: 'full', amount: 3 }) });
// 懷抱希望的樹精：戰吼：獲得一張隨機的夢境牌
reg('EDR_001', { abilities: play(fn('coDream')), tokens: DREAMS });
// 翠綠夢境劍齒虎：戰吼：若這張牌消耗 (3) 以下，攻擊兩個隨機敵方手下
reg('EDR_014', { abilities: play(fn('coSaber')) });
// 奧恩哈拉：在你的回合結束時，打出你牌堆頂的 3 張牌
reg('EDR_031', { abilities: atEndOfTurn(fn('coOhnahra')) });
// 背叛的折磨者：戰吼：發現一個帶有黑暗禮物的傳說手下
reg('EDR_102', { abilities: play(gift({ pool: { type: 'MINION', rarity: 'LEGENDARY', anyClass: true } })) });
// 瘋狂的生物：戰吼：發現一個帶有黑暗禮物的 3 費手下
reg('EDR_105', { abilities: play(gift({ pool: { type: 'MINION', cost: 3, anyClass: true } })) });
// 森林之王塞納留斯：選擇三次 - 使你的其他手下 +1/+3；或召喚一個 5/5 具有嘲諷的古樹
reg('EDR_209', { abilities: play(fn('coThrice')), tokens: ['EDR_209a', 'EDR_209b', 'EDR_209t5'] });
reg('EDR_209a', {});
reg('EDR_209b', {});
reg('EDR_209t5', { keywords: ['TAUNT'] });
// 異國獸欄長：戰吼：抽一隻野獸。灌注你的英雄能力
reg('EDR_226', { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION', race: 'BEAST' } }, imbue()) , tokens: IMBUE_TOKENS });
// 暗爪獸：突襲。亡語：灌注你的英雄能力
reg('EDR_227', { keywords: ['RUSH'], abilities: dr(imbue()) , tokens: IMBUE_TOKENS });
// 豆莖莽漢：戰吼：使你牌堆頂的 3 個手下 +4/+4
reg('EDR_230', { abilities: play(fn('coTopMinions')) });
// 守護巨龍的擁抱：恢復 #4 點生命值。抽一張牌。灌注你的英雄能力
reg('EDR_231', { target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 4 }, draw(1), imbue()) });
// 颶風：每個手下被洗入一個隨機玩家的牌堆
reg('EDR_232', { abilities: play(fn('coTyphoon')) });
// 森林之靈：選擇一個 - 召喚三隻 2/3 嘲諷的狼；或召喚兩隻 4/3 風怒的獵鷹
reg('EDR_233', {
  chooseOne: [
    { id: 'EDR_233a', name: '狼之力量', text: '召喚三隻具有<b>嘲諷</b>的2/3狼', abilities: play(summon('EDR_T_WOLF23', 3)) },
    { id: 'EDR_233b', name: '獵鷹之敏捷', text: '召喚兩隻具有<b>風怒</b>的4/3獵鷹', abilities: play(summon('EDR_233t2', 2)) },
  ],
  tokens: ['EDR_233t2'],
});
reg('EDR_233t2', { keywords: ['WINDFURY'] });
// 翡翠賞金：抽兩張牌。你在 2 個回合內無法打出它們
reg('EDR_234', { abilities: play(fn('coBounty')) });
// 梅里瑟拉：戰吼：復活你所有消耗 (8) 以上、各不相同的友方手下
reg('EDR_238', { abilities: play(fn('coMerithra')) });
// 龍鱗軍備：抽一張一開始就在牌堆中的法術與一張並非如此的法術
reg('EDR_251', { abilities: play({ e: 'custom', fn: 'coDrawStarting', args: { starting: true } }, { e: 'custom', fn: 'coDrawStarting', args: { starting: false } }) });
// 厄索之印：選擇一個手下。若是敵方，將其屬性值設為 1/1；若是友方，改為 3/3
reg('EDR_252', { target: anyMinion, abilities: play(fn('coMark')) });
// 活動月井：在你施放一個法術後，獲得等同其消耗的攻擊力
reg('EDR_254', { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('coGainAtkCost')] }] });
// 重生之火：生命竊取。對生命值最低的敵人造成 $5 點傷害兩次
reg('EDR_255', { keywords: ['LIFESTEAL'], abilities: play(fn('coLowest', { n: 5, times: 2 })) });
// 夢境看守者：嘲諷。戰吼：若你的牌堆中有一張並非一開始就在牌堆的牌，抽出它並獲得 +2/+2
reg('EDR_256', { keywords: ['TAUNT'], abilities: play(fn('coDreamwarden')) });
// 光之療者：嘲諷。選擇一個 - +3 攻擊力與聖盾；或 +3 生命值與生命竊取
reg('EDR_257', {
  keywords: ['TAUNT'],
  chooseOne: [
    { id: 'EDR_257a', name: '神聖羈絆', text: '+3攻擊力與<b>聖盾</b>', abilities: play(selfBuff(3, 0, ['DIVINE_SHIELD'])) },
    { id: 'EDR_257b', name: '光之擁抱', text: '+3生命值與<b>生命竊取</b>', abilities: play(selfBuff(0, 3, ['LIFESTEAL'])) },
  ],
});
// 不屈的托雷斯：聖盾、嘲諷。你的聖盾要被打破三次
reg('EDR_258', { keywords: ['DIVINE_SHIELD', 'TAUNT'], flags: ['toreth'] });
// 厄索：戰吼：把你手牌中消耗最高的法術以光環的形式施放，持續 3 個回合
reg('EDR_259', { abilities: play(fn('coUrsol')) });
// 幻影青翼龍：嘲諷。亡語：將兩條 4/5 的嘲諷龍洗入你的牌堆，它們會在抽到時召喚
reg('EDR_260', { keywords: ['TAUNT'], abilities: dr({ e: 'shuffle', card: 'EDR_260t', count: 2 }), tokens: ['EDR_260t'] });
reg('EDR_260t', { summonedWhenDrawn: true, keywords: ['TAUNT'] });
// 兩棲之靈：使一個手下 +2/+2 與「亡語：使一個友方手下 +2/+2 與此亡語」
reg('EDR_261', { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, fn('coAmphibian')) });
// 靈魂羈絆：對一個手下造成 $3 點傷害。若它死亡，召喚一隻具有突襲的 3/2 的狼
reg('EDR_262', { target: anyMinion, abilities: play(fn('coSpiritBond')) });
// 巨狼之恩：選擇一個 - 對敵方英雄造成 $4 點傷害；或召喚兩隻具有突襲的 3/2 的狼
reg('EDR_263', {
  chooseOne: [
    { id: 'EDR_263a', name: '巨狼的凶猛', text: '對敵方英雄造成$4點傷害', abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 4, spell: true }) },
    { id: 'EDR_263b', name: '巨狼的指引', text: '召喚兩隻具有<b>突襲</b>的3/2狼', abilities: play(summon('EDR_T_WOLF32', 2)) },
  ],
});
// 光明之盾：召喚一個隨機的 2 費手下並使其獲得嘲諷。灌注你的英雄能力
reg('EDR_264', { abilities: play(fn('coSummonTaunt', { cost: 2 }), imbue()) });
// 林地塑形者：在你施放一個自然法術後，召喚一個 2/2 的樹人，其亡語：獲得那個法術的複製
reg('EDR_271', { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'NATURE' }, effects: [fn('coGroveShaper')] }], tokens: ['EDR_271t'] });
reg('EDR_271t', { abilities: dr(fn('coGetStash')) });
// 共生：發現另一個職業的一張二選一卡牌
reg('EDR_273', { abilities: play({ e: 'discover', pool: { type: 'MINION', chooseOne: true, otherClass: true } }) });
// 牧羊人的牧杖：在你的英雄攻擊後，召喚一隻休眠 2 個回合的 3/3 綿羊
reg('EDR_416', { abilities: heroHit([fn('coSheep')]), tokens: ['EDR_416t'] });
reg('EDR_416t', {});
// 預兆：突襲、風怒。亡語：對所有敵人造成 @ 點傷害（在此手下攻擊後提升！）
reg('EDR_421', { keywords: ['RUSH', 'WINDFURY'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('coOmenGrow')] }, ...dr(fn('coOmenDr'))] });
// 艾辛娜：戰吼：若本場對戰中死亡了 20 個友方手下，對所有敵人造成 20 點傷害（隨機分散）
reg('EDR_430', { abilities: play(fn('coAessina')) });
// 月翼信使：生命竊取。戰吼：灌注你的英雄能力
reg('EDR_449', { keywords: ['LIFESTEAL'], abilities: play(imbue()) , tokens: IMBUE_TOKENS });
// 金瓣幼龍：戰吼與亡語：灌注你的英雄能力
reg('EDR_451', { abilities: [...play(imbue()), ...dr(imbue())] , tokens: IMBUE_TOKENS });
// 荊棘幼龍：在你的回合結束時，攻擊一個隨機敵方手下（溢出的傷害會打到敵方英雄）
reg('EDR_453', { abilities: atEndOfTurn(fn('coBriarspawn')) });
// 屈服於瘋狂：發現一條本場對戰中死亡的友方龍並復活它
reg('EDR_455', { abilities: play(fn('coResummonDiscover', { race: 'DRAGON' })) });
// 暗騎士：戰吼：若你的手牌中有龍，發現一條帶有黑暗禮物的龍
reg('EDR_456', { abilities: play(cond({ c: 'holding', race: 'DRAGON' }, [gift({ pool: { type: 'MINION', race: 'DRAGON', anyClass: true } })])) });
// 育雛員：戰吼：若你的手牌中有龍，裝備一把 2/2 的劍
reg('EDR_457', { abilities: play(cond({ c: 'holding', race: 'DRAGON' }, [{ e: 'equip', card: 'EDR_457t' }])), tokens: ['EDR_457t'] });
reg('EDR_457t', {});
// 新月的願望：對一個手下造成 $6 點傷害。（施放 3 個法術以獲得生命竊取）
reg('EDR_460', { target: anyMinion, transformAfterSpells: { n: 3, into: 'EDR_460t' }, abilities: play(hit(6)), tokens: ['EDR_460t'] });
reg('EDR_460t', { target: anyMinion, keywords: ['LIFESTEAL'], abilities: play(hit(6)) });
// 新月的儀式：召喚兩個隨機的 3 費手下。（施放 3 個法術改為 6 費）
reg('EDR_461', { transformAfterSpells: { n: 3, into: 'EDR_461t' }, abilities: play({ e: 'summonRandom', pool: { type: 'MINION', cost: 3, anyClass: true }, count: 2, who: 'self' }), tokens: ['EDR_461t'] });
reg('EDR_461t', { abilities: play({ e: 'summonRandom', pool: { type: 'MINION', cost: 6, anyClass: true }, count: 2, who: 'self' }) });
// 泰蘭德：戰吼：你打出的下 3 個法術會施放兩次
reg('EDR_464', { abilities: play(fn('coTyrande')) });
// 伊森德雷：嘲諷。亡語：本場對戰中伊森德雷每死亡過一次，召喚一條隨機的龍
reg('EDR_465', { keywords: ['TAUNT'], abilities: dr(fn('coYsondre')) });
// 沉睡的精靈：以休眠開始。在你使用英雄能力後，甦醒
reg('EDR_469', { flags: ['awakenOnPower'], abilities: whenSummoned(fn('coDormantStart')) });
// 托爾托拉：嘲諷、元素閃避。在此手下受到傷害後，獲得 1 點護甲並使其 +1 攻擊力
reg('EDR_471', { keywords: ['TAUNT', 'ELUSIVE'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'armor', amount: 1 }, selfBuff(1, 0)] }] });
// 週期編織者：戰吼：若你的手牌中有消耗 (5) 以上的法術，造成 3 點傷害
reg('EDR_472', { target: optional(anyChar), abilities: play(cond({ c: 'holding', type: 'SPELL', minCost: 5 }, [hit(3, false)])) });
// 戈林：突襲。友方野獸造成雙倍傷害
reg('EDR_480', { keywords: ['RUSH'], flags: ['goldrinn'] });
// 神話符文熊：嘲諷。戰吼：若此手下的攻擊力至少為 4，召喚一個它的複製
reg('EDR_481', { keywords: ['TAUNT'], abilities: play(cond({ c: 'selfAttack', n: 4 }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) });
// 腐爛的蘋果：為你的英雄恢復 #12 點生命值。在接下來 2 個回合，對你的英雄造成 $3 點傷害
reg('EDR_482', {
  abilities: play(
    { e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 12 },
    { e: 'delayed', turns: 1, effects: [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 3, spell: true }] },
    { e: 'delayed', turns: 2, effects: [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 3, spell: true }] },
  ),
});
// 破碎之力：摧毀你的一顆法力水晶。2 個回合後獲得兩顆
reg('EDR_483', { abilities: play({ e: 'mana', kind: 'destroy', amount: 1 }, { e: 'delayed', turns: 2, effects: [{ e: 'mana', kind: 'full', amount: 2 }] }) });
// 食腐捕蠅草：在一個手下死亡後，獲得它的攻擊力
reg('EDR_484', { abilities: [{ on: { k: 'minionDied', side: 'any' }, effects: [fn('coGainDeadAttack')] }] });
// 腐心樹精：亡語：抽一個消耗 (7) 以上的手下
reg('EDR_485', { abilities: dr({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION', minCost: 7 } }) });

// ============================================================== 第二批：EDR_486 ~ EDR_979
// 沼澤惡魔瓦洛：在手牌或牌堆中時，它會獲得每一個賦予你的手下的黑暗禮物
reg('EDR_487', {});
// 前衛園藝：發現一個帶有黑暗禮物的亡語手下
reg('EDR_488', { abilities: play(gift({ pool: { type: 'MINION', hasDeathrattle: true, anyClass: true } })) });
// 阿加馬根：戰吼：你打出的下一張牌改為消耗你對手的生命值（最多 10 點）
reg('EDR_489', { abilities: play({ e: 'pendingDiscount', d: { oppHealth: true } }) });
// 睡眠麻痺：選擇一個 - 召喚兩個無法攻擊、具有嘲諷的 3/6 惡魔；或消滅一個敵方手下
reg('EDR_490', {
  chooseOne: [
    { id: 'EDR_490a', name: '黑暗中的身影', text: '召喚兩個無法攻擊、具有<b>嘲諷</b>的3/6惡魔', abilities: play(summon('EDR_490t', 2)) },
    { id: 'EDR_490b', name: '智窮', text: '消滅一個敵方手下', target: enemyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  ],
  tokens: ['EDR_490t'],
});
reg('EDR_490t', { keywords: ['TAUNT', 'CANT_ATTACK'] });
// 荊棘大德魯伊：戰吼：獲得你本回合死亡的手下的亡語
reg('EDR_491', { abilities: play(fn('coArchdruid')) });
// 阿拉希：戰吼：把你手牌中的手下變成隨機惡魔（保留原本的屬性值與消耗）
reg('EDR_493', { abilities: play(fn('coAlarashi')) });
// 飢餓的遠古樹人：在你的回合結束時，吞噬你牌堆中的一個手下並獲得它的屬性值。亡語：將它們加入你的手牌
reg('EDR_494', { abilities: [...atEndOfTurn(fn('coEatDeck')), ...dr(fn('coRegurgitate'))] });
// 扭曲的樹人：亡語：使每位玩家手牌中的一個隨機手下 -2 攻擊力
reg('EDR_495', { abilities: dr(fn('coTwistedTreant')) });
// 昆祖：戰吼：發現一個法術。選擇保留它，或放到你對手的牌堆頂
reg('EDR_517', { abilities: play(fn('coQonzu')), tokens: ['EDR_517A', 'EDR_517B'] });
reg('EDR_517A', {});
reg('EDR_517B', {});
// 活著的花園：戰吼：灌注你的英雄能力。使你手牌中的一個手下消耗減少 (1)
reg('EDR_518', { abilities: play(imbue(), fn('coHandCostOne')) , tokens: IMBUE_TOKENS });
// 靈魂騎士：戰吼：灌注你的英雄能力，然後觸發它
reg('EDR_519', { abilities: play(fn('coWisprider')) , tokens: IMBUE_TOKENS });
// 狡猾的薩特：戰吼：獲得你對手手牌中消耗最低的牌的複製
reg('EDR_521', { abilities: play(fn('coSatyr')) });
// 擬態：你的對手抽 2 張牌。你獲得它們的複製
reg('EDR_522', { abilities: play(fn('coMimicry')) });
// 欺詐之網：將一個友方手下移回你的手牌，召喚一個具有潛行的 4/4 蜘蛛
reg('EDR_523', { target: friendlyMinion, abilities: play({ e: 'returnToHand', target: { t: 'chosen' } }, summon('EDR_523t')), tokens: ['EDR_523t'] });
reg('EDR_523t', { keywords: ['STEALTH'] });
// 暗影斗篷襲擊者：戰吼：若你的手牌中有與對手相同的牌，將對手的那張洗入他的牌堆
reg('EDR_524', { abilities: play(fn('coAssailant')) });
// 帶刺的荊棘：選擇一個 - 本回合獲得劇毒；或獲得「亡語：對所有敵人造成 2 點傷害」
reg('EDR_525', {
  chooseOne: [
    { id: 'EDR_525A', name: '多一雙眼睛', text: '本回合獲得<b>劇毒</b>', abilities: play(fn('coThornPoison')) },
    { id: 'EDR_525B', name: '多一根荊棘', text: '獲得「<b>亡語：</b>對所有敵人造成2點傷害」', abilities: play(fn('coThornDr')) },
  ],
});
// 『腐化者』雷費拉爾：戰吼：把你對手手牌中的 @ 張隨機牌禁錮一個回合（你每打出一次就提高）
reg('EDR_526', { abilities: play(fn('coRenferal')) });
// 阿莎曼：戰吼：用你對手牌堆中牌的複製填滿你的手牌。它們的消耗減少 (3)
reg('EDR_527', { abilities: play(fn('coAshamane')) });
// 夢魘燃料：發現你對手牌堆中一個手下的複製。連擊：帶有黑暗禮物
reg('EDR_528', { abilities: play(fn('coFuel')) });
// 笨拙的小精靈：如果這個手下會變形為手下，改為變成消耗多 (2) 的手下
reg('EDR_529', { flags: ['podling'] });
// 寄生的成長：消滅一個友方手下，獲得 8 點護甲
reg('EDR_531', { target: friendlyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, { e: 'armor', amount: 8 }) });
// 扭曲的織網者：每當你打出一個你已經打出過的手下，抽一張牌
reg('EDR_540', { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [fn('coWebweaver')] }] });
// 不祥的夢魘：選擇一個 - 對所有手下造成 $1 點傷害；或使一個受傷的手下 +2/+2
reg('EDR_570', {
  chooseOne: [
    { id: 'EDR_570A', name: '夢魘爆發', text: '對所有手下造成$1點傷害', abilities: play({ e: 'damage', target: allMinions, amount: 1, spell: true }) },
    { id: 'EDR_570B', name: '不穩定的力量', text: '使一個受傷的手下+2/+2', target: { filter: { type: 'minion', side: 'any', damaged: true } }, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }) },
  ],
});
// 妖精欺詐者：亡語：抽一張消耗 (5) 以上的法術
reg('EDR_571', { abilities: dr({ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL', minCost: 5 } }) });
// 受折磨的夢魘龍：亡語：抽 2 條龍，使它們的消耗減少 (1)
reg('EDR_572', { abilities: dr(fn('coDreadwing')) });
// 過度生長的恐怖：嘲諷。戰吼：使你手牌中帶有黑暗禮物的手下消耗減少 (2)
reg('EDR_654', { keywords: ['TAUNT'], abilities: play(fn('coGiftedCost', { n: 2 })) });
// 血薊幻術師：戰吼：召喚一個此手下的複製。其中一個在受到傷害時會偷偷死亡
reg('EDR_780', { abilities: play(fn('coIllusionist')) });
// 枯萎的先驅：每當這個手下從戰場回到你的手牌，召喚兩個隨機的 2 費手下
reg('EDR_781', { flags: ['harbinger'] });
// 振翅守衛：嘲諷、聖盾。戰吼：灌注你的英雄能力
reg('EDR_800', { keywords: ['TAUNT', 'DIVINE_SHIELD'], abilities: play(imbue()) , tokens: IMBUE_TOKENS });
// 占卜：消滅一個友方精靈來抽 3 張牌
reg('EDR_804', { target: { filter: { type: 'minion', side: 'friendly', nameIncludes: 'Wisp' } }, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, draw(3)) });
// 醜惡的外殼：你的水蛭多偷取 1 點生命值。戰吼：召喚兩隻 0/2 的水蛭
reg('EDR_810', { flags: ['leechBoost'], abilities: play(summon('EDR_810t', 2)), tokens: ['EDR_810t'] });
reg('EDR_810t', { abilities: atEndOfTurn(fn('coLeech')) });
// 暴行儀式：發現一個不死族。花費 2 具屍體使它獲得黑暗禮物
reg('EDR_811', { abilities: play(fn('coRite')) });
// 怪誕符文之刃：戰吼：若你上一張打出的牌有邪咒符文，+1 攻擊力。血魄符文也重複一次（+1 耐久度）
reg('EDR_812', { abilities: play(fn('coRuneblade')) });
// 感染之息：造成 $2 點傷害。召喚一隻 0/2 的水蛭
reg('EDR_814', { target: anyChar, abilities: play(hit(2), summon('EDR_810t')), tokens: ['EDR_810t'] });
// 血腥的感染：抽 2 張牌。召喚兩隻 0/2 的水蛭
reg('EDR_817', { abilities: play(draw(2), summon('EDR_810t', 2)), tokens: ['EDR_810t'] });
// 納薩德拉：嘲諷。亡語：分裂成 1/1 的甲蟲。在你的回合開始時，與剩下的重組
reg('EDR_818', { keywords: ['TAUNT'], abilities: dr(summon('EDR_818t', 7)), tokens: ['EDR_818t'] });
reg('EDR_818t', { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('coBeetles')] }] });
// 飛龍的沉眠：選擇一個 - 召喚兩個休眠的恐懼之籽；或對所有手下造成 $2 點傷害
reg('EDR_820', {
  chooseOne: [
    { id: 'EDR_820a', name: '侵蝕的恐懼', text: '召喚兩個隨機的休眠恐懼之籽', abilities: play(fn('coSeeds', { n: 2 })) },
    { id: 'EDR_820b', name: '甦醒的黑暗', text: '對所有手下造成$2點傷害', abilities: play({ e: 'damage', target: allMinions, amount: 2, spell: true }) },
  ],
  tokens: SEEDS,
});
// 恐懼之籽
reg('EDR_840t', { awaken: [{ e: 'heroAttack', amount: 3 }] });
reg('EDR_840t1', { keywords: ['ELUSIVE'] });
reg('EDR_840t2', { keywords: ['TAUNT', 'LIFESTEAL'] });
// 殘酷收穫：抽一張牌。召喚一個隨機的休眠恐懼之籽
reg('EDR_840', { abilities: play(draw(1), fn('coSeeds', { n: 1 })), tokens: SEEDS });
// 恐懼之魂腐化者：戰吼與亡語：召喚一個隨機的休眠恐懼之籽
reg('EDR_841', { abilities: [...play(fn('coSeeds', { n: 1 })), ...dr(fn('coSeeds', { n: 1 }))], tokens: SEEDS });
// 污穢之矛：在你的英雄攻擊一個敵人後，對另一個隨機敵人造成等同你英雄攻擊力的傷害
reg('EDR_842', { abilities: heroHit([fn('coSpear')]) });
// 納拉雷克斯，群龍之主：你每回合的第一條龍消耗為 (1)
reg('EDR_844', { costAuras: [{ side: 'friendly', type: 'MINION', race: 'DRAGON', firstOfRace: true, set: 1 }] });
// 哈穆爾‧符文圖騰：開局：若你牌堆中每個法術都是自然法術，灌注你的英雄能力。每施放 3 個法術重複一次
reg('EDR_845', { startOfGame: 'hamuul' });
// 沙拉德拉希爾：獲得全部 5 張夢境牌。若你在手牌中持有這張牌時打出了消耗更高的牌，腐化它們！
reg('EDR_846', { handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('coCorruptShal')] }], abilities: play(fn('coShaladrassil')), tokens: [...DREAMS, 'EDR_846t1', 'EDR_846t2', 'EDR_846t3', 'EDR_846t4', 'EDR_846t5'] });
reg('EDR_846t1', { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 5, hp: 5, keywords: ['IMMUNE'], temp: true }) });
reg('EDR_846t2', { target: anyMinion, abilities: play(fn('coShuffleMinion')) });
reg('EDR_846t3', { keywords: ['ELUSIVE'], flags: ['heroElusive'] });
reg('EDR_846t4', { abilities: play({ e: 'damage', target: allEnemies, amount: 5, spell: true }) });
reg('EDR_846t5', {});
// 夢縛信徒：戰吼與亡語：你的下一個英雄能力消耗為 (0)
reg('EDR_847', { abilities: [...play({ e: 'heroPowerDiscount', amount: 10 }), ...dr({ e: 'heroPowerDiscount', amount: 10 })] });
// 夢縛迅猛龍：在你打出一個手下後，使它獲得一個隨機額外效果
reg('EDR_849', { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [fn('coBonus', { target: 'it', n: 1 })] }] });
// 苦花騎士：戰吼：灌注你的英雄能力
reg('EDR_852', { abilities: play(imbue()) , tokens: IMBUE_TOKENS });
// 布洛爾‧熊皮：在你施放一個法術後，召喚一個隨機動物夥伴
reg('EDR_853', { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('coBroll')] }], tokens: ['NEW1_032', 'NEW1_033', 'NEW1_034'] });
// 夢魘之王薩維斯：戰吼：發現你牌堆中的一個手下，使其帶有黑暗禮物
reg('EDR_856', { abilities: play(gift({ filter: 'deck' })) });
// 璀璨的織夢者：生命竊取。戰吼：若你灌注過英雄能力兩次，對一個手下造成 4 點傷害
reg('EDR_860', { keywords: ['LIFESTEAL'], target: optional(anyMinion), abilities: play(cond({ c: 'imbued', n: 2 }, [hit(4, false)])) });
// 平靜的樹人：亡語：雙方玩家各獲得一顆空的法力水晶
reg('EDR_861', { abilities: dr({ e: 'mana', kind: 'empty', amount: 1 }, { e: 'mana', kind: 'empty', amount: 1, who: 'opponent' }) });
// 靈魂採集者：戰吼：獲得一個精靈。灌注你的英雄能力
reg('EDR_871', { abilities: play(addCard('EDR_851t'), imbue()), tokens: IMBUE_TOKENS });
reg('EDR_851t', {});
reg('EDR_847pt2', {});
reg('EDR_445pt3', { castsWhenDrawn: true, abilities: play(fn('coPortal')) });
// 生命火花：選擇一個 - 發現一個法師法術；或發現一個德魯伊法術
reg('EDR_872', {
  chooseOne: [
    { id: 'EDR_872A', name: '火焰之禮', text: '發現一個法師法術', abilities: play({ e: 'discover', pool: { type: 'SPELL', cls: 'MAGE' } }) },
    { id: 'EDR_872B', name: '自然之禮', text: '發現一個德魯伊法術', abilities: play({ e: 'discover', pool: { type: 'SPELL', cls: 'DRUID' } }) },
  ],
});
// 林地使者：戰吼：把你牌堆中所有的中立牌變成隨機德魯伊牌
reg('EDR_873', { abilities: play(fn('coEnvoy')) });
// 星辰平衡：獲得一張月火術與一張星火術，使它們具有法術傷害 +1
reg('EDR_874', { abilities: play(fn('coStellar')) });
// 驚嚇！：發現一個消耗 (5) 以上、帶有黑暗禮物的惡魔，將另外兩個洗入你的牌堆
reg('EDR_882', { abilities: play(gift({ pool: { type: 'MINION', race: 'DEMON', minCost: 5, anyClass: true }, shuffle: true })) });
// 『守望者』瑪洛恩：戰吼：發現一個傳說的野神。若你灌注過英雄能力 4 次，其消耗為 (1)
reg('EDR_888', { abilities: play(fn('coMalorne')) });
// 花瓣商販：在你的回合結束時，使另一個隨機友方龍 +1/+1
reg('EDR_889', { abilities: atEndOfTurn({ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly', race: 'DRAGON', excludeSelf: true }, count: 1 }, atk: 1, hp: 1 }) });
// 夢魘龍人：亡語：使你手牌最右邊的牌消耗減少 (2)
reg('EDR_890', { abilities: dr(fn('coRightmostCost', { n: 2 })) });
// 貪食的惡魔獵犬 / 凶猛的惡魔蝠：亡語：復活一個友方亡語手下並召喚它的複製
reg('EDR_891', { abilities: dr(fn('coFelhunter', { max: 4 })) });
reg('EDR_892', { abilities: dr(fn('coFelhunter', { min: 5, different: true })) });
// 艾維娜，月之選民：戰吼：開始一個三回合的月相週期。當滿月升起時，你的牌本場對戰消耗為 (1)
reg('EDR_895', { abilities: play({ e: 'delayed', turns: 2, effects: [fn('coFullMoon')] }) });
// 歡快的月獸：在你的回合結束時，獲得 @ 點護甲（你控制的精靈會使它提高）
reg('EDR_940', { abilities: atEndOfTurn(fn('coMoonkin')) });
// 星辰衝擊：對一個手下造成 $@ 點傷害（本場對戰每死亡一個友方手下就提高）
reg('EDR_941', { target: anyMinion, abilities: play(fn('coStarsurge')) });
// 卡多雷女祭司：戰吼：使所有敵方手下 -2 攻擊力，直到你的下個回合。灌注你的英雄能力
reg('EDR_970', { abilities: play({ e: 'buff', target: allEnemyMinions, atk: -2, untilNextTurn: true }, imbue()) , tokens: IMBUE_TOKENS });
// 草原行者：嘲諷。亡語：將一個消耗為 (1) 的草原行者放到你牌堆的底部
reg('EDR_978', { keywords: ['TAUNT'], abilities: dr(fn('coStrider')) });
// 遠古的昔日巨獸：休眠 2 個回合。休眠時，在你的回合結束時獲得 3 點護甲並抽一張牌
reg('EDR_979', { abilities: [...whenSummoned(fn('coDormantFor', { turns: 2 })), { on: { k: 'turnEnd', whose: 'mine' }, cond: { c: 'selfDormant' }, effects: [{ e: 'armor', amount: 3 }, draw(1)] }] });

// ============================================================== 第三批：FIR
const smoldering = { dyn: 'handCounter' as const, base: 1 };
// 卡多雷之魂：嘲諷、生命竊取。戰吼：若你本回合使用過英雄能力，獲得 +3/+3
reg('FIR_777', { keywords: ['TAUNT', 'LIFESTEAL'], abilities: play(cond({ c: 'heroPowerUsed' }, [selfBuff(3, 3)])) });
// 火葬：發現一個帶有黑暗禮物的手下，它的消耗減少 (2)
reg('FIR_900', { abilities: play(gift({ pool: { type: 'MINION', anyClass: true }, reduce: 2 })) });
// 霜燃女族長：戰吼：若你手牌中有帶有黑暗禮物的手下，召喚兩條具有嘲諷的 4/4 龍
reg('FIR_901', { abilities: play(cond({ c: 'holdingGift' }, [summon('FIR_901t', 2)])), tokens: ['FIR_901t'] });
reg('FIR_901t', { keywords: ['TAUNT'] });
// 餘燼印記：在你的下個回合開始時，對所有敵人造成 $6 點傷害（隨機分散）
reg('FIR_902', { abilities: play({ e: 'delayed', turns: 1, effects: [{ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 6, spell: true }] }) });
// 邪火烈焰：在你施放一個邪能法術後，消滅此手下並對所有敵人造成 2 點傷害
reg('FIR_904', { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FEL' }, effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 2 }, { e: 'destroy', target: { t: 'self' } }] }] });
// 過熱：使你的手下 +1/+1。隨機棄掉一個自然法術，使它們再 +1/+1
reg('FIR_906', { abilities: play(fn('coOverheat')) });
// 燒焦的變色龍：戰吼：若你本回合使用過英雄能力，使一個友方手下 +1/+2 並獲得突襲
reg('FIR_908', { target: optional(friendlyMinion), abilities: play(cond({ c: 'heroPowerUsed' }, [{ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 2, keywords: ['RUSH'] }])) });
// 灼熱的風：造成 $3 點傷害。隨機棄掉一個火焰法術，再造成 $3 點傷害
reg('FIR_910', { target: anyChar, abilities: play(fn('coScorching')) });
// 悶燃林地 / 悶燃力量 / 悶燃攀升：每個回合升級，持有一定回合後棄掉
reg('FIR_911', { immolate: 3, abilities: play({ e: 'draw', count: smoldering, who: 'self' }) });
reg('FIR_914', { immolate: 3, target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: smoldering, hp: smoldering }) });
reg('FIR_916', { immolate: 3, abilities: play({ e: 'damage', target: allEnemyMinions, amount: smoldering, spell: true }) });
// 煉獄先驅：在你施放一個火焰法術後，獲得一個隨機元素，使其消耗減少 (3)
reg('FIR_913', { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FIRE' }, effects: [fn('coInferno')] }] });
// 新月之光：使一個手下 +3/+3。（施放 3 個法術，使這張牌在打出時回到你的手牌）
reg('FIR_918', { target: anyMinion, transformAfterSpells: { n: 3, into: 'FIR_918t' }, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }), tokens: ['FIR_918t'] });
reg('FIR_918t', { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }, addCard('FIR_918')) });
// 不滅鳳凰：你本回合每打出一張牌，消耗減少 (1)。亡語：在回合結束時，獲得另一隻鳳凰
reg('FIR_919', { costRule: { per: 'cardsPlayedThisTurn', amount: 1 }, abilities: dr(fn('coPhoenix')) });
// 煙霧彈：發現一個連擊、戰吼或潛行的手下，帶有黑暗禮物
reg('FIR_920', { abilities: play(gift({ pool: { type: 'MINION', anyClass: true }, filter: 'comboBcStealth' })) });
// 花瓣採集者：戰吼：若你灌注過英雄能力兩次，抽 2 張牌
reg('FIR_921', { abilities: play(cond({ c: 'imbued', n: 2 }, [draw(2)])) });
// 燼劍：戰吼：若你手牌中有帶有黑暗禮物的手下，+3 攻擊力
reg('FIR_922', { abilities: play(cond({ c: 'holdingGift' }, [{ e: 'weaponBuff', atk: 3 }])) });
// 祝融之火：隨機對一個敵方手下造成 $4 點傷害。若你的手牌中有消耗 (8) 以上的牌，改為 $8 點
reg('FIR_923', {
  abilities: play(cond({ c: 'handHasCostAtLeast', n: 8 }, [{ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 }, amount: 8, spell: true }], [{ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 }, amount: 4, spell: true }])),
});
// 暗影烈焰潛行者：戰吼：發現一個帶有黑暗禮物的惡魔，獲得它的一張複製
reg('FIR_924', { abilities: play(gift({ pool: { type: 'MINION', race: 'DEMON', anyClass: true }, copy: true })) });
// 灼傷的雛龍：戰吼：發現一張 5 費的牌。下個回合獲得 1 顆法力水晶（僅限下個回合）
reg('FIR_927', { abilities: play(fn('coDiscoverSet', { pool: { cost: 5, anyClass: true } }), { e: 'delayed', turns: 1, effects: [{ e: 'mana', kind: 'temp', amount: 1 }] }) });
// 烈焰守護者：戰吼：使你手牌中的所有手下 +3/+3。它們會在 3 個回合後被摧毀
reg('FIR_928', { abilities: play(fn('coKeeper')) });
// 暗影烈焰灌注：造成 $2 點傷害。發現一個帶有黑暗禮物的戰士手下
reg('FIR_939', { target: anyChar, abilities: play(hit(2), gift({ pool: { type: 'MINION', cls: 'WARRIOR' } })) });
// 札卡利火焰法師：戰吼：若你手牌中的牌消耗各不相同，使它們的消耗減少 (2)
reg('FIR_940', { abilities: play(cond({ c: 'handAllDifferentCosts' }, [fn('coHandCostAll', { n: 2 })])) });
// 灼熱的映像：抽一個手下。召喚一個它的 8/8、具有聖盾的複製
reg('FIR_941', { abilities: play(fn('coReflection')) });
// 灼燒掠奪者：戰吼：發現一個邪能法術。使你手牌中的邪能法術消耗減少 (1)
reg('FIR_952', { abilities: play(fn('coDiscoverSet', { pool: { type: 'SPELL', spellSchool: 'FEL' } }), fn('coFelCost')) });
// 熔岩獵犬：突襲。在此手下攻擊一個手下並存活後，將此手下的攻擊力化為傷害，分散打在所有敵人身上
reg('FIR_953', { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('coMagmaHound')] }] });
// 燃燒：對一個手下造成 $5 點傷害。它的擁有者抽一張牌
reg('FIR_954', { target: anyMinion, abilities: play(fn('coConflagrate')) });
// 龍龜：戰吼：若你手牌中有帶有黑暗禮物的手下，本回合使你的英雄 +3 攻擊力並獲得 6 點護甲
reg('FIR_956', { abilities: play(cond({ c: 'holdingGift' }, [{ e: 'heroAttack', amount: 3 }, { e: 'armor', amount: 6 }])) });
// 迅捷的丁達爾：亡語：對所有敵人造成 1 點傷害。若是你對手的回合，改為 4 點
reg('FIR_958', { abilities: dr(cond({ c: 'opponentTurn' }, [{ e: 'damage', target: allEnemies, amount: 4 }], [{ e: 'damage', target: allEnemies, amount: 1 }])) });
// 炎魔，熾烈之火：免疫火焰法術。戰吼：對隨機敵人施放總共 15 點法力的火焰法術
reg('FIR_959', { flags: ['fireImmune'], abilities: play(fn('coFyrakk')) });
// 照料幼龍的龍人：戰吼：複製你手牌中消耗最低的野獸
reg('FIR_960', { abilities: play(fn('coDragonkin')) });
// 灰葉小精靈：戰吼：若你手牌中有消耗 (5) 以上的法術，獲得聖盾與生命竊取
reg('FIR_961', { abilities: play(cond({ c: 'holding', type: 'SPELL', minCost: 5 }, [selfBuff(0, 0, ['DIVINE_SHIELD', 'LIFESTEAL'])])) });
