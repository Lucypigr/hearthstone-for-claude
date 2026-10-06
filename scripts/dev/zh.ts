// 開發用：顯示卡牌的繁體中文名稱與敘述。用法：npx tsx scripts/dev/zh.ts ID...
import { loadCardDefsXml, parseCardDefs } from '../carddefs';
(async () => { const raws = parseCardDefs(await loadCardDefsXml('.cache/CardDefs.xml'));
for (const r of raws) if (process.argv.slice(2).includes(r.id)) console.log(r.id, '|', r.strs.CARDNAME?.zhTW, '|', (r.strs.CARDTEXT?.zhTW ?? '').replace(/\n/g, ' '));
})();
