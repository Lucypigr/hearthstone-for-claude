// 古神碎碎念：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

type Cls = 'MAGE' | 'ROGUE' | 'PALADIN' | 'WARRIOR' | 'DEATHKNIGHT' | 'HUNTER' | 'DRUID' | 'WARLOCK' | 'DEMONHUNTER';

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

describe('古神碎碎念', () => {
  it('收錄', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 21).length).toBeGreaterThan(0);
  });

  it('禁忌儀式：花光法力召喚等量觸手', () => {
    const g = newGame({ cls: 'WARLOCK' });
    play(g, 'OG_114');
    expect(g.s.players[0].board.filter((m) => m.cardId === 'OG_114a').length).toBe(7);
    expect(g.s.players[0].mana).toBe(0);
  });

  it('恩佐斯：召喚死亡的友方亡語手下', () => {
    const g = newGame();
    g.s.players[0].graveyard.push('FP1_007', 'CS2_231');
    play(g, 'OG_133');
    expect(g.s.players[0].board.map((m) => m.cardId)).toContain('FP1_007');
    expect(g.s.players[0].board.map((m) => m.cardId)).not.toContain('CS2_231');
  });

  it('上古之血：兩個合併成上古之神', () => {
    const g = newGame();
    put(g, 'OG_173', 0);
    put(g, 'OG_173', 0);
    endTurns(g, 1);
    expect(g.s.players[0].board.map((m) => m.cardId)).toEqual(['OG_173a']);
  });

  it('異種蟲群：英雄沒攻擊過就不能攻擊', () => {
    const g = newGame();
    const m = put(g, 'OG_034', 0);
    expect(g.apply({ type: 'attack', attacker: m.uid, target: g.s.players[1].hero.uid })).toBe(false);
  });

  it('卑劣的審判官：英雄能力變成召喚 1/1 魚人', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'OG_006');
    expect(g.s.players[0].heroPower.id).toBe('OG_006b');
  });
});
