// 產生 src/data/cards.json
// 用法：npm run cards
// 會自動下載 HearthSim CardDefs.xml（快取於 .cache/），解析所有可收藏卡牌的英文敘述，
// 只保留「效果能被引擎完整執行」的卡牌，並輸出繁體中文名稱 / 敘述。
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadCardDefsXml, parseCardDefs, type RawCard } from './carddefs';
import { parseCardText, Unsupported, type ParseEnv, type ParsedCard, type TokenQuery } from '../src/cards/parser';
import type { CardClass, CardDef, CardType, ChooseOneOption, Keyword, Race, Rarity } from '../src/engine/types';
import { OVERRIDES } from '../src/cards/overrides';
import { EXTRA_POWERS } from '../src/engine/heroes';

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
const RACE_WORDS: Record<string, number> = {
  beast: 20,
  beasts: 20,
  demon: 15,
  demons: 15,
  dragon: 24,
  dragons: 24,
  elemental: 18,
  elementals: 18,
  mech: 17,
  mechs: 17,
  murloc: 14,
  murlocs: 14,
  pirate: 23,
  pirates: 23,
  totem: 21,
  totems: 21,
  undead: 11,
  naga: 92,
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
  'CORRUPT',
  'DORMANT',
  'FORGE',
  'COLOSSAL',
  'TITAN',
  'EXCAVATE',
  'DREDGE',
  'MINIATURIZE',
  'QUICKDRAW',
  'SIGIL',
  'MANATHIRST',
  'OVERHEAL',
  'HERALD',
  'OBJECTIVE',
  'START_OF_GAME_KEYWORD',
  'IMBUE',
  'DISGUISED',
  'SHATTER',
  'KINDRED',
  'REWIND',
  'EMPOWER',
  'FINALE',
  'PREPARE',
  'LIBRAM',
  'HONORABLE_KILL',
  'DISCOVER_STUDIES_VISUAL',
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

  // 地點牌只收錄有手動定義（overrides）的
  const typeOf = (r: RawCard): CardType | undefined => TYPE_MAP[r.tags.CARDTYPE] ?? (r.tags.CARDTYPE === 39 && OVERRIDES[r.id] ? 'LOCATION' : undefined);
  const hasKw = (r: RawCard, k: Keyword) => KEYWORD_TAGS.some(([tag, kw]) => kw === k && r.tags[tag]);

  // ------------------------------------------------------------------ 衍生卡
  const tokenDefs = new Map<string, CardDef | null>();
  const tokenStack = new Set<string>();

  function makeEnv(rawSourceId: string): ParseEnv {
    // 核心系列的重印卡，衍生卡仍然掛在原本系列的卡牌 ID 之下
    const sourceId = rawSourceId.replace(/^CORE_/, '');
    const prefix = sourceId.split('_')[0];
    return {
      findToken(q: TokenQuery): string | null {
        const cands: RawCard[] = (byName.get(q.name.toLowerCase()) ?? []).filter((r) => {
          const t = typeOf(r);
          if (!t) return false;
          if (q.type && t !== q.type) return false;
          if (q.atk !== undefined && (r.tags.ATK ?? 0) !== q.atk) return false;
          if (q.hp !== undefined && (r.tags.HEALTH ?? 0) !== q.hp) return false;
          if (q.keywords && !q.keywords.every((k) => hasKw(r, k))) return false;
          if (!r.strs.CARDNAME?.zhTW) return false;
          return true;
        });
        if (!cands.length) {
          // 敘述裡的簡稱：「a 2/2 Zombie」→ 來源卡自己的衍生卡「Rampaging Zombie」
          const suffix = ' ' + q.name.toLowerCase();
          for (const r of raws) {
            if (!r.id.startsWith(sourceId) || r.tags.COLLECTIBLE) continue;
            if (!r.strs.CARDNAME?.enUS?.toLowerCase().endsWith(suffix) || !r.strs.CARDNAME?.zhTW) continue;
            const t = typeOf(r);
            if (!t || (q.type && t !== q.type)) continue;
            if (q.atk !== undefined && (r.tags.ATK ?? 0) !== q.atk) continue;
            if (q.hp !== undefined && (r.tags.HEALTH ?? 0) !== q.hp) continue;
            if (q.keywords && !q.keywords.every((k) => hasKw(r, k))) continue;
            cands.push(r);
          }
        }
        const raceWord = RACE_WORDS[q.name.toLowerCase()];
        if (!cands.length && raceWord !== undefined && q.atk !== undefined) {
          // 「召喚一個 4/2 的元素」：用種族 + 數值 + 來源卡 ID 前綴找衍生卡
          for (const r of raws) {
            if (!r.id.startsWith(sourceId) || typeOf(r) !== 'MINION' || r.tags.COLLECTIBLE) continue;
            if (r.tags.CARDRACE !== raceWord || (r.tags.ATK ?? 0) !== q.atk || (r.tags.HEALTH ?? 0) !== q.hp) continue;
            if (!r.strs.CARDNAME?.zhTW) continue;
            cands.push(r);
          }
        }
        if (!cands.length) return null;
        // 避開冒險模式 / 謎題 / 酒館戰棋等特殊版本的同名卡
        const odd = /Puzzle|_hb|^TB_|_TB|^BG|BGS_|Story|PVPDR|COPY|Brawl|Boss|Bacon|^THD_|Mission|_H\d|^[A-Z]+A_\d/i;
        const score = (r: RawCard) =>
          (r.id.startsWith(sourceId) ? 100 : 0) + (r.id.split('_')[0] === prefix ? 10 : 0) + (r.tags.COLLECTIBLE ? 2 : 0) - (odd.test(r.id) ? 50 : 0);
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
    // 英雄卡只收錄有手動定義（overrides）的
    const type: CardType | undefined = typeOf(r) ?? (r.tags.CARDTYPE === 3 && OVERRIDES[r.id] ? 'HERO' : undefined);
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
    if (type === 'MINION' || type === 'WEAPON') {
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
    if (r.tags.STARSHIP_PIECE) def.starshipPiece = true;
    if (r.tags.CASTS_WHEN_DRAWN) def.castsWhenDrawn = true;
    if (r.tags.STARSHIP) def.starship = true;
    if (r.tags.TERRAN) def.terran = true;
    // 死亡騎士的符文需求
    if (r.tags.COST_BLOOD || r.tags.COST_FROST || r.tags.COST_UNHOLY) {
      def.runes = {};
      if (r.tags.COST_BLOOD) def.runes.blood = r.tags.COST_BLOOD;
      if (r.tags.COST_FROST) def.runes.frost = r.tags.COST_FROST;
      if (r.tags.COST_UNHOLY) def.runes.unholy = r.tags.COST_UNHOLY;
    }
    // 雙生法術：施放後加入手牌的複製是官方的「ts」衍生卡
    if (r.tags.TWINSPELL) {
      const copy = buildToken(`${r.id}ts`);
      if (!copy) {
        if (collectible) failures.push({ id: r.id, name: r.strs.CARDNAME.enUS, set: r.tags.CARD_SET, reason: '雙生法術複製無法建立' });
        return null;
      }
      def.twinspellCopy = copy.id;
    }

    // 注入：友方手下死亡累積足夠次數後，手牌中的這張卡變成「注入」版本
    if (r.tags.INFUSE) {
      const tokenId = `${r.id.replace(/^CORE_/, '')}t`;
      // 覆寫可以自行指定注入版本（或沒有注入版本）
      const manual = OVERRIDES[r.id] && ('infuse' in OVERRIDES[r.id] || OVERRIDES[r.id].noInfuse);
      if (!manual && (!byId.get(tokenId) || !buildToken(tokenId))) {
        if (collectible) failures.push({ id: r.id, name: r.strs.CARDNAME.enUS, set: r.tags.CARD_SET, reason: `注入版本 ${tokenId} 不支援` });
        return null;
      }
      const raceWord = /Infuse \(@ (?:\|\d+\()?(\w+)/.exec(r.strs.CARDTEXT?.enUS ?? '')?.[1]?.replace(/s$/, '').toUpperCase();
      const infuse: NonNullable<CardDef['infuse']> = { n: r.tags.TAG_SCRIPT_DATA_NUM_1 ?? 3, into: tokenId };
      if (raceWord && ['BEAST', 'TOTEM', 'MURLOC', 'DEMON', 'UNDEAD', 'MECH', 'ELEMENTAL', 'DRAGON', 'PIRATE'].includes(raceWord)) infuse.race = (raceWord === 'MECH' ? 'MECHANICAL' : raceWord) as Race;
      if (!manual) def.infuse = infuse;
    }
    const ov = OVERRIDES[r.id];
    if (ov) {
      const { tokens, heroPower, ...rest } = ov;
      for (const t of tokens ?? []) {
        if (!buildToken(t)) throw new Error(`覆寫 ${r.id} 引用的衍生卡 ${t} 無法建立`);
      }
      const out: CardDef = { ...def, ...rest, heroPower: undefined };
      if (type === 'HERO') {
        const bp = byId.get(r.refs.HERO_POWER);
        if (!bp || !heroPower) throw new Error(`英雄卡 ${r.id} 缺少英雄能力`);
        out.armor = r.tags.ARMOR ?? 0;
        out.heroPower = {
          id: bp.id,
          name: clean(bp.strs.CARDNAME?.zhTW),
          text: clean(bp.strs.CARDTEXT?.zhTW),
          cost: bp.tags.COST ?? 0,
          ...heroPower,
        };
      } else delete out.heroPower;
      return out;
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
            // 優先使用與母卡同名、數值相同的變形後手下（例如「利爪德魯伊」的熊形態）
            const same = (byName.get(r.strs.CARDNAME.enUS.toLowerCase()) ?? []).find(
              (x) => x.id !== r.id && !x.tags.COLLECTIBLE && typeOf(x) === 'MINION' && x.tags.ATK === sub.tags.ATK && x.tags.HEALTH === sub.tags.HEALTH,
            );
            const into = same && buildToken(same.id) ? same.id : sub.id;
            if (!buildToken(into)) throw new Unsupported('二選一變形失敗');
            options.push({ id: sub.id, name: clean(sub.strs.CARDNAME.zhTW), text: clean(sub.strs.CARDTEXT?.zhTW), abilities: [], transformInto: into });
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
      if (!tokenDefs.get(t) && !buildToken(t)) {
        if (collectible) failures.push({ id: r.id, name: r.strs.CARDNAME.enUS, set: r.tags.CARD_SET, reason: `衍生卡 ${t} 不支援` });
        return null;
      }
    }
    if (type === 'SPELL' && parsed.keywords.length && !parsed.keywords.every((k) => k === 'LIFESTEAL' || k === 'TRADEABLE' || k === 'ECHO' || k === 'TWINSPELL')) {
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
    if (parsed.starshipPiece) def.starshipPiece = true;
    if (parsed.noCorpse) def.noCorpse = true;
    if (parsed.castsWhenDrawn) def.castsWhenDrawn = true;
    if (parsed.costsHealth) def.costsHealth = true;
    if (parsed.costsCorpses) def.costsCorpses = true;
    return def;
  }

  // ------------------------------------------------------------------ 可收藏卡
  const collectibles = raws.filter(
    (r) =>
      r.tags.COLLECTIBLE &&
      (typeOf(r) || (r.tags.CARDTYPE === 3 && OVERRIDES[r.id])) &&
      (!EXCLUDED_SETS.has(r.tags.CARD_SET) || (r.tags.CARD_SET === 1941 && !!OVERRIDES[r.id])) &&
      CLASS_MAP[r.tags.CLASS ?? 12],
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
  /** 牌組代碼用：同名卡的所有 dbfId → 收錄的卡牌 ID */
  const aliases: Record<number, string> = {};
  let groupsTotal = 0;
  for (const group of groups.values()) {
    groupsTotal++;
    group.sort((a, b) => pref(a) - pref(b) || a.dbf - b.dbf);
    for (const r of group) {
      const def = buildDef(r, true);
      if (def) {
        // 核心系列收錄的卡（有 CORE_ 版本）屬於標準模式
        if (group.some((x) => /^core_/i.test(x.id) && [1810, 1637].includes(x.tags.CARD_SET))) def.core = true;
        cards.push(def);
        for (const other of group) if (other.id !== def.id) aliases[other.dbf] = def.id;
        break;
      }
    }
  }

  // ------------------------------------------------------------------ 英雄與基本英雄能力用到的卡
  const extra = ['GAME_005', 'CS2_101t', 'CS2_082', 'CS2_050', 'CS2_051', 'NEW1_009', 'CS2_052', 'HERO_11bpt'];
  // 強化後的英雄能力（審判者瑪瑞爾）用到的卡
  extra.push('AT_132_ROGUEt', 'HERO_11bp2t');
  // 任務獎勵的英雄能力用到的卡
  extra.push('ULD_326t', 'ULD_711t');
  // 各職業的星艦本體
  extra.push('GDB_100t2', 'GDB_100t4', 'GDB_100t5', 'GDB_100t6', 'GDB_100t7', 'GDB_100t8', 'GDB_100t9', 'SC_999t');
  for (const id of extra) {
    const def = buildToken(id);
    if (!def) throw new Error(`必要衍生卡 ${id} 解析失敗`);
  }

  const heroes: Record<string, { hero: string; heroDbf: number; name: string; power: { id: string; name: string; text: string; cost: number } }> = {};
  for (let i = 1; i <= 11; i++) {
    const heroId = `HERO_${String(i).padStart(2, '0')}`;
    const h = byId.get(heroId)!;
    const bp = byId.get(`${heroId}bp`)!;
    const cls = CLASS_MAP[h.tags.CLASS];
    heroes[cls] = {
      hero: heroId,
      heroDbf: h.dbf,
      name: clean(h.strs.CARDNAME.zhTW),
      power: {
        id: bp.id,
        name: clean(bp.strs.CARDNAME.zhTW),
        text: clean(bp.strs.CARDTEXT.zhTW),
        cost: bp.tags.COST ?? 2,
      },
    };
  }

  // 基本職業以外的英雄能力：名稱、敘述與消耗（效果定義在 src/engine/heroes.ts）
  const powers: Record<string, { id: string; name: string; text: string; cost: number }> = {};
  for (const id of Object.keys(EXTRA_POWERS)) {
    const bp = byId.get(id);
    if (!bp?.strs.CARDNAME?.zhTW) throw new Error(`英雄能力 ${id} 不存在`);
    powers[id] = { id, name: clean(bp.strs.CARDNAME.zhTW), text: clean(bp.strs.CARDTEXT?.zhTW), cost: bp.tags.COST ?? 0 };
  }
  // 英雄能力也收錄成（不可收藏的）卡，讓「發現一個英雄能力」可以顯示
  const basicPowers = Object.values(heroes).map((h) => h.power);
  const powerCards: CardDef[] = [...Object.values(powers), ...basicPowers].map((pw) => {
    const bp = byId.get(pw.id)!;
    return { id: pw.id, dbfId: bp.dbf, name: pw.name, nameEn: clean(bp.strs.CARDNAME.enUS), text: pw.text, type: 'SPELL', cardClass: CLASS_MAP[bp.tags.CLASS ?? 12] ?? 'NEUTRAL', rarity: 'FREE', set: bp.tags.CARD_SET ?? 0, cost: pw.cost, collectible: false };
  });

  // 所有英雄（含造型）的 dbfId → 職業，讓匯入的牌組代碼可以判斷職業
  const heroSkins: Record<number, string> = {};
  for (const r of raws) {
    if (r.tags.CARDTYPE === 3 && r.tags.COLLECTIBLE && CLASS_MAP[r.tags.CLASS] && CLASS_MAP[r.tags.CLASS] !== 'NEUTRAL') heroSkins[r.dbf] = CLASS_MAP[r.tags.CLASS];
  }

  const tokens = [...tokenDefs.values()].filter((d): d is CardDef => !!d && !cards.some((c) => c.id === d.id));
  const all = [...cards, ...tokens.map((t) => ({ ...t, collectible: false })), ...powerCards.filter((c) => !cards.some((x) => x.id === c.id) && !tokens.some((x) => x.id === c.id))];

  // ------------------------------------------------------------------ 輸出
  mkdirSync('src/data', { recursive: true });
  writeFileSync(OUT, JSON.stringify({ build: /build="(\d+)"/.exec(xml)?.[1], heroes, powers, heroSkins, aliases, cards: all }));

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
