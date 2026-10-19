import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiPickHero, aiRecruit, makePersona, playAiTurns, type BgDifficulty } from './ai';
import { BgGame } from './game';
import { POOL_IDS } from './cards';
import { hasBgCard } from './data';
import { HEROES } from './heroes';

function newGame(seed: number, difficulty: BgDifficulty = 'normal') {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 13 + i, { difficulty }) }));
  const G = BgGame.create({ seed, humanName: '你', ais });
  // 測試裡讓「你」也由電腦代打
  G.human.persona = makePersona(seed + 999, { difficulty });
  for (const p of G.s.players) G.pickHero(p.idx, aiPickHero(G, p));
  return G;
}

function playToEnd(G: BgGame) {
  for (let round = 0; round < 40 && G.s.phase !== 'over'; round++) {
    if (G.human.alive) aiRecruit(G, G.human);
    playAiTurns(G);
    G.finishRecruit();
    if (G.s.phase === 'combat') G.nextRound();
  }
}

describe('英雄戰場', () => {
  it('所有卡都有資料', () => {
    for (const id of POOL_IDS) expect(hasBgCard(id), id).toBe(true);
    for (const h of HEROES) expect(hasBgCard(h.id), h.id).toBe(true);
  });

  it('電腦可以把整局打完，名次 1 ～ 8 都有', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const G = newGame(seed);
      playToEnd(G);
      expect(G.s.phase).toBe('over');
      const places = G.s.players.map((p) => p.place).sort();
      expect(places).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
    expect(AI_ERRORS).toEqual([]);
  }, 60000);

  it('大師平均名次比新手好', () => {
    let master = 0;
    let novice = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 31 + i, { difficulty: i < 4 ? 'master' : 'novice' }) }));
      const G = BgGame.create({ seed, humanName: '你', ais });
      G.human.persona = makePersona(seed, { difficulty: 'normal' });
      for (const p of G.s.players) G.pickHero(p.idx, aiPickHero(G, p));
      playToEnd(G);
      for (let i = 1; i <= 7; i++) {
        if (i <= 4) master += G.player(i).place!;
        else novice += G.player(i).place!;
      }
    }
    expect(master / 48).toBeLessThan(novice / 36);
  }, 120000);
});
