import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NotAnAuditError, parseFhdaDegreeWorks, parseOptionList } from './degreeworks';
import { evaluateAgreement } from '../../model/requirements';
import { deanzaSjsuCs } from '../../model/fixtures/deanza-sjsu-cs-2026-27';

// Anonymized text of a real De Anza audit (name, ID, GPA and grades replaced).
const text = readFileSync(new URL('./fixtures/sample-audit.txt', import.meta.url), 'utf8');
const audit = parseFhdaDegreeWorks(text);
const find = (label: string) => audit.requirements.find((r) => r.label === label);
const course = (code: string, term?: string) =>
  audit.courses.find((c) => c.code === code && (!term || c.term === term));

test('header fields', () => {
  assert.equal(audit.auditDate, '2026-10-18');
  assert.equal(audit.catalogYear, '2024-2025');
  assert.equal(audit.degree, 'DA - AS Transfer Degree');
});

test('never outputs name, student ID, or GPA', () => {
  const json = JSON.stringify(audit);
  for (const secret of ['Student, Sample', '00000000', 'GPA', 'Student ID']) {
    assert.ok(!json.includes(secret), `leaked: ${secret}`);
  }
});

test('courses: statuses, codes, campus, units', () => {
  assert.equal(audit.courses.length, 19);
  assert.equal(course('MATH 1C')?.status, 'in_progress');
  assert.equal(course('MATH 1C')?.grade, null);
  assert.equal(course('COMM C1000', '2026 Summer')?.status, 'withdrawn');
  assert.equal(course('COMM C1000', '2026 Fall')?.status, 'in_progress');
  assert.equal(course('ESL 272')?.status, 'not_counted');
  assert.equal(course('CIS 22A')?.units, 4.5);
  assert.equal(course('ENGL C1001')?.campus, 'deanza'); // campus from wrapped "De Anza" line
  // a course listed in two places shows up once
  assert.equal(audit.courses.filter((c) => c.code === 'MATH 1C').length, 1);
});

test('block statuses + units still needed', () => {
  assert.equal(find('AREA 2 - MATH CONCEPTS & QUANTITATIVE REASONING')?.status, 'complete');
  assert.equal(find('AREA 1 - ENGLISH COMMUNICATION')?.status, 'in_progress');
  assert.equal(find('AREA 3 - ARTS AND HUMANITIES')?.unitsNeeded, 4);
  assert.equal(find('Degree - Associate in Science Transfer')?.unitsNeeded, 11.5);
  assert.match(find('AREA 4 - SOCIAL AND BEHAVIORAL SCIENCES')?.notes ?? '', /two different disciplines/);
  assert.equal(find('IGETC CSU DA')?.notes, undefined);
});

test('still-needed lists, including label printed after the list', () => {
  const arts = find('Arts & Humanities')!;
  assert.equal(arts.block, 'AREA 3 - ARTS AND HUMANITIES');
  assert.equal(arts.classesNeeded, 1);
  assert.ok(arts.options.includes('ELIT 46AH'));
  assert.ok(arts.options.includes('WMST 49')); // last item, after a page break

  const social = find('Social & Behavioral Sciences')!;
  assert.ok(social.options.includes('ECON C2002H')); // common course number keeps its C
  assert.ok(social.options.includes('PSYC C1000'));

  assert.deepEqual(find('Discrete Mathematics')?.options, ['MATH 22', 'MATH 22H']);
  assert.deepEqual(find('Intro to X86 Processor Assembly Language')?.options, ['CIS 21JA']);
  assert.ok(find('Physical Sciences')?.options.includes('PHYS 4A'));
  assert.ok(find('Science Laboratory Courses')?.options.includes('PHYS 4A'));
});

test('option list parsing carries the subject forward', () => {
  assert.deepEqual(parseOptionList('MATH D022. or D022H'), ['MATH 22', 'MATH 22H']);
  assert.deepEqual(parseOptionList('or D004. or D005. Except @ @ with attribute = 1GE4'), []);
});

test('rejects files that are not FHDA audits', () => {
  assert.throws(() => parseFhdaDegreeWorks('some random pdf text'), NotAnAuditError);
});

test('end to end: parsed audit -> SJSU agreement', () => {
  const taken = new Set(
    audit.courses.filter((c) => c.status === 'completed' || c.status === 'in_progress').map((c) => c.code),
  );
  const result = evaluateAgreement(deanzaSjsuCs, taken);
  for (const code of ['MATH 22', 'MATH 2B', 'MATH 1D', 'CIS 21JA']) {
    assert.ok(result.allNeeded.includes(code), code);
  }
});
