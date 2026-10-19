// 暴風城：機制與卡牌的測試
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
const quests = (g: Game) => (g.s.players[0].sidequests ?? []).map((q) => q.cardId);

describe('暴風城', () => {
  it('收錄全部可收藏卡', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1578).length).toBe(142);
  });

  it('任務線：完成一段後自動開始下一段，最後獲得傳說手下', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'SW_028');
    expect(quests(g)).toEqual(['SW_028']);
    const pirates = () => {
      g.s.players[0].board = [];
      for (let i = 0; i < 3; i++) play(g, 'CS2_146'); // 南海甲板水手
    };
    pirates();
    expect(quests(g)).toEqual(['SW_028t']);
    pirates();
    expect(quests(g)).toEqual(['SW_028t2']);
    pirates();
    expect(quests(g)).toEqual([]);
    expect(g.s.players[0].hand.some((h) => h.cardId === 'SW_028t5')).toBe(true);
  });

  it('任務線：法師要施放火焰、冰霜、秘法法術各一張', () => {
    const g = newGame();
    play(g, 'SW_450');
    play(g, 'CS2_032'); // 烈焰風暴（火焰）
    play(g, 'CS2_032');
    expect(g.s.players[0].sidequests?.[0].progress).toBe(1);
    play(g, 'CS2_026'); // 冰霜新星（冰霜）
    play(g, 'CS2_025'); // 魔爆術（秘法）
    expect(quests(g)).toEqual(['SW_450t']);
  });

  it('任務線：德魯伊的英雄獲得攻擊力', () => {
    const g = newGame({ cls: 'DRUID' });
    play(g, 'SW_428');
    play(g, 'CS2_005'); // 爪擊 +2
    play(g, 'CS2_005');
    expect(quests(g)).toEqual(['SW_428t']);
    expect(g.s.players[0].hero.armor).toBeGreaterThanOrEqual(5);
  });

  it('坐騎：手下死亡時召喚坐騎', () => {
    const g = newGame({ cls: 'DRUID' });
    const m = put(g, FILLER, 0);
    play(g, 'SW_432', { target: m.uid });
    m.dead = true;
    play(g, 'CS2_027');
    expect(ids(g, 0)).toContain('SW_432t');
  });

  it('點燃：洗回牌堆的點燃多造成 1 點傷害', () => {
    const g = newGame();
    const yeti = put(g, FILLER, 1);
    play(g, 'SW_110', { target: yeti.uid });
    expect(yeti.hp).toBe(3);
    const next = g.s.players[0].deck.find((h) => h.cardId === 'SW_110')!;
    expect(next.counter).toBe(1);
  });

  it('荒裔塔姆辛：在你的回合受到的傷害改由對手承受', () => {
    const g = newGame({ cls: 'WARLOCK' });
    play(g, 'SW_091t4');
    g.apply({ type: 'heroPower' }); // 生命分流：對自己造成 2 點傷害
    expect(g.s.players[0].hero.hp).toBe(30);
    expect(g.s.players[1].hero.hp).toBe(28);
  });

  it('監獄囚犯：在你打出 3 張牌後甦醒（不算它自己）', () => {
    const g = newGame();
    play(g, 'SW_077');
    const p = g.s.players[0].board[0];
    expect(p.keywords).toContain('DORMANT');
    play(g, 'CS2_027');
    play(g, 'CS2_027');
    expect(p.keywords).toContain('DORMANT');
    play(g, 'CS2_027');
    expect(p.keywords).not.toContain('DORMANT');
  });

  it('飛行管理員杜加爾：選擇路線後休眠，抵達時甦醒並獲得獎勵', () => {
    const g = newGame();
    const hc = give(g, 'SW_079');
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    g.apply({ type: 'choose', index: 1 }); // 鐵爐堡：3 回合後恢復 10 點生命值
    const d = g.s.players[0].board[0];
    expect(d.keywords).toContain('DORMANT');
    g.s.players[0].hero.hp = 15;
    endTurns(g, 6);
    expect(d.keywords).not.toContain('DORMANT');
    expect(g.s.players[0].hero.hp).toBeGreaterThan(15);
  });

  it('虛無之觸侍從：雙方英雄受到的傷害增加 1 點', () => {
    const g = newGame();
    put(g, 'SW_446', 0);
    play(g, 'CS2_024', { target: g.s.players[1].hero.uid }); // 寒冰箭 3 點
    expect(g.s.players[1].hero.hp).toBe(26);
  });
});
