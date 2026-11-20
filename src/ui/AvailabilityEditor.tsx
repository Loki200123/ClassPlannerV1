'use client';

import type { TimeBlock, Weekday } from '../model/types';
import { DAYS, blockProblem, freeHours, toHHMM, toMinutes } from './time';
import { WeekGrid } from './WeekGrid';

interface Props {
  blocks: TimeBlock[];
  buffer: number;
  allowAsync: boolean;
  onChange: (next: { blocks?: TimeBlock[]; buffer?: number; allowAsync?: boolean }) => void;
}

const BUFFERS = [0, 15, 30, 45, 60, 90];

export function AvailabilityEditor({ blocks, buffer, allowAsync, onChange }: Props) {
  const setBlocks = (next: TimeBlock[]) => onChange({ blocks: next });

  const add = (day: Weekday) => {
    const sameDay = blocks.filter((b) => b.day === day);
    const last = sameDay.reduce((max, b) => Math.max(max, b.end), 0);
    const start = last ? Math.min(last + 60, 21 * 60) : 8 * 60;
    setBlocks([...blocks, { day, start, end: Math.min(start + 180, 23 * 60) }]);
  };
  const update = (target: TimeBlock, patch: Partial<TimeBlock>) =>
    setBlocks(blocks.map((b) => (b === target ? { ...b, ...patch } : b)));
  const remove = (target: TimeBlock) => setBlocks(blocks.filter((b) => b !== target));
  const copyToWeekdays = (day: Weekday) => {
    const src = blocks.filter((b) => b.day === day);
    const weekdays: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    setBlocks([
      ...blocks.filter((b) => !weekdays.includes(b.day) || b.day === day),
      ...weekdays.filter((d) => d !== day).flatMap((d) => src.map((b) => ({ ...b, day: d }))),
    ]);
  };

  const hours = freeHours(blocks);

  return (
    <div className="avail">
      <div className="avail-editor">
        {DAYS.map((day) => {
          const today = blocks.filter((b) => b.day === day);
          return (
            <fieldset className="day" key={day}>
              <legend>{day}</legend>
              {today.length === 0 && <p className="day-empty">Not free</p>}
              {today.map((b, i) => {
                const problem = blockProblem(b, blocks);
                return (
                  <div className={`slot${problem ? ' slot-bad' : ''}`} key={i}>
                    <label>
                      <span className="sr-only">
                        {day} block {i + 1} start
                      </span>
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(b.start)}
                        onChange={(e) => e.target.value && update(b, { start: toMinutes(e.target.value) })}
                      />
                    </label>
                    <span aria-hidden="true">to</span>
                    <label>
                      <span className="sr-only">
                        {day} block {i + 1} end
                      </span>
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(b.end)}
                        onChange={(e) => e.target.value && update(b, { end: toMinutes(e.target.value) })}
                      />
                    </label>
                    <button type="button" className="icon-btn" onClick={() => remove(b)} aria-label={`Remove ${day} block ${i + 1}`}>
                      ×
                    </button>
                    {problem && (
                      <p className="slot-msg" role="alert">
                        {problem === 'end-before-start' ? 'End time must be after start time.' : 'This overlaps another block on the same day.'}
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="day-actions">
                <button type="button" className="link-btn" onClick={() => add(day)}>
                  Add free time
                </button>
                {today.length > 0 && !['Sat', 'Sun'].includes(day) && (
                  <button type="button" className="link-btn quiet" onClick={() => copyToWeekdays(day)}>
                    Copy to Mon–Fri
                  </button>
                )}
              </div>
            </fieldset>
          );
        })}

        <div className="avail-options">
          <label className="field">
            <span>Travel time between work and class</span>
            <select value={buffer} onChange={(e) => onChange({ buffer: Number(e.target.value) })}>
              {BUFFERS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'None' : `${m} minutes`}
                </option>
              ))}
            </select>
            <small>Kept free at both ends of each block for in-person classes. Online classes skip it.</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={allowAsync} onChange={(e) => onChange({ allowAsync: e.target.checked })} />
            <span>Online classes with no set meeting time are OK</span>
          </label>
        </div>
      </div>

      <div className="avail-preview">
        <WeekGrid blocks={blocks} buffer={buffer} />
        <p className="avail-total">
          {hours > 0 ? (
            <>
              <strong>{hours % 1 ? hours.toFixed(1) : hours} hours</strong> free per week
              {buffer > 0 && ', hatched edges are travel time'}
            </>
          ) : (
            'Add the times you could be in class. Use two blocks on a day if you work in the middle of it.'
          )}
        </p>
      </div>
    </div>
  );
}
