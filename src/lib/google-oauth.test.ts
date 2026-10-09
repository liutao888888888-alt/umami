import { OAuth2Client } from 'google-auth-library';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  checkAuth: mocks.auth,
  getBearerToken: () => 'existing-session-secret',
}));
vi.mock('@/lib/integrations', () => ({
  readIntegrationConfig: mocks.read,
  writeIntegrationConfig: mocks.write,
}));
vi.mock('@/lib/crypto', async original => ({
  ...(await original<any>()),
  secret: () => 'test-encryption-secret',
}));
import { beginGoogleOAuth, finishGoogleOAuth, GOOGLE_SCOPES } from './google-oauth';
import { POST } from '@/app/api/integrations/google/route';
const config = () => ({
  sites: {},
  googleOAuth: {
    clientId: 'example.apps.googleusercontent.com',
    clientSecret: 'client-secret',
    redirectUri: 'https://umami.invalid/api/integrations/google/callback',
  },
});
const request = (origin = 'https://umami.invalid') =>
  new Request('https://umami.invalid/api/integrations/google', {
    method: 'POST',
    headers: { origin, authorization: 'Bearer existing-session-secret' },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { isAdmin: true }, authType: 'session' });
  mocks.read.mockImplementation(async () => config());
});
afterEach(() => vi.restoreAllMocks());
async function callback(stateOverride?: string) {
  const start = await beginGoogleOAuth(request(), config());
  const { url } = await start.json();
  const state = stateOverride ?? new URL(url).searchParams.get('state');
  return new Request(`${config().googleOAuth.redirectUri}?state=${state}&code=one-time-code`, {
    headers: { cookie: (start.headers.get('set-cookie') || '').split(';')[0] },
  });
}
test('authorization requests only readonly scopes, offline access and PKCE; state cookie hides session', async () => {
  const result = await beginGoogleOAuth(request(), config());
  const url = new URL((await result.json()).url);
  expect(url.origin).toBe('https://accounts.google.com');
  expect(url.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_SCOPES);
  expect(url.searchParams.get('access_type')).toBe('offline');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  const cookie = result.headers.get('set-cookie') || '';
  expect(cookie).toContain('HttpOnly; Secure; SameSite=Lax');
  expect(cookie).not.toContain('existing-session-secret');
  expect(cookie).not.toContain('client-secret');
});
test('cross-origin authorization initiation is rejected', async () => {
  await expect(beginGoogleOAuth(request('https://attacker.invalid'), config())).rejects.toThrow(
    'invalid-origin',
  );
});
test.each([
  null,
  { user: { isAdmin: false }, authType: 'session' },
  { user: { isAdmin: true }, authType: 'api-key' },
])('only an admin session can begin authorization', async auth => {
  mocks.auth.mockResolvedValue(auth);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
test('wrong state cannot exchange the code or persist credentials', async () => {
  const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken');
  const response = await finishGoogleOAuth(await callback('wrong-state'));
  expect(response.headers.get('location')).toBe('/overview?google=failed');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(exchange).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});
test('expired pending authorization cannot save credentials', async () => {
  const req = await callback();
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 601000);
  expect((await finishGoogleOAuth(req)).headers.get('location')).toBe('/overview?google=failed');
  expect(mocks.write).not.toHaveBeenCalled();
  now.mockRestore();
});
test('admin session is revalidated on callback', async () => {
  const req = await callback();
  mocks.auth.mockResolvedValue(null);
  expect((await finishGoogleOAuth(req)).headers.get('location')).toBe('/overview?google=failed');
  expect(mocks.write).not.toHaveBeenCalled();
});
test('callback persists refresh token only after PKCE exchange and both scopes, without returning secrets', async () => {
  const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({
    tokens: { refresh_token: 'never-return-refresh-token', scope: GOOGLE_SCOPES.join(' ') },
  } as any);
  const response = await finishGoogleOAuth(await callback());
  expect(exchange).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'one-time-code',
      codeVerifier: expect.any(String),
      redirect_uri: config().googleOAuth.redirectUri,
    }),
  );
  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({
      googleOAuth: expect.objectContaining({ refreshToken: 'never-return-refresh-token' }),
    }),
  );
  expect(response.headers.get('location')).toBe('/overview?google=connected');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(await response.text()).not.toContain('never-return-refresh-token');
});
test('partial consent does not create a misleading connected status', async () => {
  vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({
    tokens: { refresh_token: 'secret', scope: GOOGLE_SCOPES[0] },
  } as any);
  expect((await finishGoogleOAuth(await callback())).headers.get('location')).toBe(
    '/overview?google=failed',
  );
  expect(mocks.write).not.toHaveBeenCalled();
});
