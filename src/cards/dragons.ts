// ============================================================================
// 巨龍降臨（Descent of Dragons，DRG_，系列 1347）剩下的卡：祈求葛拉克朗、支線任務、吐息……
// 解析器看不懂的卡在這裡手動定義；自訂效果（dg 開頭）在 game.ts 的 customDragons。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, HeroPowerSpec, Trig, TargetReq } from '../engine/types';
import { LACKEYS } from './lists';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const lackey = (): Effect => fn('addOneOf', { cards: LACKEYS });
const invoke = (times = 1): Effect => fn('dgInvoke', { times });
const holdingDragon: Condition = { c: 'holding', race: 'DRAGON' };
const invokedTwice: Condition = { c: 'invoked', n: 2 };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const allFriendlyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
/**
 * 支線任務：打出後掛在你身上，達成目標時執行獎勵（可以同時進行好幾個）
 * on：要累計的事件；amount：每次累計多少（預設 1，itCost = 打出的卡的消耗）
 */
const sidequest = (goal: number, on: Trig, reward: Effect[], extra: { cond?: Condition; amount?: 'itCost'; kind?: 'noDamage' | 'elementalStreak' } = {}): Override => ({
  abilities: play(fn('dgSidequest', { goal, on, reward, ...extra })),
});

/** 葛拉克朗：基本形態 → 末日災龍（祈求 2 次）→ 滅世妖龍（祈求 4 次） */
const CLAW = 'DRG_238ht';
const galakrond = (battlecry: Effect[], heroPower: HeroPowerSpec, tokens: string[] = [], claw = false): Override => ({
  abilities: play(...battlecry, ...(claw ? [{ e: 'equip', card: CLAW } as Effect] : [])),
  heroPower,
  tokens: claw ? [...tokens, CLAW] : tokens,
});
/** 基本形態：升級後的兩種形態也一起收錄 */
const base = (id: string, o: Override): Override => ({ ...o, tokens: [...(o.tokens ?? []), `${id}t2`, `${id}t3`] });
const imps: HeroPowerSpec = { effects: [summon('DRG_238t12t2', 2)], needsBoardSpace: true };
const guile: HeroPowerSpec = { effects: [lackey()] };
const fury: HeroPowerSpec = { effects: [summon('DRG_238t14t3')], needsBoardSpace: true };
const might: HeroPowerSpec = { effects: [{ e: 'heroAttack', amount: 3 }] };
const wit: HeroPowerSpec = { effects: [{ e: 'addRandom', pool: { type: 'MINION', cls: 'PRIEST' }, count: 1, who: 'self' }] };
const demons = (n: number): Effect => ({ e: 'summonRandom', pool: { type: 'MINION', race: 'DEMON' }, count: n, who: 'self' });
const destroyRandom = (n: number): Effect => ({ e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: n } });

export const DRAGONS_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 葛拉克朗的升級形態
  DRG_600: base('DRG_600', galakrond([demons(1)], imps, ['DRG_238t12t2'])),
  DRG_600t2: galakrond([demons(2)], imps, ['DRG_238t12t2']),
  DRG_600t3: galakrond([demons(4)], imps, ['DRG_238t12t2'], true),
  DRG_610: base('DRG_610', galakrond([fn('dgGalakrondDraw', { n: 1 })], guile, LACKEYS)),
  DRG_610t2: galakrond([fn('dgGalakrondDraw', { n: 2 })], guile, LACKEYS),
  DRG_610t3: galakrond([fn('dgGalakrondDraw', { n: 4 })], guile, LACKEYS, true),
  DRG_620: base('DRG_620', galakrond([summon('DRG_620t4', 2)], fury, ['DRG_620t4', 'DRG_238t14t3'])),
  DRG_620t2: galakrond([summon('DRG_620t5', 2)], fury, ['DRG_620t5', 'DRG_238t14t3']),
  DRG_620t3: galakrond([summon('DRG_620t6', 2)], fury, ['DRG_620t6', 'DRG_238t14t3'], true),
  DRG_650: base('DRG_650', galakrond([fn('dgGalakrondDraw', { n: 1, minions: true })], might)),
  DRG_650t2: galakrond([fn('dgGalakrondDraw', { n: 2, minions: true })], might),
  DRG_650t3: galakrond([fn('dgGalakrondDraw', { n: 4, minions: true })], might, [], true),
  DRG_660: base('DRG_660', galakrond([destroyRandom(1)], wit)),
  DRG_660t2: galakrond([destroyRandom(2)], wit),
  DRG_660t3: galakrond([destroyRandom(4)], wit, [], true),
  // ---------------------------------------------------------------- 中立
  // 美味的飛魚：亡語：使你手牌中一張龍獲得 +2/+2
  DRG_049: { abilities: dr({ e: 'handBuff', atk: 2, hp: 2, scope: 'random', race: 'DRAGON' }) },
  // 虔誠的瘋狂信徒：突襲。戰吼：祈求葛拉克朗
  DRG_050: { keywords: ['RUSH'], abilities: play(invoke()) },
  // 寶藏盜掠者：戰吼：裝備一把你被摧毀過的武器
  DRG_055: { abilities: play(fn('dgPillager')) },
  // 盜匪傘兵：在你打出一個海盜後，從你的手牌召喚此手下
  DRG_056: { handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION', race: 'PIRATE' }, effects: [fn('dgSummonFromHandSelf')] }] },
  // 飛翼指揮官：你手牌中每有一張龍，+2 攻擊力
  DRG_058: { atkPer: { dyn: 'dragonsInHand', mult: 2 } },
  // 火鷹：戰吼：你對手的手牌每有一張，獲得 +1 攻擊力
  DRG_060: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'oppHandSize' } }) },
  // 龍眠淨化者：戰吼：把你牌堆中所有中立卡變形成你職業的隨機卡
  DRG_062: { abilities: play(fn('dgPurifier')) },
  // 龍喉盜獵者：戰吼：若你的對手控制一條龍，獲得 +4/+4 與突襲
  DRG_063: { abilities: play(cond({ c: 'control', race: 'DRAGON', side: 'enemy' }, [{ e: 'buff', target: { t: 'self' }, atk: 4, hp: 4, keywords: ['RUSH'] }])) },
  // 活化的龍息：你的手下無法被凍結
  DRG_068: { flags: ['noFreeze'] },
  // 破鎧者：戰吼：摧毀你對手的護甲值
  DRG_069: { abilities: play(fn('dgPlatebreaker')) },
  // 惡運信天翁：亡語：把兩張 1/1 的信天翁洗入你對手的牌堆
  DRG_071: { abilities: dr({ e: 'shuffle', card: 'DRG_071t', count: 2, who: 'opponent' }), tokens: ['DRG_071t'] },
  // 鈷藍龍人法師：戰吼：把兩張你職業的 1 費法術加入你的手牌
  DRG_075: { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', cost: 1, cls: 'own' }, count: 2, who: 'self' }) },
  // 無面腐化者：突襲。戰吼：把你的一個手下變形成此手下的複製
  DRG_076: { keywords: ['RUSH'], target: { filter: { type: 'minion', side: 'friendly', excludeSelf: true }, optional: true }, abilities: play(fn('flBouncer')) },
  // 俄特加德爪鉤射手：戰吼：雙方各抽一張牌。若是龍，召喚它
  DRG_077: { abilities: play(fn('dgGrapplesniper')) },
  // 狗頭人扒手：戰吼：偷取你對手的武器
  DRG_082: { abilities: play(fn('dgStealWeapon')) },
  // 觸手惡徒：戰吼：雙方各抽一張牌。交換它們的消耗
  DRG_084: { abilities: play(fn('dgTentacledMenace')) },
  // 炫彩龍蛋：戰吼：秘密發現一條要孵化的龍。亡語：孵化！
  DRG_086: { abilities: [...play(fn('dgEggChoose')), ...dr(fn('dgEggHatch'))] },
  // 恐懼烏鴉：你每控制一個其他的恐懼烏鴉，+3 攻擊力
  DRG_088: { atkPer: { dyn: 'otherSameName', mult: 3 } },
  // 『龍后』雅立史卓莎：戰吼：若你的牌堆沒有重複的卡，把 2 張其他的隨機龍加入你的手牌，它們的消耗為 (0)
  DRG_089: { abilities: play(cond({ c: 'noDuplicates' }, [fn('dgAlexstrasza')])) },
  // 鬚瑪：在你的回合結束時，用 1/1 的觸手填滿你的戰場
  DRG_091: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('dgFillBoard', { card: 'DRG_091t' })] }], tokens: ['DRG_091t'] },
  // 塑形師：每當你抽一張牌，把它變形成一個隨機傳說手下
  DRG_092: { abilities: [{ on: { k: 'draw', side: 'friendly' }, effects: [fn('dgTransmogrify')] }] },
  // 克隆克斯‧龍蹄：戰吼：抽出葛拉克朗。若你已經是葛拉克朗，釋放一道災厄
  DRG_099: { abilities: play(fn('dgKronx')), tokens: ['DRG_099t1', 'DRG_099t2', 'DRG_099t3', 'DRG_099t4'] },
  DRG_099t1: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 5 }, { e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 5 }) },
  DRG_099t2: { abilities: play(summon('DRG_099t2t')), tokens: ['DRG_099t2t'] },
  DRG_099t3: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, atk: 2, hp: 2 }) },
  DRG_099t4: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, amount: 5 }) },
  // 葛拉克朗之盾：嘲諷。戰吼：祈求葛拉克朗
  DRG_242: { keywords: ['TAUNT'], abilities: play(invoke()) },
  // 老邁巫師：戰吼：與你的對手交換英雄能力，直到你的下個回合
  DRG_401: { abilities: play(fn('dgSwapPowers'), { e: 'delayed', turns: 1, effects: [fn('dgSwapPowers')] }) },
  // 薩索瓦爾：戰吼：選擇一個友方手下。把它的複製加入你的手牌、牌堆與戰場
  DRG_402: { target: { filter: { type: 'minion', side: 'friendly', excludeSelf: true }, optional: true }, abilities: play(fn('dgSathrovarr')) },
  // ---------------------------------------------------------------- 德魯伊
  // 人多樹眾：支線任務：花費 10 點法力在手下上。獎勵：從你的牌堆召喚一個手下
  DRG_051: sidequest(10, { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, [{ e: 'recruit', count: 1 }], { amount: 'itCost' }),
  // 空種補給：抽 2 張牌。你每控制一個樹人，消耗減少 (2)
  DRG_314: { costRule: { per: 'treantsOnBoard', amount: 2 }, abilities: play(draw(2)) },
  // 變大化：使你牌堆中所有手下獲得 +2/+2，它們的消耗增加 (1)（最多到 10）
  DRG_315: { abilities: play(fn('dgEmbiggen')) },
  // 守住甲板：支線任務：用你的英雄攻擊兩次。獎勵：把 3 張爪擊加入你的手牌
  DRG_317: sidequest(2, { k: 'attack', subject: 'friendlyHero' }, [{ e: 'addCard', card: 'CS2_005', count: 3, who: 'self' }]),
  // 『力量之樹』格魯：嘲諷。戰吼：本場對戰中，你的樹人 +1/+1
  DRG_319: { keywords: ['TAUNT'], abilities: play(fn('dgGoru')) },
  // 『破夢者』伊瑟拉：戰吼：把 7 張夢境之門洗入你的牌堆。抽到時召喚一條隨機的龍
  DRG_320: { abilities: play({ e: 'shuffle', card: 'DRG_320t', count: 7 }), tokens: ['DRG_320t'] },
  DRG_320t: { castsWhenDrawn: true, abilities: play({ e: 'summonRandom', pool: { type: 'MINION', race: 'DRAGON', anyClass: true }, count: 1, who: 'self' }) },
  // ---------------------------------------------------------------- 獵人
  // 腐蝕吐息：對一個手下造成 3 點傷害。若你的手牌中有龍，也擊中敵方英雄
  DRG_006: { target: anyMinion, abilities: play(hit(3), cond(holdingDragon, [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 3, spell: true }])) },
  // 風暴戰錘：在你控制一條龍時不會失去耐久度
  DRG_007: { flags: ['stormhammer'] },
  // 掃除障礙：支線任務：召喚 3 個突襲手下。獎勵：召喚一個有突襲的 4/4 獅鷲獸
  DRG_251: { ...sidequest(3, { k: 'summon', side: 'friendly' }, [summon('DRG_251t')], { cond: { c: 'itKeyword', k: 'RUSH' } }), tokens: ['DRG_251t'] },
  // 相位潛獵者：在你使用英雄能力後，從你的牌堆施放一個奧秘
  DRG_252: { abilities: [{ on: { k: 'heroPower', side: 'friendly' }, effects: [fn('coCastDeckSecret')] }] },
  // 矮人狙擊手：你的英雄能力可以指定手下為目標
  DRG_253: { flags: ['heroPowerTargetMinions'] },
  // 麻瘋援軍：支線任務：使用 3 次英雄能力。獎勵：召喚三個 2/1 的麻瘋地精
  DRG_255: { ...sidequest(3, { k: 'heroPower', side: 'friendly' }, [summon('DRG_255t2', 3)]), tokens: ['DRG_255t2'] },
  // ---------------------------------------------------------------- 法師
  // 泫瓦拉：在你一個回合中施放三張法術後，召喚一個 5/5 的元素
  DRG_104: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, cond: { c: 'spellsThisTurn', n: 3 }, effects: [summon('DRG_104t2')] }], tokens: ['DRG_104t2'] },
  // 法力巨人：本場對戰中你每打出一張不是一開始就在牌堆中的卡，消耗減少 (1)
  DRG_109: { costRule: { per: 'nonStartingPlayed', amount: 1 } },
  // 『魔法之王』瑪里苟斯：戰吼：若你的手牌中有龍，發現一張升級的法師法術
  DRG_270: {
    abilities: play(cond(holdingDragon, [fn('discoverList', { cards: ['DRG_270t1', 'DRG_270t11', 'DRG_270t2', 'DRG_270t4', 'DRG_270t5', 'DRG_270t6', 'DRG_270t7', 'DRG_270t8', 'DRG_270t9'] })])),
    tokens: ['DRG_270t1', 'DRG_270t11', 'DRG_270t2', 'DRG_270t4', 'DRG_270t5', 'DRG_270t6', 'DRG_270t7', 'DRG_270t8', 'DRG_270t9'],
  },
  DRG_270t6: { target: anyMinion, abilities: play({ e: 'transform', target: { t: 'chosen' }, card: 'DRG_270t6t' }), tokens: ['DRG_270t6t'] },
  // 滾動的火球：對一個手下造成 8 點傷害。多餘的傷害會繼續往左或往右滾
  DRG_321: { target: anyMinion, abilities: play(fn('dgRollingFireball')) },
  // 龍騎法師：戰吼：若你的手牌中有龍，本回合你的下一張法術消耗為 (0)
  DRG_322: { abilities: play(cond(holdingDragon, [{ e: 'pendingDiscount', d: { type: 'SPELL', set: 0, thisTurn: true } }])) },
  // 學習龍語：支線任務：在法術上花費 8 點法力。獎勵：召喚一條 6/6 的龍
  DRG_323: { ...sidequest(8, { k: 'cardPlayed', side: 'friendly', cardType: 'SPELL' }, [summon('DRG_323t')], { amount: 'itCost' }), tokens: ['DRG_323t'] },
  // 元素盟友：支線任務：連續 2 個回合打出元素。獎勵：從你的牌堆抽 3 張法術
  DRG_324: sidequest(2, { k: 'turnEnd', whose: 'mine' }, [{ e: 'draw', count: 3, who: 'self', pool: { type: 'SPELL' } }], { kind: 'elementalStreak' }),
  // ---------------------------------------------------------------- 聖騎士
  // 義不容辭：支線任務：召喚 5 個手下。獎勵：使你的手下獲得 +1/+1
  DRG_008: sidequest(5, { k: 'summon', side: 'friendly' }, [{ e: 'buff', target: allFriendlyMinions, atk: 1, hp: 1 }]),
  // 光鑄十字軍：戰吼：若你的牌堆沒有中立卡，把 5 張隨機聖騎士卡加入你的手牌
  DRG_231: { abilities: play(cond({ c: 'deckNoNeutral' }, [{ e: 'addRandom', pool: { cls: 'PALADIN' }, count: 5, who: 'self' }])) },
  // 光鑄狂熱者：戰吼：若你的牌堆沒有中立卡，裝備一把 4/2 的真銀勇士劍
  DRG_232: { abilities: play(cond({ c: 'deckNoNeutral' }, [{ e: 'equip', card: 'DRG_232t' }])), tokens: ['DRG_232t'] },
  DRG_232t: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero' }, effects: [{ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 3 }] }] },
  // 砂之吐息：賦予一個手下 +1/+2。若你的手牌中有龍，使它獲得聖盾
  DRG_233: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 2 }, cond(holdingDragon, [{ e: 'buff', target: { t: 'chosen' }, keywords: ['DIVINE_SHIELD'] }])) },
  // 龍騎士托莉莎：亡語：使你手牌中一張龍獲得 +3/+3 與此亡語
  DRG_235: { abilities: dr(fn('dgTalritha')) },
  // 庇護：支線任務：一個回合都不受到傷害。獎勵：召喚一個有嘲諷的 3/6 手下
  DRG_258: { ...sidequest(1, { k: 'turnStart', whose: 'mine' }, [summon('DRG_258t')], { kind: 'noDamage' }), tokens: ['DRG_258t'] },
  // 『永恆之王』諾茲多姆：戰吼：把每位玩家的法力水晶變成 10 個
  DRG_309: { abilities: play(fn('dgNozdormu')) },
  // ---------------------------------------------------------------- 牧師
  // 時光撕裂：消滅一個手下。祈求葛拉克朗
  DRG_246: { target: anyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, invoke()) },
  // 命運編結者：戰吼：若你祈求過兩次，使你手牌中的卡消耗減少 (1)
  DRG_300: { abilities: play(cond(invokedTwice, [fn('dgHandDiscount', { amount: 1 })])) },
  // 邪惡低語：把一張幫眾加入你的手牌
  DRG_301: { abilities: play(lackey()), tokens: LACKEYS },
  // 亡墓符文：賦予一個手下「亡語：召喚 2 個此手下的複製」
  DRG_302: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr(fn('cxResummon'), fn('cxResummon')) }) },
  // 葛拉克朗的信徒：戰吼：祈求葛拉克朗
  DRG_303: { abilities: play(invoke()) },
  // 拉祖爾的特使：戰吼：看 3 張卡。猜中哪一張在你對手的手牌中，就獲得它的複製
  DRG_306: { abilities: play(fn('dgEnvoy')) },
  // 永恆吐息：對所有手下造成 2 點傷害。若你的手牌中有龍，只傷害敵人
  DRG_307: { abilities: play(cond(holdingDragon, [{ e: 'damage', target: allEnemyMinions, amount: 2, spell: true }], [{ e: 'damage', target: allMinions, amount: 2, spell: true }])) },
  // 笞靈者卡哈杰：戰吼：選擇一個敵方手下。亡語：召喚一個它的全新複製
  DRG_308: { target: optional(enemyMinion), abilities: [...play(fn('dgRemember')), ...dr(fn('dgSummonRemembered'))] },
  // ---------------------------------------------------------------- 盜賊
  // 幽影潛藏者：戰吼：若你祈求過兩次，把 3 張幸運幣加入你的手牌
  DRG_027: { abilities: play(cond(invokedTwice, [{ e: 'addCard', card: 'GAME_005', count: 3, who: 'self' }])) },
  // 巨龍的財寶：發現一個另一個職業的傳說手下
  DRG_028: { abilities: play({ e: 'discover', pool: { type: 'MINION', rarity: 'LEGENDARY', otherClass: true } }) },
  // 讚美葛拉克朗！：賦予一個手下 +1 攻擊力。祈求葛拉克朗
  DRG_030: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1 }, invoke()) },
  // 死金藥劑師：連擊：從你的牌堆抽一個亡語手下，並獲得它的亡語
  DRG_031: { abilities: play(cond({ c: 'combo' }, [fn('coWhomper')])) },
  // 燭火吐息：抽 3 張牌。在你的手牌中有龍時，消耗減少 (3)
  DRG_033: { costIf: { cond: holdingDragon, cost: 3 }, abilities: play(draw(3)) },
  // 偷渡客：戰吼：若你的牌堆中有不是一開始就在裡面的卡，抽其中 2 張
  DRG_034: { abilities: play(fn('dgStowaway')) },
  // 瓦蠟雷德：亡語：把一根蠟燭洗入你的牌堆，抽到時重新召喚瓦蠟雷德
  DRG_036: { abilities: dr({ e: 'shuffle', card: 'DRG_036t', count: 1 }), tokens: ['DRG_036t'] },
  DRG_036t: { castsWhenDrawn: true, abilities: play(summon('DRG_036')) },
  // 封印命運：對一個未受傷的角色造成 3 點傷害。祈求葛拉克朗
  DRG_247: { target: { filter: { type: 'character', side: 'any', undamaged: true } }, abilities: play(hit(3), invoke()) },
  // ---------------------------------------------------------------- 薩滿
  // 潘達斯莫許：每個回合在你的手牌中時，變形成一個隨機傳說手下的 5/5 複製
  DRG_096: {},
  // 騰風元素：在你有被超載的法力水晶時 +1 攻擊力
  DRG_216: { atkIf: { cond: { c: 'overloaded' }, atk: 1 } },
  // 龍蟠狼踞：召喚兩隻有嘲諷的 2/3 幽靈狼。若你祈求過兩次，使它們獲得 +3/+3
  DRG_217: { abilities: play(fn('dgDragonsPack')), tokens: ['DRG_217t'] },
  // 墮落的元素師：戰吼：祈求葛拉克朗兩次
  DRG_218: { abilities: play(invoke(2)) },
  // 閃電吐息：對一個手下造成 4 點傷害。若你的手牌中有龍，也傷害它相鄰的手下
  DRG_219: { target: anyMinion, abilities: play(hit(4), cond(holdingDragon, [{ e: 'damage', target: { t: 'adjacent', of: 'chosen' }, amount: 4, spell: true }])) },
  // 雷雨至尊：戰吼：若你有被超載的法力水晶，造成 5 點傷害
  DRG_223: { target: { ...anyChar, optional: true, when: { c: 'overloaded' } }, abilities: play(cond({ c: 'overloaded' }, [hit(5, false)])) },
  // 尼索格：戰吼：召喚兩個 0/3 的蛋。它們會在下個回合孵化成有突襲的 4/4 飛龍
  DRG_224: { abilities: play(summon('DRG_224t', 2)), tokens: ['DRG_224t'] },
  DRG_224t: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('dgTransformSelf', { into: 'DRG_224t2' })] }], tokens: ['DRG_224t2'] },
  // 冰霜祝禱：凍結一個敵人。祈求葛拉克朗
  DRG_248: { target: { filter: { type: 'character', side: 'enemy' } }, abilities: play({ e: 'freeze', target: { t: 'chosen' } }, invoke()) },
  // ---------------------------------------------------------------- 術士
  // 龍骨荒野教徒：戰吼：祈求葛拉克朗。你每控制一個其他友方手下，獲得 +1 攻擊力
  DRG_202: { abilities: play(invoke(), { e: 'buff', target: { t: 'self' }, atk: { dyn: 'otherFriendlyMinions' } }) },
  // 魔影信奉者：戰吼：若你祈求過兩次，抽 3 張牌
  DRG_203: { abilities: play(cond(invokedTwice, [draw(3)])) },
  // 暗影天穹：對一個隨機手下造成 1 點傷害。你的手牌每有一張，就重複一次
  DRG_204: {
    abilities: play({ e: 'repeat', times: { dyn: 'handSize', base: 1 }, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'any' }, count: 1 }, amount: 1, spell: true }] }),
  },
  // 虛空吐息：造成 2 點傷害。若你的手牌中有龍，改為造成 4 點有生命竊取的傷害
  DRG_205: { target: anyChar, abilities: play(cond(holdingDragon, [fn('dgLifestealHit', { amount: 4 })], [hit(2)])) },
  // 冥淵火召喚者：戰吼：召喚一個有嘲諷、屬性值等同你手牌張數的惡魔
  DRG_207: { abilities: play(fn('dgAbyssal')), tokens: ['DRG_207t'] },
  // 維迪斯‧嗜魔者：戰吼：你的手牌上限增加到 12。抽 4 張牌
  DRG_208: { abilities: play(fn('dgHandCap', { cap: 12 }), draw(4)) },
  // 魔化儀式：祈求葛拉克朗。使你的手下獲得 +1 攻擊力
  DRG_250: { abilities: play(invoke(), { e: 'buff', target: allFriendlyMinions, atk: 1 }) },
  // ---------------------------------------------------------------- 戰士
  // 破滅之裔：突襲。戰吼：若你祈求過兩次，召喚 2 個此手下的複製
  DRG_019: { keywords: ['RUSH'], abilities: play(cond(invokedTwice, [{ e: 'summonCopy', target: { t: 'self' }, count: 2 }])) },
  // 邪惡陣線軍需官：戰吼：把一張幫眾加入你的手牌。獲得 3 點護甲值
  DRG_020: { abilities: play(lackey(), { e: 'armor', amount: 3 }), tokens: LACKEYS },
  // 祭儀斧：戰吼：祈求葛拉克朗
  DRG_021: { abilities: play(invoke()) },
  // 高速衝撞：迫使一個手下攻擊它相鄰的一個手下
  DRG_022: { target: anyMinion, abilities: play(fn('dgRammingSpeed')) },
  // 甦醒！：祈求葛拉克朗。對所有手下造成 1 點傷害
  DRG_249: { abilities: play(invoke(), { e: 'damage', target: allMinions, amount: 1, spell: true }) },
  // 菲莉茲‧爐巢：戰吼：使你牌堆中的龍消耗減少 (2)
  DRG_257: { abilities: play(fn('aoDeckDiscount', { race: 'DRAGON', amount: 2 })) },
};
