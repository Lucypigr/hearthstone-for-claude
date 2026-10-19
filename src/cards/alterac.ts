// ============================================================================
// 奧特蘭克山谷（Fractured in Alterac Valley，AV_，系列 1626）剩下的卡：榮譽擊殺、目標（持續 3 回合）、英雄卡……
// 解析器看不懂的卡在這裡手動定義；自訂效果（av 開頭）在 game.ts 的 customAlterac。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, HeroPowerSpec, TargetReq } from '../engine/types';
import { ANIMAL_COMPANIONS } from './lists';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
/** 榮譽擊殺：此手下（或你的英雄裝備這把武器時）在你的回合以剛好致命的傷害消滅一個手下 */
const hk = (...effects: Effect[]): Ability[] => [{ on: { k: 'honorableKill' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const selfBuff = (atk = 0, hp = 0, keywords?: Override['keywords']): Effect => ({ e: 'buff', target: { t: 'self' }, atk, hp, keywords });
const honorable: Condition = { c: 'honorableKill' };
const atEndOfTurn = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnEnd', whose: 'mine' }, effects }];
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allFriendlyMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'friendly' as const } };
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
/** 目標：持續 3 回合（abilities 是生效期間的觸發；空的 turnEnd 讓只有光環的目標也會被記錄） */
const objective = (...abilities: Ability[]): Override => ({
  objective: 3,
  abilities: [...play(fn('objective')), ...(abilities.length ? abilities : [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [] } as Ability])],
});
const hero = (battlecry: Effect[], heroPower: HeroPowerSpec, tokens: string[] = []): Override => ({ abilities: play(...battlecry), heroPower, tokens });
const IMPROVED_SECRETS = ['AV_113t1', 'AV_113t2', 'AV_113t3', 'AV_113t7', 'AV_113t8', 'AV_113t9'];
const INVOCATIONS = ['AV_258t', 'AV_258t2', 'AV_258t3', 'AV_258t4'];

export const ALTERAC_OVERRIDES: Record<string, Override> = {
  // ================================================================ 英雄卡
  // 獸巡者塔維西：戰吼：發現並施放 2 個強化的奧秘。英雄能力：召喚一個動物夥伴
  AV_113: hero([fn('avTavish'), fn('avTavish')], { effects: [fn('summonOneOf', { cards: ANIMAL_COMPANIONS })], needsBoardSpace: true }, [...IMPROVED_SECRETS, ...ANIMAL_COMPANIONS]),
  AV_113t1: { secret: true, abilities: [{ on: { k: 'secret', ev: 'heroAttacked' }, effects: [{ e: 'damage', target: allEnemies, amount: 3, spell: true }] }] },
  AV_113t2: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyMinionAttacks' }, effects: [{ e: 'returnToHand', target: { t: 'it' }, costChange: 4 }] }] },
  AV_113t3: { secret: true, abilities: [{ on: { k: 'secret', ev: 'minionAttacked' }, effects: [summon('AV_113t3t2', 3)] }], tokens: ['AV_113t3t2'] },
  AV_113t7: { secret: true, abilities: [{ on: { k: 'secret', ev: 'minionAttacked' }, effects: [fn('aoPackTactics'), fn('aoPackTactics')] }] },
  AV_113t8: {
    secret: true,
    abilities: [{ on: { k: 'secret', ev: 'turnStart' }, cond: { c: 'control', min: 2 }, effects: [fn('summonOneOf', { cards: ANIMAL_COMPANIONS }), fn('summonOneOf', { cards: ANIMAL_COMPANIONS })] }],
  },
  AV_113t9: { secret: true, abilities: [{ on: { k: 'secret', ev: 'enemyCastsSpell' }, effects: [fn('avIceTrap', { cost: 2 })] }] },
  // 博學者瓦登：戰吼：從你本場對戰施放過的每個法術派系重新施放一個法術。英雄能力：造成 @ 點傷害，榮譽擊殺時 +2
  AV_200: hero([fn('avDawngrasp')], { effects: [fn('avArcaneBurst')], target: { filter: { type: 'character', side: 'any' } } }),
  // 悍勇的洛卡菈：戰吼：裝備一把 5/2 的無堅不摧之力。英雄能力：造成 2 點傷害，榮譽擊殺時獲得 4 點護甲值
  AV_202: hero([{ e: 'equip', card: 'AV_202t2' }], { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }, cond(honorable, [{ e: 'armor', amount: 4 }])], target: { filter: { type: 'character', side: 'any' } } }, ['AV_202t2']),
  AV_202t2: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, cond: { c: 'attackedMinion' }, effects: [fn('avUnstoppable')] }] },
  // 裂魔者克圖斯：戰吼：召喚兩個有突襲的 @/4 惡魔（依你的英雄攻擊次數強化）。英雄能力：本回合 +2 攻擊力，友方手下攻擊後可以再次使用
  AV_204: hero([fn('avKurtrus')], { effects: [{ e: 'heroAttack', amount: 2 }] }, ['AV_204t2']),
  // 野性之心葛夫：戰吼：你的法力上限變成 20。獲得一個空的法力水晶。抽一張牌。英雄能力：二選一：抽一張牌；或獲得一個空的法力水晶
  AV_205: hero([fn('avGuff'), { e: 'mana', kind: 'empty', amount: 1 }, draw()], {
    effects: [],
    chooseOne: [
      { id: 'AV_205pb', effects: [draw()] },
      { id: 'AV_205a', effects: [{ e: 'mana', kind: 'empty', amount: 1 }] },
    ],
  }),
  // 光鑄凱瑞爾：戰吼：對所有敵人造成 2 點傷害。裝備一把 2/5 的無法撼動之物。英雄能力：使你手牌中一個隨機手下獲得 +4/+4
  AV_206: hero([{ e: 'damage', target: allEnemies, amount: 2 }, { e: 'equip', card: 'AV_146' }], { effects: [{ e: 'handBuff', atk: 4, hp: 4, scope: 'random' }] }, ['AV_146']),
  AV_146: { flags: ['immovableObject'] },
  // 虔信者賽瑞菈：戰吼：觸發本場對戰中死亡的每個友方手下的亡語。英雄能力：恢復 5 點生命值 / 造成 5 點傷害（每回合翻面）
  AV_207: hero([fn('avXyrella')], { effects: [fn('avHolyTouch')], target: { filter: { type: 'character', side: 'any' } } }),
  // 元素使布魯坎：戰吼：呼喚兩種元素的力量！英雄能力：每回合呼喚不同的元素
  AV_258: hero([fn('avBrukan')], { effects: [fn('avBrukanPower')] }, [...INVOCATIONS, 'AV_258t6']),
  AV_258t: { abilities: play(summon('AV_258t6', 2)), tokens: ['AV_258t6'] },
  AV_258t2: { abilities: play({ e: 'heal', target: { t: 'all', filter: { type: 'character', side: 'friendly' } }, amount: 6 }) },
  AV_258t3: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 6 }) },
  AV_258t4: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: 2 }) },
  // 恐懼巫妖塔姆辛：戰吼：對所有手下造成 3 點傷害。把 3 張裂隙洗入你的牌堆。抽 3 張牌。英雄能力：把一張裂隙洗入牌堆。抽一張牌
  AV_316: hero(
    [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 3 }, { e: 'shuffle', card: 'AV_316t4', count: 3 }, draw(3)],
    { effects: [{ e: 'shuffle', card: 'AV_316t4', count: 1 }, draw()] },
    ['AV_316t4'],
  ),
  AV_316t4: { castsWhenDrawn: true, abilities: play(summon('AV_316t')), tokens: ['AV_316t'] },

  // ================================================================ 中立
  // 德雷克塔爾：戰吼：若這張牌的消耗高於你牌堆中的每個手下，召喚其中一個
  AV_100: { abilities: play(fn('avDrekthar')) },
  // 雪盲鷹身人：戰吼：若你的手牌中有冰霜法術，獲得 5 點護甲值
  AV_112: { abilities: play(cond({ c: 'holdingSchool', school: 'FROST' }, [{ e: 'armor', amount: 5 }])) },
  // 地精士兵：榮譽擊殺：獲得 +2 攻擊力
  AV_121: { abilities: hk(selfBuff(2)) },
  // 下士：榮譽擊殺：使你的其他手下獲得聖盾
  AV_122: { abilities: hk({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, keywords: ['DIVINE_SHIELD'] }) },
  // 狡詐斥候：潛行。榮譽擊殺：你的下一次英雄能力消耗為 (0)
  AV_123: { keywords: ['STEALTH'], abilities: hk({ e: 'heroPowerDiscount', amount: 99 }) },
  // 恐狼指揮官：榮譽擊殺：召喚一隻有潛行的 2/2 霜狼
  AV_124: { abilities: hk(summon('AV_211t')), tokens: ['AV_211t'] },
  // 哨塔中士：戰吼：若你控制至少 2 個其他手下，獲得 +2/+2
  AV_125: { abilities: play(cond({ c: 'control', min: 2 }, [selfBuff(2, 2)])) },
  // 碉堡中士：戰吼：若你的對手有 2 個以上的手下，對所有敵方手下造成 1 點傷害
  AV_126: { abilities: play(cond({ c: 'control', side: 'enemy', min: 2 }, [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: 1 }])) },
  // 冰凍亡魄：每當你施放一張冰霜法術，獲得 +2/+2
  AV_127: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FROST' }, effects: [selfBuff(2, 2)] }] },
  // 凍結的長毛象：在你施放火焰法術之前處於凍結狀態
  AV_128: { abilities: [{ on: { k: 'summoned' }, effects: [fn('avMammoth')] }] },
  // 上尉騎士：戰吼：造成 3 點傷害。榮譽擊殺：獲得 +3/+3
  AV_131: { target: optional(anyChar), abilities: [...play(hit(3, false)), ...hk(selfBuff(3, 3))] },
  // 食人妖百夫長：突襲。榮譽擊殺：對敵方英雄造成 8 點傷害
  AV_132: { keywords: ['RUSH'], abilities: hk({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 8 }) },
  // 雷矛元帥：嘲諷。若你在對手的回合受到 5 點以上的傷害，消耗為 (1)
  AV_135: { keywords: ['TAUNT'], costIf: { cond: { c: 'tookOnOppTurn', n: 5 }, cost: 1 } },
  // 狗頭人監工：戰吼：把 2 張護甲碎塊加入你的手牌，它們可以使一個手下獲得 +2 生命值
  AV_136: { abilities: play({ e: 'addCard', card: 'AV_136t', count: 2, who: 'self' }), tokens: ['AV_136t'] },
  AV_136t: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, hp: 2 }) },
  // 深鐵穴居怪：在你的對手施放一張法術後，召喚另一個深鐵穴居怪
  AV_137: { abilities: [{ on: { k: 'spellCast', side: 'enemy' }, effects: [summon('AV_137')] }] },
  // 恐怖圖騰賞金獵人：戰吼：消滅一個敵方傳說手下
  AV_138: { target: optional({ filter: { type: 'minion', side: 'enemy', legendary: true } }), abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  // 憎惡體中尉：在你的回合結束時，吞噬一個隨機敵方手下並獲得它的屬性值
  AV_139: { abilities: atEndOfTurn(fn('avAbomination')) },
  // 冰雪之王洛克霍拉：突襲、風怒。若你的生命值在 15 以下，消耗減少 (5)
  AV_141t: { keywords: ['RUSH', 'WINDFURY'], costIf: { cond: { c: 'heroHealth', op: '<=', n: 15 }, cost: 5 } },
  // 森林之王伊弗斯：戰吼：花光你剩下的法力，每點隨機獲得 +2/+2、突襲、聖盾或嘲諷
  AV_142t: { abilities: play(fn('avIvus')) },
  // 血怒者科爾拉克：亡語：若此手下沒有被榮譽擊殺，重新召喚科爾拉克
  AV_143: { abilities: dr(cond({ c: 'not', cond: { c: 'wasHonorablyKilled' } }, [summon('AV_143')])) },
  // 偷襲專家：潛行。在你的對手打出一個手下後，攻擊它
  AV_238: { keywords: ['STEALTH'], abilities: [{ on: { k: 'cardPlayed', side: 'enemy', cardType: 'MINION' }, effects: [fn('avGankster')] }] },
  // 連發秘法師：戰吼：對所有其他手下造成 1 點傷害。若有手下死亡，重複此效果
  AV_222: { abilities: play(fn('avSpammy')) },
  // 范達爾·雷矛：戰吼：若這張牌的消耗低於你牌堆中的每個手下，使它們的消耗減少 (3)
  AV_223: { abilities: play(fn('avVanndar')) },
  // 反射工程師：戰吼：交換雙方手牌中所有手下的攻擊力與生命值
  AV_256: { abilities: play(fn('avReflecto')) },
  // 空軍指揮官穆維里克：突襲。你的手下具有「榮譽擊殺：召喚一隻有突襲的 2/2 蠍尾獅」
  AV_293: { keywords: ['RUSH'], flags: ['mulverick'], tokens: ['AV_293t'] },

  // ================================================================ 德魯伊
  // 開路者：戰吼：施放你上一張二選一法術的另一個選項
  AV_210: { abilities: play(fn('avPathmaker')) },
  // 恐怖的霜狼：潛行。亡語：召喚一隻有潛行的 2/2 霜狼
  AV_211: { keywords: ['STEALTH'], abilities: dr(summon('AV_211t')), tokens: ['AV_211t'] },
  // 怒爪精兵：戰吼：本回合使所有其他友方角色 +1 攻擊力
  AV_294: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, atk: 1, temp: true }, { e: 'heroAttack', amount: 1 }) },
  // 佔領冷齒礦坑：二選一：抽出你消耗最低的牌；或消耗最高的牌
  AV_295: {
    chooseOne: [
      { id: 'AV_295a', name: '騰出資源', text: '抽出你消耗最低的牌', abilities: play(fn('avDrawExtreme', { low: true })) },
      { id: 'AV_295b', name: '加派補給', text: '抽出你消耗最高的牌', abilities: play(fn('avDrawExtreme', { low: false })) },
    ],
  },
  // 驕傲求戰者：戰吼：你的下一張二選一卡消耗減少 (2)
  AV_296: { abilities: play({ e: 'pendingDiscount', d: { chooseOne: true, amount: 2 } }) },
  // 霜狼狼舍：在你的回合結束時，召喚一隻有潛行的 2/2 霜狼。持續 3 回合
  AV_360: { ...objective(...atEndOfTurn(summon('AV_211t'))), tokens: ['AV_211t'] },
  // ================================================================ 獵人
  // 發動陷阱：對一個手下造成 3 點傷害，並從你的牌堆施放一個奧秘。榮譽擊殺：施放 2 個
  AV_224: { target: anyMinion, abilities: play(hit(3), cond(honorable, [fn('coCastDeckSecret'), fn('coCastDeckSecret')], [fn('coCastDeckSecret')])) },
  // 覓血者：榮譽擊殺：獲得 +1/+1
  AV_244: { abilities: hk({ e: 'weaponBuff', atk: 1, dur: 1 }) },
  // 復活寵物：發現一隻本場對戰中死亡的友方野獸。召喚它
  AV_333: { abilities: play(fn('avRevivePet')) },
  // 雷矛戰鬥山羊：突襲。亡語：你的下一隻野獸消耗減少 (2)
  AV_334: { keywords: ['RUSH'], abilities: dr({ e: 'pendingDiscount', d: { race: 'BEAST', amount: 2 } }) },
  // 空軍指揮官艾克曼：戰吼：從你的牌堆召喚一隻野獸並使它獲得突襲。若它本回合消滅一個手下，重複此效果
  AV_336: { abilities: play(fn('avIchman')) },
  // 丹巴達爾碉堡：在你的回合結束時，抽一張奧秘並把它的消耗變成 (1)。持續 3 回合
  AV_147: objective(...atEndOfTurn(fn('avBunker'))),
  // ================================================================ 法師
  // 打冷顫的巫女：戰吼：使你手牌中消耗最高的法術消耗減少 (1)
  AV_114: { abilities: play(fn('avShivering')) },
  // 強化陣雪元素：戰吼：你的下一次英雄能力消耗為 (0) 並會凍結目標
  AV_115: { abilities: play({ e: 'heroPowerDiscount', amount: 99 }, fn('avPowerFreeze')) },
  // 秘法光輝：把你牌堆中一張 7、8、9 與 10 費法術的複製各加入你的手牌
  AV_116: { abilities: play(fn('avArcaneBrilliance')) },
  // 法力虹吸：造成 2 點傷害。榮譽擊殺：使你手牌中的法術消耗減少 (1)
  AV_212: { target: anyChar, abilities: play(hit(2), cond(honorable, [fn('avSpellDiscount', { amount: 1 })])) },
  // 製作雪人：召喚一個會凍結的 3/3 雪人。把「製作龐大雪人」加入你的手牌
  AV_282: { abilities: play(summon('AV_282t'), { e: 'addCard', card: 'AV_282t2', count: 1, who: 'self' }), tokens: ['AV_282t', 'AV_282t2'] },
  AV_282t: { keywords: ['FREEZE_ON_DAMAGE'] },
  AV_282t2: { abilities: play(summon('AV_282t3'), { e: 'addCard', card: 'AV_282t4', count: 1, who: 'self' }), tokens: ['AV_282t3', 'AV_282t4'] },
  AV_282t3: { keywords: ['FREEZE_ON_DAMAGE'] },
  AV_282t4: { abilities: play(summon('AV_282t5')), tokens: ['AV_282t5'] },
  AV_282t5: { keywords: ['FREEZE_ON_DAMAGE'] },
  // 大法師符文：對敵人施放共計 20 點法力的法師法術
  AV_283: { abilities: play(fn('avRuneOfArchmage')) },
  // 巴琳達‧石爐：戰吼：抽 2 張法術。把它們的消耗與此手下的屬性值交換
  AV_284: { abilities: play(fn('avBalinda')) },
  // 冰血哨塔：在你的回合結束時，從你的牌堆施放另一張法術。持續 3 回合
  AV_290: objective(...atEndOfTurn(fn('castFromDeck'))),
  // ================================================================ 聖騎士
  // 活力湧現：抽一個手下。為你的英雄恢復等同它消耗的生命值
  AV_213: { abilities: play(fn('avVitalitySurge')) },
  // 獨守大橋：賦予一個手下 +2/+1 與聖盾。它本回合具有生命竊取
  AV_338: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2, hp: 1, keywords: ['DIVINE_SHIELD'] }, { e: 'buff', target: { t: 'chosen' }, keywords: ['LIFESTEAL'], temp: true }) },
  // 聖殿騎士隊長：突襲。在此手下攻擊一個手下後，召喚一個有嘲諷的 5/5 防衛者
  AV_339: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, cond: { c: 'attackedMinion' }, effects: [summon('AV_342t')] }], tokens: ['AV_342t'] },
  // 銅翼飛龍：在你的回合結束時，對所有敵人造成 2 點傷害。榮譽擊殺：為你的英雄恢復 4 點生命值
  AV_340: { abilities: [...atEndOfTurn({ e: 'damage', target: allEnemies, amount: 2 }), ...hk({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 4 })] },
  // 騎兵號角：亡語：從你的手牌召喚消耗最低的手下
  AV_341: { abilities: dr(fn('summonFromHand', { lowest: true })) },
  // 濟弱扶傾：召喚一個有嘲諷的 5/5 防衛者。若你的英雄本回合受到過治療，再召喚一個
  AV_342: { abilities: play(summon('AV_342t'), cond({ c: 'heroHealed' }, [summon('AV_342t')])), tokens: ['AV_342t'] },
  // 石爐復仇者：戰吼：抽一張消耗 (3) 以下的法術。它本回合消耗為 (0)
  AV_343: { abilities: play(fn('avVindicator')) },
  // 丹巴達爾橋：在你召喚一個手下後，使它獲得 +2/+2。持續 3 回合
  AV_344: objective({ on: { k: 'summon', side: 'friendly' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2, hp: 2 }] }),
  // 血色十字軍賽丹：突襲。每當此手下獲得攻擊力或生命值，加倍（無論它在哪裡）
  AV_345: { keywords: ['RUSH'], flags: ['saidan'] },
  // ================================================================ 牧師
  // 解救：對一個手下造成 3 點傷害。榮譽擊殺：召喚一個它的全新 3/3 複製
  AV_315: { target: anyMinion, abilities: play(hit(3), cond(honorable, [fn('avDeliverance')])) },
  // 暗言術：噬：選擇一個手下。它從所有其他手下身上偷取 1 點生命值
  AV_324: { target: anyMinion, abilities: play(fn('avDevour')) },
  // 發光晶簇：在一個友方手下受到治療後，使它獲得 +2 攻擊力
  AV_326: { abilities: [{ on: { k: 'healed', subject: 'minion' }, effects: [fn('avGeode')] }] },
  // 祝禱：使一個手下獲得 +2 生命值，然後把它的攻擊力變成等同它的生命值
  AV_329: { target: anyMinion, abilities: play(fn('avBless')) },
  // 那魯的祝福：為所有角色恢復 3 點生命值。若有任何角色仍受傷，抽一張牌
  AV_330: { abilities: play({ e: 'heal', target: { t: 'all', filter: { type: 'character', side: 'any' } }, amount: 3 }, fn('avNaaru')) },
  // 納亞克·海克森：戰吼：取得一個敵方手下的控制權。亡語：把那個手下還回去
  AV_331: { target: optional(enemyMinion), abilities: [...play(fn('avNajakTake')), ...dr(fn('avNajakReturn'))] },
  // 雷矛急救站：在你的回合結束時，使你的手下獲得 +2 生命值。持續 3 回合
  AV_664: objective(...atEndOfTurn({ e: 'buff', target: allFriendlyMinions, hp: 2 })),
  // ================================================================ 盜賊
  // 落雪墓地：你的亡語觸發兩次。持續 3 回合
  AV_400: objective(),
  // 切腦者：榮譽擊殺：把你對手牌堆頂的牌的複製加入你的手牌
  AV_402: { abilities: hk(fn('avLobotomizer')) },
  // 瑟拉辛‧疾奔：戰吼：把你手牌與牌堆中的手下換成其他職業的手下，它們的消耗減少 (2)
  AV_403: { abilities: play(fn('avCerathine')) },
  // 違禁品藏匿處：重新打出 5 張本場對戰中你打出過的其他職業卡
  AV_405: { abilities: play(fn('avContraband')) },
  // 蠻爪豺狼人：突襲。本場對戰中每有一張非盜賊職業卡加入你的手牌，消耗減少 (1)
  AV_298: { keywords: ['RUSH'], costRule: { per: 'otherClassAdded', amount: 1 } },
  // 被遺忘者中尉：潛行。在你打出一個亡語手下後，變成它的 2/2 複製並具有突襲
  AV_601: { keywords: ['STEALTH'], abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION' }, cond: { c: 'itHasDeathrattle' }, effects: [fn('avForsaken')] }] },
  // 偵察：發現一個另一個職業的亡語手下。它的消耗減少 (2)
  AV_710: { abilities: play({ e: 'discover', pool: { type: 'MINION', hasDeathrattle: true, otherClass: true }, then: [{ e: 'costMod', amount: -2, scope: 'discovered' }] }) },
  // 雙面間諜：戰吼：若你的手牌中有另一個職業的卡，召喚此手下的一個複製
  AV_711: { abilities: play(cond({ c: 'holdingOtherClass' }, [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }])) },
  // ================================================================ 薩滿
  // 雪球大戰！：對一個手下造成 1 點傷害並凍結它。若它存活，對另一個手下重複此效果
  AV_250: { target: anyMinion, abilities: play(fn('avSnowball')) },
  // 作弊狗頭人：在一個敵人被凍結後，對它造成 3 點傷害
  AV_251: { flags: ['cheatySnobold'] },
  // 熊爵葛拉席爾：戰吼：本場對戰中你每施放過一張冰霜法術，就召喚一個會凍結的 3/4 元素
  AV_257: { abilities: play({ e: 'repeat', times: { dyn: 'frostSpellsCast' }, effects: [summon('AV_257t')] }), tokens: ['AV_257t'] },
  AV_257t: { keywords: ['FREEZE_ON_DAMAGE'] },
  // 寒霜之咬：造成 3 點傷害。榮譽擊殺：你對手的下一張法術消耗增加 (2)
  AV_259: { target: anyChar, abilities: play(hit(3), cond(honorable, [{ e: 'spellTax', amount: 2 }])) },
  // 蠻爪洞穴：在你的回合結束時，召喚一個會凍結的 3/4 元素。持續 3 回合
  AV_268: { ...objective(...atEndOfTurn(summon('AV_257t'))), tokens: ['AV_257t'] },
  // ================================================================ 術士
  // 毀滅種子：把四張裂隙洗入你的牌堆。抽到時召喚一個 3/3 的恐怖小鬼
  AV_277: { abilities: play({ e: 'shuffle', card: 'AV_316t4', count: 4 }), tokens: ['AV_316t4'] },
  // 魔火引爆！：抽一張法術並對所有敵人造成 2 點傷害。若是邪能法術，多造成 1 點
  AV_281: { abilities: play(fn('avFelfire')) },
  // 邪惡綻放：造成 5 點傷害，隨機分配到所有敵方手下身上。本回合可以重複施放
  AV_285: { keywords: ['ECHO'], abilities: play({ e: 'splitDamage', filter: { type: 'minion', side: 'enemy' }, amount: 5, spell: true }) },
  // 惡魔行者：嘲諷。戰吼：施放你手牌中消耗最高的邪能法術
  AV_286: { keywords: ['TAUNT'], abilities: play(fn('avFelwalker')) },
  // 毀墓者：戰吼：選擇你手牌中的一張邪能法術。獲得它的一張複製
  AV_308: { abilities: play(fn('avGraveDefiler')) },
  // 獻祭召喚師：戰吼：消滅一個友方手下。從你的牌堆召喚一個消耗多 (1) 的手下
  AV_312: { target: { filter: { type: 'minion', side: 'friendly', excludeSelf: true }, optional: true }, abilities: play(fn('avSacrificial')) },
  // 空腹憎惡體：戰吼：對所有敵方手下造成 1 點傷害。榮譽擊殺：獲得那個手下的攻擊力
  AV_313: { abilities: [...play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: 1 }), ...hk(fn('avHollow'))] },
  // 塔姆辛的骨匣：發現一個本場對戰中死亡的友方亡語手下。使你的手下獲得它的亡語
  AV_317: { abilities: play(fn('avPhylactery')) },
  // 遭到褻瀆的墳場：在你的回合結束時，消滅你攻擊力最低的手下來召喚一個 4/4 幽影。持續 3 回合
  AV_657: { ...objective(...atEndOfTurn(fn('avDesecrated'))), tokens: ['AV_657t'] },
  // ================================================================ 戰士
  // 冰凍之盾：獲得 10 點護甲值。在你的下個回合開始時，失去 5 點護甲值
  AV_109: { abilities: play({ e: 'armor', amount: 10 }, { e: 'delayed', turns: 1, effects: [fn('avLoseArmor', { amount: 5 })] }) },
  // 支援前線！：本回合你的手下消耗減少 (2)（但不會低於 1）
  AV_119: { abilities: play(fn('avToTheFront')) },
  // 加爾凡加上尉：戰吼：若你本場對戰中獲得過 15 點以上的護甲值，獲得 +3/+3 與衝鋒
  AV_145: { abilities: play(cond({ c: 'armorGainedGame', n: 15 }, [selfBuff(3, 3, ['CHARGE'])])) },
  // 冰血要塞：在你的回合結束時，對所有手下造成 1 點傷害。持續 3 回合
  AV_660: objective(...atEndOfTurn({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 1 })),
  // 持斧狂戰士：突襲。榮譽擊殺：抽一把武器
  AV_565: { keywords: ['RUSH'], abilities: hk({ e: 'draw', count: 1, who: 'self', pool: { type: 'WEAPON' } }) },
  // 發狂的角鷹獸：突襲。榮譽擊殺：獲得風怒
  AV_215: { keywords: ['RUSH'], abilities: hk(selfBuff(0, 0, ['WINDFURY'])) },
  // ================================================================ 惡魔獵人
  // 懼牢戰刃：榮譽擊殺：對敵方英雄造成等同你英雄攻擊力的傷害
  AV_209: { abilities: hk(fn('avDreadprison')) },
  // 鎖鍊看守者：嘲諷。戰吼：若你的手牌中有消耗 (5) 以上的惡魔，獲得 +1/+2
  AV_262: { keywords: ['TAUNT'], abilities: play(cond({ c: 'holding', race: 'DEMON', minCost: 5 }, [selfBuff(1, 2)])) },
  // 清算符印：在你的下個回合開始時，從你的手牌召喚一個隨機惡魔
  AV_264: { abilities: play({ e: 'delayed', turns: 1, effects: [fn('summonFromHand', { race: 'DEMON' })] }) },
  // 凱莉亞‧魔魂：戰吼：變形成你牌堆中一個惡魔的 6/6 複製
  AV_267: { abilities: play(fn('avBecomeDeckCopy', { race: 'DEMON', atk: 6, hp: 6 })) },
  // 夾擊戰法：召喚一個有突襲的 4/2 惡魔。若它本回合死亡，再召喚一個
  AV_269: { abilities: play(fn('avFlanking')), tokens: ['AV_269t'] },
  // 征戰平原：你的手下 +1 攻擊力。持續 3 回合
  AV_661: objective(),
  // 榮耀追逐者：在你打出一個嘲諷手下後，抽一張牌
  AV_321: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION', keyword: 'TAUNT' }, effects: [draw()] }] },
};
