import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiRecruit, makePersona, playAiTurns } from './ai';
import { TRIPLE_REWARD } from './cards';
import { bgCard, hasBgCard } from './data';
import { BgGame } from './game';
import { PRIZE_IDS, PRIZES, prizeTier } from './prizes';
import { TRIBES } from './types';

const PATCHWERK = 'TB_BaconShop_HERO_34';
let uid = 70_000;

function game(seed: number, o: { anomaly?: string; heroes?: Record<number, string> } = {}) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 5 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES], anomaly: o.anomaly });
  G.human.persona = makePersona(seed, { difficulty: 'normal' });
  for (const p of G.s.players) {
    const h = o.heroes?.[p.idx] ?? PATCHWERK;
    G.s.heroOffers[p.idx] = [h];
    G.pickHero(p.idx, h);
  }
  return G;
}

function nextRound(G: BgGame) {
  for (const p of G.s.players) while (p.discover) G.choose(p.idx, 0);
  G.finishRecruit();
  G.nextRound();
}

describe('英雄戰場：暗月馬戲團獎品', () => {
  it('所有獎品都有資料與等級', () => {
    for (const id of PRIZE_IDS) {
      expect(hasBgCard(id), id).toBe(true);
      expect(prizeTier(id), id).toBeGreaterThan(0);
    }
  });

  it('每張獎品都能施放', () => {
    for (const s of PRIZES) {
      const G = game(3);
      for (let r = 0; r < 4; r++) nextRound(G);
      const p = G.human;
      p.board = [G.make('BG31_803'), G.make('BG25_008')];
      p.gold = 10;
      const card = { kind: 'spell' as const, uid: uid++, id: s.id, g: 1 };
      p.hand = [card];
      const target = G.spellTargets(p, s.id)[0];
      G.play(0, card.uid, undefined, target?.uid);
      while (p.discover) G.choose(0, 0);
      expect(p.hand.includes(card), s.id).toBe(false);
    }
  });

  it('親友折扣：手下只要 2 金幣；熱情搖骰：每回合多 1 次免費刷新', () => {
    const G = game(4);
    const p = G.human;
    for (const id of ['BGS_Treasures_022', 'BGS_Treasures_029']) {
      const card = { kind: 'spell' as const, uid: uid++, id, g: 1 };
      p.hand.push(card);
      G.play(0, card.uid);
    }
    expect(G.minionCost(p)).toBe(2);
    nextRound(G);
    expect(p.freeRefreshes).toBeGreaterThanOrEqual(1);
  });

  it('提卡特斯第 4 回合發現等級 1 的獎品；希拉斯集滿 3 張彩票發現手下', () => {
    const G = game(5, { heroes: { 0: 'TB_BaconShop_HERO_94', 1: 'TB_BaconShop_HERO_90' } });
    while (G.round < 4) nextRound(G);
    const d = G.human.discover!;
    expect(d.options.every((id) => prizeTier(id) === 1)).toBe(true);
    const silas = G.player(1);
    silas.gold = 30;
    let bought = 0;
    for (let k = 0; k < 40 && bought < 3; k++) {
      const t = silas.shop.find((m) => m.ticket);
      if (t) {
        G.buy(1, t.uid);
        bought++;
        if (silas.hand.length > 6) silas.hand = [];
      } else {
        silas.freeRefreshes++;
        G.refresh(1);
      }
    }
    expect(bought).toBe(3);
    expect(silas.discover?.options.length).toBeGreaterThan(0);
  });

  it('馬戲團獎賞（異象）：三合一獎勵改成發現暗月獎品', () => {
    const G = game(6, { anomaly: 'BG27_Anomaly_755' });
    const card = { kind: 'spell' as const, uid: uid++, id: TRIPLE_REWARD, g: 1 };
    G.human.hand.push(card);
    G.play(0, card.uid);
    expect(G.human.discover?.options.every((id) => prizeTier(id) > 0)).toBe(true);
    expect(bgCard(G.human.discover!.options[0]).prize).toBe(1);
  });

  it('提卡特斯、希拉斯和暗月異象：電腦打 14 回合不出錯', () => {
    let seed = 80;
    for (const anomaly of ['BG27_Anomaly_Prizes2', 'BG27_Anomaly_716', 'BG27_Anomaly_755']) {
      const G = game(seed++, { anomaly, heroes: { 0: 'TB_BaconShop_HERO_94', 1: 'TB_BaconShop_HERO_90', 2: 'TB_BaconShop_HERO_94', 3: 'TB_BaconShop_HERO_90' } });
      for (let r = 0; r < 14 && G.s.phase !== 'over'; r++) {
        if (G.human.alive) aiRecruit(G, G.human);
        playAiTurns(G);
        G.finishRecruit();
        if (G.s.phase === 'combat') G.nextRound();
      }
      expect(AI_ERRORS, anomaly).toEqual([]);
    }
  }, 120000);
});
