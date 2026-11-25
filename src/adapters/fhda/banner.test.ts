import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { instructorName, normalizeBannerSection, parseTermDescription, type BannerSection } from './banner';
import { hm, sectionFits } from '../../model/availability';
import type { Availability } from '../../model/types';

// Real Winter 2027 De Anza sections from Banner's public class search (trimmed to the fields we use).
const raw: BannerSection[] = JSON.parse(readFileSync(new URL('./fixtures/banner-sample.json', import.meta.url), 'utf8'));
const sections = raw.map((s) => normalizeBannerSection(s, 'deanza-2027-winter', '2026-11-24T00:00:00Z')!);
const byCrn = (crn: string) => sections.find((s) => s.crn === crn)!;

test('codes match DegreeWorks/ASSIST format', () => {
  assert.equal(byCrn('38519').courseCode, 'MATH 22');
  assert.equal(byCrn('40281').courseCode, 'MATH 1DH');
  assert.equal(byCrn('40247').courseCode, 'CIS 21JA');
  assert.equal(byCrn('40241').courseCode, 'CIS 22C');
  const cd = normalizeBannerSection({ ...raw[0], subject: 'C D', courseNumber: 'D010G' }, 't', 'n');
  assert.equal(cd?.courseCode, 'C D 10G'); // subject with a space
});

test('meetings, units, seats, instructor', () => {
  const s = byCrn('38473'); // MATH 1D, TuTh 4:00-6:15, 29 open
  assert.deepEqual(s.meetings, [{ days: ['Tue', 'Thu'], start: hm(16), end: hm(18, 15), location: s.meetings[0].location }]);
  assert.equal(s.instructorName, 'Hassan Bourgoub');
  assert.equal(s.units, 5);
  assert.equal(s.seats?.status, 'open');
  assert.equal(byCrn('38474').seats?.status, 'waitlist'); // 0 open, 6 waitlist spots
  assert.equal(byCrn('39968').seats?.status, 'full');
  assert.equal(byCrn('38473').startDate, '2027-01-04');
  assert.equal(byCrn('38473').endDate, '2027-03-26');
});

test('instruction methods', () => {
  assert.equal(byCrn('38473').modality, 'in_person');
  assert.equal(byCrn('38518').modality, 'hybrid');
  assert.equal(byCrn('38518').hasUntimedParts, true); // weekly online part has no set time
  assert.equal(byCrn('32261').modality, 'online_async');
  assert.deepEqual(byCrn('32261').meetings, []);
  assert.equal(byCrn('38109').modality, 'online_sync');
  assert.equal(byCrn('38895').modality, 'online_async'); // O2: online, in-person exams
  assert.equal(byCrn('38895').methodLabel, 'ONLINE in person exams');
});

test('short-term sections keep their own dates', () => {
  assert.equal(byCrn('39577').startDate, '2027-02-15');
  assert.equal(byCrn('36331').endDate, '2027-02-12');
});

test('"Staff" means no instructor yet (section still kept)', () => {
  assert.equal(byCrn('36236').instructorName, null);
  assert.equal(instructorName([{ displayName: 'Judson, Zack', primaryIndicator: true }]), 'Zack Judson');
});

test('term names', () => {
  assert.deepEqual(parseTermDescription({ code: '202732', description: '2027 Winter De Anza' }), {
    code: '202732', label: 'Winter 2027', season: 'winter', year: 2027, college: 'deanza',
  });
  assert.equal(parseTermDescription({ code: '202742', description: '2027 Spring De Anza (View Only)' })?.label, 'Spring 2027');
  assert.equal(parseTermDescription({ code: '202741', description: '2027 Spring Foothill' })?.college, 'foothill');
});

test('fits a working student: Mon/Wed mornings, Tue/Thu afternoons, 30 min travel', () => {
  const avail: Availability = {
    userId: 'u',
    termId: 'deanza-2027-winter',
    blocks: [
      { day: 'Mon', start: hm(8), end: hm(12) },
      { day: 'Wed', start: hm(8), end: hm(12) },
      { day: 'Tue', start: hm(13), end: hm(19) },
      { day: 'Thu', start: hm(13), end: hm(19) },
    ],
    commuteBufferMinutes: 30,
    allowOnlineAsync: true,
  };
  assert.equal(sectionFits(byCrn('38473'), avail), true); // MATH 1D TuTh 4-6:15
  assert.equal(sectionFits(byCrn('38470'), avail), true); // TuTh 1:30-3:45 (1:00 + 30 min)
  assert.equal(sectionFits(byCrn('39968'), avail), false); // MoWe 4-6:15
  assert.equal(sectionFits(byCrn('38518'), avail), false); // MTWTh 8:30 — Tue/Thu not free
  assert.equal(sectionFits(byCrn('32261'), avail), true); // async online
  assert.equal(sectionFits(byCrn('32261'), { ...avail, allowOnlineAsync: false }), false);
});
