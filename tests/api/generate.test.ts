/**
 * /api/content/generate API 路由逻辑测试
 * 测试日期参数、强制重新生成、默认只生成主内容、失败不写 KV
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildGenerationFailureContent } from "@/lib/contentFailure";

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
        delete: vi.fn((key: string) => {
          delete mockKV[key];
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
  "# 为什么光的速度是宇宙中最快的？\n\n## 光速的本质\n\n光速约为每秒30万公里，这是宇宙中信息传递的速度上限。这段解释需要足够的中文篇幅，用来说明光既是波动也是粒子，并且没有任何宏观物体能超过这个极限。正因为如此，我们看到的遥远星光其实来自过去。\n\n## 为什么不能超越光速\n\n根据爱因斯坦的狭义相对论，当物体接近光速时，其质量趋向无穷大，所以日常世界里我们永远追不上光。这也解释了为什么高速飞行的时钟会变慢，时间和空间并不是绝对不变的背景。\n\n> 光速不仅是一个速度值，更是时空结构的基本常数。\n\n*参考资料：《相对论》- 爱因斯坦*";

describe("/api/content/generate GET", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 设置北京时间为 2026-06-29（UTC 02:00 = 北京 10:00）
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
    Object.keys(mockKV).forEach((k) => delete mockKV[k]);
    mockAIRun.mockReset();
    mockAIRun.mockResolvedValue({ response: DEFAULT_ARTICLE });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("当天默认只生成 1 篇主内容", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-29"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.today).toBe("2026-06-29");
    expect(data.results).toHaveLength(1);
    expect(data.results[0].key).toBe("2026-06-29");
    expect(mockKV["2026-06-29"]).toContain("# 为什么");
    expect(mockKV["2026-06-29"]).not.toContain("为什么今天的内容还没准备好");
  });

  it("all=1 时当天生成 4 篇文章（1主+3extra）", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&all=1&date=2026-06-29"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.results).toHaveLength(4);
    expect(data.results.map((item: { key: string }) => item.key)).toEqual([
      "2026-06-29",
      "2026-06-29-extra-1",
      "2026-06-29-extra-2",
      "2026-06-29-extra-3",
    ]);
  });

  it("非当天默认也只生成 1 篇主内容", async () => {
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

  it("无效日期格式回退到今天（默认生成1篇）", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=invalid"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.today).toBe("2026-06-29");
    expect(data.results).toHaveLength(1);
  });

  it("已有合格内容且不 force 时跳过", async () => {
    mockKV["2026-06-28"] = DEFAULT_ARTICLE;
    const req = new Request(
      "http://localhost/api/content/generate?date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe("skipped");
    expect(mockAIRun).not.toHaveBeenCalled();
  });

  it("已有失败占位文时会重新生成而不是跳过", async () => {
    mockKV["2026-06-28"] = buildGenerationFailureContent("标题重复: 为什么星星会闪烁？");
    const req = new Request(
      "http://localhost/api/content/generate?date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe("ok");
    expect(mockKV["2026-06-28"]).toContain("# 为什么");
    expect(mockKV["2026-06-28"]).not.toContain("为什么今天的内容还没准备好");
  });

  it("force=1 时即使已有内容也重新生成", async () => {
    mockKV["2026-06-28"] = "# 为什么旧标题还在？\n\n旧内容";
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe("ok");
    expect(data.results).toHaveLength(1);
    expect(mockKV["2026-06-28"]).toContain("*参考资料");
  });

  it("历史已有标题时会换一道题库题，而不是写入失败占位文", async () => {
    mockKV["topics-history"] = JSON.stringify(["为什么星星会闪烁？"]);
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(mockKV["2026-06-28"]).not.toContain("为什么星星会闪烁？");
    expect(mockKV["2026-06-28"]).not.toContain("为什么今天的内容还没准备好");
    const history = JSON.parse(mockKV["topics-history"]) as string[];
    expect(history).toContain("为什么星星会闪烁？");
    expect(history.length).toBeGreaterThan(1);
  });

  it("生成失败时不写入 KV", async () => {
    mockAIRun.mockResolvedValue({ response: "too short" });
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.status).toBe("error");
    expect(mockKV["2026-06-28"]).toBeUndefined();
  });

  it("失败占位文重生再次失败时会删除旧内容", async () => {
    mockKV["2026-06-28"] = buildGenerationFailureContent("标题重复");
    mockAIRun.mockResolvedValue({ response: "too short" });
    const req = new Request(
      "http://localhost/api/content/generate?date=2026-06-28"
    );
    const res = await GET(req);

    expect(res.status).toBe(503);
    expect(mockKV["2026-06-28"]).toBeUndefined();
  });

  it("slot=main 时只重生主内容", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-29&slot=main"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].key).toBe("2026-06-29");
  });

  it("slot=extra-2 时只重生指定副内容", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-29&slot=extra-2"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].key).toBe("2026-06-29-extra-2");
    expect(mockKV["2026-06-29-extra-2"]).toContain("# 为什么");
  });

  it("slot 参数不合法时返回 400", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-29&slot=extra-9"
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
  });
});
