// 通靈學院：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

type Cls = 'MAGE' | 'ROGUE' | 'PALADIN' | 'WARRIOR' | 'HUNTER' | 'DRUID' | 'WARLOCK' | 'DEMONHUNTER' | 'PRIEST' | 'SHAMAN';

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

describe('通靈學院', () => {
  it('收錄全部可收藏卡', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1443).length).toBe(135);
  });

  it('研讀：發現一張卡，下一張同類卡消耗減少 (1)', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'SCH_237');
    const rush = give(g, 'CS2_146'); // 南海甲板水手：衝鋒，不是突襲
    const raptor = give(g, 'DRG_019'); // 破滅之裔：突襲
    expect(g.costOf(g.s.players[0], raptor)).toBe(2);
    expect(g.costOf(g.s.players[0], rush)).toBe(getCard('CS2_146').cost);
  });

  it('法術爆發：發言人蓋德拉獲得等同法術消耗的屬性值，只觸發一次', () => {
    const g = newGame();
    const gidra = put(g, 'SCH_182', 0);
    play(g, 'CS2_032'); // 烈焰風暴 7 費（雙方手下各 4 點）
    expect(g.atkOf(gidra)).toBe(8);
    play(g, 'CS2_027');
    expect(g.atkOf(gidra)).toBe(8);
  });

  it('靈魂碎片：虛無飲魂者摧毀牌堆中的一張靈魂碎片獲得 +3/+3', () => {
    const g = newGame({ cls: 'WARLOCK' });
    g.s.players[0].deck.push(g.newHandCard('SCH_307t'));
    play(g, 'SCH_343');
    expect(g.atkOf(g.s.players[0].board[0])).toBe(7);
    expect(g.s.players[0].deck.some((h) => h.cardId === 'SCH_307t')).toBe(false);
  });

  it('校長科爾蘇加德：召喚法術消滅的手下', () => {
    const g = newGame();
    put(g, 'SCH_224', 0);
    put(g, 'CS2_172', 1);
    play(g, 'CS2_032');
    expect(ids(g, 0)).toContain('CS2_172');
  });

  it('史雷特教授：你的法術具有劇毒', () => {
    const g = newGame({ cls: 'HUNTER' });
    put(g, 'SCH_539', 0);
    const yeti = put(g, FILLER, 1);
    play(g, 'CS2_024', { target: yeti.uid }); // 寒冰箭 3 點
    expect(yeti.dead || yeti.hp <= 0).toBe(true);
  });

  it('秘密通道：手牌換成牌堆中的 4 張牌，回合結束時換回來', () => {
    const g = newGame({ cls: 'ROGUE' });
    const before = g.s.players[0].hand.map((h) => h.uid);
    play(g, 'SCH_305');
    expect(g.s.players[0].hand.length).toBe(4);
    const deckSize = g.s.players[0].deck.length;
    endTurns(g, 1);
    expect(g.s.players[0].hand.map((h) => h.uid)).toEqual(before);
    expect(g.s.players[0].deck.length).toBe(deckSize + 4);
  });

  it('血骨傀儡：每次重新召喚都 -1/-1', () => {
    const g = newGame({ cls: 'WARRIOR' });
    const r = put(g, 'SCH_621', 0);
    r.dead = true;
    play(g, 'CS2_027');
    const r2 = g.s.players[0].board.find((m) => m.cardId === 'SCH_621')!;
    expect(g.atkOf(r2)).toBe(8);
    r2.dead = true;
    play(g, 'CS2_027');
    expect(g.atkOf(g.s.players[0].board.find((m) => m.cardId === 'SCH_621')!)).toBe(7);
  });

  it('頂尖獵人克里恩：其他角色攻擊時免疫', () => {
    const g = newGame({ cls: 'HUNTER' });
    put(g, 'SCH_538', 0);
    const a = put(g, FILLER, 0);
    const d = put(g, FILLER, 1);
    expect(g.apply({ type: 'attack', attacker: a.uid, target: d.uid })).toBe(true);
    expect(a.hp).toBe(5);
    expect(d.hp).toBe(1);
  });

  it('轉學生：抽到時變成一種牌桌的版本', () => {
    const g = newGame({ deck: [...Array(29).fill(FILLER), 'SCH_199'] });
    endTurns(g, 2);
    const all = [...g.s.players[0].hand, ...g.s.players[0].deck].map((h) => h.cardId);
    expect(all.some((id) => id.startsWith('SCH_199t'))).toBe(true);
  });
});
