// ============================================================================
// 外域灰燼（Ashes of Outland，BT_，系列 1414）剩下的卡：被囚禁的手下、至尊傳說、聖契……
// 解析器看不懂的卡在這裡手動定義；自訂效果（ao 開頭）在 game.ts 的 customOutland。
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
const shuffle = (card: string): Effect => ({ e: 'shuffle', card, count: 1 });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
/** 休眠 2 回合（被囚禁的手下）；甦醒時執行 awaken */
const imprisoned = (awaken?: Effect[], extra: Override = {}): Override => ({
  ...extra,
  abilities: [...(extra.abilities ?? []), { on: { k: 'summoned' }, effects: [fn('twDormantSelf', { turns: 2 })] }],
  ...(awaken ? { awaken } : {}),
});
/** 在攻擊並消滅一個手下後 */
const afterKill = (...effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('ogIfKilled', { effects })] }];
const heroHit = (...effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];

export const OUTLAND_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 中立
  // 鏽誓新兵：亡語：召喚一個有法術傷害 +1 的 1/1 小鬼法師
  BT_008: { abilities: dr(summon('BT_008t')), tokens: ['BT_008t'] },
  // 泰朗‧血魔：戰吼：消滅其他友方手下。亡語：以 +1/+1 重新召喚它們
  BT_126: { abilities: [...play(fn('aoTeron')), ...dr(fn('aoTeronReturn'))] },
  // 鏽誓教徒：戰吼：賦予你的其他手下「亡語：召喚一個 1/1 惡魔」
  BT_160: {
    abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, abilities: dr(summon('BT_160t')) }),
    tokens: ['BT_160t'],
  },
  // 複製機器人：在你的回合結束時，把一個相鄰的手下變形成此手下的複製
  BT_190: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('aoReplicatotron')] }] },
  // 凱爾薩斯‧逐日者：你每回合施放的第三張法術消耗為 (1)
  BT_255: { costAuras: [{ side: 'friendly', type: 'SPELL', everyThird: true, set: 1 }] },
  // 掘地蠍：戰吼：造成 2 點傷害。若消滅了目標，獲得潛行
  BT_717: { target: optional(anyChar), abilities: play(fn('aoScorpid')) },
  // 猛怒腐泥怪：在你的回合結束時，召喚一個屬性值與此手下相同的腐泥怪
  BT_721: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('aoBlisteringRot')] }], tokens: ['BT_721t'] },
  // 以太強化商人：戰吼：對一個手下造成 1 點傷害，並使它獲得法術傷害 +1
  BT_724: { target: optional(anyMinion), abilities: play(hit(1, false), fn('aoAugment')) },
  // 縛魂的灰舌：每當此手下受到傷害，也對你的英雄造成等量傷害
  BT_727: { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: { dyn: 'eventAmount' } }] }] },
  // 荒土看守者：戰吼：對一個手下以及所有其他同類型的手下造成 3 點傷害
  BT_729: { target: optional(anyMinion), abilities: play(fn('aoWasteWarden')) },
  // 過度自信的獸人：嘲諷。生命值全滿時 +2 攻擊力
  BT_730: { keywords: ['TAUNT'], atkIf: { cond: { c: 'not', cond: { c: 'damaged' } }, atk: 2, self: true } },
  // 傳染性孢子：在此手下對一個手下造成傷害後，把它變形成傳染性孢子
  BT_731: { abilities: [{ on: { k: 'dealtDamage' }, effects: [fn('aoSporeling')] }] },
  // 莫阿格工藝師：所有手下受到的法術傷害加倍
  BT_733: { flags: ['moargArtificer'] },
  // 歐爾：亡語：召喚一個 0/3 的歐爾灰燼，它會在你的下個回合復活歐爾
  BT_735: { abilities: dr(summon('BT_735t')), tokens: ['BT_735t'] },
  BT_735t: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('aoAshesOfAlar')] }] },
  // 瑪翼夫‧影歌：戰吼：選擇一個手下。使它休眠 2 回合
  BT_737: { target: optional({ filter: { type: 'minion', side: 'any', excludeSelf: true } }), abilities: play(fn('wzRedCard', { turns: 2 })) },
  // 瑪瑟里頓：休眠。戰吼：召喚三個 1/3 的敵方看守者。當它們都死亡時，消滅所有手下並甦醒
  BT_850: {
    keywords: ['DORMANT'],
    abilities: [
      ...play(fn('aoMagtheridonWarders')),
      { on: { k: 'minionDied', side: 'enemy' }, cond: { c: 'itCard', id: 'BT_850t' }, effects: [fn('aoMagtheridon')] },
    ],
    tokens: ['BT_850t'],
  },
  // 地獄火看守者：（瑪瑟里頓會在 3 個看守者死亡後消滅所有手下並甦醒）
  BT_850t: {},
  // ---------------------------------------------------------------- 德魯伊
  // 被囚禁的薩特：甦醒時，使你手牌中一個隨機手下的消耗減少 (5)
  BT_127: imprisoned([fn('aoSatyr')]),
  // 好運菌菇：抽 3 張牌，棄掉抽到的手下
  BT_128: { abilities: play(fn('aoDrawDiscard', { type: 'MINION' })) },
  // 無性繁殖：召喚一個友方手下的複製，並使複製獲得嘲諷
  BT_129: { target: friendlyMinion, abilities: play(fn('aoGermination')) },
  // 伊斯歐‧風詠：戰吼：本回合你的法術消耗為 (1)
  BT_131: { abilities: play(fn('aoYsiel')) },
  // 鐵樹皮術：賦予一個手下 +1/+3 與嘲諷。若你有至少 7 個法力水晶，消耗為 (0)
  BT_132: {
    target: anyMinion,
    costIf: { cond: { c: 'maxMana', n: 7 }, cost: 0 },
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 3, keywords: ['TAUNT'] }),
  },
  // 螢火蟲群：你手牌中每有一張法術，就召喚一個 2/2 的螢火蟲
  BT_135: { abilities: play({ e: 'repeat', times: { dyn: 'spellsInHand' }, effects: [summon('BT_135t')] }), tokens: ['BT_135t'] },
  // 大孢子人米斯恩：嘲諷。亡語：把至尊米斯恩洗入你的牌堆
  BT_136: { keywords: ['TAUNT'], abilities: dr(shuffle('BT_136t')), tokens: ['BT_136t'] },
  // 至尊米斯恩：嘲諷。二選一：召喚一個有嘲諷的 9/9 真菌巨人；或有突襲的
  BT_136t: {
    keywords: ['TAUNT'],
    chooseOne: [
      { id: 'BT_136ta', name: '米斯恩保護', text: '召喚一個有<b>嘲諷</b>的9/9守護者', abilities: play(summon('BT_136tt')) },
      { id: 'BT_136tb', name: '米斯恩攻擊', text: '召喚一個有<b>衝刺</b>的9/9鬥士', abilities: play(summon('BT_136tt2')) },
    ],
    tokens: ['BT_136tt', 'BT_136tt2'],
  },
  // ---------------------------------------------------------------- 獵人
  // 納葛蘭衝擊：召喚四個 3/5 的裂蹄，它們會攻擊隨機敵人
  BT_163: { abilities: play(fn('aoNagrandSlam')), tokens: ['BT_163t'] },
  // 獸群戰術：奧秘：當一個友方手下被攻擊時，召喚它的 3/3 複製
  BT_203: { secret: true, abilities: [{ on: { k: 'secret', ev: 'minionAttacked' }, effects: [fn('aoPackTactics')] }] },
  // 被囚禁的魔顎：甦醒時，攻擊一個隨機敵人
  BT_211: imprisoned([fn('aoAttackRandom')]),
  // 摩克納薩爾之獅：突襲。戰吼：選擇一個友方手下。獲得它的亡語複製
  BT_212: { keywords: ['RUSH'], target: optional({ filter: { type: 'minion', side: 'friendly', excludeSelf: true } }), abilities: play(fn('copyDeathrattle')) },
  // 野獸大師李歐羅克斯：戰吼：從你的手牌召喚 3 隻野獸
  BT_214: { abilities: play(fn('summonFromHand', { race: 'BEAST', count: 3 })) },
  // ---------------------------------------------------------------- 法師
  // 咒法之流：使你牌堆中所有法術的消耗減少 (1)
  BT_002: { abilities: play(fn('aoDeckDiscount', { type: 'SPELL', amount: 1 })) },
  // 被囚禁的觀察者：甦醒時，對所有敵方手下造成 2 點傷害
  BT_004: imprisoned([{ e: 'damage', target: allEnemyMinions, amount: 2 }]),
  // 喚醒：用隨機法師法術填滿你的手牌，它們都是暫時的
  BT_006: { abilities: play(fn('aoEvocation')) },
  // 能量之泉：發現一個法師手下。若你的牌堆沒有手下，改為全部保留
  BT_021: { abilities: play(fn('aoKeepAll', { cls: 'MAGE', when: 'deckNoMinions' })) },
  // 頂尖走私者：在你打出一個奧秘後，發現一張法術
  BT_022: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'SPELL' }, cond: { c: 'itSecret' }, effects: [{ e: 'discover', pool: { type: 'SPELL' } }] }] },
  // 星術師索拉瑞恩：法術傷害 +1。亡語：把至尊索拉瑞恩洗入你的牌堆
  BT_028: { spellDamage: 1, abilities: dr(shuffle('BT_028t')), tokens: ['BT_028t'] },
  // 至尊索拉瑞恩：法術傷害 +1。戰吼：施放 5 個隨機法師法術（盡量指定敵人）
  BT_028t: { spellDamage: 1, abilities: play(fn('aoSolarianPrime')) },
  // 頂尖爆發：造成 5 點傷害。若你的牌堆沒有手下，召喚一個隨機 5 費手下
  BT_291: {
    target: anyChar,
    abilities: play(hit(5), cond({ c: 'deckNoMinions' }, [{ e: 'summonRandom', pool: { type: 'MINION', cost: 5 }, count: 1, who: 'self' }])),
  },
  // ---------------------------------------------------------------- 聖騎士
  // 被囚禁的陽鰓魚人：甦醒時，召喚兩個 1/1 的魚人
  BT_009: imprisoned([summon('BT_009t', 2)], { tokens: ['BT_009t'] }),
  // 正義聖契：裝備一把 1/4 的武器。把所有敵方手下的生命值變成 1
  BT_011: { abilities: play({ e: 'equip', card: 'BT_011t' }, { e: 'setStats', target: allEnemyMinions, hp: 1 }), tokens: ['BT_011t'] },
  // 奧多爾護從：戰吼：本場對戰中你的聖契消耗減少 (1)
  BT_020: { abilities: play(fn('gdLibramDiscount')) },
  // 希望聖契：恢復 8 點生命值。召喚一個有嘲諷與聖盾的 8/8 守護者
  BT_024: { target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 8 }, summon('BT_024t')), tokens: ['BT_024t'] },
  // 智慧聖契：賦予一個手下 +1/+1 與「亡語：把一張智慧聖契加入你的手牌」
  BT_025: {
    target: anyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1, abilities: dr({ e: 'addCard', card: 'BT_025', count: 1, who: 'self' }) }),
  },
  // 奧多爾真理追尋者：嘲諷。戰吼：本場對戰中你的聖契消耗減少 (2)
  BT_026: { keywords: ['TAUNT'], abilities: play(fn('gdLibramDiscount'), fn('gdLibramDiscount')) },
  // ---------------------------------------------------------------- 牧師
  // 靈魂聖匣：生命竊取。亡語：把至尊聖匣洗入你的牌堆
  BT_197: { keywords: ['LIFESTEAL'], abilities: dr(shuffle('BT_197t')), tokens: ['BT_197t'] },
  // 至尊聖匣：嘲諷、生命竊取。在對手的回合具有法術免疫
  BT_197t: { keywords: ['TAUNT', 'LIFESTEAL'], flags: ['elusiveOnOppTurn'] },
  // 靈魂之鏡：召喚敵方手下的複製。它們會攻擊自己的本尊
  BT_198: { abilities: play(fn('aoSoulMirror')) },
  // 塞司克織幕者：在你對一個手下施放法術後，把一張隨機牧師法術加入你的手牌
  BT_254: {
    abilities: [{ on: { k: 'spellCast', side: 'friendly' }, cond: { c: 'itIsMinion' }, effects: [{ e: 'addRandom', pool: { type: 'SPELL', cls: 'PRIEST' }, count: 1, who: 'self' }] }],
  },
  // 被囚禁的魔胎：休眠 2 回合。嘲諷
  BT_258: imprisoned(undefined, { keywords: ['TAUNT'] }),
  // ---------------------------------------------------------------- 盜賊
  // 偷天換日：奧秘：當你的一個手下被攻擊時，把它變形成消耗多 (3) 的隨機手下
  BT_042: { secret: true, abilities: [{ on: { k: 'secret', ev: 'minionAttacked' }, effects: [fn('aoBamboozle')] }] },
  // 灰舌屠殺者：戰吼：本回合使一個潛行的手下獲得 +3 攻擊力與免疫
  BT_702: {
    target: optional({ filter: { type: 'minion', side: 'friendly', keyword: 'STEALTH' } }),
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, keywords: ['IMMUNE'], temp: true }),
  },
  // 灰色之心賢者：戰吼：若你控制一個潛行的手下，抽 2 張牌
  BT_710: { abilities: play(cond({ c: 'control', keyword: 'STEALTH' }, [draw(2)])) },
  // 持棍擊昏者：戰吼：若你控制一個奧秘，把一個手下移回其擁有者的手牌，它的消耗增加 (2)
  BT_711: {
    target: { filter: { type: 'minion', side: 'any', excludeSelf: true }, optional: true, when: { c: 'secret' } },
    abilities: play(cond({ c: 'secret' }, [{ e: 'returnToHand', target: { t: 'chosen' }, costChange: 2 }])),
  },
  // 阿卡瑪：潛行。亡語：把至尊阿卡瑪洗入你的牌堆
  BT_713: { keywords: ['STEALTH'], abilities: dr(shuffle('BT_713t')), tokens: ['BT_713t'] },
  // 至尊阿卡瑪：永久潛行
  BT_713t: { keywords: ['STEALTH'], flags: ['permanentStealth'] },
  // ---------------------------------------------------------------- 薩滿
  // 鮮活孢子：賦予你的手下「亡語：重新召喚此手下」
  BT_101: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, abilities: dr(fn('cxResummon')) }) },
  // 泥沼脊椎指節：在你的英雄攻擊後，把你的手下變形成消耗多 (1) 的隨機手下
  BT_102: { abilities: heroHit(fn('ogEvolve', { all: true })) },
  // 泥沼史卓克響鉗龍蝦人：戰吼：把相鄰的手下變形成消耗多 (1) 的隨機手下
  BT_106: { abilities: play(fn('aoEvolveAdjacent')) },
  // 瓦許女士：法術傷害 +1。亡語：把至尊瓦許洗入你的牌堆
  BT_109: { spellDamage: 1, abilities: dr(shuffle('BT_109t')), tokens: ['BT_109t'] },
  // 至尊瓦許：法術傷害 +1。戰吼：抽 3 張法術，它們的消耗減少 (3)
  BT_109t: { spellDamage: 1, abilities: play(fn('aoDrawDiscount', { count: 3, type: 'SPELL', amount: 3 })) },
  // 激流：對一個手下造成 8 點傷害。若你上回合施放過法術，消耗減少 (3)
  BT_110: { target: anyMinion, costIf: { cond: { c: 'castSpellLastTurn' }, cost: 1 }, abilities: play(hit(8)) },
  // 破碎的奔行者：戰吼：若你上回合施放過法術，對所有其他手下造成 2 點傷害
  BT_114: {
    abilities: play(cond({ c: 'castSpellLastTurn' }, [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, amount: 2 }])),
  },
  // 海底潛伏者：戰吼：對一個敵方手下造成 3 點傷害。若它死亡，對它相鄰的一個手下重複此效果
  BT_230: { target: optional(enemyMinion), abilities: play(fn('aoLurker')) },
  // ---------------------------------------------------------------- 術士
  // 『破壞者』凱利丹：戰吼：消滅一個手下。若是本回合抽到的，改為消滅此手下以外的所有手下
  BT_196: { target: optional({ filter: { type: 'minion', side: 'any', excludeSelf: true } }), abilities: play(fn('aoKelidan')) },
  // 不穩定的魔火箭：對一個敵方手下與一個隨機友方手下造成 3 點傷害
  BT_199: {
    target: enemyMinion,
    abilities: play(hit(3), { e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'friendly' }, count: 1 }, amount: 3, spell: true }),
  },
  // 古爾丹之手：當你打出或棄掉這張牌時，抽 3 張牌
  BT_300: { abilities: [...play(draw(3)), { on: { k: 'discarded' }, effects: [draw(3)] }] },
  // 夜影之母：突襲。戰吼：棄掉你消耗最高的卡
  BT_301: { keywords: ['RUSH'], abilities: play(fn('discardHighest')) },
  // 黑暗之門：抽一個手下。若你的手牌有至少 8 張，它的消耗減少 (5)
  BT_302: { abilities: play(fn('aoDarkPortal')) },
  // 被囚禁的廢料小鬼：甦醒時，使你手牌中所有手下獲得 +2/+2
  BT_305: imprisoned([{ e: 'handBuff', atk: 2, hp: 2, scope: 'all' }]),
  // 暗影議會召喚儀式：把你的手牌換成隨機惡魔。使它們獲得 +2/+2
  BT_306: { abilities: play(fn('aoShadowCouncil')) },
  // 暗凝：戰吼：若你的英雄本回合受到過傷害，回復 3 個法力水晶
  BT_307: { abilities: play(cond({ c: 'heroDamagedThisTurn' }, [{ e: 'mana', kind: 'refresh', amount: 3 }])) },
  // 坎瑞薩德‧埃伯洛克：你的惡魔消耗減少 (1)。亡語：把至尊坎瑞薩德洗入你的牌堆
  BT_309: { costAuras: [{ side: 'friendly', race: 'DEMON', add: -1 }], abilities: dr(shuffle('BT_309t')), tokens: ['BT_309t'] },
  // 至尊坎瑞薩德：戰吼：召喚 3 個本場對戰中死亡的友方惡魔
  BT_309t: { abilities: play(fn('coSummonDead', { race: 'DEMON', count: 3 })) },
  // ---------------------------------------------------------------- 戰士
  // 被囚禁的甘納格：甦醒時，裝備一把 3/2 的斧頭
  BT_121: imprisoned([{ e: 'equip', card: 'CS2_106' }], { tokens: ['CS2_106'] }),
  // 卡加斯‧刃拳：突襲。亡語：把至尊卡加斯洗入你的牌堆
  BT_123: { keywords: ['RUSH'], abilities: dr(shuffle('BT_123t')), tokens: ['BT_123t'] },
  // 至尊卡加斯：突襲。每當此手下攻擊並消滅一個手下，獲得 10 點護甲值
  BT_123t: { keywords: ['RUSH'], abilities: afterKill({ e: 'armor', amount: 10 }) },
  // 噬骨劫掠者：戰吼：若場上有受傷的手下，獲得 +1/+1 與突襲
  BT_140: { abilities: play(fn('aoIfDamagedMinion', { effects: [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 1, keywords: ['RUSH'] }] })) },
  // 廢料魔像：嘲諷。亡語：獲得等同此手下攻擊力的護甲值
  BT_249: { keywords: ['TAUNT'], abilities: dr(fn('aoScrapGolem')) },
  // ---------------------------------------------------------------- 惡魔獵人
  // 深淵指揮者：嘲諷。在你的回合結束時，從你的牌堆召喚一個惡魔
  BT_486: { keywords: ['TAUNT'], abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'recruit', count: 1, race: 'DEMON' }] }] },
  // 惡魔召喚者：亡語：從你的手牌召喚一個隨機惡魔
  BT_509: { abilities: dr(fn('summonFromHand', { race: 'DEMON' })) },
  // 古爾丹之顱：抽 3 張牌。流放：它們的消耗減少 (3)
  BT_601: { abilities: play(cond({ c: 'outcast' }, [fn('aoDrawDiscount', { count: 3, amount: 3 })], [draw(3)])) },
  // 被囚禁的安泰恩：甦醒時，造成 10 點傷害，隨機分配到所有敵人身上
  BT_934: imprisoned([{ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 10 }]),
};
