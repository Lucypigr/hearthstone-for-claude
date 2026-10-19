// 開發用：讓 8 個電腦打一局英雄戰場，印出每回合的狀況
// 用法：npx tsx scripts/dev/bg-sim.ts [seed] [difficulty]
import { AI_ERRORS, aiPickHero, aiRecruit, makePersona, playAiTurns, type BgDifficulty } from '../../src/bg/ai';
import { bgCard } from '../../src/bg/data';
import { BgGame } from '../../src/bg/game';

const seed = Number(process.argv[2] ?? 1);
const diff = (process.argv[3] ?? 'normal') as BgDifficulty;
const ais = Array.from({ length: 7 }, (_, i) => ({ name: `AI${i + 1}`, persona: makePersona(seed * 13 + i, { difficulty: i < 2 ? 'master' : i < 4 ? 'expert' : i < 6 ? 'normal' : 'novice' }) }));
const G = BgGame.create({ seed, humanName: 'P0', ais });
G.human.persona = makePersona(seed + 999, { difficulty: diff });
for (const p of G.s.players) G.pickHero(p.idx, aiPickHero(G, p));
console.log('種族：', G.s.tribes.join(' '));
for (let round = 0; round < 40 && G.s.phase !== 'over'; round++) {
  if (G.human.alive) aiRecruit(G, G.human);
  playAiTurns(G);
  G.finishRecruit();
  console.log(`\n=== 第 ${G.round} 回合 ===`);
  for (const p of G.s.players) {
    if (p.diedRound !== null && p.diedRound < G.round) continue;
    const board = p.board.map((m) => `${bgCard(m.id).name}${m.golden ? '★' : ''} ${m.atk}/${m.hp}`).join(', ');
    console.log(`${p.name}[${p.persona?.skill.toFixed(2)} ${p.persona?.style}] ${bgCard(p.heroId).name} HP${p.hp}+${p.armor} T${p.tier} 三連${p.triples} | ${board}`);
    if (round < 40 && p.notes.length) console.log('   ', p.notes[p.notes.length - 1]);
  }
  for (const c of G.s.combats) console.log(`  ${c.a} vs ${c.b}${c.ghostOf !== null ? '(殘影)' : ''} → ${c.winner === null ? '平手' : c.winner} 傷害 ${c.damage}`);
  if (G.s.phase === 'combat') G.nextRound();
}
console.log('\n名次：', G.s.players.map((p) => `${p.name}=${p.place}`).join(' '));
if (AI_ERRORS.length) console.log('錯誤：\n' + AI_ERRORS.slice(0, 5).join('\n'));
