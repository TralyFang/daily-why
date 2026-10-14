import { describe, expect, it } from "vitest";
import {
  DAILY_NEURON_LIMIT,
  dailyNeuronPercent,
  fetchOfficialDailyNeurons,
  formatDailyNeuronLine,
  parseAiInferenceNeurons,
  utcDayRange,
} from "@/lib/aiUsage";

describe("aiUsage", () => {
  it("按 Cloudflare 仪表盘格式展示用量", () => {
    expect(formatDailyNeuronLine(3810)).toBe("今天使用的神经元：3.81k/10k");
    expect(formatDailyNeuronLine(4166.86)).toBe("今天使用的神经元：4.17k/10k");
    expect(formatDailyNeuronLine(0)).toBe("今天使用的神经元：0/10k");
    expect(DAILY_NEURON_LIMIT).toBe(10_000);
    expect(dailyNeuronPercent(3810)).toBe(38);
  });

  it("按 UTC 自然日切分官方用量查询窗口", () => {
    expect(utcDayRange("2026-10-14")).toEqual({
      start: "2026-10-14T00:00:00Z",
      end: "2026-10-15T00:00:00Z",
    });
  });

  it("从 GraphQL aiInferenceAdaptiveGroups 解析神经元", () => {
    expect(
      parseAiInferenceNeurons({
        data: {
          viewer: {
            accounts: [
              {
                aiInferenceAdaptiveGroups: [
                  { count: 26, sum: { totalNeurons: 4166.863548278809 } },
                ],
              },
            ],
          },
        },
        errors: null,
      })
    ).toEqual({ neurons: 4166.863548278809, calls: 26 });

    expect(parseAiInferenceNeurons({ data: { viewer: { accounts: [] } } })).toEqual({
      neurons: 0,
      calls: 0,
    });
  });

  it("通过官方 GraphQL 接口读取当日用量", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.variables).toEqual({
        accountTag: "acct_test",
        start: "2026-10-14T00:00:00Z",
        end: "2026-10-15T00:00:00Z",
      });
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  aiInferenceAdaptiveGroups: [
                    { count: 3, sum: { totalNeurons: 3810 } },
                  ],
                },
              ],
            },
          },
          errors: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    await expect(
      fetchOfficialDailyNeurons({
        accountId: "acct_test",
        apiToken: "token",
        date: "2026-10-14",
        fetchImpl,
      })
    ).resolves.toEqual({
      date: "2026-10-14",
      neurons: 3810,
      calls: 3,
    });
  });
});
