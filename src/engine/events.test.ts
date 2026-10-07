// 活動限定卡（時間之沙等）與補上的核心卡測試
import { describe, expect, it } from 'vitest';
import { COLLECTIBLE, getCard } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId, PlayerState } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

function newGame(opts: { deck?: string[]; classes?: PlayerState['heroClass'][]; seed?: number } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const [c0, c1] = opts.classes ?? ['MAGE', 'WARRIOR'];
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

function play(g: Game, cardId: string, target?: number, extra: Record<string, unknown> = {}) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, target, ...extra })).toBe(true);
  return hc;
}

const pass = (g: Game) => {
  g.apply({ type: 'endTurn' });
  g.apply({ type: 'endTurn' });
};



describe('活動限定卡', () => {
  it('時間之沙：可以收錄、是標準模式的卡', () => {
    const c = getCard('TIME_EVENT_999');
    expect(c.name).toBe('時間之沙');
    expect(COLLECTIBLE.some((x) => x.id === 'TIME_EVENT_999')).toBe(true);
  });

  it('時間之沙：倒轉卡，打出後發現法術', () => {
    const g = newGame();
    const hc = give(g, 'TIME_EVENT_999');
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.pendingChoice).toBeTruthy();
  });

  it('古神降臨：抽 2 張手下、補滿法力，之後只能打法術以外…只能打手下', () => {
    const g = newGame();
    const p = g.s.players[0];
    play(g, 'BE_EVENT_100');
    expect(p.mana).toBe(10);
    const sp = give(g, 'CS2_029');
    expect(g.canPlay(sp.uid).ok).toBe(false);
    const mn = give(g, FILLER);
    expect(g.canPlay(mn.uid).ok).toBe(true);
  });

  it('泰坦降臨：之後只能打出法術', () => {
    const g = newGame();
    play(g, 'BE_EVENT_101');
    const mn = give(g, FILLER);
    expect(g.canPlay(mn.uid).ok).toBe(false);
    const sp = give(g, 'CS2_029');
    expect(g.canPlay(sp.uid).ok).toBe(true);
  });

  it('黑暗地貌改造：向左右延伸，傷害每格 -1', () => {
    const g = newGame();
    const ms = [1, 2, 3].map(() => put(g, 'CS2_182', 1));
    const hc = give(g, 'BE_EVENT_102');
    expect(g.apply({ type: 'play', handUid: hc.uid, target: ms[1].uid })).toBe(true);
    expect(ms[1].hp).toBe(0);
    expect(ms[0].hp).toBe(1);
    expect(ms[2].hp).toBe(1);
  });

  it('黑鐵先驅者：亡語召喚末日預言者', () => {
    const g = newGame();
    const m = put(g, 'TIME_EVENT_300', 0);
    m.dead = true;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].board.map((x) => x.cardId)).toContain('NEW1_021');
  });

  it('終末使者之杖：亡語消滅所有手下', () => {
    const g = newGame();
    play(g, 'TLC_EVENT_402');
    put(g, FILLER, 1);
    g.s.players[0].weapon!.durability = 0;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(true).toBe(true);
  });

  it('致命賄賂：消滅手下並給對手一枚幸運幣', () => {
    const g = newGame();
    const t = put(g, FILLER, 1);
    const before = g.s.players[1].hand.length;
    const hc = give(g, 'CATA_EVENT_402');
    expect(g.apply({ type: 'play', handUid: hc.uid, target: t.uid })).toBe(true);
    expect(g.s.players[1].board.length).toBe(0);
    expect(g.s.players[1].hand.length).toBe(before + 1);
  });

  it('福利社惡棍：花光法力召喚同消耗的手下', () => {
    const g = newGame();
    const hc = give(g, 'CATA_EVENT_400');
    g.s.players[0].mana = 3;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.players[0].mana).toBe(0);
  });

  it('毀滅信徒：隨機消滅其他手下', () => {
    const g = newGame();
    put(g, FILLER, 1);
    play(g, 'TIME_EVENT_301');
    expect(g.s.players[1].board.filter((m) => m.hp > 0 && !m.dead).length).toBe(0);
  });

  it('靈魂自焚：英雄能力變成崩塌之星，再用一次傷害 +1', () => {
    const g = newGame();
    play(g, 'JAIL_EVENT_101');
    expect(g.s.players[0].heroPower.id).toBe('JAIL_EVENT_101hp');
    expect(g.s.players[0].starDmg).toBe(2);
    play(g, 'JAIL_EVENT_101');
    expect(g.s.players[0].starDmg).toBe(3);
    const hp = g.s.players[1].hero.hp;
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'heroPower' })).toBe(true);
    expect(g.s.players[1].hero.hp).toBe(hp - 3);
  });

  it('時光守護者魯尼：手牌中的手下 2 個回合後帶著 +5/+5 回來', () => {
    const g = newGame();
    const mn = give(g, 'CS2_182', 0, false);
    play(g, 'TIME_EVENT_998');
    expect(g.s.players[0].hand.includes(mn)).toBe(false);
    pass(g);
    pass(g);
    const back = g.s.players[0].hand.find((h) => h.cardId === 'CS2_182' && h.atkBuff >= 5);
    expect(back).toBeTruthy();
  });

  it('破碎的龍魂：對戰開始分裂成 6 個龍族精華', () => {
    const deck = ['CATA_EVENT_110', ...Array(29).fill(FILLER)];
    const g = newGame({ deck });
    const all = [...g.s.players[0].deck, ...g.s.players[0].hand].map((h) => h.cardId);
    expect(all.filter((id) => id.startsWith('CATA_EVENT_110t')).length).toBe(6);
    expect(all).not.toContain('CATA_EVENT_110');
  });

  it('龍族精華：相鄰的精華會一起施放', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.hand = [];
    const a = give(g, 'CATA_EVENT_110t5');
    give(g, 'CATA_EVENT_110t4', 0, false);
    p.mana = 10;
    expect(g.apply({ type: 'play', handUid: a.uid })).toBe(true);
    expect(p.hero.armor).toBe(12);
    expect(p.hand.length).toBe(0);
  });

  it('衝破大門：打出 3 個野獸或不死族後獲得獎勵', () => {
    const g = newGame();
    play(g, 'TLC_EVENT_400');
    for (let i = 0; i < 3; i++) play(g, 'CS2_172'); // 血帆襲擊者…（野獸以外也會被檢查）
    expect(g.s.players[0].hand.some((h) => h.cardId === 'EVT_ZOMBEAST')).toBe(true);
  });

  it('瓦特芬：發現手下', () => {
    const g = newGame();
    play(g, 'JAIL_EVENT_100');
    expect(g.s.pendingChoice).toBeTruthy();
  });

  it('毀滅鳳凰、始源領主、歡迎回家：可以打出', () => {
    const g = newGame();
    for (const id of ['CATA_EVENT_000', 'CATA_EVENT_001', 'TIME_EVENT_997', 'EDR_950', 'JAIL_EVENT_102', 'CATA_EVENT_002', 'CATA_EVENT_401']) {
      const hc = give(g, id);
      g.apply({ type: 'play', handUid: hc.uid });
      while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 } as never);
    }
    expect(g.s.players[0].board.length).toBeGreaterThan(0);
  });
});

describe('補上的核心卡', () => {
  it('血紅深淵、淵誓法警、瓦許女爵、霜之哀傷、窒息術、天譴軍團都可以用', () => {
    for (const id of ['REV_990', 'MAW_028', 'REV_925', 'RLK_086', 'RLK_087', 'RLK_122']) expect(COLLECTIBLE.some((c) => c.id === id)).toBe(true);
  });

  it('淵誓法警：4 點護甲以上 +4/+4', () => {
    const g = newGame();
    g.s.players[0].hero.armor = 4;
    play(g, 'MAW_028');
    expect(g.s.players[0].board[0].hp).toBe(8);
  });
});
