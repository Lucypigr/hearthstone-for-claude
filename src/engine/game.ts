// ============================================================================
// 對戰引擎
// - 所有規則在這裡執行；UI 與 AI 只透過 Game.apply(action) 互動。
// - 效果以 generator 執行，遇到「發現」這類需要玩家選擇的情況會暫停（yield），
//   等 UI 呼叫 choose() 後再繼續。
// ============================================================================
import { cardClasses, getCard, HEROES, poolCards } from '../cards/registry';
import { BASIC_TOTEMS, HERO_POWERS } from './heroes';
import { nextRandom, pick, randomInt, shuffle } from './rng';
import {
  MAX_BOARD,
  MAX_HAND,
  MAX_MANA,
  MAX_SECRETS,
  MAX_TURNS,
  type Action,
  type ChoiceRequest,
  type Fx,
  type GameState,
  type HandCard,
  type Hero,
  type Minion,
  type PlayerId,
  type PlayerState,
  type Weapon,
} from './state';
import type {
  Ability,
  Amount,
  CardClass,
  CardDef,
  CardType,
  Condition,
  DynAmount,
  Effect,
  Filter,
  Keyword,
  Pool,
  Race,
  SecretEvent,
  Side,
  TargetExpr,
  TargetReq,
  Trig,
} from './types';

type Gen<T = void> = Generator<ChoiceRequest, T, number>;
type Char = Minion | Hero;

export function isHero(c: Char): c is Hero {
  return (c as Hero).heroClass !== undefined;
}

export const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

interface ItRef {
  kind: 'char' | 'hand';
  uid: number;
}

interface Ctx {
  controller: PlayerId;
  sourceUid: number | null;
  sourceCardId: string;
  /** 已死亡來源的快照（亡語用） */
  sourceSnapshot?: Minion;
  isSpell: boolean;
  isHeroPower?: boolean;
  chosen: number | null;
  it: ItRef | null;
  itCardId?: string;
  eventAmount: number;
  combo: boolean;
  outcast: boolean;
  position?: number;
  lifesteal: boolean;
}

interface Ev {
  k: Trig['k'];
  player: PlayerId;
  subject?: number;
  subjectKind?: 'char' | 'hand';
  amount?: number;
  cardType?: CardType;
  races?: Race[];
  after?: boolean;
  isHero?: boolean;
  cardId?: string;
}

interface DmgSource {
  owner: PlayerId;
  uid: number | null;
  poisonous?: boolean;
  lifesteal?: boolean;
  freeze?: boolean;
}

interface AttackState {
  attacker: number;
  defender: number;
}

export interface NewGameOptions {
  decks: [string[], string[]];
  classes: [Exclude<CardClass, 'NEUTRAL'>, Exclude<CardClass, 'NEUTRAL'>];
  names: [string, string];
  ai: [boolean, boolean];
  seed?: number;
  first?: PlayerId;
}

export type Chooser = (state: GameState, req: ChoiceRequest) => number;

/** 預設的自動選擇：挑費用最高的選項 */
export const defaultChooser: Chooser = (_s, req) => {
  let best = 0;
  let bestScore = -1;
  req.options.forEach((id, i) => {
    const c = getCard(id);
    const score = c.cost + (c.rarity === 'LEGENDARY' ? 2 : c.rarity === 'EPIC' ? 1 : 0);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
};

export class Game {
  s: GameState;
  private pending: Gen | null = null;
  private chooser: Chooser;
  /** 模擬模式：所有選擇自動決定 */
  private autoAll: boolean;
  private spellCountered = false;
  private currentAttack: AttackState | null = null;
  private emitDepth = 0;
  private steps = 0;

  constructor(state: GameState, opts: { chooser?: Chooser; autoAll?: boolean } = {}) {
    this.s = state;
    this.chooser = opts.chooser ?? defaultChooser;
    this.autoAll = opts.autoAll ?? false;
  }

  // ==========================================================================
  // 建立對戰
  // ==========================================================================

  static create(o: NewGameOptions): Game {
    const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
    const s: GameState = {
      players: [null, null] as unknown as [PlayerState, PlayerState],
      current: 0,
      first: 0,
      turn: 0,
      phase: 'mulligan',
      winner: null,
      nextUid: 1,
      playCounter: 0,
      rng: seed,
      log: [],
      fx: [],
      fxSeq: 0,
      pendingChoice: null,
      deathsThisTurn: 0,
    };
    const game = new Game(s);
    for (const id of [0, 1] as PlayerId[]) {
      const cls = o.classes[id];
      const heroInfo = HEROES[cls];
      const hero: Hero = {
        uid: game.uid(),
        owner: id,
        cardId: heroInfo.hero,
        heroClass: cls,
        hp: 30,
        maxHp: 30,
        armor: 0,
        tempAtk: 0,
        frozen: false,
        frozenTurn: 0,
        attacks: 0,
        immune: false,
      };
      s.players[id] = {
        id,
        name: o.names[id],
        heroClass: cls,
        hero,
        weapon: null,
        heroPower: { id: heroInfo.power.id, used: false, cost: heroInfo.power.cost },
        mana: 0,
        maxMana: 0,
        overloadOwed: 0,
        overloadLocked: 0,
        deck: o.decks[id].map((cardId) => game.newHandCard(cardId)),
        hand: [],
        board: [],
        secrets: [],
        graveyard: [],
        fatigue: 0,
        cardsPlayedThisTurn: 0,
        spellsCastThisGame: 0,
        heroAttackedThisTurn: false,
        elementalLastTurn: false,
        elementalThisTurn: false,
        mulliganDone: false,
        heroPowersUsed: 0,
        drawnThisTurn: 0,
        summonedRaces: {},
        ai: o.ai[id],
      };
      shuffle(s, s.players[id].deck);
    }
    s.first = o.first ?? (nextRandom(s) < 0.5 ? 0 : 1);
    s.current = s.first;
    const second = opp(s.first);
    for (let i = 0; i < 3; i++) game.drawRaw(s.players[s.first]);
    for (let i = 0; i < 4; i++) game.drawRaw(s.players[second]);
    game.log(null, `${s.players[s.first].name}先攻`);
    return game;
  }

  // ==========================================================================
  // 公開 API
  // ==========================================================================

  apply(action: Action): boolean {
    if (this.s.phase === 'over') return false;
    if (action.type === 'concede') {
      this.endGame(opp(action.player));
      this.log(action.player, `${this.s.players[action.player].name}投降了`);
      return true;
    }
    if (action.type === 'choose') {
      if (!this.pending || !this.s.pendingChoice) return false;
      if (action.index < 0 || action.index >= this.s.pendingChoice.options.length) return false;
      const gen = this.pending;
      this.pending = null;
      this.s.pendingChoice = null;
      this.drive(gen, action.index);
      return true;
    }
    if (this.s.pendingChoice) return false;
    if (action.type === 'mulligan') return this.mulligan(action.player, action.replace);
    if (this.s.phase !== 'play') return false;
    const check = this.check(action);
    if (!check.ok) return false;
    this.steps = 0;
    switch (action.type) {
      case 'play':
        this.drive(this.wrap(this.playCard(action.handUid, action.target, action.position, action.option)));
        return true;
      case 'attack':
        this.drive(this.wrap(this.doAttack(action.attacker, action.target)));
        return true;
      case 'heroPower':
        this.drive(this.wrap(this.useHeroPower(action.target)));
        return true;
      case 'trade':
        this.drive(this.wrap(this.trade(action.handUid)));
        return true;
      case 'endTurn':
        this.drive(this.wrap(this.endTurn()));
        return true;
    }
    return false;
  }

  /** 檢查動作是否合法 */
  check(action: Action): { ok: boolean; reason?: string } {
    const s = this.s;
    if (s.phase !== 'play') return { ok: false, reason: '對戰尚未開始' };
    if (s.pendingChoice) return { ok: false, reason: '請先做出選擇' };
    const p = s.players[s.current];
    switch (action.type) {
      case 'endTurn':
        return { ok: true };
      case 'play': {
        const r = this.canPlay(action.handUid, action.option);
        if (!r.ok) return r;
        const req = this.playTargetReq(action.handUid, action.option);
        if (req) {
          const valid = this.validTargets(req, s.current, this.cardIsSpell(action.handUid));
          if (valid.length) {
            if (action.target === undefined || !valid.includes(action.target)) return { ok: false, reason: '請選擇目標' };
          } else if (!req.optional) return { ok: false, reason: '沒有可選擇的目標' };
        }
        return { ok: true };
      }
      case 'attack': {
        if (!this.canAttack(action.attacker)) return { ok: false, reason: '無法攻擊' };
        if (!this.attackTargets(action.attacker).includes(action.target)) return { ok: false, reason: '無效的攻擊目標' };
        return { ok: true };
      }
      case 'heroPower': {
        if (!this.canHeroPower()) return { ok: false, reason: '無法使用英雄能力' };
        const def = HERO_POWERS[p.heroClass];
        if (def.target) {
          const valid = this.validTargets(def.target, s.current, true);
          if (action.target === undefined || !valid.includes(action.target)) return { ok: false, reason: '請選擇目標' };
        }
        return { ok: true };
      }
      case 'trade': {
        const hc = p.hand.find((h) => h.uid === action.handUid);
        if (!hc) return { ok: false };
        if (!getCard(hc.cardId).keywords?.includes('TRADEABLE')) return { ok: false, reason: '不可交易' };
        if (p.mana < 1 || !p.deck.length) return { ok: false, reason: '法力不足' };
        return { ok: true };
      }
    }
    return { ok: false };
  }

  // ==========================================================================
  // 查詢（UI / AI 使用）
  // ==========================================================================

  player(id: PlayerId): PlayerState {
    return this.s.players[id];
  }

  get me(): PlayerState {
    return this.s.players[this.s.current];
  }

  chars(): Char[] {
    const out: Char[] = [];
    for (const p of this.s.players) {
      out.push(p.hero, ...p.board);
    }
    return out;
  }

  char(uid: number): Char | null {
    for (const p of this.s.players) {
      if (p.hero.uid === uid) return p.hero;
      for (const m of p.board) if (m.uid === uid) return m;
    }
    return null;
  }

  minion(uid: number): Minion | null {
    for (const p of this.s.players) for (const m of p.board) if (m.uid === uid) return m;
    return null;
  }

  handCard(uid: number): { card: HandCard; owner: PlayerState } | null {
    for (const p of this.s.players) {
      const card = p.hand.find((h) => h.uid === uid);
      if (card) return { card, owner: p };
    }
    return null;
  }

  hasKw(m: Minion, k: Keyword): boolean {
    return m.keywords.includes(k) || m.tempKeywords.includes(k) || m.nextTurnKeywords.includes(k) || m.auraKeywords.includes(k);
  }

  atkOf(c: Char): number {
    if (isHero(c)) {
      const p = this.s.players[c.owner];
      const weapon = p.weapon && this.s.current === c.owner ? p.weapon.atk : 0;
      const aura = p.board.reduce(
        (sum, m) => sum + (m.silenced ? 0 : m.auras.filter((a) => a.scope === 'friendlyHero').reduce((x, a) => x + (a.atk ?? 0), 0)),
        0,
      );
      return Math.max(0, c.tempAtk + weapon + (this.s.current === c.owner ? aura : 0));
    }
    const enrage = c.enrageAtk && c.hp < c.maxHp ? c.enrageAtk : 0;
    return Math.max(0, c.baseAtk + c.atkBuff + c.tempAtk + c.auraAtk + enrage);
  }

  spellDamage(p: PlayerId): number {
    return this.s.players[p].board.reduce((sum, m) => sum + (m.silenced ? 0 : m.spellDamage), 0);
  }

  costOf(p: PlayerState, hc: HandCard): number {
    const def = getCard(hc.cardId);
    let cost = def.cost + hc.costMod;
    if (def.costRule) {
      let n = 0;
      switch (def.costRule.per) {
        case 'otherCardsInHand':
          n = p.hand.filter((h) => h.uid !== hc.uid).length;
          break;
        case 'minionsOnBoard':
          n = this.s.players[0].board.length + this.s.players[1].board.length;
          break;
        default:
          n = this.dyn(def.costRule.per, this.baseCtx(p.id), def.costRule.race);
      }
      cost -= def.costRule.amount * n;
    }
    return Math.max(0, cost);
  }

  cardIsSpell(handUid: number): boolean {
    const hc = this.handCard(handUid);
    return !!hc && getCard(hc.card.cardId).type === 'SPELL';
  }

  canPlay(handUid: number, option?: number): { ok: boolean; reason?: string } {
    const s = this.s;
    const p = s.players[s.current];
    const hc = p.hand.find((h) => h.uid === handUid);
    if (!hc) return { ok: false, reason: '找不到卡牌' };
    const def = getCard(hc.cardId);
    if (this.costOf(p, hc) > p.mana) return { ok: false, reason: '法力不足' };
    if (def.type === 'MINION' && p.board.length >= MAX_BOARD) return { ok: false, reason: '場上已滿' };
    if (def.secret) {
      if (p.secrets.some((x) => x.cardId === def.id)) return { ok: false, reason: '已有相同的奧秘' };
      if (p.secrets.length >= MAX_SECRETS) return { ok: false, reason: '奧秘已滿' };
    }
    if (def.chooseOne) {
      if (option === undefined) {
        const any = def.chooseOne.some((_o, i) => this.optionPlayable(hc, def, i));
        return any ? { ok: true } : { ok: false, reason: '沒有可選擇的目標' };
      }
      if (!def.chooseOne[option]) return { ok: false, reason: '無效選項' };
      if (!this.optionPlayable(hc, def, option)) return { ok: false, reason: '沒有可選擇的目標' };
      return { ok: true };
    }
    if (def.type === 'SPELL') {
      const req = this.playTargetReq(handUid);
      if (req && !req.optional && !this.validTargets(req, s.current, true).length) return { ok: false, reason: '沒有可選擇的目標' };
    }
    return { ok: true };
  }

  private optionPlayable(hc: HandCard, def: CardDef, i: number): boolean {
    const opt = def.chooseOne![i];
    if (!opt.target || def.type === 'MINION') return true;
    const req = this.playTargetReq(hc.uid, i);
    return !req || !!this.validTargets(req, this.s.current, true).length;
  }

  /** 出牌時的目標需求（已考慮連擊等條件） */
  playTargetReq(handUid: number, option?: number): TargetReq | null {
    const p = this.s.players[this.s.current];
    const idx = p.hand.findIndex((h) => h.uid === handUid);
    if (idx < 0) return null;
    const def = getCard(p.hand[idx].cardId);
    const req = def.chooseOne ? (option === undefined ? undefined : def.chooseOne[option]?.target) : def.target;
    if (!req) return null;
    if (req.when) {
      const ctx = this.baseCtx(p.id);
      ctx.combo = p.cardsPlayedThisTurn > 0;
      ctx.outcast = idx === 0 || idx === p.hand.length - 1;
      if (!this.evalCond(req.when, ctx, p.hand[idx].uid)) return null;
    }
    return req;
  }

  /** 可被選為目標的角色 */
  validTargets(req: TargetReq, player: PlayerId, bySpell: boolean, sourceUid: number | null = null): number[] {
    const ctx = this.baseCtx(player);
    ctx.sourceUid = sourceUid;
    return this.chars()
      .filter((c) => this.alive(c) && this.pass(c, req.filter, ctx))
      .filter((c) => {
        if (isHero(c)) return true;
        if (c.owner !== player && this.hasKw(c, 'STEALTH')) return false;
        if (bySpell && this.hasKw(c, 'ELUSIVE')) return false;
        return true;
      })
      .map((c) => c.uid);
  }

  heroPowerTargets(): number[] {
    const def = HERO_POWERS[this.me.heroClass];
    return def.target ? this.validTargets(def.target, this.s.current, true) : [];
  }

  heroPowerNeedsTarget(): boolean {
    return !!HERO_POWERS[this.me.heroClass].target;
  }

  canHeroPower(): boolean {
    const p = this.me;
    if (p.heroPower.used || p.mana < p.heroPower.cost) return false;
    const def = HERO_POWERS[p.heroClass];
    if (def.needsBoardSpace && p.board.length >= MAX_BOARD) return false;
    if (p.heroClass === 'SHAMAN' && BASIC_TOTEMS.every((t) => p.board.some((m) => m.cardId === t))) return false;
    if (def.target && !this.validTargets(def.target, this.s.current, true).length) return false;
    return true;
  }

  maxAttacks(c: Char): number {
    if (isHero(c)) {
      const w = this.s.players[c.owner].weapon;
      return w?.keywords.includes('WINDFURY') ? 2 : 1;
    }
    if (this.hasKw(c, 'MEGA_WINDFURY')) return 4;
    return this.hasKw(c, 'WINDFURY') ? 2 : 1;
  }

  canAttack(uid: number): boolean {
    const s = this.s;
    if (s.phase !== 'play' || s.pendingChoice) return false;
    const c = this.char(uid);
    if (!c || c.owner !== s.current || !this.alive(c)) return false;
    if (c.frozen) return false;
    if (this.atkOf(c) <= 0) return false;
    if (c.attacks >= this.maxAttacks(c)) return false;
    if (!isHero(c)) {
      if (this.hasKw(c, 'CANT_ATTACK')) return false;
      if (c.sleeping && !this.hasKw(c, 'CHARGE') && !this.hasKw(c, 'RUSH')) return false;
    }
    return this.attackTargets(uid).length > 0;
  }

  attackTargets(uid: number): number[] {
    const c = this.char(uid);
    if (!c) return [];
    const enemy = this.s.players[opp(c.owner)];
    const minions = enemy.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH'));
    const taunts = minions.filter((m) => this.hasKw(m, 'TAUNT'));
    let targets: Char[] = taunts.length ? taunts : minions;
    let heroAllowed = !taunts.length;
    if (!isHero(c)) {
      if (this.hasKw(c, 'CANT_ATTACK_HEROES')) heroAllowed = false;
      if (c.sleeping && !this.hasKw(c, 'CHARGE')) heroAllowed = false; // 突襲
    }
    if (heroAllowed) targets = [...targets, enemy.hero];
    return targets.map((t) => t.uid);
  }

  alive(c: Char): boolean {
    if (isHero(c)) return c.hp > 0;
    return c.hp > 0 && !c.dead;
  }

  // ==========================================================================
  // 執行
  // ==========================================================================

  private drive(gen: Gen, first?: number) {
    let input = first;
    for (;;) {
      const r = gen.next(input as number);
      if (r.done) return;
      const req = r.value;
      if (this.autoAll || this.s.players[req.player].ai) {
        input = this.chooser(this.s, req);
        continue;
      }
      this.pending = gen;
      this.s.pendingChoice = req;
      return;
    }
  }

  private *wrap(inner: Gen): Gen {
    yield* inner;
    yield* this.processDeaths();
    this.recalcAuras();
    this.trimFx();
  }

  uid(): number {
    return this.s.nextUid++;
  }

  newHandCard(cardId: string): HandCard {
    return { uid: this.uid(), cardId, costMod: 0, atkBuff: 0, hpBuff: 0 };
  }

  log(player: PlayerId | null, text: string) {
    this.s.log.push({ turn: this.s.turn, player, text });
    if (this.s.log.length > 200) this.s.log.splice(0, this.s.log.length - 200);
  }

  private fx(f: Omit<Fx, 'id'>) {
    this.s.fx.push({ id: ++this.s.fxSeq, ...f });
  }

  private trimFx() {
    if (this.s.fx.length > 60) this.s.fx.splice(0, this.s.fx.length - 60);
  }

  private name(cardId: string): string {
    return `【${getCard(cardId).name}】`;
  }

  private endGame(winner: PlayerId | 'draw') {
    if (this.s.phase === 'over') return;
    this.s.phase = 'over';
    this.s.winner = winner;
  }

  private get over(): boolean {
    return this.s.phase === 'over';
  }

  // ==========================================================================
  // 起手換牌與回合
  // ==========================================================================

  private mulligan(player: PlayerId, replace: number[]): boolean {
    const s = this.s;
    if (s.phase !== 'mulligan') return false;
    const p = s.players[player];
    if (p.mulliganDone) return false;
    // 先抽新牌取代，再把換掉的牌洗回牌庫（不會抽回同一張）
    const back: HandCard[] = [];
    p.hand = p.hand.map((h) => {
      if (!replace.includes(h.uid)) return h;
      const next = p.deck.pop();
      if (!next) return h;
      back.push(h);
      return next;
    });
    for (const c of back) p.deck.splice(randomInt(s, p.deck.length + 1), 0, c);
    p.mulliganDone = true;
    if (s.players[0].mulliganDone && s.players[1].mulliganDone) {
      const second = s.players[opp(s.first)];
      second.hand.push(this.newHandCard('GAME_005'));
      s.phase = 'play';
      this.drive(this.wrap(this.startTurn(s.first)));
    }
    return true;
  }

  private *startTurn(pid: PlayerId): Gen {
    const s = this.s;
    s.current = pid;
    s.turn++;
    if (s.turn > MAX_TURNS) {
      this.log(null, '回合數達到上限，平手！');
      this.endGame('draw');
      return;
    }
    const p = s.players[pid];
    p.maxMana = Math.min(MAX_MANA, p.maxMana + 1);
    p.overloadLocked = p.overloadOwed;
    p.mana = Math.max(0, p.maxMana - p.overloadOwed);
    p.overloadOwed = 0;
    p.heroPower.used = false;
    p.cardsPlayedThisTurn = 0;
    p.drawnThisTurn = 0;
    s.deathsThisTurn = 0;
    p.heroAttackedThisTurn = false;
    p.elementalLastTurn = p.elementalThisTurn;
    p.elementalThisTurn = false;
    p.hero.attacks = 0;
    for (const pl of s.players) pl.hero.immune = false;
    for (const m of p.board) {
      m.sleeping = false;
      m.attacks = 0;
      m.nextTurnKeywords = [];
    }
    this.log(pid, `—— 第 ${Math.ceil(s.turn / 2)} 回合：${p.name} ——`);
    yield* this.emit({ k: 'turnStart', player: pid });
    yield* this.checkSecrets(pid, 'turnStart', {});
    yield* this.processDeaths();
    if (this.over) return;
    yield* this.draw(p, 1);
  }

  private *endTurn(): Gen {
    const s = this.s;
    const pid = s.current;
    const p = s.players[pid];
    yield* this.emit({ k: 'turnEnd', player: pid });
    yield* this.checkSecrets(opp(pid), 'enemyTurnEnd', {});
    yield* this.processDeaths();
    if (this.over) return;
    for (const pl of s.players) {
      pl.hero.tempAtk = 0;
      for (const m of pl.board) {
        m.tempAtk = 0;
        m.tempKeywords = [];
      }
    }
    // 解凍：沒有錯過攻擊機會的角色才會在回合結束解凍
    const thaw = (c: Char) => {
      if (!c.frozen) return;
      const couldAttack = isHero(c) ? true : !c.sleeping || this.hasKw(c, 'CHARGE') || this.hasKw(c, 'RUSH');
      if (c.frozenTurn < s.turn || (c.attacks === 0 && couldAttack)) c.frozen = false;
    };
    thaw(p.hero);
    p.board.forEach(thaw);
    this.recalcAuras();
    yield* this.startTurn(opp(pid));
  }

  // ==========================================================================
  // 出牌
  // ==========================================================================

  private *playCard(handUid: number, target: number | undefined, position: number | undefined, option: number | undefined): Gen {
    const s = this.s;
    const p = s.players[s.current];
    const idx = p.hand.findIndex((h) => h.uid === handUid);
    const hc = p.hand[idx];
    const def = getCard(hc.cardId);
    const cost = this.costOf(p, hc);
    const outcast = idx === 0 || idx === p.hand.length - 1;
    const combo = p.cardsPlayedThisTurn > 0;
    p.mana -= cost;
    p.hand.splice(idx, 1);
    p.cardsPlayedThisTurn++;
    if (def.overload) p.overloadOwed += def.overload;

    let abilities: Ability[] = def.abilities ?? [];
    let transformInto: string | undefined;
    if (def.chooseOne) {
      const opt = def.chooseOne[option ?? 0];
      abilities = opt.abilities;
      transformInto = opt.transformInto;
      this.log(p.id, `${p.name}打出了${this.name(def.id)}（${opt.name}）`);
    } else this.log(p.id, `${p.name}打出了${this.name(def.id)}`);
    this.fx({ kind: 'play', cardId: def.id, player: p.id, target });

    const ctx: Ctx = {
      controller: p.id,
      sourceUid: null,
      sourceCardId: def.id,
      isSpell: def.type === 'SPELL',
      chosen: target ?? null,
      it: null,
      eventAmount: 0,
      combo,
      outcast,
      lifesteal: !!def.keywords?.includes('LIFESTEAL'),
    };
    const playAbilities = abilities.filter((a) => a.on.k === 'play');

    if (def.type === 'MINION') {
      const m = this.makeMinion(p.id, transformInto ?? def.id, hc);
      const pos = Math.max(0, Math.min(position ?? p.board.length, p.board.length));
      p.board.splice(pos, 0, m);
      ctx.sourceUid = m.uid;
      this.recalcAuras();
      this.countSummon(p, m.cardId);
      if (def.races?.includes('ELEMENTAL')) p.elementalThisTurn = true;
      for (const ab of playAbilities) {
        if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
        yield* this.runEffects(ab.effects, ctx);
        if (this.over) return;
      }
      yield* this.emit({ k: 'summon', player: p.id, subject: m.uid, races: def.races });
      yield* this.emit({ k: 'cardPlayed', player: p.id, subject: m.uid, cardType: 'MINION', races: def.races, cardId: def.id });
      if (this.minion(m.uid)) yield* this.checkSecrets(opp(p.id), 'enemyPlaysMinion', { it: { kind: 'char', uid: m.uid } });
    } else if (def.type === 'SPELL') {
      this.spellCountered = false;
      yield* this.checkSecrets(opp(p.id), 'enemyCastsSpell', {});
      if (!this.spellCountered) {
        if (def.secret) {
          p.secrets.push({ uid: this.uid(), cardId: def.id });
        } else {
          for (const ab of playAbilities) {
            if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
            yield* this.runEffects(ab.effects, ctx);
            if (this.over) return;
          }
        }
      } else this.log(p.id, `${this.name(def.id)}被反制了！`);
      p.spellsCastThisGame++;
      yield* this.emit({ k: 'spellCast', player: p.id, cardId: def.id, subject: target, subjectKind: 'char' });
      yield* this.emit({ k: 'cardPlayed', player: p.id, cardType: 'SPELL', cardId: def.id });
    } else {
      yield* this.equip(p.id, def.id);
      ctx.sourceUid = p.weapon?.uid ?? null;
      for (const ab of playAbilities) {
        if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
        yield* this.runEffects(ab.effects, ctx);
        if (this.over) return;
      }
      yield* this.emit({ k: 'cardPlayed', player: p.id, cardType: 'WEAPON', cardId: def.id });
    }
  }

  private *trade(handUid: number): Gen {
    const p = this.me;
    const i = p.hand.findIndex((h) => h.uid === handUid);
    const [card] = p.hand.splice(i, 1);
    p.mana -= 1;
    p.deck.splice(randomInt(this.s, p.deck.length + 1), 0, card);
    this.log(p.id, `${p.name}交易了一張牌`);
    yield* this.draw(p, 1);
  }

  private *useHeroPower(target: number | undefined): Gen {
    const p = this.me;
    const def = HERO_POWERS[p.heroClass];
    p.mana -= p.heroPower.cost;
    p.heroPower.used = true;
    p.heroPowersUsed++;
    this.log(p.id, `${p.name}使用了英雄能力【${HEROES[p.heroClass].power.name}】`);
    this.fx({ kind: 'play', cardId: p.heroPower.id, player: p.id, target });
    const ctx = this.baseCtx(p.id);
    ctx.sourceUid = p.hero.uid;
    ctx.sourceCardId = p.heroPower.id;
    ctx.chosen = target ?? null;
    ctx.isHeroPower = true;
    yield* this.runEffects(def.effects, ctx);
    yield* this.emit({ k: 'heroPower', player: p.id });
  }

  // ==========================================================================
  // 攻擊
  // ==========================================================================

  private *doAttack(attackerUid: number, targetUid: number): Gen {
    const s = this.s;
    const attacker = this.char(attackerUid)!;
    const pid = attacker.owner;
    const defender = this.char(targetUid)!;
    const dp = opp(pid);
    const atkName = isHero(attacker) ? s.players[pid].name : this.name(attacker.cardId);
    const defName = isHero(defender) ? `${s.players[dp].name}的英雄` : this.name(defender.cardId);
    this.log(pid, `${atkName}攻擊了${defName}`);
    this.fx({ kind: 'attack', uid: attackerUid, target: targetUid, player: pid });

    attacker.attacks++;
    if (isHero(attacker)) s.players[pid].heroAttackedThisTurn = true;

    this.currentAttack = { attacker: attackerUid, defender: targetUid };
    const it: ItRef = { kind: 'char', uid: attackerUid };
    if (isHero(defender)) {
      yield* this.checkSecrets(dp, 'heroAttacked', { it });
      if (!isHero(attacker)) yield* this.checkSecrets(dp, 'minionAttacksHero', { it });
    } else yield* this.checkSecrets(dp, 'minionAttacked', { it: { kind: 'char', uid: targetUid } });
    yield* this.checkSecrets(dp, 'enemyAttacks', { it });
    if (!isHero(attacker)) yield* this.checkSecrets(dp, 'enemyMinionAttacks', { it });
    const defUid = this.currentAttack.defender;
    this.currentAttack = null;
    yield* this.processDeaths();
    if (this.over) return;

    yield* this.emit({ k: 'attack', player: pid, subject: attackerUid, isHero: isHero(attacker), after: false });
    yield* this.processDeaths();
    if (this.over) return;

    const a = this.char(attackerUid);
    const d = this.char(defUid);
    if (!a || !d || !this.alive(a) || !this.alive(d)) return;

    if (!isHero(a)) {
      a.keywords = a.keywords.filter((k) => k !== 'STEALTH');
      a.tempKeywords = a.tempKeywords.filter((k) => k !== 'STEALTH');
      a.nextTurnKeywords = a.nextTurnKeywords.filter((k) => k !== 'STEALTH');
    }
    const aAtk = this.atkOf(a);
    const dAtk = isHero(d) ? 0 : this.atkOf(d);
    const aSrc = this.charSource(a);
    const dSrc = this.charSource(d);
    const neighbors = !isHero(a) && this.hasKw(a, 'CLEAVE') && !isHero(d) ? this.adjacent(d) : [];
    yield* this.damage(aSrc, d.uid, aAtk);
    if (dAtk > 0) yield* this.damage(dSrc, a.uid, dAtk);
    for (const n of neighbors) yield* this.damage(aSrc, n.uid, aAtk);

    if (isHero(a)) {
      const w = s.players[pid].weapon;
      if (w) {
        w.durability--;
      }
    }
    yield* this.emit({ k: 'attack', player: pid, subject: attackerUid, isHero: isHero(a), after: true });
  }

  private charSource(c: Char): DmgSource {
    if (isHero(c)) {
      const w = this.s.players[c.owner].weapon;
      return {
        owner: c.owner,
        uid: c.uid,
        poisonous: !!w?.keywords.includes('POISONOUS'),
        lifesteal: !!w?.keywords.includes('LIFESTEAL'),
        freeze: !!w?.keywords.includes('FREEZE_ON_DAMAGE'),
      };
    }
    return {
      owner: c.owner,
      uid: c.uid,
      poisonous: this.hasKw(c, 'POISONOUS'),
      lifesteal: this.hasKw(c, 'LIFESTEAL'),
      freeze: this.hasKw(c, 'FREEZE_ON_DAMAGE'),
    };
  }

  // ==========================================================================
  // 基本操作：傷害 / 治療 / 抽牌 / 召喚
  // ==========================================================================

  private *damage(src: DmgSource, targetUid: number, amount: number): Gen<number> {
    const t = this.char(targetUid);
    if (!t || amount <= 0 || this.over) return 0;
    if (isHero(t)) {
      if (t.immune) return 0;
      if (amount >= t.hp + t.armor && this.s.current !== t.owner) {
        const sec = this.s.players[t.owner].secrets.find((x) => this.secretEvent(x.cardId) === 'heroFatal');
        if (sec) {
          this.revealSecret(t.owner, sec.uid);
          t.immune = true;
          return 0;
        }
      }
      const absorbed = Math.min(t.armor, amount);
      t.armor -= absorbed;
      t.hp -= amount - absorbed;
    } else {
      if (this.hasKw(t, 'IMMUNE')) return 0;
      if (this.hasKw(t, 'DIVINE_SHIELD')) {
        t.keywords = t.keywords.filter((k) => k !== 'DIVINE_SHIELD');
        t.tempKeywords = t.tempKeywords.filter((k) => k !== 'DIVINE_SHIELD');
        t.nextTurnKeywords = t.nextTurnKeywords.filter((k) => k !== 'DIVINE_SHIELD');
        t.auraKeywords = t.auraKeywords.filter((k) => k !== 'DIVINE_SHIELD');
        this.fx({ kind: 'shield', uid: t.uid });
        return 0;
      }
      t.hp -= amount;
      if (src.poisonous) t.dead = true;
    }
    this.fx({ kind: 'damage', uid: t.uid, amount });
    if (src.freeze) this.freeze(t);
    if (src.lifesteal) yield* this.heal(this.s.players[src.owner].hero.uid, amount);
    yield* this.emit({ k: 'damaged', player: t.owner, subject: t.uid, amount, isHero: isHero(t) });
    if (isHero(t)) yield* this.checkSecrets(t.owner, 'heroDamaged', { amount, it: { kind: 'char', uid: t.uid } });
    else if (t.hp > 0 && !t.dead) {
      const frenzy = t.abilities.filter((a) => a.on.k === 'frenzy');
      for (const ab of frenzy) {
        t.abilities = t.abilities.filter((x) => x !== ab);
        const ctx = this.baseCtx(t.owner);
        ctx.sourceUid = t.uid;
        ctx.sourceCardId = t.cardId;
        yield* this.runEffects(ab.effects, ctx);
      }
    }
    return amount;
  }

  private *heal(targetUid: number, amount: number): Gen<number> {
    const t = this.char(targetUid);
    if (!t || amount <= 0) return 0;
    const healed = Math.min(t.maxHp - t.hp, amount);
    if (healed <= 0) return 0;
    t.hp += healed;
    this.fx({ kind: 'heal', uid: t.uid, amount: healed });
    yield* this.emit({ k: 'healed', player: t.owner, subject: t.uid, amount: healed, isHero: isHero(t) });
    return healed;
  }

  private freeze(c: Char) {
    c.frozen = true;
    c.frozenTurn = this.s.turn;
  }

  /** 開局發牌（不觸發事件） */
  drawRaw(p: PlayerState): HandCard | null {
    const c = p.deck.pop();
    if (!c) return null;
    p.hand.push(c);
    return c;
  }

  private *draw(p: PlayerState, count: number, pool?: Pool): Gen<HandCard[]> {
    const drawn: HandCard[] = [];
    for (let i = 0; i < count; i++) {
      if (this.over) break;
      let card: HandCard | undefined;
      if (pool) {
        const matches = p.deck.filter((h) => this.cardMatches(getCard(h.cardId), pool, p.id));
        const chosen = pick(this.s, matches);
        if (!chosen) break;
        p.deck.splice(p.deck.indexOf(chosen), 1);
        card = chosen;
      } else {
        card = p.deck.pop();
        if (!card) {
          p.fatigue++;
          this.log(p.id, `${p.name}的牌庫已空，受到 ${p.fatigue} 點疲勞傷害`);
          this.fx({ kind: 'fatigue', player: p.id, amount: p.fatigue });
          yield* this.damage({ owner: p.id, uid: null }, p.hero.uid, p.fatigue);
          continue;
        }
      }
      if (p.hand.length >= MAX_HAND) {
        this.log(p.id, `${p.name}的手牌已滿，${this.name(card.cardId)}被燒掉了`);
        this.fx({ kind: 'burn', cardId: card.cardId, player: p.id });
        continue;
      }
      p.hand.push(card);
      drawn.push(card);
      p.drawnThisTurn++;
      yield* this.emit({ k: 'draw', player: p.id, subject: card.uid, subjectKind: 'hand' });
    }
    return drawn;
  }

  private cardMatches(c: CardDef, pool: Pool, pid: PlayerId): boolean {
    const own = this.s.players[pid].heroClass;
    return poolCards(pool, own, this.s.players[opp(pid)].heroClass).some((x) => x.id === c.id);
  }

  private addToHand(p: PlayerState, cardId: string): HandCard | null {
    if (p.hand.length >= MAX_HAND) {
      this.fx({ kind: 'burn', cardId, player: p.id });
      return null;
    }
    const hc = this.newHandCard(cardId);
    p.hand.push(hc);
    return hc;
  }

  makeMinion(owner: PlayerId, cardId: string, hand?: HandCard): Minion {
    const def = getCard(cardId);
    const baseHp = def.health ?? 1;
    const hpBuff = hand?.hpBuff ?? 0;
    return {
      uid: this.uid(),
      cardId,
      owner,
      baseAtk: def.attack ?? 0,
      baseHp,
      atkBuff: hand?.atkBuff ?? 0,
      tempAtk: 0,
      auraAtk: 0,
      auraHp: 0,
      maxHp: baseHp + hpBuff,
      hp: baseHp + hpBuff,
      keywords: [...(def.keywords ?? [])],
      tempKeywords: [],
      nextTurnKeywords: [],
      auraKeywords: [],
      abilities: [...(def.abilities ?? [])],
      auras: def.auras ?? [],
      spellDamage: def.spellDamage ?? 0,
      enrageAtk: def.enrage?.atk ?? 0,
      silenced: false,
      frozen: false,
      frozenTurn: 0,
      sleeping: true,
      summonedTurn: this.s.turn,
      attacks: 0,
      playOrder: ++this.s.playCounter,
      dead: false,
    };
  }

  /** 召喚手下（非從手牌打出） */
  private *summon(owner: PlayerId, cardId: string, position?: number): Gen<Minion | null> {
    const p = this.s.players[owner];
    if (p.board.length >= MAX_BOARD) return null;
    const m = this.makeMinion(owner, cardId);
    const pos = position === undefined ? p.board.length : Math.max(0, Math.min(position, p.board.length));
    p.board.splice(pos, 0, m);
    this.recalcAuras();
    this.countSummon(p, cardId);
    yield* this.emit({ k: 'summon', player: owner, subject: m.uid, races: getCard(cardId).races });
    return m;
  }

  private countSummon(p: PlayerState, cardId: string) {
    for (const r of getCard(cardId).races ?? []) p.summonedRaces[r] = (p.summonedRaces[r] ?? 0) + 1;
  }

  private *equip(owner: PlayerId, cardId: string): Gen {
    const p = this.s.players[owner];
    const old = p.weapon;
    const def = getCard(cardId);
    p.weapon = {
      uid: this.uid(),
      cardId,
      owner,
      atk: def.attack ?? 0,
      durability: def.health ?? 1,
      abilities: [...(def.abilities ?? [])],
      keywords: [...(def.keywords ?? [])],
    };
    if (old) yield* this.weaponDestroyed(old);
  }

  private *weaponDestroyed(w: Weapon): Gen {
    this.log(w.owner, `${this.name(w.cardId)}被摧毀了`);
    const ctx = this.baseCtx(w.owner);
    ctx.sourceUid = w.uid;
    ctx.sourceCardId = w.cardId;
    for (const ab of w.abilities) {
      if (ab.on.k === 'deathrattle') yield* this.runEffects(ab.effects, ctx);
    }
  }

  private adjacent(m: Minion): Minion[] {
    const board = this.s.players[m.owner].board;
    const i = board.indexOf(m);
    if (i < 0) return [];
    return [board[i - 1], board[i + 1]].filter((x): x is Minion => !!x);
  }

  // ==========================================================================
  // 光環
  // ==========================================================================

  recalcAuras() {
    const all = [...this.s.players[0].board, ...this.s.players[1].board];
    for (const m of all) {
      let atk = 0;
      let hp = 0;
      const kws: Keyword[] = [];
      for (const src of all) {
        if (src.silenced || !src.auras.length) continue;
        for (const aura of src.auras) {
          let applies = false;
          const races = getCard(m.cardId).races ?? [];
          const raceOk = !aura.race || races.includes(aura.race) || races.includes('ALL');
          switch (aura.scope) {
            case 'otherFriendly':
              applies = src !== m && src.owner === m.owner && raceOk;
              break;
            case 'adjacent': {
              if (src.owner !== m.owner) break;
              const board = this.s.players[m.owner].board;
              applies = Math.abs(board.indexOf(src) - board.indexOf(m)) === 1;
              break;
            }
            case 'otherAll':
              applies = src !== m && raceOk;
              break;
            case 'enemyMinions':
              applies = src.owner !== m.owner;
              break;
          }
          if (!applies) continue;
          atk += aura.atk ?? 0;
          hp += aura.hp ?? 0;
          if (aura.keywords) kws.push(...aura.keywords);
        }
      }
      m.auraAtk = atk;
      if (hp !== m.auraHp) {
        const diff = hp - m.auraHp;
        m.maxHp += diff;
        if (diff > 0) m.hp += diff;
        else m.hp = Math.min(m.hp, m.maxHp);
        m.auraHp = hp;
      }
      m.auraKeywords = kws;
    }
  }

  // ==========================================================================
  // 死亡處理
  // ==========================================================================

  private *processDeaths(): Gen {
    for (let loop = 0; loop < 60 && !this.over; loop++) {
      this.recalcAuras();
      const dead: { m: Minion; left: Set<number> }[] = [];
      for (const p of this.s.players) {
        p.board.forEach((m, i) => {
          if (m.hp <= 0 || m.dead) dead.push({ m, left: new Set(p.board.slice(0, i).map((x) => x.uid)) });
        });
      }
      const deadWeapons = this.s.players.filter((p) => p.weapon && p.weapon.durability <= 0).map((p) => p.weapon!);
      if (!dead.length && !deadWeapons.length) break;
      dead.sort((a, b) => a.m.playOrder - b.m.playOrder);
      for (const { m } of dead) {
        const p = this.s.players[m.owner];
        p.board = p.board.filter((x) => x !== m);
        p.graveyard.push(m.cardId);
        this.s.deathsThisTurn++;
        this.fx({ kind: 'death', uid: m.uid, cardId: m.cardId, player: m.owner });
      }
      for (const w of deadWeapons) this.s.players[w.owner].weapon = null;
      this.recalcAuras();
      for (const w of deadWeapons) yield* this.weaponDestroyed(w);
      for (const { m, left } of dead) {
        const p = this.s.players[m.owner];
        const pos = p.board.filter((x) => left.has(x.uid)).length;
        const ctx = this.baseCtx(m.owner);
        ctx.sourceUid = m.uid;
        ctx.sourceCardId = m.cardId;
        ctx.sourceSnapshot = m;
        ctx.position = pos;
        if (!m.silenced) {
          for (const ab of m.abilities) {
            if (ab.on.k !== 'deathrattle') continue;
            if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
            yield* this.runEffects(ab.effects, ctx);
          }
          if (m.keywords.includes('REBORN')) {
            const r = yield* this.summon(m.owner, m.cardId, ctx.position);
            if (r) {
              r.keywords = r.keywords.filter((k) => k !== 'REBORN');
              r.hp = 1;
            }
          }
        }
        yield* this.emit({ k: 'minionDied', player: m.owner, subject: m.uid, races: getCard(m.cardId).races, cardId: m.cardId });
        yield* this.checkSecrets(m.owner, 'friendlyMinionDies', { it: { kind: 'char', uid: m.uid }, itCardId: m.cardId });
      }
    }
    const [h0, h1] = [this.s.players[0].hero.hp <= 0, this.s.players[1].hero.hp <= 0];
    if (h0 && h1) this.endGame('draw');
    else if (h0) this.endGame(1);
    else if (h1) this.endGame(0);
  }

  // ==========================================================================
  // 觸發
  // ==========================================================================

  private *emit(ev: Ev): Gen {
    if (this.over || this.emitDepth > 40 || ++this.steps > 4000) return;
    this.emitDepth++;
    try {
      const order: PlayerId[] = [this.s.current, opp(this.s.current)];
      const holders: { kind: 'minion' | 'weapon'; uid: number; owner: PlayerId }[] = [];
      for (const pid of order) {
        for (const m of this.s.players[pid].board) holders.push({ kind: 'minion', uid: m.uid, owner: pid });
      }
      for (const pid of order) {
        const w = this.s.players[pid].weapon;
        if (w) holders.push({ kind: 'weapon', uid: w.uid, owner: pid });
      }
      for (const h of holders) {
        if (this.over) return;
        let abilities: Ability[];
        let ent: Minion | Weapon | null;
        if (h.kind === 'minion') {
          const m = this.minion(h.uid);
          if (!m || m.hp <= 0 || m.dead) continue;
          ent = m;
          abilities = m.abilities;
        } else {
          const w = this.s.players[h.owner].weapon;
          if (!w || w.uid !== h.uid) continue;
          ent = w;
          abilities = w.abilities;
        }
        for (const ab of [...abilities]) {
          if (!this.matches(ab.on, ev, h.uid, h.owner)) continue;
          const ctx = this.baseCtx(h.owner);
          ctx.sourceUid = h.uid;
          ctx.sourceCardId = ent.cardId;
          if (ev.subject !== undefined) ctx.it = { kind: ev.subjectKind ?? 'char', uid: ev.subject };
          ctx.itCardId = ev.cardId;
          ctx.eventAmount = ev.amount ?? 0;
          if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
          if (ab.once) ent.abilities = ent.abilities.filter((x) => x !== ab);
          yield* this.runEffects(ab.effects, ctx);
        }
      }
    } finally {
      this.emitDepth--;
    }
  }

  private matches(trig: Trig, ev: Ev, holderUid: number, owner: PlayerId): boolean {
    if (trig.k !== ev.k) return false;
    const rel = (side: Side) => side === 'any' || (side === 'friendly') === (ev.player === owner);
    const raceOk = (r?: Race) => !r || !!ev.races?.includes(r) || !!ev.races?.includes('ALL');
    switch (trig.k) {
      case 'turnEnd':
      case 'turnStart':
        return trig.whose === 'each' || (trig.whose === 'mine') === (ev.player === owner);
      case 'spellCast':
      case 'heroPower':
      case 'draw':
        return rel(trig.side);
      case 'cardPlayed':
        return rel(trig.side) && (!trig.cardType || trig.cardType === ev.cardType) && raceOk(trig.race) && ev.subject !== holderUid;
      case 'summon':
      case 'minionDied':
        return rel(trig.side) && raceOk(trig.race) && ev.subject !== holderUid;
      case 'damaged':
        switch (trig.subject) {
          case 'self':
            return ev.subject === holderUid;
          case 'friendlyHero':
            return !!ev.isHero && ev.player === owner;
          case 'friendlyMinion':
            return !ev.isHero && ev.player === owner;
          case 'anyMinion':
            return !ev.isHero;
        }
        return false;
      case 'healed':
        if (trig.subject === 'friendly') return ev.player === owner;
        if (trig.subject === 'minion') return !ev.isHero;
        return true;
      case 'attack':
        if (!!trig.after !== !!ev.after) return false;
        if (trig.subject === 'self') return ev.subject === holderUid;
        if (trig.subject === 'friendlyHero') return !!ev.isHero && ev.player === owner;
        return !ev.isHero && ev.player === owner;
    }
    return false;
  }

  // ==========================================================================
  // 奧秘
  // ==========================================================================

  private secretEvent(cardId: string): SecretEvent | null {
    const ab = getCard(cardId).abilities?.find((a) => a.on.k === 'secret');
    return ab && ab.on.k === 'secret' ? ab.on.ev : null;
  }

  private revealSecret(owner: PlayerId, uid: number) {
    const p = this.s.players[owner];
    const sec = p.secrets.find((x) => x.uid === uid);
    if (!sec) return;
    p.secrets = p.secrets.filter((x) => x.uid !== uid);
    this.log(owner, `奧秘揭露：${this.name(sec.cardId)}`);
    this.fx({ kind: 'secret', cardId: sec.cardId, player: owner });
  }

  private *checkSecrets(owner: PlayerId, ev: SecretEvent, info: { it?: ItRef; itCardId?: string; amount?: number }): Gen {
    if (this.s.current === owner || this.over) return;
    const p = this.s.players[owner];
    for (const sec of [...p.secrets]) {
      if (this.secretEvent(sec.cardId) !== ev) continue;
      if (!p.secrets.includes(sec)) continue;
      // 目標已不存在時不觸發
      if (info.it?.kind === 'char' && ev !== 'friendlyMinionDies' && !this.char(info.it.uid)) continue;
      if (ev === 'friendlyMinionDies' && p.board.length >= MAX_BOARD) continue;
      this.revealSecret(owner, sec.uid);
      const ab = getCard(sec.cardId).abilities!.find((a) => a.on.k === 'secret')!;
      const ctx = this.baseCtx(owner);
      ctx.sourceCardId = sec.cardId;
      ctx.isSpell = true;
      ctx.it = info.it ?? null;
      ctx.itCardId = info.itCardId;
      ctx.eventAmount = info.amount ?? 0;
      yield* this.runEffects(ab.effects, ctx);
    }
  }

  // ==========================================================================
  // 效果執行
  // ==========================================================================

  private baseCtx(controller: PlayerId): Ctx {
    return {
      controller,
      sourceUid: null,
      sourceCardId: '',
      isSpell: false,
      chosen: null,
      it: null,
      eventAmount: 0,
      combo: false,
      outcast: false,
      lifesteal: false,
    };
  }

  private *runEffects(effects: Effect[], ctx: Ctx): Gen {
    for (const e of effects) {
      if (this.over || ++this.steps > 4000) return;
      yield* this.runEffect(e, ctx);
    }
  }

  private dmgSource(ctx: Ctx): DmgSource {
    const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
    if (m && !ctx.isSpell) return { ...this.charSource(m), freeze: false };
    return { owner: ctx.controller, uid: ctx.sourceUid, lifesteal: ctx.lifesteal };
  }

  private amount(a: Amount, ctx: Ctx): number {
    if (typeof a === 'number') return a;
    return (a.base ?? 0) + this.dyn(a.dyn, ctx, a.race) * (a.mult ?? 1);
  }

  private dyn(d: DynAmount, ctx: Ctx, race?: Race): number {
    const p = this.s.players[ctx.controller];
    const e = this.s.players[opp(ctx.controller)];
    switch (d) {
      case 'handSize':
        return p.hand.length;
      case 'friendlyMinions':
        return p.board.filter((m) => this.alive(m)).length;
      case 'otherFriendlyMinions':
        return p.board.filter((m) => this.alive(m) && m.uid !== ctx.sourceUid).length;
      case 'enemyMinions':
        return e.board.filter((m) => this.alive(m)).length;
      case 'allOtherMinions':
        return [...p.board, ...e.board].filter((m) => this.alive(m) && m.uid !== ctx.sourceUid).length;
      case 'armor':
        return p.hero.armor;
      case 'damagedFriendlyChars':
        return [p.hero, ...p.board].filter((c) => c.hp < c.maxHp && this.alive(c)).length;
      case 'eventAmount':
        return ctx.eventAmount;
      case 'cardsPlayedThisTurn':
        return p.cardsPlayedThisTurn;
      case 'spellsCastThisGame':
        return p.spellsCastThisGame;
      case 'weaponAttack':
        return p.weapon?.atk ?? 0;
      case 'selfAttack': {
        const src = ctx.sourceUid !== null ? this.char(ctx.sourceUid) : null;
        if (src) return this.atkOf(src);
        return ctx.sourceSnapshot ? this.atkOf(ctx.sourceSnapshot) : 0;
      }
      case 'heroAttack':
        return this.atkOf(p.hero);
      case 'secrets':
        return p.secrets.length;
      case 'heroMissingHealth':
        return p.hero.maxHp - p.hero.hp;
      case 'oppHandSize':
        return e.hand.length;
      case 'deathsThisTurn':
        return this.s.deathsThisTurn;
      case 'friendlyDeathsThisGame':
        return p.graveyard.length;
      case 'heroPowersUsed':
        return p.heroPowersUsed;
      case 'drawnThisTurn':
        return p.drawnThisTurn;
      case 'spellsInHand':
        return p.hand.filter((h) => getCard(h.cardId).type === 'SPELL').length;
      case 'damagedMinions':
        return [...p.board, ...e.board].filter((m) => this.alive(m) && m.hp < m.maxHp).length;
      case 'friendlyRace':
        return p.board.filter((m) => this.alive(m) && m.uid !== ctx.sourceUid && (!race || (getCard(m.cardId).races ?? []).includes(race))).length;
      case 'summonedRace':
        return race ? (p.summonedRaces[race] ?? 0) : 0;
    }
    return 0;
  }

  private pass(c: Char, f: Filter, ctx: Ctx): boolean {
    const hero = isHero(c);
    const type = f.type ?? 'character';
    if (type === 'minion' && hero) return false;
    if (type === 'hero' && !hero) return false;
    if (f.side === 'friendly' && c.owner !== ctx.controller) return false;
    if (f.side === 'enemy' && c.owner === ctx.controller) return false;
    if (f.excludeSelf && c.uid === ctx.sourceUid) return false;
    if (f.excludeChosen && c.uid === ctx.chosen) return false;
    if (f.race) {
      if (hero) return false;
      const races = getCard(c.cardId).races ?? [];
      if (!races.includes(f.race) && !races.includes('ALL')) return false;
    }
    if (f.damaged && c.hp >= c.maxHp) return false;
    if (f.undamaged && c.hp < c.maxHp) return false;
    if (f.maxAttack !== undefined && this.atkOf(c) > f.maxAttack) return false;
    if (f.minAttack !== undefined && this.atkOf(c) < f.minAttack) return false;
    if (f.keyword && (hero || !this.hasKw(c, f.keyword))) return false;
    return true;
  }

  private resolve(expr: TargetExpr, ctx: Ctx): number[] {
    const p = this.s.players[ctx.controller];
    const e = this.s.players[opp(ctx.controller)];
    switch (expr.t) {
      case 'chosen':
        return ctx.chosen !== null && this.char(ctx.chosen) ? [ctx.chosen] : [];
      case 'self':
        return ctx.sourceUid !== null && this.char(ctx.sourceUid) ? [ctx.sourceUid] : [];
      case 'hero':
        if (expr.side === 'friendly') return [p.hero.uid];
        if (expr.side === 'enemy') return [e.hero.uid];
        return [p.hero.uid, e.hero.uid];
      case 'all': {
        const list = this.chars().filter((c) => this.alive(c) && this.pass(c, expr.filter, ctx));
        return list.map((c) => c.uid);
      }
      case 'random': {
        const list = shuffle(
          this.s,
          this.chars().filter((c) => this.alive(c) && this.pass(c, expr.filter, ctx)),
        );
        return list.slice(0, expr.count).map((c) => c.uid);
      }
      case 'adjacent': {
        const center = expr.of === 'self' ? ctx.sourceUid : ctx.chosen;
        const m = center !== null ? this.minion(center) : null;
        if (m) return this.adjacent(m).map((x) => x.uid);
        if (expr.of === 'self' && ctx.sourceSnapshot && ctx.position !== undefined) {
          const board = this.s.players[ctx.sourceSnapshot.owner].board;
          return [board[ctx.position - 1], board[ctx.position]].filter(Boolean).map((x) => x.uid);
        }
        return [];
      }
      case 'it':
        if (ctx.it?.kind === 'char' && this.char(ctx.it.uid)) return [ctx.it.uid];
        return [];
    }
  }

  private evalCond(c: Condition, ctx: Ctx, excludeHandUid?: number): boolean {
    const p = this.s.players[ctx.controller];
    const races = (id: string) => getCard(id).races ?? [];
    switch (c.c) {
      case 'holding':
        return p.hand.some((h) => {
          if (h.uid === excludeHandUid) return false;
          const def = getCard(h.cardId);
          if (c.type && def.type !== c.type) return false;
          if (c.race && !races(h.cardId).includes(c.race) && !races(h.cardId).includes('ALL')) return false;
          return true;
        });
      case 'control': {
        const list = p.board.filter((m) => {
          if (m.uid === ctx.sourceUid || !this.alive(m)) return false;
          if (c.race && !races(m.cardId).includes(c.race) && !races(m.cardId).includes('ALL')) return false;
          if (c.keyword && !this.hasKw(m, c.keyword)) return false;
          return true;
        });
        return list.length >= (c.min ?? 1);
      }
      case 'combo':
        return ctx.combo;
      case 'outcast':
        return ctx.outcast;
      case 'heroAttacked':
        return p.heroAttackedThisTurn;
      case 'handSize':
        return c.op === '>=' ? p.hand.length >= c.n : p.hand.length <= c.n;
      case 'maxMana':
        return p.maxMana >= c.n;
      case 'opponentTurn':
        return this.s.current !== ctx.controller;
      case 'secret':
        return p.secrets.length > 0;
      case 'weapon':
        return !!p.weapon;
      case 'damaged': {
        const src = ctx.sourceUid !== null ? this.char(ctx.sourceUid) : null;
        return !!src && src.hp < src.maxHp;
      }
      case 'heroHealth':
        return c.op === '<=' ? p.hero.hp <= c.n : p.hero.hp >= c.n;
      case 'itRace': {
        if (!ctx.it) return false;
        const id = ctx.it.kind === 'char' ? this.char(ctx.it.uid) && !isHero(this.char(ctx.it.uid)!) ? (this.char(ctx.it.uid) as Minion).cardId : null : this.handCard(ctx.it.uid)?.card.cardId;
        return !!id && (races(id).includes(c.race) || races(id).includes('ALL'));
      }
      case 'itIsMinion': {
        if (!ctx.it) return false;
        if (ctx.it.kind === 'hand') {
          const hc = this.handCard(ctx.it.uid);
          return !!hc && getCard(hc.card.cardId).type === 'MINION';
        }
        const ch = this.char(ctx.it.uid);
        return !!ch && !isHero(ch);
      }
      case 'itAlive': {
        const target = ctx.it?.kind === 'char' ? ctx.it.uid : ctx.chosen;
        const ch = target !== null && target !== undefined ? this.char(target) : null;
        return !!ch && this.alive(ch);
      }
      case 'itDied': {
        const target = ctx.it?.kind === 'char' ? ctx.it.uid : ctx.chosen;
        const ch = target !== null && target !== undefined ? this.char(target) : null;
        return !ch || !this.alive(ch);
      }
      case 'playedElementalLastTurn':
        return p.elementalLastTurn;
      case 'noDuplicates': {
        const ids = p.deck.map((h) => h.cardId);
        return new Set(ids).size === ids.length;
      }
      case 'deckEmpty':
        return p.deck.length === 0;
      case 'not':
        return !this.evalCond(c.cond, ctx, excludeHandUid);
    }
    return false;
  }

  private randomPool(pool: Pool, pid: PlayerId, classRestrict: boolean): CardDef[] {
    const own = this.s.players[pid].heroClass;
    let cards = poolCards(pool, own, this.s.players[opp(pid)].heroClass);
    if (classRestrict && !pool.cls) {
      const restricted = cards.filter((c) => c.cardClass === 'NEUTRAL' || cardClasses(c).includes(own));
      if (restricted.length) cards = restricted;
    }
    return cards;
  }

  private summonPos(ctx: Ctx, who: PlayerId): number | undefined {
    if (who !== ctx.controller) return undefined;
    if (ctx.position !== undefined) return ctx.position;
    if (ctx.sourceUid !== null) {
      const board = this.s.players[who].board;
      const i = board.findIndex((m) => m.uid === ctx.sourceUid);
      if (i >= 0) return i + 1;
    }
    return undefined;
  }

  private *doSummon(ctx: Ctx, who: PlayerId, cardId: string): Gen<Minion | null> {
    const pos = this.summonPos(ctx, who);
    const m = yield* this.summon(who, cardId, pos);
    if (m) {
      if (ctx.position !== undefined && who === ctx.controller) ctx.position++;
      ctx.it = { kind: 'char', uid: m.uid };
    }
    return m;
  }

  private *runEffect(e: Effect, ctx: Ctx): Gen {
    const s = this.s;
    const me = s.players[ctx.controller];
    const foe = s.players[opp(ctx.controller)];
    const who = (w: 'self' | 'opponent') => (w === 'self' ? me : foe);
    switch (e.e) {
      case 'damage': {
        let amt = this.amount(e.amount, ctx);
        if (e.spell && ctx.isSpell) amt += this.spellDamage(ctx.controller);
        const targets = this.resolve(e.target, ctx);
        const src = this.dmgSource(ctx);
        for (const t of targets) yield* this.damage(src, t, amt);
        if (targets.length === 1 && e.target.t !== 'it') ctx.it = { kind: 'char', uid: targets[0] };
        break;
      }
      case 'splitDamage': {
        let n = e.amount;
        if (e.spell && ctx.isSpell) n += this.spellDamage(ctx.controller);
        const src = this.dmgSource(ctx);
        for (let i = 0; i < n; i++) {
          const list = this.chars().filter((c) => this.alive(c) && this.pass(c, e.filter, ctx));
          const t = pick(s, list);
          if (!t) break;
          yield* this.damage(src, t.uid, 1);
        }
        break;
      }
      case 'heal': {
        const amt = this.amount(e.amount, ctx);
        for (const t of this.resolve(e.target, ctx)) yield* this.heal(t, amt);
        break;
      }
      case 'fullHeal':
        for (const t of this.resolve(e.target, ctx)) {
          const c = this.char(t);
          if (c) yield* this.heal(t, c.maxHp - c.hp);
        }
        break;
      case 'buff': {
        const atk = e.atk !== undefined ? this.amount(e.atk, ctx) : 0;
        const hp = e.hp !== undefined ? this.amount(e.hp, ctx) : 0;
        if (e.target.t === 'it' && ctx.it?.kind === 'hand') {
          const hc = this.handCard(ctx.it.uid);
          if (hc) {
            hc.card.atkBuff += atk;
            hc.card.hpBuff += hp;
          }
          break;
        }
        for (const uid of this.resolve(e.target, ctx)) {
          const c = this.char(uid);
          if (!c) continue;
          if (isHero(c)) {
            c.tempAtk += atk;
            continue;
          }
          if (e.temp) c.tempAtk += atk;
          else c.atkBuff += atk;
          c.maxHp += hp;
          c.hp += hp;
          if (e.keywords) {
            for (const k of e.keywords) {
              if (e.temp) c.tempKeywords.push(k);
              else if (e.untilNextTurn) c.nextTurnKeywords.push(k);
              else if (!c.keywords.includes(k)) c.keywords.push(k);
            }
          }
          if (e.abilities) c.abilities.push(...e.abilities);
        }
        break;
      }
      case 'setStats':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m) {
            const h = this.char(uid);
            if (h && isHero(h) && e.hp !== undefined) {
              h.hp = e.hp;
              h.maxHp = Math.max(h.maxHp, e.hp);
            }
            continue;
          }
          if (e.atk !== undefined) {
            m.baseAtk = e.atk;
            m.atkBuff = 0;
            m.tempAtk = 0;
          }
          if (e.hp !== undefined) {
            m.baseHp = e.hp;
            m.maxHp = e.hp + m.auraHp;
            m.hp = m.maxHp;
          }
        }
        break;
      case 'doubleStat':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m) continue;
          if (e.stat !== 'hp') m.atkBuff += this.atkOf(m);
          if (e.stat !== 'atk') {
            const add = m.hp;
            m.maxHp += add;
            m.hp += add;
          }
        }
        break;
      case 'swapStats':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m) continue;
          const a = this.atkOf(m);
          const h = m.hp;
          m.baseAtk = h;
          m.atkBuff = 0;
          m.tempAtk = -m.auraAtk;
          m.baseHp = a;
          m.maxHp = a;
          m.hp = a;
          m.auraHp = 0;
        }
        break;
      case 'draw': {
        const n = this.amount(e.count, ctx);
        const targets = e.who === 'both' ? [me, foe] : [who(e.who)];
        for (const p of targets) {
          const drawn = yield* this.draw(p, n, e.pool);
          if (p === me && drawn.length) ctx.it = { kind: 'hand', uid: drawn[drawn.length - 1].uid };
        }
        break;
      }
      case 'summon':
        for (let i = 0; i < e.count; i++) yield* this.doSummon(ctx, who(e.who).id, e.card);
        break;
      case 'summonRandom': {
        const cards = this.randomPool(e.pool, ctx.controller, false);
        for (let i = 0; i < e.count; i++) {
          const c = pick(s, cards);
          if (c) yield* this.doSummon(ctx, who(e.who).id, c.id);
        }
        break;
      }
      case 'summonCopy': {
        const sources: Minion[] = this.resolve(e.target, ctx)
          .map((uid) => this.minion(uid))
          .filter((m): m is Minion => !!m);
        if (!sources.length && e.target.t === 'self' && ctx.sourceSnapshot) sources.push(ctx.sourceSnapshot);
        for (const src of sources) {
          for (let i = 0; i < e.count; i++) {
            const m = yield* this.doSummon(ctx, ctx.controller, src.cardId);
            if (m) this.copyStats(src, m);
          }
        }
        break;
      }
      case 'destroy':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (m) m.dead = true;
          else {
            const h = this.char(uid);
            if (h && isHero(h)) h.hp = 0;
          }
        }
        break;
      case 'silence':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (m) this.silence(m);
        }
        break;
      case 'freeze':
        for (const uid of this.resolve(e.target, ctx)) {
          const c = this.char(uid);
          if (c) this.freeze(c);
        }
        break;
      case 'armor': {
        const p = e.who === 'opponent' ? foe : me;
        const amt = this.amount(e.amount, ctx);
        p.hero.armor += amt;
        this.fx({ kind: 'armor', uid: p.hero.uid, amount: amt });
        break;
      }
      case 'heroAttack':
        me.hero.tempAtk += e.amount;
        break;
      case 'equip':
        yield* this.equip(ctx.controller, e.card);
        break;
      case 'addCard':
        for (let i = 0; i < e.count; i++) {
          const hc = this.addToHand(who(e.who), e.card);
          if (hc && e.who === 'self') ctx.it = { kind: 'hand', uid: hc.uid };
        }
        break;
      case 'addRandom': {
        const cards = this.randomPool(e.pool, ctx.controller, true);
        for (let i = 0; i < e.count; i++) {
          const c = pick(s, cards);
          if (!c) break;
          const hc = this.addToHand(who(e.who), c.id);
          if (hc && e.who === 'self') ctx.it = { kind: 'hand', uid: hc.uid };
        }
        break;
      }
      case 'addCopy': {
        let cardId: string | null = null;
        const t = this.resolve(e.target, ctx)[0];
        const c = t !== undefined ? this.char(t) : null;
        if (c && !isHero(c)) cardId = c.cardId;
        else if (e.target.t === 'self') cardId = ctx.sourceCardId;
        else if (ctx.it?.kind === 'hand') cardId = this.handCard(ctx.it.uid)?.card.cardId ?? null;
        else if (ctx.itCardId) cardId = ctx.itCardId;
        if (cardId) for (let i = 0; i < e.count; i++) this.addToHand(me, cardId);
        break;
      }
      case 'discover': {
        const cards = shuffle(s, [...this.randomPool(e.pool, ctx.controller, true)]);
        const opts: string[] = [];
        for (const c of cards) {
          if (opts.length >= 3) break;
          if (!opts.some((o) => getCard(o).name === c.name)) opts.push(c.id);
        }
        if (!opts.length) break;
        const idx = yield { player: ctx.controller, kind: 'discover', options: opts, title: '發現一張卡牌' };
        const chosen = opts[Math.max(0, Math.min(opts.length - 1, idx ?? 0))];
        const hc = this.addToHand(me, chosen);
        if (hc) ctx.it = { kind: 'hand', uid: hc.uid };
        if (e.then) yield* this.runEffects(e.then, ctx);
        break;
      }
      case 'returnToHand':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m) continue;
          const owner = s.players[m.owner];
          owner.board = owner.board.filter((x) => x !== m);
          const hc = this.addToHand(owner, m.cardId);
          if (hc && e.costChange) hc.costMod += e.costChange;
          if (hc && owner.id === ctx.controller) ctx.it = { kind: 'hand', uid: hc.uid };
          this.recalcAuras();
        }
        break;
      case 'transform':
        for (const uid of this.resolve(e.target, ctx)) this.transform(uid, e.card);
        break;
      case 'transformRandom': {
        const cards = this.randomPool(e.pool, ctx.controller, false);
        for (const uid of this.resolve(e.target, ctx)) {
          const c = pick(s, cards);
          if (c) this.transform(uid, c.id);
        }
        break;
      }
      case 'steal':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m || m.owner === ctx.controller) continue;
          const from = s.players[m.owner];
          from.board = from.board.filter((x) => x !== m);
          if (me.board.length >= MAX_BOARD) {
            m.dead = true;
            from.board.push(m);
            continue;
          }
          m.owner = ctx.controller;
          m.sleeping = true;
          m.summonedTurn = s.turn;
          m.attacks = 0;
          me.board.push(m);
          this.recalcAuras();
        }
        break;
      case 'mana': {
        const p = e.who === 'opponent' ? foe : me;
        switch (e.kind) {
          case 'empty':
            p.maxMana = Math.min(MAX_MANA, p.maxMana + e.amount);
            break;
          case 'full':
            p.maxMana = Math.min(MAX_MANA, p.maxMana + e.amount);
            p.mana = Math.min(MAX_MANA, p.mana + e.amount);
            break;
          case 'temp':
            p.mana = Math.min(MAX_MANA, p.mana + e.amount);
            break;
          case 'refresh':
            p.mana = Math.min(p.maxMana, p.mana + e.amount);
            break;
          case 'destroy':
            p.maxMana = Math.max(0, p.maxMana - e.amount);
            p.mana = Math.min(p.mana, p.maxMana);
            break;
        }
        break;
      }
      case 'discard':
        for (let i = 0; i < e.count && me.hand.length; i++) {
          const idx = randomInt(s, me.hand.length);
          const [c] = me.hand.splice(idx, 1);
          this.log(me.id, `${me.name}棄掉了${this.name(c.cardId)}`);
        }
        break;
      case 'destroyWeapon': {
        const p = who(e.who);
        const w = p.weapon;
        if (w) {
          p.weapon = null;
          yield* this.weaponDestroyed(w);
        }
        break;
      }
      case 'weaponBuff':
        if (me.weapon) {
          me.weapon.atk += e.atk ?? 0;
          me.weapon.durability += e.dur ?? 0;
        }
        break;
      case 'shuffle':
        for (let i = 0; i < e.count; i++) me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(e.card));
        break;
      case 'shuffleCopy':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m) continue;
          for (let i = 0; i < e.count; i++) me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(m.cardId));
        }
        break;
      case 'handBuff': {
        const minions = me.hand.filter((h) => {
          const def = getCard(h.cardId);
          if (def.type !== 'MINION') return false;
          return !e.race || !!def.races?.includes(e.race) || !!def.races?.includes('ALL');
        });
        const targets = e.scope === 'all' ? minions : ([pick(s, minions)].filter(Boolean) as HandCard[]);
        for (const h of targets) {
          h.atkBuff += e.atk;
          h.hpBuff += e.hp;
        }
        break;
      }
      case 'costMod':
        if (ctx.it?.kind === 'hand') {
          const hc = this.handCard(ctx.it.uid);
          if (hc) hc.card.costMod += e.amount;
        }
        break;
      case 'cond':
        if (this.evalCond(e.cond, ctx)) yield* this.runEffects(e.then, ctx);
        else if (e.else) yield* this.runEffects(e.else, ctx);
        break;
      case 'repeat': {
        const n = this.amount(e.times, ctx);
        for (let i = 0; i < n; i++) yield* this.runEffects(e.effects, ctx);
        break;
      }
      case 'custom':
        yield* this.custom(e.fn, e.args ?? {}, ctx);
        break;
    }
  }

  private copyStats(src: Minion, m: Minion) {
    m.baseAtk = src.baseAtk;
    m.atkBuff = src.atkBuff;
    m.baseHp = src.baseHp;
    m.maxHp = src.maxHp - src.auraHp + m.auraHp;
    m.hp = Math.min(m.maxHp, src.hp - src.auraHp + m.auraHp);
    if (m.hp <= 0) m.hp = 1;
    m.keywords = [...src.keywords];
    m.abilities = [...src.abilities];
    m.silenced = src.silenced;
    if (src.silenced) {
      m.auras = [];
      m.spellDamage = 0;
      m.enrageAtk = 0;
    }
  }

  private silence(m: Minion) {
    m.silenced = true;
    m.keywords = [];
    m.tempKeywords = [];
    m.nextTurnKeywords = [];
    m.abilities = [];
    m.auras = [];
    m.spellDamage = 0;
    m.enrageAtk = 0;
    m.frozen = false;
    m.atkBuff = 0;
    m.tempAtk = 0;
    const def = getCard(m.cardId);
    m.baseAtk = def.attack ?? 0;
    m.baseHp = def.health ?? 1;
    m.maxHp = m.baseHp + m.auraHp;
    m.hp = Math.min(m.hp, m.maxHp);
    this.recalcAuras();
  }

  private transform(uid: number, cardId: string) {
    const old = this.minion(uid);
    if (!old) return;
    const p = this.s.players[old.owner];
    const idx = p.board.indexOf(old);
    const m = this.makeMinion(old.owner, cardId);
    m.sleeping = old.sleeping;
    m.summonedTurn = old.summonedTurn;
    m.attacks = old.attacks;
    p.board[idx] = m;
    this.recalcAuras();
  }

  // ==========================================================================
  // 特殊效果（手動定義的卡牌使用）
  // ==========================================================================

  private *custom(fn: string, args: Record<string, unknown>, ctx: Ctx): Gen {
    const s = this.s;
    const me = s.players[ctx.controller];
    const foe = s.players[opp(ctx.controller)];
    switch (fn) {
      case 'counter':
        this.spellCountered = true;
        break;
      case 'preventFatal':
        break;
      case 'resurrect':
        if (ctx.itCardId) {
          const m = yield* this.summon(ctx.controller, ctx.itCardId);
          if (m) m.hp = 1;
        }
        break;
      case 'redirectSummon': {
        const m = yield* this.summon(ctx.controller, args.card as string);
        if (m && this.currentAttack) this.currentAttack.defender = m.uid;
        break;
      }
      case 'summonOneOf': {
        const id = pick(s, args.cards as string[]);
        if (id) yield* this.doSummon(ctx, ctx.controller, id);
        break;
      }
      case 'addOneOf': {
        const id = pick(s, args.cards as string[]);
        if (id) this.addToHand(me, id);
        break;
      }
      case 'totemicCall': {
        const options = BASIC_TOTEMS.filter((t) => !me.board.some((m) => m.cardId === t));
        const id = pick(s, options);
        if (id) yield* this.summon(ctx.controller, id);
        break;
      }
      case 'attackEqualsHealth':
        for (const uid of this.resolve({ t: 'chosen' }, ctx)) {
          const m = this.minion(uid);
          if (m) m.atkBuff += m.hp - this.atkOf(m);
        }
        break;
      case 'bladeFlurry': {
        const w = me.weapon;
        if (!w) break;
        const dmg = w.atk;
        me.weapon = null;
        yield* this.weaponDestroyed(w);
        for (const m of [...foe.board]) yield* this.damage({ owner: me.id, uid: null }, m.uid, dmg);
        break;
      }
      case 'setHeroHealth':
        for (const uid of this.resolve({ t: 'chosen' }, ctx)) {
          const h = this.char(uid);
          if (h && isHero(h)) {
            h.hp = args.hp as number;
            if (h.hp > h.maxHp) h.maxHp = h.hp;
          }
        }
        break;
      case 'fillBoard':
        while (me.board.length < MAX_BOARD) {
          const m = yield* this.doSummon(ctx, ctx.controller, args.card as string);
          if (!m) break;
        }
        break;
      case 'destroyWeaponDraw': {
        const w = foe.weapon;
        if (!w) break;
        const n = w.durability;
        foe.weapon = null;
        yield* this.weaponDestroyed(w);
        yield* this.draw(me, n);
        break;
      }
      case 'stealIfFour':
        if (foe.board.filter((m) => this.alive(m)).length >= 4) {
          const m = pick(s, foe.board.filter((x) => this.alive(x)));
          if (m) yield* this.runEffect({ e: 'steal', target: { t: 'it' } }, { ...ctx, it: { kind: 'char', uid: m.uid } });
        }
        break;
      case 'transformRandomOther': {
        const others = this.chars().filter((c) => !isHero(c) && this.alive(c) && c.uid !== ctx.sourceUid);
        const t = pick(s, others);
        const into = pick(s, args.cards as string[]);
        if (t && into) this.transform(t.uid, into);
        break;
      }
      case 'swapHands': {
        break;
      }
    }
  }
}
