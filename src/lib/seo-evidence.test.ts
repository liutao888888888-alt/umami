import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  key: vi.fn(),
  website: vi.fn(),
  config: vi.fn(),
  search: vi.fn(),
  metrics: vi.fn(),
}));
vi.mock('@/lib/seo-connector', async original => ({
  ...(await original<any>()),
  readSeoKey: mocks.key,
}));
vi.mock('@/lib/prisma', () => ({ default: { client: { website: { findFirst: mocks.website } } } }));
vi.mock('@/lib/integrations', () => ({
  readIntegrationConfig: mocks.config,
  getZhodiaoSearchEvidence: mocks.search,
  reportingRange: () => ({ start: '2026-09-13', end: '2026-10-10', until: '2026-10-11' }),
}));
vi.mock('@/queries/sql', () => ({ getPageviewMetrics: mocks.metrics }));

import { GET } from '@/app/api/integrations/seo/evidence/route';
import { SEO_WEBSITE_ID, signSeoRequest } from './seo-connector';

function request(valid = true) {
  const time = Math.floor(Date.now() / 1000).toString(),
    nonce = 'b'.repeat(32);
  return new Request('https://umami.invalid/api/integrations/seo/evidence', {
    headers: {
      'x-umami-time': time,
      'x-umami-nonce': nonce,
      'x-umami-signature': signSeoRequest(
        `evidence:${SEO_WEBSITE_ID}`,
        valid ? 'a'.repeat(64) : 'c'.repeat(64),
        time,
        nonce,
      ),
    },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.key.mockResolvedValue('a'.repeat(64));
  mocks.website.mockResolvedValue({ domain: 'zhodiao.com' });
  mocks.config.mockResolvedValue({ sites: {} });
  mocks.search.mockResolvedValue({ status: 'connected', rows: [] });
  mocks.metrics.mockResolvedValue([
    { x: '/guide/', y: 4 },
    { x: '//attacker.invalid/', y: 1 },
    { x: 'not-a-path', y: 1 },
  ]);
});
test('worker signature required before database or Google access', async () => {
  expect((await GET(request(false))).status).toBe(403);
  expect(mocks.website).not.toHaveBeenCalled();
  expect(mocks.search).not.toHaveBeenCalled();
});
test('deleted or changed website refuses provider queries', async () => {
  mocks.website.mockResolvedValue({ domain: 'other.com' });
  expect((await GET(request())).status).toBe(404);
  expect(mocks.search).not.toHaveBeenCalled();
});
test('returns aggregate page visitors without session data, pinned to own website', async () => {
  const result = await (await GET(request())).json();
  expect(result.behavior.rows).toEqual([{ page: 'https://zhodiao.com/guide/', visitors: 4 }]);
  expect(mocks.metrics.mock.calls[0][0]).toBe(SEO_WEBSITE_ID);
  expect(result.search.status).toBe('connected');
  expect(result.search.rows).toEqual([]);
});
test('behavior read failures are errors rather than zeros', async () => {
  mocks.metrics.mockRejectedValue(new Error('private db error'));
  const result = await (await GET(request())).json();
  expect(result.behavior).toEqual({ status: 'error', rows: [] });
  expect(JSON.stringify(result)).not.toContain('private db error');
});
