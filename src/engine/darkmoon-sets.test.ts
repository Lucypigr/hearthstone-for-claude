// 暗月馬戲團：機制與卡牌的測試
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

describe('暗月馬戲團', () => {
  it('收錄全部可收藏卡', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1466).length).toBe(170);
  });

  it('『分裂者』克蘇恩：開局分裂成四塊碎片，四塊都打出後回到牌堆', () => {
    const deck = [...Array(29).fill(FILLER), 'DMF_254'];
    const g = newGame({ deck });
    const all = () => [...g.s.players[0].hand, ...g.s.players[0].deck].map((h) => h.cardId);
    expect(all()).not.toContain('DMF_254');
    expect(all().filter((x) => x.startsWith('DMF_254t')).length).toBe(4);
    play(g, 'DMF_254t3');
    play(g, 'DMF_254t4');
    play(g, 'DMF_254t5');
    const yeti = put(g, FILLER, 1);
    play(g, 'DMF_254t7', { target: yeti.uid });
    expect(g.s.players[0].deck.some((h) => h.cardId === 'DMF_254')).toBe(true);
  });

  it('死亡看守者：亡語無法觸發', () => {
    const g = newGame();
    put(g, 'YOP_012', 1);
    const m = put(g, 'FP1_007', 0); // 蜘蛛卵
    m.dead = true;
    play(g, 'CS2_027');
    expect(ids(g, 0).filter((x) => x === 'FP1_007t').length).toBe(0);
  });

  it('伊蓋諾斯：生命竊取改為傷害敵方英雄', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    put(g, 'DMF_230', 0);
    const ls = put(g, FILLER, 0);
    ls.keywords.push('LIFESTEAL');
    g.s.players[0].hero.hp = 20;
    expect(g.apply({ type: 'attack', attacker: ls.uid, target: g.s.players[1].hero.uid })).toBe(true);
    expect(g.s.players[0].hero.hp).toBe(20);
    expect(g.s.players[1].hero.hp).toBe(30 - 2 * g.atkOf(ls));
  });

  it('因娜拉‧暴風墜：你的回合英雄 +2 攻擊力並具有風怒', () => {
    const g = newGame({ cls: 'SHAMAN' });
    put(g, 'DMF_708', 0);
    expect(g.atkOf(g.s.players[0].hero)).toBe(2);
    expect(g.maxAttacks(g.s.players[0].hero)).toBe(2);
  });

  it('遊戲攤位老闆：每回合第一個奧秘消耗為 (1)', () => {
    const g = newGame();
    put(g, 'DMF_102', 0);
    const a = give(g, 'EX1_289'); // 寒冰屏障 3 費
    expect(g.costOf(g.s.players[0], a)).toBe(1);
    play(g, 'EX1_294'); // 鏡像實體
    expect(g.costOf(g.s.players[0], a)).toBe(3);
  });

  it('希拉斯‧暗月：手下繞著戰場旋轉一格', () => {
    const g = newGame();
    put(g, FILLER, 0);
    put(g, 'CS2_172', 1);
    play(g, 'DMF_074');
    const total = g.s.players[0].board.length + g.s.players[1].board.length;
    expect(total).toBe(3);
    for (const p of g.s.players) for (const m of p.board) expect(m.owner).toBe(p.id);
  });

  it('詭計：對手在一個回合中抽到第二張牌時變成香蕉', () => {
    const g = newGame({ cls: 'ROGUE' });
    play(g, 'YOP_017');
    endTurns(g, 1);
    // 對手的回合：回合開始抽的是第一張，再用秘法智慧抽兩張，第二張被變成香蕉
    play(g, 'CS2_023');
    expect(g.s.players[1].hand.filter((h) => h.cardId === 'DMF_065t').length).toBe(1);
  });

  it('魔焰神射手：英雄能力消耗減少 (1)', () => {
    const g = newGame({ cls: 'WARLOCK' });
    put(g, 'YOP_030', 0);
    expect(g.heroPowerCost(g.s.players[0])).toBe(1);
  });

  it('高蹺手：本回合打出抽到的牌，英雄 +4 攻擊力', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    play(g, 'DMF_229');
    const h = g.s.players[0].hand.at(-1)!;
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: h.uid })).toBe(true);
    expect(g.atkOf(g.s.players[0].hero)).toBe(4);
  });
});
