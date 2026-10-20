import { describe, expect, it } from 'vitest';
import { makePersona } from './ai';
import { runCombat } from './combat';
import { tierOf } from './data';
import { BgGame } from './game';
import { TRIBES } from './types';

const PATCHWERK = 'TB_BaconShop_HERO_34';
const B = (h: string) => `${h}_Buddy`;
let uid = 160_000;

function game(seed: number, heroes: Record<number, string> = {}) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 7 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: [...TRIBES], buddies: true });
  for (const p of G.s.players) {
    const h = heroes[p.idx] ?? PATCHWERK;
    G.s.heroOffers[p.idx] = [h];
    G.pickHero(p.idx, h);
  }
  return G;
}

const spell = (id: string) => ({ kind: 'spell' as const, uid: uid++, id, g: 1 });

describe('英雄戰場：第二批夥伴', () => {
  it('亡首賢者多拿一顆鮮血寶石；泰坦守護者跟著獲得生命值；艾許賣掉手下後戴帽子', () => {
    const G = game(1);
    const p = G.human;
    const sage = G.make(B('BG20_HERO_103'));
    const titan = G.make(B('TB_BaconShop_HERO_39'));
    const ash = G.make(B('TB_BaconShop_HERO_36'));
    const t = G.make('BG19_010t');
    p.board = [sage, titan, ash, t];
    p.hand = [];
    G.recruit(p).getGems(1);
    expect(p.hand.filter((h) => h.kind === 'spell' && h.id === 'BG20_GEM')).toHaveLength(2);
    const hp = titan.hp;
    G.recruit(p).buff(t, 1, 3);
    expect(titan.hp).toBe(hp + 3);
    const before = ash.atk;
    G.sell(0, t.uid);
    expect(ash.atk).toBe(before + 2);
    expect(ash.hat).toBe(2);
  });

  it('巴羅夫領主的學徒：用幸運幣多 1 枚金幣；伯斯：發現的手下 +2/+2 並強化', () => {
    const G = game(2);
    const p = G.human;
    p.board = [G.make(B('TB_BaconShop_HERO_72')), G.make(B('TB_BaconShop_HERO_90'))];
    const coin = spell('BG28_810');
    p.hand = [coin];
    const gold = p.gold;
    G.play(0, coin.uid);
    expect(p.gold).toBe(gold + 2);
    p.discover = null;
    G.discoverFor(p, (id) => tierOf(id) === 1, '測試');
    const id = p.discover!.options[0];
    G.choose(0, 0);
    const got = p.hand.find((h) => h.kind === 'minion' && h.m.id === id);
    const base = G.make(id);
    expect(got && got.kind === 'minion' && got.m.atk).toBe(base.atk + 2);
    expect(p.board[1].n).toBe(1);
  });

  it('石殼守護者：每回合第一個三合一獎勵發現金卡', () => {
    const G = game(3);
    const p = G.human;
    p.board = [G.make(B('BG33_HERO_000'))];
    p.discover = null;
    const card = { ...spell('TB_BaconShop_Triples_01'), tier: 2 };
    p.hand = [card];
    G.play(0, card.uid);
    expect(G.human.discover?.golden).toBe(true);
    G.choose(0, 0);
    const card2 = { ...spell('TB_BaconShop_Triples_01'), tier: 2 };
    p.hand.push(card2);
    G.play(0, card2.uid);
    expect(G.human.discover?.golden).toBeFalsy();
  });

  it('阿蟹：塔維西用上膛移除手下後拿到分身；暗影看守者讓英雄能力的目標變成金卡', () => {
    const G = game(4, { 0: 'BG22_HERO_000', 1: 'TB_BaconShop_HERO_62' });
    const p = G.human;
    p.board = [G.make(B('BG22_HERO_000'))];
    p.hand = [];
    const t = p.shop[0];
    G.usePower(0, t.uid);
    expect(p.hand.some((h) => h.kind === 'minion' && h.m.id === t.id)).toBe(true);
    const q = G.player(1);
    q.board = [];
    const sw = G.make(B('TB_BaconShop_HERO_62'));
    q.hand = [{ kind: 'minion', uid: sw.uid, m: sw }];
    q.gold = 10;
    G.play(1, sw.uid);
    const target = q.shop[0];
    G.usePower(1, target.uid);
    expect(target.golden).toBe(true);
  });

  it('資深探墓者的亡語讓最右邊的手下永久變成金卡；伊利達瑞讓第一個攻擊的手下免疫', () => {
    const G = game(5);
    const p = G.human;
    const tomb = G.make(B('TB_BaconShop_HERO_41'));
    tomb.atk = 1;
    tomb.hp = 1;
    const right = G.make('BG_BOT_312t');
    right.hp = 50;
    p.board = [tomb, right];
    const e = G.make('BG19_010t');
    e.atk = 5;
    e.hp = 30;
    e.taunt = false;
    runCombat([G.sideInput(p, true), { player: G.player(1), board: [e], tier: 1, heroId: '', hand: [], persist: false }], {
      rng: { rng: 3 },
      turn: 1,
      nextUid: () => uid++,
      inLobby: () => true,
      goldenize: (pl, m) => G.goldenize(pl, m),
    });
    expect(right.golden).toBe(true);

    const ill = G.make(B('TB_BaconShop_HERO_08'));
    ill.atk = 3;
    ill.hp = 3;
    const extra = G.make('BG19_010t');
    extra.atk = 0;
    extra.hp = 1;
    extra.taunt = false;
    // 我方手下比較多所以先攻：伊利達瑞第一個攻擊，免疫反擊
    p.board = [ill, extra];
    const f = G.make('BG19_010t');
    f.atk = 99;
    f.hp = 3;
    f.taunt = false;
    const res = runCombat([G.sideInput(p, true), { player: G.player(1), board: [f], tier: 1, heroId: '', hand: [], persist: false }], {
      rng: { rng: 1 },
      turn: 1,
      nextUid: () => uid++,
      inLobby: () => true,
    });
    expect(res.winner).toBe(0);
    expect(res.survivors.some((m) => m.id === ill.id)).toBe(true);
  });

  it('詹迪斯的學徒：同一回合打出同名手下，你的手下獲得旅店等級的身材', () => {
    const G = game(6);
    const p = G.human;
    const j = G.make(B('TB_BaconShop_HERO_71'));
    p.board = [j];
    const a = G.make('BG19_010t');
    const b = G.make('BG19_010t');
    p.hand = [
      { kind: 'minion', uid: a.uid, m: a },
      { kind: 'minion', uid: b.uid, m: b },
    ];
    const atk = j.atk;
    G.play(0, a.uid);
    expect(j.atk).toBe(atk);
    G.play(0, b.uid);
    expect(j.atk).toBe(atk + p.tier);
  });
});
