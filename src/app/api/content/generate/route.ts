import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildGenerationFailureContent } from "@/lib/contentFailure";

export const dynamic = "force-dynamic";

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

function getBeijingToday(): string {
  const now = new Date();
  const beijingMs = now.getTime() + 8 * 60 * 60 * 1000;
  const beijing = new Date(beijingMs);
  const year = beijing.getUTCFullYear();
  const month = String(beijing.getUTCMonth() + 1).padStart(2, "0");
  const day = String(beijing.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pickRandom(arr: string[], n: number): string[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

const TOPICS_HISTORY_KEY = "topics-history";
const TOPICS_HISTORY_MAX_IN_PROMPT = 100; // Only include last 100 in AI prompt
const MAX_GENERATE_ATTEMPTS = 7;

type GenerationSlot = "main" | "extra-1" | "extra-2" | "extra-3";

interface GenerationTarget {
  key: string;
  ttl: number;
  slot: GenerationSlot;
}

async function getTopicsHistory(kv: unknown): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (kv as any).get(TOPICS_HISTORY_KEY, { type: "text" });
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

async function appendTopicsHistory(kv: unknown, newTopics: string[]): Promise<void> {
  const existing = await getTopicsHistory(kv);
  const updated = [...existing, ...newTopics];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (kv as any).put(TOPICS_HISTORY_KEY, JSON.stringify(updated));
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s*(为什么.+？)/m);
  return match ? match[1] : "";
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

function pickRetryTopic(usedTopics: string[], attemptedTopics: Set<string>): string {
  const availableTopics = TOPICS.filter(
    (topic) => !usedTopics.includes(topic) && !attemptedTopics.has(topic)
  );
  if (availableTopics.length > 0) {
    return pickRandom(availableTopics, 1)[0];
  }

  const untriedTopics = TOPICS.filter((topic) => !attemptedTopics.has(topic));
  if (untriedTopics.length > 0) {
    return pickRandom(untriedTopics, 1)[0];
  }

  return pickRandom(TOPICS, 1)[0];
}

function parseGenerationSlot(slotParam: string | null): GenerationSlot | null {
  if (!slotParam) return null;
  if (slotParam === "main" || slotParam === "extra-1" || slotParam === "extra-2" || slotParam === "extra-3") {
    return slotParam;
  }
  return null;
}

function buildGenerationTargets(date: string, slot: GenerationSlot | null, isToday: boolean): GenerationTarget[] {
  if (slot === "main") {
    return [{ key: date, ttl: KV_TTL_MAIN, slot }];
  }

  if (slot && slot.startsWith("extra-")) {
    return [{ key: `${date}-${slot}`, ttl: KV_TTL_EXTRA, slot }];
  }

  if (!isToday) {
    return [{ key: date, ttl: KV_TTL_MAIN, slot: "main" }];
  }

  return [
    { key: date, ttl: KV_TTL_MAIN, slot: "main" },
    { key: `${date}-extra-1`, ttl: KV_TTL_EXTRA, slot: "extra-1" },
    { key: `${date}-extra-2`, ttl: KV_TTL_EXTRA, slot: "extra-2" },
    { key: `${date}-extra-3`, ttl: KV_TTL_EXTRA, slot: "extra-3" },
  ];
}

async function generateArticle(
  ai: unknown,
  topic: string,
  index: number,
  totalArticles: number,
  historyTitles: string[]
): Promise<string> {
  const historyHint = historyTitles.length > 0
    ? `\n\n注意：以下主题已经生成过，请务必避免重复或接近的内容：\n${historyTitles.slice(-TOPICS_HISTORY_MAX_IN_PROMPT).map(t => `- ${t}`).join("\n")}`
    : "";

  const prompt = `你是一个科普作家，负责为"每日一个为什么"网站创作内容。请根据以下要求生成一篇文章：

主题领域：${topic}
文章编号：第${index + 1}篇（共${totalArticles}篇，每篇主题必须不同）

要求：
1. 标题格式：# 为什么XXX？（必须以"为什么"开头，提出一个有趣的科普问题）
2. 正文 300-500 字，用通俗易懂的语言解释
3. 使用 Markdown 格式：
   - 2-3 个子标题（## 开头）展开解释
   - 适当使用**加粗**、列表、引用等格式
   - 结尾用引用块（> ）写一句总结金句
4. 底部附 1-2 条参考资料来源（格式：*参考资料：xxx*）
5. 内容风格：通俗易懂、有趣味性、有深度，适合大众阅读
6. 不要出现"今天我们来聊聊"之类的开场白，直接进入正题${historyHint}

请直接输出 Markdown 格式的文章，不要有额外的说明。`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (ai as any).run("@cf/meta/llama-4-scout-17b-16e-instruct", {
    messages: [
      { role: "system", content: "你是一个专业的中文科普作家，擅长用通俗有趣的方式解释复杂的科学问题。" },
      { role: "user", content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.8,
  });

  return response?.response || "";
}

function validateContent(content: string): boolean {
  if (!content || content.length < 100) return false;
  if (!content.includes("# 为什么")) return false;
  return true;
}

function validateGeneratedArticle(
  content: string,
  seenTitles: string[]
): { valid: boolean; title: string; error?: string } {
  if (!validateContent(content)) {
    return { valid: false, title: "", error: "内容验证失败" };
  }

  const title = extractTitle(content);
  if (!title) {
    return { valid: false, title: "", error: "标题提取失败" };
  }

  const normalizedTitle = normalizeTitle(title);
  const hasDuplicate = seenTitles.some((seenTitle) => normalizeTitle(seenTitle) === normalizedTitle);
  if (hasDuplicate) {
    return { valid: false, title, error: `标题重复: ${title}` };
  }

  return { valid: true, title };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRegenerate = searchParams.get("force") === "1";
  const dateParam = searchParams.get("date"); // 支持指定日期，如 ?date=2026-06-28
  const slotParam = searchParams.get("slot");

  try {
    const ctx = await getCloudflareContext({ async: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = ctx.env as any;
    const kv = env.CONTENT_KV;
    const ai = env.AI;

    if (!ai) {
      return NextResponse.json(
        { error: "AI binding 未配置，请在 wrangler.jsonc 中添加 [ai] binding" },
        { status: 500 }
      );
    }

    // 支持指定日期，默认今天
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getBeijingToday();
    const actualToday = getBeijingToday();
    const requestedSlot = parseGenerationSlot(slotParam);
    if (slotParam && !requestedSlot) {
      return NextResponse.json(
        { error: "slot 参数不正确" },
        { status: 400 }
      );
    }
    // 非当天只生成1篇主内容（不需要extra）
    const isToday = today === actualToday;
    const targets = buildGenerationTargets(today, requestedSlot, isToday);
    const articleCount = targets.length;

    // Check if content already exists
    if (!forceRegenerate) {
      const existingKey = targets[0].key;
      const existing = await kv.get(existingKey, { type: "text" });
      if (existing) {
        return NextResponse.json({
          status: "skipped",
          message: `${existingKey} 已有内容，跳过生成。加 ?force=1 可强制重新生成`,
          today,
        });
      }
    }

    // Pick topics based on article count (today=4, other days=1)
    const selectedTopics = pickRandom(TOPICS, articleCount);
    const results: { key: string; content: string; status: string }[] = [];
    const resolvedTopics: string[] = [];

    // Load topics history for deduplication
    const historyTitles = await getTopicsHistory(kv);
    const newTitles: string[] = [];

    // Generate articles
    for (let i = 0; i < articleCount; i++) {
      let content = "";
      let title = "";
      let currentTopic = selectedTopics[i];
      let attempts = 0;
      let lastError = "";
      const attemptedTopics = new Set<string>();

      while (attempts < MAX_GENERATE_ATTEMPTS) {
        attempts++;
        try {
          attemptedTopics.add(currentTopic);
          const seenTitles = [...historyTitles, ...newTitles];
          content = await generateArticle(ai, currentTopic, i, articleCount, seenTitles);
          const validation = validateGeneratedArticle(content, seenTitles);
          if (validation.valid) {
            title = validation.title;
            break;
          }
          lastError = validation.error || "内容验证失败";
          if (attempts < MAX_GENERATE_ATTEMPTS) {
            currentTopic = pickRetryTopic(resolvedTopics, attemptedTopics);
          }
        } catch (err) {
          lastError = String(err);
          if (attempts < MAX_GENERATE_ATTEMPTS) {
            currentTopic = pickRetryTopic(resolvedTopics, attemptedTopics);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      resolvedTopics.push(currentTopic);
      if (!title) {
        content = buildGenerationFailureContent(lastError);
        results.push({ key: targets[i].key, content, status: `failed (${lastError})` });
      } else {
        results.push({ key: targets[i].key, content, status: "ok" });
        newTitles.push(title);
      }

      await kv.put(targets[i].key, content, { expirationTtl: targets[i].ttl });
    }

    // Persist new titles to topics history (no TTL — permanent)
    if (newTitles.length > 0) {
      await appendTopicsHistory(kv, newTitles);
    }

    return NextResponse.json({
      status: "ok",
      today,
      topics: resolvedTopics,
      results: results.map(r => ({
        key: r.key,
        status: r.status,
        length: r.content.length,
        preview: r.content.substring(0, 80),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `生成失败: ${String(err)}` },
      { status: 500 }
    );
  }
}
