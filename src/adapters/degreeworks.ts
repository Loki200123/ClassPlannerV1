// Picks the right DegreeWorks parser for a district, and spots audits from the wrong college.
import type { DistrictId } from '../model/types';
import { parseCcsfDegreeWorks } from './ccsf/degreeworks';
import { NotAnAuditError, parseFhdaDegreeWorks, type ParsedAudit } from './fhda/degreeworks';

export { NotAnAuditError, type ParsedAudit };

/** Audit is real DegreeWorks, just from a different district than the one picked. */
export class WrongCollegeAuditError extends Error {
  constructor(public actual: DistrictId) {
    super(`This audit is from ${DISTRICT_NAMES[actual]}.`);
  }
}

const DISTRICT_NAMES: Record<DistrictId, string> = {
  fhda: 'De Anza or Foothill',
  smccd: 'Skyline, CSM or Cañada',
  ccsf: 'City College of San Francisco',
};

const PARSERS: Partial<Record<DistrictId, (text: string) => ParsedAudit>> = {
  fhda: parseFhdaDegreeWorks,
  ccsf: parseCcsfDegreeWorks,
};

export const auditSupported = (district: DistrictId) => district in PARSERS;

/** Which district printed this audit, from its page header. */
export function detectAuditDistrict(text: string): DistrictId | null {
  if (!/Degree ?Works/i.test(text)) return null;
  if (/Foothill - De Anza District/i.test(text)) return 'fhda';
  if (/City College Of San Francisco/i.test(text)) return 'ccsf';
  if (/San Mateo County Community College|Skyline College|College of San Mateo|Ca[ñn]ada College/i.test(text)) return 'smccd';
  return null;
}

export function parseDegreeWorks(text: string, district: DistrictId): ParsedAudit {
  const actual = detectAuditDistrict(text);
  if (actual && actual !== district) throw new WrongCollegeAuditError(actual);
  const parse = PARSERS[district];
  if (!parse) throw new NotAnAuditError(`Audits from ${DISTRICT_NAMES[district]} can't be read yet.`);
  return parse(text);
}
