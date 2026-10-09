# 网站总览

管理员登录后访问 `/overview`，可在同一页面切换网站，查看 Umami、GA4、Search Console 和 Cloudflare 的数据。

## 接入

1. Google Cloud 项目启用 Google Analytics Data API 和 Search Console API。
2. 创建专用服务账号，无需分配 Google Cloud IAM 项目角色。生成 JSON 密钥。
3. 将服务账号邮箱添加到所需 GA4 属性，角色为 Viewer（查看者）。在 Search Console 对应资源中添加为受限用户。
4. 在总览的「接入设置」填写 GA4 数字属性 ID、Search Console 精确资源名（如 `sc-domain:fusedots.com` 或 `https://fusedots.com/`），粘贴 JSON 密钥。
5. Cloudflare 创建 `Zone → Analytics → Read` 令牌，将资源限制为需要监控的域名；填写对应 Zone ID 和令牌。
6. 保存后检查每个平台的状态。未连接不会显示为零访问；读取失败也不显示为零。

同一个 Google 服务账号与 Cloudflare 令牌可以用于多个授权站点。每个网站的属性/资源/Zone ID 独立配置。留空凭证字段会保留已保存的值，修改非敏感 ID 不需要再次输入凭证。

## 存储与访问

凭证使用现有 Umami 加密函数 AES-256-GCM 保存至 `app_setting` 中的 `website-integrations-v1`，无需修改数据库结构。使用 Umami `APP_SECRET`（未配置时使用 DATABASE_URL 派生值）加密。保留加密秘密，变更秘密后需重新录入凭证。数据库备份本身不包含解密密钥，服务器环境配置应独立保护。

只有登录的管理员会话可读写集成接口，普通用户、分享链接、API 密钥都不能使用。凭证不返回到浏览器、不写入 Git、不记录供应商错误正文。Google 和 Cloudflare 请求只发送到固定官方地址，使用只读范围和超时；密钥 JSON 中的 token_uri 不使用。

## 统计口径

提供昨天、最近 7 个完整日、最近 28 个完整日三个范围。Umami 和 Cloudflare 使用 UTC 日界；GA4 使用属性时区，Search Console 使用美国太平洋时间。来源数据保留各自口径，不能相加或期待一致。Search Console 只请求最终数据，近期数据可能延迟；搜索词明细最多 10 行且不包含匿名查询。Cloudflare 日期范围、字段和采样受套餐限制，API 无权读取时显示失败原因。

## 维护

自定义文件位于 `src/app/(main)/overview`、`src/app/api/integrations`、`src/lib/integrations.ts`。导航入口在 SideNav/MobileNav。`api-url.ts` 将集成接口固定到本地应用服务，避免外部 API 网关接收凭证。升级上游时保留这些变更。

验证：集成权限/脱敏/配置保留/日期范围/Cloudflare 汇总测试，以及生产 Next.js 构建。
