// ============================================================================
// 黑暗帝國霸業（Reign of the Black Empire，BE_，系列 1994）：組裝、古神、克蘇恩技能、儀式、幼蟲……
// 解析器看不懂的卡在這裡手動定義；自訂效果（be 開頭）在 game.ts 的 customBlackEmpire。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const afterHeroAttack = (...effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
/** 組裝（篩選條件見 game.ts 的 beAssemble） */
const assemble = (args: Record<string, unknown> = {}): Effect => fn('beAssemble', args);
/** 選擇一個克蘇恩技能觸發 */
const cthunAbility = (count = 1): Effect => fn('beCthunChoose', { count });
/** 儀式：在 n 個回合後觸發（完成後記錄，克希斯會檢查） */
const ritual = (turns: number, ...effects: Effect[]): Ability[] => play({ e: 'delayed', turns, effects: [...effects, fn('beRitualDone')] });
const CTHUN = ['BE_013t1', 'BE_013t2', 'BE_013t6', 'BE_013t4'];
const LARVAE = ['BE_720t1', 'BE_720t2', 'BE_720t3', 'BE_720t4', 'BE_720t5', 'BE_720t6', 'BE_720t7', 'BE_720t8', 'BE_720t9', 'BE_720t10', 'BE_720t11'];
const larva = (count: number): Effect => fn('beLarva', { count });
const combo = (...effects: Effect[]): Effect => cond({ c: 'combo' }, effects);
const FETID = ['BE_781t1', 'BE_781t2', 'BE_781t3', 'BE_781t4', 'BE_781t5', 'BE_781t6', 'BE_781t7', 'BE_781t8', 'BE_781t9', 'BE_781t10', 'BE_781t11', 'BE_781t12', 'BE_781t13', 'BE_781t14', 'BE_781t15', 'BE_781t16', 'BE_781t17', 'BE_781t18', 'BE_781t19'];
/** 惡臭吞噬者：依符文數量的戰吼（血魄 = 消滅敵方手下；冰霜 = 抽牌並減少 (3)；穢邪 = 召喚兩個隨機手下） */
const fetid = (blood: number, frost: number, unholy: number): Override => ({ abilities: play(fn('beFetid', { blood, frost, unholy })) });

export const BLACK_EMPIRE_OVERRIDES: Record<string, Override> = {
  // ================================================================ 古神
  // 主宰者尤格薩倫：古神。戰吼：結束你的回合，尤格薩倫為你額外進行一個回合（每場對戰一次）
  BE_009: { oldGod: true, titan: ['BE_009t1', 'BE_009t2', 'BE_009t3', 'BE_009t4'], abilities: play(fn('beYogg')) },
  BE_009t1: { abilities: play(fn('beYoggBrain')) },
  BE_009t2: { target: anyChar, abilities: play(hit(10, false)) },
  BE_009t3: { abilities: play(fn('beYoggAscent')) },
  BE_009t4: { abilities: play({ e: 'draw', count: 5, who: 'self', pool: { type: 'SPELL' } }) },
  // 『帝國之眼』克蘇恩：古神。若你本場對戰中觸發過克蘇恩的全部 4 個技能，此手下的技能效果變成三倍
  BE_013: { oldGod: true, titan: ['BE_013t1', 'BE_013t2', 'BE_013t3', 'BE_013t4'], abilities: [{ on: { k: 'summoned' }, effects: [fn('beCthunTriple')] }], tokens: ['BE_013t5', 'BE_013t6'] },
  BE_013t1: { abilities: play(fn('beCthunAbility', { kind: 'wrath' })) },
  BE_013t2: { abilities: play(fn('beCthunAbility', { kind: 'domain' })) },
  BE_013t3: { target: enemyMinion, abilities: play(fn('beCthunAbility', { kind: 'glare' })) },
  BE_013t6: { abilities: play(fn('beCthunAbility', { kind: 'glare' })) },
  BE_013t4: { abilities: play(fn('beCthunAbility', { kind: 'servants' })), tokens: ['BE_013t5'] },
  // 『夢境終結』恩若司：古神。本場對戰中你每召喚一個亡語手下，消耗減少 (1)
  BE_017: { oldGod: true, titan: ['BE_017t3', 'BE_017t4', 'BE_017t5', 'BE_017t6'], costRule: { per: 'deathrattleSummoned', amount: 1 } },
  BE_017t3: { abilities: play(fn('beNzothCall')) },
  BE_017t4: { target: { filter: { type: 'minion', side: 'friendly', excludeSelf: true, hasDeathrattle: true } }, abilities: play(fn('beNzothMastery')) },
  BE_017t5: { abilities: play(fn('beNzothArmy')) },
  BE_017t6: { target: { filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, abilities: play(fn('beNzothDomain')) },
  // 『泰坦剋星』亞煞拉懼：古神。戰吼：若你本場對戰中在手下上花了 30 點法力，獲得免疫 1 回合
  BE_784: { oldGod: true, titan: ['BE_784t1', 'BE_784t2', 'BE_784t3', 'BE_784t4'], abilities: play(fn('beYshaarj')) },
  BE_784t1: { abilities: play(fn('beYshaarjGaze')) },
  BE_784t2: { abilities: play(fn('beYshaarjSpawn')) },
  BE_784t3: { abilities: play(fn('beYshaarjMight')) },
  BE_784t4: { abilities: play({ e: 'nextCardDiscount', amount: 5 }) },
  // 卓雷阿葛斯：亡語：抽一個古神；抽不到就獲得一個隨機古神
  BE_703: { abilities: dr(fn('beDrestagath')) },

  // ================================================================ 克蘇恩技能
  // 黑暗輔祭：戰吼：若這張牌在你手中時你施放過 2 張暗影法術，選擇一個克蘇恩技能觸發
  BE_012: {
    handAbilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'SHADOW' }, effects: [fn('beHandCount')] }],
    abilities: play(cond({ c: 'handCounter', n: 2 }, [cthunAbility()])),
    tokens: CTHUN,
  },
  // 克蘇恩之子：戰吼：若克蘇恩一開始在你的牌堆中，選擇一個克蘇恩技能觸發
  BE_014: { abilities: play(cond({ c: 'startedWith', card: 'BE_013' }, [cthunAbility()])), tokens: CTHUN },
  // 巨型滑行者：嘲諷。戰吼：選擇一個克蘇恩技能觸發
  BE_204: { keywords: ['TAUNT'], abilities: play(cthunAbility()), tokens: CTHUN },
  // 克蘇恩儀式：在 2 個回合後，選擇一個克蘇恩技能觸發
  BE_726: { abilities: ritual(2, cthunAbility()), tokens: CTHUN },
  // 觸鬚鞭：在你的英雄攻擊後，使克蘇恩的消耗減少 (1)，選擇一個克蘇恩技能觸發
  BE_771: { abilities: afterHeroAttack(fn('beCthunDiscount'), cthunAbility()), tokens: CTHUN },
  // 眷顧：選擇兩個不同的克蘇恩技能觸發
  BE_778: { abilities: play(cthunAbility(2)), tokens: CTHUN },

  // ================================================================ 組裝
  // 拉頡：戰吼：組裝一個任何職業的手下，把它變成被動英雄能力
  BE_004: { abilities: play(fn('beRajh')) },
  // 取回者：戰吼：組裝一個 4 費手下
  BE_044: { abilities: play(assemble({ cost: 4 })) },
  // 異配者：嘲諷。戰吼：以消耗 (5) 以上的卡組裝一個消耗 (3) 以下的手下
  BE_045: { keywords: ['TAUNT'], abilities: play(assemble({ maxCost: 3, donorMinCost: 5 })) },
  // 至黑深淵：召喚兩個有嘲諷的 0/3 守衛，組裝一個手下
  BE_087: { abilities: play(summon('BE_087t', 2), assemble()), tokens: ['BE_087t'] },
  // 陰影雕塑：組裝一個手下，它的消耗減少 (2)
  BE_114: { abilities: play(assemble({ discount: 2 })) },
  // 塑沙者：戰吼：組裝一個有「在你的回合結束時」效果的手下
  BE_229: { abilities: play(assemble({ trigger: 'turnEnd' })) },
  // 寒冰融解：組裝一個法師手下。在你的回合結束時，使它的消耗減少 (1)
  BE_257: { abilities: play(assemble({ cls: 'MAGE', thaw: true })) },
  // 細心照料者：戰吼：組裝一個 1 費手下
  BE_262: { abilities: play(assemble({ cost: 1 })) },
  // 巧手工匠：組裝一個機械，獲得一個超速傳動
  BE_553: { abilities: play(assemble({ race: 'MECHANICAL' }), { e: 'addCard', card: 'BE_553t', count: 1, who: 'self' }), tokens: ['BE_553t'] },
  BE_553t: { target: { filter: { type: 'minion', side: 'friendly', race: 'MECHANICAL' } }, abilities: play(fn('beOverdrive')) },
  // 血肉塑型：組裝一個亡語手下，使你手牌中的所有手下 +2/+2
  BE_571: { abilities: play(assemble({ deathrattle: true }), { e: 'handBuff', atk: 2, hp: 2, scope: 'all' }) },
  // 製影者：連擊：組裝一個其他職業的手下
  BE_702: { abilities: play(combo(assemble({ otherClass: true }))) },
  // 雕鑿：組裝一個嘲諷手下，使它獲得 +2/+3
  BE_740: { abilities: play(assemble({ keyword: 'TAUNT', buff: [2, 3] })) },
  // 山谷管家：戰吼：組裝一隻野獸
  BE_851: { abilities: play(assemble({ race: 'BEAST' })) },

  // ================================================================ 儀式
  // 超量儀式：在 2 個回合後，抽 2 張牌，它們的消耗減少 (2)
  BE_005: { abilities: ritual(2, fn('beDrawDiscount', { count: 2, amount: 2 })) },
  // 召喚儀式：在 2 個回合後，召喚兩個有嘲諷的 3/5 克蘇拉希
  BE_085: { abilities: ritual(2, summon('BE_085t', 2)), tokens: ['BE_085t'] },
  // 克希斯：戰吼：若你本場對戰中完成過儀式，選擇一個邪惡儀式開始
  BE_090: { abilities: play(cond({ c: 'ritualDone' }, [fn('beKithix')])), tokens: ['BE_090t1', 'BE_090t2', 'BE_090t3'] },
  BE_090t1: { abilities: ritual(3, fn('beFamine')) },
  BE_090t2: { abilities: ritual(3, fn('beSubjugation')) },
  BE_090t3: { abilities: ritual(3, fn('beConquest')) },
  // 誓縛者光環：在你施放一張神聖法術後，召喚一個屬性值等同它消耗、有聖盾的士兵。持續 3 回合
  BE_146: { objective: 3, abilities: [...play(fn('objective')), { on: { k: 'spellCast', side: 'friendly', school: 'HOLY' }, effects: [fn('beOathbinder')] }], tokens: ['BE_142t'] },
  // 賽特胥：戰吼：獲得 20 點護甲值。在 2 個回合後，把你的護甲值變成一個有嘲諷的魔像
  BE_557: { abilities: play({ e: 'armor', amount: 20 }, { e: 'delayed', turns: 2, effects: [fn('beSetesh')] }) },

  // ================================================================ 中立
  // 魔古將領：在你打出一張中立牌後，本回合你的下一個法術消耗減少 (1)
  BE_008: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('beMogu')] }] },
  // 秘典翻譯者：戰吼：？？？（2 個回合後解開）
  BE_327: { handAbilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('beTranslate')] }], tokens: ['BE_327t', 'BE_327t1', 'BE_327t2', 'BE_327t3'] },
  BE_327t: { abilities: play(fn('beSummonRandom', { cost: 2, deathrattle: true, count: 2 })) },
  BE_327t1: { abilities: play({ e: 'nextSpellDiscount', amount: 4 }) },
  BE_327t2: { abilities: play({ e: 'splitDamage', filter: { type: 'minion', side: 'any', excludeSelf: true }, amount: 6 }) },
  BE_327t3: { abilities: play(fn('beGainAdjacentStats', { random: true })) },
  // 同化汙泥怪：戰吼：在這個回合結束時，召喚此手下的一個複製
  BE_734: { abilities: play({ e: 'atEndOfTurn', effects: [summon('BE_734')] }) },
  // 前線鐵裔：在一個敵方手下於你的回合死亡後，獲得 +2/+2 與一個隨機加成效果
  BE_996: { abilities: [{ on: { k: 'minionDied', side: 'enemy' }, cond: { c: 'myTurn' }, effects: [fn('beIronborn')] }] },
  // 原始熊貓人：在一張牌加入你的手牌後（這張牌給的除外），使雙方玩家各獲得一張隨機法術
  BE_997: { flags: ['protoPandaren'] },
  // 獵物追尋者：飄渺。在此手下受到傷害後，消滅一個隨機敵方手下
  BE_998: { keywords: ['ELUSIVE'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 } }] }] },
  // 動力虎：在每個玩家的回合開始時，攻擊一個隨機敵人
  BE_999: { abilities: [{ on: { k: 'turnStart', whose: 'each' }, effects: [fn('aoAttackRandom')] }] },
  // 陰影之翼：亡語：使你手牌中一張隨機暗影法術的消耗減少 (2)
  BE_993: { abilities: dr(fn('barHandDiscount', { school: 'SHADOW', amount: 2 })) },

  // ================================================================ 死亡騎士
  // 嗜血魔：戰吼：消耗最多 4 具屍體，每具對所有其他手下造成 1 點傷害
  BE_283: { abilities: play(fn('beBloodfiend')) },
  // 古翰：戰吼：從生命值最低的敵人身上偷取 @ 點生命值（依你打出過的血魄符文強化）
  BE_287: { abilities: play(fn('beGhuun')) },
  // 洞悉後裔：戰吼：發現一張血魄、冰霜或穢邪卡，依你的選擇獲得生命竊取、重生或突襲
  BE_298: { abilities: play(fn('beScion')) },
  // 惡意存在：消滅一個手下，為它的擁有者恢復等同它生命值的生命值
  BE_325: { target: anyMinion, abilities: play(fn('beMalicious')) },
  // 惡臭吞噬者：在手牌中時，在你打出一張有符文的牌後變形
  BE_781: { handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('beFetidTransform')] }], tokens: FETID },
  BE_781t1: fetid(1, 1, 1),
  BE_781t2: fetid(1, 0, 0),
  BE_781t3: fetid(2, 0, 0),
  BE_781t4: fetid(3, 0, 0),
  BE_781t5: fetid(0, 1, 0),
  BE_781t6: fetid(0, 2, 0),
  BE_781t7: fetid(0, 3, 0),
  BE_781t8: fetid(0, 0, 1),
  BE_781t9: fetid(0, 0, 2),
  BE_781t10: fetid(0, 0, 3),
  BE_781t11: fetid(1, 1, 0),
  BE_781t12: fetid(1, 0, 1),
  BE_781t13: fetid(2, 1, 0),
  BE_781t14: fetid(2, 0, 1),
  BE_781t15: fetid(1, 2, 0),
  BE_781t16: fetid(1, 0, 2),
  BE_781t17: fetid(0, 1, 1),
  BE_781t18: fetid(0, 2, 1),
  BE_781t19: fetid(0, 1, 2),

  // ================================================================ 惡魔獵人
  // 拉維茲：你最左邊的手下具有突襲；你最右邊的手下在攻擊時免疫
  BE_230: { flags: ['ravitz'] },
  // 盲眼哈洛爾：流放與亡語：獲得一張隨機流放卡
  BE_264: { abilities: [...play(cond({ c: 'outcast' }, [fn('beOutcastCard')])), ...dr(fn('beOutcastCard'))] },
  // 荒野恐懼：戰吼：若本回合有友方手下死亡，攻擊一個隨機敵人
  BE_564: { abilities: play(cond({ c: 'friendlyDiedThisTurn' }, [fn('aoAttackRandom')])) },
  // 育母沙卡：戰吼：若本回合有 5 個友方手下死亡，本場對戰中你的突襲手下具有衝鋒
  BE_565: { abilities: play(fn('beBroodqueen')) },
  // 蟲蛀蠕行者：戰吼：選擇你手牌中的一張牌洗入你的牌堆，它的消耗減少 (1)
  BE_566: { abilities: play(fn('beWriggler')) },
  // 孵化符印：在你的下個回合開始時，召喚三隻有突襲的 3/1 碎爪
  BE_873: { abilities: play({ e: 'delayed', turns: 1, effects: [summon('BE_873t', 3)] }), tokens: ['BE_873t'] },
  // 飢渴洞穴：生命竊取。造成 2 點傷害。若本回合有友方手下死亡，消耗為 (0)
  BE_877: { keywords: ['LIFESTEAL'], target: anyChar, costIf: { cond: { c: 'friendlyDiedThisTurn' }, cost: 0 }, abilities: play(hit(2)) },

  // ================================================================ 德魯伊
  // 泰坦尺寸：抽一個手下，使你手牌中的野獸 +2/+2
  BE_208: { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION' } }, { e: 'handBuff', atk: 2, hp: 2, scope: 'all', race: 'BEAST' }) },
  // 開花：抽一張不同的法術；若是自然法術，它會施放兩次
  BE_801: { abilities: play(fn('beEfflorescence')) },
  // 死亡綻放：獲得兩張 2/1 植物（亡語：召喚一隻有嘲諷的 5/5 昆蟲），它們消耗為 (2)
  BE_802: { abilities: play({ e: 'addCard', card: 'BE_802t', count: 2, who: 'self' }), tokens: ['BE_802t'] },
  BE_802t: { abilities: dr(summon('BE_T_BUG')) },
  // 好奇冷酷山貓：嘲諷。戰吼：召喚一隻有突襲的 {0}/{1} 野獸（屬性值與此手下相反）
  BE_850t: { keywords: ['TAUNT'], abilities: play(fn('beGrimlynx')), tokens: ['BE_850'] },
  // 安姆內：戰吼：本場對戰剩下的時間，在你打出一個亡語手下後，召喚它的一個複製
  BE_852: { abilities: play(fn('beAmmunae')) },
  // 始源熊：戰吼：本回合使你的英雄獲得等同此手下攻擊力的攻擊力
  BE_855: { abilities: play(fn('beBear')) },
  // 『翡翠建築師』芙蕾雅：戰吼：使你手牌與牌堆中所有野獸的屬性值加倍
  BE_856: { abilities: play(fn('beFreya')) },
  // 覓食蠍尾飛狐：嘲諷。亡語：抽等同此手下攻擊力的牌
  BE_859: { keywords: ['TAUNT'], abilities: dr(fn('beSlyvern')) },

  // ================================================================ 獵人
  // 閃光炮手 / 機械：火焰噴射器：在你的英雄攻擊後，獲得一個超速傳動
  BE_552: { abilities: afterHeroAttack({ e: 'addCard', card: 'BE_553t', count: 1, who: 'self' }), tokens: ['BE_553t'] },
  // 全面砲擊：消滅一個隨機敵方手下並對敵方英雄造成 3 點傷害；若你控制機械，再一次
  BE_554: { abilities: play(fn('beBombardment')) },
  // 重新裝填：發現一張法術，它的消耗減少 (8)；溢出的減少量重複此效果
  BE_555: { abilities: play(fn('beReload')) },
  // 彌米倫：戰吼：若你控制機械，發現一張完美的科技卡
  BE_588: { abilities: play(cond({ c: 'control', race: 'MECHANICAL' }, [fn('beMimiron')])) },
  // 發條野豬：召喚兩隻有衝鋒的 1/1 機械野獸
  BE_730: { abilities: play(summon('BE_730t', 2)), tokens: ['BE_730t'] },
  // 原始岩牙獸：戰吼：獲得相鄰手下的亡語
  BE_731: { abilities: play(fn('beRockfang')) },
  // 『穿刺者』克朗：戰吼：你的所有手下對一個隨機敵人造成等同它們攻擊力的傷害
  BE_732: { abilities: play(fn('beKronn')) },
  // 機輪摩托車：嘲諷。亡語：召喚共計 4 點法力的隨機機械
  BE_900: { keywords: ['TAUNT'], abilities: dr(fn('beMechacycle')) },

  // ================================================================ 法師
  // 阿札達斯：戰吼：發現一張法術，把它變成同消耗、每次攻擊都會施放它的 3/3 武器
  BE_055: { abilities: play(fn('beArchaedas')), tokens: ['BE_055t'] },
  BE_055t: { abilities: afterHeroAttack(fn('beArchaedasCast')) },
  // 線圈攜帶者：戰吼：發現一張法術放到你的牌堆頂，它的消耗減少 (2)
  BE_150: { abilities: play(fn('beCoilbearer')) },
  // 諾甘農圓盤：把你牌堆中的所有法術移到最上面；每回合你可以選擇從最上面或最下面抽牌
  BE_250: { abilities: play(fn('beDiscs')), tokens: ['BE_250t', 'BE_250t2'] },
  BE_250t: {},
  BE_250t2: {},
  // 星裔呼喚：選擇一個友方手下，召喚一個相同消耗的隨機手下
  BE_252: { target: friendlyMinion, abilities: play(fn('beConstellar')) },
  // 星界調解者：戰吼與亡語：施放一張隨機 3 費法術
  BE_256: { abilities: [...play(fn('beCastRandom', { cost: 3 })), ...dr(fn('beCastRandom', { cost: 3 }))] },
  // 星界之雨：對一個隨機敵方手下造成 2 點傷害五次
  BE_258: { abilities: play(fn('beAstralRain')) },
  // 冰帶法師：戰吼：抽兩張牌，每抽到一張非手下的牌，召喚一個 3/6 水元素
  BE_270: { abilities: play(fn('beIcebelt')), tokens: ['CS2_033'] },

  // ================================================================ 聖騎士
  // 喚光者：對雙方玩家生命竊取
  BE_000: { keywords: ['LIFESTEAL'], flags: ['lifestealBoth'] },
  // 進軍戰事：這張牌上的數字等同你剩下的法力。召喚一個有聖盾的 @/@ 士兵
  BE_142: { abilities: play(fn('beMarch')), tokens: ['BE_142t'] },
  // 『艾蜜特斯保護者』艾蜜特：嘲諷。戰吼：你牌堆中每有一張神聖法術，洗入一張「抽到時施放」的複製
  BE_143: { keywords: ['TAUNT'], abilities: play(fn('beAmitut')) },
  // 日舞者：在你的回合結束時，獲得一張 2 費的太陽祝福（+2/+3）
  BE_152: { abilities: atEndOfTurn({ e: 'addCard', card: 'BE_152t', count: 1, who: 'self' }), tokens: ['BE_152t'] },
  BE_152t: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 3 }) },
  // 謙卑審判：抽 3 張牌，抽到的手下的攻擊力與生命值變成 2
  BE_154: { abilities: play(fn('beHumble')) },
  // 起源大廳：生命竊取。造成 8 點傷害，隨機分配到所有敵人身上；召喚一個 8 費手下
  BE_183: { keywords: ['LIFESTEAL'], abilities: play({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 8, spell: true }, { e: 'summonRandom', pool: { type: 'MINION', cost: 8 }, count: 1, who: 'self' }) },

  // ================================================================ 牧師
  // 摧心制伏者：戰吼：把相鄰的手下變成此手下的複製
  BE_093: { abilities: play(fn('beMindrot')) },
  // 漂浮課程：使一個手下與你手牌中一個隨機手下獲得等同這張牌消耗兩倍的屬性值
  BE_094: { target: anyMinion, abilities: play(fn('beFloating')) },
  // 迷惑召喚師：在你的回合結束時，召喚一個隨機敵方手下的複製，它攻擊原本的手下
  BE_196: { abilities: atEndOfTurn(fn('beBefuddled')) },
  // 混亂裂隙：獲得兩張隨機暗影法術
  BE_220: { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', spellSchool: 'SHADOW' }, count: 2, who: 'self' }) },
  // 長老真言：預見 / 顯現 / 鞭笞（你打出的下一張暗影法術重複此效果）
  BE_221: { abilities: play(fn('beDrawDiscount', { count: 1, amount: 2 }), fn('beElderWord')) },
  BE_222: { abilities: play(summon('BE_222t'), fn('beElderWord')), tokens: ['BE_222t'] },
  BE_223: { abilities: play({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 3, spell: true }, fn('beElderWord')) },
  // 『大地守護者』瑟拉贊恩（薩滿）
  // 澤昂圖：嘲諷。戰吼：從你的牌堆召喚攻擊力為 0、1 與 2 的手下，獲得它們的屬性值
  BE_790: { keywords: ['TAUNT'], abilities: play(fn('beZerOntu')) },

  // ================================================================ 盜賊
  // 育雛室掘洞蟲：戰吼：獲得一隻 1 費幼蟲，它的連擊會觸發其他職業的英雄能力
  BE_720: { abilities: play(larva(1)), tokens: LARVAE },
  BE_720t1: { abilities: play(combo({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 2 })) },
  BE_720t2: { abilities: play(combo(fn('beBasicTotem'))) },
  BE_720t3: { abilities: play(combo({ e: 'equip', card: 'CS2_082' })), tokens: ['CS2_082'] },
  BE_720t4: { abilities: play(combo(summon('CS2_101t'))), tokens: ['CS2_101t'] },
  BE_720t5: { abilities: play(combo({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 2 })) },
  BE_720t6: { abilities: play(combo({ e: 'heroAttack', amount: 1 }, { e: 'armor', amount: 1 })) },
  BE_720t7: { abilities: play(combo(draw(), { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 })) },
  BE_720t8: { target: { ...anyChar, optional: true, when: { c: 'combo' } }, abilities: play(combo(hit(1, false))) },
  BE_720t9: { abilities: play(combo({ e: 'armor', amount: 2 })) },
  BE_720t10: { abilities: play(combo({ e: 'heroAttack', amount: 1 })) },
  BE_720t11: { abilities: play(combo(fn('beGhoul'))), tokens: ['HERO_11bp2t'] },
  // 亞基巨像：本回合你每打出一張連擊卡，消耗減少 (2)。戰吼：抽一張牌
  BE_721: { costRule: { per: 'comboPlayedThisTurn', amount: 2 }, abilities: play(draw()) },
  // 亞基群聚蟲：亡語：獲得兩隻幼蟲
  BE_722: { abilities: dr(larva(2)), tokens: LARVAE },
  // 遊蕩尋覓者：在你打出一張連擊卡後，對一個隨機敵人造成 3 點傷害
  BE_723: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('beSeeker')] }] },
  // 孵育：獲得三隻幼蟲
  BE_724: { abilities: play(larva(3)), tokens: LARVAE },
  // 未知者：戰吼：把你手牌中所有連擊手下的攻擊力與生命值變成 6
  BE_725: { abilities: play(fn('beUnknowable')) },
  // 暗影之舞：對所有未受傷的敵人造成 1 點傷害
  BE_071: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy', undamaged: true } }, amount: 1, spell: true }) },
  // 恩若司使者：亡語：獲得你手牌中一個隨機的其他亡語手下的複製
  BE_541: { abilities: dr(fn('beAgentOfNzoth')) },

  // ================================================================ 薩滿
  // 火焰衝擊：對兩個不同的敵人造成 2 點傷害。超載：(1)
  BE_302: { overload: 1, abilities: play({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 2 }, amount: 2, spell: true }) },
  // 灼拳學者：戰吼：若這張牌在你手中時你打出過兩個不同派系的法術，對所有敵人造成 4 點傷害
  BE_303: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('beHandSchool')] }], abilities: play(cond({ c: 'handSchools', n: 2 }, [{ e: 'damage', target: allEnemies, amount: 4 }])) },
  // 『潮汐之王』奈普圖隆：戰吼：本場對戰剩下的時間，你召喚的元素屬性值變成 5/5
  BE_209: { abilities: play(fn('beNeptulon')) },
  // 『大地守護者』瑟拉贊恩：戰吼：你每個派系的下一張法術施放兩次
  BE_337: { abilities: play(fn('beTherazane')) },
  // 瘋狂元素：戰吼：發現一張消耗等同此手下攻擊力的法術，它本回合消耗為 (0)
  BE_870: { abilities: play(fn('beMadness')) },

  // ================================================================ 術士
  // 冒瀆：對所有敵人造成 2 點傷害；若這是你手牌中消耗最高的牌，再一次
  BE_086: { abilities: play(fn('beBlasphemy')) },
  // 力量主宰：嘲諷。戰吼：若這張牌在你手中時你打出過兩個不同派系的法術，召喚此手下的一個複製
  BE_171: { keywords: ['TAUNT'], handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('beHandSchool')] }], abilities: play(cond({ c: 'handSchools', n: 2 }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },
  // 黑暗帝國之刃：在你的回合結束時，若你施放過暗影法術，敵人受到疲勞傷害；否則你受到
  BE_227: { abilities: atEndOfTurn(fn('beBlade')) },
  // 『腐化者』扎卡茲：戰吼：你手牌與牌堆中的手下消耗減少 (1)，法術消耗增加 (1)
  BE_728: { abilities: play(fn('beZakajz')) },
  // 巨口者教徒：所有法術消耗增加 (1)
  BE_729: { costAuras: [{ side: 'both', type: 'SPELL', add: 1 }] },

  // ================================================================ 地點
  // 宇宙之泉（法師）：抽一張牌；若不是手下，回復 2 個法力水晶
  BE_251: { abilities: play(fn('beCosmicSprings')) },
  // 起源熔爐（戰士）：召喚一個有嘲諷的 3/3 魔像；花費 3 點護甲值使它 +3/+3
  BE_561: { abilities: play(fn('beForge')), tokens: ['BE_561t'] },
  // 烏迪爾隔離區（死亡騎士）：在你打出每一種符文的牌之前鎖住。召喚一個隨機 5 費手下
  BE_780: { locationLock: { c: 'playedEachRune' }, abilities: play({ e: 'summonRandom', pool: { type: 'MINION', cost: 5 }, count: 1, who: 'self' }) },

  // ================================================================ 戰士
  // 重塑鐵砧：本回合使你的英雄 +4 攻擊力。消耗護甲值而非法力
  BE_042: { costsArmor: true, abilities: play({ e: 'heroAttack', amount: 4 }) },
  // 石頭護手：在你的英雄攻擊後，把你英雄的 5 點生命值轉換成護甲值
  BE_558: { abilities: afterHeroAttack(fn('beGauntlet')) },
  // 展現力量：對一個手下造成 3 點傷害；若你本回合獲得過護甲值，改為消滅它
  BE_559: { target: anyMinion, abilities: play(cond({ c: 'armorThisTurn' }, [{ e: 'destroy', target: { t: 'chosen' } }], [hit(3)])) },
  // 銅指虎鬥士：衝鋒。戰吼：若你有 10 點以上的護甲值，獲得 +4/+4
  BE_560: { keywords: ['CHARGE'], abilities: play(cond({ c: 'armor', n: 10 }, [{ e: 'buff', target: { t: 'self' }, atk: 4, hp: 4 }])) },
  // 鋼鐵賦生者：在你獲得護甲值後，抽一張牌
  BE_600: { abilities: [{ on: { k: 'armorGained' }, effects: [draw()] }] },
};
