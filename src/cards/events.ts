// ============================================================================
// 活動限定卡（系列 1941：古神降臨、始源領主、時間之沙…）：手動定義的卡牌效果。
// 這個檔案的內容會併入 overrides.ts 的 OVERRIDES。
// ============================================================================
import type { Override } from './overrides';
import type { Ability, Effect, TargetReq } from '../engine/types';

const play = (...effects: Effect[]): Ability[] => [{ on: { k: 'play' }, effects }];
const dr = (...effects: Effect[]): Ability[] => [{ on: { k: 'deathrattle' }, effects }];
const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });
const anyMinion: TargetReq = { filter: { type: 'minion', side: 'any' } };
const optional = (t: TargetReq): TargetReq => ({ ...t, optional: true });
const ESSENCES = ['CATA_EVENT_110t2', 'CATA_EVENT_110t3', 'CATA_EVENT_110t4', 'CATA_EVENT_110t5', 'CATA_EVENT_110t6', 'CATA_EVENT_110t7'];

export const EVENT_OVERRIDES: Record<string, Override> = {
  // 古神降臨：抽 2 張手下牌，補滿 5 點法力水晶；這個回合只能打出手下牌
  BE_EVENT_100: { abilities: play({ e: 'draw', count: 2, who: 'self', pool: { type: 'MINION' } }, { e: 'mana', kind: 'refresh', amount: 5 }, fn('coOnlyPlay', { type: 'MINION' })) },
  // 泰坦降臨：抽 2 張法術牌，補滿 6 點法力水晶；這個回合只能打出法術牌
  BE_EVENT_101: { abilities: play({ e: 'draw', count: 2, who: 'self', pool: { type: 'SPELL' } }, { e: 'mana', kind: 'refresh', amount: 6 }, fn('coOnlyPlay', { type: 'SPELL' })) },
  // 黑暗地貌改造：對一個手下造成 5 點傷害，向左右延伸，傷害每格減 1
  BE_EVENT_102: { target: anyMinion, abilities: play(fn('coTerraform')) },
  // 始源領主：戰吼：獲得一張過去的隨機巨型手下
  CATA_EVENT_000: { abilities: play(fn('coPrimordial')) },
  // 毀滅鳳凰：戰吼：選擇一張手牌點燃，3 個回合後棄掉它並召喚一個這張手下的複製
  CATA_EVENT_001: { abilities: play(fn('coPhoenix')) },
  // 凶惡的烈焰使者：戰吼：如果你這個回合打出過火焰法術，消滅一個手下
  CATA_EVENT_002: { target: optional(anyMinion), abilities: play(fn('coBlazer')) },
  // 破碎的龍魂：對戰開始：分裂成 6 個龍族精華
  CATA_EVENT_110: { startOfGame: 'dragonSoul', tokens: [...ESSENCES, 'CATA_EVENT_110t6t'] },
  // 福利社惡棍：預備；戰吼：花光所有法力，召喚一個隨機的同消耗手下
  CATA_EVENT_400: { prepare: true, abilities: play(fn('coCommissary')) },
  // 挖地道的地占師：預備；法術傷害 +1
  CATA_EVENT_401: { prepare: true, spellDamage: 1 },
  // 致命賄賂：消滅一個手下，給你的對手一枚幸運幣。連擊：你也獲得一枚
  CATA_EVENT_402: {
    target: anyMinion,
    abilities: play(
      { e: 'destroy', target: { t: 'chosen' } },
      { e: 'addCard', card: 'GAME_005', count: 1, who: 'opponent' },
      { e: 'cond', cond: { c: 'combo' }, then: [{ e: 'addCard', card: 'GAME_005', count: 1, who: 'self' }] },
    ),
  },
  // 眼尖的守望者：戰吼：抽一張牌，這個回合它的消耗減少 (1)
  EDR_950: { abilities: play(fn('coLookout')) },
  // 瓦特芬：戰吼：發現一個手下，選到可疑的那個就獲得 +1/+1
  JAIL_EVENT_100: { abilities: play(fn('coWatfin')) },
  // 靈魂自焚：你的英雄能力變成「崩塌之星」；已經是的話，傷害 +1
  JAIL_EVENT_101: { abilities: play(fn('coSoulImmo')) },
  // 絕望的賄賂：為雙方各召喚兩個 2 費手下，把你的手下變形成消耗 (1) 點更高的手下
  JAIL_EVENT_102: { abilities: play(fn('coDesperateBribe')) },
  // 黑鐵先驅者：亡語：召喚一個 0/7 的末日預言者
  TIME_EVENT_300: { abilities: dr({ e: 'summon', card: 'NEW1_021', count: 1, who: 'self' }) },
  // 毀滅信徒：戰吼：隨機消滅一個其他手下，你每有一張手牌中的龍就重複一次
  TIME_EVENT_301: { abilities: play(fn('coDisciple')) },
  // 歡迎回家！：重新開啟一個地點，使其獲得「亡語：召喚一個隨機 3 費手下」
  TIME_EVENT_997: { abilities: play(fn('coWelcomeHome')) },
  // 時光守護者魯尼：戰吼：把你手牌中所有手下送往 2 個回合後的未來，回來時 +5/+5
  TIME_EVENT_998: { abilities: play(fn('coSendFuture')) },
  // 時間之沙：倒轉。發現一張任意職業的法術（倒轉後只能發現你的職業）
  TIME_EVENT_999: { rewind: 1, tokens: ['TIME_000ta', 'TIME_000tb'], abilities: play(fn('coSands')) },
  // 衝破大門：支線任務：打出 3 個野獸或不死族。獎勵：製作一個消耗減少 (3) 的殭屍獸
  TLC_EVENT_400: { quest: { kind: 'beastUndead', goal: 3, reward: 'EVT_ZOMBEAST' } },
  // 終末使者之杖：亡語：消滅所有手下
  TLC_EVENT_402: { abilities: dr({ e: 'destroy', target: { t: 'all', filter: { type: 'minion', side: 'any' } } }) },

  // 龍族精華
  CATA_EVENT_110t2: { target: { filter: { type: 'character', side: 'enemy' } }, abilities: play(fn('coEssence')) },
  CATA_EVENT_110t3: { abilities: play(fn('coEssence')) },
  CATA_EVENT_110t4: { abilities: play(fn('coEssence')) },
  CATA_EVENT_110t5: { abilities: play(fn('coEssence')) },
  CATA_EVENT_110t6: { abilities: play(fn('coEssence')), tokens: ['CATA_EVENT_110t6t'] },
  CATA_EVENT_110t6t: {},
  CATA_EVENT_110t7: { abilities: play(fn('coEssence')) },
};
