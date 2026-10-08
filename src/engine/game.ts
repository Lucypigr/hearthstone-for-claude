// ============================================================================
// 對戰引擎
// - 所有規則在這裡執行；UI 與 AI 只透過 Game.apply(action) 互動。
// - 效果以 generator 執行，遇到「發現」這類需要玩家選擇的情況會暫停（yield），
//   等 UI 呼叫 choose() 後再繼續。
// ============================================================================
import { KAZAKUS_INGREDIENTS, KAZAKUS_POTIONS, KAZAKUS_TIERS } from '../cards/kazakus';
import { FOLLOW_EFFECTS } from '../cards/follow';
import { ADAPTATIONS, BRANCHING_PATHS, INVOCATIONS, LACKEYS, SIAMAT_OPTIONS, SPARE_PARTS } from '../cards/lists';
import { potionDef } from '../cards/potion';
import { trialDef } from '../cards/trial';
import { COLLECTIBLE, cardClasses, getCard, hasCard, HEROES, poolCards, POWER_INFO } from '../cards/registry';
import { LAUNCH_COST, starshipDef, starshipIdFor } from '../cards/starship';
import { ZOMBEAST_ID, ZOMBEAST_PARTS, zombeastDef } from '../cards/zombeast';
import { BASIC_TOTEMS, EXTRA_POWERS, HERO_POWERS, RAGNAROS_HERO, RAGNAROS_POWER, UPGRADED_POWER_IDS } from './heroes';
import { nextRandom, pick, randomInt, shuffle } from './rng';
import { PASSIVE_FLAGS } from './dungeon';
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
  type Location,
  type Minion,
  type PlayerId,
  type PlayerState,
  type StarshipPiece,
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
  HeroPowerSpec,
  Keyword,
  MinionFlag,
  PendingDiscount,
  Pool,
  QuestDef,
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

/** 克蘇恩（以英文名判斷，重印版本也算） */
export const CTHUN_ID = 'OG_280';
const isCthun = (id: string) => getCard(id).nameEn === "C'Thun";
const isEyestalk = (id: string) => getCard(id).nameEn === "Eyestalk of C'Thun";
/** 泰坦的三種瘟疫（抽到時施放） */
const PLAGUES = ['TTN_450t', 'TTN_450t2', 'TTN_450t3'];
/** 翠玉魔像（官方只有一張 1/1 衍生卡，大小由召喚次數決定） */
const JADE_GOLEM = 'CFM_712_t01';
/** 預兆：各職業的士兵 */
const HERALD_SOLDIERS: Partial<Record<CardClass, string>> = {
  DEATHKNIGHT: 'CATA_780t',
  DEMONHUNTER: 'CATA_525t',
  ROGUE: 'CATA_158t',
  SHAMAN: 'CATA_565t',
  WARLOCK: 'CATA_725t',
  WARRIOR: 'CATA_580t',
};
/** 法師的三張地脈 */
const LEYLINES = ['MEND_500', 'MEND_502', 'MEND_504'];
/** 無限次使用英雄能力時，每回合的使用上限（避免 0 費英雄能力無限循環） */
const UNLIMITED_POWER_USES = 30;

const fn2 = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });

/** 以英雄能力的卡牌 ID 查效果（基本職業能力 + 其他能力） */
function powerSpecById(id: string): HeroPowerSpec | undefined {
  if (EXTRA_POWERS[id]) return EXTRA_POWERS[id];
  for (const [cls, info] of Object.entries(HEROES)) if (info.power.id === id) return HERO_POWERS[cls as Exclude<CardClass, 'NEUTRAL'>];
  return undefined;
}

interface ItRef {
  kind: 'char' | 'hand';
  uid: number;
}

/** 泰坦繪圖師歐斯克：手牌中會輪流獲得的泰坦能力 */
const OSK_VARIANTS = ['TLC_452t1', 'TLC_452t2', 'TLC_452t3', 'TLC_452t4', 'TLC_452t5', 'TLC_452t6', 'TLC_452t7', 'TLC_452t8', 'TLC_452t9', 'TLC_452t13', 'TLC_452t14', 'TLC_452t15', 'TLC_452t16', 'TLC_452t17', 'TLC_452t18', 'TLC_452t19', 'TLC_452t20', 'TLC_452t21', 'TLC_452t22', 'TLC_452t23', 'TLC_452t24', 'TLC_452t26', 'TLC_452t27', 'TLC_452t28', 'TLC_452t29', 'TLC_452t30', 'TLC_452t31', 'TLC_452t32', 'TLC_452t33', 'TLC_452t34', 'TLC_452t35'];

/** 導航員艾莉絲：效果卡在第 tier 級（0 ~ 2）的 id */
const tierId = (id: string, tier: number) => `TLC_100t${tier + 1}${id.slice(-1)}`;

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
  /** 比武揭露的我方牌堆卡牌（uid） */
  revealed?: number;
  /** 被摧毀的武器（武器亡語用） */
  weapon?: Weapon;
  /** 觸發能力的手牌（手牌中的能力用） */
  handSource?: number;
  /** 抽中時施放的卡（死亡魔影的暗影用） */
  drawnCard?: HandCard;
  /** 打出的卡在手牌中累積的計數 */
  handCounter?: number;
  /** 打出的卡正好在手牌正中央 */
  center?: boolean;
  /** 打出的卡原本在手牌中的位置 */
  handIndex?: number;
  /** 觸發事件的手下被召喚的回合 */
  itSummonedTurn?: number;
  /** 觸發事件的卡在手牌最右邊 */
  rightmost?: boolean;
  /** 觸發事件的卡是從對手那裡複製來的 */
  itFromOpp?: boolean;
  /** 正在打出的手牌（軟泥攻擊的魂能等讀取手牌上的資料） */
  playedCard?: HandCard;
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
  /** 打出的卡具有回音 */
  echo?: boolean;
  /** 打出的卡是流放（在手牌最左或最右） */
  outcast?: boolean;
  /** 打出的卡在手牌最右邊 */
  rightmost?: boolean;
  /** 只觸發這位玩家的能力（例如德拉克瑞附魔師的第二次回合結束效果） */
  onlyOwner?: PlayerId;
  /** 打出的卡是從對手那裡複製來的 */
  fromOpp?: boolean;
}

interface DmgSource {
  owner: PlayerId;
  uid: number | null;
  poisonous?: boolean;
  lifesteal?: boolean;
  freeze?: boolean;
  /** 造成傷害的法術（滅殺用） */
  cardId?: string;
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
  /** 地城探險：被動寶藏 / Boss 被動 */
  passives?: [string[], string[]];
  /** 開局生命值（預設 30） */
  heroHp?: [number | undefined, number | undefined];
  /** 指定英雄卡（Boss 的英雄牌） */
  heroCards?: [string | undefined, string | undefined];
  /** 指定英雄能力 id（Boss 的英雄能力） */
  heroPowerIds?: [string | undefined, string | undefined];
  /** 開局的法力水晶 */
  startMana?: [number | undefined, number | undefined];
  /** 這一輪已擊敗的 Boss 數 */
  dungeonWins?: number;
  /** 後攻玩家不給幸運幣 */
  noCoin?: boolean;
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

const RAFAAM_IDS = ['TIME_005t1', 'TIME_005t2', 'TIME_005t3', 'TIME_005t4', 'TIME_005t5', 'TIME_005t6', 'TIME_005t7', 'TIME_005t8', 'TIME_005t9'];

export class Game {
  s: GameState;
  private pending: Gen | null = null;
  private chooser: Chooser;
  /** 模擬模式：所有選擇自動決定 */
  private autoAll: boolean;
  private spellCountered = false;
  private currentAttack: AttackState | null = null;
  /** 正在發生的攻擊的防守者（攻擊前的觸發效果用） */
  private attackDefender: number | null = null;
  /** 最近一次攻擊的結果（攻擊後觸發的效果使用） */
  private lastAttack: { attacker: number; defender: number; defenderIsHero: boolean; killed: boolean; defenderCardId?: string } | null = null;
  private emitDepth = 0;
  private steps = 0;
  /** 倒轉：玩家選擇倒轉時，記錄倒轉前的狀態（等這次動作結束後還原） */
  private rewindReq: { snap: GameState; handUid?: number; left: number } | null = null;

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
        // 傳說：組合卡一起洗入牌堆
        deck: o.decks[id].flatMap((cardId) => [cardId, ...(getCard(cardId).fabled ?? [])]).map((cardId) => ({ ...game.newHandCard(cardId), starting: true })),
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
        grants: [],
        nextCardDiscount: 0,
        heroPowersUsed: 0,
        drawnThisTurn: 0,
        summonedRaces: {},
        ai: o.ai[id],
      };
      s.players[id].startedNoSpells = !s.players[id].deck.some((h) => getCard(h.cardId).type === 'SPELL');
    }
    for (const id of [0, 1] as PlayerId[]) {
      const p = s.players[id];
      p.passives = [...(o.passives?.[id] ?? [])];
      if (o.dungeonWins !== undefined) p.dungeonWins = o.dungeonWins;
      if (o.noCoin) p.noCoin = true;
      const hp = o.heroHp?.[id];
      if (hp) p.hero.hp = p.hero.maxHp = hp;
      if (o.heroCards?.[id]) p.hero.cardId = o.heroCards[id]!;
      const pw = o.heroPowerIds?.[id];
      if (pw) p.heroPower = { id: pw, used: false, cost: POWER_INFO[pw]?.cost ?? 0 };
      const sm = o.startMana?.[id];
      if (sm) p.maxMana = sm - 1;
      // 被動寶藏
      if (p.passives.includes('LOOTA_800')) p.hero.hp = p.hero.maxHp = p.hero.maxHp * 2;
      if (p.passives.includes('LOOTA_801')) p.maxMana += 1;
      if (p.passives.includes('LOOTA_802')) {
        const up = UPGRADED_POWER_IDS[p.heroClass];
        p.heroPower = { id: up, used: false, cost: 1 };
      }
    }
    for (const id of [0, 1] as PlayerId[]) {
      game.startOfGame(s.players[id]);
      shuffle(s, s.players[id].deck);
    }
    s.first = o.first ?? (nextRandom(s) < 0.5 ? 0 : 1);
    // 『玉蓮幫幫主』阿雅：你永遠為後手
    const aya = ([0, 1] as PlayerId[]).filter((id) => s.players[id].deck.some((h) => getCard(h.cardId).nameEn === 'Aya, Lotus Kingpin'));
    if (aya.length === 1) s.first = opp(aya[0]);
    s.current = s.first;
    const second = opp(s.first);
    for (let i = 0; i < 3; i++) game.drawRaw(s.players[s.first]);
    for (let i = 0; i < 4; i++) game.drawRaw(s.players[second]);
    for (const pl of s.players) {
      // 小背包：開局多抽 2 張牌；神秘魔典：開局打出 3 個隨機奧秘
      if (pl.passives?.includes('LOOTA_804')) for (let i = 0; i < 2; i++) game.drawRaw(pl);
      if (pl.passives?.includes('LOOTA_833')) {
        const secrets = shuffle(s, poolCards({ isSecret: true }, pl.heroClass, pl.heroClass).filter((c) => c.secret && c.collectible));
        for (const c of secrets.slice(0, 3)) pl.secrets.push({ uid: game.uid(), cardId: c.id });
      }
    }
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
      case 'prepare':
        this.drive(this.wrap(this.prepareCard(action.handUid)));
        return true;
      case 'play': {
        let target = action.target;
        // 諾格弗格市長：所有目標都隨機選擇
        if (target !== undefined && this.flagOnBoard('randomTargets')) {
          const req = this.playTargetReq(action.handUid, action.option);
          if (req) target = pick(this.s, this.validTargets(req, this.s.current, this.cardIsSpell(action.handUid))) ?? target;
        }
        const hc = this.s.players[this.s.current].hand.find((h) => h.uid === action.handUid);
        if (hc && !this.autoAll && this.rewindsOf(hc) > 0) this.drive(this.wrap(this.playRewindable(action.handUid, target, action.position, action.option, action.side)));
        else this.drive(this.wrap(this.playCard(action.handUid, target, action.position, action.option, action.side)));
        return true;
      }
      case 'attack':
        this.drive(this.wrap(this.doAttack(action.attacker, this.redirectAttack(action.attacker, action.target))));
        return true;
      case 'heroPower': {
        let target = action.target;
        if (target !== undefined && this.flagOnBoard('randomTargets')) target = pick(this.s, this.heroPowerTargets(action.option)) ?? target;
        const hp = this.me;
        if (!this.autoAll && this.powerDef(hp).rewind && hp.heroPower.rewoundTurn !== this.s.turn) this.drive(this.wrap(this.powerRewindable(target, action.option)));
        else this.drive(this.wrap(this.useHeroPower(target, action.option)));
        return true;
      }
      case 'heroPower2':
        this.drive(this.wrap(this.useSecondPower(action.target)));
        return true;
      case 'trade':
        this.drive(this.wrap(this.trade(action.handUid)));
        return true;
      case 'location':
        this.drive(this.wrap(this.activateLocation(action.uid, action.target)));
        return true;
      case 'launch':
        this.drive(this.wrap(this.doLaunch()));
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
      case 'prepare': {
        const hc = p.hand.find((h) => h.uid === action.handUid);
        if (!hc) return { ok: false };
        if (!this.handDef(hc).prepare && !hc.canPrepare) return { ok: false, reason: '這張卡沒有預備' };
        if (p.mana < 1) return { ok: false, reason: '法力不足' };
        return { ok: true };
      }
      case 'play': {
        const r = this.canPlay(action.handUid, action.option, action.side);
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
        if (!this.canHeroPower(action.option)) return { ok: false, reason: '無法使用英雄能力' };
        const def = this.powerDef(p);
        if (def.chooseOne && (action.option === undefined || !def.chooseOne[action.option])) return { ok: false, reason: '請選擇一個選項' };
        const req = this.powerTarget(p, action.option);
        if (req) {
          const valid = this.validTargets(req, s.current, true);
          if (action.target === undefined || !valid.includes(action.target)) return { ok: false, reason: '請選擇目標' };
        }
        return { ok: true };
      }
      case 'heroPower2': {
        const r = this.canSecondPower();
        if (!r.ok) return r;
        const spec = this.secondPowerSpec(p)!;
        if (spec.target) {
          const valid = this.validTargets(spec.target, s.current, true);
          if (action.target === undefined || !valid.includes(action.target)) return { ok: false, reason: '請選擇目標' };
        }
        return { ok: true };
      }
      case 'trade': {
        const hc = p.hand.find((h) => h.uid === action.handUid);
        if (!hc) return { ok: false };
        if (!this.handDef(hc).keywords?.includes('TRADEABLE')) return { ok: false, reason: '不可交易' };
        if (p.mana < 1 || !p.deck.length) return { ok: false, reason: '法力不足' };
        return { ok: true };
      }
      case 'location': {
        const loc = p.locations?.find((l) => l.uid === action.uid);
        if (!loc) return { ok: false, reason: '找不到地點' };
        if (loc.cooldown > 0) return { ok: false, reason: `冷卻中（還要 ${loc.cooldown} 個回合）` };
        const req = getCard(loc.cardId).target;
        if (req) {
          const valid = this.validTargets(req, s.current, true);
          if (valid.length) {
            if (action.target === undefined || !valid.includes(action.target)) return { ok: false, reason: '請選擇目標' };
          } else if (!req.optional) return { ok: false, reason: '沒有可選擇的目標' };
        }
        return { ok: true };
      }
      case 'launch':
        return this.canLaunch();
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
    if (m.keywords.includes(k) || m.tempKeywords.includes(k) || m.nextTurnKeywords.includes(k) || m.auraKeywords.includes(k)) return true;
    if (!m.silenced) {
      const def = getCard(m.cardId);
      // 犀牛之靈：你的突襲手下在被召喚的回合免疫
      if (k === 'IMMUNE' && m.summonedTurn === this.s.turn && m.keywords.includes('RUSH') && this.flagOnBoard('rushImmune', m.owner)) return true;
      // 生存專家：沒有其他手下時免疫
      if (k === 'IMMUNE' && def.flags?.includes('minionImmuneAlone') && !this.s.players[m.owner].board.some((x) => x !== m && !x.dead && x.hp > 0)) return true;
      // 綴鱗矛兵：所有敵方手下具有嘲諷
      if (k === 'TAUNT' && this.flagOnBoard('enemyTaunt', opp(m.owner))) return true;
      // 幻光逐夢馬：在對手的回合具有法術免疫
      if (k === 'ELUSIVE' && (def.flags?.includes('elusiveOnOppTurn') || m.elusiveOpp) && this.s.current !== m.owner) return true;
      // 聖光楷模：攻擊力 3 以上時具有嘲諷與生命竊取
      if (def.kwIf?.keywords.includes(k) && this.evalCond(def.kwIf.cond, { ...this.baseCtx(m.owner), sourceUid: m.uid })) return true;
    }
    const grants = this.s.players[m.owner].grants;
    if (!grants.length) return false;
    return grants.some((g) => {
      if (g.keyword !== k) return false;
      if (!g.race) return true;
      const races = getCard(m.cardId).races ?? [];
      return races.includes(g.race) || races.includes('ALL');
    });
  }

  atkOf(c: Char): number {
    if (isHero(c)) {
      const p = this.s.players[c.owner];
      const weapon = p.weapon && this.s.current === c.owner ? this.weaponAtk(p) : 0;
      const aura = p.board.reduce(
        (sum, m) => sum + (m.silenced ? 0 : m.auras.filter((a) => a.scope === 'friendlyHero').reduce((x, a) => x + (a.atk ?? 0), 0)),
        0,
      );
      return Math.max(0, c.tempAtk + weapon + (this.s.current === c.owner ? aura : 0));
    }
    if (!c.silenced && getCard(c.cardId).flags?.includes('atkEqualsHealth')) return Math.max(0, c.hp);
    // 焦油暴君：在對手的回合 +6 攻擊力
    const tyrant = !c.silenced && this.s.current !== c.owner && getCard(c.cardId).flags?.includes('tarTyrant') ? 6 : 0;
    const enrage = c.enrageAtk && c.hp < c.maxHp ? c.enrageAtk : 0;
    const linger = c.lingerAtk?.reduce((x, l) => x + l.amount, 0) ?? 0;
    const bonus = this.s.players[c.owner].minionAtkBonus ?? 0;
    const cond = c.silenced ? 0 : this.atkIfBonus(getCard(c.cardId), c.owner) + this.atkPerBonus(getCard(c.cardId), c.owner, c.uid);
    return Math.max(0, c.baseAtk + c.atkBuff + c.tempAtk + c.auraAtk + enrage + linger + bonus + cond + tyrant);
  }

  /** 武器目前的攻擊力（含「在你有法術傷害時 +2 攻擊力」這類條件加成） */
  weaponAtk(p: PlayerState): number {
    if (!p.weapon) return 0;
    const def = getCard(p.weapon.cardId);
    return Math.max(0, p.weapon.atk + this.atkIfBonus(def, p.id) + this.atkPerBonus(def, p.id, p.weapon.uid));
  }

  private atkPerBonus(def: CardDef, owner: PlayerId, uid: number): number {
    return def.atkPer !== undefined ? this.amount(def.atkPer, { ...this.baseCtx(owner), sourceUid: uid }) : 0;
  }

  private atkIfBonus(def: CardDef, owner: PlayerId): number {
    return def.atkIf && this.evalCond(def.atkIf.cond, this.baseCtx(owner)) ? def.atkIf.atk : 0;
  }

  /** 場上（某位玩家的，或雙方的）是否有具備某特殊規則的手下 */
  flagOnBoard(flag: MinionFlag, pid?: PlayerId): boolean {
    return this.flagCount(flag, pid) > 0;
  }

  flagCount(flag: MinionFlag, pid?: PlayerId): number {
    let n = 0;
    for (const p of this.s.players) {
      if (pid !== undefined && p.id !== pid) continue;
      for (const m of p.board) if (!m.silenced && !m.dead && m.hp > 0 && getCard(m.cardId).flags?.includes(flag)) n++;
      for (const id of p.passives ?? []) if (PASSIVE_FLAGS[id]?.includes(flag)) n++;
    }
    return n;
  }

  /** 你裝備了「麥迪文的法杖」：你的法術的傷害與治療加倍 */
  private doublesSpells(p: PlayerState): boolean {
    return !!p.weapon && !!getCard(p.weapon.cardId).flags?.includes('doubleSpellPower');
  }

  /** 辛德拉苟薩 / 瑪里苟斯：場上有此手下，而且你控制另一條龍 */
  private dragonLord(p: PlayerState, flag: MinionFlag): boolean {
    return p.board.some((m) => !m.silenced && !m.dead && m.hp > 0 && getCard(m.cardId).flags?.includes(flag) && p.board.some((o) => o !== m && !o.dead && o.hp > 0 && this.isRace(o.cardId, 'DRAGON')));
  }

  spellDamage(p: PlayerId): number {
    const pl = this.s.players[p];
    let n = pl.board.reduce((sum, m) => sum + (m.silenced ? 0 : m.spellDamage + (m.hp < m.maxHp && getCard(m.cardId).flags?.includes('spellDamage2Damaged') ? 2 : 0)), 0);
    // 叢林梟獸：雙方都有法術傷害 +2
    n += 2 * this.flagCount('bothSpellDamage2');
    // 魔導師長袍
    if (pl.passives?.includes('LOOTA_825')) n += 3;
    // 星界特使：本回合下一張法術額外的法術傷害
    if (pl.nextSpellPower?.turn === this.s.turn) n += pl.nextSpellPower.amount;
    if (pl.spellDmgTurn?.turn === this.s.turn) n += pl.spellDmgTurn.n;
    return n;
  }

  /** 手牌的卡牌定義（殭屍獸會合成兩個部位） */
  handDef(hc: HandCard): CardDef {
    if (hc.starship) return starshipDef(hc.cardId, hc.starship);
    if (hc.potion) return potionDef(hc.cardId, hc.potion);
    if (hc.trial) return trialDef(hc.cardId, hc.trial);
    return hc.parts ? zombeastDef(hc.parts) : getCard(hc.cardId);
  }

  /** 場上手下的卡牌定義 */
  minionDef(m: Minion): CardDef {
    if (m.starship) return starshipDef(m.cardId, m.starship);
    return m.parts ? zombeastDef(m.parts) : getCard(m.cardId);
  }

  // ==========================================================================
  // 克蘇恩
  // ==========================================================================

  /** 你的克蘇恩目前的攻擊力（在場上就看場上的，否則是 6 + 累積加成） */
  cthunAttack(pid: PlayerId): number {
    const p = this.s.players[pid];
    let best = (getCard(CTHUN_ID).attack ?? 6) + (p.cthun?.atk ?? 0);
    for (const m of p.board) if (isCthun(m.cardId) && !m.dead) best = Math.max(best, this.atkOf(m));
    return best;
  }

  /** 手牌中卡牌目前的攻擊力 / 生命值（含手牌增益與克蘇恩的累積加成） */
  handStats(pid: PlayerId, hc: HandCard): { atk: number; hp: number } {
    const def = this.handDef(hc);
    const bonus = isCthun(hc.cardId) ? this.s.players[pid].cthun : undefined;
    const extra = def.type === 'MINION' ? this.s.players[pid].minionAtkBonus ?? 0 : 0;
    return { atk: (def.attack ?? 0) + hc.atkBuff + (bonus?.atk ?? 0) + extra, hp: (def.health ?? 0) + hc.hpBuff + (bonus?.hp ?? 0) };
  }

  /**
   * 賦予你的克蘇恩加成。加成記在玩家身上：手牌、牌堆裡（包括之後才拿到）的克蘇恩都會有，
   * 場上的克蘇恩直接獲得；克蘇恩眼柄無論在哪裡都會跟著成長。
   */
  cthunBuff(pid: PlayerId, atk: number, hp: number, taunt: boolean) {
    const p = this.s.players[pid];
    const c = (p.cthun ??= { atk: 0, hp: 0, taunt: false });
    c.atk += atk;
    c.hp += hp;
    if (taunt) c.taunt = true;
    const grow = (match: (id: string) => boolean, a: number, h: number, t: boolean, inHand: boolean) => {
      if (inHand) {
        for (const hc of [...p.hand, ...p.deck]) {
          if (!match(hc.cardId)) continue;
          hc.atkBuff += a;
          hc.hpBuff += h;
        }
      }
      for (const m of p.board) {
        if (!match(m.cardId) || m.dead) continue;
        m.atkBuff += a;
        m.maxHp += h;
        m.hp += h;
        if (t && !m.keywords.includes('TAUNT')) m.keywords.push('TAUNT');
      }
    };
    grow(isCthun, atk, hp, taunt, false);
    if (atk > 0 || hp > 0) grow(isEyestalk, Math.max(0, atk), Math.max(0, hp), false, true);
    this.log(pid, `克蘇恩獲得 +${atk}/+${hp}${taunt ? ' 與嘲諷' : ''}（目前 ${this.cthunAttack(pid)} 攻擊力）`);
  }

  /** 手牌是否具有回音（卡牌本身，或場上有「你手牌中的手下具有回音」） */
  hasEcho(pid: PlayerId, hc: HandCard): boolean {
    const def = this.handDef(hc);
    if (def.keywords?.includes('ECHO')) return true;
    if (def.type !== 'MINION') return false;
    return this.s.players[pid].board.some(
      (m) => !m.silenced && m.auras.some((a) => a.scope === 'friendlyHand' && a.keywords?.includes('ECHO')),
    );
  }

  costOf(p: PlayerState, hc: HandCard): number {
    const def = this.handDef(hc);
    let cost = (def.costIf && this.evalCond(def.costIf.cond, { ...this.baseCtx(p.id), playedCard: hc }, hc.uid) ? def.costIf.cost : def.cost) + hc.costMod;
    if (hc.costTurn?.turn === this.s.turn) cost -= hc.costTurn.amount;
    // 碧藍女王辛德拉苟薩：你控制另一條龍時，奧術法術消耗減少 (2)
    if (def.type === 'SPELL' && def.spellSchool === 'ARCANE' && this.dragonLord(p, 'sindragosaArcane')) cost -= 2;
    // 緩慢動作：這個回合你的卡牌消耗增加
    if (p.cardTax?.turn === this.s.turn) cost += p.cardTax.amount;
    // 流放：在手牌最左或最右時的消耗
    if (def.outcastCost !== undefined) {
      const i = p.hand.indexOf(hc);
      if (i === 0 || i === p.hand.length - 1) cost += def.outcastCost - def.cost;
    }
    // 每回合的第一張法術（例如薩塔隱蔽力場）
    if (def.type === 'SPELL' && !p.spellsThisTurn && p.id === this.s.current) {
      for (const m of p.board) {
        if (m.silenced) continue;
        for (const a of m.auras) if (a.scope === 'firstSpellDiscount') cost -= a.cost ?? 0;
      }
    }
    // 深暗領域：聖契、惡魔、神族的折扣
    if (def.libram && p.libramDiscount) cost -= p.libramDiscount;
    if (p.nonStartDemonDiscount && !hc.starting && (def.races?.includes('DEMON') || def.races?.includes('ALL'))) cost -= p.nonStartDemonDiscount;
    if (def.protoss && def.type === 'MINION' && p.protossMinionDiscount) cost -= p.protossMinionDiscount;
    // 莫穆爾：你的戰吼手下消耗 (1)
    if (def.type === 'MINION' && def.abilities?.some((a) => a.on.k === 'play') && this.flagOnBoard('murmur', p.id)) cost = 1;
    // 地城探險：被動寶藏對消耗的影響
    if (p.passives?.length) {
      if (def.type === 'MINION' && p.passives.includes('LOOTA_803') && cost > 5) cost = 5;
      if (def.type === 'WEAPON' && p.passives.includes('LOOTA_818')) cost = 1;
      if (def.type === 'SPELL' && p.passives.includes('LOOTA_824')) cost -= 1;
    }
    if (def.type === 'MINION' && this.s.players[opp(p.id)].passives?.includes('LOOTA_831')) cost += 1;
    if (def.type === 'MINION' && p.freeMinionsTurn === this.s.turn) cost = 0;
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
    // 破壞！：與這張牌相鄰的牌消耗增加
    {
      const i = p.hand.indexOf(hc);
      for (const n of [p.hand[i - 1], p.hand[i + 1]]) if (n && i >= 0) cost += getCard(n.cardId).adjacentCostUp ?? 0;
    }
    // 地脈消耗減少（地脈行者）
    if (p.leyline?.discount && LEYLINES.includes(def.id)) cost -= p.leyline.discount;
    if (p.nextCardDiscount && p.id === this.s.current) cost -= p.nextCardDiscount;
    // 瑪格的魔法：每回合的第一個手下消耗減少 (2)（第 3 回合起）
    if (def.type === 'MINION' && p.mug && p.id === this.s.current && p.maxMana >= 3 && !this.minionPlayedThisTurn(p)) cost -= 2;
    if (def.type === 'SPELL' && p.nextSpellDiscount?.turn === this.s.turn && p.id === this.s.current) cost -= p.nextSpellDiscount.amount;
    if (def.type === 'MINION' && p.minionTax?.turn === this.s.turn) cost += p.minionTax.amount;
    if (def.type === 'SPELL' && p.spellTax?.turn === this.s.turn) cost += p.spellTax.amount;
    if (p.battlecryTax?.turn === this.s.turn && def.type !== 'SPELL' && def.abilities?.some((a) => a.on.k === 'play')) cost += p.battlecryTax.amount;
    // 「你的下一張龍消耗減少 (2)」這類效果，以及設為固定消耗的效果（最後套用）
    let setTo: number | undefined;
    const set = (n: number) => (setTo = setTo === undefined ? n : Math.min(setTo, n));
    for (const d of this.activeDiscounts(p, def, hc)) {
      cost -= d.amount ?? 0;
      if (d.set !== undefined) set(d.set);
    }
    // 場上手下的消耗光環（例如艾維娜、奈幽巴蛛網領主）
    for (const pl of this.s.players) {
      for (const m of pl.board) {
        if (m.silenced || m.dead || m.hp <= 0) continue;
        for (const a of getCard(m.cardId).costAuras ?? []) {
          if (a.side !== 'both' && (a.side === 'friendly') !== (pl.id === p.id)) continue;
          if (a.type && def.type !== a.type) continue;
          if (a.secret && !def.secret) continue;
          if (a.hasBattlecry && !(def.type === 'MINION' && def.abilities?.some((ab) => ab.on.k === 'play'))) continue;
          if (a.hasDeathrattle && !def.abilities?.some((ab) => ab.on.k === 'deathrattle')) continue;
          if (a.race && !(def.races?.includes(a.race) || def.races?.includes('ALL'))) continue;
          if (a.firstCard && (p.id !== this.s.current || p.cardsPlayedThisTurn > 0)) continue;
          if (a.firstOfRace && a.race && (p.id !== this.s.current || (p.playedThisTurn?.turn === this.s.turn && p.playedThisTurn.ids.some((id) => getCard(id).races?.includes(a.race!))))) continue;
          if (a.everyThird && (p.id !== this.s.current || (p.playedThisTurn?.turn === this.s.turn ? p.playedThisTurn.ids.filter((id) => getCard(id).type === 'MINION').length : 0) % 3 !== 2)) continue;
          if (a.add) cost = a.floor !== undefined ? Math.max(Math.min(cost, a.floor), cost + a.add) : cost + a.add;
          if (a.set !== undefined) set(a.set);
        }
      }
    }
    // 艾維娜：滿月升起後，你的牌消耗為 (1)
    if (p.fullMoon) set(1);
    // 洛：你的手下消耗固定為這個值
    if (def.type === 'MINION' && p.minionCostSet !== undefined) set(p.minionCostSet);
    if (setTo !== undefined) cost = setTo;
    // 回音卡的消耗不會低於 1
    return Math.max(this.hasEcho(p.id, hc) ? Math.min(1, def.cost) : 0, cost);
  }

  /** 預兆的力量倍率：預兆 0~1 次 = 1，2~3 次 = 2，4 次以上 = 4 */
  heraldPower(p: PlayerState): number {
    const n = p.heralds ?? 0;
    return n >= 4 ? 4 : n >= 2 ? 2 : 1;
  }

  private minionPlayedThisTurn(p: PlayerState): boolean {
    return p.playedThisTurn?.turn === this.s.turn && p.playedThisTurn.ids.some((id) => getCard(id).type === 'MINION');
  }

  /** 目前對這張牌有效的「下一張牌」消耗變化 */
  private activeDiscounts(p: PlayerState, def: CardDef, hc?: HandCard): PendingDiscount[] {
    if (!p.pendingDiscounts?.length || p.id !== this.s.current) return [];
    return p.pendingDiscounts.filter((d) => {
      if (d.turn !== undefined && d.turn !== this.s.turn) return false;
      if (d.type && def.type !== d.type) return false;
      if (d.maxCost !== undefined && def.cost > d.maxCost) return false;
      if (d.secret && !def.secret) return false;
      if (d.temporary && !hc?.temporary) return false;
      if (d.battlecry && !(def.type === 'MINION' && def.abilities?.some((a) => a.on.k === 'play'))) return false;
      if (d.nameEn && !def.nameEn.includes(d.nameEn)) return false;
      if (d.combo && !JSON.stringify(def.abilities ?? []).includes('"c":"combo"')) return false;
      if (d.race && !(def.races?.includes(d.race) || def.races?.includes('ALL'))) return false;
      if (d.protoss && !def.protoss) return false;
      if (d.zerg && !def.zerg) return false;
      if (d.libram && !def.libram) return false;
      return true;
    });
  }

  /** 這張卡用什麼支付：法力、生命值或屍體 */
  costKind(p: PlayerState, hc: HandCard): 'mana' | 'health' | 'corpses' | 'oppHealth' {
    const def = this.handDef(hc);
    if (this.activeDiscounts(p, def, hc).some((d) => d.oppHealth)) return 'oppHealth';
    if (def.costsCorpses || (p.nextCardCorpsesTurn === this.s.turn && p.id === this.s.current)) return 'corpses';
    if (def.costsHealth || (hc.healthCostUntil ?? -1) >= this.s.turn) return 'health';
    if (this.activeDiscounts(p, def).some((d) => d.health)) return 'health';
    if (def.costsHealthIf && this.evalCond(def.costsHealthIf, this.baseCtx(p.id))) return 'health';
    return 'mana';
  }

  /** 付得起這張卡嗎（生命值不能付到自己死掉） */
  private canAfford(p: PlayerState, hc: HandCard): boolean {
    const cost = this.costOf(p, hc);
    switch (this.costKind(p, hc)) {
      case 'health':
        return cost < p.hero.hp;
      case 'corpses':
        return cost <= (p.corpses ?? 0);
      case 'oppHealth':
        return true;
      default:
        return cost <= p.mana;
    }
  }

  cardIsSpell(handUid: number): boolean {
    const hc = this.handCard(handUid);
    return !!hc && this.handDef(hc.card).type === 'SPELL';
  }

  canPlay(handUid: number, option?: number, side?: 'enemy'): { ok: boolean; reason?: string } {
    const s = this.s;
    const p = s.players[s.current];
    const hc = p.hand.find((h) => h.uid === handUid);
    if (!hc) return { ok: false, reason: '找不到卡牌' };
    const def = this.handDef(hc);
    if (side === 'enemy') {
      if (!def.disguised) return { ok: false, reason: '只有偽裝手下可以打在對手的戰場上' };
      if (s.players[opp(p.id)].board.length >= MAX_BOARD) return { ok: false, reason: '對手的場上已滿' };
    }
    if (hc.lockedUntil !== undefined && hc.lockedUntil >= s.turn) return { ok: false, reason: '這張牌這個回合不能打出' };
    if (hc.lockPlayedAt !== undefined && (p.playedCards?.length ?? 0) <= hc.lockPlayedAt) return { ok: false, reason: '要先打出另一張牌才能打出這張牌' };
    if (p.onlyPlay?.turn === s.turn && def.type !== p.onlyPlay.type) return { ok: false, reason: p.onlyPlay.type === 'MINION' ? '這個回合只能打出手下牌' : '這個回合只能打出法術牌' };
    if (p.edgeOnlyTurn === s.turn && p.hand.indexOf(hc) !== 0 && p.hand.indexOf(hc) !== p.hand.length - 1) return { ok: false, reason: '這個回合只能打出最左與最右的牌' };
    if (!this.canAfford(p, hc)) {
      const kind = this.costKind(p, hc);
      return { ok: false, reason: kind === 'health' ? '生命值不足' : kind === 'corpses' ? '屍體不足' : '法力不足' };
    }
    if (def.type === 'MINION' && side !== 'enemy' && p.board.length >= MAX_BOARD) return { ok: false, reason: '場上已滿' };
    if (def.type === 'LOCATION' && p.board.length + (p.locations?.length ?? 0) >= MAX_BOARD) return { ok: false, reason: '場上已滿' };
    if (def.quest && p.quest) return { ok: false, reason: '已經有進行中的任務' };
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
    const def = this.handDef(p.hand[idx]);
    if (def.type === 'LOCATION') return null;
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
        // 狗頭人武僧：你的英雄無法成為法術或英雄能力的目標
        if (isHero(c)) return !(bySpell && c.owner !== player && this.flagOnBoard('heroElusive', c.owner));
        if (c.owner !== player && this.hasKw(c, 'STEALTH')) return false;
        if (bySpell && this.hasKw(c, 'ELUSIVE')) return false;
        return true;
      })
      .map((c) => c.uid);
  }

  /** 玩家目前的英雄能力（打出英雄卡、審判者瑪瑞爾等效果會換掉） */
  powerDef(p: PlayerState): HeroPowerSpec {
    if (p.heroPower.heroCard) {
      const hp = getCard(p.heroPower.heroCard).heroPower;
      if (hp) return hp;
    }
    const spec = powerSpecById(p.heroPower.id) ?? HERO_POWERS[p.heroClass];
    // 熱砂狙擊手：獵人的英雄能力可以指定手下為目標
    if ((spec === HERO_POWERS.HUNTER || spec === EXTRA_POWERS.HERO_05bp2) && this.flagOnBoard('heroPowerTargetMinions', p.id)) {
      const hit = spec.effects[0];
      return { effects: [{ e: 'damage', target: { t: 'chosen' }, amount: hit.e === 'damage' ? hit.amount : 2 }], target: { filter: { type: 'character', side: 'any' } } };
    }
    return spec;
  }

  /** 顯示用的英雄能力名稱、敘述與目前的消耗 */
  powerInfo(p: PlayerState): { name: string; text: string; cost: number } {
    const cost = this.heroPowerCost(p);
    if (p.heroPower.heroCard) {
      const hp = getCard(p.heroPower.heroCard).heroPower;
      if (hp) return { name: hp.name, text: hp.text, cost };
    }
    const info = POWER_INFO[p.heroPower.id] ?? Object.values(HEROES).find((h) => h.power.id === p.heroPower.id)?.power ?? HEROES[p.heroClass].power;
    return { name: info.name, text: info.text, cost };
  }

  /** 英雄能力目前的消耗 */
  heroPowerCost(p: PlayerState): number {
    let cost = p.powerCostSet ?? p.heroPower.cost;
    // 奎爾多雷弓箭手：手牌只有 3 張以下時，英雄能力消耗為 (0)
    if (this.flagOnBoard('heroPowerFreeSmallHand', p.id) && p.hand.length <= 3) cost = 0;
    if (this.flagOnBoard('heroPowerCost1', p.id)) cost = Math.min(cost, 1);
    if (p.powerTax?.turn === this.s.turn) cost += p.powerTax.amount;
    cost -= p.powerDiscount ?? 0;
    return Math.max(0, cost);
  }

  /** 英雄能力每回合可以使用的次數 */
  maxPowerUses(p: PlayerState): number {
    if (this.flagOnBoard('heroPowerUnlimited', p.id)) return UNLIMITED_POWER_USES;
    return this.flagOnBoard('heroPowerTwice', p.id) ? 2 : 1;
  }

  /** 換成另一個英雄能力（可以立即使用） */
  private setHeroPower(p: PlayerState, id: string) {
    p.heroPower = { id, used: false, uses: 0, cost: POWER_INFO[id]?.cost ?? 2 };
    this.log(p.id, `${p.name}的英雄能力變成了【${this.powerInfo(p).name}】`);
  }

  private powerTarget(p: PlayerState, option?: number): TargetReq | undefined {
    const def = this.powerDef(p);
    if (def.chooseOne) return option === undefined ? undefined : def.chooseOne[option]?.target;
    return def.target;
  }

  heroPowerOptions(): { id: string; name?: string; text?: string }[] | null {
    return this.powerDef(this.me).chooseOne ?? null;
  }

  heroPowerTargets(option?: number): number[] {
    const req = this.powerTarget(this.me, option);
    return req ? this.validTargets(req, this.s.current, true) : [];
  }

  heroPowerNeedsTarget(option?: number): boolean {
    return !!this.powerTarget(this.me, option);
  }

  canHeroPower(option?: number): boolean {
    const p = this.me;
    if (this.flagOnBoard('noHeroPowers')) return false;
    if (this.powerDef(p).passive) return false;
    if (p.heroPower.used && (p.heroPower.uses ?? 1) >= this.maxPowerUses(p)) return false;
    if (p.mana < this.heroPowerCost(p)) return false;
    const def = this.powerDef(p);
    if (def.needsBoardSpace && p.board.length >= MAX_BOARD) return false;
    if (def === HERO_POWERS.SHAMAN && BASIC_TOTEMS.every((t) => p.board.some((m) => m.cardId === t))) return false;
    if (def.chooseOne) {
      const opts = option === undefined ? def.chooseOne.map((_o, i) => i) : [option];
      return opts.some((i) => {
        const req = def.chooseOne![i]?.target;
        return !!def.chooseOne![i] && (!req || this.validTargets(req, this.s.current, true).length > 0);
      });
    }
    if (def.target && !this.validTargets(def.target, this.s.current, true).length) return false;
    return true;
  }

  /** 第二個英雄能力（血腥醫生薩蕾娜）的效果 */
  secondPowerSpec(p: PlayerState): HeroPowerSpec | undefined {
    return p.heroPower2 ? EXTRA_POWERS[p.heroPower2.id] : undefined;
  }

  secondPowerInfo(p: PlayerState): { name: string; text: string; cost: number } | null {
    if (!p.heroPower2) return null;
    const info = POWER_INFO[p.heroPower2.id];
    return { name: info?.name ?? '英雄能力', text: info?.text ?? '', cost: p.heroPower2.cost };
  }

  canSecondPower(): { ok: boolean; reason?: string } {
    const p = this.me;
    const spec = this.secondPowerSpec(p);
    if (!spec || !p.heroPower2) return { ok: false, reason: '沒有第二個英雄能力' };
    if (this.flagOnBoard('noHeroPowers')) return { ok: false, reason: '無法使用英雄能力' };
    if (p.heroPower2.used) return { ok: false, reason: '本回合已使用過' };
    if ((p.corpses ?? 0) < p.heroPower2.cost) return { ok: false, reason: '屍體不足' };
    if (spec.target && !this.validTargets(spec.target, this.s.current, true).length) return { ok: false, reason: '沒有可選擇的目標' };
    return { ok: true };
  }

  secondPowerTargets(): number[] {
    const spec = this.secondPowerSpec(this.me);
    return spec?.target ? this.validTargets(spec.target, this.s.current, true) : [];
  }

  private *useSecondPower(target: number | undefined): Gen {
    const p = this.me;
    const spec = this.secondPowerSpec(p)!;
    this.spendCorpses(p, p.heroPower2!.cost);
    p.heroPower2!.used = true;
    p.heroPowersUsed++;
    this.log(p.id, `${p.name}使用了第二個英雄能力【${this.secondPowerInfo(p)!.name}】`);
    this.fx({ kind: 'play', cardId: p.heroPower2!.id, player: p.id, target });
    const ctx = this.baseCtx(p.id);
    ctx.sourceUid = p.hero.uid;
    ctx.sourceCardId = p.heroPower2!.id;
    ctx.chosen = target ?? null;
    ctx.isHeroPower = true;
    yield* this.runEffects(spec.effects, ctx);
    yield* this.emit({ k: 'heroPower', player: p.id });
    yield* this.checkSecrets(opp(p.id), 'enemyHeroPower', {});
    // 惡魔變身：用兩次後換回原本的英雄能力
    if (p.heroPower.id === 'BT_429p') {
      this.setHeroPower(p, 'BT_429p2');
      p.heroPower.used = true;
    } else if (p.heroPower.id === 'BT_429p2' && p.powerSwap) {
      const back = p.powerSwap.back;
      p.powerSwap = undefined;
      this.setHeroPower(p, back);
      p.heroPower.used = true;
    }
  }

  maxAttacks(c: Char): number {
    if (isHero(c)) {
      const w = this.s.players[c.owner].weapon;
      if (w && getCard(w.cardId).flags?.includes('unlimitedAttacks')) return 99;
      if (this.flagOnBoard('heroWindfury', c.owner)) return 2;
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
      if (this.hasKw(c, 'CANT_ATTACK') && c.canAttackTurn !== s.turn) return false;
      if (this.hasKw(c, 'DORMANT')) return false;
      const def = getCard(c.cardId);
      if (!c.silenced && def.attackIf && !this.evalCond(def.attackIf, { ...this.baseCtx(c.owner), sourceUid: c.uid })) return false;
      if (!c.silenced && def.flags?.includes('noAttackDamaged') && c.hp < c.maxHp) return false;
      if (c.sleeping && !this.hasKw(c, 'CHARGE') && !this.hasKw(c, 'RUSH')) return false;
    }
    return this.attackTargets(uid).length > 0;
  }

  attackTargets(uid: number): number[] {
    const c = this.char(uid);
    if (!c) return [];
    const enemy = this.s.players[opp(c.owner)];
    const minions = enemy.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH') && !this.hasKw(m, 'DORMANT'));
    // 凱恩日怒：你的所有攻擊都無視嘲諷
    const taunts = this.flagOnBoard('ignoreTaunt', c.owner) ? [] : minions.filter((m) => this.hasKw(m, 'TAUNT'));
    let targets: Char[] = taunts.length ? taunts : minions;
    let heroAllowed = !taunts.length;
    if (!isHero(c)) {
      if (this.hasKw(c, 'CANT_ATTACK_HEROES')) heroAllowed = false;
      if (c.sleeping && !this.hasKw(c, 'CHARGE')) heroAllowed = false; // 突襲
    } else if (this.s.players[c.owner].weapon?.keywords.includes('CANT_ATTACK_HEROES')) heroAllowed = false;
    if (heroAllowed) targets = [...targets, enemy.hero];
    return targets.map((t) => t.uid);
  }

  alive(c: Char): boolean {
    if (isHero(c)) return c.hp > 0;
    return c.hp > 0 && !c.dead;
  }

  /** 莫古的勇士（50% 攻擊錯誤的敵人）與諾格弗格市長（目標隨機）改變攻擊目標 */
  private redirectAttack(attackerUid: number, targetUid: number): number {
    const a = this.char(attackerUid);
    if (!a) return targetUid;
    const misdirect = isHero(a)
      ? !!this.s.players[a.owner].weapon && !!getCard(this.s.players[a.owner].weapon!.cardId).flags?.includes('misdirect')
      : (!a.silenced && !!getCard(a.cardId).flags?.includes('misdirect')) || this.flagOnBoard('allMisdirect');
    if (misdirect && nextRandom(this.s) < 0.5) {
      const foe = this.s.players[opp(a.owner)];
      const others = [foe.hero, ...foe.board].filter((c) => c.uid !== targetUid && this.alive(c) && (isHero(c) || (!this.hasKw(c, 'STEALTH') && !this.hasKw(c, 'DORMANT'))));
      const t = pick(this.s, others);
      if (t) {
        this.log(a.owner, `${isHero(a) ? this.s.players[a.owner].name : this.name(a.cardId)}攻擊了錯誤的敵人！`);
        return t.uid;
      }
    }
    // 莫什奧格播報員：攻擊它的敵人有 50% 機率攻擊其他目標
    const d = this.minion(targetUid);
    if (d && !d.silenced && getCard(d.cardId).flags?.includes('redirectAttackers') && nextRandom(this.s) < 0.5) {
      const others = this.attackTargets(attackerUid).filter((x) => x !== targetUid);
      const t = pick(this.s, others);
      if (t !== undefined) return t;
    }
    if (this.flagOnBoard('randomTargets')) return pick(this.s, this.attackTargets(attackerUid)) ?? targetUid;
    return targetUid;
  }

  // ==========================================================================
  // 執行
  // ==========================================================================

  private drive(gen: Gen, first?: number) {
    let input = first;
    for (;;) {
      const r = gen.next(input as number);
      if (r.done) {
        if (this.rewindReq) this.applyRewind();
        return;
      }
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

  /** 星辰碰撞：起源之星與終結之星相鄰時，對所有敵人造成 5 點傷害 */
  private *starCheck(): Gen {
    for (const pl of this.s.players) {
      const i = pl.hand.findIndex((h) => h.cardId === 'GDB_118t');
      const j = pl.hand.findIndex((h) => h.cardId === 'GDB_118t2');
      if (i < 0 || j < 0 || Math.abs(i - j) !== 1) continue;
      pl.hand = pl.hand.filter((_h, k) => k !== i && k !== j);
      this.log(pl.id, '起源之星與終結之星相撞了！');
      yield* this.runEffects(
        [{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 5, spell: true }],
        { ...this.baseCtx(pl.id), sourceCardId: 'GDB_118t', isSpell: true },
      );
      yield* this.processDeaths();
    }
  }

  private *wrap(inner: Gen): Gen {
    yield* inner;
    yield* this.processDeaths();
    yield* this.starCheck();
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

  /** 開局效果（例如莫克札王子：把 5 張額外的傳說手下加入你的牌堆） */
  private courierBusy = false;

  /** 地點在某個條件下重新開啟 */
  /** 深暗領域：打出手下之後的效果（德萊尼佇列、莫穆爾…） */
  private *darkMinionPlayed(p: PlayerState, m: Minion, def: CardDef, hc: HandCard): Gen {
    const isDraenei = def.races?.includes('DRAENEI') || def.races?.includes('ALL');
    if (def.races?.includes('DEMON') && !hc.starting) (p.nonStartDemons ??= []).push(def.id);
    if (isDraenei && p.draeneiFx?.length && this.alive(m)) {
      const fxs = p.draeneiFx.filter((f) => f.src !== m.uid);
      p.draeneiFx = p.draeneiFx.filter((f) => f.src === m.uid);
      for (const fx of fxs) {
        if (--fx.n > 0) p.draeneiFx.push(fx);
        switch (fx.k) {
          case 'buff':
            m.atkBuff += fx.atk ?? 0;
            m.maxHp += fx.hp ?? 0;
            m.hp += fx.hp ?? 0;
            for (const k of fx.kw ?? []) if (!m.keywords.includes(k as Keyword)) m.keywords.push(k as Keyword);
            if (fx.kw?.includes('RUSH')) m.sleeping = false;
            break;
          case 'refresh':
            p.mana = Math.min(p.maxMana, p.mana + this.atkOf(m));
            break;
          case 'attack': {
            const t = pick(this.s, this.s.players[opp(p.id)].board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT')));
            if (t) yield* this.forceAttack(m, t);
            break;
          }
          case 'heroAtk':
            p.hero.tempAtk += this.atkOf(m);
            break;
          case 'overload':
            p.overloadOwed += 2;
            break;
          case 'copy':
            yield* this.doSummon({ ...this.baseCtx(p.id), sourceUid: m.uid, sourceCardId: m.cardId }, p.id, m.cardId);
            break;
          case 'bonus2':
            this.bonusEffect(m);
            this.bonusEffect(m);
            break;
        }
      }
    }
    if (isDraenei) (p.playedDraenei ??= []).push(def.id);
    // 莫穆爾：你的戰吼手下打出後立刻死亡
    if (def.abilities?.some((a) => a.on.k === 'play') && this.flagOnBoard('murmur', p.id) && this.alive(m)) m.dead = true;
  }

  /** 地城探險：Boss 被動 — 打出手下之後 */
  private *dungeonMinionPlayed(p: PlayerState, m: Minion): Gen {
    for (const pl of this.s.players) {
      const id = pl.heroPower.id;
      if (id === 'LOOTA_BOSS_31p' && pl.id === p.id && this.alive(m) && !m.keywords.includes('CHARGE')) {
        m.keywords.push('CHARGE');
        m.sleeping = false;
      }
      if (id === 'LOOTA_BOSS_47p' && this.alive(m)) yield* this.damage(this.dmgSource(this.baseCtx(pl.id)), m.uid, 2);
    }
  }

  /** 地城探險：Boss 被動 — 對手施放法術之後 */
  private *dungeonSpellCast(caster: PlayerState): Gen {
    const boss = this.s.players[opp(caster.id)];
    if (boss.heroPower.id === 'LOOTA_BOSS_19p') yield* this.doSummon(this.baseCtx(boss.id), boss.id, 'LOE_018');
    if (boss.heroPower.id === 'LOOTA_BOSS_33p') {
      const [hc] = yield* this.draw(boss, 1);
      if (hc) hc.costMod = 1 - getCard(hc.cardId).cost;
    }
  }

  private reopenLocations(p: PlayerState, kind: NonNullable<CardDef['reopen']>) {
    for (const l of p.locations ?? []) if (getCard(l.cardId).reopen === kind) l.cooldown = 0;
  }

  /** 灌注英雄能力：累積灌注次數，並換成該職業灌注後的英雄能力 */
  private doImbue(me: PlayerState, times = 1) {
    me.imbued = (me.imbued ?? 0) + times;
    const id = ({ ROGUE: 'END_000p', DEATHKNIGHT: 'END_003p', DRUID: 'EDR_847p', HUNTER: 'EDR_850p', MAGE: 'EDR_851p', PALADIN: 'EDR_445p', PRIEST: 'EDR_449p', SHAMAN: 'EDR_448p' } as Record<string, string>)[me.heroClass] ?? null;
    if (id && me.heroPower.id !== id && !me.heroPower.heroCard) {
      const used = me.heroPower.used;
      this.setHeroPower(me, id);
      me.heroPower.used = used;
    }
    this.log(me.id, `${me.name}灌注了英雄能力（${me.imbued}）`);
  }


  /** 休眠的手下甦醒時的效果 */
  private *awakenEffects(m: Minion): Gen {
    const ef = getCard(m.cardId).awaken;
    if (!ef) return;
    yield* this.runEffects(ef, { ...this.baseCtx(m.owner), sourceUid: m.uid, sourceCardId: m.cardId });
  }

  manaCap(p: PlayerState): number {
    return MAX_MANA + (p.manaCapBonus ?? 0);
  }

  /** 泰坦繪圖師歐斯克：在手牌中隨機獲得一個泰坦能力 */
  private oskRoll(hc: HandCard) {
    if (!getCard(hc.cardId).flags?.includes('osk')) return;
    const opts = OSK_VARIANTS.filter((id) => id !== hc.cardId && hasCard(id));
    const id = pick(this.s, opts);
    if (id) hc.cardId = id;
  }
  private gorishiBusy = false;

  private startOfGame(p: PlayerState) {
    for (const hc of [...p.deck]) {
      switch (getCard(hc.cardId).startOfGame) {
        case 'malchezaar': {
          const inDeck = new Set(p.deck.map((h) => getCard(h.cardId).name));
          const pool = poolCards({ type: 'MINION', rarity: 'LEGENDARY' }, p.heroClass, p.heroClass).filter(
            (c) => !inDeck.has(c.name) && (c.cardClass === 'NEUTRAL' || cardClasses(c).includes(p.heroClass)),
          );
          for (const c of shuffle(this.s, [...pool]).slice(0, 5)) p.deck.push(this.newHandCard(c.id));
          break;
        }
        case 'whizbang': {
          // 神奇的威茲邦：換成一副隨機的牌組（你的職業與中立的隨機卡）
          const pool = poolCards({}, p.heroClass, p.heroClass).filter((c) => c.type !== 'HERO' && !c.startOfGame && (c.cardClass === 'NEUTRAL' || cardClasses(c).includes(p.heroClass)));
          p.deck = Array.from({ length: 30 }, () => this.newHandCard(pick(this.s, pool)!.id)).map((h) => ({ ...h, starting: true }));
          return;
        }
        case 'moldara':
          // 孢子女皇莫爾達拉：把 7 個複製孢子洗入牌堆
          for (let i = 0; i < 7; i++) p.deck.push({ ...this.newHandCard('GDB_234t'), starting: true });
          break;
        case 'dragonSoul': {
          // 破碎的龍魂：分裂成 6 個相鄰的龍族精華
          const i = p.deck.indexOf(hc);
          const parts = ['CATA_EVENT_110t2', 'CATA_EVENT_110t3', 'CATA_EVENT_110t4', 'CATA_EVENT_110t5', 'CATA_EVENT_110t6', 'CATA_EVENT_110t7'].map((id) => ({ ...this.newHandCard(id), starting: true }));
          p.deck.splice(i, 1, ...parts);
          break;
        }
        case 'genn':
          // 吉恩‧葛雷邁恩：牌堆只有偶數消耗的卡時，英雄能力消耗為 (1)
          if (p.deck.every((h) => getCard(h.cardId).cost % 2 === 0)) p.heroPower.cost = 1;
          break;
        case 'hogger':
          // 破鏈者霍格：複製你牌堆中的全部其他傳說卡牌
          for (const h of [...p.deck]) if (h !== hc && getCard(h.cardId).rarity === 'LEGENDARY') p.deck.push({ ...this.newHandCard(h.cardId), starting: true });
          break;
        case 'beatrix': {
          // 指揮官碧翠絲：編組套牌時選擇一個消耗為 (2) 的手下，十個分身加入你的套牌（這裡由系統隨機挑一個）
          const pool = poolCards({ type: 'MINION', cost: 2 }, p.heroClass, p.heroClass).filter(
            (c) => c.rarity !== 'LEGENDARY' && !c.startOfGame && (c.cardClass === 'NEUTRAL' || cardClasses(c).includes(p.heroClass)),
          );
          const c = pick(this.s, pool);
          if (c) for (let i = 0; i < 10; i++) p.deck.push({ ...this.newHandCard(c.id), starting: true });
          break;
        }
        case 'azalina': {
          // 斬魂者阿薩琳娜：起始生命值為 40；你的牌堆有 20 張牌，加上敵方牌堆的 20 張複製品
          p.hero.hp = 40;
          p.hero.maxHp = 40;
          const rest = shuffle(this.s, p.deck.filter((h) => h !== hc)).slice(0, 19);
          const foe = this.s.players[opp(p.id)];
          const copies = shuffle(this.s, [...foe.deck]).slice(0, 20).map((h) => ({ ...this.newHandCard(h.cardId), starting: true, fromOpp: true }));
          p.deck = [hc, ...rest, ...copies];
          break;
        }
        case 'godfrey':
          p.godfrey = [];
          break;
        case 'twBroxigar':
          // 布洛克薩：對戰開始時消失，消滅 4 個阿古斯惡魔後回到你的手牌
          p.deck = p.deck.filter((h) => h !== hc);
          p.broxigar = hc;
          break;
        case 'twHideLlane': {
          // 萊恩國王：躲進對手的牌堆（躲避加羅娜）
          if (hc.hidden) break;
          const foeP = this.s.players[opp(p.id)];
          p.deck = p.deck.filter((h) => h !== hc);
          hc.hidden = true;
          foeP.deck.push(hc);
          break;
        }
        case 'nethrek':
          // 奈絲芮克大廚：牌堆只有消耗 (3) 以下的牌時，五回合後把法力改為 10 點
          if (p.deck.every((h) => getCard(h.cardId).cost <= 3)) p.chefTurn = 6;
          break;
        case 'mugzee': {
          // 瑪格吉：沒有其他手下就獲得瑪格的英雄能力；沒有法術就獲得吉的英雄能力
          const others = p.deck.filter((h) => h !== hc);
          if (!others.some((h) => getCard(h.cardId).type === 'MINION')) {
            p.mug = true;
            p.heroPower = { id: 'JAIL_800hp1', used: false, cost: 0 };
          }
          if (!others.some((h) => getCard(h.cardId).type === 'SPELL')) {
            p.zee = { minions: 0 };
            if (!p.mug) p.heroPower = { id: 'JAIL_800hp2', used: false, cost: 0 };
          }
          break;
        }
        case 'ysera':
          // 伊瑟拉：雙方玩家的法力水晶上限都增加 5
          for (const pl of this.s.players) pl.manaCapBonus = (pl.manaCapBonus ?? 0) + 5;
          break;
        case 'hamuul':
          // 哈穆爾：牌堆中的法術全是自然法術時灌注你的英雄能力
          if (p.deck.filter((h) => getCard(h.cardId).type === 'SPELL').every((h) => getCard(h.cardId).spellSchool === 'NATURE')) {
            p.imbued = (p.imbued ?? 0) + 1;
            p.heroPower = { id: 'EDR_847p', used: false, cost: POWER_INFO['EDR_847p']?.cost ?? 2 };
          }
          p.hamuulRepeat = true;
          break;
        case 'renathal':
          // 雷納薩爾親王：牌堆張數與起始生命值都是 40
          p.hero.hp = 40;
          p.hero.maxHp = 40;
          for (const h of shuffle(this.s, p.deck.filter((x) => x !== hc)).slice(0, 10)) p.deck.push({ ...this.newHandCard(h.cardId), starting: true });
          break;
        case 'benedictus':
          // 黑暗主教本尼迪塔斯：牌堆中的法術全是暗影法術時，進入暗影形態
          if (p.deck.filter((h) => getCard(h.cardId).type === 'SPELL').every((h) => getCard(h.cardId).spellSchool === 'SHADOW')) p.heroPower = { id: 'EX1_625t', used: false, cost: POWER_INFO['EX1_625t']?.cost ?? 2 };
          break;
        case 'baku':
          // 食月巨蟒巴庫：牌堆只有奇數消耗的卡時，強化英雄能力
          if (p.deck.every((h) => getCard(h.cardId).cost % 2 === 1)) p.heroPower = { id: UPGRADED_POWER_IDS[p.heroClass], used: false, cost: POWER_INFO[UPGRADED_POWER_IDS[p.heroClass]]?.cost ?? 2 };
          break;
      }
    }
  }

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
    p.openingHand = p.hand.map((h) => h.cardId);
    if (s.players[0].mulliganDone && s.players[1].mulliganDone) {
      const second = s.players[opp(s.first)];
      if (!second.noCoin) second.hand.push(this.newHandCard('GAME_005'));
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
    p.maxMana = Math.min(this.manaCap(p), p.maxMana + 1);
    p.overloadLocked = p.overloadOwed;
    p.mana = Math.max(0, p.maxMana - p.overloadOwed);
    p.overloadOwed = 0;
    // 法力燃燒：這個回合少了法力水晶
    if (p.manaBurn?.turn === s.turn) p.mana = Math.max(0, p.mana - p.manaBurn.amount);
    p.heroPower.used = false;
    p.heroPower.uses = 0;
    if (p.heroPower2) p.heroPower2.used = false;
    p.cardsPlayedThisTurn = 0;
    p.spellsThisTurn = 0;
    p.drawnThisTurn = 0;
    s.deathsThisTurn = 0;
    p.heroAttackedThisTurn = false;
    this.questProgress(p, 'surviveTurns');
    for (const pl of s.players) pl.nextCardDiscount = 0;
    p.elementalLastTurn = p.elementalThisTurn;
    p.elementalThisTurn = false;
    p.elementalsLastTurn = p.elementalsThisTurn ?? 0;
    p.elementalsThisTurn = 0;
    p.prevTurnSpells = p.turnSpells?.turn === s.turn - 2 || p.turnSpells?.turn === s.turn - 1 ? p.turnSpells.ids : [];
    p.hero.attacks = 0;
    for (const pl of s.players) pl.hero.immune = false;
    for (const m of p.board) {
      m.sleeping = false;
      m.attacks = 0;
      m.nextTurnKeywords = [];
    }
    for (const pl of s.players) for (const m of pl.board) if (m.lingerAtk) m.lingerAtk = m.lingerAtk.filter((l) => l.until !== pid);
    // 泰坦繪圖師歐斯克：每個回合在手牌中換一個泰坦能力
    for (const h of p.hand) this.oskRoll(h);
    // 石化食人魔：休眠時，在你的回合開始時 +2/+2（有 50% 的機率改為甦醒）
    for (const m of p.board) {
      if (m.dormantTurns !== undefined || !m.keywords.includes('DORMANT') || m.silenced || !getCard(m.cardId).flags?.includes('petrified')) continue;
      if (randomInt(s, 2) === 0) {
        m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
        this.log(pid, `${this.name(m.cardId)}甦醒了！`);
      } else {
        m.atkBuff += 2;
        m.maxHp += 2;
        m.hp += 2;
      }
    }
    // 休眠幾個回合後甦醒（在擁有者的回合開始時倒數）
    for (const m of p.board) {
      if (m.dormantTurns === undefined || !m.keywords.includes('DORMANT')) continue;
      if (--m.dormantTurns > 0) continue;
      m.dormantTurns = undefined;
      m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
      this.log(pid, `${this.name(m.cardId)}甦醒了！`);
      if (getCard(m.cardId).flags?.includes('stagSpirit')) yield* this.equip(pid, 'REV_360t4');
      yield* this.awakenEffects(m);
    }
    // 同族：記住你上個回合打出的牌
    p.prevPlayed = p.playedThisTurn && p.playedThisTurn.turn < s.turn ? p.playedThisTurn.ids : [];
    // 晝夜術士：手牌中的卡每回合消耗減少
    for (const h of p.hand) if (h.timeDiscount) h.costMod -= h.timeDiscount;
    // 地點牌的冷卻
    for (const l of p.locations ?? []) if (l.cooldown > 0) l.cooldown--;
    // 奈絲芮克大廚：五回合後把法力改為 10 點
    if (p.chefTurn !== undefined && --p.chefTurn <= 0) {
      p.chefTurn = undefined;
      p.maxMana = MAX_MANA;
      p.mana = Math.max(0, MAX_MANA - p.overloadLocked);
      this.log(pid, `${p.name}的法力水晶變成了 10 點`);
    }
    // 只在某個回合有效的效果到期
    for (const pl of s.players) {
      if (pl.eternal?.some((e) => e.turn !== undefined || e.until !== undefined)) pl.eternal = pl.eternal.filter((e) => (e.turn === undefined || e.turn >= s.turn) && (e.until === undefined || e.until >= s.turn));
      if (pl.pendingDiscounts?.length) pl.pendingDiscounts = pl.pendingDiscounts.filter((d) => d.turn === undefined || d.turn >= s.turn);
    }
    this.log(pid, `—— 第 ${Math.ceil(s.turn / 2)} 回合：${p.name} ——`);
    this.shiftHand(p);
    yield* this.emit({ k: 'turnStart', player: pid });
    yield* this.checkSecrets(pid, 'turnStart', {});
    yield* this.processDeaths();
    if (this.over) return;
    // 延遲的效果（例如不祥之兆「2 回合後召喚…」）
    if (p.delayed?.length) {
      const due = p.delayed.filter((d) => --d.turns <= 0);
      p.delayed = p.delayed.filter((d) => d.turns > 0);
      for (const d of due) {
        yield* this.runEffects(d.effects, { ...this.baseCtx(pid), sourceCardId: d.sourceCardId });
        yield* this.processDeaths();
        if (this.over) return;
      }
    }
    // 天文生物學家：這個回合開始時發現一張法術
    if (p.discoverNextTurn) {
      p.discoverNextTurn = false;
      yield* this.runEffects([{ e: 'discover', pool: { type: 'SPELL' } }], { ...this.baseCtx(pid), sourceCardId: 'GDB_874' });
    }
    // 時光凍結者：回合開始時不再抽牌
    if (p.board.some((m) => !m.silenced && getCard(m.cardId).flags?.includes('noTurnDraw'))) return;
    // 指揮官迦頓：回合開始時不抽牌，改為從牌堆發現一張，其消耗減少 (3)，銷毀其他的
    if (p.geddon && p.deck.length) {
      const opts = shuffle(this.s, [...p.deck]).slice(0, 3);
      const pick3 = yield* this.chooseFromList({ ...this.baseCtx(pid) }, opts, '從你的牌堆發現一張牌來打出');
      if (pick3) {
        for (const o of opts) p.deck = p.deck.filter((h) => h !== o);
        pick3.costMod -= 3;
        if (p.hand.length < MAX_HAND) {
          pick3.enteredTurn = s.turn;
          p.hand.push(pick3);
        }
      }
      return;
    }
    // 露水程序：每回合額外抽牌
    yield* this.draw(p, 1 + (p.extraDraw ?? 0));
  }

  /** 磁力手下要吸附的友方機械 */
  private magnetTarget(p: PlayerState, position: number | undefined): Minion | null {
    const isMech = (m: Minion | undefined) => !!m && this.alive(m) && this.isRace(m.cardId, 'MECHANICAL') && !this.hasKw(m, 'DORMANT');
    if (position === undefined) return [...p.board].reverse().find(isMech) ?? null;
    const right = p.board[position];
    return isMech(right) ? right : null;
  }

  /** 手牌中每回合變形的卡（例如暮色港獵人、變色龍克米里歐、變幻卷軸） */
  private shiftHand(p: PlayerState) {
    const foe = this.s.players[opp(p.id)];
    for (const hc of p.hand) {
      const d0 = getCard(hc.origin ?? hc.cardId);
      // 每個回合在手牌中時升級（拉法姆的最後一博、綻放球莖）
      if (d0.handGrow || d0.immolate) hc.counter = (hc.counter ?? 0) + 1;
      // 畸變怪物：每個回合在手牌中時，隨機換兩種加成效果
      // 幼蟲：每個回合在手牌中時，變成一個隨機的蟲族手下
      if (d0.id === 'SC_003t') {
        const z = pick(this.s, this.randomPool({ type: 'MINION', zerg: true, anyClass: true }, p.id, false));
        if (z) hc.cardId = z.id;
      }
      if (d0.nameEn === 'Twisted Monstrosity') hc.bonus = shuffle(this.s, ['RUSH', 'WINDFURY', 'DIVINE_SHIELD', 'POISONOUS', 'LIFESTEAL', 'REBORN', 'CHARGE', 'STEALTH'] as Keyword[]).slice(0, 2);
      // 暗影告密者：每個回合換一個職業
      if (d0.nameEn === 'Shadowed Informant') hc.cls = pick(this.s, ['DRUID', 'HUNTER', 'MAGE', 'PALADIN', 'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'DEATHKNIGHT', 'DEMONHUNTER'] as CardClass[]);
    }
    this.refreshHandForms(p);
    for (const hc of p.hand) {
      const sh = getCard(hc.origin ?? hc.cardId).handShift;
      if (!sh) continue;
      if (sh.kind === 'swap') {
        if (sh.into && hasCard(sh.into)) hc.cardId = sh.into;
        continue;
      }
      const into =
        sh.kind === 'opponentCard'
          ? pick(this.s, foe.hand)?.cardId
          : pick(this.s, this.randomPool({ type: sh.kind === 'randomWeapon' ? 'WEAPON' : 'SPELL', cls: sh.cls }, p.id, sh.kind === 'randomWeapon'))?.id;
      if (!into) continue;
      hc.origin ??= hc.cardId;
      hc.cardId = into;
    }
  }

  /** 手牌中會依條件變形的卡：『詛咒之王』吉恩（其餘手牌全是奇數或全是偶數時變成狼人之王） */
  private refreshHandForms(p: PlayerState) {
    for (const hc of p.hand) {
      if (hc.cardId !== 'CATA_615' || !hasCard('CATA_615t')) continue;
      const rest = p.hand.filter((h) => h !== hc);
      if (rest.length && (rest.every((h) => this.handDef(h).cost % 2 === 0) || rest.every((h) => this.handDef(h).cost % 2 === 1))) {
        hc.origin ??= hc.cardId;
        hc.cardId = 'CATA_615t';
        this.log(p.id, `${this.name('CATA_615')}變成了狼人之王`);
      }
    }
  }

  /** 熔喉以外的附肢：灰燼蟲在場上全滿時甦醒 */
  private wakeAshWorms() {
    for (const pl of this.s.players) {
      if (pl.board.length < MAX_BOARD) continue;
      for (const m of pl.board) {
        if (!m.keywords.includes('DORMANT') || m.silenced || !getCard(m.cardId).flags?.includes('ashWorm')) continue;
        m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
        m.sleeping = false;
        this.log(pl.id, `${this.name(m.cardId)}甦醒了！`);
      }
    }
  }

  /** 任務進度（達成時換成獎勵的英雄能力） */
  private questProgress(p: PlayerState, kind: QuestDef['kind'], n = 1, name?: string) {
    this.questProgressOne(p, 'quest', kind, n, name);
    this.questProgressOne(p, 'quest2', kind, n, name);
  }

  private questProgressOne(p: PlayerState, slot: 'quest' | 'quest2', kind: QuestDef['kind'], n: number, name?: string) {
    const cur = p[slot];
    if (!cur || n <= 0) return;
    const q = getCard(cur.cardId).quest;
    if (!q || q.kind !== kind) return;
    if ((kind === 'uniqueTypes' || kind === 'beastAttacks') && name) {
      const names = (cur.names ??= {});
      names[name] = 1;
      cur.progress = Object.keys(names).length;
    } else if (kind === 'sameName' && name) {
      // 洞穴歷險：打出同名手下的最多次數
      const names = (cur.names ??= {});
      names[name] = (names[name] ?? 0) + 1;
      cur.progress = Math.max(...Object.values(names));
    } else cur.progress += n;
    if (cur.progress < q.goal) return;
    this.log(p.id, `${p.name}完成了任務${this.name(cur.cardId)}！`);
    // 重複任務：獎勵是永久效果，完成後重新開始
    if (q.repeatable) {
      cur.progress = 0;
      cur.names = undefined;
      if (q.reward === 'murlocBuff') p.murlocBuff = (p.murlocBuff ?? 0) + 1;
      return;
    }
    p[slot] = undefined;
    // 奧希里安之淚是被動效果：你的二選一卡牌同時具有兩種效果
    if (q.reward === 'ULD_131p') p.chooseBoth = true;
    else if (EXTRA_POWERS[q.reward]) this.setHeroPower(p, q.reward);
    else if (hasCard(q.reward)) this.addToHand(p, q.reward);
  }

  private *endTurn(): Gen {
    const s = this.s;
    const pid = s.current;
    const p = s.players[pid];
    // 回音的複製、暫時的卡與被混亂凝視者詛咒的卡只能在本回合使用
    if (p.stashedHand) {
      // 時間彼端的鰭：換回原本的手牌
      p.hand = p.stashedHand;
      p.stashedHand = undefined;
    }
    // 燃燒：持有滿期限的回合結束時棄掉
    for (const h of [...p.hand]) {
      const im = getCard(h.cardId).immolate;
      if (im !== undefined && (h.counter ?? 0) + 1 >= im) {
        p.hand = p.hand.filter((x) => x !== h);
        yield* this.discarded(p, h);
      }
    }
    // 末日少女：沒打出的借來的牌放回對手的牌堆
    const lent = p.hand.filter((x) => x.borrowed !== undefined);
    for (const h of lent) {
      const owner = this.s.players[h.borrowed!];
      h.borrowed = undefined;
      owner.deck.splice(randomInt(s, owner.deck.length + 1), 0, h);
    }
    p.hand = p.hand.filter((h) => !lent.includes(h) && !h.echo && !h.temporary && h.doomTurn !== s.turn);
    if (p.mana > 0) this.questProgress(p, 'unspentTurn');
    if (p.board.filter((m) => this.alive(m)).length >= MAX_BOARD) this.questProgress(p, 'fillBoardTurns');
    // 食草劍龍：回合結束時 +1 攻擊力（即使在手牌或牌堆中）
    for (const h of [...p.hand, ...p.deck]) if (getCard(h.cardId).flags?.includes('grazing')) h.atkBuff += 1;
    yield* this.emit({ k: 'turnEnd', player: pid });
    // 『滅世烈火』拉格納羅斯：在你的回合結束時，觸發你手下的亡語
    if (this.flagOnBoard('endTurnTriggerDeathrattle', pid)) {
      for (const m of [...p.board]) if (this.alive(m) && !m.silenced && m.abilities.some((a) => a.on.k === 'deathrattle')) yield* this.runDeathrattles(m);
    }
    // 沙怒光環：你的手下的回合結束效果觸發兩次
    if (p.doubleEotUntil !== undefined && p.doubleEotUntil >= s.turn) yield* this.emit({ k: 'turnEnd', player: pid, onlyOwner: pid });
    // 德拉克瑞附魔師：你的回合結束效果觸發兩次
    if (this.flagOnBoard('doubleEndTurn', pid)) yield* this.emit({ k: 'turnEnd', player: pid, onlyOwner: pid });
    // 回合結束時回到手牌的卡（例如屍淇淋）
    if (p.endOfTurnCards?.length) {
      for (const id of p.endOfTurnCards) this.addToHand(p, id);
      p.endOfTurnCards = [];
    }
    // 「在這個回合結束時」的效果（例如恐懼戰馬的亡語）
    for (const pl of [p, s.players[opp(pid)]]) {
      const list = pl.endOfTurnEffects ?? [];
      pl.endOfTurnEffects = [];
      for (const e of list) {
        yield* this.runEffects(e.effects, { ...this.baseCtx(pl.id), sourceCardId: e.sourceCardId });
        if (this.over) return;
      }
    }
    // 暫時控制的手下還給原本的玩家（例如瘋狂藥水）
    for (const pl of s.players) {
      for (const m of [...pl.board]) {
        if (m.returnTo === undefined) continue;
        if (m.returnTurn !== undefined && m.returnTurn > s.turn) continue;
        m.returnTurn = undefined;
        const back = s.players[m.returnTo];
        m.returnTo = undefined;
        if (back.id === pl.id) continue;
        pl.board = pl.board.filter((x) => x !== m);
        if (back.board.length >= MAX_BOARD) {
          m.dead = true;
          pl.board.push(m);
          continue;
        }
        m.owner = back.id;
        m.sleeping = true;
        back.board.push(m);
      }
    }
    this.recalcAuras();
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
    // 額外回合（例如坦普拉斯）
    const next = s.turnQueue?.length ? s.turnQueue.shift()! : opp(pid);
    yield* this.startTurn(next);
  }

  // ==========================================================================
  // 出牌
  // ==========================================================================

  /** 預備：把卡拖進牌堆，花光剩餘法力，之後抽到時折扣（花費 + 1） */
  private *prepareCard(handUid: number): Gen {
    const s = this.s;
    const p = s.players[s.current];
    const i = p.hand.findIndex((h) => h.uid === handUid);
    const [hc] = p.hand.splice(i, 1);
    const spent = p.mana;
    p.mana = 0;
    const discount = spent + 1;
    hc.costMod -= discount;
    hc.prepared = true;
    p.deck.splice(randomInt(s, p.deck.length + 1), 0, hc);
    this.log(p.id, `${p.name}預備了${this.name(hc.cardId)}（花費 ${spent} 點法力，之後消耗減少 ${discount}）`);
    yield* this.emit({ k: 'prepare', player: p.id, amount: discount });
  }

  /** 這張牌還能倒轉幾次 */
  rewindsOf(hc: HandCard): number {
    return hc.rewinds ?? getCard(hc.cardId).rewind ?? 0;
  }

  /** 倒轉：打出後讓玩家選擇保留結果，或回到打出前（這張牌回到手牌，少一次倒轉） */
  private *playRewindable(handUid: number, target: number | undefined, position: number | undefined, option: number | undefined, side?: 'enemy'): Gen {
    const pid = this.s.current;
    const hc = this.s.players[pid].hand.find((h) => h.uid === handUid)!;
    const left = this.rewindsOf(hc) - 1;
    const snap = structuredClone(this.s);
    yield* this.playCard(handUid, target, position, option, side);
    if (this.over) return;
    yield* this.processDeaths();
    this.recalcAuras();
    if (this.over) return;
    const idx = yield { player: pid, kind: 'discover', options: ['TIME_000ta', 'TIME_000tb'], title: `倒轉？（剩餘 ${left + 1} 次）保留這個時間線，或回到打出前重來` };
    if (idx !== 1) return;
    // 莫奇：倒轉會保留兩種結果 —— 不還原，而是把效果再執行一次
    if (this.flagOnBoard('keepBothRewinds', pid)) {
      const def = getCard(hc.cardId);
      const ctx: Ctx = { ...this.baseCtx(pid), sourceCardId: def.id, isSpell: def.type === 'SPELL', chosen: target ?? null };
      const m = [...this.s.players[pid].board].reverse().find((x) => x.cardId === def.id);
      if (m) ctx.sourceUid = m.uid;
      this.log(pid, `${this.s.players[pid].name}保留了兩條時間線`);
      for (const ab of def.abilities ?? []) {
        if (ab.on.k !== 'play' || (ab.cond && !this.evalCond(ab.cond, ctx))) continue;
        yield* this.runEffects(ab.effects, ctx);
        if (this.over) return;
      }
      return;
    }
    this.rewindReq = { snap, handUid, left };
  }

  /** 地點牌可啟用的目標（沒有目標需求 = null） */
  locationTargetReq(uid: number): TargetReq | null {
    const loc = this.s.players[this.s.current].locations?.find((l) => l.uid === uid);
    return loc ? getCard(loc.cardId).target ?? null : null;
  }

  /** 啟用地點牌：耐久度 -1、進入冷卻、執行效果，耐久度用完就消失（或前進到下一個形態） */
  private *activateLocation(uid: number, target: number | undefined): Gen {
    const p = this.s.players[this.s.current];
    const loc = p.locations!.find((l) => l.uid === uid)!;
    const def = getCard(loc.cardId);
    loc.durability--;
    loc.cooldown = 2;
    // 魔鬼裂隙：每個回合都可以使用，耐久度不會用完
    if (def.flags?.includes('rift')) {
      loc.durability++;
      loc.cooldown = 1;
    }
    this.log(p.id, `${p.name}啟用了${this.name(def.id)}`);
    this.fx({ kind: 'play', cardId: def.id, player: p.id, target });
    const ctx: Ctx = { ...this.baseCtx(p.id), sourceUid: loc.uid, sourceCardId: def.id, isSpell: false, chosen: target ?? null };
    if (loc.effects) yield* this.runEffects(loc.effects, ctx);
    else {
      for (const ab of def.abilities ?? []) {
        if (ab.on.k !== 'play' || (ab.cond && !this.evalCond(ab.cond, ctx))) continue;
        yield* this.runEffects(ab.effects, ctx);
        if (this.over) return;
      }
    }
    // 前進到下一個形態（重新開始計算耐久度與冷卻）
    if (def.advanceTo && hasCard(def.advanceTo)) {
      const next = getCard(def.advanceTo);
      loc.cardId = next.id;
      loc.durability = next.health ?? 3;
      loc.cooldown = 2;
    } else if (loc.durability <= 0) {
      p.locations = p.locations!.filter((l) => l !== loc);
      this.log(p.id, `${this.name(def.id)}的耐久度用完了`);
      // 地點被摧毀時的亡語（恐龍之墓）
      if (loc.deathrattle) yield* this.runEffects(loc.deathrattle, ctx);
      for (const ab of def.abilities ?? []) if (ab.on.k === 'deathrattle') yield* this.runEffects(ab.effects, ctx);
    }
  }

  /** 具有倒轉的英雄能力 */
  private *powerRewindable(target: number | undefined, option: number | undefined): Gen {
    const pid = this.s.current;
    const snap = structuredClone(this.s);
    yield* this.useHeroPower(target, option);
    if (this.over) return;
    yield* this.processDeaths();
    this.recalcAuras();
    if (this.over) return;
    const idx = yield { player: pid, kind: 'discover', options: ['TIME_000ta', 'TIME_000tb'], title: '倒轉？保留這個時間線，或回到使用英雄能力前重來' };
    if (idx === 1) this.rewindReq = { snap, left: 0 };
  }

  /** 還原到倒轉前的狀態（保留亂數狀態，所以結果會不一樣） */
  private applyRewind() {
    const r = this.rewindReq!;
    this.rewindReq = null;
    const keep = { rng: this.s.rng, nextUid: this.s.nextUid, log: this.s.log, fx: this.s.fx, fxSeq: this.s.fxSeq };
    Object.assign(this.s, r.snap, keep);
    this.s.pendingChoice = null;
    const p = this.s.players[this.s.current];
    const hc = r.handUid !== undefined ? p.hand.find((h) => h.uid === r.handUid) : undefined;
    if (hc) hc.rewinds = r.left;
    else if (r.handUid === undefined) p.heroPower.rewoundTurn = this.s.turn;
    this.log(p.id, `${p.name}倒轉了時間！`);
    this.fx({ kind: 'rewind', player: p.id });
    this.recalcAuras();
  }

  private *playCard(handUid: number, target: number | undefined, position: number | undefined, option: number | undefined, side?: 'enemy'): Gen {
    const s = this.s;
    const p = s.players[s.current];
    const idx = p.hand.findIndex((h) => h.uid === handUid);
    const hc = p.hand[idx];
    const def = this.handDef(hc);
    const cost = this.costOf(p, hc);
    const outcast = idx === 0 || idx === p.hand.length - 1;
    const rightmost = idx === p.hand.length - 1;
    const center = p.hand.length % 2 === 1 && idx === (p.hand.length - 1) / 2;
    const combo = p.cardsPlayedThisTurn > 0;
    const echo = this.hasEcho(p.id, hc);
    const kind = this.costKind(p, hc);
    // 偽裝：可以打在對手的戰場上
    const bo = side === 'enemy' && def.disguised ? s.players[opp(p.id)] : p;
    const fromOpp = !!hc.fromOpp;
    if (kind === 'health') this.payHealth(p, cost);
    else if (kind === 'corpses') this.spendCorpses(p, cost);
    else if (kind === 'oppHealth') this.payHealth(s.players[opp(p.id)], Math.min(10, cost));
    else p.mana -= cost;
    // 用掉「你的下一張…」的消耗變化
    const used = this.activeDiscounts(p, def, hc);
    if (used.length) {
      p.pendingDiscounts = p.pendingDiscounts!.filter((d) => !used.includes(d));
      for (const d of used) if (d.grant) (hc.bonus ??= []).includes(d.grant) || hc.bonus.push(d.grant);
    }
    if (def.secret) p.secretsPlayed = (p.secretsPlayed ?? 0) + 1;
    (p.playedCards ??= []).push(def.id);
    p.questPlayed ||= !!def.quest;
    if (!hc.starting) p.nonStartingPlayed = (p.nonStartingPlayed ?? 0) + 1;
    // 雜貨鋪：本回合打出它抽到的牌，重新開啟
    if (p.knickUid === hc.uid) {
      p.knickUid = undefined;
      this.reopenLocations(p, 'drawnPlayed');
    }
    if (hc.temporary) this.questProgress(p, 'temporaryPlayed');
    if (def.type === 'SPELL' && kind === 'mana') p.spellManaSpent = (p.spellManaSpent ?? 0) + cost;
    if (def.type === 'SPELL') {
      if (p.turnSpells?.turn !== s.turn) p.turnSpells = { turn: s.turn, ids: [] };
      p.turnSpells.ids.push(def.id);
      if (!hc.starting) this.questProgress(p, 'spellNotStarting');
    }
    if (def.type === 'MINION') {
      this.questProgress(p, 'sameName', 1, def.nameEn);
      if (def.cost === 1) this.questProgress(p, 'oneCostMinion');
      if (def.keywords?.includes('TAUNT')) this.questProgress(p, 'tauntMinion');
      for (const r of def.races ?? []) this.questProgress(p, 'uniqueTypes', 1, r);
      if ((def.races?.includes('BEAST') || def.races?.includes('ALL')) && [1, 3, 5, 7].includes(def.attack ?? -1)) this.questProgress(p, 'beastAttacks', 1, String(def.attack));
      if (def.races?.includes('ELEMENTAL') || def.races?.includes('ALL')) p.elementalsThisTurn = (p.elementalsThisTurn ?? 0) + 1;
    }
    if (def.type === 'SPELL' && cost >= 5) {
      p.bigSpellTurn = s.turn;
      p.bigSpells = (p.bigSpells ?? 0) + 1;
    }
    if (def.overload) p.overloadTotal = (p.overloadTotal ?? 0) + def.overload;
    // 這張牌在手中時，你花費的法力（例如費伍德樹人）
    if (kind === 'mana' && cost > 0) for (const h of p.hand) if (h.uid !== hc.uid) h.spent = (h.spent ?? 0) + cost;
    if (def.type === 'MINION') {
      p.minionPlayedTurn = s.turn;
      if (this.isRace(def.id, 'BEAST') || this.isRace(def.id, 'UNDEAD')) this.questProgress(p, 'beastUndead');
      if (def.cost === 1) (p.oneCostMinions ??= []).push(def.id);
    }
    if (def.type === 'SPELL' && def.spellSchool === 'FEL') p.felSpells = (p.felSpells ?? 0) + 1;
    if (p.playedThisTurn?.turn !== s.turn) p.playedThisTurn = { turn: s.turn, ids: [] };
    p.playedThisTurn.ids.push(def.id);
    p.lastPlayedCost = cost;
    // 打出消耗為 (2) 法力的卡：玉蓮幫生事者（在手中或牌堆時）與翠玉守護者計數
    if (kind === 'mana' && cost === 2) {
      p.twoManaPlayed = (p.twoManaPlayed ?? 0) + 1;
      for (const h of [...p.hand, ...p.deck]) if (getCard(h.cardId).nameEn === 'Lotus Troublemaker') h.counter = (h.counter ?? 0) + 1;
    }
    // 調查：對手調查過這張卡，你就是被調查的對象
    const foeP = s.players[opp(p.id)];
    if (foeP.investigation && foeP.investigation.turn === s.turn && foeP.investigation.cardId === def.id) {
      foeP.investigation = undefined;
      this.log(foeP.id, `調查成功！${foeP.name}獲得 3 枚幸運幣`);
      for (let i = 0; i < 3; i++) this.addToHand(foeP, foeP.coinCard ?? 'GAME_005');
    }
    // 瑪格的魔法 / 吉的力量
    if (def.type === 'MINION') {
      // 吉的力量：整場對戰中每打出第 5 個手下，它的戰吼就觸發兩次（只算這一個手下）
      if (p.zee && ++p.zee.minions % 5 === 0) hc.twiceBC = true;
    }
    if (p.nextCardCorpsesTurn === s.turn) p.nextCardCorpsesTurn = undefined;
    if (def.type === 'SPELL' && p.nextSpellDiscount?.turn === s.turn) p.nextSpellDiscount = undefined;
    // 深暗領域：與這張牌相鄰的手牌（赤紅巨星、軌道光環…）
    for (const nb of [p.hand[idx - 1], p.hand[idx + 1]]) {
      if (!nb) continue;
      nb.adjPlayedTurn = s.turn;
      if (getCard(nb.cardId).adjDiscount) nb.costMod -= 1;
    }
    p.cardEvents = (p.cardEvents ?? 0) + 1;
    if (hc.nydus === s.turn) p.hero.tempAtk += 2;
    p.hand.splice(idx, 1);
    // 回音：把一張複製加入手牌，回合結束時消失
    if (echo && p.hand.length < MAX_HAND) p.hand.push({ ...structuredClone(hc), uid: this.uid(), echo: true });
    // 雙生法術：把一張沒有雙生法術的複製加入手牌
    if (def.twinspellCopy && p.hand.length < MAX_HAND) p.hand.push(this.newHandCard(def.twinspellCopy));
    p.cardsPlayedThisTurn++;
    p.nextCardDiscount = 0;
    if (fromOpp) this.accusationFire('theft', p.id);
    // 寇瓦斯：打出流放牌後回到手牌
    if (p.korvasPending && outcast && (def.outcastCost !== undefined || JSON.stringify(def.abilities ?? []).includes('"c":"outcast"'))) {
      p.korvasPending = false;
      this.addToHand(p, 'CS3_019');
    }
    this.questFillHand(p);
    // 時間循環者托奇：打出這一組的 3 張法術後，再獲得一個托奇
    if (hc.looping !== undefined) {
      const groups = (p.tokiGroups ??= {});
      groups[hc.looping] = (groups[hc.looping] ?? 0) + 1;
      if (groups[hc.looping] === 3) this.addToHand(p, 'TIME_861');
    }
    if (def.overload) p.overloadOwed += def.overload;

    let abilities: Ability[] = def.abilities ?? [];
    let transformInto: string | undefined;
    if (def.chooseOne) {
      const opt = def.chooseOne[option ?? 0];
      // 奧希里安之淚：二選一卡牌同時具有兩種效果
      const both = p.chooseBoth || hc.both || this.flagOnBoard('fandral', p.id) || p.chooseBothTurn === s.turn;
      if (def.chooseOne && p.chooseBothTurn === s.turn) p.chooseBothTurn = undefined;
      abilities = both ? [...opt.abilities, ...def.chooseOne.filter((o) => o !== opt).flatMap((o) => o.abilities)] : opt.abilities;
      transformInto = opt.transformInto;
      this.log(p.id, `${p.name}打出了${this.name(def.id)}（${both ? '兩種效果' : opt.name}）`);
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
      center,
      handIndex: idx,
      lifesteal: !!def.keywords?.includes('LIFESTEAL') || (def.type === 'SPELL' && p.spellLifestealTurn === s.turn),
      handCounter: hc.counter,
      playedCard: hc,
      itFromOpp: fromOpp,
    };
    const playAbilities = abilities.filter((a) => a.on.k === 'play');

    // 磁力：打出在友方機械左邊時，吸附到那個機械上（電腦沒有指定位置時，自動吸附到最右邊的機械）
    const mech = def.type === 'MINION' && def.magnetic ? this.magnetTarget(p, position) : null;
    if (mech) {
      const add = this.makeMinion(p.id, def.id, hc);
      mech.atkBuff += add.baseAtk + add.atkBuff;
      mech.maxHp += add.maxHp;
      mech.hp += add.maxHp;
      for (const k of add.keywords) if (!mech.keywords.includes(k)) mech.keywords.push(k);
      mech.abilities.push(...add.abilities.filter((a) => a.on.k !== 'play'));
      mech.spellDamage += add.spellDamage;
      this.log(p.id, `${this.name(def.id)}吸附到了${this.name(mech.cardId)}上`);
      this.fx({ kind: 'buff', uid: mech.uid, cardId: def.id, player: p.id });
      yield* this.emit({ k: 'cardPlayed', player: p.id, cardType: 'MINION', races: def.races, cardId: def.id, echo, outcast, rightmost, fromOpp });
    } else if (def.type === 'MINION') {
      const m = this.makeMinion(bo.id, transformInto ?? def.id, hc);
      const pos = Math.max(0, Math.min(position ?? bo.board.length, bo.board.length));
      bo.board.splice(pos, 0, m);
      ctx.sourceUid = m.uid;
      // 偽裝手下打在對手的場上：由那一方控制（戰吼也以那一方為準）
      if (bo !== p) {
        ctx.controller = bo.id;
        this.log(p.id, `${p.name}把${this.name(def.id)}打在了對手的戰場上`);
      }
      // 無盡的祝福：每回合你打出的第一個死靈獲得攻擊力
      if (bo === p && p.heroPower.id === 'END_003p' && p.infiniteTurn !== s.turn && (def.races?.includes('UNDEAD') || def.races?.includes('ALL'))) {
        p.infiniteTurn = s.turn;
        m.atkBuff += p.imbued ?? 1;
      }
      this.recalcAuras();
      this.countSummon(bo, m.cardId, m);
      // 阿夏隆：你打出的手下獲得那些適應
      for (const id of bo.adapts ?? []) this.applyAdaptation(m, id);
      this.assemble(bo, m);
      this.fx({ kind: 'summon', uid: m.uid, cardId: m.cardId, player: bo.id, played: true });
      yield* this.summonLimbs(bo.id, m);
      if (def.races?.includes('ELEMENTAL') && bo === p) p.elementalThisTurn = true;
      // 低語元素 / 維爾納之心 / 布萊恩‧銅鬚：戰吼觸發兩次
      const once = p.doubleBattlecry?.turn === s.turn && playAbilities.length > 0;
      if (once && !p.doubleBattlecry!.all) p.doubleBattlecry = undefined;
      const comboTwice = !!p.comboDouble && JSON.stringify(def.abilities ?? []).includes('"c":"combo"');
      if (comboTwice) p.comboDouble = false;
      const twice = once || comboTwice || (playAbilities.length > 0 && (this.flagOnBoard('doubleBattlecries', p.id) || !!hc.twiceBC));
      for (let i = 0; i < (twice ? 2 : 1); i++) {
        for (const ab of playAbilities) {
          if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
          yield* this.runEffects(ab.effects, ctx);
          if (this.over) return;
        }
      }
      // 活生生的噩夢：打出時召喚一個 2/2 的複製
      if (hc.livingCopy && bo.board.length < MAX_BOARD) {
        const c = yield* this.summon(bo.id, m.cardId);
        if (c) this.setStats(c, 2, 2);
      }
      if (playAbilities.length) {
        this.questProgress(p, 'battlecry');
        this.reopenLocations(p, 'battlecryMinion');
      }
      if (m.keywords.includes('REBORN')) this.questProgress(p, 'reborn');
      yield* this.emit({ k: 'summon', player: bo.id, subject: m.uid, races: def.races });
      yield* this.emit({ k: 'summoned', player: bo.id, subject: m.uid });
      yield* this.emit({ k: 'cardPlayed', player: p.id, subject: m.uid, cardType: 'MINION', races: def.races, cardId: def.id, echo, outcast, rightmost, fromOpp });
      if (this.minion(m.uid) && bo === p) yield* this.checkSecrets(opp(p.id), 'enemyPlaysMinion', { it: { kind: 'char', uid: m.uid } });
      yield* this.dungeonMinionPlayed(p, m);
      yield* this.darkMinionPlayed(p, m, def, hc);
    } else if (def.type === 'SPELL') {
      this.spellCountered = false;
      yield* this.checkSecrets(opp(p.id), 'enemyCastsSpell', { itCardId: def.id });
      if (!this.spellCountered) {
        // 「每當你以法術指定此手下為目標」（例如龍人巫師）
        const t = target !== undefined ? this.minion(target) : null;
        if (t && t.owner === p.id) {
          yield* this.emit({ k: 'spellTarget', player: p.id, subject: t.uid });
          if (this.over) return;
        }
        if (def.quest) {
          p.quest = { cardId: def.id, progress: 0 };
          if (def.quest2) p.quest2 = { cardId: def.quest2, progress: 0 };
          this.log(p.id, `${p.name}開始了任務${this.name(def.id)}`);
        } else if (def.secret) {
          p.secrets.push({ uid: this.uid(), cardId: def.id });
        } else {
          // 伊雷特拉‧風暴怒濤：下一張法術施放兩次
          const sinestra = this.isOtherClass(p, def.id) && this.flagOnBoard('doubleOtherSpells', p.id);
          const malygos = def.spellSchool === 'ARCANE' && this.dragonLord(p, 'malygosArcane');
          const niri = def.cost === 1 && this.flagOnBoard('niri', p.id);
          let times = p.doubleSpellTurn === s.turn || hc.castTwice || sinestra || malygos || niri ? 2 : 1;
          // 泰蘭德：接下來的幾個法術施放兩次
          if (times === 1 && (p.doubleSpellsLeft ?? 0) > 0) {
            times = 2;
            p.doubleSpellsLeft!--;
          }
          // 戰地轟擊手 / 大法師卡雷克：手牌中的法術獲得的法術傷害
          if (hc.spellPower) p.nextSpellPower = { turn: s.turn, amount: (p.nextSpellPower?.turn === s.turn ? p.nextSpellPower.amount : 0) + hc.spellPower };
          p.doubleSpellTurn = undefined;
          for (let i = 0; i < times; i++) {
            for (const ab of playAbilities) {
              if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
              yield* this.runEffects(ab.effects, ctx);
              if (this.over) return;
            }
          }
        }
        p.nextSpellPower = undefined;
        if (t && t.owner === p.id) {
          (t.spellsOn ??= []).push(def.id);
          this.questProgress(p, 'spellOnMinion');
        }
      } else this.log(p.id, `${this.name(def.id)}被反制了！`);
      if (!def.quest) this.questProgress(p, 'spell');
      if (def.spellSchool) {
        if (p.schoolsThisTurn?.turn !== s.turn) p.schoolsThisTurn = { turn: s.turn, schools: [] };
        p.schoolsThisTurn.schools.push(def.spellSchool);
        if (!this.spellCountered && def.spellSchool === 'HOLY') this.questProgress(p, 'holySpells');
        if (!this.spellCountered && def.spellSchool === 'SHADOW') this.questProgress(p, 'shadowSpells');
        if (def.spellSchool === 'HOLY') {
          if (p.holySpellsThisTurn?.turn !== s.turn) p.holySpellsThisTurn = { turn: s.turn, ids: [] };
          p.holySpellsThisTurn.ids.push(def.id);
        }
      }
      p.spellsCastThisGame++;
      for (const loc of p.locations ?? []) if (loc.cardId === 'GDB_136t' && !loc.absorbed) loc.absorbed = def.id;
      if (def.protoss) p.protossSpells = (p.protossSpells ?? 0) + 1;
      for (const m of p.board) {
        if (!m.shaped) continue;
        m.shaped -= cost;
        if (m.shaped <= 0) {
          m.shaped = undefined;
          m.keywords = m.keywords.filter((k) => k !== 'CANT_ATTACK');
        }
      }
      yield* this.dungeonSpellCast(p);
      p.spellsThisTurn = (p.spellsThisTurn ?? 0) + 1;
      // 被奴役的奈斯比拉：在你施放邪能法術後重新開啟
      if (def.spellSchool === 'FEL') this.reopenLocations(p, 'fel');
      this.reopenLocations(p, 'spell');
      // 哈穆爾：每施放 3 個法術，灌注你的英雄能力
      if (p.hamuulRepeat && !this.spellCountered) {
        p.hamuulCount = (p.hamuulCount ?? 0) + 1;
        if (p.hamuulCount % 3 === 0) this.doImbue(p);
      }
      // 熔化黃金等：在手牌中時，每施放一張法術就累積計數，達標後變成手下
      for (const h of p.hand) {
        // 惡魔之影：每當你施放一個法術，變成它的複製
        if (getCard(h.cardId).flags?.includes('mirrorSpell') && !this.spellCountered && hasCard(def.id) && def.id !== h.cardId) {
          h.cardId = def.id;
          continue;
        }
        const tr = getCard(h.cardId).transformAfterSpells;
        if (!tr) continue;
        h.counter = (h.counter ?? 0) + 1;
        if (h.counter >= tr.n && hasCard(tr.into)) {
          this.log(p.id, `${this.name(h.cardId)}變成了${this.name(tr.into)}`);
          h.cardId = tr.into;
          h.counter = 0;
        }
      }
      // 萊妮莎‧憂日：記住對友方手下施放的法術
      if (!this.spellCountered && target !== undefined && this.minion(target)?.owner === p.id) (p.spellsOnMinions ??= []).push(def.id);
      yield* this.emit({ k: 'spellCast', player: p.id, cardId: def.id, subject: target, subjectKind: 'char' });
      yield* this.emit({ k: 'cardPlayed', player: p.id, cardType: 'SPELL', cardId: def.id, echo, outcast, rightmost, fromOpp });
      if (!this.spellCountered) yield* this.checkSecrets(opp(p.id), 'afterEnemySpell', {});
    } else if (def.type === 'LOCATION') {
      const loc: Location = { uid: this.uid(), cardId: def.id, owner: p.id, durability: def.health ?? 3, cooldown: 0 };
      (p.locations ??= []).push(loc);
      this.fx({ kind: 'summon', uid: loc.uid, cardId: def.id, player: p.id, played: true });
      yield* this.emit({ k: 'cardPlayed', player: p.id, cardType: 'LOCATION', cardId: def.id, echo, outcast, rightmost, fromOpp });
    } else if (def.type === 'HERO') {
      // 英雄卡：換上新英雄、獲得護甲、換成新的英雄能力（本回合就能使用）
      p.hero.cardId = def.id;
      p.hero.armor += def.armor ?? 0;
      if (def.armor) this.fx({ kind: 'armor', uid: p.hero.uid, amount: def.armor });
      if (def.heroPower) p.heroPower = { id: def.heroPower.id, used: false, cost: def.heroPower.cost, heroCard: def.id };
      ctx.sourceUid = p.hero.uid;
      for (const ab of playAbilities) {
        if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
        yield* this.runEffects(ab.effects, ctx);
        if (this.over) return;
      }
      yield* this.emit({ k: 'cardPlayed', player: p.id, cardType: 'HERO', cardId: def.id, echo, outcast, rightmost, fromOpp });
    } else {
      yield* this.equip(p.id, def.id, hc);
      ctx.sourceUid = p.weapon?.uid ?? null;
      for (const ab of playAbilities) {
        if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
        yield* this.runEffects(ab.effects, ctx);
        if (this.over) return;
      }
      if (playAbilities.length) this.questProgress(p, 'battlecry');
      yield* this.emit({ k: 'cardPlayed', player: p.id, cardType: 'WEAPON', cardId: def.id, echo, outcast, rightmost, fromOpp });
    }
    // 哈塔魯：這個回合打出了它發現的法術，重複同樣的效果
    if (hc.hataaru === s.turn && def.type === 'SPELL' && !this.over) yield* this.runEffects([{ e: 'custom', fn: 'gdHataaru' }], { ...this.baseCtx(p.id), sourceCardId: 'GDB_136' });
    // 「跟隨…」：打出這張卡後，重複同樣的效果
    if (hc.follow && hc.follow.turn === s.turn && FOLLOW_EFFECTS[hc.follow.id] && !this.over) {
      yield* this.runEffects(FOLLOW_EFFECTS[hc.follow.id], { ...this.baseCtx(p.id), sourceCardId: def.id, sourceUid: null });
    }
    // 萬能鑰匙：在你打出其他卡牌後，變成消耗少 2 的隨機法術
    for (const h of p.hand) {
      if (!h.skeleton) continue;
      const cur = this.costOf(p, h);
      const pool = this.randomPool({ type: 'SPELL', cost: Math.max(0, cur - 2) }, p.id, true);
      const c = pick(s, pool);
      if (c) {
        h.cardId = c.id;
        h.costMod = 0;
      }
    }
    // 對手在一個回合中打出第三張牌之後（例如捕鼠陷阱）
    if (p.cardsPlayedThisTurn === 3 && !this.over) yield* this.checkSecrets(opp(p.id), 'enemyThirdCard', {});
    // 海盜派奇：在你打出海盜後，從你的牌堆召喚
    if (def.races?.length) {
      for (const d of [...p.deck]) {
        const race = getCard(d.cardId).summonFromDeckAfter;
        if (!race || !(def.races.includes(race) || def.races.includes('ALL')) || p.board.length >= MAX_BOARD || this.over) continue;
        p.deck = p.deck.filter((x) => x !== d);
        this.log(p.id, `${this.name(d.cardId)}從牌堆中跳了出來`);
        yield* this.summon(p.id, d.cardId);
      }
    }
    if (this.powerDef(p).refresh === 'cardPlayed') {
      p.heroPower.used = false;
      p.heroPower.uses = 0;
    }
    // 地圖：本回合打出發現的這張牌後，也可以從其他選項中再選一張
    if (hc.mapOthers?.length && hc.mapTurn === s.turn && !this.over) {
      const id = yield* this.choose(this.baseCtx(p.id), hc.mapOthers, '再選擇一張其他選項');
      this.addToHand(p, id);
      hc.mapOthers = undefined;
    }
    // 花光最後一顆法力水晶（例如晶脊幼獸）
    if (p.mana === 0 && cost > 0 && kind === 'mana' && !this.over) {
      yield* this.emit({ k: 'lastMana', player: p.id });
      yield* this.checkSecrets(opp(p.id), 'enemyAllMana', {});
    }
    this.mergeShatter(p);
    this.refreshHandForms(p);
    this.wakeAshWorms();
    yield* this.fillLimbs(p);
    // 高佛雷：超抽的卡在有空間時回到手中
    yield* this.returnOverdrawn(p);
    // 大卸八塊：結束你的回合
    if (p.endTurnAfter && !this.over) {
      p.endTurnAfter = false;
      yield* this.endTurn();
    }
  }

  /** 碎裂：抽到的卡分成兩半，分別放在手牌的最左與最右 */
  private splitShatter(p: PlayerState, hc: HandCard): boolean {
    const def = getCard(hc.cardId);
    if (!def.shatter || p.hand.length > MAX_HAND - 1 || !hasCard(def.shatter[0]) || !hasCard(def.shatter[1])) return false;
    p.hand = p.hand.filter((h) => h !== hc);
    const left = this.newHandCard(def.shatter[0]);
    const right = this.newHandCard(def.shatter[1]);
    left.shatterPair = right.uid;
    right.shatterPair = left.uid;
    left.shatterOf = right.shatterOf = hc.cardId;
    left.enteredTurn = right.enteredTurn = this.s.turn;
    p.hand.unshift(left);
    p.hand.push(right);
    this.log(p.id, `${this.name(hc.cardId)}碎裂成了兩半`);
    return true;
  }

  /** 碎裂：兩半在手牌中重新相鄰時，合併成完整的卡 */
  private mergeShatter(p: PlayerState) {
    for (let guard = 0; guard < 6; guard++) {
      const i = p.hand.findIndex((h, idx) => h.shatterPair !== undefined && p.hand[idx + 1]?.uid === h.shatterPair);
      if (i < 0) return;
      const whole = this.newHandCard(p.hand[i].shatterOf!);
      whole.enteredTurn = this.s.turn;
      p.hand.splice(i, 2, whole);
      this.log(p.id, `${this.name(whole.cardId)}重新合而為一`);
    }
  }

  /** 高佛雷：超抽的卡在手牌有空間時回到手中，消耗減少 (1) */
  private *returnOverdrawn(p: PlayerState): Gen {
    while (p.godfrey?.length && p.hand.length < MAX_HAND) {
      const hc = p.godfrey.shift()!;
      hc.costMod -= 1;
      p.hand.push(hc);
      this.log(p.id, `${this.name(hc.cardId)}回到了${p.name}的手中`);
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

  private *useHeroPower(target: number | undefined, option: number | undefined): Gen {
    const p = this.me;
    const def = this.powerDef(p);
    const effects = def.chooseOne ? def.chooseOne[option ?? 0].effects : def.effects;
    p.mana -= p.powerFreeTurn === this.s.turn ? 0 : this.heroPowerCost(p);
    p.powerFreeTurn = undefined;
    p.powerDiscount = 0;
    p.heroPower.uses = (p.heroPower.used ? (p.heroPower.uses ?? 1) : 0) + 1;
    p.heroPower.used = true;
    p.heroPowersUsed++;
    this.log(p.id, `${p.name}使用了英雄能力【${this.powerInfo(p).name}】`);
    this.fx({ kind: 'play', cardId: p.heroPower.id, player: p.id, target });
    const ctx = this.baseCtx(p.id);
    ctx.sourceUid = p.hero.uid;
    ctx.sourceCardId = p.heroPower.id;
    ctx.chosen = target ?? null;
    ctx.isHeroPower = true;
    ctx.lifesteal = !!def.lifesteal;
    yield* this.runEffects(effects, ctx);
    // 時間領主迪奧斯：英雄能力觸發兩次
    if (this.flagOnBoard('heroPowerEffectTwice', p.id)) yield* this.runEffects(effects, { ...ctx });
    // 龍鷹之靈：你的英雄能力也會指定相鄰手下
    const tm = target !== undefined ? this.minion(target) : null;
    if (tm && this.flagOnBoard('heroPowerAdjacent', p.id)) {
      for (const n of this.adjacent(tm)) yield* this.runEffects(effects, { ...ctx, chosen: n.uid });
    }
    p.powerDamageBonus = undefined;
    // 冰行者：你的英雄能力也會凍結目標
    const t = target !== undefined ? this.char(target) : null;
    if (t && this.flagOnBoard('heroPowerFreeze', p.id)) this.freeze(t);
    // 縱火狂：你的英雄能力消滅手下時抽一張牌
    if (tm && (tm.hp <= 0 || tm.dead) && this.flagOnBoard('heroPowerKillDraw', p.id)) yield* this.draw(p, this.flagCount('heroPowerKillDraw', p.id));
    yield* this.emit({ k: 'heroPower', player: p.id });
    yield* this.checkSecrets(opp(p.id), 'enemyHeroPower', {});
    // 沉睡的精靈：你使用英雄能力後甦醒
    for (const m of [...p.board]) {
      if (m.keywords.includes('DORMANT') && m.dormantTurns === undefined && getCard(m.cardId).flags?.includes('awakenOnPower')) {
        m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
        this.log(p.id, `${this.name(m.cardId)}甦醒了！`);
        yield* this.awakenEffects(m);
      }
    }
    // 蘇拉斯的故事：用兩次後換回原本的英雄能力
    if (p.heroPower.id === 'TLC_632t' && p.powerSwap) {
      p.powerSwap.uses--;
      if (p.powerSwap.uses <= 0) {
        const back = p.powerSwap.back;
        p.powerSwap = undefined;
        this.setHeroPower(p, back);
        p.heroPower.used = true;
      }
    }
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
    s.players[pid].attacksThisGame = (s.players[pid].attacksThisGame ?? 0) + 1;
    if (isHero(attacker)) {
      s.players[pid].heroAttackedThisTurn = true;
      s.players[pid].heroAttacks = (s.players[pid].heroAttacks ?? 0) + 1;
      this.questProgress(s.players[pid], 'heroAttack');
    }

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

    this.attackDefender = defUid;
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
    const cleave = isHero(a) ? !!s.players[pid].weapon?.keywords.includes('CLEAVE') : this.hasKw(a, 'CLEAVE');
    const neighbors = cleave && !isHero(d) ? this.adjacent(d) : [];
    // 射燭弓：你的英雄在攻擊時免疫
    const weaponDef = isHero(a) && s.players[pid].weapon ? getCard(s.players[pid].weapon!.cardId) : null;
    const immune = !!weaponDef?.flags?.includes('immuneAttacking') || (!isHero(a) && !a.silenced && !!getCard(a.cardId).flags?.includes('immuneAttacking'));
    // 步兵：與它相鄰的手下在攻擊時免疫
    const footImmune = !isHero(a) && (a.immuneAttackTurn === s.turn || this.adjacent(a).some((n) => n.owner === a.owner && this.alive(n) && !n.silenced && getCard(n.cardId).flags?.includes('footman')));
    if (footImmune && !a.tempKeywords.includes('IMMUNE')) a.tempKeywords.push('IMMUNE');
    yield* this.damage(aSrc, d.uid, aAtk);
    if (dAtk > 0 && !immune) yield* this.damage(dSrc, a.uid, dAtk);
    for (const n of neighbors) yield* this.damage(aSrc, n.uid, aAtk);
    // 異龍：缺少的相鄰手下改由敵方英雄承受
    if (!isHero(a) && !isHero(d) && getCard(a.cardId).flags?.includes('mutalisk')) for (let i = neighbors.length; i < 2; i++) yield* this.damage(aSrc, s.players[d.owner].hero.uid, aAtk);
    if (footImmune) a.tempKeywords = a.tempKeywords.filter((k) => k !== 'IMMUNE');
    const killed = !isHero(d) && (d.hp <= 0 || d.dead);

    if (isHero(a)) {
      const w = s.players[pid].weapon;
      // 安拉斐特之核：英雄攻擊後，英雄能力可以再使用
      if (s.players[pid].heroPower.id === 'ULD_711p3') s.players[pid].heroPower.used = false;
      // 符文熔爐魂屍：在你的回合，你的武器不會失去耐久度
      if (w && getCard(w.cardId).flags?.includes('gorehowl') && !isHero(d)) w.atk = Math.max(0, w.atk - 1);
      else if (w && !(s.current === pid && this.flagOnBoard('weaponNoWear', pid))) w.durability--;
      if (w) {
        // 霜之哀傷：記住被這把武器消滅的手下
        if (killed) (w.killed ??= []).push(d.cardId);
      }
    }
    this.lastAttack = { attacker: a.uid, defender: d.uid, defenderIsHero: isHero(d), killed, defenderCardId: isHero(d) ? undefined : d.cardId };
    if (isHero(a)) this.reopenLocations(s.players[pid], 'heroAttack');
    yield* this.emit({ k: 'attack', player: pid, subject: attackerUid, isHero: isHero(a), after: true });
    if (!isHero(d)) yield* this.emit({ k: 'attacked', player: d.owner, subject: d.uid });
    if (!isHero(a) && isHero(d)) yield* this.checkSecrets(dp, 'afterMinionAttacksHero', { it: { kind: 'char', uid: a.uid } });
  }

  private charSource(c: Char): DmgSource {
    if (isHero(c)) {
      const w = this.s.players[c.owner].weapon;
      return {
        owner: c.owner,
        uid: c.uid,
        poisonous: !!w?.keywords.includes('POISONOUS'),
        lifesteal: !!w?.keywords.includes('LIFESTEAL') || w?.lifestealTurn === this.s.turn || this.s.players[c.owner].heroLifestealTurn === this.s.turn,
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
    let overkill = false;
    const dealerM = src.uid !== null ? this.minion(src.uid) : null;
    // 塔爾加斯：未受傷的敵方手下受到雙倍傷害
    if (!isHero(t) && t.hp >= t.maxHp && this.s.players[opp(t.owner)].board.some((x) => !x.silenced && !x.dead && x.hp > 0 && getCard(x.cardId).flags?.includes('talgath'))) amount *= 2;
    if (!isHero(t) && t.doubleDmg) amount *= 2;
    // 無私保衛者：受到的傷害多 1 點
    if (!isHero(t) && !t.silenced && getCard(t.cardId).flags?.includes('extraDamage')) amount += 1;
    // 炎魔：免疫火焰法術
    if (!isHero(t) && !t.silenced && getCard(t.cardId).flags?.includes('fireImmune') && src.cardId && getCard(src.cardId).type === 'SPELL' && getCard(src.cardId).spellSchool === 'FIRE') return 0;
    // 量子不穩定者：受到的傷害加倍
    if (!isHero(t) && !t.silenced && getCard(t.cardId).flags?.includes('takesDoubleDamage')) amount *= 2;
    // 熔流亡魂 / 風暴巨鴉：你要用自然法術傷害它時，改為獲得體質 / 召喚手下
    if (!isHero(t) && !t.silenced && src.cardId && src.owner === t.owner && getCard(src.cardId).type === 'SPELL' && getCard(src.cardId).spellSchool === 'NATURE') {
      const tf = getCard(t.cardId).flags;
      if (tf?.includes('natureFeeds')) {
        t.atkBuff += 2;
        t.maxHp += 1;
        t.hp += 1;
        this.fx({ kind: 'buff', uid: t.uid, cardId: src.cardId });
        return 0;
      }
      if (tf?.includes('natureSummons')) {
        const c = pick(this.s, this.randomPool({ type: 'MINION', cost: 5, anyClass: true }, t.owner, false));
        if (c) yield* this.summon(t.owner, c.id);
        return 0;
      }
    }
    if (dealerM && !dealerM.silenced) {
      // 戈林：友方野獸造成雙倍傷害
      if (this.isRace(dealerM.cardId, 'BEAST') && this.flagOnBoard('goldrinn', dealerM.owner)) amount *= 2;
      // 布拉瑪：你的元素造成的傷害多 1 點
      if (this.isRace(dealerM.cardId, 'ELEMENTAL')) amount += this.flagCount('bralma', dealerM.owner);
      // 爆破火藥工程師：在你的回合，友方海盜造成的傷害提高 1 點
      if (this.s.current === dealerM.owner && this.isRace(dealerM.cardId, 'PIRATE')) amount += this.flagCount('pirateBonus', dealerM.owner);
      // 活體瘟疫：不會對英雄造成傷害，而是把等量的疫病洗入其牌堆
      if (isHero(t) && getCard(dealerM.cardId).flags?.includes('livingPlague')) {
        const deck = this.s.players[t.owner].deck;
        for (let i = 0; i < amount; i++) deck.splice(randomInt(this.s, deck.length + 1), 0, this.newHandCard('JAIL_443t'));
        this.log(t.owner, `${this.name(dealerM.cardId)}把 ${amount} 張疫病洗入了${this.s.players[t.owner].name}的牌堆`);
        return 0;
      }
    }
    if (isHero(t)) {
      if (t.divineShield && !(t.immune || this.flagOnBoard('heroImmune', t.owner))) {
        t.divineShield = false;
        this.fx({ kind: 'shield', uid: t.uid });
        return 0;
      }
      if (t.immune || this.flagOnBoard('heroImmune', t.owner) || (this.s.players[t.owner].heroImmuneUntil ?? -1) >= this.s.turn) return 0;
      // 詛咒之刃：你的英雄受到的傷害加倍；活化的盔甲：每次最多受到 1 點傷害
      const w = this.s.players[t.owner].weapon;
      // 阿茲諾斯之盾：你的英雄要受到傷害時，這把武器改為失去 1 點耐久度
      if (w && getCard(w.cardId).flags?.includes('weaponAbsorbs') && w.durability > 0) {
        w.durability--;
        return 0;
      }
      if (w && getCard(w.cardId).flags?.includes('doubleHeroDamage')) amount *= 2;
      if (this.flagOnBoard('heroDamageCap1', t.owner) || (this.s.players[t.owner].heroCapUntil ?? -1) >= this.s.turn) amount = Math.min(1, amount);
      // 復生的奧妮克希亞：在你的回合，你的英雄會失去生命值時，改為獲得等量的最大生命值
      if (this.s.current === t.owner && this.flagOnBoard('healthToMax', t.owner)) {
        t.maxHp += amount;
        this.log(t.owner, `${this.s.players[t.owner].name}獲得了 ${amount} 點最大生命值`);
        return 0;
      }
      // 紫羅蘭幻術師：在你的回合，你的英雄免疫
      if (this.s.current === t.owner && this.flagOnBoard('heroImmuneOnTurn', t.owner)) return 0;
      // 波爾夫‧拉姆榭：你的英雄受到的傷害改由它承受
      const guard = this.s.players[t.owner].board.find((m) => this.alive(m) && !m.silenced && getCard(m.cardId).flags?.includes('bodyguard'));
      if (guard) return yield* this.damage(src, guard.uid, amount);
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
      if (amount > absorbed) this.s.players[t.owner].heroHealthChangedTurn = this.s.turn;
      const owner = this.s.players[t.owner];
      owner.heroDamagedTurn = this.s.turn;
      owner.heroDamageTaken = { turn: this.s.turn, amount: (owner.heroDamageTaken?.turn === this.s.turn ? owner.heroDamageTaken.amount : 0) + amount };
      if (src.owner !== t.owner) {
        const atk = this.s.players[src.owner];
        atk.enemyHeroDamage = { turn: this.s.turn, amount: (atk.enemyHeroDamage?.turn === this.s.turn ? atk.enemyHeroDamage.amount : 0) + amount };
        atk.enemyHeroHits = { turn: this.s.turn, count: (atk.enemyHeroHits?.turn === this.s.turn ? atk.enemyHeroHits.count : 0) + 1 };
      }
    } else {
      // 鉗嘴龜殼鬥士：相鄰手下受到的傷害改由它承受
      const guards = (m: Minion) => !m.silenced && !!getCard(m.cardId).flags?.includes('adjacentBodyguard');
      const shell = guards(t) ? undefined : this.adjacent(t).find((m) => this.alive(m) && guards(m));
      if (shell) return yield* this.damage(src, shell.uid, amount);
      if (this.hasKw(t, 'IMMUNE') || this.hasKw(t, 'DORMANT')) return 0;
      if (this.hasKw(t, 'DIVINE_SHIELD')) {
        // 托雷斯 / 夢魘鱗片：聖盾要被打破好幾次
        const need = t.shieldHits ?? (this.flagOnBoard('toreth', t.owner) ? 3 : 1);
        if (need > 1) {
          t.shieldHits = need - 1;
          this.fx({ kind: 'shield', uid: t.uid });
          return 0;
        }
        t.shieldHits = undefined;
        t.keywords = t.keywords.filter((k) => k !== 'DIVINE_SHIELD');
        t.tempKeywords = t.tempKeywords.filter((k) => k !== 'DIVINE_SHIELD');
        t.nextTurnKeywords = t.nextTurnKeywords.filter((k) => k !== 'DIVINE_SHIELD');
        t.auraKeywords = t.auraKeywords.filter((k) => k !== 'DIVINE_SHIELD');
        this.fx({ kind: 'shield', uid: t.uid });
        yield* this.emit({ k: 'shieldLost', player: t.owner, subject: t.uid });
        return 0;
      }
      // 滅殺：在自己的回合造成超過消滅手下所需的傷害
      if (amount > t.hp && this.s.current === src.owner) overkill = true;
      if (t.stash === 'illusion') t.dead = true;
      t.hp = t.undyingTurn === this.s.turn ? Math.max(Math.min(t.hp, 1), t.hp - amount) : t.hp - amount;
      if (src.poisonous) t.dead = true;
      if ((t.hp <= 0 || t.dead) && src.uid !== null) t.killer = src.uid;
    }
    this.fx({ kind: 'damage', uid: t.uid, amount, from: src.uid ?? undefined, cardId: src.cardId, player: src.owner });
    if (src.cardId && src.owner === this.s.current && getCard(src.cardId).type === 'SPELL') {
      const sp = this.s.players[src.owner];
      const first = sp.spellDamageDealt?.turn !== this.s.turn;
      if (first) yield* this.emit({ k: 'firstSpellDamage', player: src.owner });
      sp.spellDamageDealt = { turn: this.s.turn, amount: (sp.spellDamageDealt?.turn === this.s.turn ? sp.spellDamageDealt.amount : 0) + amount };
    }
    // 任務「釋放巨像」/ 加洛什巨像：在你的回合對敵人造成剛好 2 點傷害
    if (amount === 2 && src.owner !== t.owner && src.owner === this.s.current) {
      this.questProgress(this.s.players[src.owner], 'exactDamage');
      if (this.s.players[src.owner].gorishi && !this.gorishiBusy) {
        this.gorishiBusy = true;
        yield* this.damage(src, t.uid, 2);
        this.gorishiBusy = false;
      }
    }
    if (src.freeze) this.freeze(t);
    if (src.lifesteal) yield* this.heal(this.s.players[src.owner].hero.uid, amount);
    // 「每當此手下造成傷害」（例如暗巷護甲鍛造師）
    const dealer = src.uid !== null ? this.minion(src.uid) : null;
    if (dealer && dealer.abilities.some((a) => a.on.k === 'dealtDamage')) yield* this.emit({ k: 'dealtDamage', player: dealer.owner, subject: dealer.uid, amount });
    // 盧米雅：英雄受到傷害後，免疫到回合結束
    if (isHero(t) && this.flagOnBoard('lumia')) this.s.players[t.owner].heroImmuneUntil = this.s.turn;
    yield* this.emit({ k: 'damaged', player: t.owner, subject: t.uid, amount, isHero: isHero(t) });
    // 清算：敵方手下造成 3 點以上的傷害後
    if (dealerM && amount >= 3 && this.alive(dealerM)) yield* this.checkSecrets(opp(dealerM.owner), 'enemyBigHit', { it: { kind: 'char', uid: dealerM.uid } });
    yield* this.accusationsAfterDamage(t);
    // 罪惡烙印：受到傷害時，對被烙印手下的擁有者的英雄造成 1 點傷害
    if (!isHero(t) && t.brand !== undefined) yield* this.damage({ owner: t.brand, uid: null, cardId: 'REV_506' }, this.s.players[t.owner].hero.uid, 1);
    // 曲齒：若四個友方角色在你的其中一個回合受到傷害，從手中或牌堆召喚
    if (this.s.current === t.owner) yield* this.trackDamaged(t);
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
    if (overkill) yield* this.overkill(src);
    return amount;
  }

  /** 達拉然勇士：在手牌中獲得體質後，額外獲得 +1/+1 */
  private extraOnBuffHand(hc: HandCard, atk: number, hp: number) {
    const extra = getCard(hc.cardId).extraOnBuff;
    if (!extra || (atk <= 0 && hp <= 0)) return;
    hc.atkBuff += extra.atk;
    hc.hpBuff += extra.hp;
  }

  private *trackDamaged(t: Char): Gen {
    const p = this.s.players[t.owner];
    if (p.damagedChars?.turn !== this.s.turn) p.damagedChars = { turn: this.s.turn, uids: [] };
    if (!p.damagedChars.uids.includes(t.uid)) p.damagedChars.uids.push(t.uid);
    if (p.damagedChars.uids.length < 4) return;
    for (const zone of ['hand', 'deck'] as const) {
      const hc = p[zone].find((h) => getCard(h.cardId).nameEn === 'Warptooth');
      if (!hc || p.board.length >= MAX_BOARD) continue;
      p[zone] = p[zone].filter((h) => h !== hc);
      this.log(p.id, `曲齒從${zone === 'hand' ? '手中' : '牌堆'}衝了出來`);
      yield* this.summon(p.id, hc.cardId);
      return;
    }
  }

  /** 觸發滅殺：造成傷害的手下 / 武器 / 法術 */
  private *overkill(src: DmgSource): Gen {
    const p = this.s.players[src.owner];
    const ctx = this.baseCtx(src.owner);
    let abilities: Ability[] = [];
    const m = src.uid !== null ? this.minion(src.uid) : null;
    if (m) {
      if (!m.silenced) abilities = m.abilities;
      ctx.sourceUid = m.uid;
      ctx.sourceCardId = m.cardId;
    } else if (src.uid === p.hero.uid && p.weapon) {
      abilities = p.weapon.abilities;
      ctx.sourceUid = p.weapon.uid;
      ctx.sourceCardId = p.weapon.cardId;
    } else if (src.cardId && getCard(src.cardId).type === 'SPELL') {
      abilities = getCard(src.cardId).abilities ?? [];
      ctx.sourceCardId = src.cardId;
      ctx.isSpell = true;
    }
    const list = abilities.filter((a) => a.on.k === 'overkill');
    if (list.length) this.log(src.owner, `${this.name(ctx.sourceCardId)}觸發了滅殺`);
    for (const ab of list) {
      if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
      yield* this.runEffects(ab.effects, ctx);
      if (this.over) return;
    }
  }

  private *heal(targetUid: number, amount: number): Gen<number> {
    const t = this.char(targetUid);
    if (!t || amount <= 0) return 0;
    if (isHero(t) && (this.s.players[t.owner].noHealUntil ?? -1) >= this.s.turn) return 0;
    const healer = this.s.players[this.s.current];
    // 水晶工匠崗古：你的治療加倍；奧奇奈亡魂：本回合你的治療改為造成傷害
    amount *= 2 ** this.flagCount('doubleHealing', healer.id);
    amount += healer.healBonus ?? 0;
    if (healer.healDamageTurn === this.s.turn) return yield* this.damage({ owner: healer.id, uid: null }, targetUid, amount);
    if (healer.healDamageOnceTurn === this.s.turn) {
      healer.healDamageOnceTurn = undefined;
      return yield* this.damage({ owner: healer.id, uid: null }, targetUid, amount);
    }
    // 噁心巨怪：敵方角色無法被治療
    if (this.s.players[opp(t.owner)].board.some((m) => !m.silenced && !m.dead && m.hp > 0 && getCard(m.cardId).flags?.includes('enemyNoHeal'))) return 0;
    // 溢療：手下被治療超過生命值上限
    if (!isHero(t) && amount > t.maxHp - t.hp && t.hp > 0 && !t.dead) {
      yield* this.emit({ k: 'overheal', player: t.owner, subject: t.uid });
      // 隱修士：其他手下被溢療時，獲得等量的額外生命值
      const over = amount - (t.maxHp - t.hp);
      for (const a of this.s.players[t.owner].board) {
        if (a !== t && !a.silenced && !a.dead && a.hp > 0 && getCard(a.cardId).flags?.includes('anchorite')) {
          t.maxHp += over;
          t.hp += over;
        }
      }
    }
    const healed = Math.min(t.maxHp - t.hp, amount);
    if (healed <= 0) return 0;
    t.hp += healed;
    this.questProgress(healer, 'heal', healed);
    this.s.players[t.owner].healedTurn = this.s.turn;
    healer.healedTurn = this.s.turn;
    healer.healedTotal = (healer.healedTotal ?? 0) + healed;
    if (isHero(t)) {
      const p = this.s.players[t.owner];
      p.heroHealedTurn = this.s.turn;
      p.heroHealthChangedTurn = this.s.turn;
    }
    this.fx({ kind: 'heal', uid: t.uid, amount: healed });
    yield* this.emit({ k: 'healed', player: t.owner, subject: t.uid, amount: healed, isHero: isHero(t) });
    return healed;
  }

  private freeze(c: Char) {
    // 慕拉比：每當另一個手下被凍結，把它的複製加入你的手牌
    if (!c.frozen && !isHero(c)) {
      for (const pl of this.s.players) {
        for (const m of pl.board) {
          if (m !== c && !m.silenced && this.alive(m) && getCard(m.cardId).flags?.includes('copyFrozen')) this.addToHand(pl, c.cardId);
        }
      }
    }
    if (!c.frozen) this.fx({ kind: 'freeze', uid: c.uid });
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

  /** 基爾加丹：無盡的惡魔傳送門，每回合額外 +2/+2 */
  private portalCard(p: PlayerState): HandCard | undefined {
    const c = pick(this.s, this.randomPool({ type: 'MINION', race: 'DEMON', anyClass: true }, p.id, false));
    if (!c) return undefined;
    const hc = this.newHandCard(c.id);
    const n = Math.floor((this.s.turn - (p.portal?.turn ?? this.s.turn) + 1) / 2) * 2;
    hc.atkBuff += n;
    hc.hpBuff += n;
    return hc;
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
        card = p.portal ? this.portalCard(p) : p.deck.pop();
        if (!card) {
          p.fatigue++;
          this.log(p.id, `${p.name}的牌庫已空，受到 ${p.fatigue} 點疲勞傷害`);
          this.fx({ kind: 'fatigue', player: p.id, amount: p.fatigue });
          yield* this.damage({ owner: p.id, uid: null }, p.hero.uid, p.fatigue);
          continue;
        }
      }
      // 抽到時召喚（為放進這張牌的玩家）：召喚後再抽一張
      if (getCard(card.cardId).summonedWhenDrawn) {
        const owner = card.summonFor ?? p.id;
        this.log(p.id, `${this.name(card.cardId)}被抽到了，為${this.s.players[owner].name}召喚`);
        yield* this.summon(owner, card.cardId, undefined, card);
        if (!pool) i--;
        continue;
      }
      // 抽到時施放：施放後再抽一張
      if (getCard(card.cardId).castsWhenDrawn) {
        yield* this.castOnDraw(p, card);
        if (!pool) i--;
        continue;
      }
      p.cardEvents = (p.cardEvents ?? 0) + 1;
      if (p.hand.length >= MAX_HAND) {
        if (p.godfrey) {
          p.godfrey.push(card);
          this.log(p.id, `${p.name}的手牌已滿，${this.name(card.cardId)}被暫時收起來了`);
          continue;
        }
        this.log(p.id, `${p.name}的手牌已滿，${this.name(card.cardId)}被燒掉了`);
        this.fx({ kind: 'burn', cardId: card.cardId, player: p.id });
        yield* this.burned(p, card);
        continue;
      }
      card.enteredTurn = this.s.turn;
      p.hand.push(card);
      // 護法者艾格文：抽到的下一個手下繼承法術傷害 +2 與這個亡語
      if (p.aegwynnNext && getCard(card.cardId).type === 'MINION') {
        p.aegwynnNext = false;
        card.spellDmg = (card.spellDmg ?? 0) + 2;
        (card.grant ??= []).push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'coAegwynn' }] });
      }
      this.questFillHand(p);
      drawn.push(card);
      if (this.splitShatter(p, card)) yield* this.emit({ k: 'shatter', player: p.id });
      p.drawnThisTurn++;
      this.questProgress(p, 'draw');
      if (this.isOtherClass(p, card.cardId)) {
        this.questProgress(p, 'otherClassCard');
        p.otherClassAdded = (p.otherClassAdded ?? 0) + 1;
      }
      this.fx({ kind: 'draw', uid: card.uid, player: p.id });
      // 「當你抽到這張牌時」（例如海劫者）
      for (const ab of getCard(card.cardId).abilities ?? []) {
        if (ab.on.k !== 'drawn') continue;
        yield* this.runEffects(ab.effects, { ...this.baseCtx(p.id), sourceCardId: card.cardId, handSource: card.uid });
      }
      yield* this.emit({ k: 'draw', player: p.id, subject: card.uid, subjectKind: 'hand' });
    }
    this.mergeShatter(p);
    return drawn;
  }

  /** 觸發手下的亡語（或指定的亡語能力） */
  private *runDeathrattles(m: Minion, list?: Ability[]): Gen {
    this.log(m.owner, `觸發了${this.name(m.cardId)}的亡語`);
    const dctx: Ctx = { ...this.baseCtx(m.owner), sourceUid: m.uid, sourceCardId: m.cardId, sourceSnapshot: m };
    for (const ab of list ?? m.abilities) {
      if (ab.on.k !== 'deathrattle' || (ab.cond && !this.evalCond(ab.cond, dctx))) continue;
      yield* this.runEffects(ab.effects, dctx);
      if (this.over) return;
    }
  }

  /** 讓玩家從幾張卡中選一張（電腦 / 模擬時自動選） */
  private *choose(ctx: Ctx, options: string[], title: string): Gen<string> {
    const idx = yield { player: ctx.controller, kind: 'discover', options, title };
    const chosen = options[Math.max(0, Math.min(options.length - 1, idx ?? 0))];
    yield* this.noteDiscover(ctx.controller, options, chosen);
    return chosen;
  }

  /** 讓指定玩家從選項中選擇（不算發現） */
  private *chooseAs(pid: PlayerId, options: string[], title: string): Gen<number> {
    const idx = yield { player: pid, kind: 'discover', options, title };
    return Math.max(0, Math.min(options.length - 1, idx ?? 0));
  }

  /** 從幾個角色中選擇一個（選項以它們的卡牌顯示） */
  private *chooseTarget(pid: PlayerId, chars: Char[], title: string): Gen<Char | undefined> {
    if (!chars.length) return undefined;
    if (chars.length === 1) return chars[0];
    // 英雄以他的英雄能力卡顯示（英雄本身不在卡牌資料庫中）
    const i = yield* this.chooseAs(pid, chars.map((c) => (isHero(c) ? HEROES[this.s.players[c.owner].heroClass].power.id : c.cardId)), title);
    return chars[i];
  }

  /** 你發現了一張牌：記錄次數、推進任務，起源之石會打出其他選項 */
  private *noteDiscover(pid: PlayerId, options: string[], chosen: string): Gen {
    const p = this.s.players[pid];
    p.discoveredTurn = this.s.turn;
    p.discoverCount = (p.discoverCount ?? 0) + 1;
    // 遊俠斥候：在你發現一張牌後，獲得它的複製
    for (const m of p.board) if (this.alive(m) && !m.silenced && getCard(m.cardId).flags?.includes('rangari')) this.addToHand(p, chosen);
    p.discoverPending = true;
    this.questProgress(p, 'discover');
    const w = p.weapon;
    if (w && w.cardId === 'TLC_460t' && w.durability > 0) {
      w.durability--;
      for (const id of options.filter((o) => o !== chosen)) yield* this.replay(pid, id);
    }
  }

  /** 發現的三個選項（名稱不重複） */
  private discoverOptions(pool: Pool | undefined, pid: PlayerId, cards?: CardDef[]): string[] {
    const list = shuffle(this.s, [...(cards ?? this.randomPool(pool ?? {}, pid, true))]);
    const opts: string[] = [];
    for (const c of list) {
      if (opts.length >= 3) break;
      if (!opts.some((o) => getCard(o).name === c.name)) opts.push(c.id);
    }
    return opts;
  }

  private isRace(cardId: string, race: Race): boolean {
    const races = getCard(cardId).races ?? [];
    return races.includes(race) || races.includes('ALL');
  }

  /** 抽到時施放的卡：由抽到的玩家施放 */
  private *castOnDraw(p: PlayerState, card: HandCard): Gen {
    const def = getCard(card.cardId);
    this.log(p.id, `${p.name}抽到了${this.name(def.id)}，立即施放`);
    this.fx({ kind: 'play', cardId: def.id, player: p.id });
    const ctx = this.baseCtx(p.id);
    ctx.sourceCardId = def.id;
    ctx.drawnCard = card;
    for (const ab of def.abilities ?? []) {
      if (ab.on.k !== 'play') continue;
      if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
      yield* this.runEffects(ab.effects, ctx);
      if (this.over) return;
    }
    yield* this.processDeaths();
  }

  private cardMatches(c: CardDef, pool: Pool, pid: PlayerId): boolean {
    const own = this.s.players[pid].heroClass;
    return poolCards(pool, own, this.s.players[opp(pid)].heroClass).some((x) => x.id === c.id);
  }

  private addToHand(p: PlayerState, cardId: string): HandCard | null {
    // 玉蓮幫幫主阿雅：偽造品取代你的幸運幣
    if (cardId === 'GAME_005' && p.coinCard) cardId = p.coinCard;
    if (p.hand.length >= MAX_HAND) {
      if (p.godfrey) {
        p.godfrey.push(this.newHandCard(cardId));
        return null;
      }
      this.fx({ kind: 'burn', cardId, player: p.id });
      return null;
    }
    const hc = this.newHandCard(cardId);
    hc.enteredTurn = this.s.turn;
    p.hand.push(hc);
    this.oskRoll(hc);
    // 保險庫破壞者：你發現一張牌後，它的消耗減少 (1)
    if (p.discoverPending) {
      p.discoverPending = false;
      hc.costMod -= this.flagCount('vaultBreaker', p.id);
    }
    this.questFillHand(p);
    if (this.isOtherClass(p, cardId)) {
      this.questProgress(p, 'otherClassCard');
      p.otherClassAdded = (p.otherClassAdded ?? 0) + 1;
      // 邀請信使：每當有其他職業的卡加入你的手牌，複製它
      if (!this.courierBusy && this.flagOnBoard('courier', p.id)) {
        this.courierBusy = true;
        this.addToHand(p, cardId);
        this.courierBusy = false;
      }
    }
    return hc;
  }

  /** 這張卡來自其他職業（不是你的職業，也不是中立） */
  private isOtherClass(p: PlayerState, cardId: string): boolean {
    const classes = cardClasses(getCard(cardId));
    return !classes.includes('NEUTRAL') && !classes.includes(p.heroClass);
  }

  makeMinion(owner: PlayerId, cardId: string, hand?: HandCard): Minion {
    const m = this.makeMinionBase(owner, cardId, hand);
    const ps = this.s.players[owner].passives;
    if (ps?.length) {
      // 奪來的旗幟：你的手下 +1/+1；隱形斗篷：你的手下具有隱形
      if (ps.includes('LOOTA_828')) {
        m.atkBuff += 1;
        m.maxHp += 1;
        m.hp += 1;
      }
      if (ps.includes('LOOTA_832') && !m.keywords.includes('STEALTH')) m.keywords.push('STEALTH');
    }
    return m;
  }

  private makeMinionBase(owner: PlayerId, cardId: string, hand?: HandCard): Minion {
    const parts = hand?.parts && cardId === ZOMBEAST_ID ? hand.parts : undefined;
    const ship = hand?.starship;
    const def = ship ? starshipDef(cardId, ship) : parts ? zombeastDef(parts) : getCard(cardId);
    // 黑暗法老特卡恩：你的跟班是 4/4
    const lackey = this.s.players[owner].lackeys44 && def.nameEn.includes('Lackey');
    // 水晶核心：你的手下是 5/5
    const five = this.s.players[owner].minions55 && def.type === 'MINION';
    const baseHp = five ? 5 : lackey ? 4 : (def.health ?? 1);
    const keywords = [...(def.keywords ?? [])];
    // 克蘇恩上場時帶著累積的加成
    const bonus = isCthun(cardId) ? this.s.players[owner].cthun : undefined;
    if (bonus?.taunt && !keywords.includes('TAUNT')) keywords.push('TAUNT');
    // 銀白之手新兵的永久加成 / 畸變怪物的加成效果
    const rb = def.nameEn === 'Silver Hand Recruit' ? this.s.players[owner].recruitBuff : undefined;
    if (def.nameEn === 'Silver Hand Recruit' && this.s.players[owner].recruitShield && !keywords.includes('DIVINE_SHIELD')) keywords.push('DIVINE_SHIELD');
    for (const k of hand?.bonus ?? []) if (!keywords.includes(k)) keywords.push(k);
    const hpBuff = (hand?.hpBuff ?? 0) + (bonus?.hp ?? 0) + (rb?.hp ?? 0);
    return {
      uid: this.uid(),
      cardId,
      owner,
      baseAtk: five ? 5 : lackey ? 4 : (def.attack ?? 0),
      baseHp,
      atkBuff: (hand?.atkBuff ?? 0) + (bonus?.atk ?? 0) + (rb?.atk ?? 0),
      tempAtk: 0,
      auraAtk: 0,
      auraHp: 0,
      maxHp: baseHp + hpBuff,
      hp: baseHp + hpBuff,
      keywords,
      tempKeywords: [],
      nextTurnKeywords: [],
      auraKeywords: [],
      ...(hand?.shieldHits ? { shieldHits: hand.shieldHits } : {}),
      abilities: [...(def.abilities ?? []), ...(hand?.grant ?? [])],
      auras: def.auras ?? [],
      spellDamage: (def.spellDamage ?? 0) + (hand?.spellDmg ?? 0),
      ...(hand?.fireDmg ? { fireDmg: hand.fireDmg } : {}),
      enrageAtk: def.enrage?.atk ?? 0,
      silenced: false,
      frozen: false,
      frozenTurn: 0,
      sleeping: true,
      summonedTurn: this.s.turn,
      attacks: 0,
      playOrder: ++this.s.playCounter,
      dead: false,
      parts,
      starship: ship,
      counter: hand?.boons,
    };
  }

  /** 召喚手下（非從手牌打出） */
  private *summon(owner: PlayerId, cardId: string, position?: number, hand?: HandCard): Gen<Minion | null> {
    const p = this.s.players[owner];
    if (p.board.length >= MAX_BOARD) return null;
    const m = this.makeMinion(owner, cardId, hand);
    // 水晶灣：本回合召喚的下一個手下屬性值設為 4/4
    if (p.nextMinion44Turn === this.s.turn && getCard(cardId).type === 'MINION') {
      p.nextMinion44Turn = undefined;
      this.setStats(m, 4, 4);
    }
    const pos = position === undefined ? p.board.length : Math.max(0, Math.min(position, p.board.length));
    p.board.splice(pos, 0, m);
    this.recalcAuras();
    this.countSummon(p, cardId, m);
    this.assemble(p, m);
    this.fx({ kind: 'summon', uid: m.uid, cardId, player: owner });
    yield* this.emit({ k: 'summon', player: owner, subject: m.uid, races: getCard(cardId).races });
    yield* this.emit({ k: 'summoned', player: owner, subject: m.uid });
    yield* this.summonLimbs(owner, m);
    this.wakeAshWorms();
    return m;
  }

  /** 巨型：在本體兩側召喚附肢（放不下的附肢，熔喉會留著等有空間再召喚） */
  private *summonLimbs(owner: PlayerId, body: Minion): Gen {
    const def = getCard(body.cardId);
    if (!def.colossal) return;
    const p = this.s.players[owner];
    body.limbs = [];
    const pending: string[] = [];
    let leftDone = !def.colossal.leftFirst;
    let right = p.board.indexOf(body) + 1;
    for (const id of def.colossal.limbs) {
      if (p.board.length >= MAX_BOARD) {
        pending.push(id);
        continue;
      }
      const onLeft = !leftDone;
      leftDone = true;
      const limb = yield* this.summon(owner, id, onLeft ? p.board.indexOf(body) : right);
      if (!limb) continue;
      if (onLeft) right++;
      else right = p.board.indexOf(limb) + 1;
      limb.limbOf = body.uid;
      limb.sleeping = body.sleeping;
      body.limbs.push(limb.uid);
    }
    if (pending.length) body.pendingLimbs = pending;
  }

  /** 熔喉：有空間時召喚剩下的附肢 */
  private *fillLimbs(p: PlayerState): Gen {
    for (const body of [...p.board]) {
      while (body.pendingLimbs?.length && p.board.length < MAX_BOARD && this.alive(body)) {
        const id = body.pendingLimbs.shift()!;
        const limb = yield* this.summon(p.id, id, p.board.indexOf(body) + 1);
        if (limb) {
          limb.limbOf = body.uid;
          (body.limbs ??= []).push(limb.uid);
        }
      }
    }
  }

  // ==========================================================================
  // 星艦
  // ==========================================================================

  // ==========================================================================
  // 死亡騎士的屍體
  // ==========================================================================

  gainCorpses(p: PlayerState, n: number) {
    if (n <= 0) return;
    // 法勒瑞克：獲得的屍體加倍
    if (p.board.some((m) => !m.silenced && !m.dead && getCard(m.cardId).flags?.includes('doubleCorpses'))) n *= 2;
    p.corpses = (p.corpses ?? 0) + n;
  }

  /** 用生命值支付消耗（不是傷害，護甲不會吸收） */
  private payHealth(p: PlayerState, n: number) {
    if (n <= 0) return;
    if (this.s.current === p.id && this.flagOnBoard('healthToMax', p.id)) {
      p.hero.maxHp += n;
      this.log(p.id, `${p.name}獲得了 ${n} 點最大生命值`);
      return;
    }
    p.hero.hp -= n;
    p.heroHealthChangedTurn = this.s.turn;
    this.fx({ kind: 'damage', uid: p.hero.uid, amount: n, player: p.id });
    this.log(p.id, `${p.name}支付了 ${n} 點生命值`);
  }

  /** 屍體足夠就花費並回傳 true */
  spendCorpses(p: PlayerState, n: number): boolean {
    if ((p.corpses ?? 0) < n) return false;
    p.corpses = (p.corpses ?? 0) - n;
    p.corpsesSpent = (p.corpsesSpent ?? 0) + n;
    this.questProgress(p, 'corpsesSpent', n);
    this.log(p.id, `花費了 ${n} 具屍體`);
    return true;
  }

  /** 星艦組件上場時組裝進星艦（記錄當下的攻擊力與生命值） */
  private assemble(p: PlayerState, m: Minion) {
    if (!getCard(m.cardId).starshipPiece) return;
    (p.starship ??= []).push({ id: m.cardId, atk: m.baseAtk + m.atkBuff, hp: m.maxHp - m.auraHp });
    this.log(p.id, `${this.name(m.cardId)}組裝進了星艦（${p.starship.length} 個組件）`);
  }

  launchCost(p: PlayerState): number {
    return Math.max(0, LAUNCH_COST - (p.launchDiscount ?? 0));
  }

  /** 目前玩家正在建造的星艦的定義（沒有則為 null） */
  starshipPreview(pid: PlayerId): CardDef | null {
    const p = this.s.players[pid];
    return p.starship?.length ? starshipDef(starshipIdFor(p.heroClass), p.starship) : null;
  }

  canLaunch(): { ok: boolean; reason?: string } {
    const p = this.me;
    if (!p.starship?.length) return { ok: false, reason: '還沒有組裝星艦組件' };
    if (p.board.length >= MAX_BOARD) return { ok: false, reason: '場上已滿' };
    if (p.mana < this.launchCost(p)) return { ok: false, reason: '法力不足' };
    return { ok: true };
  }

  private *doLaunch(): Gen {
    yield* this.launch(this.s.current, false);
  }

  /** 再施放一次法術（目標隨機；例如星光反應爐） */
  private *castRandomly(pid: PlayerId, cardId: string, preferEnemy = false): Gen {
    const def = getCard(cardId);
    if (def.type !== 'SPELL') return;
    const p = this.s.players[pid];
    if (def.secret) {
      if (p.secrets.length < MAX_SECRETS && !p.secrets.some((x) => x.cardId === cardId)) p.secrets.push({ uid: this.uid(), cardId });
      return;
    }
    let abilities = def.abilities ?? [];
    let req = def.target;
    if (def.chooseOne?.length) {
      const opt = pick(this.s, def.chooseOne)!;
      abilities = opt.abilities;
      req = opt.target;
    }
    let chosen: number | null = null;
    if (req) {
      let valid = this.validTargets(req, pid, true);
      // 優先以敵方為目標（大卸八塊）
      if (preferEnemy && valid.some((u) => this.char(u)!.owner !== pid)) valid = valid.filter((u) => this.char(u)!.owner !== pid);
      if (valid.length) chosen = pick(this.s, valid)!;
      else if (!req.optional) return;
    }
    this.log(pid, `再次施放了${this.name(cardId)}`);
    const ctx: Ctx = { ...this.baseCtx(pid), sourceCardId: cardId, isSpell: true, chosen };
    for (const ab of abilities) {
      if (ab.on.k !== 'play' || (ab.cond && !this.evalCond(ab.cond, ctx))) continue;
      yield* this.runEffects(ab.effects, ctx);
      if (this.over) return;
    }
  }

  /** 發射星艦：以手下的形式登場，觸發所有組件的發射效果 */
  private *launch(pid: PlayerId, free: boolean): Gen<Minion | null> {
    const p = this.s.players[pid];
    const pieces = p.starship;
    if (!pieces?.length || p.board.length >= MAX_BOARD) return null;
    if (!free) {
      p.mana -= this.launchCost(p);
      p.launchDiscount = 0;
    }
    p.starship = undefined;
    (p.launched ??= []).push(pieces);
    const m = yield* this.summonStarship(pid, pieces, true);
    // 發射過星艦後，手牌與牌堆中的卡會變形（例如雷神號）
    for (const hc of [...p.hand, ...p.deck]) {
      const into = getCard(hc.cardId).launchTransform;
      if (into) hc.cardId = into;
    }
    return m;
  }

  /** 讓星艦登場（launched = 觸發組件的發射效果） */
  private *summonStarship(pid: PlayerId, pieces: StarshipPiece[], launched: boolean): Gen<Minion | null> {
    const p = this.s.players[pid];
    if (p.board.length >= MAX_BOARD) return null;
    const shipId = starshipIdFor(p.heroClass);
    const m = this.makeMinion(pid, shipId, { uid: 0, cardId: shipId, costMod: 0, atkBuff: 0, hpBuff: 0, starship: pieces });
    p.board.push(m);
    this.recalcAuras();
    this.countSummon(p, shipId);
    this.log(pid, `${p.name}${launched ? '發射' : '召喚'}了星艦${this.name(shipId)}（${this.atkOf(m)}/${m.hp}）`);
    this.fx({ kind: 'play', cardId: shipId, player: pid });
    if (launched) {
      const ctx: Ctx = { ...this.baseCtx(pid), sourceUid: m.uid, sourceCardId: shipId };
      for (const piece of pieces) {
        for (const ab of getCard(piece.id).abilities ?? []) {
          if (ab.on.k !== 'launch' || (ab.cond && !this.evalCond(ab.cond, ctx))) continue;
          yield* this.runEffects(ab.effects, ctx);
          if (this.over) return m;
        }
      }
    }
    yield* this.emit({ k: 'summon', player: pid, subject: m.uid, races: getCard(shipId).races });
    return m;
  }

  private countSummon(p: PlayerState, cardId: string, m?: Minion) {
    const def = getCard(cardId);
    for (const r of def.races ?? []) p.summonedRaces[r] = (p.summonedRaces[r] ?? 0) + 1;
    this.questProgress(p, 'summon');
    if (this.isRace(cardId, 'DEMON') && p.heroPower.id === 'JAIL_EVENT_101hp') p.heroPower.used = false;
    if ((def.attack ?? 0) >= 5) this.questProgress(p, 'bigMinionSummon');
    if (def.abilities?.some((a) => a.on.k === 'deathrattle')) this.questProgress(p, 'deathrattleSummon');
    if (this.isRace(cardId, 'MURLOC')) {
      this.questProgress(p, 'murlocSummon');
      // 重複任務獎勵：你召喚的魚人獲得 +1/+1
      if (m && p.murlocBuff) {
        m.atkBuff += p.murlocBuff;
        m.maxHp += p.murlocBuff;
        m.hp += p.murlocBuff;
      }
    }
  }

  private *equip(owner: PlayerId, cardId: string, hand?: HandCard): Gen {
    const p = this.s.players[owner];
    const old = p.weapon;
    const def = getCard(cardId);
    p.weapon = {
      uid: this.uid(),
      cardId,
      owner,
      atk: (def.attack ?? 0) + (hand?.atkBuff ?? 0),
      durability: (def.health ?? 1) + (hand?.hpBuff ?? 0),
      abilities: [...(def.abilities ?? [])],
      keywords: [...(def.keywords ?? [])],
    };
    if (old) yield* this.weaponDestroyed(old);
    yield* this.emit({ k: 'equip', player: owner });
  }

  private *weaponDestroyed(w: Weapon): Gen {
    this.log(w.owner, `${this.name(w.cardId)}被摧毀了`);
    (this.s.players[w.owner].destroyedWeapons ??= []).push(w.cardId);
    const ctx = this.baseCtx(w.owner);
    ctx.sourceUid = w.uid;
    ctx.sourceCardId = w.cardId;
    ctx.weapon = w;
    for (const ab of w.abilities) {
      if (ab.on.k === 'deathrattle') yield* this.runEffects(ab.effects, ctx);
    }
    yield* this.emit({ k: 'weaponDestroyed', player: w.owner });
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
          const raceOk =
            (!aura.race || races.includes(aura.race) || races.includes('ALL')) &&
            (!aura.nameEn || getCard(m.cardId).nameEn === aura.nameEn) &&
            (!aura.notNameEn || getCard(m.cardId).nameEn !== aura.notNameEn) &&
            (!aura.keyword || m.keywords.includes(aura.keyword)) &&
            (!aura.cond || this.evalCond(aura.cond, { ...this.baseCtx(src.owner), sourceUid: src.uid }));
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
            case 'self':
              applies = src === m && (!aura.cond || this.evalCond(aura.cond, { ...this.baseCtx(src.owner), sourceUid: src.uid }));
              break;
          }
          if (!applies) continue;
          if (aura.dyn) {
            const n = this.dyn(aura.dyn.amount, { ...this.baseCtx(src.owner), sourceUid: src.uid });
            atk += (aura.dyn.atk ?? 0) * n;
            hp += (aura.dyn.hp ?? 0) * n;
          }
          atk += (aura.atk ?? 0) + (aura.heraldAtk ? aura.heraldAtk * this.heraldPower(this.s.players[src.owner]) : 0);
          hp += aura.hp ?? 0;
          if (aura.keywords) kws.push(...aura.keywords);
        }
      }
      const own = this.s.players[m.owner];
      // 天界光環：你只有 1 個手下時，它的攻擊力與生命值為 10
      if (own.eternal?.some((e) => e.sourceCardId === 'GDB_140') && own.board.filter((x) => !x.dead && x.hp > 0).length === 1 && own.board[0] === m) {
        atk = 10 - (m.baseAtk + m.atkBuff);
        hp = 10 - (m.maxHp - m.auraHp);
      }
      // 蟲族增生：你的蟲族手下 +1 攻擊力與突襲；基因鞭笞等
      if (getCard(m.cardId).zerg) {
        if (own.zergAtk) atk += own.zergAtk;
        if (own.zergRushTurn === this.s.turn) kws.push('RUSH');
        if (own.eternal?.some((e) => e.sourceCardId === 'SC_011')) {
          atk += 1;
          kws.push('RUSH');
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
        if (p.diedThisTurn?.turn !== this.s.turn) p.diedThisTurn = { turn: this.s.turn, ids: [] };
        p.diedThisTurn.ids.push(m.cardId);
        p.cardEvents = (p.cardEvents ?? 0) + 1;
        this.s.deathsThisTurn++;
        p.friendlyDiedTurn = this.s.turn;
        const races = getCard(m.cardId).races;
        if (races?.includes('UNDEAD') || races?.includes('ALL')) p.undeadDiedTurn = this.s.turn;
        // 死亡騎士：友方手下死亡時獲得 1 具屍體（屍體喚起的手下不會留下屍體）
        if (p.heroClass === 'DEATHKNIGHT' && !getCard(m.cardId).noCorpse) this.gainCorpses(p, 1);
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
          // 瑞文戴爾男爵：你的手下的亡語觸發兩次
          const times = this.flagOnBoard('doubleDeathrattle', m.owner) ? 2 : 1;
          for (let i = 0; i < times; i++) {
            for (const ab of m.abilities) {
              if (ab.on.k !== 'deathrattle') continue;
              if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
              yield* this.runEffects(ab.effects, ctx);
            }
          }
          if (m.keywords.includes('REBORN')) {
            const r = yield* this.summon(m.owner, m.cardId, ctx.position);
            (p.rebornCards ??= []).push(m.cardId);
            if (r) {
              // 罪孽戰騎：重生後擁有全滿生命值並保留附魔
              if (getCard(m.cardId).rebornFull) {
                this.copyStats(m, r);
                r.hp = r.maxHp;
              } else {
                r.baseHp = 1;
                r.maxHp = 1 + r.auraHp;
                r.hp = r.maxHp;
              }
              r.keywords = r.keywords.filter((k) => k !== 'REBORN');
              // 奧奇奈亡語者：友方手下重生後，召喚它的複製
              for (const _a of p.board.filter((x) => this.alive(x) && !x.silenced && x !== r && getCard(x.cardId).flags?.includes('auchenai'))) {
                const c = yield* this.summon(m.owner, r.cardId);
                if (c) c.keywords = c.keywords.filter((k) => k !== 'REBORN');
              }
            }
          }
        }
        this.infuseTick(m);
        this.accusationFire('murder', opp(m.owner), m.uid);
        this.reopenLocations(this.s.players[m.owner], 'minionDied');
        yield* this.emit({ k: 'minionDied', player: m.owner, subject: m.uid, races: getCard(m.cardId).races, cardId: m.cardId, amount: this.atkOf(m) });
        yield* this.checkSecrets(m.owner, 'friendlyMinionDies', { it: { kind: 'char', uid: m.uid }, itCardId: m.cardId, summonedTurn: m.summonedTurn });
      }
    }
    for (const pl of this.s.players) if (pl.board.some((m) => m.pendingLimbs?.length)) yield* this.fillLimbs(pl);
    this.wakeAshWorms();
    // 可拋棄的表演者：七個新兵在同一回合全部死亡，再召喚七個
    for (const pl of this.s.players) {
      const pf = pl.performers;
      if (!pf || pf.done || pf.turn !== this.s.turn || pf.uids.some((u) => this.minion(u))) continue;
      pf.done = true;
      for (let i = 0; i < 7; i++) yield* this.summon(pl.id, 'BT_036t');
    }
    // 殭屍收割者胡斯克：英雄死亡時，花費最多 20 具屍體，以等量生命值復活
    for (const pl of this.s.players) {
      if (pl.hero.hp > 0 || !pl.eternalLife || (pl.corpses ?? 0) <= 0) continue;
      const n = Math.min(20, pl.corpses ?? 0);
      this.spendCorpses(pl, n);
      pl.eternalLife = false;
      pl.hero.hp = n;
      pl.hero.maxHp = Math.max(pl.hero.maxHp, n);
      this.log(pl.id, `${pl.name}花費 ${n} 具屍體復活了！`);
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
      const order: PlayerId[] = (ev.onlyOwner !== undefined ? [ev.onlyOwner] : [this.s.current, opp(this.s.current)]) as PlayerId[];
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
          ctx.itFromOpp = !!ev.fromOpp;
          ctx.eventAmount = ev.amount ?? 0;
          ctx.outcast = !!ev.outcast;
          ctx.rightmost = !!ev.rightmost;
          if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
          if (ab.once && !(ab.keepOnce && ev.cardId && getCard(ev.cardId).spellSchool === ab.keepOnce)) ent.abilities = ent.abilities.filter((x) => x !== ab);
          yield* this.runEffects(ab.effects, ctx);
        }
      }
      // 掛在玩家身上、本場對戰都有效的能力
      for (const pid of order) {
        for (const e of [...(this.s.players[pid].eternal ?? [])]) {
          if (this.over) return;
          if (e.turn !== undefined && e.turn !== this.s.turn) continue;
          if (e.minSpells !== undefined && this.s.players[pid].spellsCastThisGame < e.minSpells) continue;
          if (!this.matches(e.ability.on, ev, -1, pid)) continue;
          const ctx = this.baseCtx(pid);
          ctx.sourceCardId = e.sourceCardId;
          if (ev.subject !== undefined) ctx.it = { kind: ev.subjectKind ?? 'char', uid: ev.subject };
          ctx.itCardId = ev.cardId;
          ctx.itFromOpp = !!ev.fromOpp;
          ctx.eventAmount = ev.amount ?? 0;
          if (e.ability.cond && !this.evalCond(e.ability.cond, ctx)) continue;
          yield* this.runEffects(e.ability.effects, ctx);
        }
      }
      // 手牌中的卡的能力（例如肥油大亨）
      for (const pid of order) {
        for (const hc of [...this.s.players[pid].hand]) {
          const list = this.handDef(hc).handAbilities;
          if (!list) continue;
          for (const ab of list) {
            if (this.over) return;
            if (!this.s.players[pid].hand.includes(hc) || !this.matches(ab.on, ev, -1, pid)) continue;
            const ctx = this.baseCtx(pid);
            ctx.sourceCardId = hc.cardId;
            ctx.handSource = hc.uid;
            if (ev.subject !== undefined) ctx.it = { kind: ev.subjectKind ?? 'char', uid: ev.subject };
            ctx.itCardId = ev.cardId;
          ctx.itFromOpp = !!ev.fromOpp;
            ctx.eventAmount = ev.amount ?? 0;
            if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
            yield* this.runEffects(ab.effects, ctx);
          }
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
        return rel(trig.side) && (!trig.school || (!!ev.cardId && getCard(ev.cardId).spellSchool === trig.school));
      case 'heroPower':
      case 'draw':
      case 'discard':
      case 'equip':
        return rel(trig.side);
      case 'spellTarget':
        return ev.subject === holderUid && ev.player === owner;
      case 'attacked':
        return ev.subject === holderUid;
      case 'shieldLost':
      case 'weaponDestroyed':
        return rel(trig.side);
      case 'armorGained':
      case 'prepare':
      case 'lastMana':
        return ev.player === owner;
      case 'shatter':
        return ev.player === owner;
      case 'summoned':
        return ev.subject === holderUid;
      case 'firstSpellDamage':
        return ev.player === owner;
      case 'overheal':
      case 'dealtDamage':
        return ev.subject === holderUid;
      case 'cardPlayed':
        return (
          rel(trig.side) &&
          (!trig.cardType || trig.cardType === ev.cardType) &&
          raceOk(trig.race) &&
          (trig.keyword !== 'ECHO' || !!ev.echo) &&
          ev.subject !== holderUid
        );
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
          case 'enemyMinion':
            return !ev.isHero && ev.player !== owner;
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

  private *checkSecrets(owner: PlayerId, ev: SecretEvent, info: { it?: ItRef; itCardId?: string; amount?: number; summonedTurn?: number }): Gen {
    if (this.s.current === owner || this.over) return;
    // 守口如瓶的證人：奧秘無法被揭露
    if (this.flagOnBoard('secretsLocked')) return;
    const p = this.s.players[owner];
    for (const sec of [...p.secrets]) {
      if (this.secretEvent(sec.cardId) !== ev) continue;
      if (!p.secrets.includes(sec)) continue;
      // 目標已不存在時不觸發
      if (info.it?.kind === 'char' && ev !== 'friendlyMinionDies' && !this.char(info.it.uid)) continue;
      if (ev === 'friendlyMinionDies' && p.board.length >= MAX_BOARD) continue;
      const ab = getCard(sec.cardId).abilities!.find((a) => a.on.k === 'secret')!;
      const ctx = this.baseCtx(owner);
      ctx.sourceCardId = sec.cardId;
      ctx.isSpell = true;
      ctx.it = info.it ?? null;
      ctx.itCardId = info.itCardId;
      ctx.itSummonedTurn = info.summonedTurn;
      ctx.eventAmount = info.amount ?? 0;
      // 有條件的奧秘（例如神聖試煉）：條件不成立時不會揭露
      if (ab.cond && !this.evalCond(ab.cond, ctx)) continue;
      this.revealSecret(owner, sec.uid);
      yield* this.runEffects(ab.effects, ctx);
      // 機關房間：每揭露一個奧秘，召喚一個 3/3 的鋸刃
      if (p.heroPower.id === 'LOOTA_BOSS_48p') yield* this.doSummon(ctx, owner, 'LOOTA_BOSS_48t');
      // 哈基亞：奧秘被觸發時，重新召喚存放在裡面的靈魂
      for (const soul of sec.souls ?? []) yield* this.doSummon(ctx, owner, soul);
      // 莊園經理歐萊恩：友方奧秘被揭露後，施放另一個法師奧秘
      for (const o of p.board.filter((m) => this.alive(m) && !m.silenced && getCard(m.cardId).flags?.includes('orion'))) {
        yield* this.runEffects([{ e: 'custom', fn: 'coOrionCast' }], { ...this.baseCtx(owner), sourceUid: o.uid, sourceCardId: o.cardId });
      }
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
    return { owner: ctx.controller, uid: ctx.sourceUid, lifesteal: ctx.lifesteal, cardId: ctx.isSpell ? ctx.sourceCardId : undefined };
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
        return this.weaponAtk(p);
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
      case 'nonStartingPlayed':
        return p.nonStartingPlayed ?? 0;
      case 'shuffleCount':
        return p.shuffleCount ?? 0;
      case 'friendlyImps':
        return p.board.filter((m) => this.alive(m) && /\bImp\b/.test(getCard(m.cardId).nameEn)).length;
      case 'summonedRace':
        return race ? (p.summonedRaces[race] ?? 0) : 0;
      case 'starshipsLaunched':
        return p.launched?.length ?? 0;
      case 'corpses':
        return p.corpses ?? 0;
      case 'corpsesSpent':
        return p.corpsesSpent ?? 0;
      case 'deathsThisGame':
        return this.s.players[0].graveyard.length + this.s.players[1].graveyard.length;
      case 'frozenChars':
        return this.chars().filter((ch) => ch.frozen && this.alive(ch)).length;
      case 'plaguesShuffled':
        return p.plaguesShuffled ?? 0;
      case 'spellDamage':
        return this.spellDamage(p.id);
      case 'secretsPlayed':
        return p.secretsPlayed ?? 0;
      case 'friendlyDiedThisTurn':
        return p.diedThisTurn?.turn === this.s.turn ? p.diedThisTurn.ids.length : 0;
      case 'handCounter':
        return ctx.handCounter ?? 0;
      case 'weaponDurability':
        return p.weapon?.durability ?? 0;
      case 'discardedThisGame':
        return p.discardedCount ?? 0;
      case 'enemyDeathrattleMinions':
        return e.board.filter((m) => this.alive(m) && !m.silenced && m.abilities.some((a) => a.on.k === 'deathrattle')).length;
      case 'overloadedThisGame':
        return p.overloadTotal ?? 0;
      case 'recruits':
        return p.board.filter((m) => this.alive(m) && getCard(m.cardId).nameEn === 'Silver Hand Recruit').length;
      case 'itCost':
        return ctx.itCardId ? getCard(ctx.itCardId).cost : 0;
      case 'heraldPower':
        return this.heraldPower(p);
      case 'heralds':
        return p.heralds ?? 0;
      case 'spellDamageDealtThisTurn':
        return p.spellDamageDealt?.turn === this.s.turn ? p.spellDamageDealt.amount : 0;
      case 'felSpellsCast':
        return p.felSpells ?? 0;
      case 'attacksThisGame':
        return p.attacksThisGame ?? 0;
      case 'minionsOnBoardTotal':
        return this.s.players[0].board.filter((m) => this.alive(m)).length + this.s.players[1].board.filter((m) => this.alive(m)).length;
      case 'lastCardCost':
        return p.lastPlayedCost ?? 0;
      case 'coinsInHand':
        return p.hand.filter((h) => getCard(h.cardId).nameEn.includes('Coin')).length;
      case 'deckSize':
        return p.deck.length;
      case 'twoManaPlayed':
        return p.twoManaPlayed ?? 0;
      case 'heroAttacksThisGame':
        return p.heroAttacks ?? 0;
      case 'remainingMana':
        return p.mana;
      case 'bigSpellsThisGame':
        return p.bigSpells ?? 0;
      case 'cardEvents':
        return p.cardEvents ?? 0;
      case 'discoveredThisGame':
        return p.discoverCount ?? 0;
      case 'zergOnBoard':
        return p.board.filter((m) => this.alive(m) && getCard(m.cardId).zerg).length;
      case 'protossSpells':
        return p.protossSpells ?? 0;
      case 'heroDamageThisTurn':
        return p.heroDamageTaken?.turn === this.s.turn ? p.heroDamageTaken.amount : 0;
      case 'enemyHeroDamageThisTurn':
        return p.enemyHeroDamage?.turn === this.s.turn ? p.enemyHeroDamage.amount : 0;
      case 'rafaamsPlayed':
        return (p.playedCards ?? []).filter((id) => getCard(id).nameEn.includes('Rafaam')).length;
      case 'enemyHeroHitsThisTurn':
        return p.enemyHeroHits?.turn === this.s.turn ? p.enemyHeroHits.count : 0;
      case 'turnsTaken':
        return (this.s.turn + (this.s.first === p.id ? 1 : 0)) >> 1;
      case 'selfHealth': {
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        return m?.hp ?? ctx.sourceSnapshot?.hp ?? 0;
      }
      case 'spellManaSpent':
        return p.spellManaSpent ?? 0;
      case 'treantsDied':
        return p.graveyard.filter((id) => getCard(id).nameEn.includes('Treant')).length;
      case 'otherClassAdded':
        return p.otherClassAdded ?? 0;
      case 'elementalsLastTurn':
        return p.elementalsLastTurn ?? 0;
      case 'itOverload':
        return ctx.itCardId ? (getCard(ctx.itCardId).overload ?? 0) : 0;
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
    if (f.maxHp !== undefined && c.hp > f.maxHp) return false;
    if (f.hasRace && (hero || !(getCard(c.cardId).races ?? []).length)) return false;
    if (f.keyword && (hero || !this.hasKw(c, f.keyword))) return false;
    if (f.starship && (hero || !(c.starship || getCard(c.cardId).starshipPiece))) return false;
    if (f.terran && (hero || !getCard(c.cardId).terran)) return false;
    if (f.protoss && (hero || !getCard(c.cardId).protoss)) return false;
    if (f.zerg && (hero || !getCard(c.cardId).zerg)) return false;
    if (f.notRace && !hero) {
      const races = getCard(c.cardId).races ?? [];
      if (races.includes(f.notRace) || races.includes('ALL')) return false;
    }
    if (f.legendary && (hero || getCard(c.cardId).rarity !== 'LEGENDARY')) return false;
    if (f.hasDeathrattle && (hero || c.silenced || !c.abilities.some((a) => a.on.k === 'deathrattle'))) return false;
    if (f.nameIncludes && (hero || !getCard(c.cardId).nameEn.includes(f.nameIncludes))) return false;
    if (f.cardClass && (hero || !cardClasses(getCard(c.cardId)).includes(f.cardClass))) return false;
    if (f.notClass && !hero && cardClasses(getCard(c.cardId)).includes(f.notClass)) return false;
    // 休眠的手下不會被任何效果影響
    if (!hero && this.hasKw(c, 'DORMANT')) return false;
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
          if (c.minCost !== undefined && def.cost < c.minCost) return false;
          if (c.minAtk !== undefined && (def.attack ?? 0) < c.minAtk) return false;
          if (c.race && !races(h.cardId).includes(c.race) && !races(h.cardId).includes('ALL')) return false;
          return true;
        });
      case 'control': {
        const board = c.side === 'enemy' ? this.s.players[opp(ctx.controller)].board : p.board;
        const list = board.filter((m) => {
          if (m.uid === ctx.sourceUid || !this.alive(m)) return false;
          if (c.race && !races(m.cardId).includes(c.race) && !races(m.cardId).includes('ALL')) return false;
          if (c.keyword && !this.hasKw(m, c.keyword)) return false;
          if (c.minAtk !== undefined && this.atkOf(m) < c.minAtk) return false;
          if (c.minHp !== undefined && m.hp < c.minHp) return false;
          if (c.nameIncludes && !getCard(m.cardId).nameEn.includes(c.nameIncludes)) return false;
          if (c.damaged && m.hp >= m.maxHp) return false;
          if (c.hp !== undefined && m.hp !== c.hp) return false;
          if (c.frozen && !m.frozen) return false;
          return true;
        });
        return list.length >= (c.min ?? 1);
      }
      case 'combo':
        return ctx.combo;
      case 'outcast':
        return ctx.outcast;
      case 'selfCostZero':
        return !!ctx.playedCard && this.costOf(p, ctx.playedCard) === 0;
      case 'adjPlayed':
        return ctx.playedCard?.adjPlayedTurn === this.s.turn;
      case 'discoveredThisTurn':
        return p.discoveredTurn === this.s.turn;
      case 'hasLocation':
        return (p.locations?.length ?? 0) > 0;
      case 'launchedShip':
        return this.dyn('starshipsLaunched', ctx) > 0;
      case 'heroAttacked':
        return p.heroAttackedThisTurn;
      case 'handSize': {
        const n = (c.side === 'enemy' ? this.s.players[opp(ctx.controller)] : p).hand.length;
        return c.op === '>=' ? n >= c.n : n <= c.n;
      }
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
      case 'heroHealth': {
        const hp = (c.side === 'enemy' ? this.s.players[opp(ctx.controller)] : p).hero.hp;
        return c.op === '<=' ? hp <= c.n : hp >= c.n;
      }
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
      case 'cthunAttack':
        return this.cthunAttack(p.id) >= c.n;
      case 'buildingStarship':
        return !!p.starship?.length;
      case 'launchedStarship':
        return !!p.launched?.length;
      case 'anyFrozen':
        return this.chars().some((ch) => ch.frozen && this.alive(ch));
      case 'friendlyDiedThisTurn':
        return p.friendlyDiedTurn === this.s.turn;
      case 'undeadDiedSinceLastTurn':
        // 你上個回合結束之後 = 對手的回合或這個回合
        return (p.undeadDiedTurn ?? -9) >= this.s.turn - (this.s.current === p.id ? 1 : 0);
      case 'heroHealthChanged':
        return p.heroHealthChangedTurn === this.s.turn;
      case 'heroHealed':
        return p.heroHealedTurn === this.s.turn;
      case 'itHasDeathrattle': {
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        return !!m && !m.silenced && m.abilities.some((a) => a.on.k === 'deathrattle');
      }
      case 'itHasBattlecry': {
        let id: string | undefined = ctx.itCardId;
        if (ctx.it?.kind === 'char') id = this.minion(ctx.it.uid)?.cardId ?? id;
        else if (ctx.it?.kind === 'hand') id = this.handCard(ctx.it.uid)?.card.cardId ?? id;
        if (!id) return false;
        const def = getCard(id);
        return def.type !== 'SPELL' && !!def.abilities?.some((a) => a.on.k === 'play');
      }
      case 'spellDamage':
        return this.spellDamage(p.id) > 0;
      case 'enemyFrozen':
        return [this.s.players[opp(p.id)].hero, ...this.s.players[opp(p.id)].board].some((ch) => ch.frozen && this.alive(ch));
      case 'chosenRace': {
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        return !!m && (races(m.cardId).includes(c.race) || races(m.cardId).includes('ALL'));
      }
      case 'selfAttack':
        return this.dyn('selfAttack', ctx) >= c.n;
      case 'weaponAttack':
        return this.weaponAtk(p) >= c.n;
      case 'died':
        return this.s.players.some((pl) => pl.graveyard.some((id) => getCard(id).nameEn === c.name));
      case 'unspentMana':
        return p.mana > 0;
      case 'itSecret':
        return !!ctx.itCardId && !!getCard(ctx.itCardId).secret;
      case 'itOtherClass':
        return !!ctx.itCardId && this.isOtherClass(p, ctx.itCardId);
      case 'itCost':
        return !!ctx.itCardId && getCard(ctx.itCardId).cost === c.n;
      case 'itAttack': {
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        return !!m && this.atkOf(m) === c.n;
      }
      case 'itCard':
        return ctx.itCardId === c.id;
      case 'deckSize':
        return c.op === '>=' ? p.deck.length >= c.n : p.deck.length <= c.n;
      case 'deckNoNeutral':
        return !p.deck.some((h) => getCard(h.cardId).cardClass === 'NEUTRAL');
      case 'itKeyword': {
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        return !!m && this.hasKw(m, c.k);
      }
      case 'chosenKeyword': {
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        return !!m && this.hasKw(m, c.k);
      }
      case 'handCounter':
        return (ctx.handCounter ?? 0) >= c.n;
      case 'itCostAtMost': {
        let id: string | undefined = ctx.itCardId;
        if (ctx.it?.kind === 'hand') id = this.handCard(ctx.it.uid)?.card.cardId ?? id;
        return !!id && getCard(id).cost <= c.n;
      }
      case 'itFromOpp':
        return !!ctx.itFromOpp;
      case 'itIsCardId': {
        let id: string | undefined = ctx.itCardId;
        if (ctx.it?.kind === 'char') id = this.minion(ctx.it.uid)?.cardId ?? id;
        else if (ctx.it?.kind === 'hand') id = this.handCard(ctx.it.uid)?.card.cardId ?? id;
        return id === c.id;
      }
      case 'graveyardCount':
        return p.graveyard.filter((id) => getCard(id).nameEn === c.name).length >= c.n;
      case 'startedNoSpells':
        return !!p.startedNoSpells;
      case 'heldSpent':
        return (ctx.playedCard?.spent ?? 0) >= c.n;
      case 'noMinionLastTurn':
        return p.minionPlayedTurn !== this.s.turn - 2;
      case 'spellDamagedThisTurn':
        return p.spellDamageDealt?.turn === this.s.turn && p.spellDamageDealt.amount > 0;
      case 'controlLegendary':
        return p.board.some((m) => this.alive(m) && getCard(m.cardId).rarity === 'LEGENDARY') || p.secrets.some((x) => getCard(x.cardId).rarity === 'LEGENDARY');
      case 'holdingDragon':
        return p.hand.some((h) => this.isRace(h.cardId, 'DRAGON'));
      case 'handParity': {
        const rest = p.hand.filter((h) => h !== ctx.playedCard && h.uid !== ctx.handSource);
        return rest.length > 0 && rest.every((h) => this.handDef(h).cost % 2 === (c.odd ? 1 : 0));
      }
      case 'boardFull':
        return p.board.length >= MAX_BOARD;
      case 'itIsSelf':
        return ctx.it?.kind === 'char' && ctx.it.uid === ctx.sourceUid;
      case 'playedCopy':
        return (p.playedCards ?? []).filter((id) => id === ctx.sourceCardId).length >= 2;
      case 'noOtherMinions':
        return !p.board.some((m) => this.alive(m) && m.uid !== ctx.sourceUid);
      case 'itHasCombo':
        return !!ctx.itCardId && JSON.stringify(getCard(ctx.itCardId).abilities ?? []).includes('"c":"combo"');
      case 'chosenFrozen':
      case 'chosenDamaged':
      case 'chosenFriendly': {
        const ch = ctx.chosen !== null ? this.char(ctx.chosen) : null;
        if (!ch) return false;
        if (c.c === 'chosenFrozen') return ch.frozen;
        if (c.c === 'chosenDamaged') return ch.hp < ch.maxHp;
        return ch.owner === ctx.controller;
      }
      case 'heroDamaged':
        return p.heroDamagedTurn === this.s.turn;
      case 'anyDiedThisTurn':
        return this.s.deathsThisTurn > 0;
      case 'deckNoCost':
        return !p.deck.some((h) => getCard(h.cardId).cost === c.n);
      case 'deckParity':
        return p.deck.every((h) => getCard(h.cardId).cost % 2 === (c.odd ? 1 : 0));
      case 'selfDormant': {
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        return !!m && m.keywords.includes('DORMANT');
      }
      case 'holdingGift':
        return p.hand.some((h) => h.gifted && h.uid !== ctx.playedCard?.uid);
      case 'imbued':
        return (p.imbued ?? 0) >= c.n;
      case 'handAllDifferentCosts': {
        const costs = p.hand.filter((h) => h.uid !== ctx.playedCard?.uid).map((h) => this.costOf(p, h));
        return new Set(costs).size === costs.length;
      }
      case 'heroPowerUsed':
        return p.heroPower.used;
      case 'handHasCostAtLeast':
        return p.hand.some((h) => h.uid !== ctx.playedCard?.uid && getCard(h.cardId).cost >= c.n);
      case 'itFireSpell':
        return !!ctx.itCardId && getCard(ctx.itCardId).spellSchool === 'FIRE';
      case 'discoveredThisTurn':
        return p.discoveredTurn === this.s.turn;
      case 'castHolyAndShadow':
        return p.schoolsThisTurn?.turn === this.s.turn && p.schoolsThisTurn.schools.includes('HOLY') && p.schoolsThisTurn.schools.includes('SHADOW');
      case 'deckTenCosts':
        return new Set(p.deck.filter((h) => h.starting).map((h) => getCard(h.cardId).cost)).size >= 10 || new Set(p.deck.map((h) => getCard(h.cardId).cost)).size >= 10;
      case 'deckSameType': {
        const minions = p.deck.filter((h) => getCard(h.cardId).type === 'MINION');
        if (!minions.length) return false;
        const common = (getCard(minions[0].cardId).races ?? []).filter((r) => minions.every((h) => (getCard(h.cardId).races ?? []).includes(r) || (getCard(h.cardId).races ?? []).includes('ALL')));
        return common.length > 0 || minions.every((h) => (getCard(h.cardId).races ?? []).includes('ALL'));
      }
      case 'deckNoMinions':
        return !p.deck.some((h) => getCard(h.cardId).type === 'MINION');
      case 'kindred': {
        const d = ctx.playedCard ? this.handDef(ctx.playedCard) : getCard(ctx.sourceCardId);
        return (p.prevPlayed ?? []).some((id) => {
          const o = getCard(id);
          if (d.spellSchool && o.spellSchool === d.spellSchool) return true;
          return (d.races ?? []).some((r) => o.races?.includes(r) || o.races?.includes('ALL') || r === 'ALL');
        });
      }
      case 'heroDamagedThisTurn':
        return p.heroDamagedTurn === this.s.turn;
      case 'controlObjective':
        return !!p.eternal?.some((e) => e.objective);
      case 'heroKilled':
        return !!this.lastAttack?.killed && !this.lastAttack.defenderIsHero;
      case 'anyDormant':
        return this.s.players.some((pl) => pl.board.some((m) => m.keywords.includes('DORMANT')));
      case 'handCenter':
        return !!ctx.center;
      case 'healedThisTurn':
        return p.healedTurn === this.s.turn;
      case 'castSpellLastTurn':
        return (p.prevTurnSpells?.length ?? 0) > 0;
      case 'attackedMinion':
        return !!this.lastAttack && !this.lastAttack.defenderIsHero;
      case 'itSelfOrAdjacent': {
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self || !ctx.it) return false;
        return ctx.it.uid === self.uid || this.adjacent(self).some((m) => m.uid === ctx.it!.uid);
      }
      case 'itAttackAtMost': {
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        return !!m && this.atkOf(m) <= c.n;
      }
      case 'itHasOverload':
        return !!ctx.itCardId && !!getCard(ctx.itCardId).overload;
      case 'itPlayedLastTurn':
        return ctx.itSummonedTurn === this.s.turn - 1;
      case 'controlLocation':
        return !!p.locations?.some((l) => getCard(l.cardId).nameEn.includes(c.nameEn));
      case 'weaponNamed':
        return !!p.weapon && getCard(p.weapon.cardId).nameEn.includes(c.nameEn);
      case 'boardCount':
        return this.s.players[0].board.filter((m) => this.alive(m)).length + this.s.players[1].board.filter((m) => this.alive(m)).length === c.n;
      case 'armor':
        return p.hero.armor >= c.n;
      case 'bigSpellThisTurn':
        return p.bigSpellTurn === this.s.turn;
      case 'spellsThisTurn':
        return c.atLeast ? (p.spellsThisTurn ?? 0) >= c.n : (p.spellsThisTurn ?? 0) === c.n;
      case 'overloaded':
        return p.overloadLocked > 0 || p.overloadOwed > 0;
      case 'questActive':
        return !!p.quest;
      case 'questPlayed':
        return !!p.questPlayed;
      case 'rightmost':
        return !!ctx.rightmost;
      case 'eventAmount':
        return ctx.eventAmount >= c.n;
      case 'healedThisGame':
        return (p.healedTotal ?? 0) >= c.n;
      case 'heroPowerDamage':
        return (p.heroPowerDamage ?? 0) >= c.n;
      case 'itNameIncludes':
        return !!ctx.itCardId && getCard(ctx.itCardId).nameEn.includes(c.s);
      case 'emptyEverything':
        return !p.deck.length && !p.hand.length && !p.board.some((m) => m.uid !== ctx.sourceUid && this.alive(m));
      case 'not':
        return !this.evalCond(c.cond, ctx, excludeHandUid);
    }
    return false;
  }

  private randomPool(pool: Pool, pid: PlayerId, classRestrict: boolean): CardDef[] {
    const own = this.s.players[pid].heroClass;
    let cards = poolCards(pool, own, this.s.players[opp(pid)].heroClass);
    if (classRestrict && !pool.cls && !pool.classes && !pool.anyClass) {
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
        if (e.spell && ctx.isSpell) {
          amt += this.spellDamage(ctx.controller);
          // 薩魯恩：火焰法術傷害
          if (ctx.sourceCardId && hasCard(ctx.sourceCardId) && getCard(ctx.sourceCardId).spellSchool === 'FIRE') amt += me.board.reduce((n, m) => n + (m.silenced ? 0 : (m.fireDmg ?? 0)), 0);
          if (this.doublesSpells(me)) amt *= 2;
        }
        // 陣亡英雄之靈：你的英雄能力額外造成 1 點傷害；發條木偶：加倍
        if (ctx.isHeroPower) {
          const bonus = me.powerDamageBonus?.turn === s.turn ? me.powerDamageBonus.amount : 0;
          amt = (amt + this.flagCount('heroPowerDamage', ctx.controller) + 2 * this.flagCount('heroPowerDamage2', ctx.controller) + bonus) * 2 ** this.flagCount('heroPowerDouble', ctx.controller);
        }
        const targets = this.resolve(e.target, ctx);
        const src = this.dmgSource(ctx);
        for (const t of targets) {
          const dealt = yield* this.damage(src, t, amt);
          if (ctx.isHeroPower) me.heroPowerDamage = (me.heroPowerDamage ?? 0) + dealt;
        }
        if (targets.length === 1 && e.target.t !== 'it') ctx.it = { kind: 'char', uid: targets[0] };
        break;
      }
      case 'splitDamage': {
        let n = this.amount(e.amount, ctx);
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
        let amt = this.amount(e.amount, ctx);
        if (ctx.isHeroPower) amt *= 2 ** this.flagCount('heroPowerDouble', ctx.controller);
        if (ctx.isSpell && this.doublesSpells(me)) amt *= 2;
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
            this.extraOnBuffHand(hc.card, atk, hp);
          }
          break;
        }
        for (const uid of this.resolve(e.target, ctx)) {
          const c = this.char(uid);
          if (!c) continue;
          if (atk > 0 || hp > 0 || e.keywords?.length) this.fx({ kind: 'buff', uid: c.uid, from: ctx.sourceUid ?? undefined, cardId: ctx.sourceCardId, player: ctx.controller });
          if (isHero(c)) {
            c.tempAtk += atk;
            continue;
          }
          if (e.temp) c.tempAtk += atk;
          else if (e.untilNextTurn && atk) (c.lingerAtk ??= []).push({ amount: atk, until: ctx.controller });
          else c.atkBuff += atk;
          c.maxHp += hp;
          c.hp += hp;
          // 達拉然勇士：獲得體質後，額外獲得 +1/+1
          const extra = !c.silenced ? getCard(c.cardId).extraOnBuff : undefined;
          if (extra && (atk > 0 || hp > 0)) {
            c.atkBuff += extra.atk;
            c.maxHp += extra.hp;
            c.hp += extra.hp;
          }
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
          // 威爾弗雷德‧菲斯巴恩：以英雄能力抽到的牌消耗為 (0)
          if (p === me && ctx.isHeroPower && this.flagOnBoard('heroPowerDrawsFree', me.id)) for (const hc of drawn) hc.costMod -= 99;
        }
        break;
      }
      case 'summon':
        // 卡德加：召喚的手下加倍
        for (let i = 0; i < e.count * (this.flagOnBoard('khadgar', ctx.controller) ? 2 : 1); i++) yield* this.doSummon(ctx, who(e.who).id, e.card);
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
        if (amt > 0) {
          this.reopenLocations(p, 'armor');
          yield* this.emit({ k: 'armorGained', player: p.id, amount: amt });
        }
        break;
      }
      case 'heroAttack':
        me.hero.tempAtk += e.amount;
        break;
      case 'equip':
        // 毒刃：英雄能力改為賦予它 +1 攻擊力
        if (ctx.isHeroPower && me.weapon && getCard(me.weapon.cardId).flags?.includes('heroPowerBuffsWeapon')) {
          me.weapon.atk += 1;
          break;
        }
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
        yield* this.noteDiscover(ctx.controller, opts, chosen);
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
          if (hc && m.parts) hc.parts = m.parts;
          if (hc && m.starship) hc.starship = m.starship;
          if (hc && e.costChange) hc.costMod += e.costChange;
          if (hc && owner.id === ctx.controller) ctx.it = { kind: 'hand', uid: hc.uid };
          this.recalcAuras();
          // 枯萎的先驅：從戰場回到手牌時，召喚兩個隨機的 2 費手下
          if (!m.silenced && getCard(m.cardId).flags?.includes('harbinger')) {
            for (let i = 0; i < 2; i++) {
              const c = pick(s, this.randomPool({ type: 'MINION', cost: 2, anyClass: true }, owner.id, false));
              if (c) yield* this.doSummon({ ...ctx, controller: owner.id }, owner.id, c.id);
            }
          }
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
            p.maxMana = Math.min(this.manaCap(p), p.maxMana + e.amount);
            break;
          case 'full':
            p.maxMana = Math.min(this.manaCap(p), p.maxMana + e.amount);
            p.mana = Math.min(this.manaCap(p), p.mana + e.amount);
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
          yield* this.discarded(me, c);
          if (this.over) return;
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
      case 'cthunBuff':
        this.cthunBuff(ctx.controller, e.atk, e.hp, !!e.taunt);
        break;
      case 'joust': {
        // 比武：雙方各揭露牌堆中一張隨機手下，你的消耗較高就贏
        const mine = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        const theirs = pick(s, foe.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        const won = !!mine && (!theirs || getCard(mine.cardId).cost > getCard(theirs.cardId).cost);
        const desc = (h: HandCard | undefined) => (h ? `${this.name(h.cardId)}（${getCard(h.cardId).cost} 費）` : '（沒有手下）');
        this.log(me.id, `比武：${desc(mine)} 對上 ${desc(theirs)}，${won ? '獲勝！' : '落敗'}`);
        ctx.revealed = mine?.uid;
        if (won) yield* this.runEffects(e.then, ctx);
        else if (e.else) yield* this.runEffects(e.else, ctx);
        break;
      }
      case 'summonJade': {
        // 翠玉魔像：第 n 個是 n/n（最多 30/30）
        me.jade = (me.jade ?? 0) + 1;
        const n = Math.min(30, me.jade);
        const m = yield* this.doSummon(ctx, ctx.controller, JADE_GOLEM);
        if (m) {
          m.baseAtk = n;
          m.baseHp = n;
          m.maxHp = n + m.auraHp;
          m.hp = m.maxHp;
        }
        break;
      }
      case 'recruit':
        for (let i = 0; i < e.count; i++) {
          if (me.board.length >= MAX_BOARD) break;
          const list = me.deck.filter((h) => {
            const d = getCard(h.cardId);
            if (d.type !== 'MINION') return false;
            if (e.race && !(d.races?.includes(e.race) || d.races?.includes('ALL'))) return false;
            if (e.cost !== undefined && d.cost !== e.cost) return false;
            if (e.maxCost !== undefined && d.cost > e.maxCost) return false;
            return true;
          });
          const hc = pick(s, list);
          if (!hc) break;
          me.deck.splice(me.deck.indexOf(hc), 1);
          this.log(me.id, `號召了${this.name(hc.cardId)}`);
          yield* this.doSummon(ctx, ctx.controller, hc.cardId);
        }
        break;
      case 'spendCorpses':
        if (this.spendCorpses(me, e.amount)) yield* this.runEffects(e.then, ctx);
        else if (e.else) yield* this.runEffects(e.else, ctx);
        break;
      case 'gainCorpses':
        this.gainCorpses(me, e.amount);
        break;
      case 'spendCorpsesUpTo': {
        const n = Math.min(e.max, me.corpses ?? 0);
        if (n > 0) this.spendCorpses(me, n);
        if (e.each) for (let i = 0; i < n; i++) yield* this.runEffects(e.each, ctx);
        if (e.custom) yield* this.custom(e.custom, { n }, ctx);
        break;
      }
      case 'raiseCorpses': {
        const n = Math.min(e.max, me.corpses ?? 0, MAX_BOARD - me.board.length);
        if (n <= 0) break;
        this.spendCorpses(me, n);
        this.log(me.id, `喚起了 ${n} 具屍體`);
        for (let i = 0; i < n; i++) yield* this.doSummon(ctx, ctx.controller, e.card);
        break;
      }
      case 'launchDiscount':
        me.launchDiscount = (me.launchDiscount ?? 0) + e.amount;
        break;
      case 'launchStarship':
        yield* this.launch(ctx.controller, true);
        break;
      case 'delayed':
        (me.delayed ??= []).push({ turns: e.turns, effects: e.effects, sourceCardId: ctx.sourceCardId });
        break;
      case 'shuffle': {
        const target = who(e.who ?? 'self');
        const count = e.count * 2 ** this.flagCount('shuffleExtra', me.id);
        for (let i = 0; i < count; i++) target.deck.splice(randomInt(s, target.deck.length + 1), 0, this.newHandCard(e.card));
        if (target === me) this.shuffled(me, count);
        if (target !== me && /Plague$/.test(getCard(e.card).nameEn)) me.plaguesShuffled = (me.plaguesShuffled ?? 0) + e.count;
        break;
      }
      case 'shuffleCopy':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m) continue;
          for (let i = 0; i < e.count * 2 ** this.flagCount('shuffleExtra', me.id); i++) me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(m.cardId));
          this.shuffled(me, 1);
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
          this.extraOnBuffHand(h, e.atk, e.hp);
        }
        break;
      }
      case 'evolve':
        for (const uid of this.resolve(e.target, ctx)) {
          const m = this.minion(uid);
          if (!m) continue;
          const want = getCard(m.cardId).cost + e.amount;
          const pool = this.randomPool({ type: 'MINION', cost: want }, ctx.controller, false);
          const c = pick(s, pool);
          if (c) this.transform(uid, c.id);
        }
        break;
      case 'grant':
        me.grants.push({ keyword: e.keyword, race: e.race });
        break;
      case 'nextCardDiscount':
        me.nextCardDiscount += e.amount;
        break;
      case 'minionTax': {
        // 對手的下個回合（回合數 +1）
        const tax = foe.minionTax;
        foe.minionTax = { amount: (tax?.turn === s.turn + 1 ? tax.amount : 0) + e.amount, turn: s.turn + 1 };
        break;
      }
      case 'nextSpellDiscount':
        me.nextSpellDiscount = { amount: (me.nextSpellDiscount?.turn === s.turn ? me.nextSpellDiscount.amount : 0) + e.amount, turn: s.turn };
        break;
      case 'eternal':
        (me.eternal ??= []).push({ ability: e.ability, sourceCardId: ctx.sourceCardId });
        break;
      case 'heroMaxHealth':
        me.hero.maxHp += e.amount;
        me.hero.hp += e.amount;
        me.heroHealthChangedTurn = s.turn;
        this.fx({ kind: 'heal', uid: me.hero.uid, amount: e.amount });
        yield* this.emit({ k: 'healed', player: me.id, subject: me.hero.uid, amount: e.amount, isHero: true });
        break;
      case 'refreshHeroPower':
        me.heroPower.used = false;
        me.heroPower.uses = 0;
        break;
      case 'minionAtkBonus':
        me.minionAtkBonus = (me.minionAtkBonus ?? 0) + e.amount;
        break;
      case 'nextCardCostsCorpses':
        me.nextCardCorpsesTurn = s.turn;
        break;
      case 'pendingDiscount': {
        const { thisTurn, ...d } = e.d;
        (me.pendingDiscounts ??= []).push({ ...d, turn: thisTurn ? s.turn : undefined });
        break;
      }
      case 'spellTax': {
        const tax = foe.spellTax;
        foe.spellTax = { amount: (tax?.turn === s.turn + 1 ? tax.amount : 0) + e.amount, turn: s.turn + 1 };
        break;
      }
      case 'heroPowerTax': {
        const tax = foe.powerTax;
        foe.powerTax = { amount: (tax?.turn === s.turn + 1 ? tax.amount : 0) + e.amount, turn: s.turn + 1 };
        break;
      }
      case 'heroPowerDiscount':
        me.powerDiscount = (me.powerDiscount ?? 0) + e.amount;
        break;
      case 'replaceHeroPower':
        this.setHeroPower(me, e.power);
        break;
      case 'atEndOfTurn':
        (me.endOfTurnEffects ??= []).push({ effects: e.effects, sourceCardId: ctx.sourceCardId });
        break;
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

  /** 套用一種演化 */
  private applyAdaptation(m: Minion, id: string) {
    const kw = (k: Keyword) => {
      if (!m.keywords.includes(k)) m.keywords.push(k);
    };
    switch (id) {
      case 'UNG_999t2':
        m.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'summon', card: 'UNG_999t2t1', count: 2, who: 'self' }] });
        break;
      case 'UNG_999t3':
        m.atkBuff += 3;
        break;
      case 'UNG_999t4':
        m.maxHp += 3;
        m.hp += 3;
        break;
      case 'UNG_999t5':
        kw('ELUSIVE');
        break;
      case 'UNG_999t6':
        kw('TAUNT');
        break;
      case 'UNG_999t7':
        kw('WINDFURY');
        break;
      case 'UNG_999t8':
        kw('DIVINE_SHIELD');
        break;
      case 'UNG_999t10':
        m.nextTurnKeywords.push('STEALTH');
        break;
      case 'UNG_999t13':
        kw('POISONOUS');
        break;
      case 'UNG_999t14':
        m.atkBuff += 1;
        m.maxHp += 1;
        m.hp += 1;
        break;
    }
    this.log(m.owner, `${this.name(m.cardId)}演化了：${this.name(id)}`);
  }

  /** 讓手下攻擊另一個角色（強制攻擊，不消耗攻擊次數） */
  private *forceAttack(a: Minion, t: Char): Gen {
    if (!this.alive(a) || !this.alive(t)) return;
    const attacks = a.attacks;
    yield* this.doAttack(a.uid, t.uid);
    a.attacks = attacks;
  }

  /** 對指定目標施放一張法術（西風巨靈、贊提莫、沃雷司） */
  private *castAt(pid: PlayerId, cardId: string, target: number): Gen {
    const def = getCard(cardId);
    if (def.type !== 'SPELL' || def.secret) return;
    const abilities = def.chooseOne ? (def.chooseOne.find((o) => o.target) ?? def.chooseOne[0]).abilities : (def.abilities ?? []);
    const ctx: Ctx = { ...this.baseCtx(pid), sourceCardId: cardId, isSpell: true, chosen: target, lifesteal: !!def.keywords?.includes('LIFESTEAL') };
    for (const ab of abilities) {
      if (ab.on.k !== 'play' || (ab.cond && !this.evalCond(ab.cond, ctx))) continue;
      yield* this.runEffects(ab.effects, ctx);
      if (this.over) return;
    }
  }

  /** 把手下的攻擊力與生命值設為固定值 */
  private setStats(m: Minion, atk: number, hp: number) {
    m.baseAtk = atk;
    m.atkBuff = 0;
    m.tempAtk = 0;
    m.baseHp = hp;
    m.maxHp = hp + m.auraHp;
    m.hp = m.maxHp;
  }

  /** 以隨機目標打出一張卡（泰絲、哮斗龍、尤格薩倫的解謎箱等）：法術施放、手下召喚、武器裝備 */
  private *replay(pid: PlayerId, cardId: string): Gen {
    const def = getCard(cardId);
    if (def.type === 'SPELL') yield* this.castRandomly(pid, cardId);
    else if (def.type === 'MINION') yield* this.summon(pid, cardId);
    else if (def.type === 'WEAPON') yield* this.equip(pid, cardId);
  }

  /** 以此手下為來源，隨機選擇目標再觸發一張卡的戰吼（哮斗龍） */
  private *repeatBattlecry(pid: PlayerId, sourceUid: number, cardId: string): Gen {
    const def = getCard(cardId);
    const abilities = (def.chooseOne ? pick(this.s, def.chooseOne)?.abilities : def.abilities) ?? [];
    const req = def.chooseOne ? undefined : def.target;
    const ctx: Ctx = { ...this.baseCtx(pid), sourceUid, sourceCardId: cardId };
    if (req) {
      const valid = this.validTargets(req, pid, false, sourceUid);
      ctx.chosen = pick(this.s, valid) ?? null;
    }
    for (const ab of abilities) {
      if (ab.on.k !== 'play' || (ab.cond && !this.evalCond(ab.cond, ctx))) continue;
      yield* this.runEffects(ab.effects, ctx);
      if (this.over) return;
    }
  }

  /** 從牌堆頂移除卡牌 */
  private mill(p: PlayerState, n: number): HandCard[] {
    const out = p.deck.splice(Math.max(0, p.deck.length - n), n).reverse();
    if (out.length) this.log(p.id, `${p.name}的牌堆移除了 ${out.length} 張牌`);
    return out;
  }

  /** 手牌已滿被燒掉 / 從牌堆被移除：只觸發它的「棄掉時」能力（例如煉獄火小鬼） */
  private *burned(p: PlayerState, hc: HandCard): Gen {
    const def = this.handDef(hc);
    for (const ab of def.abilities ?? []) {
      if (ab.on.k !== 'discarded') continue;
      yield* this.runEffects(ab.effects, { ...this.baseCtx(p.id), sourceCardId: def.id, isSpell: def.type === 'SPELL', drawnCard: hc });
      if (this.over) return;
    }
  }

  /** 棄掉一張牌：觸發它的「棄掉時」能力，再通知場上（例如小小邪惡騎士） */
  private *discarded(p: PlayerState, hc: HandCard): Gen {
    const def = this.handDef(hc);
    p.discardedCount = (p.discardedCount ?? 0) + 1;
    (p.discardedCards ??= []).push(hc.cardId);
    this.questProgress(p, 'discard');
    for (const ab of def.abilities ?? []) {
      if (ab.on.k !== 'discarded') continue;
      const ctx: Ctx = { ...this.baseCtx(p.id), sourceCardId: def.id, isSpell: def.type === 'SPELL', drawnCard: hc };
      yield* this.runEffects(ab.effects, ctx);
      if (this.over) return;
    }
    yield* this.emit({ k: 'discard', player: p.id, cardId: hc.cardId });
  }

  private copyStats(src: Minion, m: Minion) {
    m.parts = src.parts;
    m.starship = src.starship;
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
    m.lingerAtk = undefined;
    const def = this.minionDef(m);
    m.baseAtk = def.attack ?? 0;
    m.baseHp = def.health ?? 1;
    m.maxHp = m.baseHp + m.auraHp;
    m.hp = Math.min(m.hp, m.maxHp);
    this.recalcAuras();
  }

  private transform(uid: number, cardId: string) {
    const old = this.minion(uid);
    if (!old) return;
    // 笨拙的小精靈：變形為手下時，改為變成消耗多 (2) 的手下
    if (!old.silenced && getCard(old.cardId).flags?.includes('podling') && getCard(cardId).type === 'MINION') {
      const c = pick(this.s, this.randomPool({ type: 'MINION', cost: Math.min(10, getCard(cardId).cost + 2), anyClass: true }, old.owner, false));
      if (c) cardId = c.id;
    }
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
        if (id && (args.cards as string[]).includes('NEW1_032')) yield* this.summonCompanion(ctx, id);
        else if (id) yield* this.doSummon(ctx, ctx.controller, id);
        break;
      }
      case 'addOneOf': {
        const id = pick(s, (args.cards as string[]).filter((x) => hasCard(x)));
        if (id) this.addToHand(args.who === 'opponent' ? foe : me, id);
        break;
      }
      // ------------------------------------------------------------ 死亡騎士
      case 'corpseExplosion': {
        // 屍爆術：引爆一具屍體對所有手下造成傷害；若還有手下存活就重複
        const n = 1 + (ctx.isSpell ? this.spellDamage(ctx.controller) : 0);
        const src = this.dmgSource(ctx);
        for (let loop = 0; loop < 30 && this.spendCorpses(me, 1); loop++) {
          for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c))) yield* this.damage(src, m.uid, n);
          yield* this.processDeaths();
          if (this.over || !this.chars().some((c) => !isHero(c) && this.alive(c))) break;
        }
        break;
      }
      case 'corpseFarm': {
        // 屍體農場：召喚一個消耗等同花費屍體數的隨機手下
        const n = args.n as number;
        const id = n > 0 ? pick(s, this.randomPool({ type: 'MINION', cost: n }, ctx.controller, false))?.id : undefined;
        if (id) yield* this.doSummon(ctx, ctx.controller, id);
        break;
      }
      case 'marrowgar': {
        // 骨煞領主馬洛加：每具屍體一個 1/1 魔像，放不下的每具給其中一個 +2/+2
        const n = args.n as number;
        const golems: Minion[] = [];
        let extra = 0;
        for (let i = 0; i < n; i++) {
          const m = me.board.length < MAX_BOARD ? yield* this.doSummon(ctx, ctx.controller, 'RLK_085t') : null;
          if (m) golems.push(m);
          else extra++;
        }
        for (let i = 0; i < extra && golems.length; i++) {
          const g = pick(s, golems)!;
          g.atkBuff += 2;
          g.maxHp += 2;
          g.hp += 2;
        }
        break;
      }
      case 'corpseBride': {
        // 屍體新娘：召喚一個攻擊力與生命值等同花費屍體數的嘲諷新郎
        const n = args.n as number;
        if (n <= 0) break;
        const m = yield* this.doSummon(ctx, ctx.controller, 'RLK_506t');
        if (m) {
          m.baseAtk = n;
          m.baseHp = n;
          m.maxHp = n + m.auraHp;
          m.hp = m.maxHp;
        }
        break;
      }
      // ------------------------------------------------------------ 死亡騎士（第二批）
      case 'chowDown': {
        // 狼吞虎嚥：召喚五個 5/4 飛龍；消耗 8 具屍體讓它們獲得突襲
        const drakes: Minion[] = [];
        for (let i = 0; i < 5; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'CATA_465t');
          if (m) drakes.push(m);
        }
        if (drakes.length && this.spendCorpses(me, 8)) for (const m of drakes) m.keywords.push('RUSH');
        break;
      }
      case 'consumption': {
        // 吞噬：對兩個隨機敵方手下造成 3 點傷害，每死一個抽一張牌
        const n = 3 + this.spellDamage(me.id);
        const src = this.dmgSource(ctx);
        const targets = shuffle(s, foe.board.filter((m) => this.alive(m))).slice(0, 2);
        for (const t of targets) yield* this.damage(src, t.uid, n);
        const died = targets.filter((t) => t.hp <= 0 || t.dead).length;
        yield* this.processDeaths();
        if (died) yield* this.draw(me, died);
        break;
      }
      case 'soulstealer': {
        // 竊魂者：消滅其他所有手下，每消滅一個敵方手下獲得 1 具屍體
        let enemies = 0;
        for (const m of [...me.board, ...foe.board]) {
          if (m.uid === ctx.sourceUid || !this.alive(m)) continue;
          m.dead = true;
          if (m.owner !== me.id) enemies++;
        }
        this.gainCorpses(me, enemies);
        break;
      }
      case 'destroyHighestAttack': {
        // 窒息術：消滅攻擊力最高的敵方手下
        const list = foe.board.filter((m) => this.alive(m));
        const top = Math.max(-1, ...list.map((m) => this.atkOf(m)));
        const m = pick(s, list.filter((x) => this.atkOf(x) === top));
        if (m) m.dead = true;
        break;
      }
      case 'fillBoardRandom': {
        // 天譴軍團：用隨機不死族填滿你的場面
        const pool = this.randomPool({ type: 'MINION', race: args.race as Race }, me.id, false);
        for (let i = 0; i < MAX_BOARD && me.board.length < MAX_BOARD; i++) {
          const c = pick(s, pool);
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      }
      case 'afterHeroKill': {
        // 破魂者：英雄攻擊並消滅手下後獲得屍體
        if (this.lastAttack?.killed) this.gainCorpses(me, args.corpses as number);
        break;
      }
      case 'afterHeroHitMinion': {
        // 碎骨者：英雄攻擊手下後，對敵方英雄造成傷害
        if (this.lastAttack && !this.lastAttack.defenderIsHero) yield* this.damage(this.dmgSource(ctx), foe.hero.uid, args.amount as number);
        break;
      }
      case 'frostmourne': {
        // 霜之哀傷：召喚所有被這把武器消滅的手下
        for (const id of ctx.weapon?.killed ?? []) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'emergencySurgery': {
        // 緊急手術：召喚四個 3/1 生命竊取的不死族，攻擊所選的敵方手下
        const target = ctx.chosen;
        for (let i = 0; i < 4; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'JAIL_454t');
          const t = target !== null ? this.char(target) : null;
          if (!m || !t || !this.alive(t)) continue;
          yield* this.doAttack(m.uid, t.uid);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'triggerDeathrattle': {
        // 嚎叫約德爾歌手：觸發一個友方手下的亡語（兩次）
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m || m.silenced) break;
        for (let i = 0; i < ((args.times as number) ?? 1); i++) yield* this.runDeathrattles(m);
        break;
      }
      case 'deadAir': {
        // 死亡斷訊：消滅你的不死族，再重新召喚它們
        const undead = me.board.filter((m) => this.alive(m) && this.isRace(m.cardId, 'UNDEAD'));
        for (const m of undead) m.dead = true;
        yield* this.processDeaths();
        if (this.over) return;
        for (const m of undead) yield* this.doSummon(ctx, me.id, m.cardId);
        break;
      }
      case 'patchwerk': {
        // 縫補者：消滅對手手牌、牌堆、戰場上各一個隨機手下
        const isMinion = (h: HandCard) => getCard(h.cardId).type === 'MINION';
        const inHand = pick(s, foe.hand.filter(isMinion));
        if (inHand) foe.hand = foe.hand.filter((h) => h !== inHand);
        const inDeck = pick(s, foe.deck.filter(isMinion));
        if (inDeck) foe.deck = foe.deck.filter((h) => h !== inDeck);
        const onBoard = pick(s, foe.board.filter((m) => this.alive(m)));
        if (onBoard) onBoard.dead = true;
        this.log(me.id, `縫補者消滅了對手${[inHand, inDeck].filter(Boolean).map((h) => this.name(h!.cardId)).join('、') || '的手下'}`);
        break;
      }
      case 'returnCostsHealth': {
        // 死亡使者薩魯法爾：回到手牌，改為消耗生命值
        const hc = this.addToHand(me, ctx.sourceCardId);
        if (hc) hc.healthCostUntil = 1e9;
        break;
      }
      case 'frigidara': {
        // 監督者弗力吉達拉：抽兩張法術，若都是冰霜法術，對全部敵人造成 2 點傷害
        const drawn = yield* this.draw(me, 2, { type: 'SPELL' });
        if (drawn.length === 2 && drawn.every((h) => getCard(h.cardId).spellSchool === 'FROST')) {
          const src = this.dmgSource(ctx);
          for (const c of [foe.hero, ...foe.board]) if (this.alive(c)) yield* this.damage(src, c.uid, 2);
        }
        break;
      }
      case 'discountRandomSpell': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'SPELL'));
        if (hc) hc.costMod -= (args.amount as number) ?? 1;
        break;
      }
      case 'debuff': {
        // 屈辱之盔：-5/-5
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const a = args.atk as number;
        const h = args.hp as number;
        m.atkBuff -= a;
        m.maxHp = Math.max(0, m.maxHp - h);
        m.hp = Math.min(m.hp, m.maxHp);
        if (m.maxHp <= 0 || m.hp <= 0) m.dead = true;
        break;
      }
      case 'attackPerSpellSchool': {
        // 依米亞破霜者：手中每有一張冰霜法術 +1 攻擊力
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const n = me.hand.filter((h) => getCard(h.cardId).spellSchool === args.school).length;
        if (m && n) m.atkBuff += n;
        break;
      }
      case 'meatGrinder': {
        // 絞肉機：絞碎牌堆中一個隨機手下，獲得 4 具屍體
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        this.gainCorpses(me, 4);
        this.log(me.id, `絞碎了牌堆中的${this.name(hc.cardId)}`);
        break;
      }
      case 'plagueTick': {
        // 沸血術的感染：受到傷害，施放者的英雄回復等量生命值
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!m || !this.alive(m)) break;
        yield* this.damage({ owner: foe.id, uid: null, lifesteal: true }, m.uid, args.amount as number);
        break;
      }
      case 'giveAttackEqualSelf': {
        // 惡毒血蟲 / 恐怖夢魘：手牌（或戰場）中一個手下獲得等同此手下的攻擊力
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const n = self ? this.atkOf(self) : 0;
        if (!n) break;
        const hand = me.hand.filter((h) => getCard(h.cardId).type === 'MINION');
        const board = args.board ? me.board.filter((m) => m !== self && this.alive(m)) : [];
        const i = randomInt(s, hand.length + board.length);
        if (i < hand.length) hand[i].atkBuff += n;
        else if (board.length) board[i - hand.length].atkBuff += n;
        break;
      }
      case 'copySpellSchoolInHand': {
        // 亡語女士：複製你手中所有的冰霜法術
        for (const h of me.hand.filter((x) => getCard(x.cardId).spellSchool === args.school)) this.addToHand(me, h.cardId);
        break;
      }
      case 'attackLowestEnemy': {
        // 地精嚼食者：攻擊生命值最低的敵人
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!m || !this.alive(m)) break;
        const enemies = [foe.hero, ...foe.board].filter((c) => this.alive(c));
        const low = Math.min(...enemies.map((c) => c.hp));
        const t = pick(s, enemies.filter((c) => c.hp === low));
        if (t) {
          yield* this.doAttack(m.uid, t.uid);
          m.attacks = Math.max(0, m.attacks - 1);
        }
        break;
      }
      case 'unholyFrenzy': {
        // 穢邪狂亂：你的手下攻擊所選的敵方手下，死掉的再召喚回來
        const t = ctx.chosen;
        const died: string[] = [];
        for (const m of [...me.board]) {
          const target = t !== null ? this.char(t) : null;
          if (!target || !this.alive(target) || !this.alive(m)) continue;
          yield* this.doAttack(m.uid, target.uid);
          m.attacks = Math.max(0, m.attacks - 1);
          if (!this.alive(m)) died.push(m.cardId);
        }
        yield* this.processDeaths();
        if (this.over) return;
        for (const id of died) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'fillHandHealthCost': {
        // 被遺忘的千年：用隨機不死族填滿手牌，本回合消耗生命值
        const pool = this.randomPool({ type: 'MINION', race: 'UNDEAD' }, me.id, false);
        while (me.hand.length < MAX_HAND) {
          const c = pick(s, pool);
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (hc) hc.healthCostUntil = s.turn;
        }
        break;
      }
      case 'summonBestFromGraveyard': {
        // 回憶顯化：召喚本場對戰中死亡、消耗最高的友方不死族
        const list = me.graveyard.filter((id) => this.isRace(id, 'UNDEAD'));
        const top = Math.max(-1, ...list.map((id) => getCard(id).cost));
        const id = pick(s, list.filter((x) => getCard(x).cost === top));
        if (id) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'paleomancy': {
        // 古生物死靈術：發現一個不死族；消耗 5 具屍體改為三張都拿
        const opts = this.discoverOptions({ type: 'MINION', race: 'UNDEAD' }, me.id);
        if (!opts.length) break;
        if (this.spendCorpses(me, 5)) {
          for (const id of opts) this.addToHand(me, id);
          break;
        }
        const id = yield* this.choose(ctx, opts, '發現一個不死族');
        this.addToHand(me, id);
        break;
      }
      case 'freezeOrShatter': {
        // 霜凍掠劫者：冰凍 3 個隨機敵人，已經被冰凍的改為受到 5 點傷害
        const src = this.dmgSource(ctx);
        const list = shuffle(s, [foe.hero, ...foe.board].filter((c) => this.alive(c))).slice(0, 3);
        for (const c of list) {
          if (c.frozen) yield* this.damage(src, c.uid, 5);
          else this.freeze(c);
        }
        break;
      }
      case 'returnAtEndOfTurn':
        (me.endOfTurnCards ??= []).push(ctx.sourceCardId);
        break;
      case 'summonAndAttackRandom': {
        // 食屍鬼之夜：召喚五個 1/1 食屍鬼，各自攻擊隨機敵人
        for (let i = 0; i < (args.count as number); i++) {
          const m = yield* this.doSummon(ctx, me.id, args.card as string);
          const t = pick(s, [foe.hero, ...foe.board].filter((c) => this.alive(c)));
          if (!m || !t) continue;
          yield* this.doAttack(m.uid, t.uid);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'discoverFromDeck': {
        // 靈魂搜尋 / 北境導覽：從你的牌堆發現一張卡
        const type = args.type as CardType | undefined;
        const cards = me.deck.filter((h) => !type || getCard(h.cardId).type === type);
        const opts: HandCard[] = [];
        for (const h of shuffle(s, [...cards])) {
          if (opts.length >= 3) break;
          if (!opts.some((o) => getCard(o.cardId).name === getCard(h.cardId).name)) opts.push(h);
        }
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts.map((h) => h.cardId), '從你的牌堆發現一張卡');
        const hc = opts.find((h) => h.cardId === id)!;
        if (args.copy) {
          this.addToHand(me, id);
          break;
        }
        me.deck = me.deck.filter((h) => h !== hc);
        if (me.hand.length < MAX_HAND) me.hand.push(hc);
        if (args.copyCorpses && this.spendCorpses(me, args.copyCorpses as number)) this.addToHand(me, id);
        if (args.frostFreeze && getCard(id).spellSchool === 'FROST') {
          const m = pick(s, foe.board.filter((x) => this.alive(x)));
          if (m) this.freeze(m);
        }
        break;
      }
      case 'spreadDeathrattle': {
        // 死亡咆哮：把一個手下的亡語擴散到相鄰的手下
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m || m.silenced) break;
        const drs = m.abilities.filter((a) => a.on.k === 'deathrattle');
        for (const n of this.adjacent(m)) n.abilities.push(...structuredClone(drs));
        break;
      }
      case 'boneshredder': {
        // 骸骨速彈手：消耗 5 具屍體，觸發並獲得一個本場死亡的友方手下的亡語
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const list = me.graveyard.filter((id) => getCard(id).abilities?.some((a) => a.on.k === 'deathrattle'));
        if (!self || !list.length || !this.spendCorpses(me, 5)) break;
        const id = pick(s, list)!;
        const drs = structuredClone((getCard(id).abilities ?? []).filter((a) => a.on.k === 'deathrattle'));
        self.abilities.push(...drs);
        this.log(me.id, `獲得了${this.name(id)}的亡語`);
        yield* this.runDeathrattles(self, drs);
        break;
      }
      case 'refreshManaByAttack': {
        // 炫彩育母：攻擊時回復等同攻擊力的法力水晶
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (m) me.mana = Math.min(me.maxMana, me.mana + this.atkOf(m));
        break;
      }
      case 'ursoc': {
        // 厄索克：攻擊其他所有手下，記住消滅的手下
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self) break;
        const src = this.charSource(self);
        for (const m of [...foe.board, ...me.board]) {
          if (m === self || !this.alive(m) || !this.alive(self)) continue;
          this.fx({ kind: 'attack', uid: self.uid, target: m.uid, player: me.id });
          yield* this.damage(src, m.uid, this.atkOf(self));
          const back = this.atkOf(m);
          if (back > 0) yield* this.damage(this.charSource(m), self.uid, back);
          if (!this.alive(m)) (self.killed ??= []).push(m.cardId);
        }
        break;
      }
      case 'resurrectKilled': {
        for (const id of ctx.sourceSnapshot?.killed ?? []) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'airlockBreach': {
        // 氣閘破口：召喚 5/5 嘲諷不死族，英雄 +5 生命值；消耗 5 具屍體再來一次
        for (let i = 0; i < 2; i++) {
          if (i === 1 && !this.spendCorpses(me, 5)) break;
          yield* this.doSummon(ctx, me.id, 'GDB_113t');
          yield* this.runEffect({ e: 'heroMaxHealth', amount: 5 }, ctx);
        }
        break;
      }
      case 'resurrectDeathrattle': {
        // 靈魂喚醒者：復活另一個友方亡語手下
        const selfName = getCard(ctx.sourceCardId).nameEn;
        const list = me.graveyard.filter((id) => getCard(id).nameEn !== selfName && getCard(id).abilities?.some((a) => a.on.k === 'deathrattle'));
        const id = pick(s, list);
        if (id) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'eightHands': {
        // 來自異界的8隻手：雙方的牌堆只留下消耗最高的 8 張
        for (const pl of s.players) {
          const sorted = shuffle(s, [...pl.deck]).sort((a, b) => getCard(b.cardId).cost - getCard(a.cardId).cost);
          const keep = new Set(sorted.slice(0, 8));
          pl.deck = pl.deck.filter((h) => keep.has(h));
        }
        break;
      }
      case 'discoverSummon': {
        // 同化疫病 / 昂布拉的故事：發現一個手下並直接召喚
        const minCost = (args.minCost as number) ?? 0;
        const pool = this.randomPool({ type: 'MINION', hasDeathrattle: !args.any, cost: args.cost as number | undefined }, me.id, false).filter((c) => c.cost >= minCost);
        const opts = this.discoverOptions(undefined, me.id, pool);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個手下');
        const m = yield* this.doSummon(ctx, me.id, id);
        if (!m) break;
        if (args.reborn && !m.keywords.includes('REBORN')) m.keywords.push('REBORN');
        for (const k of (args.keywords as Keyword[]) ?? []) if (!m.keywords.includes(k)) m.keywords.push(k);
        if (args.hp) {
          m.maxHp += args.hp as number;
          m.hp += args.hp as number;
        }
        if (args.trigger) yield* this.runDeathrattles(m);
        break;
      }
      case 'giftOf': {
        // 阿薩斯的禮物：發現其中一張暫時的卡
        const opts = (args.cards as string[]).filter((id) => hasCard(id));
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張卡牌');
        const hc = this.addToHand(me, id);
        if (hc) hc.temporary = true;
        break;
      }
      case 'summonSoulFromEvent': {
        // 尖嘯女妖：召喚攻擊力與生命值等同回復量的靈魂
        const n = ctx.eventAmount;
        if (n <= 0) break;
        const m = yield* this.doSummon(ctx, me.id, args.card as string);
        if (m) {
          m.baseAtk = n;
          m.baseHp = n;
          m.maxHp = n + m.auraHp;
          m.hp = m.maxHp;
        }
        break;
      }
      case 'shufflePlagues': {
        // 將隨機瘟疫洗入對手的牌堆
        for (let i = 0; i < (args.count as number); i++) {
          const id = pick(s, PLAGUES)!;
          foe.deck.splice(randomInt(s, foe.deck.length + 1), 0, this.newHandCard(id));
          me.plaguesShuffled = (me.plaguesShuffled ?? 0) + 1;
        }
        break;
      }
      case 'destroyPlague': {
        // 叛墓者：消滅對手牌堆中的一張瘟疫，對全部敵方手下造成 3 點傷害
        const plague = pick(s, foe.deck.filter((h) => PLAGUES.includes(h.cardId)));
        if (!plague) break;
        foe.deck = foe.deck.filter((h) => h !== plague);
        const src = this.dmgSource(ctx);
        for (const m of foe.board) if (this.alive(m)) yield* this.damage(src, m.uid, 3);
        break;
      }
      case 'spendCorpsesForStats': {
        // 弗柯羅斯：花費 10 / 20 / 30 具屍體獲得等量的屬性值（自動選能付得起的最大值）
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self) break;
        const n = [30, 20, 10].find((x) => (me.corpses ?? 0) >= x);
        if (!n || !this.spendCorpses(me, n)) break;
        self.atkBuff += n;
        self.maxHp += n;
        self.hp += n;
        break;
      }
      case 'yseraAwakens': {
        // 伊瑟拉之覺醒：對伊瑟拉以外的所有角色造成傷害
        const n = (args.amount as number) + (ctx.isSpell ? this.spellDamage(ctx.controller) : 0);
        const src = this.dmgSource(ctx);
        for (const c of this.chars()) {
          if (!this.alive(c) || (!isHero(c) && getCard(c.cardId).nameEn.startsWith('Ysera'))) continue;
          yield* this.damage(src, c.uid, n);
        }
        break;
      }
      case 'nightmare': {
        // 夢魘：+5/+5，並在施放者的下個回合開始時消滅它
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        yield* this.runEffect({ e: 'buff', target: { t: 'chosen' }, atk: 5, hp: 5 }, ctx);
        m.abilities.push({ on: { k: 'turnStart', whose: m.owner === ctx.controller ? 'mine' : 'opp' }, effects: [{ e: 'destroy', target: { t: 'self' } }] });
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
      // ------------------------------------------------------------ 比武 / 滅殺 / 號召 / 翠玉
      case 'drawRevealed': {
        // 抽出比武揭露的那張牌
        const hc = me.deck.find((h) => h.uid === ctx.revealed);
        if (!hc) break;
        me.deck.splice(me.deck.indexOf(hc), 1);
        if (me.hand.length >= MAX_HAND) {
          this.fx({ kind: 'burn', cardId: hc.cardId, player: me.id });
          break;
        }
        me.hand.push(hc);
        me.drawnThisTurn++;
        break;
      }
      case 'attackAgain':
        // 蘇薩斯：你可以再攻擊一次
        me.hero.attacks = Math.max(0, me.hero.attacks - 1);
        break;
      case 'summonFromHand': {
        // 從手牌召喚一個（某種族的）手下；who = opponent 時由對手召喚，all = 全部召喚
        const race = args.race as Race | undefined;
        const p = args.who === 'opponent' ? foe : me;
        for (let n = 0; n < (args.all ? MAX_HAND : ((args.count as number) ?? 1)); n++) {
          const hc = pick(
            s,
            p.hand.filter((h) => {
              const d = this.handDef(h);
              if (args.deathrattle && !d.abilities?.some((a) => a.on.k === 'deathrattle')) return false;
              if (args.maxCost !== undefined && d.cost > (args.maxCost as number)) return false;
              if (args.minAtk !== undefined && (d.attack ?? 0) < (args.minAtk as number)) return false;
              if (args.notStarting && h.starting) return false;
              if (args.lowest && d.cost > Math.min(...p.hand.filter((x) => this.handDef(x).type === 'MINION').map((x) => this.handDef(x).cost))) return false;
              return d.type === 'MINION' && (!race || !!d.races?.includes(race) || !!d.races?.includes('ALL'));
            }),
          );
          if (!hc || p.board.length >= MAX_BOARD || this.over) break;
          p.hand = p.hand.filter((h) => h !== hc);
          const m = this.makeMinion(p.id, hc.cardId, hc);
          if (hc.parts) m.parts = hc.parts;
          p.board.push(m);
          this.recalcAuras();
          this.countSummon(p, hc.cardId);
          if (args.rush && !m.keywords.includes('RUSH')) m.keywords.push('RUSH');
          this.log(p.id, `從手牌召喚了${this.name(hc.cardId)}`);
          yield* this.emit({ k: 'summon', player: p.id, subject: m.uid, races: getCard(hc.cardId).races });
        }
        break;
      }
      case 'oakheart':
        // 橡心大師：號召攻擊力 1、2、3 的手下各一個
        for (const atk of [1, 2, 3]) {
          if (me.board.length >= MAX_BOARD) break;
          const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && getCard(h.cardId).attack === atk));
          if (!hc) continue;
          me.deck.splice(me.deck.indexOf(hc), 1);
          this.log(me.id, `號召了${this.name(hc.cardId)}`);
          yield* this.doSummon(ctx, ctx.controller, hc.cardId);
        }
        break;
      case 'jadeTelegram': {
        // 翠玉通訊：看對手手牌中的 3 張牌，把其中一張洗進他的牌堆
        const options = shuffle(s, [...foe.hand]).slice(0, 3);
        if (!options.length) break;
        const i = yield { player: ctx.controller, kind: 'discover', options: options.map((h) => h.cardId), title: '選擇一張洗回對手的牌堆' };
        const hc = options[Math.max(0, Math.min(options.length - 1, i ?? 0))];
        foe.hand = foe.hand.filter((h) => h !== hc);
        foe.deck.splice(randomInt(s, foe.deck.length + 1), 0, hc);
        break;
      }
      // ------------------------------------------------------------ 星艦
      case 'triggerRandomDeathrattle': {
        // 觸發一個隨機友方手下的亡語
        const list = me.board.filter((m) => this.alive(m) && !m.silenced && m.abilities.some((a) => a.on.k === 'deathrattle'));
        const m = pick(s, list);
        if (!m) break;
        this.log(me.id, `觸發了${this.name(m.cardId)}的亡語`);
        const dctx: Ctx = { ...this.baseCtx(m.owner), sourceUid: m.uid, sourceCardId: m.cardId, sourceSnapshot: m };
        for (const ab of m.abilities) {
          if (ab.on.k !== 'deathrattle' || (ab.cond && !this.evalCond(ab.cond, dctx))) continue;
          yield* this.runEffects(ab.effects, dctx);
        }
        break;
      }
      case 'attackIt': {
        // 此手下攻擊觸發事件的對象（不消耗攻擊次數）
        const src = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const t = ctx.it?.kind === 'char' ? this.char(ctx.it.uid) : null;
        if (!src || !t || !this.alive(src) || !this.alive(t) || src.owner === t.owner) break;
        yield* this.doAttack(src.uid, t.uid);
        src.attacks = Math.max(0, src.attacks - 1);
        break;
      }
      case 'recastIt':
        if (ctx.itCardId) yield* this.castRandomly(ctx.controller, ctx.itCardId);
        break;
      case 'summonCostEqualAttack': {
        const atk = Math.min(10, this.dyn('selfAttack', ctx));
        const id = pick(s, this.randomPool({ type: 'MINION', cost: atk }, ctx.controller, false))?.id;
        if (id) yield* this.doSummon(ctx, ctx.controller, id);
        break;
      }
      case 'exodar': {
        // 艾克索達：發射星艦，然後選擇一個協定
        const ship = yield* this.launch(ctx.controller, true);
        if (!ship) break;
        const options = ['GDB_100a', 'GDB_100b', 'GDB_100c'];
        const i = yield { player: ctx.controller, kind: 'discover', options, title: '選擇一個協定' };
        const alive = this.minion(ship.uid);
        const atk = alive ? this.atkOf(alive) : this.atkOf(ship);
        const hp = alive ? alive.hp : ship.hp;
        switch (options[i ?? 0]) {
          case 'GDB_100a':
            me.hero.armor += hp * 2;
            this.fx({ kind: 'armor', uid: me.hero.uid, amount: hp * 2 });
            break;
          case 'GDB_100b':
            yield* this.runEffect({ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: atk }, { ...ctx, sourceUid: ship.uid });
            break;
          case 'GDB_100c':
            for (const piece of ship.starship ?? []) {
              const hc = this.addToHand(me, piece.id);
              if (hc) hc.costMod = 1 - getCard(piece.id).cost;
            }
            break;
        }
        break;
      }
      case 'relaunchAll':
        // 吉姆‧雷諾：重新發射本場對戰中發射過的每一艘星艦
        for (const pieces of [...(me.launched ?? [])]) {
          if (me.board.length >= MAX_BOARD) break;
          yield* this.summonStarship(me.id, pieces, true);
          if (this.over) return;
        }
        break;
      case 'warpDrive': {
        const drawn = yield* this.draw(me, 2);
        if (me.starship?.length) for (const hc of drawn) hc.costMod -= 2;
        break;
      }
      case 'suffocate': {
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        if (me.starship?.length) {
          const n = pick(s, this.adjacent(m));
          if (n) n.dead = true;
        }
        m.dead = true;
        break;
      }
      case 'othaar': {
        const spells = shuffle(s, this.randomPool({ type: 'SPELL', spellSchool: 'ARCANE' }, ctx.controller, false).map((c) => c.id)).slice(0, 3);
        for (const id of spells) {
          const hc = this.addToHand(me, id);
          if (hc) hc.costMod -= 2;
        }
        break;
      }
      case 'destroyLowestInOppHand': {
        if (!foe.hand.length) break;
        const low = Math.min(...foe.hand.map((h) => this.costOf(foe, h)));
        const hc = pick(s, foe.hand.filter((h) => this.costOf(foe, h) === low));
        if (!hc) break;
        foe.hand = foe.hand.filter((h) => h !== hc);
        this.log(me.id, `摧毀了對手手牌中的${this.name(hc.cardId)}`);
        break;
      }
      case 'siegeTank': {
        // 作戰中的攻城坦克：對隨機敵方手下造成 10 點傷害，多餘的傷害打到敵方英雄
        const t = pick(s, foe.board.filter((m) => this.alive(m)));
        if (!t) break;
        const excess = Math.max(0, 10 - t.hp);
        const src = this.dmgSource(ctx);
        yield* this.damage(src, t.uid, 10);
        if (excess > 0) yield* this.damage(src, foe.hero.uid, excess);
        break;
      }
      case 'bladeOfCthun': {
        // 克蘇恩之刃：消滅一個手下，把它的攻擊力和生命值加到你的克蘇恩
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const atk = this.atkOf(m);
        const hp = Math.max(0, m.hp);
        m.dead = true;
        this.cthunBuff(me.id, atk, hp, false);
        break;
      }
      case 'cthunRevive': {
        // 厄運召喚者：克蘇恩已經死亡的話，把它洗入你的牌堆（保留所有加成）
        const alive = [...me.hand, ...me.deck, ...me.board].some((c) => isCthun(c.cardId));
        const deadId = me.graveyard.find((id) => isCthun(id));
        if (alive || !deadId) break;
        const hc = this.newHandCard(deadId);
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        this.log(me.id, '克蘇恩被洗回了牌堆');
        break;
      }
      case 'buildABeast': {
        // 製造殭屍獸：先發現一張獵人野獸，再發現一張殭屍獸專用野獸，縫合後加入手牌
        const first = shuffle(s, this.randomPool({ type: 'MINION', race: 'BEAST', cls: 'HUNTER', maxCost: 5 }, ctx.controller, false).map((c) => c.id)).slice(0, 3);
        const second = shuffle(s, [...ZOMBEAST_PARTS]).slice(0, 3);
        if (!first.length) break;
        const i1 = yield { player: ctx.controller, kind: 'discover', options: first, title: '製造殭屍獸：選擇第一隻野獸' };
        const i2 = yield { player: ctx.controller, kind: 'discover', options: second, title: '製造殭屍獸：選擇第二隻野獸' };
        const a = first[Math.max(0, Math.min(first.length - 1, i1 ?? 0))];
        const b = second[Math.max(0, Math.min(second.length - 1, i2 ?? 0))];
        const hc = this.addToHand(me, ZOMBEAST_ID);
        if (hc) {
          hc.parts = [a, b];
          ctx.it = { kind: 'hand', uid: hc.uid };
        }
        break;
      }
      case 'summonDeadRace': {
        // 召喚本場對戰中死亡的所有友方某種族手下
        const race = args.race as Race;
        for (const id of [...me.graveyard]) {
          if (me.board.length >= MAX_BOARD) break;
          const races = getCard(id).races ?? [];
          if (races.includes(race) || races.includes('ALL')) yield* this.doSummon(ctx, ctx.controller, id);
        }
        break;
      }
      // ------------------------------------------------------------ 銀白聯賽 / 黑石山 / 納克薩瑪斯 / 卡拉贊 / 加基森
      case 'totemicSlam': {
        // 圖騰進擊：召喚你選擇的基本圖騰
        const id = yield* this.choose(ctx, BASIC_TOTEMS, '選擇一個圖騰');
        yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'upgradeHeroPower': {
        // 審判者瑪瑞爾：把基本英雄能力換成強化版
        const basic = HEROES[me.heroClass].power.id;
        if (me.heroPower.id === basic && !me.heroPower.heroCard) this.setHeroPower(me, UPGRADED_POWER_IDS[me.heroClass]);
        break;
      }
      case 'copyHeroPower':
        // 雜耍吞法者：複製對手的英雄能力
        me.heroPower = { ...structuredClone(foe.heroPower), used: false, uses: 0 };
        this.log(me.id, `${me.name}複製了英雄能力【${this.powerInfo(me).name}】`);
        break;
      case 'ragnaros':
        // 管理者埃克索圖斯：換成 8 點生命值的『炎魔』拉格納羅斯
        me.hero.cardId = RAGNAROS_HERO;
        me.hero.hp = 8;
        me.hero.maxHp = 8;
        me.heroHealthChangedTurn = s.turn;
        this.setHeroPower(me, RAGNAROS_POWER);
        break;
      case 'powerCostZero':
        // 綑縛者拉札：本場對戰中英雄能力消耗為 (0)
        me.powerCostSet = 0;
        break;
      case 'gainSpellDamage': {
        const uid = args.chosen ? ctx.chosen : ctx.sourceUid;
        const m = uid !== null ? this.minion(uid) : null;
        if (m) m.spellDamage += (args.amount as number) ?? 1;
        break;
      }
      case 'allowAttack': {
        // 銀白巡邏兵：本回合可以正常攻擊
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (m) m.canAttackTurn = s.turn;
        break;
      }
      case 'summonSameCost': {
        // 火焰稻草人：召喚一個消耗相同的隨機手下
        if (!ctx.itCardId) break;
        const c = pick(s, this.randomPool({ type: 'MINION', cost: getCard(ctx.itCardId).cost }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'secretsFromDeck': {
        // 瘋狂科學家 / 神秘挑戰者：把牌堆中的奧秘放到戰場上
        const count = args.all ? MAX_SECRETS : ((args.count as number) ?? 1);
        let placed = 0;
        for (const hc of shuffle(s, me.deck.filter((h) => getCard(h.cardId).secret))) {
          if (placed >= count || me.secrets.length >= MAX_SECRETS) break;
          if (me.secrets.some((x) => getCard(x.cardId).name === getCard(hc.cardId).name)) continue;
          me.deck = me.deck.filter((h) => h !== hc);
          me.secrets.push({ uid: this.uid(), cardId: hc.cardId });
          this.log(me.id, `${me.name}把一個奧秘放到了戰場上`);
          placed++;
        }
        break;
      }
      case 'recruitFor': {
        // 死亡領主：對手把他牌堆中的一個手下放到戰場上
        const p = args.who === 'opponent' ? foe : me;
        const hc = pick(s, p.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc || p.board.length >= MAX_BOARD) break;
        p.deck = p.deck.filter((h) => h !== hc);
        this.log(p.id, `${p.name}把${this.name(hc.cardId)}放到了戰場上`);
        yield* this.summon(p.id, hc.cardId);
        break;
      }
      case 'varian': {
        // 瓦里安‧烏瑞恩：抽 3 張牌，抽到的手下直接放到戰場上
        for (let i = 0; i < 3; i++) {
          const [hc] = yield* this.draw(me, 1);
          if (!hc || getCard(hc.cardId).type !== 'MINION' || me.board.length >= MAX_BOARD) continue;
          me.hand = me.hand.filter((h) => h !== hc);
          const m = this.makeMinion(me.id, hc.cardId, hc);
          me.board.push(m);
          this.recalcAuras();
          this.countSummon(me, hc.cardId);
          this.fx({ kind: 'summon', uid: m.uid, cardId: m.cardId, player: me.id });
          yield* this.emit({ k: 'summon', player: me.id, subject: m.uid, races: getCard(hc.cardId).races });
          if (this.over) return;
        }
        break;
      }
      case 'kelThuzad': {
        // 科爾蘇加德：召喚本回合死亡的所有友方手下
        const ids = me.diedThisTurn?.turn === s.turn ? [...me.diedThisTurn.ids] : [];
        for (const id of ids) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'poisonSeeds': {
        // 劇毒種子：消滅所有手下，每死一個召喚一個 2/2 樹人取代它
        const counts = s.players.map((pl) => pl.board.filter((m) => this.alive(m)).length);
        for (const pl of s.players) for (const m of pl.board) m.dead = true;
        yield* this.processDeaths();
        if (this.over) return;
        for (const pl of s.players) for (let i = 0; i < counts[pl.id]; i++) yield* this.summon(pl.id, args.card as string);
        break;
      }
      case 'reincarnate': {
        // 重生：消滅一個手下，再讓它以全滿的生命值復活
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const { cardId, owner } = m;
        m.dead = true;
        yield* this.processDeaths();
        if (this.over) return;
        yield* this.summon(owner, cardId);
        break;
      }
      case 'resurrectRandom': {
        // 復活 / 瑪瑙主教：召喚本場對戰中死亡的隨機友方手下（可限定種族、不重複、賦予復生）
        let pool = me.graveyard.filter((id) => !args.race || this.isRace(id, args.race as Race));
        if (args.distinct) pool = [...new Set(pool)];
        for (const id of shuffle(s, [...pool]).slice(0, (args.count as number) ?? 1)) {
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m && args.reborn && !m.keywords.includes('REBORN')) m.keywords.push('REBORN');
        }
        break;
      }
      case 'devour': {
        // 護城河潛伏者：消滅一個手下，記住它（亡語時還回去）
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m || m === self) break;
        m.dead = true;
        if (self) (self.captured ??= []).push({ cardId: m.cardId, owner: m.owner });
        break;
      }
      case 'regurgitate':
        for (const c of ctx.sourceSnapshot?.captured ?? []) yield* this.summon(c.owner, c.cardId);
        break;
      case 'glory': {
        // 真言術：耀：每當它攻擊時，為施放者的英雄恢復生命值
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const side = m.owner === ctx.controller ? 'friendly' : 'enemy';
        m.abilities.push({ on: { k: 'attack', subject: 'self' }, effects: [{ e: 'heal', target: { t: 'hero', side }, amount: args.amount as number }] });
        break;
      }
      case 'spellslinger': {
        // 魔法鏢客：雙方各獲得一張隨機法術，你的消耗減少 (2)
        const mine = pick(s, this.randomPool({ type: 'SPELL' }, me.id, true));
        const theirs = pick(s, this.randomPool({ type: 'SPELL' }, foe.id, true));
        if (mine) {
          const hc = this.addToHand(me, mine.id);
          if (hc) hc.costMod -= 2;
        }
        if (theirs) this.addToHand(foe, theirs.id);
        break;
      }
      case 'copyToHand': {
        // 歸順：把一個敵方手下的複製加入你的手牌，其消耗為 (1)
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const hc = this.addToHand(me, m.cardId);
        if (hc && args.cost !== undefined) hc.costMod = (args.cost as number) - getCard(m.cardId).cost;
        break;
      }
      case 'randomDamageAll': {
        // 元素毀滅：對全部手下各造成 4~5 點傷害
        const src = this.dmgSource(ctx);
        const bonus = ctx.isSpell ? this.spellDamage(me.id) : 0;
        const min = args.min as number;
        const max = args.max as number;
        for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c))) yield* this.damage(src, m.uid, min + randomInt(s, max - min + 1) + bonus);
        break;
      }
      case 'gainRandomAtk': {
        // 火焰驅逐者：獲得 1~4 點攻擊力
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const min = args.min as number;
        if (m) m.atkBuff += min + randomInt(s, (args.max as number) - min + 1);
        break;
      }
      case 'unlockOverload':
        // 熔岩震擊：解鎖被超載的法力水晶，本回合打出的牌也不會超載
        me.mana = Math.min(MAX_MANA, me.mana + me.overloadLocked);
        me.overloadLocked = 0;
        me.overloadOwed = 0;
        break;
      case 'discountHand':
        // 索瑞森大帝：你手牌中的卡消耗減少
        for (const hc of me.hand) hc.costMod -= args.amount as number;
        break;
      case 'discountOtherClass':
        // 以太道具商：你手牌中其他職業的卡消耗減少
        for (const hc of me.hand) {
          const classes = cardClasses(this.handDef(hc));
          if (!classes.includes('NEUTRAL') && !classes.includes(me.heroClass)) hc.costMod -= args.amount as number;
        }
        break;
      case 'buffHandAndDeck':
        // 喚霧者：你手牌與牌堆中的所有手下 +1/+1
        for (const hc of args.deckOnly ? me.deck : [...me.hand, ...me.deck]) {
          if (this.handDef(hc).type !== 'MINION') continue;
          hc.atkBuff += args.atk as number;
          hc.hpBuff += args.hp as number;
        }
        break;
      case 'buffHandWeapon': {
        // 汙街典當商：你手牌中一張隨機武器 +1/+1
        const hc = pick(s, me.hand.filter((h) => this.handDef(h).type === 'WEAPON'));
        if (hc) {
          hc.atkBuff += args.atk as number;
          hc.hpBuff += args.dur as number;
        }
        break;
      }
      case 'coliseum':
        // 高手過招：消滅所有手下，每位玩家只留下攻擊力最高的一個
        for (const pl of s.players) {
          const list = pl.board.filter((m) => this.alive(m));
          const top = Math.max(-1, ...list.map((m) => this.atkOf(m)));
          const keep = pick(s, list.filter((m) => this.atkOf(m) === top));
          for (const m of list) if (m !== keep) m.dead = true;
        }
        break;
      case 'lockAndLoad':
        // 全面備戰：本回合之後每施放一張法術，獲得一張隨機獵人牌
        (me.eternal ??= []).push({
          ability: { on: { k: 'spellCast', side: 'friendly' }, effects: [{ e: 'addRandom', pool: { cls: 'HUNTER' }, count: 1, who: 'self' }] },
          sourceCardId: ctx.sourceCardId,
          turn: s.turn,
          minSpells: me.spellsCastThisGame + 2,
        });
        break;
      case 'ifAttack': {
        // 攻擊後的條件效果：攻擊英雄 / 攻擊手下 / 消滅手下 / 存活
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const last = this.lastAttack;
        if (!self || !last || last.attacker !== self.uid) break;
        if (args.hero && !last.defenderIsHero) break;
        if (args.minion && last.defenderIsHero) break;
        if (args.killed && !last.killed) break;
        if (args.survive && !this.alive(self)) break;
        yield* this.runEffects(args.then as Effect[], ctx);
        break;
      }
      case 'growInHand': {
        // 肥油大亨：在手牌中獲得 +1/+1
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        if (hc) {
          hc.atkBuff += args.atk as number;
          hc.hpBuff += args.hp as number;
        }
        break;
      }
      case 'stealTemp': {
        // 瘋狂藥水：控制一個敵方手下直到回合結束（本回合可以攻擊）
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m || m.owner === me.id || me.board.length >= MAX_BOARD) break;
        const from = s.players[m.owner];
        from.board = from.board.filter((x) => x !== m);
        m.returnTo = from.id;
        m.owner = me.id;
        m.sleeping = false;
        m.attacks = 0;
        me.board.push(m);
        this.recalcAuras();
        break;
      }
      case 'discoverFromOppDeck': {
        // 龍獸探員：發現對手牌堆中一張卡的複製
        const opts: string[] = [];
        for (const h of shuffle(s, [...foe.deck])) {
          if (opts.length >= 3) break;
          if (!opts.some((o) => getCard(o).name === getCard(h.cardId).name)) opts.push(h.cardId);
        }
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現對手牌堆中一張卡的複製');
        const got = this.addToHand(me, id);
        if (got) got.fromOpp = true;
        break;
      }
      case 'kazakus': {
        // 卡札克斯：選擇消耗，再選兩種材料，製造一張自訂藥水
        const tier = yield* this.choose(ctx, KAZAKUS_TIERS, '選擇藥水的消耗');
        const pool = KAZAKUS_INGREDIENTS[tier].filter((id) => hasCard(id));
        const first = yield* this.choose(ctx, shuffle(s, [...pool]).slice(0, 3), '選擇第一種材料');
        const second = yield* this.choose(ctx, shuffle(s, pool.filter((id) => id !== first)).slice(0, 3), '選擇第二種材料');
        const hc = this.addToHand(me, KAZAKUS_POTIONS[tier]);
        if (hc) hc.potion = [first, second];
        break;
      }
      case 'weaponDurability': {
        // 劇毒下水道軟泥怪：對手的武器失去 1 點耐久度
        const w = (args.who === 'opponent' ? foe : me).weapon;
        if (w) w.durability += args.amount as number;
        break;
      }
      case 'removeEnemyStealth':
        // 街頭調查員：敵方手下失去潛行
        for (const m of foe.board) {
          m.keywords = m.keywords.filter((k) => k !== 'STEALTH');
          m.tempKeywords = m.tempKeywords.filter((k) => k !== 'STEALTH');
          m.nextTurnKeywords = m.nextTurnKeywords.filter((k) => k !== 'STEALTH');
        }
        break;
      case 'summonDeckCopies': {
        // 苟雅女士：召喚牌堆中所選友方手下的所有複製
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        for (const hc of me.deck.filter((h) => h.cardId === m.cardId)) {
          if (me.board.length >= MAX_BOARD) break;
          me.deck = me.deck.filter((h) => h !== hc);
          yield* this.doSummon(ctx, me.id, hc.cardId);
        }
        break;
      }
      case 'wrathion': {
        // 怒西昂：持續抽牌，直到抽到不是龍的牌
        for (let i = 0; i < 10 && !this.over; i++) {
          const [hc] = yield* this.draw(me, 1);
          if (!hc || !this.isRace(hc.cardId, 'DRAGON')) break;
        }
        break;
      }
      case 'drawUntil':
        // 『大白鯊』甘佐：雙方抽牌直到有 3 張手牌（current：只有目前回合的玩家，例如吉福斯）
        for (const p of args.current ? [s.players[s.current]] : [me, foe]) {
          const n = (args.n as number) - p.hand.length;
          if (n > 0) yield* this.draw(p, n);
        }
        break;
      case 'drawDiscount': {
        // 月之洞察：抽 2 張牌，抽到的手下消耗減少 (2)
        const drawn = yield* this.draw(me, args.count as number);
        for (const hc of drawn) if (getCard(hc.cardId).type === args.type) hc.costMod -= args.amount as number;
        break;
      }
      case 'healByItCost': {
        // 象牙騎士：為你的英雄恢復等同發現的法術消耗的生命值
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid) : null;
        if (hc) yield* this.heal(me.hero.uid, getCard(hc.card.cardId).cost);
        break;
      }
      case 'barnes': {
        // 巴奈斯 / 暗影精華：召喚牌堆中一個隨機手下的 1/1（或 5/5）複製
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc) break;
        const m = yield* this.doSummon(ctx, me.id, hc.cardId);
        if (m) this.setStats(m, (args.atk as number) ?? 1, (args.hp as number) ?? 1);
        break;
      }
      case 'atiesh': {
        // 阿泰絲：在你施放法術後，召喚一個消耗相同的隨機手下，失去 1 點耐久度
        if (!ctx.itCardId || !me.weapon) break;
        const c = pick(s, this.randomPool({ type: 'MINION', cost: getCard(ctx.itCardId).cost, rarity: args.legendary ? 'LEGENDARY' : undefined }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        if (me.weapon) me.weapon.durability--;
        break;
      }
      // ------------------------------------------------------------ 哥布林與地精 / 冰封王座 / 狗頭人 / 黑木森林 / 奧丹姆 / 惡魔獵人
      case 'counterInHand': {
        // 在手牌中累積計數（例如尼斯蘭德瑪斯）
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        if (hc) hc.counter = (hc.counter ?? 0) + ((args.n as number) ?? 1);
        break;
      }
      case 'upgradeInHand': {
        // 法術石：達成條件後升級成下一階
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        if (!hc) break;
        const n = args.overload ? (ctx.itCardId ? (getCard(ctx.itCardId).overload ?? 0) : 0) : 1;
        if (n <= 0) break;
        hc.counter = (hc.counter ?? 0) + n;
        if (hc.counter >= (args.need as number) && hasCard(args.into as string)) {
          hc.cardId = args.into as string;
          hc.counter = 0;
          this.log(me.id, `${this.name(hc.cardId)}升級了`);
        }
        break;
      }
      case 'summonRandomCost': {
        // 尼斯蘭德瑪斯：召喚兩個消耗等同計數的隨機手下
        const cost = Math.min(10, this.amount(args.cost as Amount, ctx));
        const pool = this.randomPool({ type: 'MINION', cost }, me.id, false);
        for (let i = 0; i < ((args.count as number) ?? 1); i++) {
          const c = pick(s, pool);
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      }
      case 'heroImmune':
        // 殘影 / 暗影之刃：你的英雄本回合免疫
        me.hero.immune = true;
        break;
      case 'manaBurn':
        // 法力燃燒：對手的下個回合少 2 個法力水晶
        foe.manaBurn = { amount: args.amount as number, turn: s.turn + 1 };
        break;
      case 'attackAgainSelf': {
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (m) m.attacks = Math.max(0, m.attacks - 1);
        break;
      }
      case 'tess': {
        // 泰絲‧葛雷邁恩：重新打出本場對戰中你打出過的每一張其他職業的卡（目標隨機）
        const list = (me.playedCards ?? []).filter((id) => this.isOtherClass(me, id) && getCard(id).nameEn !== getCard(ctx.sourceCardId).nameEn);
        for (const id of list.slice(0, 30)) {
          yield* this.replay(me.id, id);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'shudderwock': {
        // 哮斗龍：重複本場對戰中你打出的其他卡的戰吼（目標隨機）
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self) break;
        const name = getCard(ctx.sourceCardId).nameEn;
        const list = (me.playedCards ?? []).filter((id) => getCard(id).type !== 'SPELL' && getCard(id).nameEn !== name && getCard(id).abilities?.some((a) => a.on.k === 'play'));
        for (const id of list.slice(-30)) {
          if (!this.minion(self.uid)) break;
          yield* this.repeatBattlecry(me.id, self.uid, id);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'loseHealth': {
        // 黑巫森林灰熊：對手每有一張手牌，失去 1 點生命值
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!m) break;
        const n = this.amount(args.amount as Amount, ctx);
        m.maxHp = Math.max(1, m.maxHp - n);
        m.hp = Math.min(m.hp, m.maxHp);
        break;
      }
      case 'shuffleCopiesBuffed': {
        // 凶暴狂亂：把 3 張 +3/+3 的複製洗入你的牌堆
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        for (let i = 0; i < (args.count as number); i++) {
          const hc = this.newHandCard(m.cardId);
          hc.atkBuff = args.atk as number;
          hc.hpBuff = args.hp as number;
          me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        }
        break;
      }
      case 'lightbomb': {
        // 聖光炸彈：對每個手下造成等同其攻擊力的傷害
        const src = this.dmgSource(ctx);
        const bonus = ctx.isSpell ? this.spellDamage(me.id) : 0;
        const list = this.chars().filter((c) => !isHero(c) && this.alive(c) && this.pass(c, { type: 'minion' }, ctx)).map((m) => [m.uid, this.atkOf(m)] as const);
        for (const [uid, atk] of list) yield* this.damage(src, uid, atk + bonus);
        break;
      }
      case 'randomDamage': {
        // 爆爆機器人 / 轟雷：造成隨機 min~max 點傷害（隨機敵人或所選目標）
        const n = (args.min as number) + randomInt(s, (args.max as number) - (args.min as number) + 1) + (ctx.isSpell ? this.spellDamage(me.id) : 0);
        const t = args.chosen ? ctx.chosen : pick(s, [foe.hero, ...foe.board].filter((c) => this.alive(c) && (isHero(c) || !this.hasKw(c, 'DORMANT'))))?.uid;
        if (t !== null && t !== undefined) yield* this.damage(this.dmgSource(ctx), t, n);
        break;
      }
      case 'repeatAoe': {
        // 褻瀆 / 高佛雷領主：對所有（其他）手下造成傷害，若有手下死亡就重複
        const src = this.dmgSource(ctx);
        const n = (args.amount as number) + (ctx.isSpell ? this.spellDamage(me.id) : 0);
        for (let loop = 0; loop < 15; loop++) {
          const before = s.deathsThisTurn;
          for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c) && this.pass(c, { type: 'minion', excludeSelf: !!args.excludeSelf }, ctx))) yield* this.damage(src, m.uid, n);
          yield* this.processDeaths();
          if (this.over || s.deathsThisTurn === before) break;
        }
        break;
      }
      case 'spreadingPlague':
        // 散播瘟疫：召喚一隻 1/5 嘲諷甲蟲；若對手的手下比較多，再施放一次
        for (let i = 0; i < MAX_BOARD; i++) {
          const m = yield* this.doSummon(ctx, me.id, args.card as string);
          if (!m || foe.board.filter((x) => this.alive(x)).length <= me.board.filter((x) => this.alive(x)).length) break;
        }
        break;
      case 'addSparePart':
        // 把一張隨機零件加入手牌（who = both 時雙方各一張）
        for (const p of args.who === 'both' ? [me, foe] : [me]) {
          const id = pick(s, SPARE_PARTS.filter((x) => hasCard(x)));
          if (id) this.addToHand(p, id);
        }
        break;
      case 'deadMansHand':
        // 亡者之手：把你手牌的複製洗入你的牌堆
        for (const h of [...me.hand]) me.deck.splice(randomInt(s, me.deck.length + 1), 0, { ...structuredClone(h), uid: this.uid(), echo: false, temporary: false });
        break;
      case 'furnacefire': {
        // 火爐巨屍：棄掉手牌中的所有武器，獲得它們的數值
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const weapons = me.hand.filter((h) => this.handDef(h).type === 'WEAPON');
        for (const w of weapons) {
          me.hand = me.hand.filter((h) => h !== w);
          if (self) {
            self.atkBuff += (this.handDef(w).attack ?? 0) + w.atkBuff;
            self.maxHp += (this.handDef(w).health ?? 0) + w.hpBuff;
            self.hp += (this.handDef(w).health ?? 0) + w.hpBuff;
          }
          yield* this.discarded(me, w);
        }
        break;
      }
      case 'addFromGraveyard': {
        // 墓穴潛伏者：把本場對戰中死亡的隨機亡語手下加入手牌
        const id = pick(s, me.graveyard.filter((x) => !args.deathrattle || getCard(x).abilities?.some((a) => a.on.k === 'deathrattle')));
        if (id) this.addToHand(me, id);
        break;
      }
      case 'rollTheBones':
        // 撿骨：抽一張牌，若有亡語就再施放一次
        for (let i = 0; i < 30; i++) {
          const [hc] = yield* this.draw(me, 1);
          if (!hc || !getCard(hc.cardId).abilities?.some((a) => a.on.k === 'deathrattle')) break;
        }
        break;
      case 'randomSecret': {
        // 普崔希德教授：把一個隨機的（獵人）奧秘放到戰場上
        if (me.secrets.length >= MAX_SECRETS) break;
        const pool = this.randomPool({ isSecret: true, cls: args.cls as CardClass | undefined }, me.id, false).filter((c) => !me.secrets.some((x) => getCard(x.cardId).name === c.name));
        const c = pick(s, pool);
        if (c) me.secrets.push({ uid: this.uid(), cardId: c.id });
        break;
      }
      case 'giveToOpponent': {
        // 不懷好意：把一個友方手下給對手
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m || m.owner !== me.id) break;
        me.board = me.board.filter((x) => x !== m);
        if (foe.board.length >= MAX_BOARD) {
          m.dead = true;
          me.board.push(m);
          break;
        }
        m.owner = foe.id;
        m.sleeping = true;
        foe.board.push(m);
        this.recalcAuras();
        break;
      }
      case 'copyFromOppDeck': {
        // 啃食心智 / 靈能刺探：複製對手牌堆中的卡
        const cards = foe.deck.filter((h) => !args.type || getCard(h.cardId).type === args.type);
        for (const h of shuffle(s, [...cards]).slice(0, (args.count as number) ?? 1)) {
          const got = this.addToHand(me, h.cardId);
          if (got) got.fromOpp = true;
        }
        break;
      }
      case 'discoverGraveyard': {
        // 無盡奴役 / 裹屍人：發現一個本場對戰中死亡的友方手下
        const opts = this.discoverOptions(undefined, me.id, [...new Set(me.graveyard)].map((id) => getCard(id)));
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個死亡的友方手下');
        if (args.summon) yield* this.doSummon(ctx, me.id, id);
        else if (args.shuffle) me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(id));
        else this.addToHand(me, id);
        break;
      }
      case 'benedictus':
        // 大主教本尼迪塔斯：把對手牌堆的複製洗入你的牌堆
        for (const h of foe.deck) me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(h.cardId));
        break;
      case 'leechingPoison':
        if (me.weapon) me.weapon.lifestealTurn = s.turn;
        break;
      case 'doomerang': {
        // 毀力鏢：擲出武器造成傷害，再回到你的手牌
        const w = me.weapon;
        const t = ctx.chosen;
        if (!w) break;
        if (t !== null) yield* this.damage({ ...this.charSource(me.hero), uid: me.hero.uid }, t, this.weaponAtk(me));
        if (me.weapon !== w) break;
        me.weapon = null;
        const hc = this.addToHand(me, w.cardId);
        if (hc) hc.atkBuff = w.atk - (getCard(w.cardId).attack ?? 0);
        break;
      }
      case 'iceBreaker': {
        // 破冰斧：消滅被它傷害的凍結手下
        const d = this.lastAttack && !this.lastAttack.defenderIsHero ? this.minion(this.lastAttack.defender) : null;
        if (d && d.frozen) d.dead = true;
        break;
      }
      case 'resummonSelf': {
        // 拚死一搏 / 馭屍者：亡語：讓此手下復活（1 點生命值）
        const m = yield* this.doSummon(ctx, me.id, ctx.sourceCardId);
        if (m && args.hp !== undefined) m.hp = Math.min(m.hp, args.hp as number);
        break;
      }
      case 'obliterate': {
        // 惡魔斬隙者 / 抹殺：消滅一個手下，你的英雄受到等同其生命值的傷害
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const hp = Math.max(0, m.hp);
        m.dead = true;
        yield* this.damage({ owner: me.id, uid: null }, me.hero.uid, hp);
        break;
      }
      case 'armyOfFrozenThrone':
        // 冰封王座大軍：移除牌堆頂的 5 張牌，召喚其中的手下
        for (const h of this.mill(me, 5)) if (getCard(h.cardId).type === 'MINION') yield* this.doSummon(ctx, me.id, h.cardId);
        break;
      case 'doomPact': {
        // 末日契約：消滅所有手下，每消滅一個移除你牌堆頂的一張牌
        const list = this.chars().filter((c) => !isHero(c) && this.alive(c) && this.pass(c, { type: 'minion' }, ctx)) as Minion[];
        for (const m of list) m.dead = true;
        this.mill(me, list.length);
        break;
      }
      case 'deathGrip': {
        // 死亡之握：從對手的牌堆偷一個手下加入你的手牌
        const hc = pick(s, foe.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc) break;
        foe.deck = foe.deck.filter((h) => h !== hc);
        if (me.hand.length < MAX_HAND) me.hand.push(hc);
        break;
      }
      case 'deathCoil': {
        // 死亡纏繞：對敵人造成 5 點傷害，或為友方角色恢復 5 點生命值
        const c = ctx.chosen !== null ? this.char(ctx.chosen) : null;
        if (!c) break;
        if (c.owner === me.id) yield* this.heal(c.uid, 5);
        else yield* this.damage(this.dmgSource(ctx), c.uid, 5 + this.spellDamage(me.id));
        break;
      }
      case 'millTop':
        this.mill(args.who === 'opponent' ? foe : me, args.count as number);
        break;
      case 'handBuffKeyword': {
        // 亡斧懲戒者 / 末日犰狳 / 全力迎戰：手牌中具有某關鍵字的手下 +X/+Y
        const list = me.hand.filter((h) => this.handDef(h).type === 'MINION' && this.handDef(h).keywords?.includes(args.keyword as Keyword));
        for (const h of args.all ? list : [pick(s, list)].filter(Boolean) as HandCard[]) {
          h.atkBuff += args.atk as number;
          h.hpBuff += args.hp as number;
        }
        break;
      }
      case 'lilianVoss':
        // 莉莉安‧佛斯：把手牌中的法術換成（對手職業的）隨機法術
        for (const h of me.hand) {
          if (this.handDef(h).type !== 'SPELL') continue;
          const c = pick(s, this.randomPool({ type: 'SPELL', cls: 'opponent' }, me.id, false));
          if (c) {
            h.cardId = c.id;
            h.costMod = 0;
            h.potion = undefined;
          }
        }
        break;
      case 'recruitLessAtk': {
        // 血屍戰車：從牌堆召喚一個攻擊力比此手下低的手下
        const atk = this.dyn('selfAttack', ctx);
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && (getCard(h.cardId).attack ?? 0) < atk));
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        yield* this.doSummon(ctx, me.id, hc.cardId);
        break;
      }
      case 'simulacrum': {
        // 幻象分體：複製手牌中消耗最低的手下
        const minions = me.hand.filter((h) => this.handDef(h).type === 'MINION');
        if (!minions.length) break;
        const low = Math.min(...minions.map((h) => this.costOf(me, h)));
        const hc = pick(s, minions.filter((h) => this.costOf(me, h) === low))!;
        if (me.hand.length < MAX_HAND) me.hand.push({ ...structuredClone(hc), uid: this.uid() });
        break;
      }
      case 'summonDead': {
        // 哈卓諾克斯：召喚本場對戰中死亡的友方嘲諷手下
        for (const id of [...me.graveyard]) {
          if (me.board.length >= MAX_BOARD) break;
          if (getCard(id).keywords?.includes(args.keyword as Keyword)) yield* this.doSummon(ctx, me.id, id);
        }
        break;
      }
      case 'discountOppMinions':
        // 放馬過來！：對手手牌中的手下消耗減少 (2)
        for (const h of foe.hand) if (this.handDef(h).type === 'MINION') h.costMod -= args.amount as number;
        break;
      case 'stealAtNextTurn': {
        // 擁抱黑暗：在你的下個回合開始時，控制它
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (m) (me.delayed ??= []).push({ turns: 1, effects: [fn2('stealUid', { uid: m.uid })], sourceCardId: ctx.sourceCardId });
        break;
      }
      case 'stealUid': {
        const m = this.minion(args.uid as number);
        if (m && m.owner !== me.id && this.alive(m)) yield* this.runEffect({ e: 'steal', target: { t: 'it' } }, { ...ctx, it: { kind: 'char', uid: m.uid } });
        break;
      }
      case 'becomeCopy': {
        // 泰爾達朗親王：變成所選手下的 3/3 複製
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!self || !m || m === self) break;
        const board = s.players[self.owner].board;
        const idx = board.indexOf(self);
        this.transform(self.uid, m.cardId);
        if (board[idx]) this.setStats(board[idx], args.atk as number, args.hp as number);
        break;
      }
      case 'corpsetaker': {
        // 奪屍者：牌堆中有嘲諷 / 聖盾 / 生命竊取 / 風怒手下時，獲得該關鍵字
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self) break;
        for (const k of ['TAUNT', 'DIVINE_SHIELD', 'LIFESTEAL', 'WINDFURY'] as Keyword[]) {
          if (me.deck.some((h) => getCard(h.cardId).type === 'MINION' && getCard(h.cardId).keywords?.includes(k)) && !self.keywords.includes(k)) self.keywords.push(k);
        }
        break;
      }
      case 'castRandomSpell': {
        // 驚奇卷軸：施放一個隨機法術
        const c = pick(s, poolCards({ type: 'SPELL' }, me.heroClass, foe.heroClass).filter((x) => !x.quest && x.nameEn !== 'Puzzle Box of Yogg-Saron'));
        if (c) yield* this.castRandomly(me.id, c.id);
        break;
      }
      case 'redirectSummonRandom': {
        // 遊蕩的怪物：召喚一個隨機 3 費手下作為新的攻擊目標
        const c = pick(s, this.randomPool({ type: 'MINION', cost: args.cost as number }, me.id, false));
        const m = c ? yield* this.summon(me.id, c.id) : null;
        if (m && this.currentAttack) this.currentAttack.defender = m.uid;
        break;
      }
      case 'explosiveRunes': {
        // 爆炸符文：對它造成 6 點傷害，多出的傷害打到對手的英雄
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!m) break;
        const excess = Math.max(0, 6 - m.hp);
        yield* this.damage(this.dmgSource(ctx), m.uid, 6);
        if (excess) yield* this.damage(this.dmgSource(ctx), foe.hero.uid, excess);
        break;
      }
      case 'splitHeal': {
        // 治癒之雨：隨機分配治療給友方角色
        for (let i = 0; i < (args.amount as number); i++) {
          const list = [me.hero, ...me.board].filter((c) => this.alive(c) && c.hp < c.maxHp);
          const t = pick(s, list);
          if (!t) break;
          yield* this.heal(t.uid, 1);
        }
        break;
      }
      case 'siamat': {
        // 希亞梅特：從四種能力中選擇兩種
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self) break;
        const kw: Record<string, Keyword> = { ULD_178a: 'WINDFURY', ULD_178a2: 'DIVINE_SHIELD', ULD_178a3: 'TAUNT', ULD_178a4: 'RUSH' };
        let opts = SIAMAT_OPTIONS.filter((x) => hasCard(x));
        for (let i = 0; i < 2 && opts.length; i++) {
          const id = yield* this.choose(ctx, opts, '選擇希亞梅特的能力');
          opts = opts.filter((x) => x !== id);
          if (!self.keywords.includes(kw[id])) self.keywords.push(kw[id]);
        }
        break;
      }
      case 'vulpera': {
        // 狐狸人無賴：發現一張法術，或選擇神秘選項（隨機一張法術）
        const opts = this.discoverOptions({ type: 'SPELL' }, me.id);
        if (hasCard('ULD_209t')) opts.push('ULD_209t');
        const id = yield* this.choose(ctx, opts, '發現一張法術');
        const card = id === 'ULD_209t' ? pick(s, this.randomPool({ type: 'SPELL' }, me.id, true))?.id : id;
        if (card) this.addToHand(me, card);
        break;
      }
      case 'discoverSecretPlace': {
        // 秘法鎖匠：發現一個奧秘，放到戰場上
        const pool = this.randomPool({ isSecret: true, cls: 'own' }, me.id, false).filter((c) => !me.secrets.some((x) => getCard(x.cardId).name === c.name));
        const opts = this.discoverOptions(undefined, me.id, pool);
        if (!opts.length || me.secrets.length >= MAX_SECRETS) break;
        const id = yield* this.choose(ctx, opts, '發現一個奧秘');
        me.secrets.push({ uid: this.uid(), cardId: id });
        break;
      }
      case 'emeriss':
        // 艾莫莉絲：你手牌中所有手下的攻擊力與生命值加倍
        for (const h of me.hand) {
          if (this.handDef(h).type !== 'MINION') continue;
          const st = this.handStats(me.id, h);
          h.atkBuff += st.atk;
          h.hpBuff += st.hp;
        }
        break;
      case 'azalina':
        // 竊魂者阿薩琳娜：把你的手牌換成對手手牌的複製
        me.hand = foe.hand.map((h) => ({ ...structuredClone(h), uid: this.uid() }));
        break;
      case 'devourStats': {
        // 捕鼠人：消滅一個友方手下，獲得它的攻擊力與生命值
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!self || !m || m === self) break;
        self.atkBuff += this.atkOf(m);
        self.maxHp += Math.max(0, m.hp);
        self.hp += Math.max(0, m.hp);
        m.dead = true;
        break;
      }
      case 'revealDamageAll': {
        // 致命武裝 / 火龍之怒：揭露牌堆中的一張武器（法術），對全部手下造成其攻擊力（消耗）的傷害
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === args.type));
        if (!hc) break;
        const def = getCard(hc.cardId);
        const n = (args.type === 'WEAPON' ? (def.attack ?? 0) : def.cost) + (ctx.isSpell ? this.spellDamage(me.id) : 0);
        this.log(me.id, `揭露了${this.name(hc.cardId)}`);
        const src = this.dmgSource(ctx);
        for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c) && this.pass(c, { type: 'minion' }, ctx))) yield* this.damage(src, m.uid, n);
        break;
      }
      case 'bookOfSpecters': {
        // 冤靈之書：抽 3 張牌，棄掉抽到的法術
        const drawn = yield* this.draw(me, 3);
        for (const h of drawn) {
          if (getCard(h.cardId).type !== 'SPELL' || !me.hand.includes(h)) continue;
          me.hand = me.hand.filter((x) => x !== h);
          yield* this.discarded(me, h);
        }
        break;
      }
      case 'totemCruncher': {
        // 圖騰啃食者：消滅你的圖騰，每消滅一個獲得 +2/+2
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const totems = me.board.filter((m) => m !== self && this.alive(m) && this.isRace(m.cardId, 'TOTEM'));
        for (const t of totems) t.dead = true;
        if (self) {
          self.atkBuff += 2 * totems.length;
          self.maxHp += 2 * totems.length;
          self.hp += 2 * totems.length;
        }
        break;
      }
      case 'drawLowestMinion': {
        // 黑巫森林吹笛手：抽出牌堆中消耗最低的手下
        const minions = me.deck.filter((h) => getCard(h.cardId).type === 'MINION');
        if (!minions.length) break;
        const low = Math.min(...minions.map((h) => getCard(h.cardId).cost));
        const hc = pick(s, minions.filter((h) => getCard(h.cardId).cost === low))!;
        me.deck = me.deck.filter((h) => h !== hc);
        if (me.hand.length < MAX_HAND) me.hand.push(hc);
        break;
      }
      case 'voodooMark': {
        // 巫毒人偶：記住選擇的手下
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (self && ctx.chosen !== null) self.linked = ctx.chosen;
        break;
      }
      case 'voodooDestroy': {
        const uid = ctx.sourceSnapshot?.linked;
        const m = uid !== undefined ? this.minion(uid) : null;
        if (m) m.dead = true;
        break;
      }
      case 'summonHandCopy': {
        // 傀儡師多里安：召喚抽到的手下的 1/1 複製
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : null;
        if (!hc || this.handDef(hc).type !== 'MINION') break;
        const m = yield* this.doSummon(ctx, me.id, hc.cardId);
        if (m) this.setStats(m, args.atk as number, args.hp as number);
        break;
      }
      case 'princeLiam':
        // 黎姆王子：把牌堆中消耗 1 的卡變成傳說手下
        for (const h of me.deck) {
          if (getCard(h.cardId).cost !== 1) continue;
          const c = pick(s, this.randomPool({ type: 'MINION', rarity: 'LEGENDARY' }, me.id, true));
          if (c) h.cardId = c.id;
        }
        break;
      case 'copyWithHealth': {
        // 鮮明夢魘 / 血誓傭兵：召喚所選友方手下的複製（鮮明夢魘只剩 1 點生命值）
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const c = yield* this.doSummon(ctx, me.id, m.cardId);
        if (!c) break;
        this.copyStats(m, c);
        if (args.hp !== undefined) c.hp = Math.min(c.maxHp, args.hp as number);
        break;
      }
      case 'copyStatsToHand': {
        // 接木樹妖 / 蛇髮佐菈：把所選友方手下的複製（10/10、消耗 10）加入手牌
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const hc = this.addToHand(me, m.cardId);
        if (!hc || args.atk === undefined) break;
        const def = getCard(m.cardId);
        hc.atkBuff = (args.atk as number) - (def.attack ?? 0);
        hc.hpBuff = (args.hp as number) - (def.health ?? 0);
        hc.costMod = (args.cost as number) - def.cost;
        break;
      }
      case 'doubleOtherHealth':
        // 閃亮飛蛾：你其他手下的生命值加倍
        for (const m of me.board) {
          if (m.uid === ctx.sourceUid || !this.alive(m)) continue;
          m.maxHp += m.hp;
          m.hp += m.hp;
        }
        break;
      case 'ladyInWhite':
        // 白衣女士：牌堆中所有手下的攻擊力變得等同生命值
        for (const h of me.deck) {
          const def = getCard(h.cardId);
          if (def.type === 'MINION') h.atkBuff = (def.health ?? 0) + h.hpBuff - (def.attack ?? 0);
        }
        break;
      case 'echoOfMedivh':
        // 麥迪文的回音：把每個友方手下的複製加入手牌
        for (const m of [...me.board]) if (this.alive(m)) this.addToHand(me, m.cardId);
        break;
      case 'voljin': {
        // 沃金：與另一個手下交換生命值
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!self || !m || m === self) break;
        const [a, b] = [self.hp, m.hp];
        self.maxHp = self.hp = b;
        m.maxHp = m.hp = a;
        break;
      }
      case 'demonheart': {
        // 惡魔之心：對一個手下造成 5 點傷害；若是友方惡魔，改為賦予 +5/+5
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        if (m.owner === me.id && this.isRace(m.cardId, 'DEMON')) yield* this.runEffect({ e: 'buff', target: { t: 'chosen' }, atk: 5, hp: 5 }, ctx);
        else yield* this.damage(this.dmgSource(ctx), m.uid, 5 + this.spellDamage(me.id));
        break;
      }
      case 'feignDeath':
        // 假死：觸發你所有手下的亡語
        for (const m of [...me.board]) {
          if (!this.alive(m) || m.silenced || !m.abilities.some((a) => a.on.k === 'deathrattle')) continue;
          yield* this.runDeathrattles(m);
          if (this.over) return;
        }
        break;
      case 'gallywix':
        // 貿易親王加里維克斯：獲得對手法術的複製，給他一枚加里維克斯的幸運幣
        if (ctx.itCardId && ctx.itCardId !== 'GVG_028t') {
          this.addToHand(me, ctx.itCardId);
          if (hasCard('GVG_028t')) this.addToHand(foe, 'GVG_028t');
        }
        break;
      case 'shuffleIntoOwnerDeck': {
        // 回收：把一個敵方手下洗入它擁有者的牌堆
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const owner = s.players[m.owner];
        owner.board = owner.board.filter((x) => x !== m);
        owner.deck.splice(randomInt(s, owner.deck.length + 1), 0, this.newHandCard(m.cardId));
        this.recalcAuras();
        break;
      }
      case 'implosion': {
        // 小鬼爆破：造成 2~4 點傷害，每 1 點傷害召喚一隻 1/1 小鬼
        const n = 2 + randomInt(s, 3) + this.spellDamage(me.id);
        if (ctx.chosen !== null) yield* this.damage(this.dmgSource(ctx), ctx.chosen, n);
        for (let i = 0; i < n; i++) yield* this.doSummon(ctx, me.id, args.card as string);
        break;
      }
      case 'bouncingBlade': {
        // 彈跳鋒刃：對隨機手下造成 1 點傷害，直到有手下死亡
        const src = this.dmgSource(ctx);
        const n = 1 + this.spellDamage(me.id);
        for (let i = 0; i < 80; i++) {
          const list = this.chars().filter((c) => !isHero(c) && this.alive(c) && !this.hasKw(c, 'IMMUNE') && this.pass(c, { type: 'minion' }, ctx));
          const t = pick(s, list);
          if (!t) break;
          yield* this.damage(src, t.uid, n);
          if (!this.alive(t)) break;
        }
        break;
      }
      case 'kezan': {
        // 凱贊秘術使：取得一個隨機敵方奧秘的控制權
        const sec = pick(s, foe.secrets.filter((x) => !me.secrets.some((y) => y.cardId === x.cardId)));
        if (!sec) break;
        foe.secrets = foe.secrets.filter((x) => x !== sec);
        if (me.secrets.length < MAX_SECRETS) me.secrets.push(sec);
        this.log(me.id, `${me.name}奪取了一個奧秘`);
        break;
      }
      case 'mimiron': {
        // 彌米倫之首：若你有至少 3 個機械，消滅它們並組成 V-07-TR-0N
        const mechs = me.board.filter((m) => this.alive(m) && this.isRace(m.cardId, 'MECHANICAL'));
        if (mechs.length < 3) break;
        for (const m of mechs) m.dead = true;
        yield* this.processDeaths();
        if (this.over) return;
        yield* this.summon(me.id, args.card as string);
        break;
      }
      case 'enhanceO':
        // 強化機器人：隨機賦予你的其他手下風怒、嘲諷或聖盾
        for (const m of me.board) {
          if (m.uid === ctx.sourceUid || !this.alive(m)) continue;
          const k = pick(s, ['WINDFURY', 'TAUNT', 'DIVINE_SHIELD'] as Keyword[])!;
          if (!m.keywords.includes(k)) m.keywords.push(k);
        }
        break;
      case 'blingtron':
        // 布靈登3000型：雙方各裝備一把隨機武器
        for (const p of [me, foe]) {
          const c = pick(s, this.randomPool({ type: 'WEAPON' }, p.id, false));
          if (c) yield* this.equip(p.id, c.id);
        }
        break;
      case 'psychicScream':
        // 心靈尖嘯：把所有手下洗入對手的牌堆
        for (const pl of s.players) {
          for (const m of [...pl.board]) {
            if (!this.alive(m) || this.hasKw(m, 'DORMANT')) continue;
            pl.board = pl.board.filter((x) => x !== m);
            foe.deck.splice(randomInt(s, foe.deck.length + 1), 0, this.newHandCard(m.cardId));
          }
        }
        this.recalcAuras();
        break;
      case 'attackRandomEnemy': {
        // 野蠻狗頭人：攻擊一個隨機敵人
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!m || !this.alive(m) || this.atkOf(m) <= 0) break;
        const t = pick(s, [foe.hero, ...foe.board].filter((c) => this.alive(c) && (isHero(c) || (!this.hasKw(c, 'STEALTH') && !this.hasKw(c, 'DORMANT')))));
        if (!t) break;
        yield* this.doAttack(m.uid, t.uid);
        m.attacks = Math.max(0, m.attacks - 1);
        break;
      }
      case 'branchingPaths': {
        // 尋找出路：選擇兩次（抽一張牌 / 你的手下 +1 攻擊力 / 獲得 6 點護甲值）
        let opts = BRANCHING_PATHS.filter((x) => hasCard(x));
        for (let i = 0; i < 2 && opts.length; i++) {
          const id = yield* this.choose(ctx, opts, '選擇一條路');
          opts = opts.filter((x) => x !== id);
          for (const ab of getCard(id).abilities ?? []) if (ab.on.k === 'play') yield* this.runEffects(ab.effects, ctx);
        }
        break;
      }
      case 'fillHand': {
        // 洛克德拉爾：用獵人法術填滿你的手牌
        const pool = this.randomPool(args.pool as Pool, me.id, false);
        while (me.hand.length < MAX_HAND) {
          const c = pick(s, pool);
          if (!c) break;
          this.addToHand(me, c.id);
        }
        break;
      }
      case 'discountRandom': {
        // 黯黑龍匠 / 緋紅織網者：手牌中一張隨機的武器（野獸）消耗減少
        const hc = pick(
          s,
          me.hand.filter((h) => {
            const d = this.handDef(h);
            return (!args.type || d.type === args.type) && (!args.race || this.isRace(h.cardId, args.race as Race));
          }),
        );
        if (hc) hc.costMod -= args.amount as number;
        break;
      }
      case 'ravenFamiliar': {
        // 烏鴉魔寵：雙方各揭露牌堆中的一張法術，你的消耗較高就抽出它
        const mine = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'SPELL'));
        const theirs = pick(s, foe.deck.filter((h) => getCard(h.cardId).type === 'SPELL'));
        if (mine && (!theirs || getCard(mine.cardId).cost > getCard(theirs.cardId).cost)) {
          me.deck = me.deck.filter((h) => h !== mine);
          if (me.hand.length < MAX_HAND) me.hand.push(mine);
        }
        break;
      }
      case 'twilightsCall': {
        // 暮光之喚：召喚 2 個本場死亡的友方亡語手下的 1/1 複製
        const list = [...new Set(me.graveyard.filter((id) => getCard(id).abilities?.some((a) => a.on.k === 'deathrattle')))];
        for (const id of shuffle(s, list).slice(0, 2)) {
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m) this.setStats(m, 1, 1);
        }
        break;
      }
      case 'suddenBetrayal': {
        // 臨陣倒戈：攻擊你英雄的手下改為攻擊它的一個相鄰手下
        const a = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        const n = a ? pick(s, this.adjacent(a)) : undefined;
        if (n && this.currentAttack) this.currentAttack.defender = n.uid;
        break;
      }
      case 'lynessa': {
        // 萊妮莎‧憂日：把本場對戰中對友方手下施放過的法術都施放在它身上
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self) break;
        for (const id of (me.spellsOnMinions ?? []).slice(0, 30)) {
          if (!this.minion(self.uid)) break;
          const def = getCard(id);
          const c: Ctx = { ...this.baseCtx(me.id), sourceCardId: id, isSpell: true, chosen: self.uid };
          for (const ab of def.abilities ?? []) if (ab.on.k === 'play' && (!ab.cond || this.evalCond(ab.cond, c))) yield* this.runEffects(ab.effects, c);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'identify': {
        // 未鑑定的物品：抽到時變成隨機一種版本
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        const id = pick(s, (args.cards as string[]).filter((x) => hasCard(x)));
        if (hc && id) hc.cardId = id;
        break;
      }
      case 'grumble':
        // 『世界震動者』葛蘭柏：你的其他手下回到手牌，消耗為 (1)
        for (const m of [...me.board]) {
          if (m.uid === ctx.sourceUid || !this.alive(m)) continue;
          me.board = me.board.filter((x) => x !== m);
          const hc = this.addToHand(me, m.cardId);
          if (hc) hc.costMod = 1 - getCard(m.cardId).cost;
        }
        this.recalcAuras();
        break;
      case 'recklessFlurry': {
        // 魯莽揮舞：花掉所有護甲值，對全部手下造成等量的傷害
        const n = me.hero.armor;
        me.hero.armor = 0;
        const src = this.dmgSource(ctx);
        for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c) && this.pass(c, { type: 'minion' }, ctx))) yield* this.damage(src, m.uid, n + this.spellDamage(me.id));
        break;
      }
      case 'rummagingKobold': {
        const id = pick(s, me.destroyedWeapons ?? []);
        if (id) this.addToHand(me, id);
        break;
      }
      case 'koboldIllusionist': {
        // 狗頭人幻術師：召喚手牌中一個手下的 1/1 複製
        const hc = pick(s, me.hand.filter((h) => this.handDef(h).type === 'MINION'));
        if (!hc) break;
        const m = yield* this.doSummon(ctx, me.id, hc.cardId);
        if (m && !args.full) this.setStats(m, 1, 1);
        break;
      }
      case 'castFromDeck': {
        // 古卷總管 / 托爾托朝聖者：施放牌堆中的一張法術（目標隨機）
        const spells = me.deck.filter((h) => getCard(h.cardId).type === 'SPELL');
        let hc: HandCard | undefined;
        if (args.discover) {
          const opts: HandCard[] = [];
          for (const h of shuffle(s, [...spells])) if (opts.length < 3 && !opts.some((o) => getCard(o.cardId).name === getCard(h.cardId).name)) opts.push(h);
          if (!opts.length) break;
          const id = yield* this.choose(ctx, opts.map((h) => h.cardId), '從你的牌堆發現一張法術');
          hc = opts.find((h) => h.cardId === id);
          if (args.copy) {
            yield* this.castRandomly(me.id, id);
            break;
          }
        } else hc = pick(s, spells);
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        yield* this.castRandomly(me.id, hc.cardId);
        break;
      }
      case 'destroyDeck':
        // 『吞噬者』阿薩里：摧毀對手的牌堆
        foe.deck = [];
        break;
      case 'valanyr': {
        // 瓦蘭尼珥：手牌中一個手下 +4/+2，它死亡時重新裝備這把武器
        const hc = pick(s, me.hand.filter((h) => this.handDef(h).type === 'MINION'));
        if (!hc) break;
        hc.atkBuff += 4;
        hc.hpBuff += 2;
        (hc.grant ??= []).push({ on: { k: 'deathrattle' }, effects: [{ e: 'equip', card: ctx.sourceCardId }] });
        break;
      }
      case 'discoverCast': {
        // 符文之矛：發現一張法術，以隨機目標施放
        const opts = this.discoverOptions({ type: 'SPELL' }, me.id, this.randomPool({ type: 'SPELL' }, me.id, false).filter((c) => !c.quest));
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張法術並施放');
        yield* this.castRandomly(me.id, id);
        break;
      }
      case 'doubleBattlecry':
        // 低語元素（下一個戰吼）/ 維爾納之心（本回合所有戰吼）觸發兩次
        me.doubleBattlecry = { turn: s.turn, all: !!args.all };
        break;
      case 'summonCostArmor': {
        // 地塑師伊普：召喚一個消耗等同你護甲值的隨機手下（最多 10）
        const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, me.hero.armor) }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'seepingOozeling': {
        // 滲流軟泥怪：獲得牌堆中一個隨機手下的亡語
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).abilities?.some((a) => a.on.k === 'deathrattle')));
        if (self && hc) self.abilities.push(...structuredClone((getCard(hc.cardId).abilities ?? []).filter((a) => a.on.k === 'deathrattle')));
        break;
      }
      case 'crushingWalls': {
        // 夾牆機關：消滅對手最左邊與最右邊的手下
        const list = foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'DORMANT'));
        if (list.length) list[0].dead = true;
        if (list.length > 1) list[list.length - 1].dead = true;
        break;
      }
      case 'awakenDarkness':
        // 無邊黑暗的蠟燭：喚醒對手場上的無邊黑暗
        for (const m of foe.board) {
          if (m.cardId !== args.card || !m.keywords.includes('DORMANT')) continue;
          m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
          m.sleeping = true;
          this.log(foe.id, `${this.name(m.cardId)}甦醒了！`);
        }
        break;
      case 'dormantTick': {
        // 休眠中的瑪洛尼：友方野獸死亡時倒數，歸零時甦醒
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!m || !m.keywords.includes('DORMANT')) break;
        m.counter = (m.counter ?? (args.need as number)) - 1;
        if (m.counter > 0) break;
        m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
        m.sleeping = true;
        this.log(me.id, `${this.name(m.cardId)}甦醒了！`);
        break;
      }
      case 'goDormant': {
        // 瑪洛尼：亡語：以休眠狀態回到戰場
        const m = yield* this.doSummon(ctx, me.id, ctx.sourceCardId);
        if (m) {
          m.keywords.push('DORMANT');
          m.counter = args.need as number;
        }
        break;
      }
      case 'swapAtk': {
        // 暮光侍僧：與另一個手下交換攻擊力
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!self || !m || m === self) break;
        const [a, b] = [this.atkOf(self), this.atkOf(m)];
        self.atkBuff += b - a;
        m.atkBuff += a - b;
        break;
      }
      case 'leyline':
        // 地脈操縱者：手牌中不是一開始就在牌堆裡的卡消耗減少 (2)
        for (const h of me.hand) if (!h.starting) h.costMod -= 2;
        break;
      case 'temporus':
        // 坦普拉斯：對手進行兩個回合，然後你進行兩個回合
        s.turnQueue = [foe.id, foe.id, me.id, me.id];
        break;
      case 'spitefulSummoner': {
        // 惡毒的召喚師：揭露牌堆中的一張法術，召喚一個消耗相同的隨機手下
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'SPELL'));
        if (!hc) break;
        this.log(me.id, `揭露了${this.name(hc.cardId)}`);
        const c = pick(s, this.randomPool({ type: 'MINION', cost: getCard(hc.cardId).cost }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'swapDecks':
        // 托戈瓦哥國王 / 國王的贖金：交換雙方的牌堆
        [me.deck, foe.deck] = [foe.deck, me.deck];
        if (args.ransom && hasCard(args.ransom as string)) this.addToHand(foe, args.ransom as string);
        break;
      case 'kingsbane': {
        // 王禍：把這把武器（保留攻擊力加成）洗入你的牌堆
        const w = ctx.weapon;
        if (!w) break;
        const hc = this.newHandCard(w.cardId);
        hc.atkBuff = w.atk - (getCard(w.cardId).attack ?? 0);
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        break;
      }
      case 'zephrys': {
        // 偉大的賽佛瑞斯：從經典卡中發現一張「完美的卡」
        const opts = this.discoverOptions(undefined, me.id, poolCards({ set: 3 }, me.heroClass, foe.heroClass).filter((c) => c.cardClass === 'NEUTRAL' || cardClasses(c).includes(me.heroClass)));
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '許下願望');
        this.addToHand(me, id);
        break;
      }
      case 'summonAttackChosen': {
        // 有蜜蜂！：召喚四隻 1/1 蜜蜂攻擊所選手下
        const t = ctx.chosen;
        for (let i = 0; i < (args.count as number); i++) {
          const m = yield* this.doSummon(ctx, me.id, args.card as string);
          const target = t !== null ? this.char(t) : null;
          if (!m || !target || !this.alive(target) || target.owner === me.id) continue;
          yield* this.doAttack(m.uid, target.uid);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'discoverList': {
        // 邪惡交易：從清單中發現一張卡
        const opts = shuffle(s, (args.cards as string[]).filter((x) => hasCard(x))).slice(0, 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張卡牌');
        this.addToHand(me, id);
        break;
      }
      case 'evilRecruiter': {
        // 邪惡陣線召募員：消滅一個友方跟班，召喚一個 5/5 惡魔
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m || m.owner !== me.id) break;
        m.dead = true;
        yield* this.processDeaths();
        if (this.over) return;
        yield* this.doSummon(ctx, me.id, args.card as string);
        break;
      }
      case 'discardHighest': {
        // 過期品商人：棄掉你消耗最高的卡，記住它
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!me.hand.length) break;
        const top = Math.max(...me.hand.map((h) => this.costOf(me, h)));
        const hc = pick(s, me.hand.filter((h) => this.costOf(me, h) === top))!;
        me.hand = me.hand.filter((h) => h !== hc);
        if (self) self.stash = hc.cardId;
        this.log(me.id, `${me.name}棄掉了${this.name(hc.cardId)}`);
        yield* this.discarded(me, hc);
        break;
      }
      case 'returnStash': {
        const id = ctx.sourceSnapshot?.stash;
        if (id) for (let i = 0; i < (args.count as number); i++) this.addToHand(me, id);
        break;
      }
      case 'lackeys44':
        me.lackeys44 = true;
        for (const h of me.hand) if (getCard(h.cardId).nameEn.includes('Lackey')) h.atkBuff = h.hpBuff = 3;
        break;
      case 'setItHealth': {
        // 高階祭司阿密特：召喚的手下生命值變得等同此手下
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!self || !m || m === self) break;
        m.maxHp = m.hp = self.hp;
        break;
      }
      case 'shuffleSelf': {
        // 魔法幻象：把此手下洗入你的牌堆
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!m) break;
        me.board = me.board.filter((x) => x !== m);
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(m.cardId));
        this.recalcAuras();
        break;
      }
      case 'fallAsleep': {
        // 曬昏頭的嘍囉：50% 機率睡著（本回合無法攻擊）
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (m && nextRandom(s) < 0.5) {
          m.sleeping = true;
          this.log(me.id, `${this.name(m.cardId)}睡著了`);
        }
        break;
      }
      case 'bloodstinger': {
        // 野生血刺蠍：從對手的手牌召喚一個手下，並攻擊它
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const hc = pick(s, foe.hand.filter((h) => this.handDef(h).type === 'MINION'));
        if (!hc || foe.board.length >= MAX_BOARD) break;
        foe.hand = foe.hand.filter((h) => h !== hc);
        const m = this.makeMinion(foe.id, hc.cardId, hc);
        foe.board.push(m);
        this.recalcAuras();
        yield* this.emit({ k: 'summon', player: foe.id, subject: m.uid, races: getCard(hc.cardId).races });
        if (self && this.alive(self) && this.alive(m)) {
          yield* this.doAttack(self.uid, m.uid);
          self.attacks = Math.max(0, self.attacks - 1);
        }
        break;
      }
      case 'puzzleBox':
        // 尤格薩倫的解謎箱：施放 10 個隨機法術（目標隨機）
        for (let i = 0; i < 10; i++) {
          const c = pick(s, poolCards({ type: 'SPELL' }, me.heroClass, foe.heroClass).filter((x) => !x.quest && x.id !== ctx.sourceCardId));
          if (c) yield* this.castRandomly(me.id, c.id);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      case 'mischiefMaker': {
        // 淘氣鬼：交換雙方牌堆頂的卡
        const a = me.deck.pop();
        const b = foe.deck.pop();
        if (b) me.deck.push(b);
        if (a) foe.deck.push(a);
        break;
      }
      case 'shadowOfDeath': {
        // 死亡魔影：把 3 張會召喚所選手下複製的暗影洗入你的牌堆
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        for (let i = 0; i < 3; i++) {
          const hc = this.newHandCard(args.card as string);
          hc.shadowOf = m.cardId;
          me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        }
        break;
      }
      case 'shadowSummon':
        if (ctx.drawnCard?.shadowOf) yield* this.doSummon(ctx, me.id, ctx.drawnCard.shadowOf);
        break;
      case 'anka':
        // 『下葬者』安卡：手牌中的亡語手下變成消耗 (1) 的 1/1
        for (const h of me.hand) {
          const def = this.handDef(h);
          if (def.type !== 'MINION' || !def.abilities?.some((a) => a.on.k === 'deathrattle')) continue;
          h.atkBuff = 1 - (def.attack ?? 0);
          h.hpBuff = 1 - (def.health ?? 0);
          h.costMod = 1 - def.cost;
        }
        break;
      case 'kingPhaoris':
        // 法歐瑞斯王：手牌中每有一張法術，召喚一個消耗相同的隨機手下
        for (const h of [...me.hand]) {
          if (this.handDef(h).type !== 'SPELL') continue;
          const c = pick(s, this.randomPool({ type: 'MINION', cost: this.handDef(h).cost }, me.id, false));
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      case 'splittingAxe':
        // 裂劈斧：召喚你的圖騰的複製
        for (const m of [...me.board]) if (this.alive(m) && this.isRace(m.cardId, 'TOTEM')) yield* this.doSummon(ctx, me.id, m.cardId);
        break;
      case 'setSpellCost':
        // 納迦沙巫：手牌中法術的消耗變成 (5)
        for (const h of me.hand) if (this.handDef(h).type === 'SPELL') h.costMod = (args.cost as number) - this.handDef(h).cost;
        break;
      case 'finley': {
        // 沙漠爵士芬利：發現一個強化後的英雄能力
        const opts = shuffle(s, Object.values(UPGRADED_POWER_IDS).filter((id) => hasCard(id))).slice(0, 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個英雄能力');
        this.setHeroPower(me, id);
        break;
      }
      case 'moguCultist': {
        // 魔古教徒：場上全是魔古教徒時，獻祭它們召喚高階守護者拉
        if (me.board.length < MAX_BOARD || !me.board.every((m) => m.cardId === ctx.sourceCardId)) break;
        for (const m of me.board) m.dead = true;
        yield* this.processDeaths();
        if (this.over) return;
        yield* this.summon(me.id, args.card as string);
        break;
      }
      case 'blatantDecoy':
        // 超顯眼的誘餌：雙方各從手牌召喚消耗最低的手下
        for (const who of ['self', 'opponent']) yield* this.custom('summonFromHand', { who, lowest: true }, ctx);
        break;
      case 'plagueOfFlames': {
        // 火焰災禍：消滅你所有的手下，每消滅一個就消滅一個隨機敵方手下
        const mine = me.board.filter((m) => this.alive(m) && !this.hasKw(m, 'DORMANT'));
        for (const m of mine) m.dead = true;
        for (const m of shuffle(s, foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'DORMANT'))).slice(0, mine.length)) m.dead = true;
        break;
      }
      case 'plagueOfDeath':
        // 死亡災禍：沉默並消滅所有手下
        for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c) && this.pass(c, { type: 'minion' }, ctx)) as Minion[]) {
          this.silence(m);
          m.dead = true;
        }
        break;
      case 'duplicateHand':
        // 『啟迪者』伊莉絲：複製你的手牌
        for (const h of [...me.hand]) if (me.hand.length < MAX_HAND) me.hand.push({ ...structuredClone(h), uid: this.uid() });
        break;
      case 'copyRandomInHand': {
        // 蘭姆卡韓馴獸師：複製手牌中一張隨機野獸
        const hc = pick(s, me.hand.filter((h) => this.handDef(h).type === 'MINION' && this.isRace(h.cardId, args.race as Race)));
        if (hc && me.hand.length < MAX_HAND) me.hand.push({ ...structuredClone(hc), uid: this.uid() });
        break;
      }
      case 'emperorWraps': {
        // 帝王裹布：召喚一個友方手下的 2/2 複製
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const c = yield* this.doSummon(ctx, me.id, m.cardId);
        if (c) this.setStats(c, (args.atk as number) ?? 2, (args.hp as number) ?? 2);
        break;
      }
      case 'obeliskEye': {
        // 方尖碑之眼：恢復 3 點生命值；若目標是手下，再賦予 +3/+3
        const c = ctx.chosen !== null ? this.char(ctx.chosen) : null;
        if (!c) break;
        yield* this.heal(c.uid, 3 * 2 ** this.flagCount('heroPowerDouble', me.id));
        if (!isHero(c)) yield* this.runEffect({ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }, ctx);
        break;
      }
      case 'drawSetCost': {
        // 神奇魔杖：抽 3 張牌，將其消耗改為 (1)
        const drawn = yield* this.draw(me, args.count as number);
        for (const h of drawn) h.costMod = (args.cost as number) - this.handDef(h).cost;
        break;
      }
      case 'tolinsGoblet': {
        // 托林的酒杯：抽一張牌，用它的複製填滿你的手牌
        const [hc] = yield* this.draw(me, 1);
        while (hc && me.hand.length < MAX_HAND) me.hand.push({ ...structuredClone(hc), uid: this.uid() });
        break;
      }
      case 'zarogsCrown': {
        // 札羅格的王冠：發現一個傳說手下，召喚兩個它的複製
        const opts = this.discoverOptions({ type: 'MINION', rarity: 'LEGENDARY' }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個傳說手下');
        for (let i = 0; i < 2; i++) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'goldenKobold': {
        // 金狗頭人：把你的手牌換成傳說手下
        const n = me.hand.length;
        me.hand = [];
        for (let i = 0; i < n; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', rarity: 'LEGENDARY' }, me.id, true));
          if (c) this.addToHand(me, c.id);
        }
        break;
      }
      case 'destroyEnemySecrets':
        // 總督察：摧毀所有敵方奧秘
        if (foe.secrets.length) this.log(me.id, `摧毀了 ${foe.secrets.length} 個敵方奧秘`);
        foe.secrets = [];
        break;
      case 'experimenter': {
        // 地精實驗家：抽一張牌，若是手下就變成雞
        const [hc] = yield* this.draw(me, 1);
        if (hc && getCard(hc.cardId).type === 'MINION' && hasCard(args.card as string)) {
          hc.cardId = args.card as string;
          hc.costMod = hc.atkBuff = hc.hpBuff = 0;
        }
        break;
      }
      case 'skulkingGeist':
        // 潛伏的魂屍：摧毀雙方手牌與牌堆中所有 1 費法術
        for (const pl of s.players) {
          const keep = (h: HandCard) => !(getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).cost === 1);
          pl.hand = pl.hand.filter(keep);
          pl.deck = pl.deck.filter(keep);
        }
        break;
      case 'discountSelfInHand': {
        // 坑道蠕蟲：在手牌中時消耗減少
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        if (hc) hc.costMod -= args.amount as number;
        break;
      }
      case 'sonya': {
        // 索妮雅‧影舞者：把死亡的友方手下的 1/1 複製加入手牌，其消耗為 (1)
        if (!ctx.itCardId) break;
        const hc = this.addToHand(me, ctx.itCardId);
        if (!hc) break;
        const def = getCard(ctx.itCardId);
        hc.atkBuff = 1 - (def.attack ?? 0);
        hc.hpBuff = 1 - (def.health ?? 0);
        hc.costMod = 1 - def.cost;
        break;
      }
      case 'copyChosenStats': {
        // 暗影藥劑：召喚所選手下的 1/1 複製
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const c = yield* this.doSummon(ctx, me.id, m.cardId);
        if (c) this.setStats(c, args.atk as number, args.hp as number);
        break;
      }
      case 'stormcaller':
        // 風剪風暴召喚者：若你控制全部 4 種基本圖騰，召喚『馭風者』奧拉基爾
        if (BASIC_TOTEMS.every((t) => me.board.some((m) => m.cardId === t && this.alive(m)))) yield* this.doSummon(ctx, me.id, args.card as string);
        break;
      case 'equipOpponent':
        yield* this.equip(foe.id, args.card as string);
        break;
      // ------------------------------------------------------------ 爆爆計畫 / 探險者協會 / 拉斯塔哈 / 安戈洛 / 迦拉克隆的覺醒
      case 'adapt': {
        // 演化：從三種能力中選一種（times 次），賦予目標
        const targets: Minion[] =
          args.target === 'chosen'
            ? [ctx.chosen !== null ? this.minion(ctx.chosen) : null].filter((m): m is Minion => !!m)
            : args.target === 'friendly'
              ? me.board.filter((m) => this.alive(m) && (!args.race || this.isRace(m.cardId, args.race as Race)) && (!args.nameIncludes || getCard(m.cardId).nameEn.includes(args.nameIncludes as string)))
              : [ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null].filter((m): m is Minion => !!m);
        if (!targets.length) break;
        for (let i = 0; i < ((args.times as number) ?? 1); i++) {
          const opts = shuffle(s, ADAPTATIONS.filter((x) => hasCard(x))).slice(0, 3);
          if (!opts.length) break;
          const id = yield* this.choose(ctx, opts, '演化');
          for (const m of targets) if (this.minion(m.uid)) this.applyAdaptation(m, id);
        }
        break;
      }
      case 'fireworks': {
        // 煙火技師：賦予友方機械 +1/+1，若有亡語就觸發
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        yield* this.runEffect({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 }, ctx);
        if (!m.silenced && m.abilities.some((a) => a.on.k === 'deathrattle')) yield* this.runDeathrattles(m);
        break;
      }
      case 'academicEspionage':
        // 學術間諜：把 10 張對手職業的卡洗入你的牌堆，消耗為 (1)
        for (let i = 0; i < 10; i++) {
          const c = pick(s, this.randomPool({ cls: 'opponent' }, me.id, false));
          if (!c) break;
          const hc = this.newHandCard(c.id);
          hc.costMod = 1 - c.cost;
          me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        }
        break;
      case 'drawRest':
        // 麥菈的不穩定元素：抽完你的牌堆
        yield* this.draw(me, me.deck.length);
        break;
      case 'myraRotspring': {
        // 麥菈‧腐泉：發現一個亡語手下，並獲得它的亡語
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const opts = this.discoverOptions({ type: 'MINION', hasDeathrattle: true }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個亡語手下');
        this.addToHand(me, id);
        if (self) self.abilities.push(...structuredClone((getCard(id).abilities ?? []).filter((a) => a.on.k === 'deathrattle')));
        break;
      }
      case 'unexpectedResults':
        // 無法預期的成果：召喚兩個隨機的 2 費手下（法術傷害提高費用）
        for (let i = 0; i < 2; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, 2 + this.spellDamage(me.id)) }, me.id, false));
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      case 'setDeckCost':
        // 露娜的口袋銀河 / 『跺地者』巴納布斯：牌堆中手下的消耗變成固定值
        for (const h of me.deck) if (getCard(h.cardId).type === 'MINION') h.costMod = (args.cost as number) - getCard(h.cardId).cost;
        break;
      case 'resummonIfSpells':
        // 複製大師澤瑞克：若你對它施放過法術，讓它復活
        if (ctx.sourceSnapshot?.spellsOn?.length) yield* this.doSummon(ctx, me.id, ctx.sourceCardId);
        break;
      case 'spellsOnTo': {
        // 受試者 / 原魚勇士：把對它施放過的法術洗入牌堆（或放回手牌）
        for (const id of ctx.sourceSnapshot?.spellsOn ?? []) {
          if (args.hand) this.addToHand(me, id);
          else me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(id));
        }
        break;
      }
      case 'buffLeftmost': {
        // 靈魂灌注：你手牌最左邊的手下 +2/+2
        const hc = me.hand.find((h) => this.handDef(h).type === 'MINION');
        if (hc) {
          hc.atkBuff += args.atk as number;
          hc.hpBuff += args.hp as number;
        }
        break;
      }
      case 'summonItCopy': {
        // 全像術師：召喚對手打出的手下的 1/1 複製
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!m) break;
        const c = yield* this.doSummon(ctx, me.id, m.cardId);
        if (c) this.setStats(c, args.atk as number, args.hp as number);
        break;
      }
      case 'pogoHopper': {
        // 蹦蹦兔：本場每打出過一隻其他蹦蹦兔，+2/+2
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const n = (me.playedCards ?? []).filter((id) => getCard(id).nameEn === getCard(ctx.sourceCardId).nameEn).length - 1;
        if (self && n > 0) {
          self.atkBuff += 2 * n;
          self.maxHp += 2 * n;
          self.hp += 2 * n;
        }
        break;
      }
      case 'supercollider': {
        // 超級對撞器：在你攻擊手下後，迫使它攻擊一個相鄰的手下
        const d = this.lastAttack && !this.lastAttack.defenderIsHero ? this.minion(this.lastAttack.defender) : null;
        const n = d && this.alive(d) ? pick(s, this.adjacent(d).filter((x) => this.alive(x))) : undefined;
        if (d && n) yield* this.forceAttack(d, n);
        break;
      }
      case 'ifItHasOverload':
        if (ctx.itCardId && getCard(ctx.itCardId).overload) yield* this.runEffects(args.then as Effect[], ctx);
        break;
      case 'doubleSpell':
        me.doubleSpellTurn = s.turn;
        break;
      case 'nextSpellPower':
        me.nextSpellPower = { turn: s.turn, amount: args.amount as number };
        break;
      case 'spellLifesteal':
        me.spellLifestealTurn = s.turn;
        break;
      case 'healDamage':
        me.healDamageTurn = s.turn;
        break;
      case 'powerDamageBonus':
        me.powerDamageBonus = { turn: s.turn, amount: args.amount as number };
        break;
      case 'powerFree':
        me.powerFreeTurn = s.turn;
        break;
      case 'destroyEnemyHero':
        foe.hero.hp = 0;
        break;
      case 'boomZooka': {
        // 弗拉克的爆爆火箭炮：從牌堆召喚 3 個手下，攻擊敵方手下後死亡
        for (let i = 0; i < 3; i++) {
          const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
          if (!hc) break;
          me.deck = me.deck.filter((h) => h !== hc);
          const m = yield* this.doSummon(ctx, me.id, hc.cardId);
          if (!m) continue;
          const t = pick(s, foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'DORMANT')));
          if (t) yield* this.forceAttack(m, t);
          m.dead = true;
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'drMorrigan': {
        // 莫莉根博士：與牌堆中的一個手下交換
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(ctx.sourceCardId));
        yield* this.doSummon(ctx, me.id, hc.cardId);
        break;
      }
      case 'floop': {
        // 黏糊糊的弗洛普：變成你上一個打出的手下的 3/4 複製（並觸發其戰吼）
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const last = [...(me.playedCards ?? [])].reverse().find((id, i) => i > 0 && getCard(id).type === 'MINION' && getCard(id).nameEn !== getCard(ctx.sourceCardId).nameEn);
        if (!self || !last) break;
        const board = me.board;
        const idx = board.indexOf(self);
        this.transform(self.uid, last);
        const m = board[idx];
        if (!m) break;
        this.setStats(m, 3, 4);
        yield* this.repeatBattlecry(me.id, m.uid, last);
        break;
      }
      case 'prismaticLens': {
        // 稜彩鏡片：抽一張手下與一張法術，交換它們的消耗
        const [m] = yield* this.draw(me, 1, { type: 'MINION' });
        const [sp] = yield* this.draw(me, 1, { type: 'SPELL' });
        if (!m || !sp) break;
        const [a, b] = [this.costOf(me, m), this.costOf(me, sp)];
        m.costMod += b - a;
        sp.costMod += a - b;
        break;
      }
      case 'refreshOnDeath':
        // 弗洛普的神奇黏液：本回合每有手下死亡，回復一個法力水晶
        (me.eternal ??= []).push({
          ability: { on: { k: 'minionDied', side: 'any' }, effects: [{ e: 'mana', kind: 'refresh', amount: 1 }] },
          sourceCardId: ctx.sourceCardId,
          turn: s.turn,
        });
        break;
      case 'copyAdjacent': {
        // 黏液噴灑者：召喚相鄰手下的複製
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self) break;
        for (const n of this.adjacent(self)) {
          const c = yield* this.doSummon(ctx, me.id, n.cardId);
          if (c) this.copyStats(n, c);
        }
        break;
      }
      case 'summonCopiesRace':
        // 煉魂術：召喚你控制的所有惡魔的複製
        for (const m of me.board.filter((x) => this.alive(x) && this.isRace(x.cardId, args.race as Race))) {
          const c = yield* this.doSummon(ctx, me.id, m.cardId);
          if (c) this.copyStats(m, c);
        }
        break;
      case 'omegaAssembly': {
        // 奧米伽組裝：發現一個機械；若你有 10 個法力水晶，三張都拿
        const opts = this.discoverOptions({ type: 'MINION', race: 'MECHANICAL' }, me.id);
        if (!opts.length) break;
        if (me.maxMana >= 10) {
          for (const id of opts) this.addToHand(me, id);
          break;
        }
        this.addToHand(me, yield* this.choose(ctx, opts, '發現一個機械'));
        break;
      }
      case 'becomeIt': {
        // 星穹使者塞蕾西亞：變成對手打出的手下的複製
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!self || !m) break;
        const board = me.board;
        const idx = board.indexOf(self);
        this.transform(self.uid, m.cardId);
        if (board[idx]) this.copyStats(m, board[idx]);
        break;
      }
      case 'cloningGallery':
        // 澤瑞克的複製收藏：召喚牌堆中每個手下的 1/1 複製
        for (const h of [...me.deck]) {
          if (getCard(h.cardId).type !== 'MINION' || me.board.length >= MAX_BOARD) continue;
          const m = yield* this.doSummon(ctx, me.id, h.cardId);
          if (m) this.setStats(m, 1, 1);
        }
        break;
      case 'drawTemporary': {
        // 靈魂收藏器：抽 3 張暫時的卡
        const drawn = yield* this.draw(me, args.count as number);
        for (const h of drawn) h.temporary = true;
        break;
      }
      case 'drawDifferentSecrets': {
        // 實驗體九號：從牌堆抽 5 張不同的奧秘
        const names = new Set<string>();
        for (const h of shuffle(s, me.deck.filter((x) => getCard(x.cardId).secret))) {
          if (names.size >= 5 || names.has(getCard(h.cardId).name)) continue;
          names.add(getCard(h.cardId).name);
          me.deck = me.deck.filter((x) => x !== h);
          if (me.hand.length < MAX_HAND) me.hand.push(h);
        }
        break;
      }
      case 'discountHandRace':
        // 導電機器人 / 火羽先驅者：手牌中的機械（元素）消耗減少
        for (const h of me.hand) if (this.handDef(h).type === 'MINION' && this.isRace(h.cardId, args.race as Race)) h.costMod -= args.amount as number;
        break;
      case 'demonicProject':
        // 惡魔研究計畫：雙方各把手牌中一個隨機手下變成惡魔
        for (const p of [me, foe]) {
          const hc = pick(s, p.hand.filter((h) => this.handDef(h).type === 'MINION'));
          const c = pick(s, this.randomPool({ type: 'MINION', race: 'DEMON', anyClass: true }, p.id, true));
          if (hc && c) {
            hc.cardId = c.id;
            hc.costMod = hc.atkBuff = hc.hpBuff = 0;
          }
        }
        break;
      case 'discoverBasicPower': {
        // 芬利‧莫戈頓爵士：發現一個新的基本英雄能力
        const opts = shuffle(s, Object.values(HEROES).map((h) => h.power.id).filter((id) => id !== me.heroPower.id && hasCard(id))).slice(0, 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個英雄能力');
        me.heroPower = { id, used: false, uses: 0, cost: Object.values(HEROES).find((h) => h.power.id === id)?.power.cost ?? 2 };
        break;
      }
      case 'replaceWithLegendaries':
        // 金猴：把你的手牌與牌堆換成傳說手下
        for (const list of [me.hand, me.deck]) {
          for (const h of list) {
            const c = pick(s, this.randomPool({ type: 'MINION', rarity: 'LEGENDARY' }, me.id, true));
            if (c) {
              h.cardId = c.id;
              h.costMod = h.atkBuff = h.hpBuff = 0;
            }
          }
        }
        break;
      case 'copyDeathrattle': {
        // 迅猛龍化石：獲得所選友方手下的亡語
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (self && m && !m.silenced) self.abilities.push(...structuredClone(m.abilities.filter((a) => a.on.k === 'deathrattle')));
        break;
      }
      case 'desertCamel':
        // 沙漠駱駝：雙方各把牌堆中一個 1 費手下放到戰場上
        for (const p of [me, foe]) {
          const hc = pick(s, p.deck.filter((h) => getCard(h.cardId).type === 'MINION' && getCard(h.cardId).cost === 1));
          if (!hc || p.board.length >= MAX_BOARD) continue;
          p.deck = p.deck.filter((h) => h !== hc);
          yield* this.summon(p.id, hc.cardId);
        }
        break;
      case 'anyfin': {
        // 死魚翻身：召喚本場對戰中死亡的 7 個魚人
        const list = s.players.flatMap((pl) => pl.graveyard).filter((id) => this.isRace(id, 'MURLOC'));
        for (const id of shuffle(s, list).slice(0, 7)) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'entomb': {
        // 入葬：把一個敵方手下洗入你的牌堆
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        const owner = s.players[m.owner];
        owner.board = owner.board.filter((x) => x !== m);
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(m.cardId));
        this.recalcAuras();
        break;
      }
      case 'recastOnSelf': {
        // 西風巨靈：你對另一個友方手下施放法術後，也對它施放
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const t = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!self || !t || t === self || t.owner !== me.id || !ctx.itCardId) break;
        yield* this.castAt(me.id, ctx.itCardId, self.uid);
        break;
      }
      case 'zentimo': {
        // 贊提莫：你對手下施放法術後，對它的相鄰手下再施放一次
        const t = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!t || !ctx.itCardId) break;
        for (const n of this.adjacent(t)) yield* this.castAt(me.id, ctx.itCardId, n.uid);
        break;
      }
      case 'voraxx': {
        // 沃雷司：你對它施放法術後，召喚一個 1/1 植物並對它施放複製
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!self || ctx.it?.kind !== 'char' || ctx.it.uid !== self.uid || !ctx.itCardId) break;
        const plant = yield* this.doSummon(ctx, me.id, args.card as string);
        if (plant) yield* this.castAt(me.id, ctx.itCardId, plant.uid);
        break;
      }
      case 'mastersCall': {
        // 主人的呼喚：從牌堆發現一個手下；若三個都是野獸，全部抽出
        const opts: HandCard[] = [];
        for (const h of shuffle(s, me.deck.filter((x) => getCard(x.cardId).type === 'MINION'))) if (opts.length < 3 && !opts.some((o) => getCard(o.cardId).name === getCard(h.cardId).name)) opts.push(h);
        if (!opts.length) break;
        const take = (h: HandCard) => {
          me.deck = me.deck.filter((x) => x !== h);
          if (me.hand.length < MAX_HAND) me.hand.push(h);
        };
        if (opts.every((h) => this.isRace(h.cardId, 'BEAST'))) {
          opts.forEach(take);
          break;
        }
        const id = yield* this.choose(ctx, opts.map((h) => h.cardId), '從你的牌堆發現一個手下');
        take(opts.find((h) => h.cardId === id)!);
        break;
      }
      case 'returnPrevSpells':
        // 『巨蛙』奎格瓦：把你上個回合施放的法術放回手牌
        for (const id of me.prevTurnSpells ?? []) this.addToHand(me, id);
        break;
      case 'fillHandWith':
        // 『山貓』哈拉齊：用某張卡填滿你的手牌
        while (me.hand.length < MAX_HAND) this.addToHand(me, args.card as string);
        break;
      case 'drawSpellCostPlus': {
        // 青蛙之靈：從牌堆抽一張消耗多 (1) 的法術
        const cost = (ctx.itCardId ? getCard(ctx.itCardId).cost : 0) + 1;
        yield* this.draw(me, 1, { type: 'SPELL', cost });
        break;
      }
      case 'hypemon': {
        // 古拉巴什鼓譟者：發現一張戰吼手下的 1/1 複製，其消耗為 (1)
        const opts = this.discoverOptions({ type: 'MINION', hasBattlecry: true }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張戰吼手下');
        const hc = this.addToHand(me, id);
        if (hc) {
          const def = getCard(id);
          hc.atkBuff = 1 - (def.attack ?? 0);
          hc.hpBuff = 1 - (def.health ?? 0);
          hc.costMod = 1 - def.cost;
        }
        break;
      }
      case 'summonCostPlus': {
        // 大巫毒儀式：亡語：召喚一個消耗多 (1) 的隨機手下
        const cost = getCard(ctx.sourceCardId).cost + ((args.n as number) ?? 1);
        const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, cost) }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'griftah': {
        // 格利夫塔：發現兩張卡，隨機把其中一張給對手
        const picks: string[] = [];
        for (let i = 0; i < 2; i++) {
          const opts = this.discoverOptions(undefined, me.id);
          if (opts.length) picks.push(yield* this.choose(ctx, opts, '發現一張卡牌'));
        }
        const give = randomInt(s, picks.length);
        picks.forEach((id, i) => this.addToHand(i === give ? foe : me, id));
        break;
      }
      case 'beastWithin': {
        // 獸心：賦予友方野獸 +1/+1，然後讓它攻擊一個隨機敵方手下
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        yield* this.runEffect({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 }, ctx);
        const t = pick(s, foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'DORMANT')));
        if (t) yield* this.forceAttack(m, t);
        break;
      }
      case 'recruitRush':
        // 鉤牙船長：從牌堆召喚 3 個海盜，賦予突襲
        for (let i = 0; i < (args.count as number); i++) {
          const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, args.race as Race)));
          if (!hc || me.board.length >= MAX_BOARD) break;
          me.deck = me.deck.filter((h) => h !== hc);
          const m = yield* this.doSummon(ctx, me.id, hc.cardId);
          if (m && !m.keywords.includes('RUSH')) m.keywords.push('RUSH');
        }
        break;
      case 'ifHeroKilled':
        // 迅猛龍之靈 / 『迅猛龍』剛克：你的英雄攻擊並消滅手下後
        if (this.lastAttack?.killed && this.lastAttack.attacker === me.hero.uid) yield* this.runEffects(args.then as Effect[], ctx);
        break;
      case 'heroAttackAgain':
        me.hero.attacks = Math.max(0, me.hero.attacks - 1);
        break;
      case 'drawDoubleHealth': {
        // 掠食本能：從牌堆抽一個野獸，生命值加倍
        const [hc] = yield* this.draw(me, 1, { type: 'MINION', race: 'BEAST' });
        if (hc) hc.hpBuff += this.handStats(me.id, hc).hp;
        break;
      }
      case 'discardLowest':
        // 尖嘯 / 魯莽的兇暴食人妖 / 拉卡利惡魔犬：棄掉消耗最低的卡
        for (let i = 0; i < ((args.count as number) ?? 1) && me.hand.length; i++) {
          const low = Math.min(...me.hand.map((h) => this.costOf(me, h)));
          const hc = pick(s, me.hand.filter((h) => this.costOf(me, h) === low))!;
          me.hand = me.hand.filter((h) => h !== hc);
          this.log(me.id, `${me.name}棄掉了${this.name(hc.cardId)}`);
          yield* this.discarded(me, hc);
        }
        break;
      case 'voidContract':
        // 虛無契約：摧毀雙方牌堆的一半
        for (const pl of s.players) {
          const drop = new Set(shuffle(s, [...pl.deck]).slice(0, Math.ceil(pl.deck.length / 2)));
          pl.deck = pl.deck.filter((h) => !drop.has(h));
        }
        break;
      case 'addDiscarded':
        // 靈魂看守者：把 3 張本場對戰中棄掉的卡加入手牌
        for (const id of shuffle(s, [...(me.discardedCards ?? [])]).slice(0, args.count as number)) this.addToHand(me, id);
        break;
      case 'fillBoardCopies': {
        // 『蝙蝠』希爾雷克：用此手下的複製填滿你的場面
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        while (self && me.board.length < MAX_BOARD) {
          const c = yield* this.doSummon(ctx, me.id, self.cardId);
          if (!c) break;
          this.copyStats(self, c);
        }
        break;
      }
      case 'massHysteria': {
        // 集體恐慌：迫使每個手下攻擊另一個隨機手下
        const list = shuffle(s, this.chars().filter((c) => !isHero(c) && this.alive(c) && !this.hasKw(c, 'DORMANT')) as Minion[]);
        for (const m of list) {
          if (!this.alive(m)) continue;
          const t = pick(s, this.chars().filter((c) => !isHero(c) && c !== m && this.alive(c) && !this.hasKw(c, 'DORMANT')) as Minion[]);
          if (t) yield* this.forceAttack(m, t);
        }
        break;
      }
      case 'bwonsamdi':
        // 『亡者』伯昂撒姆第：從牌堆抽 1 費手下，直到手牌滿
        while (me.hand.length < MAX_HAND) {
          const [hc] = yield* this.draw(me, 1, { type: 'MINION', cost: 1 });
          if (!hc) break;
        }
        break;
      case 'thekal':
        // 高階祭司塞卡爾：把英雄除了 1 點以外的生命值轉換成護甲值
        if (me.hero.hp > 1) {
          me.hero.armor += me.hero.hp - 1;
          me.hero.hp = 1;
          me.heroHealthChangedTurn = s.turn;
        }
        break;
      case 'summonTiger': {
        // 猛虎之靈：召喚一隻數值等同法術消耗的老虎
        const n = ctx.itCardId ? getCard(ctx.itCardId).cost : 0;
        const m = n > 0 ? yield* this.doSummon(ctx, me.id, args.card as string) : null;
        if (m) this.setStats(m, n, n);
        break;
      }
      case 'copyHandRace':
        // 戰爭指揮官沃恩：複製手牌中所有的龍
        for (const h of [...me.hand]) if (this.isRace(h.cardId, args.race as Race) && me.hand.length < MAX_HAND) me.hand.push({ ...structuredClone(h), uid: this.uid() });
        break;
      case 'transformNamed':
        // 樹語者：把你的樹人變成 5/5 古樹
        for (const m of [...me.board]) if (this.alive(m) && getCard(m.cardId).nameEn.includes(args.nameIncludes as string)) this.transform(m.uid, args.card as string);
        break;
      case 'gralEat': {
        // 『鯊魚』格拉爾：吃掉牌堆中的一個手下並獲得其數值
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!self || !hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        const def = getCard(hc.cardId);
        self.atkBuff += (def.attack ?? 0) + hc.atkBuff;
        self.maxHp += (def.health ?? 0) + hc.hpBuff;
        self.hp += (def.health ?? 0) + hc.hpBuff;
        self.stash = hc.cardId;
        break;
      }
      case 'shuffleItCost1': {
        // 亡者之靈：把死亡的友方手下的 1 費複製洗入你的牌堆
        if (!ctx.itCardId) break;
        const hc = this.newHandCard(ctx.itCardId);
        hc.costMod = 1 - getCard(ctx.itCardId).cost;
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        break;
      }
      case 'copyFromEachOpp':
        // 德拉克瑞欺詐者：雙方各獲得對手牌堆中一張隨機卡的複製
        for (const [p, q] of [[me, foe], [foe, me]] as const) {
          const hc = pick(s, q.deck);
          const got = hc ? this.addToHand(p, hc.cardId) : null;
          if (got) got.fromOpp = true;
        }
        break;
      case 'undatakah': {
        // 送葬者：獲得 3 個本場死亡的友方手下的亡語
        const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        const list = me.graveyard.filter((id) => getCard(id).abilities?.some((a) => a.on.k === 'deathrattle'));
        if (!self) break;
        for (const id of shuffle(s, [...list]).slice(0, 3)) self.abilities.push(...structuredClone((getCard(id).abilities ?? []).filter((a) => a.on.k === 'deathrattle')));
        break;
      }
      case 'corruptedBlood': {
        // 腐敗之血：受到 3 點傷害，再把兩張洗入你的牌堆
        yield* this.damage({ owner: foe.id, uid: null }, me.hero.uid, 3);
        for (let i = 0; i < 2; i++) me.deck.splice(randomInt(s, me.deck.length + 1), 0, this.newHandCard(ctx.sourceCardId));
        break;
      }
      case 'shuffleEachDeck':
        for (const pl of s.players) pl.deck.splice(randomInt(s, pl.deck.length + 1), 0, this.newHandCard(args.card as string));
        break;
      case 'setMana':
        // 魔精大師吉西：雙方的法力水晶設為 5 個
        for (const pl of s.players) {
          pl.maxMana = args.n as number;
          pl.mana = Math.min(pl.mana, pl.maxMana);
        }
        break;
      case 'summonDiedThisTurn': {
        // 復仇獸群：召喚本回合死亡的友方野獸
        const ids = me.diedThisTurn?.turn === s.turn ? me.diedThisTurn.ids.filter((id) => !args.race || this.isRace(id, args.race as Race)) : [];
        for (const id of ids) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'addItCost0': {
        // 法力連結：把對手施放的法術的複製加入手牌，消耗為 (0)
        if (!ctx.itCardId) break;
        const hc = this.addToHand(me, ctx.itCardId);
        if (hc) hc.costMod = -getCard(ctx.itCardId).cost;
        break;
      }
      case 'extraTurn':
        // 時光扭曲：進行一個額外的回合
        (s.turnQueue ??= []).unshift(me.id);
        break;
      case 'glimmerroot': {
        // 好奇的亮根草：猜猜看哪一張一開始在對手的牌堆裡，猜對就得到它
        const real = pick(s, [...foe.deck, ...foe.hand].filter((h) => h.starting));
        if (!real) break;
        const fakes = shuffle(s, this.randomPool({ cls: foe.heroClass }, me.id, false).filter((c) => c.name !== getCard(real.cardId).name)).slice(0, 2).map((c) => c.id);
        const opts = shuffle(s, [real.cardId, ...fakes]);
        const id = yield* this.choose(ctx, opts, '哪一張一開始在對手的牌堆裡？');
        if (id === real.cardId) this.addToHand(me, id);
        else this.log(me.id, '猜錯了！');
        break;
      }
      case 'ravenousPterrordax': {
        // 飢餓的翼手龍：消滅一個友方手下，演化兩次
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m || m.uid === ctx.sourceUid) break;
        m.dead = true;
        yield* this.custom('adapt', { times: 2 }, ctx);
        break;
      }
      case 'wakeAfterCards': {
        // 『食屍魔花』榭拉辛：一個回合打出 4 張牌後甦醒
        const m = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
        if (!m || !m.keywords.includes('DORMANT') || me.cardsPlayedThisTurn < (args.n as number)) break;
        m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
        m.sleeping = true;
        this.log(me.id, `${this.name(m.cardId)}甦醒了！`);
        break;
      }
      case 'minions55':
        me.minions55 = true;
        for (const m of me.board) if (this.alive(m)) this.setStats(m, 5, 5);
        break;
      case 'earthenScales': {
        // 地化鱗片：賦予友方手下 +1/+1，再獲得等同其攻擊力的護甲值
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!m) break;
        yield* this.runEffect({ e: 'buff', target: { t: 'chosen' }, atk: 1, hp: 1 }, ctx);
        yield* this.runEffect({ e: 'armor', amount: this.atkOf(m) }, ctx);
        break;
      }
      case 'livingMana': {
        // 活體法力：把你的法力水晶變成 2/2 樹人（它們死亡時回復）
        const n = Math.min(me.maxMana, MAX_BOARD - me.board.length);
        me.maxMana -= n;
        me.mana = Math.min(me.mana, me.maxMana);
        for (let i = 0; i < n; i++) yield* this.doSummon(ctx, me.id, args.card as string);
        break;
      }
      case 'kalimos': {
        // 『原初之王』卡力摩斯：選擇一個元素祈願施放
        const opts = INVOCATIONS.filter((x) => hasCard(x));
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '選擇一個元素祈願');
        for (const ab of getCard(id).abilities ?? []) if (ab.on.k === 'play') yield* this.runEffects(ab.effects, ctx);
        break;
      }
      case 'weaponKeyword':
        if (me.weapon && !me.weapon.keywords.includes(args.keyword as Keyword)) me.weapon.keywords.push(args.keyword as Keyword);
        break;
      case 'summonDiscarded': {
        // 殘暴的恐龍術師：召喚一個本場對戰中棄掉的隨機手下
        const id = pick(s, (me.discardedCards ?? []).filter((x) => getCard(x).type === 'MINION'));
        if (id) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'curseAll':
        // 腐蝕迷霧：詛咒所有手下，在你的下個回合開始時消滅它們
        for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c)) as Minion[]) {
          m.abilities.push({ on: { k: 'turnStart', whose: m.owner === me.id ? 'mine' : 'opp' }, once: true, effects: [{ e: 'destroy', target: { t: 'self' } }] });
        }
        break;
      case 'damageHeroByItCost': {
        // 窸窣的掘洞蟲：你的英雄受到等同發現的法術消耗的傷害
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid) : null;
        if (hc) yield* this.damage({ owner: me.id, uid: null }, me.hero.uid, getCard(hc.card.cardId).cost);
        break;
      }
      case 'zavas': {
        // 薩瓦絲女王：被棄掉時 +2/+2 並回到手牌
        const old = ctx.drawnCard;
        const hc = this.addToHand(me, ctx.sourceCardId);
        if (hc) {
          hc.atkBuff = (old?.atkBuff ?? 0) + 2;
          hc.hpBuff = (old?.hpBuff ?? 0) + 2;
        }
        break;
      }
      case 'destroyDeckCost':
        // 『叢林獵人』赫米特：摧毀你牌堆中消耗 3 以下的卡
        me.deck = me.deck.filter((h) => getCard(h.cardId).cost > (args.max as number));
        break;
      case 'eliseTrailblazer': {
        // 『拓荒先驅』伊莉絲：把安戈洛卡包洗入你的牌堆；若沒有重複的卡，抽出它
        const hc = this.newHandCard(args.card as string);
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        if (this.evalCond({ c: 'noDuplicates' }, ctx) && me.hand.length < MAX_HAND) {
          me.deck = me.deck.filter((h) => h !== hc);
          me.hand.push(hc);
        }
        break;
      }
      case 'triggerItDeathrattle': {
        // 頌魂者昂布拉：在你召喚手下後，觸發它的亡語
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (m && m.uid !== ctx.sourceUid && !m.silenced && m.abilities.some((a) => a.on.k === 'deathrattle')) yield* this.runDeathrattles(m);
        break;
      }
      case 'stampede':
        // 奔竄：本回合你每打出一個野獸，隨機獲得一張野獸
        (me.eternal ??= []).push({
          ability: { on: { k: 'cardPlayed', side: 'friendly', cardType: 'MINION', race: 'BEAST' }, effects: [{ e: 'addRandom', pool: { type: 'MINION', race: 'BEAST' }, count: 1, who: 'self' }] },
          sourceCardId: ctx.sourceCardId,
          turn: s.turn,
        });
        break;
      case 'replaceDeck':
        // 探索安戈洛：把你的牌堆換成「發現一張卡」
        me.deck = me.deck.map(() => this.newHandCard(args.card as string));
        break;
      case 'copyDamagedFriendly':
        // 分裂生殖：召喚你受傷的手下的複製
        for (const m of me.board.filter((x) => this.alive(x) && x.hp < x.maxHp)) {
          const c = yield* this.doSummon(ctx, me.id, m.cardId);
          if (c) this.copyStats(m, c);
        }
        break;
      case 'heroHealth':
        // 希望守護者阿瑪拉：將你的英雄的生命值設為 40
        me.hero.maxHp = Math.max(me.hero.maxHp, args.hp as number);
        me.hero.hp = args.hp as number;
        me.heroHealthChangedTurn = s.turn;
        break;
      case 'gluttonousOoze': {
        // 貪食軟泥怪：摧毀對手的武器，獲得等同其攻擊力的護甲值
        const w = foe.weapon;
        if (!w) break;
        const atk = this.weaponAtk(foe);
        foe.weapon = null;
        yield* this.weaponDestroyed(w);
        yield* this.runEffect({ e: 'armor', amount: atk }, ctx);
        break;
      }
      case 'summonWithKeywords':
        // 天降奇兵：召喚兩個有嘲諷的白銀之手新兵
        for (let i = 0; i < (args.count as number); i++) {
          const m = yield* this.doSummon(ctx, me.id, args.card as string);
          if (m) for (const k of args.keywords as Keyword[]) if (!m.keywords.includes(k)) m.keywords.push(k);
        }
        break;
      case 'damageByOwnAttack': {
        // 恆時劫奪者：對一個手下造成等同其攻擊力的傷害
        const m = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (m) yield* this.damage(this.dmgSource(ctx), m.uid, this.atkOf(m));
        break;
      }
      case 'boomSquad': {
        // 爆爆小隊：發現一張跟班、機械或龍
        const opts = [
          pick(s, LACKEYS.filter((x) => hasCard(x))),
          pick(s, this.randomPool({ type: 'MINION', race: 'MECHANICAL' }, me.id, true))?.id,
          pick(s, this.randomPool({ type: 'MINION', race: 'DRAGON' }, me.id, true))?.id,
        ].filter((x): x is string => !!x);
        if (!opts.length) break;
        this.addToHand(me, yield* this.choose(ctx, opts, '發現一張卡牌'));
        break;
      }
      case 'doomCard': {
        // 混亂凝視者：詛咒對手手牌中一張可以打出的卡，他只有 1 個回合可以打出它
        const hc = pick(s, foe.hand.filter((h) => this.costOf(foe, h) <= foe.maxMana + 1 && h.doomTurn === undefined));
        if (hc) hc.doomTurn = s.turn + 1;
        break;
      }
      case 'battlecryTax':
        foe.battlecryTax = { amount: args.amount as number, turn: s.turn + 1 };
        break;
      case 'timeOut':
        // 暫停！：你的英雄在你的下個回合前免疫
        me.heroImmuneUntil = s.turn + 1;
        break;
      case 'shuffleSelfBuffed': {
        // 不朽的主祭：把此手下（保留加成）洗入你的牌堆
        const m = ctx.sourceSnapshot;
        if (!m) break;
        const hc = this.newHandCard(m.cardId);
        hc.atkBuff = m.atkBuff;
        hc.hpBuff = m.maxHp - m.baseHp - m.auraHp;
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        break;
      }
      case 'hexLord':
        // 妖術領主瑪拉克雷斯：把你起手手牌的複製加入手牌（這張卡除外）
        for (const id of me.openingHand ?? []) if (getCard(id).nameEn !== getCard(ctx.sourceCardId).nameEn) this.addToHand(me, id);
        break;
      case 'netherPortal': {
        // 虛空傳送門：開啟一個永久的傳送門
        const m = yield* this.doSummon(ctx, me.id, args.card as string);
        if (m && !m.keywords.includes('DORMANT')) m.keywords.push('DORMANT');
        break;
      }
      case 'feedingTime': {
        // 開飯時刻：召喚三隻 1/1 翼手龍並演化它們
        const list: Minion[] = [];
        for (let i = 0; i < 3; i++) {
          const m = yield* this.doSummon(ctx, me.id, args.card as string);
          if (m) list.push(m);
        }
        if (!list.length) break;
        const opts = shuffle(s, ADAPTATIONS.filter((x) => hasCard(x))).slice(0, 3);
        const id = yield* this.choose(ctx, opts, '演化');
        for (const m of list) if (this.minion(m.uid)) this.applyAdaptation(m, id);
        break;
      }
      case 'horsemen': {
        // 天啟四騎士：召喚一個場上沒有的騎士，四個到齊就消滅敵方英雄
        const all = args.cards as string[];
        const missing = all.filter((id) => !me.board.some((m) => m.cardId === id));
        const id = pick(s, missing);
        if (id) yield* this.doSummon(ctx, ctx.controller, id);
        if (all.every((c) => me.board.some((m) => m.cardId === c && this.alive(m)))) {
          this.log(me.id, '天啟四騎士到齊了！');
          foe.hero.hp = 0;
        }
        break;
      }
      default:
        yield* this.customViolet(fn, args, ctx);
    }
  }

  // ==========================================================================
  // 逃離紫羅蘭堡
  // ==========================================================================

  /** 從幾張手牌 / 牌堆中的卡裡選一張（只有一張時不用選；電腦自動選） */
  private *chooseFromList(ctx: Ctx, cards: HandCard[], title: string): Gen<HandCard | undefined> {
    if (!cards.length) return undefined;
    if (cards.length === 1) return cards[0];
    const idx = yield { player: ctx.controller, kind: 'discover', options: cards.map((h) => h.cardId), title };
    return cards[Math.max(0, Math.min(cards.length - 1, idx ?? 0))];
  }

  private randomEnemyChar(ctx: Ctx, filter: Filter = {}, exclude: number[] = []): Char | undefined {
    return pick(
      this.s,
      this.chars().filter((c) => this.alive(c) && !exclude.includes(c.uid) && this.pass(c, { side: 'enemy', ...filter }, ctx)),
    );
  }

  /** 讓手下休眠幾個回合（在擁有者的回合開始時倒數） */
  private goDormantFor(m: Minion, turns: number) {
    if (!m.keywords.includes('DORMANT')) m.keywords.push('DORMANT');
    m.dormantTurns = Math.max(m.dormantTurns ?? 0, turns);
    this.log(m.owner, `${this.name(m.cardId)}休眠了 ${turns} 個回合`);
  }

  /** 把一張卡洗入對手牌堆（小鬼線人、疫病等） */
  private shuffleInto(p: PlayerState, hc: HandCard) {
    p.deck.splice(randomInt(this.s, p.deck.length + 1), 0, hc);
    this.shuffled(p, 1);
  }

  /** 你把牌洗入牌堆：累積洗牌次數（潛伏追蹤者、重擊、任務） */
  private shuffled(p: PlayerState, n: number) {
    p.shuffleCount = (p.shuffleCount ?? 0) + n;
    this.questProgress(p, 'shuffle');
  }

  private *customViolet(fn: string, args: Record<string, unknown>, ctx: Ctx): Gen {
    const s = this.s;
    const me = s.players[ctx.controller];
    const foe = s.players[opp(ctx.controller)];
    const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
    const it = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
    const chosenM = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
    switch (fn) {
      // ------------------------------------------------------------ 「跟隨…」與小鬼線人
      case 'followGive': {
        let hc: HandCard | undefined;
        if (args.target === 'it') hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : undefined;
        else {
          const race = args.race as Race | undefined;
          hc = pick(
            s,
            me.hand.filter((h) => !race || (this.handDef(h).type === 'MINION' && this.isRace(h.cardId, race))),
          );
        }
        if (!hc) break;
        hc.follow = { id: args.id as string, turn: s.turn };
        this.log(me.id, `${this.name(hc.cardId)}獲得了「跟隨」效果`);
        break;
      }
      case 'putImpformants': {
        const n = this.amount((args.count as Amount) ?? 1, ctx);
        for (let i = 0; i < n; i++) {
          const hc = this.newHandCard('CAP_400t2t');
          hc.summonFor = me.id;
          this.shuffleInto(foe, hc);
        }
        this.log(me.id, `${me.name}把 ${n} 個小鬼線人放進了${foe.name}的牌堆`);
        break;
      }
      case 'corruptConstable': {
        const i = foe.deck.findIndex((h) => h.cardId === 'CAP_400t2t');
        if (i < 0) break;
        const [hc] = foe.deck.splice(i, 1);
        hc.atkBuff += 2;
        hc.hpBuff += 2;
        foe.deck.push(hc);
        this.log(me.id, '一個小鬼線人被移到了對手牌堆的最上方');
        break;
      }
      case 'frameJob': {
        const opts: HandCard[] = [];
        for (const h of shuffle(s, [...foe.deck])) {
          if (opts.length >= 3) break;
          if (getCard(h.cardId).type !== 'MINION' || opts.some((o) => o.cardId === h.cardId)) continue;
          opts.push(h);
        }
        const hc = yield* this.chooseFromList(ctx, opts, '發現敵方牌堆中的一個手下，放到最上方');
        if (!hc) break;
        foe.deck = foe.deck.filter((h) => h !== hc);
        foe.deck.push(hc);
        this.log(me.id, `${this.name(hc.cardId)}被放到了對手牌堆的最上方`);
        break;
      }
      // ------------------------------------------------------------ 潛行
      case 'silentStrike': {
        if (!chosenM) break;
        const stealthed = this.hasKw(chosenM, 'STEALTH');
        chosenM.atkBuff += 3;
        this.fx({ kind: 'buff', uid: chosenM.uid, cardId: ctx.sourceCardId, player: me.id });
        if (stealthed) {
          const t = pick(s, foe.board.filter((x) => this.alive(x)));
          if (t) yield* this.damage(this.dmgSource(ctx), t.uid, this.atkOf(chosenM) + this.spellDamage(me.id));
        }
        break;
      }
      case 'discountRandomInHand': {
        const hc = pick(s, me.hand);
        if (hc) hc.costMod -= args.amount as number;
        break;
      }
      // ------------------------------------------------------------ 砲手
      case 'cannonShot': {
        const shots = 1 + this.flagCount('extraShot', ctx.controller);
        for (let i = 0; i < shots; i++) {
          const t = this.randomEnemyChar(ctx);
          if (t) yield* this.damage(this.dmgSource(ctx), t.uid, 1);
        }
        break;
      }
      case 'fireCannoneers': {
        for (const m of [...me.board]) {
          if (!this.alive(m) || m.silenced || getCard(m.cardId).nameEn !== 'Cannoneer') continue;
          yield* this.customViolet('cannonShot', {}, { ...ctx, sourceUid: m.uid, sourceCardId: m.cardId, isSpell: false });
          if (this.over) return;
        }
        break;
      }
      // ------------------------------------------------------------ 重生
      case 'specterSpecialist': {
        if (!chosenM) break;
        if (this.hasKw(chosenM, 'REBORN')) {
          const r = yield* this.summon(me.id, chosenM.cardId, me.board.indexOf(chosenM) + 1);
          if (r) this.copyStats(chosenM, r);
        } else chosenM.keywords.push('REBORN');
        break;
      }
      case 'lingeringSpirit': {
        const amt = (args.amount as number) ?? 3;
        const healed = yield* this.heal(me.hero.uid, amt);
        const excess = amt - healed;
        if (excess > 0) {
          const t = this.randomEnemyChar(ctx);
          if (t) yield* this.damage({ owner: me.id, uid: null }, t.uid, excess);
        }
        break;
      }
      case 'slimeEm': {
        const lists: string[][] = [[], []];
        for (const pl of s.players) {
          lists[pl.id] = pl.board.filter((m) => this.alive(m)).map((m) => m.cardId);
          for (const m of pl.board) m.dead = true;
        }
        for (const pl of s.players) {
          const hc = this.addToHand(pl, 'CAP_805t');
          if (hc) hc.slimed = lists[pl.id];
        }
        break;
      }
      case 'ectoplasm': {
        for (const id of ctx.playedCard?.slimed ?? []) {
          if (me.board.length >= MAX_BOARD) break;
          yield* this.doSummon(ctx, me.id, id);
        }
        break;
      }
      case 'raithVanGeist': {
        for (const id of [...(me.rebornCards ?? [])]) {
          if (me.board.length >= MAX_BOARD) break;
          const m = yield* this.doSummon(ctx, me.id, id);
          if (!m) continue;
          const t = pick(s, foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT')));
          if (t) {
            yield* this.doAttack(m.uid, t.uid);
            yield* this.processDeaths();
          }
          if (this.over) return;
        }
        break;
      }
      // ------------------------------------------------------------ 戰士 / 中立
      case 'escapeSelf': {
        if (!self) break;
        me.board = me.board.filter((x) => x !== self);
        this.log(me.id, `${this.name(self.cardId)}逃離了賽局`);
        this.recalcAuras();
        break;
      }
      case 'violetPunisher': {
        if (!self || !chosenM) break;
        const base = getCard(chosenM.cardId);
        const extraKw = chosenM.keywords.filter((k) => k !== 'DORMANT' && !(base.keywords ?? []).includes(k));
        const extraAb = chosenM.abilities.filter((a) => !(base.abilities ?? []).includes(a));
        const hpBuff = chosenM.maxHp - chosenM.auraHp - chosenM.baseHp;
        const atkBuff = chosenM.atkBuff;
        let n = extraKw.length + extraAb.length + (atkBuff > 0 ? 1 : 0) + (hpBuff > 0 ? 1 : 0);
        chosenM.keywords = chosenM.keywords.filter((k) => !extraKw.includes(k));
        chosenM.abilities = chosenM.abilities.filter((a) => !extraAb.includes(a));
        for (const k of extraKw) if (!self.keywords.includes(k)) self.keywords.push(k);
        self.abilities.push(...extraAb);
        if (atkBuff > 0) {
          chosenM.atkBuff = 0;
          self.atkBuff += atkBuff;
        }
        if (hpBuff > 0) {
          chosenM.maxHp -= hpBuff;
          chosenM.hp = Math.min(chosenM.hp, chosenM.maxHp);
          self.maxHp += hpBuff;
          self.hp += hpBuff;
        }
        n = Math.max(0, n);
        self.atkBuff += n;
        self.maxHp += n;
        self.hp += n;
        this.log(me.id, `${this.name(self.cardId)}偷取了 ${n} 個加成效果`);
        break;
      }
      case 'setHandFlag': {
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : undefined;
        if (hc) (hc as unknown as Record<string, unknown>)[args.flag as string] = true;
        break;
      }
      case 'grantPrepare': {
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : undefined;
        if (hc) hc.canPrepare = true;
        break;
      }
      case 'stealEnteredCards': {
        for (const hc of [...foe.hand]) {
          if (hc.enteredTurn !== s.turn || me.hand.length >= MAX_HAND) continue;
          foe.hand = foe.hand.filter((h) => h !== hc);
          me.hand.push(hc);
          this.log(me.id, `${this.name(hc.cardId)}被偷走了`);
        }
        break;
      }
      case 'darkBribe': {
        const drawn = yield* this.draw(me, 3);
        const hc = yield* this.chooseFromList(ctx, drawn, '選擇一張牌給對手');
        if (!hc || !me.hand.includes(hc)) break;
        me.hand = me.hand.filter((h) => h !== hc);
        if (foe.hand.length < MAX_HAND) {
          hc.enteredTurn = s.turn;
          foe.hand.push(hc);
          this.log(me.id, `${me.name}把${this.name(hc.cardId)}給了對手`);
        }
        break;
      }
      case 'shuffleItAtCost': {
        const id = it?.cardId ?? ctx.itCardId;
        if (!id) break;
        const hc = this.newHandCard(id);
        hc.costMod = (args.cost as number) - getCard(id).cost;
        this.shuffleInto(me, hc);
        break;
      }
      case 'augur': {
        const opts = shuffle(s, [...foe.hand]).slice(0, 3);
        const hc = yield* this.chooseFromList(ctx, opts, '瀏覽對手手中的 3 張牌，並隱密選擇一張');
        if (hc && self) self.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'discardUid', args: { uid: hc.uid } }] });
        break;
      }
      case 'discardUid': {
        const found = this.handCard(args.uid as number);
        if (!found) break;
        found.owner.hand = found.owner.hand.filter((h) => h !== found.card);
        this.log(found.owner.id, `${found.owner.name}棄掉了${this.name(found.card.cardId)}`);
        yield* this.discarded(found.owner, found.card);
        break;
      }
      case 'bootlegAlchemist': {
        const hc = yield* this.chooseFromList(ctx, [...me.hand], '選擇你的一張手牌，將其變形為消耗增加 (5) 的法術');
        if (!hc) break;
        const orig = this.costOf(me, hc);
        const want = Math.min(10, getCard(hc.cardId).cost + 5);
        const c = pick(s, this.randomPool({ type: 'SPELL', cost: want }, me.id, true));
        if (!c) break;
        hc.cardId = c.id;
        hc.costMod = orig - c.cost;
        hc.parts = undefined;
        hc.potion = undefined;
        hc.starship = undefined;
        this.log(me.id, `一張手牌變形成了${this.name(c.id)}（維持原本的消耗）`);
        break;
      }
      case 'skeletonKey': {
        for (let guard = 0; guard < 12; guard++) {
          const opts: string[] = [];
          for (const c of shuffle(s, [...this.randomPool({ type: 'SPELL' }, me.id, true)])) {
            if (opts.length >= 3) break;
            if (!opts.some((o) => getCard(o).name === c.name)) opts.push(c.id);
          }
          const id = yield* this.choose(ctx, [...opts, 'JAIL_319t'], '發現一個法術，或重置你的選項');
          if (id === 'JAIL_319t') {
            if (nextRandom(s) < 0.2) {
              yield* this.damage({ owner: me.id, uid: null }, me.hero.uid, 5);
              if (this.over) return;
            }
            continue;
          }
          const hc = this.addToHand(me, id);
          if (hc) hc.skeleton = true;
          break;
        }
        break;
      }
      case 'judgment': {
        if (!chosenM) break;
        const atk = this.atkOf(chosenM);
        const hp = chosenM.hp;
        for (const m of [...s.players[0].board, ...s.players[1].board]) if (this.alive(m)) this.setStats(m, atk, hp);
        break;
      }
      case 'reinforcementAura': {
        (me.eternal ??= []).push({
          ability: { on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'recruit', count: 1, maxCost: 2 }] },
          sourceCardId: ctx.sourceCardId,
          until: s.turn + 2 * ((args.turns as number) - 1 + (ctx.handCounter ?? 0)),
        });
        break;
      }
      case 'addRandomDiscount': {
        const pool = this.randomPool(args.pool as Pool, me.id, true);
        for (let i = 0; i < ((args.count as number) ?? 1); i++) {
          const c = pick(s, pool);
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (!hc) continue;
          hc.costMod -= (args.discount as number) ?? 0;
          if (args.temporary) hc.temporary = true;
          if (args.fromOpp) hc.fromOpp = true;
        }
        break;
      }
      case 'spireSecurity': {
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'SPELL'));
        if (!hc) break;
        this.log(me.id, `揭露了牌堆中的${this.name(hc.cardId)}`);
        if (getCard(hc.cardId).cost >= 5) yield* this.runEffects([{ e: 'splitDamage', filter: { type: 'minion', side: 'enemy' }, amount: 5 }], ctx);
        break;
      }
      case 'drawNonStartingSpell': {
        const hc = pick(s, me.deck.filter((h) => !h.starting && getCard(h.cardId).type === 'SPELL'));
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        me.deck.push(hc);
        yield* this.draw(me, 1);
        break;
      }
      case 'putBottom': {
        for (let i = 0; i < ((args.count as number) ?? 1); i++) (args.who === 'opponent' ? foe : me).deck.unshift(this.newHandCard(args.card as string));
        break;
      }
      case 'rampagingHound': {
        if (!self) break;
        for (const m of [...foe.board]) {
          if (!this.alive(self) || !this.alive(m) || this.hasKw(m, 'DORMANT') || !this.minion(m.uid)) continue;
          yield* this.doAttack(m.uid, self.uid);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'sawbones': {
        const others = me.board.filter((m) => this.alive(m) && m.uid !== ctx.sourceUid);
        for (const m of others) m.dead = true;
        yield* this.processDeaths();
        if (others.length) {
          yield* this.draw(me, others.length);
          me.mana = Math.min(me.maxMana, me.mana + others.length);
        }
        break;
      }
      case 'karov': {
        const pool = this.randomPool({ type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, me.id, false);
        for (let i = 0; i < 3; i++) {
          const c = pick(s, pool);
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (!hc) continue;
          hc.atkBuff = 1 - (c.attack ?? 0);
          hc.hpBuff = 1 - (c.health ?? 1);
          hc.costMod = 1 - c.cost;
        }
        break;
      }
      case 'fillHandDraw': {
        while (me.hand.length < MAX_HAND && me.deck.length && !this.over) yield* this.draw(me, 1);
        break;
      }
      case 'legendaryHandBuff': {
        for (const h of me.hand) {
          const d = this.handDef(h);
          if (d.type !== 'MINION' || d.rarity !== 'LEGENDARY') continue;
          h.atkBuff += 2;
          h.hpBuff += 1;
        }
        break;
      }
      case 'destroyRandomAdjacent': {
        const t = self ? pick(s, this.adjacent(self)) : undefined;
        if (t) t.dead = true;
        break;
      }
      case 'lethalRecipe': {
        const drawn = yield* this.draw(me, 2, { type: 'MINION' });
        if (me.maxMana >= 10) {
          for (const h of drawn) {
            h.atkBuff += 3;
            h.hpBuff += 3;
          }
        }
        break;
      }
      case 'overloadController':
        me.overloadOwed += args.amount as number;
        break;
      case 'discountSelfByEvent': {
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        if (hc) hc.costMod -= ctx.eventAmount;
        break;
      }
      case 'setSelfCost': {
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        if (hc) hc.costMod = (args.cost as number) - getCard(hc.cardId).cost;
        break;
      }
      case 'discountFromOpp': {
        for (const h of me.hand) if (h.fromOpp) h.costMod -= args.amount as number;
        break;
      }
      case 'getawayHogdriver': {
        const drawn = yield* this.draw(me, 2);
        if (self && drawn.length === 2 && drawn.every((h) => getCard(h.cardId).type === 'MINION')) {
          if (!self.keywords.includes('CHARGE')) self.keywords.push('CHARGE');
        }
        break;
      }
      case 'tinyPalChoose': {
        const w = me.weapon && me.weapon.uid === ctx.sourceUid ? me.weapon : null;
        if (!w) break;
        const ids = ['JAIL_458t1', 'JAIL_458t2', 'JAIL_458t3', 'JAIL_458t4'];
        const id = yield* this.choose(ctx, ids, '選擇你的元素彈藥');
        w.ammo = ids.indexOf(id);
        break;
      }
      case 'tinyPalFire': {
        const w = me.weapon && me.weapon.uid === ctx.sourceUid ? me.weapon : null;
        if (!w) break;
        const ids = ['JAIL_458t1', 'JAIL_458t2', 'JAIL_458t3', 'JAIL_458t4'];
        const ammo = w.ammo ?? 0;
        switch (ammo) {
          case 0: {
            const last = this.lastAttack?.defender;
            const hit: number[] = last !== undefined ? [last] : [];
            for (let i = 0; i < 2; i++) {
              const t = this.randomEnemyChar(ctx, {}, hit);
              if (!t) break;
              hit.push(t.uid);
              this.freeze(t);
            }
            break;
          }
          case 1:
            for (const c of this.chars().filter((x) => this.alive(x) && x.owner !== me.id)) yield* this.damage({ owner: me.id, uid: me.hero.uid }, c.uid, 1);
            break;
          case 2: {
            const c = pick(s, this.randomPool({ type: 'MINION', cost: 3 }, me.id, false));
            if (c) {
              const m = yield* this.doSummon(ctx, me.id, c.id);
              if (m && !m.keywords.includes('TAUNT')) m.keywords.push('TAUNT');
            }
            break;
          }
          default:
            yield* this.customViolet('addRandomDiscount', { pool: { type: 'MINION', hasBattlecry: true }, count: 1, discount: 2 }, ctx);
        }
        const others = ids.filter((_id, i) => i !== ammo);
        const id = yield* this.choose(ctx, others, '選擇另一種元素彈藥');
        if (me.weapon === w) w.ammo = ids.indexOf(id);
        break;
      }
      case 'lotusTroublemaker': {
        const shots = 1 + (ctx.handCounter ?? 0);
        for (let i = 0; i < shots; i++) {
          const t = this.randomEnemyChar(ctx);
          if (t) yield* this.damage(this.dmgSource(ctx), t.uid, 1);
        }
        break;
      }
      case 'jadeGuardians': {
        const n = me.twoManaPlayed ?? 0;
        yield* this.customViolet('addRandomDiscount', { pool: { type: 'MINION', cost: 8 }, count: 2, discount: n }, ctx);
        break;
      }
      case 'sliceAndDice': {
        const ids = me.playedThisTurn?.turn === s.turn ? [...me.playedThisTurn.ids] : [];
        const i = ids.lastIndexOf(ctx.sourceCardId);
        if (i >= 0) ids.splice(i, 1);
        for (const id of ids) {
          const def = getCard(id);
          if (def.type === 'SPELL') yield* this.castRandomly(me.id, id, true);
          else if (def.type === 'MINION') {
            const m = yield* this.summon(me.id, id);
            if (m) yield* this.repeatBattlecry(me.id, m.uid, id);
          } else if (def.type === 'WEAPON') yield* this.equip(me.id, id);
          if (this.over) return;
        }
        me.endTurnAfter = true;
        break;
      }
      case 'picklock': {
        const x = me.mana;
        if (self) this.setStats(self, x, x);
        const t = chosenM;
        if (t) yield* this.damage(this.dmgSource(ctx), t.uid, x);
        break;
      }
      case 'alarmOMatic': {
        if (!self) break;
        const hc = pick(s, foe.hand.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc) break;
        const idx = me.board.indexOf(self);
        foe.hand = foe.hand.filter((h) => h !== hc);
        me.board = me.board.filter((x) => x !== self);
        this.recalcAuras();
        this.addToHand(foe, self.cardId);
        yield* this.summon(me.id, hc.cardId, idx, hc);
        this.log(me.id, `${this.name(self.cardId)}與對手手中的${this.name(hc.cardId)}交換了`);
        break;
      }
      case 'ayaCounterfeit': {
        const id = yield* this.choose(ctx, ['JAIL_504t', 'JAIL_504t2', 'JAIL_504t3'], '選擇一個升級的偽造品來取代你的幸運幣');
        me.coinCard = id;
        for (const h of me.hand) if (getCard(h.cardId).nameEn === 'The Coin') h.cardId = id;
        for (let i = 0; i < 3; i++) this.addToHand(me, id);
        break;
      }
      case 'kabalPotion': {
        const tier = 'CFM_621t11';
        const pool = KAZAKUS_INGREDIENTS[tier].filter((id) => hasCard(id));
        const [a, b] = shuffle(s, [...pool]);
        const hc = this.addToHand(me, 'JAIL_504t3p');
        if (hc) hc.potion = [a, b];
        break;
      }
      case 'annihilation': {
        for (const pl of s.players) for (const m of pl.board) m.dead = true;
        yield* this.processDeaths();
        const bottom = me.deck.slice(0, 3).filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'DEMON'));
        for (const hc of bottom) {
          me.deck = me.deck.filter((h) => h !== hc);
          yield* this.doSummon(ctx, me.id, hc.cardId);
        }
        break;
      }
      case 'shadowRounds': {
        let t = chosenM;
        const used: number[] = [];
        for (let guard = 0; t && guard < 20; guard++) {
          used.push(t.uid);
          yield* this.damage(this.dmgSource(ctx), t.uid, 2 + this.spellDamage(me.id));
          if (!(t.hp <= 0 || t.dead)) break;
          t = pick(s, foe.board.filter((m) => this.alive(m) && !used.includes(m.uid) && !this.hasKw(m, 'DORMANT'))) ?? null;
        }
        break;
      }
      case 'recruitGive': {
        const list = shuffle(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && getCard(h.cardId).cost <= ((args.maxCost as number) ?? 99)));
        for (const hc of list.slice(0, (args.count as number) ?? 1)) {
          if (me.board.length >= MAX_BOARD) break;
          me.deck = me.deck.filter((h) => h !== hc);
          const m = yield* this.summon(me.id, hc.cardId, me.board.length, hc);
          if (m) for (const k of (args.keywords as Keyword[]) ?? []) if (!m.keywords.includes(k)) m.keywords.push(k);
        }
        break;
      }
      case 'gullibleGuard':
        me.sorry = true;
        this.log(me.id, `${me.name}現在可以說「抱歉」了`);
        break;
      case 'irida': {
        const keep = pick(s, me.deck);
        me.void = [...(me.void ?? []), ...me.deck.filter((h) => h !== keep)];
        me.deck = keep ? [keep] : [];
        this.log(me.id, `${me.name}的牌堆被送進了虛無（只留下 1 張）`);
        (me.eternal ??= []).push({
          ability: { on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'custom', fn: 'voidDraw', args: { count: 2 } }] },
          sourceCardId: ctx.sourceCardId,
        });
        break;
      }
      case 'voidDraw': {
        for (let i = 0; i < ((args.count as number) ?? 1); i++) {
          if (!me.void?.length || me.hand.length >= MAX_HAND) break;
          const [hc] = me.void.splice(randomInt(s, me.void.length), 1);
          hc.enteredTurn = s.turn;
          me.hand.push(hc);
          this.log(me.id, `${me.name}從虛無中獲得了${this.name(hc.cardId)}`);
        }
        break;
      }
      case 'gainItStats': {
        if (!self || !it) break;
        const atk = this.atkOf(it);
        self.atkBuff += atk;
        self.maxHp += it.maxHp;
        self.hp += it.maxHp;
        break;
      }
      case 'voidSoul': {
        const level = me.voidSouls ?? 0;
        me.voidSouls = level + 1;
        const c = pick(s, this.randomPool({ type: 'MINION', race: 'DEMON', cost: Math.min(10, 1 + level) }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'investigate': {
        const opts = shuffle(s, [...foe.hand]).slice(0, 3);
        const hc = yield* this.chooseFromList(ctx, opts, '調查對手的一張手牌');
        if (hc) {
          me.investigation = { cardId: hc.cardId, turn: s.turn + 1 };
          this.log(me.id, `${me.name}調查了對手的一張手牌`);
        }
        break;
      }
      case 'togwaggle': {
        const a = me.hand.length;
        const b = foe.hand.length;
        const all = shuffle(s, [...me.hand, ...foe.hand]);
        me.hand = all.slice(0, a);
        foe.hand = all.slice(a, a + b);
        this.log(me.id, '雙方的手牌被洗在了一起');
        break;
      }
      case 'noxiousBribe': {
        const cards = shuffle(s, [...this.randomPool({ chooseOne: true }, me.id, true)]);
        const opts: string[] = [];
        for (const c of cards) {
          if (opts.length >= 3) break;
          if (!opts.some((o) => getCard(o).name === c.name)) opts.push(c.id);
        }
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張二選一卡牌');
        const hc = this.addToHand(me, id);
        if (hc) hc.both = true;
        this.addToHand(foe, id);
        break;
      }
      case 'discountItByHeroAttack': {
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : undefined;
        if (hc) hc.costMod -= this.atkOf(me.hero);
        break;
      }
      case 'ratCatcherCopy': {
        if (!self) break;
        for (const h of [...me.deck]) {
          if (getCard(h.cardId).type !== 'SPELL') continue;
          const copy = this.newHandCard(h.cardId);
          copy.markedFor = self.uid;
          this.shuffleInto(me, copy);
        }
        break;
      }
      case 'drawMarked': {
        const uid = ctx.sourceUid;
        const hc = pick(s, me.deck.filter((h) => h.markedFor === uid));
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        me.deck.push(hc);
        yield* this.draw(me, 1);
        break;
      }
      case 'moragg': {
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'DEMON')));
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        const m = yield* this.doSummon(ctx, me.id, hc.cardId);
        if (m) m.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'summon', card: 'JAIL_906', count: 1, who: 'self' }] });
        break;
      }
      case 'undeathSentence': {
        const list = me.graveyard.filter((id) => getCard(id).type === 'MINION' && getCard(id).abilities?.some((a) => a.on.k === 'deathrattle'));
        const id = pick(s, list);
        if (!id) break;
        const dctx: Ctx = { ...this.baseCtx(me.id), sourceCardId: id };
        for (const ab of getCard(id).abilities ?? []) {
          if (ab.on.k !== 'deathrattle' || (ab.cond && !this.evalCond(ab.cond, dctx))) continue;
          yield* this.runEffects(ab.effects, dctx);
          if (this.over) return;
        }
        break;
      }
      case 'goDormantIt': {
        const t = it ?? chosenM;
        if (t) this.goDormantFor(t, args.turns as number);
        break;
      }
      case 'demonicConfinement': {
        if (!chosenM) break;
        if (chosenM.owner === me.id && this.isRace(chosenM.cardId, 'DEMON')) {
          chosenM.atkBuff += 3;
          chosenM.maxHp += 3;
          chosenM.hp += 3;
        } else this.goDormantFor(chosenM, 2);
        break;
      }
      case 'shuffleRandomClassSpell': {
        const c = pick(s, this.randomPool({ type: 'SPELL', cls: args.cls as CardClass }, me.id, false));
        if (c) this.shuffleInto(me, this.newHandCard(c.id));
        break;
      }
      case 'forceAllAttack': {
        for (const m of [...s.players[0].board, ...s.players[1].board].sort((a, b) => a.playOrder - b.playOrder)) {
          if (!this.alive(m) || !this.minion(m.uid) || this.hasKw(m, 'DORMANT')) continue;
          const t = pick(s, [...s.players[0].board, ...s.players[1].board].filter((x) => x !== m && this.alive(x) && !this.hasKw(x, 'DORMANT')));
          if (!t) break;
          yield* this.doAttack(m.uid, t.uid);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'stealCards': {
        for (let i = 0; i < ((args.count as number) ?? 1); i++) {
          const hc = pick(s, foe.hand);
          if (!hc) break;
          foe.hand = foe.hand.filter((h) => h !== hc);
          if (me.hand.length < MAX_HAND) {
            hc.enteredTurn = s.turn;
            me.hand.push(hc);
          }
        }
        break;
      }
      case 'handCostMinus': {
        for (const h of me.hand) if (this.handDef(h).type === (args.type ?? 'MINION')) h.costMod -= args.amount as number;
        break;
      }
      case 'godfatherKazakus': {
        const crimes = ['CAP_405t1', 'CAP_405t2', 'CAP_405t3', 'CAP_405t4', 'CAP_405t5', 'CAP_405t6', 'CAP_405t7', 'CAP_405t8', 'CAP_405t9'];
        const first = yield* this.choose(ctx, shuffle(s, [...crimes]).slice(0, 3), '謀劃審判：選擇第一個效果');
        const second = yield* this.choose(ctx, shuffle(s, crimes.filter((c) => c !== first)).slice(0, 3), '謀劃審判：選擇第二個效果');
        const length = yield* this.choose(ctx, ['CAP_405tb1', 'CAP_405tb2', 'CAP_405tb3'], '選擇審判的時間');
        const hc = this.addToHand(me, length);
        if (hc) hc.trial = [first, second];
        break;
      }
      case 'thalena':
        // 血腥醫生薩蕾娜：獲得第二個英雄能力（消耗 3 具屍體）
        me.heroPower2 = { id: 'JAIL_446hp', used: false, cost: 3 };
        this.log(me.id, `${me.name}獲得了第二個英雄能力`);
        break;
      default:
        yield* this.customCata(fn, args, ctx);
    }
  }

  // ==========================================================================
  // 大災變
  // ==========================================================================

  private *customCata(fn: string, args: Record<string, unknown>, ctx: Ctx): Gen {
    const s = this.s;
    const me = s.players[ctx.controller];
    const foe = s.players[opp(ctx.controller)];
    const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
    const chosenM = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
    const power = this.heraldPower(me);
    const base = (args.base as number) ?? 1;
    switch (fn) {
      // ------------------------------------------------------------ 預兆與士兵
      case 'herald': {
        me.heralds = (me.heralds ?? 0) + 1;
        this.log(me.id, `${me.name}的預兆（第 ${me.heralds} 次）`);
        const id = HERALD_SOLDIERS[me.heroClass];
        if (id && hasCard(id)) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'sandfuryAura':
        // 沙怒光環：你的手下的回合結束效果觸發兩次（持續幾個回合）
        me.doubleEotUntil = s.turn + 2 * ((args.turns as number) - 1 + (ctx.handCounter ?? 0));
        break;
      case 'gelbinTriumph': {
        const id = pick(s, ['CATA_480', 'JAIL_327'].filter((x) => hasCard(x)));
        const hc = id ? this.addToHand(me, id) : null;
        if (hc) hc.counter = 1;
        break;
      }
      case 'healBonus':
        me.healBonus = (me.healBonus ?? 0) + ((args.amount as number) ?? 2);
        break;
      case 'mossbinding': {
        const spent = me.mana;
        me.mana = 0;
        const golems = me.board.filter((m) => m.cardId === 'CATA_135t').slice(-2);
        for (const m of golems) {
          m.atkBuff += spent;
          m.maxHp += spent;
          m.hp += spent;
        }
        break;
      }
      case 'azsharaTriumph': {
        const pool = this.randomPool({ type: 'MINION', minCost: 8 }, me.id, false);
        for (let i = 0; i < 5; i++) {
          const c = pick(s, pool);
          if (!c) break;
          const hc = this.newHandCard(c.id);
          hc.atkBuff = c.attack ?? 0;
          hc.hpBuff = c.health ?? 0;
          this.shuffleInto(me, hc);
        }
        break;
      }
      case 'merithra': {
        const pool = this.randomPool({ type: 'MINION', race: 'DRAGON' }, me.id, false);
        while (me.hand.length < MAX_HAND) {
          const c = pick(s, pool);
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (hc && args.cheap) hc.costMod = 1 - c.cost;
        }
        break;
      }
      case 'ashWormSleep': {
        if (!self || me.board.length >= MAX_BOARD) break;
        if (!self.keywords.includes('DORMANT')) self.keywords.push('DORMANT');
        break;
      }
      case 'deathwing': {
        let opts = ['CATA_190t10', 'CATA_190t11', 'CATA_190t12', 'CATA_190t13'].filter((x) => hasCard(x));
        for (let i = 0; i < power && opts.length; i++) {
          const id = yield* this.choose(ctx, opts, '選擇要釋放的大災變');
          opts = opts.filter((x) => x !== id);
          for (const ab of getCard(id).abilities ?? []) if (ab.on.k === 'play') yield* this.runEffects(ab.effects, ctx);
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'topple': {
        const list = foe.board.filter((m) => this.alive(m));
        const best = Math.max(...list.map((m) => m.hp));
        const t = pick(s, list.filter((m) => m.hp === best));
        if (t) t.dead = true;
        break;
      }
      case 'enthrall': {
        const pool = this.randomPool({ type: 'MINION', race: 'DRAGON', rarity: 'LEGENDARY' }, me.id, false);
        for (let i = 0; i < 5; i++) {
          const c = pick(s, pool);
          if (!c) break;
          const hc = this.newHandCard(c.id);
          hc.costMod = 1 - c.cost;
          this.shuffleInto(me, hc);
        }
        break;
      }
      case 'heraldHeroAttack':
        me.hero.tempAtk += base * power;
        break;
      case 'heraldSinestra': {
        const pool = this.randomPool({ type: 'SPELL', otherClass: true }, me.id, false);
        const c = pick(s, pool);
        const hc = c ? this.addToHand(me, c.id) : null;
        if (hc) hc.costMod -= base * power;
        break;
      }
      case 'heraldOnyxia': {
        const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, base * power) }, me.id, true));
        const hc = c ? this.addToHand(me, c.id) : null;
        if (hc) hc.healthCostUntil = s.turn;
        break;
      }
      case 'chogallArm': {
        if (!self) break;
        const n = base * power;
        if (this.flagOnBoard('chogallDeck', me.id)) {
          const hc = pick(s, foe.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
          if (!hc) break;
          foe.deck = foe.deck.filter((h) => h !== hc);
          this.log(me.id, `${this.name(hc.cardId)}在敵方牌堆中被摧毀了`);
        } else {
          const right = me.board[me.board.indexOf(self) + 1];
          if (!right || !this.alive(right)) break;
          right.dead = true;
        }
        self.atkBuff += n;
        self.maxHp += n;
        self.hp += n;
        break;
      }
      case 'wickerLeg': {
        if (!self) break;
        self.atkBuff += 1;
        self.maxHp += 1;
        self.hp += 1;
        const body = self.limbOf !== undefined ? this.minion(self.limbOf) : null;
        if (body) {
          body.atkBuff += 1;
          body.maxHp += 1;
          body.hp += 1;
        }
        break;
      }
      case 'chromatusHead': {
        const body = me.board.find((m) => m.cardId === 'CATA_432');
        if (!body) break;
        const kw = args.kw as Keyword;
        body.keywords = body.keywords.filter((k) => k !== kw);
        break;
      }
      case 'alakirBC': {
        if (!self) break;
        const cost = Math.min(10, this.atkOf(self));
        const pool = this.randomPool({ type: 'MINION', cost }, me.id, true);
        for (let i = 0; i < 2; i++) {
          const c = pick(s, pool);
          const hc = c ? this.addToHand(me, c.id) : null;
          if (hc) hc.costMod = 1 - c!.cost;
        }
        break;
      }
      case 'attackRandomEnemyMinion': {
        if (!self || !this.alive(self) || this.atkOf(self) <= 0) break;
        const t = pick(s, foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH') && !this.hasKw(m, 'DORMANT')));
        if (!t) break;
        yield* this.doAttack(self.uid, t.uid);
        yield* this.processDeaths();
        break;
      }
      // ------------------------------------------------------------ 手牌與消耗
      case 'chooseHandDiscard': {
        const hc = yield* this.chooseFromList(ctx, [...me.hand], '選擇你的一張手牌來棄掉');
        if (!hc) break;
        me.hand = me.hand.filter((h) => h !== hc);
        this.log(me.id, `${me.name}棄掉了${this.name(hc.cardId)}`);
        yield* this.discarded(me, hc);
        if (args.returnOnDeath && self) self.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'getBack', args: { card: hc.cardId, discount: 1 } }] });
        break;
      }
      case 'getBack': {
        const hc = this.addToHand(me, args.card as string);
        if (hc) hc.costMod -= (args.discount as number) ?? 0;
        break;
      }
      case 'agentOfOldOnes': {
        const hc = yield* this.chooseFromList(ctx, [...me.hand], '選擇你的一張手牌，將其變形為幸運幣');
        if (!hc) break;
        hc.cardId = me.coinCard ?? 'GAME_005';
        hc.costMod = 0;
        hc.potion = undefined;
        hc.parts = undefined;
        break;
      }
      case 'chooseSpellGiveSpellPower': {
        const spells = me.hand.filter((h) => this.handDef(h).type === 'SPELL');
        const hc = yield* this.chooseFromList(ctx, spells, '選擇一張手牌中的法術，賦予法術傷害 +1');
        if (hc) hc.spellPower = (hc.spellPower ?? 0) + 1;
        break;
      }
      case 'allSpellsPower':
        for (const h of [...me.hand, ...me.deck]) if (this.handDef(h).type === 'SPELL') h.spellPower = (h.spellPower ?? 0) + 1;
        break;
      case 'tolvirCarver': {
        const hc = yield* this.chooseFromList(ctx, [...me.hand], '選擇一張手牌，在你的回合開始時降低其消耗');
        if (!hc) break;
        (me.eternal ??= []).push({
          ability: { on: { k: 'turnStart', whose: 'mine' }, effects: [{ e: 'custom', fn: 'discountUid', args: { uid: hc.uid } }] },
          sourceCardId: ctx.sourceCardId,
        });
        break;
      }
      case 'discountUid': {
        const hc = me.hand.find((h) => h.uid === args.uid);
        if (hc) hc.costMod -= 1;
        break;
      }
      case 'shuffleHandCard': {
        const hc = yield* this.chooseFromList(ctx, [...me.hand], '選擇一張手牌，洗入你的牌堆');
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          this.shuffleInto(me, hc);
        }
        yield* this.draw(me, 1);
        break;
      }
      case 'malevolentMutant': {
        const spells = me.hand.filter((h) => this.handDef(h).type === 'SPELL' && this.handDef(h).spellSchool === 'FEL');
        const hc = yield* this.chooseFromList(ctx, spells, '選擇一張手牌中的邪能法術，獲得一張複製');
        if (hc) this.addToHand(me, hc.cardId);
        break;
      }
      case 'conjurationSpecialist': {
        const spells = me.hand.filter((h) => this.handDef(h).type === 'SPELL');
        const hc = yield* this.chooseFromList(ctx, spells, '選擇一張手牌中的法術，分裂成兩個相同消耗的隨機法術');
        if (!hc) break;
        const cost = this.handDef(hc).cost;
        me.hand = me.hand.filter((h) => h !== hc);
        const pool = this.randomPool({ type: 'SPELL', cost }, me.id, true);
        for (let i = 0; i < 2; i++) {
          const c = pick(s, pool);
          if (c) this.addToHand(me, c.id);
        }
        break;
      }
      case 'cloudstrider': {
        if (!self) break;
        const spells = me.hand.filter((h) => this.handDef(h).type === 'SPELL' && this.handDef(h).cost <= 4);
        const hc = yield* this.chooseFromList(ctx, spells, '選擇一張消耗 (4) 以下的法術來吸收');
        if (!hc) break;
        me.hand = me.hand.filter((h) => h !== hc);
        self.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'castStored', args: { card: hc.cardId } }] });
        break;
      }
      case 'castStored':
        yield* this.castRandomly(me.id, args.card as string);
        break;
      case 'daze': {
        if (!chosenM || chosenM.owner === me.id) break;
        const owner = s.players[chosenM.owner];
        owner.board = owner.board.filter((m) => m !== chosenM);
        const hc = this.addToHand(owner, chosenM.cardId);
        if (hc) hc.lockedUntil = s.turn + 1;
        this.recalcAuras();
        break;
      }
      case 'sabotage':
        this.addToHand(foe, 'CATA_186t');
        break;
      case 'informant': {
        const cls = ctx.playedCard?.cls ?? me.heroClass;
        const opts: string[] = [];
        for (const c of shuffle(s, [...this.randomPool({ type: 'SPELL', cls }, me.id, false)])) {
          if (opts.length >= 3) break;
          if (!opts.some((o) => getCard(o).name === c.name)) opts.push(c.id);
        }
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個法術');
        this.addToHand(me, id);
        break;
      }
      case 'stolenPower': {
        const pool = this.randomPool({ type: 'SPELL', otherClass: true }, me.id, false).filter((c) => !!c.shatter);
        const c = pick(s, pool);
        if (c) this.addToHand(me, c.id);
        break;
      }
      case 'sindragosa': {
        if (!chosenM) break;
        const before = chosenM.hp;
        const dmg = 8 + this.spellDamage(me.id);
        yield* this.damage(this.dmgSource(ctx), chosenM.uid, dmg);
        const excess = Math.max(0, dmg - before);
        const hc = excess ? pick(s, me.hand) : undefined;
        if (hc) hc.costMod -= excess;
        break;
      }
      case 'victorNefarius': {
        const hc = this.addToHand(me, 'CATA_470t1');
        if (!hc) break;
        hc.atkBuff = 2 + randomInt(s, 5);
        hc.hpBuff = 2 + randomInt(s, 5);
        const dragon = me.hand.some((h) => h !== hc && this.isRace(h.cardId, 'DRAGON'));
        hc.costMod = 5 - (dragon ? 3 : 0);
        break;
      }
      // ------------------------------------------------------------ 手下效果
      case 'facelessReplicator': {
        const killerUid = ctx.sourceSnapshot?.killer;
        const k = killerUid !== undefined ? this.minion(killerUid) : null;
        if (k && this.alive(k)) this.transform(k.uid, 'CATA_185');
        break;
      }
      case 'eggGrow':
        if (self) self.counter = (self.counter ?? 0) + 1;
        break;
      case 'eggHatch': {
        const n = ctx.sourceSnapshot?.counter ?? 0;
        const m = yield* this.doSummon(ctx, me.id, 'CATA_210t');
        if (m) {
          m.atkBuff += n;
          m.maxHp += n;
          m.hp += n;
        }
        break;
      }
      case 'vyranoth': {
        const start = me.deck.filter((h) => h.starting && getCard(h.cardId).type === 'MINION').reduce((x, h) => x + getCard(h.cardId).cost, 0);
        const total = start + me.hand.filter((h) => h.starting && getCard(h.cardId).type === 'MINION').reduce((x, h) => x + getCard(h.cardId).cost, 0);
        if (total < 100) break;
        const minions = me.deck.filter((h) => getCard(h.cardId).type === 'MINION');
        if (!minions.length) break;
        for (let i = 0; i < 100; i++) {
          const h = pick(s, minions)!;
          if (nextRandom(s) < 0.5) h.atkBuff++;
          else h.hpBuff++;
        }
        break;
      }
      case 'alexstrasza': {
        me.hero.hp = Math.min(me.hero.hp, 15);
        me.hero.hp = 15;
        me.alexWaiting = true;
        (me.eternal ??= []).push({
          ability: { on: { k: 'healed', subject: 'friendly' }, effects: [{ e: 'custom', fn: 'alexCheck' }] },
          sourceCardId: ctx.sourceCardId,
        });
        break;
      }
      case 'alexCheck': {
        if (!me.alexWaiting || me.hero.hp < me.hero.maxHp) break;
        me.alexWaiting = false;
        yield* this.damage({ owner: me.id, uid: me.hero.uid }, foe.hero.uid, 15);
        break;
      }
      case 'blackwingExperiment': {
        const hc = this.addToHand(me, 'CATA_464t');
        if (hc && ctx.sourceSnapshot) hc.counter = this.atkOf(ctx.sourceSnapshot);
        break;
      }
      case 'inspiringMaul': {
        const list = me.board.filter((m) => this.alive(m) && !m.silenced && m.uid !== ctx.sourceUid && m.abilities.some((a) => a.on.k === 'turnEnd' && a.on.whose !== 'opp'));
        const m = pick(s, list);
        if (!m) break;
        for (const ab of m.abilities) {
          if (ab.on.k !== 'turnEnd' || ab.on.whose === 'opp') continue;
          yield* this.runEffects(ab.effects, { ...this.baseCtx(me.id), sourceUid: m.uid, sourceCardId: m.cardId });
        }
        break;
      }
      case 'nozdormu': {
        for (const m of me.board) {
          if (!this.alive(m)) continue;
          if (this.hasKw(m, 'DIVINE_SHIELD')) {
            m.atkBuff += 3;
            m.maxHp += 3;
            m.hp += 3;
          } else m.keywords.push('DIVINE_SHIELD');
        }
        break;
      }
      case 'bronzeRedeemer': {
        if (!self) break;
        const m = yield* this.doSummon(ctx, me.id, 'CATA_478t');
        if (m) this.setStats(m, this.atkOf(self), self.hp);
        break;
      }
      case 'devourFromHand': {
        if (!self) break;
        const taken = shuffle(s, [...foe.hand]).slice(0, (args.count as number) ?? 2);
        foe.hand = foe.hand.filter((h) => !taken.includes(h));
        self.devoured = taken;
        this.log(me.id, `${this.name(self.cardId)}吞噬了對手的 ${taken.length} 張手牌`);
        this.goDormantFor(self, 2);
        break;
      }
      case 'returnDevoured': {
        const list = ctx.sourceSnapshot?.devoured ?? [];
        for (const hc of list) {
          if (foe.hand.length >= MAX_HAND) break;
          foe.hand.push(hc);
        }
        break;
      }
      case 'edgeDamage': {
        const board = foe.board.filter((m) => this.alive(m));
        const targets = board.length > 1 ? [board[0], board[board.length - 1]] : board;
        for (const m of targets) yield* this.damage(this.dmgSource(ctx), m.uid, ((args.amount as number) ?? 5) + this.spellDamage(me.id));
        break;
      }
      case 'broxigar': {
        const minions = this.chars().filter((c) => !isHero(c) && this.alive(c));
        for (const m of minions) yield* this.damage(this.dmgSource(ctx), m.uid, 1 + this.spellDamage(me.id));
        const died = minions.filter((m) => m.hp <= 0 || (m as Minion).dead).length;
        if (died) yield* this.draw(me, died);
        break;
      }
      case 'eldritchTentacles': {
        for (let d = 3; d >= 1; d--) {
          for (const m of this.chars().filter((c) => !isHero(c) && this.alive(c))) yield* this.damage(this.dmgSource(ctx), m.uid, d + this.spellDamage(me.id));
          yield* this.processDeaths();
          if (this.over) return;
        }
        break;
      }
      case 'summonItDiscarded': {
        if (ctx.itCardId && getCard(ctx.itCardId).type === 'MINION') yield* this.doSummon(ctx, me.id, ctx.itCardId);
        break;
      }
      case 'cursedChains': {
        if (!chosenM || chosenM.owner === me.id || me.board.length >= MAX_BOARD) break;
        const from = s.players[chosenM.owner];
        from.board = from.board.filter((m) => m !== chosenM);
        chosenM.returnTo = from.id;
        chosenM.returnTurn = s.turn + 1;
        chosenM.owner = me.id;
        chosenM.sleeping = true;
        me.board.push(chosenM);
        this.recalcAuras();
        break;
      }
      case 'ultraxion': {
        for (const h of [...me.hand, ...me.deck]) if (getCard(h.cardId).nameEn === 'Deathwing, Worldbreaker') h.costMod -= power;
        break;
      }
      case 'heroLifesteal':
        me.heroLifestealTurn = s.turn;
        break;
      case 'earthenRoar': {
        const targets: Minion[] = [];
        if (chosenM) targets.push(chosenM);
        if (me.hand.some((h) => this.isRace(h.cardId, 'DRAGON'))) {
          const other = pick(s, foe.board.filter((m) => this.alive(m) && m !== chosenM && !this.hasKw(m, 'STEALTH')));
          if (other) targets.push(other);
        }
        for (const m of targets) {
          m.baseHp = 1;
          m.maxHp = 1 + m.auraHp;
          m.hp = Math.min(m.hp, 1);
        }
        break;
      }
      case 'confrontTolvir': {
        for (const id of [...(me.oneCostMinions ?? [])]) {
          if (me.board.length >= MAX_BOARD) break;
          yield* this.doSummon(ctx, me.id, id);
        }
        break;
      }
      case 'airSupport': {
        if (!chosenM) break;
        for (const k of ['MEGA_WINDFURY', 'CANT_ATTACK_HEROES'] as Keyword[]) if (!chosenM.keywords.includes(k)) chosenM.keywords.push(k);
        break;
      }
      case 'ascendance': {
        for (const m of [...me.board]) {
          if (!this.alive(m)) continue;
          const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, getCard(m.cardId).cost + 1) }, me.id, false));
          if (!c) continue;
          const orig = m.cardId;
          const at = me.board.indexOf(m);
          this.transform(m.uid, c.id);
          const nm = me.board[at];
          if (nm) nm.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'ascended', args: { card: orig } }] });
        }
        break;
      }
      case 'ascended':
        yield* this.doSummon(ctx, me.id, args.card as string);
        break;
      case 'morchok': {
        let reduce = 10;
        for (let i = 0; i < 20 && reduce > 0 && me.deck.length; i++) {
          const drawn = yield* this.draw(me, 1);
          const hc = drawn[0];
          if (!hc) break;
          const cost = this.costOf(me, hc);
          const cut = Math.min(cost, reduce);
          hc.costMod -= cut;
          reduce -= cost;
        }
        break;
      }
      case 'torch': {
        if (!chosenM) break;
        const dmg = ctx.playedCard?.counter ?? 8;
        const before = chosenM.hp;
        yield* this.damage(this.dmgSource(ctx), chosenM.uid, dmg);
        const excess = dmg - before;
        if (excess > 0) {
          const hc = this.addToHand(me, ctx.sourceCardId);
          if (hc) hc.counter = excess;
        }
        break;
      }
      case 'geddon':
        me.geddon = true;
        break;
      case 'gennWorgen': {
        const basic = HEROES[me.heroClass].power.id;
        if (me.heroPower.id === basic && !me.heroPower.heroCard) this.setHeroPower(me, UPGRADED_POWER_IDS[me.heroClass]);
        me.powerCostSet = 1;
        break;
      }
      case 'dreadLeviathan': {
        if (!self || !chosenM) break;
        for (let i = 0; i < 3 && this.alive(chosenM); i++) {
          chosenM.maxHp -= 3;
          chosenM.hp -= 3;
          if (chosenM.hp <= 0) chosenM.dead = true;
          self.maxHp += 3;
          self.hp += 3;
        }
        break;
      }
      case 'warmasterBlackhorn': {
        for (const pl of s.players) pl.deck = pl.deck.filter((h) => getCard(h.cardId).cost > 2);
        break;
      }
      case 'stormbinder': {
        me.mana = Math.min(me.maxMana, me.mana + me.overloadLocked);
        me.overloadLocked = 0;
        me.overloadOwed = 0;
        break;
      }
      case 'chaosSupplicant': {
        const cost = ctx.itCardId ? getCard(ctx.itCardId).cost : 0;
        const c = pick(s, this.randomPool({ type: 'SPELL', cost, otherClass: true }, me.id, false));
        if (c) yield* this.castRandomly(me.id, c.id);
        break;
      }
      case 'bloomingBulb': {
        const n = 1 + (ctx.handCounter ?? 0);
        for (let i = 0; i < 3; i++) {
          const c = pick(s, this.randomPool({ type: 'SPELL', cost: Math.min(10, n) }, me.id, true));
          if (c) yield* this.castRandomly(me.id, c.id);
          if (this.over) return;
        }
        break;
      }
      case 'bashana': {
        const pool = this.randomPool({ type: 'SPELL', spellSchool: 'NATURE' }, me.id, false).filter((c) => c.cost <= 4);
        for (let i = 0; i < 3; i++) {
          const hc = this.addToHand(me, 'MEND_046t');
          if (!hc) continue;
          hc.carved = [];
          let left = 4;
          for (let g = 0; g < 8; g++) {
            const fit = pool.filter((c) => c.cost <= left && c.cost > 0);
            const c = pick(s, fit);
            if (!c) break;
            hc.carved.push(c.id);
            left -= c.cost;
          }
        }
        break;
      }
      case 'castCarved': {
        for (const id of ctx.playedCard?.carved ?? []) {
          yield* this.castRandomly(me.id, id);
          if (this.over) return;
        }
        break;
      }
      case 'becomeInHand': {
        const hc = me.hand.find((h) => h.uid === ctx.handSource);
        if (hc && hasCard(args.into as string)) {
          hc.origin ??= hc.cardId;
          hc.cardId = args.into as string;
        }
        break;
      }
      case 'wastelandVanguard': {
        for (let round = 0; round < 2; round++) {
          const before = foe.board.filter((m) => this.alive(m)).length + 1;
          yield* this.runEffects([{ e: 'splitDamage', filter: { side: 'enemy' }, amount: 3 }], ctx);
          const died = foe.board.filter((m) => m.hp <= 0 || m.dead).length + (foe.hero.hp <= 0 ? 1 : 0);
          void before;
          if (!died) break;
        }
        break;
      }
      // ------------------------------------------------------------ 動物夥伴與地脈
      case 'companionReplace':
        me.companion = { cost: (me.companion?.cost ?? 0) + ((args.cost as number) ?? 1), extra: me.companion?.extra ?? 0 };
        break;
      case 'companionExtra':
        me.companion = { cost: me.companion?.cost ?? 0, extra: (me.companion?.extra ?? 0) + 1 };
        break;
      case 'spiritspeaker': {
        const id = yield* this.choose(ctx, ['NEW1_032', 'NEW1_033', 'NEW1_034'].filter((x) => hasCard(x)), '選擇一個動物夥伴來召喚');
        yield* this.summonCompanion(ctx, id);
        break;
      }
      case 'leylineBurst': {
        const times = 1 + (me.leyline?.extra ?? 0);
        const dmg = 4 + (me.leyline?.bonus ?? 0);
        for (let i = 0; i < times; i++) {
          const t = pick(s, foe.board.filter((m) => this.alive(m)));
          if (!t) break;
          const before = t.hp;
          yield* this.damage(this.dmgSource(ctx), t.uid, dmg);
          if (dmg > before) yield* this.damage(this.dmgSource(ctx), foe.hero.uid, dmg - before);
        }
        break;
      }
      case 'leylineCrystal': {
        const times = 1 + (me.leyline?.extra ?? 0);
        const cost = Math.min(10, 6 + (me.leyline?.bonus ?? 0));
        for (let i = 0; i < times; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', cost }, me.id, false));
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      }
      case 'leylineNexus': {
        const times = 1 + (me.leyline?.extra ?? 0);
        const drawn = yield* this.draw(me, times);
        for (const h of drawn) h.costMod -= 1 + (me.leyline?.bonus ?? 0);
        break;
      }
      case 'leylineAdjust': {
        const l = (me.leyline ??= { bonus: 0, extra: 0, discount: 0 });
        l.bonus += (args.bonus as number) ?? 0;
        l.extra += (args.extra as number) ?? 0;
        l.discount += (args.discount as number) ?? 0;
        break;
      }
      case 'randomLeyline':
        this.addToHand(me, pick(s, LEYLINES) ?? LEYLINES[0]);
        break;
      case 'arcanomicon': {
        for (const id of LEYLINES) this.addToHand(me, id);
        const id = yield* this.choose(ctx, ['MEND_505t', 'MEND_505t2', 'MEND_505t3'], '選擇你的地脈的強化');
        const l = (me.leyline ??= { bonus: 0, extra: 0, discount: 0 });
        if (id === 'MEND_505t') l.extra += 1;
        else if (id === 'MEND_505t2') l.discount += 2;
        else l.bonus += 2;
        break;
      }
      // ------------------------------------------------------------ 銀白之手新兵
      case 'recruitBuff': {
        const rb = (me.recruitBuff ??= { atk: 0, hp: 0 });
        rb.atk += (args.atk as number) ?? 0;
        rb.hp += (args.hp as number) ?? 0;
        for (const m of me.board) {
          if (getCard(m.cardId).nameEn !== 'Silver Hand Recruit') continue;
          m.atkBuff += (args.atk as number) ?? 0;
          m.maxHp += (args.hp as number) ?? 0;
          m.hp += (args.hp as number) ?? 0;
        }
        break;
      }
      case 'aratorDouble': {
        for (const m of me.board) {
          if (getCard(m.cardId).nameEn !== 'Silver Hand Recruit' || !this.alive(m)) continue;
          m.atkBuff += this.atkOf(m);
          m.maxHp += m.hp;
          m.hp += m.hp;
          if (!m.keywords.includes('TAUNT')) m.keywords.push('TAUNT');
        }
        break;
      }
      case 'charity': {
        for (const id of me.diedThisTurn?.turn === s.turn ? me.diedThisTurn.ids : []) {
          if (getCard(id).type !== 'MINION') continue;
          const hc = this.addToHand(me, id);
          if (hc) {
            hc.atkBuff += 3;
            hc.hpBuff += 3;
          }
        }
        break;
      }
      case 'recruitsDivineShield': {
        for (let i = 0; i < ((args.count as number) ?? 2); i++) {
          const m = yield* this.doSummon(ctx, me.id, 'CS2_101t');
          if (m && !m.keywords.includes('DIVINE_SHIELD')) m.keywords.push('DIVINE_SHIELD');
        }
        break;
      }
      default:
        yield* this.customTimeways(fn, args, ctx);
    }
  }

  /** 召喚一個動物夥伴（可能被取代為消耗更高的隨機野獸，Talya 讓你多召喚一個） */
  private *summonCompanion(ctx: Ctx, id: string): Gen {
    const me = this.s.players[ctx.controller];
    const n = 1 + (me.companion?.extra ?? 0);
    for (let i = 0; i < n; i++) {
      if (me.companion?.cost) {
        const c = pick(this.s, this.randomPool({ type: 'MINION', race: 'BEAST', cost: Math.min(10, 3 + me.companion.cost) }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
      } else yield* this.doSummon(ctx, me.id, id);
    }
  }

  // ==========================================================================
  // 穿越時間流
  // ==========================================================================

  /** 指控：條件成立時，消滅被標記的手下（excludeUid：另一個手下死亡時，不算被標記的那個） */
  private accusationFire(kind: 'murder' | 'theft', owner: PlayerId, deadUid?: number) {
    const p = this.s.players[owner];
    if (!p.accusations?.some((a) => a.kind === kind)) return;
    for (const a of p.accusations.filter((x) => x.kind === kind && x.uid !== deadUid)) {
      const m = this.minion(a.uid);
      if (m) m.dead = true;
    }
    p.accusations = p.accusations.filter((x) => x.kind !== kind || x.uid === deadUid);
  }

  /** 指控：英雄受到傷害後，被「縱火指控」標記的手下被消滅 */
  private *accusationsAfterDamage(t: Char): Gen {
    if (!isHero(t)) return;
    const p = this.s.players[t.owner];
    if (!p.accusations?.some((a) => a.kind === 'arson')) return;
    for (const a of p.accusations.filter((x) => x.kind === 'arson')) {
      const m = this.minion(a.uid);
      if (m) m.dead = true;
    }
    p.accusations = p.accusations.filter((x) => x.kind !== 'arson');
  }

  /** 注入：友方手下死亡時，手牌中帶有注入的卡累積進度，達標後變成注入版本 */
  private infuseTick(m: Minion) {
    const p = this.s.players[m.owner];
    const zones = this.flagOnBoard('infuseInDeck', p.id) ? [p.hand, p.deck] : [p.hand];
    for (const zone of zones) {
      for (const hc of zone) {
        const inf = getCard(hc.cardId).infuse;
        if (!inf || (inf.race && !this.isRace(m.cardId, inf.race))) continue;
        hc.infuseProgress = (hc.infuseProgress ?? 0) + 1;
        hc.infuseAtk = (hc.infuseAtk ?? 0) + this.atkOf(m);
        if (hc.infuseProgress < inf.n || !hasCard(inf.into)) continue;
        this.log(p.id, `${this.name(hc.cardId)}注入完成了`);
        hc.cardId = inf.into;
        hc.infuseProgress = 0;
        if (getCard(inf.into).flags?.includes('infuseGainsStats')) {
          hc.atkBuff += hc.infuseAtk;
          hc.hpBuff += hc.infuseAtk;
        }
      }
    }
  }

  /** 開始一個目標：它的能力在接下來的幾個回合內有效 */
  private startObjective(p: PlayerState, def: CardDef) {
    const turns = def.objective ?? 3;
    for (const ab of def.abilities ?? []) {
      if (ab.on.k === 'play') continue;
      const atStart = ab.on.k === 'turnStart';
      (p.eternal ??= []).push({ ability: ab, sourceCardId: def.id, until: this.s.turn + 2 * (atStart ? turns : turns - 1), objective: true });
    }
    this.log(p.id, `${p.name}的${this.name(def.id)}開始生效（持續 ${turns} 個回合）`);
  }

  /** 把牌堆中的一張牌放進手牌（手牌已滿就燒掉） */
  private *takeIntoHand(p: PlayerState, hc: HandCard): Gen<HandCard | null> {
    p.deck = p.deck.filter((h) => h !== hc);
    if (p.hand.length >= MAX_HAND) {
      this.fx({ kind: 'burn', cardId: hc.cardId, player: p.id });
      yield* this.burned(p, hc);
      return null;
    }
    hc.enteredTurn = this.s.turn;
    p.hand.push(hc);
    this.questFillHand(p);
    return hc;
  }

  /** 任務「填滿你的手牌，然後清空它」 */
  private questFillHand(p: PlayerState) {
    if (!p.quest) return;
    const q = getCard(p.quest.cardId).quest;
    if (!q || q.kind !== 'fillHand') return;
    if (p.quest.progress === 0 && p.hand.length >= MAX_HAND) this.questProgress(p, 'fillHand');
    else if (p.quest.progress === 1 && p.hand.length === 0) this.questProgress(p, 'fillHand');
  }

  /** 黑暗禮物 / 額外效果 */
  private giftList(): { name: string; atk?: number; hp?: number; kw?: Keyword[]; cost?: number; dr?: Effect[]; living?: boolean; twice?: boolean; top?: boolean; hits?: number }[] {
    return [
      { name: '覺醒的恐懼', atk: 3, kw: ['LIFESTEAL'] },
      { name: '睡飽了', atk: 2, hp: 2, kw: ['ELUSIVE'] },
      { name: '短爪', atk: -2, cost: -2 },
      { name: '穿得暖暖的', hp: 4, kw: ['TAUNT'] },
      { name: '夢遊者', kw: ['CHARGE'] },
      { name: '鷹身女妖之爪', kw: ['DIVINE_SHIELD', 'WINDFURY'] },
      { name: '持續的恐懼', kw: ['REBORN'] },
      { name: '內心的惡魔', dr: [{ e: 'draw', count: 2, who: 'self' }] },
      { name: '活生生的噩夢', living: true },
      { name: '魯莽的覺醒', twice: true },
      { name: '甜蜜的夢', atk: 4, hp: 5, top: true },
      { name: '夢魘鱗片', hits: 3 },
    ];
  }

  private giftHand(hc: HandCard, g: ReturnType<Game['giftList']>[number], pid?: PlayerId) {
    hc.atkBuff += g.atk ?? 0;
    hc.hpBuff += g.hp ?? 0;
    hc.costMod += g.cost ?? 0;
    for (const k of g.kw ?? []) (hc.bonus ??= []).includes(k) || hc.bonus.push(k);
    if (g.dr) (hc.grant ??= []).push({ on: { k: 'deathrattle' }, effects: g.dr });
    hc.gifted = true;
    // 沼澤惡魔瓦洛：在手牌或牌堆中時，獲得每一個賦予你的手下的黑暗禮物
    if (pid !== undefined) this.wallowGain(pid, g, hc);
    if (g.living) hc.livingCopy = true;
    if (g.twice) hc.twiceBC = true;
    if (g.hits) hc.shieldHits = g.hits;
    // 甜蜜的夢：把這張牌放到你牌堆的頂端
    if (g.top) {
      for (const p of this.s.players) {
        if (p.hand.includes(hc)) {
          p.hand = p.hand.filter((h) => h !== hc);
          p.deck.push(hc);
        }
      }
    }
  }

  private wallowGain(pid: PlayerId, g: ReturnType<Game['giftList']>[number], except?: HandCard) {
    const p = this.s.players[pid];
    for (const h of [...p.hand, ...p.deck]) {
      if (h.cardId !== 'EDR_487' || h === except || (h.wallow ?? []).length > 30) continue;
      (h.wallow ??= []).push(g.name);
      this.giftHand(h, g);
    }
  }

  private giftMinion(m: Minion, g: ReturnType<Game['giftList']>[number]) {
    this.wallowGain(m.owner, g);
    m.atkBuff += g.atk ?? 0;
    m.maxHp += g.hp ?? 0;
    m.hp += g.hp ?? 0;
    for (const k of g.kw ?? []) if (!m.keywords.includes(k)) m.keywords.push(k);
    if (g.dr) m.abilities.push({ on: { k: 'deathrattle' }, effects: g.dr });
    if (g.hits) m.shieldHits = g.hits;
  }

  /** 從牌堆中找一張符合條件的牌放進手牌 */
  private *drawWhere(p: PlayerState, pred: (hc: HandCard) => boolean): Gen<HandCard | null> {
    const hc = pick(this.s, p.deck.filter(pred));
    if (!hc) return null;
    return yield* this.takeIntoHand(p, hc);
  }

  /** 設為休眠 */
  private dormant(m: Minion, turns: number) {
    if (!m.keywords.includes('DORMANT')) m.keywords.push('DORMANT');
    m.dormantTurns = turns;
  }

  private *customTimeways(fn: string, args: Record<string, unknown>, ctx: Ctx): Gen {
    const s = this.s;
    const me = s.players[ctx.controller];
    const foe = s.players[opp(ctx.controller)];
    const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
    const chosenM = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
    const allMinions = () => [...s.players[0].board, ...s.players[1].board].filter((m) => this.alive(m));
    const isRafaam = (id: string) => getCard(id).nameEn.includes('Rafaam');
    const pickDistinct = (cards: CardDef[], n: number) => {
      const out: string[] = [];
      for (const c of shuffle(s, [...cards])) {
        if (out.length >= n) break;
        if (!out.some((o) => getCard(o).name === c.name)) out.push(c.id);
      }
      return out;
    };
    switch (fn) {
      // ------------------------------------------------------------ 目標（Aura）
      case 'objective':
        this.startObjective(me, getCard(ctx.sourceCardId));
        break;
      // 傑爾賓：把你牌堆中每種目標各一張放到戰場上
      case 'gelbin': {
        const seen = new Set<string>();
        for (const hc of [...me.deck]) {
          const d = getCard(hc.cardId);
          if (!d.objective || seen.has(d.id)) continue;
          seen.add(d.id);
          me.deck.splice(me.deck.indexOf(hc), 1);
          this.startObjective(me, d);
        }
        break;
      }
      // ------------------------------------------------------------ 灌注
      case 'imbue':
        this.doImbue(me, (args.times as number) ?? 1);
        break;
      case 'bronzeBlessing':
        yield* this.customViolet('addRandomDiscount', { pool: { type: 'MINION', otherClass: true }, count: 1, discount: me.imbued ?? 1 }, ctx);
        break;
      // ------------------------------------------------------------ 終結（END_）
      case 'blightspawn':
        if (me.weapon) me.weapon.atk += 2;
        else yield* this.equip(me.id, 'CS2_082');
        break;
      case 'drawRace':
        yield* this.draw(me, 1, { type: 'MINION', race: args.race as Race });
        break;
      case 'splinteredReality': {
        const n = me.graveyard.filter((id) => getCard(id).nameEn === 'Treant').length;
        for (let i = 0; i < 2; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'END_009t');
          if (m && n > 0) {
            m.atkBuff += n;
            m.maxHp += n;
            m.hp += n;
          }
        }
        break;
      }
      case 'finiteWill':
        yield* this.runEffect(
          { e: 'setStats', target: { t: 'all', filter: { type: 'minion', side: 'any', excludeSelf: true } }, ...(args.stat === 'atk' ? { atk: 1 } : { hp: 1 }) },
          ctx,
        );
        break;
      case 'infinityWeapon':
        if (me.weapon) {
          me.weapon.atk += 998;
          (me.eternal ??= []).push({ ability: { on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'custom', fn: 'twWeaponAtkRestore', args: { amount: 998 } }] }, sourceCardId: ctx.sourceCardId, turn: s.turn });
        }
        break;
      case 'twWeaponAtkRestore':
        if (me.weapon) me.weapon.atk = Math.max(0, me.weapon.atk - (args.amount as number));
        break;
      // 發現帶有黑暗禮物的手下
      case 'discoverGift': {
        const opts = pickDistinct(this.randomPool(args.pool as Pool, me.id, true), 3);
        if (!opts.length) break;
        const gifts = shuffle(s, this.giftList());
        const id = yield* this.choose(ctx, opts, '發現一個帶有黑暗禮物的手下');
        const gift = gifts[opts.indexOf(id) % gifts.length];
        const hc = this.addToHand(me, id);
        if (hc) {
          this.giftHand(hc, gift, me.id);
          this.log(me.id, `${this.name(id)}帶有黑暗禮物：${gift.name}`);
          if (args.kindred && this.evalCond({ c: 'kindred' }, ctx)) hc.costMod -= 1;
        }
        break;
      }
      case 'drawUntilFull': {
        const n = MAX_HAND - me.hand.length;
        if (n > 0) yield* this.draw(me, n);
        break;
      }
      case 'emptyHand': {
        const p = args.who === 'opponent' ? foe : me;
        p.hand = [];
        this.log(p.id, `${p.name}的手牌被清空了`);
        this.questFillHand(p);
        break;
      }
      case 'acolyteInfinite': {
        const hc = pick(s, me.hand);
        if (!hc || !self) break;
        hc.costMod += 1000;
        self.counter = hc.uid;
        break;
      }
      case 'acolyteRestore': {
        const uid = (ctx.sourceSnapshot ?? self)?.counter;
        const hc = me.hand.find((h) => h.uid === uid);
        if (hc) hc.costMod -= 1000;
        break;
      }
      case 'buffHandAtk':
        for (const h of me.hand) {
          const t = this.handDef(h).type;
          if (t === 'MINION' || t === 'WEAPON') h.atkBuff += args.amount as number;
        }
        break;
      case 'bitterEnd':
        if (chosenM) {
          for (const m of [chosenM, ...this.adjacent(chosenM)]) {
            const wasDamaged = m.hp < m.maxHp;
            this.freeze(m);
            if (wasDamaged) m.dead = true;
          }
        }
        break;
      case 'flamesOfInfinity': {
        const list = foe.board.filter((m) => this.alive(m));
        const top = Math.max(0, ...list.map((m) => m.hp));
        const m = pick(s, list.filter((x) => x.hp === top));
        if (m) m.dead = true;
        break;
      }
      case 'returnSelfAtEnd':
        (me.endOfTurnCards ??= []).push(ctx.sourceCardId);
        break;
      case 'destroyMaxAtk':
        for (const m of allMinions()) if (this.atkOf(m) <= (args.atk as number)) m.dead = true;
        break;
      case 'addOverload':
        me.overloadOwed += args.amount as number;
        me.overloadTotal = (me.overloadTotal ?? 0) + (args.amount as number);
        break;
      case 'crumblecrusher': {
        const m = pick(s, foe.board.filter((x) => this.alive(x)));
        if (m) m.dead = true;
        if (foe.locations?.length) foe.locations = foe.locations.filter((l) => l !== pick(s, foe.locations!));
        yield* this.runEffect({ e: 'destroyWeapon', who: 'opponent' }, ctx);
        break;
      }
      case 'millEnemy':
        this.mill(foe, args.n as number);
        break;
      case 'endtimeMurozond': {
        const pool = this.randomPool({ type: 'MINION', race: 'DRAGON', anyClass: true }, me.id, false);
        for (let i = 0; i < MAX_BOARD && me.board.length < MAX_BOARD; i++) {
          const c = pick(s, pool);
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        yield* this.heal(me.hero.uid, me.hero.maxHp - me.hero.hp);
        (s.turnQueue ??= []).unshift(opp(me.id), opp(me.id));
        break;
      }
      // ------------------------------------------------------------ 倒轉與時光（TIME_）
      case 'twDrawBuff': {
        const drawn = yield* this.draw(me, 1, args.pool as Pool);
        for (const h of drawn) {
          h.atkBuff += args.atk as number;
          h.hpBuff += args.hp as number;
        }
        break;
      }
      case 'twDiscardOpponent':
        yield* this.runEffect({ e: 'discard', count: 1 }, { ...ctx, controller: foe.id });
        break;
      // 拉法姆們
      case 'twRafaamFinale': {
        const played = new Set(me.playedCards ?? []);
        if (RAFAAM_IDS.every((id) => played.has(id))) yield* this.runEffect({ e: 'destroy', target: { t: 'hero', side: 'enemy' } }, ctx);
        break;
      }
      case 'twDrawRafaam':
        yield* this.drawWhere(me, (h) => isRafaam(h.cardId));
        break;
      case 'twGreenRafaam':
        for (const h of me.hand) if (isRafaam(h.cardId)) {
          h.atkBuff += 2;
          h.hpBuff += 2;
        }
        for (const m of me.board) if (m !== self && isRafaam(m.cardId)) {
          m.atkBuff += 2;
          m.maxHp += 2;
          m.hp += 2;
        }
        this.recalcAuras();
        break;
      case 'twExplorerRafaam': {
        const list = me.deck.filter((h) => isRafaam(h.cardId));
        const opts: string[] = [];
        for (const h of shuffle(s, [...list])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '從你的牌堆中發現一個拉法姆');
        const hc = me.deck.find((h) => h.cardId === id);
        if (hc) yield* this.takeIntoHand(me, hc);
        break;
      }
      case 'twWarchiefRafaam':
        yield* this.runEffect({ e: 'armor', amount: me.hand.some((h) => isRafaam(h.cardId)) ? 10 : 5 }, ctx);
        break;
      case 'twMindflayerRafaam':
        if (me.hand.some((h) => isRafaam(h.cardId))) yield* this.doSummon(ctx, me.id, ctx.sourceCardId);
        break;
      case 'twCalamitousRafaam':
        for (const m of allMinions()) if (!isRafaam(m.cardId)) yield* this.damage(this.dmgSource(ctx), m.uid, 6);
        break;
      case 'twMurlocRafaam':
        (me.pendingDiscounts ??= []).push({ amount: 3, nameEn: 'Rafaam' });
        break;
      case 'twArchmageRafaam':
        for (const m of allMinions()) if (!isRafaam(m.cardId)) this.transform(m.uid, 'TIME_005t9t');
        break;
      case 'twSummonManaWorth': {
        let left = args.mana as number;
        while (left > 0 && me.board.length < MAX_BOARD) {
          const c = pick(s, this.randomPool({ type: 'MINION', maxCost: left }, me.id, false).filter((x) => x.cost >= 1));
          if (!c) break;
          left -= c.cost;
          yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      }
      case 'twHeroShield':
        me.hero.divineShield = true;
        break;
      case 'twBuffDiscovered': {
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : null;
        if (hc) {
          hc.atkBuff += args.atk as number;
          hc.hpBuff += args.hp as number;
        }
        break;
      }
      case 'twMendTimeline':
        for (let i = 0; i < 2; i++) {
          const c = pick(s, this.randomPool({ type: 'SPELL', spellSchool: 'HOLY' }, me.id, false));
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (hc) yield* this.heal(me.hero.uid, c.cost);
        }
        break;
      // 布洛克薩與阿古斯惡魔
      case 'twDrawPortal':
        yield* this.drawWhere(me, (h) => getCard(h.cardId).nameEn.includes('Portal to Argus'));
        break;
      case 'twPortal':
        yield* this.doSummon(ctx, foe.id, args.demon as string);
        break;
      case 'twArgusDeath': {
        // 惡魔的擁有者是對手：「你的對手」就是施放傳送門的玩家
        const caster = opp(ctx.controller);
        const cp = s.players[caster];
        yield* this.draw(cp, 1);
        cp.deck.splice(randomInt(s, cp.deck.length + 1), 0, this.newHandCard(args.next as string));
        break;
      }
      case 'twBroxigarReturns': {
        const cp = s.players[opp(ctx.controller)];
        if (cp.broxigar && cp.hand.length < MAX_HAND) {
          cp.hand.push(cp.broxigar);
          cp.broxigar = undefined;
          this.log(cp.id, `${cp.name}的布洛克薩回來了！`);
        }
        break;
      }
      case 'twHeroImmuneUntilNext':
        me.heroImmuneUntil = s.turn + 1;
        break;
      case 'twDrawBottom':
        for (let i = 0; i < (args.n as number); i++) {
          const hc = me.deck[0];
          if (hc) yield* this.takeIntoHand(me, hc);
        }
        break;
      // 時間碎片
      case 'twCastShred': {
        const hc = me.deck.find((h) => h.cardId === 'TIME_025t');
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        this.log(me.id, `${me.name}從牌堆施放了時間碎片`);
        yield* this.damage({ owner: me.id, uid: null, cardId: 'TIME_025t' }, me.hero.uid, 3);
        if (args.then === 'buff' && self) {
          self.atkBuff += 3;
          self.maxHp += 3;
          self.hp += 3;
        } else if (args.then === 'copy') yield* this.doSummon(ctx, me.id, ctx.sourceCardId);
        break;
      }
      case 'twDivergence': {
        const hc = pick(s, me.hand.filter((h) => this.handDef(h).type === 'MINION'));
        if (!hc || me.hand.length >= MAX_HAND) break;
        const def = this.handDef(hc);
        const cost = this.costOf(me, hc);
        const st = this.handStats(me.id, hc);
        const idx = me.hand.indexOf(hc);
        const halves = [0, 1].map(() => {
          const n = this.newHandCard(hc.cardId);
          n.costMod = Math.ceil(cost / 2) - def.cost;
          n.atkBuff = Math.ceil(st.atk / 2) - (def.attack ?? 0);
          n.hpBuff = Math.ceil(st.hp / 2) - (def.health ?? 0);
          n.enteredTurn = s.turn;
          return n;
        });
        me.hand.splice(idx, 1, ...halves);
        this.log(me.id, `${this.name(hc.cardId)}分成了兩半`);
        break;
      }
      case 'twDrawDifferentCosts': {
        const seen = new Set<number>();
        for (let i = 0; i < (args.n as number); i++) {
          const hc = pick(s, me.deck.filter((h) => !seen.has(getCard(h.cardId).cost)));
          if (!hc) break;
          seen.add(getCard(hc.cardId).cost);
          yield* this.takeIntoHand(me, hc);
        }
        break;
      }
      case 'twChronogor': {
        const sorted = [...me.deck].sort((a, b) => getCard(b.cardId).cost - getCard(a.cardId).cost);
        for (const hc of sorted.slice(0, 2)) yield* this.takeIntoHand(me, hc);
        const low = [...me.deck].sort((a, b) => getCard(a.cardId).cost - getCard(b.cardId).cost).slice(0, 2);
        for (const hc of low) {
          me.deck = me.deck.filter((h) => h !== hc);
          if (foe.hand.length < MAX_HAND) foe.hand.push(hc);
        }
        break;
      }
      case 'twCastRandomSpells':
        for (let i = 0; i < (args.n as number); i++) {
          const c = pick(s, this.randomPool(args.pool as Pool, me.id, false).filter((x) => !x.quest));
          if (c) yield* this.castRandomly(me.id, c.id);
        }
        break;
      case 'twStadiumAnnouncer': {
        for (const p of [foe, me]) {
          const c = pick(s, poolCards({ type: 'WEAPON' }, p.heroClass, p.heroClass));
          if (!c) continue;
          yield* this.equip(p.id, c.id);
          if (p === me && me.weapon) {
            me.weapon.atk += 1;
            me.weapon.durability += 1;
          }
        }
        break;
      }
      case 'twRoyalInformant': {
        const c = foe.hand[foe.hand.length - 1];
        if (!c) break;
        const id = yield* this.choose(ctx, [c.cardId, 'TIME_036t'], '獲得它的複製，或使它的消耗增加 (2)');
        if (id === 'TIME_036t') c.costMod += 2;
        else this.addToHand(me, c.cardId);
        break;
      }
      case 'twDiscoverOppHand': {
        const opts: string[] = [];
        for (const h of shuffle(s, [...foe.hand])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現對手手牌中的一張牌');
        this.addToHand(me, id);
        break;
      }
      case 'twForefather': {
        const real = pick(s, foe.hand);
        if (!real) break;
        const fakes = shuffle(s, this.randomPool({ cls: foe.heroClass }, me.id, false).filter((c) => c.id !== real.cardId)).slice(0, 2).map((c) => c.id);
        const id = yield* this.choose(ctx, shuffle(s, [real.cardId, ...fakes]), '猜猜哪一張在你對手的手牌中？');
        if (id === real.cardId && self) {
          self.maxHp += 4;
          self.hp += 4;
        }
        break;
      }
      case 'twDiscardHand':
        while (me.hand.length) {
          const hc = me.hand.pop()!;
          yield* this.discarded(me, hc);
        }
        this.questFillHand(me);
        break;
      case 'twDormantSelf':
        if (self) this.dormant(self, args.turns as number);
        break;
      case 'twCoinForTurnPlayer':
        this.addToHand(s.players[s.current], 'GAME_005');
        break;
      case 'twResetCosts':
        for (const p of s.players) for (const h of p.hand) h.costMod = 0;
        break;
      case 'twSummonDormantRandom': {
        const c = pick(s, this.randomPool({ type: 'MINION', cost: args.cost as number, anyClass: true }, me.id, false));
        const m = c ? yield* this.doSummon(ctx, me.id, c.id) : null;
        if (m) this.dormant(m, args.turns as number);
        break;
      }
      case 'twReverseDeck':
        me.deck.reverse();
        break;
      case 'twNozdormuTick': {
        if (!self || !self.keywords.includes('DORMANT') || ctx.it?.uid === self.uid) break;
        if (!ctx.itCardId || getCard(ctx.itCardId).set !== 1957) break;
        self.dormantTurns = (self.dormantTurns ?? 1) - 1;
        if (self.dormantTurns <= 0) {
          self.dormantTurns = undefined;
          self.keywords = self.keywords.filter((k) => k !== 'DORMANT');
          this.log(me.id, `${this.name(self.cardId)}甦醒了！`);
        }
        break;
      }
      case 'twCircadiamancer': {
        const c = pick(s, this.randomPool({ type: 'MINION', cost: 8, anyClass: true }, me.id, false));
        const hc = c ? this.addToHand(me, c.id) : null;
        if (hc) hc.timeDiscount = 1;
        break;
      }
      case 'twChromie': {
        const done = new Set<string>();
        for (const id of me.playedCards ?? []) {
          if (done.has(id)) continue;
          done.add(id);
          const hc = me.deck.find((h) => h.cardId === id);
          if (hc) yield* this.takeIntoHand(me, hc);
        }
        break;
      }
      // 穆拉丁與高王之錘
      case 'twBringHammer': {
        const hc = me.deck.find((h) => h.cardId === 'TIME_209t');
        if (hc && self) {
          me.deck = me.deck.filter((h) => h !== hc);
          self.stash = 'hammer';
        }
        break;
      }
      case 'twHammerBack':
        if ((ctx.sourceSnapshot ?? self)?.stash === 'hammer') this.addToHand(me, 'TIME_209t');
        break;
      case 'twHammerReturns': {
        const hc = this.newHandCard('TIME_209t');
        me.hammerBonus = (me.hammerBonus ?? 0) + 2;
        hc.atkBuff = me.hammerBonus;
        me.deck.splice(randomInt(s, me.deck.length + 1), 0, hc);
        break;
      }
      case 'twAvatarForm': {
        const c = ctx.chosen !== null ? this.char(ctx.chosen) : null;
        if (!c) break;
        c.tempAtk += 2;
        const uid = c.uid;
        for (const subject of ['friendlyHero', 'friendlyMinion'] as const) {
          (me.eternal ??= []).push({
            ability: { on: { k: 'attack', subject, after: true }, effects: [{ e: 'custom', fn: 'twAvatarHit', args: { uid } }] },
            sourceCardId: ctx.sourceCardId,
            turn: s.turn,
          });
        }
        break;
      }
      case 'twAvatarHit':
        if (ctx.it?.uid === args.uid) yield* this.runEffect({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 2 }, ctx);
        break;
      // 艾薩拉女士
      case 'twAzshara': {
        const keepZin = args.keep === 'zin';
        const gone = keepZin ? ['TIME_211t1', 'TIME_211t1t'] : ['TIME_211t2', 'TIME_211t2t'];
        const empower: [string, string] = keepZin ? ['TIME_211t2', 'TIME_211t2t'] : ['TIME_211t1', 'TIME_211t1t'];
        me.deck = me.deck.filter((h) => !gone.includes(h.cardId));
        me.hand = me.hand.filter((h) => !gone.includes(h.cardId));
        me.locations = (me.locations ?? []).filter((l) => !gone.includes(l.cardId));
        for (const h of [...me.deck, ...me.hand]) if (h.cardId === empower[0]) h.cardId = empower[1];
        for (const l of me.locations) if (l.cardId === empower[0]) l.cardId = empower[1];
        break;
      }
      case 'twWell': {
        const pool = this.randomPool({ type: 'SPELL' }, me.id, false).filter((c) => !c.quest);
        while (me.hand.length < MAX_HAND) {
          const c = pick(s, pool);
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (!hc) break;
          hc.temporary = true;
          if (args.twice) hc.castTwice = true;
        }
        break;
      }
      case 'twZinDoubled': {
        if (!chosenM) break;
        const before = new Set(me.board.map((m) => m.uid));
        yield* this.runEffect({ e: 'summonCopy', target: { t: 'chosen' }, count: 1 }, ctx);
        const m = me.board.find((x) => !before.has(x.uid));
        if (m) {
          m.atkBuff += this.atkOf(m);
          m.maxHp *= 2;
          m.hp *= 2;
        }
        break;
      }
      case 'twDivineAugur':
        for (const h of me.hand) {
          if (this.handDef(h).type !== 'MINION') continue;
          const st = this.handStats(me.id, h);
          const v = Math.max(st.atk, st.hp);
          h.atkBuff += v - st.atk;
          h.hpBuff += v - st.hp;
        }
        break;
      case 'twIntertwinedFate':
        for (const p of [me, foe]) {
          const opts: string[] = [];
          for (const h of shuffle(s, [...p.deck])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
          if (!opts.length) continue;
          const id = yield* this.choose(ctx, opts, p === me ? '發現你牌堆中一張牌的複製' : '發現對手牌堆中一張牌的複製');
          this.addToHand(me, id);
        }
        break;
      case 'twShadowStrike': {
        const m = yield* this.doSummon(ctx, me.id, 'TIME_434t');
        const t = pick(s, foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'DORMANT') && !this.hasKw(x, 'STEALTH')));
        if (m && t) {
          yield* this.doAttack(m.uid, t.uid);
          yield* this.processDeaths();
        }
        break;
      }
      case 'twDiscoverSummon': {
        const opts = pickDistinct(this.randomPool(args.pool as Pool, me.id, true), 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一條龍並召喚它');
        yield* this.doSummon(ctx, me.id, id);
        if (args.copy) this.addToHand(me, id);
        break;
      }
      case 'twImprison':
        if (chosenM && self) {
          this.dormant(chosenM, 99999);
          self.linked = chosenM.uid;
        }
        break;
      case 'twAwakenImprisoned': {
        const uid = (ctx.sourceSnapshot ?? self)?.linked;
        const m = uid !== undefined ? this.minion(uid) : null;
        if (m) {
          m.keywords = m.keywords.filter((k) => k !== 'DORMANT');
          m.dormantTurns = undefined;
        }
        break;
      }
      case 'twHoundsOfFury': {
        const hounds: Minion[] = [];
        for (const id of ['TIME_443t', 'TIME_443t2']) {
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m) hounds.push(m);
        }
        if (!me.deck.some((h) => getCard(h.cardId).type === 'MINION')) {
          for (const m of hounds) {
            const list = [foe.hero, ...foe.board].filter((c) => this.alive(c) && (isHero(c) || (!this.hasKw(c, 'STEALTH') && !this.hasKw(c, 'DORMANT'))));
            const low = Math.min(...list.map((c) => c.hp));
            const t = list.find((c) => c.hp === low);
            if (t && this.alive(m)) {
              yield* this.doAttack(m.uid, t.uid);
              yield* this.processDeaths();
            }
          }
        }
        break;
      }
      case 'twGiveShield': {
        const c = ctx.chosen !== null ? this.char(ctx.chosen) : null;
        if (!c) break;
        if (isHero(c)) c.divineShield = true;
        else if (!c.keywords.includes('DIVINE_SHIELD')) c.keywords.push('DIVINE_SHIELD');
        break;
      }
      case 'twSolitude': {
        for (let i = 0; i < 2; i++) yield* this.runEffect({ e: 'discover', pool: { type: 'MINION' } }, ctx);
        if (!me.deck.some((h) => getCard(h.cardId).type === 'MINION')) {
          const hc = pick(s, me.hand.filter((h) => this.handDef(h).type === 'MINION'));
          if (hc) hc.costMod -= 2;
        }
        break;
      }
      case 'twDrawUntil': {
        const n = (args.n as number) - me.hand.length;
        if (n > 0) yield* this.draw(me, n);
        break;
      }
      case 'twWormhole': {
        const c = pick(s, this.randomPool({ type: 'MINION', race: 'BEAST', cost: 3 }, me.id, false));
        const m = c ? yield* this.doSummon(ctx, me.id, c.id) : null;
        const t = pick(s, [foe.hero, ...foe.board].filter((x) => this.alive(x) && (isHero(x) || (!this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT')))));
        if (m && t) {
          yield* this.doAttack(m.uid, t.uid);
          yield* this.processDeaths();
        }
        break;
      }
      // 遊俠三姊妹
      case 'twSylvanas': {
        const played = me.playedCards ?? [];
        const times = 1 + (played.includes('TIME_609t1') ? 1 : 0) + (played.includes('TIME_609t2') ? 1 : 0);
        for (let i = 0; i < times; i++) yield* this.runEffect({ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 2 }, ctx);
        break;
      }
      case 'twAlleria': {
        const played = me.playedCards ?? [];
        const times = 1 + (played.includes('TIME_609') ? 1 : 0) + (played.includes('TIME_609t2') ? 1 : 0);
        for (let i = 0; i < times; i++) yield* this.runEffect({ e: 'discover', pool: { type: 'SPELL' } }, ctx);
        break;
      }
      case 'twVereesa': {
        const played = me.playedCards ?? [];
        const times = 1 + (played.includes('TIME_609') ? 1 : 0) + (played.includes('TIME_609t1') ? 1 : 0);
        for (let i = 0; i < times; i++) {
          for (const h of me.deck) if (getCard(h.cardId).type === 'MINION') {
            h.atkBuff += 1;
            h.hpBuff += 1;
          }
        }
        break;
      }
      case 'twShadowsOfYesterday':
        for (let i = 0; i < 4; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'TIME_610t2');
          if (!m) continue;
          for (const g of shuffle(s, this.giftList()).slice(0, 2)) this.giftMinion(m, g);
        }
        break;
      case 'twHealthCost': {
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : null;
        if (hc) hc.healthCostUntil = 99999;
        break;
      }
      case 'twEternalLife':
        me.eternalLife = true;
        this.log(me.id, `${me.name}的英雄獲得了「亡語：花費最多 20 具屍體復活」`);
        break;
      // 墳墓的坦吉與伯昂撒姆
      case 'twTalanji': {
        const inDeck = me.deck.find((h) => h.cardId === 'TIME_619t');
        if (inDeck) yield* this.takeIntoHand(me, inDeck);
        else if (me.graveyard.includes('TIME_619t') && me.board.length < MAX_BOARD) yield* this.doSummon(ctx, me.id, 'TIME_619t');
        yield* this.twBoon(ctx);
        break;
      }
      case 'twBoon':
        yield* this.twBoon(ctx);
        break;
      case 'twBwonsamdi': {
        const boons = (ctx.sourceSnapshot ?? self)?.counter ?? 0;
        const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, 4 + 2 * boons), anyClass: true }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'twUntimelyDeath':
        if (ctx.itCardId) yield* this.doSummon(ctx, me.id, ctx.itCardId);
        break;
      case 'twWaveshaping': {
        const opts = [...shuffle(s, [...me.deck])].slice(0, 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts.map((h) => h.cardId), '發現你牌堆中的一張牌');
        const hc = opts.find((h) => h.cardId === id) ?? opts[0];
        for (const o of opts) if (o !== hc) {
          me.deck = me.deck.filter((h) => h !== o);
          me.deck.unshift(o);
        }
        yield* this.takeIntoHand(me, hc);
        break;
      }
      case 'twHighborneMentor': {
        const opts = pickDistinct(this.randomPool({ type: 'SPELL', minCost: 7, past: true, anyClass: true }, me.id, true), 3);
        const pupil = this.addToHand(me, 'TIME_704t');
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張法術，傳授給學徒');
        if (pupil) pupil.taught = id;
        break;
      }
      case 'twPupilCast': {
        const id = ctx.playedCard?.taught;
        if (id) yield* this.castRandomly(me.id, id);
        break;
      }
      case 'twKrona':
        for (const h of me.deck.slice(0, 5)) h.costMod = 1 - getCard(h.cardId).cost;
        break;
      case 'twFinsBeyondTime':
        me.stashedHand = me.hand;
        me.hand = (me.openingHand ?? []).map((id) => this.newHandCard(id));
        break;
      case 'twAlternateReality': {
        const pool = this.randomPool({ chooseOne: true, past: true, anyClass: true }, me.id, false);
        if (!pool.length) break;
        const make = () => {
          const hc = this.newHandCard(pick(s, pool)!.id);
          hc.costMod = -1;
          return hc;
        };
        me.hand = me.hand.map(() => make());
        me.deck = me.deck.map(() => ({ ...make(), starting: true }));
        break;
      }
      case 'twFlashback':
        for (let i = 0; i < 2; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', cost: 1, past: true, anyClass: true }, me.id, false));
          const m = c ? yield* this.doSummon(ctx, me.id, c.id) : null;
          if (m && ctx.combo) m.atkBuff += 1;
        }
        break;
      case 'twFillHandCoins': {
        const p = s.players[opp(ctx.controller)];
        while (p.hand.length < MAX_HAND) this.addToHand(p, 'GAME_005');
        break;
      }
      case 'twEpoch':
        for (const m of foe.board) if (m.summonedTurn === s.turn - 1 && this.alive(m)) m.dead = true;
        break;
      case 'twSlowMotion':
        foe.cardTax = { turn: s.turn + 1, amount: 1 };
        break;
      case 'twCultivator':
        for (let i = 0; i < 2; i++) {
          const opts = pickDistinct(this.randomPool({ type: 'MINION', race: 'BEAST' }, me.id, true), 3);
          if (!opts.length) break;
          const id = yield* this.choose(ctx, opts, '發現一隻野獸，放到牌堆底部');
          const hc = this.newHandCard(id);
          hc.atkBuff = 5;
          hc.hpBuff = 5;
          me.deck.unshift(hc);
        }
        break;
      case 'twFastForward': {
        const drawn = yield* this.draw(me, 2);
        if (!drawn.length) break;
        const id = yield* this.choose(ctx, drawn.map((h) => h.cardId), '選擇一張牌，使其消耗減少 (2)');
        const hc = drawn.find((h) => h.cardId === id) ?? drawn[0];
        hc.costMod -= 2;
        break;
      }
      case 'twSilvermoon': {
        const list = foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'DORMANT') && !this.hasKw(m, 'STEALTH'));
        if (!list.length) break;
        const low = Math.min(...list.map((m) => m.hp));
        const t = args.lowest ? pick(s, list.filter((m) => m.hp === low)) : pick(s, list);
        if (!t) break;
        const excess = Math.max(0, 5 - t.hp);
        yield* this.damage(this.dmgSource(ctx), t.uid, 5);
        if (excess) yield* this.damage(this.dmgSource(ctx), foe.hero.uid, excess);
        break;
      }
      case 'twBloodFighter': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).nameEn.includes('Blood Fighter')));
        if (!hc || me.board.length >= MAX_BOARD) break;
        me.hand = me.hand.filter((h) => h !== hc);
        const m = yield* this.summon(me.id, hc.cardId, undefined, hc);
        if (!m) break;
        m.atkBuff += 5;
        m.maxHp += 5;
        m.hp += 5;
        if (args.kw && !m.keywords.includes(args.kw as Keyword)) m.keywords.push(args.kw as Keyword);
        if (args.attack) {
          const t = pick(s, [foe.hero, ...foe.board].filter((x) => this.alive(x) && (isHero(x) || (!this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT')))));
          if (t) {
            yield* this.doAttack(m.uid, t.uid);
            yield* this.processDeaths();
          }
        }
        break;
      }
      case 'twBarrage': {
        const list = foe.board.filter((m) => this.alive(m) && m.uid !== ctx.chosen).map((m) => m.uid);
        if (foe.hero.uid !== ctx.chosen) list.push(foe.hero.uid);
        for (const uid of shuffle(s, list).slice(0, 2)) yield* this.damage(this.dmgSource(ctx), uid, 2 + this.spellDamage(me.id));
        break;
      }
      case 'twExcessDraw': {
        if (!chosenM) break;
        const excess = Math.max(0, (args.amount as number) - chosenM.hp);
        yield* this.damage(this.dmgSource(ctx), chosenM.uid, args.amount as number);
        if (excess) yield* this.draw(me, excess);
        break;
      }
      case 'twAnomalize': {
        const ids: string[] = [];
        for (const cost of [10, 1]) {
          const c = pick(s, this.randomPool({ type: 'MINION', cost, anyClass: true }, me.id, false));
          if (c) ids.push(c.id);
        }
        const ms: Minion[] = [];
        for (const id of ids) {
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m) ms.push(m);
        }
        const stats = shuffle(s, ms.flatMap((m) => [this.atkOf(m), m.hp]));
        ms.forEach((m, i) => {
          m.atkBuff += stats[i * 2] - this.atkOf(m);
          m.maxHp = m.hp = stats[i * 2 + 1];
        });
        break;
      }
      case 'twFacelessEnigma': {
        const opts = pickDistinct(this.randomPool({ isSecret: true, anyClass: true }, me.id, true), 2);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '選擇一個奧秘為你施放，另一個為你的對手施放');
        const other = opts.find((o) => o !== id);
        const put = (p: PlayerState, cid: string | undefined) => {
          if (cid && p.secrets.length < MAX_SECRETS && !p.secrets.some((x) => x.cardId === cid)) p.secrets.push({ uid: this.uid(), cardId: cid });
        };
        put(me, id);
        put(foe, other);
        break;
      }
      case 'twToki': {
        const g = this.uid();
        for (let i = 0; i < 3; i++) {
          const c = pick(s, this.randomPool({ type: 'SPELL', past: true, anyClass: true }, me.id, false));
          const hc = c ? this.addToHand(me, c.id) : null;
          if (hc) hc.looping = g;
        }
        break;
      }
      case 'twFillOppBoard': {
        const pool = this.randomPool({ type: 'MINION', cost: args.cost as number, anyClass: true }, me.id, false);
        for (let i = 0; i < MAX_BOARD && foe.board.length < MAX_BOARD; i++) {
          const c = pick(s, pool);
          if (c) yield* this.doSummon(ctx, foe.id, c.id);
        }
        break;
      }
      case 'twGarona': {
        const llane = foe.hand.find((h) => h.cardId === 'TIME_875t');
        if (!llane) break;
        foe.hand = foe.hand.filter((h) => h !== llane);
        foe.hero.hp = Math.max(1, Math.ceil(foe.hero.hp / 2));
        this.log(me.id, `${me.name}消滅了萊恩國王，${foe.name}的生命值減半`);
        break;
      }
      case 'twMedivh':
        for (const m of allMinions()) if (m !== self) m.dead = true;
        break;
      default:
        yield* this.customCore(fn, args, ctx);
    }
  }

  /** 選擇一個恩澤賜予伯昂撒姆（手牌、戰場或牌堆中的那一張） */
  private *twBoon(ctx: Ctx): Gen {
    const me = this.s.players[ctx.controller];
    const id = yield* this.choose(ctx, ['TIME_619t3', 'TIME_619t4', 'TIME_619t5'], '選擇一個恩澤賜予伯昂撒姆');
    const kw: Keyword = id === 'TIME_619t3' ? 'TAUNT' : id === 'TIME_619t4' ? 'LIFESTEAL' : 'RUSH';
    const m = me.board.find((x) => x.cardId === 'TIME_619t');
    if (m) {
      if (!m.keywords.includes(kw)) m.keywords.push(kw);
      m.counter = (m.counter ?? 0) + 1;
      return;
    }
    const hc = me.hand.find((h) => h.cardId === 'TIME_619t') ?? me.deck.find((h) => h.cardId === 'TIME_619t');
    if (hc) {
      (hc.bonus ??= []).includes(kw) || hc.bonus.push(kw);
      hc.boons = (hc.boons ?? 0) + 1;
    }
  }


  // ==========================================================================
  // 核心系列
  // ==========================================================================

  /** 這個回合結束時消滅某個手下 */
  private killAtEndOfTurn(p: PlayerState, uid: number, sourceCardId: string) {
    (p.eternal ??= []).push({ ability: { on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'custom', fn: 'coKillUid', args: { uid } }] }, sourceCardId, turn: this.s.turn });
  }

  /** 英文名稱完全相同的卡（優先挑選核心系列版本） */
  private cardByNameEn(nameEn: string, type: CardType): CardDef | null {
    const all = poolCards({ type, nameEn }, 'NEUTRAL', 'NEUTRAL').filter((c) => c.nameEn === nameEn);
    return all.find((c) => c.id.startsWith('CORE_')) ?? all[0] ?? null;
  }

  /** 額外效果：隨機賦予一個手下一種額外效果 */
  private bonusEffect(m: Minion) {
    const kws: Keyword[] = ['TAUNT', 'DIVINE_SHIELD', 'RUSH', 'LIFESTEAL', 'POISONOUS', 'WINDFURY', 'REBORN', 'STEALTH'];
    const k = pick(this.s, kws)!;
    if (!m.keywords.includes(k)) m.keywords.push(k);
    this.log(m.owner, `${this.name(m.cardId)}獲得了額外效果`);
  }


  /** 深暗領域的自訂效果；回傳 false 表示不認得這個名稱 */
  private *customDark(fn: string, args: Record<string, unknown>, ctx: Ctx): Gen<boolean> {
    const s = this.s;
    const me = s.players[ctx.controller];
    const foe = s.players[opp(ctx.controller)];
    const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
    const CREW = ['GDB_471t', 'GDB_471t2', 'GDB_471t3', 'GDB_471t4', 'GDB_471t5', 'GDB_471t6', 'GDB_471t7', 'GDB_471t8'];
    const pickCard = (pool: Pool) => pick(s, this.randomPool(pool, me.id, false));
    switch (fn) {
      case 'gdQueue':
        (me.draeneiFx ??= []).push({ k: args.k as never, atk: args.atk as number | undefined, hp: args.hp as number | undefined, kw: args.kw as string[] | undefined, n: (args.n as number) ?? 1, src: ctx.sourceUid ?? undefined });
        return true;
      case 'gdShuffleHand': {
        const cards = me.hand;
        me.hand = [];
        for (const hc of cards) this.shuffleInto(me, hc);
        return true;
      }
      case 'gdStars':
        if (me.hand.length < MAX_HAND) me.hand.unshift(this.newHandCard('GDB_118t'));
        if (me.hand.length < MAX_HAND) me.hand.push(this.newHandCard('GDB_118t2'));
        return true;
      case 'gdMeeting': {
        const crew = () => pick(s, CREW)!;
        const demon = pickCard({ type: 'MINION', race: 'DEMON', maxCost: 3, anyClass: true });
        if (me.hand.length + 3 > MAX_HAND) return true;
        this.addToHand(me, crew());
        if (demon) this.addToHand(me, demon.id);
        this.addToHand(me, crew());
        return true;
      }
      case 'gdForeboding':
        me.nonStartDemonDiscount = (me.nonStartDemonDiscount ?? 0) + 1;
        return true;
      case 'gdInfernal': {
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!t) return true;
        yield* this.runEffects([{ e: 'buff', target: { t: 'chosen' }, atk: 3, hp: 3 }], ctx);
        if (getCard(t.cardId).races?.includes('DEMON')) (me.pendingDiscounts ??= []).push({ amount: 2, race: 'DEMON' });
        return true;
      }
      case 'gdAbduction': {
        const c = pickCard({ type: 'MINION', race: 'DEMON', anyClass: true });
        const hc = c ? this.addToHand(me, c.id) : null;
        if (hc) hc.costMod -= 2;
        return true;
      }
      case 'gdHealthstone': {
        const n = this.dyn('heroDamageThisTurn', ctx);
        if (n > 0) yield* this.heal(me.hero.uid, n);
        return true;
      }
      case 'gdStealHealth': {
        const t = pick(s, [...foe.board.filter((m) => this.alive(m)), foe.hero]);
        if (!t) return true;
        yield* this.damage(this.dmgSource(ctx), t.uid, 2);
        if (self) {
          self.maxHp += 2;
          self.hp += 2;
        }
        return true;
      }
      case 'gdDoommaiden': {
        const hc = foe.deck.pop();
        if (!hc || me.hand.length >= MAX_HAND) return true;
        hc.borrowed = foe.id;
        me.hand.push(hc);
        return true;
      }
      case 'gdVelen': {
        let skipSelf = true;
        for (const id of [...(me.playedDraenei ?? [])]) {
          if (id === ctx.sourceCardId && skipSelf) {
            skipSelf = false;
            continue;
          }
          const d = getCard(id);
          for (const ab of d.abilities ?? []) {
            if (ab.on.k !== 'play' && ab.on.k !== 'deathrattle') continue;
            if (ab.cond && !this.evalCond(ab.cond, { ...ctx, sourceCardId: id })) continue;
            yield* this.runEffects(ab.effects, { ...ctx, sourceCardId: id, chosen: null });
          }
          if (this.over) return true;
        }
        return true;
      }
      case 'gdWrathguard': {
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!t) return true;
        yield* this.damage(this.dmgSource(ctx), t.uid, 2);
        if (t.hp <= 0 || t.dead) yield* this.runEffects([{ e: 'discover', pool: { type: 'MINION', race: 'DEMON' } }], ctx);
        return true;
      }
      case 'gdPocket': {
        const seen = new Set<string>();
        for (let i = 0; i < 12; i++) {
          const opts = this.discoverOptions({ type: 'SPELL' }, me.id);
          if (!opts.length) break;
          const repeat = opts.some((o) => seen.has(o));
          const id = yield* this.choose(ctx, opts, '發現一張法術');
          this.addToHand(me, id);
          for (const o of opts) seen.add(o);
          if (repeat) break;
        }
        return true;
      }
      case 'gdHataaru': {
        const opts = this.discoverOptions({ type: 'SPELL' }, me.id);
        if (!opts.length) return true;
        const id = yield* this.choose(ctx, opts, '發現一張法術（消耗減少 (1)）');
        const hc = this.addToHand(me, id);
        if (hc) {
          hc.costMod -= 1;
          hc.hataaru = s.turn;
        }
        return true;
      }
      case 'gdClarity': {
        const drawn = yield* this.draw(me, 2, { type: 'MINION' });
        if (this.evalCond({ c: 'selfCostZero' }, ctx)) for (const hc of drawn) {
          hc.atkBuff += 2;
          hc.hpBuff += 1;
        }
        return true;
      }
      case 'gdFaith':
        for (const m of me.board) if (m.cardId === 'GDB_139t' && !m.keywords.includes('RUSH')) {
          m.keywords.push('RUSH');
          m.sleeping = false;
        }
        return true;
      case 'gdYrel': {
        const used = new Set<string>();
        for (let i = 0; i < 3; i++) {
          const c = pick(s, this.randomPool({ type: 'SPELL', libram: true, past: true, anyClass: true }, me.id, false).filter((x) => !used.has(x.nameEn)));
          if (!c) break;
          used.add(c.nameEn);
          this.addToHand(me, c.id);
        }
        return true;
      }
      case 'gdShaffar': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'MINION' && !h.grant?.some((a) => a.effects.some((e) => e.e === 'custom' && e.fn === 'gdShaffar'))));
        if (!hc) return true;
        hc.atkBuff += 3;
        hc.hpBuff += 3;
        (hc.grant ??= []).push({ on: { k: 'spellCast', side: 'friendly' }, once: true, effects: [{ e: 'custom', fn: 'gdShaffar' }] });
        return true;
      }
      case 'gdKiljaeden':
        me.deck = [];
        me.portal = { turn: s.turn };
        return true;
      case 'gdJettison': {
        const first = this.discoverOptions({ type: 'SPELL' }, me.id);
        if (first.length) this.addToHand(me, yield* this.choose(ctx, first, '發現一張法術'));
        if (me.hero.armor >= 2) {
          me.hero.armor -= 2;
          const second = this.discoverOptions({ type: 'SPELL' }, me.id);
          if (second.length) this.addToHand(me, yield* this.choose(ctx, second, '發現另一張法術'));
        }
        return true;
      }
      case 'gdDwarfPlanet': {
        const made: Minion[] = [];
        while (me.board.length < MAX_BOARD) {
          const c = pickCard({ type: 'MINION', cost: 2 });
          if (!c) break;
          const m = yield* this.doSummon(ctx, me.id, c.id);
          if (!m) break;
          m.sleeping = false;
          made.push(m);
        }
        for (const m of made) {
          if (!this.alive(m)) continue;
          const t = pick(s, [...foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT')), foe.hero]);
          if (t) yield* this.forceAttack(m, t);
        }
        return true;
      }
      case 'gdMoldara': {
        const spore = me.deck.find((h) => h.cardId === 'GDB_234t');
        if (spore) {
          me.deck.splice(me.deck.indexOf(spore), 1);
          yield* this.customDark('gdSporeEffect', {}, ctx);
        }
        return true;
      }
      case 'gdSporeEffect': {
        const id = me.sporeCard ?? pickCard({ type: 'MINION', cost: 5 })?.id;
        if (!id) return true;
        me.sporeCard = id;
        yield* this.doSummon(ctx, me.id, id);
        return true;
      }
      case 'gdAkama':
        for (const m of me.board) if (m !== self && this.alive(m)) m.attacks = 0;
        return true;
      case 'gdSupernova':
        while (me.hand.length < MAX_HAND) {
          const c = pickCard({ type: 'SPELL', spellSchool: 'FIRE', anyClass: true });
          const hc = c ? this.addToHand(me, c.id) : null;
          if (!c || !hc) break;
          hc.costMod = 1 - c.cost;
        }
        return true;
      case 'gdAccretion': {
        for (let i = 0; i < 3; i++) {
          const hc = me.deck.pop();
          if (!hc) break;
          const d = getCard(hc.cardId);
          if ((d.type === 'SPELL' && d.spellSchool === 'FIRE') || d.races?.includes('ELEMENTAL')) {
            if (me.hand.length < MAX_HAND) me.hand.push(hc);
            else this.fx({ kind: 'burn', cardId: hc.cardId, player: me.id });
          } else this.fx({ kind: 'burn', cardId: hc.cardId, player: me.id });
        }
        return true;
      }
      case 'gdBlasteroid':
        for (let i = 0; i < 5; i++) {
          const c = pickCard({ type: 'SPELL', spellSchool: 'FIRE', anyClass: true });
          if (!c) break;
          const hc = this.newHandCard(c.id);
          hc.costMod -= 2;
          this.shuffleInto(me, hc);
        }
        return true;
      case 'gdSaruun':
        for (const hc of me.deck) if (getCard(hc.cardId).races?.includes('ELEMENTAL')) hc.fireDmg = (hc.fireDmg ?? 0) + 1;
        return true;
      case 'gdCurator': {
        const spell = ctx.itCardId ? getCard(ctx.itCardId) : null;
        const c = spell ? pickCard({ type: 'MINION', cost: Math.min(10, spell.cost) }) : null;
        const hc = c ? this.addToHand(me, c.id) : null;
        if (c && hc) hc.costMod = -c.cost;
        return true;
      }
      case 'gdBonusSelf':
        if (self && this.alive(self)) this.bonusEffect(self);
        return true;
      case 'gdAsteroid':
        yield* this.runEffects([{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 + (me.asteroidBonus ?? 0), spell: true }], { ...ctx, isSpell: true });
        return true;
      case 'gdAsteroidBonus':
        me.asteroidBonus = (me.asteroidBonus ?? 0) + 1;
        return true;
      case 'gdShuffleAsteroids':
        for (let i = 0; i < (args.n as number); i++) this.shuffleInto(me, this.newHandCard('GDB_430'));
        return true;
      case 'gdTocha':
        if (me.hero.hp + foe.hero.hp === 42) {
          me.hero.maxHp = Math.max(me.hero.maxHp, 42);
          me.hero.hp = 42;
        }
        return true;
      case 'gdCosmonaut': {
        const spells = shuffle(s, me.deck.filter((h) => getCard(h.cardId).type === 'SPELL')).slice(0, 3);
        const hc = yield* this.chooseFromList(ctx, spells, '從你的牌堆發現一張法術');
        if (!hc) return true;
        me.deck.splice(me.deck.indexOf(hc), 1);
        hc.costMod -= 5;
        if (me.hand.length < MAX_HAND) me.hand.push(hc);
        return true;
      }
      case 'gdLens':
        if (me.board.length + (me.locations?.length ?? 0) < MAX_BOARD) (me.locations ??= []).push({ uid: this.uid(), cardId: 'GDB_136t', owner: me.id, durability: 2, cooldown: 0 });
        return true;
      case 'gdLensCast': {
        const loc = me.locations?.find((l) => l.uid === ctx.sourceUid);
        if (loc?.absorbed) yield* this.castRandomly(me.id, loc.absorbed);
        return true;
      }
      case 'gdWayfinder':
        if (self) {
          this.bonusEffect(self);
          this.bonusEffect(self);
        }
        (me.draeneiFx ??= []).push({ k: 'bonus2', n: 1, src: ctx.sourceUid ?? undefined });
        return true;
      case 'gdTriangulate': {
        const names = new Set<string>();
        const spells = shuffle(s, me.deck.filter((h) => getCard(h.cardId).type === 'SPELL')).filter((h) => !names.has(getCard(h.cardId).nameEn) && names.add(getCard(h.cardId).nameEn)).slice(0, 3);
        const hc = yield* this.chooseFromList(ctx, spells, '從你的牌堆發現一張不同的法術');
        if (!hc) return true;
        me.deck.splice(me.deck.indexOf(hc), 1);
        if (me.hand.length < MAX_HAND) me.hand.push(hc);
        for (let i = 0; i < 3; i++) this.shuffleInto(me, this.newHandCard(hc.cardId));
        return true;
      }
      case 'gdCombustion': {
        let t: Char | undefined;
        const list = [...foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH') && !this.hasKw(m, 'DORMANT')), foe.hero];
        if (me.elementalLastTurn) t = yield* this.chooseTarget(me.id, list, '選擇一個敵人（造成 4 點傷害）');
        else t = pick(s, list);
        if (t) yield* this.damage(this.dmgSource(ctx), t.uid, 4 + this.spellDamage(me.id));
        return true;
      }
      case 'gdDivineStar': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (hc) hc.hpBuff += 3;
        return true;
      }
      case 'gdVigilant': {
        const id = me.playedDraenei?.[me.playedDraenei.length - 1];
        if (id) this.addToHand(me, id);
        return true;
      }
      case 'gdSatellite': {
        for (let i = 0; i < (ctx.playedCard?.adjPlayedTurn === s.turn ? 2 : 1); i++) {
          const opts = this.discoverOptions({ type: 'MINION', race: 'DRAENEI' }, me.id);
          if (opts.length) this.addToHand(me, yield* this.choose(ctx, opts, '發現一個德萊尼'));
        }
        return true;
      }
      case 'gdLapse':
        for (const m of [...me.board, ...foe.board]) {
          if (!this.alive(m)) continue;
          const v = Math.min(this.atkOf(m), m.hp);
          this.setStats(m, v, v);
        }
        return true;
      case 'gdQuasar': {
        const cards = me.hand;
        me.hand = [];
        for (const hc of cards) this.shuffleInto(me, hc);
        for (const hc of me.deck) hc.costMod -= 3;
        return true;
      }
      case 'gdCrewmate':
        this.addToHand(me, pick(s, CREW)!);
        return true;
      case 'gdAdjoining': {
        const i = ctx.handIndex ?? 0;
        const near = [me.hand[i - 1], me.hand[i]].filter((h): h is HandCard => !!h && CREW.includes(h.cardId));
        me.hand = me.hand.filter((h) => !near.includes(h));
        for (const h of near) yield* this.doSummon(ctx, me.id, h.cardId);
        return true;
      }
      case 'gdNebula':
        for (let i = 0; i < 2; i++) {
          const opts = this.discoverOptions({ type: 'MINION', cost: 8 }, me.id);
          if (!opts.length) break;
          const id = yield* this.choose(ctx, opts, '發現一個 8 費手下');
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m) for (const k of ['TAUNT', 'ELUSIVE'] as Keyword[]) if (!m.keywords.includes(k)) m.keywords.push(k);
        }
        return true;
      case 'gdLibramDiscount':
        me.libramDiscount = (me.libramDiscount ?? 0) + 1;
        return true;
      case 'gdHologram':
        for (let i = 0; i < 3; i++) {
          const c = pickCard({ type: 'MINION', race: 'DRAENEI', anyClass: true });
          const hc = c ? this.addToHand(me, c.id) : null;
          if (hc) hc.temporary = true;
        }
        return true;
      case 'gdEgg': {
        const m = yield* this.doSummon(ctx, me.id, 'GDB_840t');
        if (!m) return true;
        m.sleeping = false;
        const list = [...foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT')), foe.hero];
        const low = Math.min(...list.map((x) => x.hp));
        const t = pick(s, list.filter((x) => x.hp === low));
        if (t) yield* this.forceAttack(m, t);
        return true;
      }
      case 'gdGormStart':
        if (self) this.goDormantFor(self, 5);
        return true;
      case 'gdGormEat': {
        if (!self || !self.keywords.includes('DORMANT')) return true;
        const right = me.board[me.board.indexOf(self) + 1];
        if (right && this.alive(right)) {
          right.dead = true;
          self.dormantTurns = Math.max(1, (self.dormantTurns ?? 1) - 2);
        }
        return true;
      }
      case 'gdHeroImmune':
        me.heroImmuneUntil = s.turn;
        return true;
      case 'gdNaielle':
        this.setHeroPower(me, 'GDB_846hp');
        return true;
      case 'gdTracking': {
        const opts = shuffle(s, [...me.deck]).slice(0, 3);
        const hc = yield* this.chooseFromList(ctx, opts, '從你的牌堆發現一張牌');
        if (hc) yield* this.takeIntoHand(me, hc);
        return true;
      }
      case 'gdStun': {
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (t) this.goDormantFor(t, 2);
        return true;
      }
      case 'gdRevelation': {
        const [hc] = yield* this.draw(me, 1);
        if (hc && getCard(hc.cardId).type === 'SPELL') hc.costMod -= 1;
        return true;
      }
      case 'gdUluu': {
        const n = ctx.playedCard?.counter ?? 0;
        if (n <= 0) return true;
        const picks = shuffle(s, COLLECTIBLE.filter((c) => c.chooseOne && c.type !== 'LOCATION')).slice(0, Math.min(6, n * 2));
        const options = picks.flatMap((c) => c.chooseOne!.filter((o) => !o.target)).slice(0, Math.min(6, n * 2));
        if (!options.length) return true;
        const labels = options.map((o) => picks.find((c) => c.chooseOne!.includes(o))!.id);
        const id = yield* this.choose(ctx, labels, '選擇一個效果');
        const opt = options[labels.indexOf(id)] ?? options[0];
        for (const ab of opt.abilities ?? []) yield* this.runEffects(ab.effects, { ...ctx, chosen: null });
        return true;
      }
      case 'gdCostOne': {
        const hc = ctx.it?.kind === 'hand' ? this.handCard(ctx.it.uid)?.card : undefined;
        if (hc) hc.costMod = 1 - getCard(hc.cardId).cost;
        return true;
      }
      case 'gdCrusader':
        for (let i = 0; i < 2; i++) {
          const c = pickCard({ type: 'SPELL', spellSchool: 'HOLY', anyClass: true });
          const hc = c ? this.addToHand(me, c.id) : null;
          if (hc) hc.costMod -= 3;
        }
        return true;
      case 'gdTrailblazer': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'SPELL'));
        if (hc) hc.costMod = getCard(ctx.sourceCardId).cost - getCard(hc.cardId).cost;
        return true;
      }
      case 'gdComboTwice':
        me.comboDouble = true;
        return true;
      case 'gdAstrobiologist':
        me.discoverNextTurn = true;
        return true;
      case 'gdEscapePod': {
        const pos = ctx.position ?? 0;
        for (const m of [me.board[pos - 1], me.board[pos]]) {
          if (!m || !this.alive(m)) continue;
          m.atkBuff += 1;
          m.maxHp += 1;
          m.hp += 1;
          if (!m.keywords.includes('RUSH')) m.keywords.push('RUSH');
          m.sleeping = false;
        }
        return true;
      }
      case 'gdBraingill':
        for (const m of me.board) if (m !== self && this.alive(m) && this.isRace(m.cardId, 'MURLOC')) m.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'draw', count: 1, who: 'self' }] });
        return true;
      case 'gdPressure':
        for (const h of me.hand) if (JSON.stringify(getCard(h.cardId).abilities ?? []).includes('"c":"combo"')) h.costMod -= 1;
        return true;
      case 'beMother': {
        // M.O.T.H.E.R.：降低手牌中一張牌的消耗 5 點，向左右延伸時每格少減 1 點
        const hc = yield* this.chooseFromList(ctx, me.hand, '選擇一張手牌，降低它的消耗');
        if (!hc) return true;
        const i = me.hand.indexOf(hc);
        for (let d = 0; d < 5; d++) {
          for (const j of d === 0 ? [i] : [i - d, i + d]) if (me.hand[j]) me.hand[j].costMod -= 5 - d;
        }
        return true;
      }
      case 'beIsiset':
        for (let i = 0; i < 2; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'BE_T_CONSTRUCT');
          if (m) {
            m.shaped = 15;
            if (!m.keywords.includes('CANT_ATTACK')) m.keywords.push('CANT_ATTACK');
          }
        }
        return true;
      case 'gdArchimonde':
        for (const id of [...(me.nonStartDemons ?? [])]) {
          if (me.board.length >= MAX_BOARD) break;
          yield* this.doSummon(ctx, me.id, id);
        }
        return true;
      case 'scRush':
        me.zergRushTurn = s.turn;
        return true;
      case 'scBaneling':
        this.addToHand(me, 'SC_019t');
        if (me.board.some((m) => this.alive(m) && getCard(m.cardId).zerg)) this.addToHand(me, 'SC_019t');
        return true;
      case 'scInfestor':
        me.zergAtk = (me.zergAtk ?? 0) + 1;
        return true;
      case 'scRavage': {
        const z = me.board.filter((m) => this.alive(m) && getCard(m.cardId).zerg).length;
        yield* this.runEffects([{ e: 'splitDamage', filter: { type: 'character', side: 'enemy' }, amount: 3 + z }], ctx);
        return true;
      }
      case 'scHydralisk': {
        const n = 1 + me.board.filter((m) => m !== self && this.alive(m) && getCard(m.cardId).zerg).length;
        for (let i = 0; i < n; i++) yield* this.runEffects([{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 2 }], ctx);
        return true;
      }
      case 'scLurker': {
        const a = ctx.it ? this.minion(ctx.it.uid) : null;
        const n = a && getCard(a.cardId).zerg ? 2 : 1;
        yield* this.runEffects([{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: n }], ctx);
        return true;
      }
      case 'scRoach':
        if (self && me.board.some((m) => m !== self && this.alive(m) && getCard(m.cardId).zerg)) {
          self.atkBuff += 1;
          self.maxHp += 2;
          self.hp += 2;
        }
        return true;
      case 'scRoachDraw':
        this.addToHand(me, 'SC_012');
        return true;
      case 'scGrunty': {
        const shots: Minion[] = [];
        for (let i = 0; i < 4; i++) {
          const c = pickCard({ type: 'MINION', race: 'MURLOC', anyClass: true });
          if (!c) break;
          const m = yield* this.doSummon(ctx, me.id, c.id);
          if (!m) break;
          m.sleeping = false;
          shots.push(m);
        }
        for (const m of shots) {
          if (!this.alive(m)) continue;
          const list = foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT'));
          if (!list.length) break;
          const t = yield* this.chooseTarget(me.id, list, '選擇一個敵方手下，用這隻魚人攻擊它');
          if (t) yield* this.forceAttack(m, t);
        }
        return true;
      }
      case 'scNydus': {
        const drawn = yield* this.draw(me, 2, { zerg: true });
        for (const hc of drawn) {
          hc.costMod -= 1;
          hc.nydus = s.turn;
        }
        return true;
      }
      case 'scViper': {
        const hc = pick(s, foe.hand.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc || foe.board.length >= MAX_BOARD) return true;
        foe.hand.splice(foe.hand.indexOf(hc), 1);
        const m = yield* this.doSummon(ctx, foe.id, hc.cardId);
        if (!m) return true;
        for (const z of me.board.filter((x) => x !== self && this.alive(x) && getCard(x.cardId).zerg)) {
          if (!z.keywords.includes('REBORN')) z.keywords.push('REBORN');
          if (this.alive(m)) yield* this.forceAttack(z, m);
        }
        return true;
      }
      case 'scConsume': {
        const locs = me.locations ?? [];
        if (!locs.length) return true;
        const loc = locs.length === 1 ? locs[0] : locs.find((l) => l.cardId === ctx.sourceCardId) ?? locs[0];
        loc.durability--;
        if (loc.durability <= 0) me.locations = locs.filter((l) => l !== loc);
        yield* this.heal(me.hero.uid, 8);
        return true;
      }
      case 'scEvolution':
        for (const m of me.board) {
          if (!this.alive(m)) continue;
          m.atkBuff += 1;
          if (getCard(m.cardId).zerg) {
            m.atkBuff += 1;
            m.maxHp += 1;
            m.hp += 1;
          }
        }
        return true;
      case 'scChrono':
        yield* this.draw(me, 2, { protoss: true });
        yield* this.doSummon(ctx, me.id, 'SC_751t');
        return true;
      case 'scTemplar': {
        const other = me.board.find((m) => m !== self && this.alive(m) && ['SC_752', 'SC_765'].includes(m.cardId));
        if (!self || !other) return true;
        other.dead = true;
        self.dead = true;
        yield* this.doSummon(ctx, me.id, 'SC_671t1');
        return true;
      }
      case 'scPhoton': {
        const t = ctx.chosen !== null ? this.char(ctx.chosen) : null;
        if (!t) return true;
        yield* this.damage(this.dmgSource({ ...ctx, isSpell: true }), t.uid, 3 + this.spellDamage(me.id));
        if (!isHero(t) && (t.hp <= 0 || t.dead)) me.protossMinionDiscount = (me.protossMinionDiscount ?? 0) + 1;
        return true;
      }
      case 'scArtanis':
        me.protossMinionDiscount = (me.protossMinionDiscount ?? 0) + 2;
        return true;
      case 'scTwinBlades':
        me.hero.tempAtk += 1;
        return true;
      case 'scCarrier': {
        const made: Minion[] = [];
        for (let i = 0; i < 4; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'SC_756t');
          if (!m) break;
          m.sleeping = false;
          made.push(m);
        }
        for (const m of made) {
          if (!this.alive(m)) continue;
          const t = pick(s, [...foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH') && !this.hasKw(x, 'DORMANT')), foe.hero]);
          if (t) yield* this.forceAttack(m, t);
        }
        return true;
      }
      case 'scHallucination': {
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!t) return true;
        const m = yield* this.doSummon(ctx, me.id, t.cardId);
        if (m) m.doubleDmg = true;
        return true;
      }
      case 'scColossus': {
        const x = 1 + (me.protossSpells ?? 0);
        for (let i = 0; i < 2; i++) yield* this.runEffects([{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: x }], ctx);
        return true;
      }
      case 'scBlinkDiscount': {
        const hc = me.hand[me.hand.length - 1];
        if (hc && getCard(hc.cardId).protoss) hc.costMod -= 2;
        return true;
      }
      case 'scImmortal':
        if (self && me.mana >= 4) {
          me.mana -= 4;
          self.atkBuff += this.atkOf(self);
          self.maxHp += self.maxHp;
          self.hp += self.hp;
        }
        return true;
      case 'scSentry':
        me.protossMinionDiscount = (me.protossMinionDiscount ?? 0) + 1;
        return true;
    }
    return false;
  }

  private *customCore(fn: string, args: Record<string, unknown>, ctx: Ctx): Gen {
    const s = this.s;
    const me = s.players[ctx.controller];
    const foe = s.players[opp(ctx.controller)];
    const self = ctx.sourceUid !== null ? this.minion(ctx.sourceUid) : null;
    const chosenM = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
    const allMinions = () => [...s.players[0].board, ...s.players[1].board].filter((m) => this.alive(m));
    const pickDistinct = (cards: CardDef[], n: number) => {
      const out: string[] = [];
      for (const c of shuffle(s, [...cards])) {
        if (out.length >= n) break;
        if (!out.some((o) => getCard(o).name === c.name)) out.push(c.id);
      }
      return out;
    };
    const randomEnemyTarget = () => pick(s, [foe.hero, ...foe.board].filter((c) => this.alive(c) && (isHero(c) || (!this.hasKw(c, 'STEALTH') && !this.hasKw(c, 'DORMANT')))));
    switch (fn) {
      case 'coKillUid': {
        const m = this.minion(args.uid as number);
        if (m) m.dead = true;
        break;
      }
      case 'coDiscoverSummon': {
        const opts = pickDistinct(this.randomPool(args.pool as Pool, me.id, true), 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個手下並召喚它');
        const m = yield* this.doSummon(ctx, me.id, id);
        if (m && args.freeze) this.freeze(m);
        if (args.copy) this.addToHand(me, id);
        break;
      }
      case 'coIceTrap': {
        // 冰凍陷阱 / 冰霜陷阱：把法術 / 攻擊的手下移回手牌，消耗增加
        const caster = s.players[s.current];
        this.spellCountered = true;
        if (ctx.itCardId) {
          const hc = this.addToHand(caster, ctx.itCardId);
          if (hc) hc.costMod += 1;
        }
        break;
      }
      case 'coDrawCosts':
        for (const cost of args.costs as number[]) {
          const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === args.type && getCard(h.cardId).cost === cost));
          if (hc) yield* this.takeIntoHand(me, hc);
        }
        break;
      case 'coBladestorm':
        for (let i = 0; i < 60; i++) {
          for (const m of allMinions()) yield* this.damage(this.dmgSource(ctx), m.uid, 1 + this.spellDamage(me.id));
          if (s.players.some((pl) => pl.board.some((m) => m.hp <= 0 || m.dead))) break;
        }
        break;
      case 'coBattleToDeath':
        if (self && chosenM) {
          for (let i = 0; i < 200 && this.alive(self) && this.alive(chosenM); i++) {
            yield* this.damage(this.charSource(self), chosenM.uid, this.atkOf(self));
            if (this.alive(chosenM)) yield* this.damage(this.charSource(chosenM), self.uid, this.atkOf(chosenM));
          }
        }
        break;
      case 'coPorcupine': {
        const n = this.atkOf(ctx.sourceSnapshot ?? self ?? ({ owner: me.id, baseAtk: 0, atkBuff: 0, tempAtk: 0, auraAtk: 0, enrageAtk: 0, hp: 0, maxHp: 0, silenced: false } as unknown as Minion));
        for (let i = 0; i < n; i++) {
          const t = randomEnemyTarget();
          if (t) yield* this.damage(this.dmgSource(ctx), t.uid, 1);
        }
        break;
      }
      case 'coTopDeck': {
        const opts = shuffle(s, [...me.deck]).slice(0, 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts.map((h) => h.cardId), '選擇一張牌放到牌堆頂');
        const hc = opts.find((h) => h.cardId === id) ?? opts[0];
        me.deck = me.deck.filter((h) => h !== hc);
        me.deck.push(hc);
        break;
      }
      case 'coLiadrin':
        for (const id of me.spellsOnMinions ?? []) this.addToHand(me, id);
        break;
      case 'coMetamorphosis': {
        const used = me.heroPower.used;
        me.powerSwap = { back: me.heroPower.id === 'BT_429p2' || me.heroPower.id === 'BT_429p' ? me.powerSwap?.back ?? HEROES[me.heroClass].power.id : me.heroPower.id, uses: 2 };
        this.setHeroPower(me, 'BT_429p');
        me.heroPower.used = used;
        break;
      }
      case 'coHeroAttackAgain':
        if (me.glaiveTurn !== s.turn) {
          me.glaiveTurn = s.turn;
          me.hero.attacks = Math.max(0, me.hero.attacks - 1);
        }
        break;
      case 'coResurrectBest': {
        const list = me.graveyard.filter((id) => !args.race || this.isRace(id, args.race as Race));
        const top = Math.max(-1, ...list.map((id) => getCard(id).cost));
        const id = pick(s, list.filter((x) => getCard(x).cost === top));
        if (id) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coUlfar':
        for (const m of me.board) if (m !== self) m.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'coUlfarSummon' }] });
        break;
      case 'coUlfarSummon': {
        const cost = getCard((ctx.sourceSnapshot ?? self)?.cardId ?? ctx.sourceCardId).cost;
        const c = pick(s, this.randomPool({ type: 'MINION', cost, anyClass: true }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'coDrawCostMod': {
        const drawn = yield* this.draw(me, 1);
        for (const h of drawn) h.costMod -= args.amount as number;
        break;
      }
      case 'coRitualOfDoom': {
        if (!chosenM) break;
        const n = me.board.filter((m) => this.alive(m)).length;
        chosenM.dead = true;
        if (n >= 5) yield* this.doSummon(ctx, me.id, 'CS3_002t');
        break;
      }
      case 'coFelsoul': {
        const hc = pick(s, foe.hand.filter((h) => this.handDef(h).type === 'MINION'));
        if (!hc) break;
        foe.hand = foe.hand.filter((h) => h !== hc);
        if (self) self.stash = hc.cardId;
        yield* this.discarded(foe, hc);
        break;
      }
      case 'coFelsoulReturn': {
        const id = (ctx.sourceSnapshot ?? self)?.stash;
        if (id) this.addToHand(foe, id);
        break;
      }
      case 'coCopyLastOpp': {
        const id = foe.playedCards?.[foe.playedCards.length - 1];
        if (id) this.addToHand(me, id);
        break;
      }
      case 'coKorvasWait':
        me.korvasPending = true;
        break;
      case 'coRafaamReplace': {
        const pool = this.randomPool({ type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, me.id, false);
        const make = () => this.newHandCard(pick(s, pool)!.id);
        if (!pool.length) break;
        me.hand = me.hand.map(() => make());
        me.deck = me.deck.map(() => ({ ...make(), starting: true }));
        break;
      }
      case 'coResurrectRandom': {
        const id = pick(s, me.graveyard.filter((x) => !args.race || this.isRace(x, args.race as Race)));
        if (id) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coPerformers': {
        const uids: number[] = [];
        for (let i = 0; i < 7; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'BT_036t');
          if (m) uids.push(m.uid);
        }
        me.performers = { turn: s.turn, uids, done: false };
        break;
      }
      case 'coZai': {
        const left = me.hand[0];
        const right = me.hand[me.hand.length - 1];
        for (const hc of left === right ? [left] : [left, right]) if (hc) this.addToHand(me, hc.cardId);
        break;
      }
      case 'coTotemBuff':
        for (const m of me.board) if (this.isRace(m.cardId, 'TOTEM')) {
          m.atkBuff += 1;
          m.maxHp += 1;
          m.hp += 1;
        }
        for (const h of [...me.hand, ...me.deck]) if (this.handDef(h).type === 'MINION' && this.isRace(h.cardId, 'TOTEM')) {
          h.atkBuff += 1;
          h.hpBuff += 1;
        }
        this.recalcAuras();
        break;
      case 'coGreybough': {
        const m = pick(s, me.board.filter((x) => this.alive(x) && x !== self && x !== ctx.sourceSnapshot));
        if (m) m.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'summon', card: ctx.sourceCardId, count: 1, who: 'self' }] });
        break;
      }
      case 'coAttackAllOthers':
        if (self) {
          for (const t of allMinions().filter((m) => m !== self)) {
            if (!this.alive(self)) break;
            if (!this.alive(t)) continue;
            yield* this.doAttack(self.uid, t.uid);
          }
        }
        break;
      case 'coFlik': {
        if (!chosenM) break;
        const id = chosenM.cardId;
        for (const pl of s.players) {
          pl.deck = pl.deck.filter((h) => h.cardId !== id);
          pl.hand = pl.hand.filter((h) => h.cardId !== id);
          for (const m of pl.board) if (m.cardId === id) m.dead = true;
        }
        break;
      }
      case 'coMurozond': {
        const ids = foe.playedThisTurn && foe.playedThisTurn.turn === s.turn - 1 ? [...foe.playedThisTurn.ids] : [];
        for (const id of ids) {
          const t = getCard(id).type;
          if (t === 'SPELL') yield* this.castRandomly(me.id, id);
          else if (t === 'MINION') yield* this.doSummon(ctx, me.id, id);
          else if (t === 'WEAPON') yield* this.equip(me.id, id);
          if (this.over) return;
        }
        break;
      }
      case 'coDiscoverDeck': {
        const cands = me.deck.filter((h) => {
          const d = getCard(h.cardId);
          if (args.type && d.type !== args.type) return false;
          if (args.race && !this.isRace(h.cardId, args.race as Race)) return false;
          if (args.classCard && cardClasses(d).includes('NEUTRAL')) return false;
          return true;
        });
        const opts: string[] = [];
        for (const h of shuffle(s, [...cands])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, args.copy ? '發現牌堆中一張牌的複製' : '從你的牌堆發現一張牌');
        if (args.all) {
          for (const h of cands.filter((x) => x.cardId === id)) yield* this.takeIntoHand(me, h);
        } else if (args.copy) this.addToHand(me, id);
        else {
          const hc = cands.find((h) => h.cardId === id);
          if (hc) yield* this.takeIntoHand(me, hc);
        }
        break;
      }
      case 'coGiftDiscover': {
        const defs = (args.names as string[]).map((n) => this.cardByNameEn(n, 'SPELL')).filter((c): c is CardDef => !!c);
        if (!defs.length) break;
        const id = yield* this.choose(ctx, defs.map((d) => d.id), '發現一張暫時的牌');
        const hc = this.addToHand(me, id);
        if (hc) hc.temporary = true;
        break;
      }
      case 'coMerch': {
        const c = pick(s, this.randomPool({ type: 'SPELL', anyClass: true }, me.id, false));
        if (c) foe.deck.push(this.newHandCard(c.id));
        break;
      }
      case 'coCho': {
        const caster = s.players[s.current];
        if (ctx.itCardId) this.addToHand(s.players[opp(caster.id)], ctx.itCardId);
        break;
      }
      case 'coDestroyRandomSecret': {
        const sec = pick(s, foe.secrets);
        if (sec) foe.secrets = foe.secrets.filter((x) => x !== sec);
        break;
      }
      case 'coNatalie':
        if (chosenM && self) {
          self.maxHp += chosenM.hp;
          self.hp += chosenM.hp;
          chosenM.dead = true;
        }
        break;
      case 'coVoidTerror':
        if (self) {
          for (const n of this.adjacent(self)) {
            self.atkBuff += this.atkOf(n);
            self.maxHp += n.hp;
            self.hp += n.hp;
            n.dead = true;
          }
        }
        break;
      case 'coNether':
        for (const m of allMinions()) m.dead = true;
        for (const pl of s.players) pl.locations = [];
        break;
      case 'coPowerOverwhelming':
        if (chosenM) {
          chosenM.atkBuff += 4;
          chosenM.maxHp += 4;
          chosenM.hp += 4;
          this.killAtEndOfTurn(me, chosenM.uid, ctx.sourceCardId);
        }
        break;
      case 'coBrawl': {
        const list = allMinions();
        const keep = pick(s, list);
        for (const m of list) if (m !== keep) m.dead = true;
        break;
      }
      case 'coFaceless': {
        if (!self || !chosenM || chosenM === self) break;
        const board = s.players[self.owner].board;
        const idx = board.indexOf(self);
        this.transform(self.uid, chosenM.cardId);
        const m = board[idx];
        if (m) {
          m.atkBuff = chosenM.atkBuff;
          m.maxHp = chosenM.maxHp;
          m.hp = chosenM.hp;
          m.keywords = [...chosenM.keywords];
          m.abilities = structuredClone(chosenM.abilities);
          m.sleeping = self.sleeping;
        }
        this.recalcAuras();
        break;
      }
      case 'coShadowform':
        this.setHeroPower(me, me.heroPower.id === 'EX1_625t' ? 'EX1_625t2' : 'EX1_625t');
        break;
      case 'coHarth': {
        const pool = this.randomPool({ type: 'MINION', rarity: 'LEGENDARY', set: 3, anyClass: true }, me.id, false);
        if (!pool.length) break;
        const n = Math.max(1, me.hand.length);
        me.hand = Array.from({ length: n }, () => this.newHandCard(pick(s, pool)!.id));
        break;
      }
      case 'coAccuse':
        if (chosenM) (me.accusations ??= []).push({ kind: args.kind as 'arson' | 'murder' | 'theft', uid: chosenM.uid });
        break;
      case 'coHabeas': {
        const opts: string[] = [];
        for (const id of shuffle(s, [...me.graveyard])) if (opts.length < 3 && !opts.includes(id) && getCard(id).type === 'MINION') opts.push(id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個友方手下並復活它');
        const m = yield* this.doSummon(ctx, me.id, id);
        if (m) {
          if (!m.keywords.includes('RUSH')) m.keywords.push('RUSH');
          this.killAtEndOfTurn(me, m.uid, ctx.sourceCardId);
        }
        break;
      }
      case 'coTotemChoose': {
        const id = yield* this.choose(ctx, BASIC_TOTEMS, '選擇一個基本圖騰並召喚它');
        yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coSummonAllTotems':
        for (const id of BASIC_TOTEMS) yield* this.doSummon(ctx, me.id, id);
        break;
      case 'coSoulSeeker': {
        if (!self) break;
        const hc = pick(s, foe.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        const idx = me.board.indexOf(self);
        me.board = me.board.filter((m) => m !== self);
        foe.deck.splice(randomInt(s, foe.deck.length + 1), 0, this.newHandCard(self.cardId));
        if (hc) {
          foe.deck = foe.deck.filter((h) => h !== hc);
          yield* this.summon(me.id, hc.cardId, idx);
        }
        this.recalcAuras();
        break;
      }
      case 'coNathanos': {
        const opts: string[] = [];
        for (const id of shuffle(s, [...me.graveyard])) {
          const d = getCard(id);
          if (opts.length < 3 && !opts.includes(id) && d.type === 'MINION' && d.abilities?.some((a) => a.on.k === 'deathrattle')) opts.push(id);
        }
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個友方亡語手下，獲得並觸發它的亡語');
        const drs = (getCard(id).abilities ?? []).filter((a) => a.on.k === 'deathrattle');
        if (self) self.abilities.push(...structuredClone(drs));
        for (const ab of drs) yield* this.runEffects(ab.effects, ctx);
        break;
      }
      case 'coRemove':
        if (chosenM) {
          const pl = s.players[chosenM.owner];
          pl.board = pl.board.filter((m) => m !== chosenM);
          this.recalcAuras();
        }
        break;
      case 'coOrder':
        me.deck.sort((a, b) => getCard(a.cardId).cost - getCard(b.cardId).cost);
        yield* this.draw(me, 1);
        break;
      case 'coDiscoverCastSecret': {
        const opts = pickDistinct(this.randomPool({ isSecret: true, otherClass: true }, me.id, true), 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現並施放一個其他職業的奧秘');
        if (me.secrets.length < MAX_SECRETS && !me.secrets.some((x) => x.cardId === id)) me.secrets.push({ uid: this.uid(), cardId: id });
        break;
      }
      case 'coCallToStand': {
        const hc = pick(s, foe.hand.filter((h) => this.handDef(h).type === 'MINION'));
        if (hc && foe.board.length < MAX_BOARD) {
          foe.hand = foe.hand.filter((h) => h !== hc);
          yield* this.summon(foe.id, hc.cardId, undefined, hc);
        }
        break;
      }
      case 'coCustodian':
        if (self) for (let i = 0; i < foe.board.filter((m) => this.alive(m)).length; i++) {
          const k = pick(s, ['RUSH', 'DIVINE_SHIELD', 'WINDFURY'] as Keyword[])!;
          if (!self.keywords.includes(k)) self.keywords.push(k);
        }
        break;
      case 'coDestroyDeck':
        me.deck = [];
        break;
      case 'coCopyOppHand':
        for (const hc of shuffle(s, [...foe.hand]).slice(0, args.n as number)) this.addToHand(me, hc.cardId);
        break;
      case 'coDewProcess':
        me.extraDraw = (me.extraDraw ?? 0) + 1;
        foe.extraDraw = (foe.extraDraw ?? 0) + 1;
        break;
      case 'coMeltranix':
        foe.edgeOnlyTurn = s.turn + 1;
        break;
      case 'coElusiveOpp':
        if (chosenM) chosenM.elusiveOpp = true;
        break;
      case 'coRecruitShield':
        me.recruitShield = true;
        break;
      case 'coSummonDead': {
        const pool = me.graveyard.filter((id) => !args.race || this.isRace(id, args.race as Race));
        for (const id of shuffle(s, [...pool]).slice(0, (args.count as number) ?? 1)) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coHealDamaged': {
        const t = pick(s, ([me.hero, ...me.board] as Char[]).filter((c) => this.alive(c) && c.hp < c.maxHp));
        if (t) yield* this.heal(t.uid, args.n as number);
        break;
      }
      case 'coEater': {
        const n = foe.secrets.length;
        foe.secrets = [];
        if (self && n) {
          self.atkBuff += n;
          self.maxHp += n;
          self.hp += n;
        }
        break;
      }
      case 'coOppClassCard': {
        const c = pick(s, this.randomPool({ cls: 'opponent' }, me.id, false));
        if (c) this.addToHand(me, c.id);
        break;
      }
      case 'coSuspicious': {
        const opts = this.discoverOptions(args.pool as Pool, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張牌');
        this.addToHand(me, id);
        // 你的對手從三個選項中猜你選了哪一張，猜中就得到一張複製
        const guess = yield* this.chooseAs(foe.id, opts, '猜猜對手選擇了哪一張牌');
        if (opts[guess] === id) this.addToHand(foe, id);
        break;
      }
      case 'coStealOriginal': {
        const id = ctx.itCardId;
        const hc = id ? (foe.hand.find((h) => h.cardId === id) ?? foe.deck.find((h) => h.cardId === id)) : undefined;
        if (hc) {
          foe.hand = foe.hand.filter((h) => h !== hc);
          foe.deck = foe.deck.filter((h) => h !== hc);
          if (me.hand.length < MAX_HAND) me.hand.push(hc);
        }
        break;
      }
      case 'coMaskedReveler': {
        const c = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (c) {
          const m = yield* this.doSummon(ctx, me.id, c.cardId);
          if (m) this.setStats(m, 2, 2);
        }
        break;
      }
      case 'coCook':
        if (me.enemyHeroDamage?.turn === s.turn && me.enemyHeroDamage.amount >= 3) yield* this.draw(me, 1);
        break;
      case 'coDevour': {
        if (!chosenM || !self) break;
        const group = [chosenM, ...(args.neighbors ? this.adjacent(chosenM) : [])].filter((m) => this.alive(m));
        for (const m of group) {
          self.atkBuff += this.atkOf(m);
          self.maxHp += m.hp;
          self.hp += m.hp;
          m.dead = true;
        }
        break;
      }
      case 'coDinner': {
        const c = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && getCard(h.cardId).cost <= me.mana));
        if (c && me.board.length < MAX_BOARD) {
          me.deck = me.deck.filter((h) => h !== c);
          yield* this.doSummon(ctx, me.id, c.cardId);
        }
        break;
      }
      case 'coHolmes':
        for (let i = 0; i < 3; i++) {
          const pool = [...foe.hand, ...foe.deck];
          const opts: string[] = [];
          for (const h of shuffle(s, [...pool])) if (opts.length < 3 && !opts.some((o) => getCard(o).name === getCard(h.cardId).name)) opts.push(h.cardId);
          if (!opts.length) break;
          const id = yield* this.choose(ctx, opts, '破解線索：選擇對手的一張牌');
          this.addToHand(me, id);
        }
        break;
      case 'coDestroyLocation': {
        const loc = pick(s, foe.locations ?? []);
        if (loc) foe.locations = (foe.locations ?? []).filter((l) => l !== loc);
        break;
      }
      case 'coTheotar': {
        const mine = yield* this.chooseFromList(ctx, me.hand.filter((h) => h.uid !== ctx.playedCard?.uid), '選擇你手牌中的一張牌');
        const theirs = yield* this.chooseFromList(ctx, foe.hand, '選擇對手手牌中的一張牌');
        if (mine && theirs) {
          const i = me.hand.indexOf(mine);
          const j = foe.hand.indexOf(theirs);
          me.hand[i] = theirs;
          foe.hand[j] = mine;
        }
        break;
      }
      case 'coTome': {
        const hand = [...me.hand];
        for (const hc of hand) {
          const c = this.newHandCard(hc.cardId);
          c.costMod = 1 - getCard(hc.cardId).cost;
          this.shuffleInto(me, c);
        }
        for (const hc of hand) {
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
        }
        break;
      }
      case 'coVisitor':
        for (const hc of me.hand) if (hc.fromOpp) hc.costMod -= 3;
        break;
      case 'coBurn':
        if (chosenM) yield* this.damage(this.dmgSource(ctx), chosenM.uid, this.atkOf(chosenM) + this.spellDamage(me.id));
        break;
      case 'coPelagos': {
        const t = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (t && t.owner === me.id && this.alive(t)) {
          const hi = Math.max(this.atkOf(t), t.hp);
          this.setStats(t, hi, hi);
        }
        break;
      }
      case 'coDiscoverOpp': {
        const pool = [...(args.hand ? foe.hand : []), ...(args.deck ? foe.deck : [])];
        const opts: string[] = [];
        for (const h of shuffle(s, [...pool])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張對手的牌');
        this.addToHand(me, id);
        break;
      }
      case 'coWhomper': {
        const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION' && !!getCard(h.cardId).abilities?.some((a) => a.on.k === 'deathrattle'));
        if (hc && self) for (const ab of getCard(hc.cardId).abilities ?? []) if (ab.on.k === 'deathrattle') self.abilities.push(structuredClone(ab));
        break;
      }
      case 'coDeckPick': {
        // 巨大的夜影芽：從牌堆發現一個手下召喚，或一個法術施放
        const kind = args.kind as 'MINION' | 'SPELL';
        const cards = me.deck.filter((h) => getCard(h.cardId).type === kind && !getCard(h.cardId).secret);
        const opts: string[] = [];
        for (const h of shuffle(s, [...cards])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, kind === 'MINION' ? '從牌堆發現一個手下並召喚' : '從牌堆發現一個法術並施放');
        const hc = me.deck.find((h) => h.cardId === id);
        if (hc) me.deck = me.deck.filter((h) => h !== hc);
        if (kind === 'MINION') yield* this.doSummon(ctx, me.id, id);
        else yield* this.castRandomly(me.id, id);
        break;
      }
      case 'coPlannedEvidence': {
        const opts = this.discoverOptions({ type: 'SPELL' }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個法術');
        const hc = this.addToHand(me, id);
        if (hc) {
          hc.costMod -= 2;
          (me.endOfTurnEffects ??= []).push({ effects: [{ e: 'custom', fn: 'coRestoreCost', args: { uid: hc.uid, amount: 2 } }], sourceCardId: ctx.sourceCardId });
        }
        break;
      }
      case 'coRestoreCost': {
        const hc = me.hand.find((h) => h.uid === (args.uid as number));
        if (hc) hc.costMod += args.amount as number;
        break;
      }
      case 'coTopior':
        (me.eternal ??= []).push({
          ability: { on: { k: 'spellCast', side: 'friendly', school: 'NATURE' }, effects: [{ e: 'summon', card: 'REV_314t', count: 1, who: 'self' }] },
          sourceCardId: ctx.sourceCardId,
        });
        break;
      case 'coBurden': {
        const buff = me.hero.hp <= 20;
        for (let i = 0; i < 3; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'REV_334t');
          if (m && buff) {
            m.atkBuff += 1;
            m.maxHp += 1;
            m.hp += 1;
          }
        }
        break;
      }
      case 'coRiot': {
        for (const m of [...me.board]) m.undyingTurn = s.turn;
        for (const m of [...me.board]) {
          const t = pick(s, foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH')));
          if (t && this.alive(m)) yield* this.forceAttack(m, t);
        }
        break;
      }
      case 'coGargon': {
        const ids = ['REV_353t3', 'REV_353t4', 'REV_353t5'];
        const list = (args.n as number) >= 3 ? ids : shuffle(s, [...ids]).slice(0, args.n as number);
        for (const id of list) yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coWildseed': {
        const seeds: [string, number][] = [['REV_360t', 1], ['REV_360t1', 2], ['REV_360t2', 3]];
        const mode = args.mode as string;
        const picks = mode === 'all' ? seeds : mode === 'two' ? shuffle(s, [...seeds]).slice(0, 2) : [pick(s, seeds)!];
        for (const [id, t] of picks) {
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m) this.goDormantFor(m, t);
        }
        if (args.sooner) {
          for (const m of me.board) if (m.keywords.includes('DORMANT') && seeds.some(([id]) => id === m.cardId)) m.dormantTurns = Math.max(1, (m.dormantTurns ?? 1) - 1);
        }
        break;
      }
      case 'coConvoke': {
        const pool = this.randomPool({ type: 'SPELL', cls: 'DRUID' }, me.id, false).filter((c) => !c.secret && c.collectible);
        for (let i = 0; i < 8 && !this.over; i++) {
          const c = pick(s, pool);
          if (c) yield* this.castRandomly(me.id, c.id);
        }
        break;
      }
      case 'coCollateral': {
        const targets = shuffle(s, foe.board.filter((m) => this.alive(m))).slice(0, 3);
        const dmg = 6 + this.spellDamage(me.id);
        for (const m of targets) {
          const excess = Math.max(0, dmg - m.hp);
          yield* this.damage(this.dmgSource(ctx), m.uid, dmg);
          if (excess > 0) yield* this.damage(this.dmgSource(ctx), foe.hero.uid, excess);
        }
        break;
      }
      case 'coCrasher': {
        if (!self || !chosenM) break;
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc) break;
        me.hand = me.hand.filter((h) => h !== hc);
        const def = getCard(hc.cardId);
        const atk = (def.attack ?? 0) + hc.atkBuff;
        const hp = (def.health ?? 0) + hc.hpBuff;
        const targetAtk = this.atkOf(chosenM);
        yield* this.damage(this.dmgSource(ctx), chosenM.uid, atk);
        if (targetAtk >= hp) yield* this.processDeaths();
        break;
      }
      case 'coDarkvein': {
        for (let i = 0; i < 2; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'REV_373t');
          if (m) m.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'coCastLastShadow' }] });
        }
        break;
      }
      case 'coCastLastShadow': {
        const ids = me.playedCards ?? [];
        for (let i = ids.length - 1; i >= 0; i--) {
          const d = getCard(ids[i]);
          if (d.type === 'SPELL' && d.spellSchool === 'SHADOW' && !d.secret) {
            yield* this.castRandomly(me.id, d.id);
            break;
          }
        }
        break;
      }
      case 'coShadowborn': {
        const spells = me.hand.filter((h) => getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).spellSchool === 'SHADOW');
        spells.sort((a, b) => this.costOf(me, b) - this.costOf(me, a));
        if (spells[0]) spells[0].costMod -= 3;
        break;
      }
      case 'coAlibi':
        me.heroCapUntil = s.turn + 1;
        break;
      case 'coBrand':
        if (chosenM) chosenM.brand = me.id;
        break;
      case 'coShuffleHand': {
        for (let i = 0; i < (args.n as number); i++) {
          const hc = yield* this.chooseFromList(ctx, me.hand.filter((h) => h.uid !== ctx.playedCard?.uid), '選擇手牌中的一張牌洗入牌堆');
          if (!hc) break;
          me.hand = me.hand.filter((h) => h !== hc);
          this.shuffleInto(me, hc);
        }
        break;
      }
      case 'coKelThuzad': {
        const n = me.graveyard.filter((id) => id === 'REV_845' || id === 'CORE_REV_845').length;
        for (let i = 0; i < n; i++) {
          if (me.board.length < MAX_BOARD) yield* this.doSummon(ctx, me.id, 'REV_845');
          else {
            const t = randomEnemyTarget();
            if (t) yield* this.damage(this.dmgSource(ctx), t.uid, 2);
          }
        }
        break;
      }
      case 'coOrionCast': {
        const owner = me;
        const pool = this.randomPool({ type: 'SPELL', isSecret: true, cls: 'MAGE' }, owner.id, false).filter((c) => !owner.secrets.some((x) => x.cardId === c.id));
        const c = pick(s, pool);
        if (c && self) {
          yield* this.castRandomly(owner.id, c.id);
          self.atkBuff += 2;
          self.maxHp += 2;
          self.hp += 2;
        }
        break;
      }
      case 'coVisage': {
        const src = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!src) break;
        const m = yield* this.doSummon(ctx, me.id, src.cardId);
        if (m) {
          m.sleeping = false;
          yield* this.forceAttack(m, foe.hero);
        }
        break;
      }
      case 'coCastDeckSecret': {
        const n = ctx.combo ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).secret && !me.secrets.some((x) => x.cardId === h.cardId)));
          if (!hc) break;
          me.deck = me.deck.filter((h) => h !== hc);
          yield* this.castRandomly(me.id, hc.cardId);
        }
        break;
      }
      case 'coKidnap': {
        const t = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!t) break;
        const owner = t.owner;
        const board = s.players[owner].board;
        const idx = board.indexOf(t);
        const kidnapped = { cardId: t.cardId, owner };
        this.transform(t.uid, 'REV_828t');
        const sack = board[idx];
        if (sack) {
          sack.captured = [kidnapped];
          this.setStats(sack, 0, 4);
        }
        break;
      }
      case 'coSackReturn': {
        const sack = ctx.sourceSnapshot ?? self;
        for (const c of sack?.captured ?? []) this.addToHand(s.players[c.owner], c.cardId);
        break;
      }
      case 'coHalkias': {
        const sec = pick(s, me.secrets);
        if (sec) (sec.souls ??= []).push('REV_829');
        break;
      }
      case 'coRelic': {
        // 遺物庫：本回合下一個遺物施放兩次
        if (me.relicTwiceTurn === s.turn) {
          me.relicTwiceTurn = undefined;
          yield* this.customCore('coRelic', args, ctx);
        }
        const lvl = 1 + (me.relics ?? 0);
        const kind = args.kind as string;
        if (kind === 'dimensions') {
          const drawn = yield* this.draw(me, 2);
          for (const hc of drawn) hc.costMod -= lvl;
        } else if (kind === 'extinction') {
          for (let i = 0; i < 2; i++) {
            const t = pick(s, foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH')));
            if (t) yield* this.damage(this.dmgSource(ctx), t.uid, lvl + this.spellDamage(me.id));
          }
        } else {
          for (let i = 0; i < 2; i++) {
            const m = yield* this.doSummon(ctx, me.id, 'REV_943t');
            if (m) this.setStats(m, lvl, lvl);
          }
        }
        me.relics = (me.relics ?? 0) + 1;
        break;
      }
      case 'coRafaam': {
        const ids = shuffle(s, me.graveyard.filter((id) => /\bImp\b/.test(getCard(id).nameEn)));
        for (const id of ids.slice(0, 4)) if (me.board.length < MAX_BOARD) yield* this.doSummon(ctx, me.id, id);
        if (args.buff) for (const m of me.board) if (this.alive(m) && /\bImp\b/.test(getCard(m.cardId).nameEn)) {
          m.atkBuff += 2;
          m.maxHp += 2;
          m.hp += 2;
        }
        break;
      }
      case 'coDeathborne': {
        let n = 0;
        for (const m of allMinions()) {
          yield* this.damage(this.dmgSource(ctx), m.uid, 2 + this.spellDamage(me.id));
          if (m.hp <= 0 || m.dead) n++;
        }
        for (let i = 0; i < n; i++) yield* this.doSummon(ctx, me.id, 'REV_845');
        break;
      }
      case 'coDispossessed': {
        if (!(me.locations ?? []).length) break;
        const opts: string[] = [];
        for (const h of shuffle(s, [...me.deck])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現牌堆中的一張牌的複製');
        this.addToHand(me, id);
        break;
      }
      case 'coPainting': {
        if (!self || !ctx.itCardId || ctx.it?.uid === self.uid) break;
        this.transform(self.uid, ctx.itCardId);
        break;
      }
      case 'coStonewright':
        for (const m of allMinions()) if (m.owner === me.id && this.isRace(m.cardId, 'TOTEM')) m.atkBuff += 2;
        (me.eternal ??= []).push({
          ability: { on: { k: 'summon', side: 'friendly', race: 'TOTEM' }, effects: [{ e: 'buff', target: { t: 'it' }, atk: 2 }] },
          sourceCardId: ctx.sourceCardId,
        });
        break;
      case 'coBanner':
        for (let i = 0; i < 3; i++) {
          const a = pick(s, me.deck);
          const b = pick(s, foe.deck);
          if (a && b && getCard(a.cardId).cost > getCard(b.cardId).cost) yield* this.takeIntoHand(me, a);
        }
        break;
      case 'coOlgra': {
        if (!self) break;
        const n = allMinions().filter((m) => m.hp < m.maxHp).length;
        self.atkBuff += n;
        self.maxHp += n;
        self.hp += n;
        for (const t of [...foe.board, foe.hero] as Char[]) {
          if (!this.alive(self) || !this.alive(t)) continue;
          yield* this.forceAttack(self, t);
        }
        break;
      }
      case 'coRandomTotem': {
        const totems = poolCards({ type: 'MINION', race: 'TOTEM' }, me.heroClass, me.heroClass).filter((c) => !c.collectible && ['CS2_050', 'CS2_051', 'CS2_052', 'NEW1_009'].includes(c.id));
        for (let i = 0; i < (args.n as number); i++) {
          const c = pick(s, totems);
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      }
      case 'coCastRelics': {
        const ids = ['REV_508', 'REV_834', 'REV_943'];
        if (args.all) for (const id of ids) yield* this.castRandomly(me.id, id);
        else {
          const id = yield* this.choose(ctx, ids, '發現一個遺物並施放');
          yield* this.castRandomly(me.id, id);
        }
        break;
      }
      case 'coDoor': {
        const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'SPELL');
        if (hc && args.copy) {
          const c = this.addToHand(me, hc.cardId);
          if (c) c.temporary = true;
        }
        break;
      }
      case 'coBoneSpike':
        if (chosenM) {
          yield* this.damage(this.dmgSource(ctx), chosenM.uid, 3 + this.spellDamage(me.id));
          if (chosenM.hp <= 0 || chosenM.dead) (me.pendingDiscounts ??= []).push({ amount: 2, turn: s.turn });
        }
        break;
      case 'coDraka': {
        yield* this.equip(me.id, 'REV_940t');
        const played = me.playedThisTurn?.turn === s.turn ? me.playedThisTurn.ids.length : 0;
        if (me.weapon) me.weapon.atk = Math.min(10, me.weapon.atk + Math.max(0, played - 1));
        break;
      }
      case 'coServiceBell': {
        const cards = me.deck.filter((h) => getCard(h.cardId).cardClass !== 'NEUTRAL');
        const opts: string[] = [];
        for (const h of shuffle(s, [...cards])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現牌堆中的職業牌並抽出所有複製');
        for (const h of [...me.deck.filter((x) => x.cardId === id)]) yield* this.takeIntoHand(me, h);
        break;
      }
      case 'coDivineToll':
        for (let i = 0; i < 5; i++) {
          const t = pick(s, allMinions());
          if (!t) break;
          if (t.owner === me.id) {
            t.atkBuff += 2;
            t.maxHp += 2;
            t.hp += 2;
          } else yield* this.damage(this.dmgSource(ctx), t.uid, 2 + this.spellDamage(me.id));
        }
        break;
      case 'coStewart':
        (me.eternal ??= []).push({
          ability: { on: { k: 'summon', side: 'friendly' }, effects: [{ e: 'custom', fn: 'coStewartFire' }] },
          sourceCardId: 'REV_955',
        });
        break;
      case 'coStewartFire': {
        const m = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (!m || !getCard(m.cardId).nameEn.includes('Silver Hand Recruit')) break;
        me.eternal = (me.eternal ?? []).filter((e) => e.sourceCardId !== 'REV_955');
        {
          m.atkBuff += 3;
          m.maxHp += 3;
          m.hp += 3;
          m.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'coStewart' }] });
        }
        break;
      }
      case 'coGravedigger': {
        if (!me.secrets.length) break;
        const hc = yield* this.chooseFromList(ctx, foe.hand, '選擇對手手牌中的一張牌洗入他的牌堆');
        if (hc) {
          foe.hand = foe.hand.filter((h) => h !== hc);
          this.shuffleInto(foe, hc);
        }
        break;
      }
      case 'coAshen':
        (me.eternal ??= []).push({
          ability: { on: { k: 'draw', side: 'enemy' }, effects: [{ e: 'damage', target: { t: 'hero', side: 'enemy' }, amount: 2 }] },
          sourceCardId: ctx.sourceCardId,
          until: s.turn + 1,
        });
        break;
      case 'coSnob': {
        if (!self) break;
        const n = me.hand.filter((h) => cardClasses(getCard(h.cardId)).includes('PALADIN')).length;
        for (let i = 0; i < n; i++) {
          const k = pick(s, ['DIVINE_SHIELD', 'LIFESTEAL', 'RUSH', 'TAUNT'] as Keyword[])!;
          if (!self.keywords.includes(k)) self.keywords.push(k);
        }
        break;
      }
      case 'coCultist':
        if (self && me.hand.some((h) => getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).spellSchool === 'SHADOW')) {
          self.atkBuff += 1;
          self.maxHp += 1;
          self.hp += 1;
        }
        break;
      case 'coAnachronos': {
        const gone = allMinions().filter((m) => m.uid !== ctx.sourceUid);
        const saved: { cardId: string; owner: PlayerId }[] = gone.map((m) => ({ cardId: m.cardId, owner: m.owner }));
        for (const m of gone) {
          s.players[m.owner].board = s.players[m.owner].board.filter((x) => x !== m);
        }
        if (saved.length) (me.delayed ??= []).push({ turns: 1, effects: [{ e: 'custom', fn: 'coAnachronosReturn', args: { saved } }], sourceCardId: ctx.sourceCardId });
        break;
      }
      case 'coAnachronosReturn':
        for (const c of args.saved as { cardId: string; owner: PlayerId }[]) {
          if (s.players[c.owner].board.length < MAX_BOARD) yield* this.doSummon(ctx, c.owner, c.cardId);
        }
        break;
      case 'coStudies': {
        const opts = this.discoverOptions(args.pool as Pool, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張牌');
        const hc = this.addToHand(me, id);
        if (hc) hc.costMod -= 1;
        break;
      }
      case 'coWillow': {
        const fromHand = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'DEMON')));
        if (fromHand) {
          me.hand = me.hand.filter((h) => h !== fromHand);
          yield* this.doSummon(ctx, me.id, fromHand.cardId);
        }
        const fromDeck = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'DEMON')));
        if (fromDeck) {
          me.deck = me.deck.filter((h) => h !== fromDeck);
          yield* this.doSummon(ctx, me.id, fromDeck.cardId);
        }
        break;
      }
      case 'coInitiation':
        if (chosenM) {
          const id = chosenM.cardId;
          yield* this.damage(this.dmgSource(ctx), chosenM.uid, 4 + this.spellDamage(me.id));
          if (chosenM.hp <= 0 || chosenM.dead) yield* this.doSummon(ctx, me.id, id);
        }
        break;
      case 'coPlagiarize': {
        const ids = foe.playedThisTurn?.turn === s.turn ? foe.playedThisTurn.ids : [];
        for (const id of ids) this.addToHand(me, id);
        break;
      }
      case 'coKeymaster': {
        if (!ctx.itCardId) break;
        const hc = this.addToHand(me, ctx.itCardId);
        if (hc) hc.costMod = 1 - getCard(ctx.itCardId).cost;
        break;
      }
      case 'coFiend':
        {
          const m = yield* this.doSummon(ctx, me.id, 'SW_085t');
          if (m) {
            const n = Math.max(1, me.hand.length);
            this.setStats(m, n, n);
          }
        }
        break;
      case 'coOverdraft': {
        const n = me.overloadLocked + me.overloadOwed;
        me.overloadLocked = 0;
        me.overloadOwed = 0;
        if (n > 0) yield* this.damage(this.dmgSource(ctx), foe.hero.uid, n + this.spellDamage(me.id));
        break;
      }
      case 'coHuntress': {
        // 暗夜精靈女獵手：依序選擇三個不同的敵人，各造成 3 點傷害
        const hit = new Set<number>();
        for (let n = 0; n < 3 && !this.over; n++) {
          const choices = ([foe.hero, ...foe.board] as Char[]).filter((c) => this.alive(c) && !hit.has(c.uid) && (isHero(c) || (!this.hasKw(c, 'STEALTH') && !this.hasKw(c, 'DORMANT'))));
          const t = yield* this.chooseTarget(me.id, choices, `選擇第 ${n + 1} 個目標（造成 3 點傷害）`);
          if (!t) break;
          hit.add(t.uid);
          yield* this.damage(this.dmgSource(ctx), t.uid, 3);
        }
        break;
      }
      case 'coGrunt':
        if (self && this.lastAttack?.attacker === self.uid && this.lastAttack.killed) self.attacks = Math.max(0, self.attacks - 1);
        break;
      case 'coWayward': {
        if (me.hand.length) me.hand[0].costMod -= 1;
        if (me.hand.length > 1) me.hand[me.hand.length - 1].costMod -= 1;
        break;
      }
      case 'coTerror': {
        if (!self) break;
        for (const m of [...foe.board]) {
          if (!this.alive(self) || !this.alive(m) || m.frozen || this.hasKw(m, 'DORMANT')) continue;
          yield* this.forceAttack(m, self);
        }
        break;
      }
      case 'coMenagerie': {
        const groups = new Map<string, Minion[]>();
        for (const m of me.board) {
          if (!this.alive(m)) continue;
          const races = getCard(m.cardId).races ?? [];
          const key = races.length ? races[0] : 'NONE';
          groups.set(key, [...(groups.get(key) ?? []), m]);
        }
        const chosen = shuffle(s, [...groups.values()]).slice(0, 3).map((g) => pick(s, g)!);
        for (const m of chosen) {
          m.atkBuff += args.n as number;
          m.maxHp += args.n as number;
          m.hp += args.n as number;
        }
        break;
      }
      case 'coAvatar': {
        const pool = this.randomPool({ anyClass: true }, me.id, false).filter((c) => c.collectible && c.type !== 'HERO');
        for (let i = 0; i < 5 && !this.over; i++) {
          const c = pick(s, pool);
          if (c) yield* this.replay(me.id, c.id);
        }
        break;
      }
      case 'coHandTaunt':
        for (const h of me.hand) {
          const d = getCard(h.cardId);
          if (d.type === 'MINION' && d.keywords?.includes('TAUNT')) {
            h.atkBuff += 2;
            h.hpBuff += 2;
          }
        }
        break;
      case 'coBoon':
        if (chosenM) {
          const m = yield* this.doSummon(ctx, me.id, 'REV_248t');
          if (m) this.setStats(m, this.atkOf(chosenM), chosenM.hp);
        }
        break;
      case 'coSteamcleaner':
        me.deck = me.deck.filter((h) => h.starting);
        foe.deck = foe.deck.filter((h) => h.starting);
        break;
      case 'coZeroIt':
        if (ctx.it?.kind === 'hand') {
          const hc = this.handCard(ctx.it.uid);
          if (hc) hc.card.costMod = -getCard(hc.card.cardId).cost;
        }
        break;
      case 'coKin': {
        // 血緣：條件成立時執行；若「下一個血緣會觸發兩次」，則執行兩次
        if (!this.evalCond({ c: 'kindred' }, ctx)) break;
        const times = me.kindredTwice ? 2 : 1;
        me.kindredTwice = false;
        for (let i = 0; i < times; i++) yield* this.runEffects(args.effects as Effect[], ctx);
        break;
      }
      case 'coKindredTwice':
        me.kindredTwice = true;
        break;
      case 'coMap': {
        let opts: string[];
        if (args.mode === 'deck') {
          opts = [];
          for (const h of shuffle(s, [...me.deck])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        } else if (args.mode === 'unplayedType') {
          const played = new Set((me.playedCards ?? []).flatMap((id) => getCard(id).races ?? []));
          const pool = this.randomPool({ type: 'MINION', multiRace: false }, me.id, true).filter((c) => (c.races ?? []).length > 0 && !(c.races ?? []).some((r) => played.has(r)));
          opts = this.discoverOptions(undefined, me.id, pool);
        } else if (args.mode === 'oddBeast') {
          const pool = this.randomPool({ type: 'MINION', race: 'BEAST' }, me.id, true).filter((c) => (c.attack ?? 0) % 2 === 1);
          opts = this.discoverOptions(undefined, me.id, pool);
        } else opts = this.discoverOptions(args.pool as Pool, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張牌');
        const hc = this.addToHand(me, id);
        if (hc) {
          hc.mapOthers = opts.filter((o) => o !== id);
          hc.mapTurn = s.turn;
        }
        break;
      }
      case 'coAnimancer': {
        const c = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'BEAST')));
        if (c) {
          me.deck = me.deck.filter((h) => h !== c);
          const m = yield* this.doSummon(ctx, me.id, c.cardId);
          if (m && !m.keywords.includes('LIFESTEAL')) m.keywords.push('LIFESTEAL');
        }
        break;
      }
      case 'coHorn': {
        for (let i = 0; i < 3; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'DINO_136t');
          if (m && ctx.outcast) m.immuneAttackTurn = s.turn;
        }
        break;
      }
      case 'coSaucier': {
        const i = ctx.handIndex ?? 0;
        for (const h of [me.hand[i - 1], me.hand[i]]) if (h) h.costMod -= 1;
        break;
      }
      case 'coEdges': {
        const board = foe.board.filter((m) => this.alive(m));
        const edges = board.length > 1 ? [board[0], board[board.length - 1]] : board;
        for (const m of edges) yield* this.damage(this.dmgSource(ctx), m.uid, (args.n as number) + (ctx.isSpell ? this.spellDamage(me.id) : 0));
        break;
      }
      case 'coAttackRandom': {
        if (!self || !this.alive(self)) break;
        const t = pick(s, foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH') && !this.hasKw(m, 'DORMANT')));
        if (t) yield* this.forceAttack(self, t);
        break;
      }
      case 'coDracorex': {
        if (!self || !this.lastAttack || this.lastAttack.defenderIsHero) break;
        for (const m of [...foe.board]) if (this.alive(m) && m.uid !== this.lastAttack.defender) yield* this.damage(this.charSource(self), m.uid, this.atkOf(self));
        break;
      }
      case 'coMask': {
        if (!chosenM) break;
        this.setStats(chosenM, args.atk as number, args.hp as number);
        for (const k of (args.kw as Keyword[]) ?? []) if (!chosenM.keywords.includes(k)) chosenM.keywords.push(k);
        if (args.dr) chosenM.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'any' } }, amount: 2 }] });
        if (args.draw) yield* this.draw(me, args.draw as number);
        if (args.fill) {
          while (me.board.length < MAX_BOARD) {
            const c = yield* this.doSummon(ctx, me.id, chosenM.cardId);
            if (!c) break;
            this.setStats(c, args.atk as number, args.hp as number);
          }
        }
        if (args.force) {
          const t = pick(s, foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH')));
          if (t) yield* this.forceAttack(t, chosenM);
        }
        break;
      }
      case 'coMirrex': {
        const hc = ctx.handSource !== undefined ? me.hand.find((h) => h.uid === ctx.handSource) : undefined;
        if (!hc || !ctx.itCardId) break;
        const d = getCard(ctx.itCardId);
        hc.cardId = ctx.itCardId;
        hc.atkBuff = 3 - (d.attack ?? 0);
        hc.hpBuff = 4 - (d.health ?? 0);
        break;
      }
      case 'coTusk': {
        const hc = me.hand.find((h) => h.uid !== ctx.playedCard?.uid);
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          this.shuffleInto(me, hc);
        }
        break;
      }
      case 'coDrawMinion': {
        const atk = args.atk as number | undefined;
        yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION' && (atk === undefined || (getCard(h.cardId).attack ?? 0) + h.atkBuff === atk));
        break;
      }
      case 'coStego': {
        const targets = shuffle(s, foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH'))).slice(0, 2);
        const kin = this.evalCond({ c: 'kindred' }, ctx);
        for (const m of targets) {
          yield* this.damage(this.dmgSource(ctx), m.uid, 2);
          if (kin) this.freeze(m);
        }
        break;
      }
      case 'coTribute': {
        if (!chosenM) break;
        const others = allMinions().filter((m) => m !== chosenM);
        if (!others.length) break;
        const id = yield* this.choose(ctx, [...new Set(others.map((m) => m.cardId))].slice(0, 3), '選擇另一個手下，變成它');
        this.transform(chosenM.uid, id);
        break;
      }
      case 'coDeckBuff':
        for (const h of me.deck) if (getCard(h.cardId).type === 'MINION') {
          h.atkBuff += args.n as number;
          h.hpBuff += args.n as number;
        }
        break;
      case 'coAnky': {
        for (let i = 0; i < 2; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', race: 'BEAST', cost: 3, anyClass: true }, me.id, false));
          if (!c) break;
          const m = yield* this.doSummon(ctx, me.id, c.id);
          const t = pick(s, ([foe.hero, ...foe.board] as Char[]).filter((x) => this.alive(x) && (isHero(x) || !this.hasKw(x, 'STEALTH'))));
          if (m && t) {
            m.sleeping = false;
            yield* this.forceAttack(m, t);
          }
        }
        break;
      }
      case 'coHeroWelcome': {
        const opts = this.discoverOptions({ type: 'MINION', rarity: 'LEGENDARY' }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個傳說手下並召喚');
        const m = yield* this.doSummon(ctx, me.id, id);
        if (m) this.setStats(m, 10, 10);
        break;
      }
      case 'coRitual': {
        const opts = this.discoverOptions({ type: 'MINION', cost: 3 }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個 3 費手下');
        const m = yield* this.doSummon(ctx, me.id, id);
        if (m) this.setStats(m, 2, 3);
        break;
      }
      case 'coMerchant': {
        const c = pick(s, this.randomPool({ type: 'SPELL', nameEn: 'Mask', otherClass: true }, me.id, false));
        if (c) {
          const hc = this.addToHand(me, c.id);
          if (hc && ctx.combo) hc.costMod -= 2;
        }
        break;
      }
      case 'coTaka': {
        const pool = this.randomPool({ type: 'MINION', race: 'BEAST', rarity: 'LEGENDARY', anyClass: true }, me.id, false);
        const opts = this.discoverOptions(undefined, me.id, pool);
        if (!opts.length || !self) break;
        const id = yield* this.choose(ctx, opts, '發現一隻傳說野獸');
        const d = getCard(id);
        self.atkBuff += d.attack ?? 0;
        self.maxHp += d.health ?? 0;
        self.hp += d.health ?? 0;
        self.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'summon', card: id, count: 1, who: 'self' }] });
        break;
      }
      case 'coHybrid': {
        const kin = this.evalCond({ c: 'kindred' }, ctx);
        for (const cost of [1, 2, 3, 4]) {
          const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION' && getCard(h.cardId).cost === cost);
          if (hc && kin) hc.costMod -= 1;
        }
        break;
      }
      case 'coTorga': {
        const kindredCards = me.deck.filter((h) => JSON.stringify(getCard(h.cardId).abilities ?? []).includes('"c":"kindred"'));
        const first = pick(s, kindredCards);
        if (!first) break;
        const d = getCard(first.cardId);
        yield* this.takeIntoHand(me, first);
        const second = pick(s, me.deck.filter((h) => {
          const o = getCard(h.cardId);
          return (d.spellSchool && o.spellSchool === d.spellSchool) || (d.races ?? []).some((r) => o.races?.includes(r) || o.races?.includes('ALL'));
        }));
        if (second) yield* this.takeIntoHand(me, second);
        break;
      }
      case 'coUmbra': {
        const ids = shuffle(s, me.graveyard.filter((id) => getCard(id).abilities?.some((a) => a.on.k === 'deathrattle'))).slice(0, 5);
        for (const id of ids) {
          for (const ab of getCard(id).abilities ?? []) {
            if (ab.on.k !== 'deathrattle') continue;
            yield* this.runEffects(ab.effects, { ...this.baseCtx(me.id), sourceCardId: id });
          }
        }
        break;
      }
      case 'coStormbrewer':
        if (self && this.attackDefender !== null && this.char(this.attackDefender)) yield* this.damage(this.charSource(self), this.attackDefender, 3);
        break;
      case 'coRelicMiner': {
        const top = me.deck[me.deck.length - 1];
        if (!top) break;
        me.deck = me.deck.slice(0, -1);
        const rarity = getCard(top.cardId).rarity;
        const pool = this.randomPool({ rarity }, me.id, true);
        const opts = this.discoverOptions(undefined, me.id, pool);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張相同稀有度的牌');
        this.addToHand(me, id);
        break;
      }
      case 'coEsho': {
        if (!this.evalCond({ c: 'deckSameType' }, ctx)) break;
        for (const m of me.board) if (m.uid !== ctx.sourceUid && this.alive(m)) {
          m.atkBuff += 2;
          m.maxHp += 2;
          m.hp += 2;
        }
        for (const h of [...me.hand, ...me.deck]) if (getCard(h.cardId).type === 'MINION') {
          h.atkBuff += 2;
          h.hpBuff += 2;
        }
        break;
      }
      case 'coSwarm': {
        if (ctx.chosen === null) break;
        const dealt = yield* this.damage(this.dmgSource(ctx), ctx.chosen, 3 + this.spellDamage(me.id));
        for (let i = 0; i < dealt; i++) yield* this.doSummon(ctx, me.id, 'TLC_249');
        break;
      }
      case 'coFirehawk': {
        const drawn: string[] = [];
        for (let n = 0; n < 2; n++) {
          const hc = yield* this.drawWhere(me, (h) => {
            const d = getCard(h.cardId);
            if (d.type !== 'MINION') return false;
            return !drawn.some((id) => (getCard(id).races ?? []).some((r) => d.races?.includes(r)) || (!getCard(id).races?.length && !d.races?.length));
          });
          if (hc) {
            drawn.push(hc.cardId);
            hc.atkBuff += 1;
            hc.hpBuff += 1;
          }
        }
        break;
      }
      case 'coThrasher': {
        const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).spellSchool === 'FIRE');
        if (hc && this.evalCond({ c: 'kindred' }, ctx)) hc.spellPower = (hc.spellPower ?? 0) + 2;
        break;
      }
      case 'coMagma': {
        if (!self || !ctx.itCardId) break;
        const n = getCard(ctx.itCardId).cost;
        self.atkBuff += n;
        self.maxHp += n;
        self.hp += n;
        break;
      }
      case 'coLava':
        for (let i = 0; i < 3; i++) {
          const t = ([...foe.board, foe.hero] as Char[]).filter((c) => this.alive(c) && (isHero(c) || !this.hasKw(c, 'STEALTH'))).sort((a, b) => a.hp - b.hp)[0];
          if (t) yield* this.damage(this.dmgSource(ctx), t.uid, 2 + this.spellDamage(me.id));
        }
        break;
      case 'coTrees': {
        if (!chosenM) break;
        for (let i = 0; i < 4; i++) {
          const m = yield* this.doSummon(ctx, me.id, 'TLC_230t');
          if (m && this.alive(chosenM)) {
            m.sleeping = false;
            yield* this.forceAttack(m, chosenM);
          }
        }
        break;
      }
      case 'coBarnabus': {
        const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION');
        if (hc && (getCard(hc.cardId).attack ?? 0) + hc.atkBuff >= 5) {
          hc.hpBuff += 5;
          me.hero.armor += 5;
        }
        break;
      }
      case 'coLifeCycle': {
        if (!chosenM) break;
        const cost = getCard(chosenM.cardId).cost;
        const owner = chosenM.owner;
        chosenM.dead = true;
        const c = pick(s, this.randomPool({ type: 'MINION', cost, anyClass: true }, owner, false));
        if (c) yield* this.doSummon({ ...ctx, controller: owner }, owner, c.id);
        break;
      }
      case 'coBonus': {
        const targets: Minion[] = args.target === 'it' ? ([ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null].filter(Boolean) as Minion[]) : args.target === 'chosen' ? (chosenM ? [chosenM] : []) : args.target === 'random' ? ([pick(s, me.board.filter((m) => this.alive(m)))].filter(Boolean) as Minion[]) : [];
        for (const m of targets) for (let i = 0; i < ((args.n as number) ?? 1); i++) this.bonusEffect(m);
        break;
      }
      case 'coTyrannogill':
        for (const id of ['TLC_240t', 'TLC_240t2', 'TLC_240t3']) {
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m) this.bonusEffect(m);
        }
        break;
      case 'coStranglevine': {
        const t = pick(s, me.board.filter((m) => this.alive(m) && m.uid !== ctx.sourceUid));
        if (t) {
          this.bonusEffect(t);
          t.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'coStranglevine' }] });
        }
        break;
      }
      case 'coThreshfleet':
        if (!me.hand.some((h) => h.cardId === 'TLC_241t')) this.addToHand(me, 'TLC_241t');
        break;
      case 'coChooseAdapt': {
        if (!self) break;
        const id = yield* this.choose(ctx, args.opts as string[], '選擇一個能力');
        this.applyAdaptation(self, id);
        break;
      }
      case 'coExplorer': {
        const hc = pick(s, foe.hand.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (hc) hc.costMod -= 2;
        break;
      }
      case 'coSabretooth': {
        if (!self || !this.lastAttack?.killed || this.lastAttack.attacker !== self.uid || !this.lastAttack.defenderCardId) break;
        this.addToHand(me, this.lastAttack.defenderCardId);
        break;
      }
      case 'coCrater':
        foe.noHealUntil = s.turn + 1;
        break;
      case 'coOoze': {
        if (!chosenM) break;
        const atk = this.atkOf(chosenM);
        const hp = chosenM.hp;
        chosenM.dead = true;
        const hc = this.addToHand(me, 'TLC_829t');
        if (hc) {
          hc.counter = atk;
          hc.infuseAtk = hp;
        }
        break;
      }
      case 'coBones':
        if (chosenM && ctx.playedCard) {
          const a = ctx.playedCard.counter ?? 0;
          const h = ctx.playedCard.infuseAtk ?? 0;
          chosenM.atkBuff += a;
          chosenM.maxHp += h;
          chosenM.hp += h;
        }
        break;
      case 'coDormantStart':
        if (self && !self.keywords.includes('DORMANT')) self.keywords.push('DORMANT');
        break;
      case 'coStoryteller': {
        const groups = new Map<string, Minion[]>();
        for (const m of me.board) {
          if (!this.alive(m)) continue;
          const key = (getCard(m.cardId).races ?? ['NONE'])[0] ?? 'NONE';
          groups.set(key, [...(groups.get(key) ?? []), m]);
        }
        for (const g of groups.values()) {
          const m = pick(s, g)!;
          m.atkBuff += 1;
          m.maxHp += 1;
          m.hp += 1;
        }
        break;
      }
      case 'coTender':
        me.maxMana = Math.min(this.manaCap(me), Math.max(me.maxMana, foe.maxMana));
        break;
      case 'coLoh':
        me.minionCostSet = 5;
        break;
      case 'coDiscoverSet': {
        const opts = this.discoverOptions(args.pool as Pool, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張牌');
        const hc = this.addToHand(me, id);
        if (hc) {
          if (args.set !== undefined) hc.costMod = (args.set as number) - getCard(id).cost;
          if (args.reduce) hc.costMod -= args.reduce as number;
          if (args.temp) hc.temporary = true;
        }
        break;
      }
      case 'coWaygate':
        for (const h of me.hand) if (!h.starting) h.costMod -= 1;
        break;
      case 'coRecast': {
        const ids = me.holySpellsThisTurn?.turn === s.turn ? me.holySpellsThisTurn.ids : [];
        const id = pick(s, ids.filter((x) => !getCard(x).secret));
        if (!id) break;
        // 如果可以，以自己為目標
        if (self && this.alive(self) && getCard(id).target) yield* this.castAt(me.id, id, self.uid);
        else yield* this.castRandomly(me.id, id);
        break;
      }
      case 'coRazidir': {
        const from = this.evalCond({ c: 'kindred' }, ctx) ? foe : me;
        const hc = pick(s, from.hand.filter((h) => h.uid !== ctx.playedCard?.uid));
        if (hc) {
          from.hand = from.hand.filter((h) => h !== hc);
          yield* this.discarded(from, hc);
        }
        break;
      }
      case 'coDeckTemp': {
        const opts: string[] = [];
        for (const h of shuffle(s, [...me.deck])) if (opts.length < 3 && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現牌堆中的另一張牌');
        const hc = me.deck.find((h) => h.cardId === id);
        if (hc) {
          const got = yield* this.takeIntoHand(me, hc);
          if (got) got.temporary = true;
        }
        break;
      }
      case 'coOsk': {
        if (!self) break;
        const pick1 = (s.turn + me.id) % 5;
        if (pick1 === 0) {
          const t = randomEnemyTarget();
          if (t) yield* this.damage(this.charSource(self), t.uid, 5);
        } else if (pick1 === 1) {
          for (const m of me.board) if (m !== self && this.alive(m)) {
            m.atkBuff += 2;
            m.maxHp += 2;
            m.hp += 2;
          }
        } else if (pick1 === 2) yield* this.draw(me, 2);
        else if (pick1 === 3) {
          for (const m of foe.board) if (this.alive(m)) this.setStats(m, 2, 2);
        } else {
          self.maxHp += 5;
          self.hp += 5;
          me.hero.armor += 5;
        }
        break;
      }
      case 'coKodo': {
        const list = foe.board.filter((m) => this.alive(m));
        if (!list.length) break;
        const high = this.evalCond({ c: 'kindred' }, ctx);
        const t = [...list].sort((a, b) => (high ? this.atkOf(b) - this.atkOf(a) : this.atkOf(a) - this.atkOf(b)))[0];
        t.dead = true;
        break;
      }
      case 'coDiscoverCostEq': {
        const pool = this.randomPool({}, me.id, true).filter((c) => c.cost === me.mana && c.type !== 'HERO');
        const opts = this.discoverOptions(undefined, me.id, pool);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一張消耗等同於剩餘水晶的牌');
        this.addToHand(me, id);
        break;
      }
      case 'coLakkari': {
        if (me.hand.length) {
          const hc = pick(s, me.hand)!;
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
        }
        while (me.board.length < MAX_BOARD) {
          const m = yield* this.doSummon(ctx, me.id, 'TLC_T_IMP');
          if (!m) break;
        }
        break;
      }
      case 'coStone': {
        for (let i = 0; i < 2; i++) {
          const c = pick(s, this.randomPool({ type: 'SPELL', spellSchool: 'FEL' }, me.id, true));
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (hc) hc.healthCostUntil = 99999;
        }
        break;
      }
      case 'coTunnel':
        for (let i = 0; i < 2; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', cost: 2, anyClass: true }, me.id, false));
          if (!c) break;
          const hc = this.addToHand(me, c.id);
          if (hc) hc.temporary = true;
        }
        break;
      case 'coCinders': {
        if (!this.evalCond({ c: 'kindred' }, ctx)) break;
        for (const m of [...me.board]) {
          if (!this.alive(m) || m.cardId !== 'TLC_249') continue;
          yield* this.runDeathrattles(m);
        }
        break;
      }
      case 'coMerchantLegend': {
        const opts = this.discoverOptions({ type: 'MINION', rarity: 'LEGENDARY' }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個傳說手下');
        this.addToHand(me, id);
        for (const o of opts.filter((x) => x !== id)) this.shuffleInto(me, this.newHandCard(o));
        break;
      }
      case 'coWeaponsmith': {
        const c = pick(s, this.randomPool({ type: 'WEAPON', otherClass: true }, me.id, false));
        if (!c) break;
        const hc = this.addToHand(me, c.id);
        if (hc && ctx.combo) hc.atkBuff += 2;
        break;
      }
      case 'coKnockback':
        if (chosenM) yield* this.damage(this.dmgSource(ctx), chosenM.uid, 1 + (me.shuffleCount ?? 0) + this.spellDamage(me.id));
        break;
      case 'coEyes': {
        const opts: string[] = [];
        for (const h of shuffle(s, [...foe.deck])) if (opts.length < 3) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '選擇一張牌放到對手牌堆頂');
        const hc = foe.deck.find((h) => h.cardId === id);
        if (hc) foe.deck = [...foe.deck.filter((h) => h !== hc), hc];
        break;
      }
      case 'coFan':
        yield* this.castRandomly(me.id, 'EX1_129');
        break;
      case 'coShellnado': {
        const n = Math.min(5, me.hero.armor);
        me.hero.armor -= n;
        for (let i = 0; i < n; i++) for (const m of allMinions()) yield* this.damage(this.dmgSource(ctx), m.uid, 1 + this.spellDamage(me.id));
        break;
      }
      case 'coLatorvius': {
        const rewards = ['TLC_229t14', 'TLC_239t', 'TLC_433t', 'TLC_513t', 'TLC_631t', 'TLC_830t', 'TLC_460t', 'TLC_446t'];
        const sh = shuffle(s, [...rewards]);
        for (const id of sh.slice(0, 2)) this.addToHand(me, id);
        for (const id of sh.slice(2)) this.shuffleInto(me, this.newHandCard(id));
        break;
      }
      case 'coPlatysaur': {
        const [hc] = yield* this.draw(me, 1);
        if (self && hc) self.stash = hc.cardId;
        break;
      }
      case 'coPlatysaurDr': {
        const sn = ctx.sourceSnapshot ?? self;
        const hc = sn?.stash ? me.hand.find((h) => h.cardId === sn.stash) : undefined;
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
        }
        break;
      }
      case 'coMillTop':
        this.mill(me, args.n as number);
        break;
      case 'coNablya':
        for (const m of [...me.board]) {
          if (!this.alive(m) || m.hp >= m.maxHp || me.board.length >= MAX_BOARD) continue;
          const c = yield* this.doSummon(ctx, me.id, m.cardId);
          if (c) {
            c.atkBuff = m.atkBuff;
            c.maxHp = m.maxHp;
            c.hp = m.hp;
            c.sleeping = false;
            if (!c.keywords.includes('RUSH')) c.keywords.push('RUSH');
          }
        }
        break;
      case 'coHerenn': {
        const picks = shuffle(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION' && getCard(h.cardId).abilities?.some((a) => a.on.k === 'deathrattle'))).slice(0, 2);
        const ms: Minion[] = [];
        for (const h of picks) {
          me.deck = me.deck.filter((x) => x !== h);
          const m = yield* this.doSummon(ctx, me.id, h.cardId);
          if (m) ms.push(m);
        }
        if (ms.length === 2) {
          for (let i = 0; i < 200 && this.alive(ms[0]) && this.alive(ms[1]); i++) {
            yield* this.damage(this.charSource(ms[0]), ms[1].uid, this.atkOf(ms[0]));
            if (this.alive(ms[1])) yield* this.damage(this.charSource(ms[1]), ms[0].uid, this.atkOf(ms[1]));
          }
        }
        break;
      }
      case 'coArchaios': {
        const t = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (t && self && t !== self) {
          t.maxHp = self.hp;
          t.hp = self.hp;
        }
        break;
      }
      case 'coVoidbulb': {
        const times = this.evalCond({ c: 'kindred' }, ctx) ? 2 : 1;
        for (let i = 0; i < times; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', cost: 4, anyClass: true }, me.id, false));
          if (!c) break;
          const m = yield* this.doSummon(ctx, me.id, c.id);
          if (m && !m.keywords.includes('TAUNT')) m.keywords.push('TAUNT');
        }
        break;
      }
      case 'coSoletos': {
        if (!self) break;
        const other = ctx.sourceCardId === 'TLC_817t3' ? 'TLC_817t4' : 'TLC_817t3';
        const hc = me.hand.find((h) => h.cardId === other);
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          this.transform(self.uid, 'TLC_817t5');
        } else yield* this.doSummon(ctx, me.id, ctx.sourceCardId);
        break;
      }
      case 'coResuscitate':
        for (const cost of [1, 2, 3]) {
          const id = pick(s, me.graveyard.filter((x) => getCard(x).type === 'MINION' && getCard(x).cost === cost));
          if (!id) continue;
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m && !m.keywords.includes('REBORN')) m.keywords.push('REBORN');
        }
        break;
      case 'coGladeSpell':
        if (chosenM) {
          const n = chosenM.owner === me.id ? 2 : -2;
          chosenM.maxHp = Math.max(1, chosenM.maxHp + n);
          chosenM.hp = Math.max(1, Math.min(chosenM.maxHp, chosenM.hp + n));
        }
        break;
      case 'coWilted': {
        const t = ctx.it?.kind === 'char' ? this.char(ctx.it.uid) : null;
        if (self && t && t.owner !== me.id && this.alive(self) && this.alive(t)) yield* this.forceAttack(self, t);
        break;
      }
      case 'coDinositter': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'BEAST')));
        if (hc) hc.costMod -= 1;
        break;
      }
      case 'coDinomancy':
        for (const m of allMinions()) if (m.owner === me.id && this.isRace(m.cardId, 'BEAST')) {
          m.atkBuff += 2;
          m.maxHp += 2;
          m.hp += 2;
        }
        for (const h of [...me.hand, ...me.deck]) if (getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'BEAST')) {
          h.atkBuff += 2;
          h.hpBuff += 2;
        }
        break;
      case 'coDevilsaur':
        if (chosenM && self) {
          const a = this.atkOf(chosenM);
          const h = chosenM.hp;
          chosenM.dead = true;
          if (this.evalCond({ c: 'kindred' }, ctx)) {
            self.atkBuff += a;
            self.maxHp += h;
            self.hp += h;
          }
        }
        break;
      case 'coShokk': {
        for (const atk of [8, 6, 4]) {
          const pool = this.randomPool({ type: 'MINION', race: 'BEAST', attack: atk, anyClass: true }, me.id, false);
          const opts = this.discoverOptions(undefined, me.id, pool);
          if (!opts.length) continue;
          const id = yield* this.choose(ctx, opts, `發現一隻 ${atk} 攻擊力的野獸`);
          const hc = this.addToHand(me, id);
          if (hc) hc.costMod = 2 - getCard(id).cost;
        }
        break;
      }
      case 'coPterrordax': {
        const m = yield* this.doSummon(ctx, me.id, 'TLC_831t');
        if (!m) break;
        for (const o of allMinions()) {
          if (o === m || o.hp <= 1) continue;
          o.maxHp -= 1;
          o.hp = Math.min(o.hp, o.maxHp);
          m.maxHp += 1;
          m.hp += 1;
        }
        break;
      }
      case 'coJarsStart':
        for (const hc of me.hand) {
          if (getCard(hc.cardId).type !== 'MINION' || hc.uid === ctx.playedCard?.uid) continue;
          hc.origin = hc.cardId;
          hc.cardId = 'TLC_841t';
          hc.atkBuff = 0;
          hc.hpBuff = 0;
          hc.costMod = 0;
        }
        break;
      case 'coJarPlay':
        if (self && ctx.playedCard?.origin) self.stash = ctx.playedCard.origin;
        break;
      case 'coJarRelease': {
        const sn = ctx.sourceSnapshot ?? self;
        if (sn?.stash) yield* this.doSummon(ctx, sn.owner, sn.stash);
        break;
      }
      case 'coCopyOther': {
        const list = me.hand.filter((h) => h.uid !== ctx.playedCard?.uid && getCard(h.cardId).type === 'MINION' && (this.isRace(h.cardId, 'ELEMENTAL') || this.isRace(h.cardId, 'DRAGON')));
        const hc = pick(s, list);
        if (hc) this.addToHand(me, hc.cardId);
        break;
      }
      case 'coFumigate': {
        if (!chosenM) break;
        const races = getCard(chosenM.cardId).races ?? [];
        const group = allMinions().filter((m) => m === chosenM || (races.length && races.some((r) => this.isRace(m.cardId, r))));
        for (const m of group) yield* this.damage(this.dmgSource(ctx), m.uid, 3 + this.spellDamage(me.id));
        break;
      }
      case 'coFleet': {
        if (!chosenM) break;
        const races = getCard(chosenM.cardId).races ?? [];
        for (const m of me.board) if (this.alive(m) && (m === chosenM || races.some((r) => this.isRace(m.cardId, r)))) {
          m.atkBuff += 1;
          m.maxHp += 2;
          m.hp += 2;
        }
        break;
      }
      case 'coNiri': {
        const t = ctx.it?.kind === 'char' ? this.minion(ctx.it.uid) : null;
        if (t && t.owner === me.id && getCard(t.cardId).cost === 1) {
          t.atkBuff += this.atkOf(t);
          t.maxHp += t.maxHp;
          t.hp += t.hp;
        }
        break;
      }
      case 'coRift': {
        const hc = yield* this.chooseFromList(ctx, me.hand.filter((h) => h.uid !== ctx.playedCard?.uid), '丟入一張牌');
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
        }
        for (let i = 0; i < 2; i++) yield* this.doSummon(ctx, me.id, pick(s, ['TLC_446t2', 'TLC_446t3', 'TLC_446t4'])!);
        break;
      }
      case 'coWay':
        for (let i = 0; i < 2; i++) yield* this.drawWhere(me, (h) => !h.starting);
        break;
      case 'coOpenGrave':
        (me.locations ??= []).push({ uid: this.uid(), cardId: 'TLC_433t2', owner: me.id, durability: 2, cooldown: 0 });
        break;
      case 'coNinjas':
        (me.eternal ??= []).push({
          ability: { on: { k: 'minionDied', side: 'friendly' }, cond: { c: 'itIsCardId', id: 'TLC_513t2' }, effects: [{ e: 'shuffle', card: 'TLC_513t2', count: 1 }] },
          sourceCardId: ctx.sourceCardId,
        });
        break;
      case 'coGlider':
        (me.pendingDiscounts ??= []).push({ amount: 1, race: 'MURLOC', turn: s.turn, ...(this.evalCond({ c: 'kindred' }, ctx) ? { grant: 'DIVINE_SHIELD' as Keyword } : {}) });
        break;
      case 'coDreadRaptor': {
        const hc = yield* this.drawWhere(me, (h) => {
          const d = getCard(h.cardId);
          return d.type === 'MINION' && d.cost <= 3 && !!d.abilities?.some((a) => a.on.k === 'deathrattle');
        });
        if (hc && this.evalCond({ c: 'kindred' }, ctx)) hc.costMod = -getCard(hc.cardId).cost;
        break;
      }
      case 'coCastDeckCheap': {
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).cost <= 2 && !getCard(h.cardId).secret));
        if (hc) {
          me.deck = me.deck.filter((h) => h !== hc);
          if (ctx.sourceUid !== null) yield* this.castAt(me.id, hc.cardId, ctx.sourceUid);
          else yield* this.castRandomly(me.id, hc.cardId);
        }
        break;
      }
      case 'coGorishi':
        me.gorishi = true;
        break;
      case 'coSulfuras':
        me.powerSwap = { back: me.heroPower.id === 'TLC_632t' ? me.powerSwap?.back ?? HEROES[me.heroClass].power.id : me.heroPower.id, uses: 2 };
        this.setHeroPower(me, 'TLC_632t');
        break;
      case 'coAshalon': {
        if (!self) break;
        for (let i = 0; i < 2; i++) {
          const opts = shuffle(s, ADAPTATIONS.filter((x) => hasCard(x))).slice(0, 3);
          if (!opts.length) break;
          const id = yield* this.choose(ctx, opts, '適應');
          this.applyAdaptation(self, id);
          (me.adapts ??= []).push(id);
        }
        break;
      }
      case 'coOpenRift':
        (me.locations ??= []).push({ uid: this.uid(), cardId: 'TLC_446t1', owner: me.id, durability: 1, cooldown: 0 });
        break;
      case 'coElise': {
        if (!this.evalCond({ c: 'deckTenCosts' }, ctx)) break;
        const base = yield* this.choose(ctx, ['TLC_100t1', 'TLC_100t2', 'TLC_100t3'], '選擇地點的種類');
        const tier = ['TLC_100t1', 'TLC_100t2', 'TLC_100t3'].indexOf(base);
        const val = <T,>(arr: [T, T, T]) => arr[tier];
        const effectDefs: { id: string; fx?: Effect[]; dr?: Effect[] }[] = [
          { id: 'TLC_100t1' + '1', dr: [{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: val([1, 3, 5]) }] },
          { id: 'TLC_100t12', fx: [{ e: 'custom', fn: 'coNextSpellPower', args: { n: val([1, 2, 4]) } }] },
          { id: 'TLC_100t13', fx: [{ e: 'custom', fn: 'coDiscoverSet', args: { pool: { type: 'SPELL' }, reduce: val([1, 4, 7]) } }] },
          { id: 'TLC_100t14', fx: [{ e: 'custom', fn: 'coSnap', args: { n: val([1, 2, 4]) } }] },
          { id: 'TLC_100t15', fx: [{ e: 'summon', card: 'TLC_101t', count: val([1, 2, 4]), who: 'self' }] },
          { id: 'TLC_100t16', fx: [{ e: 'armor', amount: val([3, 6, 12]) }] },
          { id: 'TLC_100t17', fx: [{ e: 'custom', fn: 'coRadiant', args: { n: val([1, 3, 5]) } }] },
        ];
        const picked: typeof effectDefs = [];
        for (let n = 0; n < 2; n++) {
          const pool = effectDefs.filter((d) => !picked.includes(d));
          const opts = shuffle(s, [...pool]).slice(0, 3);
          const idStr = yield* this.choose(ctx, opts.map((d) => tierId(d.id, tier)), n === 0 ? '選擇地點的第一個效果' : '選擇地點的第二個效果');
          const def = opts.find((d) => tierId(d.id, tier) === idStr) ?? opts[0];
          picked.push(def);
        }
        (me.locations ??= []).push({
          uid: this.uid(),
          cardId: base,
          owner: me.id,
          durability: 2,
          cooldown: 0,
          effects: picked.flatMap((d) => d.fx ?? []),
          deathrattle: picked.flatMap((d) => d.dr ?? []),
        });
        break;
      }
      case 'coNextSpellPower':
        me.nextSpellPower = { turn: s.turn, amount: ((me.nextSpellPower?.turn === s.turn ? me.nextSpellPower.amount : 0) as number) + (args.n as number) };
        break;
      case 'coSnap':
        me.hero.tempAtk += args.n as number;
        for (const m of me.board) if (this.alive(m)) m.tempAtk += args.n as number;
        break;
      case 'coRadiant': {
        const t = pick(s, me.board.filter((m) => this.alive(m)));
        if (t) {
          const m = yield* this.doSummon(ctx, me.id, t.cardId);
          if (m) this.setStats(m, args.n as number, args.n as number);
        }
        break;
      }
      case 'coOskDestroy':
        if (chosenM && self) {
          const h = chosenM.hp;
          chosenM.dead = true;
          self.maxHp += h;
          self.hp += h;
          me.hero.maxHp += h;
          me.hero.hp += h;
        }
        break;
      case 'coCastMageSecret': {
        const pool = this.randomPool({ type: 'SPELL', isSecret: true, cls: 'MAGE' }, me.id, false).filter((c) => !me.secrets.some((x) => x.cardId === c.id));
        const c = pick(s, pool);
        if (c) yield* this.castRandomly(me.id, c.id);
        break;
      }
      case 'coOskTax':
        foe.cardTax = { turn: s.turn + 1, amount: 1 };
        break;
      case 'coOskDraw2':
        for (let i = 0; i < 2; i++) {
          const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION');
          if (hc) {
            hc.atkBuff = 2 - (getCard(hc.cardId).attack ?? 0);
            hc.hpBuff = 2 - (getCard(hc.cardId).health ?? 0);
            hc.costMod = 2 - getCard(hc.cardId).cost;
          }
        }
        break;
      case 'coOskCopy':
        if (chosenM) {
          const m = yield* this.doSummon(ctx, me.id, chosenM.cardId);
          if (m) {
            m.atkBuff += this.atkOf(chosenM) - m.baseAtk + 2;
            m.maxHp = chosenM.maxHp + 2;
            m.hp = chosenM.hp + 2;
          }
        }
        break;
      case 'coHandCost':
        for (const h of me.hand) if (getCard(h.cardId).type === 'MINION' && h.uid !== ctx.playedCard?.uid) h.costMod -= args.n as number;
        break;
      case 'coOskRemove': {
        const chosen: Minion[] = [];
        for (let n = 0; n < 2; n++) {
          const list = foe.board.filter((m) => this.alive(m) && !chosen.includes(m) && !this.hasKw(m, 'STEALTH'));
          const t = (yield* this.chooseTarget(me.id, list, '選擇一個敵方手下，將它從遊戲中移除')) as Minion | undefined;
          if (!t) break;
          chosen.push(t);
        }
        for (const m of chosen) foe.board = foe.board.filter((x) => x !== m);
        break;
      }
      case 'coOskForce': {
        for (const m of [...foe.board]) {
          const others = foe.board.filter((x) => x !== m && this.alive(x));
          const t = pick(s, others);
          if (t && this.alive(m)) yield* this.forceAttack(m, t);
        }
        break;
      }
      case 'coOskTendril':
        while (me.hand.length < MAX_HAND) this.addToHand(me, 'TLC_T_TENDRIL');
        break;
      case 'coOskBlast':
        for (const c of [...foe.board, foe.hero] as Char[]) if (this.alive(c)) yield* this.damage(this.dmgSource(ctx), c.uid, 3);
        for (const c of [...me.board, me.hero] as Char[]) if (this.alive(c)) yield* this.heal(c.uid, 6);
        break;
      case 'coOskSummon6': {
        const c = pick(s, this.randomPool({ type: 'MINION', cost: 6, anyClass: true }, me.id, false));
        if (c) {
          const m = yield* this.doSummon(ctx, me.id, c.id);
          if (m) for (const k of ['TAUNT', 'LIFESTEAL'] as Keyword[]) if (!m.keywords.includes(k)) m.keywords.push(k);
        }
        break;
      }
      case 'coNether2':
        for (const m of allMinions()) if (m.uid !== ctx.sourceUid) m.dead = true;
        break;
      case 'coImbued': {
        const n = me.imbued ?? 1;
        switch (args.kind as string) {
          case 'golem': {
            const m = yield* this.doSummon(ctx, me.id, 'EDR_847pt2');
            if (m) this.setStats(m, n, n);
            break;
          }
          case 'wolf': {
            const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'BEAST')));
            if (hc) {
              hc.atkBuff += n;
              hc.costMod -= n;
            }
            break;
          }
          case 'wisp':
            for (let i = 0; i < n; i++) yield* this.doSummon(ctx, me.id, 'EDR_851t');
            for (let i = 0; i < n; i++) {
              const t = randomEnemyTarget();
              if (t) yield* this.damage({ owner: me.id, uid: null, cardId: 'EDR_851p' }, t.uid, 1);
            }
            break;
          case 'dragon':
            for (let i = 0; i < 2; i++) {
              const hc = this.newHandCard('EDR_445pt3');
              hc.counter = n;
              this.shuffleInto(me, hc);
            }
            break;
          case 'moon': {
            const pool = this.randomPool({ cls: 'PRIEST' }, me.id, false).filter((c) => (c.type === 'MINION' || c.type === 'SPELL') && c.collectible);
            const opts = this.discoverOptions(undefined, me.id, pool);
            if (!opts.length) break;
            const id = yield* this.choose(ctx, opts, '選擇一張牧師牌（暫時）');
            const hc = this.addToHand(me, id);
            if (hc) {
              hc.costMod -= n;
              hc.temporary = true;
            }
            break;
          }
          case 'wind':
            if (chosenM) {
              const cost = getCard(chosenM.cardId).cost + n;
              const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(cost, 10), anyClass: true }, me.id, false));
              if (c) this.transform(chosenM.uid, c.id);
            }
            break;
        }
        break;
      }
      case 'coPortal': {
        const n = ctx.drawnCard?.counter ?? 1;
        let c: CardDef | undefined;
        for (let d = 0; d <= 10 && !c; d++) {
          for (const cost of d === 0 ? [n] : [n + d, n - d]) {
            c = pick(s, this.randomPool({ type: 'MINION', race: 'DRAGON', cost, anyClass: true }, me.id, false));
            if (c) break;
          }
        }
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'coGiftPick': {
        // 發現一個帶有黑暗禮物的手下：三個選項各自帶著一個隨機的禮物
        let cards = args.pool ? this.randomPool(args.pool as Pool, me.id, !(args.pool as Pool).anyClass && !(args.pool as Pool).cls) : this.randomPool({ type: 'MINION', anyClass: true }, me.id, false);
        if (args.filter === 'comboBcStealth') {
          cards = cards.filter((c) => c.keywords?.includes('STEALTH') || !!c.abilities?.some((a) => a.on.k === 'play') || JSON.stringify(c.abilities ?? []).includes('"c":"combo"'));
        } else if (args.filter === 'deck') {
          cards = me.deck.map((h) => getCard(h.cardId)).filter((c) => c.type === 'MINION');
        } else if (args.filter === 'undead') cards = cards.filter((c) => this.isRace(c.id, 'UNDEAD'));
        const opts = pickDistinct(cards, 3);
        if (!opts.length) break;
        const gifts = shuffle(s, this.giftList()).slice(0, opts.length);
        const title = `發現一個帶有黑暗禮物的手下（${gifts.map((g) => g.name).join('／')}）`;
        const id = yield* this.choose(ctx, opts, title);
        const gift = gifts[opts.indexOf(id)];
        const hc = this.addToHand(me, id);
        if (hc) {
          this.giftHand(hc, gift, me.id);
          if (args.reduce) hc.costMod -= args.reduce as number;
          if (args.copy) {
            const c2 = this.addToHand(me, id);
            if (c2) this.giftHand(c2, gift, me.id);
          }
          this.log(me.id, `${this.name(id)}帶有黑暗禮物：${gift.name}`);
        }
        if (args.shuffle) for (const o of opts.filter((x) => x !== id)) this.shuffleInto(me, this.newHandCard(o));
        break;
      }
      case 'coDream':
        this.addToHand(me, pick(s, ['DREAM_01', 'DREAM_02', 'DREAM_03', 'DREAM_04', 'DREAM_05'])!);
        break;
      case 'coSaber': {
        const pc = ctx.playedCard;
        const cost = pc ? Math.max(0, getCard(pc.cardId).cost + pc.costMod) : 99;
        if (cost > 3 || !self) break;
        for (const t of shuffle(s, foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH'))).slice(0, 2)) if (this.alive(self) && this.alive(t)) yield* this.forceAttack(self, t);
        break;
      }
      case 'coOhnahra':
        for (let i = 0; i < 3 && !this.over; i++) {
          const hc = me.deck[me.deck.length - 1];
          if (!hc) break;
          me.deck = me.deck.slice(0, -1);
          yield* this.replay(me.id, hc.cardId);
        }
        break;
      case 'coThrice': {
        for (let i = 0; i < 3; i++) {
          const id = yield* this.choose(ctx, ['EDR_209a', 'EDR_209b'], `選擇一個效果（${i + 1}/3）`);
          if (id === 'EDR_209a') {
            for (const m of me.board) if (m.uid !== ctx.sourceUid && this.alive(m)) {
              m.atkBuff += 1;
              m.maxHp += 3;
              m.hp += 3;
            }
          } else yield* this.doSummon(ctx, me.id, 'EDR_209t5');
        }
        break;
      }
      case 'coTopMinions': {
        let n = 0;
        for (let i = me.deck.length - 1; i >= 0 && n < 3; i--) {
          if (getCard(me.deck[i].cardId).type !== 'MINION') continue;
          me.deck[i].atkBuff += 4;
          me.deck[i].hpBuff += 4;
          n++;
        }
        break;
      }
      case 'coTyphoon': {
        for (const m of allMinions()) {
          const owner = s.players[m.owner];
          owner.board = owner.board.filter((x) => x !== m);
          const target = s.players[randomInt(s, 2)];
          this.shuffleInto(target, this.newHandCard(m.cardId));
        }
        break;
      }
      case 'coMerithra': {
        const seen = new Set<string>();
        for (const id of me.graveyard) {
          const d = getCard(id);
          if (d.type !== 'MINION' || d.cost < 8 || seen.has(d.name)) continue;
          seen.add(d.name);
          if (me.board.length < MAX_BOARD) yield* this.doSummon(ctx, me.id, id);
        }
        break;
      }
      case 'coMark':
        if (chosenM) this.setStats(chosenM, chosenM.owner === me.id ? 3 : 1, chosenM.owner === me.id ? 3 : 1);
        break;
      case 'coLowest':
        for (let i = 0; i < (args.times as number); i++) {
          const t = ([...foe.board, foe.hero] as Char[]).filter((c) => this.alive(c) && (isHero(c) || !this.hasKw(c, 'STEALTH'))).sort((a, b) => a.hp - b.hp)[0];
          if (t) yield* this.damage(this.dmgSource(ctx), t.uid, (args.n as number) + this.spellDamage(me.id));
        }
        break;
      case 'coDreamwarden': {
        const hc = pick(s, me.deck.filter((h) => !h.starting));
        if (hc && self) {
          yield* this.takeIntoHand(me, hc);
          self.atkBuff += 2;
          self.maxHp += 2;
          self.hp += 2;
        }
        break;
      }
      case 'coUrsol': {
        const spells = me.hand.filter((h) => getCard(h.cardId).type === 'SPELL' && !getCard(h.cardId).secret && h.uid !== ctx.playedCard?.uid);
        spells.sort((a, b) => getCard(b.cardId).cost - getCard(a.cardId).cost);
        const hc = spells[0];
        if (!hc) break;
        me.hand = me.hand.filter((h) => h !== hc);
        (me.eternal ??= []).push({
          ability: { on: { k: 'turnEnd', whose: 'mine' }, effects: [{ e: 'custom', fn: 'coCastStored', args: { id: hc.cardId } }] },
          sourceCardId: 'EDR_259',
          until: s.turn + 2 * 2,
        });
        break;
      }
      case 'coCastStored':
        yield* this.castRandomly(me.id, args.id as string);
        break;
      case 'coAmphibian':
        if (chosenM) {
          chosenM.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'coAmphibianDr' }] });
        }
        break;
      case 'coAmphibianDr': {
        const t = pick(s, me.board.filter((m) => this.alive(m) && m.uid !== ctx.sourceSnapshot?.uid));
        if (t) {
          t.atkBuff += 2;
          t.maxHp += 2;
          t.hp += 2;
          t.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'custom', fn: 'coAmphibianDr' }] });
        }
        break;
      }
      case 'coSpiritBond':
        if (chosenM) {
          yield* this.damage(this.dmgSource(ctx), chosenM.uid, 3 + this.spellDamage(me.id));
          if (chosenM.hp <= 0 || chosenM.dead) yield* this.doSummon(ctx, me.id, 'EDR_T_WOLF32');
        }
        break;
      case 'coGroveShaper': {
        if (!ctx.itCardId) break;
        const m = yield* this.doSummon(ctx, me.id, 'EDR_271t');
        if (m) m.stash = ctx.itCardId;
        break;
      }
      case 'coGetStash': {
        const sn = ctx.sourceSnapshot ?? self;
        if (sn?.stash) this.addToHand(me, sn.stash);
        break;
      }
      case 'coSheep': {
        const m = yield* this.doSummon(ctx, me.id, 'EDR_416t');
        if (m) this.goDormantFor(m, 2);
        break;
      }
      case 'coOmenGrow':
        if (self) self.counter = (self.counter ?? 0) + 1;
        break;
      case 'coOmenDr': {
        const sn = ctx.sourceSnapshot ?? self;
        const n = 1 + (sn?.counter ?? 0);
        for (const c of [...foe.board, foe.hero] as Char[]) if (this.alive(c)) yield* this.damage({ owner: me.id, uid: null, cardId: 'EDR_421' }, c.uid, n);
        break;
      }
      case 'coAessina': {
        const dead = me.graveyard.filter((id) => getCard(id).type === 'MINION').length;
        if (dead < 20) break;
        for (let i = 0; i < 20; i++) {
          const t = randomEnemyTarget();
          if (t) yield* this.damage(this.dmgSource(ctx), t.uid, 1);
        }
        break;
      }
      case 'coBriarspawn': {
        if (!self || !this.alive(self)) break;
        const t = pick(s, foe.board.filter((m) => this.alive(m) && !this.hasKw(m, 'STEALTH') && !this.hasKw(m, 'DORMANT')));
        if (!t) break;
        const excess = Math.max(0, this.atkOf(self) - t.hp);
        yield* this.forceAttack(self, t);
        if (excess > 0 && (t.hp <= 0 || t.dead)) yield* this.damage(this.charSource(self), foe.hero.uid, excess);
        break;
      }
      case 'coResummonDiscover': {
        const pool = [...new Set(me.graveyard.filter((id) => getCard(id).type === 'MINION' && this.isRace(id, args.race as Race)))];
        const opts = shuffle(s, pool).slice(0, 3);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一隻死亡的友方龍並復活它');
        yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coBounty': {
        const drawn = yield* this.draw(me, 2);
        for (const h of drawn) h.lockedUntil = s.turn + 2;
        break;
      }
      case 'coDrawStarting': {
        const want = !!args.starting;
        yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'SPELL' && !!h.starting === want);
        break;
      }
      case 'coGainAtkCost': {
        if (!self || !ctx.itCardId) break;
        self.atkBuff += getCard(ctx.itCardId).cost;
        break;
      }
      case 'coSummonTaunt': {
        const c = pick(s, this.randomPool({ type: 'MINION', cost: args.cost as number, anyClass: true }, me.id, false));
        if (c) {
          const m = yield* this.doSummon(ctx, me.id, c.id);
          if (m && !m.keywords.includes('TAUNT')) m.keywords.push('TAUNT');
        }
        break;
      }
      case 'coTyrande':
        me.doubleSpellsLeft = (me.doubleSpellsLeft ?? 0) + 3;
        break;
      case 'coYsondre': {
        const n = Math.max(1, me.graveyard.filter((id) => id === 'EDR_465').length);
        for (let i = 0; i < n; i++) {
          const c = pick(s, this.randomPool({ type: 'MINION', race: 'DRAGON', anyClass: true }, me.id, false));
          if (c) yield* this.doSummon(ctx, me.id, c.id);
        }
        break;
      }
      case 'coGainDeadAttack': {
        if (!self || !ctx.itCardId || ctx.it?.uid === self.uid) break;
        self.atkBuff += ctx.eventAmount;
        break;
      }
      case 'coArchdruid': {
        if (!self) break;
        const ids = me.diedThisTurn?.turn === s.turn ? me.diedThisTurn.ids : [];
        for (const id of ids) for (const ab of getCard(id).abilities ?? []) if (ab.on.k === 'deathrattle') self.abilities.push(structuredClone(ab));
        break;
      }
      case 'coAlarashi': {
        for (const hc of me.hand) {
          const d = getCard(hc.cardId);
          if (d.type !== 'MINION' || hc.uid === ctx.playedCard?.uid) continue;
          const c = pick(s, this.randomPool({ type: 'MINION', race: 'DEMON', anyClass: true }, me.id, false));
          if (!c) break;
          const atk = (d.attack ?? 0) + hc.atkBuff;
          const hp = (d.health ?? 0) + hc.hpBuff;
          const cost = d.cost + hc.costMod;
          hc.cardId = c.id;
          hc.atkBuff = atk - (c.attack ?? 0);
          hc.hpBuff = hp - (c.health ?? 0);
          hc.costMod = cost - c.cost;
        }
        break;
      }
      case 'coEatDeck': {
        if (!self) break;
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc) break;
        me.deck = me.deck.filter((h) => h !== hc);
        const d = getCard(hc.cardId);
        self.atkBuff += (d.attack ?? 0) + hc.atkBuff;
        self.maxHp += (d.health ?? 0) + hc.hpBuff;
        self.hp += (d.health ?? 0) + hc.hpBuff;
        (self.devoured ??= []).push(hc);
        break;
      }
      case 'coRegurgitate': {
        const sn = ctx.sourceSnapshot ?? self;
        for (const hc of sn?.devoured ?? []) this.addToHand(me, hc.cardId);
        break;
      }
      case 'coTwistedTreant':
        for (const pl of s.players) {
          const hc = pick(s, pl.hand.filter((h) => getCard(h.cardId).type === 'MINION'));
          if (hc) hc.atkBuff -= 2;
        }
        break;
      case 'coQonzu': {
        const opts = this.discoverOptions({ type: 'SPELL' }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個法術');
        const keep = yield* this.choose(ctx, ['EDR_517A', 'EDR_517B'], '保留它，或放到你對手的牌堆頂');
        if (keep === 'EDR_517A') this.addToHand(me, id);
        else foe.deck.push(this.newHandCard(id));
        break;
      }
      case 'coHandCostOne': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'MINION' && h.uid !== ctx.playedCard?.uid));
        if (hc) hc.costMod -= 1;
        break;
      }
      case 'coWisprider': {
        this.doImbue(me);
        const spec = this.powerDef(me);
        const t = spec.target ? pick(s, me.board.filter((m) => this.alive(m))) : undefined;
        if (spec.target && !t) break;
        yield* this.runEffects(spec.effects, { ...ctx, isHeroPower: true, chosen: t ? t.uid : null });
        break;
      }
      case 'coSatyr': {
        const list = [...foe.hand].sort((a, b) => getCard(a.cardId).cost - getCard(b.cardId).cost);
        if (list[0]) this.addToHand(me, list[0].cardId);
        break;
      }
      case 'coMimicry': {
        const drawn = yield* this.draw(foe, 2);
        for (const h of drawn) this.addToHand(me, h.cardId);
        break;
      }
      case 'coAssailant': {
        for (const h of me.hand) {
          if (h.uid === ctx.playedCard?.uid) continue;
          const match = foe.hand.find((x) => x.cardId === h.cardId);
          if (match) {
            foe.hand = foe.hand.filter((x) => x !== match);
            this.shuffleInto(foe, match);
            break;
          }
        }
        break;
      }
      case 'coThornPoison': {
        if (!me.weapon) break;
        if (!me.weapon.keywords.includes('POISONOUS')) me.weapon.keywords.push('POISONOUS');
        (me.endOfTurnEffects ??= []).push({ effects: [{ e: 'custom', fn: 'coThornEnd' }], sourceCardId: ctx.sourceCardId });
        break;
      }
      case 'coThornEnd':
        if (me.weapon) me.weapon.keywords = me.weapon.keywords.filter((k) => k !== 'POISONOUS');
        break;
      case 'coThornDr':
        me.weapon?.abilities.push({ on: { k: 'deathrattle' }, effects: [{ e: 'damage', target: { t: 'all', filter: { type: 'character', side: 'enemy' } }, amount: 2 }] });
        break;
      case 'coRenferal': {
        const n = 1 + (me.renferalPlayed ?? 0);
        me.renferalPlayed = (me.renferalPlayed ?? 0) + 1;
        for (const h of shuffle(s, [...foe.hand]).slice(0, n)) h.lockedUntil = s.turn + 1;
        break;
      }
      case 'coAshamane': {
        while (me.hand.length < MAX_HAND && foe.deck.length) {
          const h = pick(s, foe.deck)!;
          const hc = this.addToHand(me, h.cardId);
          if (!hc) break;
          hc.costMod -= 3;
        }
        break;
      }
      case 'coFuel': {
        const opts: string[] = [];
        for (const h of shuffle(s, [...foe.deck])) if (opts.length < 3 && getCard(h.cardId).type === 'MINION' && !opts.includes(h.cardId)) opts.push(h.cardId);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現對手牌堆中的一個手下');
        const hc = this.addToHand(me, id);
        if (hc && ctx.combo) {
          const g = pick(s, this.giftList())!;
          this.giftHand(hc, g, me.id);
        }
        break;
      }
      case 'coWebweaver': {
        if (!ctx.itCardId) break;
        if ((me.playedCards ?? []).filter((id) => id === ctx.itCardId).length >= 2) yield* this.draw(me, 1);
        break;
      }
      case 'coDreadwing':
        for (let i = 0; i < 2; i++) {
          const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'DRAGON'));
          if (hc) hc.costMod -= 1;
        }
        break;
      case 'coGiftedCost':
        for (const h of me.hand) if (h.gifted && getCard(h.cardId).type === 'MINION') h.costMod -= args.n as number;
        break;
      case 'coIllusionist': {
        if (!self) break;
        const copy = yield* this.doSummon(ctx, me.id, self.cardId);
        const pickM = pick(s, [self, ...(copy ? [copy] : [])]);
        if (pickM) pickM.stash = 'illusion';
        break;
      }
      case 'coLeech': {
        if (!self) break;
        const n = 1 + this.flagCount('leechBoost', me.id);
        const t = ([...foe.board, foe.hero] as Char[]).filter((c) => this.alive(c) && (isHero(c) || !this.hasKw(c, 'STEALTH'))).sort((a, b) => a.hp - b.hp)[0];
        if (t) {
          const dealt = yield* this.damage(this.charSource(self), t.uid, n);
          if (dealt > 0) yield* this.heal(me.hero.uid, dealt);
        }
        break;
      }
      case 'coRite': {
        const opts = this.discoverOptions({ type: 'MINION', race: 'UNDEAD' }, me.id);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個不死族');
        const hc = this.addToHand(me, id);
        if (hc && this.spendCorpses(me, 2)) this.giftHand(hc, pick(s, this.giftList())!, me.id);
        break;
      }
      case 'coRuneblade': {
        const prev = me.playedCards?.[me.playedCards.length - 2];
        const d = prev ? getCard(prev) : null;
        if (!d || !me.weapon) break;
        if (d.runes?.unholy) me.weapon.atk += 1;
        if (d.runes?.blood) me.weapon.durability += 1;
        break;
      }
      case 'coBeetles': {
        if (!self) break;
        const beetles = me.board.filter((m) => this.alive(m) && m.cardId === 'EDR_818t');
        if (beetles[0] !== self) break;
        const n = beetles.length;
        me.board = me.board.filter((m) => !beetles.includes(m));
        const m = yield* this.doSummon(ctx, me.id, 'EDR_818');
        if (m) this.setStats(m, 7, n);
        break;
      }
      case 'coSeeds': {
        const defs: [string, number][] = [['EDR_840t', 2], ['EDR_840t1', 1], ['EDR_840t2', 3]];
        for (let i = 0; i < (args.n as number); i++) {
          const [id, t] = pick(s, defs)!;
          const m = yield* this.doSummon(ctx, me.id, id);
          if (m) this.goDormantFor(m, t);
        }
        break;
      }
      case 'coSpear': {
        const lastDef = this.lastAttack?.defender;
        if (lastDef === undefined) break;
        const t = pick(s, ([foe.hero, ...foe.board] as Char[]).filter((c) => this.alive(c) && c.uid !== lastDef && (isHero(c) || !this.hasKw(c, 'STEALTH'))));
        if (t) yield* this.damage(this.charSource(me.hero), t.uid, this.atkOf(me.hero));
        break;
      }
      case 'coCorruptShal': {
        const hc = ctx.handSource !== undefined ? me.hand.find((h) => h.uid === ctx.handSource) : undefined;
        if (hc && hc.cardId === 'EDR_846' && ctx.itCardId && getCard(ctx.itCardId).cost > getCard('EDR_846').cost) hc.corrupted = true;
        break;
      }
      case 'coShaladrassil': {
        const corrupted = !!ctx.playedCard?.corrupted;
        const normal = ['DREAM_01', 'DREAM_02', 'DREAM_03', 'DREAM_04', 'DREAM_05'];
        const bad = ['EDR_846t3', 'EDR_846t4', 'EDR_846t5', 'EDR_846t2', 'EDR_846t1'];
        for (const id of corrupted ? bad : normal) this.addToHand(me, id);
        break;
      }
      case 'coShuffleMinion':
        if (chosenM) {
          const owner = s.players[chosenM.owner];
          owner.board = owner.board.filter((m) => m !== chosenM);
          this.shuffleInto(owner, this.newHandCard(chosenM.cardId));
        }
        break;
      case 'coBroll': {
        const id = pick(s, ['NEW1_032', 'NEW1_033', 'NEW1_034'])!;
        yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coEnvoy': {
        const pool = this.randomPool({ cls: 'DRUID' }, me.id, false).filter((c) => c.collectible && c.type !== 'HERO');
        for (const h of me.deck) {
          if (getCard(h.cardId).cardClass !== 'NEUTRAL') continue;
          const c = pick(s, pool);
          if (c) h.cardId = c.id;
        }
        break;
      }
      case 'coStellar':
        for (const id of ['CS2_008', 'EX1_173']) {
          const hc = this.addToHand(me, id);
          if (hc) hc.spellPower = (hc.spellPower ?? 0) + 1;
        }
        break;
      case 'coMalorne': {
        const gods = ["Goldrinn", "Ursol", "Aviana", "Aessina", "Ohn'ahra", 'Omen', 'Tortolla', 'Malorne'];
        const pool = this.randomPool({ type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, me.id, false).filter((c) => gods.some((g) => c.nameEn.includes(g)));
        const opts = this.discoverOptions(undefined, me.id, pool);
        if (!opts.length) break;
        const id = yield* this.choose(ctx, opts, '發現一個傳說野神');
        const hc = this.addToHand(me, id);
        if (hc && (me.imbued ?? 0) >= 4) hc.costMod = 1 - getCard(id).cost;
        break;
      }
      case 'coRightmostCost': {
        const hc = me.hand[me.hand.length - 1];
        if (hc) hc.costMod -= args.n as number;
        break;
      }
      case 'coFelhunter': {
        const sn = ctx.sourceSnapshot ?? self;
        const list = me.graveyard.filter((id) => {
          const d = getCard(id);
          if (d.type !== 'MINION' || !d.abilities?.some((a) => a.on.k === 'deathrattle')) return false;
          if (args.max !== undefined && d.cost > (args.max as number)) return false;
          if (args.min !== undefined && d.cost < (args.min as number)) return false;
          if (args.different && sn && id === sn.cardId) return false;
          return true;
        });
        const id = pick(s, list);
        if (!id) break;
        yield* this.doSummon(ctx, me.id, id);
        yield* this.doSummon(ctx, me.id, id);
        break;
      }
      case 'coFullMoon':
        me.fullMoon = true;
        break;
      case 'coMoonkin': {
        const n = 1 + me.board.filter((m) => this.alive(m) && getCard(m.cardId).nameEn.includes('Wisp')).length;
        yield* this.runEffect({ e: 'armor', amount: n }, ctx);
        break;
      }
      case 'coStarsurge':
        if (chosenM) {
          const dead = me.graveyard.filter((id) => getCard(id).type === 'MINION').length;
          yield* this.damage(this.dmgSource(ctx), chosenM.uid, 1 + dead + this.spellDamage(me.id));
        }
        break;
      case 'coStrider': {
        const hc = this.newHandCard('EDR_978');
        hc.costMod = 1 - getCard('EDR_978').cost;
        me.deck.unshift(hc);
        break;
      }
      case 'coDormantFor':
        if (self) this.goDormantFor(self, args.turns as number);
        break;
      case 'coOverheat': {
        for (const m of me.board) if (this.alive(m)) {
          m.atkBuff += 1;
          m.maxHp += 1;
          m.hp += 1;
        }
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).spellSchool === 'NATURE'));
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
          for (const m of me.board) if (this.alive(m)) {
            m.atkBuff += 1;
            m.maxHp += 1;
            m.hp += 1;
          }
        }
        break;
      }
      case 'coScorching': {
        if (ctx.chosen === null) break;
        yield* this.damage(this.dmgSource(ctx), ctx.chosen, 3 + this.spellDamage(me.id));
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).spellSchool === 'FIRE'));
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
          if (this.char(ctx.chosen)) yield* this.damage(this.dmgSource(ctx), ctx.chosen, 3 + this.spellDamage(me.id));
        }
        break;
      }
      case 'coInferno': {
        const c = pick(s, this.randomPool({ type: 'MINION', race: 'ELEMENTAL', anyClass: true }, me.id, false));
        if (c) {
          const hc = this.addToHand(me, c.id);
          if (hc) hc.costMod -= 3;
        }
        break;
      }
      case 'coPhoenix':
        (me.endOfTurnCards ??= []).push('FIR_919');
        break;
      case 'coKeeper':
        for (const h of me.hand) if (getCard(h.cardId).type === 'MINION' && h.uid !== ctx.playedCard?.uid) {
          h.atkBuff += 3;
          h.hpBuff += 3;
          h.doomTurn = s.turn + 4;
        }
        break;
      case 'coHandCostAll':
        for (const h of me.hand) if (h.uid !== ctx.playedCard?.uid) h.costMod -= args.n as number;
        break;
      case 'coReflection': {
        const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION');
        if (!hc) break;
        const m = yield* this.doSummon(ctx, me.id, hc.cardId);
        if (m) {
          this.setStats(m, 8, 8);
          if (!m.keywords.includes('DIVINE_SHIELD')) m.keywords.push('DIVINE_SHIELD');
        }
        break;
      }
      case 'coFelCost':
        for (const h of me.hand) if (getCard(h.cardId).type === 'SPELL' && getCard(h.cardId).spellSchool === 'FEL') h.costMod -= 1;
        break;
      case 'coMagmaHound': {
        if (!self || !this.alive(self) || !this.lastAttack || this.lastAttack.defenderIsHero || this.lastAttack.attacker !== self.uid) break;
        const atk = this.atkOf(self);
        for (let i = 0; i < atk; i++) {
          const t = randomEnemyTarget();
          if (t) yield* this.damage(this.charSource(self), t.uid, 1);
        }
        break;
      }
      case 'coConflagrate':
        if (chosenM) {
          const owner = s.players[chosenM.owner];
          yield* this.damage(this.dmgSource(ctx), chosenM.uid, 5 + this.spellDamage(me.id));
          yield* this.draw(owner, 1);
        }
        break;
      case 'coFyrakk': {
        let budget = 15;
        const fires = this.randomPool({ type: 'SPELL', spellSchool: 'FIRE', anyClass: true }, me.id, false).filter((c) => c.collectible && !c.secret);
        for (let i = 0; i < 40 && budget > 0 && !this.over; i++) {
          const opts = fires.filter((c) => c.cost <= budget);
          const c = pick(s, opts);
          if (!c) break;
          budget -= Math.max(1, c.cost);
          yield* this.castRandomly(me.id, c.id, true);
        }
        break;
      }
      case 'coDragonkin': {
        const beasts = me.hand.filter((h) => getCard(h.cardId).type === 'MINION' && this.isRace(h.cardId, 'BEAST') && h.uid !== ctx.playedCard?.uid).sort((a, b) => getCard(a.cardId).cost - getCard(b.cardId).cost);
        if (beasts[0]) this.addToHand(me, beasts[0].cardId);
        break;
      }
      case 'coLifebind':
        me.healDamageOnceTurn = s.turn;
        break;
      case 'coChamber': {
        const hc = yield* this.chooseFromList(ctx, me.hand.filter((h) => getCard(h.cardId).type === 'MINION'), '選擇你手牌中的一個手下');
        if (hc) {
          hc.atkBuff += 2;
          hc.hpBuff += 2;
        }
        break;
      }
      case 'coNaga': {
        const c = pick(s, this.randomPool({ type: 'MINION', race: 'NAGA', anyClass: true }, me.id, false).filter((x) => !x.colossal));
        if (c) {
          const hc = this.addToHand(me, c.id);
          if (hc) hc.costMod = 1 - c.cost;
        }
        break;
      }
      case 'coVolcano': {
        const fire = me.turnSpells?.turn === s.turn && me.turnSpells.ids.some((id) => getCard(id).spellSchool === 'FIRE');
        const n = 3 + (fire ? 3 : 0);
        for (let i = 0; i < n; i++) {
          const t = randomEnemyTarget();
          if (t) yield* this.damage({ owner: me.id, uid: null, cardId: ctx.sourceCardId }, t.uid, 1);
        }
        break;
      }
      case 'coClearing':
        if (chosenM) this.goDormantFor(chosenM, 2);
        break;
      case 'coSpire': {
        const m = yield* this.doSummon(ctx, me.id, 'JAIL_511t');
        if (!m) break;
        const n = Math.max(1, me.hand.length);
        this.setStats(m, n, n);
        m.sleeping = false;
        m.tempKeywords.push('IMMUNE');
        const t = pick(s, foe.board.filter((x) => this.alive(x) && !this.hasKw(x, 'STEALTH')));
        if (t) yield* this.forceAttack(m, t);
        break;
      }
      case 'coPrison': {
        const hc = yield* this.chooseFromList(ctx, me.hand, '選擇一張牌棄掉');
        if (!hc) break;
        me.hand = me.hand.filter((h) => h !== hc);
        (me.zuramat ??= []).push(hc.cardId);
        yield* this.discarded(me, hc);
        yield* this.doSummon(ctx, me.id, 'JAIL_887t3');
        break;
      }
      case 'coZuramat': {
        const list = me.zuramat ?? [];
        if (!list.length) break;
        const i = randomInt(s, list.length);
        const [id] = list.splice(i, 1);
        yield* this.replay(me.id, id);
        break;
      }
      case 'coLowSecurity': {
        const c = pick(s, this.randomPool({ type: 'MINION', cls: 'SHAMAN' }, me.id, false));
        if (!c) break;
        const hc = this.addToHand(me, c.id);
        if (hc) hc.lockPlayedAt = me.playedCards?.length ?? 0;
        break;
      }
      case 'coClutch': {
        if (!chosenM) break;
        const m = yield* this.doSummon(ctx, me.id, 'EDR_454t');
        if (m) m.stash = chosenM.cardId;
        break;
      }
      case 'coHatch': {
        const sn = ctx.sourceSnapshot ?? self;
        if (sn?.stash) yield* this.doSummon(ctx, sn.owner, sn.stash);
        break;
      }
      case 'coForbidden': {
        const n = me.mana;
        me.mana = 0;
        const c = pick(s, this.randomPool({ type: 'SPELL', cost: n, anyClass: true }, me.id, false).filter((x) => x.collectible && !x.secret));
        if (c) yield* this.castRandomly(me.id, c.id);
        break;
      }
      case 'coAmirdrassil': {
        const loc = me.locations?.find((l) => l.uid === ctx.sourceUid);
        const n = (loc ? (loc.uses = (loc.uses ?? 0) + 1) : 1) as number;
        const c = pick(s, this.randomPool({ type: 'MINION', cost: n, anyClass: true }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        me.hero.armor += n;
        yield* this.draw(me, n);
        me.mana = Math.min(me.maxMana, me.mana + n);
        break;
      }
      case 'coAegwynn':
        me.aegwynnNext = true;
        break;
      case 'coInquisitor': {
        if (!self || !this.alive(self) || !this.lastAttack || this.lastAttack.defenderIsHero) break;
        const t = this.char(this.lastAttack.defender);
        if (t && t.owner !== me.id && this.alive(t)) yield* this.forceAttack(self, t);
        break;
      }
      case 'coHighestMinion': {
        const minions = me.deck.filter((h) => getCard(h.cardId).type === 'MINION').sort((a, b) => getCard(b.cardId).cost - getCard(a.cardId).cost);
        if (minions[0]) yield* this.takeIntoHand(me, minions[0]);
        break;
      }
      case 'coAlexstrasza':
        if (chosenM || ctx.chosen !== null) {
          const t = ctx.chosen !== null ? this.char(ctx.chosen) : null;
          if (!t) break;
          if (t.owner === me.id) yield* this.heal(t.uid, 8);
          else yield* this.damage(this.dmgSource(ctx), t.uid, 8);
        }
        break;
      case 'coWhelps':
        while (me.board.length < MAX_BOARD) {
          const m = yield* this.doSummon(ctx, me.id, 'BRM_004t');
          if (!m) break;
        }
        break;
      case 'coMalygosFill':
        for (let i = 0; i < 20 && me.hand.length < MAX_HAND; i++) {
          const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'SPELL');
          if (!hc) break;
        }
        break;
      case 'coDeathwingDiscard': {
        const gone = allMinions().filter((m) => m.uid !== ctx.sourceUid);
        for (const m of gone) m.dead = true;
        for (let i = 0; i < gone.length; i++) {
          const hc = pick(s, me.hand.filter((h) => h.uid !== ctx.playedCard?.uid));
          if (!hc) break;
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
        }
        break;
      }
      case 'coPatchwerk': {
        const h = pick(s, foe.hand.filter((x) => getCard(x.cardId).type === 'MINION'));
        if (h) foe.hand = foe.hand.filter((x) => x !== h);
        const d = pick(s, foe.deck.filter((x) => getCard(x.cardId).type === 'MINION'));
        if (d) foe.deck = foe.deck.filter((x) => x !== d);
        const b = pick(s, foe.board.filter((m) => this.alive(m)));
        if (b) b.dead = true;
        break;
      }
      case 'coSaurfang': {
        const sn = ctx.sourceSnapshot ?? self;
        const hc = this.addToHand(me, sn?.cardId ?? 'RLK_082');
        if (hc) hc.healthCostUntil = 99999;
        break;
      }
      case 'coFrigidara': {
        const drawn: HandCard[] = [];
        for (let i = 0; i < 2; i++) {
          const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'SPELL');
          if (hc) drawn.push(hc);
        }
        if (drawn.length === 2 && drawn.every((h) => getCard(h.cardId).spellSchool === 'FROST')) {
          for (const c of [...foe.board, foe.hero] as Char[]) if (this.alive(c)) yield* this.damage(this.dmgSource(ctx), c.uid, 2);
        }
        break;
      }
      case 'coSpellCost': {
        const hc = pick(s, me.hand.filter((h) => getCard(h.cardId).type === 'SPELL'));
        if (hc) hc.costMod -= 1;
        break;
      }
      case 'coTriggerDr':
        if (chosenM && this.alive(chosenM)) yield* this.runDeathrattles(chosenM);
        break;
      case 'coKennels':
        if (chosenM) {
          chosenM.atkBuff += 2;
          if (this.isRace(chosenM.cardId, 'BEAST') && !chosenM.keywords.includes('RUSH')) chosenM.keywords.push('RUSH');
        }
        break;
      case 'coGhost': {
        const n = 1 + (me.playedThisTurn?.turn === s.turn ? me.playedThisTurn.ids.length : 0);
        const m = yield* this.doSummon(ctx, me.id, 'REV_750t2');
        if (m) this.setStats(m, n, n);
        break;
      }
      case 'coRelicTwice':
        me.relicTwiceTurn = s.turn;
        break;
      case 'coExpanse':
        if (chosenM) {
          const m = yield* this.doSummon(ctx, me.id, chosenM.cardId);
          if (m) this.goDormantFor(m, 1);
        }
        break;
      case 'coMosh':
        if (chosenM && this.spendCorpses(me, 3) && !chosenM.keywords.includes('REBORN')) chosenM.keywords.push('REBORN');
        break;
      case 'coPuppet':
        if (chosenM) {
          const hc = this.addToHand(me, chosenM.cardId);
          if (hc) {
            const d = getCard(chosenM.cardId);
            hc.atkBuff = 1 - (d.attack ?? 0);
            hc.hpBuff = 1 - (d.health ?? 0);
            hc.costMod = 1 - d.cost;
          }
        }
        break;
      case 'coFairyForest': {
        const hc = yield* this.drawWhere(me, (h) => getCard(h.cardId).type === 'MINION' && !!getCard(h.cardId).abilities?.some((a) => a.on.k === 'play'));
        if (hc) hc.costMod -= 1;
        break;
      }
      case 'coCove':
        me.nextMinion44Turn = s.turn;
        break;
      case 'coDollhouse':
        me.spellDmgTurn = { turn: s.turn, n: (me.spellDmgTurn?.turn === s.turn ? me.spellDmgTurn.n : 0) + 1 };
        break;
      case 'coPrisonYogg': {
        if (ctx.chosen === null) break;
        for (let i = 0; i < 4 && !this.over; i++) {
          const c = pick(s, this.randomPool({ type: 'SPELL', anyClass: true }, me.id, false).filter((x) => x.collectible && !x.secret && !x.quest));
          if (!c) break;
          if (this.char(ctx.chosen) && c.target) yield* this.castAt(me.id, c.id, ctx.chosen);
          else yield* this.castRandomly(me.id, c.id);
        }
        break;
      }
      case 'coForgeWills':
        if (chosenM) {
          const m = yield* this.doSummon(ctx, me.id, 'TTN_465t');
          if (m) {
            this.setStats(m, this.atkOf(chosenM), chosenM.hp);
            m.maxHp = chosenM.maxHp;
          }
        }
        break;
      case 'coKnick': {
        const [hc] = yield* this.draw(me, 1);
        if (hc) me.knickUid = hc.uid;
        break;
      }
      case 'coHold':
        me.chooseBothTurn = s.turn;
        break;
      case 'coViscidus': {
        const three = shuffle(s, [...me.hand]).slice(0, 3);
        const hc = yield* this.chooseFromList(ctx, three, '選擇一張牌棄掉');
        if (hc) {
          me.hand = me.hand.filter((h) => h !== hc);
          yield* this.discarded(me, hc);
        }
        yield* this.draw(me, 2);
        break;
      }
      case 'dunDiscardOpp':
        for (let i = 0; i < (args.n as number) && foe.hand.length; i++) {
          const [c] = foe.hand.splice(randomInt(s, foe.hand.length), 1);
          yield* this.discarded(foe, c);
        }
        break;
      case 'dunFreeMinions':
        me.freeMinionsTurn = s.turn;
        break;
      case 'dunWish': {
        const pool = this.randomPool({ type: 'MINION', rarity: 'LEGENDARY', anyClass: true }, me.id, false);
        while (me.board.length < MAX_BOARD) {
          const c = pick(s, pool);
          if (!c || !(yield* this.doSummon(ctx, me.id, c.id))) break;
        }
        me.hero.hp = me.hero.maxHp;
        break;
      }
      case 'dunPortal': {
        const cost = ctx.itCardId ? getCard(ctx.itCardId).cost : 0;
        const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, cost), anyClass: true }, me.id, false));
        if (c) yield* this.doSummon(ctx, me.id, c.id);
        break;
      }
      case 'dunRoast': {
        for (let i = 0; i < 60 && !this.over; i++) {
          const list = [...me.board, ...foe.board].filter((m) => this.alive(m)).map((m) => m.uid);
          list.push(me.hero.uid, foe.hero.uid);
          const uid = pick(s, list)!;
          yield* this.damage(this.dmgSource(ctx), uid, 10 + this.spellDamage(me.id));
          yield* this.processDeaths();
          if (me.hero.hp <= 0 || foe.hero.hp <= 0) break;
        }
        break;
      }
      case 'dunFillHand':
        while (me.hand.length < MAX_HAND) {
          const [hc] = yield* this.draw(me, 1);
          if (!hc || this.over) break;
        }
        break;
      case 'dunWinsBuff': {
        const n = me.dungeonWins ?? 0;
        if (self && n > 0) {
          self.atkBuff += n;
          self.maxHp += n;
          self.hp += n;
        }
        break;
      }
      case 'dunMug':
        for (let i = 0; i < (args.n as number) && foe.hand.length && me.hand.length < MAX_HAND; i++) {
          const [c] = foe.hand.splice(randomInt(s, foe.hand.length), 1);
          me.hand.push(c);
        }
        break;
      case 'dunCoins':
        while (me.hand.length < MAX_HAND) this.addToHand(me, 'GAME_005');
        break;
      case 'dunMask': {
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!t) break;
        for (const h of me.hand) if (getCard(h.cardId).type === 'MINION') h.cardId = t.cardId;
        break;
      }
      case 'dunWaxCopy': {
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!t) break;
        const m = yield* this.doSummon(ctx, me.id, t.cardId);
        if (m && args.oneOne) {
          m.baseAtk = 1;
          m.baseHp = 1;
          m.atkBuff = 0;
          m.hp = m.maxHp = 1;
        }
        break;
      }
      case 'dunEvolve': {
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!t) break;
        const c = pick(s, this.randomPool({ type: 'MINION', cost: Math.min(10, getCard(t.cardId).cost + (args.delta as number)), anyClass: true }, me.id, false));
        if (c) this.transform(t.uid, c.id);
        break;
      }
      case 'dunDestroyHighest': {
        const list = [...me.board, ...foe.board].filter((m) => this.alive(m));
        const top = Math.max(-1, ...list.map((m) => this.atkOf(m)));
        const m = pick(s, list.filter((x) => this.atkOf(x) === top));
        if (m) m.dead = true;
        break;
      }
      case 'dunFromDeck': {
        const hc = pick(s, me.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
        if (!hc || me.board.length >= MAX_BOARD) break;
        me.deck.splice(me.deck.indexOf(hc), 1);
        yield* this.doSummon(ctx, me.id, hc.cardId);
        break;
      }
      case 'dunHandDiscount':
        for (const h of me.hand) h.costMod -= args.amount as number;
        break;
      case 'dunDevour':
        foe.deck.splice(Math.max(0, foe.deck.length - 2), 2);
        break;
      case 'dunSecret':
        if (me.secrets.length < MAX_SECRETS && !me.secrets.some((x) => x.cardId === args.card)) me.secrets.push({ uid: this.uid(), cardId: args.card as string });
        break;
      case 'dunRecruitBoth':
        for (const pl of [me, foe]) {
          if (pl.board.length >= MAX_BOARD) continue;
          const hc = pick(s, pl.deck.filter((h) => getCard(h.cardId).type === 'MINION'));
          if (!hc) continue;
          pl.deck.splice(pl.deck.indexOf(hc), 1);
          yield* this.doSummon(ctx, pl.id, hc.cardId);
        }
        break;
      case 'dunTreasure': {
        const id = pick(s, (args.pool as string[]).filter((x) => hasCard(x)));
        if (id) this.addToHand(me, id);
        break;
      }
      case 'coOnlyPlay':
        me.onlyPlay = { turn: s.turn, type: args.type as 'MINION' | 'SPELL' };
        break;
      case 'coTerraform': {
        // 黑暗地貌改造：對一個手下造成 5 點傷害，向左右延伸，傷害每格減 1
        const t = ctx.chosen !== null ? this.minion(ctx.chosen) : null;
        if (!t) break;
        const board = s.players[t.owner].board;
        const i = board.indexOf(t);
        const bonus = ctx.isSpell ? this.spellDamage(me.id) : 0;
        for (const m of [...board]) {
          const left = 5 - Math.abs(board.indexOf(m) - i);
          if (left > 0 && this.alive(m)) yield* this.damage(this.dmgSource(ctx), m.uid, left + bonus);
        }
        break;
      }
      case 'coPrimordial': {
        const c = pick(s, this.randomPool({ type: 'MINION', colossal: true, past: true, anyClass: true }, me.id, false));
        if (!c) break;
        const hc = this.addToHand(me, c.id);
        if (hc) hc.costMod -= c.cost;
        break;
      }
      case 'coPhoenix': {
        const hc = yield* this.chooseFromList(ctx, me.hand.filter((h) => h.uid !== ctx.handSource), '選擇一張手牌點燃');
        if (!hc) break;
        (me.delayed ??= []).push({ turns: 3, sourceCardId: ctx.sourceCardId, effects: [{ e: 'custom', fn: 'coPhoenixBurn', args: { uid: hc.uid, card: ctx.sourceCardId } }] });
        break;
      }
      case 'coPhoenixBurn': {
        const hc = me.hand.find((h) => h.uid === args.uid);
        if (!hc) break;
        me.hand = me.hand.filter((h) => h !== hc);
        yield* this.discarded(me, hc);
        yield* this.doSummon(ctx, me.id, args.card as string);
        break;
      }
      case 'coBlazer': {
        const fire = me.turnSpells?.turn === s.turn && me.turnSpells.ids.some((id) => getCard(id).spellSchool === 'FIRE');
        if (fire && ctx.chosen !== null) yield* this.runEffects([{ e: 'destroy', target: { t: 'chosen' } }], ctx);
        break;
      }
      case 'coEssence': {
        const ESS = ['CATA_EVENT_110t2', 'CATA_EVENT_110t3', 'CATA_EVENT_110t4', 'CATA_EVENT_110t5', 'CATA_EVENT_110t6', 'CATA_EVENT_110t7'];
        const fx = (id: string, own: boolean): Effect[] => {
          switch (id) {
            case ESS[0]:
              return [{ e: 'damage', target: own ? { t: 'chosen' } : { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: 8, spell: true }];
            case ESS[1]:
              return [{ e: 'draw', count: 3, who: 'self', pool: { type: 'SPELL' } }];
            case ESS[2]:
              return [{ e: 'mana', kind: 'refresh', amount: 8 }];
            case ESS[3]:
              return [{ e: 'armor', amount: 12 }];
            case ESS[4]:
              return [{ e: 'summon', card: 'CATA_EVENT_110t6t', count: 1, who: 'self' }];
            default:
              return [{ e: 'damage', target: { t: 'all', filter: { type: 'minion', side: 'enemy' } }, amount: 4, spell: true }];
          }
        };
        // 相鄰的龍族精華會一起施放（連鎖）
        const idx = ctx.handIndex ?? 0;
        const chain: HandCard[] = [];
        for (let i = idx - 1; i >= 0 && ESS.includes(me.hand[i]?.cardId); i--) chain.push(me.hand[i]);
        for (let i = idx; i < me.hand.length && ESS.includes(me.hand[i]?.cardId); i++) chain.push(me.hand[i]);
        me.hand = me.hand.filter((h) => !chain.includes(h));
        yield* this.runEffects(fx(ctx.sourceCardId, true), ctx);
        for (const h of chain) yield* this.runEffects(fx(h.cardId, false), { ...ctx, chosen: null });
        break;
      }
      case 'coCommissary': {
        const n = me.mana;
        me.mana = 0;
        yield* this.runEffects([{ e: 'summonRandom', pool: { type: 'MINION', cost: n, anyClass: true }, count: 1, who: 'self' }], ctx);
        break;
      }
      case 'coLookout': {
        const [hc] = yield* this.draw(me, 1);
        if (hc) hc.costTurn = { turn: s.turn, amount: 1 };
        break;
      }
      case 'coWatfin': {
        const opts = this.discoverOptions({ type: 'MINION', anyClass: true }, me.id);
        if (!opts.length) break;
        const sus = pick(s, opts)!;
        const id = yield* this.choose(ctx, opts, `發現一個手下（「${getCard(sus).name}」看起來很可疑）`);
        const hc = this.addToHand(me, id);
        if (hc && id === sus) {
          hc.atkBuff += 1;
          hc.hpBuff += 1;
        }
        break;
      }
      case 'coSoulImmo':
        if (me.heroPower.id === 'JAIL_EVENT_101hp') me.starDmg = (me.starDmg ?? 2) + 1;
        else {
          me.starDmg = 2;
          this.setHeroPower(me, 'JAIL_EVENT_101hp');
        }
        break;
      case 'coCollapse':
        yield* this.runEffects([{ e: 'damage', target: { t: 'random', filter: { type: 'character', side: 'enemy' }, count: 1 }, amount: me.starDmg ?? 2 }], ctx);
        break;
      case 'coDesperateBribe': {
        for (const pl of s.players) yield* this.runEffects([{ e: 'summonRandom', pool: { type: 'MINION', cost: 2, anyClass: true }, count: 2, who: pl.id === me.id ? 'self' : 'opponent' }], ctx);
        for (const m of me.board.filter((x) => this.alive(x))) {
          const c = pick(s, this.randomPool({ type: 'MINION', cost: getCard(m.cardId).cost + 1, anyClass: true }, me.id, false));
          if (c) this.transform(m.uid, c.id);
        }
        break;
      }
      case 'coDisciple': {
        const n = 1 + me.hand.filter((h) => this.isRace(h.cardId, 'DRAGON')).length;
        for (let i = 0; i < n; i++) {
          const m = pick(s, [...me.board, ...foe.board].filter((x) => this.alive(x) && x !== self));
          if (m) m.dead = true;
        }
        break;
      }
      case 'coWelcomeHome': {
        const locs = me.locations ?? [];
        if (!locs.length) break;
        const cd = locs.filter((l) => l.cooldown > 0);
        const cand = cd.length ? cd : locs;
        const id = cand.length > 1 ? yield* this.choose(ctx, cand.map((l) => l.cardId), '選擇要重新開啟的地點') : cand[0].cardId;
        const loc = cand.find((l) => l.cardId === id)!;
        loc.cooldown = 0;
        (loc.deathrattle ??= []).push({ e: 'summonRandom', pool: { type: 'MINION', cost: 3, anyClass: true }, count: 1, who: 'self' });
        break;
      }
      case 'coSendFuture': {
        const sent = me.hand.filter((h) => this.handDef(h).type === 'MINION');
        me.hand = me.hand.filter((h) => !sent.includes(h));
        for (const h of sent) (me.delayed ??= []).push({ turns: 2, sourceCardId: ctx.sourceCardId, effects: [{ e: 'custom', fn: 'coReturnFuture', args: { card: h.cardId, atk: h.atkBuff, hp: h.hpBuff, cost: h.costMod } }] });
        break;
      }
      case 'coReturnFuture': {
        const hc = this.addToHand(me, args.card as string);
        if (hc) {
          hc.atkBuff += (args.atk as number) + 5;
          hc.hpBuff += (args.hp as number) + 5;
          hc.costMod += args.cost as number;
        }
        break;
      }
      case 'coSands': {
        // 重新倒轉後只能發現自己職業的法術
        const rewound = (ctx.playedCard?.rewinds ?? 1) < 1;
        yield* this.runEffects([{ e: 'discover', pool: rewound ? { type: 'SPELL' } : { type: 'SPELL', anyClass: true } }], ctx);
        break;
      }
      default:
        if (yield* this.customDark(fn, args, ctx)) break;
        throw new Error(`未知的自訂效果：${fn}`);
    }
  }

}
