import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PositionedItem } from '../../pdf/pdf-text';
import type { ReqExpr, TransferAgreement } from '../../model/types';
import { deanzaSjsuCs } from '../../model/fixtures/deanza-sjsu-cs-2026-27';
import { parseFhdaDegreeWorks } from '../fhda/degreeworks';
import { plan } from '../../planner/plan';
import { ImageOnlyPdfError, NotAssistError, parseAssist } from './parse';

// Positioned text of real ASSIST PDFs (2026-27, saved with Chrome "Save as PDF").
const load = (name: string): PositionedItem[] =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const sjsuCs = parseAssist(load('deanza-sjsu-cs'));
const sjsuCmpe = parseAssist(load('deanza-sjsu-cmpe'));
const ucla = parseAssist(load('deanza-ucla-cse'));
const ucsd = parseAssist(load('deanza-ucsd-cs'));

const audit = parseFhdaDegreeWorks(
  readFileSync(new URL('../fhda/fixtures/sample-audit.txt', import.meta.url), 'utf8'),
);

/** Compact text form of a requirement tree, for readable assertions. */
const show = (e: ReqExpr): string =>
  e.kind === 'course' ? e.code
  : e.kind === 'none' ? 'none'
  : e.kind === 'any' ? `(${e.items.map(show).join(' | ')})`
  : `[${e.items.map(show).join(' & ')}]`;

const find = (a: TransferAgreement, code: string) =>
  a.groups.flatMap((g) => g.articulations).find((x) => x.receiving.code === code)!;

test('header: university, college, major, year', () => {
  assert.equal(sjsuCmpe.agreement.toInstitution, 'San Jose State University');
  assert.equal(sjsuCmpe.fromCollege, 'De Anza College');
  assert.equal(sjsuCmpe.agreement.major, 'Engineering - Computer Engineering, B.S.');
  assert.equal(sjsuCmpe.agreement.academicYear, '2026-2027');
  assert.equal(ucla.agreement.toInstitution, 'University of California, Los Angeles');
  assert.equal(find(ucla.agreement, 'MATH 31A').receiving.units.system, 'quarter');
  for (const r of [sjsuCs, sjsuCmpe, ucla, ucsd]) assert.deepEqual(r.warnings, []);
});

test('SJSU CS: reader matches the hand-typed agreement', () => {
  const plain = (a: TransferAgreement) =>
    a.groups.map((g) => ({
      rule: g.rule,
      arts: g.articulations.map((x) => `${x.receiving.code} <- ${show(x.sending)}`),
    }));
  assert.deepEqual(plain(sjsuCs.agreement), plain(deanzaSjsuCs));
});

test('SJSU CS: same plan from the reader as from the hand-typed version', () => {
  const a = plan(audit, sjsuCs.agreement);
  const b = plan(audit, deanzaSjsuCs);
  assert.deepEqual(a.recommended.map((c) => c.code).sort(), b.recommended.map((c) => c.code).sort());
});

test('SJSU CompE: sequences, bundles, optional group', () => {
  assert.equal(show(find(sjsuCmpe.agreement, 'MATH 33LA').sending), '([MATH 2A & MATH 2B] | [MATH 2AH & MATH 2BH])');
  const cmpe50 = find(sjsuCmpe.agreement, 'CMPE 50').sending;
  assert.match(show(cmpe50), /\[CIS 36A & CIS 36B & CIS 22CH\]/);
  const extra = sjsuCmpe.agreement.groups.find((g) => /Additional/.test(g.title))!;
  assert.equal(extra.optional, true);
  assert.equal(find(sjsuCmpe.agreement, 'PHYS 51').receiving.title, 'General Physics II: Electricity and Magnetism');
});

test('UCLA: university-side bundle, nested boxes, A/B sections, no articulation', () => {
  const physics = ucla.agreement.groups.flatMap((g) => g.articulations).find((x) => x.receiving.code.startsWith('PHYSICS 1A'))!;
  assert.equal(physics.receiving.code, 'PHYSICS 1A + PHYSICS 1B + PHYSICS 1C + PHYSICS 4AL + PHYSICS 4BL');
  assert.equal(show(physics.sending), '[PHYS 4A & PHYS 4B & PHYS 4C]');

  assert.equal(
    show(find(ucla.agreement, 'COM SCI 32').sending),
    '[(CIS 22C | CIS 22CH) & (CIS 22A | CIS 22B | CIS 22BH | CIS 29)]',
  );
  const comp = ucla.agreement.groups.filter((g) => /\((A|B)\)$/.test(g.title));
  assert.deepEqual(comp.map((g) => g.rule), [{ kind: 'count', n: 1 }, { kind: 'count', n: 1 }]);
  assert.equal(find(ucla.agreement, 'COM SCI 35L').sending.kind, 'none');
  assert.ok(find(ucla.agreement, 'Computer programming courses: C++ preferred'));
});

test('UCSD: "Select 1 course" pools sections; groups with no rule are required', () => {
  const sci = ucsd.agreement.groups.find((g) => g.articulations.some((x) => x.receiving.code === 'BILD 1'))!;
  assert.deepEqual(sci.rule, { kind: 'count', n: 1 });
  assert.equal(sci.articulations.length, 9);
  assert.deepEqual(ucsd.agreement.groups.find((g) => g.articulations.some((x) => x.receiving.code === 'CSE 12'))!.rule, { kind: 'all' });
  assert.equal(show(find(ucsd.agreement, 'MATH 20C').sending), '([MATH 1C & MATH 1D] | [MATH 1CH & MATH 1DH])');
});

test('several targets at once: shared classes count for each, labels name the target', () => {
  const r = plan(audit, [sjsuCs.agreement, sjsuCmpe.agreement, ucla.agreement]);
  const math22 = r.recommended.find((c) => c.code === 'MATH 22')!;
  for (const t of ['SJSU Computer Science', 'SJSU Computer Engineering', 'UCLA']) {
    assert.ok(math22.countsFor.some((l) => l.startsWith(t)), `MATH 22 should count for ${t}`);
  }
  assert.ok(r.blocked.some((b) => b.startsWith('UCLA COM SCI 35L')));
  assert.ok(r.recommendedOnly?.length === 0 || r.recommendedOnly!.every((x) => x.startsWith('SJSU')));
});

test('rejects image-only and non-ASSIST PDFs', () => {
  assert.throws(() => parseAssist([]), ImageOnlyPdfError);
  assert.throws(
    () => parseAssist([{ page: 1, str: 'Degree Works audit', x: 0, y: 0, width: 10, height: 12 }]),
    NotAssistError,
  );
});
