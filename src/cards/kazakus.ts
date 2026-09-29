// 卡札克斯藥水（卡札克斯的戰吼「製造一個自訂法術」）
// 先選擇藥水的消耗（1 / 5 / 10），再從同一級的材料中選兩種，合成一張擁有兩種效果的法術。
// 這個檔案只放卡牌 ID（覆寫也會用到，不能引用 registry）；合成的卡牌定義見 potion.ts。

/** 選擇消耗用的三張卡：次級藥水 / 強效藥水 / 超強藥水 */
export const KAZAKUS_TIERS = ['CFM_621t11', 'CFM_621t12', 'CFM_621t13'];

/** 各級藥水本體（敘述是「{0} {1}」，由兩種材料組成） */
export const KAZAKUS_POTIONS: Record<string, string> = {
  CFM_621t11: 'CFM_621t',
  CFM_621t12: 'CFM_621t14',
  CFM_621t13: 'CFM_621t15',
};

/** 各級的材料（官方資料 CFM_621t2 ~ t39） */
export const KAZAKUS_INGREDIENTS: Record<string, string[]> = {
  CFM_621t11: ['CFM_621t2', 'CFM_621t3', 'CFM_621t4', 'CFM_621t5', 'CFM_621t6', 'CFM_621t8', 'CFM_621t9', 'CFM_621t10', 'CFM_621t37'],
  CFM_621t12: ['CFM_621t16', 'CFM_621t17', 'CFM_621t18', 'CFM_621t19', 'CFM_621t20', 'CFM_621t21', 'CFM_621t22', 'CFM_621t23', 'CFM_621t24', 'CFM_621t38'],
  CFM_621t13: ['CFM_621t25', 'CFM_621t26', 'CFM_621t27', 'CFM_621t28', 'CFM_621t29', 'CFM_621t30', 'CFM_621t31', 'CFM_621t32', 'CFM_621t33', 'CFM_621t39'],
};

/** 所有會用到的卡（覆寫時一起收錄） */
export const KAZAKUS_TOKENS = [...KAZAKUS_TIERS, ...Object.values(KAZAKUS_POTIONS), ...Object.values(KAZAKUS_INGREDIENTS).flat()];
