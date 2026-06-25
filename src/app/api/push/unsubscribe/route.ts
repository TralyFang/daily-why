import { NextResponse } from "next/server";

async function getKV() {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env.CONTENT_KV;
}

export async function POST(request: Request) {
  try {
    const { deviceId } = await request.json();
    if (!deviceId) {
      return NextResponse.json({ error: "缺少 deviceId" }, { status: 400 });
    }

    try {
      const kv = await getKV();
      await kv.delete(`push:sub:${deviceId}`);
    } catch {
      console.log("[push/unsubscribe] KV not available, skipping delete");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/unsubscribe] Error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
