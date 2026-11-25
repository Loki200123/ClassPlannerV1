import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBannerSection, type BannerSection } from '../adapters/fhda/banner';
import { hm } from '../model/availability';
import type { Availability } from '../model/types';
import { rankChoiceOptions, sectionsFor } from './match';

const raw: BannerSection[] = JSON.parse(
  readFileSync(new URL('../adapters/fhda/fixtures/banner-sample.json', import.meta.url), 'utf8'),
);
const all = raw.map((s) => normalizeBannerSection(s, 'deanza-2027-winter', 'now')!);
const avail: Availability = {
  userId: 'u',
  termId: 'deanza-2027-winter',
  blocks: [
    { day: 'Tue', start: hm(13), end: hm(19) },
    { day: 'Thu', start: hm(13), end: hm(19) },
  ],
  commuteBufferMinutes: 30,
  allowOnlineAsync: true,
};

test('MATH 1D: fitting sections first, open seats before full', () => {
  const r = sectionsFor('MATH 1D', all, avail);
  assert.equal(r.title, 'Calculus IV');
  // TuTh 4:00 (29 open), online async (25 open), TuTh 1:30 (16 open), then waitlist, then full; MoWe/evenings don't fit
  assert.deepEqual(r.fits.map((s) => s.crn), ['38473', '40253', '38470', '38477', '40254', '39323']);
  assert.ok(r.other.some((s) => s.crn === '39968'));
  assert.equal(r.fits[0].seats?.status, 'open');
});

test('not offered this term -> no sections at all', () => {
  const r = sectionsFor('PHYS 4A', all, avail);
  assert.equal(r.fits.length + r.other.length, 0);
});

test('choice options are ranked by what fits', () => {
  const r = rankChoiceOptions(['ADMJ 54', 'ANTH 2', 'BIOL 77', 'NOPE 1'], all, avail);
  assert.deepEqual(r.map((c) => c.code), ['ADMJ 54', 'ANTH 2', 'BIOL 77']);
});
