// 英雄戰場：大廳、選英雄、招募、戰鬥、結算
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { aiEmote, BG_DIFFICULTY_NAMES, skillLabel, STYLE_NAMES, type BgDifficulty, type BgEmoteEvent } from '../../bg/ai';
import { SPEC, TRIPLE_REWARD } from '../../bg/cards';
import { SPELL_SPEC } from '../../bg/spells';
import { bgCard, racesOf, tierOf } from '../../bg/data';
import { BgError, type BgGame, type CombatRecord } from '../../bg/game';
import { HERO_SPEC } from '../../bg/heroes';
import { canMagnetize, goldForTurn, MAX_TIER, specsOf } from '../../bg/rules';
import { KEYWORD_NAMES, TRIBE_ICONS, TRIBE_NAMES, TRIBES, type BMinion, type BPlayer, type CombatFrame, type HandCard, type Keyword, type Tribe } from '../../bg/types';
import { BG_PLACE_GOLD } from '../../game/economy';
import { newBgStats } from '../../game/battlegrounds';
import { Art } from '../components/Card';
import { formatCardText } from '../cardText';
import { beginRound, finishWithoutHuman, getSession, newSession, pickHero, saveSession, settle, turnSeconds, type BgSession } from '../bgSession';
import { useProfile } from '../store';
import '../bg.css';

const PLACE_NAMES = ['', '第 1 名', '第 2 名', '第 3 名', '第 4 名', '第 5 名', '第 6 名', '第 7 名', '第 8 名'];
const NAME_KEY = 'hearthstone-for-claude/bg-name';

// ---------------------------------------------------------------------------
// 大廳
// ---------------------------------------------------------------------------

export function BgLobby({ onStart }: { onStart: () => void }) {
  const p = useProfile();
  const bg = p.bg ?? newBgStats();
  const [mode, setMode] = useState<'rated' | BgDifficulty | 'mixed'>('rated');
  const [timer, setTimer] = useState(true);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) || '你';
    } catch {
      return '你';
    }
  });
  const [queue, setQueue] = useState<number | null>(null);
  const saved = getSession();
  const resumable = saved && saved.game.s.phase !== 'over' && saved.game.human.alive;

  useEffect(() => {
    if (queue === null) return;
    if (queue >= 7) {
      const t = window.setTimeout(() => {
        newSession({ rated: mode === 'rated', difficulty: mode === 'rated' ? undefined : mode, timer, name: name.trim() || '你' });
        onStart();
      }, 500);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setQueue((q) => (q ?? 0) + 1), 250 + Math.random() * 450);
    return () => window.clearTimeout(t);
  }, [queue]);

  const start = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim() || '你');
    } catch {
      /* 無法儲存 */
    }
    saveSession(null);
    setQueue(0);
  };

  return (
    <div className="bg-lobby">
      <h2>🍺 英雄戰場</h2>
      <p className="muted">
        8 位玩家同場競技：在酒館招募手下、升級酒館、湊三連拿金卡，戰鬥會自動進行。輸了戰鬥會扣血，最後活下來的就是第一名！其他 7 位玩家都是電腦，但每個人都有不同的技術與打法（有人速升本、有人低本刷三連、有人死守喜歡的種族），會看血量決定要不要升級、凍結好牌、用打過的對手戰隊模擬站位。
      </p>
      <div className="bg-lobby-stats">
        <div className="stat">
          <b>{bg.rating}</b>
          <span>英雄戰場積分</span>
        </div>
        <div className="stat">
          <b>{bg.best}</b>
          <span>最高積分</span>
        </div>
        <div className="stat">
          <b>{bg.games}</b>
          <span>場數</span>
        </div>
        <div className="stat">
          <b>{bg.games ? Math.round((bg.top4 / bg.games) * 100) : 0}%</b>
          <span>前四名</span>
        </div>
        <div className="stat">
          <b>{bg.wins}</b>
          <span>第一名</span>
        </div>
      </div>
      <div className="panel">
        <h3>模式</h3>
        <div className="bg-modes">
          <button className={`btn ${mode === 'rated' ? 'primary' : ''}`} onClick={() => setMode('rated')}>
            🏆 積分模式
          </button>
          {(['novice', 'normal', 'expert', 'master'] as BgDifficulty[]).map((d) => (
            <button key={d} className={`btn ${mode === d ? 'primary' : ''}`} onClick={() => setMode(d)}>
              練習・{BG_DIFFICULTY_NAMES[d]}
            </button>
          ))}
          <button className={`btn ${mode === 'mixed' ? 'primary' : ''}`} onClick={() => setMode('mixed')}>
            練習・混合
          </button>
        </div>
        <p className="muted small">
          {mode === 'rated'
            ? '依照你的積分配對對手：積分越高，對手越強。名次越前面加越多分（前四名加分）。'
            : mode === 'mixed'
              ? '新手、普通、高手、大師都有，不影響積分。'
              : `7 位對手都是「${BG_DIFFICULTY_NAMES[mode]}」程度（每個人還是有些差異），不影響積分。`}
        </p>
        <label className="bg-opt">
          <input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} /> 回合計時（和真正的英雄戰場一樣，時間到自動結束招募）
        </label>
        <label className="bg-opt">
          名稱 <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="bg-start">
          {resumable && (
            <button className="btn big" onClick={onStart}>
              ▶ 繼續上一局（第 {saved!.game.round} 回合）
            </button>
          )}
          <button className="btn big primary" disabled={queue !== null} onClick={start}>
            {queue === null ? '開始配對' : `尋找玩家… ${Math.min(8, queue + 1)} / 8`}
          </button>
        </div>
        <p className="muted small">獎勵：{BG_PLACE_GOLD.slice(1).map((g, i) => `${i + 1} 名 🪙${g}`).join('・')}</p>
      </div>
      {bg.history.length > 0 && (
        <div className="panel">
          <h3>📜 最近的英雄戰場</h3>
          <ul className="history">
            {[...bg.history]
              .reverse()
              .slice(0, 8)
              .map((h, i) => (
                <li key={i} className={h.place <= 4 ? 'win' : 'loss'}>
                  {PLACE_NAMES[h.place]}・{safeName(h.hero)}
                  {h.delta !== undefined ? `・積分 ${h.delta >= 0 ? '+' : ''}${h.delta}（${h.rating}）` : h.difficulty ? `・練習（${BG_DIFFICULTY_NAMES[h.difficulty]}）` : '・練習'}
                  <span className="gold">+{h.gold}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function safeName(id: string): string {
  try {
    return bgCard(id).name;
  } catch {
    return id;
  }
}

// ---------------------------------------------------------------------------
// 共用元件
// ---------------------------------------------------------------------------

function cardText(m: BMinion, p: BPlayer | null): string {
  const spec = SPEC.get(m.id);
  const custom = spec?.text?.(m, p);
  return custom ?? bgCard(m.id).text;
}

function MinionTip({ m, p, G }: { m: BMinion; p: BPlayer | null; G: BgGame }) {
  const d = bgCard(m.id);
  const races = racesOf(m.id);
  const stats = p ? G.eff(p, m) : { atk: m.atk, hp: m.hp, kw: { taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, stealth: m.stealth } };
  const kws = (Object.keys(stats.kw) as Keyword[]).filter((k) => stats.kw[k]);
  return (
    <div className="bg-tip">
      <div className="bg-tip-head">
        <b className={m.golden ? 'golden-name' : ''}>
          {m.golden && '★ '}
          {d.name}
        </b>
        <span className="bg-tier">{'★'.repeat(tierOf(m.id))}</span>
      </div>
      <div className="bg-tip-sub">
        {races.length === TRIBES.length ? '全部種族' : races.map((r) => TRIBE_NAMES[r]).join('・') || '中立'}・{stats.atk}/{stats.hp}
      </div>
      {cardText(m, p) && <div className="bg-tip-text" dangerouslySetInnerHTML={{ __html: formatCardText(cardText(m, p)) }} />}
      {m.golden && <div className="bg-tip-note">金卡：身材與效果加倍</div>}
      {m.both && <div className="bg-tip-note">二選一的兩個效果都會發動</div>}
      {m.mags.length > 0 && <div className="bg-tip-note">磁力：{m.mags.map((x) => bgCard(x.id).name).join('、')}</div>}
      {kws.length > 0 && <div className="bg-tip-note">{kws.map((k) => KEYWORD_NAMES[k]).join('・')}</div>}
      {(m.tmpAtk || m.tmpHp || m.tmpKw.length) > 0 && (
        <div className="bg-tip-note">
          直到下回合：{m.tmpAtk || m.tmpHp ? `+${m.tmpAtk}/+${m.tmpHp}` : ''} {m.tmpKw.map((k) => KEYWORD_NAMES[k]).join('・')}
        </div>
      )}
    </div>
  );
}

function MinionToken({
  m,
  p,
  G,
  combat,
  className = '',
  onClick,
  draggable,
  onDragStart,
  onDrop,
  children,
  tipSide = 'top',
}: {
  m: BMinion;
  p: BPlayer | null;
  G: BgGame;
  combat?: boolean;
  className?: string;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  children?: ReactNode;
  tipSide?: 'top' | 'bottom';
}) {
  const [hover, setHover] = useState(false);
  const e = combat || !p ? { atk: m.atk, hp: m.hp, kw: { taunt: m.taunt, shield: m.shield, windfury: m.windfury, venom: m.venom, reborn: m.reborn, stealth: m.stealth } } : G.eff(p, m);
  const d = bgCard(m.id);
  const baseA = (d.atk ?? 0) * (m.golden ? 2 : 1);
  const baseH = (d.hp ?? 0) * (m.golden ? 2 : 1);
  const specs = specsOf(m);
  const hasDr = specs.some(({ s }) => s.deathrattle);
  const hasTrig = specs.some(({ s }) => s.rally || s.avenge || s.onFriendAttack || s.onSummon || s.onFriendDeath || s.endTurn || s.startTurn || s.soc || s.onPlay || s.aura);
  const avenge = specs.find(({ s }) => s.avenge)?.s.avenge;
  const taunt = e.kw.taunt || (e.kw.shield && specs.some(({ s }) => s.tauntWhileShield));
  return (
    <div
      className={`minion bg-minion ${taunt ? 'taunt' : ''} ${e.kw.shield ? 'shield' : ''} ${e.kw.stealth ? 'stealth' : ''} ${m.golden ? 'golden' : ''} ${className}`}
      data-uid={m.uid}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick?.();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDrop ? (ev) => ev.preventDefault() : undefined}
      onDrop={onDrop}
    >
      <div className="minion-portrait">
        <Art cardId={m.id} label={d.name.slice(0, 2)} />
      </div>
      <div className={`minion-atk ${e.atk > baseA ? 'buffed' : ''}`}>{e.atk}</div>
      <div className={`minion-hp ${combat && m.maxHp !== undefined && m.hp < m.maxHp ? 'damaged' : e.hp > baseH ? 'buffed' : ''}`}>{e.hp}</div>
      <div className="minion-icons">
        {hasDr && <span title="亡語">💀</span>}
        {hasTrig && <span title="觸發 / 光環">⚡</span>}
        {e.kw.venom && <span title="烈毒">🧪</span>}
        {e.kw.windfury && <span title="風怒">🌀</span>}
        {e.kw.reborn && <span title="復生">👼</span>}
        {m.mags.length > 0 && <span title="磁力">🧲{m.mags.length}</span>}
        {avenge && combat && <span title="報復">{avenge[0] - (m.avenge ?? 0)}</span>}
      </div>
      {!combat && <div className="bg-minion-tier">{tierOf(m.id)}</div>}
      {hover && <div className={`bg-tip-pop ${tipSide}`}>{<MinionTip m={m} p={p} G={G} />}</div>}
      {children}
    </div>
  );
}

function SpellCard({
  card,
  onClick,
  selected,
  cost,
  locked,
  tipSide = 'top',
}: {
  card: { id: string; g: number; temp?: boolean; tier?: number };
  onClick: () => void;
  selected: boolean;
  /** 酒館裡的價錢（手牌不用顯示） */
  cost?: string;
  locked?: boolean;
  tipSide?: 'top' | 'bottom';
}) {
  const d = bgCard(card.id);
  const [hover, setHover] = useState(false);
  const text = card.id === TRIPLE_REWARD ? `<b>發現</b>一個<b>旅店等級${card.tier ?? '?'}</b>的手下` : d.text;
  return (
    <div
      className={`bg-spell ${selected ? 'selected' : ''} ${card.temp ? 'temp' : ''} ${locked ? 'locked' : ''} ${d.pool ? 'tavern' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Art cardId={card.id} label={d.name.slice(0, 2)} />
      <span className="bg-spell-name">{d.name}</span>
      {cost !== undefined && <span className="bg-spell-cost">{cost}</span>}
      {d.tier && d.pool && <span className="bg-spell-tier">{d.tier}</span>}
      {locked && <span className="bg-lock">🔒</span>}
      {hover && (
        <div className={`bg-tip-pop ${tipSide}`}>
          <div className="bg-tip">
            <div className="bg-tip-head">
              <b>{d.name}</b>
            </div>
            <div className="bg-tip-text" dangerouslySetInnerHTML={{ __html: formatCardText(text) }} />
            {card.g > 1 && <div className="bg-tip-note">金卡：效果加倍</div>}
            {card.temp && <div className="bg-tip-note">回合結束時會消失</div>}
            {locked && <div className="bg-tip-note">鎖定中：下回合才能使用</div>}
            {d.pool && <div className="bg-tip-note">酒館法術</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroPortrait({ p, size = 56, children, className = '' }: { p: BPlayer; size?: number; children?: ReactNode; className?: string }) {
  return (
    <div className={`bg-hero ${p.alive ? '' : 'dead'} ${className}`} style={{ '--hs': `${size}px` } as CSSProperties}>
      <Art cardId={p.heroId || 'TB_BaconShop_HERO_01'} label={p.name.slice(0, 1)} />
      {children}
    </div>
  );
}

function mainTribe(board: BMinion[]): Tribe | null {
  const n = new Map<Tribe, number>();
  for (const m of board) {
    const r = racesOf(m.id);
    if (r.length === TRIBES.length) continue;
    for (const t of r) n.set(t, (n.get(t) ?? 0) + 1);
  }
  let best: Tribe | null = null;
  let k = 1;
  for (const [t, c] of n) if (c > k) (best = t), (k = c);
  return best;
}

// ---------------------------------------------------------------------------
// 排行榜
// ---------------------------------------------------------------------------

function Leaderboard({ s, G, now, onPeek, peek }: { s: BgSession; G: BgGame; now: number; onPeek: (i: number | null) => void; peek: number | null }) {
  const me = G.human;
  const next = G.s.phase === 'recruit' ? G.opponentOf(0) : null;
  const order = [...G.s.players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive) return (a.place ?? 9) - (b.place ?? 9);
    return b.hp + b.armor - (a.hp + a.armor);
  });
  const elapsed = (now - s.roundStart) / 1000;
  return (
    <div className="bg-board-list">
      {order.map((p) => {
        const seen = p.isHuman ? null : me.seen[p.idx];
        const tribe = mainTribe(p.isHuman ? p.board : seen?.board ?? p.board);
        const thinking = G.s.phase === 'recruit' && p.alive && !p.isHuman && elapsed < (s.think[p.idx] ?? 0);
        return (
          <div
            key={p.idx}
            className={`bg-lb ${p.isHuman ? 'me' : ''} ${p.alive ? '' : 'dead'} ${next === p.idx ? 'next' : ''} ${peek === p.idx ? 'peek' : ''}`}
            onClick={() => onPeek(peek === p.idx ? null : p.idx)}
            title={p.isHuman ? '你' : '點一下查看上次交手時的戰隊'}
          >
            <HeroPortrait p={p} size={42}>
              <span className="bg-lb-tier">{p.tier}</span>
            </HeroPortrait>
            <div className="bg-lb-info">
              <div className="bg-lb-name">
                {next === p.idx && <span title="下一個對手">⚔️</span>}
                {p.name}
              </div>
              <div className="bg-lb-sub">
                {p.alive ? (
                  <>
                    <span className="bg-hp">❤ {p.hp}</span>
                    {p.armor > 0 && <span className="bg-armor" title="護甲">🛡️{p.armor}</span>}
                    {p.triples > 0 && <span title="三連次數">✨{p.triples}</span>}
                    {tribe && <span title={TRIBE_NAMES[tribe]}>{TRIBE_ICONS[tribe]}</span>}
                  </>
                ) : (
                  <span>{PLACE_NAMES[p.place ?? 8]}</span>
                )}
              </div>
              <div className="bg-lb-results">
                {p.results.slice(-5).map((r, i) => (
                  <i key={i} className={r} />
                ))}
                {thinking && (
                  <span className="bg-thinking" title="思考中">
                    💭<span className="bg-thinking-text">思考中</span>
                  </span>
                )}
                {G.s.phase === 'recruit' && p.alive && !p.isHuman && !thinking && <span className="bg-ready">✓</span>}
              </div>
            </div>
          </div>
        );
      })}
      {next === -1 && <div className="bg-lb-ghost">⚔️ 下一場：{G.ghost()?.name ?? '殘影'} 的殘影</div>}
    </div>
  );
}

function PeekPanel({ G, idx, onClose }: { G: BgGame; idx: number; onClose: () => void }) {
  const me = G.human;
  const p = G.player(idx);
  const seen = me.seen[idx];
  const hero = HERO_SPEC.get(p.heroId);
  const power = bgCard(p.heroId).power;
  return (
    <div className="bg-peek" onClick={onClose}>
      <div className="bg-peek-head">
        <HeroPortrait p={p} size={48} />
        <div>
          <b>{p.name}</b>・{bgCard(p.heroId).name}
          <div className="muted small">{power && `${bgCard(power).name}：`}<span dangerouslySetInnerHTML={{ __html: formatCardText(power ? bgCard(power).text : '') }} /></div>
          {hero?.status?.(p, G) && <div className="muted small">{hero.status(p, G)}</div>}
        </div>
      </div>
      {seen ? (
        <>
          <div className="muted small">第 {seen.round} 回合交手時的戰隊（旅店等級 {seen.tier}）</div>
          <div className="bg-row small">
            {seen.board.map((m) => (
              <MinionToken key={m.uid} m={m} p={null} G={G} combat tipSide="bottom" />
            ))}
          </div>
        </>
      ) : (
        <div className="muted small">還沒有和這位玩家交手過</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 一局
// ---------------------------------------------------------------------------

type Mode =
  | { k: 'idle' }
  /** 選了一張手牌（choice = 二選一選了哪個） */
  | { k: 'hand'; uid: number; choice?: number }
  /** 二選一 */
  | { k: 'choose'; uid: number }
  | { k: 'target'; uid: number; pos: number; choice?: number }
  | { k: 'board'; uid: number }
  | { k: 'power' };

export function BgMatch({ onExit }: { onExit: () => void }) {
  const profile = useProfile();
  const [session] = useState(() => getSession());
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [now, setNow] = useState(() => performance.now());
  const [mode, setMode] = useState<Mode>({ k: 'idle' });
  const [toast, setToast] = useState<string | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [view, setView] = useState<'main' | 'combat' | 'result'>(() => (session?.game.s.phase === 'over' || (session && !session.game.human.alive) ? 'result' : 'main'));

  useEffect(() => {
    const t = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const drag = useRef<{ from: 'shop' | 'board' | 'hand'; uid: number } | null>(null);
  // 回合計時：時間到自動結束招募
  const limit = session ? turnSeconds(session.game.round) : 0;
  const left = session ? Math.max(0, Math.ceil(limit - (now - session.roundStart) / 1000)) : 0;
  const endTurnRef = useRef(() => {});
  useEffect(() => {
    if (session && session.timer && session.game.s.phase === 'recruit' && view === 'main' && left <= 0) endTurnRef.current();
  });

  if (!session) {
    return (
      <div className="bg-match">
        <p>找不到進行中的英雄戰場。</p>
        <button className="btn" onClick={onExit}>
          返回
        </button>
      </div>
    );
  }
  const s = session;
  const G = s.game;
  const me = G.human;

  const act = (fn: () => void) => {
    try {
      fn();
      saveSession(s);
    } catch (e) {
      if (e instanceof BgError) setToast(e.message);
      else {
        console.error(e);
        setToast('發生錯誤');
      }
    }
    rerender();
  };

  const endTurn = () => {
    if (G.s.phase !== 'recruit') return;
    setMode({ k: 'idle' });
    act(() => G.finishRecruit());
    setView('combat');
  };
  endTurnRef.current = endTurn;

  if (G.s.phase === 'hero') return <HeroSelect s={s} onPick={(id) => act(() => pickHero(s, id))} onExit={onExit} />;

  if (view === 'result') {
    return <ResultView s={s} onExit={() => {
      saveSession(null);
      onExit();
    }} />;
  }

  if (view === 'combat') {
    const rec = G.s.combats.find((c) => c.a === 0 || c.b === 0);
    return (
      <CombatView
        key={G.round}
        s={s}
        rec={rec}
        speed={profile.settings.aiSpeed}
        onDone={() => {
          if (G.s.phase === 'over' || !me.alive) {
            if (!me.alive) finishWithoutHuman(s);
            settle(s);
            setView('result');
            return;
          }
          G.nextRound();
          beginRound(s);
          setMode({ k: 'idle' });
          setView('main');
          rerender();
        }}
      />
    );
  }

  // —— 招募階段 ——
  const power = bgCard(me.heroId).power!;
  const hero = HERO_SPEC.get(me.heroId)!;
  const pst = G.powerState(me);
  const handCard = mode.k === 'hand' || mode.k === 'target' || mode.k === 'choose' ? me.hand.find((h) => h.uid === mode.uid) : undefined;
  const choice = mode.k === 'hand' || mode.k === 'target' ? mode.choice ?? 0 : 0;
  const spellTargets = handCard?.kind === 'spell' && mode.k === 'hand' ? G.spellTargets(me, handCard.id, choice) : [];
  const handMinion = handCard?.kind === 'minion' ? handCard.m : null;
  const spellSpec = handCard?.kind === 'spell' ? SPELL_SPEC.get(handCard.id) : undefined;
  const bcSpec = handMinion ? SPEC.get(handMinion.id) : undefined;
  const busy = !!me.discover;
  const nextOpp = G.opponentOf(0);

  const isTarget = (m: BMinion, where: 'board' | 'shop'): boolean => {
    if (mode.k === 'power') {
      if (hero.target === 'friend' && where !== 'board') return false;
      if (hero.target === 'shop' && where !== 'shop') return false;
      return !hero.canTarget || hero.canTarget(me, m, G);
    }
    if (mode.k === 'hand' && spellSpec) return spellTargets.includes(m);
    if (where !== 'board') return false;
    if (mode.k === 'target' && handMinion && bcSpec?.target) return bcSpec.target(handMinion, m);
    if (mode.k === 'hand' && handMinion) return canMagnetize(handMinion, m);
    return false;
  };

  /** 法術：選好選項後施放，或是進入選目標 */
  const castOrTarget = (h: HandCard & { kind: 'spell' }, c: number) => {
    const spec = SPELL_SPEC.get(h.id);
    const need = !!spec?.target && (!spec.choiceTarget || spec.choiceTarget(c));
    if (!need) {
      act(() => G.play(0, h.uid, undefined, undefined, c));
      return setMode({ k: 'idle' });
    }
    if (!G.spellTargets(me, h.id, c).length) {
      setToast('沒有可以選的目標');
      return setMode({ k: 'idle' });
    }
    setMode({ k: 'hand', uid: h.uid, choice: c });
  };

  const castOn = (m: BMinion) => {
    if (!handCard || handCard.kind !== 'spell') return;
    if (!spellTargets.includes(m)) return setToast('不能選這個目標');
    act(() => G.play(0, handCard.uid, undefined, m.uid, choice));
    setMode({ k: 'idle' });
  };

  const playMinionAt = (pos: number) => {
    if (!handMinion) return;
    const spec = SPEC.get(handMinion.id);
    if (spec?.target && me.board.some((x) => spec.target!(handMinion, x))) {
      setMode({ k: 'target', uid: handMinion.uid, pos, choice });
      return;
    }
    act(() => G.play(0, handMinion.uid, pos, undefined, choice));
    setMode({ k: 'idle' });
  };

  const clickBoard = (m: BMinion) => {
    if (busy) return;
    if (mode.k === 'power') {
      if (!isTarget(m, 'board')) return setToast('不能選這個目標');
      act(() => G.usePower(0, m.uid));
      return setMode({ k: 'idle' });
    }
    if (mode.k === 'target') {
      if (!isTarget(m, 'board')) return setToast('不能選這個目標');
      act(() => G.play(0, mode.uid, mode.pos, m.uid, mode.choice ?? 0));
      return setMode({ k: 'idle' });
    }
    if (mode.k === 'hand' && handCard) {
      if (handCard.kind === 'spell') return castOn(m);
      if (handMinion && canMagnetize(handMinion, m)) {
        act(() => G.play(0, handMinion.uid, undefined, m.uid));
        return setMode({ k: 'idle' });
      }
      // 點在手下上：放在它的左邊
      return playMinionAt(me.board.indexOf(m));
    }
    setMode(mode.k === 'board' && mode.uid === m.uid ? { k: 'idle' } : { k: 'board', uid: m.uid });
  };

  const clickShop = (m: BMinion) => {
    if (busy) return;
    if (mode.k === 'power') {
      if (!isTarget(m, 'shop')) return setToast('不能選這個目標');
      act(() => G.usePower(0, m.uid));
      return setMode({ k: 'idle' });
    }
    if (mode.k === 'board') {
      const target = me.board.find((x) => x.uid === mode.uid);
      setMode({ k: 'idle' });
      if (target) return act(() => G.sell(0, target.uid));
    }
    if (mode.k === 'hand' && handCard?.kind === 'spell') return castOn(m);
    act(() => G.buy(0, m.uid));
    setMode({ k: 'idle' });
  };

  const clickHand = (h: HandCard) => {
    if (busy) return;
    if (h.locked === G.round) return setToast('這張卡鎖定中，下回合才能使用');
    if (mode.k === 'hand' && mode.uid === h.uid) {
      // 再點一次：放到最右邊
      if (h.kind === 'minion') playMinionAt(me.board.length);
      else setMode({ k: 'idle' });
      return;
    }
    if (h.kind === 'spell') {
      if (h.id === TRIPLE_REWARD) {
        act(() => G.play(0, h.uid));
        return setMode({ k: 'idle' });
      }
      if (SPELL_SPEC.get(h.id)?.choices) return setMode({ k: 'choose', uid: h.uid });
      return castOrTarget(h, 0);
    }
    const spec = SPEC.get(h.m.id);
    if (spec?.choices && !h.m.both) return setMode({ k: 'choose', uid: h.uid });
    if (!me.board.length && !spec?.target) {
      act(() => G.play(0, h.uid, 0));
      return setMode({ k: 'idle' });
    }
    setMode({ k: 'hand', uid: h.uid });
  };

  /** 二選一選好了 */
  const pickChoice = (c: number) => {
    if (mode.k !== 'choose' || !handCard) return;
    if (handCard.kind === 'spell') return castOrTarget(handCard, c);
    const spec = SPEC.get(handCard.m.id);
    if (!me.board.length && !spec?.target) {
      act(() => G.play(0, handCard.uid, 0, undefined, c));
      return setMode({ k: 'idle' });
    }
    setMode({ k: 'hand', uid: handCard.uid, choice: c });
  };

  // 拖曳
  const onDropBoard = (index: number) => {
    const d = drag.current;
    drag.current = null;
    if (!d || busy) return;
    if (d.from === 'board') return act(() => G.move(0, d.uid, index));
    if (d.from === 'shop') return act(() => G.buy(0, d.uid));
    if (d.from === 'hand') {
      const h = me.hand.find((x) => x.uid === d.uid);
      if (!h) return;
      if (h.kind === 'spell' || h.locked === G.round) return clickHand(h);
      const spec = SPEC.get(h.m.id);
      if (spec?.choices) return setMode({ k: 'choose', uid: h.uid });
      if (spec?.target && me.board.some((x) => spec.target!(h.m, x))) return setMode({ k: 'target', uid: h.uid, pos: index });
      act(() => G.play(0, h.uid, index));
      setMode({ k: 'idle' });
    }
  };
  const onDropShop = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.from === 'board') act(() => G.sell(0, d.uid));
  };

  const selectedBoard = mode.k === 'board' ? me.board.find((m) => m.uid === mode.uid) : undefined;
  const showSlots = (mode.k === 'hand' && !!handMinion) && me.board.length < 7;
  const upCost = G.upgradeCost(me);
  const timerLow = s.timer && left <= 10;

  return (
    <div className="bg-match" onClick={() => setMode({ k: 'idle' })}>
      <div className="battle-topbar">
        <button
          className="btn small"
          onClick={(e) => {
            e.stopPropagation();
            setMenu(!menu);
          }}
        >
          ☰ 選單
        </button>
        <span className="battle-title">
          🍺 英雄戰場・第 {G.round} 回合・{G.s.tribes.map((t) => `${TRIBE_ICONS[t]}${TRIBE_NAMES[t]}`).join(' ')}
        </span>
        {s.timer ? <span className={`bg-timer ${timerLow ? 'low' : ''}`}>⏱ {left}</span> : <span />}
      </div>
      {menu && (
        <div className="battle-menu" onClick={(e) => e.stopPropagation()}>
          <button className="btn" onClick={() => setMenu(false)}>
            繼續
          </button>
          <button className="btn" onClick={onExit}>
            暫時離開（之後可以繼續）
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (!confirm('確定要投降嗎？會以目前的名次結算。')) return;
              me.hp = 0;
              me.alive = false;
              me.place = G.alive().length + 1;
              me.diedRound = G.round;
              me.deathBoard = me.board.map((m) => ({ ...m }));
              finishWithoutHuman(s);
              settle(s);
              setMenu(false);
              setView('result');
            }}
          >
            投降
          </button>
        </div>
      )}
      <div className="bg-layout">
        <aside className="bg-side">
          <Leaderboard s={s} G={G} now={now} peek={peek} onPeek={setPeek} />
          {peek !== null && peek !== 0 && <PeekPanel G={G} idx={peek} onClose={() => setPeek(null)} />}
        </aside>
        <main className="bg-main">
          {/* 酒館 */}
          <section className="bg-tavern" onDragOver={(e) => e.preventDefault()} onDrop={onDropShop}>
            <div className="bg-tavern-bar">
              <div className="bg-bob">
                <span className="bg-tier-badge" title="旅店等級">
                  {'★'.repeat(me.tier)}
                </span>
                <span>鮑伯的酒館</span>
              </div>
              <div className="bg-tavern-btns">
                <button className="btn small" disabled={me.tier >= MAX_TIER || me.gold < upCost || busy} onClick={(e) => (e.stopPropagation(), act(() => G.upgrade(0)))}>
                  ⬆ 升級 {me.tier < MAX_TIER ? `🪙${upCost}` : '（最高）'}
                </button>
                <button className="btn small" disabled={me.gold < G.refreshCost(me) || busy} onClick={(e) => (e.stopPropagation(), act(() => G.refresh(0)))}>
                  🔄 刷新 {G.refreshCost(me) ? `🪙${G.refreshCost(me)}` : '免費'}
                  {me.freeRefreshes > 0 && `（${me.freeRefreshes}）`}
                </button>
                <button className={`btn small ${me.frozen ? 'frozen-on' : ''}`} onClick={(e) => (e.stopPropagation(), act(() => G.freeze(0)))}>
                  ❄ {me.frozen ? '已凍結' : '凍結'}
                </button>
              </div>
            </div>
            <div className={`bg-row shop ${me.frozen ? 'frozen' : ''} ${mode.k === 'board' ? 'sell-target' : ''}`}>
              {me.shop.map((m) => (
                <MinionToken
                  key={m.uid}
                  m={m}
                  p={me}
                  G={G}
                  className={isTarget(m, 'shop') ? 'targetable' : ''}
                  tipSide="bottom"
                  onClick={() => clickShop(m)}
                  draggable
                  onDragStart={() => (drag.current = { from: 'shop', uid: m.uid })}
                />
              ))}
              {me.shopSpells.map((sp) => (
                <SpellCard
                  key={sp.uid}
                  card={{ id: sp.id, g: 1 }}
                  selected={false}
                  tipSide="bottom"
                  cost={sp.id === 'BG28_571' ? `❤${G.spellCost(me, sp.id)}` : `${G.spellCost(me, sp.id)}`}
                  onClick={() => {
                    if (busy) return;
                    act(() => G.buySpell(0, sp.uid));
                    setMode({ k: 'idle' });
                  }}
                />
              ))}
              {!me.shop.length && !me.shopSpells.length && <div className="muted">酒館空了，刷新看看</div>}
              {mode.k === 'board' && <div className="bg-sell-hint">點酒館賣出（🪙{selectedBoard ? G.sellPrice(me, selectedBoard) : 1}）</div>}
            </div>
          </section>

          {/* 你的戰場 */}
          <section className="bg-warband" onDragOver={(e) => e.preventDefault()} onDrop={() => onDropBoard(me.board.length)}>
            <div className="bg-row board">
              {showSlots && <Slot onClick={() => playMinionAt(0)} />}
              {me.board.map((m, i) => (
                <div key={m.uid} className="bg-board-cell">
                  <MinionToken
                    m={m}
                    p={me}
                    G={G}
                    className={`${mode.k === 'board' && mode.uid === m.uid ? 'selected' : ''} ${isTarget(m, 'board') ? 'targetable' : ''}`}
                    onClick={() => clickBoard(m)}
                    draggable
                    onDragStart={() => (drag.current = { from: 'board', uid: m.uid })}
                    onDrop={(e) => {
                      e.stopPropagation();
                      onDropBoard(i);
                    }}
                  />
                  {showSlots && <Slot onClick={() => playMinionAt(i + 1)} />}
                </div>
              ))}
              {!me.board.length && !showSlots && <div className="muted bg-empty">從酒館買手下，再從手牌打到這裡</div>}
            </div>
            {selectedBoard && (
              <div className="bg-board-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn small" onClick={() => act(() => G.move(0, selectedBoard.uid, me.board.indexOf(selectedBoard) - 1))}>
                  ◀ 左移
                </button>
                <button className="btn small danger" onClick={() => (act(() => G.sell(0, selectedBoard.uid)), setMode({ k: 'idle' }))}>
                  賣出 🪙{G.sellPrice(me, selectedBoard)}
                </button>
                <button className="btn small" onClick={() => act(() => G.move(0, selectedBoard.uid, me.board.indexOf(selectedBoard) + 1))}>
                  右移 ▶
                </button>
              </div>
            )}
            {mode.k === 'target' && <div className="bg-hint">選擇戰吼的目標</div>}
            {mode.k === 'power' && <div className="bg-hint">選擇英雄能力的目標</div>}
            {mode.k === 'hand' && handMinion && <div className="bg-hint">點空格放置手下{me.board.some((x) => canMagnetize(handMinion, x)) ? '，或點機械吸附上去' : ''}（再點一次手牌放到最右邊）</div>}
            {mode.k === 'hand' && spellSpec && <div className="bg-hint">選擇法術的目標{spellSpec.target === 'any' ? '（可以選酒館裡的手下）' : ''}</div>}
          </section>

          {/* 英雄與手牌 */}
          <section className="bg-me">
            <div className="bg-me-hero">
              <HeroPortrait p={me} size={64}>
                <span className="bg-hero-hp">{me.hp}</span>
                {me.armor > 0 && <span className="bg-hero-armor">{me.armor}</span>}
              </HeroPortrait>
              <button
                className={`bg-power ${pst.usable ? 'usable' : ''} ${mode.k === 'power' ? 'active' : ''}`}
                disabled={!pst.usable || busy}
                title={pst.reason ?? ''}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hero.target || hero.target === 'none') act(() => G.usePower(0));
                  else setMode(mode.k === 'power' ? { k: 'idle' } : { k: 'power' });
                }}
              >
                <Art cardId={power} label="能力" />
                {!hero.passive && <span className="bg-power-cost">{pst.cost}</span>}
                <div className="bg-tip-pop top">
                  <div className="bg-tip">
                    <div className="bg-tip-head">
                      <b>{bgCard(power).name}</b>
                      <span className="muted small">{hero.passive ? '被動' : `🪙${pst.cost}`}</span>
                    </div>
                    <div className="bg-tip-text" dangerouslySetInnerHTML={{ __html: formatCardText(bgCard(power).text) }} />
                    {hero.status?.(me, G) && <div className="bg-tip-note">{hero.status(me, G)}</div>}
                    {pst.reason && !hero.passive && <div className="bg-tip-note">{pst.reason}</div>}
                  </div>
                </div>
              </button>
              <div className="bg-gold" title="金幣">
                🪙 {me.gold}
                <small> / {goldForTurn(G.round) + me.maxGoldBonus}</small>
                {(() => {
                  const [a, h] = G.spellExtra(me);
                  return a || h ? (
                    <div className="bg-extra" title="你的酒館法術額外給的身材">
                      📜 +{a}/+{h}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
            <div className="bg-hand">
              {me.hand.map((h) =>
                h.kind === 'minion' ? (
                  <MinionToken
                    key={h.uid}
                    m={h.m}
                    p={me}
                    G={G}
                    className={`in-hand ${mode.k !== 'idle' && 'uid' in mode && mode.uid === h.uid ? 'selected' : ''} ${h.locked === G.round ? 'locked' : ''}`}
                    onClick={() => clickHand(h)}
                    draggable
                    onDragStart={() => (drag.current = { from: 'hand', uid: h.uid })}
                  />
                ) : (
                  <SpellCard
                    key={h.uid}
                    card={h}
                    locked={h.locked === G.round}
                    selected={(mode.k === 'hand' || mode.k === 'choose') && mode.uid === h.uid}
                    onClick={() => {
                      clickHand(h);
                    }}
                  />
                ),
              )}
              {!me.hand.length && <div className="muted small">手牌（最多 10 張）</div>}
            </div>
            <div className="bg-end">
              {nextOpp !== null && (
                <div className="muted small bg-next">
                  下一場：{nextOpp < 0 ? `${G.ghost()?.name ?? ''} 的殘影` : G.player(nextOpp).name}
                </div>
              )}
              <button className="btn big primary" onClick={(e) => (e.stopPropagation(), endTurn())} disabled={busy}>
                結束回合
              </button>
            </div>
          </section>
        </main>
      </div>
      {me.discover && <DiscoverModal G={G} onPick={(i) => act(() => G.choose(0, i))} />}
      {mode.k === 'choose' && handCard && (
        <div className="bg-modal" onClick={(e) => (e.stopPropagation(), setMode({ k: 'idle' }))}>
          <h3>{bgCard(handCard.kind === 'spell' ? handCard.id : handCard.m.id).name}：二選一</h3>
          <div className="bg-choices">
            {(handCard.kind === 'spell' ? SPELL_SPEC.get(handCard.id)?.choices : SPEC.get(handCard.m.id)?.choices)?.map((label, i) => (
              <button
                key={i}
                className="btn big"
                onClick={(e) => {
                  e.stopPropagation();
                  pickChoice(i);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="muted small">點旁邊取消</p>
        </div>
      )}
      {toast && <div className="bg-toast">{toast}</div>}
    </div>
  );
}

function Slot({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="bg-slot"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ＋
    </div>
  );
}

function DiscoverModal({ G, onPick }: { G: BgGame; onPick: (i: number) => void }) {
  const me = G.human;
  const d = me.discover!;
  const ms = useMemo(() => (d.spells ? [] : d.options.map((id) => G.make(id, !!d.golden))), [d]);
  return (
    <div className="bg-modal" onClick={(e) => e.stopPropagation()}>
      <h3>{d.title}</h3>
      <div className="bg-discover">
        {d.spells &&
          d.options.map((id, i) => (
            <div key={id + i} className="bg-discover-opt" onClick={() => onPick(i)}>
              <SpellCard card={{ id, g: 1 }} selected={false} tipSide="bottom" cost={String(G.spellCost(me, id))} onClick={() => onPick(i)} />
              <b>{bgCard(id).name}</b>
              <div className="small" dangerouslySetInnerHTML={{ __html: formatCardText(bgCard(id).text) }} />
            </div>
          ))}
        {ms.map((m, i) => (
          <div key={m.uid} className="bg-discover-opt" onClick={() => onPick(i)}>
            <MinionToken m={m} p={me} G={G} tipSide="bottom" onClick={() => onPick(i)} />
            <b>{bgCard(m.id).name}</b>
            <div className="small" dangerouslySetInnerHTML={{ __html: formatCardText(cardText(m, me)) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 選英雄
// ---------------------------------------------------------------------------

function HeroSelect({ s, onPick, onExit }: { s: BgSession; onPick: (id: string) => void; onExit: () => void }) {
  const G = s.game;
  const offers = G.s.heroOffers[0] ?? [];
  return (
    <div className="bg-match bg-hero-select">
      <div className="battle-topbar">
        <button className="btn small" onClick={onExit}>
          ← 返回
        </button>
        <span className="battle-title">選擇你的英雄・本局種族：{G.s.tribes.map((t) => `${TRIBE_ICONS[t]}${TRIBE_NAMES[t]}`).join(' ')}</span>
        <span />
      </div>
      <div className="bg-heroes">
        {offers.map((id) => {
          const d = bgCard(id);
          const spec = HERO_SPEC.get(id);
          const power = bgCard(d.power!);
          return (
            <div key={id} className="bg-hero-card" onClick={() => onPick(id)}>
              <div className="bg-hero-card-art">
                <Art cardId={id} label={d.name.slice(0, 2)} />
              </div>
              <b>{d.name}</b>
              <div className="muted small">
                ❤ {spec?.health ?? 30}
                {!spec?.health && d.armor ? `・🛡️ ${d.armor}` : ''}
              </div>
              <div className="bg-hero-power">
                <b>
                  {power.name}
                  {!spec?.passive && `（🪙${spec?.cost?.(G.human, G) ?? 0}）`}
                  {spec?.passive && '（被動）'}
                </b>
                <div dangerouslySetInnerHTML={{ __html: formatCardText(power.text) }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 戰鬥
// ---------------------------------------------------------------------------

const FRAME_MS: Record<string, number> = { slow: 1.4, normal: 1, fast: 0.55 };

function CombatView({ s, rec, speed, onDone }: { s: BgSession; rec: CombatRecord | undefined; speed: string; onDone: () => void }) {
  const G = s.game;
  const me = G.human;
  const flip = rec ? rec.b === 0 : false;
  const oppIdx = rec ? (flip ? rec.a : rec.b) : -1;
  const opp = oppIdx >= 0 ? G.player(oppIdx) : rec?.ghostOf !== null && rec?.ghostOf !== undefined ? G.player(rec.ghostOf) : null;
  const frames: CombatFrame[] = rec?.frames ?? (rec ? [{ boards: rec.boards }] : []);
  const [i, setI] = useState(0);
  const [bubble, setBubble] = useState<{ who: 'me' | 'opp'; text: string } | null>(null);
  const done = i >= frames.length - 1;
  const factor = FRAME_MS[speed] ?? 1;
  /** true = 你贏、false = 你輸、null = 平手 */
  const myWin = rec ? (rec.winner === null ? null : rec.winner === 0) : null;

  useEffect(() => {
    if (done) return;
    const f = frames[i + 1];
    const ms = (f?.attacker !== undefined ? 750 : f?.note ? 700 : 420) * factor;
    const t = window.setTimeout(() => setI((x) => x + 1), ms);
    return () => window.clearTimeout(t);
  }, [i, done]);

  // 對手的表情
  const emote = (ev: BgEmoteEvent) => {
    if (!opp || oppIdx < 0) return;
    const text = aiEmote(opp, ev, Math.random());
    if (text) setBubble({ who: 'opp', text });
  };
  useEffect(() => {
    const t = window.setTimeout(() => emote('start'), 400);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!done || !rec || myWin === null) return;
    const big = rec.damage >= 9;
    if (opp && oppIdx >= 0 && !opp.alive) emote('dead');
    else if (myWin) emote(big ? 'biglose' : 'lose');
    else emote(big ? 'bigwin' : 'win');
  }, [done]);
  useEffect(() => {
    if (!bubble) return;
    const t = window.setTimeout(() => setBubble(null), 2600);
    return () => window.clearTimeout(t);
  }, [bubble]);

  const f = frames[Math.min(i, frames.length - 1)];
  const mine = f ? (flip ? f.boards[1] : f.boards[0]) : [];
  const theirs = f ? (flip ? f.boards[0] : f.boards[1]) : [];
  const hit = new Map((f?.hits ?? []).map((h) => [h.uid, h.amount]));

  const myEmote = (text: string) => {
    setBubble({ who: 'me', text });
    if (opp && oppIdx >= 0 && Math.random() < (opp.persona?.chatty ?? 0) * 0.8) {
      window.setTimeout(() => setBubble({ who: 'opp', text: aiEmote(opp, 'start', 0) ?? '你好' }), 1200);
    }
  };

  const row = (list: BMinion[], side: 'me' | 'opp') => (
    <div className={`bg-row combat ${side}`}>
      {list.map((m) => (
        <MinionToken
          key={m.uid}
          m={m}
          p={null}
          G={G}
          combat
          tipSide={side === 'opp' ? 'bottom' : 'top'}
          className={`${f?.attacker === m.uid ? `attacking ${side}` : ''} ${f?.target === m.uid ? 'attacked' : ''} ${m.hp <= 0 ? 'dying' : ''}`}
        >
          {hit.has(m.uid) && <span className={`bg-dmg ${hit.get(m.uid) ? '' : 'shield-pop'}`}>{hit.get(m.uid) ? `-${hit.get(m.uid)}` : '盾'}</span>}
        </MinionToken>
      ))}
    </div>
  );

  let resultText = '';
  if (done && rec) {
    if (myWin === null) resultText = '平手！雙方都沒有受到傷害';
    else if (myWin) resultText = `勝利！${oppIdx < 0 ? '（殘影不會受到傷害）' : `${opp?.name ?? ''} 受到 ${rec.damage} 點傷害`}`;
    else resultText = `落敗…你受到 ${rec.damage} 點傷害`;
  }
  const won = myWin === true;

  return (
    <div className="bg-match bg-combat">
      <div className="battle-topbar">
        <span />
        <span className="battle-title">⚔️ 第 {G.round} 回合・戰鬥{f?.note ? `・${f.note}` : ''}</span>
        <button className="btn small" onClick={() => setI(frames.length - 1)} disabled={done}>
          跳過 ⏭
        </button>
      </div>
      <div className="bg-combat-field">
        <div className="bg-combat-hero opp">
          {opp && (
            <HeroPortrait p={opp} size={70}>
              <span className="bg-hero-hp">{opp.hp}</span>
              {opp.armor > 0 && <span className="bg-hero-armor">{opp.armor}</span>}
            </HeroPortrait>
          )}
          <div>
            <b>{opp ? `${opp.name}${oppIdx < 0 ? ' 的殘影' : ''}` : '（沒有對手）'}</b>
            <div className="muted small">{opp && `${bgCard(opp.heroId).name}・旅店等級 ${opp.tier}`}</div>
          </div>
          {bubble?.who === 'opp' && <div className="bg-bubble">{bubble.text}</div>}
        </div>
        {row(theirs, 'opp')}
        <div className="bg-combat-mid">{done && <div className={`bg-result ${won ? 'win' : myWin === null ? 'draw' : 'loss'}`}>{resultText}</div>}</div>
        {row(mine, 'me')}
        <div className="bg-combat-hero me">
          <HeroPortrait p={me} size={70}>
            <span className="bg-hero-hp">{me.hp}</span>
            {me.armor > 0 && <span className="bg-hero-armor">{me.armor}</span>}
          </HeroPortrait>
          <div>
            <b>{me.name}</b>
            <div className="muted small">{bgCard(me.heroId).name}</div>
          </div>
          {bubble?.who === 'me' && <div className="bg-bubble me">{bubble.text}</div>}
          <div className="bg-emotes">
            {['你好', '打得好', '哇喔！', '謝謝', '抱歉', '我要贏了！'].map((t) => (
              <button key={t} className="btn small" onClick={() => myEmote(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      {done && (
        <div className="bg-combat-foot">
          <OtherCombats G={G} />
          <button className="btn big primary" onClick={onDone}>
            {me.alive && G.s.phase !== 'over' ? '下一回合 ▶' : '查看結果'}
          </button>
        </div>
      )}
    </div>
  );
}

function OtherCombats({ G }: { G: BgGame }) {
  const name = (i: number, ghost: number | null) => (i < 0 ? `${ghost !== null ? G.player(ghost).name : ''} 的殘影` : G.player(i).name);
  return (
    <ul className="bg-others">
      {G.s.combats
        .filter((c) => c.a !== 0 && c.b !== 0)
        .map((c, k) => (
          <li key={k}>
            {name(c.a, c.ghostOf)} vs {name(c.b, c.ghostOf)}：
            {c.winner === null ? '平手' : `${name(c.winner, c.ghostOf)} 獲勝（${c.damage} 點傷害）`}
            {[c.a, c.b].filter((x) => x >= 0 && !G.player(x).alive && G.player(x).diedRound === G.round).map((x) => (
              <b key={x} className="bg-out">・{G.player(x).name} 被淘汰</b>
            ))}
          </li>
        ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 結算
// ---------------------------------------------------------------------------

function ResultView({ s, onExit }: { s: BgSession; onExit: () => void }) {
  const G = s.game;
  const r = s.result ?? settle(s);
  const [open, setOpen] = useState<number | null>(null);
  const order = [...G.s.players].sort((a, b) => (a.place ?? 9) - (b.place ?? 9));
  return (
    <div className="bg-match bg-results">
      <div className="battle-topbar">
        <span />
        <span className="battle-title">🍺 英雄戰場・結算</span>
        <span />
      </div>
      <div className="bg-results-body">
        <div className={`bg-place place-${r.place}`}>
          <HeroPortrait p={G.human} size={96} />
          <h2>{PLACE_NAMES[r.place]}</h2>
          <p>
            🪙 +{r.gold}
            {s.rated && (
              <>
                {' '}
                ・積分 {r.delta >= 0 ? '+' : ''}
                {r.delta}
              </>
            )}
          </p>
        </div>
        <div className="panel">
          <h3>最終名次</h3>
          <ul className="bg-final">
            {order.map((p) => (
              <li key={p.idx} className={p.isHuman ? 'me' : ''}>
                <div className="bg-final-row" onClick={() => setOpen(open === p.idx ? null : p.idx)}>
                  <b>{p.place}</b>
                  <HeroPortrait p={{ ...p, alive: true }} size={36} />
                  <span>
                    {p.name}・{bgCard(p.heroId).name}
                  </span>
                  {p.persona && (
                    <span className="muted small">
                      {BG_DIFFICULTY_NAMES[skillLabel(p.persona.skill)]}・{STYLE_NAMES[p.persona.style]}・積分 {p.persona.rating}
                    </span>
                  )}
                  <span className="muted small">{p.triples ? `✨${p.triples}` : ''}</span>
                </div>
                {open === p.idx && (
                  <div className="bg-final-detail">
                    <div className="bg-row small">
                      {(p.alive ? p.board : p.deathBoard ?? []).map((m) => (
                        <MinionToken key={m.uid} m={m} p={null} G={G} combat tipSide="bottom" />
                      ))}
                    </div>
                    {p.notes.length > 0 && (
                      <ol className="bg-notes">
                        {p.notes.map((n, k) => (
                          <li key={k}>{n}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">點一下玩家可以看最後的戰隊，以及電腦每回合在想什麼。</p>
        </div>
        <button className="btn big primary" onClick={onExit}>
          返回大廳
        </button>
      </div>
    </div>
  );
}
