# 每日一个为什么 — 完整部署与操作指南

## 项目概述

一个适配手机端的"每日一个为什么"内容展示网站，使用 Next.js + Vercel 部署，仅支持回看近 3 天内容，支持 Markdown 富文本。

---

## 一、前置准备

### 1.1 注册账号

| 需要注册 | 用途 | 地址 |
|----------|------|------|
| GitHub | 代码仓库 + 自动部署 | https://github.com |
| Vercel | 网站托管部署 | https://vercel.com |

### 1.2 安装工具（可选，推荐）

- Git：`https://git-scm.com/downloads`
- Node.js 18+：`https://nodejs.org`（用于本地预览）
- VS Code 或任意编辑器：用于编辑 Markdown 内容

---

## 二、部署到 Vercel（完整流程）

### 方式 A：最快路径 — 直接从本地推送

#### 步骤 1：创建 GitHub 仓库

1. 登录 GitHub → 右上角 `+` → `New repository`
2. Repository name：`daily-why`
3. 选择 `Private`（私人仓库）或 `Public`
4. **不要勾选** "Add a README file"
5. 点击 `Create repository`

#### 步骤 2：初始化本地项目并推送

```bash
cd /path/to/daily-why    # 进入项目目录

# 初始化 Git
git init
git add .
git commit -m "初始部署：每日一个为什么"

# 关联 GitHub 远程仓库（替换为你的用户名）
git remote add origin https://github.com/你的用户名/daily-why.git
git branch -M main
git push -u origin main
```

> 如果提示认证，使用 GitHub Personal Access Token 或 SSH Key。

#### 步骤 3：连接 Vercel

1. 登录 https://vercel.com
2. 点击 **"Add New..." → "Project"**
3. 选择 **"Import Git Repository"**
4. 找到你的 `daily-why` 仓库，点击 **"Import"**
5. 配置页面：
   - Framework Preset：**Next.js**（自动检测）
   - Root Directory：保持默认
   - Build Command：保持默认 `next build`
   - Output Directory：保持默认
6. 点击 **"Deploy"**

等待 1-2 分钟，部署完成！

#### 步骤 4：获取网站地址

部署完成后，Vercel 会分配一个地址：
- 格式：`daily-why-xxx.vercel.app`
- 你可以在 Vercel 项目设置 → Domains 中绑定自定义域名

---

### 方式 B：纯网页操作 — 无需本地命令行

如果你不想用命令行，可以直接在 GitHub 网页上操作：

1. 登录 GitHub → New repository → 创建 `daily-why`
2. 在仓库页面点击 **"creating a new file"**
3. 逐个创建以下文件（可以复制粘贴）：

**需要创建的文件清单：**

| 文件路径 | 内容 |
|----------|------|
| `package.json` | 项目配置 |
| `next.config.mjs` | Next.js 配置 |
| `tsconfig.json` | TypeScript 配置 |
| `tailwind.config.ts` | Tailwind 配置 |
| `postcss.config.mjs` | PostCSS 配置 |
| `.gitignore` | Git 忽略规则 |
| `src/app/layout.tsx` | 页面布局 |
| `src/app/page.tsx` | 主页面 |
| `src/app/globals.css` | 全局样式 |
| `src/app/api/content/route.ts` | 内容 API |
| `src/components/DailyPage.tsx` | 主组件 |
| `src/components/DateTabs.tsx` | 日期选择 |
| `src/components/MarkdownRenderer.tsx` | Markdown 渲染 |
| `src/lib/content.ts` | 内容读取 |
| `src/lib/dates.ts` | 日期工具 |
| `data/YYYY-MM-DD.md` | 每日内容（示例） |

4. 然后去 Vercel → Import 这个仓库 → Deploy

---

## 三、日常内容上传操作

### 方式 1：GitHub 网页编辑（最简单）

这是最推荐的方式，无需任何工具：

1. 登录 GitHub → 进入 `daily-why` 仓库
2. 进入 `data/` 目录
3. 点击 **"Add file" → "Create new file"**
4. 文件名输入：`2026-06-23.md`（替换为当天日期，格式必须是 YYYY-MM-DD）
5. 编辑框中写入 Markdown 内容（见下方"内容格式示例"）
6. 点击 **"Commit changes"**
7. Vercel 会自动检测到更新，在 **30-60秒** 内完成重新部署

> **提示**：GitHub 网页编辑器支持预览 Markdown，点击 "Preview" 可以看到渲染效果。

### 方式 2：本地编辑 + Git 推送

适合批量编辑或需要本地预览的场景：

```bash
# 1. 创建新的内容文件
cd /path/to/daily-why
vim data/2026-06-23.md    # 或用任何编辑器

# 2. 本地预览（可选）
npm run dev               # 启动本地服务器
# 打开 http://localhost:3000 查看

# 3. 推送更新
git add data/2026-06-23.md
git commit -m "6月23日：为什么xxx"
git push
```

### 方式 3：手机端操作

在手机浏览器上直接访问 GitHub：
1. 打开 https://github.com/你的用户名/daily-why
2. 进入 `data/` 目录
3. 点击当天文件 → 编辑（铅笔图标）
4. 修改内容 → Commit changes

---

## 四、内容格式 — Markdown 富文本支持

你的内容文件支持以下 Markdown 语法：

### 基本格式

```markdown
# 为什么天空是蓝色的？          ← 大标题（当天的问题）

正文内容...                     ← 普通段落

**重点强调**                    ← 加粗
*斜体文字*                      ← 斜体

## 什么是瑞利散射？              ← 二级标题
### 详细解释                    ← 三级标题
```

### 列表

```markdown
- 列表项一
- 列表项二
- 列表项三

1. 第一步
2. 第二步
3. 第三步
```

### 引用块（用于总结/金句）

```markdown
> 这是一句总结性的话，会显示在蓝色引用框中。
```

### 表格

```markdown
| 项目 | 数值 | 说明 |
|------|------|------|
| A    | 100  | 描述 |
| B    | 200  | 描述 |
```

### 代码

```markdown
行内代码：`console.log("hello")`

代码块：
```python
def hello():
    print("world")
```
```

### 分隔线

```markdown
---                             ← 水平分隔线
```

### 链接和图片

```markdown
[点击这里](https://example.com)  ← 链接
![图片描述](https://url.jpg)     ← 图片
```

---

## 五、3天回看规则说明

- 网站只展示 **今天 + 昨天 + 前天 + 3天前** 这4天的内容
- 超过3天的内容自动不可访问
- 如果某天没有内容文件，对应日期会显示"暂无内容"
- 每次重新部署时，系统自动计算哪些日期在可查看范围内

### 3天规则是如何实现的？

1. `src/lib/dates.ts` 中的 `getValidDates()` 函数计算最近4天的日期
2. `src/app/api/content/route.ts` 检查请求的日期是否在有效范围内
3. 如果请求超出3天窗口，API 返回 404 错误

---

## 六、自定义域名（可选）

如果你有自己的域名（如 `dailywhy.com`）：

1. 在域名服务商处添加 DNS 记录：
   - 类型：`CNAME`
   - 名称：`@`（或 `www`）
   - 值：`cname.vercel-dns.com`
2. 在 Vercel 项目 → Settings → Domains 中添加域名
3. Vercel 自动配置 HTTPS

---

## 七、常见问题

### Q: 部署后内容没更新？
A: Vercel 需要检测到 GitHub 推送才会重新部署。确认你已成功 commit + push。也可以在 Vercel 控制台手动点击 "Redeploy"。

### Q: 日期文件格式不对？
A: 文件名必须严格是 `YYYY-MM-DD.md` 格式，例如 `2026-06-23.md`。日期必须是真实存在的日期。

### Q: 内容更新需要多久生效？
A: 通常 30-60 秒。可以在 Vercel 的 "Deployments" 页面查看部署进度。

### Q: 如何删除旧内容？
A: 直接在 GitHub 上删除超过3天的 `.md` 文件即可。即使不删除，用户也无法访问超过3天的内容。

### Q: 能否在手机上直接管理？
A: 可以！通过 GitHub 手机网页版编辑内容文件，推送后自动部署。

### Q: 网站访问速度？
A: Vercel 有全球 CDN，国内访问也比较快。如需更快，可在 Cloudflare 做额外 CDN 加速。

---

## 八、项目文件结构速查

```
daily-why/
├── data/                    ← ⭐ 每日内容目录（你主要操作这里）
│   ├── 2026-06-22.md       ← 当天内容
│   ├── 2026-06-21.md       ← 昨天内容
│   └── ...
├── src/                     ← 源代码（一般不需要修改）
│   ├── app/
│   │   ├── layout.tsx       ← 页面布局
│   │   ├── page.tsx         ← 主页
│   │   ├── globals.css      ← 样式
│   │   └── api/content/
│   │       └── route.ts     ← 内容 API
│   ├── components/          ← UI 组件
│   └── lib/                 ← 工具函数
├── package.json             ← 依赖配置
├── next.config.mjs          ← Next.js 配置
├── tailwind.config.ts       ← 样式配置
└── .gitignore               ← Git 忽略
```

**你日常只需要关注 `data/` 目录**，其他文件是项目框架，一般不需要改动。

---

## 九、升级建议（未来可选）

1. **添加评论功能**：集成 Giscus（基于 GitHub Discussions）
2. **添加搜索**：为历史内容添加搜索索引
3. **邮件订阅**：集成 Substack 或 Mailchimp
4. **访问统计**：添加 Vercel Analytics 或 Umami
5. **内容管理后台**：添加密码保护的 Web 编辑器（需集成 Vercel KV 存储）
