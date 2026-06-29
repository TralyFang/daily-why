/**
 * dates.ts 工具函数测试
 * 覆盖日期解析、格式化、有效日期窗口、标签生成等逻辑
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseLocalDate,
  formatDate,
  getToday,
  getValidDates,
  isDateViewable,
  dayDiff,
  getDateLabel,
  getWeekday,
} from "@/lib/dates";

describe("parseLocalDate", () => {
  it("正确解析 YYYY-MM-DD 格式", () => {
    const date = parseLocalDate("2026-06-29");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5); // 0-indexed
    expect(date.getDate()).toBe(29);
  });

  it("解析月初日期", () => {
    const date = parseLocalDate("2026-01-01");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });
});

describe("formatDate", () => {
  it("格式化为 YYYY-MM-DD", () => {
    const date = new Date(2026, 5, 29); // June 29, 2026
    expect(formatDate(date)).toBe("2026-06-29");
  });

  it("月份和日期补零", () => {
    const date = new Date(2026, 0, 5); // Jan 5
    expect(formatDate(date)).toBe("2026-01-05");
  });
});

describe("getToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("返回北京时间的今天日期", () => {
    // 设置 UTC 时间为 2026-06-29 02:00 (北京时间 10:00)
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
    expect(getToday()).toBe("2026-06-29");
  });

  it("UTC 跨天但北京时间未跨天", () => {
    // UTC 2026-06-28 20:00 = 北京 2026-06-29 04:00
    vi.setSystemTime(new Date("2026-06-28T20:00:00Z"));
    expect(getToday()).toBe("2026-06-29");
  });

  it("UTC 当天但北京时间已跨天", () => {
    // UTC 2026-06-29 16:30 = 北京 2026-06-30 00:30
    vi.setSystemTime(new Date("2026-06-29T16:30:00Z"));
    expect(getToday()).toBe("2026-06-30");
  });
});

describe("getValidDates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 北京时间 2026-06-29 10:00
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("返回 8 个日期（今天 + 7 天前）", () => {
    const dates = getValidDates();
    expect(dates).toHaveLength(8);
  });

  it("第一个日期是今天", () => {
    const dates = getValidDates();
    expect(dates[0]).toBe("2026-06-29");
  });

  it("最后一个日期是 7 天前", () => {
    const dates = getValidDates();
    expect(dates[7]).toBe("2026-06-22");
  });

  it("日期从新到旧排列", () => {
    const dates = getValidDates();
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] > dates[i + 1]).toBe(true);
    }
  });
});

describe("isDateViewable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("今天的日期可查看", () => {
    expect(isDateViewable("2026-06-29")).toBe(true);
  });

  it("7 天前的日期可查看", () => {
    expect(isDateViewable("2026-06-22")).toBe(true);
  });

  it("8 天前的日期不可查看", () => {
    expect(isDateViewable("2026-06-21")).toBe(false);
  });

  it("未来日期不可查看", () => {
    expect(isDateViewable("2026-06-30")).toBe(false);
  });
});

describe("dayDiff", () => {
  it("同一天返回 0", () => {
    expect(dayDiff("2026-06-29", "2026-06-29")).toBe(0);
  });

  it("昨天返回 1", () => {
    expect(dayDiff("2026-06-28", "2026-06-29")).toBe(1);
  });

  it("7 天前返回 7", () => {
    expect(dayDiff("2026-06-22", "2026-06-29")).toBe(7);
  });
});

describe("getDateLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T02:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("今天返回'今天'", () => {
    expect(getDateLabel("2026-06-29")).toBe("今天");
  });

  it("昨天返回'昨天'", () => {
    expect(getDateLabel("2026-06-28")).toBe("昨天");
  });

  it("前天返回'前天'", () => {
    expect(getDateLabel("2026-06-27")).toBe("前天");
  });

  it("3-7 天前返回'N天前'", () => {
    expect(getDateLabel("2026-06-26")).toBe("3天前");
    expect(getDateLabel("2026-06-22")).toBe("7天前");
  });

  it("超过 7 天返回'M月D日'", () => {
    expect(getDateLabel("2026-06-20")).toBe("6月20日");
  });
});

describe("getWeekday", () => {
  it("返回正确的星期", () => {
    // 2026-06-29 是周一
    expect(getWeekday("2026-06-29")).toBe("周一");
  });

  it("周日", () => {
    // 2026-06-28 是周日
    expect(getWeekday("2026-06-28")).toBe("周日");
  });
});
