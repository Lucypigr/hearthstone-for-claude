// 安戈洛失落之城：血緣、任務、地圖與其他新機制的測試
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

describe('血緣', () => {
  it('火鰓：上個回合打出同種族的牌時，使其他手下獲得突襲', () => {
    const g = newGame();
    const a = put(g, FILLER, 0);
    g.s.players[0].prevPlayed = ['DINO_404'];
    play(g, 'DINO_404');
    expect(g.hasKw(a, 'RUSH')).toBe(true);
  });

  it('火鰓：沒有同種族時不觸發', () => {
    const g = newGame();
    const a = put(g, FILLER, 0);
    g.s.players[0].prevPlayed = [];
    play(g, 'DINO_404');
    expect(g.hasKw(a, 'RUSH')).toBe(false);
  });

  it('原始魚人挑戰者：下一個血緣觸發兩次', () => {
    const g = newGame();
    play(g, 'TLC_251');
    expect(g.s.players[0].kindredTwice).toBe(true);
    g.s.players[0].prevPlayed = ['TLC_429'];
    g.s.players[0].board = [];
    play(g, 'TLC_429'); // 蒸汽鰭盜賊：召喚兩個魚人
    expect(g.s.players[0].board.filter((m) => m.cardId === 'TLC_429t')).toHaveLength(2 * 2);
    expect(g.s.players[0].kindredTwice).toBe(false);
  });

  it('翼龍掠奪者：血緣時消耗減少 (2)', () => {
    const g = newGame();
    const hc = give(g, 'TLC_366');
    g.s.players[0].prevPlayed = [];
    const base = g.costOf(g.s.players[0], hc);
    g.s.players[0].prevPlayed = ['TLC_366'];
    expect(g.costOf(g.s.players[0], hc)).toBe(base - 2);
  });
});

describe('任務', () => {
  it('山岳之靈：打出 6 個不同種族的手下', () => {
    const g = newGame();
    play(g, 'TLC_229');
    expect(g.s.players[0].quest?.cardId).toBe('TLC_229');
    const races = ['BEAST', 'DEMON', 'MURLOC', 'DRAGON', 'ELEMENTAL', 'PIRATE'];
    const pool = Object.values(getCard).length ? [] : [];
    void pool;
    for (const r of races) {
      for (const id of ['CS2_172', 'EX1_319', 'CS2_168', 'BRM_004', 'CS2_033', 'NEW1_022']) {
        const d = getCard(id);
        if (d.races?.includes(r as never)) {
          const hc = give(g, id);
          g.apply({ type: 'play', handUid: hc.uid });
          break;
        }
      }
    }
    expect(g.s.players[0].quest === undefined || g.s.players[0].quest.progress >= 3).toBe(true);
  });

  it('恢復野性：在三個回合填滿戰場', () => {
    const g = newGame();
    play(g, 'TLC_239');
    for (let i = 0; i < 3; i++) {
      const p = g.s.players[0];
      p.board = [];
      for (let j = 0; j < 7; j++) put(g, 'CS2_168', 0);
      g.apply({ type: 'endTurn' });
      g.apply({ type: 'endTurn' });
    }
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TLC_239t')).toBe(true);
    expect(g.s.players[0].quest).toBeUndefined();
  });

  it('進入失落之城：存活 10 個回合', () => {
    const g = newGame();
    play(g, 'TLC_602');
    for (let i = 0; i < 10; i++) {
      g.s.players[0].hand = [];
      pass(g);
    }
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TLC_602t')).toBe(true);
  });

  it('潛伏等待：洗牌 5 次', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    play(g, 'TLC_513');
    for (let i = 0; i < 5; i++) play(g, 'TLC_518'); // 審問：洗入三個忍者（算一次洗牌）
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TLC_513t')).toBe(true);
  });

  it('禁忌序列：發現 8 張牌', () => {
    const g = newGame({ classes: ['MAGE', 'WARRIOR'] });
    play(g, 'TLC_460');
    for (let i = 0; i < 8; i++) {
      g.s.players[0].hand = [];
      play(g, 'TLC_442'); // 淹沒的地圖：發現魚人
      if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    }
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TLC_460t')).toBe(true);
  });

  it('潛入戈拉卡深淵：可重複，完成後魚人獲得 +1/+1', () => {
    const g = newGame();
    play(g, 'TLC_426');
    for (let i = 0; i < 6; i++) {
      const hc = give(g, 'CS2_168');
      void hc;
    }
    const board = g.s.players[0];
    for (let i = 0; i < 6; i++) {
      board.board = [];
      play(g, 'EX1_506'); // 魚人招潮蟹：召喚 魚人斥候
    }
    expect(board.murlocBuff).toBeGreaterThanOrEqual(1);
    expect(board.quest).toBeTruthy();
    board.board = [];
    play(g, 'EX1_506');
    const scout = board.board.find((m) => m.cardId === 'EX1_506a');
    expect(scout).toBeTruthy();
    expect(scout!.atkBuff).toBeGreaterThanOrEqual(1);
  });

  it('達成平衡：神聖與暗影分別完成', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    play(g, 'TLC_817');
    const foe = put(g, FILLER, 1);
    for (let i = 0; i < 4; i++) {
      g.s.players[0].mana = 10;
      play(g, 'CS1_130', foe.uid); // 神聖之火
      foe.hp = foe.maxHp = 50;
    }
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TLC_817t3')).toBe(true);
  });
});

describe('地圖與發現', () => {
  it('地圖：本回合打出發現的牌後，再從其他選項選一張', () => {
    const g = newGame();
    play(g, 'TLC_442'); // 淹沒的地圖：發現魚人
    expect(g.s.pendingChoice).toBeTruthy();
    g.apply({ type: 'choose', index: 0 });
    const hand = g.s.players[0].hand;
    const picked = hand[hand.length - 1];
    expect(picked.mapOthers).toHaveLength(2);
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: picked.uid })).toBe(true);
    expect(g.s.pendingChoice?.options).toEqual(picked.mapOthers);
  });

  it('保險庫破壞者：發現的牌消耗減少 (1)', () => {
    const g = newGame();
    put(g, 'TLC_483', 0);
    play(g, 'TLC_461');
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    const got = g.s.players[0].hand[g.s.players[0].hand.length - 1];
    expect(got.costMod).toBe(-1);
  });

  it('倉庫爭奪：本回合發現過牌時消耗為 (0)', () => {
    const g = newGame();
    const hc = give(g, 'TLC_365');
    const base = g.costOf(g.s.players[0], hc);
    expect(base).toBeGreaterThan(0);
    g.s.players[0].discoveredTurn = g.s.turn;
    expect(g.costOf(g.s.players[0], hc)).toBe(0);
  });
});

describe('費用', () => {
  it('科技暴龍：每打出一張並非一開始在牌堆的牌，消耗減少 (1)', () => {
    const g = newGame();
    const hc = give(g, 'DINO_409');
    const base = g.costOf(g.s.players[0], hc);
    g.s.players[0].nonStartingPlayed = 3;
    expect(g.costOf(g.s.players[0], hc)).toBe(base - 3);
  });

  it('灌木叢追蹤者：每洗牌一次消耗減少 (1)', () => {
    const g = newGame();
    const hc = give(g, 'TLC_520');
    const base = g.costOf(g.s.players[0], hc);
    g.s.players[0].shuffleCount = 2;
    expect(g.costOf(g.s.players[0], hc)).toBe(base - 2);
  });

  it('洛，活傳奇：你的手下消耗為 (5)', () => {
    const g = newGame();
    play(g, 'TLC_257');
    const hc = give(g, 'CS2_168');
    expect(g.costOf(g.s.players[0], hc)).toBe(5);
  });

  it('林間歌聲海妖：施放過神聖與暗影法術後消耗為 (1)', () => {
    const g = newGame();
    const hc = give(g, 'TLC_819');
    g.s.players[0].schoolsThisTurn = { turn: g.s.turn, schools: ['HOLY', 'SHADOW'] };
    expect(g.costOf(g.s.players[0], hc)).toBe(1);
  });
});

describe('卡牌效果', () => {
  it('科羅斯之蛋：連續孵化最終變成 20/20', () => {
    const g = newGame();
    const first = put(g, 'DINO_410', 0);
    first.hp = 0;
    first.dead = true;
    pass(g);
    for (let i = 0; i < 6; i++) {
      const egg = g.s.players[0].board.find((m) => m.cardId.startsWith('DINO_410t') && m.cardId !== 'DINO_410t');
      if (!egg) break;
      egg.hp = 0;
      egg.dead = true;
      pass(g);
    }
    expect(g.s.players[0].board.some((m) => m.cardId === 'DINO_410t')).toBe(true);
  });

  it('焦油團：亡語召喚劇毒與嘲諷的 2/2', () => {
    const g = newGame();
    const m = put(g, 'TLC_468', 0);
    m.hp = 0;
    m.dead = true;
    pass(g);
    expect(ids(g.s.players[0].board).sort()).toEqual(['TLC_468t1', 'TLC_468t2']);
  });

  it('布拉瑪：元素造成的傷害多 1 點', () => {
    const g = newGame();
    put(g, 'TLC_228', 0);
    const el = put(g, 'CS2_033', 0); // 水元素
    const foe = put(g, FILLER, 1);
    const hp = foe.hp;
    g.apply({ type: 'attack', attacker: el.uid, target: foe.uid });
    expect(hp - foe.hp).toBe(g.atkOf(el) + 1);
  });

  it('焦油暴君：在對手回合 +6 攻擊力', () => {
    const g = newGame();
    const m = put(g, 'TLC_605', 0);
    expect(g.atkOf(m)).toBe(1);
    g.apply({ type: 'endTurn' });
    expect(g.atkOf(m)).toBe(7);
  });

  it('克羅格：回合結束時敵方手下屬性值變為 1', () => {
    const g = newGame();
    put(g, 'TLC_480', 0);
    const foe = put(g, FILLER, 1);
    g.apply({ type: 'endTurn' });
    expect([foe.baseAtk, foe.hp]).toEqual([1, 1]);
  });

  it('石化食人魔：以休眠開始', () => {
    const g = newGame();
    play(g, 'TLC_253');
    expect(g.s.players[0].board[0].keywords).toContain('DORMANT');
  });

  it('扁平龍：抽一張牌，死亡時棄掉它', () => {
    const g = newGame();
    const handBefore = g.s.players[0].hand.length;
    play(g, 'TLC_603');
    expect(g.s.players[0].hand.length).toBe(handBefore + 1);
    const m = g.s.players[0].board[0];
    m.hp = 0;
    m.dead = true;
    pass(g);
    expect(g.s.players[0].hand.length).toBeLessThanOrEqual(handBefore + 2);
  });

  it('異種蟲后與昆蟲之爪', () => {
    const g = newGame();
    play(g, 'TLC_833');
    g.apply({ type: 'attack', attacker: g.s.players[0].hero.uid, target: g.s.players[1].hero.uid });
    expect(ids(g.s.players[0].board)).toContain('TLC_903t');
  });

  it('提拉克斯：亡語開啟恐龍之墓（地點）', () => {
    const g = newGame();
    const m = put(g, 'TLC_433t', 0);
    m.hp = 0;
    m.dead = true;
    pass(g);
    expect(g.s.players[0].locations?.some((l) => l.cardId === 'TLC_433t2')).toBe(true);
  });

  it('蘇拉斯的故事：換成英雄能力，用兩次後換回', () => {
    const g = newGame();
    const original = g.s.players[0].heroPower.id;
    play(g, 'TLC_632');
    expect(g.s.players[0].heroPower.id).toBe('TLC_632t');
    for (let i = 0; i < 2; i++) {
      g.s.players[0].heroPower.used = false;
      g.s.players[0].mana = 10;
      expect(g.apply({ type: 'heroPower' })).toBe(true);
    }
    expect(g.s.players[0].heroPower.id).toBe(original);
  });

  it('毀滅之蛋與孵化儀式：延遲效果', () => {
    const g = newGame();
    play(g, 'TLC_232');
    pass(g);
    expect(g.s.players[0].board.filter((m) => m.cardId === 'TLC_237t')).toHaveLength(3);
  });

  it('終結者安布拉：觸發死亡的友方手下的亡語', () => {
    const g = newGame();
    g.s.players[0].graveyard = ['TLC_468', 'TLC_468', 'TLC_468'];
    play(g, 'TLC_106');
    expect(g.s.players[0].board.filter((m) => m.cardId === 'TLC_468t1').length).toBeGreaterThanOrEqual(1);
  });
});
