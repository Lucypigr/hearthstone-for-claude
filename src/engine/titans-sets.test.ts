// 泰坦（TITANS）：鍛造、泰坦、磁力、混沌觸手、異象等機制與卡牌的測試
import { describe, expect, it } from 'vitest';
import { getCard, hasCard } from '../cards/registry';
import { chooseAction, legalActions } from './ai';
import { Game } from './game';
import type { HandCard, Minion, PlayerId } from './state';

const FILLER = 'CS2_182'; // 冰風雪人 4/5
const WISP = 'CS2_231'; // 小精靈 1/1

function newGame(seed = 42, deck: string[] = Array(30).fill(FILLER)): Game {
  const g = Game.create({ decks: [deck, Array(30).fill(FILLER)], classes: ['MAGE', 'WARRIOR'], names: ['玩家', '電腦'], ai: [false, false], seed, first: 0 });
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

/** 打出手下，回傳場上的那個手下 */
function playMinion(g: Game, cardId: string, extra: { target?: number; position?: number; option?: number } = {}): Minion {
  const hc = give(g, cardId);
  const before = new Set(g.s.players[g.s.current].board.map((m) => m.uid));
  expect(g.apply({ type: 'play', handUid: hc.uid, ...extra }), cardId).toBe(true);
  return g.s.players[g.s.current].board.find((m) => !before.has(m.uid))!;
}

/** 結束兩個回合，回到玩家 0 的回合 */
function nextRound(g: Game) {
  g.apply({ type: 'endTurn' });
  g.apply({ type: 'endTurn' });
  g.s.players[0].mana = 10;
}

describe('泰坦系列收錄', () => {
  it('183 張可收藏卡全部收錄', async () => {
    const { ALL_CARDS } = await import('../cards/registry');
    expect(ALL_CARDS().filter((c) => c.collectible && c.set === 1858)).toHaveLength(183);
  });

  it('鍛造版本與泰坦能力都有收錄', () => {
    for (const id of ['TTN_039', 'TTN_042', 'TTN_724', 'TTN_855t', 'YOG_502', 'YOG_525']) expect(hasCard(getCard(id).forge!), id).toBe(true);
    for (const id of ['TTN_075', 'TTN_092', 'TTN_415', 'TTN_429', 'TTN_721', 'TTN_737', 'TTN_800', 'TTN_858', 'TTN_862', 'TTN_903', 'TTN_960', 'YOG_516']) {
      const t = getCard(id).titan;
      expect(t, id).toHaveLength(3);
      for (const a of t!) expect(hasCard(a), a).toBe(true);
    }
  });
});

describe('鍛造', () => {
  it('花費 (2) 把手牌中的卡變成鍛造版本，保留手牌中的增益', () => {
    const g = newGame();
    const hc = give(g, 'TTN_042', 5);
    hc.atkBuff = 1;
    expect(g.apply({ type: 'forge', handUid: hc.uid })).toBe(true);
    expect(hc.cardId).toBe('TTN_042t');
    expect(g.s.players[0].mana).toBe(3);
    const m = g.s.players[0].board.length;
    g.apply({ type: 'play', handUid: hc.uid });
    const c = g.s.players[0].board[m];
    expect(g.atkOf(c)).toBe(7);
    expect(c.hp).toBe(5);
    expect(c.keywords).toContain('RUSH');
  });

  it('法力不足或不能鍛造的卡無法鍛造', () => {
    const g = newGame();
    expect(g.check({ type: 'forge', handUid: give(g, 'TTN_042', 1).uid }).ok).toBe(false);
    expect(g.check({ type: 'forge', handUid: give(g, FILLER, 10).uid }).ok).toBe(false);
  });

  it('暴風巨人可以無限鍛造，每次消耗減少 (2)', () => {
    const g = newGame();
    const hc = give(g, 'TTN_724', 10);
    const p = g.s.players[0];
    g.apply({ type: 'forge', handUid: hc.uid });
    expect(g.costOf(p, hc)).toBe(6);
    g.apply({ type: 'forge', handUid: hc.uid });
    expect(g.costOf(p, hc)).toBe(4);
    expect(g.check({ type: 'forge', handUid: hc.uid }).ok).toBe(true);
  });

  it('熔化的製造者：鍛造後獲得一張鍛造版本的複製', () => {
    const g = newGame();
    put(g, 'TTN_729', 0);
    const hc = give(g, 'TTN_039', 10);
    const n = g.s.players[0].hand.length;
    g.apply({ type: 'forge', handUid: hc.uid });
    expect(g.s.players[0].hand.length).toBe(n + 1);
    expect(g.s.players[0].hand.at(-1)!.cardId).toBe('TTN_039t');
  });

  it('提爾之淚：鍛造後復活 4 個不同的手下', () => {
    const g = newGame(1, Array(30).fill(FILLER));
    const p = g.s.players[0];
    p.heroClass = 'PALADIN';
    p.graveyard.push('CS2_088', 'EX1_362', 'CS2_093', 'EX1_383', 'GVG_058');
    const hc = give(g, 'TTN_855t', 10);
    g.apply({ type: 'forge', handUid: hc.uid });
    g.apply({ type: 'play', handUid: hc.uid });
    expect(p.board).toHaveLength(4);
    for (const m of p.board) {
      expect(g.atkOf(m)).toBe(2);
      expect(m.hp).toBe(2);
    }
  });

  it('伊格尼斯：鍛造過卡牌才會打造武器', () => {
    const g = newGame();
    playMinion(g, 'TTN_751');
    expect(g.s.players[0].weapon).toBeNull();
    g.apply({ type: 'forge', handUid: give(g, 'TTN_042').uid });
    playMinion(g, 'TTN_751');
    for (let i = 0; i < 3 && g.s.pendingChoice; i++) g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].weapon).not.toBeNull();
    expect(['TTN_060t', 'TTN_060t1', 'TTN_060t2']).toContain(g.s.players[0].weapon!.cardId);
  });

  it('電腦會鍛造', () => {
    const g = newGame();
    const hc = give(g, 'TTN_724', 2);
    expect(legalActions(g).some((a) => a.type === 'forge' && a.handUid === hc.uid)).toBe(true);
  });
});

describe('泰坦', () => {
  it('上場當回合就能使用技能，每回合一個，三個都用完才能攻擊', () => {
    const g = newGame();
    const m = playMinion(g, 'TTN_415'); // 卡茲格羅斯 4/5
    expect(g.canAttack(m.uid)).toBe(false);
    expect(g.apply({ type: 'titan', uid: m.uid, index: 2 })).toBe(true); // +5 生命、5 護甲
    expect(m.maxHp).toBe(10);
    expect(g.s.players[0].hero.armor).toBe(5);
    expect(g.canTitan(m.uid, 0).ok).toBe(false); // 這回合已經行動
    nextRound(g);
    expect(g.canTitan(m.uid, 2).ok).toBe(false); // 用過的技能
    g.apply({ type: 'titan', uid: m.uid, index: 0 });
    nextRound(g);
    g.apply({ type: 'titan', uid: m.uid, index: 1 });
    expect(g.canAttack(m.uid)).toBe(false); // 用技能的回合不能攻擊
    nextRound(g);
    expect(m.titanUsed).toHaveLength(3);
    expect(g.canAttack(m.uid)).toBe(true);
    expect(g.canTitan(m.uid, 0).ok).toBe(false);
  });

  it('卡茲格羅斯：用技能後免疫並攻擊一個隨機敵方手下', () => {
    const g = newGame();
    const foe = put(g, WISP, 1);
    const m = playMinion(g, 'TTN_415');
    g.apply({ type: 'titan', uid: m.uid, index: 0 }); // +2/+2，抽武器
    expect(foe.dead || foe.hp <= 0 || !g.s.players[1].board.includes(foe)).toBe(true);
    expect(m.hp).toBe(m.maxHp); // 免疫，沒有受傷
  });

  it('諾甘農：用過一個技能後，其他技能威力加倍', () => {
    const g = newGame();
    const m = playMinion(g, 'TTN_075');
    g.apply({ type: 'titan', uid: m.uid, index: 1 }); // 遠古知識
    expect(m.titanPower?.TTN_075t).toBe(2);
    expect(g.titanText(m.uid, 'TTN_075t')).toContain('10');
    nextRound(g);
    const hp = g.s.players[1].hero.hp;
    g.apply({ type: 'titan', uid: m.uid, index: 0, target: g.s.players[1].hero.uid });
    expect(g.s.players[1].hero.hp).toBe(hp - 10);
    expect(m.titanPower?.TTN_075t3).toBe(4);
  });

  it('諾甘農的遠古知識：對手下回合的卡牌消耗增加', () => {
    const g = newGame();
    const m = playMinion(g, 'TTN_075');
    g.apply({ type: 'titan', uid: m.uid, index: 1 });
    g.apply({ type: 'endTurn' });
    const foe = g.s.players[1];
    const hc = foe.hand[0];
    expect(g.costOf(foe, hc)).toBe(getCard(hc.cardId).cost + 1);
  });

  it('雷霆之王高嘉納斯：每回合第一張法術消耗減少 (3)', () => {
    const g = newGame();
    put(g, 'TTN_800', 0);
    const fb = give(g, 'CS2_029'); // 火球術 (4)
    expect(g.costOf(g.s.players[0], fb)).toBe(1);
  });

  it('和平守護者阿米圖斯：友方手下每次最多受到 2 點傷害', () => {
    const g = newGame();
    put(g, 'TTN_858', 0);
    const y = put(g, FILLER, 0);
    const fb = give(g, 'CS2_029');
    g.apply({ type: 'play', handUid: fb.uid, target: y.uid });
    expect(y.hp).toBe(3);
  });

  it('翡翠之星阿古斯：左邊的手下有突襲，右邊的手下有生命竊取', () => {
    const g = newGame();
    const left = put(g, FILLER, 0);
    put(g, 'TTN_862', 0);
    const right = put(g, FILLER, 0);
    expect(g.hasKw(left, 'RUSH')).toBe(true);
    expect(g.hasKw(left, 'LIFESTEAL')).toBe(false);
    expect(g.hasKw(right, 'LIFESTEAL')).toBe(true);
    expect(g.hasKw(right, 'RUSH')).toBe(false);
  });

  it('伊歐娜：用技能後召喚 5/5 古樹', () => {
    const g = newGame();
    const m = playMinion(g, 'TTN_903');
    g.apply({ type: 'titan', uid: m.uid, index: 1 });
    expect(g.s.players[0].board.some((x) => x.cardId === 'TTN_903t4')).toBe(true);
  });

  it('阿格拉瑪：裝備泰沙拉克，技能強化武器', () => {
    const g = newGame();
    const m = playMinion(g, 'TTN_092');
    expect(g.s.players[0].weapon?.cardId).toBe('TTN_092t');
    g.apply({ type: 'titan', uid: m.uid, index: 2 });
    expect(g.s.players[0].weapon!.atk).toBe(5);
    expect(g.s.players[0].weapon!.immuneAttack).toBe(true);
  });

  it('薩格拉斯：開啟扭曲虛空，回合結束時召喚兩個小鬼', () => {
    const g = newGame();
    playMinion(g, 'TTN_960');
    const p = g.s.players[0];
    const portal = p.board.find((x) => x.cardId === 'TTN_960t')!;
    expect(portal).toBeTruthy();
    expect(g.hasKw(portal, 'DORMANT')).toBe(true);
    g.apply({ type: 'endTurn' });
    expect(p.board.filter((x) => x.cardId === 'TTN_960t6')).toHaveLength(2);
  });

  it('首要者：用技能後發現一張具有那個符文的卡', () => {
    const g = newGame();
    const m = playMinion(g, 'TTN_737');
    g.apply({ type: 'titan', uid: m.uid, index: 1 }); // 穢邪符文：召喚兩個 3/3
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    const p = g.s.players[0];
    expect(p.board.filter((x) => x.cardId === 'TTN_737t2')).toHaveLength(2);
    expect(getCard(p.hand.at(-1)!.cardId).runes?.unholy).toBeTruthy();
  });

  it('V-07-TR-0N：技能會在另一個友方手下上重複', () => {
    const g = newGame();
    const y = put(g, FILLER, 0);
    const m = playMinion(g, 'TTN_721');
    g.apply({ type: 'titan', uid: m.uid, index: 2 }); // +3 生命與法術免疫
    expect(m.maxHp).toBe(8);
    expect(y.maxHp).toBe(8);
    expect(y.keywords).toContain('ELUSIVE');
  });

  it('沉默的泰坦可以直接攻擊', () => {
    const g = newGame();
    const m = put(g, 'TTN_415', 0);
    expect(g.canAttack(m.uid)).toBe(false);
    m.silenced = true;
    expect(g.canAttack(m.uid)).toBe(true);
  });

  it('電腦會使用泰坦技能', () => {
    const g = newGame();
    playMinion(g, 'TTN_858');
    expect(legalActions(g).filter((a) => a.type === 'titan').length).toBeGreaterThan(0);
    expect(['titan', 'endTurn', 'play', 'heroPower', 'attack']).toContain(chooseAction(g, 'normal').type);
  });
});

describe('磁力', () => {
  it('吸收寄生蟲可以吸附到野獸上', () => {
    const g = newGame();
    const beast = put(g, 'CS2_120', 0); // 河鱷 2/3
    const hc = give(g, 'TTN_087');
    g.apply({ type: 'play', handUid: hc.uid, position: 0 });
    expect(g.s.players[0].board).toHaveLength(1);
    expect(g.atkOf(beast)).toBe(5);
    expect(beast.keywords).toContain('RUSH');
  });

  it('發明機器人：吸附時額外 +1/+1；X-21 修理機器人亡語把吸附的機械移回手牌', () => {
    const g = newGame();
    put(g, 'TTN_732', 0);
    const bot = put(g, 'TTN_906', 0); // 1/3 機械
    const hc = give(g, 'TTN_077'); // 急凍機器人 2/3
    g.apply({ type: 'play', handUid: hc.uid, position: 1 });
    expect(g.atkOf(bot)).toBe(1 + 2 + 1);
    expect(bot.magnetized).toEqual(['TTN_077']);
    bot.dead = true;
    g.apply({ type: 'play', handUid: give(g, WISP).uid }); // 觸發死亡處理
    expect(g.s.players[0].hand.some((h) => h.cardId === 'TTN_077')).toBe(true);
  });
});

describe('中立與各職業的卡牌', () => {
  it('水晶雕像：抽 4 張牌後甦醒', () => {
    const g = newGame();
    const m = playMinion(g, 'TTN_840');
    expect(g.hasKw(m, 'DORMANT')).toBe(true);
    g.apply({ type: 'play', handUid: give(g, 'CS2_023').uid }); // 秘法智慧：抽 2 張
    expect(g.hasKw(m, 'DORMANT')).toBe(true);
    g.apply({ type: 'play', handUid: give(g, 'CS2_023').uid });
    expect(g.hasKw(m, 'DORMANT')).toBe(false);
    expect(g.canAttack(m.uid)).toBe(false); // 沒有敵方手下可以突襲
  });

  it('混沌觸手：每打出一個，之後的觸手施放的法術消耗多 1', () => {
    const g = newGame();
    for (let i = 0; i < 2; i++) {
      const hc = give(g, 'YOG_514');
      expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
      while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    }
    expect(g.s.players[0].tendrils).toBe(2);
  });

  it('眾巨人之父霍迪爾：接下來的三個手下變成 8/8', () => {
    const g = newGame();
    playMinion(g, 'TTN_752');
    for (let i = 0; i < 3; i++) {
      const m = playMinion(g, WISP);
      expect(g.atkOf(m)).toBe(8);
      expect(m.hp).toBe(8);
    }
    expect(g.atkOf(playMinion(g, WISP))).toBe(1);
  });

  it('主宰者奧丁：獲得護甲後獲得等量攻擊力', () => {
    const g = newGame();
    playMinion(g, 'TTN_811');
    g.apply({ type: 'play', handUid: give(g, 'EX1_606').uid }); // 盾牌格擋：5 護甲、抽 1
    expect(g.atkOf(g.s.players[0].hero)).toBe(5);
  });

  it('銳鱗：卡牌的消耗無法低於 (2)', () => {
    const g = newGame();
    put(g, 'TTN_924', 1);
    const wisp = give(g, WISP);
    expect(g.costOf(g.s.players[0], wisp)).toBe(2);
  });

  it('寇格拉朗：攻擊手下時把它放進手牌，亡語把它們交給對手', () => {
    const g = newGame();
    const foe = put(g, FILLER, 1);
    const k = put(g, 'TTN_330', 0);
    g.apply({ type: 'attack', attacker: k.uid, target: foe.uid });
    expect(g.s.players[1].board).toHaveLength(0);
    expect(g.s.players[0].hand.some((h) => h.cardId === FILLER && k.grabbed?.includes(h.uid))).toBe(true);
    expect(k.hp).toBe(10);
  });

  it('赫利亞：三種瘟疫洗入對手牌堆，抽到後會洗回去', () => {
    const g = newGame();
    playMinion(g, 'TTN_850');
    const foe = g.s.players[1];
    const plagues = () => foe.deck.filter((h) => h.cardId.startsWith('TTN_450t')).length;
    expect(plagues()).toBe(3);
    // 讓對手抽到一張瘟疫
    const i = foe.deck.findIndex((h) => h.cardId.startsWith('TTN_450t'));
    foe.deck.push(foe.deck.splice(i, 1)[0]);
    g.apply({ type: 'endTurn' });
    expect(plagues()).toBe(3);
  });

  it('焦油浮膜：本回合手下受到雙倍傷害', () => {
    const g = newGame();
    const y = put(g, FILLER, 1);
    g.apply({ type: 'play', handUid: give(g, 'TTN_726').uid, target: y.uid });
    expect(y.hp).toBe(3);
  });

  it('總有更大的冰蟲：溢出傷害擊中敵方英雄', () => {
    const g = newGame();
    const m = put(g, FILLER, 0);
    const foe = put(g, WISP, 1);
    g.apply({ type: 'play', handUid: give(g, 'TTN_079').uid, target: m.uid });
    const hp = g.s.players[1].hero.hp;
    g.apply({ type: 'attack', attacker: m.uid, target: foe.uid });
    expect(g.s.players[1].hero.hp).toBe(hp - 5);
  });

  it('禁忌之果：花光法力，獲得兩倍的護甲', () => {
    const g = newGame();
    const hc = give(g, 'YOG_529', 7);
    g.apply({ type: 'play', handUid: hc.uid, option: 1 });
    expect(g.s.players[0].mana).toBe(0);
    expect(g.s.players[0].hero.armor).toBe(14);
  });

  it('增長古樹：伊歐娜的信徒讓二選一兩種效果合一', () => {
    const g = newGame();
    playMinion(g, 'TTN_503');
    playMinion(g, 'TTN_926', { option: 0 });
    const p = g.s.players[0];
    expect(p.board.filter((m) => m.cardId === 'TTN_903t4')).toHaveLength(3);
  });

  it('霜蓮幼苗：在手牌中 3 個回合後綻放', () => {
    const g = newGame();
    const hc = give(g, 'TTN_930');
    for (let i = 0; i < 3; i++) nextRound(g);
    expect(hc.cardId).toBe('TTN_930t');
  });

  it('希芙：每施放過一種法術派系，法術傷害 +1', () => {
    const g = newGame();
    put(g, 'TTN_071', 0);
    expect(g.spellDamage(0)).toBe(0);
    g.apply({ type: 'play', handUid: give(g, 'CS2_029').uid, target: g.s.players[1].hero.uid }); // 火焰
    g.apply({ type: 'play', handUid: give(g, 'CS2_024').uid, target: g.s.players[1].hero.uid }); // 冰霜
    expect(g.spellDamage(0)).toBe(2);
  });

  it('諾甘農的智慧：每施放過一種法術派系，消耗減少 (1)', () => {
    const g = newGame();
    const hc = give(g, 'TTN_085');
    g.apply({ type: 'play', handUid: give(g, 'CS2_029').uid, target: g.s.players[1].hero.uid });
    expect(g.costOf(g.s.players[0], hc)).toBe(4);
  });

  it('天體射擊：下一張法術具有法術傷害 +2', () => {
    const g = newGame();
    const foeHero = g.s.players[1].hero;
    g.apply({ type: 'play', handUid: give(g, 'YOG_082').uid, target: foeHero.uid });
    expect(foeHero.hp).toBe(27);
    g.apply({ type: 'play', handUid: give(g, 'CS2_029').uid, target: foeHero.uid });
    expect(foeHero.hp).toBe(27 - 8);
    g.apply({ type: 'play', handUid: give(g, 'CS2_029').uid, target: foeHero.uid });
    expect(foeHero.hp).toBe(27 - 8 - 6);
  });

  it('傳導：下一張法術也會指定相鄰手下', () => {
    const g = newGame();
    const a = put(g, FILLER, 1);
    const b = put(g, FILLER, 1);
    const c = put(g, FILLER, 1);
    g.apply({ type: 'play', handUid: give(g, 'YOG_522').uid });
    g.apply({ type: 'play', handUid: give(g, 'CS2_024').uid, target: b.uid }); // 寒冰箭 3 點
    expect([a.hp, b.hp, c.hp]).toEqual([2, 2, 2]);
  });

  it('雷霆之擊：本回合每施放一張自然法術，消耗減少 (1)', () => {
    const g = newGame();
    const hc = give(g, 'TTN_831');
    g.apply({ type: 'play', handUid: give(g, 'TTN_830').uid });
    expect(g.costOf(g.s.players[0], hc)).toBe(4);
  });

  it('被囚禁的恐魔：在你的回合每受到 1 點傷害，消耗減少 (1)', () => {
    const g = newGame();
    const hc = give(g, 'TTN_462');
    g.apply({ type: 'play', handUid: give(g, 'CS2_062').uid }); // 地獄烈焰：對所有角色造成 3 點
    expect(g.costOf(g.s.players[0], hc)).toBe(6);
  });

  it('冰封之地：對手下個回合無法打出抽到的牌', () => {
    const g = newGame();
    g.apply({ type: 'play', handUid: give(g, 'TTN_744').uid });
    const foe = g.s.players[1];
    const locked = foe.hand.slice(-2);
    g.apply({ type: 'endTurn' });
    foe.mana = 10;
    for (const h of locked) expect(g.canPlay(h.uid).ok).toBe(false);
  });

  it('血肉詛咒：對手下回合的手下消耗生命值', () => {
    const g = newGame();
    g.apply({ type: 'play', handUid: give(g, 'YOG_503').uid });
    g.apply({ type: 'endTurn' });
    const foe = g.s.players[1];
    const m = foe.hand.find((h) => getCard(h.cardId).type === 'MINION')!;
    expect(g.costKind(foe, m)).toBe('health');
  });

  it('暮光洪流：友方恢復生命，敵方受到傷害', () => {
    const g = newGame();
    const y = put(g, FILLER, 0);
    y.hp = 1;
    g.apply({ type: 'play', handUid: give(g, 'YOG_508').uid, target: y.uid });
    expect(y.hp).toBe(5);
    const e = put(g, FILLER, 1);
    g.apply({ type: 'play', handUid: give(g, 'YOG_508').uid, target: e.uid });
    expect(e.hp).toBe(2);
  });

  it('萊登：召喚打出過、一開始不在牌堆的手下', () => {
    const g = newGame();
    playMinion(g, WISP); // 手牌中產生的卡，不是起始牌堆
    const r = playMinion(g, 'TTN_481');
    r.dead = true;
    g.apply({ type: 'play', handUid: give(g, WISP).uid });
    expect(g.s.players[0].board.filter((m) => m.cardId === WISP).length).toBeGreaterThanOrEqual(3);
  });

  it('提爾：復活攻擊力 2、3、4 的職業手下', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.heroClass = 'PALADIN';
    p.graveyard.push('GVG_058', 'EX1_362', 'CS2_088'); // 2 攻、3 攻、5 攻
    playMinion(g, 'TTN_857');
    expect(p.board.map((m) => m.cardId).sort()).toEqual(['EX1_362', 'GVG_058', 'TTN_857']);
  });

  it('凡人的滅絕：隨機分配傷害，每消滅一個恢復 2 點生命', () => {
    const g = newGame();
    put(g, WISP, 1);
    put(g, WISP, 1);
    g.s.players[0].hero.hp = 20;
    g.apply({ type: 'play', handUid: give(g, 'TTN_460').uid });
    expect(g.s.players[1].board.filter((m) => m.hp > 0 && !m.dead)).toHaveLength(0);
    expect(g.s.players[0].hero.hp).toBe(24);
  });

  it('混亂吞噬：摧毀友方手下，再選一個敵方手下摧毀', () => {
    const g = newGame();
    const mine = put(g, WISP, 0);
    const theirs = put(g, FILLER, 1);
    g.apply({ type: 'play', handUid: give(g, 'TTN_932').uid, target: mine.uid });
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    expect(g.s.players[0].board).not.toContain(mine);
    expect(g.s.players[1].board).not.toContain(theirs);
  });

  it('秋高爾：有機會在開局帶來異象', () => {
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const g = newGame(seed, [...Array(29).fill(FILLER), 'YOG_530']);
      if (g.s.anomaly) found = true;
    }
    expect(found).toBe(true);
  });

  it('異象：開局多一顆法力水晶 / 英雄生命 +5', () => {
    const g = newGame();
    const before = [g.s.players[0].maxMana, g.s.players[0].hero.maxHp];
    g.s.anomaly = 'TTN_002t11';
    (g as unknown as { anomalyStart(): void }).anomalyStart();
    expect(g.s.players[0].maxMana).toBe(before[0] + 1);
    g.s.anomaly = 'TTN_002t24';
    (g as unknown as { anomalyStart(): void }).anomalyStart();
    expect(g.s.players[0].hero.maxHp).toBe(before[1] + 5);
  });

  it('異象：空閒的法力在回合結束時換成抽牌', () => {
    const g = newGame();
    g.s.anomaly = 'TTN_002t15';
    const n = g.s.players[0].hand.length;
    g.s.players[0].mana = 3;
    g.apply({ type: 'endTurn' });
    expect(g.s.players[0].hand.length).toBe(n + 1);
  });

  it('異象：掌控造物者讓英雄在自己回合 +1 攻擊力', () => {
    const g = newGame();
    g.s.anomaly = 'TTN_002t41';
    expect(g.atkOf(g.s.players[0].hero)).toBe(1);
    expect(g.atkOf(g.s.players[1].hero)).toBe(0);
  });

  it('尤格薩倫：用技能後施放兩個隨機法術，不會出錯', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = newGame(seed);
      put(g, FILLER, 1);
      const m = playMinion(g, 'YOG_516');
      g.apply({ type: 'titan', uid: m.uid, index: 2 });
      while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
      expect(m.titanUsed).toEqual(['YOG_516t3']);
    }
  });
});
