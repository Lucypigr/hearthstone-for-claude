// 黑暗帝國霸業：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

type Cls = 'MAGE' | 'ROGUE' | 'PALADIN' | 'WARRIOR' | 'HUNTER' | 'DRUID' | 'WARLOCK' | 'DEMONHUNTER' | 'PRIEST' | 'SHAMAN' | 'DEATHKNIGHT';

function newGame(opts: { seed?: number; cls?: Cls; deck?: string[] } = {}): Game {
  const g = Game.create({
    decks: [opts.deck ?? Array(30).fill(FILLER), Array(30).fill(FILLER)],
    classes: [opts.cls ?? 'MAGE', 'WARRIOR'],
    names: ['玩家', '電腦'],
    ai: [false, false],
    seed: opts.seed ?? 42,
    first: 0,
  });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, cardId: string, mana = 10): HandCard {
  const hc = g.newHandCard(cardId);
  hc.enteredTurn = g.s.turn - 1;
  const p = g.s.players[g.s.current];
  p.hand.push(hc);
  p.mana = mana;
  p.maxMana = Math.max(p.maxMana, mana);
  return hc;
}

function put(g: Game, cardId: string, pid: PlayerId): Minion {
  const m = g.makeMinion(pid, cardId);
  m.sleeping = false;
  g.s.players[pid].board.push(m);
  g.recalcAuras();
  return m;
}

function resolve(g: Game) {
  while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
}

function play(g: Game, cardId: string, extra: { target?: number; position?: number; option?: number } = {}) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, ...extra }), cardId).toBe(true);
  resolve(g);
  return hc;
}

function endTurns(g: Game, n: number) {
  for (let i = 0; i < n; i++) {
    g.apply({ type: 'endTurn' });
    resolve(g);
  }
}

const ids = (g: Game, pid: PlayerId) => g.s.players[pid].board.map((m) => m.cardId);

import { assembledDef, assemblePool } from './assemble';

describe('黑暗帝國霸業', () => {
  it('收錄全部可收藏卡', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1994).length).toBe(135);
  });

  it('組裝卡池：標記可組裝的手下都能拆成上下兩段', () => {
    const marked = new Set(ALL_CARDS().filter((c) => c.collectible && c.type === 'MINION' && c.assembleText).map((c) => c.name));
    const pool = new Set(assemblePool().map((c) => c.name));
    // 原始熊貓人的上半段（「若有這張卡之外的卡進入你的手中」）在引擎中不是觸發時機，無法拆開
    expect([...marked].filter((n) => !pool.has(n))).toEqual(['原始熊貓人']);
    expect(assemblePool().length).toBeGreaterThan(200);
  });

  it('組裝：保留原本手下的屬性值與消耗，換掉一段卡面', () => {
    const g = newGame({ cls: 'HUNTER' });
    const n = g.s.players[0].hand.length;
    play(g, 'BE_851'); // 山谷管家：組裝一隻野獸
    const hand = g.s.players[0].hand;
    expect(hand.length).toBe(n + 1);
    const hc = hand[hand.length - 1];
    expect(hc.assembled).toBeTruthy();
    const base = ALL_CARDS().find((c) => c.id === hc.assembled!.base)!;
    expect(base.races).toContain('BEAST');
    const def = g.handDef(hc);
    expect(def.cost).toBe(base.cost);
    expect(def.attack).toBe(base.attack);
    expect(def.text).not.toBe(base.text);
    // 打出組裝出的手下不會出錯
    g.s.players[0].mana = 10;
    const target = def.target ? g.s.players[1].hero.uid : undefined;
    expect(g.apply({ type: 'play', handUid: hc.uid, target })).toBe(true);
    resolve(g);
    expect(g.s.players[0].board.some((m) => m.cardId === base.id && m.assembled)).toBe(true);
  });

  it('組裝：下半段換成另一個手下的效果', () => {
    // 用卡池中兩張沒有條件的戰吼手下組合：觸發時機留著，效果換成另一張的
    const pool = assemblePool().filter((c) => c.abilities?.length === 1 && c.abilities[0].on.k === 'play' && !c.abilities[0].cond && c.abilities[0].effects[0]?.e !== 'cond');
    const [a, b] = pool;
    const def = assembledDef({ base: a.id, donor: b.id, half: 'bottom' });
    expect(def.text).toBe(a.assembleText![0] + b.assembleText![1]);
    expect(def.abilities?.[0].on.k).toBe('play');
    expect(JSON.stringify(def.abilities?.[0].effects)).toBe(JSON.stringify(b.abilities![0].effects));
    expect(def.attack).toBe(a.attack);
    expect(def.cost).toBe(a.cost);
  });

  it('拉頡：組裝出的手下變成被動英雄能力', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'BE_004');
    const p = g.s.players[0];
    expect(p.heroPower.id).toBe('BE_004p');
    expect(g.powerInfo(p).text).not.toContain('{0}');
    expect((p.eternal ?? []).some((e) => e.sourceCardId === 'BE_004')).toBe(true);
  });

  it('克蘇恩技能：觸發過全部 4 個後，克蘇恩的技能變成三倍', () => {
    const g = newGame();
    play(g, 'BE_778'); // 眷顧：兩個不同的技能（選第 1、2 個）
    expect(g.s.players[0].be?.cthun?.length).toBe(2);
    const hc = give(g, 'BE_778');
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    // 這次選剩下的兩個（選項依序是怒、領域、怒視、僕從）
    g.apply({ type: 'choose', index: 2 });
    g.apply({ type: 'choose', index: 2 });
    resolve(g);
    expect(g.s.players[0].be?.cthun?.length).toBe(4);
    play(g, 'BE_013');
    const c = g.s.players[0].board.find((m) => m.cardId === 'BE_013')!;
    expect(c.titanPower?.BE_013t1).toBe(3);
  });

  it('古神：每回合可以使用兩個技能，技能用完之前不能攻擊', () => {
    const g = newGame();
    const god = put(g, 'BE_784', 0);
    put(g, FILLER, 1);
    expect(g.apply({ type: 'titan', uid: god.uid, index: 1 })).toBe(true);
    resolve(g);
    expect(g.apply({ type: 'titan', uid: god.uid, index: 3 })).toBe(true);
    resolve(g);
    expect(g.apply({ type: 'titan', uid: god.uid, index: 2 })).toBe(false);
  });

  it('主宰者尤格薩倫：結束你的回合，由尤格薩倫額外進行一個回合', () => {
    const g = newGame();
    const turn = g.s.turn;
    play(g, 'BE_009');
    expect(g.s.current).toBe(0);
    expect(g.s.turn).toBe(turn + 1);
    expect(g.s.yoggTurn).toBe(0);
    g.apply({ type: 'endTurn' });
    resolve(g);
    expect(g.s.current).toBe(1);
    expect(g.s.yoggTurn).toBeUndefined();
  });

  it('『夢境終結』恩若司：每召喚過一個亡語手下消耗減少 (1)', () => {
    const g = newGame();
    const hc = give(g, 'BE_017');
    expect(g.costOf(g.s.players[0], hc)).toBe(15);
    play(g, 'FP1_007'); // 蛛魔之卵
    play(g, 'FP1_007');
    expect(g.costOf(g.s.players[0], hc)).toBe(13);
  });

  it('長老真言：下一張暗影法術重複上一個長老真言', () => {
    const g = newGame({ cls: 'PRIEST' });
    play(g, 'BE_222'); // 召喚 5/5 虛空之翼
    expect(ids(g, 0)).toEqual(['BE_222t']);
    play(g, 'BE_223'); // 暗影法術：重複顯現
    expect(ids(g, 0)).toEqual(['BE_222t', 'BE_222t']);
  });

  it('儀式：2 個回合後觸發，完成後克希斯可以開始邪惡儀式', () => {
    const g = newGame({ cls: 'WARLOCK' });
    play(g, 'BE_085');
    endTurns(g, 2);
    expect(ids(g, 0)).toEqual([]);
    endTurns(g, 2);
    expect(ids(g, 0)).toEqual(['BE_085t', 'BE_085t']);
    expect(g.s.players[0].be?.rituals).toBe(1);
    play(g, 'BE_090');
    expect((g.s.players[0].delayed ?? []).length).toBe(1);
  });

  it('惡臭吞噬者：在手牌中依打出的符文卡變形', () => {
    const g = newGame({ cls: 'DEATHKNIGHT' });
    const hc = give(g, 'BE_781');
    const blood = ALL_CARDS().find((c) => c.collectible && c.type === 'SPELL' && c.runes?.blood === 2 && !c.runes.frost && !c.runes.unholy && !c.target)!;
    play(g, blood.id);
    expect(hc.cardId).toBe('BE_781t3');
  });

  it('喚光者：英雄攻擊時雙方英雄都恢復生命值', () => {
    const g = newGame({ cls: 'PALADIN' });
    g.s.players[0].hero.hp = 20;
    g.s.players[1].hero.hp = 20;
    play(g, 'BE_000');
    const foe = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: g.s.players[0].hero.uid, target: foe.uid });
    expect(g.s.players[0].hero.hp).toBeGreaterThan(20 - 4);
    expect(g.s.players[1].hero.hp).toBe(24);
  });

  it('拉維茲：最左邊的手下具有突襲', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    const left = put(g, FILLER, 0);
    put(g, 'BE_230', 0);
    g.recalcAuras();
    expect(g.hasKw(left, 'RUSH')).toBe(true);
  });

  it('重塑鐵砧：消耗護甲值而非法力', () => {
    const g = newGame({ cls: 'WARRIOR' });
    g.s.players[0].hero.armor = 5;
    const hc = give(g, 'BE_042', 0);
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.players[0].hero.armor).toBe(3);
    expect(g.atkOf(g.s.players[0].hero)).toBe(4);
  });

  it('烏迪爾隔離區：打出每一種符文的牌之前無法啟用', () => {
    const g = newGame({ cls: 'DEATHKNIGHT' });
    play(g, 'BE_780');
    const loc = g.s.players[0].locations![0];
    expect(g.apply({ type: 'location', uid: loc.uid })).toBe(false);
  });
});
