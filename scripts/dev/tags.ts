// 開發用：顯示卡牌的全部標籤。用法：npx tsx scripts/dev/tags.ts ID...
import { loadCardDefsXml, parseCardDefs } from '../carddefs';
(async () => { const raws = parseCardDefs(await loadCardDefsXml('.cache/CardDefs.xml'));
for (const r of raws) if (process.argv.slice(2).includes(r.id)) console.log(r.id, JSON.stringify(r.tags), JSON.stringify(r.refs));
})();
