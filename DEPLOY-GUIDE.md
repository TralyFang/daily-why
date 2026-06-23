# 每日一个为什么 — 完整部署与操作指南（Cloudflare Pages 版）

## 项目概述

一个适配手机端的"每日一个为什么"内容展示网站，使用 Next.js + Cloudflare Pages 部署，仅支持回看近 3 天内容，支持 Markdown 富文本。

**技术栈**：Next.js 14 · Tailwind CSS · `@cloudflare/next-on-pages` · Cloudflare Pages（Edge Runtime）

---

## 一、前置准备

### 1.1 注册账号

| 需要注册 | 用途 | 地址 |
|----------|------|------|
| GitHub | 代码仓库 + 自动部署触发 | https://github.com |
| Cloudflare | 网站托管（Pages） | https://dash.cloudflare.com |

---

## 二、部署到 Cloudflare Pages

### 步骤 1：把代码推到 GitHub

```bash
cd /path/to/daily-why

git init
git add .
git commit -m "初始部署：每日一个为什么"

# 在 GitHub 创建仓库后替换以下链接
git remote add origin https://github.com/你的用户名/daily-why.git
git branch -M main
git push -u origin main
```

### 步骤 2：在 Cloudflare 创建 Pages 项目

1. 登录 https://dash.cloudflare.com
2. 左侧导航 → **Workers & Pages** → **Create application**
3. 选择 **Pages** 标签 → **Connect to Git**
4. 授权 GitHub，选择你的 `daily-why` 仓库
5. 配置构建参数：

| 配置项 | 填写内容 |
|--------|---------|
| **Framework preset** | `None`（手动填写） |
| **Build command** | `npm run cf:build` |
| **Build output directory** | `.open-next/assets` |
| **Node.js version** | `20` |

6. 点击 **Save and Deploy**，等待 2-3 分钟

部署成功后会分配一个地址：`daily-why-xxx.pages.dev`

> **提示**：Cloudflare Pages 对国内访问非常友好，有全球 CDN，国内速度比 Vercel 更稳定。

### 步骤 3：绑定自定义域名（可选）

1. 进入项目 → **Custom domains** → **Set up a custom domain**
2. 输入你的域名（如 `why.example.com`）
3. 按提示在域名 DNS 处添加 CNAME 记录
4. Cloudflare 自动配置 HTTPS

---

## 三、日常内容上传操作

> **⚠️ 与 Vercel 版的区别**：由于 Cloudflare Pages 运行在 Edge Runtime，无法读取服务器文件系统，所有内容是**编译进代码**的。每次更新内容需要：编辑代码 → 推送 → 触发重新部署（约 1-2 分钟）。

### 方法：编辑 `src/lib/content.ts` 中的内容注册表

每次新增一天的内容，在 `src/lib/content.ts` 文件中找到注释位置，添加一条记录：

```typescript
const CONTENT_REGISTRY: Record<string, string> = {
  // ... 已有内容 ...

  // 👇 添加新内容（复制这个格式）
  "2026-06-23": `# 为什么XXX？

正文内容（Markdown 格式）...`,
};
```

### 完整操作流程（在 GitHub 网页上操作，无需命令行）

1. 登录 GitHub → 进入仓库 `daily-why`
2. 进入 `src/lib/` 目录 → 点击 `content.ts`
3. 点击右上角铅笔图标（Edit this file）
4. 找到文件末尾附近带 👇 注释的位置
5. 在注释下方添加新内容：
   ```
   "2026-06-23": `# 为什么天会下雨？\n\n内容...`,
   ```
6. 点击 **Commit changes**
7. Cloudflare Pages 检测到推送，自动重新部署（1-2 分钟）

### 快速模板

```markdown
"2026-06-23": `# 为什么 [问题]？

[一句话引入这个现象]

## [子标题]

[正文内容...]

- 要点一
- 要点二

> 总结引用/金句

---

*[尾注]*`,
```

---

## 四、内容格式 — Markdown 富文本支持

| 语法 | 效果 |
|------|------|
| `# 标题` | 大标题 |
| `## 副标题` | 二级标题 |
| `**加粗**` | **加粗** |
| `*斜体*` | *斜体* |
| `- 列表项` | 无序列表 |
| `1. 列表项` | 有序列表 |
| `> 引用` | 引用块（蓝色背景） |
| `---` | 分隔线 |
| `\| 表格 \|` | 表格 |
| `` `代码` `` | 行内代码 |
| `[链接](url)` | 超链接 |
| `![图片](url)` | 图片（使用网络图片地址） |

---

## 五、3天回看规则

- 网站只展示 **今天 + 昨天 + 前天 + 3天前**（最多4天）的内容
- `src/lib/dates.ts` 中的 `getValidDates()` 计算当前有效日期
- 即使注册表中有更早的内容，用户也看不到
- 旧内容不需要删除（不影响功能，留着作为历史备份）

---

## 六、项目文件结构

```
daily-why/
├── data/                       ← 参考用 Markdown 文件（不参与构建）
│   ├── 2026-06-22.md
│   └── ...
├── src/
│   ├── app/
│   │   ├── layout.tsx          ← 页面布局
│   │   ├── page.tsx            ← 主页
│   │   ├── globals.css         ← 样式
│   │   └── api/content/
│   │       └── route.ts        ← 内容 API（Edge Runtime）
│   ├── components/             ← UI 组件
│   └── lib/
│       ├── content.ts          ← ⭐ 内容注册表（你每天更新这里）
│       └── dates.ts            ← 日期工具函数
├── package.json
├── next.config.mjs             ← Cloudflare Pages 适配配置
└── .gitignore
```

**你每天只需要编辑一个文件：`src/lib/content.ts`**，在注册表里加一条新内容。

---

## 七、常见问题

### Q: 为什么不像 Vercel 版一样直接上传 .md 文件？
A: Cloudflare Pages 运行在 Edge Runtime（Workers 环境），无法访问服务器文件系统。内容需要在构建时打包进代码。这是 Cloudflare 的底层限制。

### Q: 内容更新后多久生效？
A: 推送到 GitHub 后约 1-2 分钟，可在 Cloudflare Dashboard → Pages → 项目 → Deployments 中查看部署状态。

### Q: 可以在手机浏览器上更新内容吗？
A: 可以！用手机访问 GitHub 网页版，找到 `src/lib/content.ts` 文件，点击铅笔编辑，添加内容后 Commit。

### Q: 部署失败怎么办？
A: 在 Cloudflare Dashboard → Pages → 项目 → Deployments 点击失败的部署，查看构建日志。最常见的问题是内容中包含未转义的反引号，确保 Markdown 内容中的反引号用 `\\`` 转义。

### Q: 想恢复到 Vercel？
A: 在 `next.config.mjs` 中改回 `output: 'standalone'`，在 `src/lib/content.ts` 中改回 `fs` 读取方式，在 `src/app/api/content/route.ts` 中删除 `export const runtime = "edge"`。

---

## 八、Cloudflare Pages vs Vercel 对比

| 维度 | Cloudflare Pages | Vercel |
|------|-----------------|--------|
| 国内访问速度 | ⭐⭐⭐⭐⭐ 全球 CDN，极快 | ⭐⭐⭐ 偶有波动 |
| 免费额度 | 无限带宽，每月 500 次构建 | 100GB/月带宽 |
| 内容更新方式 | 编辑代码 + Push | 上传 .md 文件即可 |
| 配置复杂度 | 稍高（Edge Runtime 限制） | 简单 |
| 自定义域名 | 免费，自动 HTTPS | 免费 |
