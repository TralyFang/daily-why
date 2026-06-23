import { NextResponse } from "next/server";
import { getContentForDate, getAvailableDates } from "@/lib/content";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    const availableDates = getAvailableDates();
    return NextResponse.json({
      availableDates,
      today: availableDates[0] || null,
    });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
  }

  // Check if date is within the 3-day window
  const availableDates = getAvailableDates();
  if (!availableDates.includes(date)) {
    return NextResponse.json(
      {
        error: "该日期的内容不在可查看范围内",
        availableDates,
      },
      { status: 404 }
    );
  }

  const content = getContentForDate(date);
  if (!content) {
    return NextResponse.json(
      { error: "该日期暂无内容", date },
      { status: 404 }
    );
  }

  return NextResponse.json({ date, content });
}
