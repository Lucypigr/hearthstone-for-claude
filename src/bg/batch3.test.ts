import { describe, expect, it } from 'vitest';
import { AI_ERRORS, aiPickHero, aiRecruit, makePersona, playAiTurns } from './ai';
import { runCombat } from './combat';
import { BgGame } from './game';
import { makeMinion } from './rules';
import { TRIBES, type BMinion, type Tribe } from './types';

let uid = 90_000;
const m = (id: string, patch: Partial<BMinion> = {}) => ({ ...makeMinion(id, false, uid++), ...patch });

function game(tribes: Tribe[], seed = 3) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i}`, persona: makePersona(seed * 7 + i, { difficulty: 'expert' }) }));
  const G = BgGame.create({ seed, humanName: '你', ais, tribes });
  G.human.persona = makePersona(seed, { difficulty: 'expert' });
  for (const p of G.s.players) G.pickHero(p.idx, aiPickHero(G, p));
  return G;
}

describe('英雄戰場：其他手下', () => {
  it('神祇：4 個友方畸變體死亡後克蘇恩甦醒，把身材分給其他手下', () => {
    const G = game(['ABERRATION', 'BEAST', 'DEMON', 'UNDEAD', 'PIRATE']);
    const p = G.player(0);
    p.c.deityA = 19;
    p.c.deityH = 19;
    const abers = Array.from({ length: 4 }, () => m('BG36_098', { atk: 1, hp: 1 }));
    const big = m('BG19_010t', { atk: 1, hp: 100 });
    const res = runCombat(
      [
        { player: p, board: [...abers, big], tier: 1, heroId: '', hand: [], persist: false },
        { player: G.player(1), board: [m('BG19_010t', { atk: 1, hp: 30 })], tier: 1, heroId: '', hand: [], persist: false },
      ],
      { rng: { rng: 5 }, turn: 5, nextUid: () => uid++, inLobby: () => true, record: true },
    );
    const last = res.frames![res.frames!.length - 1];
    const ids = [...last.boards[0], ...res.survivors].map((x) => x.id);
    expect(ids).toContain('BGFYM_000');
  });

  it('棄牌：啟動技能棄掉淤泥腐蝕會施放兩次', () => {
    const G = game(['ABERRATION', 'BEAST', 'DEMON', 'UNDEAD', 'PIRATE']);
    const p = G.human;
    const envoy = m('BG36_311');
    const x = m('BG19_010t');
    p.board = [envoy, x];
    p.hand = [{ kind: 'spell', uid: uid++, id: 'BG36_301t', g: 1 }];
    const atk = x.atk;
    G.activate(0, envoy.uid, undefined, p.hand[0].uid);
    expect(x.atk).toBe(atk + 2);
    expect(p.c.discards).toBe(1);
    expect(() => G.activate(0, envoy.uid, undefined, p.hand[0]?.uid)).toThrow();
  });

  it('啟動技能要花金幣、每回合一次', () => {
    const G = game(['ABERRATION', 'BEAST', 'DEMON', 'UNDEAD', 'PIRATE']);
    const p = G.human;
    const guard = m('BG36_345');
    const x = m('BG19_010t');
    p.board = [guard, x];
    p.gold = 3;
    G.activate(0, guard.uid, x.uid);
    expect(x.atk).toBe(2 + 3);
    expect(p.gold).toBe(2);
    expect(() => G.activate(0, guard.uid, x.uid)).toThrow();
  });

  it('驚奇元素可以和任何元素組成三連', () => {
    const G = game(['ELEMENTAL', 'BEAST', 'DEMON', 'UNDEAD', 'PIRATE']);
    const p = G.human;
    const a = m('BGS_115');
    const b = m('BGS_115');
    p.board = [a, m('BG26_175')];
    G.addMinion(p, b);
    const gold = p.hand.find((h) => h.kind === 'minion' && h.m.golden);
    expect(gold && gold.kind === 'minion' && gold.m.id).toBe('BGS_115');
  });

  it('帶鎖箱五回合後打開成金卡', () => {
    const G = game(['PIRATE', 'BEAST', 'DEMON', 'UNDEAD', 'MURLOC']);
    const p = G.human;
    G.recruit(p).lockbox();
    for (let k = 0; k < 5; k++) {
      for (const x of G.s.players) x.board = [];
      p.hp = 99;
      G.finishRecruit();
      G.nextRound();
    }
    expect(p.hand.some((h) => h.kind === 'minion' && h.m.golden)).toBe(true);
    expect(p.hand.some((h) => h.kind === 'spell' && h.id === 'BG36_520t')).toBe(false);
  });

  it('空育逃亡者：在酒館觸發幼狼的奮戰，加成永久保留', () => {
    const G = game(['BEAST', 'DRAGON', 'DEMON', 'UNDEAD', 'PIRATE']);
    const p = G.human;
    const run = m('BG36_243');
    const pup = m('BG36_207');
    const x = m('BG19_010t');
    p.board = [run, pup, x];
    p.gold = 5;
    G.activate(0, run.uid, pup.uid);
    expect(x.atk).toBe(2 + 4);
    expect(x.hp).toBe(3 + 1);
  });

  it('魔術魚真菌學家：購買酒館法術後拿到會施放它的學徒', () => {
    const G = game(['MURLOC', 'DRAGON', 'DEMON', 'UNDEAD', 'PIRATE']);
    const p = G.human;
    const x = m('BG19_010t');
    p.board = [m('BG33_891'), x];
    p.gold = 10;
    p.shopSpells = [{ uid: uid++, id: 'BG28_168' }];
    G.buySpell(0, p.shopSpells[0].uid);
    const app = p.hand.find((h) => h.kind === 'minion' && h.m.id === 'BG33_890t')!;
    expect(app).toBeTruthy();
    const before = x.atk;
    G.play(0, app.uid, 0);
    expect(x.atk).toBe(before + 1);
  });

  it('所有種族組合：電腦把整局打完不出錯', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const tribes = [...TRIBES].sort(() => 0).filter((_, i) => (i + seed) % 2 === 0).slice(0, 5) as Tribe[];
      const G = game(tribes.includes('ABERRATION') ? tribes : (['ABERRATION', ...tribes.slice(0, 4)] as Tribe[]), seed);
      for (let r = 0; r < 40 && G.s.phase !== 'over'; r++) {
        if (G.human.alive) aiRecruit(G, G.human);
        playAiTurns(G);
        G.finishRecruit();
        if (G.s.phase === 'combat') G.nextRound();
      }
      expect(G.s.phase).toBe('over');
    }
    expect(AI_ERRORS).toEqual([]);
  }, 120000);
});
