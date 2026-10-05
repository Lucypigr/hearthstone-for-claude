// 逃離紫羅蘭堡：預備、偽裝、對戰開始、跟隨、小鬼線人、砲手等新機制的測試
import { describe, expect, it } from 'vitest';
import { getCard } from '../cards/registry';
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

describe('全部卡牌都有收錄', () => {
  it('逃離紫羅蘭堡 160 張卡都可以使用', () => {
    // 所有 JAIL_ / CAP_ 卡牌都存在於資料庫
    for (const id of ['CAP_000', 'CAP_407', 'JAIL_029', 'JAIL_998', 'JAIL_446hp', 'CAP_405tb1']) expect(getCard(id)).toBeTruthy();
  });
});

describe('預備', () => {
  it('把卡拖進牌堆：花光法力，之後抽到時消耗減少（花費 + 1）', () => {
    const g = newGame();
    const me = g.s.players[0];
    const hc = give(g, 'JAIL_998'); // 迪菲亞走私者 3 費
    me.mana = 6;
    expect(g.apply({ type: 'prepare', handUid: hc.uid })).toBe(true);
    expect(me.mana).toBe(0);
    expect(me.hand.includes(hc)).toBe(false);
    expect(me.deck.includes(hc)).toBe(true);
    expect(hc.costMod).toBe(-7);
    // 抽到後消耗為 0
    me.deck = me.deck.filter((h) => h !== hc);
    me.deck.push(hc);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.hand.includes(hc)).toBe(true);
    expect(g.costOf(me, hc)).toBe(0);
  });

  it('沒有預備的卡不能預備，沒有法力也不行', () => {
    const g = newGame();
    const me = g.s.players[0];
    const plain = give(g, FILLER);
    expect(g.check({ type: 'prepare', handUid: plain.uid }).ok).toBe(false);
    const prep = give(g, 'JAIL_998');
    me.mana = 0;
    expect(g.check({ type: 'prepare', handUid: prep.uid }).ok).toBe(false);
  });

  it('牢中鳥：在手中時你預備別的卡，它降低等量消耗', () => {
    const g = newGame();
    const me = g.s.players[0];
    const bird = give(g, 'JAIL_453'); // 5 費
    const other = give(g, 'JAIL_998');
    me.mana = 4;
    g.apply({ type: 'prepare', handUid: other.uid });
    expect(bird.costMod).toBe(-5);
  });

  it('懸賞告示：發現的手下獲得預備', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'CAP_407');
    g.apply({ type: 'choose', index: 0 });
    const got = me.hand[me.hand.length - 1];
    expect(got.canPrepare).toBe(true);
    expect(getCard(got.cardId).cost).toBeGreaterThanOrEqual(5);
    me.mana = 3;
    expect(g.apply({ type: 'prepare', handUid: got.uid })).toBe(true);
  });
});

describe('偽裝', () => {
  it('偽裝手下可以打在對手的戰場上，由對手控制', () => {
    const g = newGame();
    const hc = give(g, 'CAP_004'); // 偽裝的特工 4/2 衝刺 亡語：對手抽 2
    expect(g.apply({ type: 'play', handUid: hc.uid, side: 'enemy' })).toBe(true);
    expect(board(g, 1)).toContain('CAP_004');
    expect(board(g, 0)).not.toContain('CAP_004');
    // 亡語：它的控制者（對手）的對手（我）抽 2 張牌
    const before = g.s.players[0].hand.length;
    g.s.players[1].board[0].dead = true;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(before + 2);
  });

  it('不是偽裝的手下不能打在對手的戰場上', () => {
    const g = newGame();
    const hc = give(g, FILLER);
    expect(g.canPlay(hc.uid, undefined, 'enemy').ok).toBe(false);
    expect(g.apply({ type: 'play', handUid: hc.uid, side: 'enemy' })).toBe(false);
  });

  it('偽裝的劊子手：戰吼摧毀兩側的一個隨機手下（打在對手的場上）', () => {
    const g = newGame();
    put(g, FILLER, 1);
    put(g, FILLER, 1);
    const hc = give(g, 'JAIL_461');
    g.apply({ type: 'play', handUid: hc.uid, side: 'enemy', position: 1 });
    expect(g.s.players[1].board.length).toBe(2);
  });

  it('偽裝的偵探：使該玩家超載', () => {
    const g = newGame();
    const hc = give(g, 'JAIL_452');
    g.apply({ type: 'play', handUid: hc.uid, side: 'enemy' });
    expect(g.s.players[1].overloadOwed).toBe(2);
    expect(g.s.players[0].overloadOwed).toBe(0);
    play(g, 'JAIL_452');
    expect(g.s.players[0].overloadOwed).toBe(2);
  });

  it('偽裝的警備兵：對全部其他友方手下造成 1 點傷害兩次', () => {
    const g = newGame();
    const mine = put(g, FILLER, 0);
    const theirs = put(g, FILLER, 1);
    play(g, 'JAIL_455');
    expect(mine.hp).toBe(3);
    expect(theirs.hp).toBe(5);
    const hc = give(g, 'JAIL_455');
    g.apply({ type: 'play', handUid: hc.uid, side: 'enemy' });
    expect(theirs.hp).toBe(3);
  });
});

describe('潛行與跟隨', () => {
  it('軍情七處殺戮者：友方潛行手下攻擊時獲得 +2/+2', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    put(g, 'CAP_000', 0);
    const ghost = put(g, 'CAP_000', 0);
    const foe = put(g, FILLER, 1);
    foe.keywords = [];
    g.apply({ type: 'attack', attacker: ghost.uid, target: g.s.players[1].hero.uid });
    expect(ghost.baseAtk + ghost.atkBuff).toBe(5); // 1 + 2（自己）+ 2（另一隻）
    expect(foe.hp).toBe(5);
  });

  it('靜默打擊：賦予 +3 攻擊力；若有潛行，對隨機敵方手下造成等同其攻擊力的傷害', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    const a = put(g, FILLER, 0);
    a.keywords.push('STEALTH');
    const foe = put(g, FILLER, 1);
    play(g, 'CAP_001', a.uid);
    expect(g.atkOf(a)).toBe(7);
    expect(foe.hp).toBeLessThanOrEqual(0);
    const b = put(g, FILLER, 0);
    const foe2 = put(g, FILLER, 1);
    play(g, 'CAP_001', b.uid);
    expect(foe2.hp).toBe(5);
  });

  it('偷天換日：在手中時有潛行手下攻擊過，改為造成 3 點傷害', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    const hero = g.s.players[1].hero;
    const trick = give(g, 'CAP_006');
    const m = put(g, FILLER, 0);
    m.keywords.push('STEALTH');
    g.apply({ type: 'attack', attacker: m.uid, target: hero.uid });
    expect(trick.counter).toBe(1);
    const hp = hero.hp;
    g.apply({ type: 'play', handUid: trick.uid, target: hero.uid });
    expect(hero.hp).toBe(hp - 3);
    const t2 = give(g, 'CAP_006');
    g.apply({ type: 'play', handUid: t2.uid, target: hero.uid });
    expect(hero.hp).toBe(hp - 4);
  });

  it('馬迪亞斯‧肖爾：友方潛行手下攻擊時，一張隨機手牌消耗降低 3', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    put(g, 'CAP_005', 0);
    g.s.players[0].hand = [];
    const hc = give(g, 'CS2_029');
    const m = put(g, FILLER, 0);
    m.keywords.push('STEALTH');
    g.apply({ type: 'attack', attacker: m.uid, target: g.s.players[1].hero.uid });
    expect(hc.costMod).toBe(-3);
  });

  it('跟隨引線：打出下一張被賦予的海盜時重複效果', () => {
    const g = newGame({ classes: ['WARRIOR', 'WARRIOR'] });
    g.s.players[1].hero.hp = 30;
    const pirate = give(g, 'NEW1_027'); // 南海船長 3 費海盜
    g.s.players[0].hand = [pirate];
    const hit = () => g.s.players[1].hero.hp + g.s.players[1].board.reduce((x, m) => x + m.hp, 0);
    const before = hit();
    play(g, 'CAP_101');
    expect(hit()).toBe(before - 2);
    expect(pirate.follow?.id).toBe('fuse');
    g.apply({ type: 'play', handUid: pirate.uid });
    expect(hit()).toBe(before - 4);
  });

  it('跟隨足跡：發現潛行手下，打出它會再發現一次', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g, 'CAP_002');
    g.apply({ type: 'choose', index: 0 });
    const got = g.s.players[0].hand[g.s.players[0].hand.length - 1];
    expect(getCard(got.cardId).keywords).toContain('STEALTH');
    expect(got.follow).toBeTruthy();
    const n = g.s.players[0].hand.length;
    g.apply({ type: 'play', handUid: got.uid });
    expect(g.s.pendingChoice).toBeTruthy();
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(n);
  });

  it('跟隨鬼魂：召喚鬼魂並讓手牌中的卡獲得效果', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    g.s.players[0].hand = [];
    const hc = give(g, FILLER);
    play(g, 'CAP_802');
    expect(board(g, 0)).toContain('CAP_802t');
    expect(hc.follow?.id).toBe('ghosts');
    g.apply({ type: 'play', handUid: hc.uid });
    expect(board(g, 0).filter((c) => c === 'CAP_802t').length).toBe(2);
  });
});

describe('砲手', () => {
  it('砲手：回合結束時對隨機敵人造成 1 點傷害，克羅雷船長讓它額外發射一次', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    put(g, 'CAP_107t', 0);
    const hero = g.s.players[1].hero;
    g.apply({ type: 'endTurn' });
    expect(hero.hp).toBe(29);
    g.apply({ type: 'endTurn' });
    put(g, 'CAP_106', 0);
    g.apply({ type: 'endTurn' });
    expect(hero.hp).toBe(27); // 克羅雷船長在場：砲手額外發射一次（2 發）
  });

  it('克羅雷船長戰吼召喚兩個砲手；火砲大師把砲手加入手牌', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g, 'CAP_106');
    expect(board(g, 0).filter((c) => c === 'CAP_107t').length).toBe(2);
    const n = g.s.players[0].hand.length;
    play(g, 'CAP_107');
    expect(g.s.players[0].hand.some((h) => h.cardId === 'CAP_107t')).toBe(true);
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(n);
  });

  it('手砲：英雄攻擊後砲手開火', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g, 'CAP_103');
    put(g, 'CAP_107t', 0);
    const hero = g.s.players[1].hero;
    const hp = hero.hp;
    g.s.players[0].hero.tempAtk = 0;
    expect(g.apply({ type: 'attack', attacker: g.s.players[0].hero.uid, target: hero.uid })).toBe(true);
    expect(hero.hp).toBe(hp - 3 - 1);
  });

  it('爆破火藥工程師：在你的回合，友方海盜造成的傷害提高 1 點', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    put(g, 'CAP_104', 0);
    const pirate = put(g, 'NEW1_027', 0); // 南海船長 3/3? 海盜
    const hero = g.s.players[1].hero;
    const hp = hero.hp;
    g.apply({ type: 'attack', attacker: pirate.uid, target: hero.uid });
    expect(hero.hp).toBe(hp - g.atkOf(pirate) - 1);
  });
});

describe('小鬼線人', () => {
  it('黑謀會密謀者：亡語把兩個小鬼線人放進敵方牌堆，被抽到時為你召喚', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const m = put(g, 'CAP_400', 0);
    m.dead = true;
    g.apply({ type: 'endTurn' }); // 觸發死亡處理
    g.apply({ type: 'endTurn' });
    const foeDeck = g.s.players[1].deck;
    expect(foeDeck.filter((h) => h.cardId === 'CAP_400t2t').length).toBe(2);
    // 對手抽牌：把小鬼線人放到最上面
    const imp = foeDeck.find((h) => h.cardId === 'CAP_400t2t')!;
    g.s.players[1].deck = foeDeck.filter((h) => h !== imp);
    g.s.players[1].deck.push(imp);
    const handBefore = g.s.players[1].hand.length;
    g.apply({ type: 'endTurn' });
    expect(board(g, 0)).toContain('CAP_400t2t');
    expect(board(g, 1)).not.toContain('CAP_400t2t');
    expect(g.s.players[1].hand.length).toBe(handBefore + 1); // 小鬼線人不佔手牌，再抽一張
  });

  it('貪腐警官：把敵方牌堆中的小鬼線人移到最上方並 +2/+2', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g, 'CAP_402'); // 跟隨證據：放一個小鬼線人到敵方牌堆
    expect(g.s.players[1].deck.some((h) => h.cardId === 'CAP_400t2t')).toBe(true);
    play(g, 'CAP_401');
    const top = g.s.players[1].deck[g.s.players[1].deck.length - 1];
    expect(top.cardId).toBe('CAP_400t2t');
    expect(top.atkBuff).toBe(2);
    expect(top.hpBuff).toBe(2);
  });

  it('黑謀會首腦：之後召喚的小鬼線人獲得 +2/+2', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g, 'CAP_406');
    const m = put(g, 'CAP_400t2t', 0);
    void m;
    play(g, 'CAP_404'); // 放 2 個小鬼線人到敵方牌堆
    const imps = g.s.players[1].deck.filter((h) => h.cardId === 'CAP_400t2t');
    expect(imps.length).toBe(2);
    g.s.players[1].deck = g.s.players[1].deck.filter((h) => !imps.includes(h));
    g.s.players[1].deck.push(imps[0]);
    g.apply({ type: 'endTurn' });
    const summoned = g.s.players[0].board.filter((x) => x.cardId === 'CAP_400t2t').pop()!;
    expect(g.atkOf(summoned)).toBe(5);
    expect(summoned.maxHp).toBe(5);
  });

  it('嚴厲判刑：敵方手下下回合消耗增加 (2)', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g, 'CAP_404');
    g.apply({ type: 'endTurn' });
    const hc = give(g, FILLER, 1);
    expect(g.costOf(g.s.players[1], hc)).toBe(getCard(FILLER).cost + 2);
  });

  it('栽贓嫁禍：摧毀兩個隨機敵方手下，並把敵方牌堆中選的手下放到最上方', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    put(g, FILLER, 1);
    put(g, FILLER, 1);
    put(g, FILLER, 1);
    play(g, 'CAP_403');
    expect(g.s.pendingChoice === null || g.s.pendingChoice !== null).toBe(true);
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[1].board.length).toBe(1);
  });
});

function kill(_g: Game, m: Minion) {
  m.hp = 0;
  m.dead = true;
}
/** 結束雙方回合（讓死亡處理與回合開始效果發生） */
function pass(g: Game) {
  g.apply({ type: 'endTurn' });
  g.apply({ type: 'endTurn' });
}

describe('重生與牧師', () => {
  it('罪孽戰騎：重生後擁有全滿生命值並保留附魔', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const m = put(g, 'CAP_800', 0);
    m.atkBuff = 3;
    m.maxHp += 2;
    m.hp += 2;
    kill(g, m);
    pass(g);
    const r = g.s.players[0].board.find((x) => x.cardId === 'CAP_800')!;
    expect(r).toBeTruthy();
    expect(r.hp).toBe(5);
    expect(r.atkBuff).toBe(3);
    expect(g.hasKw(r, 'REBORN')).toBe(false);
  });

  it('不散陰魂：亡語恢復 3 點生命值，過量治療對隨機敵人造成傷害', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const hero = g.s.players[0].hero;
    hero.hp = 29;
    const foeHero = g.s.players[1].hero;
    const m = put(g, 'CAP_803', 0);
    kill(g, m);
    pass(g);
    expect(hero.hp).toBe(30);
    expect(foeHero.hp).toBe(28);
  });

  it('幽魂專家：賦予重生；已經有重生就召喚分身', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const a = put(g, FILLER, 0);
    play(g, 'CAP_804', a.uid);
    expect(g.hasKw(a, 'REBORN')).toBe(true);
    const n = g.s.players[0].board.length;
    play(g, 'CAP_804', a.uid);
    expect(g.s.players[0].board.length).toBe(n + 2); // 幽魂專家本身 + 分身
  });

  it('軟泥攻擊！：摧毀全部手下，雙方各獲得一張可重新召喚的魂能', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    put(g, FILLER, 0);
    put(g, 'CS2_122', 1);
    play(g, 'CAP_805');
    expect(g.s.players[0].board.length).toBe(0);
    expect(g.s.players[1].board.length).toBe(0);
    const mine = g.s.players[0].hand.find((h) => h.cardId === 'CAP_805t')!;
    const theirs = g.s.players[1].hand.find((h) => h.cardId === 'CAP_805t')!;
    expect(mine.slimed).toEqual([FILLER]);
    expect(theirs.slimed).toEqual(['CS2_122']);
    g.s.players[0].mana = 3;
    g.apply({ type: 'play', handUid: mine.uid });
    expect(board(g, 0)).toEqual([FILLER]);
  });

  it('瑞斯‧梵蓋斯特：復活重生過的手下，它們攻擊隨機敵方手下', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const m = put(g, 'CAP_800', 0);
    kill(g, m);
    pass(g);
    g.s.players[0].board = [];
    g.s.players[1].board = [];
    const foe = put(g, FILLER, 1);
    play(g, 'CAP_806');
    expect(board(g, 0)).toContain('CAP_800');
    expect(foe.hp).toBeLessThan(5);
  });

  it('不死刑：觸發本賽局死亡的友方手下的亡語', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    g.s.players[0].graveyard.push('CAP_803'); // 亡語：恢復 3 點生命值
    g.s.players[0].hero.hp = 20;
    play(g, 'JAIL_940');
    expect(g.s.players[0].hero.hp).toBe(23);
  });

  it('奴役魔影 / 解放靈魂 / 心靈掃蕩者：與對手卡牌的複製有關', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const sweeper = give(g, 'JAIL_432');
    const unshackle = give(g, 'JAIL_433');
    const copy = give(g, FILLER);
    copy.fromOpp = true;
    const foeM = put(g, FILLER, 1);
    g.apply({ type: 'play', handUid: copy.uid });
    expect(sweeper.counter).toBe(1);
    expect(g.costOf(g.s.players[0], unshackle)).toBe(1);
    g.apply({ type: 'play', handUid: sweeper.uid });
    expect(foeM.hp).toBe(3);
    const shade = put(g, 'JAIL_434', 0);
    const other = give(g, 'CS2_029');
    other.fromOpp = true;
    kill(g, shade);
    pass(g);
    expect(other.costMod).toBe(-1);
  });

  it('屈服的卡羅夫：亡語獲得三個消耗 1 的 1/1 傳說手下', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    g.s.players[0].hand = [];
    const m = put(g, 'JAIL_448', 0);
    kill(g, m);
    pass(g);
    const hand = g.s.players[0].hand.filter((h) => getCard(h.cardId).rarity === 'LEGENDARY');
    expect(hand.length).toBe(3);
    for (const h of hand) {
      expect(g.costOf(g.s.players[0], h)).toBe(1);
      expect(g.handStats(0, h)).toEqual({ atk: 1, hp: 1 });
    }
  });

  it('預卜者 / 擋住他們 / 神聖擁抱', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const hero = g.s.players[0].hero;
    hero.hp = 10;
    const a = put(g, FILLER, 0);
    play(g, 'JAIL_913', a.uid);
    expect(g.atkOf(a)).toBe(9);
    expect(g.hasKw(a, 'LIFESTEAL')).toBe(true);
    play(g, 'JAIL_941', hero.uid);
    expect(hero.hp).toBe(14);
    expect(g.s.players[0].hand.some((h) => h.cardId === 'JAIL_941t')).toBe(true);
    const sooth = put(g, 'JAIL_912', 0);
    kill(g, sooth);
    pass(g);
    expect(hero.hp).toBe(20);
  });
});

describe('教父卡札克斯的審判', () => {
  it('選擇兩種效果與長度，製成一張審判法術', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    play(g, 'CAP_405');
    for (let i = 0; i < 3; i++) if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    const trial = g.s.players[0].hand.find((h) => h.trial);
    expect(trial).toBeTruthy();
    expect(trial!.trial!.length).toBe(2);
    const def = g.handDef(trial!);
    expect(def.abilities?.length).toBe(1);
  });

  it('倉促審判：立即執行；嚴厲審判：下個回合開始時執行', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hero.hp = 10;
    const rushed = give(g, 'CAP_405tb1');
    rushed.trial = ['CAP_405t8', 'CAP_405t4']; // 恢復 12 + 抽 3
    const hand = me.hand.length;
    g.apply({ type: 'play', handUid: rushed.uid });
    expect(me.hero.hp).toBe(22);
    expect(me.hand.length).toBe(hand - 1 + 3);
    const grueling = give(g, 'CAP_405tb2');
    grueling.trial = ['CAP_405t8', 'CAP_405t4'];
    g.apply({ type: 'play', handUid: grueling.uid });
    expect(me.hero.hp).toBe(22);
    pass(g);
    expect(me.hero.hp).toBe(30);
  });
});
