'use client';
import { useState } from 'react';
import { useApi } from '@/components/hooks';
import styles from './OverviewPage.module.css';

const labels: Record<string, string> = {
  pending: '待审核',
  applied: '已应用',
  failed: '生成失败',
  conflict: '编辑冲突',
  rejected: '已拒绝',
  executing: '执行中',
  'verification-failed': '验证失败',
  'rolled-back': '已回滚',
  'rollback-unverified': '回滚待核对',
};
export function SeoPanel({ websiteId }: { websiteId: string }) {
  const { get, post, useQuery } = useApi();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['seo-automation', websiteId],
    queryFn: () => get('/integrations/seo', { websiteId }),
    retry: false,
    refetchInterval: 15000,
  });
  const data = query.data;
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setNotice('');
    try {
      await post('/integrations/seo', { websiteId, action, ...extra });
      await query.refetch();
      setNotice(action === 'scan' ? '检查已排队，将逐页检查并生成优化任务。' : '操作已完成。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败，请刷新重试。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.tableSection} style={{ marginTop: 24 }} aria-label="SEO 自动优化">
      <div className={styles.cardHeading}>
        <h2>SEO 自动优化</h2>
        <span className={data?.enabled ? styles.connected : styles.pending}>
          {data?.enabled ? '标题与摘要自动优化已开启' : '自动修改已暂停'}
        </span>
      </div>
      <p>
        仅 zhodiao.com。每天最多优化 3 篇已发布文章，同页修改后观察 28
        天。正文、H1、内链、收录和页面布局只生成待审核问题。
      </p>
      {query.isLoading && <p>正在连接网站自动化…</p>}
      {query.error && <p role="alert">无法连接自动化服务，请稍后刷新。</p>}
      {data && (
        <>
          <div className={styles.toolbar}>
            <button disabled={busy || data.running} onClick={() => act('scan')}>
              {data.running ? `检查中 · 剩余 ${data.remaining} 页` : '立即检查网站'}
            </button>
            <button disabled={busy} onClick={() => act('settings', { enabled: !data.enabled })}>
              {data.enabled ? '暂停自动修改' : '开启标题与摘要自动修改'}
            </button>
            <button disabled={busy} onClick={() => query.refetch()}>
              刷新任务
            </button>
          </div>
          <p>
            DeepSeek：{data.aiConfigured ? '已配置' : '未配置'} · 现有文章自动发布：
            {data.publisher?.enabled ? '已开启' : '未开启'} · 待发布文章：
            {data.publisher?.scheduled ?? 0} 篇。此处优化既有文章，文章排期仍由 WordPress 管理。
          </p>
          <p>
            最近完整检查：
            {data.lastScan ? new Date(data.lastScan).toLocaleString('zh-CN') : '尚未完成'} ·
            下次自动检查：
            {data.nextRun ? new Date(data.nextRun).toLocaleString('zh-CN') : '尚未排期'}
          </p>
          <p>
            建议依据页面正文、前台检查及有效的站点分析证据。Trends
            图表用于人工研究，不作为自动发布评分。没有数据时不估算搜索量或排名收益。
          </p>
          {data.lastError && <p role="alert">{data.lastError}</p>}
          <p>
            每天北京时间 09:00 开始检查，后台每 5 分钟分批处理排队页面；完成时间取决于页面数量。
          </p>
          {data.evidence && (
            <p>
              分析证据更新时间：{new Date(data.evidence.fetchedAt).toLocaleString('zh-CN')} · Search
              Console：
              {data.evidence.searchStatus === 'connected'
                ? `已读取 ${data.evidence.searchRows} 行页面与查询数据`
                : '本轮不可用'}{' '}
              · Umami：
              {data.evidence.behaviorStatus === 'connected'
                ? `已读取 ${data.evidence.behaviorRows} 页访客统计`
                : '本轮不可用'}
              。只保存汇总数据。
            </p>
          )}
          <h3>优化任务与修改记录</h3>
          {!data.tasks?.length && <p>暂无任务。完成检查后，会列出需要优化或审核的页面。</p>}
          {data.tasks?.map((t: any) => (
            <details
              key={t.id}
              style={{ borderTop: '1px solid var(--zen-border-color, #ddd)', padding: '16px 0' }}
            >
              <summary>
                {labels[t.status] || t.status} · {t.name}
              </summary>
              <p>
                <a href={t.url} target="_blank" rel="noreferrer">
                  打开原页面
                </a>{' '}
                · {new Date(t.createdAt).toLocaleString('zh-CN')}
              </p>
              <p>检查依据：{t.issues.join('；')}</p>
              {t.evidence && (
                <p>
                  该页搜索查询证据：{t.evidence.search.length} 行 · Umami 访客：
                  {t.evidence.behavior?.visitors ?? '暂无该页数据'}。
                  {!t.evidence.search.length && '搜索证据不足，建议仅依据现有页面。'}
                </p>
              )}
              <p>
                原标题：{t.before.title}
                <br />
                原摘要：{t.before.description || '未设置'}
              </p>
              {t.proposed && (
                <p>
                  建议标题：{t.proposed.title}
                  <br />
                  建议摘要：{t.proposed.description}
                </p>
              )}
              <p>{t.message}</p>
              {t.appliedAt && (
                <p>
                  应用时间：{new Date(t.appliedAt).toLocaleString('zh-CN')} · 执行方式：
                  {t.actor === 'automatic' ? '自动' : '管理员'}
                </p>
              )}
              <div className={styles.toolbar}>
                {t.status === 'pending' && t.kind === 'metadata' && (
                  <button disabled={busy} onClick={() => act('apply', { taskId: t.id })}>
                    审核并应用标题与摘要
                  </button>
                )}
                {t.status === 'pending' && (
                  <button disabled={busy} onClick={() => act('reject', { taskId: t.id })}>
                    拒绝此任务
                  </button>
                )}
                {['applied', 'verification-failed'].includes(t.status) && (
                  <button disabled={busy} onClick={() => act('rollback', { taskId: t.id })}>
                    回滚此项修改
                  </button>
                )}
                {t.kind === 'review' && (
                  <a
                    href={`https://zhodiao.com/wp-admin/post.php?post=${t.pageId}&action=edit`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    去 WordPress 审核处理
                  </a>
                )}
              </div>
            </details>
          ))}
          <h3>页面检查</h3>
          <p>本轮已检查 {data.pages?.length ?? 0} 页，仅读取已发布页面。</p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>页面</th>
                  <th>检查结果</th>
                </tr>
              </thead>
              <tbody>
                {data.pages?.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.name}
                      </a>
                    </td>
                    <td>{p.issues.length ? p.issues.join('；') : '本轮基础检查未发现问题'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
