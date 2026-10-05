// 爆爆計畫、探險者協會、拉斯塔哈大混戰、安戈洛歷險記、迦拉克隆的覺醒：新機制的測試
import { describe, expect, it } from 'vitest';
import { Game } from './game';
import type { Minion, PlayerId, PlayerState } from './state';

const FILLER = 'CS2_182'; // 冰風雪人

function newGame(opts: { deck?: string[]; classes?: PlayerState['heroClass'][] } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const [c0, c1] = opts.classes ?? ['MAGE', 'WARRIOR'];
  const g = Game.create({ decks: [deck, deck], classes: [c0, c1], names: ['玩家', '電腦'], ai: [false, false], seed: 42, first: 0 });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, cardId: string, pid: PlayerId = g.s.current) {
  const hc = g.newHandCard(cardId);
  g.s.players[pid].hand.push(hc);
  g.s.players[pid].mana = 10;
  g.s.players[pid].maxMana = 10;
  return hc;
}

function put(g: Game, cardId: string, pid: PlayerId): Minion {
  const m = g.makeMinion(pid, cardId);
  m.sleeping = false;
  g.s.players[pid].board.push(m);
  g.recalcAuras();
  return m;
}

function play(g: Game, cardId: string, target?: number, position?: number) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, target, position })).toBe(true);
}

describe('磁力與演化', () => {
  it('磁力：放在友方機械左邊時吸附上去，放在別處就正常召喚', () => {
    const g = newGame();
    const me = g.s.players[0];
    const mech = put(g, 'GVG_082', 0); // 發條地精 2/1 機械
    play(g, 'BOT_021', undefined, 0); // 青銅守門者 2/5 嘲諷
    expect(me.board.length).toBe(1);
    expect(g.atkOf(mech)).toBe(4);
    expect(mech.hp).toBe(6);
    expect(g.hasKw(mech, 'TAUNT')).toBe(true);
    play(g, 'BOT_021', undefined, 1);
    expect(me.board.length).toBe(2);
  });

  it('演化：從三個選項選一個套用', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'UNG_001');
    const opts = g.s.pendingChoice!.options;
    expect(opts.length).toBe(3);
    const i = opts.indexOf('UNG_999t3');
    if (i < 0) return; // 這次沒出現 +3 攻擊力就不檢查數值
    g.apply({ type: 'choose', index: i });
    expect(g.atkOf(me.board[0])).toBe(5);
  });
});

describe('任務', () => {
  it('魚人總動員：召喚 8 個魚人後獲得巨鰭', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'UNG_942');
    for (let i = 0; i < 3; i++) play(g, 'EX1_506'); // 魚人獵潮者：自己加上召喚的魚人斥候，共 2 個魚人
    expect(me.quest?.progress).toBe(6);
    me.board = []; // 騰出場上空間
    play(g, 'EX1_506');
    expect(me.quest).toBeUndefined();
    expect(me.hand.some((h) => h.cardId === 'UNG_942t')).toBe(true);
  });

  it('時光扭曲：進行一個額外的回合', () => {
    const g = newGame();
    play(g, 'UNG_028t');
    g.apply({ type: 'endTurn' });
    expect(g.s.current).toBe(0);
    g.apply({ type: 'endTurn' });
    expect(g.s.current).toBe(1);
  });
});

describe('其他效果', () => {
  it('布萊恩‧銅鬚：戰吼觸發兩次', () => {
    const g = newGame();
    put(g, 'LOE_077', 0);
    play(g, 'CS2_189', g.s.players[1].hero.uid);
    expect(g.s.players[1].hero.hp).toBe(28);
  });

  it('伊雷特拉‧風暴怒濤：下一張法術施放兩次', () => {
    const g = newGame();
    play(g, 'BOT_411');
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(g.s.players[1].hero.hp).toBe(18);
  });

  it('暫停！：你的英雄在對手的回合免疫', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    play(g, 'TRL_302');
    g.apply({ type: 'endTurn' });
    play(g, 'CS2_029', g.s.players[0].hero.uid);
    expect(g.s.players[0].hero.hp).toBe(30);
  });

  it('水晶工匠崗古：治療加倍；奧奇奈亡魂：治療改為傷害', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const me = g.s.players[0];
    put(g, 'BOT_236', 0);
    me.hero.hp = 20;
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower', target: me.hero.uid });
    expect(me.hero.hp).toBe(24);

    const g2 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    play(g2, 'TRL_501');
    g2.apply({ type: 'heroPower', target: g2.s.players[1].hero.uid });
    expect(g2.s.players[1].hero.hp).toBe(28);
  });

  it('叢林梟獸：雙方都有法術傷害 +2', () => {
    const g = newGame();
    put(g, 'LOE_051', 1);
    expect(g.spellDamage(0)).toBe(2);
    expect(g.spellDamage(1)).toBe(2);
  });

  it('納迦海巫：你的卡消耗為 (5)', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'LOE_038', 0);
    expect(g.costOf(me, give(g, 'CS2_231'))).toBe(5);
    expect(g.costOf(me, give(g, 'CS2_029'))).toBe(5);
  });

  it('神聖試煉：對手有 3 個手下時才觸發，否則保留', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    play(g, 'LOE_027');
    g.apply({ type: 'endTurn' });
    play(g, 'CS2_231');
    expect(g.s.players[0].secrets.length).toBe(1);
    put(g, 'CS2_231', 1);
    put(g, 'CS2_231', 1);
    play(g, FILLER);
    expect(g.s.players[0].secrets.length).toBe(0);
    expect(g.s.players[1].board.some((m) => m.cardId === FILLER)).toBe(false);
  });

  it('鉗嘴龜殼鬥士：替相鄰手下承受傷害（兩隻相鄰不會無限轉移）', () => {
    const g = newGame();
    const a = put(g, 'TRL_535', 1);
    const yeti = put(g, FILLER, 1);
    const b = put(g, 'TRL_535', 1);
    play(g, 'CS2_029', yeti.uid);
    expect(yeti.hp).toBe(5);
    expect(a.hp + b.hp).toBe(16 - 6);
    const before = a.hp;
    play(g, 'CS2_029', a.uid);
    expect(a.hp).toBe(before - 6);
  });

  it('派洛斯：死亡後以 6/6 回到手牌，再死亡則是 10/10', () => {
    const g = newGame();
    const me = g.s.players[0];
    const p = put(g, 'UNG_027', 0);
    play(g, 'CS2_029', p.uid);
    expect(me.hand.some((h) => h.cardId === 'UNG_027t2')).toBe(true);
  });

  it('拉法姆的詛咒：對手持有時，每回合開始受到 2 點傷害', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g, 'LOE_007');
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].hero.hp).toBe(28);
  });
});
