/**
 * /api/content/generate API 路由逻辑测试
 * 测试日期参数、强制重新生成、非当天只生成1篇等
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock KV store — must use inline values in vi.mock factory (hoisted)
const mockKV: Record<string, string> = {};
const { mockAIRun } = vi.hoisted(() => ({
  mockAIRun: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn().mockResolvedValue({
    env: {
      CONTENT_KV: {
        get: vi.fn((key: string) => Promise.resolve(mockKV[key] || null)),
        put: vi.fn((key: string, value: string) => {
          mockKV[key] = value;
          return Promise.resolve();
        }),
      },
      AI: {
        run: mockAIRun,
      },
    },
  }),
}));

import { GET } from "@/app/api/content/generate/route";

const DEFAULT_ARTICLE =
  "# 为什么光的速度是宇宙中最快的？\n\n## 光速的本质\n\n光速约为每秒30万公里，这是宇宙中信息传递的速度上限。\n\n## 为什么不能超越光速\n\n根据爱因斯坦的狭义相对论，当物体接近光速时，其质量趋向无穷大。\n\n> 光速不仅是一个速度值，更是时空结构的基本常数。\n\n*参考资料：《相对论》- 爱因斯坦*";

function buildArticle(title: string): string {
  return `# ${title}\n\n## 原理\n\n这是一段足够长的科普正文，用来满足内容长度校验，并说明这个主题背后的核心机制和背景信息。\n\n## 解释\n\n这里继续补充细节，确保正文长度超过校验阈值，同时保留标准的 Markdown 结构和结尾总结。\n\n> 这是关于${title}的一句总结。\n\n*参考资料：测试资料*`;
}

describe("/api/content/generate GET", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 设置北京时间为 2026-06-29（UTC 02:00 = 北京 10:00）
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
    // 清空 mockKV
    Object.keys(mockKV).forEach(k => delete mockKV[k]);
    mockAIRun.mockReset();
    mockAIRun.mockResolvedValue({ response: DEFAULT_ARTICLE });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("当天生成 4 篇文章（1主+3extra）", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-29"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.today).toBe("2026-06-29");
    expect(data.results).toHaveLength(4);
    expect(data.results[0].key).toBe("2026-06-29");
    expect(data.results[1].key).toBe("2026-06-29-extra-1");
    expect(data.results[2].key).toBe("2026-06-29-extra-2");
    expect(data.results[3].key).toBe("2026-06-29-extra-3");
  });

  it("非当天只生成 1 篇主内容（无extra）", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.today).toBe("2026-06-28");
    expect(data.results).toHaveLength(1);
    expect(data.results[0].key).toBe("2026-06-28");
  });

  it("无效日期格式回退到今天（生成4篇）", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=invalid"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.today).toBe("2026-06-29");
    expect(data.results).toHaveLength(4);
  });

  it("已有内容且不 force 时跳过", async () => {
    mockKV["2026-06-28"] = "# 已有内容";
    const req = new Request(
      "http://localhost/api/content/generate?date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe("skipped");
  });

  it("force=1 时即使已有内容也重新生成", async () => {
    mockKV["2026-06-28"] = "# 旧内容";
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe("ok");
    expect(data.results).toHaveLength(1);
  });

  it("命中历史重复标题时会重试直到生成新标题", async () => {
    mockKV["topics-history"] = JSON.stringify(["为什么星星会闪烁？"]);
    mockAIRun
      .mockResolvedValueOnce({ response: buildArticle("为什么星星会闪烁？") })
      .mockResolvedValueOnce({ response: buildArticle("为什么海水是咸的？") });

    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.results).toHaveLength(1);
    expect(mockAIRun).toHaveBeenCalledTimes(2);
    expect(mockKV["2026-06-28"]).toContain("为什么海水是咸的？");

    const firstPrompt = mockAIRun.mock.calls[0][1].messages[1].content as string;
    const secondPrompt = mockAIRun.mock.calls[1][1].messages[1].content as string;
    const firstTopicMatch = firstPrompt.match(/主题领域：(.+)/);
    const secondTopicMatch = secondPrompt.match(/主题领域：(.+)/);
    expect(firstTopicMatch?.[1]).toBeTruthy();
    expect(secondTopicMatch?.[1]).toBeTruthy();
    expect(secondTopicMatch?.[1]).not.toBe(firstTopicMatch?.[1]);
  });

  it("同批次生成重复标题时会重试后再写入", async () => {
    mockAIRun
      .mockResolvedValueOnce({ response: buildArticle("为什么海水是咸的？") })
      .mockResolvedValueOnce({ response: buildArticle("为什么海水是咸的？") })
      .mockResolvedValueOnce({ response: buildArticle("为什么叶子会变黄？") })
      .mockResolvedValue({ response: buildArticle("为什么风会形成？") });

    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-29"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.results).toHaveLength(4);
    expect(mockAIRun.mock.calls.length).toBeGreaterThan(4);
    expect(mockKV["2026-06-29"]).toContain("为什么海水是咸的？");
    expect(mockKV["2026-06-29-extra-1"]).toContain("为什么叶子会变黄？");
  });
});
