import { GAMES } from '../../games/registry';
import type { GameEntry } from '../../games/registry';
import type { ArcadeStorage } from '../../core/storage';
import { accentAt } from '../accent';
import type { AccentTone } from '../accent';

export type { AccentTone };

/** Zero-pad a score to 6 digits; wider values are kept, never truncated */
export function padScore(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(6, '0');
}

/** Relative-time copy, upper-case to match the arcade style */
export function relativeTime(at: number, now: number): string {
  const ms = Math.max(0, now - at);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return '很久以前';
}

/** Local date key, the seed for the daily content */
export function dateKey(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** djb2 variant returning a non-negative integer */
export function hashDate(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Semantic tone of a row; the colours live in CSS (.hall-row-*) */
export type HallTone = 'gold' | 'dim' | 'faint';

export interface HallRow {
  rank: string;
  name: string;
  score: string;
  tone: HallTone;
}

/** Display name for the hub; falls back to `name` when displayName is missing */
function label(entry: GameEntry): string {
  return entry.meta.displayName ?? entry.meta.name;
}

/**
 * Read one game's best score. Legacy junk and a score of 0 both count as no record — every
 * game only persists when `score > best` and best starts at 0, so 0 should never have been
 * stored. One rule here keeps a card from showing BEST 000000 while the Hall of Fame excludes it.
 */
function bestOf(storage: ArcadeStorage, id: string): number | null {
  const raw = storage.get<unknown>(`best.${id}`, null);
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function buildHall(storage: ArcadeStorage): HallRow[] {
  const top = GAMES
    .map((entry, index) => ({ index, name: label(entry), best: bestOf(storage, entry.meta.id) }))
    .filter((e): e is { index: number; name: string; best: number } => e.best !== null)
    .sort((a, b) => b.best - a.best || a.index - b.index)
    .slice(0, 3);

  const rows: HallRow[] = top.map((e, i) => ({
    rank: String(i + 1),
    name: e.name,
    score: padScore(e.best),
    tone: i === 0 ? 'gold' : 'dim',
  }));

  while (rows.length < 3) {
    rows.push({
      rank: String(rows.length + 1),
      name: '— 暂无记录 —',
      score: '······',
      tone: 'faint',
    });
  }
  return rows;
}

export interface DailyModel {
  dateLabel: string;
  prefix: string;
  name: string;
  suffix: string;
  id: string;
}

/** Rendered as "prefix GAME suffix"; suffix may be empty */
export const CHALLENGES: Record<string, { prefix: string; suffix: string }> = {
  snake: { prefix: '挑战', suffix: '：连续吃到 20 个苹果' },
  tetris: { prefix: '挑战', suffix: '：消除 10 行' },
  breakout: { prefix: '挑战', suffix: '：一条命打碎 60 块砖' },
  flappy: { prefix: '挑战', suffix: '：连续飞过 15 根水管' },
  g2048: { prefix: '挑战', suffix: '：合出 512' },
  minesweeper: { prefix: '挑战', suffix: '：60 秒内完成' },
  sudoku: { prefix: '挑战', suffix: '：一次填对' },
  gomoku: { prefix: '挑战', suffix: '：执黑战胜电脑' },
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function buildDaily(now: Date): DailyModel {
  const entry = GAMES[hashDate(dateKey(now)) % GAMES.length];
  const copy = CHALLENGES[entry.meta.id] ?? { prefix: '今天玩', suffix: '' };
  return {
    dateLabel: `今日推荐 · ${now.getMonth() + 1}月${now.getDate()}日 周${WEEKDAYS[now.getDay()]}`,
    prefix: copy.prefix,
    name: label(entry),
    suffix: copy.suffix,
    id: entry.meta.id,
  };
}

export interface FeaturedModel {
  mode: 'continue' | 'newcomer';
  label: string;
  button: string;
  id: string;
  name: string;
  accent: AccentTone;
  meta: string;
}

export interface CardModel {
  id: string;
  name: string;
  accent: AccentTone;
  pill: string;
  hasRecord: boolean;
}

export const REPO_URL = 'https://github.com/ntdaidai/onedaidai-arcade';

/**
 * Each footer part has one job: games is decoration, muted is a toggle (sound can be turned off
 * on the hub without entering a game to find SND), repoUrl is the exit (someone arriving from a
 * shared link has no other way to find the source). No star-count widget: it would load a
 * third-party script, and "Star 0" sells nothing.
 */
export interface FooterModel {
  games: string;
  muted: boolean;
  copyright: string;
  repoUrl: string;
}

export interface HubModel {
  featured: FeaturedModel;
  daily: DailyModel;
  hall: HallRow[];
  cards: CardModel[];
  footer: FooterModel;
}

interface LastPlayed { id: string; at: number }

/** Read the last-played record; anything malformed counts as never played */
function readLastPlayed(storage: ArcadeStorage): LastPlayed | null {
  const raw = storage.get<unknown>('lastPlayed', null);
  if (raw === null || typeof raw !== 'object') return null;
  const { id, at } = raw as Partial<LastPlayed>;
  if (typeof id !== 'string' || typeof at !== 'number' || !Number.isFinite(at)) return null;
  return GAMES.some((g) => g.meta.id === id) ? { id, at } : null;
}

export function buildFeatured(storage: ArcadeStorage, now: Date): FeaturedModel {
  const last = readLastPlayed(storage);
  if (last) {
    const index = GAMES.findIndex((g) => g.meta.id === last.id);
    const entry = GAMES[index];
    const best = bestOf(storage, entry.meta.id);
    const bestText = best === null ? '还没有记录' : `你的最高分 ${padScore(best)}`;
    return {
      mode: 'continue',
      label: '◆ 接着玩 ◆',
      button: '继续游戏',
      id: entry.meta.id,
      name: label(entry),
      accent: accentAt(index),
      meta: `${bestText} · 上次游玩：${relativeTime(last.at, now.getTime())}`,
    };
  }
  // With no history, pick one by date: stable within a day, different across days
  const index = hashDate(`${dateKey(now)}:new`) % GAMES.length;
  const entry = GAMES[index];
  return {
    mode: 'newcomer',
    label: '◆ 来玩一局？◆',
    button: '开始游戏',
    id: entry.meta.id,
    name: label(entry),
    accent: accentAt(index),
    meta: '还没有记录 · 等你来挑战',
  };
}

export function buildCards(storage: ArcadeStorage): CardModel[] {
  return GAMES.map((entry, index) => {
    const best = bestOf(storage, entry.meta.id);
    return {
      id: entry.meta.id,
      name: label(entry),
      accent: accentAt(index),
      pill: best === null ? '暂无记录' : `最高分 ${padScore(best)}`,
      hasRecord: best !== null,
    };
  });
}

export function buildHubModel(storage: ArcadeStorage, now: Date): HubModel {
  const muted = storage.get<boolean>('muted', false); // read the same way audio.ts does
  return {
    featured: buildFeatured(storage, now),
    daily: buildDaily(now),
    hall: buildHall(storage),
    cards: buildCards(storage),
    footer: {
      games: `${GAMES.length} 款游戏已就绪`,
      muted,
      copyright: '© 2026 呆呆游戏厅',
      repoUrl: REPO_URL,
    },
  };
}
