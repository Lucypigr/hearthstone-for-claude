// 開發用：搜尋卡牌。用法：npx tsx scripts/dev/q.ts <regex> [t|g]   （t = 搜尋敘述、g = 搜尋標籤名）
import { loadCardDefsXml, parseCardDefs } from '../carddefs';
(async () => { const raws = parseCardDefs(await loadCardDefsXml('.cache/CardDefs.xml'));
const re = new RegExp(process.argv[2], 'i');
for (const r of raws) { const t = r.strs.CARDTEXT?.enUS ?? ''; const n = r.strs.CARDNAME?.enUS ?? ''; const tg = Object.keys(r.tags).join(' ');
 if (re.test(r.id) || re.test(n) || (process.argv[3] === 't' && re.test(t)) || (process.argv[3] === 'g' && re.test(tg))) console.log(r.id, '|', n, '|', t.replace(/\n/g,' / '), '| T', r.tags.CARDTYPE, 'CL', r.tags.CLASS, 'SET', r.tags.CARD_SET, 'COST', r.tags.COST, 'ATK', r.tags.ATK, 'HP', r.tags.HEALTH);
} })();
