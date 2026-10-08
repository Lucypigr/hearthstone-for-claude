// 卡面文字的即時數值（@ 與 {n}）與巴珊娜的雕刻
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../cards/registry';
import { Game } from './game';
import type { HandCard, PlayerId } from './state';

const FILLER = 'CS2_182';

function newGame(classes: [string, string] = ['DRUID', 'MAGE']): Game {
  const deck = Array(30).fill(FILLER);
  const g = Game.create({ decks: [deck, deck], classes: classes as never, names: ['玩家', '電腦'], ai: [false, false], seed: 11, first: 0 });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

const give = (g: Game, id: string, pid: PlayerId = 0): HandCard => {
  const hc = g.newHandCard(id);
  g.s.players[pid].hand.push(hc);
  g.s.players[pid].mana = g.s.players[pid].maxMana = 10;
  return hc;
};
const strip = (t: string) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

describe('卡面文字的即時數值', () => {
  it('感染餐具室：消耗隨英雄攻擊次數提高，實際召喚的手下也一致', () => {
    const g = newGame();
    const hc = give(g, 'JAIL_200');
    expect(strip(g.liveDef(0, hc)!.text)).toContain('消耗為2的隨機手下');
    g.s.players[0].heroAttacks = 3;
    expect(strip(g.liveDef(0, hc)!.text)).toContain('消耗為5的隨機手下');
    g.s.players[0].board = [];
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    const costs = g.s.players[0].board.map((m) => getCard(m.cardId).cost);
    expect(costs).toHaveLength(2);
    expect(costs.every((c) => c === 5)).toBe(true);
  });

  it('尼斯蘭德瑪斯、拉法姆的最後一博：手牌計數會顯示在卡面', () => {
    const g = newGame();
    const a = give(g, 'BT_481');
    a.counter = 4;
    expect(strip(g.liveDef(0, a)!.text)).toContain('消耗為4的隨機手下');
    const b = give(g, 'CATA_498');
    b.counter = 3;
    expect(strip(g.liveDef(0, b)!.text)).toContain('造成$5點傷害');
  });

  it('所有帶占位符的卡：手牌與收藏顯示都不會殘留 @、{n} 或未知數值', () => {
    const g = newGame();
    const bad: string[] = [];
    for (const c of ALL_CARDS()) {
      if (!/@|\{\d+\}/.test(c.text) || (!c.collectible && !/^CATA_\d+t$/.test(c.id))) continue;
      const hc = give(g, c.id);
      for (const t of [g.liveDef(0, hc)?.text ?? g.staticDef(c).text, g.staticDef(c).text]) {
        if (/[@{}\u0001\u0002]/.test(t) || /(?<![A-Za-z])X(?![A-Za-z])/.test(t)) bad.push(`${c.id} ${c.name}：${strip(t)}`);
      }
    }
    // 少數卡的 {n} 是動態選項（例如烏魯的兩個二選一選項），其餘都必須換成數值
    expect(bad.filter((b) => !/^(GDB_854|CATA_190h|EDR_950)/.test(b))).toEqual([]);
  });

  it('灌注：卡面顯示還差幾個，達標後變成灌注版本；惡魔混亂也有灌注', () => {
    const def = getCard('MAW_012');
    expect(def.infuse).toBeTruthy();
    const g = newGame();
    const hc = give(g, 'MAW_012');
    expect(strip(g.liveDef(0, hc)!.text)).toContain('灌注(3個惡魔)');
    hc.infuseProgress = 2;
    expect(strip(g.liveDef(0, hc)!.text)).toContain('灌注(1個惡魔)');
  });
});

describe('巴珊娜・符文圖騰', () => {
  it('雕刻的法術總共 12 點法力，分給三個樹人，樹人卡面列出法術名稱', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const deck = Array(30).fill(FILLER);
      const g = Game.create({ decks: [deck, deck], classes: ['DRUID', 'MAGE'], names: ['a', 'b'], ai: [false, false], seed, first: 0 });
      g.apply({ type: 'mulligan', player: 0, replace: [] });
      g.apply({ type: 'mulligan', player: 1, replace: [] });
      const me = g.s.players[0];
      me.hand = [];
      const hc = give(g, 'MEND_046');
      expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
      const trees = me.hand.filter((h) => h.cardId === 'MEND_046t');
      expect(trees).toHaveLength(3);
      let total = 0;
      for (const t of trees) {
        expect(t.carved!.length).toBeGreaterThan(0);
        for (const id of t.carved!) {
          expect(getCard(id).spellSchool).toBe('NATURE');
          total += getCard(id).cost;
        }
        const text = strip(g.liveDef(0, t)!.text);
        for (const id of t.carved!) expect(text).toContain(getCard(id).name);
      }
      expect(total).toBe(12);
    }
  });
});

