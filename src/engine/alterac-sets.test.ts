// 奧特蘭克山谷：機制與卡牌的測試
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

describe('奧特蘭克山谷', () => {
  it('收錄全部可收藏卡', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1626).length).toBe(143);
  });

  it('榮譽擊殺：剛好致命才觸發，滅殺不算', () => {
    const g = newGame();
    const priv = put(g, 'AV_121', 0); // 地精士兵 1/3
    const foe = put(g, 'CS2_168', 1); // 鱷魚人 2/1
    g.apply({ type: 'attack', attacker: priv.uid, target: foe.uid });
    expect(g.atkOf(priv)).toBe(3);
    endTurns(g, 2);
    const priv2 = put(g, 'AV_121', 0);
    const foe2 = put(g, 'CS2_120', 1); // 河爪鱷魚 2/3
    foe2.hp = 1;
    priv2.atkBuff = 1; // 2 攻擊力打 1 生命值：滅殺
    g.apply({ type: 'attack', attacker: priv2.uid, target: foe2.uid });
    expect(g.atkOf(priv2)).toBe(2);
  });

  it('法術的榮譽擊殺：法力虹吸讓手牌中的法術消耗減少', () => {
    const g = newGame();
    const foe = put(g, 'CS2_120', 1);
    foe.hp = 2;
    const spell = give(g, 'CS2_029'); // 火球術
    play(g, 'AV_212', { target: foe.uid });
    expect(g.costOf(g.s.players[0], spell)).toBe(3);
  });

  it('血怒者科爾拉克：沒有被榮譽擊殺時重新召喚', () => {
    const g = newGame();
    const k = put(g, 'AV_143', 1);
    play(g, 'CS2_029', { target: k.uid }); // 6 點傷害打 5 生命值
    expect(ids(g, 1)).toEqual(['AV_143']);
    g.s.players[1].board[0].hp = 3;
    play(g, 'EX1_238', { target: g.s.players[1].board[0].uid }); // 閃電箭 3 點
    expect(ids(g, 1)).toEqual([]);
  });

  it('空軍指揮官穆維里克：友方手下榮譽擊殺時召喚蠍尾獅', () => {
    const g = newGame();
    put(g, 'AV_293', 0);
    const a = put(g, 'CS2_120', 0); // 2/3
    const foe = put(g, 'CS2_120', 1);
    foe.hp = 2;
    g.apply({ type: 'attack', attacker: a.uid, target: foe.uid });
    expect(ids(g, 0)).toContain('AV_293t');
  });

  it('目標：征戰平原讓手下 +1 攻擊力，持續 3 回合', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    const m = put(g, FILLER, 0);
    play(g, 'AV_661');
    expect(g.atkOf(m)).toBe(5);
    endTurns(g, 4);
    expect(g.atkOf(m)).toBe(5);
    endTurns(g, 2);
    expect(g.atkOf(m)).toBe(4);
  });

  it('落雪墓地：亡語觸發兩次', () => {
    const g = newGame({ cls: 'ROGUE' });
    play(g, 'AV_400');
    const m = put(g, 'AV_211', 0); // 恐怖的霜狼
    play(g, 'CS2_029', { target: m.uid });
    expect(ids(g, 0).filter((x) => x === 'AV_211t').length).toBe(2);
  });

  it('凍結的長毛象：施放火焰法術前保持凍結', () => {
    const g = newGame();
    play(g, 'AV_128');
    const m = g.s.players[0].board[0];
    expect(m.frozen).toBe(true);
    endTurns(g, 2);
    expect(m.frozen).toBe(true);
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid });
    expect(m.frozen).toBe(false);
  });

  it('作弊狗頭人：敵人被凍結後受到 3 點傷害', () => {
    const g = newGame({ cls: 'SHAMAN' });
    put(g, 'AV_251', 0);
    const foe = put(g, FILLER, 1);
    play(g, 'CS2_024', { target: foe.uid }); // 寒冰箭 3 點並凍結
    expect(foe.hp).toBe(-1);
  });

  it('光鑄凱瑞爾：無法撼動之物讓英雄受到的傷害減半', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'AV_206');
    expect(g.s.players[0].weapon?.cardId).toBe('AV_146');
    const hp = g.s.players[0].hero.hp + g.s.players[0].hero.armor;
    endTurns(g, 1);
    play(g, 'CS2_029', { target: g.s.players[0].hero.uid });
    const me = g.s.players[0].hero;
    expect(hp - (me.hp + me.armor)).toBe(3);
  });

  it('血色十字軍賽丹：獲得的屬性值加倍', () => {
    const g = newGame({ cls: 'PALADIN' });
    const m = put(g, 'AV_345', 0);
    play(g, 'CS2_087', { target: m.uid }); // 力量祝福 +3 攻擊力
    expect(g.atkOf(m)).toBe(8);
  });

  it('開路者：施放上一張二選一法術的另一個選項', () => {
    const g = newGame({ cls: 'DRUID' });
    const foe = put(g, FILLER, 1);
    play(g, 'EX1_154', { target: foe.uid, option: 0 }); // 憤怒：造成 3 點傷害
    const hand = g.s.players[0].hand.length;
    play(g, 'AV_210');
    // 另一個選項：造成 1 點傷害並抽一張牌
    expect(g.s.players[0].hand.length).toBe(hand + 1);
  });

  it('裂魔者克圖斯：友方手下攻擊後可以再次使用英雄能力', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    play(g, 'AV_204');
    expect(ids(g, 0)).toEqual(['AV_204t2', 'AV_204t2']);
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower' });
    expect(g.s.players[0].heroPower.used).toBe(true);
    const foe = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: g.s.players[0].board[0].uid, target: foe.uid });
    expect(g.s.players[0].heroPower.used).toBe(false);
  });

  it('虔信者賽瑞菈：英雄能力每回合在治療與傷害之間翻面', () => {
    const g = newGame({ cls: 'PRIEST' });
    play(g, 'AV_207');
    const foe = g.s.players[1].hero;
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower', target: foe.uid });
    expect(foe.hp).toBe(30);
    endTurns(g, 2);
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower', target: foe.uid });
    expect(foe.hp).toBe(25);
  });

  it('元素使布魯坎：戰吼呼喚兩種元素', () => {
    const g = newGame({ cls: 'SHAMAN' });
    play(g, 'AV_258');
    // 第一個選項：大地（兩個 2/3 嘲諷），第二個：流水
    expect(ids(g, 0)).toEqual(['AV_258t6', 'AV_258t6']);
  });

  it('支援前線！：本回合手下消耗減少 (2)，但不會低於 1', () => {
    const g = newGame({ cls: 'WARRIOR' });
    const a = give(g, FILLER);
    const b = give(g, 'CS2_168');
    play(g, 'AV_119');
    expect(g.costOf(g.s.players[0], a)).toBe(2);
    expect(g.costOf(g.s.players[0], b)).toBe(1);
  });

  it('納亞克·海克森：亡語把偷來的手下還回去', () => {
    const g = newGame({ cls: 'PRIEST' });
    const foe = put(g, FILLER, 1);
    play(g, 'AV_331', { target: foe.uid });
    expect(ids(g, 0)).toEqual(['AV_331', FILLER]);
    play(g, 'CS2_029', { target: g.s.players[0].board[0].uid });
    expect(ids(g, 1)).toEqual([FILLER]);
  });

  it('連發秘法師：有手下死亡就重複', () => {
    const g = newGame();
    for (let i = 0; i < 3; i++) put(g, 'CS2_168', 1); // 1 生命值
    put(g, 'CS2_120', 1); // 3 生命值
    play(g, 'AV_222');
    // 第一輪消滅三個鱷魚人，第二輪沒有手下死亡就停止
    expect(ids(g, 1)).toEqual(['CS2_120']);
    expect(g.s.players[1].board[0].hp).toBe(1);
  });

  it('英雄卡都能打出並使用英雄能力', () => {
    const heroes: [string, Cls][] = [
      ['AV_113', 'HUNTER'],
      ['AV_200', 'MAGE'],
      ['AV_202', 'WARRIOR'],
      ['AV_204', 'DEMONHUNTER'],
      ['AV_205', 'DRUID'],
      ['AV_206', 'PALADIN'],
      ['AV_207', 'PRIEST'],
      ['AV_258', 'SHAMAN'],
      ['AV_316', 'WARLOCK'],
    ];
    for (const [id, cls] of heroes) {
      const g = newGame({ cls });
      play(g, id);
      g.s.players[0].mana = 10;
      const def = g.powerDef(g.s.players[0]);
      const ok = g.apply({ type: 'heroPower', target: def.target ? g.s.players[1].hero.uid : undefined, option: def.chooseOne ? 0 : undefined });
      resolve(g);
      expect(ok, id).toBe(true);
    }
  });
});
