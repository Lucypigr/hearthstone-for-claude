// 時光之穴與傳奇音樂節：機制與卡牌的測試
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

describe('系列收錄', () => {
  it('時光之穴與傳奇音樂節的可收藏卡全部收錄', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1809).length).toBeGreaterThanOrEqual(183);
  });
});

describe('時光之穴', () => {
  it('冒牌貨：每個回合在手牌中變成隨機 3 費手下並獲得劇毒', () => {
    const g = newGame();
    const hc = give(g, 'WON_026');
    endTurns(g, 2);
    expect(hc.origin).toBe('WON_026');
    expect(hc.bonus).toEqual(['POISONOUS']);
  });

  it('時光探險家魯尼：發現未來的地點', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'WON_053');
    expect(g.s.players[0].hand.some((h) => h.cardId.startsWith('WON_053t'))).toBe(true);
  });

  it('甲蟲領主：鑼受到傷害後用甲蟲填滿我方戰場', () => {
    const g = newGame({ cls: 'ROGUE' });
    play(g, 'WON_079');
    const gong = g.s.players[1].board.find((m) => m.cardId === 'WON_079t')!;
    play(g, 'CS2_029', { target: gong.uid });
    expect(g.s.players[0].board.filter((m) => m.cardId === 'WON_079t2').length).toBe(6);
  });
});

describe('傳奇音樂節', () => {
  it('獨奏：沒有其他手下時觸發', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'ETC_035');
    expect(g.s.players[0].board[0].keywords).toContain('RUSH');
    play(g, 'ETC_035');
    expect(g.s.players[0].board[1].keywords).not.toContain('RUSH');
  });

  it('和聲 / 不和諧：每個你的回合切換', () => {
    const g = newGame();
    const hc = give(g, 'ETC_314');
    endTurns(g, 2);
    expect(hc.cardId).toBe('ETC_314t');
    endTurns(g, 2);
    expect(hc.cardId).toBe('ETC_314');
  });

  it('重混：每個你的回合變成下一個版本', () => {
    const g = newGame();
    const hc = give(g, 'JAM_033');
    endTurns(g, 2);
    expect(hc.cardId).toBe('JAM_033t');
    endTurns(g, 2);
    expect(hc.cardId).toBe('JAM_033t2');
  });

  it('樂器武器：刃吉他打出流放卡後強化亡語', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    const p = g.s.players[0];
    play(g, 'ETC_405');
    expect(p.weapon?.counter).toBe(1);
  });

  it('男中音小鬼：承受疲勞傷害並獲得等量屬性值', () => {
    const g = newGame({ cls: 'WARLOCK' });
    const p = g.s.players[0];
    p.fatigue = 2;
    play(g, 'ETC_068');
    expect(p.board[0].maxHp).toBe(5);
  });

  it('搖滾對決：沒花光法力就爆炸', () => {
    const g = newGame();
    const foe = g.s.players[1];
    give(g, 'JAM_037', 5);
    g.s.players[0].mana = 5;
    const hc = g.s.players[0].hand[g.s.players[0].hand.length - 1];
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    resolve(g);
    expect(foe.hand.some((h) => h.cardId === 'JAM_037t')).toBe(true);
    endTurns(g, 1);
    const hp = foe.hero.hp;
    foe.mana = 3;
    endTurns(g, 1);
    expect(foe.hero.hp).toBe(hp - 8);
  });

  it('音效擴大器：手牌上限 11', () => {
    const g = newGame();
    play(g, 'ETC_087');
    expect(g.handCap(g.s.players[0])).toBe(11);
    expect(g.s.players[0].maxMana).toBe(11);
  });

  it('煩人的粉絲：被選擇的手下在它存活時無法攻擊', () => {
    const g = newGame();
    const t = put(g, FILLER, 1);
    play(g, 'ETC_109', { target: t.uid });
    expect(t.auraKeywords).toContain('CANT_ATTACK');
  });
});
