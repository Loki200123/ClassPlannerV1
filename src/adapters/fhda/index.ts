import { normalizeFhdaCode } from '../../model/normalize-fhda';
import type { DistrictAdapter } from '../../model/types';
import { parseFhdaDegreeWorks } from './degreeworks';

export const fhdaAdapter: DistrictAdapter = {
  districtId: 'fhda',
  normalizeCode: normalizeFhdaCode,
  parseDegreeWorks: parseFhdaDegreeWorks,
  async fetchSchedule() {
    throw new Error('FHDA schedule importer not built yet');
  },
};
