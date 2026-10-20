import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiPickHero, aiRecruit, makePersona, playAiTurns } from './ai';
import { hasBgCard } from './data';
import { BgGame } from './game';
import { HEROES, heroOf, powerCardOf } from './heroes';
import { TRIBES, type Tribe } from './types';

describe('英雄戰場：英雄', () => {
  it('每位英雄都能用電腦打 8 回合不出錯', () => {
    let seed = 1;
    for (const h of HEROES) {
      seed++;
      const tribes = (h.needTribe ? [h.needTribe, ...TRIBES.filter((t) => t !== h.needTribe)] : [...TRIBES]).slice(0, 5) as Tribe[];
      const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 11 + i, { difficulty: 'novice' }) }));
      const G = BgGame.create({ seed, humanName: '你', ais, tribes });
      G.s.heroOffers[0] = [h.id];
      G.human.persona = makePersona(seed, { difficulty: 'normal' });
      for (const p of G.s.players) G.pickHero(p.idx, p.isHuman ? h.id : aiPickHero(G, p));
      for (let r = 0; r < 8 && G.s.phase !== 'over'; r++) {
        if (G.human.alive) aiRecruit(G, G.human);
        playAiTurns(G);
        G.finishRecruit();
        if (G.s.phase === 'combat') G.nextRound();
      }
      expect(AI_ERRORS, h.id).toEqual([]);
      expect(hasBgCard(powerCardOf(G.human)), h.id).toBe(true);
      expect(heroOf(G.human)).toBeTruthy();
    }
  }, 300000);
});
