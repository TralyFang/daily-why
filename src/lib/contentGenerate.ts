import { isGenerationFailureContent } from "./contentFailure";
import { pickQuestions, normalizeTitle, type BankQuestion } from "./questionBank";
import {
  appendGenerationMeta,
  estimateNeurons,
  extractAiUsage,
} from "./generationMeta";

export const KV_TTL_SECONDS = 7 * 24 * 60 * 60;
export const TOPICS_HISTORY_KEY = "topics-history";
export const MAX_ATTEMPTS_PER_MODEL = 2;

export const AI_MODELS = [
  "@cf/qwen/qwen3.8-27b",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
] as const;

export type GenerationSlot = "main" | "extra-1" | "extra-2" | "extra-3";

export interface GenerationTarget {
  key: string;
  ttl: number;
  slot: GenerationSlot;
}

export interface ArticleValidation {
  valid: boolean;
  title: string;
  error?: string;
}

const MIN_CHINESE_CHARS = 180;
const MAX_CONTENT_CHARS = 4000;

export function parseGenerationSlot(slotParam: string | null): GenerationSlot | null {
  if (!slotParam) return null;
  if (slotParam === "main" || slotParam === "extra-1" || slotParam === "extra-2" || slotParam === "extra-3") {
    return slotParam;
  }
  return null;
}

export function buildGenerationTargets(
  date: string,
  slot: GenerationSlot | null,
  generateAll: boolean
): GenerationTarget[] {
  if (slot === "main") {
    return [{ key: date, ttl: KV_TTL_SECONDS, slot }];
  }

  if (slot && slot.startsWith("extra-")) {
    return [{ key: `${date}-${slot}`, ttl: KV_TTL_SECONDS, slot }];
  }

  if (generateAll) {
    return [
      { key: date, ttl: KV_TTL_SECONDS, slot: "main" },
      { key: `${date}-extra-1`, ttl: KV_TTL_SECONDS, slot: "extra-1" },
      { key: `${date}-extra-2`, ttl: KV_TTL_SECONDS, slot: "extra-2" },
      { key: `${date}-extra-3`, ttl: KV_TTL_SECONDS, slot: "extra-3" },
    ];
  }

  return [{ key: date, ttl: KV_TTL_SECONDS, slot: "main" }];
}

export function extractTitle(content: string): string {
  const match = content.match(/^#\s*(为什么.+？)/m);
  return match ? match[1] : "";
}

export function stripModelArtifacts(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export function enforceTitle(content: string, title: string): string {
  const heading = `# ${title}`;
  if (/^#\s+/.test(content)) {
    return content.replace(/^#\s+.+$/m, heading);
  }
  return `${heading}\n\n${content}`;
}

export function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

export function shouldSkipExisting(existing: string | null | undefined, forceRegenerate: boolean): boolean {
  if (forceRegenerate) return false;
  if (!existing) return false;
  if (isGenerationFailureContent(existing)) return false;
  if (existing.length < 100) return false;
  if (!existing.includes("# 为什么")) return false;
  return true;
}

export function validateArticle(content: string, expectedTitle: string): ArticleValidation {
  if (!content || content.length < 100) {
    return { valid: false, title: "", error: "内容过短" };
  }

  if (content.length > MAX_CONTENT_CHARS) {
    return { valid: false, title: "", error: "内容过长" };
  }

  const title = extractTitle(content);
  if (!title) {
    return { valid: false, title: "", error: "标题提取失败" };
  }

  if (normalizeTitle(title) !== normalizeTitle(expectedTitle)) {
    return { valid: false, title, error: `标题不匹配: ${title}` };
  }

  const chineseChars = countChineseChars(content);
  if (chineseChars < MIN_CHINESE_CHARS) {
    return { valid: false, title, error: "中文篇幅不足" };
  }

  const headingCount = (content.match(/^##\s+/gm) || []).length;
  if (headingCount < 2) {
    return { valid: false, title, error: "缺少小标题" };
  }

  if (!content.includes(">")) {
    return { valid: false, title, error: "缺少总结金句" };
  }

  if (!content.includes("参考资料")) {
    return { valid: false, title, error: "缺少参考资料" };
  }

  if (isGenerationFailureContent(content)) {
    return { valid: false, title, error: "失败占位文" };
  }

  return { valid: true, title };
}

export function extractAiText(response: unknown): string {
  if (!response) return "";
  if (typeof response === "string") return response;

  const record = response as Record<string, unknown>;
  if (typeof record.response === "string") return record.response;

  const choices = record.choices;
  if (Array.isArray(choices) && choices[0]) {
    const message = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text?: unknown }).text || "");
          }
          return "";
        })
        .join("");
    }
  }

  return "";
}

export function buildArticlePrompt(question: BankQuestion): { system: string; user: string } {
  const system = "你是一个专业的中文科普作家，擅长用通俗有趣的方式解释复杂的科学问题。只输出 Markdown 正文，不要输出思考过程。";
  const user = `请为「每日一个为什么」写一篇科普短文，必须严格遵守以下要求：

指定标题（一行都不能改）：# ${question.title}
主题领域：${question.topic}

结构示例：
# 为什么天空是蓝色的？

## 光的散射原理
用 2-4 句讲清核心机制，关键术语用**加粗**。

## 生活中的例子
- 用列表给出 2-3 个日常可观察的例子
- 避免术语堆砌

## 一个容易被忽略的细节
再补一个有趣的转折或误区纠正。

> 用一句好记的金句收尾。

*参考资料：真实或经典的书名/论文/科普来源*

硬性要求：
1. 第一行必须是「# ${question.title}」，禁止换题或改写成别的为什么
2. 全文用简体中文，300-500 字
3. 至少 2 个「##」小标题
4. 必须有引用金句和参考资料
5. 不要出现「今天我们来聊聊」这类开场白
6. 不要输出英文为主的段落，不要输出 <think> 或任何解释性前言

请直接输出 Markdown 文章。`;

  return { system, user };
}

export function pickSlotQuestion(usedTitles: string[], sameDayTitles: string[]): BankQuestion | null {
  const picked = pickQuestions(usedTitles, 1, sameDayTitles);
  return picked[0] || null;
}

export async function generateArticleForQuestion(
  ai: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> },
  question: BankQuestion
): Promise<{ content: string; model: string } | { error: string }> {
  let lastError = "生成失败";
  let attempts = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let neurons = 0;
  let hasNeuronEstimate = false;

  for (const model of AI_MODELS) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const prompt = buildArticlePrompt(question);
        const response = await ai.run(model, {
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          max_tokens: 1800,
          temperature: 0.7,
          reasoning_effort: "low",
        });

        attempts += 1;
        const usage = extractAiUsage(response);
        promptTokens += usage.promptTokens;
        completionTokens += usage.completionTokens;
        const neuronCost = estimateNeurons(model, usage);
        if (neuronCost != null) {
          neurons += neuronCost;
          hasNeuronEstimate = true;
        }

        let content = stripModelArtifacts(extractAiText(response));
        content = enforceTitle(content, question.title);
        const validation = validateArticle(content, question.title);
        if (validation.valid) {
          return {
            content: appendGenerationMeta(content, {
              model,
              promptTokens,
              completionTokens,
              neurons: hasNeuronEstimate ? neurons : null,
              attempts,
            }),
            model,
          };
        }
        lastError = validation.error || "内容验证失败";
      } catch (err) {
        lastError = String(err);
      }
    }
  }

  return { error: lastError };
}

export async function getTopicsHistory(kv: { get: Function }): Promise<string[]> {
  try {
    const raw = await kv.get(TOPICS_HISTORY_KEY, { type: "text" });
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const key = normalizeTitle(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  } catch {
    return [];
  }
}

export async function appendTopicsHistory(
  kv: { get: Function; put: Function },
  newTopics: string[]
): Promise<string[]> {
  const existing = await getTopicsHistory(kv);
  const seen = new Set(existing.map(normalizeTitle));
  const updated = [...existing];
  for (const topic of newTopics) {
    const key = normalizeTitle(topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    updated.push(topic);
  }
  await kv.put(TOPICS_HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export async function collectSameDayTitles(
  kv: { get: Function },
  date: string,
  exceptKey?: string
): Promise<string[]> {
  const keys = [date, `${date}-extra-1`, `${date}-extra-2`, `${date}-extra-3`];
  const titles: string[] = [];
  for (const key of keys) {
    if (key === exceptKey) continue;
    try {
      const content = await kv.get(key, { type: "text" });
      if (!content || isGenerationFailureContent(content)) continue;
      const title = extractTitle(content);
      if (title) titles.push(title);
    } catch {
      // ignore unreadable keys
    }
  }
  return titles;
}
