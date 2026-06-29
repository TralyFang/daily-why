/**
 * /api/content/generate API 路由逻辑测试
 * 测试日期参数、强制重新生成、非当天只生成1篇等
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock KV store — must use inline values in vi.mock factory (hoisted)
const mockKV: Record<string, string> = {};

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
        run: vi.fn().mockResolvedValue({
          response:
            "# 为什么光的速度是宇宙中最快的？\n\n## 光速的本质\n\n光速约为每秒30万公里，这是宇宙中信息传递的速度上限。\n\n## 为什么不能超越光速\n\n根据爱因斯坦的狭义相对论，当物体接近光速时，其质量趋向无穷大。\n\n> 光速不仅是一个速度值，更是时空结构的基本常数。\n\n*参考资料：《相对论》- 爱因斯坦*",
        }),
      },
    },
  }),
}));

import { GET } from "@/app/api/content/generate/route";

describe("/api/content/generate GET", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 设置北京时间为 2026-06-29（UTC 02:00 = 北京 10:00）
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
    // 清空 mockKV
    Object.keys(mockKV).forEach(k => delete mockKV[k]);
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
});
