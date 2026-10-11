'use client';
import { useState } from 'react';
import { useApi } from '@/components/hooks';
import { formatSiteTime } from '@/lib/site-time';
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
const keywordLabels: Record<string, string> = {
  insufficient: '样本不足，先观察',
  'low-ctr': '优先检查标题和摘要',
  'near-page-one': '审核正文与内链机会',
  observe: '持续观察',
};
function KeywordAnalysis({
  data,
  busy,
  save,
}: {
  data: any;
  busy: boolean;
  save: (keywords: string[]) => Promise<void>;
}) {
  const [terms, setTerms] = useState(data.targets.map((t: any) => t.query).join('\n'));
  const [error, setError] = useState('');
  const targets = terms
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const research = (term: string) =>
    `https://trends.google.com/trends/explore?geo=US&date=today%2012-m&q=${encodeURIComponent(term)}`;
  return (
    <section aria-label="关键词分析">
      <h3>关键词分析与选题</h3>
      <p>
        Search Console
        提供本站真实曝光、点击率及平均位置，不代表全网搜索量或竞争难度。搜索数据覆盖所有国家；下方
        Trends 研究链接默认美国。
      </p>
      <p>
        分析范围：{data.range ? `${data.range.start} 至 ${data.range.end}` : '尚无数据'} ·{' '}
        {data.status === 'connected' ? '已同步' : '数据不可用或已过期'} · 已过滤 {data.excluded}{' '}
        条过长或含搜索操作符的噪声查询。
      </p>
      <p>
        机会规则：至少 30 次曝光，平均位置前 10 且点击率低于 2% 时检查标题摘要；位置 11–20
        时人工审核内容和内链。这些是筛选规则，不能单独判断标题有问题或承诺排名提升。
      </p>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>关键词 / 对应页面</th>
              <th>曝光</th>
              <th>点击</th>
              <th>点击率</th>
              <th>平均位置</th>
              <th>建议</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r: any) => (
              <tr key={`${r.query}:${r.page}`}>
                <td>
                  {r.query}
                  <br />
                  <a href={r.page} target="_blank" rel="noreferrer">
                    {new URL(r.page).pathname}
                  </a>
                </td>
                <td>{r.impressions}</td>
                <td>{r.clicks}</td>
                <td>{(r.ctr * 100).toFixed(1)}%</td>
                <td>{r.position.toFixed(1)}</td>
                <td>
                  {keywordLabels[r.kind]}
                  <br />
                  <a href={research(r.query)} target="_blank" rel="noreferrer">
                    研究美国趋势
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.rows.length && (
        <p>
          {data.status === 'connected'
            ? '暂无可用于分析的有效查询。先设置目标词、研究搜索意图并积累曝光。'
            : '请恢复搜索数据连接后再判断关键词表现。'}
        </p>
      )}
      <label htmlFor="seo-keywords">目标关键词（每行一个，最多 20 个）</label>
      <textarea
        id="seo-keywords"
        rows={6}
        value={terms}
        onChange={e => setTerms(e.target.value)}
        style={{ width: '100%', padding: 12, marginTop: 8 }}
      />
      <div className={styles.toolbar}>
        <button
          disabled={busy}
          onClick={async () => {
            if (
              targets.length > 20 ||
              targets.some(t => t.length < 2 || t.length > 100 || /[<>]/.test(t))
            ) {
              setError('请使用 2–100 字的关键词，最多 20 个。');
              return;
            }
            setError('');
            await save([...new Set(targets)]);
          }}
        >
          保存目标关键词
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p>
        目标词用于选题和相关文章的 DeepSeek
        建议。只有页面内容确实涉及该词时才采用；没有搜索证据时不会因为添加目标词而自动改页面。正文与内链仍由你审核。
      </p>
      <ul>
        {data.targets.map((t: any) => (
          <li key={t.query}>
            {t.query} ·{' '}
            {t.matches.length
              ? `已有 ${t.matches.length} 个页面的查询证据`
              : '暂无该词的本站搜索证据'}{' '}
            ·{' '}
            <a href={research(t.query)} target="_blank" rel="noreferrer">
              研究美国趋势
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
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
            {data.lastScan ? formatSiteTime(data.lastScan, websiteId) : '尚未完成'} · 下次自动检查：
            {data.nextRun ? formatSiteTime(data.nextRun, websiteId) : '尚未排期'}
          </p>
          <p>
            建议依据页面正文、前台检查及有效的站点分析证据。Trends
            图表用于人工研究，不作为自动发布评分。没有数据时不估算搜索量或排名收益。
          </p>
          {data.lastError && <p role="alert">{data.lastError}</p>}
          <p>
            每天美国东部时间（纽约）09:00 开始检查，自动适应夏令时，后台每 5
            分钟分批处理排队页面；完成时间取决于页面数量。
          </p>
          {data.evidence && (
            <p>
              分析证据更新时间：{formatSiteTime(data.evidence.fetchedAt, websiteId)} · Search
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
          {data.keywords && (
            <KeywordAnalysis
              data={data.keywords}
              busy={busy}
              save={keywords => act('keywords', { keywords })}
            />
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
                · {formatSiteTime(t.createdAt, websiteId)}
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
                  应用时间：{formatSiteTime(t.appliedAt, websiteId)} · 执行方式：
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
