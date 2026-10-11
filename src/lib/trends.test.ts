import { describe, expect, it } from 'vitest';
import {
  parseTrendsKeywords,
  trendsEmbedUrl,
  trendsExploreUrl,
  validateTrendsSettings,
} from './trends';

describe('Google Trends requests', () => {
  it('preserves multilingual and URL-significant terms without injecting URL parameters', () => {
    const s = { keywords: ['拼豆 & gifts', '</script>?geo=CN'], geo: 'US', period: 'today 12-m' };
    const explore = new URL(trendsExploreUrl(s));
    expect(explore.origin).toBe('https://trends.google.com');
    expect(explore.searchParams.get('geo')).toBe('US');
    expect(explore.searchParams.get('q')).toBe(s.keywords.join(','));
    const frame = new URL(trendsEmbedUrl(s, 'TIMESERIES'));
    expect(frame.origin).toBe('https://trends.google.com');
    expect(JSON.parse(frame.searchParams.get('req') || '{}').comparisonItem).toEqual(
      s.keywords.map(keyword => ({ keyword, geo: 'US', time: 'today 12-m' })),
    );
  });
  it('rejects invalid stored preferences and out-of-range requests', () => {
    for (const value of [
      null,
      { keywords: [42], geo: 'US', period: 'today 12-m' },
      { keywords: ['x'], geo: 'bad', period: 'today 12-m' },
      { keywords: ['x'], geo: 'US', period: 'bad' },
    ]) {
      expect(() => validateTrendsSettings(value)).toThrow();
    }
    for (const text of ['', 'a,b', 'x'.repeat(101), 'a\nb\nc\nd\ne\nf']) {
      expect(() => parseTrendsKeywords(text)).toThrow();
    }
  });
  it('normalizes duplicate keywords while preserving spelling and accepts the worldwide market', () => {
    expect(parseTrendsKeywords(' Perler beads\nperler beads\n拼豆\n')).toEqual([
      'perler beads',
      '拼豆',
    ]);
    expect(
      new URL(
        trendsExploreUrl({ keywords: ['perler beads'], geo: '', period: 'today 5-y' }),
      ).searchParams.get('geo'),
    ).toBe('');
  });
});
