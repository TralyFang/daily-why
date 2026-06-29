import { getValidDates, getToday } from "./dates";
import fs from "fs";
import path from "path";

/**
 * Detect if we are in local development mode (next dev).
 * In local dev, we prefer sample data files over KV.
 */
function isLocalDev(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Check if KV is available (Cloudflare runtime).
 * Returns KV binding or null.
 */
async function getKV() {
  // In local dev, skip KV entirely — use sample files
  if (isLocalDev()) return null;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    return ctx.env.CONTENT_KV;
  } catch {
    return null;
  }
}

/**
 * Calculate how many days ago a date is relative to today.
 * Returns 0 for today, 1 for yesterday, etc.
 */
function daysAgo(dateStr: string): number {
  const today = getToday();
  const [ty, tm, td] = today.split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const dateMs = Date.UTC(dy, dm - 1, dd);
  return Math.round((todayMs - dateMs) / (1000 * 60 * 60 * 24));
}

/**
 * Read a sample file from data/ directory for local dev.
 * Maps date to sample-{N}.md where N = days ago (0-6).
 * Also supports extra keys like "2026-06-29-extra-1" → sample-0-extra-1.md
 */
function readLocalSample(key: string): string | null {
  try {
    // Check if it's an extra key (e.g., "2026-06-29-extra-1")
    const extraMatch = key.match(/^(\d{4}-\d{2}-\d{2})-extra-(\d+)$/);
    if (extraMatch) {
      const dayOffset = daysAgo(extraMatch[1]);
      if (dayOffset < 0 || dayOffset > 7) return null;
      const filePath = path.join(process.cwd(), "data", `sample-${dayOffset}-extra-${extraMatch[2]}.md`);
      return fs.readFileSync(filePath, "utf-8");
    }

    // Regular date key
    const dayOffset = daysAgo(key);
    if (dayOffset < 0 || dayOffset > 7) return null;
    const filePath = path.join(process.cwd(), "data", `sample-${dayOffset}.md`);
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Get markdown content for a specific date.
 * - On Cloudflare (preview/production): reads from KV directly
 * - On local next dev: reads from data/ sample files (always valid)
 */
export async function getContentForDate(date: string): Promise<string | null> {
  const kv = await getKV();
  if (kv) {
    const content = await kv.get(date, { type: "text" });
    return content || null;
  }

  // Local dev: read sample data
  return readLocalSample(date);
}

/**
 * Get all dates that have content AND are within the viewable window.
 * Returns dates sorted newest first.
 */
export async function getAvailableDates(): Promise<string[]> {
  const kv = await getKV();
  const validDates = getValidDates();

  if (!kv) {
    // Local dev: return all valid dates that have a corresponding sample file
    return validDates.filter(date => readLocalSample(date) !== null);
  }

  const availableDates: string[] = [];
  for (const date of validDates) {
    const content = await kv.get(date, { type: "text" });
    if (content) availableDates.push(date);
  }

  return availableDates;
}

/**
 * Get extra content for a specific date slot (e.g., "2026-06-23-extra-1")
 * - On Cloudflare: reads from KV
 * - On local dev: reads from sample files
 */
export async function getExtraContentForDate(extraKey: string): Promise<string | null> {
  const kv = await getKV();
  if (kv) {
    const content = await kv.get(extraKey, { type: "text" });
    return content || null;
  }

  // Local dev: read sample extra data
  return readLocalSample(extraKey);
}

/**
 * Write content to KV for a given date, with 7-day TTL
 * Only works on Cloudflare (production)
 */
export async function writeContentForDate(
  date: string,
  content: string,
  ttlSeconds: number = 7 * 24 * 60 * 60
): Promise<void> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  await ctx.env.CONTENT_KV.put(date, content, { expirationTtl: ttlSeconds });
}
