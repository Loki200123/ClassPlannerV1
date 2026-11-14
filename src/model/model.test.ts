import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFhdaCode } from './normalize-fhda';
import { cheapestPath, evaluateAgreement } from './requirements';
import { hm, sectionFits } from './availability';
import { deanzaSjsuCs } from './fixtures/deanza-sjsu-cs-2026-27';
import type { Availability, Section } from './types';

test('FHDA code normalizer handles real DegreeWorks formats', () => {
  const cases: [string, string | undefined, string, string | null][] = [
    ['MATH D001A', undefined, 'MATH 1A', 'deanza'],
    ['CIS D21JA', undefined, 'CIS 21JA', 'deanza'],
    ['MATH D022.', undefined, 'MATH 22', 'deanza'],
    ['D022H', 'MATH', 'MATH 22H', 'deanza'], // subject carried from earlier in the list
    ['D46AH', 'ELIT', 'ELIT 46AH', 'deanza'],
    ['ENGL C1001', undefined, 'ENGL C1001', null],
    ['F/TV D02AH', undefined, 'F/TV 2AH', 'deanza'],
    ['E_S D003.', undefined, 'E_S 3', 'deanza'],
    ['MATH F001A', undefined, 'MATH 1A', 'foothill'],
  ];
  for (const [raw, subj, code, campus] of cases) {
    assert.deepEqual(normalizeFhdaCode(raw, subj), { code, campus }, raw);
  }
  assert.equal(normalizeFhdaCode('@'), null);
  assert.equal(normalizeFhdaCode('D022H'), null); // no subject known
});

// Sample student: completed + in-progress courses as they appear in a DegreeWorks audit.
const rawTaken = [
  'ESL D005.', 'ENGL C1001', 'COMM C1000', 'MATH D032.', 'ARTS D001A', 'HUMI D001.',
  'HIST D017C', 'ESCI D001.', 'ASAM D011.', 'MATH D001A', 'MATH D001B', 'MATH D001C',
  'CIS D022A', 'CIS D022B', 'CIS D022C', 'EWRT D001B', 'MATH D031.',
];
const taken = new Set(rawTaken.map((r) => normalizeFhdaCode(r)!.code));

test('cheapestPath picks the shortest option and respects "none"', () => {
  assert.deepEqual(cheapestPath({ kind: 'none' }, taken), null);
  const calc3 = deanzaSjsuCs.groups[1].articulations[4].sending;
  assert.deepEqual(cheapestPath(calc3, taken), ['MATH 1D']);
});

test('sample student vs De Anza -> SJSU CS agreement', () => {
  const result = evaluateAgreement(deanzaSjsuCs, taken);
  const byTitle = Object.fromEntries(result.groups.map((g) => [g.title, g]));

  assert.equal(byTitle['Second Course in English Composition'].satisfied, true);
  assert.equal(byTitle['Computer Science Electives'].satisfied, true);

  assert.deepEqual(
    byTitle['Preparation for the Major'].needed.flatMap((n) => n.courses).sort(),
    ['MATH 1D', 'MATH 22', 'MATH 2B'],
  );
  assert.deepEqual(byTitle['Lower Division Major Requirements'].needed.flatMap((n) => n.courses), ['CIS 21JA']);

  const science = byTitle['Science Electives'];
  assert.equal(science.needed.length, 2); // two 4-unit courses reach 8 semester units

  console.log('Still needed:', result.allNeeded);
});

test('availability: multiple blocks per day + commute buffer', () => {
  const avail: Availability = {
    userId: 'u1',
    termId: 'deanza-2027-winter',
    blocks: [
      { day: 'Mon', start: hm(8), end: hm(11) },
      { day: 'Mon', start: hm(15), end: hm(21) },
      { day: 'Wed', start: hm(8), end: hm(11) },
    ],
    commuteBufferMinutes: 30,
    allowOnlineAsync: true,
  };
  const section = (start: number, end: number, modality: Section['modality'] = 'in_person'): Section => ({
    id: 'x', termId: avail.termId, courseCode: 'MATH 22', crn: '1', instructorName: null,
    modality, meetings: [{ days: ['Mon', 'Wed'], start, end }], lastSeenAt: '',
  });

  assert.equal(sectionFits(section(hm(8, 30), hm(10, 20)), avail), true);
  assert.equal(sectionFits(section(hm(8), hm(10, 20)), avail), false); // no buffer at 8:00
  assert.equal(sectionFits(section(hm(8), hm(10, 20), 'online_sync'), avail), true); // no commute
  assert.equal(sectionFits(section(hm(15, 30), hm(17)), avail), false); // Wed has no afternoon block
  assert.equal(sectionFits({ ...section(0, 0, 'online_async'), meetings: [] }, avail), true);
});
