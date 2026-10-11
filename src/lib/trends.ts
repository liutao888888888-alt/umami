export const trendsRegions = {
  US: '美国',
  '': '全球',
  GB: '英国',
  CA: '加拿大',
  AU: '澳大利亚',
  DE: '德国',
  CN: '中国',
  JP: '日本',
};
export const trendsPeriods = {
  'today 12-m': '过去 12 个月',
  'today 3-m': '过去 90 天',
  'today 5-y': '过去 5 年',
  'now 7-d': '过去 7 天',
};
export type TrendsSettings = { keywords: string[]; geo: string; period: string };
export const defaultTrendsSettings: TrendsSettings = {
  keywords: ['perler beads', 'fuse beads'],
  geo: 'US',
  period: 'today 12-m',
};

export function parseTrendsKeywords(text: string): string[] {
  const terms = text
    .split(/\r?\n/)
    .map(v => v.trim())
    .filter(Boolean);
  const unique = [...new Map(terms.map(v => [v.toLocaleLowerCase(), v])).values()];
  if (
    !unique.length ||
    unique.length > 5 ||
    unique.some(v => v.length > 100 || v.includes(',') || [...v].some(c => c.charCodeAt(0) < 32))
  ) {
    throw new Error('请填写 1–5 个关键词，每行一个，每个不超过 100 字，且不含逗号。');
  }
  return unique;
}

export function validateTrendsSettings(value: unknown): TrendsSettings {
  const raw = value as TrendsSettings;
  if (
    !raw ||
    !Array.isArray(raw.keywords) ||
    !raw.keywords.every(v => typeof v === 'string') ||
    !Object.hasOwn(trendsRegions, raw.geo) ||
    !Object.hasOwn(trendsPeriods, raw.period)
  ) {
    throw new Error('invalid-trends-settings');
  }
  return {
    keywords: parseTrendsKeywords(raw.keywords.join('\n')),
    geo: raw.geo,
    period: raw.period,
  };
}

export function trendsExploreUrl(settings: TrendsSettings) {
  const s = validateTrendsSettings(settings);
  const params = new URLSearchParams({
    geo: s.geo,
    date: s.period,
    q: s.keywords.join(','),
    hl: 'en',
  });
  return `https://trends.google.com/trends/explore?${params}`;
}

// Same iframe endpoint and request format as Google's official embed_loader.js.
// The provider runs in a cross-origin iframe; no Google script runs in the admin page.
export function trendsEmbedUrl(
  settings: TrendsSettings,
  widget: 'TIMESERIES' | 'RELATED_QUERIES_0',
) {
  const s = validateTrendsSettings(settings);
  const params = new URLSearchParams({
    req: JSON.stringify({
      comparisonItem: s.keywords.map(keyword => ({ keyword, geo: s.geo, time: s.period })),
      category: 0,
      property: '',
    }),
    tz: '0',
    hl: 'en',
    exploreQuery: new URL(trendsExploreUrl(s)).search.slice(1),
  });
  return `https://trends.google.com/trends/embed/explore/${widget}?${params}`;
}
