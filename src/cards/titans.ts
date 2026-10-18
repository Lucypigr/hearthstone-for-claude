// ============================================================================
// 泰坦（TITANS）：鍛造、泰坦、磁力、混沌觸手、秋高爾的異象……
// 解析器看不懂的卡在這裡手動定義；自訂效果（tn 開頭）在 game.ts 的 customTitans。
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
const buffSelf = (atk: number, hp: number, extra: Partial<Extract<Effect, { e: 'buff' }>> = {}): Effect => ({ e: 'buff', target: { t: 'self' }, atk, hp, ...extra });
/** 本場對戰中施放過 5 張以上的法術 */
const if5 = (...effects: Effect[]): Effect => fn('tnIf5', { effects });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const enemyMinions = { type: 'minion' as const, side: 'enemy' as const };
const TENDRIL = 'YOG_514';
/** 秋高爾的異象 */
const ANOMALY_IDS = ['TTN_002t1', 'TTN_002t11', 'TTN_002t14', 'TTN_002t15', 'TTN_002t20', 'TTN_002t21', 'TTN_002t22', 'TTN_002t24', 'TTN_002t29', 'TTN_002t30', 'TTN_002t32', 'TTN_002t35', 'TTN_002t36', 'TTN_002t41', 'TTN_002t43', 'TTN_002t44', 'TTN_002t45', 'TTN_002t5', 'TTN_002t50', 'TTN_002t9'];
/** 伊格尼斯的武器效果（三個等級：短劍 / 斧 / 巨錘） */
const IGNIS_EFFECTS = ['TTN_060t3', 'TTN_060t4', 'TTN_060t5', 'TTN_060t6', 'TTN_060t7', 'TTN_060t7t', 'TTN_060t7t1', 'TTN_060t8', 'TTN_060t8t', 'TTN_060t8t1', 'TTN_060t9', 'TTN_060t10', 'TTN_060t10t', 'TTN_060t10t1', 'TTN_060t12', 'TTN_060t12t', 'TTN_060t12t1', 'TTN_060t13', 'TTN_060t13t', 'TTN_060t13t1'];

export const TITANS_OVERRIDES: Record<string, Override> = {
  // ================================================================ 中立
  // 太陽守望者：戰吼：獲得一張隨機的神聖法術。鍛造：也為你的英雄恢復 6 點生命值
  TTN_039: { forge: 'TTN_039t', abilities: play({ e: 'addRandom', pool: { type: 'SPELL', spellSchool: 'HOLY', anyClass: true }, count: 1, who: 'self' }) },
  TTN_039t: {
    abilities: play({ e: 'addRandom', pool: { type: 'SPELL', spellSchool: 'HOLY', anyClass: true }, count: 1, who: 'self' }, { e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 6 }),
  },
  // 獨眼巨人粉碎者：突襲。鍛造：獲得 +3/+2
  TTN_042: { forge: 'TTN_042t', keywords: ['RUSH'] },
  TTN_042t: { keywords: ['RUSH'] },
  // 機械地精嚮導：戰吼：發現一張法術。鍛造：它的消耗減少 (3)
  TTN_076: { forge: 'TTN_076t', abilities: play({ e: 'discover', pool: { type: 'SPELL' } }) },
  TTN_076t: { abilities: play({ e: 'discover', pool: { type: 'SPELL' } }, { e: 'costMod', amount: -3, scope: 'it' }) },
  // 霍迪爾之子：戰吼：把四個抽到時召喚的 8/8 巨人洗入你的牌堆
  TTN_083: { abilities: play({ e: 'shuffle', card: 'TTN_083t', count: 4 }), tokens: ['TTN_083t'] },
  TTN_083t: { summonedWhenDrawn: true },
  // 寇格拉朗：突襲。每當此手下攻擊一個手下，把那個手下放進你的手牌。亡語：把它們移到對手的手牌
  TTN_330: {
    keywords: ['RUSH'],
    abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('tnKologarnGrab')] }, ...dr(fn('tnKologarnGive'))],
  },
  // XB-488 廢料處理機器人：戰吼：對所有敵方手下隨機分配 5 點傷害。鍛造：獲得生命竊取
  TTN_458: { forge: 'TTN_458t', abilities: play({ e: 'splitDamage', filter: enemyMinions, amount: 5 }) },
  TTN_458t: { keywords: ['LIFESTEAL'], abilities: play({ e: 'splitDamage', filter: enemyMinions, amount: 5 }) },
  // 收容單位：磁力。亡語：召喚一個隨機的 8 費手下
  TTN_700: { magnetic: true, abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', cost: 8, anyClass: true }, count: 1, who: 'self' }) },
  // 薩鋼托維爾：嘲諷。每當此手下被攻擊，抽一張牌
  TTN_711: { keywords: ['TAUNT'], abilities: [{ on: { k: 'attacked' }, effects: [draw(1)] }] },
  // 銳眼搜尋者：戰吼：若你的牌堆中有不是一開始就在牌堆的牌，抽一張
  TTN_712: { abilities: play(fn('tnSeeker')) },
  // 憤怒的地獄犬：突襲。在你的回合 +4 攻擊力
  TTN_713: { keywords: ['RUSH'], atkIf: { cond: { c: 'not', cond: { c: 'opponentTurn' } }, atk: 4 } },
  // 符文燃料魔像：戰吼：發現一把任何職業的武器
  TTN_714: { abilities: play({ e: 'discover', pool: { type: 'WEAPON', anyClass: true } }) },
  // 遺失時光的原龍：嘲諷。當你抽到這張牌時，把一張隨機的龍加入你的手牌
  TTN_715: { keywords: ['TAUNT'], castsWhenDrawn: false, abilities: [{ on: { k: 'drawn' }, effects: [{ e: 'addRandom', pool: { type: 'MINION', race: 'DRAGON', anyClass: true }, count: 1, who: 'self' }] }] },
  // 烈焰巨獸：戰吼：獲得兩個隨機的磁力機械，它們的消耗減少 (2)
  TTN_716: { abilities: play(fn('tnMagneticMechs', { count: 2, discount: 2 })) },
  // 觀察者奧爾加隆：戰吼：把你的英雄能力換成奧爾加隆的預視
  TTN_717: { abilities: play({ e: 'replaceHeroPower', power: 'TTN_717t' }), tokens: ['TTN_717t2', 'TTN_717t3'] },
  TTN_717t2: {},
  TTN_717t3: {},
  // 星光幼龍：戰吼：獲得一張你起手手牌中的隨機一張卡
  TTN_718: { abilities: play(fn('tnOpeningCard')) },
  // 電車駕駛員：戰吼：抽一張機械。你打出的下一個機械消耗減少 (2)
  TTN_723: { abilities: play(draw(1, { type: 'MINION', race: 'MECHANICAL' }), { e: 'pendingDiscount', d: { amount: 2, race: 'MECHANICAL' } }) },
  // 風暴巨人：嘲諷。鍛造：消耗減少 (2)。可以無限鍛造
  TTN_724: { forge: 'TTN_724t', keywords: ['TAUNT'] },
  TTN_724t: { forge: 'TTN_724t', keywords: ['TAUNT'] },
  // 熔化的製造者：在你鍛造一張牌後，獲得一張它的複製
  TTN_729: { abilities: [{ on: { k: 'forge' }, effects: [fn('tnCopyForged')] }] },
  // 草率的機械技師：在你一個回合中抽到第二張牌後，摧毀此手下（在 game.ts 的 titansOnDraw）
  TTN_731: {},
  // 發明機器人：每當你吸附一個磁力手下，使它獲得 +1/+1
  TTN_732: { abilities: [{ on: { k: 'magnetize' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 1, hp: 1 }] }] },
  // 無情座狼：突襲。在此手下攻擊並消滅一個手下後，恢復至滿生命值
  TTN_733: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('tnWorg')] }] },
  // 機械跳躍者：磁力。亡語：使一個友方機械獲得 +2/+2 和這個亡語
  TTN_734: { magnetic: true, abilities: dr(fn('tnLeaper')) },
  // 偽裝的克瑟：每個回合在你的手牌中時，變形成對手牌堆中的一張隨機卡
  TTN_741: { handShift: { kind: 'opponentDeck' } },
  // 天體投影師：戰吼：選擇一個友方手下，把一張它的暫時複製加入你的手牌
  TTN_742: { target: optional(friendlyMinion), abilities: play(fn('tnTempCopy')) },
  // 永恆之焰伊格尼斯：戰吼：若你在本場對戰中鍛造過卡牌，打造一把自訂的武器
  TTN_751: {
    abilities: play(fn('tnIgnis')),
    tokens: ['TTN_060t', 'TTN_060t1', 'TTN_060t2', ...IGNIS_EFFECTS],
  },
  // 伊格尼斯打造的武器（效果由 tnIgnis 賦予），以及可選的效果（只用來顯示選項）
  TTN_060t: {},
  TTN_060t1: {},
  TTN_060t2: {},
  ...Object.fromEntries(IGNIS_EFFECTS.map((id) => [id, {}])),
  // 勝利的維酷人：在此手下攻擊後，獲得一張消耗 (1) 的 2/3 華爾琪
  TTN_812: { abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [{ e: 'addCard', card: 'TTN_812t', count: 1, who: 'self' }] }], tokens: ['TTN_812t'] },
  // 命運分割者：亡語：獲得一張你對手打出的上一張卡的複製
  TTN_859: { abilities: dr(fn('tnFateSplitter')) },
  // 無人機拆解者：戰吼：獲得一個有隨機額外效果的 1/1 磁力電火機器人
  TTN_860: { abilities: play(fn('tnSparkbot', { count: 1 })) },
  // 銳鱗：卡牌的消耗無法低於 (2)
  TTN_924: { flags: ['razorscale'] },
  // 越獄者：戰吼：若你在本場對戰中施放過 5 張以上的法術，對所有敵人造成 2 點傷害
  YOG_411: { abilities: play(if5({ e: 'damage', target: allEnemies, amount: 2 })) },
  // 混沌觸手：戰吼：施放一個隨機的 (1) 費法術。強化你之後的混沌觸手
  YOG_514: { abilities: play(fn('tnTendril')) },
  // 混沌之眼：戰吼：獲得兩個 1/1 混沌觸手
  YOG_515: { abilities: play({ e: 'addCard', card: TENDRIL, count: 2, who: 'self' }) },
  // 『解放者』尤格薩倫：泰坦。在此手下使用一個能力後，施放兩個隨機法術
  YOG_516: { titan: ['YOG_516t', 'YOG_516t2', 'YOG_516t3'], titanAfter: [fn('tnCastRandom', { count: 2 })] },
  YOG_516t: { target: enemyMinion, abilities: play({ e: 'steal', target: { t: 'chosen' } }) },
  YOG_516t2: { abilities: play(fn('tnInduceInsanity')) },
  YOG_516t3: { abilities: play(fn('tnFillTendrils')) },
  // 暮光領主秋高爾：嘲諷、生命竊取。開局：50% 機率以一個隨機異象腐化這場對戰
  YOG_530: { keywords: ['TAUNT', 'LIFESTEAL'], startOfGame: 'chogall', tokens: ANOMALY_IDS },
  // 異象（只用來顯示名稱與說明，效果在 game.ts）
  ...Object.fromEntries(ANOMALY_IDS.map((id) => [id, {}])),

  // ================================================================ 死亡騎士
  // 悼詞者：戰吼：消耗 3 具屍體來造成 3 點傷害。鍛造：改為獲得它們
  TTN_457: { forge: 'TTN_457t', target: optional(anyChar), abilities: play({ e: 'spendCorpses', amount: 3, then: [{ e: 'damage', target: { t: 'chosen' }, amount: 3 }] }) },
  TTN_457t: { target: optional(anyChar), abilities: play({ e: 'gainCorpses', amount: 3 }, { e: 'damage', target: { t: 'chosen' }, amount: 3 }) },
  // 首要者：泰坦。在此手下使用一個能力後，發現一張具有那個符文的卡
  TTN_737: { titan: ['TTN_737t', 'TTN_737t1', 'TTN_737t3'], titanAfter: [fn('tnPrimus')] },
  TTN_737t: { target: enemyMinion, abilities: play(fn('tnRunesOfBlood')) },
  TTN_737t1: { abilities: play(summon('TTN_737t2', 2)), tokens: ['TTN_737t2'] },
  TTN_737t2: { keywords: ['TAUNT', 'REBORN'] },
  TTN_737t3: { abilities: play({ e: 'pendingDiscount', d: { amount: 3, type: 'SPELL' } }, fn('tnNextSpellDmg', { amount: 3 })) },
  // 冰封之地：雙方玩家各抽 2 張牌。你的對手下個回合無法打出那些牌
  TTN_744: { abilities: play(fn('tnFrozenOver')) },
  // 赫利亞：戰吼：把全部三種瘟疫洗入你對手的牌堆。他們在本場對戰中抽到的瘟疫是無盡的
  TTN_850: { abilities: play(fn('tnHelya')), tokens: ['TTN_450t', 'TTN_450t2', 'TTN_450t3'] },

  // ================================================================ 惡魔獵人
  // 水晶雕像：突襲。開始時處於休眠狀態。在你抽了 4 張牌後甦醒
  TTN_840: { keywords: ['RUSH', 'DORMANT'], awakenDraws: 4 },
  // 永恆的尤頓：戰吼：在本場對戰剩下的時間，對敵人施放你每回合抽到的第一張法術的複製
  TTN_842: { abilities: play(fn('tnJotun')) },
  // 阿古斯晶石魔像：你本回合每抽一張牌，就有 +1 攻擊力
  TTN_844: { atkPer: { dyn: 'drawnThisTurn' } },
  // 符文裝飾：發現一張消耗 (3) 以下的法術。把 2 張抽到時施放的複製洗入你的牌堆
  TTN_845: { abilities: play(fn('tnRunicAdornment')) },
  // 阿古斯的信徒：亡語：召喚兩個有嘲諷的 2/2 元素
  TTN_861: { abilities: dr(summon('TTN_862t4', 2)), tokens: ['TTN_862t4'] },
  // 翡翠之星阿古斯：泰坦。在此手下左邊的手下具有突襲，右邊的手下具有生命竊取
  TTN_862: { flags: ['argus'], titan: ['TTN_862t1', 'TTN_862t2', 'TTN_862t3'] },
  TTN_862t1: { abilities: play({ e: 'discover', pool: { type: 'MINION', hasDeathrattle: true } }, { e: 'costMod', amount: -3, scope: 'it' }) },
  TTN_862t2: { abilities: play(fn('tnHandCost', { type: 'MINION', amount: -2 })) },
  TTN_862t3: { abilities: play(summon('TTN_862t4', 4)), tokens: ['TTN_862t4'] },
  TTN_862t4: { keywords: ['TAUNT'] },
  // 世界之重：抽 2 張牌。鍛造：先抽牌直到你的手牌數與對手相同
  TTN_865: { forge: 'TTN_865t', abilities: play(draw(2)) },
  TTN_865t: { abilities: play(fn('tnDrawToMatch'), draw(2)) },
  // 時間印記：在你的下個回合開始時，額外抽 3 張牌
  YOG_401: { abilities: play({ e: 'delayed', turns: 1, effects: [draw(3)] }) },
  // 屈心魔：戰吼：你本回合每抽一張牌，就造成 1 點傷害
  YOG_402: { target: optional(anyChar), abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'drawnThisTurn' } }) },
  // 薩鋼蹣跚者：戰吼：若你在本場對戰中施放過 5 張以上的法術，本回合賦予你的英雄 +4 攻擊力
  YOG_521: { abilities: play(if5({ e: 'heroAttack', amount: 4 })) },

  // ================================================================ 德魯伊
  // 伊歐娜的信徒：戰吼：你的下一張二選一卡牌兩種效果合一
  TTN_503: { abilities: play(fn('tnChooseBothNext')) },
  // 生命守縛者伊歐娜：泰坦。在此手下使用一個能力後，召喚一個有嘲諷的 5/5 古樹
  TTN_903: { titan: ['TTN_903t', 'TTN_903t2', 'TTN_903t3'], titanAfter: [summon('TTN_903t4')], tokens: ['TTN_903t4'] },
  TTN_903t: { abilities: play(fn('tnDrawUntilFull')) },
  TTN_903t2: { abilities: play({ e: 'fullHeal', target: { t: 'hero', side: 'friendly' } }) },
  TTN_903t3: { abilities: play({ e: 'mana', kind: 'refresh', amount: 10 }) },
  TTN_903t4: { keywords: ['TAUNT'] },
  // 增長古樹（二選一，子卡在下面）
  TTN_926a: { abilities: play(summon('TTN_950t2', 3)), tokens: ['TTN_950t2'] },
  TTN_926b: { abilities: play(fn('tnTreantsToAncients')), tokens: ['TTN_903t4'] },
  // 林精保育員：戰吼：將一個友方樹人變形成有嘲諷的 5/5 古樹
  TTN_927: {
    target: { filter: { type: 'minion', side: 'friendly', nameIncludes: 'Treant' }, optional: true },
    abilities: play({ e: 'transform', target: { t: 'chosen' }, card: 'TTN_903t4' }),
    tokens: ['TTN_903t4'],
  },
  // 霜蓮幼苗：抽 1 張牌，獲得 5 點護甲（3 個回合後綻放）
  TTN_930: { blossom: { turns: 3, into: 'TTN_930t' }, abilities: play(draw(1), { e: 'armor', amount: 5 }), tokens: ['TTN_930t'] },
  TTN_930t: { abilities: play(draw(2), { e: 'armor', amount: 10 }) },
  // 自然守護者芙蕾雅（二選一）
  TTN_940a: { abilities: play(fn('tnCopyFriendlies')) },
  TTN_940b: { abilities: play(fn('tnDuplicateHand')) },
  // 森林幼苗：召喚兩個 1/1 樹苗（2 個回合後綻放）
  TTN_950: { blossom: { turns: 2, into: 'TTN_950t3' }, abilities: play(summon('TTN_950t', 2)), tokens: ['TTN_950t', 'TTN_950t3'] },
  TTN_950t3: { abilities: play(summon('TTN_950t2', 2)), tokens: ['TTN_950t2'] },
  // 自然的擁抱：抽一張二選一卡牌。鍛造：它兩種效果合一
  TTN_951: { forge: 'TTN_951t', abilities: play(draw(1, { chooseOne: true })) },
  TTN_951t: { abilities: play(draw(1, { chooseOne: true }), fn('tnBothIt')) },
  // 栽培：使你的手下獲得 +2/+2。本場對戰中你每召喚一個樹人，消耗減少 (1)
  TTN_954: { costRule: { per: 'treantsSummoned', amount: 1 }, abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 2, hp: 2 }) },
  // 縛命者的禮物（二選一）
  TTN_955A: { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', spellSchool: 'NATURE' }, count: 2, who: 'self' }) },
  TTN_955B: { abilities: play(fn('tnHandCost', { type: 'SPELL', amount: -1 })) },
  // 受汙染的鞭笞者：戰吼：若你在本場對戰中施放過 5 張以上的法術，重新整理 4 顆法力水晶
  YOG_528: { abilities: play(if5({ e: 'mana', kind: 'refresh', amount: 4 })) },
  // 禁忌之果（二選一）
  YOG_529a: { abilities: play(fn('tnForbiddenFruit', { armor: false })) },
  YOG_529b: { abilities: play(fn('tnForbiddenFruit', { armor: true })) },

  // ================================================================ 獵人
  // 神話觀察者：在你召喚一個攻擊力比此手下高的手下後，使所有友方手下獲得 +1 攻擊力
  TTN_078: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('tnObserver')] }] },
  // 總有更大的冰蟲：使一個手下獲得 +2 攻擊力與「攻擊造成的溢出傷害會擊中敵方英雄」
  TTN_079: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2 }, fn('tnTrample')) },
  // 寓言馬伕：突襲。戰吼：若你控制一個攻擊力 4 以上的手下，獲得 +2/+2
  TTN_080: { keywords: ['RUSH'], abilities: play(cond({ c: 'control', minAtk: 4 }, [buffSelf(2, 2)])) },
  // 甦醒的震動：獲得三個 4/1 蠕蟲，它們消耗 (1)
  TTN_081: { abilities: play({ e: 'addCard', card: 'TTN_081t', count: 3, who: 'self' }), tokens: ['TTN_081t'] },
  // 吸收寄生蟲：磁力、突襲。可以吸附到機械和野獸上
  TTN_087: { magnetic: true, magnetRaces: ['MECHANICAL', 'BEAST'], keywords: ['RUSH'] },
  // 星弦之弓：本場對戰中你每有一個友方奧秘觸發，消耗減少 (1)
  TTN_088: { costRule: { per: 'secretsTriggered', amount: 1 } },
  // 復仇者阿格拉瑪：泰坦。戰吼：裝備一把 3/3 的泰沙拉克
  TTN_092: {
    titan: ['TTN_092t1', 'TTN_092t2', 'TTN_092t3'],
    abilities: play({ e: 'equip', card: 'TTN_092t' }),
    tokens: ['TTN_092t'],
  },
  TTN_092t: {},
  TTN_092t1: { abilities: play(fn('tnWeaponAbility', { ability: 'draw' })) },
  TTN_092t2: { abilities: play(fn('tnWeaponAbility', { ability: 'enforcer' })), tokens: ['TTN_092e2t'] },
  TTN_092e2t: { keywords: ['TAUNT'] },
  TTN_092t3: { abilities: play(fn('tnWeaponAbility', { ability: 'swift' })) },
  // 泰坦鍛造陷阱：發現一個奧秘並施放。鍛造：做兩次
  TTN_302: { forge: 'TTN_302t', abilities: play(fn('discoverSecretCast', { count: 1 })) },
  TTN_302t: { abilities: play(fn('discoverSecretCast', { count: 1 }), fn('discoverSecretCast', { count: 1 })) },
  // 眾巨人之父霍迪爾：戰吼：把你接下來打出的三個手下屬性值設為 8/8
  TTN_752: { abilities: play(fn('tnHodir')) },
  // 天體射擊：造成 3 點傷害。你的下一張法術具有法術傷害 +2
  YOG_082: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, fn('tnNextSpellDmg', { amount: 2 })) },
  // 野性的瘋狂：使你手牌、牌堆與戰場上的所有手下獲得 +1 攻擊力
  YOG_505: { abilities: play(fn('tnBestialMadness')) },
  // 扭曲霜翼：突襲。亡語：召喚一個屬性值等同此手下攻擊力的奇美拉
  YOG_506: { keywords: ['RUSH'], abilities: dr(fn('tnChimaera')), tokens: ['YOG_506t'] },

  // ================================================================ 法師
  // 希芙：法術傷害 +@（本場對戰中你每施放過一種法術派系就提升）
  TTN_071: { flags: ['sif'] },
  // 諾甘農：泰坦。在此手下使用一個能力後，其他能力的威力加倍
  TTN_075: { titan: ['TTN_075t', 'TTN_075t2', 'TTN_075t3'], titanAfter: [fn('tnNorgannon')] },
  TTN_075t: { target: anyChar, abilities: play(fn('tnTitanDamage', { amount: 5 })) },
  TTN_075t2: { abilities: play(fn('tnAncientKnowledge')) },
  TTN_075t3: { abilities: play(fn('tnCastSecrets')) },
  // 急凍機器人：磁力。凍結任何被此手下傷害的角色
  TTN_077: { magnetic: true, keywords: ['FREEZE_ON_DAMAGE'] },
  // 諾甘農的智慧：抽 2 張牌。本場對戰中你每施放過一種不同的法術派系，消耗減少 (1)
  TTN_085: { costRule: { per: 'schoolsCast', amount: 1 }, abilities: play(draw(2)) },
  // 水之典籍管理員：戰吼：你打出的下一個元素消耗減少 (2)
  TTN_095: { abilities: play({ e: 'pendingDiscount', d: { amount: 2, race: 'ELEMENTAL' } }) },
  // 解放的鬥士：戰吼：抽一張牌。你上個回合每打出一個元素，就重複一次
  TTN_475: { abilities: play(draw(1), { e: 'repeat', times: { dyn: 'elementalsLastTurn' }, effects: [draw(1)] }) },
  // 魔法的發現：發現一張你在本場對戰中沒有施放過的法術派系的法術（任何職業）
  TTN_476: { abilities: play(fn('tnDiscoveryOfMagic')) },
  // 熔岩符文：造成 3 點傷害。獲得一張隨機的法術。鍛造：施放兩次
  TTN_477: { forge: 'TTN_477t1', target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, { e: 'addRandom', pool: { type: 'SPELL' }, count: 1, who: 'self' }) },
  TTN_477t1: {
    target: anyChar,
    abilities: play(
      { e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true },
      { e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true },
      { e: 'addRandom', pool: { type: 'SPELL' }, count: 2, who: 'self' },
    ),
  },
  // 好奇的造物：戰吼：對所有敵方手下造成 @ 點傷害（本場對戰中你每施放過一種法術派系就提升）
  TTN_478: { abilities: play({ e: 'damage', target: { t: 'all', filter: enemyMinions }, amount: { dyn: 'schoolsCast' } }) },
  // 元素啟迪：本場對戰中你每施放過一種法術派系，就召喚一個有隨機額外效果的 4/5 漩渦
  TTN_480: {
    abilities: play(fn('tnVortexes')),
    tokens: ['TTN_480t', 'TTN_480t1', 'TTN_480t2', 'TTN_480t3', 'TTN_480t4', 'TTN_480t5', 'TTN_480t6', 'TTN_480t7'],
  },
  TTN_480t: { keywords: ['DIVINE_SHIELD'] },
  TTN_480t1: { keywords: ['TAUNT'] },
  TTN_480t2: { keywords: ['RUSH'] },
  TTN_480t3: { keywords: ['WINDFURY'] },
  TTN_480t4: { keywords: ['ELUSIVE'] },
  TTN_480t5: { keywords: ['POISONOUS'] },
  TTN_480t6: { keywords: ['LIFESTEAL'] },
  TTN_480t7: { keywords: ['REBORN'] },
  // 虛空經文：發現一張法術。若你有足夠的法力打出它，對一個隨機敵人施放它的複製
  YOG_507: { abilities: play(fn('tnVoidScripture')) },
  // 好管閒事的僕人：戰吼：若你在本場對戰中施放過 5 張以上的法術，抽 2 張牌
  YOG_518: { abilities: play(if5(draw(2))) },

  // ================================================================ 聖騎士
  // 高貴的迷你機器人：磁力。在此手下攻擊後，使你手牌中的一個隨機手下獲得 +1/+1
  TTN_852: { magnetic: true, abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [{ e: 'handBuff', atk: 1, hp: 1, scope: 'random' }] }] },
  // 發明家的光環：你的機械消耗減少 (1)。持續 2 個回合
  TTN_854: { objective: 2, abilities: [...play(fn('objective')), { on: { k: 'turnEnd', whose: 'mine' }, effects: [] }] },
  // 提爾之淚：復活 3 個不同的你的職業手下，屬性值設為 2/2。鍛造：多復活一個
  TTN_855t: { forge: 'TTN_855', abilities: play(fn('tnTyrsTears', { count: 3 })) },
  TTN_855: { abilities: play(fn('tnTyrsTears', { count: 4 })) },
  // 阿米圖斯的信徒：在你的回合結束時，召喚一個 2/2 的大地之子（本場對戰中你每召喚過一個其他大地之子 +2/+2）
  TTN_856: { abilities: endTurn(summon('TTN_900t')), tokens: ['TTN_900t'] },
  // 提爾：戰吼：復活一個攻擊力 2、3、4 的你的職業手下
  TTN_857: { abilities: play(fn('tnTyr')) },
  // 和平守護者阿米圖斯：泰坦、嘲諷。你的手下每次最多受到 2 點傷害
  TTN_858: { keywords: ['TAUNT'], flags: ['amitus'], titan: ['TTN_858t1', 'TTN_858t2', 'TTN_858t3'] },
  TTN_858t1: { abilities: play(fn('tnReinforced')) },
  TTN_858t2: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, atk: 2, hp: 2 }) },
  TTN_858t3: { abilities: play(fn('tnPacified')) },
  // 石心之王：亡語：召喚一個 2/2 的大地之子
  TTN_900: { abilities: dr(summon('TTN_900t')), tokens: ['TTN_900t'] },
  // 大地之子魔像（屬性值加成在 game.ts 的 countSummon）
  TTN_900t: {},
  // X-21 修理機器人：亡語：把吸附在此手下上的機械移回你的手牌
  TTN_906: { abilities: dr(fn('tnRepairbot')) },
  // 星界巨蛇：在你的回合結束時，若此手下本回合沒有攻擊，抽 2 張牌
  TTN_907: { abilities: endTurn(fn('tnSerpent')) },
  // 守護者之力：使一個友方手下獲得 +2/+2。對所有其他手下造成等同其攻擊力的傷害
  YOG_509: { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, fn('tnKeepersStrength')) },
  // 警覺的保全機器人：亡語：抽另一張手下，把它的攻擊力、生命值與消耗設為 5
  YOG_510: { abilities: dr(fn('tnSecuritybot')) },
  // 肌肉機器人：戰吼：使你手牌中的所有手下獲得 +1/+1。鍛造：改為 +2/+2
  YOG_525: { forge: 'YOG_525t', abilities: play({ e: 'handBuff', atk: 1, hp: 1, scope: 'all' }) },
  YOG_525t: { abilities: play({ e: 'handBuff', atk: 2, hp: 2, scope: 'all' }) },

  // ================================================================ 牧師
  // 星界自動機（屬性值加成在 game.ts 的 countSummon）
  TTN_401: {},
  // 阿曼蘇爾：泰坦。在此手下使用一個能力後，發現一個任何職業的傳說手下
  TTN_429: {
    titan: ['TTN_429t', 'TTN_429t2', 'TTN_429t3'],
    titanAfter: [{ e: 'discover', pool: { type: 'MINION', rarity: 'LEGENDARY', anyClass: true } }],
  },
  TTN_429t: { target: { filter: { type: 'minion', side: 'any', notTitan: true } }, abilities: play(fn('tnShapeStars')) },
  TTN_429t2: { abilities: play(fn('tnStrikeFromHistory')) },
  TTN_429t3: { abilities: play(fn('tnVisionOfHeroes')) },
  // 創造協議：發現你牌堆中一個手下的複製。鍛造：再獲得一張複製
  TTN_430: { forge: 'TTN_430t', abilities: play(fn('tnCreationProtocol', { copies: 1 })) },
  TTN_430t: { abilities: play(fn('tnCreationProtocol', { copies: 2 })) },
  // 無形星座：戰吼：變形成你手牌中一個隨機手下的 8/8 複製
  TTN_441: { abilities: play(fn('tnShapeless')) },
  // 萊登：嘲諷。亡語：召喚本場對戰中你打出過的、一開始不在牌堆中的其他每個手下
  TTN_481: { keywords: ['TAUNT'], abilities: dr(fn('tnRaden')) },
  // 星辰學徒：亡語：把一張此手下的複製洗入你的牌堆，並永久獲得 +3/+3
  TTN_482: { abilities: dr(fn('tnStudent')) },
  // 寧靜：使所有敵方手下 -2 攻擊力。摧毀其中攻擊力為 0 的
  TTN_483: { abilities: play(fn('tnSerenity')) },
  // 偽信徒：戰吼：發現一個來自過去的傳說牧師手下
  TTN_484: { abilities: play({ e: 'discover', pool: { type: 'MINION', rarity: 'LEGENDARY', cls: 'PRIEST', past: true } }) },
  // 群星齊聚：把你手牌中的手下變形成消耗多 (3) 的手下（保留原本的消耗）
  TTN_485: { abilities: play(fn('tnStarsAlign')) },
  // 至高天父的恩典：恢復 8 點生命值。發現一張消耗等同溢療量的卡
  TTN_745: { target: anyChar, abilities: play(fn('tnGrace')) },
  // 暗影觸碰的克瓦迪爾：戰吼：你的下一個治療效果改為造成傷害
  YOG_300: { abilities: play(fn('tnHealToDamage')) },
  // 暮光洪流：選擇一個角色。若為友方，恢復 6 點生命值；若為敵方，造成 3 點傷害
  YOG_508: {
    target: anyChar,
    abilities: play(cond({ c: 'chosenFriendly' }, [{ e: 'heal', target: { t: 'chosen' }, amount: 6 }], [{ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }])),
  },
  // 燃魂者瓦莉亞：在一個友方不死族死亡後，對敵方英雄造成 2 點傷害，並獲得一張隨機的暗影牧師法術
  YOG_520: {
    abilities: [
      {
        on: { k: 'minionDied', side: 'friendly', race: 'UNDEAD' },
        effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 2 }, { e: 'addRandom', pool: { type: 'SPELL', cls: 'PRIEST', spellSchool: 'SHADOW' }, count: 1, who: 'self' }],
      },
    ],
  },

  // ================================================================ 盜賊
  // 從廢料堆中：獲得三個有隨機額外效果的 1/1 磁力電火機器人
  TTN_719: { abilities: play(fn('tnSparkbot', { count: 3 })), tokens: ['TTN_719t', 'TTN_719t1', 'TTN_719t2', 'TTN_719t3', 'TTN_719t4', 'TTN_719t5', 'TTN_719t6', 'TTN_719t7'] },
  TTN_719t: { magnetic: true, keywords: ['DIVINE_SHIELD'] },
  TTN_719t1: { magnetic: true, keywords: ['TAUNT'] },
  TTN_719t2: { magnetic: true, keywords: ['RUSH'] },
  TTN_719t3: { magnetic: true, keywords: ['WINDFURY'] },
  TTN_719t4: { magnetic: true, keywords: ['POISONOUS'] },
  TTN_719t5: { magnetic: true, keywords: ['ELUSIVE'] },
  TTN_719t6: { magnetic: true, keywords: ['REBORN'] },
  TTN_719t7: { magnetic: true, keywords: ['LIFESTEAL'] },
  // V-07-TR-0N 至尊：泰坦。此手下的能力會在另一個隨機友方手下上重複
  TTN_721: { titan: ['TTN_721t', 'TTN_721t1', 'TTN_721t2'], titanAfter: [fn('tnVoltron')] },
  TTN_721t: { abilities: play(buffSelf(2, 1), { e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 4 }) },
  TTN_721t1: { abilities: play(buffSelf(1, 2), draw(1)) },
  TTN_721t2: { abilities: play(buffSelf(0, 3, { keywords: ['ELUSIVE'] })) },
  // 焦油浮膜：本回合手下受到的傷害加倍。造成 1 點傷害
  TTN_726: { target: anyChar, abilities: play(fn('tnTarSlick'), { e: 'damage', target: { t: 'chosen' }, amount: 1, spell: true }) },
  // 進站維修：從你的牌堆發現一個機械，使它獲得 +2/+1
  TTN_728: { abilities: play(fn('tnPitStop')) },
  // 實驗室建造者：在你的回合結束時，召喚一個此手下的複製。鍛造：獲得磁力
  TTN_730: { forge: 'TTN_730t', abilities: endTurn({ e: 'summonCopy', target: { t: 'self' }, count: 1 }) },
  TTN_730t: { magnetic: true, abilities: endTurn({ e: 'summonCopy', target: { t: 'self' }, count: 1 }) },
  // 主腦米米倫：在你打出一個機械後，獲得一個隨機的米米倫的小工具
  TTN_920: {
    abilities: [
      {
        on: { k: 'cardPlayed', side: 'friendly', race: 'MECHANICAL' },
        effects: [fn('addOneOf', { cards: ['TTN_920t5', 'TTN_920t6', 'TTN_920t7', 'TTN_920t8', 'TTN_920t9', 'TTN_920t10'] })],
      },
    ],
    tokens: ['TTN_920t5', 'TTN_920t6', 'TTN_920t7', 'TTN_920t8', 'TTN_920t9', 'TTN_920t10'],
  },
  TTN_920t5: { abilities: play({ e: 'nextCardDiscount', amount: 2 }) },
  TTN_920t6: { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, keywords: ['STEALTH'], untilNextTurn: true }) },
  TTN_920t7: { target: anyMinion, abilities: play(fn('tnSwitch')) },
  TTN_920t8: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, keywords: ['TAUNT', 'DIVINE_SHIELD'] }) },
  TTN_920t9: { target: anyMinion, abilities: play({ e: 'returnToHand', target: { t: 'chosen' } }) },
  TTN_920t10: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }) },
  // 銅尾窺探者：磁力。每當此手下攻擊，獲得一枚幸運幣
  TTN_921: { magnetic: true, abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [{ e: 'addCard', card: 'GAME_005', count: 1, who: 'self' }] }] },
  // 換檔：把你手牌最左邊的兩張牌洗入牌堆。抽 3 張牌
  TTN_922: { abilities: play(fn('tnGearShift')) },
  // SP-3Y3-D3R：磁力。潛行 1 個回合
  TTN_923: { magnetic: true, abilities: play({ e: 'buff', target: { t: 'self' }, keywords: ['STEALTH'], untilNextTurn: true }) },
  // 卡亞礦造物：戰吼：發現一張另一個職業的消耗 (3) 以下的法術
  TTN_925: { abilities: play({ e: 'discover', pool: { type: 'SPELL', otherClass: true, maxCost: 3 } }) },
  // 組裝線：發現一個另一個職業的機械
  YOG_410: { abilities: play({ e: 'discover', pool: { type: 'MINION', race: 'MECHANICAL', otherClass: true } }) },
  // 觸手之握：造成 3 點傷害。連擊：獲得一個 1/1 混沌觸手
  YOG_526: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, cond({ c: 'combo' }, [{ e: 'addCard', card: TENDRIL, count: 1, who: 'self' }])) },

  // ================================================================ 薩滿
  // 閃電反射：發現一個自然法術。若你在本回合打出它，發現另一個
  TTN_317: { abilities: play({ e: 'discover', pool: { type: 'SPELL', spellSchool: 'NATURE' }, then: [fn('followGive', { id: 'reflexes', target: 'it' })] }) },
  // 扭轉局勢：本回合賦予你的英雄 +3 攻擊力。召喚一個有突襲的 3/3 元素。超載：(1)
  TTN_722: { overload: 1, abilities: play({ e: 'heroAttack', amount: 3 }, summon('TTN_833t')), tokens: ['TTN_833t'] },
  TTN_833t: { keywords: ['RUSH'] },
  // 風暴之錘：在你的英雄攻擊後，對生命值最低的敵人造成 3 點傷害
  TTN_725: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('tnLowestEnemy', { amount: 3 })] }] },
  // 索里格尼爾龍：突襲。每當此手下攻擊，召喚兩隻 3/1 幼龍先攻擊目標
  TTN_727: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('tnThorignir')] }], tokens: ['TTN_727t'] },
  // 雷霆之王高嘉納斯：泰坦。你每回合的第一張法術消耗減少 (3)
  TTN_800: { titan: ['TTN_800t', 'TTN_800t2', 'TTN_800t3'], auras: [{ scope: 'firstSpellDiscount', cost: 3 }] },
  TTN_800t: {
    abilities: play({ e: 'damage', target: allEnemies, amount: 3 }, { e: 'heal', target: { t: 'all', filter: { type: 'character', side: 'friendly' } }, amount: 6 }),
  },
  TTN_800t2: { target: { filter: { type: 'minion', side: 'any', excludeSelf: true } }, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 20 }) },
  TTN_800t3: { abilities: play(draw(3, { overload: true })) },
  // 風暴勇士：在你施放一個自然法術後，召喚一個 4/2 的元素。鍛造：有突襲
  TTN_801: { forge: 'TTN_801t', abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'NATURE' }, effects: [summon('TTN_801t1')] }], tokens: ['TTN_801t1'] },
  TTN_801t: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'NATURE' }, effects: [summon('TTN_801t2')] }], tokens: ['TTN_801t2'] },
  TTN_801t1: {},
  TTN_801t2: { keywords: ['RUSH'] },
  // 閃電之光：抽一張牌。下個回合你的自然法術消耗減少 (1)
  TTN_830: { abilities: play(draw(1), fn('tnNatureNextTurn')) },
  // 雷霆之擊：對所有敵人造成 3 點傷害。本回合你每施放過一張自然法術，消耗減少 (1)
  TTN_831: { costRule: { per: 'natureThisTurn', amount: 1 }, abilities: play({ e: 'damage', target: allEnemies, amount: 3, spell: true }) },
  // 高嘉納斯的信徒：在你的回合結束時，使你手牌中一張隨機的超載卡消耗減少 (1)
  TTN_833: { abilities: endTurn(fn('tnReduceOverload')) },
  // 風暴之王索林姆：戰吼：解鎖你被超載的法力水晶，抽等量的牌
  TTN_835: { abilities: play(fn('tnThorim')) },
  // 傳導：本回合你施放的下一張法術也會指定相鄰的手下
  YOG_522: { abilities: play(fn('tnConductivity')) },
  // 被寄生的守望者：嘲諷。亡語：獲得兩個 1/1 混沌觸手
  YOG_523: { keywords: ['TAUNT'], abilities: dr({ e: 'addCard', card: TENDRIL, count: 2, who: 'self' }) },
  // 震擊跳蚤：戰吼：獲得一張隨機的超載卡
  YOG_524: { abilities: play({ e: 'addRandom', pool: { overload: true }, count: 1, who: 'self' }) },

  // ================================================================ 術士
  // 凡人的滅絕：對所有敵方手下隨機分配 5 點傷害。每消滅一個，為你的英雄恢復 2 點生命值
  TTN_460: { abilities: play(fn('tnMortalEradication')) },
  // 被囚禁的恐魔：本場對戰中你在自己的回合每受到 1 點傷害，消耗減少 (1)
  TTN_462: { costRule: { per: 'ownTurnDamage', amount: 1 } },
  // 機翼焊接：棄掉你消耗最高的牌。對所有手下造成等同其消耗的傷害
  TTN_463: { abilities: play(fn('tnWingWelding')) },
  // 尤格薩倫的獄卒洛肯：戰吼：從你的牌堆發現一個手下。召喚一個有它的屬性值與嘲諷的觸手
  TTN_487: { abilities: play(fn('tnLoken')), tokens: ['TTN_487t'] },
  TTN_487t: { keywords: ['TAUNT'] },
  // 薩格拉斯的信徒：戰吼：棄掉一張法術來召喚兩個 3/2 小鬼。鍛造：使它們獲得 +2 生命值與嘲諷
  TTN_490: { forge: 'TTN_490t', abilities: play(fn('tnDiscipleSargeras', { forged: false })), tokens: ['TTN_960t6'] },
  TTN_490t: { abilities: play(fn('tnDiscipleSargeras', { forged: true })), tokens: ['TTN_960t6'] },
  // 混亂吞噬：摧毀一個友方手下來摧毀一個敵方手下
  TTN_932: { target: friendlyMinion, abilities: play(fn('tnChaoticConsumption')) },
  // 毀滅者薩格拉斯：泰坦。戰吼：開啟一道每回合召喚兩個 3/2 小鬼的傳送門
  TTN_960: {
    titan: ['TTN_960t2', 'TTN_960t3', 'TTN_960t4'],
    abilities: play(fn('tnNetherPortal')),
    tokens: ['TTN_960t', 'TTN_960t5', 'TTN_960t6'],
  },
  TTN_960t: { abilities: endTurn(fn('tnNetherSummon', { card: 'TTN_960t6', count: 2 })) },
  TTN_960t2: { abilities: play(fn('tnToTheVoid')) },
  TTN_960t3: { abilities: play(fn('tnNetherSummon', { card: 'TTN_960t5', count: 2 })) },
  TTN_960t4: { abilities: play(fn('tnLegion')) },
  TTN_960t5: {},
  TTN_960t6: {},
  // 侵蝕的瘋狂：雙方玩家各受到兩次疲勞傷害
  YOG_301: { abilities: play(fn('tnEncroaching')) },
  // 血肉詛咒：下個回合敵方手下消耗生命值而不是法力
  YOG_503: { abilities: play(fn('tnCurseOfFlesh')) },
  // 觸手照料者：在你的回合結束時，獲得一個 1/1 混沌觸手
  YOG_517: { abilities: endTurn({ e: 'addCard', card: TENDRIL, count: 1, who: 'self' }) },

  // ================================================================ 戰士
  // 卡茲格羅斯：泰坦。在此手下使用一個能力後，本回合獲得免疫並攻擊一個隨機敵方手下
  TTN_415: { titan: ['TTN_415t', 'TTN_415t2', 'TTN_415t3'], titanAfter: [fn('tnKhazgoroth')] },
  TTN_415t: { abilities: play(buffSelf(2, 2), draw(1, { type: 'WEAPON' })) },
  TTN_415t2: { abilities: play(buffSelf(5, 0), { e: 'heroAttack', amount: 5 }) },
  TTN_415t3: { abilities: play(buffSelf(0, 5), { e: 'armor', amount: 5 }) },
  // 牛頭人：突襲。每當此手下造成傷害，獲得等量的護甲
  TTN_466: { keywords: ['RUSH'], abilities: [{ on: { k: 'dealtDamage' }, effects: [{ e: 'armor', amount: { dyn: 'eventAmount' } }] }] },
  // 蒸汽守衛：戰吼：抽一張法術。使你手牌中一張隨機的火焰法術消耗減少 (1)
  TTN_468: { abilities: play(draw(1, { type: 'SPELL' }), fn('tnSteamGuardian')) },
  // 石膚護甲匠：戰吼：若你的護甲值在本回合有變化，抽 2 張牌
  TTN_469: { abilities: play(fn('tnStoneskin')) },
  // 烈焰試煉：召喚五個有突襲的 1/1 華爾琪。當其中一個死亡時，使其他的獲得 +1/+1
  TTN_470: { abilities: play(summon('TTN_470t', 5)), tokens: ['TTN_470t'] },
  TTN_470t: {
    keywords: ['RUSH'],
    abilities: dr({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', nameIncludes: "Val'kyr Champion" } }, atk: 1, hp: 1 }),
  },
  // 憤怒熔爐：磁力。也會傷害被此手下攻擊者的相鄰手下
  TTN_471: { magnetic: true, keywords: ['CLEAVE'] },
  // 咆哮烈焰：對一個手下造成 5 點傷害。鍛造：接著對所有敵方手下隨機分配 5 點傷害
  TTN_753: { forge: 'TTN_753t', target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5, spell: true }) },
  TTN_753t: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5, spell: true }, { e: 'splitDamage', filter: enemyMinions, amount: 5, spell: true }) },
  // 熔煉：使你手牌中的一個隨機手下獲得 +3/+3。失去 3 點護甲來再做一次
  TTN_803: { abilities: play(fn('tnSmelt')) },
  // 主宰者奧丁：戰吼：在本場對戰剩下的時間，你的英雄獲得護甲後，本回合獲得等量的攻擊力
  TTN_811: { abilities: play(fn('tnOdyn')) },
  // 維札克斯將軍：突襲。戰吼：獲得 4 點護甲。亡語：失去 4 點護甲來重新召喚此手下
  YOG_500: { keywords: ['RUSH'], abilities: [...play({ e: 'armor', amount: 4 }), ...dr(fn('tnVezax'))] },
  // 久戰的無面者：戰吼：變形成一個受傷手下的複製
  YOG_501: { target: { filter: { type: 'minion', side: 'any', damaged: true }, optional: true }, abilities: play(fn('tnBattleworn')) },
  // 淨化：對所有手下造成等同你護甲值的傷害。鍛造：先獲得 3 點護甲
  YOG_502: { forge: 'YOG_502t', abilities: play(fn('tnSanitize')) },
  YOG_502t: { abilities: play({ e: 'armor', amount: 3 }, fn('tnSanitize')) },
};
