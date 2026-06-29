import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const TOPICS = [
  "自然科学", "物理学", "化学", "生物学", "天文学", "地球科学",
  "生活常识", "人体健康", "食物营养", "日常用品原理",
  "历史故事", "古代文明", "近代历史", "文化习俗",
  "科技发展", "互联网", "人工智能", "航天科技", "量子力学",
  "动物世界", "植物学", "海洋生物", "微生物",
  "心理学", "经济学", "数学趣味", "气象学", "材料科学",
];

const KV_TTL = 7 * 24 * 60 * 60; // 7 days

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

async function generateArticle(
  ai: unknown,
  topic: string,
  index: number
): Promise<string> {
  const prompt = `你是一个科普作家，负责为"每日一个为什么"网站创作内容。请根据以下要求生成一篇文章：

主题领域：${topic}
文章编号：第${index + 1}篇（共4篇，每篇主题必须不同）

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRegenerate = searchParams.get("force") === "1";

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

    const today = getBeijingToday();

    // Check if content already exists
    if (!forceRegenerate) {
      const existing = await kv.get(today, { type: "text" });
      if (existing) {
        return NextResponse.json({
          status: "skipped",
          message: `${today} 已有内容，跳过生成。加 ?force=1 可强制重新生成`,
          today,
        });
      }
    }

    // Pick 4 different topics
    const selectedTopics = pickRandom(TOPICS, 4);
    const keys = [today, `${today}-extra-1`, `${today}-extra-2`, `${today}-extra-3`];
    const results: { key: string; content: string; status: string }[] = [];

    // Generate 4 articles
    for (let i = 0; i < 4; i++) {
      let content = "";
      let attempts = 0;
      let lastError = "";

      while (attempts < 3) {
        attempts++;
        try {
          content = await generateArticle(ai, selectedTopics[i], i);
          if (validateContent(content)) break;
          lastError = "内容验证失败";
        } catch (err) {
          lastError = String(err);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!validateContent(content)) {
        content = `# 为什么今天的内容还没准备好？\n\n很抱歉，今天的内容生成遇到了一些技术问题。\n\n错误信息：${lastError}\n\n> 好奇心永不过期，明天再来探索新问题！`;
        results.push({ key: keys[i], content, status: `failed (${lastError})` });
      } else {
        results.push({ key: keys[i], content, status: "ok" });
      }

      // Write to KV immediately
      await kv.put(keys[i], content, { expirationTtl: KV_TTL });
    }

    return NextResponse.json({
      status: "ok",
      today,
      topics: selectedTopics,
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
