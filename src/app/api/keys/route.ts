import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNewApiKey, toPublicApiKey } from "@/lib/auth";
import { createKeySchema } from "@/lib/security";

export async function GET() {
  const records = await db.listApiKeys();
  const keys = records.map(toPublicApiKey);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid API key name",
        },
        { status: 400 }
      );
    }

    const { rawKey, apiKey } = await createNewApiKey(parsed.data.name);

    return NextResponse.json(
      {
        key: apiKey,
        raw_key: rawKey,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; action?: string };
    if (!body.id) {
      return NextResponse.json(
        { error: "API key ID is required" },
        { status: 400 }
      );
    }

    const updated = await db.revokeApiKey(body.id);
    if (!updated) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ key: toPublicApiKey(updated) });
  } catch {
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "API key ID is required" },
      { status: 400 }
    );
  }

  const deleted = await db.deleteApiKey(id);
  if (!deleted) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
