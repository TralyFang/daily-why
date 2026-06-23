/**
 * Date utility functions for the daily-why app
 * 
 * The viewable window is: today + 7 days back (8 dates total)
 * KV TTL is also 7 days, so data auto-deletes after that
 * 
 * IMPORTANT: All date calculations use local-time components only
 * (getFullYear/getMonth/getDate) to avoid timezone offset bugs.
 */

/**
 * Parse a YYYY-MM-DD string into a local-time Date (midnight local)
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date object to YYYY-MM-DD string (local time)
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD (local time)
 */
export function getToday(): string {
  return formatDate(new Date());
}

/**
 * Get dates within the 7-day viewable window
 * Returns [today, yesterday, ..., 7daysAgo] sorted newest first
 */
export function getValidDates(): string[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dates: string[] = [];

  for (let i = 0; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }

  return dates;
}

/**
 * Check if a date string is within the 7-day viewable window
 */
export function isDateViewable(dateStr: string): boolean {
  const validDates = getValidDates();
  return validDates.includes(dateStr);
}

/**
 * Calculate the number of days between two YYYY-MM-DD strings
 * Returns a positive integer if dateStr is before todayStr
 */
export function dayDiff(dateStr: string, todayStr: string): number {
  const date = parseLocalDate(dateStr);
  const today = parseLocalDate(todayStr);
  return Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get a human-readable label for a date
 * e.g., "今天", "昨天", "前天", "N天前"
 */
export function getDateLabel(dateStr: string): string {
  const diffDays = dayDiff(dateStr, getToday());

  const dayLabels: Record<number, string> = {
    0: "今天",
    1: "昨天",
    2: "前天",
  };

  if (diffDays in dayLabels) return dayLabels[diffDays];
  if (diffDays > 2 && diffDays <= 7) return `${diffDays}天前`;
  const d = parseLocalDate(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Get the weekday name for a date
 */
export function getWeekday(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return weekdays[date.getDay()];
}
