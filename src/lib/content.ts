import fs from "fs";
import path from "path";
import { getValidDates } from "./dates";

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Get markdown content for a specific date
 */
export function getContentForDate(date: string): string | null {
  const filePath = path.join(DATA_DIR, `${date}.md`);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Get all dates that have content AND are within the 3-day viewable window.
 * Returns dates sorted newest first.
 */
export function getAvailableDates(): string[] {
  const validDates = getValidDates();
  return validDates.filter((date) => {
    const filePath = path.join(DATA_DIR, `${date}.md`);
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });
}
