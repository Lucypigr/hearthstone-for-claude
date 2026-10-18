// ============================================================================
// 時光之穴（Caverns of Time）：冒牌貨、時空跳躍、未來的地點……
// 解析器看不懂的卡在這裡手動定義；自訂效果（cv 開頭）在 game.ts 的 customCaverns。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Effect, Keyword, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const summon = (card: string, count = 1): Effect => ({ e: 'summon', card, count, who: 'self' });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const friendlyMinion: TargetReq = { filter: { type: 'minion', side: 'friendly' } };
const amalgam: Effect = { e: 'summonRandom', pool: { type: 'MINION', cost: 1, anyClass: true }, count: 1, who: 'self' };

/** 冒牌貨：每個回合在手牌中時，變成一個隨機的 N 費手下並獲得某個效果 */
export const IMPOSTERS: Record<string, { cost: number; kw?: Keyword; spellDmg?: number }> = {
  WON_026: { cost: 3, kw: 'POISONOUS' },
  WON_039: { cost: 2, spellDmg: 1 },
  WON_077: { cost: 4, kw: 'STEALTH' },
};
export const CHROMIE_EPOCHS = ['WON_041t', 'WON_041t2', 'WON_041t3', 'WON_041t4'];
export const RUNI_LOCATIONS = ['WON_053t', 'WON_053t2', 'WON_053t3', 'WON_053t4', 'WON_053t5', 'WON_053t6', 'WON_053t7'];

export const CAVERNS_OVERRIDES: Record<string, Override> = {
  // ---------------------------------------------------------------- 德魯伊
  // 鼓舞：二選一：獲得一個空的法力水晶；或抽一張牌
  WON_014: { chooseOneIds: ['WON_014s', 'WON_014s2'] },
  WON_014s: { abilities: play({ e: 'mana', kind: 'empty', amount: 1 }) },
  WON_014s2: { abilities: play({ e: 'draw', count: 1, who: 'self' }) },
  // ---------------------------------------------------------------- 獵人
  // 敦霍爾德冒牌貨 / 黑色沼澤冒牌貨 / 海加爾山冒牌貨
  WON_026: {},
  WON_039: {},
  WON_077: {},
  // 時光迷途迅猛龍：回音。戰吼：演化你的時光迷途迅猛龍
  WON_027: { keywords: ['ECHO'], abilities: play(fn('adapt', { target: 'friendly', nameIncludes: 'Time-Lost Raptor' })) },
  // 加莫拉之試煉：召喚你牌堆中兩隻消耗 (3) 以下野獸的複製
  WON_028: { abilities: play(fn('cvJormungars')) },
  // ---------------------------------------------------------------- 法師
  // 尤格薩倫的僕從：戰吼：施放一個消耗 (5) 以上的隨機法術（目標隨機）
  WON_036: { abilities: play(fn('cvServant')) },
  // 時光盡頭的迪斯可：施放 5 個過去的隨機奧秘。在你的回合開始時，摧毀它們
  WON_040: { abilities: play(fn('cvDisco')) },
  // 時空跳躍者克羅米：戰吼：造訪一個歷史時代。把其他的洗入你的牌堆
  WON_041: { abilities: play(fn('cvChromie')), tokens: CHROMIE_EPOCHS },
  WON_041t: { castsWhenDrawn: true, abilities: play({ e: 'addRandom', pool: { type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, count: 2, who: 'self' }) },
  WON_041t2: { castsWhenDrawn: true, abilities: play({ e: 'buff', target: { t: 'all', filter: { type: 'minion', side: 'friendly' } }, atk: 2, hp: 2 }) },
  WON_041t3: { castsWhenDrawn: true, abilities: play({ e: 'addRandom', pool: { type: 'SPELL', anyClass: true }, count: 2, who: 'self' }) },
  WON_041t4: { castsWhenDrawn: true, abilities: play({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 2, spell: true }) },
  // ---------------------------------------------------------------- 聖騎士
  // 永恆祝福：使你手牌中四個隨機手下分別獲得 +4/+4、+3/+3、+2/+2 與 +1/+1
  WON_051: { abilities: play(fn('cvTimeless')) },
  // 青銅龍騎士：嘲諷。戰吼：若此手下有 5 點以上攻擊力，召喚一個它的複製
  WON_052: { keywords: ['TAUNT'], abilities: play({ e: 'cond', cond: { c: 'selfAttack', n: 5 }, then: [{ e: 'summonCopy', target: { t: 'self' }, count: 1 }] }) },
  // 時光探險家魯尼：戰吼：發現一個來自未來的地點！
  WON_053: { abilities: play(fn('cvRuni')), tokens: RUNI_LOCATIONS },
  WON_053t: { target: anyMinion, abilities: play(fn('cvOutskirts')) },
  WON_053t2: { abilities: play(fn('cvWindRider')) },
  WON_053t3: { abilities: play(fn('cvXenedar')) },
  WON_053t4: { abilities: play(fn('cvNighthold')) },
  WON_053t5: { abilities: play(fn('cvValdrakken')) },
  WON_053t6: { abilities: play(fn('cvKorune')) },
  WON_053t7: { target: friendlyMinion, abilities: play(fn('cvTempleOfEarth')) },
  // 永恆巨龍姆洛祖德：戰吼：若你的牌堆沒有重複的卡，發現一條龍。對所有其他手下造成等同其消耗的傷害
  WON_066: { abilities: play({ e: 'cond', cond: { c: 'noDuplicates' }, then: [fn('cvMurozond')] }) },
  // 甲蟲領主：戰吼：為你的對手召喚一個 0/1 的鑼。連擊：獲得突襲
  WON_079: {
    abilities: play({ e: 'summon', card: 'WON_079t', count: 1, who: 'opponent' }, { e: 'cond', cond: { c: 'combo' }, then: [{ e: 'buff', target: { t: 'self' }, keywords: ['RUSH'] }] }),
    tokens: ['WON_079t', 'WON_079t2'],
  },
  WON_079t: { flags: ['damagedEvenIfDead'], abilities: [{ on: { k: 'damaged', subject: 'self' }, effects: [fn('cvGong')] }] },
  WON_079t2: {},
  // ---------------------------------------------------------------- 薩滿
  // 石頁書頁：戰吼：抽一張超載卡。本回合你無法被超載
  WON_090: { abilities: play({ e: 'draw', count: 1, who: 'self', pool: { overload: true } }, fn('cvNoOverload')) },
  // 圖騰大全：召喚全部五種基本圖騰。超載：(1)
  WON_091: { overload: 1, abilities: play(summon('CS2_050'), summon('CS2_051'), summon('CS2_052'), summon('NEW1_009'), summon('CS2_058')), tokens: ['CS2_058'] },
  CS2_058: { abilities: [{ on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'buff', target: { t: 'random', filter: { type: 'minion', side: 'friendly', excludeSelf: true }, count: 1 }, atk: 1 }] }] },
  // ---------------------------------------------------------------- 術士
  // 大盜之巫：戰吼：召喚一個有嘲諷的 1/3 虛無行者。若你的對手手下比較多，重複一次
  WON_104: { abilities: play(fn('cvWitch')) },
  // 古加爾：戰吼：把本場對戰中你棄掉的牌全部加回你的手牌。它們消耗生命值而不是法力
  WON_105: { abilities: play(fn('cvChogall')) },
  // ---------------------------------------------------------------- 戰士
  // 過去的爆炸：獲得 2 個零件。召喚兩個 1/1 自爆機器人。把一個炸彈洗入你對手的牌堆
  WON_115: { abilities: play(fn('cvBlast'), summon('GVG_110t', 2)), tokens: ['GVG_110t', 'BOT_511t'] },
  // 象牙城堡：戰吼：發現一個嘲諷手下。獲得等同其消耗的護甲
  WON_116: { abilities: play(fn('cvIvoryRook')) },
  // ---------------------------------------------------------------- 中立
  // 未來的使者：戰吼：使你手牌中所有龍消耗減少 (1)，並獲得 +1/+1
  WON_140: { abilities: play(fn('cvEmissary')) },
  // 無盡混合體：激勵、狂怒、法術迸發、光榮擊殺與超殺：召喚一個隨機 1 費手下
  WON_143: {
    abilities: [
      { on: { k: 'heroPower', side: 'friendly' }, effects: [amalgam] },
      { on: { k: 'frenzy' }, once: true, effects: [amalgam] },
      { on: { k: 'spellCast', side: 'friendly' }, once: true, effects: [amalgam] },
      { on: { k: 'overkill' }, effects: [amalgam] },
      { on: { k: 'attack', subject: 'self', after: true }, effects: [fn('cvHonorable')] },
    ],
  },
  // 索麗多米：休眠 2 個回合。甦醒時，使你手牌中所有龍消耗減少 (4)
  WON_146: { abilities: play(fn('pdDormantSelf', { turns: 2 })), awaken: [fn('cvSoridormi')] },
  // 暗郡管家：每當你召喚一個生命值為 1 的手下，使它獲得聖盾
  WON_310: { abilities: [{ on: { k: 'summon', side: 'friendly' }, effects: [fn('cvSteward')] }] },
  // 升天者哈拉澤爾：法術傷害 +1。你的法術具有生命竊取
  WON_336: { spellDamage: 1, flags: ['spellLifestealAura'] },
  // 時光之風奧拉基爾：戰吼：抽一個衝鋒、聖盾、嘲諷與風怒手下。英雄能力：使你的英雄獲得聖盾，並在本回合獲得 +2 攻擊力與風怒
  WON_092h: {
    abilities: play(
      ...(['CHARGE', 'DIVINE_SHIELD', 'TAUNT', 'WINDFURY'] as Keyword[]).map((keyword): Effect => ({ e: 'draw', count: 1, who: 'self', pool: { type: 'MINION', keyword } })),
    ),
    heroPower: { effects: [fn('cvSwat'), { e: 'heroAttack', amount: 2 }, fn('wzHeroWindfury')] },
  },
  // 瓦斯坦‧鹿盔：亡語：從你的牌堆召喚一個嘲諷手下
  WON_345: { abilities: dr(fn('cvValstann')) },
};
