// 組裝出的手下在選擇視窗中以合成後的卡面顯示
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { assembledDef, assemblePool } from '../engine/assemble';
import { CardView } from './components/Card';

it('組裝出的卡面會顯示合成後的文字', () => {
  const pool = assemblePool();
  const def = assembledDef({ base: pool[0].id, donor: pool[5].id, half: 'bottom' });
  const html = renderToString(createElement(CardView, { cardId: def.id, def, width: 170, playable: true }));
  const plain = (t: string) => t.replace(/<[^>]+>/g, '').replace(/\s/g, '');
  // 下半段（換上的效果）出現在卡面上
  expect(plain(html)).toContain(plain(pool[5].assembleText![1]).slice(0, 6));
  expect(html).toContain(def.name);
});
