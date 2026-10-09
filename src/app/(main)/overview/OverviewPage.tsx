'use client';
import { useEffect, useState } from 'react';
import { useApi, useLoginQuery } from '@/components/hooks';
import Link from '@/components/common/Link';
import type { SourceResult } from '@/lib/integrations';
import styles from './OverviewPage.module.css';

const emptySite = { gaPropertyId: '', searchConsoleSite: '', cloudflareZoneId: '' };
const number = (v: number) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(v);
const percent = (v: number) => `${number(v * 100)}%`;
const bytes = (v: number) => `${number(v / 1024 / 1024)} MB`;

export function OverviewPage() {
  const { user } = useLoginQuery();
  const { get, post, useQuery } = useApi();
  const [websiteId, setWebsiteId] = useState('');
  const [days, setDays] = useState('7');
  const [setup, setSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [site, setSite] = useState(emptySite);
  const [google, setGoogle] = useState('');
  const [oauthClient, setOAuthClient] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [googleResult, setGoogleResult] = useState('');
  const [origin, setOrigin] = useState('');
  const [cloudflare, setCloudflare] = useState('');
  const config = useQuery({
    queryKey: ['integrations-config'],
    queryFn: () => get('/integrations'),
    enabled: !!user?.isAdmin,
  });
  const overview = useQuery({
    queryKey: ['integrations-overview', websiteId, days],
    queryFn: () => get('/integrations', { websiteId, days }),
    enabled: !!websiteId && !!user?.isAdmin,
    staleTime: 300000,
    retry: false,
  });
  useEffect(() => {
    setGoogleResult(new URLSearchParams(window.location.search).get('google') || '');
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (!websiteId && config.data?.websites?.length) setWebsiteId(config.data.websites[0].id);
  }, [config.data, websiteId]);
  useEffect(() => {
    setSite({ ...emptySite, ...config.data?.sites?.[websiteId] });
    setNotice('');
  }, [config.data, websiteId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      await post('/integrations', {
        sites: { ...config.data.sites, [websiteId]: site },
        ...(google.trim() ? { googleServiceAccount: google.trim() } : {}),
        ...(oauthClient.trim() ? { googleOAuthClient: oauthClient.trim() } : {}),
        ...(cloudflare.trim() ? { cloudflareToken: cloudflare.trim() } : {}),
      });
      setGoogle('');
      setOAuthClient('');
      setCloudflare('');
      await config.refetch();
      await overview.refetch();
      setNotice('设置已保存，请核对下方各平台的连接状态。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  }

  async function connectGoogle() {
    setConnecting(true);
    setNotice('');
    try {
      const { url } = await post('/integrations/google', {});
      const target = new URL(url);
      if (target.origin !== 'https://accounts.google.com') throw new Error('授权地址无效。');
      window.location.assign(target.href);
    } catch {
      setNotice('无法开始 Google 授权，请先保存客户端 JSON 并核对回调地址。');
      setConnecting(false);
    }
  }

  if (!user?.isAdmin)
    return (
      <main className={styles.page}>
        <h1>网站总览</h1>
        <p>此页面仅管理员可查看。</p>
      </main>
    );
  const selected = config.data?.websites?.find((w: any) => w.id === websiteId);
  const data = overview.data;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>UMAMI · 网站运营</span>
          <h1>网站总览</h1>
          <p>访问、搜索表现与网络健康，在一处查看。</p>
        </div>
        <button onClick={() => setSetup(!setup)} aria-expanded={setup}>
          接入设置
        </button>
      </header>
      <div className={styles.toolbar}>
        <label>
          网站
          <select value={websiteId} onChange={e => setWebsiteId(e.target.value)} disabled={saving}>
            {(config.data?.websites || []).map((w: any) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.domain}
              </option>
            ))}
          </select>
        </label>
        <label>
          统计范围
          <select value={days} onChange={e => setDays(e.target.value)}>
            <option value="1">昨天</option>
            <option value="7">最近 7 个完整日</option>
            <option value="28">最近 28 个完整日</option>
          </select>
        </label>
        <button onClick={() => overview.refetch()} disabled={!websiteId || overview.isFetching}>
          {overview.isFetching ? '读取中…' : '刷新数据'}
        </button>
        {selected && <Link href={`/websites/${websiteId}`}>查看 Umami 实时统计 →</Link>}
      </div>
      {config.isLoading && <p role="status">正在读取网站列表…</p>}
      {config.error && <p role="alert">无法读取接入设置，请重新登录或稍后刷新。</p>}
      {config.data?.websites?.length === 0 && <p>请先在「网站」中添加监控项目。</p>}
      {googleResult && (
        <p role="status">
          {googleResult === 'connected'
            ? 'Google 授权已连接，请核对下方平台数据。'
            : googleResult === 'cancelled'
              ? 'Google 授权已取消。'
              : 'Google 授权未完成，请重新连接并勾选两项读取权限。'}
        </p>
      )}
      {setup && websiteId && (
        <section className={styles.setup}>
          <h2>连接 {selected?.domain}</h2>
          <p>
            仅管理员可设置。凭证加密保存在你的 Umami
            数据库中，不会返回到浏览器。留空表示保留已保存的凭证。
          </p>
          <form onSubmit={save}>
            <div className={styles.formGrid}>
              <fieldset>
                <legend>Google Analytics & Search Console</legend>
                <p>
                  在 Google Cloud 启用 Analytics Data API 和 Search Console API，创建 Web 应用 OAuth
                  客户端。 保存客户端 JSON 后点击「连接 Google」，仅授权 Analytics 和 Search Console
                  读取权限。 授权范围由 Google 账号可访问的资源决定；总览只查询这里填写的网站。
                </p>
                <label>
                  GA4 属性 ID
                  <input
                    value={site.gaPropertyId}
                    onChange={e => setSite({ ...site, gaPropertyId: e.target.value })}
                    placeholder="数字属性 ID，不是 G- 开头的衡量 ID"
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Search Console 资源名称
                  <input
                    value={site.searchConsoleSite}
                    onChange={e => setSite({ ...site, searchConsoleSite: e.target.value })}
                    placeholder={`sc-domain:${selected?.domain || 'example.com'}`}
                  />
                </label>
                <label>
                  Google OAuth 客户端 JSON
                  <textarea
                    value={oauthClient}
                    onChange={e => setOAuthClient(e.target.value)}
                    placeholder={
                      config.data?.googleOAuthConfigured
                        ? '客户端已保存；仅在替换时填写'
                        : '粘贴 Google 下载的 Web 应用客户端 JSON'
                    }
                    autoComplete="off"
                    spellCheck={false}
                    rows={4}
                  />
                </label>
                <small>回调地址：{origin}/api/integrations/google/callback</small>
                <button
                  type="button"
                  disabled={!config.data?.googleOAuthConfigured || connecting}
                  onClick={connectGoogle}
                >
                  {connecting
                    ? '正在连接…'
                    : config.data?.googleOAuthConnected
                      ? '重新授权 Google'
                      : '连接 Google'}
                </button>
                <small>
                  {config.data?.googleOAuthConnected
                    ? 'Google 登录授权已连接。'
                    : config.data?.googleOAuthConfigured
                      ? '客户端已保存，等待 Google 登录授权。'
                      : '请先保存 OAuth 客户端 JSON。'}
                </small>
                <details>
                  <summary>使用服务账号（可选）</summary>
                  <p>
                    将服务账号邮箱添加为 GA4 查看者和 Search Console 受限用户，再填写其 JSON
                    密钥。Google 登录授权已连接时优先使用登录授权。
                  </p>
                  <label>
                    服务账号 JSON 密钥
                    <textarea
                      value={google}
                      onChange={e => setGoogle(e.target.value)}
                      placeholder={
                        config.data?.googleConfigured
                          ? '已保存；仅在替换凭证时填写'
                          : '粘贴 Google 下载的服务账号 JSON 文件内容'
                      }
                      autoComplete="off"
                      spellCheck={false}
                      rows={4}
                    />
                  </label>
                  <small>
                    {config.data?.googleConfigured
                      ? `已保存 Google 账号：${config.data.googleEmail}`
                      : 'Google 尚未连接。两站可以共用同一个只读服务账号。'}
                  </small>
                </details>
              </fieldset>
              <fieldset>
                <legend>Cloudflare</legend>
                <p>
                  创建只读 API 令牌，权限为「Zone → Analytics → Read」，资源仅包含 fusedots.com 和
                  zhodiao.com。Zone ID 可在对应网站的 Cloudflare 概览页找到。
                </p>
                <label>
                  Zone ID
                  <input
                    value={site.cloudflareZoneId}
                    onChange={e => setSite({ ...site, cloudflareZoneId: e.target.value })}
                    placeholder="32 位 Zone ID"
                  />
                </label>
                <label>
                  只读 API 令牌
                  <input
                    type="password"
                    value={cloudflare}
                    onChange={e => setCloudflare(e.target.value)}
                    placeholder={
                      config.data?.cloudflareConfigured
                        ? '已保存；仅在替换凭证时填写'
                        : '填写只读令牌'
                    }
                    autoComplete="new-password"
                  />
                </label>
                <small>
                  {config.data?.cloudflareConfigured
                    ? 'Cloudflare 令牌已保存。'
                    : 'Cloudflare 尚未连接。'}
                </small>
              </fieldset>
            </div>
            <button type="submit" disabled={saving}>
              {saving ? '保存并检查…' : '保存并检查连接'}
            </button>
            {notice && <p role="status">{notice}</p>}
          </form>
        </section>
      )}
      {overview.error && (
        <p role="alert">总览读取失败，请稍后刷新。现有 Umami 统计仍可从「网站」查看。</p>
      )}
      {data && (
        <>
          <p className={styles.note}>
            {data.range.start} 至 {data.range.end} · Google
            数据有处理延迟；各平台使用自己的时区和统计口径，数字不直接相加。
          </p>
          <div className={styles.cards}>
            <SourceCard
              title="Umami"
              subtitle="网站访客行为"
              source={data.umami}
              metrics={[
                ['访客', 'visitors'],
                ['访问次数', 'visits'],
                ['浏览量', 'views'],
              ]}
            />
            <SourceCard
              title="Google Analytics"
              subtitle="流量与关键事件"
              source={data.ga4}
              metrics={[
                ['活跃用户', 'users'],
                ['会话', 'sessions'],
                ['浏览量', 'views'],
                ['关键事件', 'keyEvents'],
              ]}
            />
            <SourceCard
              title="Search Console"
              subtitle="Google 自然搜索"
              source={data.searchConsole}
              metrics={[
                ['点击', 'clicks'],
                ['曝光', 'impressions'],
                ['点击率', 'ctr', percent],
                ['平均排名', 'position'],
              ]}
            />
            <SourceCard
              title="Cloudflare"
              subtitle="网络请求与缓存"
              source={data.cloudflare}
              metrics={[
                ['请求量', 'requests'],
                ['带宽', 'bytes', bytes],
                ['缓存命中率', 'cacheRatio', percent],
                ['拦截威胁', 'threats'],
              ]}
            />
          </div>
          {data.searchConsole.status === 'connected' && (
            <section className={styles.tableSection}>
              <h2>热门搜索词</h2>
              <p>展示 Search Console 返回的前 10 个搜索词；匿名查询不会出现在明细中。</p>
              {data.searchConsole.rows?.length ? (
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>搜索词</th>
                        <th>点击</th>
                        <th>曝光</th>
                        <th>平均排名</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.searchConsole.rows.map((row: any) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{number(row.clicks)}</td>
                          <td>{number(row.impressions)}</td>
                          <td>{number(row.position)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>该时间范围暂无可展示的搜索词。</p>
              )}
            </section>
          )}
          <p className={styles.note}>
            读取时间：{new Date(data.fetchedAt).toLocaleString('zh-CN')} · Cloudflare
            数据可能经过采样，历史范围和指标受套餐限制。
          </p>
        </>
      )}
      {!data && overview.isFetching && <p role="status">正在读取各平台数据…</p>}
    </main>
  );
}

function SourceCard({
  title,
  subtitle,
  source,
  metrics,
}: {
  title: string;
  subtitle: string;
  source: SourceResult;
  metrics: [string, string, ((value: number) => string)?][];
}) {
  const connected = source.status === 'connected';
  return (
    <section className={styles.card}>
      <div className={styles.cardHeading}>
        <h2>{title}</h2>
        <span className={connected ? styles.connected : styles.pending}>
          {connected ? '已连接' : source.status === 'error' ? '读取失败' : '待连接'}
        </span>
      </div>
      <p>{subtitle}</p>
      {connected ? (
        <>
          <dl className={styles.metrics}>
            {metrics.map(([label, key, format = number]) => {
              const values = source.metrics || {};
              const value =
                key === 'cacheRatio'
                  ? values.requests
                    ? values.cachedRequests / values.requests
                    : 0
                  : values[key];
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{format(value ?? 0)}</dd>
                </div>
              );
            })}
          </dl>
          <small>统计时区：{source.timezone || '平台默认'}</small>
        </>
      ) : (
        <p className={styles.message}>{source.message}</p>
      )}
    </section>
  );
}
