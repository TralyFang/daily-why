import { getValidDates } from "./dates";
import fs from "fs";
import path from "path";

/**
 * Check if we're running on Cloudflare Workers (production)
 * or on Node.js (local dev)
 */
function isCloudflareEnvironment(): boolean {
  try {
    // In Cloudflare Workers, process.env is not a standard Node.js object
    // and globalThis has different properties
    return typeof process === "undefined" || 
      (typeof globalThis !== "undefined" && 
       // Check if running in a worker context
       !process.env?.NEXT_RUNTIME);
  } catch {
    return true;
  }
}

/**
 * Get markdown content for a specific date
 * - On Cloudflare: reads from KV
 * - On local dev: reads from data/ directory files
 */
export async function getContentForDate(date: string): Promise<string | null> {
  // Try Cloudflare KV first
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const content = await ctx.env.CONTENT_KV.get(date, { type: "text" });
    if (content) return content;
  } catch {
    // KV not available (local dev), fall through to file reading
  }

  // Fallback: read from data/ directory (local dev)
  try {
    const filePath = path.join(process.cwd(), "data", `${date}.md`);
    const content = fs.readFileSync(filePath, "utf-8");
    return content;
  } catch {
    return null;
  }
}

/**
 * Get all dates that have content AND are within the viewable window.
 * Returns dates sorted newest first.
 */
export async function getAvailableDates(): Promise<string[]> {
  const validDates = getValidDates();
  const availableDates: string[] = [];

  for (const date of validDates) {
    const content = await getContentForDate(date);
    if (content) availableDates.push(date);
  }

  return availableDates;
}

/**
 * Get extra content for a specific date slot (e.g., "2026-06-23-extra-1")
 * - On Cloudflare: reads from KV directly
 * - On local dev: reads from data/ directory with modified filename
 */
export async function getExtraContentForDate(extraKey: string): Promise<string | null> {
  // Try Cloudflare KV first
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const content = await ctx.env.CONTENT_KV.get(extraKey, { type: "text" });
    if (content) return content;
  } catch {
    // KV not available (local dev), fall through to file reading
  }

  // Fallback: read from data/ directory (local dev)
  // Convert "2026-06-23-extra-1" to filename "2026-06-23-extra-1.md"
  try {
    const filePath = path.join(process.cwd(), "data", `${extraKey}.md`);
    const content = fs.readFileSync(filePath, "utf-8");
    return content;
  } catch {
    return null;
  }
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
