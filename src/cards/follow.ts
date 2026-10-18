// 「跟隨…」系列：打出這張卡後重複的效果。HandCard.follow = { id, turn } 指向這裡的 key。
// 效果用 { e: 'custom', fn: 'followGive', args: { id, ... } } 把同樣的效果交給手牌中的另一張卡。
import type { Effect } from '../engine/types';

const fn = (name: string, args?: Record<string, unknown>): Effect => ({ e: 'custom', fn: name, args });

export const FOLLOW_EFFECTS: Record<string, Effect[]> = {
  // 跟隨足跡：發現一個潛行手下，本回合賦予它此效果
  footsteps: [
    {
      e: 'discover',
      pool: { type: 'MINION', keyword: 'STEALTH' },
      then: [fn('followGive', { id: 'footsteps', target: 'it' })],
    },
  ],
  // 跟隨引線：對一個隨機敵人造成 2 點傷害，賦予手中一個可打出的海盜此效果
  fuse: [
    { e: 'damage', target: { t: 'random', filter: { side: 'enemy' }, count: 1 }, amount: 2, spell: true },
    fn('followGive', { id: 'fuse', race: 'PIRATE' }),
  ],
  // 跟隨證據：放一個 3/3 小鬼線人到敵方牌堆，賦予手中一張可打出的卡牌此效果
  evidence: [fn('putImpformants', { count: 1 }), fn('followGive', { id: 'evidence' })],
  // 跟隨鬼魂：召喚一個 2/1 重生鬼魂，賦予手中一張可打出的卡牌此效果
  // 閃電反射：本回合打出發現的自然法術後，再發現一個
  reflexes: [{ e: 'discover', pool: { type: 'SPELL', spellSchool: 'NATURE' } }],
  // 燧石火器：本回合打出拿到的快槍卡後，再拿一張
  flint: [fn('blFlintFirearm')],
  // 訓練課程：本回合打出發現的嘲諷手下後，再發現一個
  training: [{ e: 'discover', pool: { type: 'MINION', keyword: 'TAUNT' }, then: [fn('followGive', { id: 'training', target: 'it' })] }],
  // 仙人掌切割者：本回合施放抽到的法術後，切割者獲得 +1/+2 與嘲諷
  cactus: [fn('blCactusFire')],
  ghosts: [{ e: 'summon', card: 'CAP_802t', count: 1, who: 'self' }, fn('followGive', { id: 'ghosts' })],
};
