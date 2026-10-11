import { expect, test, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {} }));

import { reportingRange } from './integrations';
import { calendarDay, rangeBoundaries, siteTimezone, ZHODIAO_TIMEZONE } from './site-time';

test('New York calendar stays on previous day before local midnight', () => {
  const now = new Date('2026-10-12T02:00:00Z');
  expect(calendarDay(now, ZHODIAO_TIMEZONE)).toBe('2026-10-11');
  expect(reportingRange(1, now, ZHODIAO_TIMEZONE)).toMatchObject({
    start: '2026-10-10',
    end: '2026-10-10',
    until: '2026-10-11',
  });
  expect(siteTimezone('other-site')).toBe('UTC');
});
test('local day bounds handle both 23 and 25 hour daylight saving days', () => {
  const spring = rangeBoundaries({ start: '2026-03-08', until: '2026-03-09' }, ZHODIAO_TIMEZONE);
  const fall = rangeBoundaries({ start: '2026-11-01', until: '2026-11-02' }, ZHODIAO_TIMEZONE);
  expect(spring.startDate.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  expect(spring.endDate.getTime() + 1 - spring.startDate.getTime()).toBe(23 * 3600000);
  expect(fall.endDate.getTime() + 1 - fall.startDate.getTime()).toBe(25 * 3600000);
});
