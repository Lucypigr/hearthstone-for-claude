import { COLLECTIBLE } from '../../cards/registry';
import { CLASS_NAMES } from '../../engine/heroes';
import { DIFFICULTY_NAMES, WIN_REWARD } from '../../game/economy';
import { today } from '../../game/profile';
import type { Screen } from '../App';
import { useProfile } from '../store';

export function Home({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const owned = Object.keys(p.collection).length;
  const unopened = Object.values(p.packs).reduce((a, b) => a + b, 0);
  const dailyDone = p.lastDailyWin === today();
  return (
    <div className="home">
      <section className="hero-banner">
        <h1>爐石戰記</h1>
        <p>打敗電腦賺取金幣，購買卡包收集卡牌，組出屬於你的套牌！</p>
        <div className="home-actions">
          <button className="btn big primary" onClick={() => go('play')}>
            ⚔️ 開始對戰
          </button>
          <button className="btn big" onClick={() => go('collection')}>
            📚 收藏與套牌
          </button>
          <button className="btn big" onClick={() => go('shop')}>
            🛒 商店
          </button>
          <button className="btn big" onClick={() => go('packs')}>
            🎁 開卡包 {unopened > 0 && <span className="badge">{unopened}</span>}
          </button>
        </div>
      </section>
      <section className="home-stats">
        <div className="stat">
          <b>{p.wins}</b>
          <span>勝場</span>
        </div>
        <div className="stat">
          <b>{p.losses}</b>
          <span>敗場</span>
        </div>
        <div className="stat">
          <b>
            {owned} / {COLLECTIBLE.length}
          </b>
          <span>已收集卡牌</span>
        </div>
        <div className="stat">
          <b>{p.decks.length}</b>
          <span>套牌</span>
        </div>
      </section>
      <section className="home-info">
        <div className="panel">
          <h3>💰 獎勵</h3>
          <ul>
            {(Object.keys(WIN_REWARD) as (keyof typeof WIN_REWARD)[]).map((d) => (
              <li key={d}>
                擊敗{DIFFICULTY_NAMES[d]}電腦：<b>{WIN_REWARD[d]}</b> 金幣
              </li>
            ))}
            <li>每日首勝：額外 50 金幣 {dailyDone ? '（今天已領取）' : '（尚未領取）'}</li>
          </ul>
        </div>
        <div className="panel">
          <h3>📜 最近對戰</h3>
          {p.history.length === 0 && <p className="muted">還沒有對戰紀錄</p>}
          <ul className="history">
            {[...p.history]
              .reverse()
              .slice(0, 6)
              .map((h, i) => (
                <li key={i} className={h.result}>
                  {h.result === 'win' ? '勝利' : h.result === 'loss' ? '落敗' : '平手'} · {CLASS_NAMES[h.myClass]} vs {CLASS_NAMES[h.oppClass]}（{DIFFICULTY_NAMES[h.difficulty]}）
                  <span className="gold">+{h.gold}</span>
                </li>
              ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
