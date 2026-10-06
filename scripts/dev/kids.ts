// 開發用：列出以某卡牌 ID 開頭的相關衍生卡。用法：npx tsx scripts/dev/kids.ts ID...
import { loadCardDefsXml, parseCardDefs } from '../carddefs';
import { normalizeText } from '../../src/cards/parser';
(async () => { const raws = parseCardDefs(await loadCardDefsXml('.cache/CardDefs.xml'));
for (const id of process.argv.slice(2)) { const base = id.replace(/^CORE_/, '');
  for (const r of raws) if (r.id !== id && r.id !== base && (r.id.startsWith(base) || r.id.startsWith('CORE_' + base)) && r.tags.CARDTYPE !== 6) console.log(id, '->', r.id, '|', r.strs.CARDNAME?.enUS, '|', normalizeText(r.strs.CARDTEXT?.enUS ?? ''), '| T', r.tags.CARDTYPE, 'ATK', r.tags.ATK, 'HP', r.tags.HEALTH, 'COST', r.tags.COST);
} })();
