// 觸發特效稽核：所有「會自己發動」的能力，發動時都要有 trigger 特效讓玩家看見
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../cards/registry';
import { Game } from './game';
import { EVENT_FLAGS } from './dungeon';
import type { Minion, PlayerId } from './state';

const FILLER = 'CS2_182';

function newGame(): Game {
  const deck = Array(30).fill(FILLER);
  const g = Game.create({ decks: [deck, deck], classes: ['MAGE', 'WARRIOR'], names: ['玩家', '電腦'], ai: [false, false], seed: 7, first: 0 });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function put(g: Game, cardId: string, pid: PlayerId): Minion {
  const m = g.makeMinion(pid, cardId);
  m.sleeping = false;
  g.s.players[pid].board.push(m);
  g.recalcAuras();
  return m;
}

const triggers = (g: Game) => g.s.fx.filter((f) => f.kind === 'trigger');

describe('能力發動的視覺回饋', () => {
  it('回合結束的能力發動時有 trigger 特效', () => {
    const def = ALL_CARDS().find(
      (c) => c.type === 'MINION' && c.collectible && c.abilities?.some((a) => a.on.k === 'turnEnd' && a.on.whose === 'mine' && !a.cond) && !c.abilities.some((a) => a.on.k === 'turnEnd' && a.cond),
    );
    expect(def).toBeTruthy();
    const g = newGame();
    const m = put(g, def!.id, 0);
    g.s.fx.length = 0;
    g.apply({ type: 'endTurn' });
    expect(triggers(g).some((f) => f.uid === m.uid && f.text === '回合結束')).toBe(true);
  });

  it('亡語觸發時有 trigger 特效', () => {
    const def = ALL_CARDS().find((c) => c.type === 'MINION' && c.collectible && c.abilities?.some((a) => a.on.k === 'deathrattle' && !a.cond));
    expect(def).toBeTruthy();
    const g = newGame();
    const m = put(g, def!.id, 0);
    g.s.fx.length = 0;
    m.hp = 0;
    g.apply({ type: 'endTurn' });
    expect(triggers(g).some((f) => f.text === '亡語！')).toBe(true);
  });

  it('吉的力量：第 5 個手下讓英雄能力發光', () => {
    const g = newGame();
    const p = g.s.players[0];
    p.zee = { minions: 4 };
    p.heroPower = { id: 'JAIL_800hp2', used: false, cost: 0 };
    p.mana = 10;
    p.maxMana = 10;
    const hc = g.newHandCard(FILLER);
    p.hand.push(hc);
    g.s.fx.length = 0;
    expect(g.apply({ type: 'play', handUid: hc.uid })).toBe(true);
    expect(triggers(g).some((f) => f.power && f.player === 0 && f.text?.includes('戰吼 ×2'))).toBe(true);
  });

  it('重複的相同觸發不會連續洗版', () => {
    const g = newGame();
    (g as unknown as { pulse: (...a: unknown[]) => void }).pulse(5, 'X', 0, '測試');
    (g as unknown as { pulse: (...a: unknown[]) => void }).pulse(5, 'X', 0, '測試');
    expect(triggers(g).filter((f) => f.text === '測試')).toHaveLength(1);
  });
});

// 這些旗標是「持續生效的規則修改」，沒有「發動」的瞬間，不需要閃光
const STATIC_FLAGS = new Set([
  'heroPowerDamage', 'heroPowerUnlimited', 'heroPowerDrawsFree', 'heroPowerBuffsWeapon', 'heroPowerTwice', 'heroPowerCost1',
  'misdirect', 'bodyguard', 'doubleHealing', 'ignoreTaunt', 'weaponAbsorbs', 'heroWindfury', 'healthToMax', 'extraDamage',
  'minionImmuneAlone', 'enemyTaunt', 'randomTargets', 'heroImmune', 'doubleCorpses', 'atkEqualsHealth', 'gorehowl',
  'heroPowerFreeze', 'weaponNoWear', 'noHeroPowers', 'elusiveOnOppTurn', 'immuneAttacking', 'infuseInDeck', 'secretsLocked',
  'footman', 'awakenOnPower', 'spellDamage2Damaged', 'keepBothRewinds', 'fireImmune', 'noAttackDamaged', 'heroPowerDouble',
  'heroPowerTargetMinions', 'allMisdirect', 'unlimitedAttacks', 'heroImmuneOnTurn', 'enemyNoHeal', 'bothSpellDamage2',
  'doubleHeroDamage', 'heroDamageCap1', 'heroElusive', 'ashWorm', 'takesDoubleDamage', 'heroPowerEffectTwice',
  'heroPowerFreeSmallHand', 'noTurnDraw', 'sindragosaArcane', 'petrified', 'osk', 'tarTyrant', 'heroPowerAdjacent',
  'rushImmune', 'redirectAttackers', 'adjacentBodyguard', 'heroPowerDamage2', 'malygosArcane', 'doubleSpellPower', 'rift',
]);
// 這些旗標在 game.ts 內有各自明確的 pulse（見 flag 觸發處）
const PULSED_IN_ENGINE = new Set([
  'lumia', 'anchorite', 'murmur', 'auchenai', 'talgath', 'rangari', 'mutalisk', 'harbinger', 'podling', 'orion',
  'stagSpirit', 'mirrorSpell', 'copyFrozen', 'natureFeeds', 'natureSummons', 'livingPlague', 'grazing',
]);

describe('旗標稽核', () => {
  it('每個被卡牌使用的旗標，不是有發動特效就是明列為持續效果', () => {
    const used = new Set<string>();
    for (const c of ALL_CARDS()) for (const f of c.flags ?? []) used.add(f);
    const unknown = [...used].filter((f) => !(f in EVENT_FLAGS) && !PULSED_IN_ENGINE.has(f) && !STATIC_FLAGS.has(f));
    expect(unknown, `這些旗標沒有發動特效也沒列為持續效果：${unknown.join(', ')}`).toEqual([]);
  });

  it('有發動特效的旗標一律有顯示文字', () => {
    for (const [k, v] of Object.entries(EVENT_FLAGS)) expect(v.length, k).toBeGreaterThan(0);
  });

  it('所有單機卡牌都能取得（確認稽核涵蓋全部）', () => {
    expect(ALL_CARDS().length).toBeGreaterThan(1000);
    expect(getCard(FILLER)).toBeTruthy();
  });
});

describe('夢魘之王薩維斯', () => {
  it('黑暗禮物賦予牌堆中的那張手下，它留在牌堆裡', () => {
    const deck = Array(30).fill('CS2_182');
    const g = Game.create({ decks: [deck, deck], classes: ['MAGE', 'WARRIOR'], names: ['玩家', '電腦'], ai: [false, false], seed: 3, first: 0 });
    g.apply({ type: 'mulligan', player: 0, replace: [] });
    g.apply({ type: 'mulligan', player: 1, replace: [] });
    const p = g.s.players[0];
    p.mana = 10;
    p.maxMana = 10;
    const hc = g.newHandCard('EDR_856');
    p.hand.push(hc);
    const deckBefore = p.deck.length;
    const handBefore = p.hand.length;
    g.apply({ type: 'play', handUid: hc.uid });
    if (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 });
    expect(p.deck.length).toBe(deckBefore);
    expect(p.hand.length).toBe(handBefore - 1);
    expect(p.deck.some((h) => h.gifted)).toBe(true);
  });
});
