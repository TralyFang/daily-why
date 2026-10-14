import { describe, expect, it } from "vitest";
import { buildGenerationFailureContent } from "@/lib/contentFailure";
import {
  buildGenerationTargets,
  enforceTitle,
  extractAiText,
  extractTitle,
  shouldSkipExisting,
  stripModelArtifacts,
  validateArticle,
} from "@/lib/contentGenerate";
import {
  appendGenerationMeta,
  estimateNeurons,
  extractAiUsage,
  formatGenerationMeta,
  splitGenerationMeta,
} from "@/lib/generationMeta";

const GOOD_ARTICLE = `# 为什么天空是蓝色的？

## 光的散射原理

太阳光包含各种颜色的光，当它穿过大气层时，会与空气中的分子发生碰撞。这种碰撞会让光向各个方向散射，这就是**瑞利散射**。散射之后，我们从天空的各个方向都能看到偏蓝的光，所以天空看起来是蓝色的。

## 蓝光为什么更容易散射

瑞利散射的强度与光的波长的四次方成反比。蓝光的波长比红光短得多，所以散射强度大约是红光的 **9.4 倍**。紫光虽然更短，但太阳发出的紫光更少，人眼对蓝光也更敏感，所以我们看到的是蓝色而不是紫色。

> 天空的蓝色，是大自然用光的波长写就的诗篇。

*参考资料：《费曼物理学讲义》第一卷·光学*`;

describe("contentGenerate helpers", () => {
  it("默认只生成主内容，all=1 才生成 4 篇", () => {
    expect(buildGenerationTargets("2026-10-14", null, false)).toEqual([
      { key: "2026-10-14", ttl: 7 * 24 * 60 * 60, slot: "main" },
    ]);
    expect(buildGenerationTargets("2026-10-14", null, true)).toHaveLength(4);
    expect(buildGenerationTargets("2026-10-14", "extra-2", false)).toEqual([
      { key: "2026-10-14-extra-2", ttl: 7 * 24 * 60 * 60, slot: "extra-2" },
    ]);
  });

  it("会剥掉思考标签并强制指定标题", () => {
    const raw = `<think>先想一下</think>\n# 为什么星星会闪烁？\n\n正文`;
    const cleaned = stripModelArtifacts(raw);
    expect(cleaned).not.toContain("<think>");
    expect(enforceTitle(cleaned, "为什么天空是蓝色的？")).toContain("# 为什么天空是蓝色的？");
  });

  it("合格文章能通过校验", () => {
    const result = validateArticle(GOOD_ARTICLE, "为什么天空是蓝色的？");
    expect(result.valid).toBe(true);
  });

  it("缺小标题或金句时校验失败", () => {
    expect(validateArticle("# 为什么天空是蓝色的？\n\n只有一段中文说明，没有结构。", "为什么天空是蓝色的？").valid).toBe(false);
    expect(validateArticle(GOOD_ARTICLE.replace(">", ""), "为什么天空是蓝色的？").valid).toBe(false);
  });

  it("已有合格内容会跳过，失败占位文不会跳过", () => {
    expect(shouldSkipExisting(GOOD_ARTICLE, false)).toBe(true);
    expect(shouldSkipExisting(buildGenerationFailureContent("标题重复"), false)).toBe(false);
    expect(shouldSkipExisting(GOOD_ARTICLE, true)).toBe(false);
  });

  it("能从不同 AI 响应格式里取出正文", () => {
    expect(extractAiText({ response: GOOD_ARTICLE })).toBe(GOOD_ARTICLE);
    expect(extractAiText({ choices: [{ message: { content: GOOD_ARTICLE } }] })).toBe(GOOD_ARTICLE);
    expect(extractTitle(GOOD_ARTICLE)).toBe("为什么天空是蓝色的？");
  });

  it("能解析用量并估算 Neurons，页脚不进入正文", () => {
    const usage = extractAiUsage({
      response: GOOD_ARTICLE,
      usage: { prompt_tokens: 800, completion_tokens: 1000 },
    });
    expect(usage).toEqual({ promptTokens: 800, completionTokens: 1000 });
    expect(estimateNeurons("@cf/qwen/qwen3.8-27b", usage)).toBe(324);

    const withMeta = appendGenerationMeta(GOOD_ARTICLE, {
      model: "@cf/qwen/qwen3.8-27b",
      promptTokens: 800,
      completionTokens: 1000,
      neurons: 324,
      attempts: 2,
    });
    const split = splitGenerationMeta(withMeta);
    expect(split.body).toBe(GOOD_ARTICLE);
    expect(split.meta?.model).toBe("@cf/qwen/qwen3.8-27b");
    expect(formatGenerationMeta(split.meta!)).toBe(
      "Qwen 3.8 27B · 输入 800 · 输出 1,000 · 约 324 Neurons · 2 次调用"
    );
  });
});
