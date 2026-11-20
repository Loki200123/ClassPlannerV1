'use client';

import type { TimeBlock } from '../model/types';
import { DAYS, formatTime } from './time';

const START = 6 * 60; // 6 am
const END = 23 * 60; // 11 pm
const pct = (min: number) => ((Math.min(Math.max(min, START), END) - START) / (END - START)) * 100;

/** Read-only weekly timetable: free blocks in green, commute buffer hatched. */
export function WeekGrid({ blocks, buffer }: { blocks: TimeBlock[]; buffer: number }) {
  const hours: number[] = [];
  for (let h = START; h <= END; h += 120) hours.push(h);

  return (
    <figure className="week" aria-label="Your free time this week">
      <div className="week-hours" aria-hidden="true">
        {hours.map((h) => (
          <span key={h} style={{ top: `${pct(h)}%` }}>
            {formatTime(h)}
          </span>
        ))}
      </div>
      {DAYS.map((day) => {
        const today = blocks.filter((b) => b.day === day && b.end > b.start);
        return (
          <div className="week-day" key={day}>
            <div className="week-day-name">{day}</div>
            <div className="week-col">
              {hours.map((h) => (
                <i key={h} className="week-line" style={{ top: `${pct(h)}%` }} />
              ))}
              {today.map((b, i) => {
                const len = b.end - b.start;
                const bufPct = len > 0 ? Math.min(50, (buffer / len) * 100) : 0;
                return (
                  <div
                    key={i}
                    className="week-block"
                    style={{ top: `${pct(b.start)}%`, height: `${pct(b.end) - pct(b.start)}%` }}
                    title={`${day} ${formatTime(b.start)}–${formatTime(b.end)} free`}
                  >
                    {buffer > 0 && (
                      <>
                        <span className="week-buffer" style={{ top: 0, height: `${bufPct}%` }} />
                        <span className="week-buffer" style={{ bottom: 0, height: `${bufPct}%` }} />
                      </>
                    )}
                    <span className="week-block-label">
                      {formatTime(b.start)}
                      <br />
                      {formatTime(b.end)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </figure>
  );
}
