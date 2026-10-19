// 英雄戰場的戰績：積分、名次、金幣獎勵，以及配對到的 7 位「玩家」
import { makePersona, type BgDifficulty } from '../bg/ai';
import type { BgPersona } from '../bg/types';
import { nextRandom } from '../engine/rng';
import { BG_PLACE_GOLD } from './economy';
import { makeName } from './ladder';
import type { Profile } from './profile';

export interface BgRecord {
  date: string;
  place: number;
  hero: string;
  /** 積分模式才有 */
  rating?: number;
  delta?: number;
  gold: number;
  /** 練習模式的難度 */
  difficulty?: BgDifficulty;
}

export interface BgStats {
  rating: number;
  best: number;
  games: number;
  /** 前四名 */
  top4: number;
  wins: number;
  history: BgRecord[];
}

export function newBgStats(): BgStats {
  return { rating: 0, best: 0, games: 0, top4: 0, wins: 0, history: [] };
}

export function sanitizeBg(raw: unknown): BgStats {
  const base = newBgStats();
  if (!raw || typeof raw !== 'object') return base;
  const b = raw as Partial<BgStats>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return {
    rating: num(b.rating),
    best: Math.max(num(b.best), num(b.rating)),
    games: num(b.games),
    top4: num(b.top4),
    wins: num(b.wins),
    history: Array.isArray(b.history) ? b.history.filter((h) => h && typeof h.place === 'number').slice(-30) : [],
  };
}

/** 積分變化：名次越前面加越多；對手比你強時，加得多、扣得少 */
export function ratingDelta(rating: number, place: number, lobbyAvg: number): number {
  const base = [0, 80, 55, 32, 12, -12, -32, -55, -80][place] ?? 0;
  const diff = Math.max(-30, Math.min(30, (lobbyAvg - rating) / 40));
  let d = base + diff;
  // 新手期：加分比較多、扣分比較少
  if (rating < 4000) {
    const f = (4000 - rating) / 4000;
    d = d > 0 ? d * (1 + f) : d * (1 - f * 0.6);
  }
  return Math.max(-rating, Math.round(d));
}

export function recordBgGame(
  p: Profile,
  place: number,
  hero: string,
  opts: { rated: boolean; lobbyAvg: number; difficulty?: BgDifficulty },
): { profile: Profile; gold: number; delta: number } {
  const bg = p.bg ?? newBgStats();
  const gold = BG_PLACE_GOLD[place] ?? 0;
  const delta = opts.rated ? ratingDelta(bg.rating, place, opts.lobbyAvg) : 0;
  const rating = bg.rating + delta;
  const rec: BgRecord = { date: new Date().toISOString(), place, hero, gold, ...(opts.rated ? { rating, delta } : { difficulty: opts.difficulty }) };
  const next: BgStats = {
    rating,
    best: Math.max(bg.best, rating),
    games: bg.games + 1,
    top4: bg.top4 + (place <= 4 ? 1 : 0),
    wins: bg.wins + (place === 1 ? 1 : 0),
    history: [...bg.history, rec].slice(-30),
  };
  return { profile: { ...p, gold: p.gold + gold, bg: next }, gold, delta };
}

export interface BgLobbyPlayer {
  name: string;
  persona: BgPersona;
}

/** 配對 7 位玩家：積分模式依你的積分，練習模式依難度（「混合」= 各種程度都有） */
export function findLobby(opts: { rating?: number; difficulty?: BgDifficulty | 'mixed' }, seed = Math.floor(Math.random() * 2 ** 31)): BgLobbyPlayer[] {
  const st = { rng: seed | 0 || 1 };
  const r = () => nextRandom(st);
  const names = new Set<string>();
  const out: BgLobbyPlayer[] = [];
  const mixed: BgDifficulty[] = ['novice', 'normal', 'normal', 'expert', 'expert', 'master', 'normal'];
  for (let i = 0; i < 7; i++) {
    let name = makeName(r);
    while (names.has(name)) name = makeName(r);
    names.add(name);
    const s = Math.floor(r() * 1e9);
    const persona =
      opts.difficulty === 'mixed'
        ? makePersona(s, { difficulty: mixed[i] })
        : opts.difficulty
          ? makePersona(s, { difficulty: opts.difficulty })
          : makePersona(s, { rating: opts.rating ?? 0 });
    out.push({ name, persona });
  }
  return out;
}
