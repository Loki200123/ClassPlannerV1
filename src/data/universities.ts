// Universities on ASSIST, de-duplicated (old names folded into current ones).
// `aliases` are other names an ASSIST PDF may print on its "To:" line.

export interface University {
  name: string;
  system: 'CSU' | 'UC' | 'Independent';
  aliases?: string[];
}

export const UNIVERSITIES: University[] = [
  // California State University
  { name: 'California State University, Maritime Academy', system: 'CSU', aliases: ['California Maritime Academy'] },
  { name: 'California Polytechnic University, Humboldt', system: 'CSU', aliases: ['Humboldt State University', 'California State Polytechnic University, Humboldt'] },
  { name: 'California Polytechnic University, Pomona', system: 'CSU', aliases: ['California State Polytechnic University, Pomona'] },
  { name: 'California Polytechnic University, San Luis Obispo', system: 'CSU', aliases: ['California Polytechnic State University, San Luis Obispo'] },
  { name: 'California State University, Bakersfield', system: 'CSU' },
  { name: 'California State University, Channel Islands', system: 'CSU' },
  { name: 'California State University, Chico', system: 'CSU' },
  { name: 'California State University, Dominguez Hills', system: 'CSU' },
  { name: 'California State University, East Bay', system: 'CSU', aliases: ['California State University, Hayward'] },
  { name: 'California State University, Fresno', system: 'CSU' },
  { name: 'California State University, Fullerton', system: 'CSU' },
  { name: 'California State University, Long Beach', system: 'CSU' },
  { name: 'California State University, Los Angeles', system: 'CSU' },
  { name: 'California State University, Monterey Bay', system: 'CSU' },
  { name: 'California State University, Northridge', system: 'CSU' },
  { name: 'California State University, Sacramento', system: 'CSU' },
  { name: 'California State University, San Bernardino', system: 'CSU' },
  { name: 'California State University, San Marcos', system: 'CSU' },
  { name: 'California State University, Stanislaus', system: 'CSU' },
  { name: 'San Diego State University', system: 'CSU' },
  { name: 'San Francisco State University', system: 'CSU' },
  { name: 'San Jose State University', system: 'CSU', aliases: ['San José State University'] },
  { name: 'Sonoma State University', system: 'CSU' },
  // University of California
  { name: 'University of California, Berkeley', system: 'UC' },
  { name: 'University of California, Davis', system: 'UC' },
  { name: 'University of California, Irvine', system: 'UC' },
  { name: 'University of California, Los Angeles', system: 'UC' },
  { name: 'University of California, Merced', system: 'UC' },
  { name: 'University of California, Riverside', system: 'UC' },
  { name: 'University of California, San Diego', system: 'UC' },
  { name: 'University of California, Santa Barbara', system: 'UC' },
  { name: 'University of California, Santa Cruz', system: 'UC' },
  // Independent (AICCU)
  { name: 'Azusa Pacific University', system: 'Independent' },
  { name: 'California Lutheran University', system: 'Independent' },
  { name: 'Dominican University of California', system: 'Independent' },
  { name: 'EDvance College', system: 'Independent' },
  { name: 'Fresno Pacific University', system: 'Independent' },
  { name: 'Loyola Marymount University', system: 'Independent' },
  { name: 'Menlo College', system: 'Independent' },
  { name: 'National University', system: 'Independent' },
  { name: 'Palo Alto University', system: 'Independent' },
  { name: 'Pepperdine University', system: 'Independent' },
  { name: 'Santa Clara University', system: 'Independent' },
  { name: 'Simpson University', system: 'Independent' },
  { name: 'Touro University Worldwide', system: 'Independent' },
  { name: 'University of La Verne', system: 'Independent' },
  { name: 'University of Redlands', system: 'Independent' },
];

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Does the name printed on an ASSIST PDF refer to this university? */
export function sameUniversity(picked: string, printed: string): boolean {
  const u = UNIVERSITIES.find((x) => x.name === picked);
  const names = [picked, ...(u?.aliases ?? [])].map(norm);
  return names.includes(norm(printed));
}

/** Map a name printed on an ASSIST PDF to our list (or null if unknown). */
export function findUniversity(printed: string): University | null {
  return UNIVERSITIES.find((u) => sameUniversity(u.name, printed)) ?? null;
}
