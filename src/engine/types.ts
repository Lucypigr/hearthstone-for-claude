// ============================================================================
// 卡牌定義與效果 DSL（Domain-Specific Language）
// 卡牌資料由 scripts/build-cards.ts 從 HearthSim CardDefs.xml 產生，
// 英文卡牌敘述會被解析成下面的 Ability / Effect 結構，引擎再依此執行。
// ============================================================================

export type CardClass =
  | 'NEUTRAL'
  | 'DEATHKNIGHT'
  | 'DEMONHUNTER'
  | 'DRUID'
  | 'HUNTER'
  | 'MAGE'
  | 'PALADIN'
  | 'PRIEST'
  | 'ROGUE'
  | 'SHAMAN'
  | 'WARLOCK'
  | 'WARRIOR';

export type Rarity = 'FREE' | 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type CardType = 'MINION' | 'SPELL' | 'WEAPON' | 'HERO';

export type Race =
  | 'BEAST'
  | 'DEMON'
  | 'DRAGON'
  | 'ELEMENTAL'
  | 'MECHANICAL'
  | 'MURLOC'
  | 'PIRATE'
  | 'TOTEM'
  | 'NAGA'
  | 'UNDEAD'
  | 'QUILBOAR'
  | 'DRAENEI'
  | 'ALL';

export type Keyword =
  | 'TAUNT'
  | 'DIVINE_SHIELD'
  | 'CHARGE'
  | 'RUSH'
  | 'WINDFURY'
  | 'MEGA_WINDFURY'
  | 'STEALTH'
  | 'POISONOUS'
  | 'LIFESTEAL'
  | 'REBORN'
  | 'ELUSIVE'
  | 'CANT_ATTACK'
  | 'CANT_ATTACK_HEROES'
  | 'FREEZE_ON_DAMAGE'
  | 'CLEAVE'
  | 'IMMUNE'
  | 'TRADEABLE'
  /** 回音：本回合可以重複使用 */
  | 'ECHO';

/** 相對於效果擁有者（controller）的陣營 */
export type Side = 'friendly' | 'enemy' | 'any';

/** 篩選角色（英雄 / 手下）的條件 */
export interface Filter {
  side?: Side;
  /** 預設為 character（英雄 + 手下） */
  type?: 'minion' | 'hero' | 'character';
  race?: Race;
  /** 排除效果來源本身 */
  excludeSelf?: boolean;
  damaged?: boolean;
  undamaged?: boolean;
  maxAttack?: number;
  minAttack?: number;
  keyword?: Keyword;
  /** 排除玩家選擇的目標（例如「對其他敵人造成 1 點傷害」） */
  excludeChosen?: boolean;
}

export type TargetExpr =
  /** 玩家在出牌時選擇的目標 */
  | { t: 'chosen' }
  /** 效果來源（手下 / 武器 / 英雄） */
  | { t: 'self' }
  | { t: 'hero'; side: 'friendly' | 'enemy' | 'both' }
  | { t: 'all'; filter: Filter }
  | { t: 'random'; filter: Filter; count: number }
  /** 相鄰手下（of: self = 來源兩側；chosen = 所選目標兩側） */
  | { t: 'adjacent'; of: 'self' | 'chosen' }
  /** 情境中的「它」：觸發事件的對象 / 剛召喚的手下 / 剛發現的卡牌 */
  | { t: 'it' };

export type DynAmount =
  | 'handSize'
  | 'friendlyMinions'
  | 'otherFriendlyMinions'
  | 'enemyMinions'
  | 'allOtherMinions'
  | 'armor'
  | 'damagedFriendlyChars'
  | 'eventAmount'
  | 'cardsPlayedThisTurn'
  | 'spellsCastThisGame'
  | 'weaponAttack'
  | 'selfAttack'
  | 'heroAttack'
  | 'secrets'
  | 'heroMissingHealth'
  | 'oppHandSize'
  | 'deathsThisTurn'
  | 'friendlyDeathsThisGame'
  | 'heroPowersUsed'
  | 'drawnThisTurn'
  | 'spellsInHand'
  | 'damagedMinions'
  | 'friendlyRace'
  | 'summonedRace';

export type Amount = number | { dyn: DynAmount; mult?: number; base?: number; race?: Race };

export interface Pool {
  type?: CardType;
  race?: Race;
  cost?: number;
  maxCost?: number;
  rarity?: Rarity;
  /** 'own' = 你的職業；'opponent' = 對手職業；或指定職業 */
  cls?: CardClass | 'own' | 'opponent';
  keyword?: Keyword;
  hasDeathrattle?: boolean;
  hasBattlecry?: boolean;
  isSecret?: boolean;
  spellSchool?: string;
}

export type Condition =
  | { c: 'holding'; race?: Race; type?: CardType }
  | { c: 'control'; race?: Race; keyword?: Keyword; min?: number }
  | { c: 'combo' }
  | { c: 'outcast' }
  | { c: 'heroAttacked' }
  | { c: 'handSize'; op: '>=' | '<='; n: number }
  | { c: 'maxMana'; n: number }
  | { c: 'opponentTurn' }
  | { c: 'secret' }
  | { c: 'weapon' }
  | { c: 'damaged' }
  | { c: 'heroHealth'; op: '>=' | '<='; n: number }
  | { c: 'itRace'; race: Race }
  | { c: 'itAlive' }
  | { c: 'itDied' }
  | { c: 'itIsMinion' }
  | { c: 'playedElementalLastTurn' }
  | { c: 'noDuplicates' }
  | { c: 'deckEmpty' }
  /** 你的克蘇恩至少有 n 點攻擊力 */
  | { c: 'cthunAttack'; n: number }
  | { c: 'not'; cond: Condition };

export type Effect =
  | { e: 'damage'; target: TargetExpr; amount: Amount; spell?: boolean }
  | { e: 'splitDamage'; filter: Filter; amount: Amount; spell?: boolean }
  | { e: 'heal'; target: TargetExpr; amount: Amount }
  | { e: 'fullHeal'; target: TargetExpr }
  | {
      e: 'buff';
      target: TargetExpr;
      atk?: Amount;
      hp?: Amount;
      keywords?: Keyword[];
      /** 僅限本回合 */
      temp?: boolean;
      /** 持續到你的下個回合開始（例如「潛行直到你的下個回合」） */
      untilNextTurn?: boolean;
      /** 額外賦予的能力（例如「賦予一個手下『死聲：…』」） */
      abilities?: Ability[];
    }
  | { e: 'setStats'; target: TargetExpr; atk?: number; hp?: number }
  | { e: 'doubleStat'; target: TargetExpr; stat: 'atk' | 'hp' | 'both' }
  | { e: 'swapStats'; target: TargetExpr }
  | { e: 'draw'; count: Amount; who: 'self' | 'opponent' | 'both'; pool?: Pool }
  | { e: 'summon'; card: string; count: number; who: 'self' | 'opponent' }
  | { e: 'summonRandom'; pool: Pool; count: number; who: 'self' | 'opponent' }
  | { e: 'summonCopy'; target: TargetExpr; count: number }
  | { e: 'destroy'; target: TargetExpr }
  | { e: 'silence'; target: TargetExpr }
  | { e: 'freeze'; target: TargetExpr }
  | { e: 'armor'; amount: Amount; who?: 'self' | 'opponent' }
  | { e: 'heroAttack'; amount: number }
  | { e: 'equip'; card: string }
  | { e: 'addCard'; card: string; count: number; who: 'self' | 'opponent' }
  | { e: 'addRandom'; pool: Pool; count: number; who: 'self' | 'opponent' }
  | { e: 'addCopy'; target: TargetExpr; count: number }
  | { e: 'discover'; pool: Pool; then?: Effect[] }
  | { e: 'returnToHand'; target: TargetExpr; costChange?: number }
  | { e: 'transform'; target: TargetExpr; card: string }
  | { e: 'transformRandom'; target: TargetExpr; pool: Pool }
  | { e: 'steal'; target: TargetExpr }
  | { e: 'mana'; kind: 'empty' | 'full' | 'temp' | 'refresh' | 'destroy'; amount: number; who?: 'self' | 'opponent' }
  | { e: 'discard'; count: number }
  | { e: 'destroyWeapon'; who: 'self' | 'opponent' }
  | { e: 'weaponBuff'; atk?: number; dur?: number }
  | { e: 'shuffle'; card: string; count: number }
  | { e: 'handBuff'; atk: number; hp: number; scope: 'all' | 'random'; race?: Race }
  | { e: 'shuffleCopy'; target: TargetExpr; count: number }
  /** 變成隨機一個費用多 amount 的手下 */
  | { e: 'evolve'; target: TargetExpr; amount: number }
  /** 本場對戰中，你的（某種族）手下具有某關鍵字 */
  | { e: 'grant'; keyword: Keyword; race?: Race }
  /** 你本回合打出的下一張牌消耗減少 */
  | { e: 'nextCardDiscount'; amount: number }
  /** 賦予你的克蘇恩 +atk/+hp（無論它在哪裡） */
  | { e: 'cthunBuff'; atk: number; hp: number; taunt?: boolean }
  | { e: 'costMod'; amount: number; scope: 'discovered' | 'it' }
  | { e: 'cond'; cond: Condition; then: Effect[]; else?: Effect[] }
  | { e: 'repeat'; times: Amount; effects: Effect[] }
  | { e: 'custom'; fn: string; args?: Record<string, unknown> };

export type Trig =
  | { k: 'play' }
  | { k: 'deathrattle' }
  | { k: 'turnEnd'; whose: 'mine' | 'opp' | 'each' }
  | { k: 'turnStart'; whose: 'mine' | 'opp' | 'each' }
  | { k: 'spellCast'; side: Side }
  | { k: 'cardPlayed'; side: Side; cardType?: CardType; race?: Race; keyword?: Keyword }
  | { k: 'summon'; side: Side; race?: Race }
  | { k: 'minionDied'; side: Side; race?: Race }
  | { k: 'damaged'; subject: 'self' | 'friendlyHero' | 'friendlyMinion' | 'anyMinion' }
  | { k: 'healed'; subject: 'any' | 'friendly' | 'minion' }
  | { k: 'attack'; subject: 'self' | 'friendlyHero' | 'friendlyMinion'; after?: boolean }
  | { k: 'heroPower'; side: Side }
  | { k: 'draw'; side: Side }
  | { k: 'frenzy' }
  | { k: 'secret'; ev: SecretEvent };

export type SecretEvent =
  | 'heroAttacked'
  | 'minionAttacked'
  | 'enemyAttacks'
  | 'enemyMinionAttacks'
  | 'minionAttacksHero'
  | 'enemyPlaysMinion'
  | 'enemyCastsSpell'
  | 'friendlyMinionDies'
  | 'heroDamaged'
  | 'heroFatal'
  | 'turnStart'
  | 'enemyTurnEnd';

export interface Ability {
  on: Trig;
  effects: Effect[];
  cond?: Condition;
  /** 只觸發一次（例如法術迸發） */
  once?: boolean;
}

export interface Aura {
  /** friendlyHand：你手牌中的手下（例如「你手牌中的手下具有回音」） */
  scope: 'otherFriendly' | 'adjacent' | 'otherAll' | 'friendlyHero' | 'enemyMinions' | 'friendlyHand';
  race?: Race;
  atk?: number;
  hp?: number;
  keywords?: Keyword[];
}

/** 出牌時需要選擇的目標 */
export interface TargetReq {
  filter: Filter;
  /** true = 沒有合法目標時仍可打出（手下戰吼的標準行為） */
  optional?: boolean;
  /** 只有條件成立時才需要選目標（例如連擊） */
  when?: Condition;
}

export interface ChooseOneOption {
  id: string;
  name: string;
  text: string;
  abilities: Ability[];
  target?: TargetReq;
  /** 變形成另一個手下（例如德魯伊的二選一變身） */
  transformInto?: string;
}

/** 英雄能力（基本職業能力與英雄卡附帶的能力共用） */
export interface HeroPowerSpec {
  effects: Effect[];
  target?: TargetReq;
  /** 需要場上空位（召喚類） */
  needsBoardSpace?: boolean;
  lifesteal?: boolean;
  /** 打出一張牌後可以再次使用 */
  refresh?: 'cardPlayed';
  chooseOne?: { id: string; name?: string; text?: string; effects: Effect[]; target?: TargetReq }[];
}

export interface HeroPowerDef extends HeroPowerSpec {
  id: string;
  name: string;
  text: string;
  cost: number;
}

export interface CardDef {
  id: string;
  dbfId: number;
  name: string;
  nameEn: string;
  /** 繁體中文卡牌敘述（含 <b> 等標籤，顯示前需清理） */
  text: string;
  flavor?: string;
  type: CardType;
  cardClass: CardClass;
  classes?: CardClass[];
  rarity: Rarity;
  set: number;
  cost: number;
  attack?: number;
  /** 手下的生命值；武器的耐久度 */
  health?: number;
  races?: Race[];
  spellSchool?: string;
  collectible: boolean;
  keywords?: Keyword[];
  spellDamage?: number;
  overload?: number;
  abilities?: Ability[];
  auras?: Aura[];
  /** 受傷時攻擊力加成（激怒） */
  enrage?: { atk: number };
  target?: TargetReq;
  chooseOne?: ChooseOneOption[];
  secret?: boolean;
  /** 動態費用 */
  costRule?: { per: DynAmount | 'otherCardsInHand' | 'minionsOnBoard'; amount: number; race?: Race };
  /** 英雄卡：獲得的護甲與新的英雄能力 */
  armor?: number;
  heroPower?: HeroPowerDef;
  /** 由 overrides / custom 加入的卡 */
  custom?: boolean;
}
