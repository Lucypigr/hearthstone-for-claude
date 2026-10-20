import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiPickHero, aiRecruit, makePersona, playAiTurns } from './ai';
import { BUDDIES } from './buddies';
import { bgCard, hasBgCard } from './data';
import { BgGame, type NewGameOptions } from './game';
import { HEROES } from './heroes';
import { ANOMALIES, QUESTS, questProgress, relicCost, RELICS, REWARDS } from './relics';
import { auraOf } from './rules';
import { TRIBES } from './types';

const PATCHWERK = 'TB_BaconShop_HERO_34';

function newGame(seed: number, o: Partial<NewGameOptions> = {}, pin = true) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 17 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES].slice(0, 5), ...o });
  G.human.persona = makePersona(seed + 999, { difficulty: 'normal' });
  for (const p of G.s.players) {
    if (pin) G.s.heroOffers[p.idx] = [PATCHWERK];
    G.pickHero(p.idx, pin ? PATCHWERK : aiPickHero(G, p));
  }
  return G;
}

function playRounds(G: BgGame, n: number, before?: (G: BgGame) => void) {
  for (let r = 0; r < n && G.s.phase !== 'over'; r++) {
    before?.(G);
    if (G.human.alive) aiRecruit(G, G.human);
    playAiTurns(G);
    G.finishRecruit();
    if (G.s.phase === 'combat') G.nextRound();
  }
}

describe('英雄戰場：飾品、任務、異象、夥伴', () => {
  it('所有飾品、任務、獎勵、異象、夥伴都有資料', () => {
    for (const r of RELICS) expect(hasBgCard(r.id), r.id).toBe(true);
    for (const q of QUESTS) expect(hasBgCard(q.id), q.id).toBe(true);
    for (const b of BUDDIES) expect(hasBgCard(b.id), b.id).toBe(true);
    for (const r of RELICS.filter((x) => x.kind === 'lesser' || x.kind === 'greater')) expect(bgCard(r.id).kind, r.id).toBe(r.kind);
  });

  it('第 6 回合開次級飾品商店、第 9 回合開強效飾品商店', () => {
    const G = newGame(3, { trinkets: true });
    for (let r = 1; r < 6; r++) {
      expect(G.human.discover?.relics).toBeUndefined();
      G.finishRecruit();
      G.nextRound();
    }
    const d = G.human.discover!;
    expect(d.relics).toBe('lesser');
    expect(d.options).toHaveLength(4);
    const i = d.options.findIndex((id) => relicCost(id) <= G.human.gold);
    expect(i).toBeGreaterThanOrEqual(0);
    const gold = G.human.gold;
    const id = d.options[i];
    G.choose(0, i);
    expect(G.human.relics).toContain(id);
    expect(G.human.gold).toBeLessThanOrEqual(gold - relicCost(id) + 10);
    while (G.round < 9) {
      while (G.human.discover) G.choose(0, G.autoChoice(G.human));
      G.finishRecruit();
      G.nextRound();
    }
    expect(G.human.discover?.relics).toBe('greater');
  });

  it('野性咒符：你的手下 +2/+1', () => {
    const G = newGame(4, { trinkets: true });
    G.gainRelic(G.human, 'BG30_MagicItem_880');
    const m = G.make('BG31_803');
    expect(auraOf(G.human.c, m, 30)).toEqual([2, 1]);
  });

  it('任務：第 4 回合選任務，完成後拿到獎勵', () => {
    const G = newGame(5, { quests: true });
    for (let r = 1; r < 4; r++) {
      G.finishRecruit();
      G.nextRound();
    }
    const d = G.human.discover!;
    expect(d.rewards).toHaveLength(3);
    const k = d.options.indexOf('BG27_Quest_800');
    const pick = k >= 0 ? k : 0;
    const reward = d.rewards![pick];
    G.choose(0, pick);
    expect(G.human.quest?.reward).toBe(reward);
    // 直接把進度推到完成
    const q = QUESTS.find((x) => x.id === G.human.quest!.id)!;
    if (q.key) G.human.c[q.key] = (G.human.c[q.key] ?? 0) + q.need;
    else for (let i = 0; i < 7; i++) G.human.board.push(Object.assign(G.make('BG31_803'), { atk: 10 }));
    expect(questProgress(G.human)![0]).toBe(q.need);
    G.checkQuest(G.human);
    expect(G.human.quest).toBeNull();
    expect(G.human.relics).toContain(reward);
  });

  it('夥伴：按鈕會變便宜，拿 2 張變成金卡', () => {
    const G = newGame(6, { buddies: true });
    const p = G.human;
    const st = G.buddyState(p)!;
    expect(st.id).toBe(`${PATCHWERK}_Buddy`);
    const start = st.cost;
    G.finishRecruit();
    G.nextRound();
    expect(G.buddyState(p)!.cost).toBe(start - 1);
    p.gold = 99;
    G.pressBuddy(0);
    G.pressBuddy(0);
    expect(() => G.pressBuddy(0)).toThrow();
    const golden = p.hand.find((h) => h.kind === 'minion' && h.m.id === st.id);
    expect(golden && golden.kind === 'minion' && golden.m.golden).toBe(true);
  });

  it('異象：金錢遊戲、小小聯盟、諾甘農的秘密', () => {
    let G = newGame(7, { anomaly: 'BG27_Anomaly_000' });
    expect(G.human.gold).toBe(10);
    G = newGame(7, { anomaly: 'BG27_Anomaly_800' });
    expect(G.maxTier(G.human)).toBe(4);
    G = newGame(7, { anomaly: 'BG27_Anomaly_504' });
    expect(G.maxTier(G.human)).toBe(7);
    expect(G.human.armor).toBe(10);
  });

  it('每個異象都能讓電腦打 10 回合不出錯', () => {
    let seed = 100;
    for (const a of ANOMALIES) {
      const tribes = (a.needTribe ? [a.needTribe, ...TRIBES.filter((t) => t !== a.needTribe)] : [...TRIBES]).slice(0, 5);
      const G = newGame(seed++, { anomaly: a.id, trinkets: true, quests: true, buddies: true, tribes }, false);
      playRounds(G, 10);
      expect(AI_ERRORS, a.id).toEqual([]);
    }
  }, 300000);

  it('每個飾品與任務獎勵都能讓電腦打 8 回合不出錯', () => {
    const all = [...RELICS.filter((r) => r.kind === 'lesser' || r.kind === 'greater').map((r) => r.id), ...REWARDS];
    let seed = 300;
    for (let i = 0; i < all.length; i += 8) {
      const batch = all.slice(i, i + 8);
      const G = newGame(seed++, { trinkets: true, quests: true, tribes: [...TRIBES] }, false);
      playRounds(G, 2);
      G.s.players.forEach((p, k) => batch[k] && G.gainRelic(p, batch[k]));
      while (G.s.players.some((p) => p.discover)) for (const p of G.s.players) if (p.discover) G.choose(p.idx, G.autoChoice(p));
      playRounds(G, 8);
      expect(AI_ERRORS, batch.join(',')).toEqual([]);
    }
  }, 300000);

  it('每個夥伴都能讓電腦打 9 回合不出錯', () => {
    const heroes = HEROES.filter((h) => BUDDIES.some((b) => b.id === `${h.id}_Buddy`)).map((h) => h.id);
    let seed = 500;
    for (let i = 0; i < heroes.length; i += 8) {
      const batch = heroes.slice(i, i + 8);
      const ais = Array.from({ length: 7 }, (_, k) => ({ name: `AI${k}`, persona: makePersona(seed * 7 + k, { difficulty: 'master' }) }));
      const G = BgGame.create({ seed: seed++, humanName: '你', ais, tribes: [...TRIBES], buddies: true });
      G.human.persona = makePersona(seed, { difficulty: 'master' });
      for (const p of G.s.players) {
        const h = batch[p.idx] ?? PATCHWERK;
        G.s.heroOffers[p.idx] = [h];
        G.pickHero(p.idx, h);
      }
      playRounds(G, 9, (G) => G.s.players.forEach((p) => (p.gold += 3)));
      expect(AI_ERRORS, batch.join(',')).toEqual([]);
      expect(G.s.players.some((p) => (p.buddy?.presses ?? 0) > 0)).toBe(true);
    }
  }, 300000);
});
