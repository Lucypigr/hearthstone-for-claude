// 開發用：列出還沒實作的飾品、異象、任務、任務獎勵、夥伴、酒館法術、英雄
import { readFileSync } from 'node:fs';
import { BUDDY_IDS } from '../../src/bg/buddies';
import { HEROES } from '../../src/bg/heroes';
import { QUEST_SPEC, RELIC_SPEC } from '../../src/bg/relics';
import { SPELL_SPEC } from '../../src/bg/spells';

const zh = JSON.parse(readFileSync('.cache/hsjson-zhTW.json', 'utf8')) as { id: string; type: string; name: string; text?: string; spellSchool?: string; isBattlegroundsPoolSpell?: boolean; isBattlegroundsDuosExclusive?: boolean; isBattlegroundsBuddy?: boolean; techLevel?: number }[];
const en = new Map((JSON.parse(readFileSync('.cache/hsjson-enUS.json', 'utf8')) as { id: string; text?: string }[]).map((c) => [c.id, c]));
const t = (id: string) => (en.get(id)?.text ?? '').replace(/\n/g, ' ').replace(/<\/?[bi]>|\[x\]/g, '');
const kind = process.argv[2] ?? 'all';
const ok = (c: { id: string; isBattlegroundsDuosExclusive?: boolean }) => !c.id.startsWith('BGDUO') && !c.isBattlegroundsDuosExclusive;
const out: string[] = [];
for (const c of zh) {
  if (!ok(c)) continue;
  let k = '';
  if (c.type === 'BATTLEGROUND_TRINKET' && /TRINKET/.test(c.spellSchool ?? '') && !c.id.startsWith('BG30_Trinket')) k = c.spellSchool === 'GREATER_TRINKET' ? 'greater' : 'lesser';
  else if (c.type === 'BATTLEGROUND_ANOMALY') k = 'anomaly';
  else if (c.type === 'BATTLEGROUND_QUEST_REWARD') k = 'reward';
  else if (/^BG2[478]_Quest_\d+$/.test(c.id)) k = 'quest';
  else if (c.isBattlegroundsBuddy && c.type === 'MINION' && c.id.endsWith('_Buddy')) k = 'buddy';
  else if (c.isBattlegroundsPoolSpell) k = 'spell';
  if (!k || (kind !== 'all' && kind !== k)) continue;
  const done = k === 'quest' ? QUEST_SPEC.has(c.id) : k === 'buddy' ? BUDDY_IDS.has(c.id) : k === 'spell' ? SPELL_SPEC.has(c.id) : RELIC_SPEC.has(c.id);
  if (!done) out.push(`${k}\t${c.id}\t${c.name}\t${c.techLevel ?? ''}\t${t(c.id)}`);
}
console.log(out.join('\n'));
console.log(`未完成 ${out.length}；英雄 ${HEROES.length}`);
