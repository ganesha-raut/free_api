import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "private-ai-api-gateway",
    storage: db.getStorageEngine(),
    timestamp: new Date().toISOString(),
  });
}
