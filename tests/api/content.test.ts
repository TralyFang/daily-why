/**
 * /api/content API 路由逻辑测试
 * 测试日期验证、extra key 格式、响应结构
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock getCloudflareContext — 不实际连接 KV
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

// Mock content module
const mockContent: Record<string, string> = {
  "2026-06-29": "# 为什么天空是蓝色的？\n\n这是一篇测试文章...",
  "2026-06-28": "# 为什么水会结冰？\n\n这是另一篇测试文章...",
  "2026-06-29-extra-1": "# 为什么猫会打呼噜？\n\n额外内容...",
};

vi.mock("@/lib/content", () => ({
  getContentForDate: vi.fn((date: string) => {
    return Promise.resolve(mockContent[date] || null);
  }),
  getAvailableDates: vi.fn(() => {
    return Promise.resolve(["2026-06-29", "2026-06-28"]);
  }),
  getExtraContentForDate: vi.fn((key: string) => {
    return Promise.resolve(mockContent[key] || null);
  }),
}));

// Import after mocks
import { GET } from "@/app/api/content/route";

describe("/api/content GET", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("无参数时返回 availableDates 列表", async () => {
    const req = new Request("http://localhost/api/content");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.availableDates).toEqual(["2026-06-29", "2026-06-28"]);
    expect(data.today).toBe("2026-06-29");
  });

  it("带 date 参数返回对应日期内容", async () => {
    const req = new Request("http://localhost/api/content?date=2026-06-29");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toContain("为什么天空是蓝色的");
    expect(data.date).toBe("2026-06-29");
  });

  it("不在可查看范围的日期返回 404", async () => {
    const req = new Request("http://localhost/api/content?date=2020-01-01");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("不在可查看范围");
  });

  it("无效日期格式返回 400", async () => {
    const req = new Request("http://localhost/api/content?date=invalid");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("extra key 格式正确时返回内容", async () => {
    const req = new Request("http://localhost/api/content?date=2026-06-29-extra-1");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toContain("为什么猫会打呼噜");
  });

  it("不存在的 extra key 返回 404", async () => {
    const req = new Request("http://localhost/api/content?date=2026-06-29-extra-3");
    const res = await GET(req);

    expect(res.status).toBe(404);
  });

  it("extra key 格式不合法返回 400", async () => {
    const req = new Request("http://localhost/api/content?date=2026-06-29-extra-5");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });
});
