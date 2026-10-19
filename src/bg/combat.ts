// 英雄戰場的自動戰鬥（和畫面無關；電腦也用它來模擬戰鬥、決定站位）
import type { Combat } from './api';
import { isRace, tierOf } from './data';

const DEITY = 'BGFYM_000';
import { SPEC } from './cards';
import { HERO_SPEC } from './heroes';
import { nextRandom } from '../engine/rng';
import { auraOf, BOARD_MAX, makeMinion, specsOf, spellExtraOf } from './rules';
import type { BMinion, BPlayer, CombatFrame, CombatResult, Keyword } from './types';

export interface SideInput {
  player: BPlayer;
  board: BMinion[];
  tier: number;
  heroId: string;
  /** 手牌中的手下（有些效果在戰鬥中會用到） */
  hand: BMinion[];
  /** 這一方的永久效果要不要保存（模擬或殘影 = false） */
  persist: boolean;
}

export interface CombatOptions {
  rng: { rng: number };
  turn: number;
  record?: boolean;
  nextUid: () => number;
  inLobby: (id: string) => boolean;
  inLobbySpell?: (id: string) => boolean;
  give?: (p: BPlayer, id: string) => void;
  giveRandom?: (p: BPlayer, filter: (id: string) => boolean) => void;
}

/** 戰鬥用的複製（不影響招募階段的手下） */
export function toCombatMinion(m: BMinion, cnt: Record<string, number>, heroHp: number): BMinion {
  const [a, h] = auraOf(cnt, m, heroHp);
  const c: BMinion = { ...m, tmpKw: [], tmpAtk: 0, tmpHp: 0, src: m.uid, atk: m.atk + m.tmpAtk + a, hp: m.hp + m.tmpHp + h, avenge: 0, uses: 0 };
  for (const k of m.tmpKw) c[k] = true;
  c.maxHp = c.hp;
  return c;
}

function snap(m: BMinion): BMinion {
  return { ...m, mags: m.mags.slice(), tmpKw: [] };
}

export class CombatSim implements Combat {
  turn: number;
  private boards: [BMinion[], BMinion[]];
  private counts: [Record<string, number>, Record<string, number>];
  private hands: [BMinion[], BMinion[]];
  private deathCount: [number, number] = [0, 0];
  private heroAvenge: [number, number] = [0, 0];
  private immediate: BMinion[] = [];
  private frames: CombatFrame[] | null;
  private hits: { uid: number; amount: number }[] = [];
  private first: 0 | 1 = 0;
  /** 拉法姆：第一個被殺死的手下 */
  private firstKill: [boolean, boolean] = [false, false];
  /** 戰鬥開始時的手下 */
  private starting: [string[], string[]];
  /** 死掉的畸變體（4 個後神祇甦醒） */
  private aberDeaths: [number, number] = [0, 0];
  private awakened: [boolean, boolean] = [false, false];
  private died: [string[], string[]] = [[], []];
  /** 有空位時才召喚的手下（泰朗‧血魔） */
  private later: [BMinion[], BMinion[]] = [[], []];

  constructor(
    private sides: [SideInput, SideInput],
    private o: CombatOptions,
  ) {
    this.turn = o.turn;
    this.counts = [{ ...sides[0].player.c }, { ...sides[1].player.c }];
    this.boards = [
      sides[0].board.map((m) => toCombatMinion(m, this.counts[0], sides[0].player.hp)),
      sides[1].board.map((m) => toCombatMinion(m, this.counts[1], sides[1].player.hp)),
    ];
    this.hands = [sides[0].persist ? sides[0].hand : sides[0].hand.map(snap), sides[1].persist ? sides[1].hand : sides[1].hand.map(snap)];
    this.frames = o.record ? [] : null;
    this.starting = [this.boards[0].map((m) => m.id), this.boards[1].map((m) => m.id)];
  }

  startBoard(side: 0 | 1): string[] {
    return this.starting[side];
  }

  summonLater(side: 0 | 1, m: BMinion) {
    this.later[side].push(m);
    this.flushLater(side);
  }

  private flushLater(side: 0 | 1) {
    while (this.later[side].length && this.alive(side).length < BOARD_MAX) this.summon(side, this.later[side].shift()!);
  }

  deity(side: 0 | 1, atk: number, hp: number) {
    this.counter(side, 'deityA', atk);
    this.counter(side, 'deityH', hp);
    for (const m of this.alive(side)) if (m.id === DEITY) this.buff(m, atk, hp);
  }

  /** 4 個友方畸變體死亡後，神祇甦醒（克蘇恩：把身材分給其他手下） */
  private awaken(side: 0 | 1) {
    if (this.awakened[side] || this.aberDeaths[side] < 4 || this.alive(side).length >= BOARD_MAX) return;
    this.awakened[side] = true;
    const d = this.make(DEITY);
    d.atk = 1 + this.cnt(side, 'deityA');
    d.hp = 1 + this.cnt(side, 'deityH');
    const placed = this.summon(side, d);
    if (!placed) return;
    const others = this.alive(side).filter((m) => m !== placed);
    if (!others.length) return;
    const split = (total: number, f: (m: BMinion, n: number) => void) => {
      const each = Math.floor(total / others.length);
      let rest = total - each * others.length;
      for (const m of others) f(m, each);
      while (rest-- > 0) f(this.pick(others)!, 1);
    };
    split(placed.atk, (m, n) => this.buff(m, n, 0));
    split(placed.hp, (m, n) => this.buff(m, 0, n));
  }

  // —— Combat 介面 ——
  rand(): number {
    return nextRandom(this.o.rng);
  }
  pick<T>(arr: T[]): T | undefined {
    return arr.length ? arr[Math.floor(this.rand() * arr.length)] : undefined;
  }
  side(m: BMinion): 0 | 1 {
    return this.boards[1].includes(m) ? 1 : 0;
  }
  board(side: 0 | 1): BMinion[] {
    return this.boards[side];
  }
  friends(m: BMinion): BMinion[] {
    return this.boards[this.side(m)].filter((x) => !x.dead);
  }
  enemies(m: BMinion): BMinion[] {
    return this.boards[1 - this.side(m)].filter((x) => !x.dead);
  }
  alive(side: 0 | 1): BMinion[] {
    return this.boards[side].filter((x) => !x.dead);
  }
  player(side: 0 | 1): BPlayer {
    return this.sides[side].player;
  }
  heroTier(side: 0 | 1): number {
    return this.sides[side].tier;
  }
  hand(side: 0 | 1): BMinion[] {
    return this.hands[side];
  }
  deaths(side: 0 | 1): number {
    return this.deathCount[side];
  }
  cnt(side: 0 | 1, key: string): number {
    return this.counts[side][key] ?? 0;
  }
  index(m: BMinion): number {
    return this.boards[this.side(m)].indexOf(m);
  }
  inLobby(id: string): boolean {
    return this.o.inLobby(id);
  }
  inLobbySpell(id: string): boolean {
    return this.o.inLobbySpell?.(id) ?? true;
  }
  make(id: string, golden = false): BMinion {
    return makeMinion(id, golden, this.o.nextUid());
  }

  give(side: 0 | 1, id: string) {
    if (this.sides[side].persist) this.o.give?.(this.sides[side].player, id);
  }
  giveRandom(side: 0 | 1, filter: (id: string) => boolean) {
    if (this.sides[side].persist) this.o.giveRandom?.(this.sides[side].player, filter);
  }

  private source(m: BMinion): BMinion | undefined {
    const s = this.side(m);
    if (!this.sides[s].persist || m.src === undefined) return undefined;
    return this.sides[s].player.board.find((x) => x.uid === m.src);
  }

  private rawBuff(m: BMinion, atk: number, hp: number) {
    if (m.dead) return;
    m.atk = Math.max(0, m.atk + atk);
    m.hp += hp;
    m.maxHp = (m.maxHp ?? m.hp) + hp;
    // 緋紅倖存者：攻擊力達到 6 時獲得聖盾
    if (m.id === 'BG35_814' && m.atk >= 6 && !m.n) {
      m.shield = true;
      m.n = 1;
    }
  }
  /** 塔瑞克苟薩、堅毅詩人旁邊的龍：戰鬥中獲得的身材與關鍵字永久保留 */
  private keeps(m: BMinion): boolean {
    if (m.id === 'BG21_015') return true;
    const b = this.boards[this.side(m)];
    const i = b.indexOf(m);
    if (!isRace(m.id, 'DRAGON')) return false;
    return [b[i - 1], b[i + 1]].some((x) => x && !x.dead && x.id === 'BG29_813');
  }
  buff(m: BMinion, atk: number, hp: number) {
    if (m.dead) return;
    this.rawBuff(m, atk, hp);
    if (this.keeps(m)) {
      const src = this.source(m);
      if (src) (src.atk += atk), (src.hp += hp);
    }
  }
  perm(m: BMinion, atk: number, hp: number) {
    this.rawBuff(m, atk, hp);
    const src = this.source(m);
    if (src) {
      src.atk += atk;
      src.hp += hp;
    }
  }
  bump(m: BMinion, n = 1) {
    m.n += n;
    const src = this.source(m);
    if (src) src.n += n;
  }
  spellExtra(side: 0 | 1): [number, number] {
    return spellExtraOf(this.counts[side], this.boards[side]);
  }
  giveKw(m: BMinion, kw: Keyword) {
    m[kw] = true;
    if (this.keeps(m)) {
      const src = this.source(m);
      if (src) src[kw] = true;
    }
  }
  destroy(m: BMinion) {
    if (m.dead) return;
    m.hp = 0;
    m.dead = true;
  }

  counter(side: 0 | 1, key: string, n: number) {
    const alive = this.alive(side);
    const hp = this.sides[side].player.hp;
    const before = alive.map((m) => auraOf(this.counts[side], m, hp));
    this.counts[side][key] = (this.counts[side][key] ?? 0) + n;
    if (this.sides[side].persist && !key.startsWith('~')) this.sides[side].player.c[key] = (this.sides[side].player.c[key] ?? 0) + n;
    alive.forEach((m, i) => {
      const [a, h] = auraOf(this.counts[side], m, hp);
      this.buff(m, a - before[i][0], h - before[i][1]);
    });
  }

  summon(side: 0 | 1, m: BMinion, index?: number): BMinion | null {
    const board = this.boards[side];
    if (board.filter((x) => !x.dead).length >= BOARD_MAX) return null;
    const [a, h] = auraOf(this.counts[side], m, this.sides[side].player.hp);
    m.atk += a;
    m.hp += h;
    m.maxHp = m.hp;
    m.avenge = 0;
    m.uses = 0;
    const i = index === undefined ? board.length : Math.max(0, Math.min(board.length, index));
    board.splice(i, 0, m);
    HERO_SPEC.get(this.sides[side].heroId)?.onSummonCombat?.(this, side, m);
    for (const f of board) {
      if (f === m || f.dead) continue;
      for (const { s, g } of specsOf(f)) s.onSummon?.(this, f, m, g);
    }
    return m;
  }

  damage(t: BMinion, amount: number, source: BMinion | null): number {
    if (t.dead || amount <= 0) return 0;
    const side = this.side(t);
    if (t.shield) {
      t.shield = false;
      this.hits.push({ uid: t.uid, amount: 0 });
      for (const f of this.alive(side)) for (const { s, g } of specsOf(f)) s.onShieldLost?.(this, f, t, g);
      return 0;
    }
    const before = t.hp;
    t.hp -= amount;
    this.hits.push({ uid: t.uid, amount });
    for (const { s, g } of specsOf(t)) s.onDamaged?.(this, t, amount, g);
    if (source) {
      for (const f of this.alive(this.side(source))) {
        if (f === source) continue;
        for (const { s, g } of specsOf(f)) s.onFriendDealt?.(this, f, source, g);
      }
    }
    if (t.hp <= 0) this.markDead(t, source);
    return Math.max(0, amount - Math.max(0, before));
  }

  private markDead(t: BMinion, source: BMinion | null) {
    if (t.dead) return;
    t.dead = true;
    if (!source) return;
    t.killer = source.uid;
    const ks = this.side(source);
    if (ks === this.side(t)) return;
    HERO_SPEC.get(this.sides[ks].heroId)?.onKill?.(this, ks, source, t, !this.firstKill[ks]);
    this.firstKill[ks] = true;
  }

  attackNow(m: BMinion) {
    this.immediate.push(m);
  }

  deathrattle(m: BMinion) {
    const side = this.side(m);
    const i = Math.max(0, this.boards[side].indexOf(m) + 1);
    this.runDeathrattle(m, side, i);
  }

  private runDeathrattle(m: BMinion, side: 0 | 1, index: number) {
    const titus = this.alive(side).reduce((n, x) => n + (x.id === 'BG25_354' ? (x.golden ? 2 : 1) : 0), 0);
    const extra = (m.extraDr ?? []).map((x) => ({ s: SPEC.get(x.id)!, g: x.g })).filter((x) => x.s);
    for (let t = 0; t <= titus; t++) {
      for (const { s, g } of [...specsOf(m), ...extra]) {
        if (!s.deathrattle) continue;
        s.deathrattle(this, m, g, index);
        this.counter(side, 'drs', 1);
      }
    }
  }

  // —— 戰鬥流程 ——
  private isTaunt(m: BMinion): boolean {
    return m.taunt || (m.shield && specsOf(m).some(({ s }) => s.tauntWhileShield));
  }

  private chooseTarget(foes: BMinion[]): BMinion | undefined {
    const taunts = foes.filter((m) => this.isTaunt(m));
    if (taunts.length) return this.pick(taunts);
    const visible = foes.filter((m) => !m.stealth);
    return this.pick(visible.length ? visible : foes);
  }

  private attack(att: BMinion) {
    if (att.dead) return;
    const s = this.side(att);
    const foes = this.alive((1 - s) as 0 | 1);
    const target = this.chooseTarget(foes);
    if (!target) return;
    this.hits = [];
    HERO_SPEC.get(this.sides[s].heroId)?.onAttack?.(this, s, att);
    for (const { s: sp, g } of specsOf(att)) sp.rally?.(this, att, g, target);
    for (const f of this.alive(s)) {
      if (f === att) continue;
      for (const { s: sp, g } of specsOf(f)) sp.onFriendAttack?.(this, f, att, g, target);
    }
    if (att.dead || target.dead) {
      this.frame(att.uid, target.uid);
      this.resolveDeaths();
      return;
    }
    att.stealth = false;
    const ad = att.atk;
    const td = target.atk;
    const tShield = target.shield;
    const aShield = att.shield;
    const tb = this.boards[1 - s];
    const ti = tb.indexOf(target);
    const near = specsOf(att).some(({ s: sp }) => sp.cleave) ? [tb[ti - 1], tb[ti + 1]].filter((m) => m && !m.dead) : [];
    const excess = this.damage(target, ad, att);
    for (const m of near) this.damage(m, ad, att);
    this.damage(att, td, target);
    if (att.venom && !tShield && ad > 0 && !target.dead) {
      target.hp = 0;
      this.markDead(target, att);
      att.venom = false;
    } else if (att.venom && !tShield && ad > 0) att.venom = false;
    if (target.venom && !aShield && td > 0 && !att.dead) {
      att.hp = 0;
      this.markDead(att, target);
      target.venom = false;
    }
    for (const { s: sp, g } of specsOf(att)) sp.afterAttack?.(this, att, g, target, !!target.dead, excess);
    for (const f of this.alive(s)) {
      if (f === att) continue;
      for (const { s: sp, g } of specsOf(f)) sp.afterFriendAttack?.(this, f, att, g);
    }
    this.frame(att.uid, target.uid);
    this.resolveDeaths();
  }

  private resolveDeaths() {
    for (let loop = 0; loop < 60; loop++) {
      const dead: { m: BMinion; side: 0 | 1; left: BMinion | null }[] = [];
      for (const side of [this.first, (1 - this.first) as 0 | 1]) {
        const b = this.boards[side];
        b.forEach((m, i) => {
          if (!m.dead) return;
          let left: BMinion | null = null;
          for (let j = i - 1; j >= 0; j--) {
            if (!b[j].dead) {
              left = b[j];
              break;
            }
          }
          dead.push({ m, side, left });
        });
      }
      if (!dead.length) return;
      for (const side of [0, 1] as const) this.boards[side] = this.boards[side].filter((m) => !m.dead);
      for (const d of dead) {
        const b = this.boards[d.side];
        const at = d.left && b.includes(d.left) ? b.indexOf(d.left) + 1 : 0;
        this.deathCount[d.side]++;
        if (!d.m.temp) this.died[d.side].push(d.m.id);
        if (isRace(d.m.id, 'ABERRATION') && d.m.id !== DEITY) this.aberDeaths[d.side]++;
        this.withGhost(d.m, d.side, at, () => {
          for (const { s, g } of specsOf(d.m)) s.onDeath?.(this, d.m, g);
          this.runDeathrattle(d.m, d.side, at);
        });
        const friends = this.alive(d.side);
        for (const f of friends) {
          for (const { s, g } of specsOf(f)) {
            if (!s.avenge) continue;
            f.avenge = (f.avenge ?? 0) + 1;
            if (f.avenge >= s.avenge[0]) {
              f.avenge = 0;
              s.avenge[1](this, f, g);
            }
          }
          for (const { s, g } of specsOf(f)) s.onFriendDeath?.(this, f, d.m, g);
        }
        HERO_SPEC.get(this.sides[d.side].heroId)?.onFriendDeath?.(this, d.side, d.m);
        const hero = HERO_SPEC.get(this.sides[d.side].heroId);
        if (hero?.avenge) {
          this.heroAvenge[d.side]++;
          if (this.heroAvenge[d.side] >= hero.avenge[0]) {
            this.heroAvenge[d.side] = 0;
            hero.avenge[1](this, d.side);
          }
        }
        if (d.m.reborn && !d.m.temp) {
          const r = this.make(d.m.id, d.m.golden);
          r.hp = 1;
          r.reborn = false;
          r.reborned = true;
          r.src = d.m.src;
          const placed = this.summon(d.side, r, Math.min(at, this.boards[d.side].length));
          if (placed) {
            placed.hp = 1;
            placed.maxHp = 1;
            for (const f of this.alive(d.side)) {
              if (f === placed) continue;
              for (const { s, g } of specsOf(f)) s.onFriendReborn?.(this, f, placed, g);
            }
          }
        }
      }
      for (const side of [0, 1] as const) {
        this.boon(side);
        this.awaken(side);
        this.flushLater(side);
      }
      this.frame();
    }
  }

  /** 死亡的手下觸發亡語時，讓 side()/friends() 找得到它 */
  private withGhost(m: BMinion, side: 0 | 1, at: number, fn: () => void) {
    const b = this.boards[side];
    b.splice(Math.min(at, b.length), 0, m);
    try {
      fn();
    } finally {
      const i = this.boards[side].indexOf(m);
      if (i >= 0) this.boards[side].splice(i, 1);
    }
  }

  /** 起始戰鬥的酒館法術：佔上風、諾茲多姆的子嗣、甲蟲恩澤 */
  private socSpells(side: 0 | 1) {
    const foe = (1 - side) as 0 | 1;
    for (let k = 0; k < this.cnt(side, 'upperHand'); k++) {
      const m = this.pick(this.alive(foe));
      if (m) m.hp = m.maxHp = 1;
    }
    for (let k = 0; k < this.cnt(side, 'brood'); k++) {
      const m = this.alive(side)[0];
      if (m) m.atk *= 2;
    }
    this.boon(side);
  }

  private boonDone: [boolean, boolean] = [false, false];
  /** 甲蟲恩澤：戰鬥中有空位時召喚兩隻有嘲諷的 2/2 甲蟲 */
  private boon(side: 0 | 1) {
    if (this.boonDone[side] || this.cnt(side, 'boon') <= 0 || this.alive(side).length >= BOARD_MAX) return;
    this.boonDone[side] = true;
    this.counter(side, 'boon', -1);
    for (let k = 0; k < 2; k++) {
      const b = this.summon(side, this.make('BG28_603t'));
      if (b) b.taunt = true;
    }
  }

  private frame(attacker?: number, target?: number, note?: string) {
    if (!this.frames) return;
    this.frames.push({ boards: [this.boards[0].map(snap), this.boards[1].map(snap)], attacker, target, hits: this.hits.length ? this.hits : undefined, note });
    this.hits = [];
  }

  private runImmediate() {
    while (this.immediate.length) {
      const m = this.immediate.shift()!;
      if (!m.dead && this.alive((1 - this.side(m)) as 0 | 1).length) this.attack(m);
    }
  }

  /** 在招募階段觸發奮戰（空育逃亡者）：戰鬥複製上增加的身材加回原本的手下 */
  rallyOutside(uid: number) {
    const side = 0;
    const m = this.boards[side].find((x) => x.src === uid);
    const target = this.boards[1][0];
    if (!m || !target) return;
    const before = new Map(this.boards[side].map((x) => [x, { a: x.atk, h: x.hp, src: this.source(x) && { a: this.source(x)!.atk, h: this.source(x)!.hp } }]));
    for (const { s, g } of specsOf(m)) s.rally?.(this, m, g, target);
    for (const [x, b] of before) {
      const src = this.source(x);
      if (!src) continue;
      const da = x.atk - b.a - (b.src ? src.atk - b.src.a : 0);
      const dh = x.hp - b.h - (b.src ? src.hp - b.src.h : 0);
      src.atk = Math.max(0, src.atk + da);
      src.hp = Math.max(1, src.hp + dh);
      for (const k of ['taunt', 'shield', 'windfury', 'venom', 'reborn'] as Keyword[]) if (x[k] && !src[k]) src[k] = true;
    }
  }

  run(): CombatResult {
    const n0 = this.boards[0].length;
    const n1 = this.boards[1].length;
    this.first = n0 > n1 ? 0 : n1 > n0 ? 1 : this.rand() < 0.5 ? 0 : 1;
    this.frame(undefined, undefined, '戰鬥開始');
    // 起始戰鬥：英雄能力 → 手牌 → 手下
    for (const side of [this.first, (1 - this.first) as 0 | 1]) {
      HERO_SPEC.get(this.sides[side].heroId)?.soc?.(this, side);
      this.socSpells(side);
    }
    for (const side of [this.first, (1 - this.first) as 0 | 1]) {
      for (const h of [...this.hands[side]]) for (const { s, g } of specsOf(h)) s.socInHand?.(this, h, side, g);
    }
    for (const side of [this.first, (1 - this.first) as 0 | 1]) {
      for (const m of [...this.boards[side]]) {
        if (m.dead) continue;
        for (const { s, g } of specsOf(m)) s.soc?.(this, m, g);
      }
    }
    this.hits = [];
    this.frame(undefined, undefined, '起始戰鬥');
    this.resolveDeaths();
    this.runImmediate();

    const ptr: [number, number] = [0, 0];
    let cur = this.first;
    for (let guard = 0; guard < 400; guard++) {
      this.runImmediate();
      if (!this.alive(0).length || !this.alive(1).length) break;
      let att = this.nextAttacker(cur, ptr);
      if (!att) {
        cur = (1 - cur) as 0 | 1;
        att = this.nextAttacker(cur, ptr);
        if (!att) break;
      }
      const order = this.boards[cur].slice();
      const at = order.indexOf(att);
      this.attack(att);
      if (!att.dead && att.windfury && this.alive((1 - cur) as 0 | 1).length) this.attack(att);
      const b = this.boards[cur];
      if (!att.dead && b.includes(att)) ptr[cur] = b.indexOf(att) + 1;
      else {
        const next = order.slice(at + 1).find((m) => b.includes(m));
        ptr[cur] = next ? b.indexOf(next) : b.length;
      }
      cur = (1 - cur) as 0 | 1;
    }

    const a0 = this.alive(0);
    const a1 = this.alive(1);
    let winner: 0 | 1 | null = null;
    if (a0.length && !a1.length) winner = 0;
    else if (a1.length && !a0.length) winner = 1;
    const survivors = winner === null ? [] : this.alive(winner).filter((m) => !m.temp);
    const damage = winner === null ? 0 : this.sides[winner].tier + survivors.reduce((n, m) => n + tierOf(m.id), 0);
    this.frame(undefined, undefined, winner === null ? '平手' : undefined);
    return { winner, damage, survivors, frames: this.frames ?? undefined, first: this.first, died: this.died };
  }

  private nextAttacker(side: 0 | 1, ptr: [number, number]): BMinion | null {
    const b = this.boards[side];
    if (!b.length) return null;
    for (let k = 0; k < b.length; k++) {
      const i = (ptr[side] + k) % b.length;
      if (!b[i].dead && b[i].atk > 0) {
        ptr[side] = i;
        return b[i];
      }
    }
    return null;
  }
}

export function runCombat(sides: [SideInput, SideInput], o: CombatOptions): CombatResult {
  return new CombatSim(sides, o).run();
}
