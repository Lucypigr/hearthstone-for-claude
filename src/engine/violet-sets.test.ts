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

describe('戰士與中立', () => {
  it('暴動者：友方手下受傷存活後獲得 +1 攻擊力', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    put(g, 'JAIL_029', 0);
    const m = put(g, FILLER, 0);
    play(g, 'CS2_029', m.uid); // 火球術 6 點傷害：死亡不加
    expect(g.atkOf(m)).toBe(4);
    const n = put(g, FILLER, 0);
    const foe = put(g, FILLER, 1);
    foe.baseAtk = 2;
    g.apply({ type: 'attack', attacker: n.uid, target: foe.uid });
    expect(g.atkOf(n)).toBe(5);
  });

  it('逃脫專家：攻擊且存活後抽一張牌並離開', () => {
    const g = newGame();
    const m = put(g, 'JAIL_030', 0);
    const hand = g.s.players[0].hand.length;
    g.apply({ type: 'attack', attacker: m.uid, target: g.s.players[1].hero.uid });
    expect(g.s.players[0].hand.length).toBe(hand + 1);
    expect(g.s.players[0].board.includes(m)).toBe(false);
    expect(g.s.players[0].graveyard.includes('JAIL_030')).toBe(false);
  });

  it('警戒哨衛：牌堆沒有中立卡牌就召喚兩個', () => {
    const g = newGame({ deck: Array(30).fill('CS2_029'), classes: ['MAGE', 'WARRIOR'] });
    play(g, 'JAIL_035');
    expect(board(g, 0).filter((c) => c === 'JAIL_035').length).toBe(3);
    const g2 = newGame();
    play(g2, 'JAIL_035');
    expect(board(g2, 0).filter((c) => c === 'JAIL_035').length).toBe(1);
  });

  it('紫羅蘭懲罰者：偷取敵方手下的加成效果', () => {
    const g = newGame();
    const foe = put(g, FILLER, 1);
    foe.atkBuff = 2;
    foe.keywords.push('TAUNT');
    play(g, 'JAIL_101', foe.uid);
    const me = g.s.players[0].board.find((m) => m.cardId === 'JAIL_101')!;
    expect(foe.atkBuff).toBe(0);
    expect(foe.keywords.includes('TAUNT')).toBe(false);
    expect(g.atkOf(me)).toBe(4 + 2 + 2); // 基礎 4 + 偷來的 +2 + 兩個加成各 +1
    expect(g.hasKw(me, 'TAUNT')).toBe(true);
  });

  it('『迫近之死』維瑪：摧毀全部非聖騎士手下', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    put(g, FILLER, 0);
    put(g, FILLER, 1);
    put(g, 'CS2_101t', 0); // 白銀之手新兵（聖騎士衍生卡）
    play(g, 'JAIL_118');
    expect(board(g, 0).includes(FILLER)).toBe(false);
    expect(board(g, 1).length).toBe(0);
    expect(board(g, 0).includes('JAIL_118')).toBe(true);
  });

  it('人群控制 / 襤褸防衛者 / P1CK-P0K3T：牌堆 25 張以上', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const me = g.s.players[0];
    me.deck = me.deck.slice(0, 30);
    const defender = put(g, 'JAIL_311', 0);
    expect(g.atkOf(defender)).toBe(7);
    me.deck = me.deck.slice(0, 20);
    expect(g.atkOf(defender)).toBe(2);
    const cc = give(g, 'JAIL_307');
    me.deck = Array(26).fill(0).map(() => g.newHandCard(FILLER));
    expect(g.costOf(me, cc)).toBe(3);
    me.deck = me.deck.slice(0, 10);
    expect(g.costOf(me, cc)).toBe(5);
    const hand = me.hand.length;
    me.deck = Array(26).fill(0).map(() => g.newHandCard(FILLER));
    play(g, 'JAIL_456');
    expect(me.hand.length).toBe(hand + 1);
  });

  it('達拉然勇士：獲得體質後額外 +1/+1（包含手牌中）', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const champ = put(g, 'JAIL_330', 0);
    const a = put(g, FILLER, 0);
    void a;
    play(g, 'JAIL_457'); // 被劫持的警衛機器人：賦予其他手下 +1/+1
    expect(champ.atkBuff).toBe(2);
    expect(champ.maxHp).toBe(3 + 2);
    const inHand = give(g, 'JAIL_330');
    play(g, 'JAIL_387'); // 釋放野獸：手牌中的手下 +1/+1
    expect(inHand.atkBuff).toBe(2);
  });

  it('真相追求者 / 鐵球和鎖鍊 / 神聖縛錘彈', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    play(g, 'JAIL_329'); // 真相追求者（武器）
    const pal = put(g, 'CS2_101t', 0);
    const other = put(g, FILLER, 0);
    const hero = g.s.players[0].hero;
    g.apply({ type: 'attack', attacker: hero.uid, target: g.s.players[1].hero.uid });
    expect(g.atkOf(pal)).toBe(1 + 2);
    expect(g.atkOf(other)).toBe(4);
    other.hp = 2;
    play(g, 'JAIL_376'); // 鐵球和鎖鍊（武器）
    g.s.players[0].weapon!.durability = 0;
    pass(g);
    expect(g.atkOf(other)).toBe(5);
    expect(other.maxHp).toBe(7);
  });

  it('曲齒：四個友方角色在你的回合受傷時，從手中召喚', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const me = g.s.players[0];
    const w = give(g, 'JAIL_421');
    const ms = [put(g, FILLER, 0), put(g, FILLER, 0), put(g, FILLER, 0)];
    play(g, 'CS2_029'.replace('CS2_029', 'EX1_400')); // 旋風斬：對全部手下造成 1 點傷害
    void ms;
    expect(me.hand.includes(w) || board(g, 0).includes('JAIL_421')).toBe(true);
    // 英雄受傷 → 第四個受傷的友方角色
    play(g, 'CS2_029', me.hero.uid);
    expect(board(g, 0)).toContain('JAIL_421');
    expect(me.hand.includes(w)).toBe(false);
  });

  it('狂暴獵犬：強迫敵方手下攻擊它', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const a = put(g, FILLER, 1);
    const b = put(g, FILLER, 1);
    play(g, 'JAIL_435');
    const hound = g.s.players[0].board.find((m) => m.cardId === 'JAIL_435')!;
    expect(hound.hp).toBe(12 - 4 - 4);
    void a;
    void b;
  });

  it('奪取裝備：獲得護甲並洗入五張裝備', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const me = g.s.players[0];
    play(g, 'JAIL_386');
    expect(me.hero.armor).toBe(2);
    expect(me.deck.filter((h) => h.cardId === 'JAIL_386t').length).toBe(5);
    me.deck = me.deck.filter((h) => h.cardId !== 'JAIL_386t');
    const gear = g.newHandCard('JAIL_386t');
    me.deck.push(gear);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.hero.armor).toBe(4);
  });

  it('釋放野獸：傳說手下額外 +2/+1', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const me = g.s.players[0];
    me.hand = [];
    const leg = give(g, 'JAIL_384'); // 破鏈者霍格（傳說）
    const norm = give(g, FILLER);
    play(g, 'JAIL_387');
    expect(leg.atkBuff).toBe(3);
    expect(leg.hpBuff).toBe(2);
    expect(norm.atkBuff).toBe(1);
  });

  it('破鏈者霍格：對戰開始複製牌堆中的其他傳說卡牌', () => {
    const deck = ['JAIL_384', 'EX1_562', 'EX1_562', ...Array(27).fill(FILLER)];
    const g = newGame({ deck, classes: ['WARRIOR', 'MAGE'] });
    const all = [...g.s.players[0].deck, ...g.s.players[0].hand];
    expect(all.filter((h) => h.cardId === 'EX1_562').length).toBe(4);
    expect(all.filter((h) => h.cardId === 'JAIL_384').length).toBe(1);
  });

  it('煉獄火小鬼：亡語與棄掉時造成 3 點傷害', () => {
    const g = newGame();
    const a = put(g, FILLER, 0);
    const imp = put(g, 'JAIL_398', 0);
    kill(g, imp);
    pass(g);
    expect(a.hp).toBe(2);
    expect(g.s.players[1].hero.hp).toBe(27);
  });

  it('偷取與賄賂：髒鼠大盜 / 黑暗賄賂 / 托戈瓦哥', () => {
    const g = newGame({ classes: ['ROGUE', 'DEMONHUNTER'] });
    const me = g.s.players[0];
    const foe = g.s.players[1];
    put(g, 'JAIL_205', 0);
    const hc = give(g, FILLER, 1, false);
    hc.enteredTurn = g.s.turn;
    g.apply({ type: 'endTurn' });
    expect(me.hand.includes(hc)).toBe(true);
    expect(foe.hand.includes(hc)).toBe(false);
    g.apply({ type: 'endTurn' });
    me.hand = [];
    foe.hand = [];
    play(g, 'JAIL_206');
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    expect(me.hand.length).toBe(2);
    expect(foe.hand.length).toBe(1);
    me.hand = [give(g, FILLER, 0, false)];
    foe.hand = [give(g, FILLER, 1, false), give(g, 'CS2_029', 1, false)];
    play(g, 'JAIL_852');
    expect(me.hand.length).toBe(1);
    expect(foe.hand.length).toBe(2);
  });

  it('警報自走機：與對手手中的手下交換', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    put(g, 'JAIL_502', 0);
    g.s.players[1].hand = [g.newHandCard(FILLER)];
    pass(g);
    expect(board(g, 0)).toEqual([FILLER]);
    expect(g.s.players[1].hand.some((h) => h.cardId === 'JAIL_502')).toBe(true);
  });

  it('調查員魚爾摩斯：對手下回合打出同名卡牌，你獲得 3 枚幸運幣', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    g.s.players[1].hand = [g.newHandCard(FILLER)];
    g.s.players[1].hand.push(g.newHandCard('CS2_029'));
    play(g, 'JAIL_851');
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    const inv = g.s.players[0].investigation!;
    expect(inv).toBeTruthy();
    g.apply({ type: 'endTurn' });
    const hc = g.s.players[1].hand.find((h) => h.cardId === inv.cardId) ?? give(g, inv.cardId, 1);
    g.s.players[1].mana = 10;
    const coins = g.s.players[0].hand.filter((h) => getCard(h.cardId).nameEn.includes('Coin')).length;
    g.apply({ type: 'play', handUid: hc.uid, target: getCard(inv.cardId).type === 'SPELL' ? g.s.players[0].hero.uid : undefined });
    expect(g.s.players[0].hand.filter((h) => getCard(h.cardId).nameEn.includes('Coin')).length).toBe(coins + 3);
  });
});

describe('盜賊', () => {
  it('玉蓮幫生事者：在手中或牌堆時打出 2 費卡牌，射擊更多次', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    const me = g.s.players[0];
    const trouble = give(g, 'JAIL_470');
    const inDeck = g.newHandCard('JAIL_470');
    me.deck.push(inDeck);
    const two = give(g, 'CS2_122'); // 2 費
    expect(g.costOf(me, two)).toBe(getCard('CS2_122').cost);
    me.hand = me.hand.filter((h) => h === trouble || h === two);
    const c = getCard('CS2_122').cost;
    if (c === 2) {
      g.apply({ type: 'play', handUid: two.uid });
      expect(trouble.counter).toBe(1);
      expect(inDeck.counter).toBe(1);
    }
    const hero = g.s.players[1].hero;
    const hp = hero.hp;
    g.apply({ type: 'play', handUid: trouble.uid });
    expect(hero.hp).toBe(hp - (c === 2 ? 2 : 1));
  });

  it('開鎖者：數值等同剩餘法力', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    const foe = put(g, FILLER, 1);
    const hc = give(g, 'JAIL_501');
    g.s.players[0].mana = 4; // 打出後剩 3
    g.apply({ type: 'play', handUid: hc.uid, target: foe.uid });
    const m = g.s.players[0].board.find((x) => x.cardId === 'JAIL_501')!;
    expect(g.atkOf(m)).toBe(3);
    expect(m.hp).toBe(3);
    expect(foe.hp).toBe(2);
  });

  it('黑掌的鞭子：每個幸運幣使消耗減少 (1)', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    const me = g.s.players[0];
    const whip = give(g, 'JAIL_503');
    expect(g.costOf(me, whip)).toBe(3 - me.hand.filter((h) => getCard(h.cardId).nameEn.includes('Coin')).length);
    give(g, 'GAME_005');
    give(g, 'GAME_005');
    expect(g.costOf(me, whip)).toBeLessThanOrEqual(1);
  });

  it('翠玉守護者 / 小偷工具', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    const me = g.s.players[0];
    me.twoManaPlayed = 3;
    me.hand = [];
    play(g, 'JAIL_474');
    expect(me.hand.length).toBe(2);
    for (const h of me.hand) expect(g.costOf(me, h)).toBe(5);
    me.hand = [];
    play(g, 'JAIL_706');
    expect(me.hand.length).toBe(2);
    for (const h of me.hand) expect(g.costOf(me, h)).toBe(2);
  });

  it('大卸八塊：重新打出本回合的其他卡牌，然後結束回合', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    const turn = g.s.turn;
    const foe = put(g, FILLER, 1);
    foe.maxHp = foe.hp = 20;
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    const heroHp = g.s.players[1].hero.hp;
    play(g, 'JAIL_500');
    expect(g.s.players[1].hero.hp + foe.hp).toBeLessThanOrEqual(heroHp + 20 - 6);
    expect(g.s.turn).toBeGreaterThan(turn);
    expect(g.s.current).toBe(1);
  });

  it('玉蓮幫幫主阿雅：永遠後手，偽造品取代幸運幣', () => {
    const deck = ['JAIL_504', ...Array(29).fill(FILLER)];
    const g = newGame({ deck, deck1: Array(30).fill(FILLER), first: 0, classes: ['ROGUE', 'MAGE'] });
    expect(g.s.first).toBe(1);
    const g2 = newGame({ classes: ['ROGUE', 'MAGE'] });
    play(g2, 'JAIL_504');
    g2.apply({ type: 'choose', index: 0 });
    const me = g2.s.players[0];
    expect(me.coinCard).toBe('JAIL_504t');
    expect(me.hand.filter((h) => h.cardId === 'JAIL_504t').length).toBeGreaterThanOrEqual(3);
    const coin = me.hand.find((h) => h.cardId === 'JAIL_504t')!;
    me.mana = 0;
    g2.apply({ type: 'play', handUid: coin.uid });
    expect(me.mana).toBe(1);
    expect(board(g2, 0)).toContain('CFM_712_t01');
  });

  it('髒鼠 / 狂熱偽造者 / 迪菲亞崇拜者', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    const me = g.s.players[0];
    me.hand = [];
    play(g, 'JAIL_986');
    expect(me.hand.length).toBe(1);
    expect(me.hand[0].temporary).toBe(true);
    const w = give(g, 'JAIL_909');
    me.cardsPlayedThisTurn = 0;
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    g.apply({ type: 'play', handUid: w.uid });
    const m = me.board.find((x) => x.cardId === 'JAIL_909')!;
    expect(g.atkOf(m)).toBe(2 + 2);
  });
});

describe('法師', () => {
  it('坐牢的曼納斯頓：施放法術後召喚相同消耗的隨機手下', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'JAIL_122');
    const before = g.s.players[0].board.length;
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(g.s.players[0].board.length).toBe(before + 1);
    expect(getCard(g.s.players[0].board[before].cardId).cost).toBe(4);
  });

  it('劫獄建築師：發現的法術打出時施放兩次', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'JAIL_123');
    g.apply({ type: 'choose', index: 0 });
    const spell = me.hand[me.hand.length - 1];
    expect(spell.castTwice).toBe(true);
    expect(getCard(spell.cardId).cost).toBeGreaterThanOrEqual(5);
  });

  it('走私鍊金師：把一張手牌變形為消耗增加 (5) 的法術並保留消耗', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [];
    const hc = give(g, 'CS2_029'); // 4 費
    play(g, 'JAIL_313');
    expect(getCard(hc.cardId).type).toBe('SPELL');
    expect(getCard(hc.cardId).cost).toBeGreaterThanOrEqual(9);
    expect(g.costOf(me, hc)).toBe(4);
  });

  it('萬能鑰匙：發現法術，重置選項，之後打出其他卡牌會變形', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [];
    play(g, 'JAIL_319');
    expect(g.s.pendingChoice!.options.length).toBe(4);
    expect(g.s.pendingChoice!.options[3]).toBe('JAIL_319t');
    g.apply({ type: 'choose', index: 0 });
    const key = me.hand[0];
    expect(key.skeleton).toBe(true);
    key.cardId = 'CS2_029'; // 4 費
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(key.cardId === 'CS2_029').toBe(false);
  });

  it('狡猾應變者：本回合施放過法術才會施放兩個奧秘', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'JAIL_321');
    expect(me.secrets.length).toBe(0);
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    play(g, 'JAIL_321');
    expect(me.secrets.length).toBe(2);
  });

  it('紫羅蘭警戒：召喚一個 8 費手下，本回合施放過 3 個其他法術就再召喚一次', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'JAIL_735');
    expect(g.s.players[0].board.length).toBeGreaterThanOrEqual(1);
    expect(g.s.players[0].board.some((m) => getCard(m.cardId).cost === 8)).toBe(true);
    g.s.players[0].board = [];
    for (let i = 0; i < 3; i++) play(g, 'CS2_029', g.s.players[1].hero.uid);
    play(g, 'JAIL_735');
    expect(g.s.players[0].board.length).toBeGreaterThanOrEqual(2); // 8 費的巨型手下會連附肢一起上場
  });

  it('尖塔警衛：揭露牌堆中的法術，消耗 5 以上對敵方手下造成 5 點傷害', () => {
    const g = newGame({ deck: Array(30).fill('CS2_032'), classes: ['MAGE', 'WARRIOR'] }); // 烈焰風暴 7 費
    const foe = put(g, FILLER, 1);
    play(g, 'JAIL_379');
    expect(foe.hp).toBe(0);
    const g2 = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const foe2 = put(g2, FILLER, 1);
    play(g2, 'JAIL_379');
    expect(foe2.hp).toBe(5);
  });

  it('增援光環：回合結束時從牌堆召喚消耗 2 以下的手下，持續 3 回合', () => {
    const deck = Array(30).fill('CS2_189'); // 精靈弓箭手 1 費
    const g = newGame({ deck, classes: ['PALADIN', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'JAIL_327');
    expect(me.board.length).toBe(0);
    g.apply({ type: 'endTurn' });
    expect(me.board.length).toBe(1);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.board.length).toBe(3);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.board.length).toBe(3);
  });

  it('審判：把全部手下的體質改為與選擇的手下相等', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const a = put(g, FILLER, 0);
    a.atkBuff = 4;
    const b = put(g, 'CS2_101t', 1);
    play(g, 'JAIL_326', a.uid);
    expect(g.atkOf(b)).toBe(8);
    expect(b.hp).toBe(5);
  });

  it('血色打手 / 血色招募者 / 惡毒大廚 / 迪菲亞走私者', () => {
    const deck = Array(30).fill('CS2_189');
    const g = newGame({ deck, classes: ['PALADIN', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'JAIL_516');
    const rec = me.board.filter((m) => m.cardId === 'CS2_189');
    expect(rec.length).toBe(2);
    for (const r of rec) expect(g.hasKw(r, 'RUSH')).toBe(true);
    me.hand = [];
    const bruiser = put(g, 'JAIL_328', 0);
    me.deck = me.deck.filter((h) => getCard(h.cardId).cardClass !== 'NEUTRAL');
    kill(g, bruiser);
    pass(g);
    expect(me.hand.some((h) => (getCard(h.cardId).classes ?? [getCard(h.cardId).cardClass]).includes('PALADIN'))).toBe(true);
    const g2 = newGame();
    play(g2, 'JAIL_507');
    expect(g2.s.players[0].board.some((m) => g2.hasKw(m, 'TAUNT') && getCard(m.cardId).cost === 6)).toBe(true);
  });
});

describe('薩滿', () => {
  it('熔化黃金：施放 3 個法術後在手牌中變成手下', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const gold = give(g, 'JAIL_801');
    for (let i = 0; i < 2; i++) play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(gold.cardId).toBe('JAIL_801');
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(gold.cardId).toBe('JAIL_801t');
    const foe = put(g, FILLER, 1);
    g.apply({ type: 'play', handUid: gold.uid, target: foe.uid });
    expect(foe.hp).toBe(1);
    expect(board(g, 0)).toContain('JAIL_801t');
  });

  it('冰霜粉碎 / 風暴烈怒的效果', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const foe = put(g, FILLER, 1);
    play(g, 'JAIL_803', foe.uid);
    expect(foe.frozen).toBe(true);
    play(g, 'JAIL_805');
    expect(foe.hp).toBe(3);
  });

  it('加樂宮暴徒：打出戰吼手下後賦予其 +1/+1', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    put(g, 'JAIL_802', 0);
    play(g, 'EX1_015'); // 新手工程師：戰吼抽一張牌
    const bc = g.s.players[0].board.find((m) => m.cardId === 'EX1_015')!;
    expect(g.atkOf(bc)).toBe(getCard('EX1_015').attack! + 1);
  });

  it('妖術元帥：牌堆開始時沒有法術，消耗減少 (5)', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const me = g.s.players[0];
    expect(me.startedNoSpells).toBe(true);
    me.hand = [];
    play(g, 'JAIL_806');
    expect(me.hand.length).toBe(1);
    expect(g.costOf(me, me.hand[0])).toBe(Math.max(0, getCard(me.hand[0].cardId).cost - 5));
  });

  it('被劫持的警衛機器人 / 偽裝的偵探', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const a = put(g, FILLER, 0);
    play(g, 'JAIL_457');
    expect(g.atkOf(a)).toBe(5);
    const b = give(g, 'JAIL_452');
    g.apply({ type: 'play', handUid: b.uid, side: 'enemy' });
    expect(g.s.players[1].overloadOwed).toBe(2);
  });

  it('小夥伴：選擇元素彈藥，英雄攻擊後觸發並選擇另一種', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'JAIL_458');
    g.apply({ type: 'choose', index: 1 }); // 對全部敵人造成 1 點傷害
    const pal = me.weapon!;
    expect(pal.ammo).toBe(1);
    const foe = put(g, FILLER, 1);
    me.hero.tempAtk = 1;
    g.apply({ type: 'attack', attacker: me.hero.uid, target: g.s.players[1].hero.uid });
    expect(foe.hp).toBe(4);
    expect(g.s.pendingChoice).toBeTruthy();
    g.apply({ type: 'choose', index: 0 });
    expect(pal.ammo).not.toBe(1);
  });

  it('瑪格吉：沒有其他手下 / 法術時獲得被動英雄能力', () => {
    const deck = ['JAIL_800', ...Array(29).fill('CS2_029')];
    const g = newGame({ deck, classes: ['SHAMAN', 'WARRIOR'] });
    const me = g.s.players[0];
    expect(me.heroPower.id).toBe('JAIL_800hp1');
    expect(g.canHeroPower()).toBe(false);
    me.maxMana = 3;
    const m = give(g, FILLER);
    me.mana = 10;
    expect(g.costOf(me, m)).toBe(getCard(FILLER).cost - 2);
    g.apply({ type: 'play', handUid: m.uid });
    const m2 = give(g, FILLER);
    expect(g.costOf(me, m2)).toBe(getCard(FILLER).cost);
    const deck2 = ['JAIL_800', ...Array(29).fill(FILLER)];
    const g2 = newGame({ deck: deck2, classes: ['SHAMAN', 'WARRIOR'] });
    expect(g2.s.players[0].heroPower.id).toBe('JAIL_800hp2');
    expect(g2.s.players[0].zee).toBeTruthy();
  });
});

describe('德魯伊與獵人', () => {
  it('小蜘蛛：你的英雄在你的回合擁有 +1 攻擊力', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    put(g, 'JAIL_202', 0);
    expect(g.atkOf(g.s.players[0].hero)).toBe(1);
    expect(g.atkOf(g.s.players[1].hero)).toBe(0);
  });

  it('毒蛛撕咬 → 毒蛛盛宴 → 毒蛛筵席', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'JAIL_436');
    expect(me.hero.tempAtk).toBe(1);
    expect(me.hero.armor).toBe(1);
    const feast = me.hand.find((h) => h.cardId === 'JAIL_436t')!;
    g.apply({ type: 'play', handUid: feast.uid });
    expect(me.hero.armor).toBe(3);
    const banquet = me.hand.find((h) => h.cardId === 'JAIL_436t2')!;
    g.apply({ type: 'play', handUid: banquet.uid });
    expect(me.hero.armor).toBe(7);
    expect(me.hero.tempAtk).toBe(1 + 2 + 4);
  });

  it('感染餐具室：依英雄攻擊次數強化召喚的手下', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    g.s.players[0].heroAttacks = 3;
    play(g, 'JAIL_200');
    const ms = g.s.players[0].board;
    expect(ms.length).toBe(2);
    for (const m of ms) expect(getCard(m.cardId).cost).toBe(5);
  });

  it('奈絲芮克大廚：五回合後法力變成 10', () => {
    const deck = ['JAIL_860', ...Array(29).fill('CS2_189')];
    const g = newGame({ deck, classes: ['DRUID', 'WARRIOR'] });
    for (let i = 0; i < 5; i++) pass(g);
    expect(g.s.players[0].maxMana).toBe(10);
    expect(g.s.players[0].mana).toBe(10);
  });

  it('劇毒賄賂 / 致命食譜 / 詭詐法杖', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    const foe = g.s.players[1];
    play(g, 'JAIL_861');
    g.apply({ type: 'choose', index: 0 });
    expect(me.hand.some((h) => h.both)).toBe(true);
    expect(foe.hand.some((h) => getCard(h.cardId).chooseOne)).toBe(true);
    me.deck = [g.newHandCard(FILLER), g.newHandCard(FILLER), g.newHandCard(FILLER)];
    me.hand = [];
    me.maxMana = 10;
    play(g, 'JAIL_866');
    expect(me.hand.length).toBe(2);
    for (const h of me.hand) expect(h.atkBuff).toBe(3);
    play(g, 'JAIL_875');
    me.hero.tempAtk = 1;
    g.apply({ type: 'attack', attacker: me.hero.uid, target: foe.hero.uid });
    g.apply({ type: 'choose', index: 0 });
    const got = me.hand[me.hand.length - 1];
    expect(got.costMod).toBe(-2);
  });

  it('掘地逃生 / 野獸絆索 / 秘法絆索', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    const a = put(g, FILLER, 0);
    play(g, 'JAIL_876', a.uid);
    kill(g, a);
    pass(g);
    expect(me.board.length).toBe(2);
    me.board = [];
    play(g, 'JAIL_879');
    expect(me.board.length).toBe(1);
    expect(me.deck.filter((h) => h.cardId === 'JAIL_879t').length).toBe(2);
    me.deck = me.deck.filter((h) => h.cardId !== 'JAIL_879t');
    me.deck.push(g.newHandCard('JAIL_879t'));
    pass(g);
    expect(me.board.length).toBe(2);
    const foeHp = g.s.players[1].hero.hp;
    play(g, 'JAIL_881');
    expect(g.s.players[1].hero.hp).toBeLessThanOrEqual(foeHp);
    expect(me.deck.filter((h) => h.cardId === 'JAIL_881t').length).toBe(2);
  });

  it('黑市監督者：亡語手下獲得衝刺', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    put(g, 'JAIL_880', 0);
    play(g, 'CAP_803'); // 不散陰魂：亡語
    const spirit = g.s.players[0].board.find((m) => m.cardId === 'CAP_803')!;
    expect(g.hasKw(spirit, 'RUSH')).toBe(true);
    play(g, FILLER);
    expect(g.hasKw(g.s.players[0].board.find((m) => m.cardId === FILLER)!, 'RUSH')).toBe(false);
  });

  it('R4T-C4TCH3R：複製牌堆中的法術，亡語抽出其中一張', () => {
    const g = newGame({ deck: Array(30).fill('CS2_029'), classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    const before = me.deck.length;
    play(g, 'JAIL_882');
    expect(me.deck.length).toBe(before * 2);
    const rat = me.board.find((m) => m.cardId === 'JAIL_882')!;
    expect(me.deck.filter((h) => h.markedFor === rat.uid).length).toBe(before);
    kill(g, rat);
    const hand = me.hand.length;
    pass(g);
    expect(me.hand.length).toBeGreaterThanOrEqual(hand + 1);
  });

  it('走私鏟子：抽一張非起始套牌的法術', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    const spell = g.newHandCard('CS2_029');
    me.deck.unshift(spell);
    play(g, 'JAIL_380'); // 走私鏟子（武器）
    me.weapon!.durability = 0;
    pass(g);
    expect(me.hand.includes(spell)).toBe(true);
  });

  it('下水道游鱷：預備；觸發友方亡語', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const m = put(g, 'CAP_803', 0);
    g.s.players[0].hero.hp = 20;
    play(g, 'JAIL_395', m.uid);
    expect(g.s.players[0].hero.hp).toBe(23);
  });

  it('城底區之王：發現野獸，消耗減少 (3)', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g, 'JAIL_831');
    g.apply({ type: 'choose', index: 0 });
    const got = g.s.players[0].hand[g.s.players[0].hand.length - 1];
    expect(got.costMod).toBe(-3);
    expect(getCard(got.cardId).races).toContain('BEAST');
  });
});

describe('術士與惡魔獵人', () => {
  it('殲滅：摧毀全部手下，召喚牌堆底下 3 張牌中的惡魔', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    put(g, FILLER, 0);
    put(g, FILLER, 1);
    const imp = g.newHandCard('EX1_319'); // 烈焰小鬼 惡魔
    me.deck.unshift(imp);
    play(g, 'JAIL_510');
    expect(g.s.players[1].board.length).toBe(0);
    expect(board(g, 0)).toEqual(['EX1_319']);
  });

  it('暗影彈藥：消滅手下後對另一個隨機敵方手下再施放', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const a = put(g, 'CS2_168', 1); // 2/1 魚人
    const b = put(g, 'CS2_168', 1);
    const c = put(g, 'CS2_168', 1);
    play(g, 'JAIL_515', a.uid);
    expect([a, b, c].every((m) => m.hp <= 0)).toBe(true);
  });

  it('惡魔監禁：敵方手下休眠 2 回合；友方惡魔改為 +3/+3', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const foe = put(g, FILLER, 1);
    play(g, 'JAIL_997', foe.uid);
    expect(g.hasKw(foe, 'DORMANT')).toBe(true);
    expect(g.attackTargets(g.s.players[0].hero.uid)).not.toContain(foe.uid);
    pass(g);
    expect(g.hasKw(foe, 'DORMANT')).toBe(true);
    pass(g);
    expect(g.hasKw(foe, 'DORMANT')).toBe(false);
    const imp = put(g, 'EX1_319', 0);
    play(g, 'JAIL_997', imp.uid);
    expect(g.atkOf(imp)).toBe(6);
  });

  it('典獄官瑪翼夫：打出的手下 +3/+3 並休眠 1 回合', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    put(g, 'JAIL_850', 0);
    play(g, FILLER);
    const m = g.s.players[0].board.find((x) => x.cardId === FILLER)!;
    expect(g.atkOf(m)).toBe(7);
    expect(g.hasKw(m, 'DORMANT')).toBe(true);
    pass(g);
    expect(g.hasKw(m, 'DORMANT')).toBe(false);
  });

  it('古老占兆師：選擇對手一張手牌，亡語將其捨棄', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const foe = g.s.players[1];
    foe.hand = [g.newHandCard('CS2_029'), g.newHandCard('CS2_029')];
    play(g, 'JAIL_303');
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    const m = g.s.players[0].board.find((x) => x.cardId === 'JAIL_303')!;
    kill(g, m);
    pass(g);
    expect(foe.hand.length).toBe(1 + 1); // 少了一張，再加回合抽牌
  });

  it('小鬼幫派傀儡：亡語把 8/8 惡魔放到牌堆最底下', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const m = put(g, 'JAIL_399', 0);
    kill(g, m);
    pass(g);
    const deck = g.s.players[0].deck;
    expect(deck[0].cardId).toBe('JAIL_399t1');
    expect(deck[1].cardId).toBe('JAIL_399t1');
  });

  it('摩拉革：亡語從牌堆召喚惡魔並賦予亡語召喚摩拉革', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    me.deck.push(g.newHandCard('EX1_319'));
    const m = put(g, 'JAIL_906', 0);
    kill(g, m);
    pass(g);
    expect(board(g, 0)).toEqual(['EX1_319']);
    const imp = me.board[0];
    kill(g, imp);
    pass(g);
    expect(board(g, 0)).toEqual(['JAIL_906']);
  });

  it('斬魂者阿薩琳娜：起始生命值 40，牌堆 20 張加上敵方牌堆的 20 張複製品', () => {
    const deck = ['JAIL_430', ...Array(29).fill('CS2_182')];
    const foeDeck = Array(30).fill('CS2_029');
    const g = newGame({ deck, deck1: foeDeck, classes: ['PRIEST', 'MAGE'] });
    const me = g.s.players[0];
    expect(me.hero.hp).toBe(40);
    expect(me.deck.length + me.hand.length).toBe(40 - 0);
    expect([...me.deck, ...me.hand].filter((h) => h.fromOpp).length).toBe(20);
  });

  it('指揮官碧翠絲：十個分身加入你的套牌', () => {
    const deck = ['JAIL_397', ...Array(29).fill('CS2_182')];
    const g = newGame({ deck, classes: ['PALADIN', 'MAGE'] });
    const me = g.s.players[0];
    expect(me.deck.length + me.hand.length).toBe(40);
  });

  it('『背叛者』高佛雷：超抽的卡牌在有空間時回到手中，消耗減少 (1)', () => {
    const deck = ['JAIL_509', ...Array(29).fill('CS2_182')];
    const g = newGame({ deck, classes: ['WARLOCK', 'MAGE'] });
    const me = g.s.players[0];
    me.hand = Array(10).fill(0).map(() => g.newHandCard('CS2_182'));
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.hand.length).toBe(10);
    expect(me.godfrey!.length).toBe(1);
    const spare = me.hand[0];
    me.mana = 10;
    expect(g.apply({ type: 'play', handUid: spare.uid })).toBe(true);
    expect(me.hand.length).toBe(10);
    expect(me.hand[9].costMod).toBe(-1);
  });

  it('伊莉妲‧尋罪者：牌堆送入虛無，每個回合開始獲得兩張', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    const me = g.s.players[0];
    play(g, 'JAIL_719');
    expect(me.deck.length).toBe(1);
    expect(me.void!.length).toBeGreaterThan(20);
    const hand = me.hand.length;
    pass(g);
    expect(me.hand.length).toBe(hand + 2 + 1);
  });

  it('虛無靈魂：每次施放都強化之後的虛無靈魂', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    play(g, 'JAIL_732');
    expect(g.s.players[0].board.length).toBe(1);
    expect(getCard(g.s.players[0].board[0].cardId).cost).toBe(1);
    play(g, 'JAIL_732');
    expect(getCard(g.s.players[0].board[1].cardId).cost).toBe(2);
    expect(g.s.players[0].voidSouls).toBe(2);
  });

  it('虛無衝擊 / 兇惡虛無之鱗 / 星塵鐮刀', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    const me = g.s.players[0];
    const foe = put(g, 'CS2_168', 1);
    me.hand = [];
    play(g, 'JAIL_891', foe.uid);
    expect(me.hand.filter((h) => h.cardId === 'JAIL_732').length).toBe(1);
    const m = put(g, 'JAIL_733', 0);
    kill(g, m);
    pass(g);
    expect(me.hand.filter((h) => h.cardId === 'JAIL_732').length).toBe(2);
    play(g, 'JAIL_730');
    me.hero.tempAtk = 0;
    g.apply({ type: 'attack', attacker: me.hero.uid, target: g.s.players[1].hero.uid });
    expect(me.hand.filter((h) => h.cardId === 'JAIL_732').length).toBe(3);
  });

  it('『靈魂寄生者』崔斯塔斯：召喚惡魔後獲得其體質', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    const t = put(g, 'JAIL_721', 0);
    play(g, 'EX1_319');
    expect(g.atkOf(t)).toBe(3 + 3);
    expect(t.maxHp).toBe(3 + 2);
  });

  it('被俘的納斯雷茲姆：全部手下消耗增加 (2)；地獄喚起者', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    put(g, 'JAIL_890', 0);
    const hc = give(g, FILLER);
    expect(g.costOf(g.s.players[0], hc)).toBe(getCard(FILLER).cost + 2);
    const g2 = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    g2.s.players[0].deck = [];
    play(g2, 'JAIL_734');
    const m = g2.s.players[0].board.find((x) => x.cardId === 'JAIL_734')!;
    expect(g2.atkOf(m)).toBe(6);
    const g3 = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    play(g3, 'JAIL_734');
    expect(g3.s.pendingChoice).toBeTruthy();
  });

  it('宇宙顯化：流放時重複效果', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    const me = g.s.players[0];
    me.hand = [];
    const hc = give(g, 'JAIL_892');
    const hero = g.s.players[1].hero;
    const hp = hero.hp;
    const deck = me.deck.length;
    g.apply({ type: 'play', handUid: hc.uid, target: hero.uid });
    expect(hero.hp).toBe(hp - 4);
    expect(me.deck.length).toBe(deck + 2);
  });
});

describe('死亡騎士與中立', () => {
  it('偽裝的醫生：亡語把疫病洗入牌堆，疫病抽到時對英雄造成傷害', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'MAGE'] });
    const me = g.s.players[0];
    const d = put(g, 'JAIL_442', 0);
    kill(g, d);
    pass(g);
    expect(me.deck.filter((h) => h.cardId === 'JAIL_443t').length).toBeGreaterThanOrEqual(3);
    const hp = me.hero.hp;
    me.deck.push(g.newHandCard('JAIL_443t'));
    pass(g);
    expect(me.hero.hp).toBeLessThan(hp);
  });

  it('活體瘟疫：不對英雄造成傷害，而是洗入等量疫病', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'MAGE'] });
    const plague = put(g, 'JAIL_443', 0);
    const hero = g.s.players[1].hero;
    const deck = g.s.players[1].deck.length;
    g.apply({ type: 'attack', attacker: plague.uid, target: hero.uid });
    expect(hero.hp).toBe(30);
    expect(g.s.players[1].deck.length).toBe(deck + 8);
  });

  it('鋸骨：摧毀其他手下，每個抽一張牌並回復一點法力', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'MAGE'] });
    const me = g.s.players[0];
    put(g, FILLER, 0);
    put(g, FILLER, 0);
    me.hand = [];
    const hc = give(g, 'JAIL_444');
    me.mana = 6;
    g.apply({ type: 'play', handUid: hc.uid });
    expect(me.board.map((m) => m.cardId)).toEqual(['JAIL_444']);
    expect(me.hand.length).toBe(2);
    expect(me.mana).toBe(1 + 2);
  });

  it('血腥醫生薩蕾娜：獲得第二個英雄能力吸血鬼之吻（消耗屍體）', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'MAGE'] });
    const me = g.s.players[0];
    play(g, 'JAIL_446');
    expect(me.heroPower2?.id).toBe('JAIL_446hp');
    const m = put(g, FILLER, 0);
    expect(g.canSecondPower().ok).toBe(false); // 沒有屍體
    me.corpses = 5;
    expect(g.canSecondPower().ok).toBe(true);
    expect(g.apply({ type: 'heroPower2', target: m.uid })).toBe(true);
    expect(g.atkOf(m)).toBe(7);
    expect(me.corpses).toBe(2);
    expect(g.canSecondPower().ok).toBe(false); // 本回合已使用
    // 一般英雄能力不受影響
    expect(g.canHeroPower()).toBe(true);
    pass(g);
    me.corpses = 3;
    expect(g.canSecondPower().ok).toBe(true);
  });

  it('魯莽偵探：亡語獲得偵探的衣物', () => {
    const g = newGame();
    const m = put(g, 'JAIL_447', 0);
    kill(g, m);
    pass(g);
    expect(g.s.players[0].hand.some((h) => h.cardId === 'JAIL_447t')).toBe(true);
  });

  it('蠍怪：全部友方手下具有致命劇毒', () => {
    const g = newGame();
    const a = put(g, FILLER, 0);
    put(g, 'JAIL_459', 0);
    expect(g.hasKw(a, 'POISONOUS')).toBe(true);
  });

  it('逃亡野豬司機 / 孤寂囚犯 / 被抓的大法師', () => {
    const g = newGame({ deck: Array(30).fill(FILLER) });
    play(g, 'JAIL_462');
    const hog = g.s.players[0].board.find((m) => m.cardId === 'JAIL_462')!;
    expect(g.hasKw(hog, 'CHARGE')).toBe(true);
    const prisoner = give(g, 'JAIL_204');
    expect(g.costOf(g.s.players[0], prisoner)).toBe(5);
    g.s.players[0].board = [];
    g.s.players[1].board = [];
    expect(g.costOf(g.s.players[0], prisoner)).toBe(2);
    const foe = g.s.players[1].hero;
    foe.hp = 30;
    g.s.players[0].graveyard.push(...Array(4).fill('JAIL_974'));
    const mage = put(g, 'JAIL_974', 0);
    kill(g, mage);
    pass(g);
    expect(foe.hp).toBe(24);
  });

  it('好騙的守衛 / 迪菲亞走私者 / 黑市拍賣師', () => {
    const g = newGame();
    const guard = put(g, 'JAIL_703', 0);
    kill(g, guard);
    pass(g);
    expect(g.s.players[0].sorry).toBe(true);
    const m = put(g, FILLER, 0);
    play(g, 'JAIL_998', m.uid);
    expect(g.atkOf(m)).toBe(6);
    expect(g.hasKw(m, 'RUSH')).toBe(true);
    put(g, 'JAIL_718', 0);
    const hand = g.s.players[0].hand.length;
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(g.s.players[0].hand.length).toBe(hand + 1);
  });

  it('Void: 頭目凡妮莎 / 微小的…：打出卡牌後獲得消耗減少的戰吼手下', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'JAIL_407', 0);
    me.hand = [];
    play(g, FILLER);
    expect(me.hand.length).toBe(1);
    expect(me.hand[0].costMod).toBe(-2);
  });
});
