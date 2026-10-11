import { z } from 'zod';
import { checkAuth } from '@/lib/auth';
import { adminSession, beginGoogleOAuth } from '@/lib/google-oauth';
import { readIntegrationConfig } from '@/lib/integrations';
import { badRequest, forbidden } from '@/lib/response';

export async function POST(request: Request) {
  if (!adminSession(await checkAuth(request))) return forbidden();
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1000) return badRequest();
    const { websiteId } = z
      .object({ websiteId: z.uuid().optional() })
      .parse(raw ? JSON.parse(raw) : {});
    return await beginGoogleOAuth(request, await readIntegrationConfig(), websiteId);
  } catch {
    return badRequest({ message: '请先保存有效的 Google OAuth 客户端 JSON，并核对回调地址。' });
  }
}
