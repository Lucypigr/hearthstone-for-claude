// 威茲班的工作坊與決戰荒蕪之地：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../cards/registry';
import { EXCAVATE_TIERS } from '../cards/badlands';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5
const WISP = 'CS2_231'; // 小精靈 1/1

type Cls = 'MAGE' | 'ROGUE' | 'PALADIN' | 'WARRIOR' | 'DEATHKNIGHT' | 'HUNTER' | 'DRUID';

function newGame(opts: { seed?: number; cls?: Cls; deck?: string[]; zilliax?: string[] } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const g = Game.create({
    decks: [deck, Array(30).fill(FILLER)],
    classes: [opts.cls ?? 'MAGE', 'WARRIOR'],
    names: ['玩家', '電腦'],
    ai: [false, false],
    seed: opts.seed ?? 42,
    first: 0,
    zilliax: [opts.zilliax, undefined],
  });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, cardId: string, mana = 10): HandCard {
  const hc = g.newHandCard(cardId);
  hc.enteredTurn = g.s.turn - 1; // 不是這個回合拿到的（不算快手）
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

function play(g: Game, cardId: string, extra: { target?: number; position?: number; option?: number } = {}, quick = false) {
  const hc = give(g, cardId);
  if (quick) hc.enteredTurn = g.s.turn;
  expect(g.apply({ type: 'play', handUid: hc.uid, ...extra }), cardId).toBe(true);
  while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
  return hc;
}

describe('系列收錄', () => {
  it('威茲班的工作坊與決戰荒蕪之地的可收藏卡全部收錄', () => {
    for (const set of [1897, 1892]) {
      const cards = ALL_CARDS().filter((c) => c.collectible && c.set === set);
      expect(cards.length, String(set)).toBeGreaterThanOrEqual(182);
    }
  });
});

describe('威茲班的工作坊', () => {
  it('微縮：抽到時獲得 1 費 1/1 的迷你複製', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.deck.push(g.newHandCard('TOY_375'));
    g.apply({ type: 'play', handUid: give(g, 'CS2_023').uid }); // 秘法智慧：抽 2
    const mini = p.hand.find((h) => h.cardId === 'TOY_375t');
    expect(mini).toBeTruthy();
    expect(g.costOf(p, mini!)).toBe(1);
    expect(g.handStats(0, mini!)).toEqual({ atk: 1, hp: 1 });
  });

  it('放大：抽到時獲得 8 費 8/8 的巨大複製', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.deck.push(g.newHandCard('MIS_300'));
    g.apply({ type: 'play', handUid: give(g, 'CS2_023').uid });
    const big = p.hand.find((h) => h.cardId === 'MIS_300t')!;
    expect(g.costOf(p, big)).toBe(8);
    expect(g.handStats(0, big)).toEqual({ atk: 8, hp: 8 });
  });

  it('起手手牌中的微縮卡也會給迷你複製', () => {
    const g = newGame({ deck: Array(30).fill('TOY_811') });
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TOY_811t')).toBe(true);
  });

  it('齊利亞斯豪華版 3000：組牌時選的兩個模組合體', () => {
    const g = newGame({ deck: ['TOY_330', ...Array(29).fill(FILLER)], zilliax: ['TOY_330t96', 'TOY_330t99'] });
    const p = g.s.players[0];
    const z = [...p.hand, ...p.deck].find((h) => h.cardId === 'TOY_330')!;
    expect(z.zilliax).toEqual(['TOY_330t96', 'TOY_330t99']);
    const def = g.handDef(z);
    expect(def.cost).toBe(9);
    expect([def.attack, def.health]).toEqual([5, 7]);
    expect(def.keywords).toEqual(expect.arrayContaining(['ELUSIVE', 'POISONOUS', 'DIVINE_SHIELD', 'TAUNT', 'LIFESTEAL', 'RUSH']));
    p.hand.push(z);
    p.deck = p.deck.filter((h) => h !== z);
    p.mana = 10;
    g.apply({ type: 'play', handUid: z.uid });
    const m = p.board.find((x) => x.cardId === 'TOY_330')!;
    expect([g.atkOf(m), m.hp]).toEqual([5, 7]);
    expect(g.hasKw(m, 'TAUNT')).toBe(true);
  });

  it('次級蛋白石法術石：英雄攻擊 2 次後升級', () => {
    const g = newGame();
    const p = g.s.players[0];
    const ss = give(g, 'TOY_645');
    for (let i = 0; i < 2; i++) {
      p.hero.tempAtk = 1;
      p.hero.attacks = 0;
      g.apply({ type: 'attack', attacker: p.hero.uid, target: g.s.players[1].hero.uid });
    }
    expect(ss.cardId).toBe('TOY_645t');
  });

  it('上發條的音樂家：交易後升級', () => {
    const g = newGame();
    const p = g.s.players[0];
    const hc = give(g, 'TOY_509');
    g.apply({ type: 'trade', handUid: hc.uid });
    const card = [...p.hand, ...p.deck].find((h) => h.uid === hc.uid)!;
    expect(card.counter).toBe(1);
  });

  it('專業玩家：猜拳後勝利者抽 2 張牌', () => {
    const g = newGame();
    const before = g.s.players[0].hand.length + g.s.players[1].hand.length;
    play(g, 'MIS_916');
    const after = g.s.players[0].hand.length + g.s.players[1].hand.length;
    expect(after).toBe(before + 2); // 打出的這張是測試中另外給的
  });

  it('戰慄塊：下一個戰吼觸發 3 次', () => {
    const g = newGame();
    play(g, 'TOY_501');
    const n = g.s.players[0].hand.length;
    play(g, 'EX1_015'); // 新手工程師：戰吼抽一張
    expect(g.s.players[0].hand.length).toBe(n + 3);
  });

  it('摺紙龍：與另一個手下交換屬性值', () => {
    const g = newGame();
    const y = put(g, FILLER, 1);
    const hc = give(g, 'TOY_896');
    g.apply({ type: 'play', handUid: hc.uid, target: y.uid });
    const d = g.s.players[0].board.find((m) => m.cardId === 'TOY_896')!;
    expect([g.atkOf(d), d.hp]).toEqual([4, 5]);
    expect([g.atkOf(y), y.hp]).toEqual([1, 1]);
  });

  it('紙藝天使：英雄能力消耗為 (0)', () => {
    const g = newGame();
    put(g, 'TOY_381', 0);
    expect(g.heroPowerCost(g.s.players[0])).toBe(0);
  });

  it('走廊沉睡者：7 個手下死亡後甦醒', () => {
    const g = newGame();
    const z = put(g, 'TOY_866', 0);
    expect(g.hasKw(z, 'DORMANT')).toBe(true);
    for (let i = 0; i < 7; i++) put(g, WISP, 1);
    play(g, 'CS2_062'); // 地獄烈焰
    expect(g.hasKw(z, 'DORMANT')).toBe(false);
  });

  it('神奇的威茲邦：換成一副實驗套牌', () => {
    const g = newGame({ deck: ['TOY_700', ...Array(29).fill(FILLER)] });
    const p = g.s.players[0];
    expect(p.deck.length + p.hand.length).toBeGreaterThan(0);
    expect(p.startingDeck?.includes('TOY_700')).toBe(false);
  });
});

describe('決戰荒蕪之地', () => {
  it('挖掘：普通 → 稀有 → 史詩 → 傳說（有傳說寶藏的職業），之後重新開始', () => {
    const g = newGame({ cls: 'ROGUE' });
    const p = g.s.players[0];
    p.hand = [];
    for (let i = 0; i < 5; i++) play(g, 'WW_001');
    const got = p.hand.map((h) => h.cardId);
    expect(EXCAVATE_TIERS[0]).toContain(got[0]);
    expect(EXCAVATE_TIERS[1]).toContain(got[1]);
    expect(EXCAVATE_TIERS[2]).toContain(got[2]);
    expect(got[3]).toBe('WW_001t23');
    expect(EXCAVATE_TIERS[0]).toContain(got[4]);
  });

  it('沒有傳說寶藏的職業：第 4 次挖掘回到普通', () => {
    const g = newGame({ cls: 'HUNTER' });
    const p = g.s.players[0];
    p.hand = [];
    for (let i = 0; i < 4; i++) play(g, 'WW_001');
    expect(EXCAVATE_TIERS[0]).toContain(p.hand[3].cardId);
  });

  it('快手：在拿到的同一個回合打出才觸發', () => {
    const g = newGame();
    const foe = g.s.players[1];
    const t = put(g, FILLER, 1);
    play(g, 'WW_434', { target: t.uid }); // 不是快手：沒有傷害
    expect(t.hp).toBe(5);
    play(g, 'WW_434', { target: t.uid }, true);
    expect(foe.board).not.toContain(t);
  });

  it('脫水：快手時消耗為 (1)', () => {
    const g = newGame();
    const hc = give(g, 'WW_325');
    expect(g.costOf(g.s.players[0], hc)).toBe(3);
    hc.enteredTurn = g.s.turn;
    expect(g.costOf(g.s.players[0], hc)).toBe(1);
  });

  it('開局沒有重複的卡：只有牌堆在開始時沒有重複時才觸發', () => {
    const dupes = newGame();
    expect(dupes.s.players[0].startingDeck?.length).toBe(30);
    const ids = ALL_CARDS().filter((c) => c.collectible && c.type === 'MINION' && c.cardClass === 'NEUTRAL').slice(0, 30).map((c) => c.id);
    const g = newGame({ deck: ids });
    const p = g.s.players[0];
    p.hero.hp = 30;
    play(g, 'WW_815'); // 迷失的塞杜林：免疫並攻擊所有敵人
    expect(g.s.players[1].hero.hp).toBeLessThan(30);
    const g2 = newGame();
    play(g2, 'WW_815');
    expect(g2.s.players[1].hero.hp).toBe(30);
  });

  it('汙泥桶：被棄掉或打出時，對生命值最低的敵人造成 4 點傷害', () => {
    const g = newGame();
    const t = put(g, WISP, 1);
    play(g, 'WW_044t');
    expect(g.s.players[1].board).not.toContain(t);
  });

  it('廢棄物清除者：摧毀牌堆底部的汙泥桶也會觸發', () => {
    const g = newGame();
    const p = g.s.players[0];
    put(g, 'WW_042', 0);
    p.deck.unshift(g.newHandCard('WW_044t'));
    const hp = g.s.players[1].hero.hp;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].hero.hp).toBe(hp - 4);
  });

  it('光蟲群：放不下的光蟲存進瓶子', () => {
    const g = newGame();
    play(g, 'WW_052');
    const p = g.s.players[0];
    expect(p.board).toHaveLength(7);
    const bottle = p.hand.find((h) => h.cardId === 'WW_052t2')!;
    expect(bottle.counter).toBe(3);
  });

  it('蛇眼：擲兩顆骰子並發現兩張卡', () => {
    const g = newGame();
    const n = g.s.players[0].hand.length;
    play(g, 'WW_400');
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(n + 2);
  });

  it('食人魔幫騎手：50% 機率改成讓英雄 +3 攻擊力', () => {
    let rode = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = newGame({ seed });
      const r = put(g, 'WW_419', 0);
      const t = put(g, FILLER, 1);
      g.apply({ type: 'attack', attacker: r.uid, target: t.uid });
      if (t.hp === 5) {
        rode++;
        expect(g.atkOf(g.s.players[0].hero)).toBe(3);
      }
    }
    expect(rode).toBeGreaterThan(0);
    expect(rode).toBeLessThan(20);
  });

  it('沉睡的斯拉格茂：挖掘讓它提早甦醒', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'WW_375');
    const m = g.s.players[0].board.find((x) => x.cardId === 'WW_375')!;
    const before = m.dormantTurns!;
    play(g, 'WW_001');
    expect(m.dormantTurns).toBe(before - 2);
  });

  it('深坑礦工布萊恩：開局沒有重複時，戰吼觸發兩次', () => {
    const ids = ALL_CARDS().filter((c) => c.collectible && c.type === 'MINION' && c.cardClass === 'NEUTRAL').slice(0, 30).map((c) => c.id);
    const g = newGame({ deck: ids, cls: 'WARRIOR' });
    play(g, 'DEEP_020');
    const n = g.s.players[0].hand.length;
    play(g, 'EX1_015');
    expect(g.s.players[0].hand.length).toBe(n + 2);
  });

  it('你好鰭：手牌少於 3 張時獲得一個魚人', () => {
    const g = newGame();
    put(g, 'WW_333', 0);
    g.s.players[0].hand = [];
    play(g, WISP);
    expect(g.s.players[0].hand.some((h) => getCard(h.cardId).races?.includes('MURLOC') || getCard(h.cardId).races?.includes('ALL'))).toBe(true);
  });

  it('所有新卡都能打出、不會出錯（每張卡一場）', () => {
    const ids = ALL_CARDS().filter((c) => c.collectible && (c.set === 1897 || c.set === 1892)).map((c) => c.id);
    for (const [i, id] of ids.entries()) {
      const g = newGame({ seed: i + 1, cls: (['MAGE', 'ROGUE', 'PALADIN', 'WARRIOR', 'DEATHKNIGHT', 'HUNTER', 'DRUID'] as Cls[])[i % 7] });
      put(g, FILLER, 1);
      put(g, WISP, 0);
      const hc = give(g, id);
      const req = g.playTargetReq(hc.uid, getCard(id).chooseOne ? 0 : undefined);
      const targets = req ? g.validTargets(req, 0, getCard(id).type === 'SPELL') : [];
      g.apply({ type: 'play', handUid: hc.uid, target: targets[0], option: getCard(id).chooseOne ? 0 : undefined });
      for (let k = 0; k < 10 && g.s.pendingChoice; k++) g.apply({ type: 'choose', index: 0 });
      g.apply({ type: 'endTurn' });
      for (let k = 0; k < 10 && g.s.pendingChoice; k++) g.apply({ type: 'choose', index: 0 });
      g.apply({ type: 'endTurn' });
    }
  });
});

describe('返回手牌並加身材', () => {
  it('酒吧釀酒大師：回到手牌的手下 +2/+2', () => {
    const g = newGame();
    const m = put(g, 'CS2_182', 0);
    play(g, 'WW_423', { target: m.uid });
    const hc = g.s.players[0].hand.filter((h) => h.cardId === 'CS2_182').pop();
    expect(hc).toBeTruthy();
    expect(hc!.atkBuff).toBe(2);
    expect(hc!.hpBuff).toBe(2);
  });
});
