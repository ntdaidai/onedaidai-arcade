import { describe, it, expect } from 'vitest';
import { GAMES } from '../src/games/registry';
import { padScore, relativeTime, dateKey, hashDate } from '../src/shell/hub/model';
import { ArcadeStorage, memoryBackend } from '../src/core/storage';
import { buildHall } from '../src/shell/hub/model';
import { buildDaily, CHALLENGES } from '../src/shell/hub/model';
import { buildFeatured, buildCards, buildHubModel, REPO_URL } from '../src/shell/hub/model';

describe('registry displayName', () => {
  it('all eight games have Chinese display names', () => {
    expect(GAMES.map((g) => g.meta.displayName)).toEqual([
      '贪吃蛇', '俄罗斯方块', '打砖块', '飞翔小鸟', '2048', '扫雷', '数独', '五子棋',
    ]);
  });
});

describe('padScore', () => {
  it('pads to 6 digits by default', () => {
    expect(padScore(0)).toBe('000000');
    expect(padScore(12750)).toBe('012750');
  });

  it('does not truncate wider values', () => {
    expect(padScore(1234567)).toBe('1234567');
  });

  it('negatives and fractions floor to a non-negative integer', () => {
    expect(padScore(-5)).toBe('000000');
    expect(padScore(47.9)).toBe('000047');
  });
});

describe('relativeTime', () => {
  const M = 60_000, H = 3_600_000, D = 86_400_000;
  it('under a minute is 刚刚', () => {
    expect(relativeTime(1000, 1000)).toBe('刚刚');
    expect(relativeTime(0, 59_999)).toBe('刚刚');
  });
  it('under an hour counts minutes', () => {
    expect(relativeTime(0, M)).toBe('1 分钟前');
    expect(relativeTime(0, 59 * M)).toBe('59 分钟前');
  });
  it('under a day counts hours', () => {
    expect(relativeTime(0, H)).toBe('1 小时前');
    expect(relativeTime(0, 2 * H)).toBe('2 小时前');
    expect(relativeTime(0, 23 * H)).toBe('23 小时前');
  });
  it('under a week counts days', () => {
    expect(relativeTime(0, D)).toBe('1 天前');
    expect(relativeTime(0, 6 * D)).toBe('6 天前');
  });
  it('over a week is 很久以前', () => {
    expect(relativeTime(0, 7 * D)).toBe('很久以前');
  });
  it('a future timestamp never goes negative', () => {
    expect(relativeTime(5000, 0)).toBe('刚刚');
  });
});

describe('dateKey / hashDate', () => {
  it('dateKey formats the local date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 8, 5))).toBe('2026-09-05');
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  it('hashDate is stable for the same input and non-negative', () => {
    expect(hashDate('2026-09-05')).toBe(hashDate('2026-09-05'));
    expect(hashDate('2026-09-05')).toBeGreaterThanOrEqual(0);
  });
  it('hashDate differs for different inputs', () => {
    expect(hashDate('2026-09-05')).not.toBe(hashDate('2026-09-06'));
    expect(hashDate('2026-09-05')).not.toBe(hashDate('2026-09-05:new'));
  });
});

function freshStorage(seed: Record<string, unknown> = {}): ArcadeStorage {
  const backend = memoryBackend();
  for (const [k, v] of Object.entries(seed)) backend.setItem(`arcade.${k}`, JSON.stringify(v));
  return new ArcadeStorage(backend);
}

describe('buildHall', () => {
  it('three empty rows when there are no scores', () => {
    const rows = buildHall(freshStorage());
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.tone === 'faint')).toBe(true);
    expect(rows[0]).toEqual({ rank: '1', name: '— 暂无记录 —', score: '······', tone: 'faint' });
  });

  it('top three by score, padded to three rows', () => {
    const rows = buildHall(freshStorage({ 'best.snake': 3840, 'best.tetris': 12750 }));
    expect(rows.map((r) => r.name)).toEqual(['俄罗斯方块', '贪吃蛇', '— 暂无记录 —']);
    expect(rows.map((r) => r.score)).toEqual(['012750', '003840', '······']);
    expect(rows[2].tone).toBe('faint');
  });

  it('first is gold, second and third are dim', () => {
    const rows = buildHall(freshStorage({ 'best.snake': 100, 'best.tetris': 200 }));
    expect(rows.map((r) => r.tone)).toEqual(['gold', 'dim', 'faint']);
  });

  it('only the top three', () => {
    const rows = buildHall(freshStorage({
      'best.snake': 10, 'best.tetris': 20, 'best.breakout': 30, 'best.flappy': 40,
    }));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(['飞翔小鸟', '打砖块', '俄罗斯方块']);
  });

  it('ties follow registry order', () => {
    const rows = buildHall(freshStorage({ 'best.tetris': 500, 'best.snake': 500 }));
    expect(rows.map((r) => r.name)).toEqual(['贪吃蛇', '俄罗斯方块', '— 暂无记录 —']);
  });

  it('ignores junk data and zero scores', () => {
    const rows = buildHall(freshStorage({
      'best.snake': 'oops', 'best.tetris': null, 'best.breakout': 0, 'best.flappy': 47,
    }));
    expect(rows.map((r) => r.name)).toEqual(['飞翔小鸟', '— 暂无记录 —', '— 暂无记录 —']);
  });
});

describe('the zero-score rule', () => {
  // Cards and the Hall of Fame must agree on what counts as a record
  it('zero counts as no record in both places', () => {
    const s = freshStorage({ 'best.snake': 0 });
    expect(buildCards(s)[0]).toMatchObject({ pill: '暂无记录', hasRecord: false });
    expect(buildHall(s).every((r) => r.tone === 'faint')).toBe(true);
  });
});

describe('buildDaily', () => {
  it('all eight games have challenge copy', () => {
    for (const g of GAMES) {
      expect(CHALLENGES[g.meta.id], `missing challenge copy for ${g.meta.id}`).toBeDefined();
      expect(CHALLENGES[g.meta.id].prefix.length).toBeGreaterThan(0);
    }
  });

  it('two calls on the same day give identical results', () => {
    const a = buildDaily(new Date(2026, 8, 5, 9, 0));
    const b = buildDaily(new Date(2026, 8, 5, 23, 30));
    expect(a).toEqual(b);
  });

  it('the date label uses a Chinese month, day and weekday', () => {
    // 2026-09-05 is a Saturday
    expect(buildDaily(new Date(2026, 8, 5)).dateLabel).toBe('今日推荐 · 9月5日 周六');
  });

  it('the chosen game id is always in the registry', () => {
    for (let d = 1; d <= 28; d++) {
      const daily = buildDaily(new Date(2026, 8, d));
      expect(GAMES.some((g) => g.meta.id === daily.id)).toBe(true);
    }
  });

  it('does not stay on one game for a whole month', () => {
    const ids = new Set<string>();
    for (let d = 1; d <= 28; d++) ids.add(buildDaily(new Date(2026, 8, d)).id);
    expect(ids.size).toBeGreaterThan(1);
  });

  it('Minesweeper has Chinese challenge copy', () => {
    expect(CHALLENGES.minesweeper).toEqual({ prefix: '挑战', suffix: '：60 秒内完成' });
  });
});

describe('buildFeatured', () => {
  const now = new Date(2026, 8, 5, 12, 0);

  it('a valid lastPlayed enters continue mode', () => {
    const at = now.getTime() - 2 * 3_600_000;
    const s = freshStorage({ lastPlayed: { id: 'tetris', at }, 'best.tetris': 12750 });
    expect(buildFeatured(s, now)).toEqual({
      mode: 'continue',
      label: '◆ 接着玩 ◆',
      button: '继续游戏',
      id: 'tetris',
      name: '俄罗斯方块',
      accent: 'magenta',
      meta: '你的最高分 012750 · 上次游玩：2 小时前',
    });
  });

  it('played but no record degrades the meta line', () => {
    const s = freshStorage({ lastPlayed: { id: 'sudoku', at: now.getTime() } });
    expect(buildFeatured(s, now).meta).toBe('还没有记录 · 上次游玩：刚刚');
  });

  it('never played enters newcomer mode', () => {
    const f = buildFeatured(freshStorage(), now);
    expect(f.mode).toBe('newcomer');
    expect(f.label).toBe('◆ 来玩一局？◆');
    expect(f.button).toBe('开始游戏');
    expect(f.meta).toBe('还没有记录 · 等你来挑战');
    expect(GAMES.some((g) => g.meta.id === f.id)).toBe(true);
  });

  it('newcomer mode is stable within a day', () => {
    const a = buildFeatured(freshStorage(), new Date(2026, 8, 5, 1, 0));
    const b = buildFeatured(freshStorage(), new Date(2026, 8, 5, 22, 0));
    expect(a).toEqual(b);
  });

  it('junk lastPlayed always falls back to newcomer', () => {
    for (const bad of ['nope', 42, null, {}, { id: 'ghost', at: 1 }, { id: 'snake', at: 'x' }]) {
      expect(buildFeatured(freshStorage({ lastPlayed: bad }), now).mode).toBe('newcomer');
    }
  });
});

describe('buildCards', () => {
  it('eight cards, accent rotating by index', () => {
    const cards = buildCards(freshStorage());
    expect(cards).toHaveLength(8);
    expect(cards.map((c) => c.accent)).toEqual([
      'teal', 'magenta', 'orange', 'gold', 'teal', 'magenta', 'orange', 'gold',
    ]);
  });

  it('shows a Chinese no-record label or a padded best score', () => {
    const cards = buildCards(freshStorage({ 'best.snake': 3840 }));
    expect(cards[0]).toMatchObject({ id: 'snake', name: '贪吃蛇', pill: '最高分 003840', hasRecord: true });
    expect(cards[6]).toMatchObject({ id: 'sudoku', pill: '暂无记录', hasRecord: false });
  });
});

describe('buildHubModel', () => {
  it('the footer reflects game count and mute state, and carries the repo URL', () => {
    const on = buildHubModel(freshStorage(), new Date(2026, 8, 5));
    expect(on.footer.games).toBe('8 款游戏已就绪');
    expect(on.footer.muted).toBe(false);
    expect(on.footer.repoUrl).toBe(REPO_URL);
    const off = buildHubModel(freshStorage({ muted: true }), new Date(2026, 8, 5));
    expect(off.footer.muted).toBe(true);
  });

  it('aggregates the four sections', () => {
    const m = buildHubModel(freshStorage(), new Date(2026, 8, 5));
    expect(m.hall).toHaveLength(3);
    expect(m.cards).toHaveLength(8);
    expect(m.featured.mode).toBe('newcomer');
    expect(m.daily.dateLabel).toContain('今日推荐');
  });
});
