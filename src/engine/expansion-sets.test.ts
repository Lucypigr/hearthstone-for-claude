// 哥布林與地精、冰封王座、狗頭人與地下城、黑木森林、奧丹姆、惡魔獵人新兵：新機制的測試
import { describe, expect, it } from 'vitest';
import { getCard } from '../cards/registry';
import { Game } from './game';
import type { Minion, PlayerId, PlayerState } from './state';

const FILLER = 'CS2_182'; // 冰風雪人

function newGame(opts: { deck?: string[]; classes?: PlayerState['heroClass'][] } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const [c0, c1] = opts.classes ?? ['MAGE', 'WARRIOR'];
  const g = Game.create({ decks: [deck, deck], classes: [c0, c1], names: ['玩家', '電腦'], ai: [false, false], seed: 42, first: 0 });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, cardId: string, pid: PlayerId = g.s.current) {
  const hc = g.newHandCard(cardId);
  g.s.players[pid].hand.push(hc);
  g.s.players[pid].mana = 10;
  g.s.players[pid].maxMana = 10;
  return hc;
}

function put(g: Game, cardId: string, pid: PlayerId): Minion {
  const m = g.makeMinion(pid, cardId);
  m.sleeping = false;
  g.s.players[pid].board.push(m);
  g.recalcAuras();
  return m;
}

function play(g: Game, cardId: string, target?: number) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, target })).toBe(true);
}

describe('任務與法術石', () => {
  it('掠奪天空神殿：施放 10 張法術後，英雄能力變成晉升卷軸', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'ULD_433');
    expect(me.quest?.cardId).toBe('ULD_433');
    g.s.players[1].hero.hp = 100;
    g.s.players[1].hero.maxHp = 100;
    for (let i = 0; i < 9; i++) play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(me.quest?.progress).toBe(9);
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(me.quest).toBeUndefined();
    expect(me.heroPower.id).toBe('ULD_433p');
    // 已經有任務時不能再打出任務
    play(g, 'ULD_433');
    expect(g.canPlay(give(g, 'ULD_433').uid).ok).toBe(false);
  });

  it('弱效翡翠法術石：打出奧秘後在手牌中升級', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const stone = give(g, 'LOOT_080');
    play(g, 'AT_060');
    expect(stone.cardId).toBe('LOOT_080t2');
    g.apply({ type: 'play', handUid: stone.uid });
    expect(g.s.players[0].board.filter((m) => m.cardId === 'LOOT_077t').length).toBe(3);
  });
});

describe('休眠', () => {
  it('無邊黑暗：休眠時不能攻擊、不能被指定，對手抽到蠟燭就甦醒', () => {
    const g = newGame();
    play(g, 'LOOT_526');
    const darkness = g.s.players[0].board.find((m) => m.cardId === 'LOOT_526')!;
    expect(g.hasKw(darkness, 'DORMANT')).toBe(true);
    expect(g.s.players[1].deck.filter((h) => h.cardId === 'LOOT_526t').length).toBe(3);
    darkness.sleeping = false;
    expect(g.canAttack(darkness.uid)).toBe(false);
    g.apply({ type: 'endTurn' });
    const foe = g.s.players[1];
    const fireball = give(g, 'CS2_029', 1);
    expect(g.validTargets(g.playTargetReq(fireball.uid)!, 1, true)).not.toContain(darkness.uid);
    // 讓對手抽到蠟燭
    foe.deck.push(foe.deck.splice(foe.deck.findIndex((h) => h.cardId === 'LOOT_526t'), 1)[0]);
    play(g, 'CS2_023');
    expect(g.hasKw(darkness, 'DORMANT')).toBe(false);
  });

  it('瑪洛尼：死亡後休眠，2 個友方野獸死亡後甦醒', () => {
    const g = newGame();
    const me = g.s.players[0];
    const malorne = put(g, 'GVG_035', 0);
    malorne.hp = 1;
    play(g, 'CS2_189', malorne.uid);
    const dormant = me.board.find((m) => m.cardId === 'GVG_035')!;
    expect(g.hasKw(dormant, 'DORMANT')).toBe(true);
    for (let i = 0; i < 2; i++) {
      const beast = put(g, 'CS2_120', 0); // 河鱷
      play(g, 'CS2_029', beast.uid);
    }
    expect(g.hasKw(dormant, 'DORMANT')).toBe(false);
  });
});

describe('回合與手牌', () => {
  it('坦普拉斯：對手進行兩個回合，然後你進行兩個回合', () => {
    const g = newGame();
    play(g, 'LOOT_538');
    const order: PlayerId[] = [];
    for (let i = 0; i < 5; i++) {
      g.apply({ type: 'endTurn' });
      order.push(g.s.current);
    }
    expect(order).toEqual([1, 1, 0, 0, 1]);
  });

  it('法力燃燒：對手的下個回合少 2 個法力水晶', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    play(g, 'BT_753');
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].mana).toBe(0);
  });

  it('暮色港獵人：在手牌中每回合對調攻擊力與生命值', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const hunter = give(g, 'GIL_200');
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(hunter.cardId).toBe('GIL_200t');
    expect(g.handDef(hunter).attack).toBe(5);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(hunter.cardId).toBe('GIL_200');
  });

  it('魔眼光束：流放時消耗為 (1)', () => {
    const g = newGame({ classes: ['DEMONHUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    const beam = give(g, 'BT_801');
    expect(g.costOf(me, beam)).toBe(1);
    me.hand.push(g.newHandCard(FILLER));
    me.hand.unshift(g.newHandCard(FILLER));
    expect(g.costOf(me, beam)).toBe(3);
  });

  it('暮落艾維娜：每回合打出的第一張牌消耗為 (0)', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'GIL_800', 0);
    const fireball = give(g, 'CS2_029');
    expect(g.costOf(me, fireball)).toBe(0);
    play(g, 'CS2_231');
    expect(g.costOf(me, fireball)).toBe(4);
  });

  it('血腥女王菈娜薩爾：本場每棄掉一張牌 +1 攻擊力', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    const lana = put(g, 'ICC_841', 0);
    me.hand = [];
    give(g, FILLER);
    play(g, 'EX1_308', g.s.players[1].hero.uid);
    expect(g.atkOf(lana)).toBe(2);
  });
});

describe('其他效果', () => {
  it('哮斗龍：重複你打出過的戰吼', () => {
    const g = newGame();
    const foe = g.s.players[1];
    play(g, 'CS2_189', foe.hero.uid); // 精靈弓箭手：造成 1 點傷害
    play(g, 'CS2_189', foe.hero.uid);
    const hp = foe.hero.hp;
    play(g, 'GIL_820');
    // 兩次戰吼各對隨機角色造成 1 點傷害
    const damaged = [g.s.players[0].hero, foe.hero, ...g.s.players[0].board, ...foe.board].reduce((x, c) => x + (c.maxHp - c.hp), 0);
    expect(damaged - (30 - hp)).toBe(2);
  });

  it('褻瀆：有手下死亡就再施放一次', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    put(g, 'CS2_231', 1); // 1/1
    const croc = put(g, 'CS2_120', 1); // 2/3
    play(g, 'ICC_041');
    // 第一次殺死小精靈 → 第二次 → 河鱷剩 1 點，沒有手下死亡就停止
    expect(croc.hp).toBe(1);
    expect(g.s.players[1].board.length).toBe(1);
  });

  it('戰馬訓練師只強化白銀之手新兵', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    put(g, 'AT_075', 0);
    const yeti = put(g, FILLER, 0);
    expect(g.atkOf(yeti)).toBe(4);
    expect(g.hasKw(yeti, 'TAUNT')).toBe(false);
  });

  it('狗頭人武僧：你的英雄無法成為敵方法術的目標', () => {
    const g = newGame();
    put(g, 'LOOT_382', 1);
    const fireball = give(g, 'CS2_029');
    const targets = g.validTargets(g.playTargetReq(fireball.uid)!, 0, true);
    expect(targets).not.toContain(g.s.players[1].hero.uid);
    expect(targets).toContain(g.s.players[0].hero.uid);
  });

  it('心靈破壞者：英雄能力無法使用；瑪爾加尼斯：你的英雄免疫', () => {
    const g = newGame();
    g.s.players[0].mana = 10;
    put(g, 'ICC_902', 1);
    expect(g.canHeroPower()).toBe(false);

    const g2 = newGame();
    put(g2, 'GVG_021', 0);
    play(g2, 'CS2_029', g2.s.players[0].hero.uid);
    expect(g2.s.players[0].hero.hp).toBe(30);
  });

  it('刀刃護手：攻擊力等同你的護甲值', () => {
    const g = newGame({ classes: ['WARRIOR', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'LOOT_044');
    expect(g.atkOf(me.hero)).toBe(0);
    me.hero.armor = 5;
    expect(g.atkOf(me.hero)).toBe(5);
    expect(g.attackTargets(me.hero.uid)).not.toContain(g.s.players[1].hero.uid);
  });

  it('彌米倫之首：有 3 個機械時組成 V-07-TR-0N', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'GVG_111', 0);
    put(g, 'GVG_082', 0);
    put(g, 'GVG_082', 0);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.board.some((m) => m.cardId === 'GVG_111t')).toBe(true);
    expect(me.board.some((m) => m.cardId === 'GVG_111')).toBe(false);
  });

  it('德拉克瑞附魔師：你的回合結束效果觸發兩次', () => {
    const g = newGame();
    put(g, 'ICC_901', 0);
    put(g, 'GIL_117', 0);
    const yeti = put(g, FILLER, 1);
    yeti.maxHp = 10;
    yeti.hp = 9;
    g.apply({ type: 'endTurn' });
    expect(yeti.hp).toBe(5);
  });

  it('沙漠爵士芬利：發現一個強化後的英雄能力', () => {
    const g = newGame({ deck: [], classes: ['PALADIN', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'ULD_500');
    const opts = g.s.pendingChoice!.options;
    expect(opts.length).toBe(3);
    g.apply({ type: 'choose', index: 0 });
    expect(me.heroPower.id).toBe(opts[0]);
    expect(g.powerInfo(me).name).toBe(getCard(opts[0]).name);
  });
});
