import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiRecruit, makePersona, playAiTurns } from './ai';
import { runCombat, type SideInput } from './combat';
import { bgCard, hasBgCard, tierOf } from './data';
import { BgGame } from './game';
import { attachGift, GIFT_IDS, PARADOX } from './gifts';
import { makeMinion } from './rules';
import { TRIBES, type BMinion, type BPlayer } from './types';

const PATCHWERK = 'TB_BaconShop_HERO_34';
let uid = 9000;
const m = (id: string, patch: Partial<BMinion> = {}) => ({ ...makeMinion(id, false, uid++), ...patch });
const gift = (n: number) => (n ? `BG36_MidGameEffect_000t${n}` : 'BG36_MidGameEffect_000t');

function game(seed: number, o: { anomaly?: string; heroes?: Record<number, string> } = {}) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 3 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES], anomaly: o.anomaly });
  G.human.persona = makePersona(seed, { difficulty: 'normal' });
  for (const p of G.s.players) {
    const h = o.heroes?.[p.idx] ?? PATCHWERK;
    G.s.heroOffers[p.idx] = [h];
    G.pickHero(p.idx, h);
  }
  return G;
}

function side(p: BPlayer, board: BMinion[]): SideInput {
  return { player: p, board, tier: p.tier, heroId: '', hand: [], persist: false };
}

function fight(G: BgGame, a: BMinion[], b: BMinion[]) {
  return runCombat([side(G.player(0), a), side(G.player(1), b)], { rng: { rng: 3 }, turn: 5, nextUid: () => uid++, inLobby: () => true });
}

function play(G: BgGame, n: number) {
  for (let r = 0; r < n && G.s.phase !== 'over'; r++) {
    if (G.human.alive) aiRecruit(G, G.human);
    playAiTurns(G);
    G.finishRecruit();
    if (G.s.phase === 'combat') G.nextRound();
  }
}

describe('英雄戰場：黑暗贈禮', () => {
  it('所有黑暗贈禮都有資料', () => {
    for (const id of GIFT_IDS) expect(hasBgCard(id) && bgCard(id).kind, id).toBe('gift');
  });

  it('黑暗悖論每局的等級、身材與贈禮都不同', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const G = game(seed);
      const p = G.make(PARADOX);
      expect(p.gifts).toHaveLength(1);
      expect(tierOf(PARADOX)).toBe(G.s.paradox!.tier);
      seen.add(`${G.s.paradox!.tier}-${p.gifts![0]}`);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('托瑞斯的祝福：聖盾要打 3 次才會破', () => {
    const G = game(1);
    // 1/1 聖盾對上兩隻 1/1：一般聖盾會在第二隻打它時死掉，有贈禮可以把兩隻都打死
    const a = m('BG19_010t', { atk: 1, hp: 1 });
    attachGift(a, gift(15), 1);
    const r = fight(G, [a], [m('BG_BOT_312t'), m('BG_BOT_312t')]);
    expect(r.winner).toBe(0);
  });

  it('無敵：攻擊時不會受傷；恐懼延續：以完整身材復生', () => {
    const G = game(2);
    const a = m('BG19_010t', { atk: 5, hp: 1 });
    attachGift(a, gift(60), 1);
    const wall = m('BG19_010t', { atk: 0, hp: 30, taunt: true });
    const r = fight(G, [a, wall], [m('BG19_010t', { atk: 10, hp: 5 })]);
    expect(r.survivors.some((x) => x.atk === 5 && x.hp === 1)).toBe(true);
    const b = m('BG19_010t', { atk: 3, hp: 4 });
    attachGift(b, gift(12), 1);
    const r2 = fight(G, [b], [m('BG19_010t', { atk: 4, hp: 20 })]);
    // 復生後還是 3/4：至少打了 2 次（沒有贈禮只會打 1 次）
    expect(r2.winner).toBe(1);
    expect(r2.survivors[0].hp).toBeLessThanOrEqual(14);
  });

  it('崔斯塔斯開局發現鎖定的 5 本手下；薩維斯第 4 回合發現', () => {
    const G = game(4, { heroes: { 0: 'BG36_HERO_101', 1: 'BG36_HERO_105' } });
    const d = G.human.discover!;
    expect(d.gifts).toHaveLength(d.options.length);
    expect(d.options.every((id) => tierOf(id) === 5)).toBe(true);
    G.choose(0, 0);
    const card = G.human.hand[0];
    expect(card.kind === 'minion' && card.m.gifts?.length).toBe(1);
    expect(card.locked).toBe(6);
    while (G.round < 4) {
      while (G.player(1).discover) G.choose(1, 0);
      G.finishRecruit();
      G.nextRound();
    }
    expect(G.player(1).discover?.gifts).toBeTruthy();
  });

  it('「黑暗贈禮！」異象：第 3 回合起花 3 金幣發現，一局 3 次', () => {
    const G = game(5, { anomaly: 'BG36_Anomaly_002' });
    expect(G.darkState(G.human)!.usable).toBe(false);
    G.finishRecruit();
    G.nextRound();
    G.finishRecruit();
    G.nextRound();
    G.human.gold = 20;
    for (let k = 0; k < 3; k++) {
      G.pressDark(0);
      G.choose(0, 0);
    }
    expect(G.darkState(G.human)!.usable).toBe(false);
    expect(G.human.hand.filter((h) => h.kind === 'minion' && h.m.gifts?.length).length).toBeGreaterThanOrEqual(3);
  });

  it('每種黑暗贈禮都能讓電腦打 8 回合不出錯', () => {
    let seed = 50;
    for (let i = 0; i < GIFT_IDS.length; i += 8) {
      const G = game(seed++, { anomaly: 'BG36_Anomaly_002' });
      play(G, 3);
      G.s.players.forEach((p, k) => {
        const id = GIFT_IDS[i + k];
        if (!id) return;
        const x = G.make('BG31_803');
        attachGift(x, id, G.round);
        if (p.board.length < 7) p.board.push(x);
      });
      play(G, 8);
      expect(AI_ERRORS, GIFT_IDS.slice(i, i + 8).join(',')).toEqual([]);
    }
  }, 300000);
});
