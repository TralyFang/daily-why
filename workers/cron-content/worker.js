/**
 * Cloudflare Cron Worker — Daily content generation using Workers AI.
 *
 * Runs at 00:05 Beijing time (UTC 16:05 previous day) via cron trigger.
 * Uses Workers AI to generate 4 articles (1 main + 3 extras) and writes to KV.
 *
 * Bindings:
 *   - AI: Workers AI binding
 *   - CONTENT_KV: KV namespace for content storage
 */

const TOPICS = [
  "自然科学", "物理学", "化学", "生物学", "天文学", "地球科学",
  "生活常识", "人体健康", "食物营养", "日常用品原理",
  "历史故事", "古代文明", "近代历史", "文化习俗",
  "科技发展", "互联网", "人工智能", "航天科技", "量子力学",
  "动物世界", "植物学", "海洋生物", "微生物",
  "心理学", "经济学", "数学趣味", "气象学", "材料科学",
];

const KV_TTL_MAIN = 7 * 24 * 60 * 60; // 主内容 7 days
const KV_TTL_EXTRA = 1 * 24 * 60 * 60; // 副内容 1 day

/**
 * Get today's date in Beijing time (UTC+8) as YYYY-MM-DD
 */
function getBeijingToday() {
  const now = new Date();
  const beijingMs = now.getTime() + 8 * 60 * 60 * 1000;
  const beijing = new Date(beijingMs);
  const year = beijing.getUTCFullYear();
  const month = String(beijing.getUTCMonth() + 1).padStart(2, "0");
  const day = String(beijing.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Pick N random unique items from an array
 */
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/**
 * Get recently used topics from KV to avoid repetition
 */
async function getRecentTopics(env, today) {
  const topics = [];
  // Check last 3 days of content titles
  for (let i = 1; i <= 3; i++) {
    const d = new Date(new Date(today).getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const content = await env.CONTENT_KV.get(dateStr, { type: "text" });
    if (content) {
      // Extract title (first line starting with #)
      const titleMatch = content.match(/^#\s*为什么(.+?)？/m);
      if (titleMatch) topics.push(titleMatch[1]);
    }
  }
  return topics;
}

/**
 * Generate a single article using Workers AI
 */
async function generateArticle(env, topic, index, recentTopics) {
  const avoidText = recentTopics.length > 0
    ? `\n\n避免以下已用过的主题方向：${recentTopics.join("、")}`
    : "";

  const prompt = `你是一个科普作家，负责为"每日一个为什么"网站创作内容。请根据以下要求生成一篇文章：

主题领域：${topic}
文章编号：第${index + 1}篇（共4篇，每篇主题必须不同）${avoidText}

要求：
1. 标题格式：# 为什么XXX？（必须以"为什么"开头，提出一个有趣的科普问题）
2. 正文 300-500 字，用通俗易懂的语言解释
3. 使用 Markdown 格式：
   - 2-3 个子标题（## 开头）展开解释
   - 适当使用**加粗**、列表、引用等格式
   - 结尾用引用块（> ）写一句总结金句
4. 底部附 1-2 条参考资料来源（格式：*参考资料：xxx*）
5. 内容风格：通俗易懂、有趣味性、有深度，适合大众阅读
6. 不要出现"今天我们来聊聊"之类的开场白，直接进入正题

请直接输出 Markdown 格式的文章，不要有额外的说明。`;

  const response = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
    messages: [
      { role: "system", content: "你是一个专业的中文科普作家，擅长用通俗有趣的方式解释复杂的科学问题。" },
      { role: "user", content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.8,
  });

  return response.response || "";
}

/**
 * Validate generated content looks reasonable
 */
function validateContent(content) {
  if (!content || content.length < 100) return false;
  if (!content.includes("# 为什么")) return false;
  return true;
}

/**
 * Core content generation logic — shared by scheduled() and fetch /generate
 */
async function generateContent(env) {
  const today = getBeijingToday();
  console.log(`[cron-content] Starting content generation for ${today}`);

  // Check if content already exists (idempotency)
  const existing = await env.CONTENT_KV.get(today, { type: "text" });
  if (existing) {
    console.log(`[cron-content] Content for ${today} already exists, skipping.`);
    return;
  }

  // Get recent topics to avoid repetition
  const recentTopics = await getRecentTopics(env, today);

  // Pick 4 different topic areas
  const selectedTopics = pickRandom(TOPICS, 4);
  console.log(`[cron-content] Selected topics: ${selectedTopics.join(", ")}`);

  const results = [];
  const keys = [today, `${today}-extra-1`, `${today}-extra-2`, `${today}-extra-3`];

  // Generate 4 articles sequentially (to avoid rate limits)
  for (let i = 0; i < 4; i++) {
    let content = "";
    let attempts = 0;

    // Retry up to 3 times if content validation fails
    while (attempts < 3) {
      attempts++;
      try {
        content = await generateArticle(env, selectedTopics[i], i, recentTopics);
        if (validateContent(content)) break;
        console.log(`[cron-content] Article ${i + 1} validation failed (attempt ${attempts}), retrying...`);
      } catch (err) {
        console.error(`[cron-content] Article ${i + 1} generation error (attempt ${attempts}):`, err.message);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!validateContent(content)) {
      console.error(`[cron-content] Article ${i + 1} failed after ${attempts} attempts, using fallback.`);
      content = `# 为什么今天的内容还没准备好？\n\n很抱歉，今天的内容生成遇到了一些技术问题。请稍后刷新再试。\n\n> 好奇心永不过期，明天再来探索新问题！`;
    }

    results.push({ key: keys[i], content });
  }

  // Write all 4 articles to KV (主内容7天，副内容1天)
  for (let i = 0; i < results.length; i++) {
    const { key, content } = results[i];
    const ttl = i === 0 ? KV_TTL_MAIN : KV_TTL_EXTRA;
    await env.CONTENT_KV.put(key, content, { expirationTtl: ttl });
    console.log(`[cron-content] Written KV key: ${key} (${content.length} chars, TTL: ${ttl}s)`);
  }

  console.log(`[cron-content] ✅ All 4 articles generated and stored for ${today}`);
}

export default {
  async scheduled(event, env, ctx) {
    await generateContent(env);
  },

  // Also support manual trigger via HTTP for testing
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only allow manual trigger with secret or from internal
    if (url.pathname === "/generate") {
      try {
        // Run the same logic as scheduled
        await generateContent(env);
        return new Response(JSON.stringify({ status: "ok", message: "Content generated" }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ status: "error", message: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/status") {
      const today = getBeijingToday();
      const content = await env.CONTENT_KV.get(today, { type: "text" });
      const extras = [];
      for (let i = 1; i <= 3; i++) {
        const extra = await env.CONTENT_KV.get(`${today}-extra-${i}`, { type: "text" });
        extras.push(!!extra);
      }
      return new Response(JSON.stringify({
        today,
        hasMain: !!content,
        hasExtras: extras,
        mainPreview: content ? content.substring(0, 100) + "..." : null,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("daily-why-cron-content worker", { status: 200 });
  },
};
