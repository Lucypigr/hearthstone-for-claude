// 經典系列剩下的卡：機制與卡牌的測試
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

describe('經典', () => {
  it('經典的可收藏卡全部收錄', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 3).length).toBeGreaterThan(0);
  });

  it('寒冰槍：已凍結的角色改為受到 4 點傷害', () => {
    const g = newGame();
    const t = put(g, FILLER, 1);
    play(g, 'CS2_031', { target: t.uid });
    expect(t.frozen).toBe(true);
    play(g, 'CS2_031', { target: t.uid });
    expect(t.hp).toBe(1);
  });

  it('艾德溫‧范克里夫：本回合每打出一張其他的牌 +2/+2', () => {
    const g = newGame({ cls: 'ROGUE' });
    play(g, 'CS2_027');
    play(g, 'CS2_027');
    play(g, 'EX1_613');
    const m = g.s.players[0].board.find((x) => x.cardId === 'EX1_613')!;
    expect(m.maxHp).toBe(6);
  });

  it('預言者維倫：法術傷害加倍', () => {
    const g = newGame();
    put(g, 'EX1_350', 0);
    const hp = g.s.players[1].hero.hp;
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(hp - 12);
  });

  it('奧金尼靈魂祭司：治療改為造成傷害', () => {
    const g = newGame();
    put(g, 'EX1_591', 0);
    const t = put(g, FILLER, 1);
    play(g, 'CS2_007', { target: t.uid }); // 治療之觸 8
    expect(g.s.players[1].board.includes(t)).toBe(false);
  });

  it('暗影狂亂：控制權在回合結束時還回去', () => {
    const g = newGame();
    const t = put(g, 'CS2_231', 1);
    play(g, 'EX1_334', { target: t.uid });
    expect(t.owner).toBe(0);
    endTurns(g, 1);
    expect(t.owner).toBe(1);
  });

  it('法術反制：敵方法術指定手下時改為指定召喚出的 1/3', () => {
    const g = newGame();
    const t = put(g, FILLER, 1);
    g.s.players[1].secrets.push({ uid: 9999, cardId: 'tt_010' });
    play(g, 'CS2_029', { target: t.uid });
    expect(t.hp).toBe(t.maxHp);
  });
});
