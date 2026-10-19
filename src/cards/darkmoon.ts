// ============================================================================
// 暗月馬戲團（Madness at the Darkmoon Faire，DMF_ / YOP_，系列 1466）剩下的卡：
// 古神、克蘇恩的碎片、暗月競速賽（YOP_）……
// 解析器看不懂的卡在這裡手動定義；自訂效果（dm 開頭）在 game.ts 的 customDarkmoon。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, Pool, TargetReq } from '../engine/types';
import { ANIMAL_COMPANIONS } from './lists';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const burst = (...effects: Effect[]): Ability[] => [{ on: { k: 'spellCast', side: 'friendly' }, once: true, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1, pool?: Pool): Effect => ({ e: 'draw', count, who: 'self', pool });
const heroHit = (...effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const allFriendlyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const imprisoned = (extra: Override = {}): Override => ({
  ...extra,
  abilities: [...(extra.abilities ?? []), { on: { k: 'summoned' }, effects: [fn('twDormantSelf', { turns: 2 })] }],
});
const CTHUN_PIECES = ['DMF_254t3', 'DMF_254t4', 'DMF_254t5', 'DMF_254t7'];
/** 克蘇恩的碎片：施放後累計，四塊都打出後把克蘇恩洗回牌堆 */
const piece = (...effects: Effect[]): Override => ({ abilities: play(...effects, fn('dmCthunPiece')) });

export const DARKMOON_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 中立
  // 『深淵之神』恩若司：戰吼：為每一種手下類型復活一個友方手下
  DMF_002: { abilities: play(fn('dmNzoth')) },
  // 『命運主宰』尤格薩倫：戰吼：若你在本場對戰中施放過 10 張法術，轉動尤格薩倫之輪
  DMF_004: { abilities: play(cond({ c: 'spellsCast', n: 10 }, [fn('dmYoggWheel')])) },
  // 香蕉商人：戰吼：把 2 根香蕉加入每位玩家的手牌
  DMF_065: { abilities: play({ e: 'addCard', card: 'DMF_065t', count: 2, who: 'self' }, { e: 'addCard', card: 'DMF_065t', count: 2, who: 'opponent' }), tokens: ['DMF_065t'] },
  // 樂觀的巨魔：有 50% 的機率攻擊正確的敵人
  DMF_068: { flags: ['misdirect'] },
  // 希拉斯‧暗月：戰吼：選擇一個方向，旋轉所有手下
  DMF_074: { abilities: play(fn('dmSilas')), tokens: ['DMF_074a', 'DMF_074b'] },
  DMF_074a: {},
  DMF_074b: {},
  // 不可疑的逃票者：戰吼：從你的牌堆施放一個奧秘
  DMF_079: { abilities: play(fn('coCastDeckSecret')) },
  // 克西爾祭儀師：嘲諷。戰吼：把一個隨機 4 費手下加入你對手的手牌
  DMF_081: { keywords: ['TAUNT'], abilities: play({ e: 'addRandom', pool: { type: 'MINION', cost: 4, anyClass: true }, count: 1, who: 'opponent' }) },
  // 安全檢查員：戰吼：把你手牌中消耗最低的卡洗入你的牌堆。抽一張牌
  DMF_125: { abilities: play(fn('dmSafetyInspector'), draw()) },
  // 『褻瀆者』亞煞拉懼：戰吼：把本場對戰中你打出的每張已腐化卡的複製加入你的手牌，它們本回合消耗為 (0)
  DMF_188: { abilities: play(fn('dmYShaarj')) },
  // 出軌飛車：戰吼：你的手牌中每有一個手下，就召喚一個有突襲的 1/1 乘客
  DMF_202: { abilities: play(fn('dmCoaster')), tokens: ['DMF_523t'] },
  // 『分裂者』克蘇恩：對戰開始：分裂成四塊碎片。戰吼：造成 30 點傷害，隨機分配到所有敵人身上
  DMF_254: { startOfGame: 'cthunShattered', abilities: play({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 30 }), tokens: CTHUN_PIECES },
  DMF_254t3: piece({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 7, spell: true }),
  DMF_254t4: piece({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 3, spell: true }),
  DMF_254t5: { ...piece(summon('DMF_254t5t')), tokens: ['DMF_254t5t'] },
  DMF_254t7: { target: anyMinion, ...piece({ e: 'destroy', target: { t: 'chosen' } }) },
  // 遊行領隊：在你召喚一個突襲手下後，使它獲得 +2 攻擊力
  DMF_520: { abilities: [{ on: { k: 'summon', side: 'friendly' }, cond: { c: 'itKeyword', k: 'RUSH' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2 }] }] },
  // 馬戲團聚合體：嘲諷。擁有所有手下類型
  DMF_532: { keywords: ['TAUNT'] },
  // 死亡看守者：亡語無法觸發
  YOP_012: { flags: ['noDeathrattles'] },
  // 鑰匙看守者艾弗利：戰吼：發現一張任何職業的雙職業法術。法術爆發：再獲得一張
  YOP_018: { abilities: [...play(fn('dmIvory')), ...burst(fn('dmIvoryCopy'))] },
  // 伸縮包：發現一張消耗等同你剩餘法力水晶的卡
  YOP_029: { abilities: play(fn('dmResizingPouch')) },
  // 魔焰神射手：你的英雄能力消耗減少 (1)
  YOP_030: { flags: ['heroPowerDiscount1'] },
  // 月牙：每次最多只會受到 1 點傷害
  YOP_035: { flags: ['damageCap1'] },
  // 攔路守衛：召喚一個有嘲諷的 2/4 守衛。若它是你唯一的手下，再召喚一個
  YOP_005: { abilities: play(fn('dmBarricade')), tokens: ['YOP_005t'] },
  // 大暴走：選擇一個敵方手下。它會攻擊隨機手下直到死亡
  YOP_006: { target: enemyMinion, abilities: play(fn('dmHysteria')) },
  // 集合！：復活一個 1 費、2 費與 3 費的友方手下
  YOP_009: { abilities: play(fn('dmRally')) },
  // ---------------------------------------------------------------- 德魯伊
  // 體重比一比：抽一張牌。猜你的下一張牌消耗比較高或比較低，猜中就抽出它
  DMF_075: { abilities: play(fn('dmGuessWeight')), tokens: ['DMF_075a', 'DMF_075a2'] },
  DMF_075a: {},
  DMF_075a2: {},
  // ---------------------------------------------------------------- 獵人
  // 恩若司珠寶：召喚三個本場對戰中死亡的友方亡語手下
  DMF_084: { abilities: play(fn('dmJewel')) },
  // 暗月坦克：亡語：向隨機敵人發射四枚飛彈，每枚造成 2 點傷害
  DMF_085: { abilities: dr({ e: 'repeat', times: 4, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 }] }) },
  // 可愛動物區：召喚一隻 3/3 的陸行鳥。你每控制一個奧秘，就重複一次
  DMF_086: { abilities: play({ e: 'repeat', times: { dyn: 'secrets', base: 1 }, effects: [summon('DMF_086e')] }), tokens: ['DMF_086e'] },
  // 奔行的犀牛：突襲。在此手下攻擊並消滅一個手下後，多餘的傷害會打在敵方英雄身上
  DMF_087: {
    keywords: ['RUSH'],
    abilities: [
      { on: { k: 'attack', subject: 'self' }, effects: [fn('dmRhinoMark')] },
      { on: { k: 'attack', subject: 'self', after: true }, effects: [fn('dmRhinoExcess')] },
    ],
  },
  // 瑞林的步槍：在你的英雄攻擊後，發現一個奧秘並施放它
  DMF_088: { abilities: heroHit(fn('discoverSecretCast', { count: 1 })) },
  // 瑪克希瑪‧布萊頓海默：戰吼：從你的牌堆召喚一個手下。它攻擊敵方英雄，然後死亡
  DMF_089: { abilities: play(fn('dmMaxima')) },
  // 打開牢籠：奧秘：在你的回合開始時，若你控制兩個手下，召喚一個動物夥伴
  DMF_123: {
    secret: true,
    abilities: [{ on: { k: 'secret', ev: 'turnStart' }, cond: { c: 'control', min: 2 }, effects: [fn('summonOneOf', { cards: ANIMAL_COMPANIONS })] }],
    tokens: ANIMAL_COMPANIONS,
  },
  // ---------------------------------------------------------------- 法師
  // 遊戲攤位老闆：你每回合打出的第一個奧秘消耗為 (1)
  DMF_102: { costAuras: [{ side: 'friendly', secret: true, firstSecret: true, set: 1 }] },
  // 閉幕大會：召喚一個 8/8 的元素。你上回合每打出一個元素，就重複一次
  DMF_104: { abilities: play({ e: 'repeat', times: { dyn: 'elementalsLastTurn', base: 1 }, effects: [summon('DMF_104t')] }), tokens: ['DMF_104t'] },
  // 作弊的遊戲：奧秘：若你在對手的回合沒有受到傷害，抽 3 張牌
  DMF_107: {
    secret: true,
    abilities: [{ on: { k: 'secret', ev: 'enemyTurnEnd' }, cond: { c: 'not', cond: { c: 'heroDamagedThisTurn' } }, effects: [draw(3)] }],
  },
  // 失心套牌：把你牌堆中的法術變形成消耗多 (3) 的法術（保留原本的消耗）
  DMF_108: { abilities: play(fn('dmDeckOfLunacy')) },
  // 『暗月先知』賽吉：戰吼：抽 @ 張牌（本場對戰中每觸發過一個友方奧秘就升級）
  DMF_109: { abilities: play({ e: 'draw', count: { dyn: 'secretsTriggered', base: 1 }, who: 'self' }) },
  // 冰河競速手：法術爆發：對所有被凍結的敵人造成 3 點傷害
  YOP_020: { abilities: burst({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy', frozen: true } }, amount: 3 }) },
  // 召喚法力軟餅：把一塊可以回復 2 個法力水晶的軟餅加入你的手牌
  YOP_019: { abilities: play({ e: 'addCard', card: 'YOP_019t', count: 1, who: 'self' }), tokens: ['YOP_019t'] },
  YOP_019t: { abilities: play({ e: 'mana', kind: 'refresh', amount: 2 }) },
  // 被囚禁的鳳凰：休眠 2 回合。法術傷害 +2
  YOP_021: imprisoned({ spellDamage: 2 }),
  // ---------------------------------------------------------------- 聖騎士
  // 氣球商人：戰吼：使你的白銀之手新兵獲得 +1 攻擊力與聖盾
  DMF_235: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', nameIncludes: 'Silver Hand Recruit' } }, atk: 1, keywords: ['DIVINE_SHIELD'] }) },
  // 尤格來啦！：奧秘：當你的對手施放一張法術時，改為施放一張相同消耗的隨機法術
  DMF_236: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyCastsSpell' }, effects: [fn('dmOhMyYogg')] }] },
  // 活動宣傳者：每當你召喚一個生命值為 1 的手下，使它獲得 +1/+2
  DMF_237: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('dmBarker')] }] },
  // 大主教伊芮爾：戰吼：若你的牌堆沒有中立卡，獲得突襲、生命竊取、嘲諷與聖盾
  DMF_241: { abilities: play(cond({ c: 'deckNoNeutral' }, [{ e: 'buff', target: { t: 'self' }, keywords: ['RUSH', 'LIFESTEAL', 'TAUNT', 'DIVINE_SHIELD'] }])) },
  // 點心吃透透：發現一張法術。為你的英雄恢復等同它消耗的生命值
  DMF_195: { abilities: play(fn('dmSnackRun')) },
  // 被囚禁的星穹戰馬：休眠 2 回合。法術爆發：使你的手下獲得聖盾
  YOP_010: imprisoned({ abilities: burst({ e: 'buff', target: allFriendlyMinions, keywords: ['DIVINE_SHIELD'] }) }),
  // 審判聖契：腐化：獲得生命竊取
  YOP_011: {},
  YOP_011t: { keywords: ['LIFESTEAL'] },
  // ---------------------------------------------------------------- 牧師
  // 古翰之血：嘲諷。在你的回合結束時，召喚你牌堆中一個手下的 5/5 複製
  DMF_053: { keywords: ['TAUNT'], abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('rsCopyFromDeck', { count: 1, atk: 5, hp: 5 })] }] },
  // 亞煞拉懼塑像：召喚你牌堆中一個手下的 10/10 複製
  DMF_055: { abilities: play(fn('rsCopyFromDeck', { count: 1, atk: 10, hp: 10 })) },
  // 『血神』古翰：戰吼：抽 2 張牌。它們改為消耗生命值
  DMF_056: { abilities: play(fn('dmGhuun')) },
  // 無名者：戰吼：選擇一個手下。變成它的 4/4 複製，然後使它沉默
  DMF_116: {
    target: { filter: { type: 'minion', side: 'any', excludeSelf: true }, optional: true },
    abilities: play(fn('becomeCopy', { atk: 4, hp: 4 }), { e: 'silence', target: { t: 'chosen' } }),
  },
  // 納茲曼織血者：在你施放一張法術後，使你手牌中一張隨機卡的消耗減少 (1)
  DMF_120: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('dmRandomDiscount')] }] },
  // 占卜機：嘲諷。戰吼：你的手牌中每有一張法術，獲得 +1/+1
  DMF_121: { keywords: ['TAUNT'], abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'spellsInHand' }, hp: { dyn: 'spellsInHand' } }) },
  // 看手相：發現一張法術。使你手牌中的法術消耗減少 (1)
  DMF_187: { abilities: play(fn('dmPalmReading')) },
  // 黑暗審判官克珊內絲：戰吼：使你手牌與牌堆中所有腐化與已腐化的卡消耗減少 (2)
  YOP_007: { abilities: play(fn('dmXanesh')) },
  // 聖光戰馬：你的治療效果也會使受到治療的手下獲得 +2 生命值
  YOP_008: { flags: ['lightsteed'] },
  // ---------------------------------------------------------------- 盜賊
  // 『人間赤煙』添武：戰吼：把一個友方手下移回你的手牌。它本回合消耗為 (1)
  DMF_071: { target: { filter: { type: 'minion', side: 'friendly', excludeSelf: true }, optional: true }, abilities: play(fn('dmTenwu')) },
  // 暗影複製體：奧秘：在一個手下攻擊你的英雄後，召喚一個它的有潛行的複製
  DMF_513: { secret: true, abilities: [{ on: { k: 'secret', ev: 'afterMinionAttacksHero' }, effects: [fn('dmShadowClone')] }] },
  // 獎品券兌換者：亡語：把 3 張獎品券洗入你的牌堆。抽到時召喚一隻 3/3 的玩偶熊
  DMF_514: { abilities: dr({ e: 'shuffle', card: 'DMF_514t', count: 3 }), tokens: ['DMF_514t'] },
  DMF_514t: { castsWhenDrawn: true, abilities: play(summon('DMF_514t2')), tokens: ['DMF_514t2'] },
  // 詐騙：抽一張法術。連擊：也抽一個手下
  DMF_515: { abilities: play(draw(1, { type: 'SPELL' }), cond({ c: 'combo' }, [draw(1, { type: 'MINION' })])) },
  // 杉札拉女皇：戰吼：發現你牌堆中的一張卡，並抽出它的所有複製
  DMF_516: { abilities: play(fn('dmShekzara')) },
  // 惡意打擊：消滅一個手下。你牌堆中每有一張不是一開始就在裡面的卡，消耗減少 (1)
  DMF_518: { target: anyMinion, costRule: { per: 'nonStartingInDeck', amount: 1 }, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  // 獎品盜掠者：連擊：本回合你每打出過一張其他卡，就對一個手下造成 1 點傷害
  DMF_519: { target: { ...anyMinion, optional: true, when: { c: 'combo' } }, abilities: play(cond({ c: 'combo' }, [fn('dmPlunderer')])) },
  // 詭計：奧秘：當你的對手在一個回合中抽到第二張牌時，把它變形成香蕉
  YOP_017: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemySecondDraw' }, effects: [fn('dmShenanigans')] }], tokens: ['DMF_065t'] },
  // 心動詐欺師：戰吼：若你的手牌中有奧秘，施放它並抽一張牌
  YOP_016: { abilities: play(fn('dmSparkjoy')) },
  // ---------------------------------------------------------------- 薩滿
  // 轉化：把所有手下變形成消耗相同的隨機手下
  DMF_700: { abilities: play(fn('dmRevolve')) },
  // 暗月死鬥場：召喚一個 3/2 的決鬥者。若你的英雄本回合攻擊過，再召喚一個
  DMF_706: { abilities: play(summon('DMF_706t'), cond({ c: 'heroAttacked' }, [summon('DMF_706t')])), tokens: ['DMF_706t'] },
  // 因娜拉‧暴風墜：在你的回合，你的英雄 +2 攻擊力並具有風怒
  DMF_708: { flags: ['inara'] },
  // 崩石流土：對所有敵方手下造成 1 點傷害。若你被超載，再造成 1 點傷害
  YOP_023: { abilities: play({ e: 'damage', target: allEnemyMinions, amount: 1, spell: true }, cond({ c: 'overloaded' }, [{ e: 'damage', target: allEnemyMinions, amount: 1, spell: true }])) },
  // 指引：看兩張法術。把一張加入你的手牌，或超載：(1) 兩張都拿
  YOP_024: { abilities: play(fn('dmGuidance')), tokens: ['YOP_024t'] },
  YOP_024t: {},
  // ---------------------------------------------------------------- 術士
  // 噴火人：戰吼：對所有非惡魔手下造成 2 點傷害
  DMF_110: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', notRace: 'DEMON' } }, amount: 2 }) },
  // 免費入場：抽 2 個手下。若它們都是惡魔，消耗減少 (2)
  DMF_113: { abilities: play(fn('dmFreeAdmission')) },
  // 虛無搗蛋鬼：戰吼：每位玩家各摧毀一個法力水晶
  DMF_115: { abilities: play({ e: 'mana', kind: 'destroy', amount: 1, who: 'self' }, { e: 'mana', kind: 'destroy', amount: 1, who: 'opponent' }) },
  // 惡毒低語：棄掉你消耗最低的卡。使你的手下獲得 +1/+1
  DMF_119: { abilities: play(fn('discardLowest'), { e: 'buff', target: allFriendlyMinions, atk: 1, hp: 1 }) },
  // 混沌套牌：交換你牌堆中所有手下的消耗與攻擊力
  DMF_534: { abilities: play(fn('dmDeckOfChaos')) },
  // 特使拉司維克斯：亡語：把 3 個隨機至尊傳說手下洗入你的牌堆
  YOP_004: { abilities: dr(fn('dmRustwix')) },
  // ---------------------------------------------------------------- 戰士
  // 主持人的短棒：在你的英雄攻擊後，使你手牌中的一個機械、龍與海盜獲得 +1/+1
  DMF_524: {
    abilities: heroHit(
      { e: 'handBuff', atk: 1, hp: 1, scope: 'random', race: 'MECHANICAL' },
      { e: 'handBuff', atk: 1, hp: 1, scope: 'random', race: 'DRAGON' },
      { e: 'handBuff', atk: 1, hp: 1, scope: 'random', race: 'PIRATE' },
    ),
  },
  // 表演主持人華利：戰吼：抽一個機械、一條龍與一個海盜
  DMF_525: { abilities: play(draw(1, { race: 'MECHANICAL' }), draw(1, { race: 'DRAGON' }), draw(1, { race: 'PIRATE' })) },
  // 帳篷報廢者：突襲。你每控制一種不同類型的友方手下，消耗減少 (1)
  DMF_528: { keywords: ['RUSH'], costRule: { per: 'uniqueFriendlyTypes', amount: 1 } },
  // 『重金屬之神』牛頭大佬：在一個友方突襲手下攻擊後，對敵方英雄造成 2 點傷害
  DMF_529: { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, effects: [fn('dmEtc')] }] },
  // 一肩扛起：使你手牌中一個隨機嘲諷手下獲得 +5/+5
  DMF_530: { abilities: play(fn('dmFeatOfStrength')) },
  // 尖刺之輪：在你的英雄有護甲值時 +3 攻擊力
  YOP_013: { atkIf: { cond: { c: 'armor', n: 1 }, atk: 3 } },
  // 鐵甲戰車：戰吼：若你的英雄有護甲值，獲得 +2/+2
  YOP_014: { abilities: play(cond({ c: 'armor', n: 1 }, [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }])) },
  // ---------------------------------------------------------------- 惡魔獵人
  // 跨線者：你的流放卡消耗減少 (1)
  DMF_217: { flags: ['outcastDiscount'] },
  // 獲救的放逐者：在你打出一張流放卡後，獲得 +1/+1
  DMF_222: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('dmPariah')] }] },
  // 投擲戰刃：對一個手下造成 2 點傷害。若它死亡，把一張暫時的投擲戰刃加入你的手牌
  DMF_225: { target: anyMinion, abilities: play(fn('dmThrowGlaive')) },
  // 持刃女士：突襲。若你的英雄有 6 點以上的攻擊力，消耗為 (1)
  DMF_226: { keywords: ['RUSH'], costIf: { cond: { c: 'heroAtk', n: 6 }, cost: 1 } },
  // 高蹺手：戰吼：抽一張牌。若你本回合打出它，本回合使你的英雄 +4 攻擊力
  DMF_229: { abilities: play(fn('dmDrawFollow', { id: 'stilt' })) },
  // 伊蓋諾斯：生命竊取。你的生命竊取改為對敵方英雄造成傷害，而不是治療你
  DMF_230: { keywords: ['LIFESTEAL'], flags: ['lifestealDamagesEnemy'] },
  // 空中特技：抽 2 張牌。若你本回合把它們都打出，再抽 2 張
  DMF_249: { abilities: play(fn('dmDrawFollow', { id: 'acro', n: 2 })) },
  // 魔刃豹：只有在你的英雄本回合攻擊過時才能攻擊
  YOP_002: { flags: ['attackIfHeroAttacked'] },
};
