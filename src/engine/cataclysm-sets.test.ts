// 大災變：預兆、巨型、碎裂、符印、地脈等新機制與卡牌的測試
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
const kill = (m: Minion) => {
  m.hp = 0;
  m.dead = true;
};
const pass = (g: Game) => {
  g.apply({ type: 'endTurn' });
  g.apply({ type: 'endTurn' });
};

describe('預兆', () => {
  it('預兆：召喚你職業的士兵，士兵的效果隨預兆次數翻倍', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const me = g.s.players[0];
    play(g, 'CATA_580'); // 浩劫戰斧（武器）：戰吼預兆
    expect(me.heralds).toBe(1);
    expect(board(g, 0)).toEqual(['CATA_580t']);
    const soldier = me.board[0];
    const foe = g.s.players[1].hero;
    kill(soldier);
    pass(g);
    expect(foe.hp).toBe(30 - 2); // 預兆 1 次：2 點傷害
    me.heralds = 2;
    const s2 = put(g, 'CATA_580t', 0);
    kill(s2);
    pass(g);
    expect(foe.hp).toBe(30 - 2 - 4);
    me.heralds = 4;
    const s3 = put(g, 'CATA_580t', 0);
    kill(s3);
    pass(g);
    expect(foe.hp).toBe(30 - 2 - 4 - 8);
  });

  it('灼燒劫毀者：預兆並賦予士兵衝刺', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g, 'CATA_160');
    const soldier = g.s.players[0].board.find((m) => m.cardId === 'CATA_580t')!;
    expect(g.hasKw(soldier, 'RUSH')).toBe(true);
  });

  it('各職業的士兵：奧拉基爾、艾薩拉、賽絲特拉、奧妮克希亞、丘加利', () => {
    // 薩滿：相鄰手下 +1 攻擊力
    const g = newGame({ classes: ['SHAMAN', 'MAGE'] });
    const a = put(g, FILLER, 0);
    play(g, 'CATA_565');
    expect(g.atkOf(a)).toBeGreaterThanOrEqual(4);
    // 惡魔獵人：士兵被召喚時給英雄 +1 攻擊力
    const g2 = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    play(g2, 'CATA_525');
    expect(g2.s.players[0].hero.tempAtk).toBe(1);
    // 盜賊：士兵被召喚時獲得一張其他職業的法術
    const g3 = newGame({ classes: ['ROGUE', 'MAGE'] });
    g3.s.players[0].hand = [];
    play(g3, 'CATA_158t'.replace('CATA_158t', 'CATA_722')); // 終焉使者：預兆
    expect(g3.s.players[0].hand.length).toBe(1);
    // 死亡騎士：獲得一張消耗為生命值的 2 費手下
    const g4 = newGame({ classes: ['DEATHKNIGHT', 'MAGE'] });
    g4.s.players[0].hand = [];
    play(g4, 'CATA_780');
    expect(g4.s.players[0].hand.some((h) => h.healthCostUntil === g4.s.turn)).toBe(true);
    // 術士：士兵在回合結束時摧毀右邊的手下並獲得 +2/+2
    const g5 = newGame({ classes: ['WARLOCK', 'MAGE'] });
    play(g5, 'CATA_725');
    const sol = g5.s.players[0].board.find((m) => m.cardId === 'CATA_725t')!;
    const right = put(g5, FILLER, 0);
    g5.apply({ type: 'endTurn' });
    expect(g5.s.players[0].board.includes(right)).toBe(false);
    expect(g5.atkOf(sol)).toBe(3);
  });

  it('實驗性活化：預兆並對全部敵方手下造成 4 點傷害；奧特拉賽恩降低死亡之翼消耗', () => {
    const g = newGame({ classes: ['DEATHKNIGHT', 'MAGE'] });
    const foe = put(g, FILLER, 1);
    g.s.players[0].corpses = 0;
    const hc = give(g, 'CATA_156');
    g.apply({ type: 'play', handUid: hc.uid });
    expect(foe.hp).toBe(1);
    expect(g.s.players[0].heralds).toBe(1);
  });
});

describe('巨型', () => {
  it('拉格納羅斯：附肢在兩側，回合結束時觸發全部亡語', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    play(g, 'CATA_150');
    expect(board(g, 0)).toEqual(['CATA_150t', 'CATA_150', 'CATA_150t1']);
    const foe = g.s.players[1].hero;
    g.apply({ type: 'endTurn' });
    expect(foe.hp).toBe(30 - 4); // 兩隻手的亡語各 2 點
  });

  it('藤牙：四條腿，腿成長時本體也成長', () => {
    const g = newGame({ classes: ['DRUID', 'MAGE'] });
    play(g, 'CATA_139');
    expect(g.s.players[0].board.length).toBe(5);
    const body = g.s.players[0].board.find((m) => m.cardId === 'CATA_139')!;
    const atk = g.atkOf(body);
    g.apply({ type: 'endTurn' });
    expect(g.atkOf(body)).toBe(atk + 4);
  });

  it('放不下的附肢：場上空間不足時只召喚放得下的', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    for (let i = 0; i < 5; i++) put(g, FILLER, 0);
    play(g, 'CATA_150');
    expect(g.s.players[0].board.length).toBe(7);
  });

  it('克洛瑪圖斯：四個頭死亡時移除對應的關鍵字', () => {
    const g = newGame({ classes: ['PALADIN', 'MAGE'] });
    play(g, 'CATA_432');
    const body = g.s.players[0].board.find((m) => m.cardId === 'CATA_432')!;
    expect(g.hasKw(body, 'TAUNT')).toBe(true);
    const head = g.s.players[0].board.find((m) => m.cardId === 'CATA_432t1')!;
    kill(head);
    pass(g);
    expect(g.hasKw(body, 'TAUNT')).toBe(false);
    expect(g.hasKw(body, 'LIFESTEAL')).toBe(true);
  });

  it('熔喉：放不下的附肢之後有空間時再召喚', () => {
    const g = newGame({ classes: ['HUNTER', 'MAGE'] });
    const me = g.s.players[0];
    put(g, FILLER, 0);
    put(g, FILLER, 0);
    play(g, 'CATA_550');
    expect(me.board.length).toBe(7); // 本體 + 4 條附肢
    const body = me.board.find((m) => m.cardId === 'CATA_550')!;
    expect(body.pendingLimbs?.length).toBe(2);
    kill(me.board.find((m) => m.cardId === 'CATA_550t')!);
    g.apply({ type: 'endTurn' });
    expect(body.pendingLimbs?.length).toBe(1);
    expect(me.board.length).toBe(7);
  });

  it('艾薩拉、復生的奧妮克希亞、賽絲特拉的被動效果', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'MAGE'] });
    play(g, 'CATA_151');
    expect(g.maxAttacks(g.s.players[0].hero)).toBe(2);
    const g2 = newGame({ classes: ['DEATHKNIGHT', 'MAGE'] });
    play(g2, 'CATA_155');
    const hero = g2.s.players[0].hero;
    play(g2, 'CS2_029', hero.uid);
    expect(hero.hp).toBe(30);
    expect(hero.maxHp).toBe(36);
    expect(hero.hp).toBeLessThan(hero.maxHp);
    const g3 = newGame({ classes: ['ROGUE', 'MAGE'] });
    play(g3, 'CATA_154');
    const foe = put(g3, FILLER, 1);
    foe.maxHp = foe.hp = 20;
    play(g3, 'CS2_029', foe.uid); // 法師法術（其他職業）施放兩次
    expect(foe.hp).toBe(20 - 12);
  });

  it('弗坎諾斯：回合結束時對其他手下造成 3 點傷害，熱柱受傷時獲得火焰法術', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'CATA_488');
    const foe = put(g, FILLER, 1);
    const hand = g.s.players[0].hand.length;
    g.apply({ type: 'endTurn' });
    expect(foe.hp).toBe(2);
    expect(g.s.players[0].hand.length).toBeGreaterThan(hand);
  });
});

describe('碎裂', () => {
  it('抽到碎裂卡牌時，分成兩半放在手牌的最左與最右', () => {
    const g = newGame({ classes: ['DRUID', 'MAGE'] });
    const me = g.s.players[0];
    me.hand = [g.newHandCard(FILLER), g.newHandCard(FILLER), g.newHandCard(FILLER)];
    me.deck.push(g.newHandCard('CATA_134'));
    pass(g);
    expect(me.hand[0].cardId).toBe('CATA_134t');
    expect(me.hand[me.hand.length - 1].cardId).toBe('CATA_134t2');
    expect(me.hand.length).toBe(5);
  });

  it('兩半重新相鄰時合併成完整的卡牌', () => {
    const g = newGame({ classes: ['DRUID', 'MAGE'] });
    const me = g.s.players[0];
    me.hand = [g.newHandCard(FILLER)];
    me.deck.push(g.newHandCard('CATA_134'));
    pass(g);
    expect(me.hand.map((h) => h.cardId)).toEqual(['CATA_134t', FILLER, 'CATA_134t2']);
    me.mana = 10;
    g.apply({ type: 'play', handUid: me.hand[1].uid });
    expect(me.hand.map((h) => h.cardId)).toEqual(['CATA_134']);
  });

  it('各個碎裂卡牌的兩半與合併後的效果', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const foe = put(g, FILLER, 1);
    foe.maxHp = foe.hp = 20;
    play(g, 'CATA_489t', foe.uid); // 秘法湧流（半張）：4 點傷害
    expect(foe.hp).toBe(16);
    play(g, 'CATA_489', foe.uid); // 完整：4 點 + 全部敵人 2 點
    expect(foe.hp).toBe(16 - 4 - 2);
    const g2 = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    play(g2, 'CATA_479');
    expect(board(g2, 0).filter((c) => c === 'CATA_479t3').length).toBe(2);
    const drake = g2.s.players[0].board[0];
    expect(g2.hasKw(drake, 'DIVINE_SHIELD')).toBe(true);
    expect(g2.atkOf(drake)).toBe(5);
  });
});

describe('符印、地脈與雜項機制', () => {
  it('海洋符印：在你的下個回合開始時召喚 3/3 嘲諷納迦', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    play(g, 'CATA_528');
    expect(board(g, 0)).toEqual([]);
    pass(g);
    expect(board(g, 0)).toEqual(['CATA_528t']);
  });

  it('費伍德樹人：在手牌中時花費 4 點法力，法力水晶是永久的', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    const t = give(g, 'CATA_131');
    me.maxMana = 8;
    me.mana = 8;
    play(g, FILLER);
    me.maxMana = 8;
    me.mana = 8;
    t.spent = 4;
    g.apply({ type: 'play', handUid: t.uid });
    expect(me.maxMana).toBe(9);
    const t2 = give(g, 'CATA_131');
    me.maxMana = 5;
    me.mana = 5;
    g.apply({ type: 'play', handUid: t2.uid });
    expect(me.maxMana).toBe(5);
    expect(me.mana).toBe(5 - 2 + 1);
  });

  it('龍巢看守者：在手牌中花費 8 點法力就召喚幼龍，否則獲得', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [];
    play(g, 'CATA_132');
    expect(me.hand.filter((h) => h.cardId === 'CATA_132t').length).toBe(2);
    const b = give(g, 'CATA_132');
    b.spent = 8;
    g.apply({ type: 'play', handUid: b.uid });
    expect(board(g, 0).filter((c) => c === 'CATA_132t').length).toBe(2);
  });

  it('晶脊幼獸：花光最後一顆法力水晶時獲得 +1/+1', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const cub = put(g, 'CATA_130', 0);
    const me = g.s.players[0];
    const hc = give(g, 'CS2_168');
    me.mana = getCard('CS2_168').cost;
    g.apply({ type: 'play', handUid: hc.uid });
    expect(g.atkOf(cub)).toBe(2);
  });

  it('地脈：強化、額外觸發次數與消耗減少', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    const foe = put(g, FILLER, 1);
    foe.maxHp = foe.hp = 3;
    const hero = g.s.players[1].hero;
    play(g, 'MEND_500'); // 爆發地脈：4 點傷害，溢出打英雄
    expect(hero.hp).toBe(29);
    play(g, 'MEND_506'); // 秘符刃豹：強化 +1
    expect(me.leyline?.bonus).toBe(1);
    const l = give(g, 'MEND_504');
    play(g, 'MEND_501'); // 地脈行者：消耗減少 (1)
    expect(g.costOf(me, l)).toBe(1);
    me.hand = [];
    play(g, 'MEND_503'); // 額外觸發
    play(g, 'MEND_504');
    expect(me.hand.length).toBe(2);
    for (const h of me.hand) expect(h.costMod).toBe(-2);
  });

  it('動物夥伴被取代為消耗更高的隨機野獸', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g, 'MEND_300');
    play(g, 'NEW1_031');
    const m = g.s.players[0].board[g.s.players[0].board.length - 1];
    expect(getCard(m.cardId).cost).toBe(4);
    expect(getCard(m.cardId).races).toContain('BEAST');
    play(g, 'MEND_304');
    const n = g.s.players[0].board.length;
    play(g, 'NEW1_031');
    expect(g.s.players[0].board.length).toBe(n + 2);
  });

  it('銀白之手新兵的永久加成', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const r = put(g, 'CS2_101t', 0);
    play(g, 'MEND_803');
    expect(g.atkOf(r)).toBe(2);
    expect(r.hp).toBe(2);
    const r2 = put(g, 'CS2_101t', 0);
    expect(g.atkOf(r2)).toBe(2);
    play(g, 'MEND_804');
    expect(g.atkOf(r)).toBe(4);
    expect(g.hasKw(r, 'TAUNT')).toBe(true);
  });

  it('指揮官迦頓 / 沙怒光環 / 傑爾賓的凱旋', () => {
    const g = newGame({ classes: ['WARRIOR', 'MAGE'] });
    const me = g.s.players[0];
    play(g, 'CATA_591');
    expect(me.geddon).toBe(true);
    const deck = me.deck.length;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.pendingChoice).toBeTruthy();
    g.apply({ type: 'choose', index: 0 });
    expect(me.deck.length).toBe(deck - 3);
    const g2 = newGame({ classes: ['PALADIN', 'MAGE'] });
    play(g2, 'CATA_480');
    expect(g2.s.players[0].doubleEotUntil).toBeGreaterThan(g2.s.turn);
    const g3 = newGame({ classes: ['PALADIN', 'MAGE'] });
    g3.s.players[0].hand = [];
    play(g3, 'CATA_621');
    expect(g3.s.players[0].hand.length).toBe(1);
    expect(g3.s.players[0].hand[0].counter).toBe(1);
  });
});

describe('德魯伊與獵人', () => {
  it('苔蘚之絆：花光法力賦予魔像 +1/+1 每點；艾薩拉的凱旋：洗入體質加倍的大型手下', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    const hc = give(g, 'CATA_135');
    me.mana = 6;
    g.apply({ type: 'play', handUid: hc.uid });
    expect(me.mana).toBe(0);
    const golems = me.board.filter((m) => m.cardId === 'CATA_135t');
    expect(golems.length).toBe(2);
    expect(g.atkOf(golems[0])).toBe(1 + 4);
    const g2 = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const deck = g2.s.players[0].deck.length;
    play(g2, 'CATA_136');
    expect(g2.s.players[0].deck.length).toBe(deck + 5);
    const big = g2.s.players[0].deck.find((h) => h.atkBuff > 0 || h.hpBuff > 0)!;
    expect(getCard(big.cardId).cost).toBeGreaterThanOrEqual(8);
    expect(big.hpBuff).toBe(getCard(big.cardId).health);
  });

  it('麥琳瑟拉：用隨機的龍填滿手牌', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [];
    play(g, 'CATA_140');
    expect(me.hand.length).toBe(10);
    expect(me.hand.every((h) => getCard(h.cardId).races?.includes('DRAGON'))).toBe(true);
  });

  it('年邁的荒野語者 / 心根石：上回合沒有打出手下', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    const hc = give(g, 'MEND_041');
    me.mana = 7;
    me.maxMana = 9;
    g.s.turn = 5;
    me.minionPlayedTurn = 1;
    g.apply({ type: 'play', handUid: hc.uid });
    expect(me.mana).toBe(5 + 0);
    const g2 = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const hand = g2.s.players[0].hand.length;
    g2.s.turn = 5;
    play(g2, 'MEND_043');
    expect(g2.s.players[0].hero.armor).toBe(6);
    expect(g2.s.players[0].hand.length).toBe(hand + 2);
  });

  it('灰燼蟲：休眠，戰場滿了就甦醒', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    for (let i = 0; i < 5; i++) put(g, FILLER, 0);
    play(g, 'MEND_040');
    const worm = g.s.players[0].board.find((m) => m.cardId === 'MEND_040')!;
    expect(g.hasKw(worm, 'DORMANT')).toBe(true);
    play(g, FILLER);
    expect(g.s.players[0].board.length).toBe(7);
    expect(g.hasKw(worm, 'DORMANT')).toBe(false);
  });

  it('巴珊娜與培育妖精：雕刻自然法術、綻放球莖', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [];
    play(g, 'MEND_046');
    expect(me.hand.filter((h) => h.cardId === 'MEND_046t').length).toBe(3);
    expect(me.hand.every((h) => (h.carved?.length ?? 0) > 0)).toBe(true);
    me.hand = [];
    play(g, 'MEND_100');
    expect(me.hand[0].cardId).toBe('MEND_100t');
    const bulb = me.hand[0];
    bulb.counter = 2;
    const n = g.s.players[0].hand.length;
    g.apply({ type: 'play', handUid: bulb.uid });
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(n - 1);
  });

  it('石爪打擊者：在手中時打出龍，變成 6/6 的龍', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    const st = give(g, 'CATA_551');
    play(g, 'CATA_132'); // 龍巢看守者（龍）
    expect(st.cardId).toBe('CATA_551t');
    expect(me.hand.includes(st)).toBe(true);
  });

  it('面對托維爾 / 希瓦娜斯的凱旋 / 大地咆哮 / 黯鱗斥候', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'CS2_168'); // 1 費魚人
    me.board = [];
    play(g, 'CATA_560');
    expect(board(g, 0)).toEqual(['CS2_168']);
    const foe = put(g, FILLER, 1);
    foe.maxHp = foe.hp = 10;
    play(g, 'CATA_557', foe.uid);
    expect(foe.hp).toBe(7);
    const foeHero = g.s.players[1].hero;
    play(g, 'CATA_557', foe.uid);
    expect(foe.hp).toBe(4);
    expect(foeHero.hp).toBe(27);
    play(g, 'CATA_554', foe.uid);
    expect(foe.hp).toBe(1);
    const scout = give(g, 'CATA_552');
    g.apply({ type: 'play', handUid: scout.uid, target: foeHero.uid });
    expect(foeHero.hp).toBe(27 - 4);
  });

  it('荒地先鋒：分傷害，若有死亡再來 3 點', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const hero = g.s.players[1].hero;
    const m = put(g, 'CS2_168', 1);
    m.hp = 1;
    play(g, 'MEND_302');
    expect(hero.hp + m.hp).toBeLessThanOrEqual(30 + 1 - 3 - 1);
  });

  it('托維爾雕刻者：在你的回合開始時降低手牌消耗', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [];
    const card = give(g, FILLER);
    play(g, 'CATA_566');
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    pass(g);
    expect(card.costMod).toBe(-1);
  });
});

describe('法師與牧師', () => {
  it('卡雷克 / 戰場轟擊手：法術獲得法術傷害', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    const spell = give(g, 'CS2_029');
    play(g, 'CATA_458');
    expect(spell.spellPower).toBe(1);
    const hero = g.s.players[1].hero;
    g.apply({ type: 'play', handUid: spell.uid, target: hero.uid });
    expect(hero.hp).toBe(30 - 7);
    expect(me.deck.some((h) => h.spellPower === 1) || !me.deck.some((h) => getCard(h.cardId).type === 'SPELL')).toBe(true);
  });

  it('不穩定的施法者 / 喚雨者 / 織法者的光輝', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const rain = put(g, 'CATA_487', 0);
    const hero = g.s.players[1].hero;
    play(g, 'CS2_029', hero.uid);
    expect(g.atkOf(rain)).toBe(3);
    play(g, 'CS2_029', hero.uid);
    expect(g.atkOf(rain)).toBe(3);
    const w = give(g, 'CATA_452');
    expect(g.costOf(g.s.players[0], w)).toBe(10 - 12 < 0 ? 0 : 10 - 12);
    const n = g.s.players[0].board.length;
    play(g, 'CATA_483');
    expect(g.s.players[0].board.length).toBe(n + 2);
  });

  it('辛德拉苟莎的凱旋 / 召喚專家 / 冬泉谷幼龍', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const me = g.s.players[0];
    const foe = put(g, 'CS2_168', 1);
    me.hand = [g.newHandCard('CS2_029')];
    play(g, 'CATA_978', foe.uid);
    expect(me.hand.some((h) => h.costMod < 0)).toBe(true);
    me.hand = [g.newHandCard('CS2_029')];
    play(g, 'CATA_979');
    expect(me.hand.length).toBe(2);
    expect(me.hand.every((h) => getCard(h.cardId).cost === 4)).toBe(true);
    play(g, 'CATA_484');
    expect(g.s.pendingChoice).toBeTruthy();
    g.apply({ type: 'choose', index: 0 });
  });

  it('黑血：治療後攻擊隨機敵方手下；憤怒的族母；麥迪文的凱旋', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    play(g, 'CATA_300');
    const foe = put(g, FILLER, 1);
    foe.maxHp = foe.hp = 20;
    g.s.players[0].hero.hp = 20;
    g.s.players[0].mana = 2;
    expect(g.apply({ type: 'heroPower', target: g.s.players[0].hero.uid })).toBe(true);
    expect(foe.hp).toBeLessThan(20);
    const g2 = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const matri = put(g2, 'CATA_305', 0);
    g2.apply({ type: 'endTurn' });
    expect(matri.maxHp).toBe(6);
    const spell = g2.newHandCard('CATA_308');
    g2.s.players[1].hand = [spell];
    expect(g2.costOf(g2.s.players[1], spell)).toBe(5);
    put(g2, 'EX1_562', 1);
    expect(g2.costOf(g2.s.players[1], spell)).toBe(1);
  });

  it('雅立史卓莎：生命值設為 15，回滿時對對手造成 15 點傷害', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'CATA_307');
    expect(me.hero.hp).toBe(15);
    me.hero.hp = 29;
    const hero = g.s.players[1].hero;
    me.mana = 2;
    expect(g.apply({ type: 'heroPower', target: me.hero.uid })).toBe(true);
    expect(me.hero.hp).toBe(30);
    expect(hero.hp).toBe(15);
  });

  it('淨化教士：治療效果多恢復 2 點', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'CATA_216');
    me.hero.hp = 10;
    me.mana = 2;
    expect(g.apply({ type: 'heroPower', target: me.hero.uid })).toBe(true);
    expect(me.hero.hp).toBe(10 + 2 + 2);
  });

  it('暗影分裂（碎裂）', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const a = put(g, FILLER, 0);
    play(g, 'CATA_306', a.uid);
    expect(g.atkOf(a)).toBe(6);
    expect(g.hasKw(a, 'ELUSIVE')).toBe(true);
    expect(g.s.players[0].board.length).toBe(2);
  });
});
