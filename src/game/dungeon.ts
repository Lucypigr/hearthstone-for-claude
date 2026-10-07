// 地城探險（狗頭人與地下城的 Dungeon Run）：一輪連續打 8 個隨機 Boss，
// 每場勝利後選擇獎勵（被動寶藏、寶藏卡、三張一組的卡牌），輸了就整輪重來。
import { DUNGEON_BOSSES, DUNGEON_STARTERS, type DungeonBoss } from '../cards/dungeonBosses';
import { ALL_CARDS, COLLECTIBLE, hasCard } from '../cards/registry';
import { ACTIVE_TREASURES, PASSIVE_TREASURES } from '../engine/dungeon';
import type { NewGameOptions } from '../engine/game';
import { nextRandom } from '../engine/rng';
import type { CardDef } from '../engine/types';

export const DUNGEON_LEVELS = 8;
export type DungeonClass = keyof typeof DUNGEON_STARTERS;
export const DUNGEON_CLASSES = Object.keys(DUNGEON_STARTERS) as DungeonClass[];

export interface DungeonReward {
  kind: 'passive' | 'treasure' | 'bundle';
  /** 三個選項；每個選項是一組卡牌 id（被動寶藏與寶藏卡只有一張） */
  options: string[][];
}

export interface DungeonRun {
  cls: DungeonClass;
  deck: string[];
  passives: string[];
  /** 已經擊敗的 Boss 數 */
  wins: number;
  /** 目前要面對的 Boss（DUNGEON_BOSSES 的索引） */
  boss: number;
  usedBosses: number[];
  stage: 'fight' | 'reward' | 'over' | 'cleared';
  rewards: DungeonReward[];
  seed: number;
}

export interface DungeonState {
  run: DungeonRun | null;
  /** 歷史最高擊敗 Boss 數 */
  best: number;
  clears: number;
  runs: number;
}

export const newDungeonState = (): DungeonState => ({ run: null, best: 0, clears: 0, runs: 0 });

// ---------------------------------------------------------------------------
// 卡名對照
// ---------------------------------------------------------------------------

let nameIndex: Map<string, CardDef[]> | null = null;
function byName(name: string): CardDef | null {
  if (!nameIndex) {
    nameIndex = new Map();
    // 牌組只會用可收藏的卡，其次是不可收藏的卡（例如石像鬼）
    const all = [...COLLECTIBLE, ...ALL_CARDS()];
    for (const c of all) {
      const k = c.nameEn.toLowerCase();
      if (!nameIndex.has(k)) nameIndex.set(k, []);
      nameIndex.get(k)!.push(c);
    }
  }
  const list = nameIndex.get(name.trim().toLowerCase());
  if (!list) return null;
  return list.find((c) => !c.id.startsWith('CORE_') && !c.id.startsWith('VAN_')) ?? list[0];
}

/** 把「2x Raid Leader, Fireball」這種牌組字串轉成卡牌 id；對不到的卡名回傳在 missing */
export function parseDeck(text: string): { cards: string[]; missing: string[] } {
  const cards: string[] = [];
  const missing: string[] = [];
  const parts = text.split(', ');
  const entry = (t: string) => {
    const m = /^(?:(\d+)x\s+)?(.+)$/.exec(t.trim());
    return m ? { n: m[1] ? Number(m[1]) : 1, name: m[2] } : null;
  };
  for (let i = 0; i < parts.length; i++) {
    let e = entry(parts[i]);
    if (!e) continue;
    let c = byName(e.name);
    // 卡名本身含逗號（例如「Kalimos, Primal Lord」）：和下一段合併再找一次
    if (!c && i + 1 < parts.length && !/^\d+x\s/.test(parts[i + 1])) {
      const merged = entry(`${parts[i]}, ${parts[i + 1]}`);
      const mc = merged ? byName(merged.name) : null;
      if (merged && mc) {
        e = merged;
        c = mc;
        i++;
      }
    }
    if (!c) {
      missing.push(e.name);
      continue;
    }
    for (let k = 0; k < e.n; k++) cards.push(c.id);
  }
  return { cards, missing };
}

// ---------------------------------------------------------------------------
// 亂數（可重現）：用 run 的 seed 推進
// ---------------------------------------------------------------------------

function rng(run: { seed: number }): () => number {
  const st = { rng: run.seed };
  const f = () => {
    const v = nextRandom(st as never);
    run.seed = st.rng;
    return v;
  };
  return f;
}

const pickOne = <T>(list: T[], r: () => number): T => list[Math.floor(r() * list.length)];
function sample<T>(list: T[], n: number, r: () => number): T[] {
  const a = [...list];
  const out: T[] = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
  return out;
}

// ---------------------------------------------------------------------------
// 一輪的流程
// ---------------------------------------------------------------------------

function chooseBoss(run: DungeonRun, r: () => number): number {
  const level = run.wins + 1;
  const pool = DUNGEON_BOSSES.map((b, i) => [b, i] as const).filter(([b, i]) => b.levels.includes(level) && !run.usedBosses.includes(i));
  const fallback = DUNGEON_BOSSES.map((b, i) => [b, i] as const).filter(([b]) => b.levels.includes(level));
  return pickOne(pool.length ? pool : fallback, r)[1];
}

export function startRun(cls: DungeonClass, seed = Math.floor(Math.random() * 2 ** 31)): DungeonRun {
  const starter = parseDeck(DUNGEON_STARTERS[cls]);
  // 起始牌組對不到的卡，換成同職業 / 中立的低消耗手下
  const fill = rng({ seed });
  const basics = COLLECTIBLE.filter((c) => c.type === 'MINION' && c.rarity !== 'LEGENDARY' && (c.cardClass === cls || c.cardClass === 'NEUTRAL') && c.cost >= 2 && c.cost <= 4);
  for (let i = 0; i < starter.missing.length; i++) starter.cards.push(pickOne(basics, fill).id);
  const run: DungeonRun = {
    cls,
    deck: starter.cards,
    passives: [],
    wins: 0,
    boss: 0,
    usedBosses: [],
    stage: 'fight',
    rewards: [],
    seed,
  };
  run.boss = chooseBoss(run, rng(run));
  run.usedBosses.push(run.boss);
  return run;
}

export const currentBoss = (run: DungeonRun): DungeonBoss => DUNGEON_BOSSES[run.boss];
export const currentLevel = (run: DungeonRun) => run.wins + 1;

/** 你的起始生命：15，每擊敗一個 Boss +5（最多 50） */
export const playerHp = (run: DungeonRun) => Math.min(50, 15 + 5 * run.wins);

export function bossHp(run: DungeonRun): number {
  const b = currentBoss(run);
  const i = b.levels.indexOf(currentLevel(run));
  return b.hp[i >= 0 ? i : b.hp.length - 1];
}

export function bossPower(run: DungeonRun): string {
  const b = currentBoss(run);
  return b.power2 && b.levelUp !== undefined && currentLevel(run) >= b.levelUp ? b.power2 : b.power;
}

/** Boss 的牌組（對不到的卡換成同職業 / 中立、消耗相近的卡） */
export function bossDeck(run: DungeonRun): string[] {
  const b = currentBoss(run);
  const { cards, missing } = parseDeck(b.deck);
  const r = rng({ seed: run.seed + run.boss });
  const pool = COLLECTIBLE.filter((c) => c.type === 'MINION' && c.rarity !== 'LEGENDARY' && (c.cardClass === b.cls || c.cardClass === 'NEUTRAL') && c.cost >= 2 && c.cost <= 6);
  for (let i = 0; i < missing.length; i++) cards.push(pickOne(pool, r).id);
  return cards;
}

/** 開局設定：玩家先攻，雙方都沒有幸運幣；最後一關 Boss 開局有 2 顆法力水晶 */
export function gameOptions(run: DungeonRun, names: [string, string] = ['你', currentBoss(run).name]): NewGameOptions {
  const b = currentBoss(run);
  return {
    decks: [run.deck, bossDeck(run)],
    classes: [run.cls, b.cls],
    names,
    ai: [false, true],
    first: 0,
    noCoin: true,
    heroHp: [playerHp(run), bossHp(run)],
    heroCards: [undefined, b.hero],
    heroPowerIds: [undefined, bossPower(run)],
    passives: [run.passives, []],
    startMana: [undefined, currentLevel(run) === DUNGEON_LEVELS ? 2 : undefined],
    dungeonWins: run.wins,
  };
}

// ---------------------------------------------------------------------------
// 獎勵
// ---------------------------------------------------------------------------

function bundleOptions(run: DungeonRun, r: () => number): string[][] {
  const maxCost = Math.min(9, 3 + run.wins);
  const pool = COLLECTIBLE.filter(
    (c) => (c.cardClass === run.cls || c.cardClass === 'NEUTRAL') && c.rarity !== 'FREE' && c.rarity !== 'LEGENDARY' && c.type !== 'HERO' && c.cost <= maxCost && !c.startOfGame,
  );
  const minions = pool.filter((c) => c.type === 'MINION');
  const rest = pool.filter((c) => c.type !== 'MINION');
  return Array.from({ length: 3 }, () => [...sample(minions, 2, r), ...sample(rest, 1, r)].map((c) => c.id));
}

function buildRewards(run: DungeonRun, r: () => number): DungeonReward[] {
  const out: DungeonReward[] = [];
  const w = run.wins;
  if (w === 1 || w === 5) {
    const left = PASSIVE_TREASURES.filter((id) => !run.passives.includes(id) && hasCard(id));
    out.push({ kind: 'passive', options: sample(left, 3, r).map((id) => [id]) });
  }
  if (w === 3 || w === 7) out.push({ kind: 'treasure', options: sample(ACTIVE_TREASURES.filter(hasCard), 3, r).map((id) => [id]) });
  out.push({ kind: 'bundle', options: bundleOptions(run, r) });
  return out;
}

/** 一場戰鬥結束後更新這一輪 */
export function finishFight(run: DungeonRun, won: boolean): DungeonRun {
  if (!won) return { ...run, stage: 'over' };
  const next: DungeonRun = { ...run, wins: run.wins + 1, usedBosses: [...run.usedBosses] };
  if (next.wins >= DUNGEON_LEVELS) return { ...next, stage: 'cleared', rewards: [] };
  const r = rng(next);
  next.rewards = buildRewards(next, r);
  next.stage = 'reward';
  return next;
}

/** 選擇目前的獎勵（option = 0 ～ 2）；全部領完後選出下一個 Boss */
export function pickReward(run: DungeonRun, option: number): DungeonRun {
  const reward = run.rewards[0];
  if (!reward || !reward.options[option]) return run;
  const next: DungeonRun = { ...run, deck: [...run.deck], passives: [...run.passives], usedBosses: [...run.usedBosses], rewards: run.rewards.slice(1) };
  const chosen = reward.options[option];
  if (reward.kind === 'passive') next.passives.push(chosen[0]);
  else next.deck.push(...chosen);
  if (!next.rewards.length) {
    const r = rng(next);
    next.boss = chooseBoss(next, r);
    next.usedBosses.push(next.boss);
    next.stage = 'fight';
  }
  return next;
}

/** 一輪結束時的金幣獎勵 */
export const runGold = (run: DungeonRun) => run.wins * 25 + (run.stage === 'cleared' ? 300 : 0);
