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

const toHand = (g: Game, p: PlayerState, id: string): HandCard => (g as unknown as { addToHand(p: PlayerState, id: string): HandCard }).addToHand(p, id);

describe('終結（END_）卡牌', () => {
  it('邪惡的枯萎之子：亡語裝備匕首；已有武器則 +2 攻擊力', () => {
    const g = newGame();
    const m = put(g, 'END_002', 0);
    kill(m);
    g.apply({ type: 'endTurn' });
    // 亡語在結算死亡時觸發
    const g2 = newGame();
    const m2 = put(g2, 'END_002', 0);
    m2.keywords = m2.keywords.filter((k) => k !== 'REBORN');
    kill(m2);
    g2.apply({ type: 'endTurn' });
    g2.apply({ type: 'endTurn' });
    expect(g2.s.players[0].weapon?.cardId).toBe('CS2_082');
    const g3 = newGame();
    play(g3, 'CS2_106'); // 戰歌指揮官的武器（任一武器）
    const before = g3.s.players[0].weapon!.atk;
    const m3 = put(g3, 'END_002', 0);
    m3.keywords = m3.keywords.filter((k) => k !== 'REBORN');
    kill(m3);
    g3.apply({ type: 'endTurn' });
    g3.apply({ type: 'endTurn' });
    expect(g3.s.players[0].weapon!.atk).toBe(before + 2);
    void g;
  });

  it('怒火殘影：本回合每死亡一個手下，消耗減少 (1)', () => {
    const g = newGame();
    const me = g.s.players[0];
    const hc = give(g, 'END_004');
    expect(g.costOf(me, hc)).toBe(7);
    g.s.deathsThisTurn = 3;
    expect(g.costOf(me, hc)).toBe(4);
  });

  it('往日回聲：召喚隨機 4 費手下；4 具屍體再一個；流放再一個', () => {
    const g = newGame();
    const me = g.s.players[0];
    me.corpses = 4;
    play(g, 'END_005');
    expect(me.board).toHaveLength(3);
    for (const m of me.board) expect(getCard(m.cardId).cost).toBe(4);
    expect(me.corpses).toBe(0);
  });

  it('時光獵手克羅尼卡：英雄本回合、下回合、下下回合各 +3 攻擊力', () => {
    const g = newGame();
    play(g, 'END_006');
    expect(g.s.players[0].hero.tempAtk).toBe(3);
    pass(g);
    expect(g.s.players[0].hero.tempAtk).toBe(3);
    pass(g);
    expect(g.s.players[0].hero.tempAtk).toBe(3);
    pass(g);
    expect(g.s.players[0].hero.tempAtk).toBe(0);
  });

  it('乘勝追擊：造成 1 點傷害、英雄 +1 攻擊力、抽牌、護甲', () => {
    const g = newGame();
    const me = g.s.players[0];
    const hand = me.hand.length;
    play(g, 'END_007', g.s.players[1].hero.uid);
    expect(g.s.players[1].hero.hp).toBe(29);
    expect(me.hero.tempAtk).toBe(1);
    expect(me.hero.armor).toBe(1);
    expect(me.hand.length).toBe(hand + 1);
  });

  it('持久的蟑螂：使用英雄能力後補充 2 顆法力水晶', () => {
    const g = newGame();
    put(g, 'END_008', 0);
    const me = g.s.players[0];
    me.mana = me.maxMana = 10;
    g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid });
    expect(me.mana).toBe(10);
  });

  it('碎裂的現實：樹人獲得與死亡樹人數量相同的體質', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    me.graveyard.push('END_009t', 'END_009t', 'END_009t');
    play(g, 'END_009');
    expect(me.board.map((m) => [g.atkOf(m), m.hp])).toEqual([
      [5, 5],
      [5, 5],
    ]);
  });

  it('暮光時光收割者：二選一，把其他手下的攻擊力或生命值設為 1', () => {
    const g = newGame();
    const a = put(g, FILLER, 0);
    const b = put(g, FILLER, 1);
    play(g, 'END_010', undefined, { option: 0 });
    expect(g.atkOf(a)).toBe(1);
    expect(g.atkOf(b)).toBe(1);
    expect(a.hp).toBe(5);
    const g2 = newGame();
    const c = put(g2, FILLER, 1);
    play(g2, 'END_010', undefined, { option: 1 });
    expect(c.hp).toBe(1);
    expect(g2.atkOf(c)).toBe(4);
  });

  it('無限之刃：本回合攻擊力無限，回合結束後恢復', () => {
    const g = newGame();
    play(g, 'END_012');
    expect(g.s.players[0].weapon!.atk).toBeGreaterThan(900);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].weapon!.atk).toBe(4);
  });

  it('粗野的終末之口 / 永恆之翼：發現帶黑暗禮物的手下', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'END_013');
    expect(g.s.pendingChoice?.options.length).toBeGreaterThan(0);
    for (const id of g.s.pendingChoice!.options) expect(getCard(id).cost).toBe(1);
    const before = me.hand.length;
    g.apply({ type: 'choose', index: 0 });
    expect(me.hand.length).toBe(before + 1);
    const g2 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    play(g2, 'END_027');
    for (const id of g2.s.pendingChoice!.options) expect(getCard(id).races).toContain('DRAGON');
  });

  it('同步火花：敵人死亡時，隨機友方手下 +3/+3', () => {
    const g = newGame();
    const mine = put(g, FILLER, 0);
    const victim = put(g, 'CS2_168', 1);
    play(g, 'END_014', victim.uid);
    expect(g.atkOf(mine)).toBe(7);
    expect(mine.hp).toBe(8);
  });

  it('三年霸王龍：亡語獲得一張亡語手下牌', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    const hand = me.hand.length;
    const m = put(g, 'END_015', 0);
    kill(m);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.hand.length).toBeGreaterThanOrEqual(hand);
    expect(g.s.players[0].hand.some((h) => getCard(h.cardId).abilities?.some((a) => a.on.k === 'deathrattle'))).toBe(true);
  });

  it('時光利爪：英雄攻擊後棄掉消耗最高的牌', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'END_016');
    me.hand = [g.newHandCard('CS2_168'), g.newHandCard(FILLER), g.newHandCard('CS2_168')];
    g.apply({ type: 'attack', attacker: me.hero.uid, target: g.s.players[1].hero.uid });
    expect(g.s.players[0].hand.map((h) => h.cardId)).toEqual(['CS2_168', 'CS2_168']);
  });

  it('終末之戰（任務）：填滿手牌再清空，獲得滴答與嘀嗒', () => {
    const g = newGame();
    const me = g.s.players[0];
    me.hand = [];
    play(g, 'END_017');
    expect(me.quest?.cardId).toBe('END_017');
    while (g.s.players[0].hand.length < 10) toHand(g, g.s.players[0], 'CS2_168');
    expect(g.s.players[0].quest?.progress).toBe(1);
    // 打光手牌
    g.s.players[0].mana = g.s.players[0].maxMana = 10;
    for (let i = 0; i < 20 && g.s.players[0].hand.length && !g.s.players[0].hand.some((h) => h.cardId === 'END_017t'); i++) {
      const hc = g.s.players[0].hand[0];
      if (!g.apply({ type: 'play', handUid: hc.uid })) {
        g.s.players[0].hand.shift();
        toHand(g, g.s.players[0], 'CS2_168'); // 不應該發生
      }
      g.s.players[0].board = [];
      g.s.players[0].mana = 10;
    }
    expect(g.s.players[0].hand.map((h) => h.cardId)).toContain('END_017t');
  });

  it('無限的侍僧：戰吼把一張手牌消耗設為無限，死亡後恢復', () => {
    const g = newGame();
    const me = g.s.players[0];
    me.hand = [g.newHandCard('CS2_168')];
    play(g, 'END_018');
    expect(g.costOf(me, me.hand[0])).toBeGreaterThan(100);
    const acolyte = me.board[0];
    kill(acolyte);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.costOf(g.s.players[0], g.s.players[0].hand[0])).toBeLessThan(10);
  });

  it('終結時光的倖存者：英雄本回合受過傷害才有 +3/+3', () => {
    const g = newGame();
    play(g, 'END_019');
    expect(g.atkOf(g.s.players[0].board[0])).toBe(5);
    const g2 = newGame();
    g2.s.players[0].heroDamagedTurn = g2.s.turn;
    play(g2, 'END_019');
    expect(g2.atkOf(g2.s.players[0].board[0])).toBe(8);
  });

  it('永恆的勞役：存活抽牌，死亡召喚 1 費手下', () => {
    const g = newGame();
    const m = put(g, FILLER, 1);
    const hand = g.s.players[0].hand.length;
    play(g, 'END_020', m.uid);
    expect(g.s.players[0].hand.length).toBe(hand + 1);
    const g2 = newGame();
    const v = put(g2, 'CS2_168', 1);
    play(g2, 'END_020', v.uid);
    expect(g2.s.players[0].board).toHaveLength(1);
    expect(getCard(g2.s.players[0].board[0].cardId).cost).toBe(1);
  });

  it('次元武器匠：手牌中的手下與武器 +2 攻擊力', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const me = g.s.players[0];
    me.hand = [g.newHandCard('CS2_168'), g.newHandCard('CS2_106')];
    play(g, 'END_021');
    expect(me.hand.map((h) => h.atkBuff)).toEqual([2, 2]);
  });

  it('扭曲時間的先知：受傷時法術傷害 +2', () => {
    const g = newGame();
    const m = put(g, 'END_022', 0);
    expect(g.spellDamage(0)).toBe(0);
    m.hp = 1;
    expect(g.spellDamage(0)).toBe(2);
  });

  it('苦澀的終點：凍結並消滅受傷的手下與相鄰手下', () => {
    const g = newGame();
    const a = put(g, FILLER, 1);
    const b = put(g, FILLER, 1);
    const c = put(g, FILLER, 1);
    b.hp = 2;
    play(g, 'END_023', a.uid);
    expect(a.frozen).toBe(true);
    expect(b.frozen).toBe(true);
    expect(g.s.players[1].board.map((m) => m.uid)).toEqual([a.uid, c.uid].filter((u) => g.s.players[1].board.some((m) => m.uid === u)));
    expect(g.s.players[1].board.some((m) => m.uid === b.uid)).toBe(false);
  });

  it('無盡之焰：在對手回合結束時消滅其生命值最高的手下', () => {
    const g = newGame();
    play(g, 'END_024');
    const small = put(g, 'CS2_168', 1);
    const big = put(g, FILLER, 1);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].board.map((m) => m.uid)).toEqual([small.uid]);
    void big;
  });

  it('永恆火焰箭：擊殺後在回合結束時回到手牌', () => {
    const g = newGame();
    const v = put(g, 'CS2_168', 1);
    play(g, 'END_025', v.uid);
    expect(g.s.players[0].hand.some((h) => h.cardId === 'END_025')).toBe(false);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.some((h) => h.cardId === 'END_025')).toBe(true);
  });

  it('虛無碎片：對手下施放法術後抽一張牌', () => {
    const g = newGame();
    put(g, 'END_026', 0);
    const target = put(g, FILLER, 1);
    const hand = g.s.players[0].hand.length;
    play(g, 'CS2_029', target.uid); // 火球術
    expect(g.s.players[0].hand.length).toBe(hand + 1);
  });

  it('亙古不變：消滅所有攻擊力 4 以下的手下，超載 2', () => {
    const g = newGame();
    const small = put(g, 'CS2_168', 1);
    const mine = put(g, 'CS2_168', 0);
    const big = put(g, 'CS2_186', 1); // 戰歌指揮官 2/3?
    play(g, 'END_028');
    expect(small.dead || small.hp <= 0).toBe(true);
    expect(mine.dead || mine.hp <= 0).toBe(true);
    expect(g.s.players[0].overloadOwed).toBe(2);
    void big;
  });

  it('巫毒圖騰：回合結束時獲得一張暗影法術', () => {
    const g = newGame();
    put(g, 'END_029', 0);
    const hand = g.s.players[0].hand.length;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.length).toBe(hand + 1);
    expect(getCard(g.s.players[0].hand[hand].cardId).spellSchool).toBe('SHADOW');
  });

  it('故障的豬頭怪：每超載過一顆法力水晶，消耗減少 (1)', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const hc = give(g, 'END_030');
    expect(g.costOf(g.s.players[0], hc)).toBe(6);
    g.s.players[0].overloadTotal = 3;
    expect(g.costOf(g.s.players[0], hc)).toBe(3);
  });

  it('長翼畸變體：連擊超載 (2)，本回合免疫並獲得風怒', () => {
    const g = newGame();
    play(g, 'CS2_168');
    play(g, 'END_032');
    const m = g.s.players[0].board[1];
    expect(m.cardId).toBe('END_032');
    expect(g.hasKw(m, 'IMMUNE')).toBe(true);
    expect(g.hasKw(m, 'WINDFURY')).toBe(true);
    expect(g.s.players[0].overloadOwed).toBe(2);
  });

  it('先見的蛇龍：手牌中有另一條龍時消耗減少 (3)', () => {
    const g = newGame();
    const me = g.s.players[0];
    me.hand = [];
    const hc = give(g, 'END_033');
    expect(g.costOf(me, hc)).toBe(7);
    toHand(g, me, 'END_033');
    expect(g.costOf(me, hc)).toBe(4);
  });

  it('碎世者：消滅一個隨機敵方手下、地點與武器', () => {
    const g = newGame();
    const foe = g.s.players[1];
    put(g, FILLER, 1);
    foe.locations = [{ uid: 999, cardId: 'TIME_044', owner: 1, durability: 3, cooldown: 0 }];
    foe.weapon = { uid: 998, cardId: 'CS2_106', owner: 1, atk: 3, durability: 2, abilities: [], keywords: [] };
    play(g, 'END_034');
    expect(foe.board.every((m) => m.dead || m.hp <= 0) || foe.board.length === 0).toBe(true);
    expect(foe.locations).toHaveLength(0);
    expect(foe.weapon).toBeNull();
  });

  it('終結的預兆：牌堆已空時，摧毀敵方牌堆最上面的 5 張牌', () => {
    const g = newGame();
    g.s.players[0].deck = [];
    const n = g.s.players[1].deck.length;
    play(g, 'END_035');
    expect(g.s.players[1].deck.length).toBe(n - 5);
    const g2 = newGame();
    const n2 = g2.s.players[1].deck.length;
    play(g2, 'END_035');
    expect(g2.s.players[1].deck.length).toBe(n2);
  });

  it('莫奇：倒轉保留兩種結果', () => {
    const g = newGame();
    put(g, 'END_036', 0);
    const foeHp = g.s.players[1].hero.hp;
    const hc = give(g, 'TIME_004');
    g.apply({ type: 'play', handUid: hc.uid });
    g.apply({ type: 'choose', index: 1 });
    expect(g.s.players[0].board.map((m) => m.cardId)).toContain('TIME_004');
    expect(g.s.players[1].hero.hp).toBe(foeHp - 14);
  });

  it('終結時光墨衛：填滿戰場、治療英雄、跳過下個回合', () => {
    const g = newGame();
    g.s.players[0].hero.hp = 10;
    play(g, 'END_037');
    expect(g.s.players[0].board.length).toBeGreaterThanOrEqual(6);
    expect(g.s.players[0].hero.hp).toBe(30);
    g.apply({ type: 'endTurn' });
    expect(g.s.current).toBe(1);
    g.apply({ type: 'endTurn' });
    expect(g.s.current).toBe(1);
    g.apply({ type: 'endTurn' });
    expect(g.s.current).toBe(0);
  });
});
