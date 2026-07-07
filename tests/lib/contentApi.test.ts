import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildContentRequestUrl, buildDatesRequestUrl } from "@/lib/contentApi";

describe("buildDatesRequestUrl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T02:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("为时间列表请求附带 yyyy-MM-dd 的 _t 参数", () => {
    expect(buildDatesRequestUrl()).toBe("/api/content?_t=2026-07-06");
  });

  it("下拉刷新首页时为时间列表请求附带 _refresh 参数", () => {
    expect(buildDatesRequestUrl(true)).toBe("/api/content?_t=2026-07-06&_refresh=1");
  });
});

describe("buildContentRequestUrl", () => {
  it("为内容请求附带 date 参数", () => {
    expect(buildContentRequestUrl("2026-07-05")).toBe("/api/content?date=2026-07-05");
  });

  it("为内容强刷请求附带 _refresh 参数", () => {
    expect(buildContentRequestUrl("2026-07-05", true)).toBe("/api/content?date=2026-07-05&_refresh=1");
  });
});
