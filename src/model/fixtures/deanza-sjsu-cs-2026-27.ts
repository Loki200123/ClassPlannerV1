// De Anza College -> San Jose State University, Computer Science B.S., 2026-2027
// Hand-encoded from the ASSIST agreement (published 8/14/26).
import type { ReqExpr, TransferAgreement } from '../types';

const c = (code: string): ReqExpr => ({ kind: 'course', code });
const any = (...items: ReqExpr[]): ReqExpr => ({ kind: 'any', items });
/** Sequence that must be completed at the same institution before transfer. */
const seq = (...codes: string[]): ReqExpr => ({
  kind: 'all',
  items: codes.map(c),
  sameInstitution: true,
});

const sem = (value: number) => ({ value, system: 'semester' as const });

const biolSeries = any(
  seq('BIOL 6A', 'BIOL 6B', 'BIOL 6C'),
  seq('BIOL 6A', 'BIOL 6B', 'BIOL 6CH'),
  seq('BIOL 6AH', 'BIOL 6B', 'BIOL 6C'),
  seq('BIOL 6AH', 'BIOL 6B', 'BIOL 6CH'),
);

export const deanzaSjsuCs: TransferAgreement = {
  id: 'deanza-sjsu-cs-bs-2026-2027',
  fromCollegeId: 'deanza',
  toInstitution: 'San Jose State University',
  major: 'Computer Science, B.S.',
  academicYear: '2026-2027',
  minGrade: 'C-',
  groups: [
    {
      title: 'Second Course in English Composition',
      rule: { kind: 'count', n: 1 },
      note: 'Grade of C or better recommended (C- not accepted for 100W prep).',
      articulations: [
        {
          receiving: { code: 'ENGL 1B', title: 'Argument and Analysis', units: sem(3) },
          sending: any(c('ENGL C1003'), c('ENGL C1003H'), c('ESL 6')),
        },
        {
          receiving: { code: 'ENGL 2', title: 'Critical Thinking and Writing', units: sem(3) },
          sending: any(c('ENGL C1001'), c('ENGL C1001H'), c('PHIL 3'), c('COMM 9'), c('COMM 9H')),
        },
      ],
    },
    {
      title: 'Preparation for the Major',
      rule: { kind: 'all' },
      articulations: [
        {
          receiving: { code: 'MATH 30', title: 'Calculus I', units: sem(3) },
          sending: any(c('MATH 1A'), c('MATH 1AH')),
        },
        {
          receiving: { code: 'MATH 31', title: 'Calculus II', units: sem(4) },
          sending: any(
            seq('MATH 1B', 'MATH 1C'),
            seq('MATH 1BH', 'MATH 1CH'),
            seq('MATH 1BH', 'MATH 1C'),
            seq('MATH 1B', 'MATH 1CH'),
          ),
        },
        {
          receiving: { code: 'MATH 42', title: 'Discrete Mathematics', units: sem(3) },
          sending: any(c('MATH 22'), c('MATH 22H')),
        },
        {
          receiving: { code: 'MATH 39', title: 'Linear Algebra I', units: sem(3) },
          sending: any(c('MATH 2B'), c('MATH 2BH')),
        },
        {
          receiving: { code: 'MATH 32', title: 'Calculus III', units: sem(3) },
          sending: any(
            seq('MATH 1C', 'MATH 1D'),
            seq('MATH 1CH', 'MATH 1D'),
            seq('MATH 1C', 'MATH 1DH'),
            seq('MATH 1CH', 'MATH 1DH'),
          ),
        },
      ],
    },
    {
      title: 'Science Electives',
      rule: { kind: 'units', min: 8, system: 'semester' },
      note: 'At least 6 of the 8 semester units must come from this list; the rest may be GE Areas 5A/5B/5C.',
      articulations: [
        { receiving: { code: 'BIOL 30', title: 'Principles of Biology I', units: sem(4) }, sending: biolSeries },
        { receiving: { code: 'BIOL 31', title: 'Principles of Biology II', units: sem(4) }, sending: biolSeries },
        {
          receiving: { code: 'CHEM 1A', title: 'General Chemistry', units: sem(5) },
          sending: any(seq('CHEM 1A', 'CHEM 1B'), seq('CHEM 1AH', 'CHEM 1BH')),
        },
        { receiving: { code: 'GEOL 1', title: 'General Geology', units: sem(4) }, sending: c('GEOL 10') },
        { receiving: { code: 'GEOL 4L', title: 'Earth Systems Lab', units: sem(1) }, sending: { kind: 'none' } },
        { receiving: { code: 'GEOL 7', title: 'Earth, Time and Life', units: sem(4) }, sending: c('GEOL 11') },
        { receiving: { code: 'METR 10', title: 'Weather and Climate', units: sem(3) }, sending: c('MET 10') },
        { receiving: { code: 'PHYS 50', title: 'General Physics I: Mechanics', units: sem(4) }, sending: c('PHYS 4A') },
        { receiving: { code: 'PHYS 51', title: 'General Physics II: Electricity and Magnetism', units: sem(4) }, sending: c('PHYS 4B') },
      ],
    },
    {
      title: 'Lower Division Major Requirements',
      rule: { kind: 'all' },
      articulations: [
        {
          receiving: { code: 'CS 46A', title: 'Introduction to Programming', units: sem(4) },
          sending: any(
            c('CIS 35A'),
            seq('CIS 22A', 'CIS 22B'),
            seq('CIS 22A', 'CIS 22BH'),
            seq('CIS 36A', 'CIS 36B'),
            c('CIS 27'),
          ),
        },
        {
          receiving: { code: 'CS 46B', title: 'Introduction to Data Structures', units: sem(4) },
          sending: any(c('CIS 22C'), c('CIS 22CH')),
        },
        {
          receiving: { code: 'CS 47', title: 'Introduction to Computer Systems', units: sem(3) },
          sending: c('CIS 21JA'),
        },
      ],
    },
    {
      title: 'Computer Science Electives',
      rule: { kind: 'count', n: 1 },
      articulations: [
        {
          receiving: { code: 'CS 49C', title: 'Programming in C', units: sem(3) },
          sending: any(c('CIS 26A'), seq('CIS 22A', 'CIS 22B'), seq('CIS 22A', 'CIS 22BH')),
        },
        {
          receiving: { code: 'CS 49J', title: 'Programming in Java', units: sem(3) },
          sending: c('CIS 35A'),
        },
      ],
    },
  ],
  notes: [
    'At least 60 transferable semester units (90 quarter) required, including the CSU basic skills courses.',
    'Complete CSU GE; many major courses double count.',
    'American Institutions (US 1, US 2, US 3) must be completed.',
    'Major courses must be taken for a letter grade (not Credit/No Credit), C- or better.',
    'SJSU requires 2 units of PE after transfer unless the major has a waiver.',
  ],
};
