// 產生 src/data/bg.json（英雄戰場的隨從、英雄、英雄能力與衍生物）
// 用法：npm run bg
// 資料來源是 HearthstoneJSON（和 hsreplay.net 同一份官方資料），快取於 .cache/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = 'src/data/bg.json';
const LOCALES = ['zhTW', 'enUS'] as const;

interface HsjCard {
  id: string;
  dbfId: number;
  name: string;
  text?: string;
  type?: string;
  set?: string;
  attack?: number;
  health?: number;
  cost?: number;
  armor?: number;
  techLevel?: number;
  races?: string[];
  mechanics?: string[];
  isBattlegroundsPoolMinion?: boolean;
  isBattlegroundsPoolSpell?: boolean;
  isBattlegroundsDuosExclusive?: boolean;
  battlegroundsAssociatedRaces?: string[];
  battlegroundsHero?: boolean;
  heroPowerDbfId?: number;
}

/** 戰場上會出現、但不在酒館卡池裡的卡（衍生物、法術） */
const EXTRA_IDS = [
  'BG28_603t', // 甲蟲
  'BG_BOT_312t', // 微型機器人
  'BG_ICC_026t', // 骷髏
  'BGS_115t', // 涓滴效應
  'BG25_010t', // 助攻手
  'BG36_200t', // 覓食蝙蝠
  'BG19_010', // 下水道老鼠
  'BG19_010t', // 忍殼龜
  'BG23_HERO_201pt', // 歐蘇瑪特的觸手
  'BG22_HERO_305t', // 奧妮克希亞幼龍
  'BG20_GEM', // 鮮血寶石
  'BG28_810', // 旅店幸運幣
  'TB_BaconShop_Triples_01', // 三合一獎勵
  'BG23_000t', // 迷你三叉戟
  'BG31_924t', // 奇術
  'BG23_004t', // 釣手誘餌
  'BG23_007t', // 水下坐騎
  'BG23_008t', // 發光皇冠
  'BG32_835t', // 冥想
  'BG33_319t', // 霜贏局面
  'BG31_893', // 寶石日
  'BG35_910', // 焚焰
  'BG35_911', // 秘法吸收
  'EBG_Spell_014', // 尖尖箭
  'BG31_171t', // 衛星
  'BG34_634t', // 藍色炫彩龍
  'BG34_635t', // 黑色炫彩龍
  'BG34_636t', // 綠色炫彩龍
  'BG34_637t', // 青銅炫彩龍
  'BG34_638t', // 紅色炫彩龍
  'BG35_150t', // 惡魔食料
  'BG36_205', // 魚餌
  'BG36_520t', // 帶鎖箱
  'BGFYM_002t', // 變異觸手
  'BGFYM_000', // 克蘇恩（神祇）
  'BG31_920t', // 進化策略
  'BG27_514t', // 海妖之歌
  'BG33_890t', // 魔術魚學徒
  'BG21_HERO_030t', // 斯尼德的新伐木機
  'TB_BaconShop_HP_033t', // 聚合體
  'TB_BaconShop_HP_105t', // 恩若司之魚
  'BG22_HERO_001p_t1et', // 石元素
  'BG22_HERO_001p_t1', // 大地祈願
  'BG22_HERO_001p_t2', // 火焰祈願
  'BG22_HERO_001p_t3', // 流水祈願
  'BG22_HERO_001p_t4', // 雷電祈願
  'BG22_HERO_007p2', // 納迦征服
  'TB_BaconShop_HP_087t', // 薩弗拉斯
  'TB_BaconShop_HP_036t', // 虛空傳送門
  'BG23_HERO_303pt', // 沒有手下
  'TB_BaconShop_HP_038t', // 野生香蕉
];

async function load(locale: string): Promise<HsjCard[]> {
  const path = `.cache/hsjson-${locale}.json`;
  if (!existsSync(path)) {
    const url = `https://api.hearthstonejson.com/v1/latest/${locale}/cards.json`;
    console.log(`下載 ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下載失敗：HTTP ${res.status}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, await res.text());
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function clean(text: string | undefined): string {
  let t = (text ?? '').replace(/\[x\]/g, '').trim();
  // 有些卡把兩種敘述（例如「還差 3 個」和「完成！」）用一個數字接在一起：只留第一段
  const head = t.slice(0, 4);
  for (let i = 4; i < t.length - 4; i++) {
    if (/\d/.test(t[i]) && t.slice(i + 1).startsWith(head)) {
      t = t.slice(0, i);
      break;
    }
  }
  return t;
}

async function main() {
  const [zh, en] = await Promise.all(LOCALES.map(load));
  const enById = new Map(en.map((c) => [c.id, c]));
  const byDbf = new Map(zh.map((c) => [c.dbfId, c]));
  const out: Record<string, unknown> = {};
  const add = (c: HsjCard, extra: Record<string, unknown> = {}) => {
    const e = enById.get(c.id);
    out[c.id] = {
      name: c.name,
      en: e?.name ?? c.name,
      text: clean(c.text),
      type: c.type,
      ...(c.attack !== undefined && c.type === 'MINION' ? { atk: c.attack, hp: c.health } : {}),
      ...(c.techLevel ? { tier: c.techLevel } : {}),
      ...(c.races?.length ? { races: c.races } : {}),
      ...(c.mechanics?.length ? { mech: c.mechanics } : {}),
      ...(c.type === 'HERO_POWER' || c.type === 'BATTLEGROUND_SPELL' || c.type === 'SPELL' ? { cost: c.cost ?? 0 } : {}),
      ...(c.isBattlegroundsPoolSpell ? { pool: true } : {}),
      ...(c.battlegroundsAssociatedRaces?.length ? { assoc: c.battlegroundsAssociatedRaces } : {}),
      ...extra,
    };
  };
  const byId = new Map(zh.map((c) => [c.id, c]));
  // 酒館卡池（不含雙人模式的卡）
  for (const c of zh) if (c.isBattlegroundsPoolMinion && !c.id.startsWith('BGDUO')) add(c);
  // 酒館法術（不含雙人模式限定）
  for (const c of zh) if (c.isBattlegroundsPoolSpell && !c.isBattlegroundsDuosExclusive) add(c);
  for (const id of EXTRA_IDS) {
    const c = byId.get(id);
    if (!c) throw new Error(`找不到 ${id}`);
    if (!out[id]) add(c);
  }
  // 聚合體擁有所有種族
  (out['TB_BaconShop_HP_033t'] as { races?: string[] }).races = ['ALL'];
  // 英雄與英雄能力
  for (const c of zh) {
    if (!c.battlegroundsHero || c.type !== 'HERO' || c.id.startsWith('BGDUO') || /_SKIN_/.test(c.id)) continue;
    const power = c.heroPowerDbfId ? byDbf.get(c.heroPowerDbfId) : undefined;
    if (!power) continue;
    add(c, { armor: c.armor ?? 0, power: power.id });
    add(power);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(OUT, JSON.stringify(sorted, null, 0).replace(/},"/g, '},\n"') + '\n');
  console.log(`寫入 ${OUT}：${Object.keys(sorted).length} 張`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
