// 機制說明：卡牌上粗體的關鍵字，都要有對應的說明
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../cards/registry';
import { GLOSSARY, glossaryFor, playHint } from './glossary';

// 卡牌名稱、稀有度或單純強調用的粗體字，不是機制
const NOT_MECHANICS = new Set([
  '你', '傳說', '每個', '攻擊', '英雄能力', '召喚', '元素', '魔影', '沒用的小鬼', '安戈洛', '至尊莫咕咕', '至尊吉克索', '副刃斬', '第二道火焰', '第一封印', '爆燃火炬', '遠古詛咒',
  '心靈之火', '鏡像', '更多手臂', '衝鋒鋒鋒鋒～', '泰坦', '巫妖王', '翠玉塑像', '更換', '隱密死聲', '飄渺死亡之聲', '備用零件', '火焰法術傷害', '遠古',
  '個圖騰', '個野獸', '個惡魔', '黑暗贈禮', '星艦組件', '幫眾', '戰吼發現', '注能', '雙生法術', '加成效果', '翠玉魔像',
]);

const terms = GLOSSARY.flatMap((g) => [g.term, ...(g.words ?? [])]).concat(['死亡之聲', '劇毒', '突襲', '奧秘', '復生', '灌注', '可交易', '同族', '獎勵', '法術傷害', '火焰', '更換', '選兩次', '預備']);
terms.sort((a, b) => b.length - a.length);

function leftover(chunk: string): string {
  let s = chunk.replace(/[：:、，,。及和與\s()（）\d+@{}\/~！!]/g, '');
  for (const t of terms) s = s.split(t).join('');
  return s;
}

describe('機制說明', () => {
  it('卡牌上粗體的機制名稱都有說明', () => {
    const missing = new Map<string, string>();
    for (const c of ALL_CARDS()) {
      if (!c.collectible) continue;
      for (const m of c.text.matchAll(/<b>([^<]{1,16}?)<\/b>/g)) {
        const rest = leftover(m[1]);
        if (rest && !NOT_MECHANICS.has(rest) && !NOT_MECHANICS.has(m[1].replace(/[\s{}\d@]/g, ''))) missing.set(rest, c.id);
      }
    }
    expect([...missing.entries()]).toEqual([]);
  });

  it('每個說明都有名稱與內容，且名稱不重複', () => {
    const seen = new Set<string>();
    for (const g of GLOSSARY) {
      expect(g.term.length).toBeGreaterThan(0);
      expect(g.desc.length).toBeGreaterThan(5);
      expect(seen.has(g.term), g.term).toBe(false);
      seen.add(g.term);
    }
  });

  it('預備、倒轉、碎裂、雕刻、合體等需要操作的機制，說明裡有操作方式', () => {
    const need = (id: string, term: string) => {
      const e = glossaryFor(getCard(id)).find((x) => x.term === term);
      expect(e, `${id} ${term}`).toBeTruthy();
      expect(e!.how, `${term} 的操作方式`).toBeTruthy();
    };
    need('MEND_046t', '雕刻');
    need('CAP_407', '預備');
    need('CATA_134', '碎裂');
    need('TIME_003', '倒轉');
  });

  it('提示列的操作提示', () => {
    const magnet = ALL_CARDS().find((c) => c.magnetic);
    expect(playHint(magnet!)).toContain('合體');
  });
});
