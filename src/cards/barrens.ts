// ============================================================================
// 貧瘠之地（Forged in the Barrens，BAR_，系列 1525）與迷你系列哀嚎洞穴（WC_）剩下的卡：
// 等級法術（法力水晶 5 / 10 時升級）、符印、盛怒、毒藥、冒險者、哨所……
// 解析器看不懂的卡在這裡手動定義；自訂效果（bar 開頭）在 game.ts 的 customBarrens。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const frenzy = (...effects: Effect[]): Ability[] => [{ on: { k: 'frenzy' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell: true });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const selfBuff = (atk = 0, hp = 0): Effect => ({ e: 'buff', target: { t: 'self' }, atk, hp });
const atStartOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnStart', whose: 'mine' }, effects }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const allMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const } };
const allEnemyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'enemy' as const } };
const otherMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const, excludeSelf: true } };
const randomFriendly = (count: number) => ({ t: 'random' as const, filter: { type: 'minion' as const, side: 'friendly' as const }, count });
/** 等級法術：三個等級（5 / 10 個法力水晶時升級） */
const ranks = (id: string, make: (rank: number) => Override): Record<string, Override> => {
  const [r1, r2, r3] = [make(1), make(2), make(3)];
  return {
    [id]: { ...r1, rankUp: { at: 5, into: `${id}t` }, tokens: [...(r1.tokens ?? []), `${id}t`, `${id}t2`] },
    [`${id}t`]: { ...r2, rankUp: { at: 10, into: `${id}t2` }, tokens: [...(r2.tokens ?? []), `${id}t2`] },
    [`${id}t2`]: r3,
  };
};
/** 隨機加成效果的 2/2 冒險者 */
const ADVENTURERS = ['WC_034t', 'WC_034t2', 'WC_034t3', 'WC_034t4', 'WC_034t5', 'WC_034t6', 'WC_034t7', 'WC_034t8'];
const adventurer = (): Effect => fn('summonOneOf', { cards: ADVENTURERS });
const POISONS: Effect = { e: 'addRandom', pool: { type: 'SPELL', cls: 'ROGUE', nameEn: 'Poison' }, count: 1, who: 'self' };
const KAZAKUS_HERBS = [
  'BAR_079t4', 'BAR_079t5', 'BAR_079t6', 'BAR_079t7', 'BAR_079t8', 'BAR_079t9',
  'BAR_079t10', 'BAR_079t10b', 'BAR_079t11', 'BAR_079t12', 'BAR_079t12b', 'BAR_079t12c', 'BAR_079t13', 'BAR_079t13b', 'BAR_079t13c',
  'BAR_079t14', 'BAR_079t14b', 'BAR_079t14c', 'BAR_079t15', 'BAR_079t15b', 'BAR_079t15c',
];
const golem: Override = { abilities: play(fn('barGolemPlay')) };
const herb = (effects: Effect[] = []): Override => ({ abilities: play(...effects) });
const randomEnemy = (count: number) => ({ t: 'random' as const, filter: { type: 'minion' as const, side: 'enemy' as const }, count });

export const BARRENS_OVERRIDES: Record<string, Override> = {
  // ================================================================ 中立
  // 剃鬃劫掠者：盛怒：隨機攻擊一個敵人
  BAR_020: { abilities: frenzy(fn('aoAttackRandom')) },
  // 黃金之路蠻兵：嘲諷。盛怒：獲得等同所受傷害的護甲值
  BAR_021: { keywords: ['TAUNT'], abilities: frenzy(fn('barGrunt')) },
  // 原始保護者：戰吼：抽出你消耗最高的法術，召喚一個相同消耗的隨機手下
  BAR_042: { abilities: play(fn('barProtector')) },
  // 有天分的秘法師：戰吼：本回合你的下一個法術獲得法術傷害 +2
  BAR_064: { abilities: play(fn('barNextSpellPower', { amount: 2 })) },
  // 滿意的黑鐵酒客：盛怒：召喚另一個滿意的黑鐵酒客
  BAR_070: { abilities: frenzy(summon('BAR_070')) },
  // 前沿哨所：無法攻擊。在你的對手抽一張牌後，它的消耗增加 (1)（最高 10）
  BAR_074: { keywords: ['CANT_ATTACK'], abilities: [{ on: { k: 'draw', side: 'enemy' }, effects: [fn('barFarWatch')] }] },
  // 卡加爾‧戰痕：戰吼：本場對戰中你每召喚過一個哨所，召喚一個 5/5 偵查兵
  BAR_077: { abilities: play(fn('barKargal')), tokens: ['BAR_077t'] },
  // 『魔像塑造者』卡札克斯：戰吼：若你的牌堆中沒有 4 費的牌，打造一個魔像
  BAR_079: { abilities: play(cond({ c: 'deckNoCost', n: 4 }, [fn('barKazakus')])), tokens: ['BAR_079_m1', 'BAR_079_m2', 'BAR_079_m3', ...KAZAKUS_HERBS] },
  BAR_079_m1: golem,
  BAR_079_m2: golem,
  BAR_079_m3: golem,
  BAR_079t4: herb(),
  BAR_079t5: herb(),
  BAR_079t6: herb(),
  BAR_079t7: herb(),
  BAR_079t8: herb(),
  BAR_079t9: herb(),
  BAR_079t10: herb([{ e: 'buff', target: otherMinions, atk: 1, hp: 1 }]),
  BAR_079t10b: herb([{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, atk: 2, hp: 2 }]),
  BAR_079t11: herb([{ e: 'summonCopy', target: { t: 'self' }, count: 1 }]),
  BAR_079t12: herb([{ e: 'freeze', target: randomEnemy(1) }]),
  BAR_079t12b: herb([{ e: 'freeze', target: randomEnemy(2) }]),
  BAR_079t12c: herb([{ e: 'freeze', target: allEnemyMinions }]),
  BAR_079t13: herb([{ e: 'damage', target: randomEnemy(1), amount: 3 }]),
  BAR_079t13b: herb([{ e: 'damage', target: randomEnemy(2), amount: 3 }]),
  BAR_079t13c: herb([{ e: 'damage', target: allEnemyMinions, amount: 3 }]),
  BAR_079t14: herb(),
  BAR_079t14b: herb(),
  BAR_079t14c: herb(),
  BAR_079t15: herb([draw()]),
  BAR_079t15b: herb([draw(2)]),
  BAR_079t15c: herb([draw(4)]),
  // 暗影獵手沃金：戰吼：選擇一個手下，把它與擁有者手牌中一個隨機手下交換
  BAR_080: { target: { filter: { type: 'minion', side: 'any', excludeSelf: true }, optional: true }, abilities: play(fn('barVoljin')) },
  // 南海無賴：戰吼：發現你對手牌堆中的一張牌；你的對手也抽出那張牌
  BAR_081: { abilities: play(fn('barScoundrel')) },
  // 貧瘠之地陷捕者：你的亡語卡消耗減少 (1)
  BAR_082: { costAuras: [{ side: 'friendly', hasDeathrattle: true, add: -1 }] },
  // 部落特務：戰吼：複製你對手的奧秘並把它們放到場上
  BAR_430: { abilities: play(fn('barHordeOperative')) },
  // 腐爛的普雷莫爾：在一個有嘲諷的友方手下死亡後，召喚一個沒有嘲諷的它的全新複製
  BAR_540: { abilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('barPlaguemaw')] }] },
  // 曼寇里克：戰吼：幫曼寇里克找到他的妻子！她最後出現在你的牌堆中
  BAR_721: { abilities: play({ e: 'shuffle', card: 'BAR_721t', count: 1 }), tokens: ['BAR_721t'] },
  BAR_721t: { castsWhenDrawn: true, abilities: play(fn('barOlgra')), tokens: ['BAR_721t2'] },
  // 野生蟾蜍：嘲諷。戰吼：若你的手牌中有自然法術，獲得 +2 生命值
  BAR_743: { keywords: ['TAUNT'], abilities: play(cond({ c: 'holdingSchool', school: 'NATURE' }, [selfBuff(0, 2)])) },
  // 靈魂醫者：在你施放一張神聖法術後，使一個隨機友方手下獲得 +2 生命值
  BAR_744: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'HOLY' }, effects: [{ e: 'buff', target: randomFriendly(1), hp: 2 }] }] },
  // 燃火元素：戰吼：你打出的下一個元素消耗減少 (1)
  BAR_854: { abilities: play({ e: 'pendingDiscount', d: { race: 'ELEMENTAL', amount: 1 } }) },
  // 十字路口八卦人士：在一個友方奧秘被揭露後，獲得 +2/+2
  BAR_890: { flags: ['gossiper'] },
  // 吞噬軟漿怪：亡語：召喚一個有隨機加成效果的 2/2 冒險者
  WC_027: { abilities: dr(adventurer()), tokens: ADVENTURERS },
  // 集合石：在你的回合結束時，把一個有隨機加成效果的 2/2 冒險者加入你的手牌
  WC_028: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('addOneOf', { cards: ADVENTURERS })] }], tokens: ADVENTURERS },
  // 無私搭檔：戰吼：裝備你牌堆中的一把隨機武器
  WC_029: { abilities: play(fn('barSidekick')) },
  // 吞噬者穆坦努斯：戰吼：吃掉你對手手牌中的一個手下，獲得它的屬性值
  WC_030: { abilities: play(fn('barMutanus')) },
  // 大德魯伊納拉雷克斯：休眠 2 回合。休眠時，在你的回合結束時把一張夢境牌加入你的手牌
  WC_035: { abilities: [{ on: { k: 'summoned' }, effects: [fn('barNaralexSleep')] }, { on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('barNaralexDream')] }], tokens: ['DREAM_01', 'DREAM_02', 'DREAM_03', 'DREAM_04', 'DREAM_05'] },

  // ================================================================ 德魯伊
  ...ranks('BAR_536', (r) => ({ abilities: play(fn('barDrawDiscount', { race: 'BEAST', amount: r })) })),
  // 剃鬃戰衛：你每回合打出的第一個嘲諷手下消耗減少 (2)
  BAR_537: { costAuras: [{ side: 'friendly', type: 'MINION', firstTaunt: true, add: -2 }] },
  // 平原德魯伊：突襲。盛怒：變形成一隻有嘲諷的 6/7 科多獸
  BAR_538: { keywords: ['RUSH'], abilities: frenzy({ e: 'transform', target: { t: 'self' }, card: 'BAR_538t' }), tokens: ['BAR_538t'] },
  // 星穹連線：把你的法力水晶變成 0。把你手牌與牌堆中的卡的消耗變成 (1)
  BAR_539: { abilities: play(fn('barCelestial')) },
  // 刺殼印記：使一個手下獲得 +2/+2。若它有嘲諷，把它的複製加入你的手牌
  BAR_549: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 2 }, fn('barSpikeshell')) },
  // 葛夫‧符文圖騰：在你施放一張自然法術後，使另一個友方手下獲得 +2/+2
  BAR_720: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'NATURE' }, effects: [{ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly', excludeSelf: true }, count: 1 }, atk: 2, hp: 2 }] }] },
  // 牙縛德魯伊：嘲諷。亡語：使你手牌中一隻野獸的消耗減少 (2)
  WC_004: { keywords: ['TAUNT'], abilities: dr(fn('barHandDiscount', { race: 'BEAST', amount: 2 })) },
  // 安娜科德拉女士：你的自然法術消耗減少 (2)
  WC_006: { costAuras: [{ side: 'friendly', type: 'SPELL', school: 'NATURE', add: -2 }] },
  // 變異尖牙風蛇：在你施放一張自然法術後，召喚一隻有突襲的 4/2 飛蛇
  WC_036: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'NATURE' }, effects: [summon('WC_036t1')] }], tokens: ['WC_036t1'] },

  // ================================================================ 獵人
  // 科多馱運獸：戰吼：發現一隻野獸、一個奧秘或一把武器
  BAR_030: { abilities: play(fn('barKodo')) },
  // 日鱗迅猛龍：盛怒：把一張永久 +2/+1 的日鱗迅猛龍洗入你的牌堆
  BAR_031: { abilities: frenzy(fn('barRaptor')) },
  // 穿透射擊：對一個手下造成 6 點傷害，溢出的傷害會擊中敵方英雄
  BAR_032: { target: anyMinion, abilities: play(fn('barExcess', { amount: 6, to: 'enemy' })) },
  ...ranks('BAR_034', (r) => ({ abilities: play(summon(['BAR_034t3', 'BAR_034t4', 'BAR_034t5'][r - 1])), tokens: [['BAR_034t3', 'BAR_034t4', 'BAR_034t5'][r - 1]] })),
  // 戰歌馴獸師：戰吼：從你的牌堆發現一隻野獸，使它的所有複製獲得 +2/+1（無論在哪裡）
  BAR_037: { abilities: play(fn('barWrangler')) },
  // 塔維西‧雷矛：在一隻友方野獸攻擊後，從你的牌堆召喚一隻消耗少 (1) 的野獸
  BAR_038: { abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, effects: [fn('barTavish')] }] },
  // 辛多雷尋蹤者：盛怒：召喚四隻有突襲的 1/1 土狼
  WC_008: { abilities: frenzy(summon('CORE_T_HYENA', 4)) },
  // 水棲毒蛇：潛行。在你沒有其他手下時具有劇毒
  WC_015: { keywords: ['STEALTH'], auras: [{ scope: 'self', keywords: ['POISONOUS'], cond: { c: 'noOtherMinions' } }] },

  // ================================================================ 法師
  ...ranks('BAR_305', (r) => ({ abilities: play({ e: 'freeze', target: randomEnemy(r) }) })),
  // 清涼的泉水：抽 2 張牌，每抽到一張法術，回復 2 個法力水晶
  BAR_542: { abilities: play(fn('barSpringWater')) },
  // 魯莽學徒：戰吼：對所有敵人施放你的英雄能力
  BAR_544: { abilities: play(fn('barReckless')) },
  // 秘法發光體：不是一開始就在你牌堆中的牌消耗減少 (2)（但不會低於 1）
  BAR_545: { costAuras: [{ side: 'friendly', notStarting: true, add: -2, floor: 1 }] },
  // 野火：本場對戰中，你的英雄能力多造成 1 點傷害
  BAR_546: { abilities: play(fn('barWildfire')) },
  // 火眼莫德雷斯：戰吼：若你本場對戰中用英雄能力造成過 10 點傷害，對所有敵人造成 10 點傷害
  BAR_547: { abilities: play(fn('barMordresh')) },
  // 霜言：在你施放一張冰霜法術後，召喚一個會凍結的 1/1 元素
  BAR_888: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FROST' }, effects: [summon('BAR_888t')] }], tokens: ['BAR_888t'] },
  BAR_888t: { keywords: ['FREEZE_ON_DAMAGE'] },
  // 瓦登‧晨握：戰吼：凍結所有敵方手下；已經凍結的改為受到 4 點傷害
  BAR_748: { abilities: play(fn('barVarden')) },
  // 粉碎衝擊：消滅所有凍結的手下
  WC_041: { abilities: play({ e: 'destroy', target: { t: 'all', filter: { type: 'minion', side: 'any', frozen: true } } }) },
  // 霜紋地城冒險者：戰吼：抽一張法術；若是冰霜法術，召喚兩個會凍結的 1/1 元素
  WC_805: { abilities: play(fn('barDungeoneer', { school: 'FROST' })), tokens: ['BAR_888t'] },
  // 浮冰施法者：每有一個凍結的敵人，消耗減少 (2)
  WC_806: { costRule: { per: 'frozenEnemies', amount: 2 } },

  // ================================================================ 聖騎士
  // 救星駕到：奧秘：在你的對手一回合打出三張牌後，召喚一匹有嘲諷的 3/4 戰馬
  BAR_550: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyThirdCard' }, effects: [summon('BAR_550t')] }], tokens: ['BAR_550t'] },
  // 陣亡者之劍：在你的英雄攻擊後，從你的牌堆施放一個奧秘
  BAR_875: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [fn('coCastDeckSecret')] }] },
  // 火砲大師斯密瑟：戰吼：把你的奧秘變成 3/3 士兵，它們死亡時變回奧秘
  BAR_879: { abilities: play(fn('barSmythe')), tokens: ['BAR_879t'] },
  BAR_879t: { abilities: dr(fn('barSoldierBack')) },
  ...ranks('BAR_880', (r) => ({ abilities: play({ e: 'buff', target: randomFriendly(r), atk: 3 }) })),
  // 鼓舞人心的布道：使你手牌、牌堆與戰場上的所有手下獲得 +1/+1
  BAR_881: { abilities: play(fn('barSermon')) },
  // 凱瑞爾‧羅姆：突襲、聖盾。每當此手下攻擊，使你手牌中的神聖法術消耗減少 (1)
  BAR_902: { keywords: ['RUSH', 'DIVINE_SHIELD'], abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [fn('barHandDiscount', { school: 'HOLY', amount: 1, all: true })] }] },
  // 正義審判：奧秘：當一個敵方手下攻擊時，把它的攻擊力與生命值變成 1
  WC_033: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyMinionAttacks' }, effects: [{ e: 'setStats', target: { t: 'it' }, atk: 1, hp: 1 }] }] },
  // 集結！：召喚五個有隨機加成效果的 2/2 冒險者
  WC_034: { abilities: play(adventurer(), adventurer(), adventurer(), adventurer(), adventurer()), tokens: ADVENTURERS },

  // ================================================================ 牧師
  // 虛無鞭笞者：戰吼：你手牌中每有一張法術，對一個隨機敵方手下造成 1 點傷害
  BAR_307: { abilities: play(fn('barVoidFlayer')) },
  // 預卜者貨車：在你的回合開始時，把你對手牌堆中一張法術的複製加入你的手牌
  BAR_312: { abilities: atStartOfTurn(fn('barSoothsayer')) },
  ...ranks('BAR_314', (r) => ({ abilities: play({ e: 'damage', target: allEnemyMinions, amount: r, spell: true }) })),
  // 塞瑞娜‧血羽：戰吼：選擇一個敵方手下，從它身上偷取攻擊力與生命值，直到此手下比較高
  BAR_315: { target: { ...enemyMinion, optional: true }, abilities: play(fn('barSerena')) },
  // 賽瑞菈：戰吼：若你本回合恢復過生命值，對所有敵方手下造成等量的傷害
  BAR_735: { abilities: play(fn('barXyrella')) },
  // 虔誠地城冒險者：戰吼：抽一張法術；若是神聖法術，消耗減少 (2)
  WC_013: { abilities: play(fn('barDungeoneer', { school: 'HOLY' })) },
  // 挑戰驚奇：消滅所有攻擊力為奇數的手下
  WC_014: { abilities: play(fn('barOddDestroy')) },
  // 安希祭司：戰吼：若你本回合恢復過生命值，從你的牌堆發現一張法術
  WC_803: { abilities: play(cond({ c: 'healedThisTurn' }, [fn('barDiscoverDeckSpell')])) },

  // ================================================================ 盜賊
  // 油井伏擊者：戰吼：造成 2 點傷害；若這張牌本回合才加入你的手牌，改為造成 4 點
  BAR_316: { target: { ...anyChar, optional: true }, abilities: play(fn('barOilRig')) },
  // 現場接洽人：在你打出一張戰吼或連擊牌後，抽一張牌
  BAR_317: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('barFieldContact')] }] },
  // 銀葉草毒藥：使你的武器獲得「在你的英雄攻擊後，抽一張牌」
  BAR_318: { abilities: play(fn('barPoisonDraw')) },
  ...ranks('BAR_319', (r) => ({ target: anyChar, abilities: play(hit(2 * r)) })),
  // 高效率八足機器人：盛怒：使你手牌中的牌消耗減少 (1)
  BAR_320: { abilities: frenzy(fn('barHandDiscount', { amount: 1, all: true })) },
  // 麻痺毒藥：使你的武器 +1 攻擊力，並使「你的英雄在攻擊時免疫」
  BAR_321: { abilities: play({ e: 'weaponBuff', atk: 1 }, fn('barParalytic')) },
  // 豬牙匕首：在你打出一張毒藥後，獲得 +1 耐久度
  BAR_322: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'SPELL' }, effects: [fn('barShank')] }] },
  // 你的就是我的：發現一個英雄能力，把它的消耗變成 (0)；使用 2 次後換回來
  BAR_323: { abilities: play(fn('barYoink')) },
  // 藥劑師赫布瑞姆：戰吼與亡語：把一張隨機毒藥加入你的手牌
  BAR_324: { abilities: [...play(POISONS), ...dr(POISONS)] },
  // 史蓋伯斯‧油切：連擊：本回合你打出的下兩張牌消耗減少 (2)
  BAR_552: { abilities: play(cond({ c: 'combo' }, [fn('barScabbs')])) },
  // 隱蔽護罩：抽 2 個手下；本回合打出的獲得潛行直到你的下個回合
  WC_016: { abilities: play(fn('barShroud')) },
  // 美味變異點心：把雙方手牌中各一個手下變成海盜或潛行手下
  WC_017: { abilities: play(fn('barDeviate')) },

  // ================================================================ 薩滿
  // 魚擁而上：使你的手下獲得 +1/+1；你的魚人額外 +1/+1
  BAR_041: {
    abilities: play(
      { e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 1, hp: 1 },
      { e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', race: 'MURLOC' } }, atk: 1, hp: 1 },
    ),
  },
  ...ranks('BAR_044', (r) => ({ target: anyMinion, abilities: play(fn('barChain', { amount: r + 1 })) })),
  // 布魯坎：自然法術傷害 +3
  BAR_048: { flags: ['natureSpellDamage3'] },
  // 原始地城冒險者：戰吼：抽一張法術；若是自然法術，再抽一個元素
  WC_005: { abilities: play(fn('barDungeoneer', { school: 'NATURE' })) },
  // 不滅烈焰：對一個隨機敵方手下造成 3 點傷害；若它死亡，重新施放。超載：(1)
  WC_020: { overload: 1, abilities: play(fn('barPerpetual')) },

  // ================================================================ 術士
  // 靈魂撕裂：對所有手下造成 5 點傷害；每消滅一個，摧毀你牌堆中的一張牌
  BAR_911: { abilities: play(fn('barSoulRend')) },
  // 藥劑師貨車：在你的回合開始時，從你的牌堆召喚一個 1 費手下
  BAR_912: { abilities: atStartOfTurn({ e: 'recruit', count: 1, cost: 1 }) },
  // 火焰祭壇：摧毀雙方牌堆頂的 3 張牌
  BAR_913: { abilities: play(fn('barAltar')) },
  ...ranks('BAR_914', (r) => ({ abilities: play(summon('BAR_914t3', r)), tokens: ['BAR_914t3'] })),
  // 血岩裂片刺背野豬人：生命竊取。戰吼：若你的牌堆在 10 張以下，對一個手下造成 6 點傷害
  BAR_916: {
    keywords: ['LIFESTEAL'],
    target: { filter: { type: 'minion', side: 'any' }, optional: true, when: { c: 'deckSize', op: '<=', n: 10 } },
    abilities: play(cond({ c: 'deckSize', op: '<=', n: 10 }, [{ e: 'damage', target: { t: 'chosen' }, amount: 6 }])),
  },
  // 貧瘠之地拾荒者：嘲諷。在你的牌堆 10 張以下時消耗為 (1)
  BAR_917: { keywords: ['TAUNT'], costIf: { cond: { c: 'deckSize', op: '<=', n: 10 }, cost: 1 } },
  // 塔姆辛‧羅姆：每當你施放一張消耗 (1) 以上的暗影法術，把一張消耗 (0) 的複製加入你的手牌
  BAR_918: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'SHADOW' }, effects: [fn('barTamsin')] }] },
  // 尼爾魯‧火刃：戰吼：若你的牌堆是空的，開啟一個傳送門，每回合以 3/2 小鬼填滿你的戰場
  BAR_919: { abilities: play(cond({ c: 'deckEmpty' }, [summon('BAR_919t')])), tokens: ['BAR_919t', 'BAR_914t3'] },
  BAR_919t: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('barFillImps')] }], tokens: ['BAR_914t3'] },
  // 不穩定的暗影衝擊：對一個手下造成 6 點傷害，溢出的傷害會擊中你的英雄
  WC_021: { target: anyMinion, abilities: play(fn('barExcess', { amount: 6, to: 'self' })) },
  // 最後氣息：對一個手下造成 1 點傷害；若它死亡，召喚一個有隨機加成效果的 2/2 冒險者
  WC_022: { target: anyMinion, abilities: play(hit(1), fn('barIfDied', { then: 'adventurer' })), tokens: ADVENTURERS },
  // 竊魂魔：你每回合抽的第一張牌消耗生命值而非法力
  WC_023: { abilities: [{ on: { k: 'draw', side: 'friendly' }, effects: [fn('barStealer')] }] },

  // ================================================================ 戰士
  // 迴旋戰鬥者：戰吼與盛怒：對所有其他手下造成 1 點傷害
  BAR_840: { abilities: [...play({ e: 'damage', target: otherMinions, amount: 1 }), ...frenzy({ e: 'damage', target: otherMinions, amount: 1 })] },
  // 增肌重訓：使你手牌中一個隨機嘲諷手下獲得 +1/+1，並複製它
  BAR_841: { abilities: play(fn('barBulkUp')) },
  ...ranks('BAR_842', (r) => ({ abilities: play({ e: 'handBuff', atk: r, hp: r, scope: 'all' }) })),
  // 戰歌大使：盛怒：每有一個受傷的角色，獲得 +1 攻擊力
  BAR_843: { abilities: frenzy(fn('barEnvoy')) },
  // 偵查騎兵之斧：在你的英雄攻擊並消滅一個手下後，抽一張牌
  BAR_844: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, cond: { c: 'attackedMinion' }, effects: [fn('barOutrider')] }] },
  // 怨恨：對所有手下造成 2 點傷害，每消滅一個獲得 2 點護甲值
  BAR_845: { abilities: play(fn('barRancor')) },
  // 洛卡菈：突襲。在一個友方手下攻擊並存活後，使它獲得 +1/+1
  BAR_847: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, effects: [fn('barRokara')] }] },
  // 薩魯法爾霸王：戰吼：復活 2 個友方盛怒手下，對所有其他手下造成 1 點傷害
  BAR_334: { abilities: play(fn('barSaurfang'), { e: 'damage', target: otherMinions, amount: 1 }) },
  // 磨石斧：在你的英雄攻擊後，使你手牌中的一個手下獲得 +1 攻擊力
  WC_025: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [{ e: 'handBuff', atk: 1, hp: 0, scope: 'random' }] }] },

  // ================================================================ 惡魔獵人
  // 刺毛豬 / 剃刀沼澤獸王：亡語：從你的手牌召喚一個消耗 (3) / (4) 以下的亡語手下
  BAR_325: { abilities: dr(fn('summonFromHand', { deathrattle: true, maxCost: 3 })) },
  BAR_326: { abilities: dr(fn('summonFromHand', { deathrattle: true, maxCost: 4 })) },
  // 亡語者黑棘：戰吼：從你的牌堆召喚 3 個消耗 (5) 以下的亡語手下
  BAR_329: { abilities: play(fn('barBlackthorn')) },
  // 克圖斯‧灰殞：戰吼：攻擊最左邊與最右邊的敵方手下。流放：本回合免疫
  BAR_333: { abilities: play(cond({ c: 'outcast' }, [{ e: 'buff', target: { t: 'self' }, keywords: ['IMMUNE'], temp: true }]), fn('barKurtrus')) },
  // 火焰符印 / 沉默符印 / 召喚符印：在你的下個回合開始時……
  BAR_306: { abilities: play({ e: 'delayed', turns: 1, effects: [{ e: 'damage', target: allMinions, amount: 3, spell: true }] }) },
  BAR_705: { abilities: play({ e: 'delayed', turns: 1, effects: [{ e: 'silence', target: allEnemyMinions }] }) },
  WC_003: { abilities: play({ e: 'delayed', turns: 1, effects: [summon('WC_003t', 2)] }), tokens: ['WC_003t'] },
  ...ranks('BAR_891', (r) => ({ abilities: play({ e: 'heroAttack', amount: r + 1 }) })),
  // 腐心折磨者：嘲諷。你對手的法術消耗增加 (2)
  WC_040: { keywords: ['TAUNT'], costAuras: [{ side: 'enemy', type: 'SPELL', add: 2 }] },
};
