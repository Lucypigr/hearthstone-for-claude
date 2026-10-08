// 全卡稽核：把建好的卡牌資料與官方 CardDefs.xml 對照，列出可疑之處
import { readFileSync } from 'node:fs';
import { loadCardDefsXml, parseCardDefs } from '../carddefs';
import { ALL_CARDS } from '../../src/cards/registry';

type C = Record<string, any>;
const strip = (s: string) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\[x\]/g, '').replace(/_/g, ' ').replace(/\$|#/g, '');

(async () => {
  const list: C[] = ALL_CARDS() as unknown as C[];
  const by = new Map(list.map((c) => [c.id, c]));
  const raws = parseCardDefs(await loadCardDefsXml('.cache/CardDefs.xml'));
  const rawBy = new Map(raws.map((r) => [r.id, r]));
  const src = readFileSync('src/engine/game.ts', 'utf8') + readFileSync('src/engine/dungeon.ts', 'utf8');
  const out: Record<string, string[]> = {};
  const add = (k: string, s: string) => (out[k] ??= []).push(s);

  const KW: [string, string][] = [
    ['TAUNT', 'TAUNT'], ['DIVINE_SHIELD', 'DIVINE_SHIELD'], ['CHARGE', 'CHARGE'], ['RUSH', 'RUSH'], ['WINDFURY', 'WINDFURY'],
    ['STEALTH', 'STEALTH'], ['POISONOUS', 'POISONOUS'], ['LIFESTEAL', 'LIFESTEAL'], ['REBORN', 'REBORN'], ['ELUSIVE', 'ELUSIVE'],
  ];
  const customFns = new Set([...src.matchAll(/case '([A-Za-z0-9_]+)'/g)].map((m) => m[1]));

  for (const c of list) {
    const r = rawBy.get(c.id) ?? rawBy.get(c.id.replace(/^CORE_/, ''));
    const tag = `${c.id} ${c.name}(${c.nameEn})`;
    if (r) {
      const cost = r.tags.COST ?? 0;
      if (c.cost !== cost && !c.costRule && !c.costIf && !c.costAuras) add('數值：費用不符', `${tag} 資料 ${c.cost} / 官方 ${cost}`);
      if (c.type === 'MINION') {
        if ((c.attack ?? 0) !== (r.tags.ATK ?? 0)) add('數值：攻擊力不符', `${tag} ${c.attack} / ${r.tags.ATK}`);
        if ((c.health ?? 0) !== (r.tags.HEALTH ?? 0)) add('數值：生命值不符', `${tag} ${c.health} / ${r.tags.HEALTH}`);
      }
      if (c.type === 'WEAPON') {
        if ((c.attack ?? 0) !== (r.tags.ATK ?? 0)) add('數值：武器攻擊不符', `${tag} ${c.attack} / ${r.tags.ATK}`);
        if ((c.health ?? 0) !== (r.tags.DURABILITY ?? r.tags.HEALTH ?? 0)) add('數值：武器耐久不符', `${tag} ${c.health} / ${r.tags.DURABILITY ?? r.tags.HEALTH}`);
      }
      if (c.type === 'MINION') {
        for (const [t, k] of KW) {
          if (r.tags[t] && !(c.keywords ?? []).includes(k) && !c.startOfGame) add(`關鍵字：缺少 ${k}`, tag);
          if (!r.tags[t] && (c.keywords ?? []).includes(k) && c.collectible) add(`關鍵字：多出 ${k}（可能是文字給的）`, tag);
        }
        if (r.tags.SPELLPOWER && !c.spellDamage) add('關鍵字：缺少法術傷害', tag);
        if (r.tags.OVERLOAD && !c.overload) add('關鍵字：缺少超載', tag);
      }
      if (r.tags.SECRET && !c.secret && c.type === 'SPELL') add('關鍵字：缺少奧秘', tag);
    }

    // 參照完整性
    const json = JSON.stringify({ a: c.abilities, h: c.handAbilities, au: c.auras, t: c.tokens, ch: c.chooseOne, hp: c.heroPower, q: c.quest, o: c.objective });
    for (const m of json.matchAll(/"(?:card|cardId|token)":"([A-Za-z0-9_]+)"/g)) {
      if (!by.has(m[1]) && !by.has(m[1].replace(/^CORE_/, ''))) add('參照：找不到的卡牌', `${tag} → ${m[1]}`);
    }
    for (const t of c.tokens ?? []) if (!by.has(t)) add('參照：tokens 找不到', `${tag} → ${t}`);
    for (const m of json.matchAll(/"fn":"([A-Za-z0-9_]+)"/g)) if (!customFns.has(m[1])) add('參照：custom fn 沒有實作', `${tag} → ${m[1]}`);
    if (c.type === 'MINION' && !(c.health > 0) && c.collectible) add('數值：手下生命值 ≤ 0', tag);

    // 文字與實作對照（只看可收集卡）
    if (c.collectible) {
      const text = strip(c.text);
      const BASE = new Set(['id', 'dbfId', 'name', 'nameEn', 'text', 'type', 'cardClass', 'rarity', 'set', 'cost', 'collectible', 'flavor', 'attack', 'health', 'races', 'core', 'classes', 'spellSchool', 'runes', 'keywords', 'target', 'tokens']);
      const BASIC_KW = new Set(['TAUNT', 'DIVINE_SHIELD', 'CHARGE', 'RUSH', 'WINDFURY', 'STEALTH', 'POISONOUS', 'LIFESTEAL', 'REBORN', 'ELUSIVE', 'TRADEABLE', 'ECHO']);
      const impl = Object.keys(c).some((k) => !BASE.has(k) && !(Array.isArray((c as C)[k]) && (c as C)[k].length === 0)) || (c.keywords ?? []).some((k: string) => !BASIC_KW.has(k));
      const kwText = text.replace(/[,，、 \n]|嘲諷|聖盾|衝鋒|突襲|風怒|潛行|劇毒|吸血|重生|扼殺|法術傷害\s*\+?\d*|超載[:：]?\s*\(\d+\)|可交易|迴響|磁力|奧秘|連擊|戰吼|亡語|發現|法術迸發|抉擇|吸取|二連發|復活|[：:]/g, '');
      if (!impl && kwText.length > 4 && c.type !== 'HERO') add('文字：有效果文字但沒有任何實作', `${tag}：${text.replace(/\n/g, ' ').slice(0, 60)}`);
      // 文字中的數字都應出現在實作裡
      const nums = [...text.matchAll(/\d+/g)].map((m) => m[0]).filter((n) => n !== String(c.cost));
      if (impl && nums.length) {
        const refs = new Set<string>([...JSON.stringify(c).matchAll(/"([A-Z]{2,}[A-Za-z0-9]*_[A-Za-z0-9_]+)"/g)].map((m) => m[1]));
        let blob = JSON.stringify(c);
        for (const id of refs) {
          const t = by.get(id);
          if (t && t.id !== c.id) blob += ` ${t.attack}/${t.health} ${t.cost} ${JSON.stringify(t.keywords ?? [])} ${JSON.stringify(t.abilities ?? [])}`;
        }
        const miss = nums.filter((n) => !(n === '50' && /0\.5/.test(JSON.stringify(c)))).filter((n) => !new RegExp(`(?<![0-9])${n}(?![0-9])`).test(blob.replace(/"text":"[^"]*"/, '').replace(/"flavor":"[^"]*"/, '')) );
        if (miss.length && c.type !== 'HERO' && (process.env.ALL || !/"fn":/.test(JSON.stringify(c)))) add('文字：文字中的數字沒出現在實作', `${tag} 缺 ${[...new Set(miss)].join(',')}：${text.replace(/\n/g, ' ').slice(0, 50)}`);
      }
    }
  }
  // 衍生物數值：文字中的「A/B」必須對得上召喚/獲得的衍生卡、本身數值或強化數值
  for (const c of list) {
    if (!c.collectible || c.type === 'HERO') continue;
    const text = strip(c.text).replace(/[+\-]\d+\/[+\-]\d+/g, '');
    const pairs = [...text.matchAll(/(?<![0-9+\-])(\d+)\/(\d+)(?![0-9])/g)].map((m) => `${m[1]}/${m[2]}`);
    if (!pairs.length) continue;
    const json = JSON.stringify(c);
    const have = new Set<string>([`${c.attack}/${c.health}`]);
    const addCard = (id: string, seen = new Set<string>()) => {
      const t = by.get(id);
      if (!t || seen.has(id)) return;
      seen.add(id);
      have.add(`${t.attack}/${t.health}`);
      for (const m of JSON.stringify(t.abilities ?? []).matchAll(/"([A-Z]{2,}[A-Za-z0-9]*_[A-Za-z0-9_]+)"/g)) addCard(m[1], seen);
    };
    for (const m of json.matchAll(/"([A-Z]{2,}[A-Za-z0-9]*_[A-Za-z0-9_]+)"/g)) addCard(m[1]);
    for (const m of json.matchAll(/"(?:atk|attack)":(\d+)[^{}]*?"(?:hp|health)":(\d+)/g)) have.add(`${m[1]}/${m[2]}`);
    for (const m of json.matchAll(/"setStats":\{"atk":(\d+),"hp":(\d+)/g)) have.add(`${m[1]}/${m[2]}`);
    for (const m of json.matchAll(/(\d+)\/(\d+)/g)) have.add(m[0]);
    const miss = pairs.filter((p) => !have.has(p));
    if (miss.length && !/"fn":/.test(json)) add('文字：衍生物數值對不上', `${c.id} ${c.name}(${c.nameEn}) 缺 ${miss.join(',')}：${strip(c.text).replace(/\n/g, ' ').slice(0, 50)}`);
  }
  for (const [k, v] of Object.entries(out).sort()) {
    console.log(`\n## ${k}（${v.length}）`);
    for (const s of v.slice(0, Number(process.env.N ?? 40))) console.log('  ' + s);
  }
})();
