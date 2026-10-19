// ============================================================================
// 暗影崛起（Rise of Shadows，DAL_，系列 1130）剩下的卡：陰謀、幫眾、炸彈、雙生法術……
// 解析器看不懂的卡在這裡手動定義；自訂效果（rs 開頭）在 game.ts 的 customShadows。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Amount, Condition, Effect, TargetReq } from '../engine/types';
import { LACKEYS, TREASURES } from './lists';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const lackey = (): Effect => fn('addOneOf', { cards: LACKEYS });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const otherFriendly: TargetReq = { filter: { type: 'minion', side: 'friendly', excludeSelf: true }, optional: true };
/** 陰謀：每個回合在手牌中升級（1 → 2 → 3…） */
const scheme: Amount = { dyn: 'handCounter', base: 1 };
const portal = (): Effect => ({ e: 'shuffle', card: 'DAL_582t', count: 3 });

export const SHADOWS_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 中立
  // 挑釁機器人：嘲諷。戰吼：你的對手從他的牌堆召喚一個手下
  DAL_058: { keywords: ['TAUNT'], abilities: play(fn('pdEntree')) },
  // 禦法珠寶匠：戰吼：直到你的下個回合，你的英雄具有法術免疫
  DAL_081: { abilities: play(fn('rsHeroElusive')) },
  // 嘍囉幫巫婆：戰吼：召喚兩個擁有所有手下類型的 1/1 聚合體
  DAL_087: { abilities: play(summon('DAL_087t', 2)), tokens: ['DAL_087t'] },
  DAL_087t: {},
  // 魔法書裝訂師：戰吼：若你有法術傷害，抽一張牌
  DAL_089: { abilities: play(cond({ c: 'spellDamage' }, [draw()])) },
  // 紫羅蘭魔劍士：戰吼：你手牌中每有一張法術，獲得 +1 攻擊力
  DAL_095: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'spellsInHand' } }) },
  // 邪惡陣線纜線鼠：戰吼：把一張幫眾加入你的手牌
  DAL_400: { abilities: play(lackey()), tokens: LACKEYS },
  // 秘法看守者：除非你有法術傷害，否則無法攻擊
  DAL_434: { attackIf: { c: 'spellDamage' } },
  // 隱獵團破壞者：戰吼：你的對手從手牌中隨機施放一張法術（目標隨機）
  DAL_538: { abilities: play(fn('rsSaboteur')) },
  // 奪日者戰爭法師：戰吼：若你的手牌中有消耗 (5) 以上的法術，造成 4 點傷害
  DAL_539: {
    target: { ...anyChar, optional: true, when: { c: 'holding', type: 'SPELL', minCost: 5 } },
    abilities: play(cond({ c: 'holding', type: 'SPELL', minCost: 5 }, [hit(4, false)])),
  },
  // 咖啡專家林森：戰吼：把你其他每個戰吼手下的複製加入你的手牌
  DAL_546: { abilities: play(fn('rsBarista')) },
  // 艾澤萊晶岩元素：在你的回合開始時，獲得法術傷害 +2
  DAL_548: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('rsGainSpellDamage', { amount: 2 })] }] },
  // 高傲的防禦者：嘲諷。在你沒有其他手下時 +2 攻擊力
  DAL_551: { keywords: ['TAUNT'], atkIf: { cond: { c: 'noOtherMinions' }, atk: 2, self: true } },
  // 大法師瓦戈斯：在你的回合結束時，施放一張你本回合施放過的法術（目標隨機）
  DAL_558: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('rsVargoth')] }] },
  // 大頭呆：突襲。在此手下攻擊並消滅一個手下後，它可以再次攻擊
  DAL_592: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('coGrunt')] }] },
  // 傳送門看守者 / 傳送門惡魔將領：戰吼：把 3 張傳送門洗入你的牌堆。抽到時召喚一個有突襲的 2/2 惡魔
  DAL_582: { abilities: play(portal()), tokens: ['DAL_582t'] },
  DAL_582t: { castsWhenDrawn: true, abilities: play(summon('DAL_582t2')), tokens: ['DAL_582t2'] },
  DAL_565: { abilities: play(portal()), tokens: ['DAL_582t'] },
  // 檔案管理者伊萊席娜：戰吼：發現 5 張卡。把你的牌堆換成它們各 2 張
  DAL_736: { abilities: play(fn('rsElysiana')) },
  // 旋風風暴：你有風怒的手下具有超級風怒
  DAL_742: { flags: ['megaWindfuryAura'] },
  // 無面狂怒者：戰吼：複製一個友方手下的生命值
  DAL_744: { target: otherFriendly, abilities: play(fn('rsCopyHealth')) },
  // 飛行管理員：戰吼：為每位玩家召喚一個 2/2 的獅鷲獸
  DAL_747: { abilities: play(summon('DAL_747t'), { e: 'summon', card: 'DAL_747t', count: 1, who: 'opponent' }), tokens: ['DAL_747t'] },
  // 累犯壞蛋：亡語：若此手下有 4 點以上的攻擊力，重新召喚它
  DAL_749: { abilities: dr(fn('rsRecurring')) },
  // 瘋狂召喚師：戰吼：用 1/1 的小鬼填滿每位玩家的戰場
  DAL_751: { abilities: play(fn('rsMadSummoner')), tokens: ['DAL_751t'] },
  // 杰佩托：戰吼：從你的牌堆抽 2 個手下。把它們的攻擊力、生命值與消耗變成 1
  DAL_752: { abilities: play(fn('rsJepetto')) },
  // 金幣戰士：每當此手下攻擊時，給你的對手一張幸運幣
  DAL_771: { abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [{ e: 'addCard', card: 'GAME_005', count: 1, who: 'opponent' }] }] },
  // 魔法飛毯：在你打出一個 1 費手下後，使它獲得 +1 攻擊力與突襲
  DAL_773: {
    abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itCost', n: 1 }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 1, keywords: ['RUSH'] }] }],
  },
  // ---------------------------------------------------------------- 德魯伊
  // 水晶之歌傳送門：發現一個德魯伊手下。若你的手牌沒有手下，改為全部保留
  DAL_352: { abilities: play(fn('aoKeepAll', { cls: 'DRUID', when: 'handNoMinions' })) },
  // 織命者：每當你恢復生命值，把一張隨機德魯伊法術加入你的手牌
  DAL_355: {
    abilities: [{ on: { k: 'healed', subject: 'any' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, effects: [{ e: 'addRandom', pool: { type: 'SPELL', cls: 'DRUID' }, count: 1, who: 'self' }] }],
  },
  // 盧森巴克：嘲諷。亡語：進入休眠。恢復 5 點生命值來喚醒此手下
  DAL_357: { keywords: ['TAUNT'], abilities: dr(summon('DAL_357t')), tokens: ['DAL_357t'] },
  DAL_357t: {
    keywords: ['DORMANT'],
    abilities: [{ on: { k: 'healed', subject: 'any' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, effects: [fn('rsLucentbark')] }],
  },
  // 看守者史達勒崔斯：在你施放一張二選一法術後，把兩個選項的複製各一張加入你的手牌
  DAL_732: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('rsStalladris')] }] },
  // 水晶雄鹿：突襲。戰吼：若你在本場對戰中恢復過 5 點生命值，召喚此手下的一個複製
  DAL_799: { keywords: ['RUSH'], abilities: play(cond({ c: 'healedThisGame', n: 5 }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },
  // ---------------------------------------------------------------- 獵人
  // 秘法造箭師：每當你打出一個 1 費手下，從你的牌堆抽一張法術
  DAL_372: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itCost', n: 1 }, effects: [{ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL' } }] }] },
  // 毀滅號：亡語：從你的手牌召喚一個機械，並觸發它的亡語
  DAL_376: { abilities: dr(fn('rsOblivitron')) },
  // 九命獸魂：發現一個本場對戰中死亡的友方亡語手下。並觸發它的亡語
  DAL_377: { abilities: play(fn('rsNineLives')) },
  // 凡蕾莎‧風行者：戰吼：裝備索瑞達爾，眾星之怒
  DAL_379: { abilities: play({ e: 'equip', card: 'DAL_379t' }), tokens: ['DAL_379t'] },
  // 索瑞達爾，眾星之怒：在你的英雄攻擊後，本回合獲得法術傷害 +2
  DAL_379t: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('rsSpellDamageTurn', { amount: 2 })] }] },
  // 狩獵隊伍：複製你手牌中所有的野獸
  DAL_589: { abilities: play(fn('rsHuntingParty')) },
  // ---------------------------------------------------------------- 法師
  // 咒術師的呼喚：雙生法術。消滅一個手下。召喚 2 個相同消耗的手下來取代它
  DAL_177: { keywords: ['TWINSPELL'], target: anyMinion, abilities: play(fn('rsConjurer')) },
  DAL_177ts: { target: anyMinion, abilities: play(fn('rsConjurer')) },
  // 祈倫托三修法師：法術傷害 +3。你的法術消耗增加 (1)
  DAL_576: { spellDamage: 3, costAuras: [{ side: 'friendly', type: 'SPELL', add: 1 }] },
  // 冰霜射線：雙生法術。凍結一個手下。若它已被凍結，對它造成 2 點傷害
  DAL_577: { keywords: ['TWINSPELL'], target: anyMinion, abilities: play(cond({ c: 'chosenFrozen' }, [hit(2)]), { e: 'freeze', target: { t: 'chosen' } }) },
  DAL_577ts: { target: anyMinion, abilities: play(cond({ c: 'chosenFrozen' }, [hit(2)]), { e: 'freeze', target: { t: 'chosen' } }) },
  // 法力颶風：戰吼：本回合你每施放過一張法術，就把一張隨機法師法術加入你的手牌
  DAL_603: { abilities: play({ e: 'repeat', times: { dyn: 'spellsThisTurnN' }, effects: [{ e: 'addRandom', pool: { type: 'SPELL', cls: 'MAGE' }, count: 1, who: 'self' }] }) },
  // ---------------------------------------------------------------- 聖騎士
  // 緊急應變：雙生法術。施放一個隨機聖騎士奧秘
  DAL_141: { keywords: ['TWINSPELL'], abilities: play(fn('randomSecret', { cls: 'PALADIN' })) },
  DAL_141ts: { abilities: play(fn('randomSecret', { cls: 'PALADIN' })) },
  // 指揮官萊莎：你的奧秘觸發兩次
  DAL_573: { flags: ['secretsTwice'] },
  // 冒險使命：從你的牌堆抽消耗最低的手下。使它獲得 +2/+2
  DAL_727: { abilities: play(fn('rsCallToAdventure')) },
  // 決鬥！：從每位玩家的牌堆召喚一個手下。它們互相戰鬥！
  DAL_731: { abilities: play(fn('rsDuel')) },
  // ---------------------------------------------------------------- 牧師
  // 幽暗身影：戰吼：變形成一個友方亡語手下的 2/2 複製
  DAL_030: { target: { filter: { type: 'minion', side: 'friendly', excludeSelf: true, hasDeathrattle: true }, optional: true }, abilities: play(fn('becomeCopy', { atk: 2, hp: 2 })) },
  // 拉祖爾的陰謀：使一個敵方手下的攻擊力減少 @ 點，直到你的下個回合（每回合升級）
  DAL_011: { handGrow: true, target: enemyMinion, abilities: play(fn('rsLazul')) },
  // 邪惡陣線徵召者：亡語：把一張幫眾加入你的手牌
  DAL_413: { abilities: dr(lackey()), tokens: LACKEYS },
  // 禁咒之語：花光你的法力。消滅一個攻擊力不高於花費法力的手下
  DAL_723: { target: anyMinion, abilities: play(fn('rsForbiddenWords')) },
  // 群體復活：召喚 3 個本場對戰中死亡的友方手下
  DAL_724: { abilities: play(fn('coSummonDead', { count: 3 })) },
  // ---------------------------------------------------------------- 盜賊
  // 托戈瓦哥的陰謀：選擇一個手下。把它的 @ 張複製洗入你的牌堆（每回合升級）
  DAL_010: { handGrow: true, target: anyMinion, abilities: play({ e: 'repeat', times: scheme, effects: [{ e: 'shuffleCopy', target: { t: 'chosen' }, count: 1 }] }) },
  // 未鑑定的契約：消滅一個手下。在你的手牌中獲得額外效果
  DAL_366: {
    target: anyMinion,
    abilities: [...play({ e: 'destroy', target: { t: 'chosen' } }), { on: { k: 'drawn' }, effects: [fn('identify', { cards: ['DAL_366t1', 'DAL_366t2', 'DAL_366t3', 'DAL_366t4'] })] }],
    tokens: ['DAL_366t1', 'DAL_366t2', 'DAL_366t3', 'DAL_366t4'],
  },
  DAL_366t1: { target: anyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, summon('EX1_522')), tokens: ['EX1_522'] },
  DAL_366t2: { target: anyMinion, abilities: play(fn('rsRecruitmentContract')) },
  DAL_366t3: { target: anyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, { e: 'addCard', card: 'GAME_005', count: 2, who: 'self' }) },
  DAL_366t4: { target: anyMinion, abilities: play(fn('rsTurncoat')) },
  // 邪惡陣線無賴：連擊：把兩張隨機幫眾加入你的手牌
  DAL_415: { abilities: play(cond({ c: 'combo' }, [lackey(), lackey()])), tokens: LACKEYS },
  // 劫匪大亨托戈瓦哥：戰吼：若你控制一個幫眾，選擇一個驚人的寶藏
  DAL_417: { abilities: play(cond({ c: 'control', nameIncludes: 'Lackey' }, [fn('rsTogwaggle')])), tokens: TREASURES },
  // 城底區贓物商人：戰吼：若你的手牌中有另一個職業的卡，獲得 +1/+1 與突襲
  DAL_714: { abilities: play(cond({ c: 'holdingOtherClass' }, [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 1, keywords: ['RUSH'] }])) },
  // 宿怨：對一個手下造成 4 點傷害。若你的手牌中有另一個職業的卡，消耗為 (0)
  DAL_716: { target: anyMinion, costIf: { cond: { c: 'holdingOtherClass' }, cost: 0 }, abilities: play(hit(4)) },
  // 塔克‧諾鬚：每當你把一張卡洗入你的牌堆，把它的一張複製加入你的手牌
  DAL_719: { flags: ['takNozwhisker'] },
  // ---------------------------------------------------------------- 薩滿
  // 哈嘉薩的陰謀：對所有手下造成 @ 點傷害（每回合升級）
  DAL_009: { handGrow: true, abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: scheme, spell: true }) },
  // 突變：把一個友方手下變形成消耗多 (1) 的隨機手下
  DAL_071: { target: friendlyMinion, abilities: play(fn('ogEvolve')) },
  // 沼澤女帝哈嘉薩：戰吼：把一個 5/5 的邪偶加入你的手牌。教它兩個薩滿法術
  DAL_431: { abilities: play(fn('rsHagatha')), tokens: ['DAL_431t'] },
  DAL_431t: { abilities: play(fn('rsDrustvarHorror')) },
  // 巫婆湯：恢復 4 點生命值。本回合可以重複施放
  DAL_432: { keywords: ['ECHO'], target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 4 }) },
  // 淤泥吸食者：戰吼：把一張幫眾加入你的手牌。超載：(1)
  DAL_433: { overload: 1, abilities: play(lackey()), tokens: LACKEYS },
  // 魚人之魂：賦予你的手下「亡語：召喚一個 1/1 的魚人」
  DAL_710: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, abilities: dr(summon('EX1_506a')) }), tokens: ['EX1_506a'] },
  // 疤鰓：你的魚人消耗為 (1)
  DAL_726: { costAuras: [{ side: 'friendly', race: 'MURLOC', set: 1 }] },
  // 淤泥怪變形者：戰吼：變形成你牌堆中另一個手下的 4/4 複製
  DAL_052: { abilities: play(fn('rsMuckmorpher')) },
  // ---------------------------------------------------------------- 術士
  // 拉法姆的陰謀：召喚 @ 個 1/1 的小鬼（每回合升級）
  DAL_007: { handGrow: true, abilities: play({ e: 'repeat', times: scheme, effects: [summon('DAL_751t')] }), tokens: ['DAL_751t'] },
  // 黑暗時刻：消滅所有友方手下。每消滅一個，從你的牌堆召喚一個隨機手下
  DAL_173: { abilities: play(fn('rsDarkestHour')) },
  // 亞蘭希族母：嘲諷。當你抽到這張牌時，為你的英雄恢復 4 點生命值
  DAL_185: { keywords: ['TAUNT'], abilities: [{ on: { k: 'drawn' }, effects: [{ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 4 }] }] },
  // 巨型小鬼：在你的手牌中時，每當一個友方惡魔死亡，消耗減少 (1)
  DAL_561: { handAbilities: [{ on: { k: 'minionDied', side: 'friendly', race: 'DEMON' }, effects: [fn('ogProphet')] }] },
  // 意外轉折：把你的手牌洗入你的牌堆。抽同樣數量的牌
  DAL_602: { abilities: play(fn('rsPlotTwist')) },
  // 邪惡陣線天才：戰吼：消滅一個友方手下，把 2 張隨機幫眾加入你的手牌
  DAL_606: { target: otherFriendly, abilities: play(fn('rsEvilGenius')), tokens: LACKEYS },
  // 惡魔領主貝楚格：每當你抽到一個手下，召喚一個有突襲、會在回合結束時死亡的複製
  DAL_607: { abilities: [{ on: { k: 'draw', side: 'friendly' }, cond: { c: 'itIsMinion' }, effects: [fn('rsBetrug')] }] },
  // ---------------------------------------------------------------- 戰士
  // 爆爆博士的陰謀：獲得 @ 點護甲值（每回合升級）
  DAL_008: { handGrow: true, abilities: play({ e: 'armor', amount: scheme }) },
  // 空間撕裂器：召喚你牌堆中一個手下的 2 個複製
  DAL_059: { abilities: play(fn('rsCopyFromDeck', { count: 2 })) },
  // 發條哥布林：戰吼：把一顆炸彈洗入你對手的牌堆。抽到時會爆炸造成 5 點傷害
  DAL_060: { abilities: play(fn('wzBombs', { count: 1 })), tokens: ['BOT_511t'] },
  // 橫掃攻擊：賦予一個手下「同時也會傷害被攻擊者相鄰的手下」
  DAL_062: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, keywords: ['CLEAVE'] }) },
  // 大工匠扳手：在你的英雄攻擊後，把一顆炸彈洗入你對手的牌堆
  DAL_063: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('wzBombs', { count: 1 })] }], tokens: ['BOT_511t'] },
  // 霹靂至尊爆爆博士：戰吼：你對手的牌堆中每有一顆炸彈，就召喚兩個 1/1 的爆爆機器人
  DAL_064: { abilities: play(fn('rsBlastmaster')), tokens: ['GVG_110t'] },
  // 爆爆劫奪者：戰吼：召喚你牌堆中一個手下的複製。使它獲得突襲
  DAL_070: { abilities: play(fn('rsCopyFromDeck', { count: 1, rush: true })) },
  // 兇惡的廢鐵犬：每當此手下造成傷害，獲得等量的護甲值
  DAL_759: { abilities: [{ on: { k: 'dealtDamage' }, effects: [{ e: 'armor', amount: { dyn: 'eventAmount' } }] }] },
  // 激勵士氣：對一個手下造成 1 點傷害。若它存活，把一張幫眾加入你的手牌
  DAL_769: { target: anyMinion, abilities: play(hit(1), fn('rsIfChosenSurvives', { effects: [lackey()] })), tokens: LACKEYS },
};
