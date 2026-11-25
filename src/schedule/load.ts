// Downloads imported schedules from the repo's `schedule-data` branch (updated every 3 days by GitHub Actions).
import type { ScheduleFile, ScheduleIndex } from './types';

export const SCHEDULE_BASE =
  process.env.NEXT_PUBLIC_SCHEDULE_BASE ?? 'https://raw.githubusercontent.com/Loki200123/ClassPlannerV1/schedule-data';

const cache = new Map<string, Promise<unknown>>();

function getJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${SCHEDULE_BASE}/${path}`, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.json();
      }).catch((e) => {
        cache.delete(path); // allow a retry
        throw e;
      }),
    );
  }
  return cache.get(path) as Promise<T>;
}

export const loadScheduleIndex = () => getJson<ScheduleIndex>('index.json');
export const loadScheduleFile = (file: string) => getJson<ScheduleFile>(file);
