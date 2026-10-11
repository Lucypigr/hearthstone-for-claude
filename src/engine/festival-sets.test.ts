// 腐化與終章：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { getCard, hasCard } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5

function newGame(seed = 42): Game {
  const deck = Array(30).fill(FILLER);
  const g = Game.create({ decks: [deck, deck], classes: ['MAGE', 'WARRIOR'], names: ['玩家', '電腦'], ai: [false, false], seed, first: 0 });
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

describe('腐化', () => {
  it('腐化卡都有連結到腐化版本', () => {
    for (const id of ['DMF_054', 'DMF_054', 'DMF_117', 'DMF_163', 'WON_064', 'YOP_003']) {
      const d = getCard(id);
      expect(d.corrupt, id).toBeTruthy();
      expect(hasCard(d.corrupt!.into), id).toBe(true);
    }
  });

  it('打出消耗更高的牌後，手牌中的腐化卡變成腐化版本', () => {
    const g = newGame();
    const strongman = give(g, 'DMF_054'); // 大力士 (4)
    expect(strongman.cardId).toBe('DMF_054');
    const big = give(g, 'CS2_200'); // 6 費
    g.apply({ type: 'play', handUid: big.uid });
    expect(strongman.cardId).toBe(getCard('DMF_054').corrupt!.into);
    expect(g.costOf(g.s.players[0], strongman)).toBe(getCard(strongman.cardId).cost);
  });

  it('打出消耗不更高的牌不會腐化', () => {
    const g = newGame();
    const strongman = give(g, 'DMF_054');
    const cheap = give(g, 'CS2_189'); // 精靈弓箭手 (1)
    g.apply({ type: 'play', handUid: cheap.uid, target: g.s.players[1].hero.uid });
    expect(strongman.cardId).toBe('DMF_054');
  });

  it('再次腐化：毀滅災厄腐化兩次', () => {
    const g = newGame();
    const dis = give(g, 'DMF_117');
    for (let i = 0; i < 2; i++) {
      const hc = give(g, 'CS2_200'); // 6 費
      g.apply({ type: 'play', handUid: hc.uid });
    }
    expect(dis.cardId).toBe('DMF_117t2');
  });

  it('腐化的氮氣加速毒藥也會給武器 +2 攻擊力', () => {
    const g = newGame();
    const m = put(g, FILLER, 0);
    g.apply({ type: 'play', handUid: give(g, 'CS2_106').uid }); // 烈焰戰斧 3/2
    const atk = g.s.players[0].weapon!.atk;
    const hc = give(g, 'YOP_015t');
    g.apply({ type: 'play', handUid: hc.uid, target: m.uid });
    expect(g.s.players[0].weapon!.atk).toBe(atk + 2);
  });
});

describe('終章', () => {
  it('剛好花光法力才觸發：重金屬狂信徒對所有敵人造成傷害', () => {
    const g = newGame();
    const foe = g.s.players[1];
    const e1 = put(g, FILLER, 1);
    const hp = foe.hero.hp;
    const hc = give(g, 'ETC_209', 3);
    g.apply({ type: 'play', handUid: hc.uid });
    expect(foe.hero.hp).toBe(hp - 2);
    expect(e1.hp).toBe(getCard(FILLER).health! - 2);
  });

  it('沒有花光法力就不會觸發終章', () => {
    const g = newGame();
    const foe = g.s.players[1];
    const e1 = put(g, FILLER, 1);
    const hp = foe.hero.hp;
    const hc = give(g, 'ETC_209', 4);
    g.apply({ type: 'play', handUid: hc.uid, target: e1.uid });
    expect(foe.hero.hp).toBe(hp);
    expect(e1.hp).toBe(getCard(FILLER).health! - 2);
  });

  it('穿越烈焰：終章額外 +1/+1', () => {
    const g = newGame();
    const m = put(g, FILLER, 0);
    const hc = give(g, 'JAM_017', 0);
    g.apply({ type: 'play', handUid: hc.uid, target: m.uid });
    expect(g.atkOf(m)).toBe(getCard(FILLER).attack! + 1);
    const g2 = newGame();
    const m2 = put(g2, FILLER, 0);
    const hc2 = give(g2, 'JAM_017', 1);
    g2.apply({ type: 'play', handUid: hc2.uid, target: m2.uid });
    expect(g2.atkOf(m2)).toBe(getCard(FILLER).attack!);
  });

  it('熱舞：從牌堆召喚 1 費手下，終章再多一個', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.deck = Array.from({ length: 5 }, () => g.newHandCard('CS2_189'));
    const hc = give(g, 'ETC_318', 3);
    g.apply({ type: 'play', handUid: hc.uid });
    expect(p.board.length).toBe(3);
  });

  it('食人魔寶石投擲者：終章對敵人造成等同法力水晶數的傷害', () => {
    const g = newGame();
    const foe = g.s.players[1];
    const hp = foe.hero.hp;
    const hc = give(g, 'DEEP_029', 3);
    g.s.players[0].maxMana = 3;
    g.apply({ type: 'play', handUid: hc.uid });
    expect(hp - foe.hero.hp).toBeLessThanOrEqual(3);
    expect(hp - foe.hero.hp).toBeGreaterThan(0);
  });
});
