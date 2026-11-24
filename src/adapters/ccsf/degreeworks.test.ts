import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCcsfCode, parseCcsfDegreeWorks, parseCcsfOptionList } from './degreeworks';
import { WrongCollegeAuditError, detectAuditDistrict, parseDegreeWorks } from '../degreeworks';
import { plan } from '../../planner/plan';

// Anonymized text of a real CCSF audit (name and student ID replaced).
const text = readFileSync(new URL('./fixtures/sample-audit.txt', import.meta.url), 'utf8');
const audit = parseCcsfDegreeWorks(text);
const req = (label: string) => audit.requirements.find((r) => r.label === label)!;

test('CCSF codes: underscore padding removed, C numbers kept', () => {
  const cases: [string, string | undefined, string][] = [
    ['PHYC __4A', undefined, 'PHYC 4A'],
    ['MATH _90S', undefined, 'MATH 90S'],
    ['ENGN _10A', undefined, 'ENGN 10A'],
    ['MATH 110A', undefined, 'MATH 110A'],
    ['ENGL C1000', undefined, 'ENGL C1000'],
    ['__1B', 'AMSL', 'AMSL 1B'],
    ['O_H _76', undefined, 'O_H 76'],
  ];
  for (const [raw, subj, code] of cases) assert.equal(normalizeCcsfCode(raw, subj)?.code, code, raw);
  assert.deepEqual(parseCcsfOptionList('COMM C1000 or __2 or CNIT 131 or ENGL C1001 or C1003'), [
    'COMM C1000', 'COMM 2', 'CNIT 131', 'ENGL C1001', 'ENGL C1003',
  ]);
});

test('header + courses', () => {
  assert.equal(audit.districtId, 'ccsf');
  assert.equal(audit.auditDate, '2026-11-06');
  assert.equal(audit.catalogYear, '2026-2027');
  assert.equal(audit.degree, 'Engineering AS');
  assert.deepEqual(audit.courses.map((c) => `${c.code} ${c.status} ${c.term}`).sort(), [
    'HIST C1001 in_progress 2026 Fall',
    'MATH 90 in_progress 2026 Fall',
    'MATH 90S in_progress 2026 Fall',
  ]);
});

test('never outputs name, student ID, or GPA', () => {
  const json = JSON.stringify(audit);
  for (const secret of ['Student, Sample', 'XX0000000', 'GPA', 'Preferred Name']) {
    assert.ok(!json.includes(secret), `leaked: ${secret}`);
  }
});

test('GE areas: lists end in the right place, labels after lists, wrapped labels', () => {
  assert.deepEqual(req('Area 1A: English Composition').options, ['ENGL C1000']);
  const oral = req('Area 1B: Oral Communication and Critical Thinking');
  assert.equal(oral.unitsNeeded, 3);
  assert.ok(oral.options.includes('COMM C1000') && oral.options.includes('SPAN 42'));

  const social = req('AREA 4: Social and Behavioral Sciences');
  assert.equal(social.options.at(-1), 'WGST 54');
  assert.ok(social.options.includes('HLTH 231') && social.options.includes('LBCS 114'));
  const science = req('AREA 5: Natural Sciences');
  assert.equal(science.options[0], 'ANTH 1');
  assert.equal(science.options.at(-1), 'PSYC 50');
  assert.ok(science.options.includes('BIO 119') && !science.options.includes('AFAM 30'));
  assert.equal(req('AREA 6: Ethnic Studies').options.at(-1), 'NAIS 39');
  // Areas 2 and 3 are covered by classes in progress, so nothing is still needed there
  assert.ok(!audit.requirements.some((r) => /^AREA [23]:/.test(r.block) && r.options.length));
});

test('major requirements and units left', () => {
  const major = audit.requirements.filter((r) => r.block === 'Engineering, AS' && r.options.length);
  assert.equal(major.length, 16);
  assert.deepEqual(req('Calculus I').options, ['MATH 110A']);
  assert.deepEqual(req('Mech Lab For Sci & Eng').options, ['PHYC 4AL']);
  assert.equal(req('Engineering').unitsNeeded, 52);
  assert.equal(req('Engineering, AS').unitsNeeded, 47);
});

test('planner works on a CCSF audit', () => {
  const r = plan(audit);
  assert.ok(r.recommended.some((c) => c.code === 'MATH 110A'));
  assert.ok(r.recommended.some((c) => c.code === 'ENGL C1000'));
  assert.ok(r.choices.some((c) => /AREA 4/.test(c.label)));
});

test('dispatcher: detects the district and rejects the wrong college', () => {
  assert.equal(detectAuditDistrict(text), 'ccsf');
  const deAnza = readFileSync(new URL('../fhda/fixtures/sample-audit.txt', import.meta.url), 'utf8');
  assert.equal(detectAuditDistrict(deAnza), 'fhda');
  assert.throws(() => parseDegreeWorks(text, 'fhda'), WrongCollegeAuditError);
  assert.throws(() => parseDegreeWorks(deAnza, 'ccsf'), WrongCollegeAuditError);
  assert.equal(parseDegreeWorks(text, 'ccsf').degree, 'Engineering AS');
});
