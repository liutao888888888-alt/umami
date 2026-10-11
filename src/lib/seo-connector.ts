import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const SEO_WEBSITE_ID = 'c395acfd-518e-4689-9839-d46651e7320e';
export const seoInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), websiteId: z.literal(SEO_WEBSITE_ID) }),
  z.object({ action: z.literal('scan'), websiteId: z.literal(SEO_WEBSITE_ID) }),
  z.object({
    action: z.literal('keywords'),
    websiteId: z.literal(SEO_WEBSITE_ID),
    keywords: z
      .array(
        z
          .string()
          .trim()
          .min(2)
          .max(100)
          .regex(/^[^<>\r\n]+$/),
      )
      .max(20),
  }),
  z.object({
    action: z.literal('settings'),
    websiteId: z.literal(SEO_WEBSITE_ID),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.enum(['apply', 'rollback', 'reject']),
    websiteId: z.literal(SEO_WEBSITE_ID),
    taskId: z.uuid(),
  }),
]);
export function signSeoRequest(body: string, key: string, time: string, nonce: string) {
  return createHmac('sha256', key).update(`${time}\n${nonce}\n${body}`).digest('hex');
}
export async function readSeoKey() {
  const key = (await readFile(join(homedir(), '.config/umami-zhodiao.key'), 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('connector-not-configured');
  return key;
}
export function validSeoEvidenceSignature(request: Request, key: string, now = Date.now()) {
  const time = request.headers.get('x-umami-time') || '';
  const nonce = request.headers.get('x-umami-nonce') || '';
  const signature = request.headers.get('x-umami-signature') || '';
  if (
    !/^\d{10}$/.test(time) ||
    Math.abs(now / 1000 - Number(time)) > 60 ||
    !/^[a-f0-9]{32}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = signSeoRequest(`evidence:${SEO_WEBSITE_ID}`, key, time, nonce);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
export async function seoConnector(input: z.infer<typeof seoInput>) {
  const key = await readSeoKey();
  const body = JSON.stringify(input);
  const time = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const response = await fetch('https://zhodiao.com/wp-json/umami-seo/v1/bridge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Umami-Time': time,
      'X-Umami-Nonce': nonce,
      'X-Umami-Signature': signSeoRequest(body, key, time, nonce),
    },
    body,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new Error(response.status === 409 ? 'connector-conflict' : 'connector-unavailable');
  const result = await response.json();
  if (result.websiteId !== SEO_WEBSITE_ID || result.domain !== 'zhodiao.com')
    throw new Error('connector-site-mismatch');
  return result;
}
