// 探險沉沒之城與巫妖王的進軍：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5
const WISP = 'CS2_231'; // 小精靈 1/1

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
  it('探險沉沒之城與巫妖王的進軍的可收藏卡全部收錄', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1658).length).toBeGreaterThanOrEqual(170);
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1776).length).toBeGreaterThanOrEqual(183);
  });
});

describe('探險沉沒之城', () => {
  it('疏浚：把牌堆底部 3 張中的一張放到牌堆頂', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.deck.unshift(g.newHandCard(WISP));
    play(g, 'TSC_909'); // 長牙拖網漁夫
    expect(p.deck[p.deck.length - 1].cardId).toBe(WISP);
  });

  it('挖掘專家：疏浚的牌消耗減少 (1)', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.deck.unshift(g.newHandCard(WISP));
    play(g, 'TSC_911');
    const top = p.deck[p.deck.length - 1];
    expect(top.cardId).toBe(WISP);
    expect(top.costMod).toBe(-1);
  });

  it('沉沒的卡：艾薩拉哨兵死亡後把沉沒哨兵放到牌堆底部', () => {
    const g = newGame();
    const m = put(g, 'TSC_919', 0);
    m.dead = true;
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid }); // 火球術：觸發死亡處理
    expect(g.s.players[0].deck[0].cardId).toBe('TSC_919t');
  });

  it('深淵詛咒：每個詛咒都比上一個多 1 點傷害，持續 2 個回合', () => {
    const g = newGame({ cls: 'WARLOCK' });
    const foe = g.s.players[1];
    play(g, 'TSC_955');
    play(g, 'TSC_955');
    expect(foe.hand.filter((h) => h.cardId === 'TSC_955t').map((h) => h.curse?.lvl)).toEqual([1, 2]);
    const hp = foe.hero.hp;
    endTurns(g, 1);
    expect(foe.hero.hp).toBe(hp - 3);
    endTurns(g, 2);
    expect(foe.hero.hp).toBe(hp - 6);
    expect(foe.hand.some((h) => h.cardId === 'TSC_955t')).toBe(false);
  });

  it('在持有這張牌時施放三張法術：滑動的死亡之鱗對所有敵人造成 3 點傷害', () => {
    const g = newGame();
    const hc = give(g, 'TSC_064');
    for (let i = 0; i < 3; i++) play(g, 'CS2_027'); // 鏡像術
    const hp = g.s.players[1].hero.hp;
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    resolve(g);
    expect(g.s.players[1].hero.hp).toBe(hp - 3);
  });

  it('巨型：奧祖瑪特召喚 6 條觸手，亡語依觸手數消滅敵方手下', () => {
    const g = newGame();
    play(g, 'TID_711');
    const p = g.s.players[0];
    expect(p.board.filter((m) => m.cardId.startsWith('TID_711t')).length).toBe(6);
  });

  it('海潮獵人涅普圖隆：攻擊時改由巨手攻擊', () => {
    const g = newGame();
    play(g, 'TID_712');
    const p = g.s.players[0];
    const nep = p.board.find((m) => m.cardId === 'TID_712')!;
    const t = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: nep.uid, target: t.uid });
    resolve(g);
    expect(nep.hp).toBe(nep.maxHp);
    expect(g.s.players[1].board.includes(t)).toBe(false);
  });

  it('吉加芬：吞噬敵方手下，死亡時吐出來', () => {
    const g = newGame();
    put(g, FILLER, 1);
    put(g, WISP, 1);
    play(g, 'TSC_962');
    expect(g.s.players[1].board.length).toBe(0);
    const giga = g.s.players[0].board.find((m) => m.cardId === 'TSC_962')!;
    giga.dead = true;
    play(g, 'CS2_027');
    expect(g.s.players[1].board.map((m) => m.cardId).sort()).toEqual([FILLER, WISP].sort());
  });

  it('劍聖奧卡尼：反制對手打出的下一個手下', () => {
    const g = newGame();
    play(g, 'TSC_032'); // 選擇第一個：反制手下
    endTurns(g, 1);
    const n = g.s.players[1].board.length;
    play(g, WISP);
    expect(g.s.players[1].board.length).toBe(n);
  });

  it('海膽尖刺：本回合你的法術具有劇毒', () => {
    const g = newGame();
    const t = put(g, FILLER, 1);
    play(g, 'TSC_946');
    play(g, 'TID_001', { target: t.uid }); // 月光
    expect(g.s.players[1].board.includes(t)).toBe(false);
  });
});

describe('巫妖王的進軍', () => {
  it('法力渴求：有足夠的法力水晶時效果升級', () => {
    const g = newGame();
    const p = g.s.players[0];
    const a = give(g, 'RLK_955', 4); // 銀月護甲師：法力渴求 (7)
    p.maxMana = 5;
    expect(g.apply({ type: 'play', handUid: a.uid })).toBe(true);
    expect(p.board[p.board.length - 1].maxHp).toBe(4);
    const b = give(g, 'RLK_955', 4);
    p.maxMana = 7;
    expect(g.apply({ type: 'play', handUid: b.uid })).toBe(true);
    expect(p.board[p.board.length - 1].maxHp).toBe(6);
  });

  it('調配藥劑：打出基本藥劑後混合出一瓶混合藥劑', () => {
    const g = newGame({ cls: 'ROGUE' });
    const p = g.s.players[0];
    play(g, 'RLK_570t5'); // 閃耀藥劑：抽 2，選第一瓶（黏稠藥劑）混合
    expect(p.hand.some((h) => h.cardId === 'RLK_570tt1')).toBe(true);
  });

  it('食屍鬼煉金師：下一瓶藥劑消耗為 (0)', () => {
    const g = newGame({ cls: 'ROGUE' });
    play(g, 'RLK_570');
    const hc = give(g, 'RLK_570t3');
    expect(g.costOf(g.s.players[0], hc)).toBe(0);
  });

  it('骨領主霜語：每回合第一張牌消耗 (0)，3 個回合後死亡', () => {
    const g = newGame();
    const m = put(g, 'RLK_591', 0);
    m.dead = true;
    play(g, 'CS2_027');
    endTurns(g, 2);
    const hc = give(g, 'CS2_029');
    expect(g.costOf(g.s.players[0], hc)).toBe(0);
    endTurns(g, 4);
    expect(g.s.winner).toBe(1);
  });

  it('阿努比瑞克漢：本回合下 3 個手下消耗護甲', () => {
    const g = newGame({ cls: 'DRUID' });
    const p = g.s.players[0];
    play(g, 'RLK_659');
    const armor = p.hero.armor;
    const hc = give(g, FILLER, 0);
    expect(g.costKind(p, hc)).toBe('armor');
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(p.hero.armor).toBe(armor - 4);
  });

  it('聖所法術扭曲者：對手指定其他手下的法術改為指定它', () => {
    const g = newGame();
    const bender = put(g, 'RLK_677', 1);
    const t = put(g, WISP, 1);
    play(g, 'CS2_029', { target: t.uid });
    expect(g.s.players[1].board.includes(t)).toBe(true);
    expect(bender.hp).toBe(bender.maxHp - 6);
  });

  it('索瑞貝洛爾：死亡後成為鳳凰蛋，施放火焰法術後復活', () => {
    const g = newGame({ cls: 'WARRIOR' });
    const m = put(g, 'RLK_604', 0);
    m.dead = true;
    play(g, 'CS2_027');
    const p = g.s.players[0];
    expect(p.board.some((x) => x.cardId === 'RLK_604t')).toBe(true);
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid });
    expect(p.board.some((x) => x.cardId === 'RLK_604a')).toBe(true);
  });

  it('冰霜女王辛德拉苟莎：敵方手下被凍結後消滅它', () => {
    const g = newGame({ cls: 'DEATHKNIGHT' });
    put(g, 'NX2_037', 0);
    const t = put(g, FILLER, 1);
    play(g, 'CS2_024', { target: t.uid }); // 寒冰箭
    expect(g.s.players[1].board.includes(t)).toBe(false);
  });

  it('四騎士：全部死亡後消滅敵方英雄', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.graveyard.push('NX2_034', 'NX2_034t', 'NX2_034t1');
    const m = put(g, 'NX2_034t2', 0);
    m.dead = true;
    play(g, 'CS2_027');
    expect(g.s.winner).toBe(0);
  });
});
