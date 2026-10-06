// ============================================================================
// 安戈洛失落之城（TLC_ / DINO_，系列 1952）：手動定義的卡牌效果。
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
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const addCard = (card: string, count = 1): Effect => ({ e: 'addCard', card, count, who: 'self' });
/** 血緣：與你上個回合打出的牌同種族或同派系時觸發 */
const kin = (...effects: Effect[]): Effect => fn('coKin', { effects });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allFriendlyOthers = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const, excludeSelf: true } };
const heroHit = (effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];
const selfBuffKw = (k: 'RUSH' | 'TAUNT'): Effect => ({ e: 'buff', target: { t: 'self' }, keywords: [k] });

export const UNGORO_OVERRIDES: Record<string, Override> = {};
const reg = (id: string, ov: Override) => {
  UNGORO_OVERRIDES[id] = ov;
};

// ============================================================== 第一批：DINO 與 TLC_1xx ~ TLC_2xx
// 被附身的動物召喚師：亡語：從你的牌堆召喚一隻隨機野獸，使其具有生命竊取
reg('DINO_131', { abilities: dr(fn('coAnimancer')) });
// 盛宴號角：召喚三隻具有突襲的 2/1 飢餓猛禽。流放：本回合它們攻擊時免疫
reg('DINO_136', { abilities: play(fn('coHorn')), tokens: ['DINO_136t'] });
// 膽怯的醬料師：戰吼：使與它相鄰的手牌消耗減少 (1)
reg('DINO_137', { abilities: play(fn('coSaucier')) });
// 魔暴龍：血緣：對你的對手最左與最右的手下造成 6 點傷害
reg('DINO_138', { abilities: play(kin(fn('coEdges', { n: 6 }))) });
// 路障破壞者：每當你獲得護甲，獲得 +2/+2 並攻擊一個隨機敵方手下
reg('DINO_400', { abilities: [{ on: { k: 'armorGained' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }, fn('coAttackRandom')] }] });
// 偉大的暴龍：突襲。在此手下攻擊一個敵方手下後，對所有其他敵方手下造成同樣的傷害
reg('DINO_401', { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('coDracorex')] }] });
// 蝙蝠面具 / 魔暴龍面具 / 巨獸面具 / 綿羊面具 / 黑豹面具
reg('DINO_402', { target: friendlyMinion, abilities: play(fn('coMask', { atk: 1, hp: 1, fill: true })) });
reg('DINO_403', { target: anyMinion, abilities: play(fn('coMask', { atk: 8, hp: 8, kw: ['CHARGE'] })) });
reg('DINO_428', { target: anyMinion, abilities: play(fn('coMask', { atk: 8, hp: 10, kw: ['LIFESTEAL'], force: true })) });
reg('DINO_429', { target: anyMinion, abilities: play(fn('coMask', { atk: 1, hp: 1, dr: true })) });
reg('DINO_432', { target: anyMinion, abilities: play(fn('coMask', { atk: 5, hp: 4, kw: ['STEALTH'], draw: 2 })) });
// 火鰓：血緣：使你的其他手下獲得突襲
reg('DINO_404', { abilities: play(kin({ e: 'buff', target: allFriendlyOthers, keywords: ['RUSH'] })) });
// 孵化儀式：在你下個回合結束時，使你的手下 +2/+2
reg('DINO_405', {
  abilities: play({ e: 'delayed', turns: 1, effects: [{ e: 'atEndOfTurn', effects: [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 2, hp: 2 }] }] }),
});
// 水晶鏡像：在你的手牌中時，它是你的對手最後打出的手下的 3/4 複製
reg('DINO_407', { handAbilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [fn('coMirrex')] }] });
// 水晶巨牙：戰吼：將你最左邊的手牌洗入你的牌堆。亡語：抽兩張牌
reg('DINO_408', { abilities: [...play(fn('coTusk')), ...dr(draw(2))] });
// 科技暴龍：嘲諷。你本場對戰中每打出一張並非一開始就在牌堆中的牌，消耗減少 (1)
reg('DINO_409', { keywords: ['TAUNT'], costRule: { per: 'nonStartingPlayed', amount: 1 } });
// 科羅斯之蛋：亡語：召喚一顆裂得更厲害的蛋（打破 5 次孵化出 20/20 嘲諷野獸）
reg('DINO_410', { abilities: dr(summon('DINO_410t2')), tokens: ['DINO_410t2', 'DINO_410t3', 'DINO_410t4', 'DINO_410t5', 'DINO_410t'] });
reg('DINO_410t2', { abilities: dr(summon('DINO_410t3')) });
reg('DINO_410t3', { abilities: dr(summon('DINO_410t4')) });
reg('DINO_410t4', { abilities: dr(summon('DINO_410t5')) });
reg('DINO_410t5', { abilities: dr(summon('DINO_410t')) });
reg('DINO_410t', { keywords: ['TAUNT'] });
// 神聖孵蛋者：戰吼：抽一個 0 攻擊力的手下
reg('DINO_411', { abilities: play(fn('coDrawMinion', { atk: 0 })) });
// 陸龜圖騰：在你的回合結束時，獲得一個多種族的隨機手下
reg('DINO_412', { abilities: atEndOfTurn({ e: 'addRandom', pool: { type: 'MINION', multiRace: true, anyClass: true }, count: 1, who: 'self' }) });
// 寒脊劍龍：戰吼：對兩個隨機敵方手下造成 2 點傷害。血緣：並凍結它們
reg('DINO_413', { abilities: play(fn('coStego')) });
// 獻祭之舞：選擇一個手下，再選擇另一個不同的手下，變成它
reg('DINO_414', { target: anyMinion, abilities: play(fn('coTribute')) });
// 地震獸：嘲諷、元素閃避。亡語：使你手牌與牌堆中的所有手下 +3/+3
reg('DINO_421', { keywords: ['TAUNT', 'ELUSIVE'], abilities: dr({ e: 'handBuff', atk: 3, hp: 3, scope: 'all' }, fn('coDeckBuff', { n: 3 })) });
// 甲龍：嘲諷。亡語：召喚兩隻隨機的 3 費野獸。它們攻擊隨機敵人
reg('DINO_422', { keywords: ['TAUNT'], abilities: dr(fn('coAnky')) });
// 英雄的歡迎：發現一個傳說手下並召喚，將其屬性值設為 10/10
reg('DINO_424', { abilities: play(fn('coHeroWelcome')) });
// 生命儀式：發現一個 3 費手下。召喚它的 2/3 複製
reg('DINO_426', { abilities: play(fn('coRitual')) });
// 服裝商人：戰吼：獲得一張其他職業的隨機面具。連擊：它的消耗減少 (2)
reg('DINO_427', { abilities: play(fn('coMerchant')) });
// 野獸訓練師塔卡：戰吼：從任何職業發現一隻傳說野獸，獲得它的屬性值。亡語：召喚它
reg('DINO_430', { abilities: play(fn('coTaka')) });
// 阿特拉斯龍：嘲諷。亡語：召喚一個消耗 (5) 以上的隨機嘲諷手下
reg('DINO_431', { keywords: ['TAUNT'], abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', keyword: 'TAUNT', minCost: 5, anyClass: true }, count: 1, who: 'self' }) });
// 守衛任務：召喚隨機的 6 費、4 費與 2 費嘲諷手下
reg('DINO_433', {
  abilities: play(...[6, 4, 2].map((cost): Effect => ({ e: 'summonRandom', pool: { type: 'MINION', keyword: 'TAUNT', cost, anyClass: true }, count: 1, who: 'self' }))),
});
// 火山口實驗體：血緣：召喚一個此手下的複製
reg('DINO_435', { abilities: play(kin({ e: 'summonCopy', target: { t: 'self' }, count: 1 })) });

// 導航員艾莉絲：戰吼：若你的牌堆一開始有 10 張不同消耗的牌，製作一個自訂地點
reg('TLC_100', {
  abilities: play(fn('coElise')),
  tokens: ['TLC_100t1', 'TLC_100t2', 'TLC_100t3', ...[1, 2, 3].flatMap((t) => [1, 2, 3, 4, 5, 6, 7].map((n) => `TLC_100t${t}${n}`)), 'TLC_101t'],
});
for (const t of [1, 2, 3]) {
  reg(`TLC_100t${t}`, { target: undefined });
  for (const n of [1, 2, 3, 4, 5, 6, 7]) reg(`TLC_100t${t}${n}`, {});
}
reg('TLC_101t', { keywords: ['RUSH'] });
// 托爾加：戰吼：抽一張血緣牌與另一張可以觸發它的牌
reg('TLC_102', { abilities: play(fn('coTorga')) });
// 終結者安布拉：戰吼：觸發 5 個本場對戰中死亡的友方手下的亡語
reg('TLC_106', { abilities: play(fn('coUmbra')) });
// 風暴釀造師：每當此手下攻擊，先對目標造成 3 點傷害。血緣：獲得突襲
reg('TLC_107', { abilities: [...play(kin(selfBuffKw('RUSH'))), { on: { k: 'attack', subject: 'self' }, effects: [fn('coStormbrewer')] }] });
// 遺物礦工：戰吼：摧毀你牌堆頂的牌，發現一張相同稀有度的牌
reg('TLC_109', { abilities: play(fn('coRelicMiner')) });
// 城市首領艾修：戰吼：若你牌堆中的手下共享一個種族，使你其他的手下 +2/+2（無論在哪裡）
reg('TLC_110', { abilities: play(fn('coEsho')) });
// 熾熱群蟲：造成 $3 點傷害。召喚等量的 2/1 熾熱餘燼
reg('TLC_221', { target: anyChar, abilities: play(fn('coSwarm')), tokens: ['TLC_249'] });
// 火鷹之翼：抽兩張不同種族的手下，使其 +1/+1
reg('TLC_222', { abilities: play(fn('coFirehawk')) });
// 火山鞭尾龍：戰吼：抽一張火焰法術。血緣：使其具有法術傷害 +2
reg('TLC_223', { abilities: play(fn('coThrasher')) });
// 機械熔岩：每當你打出火焰法術，獲得等同其消耗的屬性值
reg('TLC_224', { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'SPELL' }, cond: { c: 'itFireSpell' }, effects: [fn('coMagma')] }] });
// 召喚的簿記員：亡語：抽一張法術牌。血緣：召喚一個此手下的複製
reg('TLC_226', { abilities: [...play(kin({ e: 'summonCopy', target: { t: 'self' }, count: 1 })), ...dr({ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL' } })] });
// 熔岩流：對生命值最低的敵人造成 $2 點傷害三次。超載：(1)
reg('TLC_227', { overload: 1, abilities: play(fn('coLava')) });
// 布拉瑪‧燒石：你的元素造成的傷害多 1 點
reg('TLC_228', { flags: ['bralma'] });
// 山岳之靈：任務：打出 6 個不同種族的手下。獎勵：阿夏隆
reg('TLC_229', { quest: { kind: 'uniqueTypes', goal: 6, reward: 'TLC_229t14' }, tokens: ['TLC_229t14'] });
reg('TLC_229t14', { keywords: ['RUSH'], abilities: play(fn('coAshalon')) });
// 樹人！！！：選擇一個手下。召喚四個 2/2 的樹人攻擊它
reg('TLC_230', { target: anyMinion, abilities: play(fn('coTrees')), tokens: ['TLC_230t'] });
// 巴納巴斯的故事：抽一個手下。若它的攻擊力至少為 5，使其 +5 生命值並獲得 5 點護甲
reg('TLC_231', { abilities: play(fn('coBarnabus')) });
// 貪婪鳥群：在你的下個回合開始時，召喚三隻 2/1 的雛鳥
reg('TLC_232', { abilities: play({ e: 'delayed', turns: 1, effects: [summon('TLC_237t', 3)] }), tokens: ['TLC_237t'] });
// 孵化場幫手：戰吼：使你其他攻擊力不高於 2 的手下 +1/+1 並獲得嘲諷
reg('TLC_233', { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true, maxAttack: 2 } }, atk: 1, hp: 1, keywords: ['TAUNT'] }) });
// 永恆血瓣花：亡語：召喚一個 0/1 的永恆幼苗
reg('TLC_234', { abilities: dr(summon('TLC_234t')), tokens: ['TLC_234t'] });
reg('TLC_234t', { abilities: dr(summon('TLC_234')) });
// 生命週期：消滅一個手下。召喚一個隨機的同消耗手下取代它
reg('TLC_235', { target: anyMinion, abilities: play(fn('coLifeCycle')) });
// 雜交：抽 1、2、3、4 費的手下各一張。血緣：它們的消耗減少 (1)
reg('TLC_236', { abilities: play(fn('coHybrid')) });
// 恢復野性：任務：在你的 3 個回合中填滿戰場。獎勵：永恆之花
reg('TLC_239', { quest: { kind: 'fillBoardTurns', goal: 3, reward: 'TLC_239t' }, tokens: ['TLC_239t'] });
reg('TLC_239t', { abilities: heroHit([{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 2, hp: 2 }]) });
// 暴君鰓：突襲。亡語：召喚三隻 2/1 的魚人，各自獲得一個隨機額外效果
reg('TLC_240', { keywords: ['RUSH'], abilities: dr(fn('coTyrannogill')), tokens: ['TLC_240t', 'TLC_240t2', 'TLC_240t3'] });
// 蘇斯弗隊的伊多：當它存活時，你會獲得「呼喚蘇斯艦隊！」
reg('TLC_241', { abilities: [...whenSummoned(fn('coThreshfleet')), ...atStartOfTurn(fn('coThreshfleet'))], tokens: ['TLC_241t'] });
reg('TLC_241t', { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2, keywords: ['DIVINE_SHIELD'] }) });
// 古代劍龍 / 古代迅猛龍 / 古代翼手龍：戰吼：選擇一個能力
reg('TLC_242', { abilities: play(fn('coChooseAdapt', { opts: ['UNG_999t6', 'UNG_999t13', 'UNG_999t14'] })) });
reg('TLC_245', { abilities: play(fn('coChooseAdapt', { opts: ['UNG_999t3', 'UNG_999t8', 'UNG_999t2'] })), tokens: ['UNG_999t2t1'] });
reg('TLC_246', { abilities: play(fn('coChooseAdapt', { opts: ['UNG_999t10', 'UNG_999t5', 'UNG_999t7'] })) });
// 旋風風暴龍：突襲、風怒。血緣：本回合免疫
reg('TLC_243', { keywords: ['RUSH', 'WINDFURY'], abilities: play(kin({ e: 'buff', target: { t: 'self' }, keywords: ['IMMUNE'], temp: true })) });
// 好奇的探險者：亡語：使你對手手牌中的一個手下消耗減少 (2)
reg('TLC_244', { abilities: dr(fn('coExplorer')) });
// 原始劍齒虎：潛行。在此手下攻擊並消滅一個手下後，獲得它的一張複製
reg('TLC_247', { keywords: ['STEALTH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('coSabretooth')] }] });
// 鱷魚：戰吼：直到你的下個回合開始，敵方英雄無法被治療
reg('TLC_250', { abilities: play(fn('coCrater')) });
// 原始魚人挑戰者：戰吼：你的下一個血緣會觸發兩次
reg('TLC_251', { abilities: play(fn('coKindredTwice')) });
// 溶解軟泥怪：戰吼：消滅一個友方手下。將它的攻擊力與生命值化為骨頭加入你的手牌
reg('TLC_252', { target: friendlyMinion, abilities: play(fn('coOoze')), tokens: ['TLC_829t'] });
reg('TLC_829t', { target: anyMinion, abilities: play(fn('coBones')) });
// 石化食人魔：以休眠開始。休眠時，在你的回合開始時 +2/+2（有 50% 的機率改為甦醒）
reg('TLC_253', { flags: ['petrified'], abilities: whenSummoned(fn('coDormantStart')) });
// 陸龜說書人：在你的回合結束時，使每種不同種族的友方手下 +1/+1
reg('TLC_254', { abilities: atEndOfTurn(fn('coStoryteller')) });
// 水晶培育者：可交易。戰吼：獲得空的法力水晶，直到雙方法力相同
reg('TLC_255', { keywords: ['TRADEABLE'], abilities: play(fn('coTender')) });
// 洛，活傳奇：戰吼：本場對戰中你的手下消耗為 (5)
reg('TLC_257', { abilities: play(fn('coLoh')) });

// ============================================================== 第二批：TLC_3xx ~ TLC_6xx
// 眾王遺物：發現一個消耗 (8) 以上的任何職業法術，它的消耗為 (1)
reg('TLC_334', { abilities: play(fn('coDiscoverSet', { pool: { type: 'SPELL', minCost: 8, anyClass: true }, set: 1 })) });
// 傳送門的故事：使你手牌中並非一開始就在牌堆中的牌消耗減少 (1)
reg('TLC_364', { abilities: play(fn('coWaygate')) });
// 倉庫爭奪：對一個手下造成 $3 點傷害。若你本回合發現過牌，消耗為 (0)
reg('TLC_365', { target: anyMinion, costIf: { cond: { c: 'discoveredThisTurn' }, cost: 0 }, abilities: play(hit(3)) });
// 翼龍掠奪者：突襲。血緣：消耗減少 (2)
reg('TLC_366', { keywords: ['RUSH'], costIf: { cond: { c: 'kindred' }, cost: 4 } });
// 潛入戈拉卡深淵：可重複任務：召喚 6 個魚人。獎勵：你召喚的魚人獲得 +1/+1
reg('TLC_426', { quest: { kind: 'murlocSummon', goal: 6, reward: 'murlocBuff', repeatable: true } });
// 岩石跳躍者：戰吼：獲得一張 1 費、造成 $3 點傷害的岩石
reg('TLC_427', { abilities: play(addCard('TLC_T_ROCK')) });
// 溫泉滑翔者：戰吼：你的下一個魚人消耗減少 (1)。血緣：並獲得聖盾
reg('TLC_428', { abilities: play(fn('coGlider')) });
// 蒸汽鰭盜賊：血緣：召喚兩個具有突襲的 1/1 魚人
reg('TLC_429', { abilities: play(kin(summon('TLC_429t', 2))), tokens: ['TLC_429t'] });
reg('TLC_429t', { keywords: ['RUSH'] });
// 神聖洞穴的生物：在你的回合結束時，重新施放一個本回合你施放的神聖法術
reg('TLC_430', { abilities: atEndOfTurn(fn('coRecast')) });
// 驚懼迅猛龍：戰吼：抽一個消耗 (3) 以下的亡語手下。血緣：它的消耗為 (0)
reg('TLC_432', { abilities: play(fn('coDreadRaptor')) });
// 復活恐懼：任務：花費 15 具屍體。獎勵：提拉克斯，白骨恐懼
reg('TLC_433', { quest: { kind: 'corpsesSpent', goal: 15, reward: 'TLC_433t' }, tokens: ['TLC_433t'] });
reg('TLC_433t', { abilities: dr(fn('coOpenGrave')), tokens: ['TLC_433t2'] });
reg('TLC_433t2', { target: anyChar, abilities: [...play(hit(4, false)), ...dr(summon('TLC_433t'))] });
// 地圖：發現並（本回合打出時）再選擇一張其他選項
reg('TLC_435', { abilities: play(fn('coMap', { pool: { type: 'MINION', rune: 'frost' } })) });
reg('TLC_442', { abilities: play(fn('coMap', { pool: { type: 'MINION', race: 'MURLOC' } })) });
reg('TLC_464', { abilities: play(fn('coMap', { mode: 'unplayedType' })) });
reg('TLC_515', { abilities: play(fn('coMap', { mode: 'deck' })) });
reg('TLC_824', { abilities: play(fn('coMap', { mode: 'oddBeast' })) });
reg('TLC_900', { abilities: play(fn('coMap', { pool: { type: 'SPELL', spellSchool: 'FEL' } })) });
// 紫羅蘭寶藏鰓：戰吼：施放你牌堆中一個消耗 (2) 以下的隨機法術
reg('TLC_438', { abilities: play(fn('coCastDeckCheap')) });
// 冷凍睡眠：造成 $4 點傷害並抽一張牌。血緣：再抽一張
reg('TLC_440', { target: anyChar, abilities: play(hit(4), draw(1), kin(draw(1))) });
// 整備艦隊：使一個友方手下 +1/+2，以及你其他與它同種族的手下
reg('TLC_441', { target: friendlyMinion, abilities: play(fn('coFleet')) });
// 不情願的牧人：復生。亡語：召喚一個 2/2 的不死野獸（嘲諷）
reg('TLC_443', { keywords: ['REBORN'], abilities: dr(summon('TLC_443t')), tokens: ['TLC_443t'] });
reg('TLC_443t', { keywords: ['TAUNT'] });
// 加爾瓦頓的故事：使一個手下獲得三個隨機額外效果
reg('TLC_444', { target: anyMinion, abilities: play(fn('coBonus', { target: 'chosen', n: 3 })) });
// 逃離魔鬼深淵：任務：打出 6 張暫時的牌。獎勵：魔鬼裂隙
reg('TLC_446', { quest: { kind: 'temporaryPlayed', goal: 6, reward: 'TLC_446t' }, tokens: ['TLC_446t'] });
reg('TLC_446t', { abilities: play(fn('coOpenRift')), tokens: ['TLC_446t1', 'TLC_446t2', 'TLC_446t3', 'TLC_446t4'] });
reg('TLC_446t1', { flags: ['rift'], abilities: play(fn('coRift')) });
reg('TLC_446t2', { keywords: ['RUSH', 'LIFESTEAL'] });
reg('TLC_446t3', { keywords: ['CHARGE', 'ELUSIVE'] });
reg('TLC_446t4', { keywords: ['TAUNT', 'REBORN'] });
// 腐蝕煙霧：消滅一個敵方手下。血緣：對所有手下造成 $2 點傷害
reg('TLC_447', { target: enemyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, kin({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 2, spell: true })) });
// 地鼠：你的下一張暫時的牌消耗減少 (2)
reg('TLC_450', { abilities: play({ e: 'pendingDiscount', d: { amount: 2, temporary: true } }) });
// 詛咒地下墓穴：發現牌堆中的另一張牌，使其變成暫時的
reg('TLC_451', { abilities: play(fn('coDeckTemp')) });
// 泰坦繪圖師歐斯克：每回合獲得不同的泰坦能力
reg('TLC_452', {
  flags: ['osk'],
  tokens: [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35].map((n) => `TLC_452t${n}`),
});
const osk = (n: number | string, ov: Override) => reg(`TLC_452t${n}`, { flags: ['osk'], ...ov });
// 泰坦能力：戰吼：消滅一個敵方手下，此手下與你的英雄獲得它的生命值
osk(1, { target: optional(enemyMinion), abilities: play(fn('coOskDestroy')) });
osk(2, { abilities: play({ e: 'pendingDiscount', d: { amount: 3, type: 'SPELL' } }, fn('coNextSpellPower', { n: 3 })) });
osk(3, { abilities: play(summon('TLC_T_UNDEAD', 2)) });
osk(4, { abilities: play(fn('coDiscoverSet', { pool: { type: 'MINION', hasDeathrattle: true }, reduce: 3 })) });
osk(5, { abilities: play(fn('coHandCost', { n: 2 })) });
osk(6, { abilities: play(summon('TLC_T_ELEM', 4)) });
osk(7, { abilities: play(fn('drawUntil', { n: 10, current: true })) });
osk(8, { abilities: play({ e: 'fullHeal', target: { t: 'hero', side: 'friendly' } }) });
osk(9, { abilities: play({ e: 'mana', kind: 'refresh', amount: 10 }) });
osk(13, { target: optional(anyChar), abilities: play(hit(5, false)) });
osk(14, { abilities: play(fn('coCastMageSecret')) });
osk(15, { abilities: play(fn('coOskTax')) });
osk(16, { abilities: play({ e: 'setStats', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, atk: 2, hp: 2 }) });
osk(17, { abilities: play({ e: 'buff', target: allFriendlyOthers, atk: 2, hp: 2 }) });
osk(18, { abilities: play(fn('coOskDraw2')) });
osk(19, { target: optional(anyMinion), abilities: play(fn('coOskCopy')) });
osk(20, { abilities: play(fn('coOskSummon6')) });
osk(21, { abilities: play(fn('coOskRemove')) });
osk(22, { abilities: play({ e: 'buff', target: { t: 'self' }, atk: 2, hp: 1 }, { e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 4 }) });
osk(23, { abilities: play({ e: 'buff', target: { t: 'self' }, atk: 1, hp: 2 }, draw(1)) });
osk(24, { abilities: play({ e: 'buff', target: { t: 'self' }, hp: 3, keywords: ['ELUSIVE'] }) });
osk(26, { target: optional({ filter: { type: 'minion', side: 'any', excludeSelf: true } }), abilities: play(hit(20, false)) });
osk(27, { abilities: play(fn('coOskBlast')) });
osk(28, { abilities: play(summon('EX1_tk34', 2)), tokens: ['EX1_tk34'] });
osk(29, { abilities: play(fn('coNether2')) });
osk(30, { abilities: play({ e: 'buff', target: { t: 'self' }, hp: 5 }, { e: 'armor', amount: 5 }) });
osk(31, { abilities: play({ e: 'buff', target: { t: 'self' }, atk: 5 }, { e: 'heroAttack', amount: 5 }) });
osk(32, { abilities: play({ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }, { e: 'draw', count: 1, who: 'self', pool: { type: 'WEAPON' } }) });
osk(33, { abilities: play(fn('coOskTendril')) });
osk(34, { abilities: play(fn('coOskForce')) });
osk(35, { target: optional(enemyMinion), abilities: play({ e: 'steal', target: { t: 'chosen' } }) });
// 鱗皮科多獸：戰吼：消滅攻擊力最低的敵方手下。血緣：改為最高
reg('TLC_454', { abilities: play(fn('coKodo')) });
// 禁忌序列：任務：發現 8 張牌。獎勵：起源之石
reg('TLC_460', { quest: { kind: 'discover', goal: 8, reward: 'TLC_460t' }, tokens: ['TLC_460t'] });
reg('TLC_460t', {});
// 拾荒者：戰吼：發現一張消耗等同於你剩餘法力水晶的牌
reg('TLC_461', { abilities: play(fn('coDiscoverCostEq')) });
// 出土的文物：召喚一個隨機的 2 費手下。若你本回合發現過牌，改為 4 費
reg('TLC_462', {
  abilities: play(cond({ c: 'discoveredThisTurn' }, [{ e: 'summonRandom', pool: { type: 'MINION', cost: 4, anyClass: true }, count: 1, who: 'self' }], [{ e: 'summonRandom', pool: { type: 'MINION', cost: 2, anyClass: true }, count: 1, who: 'self' }])),
});
// 拉茲迪爾：戰吼：隨機棄掉你的一張手牌。血緣：改為對手的手牌
reg('TLC_463', { abilities: play(fn('coRazidir')) });
// 絞殺藤：亡語：使一個隨機友方手下獲得一個隨機額外效果與此亡語
reg('TLC_465', { abilities: dr(fn('coStranglevine')) });
// 拉卡里的故事：在你的回合結束時，棄掉一張牌並用 3/2 的小鬼填滿你的戰場。持續 3 個回合
reg('TLC_466', { objective: 3, abilities: [...play(fn('objective')), ...atEndOfTurn(fn('coLakkari'))] });
// 低語之石：嘲諷。亡語：獲得 2 張邪能法術，消耗生命值而非法力
reg('TLC_467', { keywords: ['TAUNT'], abilities: dr(fn('coStone')) });
// 焦油團：劇毒、嘲諷。亡語：召喚一個具有劇毒的 2/2 與一個具有嘲諷的 2/2
reg('TLC_468', { keywords: ['POISONOUS', 'TAUNT'], abilities: dr(summon('TLC_468t1'), summon('TLC_468t2')), tokens: ['TLC_468t1', 'TLC_468t2'] });
reg('TLC_468t1', { keywords: ['POISONOUS'] });
reg('TLC_468t2', { keywords: ['TAUNT'] });
// 隧道恐懼者：亡語：獲得兩個暫時的 2 費隨機手下
reg('TLC_469', { abilities: dr(fn('coTunnel')) });
// 蘇斯騎士的祝福：使一個友方手下 +4/+4 與「亡語：召喚一個隨機 4 費手下」
reg('TLC_477', {
  target: friendlyMinion,
  abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 4, hp: 4, abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', cost: 4, anyClass: true }, count: 1, who: 'self' }) }),
});
// 克羅格，火山口之王：在你的回合結束時，將所有敵方手下的屬性值設為 1
reg('TLC_480', { abilities: atEndOfTurn({ e: 'setStats', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, atk: 1, hp: 1 }) });
// 渣爪：戰吼：召喚兩個 2/1 熾熱餘燼。血緣：觸發你的熾熱餘燼的亡語
reg('TLC_482', { abilities: play(summon('TLC_249', 2), fn('coCinders')), tokens: ['TLC_249'] });
// 保險庫破壞者：在你發現一張牌後，它的消耗減少 (1)
reg('TLC_483', { flags: ['vaultBreaker'] });
// 潛伏等待：任務：洗入牌堆 5 次。獎勵：黃昏大師
reg('TLC_513', { quest: { kind: 'shuffle', goal: 5, reward: 'TLC_513t' }, tokens: ['TLC_513t'] });
reg('TLC_513t', { abilities: play(summon('TLC_513t2', 2), fn('coNinjas')), heroPower: { effects: [fn('coWay')] }, tokens: ['TLC_513t2'] });
reg('TLC_513t2', { summonedWhenDrawn: true, keywords: ['STEALTH'] });
// 傳奇商人：戰吼：發現一個傳說手下，將另外兩個洗入你的牌堆
reg('TLC_514', { abilities: play(fn('coMerchantLegend')) });
// 內弗賽特武器匠：戰吼：獲得一把其他職業的隨機武器。連擊：使其 +2 攻擊力
reg('TLC_516', { abilities: play(fn('coWeaponsmith')) });
// 反擊：對一個手下造成傷害（你每洗過一次牌就提高）
reg('TLC_517', { target: anyMinion, abilities: play(fn('coKnockback')) });
// 審問：將三個具有潛行的 3/3 忍者洗入你的牌堆，抽到時召喚
reg('TLC_518', { abilities: play({ e: 'shuffle', card: 'TLC_513t2', count: 3 }), tokens: ['TLC_513t2'] });
// 伏擊掠食者：召喚一個 1/1 具有潛行與劇毒的噴毒者。血緣：再來一次
reg('TLC_519', { abilities: play(summon('TLC_519t'), kin(summon('TLC_519t'))), tokens: ['TLC_519t'] });
reg('TLC_519t', { keywords: ['STEALTH', 'POISONOUS'] });
// 灌木叢追蹤者：突襲。你本場對戰每洗過一次牌，消耗減少 (1)
reg('TLC_520', { keywords: ['RUSH'], costRule: { per: 'shuffleCount', amount: 1 } });
// 天空之眼：戰吼：查看對手牌堆中的 3 張牌，選擇一張放到牌堆頂
reg('TLC_521', { abilities: play(fn('coEyes')) });
// 隱形的奧普：潛行。戰吼、連擊與亡語：施放『刀扇』
reg('TLC_522', { keywords: ['STEALTH'], abilities: [...play(fn('coFan')), ...dr(fn('coFan'))] });
// 風峰飛龍：戰吼：造成 5 點傷害並獲得 5 點護甲。血緣：消耗減少 (2)
reg('TLC_600', { target: anyChar, costIf: { cond: { c: 'kindred' }, cost: 6 }, abilities: play(hit(5, false), { e: 'armor', amount: 5 }) });
// 貝殼風暴：花費最多 5 點護甲，每花費 1 點對所有手下造成 $1 點傷害
reg('TLC_601', { abilities: play(fn('coShellnado')) });
// 進入失落之城：任務：存活 10 個回合。獎勵：拉托維斯，城市之凝視
reg('TLC_602', { quest: { kind: 'surviveTurns', goal: 10, reward: 'TLC_602t' }, tokens: ['TLC_602t'] });
reg('TLC_602t', { abilities: play(fn('coLatorvius')), tokens: ['TLC_229t14', 'TLC_239t', 'TLC_433t', 'TLC_513t', 'TLC_631t', 'TLC_830t', 'TLC_460t', 'TLC_446t'] });
// 扁平龍：戰吼：抽一張牌。亡語：棄掉它
reg('TLC_603', { abilities: [...play(fn('coPlatysaur')), ...dr(fn('coPlatysaurDr'))] });
// 焦油暴君：嘲諷、生命竊取。在你對手的回合 +6 攻擊力
reg('TLC_605', { keywords: ['TAUNT', 'LIFESTEAL'], flags: ['tarTyrant'] });
// 決心的守望者：嘲諷。亡語：摧毀你牌堆頂的 3 張牌
reg('TLC_621', { keywords: ['TAUNT'], abilities: dr(fn('coMillTop', { n: 3 })) });
// 城市防禦：召喚兩個 0/6 的嘲諷守衛，受傷時 +1 攻擊力
reg('TLC_622', { abilities: play(summon('TLC_622t', 2)), tokens: ['TLC_622t'] });
reg('TLC_622t', { keywords: ['TAUNT'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 1 }] }] });
// 石雕師：在你的回合結束時，使另一個受傷的友方手下 +2/+2
reg('TLC_623', { abilities: atEndOfTurn({ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly', excludeSelf: true, damaged: true }, count: 1 }, atk: 2, hp: 2 }) });
// 守望者娜布莉亞：戰吼：召喚你受傷手下的複製，使其具有突襲
reg('TLC_624', { abilities: play(fn('coNablya')) });
// 戈里希黃蜂：突襲。每當此手下受到傷害，獲得一張 1 費的戈里希毒刺
reg('TLC_630', { keywords: ['RUSH'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [addCard('TLC_630t')] }], tokens: ['TLC_630t'] });
reg('TLC_630t', { target: anyChar, abilities: play(hit(2), summon('TLC_903t')), tokens: ['TLC_903t'] });
reg('TLC_903t', { keywords: ['RUSH'] });
// 釋放巨像：任務：在你的回合對敵人造成剛好 2 點傷害 12 次。獎勵：戈里希巨像
reg('TLC_631', { quest: { kind: 'exactDamage', goal: 12, reward: 'TLC_631t' }, tokens: ['TLC_631t'] });
reg('TLC_631t', { abilities: play(fn('coGorishi')) });
// 蘇拉斯的故事：將你的英雄能力換成「對一個隨機敵人造成 8 點傷害」，用兩次後換回
reg('TLC_632', { abilities: play(fn('coSulfuras')) });
// 蟲蟲殺手：戰吼：對一個具有種族的敵方手下造成 6 點傷害
reg('TLC_633', { target: optional({ filter: { type: 'minion', side: 'enemy', hasRace: true } }), abilities: play(hit(6, false)) });

// ============================================================== 第三批：TLC_8xx ~ TLC_9xx
// 大祭司赫倫：戰吼：從你的牌堆召喚兩個亡語手下，讓它們戰鬥！
reg('TLC_810', { abilities: play(fn('coHerenn')) });
// 阿卡奧斯：每當另一個友方手下攻擊，將它的生命值設為此手下的生命值
reg('TLC_811', { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion' }, effects: [fn('coArchaios')] }] });
// 暮光治療師：亡語：獲得一張隨機神聖法術與一張隨機暗影法術
reg('TLC_814', {
  abilities: dr({ e: 'addRandom', pool: { type: 'SPELL', spellSchool: 'HOLY', anyClass: true }, count: 1, who: 'self' }, { e: 'addRandom', pool: { type: 'SPELL', spellSchool: 'SHADOW', anyClass: true }, count: 1, who: 'self' }),
});
// 墓地虛空球莖：召喚一個隨機 4 費手下並使其獲得嘲諷。血緣：再來一次
reg('TLC_815', { abilities: play(fn('coVoidbulb')) });
// 墓地陽光花：抽兩張牌。血緣：消耗減少 (2)
reg('TLC_816', { costIf: { cond: { c: 'kindred' }, cost: 2 }, abilities: play(draw(2)) });
// 達成平衡：任務：施放 4 個神聖法術（獎勵：生命之息）；任務：施放 4 個暗影法術（獎勵：死亡之觸）
reg('TLC_817', { quest: { kind: 'holySpells', goal: 4, reward: 'TLC_817t3' }, quest2: 'TLC_817t2', tokens: ['TLC_817t', 'TLC_817t2', 'TLC_817t3', 'TLC_817t4', 'TLC_817t5'] });
reg('TLC_817t', { quest: { kind: 'holySpells', goal: 4, reward: 'TLC_817t3' } });
reg('TLC_817t2', { quest: { kind: 'shadowSpells', goal: 4, reward: 'TLC_817t4' } });
reg('TLC_817t3', { keywords: ['TAUNT'], abilities: play(fn('coSoletos')) });
reg('TLC_817t4', { keywords: ['REBORN'], abilities: [...play(fn('coSoletos')), ...dr({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 5 })] });
reg('TLC_817t5', { keywords: ['TAUNT', 'REBORN'], abilities: [...play(summon('TLC_817t5')), ...dr({ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 5 })] });
// 復甦：復活 1 費、2 費與 3 費的手下各一個，使其獲得復生
reg('TLC_818', { abilities: play(fn('coResuscitate')) });
// 林間歌聲海妖：生命竊取。若你本回合施放過神聖與暗影法術，消耗為 (1)
reg('TLC_819', { keywords: ['LIFESTEAL'], costIf: { cond: { c: 'castHolyAndShadow' }, cost: 1 } });
// 林間生態學家：亡語：獲得一張 1 費、使一個手下 +2 或 -2 生命值的神聖法術
reg('TLC_820', { abilities: dr(addCard('TLC_T_GLADE')) });
// 枯萎暗影：生命竊取。每當你治療一個敵人，此手下攻擊它
reg('TLC_821', { keywords: ['LIFESTEAL'], abilities: [{ on: { k: 'healed', subject: 'any' }, effects: [fn('coWilted')] }] });
// 恐龍保姆：在你的回合結束時，使你手牌中的一隻隨機野獸消耗減少 (1)
reg('TLC_822', { abilities: atEndOfTurn(fn('coDinositter')) });
// 畏縮：對一個手下造成 $3 點傷害。本回合你打出的下一隻野獸消耗減少 (2)
reg('TLC_823', { target: anyMinion, abilities: play(hit(3), { e: 'pendingDiscount', d: { amount: 2, race: 'BEAST', thisTurn: true } }) });
// 暴龍母皇：血緣：對一個敵方手下造成等同於此手下攻擊力的傷害
reg('TLC_825', { target: optional(enemyMinion), abilities: play(kin({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'selfAttack' } })) });
// 卡納莎的故事：將十隻 1 費的 3/2 迅猛龍（戰吼：抽一張牌）洗入你的牌堆
reg('TLC_826', { abilities: play({ e: 'shuffle', card: 'TLC_T_RAPTOR', count: 10 }) });
// 吃草劍龍：在你的回合結束時 +1 攻擊力（即使在手牌或牌堆中）
reg('TLC_827', { flags: ['grazing'] });
// 至尊恐龍術：使你手牌、牌堆與戰場上的所有野獸 +2/+2
reg('TLC_828', { abilities: play(fn('coDinomancy')) });
// 貪食暴龍：戰吼：消滅一個手下。血緣：獲得它的屬性值
reg('TLC_829', { target: anyMinion, abilities: play(fn('coDevilsaur')) });
// 食物鏈：任務：打出 1、3、5 與 7 攻擊力的野獸。獎勵：叢林暴君修克
reg('TLC_830', { quest: { kind: 'beastAttacks', goal: 4, reward: 'TLC_830t' }, tokens: ['TLC_830t'] });
reg('TLC_830t', { keywords: ['RUSH'], abilities: play(fn('coShokk')) });
// 翼龍蛋：亡語：召喚一隻 3/3 的翼龍，從所有其他手下偷取 1 點生命值
reg('TLC_831', { abilities: dr(fn('coPterrordax')), tokens: ['TLC_831t'] });
// 昆蟲之爪：在你的英雄攻擊後，召喚一個具有突襲的 2/1 幼蟲
reg('TLC_833', { abilities: heroHit([summon('TLC_903t')]), tokens: ['TLC_903t'] });
// 火山口的妮莉：每當你打出一個 1 費手下，使其屬性值翻倍。每當你施放 1 費法術，施放兩次
reg('TLC_836', { flags: ['niri'], abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [fn('coNiri')] }] });
// 昆蟲學家托魯：戰吼：把你手牌中的每個手下放進 0/1、消耗 (1) 的標本罐中。打破它們來釋放手下！
reg('TLC_841', { abilities: play(fn('coJarsStart')), tokens: ['TLC_841t'] });
reg('TLC_841t', { abilities: [...play(fn('coJarPlay')), ...dr(fn('coJarRelease'))] });
// 雲霄蛇：戰吼：獲得你手牌中另一個元素或龍的複製
reg('TLC_888', { abilities: play(fn('coCopyOther')) });
// 薰蒸：對一個手下及所有同種族的其他手下造成 $3 點傷害
reg('TLC_901', { target: anyMinion, abilities: play(fn('coFumigate')) });
// 蟲害：獲得兩張 1 費的戈里希毒刺
reg('TLC_902', { abilities: play(addCard('TLC_630t', 2)), tokens: ['TLC_630t'] });
// 異種蟲后：突襲。血緣：本回合使你的英雄 +5 攻擊力
reg('TLC_903', { keywords: ['RUSH'], abilities: play(kin({ e: 'heroAttack', amount: 5 })) });
// 任務助理：戰吼：若你本場對戰打出過任務，對一個敵方手下造成 3 點傷害
reg('TLC_987', { target: optional(enemyMinion), abilities: play(cond({ c: 'questPlayed' }, [hit(3, false)])) });
