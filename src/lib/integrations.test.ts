import { generateKeyPairSync } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ default: { client: {} } }));
vi.mock('@/lib/crypto', () => ({ decrypt: vi.fn(), encrypt: vi.fn(), secret: vi.fn() }));
import {
  getExternalOverview,
  integrationInput,
  mergeIntegrationConfig,
  publicIntegrationConfig,
  reportingRange,
} from './integrations';

const id = 'c395acfd-518e-4689-9839-d46651e7320e';
afterEach(() => vi.unstubAllGlobals());

test('date range uses complete UTC days across month and year boundaries', () => {
  expect(reportingRange(7, new Date('2026-01-02T23:50:00Z'))).toEqual({
    start: '2025-12-26',
    end: '2026-01-01',
    until: '2026-01-02',
  });
});
test('unconfigured sources are not reported as zero traffic and do not contact providers', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const result = await getExternalOverview({ sites: {} }, id, 7);
  expect(result.ga4.status).toBe('not-configured');
  expect(result.searchConsole.status).toBe('not-configured');
  expect(result.cloudflare.metrics).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});
test('public configuration excludes credentials and blank updates preserve existing tokens', () => {
  const config = {
    sites: {},
    google: { client_email: 'app@project.iam.gserviceaccount.com', private_key: 'secret-key' },
    cloudflareToken: 'secret-token',
  };
  const next = mergeIntegrationConfig(config, {
    sites: {},
    googleServiceAccount: '',
    cloudflareToken: '',
  });
  expect(next.google).toEqual(config.google);
  expect(next.cloudflareToken).toBe('secret-token');
  expect(JSON.stringify(publicIntegrationConfig(next))).not.toContain('secret');
});
test('Cloudflare GraphQL authorization errors never expose provider response or credentials', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ errors: [{ message: 'token=secret-token' }] })),
  );
  const result = await getExternalOverview(
    {
      sites: {
        [id]: { gaPropertyId: '', searchConsoleSite: '', cloudflareZoneId: 'a'.repeat(32) },
      },
      cloudflareToken: 'secret-token',
    },
    id,
    1,
  );
  expect(result.cloudflare.status).toBe('error');
  expect(JSON.stringify(result)).not.toContain('secret-token');
  expect(result.cloudflare.metrics).toBeUndefined();
});
test('Cloudflare totals aggregate all returned days and distinguish empty authorized data', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          data: {
            viewer: {
              zones: [
                {
                  httpRequests1dGroups: [
                    { sum: { requests: 10, bytes: 20, cachedRequests: 8, threats: 1 } },
                    { sum: { requests: 5, bytes: 10, cachedRequests: 2, threats: 0 } },
                  ],
                },
              ],
            },
          },
        }),
      ),
  );
  const result = await getExternalOverview(
    {
      sites: {
        [id]: { gaPropertyId: '', searchConsoleSite: '', cloudflareZoneId: 'a'.repeat(32) },
      },
      cloudflareToken: 'token',
    },
    id,
    7,
  );
  expect(result.cloudflare.metrics).toEqual({
    requests: 15,
    bytes: 30,
    cachedRequests: 10,
    threats: 1,
  });
});
test('credential-provided token URLs are not retained and IDs cannot become arbitrary URLs', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = mergeIntegrationConfig(
    { sites: {} },
    {
      sites: {},
      googleServiceAccount: JSON.stringify({
        type: 'service_account',
        client_email: 'app@project.iam.gserviceaccount.com',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        token_uri: 'https://attacker.invalid',
      }),
    },
  );
  expect(config.google).not.toHaveProperty('token_uri');
  expect(
    integrationInput.safeParse({ sites: { [id]: { gaPropertyId: '../other' } } }).success,
  ).toBe(false);
});
