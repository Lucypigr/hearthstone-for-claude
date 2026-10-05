// 開發用：列出某系列所有卡牌（含衍生卡）的英文敘述。用法：npx tsx scripts/dev/set.ts 1957
import { loadCardDefsXml, parseCardDefs } from '../carddefs';
import { normalizeText } from '../../src/cards/parser';
const set = Number(process.argv[2]);
(async () => { const raws = parseCardDefs(await loadCardDefsXml('.cache/CardDefs.xml'));
for (const r of raws) if (r.tags.CARD_SET === set) console.log(r.id, '|', r.strs.CARDNAME?.enUS, '|', normalizeText(r.strs.CARDTEXT?.enUS ?? ''), '| T', r.tags.CARDTYPE, 'CL', r.tags.CLASS, 'ATK', r.tags.ATK, 'HP', r.tags.HEALTH, 'COST', r.tags.COST, r.tags.COLLECTIBLE ? 'C' : 'tok');
})();
