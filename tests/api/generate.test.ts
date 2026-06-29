/**
 * /api/content/generate API 路由逻辑测试
 * 测试日期参数、强制重新生成、内容验证等
 */
import { describe, it, expect, vi } from "vitest";

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
  it("支持 date 参数指定生成日期", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-28"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.today).toBe("2026-06-28");
    expect(data.status).toBe("ok");
  });

  it("无效日期格式回退到今天", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=invalid"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("生成 4 篇文章写入 KV", async () => {
    const req = new Request(
      "http://localhost/api/content/generate?force=1&date=2026-06-27"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.results).toHaveLength(4);
    expect(data.results[0].key).toBe("2026-06-27");
    expect(data.results[1].key).toBe("2026-06-27-extra-1");
    expect(data.results[2].key).toBe("2026-06-27-extra-2");
    expect(data.results[3].key).toBe("2026-06-27-extra-3");
  });

  it("已有内容且不 force 时跳过", async () => {
    mockKV["2026-06-26"] = "# 已有内容";
    const req = new Request(
      "http://localhost/api/content/generate?date=2026-06-26"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe("skipped");
  });
});
