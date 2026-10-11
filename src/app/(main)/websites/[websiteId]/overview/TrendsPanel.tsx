'use client';
import { useEffect, useState } from 'react';
import type { SourceResult } from '@/lib/integrations';
import {
  defaultTrendsSettings,
  parseTrendsKeywords,
  type TrendsSettings,
  trendsEmbedUrl,
  trendsExploreUrl,
  trendsPeriods,
  trendsRegions,
  validateTrendsSettings,
} from '@/lib/trends';
import styles from './OverviewPage.module.css';

export function TrendsPanel({
  websiteId,
  userId,
  domain,
  rows = [],
}: {
  websiteId: string;
  userId: string;
  domain: string;
  rows?: SourceResult['rows'];
}) {
  const storageKey = `umami-trends-v1:${userId}:${websiteId}`;
  const [keywords, setKeywords] = useState(defaultTrendsSettings.keywords.join('\n'));
  const [geo, setGeo] = useState(defaultTrendsSettings.geo);
  const [period, setPeriod] = useState(defaultTrendsSettings.period);
  const [active, setActive] = useState<TrendsSettings | null>(null);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const s = validateTrendsSettings(JSON.parse(saved));
        setKeywords(s.keywords.join('\n'));
        setGeo(s.geo);
        setPeriod(s.period);
      }
    } catch {
      /* Invalid or unavailable browser storage falls back to defaults. */
    }
    setReady(true);
  }, [storageKey]);

  function load(event: React.FormEvent) {
    event.preventDefault();
    try {
      const s = validateTrendsSettings({ keywords: parseTrendsKeywords(keywords), geo, period });
      setActive(s);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(s));
        setMessage('这组关键词已保存在当前浏览器，按网站分别记住。');
      } catch {
        setMessage('图表已请求；当前浏览器无法保存关键词。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '请检查关键词。');
    }
  }

  function addKeyword(name: string) {
    const current = keywords
      .split(/\r?\n/)
      .map(v => v.trim())
      .filter(Boolean);
    if (current.some(v => v.toLowerCase() === name.toLowerCase())) return;
    if (current.length >= 5) {
      setMessage('最多比较 5 个关键词，请先移除一个再添加。');
      return;
    }
    setKeywords([...current, name].join('\n'));
    setMessage('关键词已加入，点击「加载 / 更新图表」进行比较。');
  }

  return (
    <section className={styles.tableSection} aria-labelledby="trends-title">
      <div className={styles.cardHeading}>
        <h2 id="trends-title">Google Trends · 关键词研究</h2>
        <span className={styles.pending}>官方实时图表</span>
      </div>
      <p>
        比较市场搜索热度、观察季节变化，再用 {domain} 的 Search Console 和 Umami 数据核对实际表现。
      </p>
      <form onSubmit={load} className={styles.trendsForm}>
        <label className={styles.trendsKeywords}>
          比较关键词（每行一个，最多 5 个）
          <textarea
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            rows={3}
            maxLength={600}
            spellCheck={false}
          />
        </label>
        <label>
          目标市场
          <select value={geo} onChange={e => setGeo(e.target.value)}>
            {Object.entries(trendsRegions).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          趋势时间范围
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            {Object.entries(trendsPeriods).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!ready}>
          加载 / 更新图表
        </button>
      </form>
      <p className={styles.note}>
        点击加载后，关键词与筛选条件会发送给 Google Trends。图表时间范围独立于上方网站统计范围。
      </p>
      {message && <p role="status">{message}</p>}
      {!!rows.length && (
        <div className={styles.trendsSuggestions}>
          <p>从这个网站的 Search Console 搜索词加入比较：</p>
          {rows.slice(0, 10).map(row => (
            <button
              type="button"
              key={row.name}
              onClick={() => addKeyword(row.name)}
              title={`${row.impressions} 次曝光 · ${row.clicks} 次点击`}
            >
              ＋ {row.name}
            </button>
          ))}
        </div>
      )}
      {!active ? (
        <p>
          填写关键词并加载，查看 Google 的热度曲线和相关搜索词。首次可先比较 perler beads 与 fuse
          beads。
        </p>
      ) : (
        <>
          <div className={styles.trendsSummary}>
            <strong>
              {trendsRegions[active.geo as keyof typeof trendsRegions]} ·{' '}
              {trendsPeriods[active.period as keyof typeof trendsPeriods]} ·{' '}
              {active.keywords.join(' / ')}
            </strong>
            <a href={trendsExploreUrl(active)} target="_blank" rel="noopener noreferrer">
              在 Google Trends 打开完整报告 ↗
            </a>
          </div>
          <h3>搜索热度随时间变化</h3>
          <iframe
            key={`time:${JSON.stringify(active)}`}
            className={styles.trendsFrame}
            title="Google Trends 搜索热度比较"
            src={trendsEmbedUrl(active, 'TIMESERIES')}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
          <h3>相关搜索词 · {active.keywords[0]}</h3>
          <p className={styles.note}>
            使用图表中的 Top / Rising 切换热门与上升查询；比较组的第一个关键词用于此表。
          </p>
          <iframe
            key={`queries:${JSON.stringify(active)}`}
            className={styles.trendsFrame}
            title="Google Trends 相关与上升搜索词"
            src={trendsEmbedUrl(active, 'RELATED_QUERIES_0')}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
          <p className={styles.note}>
            数据来源：Google Trends。热度 0–100
            是当前比较范围内的相对指数，不是搜索次数；低搜索量可能没有数据。图表由 Google
            提供，如未显示或要求验证，请打开完整报告。
          </p>
        </>
      )}
      <details className={styles.trendsGuidance}>
        <summary>怎样把趋势用于网站优化</summary>
        <ul>
          <li>看过去 12 个月和 5 年的反复高峰，提前准备季节性内容。</li>
          <li>从相关上升搜索词寻找与你的网站匹配的教程、图案或产品选题，先核对搜索意图。</li>
          <li>
            结合 Search
            Console：有曝光但点击少的词，可以检查标题与摘要；排名在第二页附近的词，可以完善内容和内部链接。
          </li>
          <li>
            修改后比较网站自己的点击、访问和关键事件。市场热度上涨不代表你的网站排名或转化会上涨。
          </li>
        </ul>
      </details>
    </section>
  );
}
