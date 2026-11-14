import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFhdaDegreeWorks } from '../adapters/fhda/degreeworks';
import { deanzaSjsuCs } from '../model/fixtures/deanza-sjsu-cs-2026-27';
import { alternatives, buildPlan } from './needs';

const audit = parseFhdaDegreeWorks(
  readFileSync(new URL('../adapters/fhda/fixtures/sample-audit.txt', import.meta.url), 'utf8'),
);
const codes = (p: ReturnType<typeof buildPlan>) => p.courses.map((c) => c.code).sort();

test('alternatives expands AND/OR trees and skips taken courses', () => {
  const calc3 = deanzaSjsuCs.groups[1].articulations[4].sending;
  const alts = alternatives(calc3, new Set(['MATH 1C']));
  assert.deepEqual(alts[0], ['MATH 1D']);
  assert.equal(alternatives({ kind: 'none' }, new Set()).length, 0);
});

test('transfer plan: audit + SJSU combined, double counting preferred', () => {
  const plan = buildPlan(audit, deanzaSjsuCs);
  assert.deepEqual(codes(plan), ['CIS 21JA', 'MATH 1D', 'MATH 22', 'MATH 2B', 'PHYS 4A', 'PHYS 4B']);

  // PHYS 4A covers the ADT, GE Area 5 (physical + lab), and SJSU science electives
  const phys = plan.courses.find((c) => c.code === 'PHYS 4A')!;
  assert.equal(phys.countsFor.length, 4);
  // no geology picked: physics already fills the 8 science units
  assert.ok(!plan.courses.some((c) => c.code.startsWith('GEOL')));
});

test('open GE choices stay open and exclude classes already taken', () => {
  const plan = buildPlan(audit, deanzaSjsuCs);
  const labels = plan.choices.map((c) => c.label).sort();
  assert.deepEqual(labels, ['Arts & Humanities', 'Social & Behavioral Sciences']);

  const arts = plan.choices.find((c) => c.label === 'Arts & Humanities')!;
  assert.ok(!arts.options.includes('ARTS 1A')); // already taken
  assert.ok(!arts.options.includes('HUMI 1'));

  const social = plan.choices.find((c) => c.label === 'Social & Behavioral Sciences')!;
  assert.match(social.notes ?? '', /different disciplines/);
});

test('ADT-only plan (no transfer agreement)', () => {
  const plan = buildPlan(audit);
  assert.deepEqual(codes(plan), ['CIS 21JA', 'MATH 22', 'PHYS 4A', 'PHYS 4B']);
  assert.equal(plan.choices.length, 2);
});

test('notes carry units left and transfer rules', () => {
  const plan = buildPlan(audit, deanzaSjsuCs);
  assert.ok(plan.notes.some((n) => n.includes('11.5 more units')));
  assert.ok(plan.notes.some((n) => n.includes('American Institutions')));
});
