// 貧瘠之地與哀嚎洞穴：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

type Cls = 'MAGE' | 'ROGUE' | 'PALADIN' | 'WARRIOR' | 'HUNTER' | 'DRUID' | 'WARLOCK' | 'DEMONHUNTER' | 'PRIEST' | 'SHAMAN';

function newGame(opts: { seed?: number; cls?: Cls; deck?: string[] } = {}): Game {
  const g = Game.create({
    decks: [opts.deck ?? Array(30).fill(FILLER), Array(30).fill(FILLER)],
    classes: [opts.cls ?? 'MAGE', 'WARRIOR'],
    names: ['玩家', '電腦'],
    ai: [false, false],
    seed: opts.seed ?? 42,
    first: 0,
  });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, cardId: string, mana = 10): HandCard {
  const hc = g.newHandCard(cardId);
  hc.enteredTurn = g.s.turn - 1;
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

function resolve(g: Game) {
  while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
}

function play(g: Game, cardId: string, extra: { target?: number; position?: number; option?: number } = {}) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, ...extra }), cardId).toBe(true);
  resolve(g);
  return hc;
}

function endTurns(g: Game, n: number) {
  for (let i = 0; i < n; i++) {
    g.apply({ type: 'endTurn' });
    resolve(g);
  }
}

const ids = (g: Game, pid: PlayerId) => g.s.players[pid].board.map((m) => m.cardId);

describe('貧瘠之地與哀嚎洞穴', () => {
  it('收錄全部可收藏卡', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1525).length).toBe(170);
  });

  it('等級法術：法力水晶達到 5 / 10 時在手牌中升級', () => {
    const g = newGame({ cls: 'HUNTER' });
    const hc = give(g, 'BAR_034', 4);
    g.s.players[0].maxMana = 4;
    g.recalcAuras();
    expect(hc.cardId).toBe('BAR_034');
    g.s.players[0].maxMana = 5;
    g.recalcAuras();
    expect(hc.cardId).toBe('BAR_034t');
    g.s.players[0].maxMana = 10;
    g.recalcAuras();
    expect(hc.cardId).toBe('BAR_034t2');
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(ids(g, 0)).toEqual(['BAR_034t5']);
  });

  it('符印：在你的下個回合開始時生效', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    play(g, 'WC_003');
    expect(ids(g, 0)).toEqual([]);
    endTurns(g, 2);
    expect(ids(g, 0)).toEqual(['WC_003t', 'WC_003t']);
  });

  it('黃金之路蠻兵：盛怒時獲得等同所受傷害的護甲值', () => {
    const g = newGame();
    const m = put(g, 'BAR_021', 1);
    play(g, 'CS2_024', { target: m.uid }); // 寒冰箭 3 點
    expect(g.s.players[1].hero.armor).toBe(3);
  });

  it('穿透射擊：溢出的傷害擊中敵方英雄', () => {
    const g = newGame({ cls: 'HUNTER' });
    const m = put(g, 'CS2_168', 1); // 2/1
    play(g, 'BAR_032', { target: m.uid });
    expect(g.s.players[1].hero.hp).toBe(25);
  });

  it('『魔像塑造者』卡札克斯：打造帶兩種藥草的魔像', () => {
    const g = newGame({ deck: Array(30).fill('CS2_120') });
    play(g, 'BAR_079');
    const golem = g.s.players[0].hand.find((h) => h.cardId.startsWith('BAR_079_m'))!;
    expect(golem.golem?.length).toBe(2);
    expect(g.liveDef(0, golem)?.text ?? '').not.toMatch(/\{\d\}/);
    expect(g.apply({ type: 'play', handUid: golem.uid })).toBe(true);
    resolve(g);
    expect(ids(g, 0)).toContain('BAR_079_m1');
  });

  it('史蓋伯斯‧油切：連擊後下兩張牌消耗減少 (2)', () => {
    const g = newGame({ cls: 'ROGUE' });
    play(g, 'CS2_168');
    play(g, 'BAR_552');
    const a = give(g, FILLER);
    expect(g.costOf(g.s.players[0], a)).toBe(2);
    expect(g.apply({ type: 'play', handUid: a.uid })).toBe(true);
    const b = give(g, FILLER);
    expect(g.costOf(g.s.players[0], b)).toBe(2);
    expect(g.apply({ type: 'play', handUid: b.uid })).toBe(true);
    expect(g.costOf(g.s.players[0], give(g, FILLER))).toBe(4);
  });

  it('秘法發光體：不是一開始就在牌堆中的牌消耗減少 (2)，但不低於 1', () => {
    const g = newGame();
    put(g, 'BAR_545', 0);
    expect(g.costOf(g.s.players[0], give(g, FILLER))).toBe(2);
    expect(g.costOf(g.s.players[0], give(g, 'CS2_168'))).toBe(1);
  });

  it('火砲大師斯密瑟：奧秘變成士兵，死亡後變回奧秘', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'EX1_130'); // 崇高犧牲
    play(g, 'BAR_879');
    expect(g.s.players[0].secrets).toEqual([]);
    const soldier = g.s.players[0].board.find((m) => m.cardId === 'BAR_879t')!;
    play(g, 'CS2_029', { target: soldier.uid });
    expect(g.s.players[0].secrets.map((x) => x.cardId)).toEqual(['EX1_130']);
  });

  it('十字路口八卦人士：友方奧秘揭露後 +2/+2', () => {
    const g = newGame({ cls: 'PALADIN' });
    const gos = put(g, 'BAR_890', 0);
    play(g, 'EX1_130');
    endTurns(g, 1);
    const foe = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: foe.uid, target: gos.uid });
    expect(g.atkOf(gos)).toBe(6);
  });

  it('瓦登‧晨握：凍結敵方手下，已經凍結的受到 4 點傷害', () => {
    const g = newGame();
    const a = put(g, FILLER, 1);
    const b = put(g, FILLER, 1);
    a.frozen = true;
    a.frozenTurn = g.s.turn;
    play(g, 'BAR_748');
    expect(a.hp).toBe(1);
    expect(b.frozen).toBe(true);
  });

  it('你的就是我的：英雄能力使用 2 次後換回來', () => {
    const g = newGame({ cls: 'ROGUE' });
    const orig = g.s.players[0].heroPower.id;
    play(g, 'BAR_323');
    expect(g.s.players[0].heroPower.id).not.toBe(orig);
    expect(g.s.players[0].heroPower.cost).toBe(0);
    for (let i = 0; i < 2; i++) {
      g.s.players[0].heroPower.used = false;
      const def = g.powerDef(g.s.players[0]);
      g.apply({ type: 'heroPower', target: def.target ? g.s.players[1].hero.uid : undefined });
      resolve(g);
    }
    expect(g.s.players[0].heroPower.id).toBe(orig);
  });

  it('大德魯伊納拉雷克斯：休眠時每回合結束把夢境牌加入手牌', () => {
    const g = newGame({ cls: 'DRUID' });
    play(g, 'WC_035');
    const n = g.s.players[0].hand.length;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.length).toBe(n + 1);
    expect(g.s.players[0].hand[n].cardId).toMatch(/^DREAM_0/);
  });

  it('星穹連線：法力水晶歸零，手牌與牌堆的卡消耗變成 (1)', () => {
    const g = newGame({ cls: 'DRUID' });
    const a = give(g, FILLER);
    play(g, 'BAR_539');
    expect(g.s.players[0].maxMana).toBe(0);
    expect(g.costOf(g.s.players[0], a)).toBe(1);
    expect(g.costOf(g.s.players[0], g.s.players[0].deck[0])).toBe(1);
  });

  it('現場接洽人：打出戰吼牌後抽一張牌', () => {
    const g = newGame({ cls: 'ROGUE' });
    put(g, 'BAR_317', 0);
    const n = g.s.players[0].hand.length;
    play(g, 'CS2_189', { target: g.s.players[1].hero.uid }); // 精靈弓箭手
    expect(g.s.players[0].hand.length).toBe(n + 1);
  });

  it('腐爛的普雷莫爾：嘲諷手下死亡後召喚沒有嘲諷的複製', () => {
    const g = newGame({ cls: 'DRUID' });
    put(g, 'BAR_540', 0);
    const t = put(g, 'CS2_125', 0); // 鐵鬃灰熊 3/3 嘲諷
    play(g, 'CS2_029', { target: t.uid });
    const copy = g.s.players[0].board.find((m) => m.cardId === 'CS2_125');
    expect(copy?.keywords).not.toContain('TAUNT');
  });
});
