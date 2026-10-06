// 標準模式最後補上的卡：地點牌與核心的 CS3_ / RLK_ / TTN_ 卡
import { describe, expect, it } from 'vitest';
import { Game } from './game';
import type { HandCard, Minion, PlayerId, PlayerState } from './state';

const FILLER = 'CS2_182';

function newGame(opts: { classes?: PlayerState['heroClass'][] } = {}): Game {
  const deck = Array(30).fill(FILLER);
  const [c0, c1] = opts.classes ?? ['MAGE', 'WARRIOR'];
  const g = Game.create({ decks: [deck, deck], classes: [c0, c1], names: ['玩家', '電腦'], ai: [false, false], seed: 42, first: 0 });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}
function give(g: Game, cardId: string, pid: PlayerId = g.s.current): HandCard {
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
function play(g: Game, cardId: string, target?: number, extra: Record<string, unknown> = {}) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, target, ...extra })).toBe(true);
  return hc;
}
const useLocation = (g: Game, target?: number) => {
  const loc = g.s.players[0].locations![g.s.players[0].locations!.length - 1];
  expect(g.apply({ type: 'location', uid: loc.uid, target })).toBe(true);
  return loc;
};

describe('標準剩餘：地點牌', () => {
  it('孤獨尖塔：召喚屬性值等同手牌數的惡魔', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    g.s.players[0].hand = [];
    play(g, 'JAIL_511');
    for (let i = 0; i < 3; i++) give(g, FILLER);
    useLocation(g);
    const demon = g.s.players[0].board.find((m) => m.cardId === 'JAIL_511t')!;
    expect(demon.baseAtk).toBe(3);
  });

  it('地下網路：召喚老鼠，亡語抽牌', () => {
    const g = newGame();
    play(g, 'JAIL_877');
    useLocation(g);
    expect(g.s.players[0].board.map((m) => m.cardId)).toEqual(['JAIL_877t']);
  });

  it('艾梅達希爾：每次使用都提升', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    play(g, 'FIR_907');
    const armor = g.s.players[0].hero.armor;
    useLocation(g);
    expect(g.s.players[0].hero.armor).toBe(armor + 1);
    g.s.players[0].locations![0].cooldown = 0;
    useLocation(g);
    expect(g.s.players[0].hero.armor).toBe(armor + 1 + 2);
  });

  it('被奴役的奈斯比拉：耐久度用完後召喚被解放的奈斯比拉', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g, 'CATA_527');
    const loc = g.s.players[0].locations![0];
    for (let i = 0; i < 5; i++) {
      loc.cooldown = 0;
      if (!g.s.players[0].locations?.includes(loc)) break;
      useLocation(g, g.s.players[1].hero.uid);
    }
    expect(g.s.players[0].board.some((m) => m.cardId === 'CATA_527t2')).toBe(true);
  });

  it('禁忌神殿：花光法力並施放消耗相同的法術', () => {
    const g = newGame();
    play(g, 'EDR_520');
    g.s.players[0].mana = 3;
    useLocation(g);
    expect(g.s.players[0].mana).toBe(0);
  });

  it('墮落之龍的巢穴：蛋的亡語孵化成那條龍', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const dragon = put(g, 'BRM_004', 0);
    play(g, 'EDR_454');
    useLocation(g, dragon.uid);
    const egg = g.s.players[0].board.find((m) => m.cardId === 'EDR_454t')!;
    egg.hp = 0;
    egg.dead = true;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].board.filter((m) => m.cardId === 'BRM_004').length).toBe(2);
  });

  it('紅玉聖所：下一次治療改為造成傷害', () => {
    const g = newGame();
    play(g, 'CATA_301');
    useLocation(g);
    expect(g.s.players[0].healDamageOnceTurn).toBe(g.s.turn);
  });

  it('低安全區：獲得的薩滿手下在打出另一張牌前無法打出', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    g.s.players[0].hand = [];
    play(g, 'JAIL_987');
    useLocation(g);
    const locked = g.s.players[0].hand[g.s.players[0].hand.length - 1];
    expect(g.canPlay(locked.uid).ok).toBe(false);
  });
});

describe('標準剩餘：核心卡牌', () => {
  it('毀滅者死亡之翼：消滅其他手下，每個棄一張牌', () => {
    const g = newGame();
    put(g, FILLER, 1);
    put(g, FILLER, 1);
    for (let i = 0; i < 3; i++) give(g, 'CS2_182');
    const handBefore = g.s.players[0].hand.length;
    play(g, 'CS3_036');
    expect(g.s.players[1].board).toHaveLength(0);
    expect(g.s.players[0].hand.length).toBeLessThanOrEqual(handBefore - 2);
  });

  it('縫補怪：消滅對手手牌、牌堆與戰場上各一個手下', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    put(g, FILLER, 1);
    give(g, FILLER, 1);
    const deck = g.s.players[1].deck.length;
    play(g, 'RLK_071');
    expect(g.s.players[1].board).toHaveLength(0);
    expect(g.s.players[1].deck.length).toBe(deck - 1);
  });

  it('護法者艾格文：抽到的下一個手下繼承法術傷害與亡語', () => {
    const g = newGame();
    const a = put(g, 'CS3_001', 0);
    a.hp = 0;
    a.dead = true;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].aegwynnNext).toBe(false);
    const inherited = g.s.players[0].hand.find((h) => h.spellDmg === 2);
    expect(inherited).toBeTruthy();
  });

  it('抵抗光環：對手的法術消耗增加', () => {
    const g = newGame({ classes: ['PALADIN', 'MAGE'] });
    play(g, 'TTN_851');
    g.apply({ type: 'endTurn' });
    const spell = give(g, 'CS2_029', 1);
    expect(g.costOf(g.s.players[1], spell)).toBeGreaterThan(4);
  });

  it('夢想者伊瑟拉：獲得全部 5 張夢境牌', () => {
    const g = newGame();
    g.s.players[0].hand = [];
    play(g, 'CS3_033');
    expect(g.s.players[0].hand).toHaveLength(5);
  });
});
