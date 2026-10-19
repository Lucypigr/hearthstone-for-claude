// ============================================================================
// 暴風城（United in Stormwind，SW_，系列 1578）剩下的卡：任務線、坐騎、符印、軍情七處……
// 解析器看不懂的卡在這裡手動定義；自訂效果（sw 開頭）在 game.ts 的 customStormwind。
// 任務線沿用支線任務（dgSidequest）的追蹤；完成一段會自動開始下一段。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, Trig, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const addCard = (card: string, count = 1, who: 'self' | 'opponent' = 'self'): Effect => ({ e: 'addCard', card, count, who });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const heroHit = (...effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allFriendlyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
/** 坐騎：賦予一個手下增益，它死亡時召喚坐騎 */
const mount = (atk: number, hp: number, token: string, keywords?: Override['keywords']): Override => ({
  target: anyMinion,
  abilities: play({ e: 'buff', target: { t: 'chosen' }, atk, hp, keywords, abilities: dr(summon(token)) }),
  tokens: [token],
});

/** 任務線的一段：目標、要累計的事件、獎勵；next = 下一段（最後一段的獎勵是傳說手下） */
interface Part {
  goal: number;
  on: Trig;
  reward: Effect[];
  cond?: Condition;
  amount?: 'itCost' | 'eventAmount';
  kind?: string;
  list?: (number | string)[];
}
const questline = (part: Part, next?: string): Override => ({
  abilities: play(fn('dgSidequest', { ...part, questline: true, reward: [...part.reward, ...(next ? [fn('swNextQuest', { card: next })] : [])] })),
  ...(next ? { tokens: [next] } : {}),
});
const pirates: Trig = { k: 'cardPlayed', side: 'friendly', cardType: 'MINION', race: 'PIRATE' };
const anyCard: Trig = { k: 'cardPlayed', side: 'friendly' };
const SPY_GIZMOS = ['SW_052t4', 'SW_052t5', 'SW_052t6', 'SW_052t7', 'SW_052t8_t'];
const ADVENTURERS = ['WC_034t', 'WC_034t2', 'WC_034t3', 'WC_034t4', 'WC_034t5', 'WC_034t6'];

export const STORMWIND_OVERRIDES: Record<string, Override> = {
  // ================================================================ 任務線
  // 戰士：掠奪碼頭 → 分散注意 → 劫走貨物 → 洛卡菈船長
  SW_028: questline({ goal: 3, on: pirates, reward: [{ e: 'draw', count: 1, who: 'self', pool: { type: 'WEAPON' } }] }, 'SW_028t'),
  SW_028t: questline({ goal: 3, on: pirates, reward: [{ e: 'repeat', times: 2, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2, spell: true }] }] }, 'SW_028t2'),
  SW_028t2: { ...questline({ goal: 3, on: pirates, reward: [addCard('SW_028t5')] }), tokens: ['SW_028t5'] },
  SW_028t5: { abilities: play(summon('SW_028t6')), tokens: ['SW_028t6'] },
  // 毀滅巨艦：永久（休眠）。在你的回合開始時，召喚一個海盜、裝備一把戰士武器，並發射兩發造成 2 點傷害的砲彈
  SW_028t6: { keywords: ['DORMANT'], abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('swJuggernaut')] }] },
  // 薩滿：呼風喚水 → 激盪土石 → 馴服火焰 → 風暴召喚者布魯坎
  SW_031: questline({ goal: 3, on: anyCard, cond: { c: 'itHasOverload' }, reward: [fn('ogUnlockOverload')] }, 'SW_031t'),
  SW_031t: { ...questline({ goal: 3, on: anyCard, cond: { c: 'itHasOverload' }, reward: [summon('SW_031t8')] }, 'SW_031t2'), tokens: ['SW_031t2', 'SW_031t8'] },
  SW_031t2: { ...questline({ goal: 2, on: anyCard, cond: { c: 'itHasOverload' }, reward: [addCard('SW_031t7')] }), tokens: ['SW_031t7'] },
  SW_031t7: { abilities: play(fn('swBrukan')) },
  // 惡魔獵人：一決雌雄 → 累積力量 → 關閉傳送門 → 屠魔者克圖斯
  SW_039: questline({ goal: 4, on: { k: 'draw', side: 'friendly' }, kind: 'drawTurn', reward: [fn('swDrawnDiscount')] }, 'SW_039t'),
  SW_039t: questline({ goal: 5, on: { k: 'draw', side: 'friendly' }, kind: 'drawTurn', reward: [fn('swDrawnDiscount')] }, 'SW_039t3'),
  SW_039t3: { ...questline({ goal: 5, on: { k: 'draw', side: 'friendly' }, kind: 'drawTurn', reward: [addCard('SW_039t3_t')] }), tokens: ['SW_039t3_t'] },
  SW_039t3_t: { abilities: play(fn('swKurtrus')) },
  // 盜賊：發現假冒者 → 得知真相 → 淪為叛徒 → 間諜大師史蓋伯斯
  SW_052: { ...questline({ goal: 2, on: anyCard, cond: { c: 'itNameIncludes', s: 'SI:7' }, reward: [fn('addOneOf', { cards: SPY_GIZMOS })] }, 'SW_052t'), tokens: ['SW_052t', ...SPY_GIZMOS] },
  SW_052t: questline({ goal: 2, on: anyCard, cond: { c: 'itNameIncludes', s: 'SI:7' }, reward: [fn('addOneOf', { cards: SPY_GIZMOS })] }, 'SW_052t2'),
  SW_052t2: { ...questline({ goal: 2, on: anyCard, cond: { c: 'itNameIncludes', s: 'SI:7' }, reward: [addCard('SW_052t3')] }), tokens: ['SW_052t3'] },
  SW_052t3: { abilities: play(...SPY_GIZMOS.map((id) => addCard(id))) },
  SW_052t4: { target: enemyMinion, abilities: play({ e: 'returnToHand', target: { t: 'chosen' } }) },
  SW_052t5: { abilities: play(fn('swSpyomatic')) },
  SW_052t6: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, keywords: ['STEALTH'] }) },
  SW_052t7: { abilities: dr({ e: 'damage', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 }, amount: 3 }) },
  SW_052t8_t: { keywords: ['STEALTH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [{ e: 'addRandom', pool: { cls: 'opponent' }, count: 1, who: 'self' }] }] },
  // 術士：惡魔之種 → 建立連結 → 完成儀式 → 荒裔塔姆辛
  SW_091: questline({ goal: 12, on: { k: 'damaged', subject: 'friendlyHero' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, amount: 'eventAmount', reward: [fn('swLifestealFace', { amount: 3 })] }, 'SW_091t'),
  SW_091t: questline({ goal: 12, on: { k: 'damaged', subject: 'friendlyHero' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, amount: 'eventAmount', reward: [fn('swLifestealFace', { amount: 3 })] }, 'SW_091t3'),
  SW_091t3: { ...questline({ goal: 12, on: { k: 'damaged', subject: 'friendlyHero' }, cond: { c: 'not', cond: { c: 'opponentTurn' } }, amount: 'eventAmount', reward: [addCard('SW_091t4')] }), tokens: ['SW_091t4'] },
  SW_091t4: { abilities: play(fn('swTamsin')) },
  // 聖騎士：挺身而出 → 開路先鋒 → 為死者復仇 → 聖光之裔凱瑞爾
  SW_313: { ...questline({ goal: 3, on: anyCard, cond: { c: 'itCost', n: 1 }, kind: 'distinct', reward: [{ e: 'equip', card: 'CS2_091' }] }, 'SW_313t'), tokens: ['SW_313t', 'CS2_091'] },
  SW_313t: questline({ goal: 3, on: anyCard, cond: { c: 'itCost', n: 1 }, kind: 'distinct', reward: [fn('upgradeHeroPower')] }, 'SW_313t2'),
  SW_313t2: { ...questline({ goal: 3, on: anyCard, cond: { c: 'itCost', n: 1 }, kind: 'distinct', reward: [addCard('SW_313t4')] }), tokens: ['SW_313t4'] },
  SW_313t4: { abilities: play(fn('swCariel')) },
  // 獵人：守護矮人區 → 佔領制高點 → 清光敵人 → 『狙擊高手』塔維西
  SW_322: questline({ goal: 3, on: { k: 'spellCast', side: 'friendly' }, kind: 'spellHit', reward: [fn('swPowerTargetsMinions')] }, 'SW_322t'),
  SW_322t: questline({ goal: 2, on: { k: 'spellCast', side: 'friendly' }, kind: 'spellHit', reward: [fn('swPowerCostZero')] }, 'SW_322t2'),
  SW_322t2: { ...questline({ goal: 2, on: { k: 'spellCast', side: 'friendly' }, kind: 'spellHit', reward: [addCard('SW_322t4')] }), tokens: ['SW_322t4'] },
  SW_322t4: { abilities: play(fn('swTavish')) },
  // 德魯伊：公園迷途 → 保護松鼠 → 野性之友 → 壯壯葛夫
  SW_428: questline({ goal: 4, on: { k: 'heroAtkGain' }, amount: 'eventAmount', reward: [{ e: 'armor', amount: 5 }] }, 'SW_428t'),
  SW_428t: questline({ goal: 5, on: { k: 'heroAtkGain' }, amount: 'eventAmount', reward: [{ e: 'armor', amount: 5 }, draw()] }, 'SW_428t2'),
  SW_428t2: { ...questline({ goal: 6, on: { k: 'heroAtkGain' }, amount: 'eventAmount', reward: [addCard('SW_428t4')] }), tokens: ['SW_428t4'] },
  SW_428t4: { keywords: ['TAUNT'], abilities: play({ e: 'heroAttack', amount: 8 }, { e: 'armor', amount: 8 }) },
  // 牧師：尋求指引 → 發現虛無碎片 → 照亮虛無 → 『聖化者』賽瑞菈
  SW_433: questline({ goal: 3, on: anyCard, kind: 'costs', list: [2, 3, 4], reward: [fn('discoverFromDeck')] }, 'SW_433t'),
  SW_433t: questline({ goal: 2, on: anyCard, kind: 'costs', list: [5, 6], reward: [fn('discoverFromDeck')] }, 'SW_433t2'),
  SW_433t2: { ...questline({ goal: 2, on: anyCard, kind: 'costs', list: [7, 8], reward: [addCard('SW_433t3')] }), tokens: ['SW_433t3'] },
  SW_433t3: { keywords: ['TAUNT'], abilities: play({ e: 'shuffle', card: 'SW_433t3a', count: 1 }), tokens: ['SW_433t3a'] },
  SW_433t3a: { abilities: play(fn('swPurifiedShard')) },
  // 法師：法師的策略 → 拖延時間 → 抵達傳送室 → 秘法師瓦登
  SW_450: questline({ goal: 3, on: { k: 'spellCast', side: 'friendly' }, kind: 'schools', list: ['FIRE', 'FROST', 'ARCANE'], reward: [{ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL' } }] }, 'SW_450t'),
  SW_450t: questline({ goal: 3, on: { k: 'spellCast', side: 'friendly' }, kind: 'schools', list: ['FIRE', 'FROST', 'ARCANE'], reward: [fn('swDiscoverSchool')] }, 'SW_450t2'),
  SW_450t2: { ...questline({ goal: 3, on: { k: 'spellCast', side: 'friendly' }, kind: 'schools', list: ['FIRE', 'FROST', 'ARCANE'], reward: [addCard('SW_450t4')] }), tokens: ['SW_450t4'] },
  SW_450t4: { abilities: play(fn('swDawngrasp')) },
  // 受困的法師：戰吼：若你控制一個任務，發現一張法術
  SW_400: { abilities: play(cond({ c: 'questActive' }, [{ e: 'discover', pool: { type: 'SPELL' } }])) },

  // ================================================================ 中立
  // 雙面投資人：在你的回合結束時，使你手牌中一張卡的消耗減少 (1)（50% 機率改為增加）
  SW_036: { abilities: atEndOfTurn(fn('swInvestor')) },
  // 拍賣師亞克森：每當你更換一張卡，改為從你的牌堆發現一張牌抽出
  SW_045: { flags: ['jaxon'] },
  // 香料麵包烘焙師：戰吼：為你的英雄恢復等同你手牌張數的生命值
  SW_056: { abilities: play({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: { dyn: 'handSize' } }) },
  // 包裹遞送員：只有在你的手牌有至少 8 張時才能攻擊
  SW_057: { attackIf: { c: 'handSize', op: '>=', n: 8 } },
  // 花藝師：在你的回合結束時，使你手牌中一張自然法術的消耗減少 (1)
  SW_060: { abilities: atEndOfTurn(fn('swHandDiscount', { school: 'NATURE' })) },
  // 北郡農夫：戰吼：選擇一個友方野獸。把它的三張 3/3 複製洗入你的牌堆
  SW_064: { target: optional({ filter: { type: 'minion', side: 'friendly', race: 'BEAST', excludeSelf: true } }), abilities: play(fn('swFarmer')) },
  // 熊貓人進口商：戰吼：發現一張不是一開始就在你牌堆中的法術
  SW_065: { abilities: play(fn('swImporter')) },
  // 積極的銀行職員：在你的回合結束時，存放你牌堆中的一張牌。亡語：把存放的牌加入你的手牌
  SW_069: { abilities: [...atEndOfTurn(fn('swBankerStore')), ...dr(fn('swBankerReturn'))] },
  // 郵箱舞者：戰吼：把一張幸運幣加入你的手牌。亡語：給你的對手一張
  SW_070: { abilities: [...play(addCard('GAME_005')), ...dr(addCard('GAME_005', 1, 'opponent'))] },
  // 雄獅守衛：戰吼：若你的生命值在 15 以下，獲得 +2/+4 與嘲諷
  SW_071: { abilities: play(cond({ c: 'heroHealth', op: '<=', n: 15 }, [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 4, keywords: ['TAUNT'] }])) },
  // 乳酪商：每當你的對手施放一張法術，把一張相同消耗的隨機法術加入你的手牌
  SW_073: { abilities: [{ on: { k: 'spellCast', side: 'enemy' }, effects: [fn('swCheesemonger')] }] },
  // 貴族：戰吼：把你手牌中一張隨機卡的（金色）複製加入你的手牌
  SW_074: { abilities: play(fn('swNobleman')) },
  // 艾爾文森林野豬：亡語：若本場對戰中你有 10 隻艾爾文森林野豬死亡，裝備一把 15/3 的萬千真理之劍
  SW_075: { abilities: dr(cond({ c: 'graveyardCount', name: 'Elwynn Boar', n: 10 }, [{ e: 'equip', card: 'SW_075t' }])), tokens: ['SW_075t'] },
  SW_075t: { abilities: heroHit(fn('swThousandTruths')) },
  // 監獄囚犯：一開始處於休眠。在你打出 3 張牌後甦醒
  SW_077: {
    abilities: [
      { on: { k: 'summoned' }, effects: [fn('swPrisonerStart')] },
      { on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('swPrisonerTick')] },
    ],
  },
  // 普瑞斯托女士：戰吼：把你牌堆中的手下變形成隨機的龍（保留原本的屬性值與消耗）
  SW_078: { abilities: play(fn('swPrestor')) },
  // 飛行管理員杜加爾：戰吼：選擇一條飛行路線並休眠，完成時甦醒並獲得獎勵
  SW_079: { abilities: play(fn('swDungar')), tokens: ['SW_079t', 'SW_079t2', 'SW_079t3', ...ADVENTURERS] },
  SW_079t: {},
  SW_079t2: {},
  SW_079t3: {},
  // 『暴風城之王』瓦里安：戰吼：抽一個突襲手下來獲得突襲。嘲諷與聖盾也一樣
  SW_081: { abilities: play(fn('swVarian')) },
  // 糾纏不休的小販：可交易。亡語：從你的牌堆召喚一個糾纏不休的小販
  SW_042: { keywords: ['TRADEABLE'], abilities: dr(fn('swRecruitSame')) },
  // 負重運貨馱騾：嘲諷。當你抽到這張牌時，把它的一張複製加入你的手牌
  SW_306: { keywords: ['TAUNT'], abilities: [{ on: { k: 'drawn' }, effects: [addCard('SW_306')] }] },
  // 旅行商人：可交易。戰吼：你每控制一個其他友方手下，獲得 +1/+1
  SW_307: { keywords: ['TRADEABLE'], abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'otherFriendlyMinions' }, hp: { dyn: 'otherFriendlyMinions' } }) },
  // 軍情七處潛伏者：潛行。戰吼：你抽的下一張牌消耗減少 (1)
  SW_418: { keywords: ['STEALTH'], abilities: play(fn('swNextDrawDiscount', { amount: 1 })) },
  // ================================================================ 德魯伊
  // 伊露恩神諭者：在你打出一個消耗 (2) 以下的手下後，召喚一個它的複製
  SW_419: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itCostAtMost', n: 2 }, effects: [{ e: 'summonCopy', target: { t: 'it' }, count: 1 }] }] },
  // 科多獸坐騎：賦予一個手下 +4/+2 與突襲。當它死亡時，召喚一隻科多獸
  SW_432: mount(4, 2, 'SW_432t', ['RUSH']),
  // 巫木爪獸：在你的英雄獲得攻擊力後，此手下獲得 +2 攻擊力
  SW_436: { abilities: [{ on: { k: 'heroAtkGain' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 2 }] }] },
  // 灑肥：賦予你的手下「亡語：抽一張牌」
  SW_437: { abilities: play({ e: 'buff', target: allFriendlyMinions, abilities: dr(draw()) }) },
  // 沙德拉斯‧月樹：戰吼：你抽到的下 3 張法術變成抽到時施放
  SW_447: { abilities: play(fn('swSheldras')) },
  // ================================================================ 獵人
  // 尺寸驚人的老鼠：召喚七隻 1/1 的老鼠。戰場放不下的會帶著 +4/+4 回到你的手牌
  SW_320: { abilities: play(fn('swRats')), tokens: ['SW_455t'] },
  // 瞄準射擊：造成 3 點傷害。你的下一次英雄能力多造成 2 點傷害
  SW_321: { target: anyChar, abilities: play(hit(3), fn('swNextPowerDamage', { amount: 2 })) },
  // 老鼠王：突襲。亡語：進入休眠。在 5 個友方手下死亡後復活
  SW_323: {
    keywords: ['RUSH'],
    abilities: [...dr(fn('goDormant', { need: 5 })), { on: { k: 'minionDied', side: 'friendly' }, effects: [fn('dormantTick', { need: 5 })] }],
  },
  // 製皮工具包：在三隻友方野獸死亡後，抽一隻野獸並使它獲得 +1/+1。失去 1 點耐久度
  SW_457: { abilities: [{ on: { k: 'minionDied', side: 'friendly', race: 'BEAST' }, effects: [fn('swWeaponCount', { n: 3, kind: 'leather' })] }] },
  // 猛羊坐騎：賦予一個手下 +2/+2 與攻擊時免疫。當它死亡時，召喚一隻山羊
  SW_458: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2, abilities: dr(summon('SW_458t')) }, fn('swImmuneAttacking')), tokens: ['SW_458t'] },
  SW_458t: { flags: ['immuneAttacking'] },
  // 群起而噬：選擇一個敵方手下。你的手下攻擊它，然後把死亡的移回你的手牌
  SW_460: { target: enemyMinion, abilities: play(fn('swDevouringSwarm')) },
  // 進口狼蛛：可交易。亡語：召喚兩隻有劇毒與突襲的 1/1 蜘蛛
  SW_463: { keywords: ['TRADEABLE'], abilities: dr(summon('SW_463t', 2)), tokens: ['SW_463t'] },
  // ================================================================ 法師
  // 天界墨水組：在你花費 5 點法力施放法術後，使你手牌中一張法術的消耗減少 (5)。失去 1 點耐久度
  SW_001: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'SPELL' }, effects: [fn('swWeaponCount', { n: 5, kind: 'ink', amount: 'itCost' })] }] },
  // 笨拙的信差：戰吼：施放你手牌中消耗最高的法術
  SW_109: { abilities: play(fn('swCourier')) },
  // 點燃：造成 @ 點傷害。把一張多造成 1 點傷害的點燃洗入你的牌堆
  SW_110: { target: anyChar, abilities: play(fn('swIgnite')) },
  // 聖所蠟燭：在你施放一張火焰法術後，抽一張法術
  SW_111: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FIRE' }, effects: [{ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL' } }] }] },
  // 普瑞斯托的火占師：戰吼：你的下一張火焰法術具有法術傷害 +2
  SW_112: { abilities: play(fn('swPyromancer', { amount: 2 })) },
  // 大魔導師安東尼達斯：戰吼：若你在前三個回合都施放過火焰法術，向隨機敵人施放 3 顆火球
  SW_113: { abilities: play(cond({ c: 'fireLastThreeTurns' }, [fn('swAntonidas')])) },
  // 焦炎之痕：本回合你的下一張火焰法術消耗減少 (2)
  SW_462: { abilities: play({ e: 'pendingDiscount', d: { school: 'FIRE', type: 'SPELL', amount: 2, thisTurn: true } }) },
  // ================================================================ 聖騎士
  // 稜彩珠寶盒：在一個友方手下失去聖盾後，使你手牌中的手下獲得 +1/+1。失去 1 點耐久度
  SW_048: { abilities: [{ on: { k: 'shieldLost', side: 'friendly' }, effects: [{ e: 'handBuff', atk: 1, hp: 1, scope: 'all' }, fn('swLoseDurability')] }] },
  // 祝福的商品：發現一個奧秘、一把武器或一個聖盾手下
  SW_049: { abilities: play(fn('swBlessedGoods')) },
  // 烏瑞恩首席劍師：聖盾。戰吼：若此手下有至少 4 點攻擊力，獲得突襲
  SW_305: { keywords: ['DIVINE_SHIELD'], abilities: play(cond({ c: 'selfAttack', n: 4 }, [{ e: 'buff', target: { t: 'self' }, keywords: ['RUSH'] }])) },
  // 高貴的坐騎：賦予一個手下 +1/+1 與聖盾。當它死亡時，召喚一匹戰馬
  SW_316: mount(1, 1, 'SW_316t', ['DIVINE_SHIELD']),
  // ================================================================ 牧師
  // 暗影布縫針：在你施放一張暗影法術後，對所有敵人造成 1 點傷害。失去 1 點耐久度
  SW_012: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'SHADOW' }, effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 1 }, fn('swLoseDurability')] }] },
  // 墓之呼喚：發現一個亡語手下。若你有足夠的法力打出它，觸發它的亡語
  SW_440: { abilities: play(fn('swCallOfTheGrave')) },
  // 伊萊克坐騎：賦予一個手下 +4/+7 與嘲諷。當它死亡時，召喚一隻伊萊克
  SW_443: mount(4, 7, 'SW_443t', ['TAUNT']),
  // 暮光詐欺者：戰吼：若本回合有英雄受到傷害，抽一張暗影法術
  SW_444: { abilities: play(cond({ c: 'anyHeroDamagedThisTurn' }, [{ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL', spellSchool: 'SHADOW' } }])) },
  // 懼靈魔：在你施放一張暗影法術後，對每位英雄造成 2 點傷害
  SW_445: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'SHADOW' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'both' }, amount: 2 }] }] },
  // 虛無之觸侍從：雙方英雄受到的所有傷害增加 1 點
  SW_446: { flags: ['heroesTakeExtra'] },
  // ================================================================ 盜賊
  // 千面女梅斯特拉：你以另一個職業開始對戰，直到你打出一張盜賊卡
  SW_050: { startOfGame: 'maestra' },
  // 小道消息：抽一張消耗 (4) 以下的亡語卡。觸發它的亡語
  SW_405: { abilities: play(fn('swSketchy')) },
  // 偽造的刀刃：戰吼：獲得一個本場對戰中死亡的隨機友方亡語手下的複製
  SW_310: { abilities: play(fn('swCounterfeit')) },
  // 絞喉：對敵方英雄造成 2 點傷害。把 3 張流血洗入你的牌堆，抽到時再造成 2 點傷害
  SW_311: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 2, spell: true }, { e: 'shuffle', card: 'SW_311t', count: 3 }), tokens: ['SW_311t'] },
  SW_311t: { castsWhenDrawn: true, abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 2, spell: true }) },
  // 軍情七處線人：戰吼：本場對戰中你每打出過一張其他軍情七處卡，獲得 +1/+1
  SW_411: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'si7Played' }, hp: { dyn: 'si7Played' } }) },
  // 軍情七處勒索：可交易。對一個未受傷的角色造成 3 點傷害
  SW_412: { keywords: ['TRADEABLE'], target: { filter: { type: 'character', side: 'any', undamaged: true } }, abilities: play(hit(3)) },
  // 軍情七處特務：突襲。在此手下攻擊一個手下後，獲得潛行
  SW_413: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, cond: { c: 'attackedMinion' }, effects: [{ e: 'buff', target: { t: 'self' }, keywords: ['STEALTH'] }] }] },
  // 軍情七處刺客：本場對戰中你每打出過一張軍情七處卡，消耗減少 (1)。連擊：消滅一個敵方手下
  SW_417: {
    costRule: { per: 'si7Played', amount: 1 },
    target: { ...enemyMinion, optional: true, when: { c: 'combo' } },
    abilities: play(cond({ c: 'combo' }, [{ e: 'destroy', target: { t: 'chosen' } }])),
  },
  // 高利貸惡鯊：戰吼：給你的對手一張幸運幣。亡語：你獲得兩張
  SW_434: { abilities: [...play(addCard('GAME_005', 1, 'opponent')), ...dr(addCard('GAME_005', 2))] },
  // ================================================================ 薩滿
  // 拍賣槌：在你的英雄攻擊後，使你手牌中一個戰吼手下的消耗減少 (1)
  SW_025: { abilities: heroHit(fn('swHandDiscount', { battlecry: true })) },
  // 幽靈狼首領：在你打出一張有超載的卡後，召喚一隻有嘲諷的 2/3 幽靈狼
  SW_026: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itHasOverload' }, effects: [summon('EX1_tk11')] }], tokens: ['EX1_tk11'] },
  // 花崗爐裔：戰吼：使你手牌與牌堆中的元素消耗減少 (1)
  SW_032: { abilities: play(fn('swElementalDiscount')) },
  // 小小玩具：召喚四個隨機 5 費手下。把它們變成 2/2
  SW_034: { abilities: play(fn('swTinyToys')) },
  // 充能呼喚：發現一個 @ 費手下並召喚它（本場對戰中你每打出一張超載卡就升級）
  SW_035: { abilities: play(fn('swChargedCall')) },
  // 投資機會：抽一張超載卡
  SW_095: { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { overload: true } }) },
  // 包那‧錘喙：在你打出一個戰吼手下後，重複本回合打出的第一個戰吼
  SW_115: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasBattlecry' }, effects: [fn('swBolner')] }] },
  // ================================================================ 術士
  // 符文秘銀棒：在你抽 4 張牌後，使你手牌中的卡消耗減少 (1)。失去 1 點耐久度
  SW_003: { abilities: [{ on: { k: 'draw', side: 'friendly' }, effects: [fn('swWeaponCount', { n: 4, kind: 'rod' })] }] },
  // 恐懼坐騎：賦予一個手下 +1/+1。當它死亡時，召喚一匹無盡的恐懼戰馬
  SW_087: mount(1, 1, 'SW_087t'),
  SW_087t: { abilities: dr({ e: 'atEndOfTurn', effects: [summon('SW_087t')] }) },
  // 難搞的顧客：戰吼：對所有其他手下造成等同你手牌張數的傷害
  SW_089: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, amount: { dyn: 'handSize' } }) },
  // 安納塞隆：若你的手牌已滿，消耗為 (1)
  SW_092: { costIf: { cond: { c: 'handFull' }, cost: 1 } },
  // ================================================================ 戰士
  // 膽小的蠻兵：亡語：從你的牌堆召喚一個手下
  SW_021: { abilities: dr({ e: 'recruit', count: 1 }) },
  // 挑釁：可交易。選擇一個友方手下。敵方手下攻擊它
  SW_023: { keywords: ['TRADEABLE'], target: friendlyMinion, abilities: play(fn('swProvoke')) },
  // 洛薩：在你的回合結束時，攻擊一個隨機敵方手下。若它死亡，獲得 +3/+3
  SW_024: { abilities: atEndOfTurn(fn('swLothar')) },
  // 嚇唬他們！：對一個手下造成 2 點傷害。若你控制一個海盜，改為造成 5 點
  SW_027: { target: anyMinion, abilities: play(cond({ c: 'control', race: 'PIRATE' }, [hit(5)], [hit(2)])) },
  // 遙控魔像：在此手下受到傷害後，把兩個魔像零件洗入你的牌堆。抽到時召喚一個 2/1 的機械
  SW_097: { abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [{ e: 'shuffle', card: 'SW_097t', count: 2 }] }], tokens: ['SW_097t'] },
  SW_097t: { castsWhenDrawn: true, abilities: play(summon('skele21')), tokens: ['skele21'] },
  // ================================================================ 惡魔獵人
  // 怒縛蠻卒：嘲諷。本回合你每抽一張牌，消耗減少 (1)
  SW_037: { keywords: ['TAUNT'], costRule: { per: 'drawnThisTurn', amount: 1 } },
  // 魔化彈幕：對生命值最低的敵人造成 2 點傷害，兩次
  SW_040: { abilities: play(fn('swFelBarrage')) },
  // 矯捷符印：在你的下個回合開始時，抽一張牌並使它的消耗減少 (1)
  SW_041: { abilities: play({ e: 'delayed', turns: 1, effects: [fn('swDrawDiscount', { amount: 1 })] }) },
  // 捷斯‧暗織者：戰吼：施放本場對戰中你打出過的所有邪能法術（盡量指定敵人）
  SW_044: { abilities: play(fn('swJace')) },
  // 惡魔化鰭：嘲諷。戰吼：若你本回合施放過邪能法術，獲得 +2/+2
  SW_451: { keywords: ['TAUNT'], abilities: play(cond({ c: 'castSchoolThisTurn', school: 'FEL' }, [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }])) },
  // 混沌抽吸：生命竊取。對一個手下造成 3 點傷害。流放：改為造成 5 點
  SW_452: { keywords: ['LIFESTEAL'], target: anyMinion, abilities: play(cond({ c: 'outcast' }, [hit(5)], [hit(3)])) },
  // 雄獅之狂：攻擊力等同你本回合抽的牌數
  SW_454: { atkPer: { dyn: 'drawnThisTurn' } },
};
