import { QUESTION_BANK, type BankQuestion } from "./questionBankData";

export type { BankQuestion };

const RECENT_EXCLUDE_WINDOW = 100;

export function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, "")
    .replace(/[“”"‘’'`]/g, "")
    .replace(/[?？]/g, "？")
    .trim();
}

export function getQuestionBank(): BankQuestion[] {
  return QUESTION_BANK;
}

function uniqueByTitle(questions: BankQuestion[]): BankQuestion[] {
  const seen = new Set<string>();
  const unique: BankQuestion[] = [];
  for (const question of questions) {
    const key = normalizeTitle(question.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(question);
  }
  return unique;
}

function pickRandom<T>(items: T[], count: number): T[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Pick unused questions from the bank.
 * When the bank is exhausted, recycle older titles but still avoid the most recent 100.
 */
export function pickQuestions(
  usedTitles: string[],
  count: number,
  extraExclude: string[] = []
): BankQuestion[] {
  if (count <= 0) return [];

  const bank = uniqueByTitle(QUESTION_BANK);
  const excluded = new Set(
    [...usedTitles, ...extraExclude].map(normalizeTitle).filter(Boolean)
  );

  const unused = bank.filter((question) => !excluded.has(normalizeTitle(question.title)));
  if (unused.length >= count) {
    return pickRandom(unused, count);
  }

  const recent = usedTitles.slice(-RECENT_EXCLUDE_WINDOW).map(normalizeTitle);
  const recentSet = new Set(recent);
  const recyclable = bank.filter((question) => !recentSet.has(normalizeTitle(question.title)));
  const pool = recyclable.length >= count ? recyclable : bank;

  const picked: BankQuestion[] = [...unused];
  const pickedKeys = new Set(picked.map((question) => normalizeTitle(question.title)));
  const remaining = pickRandom(
    pool.filter((question) => !pickedKeys.has(normalizeTitle(question.title))),
    count - picked.length
  );

  return [...picked, ...remaining].slice(0, count);
}
