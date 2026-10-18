// ============================================================================
// 威茲班的工作坊（Whizbang's Workshop）：微縮、巨大化、法術石、齊利亞斯豪華版 3000、實驗套牌……
// 解析器看不懂的卡在這裡手動定義；自訂效果（wz 開頭）在 game.ts 的 customWhizbang。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, Pool, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const endTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count: number, pool?: Pool): Effect => ({ e: 'draw', count, who: 'self', pool });
const addCard = (card: string, count = 1): Effect => ({ e: 'addCard', card, count, who: 'self' });
const discover = (pool: Pool, then?: Effect[]): Effect => ({ e: 'discover', pool, then });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const enemyMinions = { type: 'minion' as const, side: 'enemy' as const };
const noMinionsInDeck: Condition = { c: 'deckNoMinions' };

/** 齊利亞斯豪華版 3000 的功能模組 */
export const ZILLIAX_MODULES = ['TOY_330t92', 'TOY_330t93', 'TOY_330t94', 'TOY_330t95', 'TOY_330t96', 'TOY_330t97', 'TOY_330t98', 'TOY_330t99'];
/** 威茲班的實驗套牌（說明卡） */
export const WHIZBANG_DECKS = ['TOY_700t1', 'TOY_700t2', 'TOY_700t3', 'TOY_700t4', 'TOY_700t5', 'TOY_700t6', 'TOY_700t7', 'TOY_700t8', 'TOY_700t9', 'TOY_700t10', 'TOY_700t11', 'TOY_700t12'];
const TOY_SOLDIERS = ['TOY_814t', 'TOY_814t2', 'TOY_814t3', 'TOY_814t4', 'TOY_814t5', 'TOY_814t6', 'TOY_814t7', 'TOY_814t8'];

/** 微縮 / 巨大化：抽到時獲得 1 費 1/1（迷你）/ 8 費 8/8（巨大）的複製 */
const mini = (id: string, extra: Override = {}): Override => ({ mini: id, tokens: [id], ...extra });

export const WHIZBANG_OVERRIDES: Record<string, Override> = {
  // ================================================================ 中立
  // 複製機：微縮、巨大化。在你打出與此手下攻擊力相同的手下後，召喚一個它的複製
  MIS_025: { mini: 'MIS_025t', gigantic: 'MIS_025t1', tokens: ['MIS_025t', 'MIS_025t1'], abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [fn('wzReplicator')] }] },
  MIS_025t: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [fn('wzReplicator')] }] },
  MIS_025t1: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [fn('wzReplicator')] }] },
  // 傀儡大師多里安：在你抽到一張手下後，獲得一張消耗 (1) 的 1/1 複製
  MIS_026: { abilities: [{ on: { k: 'draw', side: 'friendly' }, effects: [fn('wzDorian')] }] },
  // 爆破專家：在你的回合結束時，把一個炸彈洗入你對手的牌堆
  MIS_308: { abilities: endTurn(fn('wzBombs', { count: 1 })), tokens: ['BOT_511t'] },
  // 專業玩家：戰吼：與你的對手猜拳！勝利者抽 2 張牌
  MIS_916: { abilities: play(fn('wzRps')), tokens: ['MIS_916a', 'MIS_916b', 'MIS_916c'] },
  MIS_916a: {},
  MIS_916b: {},
  MIS_916c: {},
  // 焦油軟泥怪：嘲諷。在你對手的回合 +2 攻擊力
  TOY_000: { keywords: ['TAUNT'], atkIf: { cond: { c: 'opponentTurn' }, atk: 2 } },
  // 卡牌鑑定師：戰吼：若你在持有這張牌時施放過法術，從你的牌堆發現一張牌
  TOY_054: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('wzHeldSpell')] }], abilities: play(fn('wzCardGrader')) },
  // 甜蜜雪花：微縮。戰吼：獲得 2 張隨機的暫時冰霜法術
  TOY_307: mini('TOY_307t', { abilities: play(fn('wzTempSpells', { school: 'FROST', count: 2 })) }),
  TOY_307t: { abilities: play(fn('wzTempSpells', { school: 'FROST', count: 2 })) },
  // 懷舊地精：微縮。突襲。在此手下於你的回合造成剛好致命的傷害後，抽一張牌
  TOY_312: mini('TOY_312t', { keywords: ['RUSH'], flags: ['exactLethalDraw'] }),
  TOY_312t: { keywords: ['RUSH'], flags: ['exactLethalDraw'] },
  // 齊利亞斯豪華版 3000：組牌時自訂（兩個功能模組）
  TOY_330: { tokens: ZILLIAX_MODULES },
  TOY_330t92: { abilities: dr(fn('wzRecursive')) },
  TOY_330t93: { abilities: endTurn({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 3 }) },
  TOY_330t94: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'doubleStat', target: { t: 'self' }, stat: 'atk' }] }] },
  TOY_330t95: { auras: [{ scope: 'otherFriendly', atk: 1 }] },
  TOY_330t96: { keywords: ['ELUSIVE', 'POISONOUS'] },
  TOY_330t97: { abilities: play({ e: 'summonCopy', target: { t: 'self' }, count: 1 }) },
  TOY_330t98: { costRule: { per: 'friendlyMinions', amount: 1 } },
  TOY_330t99: { keywords: ['DIVINE_SHIELD', 'TAUNT', 'LIFESTEAL', 'RUSH'] },
  // 懷舊新手：微縮。你第一次施放法術時，獲得 +2/+2
  TOY_340: mini('TOY_340t1', { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, once: true, effects: [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }] }] }),
  TOY_340t1: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, once: true, effects: [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }] }] },
  // 懷舊小丑：微縮。戰吼：若你在持有這張牌時打出過消耗更高的牌，造成 4 點傷害
  TOY_341: mini('TOY_341t', { target: optional(anyChar), handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('wzHeldHigher')] }], abilities: play(fn('wzClown')) }),
  TOY_341t: { target: optional(anyChar), handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('wzHeldHigher')] }], abilities: play(fn('wzClown')) },
  // 包裝好的幼龍：戰吼：若你持有龍，使它與此手下獲得 +1/+1
  TOY_386: { abilities: play(fn('wzGiftwrapped')) },
  // 清倉推銷員：亡語：使你手牌中兩張法術消耗減少 (1)
  TOY_390: { abilities: dr(fn('wzClearance')) },
  // 漫畫家：戰吼：抽一張消耗 (5) 以上的手下。給它一撇滑稽的鬍子！
  TOY_391: { abilities: play(draw(1, { type: 'MINION', minCost: 5 })) },
  // 上發條的音樂家：可交易。戰吼：對所有敵方手下造成 @ 點傷害（交易可以升級！）
  TOY_509: { keywords: ['TRADEABLE'], flags: ['tradeUpgrade'], abilities: play(fn('wzWindUp', { kind: 'musician' })) },
  // 遊戲大師：觀察者的秘密：戰吼：施放 2 個隨機奧秘。在你的回合開始時，摧毀它們
  TOY_520: { abilities: play(fn('wzObserver')) },
  // 唱歌夥伴：你的英雄能力觸發兩次
  TOY_528: { flags: ['heroPowerEffectTwice'] },
  // 遊戲室巨人：本場對戰中你每抽一張牌，消耗減少 (1)
  TOY_530: { costRule: { per: 'drawnThisGame', amount: 1 } },
  // 店長莉娜：每當你施放一個法術，用與它消耗相同的隨機手下填滿你的戰場
  TOY_531: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('wzLina')] }] },
  // 工廠組裝機器人：微縮。在你的回合結束時，召喚一個 6/7 的機器人攻擊一個隨機敵人
  TOY_601: mini('TOY_601t', { abilities: endTurn(fn('wzAssemblybot')) }),
  TOY_601t: { abilities: endTurn(fn('wzAssemblybot')), tokens: ['TOY_601t2'] },
  TOY_601t2: {},
  // 巧手玩具師：亡語：召喚兩個有嘲諷與聖盾的 1/2 機械
  TOY_670: { abilities: dr(summon('GVG_085', 2)), tokens: ['GVG_085'] },
  // 神奇的威茲邦：你以威茲邦的實驗套牌之一開始對戰！
  TOY_700: { startOfGame: 'splendiferous', tokens: [...WHIZBANG_DECKS, 'TOY_700t', 'TOY_700t9t2', 'TOY_700t13'] },
  // 發現的時刻：發現一張你付得起的德魯伊法術、德魯伊手下或中立手下
  TOY_700t: { abilities: play(fn('wzMoment')) },
  // 願望：許願得到完美的卡
  TOY_700t9t2: { abilities: play(fn('wzWish')) },
  // 變形卡：每個回合在手牌中時，變成一張隨機的可打出的法師或中立卡，消耗減少 (1)
  TOY_700t13: { flags: ['morphingCard'] },
  ...Object.fromEntries(WHIZBANG_DECKS.map((id) => [id, {}])),
  // 藝術家柯利菲羅：戰吼：抽一張手下。把所有其他友方手下變形成它的複製
  TOY_703: { abilities: play(fn('wzColifero')) },
  // 被遺忘的動畫機器人：在你的回合結束時，消滅一個攻擊力比此手下低的手下
  TOY_820: { abilities: endTurn(fn('wzAnimatronic')) },
  // 走廊沉睡者：開始時處於休眠狀態。在 7 個手下死亡後甦醒
  TOY_866: { keywords: ['DORMANT'], flags: ['corridorSleeper'] },
  // 角色扮演選手：在你的對手打出一個手下後，變形成它的 3/4 複製
  TOY_878: { abilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [fn('wzCosplay')] }] },
  // 工坊清潔工：戰吼：若你控制一個地點牌，抽 2 張牌
  TOY_891: { abilities: play(cond({ c: 'hasLocation' }, [draw(2)])) },
  // 套疊魔像：亡語：以 -1/-1 重新召喚此手下
  TOY_893: { abilities: dr(fn('wzNesting')) },
  // 摺紙青蛙：突襲。戰吼：與另一個手下交換攻擊力
  TOY_894: { keywords: ['RUSH'], target: { filter: { type: 'minion', side: 'any', excludeSelf: true }, optional: true }, abilities: play(fn('wzOrigami', { stat: 'atk' })) },
  // 摺紙鶴：嘲諷。戰吼：與另一個手下交換生命值
  TOY_895: { keywords: ['TAUNT'], target: { filter: { type: 'minion', side: 'any', excludeSelf: true }, optional: true }, abilities: play(fn('wzOrigami', { stat: 'hp' })) },
  // 摺紙龍：聖盾、生命竊取。戰吼：與另一個手下交換屬性值
  TOY_896: { keywords: ['DIVINE_SHIELD', 'LIFESTEAL'], target: { filter: { type: 'minion', side: 'any', excludeSelf: true }, optional: true }, abilities: play(fn('wzOrigami', { stat: 'both' })) },
  // 軟趴趴的九頭蛇：亡語：把一張此手下的複製洗入你的牌堆，攻擊力與生命值永久加倍
  TOY_897: { abilities: dr(fn('wzHydra')) },
  // 喜悅術士傑佩托：戰吼：獲得你在本場對戰中打出過的每張攻擊力或生命值為 1 的手下的複製
  TOY_960: { abilities: play(fn('wzJepetto')) },
  // 喧鬧的狂熱者：在你打出手牌最左或最右的牌後，對一個隨機敵人造成 1 點傷害
  TOY_943: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'edgeCard' }, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 1 }] }] },
  // 塵兔：戰吼與亡語：把一張隨機的垃圾加入你的手牌
  MIS_706: { abilities: [...play(fn('wzJunk')), ...dr(fn('wzJunk'))], tokens: ['WW_001t', 'EX1_014t', 'CS2_082'] },
  // 包裝好的實驗品 / 洞察者等（見下）

  // ================================================================ 死亡騎士
  // 偷玩具的魂靈：巨大化。戰吼：發現一個不死族。使其消耗減少等同此手下的攻擊力
  MIS_006: { gigantic: 'MIS_006t', tokens: ['MIS_006t'], abilities: play(fn('wzGeist')) },
  MIS_006t: { abilities: play(fn('wzGeist')) },
  // 絲線縫補：選擇一個友方手下。發現一張消耗 (4) 以下的法術，它死亡時施放
  TOY_822: { target: friendlyMinion, abilities: play(fn('wzSilkStitching')) },
  // 彩虹裁縫師：戰吼：若你的牌堆在開始時有血魄、冰霜或穢邪卡，分別獲得生命竊取、重生或突襲
  TOY_823: { abilities: play(fn('wzRainbowSeamstress')) },
  // 次級尖晶石法術石：使你手牌中的不死族獲得 +1/+1（獲得 5 具屍體以升級）
  TOY_825: { spellstone: { into: 'TOY_825t', kind: 'corpses', n: 5 }, tokens: ['TOY_825t'], abilities: play({ e: 'handBuff', atk: 1, hp: 1, scope: 'all', race: 'UNDEAD' }) },
  TOY_825t: { spellstone: { into: 'TOY_825t2', kind: 'corpses', n: 5 }, tokens: ['TOY_825t2'], abilities: play({ e: 'handBuff', atk: 2, hp: 2, scope: 'all', race: 'UNDEAD' }) },
  TOY_825t2: { abilities: play({ e: 'handBuff', atk: 3, hp: 3, scope: 'all', race: 'UNDEAD' }) },
  // 業餘傀儡師：微縮、嘲諷。亡語：使你手牌中的不死族獲得 +2/+2
  TOY_828: mini('TOY_828t', { keywords: ['TAUNT'], abilities: dr({ e: 'handBuff', atk: 2, hp: 2, scope: 'all', race: 'UNDEAD' }) }),
  TOY_828t: { keywords: ['TAUNT'], abilities: dr({ e: 'handBuff', atk: 2, hp: 2, scope: 'all', race: 'UNDEAD' }) },
  // 縫合博士：戰吼：發現一個 5、3、1 費手下縫到此手下上。亡語：召喚那個 5 費手下
  TOY_830: { abilities: [...play(fn('wzStitchensew')), ...dr(fn('wzStitchDr'))] },

  // ================================================================ 惡魔獵人
  // 退貨政策：發現一張你在本場對戰中打出過的友方亡語卡。觸發它的亡語
  MIS_102: { abilities: play(fn('wzReturnPolicy')) },
  // 襪子玩偶蛇鞭：此手下的攻擊力會依你英雄的攻擊力提升
  MIS_710: { atkPer: { dyn: 'heroAttack' } },
  // 胡言亂語的被拒者：在你的英雄攻擊後，召喚另一個胡言亂語的被拒者
  MIS_911: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [summon('MIS_911')] }] },
  // 團隊之魂：潛行 1 回合。在你的回合，你的英雄 +2 攻擊力
  TOY_028: { abilities: play({ e: 'buff', target: { t: 'self' }, keywords: ['STEALTH'], untilNextTurn: true }), auras: [{ scope: 'friendlyHero', atk: 2 }] },
  // 工坊事故：對一個手下造成 5 點傷害。溢出的傷害打到兩側。流放：獲得生命竊取
  TOY_640: { target: anyMinion, abilities: play(fn('wzMishap')) },
  // 球霸：生命竊取。戰吼與亡語：對生命值最低的敵人造成 3 點傷害
  TOY_642: { keywords: ['LIFESTEAL'], abilities: [...play(fn('tnLowestEnemy', { amount: 3 })), ...dr(fn('tnLowestEnemy', { amount: 3 }))] },
  // 盲盒：獲得 2 個隨機惡魔。流放：改為發現
  TOY_643: { abilities: play(cond({ c: 'outcast' }, [discover({ type: 'MINION', race: 'DEMON' }), discover({ type: 'MINION', race: 'DEMON' })], [{ e: 'addRandom', pool: { type: 'MINION', race: 'DEMON' }, count: 2, who: 'self' }])) },
  // 紅牌：使一個手下休眠 2 個回合
  TOY_644: { target: anyMinion, abilities: play(fn('wzRedCard')) },
  // 次級蛋白石法術石：抽 1 張牌（用你的英雄攻擊 2 次以升級）
  TOY_645: { spellstone: { into: 'TOY_645t', kind: 'heroAttacks', n: 2 }, tokens: ['TOY_645t'], abilities: play(draw(1)) },
  TOY_645t: { spellstone: { into: 'TOY_645t1', kind: 'heroAttacks', n: 2 }, tokens: ['TOY_645t1'], abilities: play(draw(2)) },
  TOY_645t1: { abilities: play(draw(3)) },
  // 未釋放的瑪瑟里頓：休眠 2 個回合。休眠時，在你的回合結束時對所有敵人造成 3 點傷害
  TOY_647: { abilities: [...play(fn('pdDormantSelf', { turns: 2 })), ...endTurn(cond({ c: 'selfDormant' }, [{ e: 'damage', target: allEnemies, amount: 3 }]))] },
  // 櫥窗購物者：微縮。戰吼：發現一個惡魔。把它的屬性值與消耗設為與此手下相同
  TOY_652: mini('TOY_652t', { abilities: play(fn('wzWindowShopper')) }),
  TOY_652t: { abilities: play(fn('wzWindowShopper')) },
  // 茜茜吉：戰吼、流放與亡語：獲得一張隨機的初版惡魔獵人卡（全新品相）
  TOY_913: { abilities: [...play(fn('wzCiCigi')), ...dr(fn('wzCiCigi'))] },

  // ================================================================ 德魯伊
  // 依偎的泰迪熊：巨大化。法術免疫、生命竊取、嘲諷
  MIS_300: { gigantic: 'MIS_300t', tokens: ['MIS_300t'], keywords: ['ELUSIVE', 'LIFESTEAL', 'TAUNT'] },
  MIS_300t: { keywords: ['ELUSIVE', 'LIFESTEAL', 'TAUNT'] },
  // 過度生長的豌豆：召喚一個 2/2 樹人。你每控制一個樹人，抽一張牌
  MIS_301: { abilities: play(summon('MIS_301t'), fn('wzBeanstalk')), tokens: ['MIS_301t'] },
  MIS_301t: {},
  // 閃亮藥瓶：造成 2 點傷害。本回合你的下一張牌消耗減少等量
  TOY_800: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }, fn('wzSparklingPhial')) },
  // 奇亞幼龍：微縮。二選一：獲得法術傷害 +1；或抽一張法術
  TOY_801a: { abilities: play(draw(1, { type: 'SPELL' })) },
  TOY_801b: { abilities: play(fn('pdSpellDamageSelf')) },
  TOY_801: { mini: 'TOY_801t', tokens: ['TOY_801t'] },
  TOY_801t: { chooseOneIds: ['TOY_801a', 'TOY_801b'] },
  // 上發條的樹苗：可交易。戰吼：重新整理 @ 個法力水晶（交易可以升級！）
  TOY_802: { keywords: ['TRADEABLE'], flags: ['tradeUpgrade'], abilities: play(fn('wzWindUp', { kind: 'sapling' })) },
  // 翠玉展示品：亡語：本場對戰中你的翠玉展示品 +1/+1。把 2 張洗入你的牌堆
  TOY_803: { abilities: dr(fn('wzJadeDisplay')) },
  // 林地奇觀：召喚兩隻 2/5 有嘲諷的甲蟲。若你有法術傷害，消耗減少 (3)
  TOY_804: { costIf: { cond: { c: 'spellDamage' }, cost: 2 }, abilities: play(summon('TOY_804t', 2)), tokens: ['TOY_804t'] },
  TOY_804t: { keywords: ['TAUNT'] },
  // 縮小術：使你牌堆中的手下消耗與攻擊力減少 (1)
  TOY_805: { abilities: play(fn('wzEnsmallen')) },
  // 天空之母艾維娜：戰吼：把 10 個隨機傳說手下洗入你的牌堆。它們消耗 (1)
  TOY_806: { abilities: play(fn('wzAviana')) },
  // 歐朗尼斯：法術傷害 +1。你的法術從法術傷害獲得的加成加倍
  TOY_807: { spellDamage: 1, flags: ['doubleSpellPower'] },
  // 無底玩具箱：從你的牌堆發現一張牌。若你有法術傷害，複製它
  TOY_851: { abilities: play(fn('wzToyChest')) },
  // 依偎的泰迪熊等其他德魯伊卡見上

  // ================================================================ 獵人
  // 野性禮包：把 5 個隨機野獸加入你的手牌。它們是暫時的
  MIS_104: { abilities: play(fn('wzTempPack', { pool: { type: 'MINION', race: 'BEAST' } })) },
  // 清倉箱：奧秘：在你的對手打出手下、法術或武器後，抽另外兩種類型的牌各一張
  MIS_105: { secret: true, abilities: [{ on: { k: 'secret', ev: 'afterEnemyCard' }, effects: [fn('wzBargainBin')] }] },
  // 產品 9 號：戰吼：重新施放本場對戰中每個觸發過的友方奧秘
  MIS_914: { abilities: play(fn('wzProduct9')) },
  // 彩繪恐龍：戰吼：使每個其他友方野獸獲得一個隨機的額外效果
  TOY_350: { abilities: play(fn('wzCanvasaur')) },
  // 神秘蛋：微縮。亡語：獲得一張你牌堆中隨機野獸的複製。它消耗減少 (3)
  TOY_351: mini('TOY_351t', { abilities: dr(fn('wzMysteryEgg')) }),
  TOY_351t: { abilities: dr(fn('wzMysteryEgg')) },
  // 拼布夥伴：獲得全部 3 個動物夥伴。它們消耗減少 (1)
  TOY_353: { abilities: play(fn('wzPatchwork')) },
  // 遙控暴走：召喚六隻 1/1 獵犬。放不下的使其他的獲得 +1/+1
  TOY_354: { abilities: play(fn('wzRcRampage')), tokens: ['TOY_358t'] },
  TOY_358t: {},
  // 赫米特：在一個友方野獸死亡後，獲得一張來自過去的隨機傳說野獸。它消耗減少 (2)
  TOY_355: { abilities: [{ on: { k: 'minionDied', side: 'friendly', race: 'BEAST' }, effects: [fn('wzHemet')] }] },
  // 絨毛國王：衝鋒。戰吼：把所有攻擊力比此手下低的手下送回其擁有者的牌堆
  TOY_357: { keywords: ['CHARGE'], abilities: play(fn('wzKingPlush')) },

  // ================================================================ 法師
  // 故障：對所有敵方手下隨機分配 3 點傷害。若你的牌堆中沒有手下，再造成 3 點
  MIS_107: { abilities: play({ e: 'splitDamage', filter: enemyMinions, amount: 3, spell: true }, cond(noMinionsInDeck, [{ e: 'splitDamage', filter: enemyMinions, amount: 3, spell: true }])) },
  // 買一送一凍結：凍結一個手下。召喚一個被凍結的它的複製
  MIS_302: { target: anyMinion, abilities: play({ e: 'freeze', target: { t: 'chosen' } }, fn('wzBogof')) },
  // 暗月魔術師：法術免疫。在你施放一個法術後，施放一個消耗多 (1) 的隨機法術
  MIS_303: { keywords: ['ELUSIVE'], abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('wzDarkmoonMagician')] }] },
  // 隱藏物件：發現一個奧秘。把它的消耗設為 (1)
  TOY_037: { abilities: play(discover({ isSecret: true }, [fn('wzSetCostIt', { cost: 1 })])) },
  // 三芯詭術師：戰吼：對一個隨機敵人造成 2 點傷害，三次
  TOY_370: { abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 }] }) },
  // 製造瑕疵：抽 3 張牌。若你的牌堆中沒有手下，它們消耗減少 (3)
  TOY_371: { abilities: play(fn('wzManufacturingError')) },
  // 盒中尤格：施放 5 個隨機法術。若你的牌堆中沒有手下，施放的法術消耗 (5) 以上
  TOY_372: { abilities: play(fn('wzYoggBox')) },
  // 謎題大師卡德加：戰吼：裝備一把會施放有用法師法術的 0/6 智慧球
  TOY_373: { abilities: play({ e: 'equip', card: 'TOY_373t' }), tokens: ['TOY_373t'] },
  TOY_373t: { abilities: endTurn(fn('wzWisdomball')) },
  // 找不同：發現一個 3 費手下並召喚。若你的牌堆中沒有手下，重複一次
  TOY_374: { abilities: play(fn('wzSpotDifference')) },
  // 冰雪溜冰者：微縮。戰吼：凍結一個敵方手下。獲得等同其攻擊力的護甲
  TOY_375: mini('TOY_375t', { target: optional(enemyMinion), abilities: play({ e: 'freeze', target: { t: 'chosen' } }, fn('wzSleetSkater')) }),
  TOY_375t: { target: optional(enemyMinion), abilities: play({ e: 'freeze', target: { t: 'chosen' } }, fn('wzSleetSkater')) },
  // 水彩畫家：戰吼：抽一張冰霜法術。在你的回合開始時，使它消耗減少 (1)
  TOY_376: { abilities: play(draw(1, { type: 'SPELL', spellSchool: 'FROST' }), fn('wzWatercolor')) },
  // 冰霜巫妖十字繡：對一個角色造成 3 點傷害。若它死亡，召喚一個會凍結的 3/6 水元素
  TOY_377: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, fn('wzCrossStitch')), tokens: ['VAC_509t'] },
  // 銀河投影球：重新施放你在本場對戰中施放過的每種消耗各一張隨機法術（盡可能指定敵人）
  TOY_378: { abilities: play(fn('wzProjectionOrb')) },

  // ================================================================ 聖騎士
  // 打地鼠：發現一把來自過去的聖騎士武器。使它獲得 +1/+1
  MIS_700: { abilities: play(discover({ type: 'WEAPON', cls: 'PALADIN', past: true }, [fn('wzWeaponHandBuff', { atk: 1, dur: 1 })])) },
  // 神聖螢光棒：生命竊取。對一個手下造成 4 點傷害。若你本回合施放過神聖法術，消耗為 (1)
  MIS_709: { keywords: ['LIFESTEAL'], target: anyMinion, costIf: { cond: { c: 'castHolyThisTurn' }, cost: 1 }, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 4, spell: true }) },
  // 閃爍光明機器人：巨大化。本場對戰中你每施放過一張神聖法術，消耗減少 (1)
  MIS_918: { gigantic: 'MIS_918t', tokens: ['MIS_918t'], costRule: { per: 'holySpellsCast', amount: 1 } },
  MIS_918t: { costRule: { per: 'holySpellsCast', amount: 1 } },
  // 特賣：召喚一個有聖盾與嘲諷的 1/2 機械。使你的手下獲得 +1/+2
  TOY_716: { abilities: play(summon('GVG_085'), { e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 1, hp: 2 }), tokens: ['GVG_085'] },
  // 工匠光環：在你的回合結束時，召喚一個隨機的 6 費手下。持續 3 個回合
  TOY_808: { objective: 3, abilities: [...play(fn('objective')), ...endTurn({ e: 'summonRandom', pool: { type: 'MINION', cost: 6, anyClass: true }, count: 1, who: 'self' })] },
  // 紙板魔像：戰吼：使你手牌、牌堆與戰場上的光環持續時間增加 1
  TOY_809: { abilities: play(fn('wzCardboard')) },
  // 虎紋絨毛玩偶：微縮。突襲、生命竊取、聖盾
  TOY_811: mini('TOY_811t', { keywords: ['RUSH', 'LIFESTEAL', 'DIVINE_SHIELD'] }),
  TOY_811t: { keywords: ['RUSH', 'LIFESTEAL', 'DIVINE_SHIELD'] },
  // 皮普西‧彩蹄：亡語：從你的牌堆召喚一個隨機的聖盾、突襲與嘲諷手下
  TOY_812: { abilities: dr(fn('wzPipsi')) },
  // 玩具船長塔林：微縮、嘲諷。戰吼：把一個手下的攻擊力與生命值設為與此手下相同
  TOY_813: mini('TOY_813t', { keywords: ['TAUNT'], target: optional({ filter: { type: 'minion', side: 'any', excludeSelf: true } }), abilities: play(fn('wzTarim')) }),
  TOY_813t: { keywords: ['TAUNT'], target: optional({ filter: { type: 'minion', side: 'any', excludeSelf: true } }), abilities: play(fn('wzTarim')) },
  // 上發條的執法者：可交易。戰吼：召喚 @ 個此手下的複製（交易可以升級！）
  TOY_880: { keywords: ['TRADEABLE'], flags: ['tradeUpgrade'], abilities: play(fn('wzWindUp', { kind: 'enforcer' })) },
  // 精美包裝：使一個有聖盾的手下獲得 +2/+3
  TOY_881: { target: { filter: { type: 'minion', side: 'any', keyword: 'DIVINE_SHIELD' } }, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 3 }) },
  // 小飾品藝術家：戰吼：抽一張聖盾手下與一張光環
  TOY_882: { abilities: play(draw(1, { type: 'MINION', keyword: 'DIVINE_SHIELD' }), fn('wzDrawAura')) },

  // ================================================================ 牧師
  // 延遲產品：發現並召喚一個消耗 (8) 以上的手下。它休眠 2 個回合
  MIS_305: { abilities: play(fn('wzDelayedProduct')) },
  // 哈哈鏡：召喚一個敵方手下的複製。它攻擊原本的手下
  MIS_714: { target: enemyMinion, abilities: play(fn('wzFunhouse')) },
  // 黏土族母：微縮、嘲諷。亡語：召喚一隻有法術免疫的 4/4 幼龍
  TOY_380: mini('TOY_380t', { keywords: ['TAUNT'], abilities: dr(summon('TOY_380t2')) }),
  TOY_380t: { keywords: ['TAUNT'], abilities: dr(summon('TOY_380t2')), tokens: ['TOY_380t2'] },
  TOY_380t2: { keywords: ['ELUSIVE'] },
  // 紙藝天使：你的英雄能力消耗為 (0)
  TOY_381: { flags: ['heroPowerFree'] },
  // 粗心的工匠：亡語：獲得兩張 0 費、恢復 3 點生命值的繃帶
  TOY_382: { abilities: dr(addCard('TOY_382t', 2)), tokens: ['TOY_382t'] },
  TOY_382t: { target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 3 }) },
  // 重新封印的拉薩：戰吼：把本場對戰中 5 個隨機死亡的友方手下的複製洗入你的牌堆。它們消耗 (0)
  TOY_383: { abilities: play(fn('wzRaza')) },
  // 時光扭轉者薩里米：戰吼：每場對戰一次，若你打出過 8 個其他龍，進行一個額外的回合
  TOY_385: { abilities: play(fn('wzZarimi')) },
  // 比例模型：抽你消耗最低與最高的龍
  TOY_387: { abilities: play(fn('wzScaleReplica')) },
  // 粉筆畫家：戰吼：抽一張手下。把它變形成一個隨機傳說手下（保留原本的屬性值與消耗）
  TOY_388: { abilities: play(fn('wzChalkArtist')) },
  // 架上熱賣：對所有敵方手下造成 1 點傷害。你每持有一條龍，就重複一次
  TOY_714: { abilities: play(fn('wzFlyOffShelves')) },
  // 重新包裝：把所有手下塞進一個 2 費的盒子，然後洗入對手的牌堆
  TOY_879: { abilities: play(fn('wzRepackage')), tokens: ['TOY_879t'] },
  TOY_879t: { abilities: play(fn('pdUnpack')) },

  // ================================================================ 盜賊
  // 塵兔見中立
  // 扭曲禮包：把 5 張來自其他職業的隨機卡加入你的手牌。它們是暫時的
  MIS_708: { abilities: play(fn('wzTempPack', { pool: { otherClass: true } })) },
  // 順手牽羊金鬍子：在你召喚一個海盜後，召喚一個它的複製去攻擊一個隨機敵人，然後死亡
  TOY_511: { abilities: [{ on: { k: 'summon', side: 'friendly', race: 'PIRATE' }, effects: [fn('wzGoldbeard')] }] },
  // 薊草茶具組：發現一張來自另一個職業的法術。獲得一張它的複製
  TOY_514: { abilities: play(discover({ type: 'SPELL', otherClass: true }, [{ e: 'addCopy', target: { t: 'it' }, count: 1 }])) },
  // 桑雅‧舞水者：在你打出一個 1 費手下後，獲得一張消耗 (0) 的複製
  TOY_515: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itCost', n: 1 }, effects: [fn('wzSonya')] }] },
  // 沙坑惡棍：微縮。戰吼：本回合你的下一張牌消耗減少 (2)
  TOY_521: mini('TOY_521t1', { abilities: play({ e: 'nextCardDiscount', amount: 2 }) }),
  TOY_521t1: { abilities: play({ e: 'nextCardDiscount', amount: 2 }) },
  // 水砲：在你的英雄攻擊後，召喚一個 1/1 海盜攻擊一個隨機敵人
  TOY_522: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('wzWatercannon')] }], tokens: ['TOY_522t'] },
  TOY_522t: {},

  // ================================================================ 薩滿
  // 鄉愁之波：把所有手下變形成來自過去的隨機傳說手下
  MIS_701: { abilities: play(fn('wzNostalgia')) },
  // 魚人鰭長者：巨大化。戰吼：召喚一個有突襲、屬性值等同此手下的小鰭
  MIS_307: { gigantic: 'MIS_307t1', tokens: ['MIS_307t1', 'MIS_307t'], abilities: play(fn('wzGrowfin')) },
  MIS_307t1: { abilities: play(fn('wzGrowfin')), tokens: ['MIS_307t'] },
  MIS_307t: { keywords: ['RUSH'] },
  // 超值優惠：發現一個 4 費手下。把它的攻擊力與生命值設為 7
  TOY_046: { abilities: play(discover({ type: 'MINION', cost: 4 }, [fn('wzSetStatsIt', { atk: 7, hp: 7 })])) },
  // 戰慄塊：微縮。戰吼：你的下一個戰吼觸發 3 次，但無法傷害敵方英雄
  TOY_501: mini('TOY_501t', { abilities: play(fn('wzShudderblock')) }),
  TOY_501t: { abilities: play(fn('wzShudderblock')) },
  // 寓言海加莎：戰吼：抽 2 張消耗 (5) 以上的法術。把它們變形成施放那些法術的軟泥怪
  TOY_504: { abilities: play(fn('wzHagatha')), tokens: ['TOY_504t'] },
  TOY_504t: { abilities: play(fn('wzFairySlime')) },
  // 很久很久以前……：召喚一個隨機的 3 費野獸、龍、元素與魚人
  TOY_506: { abilities: play(fn('wzOnceUponATime')) },
  // 沙畫元素：微縮。戰吼：本回合使你的英雄獲得 +1 攻擊力與風怒
  TOY_513: mini('TOY_513t', { abilities: play({ e: 'heroAttack', amount: 1 }, fn('wzHeroWindfury')) }),
  TOY_513t: { abilities: play({ e: 'heroAttack', amount: 1 }, fn('wzHeroWindfury')) },
  // 許願星：使你手牌、牌堆與戰場上的所有手下獲得 +2/+3
  TOY_877: { abilities: play(fn('wzWishUponStar')) },

  // ================================================================ 術士
  // 骨牌效應：對一個手下造成 2 點傷害。往左或右重複，每次多 1 點傷害
  MIS_027: { target: anyMinion, abilities: play(fn('wzDomino')) },
  // 地獄火！：嘲諷。戰吼：把你英雄的剩餘生命值設為 15
  MIS_703: { keywords: ['TAUNT'], abilities: play(fn('wzInfernal')) },
  // 量產：抽 2 張牌。對你的英雄造成 3 點傷害。把 2 張複製洗入你的牌堆
  MIS_707: { abilities: play(draw(2), { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 3, spell: true }, { e: 'shuffle', card: 'MIS_707', count: 2 }) },
  // 遊戲大師奈姆希：戰吼：抽一張惡魔。亡語：與它交換位置
  TOY_524: { abilities: [...play(fn('wzNemsyDraw')), ...dr(fn('wzNemsySwap'))] },
  // 惡毒的城堡：戰吼：攻擊你的英雄
  TOY_526: { abilities: play(fn('wzRook')) },
  // 詛咒戰役：使一個友方手下獲得「亡語：召喚兩個休眠 2 個回合的此手下的複製」
  TOY_527: { target: friendlyMinion, abilities: play(fn('wzCursedCampaign')) },
  // 死亡之輪！！！：摧毀你的牌堆。5 個回合後，消滅敵方英雄
  TOY_529: { abilities: play(fn('wzWheelOfDeath')) },
  // 夾娃娃機：召喚你牌堆中兩個惡魔的複製
  TOY_884: { abilities: play(fn('wzCraneGame')) },
  // 終局：復活你最後死亡的惡魔
  TOY_886: { abilities: play(fn('wzEndgame')) },
  // 桌遊角色扮演者：微縮。戰吼：本回合使一個友方惡魔獲得 +2 攻擊力與免疫
  TOY_915: mini('TOY_915t', { target: optional({ filter: { type: 'minion', side: 'friendly', race: 'DEMON' } }), abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, keywords: ['IMMUNE'], temp: true }) }),
  TOY_915t: { target: optional({ filter: { type: 'minion', side: 'friendly', race: 'DEMON' } }), abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, keywords: ['IMMUNE'], temp: true }) },
  // 素描畫家：戰吼：抽一張暗影法術。獲得一張它的暫時複製
  TOY_916: { abilities: play(draw(1, { type: 'SPELL', spellSchool: 'SHADOW' }), fn('wzTempCopyIt')) },

  // ================================================================ 戰士
  // 標準禮包：把 5 個隨機嘲諷手下加入你的手牌。它們是暫時的
  MIS_705: { abilities: play(fn('wzTempPack', { pool: { type: 'MINION', keyword: 'TAUNT' } })) },
  // 安全專家：突襲。亡語：把三個炸彈洗入你對手的牌堆
  MIS_711: { keywords: ['RUSH'], abilities: dr(fn('wzBombs', { count: 3 })), tokens: ['BOT_511t'] },
  // 零件拆解者：失去最多 5 點護甲。你的下一個機械消耗減少等量
  MIS_902: { abilities: play(fn('wzPartScrapper')) },
  // 化學溢漏：召喚你手牌中消耗最高的手下，然後對它造成 5 點傷害
  TOY_602: { abilities: play(fn('wzChemicalSpill')) },
  // 毀壞與打擊：選擇一個友方機械。召喚一個它的複製去攻擊一個隨機敵人，然後死亡
  TOY_603: { target: { filter: { type: 'minion', side: 'friendly', race: 'MECHANICAL' } }, abilities: play(fn('wzWreckem')) },
  // 爆爆扳手：微縮。亡語：觸發一個隨機友方機械的亡語
  TOY_604: mini('TOY_604t', { abilities: dr(fn('wzBoomWrench')) }),
  TOY_604t: { abilities: dr(fn('wzBoomWrench')) },
  // 發明家爆爆：戰吼：復活兩個不同的、消耗 (5) 以上的友方機械。它們攻擊隨機敵人
  TOY_607: { abilities: play(fn('wzInventorBoom')) },
  // 實驗室顧客：每當你獲得護甲，召喚另一個實驗室顧客（每回合一次）
  TOY_651: { abilities: [{ on: { k: 'armorGained' }, effects: [fn('wzLabPatron')] }] },
  // 機器人臉：嘲諷。在此手下受到傷害後，獲得兩個隨機的迷你
  TOY_906: { keywords: ['TAUNT'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [fn('wzBotface')] }] },
  // 安全護目鏡：獲得 6 點護甲。若你沒有護甲，消耗為 (0)
  TOY_907: { costIf: { cond: { c: 'not', cond: { c: 'armor', n: 1 } }, cost: 0 }, abilities: play({ e: 'armor', amount: 6 }) },
  // 煙火師：亡語：召喚兩個 1/1 的爆爆機器人
  TOY_908: { abilities: dr(summon('GVG_110t', 2)), tokens: ['GVG_110t'] },

  // ================================================================ 聖騎士／其他中立補充
  // 士兵水桶：亡語：召喚五個有隨機額外效果的 1/1 士兵
  TOY_814: { abilities: dr(fn('wzSoldiers')), tokens: TOY_SOLDIERS },
  ...Object.fromEntries(TOY_SOLDIERS.map((id, i) => [id, { keywords: [(['DIVINE_SHIELD', 'TAUNT', 'RUSH', 'WINDFURY', 'ELUSIVE', 'POISONOUS', 'LIFESTEAL', 'REBORN'] as const)[i]] }])),
};
