import { describe, expect, it } from 'vitest';
import { makePersona } from './ai';
import { TRIPLE_REWARD } from './cards';
import { runCombat, type SideInput } from './combat';
import { tierOf } from './data';
import { BgGame } from './game';
import { makeMinion, UPGRADE_COST } from './rules';
import type { BMinion, BPlayer } from './types';

let uid = 1;
const m = (id: string, golden = false, patch: Partial<BMinion> = {}) => ({ ...makeMinion(id, golden, uid++), ...patch });

function game(seed = 7) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(i + 1, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: ['BEAST', 'UNDEAD', 'QUILBOAR', 'MECHANICAL', 'MURLOC'] });
  for (const p of G.s.players) G.pickHero(p.idx, G.s.heroOffers[p.idx].find((h) => h === 'TB_BaconShop_HERO_34') ?? G.s.heroOffers[p.idx][0]);
  return G;
}

function side(_G: BgGame, p: BPlayer, board: BMinion[], persist = false): SideInput {
  return { player: p, board, tier: p.tier, heroId: '', hand: [], persist };
}

function fight(G: BgGame, a: BMinion[], b: BMinion[], seed = 1) {
  return runCombat([side(G, G.player(0), a), side(G, G.player(1), b)], { rng: { rng: seed }, turn: 5, nextUid: () => uid++, inLobby: () => true });
}

describe('英雄戰場：戰鬥', () => {
  it('聖盾擋下一次傷害、復生會以 1 點生命值回來', () => {
    const G = game();
    // 青銅守望者 2/1 聖盾 + 復生，對上 1/1：聖盾擋掉，對手死
    const r = fight(G, [m('BGS_034')], [m('BG_ICC_026t')]);
    expect(r.winner).toBe(0);
    expect(r.survivors[0].shield).toBe(false);
    // 2/1 復生（嘲諷）被 3/3 打死後復生，再一起同歸於盡 → 平手
    const r2 = fight(G, [m('BG25_001')], [m('BGS_115t')]);
    expect(r2.winner).toBe(null);
  });

  it('烈毒一定殺死目標（第一次之後就失效）', () => {
    const G = game();
    const r = fight(G, [m('BGS_131')], [m('BG19_010t', false, { atk: 0, hp: 50 })]);
    expect(r.winner).toBe(0);
  });

  it('亡語召喚衍生物；傷害 = 酒館等級 + 存活手下的等級', () => {
    const G = game();
    // 無害的骨頭（1/1，亡語召喚兩個 1/1 骷髏）對上 1/1：骷髏活下來
    const r = fight(G, [m('BG28_300')], [m('BG_BOT_312t', false, { atk: 1, hp: 1 })]);
    expect(r.winner).toBe(0);
    expect(r.survivors.map((x) => x.id)).toEqual(['BG_ICC_026t', 'BG_ICC_026t']);
    expect(r.damage).toBe(G.player(0).tier + 2);
  });

  it('模擬戰鬥不會改到玩家的狀態', () => {
    const G = game();
    const p = G.player(0);
    const board = [m('BG33_883'), m('BG31_801')];
    p.board = board;
    const before = JSON.stringify(p);
    fight(G, board, [m('BG19_010t', false, { hp: 40, atk: 1 })]);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('戰鬥中的永久加成會保存（猛獸藤織者的奮戰）', () => {
    const G = game();
    const p = G.player(0);
    const vine = m('BG33_883');
    p.board = [vine];
    const atk = vine.atk;
    runCombat([side(G, p, p.board, true), side(G, G.player(1), [m('BG19_010t', false, { hp: 60, atk: 0 })])], { rng: { rng: 3 }, turn: 5, nextUid: () => uid++, inLobby: () => true });
    expect(vine.atk).toBeGreaterThan(atk);
  });
});

describe('英雄戰場：招募', () => {
  it('每回合的金幣與升級費用', () => {
    const G = game();
    const p = G.human;
    expect(G.round).toBe(1);
    expect(p.gold).toBe(3);
    expect(p.upgradeCost).toBe(UPGRADE_COST[2]);
    G.finishRecruit();
    G.nextRound();
    expect(p.gold).toBe(4);
    expect(p.upgradeCost).toBe(UPGRADE_COST[2] - 1);
    G.upgrade(0);
    expect(p.tier).toBe(2);
    expect(p.gold).toBe(0);
    expect(p.upgradeCost).toBe(UPGRADE_COST[3]);
  });

  it('三張一樣的手下變成金卡，打出後拿到三合一獎勵', () => {
    const G = game();
    const p = G.human;
    p.gold = 100;
    for (let k = 0; k < 3; k++) {
      p.shop = [G.shopMinion(p, 'BG25_001')];
      G.buy(0, p.shop[0].uid);
    }
    expect(p.hand).toHaveLength(1);
    const card = p.hand[0];
    expect(card.kind === 'minion' && card.m.golden).toBe(true);
    G.play(0, card.uid, 0);
    expect(p.board[0].golden).toBe(true);
    expect(p.board[0].atk).toBe(4);
    const reward = p.hand.find((h) => h.kind === 'spell' && h.id === TRIPLE_REWARD)!;
    expect(reward).toBeTruthy();
    G.play(0, reward.uid);
    expect(p.discover?.options.every((id) => tierOf(id) === Math.min(6, p.tier + 1))).toBe(true);
  });

  it('磁力手下可以吸附到機械上', () => {
    const G = game();
    const p = G.human;
    const host = m('BG29_611');
    p.board = [host];
    const mod = m('BG_BOT_911');
    p.hand = [{ kind: 'minion', uid: mod.uid, m: mod }];
    G.play(0, mod.uid, undefined, host.uid);
    expect(p.board).toHaveLength(1);
    expect(host.atk).toBe(1 + mod.atk);
    expect(host.taunt).toBe(true);
    expect(host.mags.map((x) => x.id)).toEqual(['BG_BOT_911']);
  });

  it('熱氣球測量員：鮮血寶石施放兩次', () => {
    const G = game();
    const p = G.human;
    const t = m('BG30_121');
    p.board = [t];
    const r = G.recruit(p);
    r.getGems(1);
    const gem = p.hand[0];
    const before = t.atk;
    G.play(0, gem.uid, undefined, t.uid);
    expect(t.atk).toBe(before + 2);
  });

  it('永恆騎士：每死一個友方永恆騎士就變強', () => {
    const G = game();
    const p = G.human;
    const k = m('BG25_008');
    p.c.knights = 2;
    expect(G.eff(p, k).atk).toBe(4 + 8);
  });

  it('賣掉手下拿 1 枚金幣，手下回到卡池', () => {
    const G = game();
    const p = G.human;
    const x = m('BG31_803');
    p.board = [x];
    const n = G.s.pool['BG31_803'];
    const gold = p.gold;
    G.sell(0, x.uid);
    expect(p.gold).toBe(gold + 1);
    expect(G.s.pool['BG31_803']).toBe(n + 1);
  });
});
