// ============================================================================
// 古神碎碎念（Whispers of the Old Gods）剩下的卡：禁忌法術、古神、毒素……
// 解析器看不懂的卡在這裡手動定義；自訂效果（og 開頭）在 game.ts 的 customOldGods。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const TOXINS = ['OG_080b', 'OG_080c', 'OG_080d', 'OG_080e', 'OG_080f'];
/** 在攻擊並消滅一個手下後 */
const afterKill = (...effects: Effect[]): Ability[] => [{ on: { k: 'attack', subject: 'self', after: true }, effects: [fn('ogIfKilled', { effects })] }];

export const OLDGODS_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 中立
  // 異種蟲群：只有在你的英雄本回合攻擊過時才能攻擊
  OG_034: { flags: ['attackIfHeroAttacked'] },
  // 雅夏拉吉，狂怒釋放者：在你的回合結束時，把你牌堆中的一個手下放到戰場上
  OG_042: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('ogRecruit')] }] },
  // 黑暗代言者：戰吼：與一個友方手下交換屬性值
  OG_102: { target: optional(friendlyMinion), abilities: play(fn('ogDarkspeaker')) },
  // 變形者澤魯斯：每個回合在你的手牌中時，變形成一個隨機手下
  OG_123: {},
  // 恩佐斯，腐化者：戰吼：召喚本場對戰中死亡的友方亡語手下
  OG_133: { abilities: play(fn('ogNzoth')) },
  // 尤格薩倫，希望的終結：戰吼：本場對戰中你每施放過一張法術，就施放一個隨機法術（目標隨機）
  OG_134: { abilities: play(fn('ogYogg')) },
  // 奈幽巴預言者：在你的回合開始時，此牌的消耗減少 (1)
  OG_138: { handAbilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('ogProphet')] }] },
  // 腐化的先知：戰吼：對所有非魚人手下造成 2 點傷害
  OG_161: { abilities: play(fn('ogCorruptedSeer')) },
  // 上古之血：若你在回合結束時控制兩個此手下，把它們合併成上古之神
  OG_173: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [fn('ogAncientOne')] }], tokens: ['OG_173a'] },
  OG_173a: {},
  // 無面蹣跚者：嘲諷。戰吼：複製一個友方手下的攻擊力與生命值
  OG_174: { keywords: ['TAUNT'], target: optional(friendlyMinion), abilities: play(fn('ogShambler')) },
  // 上古先驅：在你的回合開始時，把你牌堆中的一個 10 費手下放入你的手牌
  OG_290: { abilities: [{ on: { k: 'turnStart', whose: 'mine' }, effects: [fn('ogHarbinger')] }] },
  // 恐怖魔怪：每當此手下攻擊並消滅一個手下，獲得 +2/+2
  OG_300: { abilities: afterKill({ e: 'buff', target: { t: 'self' }, atk: 2, hp: 2 }) },
  // 死亡之翼，龍王：亡語：把你手牌中所有的龍放到戰場上
  OG_317: { abilities: dr(fn('ogDeathwing')) },
  // 黑水海盜：你的武器消耗減少 (2)
  OG_322: { costAuras: [{ side: 'friendly', type: 'WEAPON', add: -2 }] },
  // 黑暗漁人納特：在你對手的回合開始時，他們有 50% 的機率多抽一張牌
  OG_338: { abilities: [{ on: { k: 'turnStart', whose: 'opp' }, effects: [fn('ogNat')] }] },
  // 尤格薩倫的僕從 / 古加爾 / 暗郡管家 / 升天者哈拉澤爾（同時光之穴的重印卡）
  OG_087: { abilities: play(fn('cvServant')) },
  OG_121: { abilities: play(fn('cvChogall')) },
  OG_310: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('cvSteward')] }] },
  OG_209: { spellDamage: 1, flags: ['spellLifestealAura'] },
  // ---------------------------------------------------------------- 德魯伊
  // 禁忌古樹：戰吼：花費你所有的法力。每花費 1 點法力獲得 +1/+1
  OG_051: { abilities: play(fn('ogForbidden', { kind: 'ancient' })) },
  // ---------------------------------------------------------------- 獵人
  // 寄生：使你的手下獲得「亡語：把一張隨機野獸加入你的手牌」
  OG_045: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, abilities: dr({ e: 'addRandom', pool: { type: 'MINION', race: 'BEAST', anyClass: true }, count: 1, who: 'self' }) }) },
  // 淒涼追獵者：戰吼：使你手牌中所有亡語手下獲得 +1/+1
  OG_292: { abilities: play(fn('ogForlorn')) },
  // 巨型沙蟲：每當此手下攻擊並消滅一個手下，它可以再次攻擊
  OG_308: { abilities: afterKill(fn('ogAttackAgain')) },
  // 哈霍蘭公主：戰吼：觸發一個友方手下的亡語
  OG_309: { target: optional(friendlyMinion), abilities: play(fn('ogHuhuran')) },
  // ---------------------------------------------------------------- 法師
  // 粉碎：消滅一個被凍結的手下
  OG_081: { target: { filter: { type: 'minion', side: 'any', frozen: true } }, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  // 禁忌之焰：花費你所有的法力。對一個手下造成等量傷害
  OG_086: { target: anyMinion, abilities: play(fn('ogForbidden', { kind: 'flame' })) },
  // ---------------------------------------------------------------- 聖騎士
  // 卑劣的審判官：戰吼：你的英雄能力變成「召喚一個 1/1 魚人」
  OG_006: { abilities: play({ e: 'replaceHeroPower', power: 'OG_006b' }), tokens: ['OG_006a'] },
  OG_006a: {},
  // 禁忌治療：花費你所有的法力。恢復兩倍的生命值
  OG_198: { target: anyChar, abilities: play(fn('ogForbidden', { kind: 'healing' })) },
  // 集結之刃：戰吼：使你有聖盾的手下獲得 +1/+1
  OG_222: { abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly', keyword: 'DIVINE_SHIELD' } }, atk: 1, hp: 1 }) },
  // ---------------------------------------------------------------- 牧師
  // 禁忌塑形：花費你所有的法力。召喚一個消耗等量的隨機手下
  OG_101: { abilities: play(fn('ogForbidden', { kind: 'shaping' })) },
  // 擁抱暗影：本回合你的治療效果改為造成傷害
  OG_104: { abilities: play(fn('healDamage')) },
  // 傳令官沃拉茲：戰吼：為你的每個其他手下召喚一個 1/1 的複製
  OG_316: { abilities: play(fn('ogVolazj')) },
  // 幻影暗影：亡語：複製你對手牌堆中的一張牌，加入你的手牌
  OG_335: { abilities: dr(fn('lkMindEater')) },
  // ---------------------------------------------------------------- 盜賊
  // 薊茶：抽一張牌。把它的 2 張複製加入你的手牌
  OG_073: { abilities: play(fn('ogThistleTea')) },
  // 毒心者夏克里爾：戰吼與亡語：把一張隨機毒素牌加入你的手牌
  OG_080: { abilities: [...play(fn('ogToxin')), ...dr(fn('ogToxin'))], tokens: TOXINS },
  OG_080b: { abilities: play({ e: 'draw', count: 1, who: 'self' }) },
  OG_080c: { target: friendlyMinion, abilities: play({ e: 'returnToHand', target: { t: 'chosen' }, costChange: -2 }) },
  OG_080d: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 3 }) },
  OG_080e: { target: friendlyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, keywords: ['STEALTH'], untilNextTurn: true }) },
  OG_080f: { target: anyChar, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 2, spell: true }) },
  // 暗影打擊：對一個未受傷的角色造成 5 點傷害
  OG_176: { target: { filter: { type: 'character', side: 'any', undamaged: true } }, abilities: play({ e: 'damage', target: { t: 'chosen' }, amount: 5, spell: true }) },
  // 暗影施法者：戰吼：選擇一個友方手下。把一張它的 1/1 複製加入你的手牌，消耗為 (1)
  OG_291: { target: optional(friendlyMinion), abilities: play(fn('ogShadowcaster')) },
  // ---------------------------------------------------------------- 薩滿
  // 原始融合：你每有一個圖騰，使一個手下獲得 +1/+1
  OG_023: { target: anyMinion, abilities: play(fn('ogPrimalFusion')) },
  // 永恆哨兵：戰吼：解除你被超載的法力水晶
  OG_026: { abilities: play(fn('ogUnlockOverload')) },
  // 進化：把你的手下變形成消耗多 (1) 的隨機手下
  OG_027: { abilities: play(fn('ogEvolve', { all: true })) },
  // 進化大師：戰吼：把一個友方手下變形成消耗多 (1) 的隨機手下
  OG_328: { target: optional(friendlyMinion), abilities: play(fn('ogEvolve')) },
  // ---------------------------------------------------------------- 術士
  // 禁忌儀式：花費你所有的法力。召喚同等數量的 1/1 觸手
  OG_114: { abilities: play(fn('ogForbidden', { kind: 'ritual' })), tokens: ['OG_114a'] },
  OG_114a: {},
  // 棄絕黑暗：把你的英雄能力與術士牌換成另一個職業的。那些牌消耗減少 (1)
  OG_118: { abilities: play(fn('ogRenounce')) },
  // 末日！：消滅所有手下。每消滅一個抽一張牌
  OG_239: { abilities: play(fn('ogDoom')) },
  // ---------------------------------------------------------------- 戰士
  // 觸手為臂：亡語：把此牌移回你的手牌
  OG_033: { abilities: dr({ e: 'addCard', card: 'OG_033', count: 1, who: 'self' }) },
  // 瑪爾考拉克：戰吼：裝備一把隨機武器
  OG_220: { abilities: play(fn('ogMalkorok')) },
  // 鮮血戰士：把每個受傷友方手下的複製加入你的手牌
  OG_276: { abilities: play(fn('ogBloodWarriors')) },
};
export const OG_TOXINS = TOXINS;
