// 迷你系列與傳統卡：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../cards/registry';
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

describe('迷你系列與傳統卡', () => {
  it('死亡礦坑、奧妮克希亞的巢穴與傳統卡都已收錄', () => {
    const all = ALL_CARDS().filter((c) => c.collectible);
    expect(all.filter((c) => c.id.startsWith('DED_')).length).toBe(35);
    expect(all.filter((c) => c.id.startsWith('ONY_')).length).toBe(35);
    for (const id of ['BG31_BOB', 'GIFT_04', 'CS2_003', 'CS2_226', 'EX1_062', 'EX1_112', 'EX1_179', 'EX1_182', 'PRO_001', 'WON_113']) expect(all.some((c) => c.id === id), id).toBe(true);
  });

  it('鍛造錘：交易後獲得 +2 耐久度', () => {
    const g = newGame({ cls: 'WARRIOR' });
    const hc = give(g, 'DED_527');
    g.apply({ type: 'trade', handUid: hc.uid });
    resolve(g);
    const back = g.s.players[0].deck.find((h) => h.uid === hc.uid) ?? g.s.players[0].hand.find((h) => h.uid === hc.uid)!;
    expect(back.hpBuff).toBe(2);
  });

  it('邪惡船貨：交易後多召喚 2 個小鬼', () => {
    const g = newGame({ cls: 'WARLOCK', deck: Array(30).fill('CS2_182') });
    const hc = give(g, 'DED_504');
    g.apply({ type: 'trade', handUid: hc.uid });
    const back = g.s.players[0].deck.find((h) => h.uid === hc.uid)!;
    g.s.players[0].deck = g.s.players[0].deck.filter((h) => h !== back);
    g.s.players[0].hand.push(back);
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: back.uid })).toBe(true);
    expect(ids(g, 0).filter((x) => x === 'EX1_598').length).toBe(4);
  });

  it('極貪快感：本回合抽到時消耗為 (3)', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    const hc = give(g, 'DED_506');
    expect(g.costOf(g.s.players[0], hc)).toBe(5);
    hc.drawnTurn = g.s.turn;
    expect(g.costOf(g.s.players[0], hc)).toBe(3);
  });

  it('迪菲亞老大艾德溫：本回合打出抽到的牌，獲得 +2/+2 並重複', () => {
    const g = newGame({ cls: 'ROGUE', deck: Array(30).fill('CS2_168') });
    play(g, 'DED_510');
    const ed = g.s.players[0].board[0];
    const drawn = g.s.players[0].hand[g.s.players[0].hand.length - 1];
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: drawn.uid })).toBe(true);
    expect(g.atkOf(ed)).toBe(6);
  });

  it('拷貝貓：把對手打出的下一張牌的複製加入手牌', () => {
    const g = newGame({ cls: 'PRIEST' });
    play(g, 'DED_514');
    endTurns(g, 1);
    play(g, 'CS2_168');
    expect(g.s.players[0].hand.some((h) => h.cardId === 'CS2_168')).toBe(true);
  });

  it('團隊首領奧妮克希亞：控制幼龍時免疫', () => {
    const g = newGame();
    play(g, 'ONY_004');
    const ony = g.s.players[0].board.find((m) => m.cardId === 'ONY_004')!;
    expect(ids(g, 0).filter((x) => x === 'ONY_001t').length).toBe(6);
    play(g, 'CS2_029', { target: ony.uid });
    expect(ony.hp).toBe(8);
  });

  it('靈敏反應：有榮譽擊殺時英雄 +1 攻擊力', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    put(g, 'CS2_168', 1); // 2/1
    play(g, 'ONY_014');
    expect(g.atkOf(g.s.players[0].hero)).toBe(1);
  });

  it('用力打下去：英雄 +10 攻擊力但無法攻擊英雄', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'ONY_023');
    expect(g.atkOf(g.s.players[0].hero)).toBe(10);
    expect(g.apply({ type: 'attack', attacker: g.s.players[0].hero.uid, target: g.s.players[1].hero.uid })).toBe(false);
  });

  it('刃爪哨兵：打出手牌最左或最右的牌後抽一張牌', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    put(g, 'ONY_036', 0);
    const hc = give(g, 'CS2_168'); // 放在最右邊
    const n = g.s.players[0].hand.length;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.players[0].hand.length).toBe(n);
  });

  it('老瞎眼：場上每有一個其他魚人 +1 攻擊力', () => {
    const g = newGame();
    const m = put(g, 'EX1_062', 0);
    put(g, 'CS2_168', 0);
    put(g, 'CS2_168', 1);
    g.recalcAuras();
    expect(g.atkOf(m)).toBe(4);
  });

  it('痛苦詛咒：對手抽到痛苦時受到疲勞傷害', () => {
    const g = newGame({ cls: 'WARLOCK' });
    play(g, 'ONY_034');
    expect(g.s.players[1].deck.filter((h) => h.cardId === 'ONY_034t').length).toBe(3);
    g.s.players[1].deck = g.s.players[1].deck.filter((h) => h.cardId !== 'ONY_034t');
    g.s.players[1].deck.push(g.newHandCard('ONY_034t'));
    endTurns(g, 1);
    expect(g.s.players[1].hero.hp).toBe(29);
  });

  it('艾澤拉斯的勇士：獲得 2 張傳說勇士，消耗減少 (2)', () => {
    const g = newGame();
    const n = g.s.players[0].hand.length;
    play(g, 'WON_113', { option: 1 });
    const got = g.s.players[0].hand.slice(n);
    expect(got.length).toBe(2);
    for (const h of got) expect(h.costMod).toBe(-2);
  });
});
