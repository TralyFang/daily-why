## 测试问题与优化清单

> 原则：所有的问题，都需要先想清楚，再去做，而不是先做了，再改

### 原始问题

1. ✅ 刷新需要改成覆盖数据的方式，而不是先清空再赋值
2. ✅ SW 缓存策略改造：打开秒出 + 下拉刷新
3. ✅ 不要频繁刷新，来个一个清理缓存的入口；点击icon进入设置页面，添加清理缓存的入口
4. ✅ Android手机通知关闭情况下，居然可以开启提醒，应该是检测权限无效
5. ✅ iPhone pro max 无法开启提醒，首次没有开启权限弹窗
6. ✅ 扩展内容的展开下面的点击再来一次，直接收起，刷新下一条扩展内容展示，目前是需要收起，再点击才行。
7. ✅ 为什么不全全屏，手机顶部的状态也可以渲染的呀
8. ✅ 把src/app/api/content/generate/route.ts生成的主题存储到cloudflare，避免重复生成，哪怕是src/app/api/content/generate/route.ts 执行了内容覆盖也不能重复。因为被覆盖的内容丢失了，所有需要保存一份已经生成过的主题清单
9. 问题2 的日期列表 `GET /api/content`带一个当天的时间参数，避免同一天的多次请求
10. src/components/DailyPage.tsx 目前的代码量太多了，需要拆分到做到文件
11. 调试模式的立即推送，希望可以自定义标题和内容和指定的设配ID，默认可以不填走原来的逻辑

---

## 排期优先级

| 优先级 | 批次 | 问题编号 | 分组 | 说明 |
|--------|------|----------|------|------|
| P0 | 第一批 | 1, 2 | 缓存与刷新体验 | 解决白屏闪烁 + SW 缓存秒出，互相关联一起做 |
| P0 | 第一批 | 3 | 缓存与刷新体验 | 第 2 条完成后，清缓存入口作为补充加在设置面板 |
| P1 | 第二批 | 4, 5 | 通知权限修复 | 两个问题都在 ReminderSettings.tsx，一起改 |
| P1 | 第二批 | 6 | 交互体验优化 | 扩展内容"再来一次"交互改进 |
| P2 | 第三批 | 7 | 视觉全屏沉浸 | 状态栏沉浸式，工作量小但需要真机测试 |
| P2 | 第三批 | 8 | 后端内容生成 | 主题清单持久化到 KV，独立于前端改动 |

---

## 第一批：缓存与刷新体验（问题 1 + 2 + 3）

### 问题 1：刷新改为覆盖数据，不先清空

**现状**：`handleRefresh()` 先 `setContentCache({})` 清空 → 页面白屏 → 网络返回后重新填充。

**方案**：
- 不清空 `contentCache`，不 `setDatesLoaded(false)`
- 网络请求完成后直接覆盖 state：`setContentCache(prev => ({ ...prev, [date]: newContent }))`
- 刷新期间用户还能看到旧内容，新数据到了无缝替换
- 可加一个顶部 loading indicator 表示正在刷新

**涉及文件**：`src/components/DailyPage.tsx`

---

### 问题 2：SW 缓存策略改造（打开秒出 + 下拉刷新）

**背景**：当前所有 `/api/content` 请求都带 `_t=${Date.now()}` cache-buster，导致 SW 缓存写入了但永远读不出来，实际效果等于 network-only。

**策略设计**：

| 请求 | SW 策略 | 说明 |
|------|---------|------|
| 日期列表 `GET /api/content`（无 date 参数） | network-first，离线兜底缓存 | 保证拿到最新可用日期，断网也能用 |
| 具体内容 `GET /api/content?date=xxx`（无 `_refresh`） | cache-first，miss 走网络并缓存 | 打开秒出 |
| 具体内容 `GET /api/content?date=xxx&_refresh=1` | network-only，成功后更新缓存 | 下拉刷新拿最新 |

**涉及文件及改动**：

#### 2.1 `public/sw.js` — fetch 策略调整

- 对 `/api/content` 请求区分"有 date 参数"和"无 date 参数"两种情况
- 无 date 参数（日期列表）：保持 network-first + 离线缓存兜底
- 有 date 参数 + 无 `_refresh`：改为 cache-first，命中直接返回，未命中走网络并缓存
- 有 date 参数 + 带 `_refresh=1`：强制走网络，成功后更新缓存
- 缓存 key 归一化：存储和读取时统一 strip 掉 `_refresh`、`_t`、`_d` 参数

#### 2.2 `src/components/DailyPage.tsx` — 请求逻辑调整

- `fetchDates()`：去掉 `_t` cache-buster（日期列表由 SW 走 network-first，不需要客户端破坏缓存）
- `loadContent(date)`：去掉 `_t` cache-buster，请求 `/api/content?date=xxx`（让 SW 能命中缓存）
- `handleRefresh()`：
  - 不再手动 `caches.delete()` 删除 API 缓存
  - 不清空 contentCache（问题 1 的修复）
  - fetchDates 正常请求（SW 走 network-first 自动拿最新）
  - loadContent 改为带 `_refresh=1` 参数，强制走网络更新缓存
- 新增 `refreshContent(date)` 函数：带 `_refresh=1` 请求并覆盖 contentCache

#### 2.3 缓存 key 归一化规则

SW 在以下时机统一处理 URL：
- 写入缓存时：strip `_refresh`、`_t`、`_d` 参数后作为 key
- 读取缓存时：strip 同样的参数后匹配

**离线体验**：
- 日期列表：有上次缓存的列表可用
- 具体内容：已缓存的日期直接展示，未缓存的显示"离线无缓存"提示

---

### 问题 3：清理缓存入口

**现状**：用户无法手动清除 SW 缓存，只能依赖下拉刷新。下拉刷新只触发当前日期的数据强更新，不会清理全部缓存。

**入口**：点击 header 左侧的 icon（`src="/icon.webp"`），调出设置弹窗。

**方案**（第 2 条完成后补充）：
- 点击 header icon 弹出设置面板（复用或新建，区别于长按进入的 debug 面板）
- 设置面板中添加"清除缓存"按钮
- 点击"清除缓存"需要同时清理：
  1. SW API 缓存（`caches.delete(API_CACHE)`）
  2. 客户端内存中的 contentCache state
  3. localStorage 中的本地数据，包括：
     - `daily-why-chances`（扩展内容展开的条数记录）
     - 其他会话级缓存数据
- 清除后自动触发一次 fetchDates + loadContent 重新加载
- 位置：放在设置面板中，带确认提示（"清除后需要重新加载所有内容"）

**下拉刷新 vs 清除缓存的区别**：
- 下拉刷新：只强制更新当前日期的内容（`?_refresh=1`），不影响其他缓存和本地状态
- 清除缓存：全量重置，清空所有 SW 缓存 + localStorage 相关数据 + 内存 state

**涉及文件**：
- `src/components/DailyPage.tsx`（header icon 点击事件 + 设置弹窗 + 清理逻辑）
- `public/sw.js`（可能需要通过 postMessage 让 SW 协助清理）

---

## 第二批：通知权限修复 + 交互优化（问题 4 + 5 + 6）

### 问题 4：Android 通知关闭情况下可以开启提醒

**现状**：Android 系统层面关了通知后，`Notification.permission` 仍可能返回 `"granted"`，导致应用内认为有权限。

**方案**：
- 订阅成功后发一条静默测试通知验证通道是否畅通
- 或在 `handleSave` 成功后调用 `registration.showNotification()` 发一条"提醒已开启"的确认通知
- 如果 `showNotification()` 抛异常或静默失败，提示用户检查系统通知设置
- 保存前增加 `navigator.permissions.query({ name: 'notifications' })` 做二次确认（部分 Android 支持）

**涉及文件**：`src/components/ReminderSettings.tsx`

---

### 问题 5：iPhone Pro Max 无法开启提醒，首次无弹窗

**根因**：iOS 16.4+ PWA 要求 `Notification.requestPermission()` 必须在用户手势的同步调用栈中发起。当前在 async 函数中调用，前面有 state 更新，iOS 可能认为脱离了用户手势。

**方案**：
- 把 `Notification.requestPermission()` 提到 click handler 的最前面（同步位置）
- 拿到权限结果后再做后续 async 操作（subscribe 等）
- 代码结构调整：

```typescript
const handleSave = async () => {
  setSaving(true);
  setSaveError(null);

  if (draftEnabled) {
    // iOS 要求：必须在用户手势同步栈中请求权限
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission(); // 第一行 await
    }
    if (perm !== "granted") {
      setPermissionDenied(true);
      setSaving(false);
      return;
    }
    setPermissionDenied(false);

    // 权限通过后再做订阅
    try {
      await subscribe();
    } catch (err) { ... }
  }
  ...
};
```

- 确保 `requestPermission` 是 click → async function 中的第一个 await point

**涉及文件**：`src/components/ReminderSettings.tsx`

---

### 问题 6：扩展内容"再来一次"直接收起后刷新展示下一条

**现状**：点击"再来一次"需要先手动收起当前扩展内容，再点击按钮才能看到下一条。操作繁琐。

**方案**：
- 点击"再来一次"后，自动收起当前扩展内容（带动画）
- 收起完成后自动请求下一条扩展内容
- 请求成功后自动展开新内容
- 整体流程：点击 → 收起旧内容 → loading → 展开新内容（一键完成）
- 代码修改：`handleExtraClick` 中先触发收起动画，动画结束后请求并展示新内容

**涉及文件**：`src/components/DailyPage.tsx`（handleExtraClick 函数 + 扩展卡片渲染部分）

---

## 第三批：视觉 + 后端（问题 7 + 8）

### 问题 7：沉浸式全屏状态栏

**现状**：`statusBarStyle: "default"`（白底黑字），内容没有延伸到状态栏区域。

**方案**：
- `src/app/layout.tsx`：
  - `statusBarStyle` 改为 `"black-translucent"`（内容延伸到状态栏后面）
  - viewport 增加 `viewportFit: "cover"`
- `manifest.json`：确认 `theme_color` 和实际 header 背景色一致
- 页面 CSS：header 区域增加 `padding-top: env(safe-area-inset-top)` 避免刘海遮挡
- `src/components/DailyPage.tsx`：header 区域添加 safe-area padding

**涉及文件**：`src/app/layout.tsx`、`public/manifest.json`、`src/components/DailyPage.tsx`

---

### 问题 8：主题清单持久化到 Cloudflare KV

**现状**：内容生成全部在 Cloudflare 端自动执行。KV 中内容有 7 天 TTL，过期后主题信息丢失，可能重复生成。

**方案**：
- 在 KV 中新增 key：`topics-history`，存储所有已生成过的主题标题（JSON 数组）
- 每次生成后，从文章中提取标题（`# 为什么XXX？`），追加到 `topics-history`
- 生成前先读取 `topics-history`，在 AI prompt 中加入"不要生成以下已有主题"
- `topics-history` 不设 TTL（永久存储）
- 当清单过大（>200条）时，只保留最近 100 条在 prompt 中，但全量数据不删

**涉及文件**：`src/app/api/content/generate/route.ts`（或 Cloudflare Worker 中对应的生成逻辑）
