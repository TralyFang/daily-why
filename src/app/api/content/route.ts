import { NextResponse } from "next/server";
import { getContentForDate, getAvailableDates, getExtraContentForDate } from "@/lib/content";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const type = searchParams.get("type");

  // If type=extras, return which extra slots have content for today
  if (type === "extras") {
    const todayDate = searchParams.get("today") || date;
    if (!todayDate || !/^\d{4}-\d{2}-\d{2}$/.test(todayDate)) {
      return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
    }
    const availableSlots: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const key = `${todayDate}-extra-${i}`;
      const content = await getContentForDate(key);
      if (content) availableSlots.push(i);
    }
    return NextResponse.json({ date: todayDate, availableSlots });
  }

  // No date param → return available dates list
  if (!date) {
    const availableDates = await getAvailableDates();
    return NextResponse.json({
      availableDates,
      today: availableDates[0] || null,
    });
  }

  // Validate date format: YYYY-MM-DD or YYYY-MM-DD-extra-N
  const isExtraKey = /^\d{4}-\d{2}-\d{2}-extra-[1-3]$/.test(date);
  const isNormalDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  if (!isNormalDate && !isExtraKey) {
    return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
  }

  // For extra keys, just try to fetch content directly (skip availableDates check)
  if (isExtraKey) {
    const content = await getExtraContentForDate(date);
    if (!content) {
      return NextResponse.json(
        { error: "暂无更多内容", date },
        { status: 404 }
      );
    }
    return NextResponse.json({ date, content });
  }

  // For normal dates, validate it's in the viewable window
  const availableDates = await getAvailableDates();
  if (!availableDates.includes(date)) {
    return NextResponse.json(
      { error: "该日期的内容不在可查看范围内", availableDates },
      { status: 404 }
    );
  }

  const content = await getContentForDate(date);
  if (!content) {
    return NextResponse.json(
      { error: "该日期暂无内容", date },
      { status: 404 }
    );
  }

  return NextResponse.json({ date, content });
}
