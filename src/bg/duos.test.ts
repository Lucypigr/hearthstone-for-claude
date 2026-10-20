import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiPickHero, aiRecruit, makePersona, playAiTurns } from './ai';
import { BgGame } from './game';
import { TRIBES } from './types';

function duos(seed: number) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 7 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES].slice(0, 5), duos: true });
  G.human.persona = makePersona(seed + 99, { difficulty: 'normal' });
  for (const p of G.s.players) G.pickHero(p.idx, aiPickHero(G, p));
  return G;
}

function round(G: BgGame) {
  if (G.human.alive) aiRecruit(G, G.human);
  playAiTurns(G);
  G.finishRecruit();
  if (G.s.phase === 'combat') G.nextRound();
}

describe('英雄戰場：雙人模式', () => {
  it('隊伍對隊伍配對、隊友共用生命值', () => {
    const G = duos(1);
    expect(G.partner(G.human)?.idx).toBe(1);
    // 每組配對都是兩隊的對應隊員
    for (const [a, b] of G.s.pairs) expect(b < 0 || G.teamOf(a) !== G.teamOf(b)).toBe(true);
    const teams = new Set(G.s.pairs.map(([a, b]) => `${G.teamOf(a)}-${b < 0 ? -1 : G.teamOf(b)}`));
    expect(teams.size).toBe(2);
    for (let t = 0; t < 4; t++) {
      const [x, y] = G.teamMembers(t);
      expect(x.hp).toBe(y.hp);
    }
    G.hurtHero(G.human, 3);
    expect(G.player(1).hp).toBe(G.human.hp);
  });

  it('傳卡給隊友要 1 枚金幣', () => {
    const G = duos(2);
    const p = G.human;
    p.gold = 5;
    const m = G.make('BG19_010t');
    p.hand.push({ kind: 'minion', uid: m.uid, m });
    G.pass(0, m.uid);
    expect(p.gold).toBe(4);
    expect(G.player(1).hand.some((h) => h.kind === 'minion' && h.m === m)).toBe(true);
  });

  it('電腦打完一整局雙人模式不出錯，整隊一起淘汰', () => {
    for (const seed of [3, 4]) {
      const G = duos(seed);
      let relay = false;
      for (let r = 0; r < 40 && G.s.phase !== 'over'; r++) {
        round(G);
        for (let t = 0; t < 4; t++) {
          const [x, y] = G.teamMembers(t);
          expect(x.alive).toBe(y.alive);
          if (x.alive) expect(x.hp).toBe(y.hp);
        }
        const rec = G.s.combats.find((c) => c.teamA?.includes(0) || c.teamB?.includes(0));
        if (rec) expect(rec.teamA?.length).toBe(2);
        if (rec?.frames?.some((f) => f.note?.endsWith('上場'))) relay = true;
      }
      expect(G.s.phase).toBe('over');
      const winners = G.s.players.filter((p) => p.place === 1);
      expect(winners).toHaveLength(2);
      expect(G.teamOf(winners[0])).toBe(G.teamOf(winners[1]));
      for (let t = 0; t < 4; t++) {
        const [x, y] = G.teamMembers(t);
        expect(x.place).toBe(y.place);
      }
      expect(AI_ERRORS).toEqual([]);
      // 戰鬥中先上場的隊員被打光後，隊友會上場接著打
      expect(relay).toBe(true);
    }
  }, 300000);
});
