import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFhdaDegreeWorks } from '../adapters/fhda/degreeworks';
import { deanzaSjsuCs } from '../model/fixtures/deanza-sjsu-cs-2026-27';
import { alternatives, plan, planCourses, type Need } from './plan';

const text = readFileSync(new URL('../adapters/fhda/fixtures/sample-audit.txt', import.meta.url), 'utf8');
const audit = parseFhdaDegreeWorks(text);

test('alternatives expands AND/OR trees and drops what is taken', () => {
  const calc2 = deanzaSjsuCs.groups[1].articulations[1].sending;
  // with 1B done, bundles that need 1BH too are dropped (they're supersets)
  assert.deepEqual(alternatives(calc2, new Set(['MATH 1B'])), [['MATH 1C'], ['MATH 1CH']]);
  assert.deepEqual(alternatives({ kind: 'none' }, new Set()), []);
});

test('SJSU transfer plan: double counting, no GEOL, GE left as choices', () => {
  const r = plan(audit, deanzaSjsuCs);
  const codes = r.recommended.map((c) => c.code).sort();
  assert.deepEqual(codes, ['CIS 21JA', 'MATH 1D', 'MATH 22', 'MATH 2B', 'PHYS 4A', 'PHYS 4B']);

  const phys4a = r.recommended.find((c) => c.code === 'PHYS 4A')!;
  assert.equal(phys4a.countsFor.length, 4); // ADT + GE Area 5 (x2) + SJSU science
  assert.ok(!codes.some((c) => c.startsWith('GEOL')));

  assert.deepEqual(r.choices.map((c) => c.label.split(' — ')[0]), [
    'AREA 3 - ARTS AND HUMANITIES',
    'AREA 4 - SOCIAL AND BEHAVIORAL SCIENCES',
  ]);
  assert.ok(r.flags.some((f) => f.includes('US 1')));
});

test('a GE course cannot count toward two GE areas', () => {
  const r = plan(audit, deanzaSjsuCs);
  for (const c of r.recommended) {
    const areas = new Set(c.countsFor.filter((l) => l.startsWith('AREA')).map((l) => l.split(' — ')[0]));
    assert.ok(areas.size <= 1, `${c.code} counted in ${[...areas].join(', ')}`);
  }
});

test('ADT only (no transfer target)', () => {
  const codes = plan(audit).recommended.map((c) => c.code).sort();
  assert.deepEqual(codes, ['CIS 21JA', 'MATH 22', 'PHYS 4A', 'PHYS 4B']);
});

test('honors versions collapse to the regular course', () => {
  const need: Need = {
    id: 'x', label: 'Linear Algebra', source: 'assist', required: 1,
    items: [{ weight: 1, bundles: [['MATH 2BH'], ['MATH 2B']] }],
  };
  assert.deepEqual(planCourses([need], new Set()).recommended.map((c) => c.code), ['MATH 2B']);
});
