// 外域灰燼與暗影崛起：機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../cards/registry';
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

describe('外域灰燼', () => {
  it('收錄全部可收藏卡', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1414).length).toBe(135);
  });

  it('被囚禁的觀察者：休眠 2 回合，甦醒時對敵方手下造成 2 點傷害', () => {
    const g = newGame();
    play(g, 'BT_004');
    const yeti = put(g, FILLER, 1);
    const obs = g.s.players[0].board[0];
    expect(obs.keywords).toContain('DORMANT');
    endTurns(g, 2);
    expect(obs.keywords).toContain('DORMANT');
    endTurns(g, 2);
    expect(obs.keywords).not.toContain('DORMANT');
    expect(yeti.hp).toBe(3);
  });

  it('聖契：奧多爾護從使聖契消耗減少', () => {
    const g = newGame({ cls: 'PALADIN' });
    play(g, 'BT_020');
    const libram = give(g, 'BT_024');
    expect(g.costOf(g.s.players[0], libram)).toBe(8);
    play(g, 'BT_026');
    expect(g.costOf(g.s.players[0], libram)).toBe(6);
  });

  it('卡加斯‧刃拳：亡語把至尊卡加斯洗入牌堆', () => {
    const g = newGame({ cls: 'WARRIOR' });
    const k = put(g, 'BT_123', 0);
    k.dead = true;
    endTurns(g, 1);
    expect(g.s.players[0].deck.some((h) => h.cardId === 'BT_123t')).toBe(true);
  });

  it('凱爾薩斯‧逐日者：每回合第三張法術消耗為 (1)', () => {
    const g = newGame();
    put(g, 'BT_255', 0);
    play(g, 'CS2_027'); // 鏡像
    play(g, 'CS2_027');
    const third = give(g, 'CS2_032'); // 烈焰風暴
    expect(g.costOf(g.s.players[0], third)).toBe(1);
  });

  it('莫阿格工藝師：手下受到的法術傷害加倍', () => {
    const g = newGame();
    put(g, 'BT_733', 0);
    const yeti = put(g, FILLER, 1);
    play(g, 'CS2_024', { target: yeti.uid }); // 寒冰箭 3 點
    expect(yeti.dead || yeti.hp <= 0).toBe(true);
  });

  it('瑪瑟里頓：三個看守者死亡後消滅所有手下並甦醒', () => {
    const g = newGame();
    play(g, 'BT_850');
    const mag = g.s.players[0].board.find((m) => m.cardId === 'BT_850')!;
    expect(mag.keywords).toContain('DORMANT');
    expect(ids(g, 1).filter((x) => x === 'BT_850t').length).toBe(3);
    put(g, FILLER, 1);
    play(g, 'CS2_032'); // 烈焰風暴：4 點傷害
    expect(mag.keywords).not.toContain('DORMANT');
    expect(g.s.players[1].board.filter((m) => g.alive(m)).length).toBe(0);
    expect(g.alive(mag)).toBe(true);
  });

  it('泰朗‧血魔：亡語以 +1/+1 重新召喚被消滅的手下', () => {
    const g = newGame({ cls: 'WARLOCK' });
    put(g, FILLER, 0);
    put(g, FILLER, 0);
    play(g, 'BT_126');
    expect(ids(g, 0)).toEqual(['BT_126']);
    const teron = g.s.players[0].board[0];
    play(g, 'CS2_024', { target: teron.uid });
    play(g, 'CS2_024', { target: teron.uid });
    expect(ids(g, 0)).toEqual([FILLER, FILLER]);
    expect(g.atkOf(g.s.players[0].board[0])).toBe(5);
  });

  it('伊斯歐‧風詠：本回合你的法術消耗為 (1)', () => {
    const g = newGame({ cls: 'DRUID' });
    play(g, 'BT_131');
    const spell = give(g, 'CS2_032');
    expect(g.costOf(g.s.players[0], spell)).toBe(1);
    endTurns(g, 2);
    expect(g.costOf(g.s.players[0], spell)).toBe(7);
  });

  it('過度自信的獸人：生命值全滿時 +2 攻擊力', () => {
    const g = newGame();
    const orc = put(g, 'BT_730', 0);
    expect(g.atkOf(orc)).toBe(3);
    orc.hp -= 1;
    expect(g.atkOf(orc)).toBe(1);
  });

  it('至尊阿卡瑪：攻擊後仍然潛行', () => {
    const g = newGame({ cls: 'ROGUE' });
    const a = put(g, 'BT_713t', 0);
    expect(g.apply({ type: 'attack', attacker: a.uid, target: g.s.players[1].hero.uid })).toBe(true);
    expect(a.keywords).toContain('STEALTH');
  });

  it('至尊米斯恩：二選一召喚 9/9', () => {
    const g = newGame({ cls: 'DRUID' });
    play(g, 'BT_136t', { option: 1 });
    expect(ids(g, 0)).toContain('BT_136tt2');
  });

  it('『破壞者』凱利丹：本回合抽到時消滅其他所有手下', () => {
    const g = newGame({ cls: 'WARLOCK' });
    put(g, FILLER, 0);
    const foe = put(g, FILLER, 1);
    const hc = give(g, 'BT_196');
    hc.drawnTurn = g.s.turn;
    expect(g.apply({ type: 'play', handUid: hc.uid, target: foe.uid })).toBe(true);
    resolve(g);
    expect(g.s.players.flatMap((p) => p.board).filter((m) => g.alive(m)).map((m) => m.cardId)).toEqual(['BT_196']);
  });

  it('偷天換日：被攻擊的手下變形成消耗多 (3) 的手下，攻擊改打它', () => {
    const g = newGame({ cls: 'ROGUE' });
    put(g, FILLER, 0);
    play(g, 'BT_042');
    endTurns(g, 1);
    const attacker = put(g, 'CS2_172', 1); // 血沼迅猛龍 3/2
    const mine = g.s.players[0].board[0];
    expect(g.apply({ type: 'attack', attacker: attacker.uid, target: mine.uid })).toBe(true);
    const now = g.s.players[0].board[0];
    expect(now.cardId).not.toBe(FILLER);
    expect(getCard(now.cardId).cost).toBe(7);
    expect(now.hp).toBeLessThan(now.maxHp);
  });

  it('傳染性孢子：被它傷害的手下變成傳染性孢子', () => {
    const g = newGame();
    const spore = put(g, 'BT_731', 0);
    const yeti = put(g, FILLER, 1);
    expect(g.apply({ type: 'attack', attacker: spore.uid, target: yeti.uid })).toBe(true);
    expect(ids(g, 1)).toEqual(['BT_731']);
  });
});

describe('暗影崛起', () => {
  it('收錄全部可收藏卡（杰爾除外）', () => {
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1130).length).toBe(135);
  });

  it('陰謀：在手牌中每回合升級', () => {
    const g = newGame({ cls: 'WARLOCK' });
    const hc = give(g, 'DAL_007');
    endTurns(g, 4);
    g.s.players[0].mana = 10;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(ids(g, 0).filter((x) => x === 'DAL_751t').length).toBe(3);
  });

  it('幫眾：邪惡陣線纜線鼠把幫眾加入手牌', () => {
    const g = newGame();
    const before = g.s.players[0].hand.length;
    play(g, 'DAL_400');
    expect(g.s.players[0].hand.length).toBe(before + 1);
    expect(g.s.players[0].hand.at(-1)!.cardId).toMatch(/^(DAL_613|DAL_614|DAL_739|DAL_741|ULD_616|DRG_052)$/);
  });

  it('雙生法術：冰霜射線施放後留下一張複製', () => {
    const g = newGame();
    const yeti = put(g, FILLER, 1);
    play(g, 'DAL_577', { target: yeti.uid });
    expect(yeti.frozen).toBe(true);
    expect(g.s.players[0].hand.some((h) => h.cardId === 'DAL_577ts')).toBe(true);
    const copy = g.s.players[0].hand.find((h) => h.cardId === 'DAL_577ts')!;
    expect(g.apply({ type: 'play', handUid: copy.uid, target: yeti.uid })).toBe(true);
    expect(yeti.hp).toBe(3);
  });

  it('指揮官萊莎：奧秘觸發兩次', () => {
    const g = newGame({ cls: 'PALADIN' });
    put(g, 'DAL_573', 0);
    play(g, 'EX1_289'); // 寒冰屏障：獲得 8 點護甲
    endTurns(g, 1);
    const foeYeti = put(g, FILLER, 1);
    expect(g.apply({ type: 'attack', attacker: foeYeti.uid, target: g.s.players[0].hero.uid })).toBe(true);
    expect(g.s.players[0].hero.armor).toBe(12);
  });

  it('塔克‧諾鬚：洗入牌堆的卡也加入手牌', () => {
    const g = newGame({ cls: 'ROGUE' });
    put(g, 'DAL_719', 0);
    const yeti = put(g, FILLER, 0);
    const before = g.s.players[0].hand.length;
    play(g, 'DAL_010', { target: yeti.uid });
    expect(g.s.players[0].hand.length).toBe(before + 1);
    expect(g.s.players[0].hand.at(-1)!.cardId).toBe(FILLER);
  });

  it('禦法珠寶匠：直到你的下個回合，英雄無法成為敵方法術的目標', () => {
    const g = newGame();
    play(g, 'DAL_081');
    endTurns(g, 1);
    const bolt = give(g, 'CS2_024');
    expect(g.apply({ type: 'play', handUid: bolt.uid, target: g.s.players[0].hero.uid })).toBe(false);
  });

  it('看守者史達勒崔斯：施放二選一法術後拿到兩個選項', () => {
    const g = newGame({ cls: 'DRUID' });
    put(g, 'DAL_732', 0);
    const yeti = put(g, FILLER, 1);
    play(g, 'EX1_154', { option: 0, target: yeti.uid }); // 憤怒
    const hand = g.s.players[0].hand.map((h) => h.cardId);
    expect(hand).toContain('EX1_154a');
    expect(hand).toContain('EX1_154b');
  });

  it('旋風風暴：有風怒的手下具有超級風怒', () => {
    const g = newGame();
    put(g, 'DAL_742', 0);
    const m = put(g, 'CS2_169', 0); // 風怒鷹身人
    expect(g.maxAttacks(m)).toBe(4);
  });

  it('盧森巴克：死亡後休眠，恢復 5 點生命值後甦醒', () => {
    const g = newGame({ cls: 'DRUID' });
    const l = put(g, 'DAL_357', 0);
    l.dead = true;
    endTurns(g, 2);
    expect(ids(g, 0)).toEqual(['DAL_357t']);
    g.s.players[0].hero.hp = 10;
    play(g, 'CS2_007', { target: g.s.players[0].hero.uid }); // 治療之觸 8 點
    expect(ids(g, 0)).toEqual(['DAL_357']);
  });

  it('疤鰓：你的魚人消耗為 (1)', () => {
    const g = newGame({ cls: 'SHAMAN' });
    put(g, 'DAL_726', 0);
    const murloc = give(g, 'EX1_103'); // 寒光先知
    expect(g.costOf(g.s.players[0], murloc)).toBe(1);
  });

  it('霹靂至尊爆爆博士：對手牌堆中每有一顆炸彈就召喚兩個爆爆機器人', () => {
    const g = newGame({ cls: 'WARRIOR' });
    play(g, 'DAL_060');
    play(g, 'DAL_060');
    play(g, 'DAL_064');
    expect(ids(g, 0).filter((x) => x === 'GVG_110t').length).toBe(4);
  });
});
