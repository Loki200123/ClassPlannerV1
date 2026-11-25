import type { Availability, Minutes, Section } from './types';

/** hm(15, 30) -> 930 (3:30 PM). */
export const hm = (hours: number, minutes = 0): Minutes => hours * 60 + minutes;

/**
 * Does every meeting of this section fit inside one of the user's free blocks?
 * Commute buffer applies only to classes you physically go to.
 */
export function sectionFits(section: Section, avail: Availability): boolean {
  if (section.modality === 'online_async') return avail.allowOnlineAsync;
  // times not set yet: can't promise it fits
  if (section.meetings.length === 0) return false;
  const buffer = section.modality === 'online_sync' ? 0 : avail.commuteBufferMinutes;

  return section.meetings.every((m) =>
    m.days.every((day) =>
      avail.blocks.some(
        (b) => b.day === day && b.start + buffer <= m.start && m.end + buffer <= b.end,
      ),
    ),
  );
}
