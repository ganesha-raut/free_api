import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") || "100");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, limitParam), 500)
    : 100;

  const [summary, logs] = await Promise.all([
    db.getDashboardSummary(),
    db.listUsageLogs(limit),
  ]);

  return NextResponse.json({
    summary,
    logs,
    storage_engine: db.getStorageEngine(),
  });
}
