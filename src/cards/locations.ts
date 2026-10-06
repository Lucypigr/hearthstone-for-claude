// ============================================================================
// 標準模式剩下的地點牌（浩劫與重生、逃離紫羅蘭堡、翡翠夢境、安戈洛失落之城）
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };

export const LOCATION_OVERRIDES: Record<string, Override> = {
  // 紅玉聖所：本回合你的下一次治療效果改為造成傷害
  CATA_301: { abilities: play(fn('coLifebind')) },
  // 守護巨龍之室：選擇你手牌中的一個手下，使其 +2/+2
  CATA_477: { abilities: play(fn('coChamber')) },
  // 暮光神殿：預兆。抽一張牌
  CATA_492: { abilities: play(fn('herald'), { e: 'draw', count: 1, who: 'self' }) },
  // 被奴役的奈斯比拉：造成 1 點傷害。在你施放一個邪能法術後重新開啟。亡語：召喚『被解放的』奈斯比拉
  CATA_527: {
    reopen: 'fel',
    target: anyChar,
    abilities: [...play({ e: 'damage', target: { t: 'chosen' }, amount: 1 }), ...dr({ e: 'summon', card: 'CATA_527t2', count: 1, who: 'self' })],
    tokens: ['CATA_527t2'],
  },
  CATA_527t2: { abilities: [{ on: { k: 'spellCast', side: 'friendly', school: 'FEL' }, effects: [fn('coNaga')] }] },
  // 爆發的火山：對所有敵人造成 $3 點傷害（隨機分散）。若你本回合打出過火焰法術，再造成 $3 點
  CATA_584: { abilities: play(fn('coVolcano')) },
  // 靜謐的空地：使一個手下獲得 +2 生命值與嘲諷。它會沉睡到你的下個回合結束
  MEND_044: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, hp: 2, keywords: ['TAUNT'] }, fn('coClearing')) },
  // 孤獨尖塔：召喚一個屬性值等同你手牌數的惡魔。它攻擊一個隨機敵方手下
  JAIL_511: { abilities: play(fn('coSpire')), tokens: ['JAIL_511t'] },
  JAIL_511t: {},
  // 地下網路：召喚一隻 2/1 的老鼠，亡語：抽一張牌
  JAIL_877: { abilities: play({ e: 'summon', card: 'JAIL_877t', count: 1, who: 'self' }), tokens: ['JAIL_877t'] },
  JAIL_877t: { abilities: dr({ e: 'draw', count: 1, who: 'self' }) },
  // 祖拉瑪特的監獄：選擇一張牌棄掉，召喚一個 5/5 的嘲諷手下。亡語：釋放祖拉瑪特，他每回合打出一張
  JAIL_887: { abilities: [...play(fn('coPrison')), ...dr({ e: 'summon', card: 'JAIL_887t2', count: 1, who: 'self' })], tokens: ['JAIL_887t2', 'JAIL_887t3'] },
  JAIL_887t2: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('coZuramat')] }] },
  JAIL_887t3: { keywords: ['TAUNT'] },
  // 低安全區：獲得一個隨機薩滿手下。在你打出另一張牌之前，它無法被打出
  JAIL_987: { abilities: play(fn('coLowSecurity')) },
  // 被汙染的聖劍：生命竊取
  LEG_RLK_067: { keywords: ['LIFESTEAL'] },
  // 墮落之龍的巢穴：選擇一條友方龍。召喚一顆 0/2 的蛋，它會孵化成那條龍的複製
  EDR_454: { target: { filter: { type: 'minion', side: 'friendly', race: 'DRAGON' } }, abilities: play(fn('coClutch')), tokens: ['EDR_454t'] },
  EDR_454t: { abilities: dr(fn('coHatch')) },
  // 禁忌神殿：花光你所有的法力，施放一個消耗等同的隨機法術
  EDR_520: { abilities: play(fn('coForbidden')) },
  // 艾梅達希爾：召喚一個 @ 費手下、獲得 @ 點護甲、抽 @ 張牌、重新整理 @ 顆法力水晶（每次使用提升！）
  FIR_907: { abilities: play(fn('coAmirdrassil')) },
  // 血瓣生態區：發現一個暫時的 1 費手下
  TLC_449: { abilities: play(fn('coDiscoverSet', { pool: { type: 'MINION', cost: 1 }, temp: true })) },
};

// ====================================================== 其他系列中尚未收錄的地點牌
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const enemyMinion: TargetReq = { filter: { type: 'minion', side: 'enemy' } };
const buff = (atk: number, hp: number, extra: Partial<Extract<Effect, { e: 'buff' }>> = {}): Effect => ({ e: 'buff', target: { t: 'chosen' }, atk, hp, ...extra });
const REVENDRETH: Record<string, Override> = {
  // 贖罪大教堂：使一個手下 +2/+1，並抽一張牌
  REV_290: { target: anyMinion, abilities: play(buff(2, 1), { e: 'draw', count: 1, who: 'self' }) },
  // 樹籬迷宮：觸發一個友方手下的亡語
  REV_333: { target: friendlyMinion, abilities: play(fn('coTriggerDr')) },
  // 城堡犬舍：使一個友方手下 +2 攻擊力。若它是野獸，使其獲得突襲
  REV_362: { target: friendlyMinion, abilities: play(fn('coKennels')) },
  // 邪惡圖書館：使一個友方手下 +1/+1。你每控制一個小鬼，重複一次
  REV_371: { target: friendlyMinion, abilities: play(buff(1, 1), { e: 'repeat', times: { dyn: 'friendlyImps' }, effects: [buff(1, 1)] }) },
  // 夜幕聖所：凍結一個手下。召喚一個 2/2 的不穩定骷髏
  REV_602: { target: anyMinion, abilities: play({ e: 'freeze', target: { t: 'chosen' } }, { e: 'summon', card: 'REV_845', count: 1, who: 'self' }), tokens: ['REV_845'] },
  // 罪石墓園：召喚一個 @/@ 的鬼魂（本回合你每打出一張其他的牌就 +1/+1）
  REV_750: { abilities: play(fn('coGhost')), tokens: ['REV_750t2'] },
  REV_750t2: {},
  // 泥沼水池：將一個友方手下變成消耗多 (1) 的手下
  REV_923: { target: friendlyMinion, abilities: play({ e: 'evolve', target: { t: 'chosen' }, amount: 1 }) },
  // 遺物庫：本回合你打出的下一個遺物施放兩次
  REV_942: { abilities: play(fn('coRelicTwice')) },
  // 大廳：將一個手下的攻擊力與生命值設為 3
  REV_983: { target: anyMinion, abilities: play({ e: 'setStats', target: { t: 'chosen' }, atk: 3, hp: 3 }) },
  // 血紅深淵：對一個手下造成 1 點傷害，並使其 +2 攻擊力
  REV_990: { target: anyMinion, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 1 }, buff(2, 0)) },
};
for (const [id, ov] of Object.entries(REVENDRETH)) {
  LOCATION_OVERRIDES[id] = ov;
  if (/^REV_\d{3}$/.test(id)) LOCATION_OVERRIDES[`CORE_${id}`] = ov;
}

Object.assign(LOCATION_OVERRIDES, {
  // 赤紅瀚洋：選擇一個受傷的手下，召喚它的複製，休眠一個回合
  DEEP_019: { target: { filter: { type: 'minion', side: 'any', damaged: true } }, abilities: play(fn('coExpanse')) },
  // 粉絲俱樂部：為所有友方角色恢復 #3 點生命值
  ETC_449: { abilities: play({ e: 'heal', target: { t: 'all', filter: { type: 'character', side: 'friendly' } }, amount: 3 }) },
  // 搖滾區：花費 3 具屍體，使一個友方手下獲得復生
  ETC_533: { target: friendlyMinion, abilities: play(fn('coMosh')) },
  // 舞池：使你的手下獲得突襲
  JAM_009: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, keywords: ['RUSH'] }) },
  // 木偶劇場：選擇一個敵方手下，獲得它的 1/1、消耗為 (1) 的複製
  MIS_919: { target: enemyMinion, abilities: play(fn('coPuppet')) },
  // 建築區：消滅一個友方手下，召喚一個具有突襲的 4/5 不死族
  NX2_036: { target: friendlyMinion, abilities: play({ e: 'destroy', target: { t: 'chosen' } }, { e: 'summon', card: 'NX2_036t', count: 1, who: 'self' }), tokens: ['NX2_036t'] },
  NX2_036t: { keywords: ['RUSH'] },
  // 叢林健身房：對一個隨機敵人造成 1 點傷害。你每控制一隻友方野獸，重複一次
  TOY_359: { abilities: play({ e: 'repeat', times: { dyn: 'friendlyRace', race: 'BEAST', base: 1 }, effects: [{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 1 }] }) },
  // 童話森林：抽一個戰吼手下，它的消耗減少 (1)
  TOY_507: { abilities: play(fn('coFairyForest')) },
  // 水晶灣：本回合你召喚的下一個手下屬性值設為 4/4
  TOY_512: { abilities: play(fn('coCove')) },
  // 魔法玩偶屋：本回合獲得法術傷害 +1
  TOY_850: { abilities: play(fn('coDollhouse')) },
  // 尤格薩倫的牢籠：選擇一個角色，對它施放 4 個隨機法術（盡可能以它為目標）
  TTN_090: { target: anyChar, abilities: play(fn('coPrisonYogg')) },
  // 意志之爐：選擇一個友方手下，召喚一個與其屬性值相同、具有突襲的巨人
  TTN_465: { target: friendlyMinion, abilities: play(fn('coForgeWills')), tokens: ['TTN_465t'] },
  TTN_465t: { keywords: ['RUSH'] },
  // 雜貨小舖：抽一張牌。若你本回合打出它，重新開啟
  VAC_334: { reopen: 'drawnPlayed', abilities: play(fn('coKnick')) },
  // 鸚鵡聖所：你的下一個戰吼手下消耗減少 (1)。在你打出戰吼手下後，重新開啟
  VAC_409: { reopen: 'battlecryMinion', abilities: play({ e: 'pendingDiscount', d: { amount: 1, battlecry: true } }) },
  // 地平線之緣：對所有敵人造成 $3 點傷害（隨機分散）。在一個友方手下死亡後，重新開啟
  VAC_425: { reopen: 'minionDied', abilities: play({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 3 }) },
  // 登山步道：發現一個嘲諷手下。在你獲得護甲後，重新開啟
  VAC_517: { reopen: 'armor', abilities: play(fn('coDiscoverSet', { pool: { type: 'MINION', keyword: 'TAUNT' } })) },
  // 潮間帶：發現一個消耗 (3) 以下的法術。在你施放法術後，重新開啟
  VAC_522: { reopen: 'spell', abilities: play(fn('coDiscoverSet', { pool: { type: 'SPELL', maxCost: 3 } })) },
  // 危險的懸崖：召喚兩個具有衝鋒的 1/1 海盜。在你的英雄攻擊後，重新開啟
  VAC_929: { reopen: 'heroAttack', abilities: play({ e: 'summon', card: 'VAC_T_PIRATE', count: 2, who: 'self' }) },
  // 塞納里奧要塞：本回合你打出的下一張二選一卡牌同時具有兩種效果
  WON_015: { abilities: play(fn('coHold')) },
  // 維希度斯之室：查看你手牌中的 3 張牌，選擇一張棄掉。抽 2 張牌
  WON_103: { abilities: play(fn('coViscidus')) },
} as Record<string, Override>);

