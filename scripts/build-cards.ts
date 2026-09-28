// 產生 src/data/cards.json
// 用法：npm run cards
// 會自動下載 HearthSim CardDefs.xml（快取於 .cache/），解析所有可收藏卡牌的英文敘述，
// 只保留「效果能被引擎完整執行」的卡牌，並輸出繁體中文名稱 / 敘述。
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadCardDefsXml, parseCardDefs, type RawCard } from './carddefs';
import { parseCardText, Unsupported, type ParseEnv, type ParsedCard, type TokenQuery } from '../src/cards/parser';
import type { CardClass, CardDef, CardType, ChooseOneOption, Keyword, Race, Rarity } from '../src/engine/types';
import { OVERRIDES } from '../src/cards/overrides';

const CACHE = '.cache/CardDefs.xml';
const OUT = 'src/data/cards.json';

const CLASS_MAP: Record<number, CardClass> = {
  1: 'DEATHKNIGHT',
  2: 'DRUID',
  3: 'HUNTER',
  4: 'MAGE',
  5: 'PALADIN',
  6: 'PRIEST',
  7: 'ROGUE',
  8: 'SHAMAN',
  9: 'WARLOCK',
  10: 'WARRIOR',
  12: 'NEUTRAL',
  14: 'DEMONHUNTER',
};
const TYPE_MAP: Record<number, CardType> = { 4: 'MINION', 5: 'SPELL', 7: 'WEAPON' };
const RARITY_MAP: Record<number, Rarity> = { 1: 'COMMON', 2: 'FREE', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY' };
const RACE_MAP: Record<number, Race> = {
  2: 'DRAENEI',
  11: 'UNDEAD',
  14: 'MURLOC',
  15: 'DEMON',
  17: 'MECHANICAL',
  18: 'ELEMENTAL',
  20: 'BEAST',
  21: 'TOTEM',
  23: 'PIRATE',
  24: 'DRAGON',
  26: 'ALL',
  43: 'QUILBOAR',
  92: 'NAGA',
};
const SCHOOL_MAP: Record<number, string> = { 1: 'ARCANE', 2: 'FIRE', 3: 'FROST', 4: 'NATURE', 5: 'HOLY', 6: 'SHADOW', 7: 'FEL' };
const KEYWORD_TAGS: [string, Keyword][] = [
  ['TAUNT', 'TAUNT'],
  ['DIVINE_SHIELD', 'DIVINE_SHIELD'],
  ['CHARGE', 'CHARGE'],
  ['RUSH', 'RUSH'],
  ['WINDFURY', 'WINDFURY'],
  ['STEALTH', 'STEALTH'],
  ['POISONOUS', 'POISONOUS'],
  ['LIFESTEAL', 'LIFESTEAL'],
  ['REBORN', 'REBORN'],
];

/** 不收錄的系列：英雄造型、懷舊（與經典重複）、事件 */
const EXCLUDED_SETS = new Set([17, 1646, 1941, 1994]);

/** 引擎無法支援的機制（有這些標籤的卡一律略過） */
const UNSUPPORTED_TAGS = [
  'QUEST',
  'SIDE_QUEST',
  'QUESTLINE',
  'MAGNETIC',
  'ECHO',
  'CORRUPT',
  'DORMANT',
  'INFUSE',
  'FORGE',
  'COLOSSAL',
  'TITAN',
  'EXCAVATE',
  'DREDGE',
  'MINIATURIZE',
  'STARSHIP_PIECE',
  'QUICKDRAW',
  'SIGIL',
  'TWINSPELL',
  'MANATHIRST',
  'CORPSE_SPENDER',
  'OVERHEAL',
  'HERALD',
  'OBJECTIVE',
  'START_OF_GAME_KEYWORD',
  'CASTS_WHEN_DRAWN',
  'IMBUE',
  'DISGUISED',
  'SHATTER',
  'KINDRED',
  'REWIND',
  'EMPOWER',
  'FINALE',
  'PREPARE',
  'LIBRAM',
  'JADE_LOTUS',
  'HONORABLE_KILL',
  'OVERKILL',
  'DISCOVER_STUDIES_VISUAL',
  'COST_BLOOD',
  'COST_FROST',
  'COST_UNHOLY',
  'DECK_RULE_MOD_DECK_SIZE',
  'TOURIST',
  'FABLED',
];

function clean(s: string | undefined): string {
  return (s ?? '').replace(/\r/g, '').trim();
}

async function main() {
  const xml = await loadCardDefsXml(CACHE);
  const raws = parseCardDefs(xml);
  console.log(`CardDefs.xml：共 ${raws.length} 筆實體`);

  const byId = new Map<string, RawCard>();
  const byName = new Map<string, RawCard[]>();
  for (const r of raws) {
    byId.set(r.id, r);
    const en = r.strs.CARDNAME?.enUS?.toLowerCase();
    if (!en) continue;
    if (!byName.has(en)) byName.set(en, []);
    byName.get(en)!.push(r);
  }

  const typeOf = (r: RawCard) => TYPE_MAP[r.tags.CARDTYPE];
  const hasKw = (r: RawCard, k: Keyword) => KEYWORD_TAGS.some(([tag, kw]) => kw === k && r.tags[tag]);

  // ------------------------------------------------------------------ 衍生卡
  const tokenDefs = new Map<string, CardDef | null>();
  const tokenStack = new Set<string>();

  function makeEnv(sourceId: string): ParseEnv {
    const prefix = sourceId.split('_')[0];
    return {
      findToken(q: TokenQuery): string | null {
        const cands = (byName.get(q.name.toLowerCase()) ?? []).filter((r) => {
          const t = typeOf(r);
          if (!t) return false;
          if (q.type && t !== q.type) return false;
          if (q.atk !== undefined && (r.tags.ATK ?? 0) !== q.atk) return false;
          if (q.hp !== undefined && (r.tags.HEALTH ?? 0) !== q.hp) return false;
          if (q.keywords && !q.keywords.every((k) => hasKw(r, k))) return false;
          if (!r.strs.CARDNAME?.zhTW) return false;
          return true;
        });
        if (!cands.length) return null;
        const score = (r: RawCard) =>
          (r.id.startsWith(sourceId) ? 100 : 0) + (r.id.split('_')[0] === prefix ? 10 : 0) + (r.tags.COLLECTIBLE ? 0 : 1);
        cands.sort((a, b) => score(b) - score(a) || a.dbf - b.dbf);
        for (const c of cands) {
          if (buildToken(c.id)) return c.id;
        }
        return null;
      },
    };
  }

  function buildToken(id: string): CardDef | null {
    if (tokenDefs.has(id)) return tokenDefs.get(id)!;
    if (tokenStack.has(id)) return null;
    const r = byId.get(id);
    if (!r) return null;
    tokenStack.add(id);
    const def = buildDef(r, false);
    tokenStack.delete(id);
    tokenDefs.set(id, def);
    return def;
  }

  // ------------------------------------------------------------------ 建立 CardDef
  const failures: { id: string; name: string; set: number; reason: string }[] = [];

  function buildDef(r: RawCard, collectible: boolean): CardDef | null {
    const type = typeOf(r);
    if (!type) return null;
    const cls = CLASS_MAP[r.tags.CLASS ?? 12] ?? (collectible ? undefined : 'NEUTRAL');
    if (!cls) return null;
    const nameZh = clean(r.strs.CARDNAME?.zhTW);
    if (!nameZh) return null;
    for (const tag of UNSUPPORTED_TAGS) {
      if (r.tags[tag] && !OVERRIDES[r.id]) {
        if (collectible) failures.push({ id: r.id, name: r.strs.CARDNAME.enUS, set: r.tags.CARD_SET, reason: `機制 ${tag}` });
        return null;
      }
    }
    const def: CardDef = {
      id: r.id,
      dbfId: r.dbf,
      name: nameZh,
      nameEn: clean(r.strs.CARDNAME?.enUS),
      text: clean(r.strs.CARDTEXT?.zhTW),
      type,
      cardClass: cls,
      rarity: RARITY_MAP[r.tags.RARITY] ?? 'COMMON',
      set: r.tags.CARD_SET ?? 0,
      cost: r.tags.COST ?? 0,
      collectible,
    };
    const flavor = clean(r.strs.FLAVORTEXT?.zhTW);
    if (flavor && collectible) def.flavor = flavor;
    if (type !== 'SPELL') {
      def.attack = r.tags.ATK ?? 0;
      def.health = r.tags.HEALTH ?? r.tags.DURABILITY ?? 1;
    }
    const race = RACE_MAP[r.tags.CARDRACE];
    if (race) def.races = [race];
    const school = SCHOOL_MAP[r.tags.SPELL_SCHOOL];
    if (school) def.spellSchool = school;
    if (r.tags.MULTIPLE_CLASSES) {
      const classes: CardClass[] = [];
      for (const [k, v] of Object.entries(CLASS_MAP)) {
        if (r.tags.MULTIPLE_CLASSES & (1 << (Number(k) - 1))) classes.push(v);
      }
      if (classes.length) def.classes = classes;
    }

    const ov = OVERRIDES[r.id];
    if (ov) {
      const { tokens, ...rest } = ov;
      for (const t of tokens ?? []) {
        if (!buildToken(t)) throw new Error(`覆寫 ${r.id} 引用的衍生卡 ${t} 無法建立`);
      }
      return { ...def, ...rest };
    }

    let parsed: ParsedCard;
    try {
      if (r.tags.CHOOSE_ONE) {
        parsed = { keywords: [], abilities: [], auras: [], tokens: [] };
        const options: ChooseOneOption[] = [];
        for (const suffix of ['a', 'b']) {
          const sub = byId.get(r.id + suffix);
          if (!sub) throw new Unsupported('找不到二選一子卡');
          const subType = typeOf(sub);
          if (subType === 'MINION') {
            const tok = buildToken(sub.id);
            if (!tok) throw new Unsupported('二選一變形失敗');
            options.push({ id: sub.id, name: clean(sub.strs.CARDNAME.zhTW), text: clean(sub.strs.CARDTEXT?.zhTW), abilities: [], transformInto: sub.id });
            continue;
          }
          const sp = parseCardText({ textEn: sub.strs.CARDTEXT?.enUS ?? '', cardType: 'SPELL' }, makeEnv(r.id));
          if (sp.keywords.length || sp.auras.length || sp.secret) throw new Unsupported('二選一子卡含靜態能力');
          if (sp.target && type === 'MINION') sp.target.optional = true;
          options.push({
            id: sub.id,
            name: clean(sub.strs.CARDNAME.zhTW),
            text: clean(sub.strs.CARDTEXT?.zhTW),
            abilities: sp.abilities,
            target: sp.target,
          });
        }
        def.chooseOne = options;
        // 二選一手下本身的關鍵字仍依標籤
        for (const [tag, kw] of KEYWORD_TAGS) if (r.tags[tag]) parsed.keywords.push(kw);
      } else {
        parsed = parseCardText({ textEn: r.strs.CARDTEXT?.enUS ?? '', cardType: type }, makeEnv(r.id));
      }
    } catch (e) {
      if (e instanceof Unsupported) {
        if (collectible) failures.push({ id: r.id, name: r.strs.CARDNAME.enUS, set: r.tags.CARD_SET, reason: e.message });
        return null;
      }
      throw e;
    }
    // 衍生卡的解析失敗 → 母卡也不收錄
    for (const t of parsed.tokens) {
      if (!tokenDefs.get(t)) {
        if (collectible) failures.push({ id: r.id, name: r.strs.CARDNAME.enUS, set: r.tags.CARD_SET, reason: `衍生卡 ${t} 不支援` });
        return null;
      }
    }
    if (type === 'SPELL' && parsed.keywords.length && !parsed.keywords.every((k) => k === 'LIFESTEAL' || k === 'TRADEABLE')) {
      if (collectible) failures.push({ id: r.id, name: r.strs.CARDNAME.enUS, set: r.tags.CARD_SET, reason: '法術含手下關鍵字' });
      return null;
    }
    if (parsed.keywords.length) def.keywords = parsed.keywords;
    if (parsed.abilities.length) def.abilities = parsed.abilities;
    if (parsed.auras.length) def.auras = parsed.auras;
    if (parsed.target) def.target = parsed.target;
    if (parsed.spellDamage) def.spellDamage = parsed.spellDamage;
    if (parsed.overload) def.overload = parsed.overload;
    if (parsed.enrage) def.enrage = parsed.enrage;
    if (parsed.secret) def.secret = true;
    if (parsed.costRule) def.costRule = parsed.costRule;
    return def;
  }

  // ------------------------------------------------------------------ 可收藏卡
  const collectibles = raws.filter(
    (r) => r.tags.COLLECTIBLE && typeOf(r) && !EXCLUDED_SETS.has(r.tags.CARD_SET) && CLASS_MAP[r.tags.CLASS ?? 12],
  );
  // 同名卡去重（核心 / 傳統 / 原版會重複），優先原始版本
  const groups = new Map<string, RawCard[]>();
  for (const r of collectibles) {
    const key = `${r.strs.CARDNAME?.enUS}|${r.tags.CARDTYPE}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const pref = (r: RawCard) => (r.id.startsWith('CORE_') ? 1 : 0) + (r.id.startsWith('VAN_') ? 2 : 0);

  const cards: CardDef[] = [];
  let groupsTotal = 0;
  for (const group of groups.values()) {
    groupsTotal++;
    group.sort((a, b) => pref(a) - pref(b) || a.dbf - b.dbf);
    for (const r of group) {
      const def = buildDef(r, true);
      if (def) {
        cards.push(def);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ 英雄與基本英雄能力用到的卡
  const extra = ['GAME_005', 'CS2_101t', 'CS2_082', 'CS2_050', 'CS2_051', 'NEW1_009', 'CS2_052', 'HERO_11bpt'];
  for (const id of extra) {
    const def = buildToken(id);
    if (!def) throw new Error(`必要衍生卡 ${id} 解析失敗`);
  }

  const heroes: Record<string, { hero: string; name: string; power: { id: string; name: string; text: string; cost: number } }> = {};
  for (let i = 1; i <= 11; i++) {
    const heroId = `HERO_${String(i).padStart(2, '0')}`;
    const h = byId.get(heroId)!;
    const bp = byId.get(`${heroId}bp`)!;
    const cls = CLASS_MAP[h.tags.CLASS];
    heroes[cls] = {
      hero: heroId,
      name: clean(h.strs.CARDNAME.zhTW),
      power: {
        id: bp.id,
        name: clean(bp.strs.CARDNAME.zhTW),
        text: clean(bp.strs.CARDTEXT.zhTW),
        cost: bp.tags.COST ?? 2,
      },
    };
  }

  const tokens = [...tokenDefs.values()].filter((d): d is CardDef => !!d && !cards.some((c) => c.id === d.id));
  const all = [...cards, ...tokens.map((t) => ({ ...t, collectible: false }))];

  // ------------------------------------------------------------------ 輸出
  mkdirSync('src/data', { recursive: true });
  writeFileSync(OUT, JSON.stringify({ build: /build="(\d+)"/.exec(xml)?.[1], heroes, cards: all }));

  const bySet = new Map<number, { ok: number; total: number }>();
  for (const group of groups.values()) {
    const s = group[0].tags.CARD_SET;
    if (!bySet.has(s)) bySet.set(s, { ok: 0, total: 0 });
    bySet.get(s)!.total++;
  }
  for (const c of cards) {
    const key = [...groups.entries()].find(([, g]) => g.some((r) => r.id === c.id))![1][0].tags.CARD_SET;
    bySet.get(key)!.ok++;
  }
  const reasons = new Map<string, number>();
  for (const f of failures) {
    const k = f.reason.replace(/：.*$/, '').replace(/\d+/g, 'N').slice(0, 60);
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }
  mkdirSync('.cache', { recursive: true });
  writeFileSync(
    '.cache/unsupported.txt',
    failures.map((f) => `${f.id}\t${f.set}\t${f.name}\t${f.reason}`).join('\n'),
  );
  console.log(`可收藏卡（去重後）：${groupsTotal}，已支援：${cards.length}，衍生卡：${tokens.length}`);
  console.log('各系列支援數：', [...bySet.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => `${s}:${v.ok}/${v.total}`).join(' '));
  console.log('主要不支援原因：');
  for (const [k, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n}\t${k}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
