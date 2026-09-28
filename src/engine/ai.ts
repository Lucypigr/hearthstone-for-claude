// ============================================================================
// 電腦對手
// 每次呼叫 chooseAction 決定一個動作：列舉所有合法動作，在複製的狀態上模擬，
// 用盤面評估函數挑出最好的；沒有更好的動作就結束回合。
// ============================================================================
import { getCard } from '../cards/registry';
import { Game, opp } from './game';
import { nextRandom, pick } from './rng';
import type { Action, GameState, Minion, PlayerId } from './state';

export type Difficulty = 'easy' | 'normal' | 'hard';

export function legalActions(g: Game): Action[] {
  const s = g.s;
  if (s.phase !== 'play' || s.pendingChoice) return [];
  const p = s.players[s.current];
  const out: Action[] = [];
  for (const hc of p.hand) {
    const def = getCard(hc.cardId);
    const options = def.chooseOne ? def.chooseOne.map((_o, i) => i) : [undefined];
    for (const option of options) {
      if (!g.canPlay(hc.uid, option).ok) continue;
      const req = g.playTargetReq(hc.uid, option);
      const targets = req ? g.validTargets(req, s.current, def.type === 'SPELL') : [];
      if (req && targets.length) {
        for (const t of targets) out.push({ type: 'play', handUid: hc.uid, target: t, option });
      } else if (!req || req.optional) out.push({ type: 'play', handUid: hc.uid, option });
    }
  }
  if (g.canHeroPower()) {
    const options = g.heroPowerOptions() ? g.heroPowerOptions()!.map((_o, i) => i) : [undefined];
    for (const option of options) {
      if (!g.canHeroPower(option)) continue;
      if (g.heroPowerNeedsTarget(option)) for (const t of g.heroPowerTargets(option)) out.push({ type: 'heroPower', target: t, option });
      else out.push({ type: 'heroPower', option });
    }
  }
  for (const c of [p.hero, ...p.board]) {
    if (!g.canAttack(c.uid)) continue;
    for (const t of g.attackTargets(c.uid)) out.push({ type: 'attack', attacker: c.uid, target: t });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 盤面評估
// ---------------------------------------------------------------------------

function minionValue(g: Game, m: Minion): number {
  if (m.hp <= 0 || m.dead) return 0;
  const atk = g.atkOf(m);
  let v = atk * 1.1 + m.hp;
  if (g.hasKw(m, 'TAUNT')) v += 1 + m.hp * 0.2;
  if (g.hasKw(m, 'DIVINE_SHIELD')) v += atk * 0.8 + 1;
  if (g.hasKw(m, 'POISONOUS')) v += 2;
  if (g.hasKw(m, 'LIFESTEAL')) v += atk * 0.5;
  if (g.hasKw(m, 'WINDFURY')) v += atk * 0.6;
  if (g.hasKw(m, 'STEALTH')) v += 1;
  if (g.hasKw(m, 'REBORN')) v += 1.5;
  if (g.hasKw(m, 'CANT_ATTACK')) v -= atk * 0.8;
  if (m.frozen) v -= atk * 0.4;
  if (!m.silenced) {
    v += m.spellDamage * 1.2;
    v += m.auras.length * 1.5;
    v += m.abilities.filter((a) => a.on.k !== 'play').length * 1.2;
  }
  return Math.max(0.5, v);
}

function heroValue(hp: number, armor: number): number {
  const eff = hp + armor;
  // 血量越低，每一點血越重要
  return eff + (eff < 15 ? (15 - eff) * 0.5 : 0) + (eff < 8 ? (8 - eff) * 1.0 : 0);
}

export function evaluate(g: Game, me: PlayerId): number {
  const s = g.s;
  if (s.phase === 'over') {
    if (s.winner === me) return 100000;
    if (s.winner === 'draw') return -5000;
    return -100000;
  }
  const a = s.players[me];
  const b = s.players[opp(me)];
  let score = 0;
  score += heroValue(a.hero.hp, a.hero.armor) - heroValue(b.hero.hp, b.hero.armor) * 1.1;
  score += a.board.reduce((x, m) => x + minionValue(g, m), 0);
  score -= b.board.reduce((x, m) => x + minionValue(g, m), 0) * 1.25;
  // 回音的複製回合結束就會消失，不算手牌優勢
  const handSize = (p: typeof a) => p.hand.filter((h) => !h.echo).length;
  score += Math.min(handSize(a), 8) * 1.6 - Math.min(handSize(b), 8) * 0.8;
  if (a.weapon) score += a.weapon.atk * Math.min(a.weapon.durability, 3) * 0.6;
  if (b.weapon) score -= b.weapon.atk * Math.min(b.weapon.durability, 3) * 0.6;
  score += a.secrets.length * 2 - b.secrets.length * 2;
  // 打出英雄卡後的強化英雄能力
  if (a.heroPower.heroCard) score += 6;
  if (b.heroPower.heroCard) score -= 6;
  // 對手場上的攻擊力威脅
  const threat = b.board.reduce((x, m) => x + (m.hp > 0 && !m.dead ? g.atkOf(m) : 0), 0);
  if (threat >= a.hero.hp + a.hero.armor) score -= 50;
  score -= a.overloadOwed * 0.8;
  return score;
}

// ---------------------------------------------------------------------------
// 模擬
// ---------------------------------------------------------------------------

function cloneForSim(state: GameState, me: PlayerId, salt: number): GameState {
  const copy: GameState = structuredClone({ ...state, log: [], fx: [] });
  // AI 不知道對手的奧秘內容
  copy.players[opp(me)].secrets = [];
  copy.rng = (state.rng ^ (salt * 2654435761)) | 0;
  return copy;
}

function simulate(state: GameState, me: PlayerId, action: Action, salt: number): Game | null {
  const g = new Game(cloneForSim(state, me, salt), { autoAll: true });
  if (!g.apply(action)) return null;
  return g;
}

function bestAction(g: Game, me: PlayerId, depth: number): { action: Action | null; score: number } {
  const actions = legalActions(g);
  const base = evaluate(g, me);
  let best: { action: Action | null; score: number } = { action: null, score: base };
  const scored: { action: Action; score: number; game: Game }[] = [];
  let salt = 1;
  for (const action of actions) {
    const sim = simulate(g.s, me, action, salt++);
    if (!sim) continue;
    const score = evaluate(sim, me);
    scored.push({ action, score, game: sim });
  }
  scored.sort((x, y) => y.score - x.score);
  if (depth > 1) {
    // 困難：對前幾名動作再往後看一步
    for (const cand of scored.slice(0, 6)) {
      if (cand.game.s.phase === 'over' || cand.game.s.current !== me) continue;
      const next = bestAction(cand.game, me, depth - 1);
      cand.score = Math.max(cand.score, next.score - 0.01);
    }
    scored.sort((x, y) => y.score - x.score);
  }
  if (scored.length && scored[0].score > base + 0.05) best = { action: scored[0].action, score: scored[0].score };
  return best;
}

/**
 * 困難：在整個回合的動作序列上做 beam search，找出回合結束時盤面最好的出牌順序，
 * 再執行其中的第一步（每一步都重新規劃，因為隨機效果會改變結果）。
 */
function planTurn(g: Game, me: PlayerId, width: number, depth: number): Action | null {
  const base = evaluate(g, me);
  type Node = { game: Game; first: Action | null; score: number };
  let beam: Node[] = [{ game: g, first: null, score: base }];
  let best: Node = beam[0];
  let salt = 1;
  for (let d = 0; d < depth; d++) {
    const next: Node[] = [];
    for (const node of beam) {
      if (node.game.s.phase !== 'play' || node.game.s.current !== me) continue;
      for (const action of legalActions(node.game)) {
        const sim = simulate(node.game.s, me, action, salt++);
        if (!sim) continue;
        next.push({ game: sim, first: node.first ?? action, score: evaluate(sim, me) });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.score - a.score);
    // 去除分數幾乎相同的重複分支，保留多樣性
    const seen = new Set<string>();
    beam = [];
    for (const n of next) {
      const key = n.score.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push(n);
      if (beam.length >= width) break;
    }
    if (beam[0].score > best.score) best = beam[0];
    if (best.score >= 100000) break; // 找到致命
  }
  return best.first && best.score > base + 0.05 ? best.first : null;
}

/** 決定電腦的下一個動作 */
export function chooseAction(g: Game, difficulty: Difficulty): Action {
  const s = g.s;
  const me = s.current;
  const actions = legalActions(g);
  if (!actions.length) return { type: 'endTurn' };
  if (difficulty === 'easy' && nextRandom({ rng: s.rng + s.turn * 7919 + s.fxSeq }) < 0.35) {
    // 簡單：偶爾做出隨機動作
    const a = pick({ rng: s.rng + s.fxSeq * 31 }, actions);
    if (a) return a;
  }
  if (difficulty === 'hard') return planTurn(g, me, 5, 8) ?? { type: 'endTurn' };
  const { action } = bestAction(g, me, 1);
  return action ?? { type: 'endTurn' };
}

/** 起手換牌：換掉高費卡 */
export function aiMulligan(g: Game, pid: PlayerId, difficulty: Difficulty): number[] {
  if (difficulty === 'easy') return [];
  const p = g.s.players[pid];
  return p.hand.filter((h) => getCard(h.cardId).cost > 3).map((h) => h.uid);
}

/** 讓電腦完成自己整個回合（測試 / 模擬用） */
export function playAiTurn(g: Game, difficulty: Difficulty, maxActions = 60): number {
  const me = g.s.current;
  let n = 0;
  while (g.s.phase === 'play' && g.s.current === me && n < maxActions) {
    const action = chooseAction(g, difficulty);
    if (!g.apply(action)) {
      g.apply({ type: 'endTurn' });
      break;
    }
    n++;
    if (action.type === 'endTurn') break;
  }
  if (g.s.phase === 'play' && g.s.current === me) g.apply({ type: 'endTurn' });
  return n;
}

