import type { GameContext } from '../core/game';
import { DIFF_LABEL } from '../core/format';

/**
 * The difficulty-menu overlay. Mid-game it offers a way back to the current board — hitting ☰
 * by accident should not force you to abandon it. The returned open() serves both
 * ctx.onTool('menu', …) and the initial mount.
 */
export function difficultyMenu<D extends { id: 'easy' | 'medium' | 'hard' }>(opts: {
  ctx: GameContext;
  difficulties: D[];
  /** Whether a game is in progress (decides whether ✕ RESUME is rendered) */
  resumable: () => boolean;
  onPick: (d: D) => void;
}): { open: () => void } {
  const open = (): void => {
    const resumable = opts.resumable();
    opts.ctx.overlay({
      title: '选择难度',
      tone: 'win',
      lines: [],
      actions: [
        ...(resumable
          ? [{ label: '✕ 继续游戏', kind: 'secondary' as const, onPress: () => opts.ctx.overlay(null) }]
          : []),
        ...opts.difficulties.map((d) => ({
          label: DIFF_LABEL[d.id],
          kind: 'secondary' as const,
          onPress: () => opts.onPick(d),
        })),
      ],
      hints: [resumable ? '继续游戏或选择难度' : '选择难度开始游戏'],
    });
  };
  return { open };
}
