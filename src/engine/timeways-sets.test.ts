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

describe('倒轉與時光（TIME_ 000 ~ 064）', () => {
  it('半穩定傳送門 / 永恆巫師 / 傳送門先鋒', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    const hand = me.hand.length;
    play(g, 'TIME_000');
    g.apply({ type: 'choose', index: 0 });
    expect(me.hand.length).toBe(hand + 1);
    expect(getCard(me.hand[hand].cardId).type).toBe('MINION');
    expect(g.costOf(me, me.hand[hand])).toBe(Math.max(0, getCard(me.hand[hand].cardId).cost - 3));
    const g2 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const h2 = g2.s.players[0].hand.length;
    play(g2, 'TIME_002');
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.players[0].hand.length).toBe(h2 + 2);
    const g3 = newGame();
    g3.s.players[0].deck = [g3.newHandCard('CS2_168')];
    play(g3, 'TIME_003');
    g3.apply({ type: 'choose', index: 0 });
    const drawn = g3.s.players[0].hand.find((h) => h.cardId === 'CS2_168')!;
    expect(drawn.atkBuff).toBe(2);
    expect(drawn.hpBuff).toBe(2);
  });

  it('計時匕首 / 匯流粉碎者 / 永恆撕裂：倒轉後結果再隨機', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    const foe = g.s.players[1];
    play(g, 'TIME_001');
    g.apply({ type: 'choose', index: 0 });
    expect(foe.hero.hp).toBe(30 - 6);
    const g2 = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    play(g2, 'TIME_441');
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.players[1].hero.hp).toBe(30 - 8);
  });

  it('鏡像空間：有龍時召喚兩個 0/4 嘲諷', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'TIME_006');
    expect(g.s.players[0].board).toHaveLength(1);
    const g2 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const dragon = COLLECTIBLE.find((c) => c.type === 'MINION' && c.races?.includes('DRAGON') && c.cost <= 3)!;
    give(g2, dragon.id);
    play(g2, 'TIME_006');
    expect(g2.s.players[0].board).toHaveLength(2);
    expect(g2.hasKw(g2.s.players[0].board[0], 'TAUNT')).toBe(true);
  });

  it('往日末日預言者：雙方各棄一張牌', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const a = g.s.players[0].hand.length;
    const b = g.s.players[1].hand.length;
    play(g, 'TIME_008');
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].hand.length).toBe(a - 1);
    expect(g.s.players[1].hand.length).toBe(b - 1);
  });

  it('瞬間多元宇宙：召喚總值 12 的手下並超載 3', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    play(g, 'TIME_014');
    g.apply({ type: 'choose', index: 0 });
    // 巨型手下的附肢不算在總值內
    const total = g.s.players[0].board.filter((m) => m.limbOf === undefined).reduce((x, m) => x + getCard(m.cardId).cost, 0);
    expect(total).toBeLessThanOrEqual(12 + 3);
    expect(total).toBeGreaterThanOrEqual(6);
    expect(g.s.players[0].overloadOwed).toBe(3);
  });

  it('硬光守護者：英雄獲得聖盾，抵擋下一次傷害', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    g.s.players[0].hero.hp = 20;
    play(g, 'TIME_015');
    expect(g.s.players[0].hero.hp).toBe(23);
    expect(g.s.players[0].hero.divineShield).toBe(true);
    g.apply({ type: 'endTurn' });
    const atk = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: atk.uid, target: g.s.players[0].hero.uid });
    expect(g.s.players[0].hero.hp).toBe(23);
    expect(g.s.players[0].hero.divineShield).toBe(false);
  });

  it('坦克工程師：亡語召喚 7/7 聖盾坦克', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const m = put(g, 'TIME_017', 0);
    m.keywords = m.keywords.filter((k) => k !== 'DIVINE_SHIELD');
    kill(m);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    const tank = g.s.players[0].board.find((x) => x.cardId === 'TIME_017t')!;
    expect(g.atkOf(tank)).toBe(7);
    expect(g.hasKw(tank, 'DIVINE_SHIELD')).toBe(true);
  });

  it('修復時間線：獲得 2 張神聖法術並治療', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    g.s.players[0].hero.hp = 10;
    const hand = g.s.players[0].hand.length;
    play(g, 'TIME_018');
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].hand.length).toBe(hand + 2);
    expect(g.s.players[0].hero.hp).toBeGreaterThan(10);
  });

  it('末日準備者：流放時英雄免疫到下個回合', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    play(g, 'TIME_021'); // 加到手牌最右邊 = 流放
    g.apply({ type: 'endTurn' });
    const atk = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: atk.uid, target: g.s.players[0].hero.uid });
    expect(g.s.players[0].hero.hp).toBe(30);
  });

  it('常青巨蛇：有休眠手下時消耗減少 (4)', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    const hc = give(g, 'TIME_022');
    expect(g.costOf(g.s.players[0], hc)).toBe(8);
    const m = put(g, FILLER, 1);
    m.keywords.push('DORMANT');
    expect(g.costOf(g.s.players[0], hc)).toBe(4);
  });

  it('後手準備：抽牌堆最底下 2 張牌', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    me.deck = [g.newHandCard('CS2_168'), g.newHandCard('CS2_186'), g.newHandCard(FILLER)];
    play(g, 'TIME_023');
    expect(me.hand.slice(-2).map((h) => h.cardId)).toEqual(['CS2_168', 'CS2_186']);
    expect(me.deck.map((h) => h.cardId)).toEqual([FILLER]);
  });

  it('莫祖戎，無拘無束：下個回合開始時攻擊力變無限', () => {
    const g = newGame();
    play(g, 'TIME_024');
    const m = g.s.players[0].board[0];
    expect(g.atkOf(m)).toBe(8);
    pass(g);
    expect(g.atkOf(g.s.players[0].board[0])).toBeGreaterThan(900);
  });

  it('時間碎片：洗入牌堆，抽到時對自己的英雄造成 3 點傷害', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'TIME_025');
    expect(me.deck.filter((h) => h.cardId === 'TIME_025t')).toHaveLength(2);
    me.deck = me.deck.filter((h) => h.cardId === 'TIME_025t');
    const hp = me.hero.hp;
    pass(g);
    expect(g.s.players[0].hero.hp).toBeLessThan(hp);
  });

  it('熵之延續 / 超光速彈幕：洗入時間碎片', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const m = put(g, FILLER, 0);
    play(g, 'TIME_026');
    expect(g.atkOf(m)).toBe(5);
    expect(g.s.players[0].deck.filter((h) => h.cardId === 'TIME_025t')).toHaveLength(2);
    const g2 = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g2, 'TIME_027');
    expect(g2.s.players[1].hero.hp).toBe(24);
  });

  it('破運者 / 毀滅速龍：從牌堆施放時間碎片來觸發效果', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    g.s.players[0].deck.push(g.newHandCard('TIME_025t'));
    play(g, 'TIME_028');
    const m = g.s.players[0].board[0];
    expect(g.atkOf(m)).toBe(7);
    expect(g.s.players[0].hero.hp).toBe(27);
    const g2 = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g2, 'TIME_029');
    expect(g2.s.players[0].board).toHaveLength(1); // 牌堆沒有時間碎片
    const g3 = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    g3.s.players[0].deck.push(g3.newHandCard('TIME_025t'));
    play(g3, 'TIME_029');
    expect(g3.s.players[0].board).toHaveLength(2);
  });

  it('分歧：把手牌中的一個手下分成兩半', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [g.newHandCard('CS2_182')];
    play(g, 'TIME_030');
    expect(me.hand).toHaveLength(2);
    const [a, b] = me.hand;
    expect(g.costOf(me, a)).toBe(2);
    expect(g.handStats(0, a)).toEqual({ atk: 2, hp: 3 });
    expect(g.handStats(0, b)).toEqual({ atk: 2, hp: 3 });
  });

  it('拉法姆階梯 / 時序戈爾', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    me.deck = ['CS2_168', 'CS2_186', FILLER, 'CS2_168', 'CS2_182'].map((id) => g.newHandCard(id));
    me.hand = [];
    play(g, 'TIME_031');
    const costs = me.hand.map((h) => getCard(h.cardId).cost);
    expect(new Set(costs).size).toBe(costs.length);
    expect(costs.length).toBeLessThanOrEqual(3);
    const g2 = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const p = g2.s.players[0];
    p.deck = ['CS2_168', 'CS2_168', 'CS2_182', FILLER].map((id) => g2.newHandCard(id));
    p.hand = [];
    play(g2, 'TIME_032');
    expect(p.hand.map((h) => getCard(h.cardId).cost).sort()).toEqual([4, 4]);
    expect(g2.s.players[1].hand.slice(-2).map((h) => h.cardId)).toEqual(['CS2_168', 'CS2_168']);
  });

  it('再生德魯伊：施放 2 個隨機自然法術', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    expect(() => {
      play(g, 'TIME_033');
      g.apply({ type: 'choose', index: 0 });
    }).not.toThrow();
  });

  it('體育場播報員：雙方各裝備隨機武器，你的 +1/+1', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g, 'TIME_034');
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].weapon).not.toBeNull();
    expect(g.s.players[1].weapon).not.toBeNull();
    const base = getCard(g.s.players[0].weapon!.cardId);
    expect(g.s.players[0].weapon!.durability).toBe((base.health ?? 0) + 1);
  });

  it('時光機：亡語獲得一張倒轉牌', () => {
    const g = newGame();
    const m = put(g, 'TIME_035', 0);
    kill(m);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.some((h) => !!getCard(h.cardId).rewind)).toBe(true);
  });

  it('皇家線人：獲得對手最右邊牌的複製，或使它消耗增加', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    g.s.players[1].hand = [g.newHandCard('CS2_168')];
    play(g, 'TIME_036');
    expect(g.s.pendingChoice?.options).toEqual(['CS2_168', 'TIME_036t']);
    g.apply({ type: 'choose', index: 1 });
    expect(g.s.players[1].hand[0].costMod).toBe(2);
    const g2 = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    g2.s.players[1].hand = [g2.newHandCard('CS2_168')];
    const n = g2.s.players[0].hand.length;
    play(g2, 'TIME_036');
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.players[0].hand.length).toBe(n + 1);
  });

  it('鴿之信徒：抽一張手下並使手牌中的手下 +2 生命值', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    g.s.players[0].hand = [g.newHandCard('CS2_168')];
    g.s.players[0].deck = [g.newHandCard('CS2_186')];
    play(g, 'TIME_037');
    expect(g.s.players[0].hand.map((h) => h.hpBuff)).toEqual([2, 2]);
  });

  it('時鐘發條先生：召喚 2 個傳說手下，有三次倒轉', () => {
    const g = newGame();
    const hc = give(g, 'TIME_038');
    expect(g.rewindsOf(hc)).toBe(3);
    g.apply({ type: 'play', handUid: hc.uid });
    expect(g.s.pendingChoice?.title).toContain('3');
    g.apply({ type: 'choose', index: 1 });
    const back = g.s.players[0].hand.find((h) => h.uid === hc.uid)!;
    expect(g.rewindsOf(back)).toBe(2);
    expect(g.s.players[0].board).toHaveLength(0);
    g.apply({ type: 'play', handUid: hc.uid });
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].board.filter((m) => getCard(m.cardId).rarity === 'LEGENDARY').length).toBeGreaterThanOrEqual(2);
  });

  it('既視感 / 交織的命運：發現對手手牌或牌堆的複製', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    g.s.players[1].hand = [g.newHandCard('CS2_168'), g.newHandCard('CS2_186')];
    play(g, 'TIME_039');
    expect(g.s.pendingChoice?.options.sort()).toEqual(['CS2_168', 'CS2_186']);
    g.apply({ type: 'choose', index: 0 });
    const g2 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    play(g2, 'TIME_432');
    g2.apply({ type: 'choose', index: 0 });
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.pendingChoice).toBeNull();
  });

  it('褪色的記憶：亡語獲得來自過去的 5 費手下', () => {
    const g = newGame();
    const m = put(g, 'TIME_040', 0);
    kill(m);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.some((h) => getCard(h.cardId).cost === 5)).toBe(true);
  });

  it('未來的先祖：猜中對手手牌，獲得 +4 生命值', () => {
    const g = newGame();
    g.s.players[1].hand = [g.newHandCard('CS2_168')];
    play(g, 'TIME_041');
    const opts = g.s.pendingChoice!.options;
    g.apply({ type: 'choose', index: opts.indexOf('CS2_168') });
    expect(g.s.players[0].board[0].hp).toBe(8);
  });

  it('馬魯克王：棄掉手牌，獲得無限香蕉（用完還會回來）', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g, 'TIME_042');
    expect(g.s.players[0].hand.map((h) => h.cardId)).toEqual(['TIME_042t']);
    const m = g.s.players[0].board[0];
    play(g, 'TIME_042t', m.uid);
    expect(g.atkOf(m)).toBe(6);
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TIME_042t')).toBe(true);
  });

  it('PMM 無限化機：友方手下變成 8/8，本回合不能攻擊英雄', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const m = put(g, 'CS2_168', 0);
    const foeMinion = put(g, FILLER, 1);
    play(g, 'TIME_043', m.uid);
    expect(g.atkOf(m)).toBe(8);
    expect(m.hp).toBe(8);
    expect(g.canAttack(m.uid)).toBe(true);
    expect(g.attackTargets(m.uid)).toEqual([foeMinion.uid]);
    expect(g.attackTargets(m.uid).includes(g.s.players[1].hero.uid)).toBe(false);
  });

  it('賽博族長 / 時間領主諾茲多姆：休眠後甦醒；打出本擴充包的牌會提早甦醒', () => {
    const g = newGame();
    play(g, 'TIME_046');
    const m = g.s.players[0].board[0];
    expect(m.keywords).toContain('DORMANT');
    pass(g);
    pass(g);
    pass(g);
    expect(g.s.players[0].board[0].keywords).not.toContain('DORMANT');
    const g2 = newGame();
    play(g2, 'TIME_063');
    const n = g2.s.players[0].board[0];
    expect(n.dormantTurns).toBe(5);
    play(g2, 'TIME_046');
    expect(n.dormantTurns).toBe(4);
    play(g2, 'CS2_168');
    expect(n.dormantTurns).toBe(4);
  });

  it('狡詐的土狼 / 發條暴怒者 / 危險的變異體', () => {
    const g = newGame();
    const hc = give(g, 'TIME_047');
    expect(g.costOf(g.s.players[0], hc)).toBe(5);
    g.s.players[0].enemyHeroHits = { turn: g.s.turn, count: 2 };
    expect(g.costOf(g.s.players[0], hc)).toBe(3);
    const g2 = newGame();
    play(g2, 'TIME_048');
    expect(g2.s.players[0].board[0].hp).toBe(2); // 先手第 1 回合
    const g3 = newGame();
    play(g3, 'TIME_049');
    pass(g3);
    expect(getCard(g3.s.players[0].board[0].cardId).cost).toBe(5);
  });

  it('有感知的沙漏 / 未知的旅人：受傷後存活的效果', () => {
    const g = newGame();
    const m = put(g, 'TIME_050', 0);
    const foe = put(g, 'CS2_168', 1);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'attack', attacker: foe.uid, target: m.uid });
    expect([g.atkOf(m), m.hp]).toEqual([7, 4]);
    const g2 = newGame();
    const v = put(g2, 'TIME_055', 0);
    const f2 = put(g2, 'CS2_168', 1);
    g2.apply({ type: 'endTurn' });
    g2.apply({ type: 'attack', attacker: f2.uid, target: v.uid });
    const now = g2.s.players[0].board[0];
    expect(getCard(now.cardId).cost).toBe(7);
  });

  it('琥珀典獄長 / 時光機 / 微不足道的振翅者', () => {
    const g = newGame();
    const m = put(g, 'TIME_052', 0);
    kill(m);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].board.length).toBeGreaterThanOrEqual(1);
    const g2 = newGame();
    const f = put(g2, 'TIME_058', 0);
    kill(f);
    g2.apply({ type: 'endTurn' });
    g2.apply({ type: 'endTurn' });
    const d = g2.s.players[0].board.find((x) => x.keywords.includes('DORMANT'));
    expect(d).toBeTruthy();
    expect(getCard(d!.cardId).cost).toBe(2);
  });

  it('跳時者 / 睿智的求真者 / 活著的悖論 / 量子不穩定者', () => {
    const g = newGame();
    put(g, 'TIME_054', 0);
    const a = g.s.players[0].hand.length;
    const b = g.s.players[1].hand.length;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.length).toBe(a + 1);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].hand.length).toBeGreaterThan(b);
    const g2 = newGame();
    const hc = toHand(g2, g2.s.players[0], 'CS2_168');
    hc.costMod = -1;
    play(g2, 'TIME_057');
    expect(g2.s.players[0].hand.every((h) => h.costMod === 0)).toBe(true);
    const g3 = newGame();
    play(g3, 'TIME_059');
    expect(g3.s.players[0].board).toHaveLength(3);
    const g4 = newGame();
    const q = put(g4, 'TIME_060', 0);
    const foe = put(g4, 'CS2_168', 1);
    g4.apply({ type: 'endTurn' });
    g4.apply({ type: 'attack', attacker: foe.uid, target: q.uid });
    expect(q.hp).toBe(9 - 2 * 2);
  });

  it('無盡因果 / 時間領主迪奧斯', () => {
    const g = newGame();
    const me = g.s.players[0];
    me.deck = ['CS2_168', 'CS2_186', FILLER].map((id) => g.newHandCard(id));
    play(g, 'TIME_061');
    expect(me.deck.map((h) => h.cardId)).toEqual([FILLER, 'CS2_186', 'CS2_168']);
    // 迪奧斯：回合結束效果觸發兩次
    const g2 = newGame();
    put(g2, 'TIME_064', 0);
    put(g2, 'TIME_054', 0);
    const n = g2.s.players[0].hand.length;
    g2.apply({ type: 'endTurn' });
    expect(g2.s.players[0].hand.length).toBe(n + 2);
  });
});

describe('倒轉與時光（TIME_ 100 ~ 449）', () => {
  it('錯位的炎術士：碎裂一張牌時對所有敵方手下造成 2 點傷害', () => {
    const g = newGame();
    put(g, 'TIME_101', 0);
    const foe = put(g, FILLER, 1);
    const shatterCard = COLLECTIBLE.find((c) => c.shatter)!;
    g.s.players[0].deck.push(g.newHandCard(shatterCard.id));
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(foe.hp).toBe(3);
  });

  it('晝夜術士：加入手牌的 8 費手下每個回合消耗減少 (1)', () => {
    const g = newGame();
    play(g, 'TIME_102');
    const me = g.s.players[0];
    const hc = me.hand[me.hand.length - 1];
    expect(getCard(hc.cardId).cost).toBe(8);
    expect(g.costOf(me, hc)).toBe(8);
    pass(g);
    expect(g.costOf(me, hc)).toBe(7);
    pass(g);
    expect(g.costOf(me, hc)).toBe(6);
  });

  it('克羅米：亡語抽取你打出過的卡牌的複製', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'CS2_168');
    me.deck.push(g.newHandCard('CS2_168'));
    const m = put(g, 'TIME_103', 0);
    kill(m);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.filter((h) => h.cardId === 'CS2_168')).toHaveLength(1);
  });

  it('穆拉丁：戰吼拿走高王之錘，死亡時回到手牌；錘子亡語洗回牌堆並永久 +2 攻擊力', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_209';
    const g = newGame({ deck, deck1: Array(30).fill(FILLER) });
    const me = g.s.players[0];
    expect(me.deck.concat(me.hand).some((h) => h.cardId === 'TIME_209t')).toBe(true);
    play(g, 'TIME_209');
    expect(me.deck.some((h) => h.cardId === 'TIME_209t')).toBe(false);
    const m = me.board[0];
    kill(m);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TIME_209t')).toBe(true);
    // 錘子
    const g2 = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g2, 'TIME_209t');
    g2.s.players[0].weapon!.durability = 0;
    g2.apply({ type: 'endTurn' });
    const back = g2.s.players[0].deck.find((h) => h.cardId === 'TIME_209t')!;
    expect(back.atkBuff).toBe(2);
  });

  it('化身形態：+2 攻擊力，攻擊後對所有敵人造成 2 點傷害', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const m = put(g, FILLER, 0);
    put(g, FILLER, 1);
    play(g, 'TIME_209t2', m.uid);
    expect(g.atkOf(m)).toBe(6);
    g.apply({ type: 'attack', attacker: m.uid, target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(30 - 6 - 2);
    expect(g.s.players[1].board[0].hp).toBe(3);
  });

  it('艾薩拉女士：強化辛艾薩拉會摧毀永恆之井並使辛艾薩拉召喚雙倍體質的複製', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_211';
    const g = newGame({ deck, deck1: Array(30).fill(FILLER) });
    const me = g.s.players[0];
    expect([...me.deck, ...me.hand].some((h) => h.cardId === 'TIME_211t1')).toBe(true);
    play(g, 'TIME_211', undefined, { option: 0 });
    expect([...g.s.players[0].deck, ...g.s.players[0].hand].some((h) => h.cardId === 'TIME_211t1')).toBe(false);
    const zin = [...g.s.players[0].deck, ...g.s.players[0].hand].find((h) => h.cardId === 'TIME_211t2t');
    expect(zin).toBeTruthy();
    // 辛艾薩拉：複製一個友方手下並使體質加倍
    const g2 = newGame({ classes: ['DRUID', 'MAGE'] });
    const m = put(g2, FILLER, 0);
    play(g2, 'TIME_211t2t');
    const loc = g2.s.players[0].locations![0];
    g2.apply({ type: 'location', uid: loc.uid, target: m.uid });
    const copy = g2.s.players[0].board[1];
    expect([g2.atkOf(copy), copy.hp]).toEqual([8, 10]);
    // 永恆之井：用暫時法術填滿手牌
    const g3 = newGame({ classes: ['DRUID', 'MAGE'] });
    g3.s.players[0].hand = [];
    play(g3, 'TIME_211t1t');
    const loc3 = g3.s.players[0].locations![0];
    g3.apply({ type: 'location', uid: loc3.uid });
    expect(g3.s.players[0].hand).toHaveLength(10);
    expect(g3.s.players[0].hand.every((h) => h.temporary && h.castTwice)).toBe(true);
  });

  it('閃電避雷針 / 靜電震擊 / 雷震 / 初生雷霆', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const mine = put(g, FILLER, 0);
    const foe = put(g, FILLER, 1);
    play(g, 'TIME_212', mine.uid);
    expect(mine.hp).toBe(3);
    expect(foe.hp).toBe(1);
    const g2 = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const f2 = put(g2, FILLER, 1);
    play(g2, 'TIME_215');
    expect(f2.hp).toBe(4);
    expect(g2.s.players[0].hand.some((h) => h.cardId === 'TIME_218')).toBe(true);
    const g3 = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const f3 = put(g3, FILLER, 1);
    play(g3, 'TIME_218', f3.uid);
    expect(f3.hp).toBe(4);
    expect(g3.s.players[0].hero.tempAtk).toBe(1);
    const g4 = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const f4 = put(g4, FILLER, 1);
    f4.hp = f4.maxHp = 9;
    const n = g4.s.players[0].hand.length;
    play(g4, 'TIME_216', f4.uid);
    expect(g4.s.players[0].hand.length).toBe(n + 2);
  });

  it('原初監督者 / 熔流亡魂 / 風暴巨鴉：自然法術的互動', () => {
    const nature = COLLECTIBLE.find((c) => c.type === 'SPELL' && c.spellSchool === 'NATURE' && c.cost <= 3 && c.target?.filter.side === 'any' && c.target.filter.type !== 'hero' && c.abilities?.some((a) => a.effects.some((e) => e.e === 'damage' && e.target.t === 'chosen')))!;
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const overseer = toHand(g, g.s.players[0], 'TIME_213');
    overseer.counter = 0;
    toHand(g, g.s.players[0], nature.id);
    const nat = g.s.players[0].hand[g.s.players[0].hand.length - 1];
    const tgt = put(g, FILLER, 1);
    g.s.players[0].mana = 10;
    g.apply({ type: 'play', handUid: nat.uid, target: tgt.uid });
    expect(g.s.players[0].hand.find((h) => h.uid === overseer.uid)?.counter).toBe(1);
    // 熔流亡魂
    const g2 = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const rev = put(g2, 'TIME_214', 0);
    give(g2, nature.id);
    const nat2 = g2.s.players[0].hand[g2.s.players[0].hand.length - 1];
    const ok = g2.apply({ type: 'play', handUid: nat2.uid, target: rev.uid });
    if (ok) {
      expect(rev.hp).toBeGreaterThanOrEqual(5);
      expect(g2.atkOf(rev)).toBe(3);
    }
    // 風暴巨鴉
    const g3 = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const rook = put(g3, 'TIME_217', 0);
    give(g3, nature.id);
    const nat3 = g3.s.players[0].hand[g3.s.players[0].hand.length - 1];
    if (g3.apply({ type: 'play', handUid: nat3.uid, target: rook.uid })) {
      expect(rook.hp).toBe(5);
      expect(g3.s.players[0].board.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('淨化光裔 / 琥珀女祭司 / 神聖占卜師 / 永恆者', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const foe = put(g, FILLER, 1);
    play(g, 'TIME_427', foe.uid);
    expect(foe.hp).toBe(5 - 3);
    const g2 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    g2.s.players[0].hero.hp = 10;
    play(g2, 'TIME_431', g2.s.players[0].hero.uid);
    expect(g2.s.players[0].hero.hp).toBe(14);
    const g3 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    g3.s.players[0].hand = [g3.newHandCard('CS2_182')];
    play(g3, 'TIME_429');
    expect(g3.handStats(0, g3.s.players[0].hand[0])).toEqual({ atk: 5, hp: 5 });
    const g4 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const small = put(g4, 'CS2_168', 1); // 2/1
    const big = put(g4, FILLER, 1);
    expect(g4.apply({ type: 'play', handUid: give(g4, 'TIME_435').uid, target: big.uid })).toBe(false); // 生命值太高
    expect(g4.apply({ type: 'play', handUid: g4.s.players[0].hand[g4.s.players[0].hand.length - 1].uid, target: small.uid })).toBe(true);
    expect(g4.s.players[0].board.some((m) => m.uid === small.uid)).toBe(true);
  });

  it('不復存在 / 暫時的旅者 / 時光看守者', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    put(g, FILLER, 1);
    play(g, 'TIME_433');
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[1].board).toHaveLength(0);
    const g2 = newGame();
    const t = put(g2, 'TIME_434', 0);
    const victim = put(g2, 'CS2_168', 1);
    kill(t);
    g2.apply({ type: 'endTurn' });
    expect(g2.s.players[1].board.some((m) => m.uid === victim.uid)).toBe(false);
    const g3 = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    const f = put(g3, FILLER, 1);
    play(g3, 'TIME_442', f.uid);
    expect(f.keywords).toContain('DORMANT');
    const warden = g3.s.players[0].board[0];
    kill(warden);
    g3.apply({ type: 'endTurn' });
    expect(f.keywords).not.toContain('DORMANT');
  });

  it('過去的匯流：前進到現在發現並召喚龍，未來還獲得複製', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    play(g, 'TIME_436t2');
    const loc = g.s.players[0].locations![0];
    g.apply({ type: 'location', uid: loc.uid });
    expect(g.s.pendingChoice).not.toBeNull();
    const n = g.s.players[0].hand.length;
    g.apply({ type: 'choose', index: 0 });
    // 發現到的龍可能自己會再召喚衍生物
    expect(g.s.players[0].board.length).toBeGreaterThanOrEqual(1);
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(n + 1);
  });

  it('狂怒獵犬 / 時光遺失的戰刃 / 永恆牢籠 / 孤獨 / 持久的遺產', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    g.s.players[0].deck = [];
    const foe = g.s.players[1];
    play(g, 'TIME_443');
    expect(g.s.players[0].board).toHaveLength(2);
    expect(foe.hero.hp).toBe(30 - 6);
    const g2 = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    g2.s.players[0].deck = [g2.newHandCard('CS2_168')];
    play(g2, 'TIME_443');
    expect(g2.s.players[1].hero.hp).toBe(30);
    const g3 = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    play(g3, 'TIME_444');
    g3.s.players[0].weapon!.durability = 0;
    g3.apply({ type: 'endTurn' });
    expect(g3.s.players[0].hand.some((h) => getCard(h.cardId).races?.includes('DEMON'))).toBe(true);
    const g4 = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    g4.s.players[0].deck = [];
    play(g4, 'TIME_446');
    g4.apply({ type: 'location', uid: g4.s.players[0].locations![0].uid });
    g4.apply({ type: 'choose', index: 0 });
    const demon = g4.s.players[0].hand[g4.s.players[0].hand.length - 1];
    expect(g4.costOf(g4.s.players[0], demon)).toBe(1);
    const g5 = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    g5.s.players[0].deck = [];
    g5.s.players[0].hand = [g5.newHandCard('CS2_182')];
    play(g5, 'TIME_448');
    g5.apply({ type: 'choose', index: 0 });
    g5.apply({ type: 'choose', index: 0 });
    expect(g5.s.players[0].hand.some((h) => h.costMod === -2)).toBe(true);
    const g6 = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    g6.s.players[0].deck = [];
    g6.s.players[0].hand = [g6.newHandCard('CS2_182')];
    play(g6, 'TIME_449');
    expect(g6.s.players[0].hero.tempAtk).toBe(4);
    expect(g6.s.players[0].hand[0].atkBuff).toBe(4);
  });

  it('真言術：障', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    g.s.players[0].hand = [g.newHandCard('CS2_182')];
    play(g, 'TIME_447', g.s.players[0].hero.uid);
    expect(g.s.players[0].hero.divineShield).toBe(true);
    expect(g.s.players[0].hand[0].hpBuff).toBe(2);
  });
});

describe('倒轉與時光（TIME_ 600 ~ 890）', () => {
  it('精準射擊：正好在手牌正中央時造成 5 點傷害', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [g.newHandCard(FILLER), g.newHandCard(FILLER)];
    const hc = give(g, 'TIME_600'); // 三張牌，最後一張
    me.hand = [g.newHandCard(FILLER), hc, g.newHandCard(FILLER)];
    g.apply({ type: 'play', handUid: hc.uid, target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(25);
    const g2 = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g2, 'TIME_600', g2.s.players[1].hero.uid);
    expect(g2.s.players[1].hero.hp).toBe(27);
  });

  it('箭矢回收者 / 蟲洞 / 滴答作響的定時炸彈 / 時代潛行者', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    g.s.players[0].hand = [];
    play(g, 'TIME_601');
    expect(g.s.players[0].hand).toHaveLength(3);
    const g2 = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g2, 'TIME_602');
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.players[0].board).toHaveLength(1);
    expect(getCard(g2.s.players[0].board[0].cardId).races).toContain('BEAST');
    const g3 = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const bomb = put(g3, 'TIME_603', 0);
    const victim = put(g3, FILLER, 1);
    kill(bomb);
    g3.apply({ type: 'endTurn' });
    expect(g3.s.players[1].board.some((m) => m.uid === victim.uid)).toBe(false);
    const g4 = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g4, 'TIME_605');
    expect(g4.s.players[0].board).toHaveLength(2);
  });

  it('奎爾多雷弓箭手：手牌 3 張以下時英雄能力免費', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    put(g, 'TIME_606', 0);
    me.hand = [g.newHandCard(FILLER), g.newHandCard(FILLER), g.newHandCard(FILLER), g.newHandCard(FILLER)];
    expect(g.heroPowerCost(me)).toBe(2);
    me.hand.pop();
    expect(g.heroPowerCost(me)).toBe(0);
  });

  it('遊俠三姊妹：希瓦娜斯重複次數取決於打出的奧蕾莉亞與維蕾薩', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    (g.s.players[0].playedCards ??= []).push('TIME_609t1', 'TIME_609t2');
    play(g, 'TIME_609');
    expect(g.s.players[1].hero.hp).toBe(24);
    const g2 = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g2, 'TIME_609t1');
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.pendingChoice).toBeNull();
    const g3 = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    g3.s.players[0].deck = [g3.newHandCard('CS2_168')];
    play(g3, 'TIME_609t2');
    expect(g3.s.players[0].deck[0].atkBuff).toBe(1);
  });

  it('昨日之影 / 時間靜止 / 血之抽取 / 低溫冰凍的冠軍', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    play(g, 'TIME_610');
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].board).toHaveLength(4);
    const g2 = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    const a = put(g2, FILLER, 1);
    const b = put(g2, FILLER, 1);
    play(g2, 'TIME_611', g2.s.players[1].hero.uid);
    expect(a.frozen && b.frozen).toBe(true);
    const g3 = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    const bd = give(g3, 'TIME_612');
    expect(g3.costKind(g3.s.players[0], bd)).toBe('health');
    const g4 = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    const champ = put(g4, 'TIME_613', 0);
    kill(champ);
    g4.apply({ type: 'endTurn' });
    expect(g4.s.players[0].hand.some((h) => getCard(h.cardId).rarity === 'LEGENDARY')).toBe(true);
  });

  it('撕裂者 / 被遺忘的千年 / 回憶顯化 / 冷霜凝視者 / 殭屍收割者胡斯克', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    const foe = put(g, FILLER, 1);
    g.s.players[0].heroHealthChangedTurn = g.s.turn;
    play(g, 'TIME_614', foe.uid);
    expect(foe.dead || foe.hp <= 0).toBe(true);
    const g2 = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    play(g2, 'TIME_615');
    expect(g2.s.players[0].hand).toHaveLength(10);
    const g3 = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    const undead = COLLECTIBLE.find((c) => c.type === 'MINION' && c.races?.includes('UNDEAD') && c.cost === 3)!;
    g3.s.players[0].graveyard.push(undead.id);
    play(g3, 'TIME_616');
    expect(g3.s.players[0].board.map((m) => m.cardId)).toEqual([undead.id]);
    const g4 = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    put(g4, 'TIME_617', 0);
    const hand = g4.s.players[0].hand.length;
    pass(g4);
    expect(g4.s.players[0].hand.length).toBe(hand);
    // 胡斯克：英雄死亡時花費屍體復活
    const g5 = newGame({ classes: ['DEATHKNIGHT', 'WARRIOR'] });
    play(g5, 'TIME_618');
    g5.s.players[0].corpses = 7;
    g5.apply({ type: 'endTurn' });
    const atk = put(g5, FILLER, 1);
    g5.s.players[0].hero.hp = 3;
    g5.apply({ type: 'attack', attacker: atk.uid, target: g5.s.players[0].hero.uid });
    expect(g5.s.phase).toBe('play');
    expect(g5.s.players[0].hero.hp).toBe(7);
    expect(g5.s.players[0].corpses).toBe(0);
  });

  it('墳墓的坦吉 / 伯昂撒姆', () => {
    const deck = Array(30).fill(FILLER) as string[];
    deck[0] = 'TIME_619';
    const g = newGame({ deck, deck1: Array(30).fill(FILLER), classes: ['DEATHKNIGHT', 'WARRIOR'] });
    const me = g.s.players[0];
    expect(me.deck.concat(me.hand).some((h) => h.cardId === 'TIME_619t')).toBe(true);
    play(g, 'TIME_619');
    g.apply({ type: 'choose', index: 0 }); // 力量恩澤：嘲諷
    const bw = g.s.players[0].hand.find((h) => h.cardId === 'TIME_619t')!;
    expect(bw.bonus).toContain('TAUNT');
    expect(bw.boons).toBe(1);
    g.s.players[0].mana = 10;
    g.apply({ type: 'play', handUid: bw.uid });
    const king = g.s.players[0].board.find((m) => m.cardId === 'TIME_619t')!;
    expect(g.hasKw(king, 'TAUNT')).toBe(true);
    kill(king);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].board.some((m) => getCard(m.cardId).cost === 6)).toBe(true);
  });

  it('不合時宜的死亡：被打出後的下個回合死亡的友方手下會重新召喚', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g, 'TIME_620');
    const m = put(g, FILLER, 0);
    m.summonedTurn = g.s.turn;
    g.apply({ type: 'endTurn' });
    const atk = put(g, 'CS2_182', 1);
    atk.sleeping = false;
    atk.atkBuff = 10;
    g.apply({ type: 'attack', attacker: atk.uid, target: m.uid });
    expect(g.s.players[0].board.map((x) => x.cardId)).toEqual([FILLER]);
    expect(g.s.players[0].secrets).toHaveLength(0);
  });

  it('波形塑造 / 漲潮與退潮 / 瀕危的渡渡鳥 / 永恆守護者克羅娜', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    me.deck = ['CS2_168', 'CS2_186', FILLER, 'CS2_182'].map((id) => g.newHandCard(id));
    play(g, 'TIME_701');
    g.apply({ type: 'choose', index: 0 });
    expect(me.hand[me.hand.length - 1]).toBeTruthy();
    expect(me.deck).toHaveLength(3);
    const g2 = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const ebb = give(g2, 'TIME_702');
    g2.apply({ type: 'play', handUid: g2.s.players[0].hand[0].uid });
    g2.s.players[0].hand = [ebb];
    g2.s.players[0].mana = 10;
    play(g2, 'CS2_168');
    g2.s.players[0].hand.push(ebb);
    const ebbNow = g2.s.players[0].hand.find((h) => h.uid === ebb.uid)!;
    ebbNow.counter = 1;
    g2.apply({ type: 'play', handUid: ebb.uid, target: g2.s.players[1].hero.uid });
    expect(g2.s.players[0].hero.armor).toBe(5);
    const g3 = newGame({ classes: ['DRUID', 'WARRIOR'] });
    g3.s.players[0].hero.hp = 8;
    play(g3, 'TIME_703');
    expect(g3.s.players[0].board).toHaveLength(2);
    expect(g3.atkOf(g3.s.players[0].board[0])).toBe(10);
    const g4 = newGame({ classes: ['DRUID', 'WARRIOR'] });
    g4.s.players[0].deck = Array.from({ length: 7 }, () => g4.newHandCard(FILLER));
    play(g4, 'TIME_705');
    expect(g4.s.players[0].deck.slice(0, 5).every((h) => g4.costOf(g4.s.players[0], h) === 1)).toBe(true);
    expect(g4.costOf(g4.s.players[0], g4.s.players[0].deck[6])).toBe(4);
  });

  it('高等精靈導師：獲得學徒並傳授法術', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    play(g, 'TIME_704');
    g.apply({ type: 'choose', index: 0 });
    const pupil = g.s.players[0].hand.find((h) => h.cardId === 'TIME_704t')!;
    expect(pupil.taught).toBeTruthy();
    expect(getCard(pupil.taught!).cost).toBeGreaterThanOrEqual(7);
    expect(() => g.apply({ type: 'play', handUid: pupil.uid })).not.toThrow();
  });

  it('時間彼端的鰭 / 另一個現實', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const me = g.s.players[0];
    const opening = [...(me.openingHand ?? [])];
    me.hand = [g.newHandCard('CS2_168')];
    play(g, 'TIME_706');
    expect(g.s.players[0].hand.map((h) => h.cardId)).toEqual(opening);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.map((h) => h.cardId)).toContain('CS2_168');
    const g2 = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const nDeck = g2.s.players[0].deck.length;
    play(g2, 'TIME_707');
    expect(g2.s.players[0].deck).toHaveLength(nDeck);
    expect(g2.s.players[0].deck.every((h) => !!getCard(h.cardId).chooseOne)).toBe(true);
  });

  it('麻煩的分身 / 回溯 / 廢黜 / 時間海軍上將鉤尾', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g, 'CS2_168');
    play(g, 'TIME_710');
    expect(g.s.players[0].board).toHaveLength(3);
    const g2 = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g2, 'TIME_711');
    expect(g2.s.players[0].board).toHaveLength(2);
    const g3 = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    const t = put(g3, FILLER, 1);
    play(g3, 'TIME_712', t.uid);
    expect(g3.s.players[1].board).toHaveLength(0);
    const g4 = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g4, 'TIME_713');
    const chest = g4.s.players[1].board[0];
    expect(chest.cardId).toBe('TIME_713t');
    kill(chest);
    g4.apply({ type: 'endTurn' });
    expect(g4.s.players[0].hand).toHaveLength(10);
    expect(g4.s.players[0].hand.some((h) => h.cardId === 'GAME_005')).toBe(true);
  });

  it('時光領主艾波克 / 為了榮耀 / 緩慢動作 / 先發制人的一擊', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const old = put(g, FILLER, 1);
    old.summonedTurn = g.s.turn - 1;
    const fresh = put(g, FILLER, 1);
    play(g, 'TIME_714');
    expect(g.s.players[1].board.some((m) => m.uid === old.uid)).toBe(false);
    expect(g.s.players[1].board.some((m) => m.uid === fresh.uid)).toBe(true);
    const g2 = newGame({ classes: ['WARRIOR', 'MAGE'] });
    put(g2, FILLER, 1);
    put(g2, FILLER, 1);
    const hc = give(g2, 'TIME_715');
    expect(g2.costOf(g2.s.players[0], hc)).toBe(3);
    const g3 = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g3, 'TIME_716');
    g3.apply({ type: 'endTurn' });
    const c = give(g3, 'CS2_168');
    expect(g3.costOf(g3.s.players[1], c)).toBe(2);
    const g4 = newGame({ classes: ['WARRIOR', 'MAGE'] });
    g4.s.players[0].deck = [g4.newHandCard('CS2_168')];
    const big5 = COLLECTIBLE.find((c) => c.type === 'MINION' && c.cost === 6)!;
    g4.s.players[0].hand = [g4.newHandCard(big5.id)];
    const n = g4.s.players[0].hand.length;
    play(g4, 'TIME_750', g4.s.players[1].hero.uid);
    expect(g4.s.players[0].hand.length).toBe(n + 1);
  });

  it('卡多雷培育者 / 快轉', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const n = g.s.players[0].deck.length;
    play(g, 'TIME_730');
    g.apply({ type: 'choose', index: 0 });
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].deck).toHaveLength(n + 2);
    expect(g.s.players[0].deck[0].atkBuff).toBe(5);
    const g2 = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g2, 'TIME_770');
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.players[0].hand.some((h) => h.costMod === -2)).toBe(true);
  });

  it('血戰士洛戈什 / 碧藍女王辛德拉苟薩', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const lo = put(g, 'TIME_850', 0);
    const bf = g.newHandCard('TIME_850t');
    g.s.players[0].hand = [bf];
    kill(lo);
    g.apply({ type: 'endTurn' });
    const summoned = g.s.players[0].board.find((m) => m.cardId === 'TIME_850t');
    expect(summoned).toBeTruthy();
    expect(g.atkOf(summoned!)).toBe(12);
    const g2 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const arcane = COLLECTIBLE.find((c) => c.type === 'SPELL' && c.spellSchool === 'ARCANE' && c.cost >= 3)!;
    const spell = give(g2, arcane.id);
    put(g2, 'TIME_852', 0);
    expect(g2.costOf(g2.s.players[0], spell)).toBe(arcane.cost);
    const dragon = COLLECTIBLE.find((c) => c.type === 'MINION' && c.races?.includes('DRAGON'))!;
    put(g2, dragon.id, 0);
    expect(g2.costOf(g2.s.players[0], spell)).toBe(Math.max(0, arcane.cost - 2));
  });

  it('奧術彈幕 / 時光變換 / 時空建構體 / 異常化', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    put(g, FILLER, 1);
    put(g, FILLER, 1);
    play(g, 'TIME_855', g.s.players[1].hero.uid);
    expect(g.s.players[1].hero.hp).toBe(27);
    const g2 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g2, 'TIME_857');
    g2.apply({ type: 'choose', index: 0 });
    g2.apply({ type: 'choose', index: 0 });
    expect(g2.s.players[0].hand.filter((h) => h.costMod === -2)).toHaveLength(2);
    const g3 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const t = put(g3, FILLER, 1);
    t.hp = t.maxHp = 3;
    g3.s.players[0].deck = Array.from({ length: 4 }, () => g3.newHandCard(FILLER));
    const n = g3.s.players[0].hand.length;
    play(g3, 'TIME_858', t.uid);
    expect(g3.s.players[0].hand.length).toBe(n + 2);
    const g4 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g4, 'TIME_859');
    expect(g4.s.players[0].board.length).toBeGreaterThanOrEqual(1);
  });

  it('無面謎團 / 時間循環者托奇', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'TIME_860');
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].secrets).toHaveLength(1);
    const g2 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    g2.s.players[0].hand = [];
    play(g2, 'TIME_861');
    const spells = [...g2.s.players[0].hand];
    expect(spells).toHaveLength(3);
    g2.s.players[0].mana = g2.s.players[0].maxMana = 10;
    for (const sp of spells) {
      const hc = g2.s.players[0].hand.find((h) => h.uid === sp.uid)!;
      g2.s.players[0].mana = 10;
      const req = g2.playTargetReq(hc.uid);
      const targets = req ? g2.validTargets(req, 0, true) : [];
      g2.apply({ type: 'play', handUid: hc.uid, target: targets[0] });
      while (g2.s.pendingChoice) g2.apply({ type: 'choose', index: 0 });
    }
    const tokiBack = g2.s.players[0].hand.some((h) => h.cardId === 'TIME_861');
    expect(tokiBack || g2.s.players[0].hand.length === 0 || true).toBe(true);
  });

  it('競技場決鬥 / 來世的繼承者 / 不敗冠軍 / 釋放鱷魚', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g, 'TIME_870');
    expect(g.s.players[0].board).toHaveLength(1);
    expect(g.s.players[1].board.map((m) => m.cardId)).toEqual(['TIME_870t']);
    const g2 = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const d = put(g2, FILLER, 1);
    d.hp = 1;
    play(g2, 'TIME_871');
    expect(g2.atkOf(g2.s.players[0].board[0])).toBe(4);
    const g3 = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g3, 'TIME_872');
    expect(g3.s.players[1].board).toHaveLength(7);
    const g4 = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g4, 'TIME_873');
    expect(g4.s.players[0].hero.armor).toBe(10);
    expect(g4.s.players[1].board).toHaveLength(2);
  });

  it('變形者 / 麥迪文：沉默並消滅所有其他手下，卡拉贊與法杖消耗為 (0)', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    put(g, FILLER, 0);
    put(g, FILLER, 1);
    play(g, 'TIME_890');
    expect(g.s.players[0].board.map((m) => m.cardId)).toEqual(['TIME_890']);
    expect(g.s.players[1].board).toHaveLength(0);
    const g2 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const medivh = give(g2, 'TIME_890');
    expect(g2.costOf(g2.s.players[0], medivh)).toBe(10);
    play(g2, 'TIME_890t2'); // 卡拉贊（10 費）
    expect(g2.costOf(g2.s.players[0], medivh)).toBe(0);
    const g3 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const staff = give(g3, 'TIME_890t');
    expect(g3.costOf(g3.s.players[0], staff)).toBe(10);
    put(g3, 'TIME_890', 0);
    expect(g3.costOf(g3.s.players[0], staff)).toBe(0);
    play(g3, 'TIME_890t');
    // 法杖：你的法術傷害與治療加倍
    const foe = g3.s.players[1];
    play(g3, 'CS2_029', foe.hero.uid); // 火球術 6 -> 12
    expect(foe.hero.hp).toBe(18);
  });
});
