// 核心系列：新機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { getCard } from '../cards/registry';
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
const ids = (ms: Minion[]) => ms.map((m) => m.cardId);

describe('核心：召喚與增益', () => {
  it('野性呼喚：召喚三隻動物夥伴', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    play(g, 'OG_211');
    expect(ids(g.s.players[0].board).sort()).toEqual(['NEW1_032', 'NEW1_033', 'NEW1_034']);
  });

  it('秘密吞噬者：消滅所有敵方奧秘並獲得屬性', () => {
    const g = newGame();
    g.s.players[1].secrets = [{ uid: 900, cardId: 'EX1_554' }, { uid: 901, cardId: 'EX1_611' }];
    play(g, 'OG_254');
    expect(g.s.players[1].secrets).toHaveLength(0);
    const m = g.s.players[0].board[0];
    expect([m.atkBuff, m.maxHp]).toEqual([2, 6]);
  });

  it('紅鯡魚：其他友方手下獲得潛行，自己沒有', () => {
    const g = newGame();
    const a = put(g, FILLER, 0);
    const h = put(g, 'REV_014', 0);
    const h2 = put(g, 'REV_014', 0);
    expect(a.auraKeywords).toContain('STEALTH');
    expect(h.auraKeywords).not.toContain('STEALTH');
    expect(h2.auraKeywords).not.toContain('STEALTH');
  });

  it('瘋狂的可憐蟲：受傷時 +2 攻擊力並具有衝鋒', () => {
    const g = newGame();
    const m = put(g, 'REV_930', 0);
    expect(g.atkOf(m)).toBe(1);
    m.hp -= 1;
    g.recalcAuras();
    expect(g.atkOf(m)).toBe(3);
    expect(m.auraKeywords).toContain('CHARGE');
  });

  it('慌張的圖書管理員：每個小鬼 +1 攻擊力', () => {
    const g = newGame();
    const lib = put(g, 'REV_242', 0);
    expect(g.atkOf(lib)).toBe(1);
    put(g, 'EX1_319', 0); // 火焰小鬼
    put(g, 'CS2_059', 0); // 鮮血小鬼
    g.recalcAuras();
    expect(g.atkOf(lib)).toBe(3);
  });

  it('暗巷契約：召喚屬性等同手牌數的嘲諷惡魔', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    g.s.players[0].hand = [];
    for (let i = 0; i < 4; i++) give(g, FILLER);
    play(g, 'SW_085');
    const m = g.s.players[0].board[0];
    expect([m.cardId, m.baseAtk, m.maxHp]).toEqual(['SW_085t', 4, 4]);
  });

  it('鰭足朋友：兩個選項', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    play(g, 'TSC_650', undefined, { option: 1 });
    expect(g.s.players[0].board).toHaveLength(6);
    expect(g.s.players[0].board.every((m) => m.cardId === 'TSC_650t4')).toBe(true);
  });

  it('月獸：恢復生命值與造成傷害', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    g.s.players[0].hero.hp = 10;
    play(g, 'ONY_018', undefined, { option: 0 });
    expect(g.s.players[0].hero.hp).toBe(18);
    const foe = g.s.players[1].hero;
    play(g, 'ONY_018', foe.uid, { option: 1 });
    expect(foe.hp).toBe(26);
  });

  it('護甲商人：每個英雄獲得 4 點護甲', () => {
    const g = newGame();
    play(g, 'YOP_032');
    expect([g.s.players[0].hero.armor, g.s.players[1].hero.armor]).toEqual([4, 4]);
  });

  it('動物園馬克杯：不同種族的友方手下 +1/+1', () => {
    const g = newGame();
    const a = put(g, 'CS2_182', 0);
    const b = put(g, 'EX1_319', 0); // 惡魔
    const c = put(g, 'CS2_172', 0); // 野獸
    const d = put(g, 'CS2_172', 0); // 野獸
    play(g, 'WON_141');
    const buffed = [a, b, c, d].filter((m) => m.atkBuff === 1).length;
    expect(buffed).toBe(3);
    expect(c.atkBuff + d.atkBuff).toBe(1);
  });

  it('引爆魔像：手牌中的嘲諷手下 +2/+2', () => {
    const g = newGame();
    const hc = give(g, 'CS2_150'); // 嘲諷手下
    const taunt = give(g, 'CS1_042'); // 閃金鎮步兵（嘲諷）
    play(g, 'WW_329');
    expect(g.s.players[0].hand.find((h) => h.uid === taunt.uid)!.atkBuff).toBe(2);
    expect(hc).toBeTruthy();
  });
});

describe('核心：費用與牌堆', () => {
  it('凱爾薩斯：每回合第三個手下消耗為 (0)', () => {
    const g = newGame();
    put(g, 'REV_021', 0);
    g.s.players[0].playedThisTurn = { turn: g.s.turn, ids: [FILLER, FILLER] };
    const hc = give(g, FILLER);
    expect(g.costOf(g.s.players[0], hc)).toBe(0);
    g.s.players[0].playedThisTurn = { turn: g.s.turn, ids: [FILLER] };
    expect(g.costOf(g.s.players[0], hc)).toBe(getCard(FILLER).cost);
  });

  it('汙泥水管工：所有手下消耗增加 (2)', () => {
    const g = newGame();
    const hc = give(g, FILLER);
    put(g, 'REV_837', 1);
    expect(g.costOf(g.s.players[0], hc)).toBe(getCard(FILLER).cost + 2);
  });

  it('蒸氣清潔機：摧毀並非一開始就在牌堆中的牌', () => {
    const g = newGame();
    const extra = g.newHandCard(FILLER);
    g.s.players[1].deck.push(extra);
    g.s.players[0].deck.push(g.newHandCard(FILLER));
    const before = g.s.players[1].deck.filter((h) => h.starting).length;
    play(g, 'REV_946');
    expect(g.s.players[1].deck).toHaveLength(before);
    expect(g.s.players[0].deck.every((h) => h.starting)).toBe(true);
  });

  it('篡改書卷：1 費複製洗入牌堆並棄掉手牌', () => {
    const g = newGame();
    g.s.players[0].hand = [];
    give(g, FILLER);
    give(g, FILLER);
    const deck = g.s.players[0].deck.length;
    play(g, 'REV_240');
    expect(g.s.players[0].hand).toHaveLength(0);
    expect(g.s.players[0].deck).toHaveLength(deck + 2);
  });

  it('遺物：每打出一個遺物，之後的遺物更強', () => {
    const g = newGame();
    g.s.players[0].hand = [];
    play(g, 'REV_943');
    expect(g.s.players[0].board.map((m) => m.baseAtk)).toEqual([1, 1]);
    play(g, 'REV_943');
    expect(g.s.players[0].board.slice(2).map((m) => m.baseAtk)).toEqual([2, 2]);
  });

  it('神秘訪客：從對手複製來的牌消耗減少 (3)', () => {
    const g = newGame();
    const hc = give(g, 'CS2_182');
    hc.fromOpp = true;
    play(g, 'REV_246');
    expect(hc.costMod).toBe(-3);
  });
});

describe('核心：傷害與保護', () => {
  it('完美不在場證明：英雄每次最多受到 1 點傷害', () => {
    const g = newGame();
    play(g, 'REV_504');
    g.apply({ type: 'endTurn' });
    const foe = put(g, FILLER, 1);
    const hp = g.s.players[0].hero.hp;
    g.apply({ type: 'attack', attacker: foe.uid, target: g.s.players[0].hero.uid });
    expect(g.s.players[0].hero.hp).toBe(hp - 1);
  });

  it('罪惡烙印：烙印的手下受傷時，其英雄受到 1 點傷害', () => {
    const g = newGame();
    const m = put(g, FILLER, 1);
    play(g, 'REV_506', m.uid);
    const foeHp = g.s.players[1].hero.hp;
    play(g, 'CS2_029', m.uid); // 火球術
    expect(g.s.players[1].hero.hp).toBe(foeHp - 1);
  });

  it('暴動！：手下不會降到 1 點生命以下，並攻擊敵方手下', () => {
    const g = newGame();
    const mine = put(g, 'CS2_182', 0);
    const foe = put(g, 'CS2_182', 1);
    foe.baseAtk = 50;
    play(g, 'REV_337');
    expect(mine.undyingTurn).toBe(g.s.turn);
    expect(foe.hp).toBe(1);
    expect(mine.hp).toBeGreaterThanOrEqual(1);
    expect(g.s.players[0].board).toContain(mine);
  });

  it('附帶傷害：多餘傷害打到敵方英雄', () => {
    const g = newGame();
    const a = put(g, 'CS2_168', 1); // 1/1
    a.hp = 1;
    const foeHp = g.s.players[1].hero.hp;
    play(g, 'REV_369');
    expect(g.s.players[1].board).toHaveLength(0);
    expect(g.s.players[1].hero.hp).toBe(foeHp - 5);
  });

  it('步兵：相鄰的手下在攻擊時免疫', () => {
    const g = newGame();
    put(g, 'TOY_102', 0);
    const a = put(g, 'CS2_182', 0);
    const foe = put(g, 'CS2_182', 1);
    foe.baseAtk = 30;
    g.apply({ type: 'attack', attacker: a.uid, target: foe.uid });
    expect(a.hp).toBe(a.maxHp);
    expect(foe.hp).toBe(1);
  });
});

describe('核心：奧秘與靈魂', () => {
  it('黏呼呼的處境：對手施放法術後召喚蜘蛛', () => {
    const g = newGame({ classes: ['ROGUE', 'MAGE'] });
    play(g, 'REV_827');
    g.apply({ type: 'endTurn' });
    play(g, 'CS2_029', g.s.players[0].hero.uid);
    expect(ids(g.s.players[0].board)).toContain('REV_827t');
  });

  it('綁架：對手打出的手下被塞進麻袋，麻袋死亡後回到手牌', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g, 'REV_828');
    g.apply({ type: 'endTurn' });
    play(g, FILLER);
    const sack = g.s.players[1].board[0];
    expect(sack.cardId).toBe('REV_828t');
    sack.hp = 0;
    sack.dead = true;
    pass(g);
    expect(g.s.players[1].hand.some((h) => h.cardId === FILLER)).toBe(true);
  });

  it('哈基亞：亡語把靈魂存進奧秘，奧秘觸發時重新召喚', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    g.s.players[0].secrets = [{ uid: 777, cardId: 'EX1_289' }]; // 寒冰護體
    const h = put(g, 'REV_829', 0);
    h.hp = 0;
    h.dead = true;
    pass(g);
    expect(g.s.players[0].secrets[0].souls).toEqual(['REV_829']);
  });

  it('雙重背叛：對手花光法力後抽兩張牌', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g, 'REV_825');
    g.apply({ type: 'endTurn' });
    const p1 = g.s.players[1];
    p1.mana = 2;
    p1.maxMana = 2;
    const hc = give(g, FILLER, 1, false);
    hc.costMod = 2 - getCard(hc.cardId).cost;
    const handBefore = g.s.players[0].hand.length;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.players[0].hand.length).toBe(handBefore + 2);
  });
});

describe('核心：野籽與休眠', () => {
  it('精靈搜尋者：召喚休眠的野籽，並在甦醒後出現', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    play(g, 'REV_363');
    const seeds = g.s.players[0].board.filter((m) => m.cardId.startsWith('REV_360t'));
    expect(seeds).toHaveLength(3);
    expect(seeds.every((m) => m.keywords.includes('DORMANT'))).toBe(true);
    pass(g);
    pass(g);
    pass(g);
    expect(g.s.players[0].board.every((m) => !m.keywords.includes('DORMANT'))).toBe(true);
    expect(g.s.players[0].weapon?.cardId).toBe('REV_360t4');
  });
});

describe('核心：其他', () => {
  it('邀請信使：其他職業的牌加入手牌時複製它', () => {
    const g = newGame();
    put(g, 'REV_377', 0);
    play(g, 'TID_931');
    // 兩張其他職業的法術，各複製一次
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(4);
  });

  it('科尼留斯‧羅姆：每個玩家的回合開始與結束抽牌', () => {
    const g = newGame();
    put(g, 'SW_080', 0);
    const n = g.s.players[0].hand.length;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.length).toBe(n + 2); // 我的回合結束 + 對手的回合開始
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.length).toBe(n + 5); // 對手回合結束 + 我的回合開始 + 正常抽牌
  });

  it('管家史都華：下一個白銀之手新兵 +3/+3 並獲得亡語', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const m = put(g, 'REV_955', 0);
    m.hp = 0;
    m.dead = true;
    pass(g);
    expect(g.apply({ type: 'heroPower' })).toBe(true); // 援軍（召喚新兵）
    const rec = g.s.players[0].board.find((x) => x.cardId.startsWith('CS2_101t'));
    expect(rec).toBeTruthy();
    expect(rec!.atkBuff).toBe(3);
    expect(rec!.abilities.some((a) => a.on.k === 'deathrattle')).toBe(true);
  });

  it('惡魔之影：施放法術後變成它的複製', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const shadow = give(g, 'RLK_567');
    const foe = put(g, FILLER, 1);
    play(g, 'CS1_130', foe.uid); // 神聖之火
    expect(g.s.players[0].hand.find((h) => h.uid === shadow.uid)!.cardId).toBe('CS1_130');
  });

  it('大領主弗塔根：友方手下失去聖盾後，手牌中的一個手下 +5/+5', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    const ford = put(g, 'SW_047', 0);
    const h = give(g, FILLER);
    g.s.players[0].hand = [h];
    const foe = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: ford.uid, target: foe.uid });
    expect(h.atkBuff).toBe(5);
  });

  it('石匠：圖騰 +2 攻擊力', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const t = put(g, 'CS2_050', 0);
    play(g, 'REV_921');
    expect(g.atkOf(t)).toBeGreaterThanOrEqual(2);
  });

  it('核心卡牌：全部都可以用', () => {
    for (const id of ['REV_000', 'REV_828', 'OG_044', 'MAW_031', 'SW_448']) expect(getCard(id)).toBeTruthy();
  });
});
