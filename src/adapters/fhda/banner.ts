// Foothill-De Anza class schedule from Banner 9's public class search (reg.oci.fhda.edu).
// Same requests the "Browse Classes" page makes; no login.
import { normalizeFhdaCode } from '../../model/normalize-fhda';
import type { Meeting, Modality, Season, Section, SeatStatus, Weekday } from '../../model/types';
import type { ScheduleTerm } from '../../schedule/types';

export const FHDA_BANNER = 'https://reg.oci.fhda.edu/StudentRegistrationSsb/ssb';

// ---------- raw Banner JSON (only the fields we use) ----------

export interface BannerMeetingTime {
  beginTime: string | null; // "0830"
  endTime: string | null;
  startDate: string; // "01/04/2027"
  endDate: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  building: string | null;
  room: string | null;
  meetingTypeDescription: string | null;
}

export interface BannerSection {
  term: string;
  courseReferenceNumber: string;
  subject: string;
  courseNumber: string; // "D001A"
  courseTitle: string;
  creditHourLow: number | null;
  creditHourHigh: number | null;
  campusDescription: string | null;
  instructionalMethod: string | null; // IP, HB, O1, OA, OS, OC
  instructionalMethodDescription: string | null;
  maximumEnrollment: number;
  enrollment: number;
  seatsAvailable: number;
  waitCapacity: number;
  waitCount: number;
  waitAvailable: number;
  faculty: { displayName: string; primaryIndicator: boolean }[];
  meetingsFaculty: { meetingTime: BannerMeetingTime }[];
}

export interface BannerTerm {
  code: string;
  description: string; // "2027 Winter De Anza (View Only)"
}

// ---------- normalizing ----------

const METHOD: Record<string, Modality> = {
  IP: 'in_person',
  HB: 'hybrid', // in person, some weekly online
  O1: 'hybrid', // online, some weekly in person
  OA: 'online_async',
  OS: 'online_sync',
  OC: 'online_sync', // online, synchronous + asynchronous
  O2: 'online_async', // online, in-person exams
};

const DAYS: [keyof BannerMeetingTime, Weekday][] = [
  ['monday', 'Mon'],
  ['tuesday', 'Tue'],
  ['wednesday', 'Wed'],
  ['thursday', 'Thu'],
  ['friday', 'Fri'],
  ['saturday', 'Sat'],
  ['sunday', 'Sun'],
];

/** "0830" -> 510 */
const minutes = (hhmm: string) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(2), 10);
/** "01/04/2027" -> "2027-01-04" */
const isoDate = (mdy: string) => {
  const [m, d, y] = mdy.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

/** "Judson, Zack" -> "Zack Judson"; "Staff, M" / "TBA" -> null */
export function instructorName(raw: BannerSection['faculty']): string | null {
  const f = raw.find((x) => x.primaryIndicator) ?? raw[0];
  if (!f || /^(staff|tba)\b/i.test(f.displayName.trim())) return null;
  const [last, first] = f.displayName.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : last;
}

function seatStatus(s: BannerSection): SeatStatus {
  if (s.seatsAvailable > 0) return 'open';
  if (s.waitAvailable > 0) return 'waitlist';
  return 'full';
}

/** One Banner section -> our Section. Returns null for codes we can't read. */
export function normalizeBannerSection(s: BannerSection, termId: string, now: string): Section | null {
  // subject passed separately: some have spaces ("C D" = Child Development)
  const code = normalizeFhdaCode(s.courseNumber, s.subject);
  if (!code) return null;
  const known = METHOD[s.instructionalMethod ?? ''];

  const meetings: Meeting[] = [];
  let hasUntimedParts = false;
  let start: string | undefined;
  let end: string | undefined;
  for (const { meetingTime: m } of s.meetingsFaculty) {
    if (m.startDate && (!start || isoDate(m.startDate) < start)) start = isoDate(m.startDate);
    if (m.endDate && (!end || isoDate(m.endDate) > end)) end = isoDate(m.endDate);
    const days = DAYS.filter(([k]) => m[k] === true).map(([, d]) => d);
    if (!m.beginTime || !m.endTime || days.length === 0) {
      hasUntimedParts = true;
      continue;
    }
    const meeting: Meeting = {
      days,
      start: minutes(m.beginTime),
      end: minutes(m.endTime),
      ...(m.room && { location: m.room }),
    };
    const dup = meetings.some(
      (x) => x.start === meeting.start && x.end === meeting.end && x.days.join() === meeting.days.join(),
    );
    if (!dup) meetings.push(meeting);
  }

  return {
    id: `${termId}:${s.courseReferenceNumber}`,
    termId,
    courseCode: code.code,
    crn: s.courseReferenceNumber,
    instructorName: instructorName(s.faculty),
    // unknown method: guess from whether it has set meeting times
    modality: known ?? (meetings.length ? 'in_person' : 'online_async'),
    meetings,
    seats: {
      capacity: s.maximumEnrollment,
      enrolled: s.enrollment,
      waitlisted: s.waitCount,
      status: seatStatus(s),
    },
    lastSeenAt: now,
    title: s.courseTitle,
    units: s.creditHourLow ?? s.creditHourHigh ?? 0,
    ...(s.instructionalMethodDescription && { methodLabel: s.instructionalMethodDescription }),
    ...(start && { startDate: start }),
    ...(end && { endDate: end }),
    ...(hasUntimedParts && { hasUntimedParts }),
  };
}

/** "2027 Winter De Anza (View Only)" -> { season: 'winter', year: 2027, label: 'Winter 2027' } */
export function parseTermDescription(t: BannerTerm): (ScheduleTerm & { college: string }) | null {
  const m = t.description.match(/^(\d{4}) (Fall|Winter|Spring|Summer) (De Anza|Foothill)\b/i);
  if (!m) return null;
  const season = m[2].toLowerCase() as Season;
  return {
    code: t.code,
    label: `${m[2]} ${m[1]}`,
    season,
    year: parseInt(m[1], 10),
    college: m[3].toLowerCase().replace(' ', ''),
  };
}
