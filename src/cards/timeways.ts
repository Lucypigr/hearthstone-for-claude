// ============================================================================
// 穿越時間流（系列 1957，卡號 END_ / TIME_）：手動定義的卡牌效果。
// 新機制：倒轉（rewind）、傳說（fabled）、灌注（imbue）、地點牌、目標（Aura / Objective）、同族（Kindred）等。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, SecretEvent, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const atStartOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnStart', whose: 'mine' }, effects }];
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyChar: TargetReq = { filter: { type: 'character', side: 'enemy' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const allFriendly = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const randomEnemy = (count = 1) => ({ t: 'random' as const, filter: { type: 'character' as const, side: 'enemy' as const }, count });
const randomEnemyMinion = (count = 1) => ({ t: 'random' as const, filter: { type: 'minion' as const, side: 'enemy' as const }, count });
const RAFAAMS = ['TIME_005t1', 'TIME_005t2', 'TIME_005t3', 'TIME_005t4', 'TIME_005t5', 'TIME_005t6', 'TIME_005t7', 'TIME_005t8', 'TIME_005t9'];
const whenSummoned = (...effects: Effect[]): Ability[] => [{ on: { k: 'summoned' }, effects }];
const shred = (n: number): Effect => ({ e: 'shuffle', card: 'TIME_025t', count: n });
const REWIND_TOKENS = ['TIME_000ta', 'TIME_000tb'];
const secretOn = (ev: SecretEvent, ...effects: Effect[]): Override => ({ secret: true, abilities: [{ on: { k: 'secret', ev }, effects }] });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const summonRandom = (pool: Extract<Effect, { e: 'summonRandom' }>['pool'], count = 1): Effect => ({ e: 'summonRandom', pool, count, who: 'self' });
const addCard = (card: string, count = 1): Effect => ({ e: 'addCard', card, count, who: 'self' });
const rewind = (n = 1): Override => ({ rewind: n, tokens: REWIND_TOKENS });
const natureHeld: Ability[] = [{ on: { k: 'spellCast', side: 'friendly', school: 'NATURE' }, effects: [fn('counterInHand')] }];
const heroHit = (effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects }];
const randomFriendly = { t: 'random' as const, filter: { type: 'minion' as const, side: 'friendly' as const }, count: 1 };
const myHero = { t: 'hero' as const, side: 'friendly' as const };
const theirHero = { t: 'hero' as const, side: 'enemy' as const };

export const TIMEWAYS_OVERRIDES: Record<string, Override> = {
  // 倒轉的選項（只用來顯示選擇）
  TIME_000ta: {},
  TIME_000tb: {},

  // ============================================================== 終結（END_）
  // 終局：造成 2 點傷害。灌注你的英雄能力
  END_000: { target: anyChar, abilities: play(hit(2), fn('imbue')) },
  // 時間的鋸齒：戰吼：灌注你的英雄能力
  END_001: { abilities: play(fn('imbue')) },
  // 邪惡的枯萎之子：重生。亡語：裝備一把 1/2 匕首；若你已裝備武器，改為使它 +2 攻擊力
  END_002: { keywords: ['REBORN'], abilities: dr(fn('blightspawn')) },
  // 終結：抽一張死靈牌。灌注兩次
  END_003: { abilities: play(fn('drawRace', { race: 'UNDEAD' }), fn('imbue', { times: 2 })) },
  // 往日回聲：召喚一個隨機 4 費手下。花費 4 具屍體，再召喚一個。流放：再一個
  END_005: {
    abilities: play(
      summonRandom({ type: 'MINION', cost: 4 }),
      { e: 'spendCorpses', amount: 4, then: [summonRandom({ type: 'MINION', cost: 4 })] },
      cond({ c: 'outcast' }, [summonRandom({ type: 'MINION', cost: 4 })]),
    ),
  },
  // 時光獵手克羅尼卡：戰吼：本回合、下回合與下下回合，英雄 +3 攻擊力
  END_006: {
    abilities: play(
      { e: 'heroAttack', amount: 3 },
      { e: 'delayed', turns: 1, effects: [{ e: 'heroAttack', amount: 3 }] },
      { e: 'delayed', turns: 2, effects: [{ e: 'heroAttack', amount: 3 }] },
    ),
  },
  // 碎裂的現實：召喚兩隻 2/2 樹人，每有一隻死亡的友方樹人，它們 +1/+1
  END_009: { abilities: play(fn('splinteredReality')), tokens: ['END_009t'] },
  END_009t: {},
  // 加速光環：在你的回合開始時，獲得一顆暫時的法力水晶。持續 3 個回合
  END_011: { objective: 3, abilities: [...play(fn('objective')), ...atStartOfTurn({ e: 'mana', kind: 'temp', amount: 1 })] },
  // 無限之刃：無法攻擊英雄。戰吼：將這把武器的攻擊力設為無限（本回合）
  END_012: { keywords: ['CANT_ATTACK_HEROES'], abilities: play(fn('infinityWeapon')) },
  // 粗野的終末之口：戰吼：發現一個消耗 (1) 且有黑暗禮物的手下
  END_013: { abilities: play(fn('discoverGift', { pool: { type: 'MINION', cost: 1, anyClass: true } })) },
  // 三年霸王龍：同族與亡語：獲得一張隨機的亡語手下牌，它的消耗減少 (2)
  END_015: {
    abilities: [
      ...play(cond({ c: 'kindred' }, [fn('addRandomDiscount', { pool: { type: 'MINION', hasDeathrattle: true }, count: 1, discount: 2 })])),
      ...dr(fn('addRandomDiscount', { pool: { type: 'MINION', hasDeathrattle: true }, count: 1, discount: 2 })),
    ],
  },
  // 時光利爪：在你的英雄攻擊後，棄掉你消耗最高的牌
  END_016: { abilities: heroHit([fn('discardHighest')]) },
  // 終末之戰（任務）：填滿你的手牌，然後清空它。獎勵：滴答與嘀嗒
  END_017: { quest: { kind: 'fillHand', goal: 2, reward: 'END_017t' }, tokens: ['END_017t'] },
  END_017t: { abilities: [...play(fn('drawUntilFull')), ...dr(fn('emptyHand', { who: 'opponent' }))] },
  // 無限的侍僧：戰吼：將你手牌中一張隨機卡牌的消耗設為無限！亡語：改回來
  END_018: { abilities: [...play(fn('acolyteInfinite')), ...dr(fn('acolyteRestore'))] },
  // 終結時刻的倖存者：嘲諷。戰吼：若你的英雄本回合受過傷害，獲得 +3/+3
  END_019: { keywords: ['TAUNT'], abilities: play(cond({ c: 'heroDamagedThisTurn' }, [{ e: 'buff', target: { t: 'self' }, atk: 3, hp: 3 }])) },
  // 次元武器匠：戰吼：使你手牌中所有的手下與武器 +2 攻擊力
  END_021: { abilities: play(fn('buffHandAtk', { amount: 2 })) },
  // 扭曲時間的先知：受傷時具有法術傷害 +2
  END_022: { flags: ['spellDamage2Damaged'] },
  // 苦澀的終點：凍結一個手下與相鄰的手下，消滅其中受傷的
  END_023: { target: anyMinion, abilities: play(fn('bitterEnd')) },
  // 無盡之焰：奧秘：在你的對手回合結束時，對其生命值最高的手下造成無限傷害
  END_024: secretOn('enemyTurnEnd', fn('flamesOfInfinity')),
  // 永恆火焰箭：生命竊取。對一個手下造成 3 點傷害。若它死亡，在你的回合結束時將此牌移回手牌
  END_025: {
    keywords: ['LIFESTEAL'],
    target: anyMinion,
    abilities: play(hit(3), cond({ c: 'itDied' }, [fn('returnSelfAtEnd')])),
  },
  // 虛無碎片：在你對一個手下施放法術後，抽一張牌
  END_026: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, cond: { c: 'itIsMinion' }, effects: [draw()] }] },
  // 永恆之翼：發現一條來自過去、有黑暗禮物的龍
  END_027: { abilities: play(fn('discoverGift', { pool: { type: 'MINION', race: 'DRAGON', past: true, anyClass: true } })) },
  // 故障的豬頭怪：高於元素閃避，嘲諷。你每超載過一顆法力水晶，消耗減少 (1)
  END_030: { keywords: ['ELUSIVE', 'TAUNT'], costRule: { per: 'overloadedThisGame', amount: 1 } },
  // 長翼畸變體：衝刺。連擊：超載 (2)，本回合免疫並獲得風怒
  END_032: {
    keywords: ['RUSH'],
    abilities: play(cond({ c: 'combo' }, [fn('addOverload', { amount: 2 }), { e: 'buff', target: { t: 'self' }, keywords: ['IMMUNE', 'WINDFURY'], temp: true }])),
  },
  // 先見的蛇龍：高於元素閃避。若你的手牌中有另一條龍，消耗減少 (3)
  END_033: { keywords: ['ELUSIVE'], costIf: { cond: { c: 'holding', race: 'DRAGON' }, cost: 4 } },
  // 碎世者：戰吼：消滅一個隨機敵方手下、地點與武器
  END_034: { abilities: play(fn('crumblecrusher')) },
  // 終結的預兆：戰吼：若你的牌堆已空，摧毀敵方牌堆最上面的 5 張牌
  END_035: { abilities: play(cond({ c: 'deckEmpty' }, [fn('millEnemy', { n: 5 })])) },
  // 莫奇：你的倒轉會保留兩種結果。戰吼：發現一張任意職業的倒轉牌
  END_036: { flags: ['keepBothRewinds'], abilities: play({ e: 'discover', pool: { rewind: true, anyClass: true } }) },
  // 終結時光墨衛：戰吼：用隨機的龍填滿你的戰場。完全治療你的英雄。跳過你的下個回合
  END_037: { abilities: play(fn('endtimeMurozond')) },

  // ============================================================== 倒轉與時光（TIME_）
  // 半穩定傳送門：倒轉。將一張隨機手下牌加入你的手牌，它的消耗降低 (3)
  TIME_000: { ...rewind(), abilities: play(fn('addRandomDiscount', { pool: { type: 'MINION' }, count: 1, discount: 3 })) },
  // 計時匕首：倒轉。向隨機敵人投擲 3 把飛刀，各造成 2 點傷害
  TIME_001: { ...rewind(), abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'damage', target: randomEnemy(), amount: 2, spell: true }] }) },
  // 永恆巫師：倒轉。戰吼：獲得 2 張你職業的隨機法術牌
  TIME_002: { ...rewind(), abilities: play({ e: 'addRandom', pool: { type: 'SPELL', cls: 'own' }, count: 2, who: 'self' }) },
  // 傳送門先鋒：倒轉。戰吼：抽一張隨機手下牌，使它 +2/+2
  TIME_003: { ...rewind(), abilities: play(fn('twDrawBuff', { pool: { type: 'MINION' }, atk: 2, hp: 2 })) },
  // 匯流粉碎者：倒轉。戰吼：對一個隨機敵人造成 7 點傷害
  TIME_004: { ...rewind(), abilities: play({ e: 'damage', target: randomEnemy(), amount: 7 }) },
  // 竊時者拉法姆（傳說+）：你的牌堆有 10 個拉法姆。戰吼：若你打出了其他所有拉法姆，消滅敵方英雄
  TIME_005: {
    fabled: RAFAAMS,
    tokens: [...RAFAAMS, 'TIME_005t9t'],
    abilities: play(fn('twRafaamFinale')),
  },
  TIME_005t1: { abilities: [...play(fn('twDrawRafaam')), ...dr(fn('twDrawRafaam'))] },
  TIME_005t2: { abilities: play(fn('twGreenRafaam')) },
  TIME_005t3: { abilities: play(fn('twExplorerRafaam')) },
  TIME_005t4: { abilities: play(fn('twWarchiefRafaam')) },
  TIME_005t5: { keywords: ['TAUNT'], abilities: play(fn('twMindflayerRafaam')) },
  TIME_005t6: { abilities: play(fn('twCalamitousRafaam')) },
  TIME_005t7: { keywords: ['RUSH'], costRule: { per: 'rafaamsPlayed', amount: 1 } },
  TIME_005t8: { abilities: play(fn('twMurlocRafaam')) },
  TIME_005t9: { abilities: play(fn('twArchmageRafaam')) },
  TIME_005t9t: {},
  // 硬光守護者：聖盾。戰吼：為你的英雄恢復 3 點生命值並給予聖盾
  TIME_015: { keywords: ['DIVINE_SHIELD'], abilities: play({ e: 'heal', target: myHero, amount: 3 }, fn('twHeroShield')) },
  // 鏡像空間：召喚一個 0/4 嘲諷手下。若你的手牌中有龍，再召喚一個
  TIME_006: { abilities: play(summon('TIME_006t1'), cond({ c: 'holding', race: 'DRAGON' }, [summon('TIME_006t1')])), tokens: ['TIME_006t1'] },
  TIME_006t1: { keywords: ['TAUNT'] },
  // 往日末日預言者：倒轉。戰吼：雙方玩家各隨機棄一張牌
  TIME_008: { ...rewind(), abilities: play({ e: 'discard', count: 1 }, fn('twDiscardOpponent')) },
  // 明日傑爾賓（傳說）：戰吼：將你牌堆中每種目標各一張放到戰場上
  TIME_009: { fabled: ['TIME_009t1', 'TIME_009t2'], tokens: ['TIME_009t1', 'TIME_009t2'], abilities: play(fn('gelbin')) },
  TIME_009t1: {
    objective: 3,
    keywords: ['TRADEABLE'],
    abilities: [...play(fn('objective')), ...atEndOfTurn({ e: 'heal', target: { t: 'all', filter: { type: 'character', side: 'friendly' } }, amount: 4 })],
  },
  TIME_009t2: {
    objective: 3,
    keywords: ['TRADEABLE'],
    abilities: [...play(fn('objective')), ...atEndOfTurn({ e: 'buff', target: randomFriendly, atk: 4, hp: 4, keywords: ['DIVINE_SHIELD'] })],
  },
  // 先知沃：高於元素閃避。在你施放法術後，發現一個來自過去的自然法術
  TIME_013: {
    keywords: ['ELUSIVE'],
    abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [{ e: 'discover', pool: { type: 'SPELL', spellSchool: 'NATURE', past: true, anyClass: true } }] }],
  },
  // 瞬間多元宇宙：倒轉。召喚總值 12 點法力的隨機手下。超載：(3)
  TIME_014: { ...rewind(), overload: 3, abilities: play(fn('twSummonManaWorth', { mana: 12 })) },
  // 霓虹創新：發現一個來自過去的聖騎士機械，使其 +5/+5
  TIME_016: {
    abilities: play({ e: 'discover', pool: { type: 'MINION', race: 'MECHANICAL', cls: 'PALADIN', past: true }, then: [fn('twBuffDiscovered', { atk: 5, hp: 5 })] }),
  },
  // 坦克工程師：聖盾。亡語：召喚一輛有聖盾的 7/7 坦克
  TIME_017: { keywords: ['DIVINE_SHIELD'], abilities: dr(summon('TIME_017t')) },
  // 修復時間線：倒轉。獲得 2 張隨機神聖法術牌，為你的英雄恢復等同其消耗的生命值
  TIME_018: { ...rewind(), abilities: play(fn('twMendTimeline')) },
  // 顯化的時間流：戰吼：若你控制一個目標，對所有敵人造成 3 點傷害
  TIME_019: { abilities: play(cond({ c: 'controlObjective' }, [{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 3 }])) },
  // 布洛克薩（傳說）：衝鋒。對戰開始：消失。消滅 4 個阿古斯惡魔後，回到你的手牌
  TIME_020: {
    fabled: ['TIME_020t1', 'TIME_020t2'],
    keywords: ['CHARGE'],
    startOfGame: 'twBroxigar',
    tokens: ['TIME_020t1', 'TIME_020t2', 'TIME_020t2t', 'TIME_020t3', 'TIME_020t3t', 'TIME_020t4', 'TIME_020t4t', 'TIME_020t5', 'TIME_020t5t'],
  },
  TIME_020t1: { keywords: ['LIFESTEAL'], abilities: heroHit([cond({ c: 'heroKilled' }, [fn('twDrawPortal')])]) },
  TIME_020t2: { abilities: play(fn('twPortal', { demon: 'TIME_020t2t', next: 'TIME_020t3' })) },
  TIME_020t2t: { abilities: dr(fn('twArgusDeath', { next: 'TIME_020t3' })) },
  TIME_020t3: { abilities: play(fn('twPortal', { demon: 'TIME_020t3t', next: 'TIME_020t4' })) },
  TIME_020t3t: { abilities: dr(fn('twArgusDeath', { next: 'TIME_020t4' })) },
  TIME_020t4: { abilities: play(fn('twPortal', { demon: 'TIME_020t4t', next: 'TIME_020t5' })) },
  TIME_020t4t: { abilities: dr(fn('twArgusDeath', { next: 'TIME_020t5' })) },
  TIME_020t5: { abilities: play(fn('twPortal', { demon: 'TIME_020t5t' })) },
  TIME_020t5t: { abilities: dr(fn('twBroxigarReturns')) },
  // 末日預備者：流放：你的英雄免疫，直到你的下個回合
  TIME_021: { abilities: play(cond({ c: 'outcast' }, [fn('twHeroImmuneUntilNext')])) },
  // 常青巨蛇：衝刺。若有手下處於休眠狀態，消耗減少 (4)
  TIME_022: { keywords: ['RUSH'], costIf: { cond: { c: 'anyDormant' }, cost: 4 } },
  // 後手準備：抽你牌堆最底下的 2 張牌
  TIME_023: { abilities: play(fn('twDrawBottom', { n: 2 })) },
  // 莫祖戎，無拘無束：戰吼：在你的下個回合開始時，將此手下的攻擊力設為無限
  TIME_024: {
    abilities: play({
      e: 'buff',
      target: { t: 'self' },
      abilities: [{ on: { k: 'turnStart', whose: 'mine' }, once: true, effects: [{ e: 'setStats', target: { t: 'self' }, atk: 999 }] }],
    }),
  },
  // 暮光時光跳躍者：戰吼：將 2 張時間碎片洗入你的牌堆
  TIME_025: { abilities: play(shred(2)), tokens: ['TIME_025t'] },
  TIME_025t: { castsWhenDrawn: true, abilities: play({ e: 'damage', target: myHero, amount: 3 }) },
  // 熵之延續：使你的手下獲得 +1/+1。將 2 張時間碎片洗入你的牌堆
  TIME_026: { abilities: play({ e: 'buff', target: allFriendly, atk: 1, hp: 1 }, shred(2)), tokens: ['TIME_025t'] },
  // 超光速彈幕：造成 $6 點傷害，隨機分配給所有敵人。將 2 張時間碎片洗入你的牌堆
  TIME_027: { abilities: play({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 6, spell: true }, shred(2)), tokens: ['TIME_025t'] },
  // 破運者：生命竊取。戰吼：從你的牌堆施放一張時間碎片，獲得 +3/+3
  TIME_028: { keywords: ['LIFESTEAL'], abilities: play(fn('twCastShred', { then: 'buff' })) },
  // 毀滅速龍：衝刺。戰吼：從你的牌堆施放一張時間碎片，召喚一個此手下的複製
  TIME_029: { keywords: ['RUSH'], abilities: play(fn('twCastShred', { then: 'copy' })) },
  // 分歧：將你手牌中一個隨機手下分成兩半
  TIME_030: { abilities: play(fn('twDivergence')) },
  // 拉法姆階梯！！：抽 3 張不同消耗的牌
  TIME_031: { abilities: play(fn('twDrawDifferentCosts', { n: 3 })) },
  // 時序戈爾：戰吼：你抽取消耗最高的 2 張牌。你的對手抽取你消耗最低的 2 張牌
  TIME_032: { abilities: play(fn('twChronogor')) },
  // 再生德魯伊：倒轉。戰吼：施放 2 個隨機自然法術
  TIME_033: { ...rewind(), abilities: play(fn('twCastRandomSpells', { pool: { type: 'SPELL', spellSchool: 'NATURE', anyClass: true }, n: 2 })) },
  // 體育場播報員：倒轉。戰吼：雙方玩家各裝備一把隨機武器，你的那把 +1/+1
  TIME_034: { ...rewind(), abilities: play(fn('twStadiumAnnouncer')) },
  // 時光機：嘲諷。亡語：獲得一張隨機的倒轉牌
  TIME_035: { keywords: ['TAUNT'], abilities: dr({ e: 'addRandom', pool: { rewind: true, anyClass: true }, count: 1, who: 'self' }) },
  // 皇家線人：戰吼：查看你對手手牌中最右邊的牌。獲得它的複製，或使它的消耗增加 (2)
  TIME_036: { abilities: play(fn('twRoyalInformant')), tokens: ['TIME_036t'] },
  TIME_036t: {},
  // 鴿之信徒：戰吼：抽一張手下牌。使你手牌中的手下 +2 生命值
  TIME_037: { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION' } }, { e: 'handBuff', atk: 0, hp: 2, scope: 'all' }) },
  // 時鐘發條先生：倒轉，倒轉，倒轉。戰吼：召喚 2 個隨機傳說手下
  TIME_038: { ...rewind(3), abilities: play(summonRandom({ type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, 2)) },
  // 既視感：發現你對手手牌中一張牌的複製
  TIME_039: { abilities: play(fn('twDiscoverOppHand')) },
  // 褪色的記憶：亡語：獲得一個來自過去的隨機 5 費手下
  TIME_040: { abilities: dr({ e: 'addRandom', pool: { type: 'MINION', cost: 5, past: true, anyClass: true }, count: 1, who: 'self' }) },
  // 未來的先祖：嘲諷。戰吼：查看 3 張牌，猜哪一張在你對手的手牌中，猜中就獲得 +4 生命值
  TIME_041: { keywords: ['TAUNT'], abilities: play(fn('twForefather')) },
  // 馬魯克王：戰吼：棄掉你的手牌。獲得一根無限香蕉
  TIME_042: { abilities: play(fn('twDiscardHand'), addCard('TIME_042t')), tokens: ['TIME_042t'] },
  TIME_042t: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 }, addCard('TIME_042t')) },
  // PMM 無限化機：戰吼：將一個友方手下的攻擊力與生命值設為 8。本回合它無法攻擊英雄
  TIME_043: {
    target: friendlyMinion,
    abilities: play({ e: 'setStats', target: { t: 'chosen' }, atk: 8, hp: 8 }, { e: 'buff', target: { t: 'chosen' }, keywords: ['CANT_ATTACK_HEROES'], temp: true }),
  },
  // 過去的諾姆瑞根（地點）：使一個手下 +2/+1。前進到現在！
  TIME_044: {
    advanceTo: 'TIME_044t1',
    target: anyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 1 }),
    tokens: ['TIME_044t1', 'TIME_044t2'],
  },
  TIME_044t1: {
    advanceTo: 'TIME_044t2',
    target: anyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 1, abilities: dr({ e: 'damage', target: theirHero, amount: 2 }) }),
  },
  TIME_044t2: {
    target: anyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 1, keywords: ['DIVINE_SHIELD'], abilities: dr({ e: 'damage', target: theirHero, amount: 2 }) }),
  },
  // 賽博族長：休眠 3 回合。嘲諷
  TIME_046: { keywords: ['TAUNT'], abilities: whenSummoned(fn('twDormantSelf', { turns: 3 })) },
  // 狡詐的土狼：潛行。本回合每有一次敵方英雄受到傷害，消耗減少 (1)
  TIME_047: { keywords: ['STEALTH'], costRule: { per: 'enemyHeroHitsThisTurn', amount: 1 } },
  // 發條暴怒者：戰吼：你每進行過一個回合，獲得 +1 生命值
  TIME_048: { abilities: play({ e: 'buff', target: { t: 'self' }, hp: { dyn: 'turnsTaken' } }) },
  // 危險的變異體：在你的回合開始時，變成一個隨機 5 費手下
  TIME_049: { abilities: atStartOfTurn({ e: 'transformRandom', target: { t: 'self' }, pool: { type: 'MINION', cost: 5, anyClass: true } }) },
  // 有感知的沙漏：衝刺。在此手下受到傷害後存活，交換它的攻擊力與生命值
  TIME_050: { keywords: ['RUSH'], abilities: [{ on: { k: 'damaged', subject: 'self' }, cond: { c: 'itAlive' }, effects: [{ e: 'swapStats', target: { t: 'self' } }] }] },
  // 琥珀典獄長：嘲諷。亡語：召喚一個來自過去的隨機手下
  TIME_052: { keywords: ['TAUNT'], abilities: dr(summonRandom({ type: 'MINION', past: true, anyClass: true })) },
  // 跳時者：在每位玩家的回合結束時，給他們一枚幸運幣
  TIME_054: { abilities: [{ on: { k: 'turnEnd', whose: 'each' }, effects: [fn('twCoinForTurnPlayer')] }] },
  // 未知的旅人：在此手下受到傷害後存活，變成一個隨機 7 費手下
  TIME_055: { abilities: [{ on: { k: 'damaged', subject: 'self' }, cond: { c: 'itAlive' }, effects: [{ e: 'transformRandom', target: { t: 'self' }, pool: { type: 'MINION', cost: 7, anyClass: true } }] }] },
  // 睿智的求真者：戰吼：將雙方手牌中每張牌的消耗恢復為原本的消耗
  TIME_057: { abilities: play(fn('twResetCosts')) },
  // 微不足道的振翅者：亡語：召喚一個休眠 2 回合的隨機 2 費手下
  TIME_058: { abilities: dr(fn('twSummonDormantRandom', { cost: 2, turns: 2 })) },
  // 活著的悖論：高於元素閃避。戰吼：召喚兩個有閃避的 2/1 活著的悖論
  TIME_059: { keywords: ['ELUSIVE'], abilities: play(summon('TIME_059', 2)) },
  // 量子不穩定者：這個手下受到的傷害加倍
  TIME_060: { flags: ['takesDoubleDamage'] },
  // 無盡因果：戰吼：將你牌堆的順序反轉
  TIME_061: { abilities: play(fn('twReverseDeck')) },
  // 時間領主諾茲多姆：休眠 5 回合。衝刺。在你打出最新擴充包的卡牌後，提早 1 個回合甦醒
  TIME_063: {
    keywords: ['RUSH'],
    abilities: [...whenSummoned(fn('twDormantSelf', { turns: 5 })), { on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('twNozdormuTick')] }],
  },
  // 時間領主迪奧斯：你的戰吼、亡語、英雄能力與回合結束效果會觸發兩次
  TIME_064: { flags: ['doubleBattlecries', 'doubleDeathrattle', 'doubleEndTurn', 'heroPowerEffectTwice'] },

  // 錯位的炎術士：每當你碎裂一張牌，對所有敵方手下造成 2 點傷害
  TIME_101: { abilities: [{ on: { k: 'shatter' }, effects: [{ e: 'damage', target: allEnemyMinions, amount: 2 }] }] },
  // 晝夜術士：戰吼：將一張隨機 8 費手下牌加入你的手牌。在你的回合開始時，它的消耗減少 (1)
  TIME_102: { abilities: play(fn('twCircadiamancer')) },
  // 克羅米：亡語：抽取你這場對戰打出過的卡牌的其他複製
  TIME_103: { abilities: dr(fn('twChromie')) },
  // 穆拉丁，高王（傳說）：衝刺。戰吼：把高王之錘拿給我！亡語：將它加入你的手牌
  TIME_209: {
    fabled: ['TIME_209t', 'TIME_209t2'],
    keywords: ['RUSH'],
    abilities: [...play(fn('twBringHammer')), ...dr(fn('twHammerBack'))],
    tokens: ['TIME_209t', 'TIME_209t2'],
  },
  TIME_209t: { keywords: ['WINDFURY'], abilities: dr(fn('twHammerReturns')) },
  TIME_209t2: { target: { filter: { type: 'character', side: 'friendly' } }, abilities: play(fn('twAvatarForm')) },
  // 艾薩拉女士（傳說）：二選一 - 強化辛艾薩拉；或永恆之井。（另一個會被摧毀！）
  TIME_211: {
    fabled: ['TIME_211t1', 'TIME_211t2'],
    chooseOne: [
      { id: 'TIME_211a', name: '強化辛艾薩拉', text: '辛艾薩拉召喚的手下體質加倍。摧毀永恆之井', abilities: play(fn('twAzshara', { keep: 'zin' })) },
      { id: 'TIME_211b', name: '強化永恆之井', text: '永恆之井創造的法術會施放兩次。摧毀辛艾薩拉', abilities: play(fn('twAzshara', { keep: 'well' })) },
    ],
    tokens: ['TIME_211t1', 'TIME_211t1t', 'TIME_211t2', 'TIME_211t2t'],
  },
  TIME_211t1: { abilities: play(fn('twWell', { twice: false })) },
  TIME_211t1t: { abilities: play(fn('twWell', { twice: true })) },
  TIME_211t2: { target: friendlyMinion, abilities: play({ e: 'summonCopy', target: { t: 'chosen' }, count: 1 }) },
  TIME_211t2t: { target: friendlyMinion, abilities: play(fn('twZinDoubled')) },
  // 閃電避雷針：對一個友方手下造成 $2 點傷害，對一個隨機敵方手下造成 $4 點傷害
  TIME_212: { target: friendlyMinion, abilities: play(hit(2), { e: 'damage', target: randomEnemyMinion(), amount: 4, spell: true }) },
  // 原初監督者：戰吼：若你在手牌中時施放過自然法術，獲得 +1/+1 並抽一張牌
  TIME_213: { handAbilities: natureHeld, abilities: play(cond({ c: 'handCounter', n: 1 }, [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 1 }, draw()])) },
  // 熔流亡魂：嘲諷。每當你要用自然法術傷害此手下，改為使其 +2/+1
  TIME_214: { keywords: ['TAUNT'], flags: ['natureFeeds'] },
  // 風暴巨鴉：每當你要用自然法術傷害此手下，改為召喚一個隨機 5 費手下
  TIME_217: { flags: ['natureSummons'] },
  // 靜電震擊：對一個手下造成 $1 點傷害。使你的英雄本回合 +1 攻擊力
  TIME_218: { target: anyMinion, abilities: play(hit(1), { e: 'heroAttack', amount: 1 }) },
  // 淨化光裔：生命竊取。戰吼：對一個敵方手下造成等同此手下生命值的傷害
  TIME_427: { keywords: ['LIFESTEAL'], target: enemyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'selfHealth' } }) },
  // 神聖占卜師：戰吼：將你手牌中每個手下的攻擊力與生命值設為兩者中較高的數值
  TIME_429: { abilities: play(fn('twDivineAugur')) },
  // 琥珀女祭司：嘲諷。戰吼：為一個角色恢復等同此手下生命值的生命值
  TIME_431: { keywords: ['TAUNT'], target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: { dyn: 'selfHealth' } }) },
  // 交織的命運：發現你牌堆中一張牌的複製，以及你對手牌堆中一張牌的複製
  TIME_432: { abilities: play(fn('twIntertwinedFate')) },
  // 不復存在：倒轉。沉默並消滅一個隨機敵方手下
  TIME_433: { ...rewind(), abilities: play({ e: 'destroy', target: randomEnemyMinion() }) },
  // 暫時的旅者：亡語：召喚一個 4/1 暗影，它會攻擊一個隨機敵方手下
  TIME_434: { abilities: dr(fn('twShadowStrike')), tokens: ['TIME_434t'] },
  TIME_434t: {},
  // 永恆者：戰吼：奪取一個生命值不高於此手下的敵方手下
  TIME_435: { target: { filter: { type: 'minion', side: 'enemy', maxHp: 2 } }, abilities: play({ e: 'steal', target: { t: 'chosen' } }) },
  // 過去的匯流（地點）：召喚一條消耗 (5) 以上的隨機龍。前進到現在！
  TIME_436: {
    advanceTo: 'TIME_436t1',
    abilities: play(summonRandom({ type: 'MINION', race: 'DRAGON', minCost: 5, anyClass: true })),
    tokens: ['TIME_436t1', 'TIME_436t2'],
  },
  TIME_436t1: { advanceTo: 'TIME_436t2', abilities: play(fn('twDiscoverSummon', { pool: { type: 'MINION', race: 'DRAGON', minCost: 5, anyClass: true }, copy: false })) },
  TIME_436t2: { abilities: play(fn('twDiscoverSummon', { pool: { type: 'MINION', race: 'DRAGON', minCost: 5, anyClass: true }, copy: true })) },
  // 永恆撕裂：倒轉。對兩個隨機敵人造成 $4 點傷害
  TIME_441: { ...rewind(), abilities: play({ e: 'repeat', times: 2, effects: [{ e: 'damage', target: randomEnemy(), amount: 4, spell: true }] }) },
  // 時光看守者：戰吼：禁錮一個敵方手下，使其休眠 10,000 個回合。亡語：喚醒它
  TIME_442: { target: enemyMinion, abilities: [...play(fn('twImprison')), ...dr(fn('twAwakenImprisoned'))] },
  // 狂怒獵犬：召喚兩隻 3/2 惡魔。若你的牌堆中沒有手下，它們會攻擊生命值最低的敵人
  TIME_443: { abilities: play(fn('twHoundsOfFury')), tokens: ['TIME_443t', 'TIME_443t2'] },
  TIME_443t: {},
  TIME_443t2: {},
  // 時光遺失的戰刃：亡語：獲得一個來自過去的隨機惡魔
  TIME_444: { abilities: dr({ e: 'addRandom', pool: { type: 'MINION', race: 'DEMON', past: true, anyClass: true }, count: 1, who: 'self' }) },
  // 永恆牢籠（地點）：發現一隻消耗 (5) 以上的惡魔。若你的牌堆中沒有手下，你的下一個手下消耗為 (1)
  TIME_446: {
    abilities: play(
      { e: 'discover', pool: { type: 'MINION', race: 'DEMON', minCost: 5, anyClass: true } },
      cond({ c: 'deckNoMinions' }, [{ e: 'pendingDiscount', d: { set: 1, type: 'MINION' } }]),
    ),
  },
  // 真言術：障：使一個角色獲得聖盾。使你手牌中的手下 +2 生命值
  TIME_447: { target: anyChar, abilities: play(fn('twGiveShield'), { e: 'handBuff', atk: 0, hp: 2, scope: 'all' }) },
  // 孤獨：發現 2 個手下。若你的牌堆中沒有手下，使其中一張你手牌中的牌消耗減少 (2)
  TIME_448: { abilities: play(fn('twSolitude')) },
  // 持久的遺產：使你的英雄本回合 +4 攻擊力。若你的牌堆中沒有手下，使你手牌中的手下 +4 攻擊力
  TIME_449: { abilities: play({ e: 'heroAttack', amount: 4 }, cond({ c: 'deckNoMinions' }, [{ e: 'handBuff', atk: 4, hp: 0, scope: 'all' }])) },
  // 精準射擊：造成 $3 點傷害。若這張牌正好在你手牌的正中央，改為造成 $5 點
  TIME_600: { target: anyChar, abilities: play(cond({ c: 'handCenter' }, [hit(5)], [hit(3)])) },
  // 箭矢回收者：戰吼：抽牌直到你有 3 張手牌
  TIME_601: { abilities: play(fn('twDrawUntil', { n: 3 })) },
  // 蟲洞：倒轉。召喚一隻隨機 3 費野獸，它會攻擊一個隨機敵人
  TIME_602: { ...rewind(), abilities: play(fn('twWormhole')) },
  // 奎爾多雷弓箭手：當你的手牌只有 3 張以下時，你的英雄能力消耗為 (0)
  TIME_606: { flags: ['heroPowerFreeSmallHand'] },
  // 遊俠將軍希瓦娜斯（傳說）：戰吼：對所有敵人造成 2 點傷害。若你打出過奧蕾莉亞或維蕾薩，各重複一次
  TIME_609: {
    fabled: ['TIME_609t1', 'TIME_609t2'],
    abilities: play(fn('twSylvanas')),
    tokens: ['TIME_609t1', 'TIME_609t2'],
  },
  TIME_609t1: { abilities: play(fn('twAlleria')) },
  TIME_609t2: { abilities: play(fn('twVereesa')) },
  // 昨日之影：倒轉。召喚四個 3/2 暗影，它們各獲得兩個隨機的額外效果
  TIME_610: { ...rewind(), abilities: play(fn('twShadowsOfYesterday')), tokens: ['TIME_610t2'] },
  TIME_610t2: {},
  // 殭屍收割者胡斯克：戰吼：使你的英雄獲得「亡語：花費最多 20 具屍體，以等量生命值復活」
  TIME_618: { abilities: play(fn('twEternalLife')) },
  // 墳墓的坦吉（傳說）：戰吼：抽取伯昂撒姆（若他已死亡則使其復活）。選擇一個恩澤賜予他
  TIME_619: {
    fabled: ['TIME_619t', 'TIME_619t2'],
    abilities: play(fn('twTalanji')),
    tokens: ['TIME_619t', 'TIME_619t2', 'TIME_619t3', 'TIME_619t4', 'TIME_619t5'],
  },
  TIME_619t: { abilities: dr(fn('twBwonsamdi')) },
  TIME_619t2: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 2, spell: true }, fn('twBoon')) },
  TIME_619t3: {},
  TIME_619t4: {},
  TIME_619t5: {},
  // 不合時宜的死亡：奧秘：當一個友方手下在被打出後的下個回合死亡時，重新召喚它
  TIME_620: secretOn('friendlyMinionDies', fn('twUntimelyDeath')),
  // 時間光環：在你的回合結束時，召喚一隻 3/5 嘲諷的龍。持續 3 個回合
  TIME_700: { objective: 3, abilities: [...play(fn('objective')), ...atEndOfTurn(summon('TIME_700t'))], tokens: ['TIME_700t'] },
  TIME_700t: { keywords: ['TAUNT'] },
  // 波形塑造：發現你牌堆中的一張牌，其餘的放到牌堆底部
  TIME_701: { abilities: play(fn('twWaveshaping')) },
  // 漲潮與退潮：造成 $3 點傷害。若你在手牌中時打出過手下，獲得 5 點護甲值
  TIME_702: {
    target: anyChar,
    handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [fn('counterInHand')] }],
    abilities: play(hit(3), cond({ c: 'handCounter', n: 1 }, [{ e: 'armor', amount: 5 }])),
  },
  // 瀕危的渡渡鳥：嘲諷。戰吼：若你的生命值不高於 10，獲得 +5/+5並召喚一個此手下的複製
  TIME_703: {
    keywords: ['TAUNT'],
    abilities: play(cond({ c: 'heroHealth', op: '<=', n: 10 }, [{ e: 'buff', target: { t: 'self' }, atk: 5, hp: 5 }, { e: 'summonCopy', target: { t: 'self' }, count: 1 }])),
  },
  // 高等精靈導師：戰吼：獲得一個 2/2 學徒。發現一張來自過去、消耗 (7) 以上的法術，傳授給它
  TIME_704: { abilities: play(fn('twHighborneMentor')), tokens: ['TIME_704t'] },
  TIME_704t: { abilities: play(fn('twPupilCast')) },
  // 永恆守護者克羅娜：嘲諷。戰吼：將你牌堆最底下 5 張牌的消耗設為 (1)
  TIME_705: { keywords: ['TAUNT'], abilities: play(fn('twKrona')) },
  // 時間彼端的鰭：戰吼：把你的手牌換成起始手牌。在你的回合結束時換回來
  TIME_706: { abilities: play(fn('twFinsBeyondTime')) },
  // 另一個現實：將你的手牌與牌堆換成來自過去的隨機二選一卡牌，它們的消耗減少 (1)
  TIME_707: { abilities: play(fn('twAlternateReality')) },
  // 回溯：召喚兩個來自過去的隨機 1 費手下。連擊：使它們 +1 攻擊力
  TIME_711: { abilities: play(fn('twFlashback')) },
  // 時間海軍上將鉤尾：戰吼：為你的對手召喚一個 0/8 的箱子。裡面全是金幣！
  TIME_713: { abilities: play({ e: 'summon', card: 'TIME_713t', count: 1, who: 'opponent' }), tokens: ['TIME_713t'] },
  TIME_713t: { abilities: dr(fn('twFillHandCoins')) },
  // 時光領主艾波克：戰吼：消滅你的對手上回合打出的所有手下
  TIME_714: { abilities: play(fn('twEpoch')) },
  // 緩慢動作：你的對手下個回合的卡牌消耗增加 (1)
  TIME_716: { abilities: play(fn('twSlowMotion')) },
  // 卡多雷培育者：戰吼：發現 2 隻野獸。將它們放到你牌堆的底部，並使其 +5/+5
  TIME_730: { abilities: play(fn('twCultivator')) },
  // 先發制人的一擊：造成 $3 點傷害。若你的手牌中有消耗 (5) 以上的手下，抽一張手下牌
  TIME_750: {
    target: anyChar,
    abilities: play(hit(3), cond({ c: 'holding', type: 'MINION', minCost: 5 }, [{ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION' } }])),
  },
  // 快轉：抽 2 張牌。選擇其中一張，使其消耗減少 (2)
  TIME_770: { abilities: play(fn('twFastForward')) },
  // 過去的銀月城（地點）：對一個隨機敵方手下造成 5 點傷害。前進到現在！
  TIME_810: {
    advanceTo: 'TIME_810t1',
    abilities: play({ e: 'damage', target: randomEnemyMinion(), amount: 5 }),
    tokens: ['TIME_810t1', 'TIME_810t2'],
  },
  TIME_810t1: { advanceTo: 'TIME_810t2', abilities: play(fn('twSilvermoon', { lowest: false })) },
  TIME_810t2: { abilities: play(fn('twSilvermoon', { lowest: true })) },
  // 血戰士洛戈什（傳說）：衝刺。亡語：從你的手牌召喚一個血戰士，使其獲得 +5/+5 並攻擊一個隨機敵人
  TIME_850: {
    fabled: ['TIME_850t', 'TIME_850t1'],
    keywords: ['RUSH'],
    abilities: dr(fn('twBloodFighter', { attack: true })),
    tokens: ['TIME_850t', 'TIME_850t1'],
  },
  TIME_850t: { keywords: ['TAUNT'], abilities: dr(fn('twBloodFighter', { kw: 'TAUNT' })) },
  TIME_850t1: { keywords: ['ELUSIVE'], abilities: dr(fn('twBloodFighter', { kw: 'ELUSIVE' })) },
  // 碧藍女王辛德拉苟薩（傳說）：若你控制另一條龍，你的奧術法術消耗減少 (2)
  TIME_852: { fabled: ['TIME_852t1', 'TIME_852t3'], flags: ['sindragosaArcane'], tokens: ['TIME_852t1', 'TIME_852t3'] },
  TIME_852t1: { flags: ['malygosArcane'] },
  TIME_852t3: { abilities: play(fn('summonDeadRace', { race: 'DRAGON' })) },
  // 奧術彈幕：對一個敵人造成 $3 點傷害，對另外兩個隨機敵人各造成 $2 點傷害
  TIME_855: { target: enemyChar, abilities: play(hit(3), fn('twBarrage')) },
  // 時光變換：發現兩個來自過去的奧術法術，它們的消耗減少 (2)
  TIME_857: {
    abilities: play(
      ...[0, 1].map((): Effect => ({ e: 'discover', pool: { type: 'SPELL', spellSchool: 'ARCANE', past: true, anyClass: true }, then: [{ e: 'costMod', amount: -2, scope: 'discovered' }] })),
    ),
  },
  // 時空建構體：戰吼：對一個敵方手下造成 5 點傷害。抽等同於溢出傷害數量的牌
  TIME_858: { target: enemyMinion, abilities: play(fn('twExcessDraw', { amount: 5 })) },
  // 異常化：召喚一個隨機 10 費與一個隨機 1 費手下，打亂它們的屬性值
  TIME_859: { abilities: play(fn('twAnomalize')) },
  // 無面謎團：戰吼：查看 2 個隨機奧秘。選擇一個為你施放，另一個為你的對手施放
  TIME_860: { abilities: play(fn('twFacelessEnigma')) },
  // 時間循環者托奇：戰吼：獲得 3 張來自過去的隨機法術牌。當你打出這 3 張牌時，再獲得一個時間循環者托奇
  TIME_861: { abilities: play(fn('twToki')) },
  // 競技場決鬥：從你的牌堆召喚一個隨機手下。為你的對手召喚一隻有潛行的 5/5 老虎
  TIME_870: { abilities: play({ e: 'recruit', count: 1 }, { e: 'summon', card: 'TIME_870t', count: 1, who: 'opponent' }), tokens: ['TIME_870t'] },
  TIME_870t: { keywords: ['STEALTH'] },
  // 來世的繼承者：嘲諷。戰吼：每有一個受傷的手下，獲得 +2/+2
  TIME_871: { keywords: ['TAUNT'], abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'damagedMinions', mult: 2 }, hp: { dyn: 'damagedMinions', mult: 2 } }) },
  // 不敗冠軍：衝刺。戰吼：用隨機 1 費手下填滿你對手的戰場
  TIME_872: { keywords: ['RUSH'], abilities: play(fn('twFillOppBoard', { cost: 1 })) },
  TIME_873t: {},
  // 加羅娜‧半獸人（傳說）：戰吼：若你的對手手牌中有萊恩國王，消滅他並將對手的生命值減半
  TIME_875: { fabled: ['TIME_875t', 'TIME_875t1'], abilities: play(fn('twGarona')), tokens: ['TIME_875t', 'TIME_875t1'] },
  TIME_875t: { startOfGame: 'twHideLlane', abilities: play(draw(), fn('shuffleSelf')) },
  TIME_875t1: { abilities: heroHit([{ e: 'draw', count: 1, who: 'both', pool: { type: 'MINION', rarity: 'LEGENDARY' } }]) },
  // 變形者：你的手牌中每過一個回合，變成你對手手牌中的一個隨機手下
  TIME_876: { handShift: { kind: 'opponentCard' } },
  // 『守護者』麥迪文（傳說）：若你控制卡拉贊，消耗為 (0)。戰吼：沉默並消滅所有其他手下
  TIME_890: {
    fabled: ['TIME_890t', 'TIME_890t2'],
    costIf: { cond: { c: 'controlLocation', nameEn: 'Karazhan' }, cost: 0 },
    abilities: play(fn('twMedivh')),
    tokens: ['TIME_890t', 'TIME_890t2'],
  },
  TIME_890t: { costIf: { cond: { c: 'control', nameIncludes: 'Medivh' }, cost: 0 }, flags: ['doubleSpellPower'] },
  TIME_890t2: { costIf: { cond: { c: 'weaponNamed', nameEn: 'Atiesh' }, cost: 0 }, abilities: play(summonRandom({ type: 'MINION', cost: 8, anyClass: true }, 2)) },
};
