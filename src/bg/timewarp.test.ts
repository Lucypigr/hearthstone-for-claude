import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiRecruit, makePersona, playAiTurns } from './ai';
import { bgCard, hasBgCard } from './data';
import { BgGame } from './game';
import { TW_IDS, TW_MINIONS, TW_SPELLS, twCost, twKind } from './timewarp';
import { TRIBES } from './types';

const PATCHWERK = 'TB_BaconShop_HERO_34';
let uid = 90_000;

function game(seed: number, o: { anomaly?: string; heroes?: Record<number, string>; timewarp?: boolean } = {}) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 7 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES], anomaly: o.anomaly, timewarp: o.timewarp ?? true });
  G.human.persona = makePersona(seed, { difficulty: 'normal' });
  for (const p of G.s.players) {
    const h = o.heroes?.[p.idx] ?? PATCHWERK;
    G.s.heroOffers[p.idx] = [h];
    G.pickHero(p.idx, h);
  }
  return G;
}

function nextRound(G: BgGame) {
  for (const p of G.s.players) while (p.discover) G.choose(p.idx, G.autoChoice(p));
  G.finishRecruit();
  G.nextRound();
}

function play(G: BgGame, n: number) {
  for (let r = 0; r < n && G.s.phase !== 'over'; r++) {
    if (G.human.alive) aiRecruit(G, G.human);
    playAiTurns(G);
    G.finishRecruit();
    if (G.s.phase === 'combat') G.nextRound();
  }
}

describe('英雄戰場：時光扭曲', () => {
  it('所有時光扭曲的卡都有資料與時光晶幣價格', () => {
    for (const s of [...TW_MINIONS, ...TW_SPELLS]) {
      expect(hasBgCard(s.id), s.id).toBe(true);
      expect(twCost(s.id), s.id).toBeGreaterThan(0);
    }
    expect(TW_IDS().length).toBe(TW_MINIONS.length + TW_SPELLS.length);
  });

  it('第 6 回合次級、第 9 回合高級；用時光晶幣購買，可以離開', () => {
    const G = game(1);
    while (G.round < 6) nextRound(G);
    const d = G.human.discover!;
    expect(d.timewarp).toBe('minor');
    expect(d.options.every((id) => twKind(id) === 'minor')).toBe(true);
    expect(d.chronum).toBe(2);
    const i = d.options.findIndex((id) => twCost(id) === 1);
    const id = d.options[i];
    G.choose(0, i);
    expect(G.human.discover?.chronum ?? 0).toBe(1);
    expect(G.human.hand.some((h) => (h.kind === 'minion' ? h.m.id : h.id) === id) || bgCard(id).type !== 'MINION').toBe(true);
    if (G.human.discover?.timewarp) G.choose(0, -1);
    expect(G.human.discover?.timewarp).toBeUndefined();
    while (G.round < 9) nextRound(G);
    expect(G.human.discover?.timewarp).toBe('major');
  });

  it('姆多茲諾第 8 回合、米羅克第 5 回合去時光扭曲（沒開時光扭曲也一樣）', () => {
    const G = game(2, { timewarp: false, heroes: { 0: 'BG34_HERO_000', 1: 'BG34_HERO_004' } });
    while (G.round < 5) nextRound(G);
    expect(G.player(1).discover?.timewarp).toBe('minor');
    while (G.round < 8) nextRound(G);
    expect(G.human.discover?.timewarp).toBe('major');
  });

  it('每張時光扭曲的法術都能施放', () => {
    for (const s of TW_SPELLS) {
      const G = game(3);
      for (let r = 0; r < 4; r++) nextRound(G);
      const p = G.human;
      p.board = [G.make('BG31_803'), G.make('BGS_020')];
      const card = { kind: 'spell' as const, uid: uid++, id: s.id, g: 1 };
      p.hand = [card];
      const t = G.spellTargets(p, s.id)[0];
      G.play(0, card.uid, undefined, t?.uid);
      while (p.discover) G.choose(0, G.autoChoice(p));
      expect(p.hand.includes(card), s.id).toBe(false);
    }
  });

  it('每個時光扭曲的手下都能讓電腦打 6 回合不出錯', () => {
    let seed = 200;
    for (let i = 0; i < TW_MINIONS.length; i += 8) {
      const G = game(seed++);
      play(G, 3);
      G.s.players.forEach((p, k) => {
        const s = TW_MINIONS[i + k];
        if (s && p.board.length < 7) p.board.push(G.make(s.id, k % 3 === 0));
      });
      play(G, 6);
      expect(AI_ERRORS, TW_MINIONS.slice(i, i + 8).map((s) => s.id).join(',')).toEqual([]);
    }
  }, 300000);

  it('時光扭曲的異象：電腦打 12 回合不出錯', () => {
    let seed = 300;
    for (const anomaly of ['BG34_Anomaly_800', 'BG34_Anomaly_800t', 'BG34_Anomaly_801', 'BG34_Anomaly_802', 'BG34_Anomaly_804', 'BG34_Anomaly_809']) {
      const G = game(seed++, { anomaly });
      play(G, 12);
      expect(AI_ERRORS, anomaly).toEqual([]);
    }
  }, 120000);
});
