// 納克薩瑪斯、黑石山、銀白聯賽、卡拉贊之夜、龍蛇混雜的加基森：新機制的測試
import { describe, expect, it } from 'vitest';
import { getCard } from '../cards/registry';
import { Game } from './game';
import type { Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人

function newGame(opts: { deck?: string[]; classes?: Game['s']['players'][0]['heroClass'][] } = {}): Game {
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

/** 結束兩個回合，回到原本的玩家 */
function passRound(g: Game) {
  g.apply({ type: 'endTurn' });
  g.apply({ type: 'endTurn' });
}

describe('英雄能力', () => {
  it('凜懼島飛龍：英雄能力可以使用任意次數；要塞指揮官：每回合兩次', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'AT_008', 0);
    me.mana = 10;
    for (let i = 0; i < 5; i++) expect(g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid })).toBe(true);
    expect(g.s.players[1].hero.hp).toBe(25);

    const g2 = newGame();
    put(g2, 'AT_080', 0);
    g2.s.players[0].mana = 10;
    expect(g2.apply({ type: 'heroPower', target: g2.s.players[1].hero.uid })).toBe(true);
    expect(g2.apply({ type: 'heroPower', target: g2.s.players[1].hero.uid })).toBe(true);
    expect(g2.canHeroPower()).toBe(false);
  });

  it('陣亡英雄之靈：火焰衝擊造成 2 點傷害', () => {
    const g = newGame();
    put(g, 'AT_003', 0);
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(28);
  });

  it('湖中少女 / 擊劍教練 / 破壞者 / 綑縛者拉札改變英雄能力的消耗', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'AT_085', 0);
    expect(g.heroPowerCost(me)).toBe(1);
    play(g, 'AT_115');
    expect(g.heroPowerCost(me)).toBe(0);
    g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid });
    expect(g.heroPowerCost(me)).toBe(1);
    // 破壞者：對手的英雄能力在下個回合消耗增加 (5)
    play(g, 'AT_086');
    g.apply({ type: 'endTurn' });
    expect(g.heroPowerCost(g.s.players[1])).toBe(7);
    g.apply({ type: 'endTurn' });
    expect(g.heroPowerCost(g.s.players[1])).toBe(2);
    // 綑縛者拉札（牌堆沒有重複時）：本場對戰英雄能力消耗為 (0)
    const g2 = newGame({ deck: [] });
    play(g2, 'CFM_020');
    expect(g2.heroPowerCost(g2.s.players[0])).toBe(0);
  });

  it('審判者瑪瑞爾：火焰衝擊變成等級 2（2 點傷害）', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'AT_132');
    expect(me.heroPower.id).toBe('HERO_08bp2');
    expect(g.powerInfo(me).name).toBe('火焰衝擊等級2');
    g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(28);
  });

  it('充能戰錘：摧毀後英雄能力變成「造成 2 點傷害」', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'AT_050');
    me.weapon!.durability = 1;
    g.apply({ type: 'attack', attacker: me.hero.uid, target: g.s.players[1].hero.uid });
    expect(me.weapon).toBeNull();
    expect(me.heroPower.id).toBe('AT_050t');
    me.mana = 10;
    g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(30 - 2 - 2);
  });

  it('管理者埃克索圖斯：死亡後英雄變成 8 點生命值的拉格納羅斯', () => {
    const g = newGame();
    const me = g.s.players[0];
    const m = put(g, 'BRM_027', 0);
    play(g, 'CS2_029', m.uid);
    play(g, 'CS2_029', m.uid);
    expect(me.hero.hp).toBe(8);
    expect(me.heroPower.id).toBe('BRM_027p');
    const foeHp = g.s.players[1].hero.hp;
    g.apply({ type: 'heroPower' });
    expect(g.s.players[1].hero.hp).toBe(foeHp - 8);
  });

  it('雜耍吞法者：複製對手的英雄能力', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'AT_098');
    g.apply({ type: 'heroPower' });
    expect(me.hero.armor).toBe(2);
  });

  it('毒刃：英雄能力改為賦予武器 +1 攻擊力', () => {
    const g = newGame({ classes: ['ROGUE', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'AT_034');
    g.apply({ type: 'heroPower' });
    expect(me.weapon?.cardId).toBe('AT_034');
    expect(me.weapon?.atk).toBe(2);
  });

  it('威爾弗雷德‧菲斯巴恩：以英雄能力抽到的牌消耗為 (0)', () => {
    const g = newGame({ classes: ['WARLOCK', 'WARRIOR'] });
    const me = g.s.players[0];
    put(g, 'AT_027', 0);
    me.mana = 10;
    g.apply({ type: 'heroPower' });
    expect(g.costOf(me, me.hand[me.hand.length - 1])).toBe(0);
  });
});

describe('消耗', () => {
  it('艾維娜：你的手下消耗為 (1)；奈幽巴蛛網領主：有戰吼的手下消耗增加 (2)', () => {
    const g = newGame();
    const me = g.s.players[0];
    const yeti = give(g, FILLER);
    const gnome = give(g, 'CS2_189');
    put(g, 'FP1_017', 1);
    expect(g.costOf(me, gnome)).toBe(3);
    put(g, 'AT_045', 0);
    expect(g.costOf(me, yeti)).toBe(1);
    expect(g.costOf(me, gnome)).toBe(1);
  });

  it('披風女獵手：你的奧秘消耗為 (0)', () => {
    const g = newGame();
    const trap = give(g, 'AT_060');
    put(g, 'KAR_006', 0);
    expect(g.costOf(g.s.players[0], trap)).toBe(0);
  });

  it('龍之伴侶：下一張龍消耗減少 (2)，直到打出為止', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'BRM_018');
    passRound(g);
    const drake = give(g, 'AT_008');
    expect(g.costOf(me, drake)).toBe(4);
    g.apply({ type: 'play', handUid: drake.uid });
    expect(g.costOf(me, give(g, 'AT_008'))).toBe(6);
  });

  it('黑謀會小弟：本回合的下一個奧秘消耗為 (1)，下回合失效', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'CFM_066');
    const effigy = give(g, 'AT_002');
    expect(g.costOf(me, effigy)).toBe(1);
    passRound(g);
    expect(g.costOf(me, effigy)).toBe(3);
  });

  it('海魔釘刺者：下一個魚人改為消耗生命值', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'CFM_699');
    const murloc = give(g, 'EX1_507');
    expect(g.costKind(me, murloc)).toBe('health');
    g.apply({ type: 'play', handUid: murloc.uid });
    expect(me.hero.hp).toBe(27);
  });

  it('憎恨者：敵方法術在下個回合消耗增加 (5)', () => {
    const g = newGame();
    play(g, 'FP1_030');
    g.apply({ type: 'endTurn' });
    const foe = g.s.players[1];
    expect(g.costOf(foe, give(g, 'CS2_029', 1))).toBe(9);
  });

  it('索瑞森大帝：回合結束時手牌消耗減少 (1)', () => {
    const g = newGame();
    const me = g.s.players[0];
    const fireball = give(g, 'CS2_029');
    put(g, 'BRM_028', 0);
    passRound(g);
    expect(g.costOf(me, fireball)).toBe(3);
  });

  it('黑謀會送晶員：每打出一個奧秘消耗減少 (2)', () => {
    const g = newGame();
    const me = g.s.players[0];
    const runner = give(g, 'CFM_760');
    play(g, 'AT_002');
    expect(g.costOf(me, runner)).toBe(4);
  });
});

describe('觸發', () => {
  it('瑞文戴爾男爵：亡語觸發兩次', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'FP1_031', 0);
    const hoarder = put(g, 'EX1_096', 0);
    const before = me.hand.length;
    play(g, 'CS2_029', hoarder.uid);
    expect(me.hand.length).toBe(before + 2);
  });

  it('科爾蘇加德：回合結束時召喚本回合死亡的友方手下', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'FP1_013', 0);
    const yeti = put(g, FILLER, 0);
    play(g, 'CS2_029', yeti.uid);
    expect(me.board.some((m) => m.cardId === FILLER)).toBe(false);
    g.apply({ type: 'endTurn' });
    expect(me.board.some((m) => m.cardId === FILLER)).toBe(true);
  });

  it('斯塔拉格與伏晨都死亡後召喚泰迪斯', () => {
    const g = newGame();
    const me = g.s.players[0];
    const a = put(g, 'FP1_014', 0);
    const b = put(g, 'FP1_015', 0);
    play(g, 'CS2_029', a.uid);
    expect(me.board.some((m) => m.cardId === 'FP1_014t')).toBe(false);
    play(g, 'CS2_022', b.uid); // 變羊不算死亡
    expect(me.board.some((m) => m.cardId === 'FP1_014t')).toBe(false);
    const c = put(g, 'FP1_015', 0);
    c.hp = 1;
    play(g, 'CS2_029', c.uid);
    expect(me.board.some((m) => m.cardId === 'FP1_014t')).toBe(true);
  });

  it('恐怖的黑鐵酒客：受到傷害並存活後召喚另一個', () => {
    const g = newGame();
    const me = g.s.players[0];
    const patron = put(g, 'BRM_019', 0);
    play(g, 'CS2_189', patron.uid);
    expect(me.board.filter((m) => m.cardId === 'BRM_019').length).toBe(2);
  });

  it('酸喉：受到傷害的敵方手下會被消滅', () => {
    const g = newGame();
    put(g, 'AT_063', 0);
    const yeti = put(g, FILLER, 1);
    play(g, 'CS2_189', yeti.uid);
    expect(g.s.players[1].board.length).toBe(0);
  });

  it('波爾夫‧拉姆榭承受英雄受到的傷害；紫羅蘭幻術師讓英雄在你的回合免疫', () => {
    const g = newGame();
    const me = g.s.players[0];
    const bolf = put(g, 'AT_124', 0);
    play(g, 'CS2_029', me.hero.uid);
    expect(me.hero.hp).toBe(30);
    expect(bolf.hp).toBe(3);

    const g2 = newGame();
    put(g2, 'KAR_712', 0);
    play(g2, 'CS2_029', g2.s.players[0].hero.uid);
    expect(g2.s.players[0].hero.hp).toBe(30);
  });

  it('棄牌：小小邪惡騎士成長、銀器魔像被召喚、賈拉克瑟斯之拳造成傷害', () => {
    const g = newGame();
    const me = g.s.players[0];
    const knight = put(g, 'AT_021', 0);
    me.hand = [];
    give(g, 'KAR_205');
    play(g, 'EX1_308', g.s.players[1].hero.uid); // 靈魂之火：棄掉一張隨機牌
    expect(g.atkOf(knight)).toBe(5);
    expect(me.board.some((m) => m.cardId === 'KAR_205')).toBe(true);

    const g2 = newGame();
    g2.s.players[0].hand = [];
    give(g2, 'AT_022');
    play(g2, 'EX1_308', g2.s.players[1].hero.uid);
    expect(g2.s.players[1].hero.hp).toBe(30 - 4 - 4);
  });

  it('菲歐拉‧光寂：以法術指定它時獲得聖盾（在法術生效前）', () => {
    const g = newGame();
    const fjola = put(g, 'AT_129', 0);
    play(g, 'CS1_130', fjola.uid);
    expect(fjola.hp).toBe(4);
  });

  it('神聖勇士：溢療時獲得 +2 攻擊力', () => {
    const g = newGame({ classes: ['PRIEST', 'WARRIOR'] });
    const champ = put(g, 'AT_011', 0);
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower', target: champ.uid });
    expect(g.atkOf(champ)).toBe(3);
  });

  it('暗巷護甲鍛造師：造成傷害時獲得等量護甲', () => {
    const g = newGame();
    const me = g.s.players[0];
    const smith = put(g, 'CFM_756', 0);
    g.apply({ type: 'attack', attacker: smith.uid, target: g.s.players[1].hero.uid });
    expect(me.hero.armor).toBe(3);
  });

  it('海盜派奇：打出海盜後從牌堆召喚', () => {
    const g = newGame({ deck: [...Array(29).fill(FILLER), 'CFM_637'] });
    const me = g.s.players[0];
    me.deck.push(g.newHandCard('CFM_637'));
    play(g, 'CFM_325');
    expect(me.board.some((m) => m.cardId === 'CFM_637')).toBe(true);
    expect(me.deck.some((h) => h.cardId === 'CFM_637')).toBe(false);
  });

  it('克洛瑪古斯：抽牌時多一張複製', () => {
    const g = newGame();
    const me = g.s.players[0];
    put(g, 'BRM_031', 0);
    const before = me.hand.length;
    play(g, 'CS2_023');
    expect(me.hand.length).toBe(before + 4);
  });

  it('肥油大亨：在手牌中時，召喚戰吼手下會成長', () => {
    const g = newGame();
    const baron = give(g, 'CFM_064');
    play(g, 'CS2_189', g.s.players[1].hero.uid);
    expect(baron.atkBuff).toBe(1);
    expect(baron.hpBuff).toBe(1);
  });

  it('海劫者：抽到時對你的手下造成 1 點傷害', () => {
    const g = newGame();
    const me = g.s.players[0];
    const yeti = put(g, FILLER, 0);
    me.deck.push(g.newHandCard('AT_130'));
    play(g, 'CS2_023');
    expect(yeti.hp).toBe(4);
  });

  it('迴音軟泥怪：回合結束時召喚一個複製', () => {
    const g = newGame();
    const me = g.s.players[0];
    play(g, 'FP1_003');
    expect(me.board.filter((m) => m.cardId === 'FP1_003').length).toBe(1);
    g.apply({ type: 'endTurn' });
    expect(me.board.filter((m) => m.cardId === 'FP1_003').length).toBe(2);
    g.apply({ type: 'endTurn' });
    g.apply({ type: 'endTurn' });
    expect(me.board.filter((m) => m.cardId === 'FP1_003').length).toBe(2);
  });

  it('恐懼戰馬：死亡後在回合結束時再召喚一個', () => {
    const g = newGame();
    const me = g.s.players[0];
    const steed = put(g, 'AT_019', 0);
    play(g, 'CS2_189', steed.uid);
    expect(me.board.some((m) => m.cardId === 'AT_019')).toBe(false);
    g.apply({ type: 'endTurn' });
    expect(me.board.some((m) => m.cardId === 'AT_019')).toBe(true);
  });

  it('全面備戰：本身不會觸發，之後的法術會給獵人牌', () => {
    const g = newGame({ classes: ['HUNTER', 'WARRIOR'] });
    const me = g.s.players[0];
    me.hand = [];
    play(g, 'AT_061');
    expect(me.hand.length).toBe(0);
    play(g, 'CS2_029', g.s.players[1].hero.uid);
    expect(me.hand.length).toBe(1);
    expect(getCard(me.hand[0].cardId).cardClass === 'HUNTER' || getCard(me.hand[0].cardId).classes?.includes('HUNTER')).toBe(true);
  });

  it('豹子戲法：對手施放法術後召喚 4/2 潛行的豹', () => {
    const g = newGame();
    play(g, 'KAR_004');
    g.apply({ type: 'endTurn' });
    play(g, 'CS2_029', g.s.players[0].hero.uid);
    expect(g.s.players[0].board.some((m) => m.cardId === 'KAR_004a')).toBe(true);
  });
});

describe('其他效果', () => {
  it('護城河潛伏者：吞掉一個手下，亡語時還給原本的玩家', () => {
    const g = newGame();
    const yeti = put(g, FILLER, 1);
    play(g, 'KAR_041', yeti.uid);
    expect(g.s.players[1].board.length).toBe(0);
    const lurker = g.s.players[0].board[0];
    play(g, 'CS2_029', lurker.uid);
    expect(g.s.players[1].board.some((m) => m.cardId === FILLER)).toBe(true);
  });

  it('瘋狂藥水：控制敵方手下直到回合結束', () => {
    const g = newGame();
    const wisp = put(g, 'CS2_231', 1);
    play(g, 'CFM_603', wisp.uid);
    expect(g.s.players[0].board.includes(wisp)).toBe(true);
    expect(g.canAttack(wisp.uid)).toBe(true);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].board.includes(wisp)).toBe(true);
    expect(wisp.owner).toBe(1);
  });

  it('卡札克斯：選擇消耗與兩種材料，製造擁有兩種效果的藥水', () => {
    const g = newGame({ deck: [] });
    const me = g.s.players[0];
    play(g, 'CFM_621');
    expect(g.s.pendingChoice?.options).toEqual(['CFM_621t11', 'CFM_621t12', 'CFM_621t13']);
    g.apply({ type: 'choose', index: 1 });
    const first = g.s.pendingChoice!.options[0];
    g.apply({ type: 'choose', index: 0 });
    expect(g.s.pendingChoice!.options).not.toContain(first);
    const second = g.s.pendingChoice!.options[0];
    g.apply({ type: 'choose', index: 0 });
    const potion = me.hand[me.hand.length - 1];
    expect(potion.cardId).toBe('CFM_621t14');
    expect(potion.potion).toEqual([first, second]);
    const def = g.handDef(potion);
    expect(def.cost).toBe(5);
    expect(def.abilities?.length).toBe((getCard(first).abilities?.length ?? 0) + (getCard(second).abilities?.length ?? 0));
  });

  it('莫克札王子：開局時把 5 張傳說手下加入牌堆', () => {
    const deck = [...Array(29).fill(FILLER), 'KAR_096'];
    const g = Game.create({ decks: [deck, deck], classes: ['MAGE', 'WARRIOR'], names: ['A', 'B'], ai: [false, false], seed: 1, first: 0 });
    const all = [...g.s.players[0].deck, ...g.s.players[0].hand];
    expect(all.length).toBe(35);
    expect(all.filter((h) => getCard(h.cardId).rarity === 'LEGENDARY').length).toBe(6);
  });

  it('幽魂之爪：有法術傷害時 +2 攻擊力；蠢人災厄：可以一直攻擊但不能攻擊英雄', () => {
    const g = newGame({ classes: ['SHAMAN', 'WARRIOR'] });
    const me = g.s.players[0];
    play(g, 'KAR_063');
    expect(g.atkOf(me.hero)).toBe(1);
    put(g, 'CS2_197', 0); // 食人魔法師：法術傷害 +1
    expect(g.atkOf(me.hero)).toBe(3);

    const g2 = newGame({ classes: ['WARRIOR', 'WARRIOR'] });
    const hero = g2.s.players[0].hero;
    play(g2, 'KAR_028');
    const a = put(g2, FILLER, 1);
    const b = put(g2, FILLER, 1);
    expect(g2.attackTargets(hero.uid)).not.toContain(g2.s.players[1].hero.uid);
    g2.apply({ type: 'attack', attacker: hero.uid, target: a.uid });
    expect(g2.canAttack(hero.uid)).toBe(true);
    g2.apply({ type: 'attack', attacker: hero.uid, target: b.uid });
    expect(b.hp).toBe(2);
  });

  it('秘法衝擊：法術傷害加成兩倍', () => {
    const g = newGame();
    put(g, 'CS2_197', 0);
    const yeti = put(g, FILLER, 1);
    play(g, 'AT_004', yeti.uid);
    expect(yeti.hp).toBe(1);
  });

  it('銀白巡邏兵：激勵後本回合可以攻擊', () => {
    const g = newGame();
    const watchman = put(g, 'AT_109', 0);
    g.s.players[0].mana = 10;
    expect(g.canAttack(watchman.uid)).toBe(false);
    g.apply({ type: 'heroPower', target: g.s.players[1].hero.uid });
    expect(g.canAttack(watchman.uid)).toBe(true);
  });

  it('戰馬訓練師：白銀之手新兵 +2 攻擊力並具有嘲諷', () => {
    const g = newGame({ classes: ['PALADIN', 'WARRIOR'] });
    put(g, 'AT_075', 0);
    g.s.players[0].mana = 10;
    g.apply({ type: 'heroPower' });
    const recruit = g.s.players[0].board.find((m) => m.cardId === 'CS2_101t')!;
    expect(g.atkOf(recruit)).toBe(3);
    expect(g.hasKw(recruit, 'TAUNT')).toBe(true);
  });
});
