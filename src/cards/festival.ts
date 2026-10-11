// ============================================================================
// 腐化（暗月馬戲團、威茲班的工作坊等）與終章（傳奇音樂節、決戰荒蕪之地）：
// 解析器看不懂的卡在這裡手動定義。腐化版本是另一張卡（ID 多一個 t / a），
// 帶有腐化標籤的卡由 build-cards.ts 自動連結到它。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Condition, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const cond = (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({ e: 'cond', cond: c, then, else: otherwise });
const finale = (...effects: Effect[]): Effect => cond({ c: 'finale' }, effects);
const anyChar: TargetReq = { filter: { type: 'character', side: 'any' } };
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const allEnemies = { t: 'all' as const, filter: { type: 'character' as const, side: 'enemy' as const } };
const fourAttack = { type: 'minion' as const, side: 'any' as const, minAttack: 4, maxAttack: 4 };

export const FESTIVAL_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 腐化
  // 投環遊戲：發現一張奧秘並施放（腐化：發現 2 張）
  DMF_105: { abilities: play(fn('discoverSecretCast', { count: 1 })) },
  DMF_105t: { abilities: play(fn('discoverSecretCast', { count: 2 })) },
  // 提卡圖斯：移除你牌堆頂的 5 張牌（腐化：對手的牌堆）
  DMF_118: { abilities: play(fn('removeTopCards', { count: 5, opponent: false })) },
  DMF_118t: { abilities: play(fn('removeTopCards', { count: 5, opponent: true })) },
  // 狂歡小丑：嘲諷，戰吼：召喚 2 個自己的複製（腐化：填滿戰場）
  DMF_163: { abilities: play({ e: 'summonCopy', target: { t: 'self' }, count: 2 }) },
  DMF_163t: { abilities: play({ e: 'summonCopy', target: { t: 'self' }, count: 7 }) },
  // 暗言術：禁（可交易）：消滅一個 4 攻擊力的手下（腐化：全部）
  WON_064: { keywords: ['TRADEABLE'], target: { filter: fourAttack }, abilities: play({ e: 'destroy', target: { t: 'chosen' } }) },
  WON_064ts: { keywords: ['TRADEABLE'], abilities: play({ e: 'destroy', target: { t: 'all', filter: fourAttack } }) },
  // 氮氣加速毒藥：使一個手下獲得 +2 攻擊力（腐化：和你的武器）
  YOP_015: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2 }) },
  YOP_015t: { target: anyMinion, abilities: play({ e: 'buff', target: { t: 'chosen' }, atk: 2 }, { e: 'weaponBuff', atk: 2 }) },

  // ---------------------------------------------------------------- 終章
  // 食人魔寶石投擲者：終章：對隨機敵人造成 1 點傷害，你每有一顆法力水晶就一次
  DEEP_029: { abilities: play(finale(fn('gemtosser'))) },
  // 幽靈作家：戰吼：發現一張法術。終章：再發現一張
  ETC_088: { abilities: play({ e: 'discover', pool: { type: 'SPELL' } }, finale({ e: 'discover', pool: { type: 'SPELL' } })) },
  // 音量提升：抽 3 張法術。終章：發現其中一張的複製
  ETC_205: { abilities: play(fn('volumeUp')) },
  // 無限放大：發現一張法術，消耗減少 (1)。終章：回合結束時回到你的手牌
  ETC_206: {
    abilities: play(
      { e: 'discover', pool: { type: 'SPELL' } },
      { e: 'costMod', amount: -1, scope: 'it' },
      finale({ e: 'atEndOfTurn', effects: [{ e: 'addCard', card: 'ETC_206', count: 1, who: 'self' }] }),
    ),
  },
  // 重金屬狂信徒：戰吼：造成 2 點傷害。終章：對所有敵人
  ETC_209: {
    target: { ...anyChar, optional: true, when: { c: 'not', cond: { c: 'finale' } } },
    abilities: play(cond({ c: 'finale' }, [{ e: 'damage', target: allEnemies, amount: 2 }], [{ e: 'damage', target: { t: 'chosen' }, amount: 2 }])),
  },
  // 熱舞：從你的牌堆召喚兩個 1 費手下。終章：再召喚一個
  ETC_318: { abilities: play({ e: 'recruit', count: 2, cost: 1 }, finale({ e: 'recruit', count: 1, cost: 1 })) },
  // 和弦同步：選擇一個手下，將它的複製加入你的手牌。終章：兩者都獲得 +1/+2
  ETC_338: { target: anyMinion, abilities: play(fn('syncChord')) },
  // 主歌段：使你的英雄本回合獲得 +2 攻擊力，獲得 2 點護甲。終章：打出你的上一個段落
  ETC_363: { abilities: play({ e: 'heroAttack', amount: 2 }, { e: 'armor', amount: 2 }, finale(fn('playLastRiff'))) },
  // 副歌段：抽一張手下牌，使其 +3/+3。終章：打出你的上一個段落
  ETC_364: {
    abilities: play({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION' } }, { e: 'buff', target: { t: 'it' }, atk: 3, hp: 3 }, finale(fn('playLastRiff'))),
  },
  // 橋段：召喚一個 3/4 嘲諷搖滾客和一個 4/3 突襲搖滾客。終章：打出你的上一個段落
  ETC_365: {
    abilities: play({ e: 'summon', card: 'ETC_365t', count: 1, who: 'self' }, { e: 'summon', card: 'ETC_365t2', count: 1, who: 'self' }, finale(fn('playLastRiff'))),
    tokens: ['ETC_365t', 'ETC_365t2'],
  },
  // 夏日花童：戰吼：抽兩張消耗 (6) 以上的牌。終章：它們的消耗減少 (1)
  ETC_376: { abilities: play(fn('flowerchild')) },
  // 海盜之王東尼：戰吼：用對手牌堆的複製取代你的牌堆。終章：抽一張牌
  ETC_541: { abilities: play(fn('copyOpponentDeck'), finale({ e: 'draw', count: 1, who: 'self' })) },
  // 慶典保全：嘲諷，終章：強迫所有敵方手下攻擊這個手下
  ETC_542: { abilities: play(finale(fn('forceAttackSelf'))) },
  // 穿越烈焰：使一個手下獲得突襲。終章：還有 +1/+1
  JAM_017: {
    target: anyMinion,
    abilities: play({ e: 'buff', target: { t: 'chosen' }, keywords: ['RUSH'] }, finale({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 })),
  },
};
