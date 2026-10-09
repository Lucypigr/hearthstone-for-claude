import { useMemo, useState } from 'react';
import { CONTROLS, GLOSSARY } from '../glossary';

/** 機制說明清單：可搜尋，依分類排列 */
export function GlossaryBrowser() {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const kw = q.trim();
    const map = new Map<string, typeof GLOSSARY>();
    for (const e of GLOSSARY) {
      if (kw && !`${e.term}${e.desc}${e.how ?? ''}`.includes(kw)) continue;
      map.set(e.group, [...(map.get(e.group) ?? []), e]);
    }
    const controls = CONTROLS.filter((c) => !kw || `${c.term}${c.desc}`.includes(kw));
    return [...(controls.length ? ([['基本操作', controls.map((c) => ({ ...c, group: '基本操作' as never }))]] as unknown as [string, typeof GLOSSARY][]) : []), ...map.entries()];
  }, [q]);
  return (
    <div className="help-page">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋機制（例如：預備、雕刻、碎裂）" />
      {groups.map(([group, list]) => (
        <section key={group} className="help-group">
          <h3>{group}</h3>
          {list.map((e) => (
            <div key={e.term} className="help-item">
              <b>{e.term}</b>：{e.desc}
              {e.how && <div className="how">▸ {e.how}</div>}
            </div>
          ))}
        </section>
      ))}
      {!groups.length && <p className="muted">找不到符合的機制。</p>}
    </div>
  );
}
