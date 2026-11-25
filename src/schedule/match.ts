// Matches plan classes to real sections and the student's free time.
import { sectionFits } from '../model/availability';
import type { Availability, CourseCode, Section } from '../model/types';

export interface CourseSections {
  code: CourseCode;
  title: string;
  /** Sections that fit the free time, best first (open seats, then waitlist, then full). */
  fits: Section[];
  /** Offered this term but at times that don't fit. */
  other: Section[];
}

const SEAT_RANK = { open: 0, waitlist: 1, full: 2, cancelled: 3 } as const;

export function rankSections(a: Section, b: Section): number {
  const sa = SEAT_RANK[a.seats?.status ?? 'open'];
  const sb = SEAT_RANK[b.seats?.status ?? 'open'];
  if (sa !== sb) return sa - sb;
  // more open seats first, then earlier start
  const oa = (a.seats?.capacity ?? 0) - (a.seats?.enrolled ?? 0);
  const ob = (b.seats?.capacity ?? 0) - (b.seats?.enrolled ?? 0);
  if (oa !== ob) return ob - oa;
  return (a.meetings[0]?.start ?? 9999) - (b.meetings[0]?.start ?? 9999);
}

export function sectionsFor(code: CourseCode, all: Section[], avail: Availability): CourseSections {
  const mine = all.filter((s) => s.courseCode === code && s.seats?.status !== 'cancelled');
  const fits = mine.filter((s) => sectionFits(s, avail)).sort(rankSections);
  const other = mine.filter((s) => !fits.includes(s)).sort(rankSections);
  return { code, title: mine[0]?.title ?? '', fits, other };
}

/** For a "pick one" choice: options offered this term with a section that fits, best first. */
export function rankChoiceOptions(options: CourseCode[], all: Section[], avail: Availability, limit = 6): CourseSections[] {
  return options
    .map((code) => sectionsFor(code, all, avail))
    .filter((c) => c.fits.length > 0)
    .sort((a, b) => rankSections(a.fits[0], b.fits[0]) || b.fits.length - a.fits.length)
    .slice(0, limit);
}
