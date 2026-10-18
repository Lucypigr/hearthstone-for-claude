import { readFileSync } from 'node:fs';
import { parseCardDefs } from '../carddefs';
const raws = parseCardDefs(readFileSync('.cache/CardDefs.xml', 'utf8'));
const re = new RegExp(process.argv[2]);
for (const r of raws) if (re.test(r.id)) console.log(r.id, `t${r.tags.CARDTYPE} ${r.tags.COST ?? 0}費 ${r.tags.ATK ?? ''}/${r.tags.HEALTH ?? r.tags.DURABILITY ?? ''} hp=${r.refs.HERO_POWER ?? ''} armor=${r.tags.ARMOR ?? ''}`, r.strs.CARDNAME?.enUS, '/', r.strs.CARDNAME?.zhTW, '|', (r.strs.CARDTEXT?.enUS ?? '').replace(/\n/g, ' ').slice(0, 140));
