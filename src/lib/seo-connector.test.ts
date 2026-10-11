import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), website: vi.fn(), connector: vi.fn() }));
vi.mock('@/lib/auth', () => ({ checkAuth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ default: { client: { website: { findFirst: mocks.website } } } }));
vi.mock('@/lib/seo-connector', async original => ({
  ...(await original<any>()),
  seoConnector: mocks.connector,
}));

import { GET, POST } from '@/app/api/integrations/seo/route';
import { SEO_WEBSITE_ID, seoInput, signSeoRequest } from './seo-connector';

const origin = 'https://darkorange-tiger-652673.hostingersite.com';
const req = (body: any = {}, source = origin) =>
  new Request(`${origin}/api/integrations/seo`, {
    method: 'POST',
    headers: { origin: source },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { isAdmin: true }, authType: 'session' });
  mocks.website.mockResolvedValue({ domain: 'zhodiao.com' });
  mocks.connector.mockResolvedValue({ websiteId: SEO_WEBSITE_ID, domain: 'zhodiao.com' });
});
test.each([
  null,
  { user: { isAdmin: false }, authType: 'session' },
  { user: { isAdmin: true }, authType: 'api-key' },
])('rejects unauthorized requests before connecting to WordPress', async auth => {
  mocks.auth.mockResolvedValue(auth);
  expect((await POST(req({ action: 'scan', websiteId: SEO_WEBSITE_ID }))).status).toBe(403);
  expect(mocks.connector).not.toHaveBeenCalled();
});
test('rejects other websites and changed domains', async () => {
  expect(
    (
      await GET(
        new Request(
          `${origin}/api/integrations/seo?websiteId=80b20e16-7d9a-44f5-b368-e9ab5b176cd9`,
        ),
      )
    ).status,
  ).toBe(404);
  mocks.website.mockResolvedValue({ domain: 'other.com' });
  expect((await POST(req({ action: 'scan', websiteId: SEO_WEBSITE_ID }))).status).toBe(404);
  expect(mocks.connector).not.toHaveBeenCalled();
});
test('rejects cross-origin changes and unsupported fields/actions', async () => {
  expect(
    (await POST(req({ action: 'scan', websiteId: SEO_WEBSITE_ID }, 'https://attacker.invalid')))
      .status,
  ).toBe(403);
  expect((await POST(req({ action: 'publish-body', websiteId: SEO_WEBSITE_ID }))).status).toBe(400);
  expect(
    seoInput.safeParse({ action: 'settings', websiteId: SEO_WEBSITE_ID, enabled: 'yes' }).success,
  ).toBe(false);
  expect(mocks.connector).not.toHaveBeenCalled();
});
test('forwards only validated site-scoped task commands and hides connector failures', async () => {
  const body = { action: 'scan', websiteId: SEO_WEBSITE_ID, secret: 'must not forward' };
  const response = await POST(req(body));
  expect(response.status).toBe(200);
  expect(mocks.connector).toHaveBeenCalledWith({ action: 'scan', websiteId: SEO_WEBSITE_ID });
  mocks.connector.mockRejectedValue(new Error('private upstream credentials'));
  const failed = await POST(req({ action: 'scan', websiteId: SEO_WEBSITE_ID }));
  expect(await failed.text()).not.toContain('private upstream credentials');
});
test('signature binds timestamp, nonce and body', () => {
  const key = 'a'.repeat(64);
  const valid = signSeoRequest('{"action":"scan"}', key, '123', 'abc');
  expect(valid).toHaveLength(64);
  expect(signSeoRequest('{"action":"apply"}', key, '123', 'abc')).not.toBe(valid);
  expect(signSeoRequest('{"action":"scan"}', key, '124', 'abc')).not.toBe(valid);
  expect(signSeoRequest('{"action":"scan"}', key, '123', 'def')).not.toBe(valid);
});
