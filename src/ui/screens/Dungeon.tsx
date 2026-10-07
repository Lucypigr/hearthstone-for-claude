import { useState } from 'react';
import { POWER_INFO, getCard } from '../../cards/registry';
import { CLASS_NAMES } from '../../engine/heroes';
import {
  DUNGEON_CLASSES,
  DUNGEON_LEVELS,
  bossHp,
  bossPower,
  currentBoss,
  currentLevel,
  newDungeonState,
  pickReward,
  playerHp,
  runGold,
  startRun,
  type DungeonClass,
  type DungeonRun,
} from '../../game/dungeon';
import type { BattleConfig } from '../App';
import { CardView } from '../components/Card';
import { formatCardText } from '../cardText';
import { setProfile, useProfile } from '../store';

const STAGE_TITLES = ['小試身手', '地下探索', '深入洞穴', '險惡通道', '黑暗深處', '古老遺跡', '最終前夕', '最終 Boss'];

function setRun(run: DungeonRun | null) {
  setProfile((p) => ({ ...p, dungeon: { ...(p.dungeon ?? newDungeonState()), run } }));
}

export function Dungeon({ onStart }: { onStart: (cfg: BattleConfig) => void }) {
  const p = useProfile();
  const d = p.dungeon ?? newDungeonState();
  const run = d.run;
  const [cls, setCls] = useState<DungeonClass>('MAGE');

  if (!run) {
    return (
      <div className="dungeon">
        <h2>🕯 地城探險</h2>
        <p className="muted">
          選一個職業，帶著 10 張牌的起始牌組進入地城，連續擊敗 {DUNGEON_LEVELS} 個隨機 Boss。每場勝利後可以選擇獎勵讓牌組變強；輸了就要從頭來過。你的生命值從 15 開始，每擊敗一個 Boss 增加 5（最多 50）。你永遠先攻，雙方都沒有幸運幣。
        </p>
        <div className="dungeon-stats">
          <span>最高紀錄：擊敗 {d.best} 個 Boss</span>
          <span>通關 {d.clears} 次</span>
          <span>挑戰 {d.runs} 次</span>
        </div>
        <div className="dungeon-classes">
          {DUNGEON_CLASSES.map((c) => (
            <button key={c} className={`btn ${cls === c ? 'primary' : ''}`} onClick={() => setCls(c)}>
              {CLASS_NAMES[c]}
            </button>
          ))}
        </div>
        <button
          className="btn big primary"
          onClick={() => setProfile((pr) => ({ ...pr, dungeon: { ...(pr.dungeon ?? newDungeonState()), run: startRun(cls), runs: (pr.dungeon?.runs ?? 0) + 1 } }))}
        >
          進入地城
        </button>
      </div>
    );
  }

  if (run.stage === 'over' || run.stage === 'cleared') {
    const gold = runGold(run);
    return (
      <div className="dungeon">
        <h2>{run.stage === 'cleared' ? '🏆 通關！你擊敗了所有 Boss' : '💀 探險結束'}</h2>
        <p>
          你擊敗了 <b>{run.wins}</b> 個 Boss，獲得 <b>🪙 {gold}</b> 金幣。
        </p>
        <button
          className="btn big primary"
          onClick={() => {
            setProfile((pr) => ({
              ...pr,
              gold: pr.gold + gold,
              dungeon: {
                ...(pr.dungeon ?? newDungeonState()),
                run: null,
                best: Math.max(pr.dungeon?.best ?? 0, run.wins),
                clears: (pr.dungeon?.clears ?? 0) + (run.stage === 'cleared' ? 1 : 0),
              },
            }));
          }}
        >
          領取獎勵並返回
        </button>
      </div>
    );
  }

  if (run.stage === 'reward') {
    const reward = run.rewards[0];
    const title = reward.kind === 'passive' ? '選擇一個被動寶藏' : reward.kind === 'treasure' ? '選擇一件寶藏（加入牌組）' : '選擇一組卡牌加入牌組';
    return (
      <div className="dungeon">
        <h2>🎁 {title}</h2>
        <div className="dungeon-options">
          {reward.options.map((cards, i) => (
            <button key={i} className="dungeon-option" onClick={() => setRun(pickReward(run, i))}>
              <div className="dungeon-option-cards">
                {cards.map((id, k) => (
                  <CardView key={id + k} cardId={id} width={reward.kind === 'bundle' ? 120 : 190} />
                ))}
              </div>
              {reward.kind === 'passive' && <p className="small">{formatCardText(getCard(cards[0]).text)}</p>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 準備戰鬥
  const boss = currentBoss(run);
  const level = currentLevel(run);
  const power = POWER_INFO[bossPower(run)];
  return (
    <div className="dungeon">
      <h2>
        第 {level} 關・{STAGE_TITLES[level - 1]}
      </h2>
      <div className="dungeon-boss">
        <CardView cardId={boss.hero} width={170} />
        <div>
          <h3>{boss.name}</h3>
          <p>
            生命值 <b>{bossHp(run)}</b>・{CLASS_NAMES[boss.cls]}
          </p>
          {power && (
            <p>
              <b>{power.name}</b>
              {power.cost > 0 && `（${power.cost}）`}：<span dangerouslySetInnerHTML={{ __html: formatCardText(power.text) }} />
            </p>
          )}
          {level === DUNGEON_LEVELS && <p className="muted">最終 Boss 開局就有 2 顆法力水晶。</p>}
        </div>
      </div>
      <p>
        你：{CLASS_NAMES[run.cls]}・生命值 <b>{playerHp(run)}</b>・牌組 <b>{run.deck.length}</b> 張
        {run.passives.length > 0 && (
          <>
            ・被動寶藏：{run.passives.map((id) => getCard(id).name).join('、')}
          </>
        )}
      </p>
      <div className="row">
        <button className="btn big primary" onClick={() => onStart({ deckId: '', difficulty: 'hard', oppClass: boss.cls, dungeon: run })}>
          ⚔️ 挑戰 Boss
        </button>
        <button
          className="btn"
          onClick={() => {
            if (confirm('放棄這一輪探險？')) setRun({ ...run, stage: 'over' });
          }}
        >
          放棄
        </button>
      </div>
      <p className="muted small">目前進度：已擊敗 {run.wins} / {DUNGEON_LEVELS}</p>
    </div>
  );
}
