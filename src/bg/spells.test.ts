import { describe, expect, it } from 'vitest';
import { makePersona } from './ai';
import { bgCard, tierOf } from './data';
import { BgGame } from './game';
import { makeMinion } from './rules';
import { BOUNTIES, SPELL_SPEC, TAVERN_SPELLS } from './spells';
import type { BMinion } from './types';

let uid = 50_000;
const m = (id: string, patch: Partial<BMinion> = {}) => ({ ...makeMinion(id, false, uid++), ...patch });

function game(seed = 11) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(i + 1, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes: ['PIRATE', 'UNDEAD', 'QUILBOAR', 'DEMON', 'ELEMENTAL'] });
  // 大家都用縫補者（被動只有生命值），避免英雄能力影響測試
  for (const p of G.s.players) {
    G.s.heroOffers[p.idx] = ['TB_BaconShop_HERO_34'];
    G.pickHero(p.idx, 'TB_BaconShop_HERO_34');
  }
  return G;
}

function giveSpell(G: BgGame, id: string) {
  const p = G.human;
  const card = { kind: 'spell' as const, uid: uid++, id, g: 1 };
  p.hand.push(card);
  return card;
}

describe('酒館法術', () => {
  it('酒館每次刷新都有一張法術，而且等級不超過你的旅店等級', () => {
    const G = game();
    const p = G.human;
    for (let k = 0; k < 20; k++) {
      G.refreshShop(p);
      expect(p.shopSpells).toHaveLength(1);
      expect(tierOf(p.shopSpells[0].id)).toBeLessThanOrEqual(p.tier);
      expect(G.spellInLobby(p.shopSpells[0].id)).toBe(true);
    }
  });

  it('購買法術花費它的費用；不祥預言者讓下一張便宜 1', () => {
    const G = game();
    const p = G.human;
    p.gold = 10;
    p.shopSpells = [{ uid: uid++, id: 'BG28_168' }];
    G.buySpell(0, p.shopSpells[0].uid);
    expect(p.gold).toBe(10 - bgCard('BG28_168').cost!);
    expect(p.hand.some((h) => h.kind === 'spell' && h.id === 'BG28_168')).toBe(true);
    p.c.spellDisc = 1;
    p.shopSpells = [{ uid: uid++, id: 'BG28_168' }];
    const before = p.gold;
    G.buySpell(0, p.shopSpells[0].uid);
    expect(p.gold).toBe(before - (bgCard('BG28_168').cost! - 1));
    expect(p.c.spellDisc).toBe(0);
  });

  it('「你的酒館法術額外 +X」：胡蒙戈茲讓刺眼戒指多給 +1/+2', () => {
    const G = game();
    const p = G.human;
    const a = m('BG28_300');
    p.board = [a, m('BG32_341')];
    const card = giveSpell(G, 'BG28_168');
    G.play(0, card.uid);
    expect(a.atk).toBe(1 + 1 + 1);
    expect(a.hp).toBe(1 + 1 + 2);
  });

  it('二選一：無畏的植物學家；荊棘開路者讓兩個效果都發動', () => {
    const G = game();
    const p = G.human;
    const bot = m('BG32_237');
    p.hand.push({ kind: 'minion', uid: bot.uid, m: bot });
    G.play(0, bot.uid, 0, undefined, 1);
    expect(p.c.tsA ?? 0).toBe(0);
    expect(p.c.tsH).toBe(1);
    p.board.push(m('BG31_327'));
    const bot2 = m('BG32_237');
    p.hand.push({ kind: 'minion', uid: bot2.uid, m: bot2 });
    G.play(0, bot2.uid, 0, undefined, 0);
    expect(p.c.tsA).toBe(1);
    expect(p.c.tsH).toBe(2);
  });

  it('驕傲的私掠者：賞金施放兩次', () => {
    const G = game();
    const p = G.human;
    p.board = [m('BG33_825')];
    const gold = p.gold;
    const card = giveSpell(G, BOUNTIES[4]);
    G.play(0, card.uid);
    expect(p.gold).toBe(gold + 4);
  });

  it('過度自信：贏了下回合多 3 枚金幣', () => {
    const G = game();
    const p = G.human;
    p.board = [m('BG19_010t', { atk: 50, hp: 50 })];
    const card = giveSpell(G, 'BG28_884');
    G.play(0, card.uid);
    for (const x of G.s.players) if (!x.isHuman) x.board = [];
    G.finishRecruit();
    expect(p.results[p.results.length - 1]).toBe('win');
    G.nextRound();
    expect(p.gold).toBe(4 + 3);
  });

  it('酒吧精選：用酒館法術刷新酒館', () => {
    const G = game();
    const p = G.human;
    p.tier = 3;
    const card = giveSpell(G, 'BG28_849');
    G.play(0, card.uid);
    expect(p.shop).toHaveLength(0);
    expect(p.shopSpells.length).toBeGreaterThan(1);
  });

  it('時光尋跡：發現的手下這回合鎖定；轉墓術：這回合打出會死', () => {
    const G = game();
    const p = G.human;
    G.play(0, giveSpell(G, 'BG34_330').uid);
    G.choose(0, 0);
    const locked = p.hand.find((h) => h.kind === 'minion')!;
    expect(() => G.play(0, locked.uid, 0)).toThrow();
    p.hand = [];
    p.board = [];
    G.play(0, giveSpell(G, 'BG34_888').uid);
    G.choose(0, 0);
    const u = p.hand.find((h) => h.kind === 'minion')!;
    G.play(0, u.uid, 0, p.board[0]?.uid);
    expect(p.board).toHaveLength(1);
    G.finishRecruit();
    expect(p.board).toHaveLength(0);
  });

  it('每張酒館法術都能施放（隨機目標與選項）', () => {
    expect(TAVERN_SPELLS.length).toBeGreaterThan(50);
    for (const id of TAVERN_SPELLS) {
      const G = game();
      const p = G.human;
      p.tier = 4;
      p.board = [m('BG25_001'), m('BGS_004'), m('BGS_115'), m('BG20_100'), m('BG26_135')];
      G.refreshShop(p);
      const spec = SPELL_SPEC.get(id)!;
      for (let c = 0; c < (spec.choices?.length ?? 1); c++) {
        const card = giveSpell(G, id);
        const targets = G.spellTargets(p, id, c);
        const need = !!spec.target && (!spec.choiceTarget || spec.choiceTarget(c));
        expect(() => G.play(0, card.uid, undefined, need ? targets[0]?.uid : undefined, c), id).not.toThrow();
        while (p.discover) G.choose(0, 0);
      }
    }
  });
});
