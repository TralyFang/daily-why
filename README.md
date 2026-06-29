# 每日一个为什么

一个面向移动端的轻量内容站点。用户每天可以查看 1 篇主内容，支持浏览近 7 天历史内容，并在当天额外抽取最多 3 次「再来一个为什么」。

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss)
![PWA](https://img.shields.io/badge/PWA-ready-0c8ce9?logo=pwa)

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
- **每日提醒推送**：PWA 安装后可开启每日推送通知（默认 10:30），智能跳过已访问用户

## 技术栈

| 技术 | 用途 |
|------|------|
| Next.js 15 | 应用框架与 API 路由 |
| React 18 | 客户端交互 |
| Tailwind CSS | 界面样式 |
| react-markdown + remark-gfm | Markdown 渲染 |
| web-push | Web Push 通知 |
| OpenNext for Cloudflare | Next.js 适配 Cloudflare Workers |
| Cloudflare Workers | 运行时部署 + Cron 定时推送 |
| Cloudflare KV | 线上内容存储 + 推送订阅管理 |
| Cloudflare Workers AI | 每日内容自动生成（Llama 4 Scout） |
| Vitest | 单元测试与集成测试 |

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
- 更早日期通过左滑进入"探索历史"模式查看

## 项目结构

```text
daily-why/
├── data/                         # Markdown 内容源 (gitignored)
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service Worker（缓存+推送）
│   ├── _headers                 # Cloudflare 静态资源缓存头
│   └── icon-*.png/webp          # 应用图标
├── workers/
│   ├── cron-content/            # Cloudflare Cron Worker（定时内容生成触发）
│   │   ├── worker.js
│   │   └── wrangler.toml
│   └── cron-push/               # Cloudflare Cron Worker（定时推送触发）
│       ├── worker.js
│       └── wrangler.toml
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── content/route.ts       # 内容接口
│   │   │   └── push/
│   │   │       ├── subscribe/route.ts # 推送订阅
│   │   │       ├── unsubscribe/route.ts # 取消订阅
│   │   │       ├── send/route.ts      # 定时推送发送
│   │   │       └── heartbeat/route.ts # 每日心跳（标记已访问）
│   │   ├── globals.css                # 全局样式
│   │   ├── layout.tsx                 # 页面元信息与全局注册
│   │   └── page.tsx                   # 首页入口
│   ├── components/
│   │   ├── DailyPage.tsx              # 主页面与交互逻辑
│   │   ├── DateTabs.tsx               # 顶部日期切换
│   │   ├── InstallPrompt.tsx          # iOS / Android 安装引导
│   │   ├── MarkdownRenderer.tsx       # Markdown 渲染
│   │   ├── PullToRefresh.tsx          # PWA 下拉刷新
│   │   ├── ReminderSettings.tsx       # 每日提醒开关设置
│   │   └── ServiceWorkerRegistration.tsx # SW 注册 + 心跳管理
│   └── lib/
│       ├── content.ts           # 内容读取与 KV 读写
│       ├── dates.ts             # 日期窗口与标签计算
│       ├── vapid.ts             # VAPID 公钥常量
│       └── cloudflare-env.d.ts
├── tests/                       # 测试文件
│   ├── setup.ts                 # 测试环境初始化
│   ├── lib/dates.test.ts        # 日期工具测试
│   ├── api/content.test.ts      # 内容 API 测试
│   ├── api/generate.test.ts     # 生成 API 测试
│   └── sw/cache-strategy.test.ts # SW 缓存策略测试
├── vitest.config.ts             # Vitest 测试配置
├── .github/workflows/deploy.yml # GitHub Actions 自动部署
├── wrangler.jsonc               # Workers 与 KV 配置
├── open-next.config.ts          # OpenNext 配置
└── automation.json              # WorkBuddy 内容生成自动化配置
```

## 本地开发

```bash
npm install
npm run dev
```

默认访问：`http://localhost:3000`

### 本地开发环境变量

本地开发需要配置 `.dev.vars`（已 gitignored）：

```bash
NEXTJS_ENV=development
VAPID_PRIVATE_KEY=你的VAPID私钥
```

## 常用命令

```bash
npm run dev            # 本地开发
npm run build          # Next.js 构建
npm test               # 运行所有测试
npm run test:watch     # 监听模式（开发时推荐）
npm run test:coverage  # 运行测试并生成覆盖率报告
npm run cf:build       # OpenNext Cloudflare 构建
npm run cf:preview     # 本地预览 Cloudflare Worker
npm run cf:deploy      # 部署主 Worker
npm run deploy         # 一键构建 + 部署
npm run cron:deploy    # 部署 Cron Worker（定时推送触发器）
```

## 测试

项目使用 Vitest 作为测试框架，测试文件位于 `tests/` 目录。

```bash
npm test               # 运行所有测试（CI/CD 推荐）
npm run test:watch     # 监听模式，文件变更自动重跑
npm run test:coverage  # 生成覆盖率报告
```

### 测试结构

```text
tests/
├── setup.ts                    # 测试环境初始化
├── lib/
│   └── dates.test.ts           # 日期工具函数（解析、格式化、时区、有效窗口）
├── api/
│   ├── content.test.ts         # /api/content 路由（日期列表、内容获取、错误处理）
│   └── generate.test.ts        # /api/content/generate 路由（AI 生成、日期参数、幂等）
└── sw/
    └── cache-strategy.test.ts  # SW 缓存策略（network-first、离线回退、缓存键）
```

### 开发规范

每次修改功能后请运行 `npm test` 验证：
- 改了 `src/lib/dates.ts` → 跑 `dates.test.ts`
- 改了 API 路由 → 跑 `api/*.test.ts`
- 改了 SW 缓存逻辑 → 跑 `sw/*.test.ts`

## AI 内容自动生成

内容通过 Cloudflare Workers AI（Llama 4 Scout 17B）自动生成，每天生成 4 篇文章（1 篇主内容 + 3 篇额外内容）。

### 生成接口

```http
GET /api/content/generate?force=1&date=2026-06-28
```

| 参数 | 说明 |
|------|------|
| `force=1` | 强制重新生成（覆盖已有内容） |
| `date=YYYY-MM-DD` | 指定生成日期（默认今天，仅支持近 3 天） |

### 调试面板

长按右上角时钟图标 1.5 秒可进入**调试模式**，功能包括：

- 查看设备状态（SW、Push 订阅、Device ID）
- 选择近 3 天日期手动触发 AI 内容生成
- 发送测试推送、心跳
- 模拟 SW 更新
- 清除本地数据

### 自动触发

生产环境通过 Cron Worker 每天自动调用生成接口，无需手动干预。

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

### 推送管理接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/push/subscribe` | POST | 保存设备推送订阅 |
| `/api/push/unsubscribe` | POST | 删除设备推送订阅 |
| `/api/push/send` | GET/POST | 定时推送（由 Cron Worker 调用） |
| `/api/push/heartbeat` | POST | 每日心跳，标记今天已访问 |

## 部署说明

项目当前采用 `OpenNext + Cloudflare Workers + Cloudflare KV`。

### 前置准备

#### 1. Cloudflare 资源

- 创建 Worker（`daily-why`）
- 创建或绑定 `CONTENT_KV` KV 命名空间
- 在 `wrangler.jsonc` 中配置 `kv_namespaces`

#### 2. VAPID 密钥配置

Web Push 需要 VAPID 密钥对，用于推送服务端身份验证：

```bash
# 生成密钥对（已内置在 src/lib/vapid.ts）
npx web-push generate-vapid-keys
```

将私钥配置为 Cloudflare Worker Secret（**不可提交到代码仓库**）：

```bash
# 设置 VAPID_PRIVATE_KEY secret（仅需执行一次）
echo "你的VAPID私钥" | npx wrangler secret put VAPID_PRIVATE_KEY
```

公钥已硬编码在 `src/lib/vapid.ts`，无需额外配置。

#### 3. GitHub Secrets

在仓库中配置：

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需 Workers 权限） |

#### 4. 自动部署

仓库已包含 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，推送到 `main` 后会自动执行：

1. `npm ci`
2. `npm run cf:build`
3. `npx wrangler deploy`

#### 5. 部署 Cron Worker（定时推送触发器）

Cron Worker 是一个独立的轻量 Worker，通过 Cloudflare Cron Triggers 每天 10:30 和 10:45（北京时间）调用主 Worker 的 `/api/push/send` 接口。

```bash
# 首次部署需要单独执行（后续很少变更）
npm run cron:deploy
```

> **工作原理**：Cron Worker 通过 service binding 直接调用主 Worker，无需暴露公网 URL，无需配置额外密钥。

### 本地预览或部署

```bash
npm run cf:build
npm run cf:preview
```

直接部署：

```bash
npm run cf:deploy
```

## 每日提醒推送

### 工作流程

```
用户开启提醒 → 浏览器订阅 Web Push → 保存到 KV
                                      ↓
                              每天 10:30 定时触发
                              (Cron Worker → /api/push/send)
                                      ↓
                              检查：用户今天已访问？→ 跳过
                              检查：超过 30 天未访问？→ 清理订阅
                                      ↓
                              发送推送通知 → 标记已推送
```

### 智能跳过

- **今天已访问**：如果用户当天已打开过 PWA（通过 heartbeat 标记），自动跳过推送
- **僵尸订阅清理**：超过 30 天未访问的设备，自动清理其订阅记录
- **权限同步**：用户在系统设置中关闭通知权限后，自动取消订阅

### 推送时间

- 统一在每天 **10:30**（北京时间）推送
- 不支持自定义时间（简化设计，避免复杂的调度逻辑）

## PWA 说明

- 已配置 `manifest.json`
- 已注册 `sw.js`（含缓存策略 + Push 通知处理）
- iOS Safari 下会显示"添加到主屏幕"引导
- Android Chrome 下会捕获 `beforeinstallprompt`，展示站内安装卡片并触发系统安装弹窗
- 安装成独立应用后支持下拉刷新
- **提醒设置仅在 PWA standalone 模式下可见**

## 备注

- 本地开发优先从 `data/` 目录读取内容
- 线上环境优先从 `CONTENT_KV` 读取内容
- 如果某天没有对应文件，该日期不会出现在可查看列表中
- `.dev.vars` 已加入 `.gitignore`，不会提交到代码仓库
- VAPID 私钥通过 `wrangler secret put` 管理，不在代码中

## License

MIT
