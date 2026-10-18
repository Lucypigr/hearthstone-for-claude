// ============================================================================
// 通靈學院（Scholomance Academy，SCH_，系列 1443）剩下的卡：法術爆發、研讀、靈魂碎片、雙職業卡……
// 解析器看不懂的卡在這裡手動定義；自訂效果（sc 開頭）在 game.ts 的 customScholomance。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, PendingDiscount, Pool, TargetReq } from '../engine/types';
import { LACKEYS } from './lists';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
/** 法術爆發：在你施放一張法術後觸發一次（「該法術」= it 卡） */
const burst = (...effects: Effect[]): Ability[] => [{ on: { k: 'spellCast', side: 'friendly' }, once: true, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const addCard = (card: string): Effect => ({ e: 'addCard', card, count: 1, who: 'self' });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
/** 研讀：發現一張卡，你的下一張同類卡消耗減少 (1) */
const studies = (pool: Pool, next: PendingDiscount, title?: string): Override => ({
  abilities: play(fn('scStudies', { pool, next: { amount: 1, ...next }, title })),
});
/** 摧毀你牌堆中的一張靈魂碎片來執行效果 */
const soulFragment = (...then: Effect[]): Effect => fn('scSoulFragment', { then });
const TRANSFER_STUDENTS = ['SCH_199t', 'SCH_199t2', 'SCH_199t10', 'SCH_199t12', 'SCH_199t16', 'SCH_199t17', 'SCH_199t18', 'SCH_199t19'];

export const SCHOLOMANCE_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 中立
  // 閱讀狂：在你的回合結束時，抽牌直到你有 3 張牌
  SCH_142: { abilities: atEndOfTurn(fn('twDrawUntil', { n: 3 })) },
  // 防護之袍：你的手下具有法術免疫
  SCH_146: { keywords: ['ELUSIVE'], auras: [{ scope: 'otherFriendly', keywords: ['ELUSIVE'] }] },
  // 魔法大鍋：法術爆發：施放一個相同消耗的隨機法術
  SCH_157: { abilities: burst(fn('scSameCostSpell')) },
  // 維克圖斯：戰吼：召喚兩個 1/1 的雛龍。它們各自獲得一個本場對戰中死亡的友方手下的亡語
  SCH_162: { abilities: play(fn('scVectus')), tokens: ['SCH_162t'] },
  // 發言人蓋德拉：突襲、風怒。法術爆發：獲得等同該法術消耗的攻擊力與生命值
  SCH_182: { keywords: ['RUSH', 'WINDFURY'], abilities: burst({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'itCost' }, hp: { dyn: 'itCost' } }) },
  // 轉學生：效果依牌桌而定（每場對戰抽到時隨機決定一種牌桌）
  SCH_199: { abilities: [{ on: { k: 'drawn' }, effects: [fn('identify', { cards: TRANSFER_STUDENTS })] }], tokens: TRANSFER_STUDENTS },
  SCH_199t: { keywords: ['DIVINE_SHIELD'] },
  SCH_199t2: { target: optional(anyChar), abilities: play(hit(2, false)) },
  SCH_199t10: { abilities: play(fn('ogForbidden', { kind: 'shaping' })) },
  SCH_199t12: { abilities: play({ e: 'handBuff', atk: 2, hp: 2, scope: 'random' }) },
  SCH_199t16: { keywords: ['ECHO', 'RUSH'] },
  SCH_199t17: { keywords: ['TAUNT'], abilities: play(cond({ c: 'maxMana', n: 10 }, [{ e: 'buff', target: { t: 'self' }, atk: 5, hp: 5 }])) },
  SCH_199t18: { keywords: ['RUSH'], abilities: [{ on: { k: 'overkill' }, effects: [draw()] }] },
  SCH_199t19: { abilities: play(fn('addOneOf', { cards: LACKEYS })), tokens: LACKEYS },
  // 校長科爾蘇加德：法術爆發：若該法術消滅了任何手下，召喚它們
  SCH_224: { abilities: burst(fn('scKelThuzad')) },
  // 愛玩筆的學生：戰吼：對一個手下造成 1 點傷害。法術爆發：把此手下移回你的手牌
  SCH_248: { target: optional(anyMinion), abilities: [...play(hit(1, false)), ...burst({ e: 'returnToHand', target: { t: 'self' } })] },
  // 智識之球：在你的回合開始時，看你牌堆頂的牌。你可以把它放到牌堆底，並失去 1 點耐久度
  SCH_259: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('scSphere')] }], tokens: ['SCH_259t'] },
  SCH_259t: {},
  // 食法獵能豹：戰吼：若你本回合使用過英雄能力，抽一張牌
  SCH_283: { abilities: play(cond({ c: 'heroPowerUsed' }, [draw()])) },
  // 博識者普克爾特：戰吼：把你的牌堆依消耗由高到低重新排列
  SCH_428: { abilities: play(fn('scPolkelt')) },
  // 術法代課老師：戰吼：若你有法術傷害，召喚此手下的一個複製
  SCH_530: { abilities: play(cond({ c: 'spellDamage' }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },
  // 掃帚飛魚 / 鬼祟的不良少女 / 臭屁的大四學長：亡語：把一張鬼魂加入你的手牌
  SCH_707: { keywords: ['RUSH'], abilities: dr(addCard('SCH_707t')), tokens: ['SCH_707t'] },
  SCH_708: { keywords: ['STEALTH'], abilities: dr(addCard('SCH_708t')), tokens: ['SCH_708t'] },
  SCH_709: { keywords: ['TAUNT'], abilities: dr(addCard('SCH_709t')), tokens: ['SCH_709t'] },
  // 會背書的伊萊克：每當有法術被打出，此手下會記住它。亡語：把記住的法術洗入你的牌堆
  SCH_714: { abilities: [{ on: { k: 'spellCast', side: 'any' }, effects: [fn('scElekkRemember')] }, ...dr(fn('scElekkShuffle'))] },
  // ---------------------------------------------------------------- 德魯伊
  // 小毛怪：法術爆發：召喚一個小毛怪
  SCH_242: { abilities: burst(summon('SCH_242')) },
  // 自然學研讀：發現一張法術。你的下一張法術消耗減少 (1)
  SCH_333: studies({ type: 'SPELL' }, { type: 'SPELL' }, '發現一張法術'),
  // 分配夥伴：把一隻隨機 2 費野獸與一隻隨機 3 費野獸加入你的手牌
  SCH_606: {
    abilities: play(
      { e: 'addRandom', pool: { type: 'MINION', race: 'BEAST', cost: 2 }, count: 1, who: 'self' },
      { e: 'addRandom', pool: { type: 'MINION', race: 'BEAST', cost: 3 }, count: 1, who: 'self' },
    ),
  },
  // 適者生存：使你手牌、牌堆與戰場上所有手下獲得 +4/+4
  SCH_609: { abilities: play(fn('scSurvival')) },
  // 符文雕課：二選一：召喚四個 2/2 的樹人圖騰；或超載：(2)，召喚有突襲的
  SCH_612: {
    chooseOne: [
      { id: 'SCH_612a', name: '呼叫援助', text: '召喚四個2/2樹人圖騰', abilities: play(summon('SCH_612t', 4)) },
      { id: 'SCH_612b', name: '警告森林', text: '召喚四個有<b>衝刺</b>的2/2樹人圖騰 <b>超載：</b>(2)', abilities: play(fn('scRushTotems'), fn('scOverload', { n: 2 })) },
    ],
    tokens: ['SCH_612t'],
  },
  // 林地管理員：嘲諷。戰吼：若你的手牌中有消耗 (5) 以上的法術，恢復 5 點生命值
  SCH_613: {
    keywords: ['TAUNT'],
    target: { ...anyChar, optional: true, when: { c: 'holding', type: 'SPELL', minCost: 5 } },
    abilities: play(cond({ c: 'holding', type: 'SPELL', minCost: 5 }, [{ e: 'heal', target: { t: 'chosen' }, amount: 5 }])),
  },
  // ---------------------------------------------------------------- 獵人
  // 腐亡學研讀：發現一個亡語手下。你的下一個亡語手下消耗減少 (1)
  SCH_300: studies({ type: 'MINION', hasDeathrattle: true }, { deathrattle: true }, '發現一個亡語手下'),
  // 史雷特教授：你的法術具有劇毒
  SCH_539: { flags: ['poisonousSpells'] },
  // 獸群進攻：對一個手下造成 2 點傷害。你每控制一隻野獸，多造成 1 點傷害
  SCH_604: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'friendlyRace', race: 'BEAST', base: 2 }, spell: true }) },
  // 野爪尊師：二選一：使你牌堆中的野獸獲得 +1/+1；或變形成一個友方野獸的複製
  SCH_607: {
    chooseOne: [
      { id: 'SCH_607b', name: '激怒獸群', text: '賦予你牌堆中的野獸+1/+1', abilities: play(fn('scDeckBuff', { race: 'BEAST', atk: 1, hp: 1 })) },
      {
        id: 'SCH_607a',
        name: '改變樣貌',
        text: '變形為一個友方野獸的分身',
        target: { filter: { type: 'minion', side: 'friendly', race: 'BEAST', excludeSelf: true }, optional: true },
        abilities: play(fn('scBecomeFullCopy')),
      },
    ],
  },
  // 守護獸：從你的牌堆召喚兩隻消耗 (5) 以下的野獸。使它們獲得突襲
  SCH_610: { abilities: play(fn('scGuardianAnimals')) },
  // ---------------------------------------------------------------- 法師
  // 萊斯‧霜語：在你的回合結束時，對所有敵人造成 1 點傷害（隨法術傷害提升）
  SCH_273: { abilities: atEndOfTurn(fn('scRas')) },
  // 退化魔彈：向隨機敵方手下發射三枚魔彈，把它們變形成消耗少 (1) 的手下
  SCH_235: { abilities: play(fn('scDevolvingMissiles')) },
  // 燃灼：對一個手下造成 4 點傷害。多餘的傷害會打在它兩側的手下身上
  SCH_348: { target: anyMinion, abilities: play(fn('scCombustion', { amount: 4 })) },
  // 補習課程：抽 1 張牌（隨法術傷害提升）
  SCH_353: { abilities: play({ e: 'draw', count: { dyn: 'spellDamage', base: 1 }, who: 'self' }) },
  // 大師決鬥者莫扎琪：在你施放一張法術後，獲得法術傷害 +1
  SCH_400: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('rsGainSpellDamage', { amount: 1 })] }] },
  // 符能學研讀：發現一個法術傷害手下。你的下一個法術傷害手下消耗減少 (1)
  SCH_270: studies({ type: 'MINION' }, { spellDamage: true }, '發現一個法術傷害手下'),
  // ---------------------------------------------------------------- 聖騎士
  // 終身教授圖拉揚：突襲。每當此手下攻擊一個手下時，把被攻擊者的攻擊力與生命值變成 3
  SCH_135: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('scTuralyon')] }] },
  // 權威祝福：賦予一個手下 +8/+8。它本回合無法攻擊英雄
  SCH_138: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 8, hp: 8 }, { e: 'buff', target: { t: 'chosen' }, keywords: ['CANT_ATTACK_HEROES'], temp: true }) },
  // 虔誠的門生：聖盾、嘲諷。本場對戰中你每對友方角色施放過一張法術，消耗減少 (1)
  SCH_139: { keywords: ['DIVINE_SHIELD', 'TAUNT'], costRule: { per: 'spellsOnFriendly', amount: 1 } },
  // 亞露拉院長：法術爆發：從你的牌堆施放一張法術（盡量以此手下為目標）
  SCH_141: { abilities: burst(fn('scAlura')) },
  // 銀白誇耀者：戰吼：把此手下的攻擊力與生命值變成場上的最高值
  SCH_149: { abilities: play(fn('scBraggart')) },
  // 怠惰浪潮：直到你的下個回合，把所有敵方手下的攻擊力變成 1
  SCH_250: { abilities: play(fn('scApathy')) },
  // 光明恩賜：使一個手下獲得聖盾，然後召喚一個它的 1/1 複製
  SCH_302: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, keywords: ['DIVINE_SHIELD'] }, fn('scLuminance')) },
  // 儀式之槌：法術爆發：召喚一個有嘲諷、屬性值等同該法術消耗的學生
  SCH_523: { abilities: burst(fn('scMaul')), tokens: ['SCH_523t'] },
  // 頒授典禮：從你的牌堆召喚一個手下。使它獲得嘲諷與聖盾
  SCH_533: { abilities: play(fn('scCommencement')) },
  // ---------------------------------------------------------------- 牧師
  // 卡巴侍僧：嘲諷。法術爆發：取得一個攻擊力 2 以下的隨機敵方手下的控制權
  SCH_120: { keywords: ['TAUNT'], abilities: burst({ e: 'steal', target: { t: 'random', filter: { type: 'minion', side: 'enemy', maxAttack: 2 }, count: 1 } }) },
  // 真言術：宴：賦予一個手下 +2/+2。在這個回合結束時，使它恢復全部生命值
  SCH_136: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, fn('scFeast')) },
  // 血肉巨人：你的英雄的生命值每在你的回合改變一次，消耗減少 (1)
  SCH_140: { costRule: { per: 'ownTurnHealthChanges', amount: 1 } },
  // 移心者伊露希亞：戰吼：直到回合結束，把你的手牌換成你對手手牌的複製
  SCH_159: { abilities: play(fn('scIllucia')) },
  // 龍類學研讀：發現一條龍。你的下一條龍消耗減少 (1)
  SCH_233: studies({ type: 'MINION', race: 'DRAGON' }, { race: 'DRAGON' }, '發現一條龍'),
  // 脆骨摧毀者：戰吼：若你的英雄的生命值本回合改變過，消滅一個手下
  SCH_513: {
    target: { filter: { type: 'minion', side: 'any', excludeSelf: true }, optional: true, when: { c: 'heroHealthChanged' } },
    abilities: play(cond({ c: 'heroHealthChanged' }, [{ e: 'destroy', target: { t: 'chosen' } }])),
  },
  // 死者復生：對你的英雄造成 3 點傷害。把本場對戰中死亡的兩個友方手下移回你的手牌
  SCH_514: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 3, spell: true }, fn('scRaiseDead')) },
  // ---------------------------------------------------------------- 盜賊
  // 不老實的大二生：潛行。法術爆發：把一張連擊卡加入你的手牌
  SCH_234: { keywords: ['STEALTH'], abilities: burst({ e: 'addRandom', pool: { combo: true }, count: 1, who: 'self' }) },
  // 秘密通道：把你的手牌換成你牌堆中的 4 張牌。下個回合再換回來
  SCH_305: { abilities: play(fn('scSecretPassage')) },
  // 入侵者莉莉安：潛行。亡語：召喚一個 4/2 的被遺忘者莉莉安，它會攻擊一個隨機敵人
  SCH_426: { keywords: ['STEALTH'], abilities: dr(fn('aoNagrandSlam', { card: 'SCH_426t', n: 1 })), tokens: ['SCH_426t'] },
  // 腦部凍結：凍結一個手下。連擊：也對它造成 3 點傷害
  SCH_509: { target: anyMinion, abilities: play({ e: 'freeze', target: { t: 'chosen' } }, cond({ c: 'combo' }, [hit(3)])) },
  // 狐狸人淬毒師：你的武器 +2 攻擊力
  SCH_519: { flags: ['weaponAtk2'] },
  // 脅迫：消滅一個受傷的手下。連擊：改為可以消滅任何手下
  SCH_521: { target: anyMinion, abilities: play(fn('scCoerce')) },
  // 鋼刃舞者：戰吼：召喚一個消耗等同你武器攻擊力的隨機手下
  SCH_522: { abilities: play(fn('scSteeldancer')) },
  // ---------------------------------------------------------------- 薩滿
  // 勤學的筆記達人：法術爆發：把該法術移回你的手牌
  SCH_236: { abilities: burst(fn('scReturnSpell')) },
  // 熔岩爆裂：造成 2 點傷害。召喚等量的 1/1 元素
  SCH_271: { target: anyChar, abilities: play(fn('scMoltenBlast')), tokens: ['SCH_271t'] },
  // 符文匕首：在你的英雄攻擊後，本回合獲得法術傷害 +1
  SCH_301: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('rsSpellDamageTurn', { amount: 1 })] }] },
  // 炎心講師：戰吼：發現一張消耗 (1) 以上的法術。若你本回合打出它，重複此效果
  SCH_507: { abilities: play(fn('scFireheart')) },
  // 戲法圖騰：在你的回合結束時，施放一張消耗 (3) 以下的隨機法術
  SCH_537: { abilities: atEndOfTurn(fn('scTrickTotem')) },
  // 圖騰巨像：亡語：召喚全部四個基本圖騰。超載：(1)
  SCH_615: { overload: 1, abilities: dr(fn('scAllTotems')) },
  // ---------------------------------------------------------------- 術士
  // 骨網蛛卵：亡語：召喚兩隻 2/1 的蜘蛛。若你棄掉這張牌，觸發它的亡語
  SCH_147: { abilities: [...dr(summon('SCH_147t', 2)), { on: { k: 'discarded' }, effects: [summon('SCH_147t', 2)] }], tokens: ['SCH_147t'] },
  // 虛無飲魂者：嘲諷。戰吼：摧毀你牌堆中的一張靈魂碎片來獲得 +3/+3
  SCH_343: { keywords: ['TAUNT'], abilities: play(soulFragment({ e: 'buff', target: { t: 'self' }, atk: 3, hp: 3 })) },
  // 闇光學者：戰吼：摧毀你牌堆中的一張靈魂碎片來造成 3 點傷害
  SCH_517: { target: optional(anyChar), abilities: play(soulFragment(hit(3, false))) },
  // 詹迪斯‧巴羅夫：戰吼：召喚兩個隨機 5 費手下。秘密選擇其中一個，它受到傷害時就會死亡
  SCH_351: { abilities: play(fn('scJandice')) },
  // 幻象藥水：把你的手下的 1/1 複製加入你的手牌，它們的消耗為 (1)
  SCH_352: { abilities: play(fn('scIllusionPotion')) },
  // 魔化哲學：複製你手牌中消耗最低的惡魔。流放：使兩者都獲得 +1/+1
  SCH_702: { abilities: play(fn('scFelosophy')) },
  // 靈魂學家瑪麗希亞：戰吼：你牌堆中每有一張靈魂碎片，就召喚一個有突襲的 3/3 靈魂
  SCH_703: { abilities: play({ e: 'repeat', times: { dyn: 'soulFragments' }, effects: [summon('SCH_703t')] }), tokens: ['SCH_703t'] },
  // ---------------------------------------------------------------- 戰士
  // 體育學研讀：發現一個突襲手下。你的下一個突襲手下消耗減少 (1)
  SCH_237: studies({ type: 'MINION', keyword: 'RUSH' }, { keyword: 'RUSH' }, '發現一個突襲手下'),
  // 死神鐮刀：法術爆發：本回合也會傷害被攻擊者兩側的手下
  SCH_238: { abilities: burst(fn('scScythe')) },
  // 關鍵助攻手：在你打出一個突襲手下後，召喚一個只剩 1 點生命值的複製
  SCH_317: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itKeyword', k: 'RUSH' }, effects: [fn('scPlaymaker')] }] },
  // 問題學生：在你的回合結束時，召喚兩個 3/3 的無賴，它們會攻擊隨機敵人
  SCH_337: { abilities: atEndOfTurn(fn('aoNagrandSlam', { card: 'SCH_337t', n: 2 })), tokens: ['SCH_337t'] },
  // 血骨傀儡：亡語：以 -1/-1 重新召喚此手下
  SCH_621: { abilities: dr(fn('scRattlegore')) },
  // ---------------------------------------------------------------- 惡魔獵人
  // 仇恨循環：對所有手下造成 3 點傷害。每消滅一個手下，召喚一個 3/3 的怨魂
  SCH_253: { abilities: play(fn('scCycleOfHatred')), tokens: ['SCH_253t'] },
  // 狩法者：突襲。每當此手下攻擊一個手下時，使它沉默
  SCH_276: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('scMagehunter')] }] },
  // 精準弦月弓：在你的英雄攻擊一個手下後，你的手下也會攻擊它
  SCH_279: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, cond: { c: 'attackedMinion' }, effects: [fn('scTrueaim')] }] },
  // 上古虛無獵犬：在你的回合結束時，從所有敵方手下身上偷取 1 點攻擊力與生命值
  SCH_354: { abilities: atEndOfTurn(fn('scVoidHound')) },
  // 裂魂秘術使：戰吼：摧毀你牌堆中的一張靈魂碎片，來對所有其他手下造成 3 點傷害
  SCH_355: { abilities: play(soulFragment({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, amount: 3 })) },
  // 滑翔：把你的手牌洗入你的牌堆，抽 4 張牌。流放：你的對手也這麼做
  SCH_356: { abilities: play(fn('scGlide')) },
  // 惡犬護主：召喚三個有嘲諷的 1/2 惡魔。在你的手牌中時，每當一個友方手下死亡，消耗減少 (1)
  SCH_357: { abilities: play(summon('SCH_357t', 3)), handAbilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('ogProphet')] }], tokens: ['SCH_357t'] },
  // 二段跳：從你的牌堆抽一張流放卡
  SCH_422: { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { outcast: true } }) },
  // 頂尖獵人克里恩：你的其他角色在攻擊時免疫
  SCH_538: { flags: ['othersImmuneAttacking'] },
  // 惡魔夥伴：召喚一個隨機的惡魔夥伴
  SCH_600: { abilities: play(fn('summonOneOf', { cards: ['SCH_600t1', 'SCH_600t2', 'SCH_600t3'] })), tokens: ['SCH_600t1', 'SCH_600t2', 'SCH_600t3'] },
  // 模範生史黛琳娜：流放：看你對手手牌中的 3 張牌。把其中一張洗入他的牌堆
  SCH_603: { abilities: play(cond({ c: 'outcast' }, [fn('scStelina')])) },
  // 血腥使者：在你的手牌中時，每當一個友方手下死亡，獲得 +1/+1
  SCH_618: { handAbilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('growInHand', { atk: 1, hp: 1 })] }] },
  // 魂石工匠：戰吼：摧毀你牌堆中的一張靈魂碎片，使你的英雄本回合 +5 攻擊力
  SCH_704: { abilities: play(soulFragment({ e: 'heroAttack', amount: 5 })) },
};
