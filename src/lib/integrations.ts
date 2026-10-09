import { createPrivateKey, sign } from 'node:crypto';
import { z } from 'zod';
import { decrypt, encrypt, secret } from '@/lib/crypto';
import prisma from '@/lib/prisma';

const KEY = 'website-integrations-v1';
const siteSchema = z.object({
  gaPropertyId: z.string().regex(/^\d*$/).max(30).default(''),
  searchConsoleSite: z
    .string()
    .max(500)
    .refine(v => !v || /^sc-domain:[a-z0-9.-]+$/.test(v) || /^https?:\/\/[^\s]+$/.test(v))
    .default(''),
  cloudflareZoneId: z
    .string()
    .regex(/^([a-f0-9]{32})?$/i)
    .default(''),
});
export const integrationInput = z.object({
  sites: z.record(z.uuid(), siteSchema),
  googleServiceAccount: z.string().max(20000).optional(),
  cloudflareToken: z
    .string()
    .trim()
    .max(500)
    .regex(/^[A-Za-z0-9_-]*$/)
    .optional(),
});
type Credentials = { client_email: string; private_key: string; private_key_id?: string };
export type IntegrationConfig = {
  sites: Record<string, z.infer<typeof siteSchema>>;
  google?: Credentials;
  cloudflareToken?: string;
};
export type SourceResult = {
  status: 'connected' | 'not-configured' | 'error';
  message?: string;
  metrics?: Record<string, number>;
  rows?: { name: string; clicks: number; impressions: number; position: number }[];
  timezone?: string;
};

export async function readIntegrationConfig(): Promise<IntegrationConfig> {
  const row = await prisma.client.appSetting.findUnique({ where: { key: KEY } });
  return row ? JSON.parse(decrypt(row.value, secret())) : { sites: {} };
}

// Never return stored credentials or provider responses to the browser.
export function publicIntegrationConfig(config: IntegrationConfig) {
  return {
    sites: config.sites,
    googleConfigured: !!config.google,
    googleEmail: config.google?.client_email || '',
    cloudflareConfigured: !!config.cloudflareToken,
  };
}

export function mergeIntegrationConfig(
  config: IntegrationConfig,
  input: z.infer<typeof integrationInput>,
) {
  const next = { ...config, sites: input.sites };
  if (input.googleServiceAccount?.trim()) {
    const raw = JSON.parse(input.googleServiceAccount);
    if (
      raw.type !== 'service_account' ||
      !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(raw.client_email) ||
      typeof raw.private_key !== 'string'
    ) {
      throw new Error('invalid-service-account');
    }
    const key = createPrivateKey(raw.private_key);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('invalid-key');
    next.google = { client_email: raw.client_email, private_key: raw.private_key };
  }
  if (input.cloudflareToken) next.cloudflareToken = input.cloudflareToken;
  return next;
}

export async function writeIntegrationConfig(config: IntegrationConfig) {
  const value = encrypt(JSON.stringify(config), secret());
  await prisma.client.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
}

class ProviderError extends Error {
  constructor(public status: number) {
    super('provider-request-failed');
  }
}
async function requestJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok) throw new ProviderError(response.status);
  return response.json();
}

async function googleToken(credentials: Credentials, scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: credentials.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url')}`;
  const data = await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!data.access_token) throw new ProviderError(401);
  return data.access_token;
}

const missing = (message: string): SourceResult => ({ status: 'not-configured', message });
async function source(run: () => Promise<SourceResult>): Promise<SourceResult> {
  try {
    return await run();
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 0;
    return {
      status: 'error',
      message:
        status === 401 || status === 400
          ? '连接未通过验证，请检查凭证、网站 ID 和 API 是否已启用。'
          : status === 403
            ? '暂无读取权限，或当前套餐不支持所选数据范围。'
            : status === 429
              ? '平台请求过多，请稍后刷新。'
              : '暂时无法读取平台数据，请稍后刷新或检查接入设置。',
    };
  }
}

export function reportingRange(days: number, now = new Date()) {
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(until.getTime() - days * 86400000);
  const end = new Date(until.getTime() - 86400000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}

export async function getExternalOverview(
  config: IntegrationConfig,
  websiteId: string,
  days: number,
) {
  const site = config.sites[websiteId];
  const range = reportingRange(days);
  const [ga4, searchConsole, cloudflare] = await Promise.all([
    !config.google || !site?.gaPropertyId
      ? missing('填写 GA4 属性 ID 并连接 Google 只读账号。')
      : source(async () => {
          const token = await googleToken(
            config.google,
            'https://www.googleapis.com/auth/analytics.readonly',
          );
          const data = await requestJson(
            `https://analyticsdata.googleapis.com/v1beta/properties/${site.gaPropertyId}:runReport`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dateRanges: [{ startDate: range.start, endDate: range.end }],
                metrics: [
                  { name: 'activeUsers' },
                  { name: 'sessions' },
                  { name: 'screenPageViews' },
                  { name: 'keyEvents' },
                ],
              }),
            },
          );
          const values = data.rows?.[0]?.metricValues || [];
          return {
            status: 'connected',
            timezone: data.metadata?.timeZone,
            metrics: Object.fromEntries(
              ['users', 'sessions', 'views', 'keyEvents'].map((key, i) => [
                key,
                Number(values[i]?.value || 0),
              ]),
            ),
          };
        }),
    !config.google || !site?.searchConsoleSite
      ? missing('填写 Search Console 资源名称并连接 Google 只读账号。')
      : source(async () => {
          const token = await googleToken(
            config.google,
            'https://www.googleapis.com/auth/webmasters.readonly',
          );
          const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.searchConsoleSite)}/searchAnalytics/query`;
          const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
          const base = {
            startDate: range.start,
            endDate: range.end,
            type: 'web',
            dataState: 'final',
          };
          const [total, queries] = await Promise.all([
            requestJson(url, { method: 'POST', headers, body: JSON.stringify(base) }),
            requestJson(url, {
              method: 'POST',
              headers,
              body: JSON.stringify({ ...base, dimensions: ['query'], rowLimit: 10 }),
            }),
          ]);
          const row = total.rows?.[0] || {};
          return {
            status: 'connected',
            timezone: 'America/Los_Angeles',
            metrics: {
              clicks: row.clicks || 0,
              impressions: row.impressions || 0,
              ctr: row.ctr || 0,
              position: row.position || 0,
            },
            rows: (queries.rows || []).map((r: any) => ({
              name: r.keys[0],
              clicks: r.clicks,
              impressions: r.impressions,
              position: r.position,
            })),
          };
        }),
    !config.cloudflareToken || !site?.cloudflareZoneId
      ? missing('填写 Zone ID 并连接 Cloudflare 只读令牌。')
      : source(async () => {
          const data = await requestJson('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.cloudflareToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `query Overview($zone: String!, $start: Date!, $end: Date!) {
          viewer { zones(filter: {zoneTag: $zone}) { httpRequests1dGroups(limit: 31, filter: {date_geq: $start, date_lt: $end}) {
            sum { requests bytes cachedRequests threats } dimensions { date }
          } } }
        }`,
              variables: { zone: site.cloudflareZoneId, start: range.start, end: range.until },
            }),
          });
          if (data.errors?.length) throw new ProviderError(403);
          const zone = data.data?.viewer?.zones?.[0];
          if (!zone || !Array.isArray(zone.httpRequests1dGroups)) throw new ProviderError(403);
          const metrics = { requests: 0, bytes: 0, cachedRequests: 0, threats: 0 };
          zone.httpRequests1dGroups.forEach((r: any) => {
            for (const key of Object.keys(metrics)) metrics[key] += Number(r.sum?.[key] || 0);
          });
          return { status: 'connected', timezone: 'UTC', metrics };
        }),
  ]);
  return { range, ga4, searchConsole, cloudflare };
}
