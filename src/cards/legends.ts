// ============================================================================
// 傳奇音樂節（Festival of Legends）：獨奏、和聲 / 不和諧（每回合切換）、重混（每回合改變）、
// 溢療、樂器武器（裝備時強化）、搖滾對決……
// 解析器看不懂的卡在這裡手動定義；自訂效果（fl 開頭）在 game.ts 的 customLegends。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, Pool, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count: number, pool?: Pool): Effect => ({ e: 'draw', count, who: 'self', pool });
const addCard = (card: string, count = 1): Effect => ({ e: 'addCard', card, count, who: 'self' });
const addRandom = (pool: Pool, count = 1): Effect => ({ e: 'addRandom', pool, count, who: 'self' });
const dmg = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
/** 獨奏：若你沒有控制其他手下 */
const solo: Condition = { c: 'noOtherMinions' };
const finale: Condition = { c: 'finale' };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq, when?: Condition): TargetReq => ({ ...t, optional: true, ...(when ? { when } : {}) });
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const enemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
/** 樂器武器：裝備時累積計數（亡語用 @） */
const tune = (on: Ability['on'], when?: string): Ability => ({ on, effects: [fn('flTune', when ? { when } : {})] });

/** 和聲 ↔ 不和諧：每個你的回合切換 */
export const HARMONIC_PAIRS: Record<string, string> = {
  ETC_314: 'ETC_314t',
  ETC_314t: 'ETC_314',
  ETC_379: 'ETC_379t',
  ETC_379t: 'ETC_379',
  ETC_427: 'ETC_427t',
  ETC_427t: 'ETC_427',
  ETC_506: 'ETC_506t',
  ETC_506t: 'ETC_506',
  ETC_717: 'ETC_717t',
  ETC_717t: 'ETC_717',
};
/** 重混：每個你的回合變成下一個版本 */
export const REMIXES: Record<string, string[]> = {
  JAM_000: ['JAM_000t', 'JAM_000t2', 'JAM_000t3', 'JAM_000t4'],
  JAM_012: ['JAM_012t', 'JAM_012t2', 'JAM_012t3', 'JAM_012t4'],
  JAM_015: ['JAM_015t', 'JAM_015t2', 'JAM_015t3', 'JAM_015t4'],
  JAM_018: ['JAM_018t', 'JAM_018t2', 'JAM_018t3', 'JAM_018t4'],
  JAM_033: ['JAM_033t', 'JAM_033t2', 'JAM_033t3', 'JAM_033t4'],
};
export const MOVEMENTS = ['ETC_085t', 'ETC_085t2', 'ETC_085t3', 'ETC_085t4', 'ETC_085t6', 'ETC_085t7', 'ETC_085t8'];
/** 樂器武器亡語的起始數值 */
export const INSTRUMENTS: Record<string, number> = { ETC_317: 1, ETC_388: 1, ETC_405: 1, ETC_423: 1, ETC_518: 1, ETC_520: 1, ETC_813: 1, ETC_832: 1 };

export const LEGENDS_OVERRIDES: Record<string, Override> = {
  // ================================================================ 中立
  // E.T.C.樂團經理：組牌時組一個 3 張牌的樂團。戰吼：發現其中一張！
  ETC_080: { abilities: play(fn('flBand')) },
  // 音效擴大器：戰吼：把你的法力上限與手牌上限設為 11
  ETC_087: { abilities: play(fn('flAmplifier')) },
  // 靜電波形：在每個回合開始時，隨機失去 1 點攻擊力或生命值
  ETC_089: { abilities: [{ on: { k: 'turnStart', whose: 'each' }, effects: [fn('flWaveform')] }] },
  // 狼人巡迴工作人員：戰吼：為你的對手召喚一個 0/3 的樂器箱
  ETC_098: { abilities: play({ e: 'summon', card: 'ETC_098t', count: 1, who: 'opponent' }), tokens: ['ETC_098t'] },
  ETC_098t: { abilities: dr({ e: 'addRandom', pool: { type: 'WEAPON', anyClass: true }, count: 1, who: 'opponent' }) },
  // 牛鈴獨奏家：戰吼：若你沒有控制其他手下，造成 2 點傷害
  ETC_101: { target: optional(anyChar, solo), abilities: play(cond(solo, [dmg(2, false)])) },
  // 潮人：戰吼：發現一張你對手職業、不在他們牌堆中的法術
  ETC_103: { abilities: play(fn('flHipster')) },
  // 人群衝浪者：亡語：使任何另一個手下獲得 +1/+1 與此亡語
  ETC_104: { abilities: dr(fn('flCrowdSurfer')) },
  // 頻率振盪器：戰吼：你打出的下一個機械消耗減少 (1)
  ETC_106: { abilities: play({ e: 'pendingDiscount', d: { amount: 1, race: 'MECHANICAL' } }) },
  // 喧鬧的粉絲 / 痴迷的粉絲 / 煩人的粉絲：選擇一個手下。此手下存活時它……
  ETC_107: { target: optional(anyMinion), abilities: play(fn('flFan')) },
  ETC_108: { target: optional(anyMinion), abilities: play(fn('flFan')) },
  ETC_109: { target: optional(anyMinion), abilities: play(fn('flFan')) },
  // 翻唱藝人：戰吼：變形成一個手下的 3/3 複製
  ETC_110: { target: optional(anyMinion), abilities: play(fn('flCoverArtist')) },
  // 攝影師費茲爾：戰吼：拍下你目前手牌的快照，洗入你的牌堆（每場對戰一次）
  ETC_113: { abilities: play(fn('flFizzle')), tokens: ['ETC_113t'] },
  ETC_113t: { abilities: play(fn('flSnapshot')) },
  // 自由鳥：衝鋒。戰吼：本場對戰中你每打出過一隻其他的自由鳥，獲得 +1/+1
  ETC_336: { keywords: ['CHARGE'], abilities: play(fn('flPlayedBuff', { name: 'Freebird' })) },
  // 過氣明星：亡語：召喚一個過去的隨機 5 費手下
  ETC_349: { abilities: dr(fn('flPastMinion', { cost: 5 })) },
  // 派對動物：戰吼：使你手牌中每種種族的手下各一個獲得 +1/+1
  ETC_350: { abilities: play(fn('flPartyAnimal')) },
  // 單一混合體樂團：戰吼：本場對戰中你每打出過一種種族的手下，獲得一個隨機額外效果
  ETC_409: { abilities: play(fn('flOneAmalgam')) },
  // 混搭樂迷：突襲。在此手下攻擊後，獲得 +1 攻擊力並攻擊一個隨機敵方手下
  ETC_419: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('flMosher')] }] },
  // 服裝裁縫：戰吼：使一個友方手下獲得等同此手下的攻擊力與生命值
  ETC_420: { target: optional(friendlyMinion), abilities: play(fn('flTailor')) },
  // 節拍侏儒：在你打出一張 (1) 費卡後，抽一張 (2) 費卡（然後增加！）
  ETC_422: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('flMetrognome')] }] },
  // 音效工程師波茲克：戰吼：把兩個 3/3 機器人加入你對手的手牌。亡語：為你自己召喚它們
  ETC_425: { abilities: [...play({ e: 'addCard', card: 'ETC_425t', count: 2, who: 'opponent' }), ...dr(summon('ETC_425t', 2))], tokens: ['ETC_425t'] },
  // 滾石：突襲。戰吼：若你上一張打出的牌消耗為 (1)，獲得 +1/+1
  ETC_742: { keywords: ['RUSH'], abilities: play(fn('flRollingStone')) },
  // 重混音樂家：突襲。在你的手牌中時獲得一個每回合改變的額外效果
  JAM_033: { keywords: ['RUSH'], tokens: ['JAM_033t', 'JAM_033t2', 'JAM_033t3', 'JAM_033t4'] },
  JAM_033t: { keywords: ['RUSH', 'DIVINE_SHIELD'] },
  JAM_033t2: { keywords: ['RUSH', 'WINDFURY'] },
  JAM_033t3: { keywords: ['RUSH', 'LIFESTEAL'] },
  JAM_033t4: { keywords: ['RUSH', 'POISONOUS'] },
  // 喇叭踐踏者：可交易。戰吼：敵方法術在下個回合消耗增加 (2)
  JAM_034: { keywords: ['TRADEABLE'], abilities: play({ e: 'spellTax', amount: 2 }) },
  // 恐怖圖騰掃興鬼：戰吼：棄掉一張武器來抽 3 張牌
  JAM_035: { abilities: play(fn('flBuzzkill')) },
  // 音樂剋星瑪加莎：戰吼：抽 5 張牌。把抽到的法術給你的對手
  JAM_036: { abilities: play(fn('flMagatha')) },
  // 精英牛頭人勇士：終章：開始一場搖滾對決！
  JAM_037: { abilities: play(cond(finale, [fn('flRockDuel')])), tokens: ['JAM_037t'] },
  JAM_037t: {},

  // ================================================================ 死亡騎士
  // 高潮死靈爆炸：生命竊取。造成 6 點傷害。召喚 3 個 2/2 的靈魂（隨你花費的屍體隨機強化）
  ETC_210: { keywords: ['LIFESTEAL'], target: anyChar, abilities: play(fn('flNecroticExplosion')) },
  // 奧金開膛者：亡語：召喚一個 1/1 有生命竊取的不死族（在你的回合改變你的生命值來強化）
  ETC_423: { abilities: [tune({ k: 'healed', subject: 'friendly' }, 'heroHealth'), tune({ k: 'damaged', subject: 'friendlyHero' }, 'heroHealth'), ...dr(fn('flInstrument'))], tokens: ['ETC_423t'] },
  ETC_423t: { keywords: ['LIFESTEAL'] },
  // 和聲金屬 / 不和諧金屬
  ETC_427: { abilities: play(fn('flHandBuffN', { n: 4, atk: 2, hp: 2 })), tokens: ['ETC_427t'] },
  ETC_427t: { abilities: play(fn('flHandBuffN', { n: 2, atk: 4, hp: 4 })) },
  // 死亡金屬騎士：嘲諷。若你的英雄本回合被治療過，消耗生命值而不是法力
  ETC_523: { keywords: ['TAUNT'], costsHealthIf: { c: 'heroHealed' } },

  // ================================================================ 惡魔獵人
  // 吉他獨奏家：戰吼：若你沒有控制其他手下，抽一張法術、一個手下與一把武器
  ETC_026: { abilities: play(cond(solo, [draw(1, { type: 'SPELL' }), draw(1, { type: 'MINION' }), draw(1, { type: 'WEAPON' })])) },
  // 衝上舞台：抽兩個突襲手下。它們消耗減少 (1)
  ETC_200: { abilities: play(fn('flRushStage')) },
  // 暗影之眼：你的英雄具有生命竊取
  ETC_398: { flags: ['heroLifestealAura'] },
  // 哈薇莉亞‧暗鴉：突襲。在一個友方突襲手下攻擊後，使你的手下獲得 +1 攻擊力
  ETC_399: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, cond: { c: 'itKeyword', k: 'RUSH' }, effects: [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 1 }] }] },
  // 樂器破壞者：每當你的武器被摧毀，裝備一把隨機的惡魔獵人武器
  ETC_400: { abilities: [{ on: { k: 'weaponDestroyed', side: 'friendly' }, effects: [fn('flSmasher')] }] },
  // 刃吉他：亡語：抽 1 張牌（裝備時打出流放卡來強化）
  ETC_405: { abilities: [tune({ k: 'cardPlayed', side: 'friendly' }, 'outcast'), ...dr(fn('flInstrument'))] },
  // 蛇咬：突襲。戰吼：本回合每有一個手下死亡，獲得 +1/+1
  ETC_410: { keywords: ['RUSH'], abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'deathsThisTurn' }, hp: { dyn: 'deathsThisTurn' } }) },
  // 保全！！：召喚兩個有突襲的 1/1 伊利達瑞。流放：再召喚一個
  ETC_411: { abilities: play(summon('BT_036t', 2), cond({ c: 'outcast' }, [summon('BT_036t')])) },
  // 揮舞到最後：本回合使你的英雄 +2 攻擊力與免疫，然後攻擊每個敵方手下
  ETC_413: { abilities: play(fn('flGoingDown')) },
  // 深淵貝斯手：嘲諷、生命竊取。本場對戰中你每裝備過一把武器，消耗減少 (2)
  JAM_016: { keywords: ['TAUNT', 'LIFESTEAL'], costRule: { per: 'weaponsEquipped', amount: 2 } },
  // 重混狂想曲
  JAM_018: { tokens: ['JAM_018t', 'JAM_018t2', 'JAM_018t3', 'JAM_018t4'], abilities: play({ e: 'damage', target: allMinions, amount: 3, spell: true }) },
  JAM_018t: { abilities: play({ e: 'damage', target: allMinions, amount: 3, spell: true }, draw(3)) },
  JAM_018t2: { abilities: play({ e: 'damage', target: allMinions, amount: 3, spell: true }, { e: 'damage', target: allMinions, amount: 3, spell: true }) },
  JAM_018t3: { abilities: play({ e: 'damage', target: allMinions, amount: 3, spell: true }, { e: 'heroAttack', amount: 5 }) },
  JAM_018t4: { abilities: play({ e: 'damage', target: allMinions, amount: 3, spell: true }, summon('JAM_018t5')), tokens: ['JAM_018t5'] },
  JAM_018t5: {},

  // ================================================================ 德魯伊
  // 和聲心情 / 不和諧心情
  ETC_379: { abilities: play({ e: 'heroAttack', amount: 2 }, { e: 'armor', amount: 4 }), tokens: ['ETC_379t'] },
  ETC_379t: { abilities: play({ e: 'heroAttack', amount: 4 }, { e: 'armor', amount: 2 }) },
  // 自由之魂：戰吼與亡語：你的英雄能力在本場對戰中多獲得 1 點護甲
  ETC_382: { abilities: [...play(fn('flPowerBonus', { armor: 1 })), ...dr(fn('flPowerBonus', { armor: 1 }))] },
  // 傳播福音：抽 2 張牌。你的英雄每有 1 點攻擊力，消耗減少 (1)
  ETC_384: { costRule: { per: 'heroAttack', amount: 1 }, abilities: play(draw(2)) },
  // 律動貓：戰吼與亡語：你的英雄能力在本場對戰中多給你的英雄 1 點攻擊力
  ETC_385: { abilities: [...play(fn('flPowerBonus', { atk: 1 })), ...dr(fn('flPowerBonus', { atk: 1 }))] },
  // 佐克‧霧鼻：戰吼：召喚兩個有嘲諷的 1/1 野豬人（被本回合的英雄攻擊力與獲得的護甲強化！）
  ETC_386: { abilities: play(fn('flZok')), tokens: ['ETC_386t'] },
  ETC_386t: { keywords: ['TAUNT'] },
  // 節奏與根源：二選一（秘密）：2 個回合後召喚三個 5/5 古樹；或 4 個回合後召喚三個 8/8 巨人
  ETC_387: { chooseOneIds: ['ETC_387b', 'ETC_387c'], tokens: ['ETC_387t', 'ETC_387bt', 'ETC_387ct'] },
  ETC_387b: { abilities: play({ e: 'delayed', turns: 2, effects: [summon('ETC_387bt', 3)] }) },
  ETC_387c: { abilities: play({ e: 'delayed', turns: 4, effects: [summon('ETC_387ct', 3)] }) },
  ETC_387t: {},
  ETC_387bt: {},
  ETC_387ct: {},
  // 木製鈴鼓：亡語：召喚 1 個 5/5 古樹（裝備時打出消耗 (5) 以上的卡來強化）
  ETC_388: { abilities: [tune({ k: 'cardPlayed', side: 'friendly' }, 'cost5'), ...dr(fn('flInstrument'))] },
  // 人氣小精靈：二選一：重新整理你的英雄能力；或你的下一次英雄能力消耗為 (0)
  JAM_026: {},
  JAM_026a: { abilities: play({ e: 'refreshHeroPower' }) },
  JAM_026b: { abilities: play(fn('flFreePower')) },
  // 末日親族：戰吼：拿走你對手的一個空法力水晶
  JAM_029: { abilities: play(fn('flDoomkin')) },

  // ================================================================ 獵人
  // 口琴獨奏家：戰吼：若你沒有控制其他手下，發現一張奧秘並施放
  ETC_028: { abilities: play(cond(solo, [fn('discoverSecretCast', { count: 1 })])) },
  // 一串香蕉：使一個手下獲得 +1/+1（剩下 3 根香蕉！）
  ETC_201: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 }, addCard('ETC_201t')), tokens: ['ETC_201t', 'ETC_201t2'] },
  ETC_201t: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 }, addCard('ETC_201t2')) },
  ETC_201t2: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 }) },
  // 一桶猴子：召喚一隻有嘲諷的 1/4 猴子（剩下 3 隻猴子！）
  ETC_207: { abilities: play(fn('flMonkey'), addCard('ETC_207t')), tokens: ['ETC_207t', 'ETC_207t2', 'LOE_022'] },
  ETC_207t: { abilities: play(fn('flMonkey'), addCard('ETC_207t2')) },
  ETC_207t2: { abilities: play(fn('flMonkey')) },
  // 荊棘谷之心：可交易。復活所有消耗 (5) 以上的友方野獸
  ETC_208: { keywords: ['TRADEABLE'], abilities: play(fn('lkResurrect', { race: 'BEAST', minCost: 5, all: true })) },
  // 荊棘斗篷樂手：終章：你召喚的下一隻野獸獲得 +1/+1
  ETC_831: { abilities: play(cond(finale, [fn('flThornmantle')])) },
  // 叢林即興樂器：亡語：召喚一隻隨機的 1 費野獸（裝備時施放法術來強化）
  ETC_832: { abilities: [tune({ k: 'spellCast', side: 'friendly' }), ...dr(fn('flInstrument'))] },
  // 箭匠：在你施放一個法術後，對生命值最低的敵人造成 1 點傷害
  ETC_833: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('flArrowSmith')] }] },
  // 慕克拉先生：突襲。戰吼：用香蕉填滿你對手的手牌
  ETC_836: { keywords: ['RUSH'], abilities: play(fn('flMukla')), tokens: ['EX1_014t'] },
  // 遠大夢想：召喚你手牌中消耗最高的野獸。它休眠 2 個回合
  ETC_838: { abilities: play(fn('flBigDreams')) },
  // 班卓龍：突襲。每當此手下攻擊，抽一隻野獸並獲得它的屬性值
  ETC_840: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('flBanjosaur')] }] },
  // 隱藏的含義：奧秘：當你的對手在沒有法力時結束回合，召喚一個隨機 3 費手下
  JAM_003: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyTurnEnd' }, cond: { c: 'not', cond: { c: 'unspentMana' } }, effects: [fn('flHiddenMeaning')] }] },
  // 空洞獵犬：生命竊取、突襲。也會傷害被它攻擊的對象相鄰的手下
  JAM_004: { keywords: ['LIFESTEAL', 'RUSH', 'CLEAVE'] },

  // ================================================================ 法師
  // 鍵盤獨奏家：戰吼：若你沒有控制其他手下，召喚兩個有法術傷害 +1 的 1/2 擴大器
  ETC_029: { abilities: play(cond(solo, [summon('ETC_029t', 2)])), tokens: ['ETC_029t'] },
  ETC_029t: { spellDamage: 1 },
  // DJ 魔暴：戰吼：把你手牌中法術的消耗設為 (0)。在你施放其中一張後，其他的消耗增加 (1)
  ETC_395: { abilities: play(fn('flManastorm')) },
  // 宇宙鍵盤：在你施放一個法術後，召喚一個屬性值等同其消耗的元素。失去 1 點耐久度
  ETC_521: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('flCosmicKeyboard')] }], tokens: ['ETC_521t'] },
  ETC_521t: {},
  // 燈光秀：射出 2 道光束，每道對敵人造成 2 點傷害。你未來的燈光秀多射一道
  ETC_528: { abilities: play(fn('flLightshow')) },
  // 倒帶：發現一張你在本場對戰中施放過的另一張法術的複製
  ETC_532: { abilities: play(fn('flRewind')) },
  // 全像技師：在任何手下受到剛好 1 點傷害後，消滅它
  ETC_534: { abilities: [{ on: { k: 'damaged', subject: 'anyMinion' }, cond: { c: 'eventAmount', n: 1 }, effects: [{ e: 'destroy', target: { t: 'it' } }] }] },
  // 合成：把一個隨機的 1 費、2 費與 3 費元素加入你的手牌
  ETC_535: { abilities: play(addRandom({ type: 'MINION', race: 'ELEMENTAL', cost: 1, anyClass: true }), addRandom({ type: 'MINION', race: 'ELEMENTAL', cost: 2, anyClass: true }), addRandom({ type: 'MINION', race: 'ELEMENTAL', cost: 3, anyClass: true })) },
  // 音訊分配器：亡語：複製你手牌中消耗最高的法術
  ETC_536: { abilities: dr(fn('flAudioSplitter')) },
  // 重混販賣機器人
  JAM_000: { tokens: ['JAM_000t', 'JAM_000t2', 'JAM_000t3', 'JAM_000t4'] },
  JAM_000t: { abilities: play(addRandom({ type: 'SPELL', spellSchool: 'FROST', anyClass: true }, 2)) },
  JAM_000t2: { abilities: play(addRandom({ type: 'MINION', race: 'MECHANICAL', anyClass: true }, 2)) },
  JAM_000t3: { abilities: play(addCard('GAME_005', 2)) },
  JAM_000t4: { abilities: play(addRandom({ type: 'SPELL', isSecret: true, cls: 'MAGE' }, 2)) },
  // 巨星之力：對一個隨機敵方手下造成 5 點傷害。以少 1 點的傷害重複
  JAM_002: { abilities: play(fn('skShellshot', { n: 5 })) },

  // ================================================================ 聖騎士
  // 迪斯可大槌：亡語：使一個隨機友方手下獲得 +1/+1（裝備時打出手下來強化）
  ETC_317: { abilities: [tune({ k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }), ...dr(fn('flInstrument'))] },
  // 聚光燈：可交易。把一個友方聖盾轉換成一個 5/5 元素
  ETC_320: { keywords: ['TRADEABLE'], target: { filter: { type: 'minion', side: 'friendly', keyword: 'DIVINE_SHIELD' } }, abilities: play(fn('flSpotlight')), tokens: ['ETC_320t'] },
  ETC_320t: {},
  // 煩人機器人劇團：嘲諷、聖盾。亡語：召喚三個有嘲諷與聖盾的 1/2 機械
  ETC_321: { keywords: ['TAUNT', 'DIVINE_SHIELD'], abilities: dr(summon('GVG_085', 3)) },
  // 吉特巴舞蟲：聖盾。在一個友方角色失去聖盾後，抽一張牌
  ETC_324: { keywords: ['DIVINE_SHIELD'], abilities: [{ on: { k: 'shieldLost', side: 'friendly' }, effects: [draw(1)] }] },
  // 領舞者：亡語：從你的牌堆召喚一個攻擊力比此手下低的手下
  ETC_328: { abilities: dr(fn('flLeadDancer')) },
  // 舞王坎格爾：生命竊取。亡語：把此手下與你手牌中的一個手下交換，並使它獲得生命竊取
  ETC_329: { keywords: ['LIFESTEAL'], abilities: dr(fn('flKangor')) },
  // 星光律動：使你的英雄獲得聖盾。在本場對戰剩下的時間裡，打出神聖法術會重新整理它
  ETC_330: { abilities: play(fn('flStarlight')) },
  // 放克鰭魚人：聖盾。你有聖盾的手下 +2 攻擊力
  ETC_337: { keywords: ['DIVINE_SHIELD'], auras: [{ scope: 'otherFriendly', keyword: 'DIVINE_SHIELD', atk: 2 }, { scope: 'self', keyword: 'DIVINE_SHIELD', atk: 2 }] },
  // 和聲迪斯可 / 不和諧迪斯可
  ETC_506: { abilities: play(fn('flDiscoverSummon', { cost: 5, buff: 1 })), tokens: ['ETC_506t'] },
  ETC_506t: { abilities: play(fn('flDiscoverSummon', { cost: 1, buff: 5 })) },

  // ================================================================ 牧師
  // 暗影和弦：扭曲：使一個手下 -5/-5。若它的攻擊力為 0，消滅它
  ETC_305: { target: anyMinion, abilities: play(fn('flDistort')) },
  // 偶像的崇拜：你的英雄能力消耗為 (0)。在你使用後，失去 1 點耐久度
  ETC_312: { abilities: [{ on: { k: 'heroPower', side: 'friendly' }, effects: [fn('flIdol')] }] },
  // 和聲流行 / 不和諧流行
  ETC_314: { abilities: play({ e: 'damage', target: allMinions, amount: 3, spell: true }, fn('flPopstar', { n: 6 })), tokens: ['ETC_314t', 'ETC_314t2'] },
  ETC_314t: { abilities: play({ e: 'damage', target: allMinions, amount: 6, spell: true }, fn('flPopstar', { n: 3 })) },
  ETC_314t2: {},
  // 為我而戰：選擇兩個敵方手下。它們互相戰鬥！把死亡的手下的複製加入你的手牌
  ETC_316: { target: enemyMinion, abilities: play(fn('flFightOverMe')) },
  // 夢中情船：戰吼：為所有其他友方手下恢復 3 點生命值。每有一個被溢療，獲得 +1/+1
  ETC_332: { abilities: play(fn('flDreamboat')) },
  // 碎心者赫丹尼斯：戰吼：對此手下造成 4 點傷害。溢療：對一個隨機敵人造成 5 點傷害
  ETC_334: { abilities: [...play({ e: 'damage', target: { t: 'self' }, amount: 4 }), { on: { k: 'overheal' }, effects: [{ e: 'damage', target: { t: 'random', filter: { side: 'enemy' }, count: 1 }, amount: 5 }] }] },
  // 永恆之愛：你每回合的第一張法術消耗減少 (2)。持續到你的回合沒有打出法術為止
  ETC_335: { abilities: play(fn('flLove')) },
  // 萬人迷：溢療：召喚一個消耗等同溢療量的隨機手下
  ETC_339: { abilities: [{ on: { k: 'overheal' }, effects: [fn('flHeartthrob')] }] },
  // 失聰：沉默一個手下。連擊：也對它造成 2 點傷害
  JAM_022: { target: anyMinion, abilities: play({ e: 'silence', target: { t: 'chosen' } }, cond({ c: 'combo' }, [dmg(2)])) },
  // 剽竊海盜：戰吼：獲得你對手牌堆頂的牌的複製
  JAM_023: { abilities: play(fn('flPlagiarize')) },
  // 氛圍光靈：終章與溢療：使另一個隨機友方手下獲得 +2/+2
  JAM_024: {
    abilities: [
      ...play(cond(finale, [{ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly', excludeSelf: true }, count: 1 }, atk: 2, hp: 2 }])),
      { on: { k: 'overheal' }, effects: [{ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly', excludeSelf: true }, count: 1 }, atk: 2, hp: 2 }] },
    ],
  },
  // 漏斗蛋糕：為一個手下與其相鄰手下恢復 3 點生命值。每有一個被溢療，重新整理一個法力水晶
  JAM_025: { target: anyMinion, abilities: play(fn('flFunnelCake')) },

  // ================================================================ 盜賊
  // 韻律紡織者：突襲。連擊：本場對戰中你每打出過一張其他的連擊卡，獲得 +1/+1
  ETC_073: { keywords: ['RUSH'], abilities: play(cond({ c: 'combo' }, [fn('flRhymeSpinner')])) },
  // 混音帶：發現一張你對手在本場對戰中打出過的卡的複製
  ETC_074: { abilities: play(fn('flMixtape')) },
  // 霹靂舞：把一個友方手下移回你的手牌。召喚一個有它的屬性值與突襲的舞者
  ETC_076: { target: friendlyMinion, abilities: play(fn('flBreakdance')), tokens: ['ETC_076t'] },
  ETC_076t: { keywords: ['RUSH'] },
  // 唱片騎師：連擊：把一張隨機連擊卡加入你的手牌
  ETC_077: { abilities: play(cond({ c: 'combo' }, [addRandom({ combo: true })])) },
  // 饒舌金剛布林頓：戰吼：雙方玩家裝備 1/2 的麥克風。你對手的會使他們受到的所有傷害增加 1 點！
  ETC_078: { abilities: play(fn('flBlingtron')), tokens: ['ETC_078t', 'ETC_078t2'] },
  ETC_078t: {},
  ETC_078t2: {},
  // 跳來跳去（主唱：迦羅娜）：把所有友方手下移回你的手牌。它們在本回合消耗為 (1)
  ETC_079: { abilities: play(fn('flBounceAround')) },
  // 刮盤器：亡語：重新整理 1 個法力水晶（裝備時打出連擊卡來強化）
  ETC_518: { abilities: [tune({ k: 'cardPlayed', side: 'friendly' }, 'combo'), ...dr(fn('flInstrument'))] },
  // 和聲嘻哈 / 不和諧嘻哈
  ETC_717: { target: anyChar, abilities: play(dmg(1), { e: 'weaponBuff', atk: 3 }), tokens: ['ETC_717t'] },
  ETC_717t: { target: anyChar, abilities: play(dmg(3), { e: 'weaponBuff', atk: 1 }) },
  // 節奏舞者瑞莎：突襲。在你的英雄攻擊後，把此手下移回你的手牌並把它的消耗設為 (1)
  JAM_019: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('flRisa')] }] },

  // ================================================================ 薩滿
  // 變調和弦：生命竊取。對一個手下造成 6 點傷害。若你被超載，消耗減少 (3)
  ETC_356: { keywords: ['LIFESTEAL'], costIf: { cond: { c: 'overloaded' }, cost: 2 }, target: anyMinion, abilities: play(dmg(6)) },
  // 薩克斯風獨奏家：戰吼：若你沒有控制其他手下，把一張薩克斯風獨奏家加入你的手牌
  ETC_358: { abilities: play(cond(solo, [addCard('ETC_358')])) },
  // 衝浪者：戰吼：若你被超載，從你的牌堆發現一張法術
  ETC_359: { abilities: play(cond({ c: 'overloaded' }, [fn('flDeckSpell')])) },
  // 大膽昆蟲！：把一個手下變形成炎魔之王拉格納羅斯。超載：(2)
  ETC_362: { overload: 2, target: anyMinion, abilities: play({ e: 'transform', target: { t: 'chosen' }, card: 'EX1_298' }) },
  // 音樂狂熱：本回合你每打出一個手下，把一張隨機薩滿法術加入你的手牌
  ETC_367: { abilities: play(fn('flMelomania')) },
  // 座無虛席：召喚一個隨機的 6 費、5 費、4 費與 3 費手下。超載：(2)
  ETC_370: {
    overload: 2,
    abilities: play(...[6, 5, 4, 3].map((cost): Effect => ({ e: 'summonRandom', pool: { type: 'MINION', cost, anyClass: true }, count: 1, who: 'self' }))),
  },
  // 茵札：戰吼：在本場對戰剩下的時間裡，你的超載卡消耗減少 (1)
  ETC_371: { abilities: play(fn('flInzah')) },
  // 爵士貝斯：亡語：你的下一張法術消耗減少 (1)（裝備時超載來強化）
  ETC_813: { abilities: [...dr(fn('flInstrument'))] },
  // 風之王之號：風怒。每當你的英雄攻擊一個手下，把它的屬性值設為 3/3
  JAM_011: { keywords: ['WINDFURY'], abilities: [{ on: { k: 'attack', subject: 'friendlyHero' }, effects: [fn('flWindlord')] }] },
  // 重混圖騰雕刻師
  JAM_012: { tokens: ['JAM_012t', 'JAM_012t2', 'JAM_012t3', 'JAM_012t4'] },
  JAM_012t: { abilities: play(summon('ETC_105')) },
  JAM_012t2: { abilities: play(summon('EX1_575')) },
  JAM_012t3: { abilities: play(summon('EX1_565')) },
  JAM_012t4: { abilities: play(summon('JAM_010')) },

  // ================================================================ 術士
  // 歌劇獨奏家：戰吼：若你沒有控制其他手下，對所有敵方手下造成 3 點傷害
  ETC_034: { abilities: play(cond(solo, [{ e: 'damage', target: enemyMinions, amount: 3 }])) },
  // 男中音小鬼 / 漸強 / 瘋狂指揮家：承受疲勞傷害……
  ETC_068: { abilities: play(fn('flFatigue', { then: 'buff' })) },
  ETC_069: { abilities: play(fn('flFatigue', { then: 'damage' })) },
  ETC_070: { abilities: play(fn('flFatigue', { then: 'imps' })), tokens: ['ETC_070t'] },
  ETC_070t: {},
  // 末日指揮者林恩：嘲諷。亡語：雙方玩家抽 2 張牌、棄 2 張牌，並摧毀牌堆頂的 2 張牌
  ETC_071: { keywords: ['TAUNT'], abilities: dr(fn('flRin')) },
  // 虛空演奏家：在你的回合中，你的英雄免疫
  ETC_081: { flags: ['heroImmuneOnTurn'] },
  // 絕望輓歌：對一個角色造成 3 點傷害。若它死亡，從你的牌堆召喚一個惡魔
  ETC_082: { target: anyChar, abilities: play(fn('flDirge')) },
  // 邪弦豎琴：每當你的英雄在你的回合中將要受到傷害，改為恢復 2 點生命值。失去 1 點耐久度
  ETC_084: { flags: ['felstringHarp'] },
  // 罪惡交響曲：發現並施放一個樂章。把其他 6 個洗入你的牌堆
  ETC_085: { abilities: play(fn('flSymphony')), tokens: MOVEMENTS },
  ETC_085t: { abilities: play(fn('flEnvy')) },
  ETC_085t2: { abilities: play(fn('flPride')) },
  ETC_085t3: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'any' } }, amount: 6, spell: true }) },
  ETC_085t4: { abilities: play(fn('flGluttony')) },
  ETC_085t6: { keywords: ['LIFESTEAL'], abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 6, spell: true }) },
  ETC_085t7: { abilities: play(draw(6)) },
  ETC_085t8: { abilities: play(fn('flSloth')) },
  // 歌劇之王凡諾特姆：嘲諷、生命竊取。此牌的消耗等同你牌堆中的牌數
  JAM_030: { keywords: ['TAUNT', 'LIFESTEAL'], flags: ['costDeckSize'] },
  // 迴響：召喚一個手下的複製。兩者在受到傷害後死亡
  JAM_031: { target: anyMinion, abilities: play(fn('flReverberations')) },
  // 琴火小鬼：戰吼：把一張隨機的法師火焰法術與術士火焰法術加入你的手牌
  JAM_032: { abilities: play(addRandom({ type: 'SPELL', spellSchool: 'FIRE', cls: 'MAGE' }), addRandom({ type: 'SPELL', spellSchool: 'FIRE', cls: 'WARLOCK' })) },

  // ================================================================ 戰士
  // 鼓手獨奏家：嘲諷。戰吼：若你沒有控制其他手下，獲得 +2/+2 與突襲
  ETC_035: { keywords: ['TAUNT'], abilities: play(cond(solo, [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2, keywords: ['RUSH'] }])) },
  // 搖滾大師弗恩：戰吼：複製你手牌中每種種族的手下各一個
  ETC_121: { abilities: play(fn('flVoone')) },
  // 剃刀沼澤搖滾明星：在你獲得護甲後，再獲得 2 點
  ETC_355: { abilities: [{ on: { k: 'armorGained' }, effects: [fn('flRockstar')] }] },
  // 震耳掌聲：抽一張牌。你每控制一種種族的手下，就重複一次
  ETC_372: { abilities: play(fn('flApplause')) },
  // 力量滑音：突襲。戰吼：本場對戰中你每打出過一種種族的手下，獲得 +1/+1
  ETC_408: { keywords: ['RUSH'], abilities: play(fn('flPowerSlider')) },
  // 黑石搖滾：使你牌堆中所有手下的攻擊力與生命值等同其消耗
  ETC_417: { abilities: play(fn('flBlackrock')) },
  // 科多皮鼓組：亡語：對所有手下造成 1 點傷害（裝備時獲得護甲來強化）
  ETC_520: { abilities: [tune({ k: 'armorGained' }), ...dr(fn('flInstrument'))] },
  // 後台保鑣：嘲諷。戰吼：把一個友方手下變形成此手下的複製
  JAM_014: { keywords: ['TAUNT'], target: optional(friendlyMinion), abilities: play(fn('flBouncer')) },
  // 重混音叉
  JAM_015: { tokens: ['JAM_015t', 'JAM_015t2', 'JAM_015t3', 'JAM_015t4'] },
  JAM_015t: { abilities: play({ e: 'weaponBuff', atk: 2 }) },
  JAM_015t2: { abilities: play({ e: 'armor', amount: 5 }) },
  JAM_015t3: { keywords: ['CLEAVE'] },
  JAM_015t4: { abilities: play({ e: 'discover', pool: { type: 'MINION', keyword: 'TAUNT' } }) },
};
