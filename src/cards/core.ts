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
reg('MAW_012', { abilities: play(fn('coSummonDead', { race: 'DEMON', count: 1 })) });
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

