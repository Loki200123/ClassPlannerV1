// Browser-only storage until accounts (Supabase) exist.
// Stores only parsed data — never the PDF, name, student ID, or GPA.
import type { TimeBlock } from '../model/types';
import type { ParsedAudit } from '../adapters/fhda/degreeworks';

export type GoalChoice = 'adt' | 'sjsu-cs';

export interface SavedState {
  version: 1;
  collegeId: string;
  goal: GoalChoice;
  audit: ParsedAudit | null;
  blocks: TimeBlock[];
  commuteBufferMinutes: number;
  allowOnlineAsync: boolean;
}

export const EMPTY_STATE: SavedState = {
  version: 1,
  collegeId: 'deanza',
  goal: 'sjsu-cs',
  audit: null,
  blocks: [],
  commuteBufferMinutes: 30,
  allowOnlineAsync: true,
};

const KEY = 'class-planner:v1';

export function loadState(): SavedState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as SavedState;
    return parsed.version === 1 ? { ...EMPTY_STATE, ...parsed } : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: SavedState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private mode / storage full: the app still works, it just won't remember
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
