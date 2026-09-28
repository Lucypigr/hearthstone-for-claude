import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getCard, hasCard, HEROES } from '../../cards/registry';
import { aiMulligan, chooseAction } from '../../engine/ai';
import { Game, isHero } from '../../engine/game';
import { CLASS_NAMES } from '../../engine/heroes';
import type { Action, Fx, Hero, Minion, PlayerId, PlayerState } from '../../engine/state';
import { DIFFICULTY_NAMES } from '../../game/economy';
import { makeAiDeck } from '../../game/opponents';
import { recordMatch } from '../../game/profile';
import type { BattleConfig } from '../App';
import { CLASS_COLORS, formatCardText } from '../cardText';
import { Art, CardBack, CardView } from '../components/Card';
import { clamp, useViewport } from '../hooks';
import { getProfile, setProfile, useProfile } from '../store';

type Mode =
  | { k: 'idle' }
  | { k: 'card'; handUid: number; stage: 'select' | 'choose' | 'place' | 'target'; option?: number; position?: number }
  | { k: 'attack'; attacker: number }
  | { k: 'heroPower' };

interface Float {
  id: number;
  uid: number;
  text: string;
  kind: string;
}

const AI_DELAY = { slow: 1300, normal: 800, fast: 350 };

const ME: PlayerId = 0;
const AI: PlayerId = 1;

export function Battle({ config, onExit, onRematch }: { config: BattleConfig; onExit: () => void; onRematch: () => void }) {
  const profile = useProfile();
  const gameRef = useRef<Game | null>(null);
  const [error] = useState(() => {
    const deck = getProfile().decks.find((d) => d.id === config.deckId);
    if (!deck) return '找不到套牌';
    const aiDeck = makeAiDeck(config.oppClass, config.difficulty, Math.floor(Math.random() * 1e9));
    const g = Game.create({
      decks: [deck.cards, aiDeck],
      classes: [deck.heroClass, config.oppClass],
      names: ['你', HEROES[config.oppClass].name],
      ai: [false, true],
    });
    g.apply({ type: 'mulligan', player: AI, replace: aiMulligan(g, AI, config.difficulty) });
    gameRef.current = g;
    return '';
  });
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [mode, setMode] = useState<Mode>({ k: 'idle' });
  const [inspect, setInspect] = useState<{ cardId: string; atk?: number; hp?: number; uid?: number } | { power: PlayerId } | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [banner, setBanner] = useState<{ id: number; cardId?: string; text: string } | null>(null);
  const [anim, setAnim] = useState<{ attacker: number; target: number; id: number } | null>(null);
  const [mulliganPick, setMulliganPick] = useState<Set<number>>(new Set());
  const [reward, setReward] = useState<{ gold: number; daily: number; result: 'win' | 'loss' | 'draw' } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [turnBanner, setTurnBanner] = useState(0);
  const lastTurn = useRef(0);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const lastFx = useRef(0);
  const vp = useViewport();
  const cw = Math.round(vp.w < 600 ? clamp(Math.min(vp.w * 0.22, vp.h * 0.13), 64, 104) : clamp(Math.min(vp.w * 0.12, vp.h * 0.15), 64, 128));
  const mw = Math.round(clamp(Math.min(vp.w * 0.115, vp.h * 0.105), 46, 96));
  const hw = Math.round(clamp(Math.min(vp.h * 0.12, vp.w * 0.2), 58, 110));

  const g = gameRef.current!;
  const s = g?.s;

  // ------------------------------------------------------------ 動作
  const act = useCallback(
    (a: Action) => {
      const ok = g.apply(a);
      setMode({ k: 'idle' });
      if (!ok) {
        const r = g.check(a);
        if (r.reason) flash(r.reason);
      }
      refresh();
      return ok;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g],
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? '' : t)), 1600);
  };

  // ------------------------------------------------------------ 電腦回合
  useEffect(() => {
    if (!s || s.phase !== 'play' || s.current !== AI || s.pendingChoice) return;
    const t = window.setTimeout(() => {
      const a = chooseAction(g, config.difficulty);
      if (!g.apply(a)) g.apply({ type: 'endTurn' });
      refresh();
    }, AI_DELAY[profile.settings.aiSpeed]);
    return () => window.clearTimeout(t);
  });

  // ------------------------------------------------------------ 特效
  useEffect(() => {
    if (!s) return;
    const fresh = s.fx.filter((f) => f.id > lastFx.current);
    if (!fresh.length) return;
    lastFx.current = fresh[fresh.length - 1].id;
    const newFloats: Float[] = [];
    for (const f of fresh) {
      const fl = fxFloat(f);
      if (fl) newFloats.push(fl);
      if (f.kind === 'play' && f.player === AI) {
        if (f.cardId && hasCard(f.cardId)) setBanner({ id: f.id, cardId: f.cardId, text: `${s.players[AI].name}打出了` });
        else setBanner({ id: f.id, text: `${s.players[AI].name}使用了英雄能力：${HEROES[s.players[AI].heroClass].power.name}` });
      }
      if (f.kind === 'secret' && f.cardId) setBanner({ id: f.id, cardId: f.cardId, text: '奧秘揭露！' });
      if (f.kind === 'attack' && f.uid !== undefined && f.target !== undefined) setAnim({ attacker: f.uid, target: f.target, id: f.id });
    }
    if (newFloats.length) {
      setFloats((old) => [...old, ...newFloats]);
      window.setTimeout(() => setFloats((old) => old.filter((x) => !newFloats.includes(x))), 1300);
    }
  });

  // 輪到玩家時顯示「你的回合」
  useEffect(() => {
    if (!s || s.phase !== 'play' || s.current !== ME || s.turn === lastTurn.current) return;
    lastTurn.current = s.turn;
    setTurnBanner(s.turn);
    const t = window.setTimeout(() => setTurnBanner(0), 1300);
    return () => window.clearTimeout(t);
  });

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 1500);
    return () => window.clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (!anim) return;
    const t = window.setTimeout(() => setAnim(null), 450);
    return () => window.clearTimeout(t);
  }, [anim]);

  // ------------------------------------------------------------ 對戰結束 → 發放獎勵
  useEffect(() => {
    if (!s || s.phase !== 'over' || reward) return;
    const result = s.winner === ME ? 'win' : s.winner === 'draw' ? 'draw' : 'loss';
    const r = recordMatch(getProfile(), result, config.difficulty, s.players[ME].heroClass, config.oppClass);
    setProfile(r.profile);
    setReward({ gold: r.gold, daily: r.dailyBonus, result });
  });

  // ------------------------------------------------------------ Esc 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode({ k: 'idle' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const myTurn = !!s && s.phase === 'play' && s.current === ME && !s.pendingChoice;

  const validTargets = useMemo(() => {
    if (!s || !myTurn) return new Set<number>();
    if (mode.k === 'attack') return new Set(g.attackTargets(mode.attacker));
    if (mode.k === 'heroPower') return new Set(g.heroPowerTargets());
    if (mode.k === 'card' && mode.stage === 'target') {
      const req = g.playTargetReq(mode.handUid, mode.option);
      if (req) return new Set(g.validTargets(req, ME, g.cardIsSpell(mode.handUid)));
    }
    return new Set<number>();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, s?.fxSeq, s?.turn, myTurn]);

  if (error || !g || !s) {
    return (
      <div className="battle-error">
        <p>{error || '無法開始對戰'}</p>
        <button className="btn" onClick={onExit}>
          返回
        </button>
      </div>
    );
  }

  const me = s.players[ME];
  const foe = s.players[AI];

  // ------------------------------------------------------------ 點擊處理
  const needsTarget = (handUid: number, option?: number) => {
    const req = g.playTargetReq(handUid, option);
    if (!req) return false;
    return g.validTargets(req, ME, g.cardIsSpell(handUid)).length > 0;
  };

  const afterOption = (handUid: number, option: number | undefined) => {
    const def = getCard(me.hand.find((h) => h.uid === handUid)!.cardId);
    if (def.type === 'MINION') setMode({ k: 'card', handUid, option, stage: 'place' });
    else if (needsTarget(handUid, option)) setMode({ k: 'card', handUid, option, stage: 'target' });
    else act({ type: 'play', handUid, option });
  };

  const onHandClick = (handUid: number) => {
    const hc = me.hand.find((h) => h.uid === handUid)!;
    const def = getCard(hc.cardId);
    if (!myTurn) {
      setInspect({ cardId: hc.cardId });
      return;
    }
    if (mode.k === 'card' && mode.handUid === handUid && mode.stage === 'select') {
      act({ type: 'play', handUid });
      return;
    }
    const can = g.canPlay(handUid);
    if (!can.ok) {
      flash(can.reason ?? '無法打出');
      setInspect({ cardId: hc.cardId });
      return;
    }
    setInspect(null);
    if (def.chooseOne) setMode({ k: 'card', handUid, stage: 'choose' });
    else if (def.type === 'MINION') setMode({ k: 'card', handUid, stage: 'place' });
    else if (needsTarget(handUid)) setMode({ k: 'card', handUid, stage: 'target' });
    else setMode({ k: 'card', handUid, stage: 'select' });
  };

  const onPlace = (position: number) => {
    if (mode.k !== 'card') return;
    if (needsTarget(mode.handUid, mode.option)) setMode({ ...mode, position, stage: 'target' });
    else act({ type: 'play', handUid: mode.handUid, option: mode.option, position });
  };

  const onTarget = (uid: number) => {
    if (mode.k === 'attack') act({ type: 'attack', attacker: mode.attacker, target: uid });
    else if (mode.k === 'heroPower') act({ type: 'heroPower', target: uid });
    else if (mode.k === 'card') act({ type: 'play', handUid: mode.handUid, target: uid, option: mode.option, position: mode.position });
  };

  const onCharClick = (c: Minion | Hero) => {
    if (validTargets.has(c.uid)) {
      onTarget(c.uid);
      return;
    }
    if (myTurn && c.owner === ME && g.canAttack(c.uid)) {
      if (mode.k === 'attack' && mode.attacker === c.uid) setMode({ k: 'idle' });
      else setMode({ k: 'attack', attacker: c.uid });
      setInspect(null);
      return;
    }
    if (mode.k !== 'idle') {
      setMode({ k: 'idle' });
      return;
    }
    if (!isHero(c)) setInspect({ cardId: c.cardId, atk: g.atkOf(c), hp: c.hp, uid: c.uid });
  };

  const onHeroPower = () => {
    if (!myTurn) return;
    if (!g.canHeroPower()) {
      flash(me.heroPower.used ? '本回合已使用過英雄能力' : '無法使用英雄能力');
      return;
    }
    if (g.heroPowerNeedsTarget()) setMode(mode.k === 'heroPower' ? { k: 'idle' } : { k: 'heroPower' });
    else act({ type: 'heroPower' });
  };

  const selectedHand = mode.k === 'card' ? mode.handUid : null;
  const canTrade = selectedHand !== null && g.check({ type: 'trade', handUid: selectedHand }).ok;
  const selectedDef = selectedHand !== null ? getCard(me.hand.find((h) => h.uid === selectedHand)?.cardId ?? 'GAME_005') : null;
  const placing = mode.k === 'card' && mode.stage === 'place';

  const hint = (() => {
    if (s.phase === 'mulligan') return '';
    if (!myTurn) return s.pendingChoice ? '' : `${foe.name}的回合…`;
    if (mode.k === 'card') {
      if (mode.stage === 'place') return '點選位置放置手下（Esc 取消）';
      if (mode.stage === 'target') return '選擇目標（Esc 取消）';
      if (mode.stage === 'select') return '再點一次卡牌或點戰場使用';
    }
    if (mode.k === 'attack') return '選擇攻擊目標（Esc 取消）';
    if (mode.k === 'heroPower') return '選擇英雄能力的目標';
    return '';
  })();

  const charClasses = (c: Minion | Hero) => {
    const cls: string[] = [];
    if (validTargets.has(c.uid)) cls.push('targetable');
    if (myTurn && c.owner === ME && mode.k === 'idle' && g.canAttack(c.uid)) cls.push('can-attack');
    if (mode.k === 'attack' && mode.attacker === c.uid) cls.push('attacking-selected');
    if (anim?.attacker === c.uid) cls.push(c.owner === ME ? 'lunge-up' : 'lunge-down');
    if (anim?.target === c.uid) cls.push('hit');
    return cls.join(' ');
  };

  const floatsFor = (uid: number) =>
    floats
      .filter((f) => f.uid === uid)
      .map((f) => (
        <span key={f.id} className={`float ${f.kind}`}>
          {f.text}
        </span>
      ));

  const renderMinion = (m: Minion) => (
    <MinionView
      key={m.uid}
      m={m}
      g={g}
      className={charClasses(m)}
      onClick={() => onCharClick(m)}
      onHover={(on) => setInspect(on ? { cardId: m.cardId, atk: g.atkOf(m), hp: m.hp, uid: m.uid } : null)}
    >
      {floatsFor(m.uid)}
    </MinionView>
  );

  return (
    <div
      className={`battle ${myTurn ? 'my-turn' : ''}`}
      style={{ '--mw': `${mw}px`, '--hw': `${hw}px`, '--cw': `${cw}px` } as CSSProperties}
      onContextMenu={(e) => {
        e.preventDefault();
        setMode({ k: 'idle' });
      }}
    >
      <div className="battle-topbar">
        <button className="btn small" onClick={() => setMenu(!menu)}>
          ☰ 選單
        </button>
        <span className="battle-title">
          對戰 {CLASS_NAMES[foe.heroClass]}（{DIFFICULTY_NAMES[config.difficulty]}）・第 {Math.max(1, Math.ceil(s.turn / 2))} 回合
        </span>
        <button className="btn small" onClick={() => setShowLog(!showLog)}>
          📜 紀錄
        </button>
      </div>
      {menu && (
        <div className="battle-menu">
          <button
            className="btn danger"
            onClick={() => {
              setMenu(false);
              if (s.phase !== 'over') act({ type: 'concede', player: ME });
            }}
          >
            🏳️ 投降
          </button>
          <button className="btn" onClick={() => setMenu(false)}>
            繼續對戰
          </button>
        </div>
      )}

      {/* ---------------- 對手區 ---------------- */}
      <div className="side foe-side">
        <div className="hand foe-hand">
          {foe.hand.map((h) => (
            <CardBack key={h.uid} width={46} />
          ))}
        </div>
        <div className="hero-row">
          <PlayerInfo p={foe} />
          <WeaponView p={foe} />
          <HeroView p={foe} g={g} className={charClasses(foe.hero)} onClick={() => onCharClick(foe.hero)}>
            {floatsFor(foe.hero.uid)}
          </HeroView>
          <HeroPowerView p={foe} usable={false} onHover={(on) => setInspect(on ? { power: AI } : null)} />
        </div>
      </div>

      <div className="boards" onClick={() => mode.k === 'card' && mode.stage === 'select' && act({ type: 'play', handUid: mode.handUid })}>
        <div className="board foe-board">{foe.board.map(renderMinion)}</div>
        <div className="board-divider">
          <span className="hint">{hint}</span>
          <button className={`end-turn ${myTurn ? 'ready' : ''}`} disabled={!myTurn} onClick={(e) => { e.stopPropagation(); act({ type: 'endTurn' }); }}>
            {myTurn ? '結束回合' : '對手回合'}
          </button>
        </div>
        <div
          className={`board my-board ${placing ? 'placing' : ''}`}
          onClick={(e) => {
            if (placing) {
              e.stopPropagation();
              onPlace(me.board.length);
            }
          }}
        >
          {placing && <Slot onClick={() => onPlace(0)} />}
          {me.board.map((m, i) => (
            <span className="board-cell" key={m.uid}>
              {renderMinion(m)}
              {placing && <Slot onClick={() => onPlace(i + 1)} />}
            </span>
          ))}
          {placing && selectedDef && <div className="ghost-minion">{selectedDef.name}</div>}
        </div>
      </div>

      {/* ---------------- 我方區 ---------------- */}
      <div className="side my-side">
        <div className="hero-row">
          <PlayerInfo p={me} />
          <WeaponView p={me} />
          <HeroView p={me} g={g} className={charClasses(me.hero)} onClick={() => onCharClick(me.hero)}>
            {floatsFor(me.hero.uid)}
          </HeroView>
          <HeroPowerView
            p={me}
            usable={myTurn && g.canHeroPower()}
            active={mode.k === 'heroPower'}
            onClick={onHeroPower}
            onHover={(on) => setInspect(on ? { power: ME } : null)}
          />
        </div>
        <div className="hand my-hand" style={{ '--n': me.hand.length } as CSSProperties}>
          {me.hand.map((h, i) => {
            const def = getCard(h.cardId);
            const playable = myTurn && g.canPlay(h.uid).ok;
            return (
              <div key={h.uid} className={`hand-slot ${selectedHand === h.uid ? 'selected' : ''}`} style={{ '--i': i } as CSSProperties}>
                <CardView
                  cardId={h.cardId}
                  width={cw}
                  cost={g.costOf(me, h)}
                  attack={def.type === 'MINION' ? (def.attack ?? 0) + h.atkBuff : undefined}
                  health={def.type === 'MINION' ? (def.health ?? 0) + h.hpBuff : undefined}
                  spellDamage={g.spellDamage(ME)}
                  playable={playable}
                  selected={selectedHand === h.uid}
                  onClick={() => onHandClick(h.uid)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- 浮動資訊 ---------------- */}
      {inspect && 'power' in inspect && (
        <div className="inspect" onClick={() => setInspect(null)}>
          <div className="power-card">
            <b>{HEROES[s.players[inspect.power].heroClass].power.name}</b>
            <span className="muted small">英雄能力・消耗 {s.players[inspect.power].heroPower.cost}</span>
            <p dangerouslySetInnerHTML={{ __html: formatCardText(HEROES[s.players[inspect.power].heroClass].power.text) }} />
          </div>
        </div>
      )}
      {inspect && 'cardId' in inspect && hasCard(inspect.cardId) && (
        <div className="inspect" onClick={() => setInspect(null)}>
          <CardView cardId={inspect.cardId} width={220} attack={inspect.atk} health={inspect.hp} />
          <Glossary cardId={inspect.cardId} minion={inspect.uid !== undefined ? g.minion(inspect.uid) : null} g={g} />
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {canTrade && selectedHand !== null && (
        <button className="btn trade-btn" onClick={() => act({ type: 'trade', handUid: selectedHand })}>
          🔁 交易（1 法力：洗回牌堆並抽一張）
        </button>
      )}
      {turnBanner && (
        <div className="turn-banner" key={turnBanner}>
          你的回合
        </div>
      )}
      {banner && (
        <div className="play-banner" key={banner.id}>
          <div className="banner-text">{banner.text}</div>
          {banner.cardId && <CardView cardId={banner.cardId} width={200} />}
        </div>
      )}
      {showLog && (
        <div className="log-panel">
          <div className="log-head">
            對戰紀錄 <button onClick={() => setShowLog(false)}>✕</button>
          </div>
          <ul>
            {[...s.log].reverse().map((l, i) => (
              <li key={i} className={l.player === ME ? 'mine' : l.player === AI ? 'theirs' : ''}>
                {l.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------- 視窗 ---------------- */}
      {s.phase === 'mulligan' && !me.mulliganDone && (
        <div className="modal">
          <div className="modal-box">
            <h2>起手換牌</h2>
            <p>{s.first === ME ? '你是先攻' : '你是後攻（會獲得幸運幣）'}，點選想換掉的卡牌。</p>
            <div className="card-row">
              {me.hand.map((h) => (
                <div key={h.uid} className={`mulligan-card ${mulliganPick.has(h.uid) ? 'replace' : ''}`}>
                  <CardView
                    cardId={h.cardId}
                    width={150}
                    onClick={() => {
                      const next = new Set(mulliganPick);
                      if (next.has(h.uid)) next.delete(h.uid);
                      else next.add(h.uid);
                      setMulliganPick(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              className="btn big primary"
              onClick={() => {
                g.apply({ type: 'mulligan', player: ME, replace: [...mulliganPick] });
                refresh();
              }}
            >
              確定
            </button>
          </div>
        </div>
      )}

      {mode.k === 'card' && mode.stage === 'choose' && selectedDef?.chooseOne && (
        <div className="modal" onClick={() => setMode({ k: 'idle' })}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>二選一</h2>
            <div className="card-row">
              {selectedDef.chooseOne.map((o, i) => {
                const ok = g.canPlay(mode.handUid, i).ok;
                return (
                  <button key={o.id} className={`choose-option ${ok ? '' : 'disabled'}`} disabled={!ok} onClick={() => afterOption(mode.handUid, i)}>
                    <Art cardId={o.transformInto ?? selectedDef.id} className="choose-art" />
                    <b>{o.name}</b>
                    <span dangerouslySetInnerHTML={{ __html: formatCardText(o.text) }} />
                  </button>
                );
              })}
            </div>
            <button className="btn" onClick={() => setMode({ k: 'idle' })}>
              取消
            </button>
          </div>
        </div>
      )}

      {s.pendingChoice && s.pendingChoice.player === ME && (
        <div className="modal">
          <div className="modal-box">
            <h2>{s.pendingChoice.title}</h2>
            <div className="card-row">
              {s.pendingChoice.options.map((id, i) => (
                <CardView key={id + i} cardId={id} width={170} playable onClick={() => act({ type: 'choose', index: i })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {s.phase === 'over' && (
        <div className="modal">
          <div className={`modal-box result ${reward?.result ?? ''}`}>
            <h1>{s.winner === ME ? '🏆 勝利！' : s.winner === 'draw' ? '平手' : '💀 落敗'}</h1>
            {reward && (
              <p className="reward-line">
                獲得 <b>🪙 {reward.gold}</b> 金幣{reward.daily > 0 && <>（含每日首勝 {reward.daily}）</>}
              </p>
            )}
            <p className="muted">目前金幣：{profile.gold}</p>
            <div className="row">
              <button className="btn big primary" onClick={onRematch}>
                再戰一場
              </button>
              <button className="btn big" onClick={onExit}>
                返回主選單
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 子元件
// ============================================================================

const KEYWORD_HELP: [string, string][] = [
  ['TAUNT', '嘲諷：敵人必須先攻擊有嘲諷的角色'],
  ['DIVINE_SHIELD', '聖盾：抵擋下一次受到的傷害'],
  ['CHARGE', '衝鋒：上場當回合就能攻擊'],
  ['RUSH', '突襲：上場當回合就能攻擊手下'],
  ['WINDFURY', '風怒：每回合可以攻擊兩次'],
  ['MEGA_WINDFURY', '超級風怒：每回合可以攻擊四次'],
  ['STEALTH', '潛行：在攻擊前無法被敵人指定為目標'],
  ['POISONOUS', '劇毒：對手下造成傷害時直接消滅它'],
  ['LIFESTEAL', '生命竊取：造成傷害時為你的英雄恢復等量生命'],
  ['REBORN', '復生：第一次死亡時以 1 點生命值復活'],
  ['ELUSIVE', '法術免疫：無法成為法術或英雄能力的目標'],
  ['CANT_ATTACK', '無法攻擊'],
  ['FREEZE_ON_DAMAGE', '冰凍被它傷害的角色（下回合無法攻擊）'],
  ['TRADEABLE', '可交易：花 1 法力把它洗回牌堆並抽一張牌'],
];

function Glossary({ cardId, minion, g }: { cardId: string; minion: Minion | null; g: Game }) {
  const def = getCard(cardId);
  const kws = new Set<string>(def.keywords ?? []);
  if (minion) for (const k of KEYWORD_HELP) if (g.hasKw(minion, k[0] as Parameters<Game['hasKw']>[1])) kws.add(k[0]);
  const lines = KEYWORD_HELP.filter(([k]) => kws.has(k)).map(([, t]) => t);
  const kinds = new Set((def.abilities ?? []).map((a) => a.on.k));
  if (kinds.has('deathrattle')) lines.push('亡語：死亡時觸發效果');
  if (kinds.has('secret')) lines.push('奧秘：在對手回合滿足條件時才會揭露並觸發');
  if (def.overload) lines.push(`超載：下回合鎖住 ${def.overload} 顆法力水晶`);
  if (def.spellDamage) lines.push(`法術傷害 +${def.spellDamage}：你的法術多造成 ${def.spellDamage} 點傷害`);
  if (minion?.frozen) lines.push('已被冰凍：錯過下一次攻擊');
  if (minion?.silenced) lines.push('已被沉默：失去所有卡牌敘述的效果');
  if (!lines.length) return null;
  return (
    <ul className="glossary">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function fxFloat(f: Fx): Float | null {
  if (f.uid === undefined) return null;
  switch (f.kind) {
    case 'damage':
      return { id: f.id, uid: f.uid, text: `-${f.amount}`, kind: 'damage' };
    case 'heal':
      return { id: f.id, uid: f.uid, text: `+${f.amount}`, kind: 'heal' };
    case 'armor':
      return { id: f.id, uid: f.uid, text: `+${f.amount}🛡`, kind: 'armor' };
    case 'shield':
      return { id: f.id, uid: f.uid, text: '聖盾！', kind: 'shield' };
  }
  return null;
}

function Slot({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="slot"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}

function MinionView({
  m,
  g,
  className,
  onClick,
  onHover,
  children,
}: {
  m: Minion;
  g: Game;
  className: string;
  onClick: () => void;
  onHover: (on: boolean) => void;
  children?: ReactNode;
}) {
  const def = getCard(m.cardId);
  const atk = g.atkOf(m);
  const kw = (k: Parameters<Game['hasKw']>[1]) => g.hasKw(m, k);
  const hasDeathrattle = !m.silenced && m.abilities.some((a) => a.on.k === 'deathrattle');
  const hasTrigger = !m.silenced && (m.abilities.some((a) => a.on.k !== 'play' && a.on.k !== 'deathrattle') || m.auras.length > 0);
  const hpClass = m.hp < m.maxHp ? 'damaged' : m.maxHp > (def.health ?? 0) ? 'buffed' : '';
  const atkClass = atk > (def.attack ?? 0) ? 'buffed' : atk < (def.attack ?? 0) ? 'damaged' : '';
  return (
    <div
      className={`minion ${kw('TAUNT') ? 'taunt' : ''} ${kw('DIVINE_SHIELD') ? 'shield' : ''} ${kw('STEALTH') ? 'stealth' : ''} ${m.frozen ? 'frozen' : ''} ${def.rarity === 'LEGENDARY' ? 'legendary' : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="minion-portrait">
        <Art cardId={m.cardId} />
      </div>
      <div className={`minion-atk ${atkClass}`}>{atk}</div>
      <div className={`minion-hp ${hpClass}`}>{m.hp}</div>
      <div className="minion-icons">
        {hasDeathrattle && <span title="亡語">💀</span>}
        {hasTrigger && <span title="觸發 / 光環">⚡</span>}
        {kw('POISONOUS') && <span title="劇毒">🧪</span>}
        {kw('LIFESTEAL') && <span title="生命竊取">🩸</span>}
        {(kw('WINDFURY') || kw('MEGA_WINDFURY')) && <span title="風怒">🌀</span>}
        {kw('REBORN') && <span title="復生">👼</span>}
        {m.spellDamage > 0 && !m.silenced && <span title="法術傷害">🔮</span>}
        {m.silenced && <span title="已沉默">🔇</span>}
      </div>
      {m.sleeping && !kw('CHARGE') && m.owner === g.s.current && <div className="zzz">z z</div>}
      {children}
    </div>
  );
}

function HeroView({ p, g, className, onClick, children }: { p: PlayerState; g: Game; className: string; onClick: () => void; children?: ReactNode }) {
  const h = p.hero;
  const atk = g.atkOf(h);
  return (
    <div
      className={`hero ${h.frozen ? 'frozen' : ''} ${h.immune ? 'immune' : ''} ${className}`}
      style={{ '--class': CLASS_COLORS[p.heroClass] } as CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="hero-portrait">
        <Art cardId={h.cardId} label={CLASS_NAMES[p.heroClass]} color={CLASS_COLORS[p.heroClass]} />
      </div>
      {p.secrets.length > 0 && (
        <div className="secrets">
          {p.secrets.map((sec) => (
            <span key={sec.uid} className="secret" title={p.id === ME ? getCard(sec.cardId).name : '奧秘'}>
              ?
            </span>
          ))}
        </div>
      )}
      {atk > 0 && <div className="hero-atk">{atk}</div>}
      <div className={`hero-hp ${h.hp < h.maxHp ? 'damaged' : ''}`}>{h.hp}</div>
      {h.armor > 0 && <div className="hero-armor">{h.armor}</div>}
      <div className="hero-name">{p.name}</div>
      {children}
    </div>
  );
}

function HeroPowerView({
  p,
  usable,
  active,
  onClick,
  onHover,
}: {
  p: PlayerState;
  usable: boolean;
  active?: boolean;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
}) {
  const info = HEROES[p.heroClass].power;
  return (
    <button
      className={`hero-power ${p.heroPower.used ? 'used' : ''} ${usable ? 'usable' : ''} ${active ? 'active' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <Art cardId={p.heroPower.id} className="hp-art" label={info.name.slice(0, 2)} color={CLASS_COLORS[p.heroClass]} />
      <span className="hp-cost">{p.heroPower.cost}</span>
      <span className="hp-name">{info.name}</span>
    </button>
  );
}

function WeaponView({ p }: { p: PlayerState }) {
  const w = p.weapon;
  if (!w) return <div className="weapon empty" />;
  return (
    <div className="weapon" title={getCard(w.cardId).name}>
      <Art cardId={w.cardId} />
      <span className="w-atk">{w.atk}</span>
      <span className="w-dur">{w.durability}</span>
    </div>
  );
}

function PlayerInfo({ p }: { p: PlayerState }) {
  return (
    <div className="player-info">
      <div className="mana">
        <span className="mana-text">
          💎 {p.mana}/{p.maxMana}
        </span>
        <div className="crystals">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`crystal ${i < p.mana ? 'full' : i < p.maxMana ? 'empty' : 'none'} ${i >= p.maxMana - p.overloadLocked && i < p.maxMana ? 'locked' : ''}`} />
          ))}
        </div>
        {p.overloadOwed > 0 && <span className="overload">超載 {p.overloadOwed}</span>}
      </div>
      <div className="deck-count" title="牌庫剩餘">
        🂠 {p.deck.length}
      </div>
      <div className="hand-count" title="手牌數">
        ✋ {p.hand.length}
      </div>
    </div>
  );
}
