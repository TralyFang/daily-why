import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getToday } from "@/lib/dates";
import { isGenerationFailureContent } from "@/lib/contentFailure";
import {
  appendTopicsHistory,
  buildGenerationTargets,
  collectSameDayTitles,
  generateArticleForQuestion,
  getTopicsHistory,
  parseGenerationSlot,
  pickSlotQuestion,
  shouldSkipExisting,
} from "@/lib/contentGenerate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRegenerate = searchParams.get("force") === "1";
  const dateParam = searchParams.get("date"); // 支持指定日期，如 ?date=2026-06-28
  const slotParam = searchParams.get("slot");
  const generateAll = searchParams.get("all") === "1";

  try {
    const ctx = await getCloudflareContext({ async: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = ctx.env as any;
    const kv = env.CONTENT_KV;
    const ai = env.AI;

    if (!ai) {
      return NextResponse.json(
        { error: "AI binding 未配置，请在 wrangler.jsonc 中添加 [ai] binding" },
        { status: 500 }
      );
    }

    // 支持指定日期，默认今天
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getToday();
    const requestedSlot = parseGenerationSlot(slotParam);
    if (slotParam && !requestedSlot) {
      return NextResponse.json(
        { error: "slot 参数不正确" },
        { status: 400 }
      );
    }

    // 默认只生成主内容；当天如需 4 篇加 ?all=1
    const targets = buildGenerationTargets(today, requestedSlot, generateAll);
    const firstExisting = await kv.get(targets[0].key, { type: "text" });
    if (targets.length === 1 && shouldSkipExisting(firstExisting, forceRegenerate)) {
      return NextResponse.json({
        status: "skipped",
        message: `${targets[0].key} 已有内容，跳过生成。加 ?force=1 可强制重新生成`,
        today,
      });
    }

    const historyTitles = await getTopicsHistory(kv);
    const sameDayTitles = await collectSameDayTitles(kv, today);
    const newTitles: string[] = [];
    const results: { key: string; content: string; status: string; topic?: string; model?: string }[] = [];

    for (const target of targets) {
      const existing = target.key === targets[0].key
        ? firstExisting
        : await kv.get(target.key, { type: "text" });

      if (shouldSkipExisting(existing, forceRegenerate)) {
        results.push({ key: target.key, content: existing, status: "skipped" });
        continue;
      }

      const question = pickSlotQuestion(historyTitles, [...sameDayTitles, ...newTitles]);
      if (!question) {
        results.push({ key: target.key, content: "", status: "failed (题库为空)" });
        continue;
      }

      const generated = await generateArticleForQuestion(ai, question);
      if ("error" in generated) {
        if (existing && isGenerationFailureContent(existing)) {
          await kv.delete(target.key);
        }
        results.push({ key: target.key, content: "", status: `failed (${generated.error})` });
        continue;
      }

      await kv.put(target.key, generated.content, { expirationTtl: target.ttl });
      newTitles.push(question.title);
      results.push({
        key: target.key,
        content: generated.content,
        status: "ok",
        topic: question.topic,
        model: generated.model,
      });
    }

    if (newTitles.length > 0) {
      await appendTopicsHistory(kv, newTitles);
    }

    const wroteAny = results.some((result) => result.status === "ok");
    const skippedAny = results.some((result) => result.status === "skipped");
    if (!wroteAny && !skippedAny) {
      return NextResponse.json(
        {
          status: "error",
          error: "生成失败，未写入内容",
          today,
          results: results.map((result) => ({
            key: result.key,
            status: result.status,
            length: 0,
            preview: "",
          })),
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: "ok",
      today,
      topics: results.map((result) => result.topic).filter(Boolean),
      results: results.map((result) => ({
        key: result.key,
        status: result.status,
        length: result.content.length,
        preview: result.content.substring(0, 80),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `生成失败: ${String(err)}` },
      { status: 500 }
    );
  }
}
