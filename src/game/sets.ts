// 卡牌系列名稱與卡包種類
// 名稱可以自由修改；新增卡包只要在 PACKS 加一筆即可。

export const SET_NAMES: Record<number, string> = {
  3: '經典',
  4: '名人堂',
  12: '納克薩瑪斯',
  13: '哥布林與地精',
  14: '黑石山',
  15: '銀白聯賽',
  20: '探險者協會',
  21: '古神碎碎念',
  23: '卡拉贊之夜',
  25: '龍蛇混雜的加基森',
  27: '安戈洛歷險記',
  1001: '冰封王座的騎士',
  1004: '狗頭人與地下城',
  1125: '黑木森林',
  1127: '爆爆計畫',
  1129: '拉斯塔哈大混戰',
  1130: '暗影崛起',
  1158: '奧丹姆',
  1347: '巨龍降臨',
  1403: '迦拉克隆的覺醒',
  1414: '外域灰燼',
  1443: '通靈學園',
  1463: '惡魔獵人新兵',
  1466: '暗月馬戲團',
  1525: '貧瘠之地',
  1578: '暴風城',
  1626: '奧特蘭克山谷',
  1635: '傳統',
  1637: '核心',
  1658: '沉沒之城',
  1691: '納斯利亞堡',
  1776: '巫妖王的進軍',
  1809: '傳奇音樂節',
  1810: '核心',
  1858: '泰坦',
  1869: '亞瑟之路',
  1892: '決戰荒蕪之地',
  1897: '威茲班的工作坊',
  1898: '時光之穴',
  1905: '天堂島',
  1935: '深暗領域',
  1946: '翡翠夢境',
  1952: '安戈洛失落之城',
  1957: '穿越時間流',
  1980: '浩劫與重生',
  1988: '逃離紫羅蘭堡',
  9999: '自訂',
};

export function setName(set: number): string {
  return SET_NAMES[set] ?? `系列 ${set}`;
}

export interface PackType {
  id: string;
  name: string;
  description: string;
  /** 包含的系列；空陣列 = 全部可收藏卡 */
  sets: number[];
  price: number;
  color: string;
}

export const PACKS: PackType[] = [
  {
    id: 'classic',
    name: '經典卡包',
    description: '經典、傳統、核心與名人堂的卡牌',
    sets: [3, 4, 1635, 1637, 1810],
    price: 100,
    color: '#c9a34a',
  },
  {
    id: 'wild1',
    name: '冒險年代卡包',
    description: '納克薩瑪斯、哥布林與地精、黑石山、銀白聯賽、探險者協會、古神、卡拉贊、加基森',
    sets: [12, 13, 14, 15, 20, 21, 23, 25],
    price: 100,
    color: '#5a8f4e',
  },
  {
    id: 'wild2',
    name: '冰封與地城卡包',
    description: '安戈洛、冰封王座、狗頭人、黑木森林、爆爆計畫、拉斯塔哈',
    sets: [27, 1001, 1004, 1125, 1127, 1129],
    price: 100,
    color: '#4f7fb8',
  },
  {
    id: 'wild3',
    name: '巨龍與外域卡包',
    description: '暗影崛起、奧丹姆、巨龍降臨、外域灰燼、通靈學園、暗月馬戲團',
    sets: [1130, 1158, 1347, 1403, 1414, 1443, 1463, 1466],
    price: 100,
    color: '#8a4fb8',
  },
  {
    id: 'modern',
    name: '近代擴充卡包',
    description: '貧瘠之地到泰坦的擴充卡牌',
    sets: [1525, 1578, 1626, 1658, 1691, 1776, 1809, 1858, 1869],
    price: 100,
    color: '#b8574f',
  },
  {
    id: 'latest',
    name: '最新擴充卡包',
    description: '決戰荒蕪之地到深暗領域的卡牌',
    sets: [1892, 1897, 1898, 1905, 1935],
    price: 100,
    color: '#3fa3a0',
  },
  {
    id: 'emerald',
    name: '翡翠夢境卡包',
    description: '只包含翡翠夢境的卡牌：灌注（六個職業）、黑暗禮物、休眠、燃燒',
    sets: [1946],
    price: 100,
    color: '#2e8b57',
  },
  {
    id: 'ungoro',
    name: '安戈洛失落之城卡包',
    description: '只包含安戈洛失落之城的卡牌：血緣、任務、地圖、額外效果',
    sets: [1952],
    price: 100,
    color: '#4f9a3c',
  },
  {
    id: 'timeways',
    name: '穿越時間流卡包',
    description: '只包含穿越時間流（時光特攻隊）的卡牌：倒轉、傳說、灌注、地點牌',
    sets: [1957],
    price: 100,
    color: '#c79a2e',
  },
  {
    id: 'cataclysm',
    name: '浩劫與重生卡包',
    description: '只包含浩劫與重生的卡牌：預兆、巨型、碎裂、地脈',
    sets: [1980],
    price: 100,
    color: '#c4452b',
  },
  {
    id: 'violet',
    name: '逃離紫羅蘭堡卡包',
    description: '只包含逃離紫羅蘭堡的卡牌：預備、偽裝、對戰開始',
    sets: [1988],
    price: 100,
    color: '#7a4fc4',
  },
  {
    id: 'all',
    name: '全系列卡包',
    description: '從所有系列中隨機掉落',
    sets: [],
    price: 120,
    color: '#d97a2b',
  },
];

export function packById(id: string): PackType | undefined {
  return PACKS.find((p) => p.id === id);
}
