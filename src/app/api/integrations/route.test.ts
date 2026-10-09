import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  parseRequest: vi.fn(),
  checkAuth: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  external: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  stats: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ checkAuth: mocks.checkAuth }));
vi.mock('@/lib/request', () => ({ parseRequest: mocks.parseRequest }));
vi.mock('@/lib/integrations', async importOriginal => {
  const original: any = await importOriginal();
  return {
    ...original,
    readIntegrationConfig: mocks.read,
    writeIntegrationConfig: mocks.write,
    getExternalOverview: mocks.external,
  };
});
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      website: { findMany: mocks.findMany, findFirst: mocks.findFirst, count: mocks.count },
    },
  },
}));
vi.mock('@/queries/sql', () => ({ getWebsiteStats: mocks.stats }));
import { GET, POST } from './route';
const admin = { user: { isAdmin: true }, authType: 'session' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseRequest.mockResolvedValue({ auth: admin, query: {}, error: null });
  mocks.checkAuth.mockResolvedValue(admin);
  mocks.read.mockResolvedValue({ sites: {}, cloudflareToken: 'never-return-this' });
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});
test.each([
  null,
  { user: { isAdmin: false }, authType: 'session' },
  { user: { isAdmin: true }, authType: 'api-key' },
  { authType: 'share' },
])('GET denies non-admin-session identities', async auth => {
  mocks.parseRequest.mockResolvedValue({ auth, query: {}, error: null });
  expect((await GET(new Request('https://umami.invalid/api/integrations'))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
test('POST rejects unauthenticated input before reading credential body', async () => {
  mocks.checkAuth.mockResolvedValue(null);
  const request = new Request('https://umami.invalid/api/integrations', {
    method: 'POST',
    body: '{}',
  });
  const clone = vi.spyOn(request, 'clone');
  expect((await POST(request)).status).toBe(403);
  expect(clone).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});
test('settings response is private, uncached and contains no stored token', async () => {
  const response = await GET(new Request('https://umami.invalid/api/integrations'));
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.text()).not.toContain('never-return-this');
});
test('saving IDs preserves encrypted credentials server-side without returning them', async () => {
  const response = await POST(
    new Request('https://umami.invalid/api/integrations', {
      method: 'POST',
      body: JSON.stringify({ sites: {} }),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.write).toHaveBeenCalledWith({ sites: {}, cloudflareToken: 'never-return-this' });
  expect(await response.text()).not.toContain('never-return-this');
});
