// 地城探險（狗頭人與地下城）：被動寶藏與 Boss 被動英雄能力。
import type { MinionFlag } from './types';

/** 被動 id（寶藏卡 / Boss 英雄能力）會讓場上出現哪些全域旗標 */
export const PASSIVE_FLAGS: Record<string, MinionFlag[]> = {
  LOOTA_845: ['doubleDeathrattle'],
  LOOTA_846: ['doubleBattlecries'],
  LOOTA_BOSS_16p: ['doubleDeathrattle'],
  LOOTA_BOSS_17p: ['doubleBattlecries'],
  LOOTA_BOSS_38p: ['doubleDeathrattle', 'doubleBattlecries'],
};

/** 被動寶藏（打完某些 Boss 後三選一）。其餘寶藏是可以打出的卡牌 */
export const PASSIVE_TREASURES = [
  'LOOTA_800',
  'LOOTA_801',
  'LOOTA_802',
  'LOOTA_803',
  'LOOTA_804',
  'LOOTA_818',
  'LOOTA_824',
  'LOOTA_825',
  'LOOTA_828',
  'LOOTA_831',
  'LOOTA_832',
  'LOOTA_833',
  'LOOTA_845',
  'LOOTA_846',
];

/** 可以打出的寶藏卡（托戈瓦哥國王的「魔法蠟燭」會從中找一個） */
export const ACTIVE_TREASURES = [
  'LOOTA_805',
  'LOOTA_806',
  'LOOTA_811',
  'LOOTA_812',
  'LOOTA_813',
  'LOOTA_814',
  'LOOTA_816',
  'LOOTA_819',
  'LOOTA_821',
  'LOOTA_822',
  'LOOTA_823',
  'LOOTA_826',
  'LOOTA_827',
  'LOOTA_829',
  'LOOTA_834',
  'LOOTA_835',
  'LOOTA_836',
  'LOOTA_837',
  'LOOTA_838',
  'LOOTA_840',
  'LOOTA_843',
  'LOOTA_847',
];
