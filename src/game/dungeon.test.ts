// 地城探險：Boss 資料、一輪的流程、寶藏與 Boss 英雄能力
import { describe, expect, it } from 'vitest';
import { DUNGEON_BOSSES } from '../cards/dungeonBosses';
import { getCard, hasCard, POWER_INFO } from '../cards/registry';
import { playAiTurn } from '../engine/ai';
import { ACTIVE_TREASURES, PASSIVE_TREASURES } from '../engine/dungeon';
import { Game } from '../engine/game';
import type { PlayerId } from '../engine/state';
import { DUNGEON_CLASSES, DUNGEON_LEVELS, bossDeck, bossHp, bossPower, currentBoss, currentLevel, finishFight, gameOptions, parseDeck, pickReward, playerHp, startRun, type DungeonRun } from './dungeon';

function duel(run: DungeonRun, seed = 3): Game {
  const g = Game.create({ ...gameOptions(run), ai: [true, true], seed });
  g.apply({ type: 'mulligan', player: 0, replace: [] });
  g.apply({ type: 'mulligan', player: 1, replace: [] });
  return g;
}

function give(g: Game, id: string, pid: PlayerId = 0) {
  const hc = g.newHandCard(id);
  g.s.players[pid].hand.push(hc);
  g.s.players[pid].mana = g.s.players[pid].maxMana = 10;
  return hc;
}

describe('Boss 資料', () => {
  it('每個 Boss 的英雄卡與英雄能力都存在，牌組大部分對得到', () => {
    for (const b of DUNGEON_BOSSES) {
      expect(hasCard(b.hero), b.hero).toBe(true);
      expect(POWER_INFO[b.power], b.power).toBeTruthy();
      if (b.power2) expect(POWER_INFO[b.power2], b.power2).toBeTruthy();
      expect(b.hp.length).toBe(b.levels.length);
      const { cards, missing } = parseDeck(b.deck);
      expect(cards.length, `${b.name} 牌組`).toBeGreaterThanOrEqual(8);
      expect(missing.length, `${b.name} 缺少 ${missing.join()}`).toBeLessThan(8);
    }
  });

  it('每一關都有 Boss 可以抽', () => {
    for (let lv = 1; lv <= DUNGEON_LEVELS; lv++) expect(DUNGEON_BOSSES.some((b) => b.levels.includes(lv)), `第 ${lv} 關`).toBe(true);
  });

  it('每個職業都有 10 張起始牌', () => {
    for (const c of DUNGEON_CLASSES) expect(startRun(c).deck.length, c).toBeGreaterThanOrEqual(9);
  });

  it('寶藏卡都存在', () => {
    for (const id of [...PASSIVE_TREASURES, ...ACTIVE_TREASURES]) expect(hasCard(id), id).toBe(true);
  });
});

describe('一輪的流程', () => {
  it('擊敗 Boss 後依序領取獎勵，最後一關通關', () => {
    let run = startRun('MAGE', 11);
    expect(run.stage).toBe('fight');
    expect(playerHp(run)).toBe(15);
    for (let lv = 1; lv <= DUNGEON_LEVELS; lv++) {
      expect(currentLevel(run)).toBe(lv);
      expect(currentBoss(run).levels).toContain(lv);
      run = finishFight(run, true);
      if (lv === DUNGEON_LEVELS) break;
      expect(run.stage).toBe('reward');
      while (run.stage === 'reward') run = pickReward(run, 0);
      expect(run.stage).toBe('fight');
    }
    expect(run.stage).toBe('cleared');
    expect(run.wins).toBe(8);
    expect(run.passives.length).toBe(2);
    expect(run.deck.length).toBeGreaterThan(30);
  });

  it('輸了就結束；生命值每場 +5，最多 50', () => {
    expect(finishFight(startRun('WARRIOR'), false).stage).toBe('over');
    const run = { ...startRun('WARRIOR'), wins: 7 };
    expect(playerHp(run)).toBe(50);
  });

  it('被動寶藏在第 1、5 場後，寶藏卡在第 3、7 場後', () => {
    let run = startRun('PRIEST', 5);
    const kinds: string[][] = [];
    for (let i = 0; i < 7; i++) {
      run = finishFight(run, true);
      kinds.push(run.rewards.map((r) => r.kind));
      while (run.stage === 'reward') run = pickReward(run, 1);
    }
    expect(kinds[0]).toEqual(['passive', 'bundle']);
    expect(kinds[2]).toEqual(['treasure', 'bundle']);
    expect(kinds[4]).toEqual(['passive', 'bundle']);
    expect(kinds[6]).toEqual(['treasure', 'bundle']);
    expect(kinds[1]).toEqual(['bundle']);
  });

  it('每個 Boss 的對戰都能打完（電腦互打）', () => {
    const failures: string[] = [];
    for (let i = 0; i < DUNGEON_BOSSES.length; i++) {
      try {
        const run = startRun(DUNGEON_CLASSES[i % DUNGEON_CLASSES.length], i + 1);
        run.boss = i;
        run.wins = DUNGEON_BOSSES[i].levels[0] - 1;
        const g = duel(run, i + 7);
        expect(g.s.players[1].hero.hp).toBe(bossHp(run));
        expect(g.s.players[1].heroPower.id).toBe(bossPower(run));
        for (let t = 0; t < 12 && g.s.phase === 'play'; t++) playAiTurn(g, 'normal');
        expect(bossDeck(run).length).toBeGreaterThanOrEqual(10);
      } catch (e) {
        failures.push(`${DUNGEON_BOSSES[i].name}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120000);
});

describe('開局規則', () => {
  it('玩家先攻，雙方都沒有幸運幣', () => {
    const run = startRun('HUNTER', 2);
    const g = duel(run);
    expect(g.s.first).toBe(0);
    expect(g.s.players[1].hand.some((h) => h.cardId === 'GAME_005')).toBe(false);
  });

  it('最終 Boss 開局有 2 顆法力水晶', () => {
    const run = { ...startRun('ROGUE', 4), wins: 7 };
    run.boss = DUNGEON_BOSSES.findIndex((b) => b.levels.includes(8));
    const g = duel(run);
    expect(g.s.players[1].maxMana).toBe(1);
    g.apply({ type: 'endTurn' });
    expect(g.s.players[1].maxMana).toBe(2);
  });
});

describe('被動寶藏', () => {
  const withPassive = (id: string) => {
    const run = startRun('MAGE', 9);
    run.passives = [id];
    return duel(run);
  };

  it('活力藥水：起始生命值加倍', () => {
    expect(withPassive('LOOTA_800').s.players[0].hero.maxHp).toBe(30);
  });
  it('水晶寶石：多一顆法力水晶', () => {
    const g = withPassive('LOOTA_801');
    expect(g.s.players[0].maxMana).toBe(2);
  });
  it('審判者之戒：英雄能力強化且消耗 (1)', () => {
    const g = withPassive('LOOTA_802');
    expect(g.s.players[0].heroPower.cost).toBe(1);
    expect(g.s.players[0].heroPower.id).toBe('HERO_08bp2');
  });
  it('小背包：開局多抽 2 張牌', () => {
    // 先攻 3 張 + 小背包 2 張，再加上回合開始抽的 1 張
    expect(withPassive('LOOTA_804').s.players[0].hand.length).toBe(6);
  });
  it('魔導師長袍：法術傷害 +3', () => {
    expect(withPassive('LOOTA_825').spellDamage(0)).toBe(3);
  });
  it('奪來的旗幟、隱形斗篷：你的手下 +1/+1 並具有隱形', () => {
    const g = withPassive('LOOTA_828');
    const m = g.makeMinion(0, 'CS2_182');
    expect(m.hp).toBe(6);
    const g2 = withPassive('LOOTA_832');
    expect(g2.makeMinion(0, 'CS2_182').keywords).toContain('STEALTH');
  });
  it('召喚權杖、葛羅瑪許的臂甲、卡德加的占卜寶珠：改變消耗', () => {
    const g = withPassive('LOOTA_803');
    expect(g.costOf(g.s.players[0], g.newHandCard('EX1_564'))).toBeLessThanOrEqual(5);
    const g2 = withPassive('LOOTA_824');
    expect(g2.costOf(g2.s.players[0], g2.newHandCard('CS2_029'))).toBe(getCard('CS2_029').cost - 1);
  });
  it('結界雕紋：敵方手下消耗 +1', () => {
    const run = startRun('MAGE', 9);
    const g = duel(run);
    g.s.players[0].passives = ['LOOTA_831'];
    expect(g.costOf(g.s.players[1], g.newHandCard('CS2_182'))).toBe(getCard('CS2_182').cost + 1);
  });
  it('神秘魔典：開局打出 3 個奧秘', () => {
    expect(withPassive('LOOTA_833').s.players[0].secrets.length).toBe(3);
  });
  it('亡者圖騰、戰鬥圖騰：亡語與戰吼觸發兩次', () => {
    const g = withPassive('LOOTA_846');
    expect(g.flagOnBoard('doubleBattlecries', 0)).toBe(true);
    expect(withPassive('LOOTA_845').flagOnBoard('doubleDeathrattle', 0)).toBe(true);
  });
});

describe('寶藏卡與 Boss 英雄能力', () => {
  const fresh = () => {
    const run = startRun('MAGE', 21);
    const g = duel(run, 5);
    g.s.players[0].hand = [];
    return g;
  };

  it('每件寶藏卡都能打出', () => {
    const failures: string[] = [];
    for (const id of ACTIVE_TREASURES) {
      try {
        const g = fresh();
        const m = g.makeMinion(1, 'CS2_182');
        m.sleeping = false;
        g.s.players[1].board.push(m);
        const hc = give(g, id);
        const def = getCard(id);
        const t = def.target ? m.uid : undefined;
        g.apply({ type: 'play', handUid: hc.uid, target: t });
        while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 } as never);
        g.apply({ type: 'endTurn' });
        playAiTurn(g, 'normal');
      } catch (e) {
        failures.push(`${id}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('充盈之袋：抽牌直到手牌已滿', () => {
    const g = fresh();
    for (let i = 0; i < 12; i++) g.s.players[0].deck.push(g.newHandCard('CS2_182'));
    const hc = give(g, 'LOOTA_823');
    g.s.players[0].mana = 5;
    g.apply({ type: 'play', handUid: hc.uid });
    expect(g.s.players[0].hand.length).toBe(10);
  });

  it('一袋錢幣：用幸運幣填滿手牌', () => {
    const g = fresh();
    const hc = give(g, 'LOOTA_836');
    g.apply({ type: 'play', handUid: hc.uid });
    expect(g.s.players[0].hand.filter((h) => h.cardId === 'GAME_005').length).toBeGreaterThan(5);
  });

  it('迅捷之靴：本回合手下消耗 (0)', () => {
    const g = fresh();
    const hc = give(g, 'LOOTA_812');
    g.apply({ type: 'play', handUid: hc.uid });
    const mn = g.newHandCard('CS2_182');
    g.s.players[0].hand.push(mn);
    expect(g.costOf(g.s.players[0], mn)).toBe(0);
  });

  it('Boss 英雄能力：每個都能使用而不出錯', () => {
    const failures: string[] = [];
    for (const b of DUNGEON_BOSSES) {
      for (const pid of [b.power, b.power2].filter(Boolean) as string[]) {
        try {
          const run = startRun('MAGE', 33);
          run.boss = DUNGEON_BOSSES.indexOf(b);
          const g = duel(run, 9);
          const boss = g.s.players[1];
          boss.heroPower = { id: pid, used: false, cost: POWER_INFO[pid].cost };
          const mine = g.makeMinion(0, 'CS2_182');
          const theirs = g.makeMinion(1, 'CS2_182');
          g.s.players[0].board.push(mine);
          boss.board.push(theirs);
          g.apply({ type: 'endTurn' });
          boss.mana = boss.maxMana = 10;
          g.apply({ type: 'heroPower', target: mine.uid } as never);
          while (g.s.pendingChoice) g.apply({ type: 'choose', index: 0 } as never);
          playAiTurn(g, 'normal');
        } catch (e) {
          failures.push(`${b.name}/${pid}: ${(e as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('蠟燭鬍子的被動：打出手下後獲得衝鋒', () => {
    const run = startRun('MAGE', 3);
    run.boss = DUNGEON_BOSSES.findIndex((b) => b.name === '蠟燭鬍子');
    run.wins = 5;
    const g = duel(run, 4);
    g.apply({ type: 'endTurn' });
    const boss = g.s.players[1];
    const hc = give(g, 'CS2_182', 1);
    g.apply({ type: 'play', handUid: hc.uid });
    expect(boss.board[0]?.keywords).toContain('CHARGE');
  });
});
