// 魔術大師阿卡贊札拉克的奧秘：放在場上，戰鬥中觸發一次後就消失
// 每個奧秘都是一組被動效果（HeroSpec），由 BgGame.hooks() 一起觸發
import type { Combat } from './api';
import { tierOf } from './data';
import { LATE } from './late';
import type { HeroSpec } from './heroes';
import type { BMinion } from './types';

const S = (n: string) => `TB_Bacon_Secrets_${n}`;
const COBRA = 'BG_EX1_170';
const SNAKE = 'BG_EX1_554t';
/** 恐懼之盾（黑暗贈禮）：聖盾要打兩次 */
const TWO_HITS = 'BG36_MidGameEffect_000t15';

/** 這場戰鬥還沒觸發過（觸發後記下來，戰鬥結束時從場上移除） */
function fire(c: Combat, side: 0 | 1, id: string): boolean {
  if (c.cnt(side, `secret:${id}`) > 0) return false;
  c.counter(side, `secret:${id}`, 1);
  return true;
}

function copyOf(c: Combat, m: BMinion): BMinion {
  const x = c.make(m.id, m.golden);
  Object.assign(x, { atk: m.atk, hp: m.maxHp ?? m.hp, taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, mags: m.mags.slice() });
  return x;
}

export interface SecretSpec extends Omit<HeroSpec, 'rank'> {
  rank?: number;
  /** 電腦評估 */
  v: number;
}

export const SECRETS: SecretSpec[] = [
  { id: S('01'), v: 5, onAttacked: (c, side, t) => void (fire(c, side, S('01')) && c.summon(side, c.make(COBRA), c.index(t) + 1)) }, // 毒蛇陷阱
  {
    id: S('02'), // 蛇類陷阱
    v: 5,
    onAttacked: (c, side, t) => {
      if (!fire(c, side, S('02'))) return;
      for (let k = 0; k < 3; k++) c.summon(side, c.make(SNAKE), c.index(t) + 1);
    },
  },
  { id: S('04'), v: 6, onAttacked: (c, side, t) => void (fire(c, side, S('04')) && c.summon(side, copyOf(c, t), c.index(t) + 1)) }, // 分裂鏡像
  {
    id: S('05'), // 雕像
    v: 5,
    onFriendDeath: (c, side, d) => {
      if (!fire(c, side, S('05'))) return;
      const id = c.pick(POOL().filter((x) => tierOf(x) === tierOf(d.id) && c.inLobby(x)));
      if (id) c.summonLater(side, c.make(id));
    },
  },
  { id: S('07'), v: 5, onAttacked: (c, side, t) => void (!t.shield && fire(c, side, S('07')) && c.giveKw(t, 'shield')) }, // 自動防禦矩陣
  {
    id: S('08'), // 復仇
    v: 4,
    onFriendDeath: (c, side) => {
      const t = c.pick(c.board(side).filter((m) => !m.dead));
      if (t && fire(c, side, S('08'))) c.buff(t, 3, 2);
    },
  },
  {
    id: S('10'), // 救贖
    v: 6,
    onFriendDeath: (c, side, d) => {
      if (!fire(c, side, S('10'))) return;
      const m = c.make(d.id, d.golden);
      m.hp = 1;
      c.summonLater(side, m);
    },
  },
  {
    id: S('11'), // 救贖之手
    v: 5,
    onFriendDeath: (c, side, d) => {
      c.counter(side, '~salvation', 1);
      if (c.cnt(side, '~salvation') !== 2 || !fire(c, side, S('11'))) return;
      c.summonLater(side, c.make(d.id, d.golden));
    },
  },
  {
    id: S('12'), // 寒冰屏障
    v: 6,
    combatDamage: (p, dmg) => {
      if (dmg < p.hp + p.armor) return dmg;
      p.secrets = (p.secrets ?? []).filter((x) => x !== S('12'));
      return 0;
    },
  },
  {
    id: S('13'), // 競爭精神
    v: 4,
    startTurn: (_G, p) => {
      for (const m of p.board) (m.atk += 1), (m.hp += 1);
      p.secrets = (p.secrets ?? []).filter((x) => x !== S('13'));
    },
  },
  { id: S('14'), v: 5, onHitBy: (c, side, src, n) => void (n >= 3 && !src.dead && fire(c, side, S('14')) && c.destroy(src)) }, // 清算
  {
    id: S('15'), // 狼群戰術
    v: 5,
    onAttacked: (c, side, t) => {
      if (!fire(c, side, S('15'))) return;
      const x = copyOf(c, t);
      x.atk = 3;
      x.hp = 3;
      c.summon(side, x, c.index(t) + 1);
    },
  },
  // —— 進階奧秘（街頭魔術師） ——
  {
    id: S('01b'), // 進階眼鏡蛇陷阱：眼鏡蛇也有復生
    v: 6,
    onAttacked: (c, side, t) => {
      if (!fire(c, side, S('01b'))) return;
      const m = c.make(COBRA);
      m.reborn = true;
      c.summon(side, m, c.index(t) + 1);
    },
  },
  {
    id: S('07b'), // 進階自動防禦矩陣：聖盾要打兩次才會破
    v: 6,
    onAttacked: (c, side, t) => {
      if (t.shield || !fire(c, side, S('07b'))) return;
      c.giveKw(t, 'shield');
      (t.gifts ??= []).push(TWO_HITS);
    },
  },
  {
    id: S('10b'), // 進階救贖：以完整的生命值與附魔復活
    v: 7,
    onFriendDeath: (c, side, d) => {
      if (!fire(c, side, S('10b'))) return;
      c.summonLater(side, copyOf(c, d));
    },
  },
  { id: S('15b'), v: 6, onAttacked: (c, side, t) => void (fire(c, side, S('15b')) && c.summon(side, copyOf(c, t), c.index(t) + 1)) }, // 進階獸群戰術
];
export const SECRET_SPEC = new Map(SECRETS.map((s) => [s.id, s]));

const POOL = () => LATE.pool;
