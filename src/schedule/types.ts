import type { Season, Section } from '../model/types';

/** One imported term for one college (what the website downloads). */
export interface ScheduleFile {
  version: 1;
  collegeId: string;
  term: ScheduleTerm;
  fetchedAt: string;
  sections: Section[];
}

export interface ScheduleTerm {
  /** The college system's own term code, e.g. Banner "202732". */
  code: string;
  label: string; // "Winter 2027"
  season: Season;
  year: number;
}

/** Lists every imported term. */
export interface ScheduleIndex {
  version: 1;
  updatedAt: string;
  terms: (ScheduleTerm & { collegeId: string; file: string; sections: number; fetchedAt: string })[];
}
