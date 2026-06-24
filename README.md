# 每日一个为什么

一个面向移动端的轻量内容站点。用户每天可以查看 1 篇主内容，支持浏览近 7 天历史内容，并在当天额外抽取最多 3 次「再来一个为什么」。

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss)

## 功能概览

- 移动端优先布局，适合手机直接阅读
- 首页默认展示今天的内容，可切换今天、昨天、前天
- 支持继续左滑探索更早历史，实际可查看近 7 天内容
- 当天支持最多 3 次「再来一个为什么」额外内容
- 额外次数按天重置，并显示距离次日解锁的倒计时
- 支持 Markdown 内容渲染，包含标题、列表、引用、表格、代码块等
- 已接入 PWA，支持安装到手机桌面
- 独立安装模式下支持下拉刷新
- Service Worker 会缓存静态资源和内容接口，弱网或离线时可回看已访问内容

## 技术栈

| 技术 | 用途 |
|------|------|
| Next.js 15 | 应用框架与 API 路由 |
| React 18 | 客户端交互 |
| Tailwind CSS | 界面样式 |
| react-markdown + remark-gfm | Markdown 渲染 |
| OpenNext for Cloudflare | Next.js 适配 Cloudflare Workers |
| Cloudflare Workers | 运行时部署 |
| Cloudflare KV | 线上内容存储 |

## 内容规则

### 1. 主内容

- 主内容文件放在 `data/` 目录
- 文件名格式为 `YYYY-MM-DD.md`
- 例如：`2026-06-24.md`

### 2. 额外内容

- 当天的额外内容同样放在 `data/` 目录
- 文件名格式为 `YYYY-MM-DD-extra-N.md`
- `N` 目前支持 `1`、`2`、`3`
- 例如：
  - `2026-06-24-extra-1.md`
  - `2026-06-24-extra-2.md`
  - `2026-06-24-extra-3.md`

### 3. 可查看范围

- 主内容默认仅返回近 7 天窗口内的数据
- 实际范围为：今天 + 往前 7 天，共最多 8 个日期
- 顶部标签只展示最近 3 天
- 更早日期通过左滑进入“探索历史”模式查看

## 项目结构

```text
daily-why/
├── data/                         # Markdown 内容源
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service Worker
│   └── icon-*.png/webp          # 应用图标
├── src/
│   ├── app/
│   │   ├── api/content/route.ts # 内容接口
│   │   ├── globals.css          # 全局样式
│   │   ├── layout.tsx           # 页面元信息与全局注册
│   │   └── page.tsx             # 首页入口
│   ├── components/
│   │   ├── DailyPage.tsx        # 主页面与交互逻辑
│   │   ├── DateTabs.tsx         # 顶部日期切换
│   │   ├── InstallPrompt.tsx    # iOS / Android 安装引导
│   │   ├── MarkdownRenderer.tsx # Markdown 渲染
│   │   ├── PullToRefresh.tsx    # PWA 下拉刷新
│   │   └── ServiceWorkerRegistration.tsx
│   └── lib/
│       ├── content.ts           # 内容读取与 KV 读写
│       ├── dates.ts             # 日期窗口与标签计算
│       └── cloudflare-env.d.ts
├── .github/workflows/deploy.yml # GitHub Actions 自动部署
├── wrangler.jsonc               # Workers 与 KV 配置
├── open-next.config.ts          # OpenNext 配置
└── DEPLOY-GUIDE.md              # 额外部署说明
```

## 本地开发

```bash
npm install
npm run dev
```

默认访问：`http://localhost:3000`

## 常用命令

```bash
npm run dev
npm run build
npm run cf:build
npm run cf:preview
npm run cf:deploy
```

## 内容新增方式

日常维护时通常只需要往 `data/` 目录新增 Markdown 文件。

主内容示例：

```markdown
# 为什么天空会变蓝？

这是今天的问题。

## 简单解释

阳光进入大气后，短波长的蓝光更容易被空气分子散射，所以我们看到天空偏蓝。
```

额外内容示例：

```markdown
# 为什么傍晚的天空会偏红？

太阳接近地平线时，光穿过更厚的大气层，蓝紫光被散射掉，剩下更容易进入视线的是红橙光。
```

## 接口说明

### 获取可用日期

```http
GET /api/content
```

返回近 7 天窗口内存在内容的日期列表。

### 获取指定日期内容

```http
GET /api/content?date=2026-06-24
```

### 获取额外内容

```http
GET /api/content?date=2026-06-24-extra-1
```

### 查询当天有哪些额外槽位可用

```http
GET /api/content?type=extras&today=2026-06-24
```

## 部署说明

项目当前采用 `OpenNext + Cloudflare Workers + Cloudflare KV`。

### 1. Cloudflare 侧准备

- 创建 Worker
- 创建或绑定 `CONTENT_KV`
- 在 `wrangler.jsonc` 中配置 `kv_namespaces`

### 2. GitHub Secrets

在仓库中配置：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

### 3. 自动部署

仓库已包含 [`.github/workflows/deploy.yml`](/Users/tralyfang/WorkBuddy/2026-06-22-11-02-26/daily-why/.github/workflows/deploy.yml)，推送到 `main` 后会自动执行：

1. `npm ci`
2. `npm run cf:build`
3. `npx wrangler deploy`

### 4. 本地预览或部署

```bash
npm run cf:build
npm run cf:preview
```

直接部署：

```bash
npm run cf:deploy
```

## PWA 说明

- 已配置 `manifest.json`
- 已注册 `sw.js`
- iOS Safari 下会显示“添加到主屏幕”引导
- Android Chrome 下会捕获 `beforeinstallprompt`，展示站内安装卡片并触发系统安装弹窗
- 安装成独立应用后支持下拉刷新

## 备注

- 本地开发优先从 `data/` 目录读取内容
- 线上环境优先从 `CONTENT_KV` 读取内容
- 如果某天没有对应文件，该日期不会出现在可查看列表中

## License

MIT
