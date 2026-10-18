import { readFileSync } from 'node:fs';
import { parseCardDefs } from '../carddefs';
const raws = parseCardDefs(readFileSync('.cache/CardDefs.xml', 'utf8'));
for (const q of process.argv.slice(2)) {
  const [name, stats] = q.split('@');
  for (const r of raws) {
    if (r.strs.CARDNAME?.enUS !== name) continue;
    const st = `${r.tags.ATK ?? ''}/${r.tags.HEALTH ?? r.tags.DURABILITY ?? ''}`;
    if (stats && st !== stats) continue;
    console.log(q, '→', r.id, 'type', r.tags.CARDTYPE, 'set', r.tags.CARD_SET, st, r.strs.CARDNAME.zhTW, '|', (r.strs.CARDTEXT?.enUS ?? '').slice(0, 60).replace(/\n/g, ' '));
  }
}
