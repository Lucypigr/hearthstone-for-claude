// ============================================================================
// 迷你系列：死亡礦坑（DED_，暴風城）與奧妮克希亞的巢穴（ONY_，奧特蘭克山谷），以及剩下的傳統卡
// 解析器看不懂的卡在這裡手動定義；自訂效果（ded 開頭）在 game.ts 的 customMinisets。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const hk = (...effects: Effect[]): Ability[] => [{ on: { k: 'honorableKill' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const hit = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const draw = (count = 1): Effect => ({ e: 'draw', count, who: 'self' });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const honorable: Condition = { c: 'honorableKill' };
const otherMinions = { t: 'all' as const, filter: { type: 'minion' as const, side: 'any' as const, excludeSelf: true } };
const WHELP = 'ONY_001t';
const TREASURES = ['ONY_005ta1', 'ONY_005ta2', 'ONY_005ta3', 'ONY_005ta4', 'ONY_005ta5', 'ONY_005ta6', 'ONY_005ta7', 'ONY_005ta8', 'ONY_005ta9', 'ONY_005ta10', 'ONY_005ta11', 'ONY_005ta12', 'ONY_005ta13'];
const BOB_ACTIONS = ['BG31_BOBt', 'BG31_BOBt2', 'BG31_BOBt3', 'BG31_BOBt4'];
const POWER_CHORDS = ['PRO_001a', 'PRO_001b', 'PRO_001c'];
const INVENTIONS = ['Mekka1', 'Mekka2', 'Mekka3', 'Mekka4'];
const wingsRank = (n: number, up?: { at: number; into: string }, tokens: string[] = []): Override => ({ abilities: play(summon('BT_922t', n)), ...(up ? { rankUp: up } : {}), tokens: ['BT_922t', ...tokens] });

export const MINISET_OVERRIDES: Record<string, Override> = {
  // ================================================================ 死亡礦坑
  // 月光指引：發現你牌堆中一張牌的複製；若你本回合打出它，抽出原本那張
  DED_002: { abilities: play(fn('dedMoonlit')) },
  // 應急木工：戰吼：抽一張二選一法術並把它拆開
  DED_003: { abilities: play(fn('dedCarpenter')) },
  // 黑水彎刀：可交易。在你交易這張牌後，使你手牌中一張法術消耗減少 (1)
  DED_004: { keywords: ['TRADEABLE'], onTrade: [fn('dedSpellDiscount', { amount: 1 })] },
  // 強勢協商：用這張牌交換你對手牌堆中的一張牌
  DED_005: { abilities: play(fn('dedParrrley')) },
  // 迪菲亞炸魚者：戰吼：對一個隨機敵人造成 2 點傷害；你每有一隻野獸就重複一次
  DED_007: { abilities: play(fn('dedBlastfisher')) },
  // 恐怖的鸚鵡：戰吼：獲得最後一個死亡的友方亡語手下的複製
  DED_008: { abilities: play(fn('dedParrot')) },
  // 財富調節者：嘲諷。戰吼：交換攻擊力最高與最低的手下的攻擊力
  DED_500: { keywords: ['TAUNT'], abilities: play(fn('dedRedistribute')) },
  // 聒噪的日翼鸚鵡：戰吼：對此手下重複你上一張對友方手下施放的法術
  DED_501: { abilities: play(fn('dedSquawker')) },
  // 正義防禦：把一個手下的屬性值變成 1/1，失去的屬性值給你手牌中一個隨機手下
  DED_502: { target: anyMinion, abilities: play(fn('dedRighteous')) },
  // 影刃飛刀手：戰吼：若你本回合受到過傷害，對一個敵方手下造成等量的傷害
  DED_503: { target: { ...enemyMinion, optional: true }, abilities: play(fn('dedSlinger')) },
  // 邪惡船貨：可交易。召喚 @ 個 1/1 小鬼（交易後增加 2 個）
  DED_504: { keywords: ['TRADEABLE'], flags: ['tradeUpgrade'], abilities: play(fn('dedShipment')), tokens: ['EX1_598'] },
  // 船體破壞者：戰吼與亡語：抽一張法術，你的英雄受到等同它消耗的傷害
  DED_505: { abilities: [...play(fn('dedHullbreaker')), ...dr(fn('dedHullbreaker'))] },
  // 極貪快感：可交易。抽 3 張牌。若這張牌本回合才抽到，消耗為 (3)
  DED_506: { keywords: ['TRADEABLE'], costIf: { cond: { c: 'thisDrawnThisTurn' }, cost: 3 }, abilities: play(draw(3)) },
  // 桅杆瞭望者：戰吼：對最左邊與最右邊的敵方手下造成 2 點傷害
  DED_507: { abilities: play(fn('dedEdges', { amount: 2 })) },
  // 試煉場：從你的牌堆召喚兩個手下，它們互相攻擊
  DED_508: { abilities: play(fn('dedProvingGrounds')) },
  // 聰明的金剛鸚鵡：戰吼：重複你上一個打出的戰吼
  DED_509: { abilities: play(fn('dedMacaw')) },
  // 迪菲亞老大艾德溫：戰吼：抽一張牌；若你本回合打出它，獲得 +2/+2 並重複此效果
  DED_510: { abilities: play(fn('dedEdwin')) },
  // 吸盤鉤子手：在你的回合結束時，把你的武器變成消耗多 (1) 的武器
  DED_511: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('dedSuckerhook')] }] },
  // 不朽護符：可交易。復活 @ 個友方亡語手下（交易後升級）
  DED_512: { keywords: ['TRADEABLE'], flags: ['tradeUpgrade'], abilities: play(fn('dedAmulet')) },
  // 迪菲亞麻瘋地精：戰吼：若你的手牌中有暗影法術，造成 2 點傷害
  DED_513: {
    target: { ...anyChar, optional: true, when: { c: 'holdingSchool', school: 'SHADOW' } },
    abilities: play(cond({ c: 'holdingSchool', school: 'SHADOW' }, [hit(2, false)])),
  },
  // 拷貝貓：戰吼：把你對手打出的下一張牌的複製加入你的手牌
  DED_514: { abilities: play(fn('dedCopycat')) },
  // 灰綠鸚鵡：戰吼：重複你上一張消耗 (6) 以上的法術
  DED_515: { abilities: play(fn('dedSageParrot')) },
  // 深水塑能師：戰吼：抽一張法術，獲得等同它消耗的護甲值
  DED_516: { abilities: play(fn('dedEvoker')) },
  // 秘法氾濫：對一個敵方手下造成 8 點傷害，召喚一個屬性值等同溢出傷害的殘渣
  DED_517: { target: enemyMinion, abilities: play(fn('dedOverflow')), tokens: ['DED_517t'] },
  // 迪菲亞火砲手：在你的英雄攻擊後，對一個隨機敵人造成 2 點傷害兩次
  DED_519: {
    abilities: [{
      on: { k: 'attack', subject: 'friendlyHero', after: true },
      effects: [
        { e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 },
        { e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 },
      ],
    }],
  },
  // 多重施法者：戰吼：本場對戰中你施放過的每個不同法術派系，抽一張牌
  DED_524: { abilities: play({ e: 'draw', count: { dyn: 'schoolsCast' }, who: 'self' }) },
  // 巨人號，斯尼德的傑作：戰吼：對敵方手下發射五枚各造成 2 點傷害的火箭
  DED_525: { abilities: play(fn('dedGoliath')) },
  // 鍛造錘：可交易。在你交易這張牌後，獲得 +2 耐久度
  DED_527: { keywords: ['TRADEABLE'], onTrade: [fn('dedHammer')] },

  // ================================================================ 奧妮克希亞的巢穴
  // 裝備囤積者：嘲諷。若你在回合結束時有未花掉的法力，這張牌消耗減少 (1)
  ONY_002: { keywords: ['TAUNT'], handAbilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('dedGearGrubber')] }] },
  // 幼龍棒槌手：盛怒與榮譽擊殺：抽一張牌
  ONY_003: { abilities: [{ on: { k: 'frenzy' }, effects: [draw()] }, ...hk(draw())] },
  // 團隊首領奧妮克希亞：突襲。在你控制幼龍時免疫。戰吼：召喚六隻有突襲的 2/1 幼龍
  ONY_004: {
    keywords: ['RUSH'],
    auras: [{ scope: 'self', keywords: ['IMMUNE'], cond: { c: 'control', nameIncludes: 'Whelp' } }],
    abilities: play(summon(WHELP, 6)),
    tokens: [WHELP],
  },
  // 卡札庫斯安：戰吼：若你本場對戰中打出過其他 4 條龍，打造一副寶藏套牌
  ONY_005: { abilities: play(fn('dedKazakusan')), tokens: [...TREASURES, 'ONY_005ta5t'] },
  ONY_005ta1: { target: anyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  ONY_005ta2: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 4, hp: 4, keywords: ['TAUNT'] }) },
  ONY_005ta3: { abilities: [{ on: { k: 'attack', subject: 'friendlyHero', after: true }, cond: { c: 'attackedMinion' }, effects: [fn('dedExorcisor')] }] },
  ONY_005ta4: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 8, spell: true }, { e: 'freeze', target: { t: 'hero', side: 'enemy' } }) },
  ONY_005ta5: { abilities: play(fn('dedBubba')), tokens: ['ONY_005ta5t'] },
  ONY_005ta6: { target: anyMinion, abilities: play(fn('dedHolyBook')) },
  ONY_005ta7: { target: { ...anyMinion, optional: true }, abilities: play(fn('dedCrusty')) },
  ONY_005ta8: { abilities: play(draw(2), { e: 'armor', amount: 4 }) },
  ONY_005ta9: { keywords: ['RUSH'], abilities: [{ on: { k: 'attack', subject: 'self', after: true }, cond: { c: 'attackedMinion' }, effects: [fn('dedBeastlyBeauty')] }] },
  ONY_005ta10: { abilities: play(fn('dedSpyglass')) },
  ONY_005ta11: { abilities: [{ on: { k: 'summoned' }, effects: [fn('dedClockwork')] }] },
  ONY_005ta12: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }] }] },
  ONY_005ta13: { abilities: play(fn('dedPuzzleBox')) },
  // 深呼吸：對一個手下與它的相鄰手下造成 @ 點傷害（依你手牌中其他法術的數量強化）
  ONY_006: { target: anyMinion, abilities: play(fn('dedDeepBreath')) },
  // 狂怒之嚎：抽一張牌，重複直到你有至少 3 張牌
  ONY_008: { abilities: play(fn('dedFuriousHowl')) },
  // 寵物收藏家：戰吼：從你的牌堆召喚一隻消耗 (5) 以下的野獸
  ONY_009: { abilities: play({ e: 'recruit', count: 1, race: 'BEAST', maxCost: 5 }) },
  // 龍禍射擊：造成 2 點傷害。榮譽擊殺：把一張龍禍射擊加入你的手牌
  ONY_010: { target: anyChar, abilities: play(hit(2), cond(honorable, [{ e: 'addCard', card: 'ONY_010', count: 1, who: 'self' }])) },
  // 魂靈坐騎：使一個手下獲得 +1/+2 與法術傷害 +1；它死亡時召喚一隻魂靈迅猛龍
  ONY_012: { target: anyMinion, abilities: play(fn('dedSpiritMount')), tokens: ['ONY_012t'] },
  ONY_012t: { spellDamage: 1 },
  // 提神寒風：為你的英雄恢復 5 點生命值，使你手牌中一張隨機法術消耗減少 (2)
  ONY_013: { abilities: play({ e: 'heal', target: { t: 'hero', side: 'friendly' }, amount: 5 }, fn('dedSpellDiscount', { amount: 2 })) },
  // 靈敏反應：對所有手下造成 1 點傷害。榮譽擊殺：本回合獲得 +1 攻擊力
  ONY_014: { abilities: play(fn('dedKeenReflex')) },
  // 憎恨之翼：召喚兩 / 三 / 四隻 1/1 魔翼蝙蝠
  ONY_016: wingsRank(2, { at: 5, into: 'ONY_016t' }, ['ONY_016t', 'ONY_016t2']),
  ONY_016t: wingsRank(3, { at: 10, into: 'ONY_016t2' }, ['ONY_016t2']),
  ONY_016t2: wingsRank(4),
  // 怒西昂的角：抽一個手下；若是龍，召喚兩隻有突襲的 2/1 幼龍
  ONY_017: { abilities: play(fn('dedHorn')), tokens: [WHELP] },
  // 團隊協商者：戰吼：發現一張二選一卡，它同時具有兩種效果
  ONY_019: { abilities: play(fn('dedNegotiator')) },
  // 暴風城復仇者：在你對此手下施放法術後，它獲得 +2 攻擊力
  ONY_020: { abilities: [{ on: { k: 'spellTarget' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 2 }] }] },
  // 奧妮克希亞鱗片：以有突襲的 2/1 幼龍填滿你的戰場
  ONY_021: { abilities: play(summon(WHELP, 7)), tokens: [WHELP] },
  // 用力打下去：本回合獲得 +10 攻擊力與「無法攻擊英雄」
  ONY_023: { abilities: play({ e: 'heroAttack', amount: 10 }, fn('dedNoHeroAttack')) },
  // 光喉虛空龍：戰吼：若你的手牌中有神聖與暗影法術，對所有其他手下造成 3 點傷害
  ONY_026: { abilities: play(cond({ c: 'holdingSchool', school: 'HOLY' }, [cond({ c: 'holdingSchool', school: 'SHADOW' }, [{ e: 'damage', target: otherMinions, amount: 3 }])])) },
  // 勇氣戒指：可交易。使一個手下獲得 +1/+1；每有一個敵方手下重複一次
  ONY_027: { keywords: ['TRADEABLE'], target: anyMinion, abilities: play(fn('dedRingOfCourage')) },
  // 『純淨聖光』彌達：聖盾、生命竊取。亡語：把一張碎片洗入你的牌堆，抽到時重新召喚彌達
  ONY_028: { keywords: ['DIVINE_SHIELD', 'LIFESTEAL'], abilities: dr({ e: 'shuffle', card: 'ONY_028t', count: 1 }), tokens: ['ONY_028t'] },
  ONY_028t: { castsWhenDrawn: true, abilities: play(summon('ONY_028')) },
  // 龍火護符：可交易。發現 2 條龍並召喚它們
  ONY_029: { keywords: ['TRADEABLE'], abilities: play(fn('dedDrakefire'), fn('dedDrakefire')) },
  // 軍情七處走私者：戰吼：召喚一個隨機的 @ 費手下（你每打出過一張其他軍情七處卡就升級）
  ONY_030: { abilities: play(fn('dedSmuggler')) },
  // 煙霧瀰漫：抽 5 張牌，觸發抽到的牌的亡語
  ONY_031: { abilities: play(fn('dedSmokescreen')) },
  // 奈法利安的龍牙：造成 3 點傷害。榮譽擊殺：發現一張其他職業的法術
  ONY_032: { target: anyChar, abilities: play(hit(3), cond(honorable, [{ e: 'discover', pool: { type: 'SPELL', otherClass: true } }])) },
  // 小鬼孳生：為每個敵方手下召喚一個 3/3 恐怖小鬼來攻擊它
  ONY_033: { abilities: play(fn('dedImpfestation')), tokens: ['AV_316t'] },
  // 痛苦詛咒：把三張痛苦洗入對手的牌堆；抽到時受到疲勞傷害
  ONY_034: { abilities: play({ e: 'shuffle', card: 'ONY_034t', count: 3, who: 'opponent' }), tokens: ['ONY_034t'] },
  ONY_034t: { castsWhenDrawn: true, abilities: play(fn('dedAgony')) },
  // 刃爪哨兵：在你打出手牌中最左邊或最右邊的牌後，抽一張牌
  ONY_036: { abilities: [{ on: { k: 'cardPlayed', side: 'friendly' }, effects: [fn('dedRazorglaive')] }] },

  // ================================================================ 英雄卡
  // 瘋狂天才爆爆博士：戰吼：本場對戰剩下的時間，你的機械具有突襲。英雄能力：紅色大按鈕（每回合換一種）
  BOT_238: { abilities: play(fn('dedHeroBoom')), heroPower: { target: anyChar, effects: [hit(3, false)] }, tokens: ['BOT_312t'] },
  // 『空無者』瓦麗拉：戰吼：獲得潛行直到你的下個回合。英雄能力（被動）：你的回合中把一張陰影鏡像加入手牌
  ICC_827: { abilities: play(fn('dedHeroValeera')), heroPower: { passive: true, effects: [] }, tokens: ['ICC_827t'] },
  ICC_827t: {},
  // 女巫哈嘉薩：戰吼：對所有手下造成 3 點傷害。英雄能力（被動）：在你打出一個手下後，把一張隨機薩滿法術加入你的手牌
  GIL_504: { abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 3 }), heroPower: { passive: true, effects: [] } },
  // 無頭騎士：戰吼：消滅攻擊力最高的敵方手下，把我的頭洗入你的牌堆
  TOY_829: { abilities: play(fn('dedHeroHorseman')), heroPower: { target: anyChar, effects: [hit(3, false)] }, tokens: ['TOY_829t'] },
  TOY_829t: { castsWhenDrawn: true, abilities: play(fn('dedHorsemanHead')) },
  // 祖爾金：戰吼：施放本場對戰中你打出過的所有法術（目標隨機）
  TRL_065: { abilities: play(fn('dedHeroZuljin')), heroPower: { target: anyChar, effects: [hit(2, false)] } },
  // 獨行俠里諾：戰吼：若你的牌堆開局時沒有重複的卡，把所有敵方手下移出遊戲。英雄能力：里諾的手持火砲（每回合換一種子彈）
  WW_0700: { abilities: play(fn('dedHeroLoneRanger')), heroPower: { target: anyChar, effects: [hit(2, false)] } },
  // 神奇的里諾：戰吼：讓所有手下消失。英雄能力（被動）：在你的回合開始時，施放一張隨機法術
  YOD_009: { abilities: play(fn('dedHeroAmazingReno')), heroPower: { passive: true, effects: [] } },

  // ================================================================ 傳統
  // 酒保鮑伯：戰吼：選擇英雄戰場的一個行動
  BG31_BOB: { abilities: play(fn('dedBob')), tokens: BOB_ACTIONS },
  BG31_BOBt: { abilities: play({ e: 'freeze', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } } }) },
  BG31_BOBt2: { abilities: play(fn('dedBobRecruit')), tokens: ['GAME_005'] },
  BG31_BOBt3: { abilities: play({ e: 'discover', pool: { type: 'MINION', cost: 3 } }, { e: 'mana', kind: 'refresh', amount: 3 }) },
  BG31_BOBt4: { abilities: play(fn('dedBobTriple')) },
  // 阿薩斯的禮物：發現一張暫時的黑暗變身、凜風衝擊或死亡打擊
  GIFT_04: { abilities: play(fn('dedArthasGift')) },
  // 心靈幻象：把你對手手牌中一張隨機牌的複製加入你的手牌
  CS2_003: { abilities: play(fn('dedMindVision')) },
  // 霜狼督軍：戰吼：場上每有一個其他友方手下，獲得 +1/+1
  CS2_226: { abilities: play(fn('dedWarlord')) },
  // 老瞎眼：衝鋒。場上每有一個其他魚人，+1 攻擊力
  EX1_062: { keywords: ['CHARGE'], auras: [{ scope: 'self', dyn: { amount: 'otherMurlocs', atk: 1 } }] },
  // 傑爾賓‧梅卡托克：戰吼：召喚一個超讚的發明
  EX1_112: { abilities: play(fn('summonOneOf', { cards: INVENTIONS })), tokens: INVENTIONS },
  Mekka1: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'destroy', target: { t: 'self' } }, draw(3)] }] },
  Mekka2: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'heal', target: { t: 'random', filter: { type: 'character', side: 'any', damaged: true }, count: 1 }, amount: 6 }] }] },
  Mekka3: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'any', excludeSelf: true }, count: 1 }, atk: 1, hp: 1 }] }] },
  Mekka4t: {},
  Mekka4: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'transform', target: { t: 'random', filter: { type: 'minion', side: 'any', excludeSelf: true }, count: 1 }, card: 'Mekka4t' }] }], tokens: ['Mekka4t'] },
  // 冰柱術：對一個手下造成 2 點傷害；若它被凍結，抽一張牌
  EX1_179: { target: anyMinion, abilities: play(cond({ c: 'chosenFrozen' }, [hit(2), draw()], [hit(2)])) },
  // 偷取：把一張隨機的其他職業卡加入你的手牌
  EX1_182: { abilities: play({ e: 'addRandom', pool: { otherClass: true }, count: 1, who: 'self' }) },
  // 精英牛頭大佬：戰吼：使雙方玩家各獲得一張強力和弦卡
  PRO_001: { abilities: play(fn('addOneOf', { cards: POWER_CHORDS }), fn('addOneOf', { cards: POWER_CHORDS, who: 'opponent' })), tokens: POWER_CHORDS },
  PRO_001a: { abilities: play(fn('dedIAmMurloc')), tokens: ['PRO_001at'] },
  PRO_001b: { target: anyChar, abilities: play(hit(4), draw()) },
  PRO_001c: { abilities: play(fn('dedHordeWarrior')) },
  // 艾澤拉斯的勇士：選擇聯盟或部落，獲得 2 張該陣營的傳說勇士，消耗減少 (2)
  WON_113: {
    chooseOne: [
      { id: 'WON_113a', name: '為了聯盟！', text: '獲得 2 張隨機的聯盟傳說勇士，消耗減少 (2)', abilities: play(fn('dedChampions', { side: 'alliance' })) },
      { id: 'WON_113b', name: '為了部落！', text: '獲得 2 張隨機的部落傳說勇士，消耗減少 (2)', abilities: play(fn('dedChampions', { side: 'horde' })) },
    ],
  },
};
