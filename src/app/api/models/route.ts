import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createModelSchema, updateModelSchema } from "@/lib/security";

export async function GET() {
  const models = await db.listModels(false);
  return NextResponse.json({ models });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createModelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid model configuration",
        },
        { status: 400 }
      );
    }

    const created = await db.createModel(parsed.data);
    return NextResponse.json({ model: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create model route",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json(
        { error: "Model ID is required" },
        { status: 400 }
      );
    }

    const { id: _unused, ...rest } = body;
    void _unused;
    const parsed = updateModelSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid model update fields",
        },
        { status: 400 }
      );
    }

    const updated = await db.updateModel(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json({ model: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to update model",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Model ID is required" },
      { status: 400 }
    );
  }

  const deleted = await db.deleteModel(id);
  if (!deleted) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
