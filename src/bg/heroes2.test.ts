import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiRecruit, makePersona, playAiTurns } from './ai';
import { runCombat } from './combat';
import { bgCard } from './data';
import { BgGame } from './game';
import { CRUISER, LARVA, RAYNOR_IDS, upgradeIds } from './herocards';
import { TRIBES } from './types';

const PATCHWERK = 'TB_BaconShop_HERO_34';
let uid = 120_000;

function game(seed: number, heroes: Record<number, string>) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 3 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES] });
  G.human.persona = makePersona(seed, { difficulty: 'normal' });
  for (const p of G.s.players) {
    const h = heroes[p.idx] ?? PATCHWERK;
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

describe('英雄戰場：最後一批英雄', () => {
  it('吉恩第 4 回合換掉英雄能力，並多一個第二個英雄能力', () => {
    const G = game(1, { 0: 'BG35_HERO_001' });
    while (G.round < 4) nextRound(G);
    const p = G.human;
    G.choose(0, 0);
    expect(p.powerHero).toBeTruthy();
    expect(p.discover?.slot2).toBe(true);
    G.choose(0, 0);
    expect(p.power2).toBeTruthy();
    expect(p.power2).not.toBe(p.powerHero);
    // 兩個英雄能力的狀態分開計算
    expect(G.powerState(p, 1)).toBeTruthy();
  });

  it('吉姆‧雷諾：開局有戰巡艦，刷新會多一張升級，升級加在戰巡艦上', () => {
    const G = game(2, { 0: 'BG31_HERO_801' });
    const p = G.human;
    expect(p.hand.some((h) => h.kind === 'minion' && h.m.id === CRUISER)).toBe(true);
    expect(p.shopSpells.some((s) => RAYNOR_IDS.has(s.id))).toBe(true);
    const atk = upgradeIds('a')[0];
    const card = { kind: 'spell' as const, uid: uid++, id: atk, g: 1 };
    p.hand.push(card);
    G.play(0, card.uid);
    const c = p.hand.find((h) => h.kind === 'minion' && h.m.id === CRUISER);
    expect(c && c.kind === 'minion' && c.m.atk).toBe(2 + 6);
  });

  it('亞坦尼斯：買滿 14 張卡後拿到選好的神族', () => {
    const G = game(3, { 0: 'BG31_HERO_802' });
    const p = G.human;
    const want = p.discover!.options[0];
    G.choose(0, 0);
    p.c.cards = 13;
    p.gold = 10;
    G.buy(0, p.shop[0].uid);
    expect(p.hand.some((h) => h.kind === 'minion' && h.m.id === want)).toBe(true);
  });

  it('凱莉根：幼蟲每回合變形，解鎖更高階的蟲族', () => {
    const G = game(4, { 0: 'BG31_HERO_811' });
    const p = G.human;
    expect(p.discover?.morph).toBeDefined();
    G.choose(0, 0);
    const z = p.hand.find((h) => h.kind === 'minion');
    expect(z && z.kind === 'minion' && z.m.id !== LARVA).toBe(true);
    p.gold = 10;
    G.usePower(0);
    expect(p.c.zerg).toBe(1);
    nextRound(G);
    expect(p.discover?.morph === undefined || p.discover.options.length > 0).toBe(true);
  });

  it('阿卡贊札拉克：奧秘在戰鬥中觸發一次後消失', () => {
    const G = game(5, { 0: 'TB_BaconShop_HERO_21' });
    const p = G.human;
    G.usePower(0);
    const i = p.discover!.options.indexOf('TB_Bacon_Secrets_07');
    if (i < 0) {
      p.discover = null;
      p.secrets = ['TB_Bacon_Secrets_07'];
    } else G.choose(0, i);
    expect(p.secrets).toContain('TB_Bacon_Secrets_07');
    // 自動防禦矩陣：被攻擊時獲得聖盾
    const a = G.make('BG19_010t');
    a.atk = 1;
    a.hp = 2;
    const e = G.make('BG19_010t');
    e.atk = 1;
    e.hp = 1;
    const res = runCombat([G.sideInput(p, true), { player: G.player(1), board: [e], tier: 1, heroId: '', hand: [], persist: false }].map((x, k) => (k === 0 ? { ...x, board: [a] } : x)) as never, {
      rng: { rng: 5 },
      turn: 1,
      nextUid: () => uid++,
      inLobby: () => true,
    });
    expect(res.winner).toBe(0);
    expect(p.c['secret:TB_Bacon_Secrets_07']).toBe(1);
  });

  it('巴羅夫押注、凱瑞爾每場戰鬥後強化、飆翼抵達航線拿獎勵、普崔希德打造不死族', () => {
    const G = game(6, { 0: 'TB_BaconShop_HERO_72', 1: 'BG21_HERO_000', 2: 'BG20_HERO_283', 3: 'BG25_HERO_100' });
    G.human.gold = 5;
    G.usePower(0);
    expect(G.human.discover?.bet).toHaveLength(2);
    G.choose(0, 0);
    expect(G.human.wager).not.toBeNull();
    G.usePower(2);
    G.choose(2, 1);
    expect(G.player(2).c.flight).toBe(2);
    G.player(3).gold = 5;
    G.usePower(3);
    G.choose(3, 0);
    const cr = G.player(3).hand.find((h) => h.kind === 'minion' && h.m.id === 'BG25_HERO_100pt');
    expect(cr && cr.kind === 'minion' && cr.m.gifts?.length).toBe(1);
    nextRound(G);
    expect(G.human.wager).toBeNull();
    expect(G.player(1).discover?.pick).toBe('cariel');
    G.choose(1, 0);
    expect((G.player(1).c.carN ?? 0) + (G.player(1).c.carA ?? 0) + (G.player(1).c.carH ?? 0)).toBeGreaterThan(0);
    nextRound(G);
    expect(G.player(2).c.flight).toBe(0);
  });

  it('這批英雄都能讓電腦打 12 回合不出錯', () => {
    const heroes = ['TB_BaconShop_HERO_72', 'BG21_HERO_000', 'BG20_HERO_283', 'BG25_HERO_100', 'BG35_HERO_001', 'BG31_HERO_801', 'BG31_HERO_802', 'BG31_HERO_811', 'TB_BaconShop_HERO_21'];
    for (let k = 0; k < 2; k++) {
      const map: Record<number, string> = {};
      heroes.slice(k * 5, k * 5 + 8).forEach((h, i) => (map[i] = h));
      const G = game(40 + k, map);
      for (let r = 0; r < 12 && G.s.phase !== 'over'; r++) {
        if (G.human.alive) aiRecruit(G, G.human);
        playAiTurns(G);
        G.finishRecruit();
        if (G.s.phase === 'combat') G.nextRound();
      }
      expect(AI_ERRORS, Object.values(map).join(',')).toEqual([]);
    }
    expect(bgCard('BG31_HERO_811p2').cost).toBe(8);
  }, 120000);
});
