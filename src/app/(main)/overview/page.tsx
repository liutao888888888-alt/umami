import type { Metadata } from 'next';
import { OverviewPage } from './OverviewPage';

export default function Page() {
  return <OverviewPage />;
}
export const metadata: Metadata = { title: '网站总览' };
