import {
  getZhodiaoSearchEvidence,
  readIntegrationConfig,
  reportingRange,
} from '@/lib/integrations';
import prisma from '@/lib/prisma';
import { forbidden, notFound, serverError } from '@/lib/response';
import { readSeoKey, SEO_WEBSITE_ID, validSeoEvidenceSignature } from '@/lib/seo-connector';
import { rangeBoundaries, ZHODIAO_TIMEZONE } from '@/lib/site-time';
import { getPageviewMetrics } from '@/queries/sql';

// A fixed, signed read-only channel for the site's scheduled worker; no user token or arbitrary provider IDs.
export async function GET(request: Request) {
  try {
    if (!validSeoEvidenceSignature(request, await readSeoKey())) return forbidden();
    const website = await prisma.client.website.findFirst({
      where: { id: SEO_WEBSITE_ID, deletedAt: null },
      select: { domain: true },
    });
    if (website?.domain !== 'zhodiao.com') return notFound();
    const range = reportingRange(28, new Date(), ZHODIAO_TIMEZONE);
    const search = await getZhodiaoSearchEvidence(await readIntegrationConfig());
    let behavior: { status: string; rows: { page: string; visitors: number }[] } = {
      status: 'error',
      rows: [],
    };
    try {
      const rows = await getPageviewMetrics(
        SEO_WEBSITE_ID,
        { type: 'path', limit: 1000 },
        rangeBoundaries(range, ZHODIAO_TIMEZONE),
      );
      behavior = {
        status: 'connected',
        rows: rows
          .filter(row => row.x.startsWith('/') && !row.x.startsWith('//'))
          .map(row => ({ page: `https://zhodiao.com${row.x}`, visitors: Number(row.y) })),
      };
    } catch {}
    return Response.json(
      {
        websiteId: SEO_WEBSITE_ID,
        domain: 'zhodiao.com',
        fetchedAt: new Date().toISOString(),
        range,
        search,
        behavior,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return serverError('无法读取站点分析证据。');
  }
}
