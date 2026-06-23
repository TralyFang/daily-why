import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getValidDates } from "./dates";

/**
 * Get markdown content for a specific date from Cloudflare KV
 */
export async function getContentForDate(date: string): Promise<string | null> {
  const ctx = await getCloudflareContext({ async: true });
  const content = await ctx.env.CONTENT_KV.get(date, { type: "text" });
  return content ?? null;
}

/**
 * Get all dates that have content AND are within the viewable window.
 * Returns dates sorted newest first.
 */
export async function getAvailableDates(): Promise<string[]> {
  const validDates = getValidDates();
  const ctx = await getCloudflareContext({ async: true });

  const results = await Promise.all(
    validDates.map(async (date) => {
      const value = await ctx.env.CONTENT_KV.get(date, { type: "text" });
      return value ? date : null;
    })
  );

  return results.filter((d): d is string => d !== null);
}

/**
 * Write content to KV for a given date, with 7-day TTL
 */
export async function writeContentForDate(
  date: string,
  content: string,
  ttlSeconds: number = 7 * 24 * 60 * 60
): Promise<void> {
  const ctx = await getCloudflareContext({ async: true });
  await ctx.env.CONTENT_KV.put(date, content, { expirationTtl: ttlSeconds });
}
