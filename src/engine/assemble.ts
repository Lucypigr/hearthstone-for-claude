// ============================================================================
// 組裝（黑暗帝國霸業）：把一個手下加入手牌，再用另一個手下的上半段或下半段卡面取代它的同一段。
// 組裝卡池是卡牌資料中標記為可組裝的手下（約 250 張），卡面以「&」分成上下兩段：
// 上半段通常是觸發時機與條件（例如「戰吼：」「在你施放法術後，」），下半段是效果。
// 組裝出的手下保留原本手下的名稱、屬性值、消耗與種族。
// ============================================================================
import { ALL_CARDS, getCard, hasCard } from '../cards/registry';
import type { Ability, AssembleSplit, CardDef, Effect, Keyword, TargetExpr, TargetReq } from './types';

/** 關鍵字在卡面上的中文名稱（用來判斷關鍵字屬於上半段還是下半段） */
const KEYWORD_TEXT: Partial<Record<Keyword, string>> = {
  TAUNT: '嘲諷', DIVINE_SHIELD: '聖盾', CHARGE: '衝鋒', RUSH: '衝刺', WINDFURY: '風怒', STEALTH: '潛行',
  POISONOUS: '劇毒', LIFESTEAL: '生命竊取', REBORN: '重生', ELUSIVE: '飄渺',
};

export interface AssembledCard {
  base: string;
  donor: string;
  /** 用另一個手下取代的那一段 */
  half: 'top' | 'bottom';
}

const splitCache = new Map<string, AssembleSplit | null>();

/** 把效果中的「選擇的目標」換成同條件的隨機目標（觸發時機不是戰吼時無法讓玩家選擇） */
function randomizeChosen(effects: Effect[], req: TargetReq | undefined): Effect[] | null {
  let ok = true;
  const target = (t: TargetExpr): TargetExpr => (t.t === 'chosen' ? { t: 'random', filter: req?.filter ?? { type: 'character', side: 'enemy' }, count: 1 } : t);
  const walk = (list: Effect[]): Effect[] =>
    list.map((e) => {
      if (e.e === 'custom') {
        if (JSON.stringify(e).includes('chosen')) ok = false;
        return e;
      }
      const c = { ...e } as Record<string, unknown>;
      if (c.target && typeof c.target === 'object') c.target = target(c.target as TargetExpr);
      for (const k of ['then', 'else', 'effects']) if (Array.isArray(c[k])) c[k] = walk(c[k] as Effect[]);
      return c as unknown as Effect;
    });
  const out = walk(effects);
  return ok ? out : null;
}

/** 下半段是否用到「選擇的目標」 */
const usesChosen = (effects: Effect[]) => JSON.stringify(effects).includes('"t":"chosen"') || JSON.stringify(effects).includes('chosen');

/** 一張卡的上下半段效果；拆不開的卡回傳 null（不會出現在組裝卡池中） */
export function assembleSplitOf(def: CardDef): AssembleSplit | null {
  if (splitCache.has(def.id)) return splitCache.get(def.id)!;
  const out = computeSplit(def);
  splitCache.set(def.id, out);
  return out;
}

function computeSplit(def: CardDef): AssembleSplit | null {
  if (def.assembleSplit) return def.assembleSplit;
  if (!def.assembleText || def.type !== 'MINION') return null;
  const topText = def.assembleText[0];
  const abilities = def.abilities ?? [];
  const kwTop = (def.keywords ?? []).filter((k) => KEYWORD_TEXT[k] && topText.includes(KEYWORD_TEXT[k]!));
  const kwBottom = (def.keywords ?? []).filter((k) => !kwTop.includes(k));
  // 只有關鍵字、沒有觸發效果的卡無法拆開
  if (!abilities.length) return null;
  // 「戰吼與亡語：」兩個觸發時機共用同一段效果
  const sameEffects = abilities.every((a) => JSON.stringify(a.effects) === JSON.stringify(abilities[0].effects) && JSON.stringify(a.cond) === JSON.stringify(abilities[0].cond));
  let ab = abilities[0];
  let ons = abilities.map((a) => a.on);
  let extra: Ability[] | undefined;
  if (abilities.length > 1 && !sameEffects) {
    // 上半段寫著另一個完整的能力（例如「戰吼：召喚兩個分身。亡語：」）：最後出現的觸發時機屬於下半段
    if (abilities.length !== 2) return null;
    const last = Math.max(topText.lastIndexOf('戰吼'), topText.lastIndexOf('同類')) > topText.lastIndexOf('死亡之聲') ? 'play' : 'deathrattle';
    const i = abilities.findIndex((a) => a.on.k === last);
    if (i < 0) return null;
    ab = abilities[i];
    ons = [ab.on];
    extra = abilities.filter((_, j) => j !== i);
  }
  let cond = ab.cond;
  let effects = ab.effects;
  // 「若……，」寫在上半段：條件跟著上半段走
  if (effects.length === 1 && effects[0].e === 'cond' && !effects[0].else && /若|如果/.test(topText)) {
    cond = cond ? { c: 'all', conds: [cond, effects[0].cond] } : effects[0].cond;
    effects = effects[0].then;
  }
  return {
    top: { on: ons[0], ...(ons.length > 1 ? { ons } : {}), ...(cond ? { cond } : {}), ...(kwTop.length ? { keywords: kwTop } : {}), ...(extra ? { extra } : {}) },
    bottom: { effects, ...(def.target ? { target: def.target } : {}), ...(kwBottom.length ? { keywords: kwBottom } : {}) },
  };
}

/** 兩段能不能組在一起：觸發時機不是戰吼時，下半段的「選擇目標」要能改成隨機目標 */
export function canCombine(top: AssembleSplit['top'], bottom: AssembleSplit['bottom']): boolean {
  const ons = top.ons ?? [top.on];
  if (ons.every((o) => o.k === 'play')) return true;
  if (!bottom.target && !usesChosen(bottom.effects)) return true;
  return !!randomizeChosen(bottom.effects, bottom.target);
}

/** 組裝出的手下的卡面與能力 */
export function assembledDef(a: AssembledCard): CardDef {
  const base = getCard(a.base);
  const donor = hasCard(a.donor) ? getCard(a.donor) : base;
  const bs = assembleSplitOf(base);
  const ds = assembleSplitOf(donor);
  if (!bs || !ds) return base;
  const top = a.half === 'top' ? ds.top : bs.top;
  const bottom = a.half === 'bottom' ? ds.bottom : bs.bottom;
  const topText = (a.half === 'top' ? donor : base).assembleText![0];
  const bottomText = (a.half === 'bottom' ? donor : base).assembleText![1];
  const ons = top.ons ?? [top.on];
  const isPlay = ons.every((o) => o.k === 'play');
  const effects = isPlay ? bottom.effects : (randomizeChosen(bottom.effects, bottom.target) ?? bottom.effects);
  const abilities: Ability[] = [...(top.extra ?? []), ...ons.map((on) => ({ on, ...(top.cond ? { cond: top.cond } : {}), effects }))];
  const keywords = [...new Set([...(top.keywords ?? []), ...(bottom.keywords ?? [])])];
  // 法術傷害屬於寫著「法術傷害」的那一段
  const sdFrom = [a.half === 'top' ? donor : base, a.half === 'bottom' ? donor : base].find((d, i) => d.spellDamage && d.assembleText![i].includes('法術傷害'));
  return {
    ...base,
    text: `${topText}${bottomText}`,
    keywords,
    abilities,
    target: isPlay && bottom.target ? { ...bottom.target, optional: true } : undefined,
    spellDamage: sdFrom?.spellDamage,
    assembleSplit: { top, bottom },
  };
}

let poolCache: CardDef[] | null = null;

/** 組裝卡池（拆得開的可組裝手下，同名卡只算一張） */
export function assemblePool(): CardDef[] {
  if (poolCache) return poolCache;
  const seen = new Set<string>();
  poolCache = ALL_CARDS().filter((c) => {
    if (!c.collectible || c.type !== 'MINION' || !c.assembleText || seen.has(c.name)) return false;
    if (!assembleSplitOf(c)) return false;
    seen.add(c.name);
    return true;
  });
  return poolCache;
}

/** 可以拿來取代 base 的手下：消耗相同或最多多 (2)；9、10 費的手下可以用 8 ~ 10 費的 */
export function donorCostOk(base: CardDef, donor: CardDef): boolean {
  if (base.cost >= 9) return donor.cost >= 8 && donor.cost <= 10;
  return donor.cost >= base.cost && donor.cost <= base.cost + 2;
}
