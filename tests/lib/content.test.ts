/**
 * content.ts 测试
 * 确保内容读取通过 KV（线上）或 sample 文件（本地）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock KV data
const mockKVData: Record<string, string> = {
  "2026-06-29": "# 为什么天空是蓝色的？\n\n这是主内容...",
  "2026-06-28": "# 为什么水会结冰？\n\n这是昨天的内容...",
  "2026-06-29-extra-1": "# 为什么猫会打呼噜？\n\n额外内容...",
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn().mockResolvedValue({
    env: {
      CONTENT_KV: {
        get: vi.fn((key: string) => Promise.resolve(mockKVData[key] || null)),
        put: vi.fn().mockResolvedValue(undefined),
      },
    },
  }),
}));

import { getContentForDate, getAvailableDates, getExtraContentForDate } from "@/lib/content";

describe("content.ts - KV mode (Cloudflare runtime)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("getContentForDate 从 KV 获取内容", async () => {
    const content = await getContentForDate("2026-06-29");
    expect(content).toContain("为什么天空是蓝色的");
  });

  it("getContentForDate KV 中不存在时返回 null", async () => {
    const content = await getContentForDate("2026-06-25");
    expect(content).toBeNull();
  });

  it("getExtraContentForDate 从 KV 获取额外内容", async () => {
    const content = await getExtraContentForDate("2026-06-29-extra-1");
    expect(content).toContain("为什么猫会打呼噜");
  });

  it("getExtraContentForDate KV 中不存在时返回 null", async () => {
    const content = await getExtraContentForDate("2026-06-29-extra-3");
    expect(content).toBeNull();
  });

  it("getAvailableDates 只返回 KV 中有内容的日期", async () => {
    const dates = await getAvailableDates();
    expect(dates).toContain("2026-06-29");
    expect(dates).toContain("2026-06-28");
    expect(dates).not.toContain("2026-06-27");
  });

  it("data/ 目录下存在有效的样例文件", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dataDir = path.join(process.cwd(), "data");

    // 验证 8 个主样例文件都存在 (sample-0 到 sample-7)
    for (let i = 0; i <= 7; i++) {
      const filePath = path.join(dataDir, `sample-${i}.md`);
      expect(fs.existsSync(filePath), `sample-${i}.md should exist`).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("# 为什么");
    }

    // 验证 3 个 extra 样例文件都存在
    for (let i = 1; i <= 3; i++) {
      const filePath = path.join(dataDir, `sample-0-extra-${i}.md`);
      expect(fs.existsSync(filePath), `sample-0-extra-${i}.md should exist`).toBe(true);
    }
  });
});
