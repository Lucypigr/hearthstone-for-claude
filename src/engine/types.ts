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

export type CardType = 'MINION' | 'SPELL' | 'WEAPON' | 'HERO' | 'LOCATION';

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
  /** 雙生法術：施放後把一張沒有雙生法術的複製加入手牌 */
  | 'TWINSPELL'
  /** 回音：本回合可以重複使用 */
  | 'ECHO'
  /** 休眠：無法攻擊、無法被攻擊或指定為目標，也不會受到傷害 */
  | 'DORMANT';

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
  /** 星艦或星艦組件 */
  starship?: boolean;
  terran?: boolean;
  /** 排除某種族（例如「對惡魔以外的所有手下」） */
  notRace?: Race;
  /** 傳說手下 */
  legendary?: boolean;
  /** 具有亡語的手下 */
  hasDeathrattle?: boolean;
  /** 英文名稱包含這段文字（例如「Lackey」、「Silver Hand Recruit」） */
  nameIncludes?: string;
  /** 屬於某個職業 / 不屬於某個職業的手下 */
  cardClass?: CardClass;
  notClass?: CardClass;
  /** 生命值不高於效果來源（手下）的生命值 */
  hpAtMostSource?: boolean;
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
  | 'summonedRace'
  /** 本場對戰中發射過的星艦數量 */
  | 'starshipsLaunched'
  /** 死亡騎士目前的屍體數 / 本場對戰中花費的屍體數 */
  | 'corpses'
  | 'corpsesSpent'
  /** 本場對戰中死亡的手下總數（雙方） */
  | 'deathsThisGame'
  /** 目前被冰凍的角色數 */
  | 'frozenChars'
  /** 本場對戰中洗進對手牌堆的瘟疫數 */
  | 'plaguesShuffled'
  /** 你目前的法術傷害 */
  | 'spellDamage'
  /** 本場對戰中你打出的奧秘數 */
  | 'secretsPlayed'
  /** 本回合死亡的友方手下數 */
  | 'friendlyDiedThisTurn'
  /** 這張牌在手牌中累積的計數（例如尼斯蘭德瑪斯） */
  | 'handCounter'
  | 'weaponDurability'
  /** 本場對戰中你棄掉的牌數 */
  | 'discardedThisGame'
  | 'enemyDeathrattleMinions'
  /** 本場對戰中你超載的法力水晶數 */
  | 'overloadedThisGame'
  /** 你控制的白銀之手新兵數 */
  | 'recruits'
  /** 觸發事件的卡的消耗 */
  | 'itCost'
  /** 本場對戰中你施放的消耗 5 以上的法術數 */
  | 'bigSpellsThisGame'
  /** 你的英雄 / 對手的英雄本回合受到的傷害 */
  | 'heroDamageThisTurn'
  | 'enemyHeroDamageThisTurn'
  /** 本場對戰中你花在法術上的法力 */
  | 'spellManaSpent'
  | 'rafaamsPlayed'
  | 'enemyHeroHitsThisTurn'
  | 'turnsTaken'
  | 'selfHealth'
  /** 本場對戰中死亡的友方樹人數 */
  | 'treantsDied'
  /** 本場對戰中加入你手牌的其他職業卡數 */
  | 'otherClassAdded'
  /** 你上個回合打出的元素數 */
  | 'elementalsLastTurn'
  /** 觸發事件的卡的超載 */
  | 'itOverload'
  /** 你手牌中的幸運幣數量 */
  | 'coinsInHand'
  /** 你的牌堆張數 */
  | 'deckSize'
  /** 本場對戰中你打出的消耗為 (2) 法力的卡數 */
  | 'twoManaPlayed'
  /** 本場對戰中你的英雄攻擊的次數 */
  | 'heroAttacksThisGame'
  /** 你目前剩餘的法力 */
  | 'remainingMana'
  /** 預兆的力量倍率：預兆 0~1 次 = 1，2~3 次 = 2，4 次以上 = 4 */
  | 'heraldPower'
  /** 你本場對戰中預兆的次數 */
  | 'heralds'
  /** 你本回合用法術造成的傷害 */
  | 'spellDamageDealtThisTurn'
  /** 你本場對戰中施放的邪能法術數 */
  | 'felSpellsCast'
  /** 你本場對戰中英雄 / 友方角色攻擊的次數 */
  | 'attacksThisGame'
  /** 場上（雙方）的手下數 */
  | 'minionsOnBoardTotal'
  /** 你上一張打出的卡的消耗 */
  | 'lastCardCost';

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
  starshipPiece?: boolean;
  /** 需要某種死亡騎士符文 */
  rune?: 'blood' | 'frost' | 'unholy';
  /** 來自另一個職業（不是你的職業，也不是中立） */
  otherClass?: boolean;
  terran?: boolean;
  isSecret?: boolean;
  spellSchool?: string;
  /** 會花費屍體的卡 */
  spendsCorpses?: boolean;
  /** 屬於其中任一職業（例如「發現一張獵人、聖騎士或戰士卡」） */
  classes?: CardClass[];
  /** 有超載的卡 */
  overload?: boolean;
  /** 英文名稱包含這段文字（例如「藥水」） */
  nameEn?: string;
  set?: number;
  /** 不限職業（預設隨機產生的卡只會來自你的職業與中立） */
  anyClass?: boolean;
  /** 生命值為這個值的手下 */
  health?: number;
  /** 有連擊的卡 */
  combo?: boolean;
  /** 有二選一的卡 */
  chooseOne?: boolean;
  minCost?: number;
  /** 攻擊力為 attack / 至少為 minAttack 的手下 */
  attack?: number;
  minAttack?: number;
  /** 「來自過去」：不屬於目前標準模式的系列 */
  past?: boolean;
  /** 有倒轉的卡 */
  rewind?: boolean;
}

export type Condition =
  | { c: 'holding'; race?: Race; type?: CardType; minCost?: number; minAtk?: number }
  /** 你（side = enemy 時為對手）控制符合條件的其他手下 */
  | { c: 'control'; race?: Race; keyword?: Keyword; min?: number; side?: 'enemy'; minAtk?: number; minHp?: number; nameIncludes?: string; damaged?: boolean; hp?: number; frozen?: boolean }
  | { c: 'combo' }
  | { c: 'outcast' }
  | { c: 'heroAttacked' }
  | { c: 'handSize'; op: '>=' | '<='; n: number; side?: 'enemy' }
  | { c: 'maxMana'; n: number }
  | { c: 'opponentTurn' }
  | { c: 'secret' }
  | { c: 'weapon' }
  | { c: 'damaged' }
  | { c: 'heroHealth'; op: '>=' | '<='; n: number; side?: 'enemy' }
  | { c: 'itRace'; race: Race }
  | { c: 'itAlive' }
  | { c: 'itDied' }
  | { c: 'itIsMinion' }
  | { c: 'playedElementalLastTurn' }
  | { c: 'noDuplicates' }
  | { c: 'deckEmpty' }
  /** 你的克蘇恩至少有 n 點攻擊力 */
  | { c: 'cthunAttack'; n: number }
  /** 你正在建造星艦（已組裝組件、尚未發射） */
  | { c: 'buildingStarship' }
  | { c: 'launchedStarship' }
  /** 場上有被冰凍的角色 */
  | { c: 'anyFrozen' }
  /** 本回合有友方手下死亡 */
  | { c: 'friendlyDiedThisTurn' }
  /** 你上個回合結束後有友方不死族死亡 */
  | { c: 'undeadDiedSinceLastTurn' }
  /** 你的英雄本回合生命值有變化 / 被治療過 */
  | { c: 'heroHealthChanged' }
  | { c: 'heroHealed' }
  /** 「它」有亡語 */
  | { c: 'itHasDeathrattle' }
  /** 「它」（或觸發事件的卡）有戰吼 */
  | { c: 'itHasBattlecry' }
  /** 你有法術傷害 */
  | { c: 'spellDamage' }
  /** 有敵人被冰凍 */
  | { c: 'enemyFrozen' }
  /** 所選的目標是某種族 */
  | { c: 'chosenRace'; race: Race }
  /** 效果來源（手下）至少有 n 點攻擊力 */
  | { c: 'selfAttack'; n: number }
  /** 你的武器至少有 n 點攻擊力 */
  | { c: 'weaponAttack'; n: number }
  /** 本場對戰中有某張友方手下（英文名）死亡 */
  | { c: 'died'; name: string }
  /** 你還有沒用完的法力 */
  | { c: 'unspentMana' }
  /** 觸發事件的卡：是奧秘 / 來自其他職業 / 消耗為 n / 攻擊力為 n / 是某張卡 / 有連擊 */
  | { c: 'itSecret' }
  | { c: 'itOtherClass' }
  | { c: 'itCost'; n: number }
  | { c: 'itAttack'; n: number }
  | { c: 'itCard'; id: string }
  | { c: 'itHasCombo' }
  /** 所選的目標：被凍結 / 受傷 / 是友方 */
  | { c: 'chosenFrozen' }
  | { c: 'chosenDamaged' }
  | { c: 'chosenFriendly' }
  /** 你的英雄本回合受到過傷害 */
  | { c: 'heroDamaged' }
  /** 本回合有手下死亡 */
  | { c: 'anyDiedThisTurn' }
  /** 你的牌堆沒有消耗為 n 的卡 */
  | { c: 'deckNoCost'; n: number }
  /** 你的牌堆只有奇數（odd）/ 偶數消耗的卡 */
  | { c: 'deckParity'; odd: boolean }
  | { c: 'deckNoMinions' }
  /** 同族：你上個回合打出過與這張牌同種族 / 法術派系的牌 */
  | { c: 'kindred' }
  /** 你的英雄這個回合受到過傷害 */
  | { c: 'heroDamagedThisTurn' }
  /** 你有進行中的目標（Aura） */
  | { c: 'controlObjective' }
  /** 你的英雄剛剛擊殺了一個手下 */
  | { c: 'heroKilled' }
  /** 場上有休眠中的手下 */
  | { c: 'anyDormant' }
  /** 這張牌打出時正好在手牌的正中央 */
  | { c: 'handCenter' }
  /** 觸發事件的手下是在上個回合被打出的（不合時宜的死亡） */
  | { c: 'itPlayedLastTurn' }
  /** 你控制某個（英文名稱符合的）地點 */
  | { c: 'controlLocation'; nameEn: string }
  /** 你裝備的武器（英文名稱符合） */
  | { c: 'weaponNamed'; nameEn: string }
  /** 戰場上（雙方）剛好有 n 個手下 */
  | { c: 'boardCount'; n: number }
  /** 你至少有 n 點護甲值 */
  | { c: 'armor'; n: number }
  /** 你本回合施放過消耗 5 以上的法術 */
  | { c: 'bigSpellThisTurn' }
  /** 你本回合剛好施放了 n 張法術 */
  | { c: 'spellsThisTurn'; n: number; atLeast?: boolean }
  /** 你被超載了 */
  | { c: 'overloaded' }
  /** 你有進行中的任務 */
  | { c: 'questActive' }
  /** 本場對戰中你打出過任務 */
  | { c: 'questPlayed' }
  /** 打出的卡是手牌最右邊的一張 */
  | { c: 'rightmost' }
  /** 事件的數值（例如治療量）至少為 n */
  | { c: 'eventAmount'; n: number }
  /** 本場對戰中你恢復了至少 n 點生命值 */
  | { c: 'healedThisGame'; n: number }
  /** 本場對戰中你的英雄能力造成了至少 n 點傷害 */
  | { c: 'heroPowerDamage'; n: number }
  /** 觸發事件的卡的英文名稱包含這段文字 */
  | { c: 'itNameIncludes'; s: string }
  /** 你的牌堆、手牌與戰場上都沒有卡（機神克蘇恩） */
  | { c: 'emptyEverything' }
  /** 你的牌堆張數 */
  | { c: 'deckSize'; op: '>=' | '<='; n: number }
  /** 你的牌堆沒有中立卡牌 */
  | { c: 'deckNoNeutral' }
  /** 「它」具有某關鍵字（例如潛行） */
  | { c: 'itKeyword'; k: Keyword }
  /** 所選的目標具有某關鍵字 */
  | { c: 'chosenKeyword'; k: Keyword }
  /** 打出的卡在手牌中累積的計數至少為 n */
  | { c: 'handCounter'; n: number }
  /** 「它」（手牌中的卡）的消耗不超過 n */
  | { c: 'itCostAtMost'; n: number }
  /** 觸發事件的卡是從對手那裡複製來的 */
  | { c: 'itFromOpp' }
  /** 「它」是某張卡（以卡牌 ID 判斷，手下或手牌） */
  | { c: 'itIsCardId'; id: string }
  /** 本場對戰中，墓地裡有至少 n 張某張卡（英文名） */
  | { c: 'graveyardCount'; name: string; n: number }
  /** 你的牌堆在開始時沒有法術 */
  | { c: 'startedNoSpells' }
  /** 這張牌在手中時，你花費了至少 n 點法力 */
  | { c: 'heldSpent'; n: number }
  /** 你上個回合沒有打出手下 */
  | { c: 'noMinionLastTurn' }
  /** 你本回合用法術造成過傷害 */
  | { c: 'spellDamagedThisTurn' }
  /** 你控制傳說卡牌（手下或奧秘） */
  | { c: 'controlLegendary' }
  /** 你手牌中有龍 */
  | { c: 'holdingDragon' }
  /** 你的手牌（除了這張）全是奇數 / 偶數消耗 */
  | { c: 'handParity'; odd: boolean }
  /** 你的手下全場已滿 */
  | { c: 'boardFull' }
  /** 你沒有其他手下 */
  | { c: 'noOtherMinions' }
  /** 「它」就是效果來源本身 */
  | { c: 'itIsSelf' }
  /** 你本場對戰中已經打出過另一張同名的卡 */
  | { c: 'playedCopy' }
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
  | { e: 'shuffle'; card: string; count: number; who?: 'self' | 'opponent' }
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
  /** 你的下一次星艦發射消耗減少 */
  | { e: 'launchDiscount'; amount: number }
  /** 發射你正在建造的星艦（不消耗法力） */
  | { e: 'launchStarship' }
  /** 在 turns 個你的回合後（回合開始時）執行 */
  | { e: 'delayed'; turns: number; effects: Effect[] }
  /** 消耗 amount 具屍體來執行 then（屍體不足則執行 else） */
  | { e: 'spendCorpses'; amount: number; then: Effect[]; else?: Effect[] }
  | { e: 'gainCorpses'; amount: number }
  /** 消耗最多 max 具屍體：每具執行一次 each，或把數量交給自訂效果 custom（args.n） */
  | { e: 'spendCorpsesUpTo'; max: number; each?: Effect[]; custom?: string }
  /** 喚起最多 max 具屍體成為手下（每具屍體一個） */
  | { e: 'raiseCorpses'; max: number; card: string }
  /** 比武：雙方各揭露牌堆中一張手下，你的消耗較高則執行 then */
  | { e: 'joust'; then: Effect[]; else?: Effect[] }
  /** 召喚一個翠玉魔像（每召喚一個，下一個就 +1/+1） */
  | { e: 'summonJade' }
  /** 號召：從你的牌堆召喚符合條件的手下 */
  | { e: 'recruit'; count: number; race?: Race; cost?: number; maxCost?: number }
  | { e: 'costMod'; amount: number; scope: 'discovered' | 'it' }
  /** 對手的手下在他的下個回合消耗增加 */
  | { e: 'minionTax'; amount: number }
  /** 你本回合的下一張法術消耗減少 */
  | { e: 'nextSpellDiscount'; amount: number }
  /** 本場對戰剩下的時間都有效的能力（掛在玩家身上，不會被沉默） */
  | { e: 'eternal'; ability: Ability }
  /** 英雄獲得生命值上限（並回復等量生命） */
  | { e: 'heroMaxHealth'; amount: number }
  /** 英雄能力可以再使用一次 */
  | { e: 'refreshHeroPower' }
  /** 本場對戰中你的手下 +atk 攻擊力 */
  | { e: 'minionAtkBonus'; amount: number }
  /** 你打出的下一張牌改為消耗屍體 */
  | { e: 'nextCardCostsCorpses' }
  /** 你下一張符合條件的牌消耗改變（例如「你的下一張龍消耗減少 (2)」） */
  | { e: 'pendingDiscount'; d: PendingDiscount }
  /** 對手的法術在他的下個回合消耗增加 */
  | { e: 'spellTax'; amount: number }
  /** 對手的英雄能力在他的下個回合消耗增加 */
  | { e: 'heroPowerTax'; amount: number }
  /** 你下一次使用英雄能力消耗減少 */
  | { e: 'heroPowerDiscount'; amount: number }
  /** 換成另一個英雄能力（id 見 src/engine/heroes.ts 的 POWERS） */
  | { e: 'replaceHeroPower'; power: string }
  /** 在這個回合結束時執行 */
  | { e: 'atEndOfTurn'; effects: Effect[] }
  | { e: 'cond'; cond: Condition; then: Effect[]; else?: Effect[] }
  | { e: 'repeat'; times: Amount; effects: Effect[] }
  | { e: 'custom'; fn: string; args?: Record<string, unknown> };

export type Trig =
  | { k: 'play' }
  | { k: 'deathrattle' }
  | { k: 'turnEnd'; whose: 'mine' | 'opp' | 'each' }
  | { k: 'turnStart'; whose: 'mine' | 'opp' | 'each' }
  | { k: 'spellCast'; side: Side; school?: string }
  | { k: 'cardPlayed'; side: Side; cardType?: CardType; race?: Race; keyword?: Keyword }
  | { k: 'summon'; side: Side; race?: Race }
  | { k: 'minionDied'; side: Side; race?: Race }
  | { k: 'damaged'; subject: 'self' | 'friendlyHero' | 'friendlyMinion' | 'anyMinion' | 'enemyMinion' }
  | { k: 'healed'; subject: 'any' | 'friendly' | 'minion' }
  | { k: 'attack'; subject: 'self' | 'friendlyHero' | 'friendlyMinion'; after?: boolean }
  | { k: 'heroPower'; side: Side }
  | { k: 'draw'; side: Side }
  | { k: 'frenzy' }
  /** 星艦發射時（星艦組件的能力） */
  | { k: 'launch' }
  /** 滅殺：在你的回合，造成的傷害超過消滅一個手下所需 */
  | { k: 'overkill' }
  /** 你棄掉一張牌時 */
  | { k: 'discard'; side: Side }
  /** 這張牌被棄掉時（手牌中的能力，不是場上觸發） */
  | { k: 'discarded' }
  /** 這張牌被抽到時（手牌中的能力） */
  | { k: 'drawn' }
  /** 你以法術指定此手下為目標時 */
  | { k: 'spellTarget' }
  /** 溢療：此手下被治療超過生命值上限時 */
  | { k: 'overheal' }
  /** 此手下造成傷害時 */
  | { k: 'dealtDamage' }
  /** 你裝備武器時 */
  | { k: 'equip'; side: Side }
  /** 此手下被攻擊後 */
  | { k: 'attacked' }
  /** 友方手下失去聖盾後 */
  | { k: 'shieldLost'; side: Side }
  /** 你的武器被摧毀時 */
  | { k: 'weaponDestroyed'; side: Side }
  /** 你獲得護甲值時 */
  | { k: 'armorGained' }
  /** 你預備一張卡時（手牌中的能力；amount = 折扣） */
  | { k: 'prepare' }
  /** 這個手下被召喚時（包含打出） */
  | { k: 'summoned' }
  /** 你碎裂了一張牌 */
  | { k: 'shatter' }
  /** 你花光最後一顆法力水晶時 */
  | { k: 'lastMana' }
  /** 你每回合第一次用法術造成傷害時 */
  | { k: 'firstSpellDamage' }
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
  | 'enemyTurnEnd'
  /** 對手施放一個法術之後 */
  | 'afterEnemySpell'
  /** 對手在一個回合中打出第三張牌之後 */
  | 'enemyThirdCard'
  /** 一個手下攻擊你的英雄之後 */
  | 'afterMinionAttacksHero'
  /** 對手使用英雄能力之後 */
  | 'enemyHeroPower';

export interface Ability {
  on: Trig;
  effects: Effect[];
  cond?: Condition;
  /** 只觸發一次（例如法術迸發） */
  once?: boolean;
}

export interface Aura {
  /**
   * friendlyHand：你手牌中的手下（例如「你手牌中的手下具有回音」）
   * firstSpellDiscount：你每回合的第一張法術消耗減少 cost
   */
  scope: 'otherFriendly' | 'adjacent' | 'otherAll' | 'friendlyHero' | 'enemyMinions' | 'friendlyHand' | 'firstSpellDiscount' | 'self';
  /** 隨某個數量變化的加成：atk / hp 乘以這個數量（例如「每棄掉一張牌 +2/+2」） */
  dyn?: { amount: DynAmount; atk?: number; hp?: number };
  cost?: number;
  race?: Race;
  /** 只影響這個英文名稱的手下（例如白銀之手新兵） */
  nameEn?: string;
  /** 只影響具有這個關鍵字的手下 */
  keyword?: Keyword;
  /** 條件成立時才有效（以光環來源的擁有者判斷） */
  cond?: Condition;
  atk?: number;
  hp?: number;
  keywords?: Keyword[];
  /** 預兆：攻擊力 = heraldAtk × 預兆倍率（1 / 2 / 4） */
  heraldAtk?: number;
}

/** 場上手下對手牌消耗的影響（例如「你的手下消耗為 (1)」、「有戰吼的手下消耗增加 (2)」） */
export interface CostAura {
  side: 'friendly' | 'enemy' | 'both';
  type?: CardType;
  secret?: boolean;
  hasBattlecry?: boolean;
  hasDeathrattle?: boolean;
  race?: Race;
  /** 只影響每位玩家在自己回合打出的第一張牌 */
  firstCard?: boolean;
  /** 減少後的消耗不低於這個值（例如「但不會低於 1」） */
  floor?: number;
  /** 消耗設為固定值 */
  set?: number;
  /** 消耗增加（負數為減少） */
  add?: number;
}

/** 任務：達成目標後，英雄能力換成獎勵（或獲得被動效果） */
export interface QuestDef {
  kind:
    | 'unspentTurn'
    | 'draw'
    | 'summon'
    | 'battlecry'
    | 'otherClassCard'
    | 'reborn'
    | 'spell'
    | 'heroAttack'
    | 'heal'
    | 'spellNotStarting'
    | 'sameName'
    | 'bigMinionSummon'
    | 'discard'
    | 'oneCostMinion'
    | 'tauntMinion'
    | 'deathrattleSummon'
    | 'murlocSummon'
    | 'spellOnMinion'
    /** 填滿手牌，然後清空手牌（穿越時間流） */
    | 'fillHand';
  goal: number;
  /** 英雄能力（src/engine/heroes.ts 的 EXTRA_POWERS）或加入手牌的卡 */
  reward: string;
}

/** 你下一張符合條件的牌的消耗變化 */
export interface PendingDiscount {
  amount?: number;
  /** 消耗設為固定值 */
  set?: number;
  race?: Race;
  type?: CardType;
  secret?: boolean;
  /** 改為消耗生命值 */
  health?: boolean;
  /** 只在本回合有效 */
  thisTurn?: boolean;
  /** 只適用於消耗不超過這個值的牌 */
  maxCost?: number;
  /** 只適用於英文名稱包含這段文字的牌 */
  nameEn?: string;
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
  /** 被動：無法主動使用 */
  passive?: boolean;
  /** 倒轉：使用後可以選擇保留，或回到使用前重來（每回合一次） */
  rewind?: boolean;
}

export interface HeroPowerDef extends HeroPowerSpec {
  id: string;
  name: string;
  text: string;
  cost: number;
}

/** 死亡騎士符文：一副套牌中三種符文各取最高需求，加總最多 3 個 */
export interface Runes {
  blood?: number;
  frost?: number;
  unholy?: number;
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
  /** 條件成立時的消耗（例如「若你正在建造星艦，消耗為 (1)」） */
  costIf?: { cond: Condition; cost: number };
  /** 動態費用 */
  costRule?: { per: DynAmount | 'otherCardsInHand' | 'minionsOnBoard'; amount: number; race?: Race };
  /** 英雄卡：獲得的護甲與新的英雄能力 */
  armor?: number;
  heroPower?: HeroPowerDef;
  /** 由 overrides / custom 加入的卡 */
  custom?: boolean;
  /** 星艦組件：打出或召喚時組裝進你的星艦 */
  starshipPiece?: boolean;
  /** 星艦本體（發射後的手下） */
  starship?: boolean;
  /** 星海爭霸：人類（Terran） */
  terran?: boolean;
  /** 發射過星艦後，手牌與牌堆中的這張卡會變形成另一張卡 */
  launchTransform?: string;
  /** 雙生法術：施放後加入手牌的複製（沒有雙生法術） */
  twinspellCopy?: string;
  /** 死亡騎士的符文需求（血魄 / 冰霜 / 穢邪） */
  runes?: Runes;
  /** 死亡時不會留下屍體（屍體喚起的手下） */
  noCorpse?: boolean;
  /** 消耗生命值而不是法力 */
  costsHealth?: boolean;
  /** 條件成立時消耗生命值而不是法力 */
  costsHealthIf?: Condition;
  /** 消耗屍體而不是法力 */
  costsCorpses?: boolean;
  /** 抽到時施放（施放後再抽一張牌） */
  castsWhenDrawn?: boolean;
  /** 場上時的特殊規則 */
  flags?: MinionFlag[];
  /** 場上時影響手牌消耗的光環 */
  costAuras?: CostAura[];
  /** 條件成立時額外的攻擊力（手下或武器，例如「在你裝備武器時 +2 攻擊力」） */
  atkIf?: { cond: Condition; atk: number };
  /** 在手牌中時才會觸發的能力（例如肥油大亨） */
  handAbilities?: Ability[];
  /** 在你打出某種族的牌後，從你的牌堆召喚這張卡（海盜派奇） */
  summonFromDeckAfter?: Race;
  /** 開局效果（自訂效果名稱） */
  startOfGame?: string;
  /** 流放：在手牌最左或最右時的消耗 */
  outcastCost?: number;
  /** 額外的攻擊力（例如「每有一個其他野獸 +1 攻擊力」、「攻擊力等同你的護甲值」） */
  atkPer?: Amount;
  /** 條件成立時具有的關鍵字（以此手下為效果來源判斷） */
  kwIf?: { cond: Condition; keywords: Keyword[] };
  /** 只有條件成立時才能攻擊 */
  attackIf?: Condition;
  /** 在手牌中時，每個你的回合開始時變形：swap = 換成 into；opponentCard = 對手手牌中的一張；randomSpell = 隨機一張 cls 法術 */
  handShift?: { kind: 'swap' | 'opponentCard' | 'randomSpell' | 'randomWeapon'; into?: string; cls?: CardClass };
  /** 磁力：打出在友方機械左邊時，吸附到那個機械上 */
  magnetic?: boolean;
  /** 在手牌中時，相鄰的牌消耗增加（破壞！） */
  adjacentCostUp?: number;
  /** 每個回合在手牌中時累積計數（升級） */
  handGrow?: boolean;
  /** 巨型：打出時在兩側召喚附肢（limbs = 附肢卡牌 ID；leftFirst = 第一個附肢在左邊） */
  colossal?: { limbs: string[]; leftFirst?: boolean };
  /** 碎裂：抽到時分成兩張牌，分別在手牌的最左與最右；重新相鄰時合併 */
  shatter?: [string, string];
  /** 預備：可以把這張卡拖進牌堆，花光剩餘法力，之後抽到時折扣（花費 + 1） */
  prepare?: boolean;
  /** 偽裝：可以在任一方的戰場打出 */
  disguised?: boolean;
  /** 抽到時召喚（為放進牌堆的玩家） */
  summonedWhenDrawn?: boolean;
  /** 在手牌中時，你每施放 n 張法術就變成另一張卡 */
  transformAfterSpells?: { n: number; into: string };
  /** 重生時保留全部生命值與附魔 */
  rebornFull?: boolean;
  /** 獲得體質後，額外獲得這些（無論在手牌、牌堆或場上） */
  extraOnBuff?: { atk: number; hp: number };
  /** 任務 */
  quest?: QuestDef;
  /** 倒轉：打出後可以選擇保留結果，或倒轉重來（數字 = 可倒轉的次數） */
  rewind?: number;
  /** 傳說：開局時，這張卡的組合卡會一起洗入牌堆 */
  fabled?: string[];
  /** 目標（Aura）：打出後持續這麼多個你的回合 */
  objective?: number;
  /** 地點牌：啟用後（耐久度 -1）變成這張卡（「前進到現在 / 未來」） */
  advanceTo?: string;
}

/**
 * noTurnDraw：你的回合開始時不再抽牌
 * enemyNoHeal：敵方角色無法被治療
 * doubleCorpses：你獲得的屍體加倍
 * heroPowerDamage：你的英雄能力額外造成 1 點傷害
 * heroPowerTwice / heroPowerUnlimited：英雄能力每回合可以使用兩次 / 任意次數
 * heroPowerCost1：你的英雄能力消耗為 (1)
 * heroPowerDrawsFree：你以英雄能力抽到的牌消耗為 (0)
 * heroPowerBuffsWeapon（武器）：英雄能力改為賦予這把武器 +1 攻擊力，而不是換掉它
 * doubleDeathrattle：你的手下的亡語觸發兩次
 * randomTargets：所有目標都隨機選擇
 * misdirect：50% 機率攻擊錯誤的敵人
 * bodyguard：你的英雄受到的傷害改由此手下承受
 * heroImmuneOnTurn：在你的回合，你的英雄免疫
 * unlimitedAttacks（武器）：每回合可以攻擊任意次數
 * heroImmune：你的英雄免疫
 * heroPowerFreeze：你的英雄能力也會凍結目標
 * weaponNoWear：在你的回合，你的武器不會失去耐久度
 * copyFrozen：每當另一個手下被凍結，把它的複製加入你的手牌
 * noHeroPowers：雙方都無法使用英雄能力
 * heroPowerDouble：你的英雄能力的傷害與治療加倍
 * allMisdirect：所有手下有 50% 機率攻擊錯誤的敵人
 * heroPowerTargetMinions：你的（獵人）英雄能力可以指定手下為目標
 * noAttackDamaged：受傷時無法攻擊
 * doubleEndTurn：你的回合結束效果觸發兩次
 * heroElusive：你的英雄無法成為法術或英雄能力的目標
 * elusiveOnOppTurn：在對手的回合具有法術免疫
 * immuneAttacking（武器）：你的英雄在攻擊時免疫
 * doubleBattlecries：你的戰吼觸發兩次
 * doubleHealing：你的治療加倍
 * spellDamage2Damaged：受傷時具有法術傷害 +2
 * bothSpellDamage2：雙方都有法術傷害 +2
 * heroPowerKillDraw：你的英雄能力消滅手下時抽一張牌
 * heroPowerAdjacent：你的英雄能力也會指定相鄰手下
 * heroPowerDamage2：你的英雄能力額外造成 2 點傷害
 * rushImmune：你的突襲手下在被召喚的回合免疫
 * adjacentBodyguard：相鄰手下受到的傷害改由此手下承受
 * doubleHeroDamage（武器）：你的英雄受到的傷害加倍
 * heroDamageCap1：你的英雄每次最多受到 1 點傷害
 * redirectAttackers：攻擊此手下的敵人有 50% 機率攻擊其他目標
 * shuffleExtra：每當你把卡洗入牌堆，多洗一張複製
 * pirateBonus：在你的回合，友方海盜造成的傷害提高 1 點
 * extraShot：你的砲手額外發射一次
 * livingPlague：此手下不會對英雄造成傷害，而是把等量的疫病洗入其牌堆
 * extraDamage：此手下受到的傷害多 1 點
 * heroWindfury：你的英雄具有風怒
 * minionImmuneAlone：沒有其他手下時免疫
 * enemyTaunt：所有敵方手下具有嘲諷
 * endTurnTriggerDeathrattle：回合結束時觸發你手下的亡語
 */
export type MinionFlag =
  | 'noTurnDraw'
  | 'enemyNoHeal'
  | 'doubleCorpses'
  | 'heroPowerDamage'
  | 'heroPowerTwice'
  | 'heroPowerUnlimited'
  | 'heroPowerCost1'
  | 'heroPowerDrawsFree'
  | 'heroPowerBuffsWeapon'
  | 'doubleDeathrattle'
  | 'randomTargets'
  | 'misdirect'
  | 'bodyguard'
  | 'heroImmuneOnTurn'
  | 'unlimitedAttacks'
  | 'heroImmune'
  | 'heroPowerFreeze'
  | 'weaponNoWear'
  | 'copyFrozen'
  | 'noHeroPowers'
  | 'heroPowerDouble'
  | 'allMisdirect'
  | 'heroPowerTargetMinions'
  | 'noAttackDamaged'
  | 'doubleEndTurn'
  | 'heroElusive'
  | 'elusiveOnOppTurn'
  | 'immuneAttacking'
  | 'doubleBattlecries'
  | 'keepBothRewinds'
  | 'takesDoubleDamage'
  | 'natureFeeds'
  | 'natureSummons'
  | 'heroPowerFreeSmallHand'
  | 'sindragosaArcane'
  | 'malygosArcane'
  | 'doubleSpellPower'
  | 'heroPowerEffectTwice'
  | 'doubleHealing'
  | 'spellDamage2Damaged'
  | 'bothSpellDamage2'
  | 'heroPowerKillDraw'
  | 'heroPowerAdjacent'
  | 'heroPowerDamage2'
  | 'rushImmune'
  | 'adjacentBodyguard'
  | 'doubleHeroDamage'
  | 'heroDamageCap1'
  | 'redirectAttackers'
  | 'shuffleExtra'
  | 'pirateBonus'
  | 'extraShot'
  | 'livingPlague'
  | 'extraDamage'
  | 'heroWindfury'
  | 'minionImmuneAlone'
  | 'enemyTaunt'
  | 'endTurnTriggerDeathrattle'
  | 'doubleOtherSpells'
  | 'healthToMax'
  | 'ashWorm'
  | 'chogallDeck';
