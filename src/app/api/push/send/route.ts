import { NextResponse } from "next/server";
import webpush from "web-push";

const VAPID_SUBJECT = "mailto:1033147540@qq.com";

interface SubRecord {
  subscription: PushSubscriptionJSON;
  hour: number;
  minute: number;
  deviceId: string;
  createdAt: string;
  lastVisitedDate: string;
}

async function getKV() {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env.CONTENT_KV;
}

// GET for manual testing / cron trigger via HTTP
// POST for programmatic calls
export async function GET() {
  return handleCron();
}

export async function POST() {
  return handleCron();
}

async function handleCron() {
  const results: { sent: string[]; skipped: string[]; cleaned: string[]; errors: string[] } = {
    sent: [],
    skipped: [],
    cleaned: [],
    errors: [],
  };

  try {
    // Get Beijing time
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStr = `${beijingTime.getUTCFullYear()}-${String(beijingTime.getUTCMonth() + 1).padStart(2, "0")}-${String(beijingTime.getUTCDate()).padStart(2, "0")}`;
    const currentHour = beijingTime.getUTCHours();
    const currentMinute = beijingTime.getUTCMinutes();

    // Check if already sent today
    try {
      const kv = await getKV();
      const alreadySent = await kv.get(`push:sent:${todayStr}`);
      if (alreadySent) {
        return NextResponse.json({
          status: "already-sent",
          message: `今天 (${todayStr}) 已推送过`,
          results,
        });
      }
    } catch {
      // KV not available (local dev) — bail out
      return NextResponse.json({
        status: "kv-unavailable",
        message: "KV 不可用，跳过推送",
        results,
      });
    }

    // Setup web-push
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPrivateKey) {
      return NextResponse.json({ error: "VAPID_PRIVATE_KEY 未配置" }, { status: 500 });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY || "", vapidPrivateKey);

    const kv = await getKV();

    // Scan all subscriptions
    const subKeys = await kv.list({ prefix: "push:sub:" });
    const subscriptions: SubRecord[] = [];

    for (const key of subKeys.keys) {
      const raw = await kv.get(key.name, { type: "json" });
      if (raw && typeof raw === "object") {
        subscriptions.push(raw as unknown as SubRecord);
      }
    }

    let anySent = false;

    for (const sub of subscriptions) {
      // Check time match (allow 15-minute window)
      const timeMatch = sub.hour === currentHour &&
        Math.abs(sub.minute - currentMinute) <= 15;

      if (!timeMatch) {
        results.skipped.push(`time-mismatch:${sub.deviceId} (${sub.hour}:${pad(sub.minute)})`);
        continue;
      }

      // Check if user visited today — skip if they already came
      if (sub.lastVisitedDate === todayStr) {
        results.skipped.push(`already-visited:${sub.deviceId}`);
        continue;
      }

      // Check if user hasn't visited in 30+ days (zombie sub)
      const lastVisited = sub.lastVisitedDate ? new Date(sub.lastVisitedDate + "T00:00:00+08:00") : null;
      const daysSinceVisit = lastVisited
        ? Math.floor((beijingTime.getTime() - lastVisited.getTime()) / 86400000)
        : 999;

      if (daysSinceVisit > 30) {
        // Clean up zombie subscription
        await kv.delete(`push:sub:${sub.deviceId}`);
        results.cleaned.push(`zombie:${sub.deviceId} (${daysSinceVisit} days)`);
        continue;
      }

      // Send push
      try {
        const pushSubscription = sub.subscription as unknown as webpush.PushSubscription;
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: "每日一个为什么",
            body: "今天的新问题已更新，来看看吧！",
            url: "/",
          })
        );
        results.sent.push(sub.deviceId);
        anySent = true;
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription expired — clean up
          await kv.delete(`push:sub:${sub.deviceId}`);
          results.cleaned.push(`expired:${sub.deviceId} (${error.statusCode})`);
        } else {
          results.errors.push(`${sub.deviceId}: ${String(err)}`);
        }
      }
    }

    // Mark today as sent only if we actually sent something
    if (anySent) {
      await kv.put(`push:sent:${todayStr}`, "1", { expirationTtl: 86400 });
    }

    return NextResponse.json({
      status: anySent ? "sent" : "no-match",
      message: anySent
        ? `已向 ${results.sent.length} 个设备发送推送`
        : "当前时间没有匹配的提醒",
      todayStr,
      time: `${currentHour}:${pad(currentMinute)}`,
      results,
    });
  } catch (err) {
    console.error("[push/send] Cron error:", err);
    return NextResponse.json(
      { error: "服务器错误", detail: String(err), results },
      { status: 500 }
    );
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
