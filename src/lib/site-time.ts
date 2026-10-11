import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const ZHODIAO = 'c395acfd-518e-4689-9839-d46651e7320e';
export const ZHODIAO_TIMEZONE = 'America/New_York';
export const siteTimezone = (websiteId: string) =>
  websiteId === ZHODIAO ? ZHODIAO_TIMEZONE : 'UTC';
export function formatSiteTime(value: string, websiteId: string) {
  return new Date(value).toLocaleString(
    'zh-CN',
    websiteId === ZHODIAO
      ? { timeZone: ZHODIAO_TIMEZONE, hour12: false, timeZoneName: 'short' }
      : undefined,
  );
}
export function calendarDay(now: Date, timezone: string) {
  return formatInTimeZone(now, timezone, 'yyyy-MM-dd');
}
export function rangeBoundaries(range: { start: string; until: string }, timezone: string) {
  return {
    startDate: fromZonedTime(`${range.start}T00:00:00`, timezone),
    endDate: new Date(fromZonedTime(`${range.until}T00:00:00`, timezone).getTime() - 1),
    timezone,
  };
}
