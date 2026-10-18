// ============================================================================
// 經典系列剩下的卡（寒冰槍、冷血、艾德溫‧范克里夫、預言者維倫、諾茲多姆……）
// 解析器看不懂的卡在這裡手動定義；自訂效果（cx 開頭）在 game.ts 的 customClassicRest。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const draw = (count: number): Effect => ({ e: 'draw', count, who: 'self' });
const dmg = (amount: number, spell = true): Effect => ({ e: 'damage', target: { t: 'chosen' }, amount, spell });
const turnStart = (...effects: Effect[]): Ability[] => [{ on: { k: 'turnStart', whose: 'mine' }, effects }];
const combo: Condition = { c: 'combo' };
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };

export const CLASSIC_REST_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 中立
  // 惡意鐵匠：此手下受傷時，你的武器 +2 攻擊力
  CS2_221: { flags: ['spitefulSmith'] },
  // 風險投資公司傭兵：你的手下消耗增加 (3)
  CS2_227: { costAuras: [{ side: 'friendly', type: 'MINION', add: 3 }] },
  // 警報機器人：在你的回合開始時，把此手下與你手牌中的一個隨機手下交換
  EX1_006: { abilities: turnStart(fn('cxAlarmBot')) },
  // 迷你召喚師：你每回合打出的第一個手下消耗減少 (1)
  EX1_076: { flags: ['pintSized'] },
  // 守密者：每當一張奧秘被打出，獲得 +1/+1
  EX1_080: { abilities: [{ on: { k: 'cardPlayed', side: 'any' }, cond: { c: 'itSecret' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 1, hp: 1 }] }] },
  // 秘法魔像：衝鋒。戰吼：使你的對手獲得一個法力水晶
  EX1_089: { keywords: ['CHARGE'], abilities: play({ e: 'mana', kind: 'full', amount: 1, who: 'opponent' }) },
  // 狂暴狼人：受傷時具有 +1 攻擊力與風怒
  EX1_412: { enrage: { atk: 1 }, flags: ['enrageWindfury'] },
  // 納特‧帕格：在你的回合開始時，你有 50% 的機率多抽一張牌
  EX1_557: { abilities: turnStart(fn('cxNatPagle')) },
  // 諾茲多姆：玩家只有 15 秒可以進行他們的回合
  EX1_560: { flags: ['nozdormu'] },
  // 上古法師：戰吼：使相鄰的手下獲得法術傷害 +1
  EX1_584: { abilities: play(fn('cxAncientMage')) },
  // 血騎士：戰吼：所有手下失去聖盾。每失去一個聖盾，獲得 +3/+3
  EX1_590: { abilities: play(fn('cxBloodKnight')) },
  // 法力怨靈：所有手下消耗增加 (1)
  EX1_616: { costAuras: [{ side: 'both', type: 'MINION', add: 1 }] },
  // 血帆海盜：戰吼：使你對手的武器失去 1 點耐久度
  NEW1_025: { abilities: play(fn('cxCorsair')) },
  // 米歐浩斯‧法力風暴：戰吼：敵方法術在下個回合消耗為 (0)
  NEW1_029: { abilities: play(fn('cxMillhouse')) },
  // 奔竄科多獸：戰吼：消滅一個隨機的攻擊力 2 以下的敵方手下
  NEW1_041: { abilities: play({ e: 'destroy', target: { t: 'random', filter: { type: 'minion', side: 'enemy', maxAttack: 2 }, count: 1 } }) },
  // ---------------------------------------------------------------- 獵人
  // 角鬥士長弓：你的英雄在攻擊時免疫
  DS1_188: { flags: ['immuneAttacking'] },
  // 誤導：奧秘：當一個敵人攻擊你的英雄時，改為攻擊另一個隨機角色
  EX1_533: { secret: true, abilities: [{ on: { k: 'secret', ev: 'heroAttacked' }, effects: [fn('cxMisdirection')] }] },
  // 鷹角弓：每當一個友方奧秘被揭露，獲得 +1 耐久度
  EX1_536: { flags: ['eaglehorn'] },
  // 照明彈：所有手下失去潛行。摧毀所有敵方奧秘。抽一張牌
  EX1_544: { abilities: play(fn('cxFlare'), draw(1)) },
  // ---------------------------------------------------------------- 法師
  // 寒冰槍：凍結一個角色。若它已被凍結，改為造成 4 點傷害
  CS2_031: { target: anyChar, abilities: play(fn('cxIceLance')) },
  // 乙太秘術師：若你在回合結束時控制奧秘，獲得 +2/+2
  EX1_274: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, cond: { c: 'secret' }, effects: [{ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }] }] },
  // 巫師學徒：你的法術消耗減少 (1)（但不會低於 1）
  EX1_608: { costAuras: [{ side: 'friendly', type: 'SPELL', add: -1, floor: 1 }] },
  // 肯瑞托法師：戰吼：本回合你打出的下一張奧秘消耗為 (0)
  EX1_612: { abilities: play({ e: 'pendingDiscount', d: { set: 0, secret: true, thisTurn: true } }) },
  // 法術反制：奧秘：當一個敵人對一個手下施放法術時，召喚一個 1/3 的手下作為新目標
  tt_010: { secret: true, flags: ['spellbenderSecret'], tokens: ['tt_010a'] },
  tt_010a: {},
  // ---------------------------------------------------------------- 聖騎士
  // 以眼還眼：奧秘：當你的英雄受到傷害時，對敵方英雄造成等量傷害
  EX1_132: { secret: true, abilities: [{ on: { k: 'secret', ev: 'heroDamaged' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: { dyn: 'eventAmount' } }] }] },
  // 神恩術：抽牌直到你的手牌數與你的對手一樣多
  EX1_349: { abilities: play(fn('cxDivineFavor')) },
  // 智慧祝福：選擇一個手下。每當它攻擊，抽一張牌
  EX1_363: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: [{ on: { k: 'attack', subject: 'self' }, effects: [draw(1)] }] }) },
  // 神聖憤怒：抽一張牌，並對一個手下造成等同其消耗的傷害
  EX1_365: { target: anyMinion, abilities: play(fn('cxHolyWrath')) },
  // 正義之劍：在你召喚一個手下後，使它獲得 +1/+1，此武器失去 1 點耐久度
  EX1_366: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('cxSwordOfJustice')] }] },
  // 血騎士見中立
  // ---------------------------------------------------------------- 牧師
  // 秘教暗影祭司：戰吼：取得一個攻擊力 2 以下的敵方手下的控制權
  EX1_091: { target: { filter: { type: 'minion', side: 'enemy', maxAttack: 2 }, optional: true }, abilities: play({ e: 'steal', target: { t: 'chosen' } }) },
  // 暗影狂亂：取得一個攻擊力 3 以下的敵方手下的控制權直到回合結束
  EX1_334: { target: { filter: { type: 'minion', side: 'enemy', maxAttack: 3 } }, abilities: play(fn('cxShadowMadness')) },
  // 思維竊取：複製你對手牌堆中的 2 張牌，加入你的手牌
  EX1_339: { abilities: play(fn('cxThoughtsteal')) },
  // 光耀之陣：在你的回合開始時，為一個受傷的友方角色恢復 3 點生命值
  EX1_341: { abilities: turnStart(fn('cxLightwell')) },
  // 心靈遊戲：把一個你對手牌堆中隨機手下的複製放到戰場上
  EX1_345: { abilities: play(fn('cxMindgames')), tokens: ['EX1_345t'] },
  EX1_345t: {},
  // 預言者維倫：你的法術與英雄能力造成的傷害與治療加倍
  EX1_350: { flags: ['velen', 'heroPowerDouble'] },
  // 奧金尼靈魂祭司：你的牌與英雄能力的治療改為造成傷害
  EX1_591: { flags: ['healIsDamage'] },
  // ---------------------------------------------------------------- 盜賊
  // 冷血：使一個手下 +2 攻擊力。連擊：改為 +4 攻擊力
  CS2_073: { target: anyMinion, abilities: play(cond(combo, [{ e: 'buff', target: { t: 'chosen' }, atk: 4 }], [{ e: 'buff', target: { t: 'chosen' }, atk: 2 }])) },
  // 背叛：迫使一個敵方手下對其相鄰手下造成傷害
  EX1_126: { target: enemyMinion, abilities: play(fn('cxBetrayal')) },
  // 毀滅之刃：戰吼：造成 1 點傷害。連擊：改為造成 2 點
  EX1_133: { target: { ...anyChar, optional: true }, abilities: play(cond(combo, [dmg(2, false)], [dmg(1, false)])) },
  // 碎顱：對敵方英雄造成 2 點傷害。連擊：下個回合把此牌移回你的手牌
  EX1_137: { abilities: play({ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 2, spell: true }, cond(combo, [{ e: 'delayed', turns: 1, effects: [{ e: 'addCard', card: 'EX1_137', count: 1, who: 'self' }] }])) },
  // 艾德溫‧范克里夫：連擊：本回合你每打出一張其他的牌，獲得 +2/+2
  EX1_613: { abilities: play(cond(combo, [fn('cxEdwin')])) },
  // ---------------------------------------------------------------- 薩滿
  // 先祖之魂：使一個手下獲得「亡語：重新召喚此手下」
  CS2_038: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, abilities: dr(fn('cxResummon')) }) },
  // ---------------------------------------------------------------- 術士
  // 惡魔衛士：嘲諷。戰吼：摧毀你的一個法力水晶
  EX1_301: { keywords: ['TAUNT'], abilities: play({ e: 'mana', kind: 'destroy', amount: 1 }) },
  // 暗影烈焰：消滅一個友方手下，並對所有敵方手下造成等同其攻擊力的傷害
  EX1_303: { target: friendlyMinion, abilities: play(fn('cxShadowflame')) },
  // 召喚傳送門：你的手下消耗減少 (2)，但不會低於 (1)
  EX1_315: { costAuras: [{ side: 'friendly', type: 'MINION', add: -2, floor: 1 }] },
  // 惡魔之火：對一個手下造成 2 點傷害。若它是友方惡魔，改為使它獲得 +2/+2
  EX1_596: { target: anyMinion, abilities: play(fn('cxDemonfire')) },
  // ---------------------------------------------------------------- 戰士
  // 狂暴：每有一個受傷的友方角色，抽一張牌
  EX1_392: { abilities: play({ e: 'draw', count: { dyn: 'damagedFriendlyChars' }, who: 'self' }) },
  // 阿拉希武器匠：戰吼：裝備一把 2/2 的武器
  EX1_398: { abilities: play({ e: 'equip', card: 'EX1_398t' }), tokens: ['EX1_398t'] },
  EX1_398t: {},
  // 致死打擊：造成 4 點傷害。若你的生命值為 12 以下，改為造成 6 點
  EX1_408: { target: anyChar, abilities: play(cond({ c: 'heroHealth', op: '<=', n: 12 }, [dmg(6)], [dmg(4)])) },
  // 升級！：若你有武器，使它獲得 +1/+1。否則裝備一把 1/3 的武器
  EX1_409: { abilities: play(cond({ c: 'weapon' }, [{ e: 'weaponBuff', atk: 1, dur: 1 }], [{ e: 'equip', card: 'EX1_409t' }])), tokens: ['EX1_409t'] },
  EX1_409t: {},
  // 命令怒吼：本回合你的手下的生命值無法被降到 1 以下。抽一張牌
  NEW1_036: { abilities: play(fn('cxCommandingShout'), draw(1)) },
};
