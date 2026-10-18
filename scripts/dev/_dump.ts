import { readFileSync } from 'node:fs';
import { parseCardDefs } from '../carddefs';
const raws = parseCardDefs(readFileSync('.cache/CardDefs.xml', 'utf8'));
const re = new RegExp(process.argv[2]);
const ids = readFileSync('.cache/unsupported.txt', 'utf8').split('\n').filter((l) => re.test(l)).map((l) => l.split('\t'));
const byId = new Map(raws.map((r) => [r.id, r]));
for (const [id, , , reason] of ids) {
  const r = byId.get(id)!;
  const t = r.tags;
  const mech = Object.keys(t).filter((k) => /^[A-Z_]+$/.test(k) && !/^(COST|ATK|HEALTH|DURABILITY|CARD_SET|CLASS|CARDTYPE|RARITY|COLLECTIBLE|CARDRACE|FACTION|ELITE|TRIGGER_VISUAL|COLLECTION_RELATED_CARD_DATABASE_ID|SPELL_SCHOOL|TAG_SCRIPT_DATA_NUM_1|ARTISTNAME|HIDE_WATERMARK|IS_[A-Z_]+|GOLDEN_[A-Z_]+|.*_VISUAL.*|.*AUDIO.*|.*FX.*)$/.test(k));
  console.log(`${id} [${t.CLASS}${t.MULTIPLE_CLASSES ? ' multi' + t.MULTIPLE_CLASSES : ''}] ${t.COST ?? 0}費 ${t.ATK ?? ''}/${t.HEALTH ?? t.DURABILITY ?? ''} type${t.CARDTYPE} race${t.CARDRACE ?? '-'} ${r.strs.CARDNAME.enUS} / ${r.strs.CARDNAME.zhTW}  {${mech.join(',')}}`);
  console.log('   EN: ' + (r.strs.CARDTEXT?.enUS ?? '').replace(/\n/g, ' '));
  console.log('   ZH: ' + (r.strs.CARDTEXT?.zhTW ?? '').replace(/\n/g, ' '));
  console.log('   WHY: ' + reason);
  const kids = raws.filter((x) => x.id.startsWith(id) && x.id !== id && !/e\d*$/.test(x.id) && x.tags.CARDTYPE !== 6);
  for (const k of kids.slice(0, 12)) console.log(`   - ${k.id} t${k.tags.CARDTYPE} ${k.tags.COST ?? 0}費 ${k.tags.ATK ?? ''}/${k.tags.HEALTH ?? k.tags.DURABILITY ?? ''} ${k.strs.CARDNAME?.enUS} / ${k.strs.CARDNAME?.zhTW}: ${(k.strs.CARDTEXT?.enUS ?? '').replace(/\n/g, ' ')}`);
}
