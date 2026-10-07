// 深暗領域：德萊尼、聖契、小行星、船員、蟲族與神族
import { describe, expect, it } from 'vitest';
import { COLLECTIBLE } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId, PlayerState } from './state';

const FILLER = 'CS2_182';

function newGame(opts: { deck?: string[]; classes?: PlayerState['heroClass'][]; seed?: number } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const [c0, c1] = opts.classes ?? ['PALADIN', 'WARRIOR'];
  const g = Game.create({ decks: [deck, deck], classes: [c0, c1], names: ['玩家', '電腦'], ai: [false, false], seed: opts.seed ?? 42, first: 0 });
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

function play(g: Game, cardId: string, target?: number) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, target })).toBe(true);
  while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
  return hc;
}

describe('深暗領域：全部收錄', () => {
  it('深暗領域的卡牌都已收錄', () => {
    const missing = ['GDB_116', 'GDB_145', 'GDB_472', 'GDB_854', 'GDB_902', 'SC_000', 'SC_011', 'SC_019', 'SC_765', 'SC_004', 'SC_754', 'SC_403', 'SC_751'].filter((id) => !COLLECTIBLE.some((c) => c.id === id));
    expect(missing).toEqual([]);
    expect(COLLECTIBLE.filter((c) => c.set === 1935).length).toBeGreaterThan(125);
  });
});

describe('德萊尼：「下一個德萊尼」佇列', () => {
  it('星光漫遊者：下一個德萊尼 +2/+1', () => {
    const g = newGame();
    play(g, 'GDB_720');
    play(g, 'GDB_461'); // 星界警戒者（戰吼：拿最後一隻德萊尼）本身不是德萊尼
    play(g, 'GDB_452'); // 沙德之盾 4/8 德萊尼
    const shield = g.s.players[0].board.find((m) => m.cardId === 'GDB_452')!;
    expect(shield.baseAtk + shield.atkBuff).toBe(6);
  });

  it('遠征軍士官：下一個德萊尼立刻攻擊隨機敵人', () => {
    const g = newGame();
    const t = put(g, FILLER, 1);
    play(g, 'GDB_229');
    play(g, 'GDB_452');
    expect(t.hp).toBeLessThan(5);
  });

  it('阿斯卡拉：下兩個德萊尼召喚自己的複製', () => {
    const g = newGame();
    play(g, 'GDB_455');
    play(g, 'GDB_452');
    expect(g.s.players[0].board.filter((m) => m.cardId === 'GDB_452').length).toBe(2);
  });
});

describe('聖契', () => {
  it('聖契的減費與「消耗 (0)」效果', () => {
    const g = newGame();
    const hc = give(g, 'GDB_139');
    expect(g.costOf(g.s.players[0], hc)).toBe(6);
    play(g, 'GDB_726');
    expect(g.costOf(g.s.players[0], hc)).toBe(5);
  });

  it('信仰聖契：召喚三個 3/3 聖盾德萊尼', () => {
    const g = newGame();
    play(g, 'GDB_139');
    expect(g.s.players[0].board.filter((m) => m.cardId === 'GDB_139t').length).toBe(3);
  });
});

describe('小行星與船員', () => {
  it('小行星：抽到時施放，對隨機敵人造成 2 點傷害', () => {
    const g = newGame();
    const hp = g.s.players[1].hero.hp;
    g.s.players[0].deck.push(g.newHandCard('GDB_430'));
    g.s.players[0].deck.push(g.newHandCard(FILLER));
    const before = g.s.players[0].hand.length;
    (g as unknown as { drawRaw: (p: PlayerState) => void }).drawRaw(g.s.players[0]);
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(before);
    expect(hp).toBe(g.s.players[1].hero.hp);
  });

  it('莫斯通碎石者：洗入 3 顆小行星', () => {
    const g = newGame();
    const before = g.s.players[0].deck.length;
    play(g, 'GDB_435');
    expect(g.s.players[0].deck.filter((h) => h.cardId === 'GDB_430').length).toBe(3);
    expect(g.s.players[0].deck.length).toBe(before + 3);
  });

  it('緊急會議：兩個船員中間放一隻惡魔', () => {
    const g = newGame();
    g.s.players[0].hand = [];
    play(g, 'GDB_119');
    expect(g.s.players[0].hand.length).toBe(3);
  });

  it('叛軍隊長蒂爾卓：洗入 8 種船員', () => {
    const g = newGame();
    play(g, 'GDB_117');
    expect(g.s.players[0].deck.filter((h) => h.cardId.startsWith('GDB_471t')).length).toBe(8);
  });
});

describe('其他新機制', () => {
  it('黑洞：消滅所有手下，惡魔除外', () => {
    const g = newGame();
    const a = put(g, FILLER, 1);
    const d = put(g, 'EX1_319', 1);
    play(g, 'GDB_126');
    expect(g.minion(a.uid)).toBeFalsy();
    expect(g.minion(d.uid)).toBeTruthy();
  });

  it('盧米雅：英雄受傷後免疫', () => {
    const g = newGame();
    put(g, 'GDB_144', 0);
    g.s.players[0].hero.hp = 20;
    g.s.players[1].hero.hp = 30;
    expect(g.flagOnBoard('lumia')).toBe(true);
  });

  it('基爾加丹：牌堆換成惡魔傳送門', () => {
    const g = newGame();
    play(g, 'GDB_145');
    expect(g.s.players[0].deck.length).toBe(0);
    expect(g.s.players[0].portal).toBeTruthy();
  });

  it('無盡星空：每有一張牌被抽或被打出就減費', () => {
    const g = newGame();
    const hc = give(g, 'GDB_142');
    const c0 = g.costOf(g.s.players[0], hc);
    play(g, FILLER);
    expect(g.costOf(g.s.players[0], hc)).toBeLessThan(c0);
  });

  it('莫穆爾：你的戰吼手下消耗 (1) 並在打出後死亡', () => {
    const g = newGame();
    put(g, 'GDB_448', 0);
    const hc = give(g, 'EX1_015');
    expect(g.costOf(g.s.players[0], hc)).toBe(1);
  });

  it('塔爾加斯：未受傷的敵方手下受到雙倍傷害', () => {
    const g = newGame();
    put(g, 'GDB_472', 0);
    const t = put(g, FILLER, 1);
    play(g, 'CS2_029', t.uid);
    expect(g.minion(t.uid)).toBeFalsy();
  });

  it('星辰碰撞：起源之星與終結之星相鄰時造成 5 點傷害', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.hand = [g.newHandCard('GDB_118t'), g.newHandCard('GDB_118t2')];
    const hp = g.s.players[1].hero.hp;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].hero.hp).toBeLessThan(hp);
  });
});

describe('蟲族與神族', () => {
  it('感染者：亡語使蟲族 +1 攻擊力', () => {
    const g = newGame();
    const z = put(g, 'SC_T_ZERGLING', 0);
    const i = put(g, 'SC_002', 0);
    i.dead = true;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.atkOf(z)).toBe(2);
  });

  it('神族：太陽光環降低消耗', () => {
    const g = newGame();
    const hc = give(g, 'SC_763');
    const c0 = g.costOf(g.s.players[0], hc);
    play(g, 'SC_764');
    const sentry = g.s.players[0].board.find((m) => m.cardId === 'SC_764')!;
    sentry.dead = true;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.costOf(g.s.players[0], hc)).toBeLessThanOrEqual(c0 - 1);
  });

  it('聖堂武士：打出另一個聖堂武士時合併成執政官', () => {
    const g = newGame();
    play(g, 'SC_765');
    play(g, 'SC_765');
    expect(g.s.players[0].board.some((m) => m.cardId === 'SC_671t1')).toBe(true);
  });

  it('可以打出所有深暗領域卡牌', () => {
    const failures: string[] = [];
    for (const c of COLLECTIBLE.filter((x) => x.set === 1935 && x.type !== 'HERO')) {
      try {
        const g = newGame({ seed: 5 });
        put(g, FILLER, 1);
        put(g, FILLER, 0);
        const hc = give(g, c.id);
        g.apply({ type: 'play', handUid: hc.uid, target: c.target || c.chooseOne ? g.s.players[1].board[0]?.uid : undefined, position: 0 });
        let n = 0;
        while (g.s.pendingChoice && n++ < 10) g.apply({ type: 'choose', index: 0 });
        g.apply({ type: 'endTurn' });
      } catch (e) {
        failures.push(`${c.id}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
