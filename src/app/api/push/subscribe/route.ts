import { NextResponse } from "next/server";

interface SubscribeBody {
  subscription: PushSubscriptionJSON;
  deviceId: string;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    language: string;
    screenWidth: number;
    screenHeight: number;
    standalone: boolean;
  };
}

async function getKV() {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env.CONTENT_KV;
}

export async function POST(request: Request) {
  try {
    const body: SubscribeBody = await request.json();

    if (!body.subscription?.endpoint || !body.deviceId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // Extract geo/network info from Cloudflare headers
    const country = request.headers.get("CF-IPCountry") || "unknown";
    const city = request.headers.get("CF-IPCity") || "unknown";
    const region = request.headers.get("CF-Region") || "unknown";
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const timezone = request.headers.get("CF-Timezone") || "unknown";

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Parse user agent into readable device description
    const ua = body.deviceInfo?.userAgent || request.headers.get("User-Agent") || "";
    const deviceLabel = parseDeviceLabel(ua);

    const record = {
      subscription: body.subscription,
      deviceId: body.deviceId,
      createdAt: todayStr,
      lastVisitedDate: todayStr,
      // Device info
      device: {
        label: deviceLabel,
        platform: body.deviceInfo?.platform || "unknown",
        language: body.deviceInfo?.language || "unknown",
        screen: body.deviceInfo
          ? `${body.deviceInfo.screenWidth}x${body.deviceInfo.screenHeight}`
          : "unknown",
        standalone: body.deviceInfo?.standalone ?? false,
        userAgent: ua.substring(0, 200), // Truncate to save space
      },
      // Geo info (from Cloudflare edge)
      geo: {
        country,
        city: decodeURIComponent(city),
        region: decodeURIComponent(region),
        timezone,
        ip,
      },
    };

    try {
      const kv = await getKV();

      // Check if existing record — preserve createdAt
      const existing = await kv.get(`push:sub:${body.deviceId}`, { type: "json" }) as Record<string, unknown> | null;
      if (existing?.createdAt) {
        record.createdAt = existing.createdAt as string;
      }

      // --- Endpoint deduplication ---
      // Remove any OTHER deviceId records that share the same endpoint
      // This happens when a user reinstalls PWA (new deviceId, same push subscription)
      const endpoint = body.subscription.endpoint;
      const listResult = await kv.list({ prefix: "push:sub:" });
      const deletePromises: Promise<void>[] = [];
      for (const key of listResult.keys) {
        if (key.name === `push:sub:${body.deviceId}`) continue;
        // Use metadata or fetch the record to check endpoint
        const oldRaw = await kv.get(key.name, { type: "json" }) as Record<string, unknown> | null;
        if (oldRaw) {
          const oldSub = oldRaw.subscription as Record<string, unknown> | undefined;
          if (oldSub?.endpoint === endpoint) {
            deletePromises.push(kv.delete(key.name));
          }
        }
      }
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`[push/subscribe] Deduplicated: removed ${deletePromises.length} old record(s) with same endpoint`);
      }

      await kv.put(`push:sub:${body.deviceId}`, JSON.stringify(record));
      return NextResponse.json({ success: true, deduplicated: deletePromises.length });
    } catch {
      console.log("[push/subscribe] KV not available, subscription saved locally only");
      return NextResponse.json({ success: true, warning: "kv-unavailable" });
    }
  } catch (err) {
    console.error("[push/subscribe] Error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/** Parse User-Agent into a human-readable device label */
function parseDeviceLabel(ua: string): string {
  if (!ua) return "未知设备";

  // iOS devices
  if (/iPhone/.test(ua)) {
    const match = ua.match(/iPhone OS (\d+_\d+)/);
    const ver = match ? match[1].replace("_", ".") : "";
    return `iPhone (iOS ${ver})`;
  }
  if (/iPad/.test(ua)) {
    const match = ua.match(/OS (\d+_\d+)/);
    const ver = match ? match[1].replace("_", ".") : "";
    return `iPad (iPadOS ${ver})`;
  }

  // Android
  if (/Android/.test(ua)) {
    const verMatch = ua.match(/Android ([\d.]+)/);
    const ver = verMatch ? verMatch[1] : "";
    // Try to extract device model
    const modelMatch = ua.match(/;\s*([^;)]+)\s*Build/);
    const model = modelMatch ? modelMatch[1].trim() : "Android";
    return `${model} (Android ${ver})`;
  }

  // macOS
  if (/Macintosh/.test(ua)) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    const ver = match ? match[1].replace(/_/g, ".") : "";
    return `Mac (macOS ${ver})`;
  }

  // Windows
  if (/Windows/.test(ua)) {
    const match = ua.match(/Windows NT ([\d.]+)/);
    const ver = match ? match[1] : "";
    return `Windows (NT ${ver})`;
  }

  // Linux
  if (/Linux/.test(ua)) {
    return "Linux";
  }

  return "未知设备";
}
