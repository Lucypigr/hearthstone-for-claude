// 穿越時間流：倒轉、傳說、灌注、地點、目標等新機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { COLLECTIBLE, getCard } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId, PlayerState } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

function newGame(opts: { deck?: string[]; deck1?: string[]; classes?: PlayerState['heroClass'][]; first?: PlayerId; seed?: number } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const [c0, c1] = opts.classes ?? ['MAGE', 'WARRIOR'];
  const g = Game.create({ decks: [deck, opts.deck1 ?? deck], classes: [c0, c1], names: ['玩家', '電腦'], ai: [false, false], seed: opts.seed ?? 42, first: opts.first ?? 0 });
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

const board = (g: Game, pid: PlayerId) => g.s.players[pid].board.map((m) => m.cardId);
const kill = (m: Minion) => {
  m.hp = 0;
  m.dead = true;
};
const pass = (g: Game) => {
  g.apply({ type: 'endTurn' });
  g.apply({ type: 'endTurn' });
};
const names = (g: Game, pid: PlayerId) => g.s.players[pid].hand.map((h) => h.cardId);

describe('倒轉', () => {
  it('打出倒轉牌後可以選擇保留', () => {
    const g = newGame();
    const hc = give(g, 'TIME_004');
    const foeHp = g.s.players[1].hero.hp;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.pendingChoice?.options).toEqual(['TIME_000ta', 'TIME_000tb']);
    expect(g.apply({ type: 'choose', index: 0 })).toBe(true);
    expect(g.s.pendingChoice).toBeNull();
    expect(g.s.players[0].board.map((m) => m.cardId)).toEqual(['TIME_004']);
    expect(g.s.players[1].hero.hp).toBe(foeHp - 7);
    expect(g.s.players[0].hand.some((h) => h.uid === hc.uid)).toBe(false);
  });

  it('選擇倒轉：回到打出前，這張牌回到手牌且沒有倒轉了', () => {
    const g = newGame();
    const hc = give(g, 'TIME_004');
    const foeHp = g.s.players[1].hero.hp;
    const mana = g.s.players[0].mana;
    g.apply({ type: 'play', handUid: hc.uid });
    g.apply({ type: 'choose', index: 1 });
    expect(g.s.pendingChoice).toBeNull();
    expect(g.s.players[0].board).toHaveLength(0);
    expect(g.s.players[1].hero.hp).toBe(foeHp);
    expect(g.s.players[0].mana).toBe(mana);
    const back = g.s.players[0].hand.find((h) => h.uid === hc.uid)!;
    expect(back).toBeTruthy();
    expect(g.rewindsOf(back)).toBe(0);
    // 再打一次就不會再問
    g.apply({ type: 'play', handUid: hc.uid });
    expect(g.s.pendingChoice).toBeNull();
    expect(g.s.players[0].board).toHaveLength(1);
  });

  it('倒轉後結果會不一樣（亂數往前走）', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 6; seed++) {
      const g = newGame({ seed });
      put(g, FILLER, 1);
      put(g, FILLER, 1);
      const hc = give(g, 'TIME_004');
      g.apply({ type: 'play', handUid: hc.uid });
      g.apply({ type: 'choose', index: 1 });
      g.apply({ type: 'play', handUid: hc.uid });
      seen.add(g.s.players[1].board.length);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('傳說', () => {
  it('開局時，傳說卡的組合卡一起洗入牌堆', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_209'; // 穆拉丁：高王之錘
    const g = newGame({ deck });
    const all = [...g.s.players[0].deck, ...g.s.players[0].hand].map((h) => h.cardId);
    expect(all).toContain('TIME_209t');
    expect(all).toContain('TIME_209t2');
    expect(all.length).toBe(32);
  });
});

describe('灌注與英雄能力', () => {
  it('盜賊：灌注把英雄能力換成青銅龍的祝福，每次灌注消耗更少', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'END_000', g.s.players[1].hero.uid);
    expect(g.s.players[1].hero.hp).toBe(28);
    expect(me.imbued).toBe(1);
    expect(me.heroPower.id).toBe('END_000p');
    // 使用英雄能力：有倒轉，選擇保留
    me.mana = 10;
    const handBefore = me.hand.length;
    expect(g.apply({ type: 'heroPower' })).toBe(true);
    expect(g.s.pendingChoice?.options).toEqual(['TIME_000ta', 'TIME_000tb']);
    g.apply({ type: 'choose', index: 0 });
    expect(me.hand.length).toBe(handBefore + 1);
    const got = me.hand[me.hand.length - 1];
    expect(g.costOf(me, got)).toBe(Math.max(0, require_cost(got.cardId) - 1));
  });

  it('盜賊：英雄能力倒轉會回到使用前，同回合不能再倒轉', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g, 'END_001'); // 時間的鋸齒（武器）：戰吼灌注
    const me = () => g.s.players[0];
    expect(me().heroPower.id).toBe('END_000p');
    me().mana = 10;
    const handBefore = me().hand.length;
    g.apply({ type: 'heroPower' });
    g.apply({ type: 'choose', index: 1 });
    expect(me().hand.length).toBe(handBefore);
    expect(me().heroPower.used).toBe(false);
    expect(me().mana).toBe(10);
    g.apply({ type: 'heroPower' });
    expect(g.s.pendingChoice).toBeNull();
    expect(me().hand.length).toBe(handBefore + 1);
  });

  it('死亡騎士：灌注兩次後，每回合第一個死靈獲得 +2 攻擊力', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'END_003');
    expect(me.imbued).toBe(2);
    expect(me.heroPower.id).toBe('END_003p');
    expect(g.apply({ type: 'heroPower' })).toBe(false); // 被動
    const undead = COLLECTIBLE.find((c) => c.type === 'MINION' && c.races?.includes('UNDEAD') && c.cost === 2 && !c.abilities?.length && !c.keywords?.length)!;
    play(g, undead.id);
    expect(me.board[0].atkBuff).toBe(2);
    play(g, undead.id);
    expect(me.board[1].atkBuff).toBe(0); // 每回合只有第一個
  });
});

function require_cost(id: string): number {
  return getCard(id).cost;
}

describe('目標（Aura）', () => {
  it('加速光環：接下來 3 個回合開始時獲得暫時的法力水晶', () => {
    const g = newGame();
    const me = () => g.s.players[0];
    play(g, 'END_011');
    me().maxMana = me().mana = 3;
    expect(me().eternal?.some((e) => e.objective)).toBe(true);
    pass(g); // 我的第 2 個回合
    expect(me().mana).toBe(me().maxMana + 1);
    pass(g);
    pass(g);
    expect(me().mana).toBe(me().maxMana + 1); // 第 3 次
    pass(g);
    expect(me().mana).toBe(me().maxMana); // 已結束
    expect(me().eternal?.some((e) => e.objective) ?? false).toBe(false);
  });

  it('時間光環：在回合結束時召喚 3/5 嘲諷龍，持續 3 次', () => {
    const g = newGame();
    play(g, 'TIME_700');
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].board.map((m) => m.cardId)).toEqual(['TIME_700t']);
    pass(g);
    pass(g);
    expect(g.s.players[0].board).toHaveLength(3);
    pass(g);
    expect(g.s.players[0].board).toHaveLength(3);
  });

  it('傑爾賓：把牌堆中的目標放到戰場上；顯化的時間流對敵人造成傷害', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_009';
    const g = newGame({ deck });
    const me = g.s.players[0];
    play(g, 'TIME_009');
    expect(me.eternal?.filter((e) => e.objective).length).toBe(2);
    expect(me.deck.some((h) => h.cardId === 'TIME_009t1')).toBe(false);
    const foe = g.s.players[1];
    play(g, 'TIME_019');
    expect(foe.hero.hp).toBe(27);
  });
});

describe('地點牌', () => {
  it('過去的諾姆瑞根：啟用給手下 +2/+1，前進到現在，之後要等一個回合', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const me = g.s.players[0];
    const m = put(g, FILLER, 0);
    play(g, 'TIME_044');
    expect(me.locations).toHaveLength(1);
    const loc = me.locations![0];
    expect(g.apply({ type: 'location', uid: loc.uid })).toBe(false); // 需要目標
    expect(g.apply({ type: 'location', uid: loc.uid, target: m.uid })).toBe(true);
    expect(g.atkOf(m)).toBe(6);
    expect(m.hp).toBe(6);
    expect(me.locations![0].cardId).toBe('TIME_044t1');
    expect(g.apply({ type: 'location', uid: loc.uid, target: m.uid })).toBe(false); // 冷卻中
    pass(g);
    expect(g.apply({ type: 'location', uid: loc.uid, target: m.uid })).toBe(false); // 還要一個回合
    pass(g);
    expect(g.apply({ type: 'location', uid: loc.uid, target: m.uid })).toBe(true);
    kill(m);
    pass(g);
    expect(g.s.players[1].hero.hp).toBe(30 - 2);
  });

  it('過去的銀月城：隨機打敵方手下，多出的傷害打敵方英雄（現在）', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const foe = g.s.players[1];
    put(g, FILLER, 1);
    play(g, 'TIME_810');
    const loc = g.s.players[0].locations![0];
    expect(g.apply({ type: 'location', uid: loc.uid })).toBe(true);
    expect(foe.board).toHaveLength(0);
    pass(g);
    pass(g);
    const m2 = put(g, 'CS2_168', 1); // 1/1
    expect(g.apply({ type: 'location', uid: loc.uid })).toBe(true);
    expect(m2.hp <= 0).toBe(true);
    expect(foe.hero.hp).toBe(30 - 4); // 5 - 1 = 4 點多出的傷害
  });

  it('地點牌佔用戰場空間；耐久度用完就消失', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    play(g, 'TIME_436'); // 過去的匯流
    const me = g.s.players[0];
    expect(me.locations).toHaveLength(1);
    const uid = me.locations![0].uid;
    g.apply({ type: 'location', uid });
    expect(me.board).toHaveLength(1);
    expect(me.board[0].cardId).not.toBeUndefined();
    expect(getCard(me.board[0].cardId).races).toContain('DRAGON');
    expect(getCard(me.board[0].cardId).cost).toBeGreaterThanOrEqual(5);
  });
});

describe('傳說', () => {
  it('拉法姆：九個拉法姆一起洗入牌堆', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_005';
    const g = newGame({ deck });
    const all = [...g.s.players[0].deck, ...g.s.players[0].hand].map((h) => h.cardId);
    expect(all.filter((id) => id.startsWith('TIME_005t')).length).toBe(9);
  });

  it('拉法姆：打出其他所有拉法姆後再打出本尊，消滅敵方英雄', () => {
    const g = newGame();
    const me = g.s.players[0];
    for (let i = 1; i <= 9; i++) (me.playedCards ??= []).push(`TIME_005t${i}`);
    play(g, 'TIME_005');
    expect(g.s.phase).toBe('over');
    expect(g.s.winner).toBe(0);
  });

  it('加羅娜：消滅對手手牌中的萊恩國王並讓對手生命值減半；萊恩國王開局躲進敵方牌堆', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_875';
    const g = newGame({ deck, deck1: Array(30).fill(FILLER) });
    const all1 = [...g.s.players[1].deck, ...g.s.players[1].hand].map((h) => h.cardId);
    expect(all1).toContain('TIME_875t');
    expect([...g.s.players[0].deck, ...g.s.players[0].hand].map((h) => h.cardId)).not.toContain('TIME_875t');
    give(g, 'TIME_875t', 1, false);
    play(g, 'TIME_875');
    expect(g.s.players[1].hero.hp).toBe(15);
    expect(names(g, 1)).not.toContain('TIME_875t');
  });

  it('布洛克薩：開局消失；阿古斯惡魔鏈的最後一隻死亡後回到手牌', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_020';
    const g = newGame({ deck });
    const me = g.s.players[0];
    expect(me.broxigar?.cardId).toBe('TIME_020');
    play(g, 'TIME_020t5'); // 最終傳送門：為對手召喚 4/1 惡魔
    const demon = g.s.players[1].board[0];
    expect(demon.cardId).toBe('TIME_020t5t');
    kill(demon);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TIME_020')).toBe(true);
  });
});
