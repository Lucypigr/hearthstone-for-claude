// ============================================================================
// 巫妖王的進軍（March of the Lich King）：法力渴求、調配藥劑、不死族、殭屍獸……
// 解析器看不懂的卡在這裡手動定義；自訂效果（lk 開頭）在 game.ts 的 customLichKing。
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
/** 法力渴求 (n)：你有 n 個以上的法力水晶時 */
const thirst = (n: number): Condition => ({ c: 'maxMana', n });
const undead: Condition = { c: 'undeadDiedSinceLastTurn' };
const held = (n = 1): Condition => ({ c: 'heldCount', n });
const holdSpell: Ability[] = [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('wzHeldSpell')] }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq, when?: Condition): TargetReq => ({ ...t, optional: true, ...(when ? { when } : {}) });
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const allFriendly = { t: 'all' as const, filter: { type: 'character' as const, side: 'friendly' as const } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const enemyMinions = { type: 'minion' as const, side: 'enemy' as const };
const giveDr = (target: TargetReq | 'all', effects: Effect[]): Effect =>
  target === 'all'
    ? { e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, abilities: dr(...effects) }
    : { e: 'buff', target: { t: 'chosen' }, abilities: dr(...effects) };
/** 調配藥劑：基本藥劑與兩兩混合後的藥劑 */
const CONCOCTIONS = ['RLK_570t1', 'RLK_570t2', 'RLK_570t3', 'RLK_570t4', 'RLK_570t5'];
const MIXED = ['RLK_570t1t1', 'RLK_570t1t2', 'RLK_570t1t3', 'RLK_570t1t4', 'RLK_570t2t1', 'RLK_570t2t2', 'RLK_570t3t', 'RLK_570t4t1', 'RLK_570t4t2', 'RLK_570t4t3', 'RLK_570tt1', 'RLK_570tt2', 'RLK_570tt3', 'RLK_570tt4', 'RLK_570tt5'];
/** 藥劑的五種效果 */
const potion = {
  slime: fn('lkPotion', { kind: 'slime' }),
  destroy: fn('lkPotion', { kind: 'destroy' }),
  bolt: fn('lkPotion', { kind: 'bolt' }),
  hazy: fn('lkPotion', { kind: 'hazy' }),
  draw: draw(2),
};
const mix = (...effects: Effect[]): Override => ({ abilities: play(...effects) });
const base = (e: Effect): Override => ({ abilities: play(e, fn('lkMix')) });
const HORSEMEN = ['NX2_034', 'NX2_034t', 'NX2_034t1', 'NX2_034t2'];

export const LICHKING_OVERRIDES: Record<string, Override> = {
  // ================================================================ 中立
  // 失落的大主教：亡語：花費你所有的法力。召喚同等數量有突襲的 2/2 殭屍
  NX2_032: { abilities: dr(fn('lkExarch')), tokens: ['NX2_032t'] },
  NX2_032t: { keywords: ['RUSH'] },
  // 憎惡體泰迪斯：嘲諷。你消耗為奇數的卡牌消耗減少 (2)。（每回合切換極性！）
  NX2_033: { keywords: ['TAUNT'], flags: ['thaddius'] },
  // 騎乘者瑞文戴爾：亡語：把其他 3 位騎士洗入你的牌堆
  NX2_034: { abilities: dr(fn('lkRivendare')), tokens: ['NX2_034t', 'NX2_034t1', 'NX2_034t2'] },
  NX2_034t: { keywords: ['LIFESTEAL'], abilities: dr(fn('lkHorsemen')) },
  NX2_034t1: { keywords: ['RUSH'], abilities: dr(fn('lkHorsemen')) },
  NX2_034t2: { keywords: ['TAUNT'], abilities: dr(fn('lkHorsemen')) },
  // 錯誤：此手下具有所有種族
  NX2_050: {},
  // 墮落者之影：突襲。法力渴求 (6)：獲得復生
  NX2_051: { keywords: ['RUSH'], abilities: play(cond(thirst(6), [{ e: 'buff', target: { t: 'self' }, keywords: ['REBORN'] }])) },
  // 擲骨者：戰吼：若有友方不死族在你上個回合後死亡，造成 2 點傷害
  RLK_123: { target: optional(anyChar, undead), abilities: play(cond(undead, [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }])) },
  // 銀月秘法師：法術傷害 +2。戰吼：本回合你的法術無法指定英雄為目標
  RLK_218: { spellDamage: 2, abilities: play(fn('lkNoHeroTargets')) },
  // 日怒教士：戰吼：為所有友方角色恢復 3 點生命值。法力渴求 (6)：改為恢復 6 點
  RLK_219: { abilities: play(cond(thirst(6), [{ e: 'heal', target: allFriendly, amount: 6 }], [{ e: 'heal', target: allFriendly, amount: 3 }])) },
  // 水晶仲介：法力渴求 (5)：召喚一個隨機 3 費手下。法力渴求 (10)：改為召喚一個 8 費手下
  RLK_221: {
    abilities: play(
      cond(
        thirst(10),
        [{ e: 'summonRandom', pool: { type: 'MINION', cost: 8, anyClass: true }, count: 1, who: 'self' }],
        [cond(thirst(5), [{ e: 'summonRandom', pool: { type: 'MINION', cost: 3, anyClass: true }, count: 1, who: 'self' }])],
      ),
    ),
  },
  // 血誓者艾斯塔洛：戰吼：把守護者艾斯塔洛加入你的手牌。法力渴求 (5)：造成 2 點傷害
  RLK_222: { target: optional(anyChar, thirst(5)), abilities: play(addCard('RLK_222t1'), cond(thirst(5), [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }])), tokens: ['RLK_222t1', 'RLK_222t2'] },
  RLK_222t1: { abilities: play(addCard('RLK_222t2'), cond(thirst(8), [{ e: 'armor', amount: 5 }])) },
  RLK_222t2: { abilities: play(cond(thirst(10), [{ e: 'splitDamage', filter: { side: 'enemy' }, amount: 14 }], [{ e: 'splitDamage', filter: { side: 'enemy' }, amount: 7 }])) },
  // 銀月哨兵：嘲諷。法力渴求 (8)：獲得 +2/+2 與聖盾
  RLK_518: { keywords: ['TAUNT'], abilities: play(cond(thirst(8), [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2, keywords: ['DIVINE_SHIELD'] }])) },
  // 太陽之井：用隨機法術填滿你的手牌。你手牌中每有一張其他的牌，消耗減少 (1)
  RLK_590: { costRule: { per: 'otherCardsInHand', amount: 1 }, abilities: play(fn('lkSunwell')) },
  // 骨領主霜語：亡語：在本場對戰剩下的時間裡，你每回合的第一張牌消耗為 (0)。你會在 3 個回合後死亡
  RLK_591: { abilities: dr(fn('lkFrostwhisper')) },
  // 無敵：復生。戰吼與亡語：使另一個隨機友方不死族獲得 +5/+5 與嘲諷
  RLK_592: { keywords: ['REBORN'], abilities: [...play(fn('lkInvincible')), ...dr(fn('lkInvincible'))] },
  // 洛瑟瑪‧席倫：戰吼：使你牌堆中所有手下的屬性值加倍
  RLK_593: { abilities: play(fn('lkLorthemar')) },
  // 傳染性食屍鬼：亡語：賦予一個隨機友方手下「亡語：召喚一個傳染性食屍鬼」
  RLK_653: { abilities: dr(fn('lkInfectious')) },
  // 聖所法術扭曲者：每當你的對手以法術指定另一個手下為目標時，改為指定此手下
  RLK_677: { flags: ['spellbender'] },
  // 血肉巨獸：嘲諷。亡語：抽另一張不死族牌並召喚一個它的複製
  RLK_830: { keywords: ['TAUNT'], abilities: dr(fn('lkFleshBehemoth')) },
  // 散疫者：亡語：把你對手手牌中一個隨機手下變形成散疫者
  RLK_831: { abilities: dr(fn('lkPlaguespreader')) },
  // 邪惡之蛋：亡語：召喚一隻 3/3 不死雞
  RLK_833: { abilities: dr(summon('RLK_833t')), tokens: ['RLK_833t'] },
  RLK_833t: {},
  // 奈幽巴維齊爾：戰吼：發現一張法術。若有友方不死族在你上個回合後死亡，它的消耗減少 (2)
  RLK_834: { abilities: play(discover({ type: 'SPELL' }, [cond(undead, [{ e: 'costMod', amount: -2, scope: 'discovered' }])])) },
  // 維酷亡靈法師：戰吼：賦予一個友方手下「亡語：召喚一個有突襲的 2/2 殭屍」
  RLK_867: { target: optional(friendlyMinion), abilities: play(giveDr(friendlyMinion, [summon('RLK_018t')])) },
  // 天譴怒獸：復生。戰吼：死亡
  RLK_900: { keywords: ['REBORN'], abilities: play({ e: 'destroy', target: { t: 'self' } }) },
  // 傳送導師：戰吼：選擇一個敵方手下。把它與他們牌堆中的一個隨機手下交換
  RLK_950: { target: optional(enemyMinion), abilities: play(fn('lkTranslocate')) },
  // 驗屍官：戰吼：凍結一個敵方手下。法力渴求 (6)：先將它沉默
  RLK_951: { target: optional(enemyMinion), abilities: play(cond(thirst(6), [{ e: 'silence', target: { t: 'chosen' } }]), { e: 'freeze', target: { t: 'chosen' } }) },
  // 附魔師：在你的回合中，敵方手下受到雙倍傷害
  RLK_952: { flags: ['enchanter'] },
  // 銀月護甲師：突襲。法力渴求 (7)：獲得 +2/+2
  RLK_955: { keywords: ['RUSH'], abilities: play(cond(thirst(7), [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }])) },
  // 陸行鳥牧人：每當你打出一個手下，使它獲得 +1/+1 與「亡語：召喚一隻 1/1 陸行鳥」
  RLK_970: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 1, hp: 1, abilities: dr(summon('RLK_970t')) }] }], tokens: ['RLK_970t'] },
  RLK_970t: {},

  // ================================================================ 死亡騎士
  // 碎魂者：在你的英雄攻擊並消滅一個手下後，獲得 2 具屍體
  RLK_012: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('afterHeroKill', { corpses: 2 })] }] },
  // 吸血之血：使你的英雄 +5 生命值。花費 3 具屍體再獲得 5 點並抽一張牌
  RLK_051: { abilities: play({ e: 'heroMaxHealth', amount: 5 }, { e: 'spendCorpses', amount: 3, then: [{ e: 'heroMaxHealth', amount: 5 }, draw(1)] }) },
  // 壞死殯葬師：戰吼：若有友方不死族在你上個回合後死亡，發現一張邪惡符文牌
  RLK_116: { abilities: play(cond(undead, [discover({ rune: 'unholy' })])) },
  // 亞歷山德羅斯‧莫格萊尼：戰吼：在本場對戰剩下的時間裡，在你的回合結束時對你的對手造成 3 點傷害
  RLK_706: { abilities: play({ e: 'eternal', ability: { on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 3 }] } }) },
  // 竊魂者：戰吼：消滅所有其他手下。每消滅一個敵人獲得 1 具屍體
  RLK_741: { abilities: play(fn('soulstealer')) },
  // 霜鱗海妖：戰吼：若你在持有這張牌時施放過三張法術，凍結 3 個隨機敵方手下
  NX2_035: { handAbilities: holdSpell, abilities: play(cond(held(3), [{ e: 'freeze', target: { t: 'random', filter: enemyMinions, count: 3 } }])) },
  // 冰霜女王辛德拉苟莎：巨型 +2。在一個敵方手下被凍結後，消滅它
  NX2_037: { colossal: { limbs: ['NX2_037t', 'NX2_037t2'] }, tokens: ['NX2_037t', 'NX2_037t2'], flags: ['sindragosa'] },
  NX2_037t: { keywords: ['RUSH', 'FREEZE_ON_DAMAGE'] },
  NX2_037t2: { keywords: ['RUSH', 'FREEZE_ON_DAMAGE'] },

  // ================================================================ 惡魔獵人
  // 災禍之握：亡語：把一張隨機流放卡加入你的手牌
  NX2_025: { abilities: dr(fn('lkOutcastCards', { n: 1 })) },
  // 邪鱗喚魔者：戰吼：若你在持有這張牌時施放過三張法術，從你的牌堆召喚一個不同的惡魔
  NX2_026: { handAbilities: holdSpell, abilities: play(cond(held(3), [fn('lkEvoker')])) },
  // 蔑視印記：抽一張牌。若不是手下，對生命值最低的敵人造成 4 點傷害
  RLK_206: { abilities: play(fn('lkMarkOfScorn')) },
  // 兇猛的局外人：突襲。流放：你的下一張流放卡消耗減少 (1)
  RLK_207: { keywords: ['RUSH'], abilities: play(cond({ c: 'outcast' }, [fn('lkOutcastDiscount')])) },
  // 菲爾多雷戰團：造成 4 點傷害。若你的牌堆中沒有手下，召喚四個有突襲的 1/1 伊利達瑞
  RLK_208: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 4, spell: true }, cond({ c: 'deckNoMinions' }, [summon('BT_036t', 4)])) },
  // 釋放邪能：對所有敵人造成 1 點傷害。法力渴求 (6)：具有生命竊取
  RLK_209: { abilities: play(fn('lkUnleashFel')) },
  // 悲慘的流亡者：在你打出一張流放卡後，把一張隨機流放卡加入你的手牌
  RLK_210: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('lkExile')] }] },
  // 與惡魔交易：召喚兩隻有生命竊取的 3/3 惡魔。若你的牌堆中沒有手下，再召喚兩隻
  RLK_211: { abilities: play(summon('RLK_211t', 2), cond({ c: 'deckNoMinions' }, [summon('RLK_211t', 2)])), tokens: ['RLK_211t'] },
  RLK_211t: { keywords: ['LIFESTEAL'] },
  // 殘暴的滅絕者：嘲諷、突襲。在此手下承受傷害存活後，對敵方英雄造成等量傷害
  RLK_212: { keywords: ['TAUNT', 'RUSH'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [fn('lkAnnihilan')] }] },
  // 復仇的痛擊者：突襲。本場對戰中你每打出一張流放卡，消耗減少 (1)
  RLK_213: { keywords: ['RUSH'], costRule: { per: 'outcastPlayed', amount: 1 } },
  // 噬魂者之鐮：對戰開始時：吞噬你牌堆中 3 個不同的手下。留下能發現它們的靈魂
  RLK_214: { startOfGame: 'scythe', tokens: ['RLK_214t'] },
  RLK_214t: { abilities: play(fn('lkBoundSoul')) },
  // 被遺忘的菲勒林：戰吼：把一張隨機流放卡加入你手牌的最左邊與最右邊。它們消耗減少 (2)
  RLK_215: { abilities: play(fn('lkFelerin')) },

  // ================================================================ 德魯伊
  // 死亡甲蟲：嘲諷。法力渴求 (11)：獲得 +4/+4 與衝鋒
  NX2_010: { keywords: ['TAUNT'], abilities: play(cond(thirst(11), [{ e: 'buff', target: { t: 'self' }, atk: 4, hp: 4, keywords: ['CHARGE'] }])) },
  // 縈繞的殭屍：亡語：召喚一個有「亡語：召喚一個 1/1 殭屍」的 1/1 繳械殭屍
  RLK_650: { abilities: dr(summon('RLK_650t')), tokens: ['RLK_650t', 'RLK_650t2'] },
  RLK_650t: { abilities: dr(summon('RLK_650t2')) },
  RLK_650t2: {},
  // 無盡蟲群：復活所有消耗 (2) 以下的友方手下
  RLK_652: { abilities: play(fn('lkResurrect', { maxCost: 2, all: true })) },
  // 凋零：選擇一個手下。每個友方不死族從它身上偷取 1 點攻擊力與生命值
  RLK_655: { target: anyMinion, abilities: play(fn('lkWither')) },
  // 甲殼護板：獲得 4 點護甲。在你的下個回合開始時，再獲得 4 點
  RLK_656: { abilities: play({ e: 'armor', amount: 4 }, { e: 'delayed', turns: 1, effects: [{ e: 'armor', amount: 4 }] }) },
  // 長者納多克斯：戰吼：消滅一個友方不死族。你的手下獲得它的攻擊力
  RLK_658: { target: optional({ filter: { type: 'minion', side: 'friendly', race: 'UNDEAD' } }), abilities: play(fn('lkNadox')) },
  // 阿努比瑞克漢：戰吼：獲得 5 點護甲。本回合你的下 3 個手下消耗護甲而不是法力
  RLK_659: { abilities: play({ e: 'armor', amount: 5 }, fn('lkAnubRekhan')) },
  // 奈幽巴飛行者：戰吼：若有友方不死族在你上個回合後死亡，召喚一隻 2/2 奈幽巴人
  RLK_956: { abilities: play(cond(undead, [summon('RLK_956t')])), tokens: ['RLK_956t'] },
  RLK_956t: {},

  // ================================================================ 獵人
  // 殭屍蜂！！！：奧秘：在你的對手打出一個手下後，召喚四隻 1/1 殭屍蜂攻擊它
  NX2_013: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyPlaysMinion' }, effects: [fn('lkZombees', { card: 'NX2_013t' })] }], tokens: ['NX2_013t', 'NX2_013t2', 'NX2_013t3'] },
  NX2_013t: {},
  NX2_013t2: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyPlaysMinion' }, effects: [fn('lkZombees', { card: 'NX2_013t3' })] }] },
  NX2_013t3: {},
  // 忠實的同伴：從你的牌堆發現一隻野獸並召喚它。法力渴求 (10)：也召喚一個它的複製
  NX2_015: { abilities: play(fn('lkCompanions')) },
  // 魔法箭矢：對一個手下造成 2 點傷害。法力渴求 (6)：抽等量的牌
  RLK_804: { target: anyMinion, abilities: play(fn('lkArrow')) },
  // 秘法箭袋：從你的牌堆發現一張法術。若它是奧術法術，使它獲得法術傷害 +1
  RLK_817: { abilities: play(fn('lkQuiver')) },
  // 永歌傳送門：召喚 1 隻有突襲的 4/4 山貓（受法術傷害強化）
  RLK_819: { abilities: play(fn('lkPortal')), tokens: ['RLK_819t'] },
  RLK_819t: { keywords: ['RUSH'] },
  // 哈杜倫‧光翼：戰吼：使你手牌與牌堆中所有奧術法術獲得法術傷害 +1
  RLK_820: { abilities: play(fn('lkArcanePower', { deck: true })) },
  // 天譴馴獸師：戰吼：製作一隻專屬殭屍獸
  RLK_821: { abilities: play(fn('buildABeast')) },
  // 電擊吐唾者：戰吼：造成 1 點傷害（受你本場對戰的英雄攻擊次數強化！）
  RLK_825: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: { dyn: 'heroAttacksThisGame', base: 1 } }) },
  // 銀月遠行者：戰吼：使你手牌中所有奧術法術獲得法術傷害 +1
  RLK_826: { abilities: play(fn('lkArcanePower', { deck: false })) },
  // 銳眼觀察者：每當你的英雄攻擊一個手下，把它的生命值設為 1
  RLK_827: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero' }, effects: [fn('lkKeeneye')] }] },
  // 奎爾薩拉斯之望：在你的英雄攻擊後，使你的手下獲得 +1/+1（不論在哪裡）
  RLK_828: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('lkHope')] }] },

  // ================================================================ 法師
  // 撕裂現實：把 2 張隨機的過去法師法術加入你的手牌。它們消耗減少 (2)
  NX2_001: { abilities: play(fn('lkTearReality')) },
  // 旋風織者：戰吼：若你上個回合施放過法術，發現一個元素
  NX2_003: { abilities: play(cond({ c: 'castSpellLastTurn' }, [discover({ type: 'MINION', race: 'ELEMENTAL' })])), tokens: ['NX2_003t'] },
  NX2_003t: { abilities: play(fn('lkProdigy')) },
  // 瓦克賽勒斯：你的奧術法術施放兩次
  RLK_541: { flags: ['vexallus'] },
  // 博學者學徒：你的奧術法術消耗減少 (1)
  RLK_543: { costAuras: [{ side: 'friendly', type: 'SPELL', school: 'ARCANE', add: -1 }] },
  // 秘法守護者：召喚兩個有嘲諷與免疫法術的 5/6 魔像
  RLK_544: { abilities: play(summon('RLK_544t', 2)), tokens: ['RLK_544t'] },
  RLK_544t: { keywords: ['TAUNT', 'ELUSIVE'] },
  // 能量塑形師：戰吼：把你手牌中所有法術變形成消耗多 (3) 的法術（保留原本的消耗）
  RLK_545: { abilities: play(fn('lkEnergyShaper')) },
  // 浩瀚智慧：發現兩張消耗 (3) 以下的法術。交換它們的消耗
  RLK_546: { abilities: play(fn('lkVastWisdom')) },
  // 稜光元素：戰吼：發現一張任何職業的法術。它的消耗減少 (1)
  RLK_547: { abilities: play(discover({ type: 'SPELL', anyClass: true }, [{ e: 'costMod', amount: -1, scope: 'discovered' }])) },
  // 大博學者羅馬斯：戰吼：再次施放本場對戰中你施放過、不是來自你開局牌堆的每一張法術（每場對戰一次）
  RLK_803: { abilities: play(fn('lkRommath')) },
  // 秘法箭：造成 2 點傷害。法力渴求 (8)：改為造成 3 點傷害
  RLK_843: { target: anyChar, abilities: play(cond(thirst(8), [{ e: 'damage', target: { t: 'chosen' }, amount: 3, spell: true }], [{ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }])) },

  // ================================================================ 聖騎士
  // 亡者騎士：戰吼：對你的英雄造成 5 點傷害。法力渴求 (7)：改為為你的英雄恢復 5 點生命值
  NX2_021: { abilities: play(cond(thirst(7), [{ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 5 }], [{ e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 5 }])) },
  // 淨化者：嘲諷。戰吼：若你的牌堆中沒有中立卡，抽每種手下種族的手下各一個
  NX2_023: { keywords: ['TAUNT'], abilities: play(cond({ c: 'deckNoNeutral' }, [fn('lkPurator')])) },
  // 時光守衛：戰吼：直到你的下個回合結束，你召喚的龍獲得嘲諷與聖盾
  RLK_527: { abilities: play(fn('lkTimewarden')) },
  // 青銅龍軍團的飛行：發現一條龍。法力渴求 (7)：召喚一隻有嘲諷的 5/5 幼龍
  RLK_917: { abilities: play(discover({ type: 'MINION', race: 'DRAGON' }), cond(thirst(7), [summon('RLK_917t')])), tokens: ['RLK_917t'] },
  RLK_917t: { keywords: ['TAUNT'] },
  // 盛宴與饑荒：本回合使你的英雄 +3 攻擊力。法力渴求 (4)：並獲得生命竊取
  RLK_923: { abilities: play({ e: 'heroAttack', amount: 3 }, cond(thirst(4), [fn('heroLifesteal')])) },
  // 血之女王莉亞德琳：在你召喚一個攻擊力比此手下低的手下後，使它獲得聖盾與突襲
  RLK_924: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('lkLiadrin')] }] },
  // 血騎士十字軍：戰吼：本回合你的下一個聖騎士手下消耗生命值而不是法力
  RLK_927: { abilities: play(fn('lkBloodCrusader')) },

  // ================================================================ 牧師
  // 腐爛的死靈法師：戰吼：打撈。若它是不死族，對敵方英雄造成 5 點傷害
  NX2_018: { abilities: play(fn('skDredge', { then: 'undeadFace' })) },
  // 同類相食：消滅一個手下。為所有友方角色恢復等同其生命值的生命值
  NX2_020: { target: anyMinion, abilities: play(fn('lkCannibalize')) },
  // 亡者復生：復活一個消耗 (3) 以下的友方手下
  RLK_812: { abilities: play(fn('lkResurrect', { maxCost: 3, n: 1 })) },
  // 喚骨者：嘲諷。亡語：復活一個在本場對戰中死亡的友方不死族
  RLK_813: { keywords: ['TAUNT'], abilities: dr(fn('lkResurrect', { race: 'UNDEAD', n: 1 })) },
  // 暗影語：不死：對所有敵人造成 2 點傷害。若有友方不死族在你上個回合後死亡，再造成 2 點
  RLK_815: { abilities: play(cond(undead, [{ e: 'damage', target: allEnemies, amount: 4, spell: true }], [{ e: 'damage', target: allEnemies, amount: 2, spell: true }])) },
  // 瑟瓦娜修女：戰吼：永久地把一張黑暗視界加入你的手牌
  RLK_816: { abilities: play(addCard('RLK_816t3')), tokens: ['RLK_816t3'] },
  RLK_816t3: { abilities: play(fn('lkVision')) },
  // 縈繞夢魘：亡語：使你手牌中的一張牌被附身。當你打出它時，召喚一個 4/3 士兵
  RLK_822: { abilities: dr(fn('lkHaunt')), tokens: ['RLK_822t'] },
  RLK_822t: {},
  // 不死盟友：在本回合你打出一個不死族後，使它獲得復生
  RLK_823: { abilities: play(fn('lkUndyingAllies')) },
  // 掘墓：抽 2 張牌。若有友方不死族在你上個回合後死亡，消耗為 (1)
  RLK_829: { costIf: { cond: undead, cost: 1 }, abilities: play(draw(2)) },
  // 高階異教徒巴賽勒夫：戰吼：復活所有在你上個回合後死亡的友方不死族
  RLK_832: { abilities: play(fn('lkBasaleph')) },
  // 噬心者：亡語：把你對手牌堆中一張牌的複製加入你的手牌
  RLK_845: { abilities: dr(fn('lkMindEater')) },

  // ================================================================ 盜賊
  // 洗劫：對一個手下造成 1 點傷害。若你本回合打出過其他職業的卡，改為造成 4 點傷害
  NX2_004: { target: anyMinion, abilities: play(fn('lkRansack')) },
  // 縫合造物：連擊：獲得 +2/+2。注入 (2)：獲得 +3/+3。法力渴求 (8)：獲得 +4/+4
  NX2_005: {
    infuse: { n: 2, into: 'NX2_005t' },
    tokens: ['NX2_005t'],
    abilities: play(cond({ c: 'combo' }, [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }]), cond(thirst(8), [{ e: 'buff', target: { t: 'self' }, atk: 4, hp: 4 }])),
  },
  NX2_005t: { abilities: play(cond({ c: 'combo' }, [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }]), cond(thirst(8), [{ e: 'buff', target: { t: 'self' }, atk: 4, hp: 4 }])) },
  // 快樂羅傑：在你的英雄攻擊後，召喚一個 1/1 不死海盜
  NX2_006: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [summon('NX2_006t')] }], tokens: ['NX2_006t'] },
  NX2_006t: {},
  // 腐爛鼠：戰吼：使你牌堆中所有亡語卡消耗減少 (1)
  RLK_216: { abilities: play(fn('lkRottenRodent')) },
  // 天譴幻術師：亡語：把你牌堆中另一個亡語手下的 4/4 複製加入你的手牌。它消耗減少 (4)
  RLK_217: { abilities: dr(fn('lkIllusionist')) },
  // 劇毒滲透者：劇毒。戰吼：若有友方不死族在你上個回合後死亡，對一個手下造成 1 點傷害
  RLK_529: { keywords: ['POISONOUS'], target: optional(anyMinion, undead), abilities: play(cond(undead, [{ e: 'damage', target: { t: 'chosen' }, amount: 1 }])) },
  // 調藥師：戰吼：把一瓶隨機藥劑加入你的手牌
  RLK_568: { abilities: play(fn('lkRandomConcoction')), tokens: [...CONCOCTIONS, ...MIXED, 'RLK_570t'] },
  // 藥劑腰帶：發現 2 瓶藥劑
  RLK_569: { abilities: play(fn('lkPotionBelt')) },
  // 食屍鬼煉金師：戰吼：你的下一瓶藥劑消耗為 (0)
  RLK_570: { abilities: play({ e: 'pendingDiscount', d: { set: 0, nameEn: 'Concoction' } }) },
  // 邪惡藥劑師：在你的回合結束時，把一瓶隨機藥劑加入你的手牌
  RLK_571: { abilities: endTurn(fn('lkRandomConcoction')) },
  // 藥劑大師普崔希德：在一個手下死亡後，把一瓶藥劑加入你的手牌
  RLK_572: { abilities: [{ on: { k: 'minionDied', side: 'any' }, effects: [fn('lkRandomConcoction')] }] },
  RLK_570t: {},
  RLK_570t1: base(potion.slime),
  RLK_570t1t: {},
  RLK_570t2: base(potion.destroy),
  RLK_570t3: base(potion.bolt),
  RLK_570t4: base(potion.hazy),
  RLK_570t5: base(potion.draw),
  RLK_570t1t1: mix(potion.slime, potion.hazy),
  RLK_570t1t2: mix(potion.slime, potion.destroy),
  RLK_570t1t3: mix(potion.bolt, potion.slime),
  RLK_570t1t4: mix(potion.slime, potion.slime),
  RLK_570t2t1: mix(potion.bolt, potion.destroy),
  RLK_570t2t2: mix(potion.destroy, potion.destroy),
  RLK_570t3t: mix(potion.bolt, potion.bolt),
  RLK_570t4t1: mix(potion.hazy, potion.destroy),
  RLK_570t4t2: mix(potion.bolt, potion.hazy),
  RLK_570t4t3: mix(potion.hazy, potion.hazy),
  RLK_570tt1: mix(potion.draw, potion.slime),
  RLK_570tt2: mix(potion.bolt, potion.draw),
  RLK_570tt3: mix(potion.draw, potion.hazy),
  RLK_570tt4: mix(potion.draw, potion.destroy),
  RLK_570tt5: mix(draw(4)),

  // ================================================================ 薩滿
  // 熾熱轉化：選擇一個手下。發現一個消耗多 (1) 的手下並把它變形成那個手下
  NX2_008: { target: anyMinion, abilities: play(fn('lkTransmutation')) },
  // 腐鰓魚人：戰吼：賦予你的其他手下「亡語：使你的手下獲得 +1/+1」
  RLK_550: { abilities: play(giveDr('all', [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 1, hp: 1 }])) },
  // 不死勇士：戰吼：若有友方不死族在你上個回合後死亡，召喚兩個 3/2 殭屍
  RLK_552: { abilities: play(cond(undead, [summon('RLK_909t', 2)])) },
  // 預知：抽 2 張手下。每有一張消耗 (5) 以上，召喚一個有嘲諷的 2/3 靈魂
  RLK_553: { abilities: play(fn('lkPrescience')), tokens: ['RLK_553t'] },
  RLK_553t: { keywords: ['TAUNT'] },
  // 亡織光環：賦予一個手下「亡語：召喚兩個 3/2 殭屍」。超載：(1)
  RLK_909: { overload: 1, target: anyMinion, abilities: play(giveDr(anyMinion, [summon('RLK_909t', 2)])), tokens: ['RLK_909t'] },
  RLK_909t: {},
  // 暗影浸染：賦予你的手下「亡語：對一個隨機敵人造成 3 點傷害」
  RLK_910: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, abilities: dr({ e: 'damage', target: { t: 'random', filter: { side: 'enemy' }, count: 1 }, amount: 3 }) }) },
  // 從那邊來：為你手牌中的每個手下召喚一個複製。它們攻擊隨機敵方手下，然後死亡
  RLK_911: { abilities: play(fn('lkOtherSide')) },
  // 天譴食人妖：賦予此手下的亡語會觸發兩次
  RLK_912: { flags: ['scourgeTroll'] },
  // 霸主德拉庫魯：突襲、風怒。在此手下攻擊並消滅一個手下後，在你的一方復活它
  RLK_913: { keywords: ['RUSH', 'WINDFURY'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('lkAttackKill', { mode: 'drakuru' })] }] },

  // ================================================================ 術士
  // 諾芬的不可能任務：賦予所有友方惡魔與魚人「亡語：召喚一個 2/2 小鬼魚人」
  NX2_016: { abilities: play(fn('lkNofin')), tokens: ['NX2_016t'] },
  NX2_016t: {},
  // 瘟疫爆發：對所有手下造成 2 點傷害。若你在本場對戰中棄過牌，多造成 1 點
  NX2_017: { abilities: play(cond({ c: 'discardedAny' }, [{ e: 'damage', target: allMinions, amount: 3, spell: true }], [{ e: 'damage', target: allMinions, amount: 2, spell: true }])) },
  // 可疑的小販：戰吼：發現一張 1 費卡。若你的對手猜中了你的選擇，他們也獲得一張複製
  NX2_044: { abilities: play(fn('lkPeddler')) },
  // 步兵復活者：戰吼：復活一個友方不死族。使它獲得復生
  RLK_531: { abilities: play(fn('lkResurrect', { race: 'UNDEAD', n: 1, reborn: true })) },
  // 行屍：嘲諷。如果你棄掉這個手下，召喚它
  RLK_532: { keywords: ['TAUNT'], abilities: [{ on: { k: 'discarded' }, effects: [summon('RLK_532')] }] },
  // 天譴補給：抽 3 張牌。選擇其中一張棄掉
  RLK_533: { abilities: play(fn('lkSupplies')) },
  // 靈魂彈幕：當你打出或棄掉這張牌時，對所有敵人隨機分配 5 點傷害
  RLK_534: { abilities: [...play({ e: 'splitDamage', filter: { side: 'enemy' }, amount: 5, spell: true }), { on: { k: 'discarded' }, effects: [{ e: 'splitDamage', filter: { side: 'enemy' }, amount: 5, spell: true }] }] },
  // 野蠻的伊米亞海盜：突襲。戰吼：棄掉 2 張牌
  RLK_535: { keywords: ['RUSH'], abilities: play({ e: 'discard', count: 2 }) },
  // 淺墳：觸發一個友方手下的亡語，然後消滅它
  RLK_536: { target: friendlyMinion, abilities: play(fn('lkShallowGrave')) },
  // 扭曲之繩：消滅一個手下。把它的屬性值給你手牌中一個隨機不死族
  RLK_537: { target: anyMinion, abilities: play(fn('lkTether')) },
  // 吞魂者：在一個友方手下死亡後，獲得它的亡語
  RLK_538: { abilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('lkDevourer')] }] },
  // 無定形軟泥怪：戰吼：棄掉一個隨機不死族。亡語：召喚一個它的複製
  RLK_540: { abilities: [...play(fn('lkSlimeDiscard')), ...dr(fn('lkSlimeSummon'))] },

  // ================================================================ 戰士
  // 塑肉者：嘲諷。戰吼：若你有 5 點以上的護甲，召喚一個此手下的複製
  NX2_027: { keywords: ['TAUNT'], abilities: play(cond({ c: 'armor', n: 5 }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },
  // 訓練課程：發現一個嘲諷手下。若你在本回合打出它，重複此效果
  NX2_029: { abilities: play(discover({ type: 'MINION', keyword: 'TAUNT' }, [fn('followGive', { id: 'training', target: 'it' })])) },
  // 太陽之火鍛造：裝備一把 4/2 的劍。使你手牌中一個隨機手下獲得 +4/+2
  RLK_600: { abilities: play({ e: 'equip', card: 'RLK_600t' }, { e: 'handBuff', atk: 4, hp: 2, scope: 'random' }), tokens: ['RLK_600t'] },
  RLK_600t: {},
  // 背水一戰：抽一張嘲諷手下。法力渴求 (7)：使它的屬性值加倍
  RLK_601: { abilities: play(fn('lkLastStand')) },
  // 索瑞貝洛爾：突襲。亡語：進入休眠。施放一張火焰法術來復活索瑞貝洛爾！
  RLK_604: { keywords: ['RUSH'], abilities: dr(fn('lkEgg', { egg: 'RLK_604t' })), tokens: ['RLK_604a', 'RLK_604b', 'RLK_604t', 'RLK_604t2'] },
  RLK_604a: { keywords: ['RUSH'], abilities: dr(fn('lkEgg', { egg: 'RLK_604t2' })) },
  RLK_604b: { keywords: ['RUSH'] },
  RLK_604t: { keywords: ['DORMANT'], flags: ['phoenixEgg'] },
  RLK_604t2: { keywords: ['DORMANT'], flags: ['phoenixEgg'] },
  // 熾熱之力：使一個手下獲得 +1/+1。每有一個受傷的友方角色，就重複一次
  RLK_605: { target: anyMinion, abilities: play(fn('lkBlazingPower')) },
  // 破法擾亂者：在你的回合結束時，你的對手棄掉一張法術
  RLK_607: { abilities: endTurn(fn('lkSpellbreaker')) },
  // 大盾阿斯維敦：嘲諷。戰吼：施放你對手最後打出的法術的複製
  RLK_608: { keywords: ['TAUNT'], abilities: play(fn('lkAsvedon')) },
  // 日怒勇士：在你施放一張火焰法術後，對所有手下造成 1 點傷害
  RLK_609: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FIRE' }, effects: [{ e: 'damage', target: allMinions, amount: 1 }] }] },
  // 力量餘燼：召喚兩個有嘲諷的 1/2 守衛。法力渴求 (6)：使它們獲得 +1/+2
  RLK_960: { abilities: play(fn('lkEmbers')), tokens: ['RLK_960t'] },
  RLK_960t: { keywords: ['TAUNT'] },
};

export const LK_CONCOCTIONS = CONCOCTIONS;
export const LK_HORSEMEN = HORSEMEN;
/** 兩瓶基本藥劑混合後的藥劑（以排序後的編號 1~5 組合為 key） */
export const LK_MIXES: Record<string, string> = {
  '1-4': 'RLK_570t1t1',
  '1-2': 'RLK_570t1t2',
  '1-3': 'RLK_570t1t3',
  '1-1': 'RLK_570t1t4',
  '2-3': 'RLK_570t2t1',
  '2-2': 'RLK_570t2t2',
  '3-3': 'RLK_570t3t',
  '2-4': 'RLK_570t4t1',
  '3-4': 'RLK_570t4t2',
  '4-4': 'RLK_570t4t3',
  '1-5': 'RLK_570tt1',
  '3-5': 'RLK_570tt2',
  '4-5': 'RLK_570tt3',
  '2-5': 'RLK_570tt4',
  '5-5': 'RLK_570tt5',
};
