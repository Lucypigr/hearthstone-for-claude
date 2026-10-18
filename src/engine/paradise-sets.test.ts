// 天堂島（Perils in Paradise）：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../cards/registry';
import { cardAllowed, validateDeck } from '../game/decks';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5
const WISP = 'CS2_231'; // 小精靈 1/1

function newGame(seed = 42, cls: 'MAGE' | 'ROGUE' | 'PALADIN' | 'WARRIOR' = 'MAGE'): Game {
  const deck = Array(30).fill(FILLER);
  const g = Game.create({ decks: [deck, deck], classes: [cls, 'WARRIOR'], names: ['玩家', '電腦'], ai: [false, false], seed, first: 0 });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, cardId: string, mana = 10): HandCard {
  const hc = g.newHandCard(cardId);
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

function play(g: Game, cardId: string, extra: { target?: number; position?: number; option?: number } = {}) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, ...extra }), cardId).toBe(true);
  while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
  return hc;
}

function nextRound(g: Game) {
  g.apply({ type: 'endTurn' });
  g.apply({ type: 'endTurn' });
  g.s.players[0].mana = 10;
}

describe('天堂島系列收錄', () => {
  it('183 張可收藏卡全部收錄', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1905)).toHaveLength(183);
  });
});

describe('飲料', () => {
  it('施放後以少一口的版本回到手牌，最後一口就沒了', () => {
    const g = newGame();
    const p = g.s.players[0];
    play(g, 'VAC_323');
    expect(p.hand.at(-1)!.cardId).toBe('VAC_323t');
    p.hand.pop();
    play(g, 'VAC_323t');
    expect(p.hand.at(-1)!.cardId).toBe('VAC_323t2');
    p.hand.pop();
    const n = p.hand.length;
    play(g, 'VAC_323t2');
    expect(p.hand.length).toBe(n);
  });
});

describe('旅遊手冊', () => {
  it('每個回合在手牌中翻面', () => {
    const g = newGame();
    const hc = give(g, 'WORK_030');
    nextRound(g);
    expect(hc.cardId).toBe('WORK_030t');
    nextRound(g);
    expect(hc.cardId).toBe('WORK_030');
  });
});

describe('選三次', () => {
  it('數字運算師可以選三次（可以重複）', () => {
    const g = newGame();
    const hc = give(g, 'WORK_025');
    g.apply({ type: 'play', handUid: hc.uid });
    for (let i = 0; i < 3; i++) g.apply({ type: 'choose', index: 0 });
    const m = g.s.players[0].board.find((x) => x.cardId === 'WORK_025')!;
    expect(g.atkOf(m)).toBe(2 + 6);
    expect(m.hp).toBe(1);
  });
});

describe('遊客', () => {
  it('德魯伊遊客可以放進德魯伊套牌，並讓套牌可以放戰士卡', () => {
    const hamm = getCard('VAC_340');
    expect(hamm.tourist).toBe('DRUID');
    expect(cardAllowed(hamm, 'DRUID', false)).toBe(true);
    const warriorCard = getCard('EX1_606'); // 盾牌格擋
    expect(cardAllowed(warriorCard, 'DRUID', false)).toBe(false);
    expect(cardAllowed(warriorCard, 'DRUID', false, ['VAC_340'])).toBe(true);
  });

  it('一副套牌最多一張遊客', () => {
    const deck = { id: 'x', name: 'x', heroClass: 'HUNTER' as const, freeform: false, cards: ['VAC_957', 'WORK_013', ...Array(28).fill(WISP)] };
    expect(validateDeck(deck).errors.some((e) => e.includes('遊客'))).toBe(true);
  });
});

describe('各種卡牌', () => {
  it('艾杜拉：打出 3 張其他職業的卡完成支線任務，發現兩件戰利品', () => {
    const g = newGame(1, 'ROGUE');
    const p = g.s.players[0];
    play(g, 'VAC_464');
    for (let i = 0; i < 3; i++) play(g, 'CS2_029', { target: g.s.players[1].hero.uid }); // 火球術（法師）
    expect(p.hand.filter((h) => h.cardId.startsWith('VAC_464t')).length).toBe(2);
  });

  it('葛利夫塔：你得到真品，對手得到贗品', () => {
    const g = newGame();
    play(g, 'VAC_959');
    const mine = g.s.players[0].hand.at(-1)!.cardId;
    const theirs = g.s.players[1].hand.at(-1)!.cardId;
    expect(mine).toMatch(/^VAC_959t\d+t$/);
    expect(theirs).toBe(mine.slice(0, -1));
  });

  it('剁麥者：兩片麵包把中間的手下夾成三明治', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.hand = [];
    give(g, 'VAC_525t1');
    give(g, WISP);
    give(g, FILLER);
    play(g, 'VAC_525'); // 戰吼：再一片麵包
    const sw = p.hand.find((h) => h.cardId === 'VAC_525t2')!;
    expect(sw.packed).toEqual([WISP, FILLER]);
    expect(p.hand.some((h) => h.cardId === 'VAC_525t1')).toBe(false);
    g.apply({ type: 'play', handUid: sw.uid });
    expect(p.board.map((m) => m.cardId)).toEqual([WISP, FILLER]);
  });

  it('行李箱蠕蟲：把牌堆頂 2 張牌打包，打開時拿回來', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.deck.push(g.newHandCard(WISP), g.newHandCard('CS2_029'));
    play(g, 'VAC_935');
    const suit = p.hand.find((h) => h.cardId === 'VAC_935t')!;
    expect(suit.packed).toEqual(['CS2_029', WISP]);
    expect(g.liveDef(0, suit)?.text).toContain(getCard(WISP).name);
    g.apply({ type: 'play', handUid: suit.uid });
    expect(p.hand.some((h) => h.cardId === WISP)).toBe(true);
  });

  it('調酒師：調製一瓶有兩種效果的 1 費藥水', () => {
    const g = newGame();
    play(g, 'VAC_523');
    const potion = g.s.players[0].hand.at(-1)!;
    expect(potion.cardId).toBe('VAC_523t');
    expect(potion.potion).toHaveLength(2);
    expect(g.costOf(g.s.players[0], potion)).toBe(1);
  });

  it('卡瑞絲：在手牌中施放兩種法術派系後變形', () => {
    const g = newGame();
    const c = give(g, 'VAC_449');
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid }); // 火焰
    expect(c.cardId).toBe('VAC_449');
    play(g, 'CS2_024', { target: g.s.players[1].hero.uid }); // 冰霜
    expect(c.cardId).toBe('VAC_449t6'); // 對敵方英雄造成 6 點傷害 + 凍結三個敵方手下
  });

  it('海關執法者：敵方不是一開始就在牌堆中的卡消耗增加 (2)', () => {
    const g = newGame();
    put(g, 'VAC_440', 1);
    const fresh = give(g, WISP);
    expect(g.costOf(g.s.players[0], fresh)).toBe(2);
    const p = g.s.players[0];
    const start = p.hand.find((h) => h.starting)!;
    expect(g.costOf(p, start)).toBe(getCard(start.cardId).cost);
  });

  it('潮汐之王：雙方的法術消耗為 (5)，直到下個回合結束', () => {
    const g = newGame();
    play(g, 'VAC_524');
    const fb = give(g, 'CS2_029');
    expect(g.costOf(g.s.players[0], fb)).toBe(5);
    g.apply({ type: 'endTurn' });
    const foe = g.s.players[1];
    const sp = g.newHandCard('CS2_029');
    foe.hand.push(sp);
    expect(g.costOf(foe, sp)).toBe(5);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.costOf(foe, sp)).toBe(4);
  });

  it('琳尼莎：消耗 (2) 以下的法術施放兩次', () => {
    const g = newGame();
    put(g, 'VAC_507', 0);
    const foe = g.s.players[1].hero;
    play(g, 'CS2_024', { target: foe.uid }); // 寒冰箭 (2)：3 點 ×2
    expect(foe.hp).toBe(24);
  });

  it('章魚按摩師：對手下造成八倍傷害', () => {
    const g = newGame();
    const o = put(g, 'VAC_936', 0);
    const t = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: o.uid, target: t.uid });
    expect(g.s.players[1].board).not.toContain(t);
  });

  it('龍族佳餚：每次最多受到 1 點傷害', () => {
    const g = newGame();
    const d = put(g, 'VAC_527', 1);
    const y = put(g, FILLER, 0);
    g.apply({ type: 'attack', attacker: y.uid, target: d.uid }); // 4 點傷害（具法術免疫，不能用法術指定）
    expect(d.hp).toBe(5);
  });

  it('融化元素：永久被凍結，無法攻擊', () => {
    const g = newGame();
    const m = put(g, 'VAC_328', 0);
    expect(g.canAttack(m.uid)).toBe(false);
  });

  it('海邊巨人：每使用一次地點牌消耗減少 (2)', () => {
    const g = newGame();
    const hc = give(g, 'VAC_439');
    g.s.players[0].paradise = { locationsUsed: 2 };
    expect(g.costOf(g.s.players[0], hc)).toBe(6);
  });

  it('點燈人：連續打出元素的回合數越多，傷害越高', () => {
    const g = newGame();
    g.s.players[0].paradise = { elementalStreak: 2 };
    const foe = g.s.players[1].hero;
    play(g, 'VAC_442', { target: foe.uid });
    expect(foe.hp).toBe(27);
  });

  it('懸崖跳水：從牌堆召喚的手下有突襲，回合結束時回到牌堆', () => {
    const g = newGame();
    const p = g.s.players[0];
    const deck = p.deck.length;
    play(g, 'VAC_926');
    expect(p.board).toHaveLength(2);
    expect(p.board.every((m) => m.keywords.includes('RUSH'))).toBe(true);
    g.apply({ type: 'endTurn' });
    expect(p.board).toHaveLength(0);
    expect(p.deck.length).toBe(deck);
  });

  it('聖亞瑟爾：攻擊後變成地點牌，使用後變回手下', () => {
    const g = newGame();
    const p = g.s.players[0];
    const s = put(g, 'VAC_923', 0);
    const t = put(g, WISP, 1);
    g.apply({ type: 'attack', attacker: s.uid, target: t.uid });
    expect(p.board).not.toContain(s);
    expect(p.locations?.[0].cardId).toBe('VAC_923t');
    const ally = put(g, FILLER, 0);
    p.locations![0].cooldown = 0;
    g.apply({ type: 'location', uid: p.locations![0].uid, target: ally.uid });
    expect(g.atkOf(ally)).toBe(7);
    expect(p.locations).toHaveLength(0);
    expect(p.board.some((m) => m.cardId === 'VAC_923')).toBe(true);
  });

  it('衝浪足類：抽到的下一張法術會在抽到時施放', () => {
    const g = newGame();
    const p = g.s.players[0];
    play(g, 'VAC_443');
    p.deck.push(g.newHandCard('CS2_023')); // 秘法智慧
    const n = p.hand.length;
    g.apply({ type: 'play', handUid: give(g, 'CS2_023').uid }); // 抽 2：第一張是秘法智慧，抽到時施放
    expect(p.hand.length).toBeGreaterThanOrEqual(n + 2);
  });

  it('飢餓的哈姆：回合結束時吃掉敵方牌堆的手下', () => {
    const g = newGame();
    const h = put(g, 'VAC_340', 0);
    const deck = g.s.players[1].deck.length;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].deck.length).toBe(deck - 1 - 1); // 吃掉一張，對手回合開始再抽一張
    expect(g.atkOf(h)).toBe(5);
  });

  it('細則：對所有手下造成 4 點傷害，溢出傷害擊中你的英雄', () => {
    const g = newGame();
    put(g, WISP, 1);
    put(g, WISP, 1);
    const hp = g.s.players[0].hero.hp;
    play(g, 'WORK_008');
    expect(g.s.players[0].hero.hp).toBe(hp - 6);
  });

  it('燒烤：溢出傷害變成手牌中手下的屬性值', () => {
    const g = newGame();
    const t = put(g, WISP, 1);
    const p = g.s.players[0];
    p.hand = [];
    const m = give(g, FILLER);
    play(g, 'VAC_526', { target: t.uid });
    expect(m.atkBuff).toBe(6);
    expect(m.hpBuff).toBe(6);
  });

  it('A.F.凱：回合結束時，沒有攻擊的友方手下 +2/+2', () => {
    const g = newGame();
    put(g, 'VAC_446', 0);
    const a = put(g, FILLER, 0);
    g.apply({ type: 'endTurn' });
    expect(g.atkOf(a)).toBe(6);
  });

  it('瞌睡的動物管理員：為對手召喚的 8/8 野獸攻擊對手的手下', () => {
    const g = newGame();
    const f = put(g, FILLER, 1);
    play(g, 'VAC_421');
    expect(g.s.players[1].board).not.toContain(f);
    expect(g.s.players[1].board.some((m) => m.cardId === 'VAC_421t')).toBe(true);
  });

  it('笨拙的服務員：抽到的牌變成暫時的', () => {
    const g = newGame();
    put(g, 'WORK_040', 0);
    g.apply({ type: 'endTurn' });
    const drawn = g.s.players[1].hand.at(-1)!;
    expect(drawn.temporary).toBe(true);
  });

  it('小心輕放的熊：每個回合在手牌中 +1/+1', () => {
    const g = newGame();
    play(g, 'WORK_024');
    const bear = g.s.players[0].hand.find((h) => h.cardId === 'WORK_024t')!;
    nextRound(g);
    expect(g.handStats(0, bear)).toEqual({ atk: 4, hp: 4 });
  });

  it('新高度：法力水晶上限增加 3，獲得一個空的法力水晶', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.maxMana = 10;
    play(g, 'VAC_949');
    expect(p.maxMana).toBe(11);
    expect(g.manaCap(p)).toBe(13);
  });

  it('食物大戰：主菜死亡時，你從牌堆召喚一個手下', () => {
    const g = newGame();
    play(g, 'VAC_533');
    const entree = g.s.players[1].board.find((m) => m.cardId === 'VAC_533t')!;
    expect(entree).toBeTruthy();
    play(g, 'CS2_029', { target: entree.uid });
    expect(g.s.players[0].board.some((m) => m.cardId === FILLER)).toBe(true);
  });

  it('艾蘭娜：在你的回合，你的英雄受到的傷害轉移到隨機敵人', () => {
    const g = newGame();
    put(g, 'VAC_501', 0);
    const hp = g.s.players[0].hero.hp;
    play(g, 'CS2_062'); // 地獄烈焰
    expect(g.s.players[0].hero.hp).toBe(hp);
  });

  it('所有卡牌都能打出、不會出錯（抽樣不同種子）', () => {
    const ids = ALL_CARDS().filter((c) => c.collectible && c.set === 1905).map((c) => c.id);
    for (const [i, id] of ids.entries()) {
      const g = newGame(i + 1);
      put(g, FILLER, 1);
      put(g, WISP, 0);
      const hc = give(g, id);
      const req = g.playTargetReq(hc.uid);
      const targets = req ? g.validTargets(req, 0, getCard(id).type === 'SPELL') : [];
      g.apply({ type: 'play', handUid: hc.uid, target: targets[0], option: getCard(id).chooseOne ? 0 : undefined });
      for (let k = 0; k < 10 && g.s.pendingChoice; k++) g.apply({ type: 'choose', index: 0 });
      g.apply({ type: 'endTurn' });
      g.apply({ type: 'endTurn' });
    }
  });
});
