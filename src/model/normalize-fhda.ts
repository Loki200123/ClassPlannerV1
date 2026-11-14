import type { NormalizedCode } from './types';

// Foothill-De Anza DegreeWorks codes: "MATH D001A" -> De Anza "MATH 1A".
// D = De Anza, F = Foothill, C = statewide common course numbering (kept as-is).
const CAMPUS_PREFIX: Record<string, string> = { D: 'deanza', F: 'foothill' };

const CODE_RE = /^(?:([A-Z][A-Z/_]*)\s+)?([A-Z]?)(\d+)([A-Z]*)$/;

export function normalizeFhdaCode(raw: string, defaultSubject?: string): NormalizedCode | null {
  const s = raw.trim().toUpperCase().replace(/\.$/, '');
  const m = s.match(CODE_RE);
  if (!m) return null;

  const [, subjectRaw, prefix, digits, suffix] = m;
  const subject = subjectRaw ?? defaultSubject?.toUpperCase();
  if (!subject) return null;

  if (prefix === 'C') {
    return { code: `${subject} C${digits}${suffix}`, campus: null };
  }
  if (prefix && !(prefix in CAMPUS_PREFIX)) return null;

  return {
    code: `${subject} ${parseInt(digits, 10)}${suffix}`,
    campus: prefix ? CAMPUS_PREFIX[prefix] : null,
  };
}
