// 機制說明：卡牌上的關鍵字與特殊機制，說明它做什麼、在這個遊戲裡要怎麼操作
import type { CardDef } from '../engine/types';

export interface GlossEntry {
  /** 名稱（顯示用） */
  term: string;
  /** 它做什麼 */
  desc: string;
  /** 在這個遊戲裡怎麼操作（沒有就不用寫） */
  how?: string;
  /** 卡牌敘述裡出現這些字就會顯示（預設為名稱本身） */
  words?: string[];
  /** 除了敘述文字之外，還有哪些卡牌欄位會讓它顯示 */
  has?: (def: CardDef) => boolean;
  /** 分類（說明頁用） */
  group: '基本' | '觸發' | '手牌' | '場上' | '特殊' | '任務與目標';
}

export const GLOSSARY: GlossEntry[] = [
  // ---------------------------------------------------------------- 基本關鍵字
  { group: '基本', term: '嘲諷', desc: '敵人必須先攻擊有嘲諷的手下，才能攻擊其他目標。', has: (d) => !!d.keywords?.includes('TAUNT') },
  { group: '基本', term: '衝刺', desc: '上場當回合就能攻擊手下，但不能攻擊英雄。', words: ['衝刺', '突襲'], has: (d) => !!d.keywords?.includes('RUSH') },
  { group: '基本', term: '衝鋒', desc: '上場當回合就能攻擊，包括攻擊英雄。', has: (d) => !!d.keywords?.includes('CHARGE') },
  { group: '基本', term: '風怒', desc: '每回合可以攻擊兩次。', has: (d) => !!d.keywords?.includes('WINDFURY') },
  { group: '基本', term: '超級風怒', desc: '每回合可以攻擊四次。', has: (d) => !!d.keywords?.includes('MEGA_WINDFURY') },
  { group: '基本', term: '聖盾術', desc: '抵擋下一次受到的傷害（不論傷害多大），之後失去聖盾。', has: (d) => !!d.keywords?.includes('DIVINE_SHIELD') },
  { group: '基本', term: '潛行', desc: '在它發動攻擊之前，敵人無法指定它為目標；但範圍效果仍會影響它。', has: (d) => !!d.keywords?.includes('STEALTH') },
  { group: '基本', term: '致命劇毒', desc: '對手下造成傷害時，直接消滅那個手下。', words: ['致命劇毒', '劇毒'], has: (d) => !!d.keywords?.includes('POISONOUS') },
  { group: '基本', term: '生命竊取', desc: '它造成傷害時，為你的英雄恢復等量的生命值。', has: (d) => !!d.keywords?.includes('LIFESTEAL') },
  { group: '基本', term: '重生', desc: '第一次死亡時，會以 1 點生命值復活。', words: ['重生', '復生'], has: (d) => !!d.keywords?.includes('REBORN') },
  { group: '基本', term: '飄渺', desc: '無法成為法術或英雄能力的目標（範圍效果仍會影響它）。', has: (d) => !!d.keywords?.includes('ELUSIVE') },
  { group: '基本', term: '法術傷害', desc: '法術傷害 +N：你的法術與英雄能力（有標示的）多造成 N 點傷害。', has: (d) => !!d.spellDamage },
  { group: '基本', term: '免疫', desc: '不會受到任何傷害。' },
  { group: '基本', term: '凍結', desc: '被凍結的角色會錯過下一次攻擊機會（要到它的下一個回合結束才會解凍）。', has: (d) => !!d.keywords?.includes('FREEZE_ON_DAMAGE') },
  { group: '基本', term: '沉默', desc: '移除手下身上的所有效果：敘述上的能力、關鍵字與增益。' },
  { group: '基本', term: '超載', desc: '超載：(N)——打出後，下個回合有 N 顆法力水晶被鎖住不能用。', has: (d) => !!d.overload },
  // ---------------------------------------------------------------- 觸發
  { group: '觸發', term: '戰吼', desc: '打出這張手下時觸發的效果。需要目標的戰吼，會在你把手下放到戰場後讓你選目標。', words: ['戰吼'] },
  { group: '觸發', term: '亡語', desc: '這個手下死亡時觸發的效果。', words: ['亡語', '死亡之聲'], has: (d) => !!d.abilities?.some((a) => a.on.k === 'deathrattle') },
  { group: '觸發', term: '連擊', desc: '如果你這回合已經打出過其他牌，這張牌就會有額外效果。' },
  { group: '觸發', term: '激勵', desc: '每當你使用英雄能力之後觸發。' },
  { group: '觸發', term: '盛怒', desc: '這個手下受到傷害但沒有死亡時觸發（只會觸發一次）。' },
  { group: '觸發', term: '溢療', desc: '這個手下被治療到超過生命值上限時觸發。' },
  { group: '觸發', term: '法術爆發', desc: '你施放一張法術後觸發一次，之後這個效果就消失。' },
  { group: '觸發', term: '滅殺', desc: '在你的回合，它造成的傷害超過消滅目標所需時觸發。', has: (d) => !!d.abilities?.some((a) => a.on.k === 'overkill') },
  { group: '觸發', term: '對戰開始', desc: '遊戲一開始（換完起始手牌之後）就生效；這張牌只要在你的起始牌堆或手牌中就會觸發。' },
  { group: '觸發', term: '抽中時施放', desc: '抽到這張牌時會立即施放，然後再抽一張牌。', has: (d) => !!d.castsWhenDrawn },
  { group: '觸發', term: '抽中時召喚', desc: '這張牌被抽到時，會為抽到它的玩家召喚（放進對手牌堆就會讓對手召喚）。', has: (d) => !!d.summonedWhenDrawn },
  { group: '觸發', term: '發射時', desc: '星艦發射時觸發的效果。', words: ['發射時'], has: (d) => !!d.abilities?.some((a) => a.on.k === 'launch') },
  // ---------------------------------------------------------------- 手牌
  { group: '手牌', term: '發現', desc: '從 3 張隨機卡牌中選擇 1 張，加入你的手牌。', how: '會跳出選擇視窗，點一張牌即可。' },
  { group: '手牌', term: '二選一', desc: '打出時選擇兩個效果其中一個（有些卡可以兩個都要）。', how: '打出這張牌時會跳出選項視窗。', has: (d) => !!d.chooseOne },
  { group: '手牌', term: '可更換', desc: '可以花 1 點法力把這張牌洗回牌堆，再抽一張牌。', words: ['可更換', '可交易'], how: '點選手牌，按畫面下方出現的「🔁 交易」按鈕。', has: (d) => !!d.keywords?.includes('TRADEABLE') },
  { group: '手牌', term: '預備', desc: '花光你剩餘的所有法力來預備這張牌，之後這張牌的消耗會減少（你預備時花的法力 + 1）。預備不會打出這張牌。', how: '在你的回合點選手牌，按下方出現的「🛠 預備」按鈕。', has: (d) => !!d.prepare },
  { group: '手牌', term: '回音', desc: '打出後，把一張複製加入你的手牌，本回合可以重複打出（複製會在回合結束時消失，消耗不會低於 1）。', has: (d) => !!d.keywords?.includes('ECHO') },
  { group: '手牌', term: '雙生法術', desc: '施放後，會把一張沒有雙生法術的複製放進你的手牌。', words: ['雙生法術'], has: (d) => !!d.keywords?.includes('TWINSPELL') },
  { group: '手牌', term: '流放', desc: '打出時，如果這張牌在你手牌的最左邊或最右邊，就會有額外效果。', how: '先看看它在手牌的哪個位置——可以先打出旁邊的牌，讓它變成最邊邊的一張。' },
  { group: '手牌', term: '暫時', desc: '「暫時」的牌會在回合結束時從你的手牌消失。', words: ['暫時的'], how: '抽到或獲得後，記得在同一個回合打出。' },
  { group: '手牌', term: '碎裂', desc: '這張牌被抽到時會分成兩張「半張牌」，一張在手牌最左、一張在最右。兩張可以分別打出；若讓它們在手牌中重新相鄰，就會合成一張完整的牌。', how: '碎裂的兩半各自有效果，有些半張很弱，但另一半可能很強，視情況決定要拆開用或把它們併回去。', has: (d) => !!d.shatter },
  { group: '手牌', term: '灌注', desc: '灌注(N)：這張牌在你的手牌中時，每有友方手下死亡就累積進度，累積到 N 個後會變成更強的灌注版本。卡面上的數字是還差幾個。', how: '想灌注就把它留在手牌，讓你的手下死亡。', has: (d) => !!d.infuse },
  { group: '手牌', term: '無盡灌注', desc: '灌注的進階版：不只一次，每累積 N 個友方手下死亡，效果就再強化一次（可以一直疊加）。', how: '把它留在手牌，讓你的手下死亡。' },
  { group: '手牌', term: '注能', desc: '強化你的英雄能力：每次注能，英雄能力的效果就更強（最多注能數次，依職業而定）。', how: '英雄能力按鈕上會顯示注能後的效果。' },
  { group: '手牌', term: '黑暗贈禮', desc: '帶有黑暗贈禮的卡牌會獲得一個隨機的額外效果（強化數值、關鍵字、亡語、打出時效果等）。', how: '卡牌上的數值與文字會顯示獲得的贈禮；有些贈禮只會給符合條件的手下（例如「短爪」只給攻擊力 3 以上的手下）。' },
  { group: '手牌', term: '雕刻', has: (d) => d.id === 'MEND_046t', desc: '把法術「刻」進卡牌裡：被雕刻的樹人，打出時會自動施放刻在它身上的法術。雕刻的法術是隨機挑的（巴珊娜的樹人總共刻 12 點法力的自然法術），目標也是隨機的。', how: '樹人的卡面會列出它被刻了哪些法術，可以先看過再決定要不要打出。' },
  { group: '手牌', term: '預兆', desc: '召喚一個你職業的「士兵」（紫羅蘭預兆）。預兆的次數越多，之後的預兆與士兵越強（2 次、4 次升級）。', how: '預兆的效果取決於你本場對戰已經預兆過幾次，卡面上士兵的描述會跟著變化。', has: (d) => !!d.abilities?.some((a) => JSON.stringify(a.effects).includes('"herald"')) },
  { group: '手牌', term: '倒轉', desc: '倒轉(N)：打出這張牌後，你可以選擇保留結果，或回到打出前重來——這張牌會回到手牌，倒轉次數 -1，亂數結果會不同。', how: '打出後會跳出選擇視窗：「保留」或「倒轉」。', has: (d) => !!d.rewind },
  { group: '手牌', term: '偽裝', desc: '這個手下可以打在對手的戰場上。', how: '把手下拖到對手的半場放開，就會打在對手的戰場上。', has: (d) => !!d.disguised },
  { group: '手牌', term: '幸運幣', desc: '本回合獲得 1 點法力水晶（只能用一次）。後攻的玩家起手就有一枚。' },
  { group: '手牌', term: '備用零件', desc: '1 費的小型法術，有各種小效果（例如抽牌、造成傷害、獲得護甲）。' },
  { group: '手牌', term: '幫眾', desc: '一組低費用的手下，每一種都有不同的戰吼（例如抽牌、造成傷害、偷東西）。' },
  { group: '手牌', term: '演化', desc: '從三個隨機的強化選項（例如 +1 攻擊力、聖盾術、嘲諷）中選一個，賦予你的手下。', how: '會跳出選擇視窗。' },
  // ---------------------------------------------------------------- 場上
  { group: '場上', term: '合體', desc: '這張機械手下放在你的友方機械「左邊」時，會與那個機械合體：把攻擊力、生命值與效果都併進去，而不是自己上場。', how: '把牌拖到友方機械的左側放開；放在其他位置則會當作一般手下上場。', has: (d) => !!d.magnetic },
  { group: '場上', term: '巨型', desc: '巨型+N：這個手下上場時，會同時召喚 N 個「附肢」，肢體各自有自己的效果。', how: '場地空間不夠時，剩下的肢體會等有空位再召喚。', has: (d) => !!d.colossal },
  { group: '場上', term: '休眠', desc: '休眠的手下無法被攻擊或指定為目標，也不會行動；休眠一段時間（或滿足條件）後會甦醒。' },
  { group: '場上', term: '星艦組件', desc: '上場時，不是變成手下，而是組裝進你的星艦。', how: '點擊戰場旁的星艦圖示，花 5 點法力（可能有折扣）發射；發射後星艦擁有所有組件的攻擊力、生命值與效果。', has: (d) => !!d.starshipPiece },
  { group: '場上', term: '星艦', desc: '由星艦組件組成的手下，擁有所有組件的攻擊力、生命值與效果。', how: '點擊星艦圖示發射，發射後出現在戰場上。', has: (d) => !!d.starship },
  { group: '場上', term: '翠玉魔像', desc: '召喚一個 N/N 的翠玉魔像，N 是你本場對戰召喚過的翠玉魔像數 + 1（最大 30/30）。越晚召喚越大。' },
  { group: '場上', term: '地點', desc: '放在戰場上的特殊卡牌，不是手下。', how: '點擊地點啟用它（耐久度 -1），之後要等一個回合才能再次啟用。耐久度歸零就會消失；有些地點啟用後會前進到下一個形態。', has: (d) => d.type === 'LOCATION' },
  { group: '場上', term: '屍體', desc: '死亡騎士的資源：友方手下死亡時獲得 1 個屍體；有些卡牌可以消耗屍體而不是法力，或消耗屍體來強化效果。', words: ['屍體'], has: (d) => !!d.costsCorpses },
  { group: '場上', term: '號召', desc: '從你的牌堆中召喚手下（不是抽牌，不會消耗你的手牌空間）。' },
  { group: '場上', term: '反制', desc: '取消對手剛打出的那張牌（它不會產生效果，也不會上場）。' },
  { group: '場上', term: '秘密', desc: '蓋在你這一方的場上，在對手的回合滿足條件時才會揭露並觸發。同名的秘密一次只能有一張。', words: ['秘密', '奧秘'], has: (d) => !!d.secret },
  { group: '場上', term: '加成效果', desc: '隨機獲得一種關鍵字加成（嘲諷、聖盾術、衝鋒、衝刺、風怒、潛行、致命劇毒、生命竊取、重生等）。' },
  { group: '場上', term: '同類', desc: '如果你上個回合打出過同種族（或同法術派系）的牌，這張牌會有額外效果。', words: ['同類', '同族'] },
  // ---------------------------------------------------------------- 特殊
  { group: '特殊', term: '消耗生命值', desc: '這張牌不消耗法力，改為消耗你的生命值（生命值不夠就不能打出）。', words: ['消耗生命值'], has: (d) => !!d.costsHealth || !!d.costsHealthIf },
  { group: '特殊', term: '符文', desc: '死亡騎士的卡牌需要符文（血魄、冰霜、穢邪）；一副套牌最多 3 個符文。', has: (d) => !!d.runes },
  { group: '特殊', term: '傳說組合', desc: '顯赫：對戰開始時，這張卡的其他組合卡會一起洗入你的牌堆。', words: ['顯赫'], has: (d) => !!d.fabled },
  // ---------------------------------------------------------------- 任務與目標
  { group: '任務與目標', term: '任務', desc: '打出後放在場上，完成指定目標後，獲得獎勵（通常是強力的英雄能力或卡牌）。任務會顯示在你的英雄旁邊。', words: ['任務', '獎勵'], has: (d) => !!d.quest },
  { group: '任務與目標', term: '支線任務', desc: '和任務一樣，完成指定目標後獲得獎勵，但不佔用主任務的位置——你可以同時擁有一個任務和一個支線任務。' },
  { group: '任務與目標', term: '可重複任務', desc: '完成後獲得獎勵，然後任務會重新開始，可以一再完成。' },
  { group: '任務與目標', term: '目標', desc: '打出後，在接下來的幾個回合持續生效，卡面上的「持續N回合」就是它的期限。', words: [], has: (d) => !!d.objective },
  { group: '任務與目標', term: '選三次', desc: '依序選三次，每次從所列選項中選一個（可以重複選同一個）。', words: ['選三次', '選兩次'] },
  { group: '任務與目標', term: '四選一', desc: '打出時從四個效果中選一個。', how: '打出這張牌時會跳出選項視窗。' },
];

/** 基本操作（不屬於任何卡牌機制） */
export const CONTROLS: { term: string; desc: string }[] = [
  { term: '出牌', desc: '把手牌拖到戰場上放開就會打出（手下依放開的位置排列）；也可以點一下手牌選取，再點一次或點戰場確認。法術會半透明地跟著你的手指/游標，放進戰場就是施放，拖回手牌區放開就取消。' },
  { term: '需要目標的牌', desc: '把牌拖出手牌區，會拉出瞄準箭頭，放開在合法目標上就施放；或點選手牌後直接點目標。Esc、右鍵或在手牌區放開都可以取消。' },
  { term: '攻擊', desc: '點選（或按住拖曳）你能攻擊的手下或英雄，再點敵方目標；發亮的角色代表現在可以攻擊。必須先攻擊有嘲諷的手下。' },
  { term: '查看卡牌', desc: '電腦：把游標移到卡牌上；手機：長按卡牌。會顯示放大的卡面與相關機制說明。' },
  { term: '英雄能力', desc: '點英雄旁邊的英雄能力按鈕（每回合一次）；需要目標的能力會讓你再選目標。' },
  { term: '需要按鈕的牌', desc: '「預備」與「交易」不是打出，而是點選手牌後按畫面下方出現的按鈕。地點牌要點它本人來啟用；星艦要點星艦圖示發射。' },
];

const stripTags = (t: string) => t.replace(/<[^>]*>/g, '').replace(/\[x\]/g, '').replace(/[\s_]/g, '');

/** 這張卡需要向玩家說明的機制 */
export function glossaryFor(def: CardDef, extraKeywords: Iterable<string> = []): GlossEntry[] {
  const plain = stripTags(def.text ?? '');
  const extra = new Set(extraKeywords);
  const hasKw = (d: CardDef) => (d.keywords ?? []).concat([...extra] as never);
  const probe: CardDef = extra.size ? { ...def, keywords: hasKw(def) as CardDef['keywords'] } : def;
  const out: GlossEntry[] = [];
  for (const e of GLOSSARY) {
    const words = e.words ?? [e.term];
    if (words.some((w) => plain.includes(w)) || e.has?.(probe)) out.push(e);
  }
  // 灌注與注能是兩種不同的機制：只有文字提到的才顯示，已經在上面比對過了
  return out;
}

/** 卡牌被選取（或拖曳）時，提示列要顯示的操作提示 */
export function playHint(def: CardDef): string {
  if (def.magnetic) return '合體：把牌放在友方機械的左邊，就會併進那個機械';
  if (def.disguised) return '偽裝：可以打在對手的戰場上';
  if (def.rewind) return '倒轉：打出後可以選擇保留結果或回到打出前重來';
  if (def.type === 'LOCATION') return '地點：打出後點擊它來啟用';
  if (def.starshipPiece) return '星艦組件：上場後點擊星艦圖示，花法力發射';
  if (/流放/.test(def.text)) return '流放：這張牌在手牌最左或最右時，打出才有額外效果';
  if (def.prepare) return '預備：不打出，點下方的「預備」按鈕，花光法力讓它之後變便宜';
  return '';
}
