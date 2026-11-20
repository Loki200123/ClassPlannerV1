// Browser-only storage until accounts (Supabase) exist.
// Stores only parsed data — never the PDFs, name, student ID, or GPA.
import type { TimeBlock, TransferAgreement } from '../model/types';
import type { ParsedAudit } from '../adapters/fhda/degreeworks';

export type GoalChoice = 'associate' | 'transfer';

export interface TransferTarget {
  id: string;
  university: string;
  agreement: TransferAgreement | null;
  fileName?: string;
  warnings: string[];
}

export interface SavedState {
  version: 2;
  collegeId: string;
  audit: ParsedAudit | null;
  /** User chose to continue without a DegreeWorks audit. */
  skipAudit: boolean;
  goal: GoalChoice | null;
  targets: TransferTarget[];
  /** "Plan my classes for next term?" null = not answered yet. */
  planNextTerm: boolean | null;
  blocks: TimeBlock[];
  commuteBufferMinutes: number;
  allowOnlineAsync: boolean;
}

export const newTarget = (): TransferTarget => ({
  id: Math.random().toString(36).slice(2, 10),
  university: '',
  agreement: null,
  warnings: [],
});

export const EMPTY_STATE: SavedState = {
  version: 2,
  collegeId: 'deanza',
  audit: null,
  skipAudit: false,
  goal: null,
  targets: [],
  planNextTerm: null,
  blocks: [],
  commuteBufferMinutes: 30,
  allowOnlineAsync: true,
};

const KEY = 'class-planner:v2';
const OLD_KEY = 'class-planner:v1';

export function loadState(): SavedState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedState;
      if (parsed.version === 2) return { ...EMPTY_STATE, ...parsed };
    }
    // keep the audit and free time from the first version
    const old = window.localStorage.getItem(OLD_KEY);
    if (old) {
      const v1 = JSON.parse(old);
      return {
        ...EMPTY_STATE,
        audit: v1.audit ?? null,
        blocks: v1.blocks ?? [],
        commuteBufferMinutes: v1.commuteBufferMinutes ?? 30,
        allowOnlineAsync: v1.allowOnlineAsync ?? true,
      };
    }
  } catch {
    /* fall through */
  }
  return EMPTY_STATE;
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
    window.localStorage.removeItem(OLD_KEY);
  } catch {
    /* ignore */
  }
}
