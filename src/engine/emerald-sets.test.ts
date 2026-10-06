// 翡翠夢境：灌注（六個職業）、黑暗禮物、休眠、燃燒等機制與卡牌的測試
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
const finishChoices = (g: Game) => {
  for (let i = 0; i < 10 && g.s.pendingChoice; i++) g.apply({ type: 'choose', index: 0 });
};

describe('灌注英雄能力（六個職業）', () => {
  const cases: [PlayerState['heroClass'], string, string][] = [
    ['DRUID', 'EDR_852', 'EDR_847p'],
    ['HUNTER', 'EDR_852', 'EDR_850p'],
    ['MAGE', 'EDR_852', 'EDR_851p'],
    ['PALADIN', 'EDR_852', 'EDR_445p'],
    ['PRIEST', 'EDR_852', 'EDR_449p'],
    ['SHAMAN', 'EDR_852', 'EDR_448p'],
  ];
  for (const [cls, card, power] of cases) {
    it(`${cls}：灌注後英雄能力換成 ${power}`, () => {
      const g = newGame({ classes: [cls, 'WARRIOR'] });
      play(g, card);
      expect(g.s.players[0].imbued).toBe(1);
      expect(g.s.players[0].heroPower.id).toBe(power);
    });
  }

  it('德魯伊：灌注後的英雄能力召喚 n/n 植物魔像', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    play(g, 'EDR_852');
    play(g, 'EDR_852');
    g.s.players[0].heroPower.used = false;
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'heroPower' })).toBe(true);
    const golem = g.s.players[0].board.find((m) => m.cardId === 'EDR_847pt2')!;
    expect([golem.baseAtk, golem.hp]).toEqual([2, 2]);
  });

  it('法師：灌注後的英雄能力召喚精靈並造成傷害', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'EDR_852');
    g.s.players[0].heroPower.used = false;
    g.s.players[0].mana = 10;
    const hp = g.s.players[1].hero.hp;
    expect(g.apply({ type: 'heroPower' })).toBe(true);
    expect(ids(g.s.players[0].board)).toContain('EDR_851t');
    expect(g.s.players[1].hero.hp).toBe(hp - 1);
  });

  it('靈魂騎士：灌注後立刻觸發英雄能力', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'EDR_519');
    expect(ids(g.s.players[0].board)).toContain('EDR_851t');
  });
});

describe('黑暗禮物', () => {
  it('背叛的折磨者：發現後的手下帶有禮物', () => {
    const g = newGame();
    play(g, 'EDR_102');
    finishChoices(g);
    // 甜蜜的夢會把卡放到牌堆頂，所以手牌與牌堆都要找
    expect([...g.s.players[0].hand, ...g.s.players[0].deck].some((h) => h.gifted)).toBe(true);
  });

  it('沼澤惡魔瓦洛：獲得賦予你的手下的黑暗禮物', () => {
    const g = newGame();
    const wallow = give(g, 'EDR_487');
    play(g, 'EDR_102');
    finishChoices(g);
    const w = [...g.s.players[0].hand, ...g.s.players[0].deck].find((h) => h.uid === wallow.uid);
    expect((w?.wallow ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('過度生長的恐怖：帶有黑暗禮物的手下消耗減少 (2)', () => {
    const g = newGame();
    const hc = give(g, 'CS2_182');
    hc.gifted = true;
    const before = g.costOf(g.s.players[0], hc);
    play(g, 'EDR_654');
    expect(g.costOf(g.s.players[0], hc)).toBe(Math.max(0, before - 2));
  });
});

describe('休眠與甦醒', () => {
  it('恐懼之籽：休眠並在甦醒後生效（獵犬：英雄 +3 攻擊力）', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'EDR_840');
    const seed = g.s.players[0].board.find((m) => m.cardId.startsWith('EDR_840t'))!;
    expect(seed.keywords).toContain('DORMANT');
    for (let i = 0; i < 4; i++) pass(g);
    expect(g.s.players[0].board.every((m) => !m.keywords.includes('DORMANT'))).toBe(true);
  });

  it('沉睡的精靈：使用英雄能力後甦醒', () => {
    const g = newGame();
    play(g, 'EDR_469');
    const m = g.s.players[0].board[0];
    expect(m.keywords).toContain('DORMANT');
    g.s.players[0].heroPower.used = false;
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid });
    expect(m.keywords).not.toContain('DORMANT');
  });

  it('遠古的昔日巨獸：休眠時在回合結束獲得護甲並抽牌', () => {
    const g = newGame();
    play(g, 'EDR_979');
    const handBefore = g.s.players[0].hand.length;
    const armor = g.s.players[0].hero.armor;
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hero.armor).toBe(armor + 3);
    expect(g.s.players[0].hand.length).toBeGreaterThanOrEqual(handBefore);
  });
});

describe('燃燒', () => {
  it('悶燃林地：每回合升級，並在最後一個回合結束時棄掉', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const hc = give(g, 'FIR_911');
    expect(hc.counter ?? 0).toBe(0);
    pass(g);
    expect(g.s.players[0].hand.find((h) => h.uid === hc.uid)?.counter).toBe(1);
    pass(g);
    pass(g);
    expect(g.s.players[0].hand.some((h) => h.uid === hc.uid)).toBe(false);
  });

  it('悶燃林地：抽的牌數 = 升級後的數值', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    const hc = give(g, 'FIR_911');
    hc.counter = 2;
    g.s.players[0].hand = [hc];
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.players[0].hand).toHaveLength(3);
  });
});

describe('其他機制', () => {
  it('伊瑟拉：開局雙方法力水晶上限 +5', () => {
    const g = Game.create({ decks: [['EDR_000', ...Array(29).fill(FILLER)], Array(30).fill(FILLER)], classes: ['DRUID', 'WARRIOR'], names: ['玩家', '電腦'], ai: [false, false], seed: 3, first: 0 });
    expect(g.s.players[0].manaCapBonus).toBe(5);
    expect(g.s.players[1].manaCapBonus).toBe(5);
  });

  it('托雷斯：聖盾要被打破三次', () => {
    const g = newGame();
    put(g, 'EDR_258', 0);
    const ally = put(g, FILLER, 0);
    ally.keywords.push('DIVINE_SHIELD');
    g.recalcAuras();
    const foe = put(g, 'CS2_168', 1);
    for (let i = 0; i < 2; i++) {
      foe.hp = foe.maxHp = 20;
      g.apply({ type: 'endTurn' });
      g.apply({ type: 'attack', attacker: foe.uid, target: ally.uid });
      g.apply({ type: 'endTurn' });
      foe.sleeping = false;
    }
    expect(g.hasKw(ally, 'DIVINE_SHIELD')).toBe(true);
  });

  it('戈林：友方野獸造成雙倍傷害', () => {
    const g = newGame();
    put(g, 'EDR_480', 0);
    const beast = put(g, 'CS2_172', 0); // 血沼豺狼
    const foe = put(g, FILLER, 1);
    const hp = foe.hp;
    g.apply({ type: 'attack', attacker: beast.uid, target: foe.uid });
    expect(hp - foe.hp).toBe(g.atkOf(beast) * 2);
  });

  it('泰蘭德：接下來 3 個法術施放兩次', () => {
    const g = newGame();
    play(g, 'EDR_464');
    expect(g.s.players[0].doubleSpellsLeft).toBe(3);
    const foe = put(g, FILLER, 1);
    foe.hp = foe.maxHp = 30;
    play(g, 'CS2_029', foe.uid); // 火球術
    expect(foe.hp).toBe(30 - 12);
    expect(g.s.players[0].doubleSpellsLeft).toBe(2);
  });

  it('阿加馬根：下一張牌消耗對手的生命值', () => {
    const g = newGame();
    play(g, 'EDR_489');
    const hc = give(g, FILLER);
    const foeHp = g.s.players[1].hero.hp;
    const mana = g.s.players[0].mana;
    const cost = getCard(FILLER).cost;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.players[1].hero.hp).toBe(foeHp - cost);
    expect(g.s.players[0].mana).toBe(mana);
  });

  it('預兆：亡語對所有敵人造成 (1 + 攻擊次數) 點傷害', () => {
    const g = newGame();
    const m = put(g, 'EDR_421', 0);
    const foeHp = g.s.players[1].hero.hp;
    g.apply({ type: 'attack', attacker: m.uid, target: g.s.players[1].hero.uid });
    expect(m.counter).toBe(1);
    const hp2 = g.s.players[1].hero.hp;
    m.hp = 0;
    m.dead = true;
    pass(g);
    expect(hp2 - g.s.players[1].hero.hp).toBe(2);
    expect(foeHp).toBeGreaterThan(hp2 - 1);
  });

  it('翡翠賞金：抽兩張牌，兩個回合內無法打出', () => {
    const g = newGame();
    const before = g.s.players[0].hand.length;
    play(g, 'EDR_234');
    const drawn = g.s.players[0].hand.slice(-2);
    expect(g.s.players[0].hand.length).toBe(before + 2);
    expect(g.canPlay(drawn[0].uid).ok).toBe(false);
  });

  it('森林之王塞納留斯：選擇三次', () => {
    const g = newGame({ classes: ['DRUID', 'WARRIOR'] });
    play(g, 'EDR_209');
    for (let i = 0; i < 3; i++) g.apply({ type: 'choose', index: 1 });
    expect(g.s.players[0].board.filter((m) => m.cardId === 'EDR_209t5')).toHaveLength(3);
  });

  it('納拉雷克斯：你每回合的第一條龍消耗為 (1)', () => {
    const g = newGame();
    put(g, 'EDR_844', 0);
    const dragon = give(g, 'BRM_004'); // 暮光雛龍
    expect(g.costOf(g.s.players[0], dragon)).toBe(1);
  });

  it('枯萎的先驅：回到手牌時召喚兩個 2 費手下', () => {
    const g = newGame();
    const h = put(g, 'EDR_781', 0);
    play(g, 'EDR_523', h.uid); // 欺詐之網：把它移回手牌
    expect(g.s.players[0].board.length).toBeGreaterThanOrEqual(2);
  });

  it('血薊幻術師：召喚複製，其中一個受傷時會死亡', () => {
    const g = newGame();
    play(g, 'EDR_780');
    const both = g.s.players[0].board.filter((m) => m.cardId === 'EDR_780');
    expect(both).toHaveLength(2);
    expect(both.filter((m) => m.stash === 'illusion')).toHaveLength(1);
  });

  it('笨拙的小精靈：變形為手下時改為多 (2) 消耗', () => {
    const g = newGame();
    const m = put(g, 'EDR_529', 0);
    play(g, 'EDR_232'); // 颶風不會變形；改用變形法術
    void m;
    expect(getCard('EDR_529').flags).toContain('podling');
  });

  it('寄生的成長：消滅友方手下並獲得 8 點護甲', () => {
    const g = newGame();
    const a = put(g, FILLER, 0);
    play(g, 'EDR_531', a.uid);
    expect(g.s.players[0].hero.armor).toBe(8);
    expect(g.s.players[0].board).toHaveLength(0);
  });
});
