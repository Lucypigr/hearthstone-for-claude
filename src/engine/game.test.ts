import { describe, expect, it } from 'vitest';
import { getCard } from '../cards/registry';
import { Game } from './game';
import type { Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人

function newGame(opts: { first?: PlayerId; deck?: string[] } = {}): Game {
  const deck = opts.deck ?? Array(30).fill(FILLER);
  const g = Game.create({
    decks: [deck, deck],
    classes: ['MAGE', 'WARRIOR'],
    names: ['玩家', '電腦'],
    ai: [false, false],
    seed: 42,
    first: opts.first ?? 0,
  });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

/** 直接把卡牌放進目前玩家的手牌並給足法力 */
function give(g: Game, cardId: string, pid: PlayerId = g.s.current) {
  const hc = g.newHandCard(cardId);
  g.s.players[pid].hand.push(hc);
  g.s.players[pid].mana = 10;
  g.s.players[pid].maxMana = 10;
  return hc.uid;
}

/** 直接在場上放一個手下（可立即攻擊） */
function put(g: Game, cardId: string, pid: PlayerId): Minion {
  const m = g.makeMinion(pid, cardId);
  m.sleeping = false;
  g.s.players[pid].board.push(m);
  g.recalcAuras();
  return m;
}

function play(g: Game, cardId: string, target?: number, position?: number) {
  const uid = give(g, cardId);
  const ok = g.apply({ type: 'play', handUid: uid, target, position });
  expect(ok).toBe(true);
}

describe('對戰開始', () => {
  it('先攻 3 張、後攻 4 張 + 幸運幣，第一回合 1 點法力並抽牌', () => {
    const g = newGame();
    expect(g.s.phase).toBe('play');
    expect(g.s.players[0].hand.length).toBe(4);
    expect(g.s.players[1].hand.length).toBe(5);
    expect(g.s.players[1].hand.some((h) => h.cardId === 'GAME_005')).toBe(true);
    expect(g.s.players[0].mana).toBe(1);
  });

  it('起手換牌會換掉指定的卡且手牌數不變', () => {
    const deck = [...Array(15).fill('CS2_182'), ...Array(15).fill('CS2_231')];
    const g = Game.create({ decks: [deck, deck], classes: ['MAGE', 'WARRIOR'], names: ['A', 'B'], ai: [false, false], seed: 3, first: 0 });
    const hand = g.s.players[0].hand;
    const replace = hand.map((h) => h.uid);
    expect(g.apply({ type: 'mulligan', player: 0, replace })).toBe(true);
    const after = g.s.players[0].hand;
    expect(after.length).toBe(3);
    expect(after.some((h) => replace.includes(h.uid))).toBe(false);
    expect(g.s.players[0].deck.length).toBe(27);
  });

  it('結束回合後換對手，法力水晶增加', () => {
    const g = newGame();
    g.apply({ type: 'endTurn' });
    expect(g.s.current).toBe(1);
    expect(g.s.players[1].maxMana).toBe(1);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].maxMana).toBe(2);
  });
});

describe('法術', () => {
  it('火球術造成 6 點傷害，法術傷害 +1 時為 7', () => {
    const g = newGame();
    const enemy = g.s.players[1].hero;
    play(g, 'CS2_029', enemy.uid);
    expect(enemy.hp).toBe(24);
    put(g, 'CS2_142', 0);
    play(g, 'CS2_029', enemy.uid);
    expect(enemy.hp).toBe(17);
  });

  it('寒冰箭造成傷害並冰凍，冰凍的手下無法攻擊', () => {
    const g = newGame();
    g.apply({ type: 'endTurn' });
    const yeti = put(g, 'CS2_182', 0);
    g.apply({ type: 'endTurn' });
    // 對手回合被冰凍
    g.s.current = 1;
    play(g, 'CS2_024', yeti.uid);
    expect(yeti.hp).toBe(2);
    expect(yeti.frozen).toBe(true);
    g.apply({ type: 'endTurn' });
    expect(g.s.current).toBe(0);
    expect(g.canAttack(yeti.uid)).toBe(false);
    g.apply({ type: 'endTurn' });
    expect(yeti.frozen).toBe(false);
  });

  it('超載會鎖住下回合的法力', () => {
    const g = newGame();
    play(g, 'EX1_238', g.s.players[1].hero.uid);
    expect(g.s.players[0].overloadOwed).toBe(1);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].mana).toBe(g.s.players[0].maxMana - 1);
  });
});

describe('戰鬥', () => {
  it('手下互相攻擊並造成傷害，嘲諷必須優先攻擊', () => {
    const g = newGame();
    const a = put(g, 'CS2_182', 0);
    const b = put(g, 'CS2_182', 1);
    const taunt = put(g, 'CS1_042', 1);
    expect(g.attackTargets(a.uid)).toEqual([taunt.uid]);
    expect(g.apply({ type: 'attack', attacker: a.uid, target: b.uid })).toBe(false);
    expect(g.apply({ type: 'attack', attacker: a.uid, target: taunt.uid })).toBe(true);
    expect(g.s.players[1].board.includes(taunt)).toBe(false);
    expect(a.hp).toBe(4);
  });

  it('聖盾抵擋一次傷害', () => {
    const g = newGame();
    const a = put(g, 'CS2_182', 0);
    const squire = put(g, 'EX1_008', 1);
    g.apply({ type: 'attack', attacker: a.uid, target: squire.uid });
    expect(squire.hp).toBe(1);
    expect(g.hasKw(squire, 'DIVINE_SHIELD')).toBe(false);
  });

  it('剛上場的手下無法攻擊，衝鋒可以', () => {
    const g = newGame();
    play(g, 'CS2_182');
    const yeti = g.s.players[0].board[0];
    expect(g.canAttack(yeti.uid)).toBe(false);
    play(g, 'CS2_173');
    const charger = g.s.players[0].board[1];
    expect(g.canAttack(charger.uid)).toBe(true);
  });

  it('劇毒直接消滅手下', () => {
    const g = newGame();
    const cobra = put(g, 'EX1_170', 0);
    const yeti = put(g, 'CS2_182', 1);
    g.apply({ type: 'attack', attacker: cobra.uid, target: yeti.uid });
    expect(g.s.players[1].board.length).toBe(0);
  });

  it('武器讓英雄攻擊並消耗耐久度', () => {
    const g = newGame();
    play(g, 'CS2_106');
    const hero = g.s.players[0].hero;
    expect(g.atkOf(hero)).toBe(3);
    g.apply({ type: 'attack', attacker: hero.uid, target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(27);
    expect(g.s.players[0].weapon?.durability).toBe(1);
  });
});

describe('亡語 / 光環 / 觸發', () => {
  it('麻瘋地精死亡時對敵方英雄造成 2 點傷害', () => {
    const g = newGame();
    const gnome = put(g, 'EX1_029', 0);
    play(g, 'CS2_029', gnome.uid);
    expect(g.s.players[1].hero.hp).toBe(28);
  });

  it('麥田魔像死亡後在原位召喚損壞的魔像', () => {
    const g = newGame();
    put(g, 'CS2_231', 0);
    const golem = put(g, 'EX1_556', 0);
    put(g, 'CS2_231', 0);
    play(g, 'CS2_029', golem.uid);
    const board = g.s.players[0].board;
    expect(board.length).toBe(3);
    expect(board[1].cardId).toBe('skele21');
  });

  it('暴風城勇士光環 +1/+1，勇士死亡後受傷的手下不會因此死亡', () => {
    const g = newGame();
    const champ = put(g, 'CS2_222', 0);
    const wisp = put(g, 'CS2_231', 0);
    expect(g.atkOf(wisp)).toBe(2);
    expect(wisp.maxHp).toBe(2);
    wisp.hp = 1;
    play(g, 'CS2_234', wisp.uid); // 暗言術：痛 消滅勇士以外的目標測試不適用，改用火球
    expect(g.s.players[0].board.includes(wisp)).toBe(false);
    const wisp2 = put(g, 'CS2_231', 0);
    wisp2.hp = 1;
    play(g, 'CS2_029', champ.uid);
    play(g, 'CS2_029', champ.uid);
    expect(g.s.players[0].board.includes(champ)).toBe(false);
    expect(g.s.players[0].board.includes(wisp2)).toBe(true);
    expect(wisp2.hp).toBe(1);
    expect(g.atkOf(wisp2)).toBe(1);
  });

  it('沉默會移除增益與亡語', () => {
    const g = newGame();
    const gnome = put(g, 'EX1_029', 1);
    play(g, 'CS2_092', gnome.uid); // 王者祝福 +4/+4
    expect(g.atkOf(gnome)).toBe(6);
    play(g, 'CS2_203', gnome.uid); // 鐵喙貓頭鷹
    expect(g.atkOf(gnome)).toBe(2);
    expect(gnome.maxHp).toBe(1);
    play(g, 'CS2_029', gnome.uid);
    expect(g.s.players[0].hero.hp).toBe(30);
  });

  it('飛刀手在召喚手下時對隨機敵人造成傷害', () => {
    const g = newGame();
    put(g, 'NEW1_019', 0);
    play(g, 'CS2_231');
    expect(g.s.players[1].hero.hp).toBe(29);
  });

  it('小鬼召喚師回合結束時受傷並召喚小鬼', () => {
    const g = newGame();
    const imp = put(g, 'EX1_597', 0);
    g.apply({ type: 'endTurn' });
    expect(imp.hp).toBe(4);
    expect(g.s.players[0].board.length).toBe(2);
  });

  it('苦痛侍僧受傷時抽牌', () => {
    const g = newGame();
    const acolyte = put(g, 'EX1_007', 0);
    const before = g.s.players[0].hand.length;
    play(g, 'CS2_024', acolyte.uid);
    expect(g.s.players[0].hand.length).toBe(before + 1);
  });
});

describe('奧秘', () => {
  it('法術反制在對手回合反制法術', () => {
    const g = newGame();
    play(g, 'EX1_287');
    expect(g.s.players[0].secrets.length).toBe(1);
    g.apply({ type: 'endTurn' });
    play(g, 'CS2_029', g.s.players[0].hero.uid);
    expect(g.s.players[0].hero.hp).toBe(30);
    expect(g.s.players[0].secrets.length).toBe(0);
  });

  it('寒冰屏障阻止致命傷害', () => {
    const g = newGame();
    play(g, 'EX1_295');
    g.apply({ type: 'endTurn' });
    g.s.players[0].hero.hp = 3;
    play(g, 'CS2_029', g.s.players[0].hero.uid);
    expect(g.s.players[0].hero.hp).toBe(3);
    expect(g.s.phase).toBe('play');
  });
});

describe('英雄能力與疲勞', () => {
  it('法師英雄能力造成 1 點傷害', () => {
    const g = newGame();
    g.s.players[0].mana = 2;
    expect(g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid })).toBe(true);
    expect(g.s.players[1].hero.hp).toBe(29);
    expect(g.canHeroPower()).toBe(false);
  });

  it('牌庫抽完後受到遞增的疲勞傷害', () => {
    const g = newGame({ deck: Array(5).fill(FILLER) });
    for (let i = 0; i < 8; i++) g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hero.hp).toBeLessThan(30);
  });

  it('英雄死亡時遊戲結束', () => {
    const g = newGame();
    g.s.players[1].hero.hp = 5;
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(g.s.phase).toBe('over');
    expect(g.s.winner).toBe(0);
  });
});

describe('發現', () => {
  it('人類玩家的發現會暫停等待選擇，之後的效果作用在發現的卡上', () => {
    const g = newGame();
    const before = g.s.players[0].hand.length;
    // 我認識那個誰！：發現一張嘲諷手下，使其獲得 +1/+2
    expect(g.apply({ type: 'play', handUid: give(g, 'CFM_940') })).toBe(true);
    expect(g.s.pendingChoice?.options.length).toBe(3);
    expect(g.apply({ type: 'endTurn' })).toBe(false);
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.pendingChoice).toBeNull();
    const hand = g.s.players[0].hand;
    expect(hand.length).toBe(before + 1);
    expect(hand[hand.length - 1].hpBuff).toBe(2);
  });
});

describe('英雄卡', () => {
  it('賈拉克瑟斯：換英雄、獲得護甲、裝備武器，新英雄能力召喚煉獄火', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'EX1_323');
    expect(me.hero.cardId).toBe('EX1_323');
    expect(me.hero.armor).toBe(5);
    expect(me.weapon?.cardId).toBe('EX1_323w');
    expect(g.powerInfo(me).name).not.toBe('火焰衝擊');
    expect(g.apply({ type: 'heroPower' })).toBe(true);
    expect(me.board.some((m) => m.cardId === 'EX1_tk34')).toBe(true);
  });

  it('暗影死神安杜因：英雄能力在打出卡牌後可以再次使用', () => {
    const g = newGame();
    play(g, 'ICC_830');
    const foe = g.s.players[1].hero;
    expect(g.apply({ type: 'heroPower', target: foe.uid })).toBe(true);
    expect(g.canHeroPower()).toBe(false);
    play(g, 'CS2_231');
    expect(g.apply({ type: 'heroPower', target: foe.uid })).toBe(true);
    expect(foe.hp).toBe(26);
  });

  it('疫病蟲王：二選一的英雄能力', () => {
    const g = newGame();
    play(g, 'ICC_832');
    const me = g.s.players[0];
    expect(g.heroPowerOptions()?.length).toBe(2);
    expect(g.apply({ type: 'heroPower' })).toBe(false);
    const armor = me.hero.armor;
    expect(g.apply({ type: 'heroPower', option: 0 })).toBe(true);
    expect(me.hero.armor).toBe(armor + 3);
  });

  it('霜巫珍娜：元素獲得生命竊取，英雄能力擊殺手下時召喚水元素', () => {
    const g = newGame();
    const me = g.s.players[0];
    me.hero.hp = 20;
    play(g, 'ICC_833');
    const ele = me.board.find((m) => m.cardId === 'ICC_833t')!;
    expect(g.hasKw(ele, 'LIFESTEAL')).toBe(true);
    const wisp = put(g, 'CS2_231', 1);
    me.mana = 10;
    expect(g.apply({ type: 'heroPower', target: wisp.uid })).toBe(true);
    expect(me.board.filter((m) => m.cardId === 'ICC_833t').length).toBe(2);
  });

  it('奪血者古爾丹：生命竊取英雄能力', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'ICC_831');
    me.hero.hp = 20;
    me.mana = 10;
    expect(g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid })).toBe(true);
    expect(me.hero.hp).toBe(23);
  });

  it('黯刃烏瑟：四騎士到齊時消滅敵方英雄', () => {
    const g = newGame();
    play(g, 'ICC_829');
    for (let i = 0; i < 4; i++) {
      g.s.players[0].heroPower.used = false;
      g.s.players[0].mana = 10;
      expect(g.apply({ type: 'heroPower' })).toBe(true);
    }
    expect(g.s.phase).toBe('over');
    expect(g.s.winner).toBe(0);
  });

  it('死屍獸王雷克薩：連續發現兩隻野獸，縫合成殭屍獸', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'ICC_828');
    me.mana = 10;
    expect(g.apply({ type: 'heroPower' })).toBe(true);
    expect(g.s.pendingChoice?.options.length).toBe(3);
    const a = g.s.pendingChoice!.options[0];
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.pendingChoice?.title).toContain('第二隻');
    const b = g.s.pendingChoice!.options[0];
    g.apply({ type: 'choose', index: 0 });
    const zb = me.hand[me.hand.length - 1];
    expect(zb.cardId).toBe('ICC_828t');
    expect(zb.parts).toEqual([a, b]);
    const def = g.handDef(zb);
    expect(def.attack).toBe((getCard(a).attack ?? 0) + (getCard(b).attack ?? 0));
    expect(g.costOf(me, zb)).toBe(Math.min(10, getCard(a).cost + getCard(b).cost));
    expect(g.apply({ type: 'play', handUid: zb.uid })).toBe(true);
    const m = me.board[me.board.length - 1];
    expect(m.hp).toBe(def.health);
    for (const k of getCard(b).keywords ?? []) expect(g.hasKw(m, k)).toBe(true);
  });
});

describe('回音', () => {
  it('打出後把複製加入手牌，本回合可重複使用，回合結束時消失', () => {
    const g = newGame();
    const me = g.s.players[0];
    const enemy = put(g, 'CS2_182', 1); // 4/5
    const uid = give(g, 'GIL_506'); // 偷襲：對一個手下造成 2 點傷害
    const before = me.hand.length;
    expect(g.apply({ type: 'play', handUid: uid, target: enemy.uid })).toBe(true);
    expect(me.hand.length).toBe(before);
    const copy = me.hand[me.hand.length - 1];
    expect(copy.cardId).toBe('GIL_506');
    expect(copy.echo).toBe(true);
    expect(enemy.hp).toBe(3);
    // 複製本身也有回音：再打一次又會產生新的複製
    expect(g.apply({ type: 'play', handUid: copy.uid, target: enemy.uid })).toBe(true);
    expect(g.minion(enemy.uid)?.hp).toBe(1);
    expect(me.hand.filter((h) => h.echo).length).toBe(1);
    g.apply({ type: 'endTurn' });
    expect(me.hand.some((h) => h.echo)).toBe(false);
    expect(me.hand.some((h) => h.cardId === 'GIL_506')).toBe(false);
  });

  it('回音卡的消耗不會低於 1', () => {
    const g = newGame();
    const me = g.s.players[0];
    const uid = give(g, 'GIL_680'); // 胡桃精 3 費
    const hc = me.hand.find((h) => h.uid === uid)!;
    hc.costMod = -5;
    expect(g.costOf(me, hc)).toBe(1);
  });

  it('迷霧幽靈：打出回音卡時獲得 +1/+1', () => {
    const g = newGame();
    const mw = put(g, 'GIL_510', 0);
    const atk = g.atkOf(mw);
    play(g, 'GIL_678'); // 冥光釣手（回音）
    expect(g.atkOf(mw)).toBe(atk + 1);
    play(g, FILLER);
    expect(g.atkOf(mw)).toBe(atk + 1);
  });

  it('葛林達‧鴉羽：手牌中的手下具有回音', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'GIL_618', 0);
    const uid = give(g, FILLER);
    const spell = give(g, 'CS2_029');
    expect(g.hasEcho(0, me.hand.find((h) => h.uid === uid)!)).toBe(true);
    expect(g.hasEcho(0, me.hand.find((h) => h.uid === spell)!)).toBe(false);
    expect(g.apply({ type: 'play', handUid: uid })).toBe(true);
    expect(me.hand.some((h) => h.echo && h.cardId === FILLER)).toBe(true);
  });

  it('虛弱詛咒：敵方手下 -2 攻擊力直到你的下個回合', () => {
    const g = newGame();
    const enemy = put(g, 'CS2_182', 1);
    play(g, 'GIL_665');
    expect(g.atkOf(enemy)).toBe(2);
    g.apply({ type: 'endTurn' });
    expect(g.atkOf(enemy)).toBe(2);
    g.apply({ type: 'endTurn' });
    expect(g.atkOf(enemy)).toBe(4);
  });
});

describe('克蘇恩', () => {
  it('賦予克蘇恩加成：手牌與牌堆中的克蘇恩都會變強', () => {
    const g = newGame();
    const me = g.s.players[0];
    const handUid = give(g, 'OG_280');
    const inHand = me.hand.find((h) => h.uid === handUid)!;
    const inDeck = g.newHandCard('OG_280');
    me.deck.push(inDeck);
    play(g, 'OG_281'); // 召邪者 +2/+2
    play(g, 'OG_284'); // 暮光地卜師 +1/+1 與嘲諷
    expect(g.handStats(0, inHand)).toEqual({ atk: 9, hp: 9 });
    expect(g.handStats(0, inDeck)).toEqual({ atk: 9, hp: 9 });
    expect(g.cthunAttack(0)).toBe(9);
    expect(g.apply({ type: 'play', handUid: inHand.uid })).toBe(true);
    const ct = me.board.find((m) => m.cardId === 'OG_280')!;
    expect(g.atkOf(ct)).toBe(9);
    expect(ct.hp).toBe(9);
    expect(g.hasKw(ct, 'TAUNT')).toBe(true);
  });

  it('克蘇恩的戰吼：造成等同攻擊力的傷害，隨機分配到敵人身上', () => {
    const g = newGame();
    const foe = g.s.players[1];
    const hp = foe.hero.hp;
    play(g, 'OG_339'); // +2/+2 → 8 攻擊力
    play(g, 'OG_280');
    expect(hp - foe.hero.hp).toBe(8);
  });

  it('至少 10 點攻擊力的條件', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'OG_301'); // 6 攻擊力：沒有護甲
    expect(me.hero.armor).toBe(0);
    play(g, 'OG_293'); // +4/+4 → 10
    play(g, 'OG_301');
    expect(me.hero.armor).toBe(10);
    play(g, 'OG_131');
    expect(me.board.some((m) => m.cardId === 'OG_319')).toBe(true);
  });

  it('克蘇恩之刃：把被消滅手下的攻擊力和生命值加給克蘇恩', () => {
    const g = newGame();
    const enemy = put(g, 'CS2_182', 1); // 4/5
    play(g, 'OG_282', enemy.uid);
    expect(g.minion(enemy.uid)).toBeFalsy();
    expect(g.cthunAttack(0)).toBe(10);
  });

  it('厄運召喚者：克蘇恩死亡後洗回牌堆並保留加成', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'OG_280');
    const ct = me.board.find((m) => m.cardId === 'OG_280')!;
    ct.dead = true;
    play(g, 'CS2_182'); // 觸發死亡處理
    expect(me.graveyard).toContain('OG_280');
    play(g, 'OG_255');
    const back = me.deck.find((h) => h.cardId === 'OG_280');
    expect(back && g.handStats(0, back).atk).toBe(8);
  });

  it('克蘇恩眼柄會跟著克蘇恩成長', () => {
    const g = newGame();
    const eye = put(g, 'WON_144', 0);
    play(g, 'OG_283'); // +3/+3
    expect(g.atkOf(eye)).toBe(4);
    expect(eye.hp).toBe(4);
  });
});

describe('星艦', () => {
  it('打出組件會組裝星艦，發射後擁有所有組件的數值、關鍵字與亡語', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'GDB_100'); // 亞克防禦水晶 3/4 嘲諷，亡語：獲得 4 點護甲
    play(g, 'GDB_105'); // 碎晶砲塔 2/4 突襲、風怒
    expect(me.starship?.map((p) => p.id)).toEqual(['GDB_100', 'GDB_105']);
    me.mana = 4;
    expect(g.canLaunch().ok).toBe(false);
    me.mana = 5;
    expect(g.apply({ type: 'launch' })).toBe(true);
    expect(me.mana).toBe(0);
    expect(me.starship).toBeUndefined();
    expect(me.launched?.length).toBe(1);
    const ship = me.board[me.board.length - 1];
    expect(ship.cardId).toBe('GDB_100t2');
    expect(g.atkOf(ship)).toBe(5);
    expect(ship.hp).toBe(8);
    expect(g.hasKw(ship, 'TAUNT')).toBe(true);
    expect(g.hasKw(ship, 'RUSH')).toBe(true);
    expect(g.hasKw(ship, 'WINDFURY')).toBe(true);
    ship.dead = true;
    const armor = me.hero.armor;
    play(g, FILLER);
    expect(me.hero.armor).toBe(armor + 4);
  });

  it('「也會在發射時觸發」與發射效果', () => {
    const g = newGame();
    const foe = g.s.players[1];
    const hp = foe.hero.hp;
    play(g, 'SC_409'); // 飛彈艙：對所有敵人造成 1 點傷害
    expect(foe.hero.hp).toBe(hp - 1);
    g.s.players[0].mana = 10;
    g.apply({ type: 'launch' });
    expect(foe.hero.hp).toBe(hp - 2);
  });

  it('發射折扣與艾克索達（免費發射並選擇協定）', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'SC_401'); // 太空工程車：下一次發射消耗減少 (2)
    expect(g.launchCost(me)).toBe(3);
    play(g, 'GDB_101'); // 次元核心 2/2 聖盾
    play(g, 'GDB_120'); // 艾克索達
    expect(g.s.pendingChoice?.options).toEqual(['GDB_100a', 'GDB_100b', 'GDB_100c']);
    g.apply({ type: 'choose', index: 0 }); // 緊急修復：獲得星艦生命值兩倍的護甲
    expect(me.board.some((m) => m.starship)).toBe(true);
    expect(me.hero.armor).toBe(4);
    expect(me.launched?.length).toBe(1);
  });

  it('重力移轉裝置：發射時召喚一艘星艦的複製', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'GDB_466');
    me.mana = 10;
    g.apply({ type: 'launch' });
    expect(me.board.filter((m) => m.starship).length).toBe(2);
  });

  it('發射過星艦後，雷神號會變形', () => {
    const g = newGame();
    const me = g.s.players[0];
    const uid = give(g, 'SC_414');
    play(g, 'GDB_101');
    g.apply({ type: 'launch' });
    expect(me.hand.find((h) => h.uid === uid)?.cardId).toBe('SC_414t');
  });

  it('不祥之兆：2 回合後召喚；建造星艦時立刻召喚', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'GDB_124');
    expect(me.board.some((m) => m.cardId === 'GDB_124t2')).toBe(false);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.board.some((m) => m.cardId === 'GDB_124t2')).toBe(false);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.board.filter((m) => m.cardId === 'GDB_124t2').length).toBe(2);
  });

  it('星際狐狸人只能摧毀星艦或星艦組件', () => {
    const g = newGame();
    const piece = put(g, 'GDB_101', 1);
    const other = put(g, FILLER, 1);
    const uid = give(g, 'GDB_340');
    const targets = g.validTargets(g.playTargetReq(uid)!, 0, false);
    expect(targets).toContain(piece.uid);
    expect(targets).not.toContain(other.uid);
  });

  it('薩塔隱蔽力場：每回合的第一張法術消耗減少 (1)', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'GDB_103');
    const fireball = give(g, 'CS2_029'); // 火球術 4 費
    const a = me.hand.find((h) => h.uid === fireball)!;
    expect(g.costOf(me, a)).toBe(3);
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(g.costOf(me, a)).toBe(4);
  });
});

describe('舊系列機制', () => {
  it('雙生法術：施放後得到一張沒有雙生法術的複製', () => {
    const g = newGame();
    const me = g.s.players[0];
    const foe = g.s.players[1];
    const hp = foe.hero.hp;
    play(g, 'DAL_373', foe.hero.uid); // 急速射擊：造成 2 點傷害
    expect(foe.hero.hp).toBe(hp - 2);
    const copy = me.hand.find((h) => h.cardId === 'DAL_373ts');
    expect(copy).toBeTruthy();
    expect(g.apply({ type: 'play', handUid: copy!.uid, target: foe.hero.uid })).toBe(true);
    expect(foe.hero.hp).toBe(hp - 4);
    expect(me.hand.some((h) => h.cardId.startsWith('DAL_373'))).toBe(false);
  });

  it('翠玉魔像：每召喚一個，下一個就更大', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'CFM_715'); // 翠玉之靈
    play(g, 'CFM_312'); // 翠玉酋長：並賦予嘲諷
    const golems = me.board.filter((m) => m.cardId === 'CFM_712_t01');
    expect(golems.map((m) => [g.atkOf(m), m.hp])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(g.hasKw(golems[1], 'TAUNT')).toBe(true);
  });

  it('號召：從牌堆召喚符合條件的手下', () => {
    const g = newGame();
    const me = g.s.players[0];
    const deck = me.deck.length;
    play(g, 'LOOT_375'); // 公會招募員：號召一個消耗 (4) 以下的手下
    expect(me.deck.length).toBe(deck - 1);
    expect(me.board.filter((m) => m.cardId === FILLER).length).toBe(1);
  });

  it('比武：你的手下消耗較高才會獲勝', () => {
    const g = newGame();
    const me = g.s.players[0];
    me.deck = [g.newHandCard('EX1_562')]; // 9 費對上 4 費
    play(g, 'AT_133'); // 加基森矛騎兵：獲勝則 +1/+1
    const win = me.board[me.board.length - 1];
    expect(g.atkOf(win)).toBe(2);
    me.deck = [g.newHandCard('CS2_231')]; // 0 費對上 4 費
    play(g, 'AT_133');
    const lose = me.board[me.board.length - 1];
    expect(g.atkOf(lose)).toBe(1);
  });

  it('滅殺：法術與手下造成超過所需的傷害時觸發', () => {
    const g = newGame();
    const me = g.s.players[0];
    const wisp = put(g, 'CS2_231', 1); // 1/1
    play(g, 'TRL_347', wisp.uid); // 誘餌箭：3 點傷害，滅殺：召喚 5/5 魔暴龍
    expect(me.board.length).toBe(1);
    const scalper = put(g, 'TRL_015', 0); // 黃牛票販子 5/3：滅殺：抽 2 張牌
    const wisp2 = put(g, 'CS2_231', 1);
    const hand = me.hand.length;
    expect(g.apply({ type: 'attack', attacker: scalper.uid, target: wisp2.uid })).toBe(true);
    expect(me.hand.length).toBe(hand + 2);
  });

  it('白銀之手新兵的動態文字', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'UNG_960'); // 叢林迷蹤：召喚兩個白銀之手新兵
    expect(me.board.map((m) => m.cardId)).toEqual(['CS2_101t', 'CS2_101t']);
  });
});

describe('伊瑟拉的夢境卡', () => {
  it('伊瑟拉之覺醒：對伊瑟拉以外的所有角色造成 5 點傷害', () => {
    const g = newGame();
    const ysera = put(g, 'EX1_572', 0);
    const foe = put(g, 'CS2_182', 1);
    const heroHp = g.s.players[1].hero.hp;
    play(g, 'DREAM_02');
    expect(ysera.hp).toBe(12);
    expect(foe.hp).toBe(0);
    expect(g.s.players[1].hero.hp).toBe(heroHp - 5);
  });

  it('夢魘：+5/+5，在施放者的下個回合開始時消滅', () => {
    const g = newGame();
    const mine = put(g, 'CS2_182', 0);
    const theirs = put(g, 'CS2_182', 1);
    play(g, 'DREAM_05', mine.uid);
    play(g, 'DREAM_05', theirs.uid);
    expect(g.atkOf(mine)).toBe(9);
    g.apply({ type: 'endTurn' }); // 對手的回合：兩隻都還在
    expect(g.minion(mine.uid)).toBeTruthy();
    expect(g.minion(theirs.uid)).toBeTruthy();
    g.apply({ type: 'endTurn' }); // 我的回合開始：兩隻都被消滅
    expect(g.minion(mine.uid)).toBeFalsy();
    expect(g.minion(theirs.uid)).toBeFalsy();
  });

  it('伊瑟拉每回合結束時獲得兩張夢境卡', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'EX1_572', 0);
    const before = me.hand.length;
    g.apply({ type: 'endTurn' });
    const dreams = me.hand.slice(before).map((h) => h.cardId);
    expect(dreams.length).toBe(2);
    for (const id of dreams) expect(id.startsWith('DREAM_0')).toBe(true);
  });
});
