// =====================================================================
// Class Planner — core data model
// =====================================================================

// ---------- Primitives ----------

export type TermSystem = 'quarter' | 'semester';
export type Season = 'fall' | 'winter' | 'spring' | 'summer';
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

/** Minutes after midnight (0–1439). 8:30 AM = 510, 3:00 PM = 900. */
export type Minutes = number;

/**
 * Canonical course code: "SUBJECT NUMBER", e.g. "MATH 1A", "CIS 21JA", "ENGL C1001".
 * Every adapter converts its district's raw format into this.
 */
export type CourseCode = string;

export interface Units {
  value: number;
  system: TermSystem;
}

// ---------- Reference data (shared, filled by importers) ----------

export type DistrictId = 'fhda' | 'smccd' | 'ccsf';

export interface District {
  id: DistrictId;
  name: string;
}

export interface College {
  id: string; // 'deanza' | 'foothill' | 'skyline' | 'csm' | 'canada' | 'ccsf'
  districtId: DistrictId;
  name: string;
  termSystem: TermSystem;
  /** Used to build RateMyProfessors search links. */
  rmpSchoolName?: string;
}

export interface Term {
  id: string; // 'deanza-2027-winter'
  collegeId: string;
  season: Season;
  year: number;
  startDate: string; // ISO date
  endDate: string;
  /** Importer refreshes every 3 days between registrationOpens and startDate. */
  registrationOpens?: string;
}

export interface Course {
  collegeId: string;
  code: CourseCode;
  title: string;
  units: Units;
  prerequisites?: ReqExpr; // parsed when possible
  prerequisiteText?: string; // raw text, always kept
}

export type Modality = 'in_person' | 'online_sync' | 'online_async' | 'hybrid';

export interface Meeting {
  days: Weekday[];
  start: Minutes;
  end: Minutes;
  location?: string;
}

export type SeatStatus = 'open' | 'waitlist' | 'full' | 'cancelled';

export interface Section {
  id: string; // `${termId}:${crn}`
  termId: string;
  courseCode: CourseCode;
  crn: string;
  /** null = "Staff"/TBA. Still shown to the user, never hidden. */
  instructorName: string | null;
  modality: Modality;
  /** Empty for online_async. */
  meetings: Meeting[];
  seats?: {
    capacity: number;
    enrolled: number;
    waitlisted: number;
    status: SeatStatus;
  };
  /** If a section disappears from the latest import, it was probably cancelled. */
  lastSeenAt: string;
}

// ---------- Requirement trees (used by ASSIST + prerequisites) ----------

export type ReqExpr =
  | { kind: 'course'; code: CourseCode }
  | { kind: 'all'; items: ReqExpr[]; sameInstitution?: boolean }
  | { kind: 'any'; items: ReqExpr[] }
  | { kind: 'none' }; // "No Current Articulation" — can't be satisfied here

// ---------- Transfer agreement (ASSIST) ----------

export interface ReceivingCourse {
  code: CourseCode; // university's course, e.g. SJSU "MATH 30"
  title: string;
  units: Units;
}

export interface Articulation {
  receiving: ReceivingCourse;
  /** What the student takes at the community college. */
  sending: ReqExpr;
}

export type GroupRule =
  | { kind: 'all' }
  | { kind: 'count'; n: number }
  | { kind: 'units'; min: number; system: TermSystem };

export interface AgreementGroup {
  title: string;
  rule: GroupRule;
  articulations: Articulation[];
  note?: string;
}

export interface TransferAgreement {
  id: string;
  fromCollegeId: string;
  toInstitution: string;
  major: string;
  academicYear: string; // '2026-2027'
  minGrade?: string;
  groups: AgreementGroup[];
  /** Things the planner must flag that aren't course lists (US 1–3, PE, etc). */
  notes: string[];
}

// ---------- Student data (private, per user) ----------

export type Goal =
  | { kind: 'associate' } // AA/AS only
  | { kind: 'adt' } // Associate Degree for Transfer
  | { kind: 'transfer'; institution: string; major: string; alsoAdt?: boolean };

export interface StudentProfile {
  userId: string;
  collegeId: string;
  major: string;
  goal: Goal;
  maxUnitsPerTerm?: number;
}

export type CourseStatus = 'completed' | 'in_progress' | 'withdrawn' | 'not_counted';

export interface CourseRecord {
  code: CourseCode;
  campus: string | null; // college it was taken at
  title: string;
  grade: string | null; // null while in progress
  units: number;
  term: string; // '2026 Fall'
  status: CourseStatus;
}

export interface AuditRequirement {
  block: string; // 'AREA 3 - ARTS AND HUMANITIES'
  label: string; // 'Arts & Humanities'
  status: 'complete' | 'in_progress' | 'incomplete';
  classesNeeded?: number;
  unitsNeeded?: number;
  /** From "Still needed: 1 Class in X or Y or Z". */
  options: CourseCode[];
  /** Rules that aren't course lists, e.g. "at least two different disciplines". */
  notes?: string;
  rawText: string;
}

/**
 * Parsed DegreeWorks audit.
 * PRIVACY: no name, student ID, GPA, or raw PDF is ever stored.
 */
export interface AuditSnapshot {
  id: string;
  userId: string;
  source: 'degreeworks';
  districtId: DistrictId;
  auditDate: string;
  catalogYear: string;
  degree: string;
  courses: CourseRecord[];
  requirements: AuditRequirement[];
}

export interface TimeBlock {
  day: Weekday;
  start: Minutes;
  end: Minutes;
}

export interface Availability {
  userId: string;
  termId: string;
  /** Free time. Multiple blocks per day allowed (e.g. Mon 8–11 and 15–21). */
  blocks: TimeBlock[];
  /** Gap needed at each edge of a block before/after an in-person class. */
  commuteBufferMinutes: number;
  allowOnlineAsync: boolean;
}

export interface SavedPlan {
  id: string;
  userId: string;
  termId: string;
  name: string;
  sectionIds: string[];
  createdAt: string;
}

// ---------- Import monitoring ----------

export interface ImportRun {
  id: string;
  districtId: DistrictId;
  termId: string;
  startedAt: string;
  finishedAt?: string;
  /** 'empty' (0 sections) triggers an alert just like 'failed'. */
  status: 'running' | 'ok' | 'failed' | 'empty';
  sectionsFound: number;
  error?: string;
}

// ---------- One adapter per district ----------

export interface NormalizedCode {
  code: CourseCode;
  campus: string | null;
}

export interface DistrictAdapter {
  districtId: DistrictId;
  /** defaultSubject handles DegreeWorks lists like "MATH D022. or D022H". */
  normalizeCode(raw: string, defaultSubject?: string): NormalizedCode | null;
  parseDegreeWorks(text: string): Omit<AuditSnapshot, 'id' | 'userId'>;
  fetchSchedule(term: Term): Promise<Section[]>;
}
