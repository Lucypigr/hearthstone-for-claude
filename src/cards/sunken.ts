// ============================================================================
// 探險沉沒之城（Voyage to the Sunken City）：疏浚、巨型、深淵詛咒、沉沒的卡、納迦……
// 解析器看不懂的卡在這裡手動定義；自訂效果（sk 開頭）在 game.ts 的 customSunken。
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
/** 疏浚：看你牌堆底部的 3 張牌，把其中一張放到牌堆頂；then = 之後對那張牌做的事（見 game.ts 的 skDredge） */
const dredge = (then?: string, args: Record<string, unknown> = {}): Effect => fn('skDredge', { then, ...args });
/** 把一張「沉沒」的卡放到你牌堆底部 */
const sunk = (card: string): Effect => fn('skBottom', { card });
const curse: Effect = fn('skCurse');
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const enemyChar: TargetReq = { filter: { type: 'character', side: 'enemy' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const enemyMinions = { type: 'minion' as const, side: 'enemy' as const };
/** 在持有這張牌時施放過法術 / 打出過納迦（記錄在手牌上） */
const holdSpell: Ability[] = [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('wzHeldSpell')] }];
const holdNaga: Ability[] = [{ on: { k: 'cardPlayed', side: 'friendly', race: 'NAGA' }, effects: [fn('wzHeldSpell')] }];
const holdSchool = (school: string): Ability[] => [{ on: { k: 'spellCast', side: 'friendly', school }, effects: [fn('wzHeldSpell')] }];
const held = (n = 1): Condition => ({ c: 'heldCount', n });
const limbs = (base: string, n: number, ids?: string[]) => ids ?? [base + 't', ...Array.from({ length: n - 1 }, (_, i) => `${base}t${i + 2}`)];

export const SUNKEN_OVERRIDES: Record<string, Override> = {
  // ================================================================ 中立
  // 鱗片精英潛水員 / 鵜鶘潛水員 / 跳板潛水員：休眠 1 個回合
  TSC_007: { keywords: ['RUSH'], flags: ['immuneAttacking'], abilities: play(fn('pdDormantSelf', { turns: 1 })) },
  TSC_013: { keywords: ['RUSH', 'POISONOUS'], abilities: play(fn('pdDormantSelf', { turns: 1 })) },
  TSC_647: { keywords: ['RUSH'], abilities: play(fn('pdDormantSelf', { turns: 1 })) },
  // 巴巴納迦：戰吼：若你在持有這張牌時施放過法術，造成 3 點傷害
  TSC_017: { handAbilities: holdSpell, target: { ...optional(anyChar), when: held() }, abilities: play(cond(held(), [{ e: 'damage', target: { t: 'chosen' }, amount: 3 }])) },
  // 蠻族女巫：嘲諷。戰吼：交換雙方玩家手牌中一張隨機法術的消耗
  TSC_020: { keywords: ['TAUNT'], abilities: play(fn('skSwapSpellCosts')) },
  // 劍聖奧卡尼：戰吼：秘密選擇反制你對手打出的下一個手下或法術
  TSC_032: { abilities: play(fn('skOkani')), tokens: ['TSC_032t', 'TSC_032t2'] },
  TSC_032t: {},
  TSC_032t2: {},
  // 學校老師：戰吼：把一個 1/1 納迦幼體加入你的手牌，發現一張消耗 (3) 以下的法術教它
  TSC_052: { abilities: play(fn('skSchoolTeacher')), tokens: ['TSC_052t'] },
  TSC_052t: { abilities: play(fn('wzFairySlime')) },
  // 滑動的死亡之鱗：戰吼：若你在持有這張牌時施放過三張法術，對所有敵人造成 3 點傷害
  TSC_064: { handAbilities: holdSpell, abilities: play(cond(held(3), [{ e: 'damage', target: allEnemies, amount: 3 }])) },
  // 菲林大使：戰吼：把 3 個巨型手下放在你牌堆底部
  TSC_067: { abilities: play(fn('skFaelin')) },
  // 深淵融合怪：戰吼：選擇一個友方手下。發現一個同種族的手下
  TSC_069: { target: optional(friendlyMinion), abilities: play(fn('skAmalgam')) },
  // 暴風捲巡洋艦：突襲。亡語：召喚兩個消耗 (3) 以下的隨機機械
  TSC_645: { keywords: ['RUSH'], abilities: dr({ e: 'summonRandom', pool: { type: 'MINION', race: 'MECHANICAL', maxCost: 3, anyClass: true }, count: 2, who: 'self' }) },
  // 艾希‧暴風捲：戰吼：選擇一個友方機械。召喚一個有突襲、風怒與聖盾的它的複製
  TSC_649: { target: optional({ filter: { type: 'minion', side: 'friendly', race: 'MECHANICAL' } }), abilities: play(fn('skIni')) },
  // 食人魚群：突襲。在你召喚一隻食人魚群後，獲得 +1 攻擊力
  TSC_638: { keywords: ['RUSH'], abilities: [{ on: { k: 'summon', side: 'friendly' }, cond: { c: 'itNameIncludes', s: 'Piranha Swarmer' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 1 }] }] },
  // 礁石行者：戰吼與亡語：召喚一隻 1/1 食人魚群
  TSC_640: { abilities: [...play(summon('TSC_638')), ...dr(summon('TSC_638'))] },
  // 艾薩拉女王：戰吼：若你在持有這張牌時施放過三張法術，選擇一件上古聖物
  TSC_641: { handAbilities: holdSpell, abilities: play(cond(held(3), [fn('skAzshara')])), tokens: ['TSC_641ta', 'TSC_641tb', 'TSC_641tc', 'TSC_641td'] },
  TSC_641ta: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skRing')] }] },
  TSC_641tb: { abilities: play(fn('skHornOfAncients')) },
  TSC_641tc: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skXalatath')] }] },
  TSC_641td: { abilities: play(fn('skTidestone')) },
  // 鹹水書記：戰吼：你打出的下一張法術消耗減少 (1)
  TSC_823: { abilities: play({ e: 'pendingDiscount', d: { amount: 1, type: 'SPELL' } }) },
  // 碎爪執法者：戰吼：若你在持有這張牌時施放過法術，抽一張納迦
  TSC_826: { handAbilities: holdSpell, abilities: play(cond(held(), [draw(1, { type: 'MINION', race: 'NAGA' })])) },
  // 納迦巨人：本場對戰中你每在法術上花費 1 點法力，消耗減少 (1)
  TSC_829: { costRule: { per: 'spellManaSpent', amount: 1 } },
  // 海導芬利爵士：戰吼：用你牌堆底部的牌交換你的手牌
  TSC_908: { abilities: play(fn('skFinley')) },
  // 長牙拖網漁夫：戰吼：疏浚
  TSC_909: { abilities: play(dredge()) },
  // 挖掘專家：戰吼：疏浚。使其消耗減少 (1)
  TSC_911: { abilities: play(dredge('discount', { n: 1 })) },
  // 艾薩拉哨兵：嘲諷。亡語：把一個「沉沒哨兵」放在你牌堆底部
  TSC_919: { keywords: ['TAUNT'], abilities: dr(sunk('TSC_919t')), tokens: ['TSC_919t'] },
  TSC_919t: { keywords: ['DIVINE_SHIELD', 'TAUNT', 'LIFESTEAL'] },
  // 泡泡魚：在此手下受到剛好 1 點傷害後，消滅它（啵！）
  TID_713: { abilities: [{ on: { k: 'damaged', subject: 'self' }, cond: { c: 'eventAmount', n: 1 }, effects: [fn('skBubbler')] }] },
  // 快照龍：戰吼：使你牌堆中所有戰吼手下獲得 +1/+1
  TID_710: { abilities: play(fn('skSnapdragon')) },
  // 奧祖瑪特：巨型 +6。亡語：奧祖瑪特每有一條觸手，就消滅一個隨機敵方手下
  TID_711: { colossal: { limbs: limbs('TID_711', 6) }, tokens: limbs('TID_711', 6), abilities: dr(fn('skOzumat')) },
  ...Object.fromEntries(limbs('TID_711', 6).map((id) => [id, {}])),
  // 海潮獵人涅普圖隆：巨型 +2、突襲、風怒。每當涅普圖隆攻擊，若你控制任何巨手，改由它們攻擊
  TID_712: { keywords: ['RUSH', 'WINDFURY'], colossal: { limbs: ['TID_712t', 'TID_712t2'] }, tokens: ['TID_712t', 'TID_712t2'], flags: ['neptulon'] },
  TID_712t: { flags: ['immuneAttacking'] },
  TID_712t2: { flags: ['immuneAttacking'] },
  // 盤牙束縛者：戰吼：看你對手手牌中的 3 張牌並選擇一張。它下個回合無法被打出
  TID_744: { abilities: play(fn('skCoilfang')) },

  // ================================================================ 死亡騎士（此系列沒有）
  // ================================================================ 惡魔獵人
  // 多重打擊：本回合使你的英雄 +2 攻擊力。可以多攻擊一個敵方手下
  TSC_006: { abilities: play({ e: 'heroAttack', amount: 2 }, fn('skMultiStrike')) },
  // 艾薩拉叛逃者：突襲。亡語：把一個「沉沒叛逃者」放在你牌堆底部
  TSC_057: { keywords: ['RUSH'], abilities: dr(sunk('TSC_057t')), tokens: ['TSC_057t'] },
  TSC_057t: { keywords: ['CHARGE'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [{ e: 'damage', target: { t: 'random', filter: enemyMinions, count: 1 }, amount: 5 }] }] },
  // 掠食：造成 2 點傷害。若你在持有這張牌時打出過納迦，消耗為 (0)
  TSC_058: { handAbilities: holdNaga, costIf: { cond: { c: 'heldSpell' }, cost: 0 }, target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }) },
  // 絲忒諾女士：攻擊時免疫。在你施放一個法術後，攻擊生命值最低的敵人
  TSC_218: { flags: ['immuneAttacking'], abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skStheno')] }] },
  // 深淵的希拉格：巨型 +4。在你的回合開始時，希拉格的觸柄傷害 +1
  TSC_219: { colossal: { limbs: limbs('TSC_219', 4) }, tokens: limbs('TSC_219', 4), abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('skXhilagGrow')] }] },
  ...Object.fromEntries(limbs('TSC_219', 4).map((id) => [id, { abilities: endTurn(fn('skStalk')) }])),
  // 深淵之底：抽你消耗最低的兩個手下
  TSC_608: { abilities: play(fn('skLowestMinions', { n: 2 })) },
  // 盤牙指揮官：嘲諷。戰吼：若你在持有這張牌時施放過三張法術，召喚兩個此手下的複製
  TSC_609: { keywords: ['TAUNT'], handAbilities: holdSpell, abilities: play(cond(held(3), [{ e: 'summonCopy', target: { t: 'self' }, count: 2 }])) },
  // 混亂的先驅：生命竊取。戰吼：若你在持有這張牌時施放過邪能法術，獲得突襲
  TID_706: { keywords: ['LIFESTEAL'], handAbilities: holdSchool('FEL'), abilities: play(cond(held(), [{ e: 'buff', target: { t: 'self' }, keywords: ['RUSH'] }])) },
  // 推倒神像：疏浚。揭露它並對所有手下造成等同其消耗的傷害
  TID_703: { abilities: play(dredge('topple')) },
  // 骨刃：戰吼：疏浚
  TSC_915: { abilities: play(dredge()) },

  // ================================================================ 德魯伊
  // 潮汐之靈：若你在回合結束時有剩餘的法力，獲得 +1/+2
  TID_000: { abilities: endTurn(cond({ c: 'unspentMana' }, [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 2 }])) },
  // 月光：對一個敵人造成 1 點傷害，兩次
  TID_001: { target: enemyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 1, spell: true }, { e: 'damage', target: { t: 'chosen' }, amount: 1, spell: true }) },
  // 自然先驅：戰吼：若你在持有這張牌時施放過自然法術，使你的其他手下獲得 +1/+1
  TID_002: { handAbilities: holdSchool('NATURE'), abilities: play(cond(held(), [{ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', excludeSelf: true } }, atk: 1, hp: 1 }])) },
  // 克拉克：巨型 +1。當你控制克拉克的殼時免疫
  TSC_026: { colossal: { limbs: ['TSC_026t'] }, tokens: ['TSC_026t'], flags: ['colaque'] },
  TSC_026t: { keywords: ['TAUNT'], abilities: dr({ e: 'armor', amount: 8 }) },
  // 海藻打擊：對一個手下造成 4 點傷害。若你在持有這張牌時打出過納迦，本回合也使你的英雄 +4 攻擊力
  TSC_651: { handAbilities: holdNaga, target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 4, spell: true }, cond(held(), [{ e: 'heroAttack', amount: 4 }])) },
  // 綠手指園丁：戰吼：重新整理等同你手牌中消耗最高的法術消耗的空法力水晶
  TSC_652: { abilities: play(fn('skGardener')) },
  // 底棲食客：亡語：把一張永久 +2/+2 的底棲食客放在你牌堆底部
  TSC_653: { abilities: dr(fn('skBottomfeeder')) },
  // 水棲形態：疏浚。若你在本回合有足夠的法力打出那張牌，抽它
  TSC_654: { abilities: play(dredge('drawIfAfford')) },
  // 奇蹟成長：抽 3 張牌。召喚一株屬性值等同你手牌數的嘲諷植物
  TSC_656: { abilities: play(draw(3), fn('skMiracleGrowth')), tokens: ['TSC_656t'] },
  TSC_656t: { keywords: ['TAUNT'] },
  // 打瞌睡的海藻守護者：突襲。開始時休眠。在你施放了 5 點法力的法術後甦醒
  TSC_657: { keywords: ['RUSH', 'DORMANT'], flags: ['kelpkeeper'] },
  // 異端海德拉：戰吼：你在持有這張牌時每施放一張法術，召喚一個與其消耗相同的手下
  TSC_658: { handAbilities: holdSpell, abilities: play(fn('skHedra')) },
  // 艾薩拉花園：使你手牌中所有手下獲得 +1/+1。把一個「沉沒花園」放在你牌堆底部
  TSC_927: { abilities: play({ e: 'handBuff', atk: 1, hp: 1, scope: 'all' }, sunk('TSC_927t')), tokens: ['TSC_927t'] },
  TSC_927t: { abilities: play(fn('skGardens')) },

  // ================================================================ 獵人
  // 遠古海妖剋星：戰吼：若你在持有這張牌時施放過三張法術，造成 5 點傷害
  TID_074: { handAbilities: holdSpell, target: { ...optional(anyChar), when: held(3) }, abilities: play(cond(held(3), [{ e: 'damage', target: { t: 'chosen' }, amount: 5 }])) },
  // 貝殼射擊：對一個隨機敵方手下造成 3 點傷害。以少 1 點的傷害重複
  TID_075: { abilities: play(fn('skShellshot')) },
  // K9-0號：戰吼：疏浚。若它是 1 費手下，召喚它
  TID_099: { abilities: play(dredge('summonIfCost', { cost: 1 })) },
  // 倒刺網：對一個敵人造成 2 點傷害。若你在持有這張牌時打出過納迦，選擇第二個目標
  TSC_023: { handAbilities: holdNaga, target: enemyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }, cond(held(), [fn('skSecondTarget', { amount: 2 })])) },
  // 魚叉槍：在你的英雄攻擊後，疏浚。若它是野獸，使其消耗減少 (2)
  TSC_070: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [dredge('discountRace', { race: 'BEAST', n: 2 })] }] },
  // 雙弓恐鞭蛇：戰吼：若你在持有這張牌時施放過法術，你的下一張法術施放兩次
  TSC_071: { handAbilities: holdSpell, abilities: play(cond(held(), [fn('skNextSpellTwice')])) },
  // 海螺的呼喚：抽一張納迦與一張法術
  TSC_072: { abilities: play(draw(1, { type: 'MINION', race: 'NAGA' }), draw(1, { type: 'SPELL' })) },
  // 拉傑‧納贊：在你施放一個法術後，對敵方英雄造成等同其消耗的傷害
  TSC_073: { abilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: { dyn: 'itCost' } }] }] },
  // 緊急應變：奧秘：當一個友方手下死亡時，召喚一個它的複製。它休眠 1 個回合
  TSC_929: { secret: true, abilities: [{ on: { k: 'secret', ev: 'friendlyMinionDies' }, effects: [fn('skManeuvers', { n: 1 })] }] },
  // 艾薩拉軍刀：突襲。亡語：把一個「沉沒軍刀」放在你牌堆底部
  TSC_945: { keywords: ['RUSH'], abilities: dr(sunk('TSC_945t')), tokens: ['TSC_945t'] },
  TSC_945t: { keywords: ['RUSH'], abilities: dr({ e: 'recruit', count: 1, race: 'BEAST' }) },
  // 海膽尖刺：本回合你的法術具有劇毒
  TSC_946: { abilities: play(fn('skUrchin')) },
  // 納迦的驕傲：召喚兩隻 2/2 獅子魚。若你在持有這張牌時打出過納迦，使它們獲得 +1/+1
  TSC_947: { handAbilities: holdNaga, abilities: play(fn('skNagasPride')), tokens: ['TSC_947t'] },
  TSC_947t: {},
  // 九頭龍：巨型 +2。戰吼：使你的九頭龍頭部獲得突襲
  TSC_950: { colossal: { limbs: ['TSC_950t', 'TSC_950t2'] }, tokens: ['TSC_950t', 'TSC_950t2'], abilities: play(fn('skHydraHeadsRush')) },
  TSC_950t: { abilities: dr(fn('skHydraHead')) },
  TSC_950t2: { abilities: dr(fn('skHydraHead')) },

  // ================================================================ 法師
  // 沉沒的太空岩：亡語：把兩張奧術法師法術加入你的手牌。它們是暫時的
  TID_707: { abilities: dr(fn('skSpacerock')) },
  // 變形術：水母：把一個手下變形成有法術傷害 +2 的 4/1 水母
  TID_708: { target: anyMinion, abilities: play({ e: 'transform', target: { t: 'chosen' }, card: 'TID_708t' }), tokens: ['TID_708t'] },
  TID_708t: { spellDamage: 2 },
  // 納茲佳女士：在你的手牌中時，在你施放火焰、冰霜或奧術法術後變形
  TID_709: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skNazjar')] }], tokens: ['TID_709t', 'TID_709t2', 'TID_709t3'] },
  TID_709t: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skNazjar')] }], abilities: play(fn('tnHandCost', { type: 'SPELL', amount: -1 })) },
  TID_709t2: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skNazjar')] }], target: optional(enemyMinion), abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5 }, { e: 'damage', target: { t: 'adjacent', of: 'chosen' }, amount: 2 }) },
  TID_709t3: { handAbilities: [{ on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skNazjar')] }], abilities: play({ e: 'armor', amount: 8 }) },
  // 召喚結界見荒蕪之地
  // 海床傳送門：抽一張機械。使你手牌中的機械消耗減少 (1)
  TSC_055: { abilities: play(draw(1, { type: 'MINION', race: 'MECHANICAL' }), fn('skMechDiscount')) },
  // 火山之力：選擇一個手下。它死亡時，對所有其他手下造成 3 點傷害
  TSC_056: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, amount: 3 }) }) },
  // 法術捲蛇：戰吼：若你在持有這張牌時施放過法術，發現一張法術
  TSC_643: { handAbilities: holdSpell, abilities: play(cond(held(), [discover({ type: 'SPELL' })])) },
  // 戰壕勘測員：戰吼：疏浚。若它是機械，抽它
  TSC_642: { abilities: play(dredge('drawIfRace', { race: 'MECHANICAL' })) },
  // 惡毒鞭笞海妖：在你打出一個納迦後，重新整理兩個法力水晶（然後切換成法術！）
  TSC_620: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly', race: 'NAGA' }, effects: [fn('skSiren', { naga: true })] }, { on: { k: 'spellCast', side: 'friendly' }, effects: [fn('skSiren', { naga: false })] }] },
  // 艾薩拉清掃者：戰吼：把一個「沉沒清掃者」放在你牌堆底部
  TSC_776: { abilities: play(sunk('TSC_776t')), tokens: ['TSC_776t'] },
  TSC_776t: { abilities: play(fn('skSweeper')) },
  // 席瓦拉指揮官：戰吼：若你在持有這張牌時施放過三張法術，把那些法術加回你的手牌
  TSC_087: { handAbilities: holdSpell, abilities: play(cond(held(3), [fn('skSivara')])) },
  // 蓋亞：巨型 +2。在一個友方機械攻擊後，對所有敵人造成 1 點傷害
  TSC_029: {
    colossal: { limbs: ['TSC_029t', 'TSC_029t2'] },
    tokens: ['TSC_029t', 'TSC_029t2'],
    abilities: [{ on: { k: 'attack', subject: 'friendlyMinion', after: true }, cond: { c: 'itRace', race: 'MECHANICAL' }, effects: [{ e: 'damage', target: allEnemies, amount: 1 }] }],
  },
  TSC_029t: { keywords: ['RUSH'] },
  TSC_029t2: { keywords: ['RUSH'] },

  // ================================================================ 聖騎士
  // 光線：嘲諷。本場對戰中你每打出一張聖騎士卡，消耗減少 (1)
  TID_077: { keywords: ['TAUNT'], costRule: { per: 'classCardsPlayed', amount: 1 } },
  // 密爾米頓：在你對此手下施放一張法術後，抽一張牌
  TID_098: { abilities: [{ on: { k: 'spellTarget' }, effects: [draw(1)] }] },
  // 前線：從雙方玩家的牌堆各召喚一個手下。重複直到任一方的戰場已滿
  TID_949: { abilities: play(fn('skFrontLines')) },
  // 利維坦：巨型 +1。突襲、聖盾。在此手下攻擊後，疏浚
  TSC_030: { keywords: ['RUSH', 'DIVINE_SHIELD'], colossal: { limbs: ['TSC_030t2'] }, tokens: ['TSC_030t2'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [dredge()] }] },
  TSC_030t2: { keywords: ['RUSH', 'DIVINE_SHIELD'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, effects: [draw(1)] }] },
  // 微光太陽魚：戰吼：若你持有神聖法術，獲得嘲諷與聖盾
  TSC_060: { abilities: play(cond({ c: 'holdingSchool', school: 'HOLY' }, [{ e: 'buff', target: { t: 'self' }, keywords: ['TAUNT', 'DIVINE_SHIELD'] }])) },
  // 花園的恩典：使一個手下獲得 +4/+4 與聖盾。本場對戰中你每在神聖法術上花費 1 點法力，消耗減少 (1)
  TSC_061: { costRule: { per: 'holyManaSpent', amount: 1 }, target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 4, hp: 4, keywords: ['DIVINE_SHIELD'] }) },
  // 柯托莉‧光刃：在你對此手下施放神聖法術後，對另一個友方手下再施放一次
  TSC_074: { abilities: [{ on: { k: 'spellTarget' }, effects: [fn('skKotori')] }] },
  // 雷達偵測器：掃描你牌堆底部的 5 張牌。抽其中所有的機械，然後洗牌
  TSC_079: { abilities: play(fn('skRadar')) },
  // 海床救星：戰吼：疏浚。若它是手下，使其獲得此手下的攻擊力與生命值
  TSC_083: { abilities: play(dredge('giveStats')) },
  // 艾薩拉捕月者：聖盾。戰吼：把一個「沉沒捕月者」放在你牌堆底部
  TSC_644: { keywords: ['DIVINE_SHIELD'], abilities: play(sunk('TSC_644t')), tokens: ['TSC_644t'] },
  TSC_644t: { keywords: ['DIVINE_SHIELD'], abilities: play({ e: 'summonCopy', target: { t: 'self' }, count: 1 }) },
  // 神聖壽司卷：恢復 2 點生命值。本回合可以重複
  TSC_952: { keywords: ['ECHO'], target: anyChar, abilities: play({ e: 'heal', target: { t: 'chosen' }, amount: 2 }) },

  // ================================================================ 牧師
  // 光之先驅：戰吼：若你在持有這張牌時施放過神聖法術，為所有友方角色恢復 6 點生命值
  TID_085: { handAbilities: holdSchool('HOLY'), abilities: play(cond(held(), [{ e: 'heal', target: { t: 'all', filter: { type: 'character', side: 'friendly' } }, amount: 6 }])) },
  // 繳械元素：戰吼：為你的對手疏浚。把它的消耗設為 (6)
  TID_700: { abilities: play(dredge('setCost6Opp', { opponent: true })) },
  // 淹沒：把一個敵方手下放在你牌堆底部
  TID_920: { target: enemyMinion, abilities: play(fn('skDrown')) },
  // 漩渦：消滅所有手下及其所有複製（不論在哪裡）
  TSC_209: { abilities: play(fn('skWhirlpool')) },
  // 照明：疏浚。若它是法術，使其消耗減少 (3)
  TSC_210: { abilities: play(dredge('discountType', { type: 'SPELL', n: 3 })) },
  // 深淵低語：沉默一個友方手下，然後對所有敵方手下隨機分配等同其攻擊力的傷害
  TSC_211: { target: friendlyMinion, abilities: play(fn('skWhispers')) },
  // 侍女：戰吼：若你在持有這張牌時施放過三張法術，抽 3 張牌
  TSC_212: { handAbilities: holdSpell, abilities: play(cond(held(3), [draw(3)])) },
  // 女王衛士：戰吼：本回合你每施放過一張法術，獲得 +1/+1
  TSC_213: { abilities: play({ e: 'buff', target: { t: 'self' }, atk: { dyn: 'spellsThisTurnN' }, hp: { dyn: 'spellsThisTurnN' } }) },
  // 蛇髮假髮：使一個手下獲得 +1/+2。若你在持有這張牌時打出過納迦，把一頂蛇髮假髮加入你的手牌
  TSC_215: { handAbilities: holdNaga, target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 2 }, cond(held(), [addCard('TSC_215')])) },
  // 黑水巨獸：巨型 +1、生命竊取
  TSC_216: { keywords: ['LIFESTEAL'], colossal: { limbs: ['TSC_216t'] }, tokens: ['TSC_216t'] },
  TSC_216t: { abilities: endTurn(fn('skLure')) },
  // 換位：抽 2 張手下。交換它們的生命值
  TSC_702: { abilities: play(fn('skSwitcheroo')) },
  // 艾薩拉儀式：沉默一個手下並召喚一個它的複製。把一個「沉沒儀式」放在你牌堆底部
  TSC_775: { target: anyMinion, abilities: play(fn('skRitual', { n: 1 }), sunk('TSC_775t')), tokens: ['TSC_775t'] },
  TSC_775t: { target: anyMinion, abilities: play(fn('skRitual', { n: 2 })) },
  // 女祭司瓦麗詩：戰吼：本回合你每施放過一張法術，重新整理一個空的法力水晶
  TSC_828: { abilities: play(fn('skValishj')) },

  // ================================================================ 盜賊
  // 碎裂蹣跚者：戰吼：你的下一個亡語手下消耗減少 (1)，但打出時立刻死亡
  TID_078: { abilities: play(fn('skShattershambler')) },
  // 墨水伏擊者：潛行。攻擊時 +3 攻擊力並免疫
  TID_080: { keywords: ['STEALTH'], flags: ['immuneAttacking', 'inkveil'] },
  // 劍魚：戰吼：疏浚。若它是海盜，使這把武器與那個海盜 +2 攻擊力
  TSC_086: { abilities: play(dredge('swordfish')) },
  // 艾薩拉之船：召喚兩個有潛行的 3/3 海盜。把一個「沉沒之船」放在你牌堆底部
  TSC_912: { abilities: play(summon('TSC_912t3', 2), sunk('TSC_912t')), tokens: ['TSC_912t', 'TSC_912t3'] },
  TSC_912t: { castsWhenDrawn: true, abilities: play(summon('TSC_912t2', 2)), tokens: ['TSC_912t2'] },
  TSC_912t2: { keywords: ['STEALTH'] },
  TSC_912t3: { keywords: ['STEALTH'] },
  // 釣魚去：疏浚。連擊：抽一張牌
  TSC_916: { abilities: play(dredge(), cond({ c: 'combo' }, [draw(1)])) },
  // 靴帶沉沒者：連擊：把一個敵方手下放在你對手牌堆底部
  TSC_933: { target: { ...optional(enemyMinion), when: { c: 'combo' } }, abilities: play(cond({ c: 'combo' }, [fn('skBootstrap')])) },
  // 海盜上將胡克塔斯：戰吼：若你在本場對戰中召喚過 7 個其他海盜，掠奪敵人！
  TSC_934: { abilities: play(cond({ c: 'summonedRace', race: 'PIRATE', n: 8 }, [fn('skHooktusk')])), tokens: ['TSC_934t', 'TSC_934t2', 'TSC_934t3'] },
  TSC_934t: { abilities: play(fn('skTakeDeck', { n: 5 })) },
  TSC_934t2: { abilities: play(fn('skTakeHand', { n: 2 })) },
  TSC_934t3: { abilities: play(fn('skTakeShip')) },
  // 迅鱗詭術師：戰吼：本回合你的下一張法術消耗為 (0)
  TSC_936: { abilities: play({ e: 'pendingDiscount', d: { set: 0, type: 'SPELL', thisTurn: true } }) },
  // 克拉巴托亞：巨型 +2。你的克拉巴托亞之爪 +2 攻擊力
  TSC_937: { colossal: { limbs: ['TSC_937t', 'TSC_937t3'] }, tokens: ['TSC_937t', 'TSC_937t3', 'TSC_937t2'] },
  TSC_937t: { keywords: ['RUSH'], abilities: dr({ e: 'equip', card: 'TSC_937t2' }) },
  TSC_937t3: { keywords: ['RUSH'], abilities: dr({ e: 'equip', card: 'TSC_937t2' }) },
  TSC_937t2: {},
  // 觸手之握見泰坦

  // 艾薩拉的饋贈：抽一張牌。若你在持有這張牌時打出過納迦，再抽一張
  TSC_948: { handAbilities: holdNaga, abilities: play(draw(1), cond(held(), [draw(1)])) },
  // ================================================================ 薩滿
  // 迷失的掘洞者：戰吼：疏浚。若它是魚人，召喚一個它的 2/2 複製
  TID_003: { abilities: play(dredge('murlocCopy')) },
  // 小丑魚：戰吼：你的下兩個魚人消耗減少 (2)
  TID_004: { abilities: play({ e: 'pendingDiscount', d: { amount: 2, race: 'MURLOC' } }, { e: 'pendingDiscount', d: { amount: 2, race: 'MURLOC' } }) },
  // 怒脊附魔師：戰吼：施放你手牌中一張火焰、冰霜與自然法術的複製（目標隨機）
  TSC_630: { abilities: play(fn('skWrathspine')) },
  // 群游：把三隻 1/1 食人魚群加入你的手牌
  TSC_631: { abilities: play(addCard('TSC_638', 3)) },
  // 食人魚盜獵者：在你的回合結束時，把一隻 1/1 食人魚群加入你的手牌
  TSC_633: { abilities: endTurn(addCard('TSC_638')) },
  // 艾薩拉的光輝：火焰法術傷害 +2。你的自然法術消耗減少 (1)。在你施放冰霜法術後，獲得 3 點護甲
  TSC_635: { flags: ['fireSpellDamage2'], costAuras: [{ side: 'friendly', type: 'SPELL', school: 'NATURE', add: -1 }], abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FROST' }, effects: [{ e: 'armor', amount: 3 }] }] },
  // 滾燙的間歇泉：造成 2 點傷害。疏浚
  TSC_637: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }, dredge()) },
  // 吞噬者格魯格：巨型 +3。在一個友方手下死亡後，獲得它的原始屬性值
  TSC_639: { colossal: { limbs: limbs('TSC_639', 3) }, tokens: limbs('TSC_639', 3), abilities: [{ on: { k: 'minionDied', side: 'friendly' }, effects: [fn('skGlugg')] }] },
  ...Object.fromEntries(limbs('TSC_639', 3).map((id) => [id, { keywords: ['TAUNT'] }])),
  // 珊瑚守護者：戰吼：本場對戰中你每施放過一種法術派系，召喚一個 3/3 的元素
  TSC_648: { abilities: play({ e: 'repeat', times: { dyn: 'schoolsCast' }, effects: [summon('TSC_648t')] }), tokens: ['TSC_648t'] },
  TSC_648t: {},
  // 艾薩拉卷軸：發現一張火焰、冰霜或自然法術。把一個「沉沒卷軸」放在你牌堆底部
  TSC_772: { abilities: play(fn('skScroll'), sunk('TSC_772t')), tokens: ['TSC_772t'] },
  TSC_772t: { abilities: play(fn('skSunkenScroll')) },
  // 錨定圖騰：在你召喚一個 1 費手下後，使它獲得 +2/+1
  TSC_922: { abilities: [{ on: { k: 'summon', side: 'friendly' }, cond: { c: 'itCost', n: 1 }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2, hp: 1 }] }] },
  // 生物發光：使你的手下獲得法術傷害 +1
  TSC_923: { abilities: play(fn('skBioluminescence')) },

  // ================================================================ 術士
  // 骨牌效應見威茲班
  // 暗影先驅：戰吼：若你在持有這張牌時施放過暗影法術，從一個手下身上偷取 2 點生命值
  TID_717: { handAbilities: holdSchool('SHADOW'), target: { ...optional(anyMinion), when: held() }, abilities: play(cond(held(), [fn('skStealHealth', { n: 2 })])) },
  // 獻祭：點燃對手手牌中的每張牌。3 個回合後，還在手牌中的會被摧毀！
  TID_718: { abilities: play(fn('skImmolate')) },
  // 指揮官烏索克：戰吼：你對手的卡牌在下個回合消耗生命值而不是法力
  TID_719: { abilities: play(fn('skUlthok')) },
  // 艾薩拉清道夫：戰吼：把一個「沉沒清道夫」放在你牌堆底部
  TSC_039: { abilities: play(sunk('TSC_039t')), tokens: ['TSC_039t'] },
  TSC_039t: { abilities: play(fn('skSunkenScavenger')) },
  // 血腥鰭魚：戰吼：疏浚。若它是魚人，把它的消耗改為生命值而不是法力
  TSC_753: { abilities: play(dredge('murlocHealth')) },
  // 深淵之浪：對所有手下造成 4 點傷害。給予你的對手一個深淵詛咒
  TSC_924: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 4, spell: true }, curse), tokens: ['TSC_955t'] },
  // 觸底：召喚一個 1/1 魚人，然後疏浚。若它也是魚人，再召喚一個
  TSC_925: { abilities: play(summon('TSC_925t'), dredge('rockBottom')), tokens: ['TSC_925t'] },
  TSC_925t: {},
  // 西拉凱斯異教徒：戰吼：給予你的對手一個深淵詛咒
  TSC_955: { abilities: play(curse), tokens: ['TSC_955t'] },
  TSC_955t: { abilities: play() },
  // 拖入深淵：對一個手下造成 4 點傷害。給予你的對手一個深淵詛咒
  TSC_956: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 4, spell: true }, curse), tokens: ['TSC_955t'] },
  // 魚餌桶：使你手牌中的所有魚人獲得 +1/+1。你每控制一個魚人，就重複一次
  TSC_957: { abilities: play(fn('skChumBucket')) },
  // 薩庫爾：你的深淵詛咒會為你恢復等同其傷害的生命值。戰吼：給予你的對手一個深淵詛咒
  TSC_959: { flags: ['zaqul'], abilities: play(curse), tokens: ['TSC_955t'] },
  // 吉加芬：巨型 +1。戰吼：吞噬所有敵方手下。亡語：把它們吐出來
  TSC_962: { colossal: { limbs: ['TSC_962t'] }, tokens: ['TSC_962t'], abilities: [...play(fn('skGigafinEat')), ...dr(fn('skGigafinSpit'))] },
  TSC_962t: { keywords: ['TAUNT'], abilities: dr(fn('skGigafinMaw')) },

  // ================================================================ 戰士
  // 火成熔岩吞噬者：嘲諷。戰吼：疏浚。獲得等同其消耗的護甲
  TID_714: { keywords: ['TAUNT'], abilities: play(dredge('armorCost')) },
  // 巨型之爭：把一個隨機的巨型手下加入雙方玩家的手牌。你的消耗減少 (2)
  TID_715: { abilities: play(fn('skClashColossals')) },
  // 壕溝追獵者：戰吼：攻擊三個不同的隨機敵人
  TSC_659: { abilities: play(fn('skTrenchstalker')) },
  // 巨鯨奈莉：巨型 +1。戰吼：發現 3 個海盜擔任奈莉船上的船員！
  TSC_660: { colossal: { limbs: ['TSC_660t'] }, tokens: ['TSC_660t'], abilities: play(fn('skNellieCrew')) },
  TSC_660t: { keywords: ['TAUNT'], abilities: dr(fn('skNellieShip')) },
  // 艾薩拉三叉戟：亡語：把一個「沉沒三叉戟」放在你牌堆底部
  TSC_913: { abilities: dr(sunk('TSC_913t')), tokens: ['TSC_913t'] },
  TSC_913t: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, effects: [{ e: 'damage', target: { t: 'all', filter: enemyMinions }, amount: 2 }] }] },
  // 烈焰鍛造：摧毀你的武器，然後抽等同其攻擊力的牌
  TSC_939: { abilities: play(fn('skForgedInFlame')) },
  // 深海來客：使你牌堆底部 5 張牌消耗減少 (3)，然後疏浚
  TSC_940: { abilities: play(fn('skFromTheDepths'), dredge()) },
  // 黑曜石匠：戰吼：疏浚。若它是手下或武器，使其獲得 +1/+1
  TSC_942: { abilities: play(dredge('obsidian')) },
  // 艾希凡女士：戰吼：使你手牌、牌堆與戰場上的所有武器獲得 +1/+1
  TSC_943: { abilities: play(fn('skAshvane')) },
  // 辛艾薩莉之火：把你的牌堆換成消耗 (5) 以上的手下。它們消耗 (5)
  TSC_944: { abilities: play(fn('skFiresOfZin')) },
};
