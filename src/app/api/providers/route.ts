import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createProviderInstance } from "@/lib/providers";
import { updateProviderSchema } from "@/lib/security";

export async function GET() {
  const providers = await db.listProviders();
  return NextResponse.json({ providers });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    const { id: _unused, ...rest } = body;
    void _unused;
    const parsed = updateProviderSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Invalid provider configuration",
        },
        { status: 400 }
      );
    }

    const updated = await db.updateProvider(id, parsed.data);
    if (!updated) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ provider: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update provider" },
      { status: 500 }
    );
  }
}

// POST /api/providers -> Test connection to a provider server-side
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: string;
      base_url?: string;
    };

    if (!body.id) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    const providerRecord = await db.getProviderById(body.id);
    if (!providerRecord) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    const recordToTest = body.base_url
      ? { ...providerRecord, base_url: body.base_url }
      : providerRecord;

    const adapter = createProviderInstance(recordToTest, 8000);
    const result = await adapter.testConnection();

    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Failed to test provider connection" },
      { status: 500 }
    );
  }
}
