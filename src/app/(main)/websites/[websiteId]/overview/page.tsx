import type { Metadata } from 'next';
import { OverviewPage } from './OverviewPage';

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <OverviewPage key={websiteId} websiteId={websiteId} />;
}

export const metadata: Metadata = { title: '网站总览' };
