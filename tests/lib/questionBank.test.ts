import { describe, expect, it } from "vitest";
import { QUESTION_BANK } from "@/lib/questionBankData";
import { normalizeTitle, pickQuestions } from "@/lib/questionBank";

describe("questionBank", () => {
  it("题库不少于 1000 道且标题唯一", () => {
    const titles = QUESTION_BANK.map((question) => normalizeTitle(question.title));
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(titles).size).toBe(QUESTION_BANK.length);
  });

  it("每道题都是为什么开头并以问号结尾", () => {
    for (const question of QUESTION_BANK) {
      expect(question.title.startsWith("为什么")).toBe(true);
      expect(question.title.endsWith("？")).toBe(true);
      expect(question.topic.length).toBeGreaterThan(0);
    }
  });

  it("会避开已用标题", () => {
    const used = QUESTION_BANK.slice(0, 20).map((question) => question.title);
    const picked = pickQuestions(used, 5);
    const usedSet = new Set(used.map(normalizeTitle));
    expect(picked).toHaveLength(5);
    for (const question of picked) {
      expect(usedSet.has(normalizeTitle(question.title))).toBe(false);
    }
  });

  it("题库将近用尽时会避开最近 100 条再循环", () => {
    const allTitles = QUESTION_BANK.map((question) => question.title);
    const picked = pickQuestions(allTitles, 3);
    const recent = new Set(allTitles.slice(-100).map(normalizeTitle));
    expect(picked).toHaveLength(3);
    for (const question of picked) {
      expect(recent.has(normalizeTitle(question.title))).toBe(false);
    }
  });
});
