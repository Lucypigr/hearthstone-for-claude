// 開發用：列出某系列所有卡牌（含衍生卡）的原始英文敘述與標籤。用法：npx tsx scripts/dev/set.ts 1957 [raw]
import { loadCardDefsXml, parseCardDefs } from '../carddefs';
import { normalizeText } from '../../src/cards/parser';
const set = Number(process.argv[2]);
const raw = process.argv[3] === 'raw';
(async () => { const raws = parseCardDefs(await loadCardDefsXml('.cache/CardDefs.xml'));
for (const r of raws) if (r.tags.CARD_SET === set) {
  const t = r.strs.CARDTEXT?.enUS ?? '';
  console.log(r.id, '|', r.strs.CARDNAME?.enUS, '|', raw ? t.replace(/\n/g, ' / ') : normalizeText(t), '| T', r.tags.CARDTYPE, 'CL', r.tags.CLASS, 'ATK', r.tags.ATK, 'HP', r.tags.HEALTH, 'COST', r.tags.COST, 'DUR', r.tags.DURABILITY, raw ? JSON.stringify(r.tags) : '', r.tags.COLLECTIBLE ? 'C' : 'tok');
} })();
