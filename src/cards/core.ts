// ============================================================================
// 核心系列（CORE_ 開頭，以及核心收錄的舊卡）：手動定義的卡牌效果。
// 每張卡同時登記核心版本（CORE_xxx）與原系列版本（xxx）。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, SecretEvent, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const whenSummoned = (...effects: Effect[]): Ability[] => [{ on: { k: 'summoned' }, effects }];
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const secretOn = (ev: SecretEvent, ...effects: Effect[]): Override => ({ secret: true, abilities: [{ on: { k: 'secret', ev }, effects }] });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const addCard = (card: string, count = 1): Effect => ({ e: 'addCard', card, count, who: 'self' });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allFriendly = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const theirHero = { t: 'hero' as const, side: 'enemy' as const };
const heroHit = (effects: Effect[], extra?: Partial<Ability>): Ability[] => [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects, ...extra }];
const nextSpell = (amount: number): Effect => ({ e: 'pendingDiscount', d: { amount, type: 'SPELL', thisTurn: true } });
const gift = (...names: string[]): Override => ({ abilities: play(fn('coGiftDiscover', { names })) });

export const CORE_OVERRIDES: Record<string, Override> = {};
/** 同時登記核心版本與原系列版本 */
const reg = (id: string, ov: Override) => {
  CORE_OVERRIDES[id] = ov;
  if (!id.startsWith('CORE_')) CORE_OVERRIDES[`CORE_${id}`] = ov;
};

// ============================================================== 冰封王座以前的核心卡牌
// 冰川：發現一個 8 費手下，召喚並凍結它
reg('AV_107', { abilities: play(fn('coDiscoverSummon', { pool: { type: 'MINION', cost: 8, anyClass: true }, freeze: true })) });
// 冰凍陷阱（獵人奧秘）：當對手施放法術，改為把它移回對手手牌，消耗增加 (1)
reg('AV_226', secretOn('enemyCastsSpell', fn('coIceTrap')));
// 靈魂嚮導：嘲諷。亡語：抽一張神聖法術與一張暗影法術
reg('AV_328', {
  keywords: ['TAUNT'],
  abilities: dr({ e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL', spellSchool: 'HOLY' } }, { e: 'draw', count: 1, who: 'self', pool: { type: 'SPELL', spellSchool: 'SHADOW' } }),
});
// 安瑟祭司：嘲諷。戰吼：若你這個回合恢復過生命值，獲得 +3/+3
reg('BAR_313', { keywords: ['TAUNT'], abilities: play(cond({ c: 'healedThisTurn' }, [{ e: 'buff', target: { t: 'self' }, atk: 3, hp: 3 }])) });
// 巴拉克‧科多班：戰吼：抽 1 費、2 費與 3 費的法術各一張
reg('BAR_551', { abilities: play(fn('coDrawCosts', { type: 'SPELL', costs: [1, 2, 3] })) });
// 重傷獵物：造成 $1 點傷害。召喚一隻有突襲的 1/1 鬣狗
reg('BAR_801', { target: anyChar, abilities: play(hit(1), summon('CORE_T_HYENA')) });
// 資深軍醫：在你施放神聖法術後，召喚一個有生命竊取的 2/2 軍醫
reg('BAR_878', { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'HOLY' }, effects: [summon('CORE_T_MEDIC')] }] });
// 光芒垂釣竿：在你的英雄攻擊後，將一個隨機魚人加入你的手牌
reg('BT_018', { abilities: heroHit([{ e: 'addRandom', pool: { type: 'MINION', race: 'MURLOC', anyClass: true }, count: 1, who: 'self' }]) });
// 協同打擊：召喚三個有突襲的 1/1 伊利達瑞
reg('BT_036', { abilities: play(summon('BT_036t', 3)), tokens: ['BT_036t'] });
// 沼澤蟲：戰吼：若你上回合施放過法術，發現一張法術牌
reg('BT_115', { abilities: play(cond({ c: 'castSpellLastTurn' }, [{ e: 'discover', pool: { type: 'SPELL' } }])) });
// 刀鋒風暴：對所有手下造成 $1 點傷害，重複直到有一個手下死亡
reg('BT_117', { abilities: play(fn('coBladestorm')) });
// 戰槌挑戰者：戰吼：選擇一個敵方手下，與它決一死戰
reg('BT_120', { target: optional(enemyMinion), abilities: play(fn('coBattleToDeath')) });
// 沼澤光束：對一個手下造成 $3 點傷害。若你至少有 7 顆法力水晶，消耗為 (0)
reg('BT_134', { target: anyMinion, costIf: { cond: { c: 'maxMana', n: 7 }, cost: 0 }, abilities: play(hit(3)) });
// 被囚禁的邪犬：休眠 2 回合。突襲
reg('BT_156', { keywords: ['RUSH'], abilities: whenSummoned(fn('twDormantSelf', { turns: 2 })) });
// 凱恩日怒：衝鋒。你的所有攻擊都無視嘲諷
reg('BT_187', { keywords: ['CHARGE'], flags: ['ignoreTaunt'] });
// 寶石匠哈納：在你打出奧秘後，發現一個其他職業的奧秘
reg('BT_188', { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itSecret' }, effects: [{ e: 'discover', pool: { isSecret: true, otherClass: true } }] }] });
// 強化箭豬：亡語：造成等同此手下攻擊力的傷害，隨機分配給所有敵人
reg('BT_201', { abilities: dr(fn('coPorcupine')) });
// 盲眼觀察者：戰吼：查看牌堆中 3 張牌，選擇一張放到牌堆頂
reg('BT_323', { abilities: play(fn('coTopDeck')) });
// 莉亞德琳女士：戰吼：將本場對戰中你對友方施放過的每個法術的複製加入你的手牌
reg('BT_334', { abilities: play(fn('coLiadrin')) });
// 惡魔變身：將你的英雄能力換成「造成 5 點傷害」，使用 2 次後換回來
reg('BT_429', { abilities: play(fn('coMetamorphosis')), tokens: [] });
// 埃辛諾斯戰刃：在你的英雄攻擊手下後，可以再攻擊一次
reg('BT_430', { abilities: heroHit([fn('coHeroAttackAgain')], { cond: { c: 'attackedMinion' } }) });
// 靈視：抽一張牌。流放：再抽一張
reg('BT_491', { abilities: play(draw(), cond({ c: 'outcast' }, [draw()])) });
// 獻祭光環：對所有手下造成 $1 點傷害兩次
reg('BT_514', { abilities: play({ e: 'repeat', times: 2, effects: [{ e: 'damage', target: allMinions, amount: 1, spell: true }] }) });
// 阿茲諾斯之盾：在你的英雄要受到傷害時，這把武器改為失去 1 點耐久度
reg('BT_781', { flags: ['weaponAbsorbs'] });
// 提克迪奧斯：你的英雄免疫。戰吼：本回合你的下一個惡魔消耗為 (0)
reg('CATA_001', { flags: ['heroImmune'], abilities: play({ e: 'pendingDiscount', d: { set: 0, type: 'MINION', race: 'DEMON', thisTurn: true } }) });
// 卡莉亞‧米奈希爾：戰吼：復活本場對戰中死亡、消耗最高的友方手下
reg('CATA_002', { abilities: play(fn('coResurrectBest')) });
// 雷加爾‧大地之怒：在此手下或相鄰手下攻擊後，獲得一張閃電箭
reg('CATA_004', { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, cond: { c: 'itSelfOrAdjacent' }, effects: [addCard('CORE_EX1_238')] }], tokens: ['CORE_EX1_238'] });
// 烏爾法：戰吼：使你的其他手下獲得「亡語：召喚一個與此手下消耗相同的手下」
reg('CATA_006', { abilities: play(fn('coUlfar')) });
// 先知遠見：抽一張牌，它的消耗減少 (3)
reg('CS2_053', { abilities: play(fn('coDrawCostMod', { amount: 3 })) });
// 南海甲板工：你裝備武器時具有衝鋒
reg('CS2_146', { kwIf: { cond: { c: 'weapon' }, keywords: ['CHARGE'] } });
// 受傷的劍士：戰吼：對自己造成 4 點傷害
reg('CS2_181', { abilities: play({ e: 'damage', target: { t: 'self' }, amount: 4 }) });
// 末日儀式：消滅一個友方手下。若你有 5 個以上手下，召喚一個 5/5 惡魔
reg('CS3_002', { target: friendlyMinion, abilities: play(fn('coRitualOfDoom')), tokens: ['CS3_002t'] });
// 魔魂獄卒：戰吼：你的對手棄掉一張手下牌。亡語：將它還給對手
reg('CS3_003', { abilities: [...play(fn('coFelsoul')), ...dr(fn('coFelsoulReturn'))] });
// 凡妮莎‧范克里夫：連擊：將對手上一張打出的牌的複製加入你的手牌
reg('CS3_005', { abilities: play(cond({ c: 'combo' }, [fn('coCopyLastOpp')])) });
// 血帆甲板工：戰吼：你的下一把武器消耗減少 (1)
reg('CS3_008', { abilities: play({ e: 'pendingDiscount', d: { amount: 1, type: 'WEAPON' } }) });
// 戰爭儲藏：將一張隨機戰士手下、法術與武器牌加入你的手牌
reg('CS3_009', {
  abilities: play(
    ...(['MINION', 'SPELL', 'WEAPON'] as const).map((type): Effect => ({ e: 'addRandom', pool: { type, cls: 'WARRIOR' }, count: 1, who: 'self' })),
  ),
});
// 諾達希爾德魯伊：戰吼：本回合你施放的下一個法術消耗減少 (3)
reg('CS3_012', { abilities: play(nextSpell(3)) });
// 赤紅牧師：過量治療：抽一張牌
reg('CS3_014', { abilities: [{ on: { k: 'overheal' }, effects: [draw()] }] });
// 清算：奧秘：在一個敵方手下造成 3 點以上的傷害後，消滅它
reg('CS3_016', secretOn('enemyBigHit', { e: 'destroy', target: { t: 'it' } }));
// 寇瓦斯‧血棘：衝鋒，生命竊取。在你打出流放牌後，將此手下移回你的手牌
reg('CS3_019', { keywords: ['CHARGE', 'LIFESTEAL'], abilities: dr(fn('coKorvasWait')) });
// 正義追尋：本場對戰中，你召喚的白銀之手新兵獲得 +1 攻擊力
reg('CS3_029', { abilities: play(fn('recruitBuff', { atk: 1, hp: 0 })) });
// 幫派竊賊：戰吼：發現一個其他職業的法術
reg('DAL_416', { abilities: play({ e: 'discover', pool: { type: 'SPELL', otherClass: true } }) });
// 『大反派』拉法姆：嘲諷。戰吼：將你的手牌與牌堆換成傳說手下
reg('DAL_422', { keywords: ['TAUNT'], abilities: play(fn('coRafaamReplace')) });
// 卡德加：你召喚手下的卡牌會召喚兩倍數量的手下
reg('DAL_575', { flags: ['khadgar'] });
// 卡雷苟斯：你每回合的第一張法術消耗為 (0)。戰吼：發現一張法術牌
reg('DAL_609', { auras: [{ scope: 'firstSpellDiscount', cost: 99 }], abilities: play({ e: 'discover', pool: { type: 'SPELL' } }) });
// 死亡女神卡特莉娜：在你的回合結束時，復活另一個友方死靈
reg('DAL_721', { abilities: atEndOfTurn(fn('coResurrectRandom', { race: 'UNDEAD' })) });
// 拉祖爾女士：戰吼：發現你對手手牌中一張牌的複製
reg('DAL_729', { abilities: play(fn('twDiscoverOppHand')) });
// 狗餅乾：可交易。使一個手下 +2/+3
reg('DED_009', { keywords: ['TRADEABLE'], target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 3 }) });
// 月蝕：對一個手下造成 $3 點傷害。本回合你的下一個法術消耗減少 (2)
reg('DMF_057', { target: anyMinion, abilities: play(hit(3), nextSpell(2)) });
// 日蝕：本回合你施放的下一個法術會施放兩次
reg('DMF_058', { abilities: play({ e: 'custom', fn: 'doubleSpell' }) });
// 可拋棄的表演者：召喚七個有突襲的 1/1 伊利達瑞。如果它們都在本回合死亡，再召喚七個
reg('DMF_224', { abilities: play(fn('coPerformers')), tokens: ['BT_036t'] });
// 難以置信的柴：戰吼：複製你手牌中最左邊與最右邊的牌
reg('DMF_231', { abilities: play(fn('coZai')) });
// 救贖者洛瑟克森：戰吼：本場對戰中，你召喚的白銀之手新兵獲得聖盾
reg('DMF_240', { abilities: play(fn('coRecruitShield')) });
// 狐假虎威：戰吼：本回合你的下一張連擊牌消耗減少 (2)
reg('DMF_511', { abilities: play({ e: 'pendingDiscount', d: { amount: 2, combo: true, thisTurn: true } }) });
// 吞劍者：嘲諷。戰吼：裝備一把 3/2 的劍
reg('DMF_521', { keywords: ['TAUNT'], abilities: play({ e: 'equip', card: 'DMF_521t' }), tokens: ['DMF_521t'] });
// 偉大圖騰伊索爾：在你的回合結束時，使你手牌、牌堆與戰場上其他圖騰 +1/+1
reg('DMF_709', { abilities: atEndOfTurn(fn('coTotemBuff')) });
// 琪瑞‧月光之選：戰吼：將一張日蝕與一張月蝕加入你的手牌
reg('DMF_733', { abilities: play(addCard('CORE_DMF_058'), addCard('CORE_DMF_057')), tokens: ['CORE_DMF_058', 'CORE_DMF_057'] });
// 灰枝：嘲諷。亡語：使一個隨機友方手下獲得「亡語：召喚灰枝」
reg('DMF_734', { keywords: ['TAUNT'], abilities: dr(fn('coGreybough')) });
// 瘋狂死亡之翼：戰吼：攻擊所有其他手下
reg('DRG_026', { abilities: play(fn('coAttackAllOthers')) });
// 弗力克‧天刃：戰吼：消滅一個手下以及它的所有複製（無論在哪裡）
reg('DRG_037', { target: anyMinion, abilities: play(fn('coFlik')) });
// 無盡的莫祖戎：戰吼：打出你的對手上個回合打出的所有牌
reg('DRG_090', { abilities: play(fn('coMurozond')) });
// 紫羅蘭魔翼蟲：亡語：將一張『秘法飛彈』加入你的手牌
reg('DRG_107', { abilities: dr(addCard('EX1_277')), tokens: ['EX1_277'] });
// 噴燈破壞者：戰吼：你的對手的下一個英雄能力消耗增加 (2)
reg('DRG_403', { abilities: play({ e: 'heroPowerTax', amount: 2 }) });
// 追蹤術：發現你牌堆中的一張牌
reg('DS1_184', { abilities: play(fn('coDiscoverDeck')) });
// 迅猛龍先驅：倒轉。戰吼：發現一隻帶有黑暗禮物的野獸。同族：它的消耗減少 (1)
reg('EDR_004_2026', {
  rewind: 1,
  tokens: ['TIME_000ta', 'TIME_000tb'],
  abilities: play(fn('discoverGift', { pool: { type: 'MINION', race: 'BEAST', anyClass: true }, kindred: true })),
});
// 兜售商：在你的回合結束時，將一張隨機法術牌放到你對手的牌堆頂
reg('ETC_111', { abilities: atEndOfTurn(fn('coMerch')) });
// 穆克拉王：戰吼：給你的對手 2 根香蕉
reg('EX1_014', { abilities: play({ e: 'addCard', card: 'EX1_014t', count: 2, who: 'opponent' }), tokens: ['EX1_014t'] });
// 戰歌指揮官：每當你召喚一個攻擊力 3 以下的手下，使其獲得衝鋒
reg('EX1_084', { abilities: [{ on: { k: 'summon', side: 'friendly' }, cond: { c: 'itAttackAtMost', n: 3 }, effects: [{ e: 'buff', target: { t: 'it' }, keywords: ['CHARGE'] }] }] });
// 博學者卓：每當一個玩家施放法術，將一張複製加入另一個玩家的手牌
reg('EX1_100', { abilities: [{ on: { k: 'spellCast', side: 'any' }, effects: [fn('coCho')] }] });
// 伺機待發：本回合你施放的下一個法術消耗減少 (2)
reg('EX1_145', { abilities: play(nextSpell(2)) });
// 森林之魂：使你的手下獲得「亡語：召喚一個 2/2 的樹人」
reg('EX1_158', { abilities: play({ e: 'buff', target: allFriendly, abilities: dr(summon('EX1_158t')) }), tokens: ['EX1_158t'] });
// 戰爭古樹：二選一 - +5 攻擊力；或 +5 生命值並獲得嘲諷
reg('EX1_178', {
  chooseOne: [
    { id: 'EX1_178b', name: '拔根', text: '+5攻擊力', abilities: play({ e: 'buff', target: { t: 'self' }, atk: 5 }) },
    { id: 'EX1_178a', name: '植根', text: '+5生命值及<b>嘲諷</b>', abilities: play({ e: 'buff', target: { t: 'self' }, hp: 5, keywords: ['TAUNT'] }) },
  ],
});
// 軍情七處滲透者：戰吼：摧毀一個隨機敵方奧秘
reg('EX1_186', { abilities: play(fn('coDestroyRandomSecret')) });
// 大檢察官懷特邁恩：戰吼：召喚本回合死亡的所有友方手下
reg('EX1_190', { abilities: play(fn('kelThuzad')) });
// 心靈召喚師：戰吼：複製你對手牌堆中的一張牌，加入你的手牌
reg('EX1_193', { abilities: play(fn('copyFromOppDeck', { count: 1 })) });

// 娜塔莉‧塞林：戰吼：消滅一個手下，並獲得它的生命值
reg('EX1_198', { target: optional(anyMinion), abilities: play(fn('coNatalie')) });
// 無羈元素：在你打出有超載的牌後，獲得 +1/+1
reg('EX1_258', { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itHasOverload' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 1 }] }] });
// 空無恐懼魔：戰吼：消滅兩側的手下，並獲得它們的攻擊力與生命值
reg('EX1_304', { abilities: play(fn('coVoidTerror')) });
// 扭曲虛空：消滅所有手下與地點
reg('EX1_312', { abilities: play(fn('coNether')) });
// 力量的代價：使一個友方手下 +4/+4，直到回合結束。然後它死亡
reg('EX1_316', { target: friendlyMinion, abilities: play(fn('coPowerOverwhelming')) });
// 光鑄學徒：此手下的攻擊力永遠等同於它的生命值
reg('EX1_335', { flags: ['atkEqualsHealth'] });
// 大混戰：消滅所有手下，只留下一個（隨機）
reg('EX1_407', { abilities: play(fn('coBrawl')) });
// 戈爾豪：攻擊手下時失去 1 點攻擊力，而不是失去 1 點耐久度
reg('EX1_411', { flags: ['gorehowl'] });
// 大法師安東尼達斯：每當你施放法術，將一張『火球術』加入你的手牌
reg('EX1_559', { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [addCard('CORE_CS2_029')] }], tokens: ['CORE_CS2_029'] });
// 無面操縱者：戰吼：選擇一個手下，變成它的複製
reg('EX1_564', { target: optional(anyMinion), abilities: play(fn('coFaceless')) });
// 冰凍陷阱：奧秘：當一個敵方手下攻擊時，將它移回其擁有者的手牌，消耗增加 (2)
reg('EX1_611', secretOn('enemyMinionAttacks', { e: 'returnToHand', target: { t: 'it' }, costChange: 2 }));
// 暗影形態：你的英雄能力變成『造成 2 點傷害』
reg('EX1_625', { abilities: play(fn('coShadowform')) });
// 哈斯‧石啤：戰吼：將你的手牌換成爐石的經典傳說
reg('GIFT_01', { abilities: play(fn('coHarth')) });
reg('GIFT_02', gift('Frostbolt', 'Arcane Intellect', 'Fireball'));
reg('GIFT_03', gift('Quick Shot', 'Deadly Shot', 'Explosive Shot'));
reg('GIFT_05', gift('Equality', 'Consecration', 'Blessing of Kings'));
reg('GIFT_06', gift('Lightning Storm', 'Hex', 'Bloodlust'));
reg('GIFT_07', gift('Execute', 'Shield Block', 'Brawl'));
reg('GIFT_08', gift('Fel Barrage', 'Chaos Strike', 'Chaos Nova'));
reg('GIFT_09', gift('Backstab', 'Deadly Poison', 'Fan of Knives'));
reg('GIFT_10', gift('Feral Rage', 'Wild Growth', 'Swipe'));
reg('GIFT_11', gift('Mortal Coil', 'Siphon Soul', 'Twisting Nether'));
reg('GIFT_12', gift('Power Word: Shield', 'Shadow Word: Pain', 'Mind Control'));
// 小鬼偽裝者：戰吼：選擇一個友方小鬼，變成它的複製
reg('MAW_000', { target: optional({ filter: { type: 'minion', side: 'friendly', nameIncludes: 'Imp' } }), abilities: play(fn('coFaceless')) });
// 縱火指控：選擇一個手下。在你的英雄受到傷害後消滅它
reg('MAW_001', { target: anyMinion, abilities: play(fn('coAccuse', { kind: 'arson' })) });
// 屍體保釋：發現一個友方手下並復活它，使其獲得突襲。它在回合結束時死亡
reg('MAW_002', { abilities: play(fn('coHabeas')) });
// 圖騰的證據：選擇一個基本圖騰並召喚它
reg('MAW_003', { abilities: play(fn('coTotemChoose')) });
reg('MAW_003t', { abilities: play(fn('coSummonAllTotems')) });
// 靈魂追尋者：戰吼：與你對手牌堆中的一個隨機手下交換
reg('MAW_004', { abilities: play(fn('coSoulSeeker')) });
// 陷害者：戰吼：將 3 張『被陷害』洗入你對手的牌堆，抽到時超載 (2)
reg('MAW_005', { abilities: play({ e: 'shuffle', card: 'MAW_005t', count: 3, who: 'opponent' }), tokens: ['MAW_005t'] });
reg('MAW_005t', { castsWhenDrawn: true, abilities: play(fn('addOverload', { amount: 2 })) });
// 盲眼法官：戰吼：雙方玩家抽牌，直到有 5 張手牌
reg('MAW_008', { abilities: play(fn('drawUntil', { n: 5 })) });
// 禁止通行：奧秘：在你的對手在一個回合打出三張牌後，對敵方英雄造成 $6 點傷害
reg('MAW_010', secretOn('enemyThirdCard', { e: 'damage', target: theirHero, amount: 6, spell: true }));
// 辯護律師納薩諾斯：戰吼：發現一個本場對戰中死亡的友方亡語手下，獲得並觸發它的亡語
reg('MAW_011', { abilities: play(fn('coNathanos')) });
// 魔化釋放：召喚一個本場對戰中死亡的友方惡魔
reg('MAW_012', { abilities: play(fn('coSummonDead', { race: 'DEMON', count: 1 })), infuse: { n: 3, into: 'MAW_012t', race: 'DEMON' }, tokens: ['MAW_012t'] });
reg('MAW_012t', { abilities: play(fn('coSummonDead', { race: 'DEMON', count: 3 })) });
// 終身監禁：將一個手下從遊戲中移除
reg('MAW_013', { target: anyMinion, abilities: play(fn('coRemove')) });
// 檢察官梅爾特里尼克斯：戰吼：你的對手下個回合只能打出最左與最右的牌
reg('MAW_014', { abilities: play(fn('coMeltranix')) });
// 陪審團義務：召喚兩個白銀之手新兵。使你的白銀之手新兵 +1/+1
reg('MAW_015', { abilities: play(summon('CS2_101t', 2), fn('recruitBuff', { atk: 1, hp: 1 })) });
// 法庭秩序：將你的牌堆由高到低重新排序。抽一張牌
reg('MAW_016', { abilities: play(fn('coOrder')) });
// 集體訴訟律師：戰吼：若你的牌堆沒有中立牌，將一個手下的屬性值設為 1/1
reg('MAW_017', { target: optional(anyMinion), abilities: play(cond({ c: 'deckNoNeutral' }, [{ e: 'setStats', target: { t: 'chosen' }, atk: 1, hp: 1 }])) });
// 偽證：奧秘：在你的回合開始時，發現並施放一個其他職業的奧秘
reg('MAW_018', secretOn('turnStart', fn('coDiscoverCastSecret')));
// 謀殺指控：選擇一個手下。在另一個敵方手下死亡後消滅它
reg('MAW_019', { target: anyMinion, abilities: play(fn('coAccuse', { kind: 'murder' })) });
// 問心無愧：使一個友方手下 +2/+3，並獲得「在對手的回合具有法術免疫」
reg('MAW_021', { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 3 }, fn('coElusiveOpp')) });
// 嫌疑心靈術士：嘲諷。亡語：複製你對手手牌中兩張隨機的牌
reg('MAW_022', { keywords: ['TAUNT'], abilities: dr(fn('coCopyOppHand', { n: 2 })) });
// 竊盜指控：選擇一個手下。在你打出一張從對手複製來的牌後消滅它
reg('MAW_023', { target: anyMinion, abilities: play(fn('coAccuse', { kind: 'theft' })) });
// 正當程序：本場對戰中，玩家在回合開始時多抽一張牌
reg('MAW_024', { abilities: play(fn('coDewProcess')) });
// 監禁：選擇一個手下，使其休眠 3 個回合
reg('MAW_026', { target: anyMinion, abilities: play(fn('goDormantIt', { turns: 3 })) });
// 傳喚出庭：你的對手從手牌中召喚一個隨機手下
reg('MAW_027', { abilities: play(fn('coCallToStand')) });
// 武器專家：戰吼：若你裝備著武器，使其 +1/+1；否則抽一張武器牌
reg('MAW_029', {
  abilities: play(cond({ c: 'weapon' }, [{ e: 'weaponBuff', atk: 1, dur: 1 }], [{ e: 'draw', count: 1, who: 'self', pool: { type: 'WEAPON' } }])),
});
// 托加斯特看守者：戰吼：每有一個敵方手下，就隨機獲得突襲、聖盾或風怒
reg('MAW_030', { abilities: play(fn('coCustodian')) });
// 來生侍者：你的注入卡牌在牌堆中時也會注入
reg('MAW_031', { flags: ['infuseInDeck'] });
// 守口如瓶的證人：奧秘無法被揭露
reg('MAW_032', { flags: ['secretsLocked'] });
// 典獄長：戰吼：摧毀你的牌堆。此手下獲得免疫
reg('MAW_034', { abilities: play(fn('coDestroyDeck'), { e: 'buff', target: { t: 'self' }, keywords: ['IMMUNE'] }) });


// ============================================================== 第三批：機制較複雜的核心卡牌
CORE_OVERRIDES['CORE_EDR_004'] = CORE_OVERRIDES['EDR_004_2026'];
const destroyRandomEnemy: Effect = { e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'enemy' }, count: 1 } };

// 野性呼喚：召喚三隻動物夥伴
reg('OG_211', { abilities: play(summon('NEW1_032'), summon('NEW1_033'), summon('NEW1_034')), tokens: ['NEW1_032', 'NEW1_033', 'NEW1_034'] });
// 光明之怒拉格納羅斯：在你的回合結束時，為一個受傷的友方角色恢復 8 點生命值
reg('OG_229', { abilities: atEndOfTurn(fn('coHealDamaged', { n: 8 })) });
// 秘密吞噬者：戰吼：消滅所有敵方奧秘，每消滅一個獲得 +1/+1
reg('OG_254', { abilities: play(fn('coEater')) });
// 幽暗城商販：亡語：獲得一張隨機的對手職業的牌
reg('OG_330', { abilities: dr(fn('coOppClassCard')) });
// 范達爾‧鹿盔：你的二選一卡牌同時具有兩種效果
reg('OG_044', { flags: ['fandral'] });
// 月獸：二選一 恢復 8 點生命值；或造成 4 點傷害
reg('ONY_018', {
  chooseOne: [
    { id: 'ONY_018a', name: '月光治療', text: '為你的英雄恢復8點生命值', abilities: play({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 8 }) },
    { id: 'ONY_018b', name: '月光之怒', text: '造成4點傷害', target: anyChar, abilities: play(hit(4, false)) },
  ],
});
// 來生侍者：沒有注入版本
reg('MAW_031', { flags: ['infuseInDeck'], noInfuse: true });
// 可疑的煉金師 / 領位員 / 海盜
reg('REV_000', { abilities: play(fn('coSuspicious', { pool: { type: 'SPELL' } })) });
reg('REV_002', { abilities: play(fn('coSuspicious', { pool: { type: 'MINION', rarity: 'LEGENDARY' } })) });
reg('REV_006', { abilities: play(fn('coSuspicious', { pool: { type: 'WEAPON' } })) });
// 嫉妒的收割者：在你打出一張從對手那裡複製來的牌後，偷走原本的那張
reg('REV_011', { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, cond: { c: 'itFromOpp' }, effects: [fn('coStealOriginal')] }] });
// 紅鯡魚：嘲諷。你的非紅鯡魚手下具有潛行
reg('REV_014', { keywords: ['TAUNT'], auras: [{ scope: 'otherFriendly', notNameEn: 'Red Herring', keywords: ['STEALTH'] }] });
// 假面狂歡者：突襲。亡語：召喚牌堆中另一個手下的 2/2 複製
reg('REV_015', { keywords: ['RUSH'], abilities: dr(fn('coMaskedReveler')) });
// 狡猾的廚師：在你的回合結束時，若本回合你對敵方英雄造成 3 點以上傷害，抽一張牌
reg('REV_016', { abilities: atEndOfTurn(fn('coCook')) });
// 貪食的吞噬者：戰吼：吞噬一個敵方手下並獲得它的屬性值。注入：連同它兩側的手下
reg('REV_017', { target: optional(enemyMinion), abilities: play(fn('coDevour')) });
reg('REV_017t', { target: optional(enemyMinion), abilities: play(fn('coDevour', { neighbors: true })) });
// 雷納薩爾親王：你的牌堆張數與起始生命值都是 40
reg('REV_018', { startOfGame: 'renathal' });
// 晚宴表演者：戰吼：從你的牌堆召喚一個你付得起的隨機手下
reg('REV_020', { abilities: play(fn('coDinner')) });
// 凱爾薩斯‧逐日者（罪行）：你每回合打出的第三個手下消耗為 (0)
reg('REV_021', { costAuras: [{ side: 'friendly', type: 'MINION', everyThird: true, set: 0 }] });
// 魚人福爾摩斯：戰吼：破解三條關於對手的線索，獲得對手牌的複製
reg('REV_022', { abilities: play(fn('coHolmes')) });
// 拆除修繕工：可交易。戰吼：摧毀一個敵方地點
reg('REV_023', { keywords: ['TRADEABLE'], abilities: play(fn('coDestroyLocation')) });
// 瘋狂公爵塞歐塔：戰吼：發現雙方各一張手牌，並交換它們
reg('REV_238', { abilities: play(fn('coTheotar')) });
// 窒息暗影：當你打出或棄掉此牌時，消滅一個隨機敵方手下
reg('REV_239', { abilities: [...play(destroyRandomEnemy), { on: { k: 'discarded' }, effects: [destroyRandomEnemy] }] });
// 篡改書卷：將你手牌的 1 費複製洗入你的牌堆，然後棄掉你的手牌
reg('REV_240', { abilities: play(fn('coTome')) });
// 慌張的圖書管理員：每有一個小鬼，+1 攻擊力
reg('REV_242', { auras: [{ scope: 'self', dyn: { amount: 'friendlyImps', atk: 1 } }] });
// 迫近的災厄：抽一張牌。你每控制一個小鬼，重複一次
reg('REV_245', { abilities: play(draw(1), { e: 'repeat', times: { dyn: 'friendlyImps' }, effects: [draw(1)] }) });
// 神秘訪客：戰吼：從對手複製來的牌消耗減少 (3)
reg('REV_246', { abilities: play(fn('coVisitor')) });
// 共犯：戰吼：在你的回合結束時，召喚一個此手下的複製
reg('REV_247', { abilities: play({ e: 'atEndOfTurn', effects: [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }] }) });
// 昇華者的恩賜：使一個手下 +2 生命值。召喚一個與其屬性值相同、具有嘲諷的昇華基利恩
reg('REV_248', { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, hp: 2 }, fn('coBoon')), tokens: ['REV_248t'] });
// 聖光灼燒！：對一個手下造成等同於其攻擊力的傷害
reg('REV_249', { target: anyMinion, abilities: play(fn('coBurn')) });
// 佩拉戈斯：在你對一個友方手下施放法術後，將其攻擊力與生命值設為兩者中較高的值
reg('REV_250', { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('coPelagos')] }] });
// 身分盜用：發現對手手牌與牌堆中一張牌的複製
reg('REV_253', { abilities: play(fn('coDiscoverOpp', { hand: true, deck: true })) });
// 死亡之花巨擊者：戰吼：抽一張亡語手下並獲得它的亡語
reg('REV_310', { abilities: play(fn('coWhomper')) });
// 夜影花苞：二選一 從牌堆發現一個手下並召喚；或發現一個法術並施放
reg('REV_311', {
  chooseOne: [
    { id: 'REV_311a', name: '召喚手下', text: '從你的牌堆中發現一個手下並召喚', abilities: play(fn('coDeckPick', { kind: 'MINION' })) },
    { id: 'REV_311b', name: '施放法術', text: '從你的牌堆中發現一個法術並施放', abilities: play(fn('coDeckPick', { kind: 'SPELL' })) },
  ],
});
// 偽造證據：發現一個法術，本回合它的消耗減少 (2)
reg('REV_313', { abilities: play(fn('coPlannedEvidence')) });
// 灌木大師托庇歐：戰吼：本場對戰中，在你施放自然法術後，召喚一隻有突襲的 3/3 雛龍
reg('REV_314', { abilities: play(fn('coTopior')), tokens: ['REV_314t'] });
// 活體之刃雷莫妮雅：突襲。在此手下攻擊後，裝備它
reg('REV_316', { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [{ e: 'equip', card: 'REV_316t' }] }], tokens: ['REV_316t'] });
reg('REV_316t', { abilities: heroHit([summon('REV_316'), { e: 'destroyWeapon', who: 'self' }]) });
// 驕傲之重：召喚三個 1/3 的嘲諷看守者。若你的生命值不高於 20，使其 +1/+1
reg('REV_334', { abilities: play(fn('coBurden')), tokens: ['REV_334t'] });
// 罪惡陰謀：召喚兩個 2/2 樹人。注入：改為召喚兩個 5/5 古樹
reg('REV_336', { abilities: play(summon('REV_336t2', 2)), infuse: { n: 5, into: 'REV_336t4' }, tokens: ['REV_336t2', 'REV_336t4'] });
reg('REV_336t4', { abilities: play(summon('REV_336t3', 2)), tokens: ['REV_336t3'] });
// 暴動！：本回合你的手下的生命值不會降到 1 以下。它們各自攻擊一個隨機敵方手下
reg('REV_337', { abilities: play(fn('coRiot')) });
// 挖掘者之杖：戰吼：使你手牌中的手下 +1 生命值
reg('REV_338', { abilities: play({ e: 'handBuff', atk: 0, hp: 1, scope: 'all' }) });
// 獵人阿爾提莫：戰吼：召喚一個加岡夥伴。注入：再召喚一個；再注入：全部召喚
reg('REV_353', { abilities: play(fn('coGargon', { n: 1 })), tokens: ['REV_353t', 'REV_353t2', 'REV_353t3', 'REV_353t4', 'REV_353t5'] });
reg('REV_353t', { abilities: play(fn('coGargon', { n: 2 })), infuse: { n: 4, into: 'REV_353t2' }, tokens: ['REV_353t2', 'REV_353t3', 'REV_353t4', 'REV_353t5'] });
reg('REV_353t2', { abilities: play(fn('coGargon', { n: 3 })), tokens: ['REV_353t3', 'REV_353t4', 'REV_353t5'] });
// 蝙蝠賓客：亡語：召喚一隻 2/1 的蝙蝠
reg('REV_356', { abilities: dr(summon('CORE_T_BAT')) });
// 野籽魂：精靈搜尋者 / 野性靈魂 / 艾拉隆 / 雄鹿衝鋒 / 召喚靈魂
const seedTokens = ['REV_360t', 'REV_360t1', 'REV_360t2', 'REV_360t4'];
reg('REV_360', { abilities: play(fn('coWildseed', { mode: 'random' })), tokens: seedTokens });
reg('REV_361', { abilities: play(fn('coWildseed', { mode: 'two', sooner: true })), tokens: seedTokens });
reg('REV_363', { abilities: play(fn('coWildseed', { mode: 'all' })), tokens: seedTokens });
reg('REV_364', { target: anyChar, abilities: play(hit(3), fn('coWildseed', { mode: 'random' })), tokens: seedTokens });
reg('REV_360t', { keywords: ['RUSH'] });
reg('REV_360t1', { keywords: ['TAUNT'] });
reg('REV_360t2', { flags: ['stagSpirit'] });
// 召喚靈魂：施放 8 個隨機德魯伊法術（目標隨機）
reg('REV_365', { abilities: play(fn('coConvoke')) });
// 附帶傷害：對三個隨機敵方手下造成 $6 點傷害。多餘的傷害會打到敵方英雄
reg('REV_369', { abilities: play(fn('coCollateral')) });
// 不速之客：戰吼：選擇一個敵方手下，將你手牌中的一個隨機手下扔向它
reg('REV_370', { target: optional(enemyMinion), abilities: play(fn('coCrasher')) });
// 暗影華爾滋：召喚一個 3/5 的嘲諷暗影。若本回合有手下死亡，再召喚一個
reg('REV_372', { abilities: play(summon('REV_372t'), cond({ c: 'anyDiedThisTurn' }, [summon('REV_372t')])), tokens: ['REV_372t'] });
// 達克維恩夫人：戰吼：召喚兩個 2/1 的暗影，它們各獲得「亡語：施放你的上一個暗影法術」
reg('REV_373', { abilities: play(fn('coDarkvein')), tokens: ['REV_373t'] });
// 暗影之子：亡語：使你手牌中消耗最高的暗影法術的消耗減少 (3)
reg('REV_374', { abilities: dr(fn('coShadowborn')) });
// 邀請信使：每當有其他職業的卡加入你的手牌，複製它
reg('REV_377', { flags: ['courier'] });
// 鑑識除塵員：戰吼：你的對手的手下在下個回合消耗增加 (1)
reg('REV_378', { abilities: play({ e: 'minionTax', amount: 1 }) });
// 完美不在場證明：直到你的下個回合，你的英雄每次最多受到 1 點傷害
reg('REV_504', { abilities: play(fn('coAlibi')) });
// 罪惡烙印：烙印一個敵方手下。每當它受到傷害，對敵方英雄造成 1 點傷害
reg('REV_506', { target: enemyMinion, abilities: play(fn('coBrand')) });
// 銷毀證據：使你的英雄本回合 +3 攻擊力。從手牌中選 3 張洗入你的牌堆
reg('REV_507', { abilities: play({ e: 'heroAttack', amount: 3 }, fn('coShuffleHand', { n: 3 })) });
// 維度遺物 / 滅絕遺物 / 幻影遺物
reg('REV_508', { abilities: play(fn('coRelic', { kind: 'dimensions' })) });
reg('REV_834', { abilities: play(fn('coRelic', { kind: 'extinction' })) });
reg('REV_943', { abilities: play(fn('coRelic', { kind: 'phantasms' })), tokens: ['REV_943t'] });
// 放大鏡之刃：在你的英雄攻擊後，抽牌直到你有 3 張手牌
reg('REV_509', { abilities: heroHit([fn('drawUntil', { n: 3 })]) });
// 書蟲：戰吼：選擇手牌中的一張牌洗入你的牌堆
reg('REV_511', { abilities: play(fn('coShuffleHand', { n: 1 })) });
// 無可避免的科爾蘇加德：戰吼：復活你的不穩定骷髏。放不下的會立刻爆炸！
reg('REV_514', { abilities: play(fn('coKelThuzad')), tokens: ['REV_845'] });
// 莊園經理歐萊恩：在一個友方奧秘被揭露後，施放另一個法師奧秘並獲得 +2/+2
reg('REV_515', { flags: ['orion'] });
// 復仇之面：奧秘：在一個敵方手下攻擊你的英雄後，召喚它的複製來攻擊敵方英雄
reg('REV_516', secretOn('afterMinionAttacksHero', fn('coVisage')));
// 霜寒之觸：造成 $3 點傷害。注入：將一張霜寒之觸加入你的手牌
reg('REV_601', { target: anyChar, abilities: play(hit(3)) });
reg('REV_601t', { target: anyChar, abilities: play(hit(3), addCard('REV_601')) });
// 雙重背叛：奧秘：在你的對手花光所有法力後，抽兩張牌
reg('REV_825', secretOn('enemyAllMana', draw(2)));
// 私家偵探：戰吼：從你的牌堆施放一個奧秘。連擊：改為施放 2 個
reg('REV_826', { abilities: play(fn('coCastDeckSecret')) });
// 黏呼呼的處境：奧秘：在你的對手施放法術後，召喚一隻具有潛行的 3/4 蜘蛛
reg('REV_827', { ...secretOn('afterEnemySpell', summon('REV_827t')), tokens: ['REV_827t'] });
// 綁架：奧秘：在你的對手打出一個手下後，把它塞進 0/4 的麻袋
reg('REV_828', { ...secretOn('enemyPlaysMinion', fn('coKidnap')), tokens: ['REV_828t'] });
reg('REV_828t', { abilities: dr(fn('coSackReturn')) });
// 哈基亞：潛行。亡語：把哈基亞的靈魂存放進一個友方奧秘；奧秘觸發時重新召喚
reg('REV_829', { keywords: ['STEALTH'], abilities: dr(fn('coHalkias')) });
// 小鬼王拉法姆：戰吼：復活四個友方小鬼。注入：使你的小鬼 +2/+2
reg('REV_835', { abilities: play(fn('coRafaam')), infuse: { n: 5, into: 'REV_835t' }, tokens: ['REV_835t'] });
reg('REV_835t', { abilities: play(fn('coRafaam', { buff: true })) });
// 汙泥水管工：所有手下的消耗增加 (2)
reg('REV_837', { costAuras: [{ side: 'both', type: 'MINION', add: 2 }] });
// 死亡所生：對所有手下造成 $2 點傷害。每消滅一個，召喚一個 2/2 不穩定骷髏
reg('REV_840', { abilities: play(fn('coDeathborne')), tokens: ['REV_845'] });
// 匿名線人：戰吼：你打出的下一個奧秘消耗為 (0)
reg('REV_841', { abilities: play({ e: 'pendingDiscount', d: { set: 0, secret: true } }) });
// 晉升：使一個白銀之手新兵 +3/+3 並獲得嘲諷
reg('REV_842', { target: { filter: { type: 'minion', side: 'friendly', nameIncludes: 'Silver Hand Recruit' } }, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3, keywords: ['TAUNT'] }) });
// 被剝奪的靈魂：戰吼：若你控制一個地點，發現你牌堆中一張牌的複製
reg('REV_901', { abilities: play(fn('coDispossessed')) });
// 德納修斯大帝：生命竊取。戰吼：對敵人造成 5 點傷害，分散到各處。注入：多造成 1 點
reg('REV_906', { keywords: ['LIFESTEAL'], abilities: play({ e: 'splitDamage', filter: { side: 'enemy' }, amount: 5 }), infuse: { n: 2, into: 'REV_906t' }, tokens: ['REV_906t'] });
reg('REV_906t', { noInfuse: true, keywords: ['LIFESTEAL'], abilities: play({ e: 'splitDamage', filter: { side: 'enemy' }, amount: 6 }) });
// 詭異的畫像：在另一個手下死亡後，變成它的複製
reg('REV_916', { abilities: [{ on: { k: 'minionDied', side: 'any' }, effects: [fn('coPainting')] }] });
// 說服偽裝：將一個友方手下變成消耗多 (2) 的手下。注入：改為所有友方手下
reg('REV_920', { target: friendlyMinion, abilities: play({ e: 'evolve', target: { t: 'chosen' }, amount: 2 }), infuse: { n: 4, into: 'REV_920t' }, tokens: ['REV_920t'] });
reg('REV_920t', { abilities: play({ e: 'evolve', target: allFriendly, amount: 2 }) });
// 石匠：戰吼：本場對戰中，你的圖騰 +2 攻擊力
reg('REV_921', { abilities: play(fn('coStonewright')) });
// 原初之浪：將敵方手下變成消耗少 (1) 的手下，友方手下變成消耗多 (1) 的手下
reg('REV_924', { abilities: play({ e: 'evolve', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: -1 }, { e: 'evolve', target: allFriendly, amount: 1 }) });
// 瘋狂的可憐蟲：受傷時 +2 攻擊力並具有衝鋒
reg('REV_930', { auras: [{ scope: 'self', atk: 2, keywords: ['CHARGE'], cond: { c: 'damaged' } }] });
// 征服者戰旗：從雙方牌堆各揭露一張牌三次。抽你消耗較高的牌
reg('REV_931', { abilities: play(fn('coBanner')) });
// 灌注斧：在你的英雄攻擊後，使你受傷的手下 +1/+2。注入：+2/+2
reg('REV_933', { abilities: heroHit([{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', damaged: true } }, atk: 1, hp: 2 }]), infuse: { n: 2, into: 'REV_933t' }, tokens: ['REV_933t'] });
reg('REV_933t', { abilities: heroHit([{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', damaged: true } }, atk: 2, hp: 2 }]) });
// 滅絕者奧爾格拉：戰吼：每有一個受傷的手下 +1/+1，然後攻擊所有敵人
reg('REV_934', { abilities: play(fn('coOlgra')) });
// 派對賀禮圖騰：在你的回合結束時，召喚一個隨機基本圖騰。注入：改為兩個
reg('REV_935', { abilities: atEndOfTurn(fn('coRandomTotem', { n: 1 })), infuse: { n: 2, into: 'REV_935t' }, tokens: ['REV_935t'] });
reg('REV_935t', { abilities: atEndOfTurn(fn('coRandomTotem', { n: 2 })) });
// 巧匠希瑪克斯：戰吼：發現並施放一個遺物。注入：改為全部施放
reg('REV_937', { abilities: play(fn('coCastRelics')), infuse: { n: 5, into: 'REV_937t' }, tokens: ['REV_937t', 'REV_508', 'REV_834', 'REV_943'] });
reg('REV_937t', { abilities: play(fn('coCastRelics', { all: true })), tokens: ['REV_508', 'REV_834', 'REV_943'] });
// 暗影之門：抽一張法術牌。注入：將一張暫時的複製加入你的手牌
reg('REV_938', { abilities: play(fn('coDoor')), infuse: { n: 2, into: 'REV_938t' }, tokens: ['REV_938t'] });
reg('REV_938t', { abilities: play(fn('coDoor', { copy: true })) });
// 鋸齒骨刺：對一個手下造成 $3 點傷害。若它死亡，本回合你的下一張牌消耗減少 (2)
reg('REV_939', { target: anyMinion, abilities: play(fn('coBoneSpike')) });
// 死靈領主德拉卡：戰吼：裝備一把 @/3 的匕首
reg('REV_940', { abilities: play(fn('coDraka')), tokens: ['REV_940t'] });
// 可疑的陌生人：戰吼：發現另一個職業的奧秘
reg('REV_945', { abilities: play({ e: 'discover', pool: { type: 'SPELL', isSecret: true, otherClass: true } }) });
// 蒸氣清潔機：戰吼：摧毀雙方牌堆中並非一開始就在牌堆中的牌
reg('REV_946', { abilities: play(fn('coSteamcleaner')) });
// 服務鈴：發現你牌堆中的一張職業牌，抽出它的所有複製
reg('REV_948', { abilities: play(fn('coServiceBell')) });
// 神聖通行費：向隨機手下射出 5 道射線：友方 +2/+2，敵方受到 $2 點傷害
reg('REV_950', { abilities: play(fn('coDivineToll')) });
// 傳說邀請函：發現另一個職業的傳說手下，它的消耗為 (0)
reg('REV_951t', { abilities: play({ e: 'discover', pool: { type: 'MINION', rarity: 'LEGENDARY', otherClass: true }, then: [fn('coZeroIt')] }) });
// 女伯爵：戰吼：若你的牌堆沒有中立牌，將 3 張傳說邀請函加入你的手牌
reg('REV_951', { abilities: play(cond({ c: 'deckNoNeutral' }, [addCard('REV_951t', 3)])), tokens: ['REV_951t'] });
// 管家史都華：亡語：使你召喚的下一個白銀之手新兵 +3/+3 並獲得此亡語
reg('REV_955', { abilities: dr(fn('coStewart')) });
// 可怕的掘墓人：戰吼：若你控制奧秘，選擇對手手牌的一張牌洗入他的牌堆
reg('REV_959', { abilities: play(fn('coGravedigger')) });
// 灰燼元素：戰吼：下個回合，每當你的對手抽牌，他受到 2 點傷害
reg('REV_960', { abilities: play(fn('coAshen')) });
// 勢利眼：戰吼：你手牌中每有一張聖騎士牌，隨機獲得聖盾、生命竊取、突襲或嘲諷
reg('REV_961', { abilities: play(fn('coSnob')) });
// 惡魔之影：每當你施放一個法術，變成它的複製
reg('RLK_567', { flags: ['mirrorSpell'] });
// 水晶雕刻教徒：戰吼：若你手牌中有暗影法術，獲得 +1/+1
reg('RLK_814', { abilities: play(fn('coCultist')) });
// 時光守衛安納克洛斯：戰吼：把所有其他手下送往兩個回合後的未來
reg('RLK_919', { abilities: play(fn('coAnachronos')) });
// 惡魔研習 / 伊利達瑞研習：發現一張牌，它的消耗減少 (1)
reg('SCH_158', { abilities: play(fn('coStudies', { pool: { type: 'MINION', race: 'DEMON' } })) });
reg('YOP_001', { abilities: play(fn('coStudies', { pool: { outcast: true } })) });
// 魔杖製造者：戰吼：將一張你職業的 1 費法術加入你的手牌
reg('SCH_160', { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', cost: 1, cls: 'own' }, count: 1, who: 'self' }) });
// 魔女威洛：戰吼：從你的手牌與牌堆各召喚一個隨機惡魔
reg('SCH_181', { abilities: play(fn('coWillow')) });
// 導覽員：戰吼：你的下一個英雄能力消耗為 (0)
reg('SCH_312', { abilities: play({ e: 'heroPowerDiscount', amount: 10 }) });
// 入會儀式：對一個手下造成 $4 點傷害。若它死亡，召喚一個新的複製
reg('SCH_512', { target: anyMinion, abilities: play(fn('coInitiation')) });
// 剽竊：奧秘：在你的對手的回合結束時，將他本回合打出的牌的複製加入你的手牌
reg('SCH_706', secretOn('enemyTurnEnd', fn('coPlagiarize')));
// 邪教新信徒：戰吼：你的對手的法術在下個回合消耗增加 (1)
reg('SCH_713', { abilities: play({ e: 'spellTax', amount: 1 }) });
// 鑰匙大師阿拉巴斯特：每當你的對手抽牌，將一張消耗為 (1) 的複製加入你的手牌
reg('SCH_717', { abilities: [{ on: { k: 'draw', side: 'enemy' }, effects: [fn('coKeymaster')] }] });
// 大領主弗塔根：聖盾。在一個友方手下失去聖盾後，使你手牌中的一個手下 +5/+5
reg('SW_047', { keywords: ['DIVINE_SHIELD'], abilities: [{ on: { k: 'shieldLost', side: 'friendly' }, effects: [{ e: 'handBuff', atk: 5, hp: 5, scope: 'random' }] }] });
// 科尼留斯‧羅姆：在每個玩家的回合開始與結束時，抽一張牌
reg('SW_080', {
  abilities: [
    { on: { k: 'turnStart', whose: 'each' }, effects: [draw()] },
    { on: { k: 'turnEnd', whose: 'each' }, effects: [draw()] },
  ],
});
// 暗巷契約：召喚一個具有嘲諷、屬性值等同你手牌數的惡魔
reg('SW_085', { abilities: play(fn('coFiend')), tokens: ['SW_085t'] });
// 透支：可交易。解鎖你被超載的法力水晶，造成等量的傷害
reg('SW_114', { keywords: ['TRADEABLE'], abilities: play(fn('coOverdraft')) });
// 活力松鼠：亡語：將 4 顆橡實洗入你的牌堆。抽到時召喚一隻 2/1 松鼠
reg('SW_439', { abilities: dr({ e: 'shuffle', card: 'SW_439t', count: 4 }), tokens: ['SW_439t', 'SW_439t2'] });
reg('SW_439t', { castsWhenDrawn: true, abilities: play(summon('SW_439t2')), tokens: ['SW_439t2'] });
// 黑暗主教本尼迪塔斯：開局時，若你牌堆中的法術全是暗影法術，進入暗影形態
reg('SW_448', { startOfGame: 'benedictus' });
// 大獎！：將兩張其他職業消耗 (5) 以上的隨機法術加入你的手牌
reg('TID_931', { abilities: play({ e: 'addRandom', pool: { type: 'SPELL', otherClass: true, minCost: 5 }, count: 2, who: 'self' }) });
// 格諾梅莉亞：突襲。同時傷害攻擊目標相鄰的手下。亡語：對所有敵人造成 2 點傷害
reg('TOY_100', { keywords: ['RUSH', 'CLEAVE'], abilities: dr({ e: 'damage', target: { t: 'all', filter: { side: 'enemy' } }, amount: 2 }) });
// 暗夜精靈女獵手：戰吼：對三個不同的敵人各造成 3 點傷害
reg('TOY_101', { abilities: play(fn('coHuntress')) });
// 步兵：嘲諷。相鄰的手下在攻擊時免疫
reg('TOY_102', { keywords: ['TAUNT'], flags: ['footman'] });
// 戰歌步兵：突襲。在此手下攻擊並消滅一個手下後，可以再次攻擊
reg('TOY_103', { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('coGrunt')] }] });
// 化石之石：召喚 4/8、2/4 與 1/2 的嘲諷元素
reg('TSC_076', { abilities: play(summon('TSC_076t3'), summon('TSC_076t2'), summon('TSC_076t')), tokens: ['TSC_076t', 'TSC_076t2', 'TSC_076t3'] });
// 迷途的賢者：流放：使你手牌最左與最右的牌消耗減少 (1)
reg('TSC_217', { abilities: play(cond({ c: 'outcast' }, [fn('coWayward')])) });
// 鰭足朋友：二選一 召喚一隻 6/6 嘲諷虎鯨；或六隻具有突襲的 1/1 水獺
reg('TSC_650', {
  chooseOne: [
    { id: 'TSC_650a', name: '指揮虎鯨', text: '召喚一隻具有<b>嘲諷</b>的6/6虎鯨', abilities: play(summon('TSC_650t')) },
    { id: 'TSC_650d', name: '水獺嬉戲', text: '召喚六隻具有<b>突襲</b>的1/1水獺', abilities: play(summon('TSC_650t4', 6)) },
  ],
  tokens: ['TSC_650t', 'TSC_650t4'],
});
// 神話恐懼：生命竊取。在你的回合結束時，強迫所有敵方手下攻擊它
reg('TTN_866', { keywords: ['LIFESTEAL'], abilities: atEndOfTurn(fn('coTerror')) });
// 動物園馬克杯 / 水壺：戰吼：使 3 個不同種族的隨機友方手下 +1/+1（+2/+2）
reg('WON_141', { abilities: play(fn('coMenagerie', { n: 1 })) });
reg('WON_142', { abilities: play(fn('coMenagerie', { n: 2 })) });
// 爐石化身：戰吼：開啟一包標準卡包，打出裡面的所有牌
reg('WON_145', { abilities: play(fn('coAvatar')) });
// 引爆魔像：嘲諷。戰吼：使你手牌中的嘲諷手下 +2/+2
reg('WW_329', { keywords: ['TAUNT'], abilities: play(fn('coHandTaunt')) });
// 護甲商人：戰吼：使每個英雄獲得 4 點護甲
reg('YOP_032', { abilities: play({ e: 'armor', amount: 4 }, { e: 'armor', amount: 4, who: 'opponent' }) });

// ============================================================== 標準剩餘：核心卡牌（CS3_ / RLK_ / TTN_）
// 護法者艾格文：法術傷害 +2。亡語：你抽到的下一個手下會繼承這些能力
reg('CS3_001', { spellDamage: 2, abilities: dr(fn('coAegwynn')) });
// 精挑細選的育種者：戰吼：發現你牌堆中一隻野獸的複製
reg('CS3_015', { abilities: play(fn('coDiscoverDeck', { race: 'BEAST', copy: true })) });
// 伊利達瑞審判官：突襲。在你的英雄攻擊一個敵人後，此手下也攻擊它
reg('CS3_020', { keywords: ['RUSH'], abilities: heroHit([fn('coInquisitor')]) });
// 泰蘭‧弗丁：嘲諷、聖盾。亡語：抽你消耗最高的手下
reg('CS3_024', { keywords: ['TAUNT', 'DIVINE_SHIELD'], abilities: dr(fn('coHighestMinion')) });
// 霸主朗薩克：突襲。每當此手下攻擊，使你手牌中的所有手下 +1/+1
reg('CS3_025', { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [{ e: 'handBuff', atk: 1, hp: 1, scope: 'all' }] }] });
// 在暗影中茁壯：發現你牌堆中的一個法術
reg('CS3_028', { abilities: play(fn('coDiscoverDeck', { type: 'SPELL' })) });
// 生命守縛者阿萊克絲塔薩：戰吼：選擇一個角色。若是友方，恢復 #8 點生命值；若是敵方，造成 8 點傷害
reg('CS3_031', { target: anyChar, abilities: play(fn('coAlexstrasza')) });
// 龍巢之母奧妮克希亞：在每個回合結束時，用 1/1 的雛龍填滿你的戰場
reg('CS3_032', { abilities: [{ on: { k: 'turnEnd', whose: 'each' }, effects: [fn('coWhelps')] }], tokens: ['BRM_004t'] });
// 夢想者伊瑟拉：戰吼：將每種夢境牌各一張加入你的手牌
reg('CS3_033', { abilities: play(addCard('DREAM_01'), addCard('DREAM_02'), addCard('DREAM_03'), addCard('DREAM_04'), addCard('DREAM_05')), tokens: ['DREAM_01', 'DREAM_02', 'DREAM_03', 'DREAM_04', 'DREAM_05'] });
// 魔法編織者瑪里苟斯：戰吼：抽法術牌，直到你的手牌已滿
reg('CS3_034', { abilities: play(fn('coMalygosFill')) });
// 永恆的諾茲多姆：開局：若這張牌在雙方玩家的牌堆中，回合只有 15 秒（沒有計時器，不影響對戰）
reg('CS3_035', {});
// 毀滅者死亡之翼：戰吼：消滅所有其他手下。每消滅一個，棄掉一張牌
reg('CS3_036', { abilities: play(fn('coDeathwingDiscard')) });
// 瘟疫穀物：獲得 4 具屍體。將四個穀物箱洗入你的牌堆，抽到時召喚一個 2/2 的亡靈
reg('RLK_039', { abilities: play({ e: 'gainCorpses', amount: 4 }, { e: 'shuffle', card: 'RLK_039t', count: 4 }), tokens: ['RLK_039t'] });
// 縫補怪：戰吼：消滅你對手手牌、牌堆與戰場上各一個隨機手下
reg('RLK_071', { abilities: play(fn('coPatchwerk')) });
// 惡臭的屍體：戰吼：對一個敵人與你的英雄各造成 2 點傷害
reg('RLK_079', { target: { filter: { type: 'character', side: 'enemy' } }, abilities: play(hit(2, false), { e: 'damage', target: { t: 'hero', side: 'friendly' }, amount: 2 }) });
// 死亡使者薩魯法爾：嘲諷。亡語：回到你的手牌，消耗生命值而不是法力
reg('RLK_082', { keywords: ['TAUNT'], abilities: dr(fn('coSaurfang')) });
// 令人厭惡的巨獸：敵方角色無法被治療
reg('RLK_115', { flags: ['enemyNoHeal'] });
// 霜寒監督者弗里加拉：戰吼：抽 2 張法術牌。若它們都是冰霜法術，對所有敵人造成 2 點傷害
reg('RLK_224', { abilities: play(fn('coFrigidara')) });
// 霜牙之劍：在你的英雄攻擊後，使你手牌中的一個法術消耗減少 (1)
reg('RLK_710', { abilities: heroHit([fn('coSpellCost')]) });
// 冰霜雕刻師：戰吼：召喚兩個 2/1 的冰霜元素，亡語：對一個隨機敵人造成 2 點傷害
reg('RLK_752', { abilities: play(summon('EDR_T_RIME', 2)) });
// 抵抗光環：你的對手的法術消耗增加 (1)，持續 2 個敵方回合
reg('TTN_851', { objective: 2, abilities: [...play(fn('objective')), ...atEndOfTurn({ e: 'spellTax', amount: 1 })] });
// 十字軍光環：每當一個友方手下攻擊，使它 +2/+1。持續 3 個回合
reg('TTN_908', { objective: 3, abilities: [...play(fn('objective')), { on: { k: 'attack', subject: 'friendlyMinion' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2, hp: 1 }] }] });

// ============================================================== 其他核心卡（原始版本 ID）
reg('RLK_086', { abilities: dr(fn('frostmourne')) });
reg('RLK_087', { abilities: play(fn('destroyHighestAttack')) });
reg('RLK_122', { abilities: play(fn('fillBoardRandom', { race: 'UNDEAD' })) });
reg('MAW_028', { keywords: ['TAUNT'], abilities: play(cond({ c: 'armor', n: 4 }, [{ e: 'buff', target: { t: 'self' }, atk: 4, hp: 4 }])) });
// 瓦許女爵：被變形成手下時，改為直接召喚（沒有需要額外處理的效果）
reg('REV_925', {});
