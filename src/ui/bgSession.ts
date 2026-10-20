// 英雄戰場進行中的一局：建立、存檔（重新整理也能繼續）、回合流程
import { aiPickHero, playAiTurns, type BgDifficulty } from '../bg/ai';
import { BgGame, type BgState } from '../bg/game';
import { findLobby, recordBgGame } from '../game/battlegrounds';
import { getProfile, setProfile } from './store';

const KEY = 'hearthstone-for-claude/bg-session-v1';

export interface BgSession {
  game: BgGame;
  /** 積分模式（會加減積分） */
  rated: boolean;
  difficulty?: BgDifficulty | 'mixed';
  lobbyAvg: number;
  /** 回合計時 */
  timer: boolean;
  /** 這回合開始的時間（performance.now） */
  roundStart: number;
  /** 電腦玩家這回合想多久（秒） */
  think: Record<number, number>;
  /** 結算結果（遊戲結束後才有） */
  result?: { place: number; gold: number; delta: number };
}

let current: BgSession | null = null;

export function getSession(): BgSession | null {
  if (current) return current;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Omit<BgSession, 'game' | 'roundStart'> & { state: BgState };
    if (!d.state?.players?.length) return null;
    // 舊版存檔沒有酒館法術的欄位
    for (const pl of d.state.players) {
      pl.shopSpells ??= [];
      pl.after ??= [];
    }
    current = { ...d, game: new BgGame(d.state), roundStart: performance.now() };
    return current;
  } catch {
    return null;
  }
}

export function saveSession(s: BgSession | null) {
  current = s;
  try {
    if (!s) {
      localStorage.removeItem(KEY);
      return;
    }
    // 戰鬥動畫的畫面很大，不用存
    const state: BgState = { ...s.game.s, combats: s.game.s.combats.map((c) => ({ ...c, frames: undefined })) };
    const { game: _g, roundStart: _r, ...rest } = s;
    localStorage.setItem(KEY, JSON.stringify({ ...rest, state }));
  } catch {
    /* 私密瀏覽等情況無法儲存 */
  }
}

export function newSession(opts: {
  rated: boolean;
  difficulty?: BgDifficulty | 'mixed';
  timer: boolean;
  name: string;
  trinkets?: boolean;
  timewarp?: boolean;
  anomaly?: boolean;
  quests?: boolean;
  buddies?: boolean;
  duos?: boolean;
}): BgSession {
  const p = getProfile();
  const rating = p.bg?.rating ?? 0;
  const seed = Math.floor(Math.random() * 2 ** 31);
  const lobby = findLobby(opts.rated ? { rating } : { difficulty: opts.difficulty ?? 'normal' }, seed);
  const game = BgGame.create({ seed, humanName: opts.name, ais: lobby, trinkets: opts.trinkets, timewarp: opts.timewarp, anomaly: opts.anomaly, quests: opts.quests, buddies: opts.buddies, duos: opts.duos });
  for (const pl of game.s.players) if (!pl.isHuman) game.pickHero(pl.idx, aiPickHero(game, pl));
  const lobbyAvg = lobby.reduce((n, x) => n + x.persona.rating, 0) / lobby.length;
  const s: BgSession = { game, rated: opts.rated, difficulty: opts.difficulty, lobbyAvg, timer: opts.timer, roundStart: performance.now(), think: {} };
  saveSession(s);
  return s;
}

/** 新回合開始：電腦做完自己的招募，記下各自想了多久 */
export function beginRound(s: BgSession) {
  const think = playAiTurns(s.game);
  s.think = Object.fromEntries(think);
  s.roundStart = performance.now();
  saveSession(s);
}

export function pickHero(s: BgSession, heroId: string) {
  s.game.pickHero(0, heroId);
  if (s.game.s.phase === 'recruit') beginRound(s);
}

/** 每回合的招募時間（秒） */
export function turnSeconds(round: number): number {
  return Math.min(90, 45 + (round - 1) * 5);
}

/** 你被淘汰後：讓其他人打完，決定所有名次 */
export function finishWithoutHuman(s: BgSession) {
  const G = s.game;
  for (let guard = 0; guard < 60 && G.s.phase !== 'over'; guard++) {
    if (G.s.phase === 'combat') G.nextRound();
    if (G.s.phase === 'recruit') {
      playAiTurns(G);
      G.finishRecruit();
    }
  }
}

/** 結算：名次、金幣、積分（只會做一次） */
export function settle(s: BgSession): NonNullable<BgSession['result']> {
  if (s.result) return s.result;
  const me = s.game.human;
  const place = me.place ?? 1;
  // 雙人模式：隊伍名次換算成八人局的名次來算積分
  const r = recordBgGame(getProfile(), s.game.s.duos ? [0, 1, 3, 6, 8][place] ?? place : place, me.heroId, {
    rated: s.rated,
    lobbyAvg: s.lobbyAvg,
    difficulty: s.difficulty === 'mixed' ? undefined : s.difficulty,
  });
  setProfile(r.profile);
  s.result = { place, gold: r.gold, delta: r.delta };
  saveSession(s);
  return s.result;
}
