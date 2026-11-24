import type { DistrictId, TermSystem } from '../model/types';

export interface CollegeInfo {
  id: string;
  name: string;
  districtId: DistrictId;
  termSystem: TermSystem;
  /** Can we read this college's DegreeWorks PDF yet? */
  auditSupported: boolean;
  /** The name ASSIST prints on its "From:" line. */
  assistName: string;
}

export const COLLEGES: CollegeInfo[] = [
  { id: 'deanza', name: 'De Anza College', districtId: 'fhda', termSystem: 'quarter', auditSupported: true, assistName: 'De Anza College' },
  { id: 'skyline', name: 'Skyline College', districtId: 'smccd', termSystem: 'semester', auditSupported: false, assistName: 'Skyline College' },
  { id: 'csm', name: 'College of San Mateo', districtId: 'smccd', termSystem: 'semester', auditSupported: false, assistName: 'College of San Mateo' },
  { id: 'ccsf', name: 'City College of San Francisco', districtId: 'ccsf', termSystem: 'semester', auditSupported: true, assistName: 'City College of San Francisco' },
];

export const collegeById = (id: string) => COLLEGES.find((c) => c.id === id) ?? COLLEGES[0];

/** The next term to plan for, from today's date. */
export function nextTerm(termSystem: TermSystem, today = new Date()): string {
  const y = today.getFullYear();
  const m = today.getMonth() + 1; // 1–12
  if (termSystem === 'quarter') {
    if (m >= 9) return `Winter ${y + 1}`;
    if (m <= 2) return `Spring ${y}`;
    if (m <= 5) return `Summer ${y}`;
    return `Fall ${y}`;
  }
  if (m >= 9) return `Spring ${y + 1}`;
  if (m <= 4) return `Fall ${y}`;
  return `Fall ${y}`;
}
