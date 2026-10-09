import { checkAuth } from '@/lib/auth';
import { adminSession, beginGoogleOAuth } from '@/lib/google-oauth';
import { readIntegrationConfig } from '@/lib/integrations';
import { badRequest, forbidden } from '@/lib/response';

export async function POST(request: Request) {
  if (!adminSession(await checkAuth(request))) return forbidden();
  try {
    return await beginGoogleOAuth(request, await readIntegrationConfig());
  } catch {
    return badRequest({ message: '请先保存有效的 Google OAuth 客户端 JSON，并核对回调地址。' });
  }
}
