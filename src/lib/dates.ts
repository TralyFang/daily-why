/**
 * Date utility functions for the daily-why app
 * 
 * The viewable window is: today + 7 days back (8 dates total)
 * KV TTL is also 7 days, so data auto-deletes after that
 */

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getToday(): string {
  return formatDate(new Date());
}

/**
 * Get dates within the 7-day viewable window
 * Returns [today, yesterday, ..., 7daysAgo] sorted newest first
 */
export function getValidDates(): string[] {
  const today = new Date();
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
 * Get a human-readable label for a date
 * e.g., "今天", "昨天", "前天", "3天前", ..., "7天前"
 */
export function getDateLabel(dateStr: string): string {
  const today = getToday();
  const date = new Date(dateStr + "T00:00:00");
  const todayDate = new Date(today + "T00:00:00");

  const diffDays = Math.round(
    (todayDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  const dayLabels: Record<number, string> = {
    0: "今天",
    1: "昨天",
    2: "前天",
    3: "3天前",
    4: "4天前",
    5: "5天前",
    6: "6天前",
    7: "7天前",
  };

  return dayLabels[diffDays] ?? `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * Get the weekday name for a date
 */
export function getWeekday(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return weekdays[date.getDay()];
}
