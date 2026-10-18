// 巨龍降臨：機制與卡牌的測試
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

describe('巨龍降臨', () => {
  it('收錄全部可收藏卡', () => {
    const left = ALL_CARDS().filter((c) => c.collectible && c.set === 1347);
    expect(left.length).toBe(140);
  });

  it('祈求：觸發葛拉克朗的英雄能力，祈求兩次後升級', () => {
    const deck = [...Array(29).fill(FILLER), 'DRG_600'];
    const g = newGame({ cls: 'WARLOCK', deck });
    play(g, 'DRG_303');
    expect(ids(g, 0).filter((x) => x === 'DRG_238t12t2').length).toBe(2);
    const all = () => [...g.s.players[0].hand, ...g.s.players[0].deck].map((h) => h.cardId);
    expect(all()).toContain('DRG_600');
    play(g, 'DRG_303');
    expect(all()).toContain('DRG_600t2');
    expect(all()).not.toContain('DRG_600');
    expect(g.s.players[0].invokes).toBe(2);
  });

  it('祈求：沒有葛拉克朗時沒有效果', () => {
    const g = newGame({ cls: 'WARLOCK' });
    play(g, 'DRG_303');
    expect(ids(g, 0)).toEqual(['DRG_303']);
    expect(g.s.players[0].invokes ?? 0).toBe(0);
  });

  it('打出升級後的葛拉克朗', () => {
    const g = newGame({ cls: 'WARLOCK' });
    play(g, 'DRG_600t3');
    expect(g.s.players[0].hero.cardId).toBe('DRG_600t3');
    expect(ids(g, 0).length).toBe(4);
    expect(g.s.players[0].weapon?.cardId).toBe('DRG_238ht');
  });

  it('支線任務：召喚 5 個手下後你的手下獲得 +1/+1', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'DRG_008');
    expect(g.s.players[0].sidequests?.length).toBe(1);
    for (let i = 0; i < 4; i++) play(g, FILLER);
    expect(g.s.players[0].sidequests?.length).toBe(1);
    play(g, FILLER);
    expect(g.s.players[0].sidequests?.length ?? 0).toBe(0);
    expect(g.atkOf(g.s.players[0].board[0])).toBe(5);
  });

  it('支線任務：使用 3 次英雄能力後召喚三個麻瘋地精', () => {
    const g = newGame({ cls: 'HUNTER' });
    play(g, 'DRG_255');
    for (let i = 0; i < 3; i++) {
      g.s.players[0].mana = 10;
      expect(g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid })).toBe(true);
      g.s.players[0].heroPower.used = false;
    }
    expect(ids(g, 0).filter((x) => x === 'DRG_255t2').length).toBe(3);
  });

  it('風暴戰錘：控制龍時不會失去耐久度', () => {
    const g = newGame({ cls: 'HUNTER' });
    play(g, 'DRG_007');
    put(g, 'DRG_058', 0); // 飛翼指揮官不是龍
    put(g, 'DRG_036', 0); // 瓦蠟雷德是龍
    expect(g.apply({ type: 'attack', attacker: g.s.players[0].hero.uid, target: g.s.players[1].hero.uid })).toBe(true);
    expect(g.s.players[0].weapon?.durability).toBe(2);
  });

  it('活化的龍息：你的手下無法被凍結', () => {
    const g = newGame();
    put(g, 'DRG_068', 0);
    const yeti = put(g, FILLER, 0);
    play(g, 'CS2_026'); // 冰霜新星：凍結所有敵方手下（不影響自己）
    endTurns(g, 1);
    play(g, 'CS2_026');
    expect(yeti.frozen).toBe(false);
  });

  it('潘達斯莫許：在手牌中每回合變成傳說手下的 5/5 複製', () => {
    const g = newGame({ cls: 'SHAMAN' });
    const hc = give(g, 'DRG_096');
    endTurns(g, 2);
    expect(hc.cardId).not.toBe('DRG_096');
    expect(getCard(hc.cardId).rarity).toBe('LEGENDARY');
    expect(g.costOf(g.s.players[0], hc)).toBe(5);
  });

  it('滾動的火球：多餘的傷害繼續滾到旁邊的手下', () => {
    const g = newGame();
    put(g, FILLER, 1);
    const mid = put(g, 'CS2_172', 1); // 3/2
    put(g, FILLER, 1);
    play(g, 'DRG_321', { target: mid.uid });
    // 3/2 吸收 2 點，多出的 6 點打在其中一側的雪人（4/5）身上並消滅它，再剩 1 點滾到場邊消失
    expect(g.alive(mid)).toBe(false);
    expect(g.s.players[1].board.filter((m) => g.alive(m)).length).toBe(1);
  });

  it('狗頭人扒手：偷取對手的武器', () => {
    const g = newGame();
    endTurns(g, 1);
    play(g, 'CS2_106');
    endTurns(g, 1);
    play(g, 'DRG_082');
    expect(g.s.players[0].weapon?.cardId).toBe('CS2_106');
    expect(g.s.players[1].weapon).toBeFalsy();
  });

  it('克隆克斯‧龍蹄：抽出葛拉克朗', () => {
    const deck = [...Array(29).fill(FILLER), 'DRG_650'];
    const g = newGame({ cls: 'WARRIOR', deck });
    play(g, 'DRG_099');
    expect(g.s.players[0].hand.some((h) => h.cardId === 'DRG_650')).toBe(true);
  });
});
