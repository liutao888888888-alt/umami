import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { checkAuth, getBearerToken } from '@/lib/auth';
import { decrypt, encrypt, hash, secret } from '@/lib/crypto';
import {
  readIntegrationConfig,
  writeIntegrationConfig,
  type IntegrationConfig,
} from '@/lib/integrations';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];
const COOKIE = '__Secure-umami-google-oauth';
const COOKIE_PATH = '/api/integrations/google/callback';
const cookieHeader = (value: string, age: number) =>
  `${COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
const fingerprint = (c: NonNullable<IntegrationConfig['googleOAuth']>) =>
  hash(`${c.clientId}:${c.clientSecret}:${c.redirectUri}`);
export const adminSession = (auth: any) => auth?.user?.isAdmin && auth.authType === 'session';

export async function beginGoogleOAuth(request: Request, config: IntegrationConfig) {
  const c = config.googleOAuth;
  if (!c) throw new Error('not-configured');
  // Only the configured app origin may initiate a browser-bound authorization.
  if (request.headers.get('origin') !== new URL(c.redirectUri).origin)
    throw new Error('invalid-origin');
  const client = new OAuth2Client({
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    redirectUri: c.redirectUri,
    transporterOptions: { timeout: 15000, retry: false },
  });
  const verifier = await client.generateCodeVerifierAsync();
  const state = randomBytes(32).toString('base64url');
  const pending = {
    state,
    verifier: verifier.codeVerifier,
    authToken: getBearerToken(request),
    fingerprint: fingerprint(c),
    expires: Date.now() + 600000,
  };
  const url = client.generateAuthUrl({
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: verifier.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return Response.json(
    { url },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'Set-Cookie': cookieHeader(
          encodeURIComponent(encrypt(JSON.stringify(pending), secret())),
          600,
        ),
      },
    },
  );
}

export function equalState(a: unknown, b: unknown) {
  if (
    typeof a !== 'string' ||
    typeof b !== 'string' ||
    !a ||
    a.length > 200 ||
    a.length !== b.length
  )
    return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function finishGoogleOAuth(request: Request) {
  // The pending cookie contains the existing session, is browser-bound, short-lived,
  // encrypted and HttpOnly. Revalidate that session and admin rights before saving.
  let outcome = 'failed';
  try {
    const value = request.headers
      .get('cookie')
      ?.split(';')
      .map(s => s.trim())
      .find(s => s.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (!value || value.length > 12000) throw new Error('invalid-cookie');
    const pending = JSON.parse(decrypt(decodeURIComponent(value), secret()));
    const q = new URL(request.url).searchParams;
    if (
      !equalState(q.get('state'), pending.state) ||
      !Number.isFinite(pending.expires) ||
      pending.expires < Date.now() ||
      pending.expires > Date.now() + 600000
    )
      throw new Error('invalid-state');
    const auth = await checkAuth(
      new Request(request.url, { headers: { authorization: `Bearer ${pending.authToken}` } }),
    );
    if (!adminSession(auth)) throw new Error('invalid-session');
    const config = await readIntegrationConfig();
    const c = config.googleOAuth;
    if (!c || fingerprint(c) !== pending.fingerprint) throw new Error('config-changed');
    if (q.has('error')) {
      outcome = 'cancelled';
    } else {
      const code = q.get('code');
      if (!code || code.length > 4000) throw new Error('invalid-code');
      const client = new OAuth2Client({
        clientId: c.clientId,
        clientSecret: c.clientSecret,
        redirectUri: c.redirectUri,
        transporterOptions: { timeout: 15000, retry: false },
      });
      const { tokens } = await client.getToken({
        code,
        codeVerifier: pending.verifier,
        redirect_uri: c.redirectUri,
      });
      const scopes = tokens.scope?.split(' ') || [];
      if (!tokens.refresh_token || !GOOGLE_SCOPES.every(scope => scopes.includes(scope)))
        throw new Error('incomplete-grant');
      const latest = await readIntegrationConfig();
      if (!latest.googleOAuth || fingerprint(latest.googleOAuth) !== pending.fingerprint)
        throw new Error('config-changed');
      latest.googleOAuth.refreshToken = tokens.refresh_token;
      await writeIntegrationConfig(latest);
      outcome = 'connected';
    }
  } catch {
    /* Do not log authorization codes, cookies, tokens or provider errors. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/overview?google=${outcome}`,
      'Set-Cookie': cookieHeader('', 0),
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
