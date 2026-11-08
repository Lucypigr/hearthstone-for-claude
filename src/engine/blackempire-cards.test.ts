// 黑暗帝國霸業：逐張驗證觸發型效果（回合結束、亡語、在手牌中、觸發條件）
import { describe, expect, it } from 'vitest';
import { getCard } from '../cards/registry';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5
type Cls = 'MAGE' | 'ROGUE' | 'PALADIN' | 'WARRIOR' | 'HUNTER' | 'DRUID' | 'WARLOCK' | 'DEMONHUNTER' | 'PRIEST' | 'SHAMAN' | 'DEATHKNIGHT';

function newGame(opts: { cls?: Cls; deck?: string[]; seed?: number } = {}): Game {
  const g = Game.create({ decks: [opts.deck ?? Array(30).fill(FILLER), Array(30).fill(FILLER)], classes: [opts.cls ?? 'MAGE', 'WARRIOR'], names: ['玩家', '電腦'], ai: [false, false], seed: opts.seed ?? 42, first: 0 });
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
const resolve = (g: Game) => {
  while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
};
function play(g: Game, cardId: string, extra: { target?: number } = {}) {
  const hc = give(g, cardId);
  expect(g.apply({ type: 'play', handUid: hc.uid, ...extra }), cardId).toBe(true);
  resolve(g);
  return hc;
}
const endTurns = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) {
    g.apply({ type: 'endTurn' });
    resolve(g);
  }
};
const ids = (g: Game, pid: PlayerId) => g.s.players[pid].board.map((m) => m.cardId);
const stats = (g: Game, m: Minion) => `${g.atkOf(m)}/${m.hp}`;

describe('黑暗帝國霸業：逐張驗證', () => {
  it('魔古將領：打出中立牌後，本回合下一個法術消耗減少 (1)', () => {
    const g = newGame();
    put(g, 'BE_008', 0);
    const spell = give(g, 'CS2_029'); // 火球術 4 費
    play(g, 'CS2_168'); // 中立手下
    expect(g.costOf(g.s.players[0], spell)).toBe(3);
  });

  it('黑暗輔祭：在手牌中施放 2 張暗影法術後才觸發克蘇恩技能', () => {
    const g = newGame({ cls: 'PRIEST' });
    const deacon = give(g, 'BE_012');
    play(g, 'BE_223');
    expect(deacon.counter).toBe(1);
    play(g, 'BE_223');
    expect(deacon.counter).toBe(2);
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: deacon.uid })).toBe(true);
    resolve(g);
    expect(g.s.players[0].be?.cthun?.length).toBe(1);
  });

  it('力量主宰：手牌中時打出兩個不同派系的法術，召喚一個複製', () => {
    const g = newGame({ cls: 'SHAMAN' });
    const hc = give(g, 'BE_171');
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid }); // 火焰
    play(g, 'CS2_024', { target: g.s.players[1].hero.uid }); // 冰霜
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(ids(g, 0).filter((x) => x === 'BE_171').length).toBe(2);
  });

  it('迷惑召喚師：回合結束時召喚一個敵方手下的複製並攻擊原本的手下', () => {
    const g = newGame({ cls: 'PRIEST' });
    put(g, 'BE_196', 0);
    const foe = put(g, 'CS2_120', 1); // 2/3
    g.apply({ type: 'endTurn' });
    expect(ids(g, 0)).toContain('CS2_120');
    expect(foe.hp).toBe(1);
  });

  it('日舞者：回合結束時獲得太陽祝福', () => {
    const g = newGame({ cls: 'PALADIN' });
    put(g, 'BE_152', 0);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.some((h) => h.cardId === 'BE_152t')).toBe(true);
  });

  it('黑暗帝國之刃：施放過暗影法術時敵人受到疲勞傷害，否則自己受到', () => {
    const g = newGame({ cls: 'PRIEST' });
    play(g, 'BE_227');
    play(g, 'BE_223');
    const foeHp = g.s.players[1].hero.hp;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].hero.hp).toBe(foeHp - 1);
    g.apply({ type: 'endTurn' });
    const myHp = g.s.players[0].hero.hp;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hero.hp).toBe(myHp - 1);
  });

  it('火焰噴射器：英雄攻擊後獲得超速傳動；超速傳動讓機械 +2 攻擊力與突襲，回合結束死亡', () => {
    const g = newGame({ cls: 'HUNTER' });
    play(g, 'BE_552');
    g.apply({ type: 'attack', attacker: g.s.players[0].hero.uid, target: g.s.players[1].hero.uid });
    expect(g.s.players[0].hand.some((h) => h.cardId === 'BE_553t')).toBe(true);
    const mech = put(g, 'BE_730t', 0); // 1/1 機械野獸
    play(g, 'BE_553t', { target: mech.uid });
    expect(g.atkOf(mech)).toBe(3);
    g.apply({ type: 'endTurn' });
    expect(ids(g, 0)).not.toContain('BE_730t');
  });

  it('石頭護手：英雄攻擊後把 5 點生命值轉換成護甲值', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'BE_558');
    const hp = g.s.players[0].hero.hp;
    g.apply({ type: 'attack', attacker: g.s.players[0].hero.uid, target: g.s.players[1].hero.uid });
    expect(g.s.players[0].hero.hp).toBe(hp - 5);
    expect(g.s.players[0].hero.armor).toBe(5);
  });

  it('鋼鐵賦生者：獲得護甲值後抽一張牌', () => {
    const g = newGame({ cls: 'WARRIOR' });
    put(g, 'BE_600', 0);
    g.s.players[0].mana = 10;
    const n = g.s.players[0].hand.length;
    expect(g.apply({ type: 'heroPower' })).toBe(true); // 全副武裝：獲得 2 點護甲值
    expect(g.s.players[0].hand.length).toBe(n + 1);
  });

  it('遊蕩尋覓者：打出連擊卡後對隨機敵人造成 3 點傷害', () => {
    const g = newGame({ cls: 'ROGUE' });
    put(g, 'BE_723', 0);
    const hp = g.s.players[1].hero.hp;
    play(g, 'BE_720t5'); // 綠色幼蟲（有連擊）
    expect(g.s.players[1].hero.hp).toBe(hp - 3);
  });

  it('幼蟲：連擊時觸發其他職業的英雄能力', () => {
    const g = newGame({ cls: 'ROGUE' });
    play(g, 'CS2_168');
    const hp = g.s.players[1].hero.hp;
    play(g, 'BE_720t5'); // 綠色幼蟲：連擊：對敵方英雄造成 2 點傷害
    expect(g.s.players[1].hero.hp).toBe(hp - 2);
    play(g, 'BE_720t9'); // 紅色幼蟲：連擊：獲得 2 點護甲值
    expect(g.s.players[0].hero.armor).toBe(2);
  });

  it('同化汙泥怪：回合結束時召喚一個複製', () => {
    const g = newGame();
    play(g, 'BE_734');
    g.apply({ type: 'endTurn' });
    expect(ids(g, 0).filter((x) => x === 'BE_734').length).toBe(2);
  });

  it('前線鐵裔：敵方手下在你的回合死亡後 +2/+2 與一個加成效果', () => {
    const g = newGame();
    const m = put(g, 'BE_996', 0);
    const foe = put(g, 'CS2_168', 1);
    play(g, 'CS2_029', { target: foe.uid });
    expect(stats(g, m)).toBe('5/7');
    expect(m.keywords.length).toBe(1);
  });

  it('原始熊貓人：卡牌加入你的手牌後，雙方各獲得一張隨機法術', () => {
    const g = newGame();
    put(g, 'BE_997', 0);
    const a = g.s.players[0].hand.length;
    const b = g.s.players[1].hand.length;
    play(g, 'CS2_023'); // 秘法智慧：抽 2 張牌
    // 抽到的 2 張牌各觸發一次：雙方各多 2 張法術（熊貓人給的牌不會再觸發）
    expect(g.s.players[0].hand.length).toBe(a + 2 + 2);
    expect(g.s.players[1].hand.length).toBe(b + 2);
  });

  it('獵物追尋者：受到傷害後消滅一個隨機敵方手下', () => {
    const g = newGame();
    const m = put(g, 'BE_998', 0);
    const foe = put(g, FILLER, 1);
    put(g, 'CS2_168', 1);
    // 飄渺：法術無法指定它，用攻擊讓它受傷
    g.apply({ type: 'attack', attacker: m.uid, target: foe.uid });
    // 攻擊造成 4 點傷害（雪人剩 1），受傷後消滅一個隨機敵方手下
    expect(g.s.players[1].board.filter((x) => g.alive(x)).length).toBe(1);
  });

  it('動力虎：每個玩家的回合開始時攻擊一個隨機敵人', () => {
    const g = newGame();
    put(g, 'BE_999', 0);
    const hp = g.s.players[1].hero.hp;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].hero.hp).toBe(hp - 6);
  });

  it('恩若司使者：亡語：獲得手牌中另一個亡語手下的複製', () => {
    const g = newGame({ cls: 'ROGUE' });
    const m = put(g, 'BE_541', 0);
    give(g, 'FP1_007');
    play(g, 'CS2_029', { target: m.uid });
    expect(g.s.players[0].hand.filter((h) => h.cardId === 'FP1_007').length).toBe(2);
  });

  it('覓食蠍尾飛狐：亡語：抽等同此手下攻擊力的牌', () => {
    const g = newGame({ cls: 'DRUID' });
    const m = put(g, 'BE_859', 0);
    const n = g.s.players[0].hand.length;
    play(g, 'CS2_029', { target: m.uid });
    expect(g.s.players[0].hand.length).toBe(n + 2);
  });

  it('機輪摩托車：亡語：召喚共計 4 點法力的機械', () => {
    const g = newGame({ cls: 'HUNTER' });
    const m = put(g, 'BE_900', 0);
    play(g, 'CS2_029', { target: m.uid });
    const total = g.s.players[0].board.reduce((n, x) => n + getCard(x.cardId).cost, 0);
    expect(total).toBeLessThanOrEqual(4);
    expect(g.s.players[0].board.length).toBeGreaterThan(0);
  });

  it('秘典翻譯者：在手牌中 2 個回合後解開', () => {
    const g = newGame();
    const hc = give(g, 'BE_327');
    endTurns(g, 2);
    expect(hc.cardId).toBe('BE_327');
    endTurns(g, 2);
    expect(hc.cardId).toMatch(/^BE_327t/);
  });

  it('賽特胥：2 個回合後把護甲值變成有嘲諷的魔像', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'BE_557');
    endTurns(g, 4);
    const golem = g.s.players[0].board.find((m) => m.cardId === 'BE_T_GOLEM');
    expect(golem && stats(g, golem)).toBe('20/20');
    expect(g.s.players[0].hero.armor).toBe(0);
  });

  it('惡臭吞噬者：依打出的牌的符文變形，戰吼依符文生效', () => {
    const g = newGame({ cls: 'DEATHKNIGHT' });
    put(g, FILLER, 1);
    put(g, FILLER, 1);
    // 血魄 ×2：消滅 2 個敵方手下
    play(g, 'BE_781t3');
    expect(g.s.players[1].board.filter((x) => g.alive(x)).length).toBe(0);
    // 冰霜 ×1：抽一張牌，消耗減少 (3)
    const n = g.s.players[0].hand.length;
    play(g, 'BE_781t5');
    expect(g.s.players[0].hand.length).toBe(n + 1);
    // 穢邪 ×1：召喚兩個隨機 3 費手下
    const b = g.s.players[0].board.length;
    play(g, 'BE_781t8');
    expect(g.s.players[0].board.length).toBe(b + 3);
  });

  it('惡意存在：消滅手下，為它的擁有者恢復等同它生命值的生命值', () => {
    const g = newGame({ cls: 'DEATHKNIGHT' });
    g.s.players[1].hero.hp = 20;
    const foe = put(g, FILLER, 1);
    play(g, 'BE_325', { target: foe.uid });
    expect(g.s.players[1].hero.hp).toBe(25);
  });

  it('尤格薩倫的技能：腦袋讓下一張法術施放兩次', () => {
    const g = newGame();
    play(g, 'BE_009t1');
    const hp = g.s.players[1].hero.hp;
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(hp - 12);
  });

  it('尤格薩倫晉升：手牌中的法術變成消耗多 (3) 的法術，但保留原本的消耗', () => {
    const g = newGame();
    const hc = give(g, 'CS2_029');
    play(g, 'BE_009t3');
    expect(getCard(hc.cardId).cost).toBe(7);
    expect(g.costOf(g.s.players[0], hc)).toBe(4);
  });

  it('恩若司專精：觸發另一個友方手下的亡語兩次', () => {
    const g = newGame();
    const egg = put(g, 'FP1_007', 0);
    play(g, 'BE_017t4', { target: egg.uid });
    expect(ids(g, 0).filter((x) => x === 'FP1_007t').length).toBe(2);
  });

  it('亞煞拉懼之力：獲得相鄰手下的屬性值', () => {
    const g = newGame();
    put(g, 'CS2_120', 0); // 2/3
    const y = put(g, 'BE_784', 0);
    put(g, 'CS2_168', 0); // 2/1
    expect(g.apply({ type: 'titan', uid: y.uid, index: 2 })).toBe(true);
    expect(stats(g, y)).toBe('14/14');
  });

  it('亞煞拉懼：在手下上花了 30 點法力後，戰吼獲得免疫', () => {
    const g = newGame();
    g.s.players[0].be = { minionMana: 30 };
    play(g, 'BE_784');
    const y = g.s.players[0].board.find((m) => m.cardId === 'BE_784')!;
    expect(g.hasKw(y, 'IMMUNE')).toBe(true);
  });

  it('安姆內：之後打出亡語手下時召喚一個複製', () => {
    const g = newGame({ cls: 'DRUID' });
    play(g, 'BE_852');
    play(g, 'FP1_007');
    expect(ids(g, 0).filter((x) => x === 'FP1_007').length).toBe(2);
  });

  it('『潮汐之王』奈普圖隆：之後召喚的元素變成 5/5', () => {
    const g = newGame({ cls: 'SHAMAN' });
    play(g, 'BE_209');
    play(g, 'CS2_033'); // 水元素 3/6
    const m = g.s.players[0].board.find((x) => x.cardId === 'CS2_033')!;
    expect(stats(g, m)).toBe('5/5');
  });

  it('『大地守護者』瑟拉贊恩：每個派系的下一張法術施放兩次', () => {
    const g = newGame({ cls: 'SHAMAN' });
    play(g, 'BE_337');
    const hp = g.s.players[1].hero.hp;
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(hp - 12);
    play(g, 'CS2_029', { target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(hp - 18);
  });

  it('諾甘農圓盤：法術移到牌堆頂，之後每回合可以選擇從底部抽牌', () => {
    const g = newGame({ deck: ['CS2_029', ...Array(29).fill(FILLER)] });
    // 開局會洗牌：把火球術放到牌堆底（牌堆陣列的開頭）
    const deck = g.s.players[0].deck;
    const fb = deck.find((h) => h.cardId === 'CS2_029') ?? g.s.players[0].hand.find((h) => h.cardId === 'CS2_029')!;
    g.s.players[0].hand = g.s.players[0].hand.filter((h) => h !== fb);
    g.s.players[0].deck = [fb, ...deck.filter((h) => h !== fb)];
    play(g, 'BE_250');
    expect(g.s.players[0].deck[g.s.players[0].deck.length - 1].cardId).toBe('CS2_029');
  });

  it('『艾蜜特斯保護者』艾蜜特：洗入的神聖法術抽到時施放', () => {
    const g = newGame({ cls: 'PALADIN', deck: ['BAR_881', ...Array(29).fill(FILLER)] }); // 鼓舞人心的布道（神聖）
    play(g, 'BE_143');
    expect(g.s.players[0].deck.filter((h) => h.cardId === 'BAR_881' && h.castOnDraw).length).toBe(1);
  });

  it('謙卑審判：抽到的手下變成 2/2', () => {
    const g = newGame({ cls: 'PALADIN' });
    const n = g.s.players[0].hand.length;
    play(g, 'BE_154');
    for (const h of g.s.players[0].hand.slice(n)) {
      const d = g.handDef(h);
      expect(`${(d.attack ?? 0) + h.atkBuff}/${(d.health ?? 0) + h.hpBuff}`).toBe('2/2');
    }
  });

  it('漂浮課程：使一個手下與手牌中一個手下獲得 +2/+2', () => {
    const g = newGame({ cls: 'WARLOCK' });
    const m = put(g, 'CS2_120', 0);
    const hc = give(g, 'CS2_168');
    play(g, 'BE_094', { target: m.uid });
    expect(stats(g, m)).toBe('4/5');
    expect(hc.atkBuff).toBe(2);
  });

  it('『翡翠建築師』芙蕾雅：手牌與牌堆中的野獸屬性值加倍', () => {
    const g = newGame({ cls: 'DRUID', deck: Array(30).fill('CS2_120') }); // 河爪鱷魚 2/3 野獸
    const hc = g.s.players[0].hand[0];
    play(g, 'BE_856');
    expect(hc.atkBuff).toBe(2);
    expect(hc.hpBuff).toBe(3);
  });

  it('未知者：手牌中的連擊手下變成 6/6', () => {
    const g = newGame({ cls: 'ROGUE' });
    const hc = give(g, 'BE_720t5');
    play(g, 'BE_725');
    expect(2 + hc.atkBuff).toBe(6);
  });

  it('阿札達斯之錘：英雄攻擊後施放發現的法術', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'BE_055');
    const w = g.s.players[0].weapon!;
    expect(g.s.players[0].be?.archaedas?.[w.uid]).toBeTruthy();
  });

  it('彌米倫：控制機械時發現一張科技卡', () => {
    const g = newGame({ cls: 'HUNTER' });
    put(g, 'BE_730t', 0);
    const n = g.s.players[0].hand.length;
    play(g, 'BE_588');
    expect(g.s.players[0].hand.length).toBe(n + 1);
  });

  it('開花：抽到的自然法術會施放兩次', () => {
    const g = newGame({ cls: 'DRUID', deck: ['BAR_536', ...Array(29).fill(FILLER)] }); // 生命種子（自然）
    play(g, 'BE_801');
    const hc = g.s.players[0].hand.find((h) => h.cardId.startsWith('BAR_536'));
    expect(hc?.castTwice).toBe(true);
  });

  it('拉維茲：最右邊的手下攻擊時免疫', () => {
    const g = newGame({ cls: 'DEMONHUNTER' });
    put(g, 'BE_230', 0);
    const right = put(g, 'CS2_120', 0);
    const foe = put(g, FILLER, 1);
    g.apply({ type: 'attack', attacker: right.uid, target: foe.uid });
    expect(right.hp).toBe(3);
  });

  it('進軍戰事：消耗等同剩下的法力，召喚同樣數值的士兵', () => {
    const g = newGame({ cls: 'PALADIN' });
    const hc = give(g, 'BE_142', 7);
    expect(g.costOf(g.s.players[0], hc)).toBe(7);
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(g.s.players[0].mana).toBe(0);
    const m = g.s.players[0].board.find((x) => x.cardId === 'BE_142t')!;
    expect(stats(g, m)).toBe('7/7');
    expect(g.hasKw(m, 'DIVINE_SHIELD')).toBe(true);
  });

  it('誓縛者光環：打出它本身不會觸發，之後的神聖法術才會', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'BE_146');
    expect(ids(g, 0)).toEqual([]);
    play(g, 'BAR_881'); // 4 費神聖法術
    const m = g.s.players[0].board.find((x) => x.cardId === 'BE_142t')!;
    expect(stats(g, m)).toBe('4/4');
  });

  it('古翰：依打出過的牌上的血魄符文數量強化（不算自己）', () => {
    const g = newGame({ cls: 'DEATHKNIGHT' });
    g.s.players[1].hero.hp = 30;
    play(g, 'BE_287');
    expect(g.s.players[1].hero.hp).toBe(24);
  });

  it('古神：只剩一個技能時，用完當回合就能攻擊', () => {
    const g = newGame();
    const god = put(g, 'BE_784', 0);
    god.titanUsed = ['BE_784t1', 'BE_784t2', 'BE_784t4'];
    expect(g.apply({ type: 'titan', uid: god.uid, index: 2 })).toBe(true);
    expect(g.apply({ type: 'attack', attacker: god.uid, target: g.s.players[1].hero.uid })).toBe(true);
  });

  it('古神不會被隨機產生', () => {
    const g = newGame();
    for (let i = 0; i < 30; i++) play(g, 'BE_784t2'); // 亞煞拉懼之子：召喚 8 費以上的隨機手下
    expect(g.s.players[0].board.some((m) => getCard(m.cardId).oldGod)).toBe(false);
  });

  it('雙種族手下：發條野豬同時是野獸與機械', () => {
    expect(getCard('BE_730t').races).toEqual(['BEAST', 'MECHANICAL']);
    expect(getCard('AT_123').races).toEqual(['DRAGON', 'UNDEAD']);
  });

  it('組裝：打出組裝出的手下，效果依組合後的卡面觸發', () => {
    const g = newGame({ cls: 'HUNTER' });
    for (let i = 0; i < 5; i++) {
      play(g, 'BE_851');
      const hc = g.s.players[0].hand[g.s.players[0].hand.length - 1];
      g.s.players[0].mana = 10;
      const def = g.handDef(hc);
      const ok = g.apply({ type: 'play', handUid: hc.uid, target: def.target ? g.s.players[1].hero.uid : undefined });
      resolve(g);
      expect(ok).toBe(true);
      g.s.players[0].board = [];
    }
  });

  it('拉頡：被動英雄能力會觸發組裝出的效果', () => {
    const g = newGame({ cls: 'PALADIN', seed: 3 });
    play(g, 'BE_004');
    const ab = g.s.players[0].eternal?.find((e) => e.sourceCardId === 'BE_004')?.ability;
    expect(ab && ab.on.k).not.toBe('play');
    expect(ab && ab.on.k).not.toBe('deathrattle');
  });
});
