# 每日一个为什么 🤔

一个适配手机端的"每日一个为什么"内容展示网站，每天发布一篇知识问答，支持回看近 3 天内容。

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss)

## 功能特点

- **📱 移动端优先** — 专为手机浏览设计，触摸友好
- **📅 3 天回看** — 展示今天、昨天、前天、3 天前的内容，更早的自动隐藏
- **✍️ Markdown 富文本** — 支持标题、加粗、列表、引用、表格、代码、图片等
- **⚡ Cloudflare Workers** — 全球 CDN 加速，国内访问速度极佳
- **🔄 自动部署** — 推送到 GitHub 即自动重建上线

## 技术栈

| 技术 | 用途 |
|------|------|
| Next.js 15 | 页面框架 + API |
| Tailwind CSS | 移动端样式 |
| react-markdown + remark-gfm | Markdown 渲染 |
| @opennextjs/cloudflare | Cloudflare Workers 适配 |
| Cloudflare Workers | Edge Runtime |

## 项目结构

```
daily-why/
├── data/                    ← 每日内容（Markdown 文件）
│   ├── 2026-06-19.md
│   ├── 2026-06-20.md
│   ├── 2026-06-21.md
│   └── 2026-06-22.md
├── src/
│   ├── app/
│   │   ├── layout.tsx       ← 页面布局
│   │   ├── page.tsx         ← 主页（客户端渲染）
│   │   ├── globals.css      ← 全局样式
│   │   └── api/content/
│   │       └── route.ts     ← 内容 API
│   ├── components/
│   │   ├── DailyPage.tsx    ← 内容展示卡片
│   │   ├── DateTabs.tsx     ← 日期切换标签
│   │   └── MarkdownRenderer.tsx ← Markdown 渲染器
│   └── lib/
│       ├── content.ts       ← 内容读取（fs）
│       └── dates.ts         ← 日期工具函数
├── wrangler.jsonc           ← Cloudflare 配置
├── next.config.mjs          ← Next.js 配置
├── package.json
└── DEPLOY-GUIDE.md          ← 详细部署指南
```

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

### 构建测试

```bash
# 标准 Next.js 构建
npm run build

# Cloudflare Pages 构建
npm run cf:build
```

## 日常内容更新

每天只需要做一件事：在 `data/` 目录下新建一个 Markdown 文件。

**文件命名规则**：`YYYY-MM-DD.md`（如 `2026-06-23.md`）

**内容示例**：

```markdown
# 为什么天会下雨？

这是一个关于自然界最常见现象的问题。

## 水循环

地球上的水通过蒸发、凝结、降水三个步骤不断循环：

- 太阳加热水面，水蒸气升入大气
- 水蒸气遇冷凝结成小水滴，聚集形成云
- 水滴越来越重，最终落回地面——这就是雨

> 雨不是从天上"掉下来"的，而是水在天地间的一次旅行。

---

*参考：气象学基础*
```

**操作方式**：

1. 在 GitHub 网页上进入 `data/` 目录
2. 点击 **Add file** → **Create new file**
3. 文件名填日期（如 `2026-06-23.md`）
4. 写入 Markdown 内容
5. 点击 **Commit changes**
6. 等 1-2 分钟，GitHub Actions 自动构建部署完成（可在仓库 Actions 页面查看进度）

> 也可以在手机浏览器上操作，完全不需要命令行。

## 部署到 Cloudflare Workers

> ⚠️ 本项目使用 **OpenNext for Cloudflare**，构建产物是 **Cloudflare Worker**（不是静态 Pages 站点），需要通过 **Wrangler CLI + GitHub Actions** 部署。

### 一、获取 Cloudflare 凭证

1. 登录 https://dash.cloudflare.com
2. 获取 **Account ID**：左侧边栏任意页面右侧栏可看到
3. 创建 **API Token**：
   - 进入 https://dash.cloudflare.com/profile/api-tokens
   - 点击 **Create Token**
   - 选择 **Edit Cloudflare Workers** 模板（或自定义）
   - 权限至少需要 `Workers Scripts: Edit` + `Account: Read`
   - 复制生成的 Token

### 二、配置 GitHub Secrets

进入仓库 **Settings → Secrets and variables → Actions → New repository secret**：

| Secret 名称 | 填写内容 |
|-------------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | 你的 Account ID |
| `CLOUDFLARE_API_TOKEN` | 刚才创建的 API Token |

### 三、自动部署

配置好 Secrets 后，每次 push 到 `main` 分支会自动触发构建部署。也可在 Actions 页面手动触发。

### 本地部署（可选）

```bash
npm run cf:build        # 构建
npx wrangler deploy      # 直接部署到 Workers（需已登录 wrangler login）
```

详细步骤见 [DEPLOY-GUIDE.md](./DEPLOY-GUIDE.md)。

## 3 天回看规则

网站自动计算当前有效日期窗口，只展示以下 4 天的内容：

| 标签 | 含义 |
|------|------|
| 今天 | 当天日期 |
| 昨天 | 前 1 天 |
| 前天 | 前 2 天 |
| 3天前 | 前 3 天 |

超过 3 天的内容自动隐藏，旧文件无需删除（留在 `data/` 目录作为历史备份）。

## 自定义域名

在 Cloudflare Dashboard → **Workers 和 Pages** → daily-why → **设置** → **域和路由 (Domains & Routes)** 中添加自定义域名。

## License

MIT
