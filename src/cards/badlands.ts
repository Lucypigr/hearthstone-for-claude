// ============================================================================
// 決戰荒蕪之地（Showdown in the Badlands）：挖掘、快槍、開局沒有重複的卡、瓶子、汙泥桶……
// 解析器看不懂的卡在這裡手動定義；自訂效果（bl 開頭）在 game.ts 的 customBadlands。
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
const excavate: Effect = fn('blExcavate');
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const enemyChar: TargetReq = { filter: { type: 'character', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const enemyMinions = { type: 'minion' as const, side: 'enemy' as const };
const quickdraw: Condition = { c: 'quickdraw' };
const noDupes: Condition = { c: 'startedNoDupes' };
const excavated2: Condition = { c: 'excavated', n: 2 };

/** 挖掘的寶藏（依稀有度分級：普通 → 稀有 → 史詩 → 傳說（各職業）） */
export const EXCAVATE_TIERS: string[][] = [
  ['WW_001t', 'WW_001t2', 'WW_001t3', 'WW_001t4', 'WW_001t18', 'DEEP_999t1'],
  ['WW_001t5', 'WW_001t7', 'WW_001t8', 'WW_001t9', 'WW_001t16', 'DEEP_999t2'],
  ['WW_001t11', 'WW_001t12', 'WW_001t13', 'WW_001t14', 'WW_001t17', 'DEEP_999t3'],
];
export const EXCAVATE_LEGENDARY: Record<string, string> = {
  PALADIN: 'DEEP_999t4',
  SHAMAN: 'DEEP_999t5',
  ROGUE: 'WW_001t23',
  MAGE: 'WW_001t24',
  WARLOCK: 'WW_001t25',
  DEATHKNIGHT: 'WW_001t26',
  WARRIOR: 'WW_001t27',
};
const TREASURES = [...EXCAVATE_TIERS.flat(), ...Object.values(EXCAVATE_LEGENDARY)];
const BANDITS = ['WW_345t1', 'WW_345t2', 'WW_345t3', 'WW_345t4', 'WW_345t5', 'WW_345t6', 'WW_345t7', 'WW_345t8'];
const CHAMELEONS = ['WW_810t1', 'WW_810t2', 'WW_810t3', 'WW_810t4', 'WW_810t5', 'WW_810t6', 'WW_810t7', 'WW_810t8'];
const BONUS = ['DIVINE_SHIELD', 'TAUNT', 'RUSH', 'WINDFURY', 'ELUSIVE', 'POISONOUS', 'LIFESTEAL', 'REBORN'] as const;
const DICE = ['WW_400t1', 'WW_400t2', 'WW_400t3', 'WW_400t4', 'WW_400t5', 'WW_400t6'];
const SLUDGE = 'WW_044t';

export const BADLANDS_OVERRIDES: Record<string, Override> = {
  // ================================================================ 挖掘的寶藏
  WW_001t: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }) },
  WW_001t2: { target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 3 }, draw(1)) },
  WW_001t3: { abilities: play(discover({ cost: 2 }, [fn('wzSetCostIt', { cost: 0 })])) },
  WW_001t4: { keywords: ['RUSH'] },
  WW_001t18: { abilities: play(addCard('GAME_005', 2)) },
  DEEP_999t1: { target: { filter: { type: 'minion', side: 'friendly' } }, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, { e: 'damage', target: { t: 'random', filter: enemyMinions, count: 1 }, amount: 2, spell: true }) },
  WW_001t5: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, { e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 3, spell: true }) },
  WW_001t7: { target: optional(enemyMinion), abilities: play({ e: 'returnToHand', target: { t: 'chosen' } }) },
  WW_001t8: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 2 }, { e: 'buff', target: { t: 'adjacent', of: 'chosen' }, atk: 1, hp: 2 }) },
  WW_001t9: { abilities: play(discover({ cost: 3 }, [fn('wzSetCostIt', { cost: 0 })])) },
  WW_001t16: { keywords: ['TAUNT'], abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', cost: 2, anyClass: true }, count: 1, who: 'self' }) },
  DEEP_999t2: { abilities: endTurn({ e: 'damage', target: allEnemies, amount: 2 }) },
  WW_001t11: { target: anyMinion, abilities: play({ e: 'setStats', target: { t: 'chosen' }, atk: 6, hp: 7 }) },
  WW_001t12: { abilities: play({ e: 'damage', target: allEnemies, amount: 3, spell: true }) },
  WW_001t13: { keywords: ['TAUNT', 'REBORN', 'ELUSIVE'] },
  WW_001t14: { abilities: play(discover({ cost: 5 }, [fn('wzSetCostIt', { cost: 0 })])) },
  WW_001t17: { keywords: ['RUSH', 'DIVINE_SHIELD', 'LIFESTEAL'] },
  DEEP_999t3: { abilities: play(fn('blWorldPillar')) },
  DEEP_999t4: { abilities: play(fn('blAzeriteDragon')) },
  DEEP_999t5: { abilities: play(fn('blAzeriteMurloc')) },
  WW_001t23: { abilities: play(fn('blAzeriteScorpion')) },
  WW_001t24: { abilities: play(fn('blAzeriteHawk')) },
  WW_001t25: { abilities: play(fn('blAzeriteSnake')) },
  WW_001t26: { abilities: play(fn('blAzeriteRat')) },
  WW_001t27: { abilities: play(fn('blAzeriteOx')) },

  // ================================================================ 中立
  // 狗頭人礦工：戰吼：挖掘一個寶藏
  WW_001: { abilities: play(excavate), tokens: TREASURES },
  // 鑽地破壞者：突襲。戰吼：挖掘一個寶藏
  WW_002: { keywords: ['RUSH'], abilities: play(excavate), tokens: TREASURES },
  // 賞金告示板：你的挖掘、快槍、可交易與傳說卡消耗減少 (1)
  WW_003: { flags: ['bountyBoard'] },
  // 侵蝕沉積物：戰吼：若你上個回合打出過元素，發現一個來自過去的任何元素
  WW_428: { abilities: play(cond({ c: 'playedElementalLastTurn' }, [discover({ type: 'MINION', race: 'ELEMENTAL', past: true, anyClass: true })])) },
  // 加特林響尾蛇：在你的回合結束時，裝填兩發各造成 1 點傷害的子彈。亡語：向隨機敵人開火！
  WW_431: { abilities: [...endTurn(fn('blLoadBullets')), ...dr(fn('blFireBullets'))] },
  // 艾澤萊晶巨人：你每連續一個回合打出元素，消耗減少 (1)
  WW_025: { costRule: { per: 'elementalStreakNow', amount: 1 } },
  // 電車機械師：亡語：獲得一桶汙泥
  WW_044: { abilities: dr(addCard(SLUDGE)), tokens: [SLUDGE] },
  WW_044t: { abilities: [...play(fn('blSludge')), { on: { k: 'discarded' }, effects: [fn('blSludge')] }] },
  // 活板門蜘蛛：潛行、劇毒。在你的對手打出一個手下後，攻擊它
  WW_300: { keywords: ['STEALTH', 'POISONOUS'], abilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [fn('blTrapdoor')] }] },
  // 奇蹟推銷員：亡語：獲得一瓶可交易的蛇油
  WW_331: { abilities: dr(addCard('WW_331t')), tokens: ['WW_331t'] },
  WW_331t: { keywords: ['TRADEABLE'], target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 0, spell: true }) },
  // 蛇油販子：亡語：把 2 瓶可交易的蛇油洗入你對手的牌堆
  WW_332: { abilities: dr({ e: 'shuffle', card: 'WW_331t', count: 2, who: 'opponent' }), tokens: ['WW_331t'] },
  // 你好鰭：每當你的手牌少於 3 張，獲得一個隨機魚人
  WW_333: { flags: ['howdyfin'] },
  // 巴雷布林警長：戰吼：若你的生命值在 20 以下，開啟荒蕪之地監獄
  WW_359: { abilities: play(cond({ c: 'heroHealth', op: '<=', n: 20 }, [fn('blJail')])), tokens: ['WW_359t'] },
  WW_359t: { target: anyMinion, abilities: play(fn('wzRedCard', { turns: 3 })) },
  // 艾澤萊晶鎖鏈幫：嘲諷。戰吼與快槍：召喚一個此手下的複製
  WW_360: { keywords: ['TAUNT'], abilities: play({ e: 'summonCopy', target: { t: 'self' }, count: 1 }, cond(quickdraw, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },
  // 燧石火器：戰吼：獲得一張隨機的快槍卡。若你在本回合打出它，重複一次
  WW_379: { abilities: play(fn('blFlintFirearm')) },
  // 乾鱗副警長：戰吼：你下一次抽到法術時，獲得一張它的複製
  WW_383: { abilities: play(fn('blDryscale')) },
  // 爆裂元素：嘲諷。亡語：對所有手下造成 2 點傷害，友方元素除外
  WW_397: { keywords: ['TAUNT'], abilities: dr(fn('blDangBlasted')) },
  // 煤氣燈守門人：戰吼：把你的手牌洗入牌堆，然後抽等量的牌
  WW_398: { abilities: play(fn('blGaslight')) },
  // 正午決鬥者：亡語：雙方玩家抽牌！消滅消耗較低的那張
  WW_399: { abilities: dr(fn('blHighNoon')) },
  // 食人魔幫歹徒：突襲。50% 機率攻擊錯誤的敵人
  WW_418: { keywords: ['RUSH'], flags: ['misdirect'] },
  // 食人魔幫騎手：突襲。50% 機率改為本回合使你的英雄 +3 攻擊力而不是攻擊
  WW_419: { keywords: ['RUSH'], flags: ['ogreRider'] },
  // 食人魔幫王牌：突襲。每當此手下攻擊，獲得聖盾（50% 機率改為生命竊取）
  WW_420: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('blOgreAce')] }] },
  // 首領帕德：戰吼：復活你的食人魔幫。使它們獲得風怒
  WW_421: { abilities: play(fn('blKingpinPud')) },
  // 舞伴：戰吼：若你持有另一張 3 費卡，召喚一個隨機的 3 費手下
  WW_433: { abilities: play(cond({ c: 'holdingOtherCost', n: 3 }, [{ e: 'summonRandom', pool: { type: 'MINION', cost: 3, anyClass: true }, count: 1, who: 'self' }])) },
  // 日斑龍：可交易、生命竊取。快槍：造成 6 點傷害
  WW_434: { keywords: ['TRADEABLE', 'LIFESTEAL'], target: { ...optional(anyChar), when: quickdraw }, abilities: play(cond(quickdraw, [{ e: 'damage', target: { t: 'chosen' }, amount: 6 }])) },
  // 雷霆之使：嘲諷。亡語：從你的牌堆召喚一個元素與一個野獸
  WW_440: { keywords: ['TAUNT'], abilities: dr({ e: 'recruit', count: 1, race: 'ELEMENTAL' }, { e: 'recruit', count: 1, race: 'BEAST' }) },
  // 雛龍牛仔：在你的回合結束時，獲得一隻有嘲諷的 1/2 幼龍
  WW_827: { abilities: endTurn(addCard('WW_816t')), tokens: ['WW_816t'] },
  WW_816t: { keywords: ['TAUNT'] },
  // 馬蹄鐵投擲手：戰吼：對一個隨機敵方手下造成 2 點傷害。快槍：再加上它的一個相鄰手下
  WW_900: { abilities: play(fn('blHorseshoe')) },
  // 貪婪夥伴：戰吼：若你持有另一張 2 費卡，獲得一枚幸運幣
  WW_901: { abilities: play(cond({ c: 'holdingOtherCost', n: 2 }, [addCard('GAME_005')])) },
  // 粗暴夥伴：戰吼：若你持有另一張 4 費卡，造成 4 點傷害
  WW_906: { target: { ...optional(anyChar), when: { c: 'holdingOtherCost', n: 4 } }, abilities: play(cond({ c: 'holdingOtherCost', n: 4 }, [{ e: 'damage', target: { t: 'chosen' }, amount: 4 }])) },
  // 虹光石旋蟲：亡語：使你的每個手下獲得一個隨機的額外效果
  DEEP_035: { abilities: dr(fn('blBonusAll')) },
  // 塞拉贊恩：嘲諷。亡語：使你手牌與牌堆中的所有元素屬性值加倍
  DEEP_036: { keywords: ['TAUNT'], abilities: dr(fn('blTherazane')) },
  // 瑪魯特‧石縛者：戰吼：若你的牌堆在開始時沒有重複的卡，發現一個元素並召喚，其他加入你的手牌
  DEEP_037: { abilities: play(cond(noDupes, [fn('blWorldPillar')])) },

  // ================================================================ 死亡騎士
  // 義肢手：磁力、重生。可以吸附到機械或不死族上
  DEEP_015: { magnetic: true, magnetRaces: ['MECHANICAL', 'UNDEAD'], keywords: ['REBORN'] },
  // 骷髏船員：戰吼：挖掘一個寶藏。它消耗 (0)
  WW_322: { abilities: play(fn('blExcavate', { free: true })), tokens: TREASURES },
  // 骨堆：亡語：你下一次挖掘時，重新召喚此手下
  WW_324: { abilities: dr(fn('blPileOfBones')) },
  // 收割吧：造成 3 點傷害。挖掘一個寶藏
  WW_352: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, excavate), tokens: TREASURES },
  // 苦痛之牛：嘲諷。戰吼：若你挖掘過兩次，本回合你的下一張牌消耗減少 (7)
  WW_356: { keywords: ['TAUNT'], abilities: play(cond(excavated2, [{ e: 'nextCardDiscount', amount: 7 }])) },
  // 農場工人：戰吼：發現一個不死族。快槍：它消耗減少 (2)
  WW_358: { abilities: play(discover({ type: 'MINION', race: 'UNDEAD' }, [cond(quickdraw, [{ e: 'costMod', amount: -2, scope: 'it' }])])) },

  // ================================================================ 惡魔獵人
  // 暗影石潛伏者：突襲。戰吼：拿走你的武器並獲得它的屬性值。亡語：還回去
  DEEP_012: { keywords: ['RUSH'], abilities: [...play(fn('blSkulkerTake')), ...dr(fn('blSkulkerGive'))] },
  // 邪能裂隙：對所有手下造成 2 點傷害。在你的下個回合開始時，再對所有手下造成 2 點傷害
  DEEP_013: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 2, spell: true }, { e: 'delayed', turns: 1, effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 2 }] }) },
  // 蛇眼：戰吼：擲兩顆骰子，然後發現兩張那些消耗的卡（雙骰再多發現一次！）
  WW_400: { abilities: play(fn('blSnakeEyes')), tokens: DICE },
  ...Object.fromEntries(DICE.map((id, i) => [id, { abilities: play(discover({ cost: i + 1 })) }])),
  // 槍手庫爾特魯斯：戰吼：若你的牌堆在開始時沒有重複的卡，對敵方手牌中的手下射出六發 2 點傷害的子彈
  WW_401: { abilities: play(cond(noDupes, [fn('blKurtrus')])) },
  // 盲眼神射手：在你打出一個納迦後，對一個隨機敵人造成 2 點傷害並抽一張法術（然後交換！）
  WW_402: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', race: 'NAGA' }, effects: [fn('blSharpshooter', { naga: true })] }, { on: { k: 'spellCast', side: 'friendly' }, effects: [fn('blSharpshooter', { naga: false })] }] },
  // 口袋沙子：造成 3 點傷害。快槍：你對手的下一張牌消耗增加 (1)
  WW_403: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }, cond(quickdraw, [fn('blPocketSand')])) },
  // 綠洲歹徒：發現一個納迦。若你在持有這張牌時打出過納迦，使其消耗減少 (1)
  WW_404: { handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly', race: 'NAGA' }, effects: [fn('wzHeldSpell')] }], abilities: play(discover({ type: 'MINION', race: 'NAGA' }, [fn('blOasis')])) },
  // 扇擊：對生命值最低的敵人分配 6 點傷害
  WW_405: { abilities: play(fn('blFanTheHammer')) },
  // 口渴的亡命之徒：戰吼：若你在持有這張牌時施放過法術，本回合使你的英雄 +3 攻擊力
  WW_407: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('wzHeldSpell')] }], abilities: play(cond({ c: 'heldSpell' }, [{ e: 'heroAttack', amount: 3 }])) },
  // 酒保機器人：戰吼：抽一張流放卡，把它滑到你手牌的最左邊
  WW_408: { abilities: play(fn('blBartendobot')) },
  // 上膛：造成 2 點傷害。你的下一個納迦、邪能法術與武器消耗減少 (1)
  WW_409: {
    target: anyChar,
    abilities: play(
      { e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true },
      { e: 'pendingDiscount', d: { amount: 1, race: 'NAGA' } },
      { e: 'pendingDiscount', d: { amount: 1, type: 'SPELL', school: 'FEL' } },
      { e: 'pendingDiscount', d: { amount: 1, type: 'WEAPON' } },
    ),
  },

  // ================================================================ 德魯伊
  // 憂鬱石守衛：嘲諷。二選一：棄掉 2 張牌；或摧毀你的一個法力水晶。鑄造：兩者都不做
  DEEP_027: { forge: 'DEEP_027t', keywords: ['TAUNT'] },
  DEEP_027a: { abilities: play({ e: 'discard', count: 2 }) },
  DEEP_027b: { abilities: play({ e: 'mana', kind: 'destroy', amount: 1 }) },
  DEEP_027t: { keywords: ['TAUNT'] },
  // 水晶簇：獲得三個空的法力水晶。放不下的召喚一個有嘲諷的 3/7 元素
  DEEP_028: { abilities: play(fn('blCrystalCluster')), tokens: ['DEEP_028t'] },
  DEEP_028t: { keywords: ['TAUNT'] },
  // 仙人掌造物：發現一個 2 費手下。召喚一個它的 1/2 複製
  WW_818: { abilities: play(fn('blCactusConstruct')) },
  // 龍族故事：二選一：獲得兩條消耗 (5) 以下的隨機龍；或兩條消耗大於 (5) 的
  WW_821t1: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', race: 'DRAGON', maxCost: 5 }, count: 2, who: 'self' }) },
  WW_821t2: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', race: 'DRAGON', minCost: 6 }, count: 2, who: 'self' }) },
  WW_821: { chooseOneIds: ['WW_821t1', 'WW_821t2'], tokens: ['WW_821t1', 'WW_821t2'] },
  // 龍族魔像：嘲諷。戰吼：你手牌中每有一條龍，就召喚一個此手下的複製
  WW_822: { keywords: ['TAUNT'], abilities: play({ e: 'repeat', times: { dyn: 'dragonsInHand' }, effects: [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }] }) },
  // 補充水分：恢復 7 點生命值。快槍：重新整理 2 個法力水晶
  WW_823: { target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 7 }, cond(quickdraw, [{ e: 'mana', kind: 'refresh', amount: 2 }])) },
  // 蕾艾斯卓莎：戰吼：若你的牌堆在開始時沒有重複的卡，召喚淨化的龍巢
  WW_824: { abilities: play(cond(noDupes, [fn('blDragonNest')])), tokens: ['WW_824t'] },
  WW_824t: { keywords: ['DORMANT'], abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [discover({ type: 'MINION', race: 'DRAGON' }, [{ e: 'costMod', amount: -4, scope: 'it' }])] }] },

  // ================================================================ 獵人
  // 不搭的化石：發現一個野獸與一個不死族。交換它們的屬性值
  DEEP_001: { abilities: play(fn('blMismatched')) },
  // 微光射擊：造成 1 點傷害。召喚一個與它消耗相同的隨機手下
  DEEP_003: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 1, spell: true }, fn('blShimmerShot')) },
  // 黑曜石亡魂：嘲諷。亡語：召喚兩個消耗 (3) 以下的隨機亡語手下
  DEEP_005: { keywords: ['TAUNT'], abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', maxCost: 3, hasDeathrattle: true, anyClass: true }, count: 2, who: 'self' }) },
  // 鬼祟的蛇：召喚兩隻有潛行的 1/1 蛇
  WW_806: { abilities: play(summon('WW_806t', 2)), tokens: ['WW_806t'] },
  WW_806t: { keywords: ['STEALTH'] },
  // 銀蛇：突襲、劇毒。快槍：本回合獲得免疫
  WW_808: { keywords: ['RUSH', 'POISONOUS'], abilities: play(cond(quickdraw, [{ e: 'buff', target: { t: 'self' }, keywords: ['IMMUNE'], temp: true }])) },
  // 牛骨骸：亡語：若此手下有 4 以上攻擊力，召喚一個牛骨骸
  WW_809: { abilities: dr(fn('blBovine')) },
  // 偽裝坐騎：使一個手下獲得 +3/+3 與一個隨機額外效果。它死亡時，召喚一隻變色龍
  WW_810: { target: anyMinion, abilities: play(fn('blCamouflage')), tokens: CHAMELEONS },
  ...Object.fromEntries(CHAMELEONS.map((id, i) => [id, { keywords: [BONUS[i]] }])),
  // 十加侖帽：抽一張手下。使它獲得 +1/+1 與「亡語：獲得一頂十加侖帽」
  WW_811: { abilities: play(fn('blTenGallon')) },
  // 上鞍！：使你的手下獲得「亡語：召喚一個消耗 (3) 以下的隨機野獸」
  WW_812: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', race: 'BEAST', maxCost: 3, anyClass: true }, count: 1, who: 'self' }) }) },
  // 刺牙：戰吼與亡語：召喚一個消耗等同此手下攻擊力的隨機野獸
  WW_814: { abilities: [...play(fn('blSpurfang')), ...dr(fn('blSpurfang'))] },
  // 迷失的塞杜林：戰吼：若你的牌堆在開始時沒有重複的卡，本回合獲得免疫並攻擊所有敵人
  WW_815: { abilities: play(cond(noDupes, [fn('blTheldurin')])) },

  // ================================================================ 法師
  // 召喚結界：奧秘：當你的回合開始時，召喚一個你消耗最高的手下的複製
  DEEP_000: { secret: true, abilities: [{ on: { k: 'secret', ev: 'turnStart' }, effects: [fn('blSummoningWard')] }] },
  // 元素夥伴：召喚一個隨機的元素夥伴
  DEEP_002: { abilities: play(fn('summonOneOf', { cards: ['DEEP_002t', 'DEEP_002t2', 'DEEP_002t3'] })), tokens: ['DEEP_002t', 'DEEP_002t2', 'DEEP_002t3'] },
  DEEP_002t: { costAuras: [{ side: 'friendly', type: 'SPELL', add: -1 }] },
  DEEP_002t2: { spellDamage: 2 },
  DEEP_002t3: { keywords: ['ELUSIVE'] },
  // 地函塑形者：你在持有這張牌時每施放一張法術，消耗減少 (1)
  DEEP_004: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('blHeldDiscount')] }] },
  // 冰凍保存：凍結一個敵人。挖掘一個寶藏
  WW_009: { target: enemyChar, abilities: play({ e: 'freeze', target: { t: 'chosen' } }, excavate), tokens: TREASURES },
  // 熱浪：對一個敵方手下與其相鄰手下造成 2 點傷害。快槍：改為對所有敵人
  WW_377: {
    target: { filter: { type: 'minion', side: 'enemy' }, when: { c: 'not', cond: quickdraw } },
    abilities: play(cond(quickdraw, [{ e: 'damage', target: allEnemies, amount: 2, spell: true }], [{ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }, { e: 'damage', target: { t: 'adjacent', of: 'chosen' }, amount: 2, spell: true }])),
  },
  // 艾澤萊晶礦脈：奧秘：當敵人在一張牌進入手牌的回合打出它，獲得一張消耗 (0) 的複製
  WW_422: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyQuickdraw' }, effects: [fn('blAzeriteVein')] }] },
  // 溢流湧動者：戰吼：你每連續一個回合打出元素，就召喚一個此手下的複製
  WW_424: { abilities: play({ e: 'repeat', times: { dyn: 'elementalStreak' }, effects: [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }] }) },
  // 觀星：抽一張不同的奧術法術。若你在本回合打出它，它會施放兩次
  WW_425: { abilities: play(fn('blStargazing')) },
  // 爆破法師礦工：戰吼：挖掘一個寶藏。你每有一張手牌，就對一個隨機敵人造成 1 點傷害
  WW_426: { abilities: play(excavate, fn('blBlastmage')), tokens: TREASURES },
  // 梅斯阿頓：戰吼：抽一張元素。把它分成兩半
  WW_429: { abilities: play(fn('blMesadune')) },
  // 泰瑟蘭‧血守：不是一開始就在你牌堆中的卡消耗減少 (4)（但不會低於 1）
  WW_430: { flags: ['taethelan'] },
  // 聖物研究員：戰吼：若你挖掘過兩次，施放兩個隨機的法師奧秘
  WW_432: { abilities: play(cond(excavated2, [fn('tnCastSecretsN', { n: 2 })])) },

  // ================================================================ 聖騎士
  // 冒險家芬利爵士：戰吼：若你挖掘過兩次，把所有敵方手下變形成 1/1 魚人
  DEEP_007: { abilities: play(cond(excavated2, [{ e: 'transform', target: { t: 'all', filter: enemyMinions }, card: 'CS2_168' }])), tokens: ['CS2_168'] },
  // 蘑菇挖掘：使一個手下獲得聖盾。挖掘一個寶藏
  DEEP_018: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, keywords: ['DIVINE_SHIELD'] }, excavate), tokens: TREASURES },
  // 化石萬花龍：戰吼：獲得兩個隨機的額外效果。挖掘一個寶藏
  DEEP_033: { abilities: play(fn('blTwoBonus'), excavate), tokens: TREASURES },
  // 決鬥！：雙方玩家各召喚三個 3/3 亡命之徒。使你的獲得突襲
  WW_051: { abilities: play(fn('blShowdown')), tokens: ['WW_051t'] },
  WW_051t: {},
  // 神聖牛仔：戰吼：你的下一張神聖法術消耗減少 (2)
  WW_335: { abilities: play({ e: 'pendingDiscount', d: { amount: 2, type: 'SPELL', school: 'HOLY' } }) },
  // 荒蕪之地之魂：戰吼：若你的牌堆在開始時沒有重複的卡，獲得一張永久的海市蜃樓
  WW_337: { abilities: play(cond(noDupes, [addCard('WW_337t')])), tokens: ['WW_337t'] },
  WW_337t: { flags: ['mirage'] },
  // 代理光環：你最左邊的手下 +2 攻擊力並具有生命竊取。持續 3 個回合
  WW_341: { objective: 3, abilities: [...play(fn('objective')), { on: { k: 'turnEnd', whose: 'mine' }, effects: [] }] },
  // 荒蕪之地盜匪：獲得八個有額外效果的 3/2 盜匪。放不下的改為召喚
  WW_345: { abilities: play(fn('blBandits')), tokens: BANDITS },
  ...Object.fromEntries(BANDITS.map((id, i) => [id, { keywords: [BONUS[i]] }])),
  // 執法：可交易。把一個手下的攻擊力與生命值設為 1。快槍：然後對它造成 1 點傷害
  WW_365: { keywords: ['TRADEABLE'], target: anyMinion, abilities: play({ e: 'setStats', target: { t: 'chosen' }, atk: 1, hp: 1 }, cond(quickdraw, [{ e: 'damage', target: { t: 'chosen' }, amount: 1, spell: true }])) },

  // ================================================================ 牧師
  // 暗影語：竊：把一個敵方手下移到「你的」手牌
  DEEP_021: { target: enemyMinion, abilities: play(fn('blStealToHand')) },
  // 輝光石旋蟲：生命竊取。快槍：造成 5 點傷害。鑄造：把快槍改為戰吼
  DEEP_024: { forge: 'DEEP_024t', keywords: ['LIFESTEAL'], target: { ...optional(anyChar), when: quickdraw }, abilities: play(cond(quickdraw, [{ e: 'damage', target: { t: 'chosen' }, amount: 5 }])) },
  DEEP_024t: { keywords: ['LIFESTEAL'], target: optional(anyChar), abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5 }) },
  // 碎裂的倒影：選擇一個手下。把一張複製加入你的手牌、牌堆與戰場
  DEEP_025: { target: anyMinion, abilities: play(fn('blShatteredReflections')) },
  // 大地墜飾：從你的牌堆發現一個手下。為你的英雄恢復等同其消耗的生命值
  DEEP_026: { abilities: play(fn('blPendant')) },
  // 光蟲群：召喚 10 隻有生命竊取的 1/1 光蟲。把多餘的存進一個 1 費的瓶子
  WW_052: { abilities: play(fn('blLightbugs')), tokens: ['WW_052t', 'WW_052t2'] },
  WW_052t: { keywords: ['LIFESTEAL'] },
  WW_052t2: { abilities: play(fn('blBottledLightbugs')) },
  // 電車搶劫：獲得你對手上個回合打出的每張卡的複製
  WW_053: { abilities: play(fn('blTramHeist')) },
  // 受傷的搬運工：戰吼：對此手下造成 4 點傷害。溢療：對所有敵方手下造成 2 點傷害
  WW_381: { abilities: [...play({ e: 'damage', target: { t: 'self' }, amount: 4 }), { on: { k: 'overheal' }, effects: [{ e: 'damage', target: { t: 'all', filter: enemyMinions }, amount: 2 }] }] },
  // 仁慈的銀行家：戰吼：從你的牌堆發現一張法術。快槍：改為敵方牌堆
  WW_384: { abilities: play(fn('blBanker')) },
  // 口渴的流浪者：嘲諷。本場對戰中你每打出一張 1 費卡，消耗減少 (1)
  WW_387: { keywords: ['TAUNT'], costRule: { per: 'oneCostPlayed', amount: 1 } },
  // 荒蕪之地救星伊莉絲：戰吼：若你的牌堆在開始時沒有重複的卡，召喚你牌堆中 4 個隨機手下的 5/5 複製
  WW_392: { abilities: play(cond(noDupes, [fn('blElise')])) },
  // 入侵的暗影葉：對一個敵方手下造成 10 點傷害。把多餘的存進一個 1 費的瓶子
  WW_393: { target: enemyMinion, abilities: play(fn('blShadeleaf')), tokens: ['WW_393t'] },
  WW_393t: { target: enemyMinion, abilities: play(fn('blBottledShadeleaf')) },
  // 強力的皮普：戰吼：複製你手牌中的每張 1 費卡
  WW_394: { abilities: play(fn('blPip')) },
  // 神聖泉水：為一個受傷的角色恢復 8 點生命值。把多餘的存進一個 1 費的瓶子
  WW_395: { target: { filter: { type: 'character', side: 'any', damaged: true } }, abilities: play(fn('blSpringwater')), tokens: ['WW_395t'] },
  WW_395t: { target: anyChar, abilities: play(fn('blBottledSpringwater')) },
  // 附身的團夥：召喚一個你對手手牌中隨機手下的 4/4 複製
  WW_600: { abilities: play(fn('blPossePossession')) },

  // ================================================================ 盜賊
  // 愚人金：獲得一個來自其他職業的隨機金色海盜與元素
  DEEP_022: { abilities: play({ e: 'addRandom', pool: { type: 'MINION', race: 'PIRATE', otherClass: true }, count: 1, who: 'self' }, { e: 'addRandom', pool: { type: 'MINION', race: 'ELEMENTAL', otherClass: true }, count: 1, who: 'self' }) },
  // 擲飛鏢：向隨機敵方手下擲出兩支 2 點傷害的飛鏢（若兩支都命中同一個手下，獲得一枚幸運幣！）
  WW_006: { abilities: play(fn('blDartThrow')) },
  // 賞金牛仔：快槍或連擊：獲得一枚幸運幣
  WW_363: { abilities: play(cond(quickdraw, [addCard('GAME_005')], [cond({ c: 'combo' }, [addCard('GAME_005')])])) },
  // 維拉洛克‧風刃：在你的手牌中時，打出一張另一個職業的卡來揭露維拉洛克的真面目！
  WW_364: { handAbilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itOtherClass' }, effects: [fn('blVelarok')] }], tokens: ['WW_364t'] },
  WW_364t: { keywords: ['CHARGE'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [discover({ otherClass: true }, [{ e: 'costMod', amount: -3, scope: 'it' }])] }] },
  // 搶劫：發現一張來自另一個職業的快槍卡
  WW_411: { abilities: play(fn('blStickUp')) },
  // 血岩公司的鏟子：亡語：挖掘一個寶藏
  WW_412: { abilities: dr(excavate), tokens: TREASURES },
  // 古董投擲者：戰吼：若你挖掘過兩次，消滅一個敵方手下
  WW_413: { target: { ...optional(enemyMinion), when: excavated2 }, abilities: play(cond(excavated2, [{ e: 'destroy', target: { t: 'chosen' } }])) },
  // 許願井：在你打出幸運幣後，獲得一個來自另一個職業的隨機傳說手下，消耗設為 (1)
  WW_415: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itNameIncludes', s: 'The Coin' }, effects: [fn('blWishingWell')] }] },
  // 殼中遊戲：獲得一張來自其他職業的隨機史詩、稀有與普通卡
  WW_416: { abilities: play(...(['EPIC', 'RARE', 'COMMON'] as const).map((rarity): Effect => ({ e: 'addRandom', pool: { rarity, otherClass: true }, count: 1, who: 'self' }))) },
  // 鑽頭小子：戰吼、快槍與亡語：挖掘一個寶藏
  WW_417: { abilities: [...play(excavate, cond(quickdraw, [excavate])), ...dr(excavate)], tokens: TREASURES },

  // ================================================================ 薩滿
  // 直挖到底：對一個手下造成 8 點傷害。挖掘一個寶藏
  DEEP_009: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 8, spell: true }, excavate), tokens: TREASURES },
  // 霍利戴醫生：戰吼：若你的牌堆在開始時沒有重複的卡，裝備九蛙之杖
  WW_010: { abilities: play(cond(noDupes, [{ e: 'equip', card: 'WW_010t' }])), tokens: ['WW_010t'] },
  WW_010t: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('blFrogStaff')] }], tokens: ['WW_010hexfrog'] },
  WW_010hexfrog: { keywords: ['TAUNT'] },
  // 斯卡爾：戰吼：對所有敵人造成 @ 點傷害（你每連續一個回合打出元素就提升）
  WW_026: { abilities: play({ e: 'damage', target: allEnemies, amount: { dyn: 'elementalStreak', base: 1 } }) },
  // 可靠的夥伴：使一個手下獲得 +2/+3。若它有種族，抽一張那個種族的牌
  WW_027: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 3 }, fn('blTrustyCompanion')) },
  // 脫水：生命竊取。對一個手下造成 4 點傷害。快槍：消耗為 (1)
  WW_325: { keywords: ['LIFESTEAL'], costIf: { cond: { c: 'quickdrawHand' }, cost: 1 }, target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 4, spell: true }) },
  // 礦車巡洋艦：突襲，超載：(2)。戰吼：若你上個回合打出過元素，不會超載
  WW_326: { keywords: ['RUSH'], overload: 2, abilities: play(cond({ c: 'playedElementalLastTurn' }, [fn('blUnoverload', { n: 2 })])) },
  // 仙人掌切割者：戰吼：抽一張法術。若你在本回合施放它，獲得 +1/+2 與嘲諷
  WW_327: { abilities: play(fn('blCactusCutter')) },

  // ================================================================ 術士
  // 混沌創造：造成 6 點傷害。召喚一個隨機的 6 費手下。摧毀你牌堆底部的 6 張牌
  DEEP_031: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 6, spell: true }, { e: 'summonRandom', pool: { type: 'MINION', cost: 6, anyClass: true }, count: 1, who: 'self' }, fn('blDestroyBottom', { n: 6 })) },
  // 靈魂凍結：凍結一個手下與其相鄰手下。對你的英雄造成等同被凍結數量的傷害
  DEEP_032: { target: anyMinion, abilities: play(fn('blSoulfreeze')) },
  // 處理助手：戰吼與亡語：把一桶汙泥放在你牌堆底部
  WW_041: { abilities: [...play(fn('blSludgeBottom')), ...dr(fn('blSludgeBottom'))], tokens: [SLUDGE] },
  // 廢棄物清除者：在你的回合結束時，摧毀你牌堆底部的 3 張牌
  WW_042: { abilities: endTurn(fn('blDestroyBottom', { n: 3 })) },
  // 輪上汙泥：突襲。每當此手下受到傷害，獲得一桶汙泥並放一桶到你牌堆底部
  WW_043: { keywords: ['RUSH'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [addCard(SLUDGE), fn('blSludgeBottom')] }], tokens: [SLUDGE] },
  // 腐爛的帕普加：你的邪能法術消耗減少 (2) 並具有生命竊取。戰吼：獲得兩桶汙泥
  WW_091: { flags: ['popgar'], costAuras: [{ side: 'friendly', type: 'SPELL', school: 'FEL', add: -2 }], abilities: play(addCard(SLUDGE, 2)), tokens: [SLUDGE] },
  // 水力壓裂：看你牌堆底部的 3 張牌。抽其中一張並摧毀其他的
  WW_092: { abilities: play(fn('blFracking')) },
  // 冒煙的煙囪：對一個手下造成 1 點傷害。若它死亡，挖掘一個寶藏
  WW_378: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 1, spell: true }, fn('blIfDiedExcavate')), tokens: TREASURES },
  // 電車難題：棄掉你消耗最低的法術。召喚兩輛有突襲的 3/3 電車。快槍：不用棄牌
  WW_436: { abilities: play(cond({ c: 'not', cond: quickdraw }, [fn('blDiscardLowestSpell')]), summon('WW_437t', 2)), tokens: ['WW_437t'] },
  WW_437t: { keywords: ['RUSH'] },
  // 電車車掌傑瑞：戰吼：若你挖掘過兩次，召喚六輛有突襲的 3/3 電車
  WW_437: { abilities: play(cond(excavated2, [summon('WW_437t', 6)])), tokens: ['WW_437t'] },
  // 熔爐燃料：在打出、棄掉或被摧毀時，抽 2 張牌
  WW_441: { abilities: [...play(draw(2)), { on: { k: 'discarded' }, effects: [draw(2)] }] },
  // 魔爪鑽頭手：嘲諷。亡語：挖掘一個寶藏
  WW_442: { keywords: ['TAUNT'], abilities: dr(excavate), tokens: TREASURES },

  // ================================================================ 戰士
  // 餘震：對所有手下造成 1 點傷害，三次。若你上個回合施放過法術，消耗減少 (2)
  DEEP_010: { costIf: { cond: { c: 'castSpellLastTurn' }, cost: 2 }, abilities: play({ e: 'repeat', times: 3, effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 1, spell: true }] }) },
  // 深坑礦工布萊恩：戰吼：若你的牌堆在開始時沒有重複的卡，本場對戰剩下的時間你的戰吼觸發兩次
  DEEP_020: { abilities: play(cond(noDupes, [fn('blBrann')])) },
  // 強化鍍層：獲得 6 點護甲。挖掘一個寶藏
  WW_334: { abilities: play({ e: 'armor', amount: 6 }, excavate), tokens: TREASURES },
  // 爆破陸龜：嘲諷。戰吼：對所有敵方手下造成等同此手下攻擊力的傷害
  WW_346: { keywords: ['TAUNT'], abilities: play({ e: 'damage', target: { t: 'all', filter: enemyMinions }, amount: { dyn: 'selfAttack' } }) },
  // 戰鬥十字鎬：在你打出一個嘲諷手下後，獲得 +1 耐久度
  WW_347: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION', keyword: 'TAUNT' }, effects: [{ e: 'weaponBuff', dur: 1 }] }] },
  // 走火：對隨機手下造成 3、2 與 1 點傷害。快槍：選擇目標
  WW_348: { abilities: play(fn('blMisfire')) },
  // 荒蕪之地鬥士：戰吼：開始一場鬥毆！若你挖掘過兩次，此手下一定會獲勝
  WW_349: { abilities: play(fn('blBrawler')) },
  // 不走運的火藥工：嘲諷。亡語：使你手牌與牌堆中的嘲諷手下獲得 +1/+1
  WW_367: { keywords: ['TAUNT'], abilities: dr(fn('blPowderman')) },
  // 爆破頭目索格倫：戰吼：把 3 個 TNT 洗入你對手的牌堆
  WW_372: { abilities: play({ e: 'shuffle', card: 'WW_372t', count: 3, who: 'opponent' }), tokens: ['WW_372t'] },
  WW_372t: { castsWhenDrawn: true, abilities: play(fn('blTnt')) },
  // 沉睡的斯拉格茂：突襲、嘲諷。休眠 6 個回合（挖掘可以提早 2 個回合甦醒！）
  WW_375: { keywords: ['RUSH', 'TAUNT'], abilities: play(fn('pdDormantSelf', { turns: 6 })), flags: ['slagmaw'] },
  // 爆破充能：消滅一個受傷的敵方手下。挖掘一個寶藏
  WW_380: { target: { filter: { type: 'minion', side: 'enemy', damaged: true } }, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, excavate), tokens: TREASURES },
};
