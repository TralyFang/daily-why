/**
 * Service Worker 缓存策略测试
 * 验证 network-first 行为、缓存键处理、离线回退
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 模拟 SW 的缓存逻辑（提取核心逻辑做单元测试）

describe("SW API 缓存策略 — network-first", () => {
  /**
   * 模拟 SW 中 API 请求的处理逻辑
   */
  function stripCacheBuster(url: string): string {
    const u = new URL(url);
    u.searchParams.delete("_t");
    u.searchParams.delete("_d");
    return u.toString();
  }

  it("去除 _t 参数作为缓存键", () => {
    const url = "https://example.com/api/content?_t=1719640000000";
    const cacheKey = stripCacheBuster(url);
    expect(cacheKey).toBe("https://example.com/api/content");
  });

  it("去除 _d 参数作为缓存键", () => {
    const url = "https://example.com/api/content?_d=2026-06-29";
    const cacheKey = stripCacheBuster(url);
    expect(cacheKey).toBe("https://example.com/api/content");
  });

  it("保留 date 参数", () => {
    const url = "https://example.com/api/content?date=2026-06-29&_t=123";
    const cacheKey = stripCacheBuster(url);
    expect(cacheKey).toBe("https://example.com/api/content?date=2026-06-29");
  });

  it("多个参数时只去除 cache-buster", () => {
    const url = "https://example.com/api/content?date=2026-06-28&type=extras&_t=999&_d=2026-06-29";
    const cacheKey = stripCacheBuster(url);
    expect(cacheKey).toBe("https://example.com/api/content?date=2026-06-28&type=extras");
  });
});

describe("SW 缓存行为模拟", () => {
  let cacheStore: Map<string, Response>;

  beforeEach(() => {
    cacheStore = new Map();
  });

  /**
   * 模拟 network-first 策略
   */
  async function networkFirst(
    requestUrl: string,
    networkFn: () => Promise<Response | null>
  ): Promise<Response> {
    const cacheUrl = new URL(requestUrl);
    cacheUrl.searchParams.delete("_t");
    cacheUrl.searchParams.delete("_d");
    const cacheKey = cacheUrl.toString();

    try {
      const response = await networkFn();
      if (response && response.ok) {
        cacheStore.set(cacheKey, response.clone());
      }
      if (response) return response;
      throw new Error("null response");
    } catch {
      // 网络失败，尝试缓存
      const cached = cacheStore.get(cacheKey);
      if (cached) return cached.clone();
      return new Response(JSON.stringify({ error: "离线状态" }), { status: 503 });
    }
  }

  it("网络正常时返回网络响应并更新缓存", async () => {
    const networkResponse = new Response(JSON.stringify({ content: "新内容" }), {
      status: 200,
    });

    const result = await networkFirst(
      "https://example.com/api/content?_t=123",
      () => Promise.resolve(networkResponse)
    );

    const data = await result.json();
    expect(data.content).toBe("新内容");
    // 缓存键去掉了 _t
    expect(cacheStore.has("https://example.com/api/content")).toBe(true);
  });

  it("网络失败时返回缓存内容", async () => {
    // 先填充缓存
    cacheStore.set(
      "https://example.com/api/content",
      new Response(JSON.stringify({ content: "缓存内容" }), { status: 200 })
    );

    const result = await networkFirst(
      "https://example.com/api/content?_t=456",
      () => Promise.reject(new Error("网络超时"))
    );

    const data = await result.json();
    expect(data.content).toBe("缓存内容");
  });

  it("网络失败且无缓存时返回 503", async () => {
    const result = await networkFirst(
      "https://example.com/api/content?_t=789",
      () => Promise.reject(new Error("网络超时"))
    );

    expect(result.status).toBe(503);
  });

  it("不同 _t 参数使用同一缓存键", async () => {
    // 第一次请求
    await networkFirst(
      "https://example.com/api/content?date=2026-06-29&_t=100",
      () => Promise.resolve(new Response(JSON.stringify({ v: 1 }), { status: 200 }))
    );

    // 网络失败，但缓存应该命中
    const result = await networkFirst(
      "https://example.com/api/content?date=2026-06-29&_t=200",
      () => Promise.reject(new Error("fail"))
    );

    const data = await result.json();
    expect(data.v).toBe(1);
  });
});
