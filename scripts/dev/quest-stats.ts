// 開發用：統計任務多快完成、飾品被買了幾次
import { aiPickHero, aiRecruit, makePersona, playAiTurns } from '../../src/bg/ai';
import { bgCard } from '../../src/bg/data';
import { BgGame } from '../../src/bg/game';

const done: Record<string, number[]> = {};
const taken: Record<string, number> = {};
const relics: Record<string, number> = {};
let presses = 0;
for (let seed = 1; seed <= 20; seed++) {
  const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i + 1}`, persona: makePersona(seed * 13 + i, { difficulty: 'normal' }) }));
  const G = BgGame.create({ seed, humanName: 'P0', ais, trinkets: true, quests: true, buddies: true });
  G.human.persona = makePersona(seed + 999, { difficulty: 'normal' });
  for (const p of G.s.players) G.pickHero(p.idx, aiPickHero(G, p));
  const cur = new Map<number, string>();
  for (let round = 0; round < 30 && G.s.phase !== 'over'; round++) {
    if (G.human.alive) aiRecruit(G, G.human);
    playAiTurns(G);
    G.finishRecruit();
    for (const p of G.s.players) {
      const q = p.quest?.id;
      if (q && !cur.has(p.idx)) (cur.set(p.idx, q), (taken[q] = (taken[q] ?? 0) + 1));
      if (!p.quest && cur.get(p.idx) && cur.get(p.idx) !== 'done') {
        (done[cur.get(p.idx)!] ??= []).push(G.round);
        cur.set(p.idx, 'done');
      }
    }
    if (G.s.phase === 'combat') G.nextRound();
  }
  for (const p of G.s.players) {
    for (const r of p.relics ?? []) relics[r] = (relics[r] ?? 0) + 1;
    presses += p.buddy?.presses ?? 0;
  }
}
for (const q of Object.keys(taken)) {
  const d = done[q] ?? [];
  console.log(bgCard(q).name.padEnd(8), `接 ${taken[q]} 完成 ${d.length}`, d.length ? `平均第 ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1)} 回合` : '');
}
console.log('夥伴按鈕', presses, '次');
console.log(Object.entries(relics).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, n]) => `${bgCard(id).name}${n}`).join(' '));
