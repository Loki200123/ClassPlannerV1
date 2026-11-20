import type { Minutes, TimeBlock, Weekday } from '../model/types';

export const DAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "08:30" -> 510 */
export function toMinutes(hhmm: string): Minutes {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 510 -> "08:30" (for <input type="time">) */
export function toHHMM(min: Minutes): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 510 -> "8:30 am", 900 -> "3 pm" */
export function formatTime(min: Minutes): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h = h24 % 12 || 12;
  const suffix = h24 < 12 || h24 === 24 ? 'am' : 'pm';
  return m ? `${h}:${String(m).padStart(2, '0')} ${suffix}` : `${h} ${suffix}`;
}

export type BlockProblem = 'end-before-start' | 'overlap' | null;

export function blockProblem(block: TimeBlock, others: TimeBlock[]): BlockProblem {
  if (block.end <= block.start) return 'end-before-start';
  const clash = others.some((o) => o !== block && o.day === block.day && o.start < block.end && block.start < o.end);
  return clash ? 'overlap' : null;
}

/** Total free hours per week, overlapping blocks counted once. */
export function freeHours(blocks: TimeBlock[]): number {
  let total = 0;
  for (const day of DAYS) {
    const ranges = blocks
      .filter((b) => b.day === day && b.end > b.start)
      .map((b) => [b.start, b.end] as const)
      .sort((a, b) => a[0] - b[0]);
    let curEnd = -1;
    for (const [s, e] of ranges) {
      if (s >= curEnd) total += e - s;
      else if (e > curEnd) total += e - curEnd;
      curEnd = Math.max(curEnd, e);
    }
  }
  return total / 60;
}
