import { z } from 'zod';
import { checkAuth } from '@/lib/auth';
import {
  getExternalOverview,
  integrationInput,
  mergeIntegrationConfig,
  publicIntegrationConfig,
  readIntegrationConfig,
  writeIntegrationConfig,
} from '@/lib/integrations';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { badRequest, forbidden, notFound, serverError } from '@/lib/response';
import { getWebsiteStats } from '@/queries/sql';

const querySchema = z.object({
  websiteId: z.uuid().optional(),
  days: z.enum(['1', '7', '28']).default('7'),
});
const privateJson = (data: any) =>
  Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
const isAdminSession = (auth: any) => auth?.user?.isAdmin && auth.authType === 'session';

export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, querySchema);
  if (error) return error();
  if (!isAdminSession(auth)) return forbidden();
  try {
    const config = await readIntegrationConfig();
    if (!query.websiteId) {
      const websites = await prisma.client.website.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, domain: true },
        orderBy: { name: 'asc' },
      });
      return privateJson({ ...publicIntegrationConfig(config), websites });
    }
    const website = await prisma.client.website.findFirst({
      where: { id: query.websiteId, deletedAt: null },
    });
    if (!website) return notFound();
    const external = await getExternalOverview(config, website.id, Number(query.days));
    let umami: any;
    try {
      const stats: any = await getWebsiteStats(website.id, {
        startDate: new Date(`${external.range.start}T00:00:00Z`),
        endDate: new Date(new Date(`${external.range.until}T00:00:00Z`).getTime() - 1),
        timezone: 'UTC',
      });
      umami = {
        status: 'connected',
        metrics: {
          visitors: Number(stats.visitors),
          visits: Number(stats.visits),
          views: Number(stats.pageviews),
        },
        timezone: 'UTC',
      };
    } catch {
      umami = { status: 'error', message: '暂时无法读取 Umami 数据，请稍后刷新。' };
    }
    return privateJson({ ...external, umami, fetchedAt: new Date().toISOString() });
  } catch {
    return serverError('无法读取接入设置，请检查服务器配置。');
  }
}

export async function POST(request: Request) {
  // Authenticate before accepting or parsing credentials, and cap request size.
  const auth = await checkAuth(request);
  if (!isAdminSession(auth)) return forbidden();
  const raw = await request.clone().text();
  if (Buffer.byteLength(raw) > 32000) return badRequest();
  let input: z.infer<typeof integrationInput>;
  try {
    input = integrationInput.parse(JSON.parse(raw));
  } catch {
    return badRequest({ message: '请检查网站 ID、属性 ID、资源名称和凭证格式。' });
  }
  let config;
  try {
    config = mergeIntegrationConfig(await readIntegrationConfig(), input);
  } catch {
    return badRequest({ message: 'Google 凭证无效，请使用服务账号的 JSON 密钥文件。' });
  }
  try {
    const ids = Object.keys(config.sites);
    const count = await prisma.client.website.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (count !== ids.length) return badRequest({ message: '配置中包含不存在的网站。' });
    await writeIntegrationConfig(config);
    return privateJson({ ok: true, ...publicIntegrationConfig(config) });
  } catch {
    return serverError('接入设置未保存，请稍后重试。');
  }
}
