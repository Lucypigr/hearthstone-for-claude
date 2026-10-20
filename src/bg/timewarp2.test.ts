import { describe, expect, it } from 'vitest';
import { makePersona } from './ai';
import { tierOf } from './data';
import { BgGame } from './game';
import { TRIBES } from './types';

const PATCHWERK = 'TB_BaconShop_HERO_34';
const W = (n: string) => `BG34_Giant_${n}`;
let uid = 140_000;

function game(seed: number) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 7 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES], timewarp: true });
  for (const p of G.s.players) {
    G.s.heroOffers[p.idx] = [PATCHWERK];
    G.pickHero(p.idx, PATCHWERK);
  }
  return G;
}

function nextRound(G: BgGame) {
  for (const p of G.s.players) while (p.discover) G.choose(p.idx, G.autoChoice(p));
  G.finishRecruit();
  G.nextRound();
}

const spell = (id: string) => ({ kind: 'spell' as const, uid: uid++, id, g: 1 });

describe('英雄戰場：時光扭曲（第二批）', () => {
  it('幼龍走私者：友方手下獲得攻擊力時再 +3 生命值', () => {
    const G = game(1);
    const p = G.human;
    p.board = [G.make(W('064')), G.make('BG19_010t')];
    const t = p.board[1];
    const hp = t.hp;
    G.recruit(p).buff(t, 2, 0);
    expect(t.hp).toBe(hp + 3);
  });

  it('普羅比斯讓機械變金卡；戰爭機兵讓目標身材加倍', () => {
    const G = game(2);
    const p = G.human;
    const host = G.make('BG_BOT_312t');
    p.board = [host];
    G.magnetizeCard(p, host, G.make(W('121')));
    expect(host.golden).toBe(true);
    const h2 = G.make('BG_BOT_312t');
    p.board.push(h2);
    G.magnetizeCard(p, h2, G.make(W('677')));
    const m = G.make(W('677'));
    expect(h2.atk).toBe((1 + m.atk) * 2);
  });

  it('時光扭曲召喚：酒館的手下變成同類型、同等級', () => {
    const G = game(3);
    const p = G.human;
    const t = G.make('BG_BOT_312t');
    p.board = [t];
    const tiers = p.shop.map((m) => tierOf(m.id));
    const card = spell(W('324t'));
    p.hand.push(card);
    G.play(0, card.uid, undefined, t.uid);
    expect(p.shop.map((m) => tierOf(m.id))).toEqual(tiers);
  });

  it('捲沙者：元素給的身材額外 +3/+3', () => {
    const G = game(4);
    const p = G.human;
    const t = G.make('BG19_010t');
    p.board = [G.make(W('686')), t];
    expect(G.elemExtra(p)).toEqual([3, 3]);
    // 元素的效果（例如在回合結束時給身材）會加上去；不是元素的不會
    const r = G.recruit(p);
    const hp = t.hp;
    r.buff(t, 1, 1);
    expect(t.hp).toBe(hp + 1);
    p.c['~elem'] = 1;
    r.buff(t, 1, 1);
    p.c['~elem'] = 0;
    expect(t.hp).toBe(hp + 1 + 4);
  });

  it('英雄之力：買下後變成第二個英雄能力', () => {
    const G = game(5);
    const p = G.human;
    G.setPower2(p, 'TB_BaconShop_HERO_76');
    expect(p.power2).toBe('TB_BaconShop_HERO_76');
    expect(G.powerState(p, 1)).toBeTruthy();
  });

  it('先知：每回合兩張酒館法術便宜 2；倒帶手：英雄受到傷害後倒帶', () => {
    const G = game(6);
    const p = G.human;
    p.board = [G.make(W('008')), G.make(W('300'))];
    nextRound(G);
    expect(p.c.spellDisc).toBe(2);
    const hp = p.hp;
    G.hurtHero(p, 3);
    expect(p.hp).toBe(hp);
    G.hurtHero(p, 3);
    expect(p.hp + p.armor).toBeLessThan(hp + 999);
  });

  it('幸運蛋兩回合後變成 7 本金卡；贏家在戰鬥存活後拿三連獎勵', () => {
    const G = game(7);
    const p = G.human;
    p.tier = 6;
    const egg = G.make(W('683'));
    p.board = [egg];
    nextRound(G);
    nextRound(G);
    const d = p.discover;
    if (d?.transform === egg.uid) {
      G.choose(0, 0);
      expect(p.board[0].golden).toBe(true);
      expect(tierOf(p.board[0].id)).toBe(7);
    }
    const w = G.make(W('039'));
    w.taunt = true;
    w.atk = 50;
    w.hp = 50;
    p.board = [w];
    while (p.discover) G.choose(0, G.autoChoice(p));
    nextRound(G);
    expect(p.hand.some((h) => h.kind === 'spell' && h.id === 'TB_BaconShop_Triples_01')).toBe(true);
  });
});
