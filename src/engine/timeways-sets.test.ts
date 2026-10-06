// 穿越時間流：倒轉、傳說、灌注、地點、目標等新機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { Game } from './game';
import type { HandCard, Minion, PlayerId, PlayerState } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

function newGame(opts: { deck?: string[]; deck1?: string[]; classes?: PlayerState['heroClass'][]; first?: PlayerId; seed?: number } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const [c0, c1] = opts.classes ?? ['MAGE', 'WARRIOR'];
  const g = Game.create({ decks: [deck, opts.deck1 ?? deck], classes: [c0, c1], names: ['玩家', '電腦'], ai: [false, false], seed: opts.seed ?? 42, first: opts.first ?? 0 });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, cardId: string, pid: PlayerId = g.s.current, mana = true): HandCard {
  const hc = g.newHandCard(cardId);
  g.s.players[pid].hand.push(hc);
  if (mana) {
    g.s.players[pid].mana = 10;
    g.s.players[pid].maxMana = 10;
  }
  return hc;
}

function put(g: Game, cardId: string, pid: PlayerId): Minion {
  const m = g.makeMinion(pid, cardId);
  m.sleeping = false;
  g.s.players[pid].board.push(m);
  g.recalcAuras();
  return m;
}

function play(g: Game, cardId: string, target?: number, extra: Record<string, unknown> = {}) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, target, ...extra })).toBe(true);
  return hc;
}

const board = (g: Game, pid: PlayerId) => g.s.players[pid].board.map((m) => m.cardId);
void board;
void put;
void play;

describe('倒轉', () => {
  it('打出倒轉牌後可以選擇保留', () => {
    const g = newGame();
    const hc = give(g, 'TIME_004');
    const foeHp = g.s.players[1].hero.hp;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.pendingChoice?.options).toEqual(['TIME_000ta', 'TIME_000tb']);
    expect(g.apply({ type: 'choose', index: 0 })).toBe(true);
    expect(g.s.pendingChoice).toBeNull();
    expect(g.s.players[0].board.map((m) => m.cardId)).toEqual(['TIME_004']);
    expect(g.s.players[1].hero.hp).toBe(foeHp - 7);
    expect(g.s.players[0].hand.some((h) => h.uid === hc.uid)).toBe(false);
  });

  it('選擇倒轉：回到打出前，這張牌回到手牌且沒有倒轉了', () => {
    const g = newGame();
    const hc = give(g, 'TIME_004');
    const foeHp = g.s.players[1].hero.hp;
    const mana = g.s.players[0].mana;
    g.apply({ type: 'play', handUid: hc.uid });
    g.apply({ type: 'choose', index: 1 });
    expect(g.s.pendingChoice).toBeNull();
    expect(g.s.players[0].board).toHaveLength(0);
    expect(g.s.players[1].hero.hp).toBe(foeHp);
    expect(g.s.players[0].mana).toBe(mana);
    const back = g.s.players[0].hand.find((h) => h.uid === hc.uid)!;
    expect(back).toBeTruthy();
    expect(g.rewindsOf(back)).toBe(0);
    // 再打一次就不會再問
    g.apply({ type: 'play', handUid: hc.uid });
    expect(g.s.pendingChoice).toBeNull();
    expect(g.s.players[0].board).toHaveLength(1);
  });

  it('倒轉後結果會不一樣（亂數往前走）', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 6; seed++) {
      const g = newGame({ seed });
      put(g, FILLER, 1);
      put(g, FILLER, 1);
      const hc = give(g, 'TIME_004');
      g.apply({ type: 'play', handUid: hc.uid });
      g.apply({ type: 'choose', index: 1 });
      g.apply({ type: 'play', handUid: hc.uid });
      seen.add(g.s.players[1].board.length);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('傳說', () => {
  it('開局時，傳說卡的組合卡一起洗入牌堆', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_209'; // 穆拉丁：高王之錘
    const g = newGame({ deck });
    const all = [...g.s.players[0].deck, ...g.s.players[0].hand].map((h) => h.cardId);
    expect(all).toContain('TIME_209t');
    expect(all).toContain('TIME_209t2');
    expect(all.length).toBe(32);
  });
});
