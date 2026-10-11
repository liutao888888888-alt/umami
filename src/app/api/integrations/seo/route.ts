import type { z } from 'zod';
import { checkAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { badRequest, forbidden, notFound, serverError } from '@/lib/response';
import { SEO_WEBSITE_ID, seoConnector, seoInput } from '@/lib/seo-connector';

async function authorized(request: Request) {
  const auth = await checkAuth(request);
  return auth?.user?.isAdmin && auth.authType === 'session';
}
async function call(input: z.infer<typeof seoInput>) {
  const website = await prisma.client.website.findFirst({
    where: { id: SEO_WEBSITE_ID, deletedAt: null },
    select: { domain: true },
  });
  if (website?.domain !== 'zhodiao.com') return notFound();
  try {
    return Response.json(await seoConnector(input), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return serverError(
      error instanceof Error && error.message === 'connector-conflict'
        ? '任务状态已变化或正在执行，请刷新后重试。'
        : '暂时无法连接网站自动化，请稍后重试。',
    );
  }
}
export async function GET(request: Request) {
  if (!(await authorized(request))) return forbidden();
  const websiteId = new URL(request.url).searchParams.get('websiteId');
  if (websiteId !== SEO_WEBSITE_ID) return notFound();
  return call({ action: 'status', websiteId });
}
export async function POST(request: Request) {
  if (!(await authorized(request))) return forbidden();
  if (request.headers.get('origin') !== 'https://darkorange-tiger-652673.hostingersite.com')
    return forbidden();
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 2000) return badRequest();
  let input: z.infer<typeof seoInput>;
  try {
    input = seoInput.parse(JSON.parse(raw));
  } catch {
    return badRequest();
  }
  return call(input);
}
